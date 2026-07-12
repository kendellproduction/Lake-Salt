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

    console.log(`dailyFollowupScan created ${created} follow-up reminders, flagged ${expiredCount} expired quotes`);
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
      title: String(note.title || 'Lake Salt'),
      body:  String(note.body || ''),
      url:   String(note.url || 'https://lakesalt.us/admin/#crm'),
      tag:   String(note.tag || 'lake-salt')
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
const { defineSecret } = require('firebase-functions/params');

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
    taxYear: receiptDate ? parseInt(receiptDate.slice(0, 4), 10) : null,
    description: parsed.merchant ? `${parsed.merchant} receipt` : 'Scanned receipt',
  });
}
