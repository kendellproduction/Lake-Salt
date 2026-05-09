/* Use v2 (Gen 2) — required because Cloud Run services already exist with
 * these names and can't be migrated back to Gen 1. v2 callable handlers
 * receive a single `request` parameter with `.data`, `.auth`, etc. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/* ─── Configuration ───────────────────────────────────────────────────────── */
const TIMEZONE_OFFSET_HOURS = -6;            // America/Denver, ignoring DST for slot math
const CALL_DURATION_MINUTES = 15;
const CALL_WINDOW_DAYS = 14;                 // bride must book within 14 days of submitting
const CAMPAIGN_TAG_DEFAULT = 'WeddingExpo2026-05-09';

/* Default availability — weekdays 5:00 PM to 7:30 PM Mountain.
 * Each entry is local-time hour-min pairs, repeating Mon-Fri.
 * Phase 2: read this from Firestore so Kendell can edit without a deploy. */
const SLOT_HOURS = [
  { h: 17, m:  0 }, { h: 17, m: 15 }, { h: 17, m: 30 }, { h: 17, m: 45 },
  { h: 18, m:  0 }, { h: 18, m: 15 }, { h: 18, m: 30 }, { h: 18, m: 45 },
  { h: 19, m:  0 }, { h: 19, m: 15 },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

/* Treat the user's input as local Mountain time for display, but persist as
 * UTC ISO for unambiguous storage. Slot start/end are stored as Firestore
 * Timestamps (admin.firestore.Timestamp). Daylight-saving math is approximated
 * — the booth runs in MDT, so a fixed -6 offset is fine for the call-window
 * (May 6 → May 23 2026 is fully MDT). Phase 2 hardens this. */
function localToUtcDate(yyyymmdd, h, m) {
  const [Y, M, D] = yyyymmdd.split('-').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h - TIMEZONE_OFFSET_HOURS, m, 0));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function isWeekday(date) {
  /* Mon=1 ... Fri=5, in UTC. Approximation that's correct for our slot hours. */
  const dow = date.getUTCDay();
  return dow >= 1 && dow <= 5;
}

/* Admin-only guard — accepts the v2 request object (request.auth). */
async function requireAdmin(request) {
  const auth = request && request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Sign-in required.');
  }
  const doc = await db.collection('admins').doc(auth.uid).get();
  if (!doc.exists) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
  return { uid: auth.uid, email: auth.token && auth.token.email, name: doc.data().name || '' };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PUBLIC: get available call slots
 * - No auth required (public booking page calls this).
 * - Returns 15-min call slots over the next CALL_WINDOW_DAYS, weekdays,
 *   5:00–7:30 PM Mountain, minus slots that already have a call_bookings doc.
 * ══════════════════════════════════════════════════════════════════════════ */
exports.getCallSlots = onCall(async (request) => {
  const data = (request && request.data) || {};
  const daysAhead = Math.min(Math.max(parseInt(data && data.daysAhead, 10) || CALL_WINDOW_DAYS, 1), 30);

  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  /* Fetch every booked slot in the window once. */
  const bookedSnap = await db.collection('call_bookings')
    .where('slotStart', '>=', admin.firestore.Timestamp.fromDate(now))
    .where('slotStart', '<=', admin.firestore.Timestamp.fromDate(cutoff))
    .get();
  const bookedSet = new Set(bookedSnap.docs.map(d => d.data().slotStart.toMillis()));

  const slots = [];
  const cursor = new Date(now);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor < cutoff) {
    if (isWeekday(cursor)) {
      const dateStr = ymd(cursor);
      for (const t of SLOT_HOURS) {
        const slotStart = localToUtcDate(dateStr, t.h, t.m);
        if (slotStart <= now) continue;
        if (slotStart >= cutoff) continue;
        if (bookedSet.has(slotStart.getTime())) continue;
        slots.push({
          startISO: slotStart.toISOString(),
          startMs: slotStart.getTime(),
          dateStr,
          hour12: t.h > 12 ? t.h - 12 : t.h,
          minute: t.m,
          ampm: t.h >= 12 ? 'PM' : 'AM',
        });
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { success: true, slots };
});

/* ═══════════════════════════════════════════════════════════════════════════
 * PUBLIC: book a call slot
 * - No auth required.
 * - Atomic Firestore transaction prevents two callers from booking the same slot.
 * - Creates `call_bookings` doc + `leads` doc + `kendell_followups` reminder.
 * ══════════════════════════════════════════════════════════════════════════ */
exports.bookCallSlot = onCall(async (request) => {
  const data = (request && request.data) || {};
  const {
    name = '',
    email = '',
    phone = '',
    slotStartMs,
    /* Event-detail fields collected by /book wizard: */
    eventType = 'Wedding',
    eventDate = '',
    guestCount = '',
    venue = '',
    drinks = [],
    drinkDetail = '',
    budget = '',
    hasBuiltInBar = '',
    notes = '',
    instagramFollowed = false,
    raffleEntered = false,
    /* Provenance: */
    campaign = CAMPAIGN_TAG_DEFAULT,
    source = 'Public /book',
    capturedByEmail = '',          // optional: bartender email if signed in
    capturedByName = '',
  } = data;

  /* Required-field validation. */
  if (!name.trim() || !email.trim() || !phone.trim()) {
    throw new HttpsError('invalid-argument', 'Name, email, and phone are required.');
  }
  if (!slotStartMs || typeof slotStartMs !== 'number') {
    throw new HttpsError('invalid-argument', 'A valid slotStartMs is required.');
  }

  const slotStartDate = new Date(slotStartMs);
  if (isNaN(slotStartDate.getTime()) || slotStartDate <= new Date()) {
    throw new HttpsError('invalid-argument', 'Slot must be in the future.');
  }

  const slotStartTs = admin.firestore.Timestamp.fromDate(slotStartDate);
  const slotEndDate = new Date(slotStartMs + CALL_DURATION_MINUTES * 60 * 1000);

  /* Atomic check-and-book transaction. */
  const result = await db.runTransaction(async (tx) => {
    /* Look for any existing booking with this exact slotStart. */
    const conflictSnap = await tx.get(
      db.collection('call_bookings').where('slotStart', '==', slotStartTs).limit(1)
    );
    if (!conflictSnap.empty) {
      throw new HttpsError(
        'failed-precondition',
        'That slot was just booked by someone else. Please pick another.'
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const callRef = db.collection('call_bookings').doc();
    const leadRef = db.collection('leads').doc();
    const followupRef = db.collection('kendell_followups').doc();

    const callPayload = {
      slotStart: slotStartTs,
      slotEnd: admin.firestore.Timestamp.fromDate(slotEndDate),
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      eventType,
      eventDate,
      guestCount,
      venue,
      drinks,
      drinkDetail,
      budget,
      hasBuiltInBar,
      notes,
      campaign,
      source,
      leadId: leadRef.id,
      status: 'scheduled',
      createdAt: now,
    };

    const leadPayload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      eventDate,
      eventType,
      guestCount,
      venue,
      drinks,
      drinkDetail,
      budget,
      hasBuiltInBar,
      message: notes,
      stage: 'Call Scheduled',
      source,
      campaign,
      instagramFollowed,
      raffleEntered,
      callBookingId: callRef.id,
      callSlot: slotStartTs,
      capturedByEmail,
      capturedByName,
      createdAt: now,
      updatedAt: now,
    };

    const followupPayload = {
      leadId: leadRef.id,
      leadName: name.trim(),
      leadEmail: email.trim(),
      leadPhone: phone.trim(),
      type: 'prep_for_quote_call',
      callSlot: slotStartTs,
      dueAt: admin.firestore.Timestamp.fromDate(
        new Date(slotStartMs - 30 * 60 * 1000) /* 30 min before the call */
      ),
      completed: false,
      createdAt: now,
      notes: 'Review lead details, prep custom quote ranges before the 15-min call.',
    };

    tx.set(callRef, callPayload);
    tx.set(leadRef, leadPayload);
    tx.set(followupRef, followupPayload);

    return { callBookingId: callRef.id, leadId: leadRef.id };
  });

  return {
    success: true,
    leadId: result.leadId,
    callBookingId: result.callBookingId,
    slotStartISO: slotStartDate.toISOString(),
  };
});

/* ═══════════════════════════════════════════════════════════════════════════
 * PUBLIC: save lead without booking a call
 * - For the "Just send me wedding info" path on /book.
 * ══════════════════════════════════════════════════════════════════════════ */
exports.savePublicLead = onCall(async (request) => {
  const data = (request && request.data) || {};
  const {
    name = '',
    email = '',
    phone = '',
    eventType = 'Wedding',
    eventDate = '',
    guestCount = '',
    venue = '',
    drinks = [],
    drinkDetail = '',
    budget = '',
    hasBuiltInBar = '',
    notes = '',
    instagramFollowed = false,
    raffleEntered = false,
    campaign = CAMPAIGN_TAG_DEFAULT,
    source = 'Public /book — info only',
    capturedByEmail = '',
    capturedByName = '',
  } = data;

  if (!name.trim() || !email.trim()) {
    throw new HttpsError('invalid-argument', 'Name and email are required.');
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const leadRef = await db.collection('leads').add({
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    eventDate,
    eventType,
    guestCount,
    venue,
    drinks,
    drinkDetail,
    budget,
    hasBuiltInBar,
    message: notes,
    stage: 'New Lead',
    source,
    campaign,
    instagramFollowed,
    raffleEntered,
    capturedByEmail,
    capturedByName,
    createdAt: now,
    updatedAt: now,
  });

  return { success: true, leadId: leadRef.id };
});

/* ═══════════════════════════════════════════════════════════════════════════
 * STAFF-ONLY: manual date-lock override
 * - For the rare case Kendell wants to lock a wedding date AFTER the call
 *   (e.g., quote accepted on the call). Just Firestore — no calendar.
 * ══════════════════════════════════════════════════════════════════════════ */
exports.markBooked = onCall(async (request) => {
  const adminUser = await requireAdmin(request);
  const data = (request && request.data) || {};
  const { leadId, eventDate, depositAmount = 100, depositDays = 14 } = data;

  if (!leadId || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new HttpsError('invalid-argument', 'leadId + eventDate (YYYY-MM-DD) required.');
  }

  /* Atomic date-conflict check inside transaction. */
  const result = await db.runTransaction(async (tx) => {
    const conflictSnap = await tx.get(
      db.collection('leads')
        .where('eventDate', '==', eventDate)
        .where('stage', 'in', ['Booked-Tentative', 'Booked', 'Completed'])
    );
    const conflicts = conflictSnap.docs.filter(d => d.id !== leadId);
    if (conflicts.length) {
      throw new HttpsError(
        'failed-precondition',
        `Date already taken by ${conflicts[0].data().name || 'another lead'}.`
      );
    }

    const leadRef = db.collection('leads').doc(leadId);
    const leadDoc = await tx.get(leadRef);
    if (!leadDoc.exists) {
      throw new HttpsError('not-found', 'Lead not found.');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const depositDueAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + depositDays * 24 * 60 * 60 * 1000)
    );

    tx.update(leadRef, {
      stage: 'Booked-Tentative',
      eventDate,
      dateLocked: now,
      depositDueAt,
      depositAmount,
      lockedBy: adminUser.email,
      lockedByName: adminUser.name,
      updatedAt: now,
    });

    /* Create deposit followup. */
    const followupRef = db.collection('kendell_followups').doc();
    tx.set(followupRef, {
      leadId,
      leadName: leadDoc.data().name || '',
      leadEmail: leadDoc.data().email || '',
      leadPhone: leadDoc.data().phone || '',
      eventDate,
      type: 'send_chase_deposit_invoice',
      amount: depositAmount,
      dueAt: depositDueAt,
      completed: false,
      createdAt: now,
      notes: `Send $${depositAmount} deposit invoice via Chase QuickPay.`,
    });

    return { leadId, depositDueAt: depositDueAt.toMillis() };
  });

  return { success: true, ...result };
});
