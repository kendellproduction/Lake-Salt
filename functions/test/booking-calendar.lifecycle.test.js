'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBookingCalendar, derivedId } = require('../booking-calendar');
const { FakeFirestore, FakeTimestamp, fakeAdmin } = require('./helpers/fake-firestore');

async function fixture() {
  const db = new FakeFirestore();
  const calendar = createBookingCalendar({ db, admin: fakeAdmin });
  await db.collection('calendar_connections').doc('required').set({ mandatory: true, enabled: true, lastSuccessfulSyncAt: FakeTimestamp.fromDate(new Date()) });
  await db.collection('bartenders').doc('maddie').set({ status: 'Active' });
  await db.collection('bartenders').doc('kendell').set({ status: 'Active' });
  return { db, calendar };
}

function acceptedQuote() {
  return {
    status: 'accepted', sentAt: new Date(), lockedAt: new Date(), total: 792,
    leadId: 'alisa', leadName: 'Alisa', eventType: 'Wedding', eventDate: '2027-08-07',
    eventStartTime: '17:00', eventEndTime: '21:00', venue: 'Mill Pond Farms', staffRequired: 2,
    pricingModelVersion: 'deterministic-v1',
    pricingScope: { bartenders: 2 },
    pricingAssumptions: { bartenders: 2 },
    pricingSnapshot: { revenue: { total: 792 }, costs: { labor: 400 }, profit: { dollars: 392 } },
    lineItems: { bartenders: 2, bartenderPay: 200, supplies: 150, travel: 0 },
    assignedStaffIds: ['maddie', 'maddie', 'kendell']
  };
}

test('in-memory lifecycle is idempotent and preserves event finances through cancellation', async () => {
  const { db, calendar } = await fixture();
  await db.collection('leads').doc('alisa').set({ stage: 'Booked-Tentative', name: 'Alisa' });
  assert.equal((await calendar.createTentativeFromAcceptedQuote({ quoteId: 'alisa', quote: acceptedQuote() })).idempotent, false);
  assert.equal((await calendar.createTentativeFromAcceptedQuote({ quoteId: 'alisa', quote: acceptedQuote() })).idempotent, true);
  const hold = (await db.collection('bookings').doc('quote_alisa').get()).data();
  assert.deepEqual(hold.assignedStaffIds, ['maddie', 'kendell']);
  assert.equal(hold.staffRequired, 2);
  assert.equal(hold.staffRequiredSource, 'pricingAssumptions.bartenders');
  await assert.rejects(calendar.confirmBooking({ bookingId: 'quote_alisa', confirmedBy: 'kendell' }), /explicit attestation/);
  await calendar.confirmBooking({ bookingId: 'quote_alisa', confirmedBy: 'kendell', manualPaymentAttestation: {
    confirmed: true, paidAmount: 79.2, paymentReference: 'cash-1', reason: 'Observed in business account.'
  } });
  const confirmed = (await db.collection('bookings').doc('quote_alisa').get()).data();
  await calendar.syncDerivedRecords('quote_alisa', confirmed);
  const eventRef = db.collection('events').doc(derivedId('quote_alisa'));
  await eventRef.update({ revenue: 1200, supplyCosts: 300 });
  await calendar.syncDerivedRecords('quote_alisa', confirmed);
  assert.equal((await eventRef.get()).data().revenue, 1200);
  assert.equal((await eventRef.get()).data().supplyCosts, 300);
  await assert.rejects(calendar.releaseBooking('quote_alisa'), /must use cancellation/);
  await calendar.cancelConfirmedBooking({ bookingId: 'quote_alisa', reason: 'Client cancelled.', cancelledBy: 'kendell' });
  const cancelled = (await db.collection('bookings').doc('quote_alisa').get()).data();
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.deposit.paidAmount, 79.2);
  const lead = (await db.collection('leads').doc('alisa').get()).data();
  assert.equal(lead.stage, 'Lost');
  assert.equal(lead.bookingStatus, 'Cancelled');
  assert.equal((await db.collection('bookings').doc('quote_alisa').collection('payment_history').get()).size, 1);
});

test('issue observations append while firstSeenAt remains stable', async () => {
  const { db, calendar } = await fixture();
  await calendar.recordSystemIssue('same-problem', 'Problem', 'First');
  const first = (await db.collection('system_issues').doc('same-problem').get()).data();
  await calendar.recordSystemIssue('same-problem', 'Problem', 'Second');
  const second = (await db.collection('system_issues').doc('same-problem').get()).data();
  assert.equal(first.firstSeenAt.toMillis(), second.firstSeenAt.toMillis());
  assert.equal(second.occurrenceCount, 2);
  assert.equal((await db.collection('system_issues').doc('same-problem').collection('observations').get()).size, 2);
});
