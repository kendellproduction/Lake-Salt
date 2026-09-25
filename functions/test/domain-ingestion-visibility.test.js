'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSuccessMetrics, normalizeInboundEvent, ownerCockpit, planProcessingJob, planRecoverySweep } = require('../domain');

const raw = { sourceChannel: 'gmail', sourceMessageId: 'external-secret-id', sourceMessageRef: 'gmail/messages/ref-1', conversationId: 'thread-secret', receivedAt: '2027-01-01T16:00:00Z', leadId: 'lead-1', businessEventId: 'event-1', body: 'private client content', attachments: [{ content: 'private pdf' }] };
const policy = { version: 'p1', humanDelayMs: { min: 60000, max: 120000 }, coverageHours: { startHour: 8, endHour: 18, utcOffsetMinutes: -420 }, firstResponseSlaMinutes: 10 };

test('normalizes inbound provider-neutrally without retaining private content', () => {
  const event = normalizeInboundEvent(raw, 'p1');
  assert.equal(event.sourceChannel, 'gmail');
  assert.equal(event.sourceMessageIdHash.length, 64);
  assert.equal(event.bodyHash.length, 64);
  assert.equal(event.privacy.bodyStored, false);
  assert.equal(JSON.stringify(event).includes('private client content'), false);
  assert.equal(JSON.stringify(event).includes('external-secret-id'), false);
  assert.equal(normalizeInboundEvent(raw, 'p1').idempotencyKey, event.idempotencyKey);
  assert.throws(() => normalizeInboundEvent({ ...raw, receivedAt: 'bad' }, 'p1'), /valid date/);
});

test('missing canonical association creates an explicit ambiguity hold', () => {
  const event = normalizeInboundEvent({ ...raw, businessEventId: undefined }, 'p1');
  assert.equal(event.processingStatus, 'hold');
  assert.equal(planProcessingJob(event, policy).reason, 'identity_association_required');
});

test('processing plan is deterministic with coverage and SLA metadata', () => {
  const event = normalizeInboundEvent(raw, 'p1');
  const first = planProcessingJob(event, policy);
  assert.deepEqual(planProcessingJob(event, policy), first);
  assert.equal(first.status, 'planned');
  assert.equal(first.sla.targetMinutes, 10);
  assert.equal(first.sla.coverageQualified, true);
  const afterHours = normalizeInboundEvent({ ...raw, sourceMessageId: 'later', receivedAt: '2027-01-02T03:00:00Z' }, 'p1');
  assert.equal(planProcessingJob(afterHours, policy).notBefore, '2027-01-02T15:00:00.000Z');
  assert.throws(() => planProcessingJob(event, { ...policy, version: 'p2' }), /mismatch/);
  const boundaryEvent = normalizeInboundEvent({ ...raw, sourceMessageId: 'boundary', receivedAt: '2027-01-02T00:59:00Z' }, 'p1');
  const boundary = planProcessingJob(boundaryEvent, { ...policy, humanDelayMs: { min: 600000, max: 600000 } });
  assert.equal(boundary.notBefore, '2027-01-02T00:59:59.999Z');
  assert.equal(boundary.sla.dueAt, '2027-01-02T01:09:00.000Z');
  assert.throws(() => planProcessingJob(event, { ...policy, humanDelayMs: { min: 1.5, max: 2 } }), /delay/);
});

test('recovery understands terminal, failed, dead, and stranded job states', () => {
  const raws = ['done', 'failed', 'dead', 'stranded'].map((id) => ({ ...raw, sourceMessageId: id }));
  const events = raws.map((item) => normalizeInboundEvent(item, 'p1'));
  const jobs = [
    { sourceEventKey: events[0].idempotencyKey, status: 'completed' },
    { sourceEventKey: events[1].idempotencyKey, status: 'failed' },
    { sourceEventKey: events[2].idempotencyKey, status: 'dead_letter', jobId: 'j-dead' },
    { sourceEventKey: events[3].idempotencyKey, status: 'mystery', jobId: 'j-stranded' },
  ];
  const result = planRecoverySweep({ sourceInventory: raws, ingestedEvents: events, jobs, policy, now: '2027-01-01T17:00:00Z' });
  assert.equal(result.actions.some((x) => x.idempotencyKey.includes(events[0].idempotencyKey)), false);
  assert.ok(result.actions.some((x) => x.status === 'recover_job' && x.reason === 'failed_job'));
  assert.ok(result.actions.some((x) => x.status === 'attention' && x.reason === 'dead_letter_job'));
  assert.ok(result.actions.some((x) => x.status === 'reconcile_job' && x.reason === 'stranded_job_state'));
});

test('recovery holds a corrupt existing event without aborting the sweep', () => {
  const good = normalizeInboundEvent(raw, 'p1');
  const corrupt = { ...good, receivedAt: 'not-a-date' };
  const result = planRecoverySweep({ sourceInventory: [raw], ingestedEvents: [corrupt], jobs: [], policy, now: '2027-01-01T17:00:00Z' });
  assert.equal(result.actions[0].reason, 'corrupt_existing_event');
});

test('recovery sweep independently restores missing ingestion/jobs and dedupes push duplicates', () => {
  const existing = normalizeInboundEvent(raw, 'p1');
  const missing = { ...raw, sourceMessageId: 'missing-2', leadId: 'lead-2', businessEventId: 'event-2' };
  const result = planRecoverySweep({ sourceInventory: [raw, raw, missing], ingestedEvents: [existing], jobs: [], policy, now: '2027-01-01T17:00:00Z' });
  assert.equal(result.scanned, 3);
  assert.equal(result.uniqueSourceEvents, 2);
  assert.equal(result.externalCalls, 0);
  assert.equal(result.actions.filter((x) => x.status === 'recover_ingestion').length, 1);
  assert.equal(result.actions.filter((x) => x.status === 'recover_job').length, 2);
});

test('recovery sweep holds partial identity and malformed inventory without aborting', () => {
  const ambiguous = { ...raw, sourceMessageId: 'ambiguous', businessEventId: undefined };
  const result = planRecoverySweep({ sourceInventory: [ambiguous, { sourceChannel: 'gmail' }], policy, now: '2027-01-01T17:00:00Z' });
  assert.ok(result.actions.some((x) => x.reason === 'identity_association_required'));
  assert.ok(result.actions.some((x) => x.reason === 'malformed_source_event'));
});

test('owner cockpit exposes operational completeness, controls, exceptions, audit, and variance', () => {
  const cockpit = ownerCockpit({
    policyVersion: 'p1', asOf: '2027-01-08T00:00:00Z', leads: [{ stage: 'New Lead' }, { stage: 'Booked' }],
    bookings: [{ businessEventId: 'e1', paymentStatus: 'paid', calendarCapacityStatus: 'held', prepTimelineStatus: 'current', crmStage: 'Booked' }, { businessEventId: 'e2', paymentStatus: 'open' }],
    outbox: [{ operationId: 'o1', status: 'sent' }, { operationId: 'o2', status: 'dead_letter' }],
    systemIssues: [{ id: 'red', severity: 'Red', status: 'open', recommendedDefault: 'Pause and inspect', choices: ['Pause', 'Continue shadow'] }, { id: 'warn', severity: 'Yellow', status: 'open' }],
    killSwitch: { enabled: true }, recovery: { status: 'healthy', lastRunAt: '2027-01-07T23:50:00Z' },
    weeklyAudits: [{ weekEnding: '2027-01-07', findingCount: 0 }], pricingShadows: [{ totalVariance: 50, unexplainedVariance: 0 }, { totalVariance: -10, unexplainedVariance: 5 }],
  });
  assert.equal(cockpit.pipeline.Booked, 1);
  assert.deepEqual(cockpit.bookings.incompleteBusinessEventIds, ['e2']);
  assert.equal(cockpit.outbox.deadLetterCount, 1);
  assert.equal(cockpit.notifications.immediateRed.length, 1);
  assert.equal(cockpit.notifications.dailyDigest.length, 1);
  assert.equal(cockpit.controls.killSwitchEnabled, true);
  assert.equal(cockpit.weeklyAudit.present, true);
  assert.deepEqual(cockpit.pricingShadow, { scenarios: 2, totalVariance: 40, unexplainedCount: 1 });
});

test('cockpit uses exact completeness states and surfaces malformed Red integrity exceptions', () => {
  const cockpit = ownerCockpit({ policyVersion: 'p1', asOf: '2027-01-08', bookings: [{ businessEventId: 'e1', paymentStatus: 'yes', calendarCapacityStatus: 'maybe', prepTimelineStatus: 'truthy', crmStage: 'Almost' }], systemIssues: [{ id: 'bad-red', severity: 'Red', status: 'open', choices: ['only one'] }] });
  assert.equal(cockpit.bookings.complete, 0);
  assert.deepEqual(cockpit.bookings.incomplete[0].reasons, ['paymentStatus_incomplete', 'calendarCapacityStatus_incomplete', 'prepTimelineStatus_incomplete', 'crmStage_incomplete']);
  assert.equal(cockpit.notifications.immediateRed.length, 0);
  assert.equal(cockpit.notifications.integrityExceptions[0].issueId, 'bad-red');
});

test('owner cockpit and success metrics safely represent zero/partial data', () => {
  const empty = ownerCockpit({ policyVersion: 'p1', asOf: '2027-01-08' });
  assert.equal(empty.weeklyAudit.present, false);
  assert.equal(empty.controls.recoveryStatus, 'unknown');
  const metrics = calculateSuccessMetrics({
    inboundEvents: [{ coverageQualified: true, responseMinutes: 8 }, { coverageQualified: true, responseMinutes: 12 }, { coverageQualified: false }],
    bookings: [{ paymentStatus: 'paid', calendarCapacityStatus: 'held', prepTimelineStatus: 'current', crmStage: 'Booked' }, { paymentStatus: 'open' }],
    failures: [{ visibleAfterMinutes: 10 }, { visibleAfterMinutes: 20 }], incidents: [{ type: 'duplicate_send' }, { type: 'wrong_thread' }],
  });
  assert.equal(metrics.firstResponse.percent, 0.5);
  assert.equal(metrics.bookingCompleteness.percent, 0.5);
  assert.equal(metrics.failureVisibility.percent, 0.5);
  assert.deepEqual(calculateSuccessMetrics({}).firstResponse.percent, null);
});

test('success metrics reject explicit truthy-but-false booking states', () => {
  const metrics = calculateSuccessMetrics({ bookings: [
    { paymentStatus: 'yes', calendarCapacityStatus: 'maybe', prepTimelineStatus: 'scheduled-ish', crmStage: 'Almost Booked' },
    { paymentStatus: 'paid', calendarCapacityStatus: 'held', prepTimelineStatus: 'current', crmStage: 'Booked' },
  ] });
  assert.deepEqual(metrics.bookingCompleteness, { total: 2, complete: 1, percent: 0.5 });
});
