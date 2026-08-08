'use strict';

const ACTIVE_STATUSES = new Set(['tentative', 'confirmed']);
const DEFAULT_TIMEZONE = 'America/Denver';
const DEFAULT_SETUP_MINUTES = 90;
const DEFAULT_TEARDOWN_MINUTES = 60;
const POLICY_VERSION = 'booking-calendar-v1';

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timestampMillis(value) {
  const date = asDate(value);
  return date ? date.getTime() : null;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  const values = [aStart, aEnd, bStart, bEnd].map(timestampMillis);
  return values.every(Number.isFinite) && values[0] < values[3] && values[2] < values[1];
}

function localDateTimeToUtc(date, time, timeZone = DEFAULT_TIMEZONE) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^\d{1,2}:\d{2}$/.test(String(time || ''))) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2100 || hour > 23 || minute > 59 ||
      calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return null;
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(p => [p.type, p.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const delta = Date.UTC(year, month - 1, day, hour, minute) - represented;
    guess += delta;
    if (!delta) break;
  }
  const result = new Date(guess);
  const roundTrip = Object.fromEntries(formatter.formatToParts(result).map(p => [p.type, p.value]));
  if (Number(roundTrip.year) !== year || Number(roundTrip.month) !== month || Number(roundTrip.day) !== day ||
      Number(roundTrip.hour) !== hour || Number(roundTrip.minute) !== minute) return null;
  return result;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes) * 60000);
}

function deriveWindow(source, options = {}) {
  const timezone = source.timezone || options.timezone || DEFAULT_TIMEZONE;
  const eventDate = source.eventDate || source.date || '';
  const serviceStart = asDate(source.serviceStartAt) || localDateTimeToUtc(eventDate, source.eventStartTime || source.startTime, timezone);
  const serviceEnd = asDate(source.serviceEndAt) || localDateTimeToUtc(eventDate, source.eventEndTime || source.endTime, timezone);
  if (!serviceStart || !serviceEnd || serviceEnd <= serviceStart) {
    return { eventDate, timezone, complete: false, serviceStartAt: serviceStart, serviceEndAt: serviceEnd };
  }
  const setupStart = asDate(source.setupStartAt) || addMinutes(serviceStart, -(source.setupMinutes ?? options.setupMinutes ?? DEFAULT_SETUP_MINUTES));
  const teardownEnd = asDate(source.teardownEndAt) || addMinutes(serviceEnd, source.teardownMinutes ?? options.teardownMinutes ?? DEFAULT_TEARDOWN_MINUTES);
  return { eventDate, timezone, complete: true, setupStartAt: setupStart, serviceStartAt: serviceStart, serviceEndAt: serviceEnd, teardownEndAt: teardownEnd };
}

function privacySafeConflict(source, type, severity, start, end, extra = {}) {
  return {
    source,
    type,
    severity,
    startsAt: start || null,
    endsAt: end || null,
    privacyLabel: source === 'lake_salt' ? (extra.label || 'Lake Salt booking') : 'Busy',
    ...extra
  };
}

function evaluateAvailability(input) {
  const candidate = deriveWindow(input.candidate || input);
  const conflicts = [];
  const assumptions = [];
  if (!candidate.eventDate) return { result: 'unknown', conflicts, assumptions: ['Event date is missing.'], requiresDecision: true, policyVersion: POLICY_VERSION };

  for (const block of input.blockedDates || []) {
    const starts = block.startDate || block.date;
    const ends = block.endDate || block.date;
    if (starts && ends && candidate.eventDate >= starts && candidate.eventDate <= ends) {
      conflicts.push(privacySafeConflict('lake_salt', 'blocked_date', 'hard', null, null, { reasonCode: block.reasonCode || 'blocked_date' }));
    }
  }

  if (!candidate.complete) assumptions.push('Service start/end time is missing or invalid; exact overlap cannot be confirmed.');

  for (const booking of input.bookings || []) {
    if (!ACTIVE_STATUSES.has(booking.status) || booking.id === input.excludeBookingId) continue;
    const existing = deriveWindow(booking);
    if (existing.eventDate !== candidate.eventDate) continue;
    if (!candidate.complete || !existing.complete) {
      conflicts.push(privacySafeConflict('lake_salt', 'booking', 'soft', existing.setupStartAt, existing.teardownEndAt, { bookingId: booking.id, status: booking.status }));
    } else if (overlaps(candidate.setupStartAt, candidate.teardownEndAt, existing.setupStartAt, existing.teardownEndAt)) {
      conflicts.push(privacySafeConflict('lake_salt', 'booking', booking.status === 'confirmed' ? 'hard' : 'soft', existing.setupStartAt, existing.teardownEndAt, { bookingId: booking.id, status: booking.status }));
    }
  }

  for (const busy of input.busyBlocks || []) {
    if (candidate.complete && overlaps(candidate.setupStartAt, candidate.teardownEndAt, busy.startsAt, busy.endsAt)) {
      conflicts.push(privacySafeConflict(busy.source || 'external', 'personal_busy', busy.hard === false ? 'soft' : 'hard', busy.startsAt, busy.endsAt, { ownerUid: busy.ownerUid || null }));
    }
  }

  if (input.mandatoryCalendarMissing) assumptions.push('No mandatory external availability calendar is configured.');
  if (input.calendarSyncStale) assumptions.push('A mandatory external availability source is stale.');
  const staffRequired = Number(input.candidate?.staffRequired ?? input.staffRequired ?? 0);
  const staffAvailable = input.staffAvailable == null ? null : Number(input.staffAvailable);
  if (staffRequired > 0 && staffAvailable == null) assumptions.push('Staff availability has not been confirmed.');
  if (staffRequired > 0 && staffAvailable != null && staffAvailable < staffRequired) {
    conflicts.push(privacySafeConflict('lake_salt', 'staffing', 'hard', candidate.setupStartAt, candidate.teardownEndAt, { reasonCode: 'insufficient_staff' }));
  }

  const hard = conflicts.some(c => c.severity === 'hard');
  const soft = conflicts.some(c => c.severity === 'soft');
  const uncertain = !candidate.complete || input.mandatoryCalendarMissing || input.calendarSyncStale || (staffRequired > 0 && staffAvailable == null);
  return {
    result: hard ? 'unavailable' : (soft || uncertain ? 'conditional' : 'available'),
    conflicts,
    assumptions,
    requiresDecision: hard || soft || uncertain,
    policyVersion: POLICY_VERSION,
    window: candidate
  };
}

function quoteDeposit(quote) {
  const total = Number(quote.total ?? quote.pricingSnapshot?.revenue?.total ?? 0);
  return { total, depositPct: 10, depositAmount: Math.round(total * 10) / 100 };
}

function validateAcceptedQuote(quote) {
  const deposit = quoteDeposit(quote);
  if (!Number.isFinite(deposit.total) || deposit.total <= 0) throw new Error('Accepted quote total must be finite and greater than zero.');
  if (!quote.sentAt || !quote.lockedAt || !['accepted', 'sent'].includes(quote.status)) {
    throw new Error('Accepted quote must be a frozen, previously sent quote.');
  }
  if (quote.pricingSnapshot && Number(quote.pricingSnapshot?.revenue?.total) !== deposit.total) {
    throw new Error('Accepted quote total does not match its frozen pricing snapshot.');
  }
  return deposit;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()))];
}

function deriveStaffRequiredFromQuote(quote) {
  const candidates = [
    ['pricingSnapshot.assumptions.bartenders', quote.pricingSnapshot?.assumptions?.bartenders],
    ['pricingAssumptions.bartenders', quote.pricingAssumptions?.bartenders],
    ['pricingScope.bartenders', quote.pricingScope?.bartenders],
    ['lineItems.bartenders', quote.lineItems?.bartenders]
  ];
  const selected = candidates.find(([, value]) => value !== null && value !== undefined && value !== '');
  const staffRequired = Number(selected?.[1]);
  if (!selected || !Number.isInteger(staffRequired) || staffRequired <= 0) {
    throw new Error('Accepted quote must contain a positive frozen bartender count.');
  }
  return { staffRequired, source: selected[0] };
}

function deriveServerStaffing(candidate, staffRecords, busyBlocks, window) {
  const required = Number(candidate.staffRequired || 0);
  if (!Number.isInteger(required) || required < 0) return { staffRequired: required, staffAvailable: 0, assignedStaffIds: [], invalid: true };
  const proposed = uniqueStrings(candidate.assignedStaffIds || candidate.proposedStaffIds);
  const active = (staffRecords || []).filter(s => ['Active', 'On-Call'].includes(s.status || 'Active'));
  const activeIds = new Set(active.map(s => s.id));
  const selected = proposed.length ? proposed.filter(id => activeIds.has(id)) : [...activeIds];
  const unavailable = new Set((busyBlocks || []).filter(b =>
    b.ownerUid && window.complete && overlaps(window.setupStartAt, window.teardownEndAt, b.startsAt, b.endsAt)
  ).map(b => b.ownerUid));
  const availableIds = selected.filter(id => !unavailable.has(id));
  return { staffRequired: required, staffAvailable: active.length ? availableIds.length : null, assignedStaffIds: proposed };
}

function bookingIdForQuote(quoteId) { return `quote_${quoteId}`; }
function derivedId(bookingId) { return `booking_${bookingId}`; }

function createBookingCalendar({ db, admin, logger = console }) {
  const fieldValue = admin.firestore.FieldValue;
  const Timestamp = admin.firestore.Timestamp;
  const now = () => fieldValue.serverTimestamp();
  const ts = date => Timestamp.fromDate(date);

  async function loadAvailabilityInputs(candidate, excludeBookingId, transaction = null) {
    const get = ref => transaction ? transaction.get(ref) : ref.get();
    const [bookingSnap, blockedSnap, busySnap, syncSnap, staffSnap] = await Promise.all([
      get(db.collection('bookings').where('eventDate', '==', candidate.eventDate)),
      get(db.collection('blocked_dates')),
      get(db.collection('calendar_busy_blocks').where('eventDate', '==', candidate.eventDate)),
      get(db.collection('calendar_connections')),
      get(db.collection('bartenders'))
    ]);
    const bookings = bookingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const blockedDates = blockedSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.active !== false);
    const busyBlocks = busySnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.busy !== false);
    const connections = syncSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.enabled !== false);
    const mandatoryConnections = connections.filter(c => c.mandatory === true);
    const staffRecords = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const staleAfterMs = 30 * 60 * 1000;
    const mandatoryCalendarMissing = mandatoryConnections.length === 0;
    const calendarSyncStale = mandatoryConnections.some(c => !timestampMillis(c.lastSuccessfulSyncAt) || Date.now() - timestampMillis(c.lastSuccessfulSyncAt) > staleAfterMs);
    const staffing = deriveServerStaffing(candidate, staffRecords, busyBlocks, deriveWindow(candidate));
    return { candidate: { ...candidate, staffRequired: staffing.staffRequired }, excludeBookingId, bookings, blockedDates, busyBlocks,
      mandatoryCalendarMissing, calendarSyncStale, staffAvailable: staffing.staffAvailable, serverAssignedStaffIds: staffing.assignedStaffIds };
  }

  async function checkAvailability(candidate, options = {}) {
    const inputs = await loadAvailabilityInputs(candidate, options.excludeBookingId, options.transaction);
    return evaluateAvailability(inputs);
  }

  async function createTentativeFromAcceptedQuote({ quoteId, quote, lead = {} }) {
    const bookingId = bookingIdForQuote(quoteId);
    const ref = db.collection('bookings').doc(bookingId);
    const frozenStaffing = deriveStaffRequiredFromQuote(quote);
    const merged = { ...lead, ...quote, staffRequired: frozenStaffing.staffRequired };
    const window = deriveWindow(merged);
    const deposit = validateAcceptedQuote(quote);
    const availability = await checkAvailability({ ...merged, ...window }, { excludeBookingId: bookingId });
    const holdDays = Number(quote.holdDays || 7);
    const holdExpires = new Date(Date.now() + holdDays * 86400000);
    const payload = {
      leadId: quote.leadId || lead.id || null,
      quoteId,
      clientName: quote.leadName || lead.name || '',
      eventType: quote.eventType || lead.eventType || '',
      venue: quote.venue || lead.venue || '',
      city: quote.city || lead.city || '',
      timezone: window.timezone,
      eventDate: window.eventDate,
      serviceStartAt: window.serviceStartAt ? ts(window.serviceStartAt) : null,
      serviceEndAt: window.serviceEndAt ? ts(window.serviceEndAt) : null,
      setupStartAt: window.setupStartAt ? ts(window.setupStartAt) : null,
      teardownEndAt: window.teardownEndAt ? ts(window.teardownEndAt) : null,
      status: 'tentative',
      hold: { expiresAt: ts(holdExpires), reason: 'quote_accepted' },
      capacityUnits: Number(quote.capacityUnits || 1),
      guestCount: Number(quote.guestCount || lead.guestCount || 0) || null,
      staffRequired: frozenStaffing.staffRequired,
      staffRequiredSource: frozenStaffing.source,
      assignedStaffIds: uniqueStrings(quote.assignedStaffIds || quote.proposedStaffIds),
      deposit: { ...deposit, paidAmount: 0, status: 'pending' },
      availabilityDecision: sanitizeDecision(availability, ts),
      updatedAt: now(),
      createdAt: now(),
      version: 1
    };
    const result = await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (existing.exists) return { idempotent: true, status: existing.data().status };
      transaction.create(ref, payload);
      return { idempotent: false, status: 'tentative' };
    });
    return { bookingId, ...availability, deposit, ...result };
  }

  async function confirmBooking({ bookingId, manualPaymentAttestation, confirmedBy }) {
    const ref = db.collection('bookings').doc(bookingId);
    return db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new Error('Booking not found.');
      const booking = { id: snap.id, ...snap.data() };
      if (booking.status === 'confirmed') return { bookingId, idempotent: true };
      if (booking.status !== 'tentative') throw new Error(`Cannot confirm a ${booking.status || 'unknown'} booking.`);
      const attestation = manualPaymentAttestation || {};
      if (attestation.confirmed !== true || !confirmedBy || !String(attestation.reason || '').trim() || !String(attestation.paymentReference || '').trim()) {
        throw new Error('Manual payment confirmation requires explicit attestation, authenticated actor, reason, and payment reference.');
      }
      const required = Number(booking.deposit?.depositAmount || 0);
      const paidAmount = Number(attestation.paidAmount);
      if (!Number.isFinite(paidAmount) || paidAmount + 0.001 < required) throw new Error(`A 10% deposit of $${required.toFixed(2)} is required.`);
      const availabilityInputs = await loadAvailabilityInputs(booking, bookingId, transaction);
      const availability = evaluateAvailability(availabilityInputs);
      if (availability.result !== 'available') throw new Error(`Availability is ${availability.result}; confirmation requires review.`);
      const historyId = `manual_${String(attestation.paymentReference).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)}`;
      const historyRef = ref.collection('payment_history').doc(historyId);
      const existingPayment = await transaction.get(historyRef);
      if (!existingPayment.exists) transaction.create(historyRef, {
        type: 'manual_attestation', amount: paidAmount, paymentReference: String(attestation.paymentReference),
        reason: String(attestation.reason).trim(), actor: confirmedBy, recordedAt: now()
      });
      transaction.update(ref, {
        status: 'confirmed',
        hold: fieldValue.delete(),
        deposit: { ...booking.deposit, paidAmount, status: 'paid', paymentReference: String(attestation.paymentReference), paidAt: now(), verification: 'manual_attestation' },
        availabilityDecision: sanitizeDecision(availability, ts),
        confirmedAt: now(), confirmedBy: confirmedBy || 'system', updatedAt: now(), version: Number(booking.version || 1) + 1
      });
      return { bookingId, idempotent: false };
    });
  }

  async function releaseBooking(bookingId, reason = 'manual') {
    const ref = db.collection('bookings').doc(bookingId);
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists || snap.data().status === 'released') return;
      if (snap.data().status !== 'tentative') throw new Error('Only tentative holds can be released; confirmed bookings must use cancellation.');
      transaction.update(ref, { status: 'released', releaseReason: reason, releasedAt: now(), updatedAt: now(), version: Number(snap.data().version || 1) + 1 });
    });
  }

  async function cancelConfirmedBooking({ bookingId, reason, cancelledBy }) {
    if (!cancelledBy || !String(reason || '').trim()) throw new Error('Cancellation requires an authenticated actor and reason.');
    const ref = db.collection('bookings').doc(bookingId);
    return db.runTransaction(async transaction => {
      const eventRef = db.collection('events').doc(derivedId(bookingId));
      const projectRef = db.collection('projects').doc(derivedId(bookingId));
      const [snap, eventSnap, projectSnap] = await Promise.all([
        transaction.get(ref), transaction.get(eventRef), transaction.get(projectRef)
      ]);
      if (!snap.exists) throw new Error('Booking not found.');
      const booking = snap.data();
      if (booking.status === 'cancelled') return { bookingId, idempotent: true };
      if (booking.status !== 'confirmed') throw new Error('Only confirmed bookings can use the cancellation path.');
      const leadRef = booking.leadId ? db.collection('leads').doc(booking.leadId) : null;
      const leadSnap = leadRef ? await transaction.get(leadRef) : null;
      const auditRef = ref.collection('audit').doc(`cancel_${Number(booking.version || 1) + 1}`);
      transaction.create(auditRef, { action: 'confirmed_booking_cancelled', actor: cancelledBy, reason: String(reason).trim(),
        paymentSnapshot: booking.deposit || null, createdAt: now() });
      transaction.update(ref, { status: 'cancelled', cancellation: { reason: String(reason).trim(), actor: cancelledBy, cancelledAt: now() },
        updatedAt: now(), version: Number(booking.version || 1) + 1 });
      if (eventSnap.exists) transaction.set(eventRef, { status: 'Cancelled', updatedAt: now() }, { merge: true });
      if (projectSnap.exists) transaction.set(projectRef, { status: 'Cancelled', updatedAt: now() }, { merge: true });
      if (leadSnap?.exists) transaction.set(leadRef, {
        stage: 'Lost', bookingStatus: 'Cancelled', lostReason: 'Client cancelled',
        cancellationReason: String(reason).trim(), cancelledAt: now(), updatedAt: now()
      }, { merge: true });
      return { bookingId, idempotent: false };
    });
  }

  async function syncDerivedRecords(bookingId, booking) {
    if (booking.status !== 'confirmed') return { skipped: true };
    const id = derivedId(bookingId);
    const projectRef = db.collection('projects').doc(id);
    const eventRef = db.collection('events').doc(id);
    const bookingRef = db.collection('bookings').doc(bookingId);
    const common = {
      bookingId, leadId: booking.leadId || null, quoteId: booking.quoteId || null,
      leadName: booking.clientName || '', eventName: `${booking.clientName || 'Client'} — ${booking.eventType || 'Event'}`,
      name: `${booking.clientName || 'Client'} — ${booking.eventType || 'Event'}`,
      eventType: booking.eventType || '', eventDate: booking.eventDate || '', date: booking.eventDate || '',
      venue: booking.venue || '', city: booking.city || '', guestCount: booking.guestCount || null,
      serviceStartAt: booking.serviceStartAt || null, serviceEndAt: booking.serviceEndAt || null,
      setupStartAt: booking.setupStartAt || null, teardownEndAt: booking.teardownEndAt || null,
      updatedAt: now()
    };
    const derivedCreatedAt = booking.confirmedAt || booking.createdAt || now();
    await db.runTransaction(async transaction => {
      const [project, event] = await Promise.all([transaction.get(projectRef), transaction.get(eventRef)]);
      transaction.set(projectRef, project.exists
        ? { ...common, status: 'Active' }
        : { ...common, status: 'Active', revenue: booking.deposit?.total || 0, createdAt: derivedCreatedAt }, { merge: true });
      transaction.set(eventRef, event.exists
        ? { ...common, status: 'Booked' }
        : { ...common, status: 'Booked', revenue: booking.deposit?.total || 0, supplyCosts: 0, createdAt: derivedCreatedAt }, { merge: true });
      if (booking.leadId) transaction.set(db.collection('leads').doc(booking.leadId), {
        stage: 'Booked', bookingId, depositAmount: booking.deposit?.depositAmount || 0, depositPaid: true, updatedAt: now()
      }, { merge: true });
      transaction.set(bookingRef, { projectId: id, eventId: id, updatedAt: now() }, { merge: true });
    });
    return { projectId: id, eventId: id };
  }

  async function logSystemIssue(fingerprint, title, summary, evidence = {}, options = {}) {
    const ref = db.collection('system_issues').doc(fingerprint.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180));
    const observationRef = ref.collection('observations').doc();
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      const update = {
        fingerprint, title, summary, category: options.category || 'data_integrity', severity: options.severity || 'medium',
        affectedComponents: options.affectedComponents || ['booking-calendar'], status: 'open',
        lastSeenAt: now(), occurrenceCount: fieldValue.increment(1)
      };
      if (!existing.exists) update.firstSeenAt = now();
      transaction.set(ref, update, { merge: true });
      transaction.set(observationRef, {
        source: evidence.source || 'booking_integrity_repair', safeReference: evidence.safeReference || '',
        summary, observedAt: now()
      });
    });
  }

  async function createHighPriorityAttention({ fingerprint, quoteId, leadId, message }) {
    const id = fingerprint.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
    const ref = db.collection('attention_items').doc(id);
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      const payload = {
        type: 'booking_creation_failed', subjectType: 'quote', subjectId: quoteId,
        state: 'open', severity: 'high', priority: 'high',
        question: 'An accepted quote did not create its calendar hold. Review before requesting a deposit.',
        context: message || 'Booking hold creation failed.', options: [{ key: 'reviewed', label: 'Open quote' }],
        deepLink: leadId ? `https://lakesalt.us/admin/#crm/lead/${leadId}` : `https://lakesalt.us/admin/#quotes/${quoteId}`,
        fingerprint, owner: 'all', updatedAt: now()
      };
      if (!existing.exists) payload.createdAt = now();
      transaction.set(ref, payload, { merge: true });
    });
  }

  async function repairIntegrity() {
    const snap = await db.collection('bookings').where('status', 'in', ['tentative', 'confirmed']).get();
    const summary = { scanned: snap.size, repaired: 0, issues: 0 };
    for (const doc of snap.docs) {
      const booking = { id: doc.id, ...doc.data() };
      try {
        if (booking.status === 'confirmed') {
          const [project, event] = await Promise.all([
            db.collection('projects').doc(derivedId(doc.id)).get(),
            db.collection('events').doc(derivedId(doc.id)).get()
          ]);
          if (!project.exists || !event.exists) {
            await syncDerivedRecords(doc.id, booking);
            summary.repaired += 1;
            await logSystemIssue(`booking-derived-missing-${doc.id}`, 'Confirmed booking was missing derived records', 'The integrity repair recreated missing operational records.', { safeReference: `bookings/${doc.id}` });
            summary.issues += 1;
          }
        }
        const holdExpiresAt = timestampMillis(booking.hold?.expiresAt);
        if (booking.status === 'tentative' && Number.isFinite(holdExpiresAt) && holdExpiresAt < Date.now()) {
          await releaseBooking(doc.id, 'hold_expired');
          summary.repaired += 1;
        }
        const expected = quoteDeposit({ total: booking.deposit?.total || 0 }).depositAmount;
        if (Math.abs(Number(booking.deposit?.depositAmount || 0) - expected) > 0.01) {
          await logSystemIssue(`booking-deposit-mismatch-${doc.id}`, 'Booking deposit is not 10%', 'Deposit metadata differs from the canonical 10% policy; no payment data was changed.', { safeReference: `bookings/${doc.id}` });
          summary.issues += 1;
        }
      } catch (error) {
        logger.error('booking integrity repair failed', doc.id, error);
        await logSystemIssue(`booking-repair-failed-${doc.id}`, 'Booking integrity repair failed', 'A booking could not be verified or repaired.', { safeReference: `bookings/${doc.id}` });
        summary.issues += 1;
      }
    }
    return summary;
  }

  return { checkAvailability, createTentativeFromAcceptedQuote, confirmBooking, releaseBooking, cancelConfirmedBooking,
    syncDerivedRecords, repairIntegrity, recordSystemIssue: logSystemIssue, createHighPriorityAttention };
}

function sanitizeDecision(decision, toTimestamp = value => value) {
  return {
    result: decision.result,
    reasonCodes: decision.conflicts.map(c => c.reasonCode || `${c.source}:${c.type}:${c.severity}`),
    conflicts: decision.conflicts.map(c => ({ ...c, startsAt: c.startsAt ? toTimestamp(asDate(c.startsAt)) : null, endsAt: c.endsAt ? toTimestamp(asDate(c.endsAt)) : null })),
    assumptions: decision.assumptions,
    requiresDecision: decision.requiresDecision,
    policyVersion: decision.policyVersion,
    checkedAt: new Date()
  };
}

module.exports = {
  ACTIVE_STATUSES, DEFAULT_TIMEZONE, POLICY_VERSION,
  asDate, overlaps, localDateTimeToUtc, deriveWindow,
  evaluateAvailability, quoteDeposit, validateAcceptedQuote, uniqueStrings, deriveStaffRequiredFromQuote,
  deriveServerStaffing, bookingIdForQuote, derivedId,
  createBookingCalendar
};
