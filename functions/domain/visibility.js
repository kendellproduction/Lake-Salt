'use strict';

function countBy(items, key) { return items.reduce((out, item) => { const value = item[key] || 'unknown'; out[value] = (out[value] || 0) + 1; return out; }, {}); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
const DEFAULT_COMPLETENESS_POLICY = Object.freeze({ paymentStatus: ['current', 'paid', 'deposit_paid', 'not_due'], calendarCapacityStatus: ['held', 'confirmed'], prepTimelineStatus: ['current', 'complete'], crmStage: ['Booked', 'Completed'] });

function evaluateBookingCompleteness(booking, policy = DEFAULT_COMPLETENESS_POLICY) {
  const reasons = Object.entries(policy).filter(([field, states]) => !Array.isArray(states) || !states.includes(booking?.[field])).map(([field]) => `${field}_incomplete`);
  return { complete: reasons.length === 0, reasons };
}

function ownerCockpit(input) {
  if (!input?.policyVersion || !input?.asOf) throw new TypeError('policyVersion and asOf are required');
  const asOf = new Date(input.asOf);
  if (Number.isNaN(asOf.getTime())) throw new TypeError('asOf must be valid');
  const leads = input.leads || [], bookings = input.bookings || [], outbox = input.outbox || [], issues = input.systemIssues || [];
  const allowed = input.completenessPolicy || DEFAULT_COMPLETENESS_POLICY;
  const incompleteBookings = bookings.map((booking) => ({ businessEventId: booking.businessEventId, reasons: evaluateBookingCompleteness(booking, allowed).reasons })).filter((x) => x.reasons.length);
  const openRed = issues.filter((x) => x.severity === 'Red' && x.status !== 'resolved');
  const red = openRed.filter(validRed);
  const malformedRed = openRed.filter((x) => !validRed(x)).map((issue) => ({ type: 'red_integrity_exception', issueId: issue.id || null, reason: 'red_requires_recommended_default_and_2_to_4_choices', severity: 'Red' }));
  const digest = issues.filter((x) => x.severity !== 'Red' && x.status !== 'resolved');
  const deadLetters = outbox.filter((x) => x.status === 'dead_letter');
  const shadows = input.pricingShadows || [];
  const variance = shadows.reduce((sum, x) => sum + (finite(x.totalVariance) ? x.totalVariance : 0), 0);
  const audit = [...(input.weeklyAudits || [])].sort((a, b) => String(b.weekEnding).localeCompare(String(a.weekEnding)))[0] || null;
  return {
    policyVersion: input.policyVersion, asOf: asOf.toISOString(),
    pipeline: countBy(leads, 'stage'), bookings: { total: bookings.length, complete: bookings.length - incompleteBookings.length, incomplete: incompleteBookings, incompleteBusinessEventIds: incompleteBookings.map((x) => x.businessEventId) },
    outbox: { byStatus: countBy(outbox, 'status'), deadLetterCount: deadLetters.length, deadLetterIds: deadLetters.map((x) => x.operationId).filter(Boolean) },
    notifications: { immediateRed: red, dailyDigest: digest, integrityExceptions: malformedRed },
    controls: { killSwitchEnabled: input.killSwitch?.enabled === true, recoveryStatus: input.recovery?.status || 'unknown', lastRecoveryAt: input.recovery?.lastRunAt || null },
    weeklyAudit: { present: Boolean(audit), latest: audit },
    pricingShadow: { scenarios: shadows.length, totalVariance: Math.round(variance * 100) / 100, unexplainedCount: shadows.filter((x) => finite(x.unexplainedVariance) && x.unexplainedVariance !== 0).length },
  };
}

function validRed(issue) { return typeof issue.recommendedDefault === 'string' && issue.recommendedDefault.trim() && Array.isArray(issue.choices) && issue.choices.length >= 2 && issue.choices.length <= 4 && issue.choices.every((x) => typeof x === 'string' && x.trim()); }

function calculateSuccessMetrics(input) {
  const events = input?.inboundEvents || [], bookings = input?.bookings || [], failures = input?.failures || [];
  const qualified = events.filter((x) => x.coverageQualified && finite(x.responseMinutes));
  const within = qualified.filter((x) => x.responseMinutes < (input.firstResponseTargetMinutes || 10)).length;
  const completenessPolicy = input?.completenessPolicy || DEFAULT_COMPLETENESS_POLICY;
  const complete = bookings.filter((x) => evaluateBookingCompleteness(x, completenessPolicy).complete).length;
  const visible = failures.filter((x) => finite(x.visibleAfterMinutes) && x.visibleAfterMinutes <= 15).length;
  return {
    firstResponse: { measured: qualified.length, withinTarget: within, percent: qualified.length ? within / qualified.length : null },
    bookingCompleteness: { total: bookings.length, complete, percent: bookings.length ? complete / bookings.length : null },
    failureVisibility: { total: failures.length, within15Minutes: visible, percent: failures.length ? visible / failures.length : null },
    zeroIncidentCounts: countBy(input.incidents || [], 'type'),
  };
}

module.exports = { calculateSuccessMetrics, evaluateBookingCompleteness, ownerCockpit };
