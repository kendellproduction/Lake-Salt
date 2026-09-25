'use strict';

const { verifyAcceptedQuote } = require('./quotes');

function bookingIdempotencyKey(booking) {
  if (!booking?.businessEventId || !booking?.quoteId || !booking?.policyVersion) throw new TypeError('booking identity and policyVersion are required');
  return `booking:${booking.businessEventId}:${booking.quoteId}:${booking.policyVersion}`;
}

async function orchestrateBooking(booking, ports) {
  const idempotencyKey = bookingIdempotencyKey(booking);
  const quote = booking.acceptedQuote;
  if (!isVerifiedAcceptedQuote(quote, booking)) return { status: 'hold', reason: 'verified_accepted_quote_required', idempotencyKey, completed: [] };
  const required = ['reserveCapacity', 'upsertCalendarHold', 'updateCrm', 'createTasks'];
  for (const name of required) if (typeof ports?.[name] !== 'function') throw new TypeError(`missing_port:${name}`);
  const completed = [];
  try {
    const capacity = await ports.reserveCapacity({ businessEventId: booking.businessEventId, eventDate: booking.eventDate, idempotencyKey: `${idempotencyKey}:capacity` });
    if (capacity?.status === 'conflict') return { status: 'hold', reason: 'capacity_unavailable', idempotencyKey, completed };
    if (!['reserved', 'already_reserved_by_same_operation'].includes(capacity?.status)) throw Object.assign(new Error('invalid_capacity_reservation_response'), { code: 'CAPACITY_PORT_INVALID' });
    completed.push('capacity_reserved');
    await ports.upsertCalendarHold({ booking, idempotencyKey: `${idempotencyKey}:calendar` });
    completed.push('calendar_held');
    await ports.updateCrm({ businessEventId: booking.businessEventId, stage: 'Booked', quoteId: booking.quoteId, idempotencyKey: `${idempotencyKey}:crm` });
    completed.push('crm_updated');
    await ports.createTasks({ businessEventId: booking.businessEventId, tasks: booking.prepTasks || [], idempotencyKey: `${idempotencyKey}:tasks` });
    completed.push('tasks_created');
    return { status: 'booked', idempotencyKey, completed };
  } catch (error) {
    return { status: 'partial_failure', idempotencyKey, completed, failedStep: nextStep(completed), errorClass: error?.code || error?.name || 'Error', retryable: true };
  }
}

function nextStep(completed) {
  return ['capacity_reserved', 'calendar_held', 'crm_updated', 'tasks_created'][completed.length];
}

function isVerifiedAcceptedQuote(quote, booking) {
  try {
    verifyAcceptedQuote(quote, booking.approvalEvidence);
    return quote.quoteId === booking.quoteId && quote.businessEventId === booking.businessEventId && quote.policyVersion === booking.policyVersion;
  } catch {
    return false;
  }
}

module.exports = { bookingIdempotencyKey, orchestrateBooking };
