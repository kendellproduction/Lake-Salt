'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { FakeFirestore } = require('./helpers/fake-firestore');
const { canonicalize, sha256 } = require('../operations/canonical');
const { createPolicyReleaseLoader, PolicyIntegrityError, REQUIRED_FILES } = require('../operations/policy-release');
const { createOperationsEventWriter } = require('../operations/event-writer');
const { createSendGate } = require('../operations/send-gate');

test('policy loader verifies hashes and pins one immutable run snapshot', async () => {
  let active = '1.0.0';
  const content = 'authority: green\n';
  const repository = {
    getActiveRelease: async () => active,
    getManifest: async version => ({ version, files: Object.fromEntries(REQUIRED_FILES.map(name => [name, sha256(content)])) }),
    getFile: async () => content,
  };
  const loader = createPolicyReleaseLoader({ repository });
  const first = await loader.load();
  active = '2.0.0';
  assert.strictEqual(await loader.load(), first);
  assert.equal(first.version, '1.0.0');
  assert.ok(Object.isFrozen(first.files));
});

test('policy loader fails closed on a manifest mismatch', async () => {
  const loader = createPolicyReleaseLoader({ repository: {
    getActiveRelease: async () => '1.0.0',
    getManifest: async () => ({ version: '1.0.0', files: { 'pricing.yaml': '0'.repeat(64) } }),
    getFile: async () => 'tampered',
  } });
  await assert.rejects(loader.load(), PolicyIntegrityError);
});

test('policy loader rejects a hash-valid but incomplete release', async () => {
  const content = 'ok';
  const loader = createPolicyReleaseLoader({ repository: { getActiveRelease: async () => '1.0.0', getManifest: async () => ({ version: '1.0.0', files: { 'security.yaml': sha256(content) } }), getFile: async () => content } });
  await assert.rejects(loader.load(), /missing required files/);
});

test('on-disk proposed release passes integrity loading without activating it', async () => {
  const releaseDir = path.resolve(__dirname, '../../policy-releases/proposals/1.0.0');
  const repository = {
    getActiveRelease: async () => '1.0.0',
    getManifest: async () => JSON.parse(await fs.readFile(path.join(releaseDir, 'manifest.json'), 'utf8')),
    getFile: async (_version, name) => fs.readFile(path.join(releaseDir, name), 'utf8'),
  };
  const snapshot = await createPolicyReleaseLoader({ repository }).load();
  assert.equal(snapshot.version, '1.0.0');
  assert.equal(snapshot.manifest.status, 'proposed');
  assert.equal(snapshot.manifest.activation.active, false);
  assert.ok(snapshot.manifest.testEvidence);
});

test('canonical hashing distinguishes dates and Firestore timestamps', () => {
  const date = new Date('2026-01-01T00:00:00Z');
  assert.notEqual(sha256(date), sha256({}));
  assert.equal(canonicalize({ when: { toMillis: () => date.getTime() } }), '{"when":{"$timestampMillis":1767225600000}}');
  assert.notEqual(sha256({ seconds: 1, nanoseconds: 1, toMillis: () => 1000 }), sha256({ seconds: 1, nanoseconds: 2, toMillis: () => 1000 }));
  assert.throws(() => canonicalize({ unsafe: undefined }), /unsupported/);
  assert.throws(() => canonicalize(Number.NaN), /non-finite/);
});

test('event writer creates privacy-safe append-only events', async () => {
  const db = new FakeFirestore();
  let sequence = 0;
  const writer = createOperationsEventWriter({ db, idFactory: () => `evt_${++sequence}`, clock: () => new Date('2026-01-01') });
  const result = await writer.append({ actionType: 'reply', status: 'created', policyVersion: '1.0.0', bodyHash: sha256('hello'), metadata: { channel: 'gmail' } });
  assert.equal(result.eventId, 'evt_1');
  assert.equal(db.store.get('operations_events/evt_1').policyVersion, '1.0.0');
  await assert.rejects(writer.append({ eventId: 'evt_1', actionType: 'reply', status: 'created', policyVersion: '1.0.0' }), /append-only/);
  await assert.rejects(writer.append({ actionType: 'reply', status: 'created', policyVersion: '1.0.0', metadata: { accessToken: 'secret' } }), /privacy-safe/);
  await assert.rejects(writer.append({ actionType: 'reply', status: 'created', policyVersion: '1.0.0', body: 'raw' }), /unsupported/);
  await assert.rejects(writer.append({ actionType: 'reply', status: 'created', policyVersion: '1.0.0', metadata: { channel: { token: 'nested' } } }), /scalar/);
  await assert.rejects(writer.append({ actionType: 'x'.repeat(501), status: 'created', policyVersion: '1.0.0' }), /bounded/);
});

function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function envelope(overrides = {}) {
  const value = { ref: 'drafts/d1', body: 'Hello there.', attachments: [], artifactHashes: [], ...overrides };
  return freeze(value);
}
function safeRequest(overrides = {}, payload = envelope()) {
  return { operationId: 'op1', actionType: 'reply', leadId: 'l1', businessEventId: 'e1', conversationId: 'c1', recipients: ['Client@Example.com'], policyVersion: '1.0.0', policyManifestHash: 'f'.repeat(64), payloadRef: payload.ref, expectedPayloadHash: sha256(payload), expectedBodyHash: sha256(payload.body.trim()), expectedArtifactHashes: payload.artifactHashes.slice().sort(), ...overrides };
}
function safeContext(overrides = {}) {
  return { killSwitch: false, authority: 'green', leadId: 'l1', businessEventId: 'e1', conversationId: 'c1', verifiedRecipients: ['client@example.com'], ...overrides };
}
async function evaluateSendGate(request, runtime = {}) {
  const payload = runtime.payloadEnvelope || envelope();
  const service = createSendGate({
    policySnapshot: Object.freeze({ version: '1.0.0', manifestHash: 'f'.repeat(64), actionAuthorities: Object.freeze({ reply: runtime.authority || 'green' }), revoked: runtime.policyRevoked === true }),
    payloadRepository: { fetch: async () => payload },
    capacityVerifier: { verify: async claims => runtime.capacityVerification || { available: true, claimHash: sha256(claims) } },
    duplicateEvaluator: { evaluate: async () => runtime.duplicateEvaluation || { decision: 'client_replied' } },
  });
  return service.evaluate(request, runtime);
}

test('send gate defaults to shadow and produces stable hashes', async () => {
  const one = await evaluateSendGate(safeRequest(), safeContext());
  const two = await evaluateSendGate(safeRequest(), safeContext());
  assert.equal(one.allowed, true);
  assert.equal(one.disposition, 'shadow');
  assert.equal(one.idempotencyKey, two.idempotencyKey);
  assert.equal(one.bodyHash, sha256('Hello there.'));
});

test('duplicate intent key is independent of operation id', async () => {
  const one = await evaluateSendGate(safeRequest({ operationId: 'one' }), safeContext());
  const two = await evaluateSendGate(safeRequest({ operationId: 'two' }), safeContext());
  assert.equal(one.idempotencyKey, two.idempotencyKey);
  assert.equal(one.bindingHash, two.bindingHash);
});

test('send gate fails closed across kill switch, identity, recipient and marker checks', async () => {
  const payload = envelope({ body: 'TODO: {{CLIENT_NAME}}' });
  const result = await evaluateSendGate(safeRequest({}, payload), { ...safeContext({ killSwitch: undefined, businessEventId: 'wrong', verifiedRecipients: [] }), payloadEnvelope: payload });
  assert.equal(result.allowed, false);
  assert.deepEqual(new Set(result.holds.map(x => x.code)), new Set(['kill_switch', 'identity', 'recipient', 'content_internal_marker']));
});

test('historical agreement BUSINESS DRAFT banner is a permanent send regression', async () => {
  const payload = envelope({ body: 'BUSINESS DRAFT\nService Agreement\nClient: Alisa' });
  const result = await evaluateSendGate(safeRequest({}, payload), { ...safeContext(), payloadEnvelope: payload });
  assert.equal(result.allowed, false);
  assert.ok(result.holds.some(item => item.code === 'content_internal_marker'));
});

test('send gate requires yellow approval and permits live only as an authorization-pending disposition', async () => {
  assert.equal((await evaluateSendGate(safeRequest(), safeContext({ authority: 'yellow' }))).allowed, false);
  const result = await evaluateSendGate(safeRequest(), safeContext({ authority: 'yellow', yellowApproval: true, mode: 'live' }));
  assert.equal(result.allowed, true);
  assert.equal(result.disposition, 'live');
});

test('malformed money and attachment containers become holds, never exceptions', async () => {
  const malformed = envelope({ money: { total: 1 }, attachments: { filename: 'x' } });
  const result = await evaluateSendGate(safeRequest({}, malformed), { ...safeContext(), payloadEnvelope: malformed });
  assert.equal(result.allowed, false);
  assert.ok(result.holds.some(item => item.code === 'money_malformed'));
  assert.ok(result.holds.some(item => item.code === 'attachment_metadata'));
  const aliased = envelope({ money: [{ kind: 'total', amountMinor: 1, cardToken: 'x' }], attachments: [{ filename: 'x.pdf', accessToken: 'secret' }] });
  const aliases = await evaluateSendGate(safeRequest({}, aliased), { ...safeContext({ moneyRecord: { quoteId: 'q', leadId: 'l1', businessEventId: 'e1', policyVersion: '1.0.0', total: 1 } }), payloadEnvelope: aliased });
  assert.equal(aliases.allowed, false);
});

test('capacity and recent outbound require injected verifier evaluations', async () => {
  const claims = [{ date: '2026-09-01', claim: 'available' }];
  const payload = envelope({ body: 'We are available.', capacityClaims: claims });
  const untrusted = await evaluateSendGate(safeRequest({}, payload), { ...safeContext({ recentOutbound: true, capacityVerification: {}, duplicateEvaluation: {} }), payloadEnvelope: payload });
  assert.equal(untrusted.allowed, false);
  assert.ok(untrusted.holds.some(item => item.code === 'capacity_unverified'));
  assert.ok(untrusted.holds.some(item => item.code === 'duplicate_unverified'));
  const trusted = await evaluateSendGate(safeRequest({}, payload), { ...safeContext({ capacityVerification: { available: true, claimHash: sha256(claims) }, recentOutbound: true, duplicateEvaluation: { decision: 'client_replied' } }), payloadEnvelope: payload });
  assert.equal(trusted.allowed, true);
});

test('gate rejects stale or revoked policy and binds fetched payload hashes', async () => {
  const valid = await evaluateSendGate(safeRequest(), safeContext());
  assert.equal(valid.payloadHash, safeRequest().expectedPayloadHash);
  assert.deepEqual(valid.payloadArtifactHashes, []);
  assert.equal((await evaluateSendGate(safeRequest({ policyManifestHash: 'a'.repeat(64) }), safeContext())).allowed, false);
  assert.equal((await evaluateSendGate(safeRequest(), safeContext({ policyRevoked: true }))).allowed, false);
});

test('safe request decoys cannot conceal unsafe fetched content or hidden artifacts', async () => {
  const hidden = envelope({ body: 'INTERNAL ONLY\nTODO: {{CLIENT_NAME}}', artifactHashes: ['a'.repeat(64)] });
  const decoy = safeRequest({ body: 'Safe decoy', attachments: [] }, hidden);
  const result = await evaluateSendGate(decoy, { ...safeContext(), payloadEnvelope: hidden });
  assert.equal(result.allowed, false);
  assert.ok(result.holds.some(item => item.code === 'content_internal_marker'));
  assert.ok(result.holds.some(item => item.code === 'payload_unverified'));
});

test('send gate validates structured money and attachment metadata', async () => {
  const attachment = { filename: 'agreement.pdf', sha256: 'a'.repeat(64), size: 42, contentType: 'application/pdf', verified: true, identityVerified: true, scanStatus: 'clean' };
  const payload = envelope({ body: 'Your deposit is $100.00.', money: [{ kind: 'depositAmount', amountMinor: 10000 }], attachments: [attachment], artifactHashes: [attachment.sha256] });
  const request = safeRequest({}, payload);
  const record = { quoteId: 'q1', leadId: 'l1', businessEventId: 'e1', policyVersion: '1.0.0', depositAmount: 10000 };
  assert.equal((await evaluateSendGate(request, { ...safeContext({ moneyRecord: record }), payloadEnvelope: payload })).allowed, true);
  const wrongMoney = envelope({ ...payload, money: [{ kind: 'depositAmount', amountMinor: 9999 }] });
  assert.equal((await evaluateSendGate(safeRequest({}, wrongMoney), { ...safeContext({ moneyRecord: record }), payloadEnvelope: wrongMoney })).allowed, false);
  const wrongBody = envelope({ ...payload, body: 'Your deposit is $200.00.' });
  assert.equal((await evaluateSendGate(safeRequest({}, wrongBody), { ...safeContext({ moneyRecord: record }), payloadEnvelope: wrongBody })).allowed, false);
  const badAttachment = envelope({ ...payload, attachments: [{ filename: 'x.pdf' }] });
  assert.equal((await evaluateSendGate(safeRequest({}, badAttachment), { ...safeContext({ moneyRecord: record }), payloadEnvelope: badAttachment })).allowed, false);
});
