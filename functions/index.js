/* Use v2 (Gen 2) — required because Cloud Run services already exist with
 * these names and can't be migrated back to Gen 1. v2 callable handlers
 * receive a single `request` parameter with `.data`, `.auth`, etc. */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/* ─── Configuration ───────────────────────────────────────────────────────── */
const TIMEZONE_OFFSET_HOURS = -6;            // America/Denver, ignoring DST for slot math
const CALL_DURATION_MINUTES = 15;
const CALL_WINDOW_DAYS = 14;                 // bride must book within 14 days of submitting
const CAMPAIGN_TAG_DEFAULT = 'WeddingExpo2026-05-09';

/* Lake Salt can run up to two weddings on the same date (one team, half-day
 * each — afternoon and evening). Beyond this the date is fully booked. */
const MAX_EVENTS_PER_DAY = 2;

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
/* ─── Daily follow-up scan ────────────────────────────────────────────────
 * Turns the dormant `followUpDate` field into real, visible reminders. Runs
 * every morning: any lead whose follow-up date has arrived (and isn't already
 * Booked/Completed/Lost) gets a `kendell_followups` entry — surfaced on the
 * dashboard alerts strip. Idempotent: skips a lead that already has an open
 * follow-up reminder of this type, so re-runs never duplicate. */
exports.dailyFollowupScan = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Denver' },
  async () => {
    const today = ymd(new Date());
    const snap = await db.collection('leads')
      .where('followUpDate', '<=', today).get();

    let created = 0;
    for (const doc of snap.docs) {
      const lead = doc.data();
      if (!lead.followUpDate) continue;                       // skip empty strings
      if (['Booked', 'Completed', 'Lost'].includes(lead.stage)) continue;

      const existing = await db.collection('kendell_followups')
        .where('leadId', '==', doc.id)
        .where('type', '==', 'followup_due')
        .where('status', '==', 'open').limit(1).get();
      if (!existing.empty) continue;

      await db.collection('kendell_followups').add({
        type: 'followup_due',
        leadId: doc.id,
        leadName: lead.name || 'lead',
        title: `⏰ Follow up with ${lead.name || 'this lead'} (due ${lead.followUpDate})`,
        notes: `${lead.eventType || 'Event'}${lead.eventDate ? ' · ' + lead.eventDate : ''} — reach out; the follow-up date has arrived.`,
        status: 'open',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      created++;
    }
    console.log(`dailyFollowupScan created ${created} follow-up reminders`);
    return null;
  }
);

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

  /* Atomic check-and-book transaction.
   * All reads MUST happen before writes (Firestore transaction rule). */
  const result = await db.runTransaction(async (tx) => {
    /* READ 1: Look for any existing booking with this exact slotStart. */
    const conflictSnap = await tx.get(
      db.collection('call_bookings').where('slotStart', '==', slotStartTs).limit(1)
    );
    if (!conflictSnap.empty) {
      throw new HttpsError(
        'failed-precondition',
        'That slot was just booked by someone else. Please pick another.'
      );
    }

    /* READ 2: Look for an existing lead with this email — so we don't
     * duplicate the raffle/info-only lead. If found, we'll append to it
     * instead of creating a new one. */
    let existingLeadRef = null;
    let existingLeadData = null;
    if (email && email.trim()) {
      const existing = await tx.get(
        db.collection('leads').where('email', '==', email.trim()).limit(1)
      );
      if (!existing.empty) {
        existingLeadRef = existing.docs[0].ref;
        existingLeadData = existing.docs[0].data();
      }
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const callRef = db.collection('call_bookings').doc();
    const leadRef = existingLeadRef || db.collection('leads').doc();
    const followupRef = db.collection('kendell_followups').doc();

    /* Human-readable timeline note for the lead card. */
    const slotHuman = slotStartDate.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver'
    });
    const noteEntry = {
      text: '📞 Booked a 15-min call for ' + slotHuman + ' MT' +
            (eventDate ? ' · wedding ' + eventDate : '') +
            (guestCount ? ' · ' + guestCount : '') +
            (venue ? ' · ' + venue : ''),
      author: 'System',
      time: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    };

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

    if (existingLeadRef) {
      /* APPEND to existing lead — don't downgrade stage if already advanced,
       * don't overwrite fields that already have values. Add note + call link. */
      const existingNotes = Array.isArray(existingLeadData.notes) ? existingLeadData.notes : [];
      const ADVANCED_STAGES = ['Call Scheduled', 'Contacted', 'Proposal Sent', 'Booked-Tentative', 'Booked', 'Completed'];
      const currentStage = existingLeadData.stage || 'New Lead';
      const newStage = ADVANCED_STAGES.includes(currentStage) ? currentStage : 'Call Scheduled';

      const updatePayload = {
        stage: newStage,
        callBookingId: callRef.id,
        callSlot: slotStartTs,
        /* Only fill empty fields — never overwrite existing ones */
        eventDate: existingLeadData.eventDate || eventDate,
        eventType: existingLeadData.eventType || eventType,
        guestCount: existingLeadData.guestCount || guestCount,
        venue: existingLeadData.venue || venue,
        drinks: (existingLeadData.drinks && existingLeadData.drinks.length) ? existingLeadData.drinks : drinks,
        drinkDetail: existingLeadData.drinkDetail || drinkDetail,
        budget: existingLeadData.budget || budget,
        hasBuiltInBar: existingLeadData.hasBuiltInBar || hasBuiltInBar,
        /* Append note to existing notes array */
        notes: [...existingNotes, noteEntry],
        lastContactedAt: now,
        updatedAt: now,
      };
      tx.update(existingLeadRef, updatePayload);
    } else {
      /* CREATE new lead with the call info + first note */
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
        notes: [noteEntry],
        createdAt: now,
        updatedAt: now,
      };
      tx.set(leadRef, leadPayload);
    }

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
    tx.set(followupRef, followupPayload);

    return {
      callBookingId: callRef.id,
      leadId: leadRef.id,
      mergedIntoExistingLead: !!existingLeadRef,
    };
  });

  return {
    success: true,
    leadId: result.leadId,
    callBookingId: result.callBookingId,
    mergedIntoExistingLead: result.mergedIntoExistingLead,
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

  const trimmedEmail = email.trim();
  const now = admin.firestore.FieldValue.serverTimestamp();

  /* Look for an existing lead with this email. If found, append a note to
   * their card instead of creating a duplicate. */
  let existingSnap = null;
  try {
    existingSnap = await db.collection('leads').where('email', '==', trimmedEmail).limit(1).get();
  } catch (e) { /* if the query fails for any reason, fall through to create */ }

  const noteEntry = {
    text: '📧 Submitted info-only form (' + source + ')' +
          (eventDate ? ' · wedding ' + eventDate : '') +
          (guestCount ? ' · ' + guestCount : ''),
    author: 'System',
    time: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  };

  if (existingSnap && !existingSnap.empty) {
    /* APPEND to existing lead — don't downgrade stage, don't overwrite filled fields */
    const doc = existingSnap.docs[0];
    const existing = doc.data();
    const existingNotes = Array.isArray(existing.notes) ? existing.notes : [];
    await doc.ref.update({
      /* Only fill empty fields */
      eventDate: existing.eventDate || eventDate,
      eventType: existing.eventType || eventType,
      guestCount: existing.guestCount || guestCount,
      venue: existing.venue || venue,
      drinks: (existing.drinks && existing.drinks.length) ? existing.drinks : drinks,
      drinkDetail: existing.drinkDetail || drinkDetail,
      budget: existing.budget || budget,
      hasBuiltInBar: existing.hasBuiltInBar || hasBuiltInBar,
      message: existing.message || notes,
      phone: existing.phone || phone.trim(),
      /* Append note + bump timestamps */
      notes: [...existingNotes, noteEntry],
      updatedAt: now,
      lastContactedAt: now,
    });
    return { success: true, leadId: doc.id, mergedIntoExistingLead: true };
  }

  /* CREATE new lead */
  const leadRef = await db.collection('leads').add({
    name: name.trim(),
    email: trimmedEmail,
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
    notes: [noteEntry],
    createdAt: now,
    updatedAt: now,
  });

  return { success: true, leadId: leadRef.id, mergedIntoExistingLead: false };
});

/* ═══════════════════════════════════════════════════════════════════════════
 * STAFF-ONLY: manual date-lock override
 * - For the rare case Kendell wants to lock a wedding date AFTER the call
 *   (e.g., quote accepted on the call). Just Firestore — no calendar.
 * ══════════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════════
 * STAFF-ONLY: get capacity status for a date
 * - Returns { count, capacity, status } where status is one of:
 *     'open'  → 0 / 2
 *     'half'  → 1 / 2
 *     'full'  → 2 / 2
 * - Lists which leads occupy the slots so the CRM can show who they are.
 * ══════════════════════════════════════════════════════════════════════════ */
exports.getDateCapacity = onCall(async (request) => {
  await requireAdmin(request);
  const data = (request && request.data) || {};
  const { date } = data;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError('invalid-argument', 'date must be YYYY-MM-DD');
  }

  const snap = await db.collection('leads')
    .where('eventDate', '==', date)
    .where('stage', 'in', ['Booked-Tentative', 'Booked', 'Completed'])
    .get();

  const occupants = snap.docs.map(d => ({
    leadId: d.id,
    name: d.data().name || '',
    eventType: d.data().eventType || '',
    stage: d.data().stage,
  }));

  const status = occupants.length === 0 ? 'open'
              : occupants.length < MAX_EVENTS_PER_DAY ? 'half'
              : 'full';

  return {
    success: true,
    date,
    count: occupants.length,
    capacity: MAX_EVENTS_PER_DAY,
    status,
    occupants,
  };
});

exports.markBooked = onCall(async (request) => {
  const adminUser = await requireAdmin(request);
  const data = (request && request.data) || {};
  const { leadId, eventDate, depositAmount = 100, depositDays = 14 } = data;

  if (!leadId || !eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new HttpsError('invalid-argument', 'leadId + eventDate (YYYY-MM-DD) required.');
  }

  /* Atomic date-conflict check inside transaction.
   * Allow up to MAX_EVENTS_PER_DAY (2) weddings on the same date so we can
   * run a half-day-afternoon + half-day-evening pairing. */
  const result = await db.runTransaction(async (tx) => {
    const conflictSnap = await tx.get(
      db.collection('leads')
        .where('eventDate', '==', eventDate)
        .where('stage', 'in', ['Booked-Tentative', 'Booked', 'Completed'])
    );
    const others = conflictSnap.docs.filter(d => d.id !== leadId);
    if (others.length >= MAX_EVENTS_PER_DAY) {
      const names = others.slice(0, MAX_EVENTS_PER_DAY).map(d => d.data().name || 'another lead').join(' & ');
      throw new HttpsError(
        'failed-precondition',
        `Date fully booked (${MAX_EVENTS_PER_DAY}/${MAX_EVENTS_PER_DAY} weddings already): ${names}.`
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


/* ═════════════════════════════════════════════════════════════════════════
   onQuoteAccepted — runs when a client accepts their public proposal.
   The public-page write only touches the quote doc (rules don't allow
   unauthenticated writes to leads or activity). This trigger picks up
   that quote.update, advances the linked lead's stage, and writes an
   activity entry so the dashboard surfaces it.
   ───────────────────────────────────────────────────────────────────────── */
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');

exports.onQuoteAccepted = onDocumentUpdated('quotes/{quoteId}', async (event) => {
  const before = event.data?.before?.data() || {};
  const after  = event.data?.after?.data()  || {};

  /* Only act on the transition: was NOT accepted before → IS accepted now. */
  const wasAccepted = !!before.clientAcceptedAt;
  const nowAccepted = !!after.clientAcceptedAt;
  if (wasAccepted || !nowAccepted) return null;

  const quoteId  = event.params.quoteId;
  const leadId   = after.leadId;
  const leadName = after.leadName || 'a client';
  const sig      = after.clientAcceptedSignature || 'client';
  const total    = after.total || 0;

  /* Record the win on the quote itself (for win/loss analytics). Safe against
   * re-trigger: the guard above returns early once the quote is already accepted. */
  try {
    await event.data.after.ref.update({
      outcome: 'won',
      wonAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('Failed to set quote outcome=won:', e);
  }

  /* Advance the linked lead's stage. Booked-Tentative is the right stop:
   * the client has signed off on the quote, but the deposit isn't paid yet
   * — that's what bumps it to fully Booked. */
  if (leadId) {
    try {
      await db.collection('leads').doc(leadId).update({
        stage: 'Booked-Tentative',
        latestQuoteStatus: 'accepted',
        latestQuoteAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        latestQuoteAcceptedBy: sig,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to advance lead stage on quote accept:', e);
    }
  }

  /* Activity log — visible on the admin dashboard's recent-activity feed. */
  try {
    await db.collection('activity').add({
      action: 'quote_accepted',
      collection: 'quotes',
      docId: quoteId,
      summary: `🎉 ${leadName} ACCEPTED the proposal — $${Math.round(total).toLocaleString('en-US')} (signed: ${sig})`,
      userId: 'client',
      userName: sig,
      metadata: { leadId, total, signature: sig },
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('Failed to write activity entry on quote accept:', e);
  }

  /* Owner notification — high-visibility "needs Kendell's attention" entry
   * in the kendell_followups collection (already surfaced in the admin UI). */
  if (leadId) {
    try {
      await db.collection('kendell_followups').add({
        type: 'quote_accepted',
        leadId,
        leadName,
        title: `🎉 ${leadName} accepted their quote — send deposit invoice`,
        notes: `Quote accepted by ${sig} for $${Math.round(total).toLocaleString('en-US')}. Send the 30% deposit invoice to lock the date.`,
        status: 'open',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to create owner followup on quote accept:', e);
    }
  }

  return null;
});
