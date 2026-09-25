'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  acceptQuote, calculateQuote, canonicalIdentity, createShadowComparison, evaluateFollowUp,
  eventPrepTimeline, orchestrateBooking, reconcileFinance, resolveConversation,
  validateQuoteInputs, weeklyAudit,
} = require('../domain');

const input = {
  eventDate: '2027-08-07', serviceStart: '17:00', serviceEnd: '21:00', venueName: 'Mill Pond Farms', venueCity: 'SLC', travelZone: 'metro', guestCount: 95,
  eventType: 'wedding', barProvider: 'venue', scope: ['beer', 'wine', 'cocktails'], specialRequests: [], staffingRequirements: 0, equipmentAddOns: [], capacityVerified: true,
  cocktailCount: 2, signatureDrinkComplexity: 'standard', gratuity: 0,
};
const policy = {
  version: '2026.08', staffingRatios: { beerWine: 75, standard: 60, complex: 50 }, minimumBartenders: { standard: 1 },
  costRules: [
    { id: 'bartender_pay', amount: () => 200, quantity: (ctx) => ctx.bartenderCount },
    { id: 'supplies', unitAmount: 150 },
  ], targetMargins: { wedding: 0.4 }, minimums: { wedding: 800 }, roundingIncrement: 5, depositPercent: 0.1, confidence: 0.94,
  dueDates: { deposit: '2027-06-01', balance: '2027-08-07' }, paymentMethods: ['invoice', 'venmo'],
};

test('canonical identity distinguishes multiple events for one lead', () => {
  const a = canonicalIdentity({ sourceChannel: 'gmail', email: 'return@example.com', eventDate: '2027-01-01', venue: 'A' });
  const b = canonicalIdentity({ sourceChannel: 'gmail', email: 'return@example.com', eventDate: '2028-01-01', venue: 'B' });
  assert.equal(a.leadId, b.leadId);
  assert.notEqual(a.businessEventId, b.businessEventId);
  assert.equal(canonicalIdentity({ email: 'x@example.com' }).status, 'hold');
  assert.throws(() => canonicalIdentity(null), /required/);
});

test('conversation resolution follows hierarchy, deduplicates, and holds ambiguity', () => {
  assert.deepEqual(resolveConversation({ storedConversationIds: ['thread-1'], replyToConversationIds: ['thread-2'] }), { status: 'resolved', method: 'stored_conversation_id', conversationId: 'thread-1' });
  assert.equal(resolveConversation({ storedConversationIds: ['same', 'same'] }).status, 'resolved');
  const ambiguous = resolveConversation({ emailSearchConversationIds: ['b', 'a'] });
  assert.deepEqual(ambiguous.candidateIds, ['a', 'b']);
  assert.equal(ambiguous.status, 'hold');
  assert.equal(resolveConversation({}).reason, 'conversation_not_found');
});

test('required quote validation catches malformed and conditional inputs', () => {
  assert.equal(validateQuoteInputs(null).valid, false);
  const bad = validateQuoteInputs({ ...input, eventDate: 'Aug 7', guestCount: -1, capacityVerified: false, signatureDrinkComplexity: undefined });
  assert.equal(bad.valid, false);
  assert.ok(bad.missing.includes('signatureDrinkComplexity'));
  assert.ok(bad.errors.includes('capacity_must_be_verified'));
  assert.equal(validateQuoteInputs(input).valid, true);
  assert.equal(validateQuoteInputs({ ...input, eventDate: '2027-02-30' }).valid, false);
});

test('pricing is deterministic, traced, policy-versioned, and structured', () => {
  const quote = calculateQuote({ quoteId: 'q1', leadId: 'l1', businessEventId: 'e1', policyVersion: '2026.08', input, policy });
  assert.equal(quote.operatingCost, 550);
  assert.equal(quote.total, 920);
  assert.equal(quote.depositAmount, 92);
  assert.equal(quote.balance, 828);
  assert.equal(quote.computationTrace.at(-1).rule, 'deposit');
  assert.deepEqual(calculateQuote({ quoteId: 'q1', leadId: 'l1', businessEventId: 'e1', policyVersion: '2026.08', input, policy }), quote);
  assert.throws(() => calculateQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: 'other', input, policy }), /mismatch/);
  assert.throws(() => calculateQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: '2026.08', input, policy: { ...policy, staffingRatios: { ...policy.staffingRatios, standard: 0 } } }), /staffing_ratio/);
  assert.throws(() => calculateQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: '2026.08', input, policy: { ...policy, costRules: [{ id: 'bad', unitAmount: Number.NaN }] } }), /invalid_cost_rule/);
  assert.throws(() => calculateQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: '2026.08', input: { ...input, gratuity: -1 }, policy }), /gratuity/);
  for (const times of [{ serviceStart: '17:99', serviceEnd: '21:00' }, { serviceStart: '24:00', serviceEnd: '21:00' }, { serviceStart: '17:00', serviceEnd: '17:00' }, { serviceStart: '23:00', serviceEnd: '01:00' }]) {
    assert.throws(() => calculateQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: '2026.08', input: { ...input, ...times }, policy }), /service_times/);
  }
  assert.equal(calculateQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: '2026.08', input: { ...input, serviceStart: '23:00', serviceEnd: '01:00' }, policy: { ...policy, allowOvernightService: true } }).status, 'computed');
  assert.equal(calculateQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: '2026.08', input: { ...input, dueDates: policy.dueDates }, policy }).reason, 'unapproved_payment_terms_override');
  assert.equal(calculateQuote({ policyVersion: '2026.08', input, policy }).reason, 'quote_identity_incomplete');
  assert.equal(calculateQuote({ policyVersion: '2026.08', input: { ...input, capacityVerified: false }, policy }).status, 'hold');
});

test('accepted Alisa $792 quote and $79.20 deposit remain immutable', () => {
  const legacy = { quoteId: 'alisa-accepted', leadId: 'alisa', businessEventId: 'alisa-wedding', policyVersion: 'legacy.accepted.v1', subtotal: 792, discounts: [], gratuity: 0, total: 792, depositPercent: 0.1, depositAmount: 79.20, balance: 712.80, dueDates: { deposit: '2026-08-01', balance: '2027-08-07' }, paymentMethods: ['invoice'], lineItems: [{ ruleId: 'legacy', amount: 792 }], status: 'sent' };
  const evidence = approvalFor(legacy);
  const accepted = acceptQuote(legacy, '2026-07-01T00:00:00.000Z', evidence);
  assert.equal(accepted.total, 792);
  assert.equal(accepted.depositAmount, 79.20);
  assert.throws(() => { accepted.total = 900; }, TypeError);
  assert.throws(() => { accepted.lineItems[0].amount = 900; }, TypeError);
  assert.deepEqual(acceptQuote(accepted, accepted.acceptedAt, evidence), accepted);
  assert.throws(() => acceptQuote({ ...legacy, businessEventId: '' }, null, evidence), /businessEventId/);
  assert.throws(() => acceptQuote({ ...legacy, balance: 1 }, null, evidence), /balance_mismatch/);
  assert.throws(() => acceptQuote({ ...legacy, dueDates: undefined }, null, evidence), /dueDates/);
  assert.throws(() => acceptQuote({ ...legacy, paymentMethods: [] }, null, evidence), /paymentMethods/);
  assert.throws(() => acceptQuote({ ...legacy, lineItems: [{ ruleId: 'x', amount: Number.NaN }] }, null, evidence), /line_item/);
  assert.throws(() => acceptQuote({ ...legacy, discounts: [{ ruleId: 'promo', amount: 10 }] }, null, evidence), /total_mismatch/);
  assert.throws(() => acceptQuote(legacy, null, { ...evidence, paymentMethods: ['cash'] }), /not_approved/);
  assert.throws(() => acceptQuote(legacy, null, null), /evidence/);
});

test('shadow record preserves separate computed/approved records and attributes variance', () => {
  const computed = { quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: 'p1', total: 900, lineItems: [{ ruleId: 'labor', amount: 400 }] };
  const approved = { quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: 'p1', total: 950, lineItems: [{ ruleId: 'labor', amount: 425 }, { ruleId: 'venue', amount: 25 }] };
  const shadow = createShadowComparison(computed, approved, { labor: 'owner_staffing_override', venue: 'venue_constraint' });
  assert.equal(shadow.totalVariance, 50);
  assert.equal(shadow.unexplainedVariance, 0);
  assert.notStrictEqual(shadow.computed, shadow.approved);
  assert.throws(() => { shadow.approved.total = 1; }, TypeError);
  approved.total = 1;
  assert.equal(shadow.approved.total, 950);
  assert.throws(() => createShadowComparison(computed, { ...approved, quoteId: 'other' }), /identity/);
  assert.throws(() => createShadowComparison(computed, { ...approved, quoteId: 'q', policyVersion: 'p2' }), /policy/);
});

test('booking orchestration uses stable idempotency keys and reports partial dependency failure', async () => {
  const calls = [];
  let taskAttempts = 0;
  const ports = {
    reserveCapacity: async (x) => (calls.push(x), { status: calls.filter((call) => call.idempotencyKey?.endsWith(':capacity')).length > 1 ? 'already_reserved_by_same_operation' : 'reserved' }),
    upsertCalendarHold: async (x) => calls.push(x),
    updateCrm: async (x) => calls.push(x),
    createTasks: async () => { if (++taskAttempts === 1) { const error = new Error('down'); error.code = 'TASK_PORT_DOWN'; throw error; } },
  };
  const quote = acceptableQuote({ quoteId: 'q1', leadId: 'l1', businessEventId: 'e1', policyVersion: 'p1' });
  const acceptedQuote = acceptQuote(quote, null, approvalFor(quote));
  const booking = { businessEventId: 'e1', quoteId: 'q1', policyVersion: 'p1', acceptedQuote, approvalEvidence: approvalFor(quote), eventDate: '2027-01-01' };
  const result = await orchestrateBooking(booking, ports);
  assert.equal(result.status, 'partial_failure');
  assert.equal(result.failedStep, 'tasks_created');
  assert.deepEqual(result.completed, ['capacity_reserved', 'calendar_held', 'crm_updated']);
  const retry = await orchestrateBooking(booking, ports);
  assert.equal(retry.idempotencyKey, result.idempotencyKey);
  assert.equal(retry.status, 'booked');
  assert.equal(retry.completed[0], 'capacity_reserved');
  assert.equal(await orchestrateBooking({ ...booking, acceptedQuote: { ...acceptedQuote, status: 'computed' } }, ports).then((x) => x.status), 'hold');
  const forged = Object.freeze({ ...acceptedQuote, total: 1, balance: 0, frozen: true, acceptanceVerified: 'domain.accepted.v1' });
  assert.equal(await orchestrateBooking({ ...booking, acceptedQuote: forged }, ports).then((x) => x.reason), 'verified_accepted_quote_required');
});

test('booking capacity hold prevents mutation ports', async () => {
  let mutations = 0;
  const quote = acceptableQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: 'p' });
  const acceptedQuote = acceptQuote(quote, null, approvalFor(quote));
  const ports = { reserveCapacity: async () => ({ status: 'conflict' }), upsertCalendarHold: async () => mutations++, updateCrm: async () => mutations++, createTasks: async () => mutations++ };
  const result = await orchestrateBooking({ businessEventId: 'e', quoteId: 'q', policyVersion: 'p', acceptedQuote, approvalEvidence: approvalFor(quote), eventDate: '2027-01-01' }, ports);
  assert.equal(result.reason, 'capacity_unavailable');
  assert.equal(mutations, 0);
});

test('atomic capacity reservation permits only one concurrent booking attempt', async () => {
  const reservations = new Set();
  let downstream = 0;
  const ports = {
    reserveCapacity: async ({ businessEventId }) => {
      if (reservations.has(businessEventId)) return { status: 'conflict' };
      reservations.add(businessEventId);
      return { status: 'reserved' };
    },
    upsertCalendarHold: async () => { downstream++; }, updateCrm: async () => {}, createTasks: async () => {},
  };
  const quote = acceptableQuote({ quoteId: 'q', leadId: 'l', businessEventId: 'e', policyVersion: 'p' });
  const acceptedQuote = acceptQuote(quote, null, approvalFor(quote));
  const booking = { businessEventId: 'e', quoteId: 'q', policyVersion: 'p', acceptedQuote, approvalEvidence: approvalFor(quote), eventDate: '2027-01-01' };
  const results = await Promise.all([orchestrateBooking(booking, ports), orchestrateBooking(booking, ports)]);
  assert.deepEqual(results.map((x) => x.status).sort(), ['booked', 'hold']);
  assert.equal(downstream, 1);
});

test('event prep timeline is deterministic and includes closeout', () => {
  const prepPolicy = { version: 'p1', milestones: [{ id: 'eight_week', daysFromEvent: -56 }, { id: 'supply_list', daysFromEvent: -24 }, { id: 'two_week', daysFromEvent: -14 }, { id: 'closeout', daysFromEvent: 1 }] };
  const tasks = eventPrepTimeline({ businessEventId: 'e1', eventDate: '2027-08-07', policyVersion: 'p1' }, prepPolicy);
  assert.deepEqual(tasks.map((x) => x.type), ['eight_week', 'supply_list', 'two_week', 'closeout']);
  assert.equal(new Set(tasks.map((x) => x.idempotencyKey)).size, 4);
});

test('finance reconciliation is read-only, deduplicates invoices, and emits attention tasks', () => {
  const result = reconcileFinance({ policyVersion: 'p1', asOf: '2027-01-10T00:00:00Z', invoices: [{ invoiceId: 'i1', businessEventId: 'e1', status: 'open', amountDue: 100, dueDate: '2027-01-01' }, { invoiceId: 'i1', businessEventId: 'e1', status: 'open', amountDue: 100 }], crmEvents: [{ businessEventId: 'e1', paymentStatus: 'paid', amountDue: 0 }] });
  assert.equal(result.invoiceCount, 1);
  assert.equal(result.mutationsPerformed, false);
  assert.deepEqual(result.attentionTasks[0].reasons, ['amount_due_mismatch', 'payment_overdue', 'payment_status_mismatch']);
});

test('follow-up cadences stay separate and honor opt-out and quiet hours', () => {
  const followPolicy = { version: 'p1', quietHours: { start: 20, end: 8 }, cadences: { sales: [{ id: 'd3', afterDays: 3 }], booked_event: [{ id: 'w8', afterDays: 1 }], campaign: [{ id: 'd10', afterDays: 10 }] } };
  const base = { now: '2027-01-05T18:00:00Z', lastActivityAt: '2027-01-01T18:00:00Z', recipient: { id: 'r1', utcOffsetMinutes: 0 }, policy: followPolicy };
  assert.equal(evaluateFollowUp({ ...base, kind: 'sales' }).step.id, 'd3');
  assert.equal(evaluateFollowUp({ ...base, kind: 'campaign' }).status, 'not_due');
  assert.equal(evaluateFollowUp({ ...base, kind: 'sales', recipient: { ...base.recipient, optedOut: true } }).reason, 'recipient_opted_out');
  assert.equal(evaluateFollowUp({ ...base, kind: 'sales', now: '2027-01-05T22:00:00Z' }).reason, 'quiet_hours');
});

test('weekly audit always emits, including zero findings', () => {
  const clear = weeklyAudit({ weekEnding: '2027-01-10', policyVersion: 'p1' });
  assert.equal(clear.emitted, true);
  assert.equal(clear.findingCount, 0);
  assert.equal(clear.status, 'clear');
  assert.equal(clear.sendAuthority, false);
  const failed = weeklyAudit({ weekEnding: '2027-01-10', policyVersion: 'p1', samples: [{ id: 's1' }], checks: [{ id: 'money', run: () => ({ passed: false, severity: 'critical', detail: 'bad' }) }] });
  assert.equal(failed.findingCount, 1);
});

function acceptableQuote(identity) {
  return { ...identity, subtotal: 100, discounts: [], gratuity: 0, total: 100, depositAmount: 10, depositPercent: 0.1, balance: 90, dueDates: { deposit: '2026-12-01' }, paymentMethods: ['invoice'], lineItems: [{ ruleId: 'service', amount: 100 }], status: 'sent' };
}

function approvalFor(quote) {
  return { approvalId: 'approval-1', approvedBy: 'kendell', policyVersion: quote.policyVersion, dueDates: quote.dueDates, paymentMethods: quote.paymentMethods };
}
