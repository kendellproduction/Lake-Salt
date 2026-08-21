'use strict';

const crypto = require('node:crypto');

function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function requiredString(value, name) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`); return value.trim(); }
function validDate(value, name) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new TypeError(`${name} must be a valid date`); return date; }

function normalizeInboundEvent(raw, policyVersion) {
  if (!raw || typeof raw !== 'object') throw new TypeError('raw inbound event is required');
  const sourceChannel = requiredString(raw.sourceChannel, 'sourceChannel');
  const sourceMessageId = requiredString(raw.sourceMessageId, 'sourceMessageId');
  const receivedAt = validDate(raw.receivedAt, 'receivedAt').toISOString();
  const idempotencyKey = `ingest:${sourceChannel}:${hash(sourceMessageId).slice(0, 24)}`;
  const association = raw.leadId && raw.businessEventId ? 'associated' : 'hold';
  return {
    sourceChannel, sourceMessageIdHash: hash(sourceMessageId),
    sourceMessageRef: raw.sourceMessageRef || null,
    conversationRef: raw.conversationRef || null,
    conversationIdHash: raw.conversationId ? hash(raw.conversationId) : null,
    receivedAt, leadId: raw.leadId || null, businessEventId: raw.businessEventId || null,
    ingestionStatus: 'normalized', processingStatus: association === 'associated' ? 'pending' : 'hold',
    holdReason: association === 'hold' ? 'identity_association_required' : null,
    idempotencyKey, policyVersion: requiredString(policyVersion, 'policyVersion'),
    bodyHash: raw.body === undefined ? null : hash(raw.body),
    attachmentHashes: (raw.attachments || []).map((item) => hash(item.bytesHash || item.content || item.ref || '')).sort(),
    privacy: { bodyStored: false, attachmentsStored: false },
  };
}

function planProcessingJob(event, policy) {
  if (!event?.idempotencyKey || !event?.policyVersion) throw new TypeError('normalized event is required');
  if (event.policyVersion !== policy?.version) throw new Error('processing_policy_version_mismatch');
  if (event.processingStatus === 'hold') return { status: 'hold', reason: event.holdReason, idempotencyKey: `process:${event.idempotencyKey}`, policyVersion: event.policyVersion };
  const min = policy.humanDelayMs?.min;
  const max = policy.humanDelayMs?.max;
  if (![min, max].every(Number.isSafeInteger) || min < 0 || max < min) throw new Error('invalid_human_delay_policy');
  const range = max - min + 1;
  const seed = parseInt(hash(event.idempotencyKey).slice(0, 8), 16);
  const delayMs = min + (seed % range);
  const received = validDate(event.receivedAt, 'receivedAt');
  let coverage = nextCoverageTime(new Date(received.getTime() + delayMs), policy.coverageHours);
  const slaMinutes = Number(policy.firstResponseSlaMinutes);
  if (!Number.isFinite(slaMinutes) || slaMinutes <= 0) throw new Error('invalid_sla_policy');
  const coverageQualified = isWithinCoverage(received, policy.coverageHours);
  const slaBase = coverageQualified ? received : coverage;
  const dueAt = new Date(slaBase.getTime() + slaMinutes * 60000);
  if (coverageQualified) {
    const coverageEnd = coverageEndTime(received, policy.coverageHours);
    coverage = new Date(Math.min(coverage.getTime(), dueAt.getTime(), coverageEnd.getTime() - 1));
  }
  return {
    status: 'planned', jobType: 'process_inbound', idempotencyKey: `process:${event.idempotencyKey}`,
    sourceEventKey: event.idempotencyKey, notBefore: coverage.toISOString(), policyVersion: event.policyVersion,
    sla: { coverageQualified, targetMinutes: slaMinutes, dueAt: dueAt.toISOString() },
  };
}

function coverageParts(date, coverage) {
  if (!coverage || !Number.isInteger(coverage.startHour) || !Number.isInteger(coverage.endHour) || !Number.isInteger(coverage.utcOffsetMinutes) || coverage.startHour < 0 || coverage.startHour > 23 || coverage.endHour < 1 || coverage.endHour > 24 || coverage.startHour >= coverage.endHour) throw new Error('invalid_coverage_policy');
  const shifted = new Date(date.getTime() + coverage.utcOffsetMinutes * 60000);
  return { shifted, hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60 };
}
function isWithinCoverage(date, coverage) { const { hour } = coverageParts(date, coverage); return hour >= coverage.startHour && hour < coverage.endHour; }
function nextCoverageTime(date, coverage) {
  const { shifted, hour } = coverageParts(date, coverage);
  if (hour >= coverage.startHour && hour < coverage.endHour) return date;
  if (hour >= coverage.endHour) shifted.setUTCDate(shifted.getUTCDate() + 1);
  shifted.setUTCHours(coverage.startHour, 0, 0, 0);
  return new Date(shifted.getTime() - coverage.utcOffsetMinutes * 60000);
}
function coverageEndTime(date, coverage) {
  const { shifted } = coverageParts(date, coverage);
  shifted.setUTCHours(coverage.endHour, 0, 0, 0);
  return new Date(shifted.getTime() - coverage.utcOffsetMinutes * 60000);
}

function planRecoverySweep({ sourceInventory = [], ingestedEvents = [], jobs = [], policy, now }) {
  validDate(now, 'now');
  if (!policy?.version) throw new TypeError('policyVersion is required');
  const ingested = new Map(ingestedEvents.map((event) => [event.idempotencyKey, event]));
  const jobsByEvent = new Map();
  for (const job of jobs) if (job?.sourceEventKey) jobsByEvent.set(job.sourceEventKey, job);
  const seen = new Set();
  const actions = [];
  for (const raw of sourceInventory) {
    let event;
    try { event = normalizeInboundEvent(raw, policy.version); } catch (error) {
      actions.push({ status: 'hold', reason: 'malformed_source_event', sourceRef: raw?.sourceMessageRef || null, errorClass: error.name, policyVersion: policy.version });
      continue;
    }
    if (seen.has(event.idempotencyKey)) continue;
    seen.add(event.idempotencyKey);
    const existing = ingested.get(event.idempotencyKey);
    if (!existing) actions.push({ status: 'recover_ingestion', idempotencyKey: `recovery:${event.idempotencyKey}`, event, policyVersion: policy.version });
    const effective = existing || event;
    if (effective.processingStatus === 'hold') actions.push({ status: 'hold', idempotencyKey: `reconcile:${event.idempotencyKey}`, reason: effective.holdReason || 'identity_association_required', policyVersion: policy.version });
    else {
      const existingJob = jobsByEvent.get(event.idempotencyKey);
      const state = existingJob?.status;
      if (!existingJob) addRecoveryJob(actions, effective, event, policy, 'missing_job');
      else if (['planned', 'queued', 'running', 'completed', 'done', 'succeeded'].includes(state)) continue;
      else if (['failed', 'retryable_failure'].includes(state)) addRecoveryJob(actions, effective, event, policy, 'failed_job');
      else if (['dead_letter', 'dead'].includes(state)) actions.push({ status: 'attention', reason: 'dead_letter_job', jobId: existingJob.jobId || null, idempotencyKey: `recovery-attention:${event.idempotencyKey}`, policyVersion: policy.version });
      else actions.push({ status: 'reconcile_job', reason: 'stranded_job_state', jobId: existingJob.jobId || null, observedStatus: state || null, idempotencyKey: `recovery-reconcile:${event.idempotencyKey}`, policyVersion: policy.version });
    }
  }
  return { status: 'planned', policyVersion: policy.version, scanned: sourceInventory.length, uniqueSourceEvents: seen.size, actions, externalCalls: 0 };
}

function addRecoveryJob(actions, effective, event, policy, reason) {
  try { actions.push({ status: 'recover_job', reason, idempotencyKey: `recovery-job:${event.idempotencyKey}`, job: planProcessingJob(effective, policy), policyVersion: policy.version }); }
  catch (error) { actions.push({ status: 'hold', reason: 'corrupt_existing_event', idempotencyKey: `recovery-hold:${event.idempotencyKey}`, errorClass: error.name, policyVersion: policy.version }); }
}

module.exports = { normalizeInboundEvent, planProcessingJob, planRecoverySweep };
