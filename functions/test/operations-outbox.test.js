'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeFirestore } = require('./helpers/fake-firestore');
const { createSendGate } = require('../operations/send-gate');
const { createOutboxService, sweepPendingAttention } = require('../operations/outbox');
const { sha256 } = require('../operations/canonical');

function setup({ send, reconcile, maxAttempts = 3, taskUpsert, payloadFetch } = {}) {
  const db = new FakeFirestore(); let now = new Date('2026-01-01T00:00:00Z'); const tasks = [];
  const authorizationRepository = { get: async (tx, id) => { const snap = await tx.get(db.collection('send_authorizations').doc(id)); return snap.exists ? snap.data() : null; }, consume: async (tx, id, patch) => tx.update(db.collection('send_authorizations').doc(id), patch) };
  const service = createOutboxService({ db, clock: () => new Date(now), leaseMs: 1000, maxAttempts,
    adapter: { send: send || (async () => ({ externalMessageId: 'm1' })), reconcile: reconcile || (async () => ({ status: 'unknown' })) },
    authorizationRepository, payloadRepository: { fetch: payloadFetch || (async () => payloadEnvelope) },
    taskSink: { upsert: taskUpsert || (async (id, task) => { const index = tasks.findIndex(item => item.taskId === id); if (index >= 0) tasks[index] = task; else tasks.push(task); }) } });
  return { db, service, tasks, clock: () => new Date(now), taskSink: { upsert: taskUpsert || (async (id, task) => { const index = tasks.findIndex(item => item.taskId === id); if (index >= 0) tasks[index] = task; else tasks.push(task); }) }, advance: ms => { now = new Date(now.getTime() + ms); } };
}
const payloadEnvelope = Object.freeze({ ref: 'drafts/d1', body: 'Hello.', attachments: Object.freeze([]), artifactHashes: Object.freeze([]) });
const request = { operationId: 'op1', actionType: 'reply', leadId: 'l1', businessEventId: 'e1', conversationId: 'c1', recipients: ['client@example.com'], policyVersion: '1.0.0', policyManifestHash: 'f'.repeat(64), payloadRef: 'drafts/d1', expectedPayloadHash: sha256(payloadEnvelope), expectedBodyHash: sha256('Hello.'), expectedArtifactHashes: [] };
const context = { killSwitch: false, authority: 'green', leadId: 'l1', businessEventId: 'e1', conversationId: 'c1', verifiedRecipients: ['client@example.com'] };
async function gateFor(disposition = 'live') {
  const gate = createSendGate({ policySnapshot: Object.freeze({ version: '1.0.0', manifestHash: 'f'.repeat(64), actionAuthorities: Object.freeze({ reply: 'green' }) }), payloadRepository: { fetch: async () => payloadEnvelope } });
  return gate.evaluate(request, { ...context, mode: disposition });
}
function operation(gate, overrides = {}) { return { operationId: 'op1', idempotencyKey: gate.idempotencyKey, bodyHash: gate.bodyHash, bindingHash: gate.bindingHash, disposition: gate.disposition, payloadRef: gate.payloadRef, payloadHash: gate.payloadHash, payloadArtifactHashes: gate.payloadArtifactHashes, policyVersion: gate.policyVersion, policyManifestHash: gate.policyManifestHash, ...overrides }; }
async function authorize(env, gate, overrides = {}) { await env.db.collection('send_authorizations').doc('auth1').set({ bindingHash: gate.bindingHash, policyVersion: gate.policyVersion, policyManifestHash: gate.policyManifestHash, expiresAt: new Date('2026-01-02'), ...overrides }); }

test('outbox replay is intent-idempotent and strict input rejects private aliases', async () => {
  const { service } = setup(); const gate = await gateFor(); const op = operation(gate);
  assert.equal((await service.create(op)).replay, false);
  assert.equal((await service.create({ ...op, operationId: 'different-run' })).replay, true);
  await assert.rejects(service.create({ ...op, bindingHash: 'a'.repeat(64) }), /collision/);
  await assert.rejects(service.create({ ...op, rawBody: 'private' }), /unsupported outbox fields/);
  await assert.rejects(service.create({ ...op, payloadRef: 'x'.repeat(501) }), /bounded/);
});

test('shadow and draft validate to terminal non-deliverable states', async () => {
  let sends = 0;
  for (const disposition of ['shadow', 'draft']) {
    const { service } = setup({ send: async () => { sends++; return { externalMessageId: 'bad' }; } });
    const gate = await gateFor(disposition); const key = gate.idempotencyKey; const op = operation(gate);
    await service.create(op); const validated = await service.validate(key, gate);
    assert.equal(validated.state, disposition === 'shadow' ? 'shadow_complete' : 'draft_ready');
    assert.equal((await service.reserve(key, 'worker')).acquired, false);
    await assert.rejects(service.deliver(key, 'worker'), /live authorization/);
  }
  assert.equal(sends, 0);
});

test('gate result must exactly bind operation and live authorization is persisted transactionally', async () => {
  const env = setup(); const { service, db } = env; const gate = await gateFor(); const op = operation(gate); await service.create(op);
  await assert.rejects(service.validate(gate.idempotencyKey, { ...gate, bodyHash: 'tampered' }), /exactly bind/);
  await authorize(env, gate); await service.validate(gate.idempotencyKey, gate, 'auth1');
  assert.equal(db.store.get(`operations_outbox/${gate.idempotencyKey}`).liveAuthorizationId, 'auth1');
});

test('authorization repository rejects stale, revoked, mismatched, and consumed capabilities', async () => {
  for (const override of [{ revoked: true }, { consumedAt: new Date() }, { policyManifestHash: 'a'.repeat(64) }, { bindingHash: 'b'.repeat(64) }, { expiresAt: new Date('2025-01-01') }]) {
    const env = setup(); const gate = await gateFor(); await env.service.create(operation(gate)); await authorize(env, gate, override);
    await assert.rejects(env.service.validate(gate.idempotencyKey, gate, 'auth1'), /authorization is invalid/);
  }
});

test('live outbox reserves, honors lease, and sends once', async () => {
  let sends = 0; const env = setup({ send: async () => { sends++; return { externalMessageId: 'external-1' }; } }); const { service } = env; const gate = await gateFor();
  await service.create(operation(gate)); await authorize(env, gate); await service.validate(gate.idempotencyKey, gate, 'auth1');
  assert.equal((await service.reserve(gate.idempotencyKey, 'w1')).acquired, true);
  assert.equal((await service.reserve(gate.idempotencyKey, 'w2')).acquired, false);
  assert.deepEqual(await service.deliver(gate.idempotencyKey, 'w1'), { state: 'sent', externalMessageId: 'external-1' }); assert.equal(sends, 1);
});

test('payload is refetched and hash-verified immediately before adapter send', async () => {
  let sends = 0; const tampered = Object.freeze({ ref: 'drafts/d1', body: 'changed', attachments: Object.freeze([]), artifactHashes: Object.freeze([]) });
  const env = setup({ payloadFetch: async () => tampered, send: async () => { sends++; return { externalMessageId: 'bad' }; } }); const gate = await gateFor();
  await env.service.create(operation(gate)); await authorize(env, gate); await env.service.validate(gate.idempotencyKey, gate, 'auth1'); await env.service.reserve(gate.idempotencyKey, 'w1');
  await assert.rejects(env.service.deliver(gate.idempotencyKey, 'w1'), /payload verification failed/); assert.equal(sends, 0);
});

test('adapter sends the verified snapshot when backing content mutates after preflight', async () => {
  let backing = payloadEnvelope;
  let sentEnvelope;
  const env = setup({
    payloadFetch: async () => {
      const verified = backing;
      queueMicrotask(() => { backing = Object.freeze({ ...payloadEnvelope, body: 'INTERNAL ONLY\nTODO: secret' }); });
      return verified;
    },
    send: async (_operation, exactEnvelope) => {
      sentEnvelope = exactEnvelope;
      return { externalMessageId: 'verified-snapshot' };
    },
  });
  const gate = await gateFor();
  await env.service.create(operation(gate)); await authorize(env, gate);
  await env.service.validate(gate.idempotencyKey, gate, 'auth1'); await env.service.reserve(gate.idempotencyKey, 'w1');
  assert.equal((await env.service.deliver(gate.idempotencyKey, 'w1')).state, 'sent');
  assert.equal(sentEnvelope.body, 'Hello.');
  assert.equal(backing.body, 'INTERNAL ONLY\nTODO: secret');
});

test('safe request decoy cannot send unsafe fetched payload with hidden artifact', async () => {
  let sends = 0;
  const hidden = Object.freeze({ ref: 'drafts/d1', body: 'INTERNAL ONLY\nTODO: {{CLIENT_NAME}}', attachments: Object.freeze([]), artifactHashes: Object.freeze(['a'.repeat(64)]) });
  const decoyRequest = { ...request, body: 'Safe caller decoy', attachments: [], expectedPayloadHash: sha256(hidden), expectedBodyHash: sha256(hidden.body), expectedArtifactHashes: hidden.artifactHashes };
  const gateService = createSendGate({ policySnapshot: Object.freeze({ version: '1.0.0', manifestHash: 'f'.repeat(64), actionAuthorities: Object.freeze({ reply: 'green' }) }), payloadRepository: { fetch: async () => hidden } });
  const gate = await gateService.evaluate(decoyRequest, { ...context, mode: 'live' });
  assert.equal(gate.allowed, false);
  const env = setup({ send: async () => { sends++; return { externalMessageId: 'never' }; }, payloadFetch: async () => hidden });
  await env.service.create(operation({ ...gate, disposition: 'live' }));
  await assert.rejects(env.service.validate(gate.idempotencyKey, gate, 'auth1'), /did not allow/);
  assert.equal(sends, 0);
});

test('expired reserved lease can be recovered', async () => {
  const env = setup(); const { service, advance } = env; const gate = await gateFor(); await service.create(operation(gate)); await authorize(env, gate); await service.validate(gate.idempotencyKey, gate, 'auth1');
  await service.reserve(gate.idempotencyKey, 'w1'); advance(1001); assert.equal((await service.reserve(gate.idempotencyKey, 'w2')).acquired, true);
});

test('adapter error enters reconciliation hold and never retries blindly', async () => {
  const env = setup({ send: async () => { throw new Error('timeout'); } }); const { service } = env; const gate = await gateFor(); await service.create(operation(gate)); await authorize(env, gate); await service.validate(gate.idempotencyKey, gate, 'auth1'); await service.reserve(gate.idempotencyKey, 'w1');
  assert.deepEqual(await service.deliver(gate.idempotencyKey, 'w1'), { state: 'uncertain', reconciliationRequired: true }); assert.equal((await service.reserve(gate.idempotencyKey, 'w2')).reconciliationRequired, true);
});

test('dead-letter attention remains recoverably pending after task failure', async () => {
  let failTask = true; const recorded = []; const env = setup({ send: async () => { throw new Error('timeout'); }, reconcile: async () => ({ status: 'not_found' }), maxAttempts: 1, taskUpsert: async (id, task) => { if (failTask) throw new Error('task down'); recorded.push(task); } });
  const gate = await gateFor(); await env.service.create(operation(gate)); await authorize(env, gate); await env.service.validate(gate.idempotencyKey, gate, 'auth1'); await env.service.reserve(gate.idempotencyKey, 'w1'); await env.service.deliver(gate.idempotencyKey, 'w1');
  assert.equal((await env.service.reconcile(gate.idempotencyKey)).state, 'dead_letter');
  let stored = env.db.store.get(`operations_outbox/${gate.idempotencyKey}`); assert.equal(stored.attentionTaskPending, true); const taskId = stored.attentionTaskId;
  failTask = false; assert.equal((await env.service.surfacePendingAttention(gate.idempotencyKey)).pending, false); stored = env.db.store.get(`operations_outbox/${gate.idempotencyKey}`);
  assert.equal(stored.attentionTaskPending, false); assert.equal(recorded[0].taskId, taskId);
});

test('reconciliation can confirm an uncertain send', async () => {
  const env = setup({ send: async () => { throw new Error('timeout'); }, reconcile: async () => ({ status: 'sent', externalMessageId: 'found' }) }); const gate = await gateFor();
  await env.service.create(operation(gate)); await authorize(env, gate); await env.service.validate(gate.idempotencyKey, gate, 'auth1'); await env.service.reserve(gate.idempotencyKey, 'w1'); await env.service.deliver(gate.idempotencyKey, 'w1');
  assert.deepEqual(await env.service.reconcile(gate.idempotencyKey), { state: 'sent', externalMessageId: 'found' });
});

test('pending attention sweep is idempotent and survives clear failure', async () => {
  const tasks = new Map(); const env = setup({ send: async () => { throw new Error('timeout'); }, reconcile: async () => ({ status: 'not_found' }), maxAttempts: 1, taskUpsert: async (id, task) => tasks.set(id, task) });
  const gate = await gateFor(); await env.service.create(operation(gate)); await authorize(env, gate); await env.service.validate(gate.idempotencyKey, gate, 'auth1'); await env.service.reserve(gate.idempotencyKey, 'w'); await env.service.deliver(gate.idempotencyKey, 'w');
  // Prevent the immediate surfacer from clearing so the exported recovery sweep owns recovery.
  await env.service.reconcile(gate.idempotencyKey);
  env.db.store.get(`operations_outbox/${gate.idempotencyKey}`).attentionTaskPending = true;
  const original = env.db.runTransaction.bind(env.db); let failClear = true;
  env.db.runTransaction = async callback => { if (failClear) { failClear = false; throw new Error('clear failed'); } return original(callback); };
  assert.equal((await sweepPendingAttention({ db: env.db, taskSink: env.taskSink, clock: env.clock })).pending, 1);
  assert.equal((await sweepPendingAttention({ db: env.db, taskSink: env.taskSink, clock: env.clock })).pending, 0);
  assert.equal(tasks.size, 1);
  const stored = env.db.store.get(`operations_outbox/${gate.idempotencyKey}`); assert.equal(stored.attentionTaskPending, false);
  assert.ok(stored.attentionDueAt.getTime() - stored.deadLetterAt.getTime() <= 15 * 60_000);
});
