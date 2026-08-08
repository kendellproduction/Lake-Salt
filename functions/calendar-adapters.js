'use strict';

/**
 * External calendars are availability inputs and staff-facing mirrors only.
 * Firestore bookings remain authoritative. Implementations must return
 * privacy-filtered busy blocks and must never copy personal titles or notes.
 */
class AvailabilitySourceAdapter {
  async listBusyBlocks(_window) {
    throw new Error('AvailabilitySourceAdapter.listBusyBlocks must be implemented.');
  }

  async health() {
    return { connected: false, lastSuccessfulSyncAt: null };
  }
}

class BookingMirrorAdapter {
  async upsertBooking(_bookingId, _booking) {
    throw new Error('BookingMirrorAdapter.upsertBooking must be implemented.');
  }

  async removeBooking(_bookingId) {
    throw new Error('BookingMirrorAdapter.removeBooking must be implemented.');
  }
}

class DisabledAvailabilityAdapter extends AvailabilitySourceAdapter {
  async listBusyBlocks() { return []; }
  async health() { return { connected: false, reason: 'not_configured', lastSuccessfulSyncAt: null }; }
}

class DisabledBookingMirrorAdapter extends BookingMirrorAdapter {
  async upsertBooking() { return { skipped: true, reason: 'not_configured' }; }
  async removeBooking() { return { skipped: true, reason: 'not_configured' }; }
}

module.exports = {
  AvailabilitySourceAdapter,
  BookingMirrorAdapter,
  DisabledAvailabilityAdapter,
  DisabledBookingMirrorAdapter
};
