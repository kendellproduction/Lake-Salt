'use strict';

const crypto = require('node:crypto');

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stableId(prefix, parts) {
  const normalized = parts.map((part) => clean(part).toLowerCase()).join('\u001f');
  if (!normalized.replace(/\u001f/g, '')) throw new TypeError('identity parts are required');
  return `${prefix}_${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 20)}`;
}

function canonicalIdentity(input) {
  if (!input || typeof input !== 'object') throw new TypeError('identity input is required');
  const leadId = clean(input.leadId) || stableId('lead', [input.sourceChannel, input.sourceLeadId || input.email]);
  const eventKey = clean(input.businessEventId) || input.sourceEventId || [input.eventDate, input.venue].filter(Boolean).join('|');
  if (!eventKey) return { status: 'hold', reason: 'business_event_identity_missing', leadId };
  return {
    status: 'resolved',
    leadId,
    businessEventId: clean(input.businessEventId) || stableId('event', [leadId, eventKey]),
  };
}

function uniqueCandidates(candidates) {
  const result = new Map();
  for (const value of candidates || []) {
    const id = typeof value === 'string' ? value : value && (value.conversationId || value.id);
    if (clean(id)) result.set(clean(id), value);
  }
  return [...result.entries()].map(([conversationId, source]) => ({ conversationId, source }));
}

function resolveConversation(input) {
  if (!input || typeof input !== 'object') throw new TypeError('resolution input is required');
  const levels = [
    ['stored_conversation_id', input.storedConversationIds],
    ['reply_to_message_id', input.replyToConversationIds],
    ['business_event_mapping', input.businessEventConversationIds],
    ['platform_relay_mapping', input.platformRelayConversationIds],
  ];
  for (const [method, candidates] of levels) {
    const unique = uniqueCandidates(candidates);
    if (unique.length === 1) return { status: 'resolved', method, conversationId: unique[0].conversationId };
    if (unique.length > 1) return { status: 'hold', reason: 'ambiguous_conversation', method, candidateIds: unique.map((x) => x.conversationId).sort() };
  }
  const fallback = uniqueCandidates(input.emailSearchConversationIds);
  if (fallback.length === 1) return { status: 'resolved', method: 'email_search_fallback', conversationId: fallback[0].conversationId };
  if (fallback.length > 1) return { status: 'hold', reason: 'ambiguous_conversation', method: 'email_search_fallback', candidateIds: fallback.map((x) => x.conversationId).sort() };
  return { status: 'hold', reason: 'conversation_not_found' };
}

module.exports = { canonicalIdentity, resolveConversation, stableId };
