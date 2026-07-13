# Receipt Scanner v2 — Quick Scan & Mobile Usability Spec

**Date:** 2026-07-12
**Builds on:** `2026-07-11-receipt-scanner-design.md` (v1, shipped). Goal: make scanning so fast and forgiving that Kendell and Maddie use it at every event.

## 1. Mobile horizontal-scroll fix (bug)

The admin page drifts left-right on phones while scrolling vertically. Fix in `admin.css`:
- `html, body { overflow-x: hidden; }`
- `.main-content { overflow-x: hidden; }`
- `.module-container { max-width: 100%; }`
Wide tables continue to scroll inside `.table-wrap` (already `overflow-x: auto`). No layout redesign.

## 2. Dashboard Quick Scan widget

- App-icon-sized button (≈56px, rounded, 📷 + "Scan" label) rendered on the Dashboard between the alerts and the stat grid, in a `#quick-actions` row. Prominent thumb-reachable placement on mobile.
- One tap → opens the phone camera / photo picker IMMEDIATELY via the same hidden multi-capture input pattern as the Expenses module (no navigation to Expenses).
- New file `website/admin/js/scan-widget.js` (script tag added to index.html after expenses.js) owns: the global hidden input, the badge, the question sheet, and the offline queue. Expenses module's scan button reuses the same `handleReceiptScan` pipeline (unchanged).
- **Needs-answers badge:** a red count bubble on the button = expenses where `status == 'needs-review'` OR (`status == 'ok'` AND `eventId == null` AND `deductionType == 'event-unknown'` — see §3 ambiguity marker) awaiting answers. Tapping the button when the badge > 0 shows a small chooser: "📷 New scan" / "❓ Answer N questions".

## 3. Progressive question flow (bottom sheet)

After a scan parses, the client evaluates the saved doc and asks ONLY what's missing, one question at a time, in a slide-up bottom sheet (`#scan-sheet`, plain CSS transition, dark-theme card):

- Trigger conditions, in priority order per receipt:
  1. `status:'needs-review'` and no amount → "Total?" — numeric input pre-filled with any partial guess, big Save button.
  2. no date → "Date?" — date input defaulting to today, plus chips "Today" / "Yesterday".
  3. `eventId == null` and `matchConfidence == null` and deductionType 'general' was a *low-information* fallback (function sets a new marker `matchCandidates: [{id,name}]` when it had plausible candidates but < 60 confidence) → "Which event?" — chips: top 3 candidate events + "General deduction" + "Skip".
  4. category was coerced to 'Misc' from an unrecognized value (function sets `categoryGuess: '<raw>'` when coercing) → "Category?" — chip grid of the 10 categories.
- Every answer = one tap (or one field + Save). Answer writes to the doc immediately, sheet advances to the next question or next receipt with a 150ms slide. "Skip" always present; skipped items keep their needs-review/unmatched state and stay in the badge count.
- Fully-parsed receipts ask nothing: toast "✓ $214.33 → Samson Wedding".
- Function change (`functions/index.js`): when writing results, add `matchCandidates` (up to 3 {id,name} of the closest events by date) whenever eventId ends up null, and `categoryGuess` when the category was coerced. Also stamp `scannedBy` — see §5.

## 4. PWA: share target + app shortcut

`manifest.webmanifest` additions:
- `"shortcuts": [{ "name": "Scan Receipt", "short_name": "Scan", "url": "/admin/?action=scan", "icons": [192px icon] }]` — long-press home-screen icon → Scan.
- `"share_target": { "action": "/admin/share-receipt", "method": "POST", "enctype": "multipart/form-data", "params": { "files": [{ "name": "receipt", "accept": ["image/*"] }] } }` — share a photo from the camera roll into the app.
- `service-worker.js`: intercept POST `/admin/share-receipt`, stash the shared image files in the offline queue store (IndexedDB, see §5), and respond with a redirect to `/admin/?action=shared`. App code on load with `?action=shared` processes the queue; `?action=scan` auto-opens the scan input after auth.

## 5. Offline queue + scannedBy + instant feedback

- **Offline queue:** IndexedDB store `receipt-queue` (db `lakesalt-scans`). `handleReceiptScan` path in scan-widget: if `navigator.onLine === false` or the upload throws a network error, save the compressed blob to the queue instead, toast "📥 Saved — will upload when back online", and show a "N queued" pill next to the Quick Scan button. On app load (post-auth) and on the `online` event, drain the queue through the normal upload pipeline.
- **scannedBy:** stub docs gain `scannedBy: currentUser?.displayName || currentUser?.email || null`.
- **Instant feedback:** on snap, the Recent Scans strip (and a mini-strip under the dashboard widget showing the latest 3) immediately shows the local thumbnail (object URL) with a shimmer while status is 'processing'; flips to the parsed summary when the listener fires. Haptic `navigator.vibrate?.(10)` on scan start and on parsed-ok. Toast on completion.

## Constitution deltas (additions to v1 constitution)

15. New optional expense fields allowed: `matchCandidates` (array ≤3 of {id,name}), `categoryGuess` (string|null), `scannedBy` (string|null). Same exact-naming rule.
16. The question sheet writes only the field(s) the user answered plus derived `taxYear`/`deductionType` consistency (answering an event sets `deductionType:'event'`; choosing General sets `'general'`); it never overwrites AI-parsed fields the user didn't touch, and clears `status` to 'ok' only when amount AND date exist after the answer.
17. Share-target and shortcut URLs live under `/admin/` scope; service-worker POST handling must not break existing caching (only intercepts `/admin/share-receipt`).
18. Offline queue never drops a blob: entries are removed only after a confirmed successful Storage upload.

## Out of scope
Mileage, multi-user roles beyond scannedBy, iOS-specific share extensions (PWA share target is Android/desktop; on iOS Maddie uses the in-app camera button — still one tap from the home-screen icon).

## Testing
Per-task checker passes as in v1 (harness-based, mutation where logic-heavy), plus final: phone-width (375px) render with zero horizontal overflow, question-sheet flow walkthrough with fixture docs, offline queue round-trip with mocked failures, share-target POST → queue entry via service-worker harness.
