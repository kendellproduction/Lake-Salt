'use strict';

const { canonicalize, sha256 } = require('./canonical');
const INTERNAL_MARKERS = [/(?:^|\n)\s*(?:internal only|do not send|legal review required|business draft)\s*(?:$|\n)/i, /(?:^|\s)(?:TODO|FIXME)(?::|\s|$)/, /(?:<<<<<<<|=======|>>>>>>>)/, /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/, /\[(?:CLIENT|EVENT|VENUE|DATE|AMOUNT|INSERT)[^\]]*\]/i];
const SAFE_ATTACHMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/calendar']);
const TRUSTED = Symbol('trusted-gate-dependencies');

function createSendGate({ policySnapshot, payloadRepository, capacityVerifier, duplicateEvaluator }) {
  if (!policySnapshot || !isDeepFrozen(policySnapshot) || !policySnapshot.version || !policySnapshot.manifestHash) throw new TypeError('deeply immutable pinned policy snapshot is required');
  if (!payloadRepository || typeof payloadRepository.fetch !== 'function') throw new TypeError('payloadRepository.fetch is required');
  return {
    async evaluate(request, runtime = {}) {
      let payload;
      try { payload = await payloadRepository.fetch(request && request.payloadRef); } catch { payload = null; }
      const capacityVerification = payload?.capacityClaims && capacityVerifier ? await capacityVerifier.verify(payload.capacityClaims, policySnapshot) : null;
      const duplicateEvaluation = runtime.recentOutbound && duplicateEvaluator ? await duplicateEvaluator.evaluate(request, runtime.recentOutbound, policySnapshot) : null;
      return evaluateSendGate(request, { ...runtime, policySnapshot, payload, capacityVerification, duplicateEvaluation, [TRUSTED]: true });
    },
  };
}

function evaluateSendGate(request, context = {}) {
  const holds = [];
  const block = (code, detail) => holds.push({ code, detail });
  if (!isPlain(request)) return denied('invalid_request', 'request is required');
  if (context[TRUSTED] !== true) return denied('untrusted_context', 'send gate requires injected trusted dependencies');
  if (context.killSwitch !== false) block('kill_switch', context.killSwitch === true ? 'enabled' : 'state is not explicitly disabled');
  const authority = context.policySnapshot.actionAuthorities?.[request.actionType];
  if (!['green', 'yellow'].includes(authority)) block('authority', 'action is not authorized by pinned policy');
  if (authority === 'yellow' && context.yellowApproval !== true) block('authority_approval', 'yellow action requires approval');
  if (request.policyVersion !== context.policySnapshot.version || request.policyManifestHash !== context.policySnapshot.manifestHash || context.policySnapshot.revoked === true) block('policy_stale_or_revoked', 'request must match the active pinned policy snapshot');
  if (!request.leadId || !request.businessEventId || context.leadId !== request.leadId || context.businessEventId !== request.businessEventId) block('identity', 'lead and business event must match verified context');
  if (!request.conversationId || context.conversationId !== request.conversationId || context.conversationAmbiguous === true) block('conversation', 'conversation must resolve exactly and unambiguously');

  const recipients = normalizeRecipients(request.recipients, block);
  const verified = normalizeRecipients(context.verifiedRecipients, () => {});
  if (!recipients.length || recipients.some(value => !verified.includes(value))) block('recipient', 'every recipient must be verified');
  const payload = context.payload;
  const envelopeKeys = ['ref', 'body', 'attachments', 'artifactHashes', 'money', 'capacityClaims'];
  const envelopeValid = isDeepFrozen(payload) && isPlain(payload) && Object.keys(payload).every(key => envelopeKeys.includes(key)) && payload.ref === request.payloadRef
    && typeof payload.body === 'string' && payload.body === normalizeBody(payload.body) && Array.isArray(payload.attachments) && Array.isArray(payload.artifactHashes);
  const body = envelopeValid ? payload.body : '';
  if (!body.trim()) block('content_empty', 'body is empty');
  if (INTERNAL_MARKERS.some(pattern => pattern.test(body))) block('content_internal_marker', 'body contains an unresolved or internal marker');

  const money = validateMoney(payload?.money, context.moneyRecord, request, body, block);
  const attachments = validateAttachments(payload?.attachments, block);
  const payloadHash = envelopeValid ? sha256(payload) : null;
  const derivedArtifactHashes = attachments.map(item => item.sha256).sort();
  const declaredArtifactHashes = envelopeValid ? payload.artifactHashes.slice().sort() : [];
  if (!envelopeValid || payload.artifactHashes.some(hash => !/^[a-f0-9]{64}$/i.test(hash)) || canonicalize(declaredArtifactHashes) !== canonicalize(derivedArtifactHashes)
    || request.expectedPayloadHash !== payloadHash || canonicalize(request.expectedArtifactHashes || []) !== canonicalize(declaredArtifactHashes)) block('payload_unverified', 'canonical immutable payload envelope or expected hashes mismatch');
  validateCapacity(payload?.capacityClaims, context.capacityVerification, body, block);
  validateDuplicate(context.recentOutbound, context.duplicateEvaluation, block);

  const attachmentHashes = derivedArtifactHashes;
  const bodyHash = sha256(normalizeBody(body));
  if (request.expectedBodyHash !== bodyHash) block('payload_body_mismatch', 'fetched payload body does not match expected hash');
  const intent = { conversationId: request.conversationId || null, actionType: request.actionType || null, recipients, bodyHash, attachmentHashes };
  const idempotencyKey = sha256(canonicalize(intent)); // deliberately independent of operationId
  const binding = { ...intent, idempotencyKey, leadId: request.leadId || null, businessEventId: request.businessEventId || null, policyVersion: request.policyVersion || null, policyManifestHash: request.policyManifestHash || null, payloadRef: request.payloadRef || null, payloadHash, payloadArtifactHashes: declaredArtifactHashes, money };
  const bindingHash = sha256(canonicalize(binding));

  let disposition = context.mode === 'draft' ? 'draft' : 'shadow';
  if (context.mode === 'live') disposition = 'live';
  return { allowed: holds.length === 0, disposition: holds.length ? 'hold' : disposition, holds, idempotencyKey, bodyHash, attachmentHashes, bindingHash, payloadRef: request.payloadRef, payloadHash, payloadArtifactHashes: declaredArtifactHashes, policyVersion: request.policyVersion, policyManifestHash: request.policyManifestHash };
}

function validateCapacity(claims, verification, body, block) {
  const apparent = /\b(?:available|availability|capacity|date is open|we can accommodate)\b/i.test(body);
  if (claims == null && !apparent) return;
  if (!Array.isArray(claims) || !claims.length || claims.some(claim => !isPlain(claim) || typeof claim.date !== 'string' || typeof claim.claim !== 'string')) {
    block('capacity_claim_malformed', 'capacity claims must be structured'); return;
  }
  const claimHash = sha256(canonicalize(claims));
  if (!isPlain(verification) || verification.available !== true || verification.claimHash !== claimHash) block('capacity_unverified', 'capacity claims require exact verifier result');
}

function validateDuplicate(recentOutbound, evaluation, block) {
  if (!recentOutbound) return;
  if (!isPlain(evaluation) || !['distinct_intent', 'client_replied'].includes(evaluation.decision)) block('duplicate_unverified', 'recent outbound requires injected duplicate evaluation');
}

function validateMoney(entries, record, request, body, block) {
  const bodyAmounts = extractMoneyMinor(body);
  if (entries == null) { if (bodyAmounts.length) block('money_unstructured', 'body contains money without structured entries'); return []; }
  if (!Array.isArray(entries)) { block('money_malformed', 'money must be an array'); return []; }
  if (!entries.length) { if (bodyAmounts.length) block('money_unstructured', 'body contains money without structured entries'); return []; }
  if (!isPlain(record) || !record.quoteId) { block('money_record', 'structured money record is missing'); return []; }
  if (record.leadId !== request.leadId || record.businessEventId !== request.businessEventId || record.policyVersion !== request.policyVersion) block('money_identity', 'money record is not bound to this lead, event, and policy');
  const allowedKinds = new Set(['subtotal', 'discounts', 'total', 'depositAmount', 'balance', 'refund']);
  const normalized = [];
  for (const entry of entries) {
    if (!isPlain(entry) || Object.keys(entry).some(key => !['kind', 'amountMinor'].includes(key)) || !allowedKinds.has(entry.kind) || !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor < 0) { block('money_invalid', 'money entries require only a known kind and non-negative integer minor units'); continue; }
    normalized.push({ kind: entry.kind, amountMinor: entry.amountMinor });
    if (record[entry.kind] !== entry.amountMinor) block('money_mismatch', `${entry.kind} does not match record`);
  }
  const amounts = new Set(normalized.map(entry => entry.amountMinor));
  if (bodyAmounts.some(amount => !amounts.has(amount))) block('money_body_mismatch', 'body contains an amount absent from structured money entries');
  return normalized;
}

function validateAttachments(value, block) {
  if (value == null) return [];
  if (!Array.isArray(value)) { block('attachment_metadata', 'attachments must be an array'); return []; }
  const valid = [];
  for (const item of value) {
    const allowed = ['filename', 'sha256', 'size', 'contentType', 'verified', 'identityVerified', 'scanStatus', 'passwordProtected', 'hasTrackedChanges'];
    if (!isPlain(item) || Object.keys(item).some(key => !allowed.includes(key)) || typeof item.filename !== 'string' || !/^[a-f0-9]{64}$/i.test(item.sha256 || '') || !Number.isSafeInteger(item.size) || item.size <= 0 || item.verified !== true || item.identityVerified !== true || item.scanStatus !== 'clean' || item.passwordProtected === true || item.hasTrackedChanges === true) { block('attachment_metadata', 'attachment is missing required safe metadata'); continue; }
    if (!SAFE_ATTACHMENT_TYPES.has(String(item.contentType || '').toLowerCase()) || item.size > 25 * 1024 * 1024) block('attachment_type_or_size', 'attachment type or size is not allowed');
    if (/(?:^|[._-])(?:draft|internal|review|redline)(?:[._-]|$)/i.test(item.filename)) block('attachment_internal_filename', 'attachment filename indicates internal or draft material');
    valid.push({ filename: item.filename, sha256: item.sha256.toLowerCase(), size: item.size, contentType: item.contentType });
  }
  return valid;
}

function normalizeRecipients(values, block) { if (!Array.isArray(values)) { block('recipient_malformed', 'recipients must be an array'); return []; } if (values.some(value => typeof value !== 'string')) block('recipient_malformed', 'recipient values must be strings'); return [...new Set(values.filter(value => typeof value === 'string').map(value => value.trim().toLowerCase()).filter(Boolean))].sort(); }
function extractMoneyMinor(body) { const values = []; const pattern = /\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)|\b([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:USD|dollars?)\b/gi; for (const match of String(body).matchAll(pattern)) { const numeric = Number((match[1] || match[2]).replaceAll(',', '')); if (Number.isFinite(numeric)) values.push(Math.round(numeric * 100)); } return values; }
function normalizeBody(value) { return value.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim(); }
function denied(code, detail) { return { allowed: false, disposition: 'hold', holds: [{ code, detail }] }; }
function isPlain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function isDeepFrozen(value) { if (!value || typeof value !== 'object') return true; return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen); }

module.exports = { createSendGate, extractMoneyMinor, normalizeBody };
