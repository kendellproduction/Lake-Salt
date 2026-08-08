# Lake Salt canonical booking calendar

`bookings/{bookingId}` is the source of truth for availability. Leads, quotes,
projects, events, Google Calendar, and Apple Calendar are consumers or inputs;
none of them independently proves that a date is available.

## Lifecycle

- Client accepts a quote: `onQuoteAccepted` creates the idempotent document
  `bookings/quote_<quoteId>` with status `tentative` and a seven-day hold.
- Until a payment provider is connected, an administrator explicitly attests
  that the full 10% deposit was observed, supplying an authenticated actor,
  reason, amount, and unique payment reference. `confirmBooking` records this
  in append-only payment history, rechecks availability in a transaction, and
  promotes the hold only when the result is `available`.
- Confirmation creates deterministic `projects/booking_<bookingId>` and
  `events/booking_<bookingId>` records and advances the lead to `Booked`.
- A declined or expired tentative hold becomes `released`. A confirmed booking
  uses the separate cancellation path, retaining deposit and payment history
  while marking its derived project and event cancelled.
- `dailyBookingIntegrityRepair` expires old holds, recreates missing derived
  records, and writes privacy-safe `system_issues`. It does not send pushes.

Availability uses the full setup-to-teardown window. Confirmed overlaps,
explicit blocked dates, personal busy blocks, and insufficient staff are hard
conflicts. Tentative overlaps, missing times, unknown staffing, and stale
external syncs are conditional and require a decision.

At least one enabled `calendar_connections` record marked `mandatory: true`
must have a recent successful sync. Without it, availability is conditional and
can never be reported as available. Staffing is calculated from server-side
`bartenders`, assignment proposals, and busy windows; caller-supplied available
staff counts are ignored.

`staffRequired` is persisted explicitly on each booking, but it is derived from
the accepted quote's frozen `pricingAssumptions.bartenders` or
`pricingScope.bartenders`, with `lineItems.bartenders` retained as the legacy
fallback. A free-standing caller-supplied `staffRequired` is not authoritative.

## Tests

Run credential-free unit and in-memory lifecycle coverage with:

```text
cd functions && npm test
```

Run the Firestore lifecycle suite with:

```text
cd functions && npm run test:emulator:ci
```

The emulator suite is intentionally excluded from the normal unit glob and its
direct command fails when `FIRESTORE_EMULATOR_HOST` is absent, so CI cannot
report a silent skip. It has not yet run on this Mac because the Firebase
Firestore emulator requires Java and no working Java runtime is installed.

## External calendar adapters

Interfaces live in `functions/calendar-adapters.js`.

- `AvailabilitySourceAdapter` normalizes external calendars into
  `calendar_busy_blocks`. Personal records may contain owner, start, end,
  all-day, and opaque hash only. Never store title, description, attendees,
  location, or notes.
- `BookingMirrorAdapter` mirrors Firestore bookings into a staff calendar.
  Firestore always wins during reconciliation.

Google/iCloud implementations are intentionally disabled until connector
authorization is available. When Google is authorized, create a shared
`Lake Salt Bookings` calendar and implement a mirror using a refresh token in
Secret Manager. Maddie can subscribe to that Google calendar in Apple Calendar.
For personal blocking, prefer a dedicated availability-only calendar; otherwise
use an iCloud app-specific password in Secret Manager and normalize only busy
windows.

Expected configuration (do not place values in Firestore or source control):

```text
GOOGLE_CALENDAR_ID
GOOGLE_CALENDAR_OAUTH_CLIENT_ID
GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET
GOOGLE_CALENDAR_REFRESH_TOKEN
GOOGLE_CALENDAR_WEBHOOK_SECRET
ICLOUD_CALDAV_USERNAME
ICLOUD_CALDAV_APP_PASSWORD
```

## Collections read by availability

- `bookings`: canonical Lake Salt holds and confirmed work.
- `blocked_dates`: active documents with `date`, or `startDate`/`endDate`.
- `calendar_busy_blocks`: privacy-filtered records with `eventDate`,
  `startsAt`, `endsAt`, `source`, and optional `ownerUid`.
- `calendar_connections`: enabled source health with `lastSuccessfulSyncAt`.

The current implementation deliberately fails toward `conditional` when data
is incomplete or stale. It never accepts a deposit automatically when the
decision is conditional or unavailable.
