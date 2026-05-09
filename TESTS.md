# Wedding Expo System — Test Plan

Goal: every page and every function works end-to-end before Saturday May 9.

Test layers, in order:
1. **Layer 1 — Static rendering** (each page loads + looks right)
2. **Layer 2 — Cloud Function happy paths** (data flows correctly)
3. **Layer 3 — Edge cases** (concurrent bookings, offline, validation)
4. **Layer 4 — Live E2E with Kendell** (the 6 bride journeys, on real phones)

---

## Layer 1 — Static rendering

These run on the local dev server (`preview_start "Lake Salt Website"` → http://localhost:8080) — Cloud Functions don't need to be deployed.

### `/expo` (raffle)
- [ ] Loads at `/expo.html` and `/expo`
- [ ] Hero shows "Win a $50 gift card" and "Wedding Expo · 5/9 Raffle" pill
- [ ] Form has 4 fields (name, email, phone, eventDate) + IG checkbox labeled `@lakesaltbartending`
- [ ] Phone keyboard appears on mobile for the phone field (inputmode="tel")
- [ ] Email keyboard appears on mobile for the email field (inputmode="email")
- [ ] Date picker opens on the date field
- [ ] Submit button reads "Enter Raffle →"
- [ ] Footer shows "Already a customer? Visit lakesalt.us"

### `/expo` thank-you panel (after submission)
- [ ] After successful submit, the form disappears and 3 CTAs show:
  - PRIMARY: "Tell us about your event + book a 15-min call" → `/book.html?...`
  - SECONDARY: "Just send me wedding info" → `/book.html?info=1&...`
  - TERTIARY: "Grab the mocktail recipe" → `/recipes.html`
- [ ] All 3 CTAs include URL params: `name`, `email`, `phone`, `date`, `ig`, `raffle=1`, `utm_source=expo-raffle`

### `/book` (public wizard)
- [ ] Loads at `/book.html` and `/book`
- [ ] Welcome screen shows brand mark, "Let's plan your perfect bar.", 3 meta pills, big "Get started →" button
- [ ] Top bar (back arrow + progress + step counter) is HIDDEN on welcome and confirmation
- [ ] Sticky CTA is HIDDEN on welcome and confirmation
- [ ] Step 1 — Event type — 4 big buttons, auto-advance on tap
- [ ] Step 2 — Date — date picker + "Not sure yet" skip link
- [ ] Step 3 — Guests — 6 range buttons, auto-advance
- [ ] Step 4 — Venue — 6 vibe pills + venue name + 3 built-in-bar pills
- [ ] Step 5 — Drinks — 7 drink-type pills (multi-select) + drink details textarea
- [ ] Step 6 — Budget — 6 range buttons, auto-advance
- [ ] Step 7 — Notes — single textarea
- [ ] Step 8 — Contact — 3 inputs (name, email, phone)
- [ ] Step 9 — Slot picker — shows loader, then either slot grid OR error fallback
- [ ] Step 10 — Confirmation — green check, summary card, link back to lakesalt.us
- [ ] Back button works on every step (returns to previous step, preserves state)
- [ ] Progress bar fills correctly (1→9 over 9 steps; visible only on questions)

### `/book?info=1` (info-only mode)
- [ ] Step 9 shows a review summary (NOT the slot grid)
- [ ] Submit button reads "Send me wedding info →"
- [ ] Skip button reads "Actually, I want to book the 15-min call"
- [ ] Tapping skip button switches to call-booking mode (re-renders slot grid)

### `/book` URL pre-fill (from /expo)
- [ ] Visiting `/book.html?name=Sarah&email=s@x.com&phone=801-555-1234&date=2026-09-12&ig=1&raffle=1` populates name/email/phone/eventDate when reaching step 8
- [ ] state.fromExpo is set to true (visible via console: `state.fromExpo`)
- [ ] state.instagramFollowed is set to true if `ig=1`
- [ ] state.raffleEntered is set to true if `raffle=1`

### `/admin/quick-add` and `/admin/close` (deprecated)
- [ ] Both URLs redirect to `/book.html` (via meta refresh + JS fallback)
- [ ] Page briefly shows "This page moved" message before redirect

### `/admin#dashboard` Booth Mode banner
- [ ] Banner is visible on the dashboard module (auto-hides after May 23)
- [ ] Banner shows 4 quick-link cards: Raffle Page, Book a Date, Booth Signs, Expo Cohort
- [ ] All 4 links open correctly
- [ ] Footer line reads: "Booth flow: brides scan QR → /expo raffle → tap..."

### `/admin#crm` cohort filter
- [ ] "Wedding Expo · 5/9" chip shows alongside "All Leads"
- [ ] Tapping the chip filters the kanban to expo-tagged leads
- [ ] Cohort stats line appears under the chips (raffle entries / booth chats / call requests / locked / contacted)
- [ ] Kanban shows the new "Call Scheduled" stage (between New Lead and Contacted)
- [ ] Stage colors: Call Scheduled = blue (#3b82f6)

### Print collateral
- [ ] `/admin/expo-booth-prints.html` loads in a desktop browser
- [ ] Page 1: table tent (Lake Salt branding, prize headline, embedded QR, "Scan to enter")
- [ ] Page 2: 4 lanyard cards (cut + laminate)
- [ ] Print preview shows clean page breaks

---

## Layer 2 — Cloud Function happy paths

Run after `firebase deploy --only functions`. Use the deployed URL `https://lakesalt.us`.

### `/expo` raffle write
- [ ] Submit raffle entry with name "Layer2 Raffle Test", a real-ish email, phone
- [ ] Lead appears in Firestore `leads` collection within 2 sec
- [ ] Lead has `campaign: 'WeddingExpo2026-05-09'`, `source: 'Expo Raffle'`, `stage: 'New Lead'`, `raffleEntry: true`
- [ ] EmailJS confirmation email arrives (check inbox)
- [ ] CRM cohort filter shows the lead

### `/book` → `bookCallSlot` (call booking)
- [ ] Walk through wizard end to end with name "Layer2 Call Booking Test"
- [ ] Pick the earliest available slot
- [ ] Submit
- [ ] Lead appears in Firestore `leads` with `stage: 'Call Scheduled'`, `source: 'Public /book'` (or "Expo /book (from raffle)" if from /expo CTA)
- [ ] `call_bookings` doc created with the same `leadId`
- [ ] `kendell_followups` doc created with `type: 'prep_for_quote_call'`, dueAt = 30 min before slot
- [ ] Confirmation email arrives
- [ ] Confirmation screen shows summary card with bride info + slot time

### `/book?info=1` → `savePublicLead` (info only)
- [ ] Walk through wizard with `?info=1` in URL
- [ ] Step 9 shows review screen (no slot grid)
- [ ] Submit
- [ ] Lead appears in Firestore `leads` with `stage: 'New Lead'`, `source: 'Public /book — info only'`
- [ ] No `call_bookings` doc created
- [ ] No `kendell_followups` doc created
- [ ] Confirmation email arrives
- [ ] Confirmation screen shows summary card (no call time)

### `getCallSlots` (slot list)
- [ ] Step 9 of `/book` loads slots within 2 sec
- [ ] Slots are grouped by day (e.g. "Monday, May 11")
- [ ] Slots cover Mon-Fri, 5:00-7:30 PM Mountain
- [ ] Tapping a slot selects it (gold background)
- [ ] Tapping another slot deselects the first

### Auth-gated `markBooked` (post-call lock)
- [ ] Sign in to `/admin` as Kendell
- [ ] In CRM, open a "Call Scheduled" lead's detail modal
- [ ] (Phase 2: a "Mark Booked" button calls `markBooked` with leadId + eventDate)
- [ ] Lead stage advances to "Booked-Tentative"
- [ ] `kendell_followups` doc created for the deposit invoice
- [ ] Function rejects if a different lead already has stage "Booked"/"Booked-Tentative"/"Completed" on the same date

---

## Layer 3 — Edge cases

### Concurrent slot booking (the race condition)
- [ ] Open `/book` on phone A and phone B simultaneously
- [ ] Both fill the wizard, pick the SAME slot
- [ ] Submit on A first, then B within 1-2 seconds
- [ ] Phone A succeeds; phone B sees an error toast: "That slot was just booked..."
- [ ] Phone B's slot list refreshes automatically (the now-booked slot is gone)

### Offline submission
- [ ] On `/expo`, fill the form, then turn off wifi/data
- [ ] Submit
- [ ] Page shows error state ("Network issue — try again or call us")
- [ ] Re-enable network, submit again — succeeds

### Empty required fields
- [ ] On `/expo`, submit with empty name/email/phone — error toast appears, no Firestore write
- [ ] On `/book` step 8, "Continue →" stays disabled until all 3 fields are filled

### Invalid email
- [ ] On both `/expo` and `/book`, an invalid-format email (no `@`) is caught by HTML5 validation

### Wedding date in the past
- [ ] On `/book` step 2, picking a date before today still allows continuing (we don't block — Kendell can sort it on the call)
- [ ] On the confirmation screen the past-date is shown as the bride entered it

### EmailJS down
- [ ] Sabotage by setting `service_rbzoxto` to invalid in dev tools, then submit
- [ ] Form still saves to Firestore (data isn't lost)
- [ ] User still sees success state (email is best-effort)

### iOS Safari rendering
- [ ] Open `/expo` and `/book` on a real iPhone
- [ ] All inputs trigger correct keyboards (tel/email/numeric)
- [ ] Date picker is the native iOS picker
- [ ] Sticky CTA stays above the iOS home indicator (safe-area-inset-bottom)
- [ ] Welcome screen text is readable (no clipping)
- [ ] Wizard transitions are smooth (no jank)

### Pre-fill from /expo
- [ ] After `/expo` raffle entry, tap "Tell us about your event + book a 15-min call"
- [ ] `/book` opens with name, email, phone, eventDate already populated
- [ ] state.raffleEntered = true and state.instagramFollowed reflects the IG checkbox
- [ ] Reaching step 8 shows the pre-filled fields (no re-typing)
- [ ] Submitting creates a lead with `source: 'Expo /book (from raffle)'`

---

## Layer 4 — Live E2E with Kendell (Friday night)

These are the bride-journey scripts. Run live with Kendell on real phones.

1. **Self-service bride** — Kendell scans QR with iPhone → `/expo` → fills raffle → "Book a 15-min call" → wizard → picks a slot → confirms
2. **Self-service bride, info-only** — same as #1 but picks "Just send me wedding info" instead → review screen → submits
3. **Bartender-assisted** — Bartender opens `/book` directly on bride's phone (skipping `/expo`) → walks her through → submits
4. **Apple-store on iPad** — Kendell signed in to `/admin` on iPad → opens `/book` on same iPad → fills for bride → submits → lead has `capturedByEmail` filled in
5. **Concurrent slot conflict** — Kendell on phone, Layer3 helper on iPad, both pick the same slot, submit at the same time. Confirm only one wins.
6. **No internet** — disconnect wifi mid-wizard → submit → form errors clearly → reconnect → resubmit → succeeds

---

## Pre-deploy verification checklist

Before running `firebase deploy`:
- [ ] `cd functions && node -c index.js` exits 0
- [ ] `cd website/admin/js && node -c app.js && node -c crm.js` both exit 0
- [ ] No `console.log` debugging in production code
- [ ] firebase.json has `/expo`, `/book`, `/admin/close`, `/admin/quick-add` rewrites
- [ ] firestore.rules allows public create on `/leads` (already does)
- [ ] No service-account JSON checked into git: `git check-ignore lake-salt-calendar-key.json` reports the file is ignored
- [ ] `git status` shows expected files only (no `.env`, no `*.json` keys)

## Post-deploy smoke test

Right after `firebase deploy`:
- [ ] `https://lakesalt.us/expo` loads
- [ ] `https://lakesalt.us/book` loads
- [ ] `https://lakesalt.us/admin/quick-add` redirects to `/book.html`
- [ ] `https://lakesalt.us/admin/close` redirects to `/book.html`
- [ ] `https://lakesalt.us/admin/index.html` loads (auth required)
- [ ] First raffle submission creates a lead in Firestore
- [ ] First `getCallSlots` call returns slots without errors

---

## Run order

For maximum confidence in minimum time:
1. **Now (before deploy):** Layer 1 — visual rendering, all bullets
2. **After deploy:** Layer 2 — happy paths, all bullets, with one real test bride record
3. **Friday night with Kendell:** Layers 3 + 4
4. **Saturday morning final check:** Post-deploy smoke test (5 min before doors open)
