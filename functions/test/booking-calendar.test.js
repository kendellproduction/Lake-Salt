'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  overlaps,
  localDateTimeToUtc,
  deriveWindow,
  evaluateAvailability,
  quoteDeposit,
  validateAcceptedQuote,
  deriveStaffRequiredFromQuote,
  deriveServerStaffing,
  bookingIdForQuote,
  derivedId
} = require('../booking-calendar');

function candidate(overrides = {}) {
  return {
    eventDate: '2027-08-07',
    eventStartTime: '17:00',
    eventEndTime: '21:00',
    timezone: 'America/Denver',
    staffRequired: 2,
    ...overrides
  };
}

test('Mountain local time converts across daylight saving time', () => {
  assert.equal(localDateTimeToUtc('2027-08-07', '17:00').toISOString(), '2027-08-07T23:00:00.000Z');
  assert.equal(localDateTimeToUtc('2027-12-22', '17:00').toISOString(), '2027-12-23T00:00:00.000Z');
});

test('invalid calendar dates and DST gaps fail round-trip validation', () => {
  assert.equal(localDateTimeToUtc('2027-02-30', '17:00'), null);
  assert.equal(localDateTimeToUtc('2027-03-14', '02:30'), null);
  assert.equal(localDateTimeToUtc('2027-13-01', '17:00'), null);
});

test('window includes setup and teardown buffers', () => {
  const window = deriveWindow(candidate());
  assert.equal(window.setupStartAt.toISOString(), '2027-08-07T21:30:00.000Z');
  assert.equal(window.teardownEndAt.toISOString(), '2027-08-08T04:00:00.000Z');
});

test('touching windows do not overlap while intersecting windows do', () => {
  assert.equal(overlaps(new Date(0), new Date(10), new Date(10), new Date(20)), false);
  assert.equal(overlaps(new Date(0), new Date(11), new Date(10), new Date(20)), true);
});

test('confirmed overlap is unavailable', () => {
  const result = evaluateAvailability({
    candidate: candidate(), staffAvailable: 2,
    bookings: [{ id: 'other', status: 'confirmed', ...candidate({ eventStartTime: '20:30', eventEndTime: '23:00' }) }]
  });
  assert.equal(result.result, 'unavailable');
  assert.equal(result.conflicts[0].severity, 'hard');
});

test('tentative overlap is conditional', () => {
  const result = evaluateAvailability({
    candidate: candidate(), staffAvailable: 2,
    bookings: [{ id: 'other', status: 'tentative', ...candidate({ eventStartTime: '20:30', eventEndTime: '23:00' }) }]
  });
  assert.equal(result.result, 'conditional');
  assert.equal(result.conflicts[0].severity, 'soft');
});

test('released bookings do not block availability', () => {
  const result = evaluateAvailability({
    candidate: candidate(), staffAvailable: 2,
    bookings: [{ id: 'old', status: 'released', ...candidate() }]
  });
  assert.equal(result.result, 'available');
});

test('availability excludes the booking being rechecked', () => {
  const result = evaluateAvailability({
    candidate: candidate(), excludeBookingId: 'same', staffAvailable: 2,
    bookings: [{ id: 'same', status: 'confirmed', ...candidate() }]
  });
  assert.equal(result.result, 'available');
});

test('blocked date and personal busy block are hard conflicts', () => {
  const window = deriveWindow(candidate());
  const result = evaluateAvailability({
    candidate: candidate(), staffAvailable: 2,
    blockedDates: [{ date: '2027-08-07', active: true }],
    busyBlocks: [{ source: 'maddie_icloud', startsAt: window.serviceStartAt, endsAt: window.serviceEndAt }]
  });
  assert.equal(result.result, 'unavailable');
  assert.equal(result.conflicts.length, 2);
  assert.equal(result.conflicts[1].privacyLabel, 'Busy');
});

test('missing service time and stale sync are conditional rather than available', () => {
  const result = evaluateAvailability({ candidate: candidate({ eventStartTime: '', eventEndTime: '' }), calendarSyncStale: true });
  assert.equal(result.result, 'conditional');
  assert.equal(result.requiresDecision, true);
  assert.equal(result.assumptions.length, 3);
});

test('missing mandatory external calendar never reports available', () => {
  const result = evaluateAvailability({ candidate: candidate(), staffAvailable: 2, mandatoryCalendarMissing: true });
  assert.equal(result.result, 'conditional');
  assert.match(result.assumptions.join(' '), /mandatory external availability calendar/);
});

test('insufficient staff is unavailable and unknown staffing is conditional', () => {
  assert.equal(evaluateAvailability({ candidate: candidate(), staffAvailable: 1 }).result, 'unavailable');
  assert.equal(evaluateAvailability({ candidate: candidate() }).result, 'conditional');
});

test('10 percent deposit and document IDs are deterministic', () => {
  assert.deepEqual(quoteDeposit({ total: 792 }), { total: 792, depositPct: 10, depositAmount: 79.2 });
  assert.deepEqual(quoteDeposit({ total: 916.67 }), { total: 916.67, depositPct: 10, depositAmount: 91.67 });
  assert.equal(bookingIdForQuote('abc'), 'quote_abc');
  assert.equal(derivedId('quote_abc'), 'booking_quote_abc');
});

test('accepted quote requires positive finite frozen total', () => {
  const frozen = { status: 'accepted', sentAt: new Date(), lockedAt: new Date(), total: 792 };
  assert.equal(validateAcceptedQuote(frozen).depositAmount, 79.2);
  assert.throws(() => validateAcceptedQuote({ ...frozen, total: 0 }), /greater than zero/);
  assert.throws(() => validateAcceptedQuote({ ...frozen, total: Infinity }), /finite/);
  assert.throws(() => validateAcceptedQuote({ ...frozen, sentAt: null }), /frozen/);
  assert.throws(() => validateAcceptedQuote({ ...frozen, pricingSnapshot: { revenue: { total: 900 } } }), /does not match/);
});

test('staffRequired derives from the real frozen saved quote schema', () => {
  const modernSavedQuote = {
    status: 'accepted', total: 916.67, lockedAt: new Date(), sentAt: new Date(),
    pricingModelVersion: 'deterministic-v1',
    pricingScope: { bartenders: 2, serviceHours: 4 },
    pricingAssumptions: { bartenders: 2, suggestedBartenders: 2 },
    pricingSnapshot: {
      costs: { labor: 400, operatingCost: 550 },
      revenue: { total: 916.67, deposit: 91.667 },
      profit: { dollars: 366.67 }
    },
    lineItems: { bartenders: 2, bartenderPay: 200, supplies: 150, travel: 0 }
  };
  assert.deepEqual(deriveStaffRequiredFromQuote(modernSavedQuote), {
    staffRequired: 2, source: 'pricingAssumptions.bartenders'
  });
  assert.deepEqual(deriveStaffRequiredFromQuote({ lineItems: { bartenders: 3 } }), {
    staffRequired: 3, source: 'lineItems.bartenders'
  });
  assert.throws(() => deriveStaffRequiredFromQuote({ staffRequired: 9 }), /frozen bartender count/);
});

test('staffing is server-derived, deduped, and reduced by busy windows', () => {
  const window = deriveWindow(candidate());
  const staffing = deriveServerStaffing(
    candidate({ assignedStaffIds: ['maddie', 'maddie', 'kendell'] }),
    [{ id: 'maddie', status: 'Active' }, { id: 'kendell', status: 'Active' }, { id: 'old', status: 'Inactive' }],
    [{ ownerUid: 'maddie', startsAt: window.serviceStartAt, endsAt: window.serviceEndAt }],
    window
  );
  assert.deepEqual(staffing.assignedStaffIds, ['maddie', 'kendell']);
  assert.equal(staffing.staffAvailable, 1);
});
