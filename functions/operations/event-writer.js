'use strict';

const crypto = require('node:crypto');
const { sha256 } = require('./canonical');

const ALLOWED = new Set([
  'eventId', 'idempotencyKey', 'correlationId', 'causationId', 'leadId', 'businessEventId',
  'conversationId', 'sourceChannel', 'actor', 'actionType', 'status', 'policyVersion',
  'createdAt', 'startedAt', 'completedAt', 'inputHash', 'bodyHash', 'attachmentHashes',
  'externalMessageId', 'errorClass', 'retryCount', 'metadata',
]);
const METADATA_ALLOWED = new Set(['channel', 'provider', 'reasonCode', 'messageType', 'latencyMs', 'attempt', 'recoverySource']);

function createOperationsEventWriter({ db, clock = () => new Date(), idFactory = () => crypto.randomUUID() }) {
  if (!db || typeof db.collection !== 'function') throw new TypeError('db is required');
  return {
    async append(input) {
      if (!input || typeof input !== 'object') throw new TypeError('event is required');
      const unknown = Object.keys(input).filter(key => !ALLOWED.has(key));
      if (unknown.length) throw new TypeError(`unsupported event fields: ${unknown.join(', ')}`);
      if (!input.policyVersion || !input.actionType || !input.status) throw new TypeError('policyVersion, actionType, and status are required');
      validateEventFields(input);
      validateMetadata(input.metadata);
      const eventId = input.eventId || idFactory();
      const record = { ...input, eventId, createdAt: input.createdAt || clock() };
      if (record.input !== undefined || record.body !== undefined) throw new TypeError('raw input/body is prohibited');
      const ref = db.collection('operations_events').doc(eventId);
      try {
        if (typeof ref.create === 'function') await ref.create(record);
        else await db.runTransaction(async tx => {
          const existing = await tx.get(ref);
          if (existing.exists) throw new Error('operations event already exists');
          tx.create(ref, record);
        });
      } catch (error) {
        if (/already.exist/i.test(error.message)) throw new Error(`operations event is append-only: ${eventId}`);
        throw error;
      }
      return Object.freeze({ eventId, recordHash: sha256(record) });
    },
  };
}

function validateEventFields(input) {
  for (const [key, value] of Object.entries(input)) {
    if (key === 'metadata' || key === 'attachmentHashes' || value == null || value instanceof Date || typeof value?.toDate === 'function') continue;
    if (typeof value === 'string' && (value.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))) throw new TypeError(`${key} is not privacy-safe or bounded`);
    if (!['string', 'number', 'boolean'].includes(typeof value)) throw new TypeError(`${key} has unsupported type`);
  }
  for (const key of ['inputHash', 'bodyHash']) if (input[key] != null && !/^[a-f0-9]{64}$/i.test(input[key])) throw new TypeError(`${key} must be sha256`);
  if (input.attachmentHashes != null && (!Array.isArray(input.attachmentHashes) || input.attachmentHashes.length > 20 || input.attachmentHashes.some(hash => !/^[a-f0-9]{64}$/i.test(hash)))) throw new TypeError('attachmentHashes must be a bounded sha256 array');
}

function validateMetadata(value, path = 'metadata') {
  if (value == null) return;
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${path} must be an object`);
  for (const [key, child] of Object.entries(value)) {
    if (!METADATA_ALLOWED.has(key)) throw new TypeError(`${path}.${key} is not privacy-safe metadata`);
    if (typeof child === 'string' && child.length > 500) throw new TypeError(`${path}.${key} is too long`);
    if (child && typeof child === 'object') throw new TypeError(`${path}.${key} must be scalar`);
    if (!['string', 'number', 'boolean'].includes(typeof child) && child != null) throw new TypeError(`${path}.${key} has unsupported type`);
  }
}

module.exports = { createOperationsEventWriter };
