'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const { createBookingCalendar, derivedId } = require('../booking-calendar');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is required; run npm run test:emulator:ci.');
{
  const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: 'lake-salt-booking-test' });
  const db = app.firestore();
  const calendar = createBookingCalendar({ db, admin });
  const stamp = value => admin.firestore.Timestamp.fromDate(value);

  async function clear() {
    const collections = await db.listCollections();
    await Promise.all(collections.map(collection => db.recursiveDelete(collection)));
  }

  async function configureAvailability() {
    await Promise.all([
      db.collection('calendar_connections').doc('required').set({ mandatory: true, enabled: true, lastSuccessfulSyncAt: stamp(new Date()) }),
      db.collection('bartenders').doc('maddie').set({ status: 'Active' }),
      db.collection('bartenders').doc('kendell').set({ status: 'Active' })
    ]);
  }

  test.beforeEach(async () => { await clear(); await configureAvailability(); });
  test.after(async () => { await clear(); await app.delete(); });

  test('accepted quote through cancellation preserves finances and payment history', async () => {
    const quote = {
      status: 'accepted', sentAt: new Date(), lockedAt: new Date(), total: 792,
      leadId: 'lead-alisa', leadName: 'Alisa', eventType: 'Wedding', eventDate: '2027-08-07',
      eventStartTime: '17:00', eventEndTime: '21:00', venue: 'Mill Pond Farms',
      pricingModelVersion: 'deterministic-v1', pricingScope: { bartenders: 2 }, pricingAssumptions: { bartenders: 2 },
      pricingSnapshot: { revenue: { total: 792 }, costs: { labor: 400 }, profit: { dollars: 392 } },
      lineItems: { bartenders: 2, bartenderPay: 200, supplies: 150, travel: 0 },
      assignedStaffIds: ['maddie', 'maddie', 'kendell']
    };
    await db.collection('leads').doc('lead-alisa').set({ stage: 'Booked-Tentative', name: 'Alisa' });
    const first = await calendar.createTentativeFromAcceptedQuote({ quoteId: 'alisa', quote });
    const replay = await calendar.createTentativeFromAcceptedQuote({ quoteId: 'alisa', quote });
    assert.equal(first.idempotent, false);
    assert.equal(replay.idempotent, true);
    const tentative = (await db.collection('bookings').doc('quote_alisa').get()).data();
    assert.equal(tentative.assignedStaffIds.length, 2);
    assert.equal(tentative.staffRequired, 2);
    assert.equal(tentative.staffRequiredSource, 'pricingAssumptions.bartenders');

    await assert.rejects(calendar.confirmBooking({ bookingId: 'quote_alisa', confirmedBy: 'owner@example.com' }), /explicit attestation/);
    await calendar.confirmBooking({
      bookingId: 'quote_alisa', confirmedBy: 'owner@example.com',
      manualPaymentAttestation: { confirmed: true, paidAmount: 79.20, paymentReference: 'cash-001', reason: 'Deposit observed in business account.' }
    });
    const confirmed = (await db.collection('bookings').doc('quote_alisa').get()).data();
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(confirmed.deposit.verification, 'manual_attestation');
    assert.equal((await db.collection('bookings').doc('quote_alisa').collection('payment_history').get()).size, 1);

    await calendar.syncDerivedRecords('quote_alisa', confirmed);
    const eventRef = db.collection('events').doc(derivedId('quote_alisa'));
    await eventRef.update({ revenue: 1234, supplyCosts: 321 });
    await calendar.syncDerivedRecords('quote_alisa', confirmed);
    const event = (await eventRef.get()).data();
    assert.equal(event.revenue, 1234);
    assert.equal(event.supplyCosts, 321);
    await assert.rejects(calendar.releaseBooking('quote_alisa', 'wrong path'), /must use cancellation/);

    await calendar.cancelConfirmedBooking({ bookingId: 'quote_alisa', reason: 'Client cancelled.', cancelledBy: 'owner@example.com' });
    const cancelled = (await db.collection('bookings').doc('quote_alisa').get()).data();
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.deposit.paidAmount, 79.2);
    assert.equal((await db.collection('leads').doc('lead-alisa').get()).data().stage, 'Lost');
    assert.equal((await eventRef.get()).data().revenue, 1234);
    assert.equal((await eventRef.get()).data().status, 'Cancelled');
  });

  test('missing mandatory calendar is conditional and tentative release is coherent', async () => {
    await db.collection('calendar_connections').doc('required').delete();
    const result = await calendar.checkAvailability({
      eventDate: '2027-12-22', eventStartTime: '16:00', eventEndTime: '20:00', staffRequired: 1
    });
    assert.equal(result.result, 'conditional');

    await db.collection('bookings').doc('manual_hold').set({ status: 'tentative', eventDate: '2027-12-22', version: 1 });
    await calendar.releaseBooking('manual_hold', 'client_declined');
    assert.equal((await db.collection('bookings').doc('manual_hold').get()).data().status, 'released');
  });

  test('system issue preserves firstSeenAt and appends observations', async () => {
    await calendar.recordSystemIssue('same-problem', 'Problem', 'First observation', { safeReference: 'bookings/a' });
    const first = (await db.collection('system_issues').doc('same-problem').get()).data();
    await new Promise(resolve => setTimeout(resolve, 5));
    await calendar.recordSystemIssue('same-problem', 'Problem', 'Second observation', { safeReference: 'bookings/a' });
    const second = (await db.collection('system_issues').doc('same-problem').get()).data();
    assert.equal(first.firstSeenAt.toMillis(), second.firstSeenAt.toMillis());
    assert.equal(second.occurrenceCount, 2);
    assert.equal((await db.collection('system_issues').doc('same-problem').collection('observations').get()).size, 2);
  });
}
