/* Use v2 (Gen 2) — required because Cloud Run services already exist with
 * these names and can't be migrated back to Gen 1. v2 callable handlers
 * receive a single `request` parameter with `.data`, `.auth`, etc. */
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
/* googleapis is enormous — requiring it synchronously builds every Google API
 * surface and was hanging deploy discovery (>60s) and bloating cold starts.
 * This proxy defers the require to first actual use; require() caches after
 * that, so subsequent property hits are free. */
const google = new Proxy({}, {
  get: (_, prop) => require('googleapis').google[prop],
});

admin.initializeApp();
const db = admin.firestore();

/* ─── Communications Hub secrets (set by Kendell at deploy — NEVER hardcode) ──
 * TODO(deploy): set each of these via the Firebase CLI before the first run:
 *   firebase functions:secrets:set GMAIL_OAUTH_CLIENT_ID
 *   firebase functions:secrets:set GMAIL_OAUTH_CLIENT_SECRET
 *   firebase functions:secrets:set GMAIL_OAUTH_REFRESH_TOKEN
 * The refresh token comes from a one-time OAuth consent for the Lake Salt
 * mailbox with scope https://www.googleapis.com/auth/gmail.modify (see runbook).
 * ANTHROPIC_API_KEY is declared here too so P3 (aiComposeReply) can reuse it,
 * but it is NOT consumed in P1.                                              */
const GMAIL_OAUTH_CLIENT_ID     = defineSecret('GMAIL_OAUTH_CLIENT_ID');
const GMAIL_OAUTH_CLIENT_SECRET = defineSecret('GMAIL_OAUTH_CLIENT_SECRET');
const GMAIL_OAUTH_REFRESH_TOKEN = defineSecret('GMAIL_OAUTH_REFRESH_TOKEN');
const ANTHROPIC_API_KEY         = defineSecret('ANTHROPIC_API_KEY');

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

  /* Push to everyone — a signed quote is a money moment both should see. */
  try {
    await db.collection('notifications').add({
      title: `🎉 ${leadName} accepted their quote — $${Math.round(total).toLocaleString('en-US')}`,
      body: `Signed by ${sig}. Next step: send the 30% deposit invoice to lock the date.`,
      url: 'https://lakesalt.us/admin/#crm',
      tag: 'quote-accepted',
      audience: 'all',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('quote-accepted push failed:', e.message); }

  return null;
});


/* ═══════════════════════════════════════════════════════════════════════════
 * COMMUNICATIONS HUB — Phase 1 (read threads in the lead card)
 *
 * syncGmail (scheduled, every 1 min) mirrors the Lake Salt mailbox (INBOX +
 * SENT) into Firestore as readable threads under each lead's card. Gmail stays
 * the system of record; the CRM mirrors it. Doc id = Gmail message id, so every
 * write is idempotent (set/merge) and the poller can run as often as it likes.
 *
 * Auth model (locked by Kendell):
 *   PRIMARY  — OAuth refresh token in Secret Manager (default path).
 *   FALLBACK — Zapier Gmail connection (clean interface stub below; the Zapier
 *              relay drops raw Gmail message payloads into `gmail_inbound_raw`
 *              and syncGmail drains them when no OAuth secret is present).
 * ══════════════════════════════════════════════════════════════════════════ */

const GMAIL_SYNC_DOC = db.collection('settings').doc('gmail_sync');

/* Knot/WeddingPro proxy senders — replies MUST go back to the proxy address,
 * never the bride's real inbox. Used both to tag the channel and to trigger
 * body-parsing identity resolution. */
const { isAutomatedNonLead, outboundCandidates } = require('./sync-classify');
const BUSINESS_EMAIL = 'contact@lakesalt.us';
const KNOT_DOMAINS       = ['member.theknot.com', 'theknot.com', 'mail.theknot.com'];
const WEDDINGPRO_DOMAINS = ['weddingpro.com', 'member.weddingpro.com', 'mail.weddingwire.com', 'weddingwire.com'];

/* ─── Auth: build an authenticated Gmail client (OAuth primary) ─────────────
 * Returns { gmail, mode } where mode is 'oauth' | 'zapier' | null. When the
 * OAuth refresh token secret is absent we return mode 'zapier' so the caller
 * drains the fallback queue instead. NEVER logs secret values. */
function buildGmailClient() {
  const clientId     = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return { gmail: google.gmail({ version: 'v1', auth: oauth2 }), mode: 'oauth' };
  }
  /* TODO(deploy): if you stay on Zapier, point the Zap at the
   * `gmail_inbound_raw` collection (one doc per message, fields documented in
   * the runbook) — syncGmail will drain + normalize it below. */
  return { gmail: null, mode: 'zapier' };
}

/* ─── Body decode + server-side sanitization ──────────────────────────────── */

/* Recursively pull the first text/plain and text/html parts out of a Gmail
 * payload tree. Gmail base64url-encodes part bodies. */
function extractBodies(payload) {
  let text = '';
  let html = '';
  function walk(part) {
    if (!part) return;
    const mime = part.mimeType || '';
    const data = part.body && part.body.data;
    if (data) {
      const decoded = Buffer.from(data, 'base64').toString('utf-8');
      if (mime === 'text/plain' && !text) text = decoded;
      else if (mime === 'text/html' && !html) html = decoded;
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  }
  walk(payload);
  return { text, html };
}

/* Strip anything that could execute or exfiltrate when rendered in the admin
 * dashboard. Defense layer #1 (the client also escapes). Deliberately
 * conservative — removes <script>/<style>/<iframe>, event-handler attributes,
 * and javascript:/data: URLs. Not a full HTML5 parser, but the client treats
 * this as untrusted regardless. */
function sanitizeHtml(html) {
  if (!html) return '';
  let out = String(html);
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  out = out.replace(/<\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi, '');
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"');
  out = out.replace(/(href|src)\s*=\s*("|')\s*data:[^"']*\2/gi, '$1="#"');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  return out.trim();
}

/* Best-effort plain-text from HTML when Gmail gives us no text/plain part. */
function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\s*(script|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ─── Header helpers ──────────────────────────────────────────────────────── */
function headerMap(headers) {
  const m = {};
  (headers || []).forEach(h => { m[(h.name || '').toLowerCase()] = h.value || ''; });
  return m;
}

/* "Jane Smith <jane@email.com>" → { display:'Jane Smith', email:'jane@email.com' } */
function parseAddress(raw) {
  if (!raw) return { display: '', email: '' };
  const m = String(raw).match(/^\s*(?:"?([^"<]*?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (m) return { display: (m[1] || '').trim(), email: (m[2] || '').trim().toLowerCase() };
  return { display: '', email: String(raw).trim().toLowerCase() };
}

function splitAddresses(raw) {
  if (!raw) return [];
  /* Split on commas — good enough for header lists in this mailbox. */
  return String(raw).split(',').map(s => parseAddress(s).email).filter(Boolean);
}

function domainOf(email) {
  const at = String(email || '').lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

function channelForSender(fromEmail) {
  const d = domainOf(fromEmail);
  if (KNOT_DOMAINS.some(k => d === k || d.endsWith('.' + k))) return 'theknot';
  if (WEDDINGPRO_DOMAINS.some(k => d === k || d.endsWith('.' + k))) return 'weddingpro';
  return 'gmail';
}

/* ─── Knot / WeddingPro body parsing ──────────────────────────────────────── */

/* These platforms relay the bride through a proxy address and embed the real
 * lead details in the email body. Pull out a name / event date / phone so we
 * can match to an existing lead. Brittle by design — anything we can't confirm
 * falls through to unmatched_messages + a followup. */
function parseLeadDetailsFromBody(text) {
  const out = { name: '', eventDate: '', phone: '' };
  if (!text) return out;
  const body = String(text);

  const nameMatch =
    body.match(/(?:Name|From|Couple|Bride|Client)\s*[:\-]\s*([A-Za-z][A-Za-z.'\- ]{1,60})/i) ||
    body.match(/(?:message from|inquiry from)\s+([A-Za-z][A-Za-z.'\- ]{1,60})/i);
  if (nameMatch) out.name = nameMatch[1].trim().replace(/\s{2,}/g, ' ');

  const dateMatch =
    body.match(/(?:Event\s*Date|Wedding\s*Date|Date)\s*[:\-]\s*([A-Za-z0-9,\/\- ]{4,40})/i);
  if (dateMatch) out.eventDate = dateMatch[1].trim();

  const phoneMatch = body.match(/(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/);
  if (phoneMatch) out.phone = phoneMatch[1].replace(/[^\d]/g, '');

  return out;
}

/* ─── resolveLeadForMessage — 4-step identity resolution (spec §1) ──────────
 * Returns { leadId, leadRef, matchedBy } or { leadId:null } when no confident
 * match. NEVER throws — resolution failure must not stop the rest of the run. */
async function resolveLeadForMessage(msg) {
  /* STEP 1 — thread already mapped to a lead. */
  try {
    if (msg.gmailThreadId) {
      const snap = await db.collection('leads')
        .where('gmailThreadIds', 'array-contains', msg.gmailThreadId).limit(1).get();
      if (!snap.empty) {
        return { leadId: snap.docs[0].id, leadRef: snap.docs[0].ref, matchedBy: 'thread' };
      }
    }
  } catch (e) { console.warn('resolveLeadForMessage step1 failed:', e.message); }

  /* The addresses that might identify the human. For inbound that's `from`;
   * for outbound (SENT) it's every To/Cc recipient (minus our own mailbox). */
  const candidates = msg.direction === 'out'
    ? outboundCandidates(msg, [BUSINESS_EMAIL])
    : [String(msg.from || '').toLowerCase().trim()].filter(Boolean);

  /* STEP 2 — direct email match (primary email or a known alias). */
  for (const norm of candidates) {
    try {
      const byEmail = await db.collection('leads').where('email', '==', norm).limit(1).get();
      if (!byEmail.empty) {
        return { leadId: byEmail.docs[0].id, leadRef: byEmail.docs[0].ref, matchedBy: 'email' };
      }
      const byAlias = await db.collection('leads').where('emailAliases', 'array-contains', norm).limit(1).get();
      if (!byAlias.empty) {
        return { leadId: byAlias.docs[0].id, leadRef: byAlias.docs[0].ref, matchedBy: 'alias' };
      }
    } catch (e) { console.warn('resolveLeadForMessage step2 failed:', e.message); }
  }

  /* STEP 3 — Knot/WeddingPro proxy: parse the body for real identity, then
   * match by phone (strong) or name+date (weaker). */
  if (msg.sourceChannel === 'theknot' || msg.sourceChannel === 'weddingpro') {
    const parsed = parseLeadDetailsFromBody(msg.bodyText);
    try {
      if (parsed.phone && parsed.phone.length >= 10) {
        const all = await db.collection('leads').get();
        const hit = all.docs.find(d => {
          const p = String(d.data().phone || '').replace(/[^\d]/g, '');
          return p && p.slice(-10) === parsed.phone.slice(-10);
        });
        if (hit) return { leadId: hit.id, leadRef: hit.ref, matchedBy: 'knot-phone', parsed };
      }
      if (parsed.name) {
        const all = await db.collection('leads').get();
        const target = parsed.name.toLowerCase();
        const hit = all.docs.find(d => {
          const n = String(d.data().name || '').toLowerCase();
          if (!n || n !== target) return false;
          /* name+date is the confident combo; name alone is too weak. */
          if (parsed.eventDate) {
            const ed = String(d.data().eventDate || '').toLowerCase();
            return ed && ed.includes(parsed.eventDate.toLowerCase().slice(0, 6));
          }
          return false;
        });
        if (hit) return { leadId: hit.id, leadRef: hit.ref, matchedBy: 'knot-name-date', parsed };
      }
    } catch (e) { console.warn('resolveLeadForMessage step3 failed:', e.message); }
    return { leadId: null, parsed };
  }

  /* STEP 4 — no confident match. */
  return { leadId: null };
}

/* ─── Persist one normalized message (idempotent) ─────────────────────────── */
async function writeMessageToLead(leadRef, msg) {
  const threadRef  = leadRef.collection('threads').doc(msg.gmailThreadId);
  const messageRef = threadRef.collection('messages').doc(msg.gmailMessageId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const sentAtTs = msg.internalDateMs
    ? admin.firestore.Timestamp.fromMillis(msg.internalDateMs)
    : now;

  const batch = db.batch();

  /* Message doc — id = Gmail message id, merge so re-sync never duplicates. */
  batch.set(messageRef, {
    gmailMessageId: msg.gmailMessageId,
    gmailThreadId:  msg.gmailThreadId,
    direction:      msg.direction,
    from:           msg.from || '',
    fromDisplay:    msg.fromDisplay || '',
    to:             msg.to || [],
    cc:             msg.cc || [],
    subject:        msg.subject || '',
    bodyText:       msg.bodyText || '',
    bodyHtml:       msg.bodyHtml || '',     // already server-sanitized
    snippet:        msg.snippet || '',
    sentAt:         sentAtTs,
    sourceChannel:  msg.sourceChannel || 'gmail',
    replyToAddress: msg.replyToAddress || msg.from || '',
    via:            'sync',
    aiAssisted:     false,
    createdAt:      now,
  }, { merge: true });

  /* Thread summary. */
  const participantList = [msg.from, ...(msg.to || [])].filter(Boolean);
  const threadUpdate = {
    gmailThreadId: msg.gmailThreadId,
    subject:       msg.subject || '',
    channel:       msg.sourceChannel || 'gmail',
    lastMessageAt: sentAtTs,
    messageCount:  admin.firestore.FieldValue.increment(1),
    updatedAt:     now,
  };
  /* arrayUnion() throws with zero args — only set it when we actually have
   * participants (a malformed message with no From/To would otherwise crash
   * the whole sync run). */
  if (participantList.length) {
    threadUpdate.participants = admin.firestore.FieldValue.arrayUnion(...participantList);
  }
  batch.set(threadRef, threadUpdate, { merge: true });

  /* Lead summary fields. Unread only bumps on inbound. Track the alias +
   * thread so future messages auto-route (step 1/2). */
  const leadUpdate = {
    commsLastMessageAt: sentAtTs,
    commsLastDirection: msg.direction,
    gmailThreadIds:     admin.firestore.FieldValue.arrayUnion(msg.gmailThreadId),
    updatedAt:          now,
  };
  if (msg.direction === 'in') {
    leadUpdate.commsUnread = admin.firestore.FieldValue.increment(1);
    /* Record the sender (proxy-aware) so replies + future routing know it. */
    if (msg.from) leadUpdate.emailAliases = admin.firestore.FieldValue.arrayUnion(msg.from);
  }
  batch.set(leadRef, leadUpdate, { merge: true });

  await batch.commit();

  /* Reply detection: an OUTBOUND message on this lead means someone answered
   * — close any open "reply needed" / "follow up due" items so the twice-a-
   * day reminder pushes stop automatically. Works for agent sends AND manual
   * Gmail replies, because both flow through the sync. */
  if (msg.direction === 'out') {
    try {
      const open = await db.collection('kendell_followups')
        .where('leadId', '==', leadRef.id).where('status', '==', 'open').get();
      const closable = open.docs.filter(d => ['reply_needed', 'followup_due', 'quote_expired'].includes(d.data().type));
      await Promise.all(closable.map(d => d.ref.update({
        status: 'done',
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: 'auto: outbound reply detected by gmail sync',
      })));
      if (closable.length) console.log(`auto-closed ${closable.length} followup(s) for lead ${leadRef.id} — reply detected`);
      /* Also clear a PAST-DUE followUpDate — otherwise the 8am scan recreates
       * the same "follow up with X" reminder every morning even though the
       * follow-up already went out. A future-dated follow-up stays. */
      const leadSnap = await leadRef.get();
      const fud = leadSnap.exists && leadSnap.data().followUpDate;
      if (fud && String(fud) <= ymd(new Date())) {
        await leadRef.update({ followUpDate: null, followUpClearedBy: 'auto: outbound reply' });
      }
    } catch (e) { console.warn('followup auto-close failed:', e.message); }
  }
}

/* ─── Unmatched message → holding collection + Kendell followup ─────────────
 * opts.autoResolve: store the message already resolved (resolution
 * 'not_a_lead') and skip the followup — used for automated/marketing senders
 * and outbound mail to non-leads, so the queue only holds real decisions. */
async function recordUnmatched(msg, parsed, opts = {}) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = db.collection('unmatched_messages').doc(msg.gmailMessageId);
  await ref.set({
    gmailMessageId: msg.gmailMessageId,
    gmailThreadId:  msg.gmailThreadId,
    direction:      msg.direction,
    from:           msg.from || '',
    fromDisplay:    msg.fromDisplay || '',
    to:             msg.to || [],
    subject:        msg.subject || '',
    snippet:        msg.snippet || '',
    bodyText:       msg.bodyText || '',
    bodyHtml:       msg.bodyHtml || '',
    sourceChannel:  msg.sourceChannel || 'gmail',
    replyToAddress: msg.replyToAddress || msg.from || '',
    parsedHints:    parsed || null,        // Knot/WeddingPro body-parse output, if any
    resolved:       !!opts.autoResolve,
    ...(opts.autoResolve ? {
      resolution:       'not_a_lead',
      resolutionReason: opts.reason || 'automated_sender',
      resolvedAt:       now,
    } : {}),
    sentAt:         msg.internalDateMs ? admin.firestore.Timestamp.fromMillis(msg.internalDateMs) : now,
    createdAt:      now,
  }, { merge: true });

  if (opts.autoResolve) return;

  /* One followup per thread so Kendell isn't spammed for a back-and-forth. */
  const fuId = 'unmatched_' + msg.gmailThreadId;
  await db.collection('kendell_followups').doc(fuId).set({
    type:        'unmatched_message',
    title:       `📨 Unmatched ${msg.sourceChannel === 'gmail' ? 'email' : msg.sourceChannel} from ${msg.fromDisplay || msg.from || 'unknown'}`,
    notes:       `Couldn't auto-match "${(msg.subject || '(no subject)').slice(0, 80)}" to a lead. Open the message in Comms → Unmatched to attach it.`,
    gmailThreadId: msg.gmailThreadId,
    gmailMessageId: msg.gmailMessageId,
    status:      'open',
    completed:   false,
    createdAt:   now,
  }, { merge: true });
}

/* ─── Normalize a full Gmail message resource → our flat msg shape ────────── */
function normalizeGmailMessage(full) {
  const payload = full.payload || {};
  const h = headerMap(payload.headers);
  const fromParsed = parseAddress(h['from']);
  const labelIds = full.labelIds || [];
  const direction = labelIds.includes('SENT') ? 'out' : 'in';
  const sourceChannel = channelForSender(fromParsed.email);

  const bodies = extractBodies(payload);
  const bodyHtml = sanitizeHtml(bodies.html);
  const bodyText = bodies.text || htmlToText(bodies.html);

  /* Proxy-aware reply target: prefer Reply-To, else From. For Knot/WeddingPro
   * this keeps us writing to the proxy, never the bride's real address. */
  const replyTo = parseAddress(h['reply-to']).email || fromParsed.email;

  return {
    gmailMessageId: full.id,
    gmailThreadId:  full.threadId,
    direction,
    from:           fromParsed.email,
    fromDisplay:    fromParsed.display || fromParsed.email,
    to:             splitAddresses(h['to']),
    cc:             splitAddresses(h['cc']),
    subject:        h['subject'] || '',
    bodyText,
    bodyHtml,
    snippet:        full.snippet || '',
    internalDateMs: full.internalDate ? Number(full.internalDate) : null,
    sourceChannel,
    replyToAddress: replyTo,
  };
}

/* ─── Process one message id: fetch → normalize → resolve → write ─────────── */
async function processMessageId(gmail, messageId) {
  let full;
  try {
    const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    full = res.data;
  } catch (e) {
    console.warn('Fetch message failed', messageId, e.message);
    return;
  }
  const msg = normalizeGmailMessage(full);
  if (!msg.gmailThreadId) return;

  await routeMessage(msg);
}

/* Resolve → write to lead, or file as unmatched (auto-resolving obvious
 * non-lead mail so the queue only holds messages that need a human). */
/* Sent-folder → CRM reconciliation: when we see OUR outbound email to a
 * lead that reads like a quote going out, flip their draft quote(s) to
 * sent, advance the stage, and log it — closes the "quote emailed but CRM
 * still says draft" gap. */
const QUOTE_EMAIL_RE = /\b(quote|proposal|estimate|pricing)\b/i;
async function reconcileSentQuote(leadId, msg) {
  if (msg.direction !== 'out') return;
  if (!QUOTE_EMAIL_RE.test(`${msg.subject || ''} ${(msg.bodyText || '').slice(0, 4000)}`)) return;
  try {
    const qs = await db.collection('quotes').where('leadId', '==', leadId).get();
    const drafts = qs.docs.filter(d => (d.data().status || 'draft') === 'draft');
    if (!drafts.length) return;
    const now = admin.firestore.FieldValue.serverTimestamp();
    for (const q of drafts) await q.ref.update({ status: 'sent', sentAt: now, sentVia: 'gmail_sync' });
    await db.collection('leads').doc(leadId).update({
      stage: 'Proposal Sent', latestQuoteStatus: 'sent', updatedAt: now,
    });
    await db.collection('activity').add({
      type: 'quote_sent_detected', leadId,
      note: `Sent-folder sync: quote email detected ("${(msg.subject || '').slice(0, 100)}") — marked ${drafts.length} draft quote(s) sent, stage → Proposal Sent`,
      createdAt: now,
    });
    console.log(`reconcileSentQuote: lead ${leadId} — ${drafts.length} quote(s) marked sent`);
  } catch (e) { console.warn('reconcileSentQuote failed:', e.message); }
}

async function routeMessage(msg) {
  const resolved = await resolveLeadForMessage(msg);
  if (resolved.leadId && resolved.leadRef) {
    await writeMessageToLead(resolved.leadRef, msg);
    await reconcileSentQuote(resolved.leadId, msg);
    return;
  }
  /* Knot/WeddingPro relays send from noreply-style proxies but ARE real
   * leads — never auto-resolve those channels. */
  const isProxyChannel = msg.sourceChannel === 'theknot' || msg.sourceChannel === 'weddingpro';
  if (msg.direction === 'in' && !isProxyChannel && isAutomatedNonLead(msg.from)) {
    await recordUnmatched(msg, resolved.parsed || null, { autoResolve: true, reason: 'automated_sender' });
    return;
  }
  if (msg.direction === 'out') {
    /* Outbound we couldn't match means we emailed someone who isn't a lead
     * (vendor, bank, etc.) — nothing for Kendell to act on. */
    await recordUnmatched(msg, resolved.parsed || null, { autoResolve: true, reason: 'outbound_no_lead' });
    return;
  }
  await recordUnmatched(msg, resolved.parsed || null);
}

/* ─── Zapier fallback drain (clean interface, OAuth-absent path) ───────────
 * The Zap writes one doc per message into `gmail_inbound_raw` with at least
 * { id, threadId, headers{from,to,cc,subject,replyTo}, bodyText, bodyHtml,
 *   snippet, internalDateMs, labelIds[] }. We normalize the same way and mark
 *   the raw doc processed. */
async function drainZapierQueue() {
  let snap;
  try {
    snap = await db.collection('gmail_inbound_raw')
      .where('processed', '==', false).limit(50).get();
  } catch (e) {
    console.warn('Zapier drain query failed:', e.message);
    return 0;
  }
  let n = 0;
  for (const doc of snap.docs) {
    const raw = doc.data();
    const hdr = raw.headers || {};
    const fromParsed = parseAddress(hdr.from);
    const direction = (raw.labelIds || []).includes('SENT') ? 'out' : 'in';
    const msg = {
      gmailMessageId: raw.id || doc.id,
      gmailThreadId:  raw.threadId,
      direction,
      from:           fromParsed.email,
      fromDisplay:    fromParsed.display || fromParsed.email,
      to:             splitAddresses(hdr.to),
      cc:             splitAddresses(hdr.cc),
      subject:        hdr.subject || '',
      bodyText:       raw.bodyText || htmlToText(raw.bodyHtml),
      bodyHtml:       sanitizeHtml(raw.bodyHtml),
      snippet:        raw.snippet || '',
      internalDateMs: raw.internalDateMs || null,
      sourceChannel:  channelForSender(fromParsed.email),
      replyToAddress: parseAddress(hdr.replyTo).email || fromParsed.email,
    };
    if (!msg.gmailThreadId) { await doc.ref.update({ processed: true, error: 'no threadId' }); continue; }
    await routeMessage(msg);
    await doc.ref.update({ processed: true, processedAt: admin.firestore.FieldValue.serverTimestamp() });
    n++;
  }
  return n;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * syncGmail — scheduled poller (every 1 min). Incremental via historyId;
 * falls back to messages.list(newer_than:2d) when the cursor is missing or
 * Gmail reports the history window expired (404).
 * ══════════════════════════════════════════════════════════════════════════ */
exports.syncGmail = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeoutSeconds: 120,
    secrets: [GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN],
  },
  async () => {
    const { gmail, mode } = buildGmailClient();

    /* Fallback path: no OAuth secret → drain whatever Zapier left us. */
    if (mode !== 'oauth' || !gmail) {
      const drained = await drainZapierQueue();
      console.log(`syncGmail: OAuth secret absent — drained ${drained} Zapier message(s).`);
      return;
    }

    /* Load incremental cursor. */
    let cursor = null;
    try {
      const doc = await GMAIL_SYNC_DOC.get();
      if (doc.exists) cursor = doc.data().historyId || null;
    } catch (e) { console.warn('gmail_sync cursor read failed:', e.message); }

    const messageIds = new Set();
    let newHistoryId = cursor;

    if (cursor) {
      /* Incremental: only what changed since the cursor. */
      try {
        let pageToken;
        do {
          const res = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: cursor,
            historyTypes: ['messageAdded'],
            pageToken,
          });
          const history = res.data.history || [];
          history.forEach(hrec => {
            (hrec.messagesAdded || []).forEach(ma => {
              if (ma.message && ma.message.id) messageIds.add(ma.message.id);
            });
          });
          if (res.data.historyId) newHistoryId = res.data.historyId;
          pageToken = res.data.nextPageToken;
        } while (pageToken);
      } catch (e) {
        /* 404 = history window expired → full fallback below. */
        if (e.code === 404 || (e.response && e.response.status === 404)) {
          console.warn('Gmail history expired — falling back to newer_than:2d.');
          cursor = null;
        } else {
          console.error('history.list failed:', e.message);
          return;
        }
      }
    }

    if (!cursor) {
      /* First run or expired cursor: scan the last 2 days of INBOX + SENT. */
      try {
        let pageToken;
        do {
          const res = await gmail.users.messages.list({
            userId: 'me',
            q: 'newer_than:2d (in:inbox OR in:sent)',
            maxResults: 100,
            pageToken,
          });
          (res.data.messages || []).forEach(m => messageIds.add(m.id));
          pageToken = res.data.nextPageToken;
        } while (pageToken);
      } catch (e) {
        console.error('messages.list fallback failed:', e.message);
        return;
      }
      /* Seed the cursor from the mailbox profile so next run is incremental. */
      try {
        const prof = await gmail.users.getProfile({ userId: 'me' });
        if (prof.data.historyId) newHistoryId = prof.data.historyId;
      } catch (e) { console.warn('getProfile failed:', e.message); }
    }

    /* Process every collected message id (idempotent writes). */
    let processed = 0;
    for (const id of messageIds) {
      await processMessageId(gmail, id);
      processed++;
    }

    /* Advance the cursor. */
    if (newHistoryId) {
      try {
        await GMAIL_SYNC_DOC.set({
          historyId: String(newHistoryId),
          lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
          lastProcessedCount: processed,
        }, { merge: true });
      } catch (e) { console.warn('gmail_sync cursor write failed:', e.message); }
    }

    console.log(`syncGmail (oauth): processed ${processed} message(s); cursor=${newHistoryId}.`);
  }
);

/* ═══════════════════════════════════════════════════════════════════════════
 * COMMUNICATIONS HUB — Phase 2 (send a reply from the lead card)
 *
 * sendReply (onCall, requireAdmin) sends an in-thread Gmail reply, proxy-aware
 * (Knot/WeddingPro replies go to the proxy, never the bride's real inbox), with
 * correct In-Reply-To/References threading headers, then mirrors the outbound
 * message straight into Firestore so the card updates instantly (the poller
 * re-confirms idempotently later by Gmail message id).
 *
 * assertSafeToSend is the SINGLE server-side send gate — sendReply calls it, and
 * the future P4 auto-agent must call it too. No send path may bypass it. It is
 * deliberately unbypassable from the client: the dedup/quote checks all read
 * Firestore + Gmail Sent server-side with the admin SDK / OAuth client.
 * ══════════════════════════════════════════════════════════════════════════ */

/* The public quote/proposal share link pattern (quotes.js builds
 * `https://lakesalt.us/quote?id=...`). assertSafeToSend's Gmail-Sent layer looks
 * for this marker in prior outbound thread messages to catch a quote that went
 * out around the CRM (e.g. typed in real Gmail) when the Firestore mirror is
 * stale. Keep in sync with quotes.js `shareUrl`. */
const QUOTE_URL_MARKERS = [/lakesalt\.us\/quote\b/i, /lakesalt\.us\/proposal\b/i];

/* In-flight / recently-sent fingerprints for the double-click + duplicate-body
 * guard. Cloud Run instances are warm across invocations, so this catches the
 * common rapid-double-click case cheaply; the Firestore check below is the
 * durable cross-instance guard. */
const RECENT_SEND_WINDOW_MS = 90 * 1000;
const _recentSends = new Map();  // key -> timestamp(ms)
function _sendFingerprint(leadId, gmailThreadId, bodyText) {
  let hash = 0;
  const s = String(bodyText || '');
  for (let i = 0; i < s.length; i++) { hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0; }
  return `${leadId}|${gmailThreadId}|${hash}`;
}

/* ─── assertSafeToSend — the one and only send gate (spec §6) ────────────────
 * Throws HttpsError('failed-precondition', <clear message>) on block, otherwise
 * resolves. `gmail` is an optional authenticated client used for the Gmail-Sent
 * defense-in-depth layer; when absent (e.g. Zapier mode) that layer is skipped
 * but the Firestore quote-flag + idempotency layers still run. */
async function assertSafeToSend({ leadId, gmailThreadId, bodyText, isQuote }, gmail) {
  if (!leadId)        throw new HttpsError('invalid-argument', 'leadId is required.');
  if (!gmailThreadId) throw new HttpsError('invalid-argument', 'gmailThreadId is required.');

  /* ── LAYER 1: Firestore quote-flag (primary) ──────────────────────────────
   * Reuse the flags quotes.js already maintains on the lead. Only blocks when
   * THIS send is itself a quote (isQuote) — ordinary replies in a thread that
   * already has a quote out are fine and expected. */
  let lead = {};
  try {
    const snap = await db.collection('leads').doc(leadId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Lead not found.');
    lead = snap.data() || {};
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError('internal', 'Could not read lead for safety check.');
  }

  if (isQuote) {
    const quoteStatus = String(lead.latestQuoteStatus || '').toLowerCase();
    const blockingStatuses = ['sent', 'accepted'];
    const blockingStages   = ['Proposal Sent', 'Booked-Tentative', 'Booked'];
    const stage = lead.stage || '';
    if (blockingStatuses.includes(quoteStatus) || blockingStages.includes(stage)) {
      const total = lead.latestQuoteTotal != null
        ? '$' + Math.round(Number(lead.latestQuoteTotal)).toLocaleString('en-US')
        : 'A quote';
      const when = lead.latestQuoteAcceptedAt && lead.latestQuoteAcceptedAt.toDate
        ? lead.latestQuoteAcceptedAt.toDate().toLocaleDateString('en-US')
        : (lead.updatedAt && lead.updatedAt.toDate ? lead.updatedAt.toDate().toLocaleDateString('en-US') : 'earlier');
      throw new HttpsError(
        'failed-precondition',
        `${total} already went out on ${when} (status: ${quoteStatus || stage}). ` +
        `Open the existing quote instead of sending a new one.`
      );
    }
  }

  /* ── LAYER 2: Gmail Sent verification (defense in depth) ───────────────────
   * Catches a quote that left the mailbox outside the CRM (typed in real Gmail)
   * when the Firestore mirror is stale. Only enforced for quote sends. */
  if (isQuote && gmail) {
    try {
      /* Pull the whole thread and inspect its SENT messages directly — more
       * precise than messages.list, which can't filter by threadId via `q`. */
      const thread = await gmail.users.threads.get({ userId: 'me', id: gmailThreadId, format: 'full' });
      const msgs = (thread.data && thread.data.messages) || [];
      for (const m of msgs) {
        const labels = m.labelIds || [];
        if (!labels.includes('SENT')) continue;
        const bodies = extractBodies(m.payload || {});
        const hay = `${bodies.text || ''} ${bodies.html || ''} ${m.snippet || ''}`;
        if (QUOTE_URL_MARKERS.some(rx => rx.test(hay))) {
          throw new HttpsError(
            'failed-precondition',
            'A prior message in this Gmail thread already contains a quote link. ' +
            'Open the existing quote instead of sending a new one.'
          );
        }
      }
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      /* A Gmail read failure must NOT silently weaken layer 1 — but it also
       * shouldn't hard-block an ordinary send when Gmail is flaky. Log and let
       * layer 1 stand as the authoritative block. */
      console.warn('assertSafeToSend: Gmail Sent verification skipped:', e.message);
    }
  }

  /* ── LAYER 3: idempotency / double-click guard ────────────────────────────
   * (a) in-memory fingerprint for warm-instance rapid double-clicks; (b)
   * durable Firestore check — was an identical outbound body written to this
   * thread within the window? Catches double-submits across instances. */
  const fp = _sendFingerprint(leadId, gmailThreadId, bodyText);
  const nowMs = Date.now();
  /* prune old entries */
  for (const [k, t] of _recentSends) { if (nowMs - t > RECENT_SEND_WINDOW_MS) _recentSends.delete(k); }
  if (_recentSends.has(fp) && nowMs - _recentSends.get(fp) < RECENT_SEND_WINDOW_MS) {
    throw new HttpsError('failed-precondition', 'That looks like a duplicate of a message just sent — ignored.');
  }

  if (bodyText && String(bodyText).trim()) {
    try {
      const cutoff = admin.firestore.Timestamp.fromMillis(nowMs - RECENT_SEND_WINDOW_MS);
      const recent = await db.collection('leads').doc(leadId)
        .collection('threads').doc(gmailThreadId).collection('messages')
        .where('direction', '==', 'out')
        .where('sentAt', '>=', cutoff)
        .get();
      const target = String(bodyText).trim();
      const dup = recent.docs.some(d => String((d.data().bodyText || '')).trim() === target);
      if (dup) {
        throw new HttpsError('failed-precondition', 'An identical reply was just sent to this thread — not sending a duplicate.');
      }
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.warn('assertSafeToSend: Firestore idempotency check skipped:', e.message);
    }
  }

  /* Reserve the fingerprint so a concurrent double-click is caught. */
  _recentSends.set(fp, nowMs);

  return { lead };
}

/* ─── RFC-2822 MIME builder ──────────────────────────────────────────────────
 * Minimal but correct: UTF-8 plain-text body, base64url-encoded for the Gmail
 * raw field, with threading headers. We send plain text only (matches how
 * Kendell replies); Gmail wraps it. References chains the prior Message-ID(s)
 * so every mail client threads it. */
function encodeMimeWord(str) {
  /* RFC 2047 encoded-word for non-ASCII headers (subjects, display names). */
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  return '=?UTF-8?B?' + Buffer.from(String(str), 'utf-8').toString('base64') + '?=';
}

function buildMime({ fromHeader, to, subject, bodyText, inReplyTo, references }) {
  const headers = [];
  if (fromHeader) headers.push(`From: ${fromHeader}`);
  headers.push(`To: ${to}`);
  headers.push(`Subject: ${encodeMimeWord(subject || '')}`);
  if (inReplyTo)  headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: 8bit');
  const raw = headers.join('\r\n') + '\r\n\r\n' + String(bodyText || '');
  return Buffer.from(raw, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* Resolve the latest message in a Gmail thread (for proxy-aware reply-to,
 * subject, and threading headers). Returns the normalized header bits we need.
 * Prefers the latest INBOUND message's Reply-To/From for the recipient so we
 * always reply to the proxy address on Knot/WeddingPro threads. */
async function resolveReplyTargetFromThread(gmail, gmailThreadId) {
  const thread = await gmail.users.threads.get({ userId: 'me', id: gmailThreadId, format: 'metadata',
    metadataHeaders: ['From', 'To', 'Reply-To', 'Subject', 'Message-ID', 'References'] });
  const msgs = (thread.data && thread.data.messages) || [];
  if (!msgs.length) throw new HttpsError('not-found', 'Gmail thread has no messages.');

  /* Latest message overall (Gmail returns chronological order). */
  const last = msgs[msgs.length - 1];
  const lastH = headerMap((last.payload && last.payload.headers) || []);

  /* Latest INBOUND message → its reply-to/from is who we answer. If the whole
   * thread is outbound (rare for a reply), fall back to the last message's To. */
  let inboundH = null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (!(msgs[i].labelIds || []).includes('SENT')) { inboundH = headerMap((msgs[i].payload && msgs[i].payload.headers) || []); break; }
  }

  let replyTo;
  if (inboundH) {
    replyTo = parseAddress(inboundH['reply-to']).email || parseAddress(inboundH['from']).email;
  } else {
    replyTo = splitAddresses(lastH['to'])[0] || '';
  }
  if (!replyTo) throw new HttpsError('failed-precondition', 'Could not resolve a reply-to address for this thread.');

  /* Subject: reuse the thread subject, ensure a single "Re:" prefix. */
  let subject = lastH['subject'] || '';
  if (subject && !/^\s*re:/i.test(subject)) subject = 'Re: ' + subject;

  /* Threading headers: In-Reply-To = the message we answer; References =
   * existing References chain + that Message-ID. */
  const lastMsgId = lastH['message-id'] || '';
  const existingRefs = lastH['references'] || '';
  const references = (existingRefs ? existingRefs + ' ' : '') + lastMsgId;

  return { replyTo, subject, inReplyTo: lastMsgId, references, lastMsgId };
}

exports.sendReply = onCall(
  {
    secrets: [GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN],
    timeoutSeconds: 60,
  },
  async (request) => {
    const adminUser = await requireAdmin(request);
    const data = (request && request.data) || {};
    const {
      leadId,
      gmailThreadId,
      bodyText,
      inReplyToMessageId = '',   // optional client hint; thread lookup is authoritative
      isQuote = false,
    } = data;

    if (!leadId || !gmailThreadId) {
      throw new HttpsError('invalid-argument', 'leadId and gmailThreadId are required.');
    }
    if (!bodyText || !String(bodyText).trim()) {
      throw new HttpsError('invalid-argument', 'Message body is empty.');
    }

    /* Build the Gmail client up front so assertSafeToSend can use its Gmail-Sent
     * verification layer (defense in depth). */
    const { gmail, mode } = buildGmailClient();
    if (mode !== 'oauth' || !gmail) {
      throw new HttpsError(
        'failed-precondition',
        'Gmail OAuth is not configured — sending requires the OAuth refresh token secret. ' +
        'Set GMAIL_OAUTH_* secrets (see runbook) before sending from the CRM.'
      );
    }

    /* ── HARD STOP: the one send gate. Runs BEFORE we compose or send. ── */
    await assertSafeToSend({ leadId, gmailThreadId, bodyText, isQuote }, gmail);

    /* Resolve proxy-aware reply-to + subject + threading headers from the live
     * thread. NOTE: the client's `inReplyToMessageId` is a *Gmail* message id
     * (Firestore doc id), NOT an RFC-822 Message-ID — it is NOT valid in the
     * In-Reply-To header. We always use the thread-derived RFC Message-ID for
     * threading; the client hint is accepted only for logging/audit. */
    const target = await resolveReplyTargetFromThread(gmail, gmailThreadId);
    const inReplyTo = target.inReplyTo;
    const references = target.references;
    void inReplyToMessageId;

    /* Build + send the MIME. From is left to Gmail (the authenticated mailbox);
     * we don't spoof a From header so SPF/DKIM stay valid. */
    const rawMime = buildMime({
      to: target.replyTo,
      subject: target.subject,
      bodyText,
      inReplyTo,
      references,
    });

    let sent;
    try {
      const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawMime, threadId: gmailThreadId },
      });
      sent = res.data;  // { id, threadId, labelIds }
    } catch (e) {
      console.error('gmail.messages.send failed:', e.message);
      throw new HttpsError('internal', 'Gmail rejected the send: ' + (e.message || 'unknown error'));
    }

    /* Mirror the outbound message into Firestore immediately so the card updates
     * instantly. Doc id = returned Gmail message id, so the poller's later
     * re-fetch merges onto the same doc (idempotent, never duplicates). */
    const sentMsgId = sent.id;
    const leadRef = db.collection('leads').doc(leadId);
    const threadRef = leadRef.collection('threads').doc(gmailThreadId);
    const messageRef = threadRef.collection('messages').doc(sentMsgId);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const sentAtTs = admin.firestore.Timestamp.now();

    /* Channel: inherit the thread's channel so the bubble badges correctly. */
    let channel = 'gmail';
    try {
      const tdoc = await threadRef.get();
      if (tdoc.exists && tdoc.data().channel) channel = tdoc.data().channel;
    } catch (e) { /* default gmail */ }

    const batch = db.batch();

    batch.set(messageRef, {
      gmailMessageId: sentMsgId,
      gmailThreadId:  gmailThreadId,
      direction:      'out',
      from:           adminUser.email || '',
      fromDisplay:    'You',
      to:             [target.replyTo],
      cc:             [],
      subject:        target.subject || '',
      bodyText:       String(bodyText),
      bodyHtml:       '',
      snippet:        String(bodyText).slice(0, 140),
      sentAt:         sentAtTs,
      sourceChannel:  channel,
      replyToAddress: target.replyTo,
      via:            'crm-send',
      aiAssisted:     !!data.aiAssisted,
      sentByEmail:    adminUser.email || '',
      sentByName:     adminUser.name || '',
      createdAt:      now,
    }, { merge: true });

    batch.set(threadRef, {
      gmailThreadId: gmailThreadId,
      subject:       target.subject || '',
      channel,
      lastMessageAt: sentAtTs,
      messageCount:  admin.firestore.FieldValue.increment(1),
      participants:  admin.firestore.FieldValue.arrayUnion(target.replyTo),
      updatedAt:     now,
    }, { merge: true });

    batch.set(leadRef, {
      commsLastMessageAt: sentAtTs,
      commsLastDirection: 'out',
      lastContactedAt:    now,
      gmailThreadIds:     admin.firestore.FieldValue.arrayUnion(gmailThreadId),
      updatedAt:          now,
    }, { merge: true });

    await batch.commit();

    /* Activity-log entry for the dashboard feed. */
    try {
      await db.collection('activity').add({
        action: 'comms_reply_sent',
        collection: 'leads',
        docId: leadId,
        summary: `✉️ Replied to ${target.replyTo} — "${String(bodyText).slice(0, 60)}${String(bodyText).length > 60 ? '…' : ''}"`,
        userId: adminUser.uid,
        userName: adminUser.name || adminUser.email || 'Admin',
        metadata: { leadId, gmailThreadId, gmailMessageId: sentMsgId, isQuote: !!isQuote },
        createdAt: now,
      });
    } catch (e) { console.warn('activity log write failed:', e.message); }

    return { success: true, gmailMessageId: sentMsgId, gmailThreadId, replyTo: target.replyTo };
  }
);

/* P3 adds `aiComposeReply` (onCall) using ANTHROPIC_API_KEY. Declared in P1 to
 * reserve the secret + dependency; not consumed until P3. */
void ANTHROPIC_API_KEY;

/* ═══ Restored from main@77a7bc4 — nurture engine, quote/lead triggers, push, receipts ═══ */
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

      /* Already followed up: our last message on this lead went OUT after the
       * follow-up date arrived. Clear the stale date instead of re-nagging —
       * this is what made pushes say "follow up with X" after we already had. */
      if (lead.commsLastDirection === 'out' && lead.commsLastMessageAt &&
          lead.commsLastMessageAt.toDate &&
          ymd(lead.commsLastMessageAt.toDate()) >= String(lead.followUpDate)) {
        await doc.ref.update({ followUpDate: null, followUpClearedBy: 'auto: 8am scan saw outbound after due date' });
        continue;
      }

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

    /* Quote expiry: sent quotes that aren't won and have passed their expiry
     * window get flagged + a one-time reminder (surfaced in the alerts strip). */
    let expiredCount = 0;
    try {
      const defDoc = await db.collection('settings').doc('quote_defaults').get();
      const expiryDays = (defDoc.exists && defDoc.data().quoteExpiryDays) || 14;
      const now = new Date();
      const qsnap = await db.collection('quotes').where('sentAt', '!=', null).get();
      for (const qd of qsnap.docs) {
        const q = qd.data();
        if (q.outcome === 'won' || q.expired) continue;
        const sentDate = q.sentAt.toDate ? q.sentAt.toDate() : new Date(q.sentAt);
        const expiryDate = new Date(sentDate.getTime() + expiryDays * 24 * 60 * 60 * 1000);
        if (expiryDate >= now) continue;
        await qd.ref.update({ expired: true });
        await db.collection('kendell_followups').add({
          type: 'quote_expired',
          leadId: q.leadId || null,
          leadName: q.leadName || 'a client',
          title: `📄 Quote for ${q.leadName || 'a client'} expired — follow up or re-send`,
          notes: `Sent ${ymd(sentDate)}, no acceptance within ${expiryDays} days.`,
          status: 'open',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        expiredCount++;
      }
    } catch (e) {
      console.error('Quote-expiry scan failed:', e);
    }

    await detectRepliesNeeded();
    /* No push here — the 8am scan just builds the list. Pushes go out at
     * 10am and 2pm MT (see morningFollowupPush / afternoonFollowupSweep):
     * early-morning pushes get ignored. */

    console.log(`dailyFollowupScan created ${created} follow-up reminders, flagged ${expiredCount} expired quotes`);
    return null;
  }
);

/* ─── Reply-needed detection ──────────────────────────────────────────────
 * A lead whose LAST message is inbound and has sat unanswered for 20+ hours
 * gets an open reply_needed followup. It auto-closes the moment the sync
 * sees our outbound reply (see writeMessageToLead), which also silences the
 * twice-a-day reminder pushes for it. */
async function detectRepliesNeeded() {
  let created = 0;
  try {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 20 * 3600e3);
    const snap = await db.collection('leads')
      .where('commsLastDirection', '==', 'in').get();
    for (const doc of snap.docs) {
      const lead = doc.data();
      if (['Completed', 'Lost', 'Closed'].includes(lead.stage)) continue;
      const last = lead.commsLastMessageAt;
      if (!last || last.toMillis() > cutoff.toMillis()) continue;      // still fresh
      const existing = await db.collection('kendell_followups')
        .where('leadId', '==', doc.id).where('status', '==', 'open').limit(10).get();
      if (existing.docs.some(d => d.data().type === 'reply_needed')) continue;
      const days = Math.max(1, Math.round((Date.now() - last.toMillis()) / 864e5));
      await db.collection('kendell_followups').add({
        type: 'reply_needed',
        leadId: doc.id,
        leadName: lead.name || 'a lead',
        title: `💬 ${lead.name || 'A lead'} is waiting on our reply (${days} day${days === 1 ? '' : 's'})`,
        notes: `Their last message came in and we haven't responded. ${lead.eventType || 'Event'}${lead.eventDate ? ' · ' + lead.eventDate : ''}.`,
        status: 'open',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created++;
    }
  } catch (e) { console.warn('detectRepliesNeeded failed:', e.message); }
  if (created) console.log(`detectRepliesNeeded: ${created} reply_needed followup(s) created`);
  return created;
}

/* ─── Follow-ups push (10am + 2pm MT) ─────────────────────────────────────
 * Repeats until the list is empty — items leave by being resolved in the
 * CRM or auto-closed when a reply goes out. Designed to be ACTED ON, not
 * ignored: it leads with the single most urgent item (deep-linked to that
 * lead's card) and only counts the rest. Unmatched-message triage items
 * stay on the dashboard but don't clog the push. */
const PUSHABLE_TYPES = ['quote_accepted', 'reply_needed', 'followup_due', 'quote_expired'];
async function pushFollowupsDigest(slot) {
  try {
    const openSnap = await db.collection('kendell_followups')
      .where('status', '==', 'open').get();
    const items = openSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((i) => PUSHABLE_TYPES.includes(i.type));
    if (!items.length) return;
    /* Priority: money first, then whoever has waited longest. */
    items.sort((a, b) =>
      (PUSHABLE_TYPES.indexOf(a.type) - PUSHABLE_TYPES.indexOf(b.type)) ||
      ((a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0) -
       (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0)));
    const top = items[0];
    const restNames = [...new Set(items.slice(1).map((i) => i.leadName || 'a lead'))];
    const rest = restNames.length
      ? ` Also waiting: ${restNames.slice(0, 3).join(', ')}${restNames.length > 3 ? ` +${restNames.length - 3} more` : ''}.`
      : '';
    /* Deep link straight to the item: the #decide screen shows this exact
     * followup with one-tap actions (Done / open the lead), so the tap lands
     * on the task — not the CRM front door. */
    await db.collection('notifications').add({
      title: String(top.title || 'Follow-up needed').slice(0, 120),
      body: `${String(top.notes || '').slice(0, 160)}${rest} These clear automatically when we reply.`,
      url: `https://lakesalt.us/admin/#decide/${top.id}`,
      tag: `followups-${slot}`,
      kind: 'task',
      followupId: top.id,
      audience: 'ops',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('followups digest push failed:', e.message); }
}

/* First push of the day at 10am MT — late enough to land, early enough to
 * matter. Re-detects first so overnight replies already cleared the list. */
exports.morningFollowupPush = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'America/Denver', timeoutSeconds: 120 },
  async () => {
    await detectRepliesNeeded();
    await pushFollowupsDigest('morning');
    return null;
  }
);

/* Afternoon pass: re-detect anyone newly waiting on us, then re-push
 * whatever is still open. Second push of the workday. */
exports.afternoonFollowupSweep = onSchedule(
  { schedule: '0 14 * * *', timeZone: 'America/Denver', timeoutSeconds: 120 },
  async () => {
    await detectRepliesNeeded();
    await pushFollowupsDigest('afternoon');
    return null;
  }
);

/* ─── Daily nurture run ───────────────────────────────────────────────────
 * Computes which expo-cohort leads are due for their next nurture email and
 * records the batch to nurture_queue/{today}. SENDS NOTHING unless
 * settings/nurture.armed === true AND dryRun === false — and even then only if
 * an email transport (sendNurtureEmail) has been wired (Task 12: Resend/etc.).
 * Fail-safe: armed-but-no-transport logs and sends nothing, never advancing
 * a lead's state, so no message is silently lost. */
exports.dailyNurtureRun = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'America/Denver' },
  async () => {
    const today = ymd(new Date());
    const [setSnap, tplSnap] = await Promise.all([
      db.collection('settings').doc('nurture').get(),
      db.collection('settings').doc('nurture_templates').get()
    ]);
    const cfg = Object.assign({ armed: false, dryRun: true, pacingDays: 2 },
      setSnap.exists ? setSnap.data() : {});
    const templates = tplSnap.exists ? tplSnap.data() : {};

    const leadsSnap = await db.collection('leads')
      .where('campaign', '==', CAMPAIGN_TAG_DEFAULT).get();
    const closed = ['Booked', 'Booked-Tentative', 'Completed', 'Lost'];
    const due = [];
    leadsSnap.forEach(doc => {
      const l = doc.data();
      const st = l.nurtureState || {};
      if (!l.nurtureTier) return;
      if (st.paused) return;
      if (closed.includes(l.stage)) return;
      if (st.nextSendAt && st.nextSendAt > today) return;
      due.push({ id: doc.id, tier: l.nurtureTier, name: l.name || '', email: l.email || '' });
    });

    const live = cfg.armed === true && cfg.dryRun === false;

    // Always record the would-send batch (audit + panel preview).
    await db.collection('nurture_queue').doc(today).set({
      date: today, live, count: due.length,
      leads: due.map(d => ({ id: d.id, tier: d.tier, name: d.name, email: d.email })),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (!live) {
      console.log(`dailyNurtureRun DRY-RUN: ${due.length} due (armed=${cfg.armed}, dryRun=${cfg.dryRun}) — nothing sent`);
      return null;
    }

    // LIVE path. sendNurtureEmail is intentionally not yet defined — wiring a
    // transport is Task 12 (Kendell picks Resend/SendGrid). typeof guard never
    // throws on an undeclared identifier, so this fails safe until then.
    if (typeof sendNurtureEmail !== 'function') {
      console.error('dailyNurtureRun ARMED but no email transport wired — sending nothing. Configure sendNurtureEmail() first.');
      return null;
    }
    let sent = 0;
    for (const d of due) {
      const tpl = templates['tier' + d.tier];
      if (!tpl || !d.email) continue;
      try {
        await sendNurtureEmail(d, tpl, cfg);
        const nextSendAt = ymd(new Date(Date.now() + (cfg.pacingDays || 2) * 86400000));
        await db.collection('leads').doc(d.id).update({
          'nurtureState.sendsCompleted': admin.firestore.FieldValue.increment(1),
          'nurtureState.nextSendAt': nextSendAt
        });
        sent++;
      } catch (e) {
        console.error(`nurture send failed for ${d.email}:`, e);
      }
    }
    console.log(`dailyNurtureRun LIVE: sent ${sent}/${due.length}`);
    return null;
  }
);


/* ─── Auto follow-up when a quote is sent ─────────────────────────────────
 * When a quote transitions to "sent", schedule a +3-day nudge on the linked
 * lead (unless a sooner follow-up is already set) so sent quotes never sit
 * unanswered. The dailyFollowupScan then turns that date into a reminder. */
exports.onQuoteSent = onDocumentUpdated('quotes/{quoteId}', async (event) => {
  const before = event.data?.before?.data() || {};
  const after  = event.data?.after?.data()  || {};

  if (before.sentAt || !after.sentAt) return null;   // only on not-sent → sent
  const leadId = after.leadId;
  if (!leadId) return null;

  const sentDate = after.sentAt.toDate ? after.sentAt.toDate() : new Date(after.sentAt);
  const followUpStr = ymd(new Date(sentDate.getTime() + 3 * 24 * 60 * 60 * 1000));

  try {
    const leadRef = db.collection('leads').doc(leadId);
    const lead = (await leadRef.get()).data() || {};
    // Keep an existing sooner follow-up; otherwise set the +3-day nudge.
    if (!lead.followUpDate || lead.followUpDate > followUpStr) {
      await leadRef.update({
        followUpDate: followUpStr,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (e) {
    console.error('onQuoteSent follow-up scheduling failed:', e);
  }
  return null;
});

/* ─── Pause nurture when a lead becomes engaged ───────────────────────────
 * Once a nurtured lead moves into a real conversation (call scheduled, proposal
 * sent, booked) or is closed, stop the automated cadence so a human takes over
 * and the lead never gets a canned nurture email mid-conversation. */
exports.onLeadEngagedPauseNurture = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data?.before?.data() || {};
  const after  = event.data?.after?.data()  || {};
  if (!after.nurtureTier) return null;                       // not in the cadence
  const st = after.nurtureState || {};
  if (st.paused) return null;                                // already paused

  const engaged = ['Call Scheduled', 'Proposal Sent', 'Booked-Tentative', 'Booked', 'Completed', 'Lost'];
  if (engaged.includes(after.stage) && !engaged.includes(before.stage)) {
    try {
      await event.data.after.ref.update({
        'nurtureState.paused': true,
        'nurtureState.pausedReason': 'engaged: ' + after.stage
      });
    } catch (e) {
      console.error('Failed to pause nurture on engagement:', e);
    }
  }
  return null;
});

/* ─── Weekly nurture report ───────────────────────────────────────────────
 * Summarizes the last 7 days of nurture-queue activity + cohort bookings into
 * nurture_reports/{date}, surfaced in the admin Nurture panel. */
exports.weeklyNurtureReport = onSchedule(
  { schedule: '0 8 * * 1', timeZone: 'America/Denver' },   // Mondays 8am MT
  async () => {
    const now = new Date();
    const weekAgo = ymd(new Date(now.getTime() - 7 * 86400000));
    const today = ymd(now);

    const queueSnap = await db.collection('nurture_queue')
      .where('date', '>=', weekAgo).get();
    let queued = 0, liveRuns = 0;
    queueSnap.forEach(d => { const q = d.data(); queued += (q.count || 0); if (q.live) liveRuns++; });

    const leadsSnap = await db.collection('leads')
      .where('campaign', '==', CAMPAIGN_TAG_DEFAULT).get();
    let booked = 0, active = 0, paused = 0;
    leadsSnap.forEach(doc => {
      const l = doc.data();
      if (!l.nurtureTier) return;
      if (['Booked', 'Completed'].includes(l.stage)) booked++;
      else if ((l.nurtureState || {}).paused) paused++;
      else active++;
    });

    await db.collection('nurture_reports').doc(today).set({
      date: today, weekStart: weekAgo,
      queuedSends: queued, liveRuns,
      cohortBooked: booked, cohortActive: active, cohortPaused: paused,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`weeklyNurtureReport: ${queued} queued, ${booked} booked, ${active} active, ${paused} paused`);
    return null;
  }
);

/* ─── Push notifications to Kendell's devices (added 2026-07-09) ─────────────
 * Any agent or function that needs Kendell's attention creates a doc in the
 * `notifications` collection: { title, body, url?, tag? }. This trigger fans
 * it out to every registered device token in `push_tokens` (registered by
 * /admin/js/push.js) as a DATA-ONLY web push; the admin service worker
 * displays it. Dead tokens are pruned automatically. */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');

/* Audience = ADDRESSING, not routing. Everyone registered gets every push
 * (Kendell's call: full shared visibility). The audience field just says who
 * the message is speaking to, and we prefix the title with their name:
 *   'ops'  → "Maddie — …"  (client communication, leads, follow-ups, bookings)
 *   'tech' → "Kendell — …" (code, CRM build, deploys, agent/system errors)
 *   'all' / unset → no prefix (both). */
const AUDIENCE_NAMES = { ops: 'Maddie', tech: 'Kendell' };
function addressTitle(title, audience) {
  const name = AUDIENCE_NAMES[audience];
  if (!name || title.startsWith(name)) return title;
  return `${name} — ${title}`;
}

exports.sendPushNotification = onDocumentCreated('notifications/{noteId}', async (event) => {
  const snap = event.data;
  const note = snap && snap.data();
  if (!note) return null;

  const tokensSnap = await db.collection('push_tokens').get();
  if (tokensSnap.empty) {
    console.warn('sendPushNotification: no push tokens registered');
    await snap.ref.update({ sentAt: admin.firestore.FieldValue.serverTimestamp(), successCount: 0, failureCount: 0, error: 'no tokens' });
    return null;
  }
  const tokens = tokensSnap.docs.map((d) => d.id);

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: {
      title: addressTitle(String(note.title || 'Lake Salt'), note.audience),
      body:  String(note.body || ''),
      url:   String(note.url || 'https://lakesalt.us/admin/#crm'),
      tag:   String(note.tag || 'lake-salt'),
      /* Actionable pushes: kind drives which buttons the service worker shows
       * (decision → Yes/No, task → Done); followupId is what the buttons act on. */
      kind:  String(note.kind || ''),
      followupId: String(note.followupId || '')
    },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } }
  });

  const prunable = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'];
  await Promise.all(res.responses.map((r, i) => {
    if (r.success) return null;
    const code = r.error && r.error.code;
    if (prunable.includes(code)) return db.collection('push_tokens').doc(tokens[i]).delete();
    console.warn('sendPushNotification: send failed', code);
    return null;
  }));

  await snap.ref.update({
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    successCount: res.successCount,
    failureCount: res.failureCount
  });
  console.log(`sendPushNotification: ${res.successCount} ok / ${res.failureCount} failed of ${tokens.length}`);
  return null;
});

/* ═══ Receipt scanner — parseReceipt ══════════════════════════════════════
 * Fires when a receipt image lands in Storage at receipts/{expenseId}.jpg.
 * Downloads the image, gathers nearby events + categories, then (W5) sends
 * it to Claude for parsing. Idempotent: skips unless status === 'processing'. */
const { onObjectFinalized } = require('firebase-functions/v2/storage');
const { isDuplicateReceipt, deriveTaxYear } = require('./receipt-utils');

const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

const RECEIPT_EXPENSE_CATEGORIES = [
  'Bar Supplies', 'Equipment', 'Marketing', 'Staff', 'Travel',
  'Venue', 'Food & Bev', 'Licensing', 'Insurance', 'Misc'
];

exports.parseReceipt = onObjectFinalized(
  { secrets: [anthropicApiKey], memory: '512MiB', timeoutSeconds: 120 },
  async (event) => {
    const filePath = event.data.name || '';
    if (!filePath.startsWith('receipts/')) return;

    const expenseId = filePath.split('/')[1].replace(/\.jpg$/i, '');
    const expenseRef = db.collection('expenses').doc(expenseId);

    // Idempotency guard: only process docs still awaiting parsing.
    const snap = await expenseRef.get();
    if (!snap.exists || snap.data().status !== 'processing') {
      console.log(`parseReceipt: skip ${expenseId} (status=${snap.exists ? snap.data().status : 'missing'})`);
      return;
    }

    try {
      // Download the image.
      const bucket = admin.storage().bucket(event.data.bucket);
      const [imageBuffer] = await bucket.file(filePath).download();

      // Events within ±45 days of today (re-scoped to receipt date in W5).
      const now = new Date();
      const windowMs = 45 * 24 * 60 * 60 * 1000;
      const eventsSnap = await db.collection('events').get();
      const nearbyEvents = eventsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => {
          const t = e.date && e.date.toDate ? e.date.toDate().getTime() : Date.parse(e.date);
          return !isNaN(t) && Math.abs(t - now.getTime()) <= windowMs;
        });

      // W5 wires this to Claude. Until then, mark for manual review so
      // nothing silently sits in 'processing'.
      const parsed = await parseReceiptWithClaude(imageBuffer, nearbyEvents, anthropicApiKey.value());
      await applyParsedReceipt(expenseRef, parsed, nearbyEvents);
    } catch (err) {
      console.error(`parseReceipt: ${expenseId} failed`, err);
      await expenseRef.update({ status: 'needs-review' });
    }
  }
);

async function parseReceiptWithClaude(imageBuffer, nearbyEvents, apiKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const eventList = nearbyEvents.map(e => {
    const d = e.date && e.date.toDate ? e.date.toDate() : new Date(e.date);
    return `- id:${e.id} | ${e.name || e.title || 'Unnamed'} | ${isNaN(d) ? 'no date' : d.toISOString().slice(0, 10)}`;
  }).join('\n') || '(none)';

  const msg = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBuffer.toString('base64') } },
        { type: 'text', text:
`Parse this receipt for a mobile bartending business (Lake Salt). Return ONLY a JSON object, no markdown fences, with exactly these keys:
merchant (string|null), date (YYYY-MM-DD string|null), total (number|null), tax (number|null),
lineItems (array of {description:string, qty:number, price:number}),
category (one of: ${RECEIPT_EXPENSE_CATEGORIES.join(', ')}),
matchedEventId (string|null), matchConfidence (integer 0-100|null),
deductionType ("event" or "general"), paymentMethod (string|null, e.g. "VISA ****4821").

Candidate events (match by date proximity to the receipt date AND whether the purchased items plausibly serve that event, e.g. bulk drinks days before a wedding):
${eventList}

Rules: if no event plausibly fits, matchedEventId=null and deductionType="general". Recurring business categories (Insurance, Licensing, Marketing) bias toward "general". If the receipt is unreadable, return {"unreadable": true}.` }
      ]
    }]
  });

  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in Claude response');
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

async function applyParsedReceipt(expenseRef, parsed, nearbyEvents) {
  if (!parsed || parsed.unreadable) {
    await expenseRef.update({ status: 'needs-review', description: 'Receipt unreadable' });
    return;
  }

  const validCategory = RECEIPT_EXPENSE_CATEGORIES.includes(parsed.category) ? parsed.category : 'Misc';
  const validEventId = parsed.matchedEventId && nearbyEvents.some(e => e.id === parsed.matchedEventId)
    ? parsed.matchedEventId : null;
  const receiptDate = parsed.date && !isNaN(Date.parse(parsed.date)) ? parsed.date : null;

  // Duplicate detection: check if this receipt matches an existing expense
  if (receiptDate && typeof parsed.total === 'number') {
    const dupSnap = await expenseRef.parent
      .where('merchant', '==', parsed.merchant || '')
      .where('amount', '==', parsed.total)
      .get();
    const others = dupSnap.docs.filter(d => d.id !== expenseRef.id).map(d => d.data());
    if (isDuplicateReceipt(parsed, others)) {
      await expenseRef.update({ status: 'duplicate', merchant: parsed.merchant || null, date: receiptDate, amount: parsed.total, taxYear: deriveTaxYear(receiptDate), description: (parsed.merchant || 'Receipt') + ' (possible duplicate)' });
      return;
    }
  }

  // Compute matchCandidates: up to 3 candidate events sorted by date proximity when finalEventId is null
  const refTime = receiptDate ? Date.parse(receiptDate) : Date.now();
  const matchCandidates = validEventId ? [] : nearbyEvents
    .map(e => {
      const d = e.date && e.date.toDate ? e.date.toDate().getTime() : Date.parse(e.date);
      return { id: e.id, name: e.name || e.title || 'Unnamed', dist: Math.abs((isNaN(d) ? Infinity : d) - refTime) };
    })
    .filter(c => c.dist !== Infinity)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 3)
    .map(c => ({ id: c.id, name: c.name }));

  await expenseRef.update({
    status: receiptDate && parsed.total != null ? 'ok' : 'needs-review',
    merchant: parsed.merchant || null,
    date: receiptDate,
    amount: typeof parsed.total === 'number' ? parsed.total : null,
    tax: typeof parsed.tax === 'number' ? parsed.tax : null,
    lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems : [],
    category: validCategory,
    eventId: validEventId,
    matchConfidence: validEventId && Number.isFinite(parsed.matchConfidence) ? parsed.matchConfidence : null,
    deductionType: validEventId ? 'event' : 'general',
    paymentMethod: parsed.paymentMethod || null,
    taxYear: deriveTaxYear(receiptDate),
    description: parsed.merchant ? `${parsed.merchant} receipt` : 'Scanned receipt',
    matchCandidates,
    categoryGuess: RECEIPT_EXPENSE_CATEGORIES.includes(parsed.category) ? null : (parsed.category || null),
  });
}

/* ═══ receiptStuckSweep — rescue receipts frozen in 'processing' ═══════════
 * parseReceipt only fires on the Storage finalize event. If that event is
 * ever missed (a failed upload, a deploy gap, a dropped trigger) the expense
 * sits at status:'processing' forever — that's the receipt that "loaded for
 * weeks." This runs every 30 min: any processing doc older than ~8 min gets a
 * second chance — re-parse if the image is present, else flip to needs-review
 * so it stops shimmering and Kendell can act on it. Capped per run for cost. */
exports.receiptStuckSweep = onSchedule(
  {
    schedule: '*/30 * * * *', timeZone: 'America/Denver',
    secrets: [anthropicApiKey], memory: '512MiB', timeoutSeconds: 300,
  },
  async () => {
    const cutoffMs = Date.now() - 8 * 60e3;
    let snap;
    try {
      snap = await db.collection('expenses').where('status', '==', 'processing').limit(25).get();
    } catch (e) { console.warn('receiptStuckSweep query failed:', e.message); return; }

    const stuck = snap.docs.filter(d => {
      const c = d.data().createdAt;
      // No timestamp yet, or created before the cutoff → it's been sitting too long.
      return !c || !c.toMillis || c.toMillis() <= cutoffMs;
    }).slice(0, 10);
    if (!stuck.length) { console.log('receiptStuckSweep: nothing stuck.'); return; }

    const bucket = admin.storage().bucket();
    let fixed = 0, flagged = 0;
    for (const d of stuck) {
      const path = d.data().receiptPath || ('receipts/' + d.id + '.jpg');
      try {
        const [exists] = await bucket.file(path).exists();
        if (!exists) {
          await d.ref.update({ status: 'needs-review', description: 'Receipt image missing — re-upload or delete' });
          flagged++;
          continue;
        }
        const [imageBuffer] = await bucket.file(path).download();
        const now = new Date();
        const windowMs = 45 * 24 * 60 * 60 * 1000;
        const eventsSnap = await db.collection('events').get();
        const nearbyEvents = eventsSnap.docs
          .map(x => ({ id: x.id, ...x.data() }))
          .filter(e => {
            const t = e.date && e.date.toDate ? e.date.toDate().getTime() : Date.parse(e.date);
            return !isNaN(t) && Math.abs(t - now.getTime()) <= windowMs;
          });
        const parsed = await parseReceiptWithClaude(imageBuffer, nearbyEvents, anthropicApiKey.value());
        await applyParsedReceipt(d.ref, parsed, nearbyEvents);
        fixed++;
      } catch (e) {
        console.error(`receiptStuckSweep: ${d.id} failed`, e.message);
        try { await d.ref.update({ status: 'needs-review', description: 'Auto-parse failed — please review' }); } catch (_) {}
        flagged++;
      }
    }
    console.log(`receiptStuckSweep: ${stuck.length} stuck → ${fixed} re-parsed, ${flagged} flagged.`);
  }
);

/* ═══ Agent Chat — talk to your agents from the CRM ═══════════════════════
 * onCall backing the Agent Brief chat. Kendell types a message; we load the
 * recent thread + live business context, hand it to Claude with two tools
 * (kick_off_task → agent_tasks queue, resolve_followup → answer a pending
 * agent question), persist both sides to agent_chat/main/messages, and
 * return the reply. Admin-only. */
/* Each chat session is its own thread doc — only the active session's
 * history is sent to the model, so old topics never bleed into new ones.
 * 'main' is the legacy/default session. */
const AGENT_CHAT_THREAD = (sessionId) =>
  db.collection('agent_chat').doc(sessionId || 'main').collection('messages');

function safeSessionId(raw) {
  const s = String(raw || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  return s || 'main';
}

async function agentChatContext() {
  const ctx = { stages: {}, recentLeads: [], followups: [], unmatchedCount: 0 };
  try {
    const leadsSnap = await db.collection('leads').get();
    leadsSnap.forEach(d => {
      const l = d.data();
      const s = l.stage || 'New Lead';
      ctx.stages[s] = (ctx.stages[s] || 0) + 1;
    });
    const recent = leadsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((b.updatedAt && b.updatedAt.seconds) || 0) - ((a.updatedAt && a.updatedAt.seconds) || 0))
      .slice(0, 12);
    ctx.recentLeads = recent.map(l => ({
      id: l.id, name: l.name || '?', stage: l.stage || 'New Lead',
      eventType: l.eventType || '', eventDate: l.eventDate || '', budget: l.budget || '',
    }));
  } catch (e) { console.warn('agentChat leads context failed:', e.message); }
  try {
    const fu = await db.collection('kendell_followups')
      .where('status', '==', 'open').limit(15).get();
    ctx.followups = fu.docs.map(d => ({ id: d.id, type: d.data().type || '', title: d.data().title || '' }));
  } catch (e) { console.warn('agentChat followups context failed:', e.message); }
  try {
    const um = await db.collection('unmatched_messages').where('resolved', '==', false).get();
    ctx.unmatchedCount = um.size;
  } catch (e) { console.warn('agentChat unmatched context failed:', e.message); }
  return ctx;
}

/* ─── query_crm: one generic read tool = full CRM visibility ──────────
 * Instead of a bespoke tool per question, the agent names a collection,
 * optional filters/sort/projection, and reads live data. Whitelisted
 * collections only; output is sanitized + capped to keep tokens down. */
const QUERYABLE_COLLECTIONS = [
  'leads', 'quotes', 'events', 'expenses', 'activity', 'unmatched_messages',
  'kendell_followups', 'agent_tasks', 'call_bookings', 'nurture_queue',
  'inventory', 'projects', 'bartenders', 'payments', 'threads',
  'recent_messages',
];

/* Newest email messages across ALL leads (inbox + sent), via a collection-
 * group query over leads/{x}/threads/{y}/messages. Gives the brief and
 * agents a live view of the freshest email activity without knowing lead
 * ids up front. */
async function fetchRecentMessages(limit) {
  const snap = await db.collectionGroup('messages')
    .orderBy('sentAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => {
    const m = d.data();
    return {
      leadId: d.ref.parent.parent.parent.parent.id,
      direction: m.direction,
      from: m.fromDisplay || m.from || '',
      to: (m.to || []).join(', '),
      subject: m.subject || '',
      snippet: (m.snippet || String(m.bodyText || '').slice(0, 160)),
      sentAt: m.sentAt && m.sentAt.toDate ? m.sentAt.toDate().toISOString() : null,
    };
  });
}

function crmSerializeDoc(d, fields) {
  const raw = d.data();
  const out = { _id: d.id };
  const keys = (fields && fields.length) ? fields : Object.keys(raw);
  for (const k of keys) {
    let v = raw[k];
    if (v === undefined) continue;
    if (v && typeof v.toDate === 'function') v = v.toDate().toISOString();
    else if (typeof v === 'string' && v.length > 300) v = v.slice(0, 300) + '…';
    else if (v && typeof v === 'object') {
      const s = JSON.stringify(v);
      if (s && s.length > 400) v = s.slice(0, 400) + '…';   /* long nested objects ship as truncated JSON text */
    }
    out[k] = v;
  }
  return out;
}

async function runQueryCrm(input) {
  const coll = String(input.collection || '');
  if (!QUERYABLE_COLLECTIONS.includes(coll)) {
    return JSON.stringify({ error: 'unknown collection', allowed: QUERYABLE_COLLECTIONS });
  }
  const limit = Math.min(Math.max(parseInt(input.limit, 10) || 15, 1), 25);
  if (coll === 'recent_messages') {
    try { return JSON.stringify({ count: limit, docs: await fetchRecentMessages(limit) }); }
    catch (e) { return JSON.stringify({ error: 'recent_messages query failed: ' + e.message }); }
  }
  let base;
  if (coll === 'threads') {
    const leadId = String(input.leadId || '');
    if (!leadId) return JSON.stringify({ error: 'threads requires leadId (a doc id from the leads collection)' });
    base = db.collection('leads').doc(leadId).collection('threads');
  } else {
    base = db.collection(coll);
  }
  const filters = (Array.isArray(input.filters) ? input.filters : []).slice(0, 3);
  const OPS = ['==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains'];
  let docs;
  try {
    let q = base;
    for (const f of filters) q = q.where(String(f.field), OPS.includes(f.op) ? f.op : '==', f.value);
    if (input.orderBy) q = q.orderBy(String(input.orderBy), input.direction === 'asc' ? 'asc' : 'desc');
    docs = (await q.limit(limit).get()).docs;
  } catch (e) {
    /* Composite filter+sort combos need Firestore indexes we may not have.
     * Fall back: pull a capped slice and filter/sort in memory. */
    const all = (await base.limit(200).get()).docs;
    const match = (d) => filters.every(f => {
      let v = d.data()[f.field];
      if (v && typeof v.toDate === 'function') v = v.toDate().toISOString();
      switch (f.op) {
        case '!=': return v !== f.value;
        case '<': return v < f.value;   case '<=': return v <= f.value;
        case '>': return v > f.value;   case '>=': return v >= f.value;
        case 'in': return Array.isArray(f.value) && f.value.includes(v);
        case 'array-contains': return Array.isArray(v) && v.includes(f.value);
        default: return v === f.value;
      }
    });
    docs = all.filter(match);
    if (input.orderBy) {
      const dir = input.direction === 'asc' ? 1 : -1;
      const key = (d) => { let v = d.data()[input.orderBy]; return (v && typeof v.toDate === 'function') ? v.toDate().getTime() : v; };
      docs.sort((a, b) => (key(a) > key(b) ? dir : key(a) < key(b) ? -dir : 0));
    }
    docs = docs.slice(0, limit);
  }
  const rows = docs.map(d => crmSerializeDoc(d, Array.isArray(input.fields) ? input.fields.map(String) : null));
  return JSON.stringify({ count: rows.length, rows }).slice(0, 12000);
}

const QUERY_CRM_TOOL = {
  name: 'query_crm',
  description: 'Read live CRM data from any collection: leads, quotes, events, expenses, activity, unmatched_messages, kendell_followups, agent_tasks, threads (email threads under a lead — pass leadId), and more. ALWAYS use this to look up real data before answering questions about the business — dig first, never guess and never ask permission to check. Use the fields projection to fetch only what you need.',
  input_schema: {
    type: 'object',
    properties: {
      collection: { type: 'string', enum: QUERYABLE_COLLECTIONS },
      leadId: { type: 'string', description: 'Required when collection is "threads": the lead doc id whose email threads to read' },
      filters: {
        type: 'array', maxItems: 3,
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            op: { type: 'string', enum: ['==', '!=', '<', '<=', '>', '>=', 'in', 'array-contains'] },
            value: { description: 'Value to compare against (string/number/bool/array for "in")' },
          },
          required: ['field', 'op', 'value'],
        },
      },
      orderBy: { type: 'string', description: 'Field to sort by, e.g. createdAt or updatedAt' },
      direction: { type: 'string', enum: ['asc', 'desc'] },
      limit: { type: 'number', description: '1-25, default 15. Keep small to save tokens.' },
      fields: { type: 'array', items: { type: 'string' }, description: 'Only return these fields (plus _id). Strongly preferred.' },
    },
    required: ['collection'],
  },
};

const AGENT_CHAT_TOOLS = [
  QUERY_CRM_TOOL,
  {
    name: 'kick_off_task',
    description: 'Queue a task for one of the Lake Salt agents. Use when Kendell asks for work to be started (email processing, lead hunting, CRM updates, research, anything operational). The task doc is picked up by the agent runner.',
    input_schema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['comms', 'lead-gen', 'general'], description: 'comms = email/CRM/quotes; lead-gen = prospecting; general = anything else' },
        title: { type: 'string', description: 'Short imperative title' },
        instruction: { type: 'string', description: 'Self-contained instructions for the agent' },
      },
      required: ['agent', 'title', 'instruction'],
    },
  },
  {
    name: 'resolve_followup',
    description: 'Answer/close an open item in kendell_followups on Kendell\'s behalf, when he gives a decision in chat. Only use ids from the OPEN FOLLOWUPS context list.',
    input_schema: {
      type: 'object',
      properties: {
        followupId: { type: 'string' },
        decision: { type: 'string', enum: ['approved', 'denied', 'done', 'dismissed'] },
        note: { type: 'string', description: 'Kendell\'s reasoning or extra instructions, if any' },
      },
      required: ['followupId', 'decision'],
    },
  },
];

async function runAgentChatTool(name, input, adminUser) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  if (name === 'query_crm') {
    return await runQueryCrm(input);
  }
  if (name === 'kick_off_task') {
    const ref = await db.collection('agent_tasks').add({
      agent: input.agent || 'general',
      title: String(input.title || '').slice(0, 120),
      instruction: String(input.instruction || '').slice(0, 4000),
      status: 'queued',
      source: 'agent_chat',
      requestedBy: adminUser.email || adminUser.uid,
      createdAt: now,
    });
    return `Task queued (${ref.id}) for the ${input.agent} agent.`;
  }
  if (name === 'resolve_followup') {
    const ref = db.collection('kendell_followups').doc(String(input.followupId || ''));
    const doc = await ref.get();
    if (!doc.exists) return `No followup with id ${input.followupId} — it may already be resolved.`;
    await ref.update({
      status: 'answered',
      completed: true,
      decision: input.decision,
      decisionNote: String(input.note || ''),
      answeredVia: 'agent_chat',
      answeredAt: now,
    });
    return `Followup "${doc.data().title || input.followupId}" marked ${input.decision}.`;
  }
  return `Unknown tool ${name}.`;
}

exports.agentChat = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request) => {
    const adminUser = await requireAdmin(request);
    const text = String((request.data && request.data.message) || '').trim().slice(0, 4000);
    if (!text) throw new HttpsError('invalid-argument', 'Empty message.');
    const sessionId = safeSessionId(request.data && request.data.sessionId);

    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('agent_chat').doc(sessionId).set(
      { lastMessageAt: nowTs, createdAt: nowTs }, { merge: true });
    await AGENT_CHAT_THREAD(sessionId).add({ role: 'user', text, createdAt: nowTs });

    /* Rebuild this session's conversation for the model (oldest → newest). */
    let history = [];
    try {
      const snap = await AGENT_CHAT_THREAD(sessionId).orderBy('createdAt', 'desc').limit(20).get();
      history = snap.docs.reverse().map(d => {
        const m = d.data();
        return { role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text || '').slice(0, 4000) };
      }).filter(m => m.content);
    } catch (e) { console.warn('agentChat history read failed:', e.message); }
    if (!history.length || history[history.length - 1].role !== 'user') {
      history.push({ role: 'user', content: text });
    }

    const ctx = await agentChatContext();
    const system =
`You're Kendell's right hand for Lake Salt, his mobile bar (dry-hire) business in Utah, chatting inside his CRM. Voice: casual and friendly, like a sharp friend who runs his ops — contractions are good, corporate stiffness and flattery are not. Keep replies short. Plain text only, no markdown headers.

DIG FIRST. Before answering anything about the business, use query_crm to pull the real data — leads, quotes, events, email threads, whatever the question needs. Never say you'd "need to check" or ask permission to look something up: just look, then answer with specifics. Only come back with a question when it's a genuine judgment call you can't resolve from data.

You can act, not just talk: kick_off_task queues real work for the comms agent (email/CRM/quotes), lead-gen agent (prospecting), or general agent. resolve_followup closes an open item when Kendell gives a decision. Confirm what you did in one line.

${AUTONOMY_POLICY}

SNAPSHOT (query_crm for anything deeper)
Pipeline: ${JSON.stringify(ctx.stages)}
Open followups (id · type · title): ${ctx.followups.map(f => `${f.id} · ${f.type} · ${f.title}`).join(' | ') || 'none'}
Unresolved unmatched messages: ${ctx.unmatchedCount}`;

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey.value() });

    const actions = [];
    let messages = history.map(m => ({ role: m.role, content: m.content }));
    let reply = '';
    for (let turn = 0; turn < 6; turn++) {
      const res = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system,
        tools: AGENT_CHAT_TOOLS,
        messages,
      });
      const toolUses = res.content.filter(b => b.type === 'tool_use');
      const textBlocks = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (!toolUses.length) { reply = textBlocks; break; }

      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const tu of toolUses) {
        let out;
        try { out = await runAgentChatTool(tu.name, tu.input || {}, adminUser); }
        catch (e) { out = `Tool ${tu.name} failed: ${e.message}`; }
        if (tu.name !== 'query_crm') actions.push(out);   /* reads are internal, not user-facing actions */
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      messages.push({ role: 'user', content: results });
      reply = textBlocks; // keep last text in case the loop caps out
    }
    if (!reply) reply = actions.length ? actions.join(' ') : 'Done.';

    await AGENT_CHAT_THREAD(sessionId).add({
      role: 'assistant',
      text: reply,
      actions,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { reply, actions };
  }
);

/* ═══ Executive Agent Brief — daily AI-written brief with autonomy ═════════
 * A scheduled run (7am MT) has Claude write a real morning brief: rotating
 * quote, neon-highlighted summary, a task list, and a heads-up for later
 * this week. Autonomy policy: routine work (follow-ups, email responses,
 * CRM hygiene) is auto-queued to agent_tasks without asking; anything
 * touching quotes/pricing/money is flagged needsApproval and waits for a
 * tap. Result cached in agent_brief/latest — the dashboard just reads it. */

const AUTONOMY_POLICY =
`AUTONOMY POLICY (Kendell's standing orders):
- Follow-ups (including quote/proposal follow-up nudges), routine email responses, CRM cleanup/hygiene, lead triage: ACT — queue the work yourself, then report it in the brief as already handled.
- NEW pricing, discounts, contracts, anything that states or changes money: PROPOSE with needsApproval=true and wait.
- Keep proactively improving the CRM data quality without being asked.`;

const PUBLISH_BRIEF_TOOL = [{
  name: 'publish_brief',
  description: 'Publish the executive morning brief. Wrap the 3-6 most important words/phrases in the brief text with **double asterisks** — they render as bright neon highlights.',
  input_schema: {
    type: 'object',
    properties: {
      quote: { type: 'string', description: 'Short motivational quote for a scrappy business owner, with attribution. Vary it daily.' },
      brief: { type: 'string', description: '2-4 sentence executive summary of where the business stands and what matters today. Use **highlights** on the critical words. Plain text otherwise.' },
      tasks: {
        type: 'array', maxItems: 6,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short imperative line shown collapsed' },
            detail: { type: 'string', description: '1-3 sentences shown when expanded: the why and the specifics' },
            tag: { type: 'string', description: 'Short source chip, e.g. LEAD, EMAIL, QUOTE, CRM, EVENT' },
            status: { type: 'string', enum: ['handled', 'proposed', 'fyi'], description: 'handled = you queued it yourself; proposed = needs Kendell tap; fyi = no action' },
            needsApproval: { type: 'boolean' },
            action: {
              type: 'object', description: 'The agent task to queue (required for handled/proposed)',
              properties: {
                agent: { type: 'string', enum: ['comms', 'lead-gen', 'general'] },
                title: { type: 'string' },
                instruction: { type: 'string' },
              },
            },
          },
          required: ['title', 'detail', 'status'],
        },
      },
      pushAlerts: {
        type: 'array', maxItems: 3,
        description: 'Phone push notifications to fire NOW — only for things needing timely human action (client waiting on a reply for days, quote about to expire, unanswered question blocking a response). Speak directly to the person: "It\'s been 3 days on the Smith wedding — just 2 questions and we can reply." Empty array when nothing is push-worthy. Never repeat an alert already pushed recently.',
        items: {
          type: 'object',
          properties: {
            audience: { type: 'string', enum: ['ops', 'tech', 'all'], description: 'ops = Maddie (client/pipeline work), tech = Kendell (system/code), all = both' },
            title: { type: 'string', description: 'Short push title, no name prefix — that is added automatically' },
            body: { type: 'string', description: '1-2 sentences: what, why now, what to do' },
            tag: { type: 'string', description: 'Stable slug for this alert topic (e.g. "smith-reply-overdue") — used to dedupe across refreshes' },
          },
          required: ['audience', 'title', 'body', 'tag'],
        },
      },
      headsUp: { type: 'string', description: 'One intro line for the heads-up section (e.g. "Quiet week ahead — no events booked.").' },
      headsUpBullets: {
        type: 'array', maxItems: 4, items: { type: 'string' },
        description: 'Short ✦-style bullets: specific things coming tomorrow / later this week worth knowing now.',
      },
    },
    required: ['quote', 'brief', 'tasks', 'headsUp'],
  },
}];

async function buildExecBriefContext() {
  const ctx = await agentChatContext();
  try {
    const now = new Date();
    const evSnap = await db.collection('events').get();
    ctx.upcomingEvents = evSnap.docs.map(d => d.data())
      .filter(e => e.date && new Date(e.date) >= now && new Date(e.date) < new Date(now.getTime() + 14 * 864e5))
      .map(e => ({ name: e.name || e.client || 'event', date: e.date, type: e.type || '' }))
      .slice(0, 8);
  } catch (e) { ctx.upcomingEvents = []; }
  try {
    const um = await db.collection('unmatched_messages').where('resolved', '==', false).limit(10).get();
    ctx.unmatchedSamples = um.docs.map(d => ({
      from: d.data().fromDisplay || d.data().from || '', subject: d.data().subject || '',
    }));
  } catch (e) { ctx.unmatchedSamples = []; }
  /* What the runner actually completed in the last 24h — the brief reports
   * finished work, not intentions. */
  try {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 3600e3);
    const done = await db.collection('agent_tasks').where('completedAt', '>=', since).get();
    ctx.recentAgentWork = done.docs.map(d => ({
      title: d.data().title, status: d.data().status, result: String(d.data().result || '').slice(0, 200),
    })).slice(0, 12);
  } catch (e) { ctx.recentAgentWork = []; }
  /* Freshest email in BOTH directions — the brief must never miss a client
   * message that arrived after the CRM snapshot was assembled. */
  try { ctx.recentMessages = await fetchRecentMessages(15); }
  catch (e) { ctx.recentMessages = []; console.warn('brief recentMessages failed:', e.message); }
  return ctx;
}

async function generateAgentBriefCore(trigger) {
  const ctx = await buildExecBriefContext();
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: anthropicApiKey.value() });

  const system =
`You're the executive assistant for Lake Salt, a mobile bar (dry-hire) business in Utah, working for Kendell (owner) and Maddie (runs day-to-day operations — client communication, follow-ups, quotes, bookings). Kendell handles code, the CRM itself, and system issues; address operational items to Maddie and system items to Kendell, by name, in the brief and in push alerts. Voice: casual, friendly, and sharp — like a trusted ops partner texting the real state of things. No corporate stiffness, no filler, no restating counts they can see elsewhere. Interpret: what's hot, what's stalling, what you already handled, the one thing a human must do.

DIG BEFORE YOU WRITE. Use query_crm to pull real data first — at minimum the quotes collection (how many are out, how old, which leads they belong to) and the newest leads. The recent_messages collection gives you the newest emails in both directions across all leads — use it to catch anything a CRM summary is missing. Never publish numbers you didn't verify with a query. 2-4 queries is plenty; keep limits small.

PUSH ALERTS: if something needs timely human action — a client waiting days for our reply, a quote about to expire, a question blocking a response — include it in pushAlerts, addressed to the right person, with a concrete ask ("just 2 questions before we can respond: …"). Nothing push-worthy → empty array. The brief itself is not a push; only true act-now items go in pushAlerts.

KENDELL'S PRIORITIES (in order):
1. Fresh website/form leads — speed-to-lead wins these. Newest inbound leads get first attention every day.
2. Outstanding quotes — every quote sent with no reply is a follow-up waiting to happen. Track how long each has been out and plan the chase.
3. Everything else. The wedding-expo cohort is NOT urgent pipeline: they've already been contacted (some multiple times). They get ONE final follow-up pass — and only leads whose event date hasn't passed. Don't count them as fresh leads or let them dominate the brief.

MOVING ON RULE: if a lead's event date is close (within ~2 weeks) and they've never responded to our outreach, they've gone another direction. Do NOT queue more follow-ups — recommend marking them Lost and move on. We never annoy people.

${AUTONOMY_POLICY}

When you've seen enough, call publish_brief exactly once.

SNAPSHOT (verify anything important with query_crm)
Pipeline: ${JSON.stringify(ctx.stages)}
Open followups: ${ctx.followups.map(f => `${f.id} · ${f.type} · ${f.title}`).join(' | ') || 'none'}
Unresolved unmatched messages (${ctx.unmatchedCount}): ${JSON.stringify(ctx.unmatchedSamples)}
Events next 14 days: ${JSON.stringify(ctx.upcomingEvents)}
Newest email messages, both directions (LIVE — trust these over stale CRM fields): ${JSON.stringify(ctx.recentMessages || [])}
Agent work completed in the last 24h (report these as DONE, with outcomes): ${JSON.stringify(ctx.recentAgentWork || [])}`;

  const tools = [QUERY_CRM_TOOL, ...PUBLISH_BRIEF_TOOL];
  let messages = [{ role: 'user', content: 'Write this morning\'s brief. Dig into the data first.' }];
  let brief = null;
  for (let turn = 0; turn < 8 && !brief; turn++) {
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      system,
      tools,
      /* Last loop turn: stop digging, force the publish. */
      ...(turn === 7 ? { tool_choice: { type: 'tool', name: 'publish_brief' } } : {}),
      messages,
    });
    const toolUses = res.content.filter(b => b.type === 'tool_use');
    const pub = toolUses.find(t => t.name === 'publish_brief');
    if (pub) { brief = pub.input; break; }
    messages.push({ role: 'assistant', content: res.content });
    if (!toolUses.length) {
      messages.push({ role: 'user', content: 'Call publish_brief now.' });
      continue;
    }
    const results = [];
    for (const tu of toolUses) {
      let out;
      try { out = await runQueryCrm(tu.input || {}); }
      catch (e) { out = `query failed: ${e.message}`; }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }
  if (!brief) throw new Error('model returned no publish_brief call');
  const now = admin.firestore.FieldValue.serverTimestamp();

  /* Autonomy: queue every task the assistant decided to handle itself. */
  const tasks = [];
  for (const t of (brief.tasks || []).slice(0, 6)) {
    const task = { title: String(t.title || ''), detail: String(t.detail || ''),
                   tag: String(t.tag || '').slice(0, 12).toUpperCase(),
                   status: t.status, needsApproval: !!t.needsApproval, action: t.action || null };
    if (t.status === 'handled' && t.action && !t.needsApproval) {
      try {
        const ref = await db.collection('agent_tasks').add({
          agent: t.action.agent || 'general',
          title: String(t.action.title || t.title).slice(0, 120),
          instruction: String(t.action.instruction || t.detail).slice(0, 4000),
          status: 'queued', source: 'daily_brief', createdAt: now,
        });
        task.queuedTaskId = ref.id;
      } catch (e) { console.warn('brief auto-queue failed:', e.message); }
    }
    tasks.push(task);
  }

  const doc = {
    quote: String(brief.quote || ''),
    brief: String(brief.brief || ''),
    tasks,
    headsUp: String(brief.headsUp || ''),
    headsUpBullets: Array.isArray(brief.headsUpBullets) ? brief.headsUpBullets.slice(0, 4).map(String) : [],
    trigger, generatedAt: now,
  };
  await db.collection('agent_brief').doc('latest').set(doc);

  /* Fire the model's push alerts. Dedupe on tag: the same alert topic won't
   * re-push within 20h no matter how often the brief refreshes. */
  for (const a of (brief.pushAlerts || []).slice(0, 3)) {
    try {
      const tag = String(a.tag || '').slice(0, 60) || 'brief-alert';
      const since = admin.firestore.Timestamp.fromMillis(Date.now() - 20 * 3600e3);
      const dup = await db.collection('notifications')
        .where('tag', '==', tag).where('createdAt', '>=', since).limit(1).get();
      if (!dup.empty) continue;
      await db.collection('notifications').add({
        title: String(a.title || '').slice(0, 120),
        body: String(a.body || '').slice(0, 400),
        url: 'https://lakesalt.us/admin/#crm',
        tag,
        audience: ['ops', 'tech', 'all'].includes(a.audience) ? a.audience : 'all',
        source: 'agent_brief',
        createdAt: now,
      });
    } catch (e) { console.warn('brief pushAlert failed:', e.message); }
  }
  return doc;
}

exports.dailyAgentBrief = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'America/Denver', secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async () => {
    const b = await generateAgentBriefCore('schedule');
    console.log(`dailyAgentBrief: published (${b.tasks.length} tasks).`);
  }
);

exports.refreshAgentBrief = onCall(
  { secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request) => {
    await requireAdmin(request);
    return await generateAgentBriefCore('manual');
  }
);

/* ═══ Agent Task Runner (Phase 2) — queued work actually gets DONE ════════
 * Every 30 min during business hours, pull queued agent_tasks and execute
 * them with a Claude tool loop. Capabilities: read anything (query_crm),
 * update leads, resolve unmatched messages, and email — routine follow-ups
 * send directly (Kendell's standing autonomy policy); anything touching
 * pricing/quotes/contracts becomes a Gmail DRAFT for his review, never an
 * autonomous send. Every task ends with a logged outcome. */

function rfc822(to, subject, body) {
  const msg =
    `From: Lake Salt <${BUSINESS_EMAIL}>\r\nTo: ${to}\r\nSubject: ${subject}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`;
  return Buffer.from(msg).toString('base64url');
}

async function leadEmailAllowed(leadId, to) {
  const doc = await db.collection('leads').doc(String(leadId)).get();
  if (!doc.exists) return false;
  const l = doc.data();
  const addrs = [l.email, l.replyToAddress, ...(l.emailAliases || [])]
    .filter(Boolean).map(e => String(e).toLowerCase().trim());
  return addrs.includes(String(to).toLowerCase().trim());
}

/* Follow-ups ABOUT an existing quote may send autonomously (Kendell: "I
 * don't want to babysit follow-ups"). What still requires his review:
 * emails that state or change money — figures, discounts, contracts. */
const MONEY_RE = /\$\s?\d|\bprice[sd]?\b|pricing|discount|contract|deposit|invoice|payment/i;

const RUNNER_TOOLS = [
  QUERY_CRM_TOOL,
  {
    name: 'update_lead',
    description: 'Update a lead: move stage, append a note, or set basic fields. Allowed stages: New Lead, Contacted, Proposal Sent, Booked, Booked-Tentative, Completed, Lost, Closed.',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        stage: { type: 'string' },
        note: { type: 'string', description: 'Appended to the lead notes with an [agent] prefix' },
        fields: { type: 'object', description: 'Other safe fields: eventDate, eventType, budget, guestCount, phone' },
      },
      required: ['leadId'],
    },
  },
  {
    name: 'resolve_unmatched',
    description: 'Resolve an unmatched_messages doc: mark not_a_lead, or attach it to a lead by id.',
    input_schema: {
      type: 'object',
      properties: {
        unmatchedId: { type: 'string' },
        resolution: { type: 'string', enum: ['not_a_lead', 'attached'] },
        leadId: { type: 'string', description: 'Required when resolution=attached' },
      },
      required: ['unmatchedId', 'resolution'],
    },
  },
  {
    name: 'close_followup',
    description: 'Close an open kendell_followups item that is obsolete, duplicated by the agent system, or already resolved. Never close items needing a real Kendell decision (money, personal commitments).',
    input_schema: {
      type: 'object',
      properties: {
        followupId: { type: 'string' },
        reason: { type: 'string', description: 'Why this no longer needs Kendell' },
      },
      required: ['followupId', 'reason'],
    },
  },
  {
    name: 'send_email',
    description: 'Send a routine email (follow-up, check-in, quote/proposal follow-up nudge, answer a simple question) from contact@lakesalt.us to a lead. The recipient MUST be that lead\'s email on file. FORBIDDEN when the email states or changes money — specific figures, discounts, contracts, payment terms — use create_draft for those.',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' }, to: { type: 'string' },
        subject: { type: 'string' }, body: { type: 'string', description: 'Plain text, warm and professional, signed Lake Salt' },
      },
      required: ['leadId', 'to', 'subject', 'body'],
    },
  },
  {
    name: 'create_draft',
    description: 'Create a Gmail draft for Kendell to review and send himself. Use for anything money-related or sensitive.',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' }, to: { type: 'string' },
        subject: { type: 'string' }, body: { type: 'string' },
      },
      required: ['leadId', 'to', 'subject', 'body'],
    },
  },
  {
    name: 'complete_task',
    description: 'Finish this task. Call exactly once when done (or when blocked and a human is needed).',
    input_schema: {
      type: 'object',
      properties: {
        outcome: { type: 'string', enum: ['done', 'blocked'] },
        summary: { type: 'string', description: '1-3 sentences: what you did / why blocked. Shown to Kendell.' },
      },
      required: ['outcome', 'summary'],
    },
  },
];

async function runRunnerTool(name, input, gmail, sentGuard) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  if (name === 'query_crm') return await runQueryCrm(input);
  if (name === 'update_lead') {
    const ref = db.collection('leads').doc(String(input.leadId || ''));
    const doc = await ref.get();
    if (!doc.exists) return 'No such lead.';
    const patch = { updatedAt: now };
    const STAGES = ['New Lead', 'Contacted', 'Proposal Sent', 'Booked', 'Booked-Tentative', 'Completed', 'Lost', 'Closed'];
    if (input.stage) {
      if (!STAGES.includes(input.stage)) return `Invalid stage. Allowed: ${STAGES.join(', ')}`;
      patch.stage = input.stage;
    }
    if (input.note) patch.notes = ((doc.data().notes || '') + `\n[agent ${new Date().toISOString().slice(0, 10)}] ${String(input.note).slice(0, 500)}`).trim();
    const SAFE = ['eventDate', 'eventType', 'budget', 'guestCount', 'phone'];
    for (const [k, v] of Object.entries(input.fields || {})) if (SAFE.includes(k)) patch[k] = v;
    await ref.update(patch);
    await db.collection('activity').add({ type: 'agent_update', leadId: input.leadId, note: `Agent updated lead: ${Object.keys(patch).filter(k => k !== 'updatedAt').join(', ')}`, createdAt: now });
    return `Lead updated (${Object.keys(patch).filter(k => k !== 'updatedAt').join(', ')}).`;
  }
  if (name === 'resolve_unmatched') {
    const ref = db.collection('unmatched_messages').doc(String(input.unmatchedId || ''));
    const doc = await ref.get();
    if (!doc.exists) return 'No such unmatched message.';
    if (input.resolution === 'attached' && input.leadId) {
      const leadRef = db.collection('leads').doc(String(input.leadId));
      if (!(await leadRef.get()).exists) return 'No such lead to attach to.';
      await writeMessageToLead(leadRef, doc.data().message || doc.data());
    }
    await ref.update({ resolved: true, resolution: input.resolution, resolvedVia: 'agent_runner', resolvedAt: now, ...(input.leadId ? { attachedLeadId: input.leadId } : {}) });
    return `Unmatched message ${input.resolution === 'attached' ? 'attached to lead' : 'marked not_a_lead'}.`;
  }
  if (name === 'close_followup') {
    const ref = db.collection('kendell_followups').doc(String(input.followupId || ''));
    const doc = await ref.get();
    if (!doc.exists) return 'No such followup.';
    await ref.update({
      status: 'answered', completed: true, decision: 'dismissed',
      decisionNote: `[agent triage] ${String(input.reason || '').slice(0, 300)}`,
      answeredVia: 'agent_runner', answeredAt: now,
    });
    return `Followup "${doc.data().title || input.followupId}" closed.`;
  }
  if (name === 'send_email' || name === 'create_draft') {
    if (!gmail) return 'Gmail is not connected (OAuth secrets missing) — cannot email. Complete the task as blocked.';
    if (!(await leadEmailAllowed(input.leadId, input.to))) return 'Refused: recipient is not this lead\'s email on file.';
    if (name === 'send_email' && MONEY_RE.test(`${input.subject} ${input.body}`)) {
      return 'Refused: this reads as money-related. Use create_draft so Kendell reviews it.';
    }
    if (name === 'send_email') {
      /* Idempotency guard: never email the same address twice in 7 days,
       * no matter what the prompt/model thinks. Two layers, both fail
       * CLOSED: an in-process set (same-task duplicate tool calls) and a
       * single-equality Firestore lookup (no composite index needed). */
      const addr = String(input.to).toLowerCase().trim();
      if (sentGuard) {
        if (sentGuard.has(addr)) return `Refused: you already emailed ${input.to} in this task — do not send again.`;
        sentGuard.add(addr);
      }
      try {
        const recent = await db.collection('activity').where('to', '==', addr).limit(5).get();
        const cutoff = Date.now() - 7 * 86400e3;
        const already = recent.docs.some(d => {
          const c = d.data().createdAt;
          return !c || c.toMillis() >= cutoff;
        });
        if (already) return `Refused: ${input.to} already received an agent email in the last 7 days — note the skip in your summary.`;
      } catch (e) {
        return `Send blocked: duplicate-check failed (${e.message}). Do not retry this send; note it in your summary.`;
      }
    }
    const raw = rfc822(input.to, String(input.subject).slice(0, 200), String(input.body).slice(0, 5000));
    if (name === 'send_email') {
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      await db.collection('activity').add({ type: 'agent_email_sent', leadId: input.leadId, to: String(input.to).toLowerCase().trim(), note: `Agent emailed ${input.to}: "${String(input.subject).slice(0, 100)}"`, createdAt: now });
      return `Email sent to ${input.to}.`;
    }
    await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
    await db.collection('activity').add({ type: 'agent_draft_created', leadId: input.leadId, note: `Agent drafted email to ${input.to}: "${String(input.subject).slice(0, 100)}" — review in Gmail Drafts`, createdAt: now });
    return `Draft created for ${input.to} — Kendell will review it in Gmail.`;
  }
  return `Unknown tool ${name}.`;
}

async function executeAgentTask(taskDoc, client, gmail) {
  const t = taskDoc.data();
  await taskDoc.ref.update({ status: 'running', startedAt: admin.firestore.FieldValue.serverTimestamp() });
  const system =
`You execute one queued task for Lake Salt, Kendell's mobile bar business in Utah. Work it end-to-end with your tools, then call complete_task exactly once.

Rules:
- Dig with query_crm before acting; verify lead ids and emails from real data.
- Routine follow-up/check-in emails — INCLUDING follow-ups on an already-sent quote/proposal: send them (send_email). Warm, casual-professional, short, signed "Kendell — Lake Salt". Never pushy. Don't restate dollar figures in follow-ups.
- Emails that state or change money (figures, discounts, contracts, payment terms): create_draft only.
- MOVING ON RULE: if a lead's event is within ~2 weeks and they never responded, don't email them — mark them Lost with a note instead.
- If the task can't be done with these tools, complete_task with outcome=blocked and say what's needed.`;

  let messages = [{ role: 'user', content: `TASK: ${t.title}\n\nINSTRUCTIONS: ${t.instruction || t.detail || '(none)'}\n\nQueued by: ${t.source || 'unknown'} · agent hint: ${t.agent || 'general'}` }];
  const sentGuard = new Set();   /* addresses emailed within THIS task */
  let result = null;
  const MAX_TURNS = 16;
  for (let turn = 0; turn < MAX_TURNS && !result; turn++) {
    const res = await client.messages.create({
      model: 'claude-sonnet-5', max_tokens: 1500, system, tools: RUNNER_TOOLS,
      ...(turn === MAX_TURNS - 1 ? { tool_choice: { type: 'tool', name: 'complete_task' } } : {}),
      messages,
    });
    const toolUses = res.content.filter(b => b.type === 'tool_use');
    const done = toolUses.find(b => b.name === 'complete_task');
    if (done) { result = done.input; break; }
    if (!toolUses.length) { messages.push({ role: 'assistant', content: res.content }, { role: 'user', content: 'Use your tools or call complete_task.' }); continue; }
    messages.push({ role: 'assistant', content: res.content });
    const outs = [];
    for (const tu of toolUses) {
      let out;
      try { out = await runRunnerTool(tu.name, tu.input || {}, gmail, sentGuard); }
      catch (e) { out = `Tool ${tu.name} failed: ${e.message}`; }
      outs.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    messages.push({ role: 'user', content: outs });
  }
  const now = admin.firestore.FieldValue.serverTimestamp();
  const blocked = !(result && result.outcome === 'done');
  await taskDoc.ref.update({
    status: blocked ? 'blocked' : 'done',
    result: String((result && result.summary) || 'runner gave no summary').slice(0, 1000),
    completedAt: now,
  });

  /* A blocked task is a QUESTION for a human. Surface it as a decision
   * followup + an actionable push: tapping the push opens #decide/<id> —
   * a screen with the question and Yes/No buttons. Answering queues a
   * follow-on task so the agent acts on the decision (no Claude app needed). */
  if (blocked) {
    try {
      const t = taskDoc.data();
      const question = String((result && result.summary) || t.title || 'Agent needs a decision').slice(0, 500);
      const fuRef = await db.collection('kendell_followups').add({
        type: 'decision',
        leadId: t.leadId || null,
        leadName: t.leadName || null,
        title: `🤔 ${String(t.title || 'Agent question').slice(0, 110)}`,
        notes: question,
        sourceTaskId: taskDoc.id,
        sourceAgent: t.agent || 'general',
        status: 'open',
        createdAt: now,
      });
      await db.collection('notifications').add({
        title: `🤔 Decision needed: ${String(t.title || 'agent question').slice(0, 90)}`,
        body: question.slice(0, 240),
        url: `https://lakesalt.us/admin/#decide/${fuRef.id}`,
        tag: `decision-${taskDoc.id}`,
        kind: 'decision',
        followupId: fuRef.id,
        audience: 'ops',
        createdAt: now,
      });
    } catch (e) { console.warn('blocked-task decision surface failed:', e.message); }
  }
  return result;
}

exports.agentTaskRunner = onSchedule(
  {
    schedule: '*/30 8-20 * * *', timeZone: 'America/Denver',
    secrets: [anthropicApiKey, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN],
    timeoutSeconds: 540, memory: '512MiB',
  },
  async () => {
    const snap = await db.collection('agent_tasks')
      .where('status', '==', 'queued').limit(8).get();
    const ready = snap.docs.filter(d => {
      const nb = d.data().notBefore;
      return !nb || nb.toMillis() <= Date.now();
    }).slice(0, 4);
    if (!ready.length) { console.log('agentTaskRunner: nothing ready.'); return; }
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey.value() });
    const { gmail } = buildGmailClient();
    const docs = ready.sort((a, b) =>
      ((a.data().createdAt && a.data().createdAt.seconds) || 0) - ((b.data().createdAt && b.data().createdAt.seconds) || 0));
    for (const d of docs) {
      try {
        const r = await executeAgentTask(d, client, gmail);
        console.log(`agentTaskRunner: ${d.id} → ${(r && r.outcome) || 'no result'}: ${(r && r.summary || '').slice(0, 150)}`);
      } catch (e) {
        console.error(`agentTaskRunner: ${d.id} crashed:`, e.message);
        await d.ref.update({ status: 'error', result: e.message.slice(0, 500), completedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
  }
);

/* ═══ Proactive Manager Loop (Phase 3) ════════════════════════════════════
 * The manager doesn't wait to be asked:
 *  - onLeadCreated: a fresh organic lead instantly queues a first-touch
 *    task (speed-to-lead) and pings Kendell's phone.
 *  - middayLeadSweep: noon catch-all — any recent lead with no outbound
 *    contact and no pending first-touch task gets one queued.
 *  - The morning brief reports what the runner DID (last 24h), so
 *    "handled" means completed work, not intentions. */

async function hasPendingFirstTouch(leadId) {
  const q = await db.collection('agent_tasks')
    .where('leadId', '==', leadId).limit(5).get();
  return q.docs.some(d => ['queued', 'running', 'done'].includes(d.data().status) && d.data().kind === 'first_touch');
}

async function queueFirstTouch(leadId, lead, source) {
  return await db.collection('agent_tasks').add({
    agent: 'comms', kind: 'first_touch', leadId,
    /* Human-feel delay: never reply to a brand-new lead in under ~12 min —
     * an instant response reads as automated. Runner skips until notBefore. */
    notBefore: admin.firestore.Timestamp.fromMillis(Date.now() + 12 * 60e3),
    title: `First-touch: ${lead.name || 'new lead'}`,
    instruction:
      `New lead just came in: ${lead.name || '?'} <${lead.email || 'no email'}> — ` +
      `${lead.eventType || 'event'}${lead.eventDate ? ' on ' + lead.eventDate : ''}` +
      `${lead.guestCount ? ', ~' + lead.guestCount + ' guests' : ''}. ` +
      `Query the lead + threads first; if we've already replied, complete with a note. Otherwise send a warm, personal first-touch email (lead id ${leadId}): thank them, confirm we'd love to help, ask one useful clarifying question if key details are missing. No pricing. Then move stage to Contacted.`,
    status: 'queued', source, createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

const { onDocumentCreated: onDocCreatedLead } = require('firebase-functions/v2/firestore');
exports.onLeadCreated = onDocCreatedLead(
  {
    document: 'leads/{leadId}',
    secrets: [anthropicApiKey, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN],
    timeoutSeconds: 300, memory: '512MiB',
  },
  async (event) => {
  const lead = event.data && event.data.data();
  if (!lead || !lead.email) return;
  const src = String(lead.source || '').toLowerCase();
  /* Imports/backfills don't get insta-touched — only organic arrivals. */
  if (lead.importBatch || src.includes('knot') || src.includes('import') || src.includes('expo')) return;
  if (await hasPendingFirstTouch(event.params.leadId)) return;
  await queueFirstTouch(event.params.leadId, lead, 'lead_created_trigger');
  console.log(`onLeadCreated: first-touch queued for ${lead.name || event.params.leadId} (sends after ~12min human-feel delay)`);
  try {
    await db.collection('notifications').add({
      title: '🔥 New lead: ' + (lead.name || 'unknown'),
      body: `${lead.eventType || 'Event'}${lead.eventDate ? ' · ' + lead.eventDate : ''} — first-touch queued, agent replies in ~15-40 min (human-feel delay).`,
      audience: 'ops',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('lead push failed:', e.message); }
});

exports.middayLeadSweep = onSchedule(
  { schedule: '0 12 * * *', timeZone: 'America/Denver', timeoutSeconds: 120 },
  async () => {
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - 36 * 3600e3);
    let snap;
    try {
      snap = await db.collection('leads').where('createdAt', '>=', since).get();
    } catch (e) { console.warn('middayLeadSweep query failed:', e.message); return; }
    let queued = 0;
    for (const d of snap.docs) {
      const lead = d.data();
      if (!lead.email) continue;
      const src = String(lead.source || '').toLowerCase();
      if (lead.importBatch || src.includes('knot') || src.includes('import') || src.includes('expo')) continue;
      /* Skip anyone we've already emailed. */
      const threads = await d.ref.collection('threads').limit(5).get();
      const contacted = threads.docs.some(t => (t.data().lastDirection === 'out') || t.data().hasOutbound);
      if (contacted || await hasPendingFirstTouch(d.id)) continue;
      await queueFirstTouch(d.id, lead, 'midday_sweep');
      queued++;
    }
    console.log(`middayLeadSweep: ${snap.size} recent leads, ${queued} first-touch queued.`);
  }
);

/* ═══ staleLeadSweep — drain the untouched open-lead backlog ═══════════════
 * middayLeadSweep only touches leads from the last 36h and SKIPS imports/expo.
 * That's the population that used to pile up in the (now retired) dashboard
 * Action Queue — old expo-cohort + imported leads nobody was working. Kendell's
 * rule: "if we really needed to do something with those people, assign it to
 * the agent." So this drains that backlog into agent_tasks as *triage* work —
 * the agent reads each lead + threads and decides conservatively: mark clear
 * junk/dead Lost, refresh a follow-up on ones waiting on the client, or send
 * ONE warm re-engagement on real cold leads (never touching active nurture).
 * Capped at 6 oldest per daily run so it drains gradually and cheaply, and
 * each lead is triaged at most once. */
async function hasTriageTask(leadId) {
  const q = await db.collection('agent_tasks')
    .where('leadId', '==', leadId).limit(10).get();
  return q.docs.some(d => d.data().kind === 'triage' &&
    ['queued', 'running', 'done'].includes(d.data().status));
}

async function queueTriage(leadId, lead) {
  return await db.collection('agent_tasks').add({
    agent: 'comms', kind: 'triage', leadId,
    title: `Triage: ${lead.name || 'stale lead'}`,
    instruction:
      `Backlog triage for lead ${leadId} (${lead.name || '?'} <${lead.email || 'no email'}>, ` +
      `stage "${lead.stage || 'New Lead'}"${lead.eventDate ? ', event ' + lead.eventDate : ''}). ` +
      `This lead has been sitting untouched. Use query_crm to read the lead + its threads (and any ` +
      `nurture/campaign status) FIRST, then act conservatively:\n` +
      `• If it's clearly not a real lead (no real contact, test/junk, or a duplicate), move stage to Lost with a one-line note explaining why.\n` +
      `• If we've already been corresponding and it's genuinely waiting on the client, just set/refresh a follow-up date and add a note — do NOT send another email.\n` +
      `• If it's a real, cold lead we never properly worked and still plausibly winnable, send ONE warm, personal, no-pressure re-engagement email (NO pricing), then move stage to Contacted.\n` +
      `Never email a lead that's in an active nurture or expo sequence — leave those to the nurture flow and just note status. Keep everything professional and on-brand, and record what you did as a note on the lead.`,
    status: 'queued', source: 'stale_lead_sweep',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

exports.staleLeadSweep = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'America/Denver', timeoutSeconds: 300 },
  async () => {
    const CLOSED = ['Booked', 'Completed', 'Lost'];
    const NEGLECT_MS = 5 * 24 * 3600e3;  // untouched for 5+ days counts as backlog
    let snap;
    try { snap = await db.collection('leads').get(); }
    catch (e) { console.warn('staleLeadSweep query failed:', e.message); return; }

    const touchedMs = (lead) => {
      const t = lead.updatedAt || lead.createdAt;
      if (t && t.toMillis) return t.toMillis();
      if (t && t.seconds) return t.seconds * 1000;
      return 0;  // no timestamp → treat as very old (definitely neglected)
    };

    // Open + neglected, oldest first.
    const candidates = snap.docs
      .map(d => ({ id: d.id, ref: d.ref, lead: d.data() }))
      .filter(x => !CLOSED.includes(x.lead.stage))
      .filter(x => (Date.now() - touchedMs(x.lead)) >= NEGLECT_MS)
      .sort((a, b) => touchedMs(a.lead) - touchedMs(b.lead));

    let queued = 0;
    for (const x of candidates) {
      if (queued >= 6) break;               // gradual drain, cost + client-safety cap
      if (await hasTriageTask(x.id)) continue;  // triage each lead at most once
      await queueTriage(x.id, x.lead);
      queued++;
    }
    console.log(`staleLeadSweep: ${candidates.length} open+neglected leads, ${queued} triage tasks queued.`);
  }
);

/* Manual kick for testing / "run the queue now" from the dashboard. */
exports.runAgentTasksNow = onCall(
  {
    secrets: [anthropicApiKey, GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN],
    timeoutSeconds: 540, memory: '512MiB',
  },
  async (request) => {
    await requireAdmin(request);
    const snap = await db.collection('agent_tasks').where('status', '==', 'queued').limit(6).get();
    const ready = snap.docs.filter(d => {
      const nb = d.data().notBefore;
      return !nb || nb.toMillis() <= Date.now();
    }).slice(0, 3);
    if (!ready.length) return { ran: 0, results: [] };
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey.value() });
    const { gmail } = buildGmailClient();
    const results = [];
    for (const d of ready) {
      try {
        const r = await executeAgentTask(d, client, gmail);
        results.push({ id: d.id, title: d.data().title, ...(r || { outcome: 'error' }) });
      } catch (e) {
        await d.ref.update({ status: 'error', result: e.message.slice(0, 500) });
        results.push({ id: d.id, title: d.data().title, outcome: 'error', summary: e.message });
      }
    }
    return { ran: results.length, results };
  }
);

/* ═══ MCP connector (Phase F) — talk to the business from Claude apps ═════
 * Minimal MCP streamable-HTTP server exposing query_crm + kick_off_task,
 * so Kendell can add it as a custom connector on claude.ai and ask "how's
 * the business doing?" by voice from his phone.
 * Auth: capability token in the URL path (like Zapier MCP) — the token
 * lives in Secret Manager; requests without it get 404. */
const MCP_ACCESS_TOKEN = defineSecret('MCP_ACCESS_TOKEN');

const MCP_TOOLS = [
  { name: 'query_crm', description: QUERY_CRM_TOOL.description, inputSchema: QUERY_CRM_TOOL.input_schema },
  {
    name: 'kick_off_task',
    description: 'Queue real work for a Lake Salt agent (comms = email/CRM/quotes, lead-gen = prospecting, general = anything else). The task runner executes it within ~30 minutes during business hours.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['comms', 'lead-gen', 'general'] },
        title: { type: 'string' },
        instruction: { type: 'string' },
      },
      required: ['agent', 'title', 'instruction'],
    },
  },
];

exports.mcp = onRequest(
  { secrets: [MCP_ACCESS_TOKEN], timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const token = MCP_ACCESS_TOKEN.value();
    const pathTok = (req.path || '').split('/').filter(Boolean).pop();
    const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || (pathTok !== token && bearer !== token)) { res.status(404).send('Not found'); return; }
    if (req.method === 'GET') { res.status(405).send('POST only'); return; }
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }

    const rpc = req.body || {};
    const reply = (result) => res.status(200).json({ jsonrpc: '2.0', id: rpc.id, result });
    const rpcError = (code, message) => res.status(200).json({ jsonrpc: '2.0', id: rpc.id, error: { code, message } });

    try {
      switch (rpc.method) {
        case 'initialize':
          return reply({
            protocolVersion: rpc.params && rpc.params.protocolVersion || '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'lake-salt-crm', version: '1.0.0' },
          });
        case 'notifications/initialized':
          res.status(202).send(''); return;
        case 'ping':
          return reply({});
        case 'tools/list':
          return reply({ tools: MCP_TOOLS });
        case 'tools/call': {
          const { name, arguments: args } = rpc.params || {};
          let out;
          if (name === 'query_crm') out = await runQueryCrm(args || {});
          else if (name === 'kick_off_task') {
            const a = args || {};
            const ref = await db.collection('agent_tasks').add({
              agent: ['comms', 'lead-gen', 'general'].includes(a.agent) ? a.agent : 'general',
              title: String(a.title || '').slice(0, 120),
              instruction: String(a.instruction || '').slice(0, 4000),
              status: 'queued', source: 'mcp_connector',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            out = `Task queued (${ref.id}) — the runner picks it up within ~30 minutes during business hours.`;
          } else return rpcError(-32602, `Unknown tool ${name}`);
          return reply({ content: [{ type: 'text', text: String(out) }] });
        }
        default:
          return rpcError(-32601, `Method not found: ${rpc.method}`);
      }
    } catch (e) {
      console.error('mcp error:', e.message);
      return rpcError(-32603, e.message);
    }
  }
);

/* ═══ Review engine — automated Google review requests ════════════════════
 * Armed by settings/google_review { url } (Kendell supplies the link).
 * When a lead moves to Completed, queue a thank-you + review-request email
 * with a human-feel delay of ~2 days after the event. One per lead, ever. */
exports.onLeadCompleted = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data.before.data() || {};
  const after = event.data.after.data() || {};
  if (before.stage === after.stage || after.stage !== 'Completed') return;
  if (after.reviewRequestQueued) return;
  if (!after.email) return;
  let review;
  try { review = (await db.collection('settings').doc('google_review').get()).data(); } catch (e) { review = null; }
  if (!review || !review.url) { console.log('onLeadCompleted: no review link configured — skipping.'); return; }
  await db.collection('agent_tasks').add({
    agent: 'comms', kind: 'review_request', leadId: event.params.leadId,
    title: `Review request: ${after.name || 'completed event'}`,
    instruction:
      `${after.name || 'A client'} <${after.email}> just wrapped their event with us` +
      `${after.eventDate ? ' (' + after.eventDate + ')' : ''}. Send a warm, personal thank-you email — reference their actual event details from the lead record — and ask if they'd share a quick Google review. Include this exact link: ${review.url} . One short paragraph, zero pressure, signed "Kendell — Lake Salt".`,
    status: 'queued', source: 'review_engine',
    notBefore: admin.firestore.Timestamp.fromMillis(Date.now() + 2 * 86400e3),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await event.data.after.ref.update({ reviewRequestQueued: true });
  console.log(`onLeadCompleted: review request queued for ${after.name || event.params.leadId}`);
});
