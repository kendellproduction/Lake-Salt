'use strict';

const { sha256 } = require('./canonical');
const TERMINAL = new Set(['sent', 'dead_letter', 'shadow_complete', 'draft_ready']);
const CREATE_FIELDS = new Set(['operationId', 'idempotencyKey', 'bodyHash', 'bindingHash', 'disposition', 'payloadRef', 'payloadHash', 'payloadArtifactHashes', 'policyVersion', 'policyManifestHash']);

function createOutboxService({ db, clock = () => new Date(), adapter, authorizationRepository, payloadRepository, leaseMs = 60_000, maxAttempts = 3, taskSink }) {
  if (!db || typeof db.runTransaction !== 'function') throw new TypeError('transactional db is required');
  if (!adapter || typeof adapter.send !== 'function' || typeof adapter.reconcile !== 'function') throw new TypeError('send and reconcile adapter is required');
  if (!authorizationRepository || typeof authorizationRepository.get !== 'function' || typeof authorizationRepository.consume !== 'function') throw new TypeError('authorization repository is required');
  if (!payloadRepository || typeof payloadRepository.fetch !== 'function') throw new TypeError('payloadRepository.fetch is required');
  const refs = key => ({ outbox: db.collection('operations_outbox').doc(key), reservation: db.collection('operations_idempotency').doc(key) });

  async function create(input) {
    validateCreateInput(input);
    const operation = Object.fromEntries(Object.entries(input).filter(([key]) => CREATE_FIELDS.has(key)));
    const ref = refs(operation.idempotencyKey).outbox;
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const prior = snap.data();
        if (prior.bindingHash !== operation.bindingHash || prior.bodyHash !== operation.bodyHash) throw new Error('idempotency key collision');
        return { replay: true, operation: prior };
      }
      const value = { ...operation, state: 'created', attemptCount: 0, createdAt: clock(), updatedAt: clock() };
      tx.create(ref, value); return { replay: false, operation: value };
    });
  }

  async function validate(key, gate, authorizationId) {
    if (!gate || gate.allowed !== true || gate.idempotencyKey !== key) throw new Error('send gate did not allow this operation');
    const ref = refs(key).outbox;
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) throw new Error('outbox operation not found');
      const value = snap.data(); if (value.state !== 'created') throw new Error(`invalid outbox transition from ${value.state}`);
      if (value.bodyHash !== gate.bodyHash || value.bindingHash !== gate.bindingHash || value.disposition !== gate.disposition) throw new Error('gate result does not exactly bind stored operation');
      let state;
      const patch = { gateHash: sha256(gate), validatedAt: clock(), updatedAt: clock() };
      if (gate.disposition === 'shadow') state = 'shadow_complete';
      else if (gate.disposition === 'draft') state = 'draft_ready';
      else if (gate.disposition === 'live') {
        if (typeof authorizationId !== 'string' || !authorizationId) throw new Error('live authorization reference is required');
        const capability = await authorizationRepository.get(tx, authorizationId);
        const now = clock();
        if (!capability || capability.revoked === true || capability.consumedAt || toDate(capability.expiresAt) <= now || capability.bindingHash !== value.bindingHash || capability.policyVersion !== value.policyVersion || capability.policyManifestHash !== value.policyManifestHash) throw new Error('live authorization is invalid, stale, revoked, consumed, or mismatched');
        await authorizationRepository.consume(tx, authorizationId, { consumedAt: now, operationId: value.operationId, bindingHash: value.bindingHash });
        state = 'validated'; patch.liveAuthorizationId = authorizationId; patch.authorizationBindingHash = capability.bindingHash;
      } else throw new Error('unsupported gate disposition');
      patch.state = state; tx.update(ref, patch); return { ...value, ...patch };
    });
  }

  async function reserve(key, workerId) {
    if (!workerId) throw new TypeError('workerId is required');
    const { outbox, reservation } = refs(key);
    return db.runTransaction(async tx => {
      const snap = await tx.get(outbox); if (!snap.exists) throw new Error('outbox operation not found');
      const value = snap.data(); if (TERMINAL.has(value.state)) return { acquired: false, operation: value };
      if (value.disposition !== 'live' || !value.liveAuthorizationId || value.authorizationBindingHash !== value.bindingHash) throw new Error('operation lacks stored live authorization');
      const now = clock(); const leaseEnd = toDate(value.leaseExpiresAt); const ownLease = value.leaseOwner === workerId && leaseEnd > now;
      if (value.state === 'sending' || value.state === 'uncertain') return { acquired: false, reconciliationRequired: true, operation: value };
      if (value.state === 'reserved' && leaseEnd > now && !ownLease) return { acquired: false, operation: value };
      if (!['validated', 'retrying', 'reserved'].includes(value.state)) return { acquired: false, operation: value };
      const reservationSnap = await tx.get(reservation); const existing = reservationSnap.exists ? reservationSnap.data() : null;
      if (existing && existing.bindingHash !== value.bindingHash) throw new Error('idempotency reservation collision');
      const patch = { state: 'reserved', leaseOwner: workerId, leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now };
      tx.set(reservation, { operationId: value.operationId, bindingHash: value.bindingHash, reservedAt: existing?.reservedAt || now }, { merge: true }); tx.update(outbox, patch);
      return { acquired: true, operation: { ...value, ...patch } };
    });
  }

  async function deliver(key, workerId) {
    const preflight = await refs(key).outbox.get();
    if (!preflight.exists) throw new Error('outbox operation not found');
    const before = preflight.data();
    const envelope = await payloadRepository.fetch(before.payloadRef);
    const envelopeArtifacts = envelope && Array.isArray(envelope.artifactHashes) ? envelope.artifactHashes.slice().sort() : null;
    if (!isDeepFrozen(envelope) || envelope.ref !== before.payloadRef || sha256(envelope) !== before.payloadHash || !envelopeArtifacts || JSON.stringify(envelopeArtifacts) !== JSON.stringify(before.payloadArtifactHashes)) throw new Error('immutable payload verification failed before send');
    const ref = refs(key).outbox;
    const claimed = await db.runTransaction(async tx => {
      const snap = await tx.get(ref); if (!snap.exists) throw new Error('outbox operation not found'); const value = snap.data();
      if (value.disposition !== 'live' || !value.liveAuthorizationId || value.authorizationBindingHash !== value.bindingHash || value.payloadRef !== before.payloadRef || value.payloadHash !== before.payloadHash) throw new Error('stored live authorization or payload binding required');
      if (value.state !== 'reserved' || value.leaseOwner !== workerId || toDate(value.leaseExpiresAt) <= clock()) throw new Error('valid lease required');
      const patch = { state: 'sending', attemptCount: value.attemptCount + 1, sendStartedAt: clock(), updatedAt: clock() }; tx.update(ref, patch); return { ...value, ...patch };
    });
    try {
      // Send only the exact verified snapshot. Channel adapters must never
      // resolve payloadRef again because its backing storage may be mutable.
      const result = await adapter.send(claimed, envelope); if (!result || !result.externalMessageId) throw new Error('adapter returned no external message id');
      await transition(key, ['sending'], { state: 'sent', externalMessageId: result.externalMessageId, sentAt: clock(), leaseOwner: null, leaseExpiresAt: null, updatedAt: clock() });
      return { state: 'sent', externalMessageId: result.externalMessageId };
    } catch (error) {
      await transition(key, ['sending'], { state: 'uncertain', errorClass: classify(error), reconciliationRequired: true, updatedAt: clock() }); return { state: 'uncertain', reconciliationRequired: true };
    }
  }

  async function reconcile(key) {
    const ref = refs(key).outbox; const snap = await ref.get(); if (!snap.exists) throw new Error('outbox operation not found'); const operation = snap.data();
    if (!['uncertain', 'sending'].includes(operation.state)) throw new Error('operation does not require reconciliation');
    const result = await adapter.reconcile(operation); if (!result || result.status === 'unknown') return { state: 'uncertain', reconciliationRequired: true };
    if (result.status === 'sent' && result.externalMessageId) { await transition(key, ['uncertain', 'sending'], { state: 'sent', externalMessageId: result.externalMessageId, sentAt: clock(), reconciliationRequired: false, updatedAt: clock() }); return { state: 'sent', externalMessageId: result.externalMessageId }; }
    if (result.status !== 'not_found') throw new Error('invalid reconciliation result'); return failOrRetry(key, operation, 'reconciled_not_found');
  }

  async function failOrRetry(key, operation, errorClass) {
    if (operation.attemptCount >= maxAttempts) {
      const attentionTaskId = `outbox_${sha256(`${key}:${operation.operationId}`).slice(0, 24)}`;
      const deadLetterAt = clock();
      await transition(key, ['uncertain', 'failed'], { state: 'dead_letter', errorClass, reconciliationRequired: false, attentionTaskId, attentionTaskPending: true, deadLetterAt, attentionDueAt: new Date(deadLetterAt.getTime() + 15 * 60_000), updatedAt: deadLetterAt });
      await surfacePendingAttention(key); return { state: 'dead_letter' };
    }
    await transition(key, ['uncertain', 'failed'], { state: 'retrying', errorClass, reconciliationRequired: false, leaseOwner: null, leaseExpiresAt: null, updatedAt: clock() }); return { state: 'retrying' };
  }

  async function surfacePendingAttention(key) {
    const ref = refs(key).outbox; const snap = await ref.get(); if (!snap.exists) throw new Error('outbox operation not found'); const value = snap.data();
    if (value.state !== 'dead_letter' || value.attentionTaskPending !== true) return { pending: false };
    if (!taskSink || typeof taskSink.upsert !== 'function') return { pending: true };
    return upsertAndClearAttention({ db, taskSink, clock, ref, key, value });
  }

  async function transition(key, allowed, patch) { const ref = refs(key).outbox; return db.runTransaction(async tx => { const snap = await tx.get(ref); if (!snap.exists) throw new Error('outbox operation not found'); const value = snap.data(); if (!allowed.includes(value.state)) throw new Error(`invalid outbox transition from ${value.state}`); tx.update(ref, patch); return { ...value, ...patch }; }); }
  return { create, deliver, reconcile, reserve, surfacePendingAttention, validate };
}

function validateCreateInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('operation is required');
  const unknown = Object.keys(value).filter(key => !CREATE_FIELDS.has(key)); if (unknown.length) throw new TypeError(`unsupported outbox fields: ${unknown.join(', ')}`);
  for (const key of ['operationId', 'idempotencyKey', 'bodyHash', 'bindingHash', 'payloadRef', 'payloadHash', 'policyVersion', 'policyManifestHash']) if (typeof value[key] !== 'string' || !value[key] || value[key].length > 500) throw new TypeError(`${key} is required and bounded`);
  for (const key of ['idempotencyKey', 'bodyHash', 'bindingHash']) if (!/^[a-f0-9]{64}$/i.test(value[key])) throw new TypeError(`${key} must be sha256`);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,499}$/.test(value.payloadRef) || value.payloadRef.includes('..')) throw new TypeError('payloadRef must be an opaque safe reference');
  if (!/^[a-f0-9]{64}$/i.test(value.payloadHash) || !/^[a-f0-9]{64}$/i.test(value.policyManifestHash)) throw new TypeError('payload and policy manifest hashes must be sha256');
  if (!Array.isArray(value.payloadArtifactHashes) || value.payloadArtifactHashes.length > 20 || value.payloadArtifactHashes.some(hash => !/^[a-f0-9]{64}$/i.test(hash))) throw new TypeError('payloadArtifactHashes must be bounded sha256 values');
  if (!['shadow', 'draft', 'live'].includes(value.disposition)) throw new TypeError('valid disposition is required');
}
function toDate(value) { return value && typeof value.toDate === 'function' ? value.toDate() : new Date(value || 0); }
function classify(error) { return error && error.name ? error.name : 'SendError'; }
function isDeepFrozen(value) { if (!value || typeof value !== 'object') return true; return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen); }

async function sweepPendingAttention({ db, taskSink, clock = () => new Date(), limit = 100 }) {
  if (!db || !taskSink || typeof taskSink.upsert !== 'function') throw new TypeError('db and idempotent taskSink.upsert are required');
  const result = await db.collection('operations_outbox').where('attentionTaskPending', '==', true).get();
  const docs = result.docs.slice(0, Math.max(1, Math.min(limit, 500)));
  const outcomes = [];
  for (const doc of docs) outcomes.push(await upsertAndClearAttention({ db, taskSink, clock, ref: doc.ref, key: doc.id, value: doc.data() }));
  return { scanned: docs.length, pending: outcomes.filter(item => item.pending).length };
}

async function upsertAndClearAttention({ db, taskSink, clock, ref, key, value }) {
  try {
    await taskSink.upsert(value.attentionTaskId, { taskId: value.attentionTaskId, kind: 'outbox_dead_letter', operationId: value.operationId, idempotencyKey: key, status: 'open', dueAt: value.attentionDueAt });
    await db.runTransaction(async tx => {
      const current = await tx.get(ref); if (!current.exists) return; const latest = current.data();
      if (latest.state === 'dead_letter' && latest.attentionTaskPending === true && latest.attentionTaskId === value.attentionTaskId) tx.update(ref, { attentionTaskPending: false, attentionTaskCreatedAt: clock(), updatedAt: clock() });
    });
    return { pending: false, taskId: value.attentionTaskId };
  } catch (error) { return { pending: true, taskId: value.attentionTaskId, errorClass: classify(error) }; }
}

const ATTENTION_SWEEP_MAX_INTERVAL_MS = 15 * 60_000;
module.exports = { ATTENTION_SWEEP_MAX_INTERVAL_MS, createOutboxService, sweepPendingAttention };
