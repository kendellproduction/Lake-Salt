'use strict';

const DAY = 86400000;

function dateOnly(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new TypeError('valid date required');
  return d.toISOString().slice(0, 10);
}

function eventPrepTimeline(event, policy) {
  if (!event?.businessEventId || !event?.eventDate || !event?.policyVersion) throw new TypeError('event identity, date, and policyVersion are required');
  if (policy?.version !== event.policyVersion || !Array.isArray(policy.milestones)) throw new Error('event_prep_policy_version_mismatch');
  const eventTime = new Date(`${dateOnly(event.eventDate)}T12:00:00.000Z`).getTime();
  return policy.milestones.map((milestone) => ({
    taskId: `prep:${event.businessEventId}:${milestone.id}:${event.policyVersion}`,
    idempotencyKey: `prep:${event.businessEventId}:${milestone.id}:${event.policyVersion}`,
    businessEventId: event.businessEventId,
    type: milestone.id,
    dueDate: new Date(eventTime + milestone.daysFromEvent * DAY).toISOString().slice(0, 10),
    status: 'pending', policyVersion: event.policyVersion,
  })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function reconcileFinance({ invoices = [], crmEvents = [], policyVersion, asOf }) {
  if (!policyVersion) throw new TypeError('policyVersion is required');
  const crm = new Map(crmEvents.map((x) => [x.businessEventId, x]));
  const tasks = [];
  const seen = new Set();
  for (const invoice of invoices) {
    if (!invoice.invoiceId || seen.has(invoice.invoiceId)) continue;
    seen.add(invoice.invoiceId);
    const record = crm.get(invoice.businessEventId);
    const reasons = [];
    if (!record) reasons.push('crm_event_missing');
    else {
      if (record.paymentStatus !== invoice.status) reasons.push('payment_status_mismatch');
      if (Number(record.amountDue) !== Number(invoice.amountDue)) reasons.push('amount_due_mismatch');
    }
    if (invoice.dueDate && dateOnly(invoice.dueDate) < dateOnly(asOf) && invoice.status !== 'paid') reasons.push('payment_overdue');
    if (reasons.length) tasks.push({ taskId: `finance:${invoice.invoiceId}:${policyVersion}`, idempotencyKey: `finance:${invoice.invoiceId}:${policyVersion}`, type: 'finance_attention', invoiceId: invoice.invoiceId, businessEventId: invoice.businessEventId, reasons: [...new Set(reasons)].sort(), policyVersion, readOnly: true });
  }
  return { policyVersion, asOf: new Date(asOf).toISOString(), invoiceCount: seen.size, attentionTasks: tasks, mutationsPerformed: false };
}

function evaluateFollowUp({ kind, now, recipient, lastActivityAt, policy }) {
  if (!policy?.version) throw new TypeError('follow-up policyVersion is required');
  if (!['sales', 'booked_event', 'campaign'].includes(kind)) return { status: 'hold', reason: 'unknown_cadence', policyVersion: policy.version };
  if (recipient?.optedOut) return { status: 'hold', reason: 'recipient_opted_out', policyVersion: policy.version };
  const cadence = policy.cadences?.[kind];
  if (!Array.isArray(cadence)) return { status: 'hold', reason: 'cadence_not_configured', policyVersion: policy.version };
  const localHour = localTimeParts(now, recipient?.utcOffsetMinutes || 0);
  const quiet = policy.quietHours || { start: 20, end: 8 };
  if (isQuiet(localHour, quiet)) return { status: 'hold', reason: 'quiet_hours', resumeAtHour: quiet.end, policyVersion: policy.version };
  const elapsedDays = Math.floor((new Date(now) - new Date(lastActivityAt)) / DAY);
  const dueStep = cadence.find((step) => elapsedDays >= step.afterDays && !recipient?.completedCadenceSteps?.includes(step.id));
  if (!dueStep) return { status: 'not_due', policyVersion: policy.version };
  return { status: 'due', cadence: kind, step: dueStep, idempotencyKey: `followup:${recipient.id}:${kind}:${dueStep.id}:${policy.version}`, policyVersion: policy.version };
}

function localTimeParts(now, offset) { return (new Date(now).getUTCHours() + Math.trunc(offset / 60) + 24) % 24; }
function isQuiet(hour, quiet) { return quiet.start > quiet.end ? hour >= quiet.start || hour < quiet.end : hour >= quiet.start && hour < quiet.end; }

function weeklyAudit({ weekEnding, policyVersion, samples = [], checks = [] }) {
  if (!policyVersion || !weekEnding) throw new TypeError('weekEnding and policyVersion are required');
  const findings = [];
  for (const sample of samples) for (const check of checks) {
    const result = check.run(sample);
    if (result && result.passed === false) findings.push({ checkId: check.id, sampleId: sample.id, severity: result.severity || 'warning', detail: result.detail || 'check failed' });
  }
  return { reportId: `weekly-audit:${dateOnly(weekEnding)}:${policyVersion}`, weekEnding: dateOnly(weekEnding), policyVersion, sampleCount: samples.length, findingCount: findings.length, findings, status: findings.length ? 'findings' : 'clear', sendAuthority: false, emitted: true };
}

module.exports = { evaluateFollowUp, eventPrepTimeline, reconcileFinance, weeklyAudit };
