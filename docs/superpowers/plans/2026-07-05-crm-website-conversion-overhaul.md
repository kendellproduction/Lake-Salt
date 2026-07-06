# Lake Salt CRM + Website Conversion Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is intended to be run via `/loop` — work tasks in order, commit after each, stop at any step marked **HUMAN GATE**.

**Goal:** Fix the wedding-lead conversion leak — automate CRM follow-up, capture win/lost data, deploy tiered nurture to 90 expo leads, and raise website trust/clarity — without changing the (competitive) pricing model.

**Architecture:** Extend the existing Firebase/Firestore admin SPA (vanilla-JS modules) and public site (static HTML + EmailJS). Add two scheduled Cloud Functions (v2 `onSchedule`) for follow-up scanning and nurture sends. Add outcome/nurture fields to Firestore. Add two static public pages. No framework, no build step — match existing patterns.

**Tech Stack:** Firebase (Firestore, Auth, Cloud Functions v2 on Node 20, Hosting), vanilla JS ES modules, EmailJS (public forms), Google Places API (reviews), a transactional email provider for nurture (Q2 — Resend recommended). Verification: Firebase emulator for functions, the `preview_*` tools for the site, direct Firestore inspection for CRM.

**Source spec:** `docs/superpowers/specs/2026-07-05-crm-website-conversion-overhaul-design.md`

**Global conventions:**
- Each task: read the current file first, make the change, verify, then commit. Commit messages use the existing `type(scope): summary` style and end with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- "Push to production" (`firebase deploy` + `git push origin main`) is NOT done automatically mid-loop. Commit locally; leave deploy to Kendell unless he says otherwise.
- Never send live email. Nurture builds and runs in dry-run only until the **HUMAN GATE** in Task 12.

---

## Execution Order

1. Task 1 — Finish & ship the quotes pricing-model refactor
2. Task 2 — Lost-reason & won/lost outcome capture
3. Task 3 — Daily follow-up scan (scheduled function)
4. Task 4 — Auto follow-up task on quote send + expiry flag
5. Task 5 — Expo-cohort funnel on the dashboard
6. Task 6 — Fix Google Reviews (real data)
7. Task 7 — Reconcile hero pricing + budget field
8. Task 8 — About page
9. Task 9 — Dedicated /weddings page
10. Task 10 — Image/performance cleanup (remove .MOV, WebP)
11. Task 11 — Nurture engine data model + templates + admin panel (dry-run)
12. Task 12 — Nurture daily send function (dry-run → **HUMAN GATE** → armed)
13. Task 13 — Quote-outcome dashboard
14. Task 14 — Nurture reporting + reply-pause hardening

---

## Task 1: Finish & ship the quotes pricing-model refactor

The uncommitted `quotes.js` diff (468 lines) rewrites pricing to cost-plus-margin
with a profit cap (weddings) and corp floor (Adobe). It is ~90% done. The
remaining work is removing deprecated settings fields and verifying legacy quotes
still render, then committing `crm.js` + `quotes.js` together.

**Files:**
- Modify: `website/admin/js/quotes.js`
- Modify: `website/admin/js/crm.js` (already has the "Expo Email Sent" stage diff)

- [ ] **Step 1: Read the current diff and files.**
  Run: `git diff website/admin/js/quotes.js website/admin/js/crm.js`
  Then open `website/admin/js/quotes.js` and locate `renderQuoteSettingsCard` (~line 1700) and the settings field IDs.

- [ ] **Step 2: Remove deprecated settings fields.**
  In `renderQuoteSettingsCard`, delete any inputs/handlers for the retired model:
  `qs-rate`, `qs-cost`, `qs-peak`, `customMenuFeeDefault`, `offMenuPerDrink`,
  `saturdayPeakMultiplier`. The form must render ONLY the current fields
  (flat bartender pay default, supplies default, travel default, margin defaults
  by event type, profit-cap trigger/value, corp floor, margin floor, deposit %,
  quote-expiry days). Remove any now-dead read/write of those keys in the
  settings save handler.

- [ ] **Step 3: Verify legacy quote compatibility.**
  Confirm `findSimilarQuotes` / `calcQuote` / `readFieldsIntoState` still handle
  old field names (`bartenderRate`→`bartenderPay`, `customMenuFee`→`supplies`,
  `travelFee`→`travel`). The backward-compat mapping already exists in the diff —
  verify it is present and does not throw on a quote missing the new fields.

- [ ] **Step 4: Manual verification in the emulator/preview.**
  Start the admin locally (preview_start on the admin server, or open via the
  Firebase emulator). In the Quotes module: (a) build a NEW wedding quote (150
  guests, 3 bartenders, $300 pay, $600 supplies, 60% margin) and confirm the
  profit cap produces ~$2,600; (b) open an existing/legacy quote and confirm it
  renders without a console error. Use `preview_console_logs level:error` to
  confirm no errors.

- [ ] **Step 5: Commit.**
```bash
git add website/admin/js/quotes.js website/admin/js/crm.js
git commit -m "feat(quotes): ship cost-plus-margin pricing model; add Expo Email Sent stage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** New quotes use cost-plus-margin with profit guards; legacy quotes
open without error; settings form shows only current fields.

---

## Task 2: Lost-reason & won/lost outcome capture

Add explicit outcome tracking so we learn *why* deals die. Won is auto-set when a
client accepts (hook the existing `onQuoteAccepted` trigger). Lost requires a
reason when a lead is dragged to the Lost stage.

**Files:**
- Modify: `website/admin/js/crm.js` (Lost-stage drop handler + reason prompt UI)
- Modify: `website/admin/js/quotes.js` (write `outcome` on quote docs)
- Modify: `functions/index.js` (`onQuoteAccepted` sets `outcome='won'`)
- Modify: `firestore.rules` (allow admin to write new fields — likely already covered by admin-write; verify)

- [ ] **Step 1: Read `functions/index.js` around `onQuoteAccepted` (line ~554).**
  Run: `sed -n '554,600p' functions/index.js` (via Read tool).

- [ ] **Step 2: Set `outcome='won'` on accept.**
  In `onQuoteAccepted`, when the update sets `clientAcceptedAt`, also write
  `outcome: 'won'` and `wonAt: <serverTimestamp>` to the quote doc (guard against
  overwriting if already set).

- [ ] **Step 3: Add lost-reason prompt in `crm.js`.**
  In the kanban drop handler, when the target stage is `Lost`, open a small modal
  prompting for `lostReason` (select: `Price`, `Went with competitor`,
  `Went DIY / self-serve`, `Date unavailable`, `Ghosted / no response`, `Other`)
  and an optional `lostReasonNote` textarea. On confirm, write `stage:'Lost'`,
  `lostReason`, `lostReasonNote`, `lostAt` to the lead, and if the lead has a
  linked quote, set that quote's `outcome:'lost'` + `lostReason`.

- [ ] **Step 4: Verify.**
  In preview: drag a test lead to Lost → confirm the reason modal appears and
  blocks completion until a reason is chosen; check Firestore that the lead and
  its quote got `outcome`/`lostReason`. Accept a test quote via the public quote
  page → confirm `outcome='won'` appears on the quote doc.

- [ ] **Step 5: Commit.**
```bash
git add website/admin/js/crm.js website/admin/js/quotes.js functions/index.js firestore.rules
git commit -m "feat(crm): capture won/lost outcome + lost reason on quotes and leads

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** Moving a lead to Lost requires a reason; accepting a quote sets
`outcome='won'`; won/lost is queryable in Firestore.

---

## Task 3: Daily follow-up scan (scheduled function)

A scheduled function that turns the dormant `followUpDate` into real dashboard
tasks so leads never go cold silently.

**Files:**
- Modify: `functions/index.js` (add `dailyFollowupScan`)
- Modify: `functions/package.json` (no new dep — `onSchedule` ships with firebase-functions v2)

- [ ] **Step 1: Add the scheduler import.**
  At the top of `functions/index.js`, add:
```js
const { onSchedule } = require('firebase-functions/v2/scheduler');
```

- [ ] **Step 2: Implement `dailyFollowupScan`.**
  Runs daily 8am America/Denver. Query `leads` where `followUpDate <= today` and
  `stage` not in {`Booked`, `Completed`, `Lost`}. For each, create a task in the
  existing tasks collection ("Follow up: {name}", due today, source
  'auto-followup') — but only if an open auto-followup task for that lead does not
  already exist (idempotency). Log a count.
```js
exports.dailyFollowupScan = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'America/Denver' },
  async () => {
    const today = ymd(new Date());
    const snap = await db.collection('leads')
      .where('followUpDate', '<=', today).get();
    let created = 0;
    for (const doc of snap.docs) {
      const lead = doc.data();
      if (['Booked', 'Completed', 'Lost'].includes(lead.stage)) continue;
      const existing = await db.collection('tasks')
        .where('leadId', '==', doc.id)
        .where('source', '==', 'auto-followup')
        .where('done', '==', false).limit(1).get();
      if (!existing.empty) continue;
      await db.collection('tasks').add({
        leadId: doc.id, leadName: lead.name || '',
        title: `Follow up: ${lead.name || 'lead'}`,
        due: today, done: false, source: 'auto-followup',
        createdAt: new Date(),
      });
      created++;
    }
    console.log(`dailyFollowupScan created ${created} follow-up tasks`);
  }
);
```
  (Confirm the real `tasks` schema field names by reading `crm.js` task code first
  — match `done`/`title`/`due`/`leadId` to whatever the module actually uses.)

- [ ] **Step 3: Verify in the emulator.**
  Run the functions emulator, seed a lead with `followUpDate` = yesterday and
  stage `Contacted`, trigger the scheduled function, and confirm exactly one task
  is created; run again and confirm no duplicate.

- [ ] **Step 4: Commit.**
```bash
git add functions/index.js
git commit -m "feat(functions): daily follow-up scan creates tasks for due leads

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** A lead with a past `followUpDate` produces exactly one dashboard
task; re-runs are idempotent.

---

## Task 4: Auto follow-up task on quote send + expiry flag

When a quote is sent, schedule a +3-day nudge. When a sent quote passes its
expiry without acceptance, flag it.

**Files:**
- Modify: `functions/index.js` (trigger on quote `sentAt`; extend `dailyFollowupScan` or add expiry scan)
- Modify: `website/admin/js/dashboard.js` (surface "quote expiring/expired")

- [ ] **Step 1: Add a quote-sent trigger.**
  Add `onDocumentUpdated('quotes/{quoteId}')` (or extend the existing quote
  trigger) so that when `sentAt` transitions from empty→set, it writes a
  `followUpDate` = sentAt + 3 days onto the linked lead (only if the lead has no
  sooner follow-up already).

- [ ] **Step 2: Add expiry detection to the daily scan.**
  In `dailyFollowupScan`, additionally query `quotes` where `sentAt` set,
  `outcome` != 'won', and `sentAt + quoteExpiryDays < today`; mark those quotes
  `expired: true`. Read `quoteExpiryDays` from `settings/quote_defaults`.

- [ ] **Step 3: Surface on the dashboard.**
  In `dashboard.js`, add an "Expiring quotes" line to the deal-flow widget listing
  quotes where `expired === true` and lead not Booked/Lost.

- [ ] **Step 4: Verify.**
  Emulator: set a quote's `sentAt` → confirm lead `followUpDate` becomes +3 days.
  Seed a quote with `sentAt` older than expiry → run scan → confirm `expired:true`
  and that it renders on the dashboard in preview.

- [ ] **Step 5: Commit.**
```bash
git add functions/index.js website/admin/js/dashboard.js
git commit -m "feat(quotes): auto +3d nudge on send and expiry flagging

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** Sending a quote schedules a +3-day follow-up; expired quotes are
flagged and shown on the dashboard.

---

## Task 5: Expo-cohort funnel on the dashboard

Roll the existing per-stage cohort counts up into a dashboard funnel + revenue.

**Files:**
- Modify: `website/admin/js/dashboard.js`
- Reference: `website/admin/js/crm.js` (`renderCohortStats`, cohort constant ~line 8–12)

- [ ] **Step 1: Read `renderCohortStats` in `crm.js`** to reuse its cohort key/logic.

- [ ] **Step 2: Add a dashboard cohort card.**
  Compute, for the "Wedding Expo 5/9" cohort: counts at New/Contacted/Proposal
  Sent/Booked, conversion % at each step, and total $ booked (sum of booked leads'
  quote totals). Render a compact funnel card.

- [ ] **Step 3: Verify.**
  Preview the dashboard; confirm the cohort card shows the funnel and a revenue
  number consistent with Firestore data. No console errors.

- [ ] **Step 4: Commit.**
```bash
git add website/admin/js/dashboard.js
git commit -m "feat(dashboard): expo-cohort conversion funnel + booked revenue

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** Dashboard shows the expo-cohort funnel + $ booked.

---

## Task 6: Fix Google Reviews (real data)

Real 5★ reviews should render instead of the generic hardcoded fallback.

**Files:**
- Modify: `website/index.html` (~line 5159–5160 config; review-load code)
- Possibly: `website/firebase-config.js` or a small config include for the key

- [ ] **Step 1: HUMAN GATE — get the API key + Place ID.**
  The Places API key and Place ID are placeholders. Kendell must supply them (or
  confirm the existing GCP project key + the Lake Salt Google Business Place ID).
  Do not invent them. If unavailable, stop this task and continue with the next.

- [ ] **Step 2: Wire the key + Place ID.**
  Replace `YOUR_API_KEY_HERE` / `YOUR_PLACE_ID_HERE`. Prefer loading reviews via a
  small daily cache (a Cloud Function that fetches Places reviews and stores them
  in `settings/google_reviews`) to avoid per-pageview quota/cost; the page reads
  the cached doc, falling back to the hardcoded set if empty.

- [ ] **Step 3: Verify.**
  Preview the homepage reviews section; confirm real reviews load (names/ratings/
  dates) and that killing the network still shows the fallback gracefully.

- [ ] **Step 4: Commit.**
```bash
git add website/index.html functions/index.js
git commit -m "feat(site): load real Google reviews with cached fallback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** Live Google reviews render; fallback still works offline.

---

## Task 7: Reconcile hero pricing + budget field

Remove the pricing contradiction and reduce contact-form friction.

**Files:**
- Modify: `website/index.html` (hero/pricing section; contact form budget field)
- Modify: `website/book.html` (budget step, to match)

- [ ] **Step 1: Surface the realistic range near the top.**
  Ensure the "most weddings invest $1,200–$1,800" expectation appears with the
  starting-price packages so the $500 starting price and the $1.2–1.8k range read
  as consistent (starting price = smallest config; typical wedding = the range).

- [ ] **Step 2: Convert budget from required free-text to a range selector.**
  Per spec Q1: replace the required free-text budget with a select — e.g.
  `Under $800`, `$800–$1,200`, `$1,200–$1,800`, `$1,800–$2,500`, `$2,500+`,
  `Still figuring it out`. Keep it required-but-answerable (the "still figuring it
  out" option prevents blocking). Update the same control in `book.html`. Ensure
  the value still writes to the `budget` field EmailJS + Firestore already save.

- [ ] **Step 3: Verify.**
  Preview both forms; submit a test with each budget option; confirm the value
  reaches the `leads` doc / EmailJS payload (check `preview_network`).

- [ ] **Step 4: Commit.**
```bash
git add website/index.html website/book.html
git commit -m "fix(site): consistent wedding pricing expectation; budget as range selector

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** No contradictory pricing above the fold; budget is a
non-blocking range selector that still populates the lead record.

---

## Task 8: About page (trust)

**Files:**
- Create: `website/about.html`
- Modify: `website/index.html` (footer "About Us" link → `/about.html`)
- Modify: `website/sitemap.xml`

- [ ] **Step 1: Build the page.**
  Match the site's existing header/footer/styles (copy the shell from index.html).
  Content: Maddie & Kendell story, an owner photo (use an existing gallery image
  until a portrait is supplied), TIPS certification, service area (6+ counties),
  and a "Get a custom quote" CTA linking to `#contact`.

- [ ] **Step 2: Wire the footer link + sitemap.**
  Point the dead footer "About Us" link at `/about.html`; add `<url>` entry to
  `sitemap.xml` (priority 0.6).

- [ ] **Step 3: Verify.**
  Preview `/about.html`; confirm header/footer render, image loads, footer link
  works from the homepage. Check title/meta description are set.

- [ ] **Step 4: Commit.**
```bash
git add website/about.html website/index.html website/sitemap.xml
git commit -m "feat(site): About page with owner story; fix dead footer link

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** About page exists, indexable, footer link works, owner content
present.

---

## Task 9: Dedicated /weddings page

Indexable landing page targeting "wedding bartender Utah / SLC."

**Files:**
- Create: `website/weddings.html`
- Modify: `website/index.html` (nav link)
- Modify: `website/sitemap.xml`

- [ ] **Step 1: Build the page** from the existing wedding section content
  (pillars, story, gallery) plus: wedding-specific hero headline + a
  "Book a wedding consultation" CTA that links to the contact form with
  `?eventType=Wedding` (and JS on the form to preselect Wedding), the "most
  weddings invest $1,200–$1,800" line, wedding reviews, and the wedding FAQ items.
  Title: "Wedding Bartending & Mobile Bar — Salt Lake City | Lake Salt". Add
  meta description targeting the keyword.

- [ ] **Step 2: Preselect event type from query param.**
  In the contact form init JS, read `?eventType=` and preselect the matching
  option.

- [ ] **Step 3: Nav + sitemap.**
  Add a "Weddings" nav link; add `<url>` to sitemap (priority 0.9).

- [ ] **Step 4: Verify.**
  Preview `/weddings.html`; confirm it renders, the CTA lands on the form with
  Wedding preselected, and it is not `noindex`.

- [ ] **Step 5: Commit.**
```bash
git add website/weddings.html website/index.html website/sitemap.xml
git commit -m "feat(site): dedicated weddings landing page with pre-filled consult CTA

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** `/weddings.html` exists, indexable, in nav + sitemap, CTA
pre-fills Wedding.

---

## Task 10: Image/performance cleanup

Remove ~220MB of committed `.MOV` files and optimize large images.

**Files:**
- Delete from repo: `website/images/*.MOV` (5 files)
- Modify: `website/index.html` (the one `.MOV` reference + large `<img>` tags)

- [ ] **Step 1: Find the `.MOV` reference.**
  Run: `grep -n 'IMG_2481\|IMG_2499\|IMG_7738\|IMG_7748\|IMG_7782' website/index.html`
  Decide: if a background/hero video is genuinely used, re-encode to a small
  compressed MP4/WebM (target < 3MB) and reference that; otherwise remove the
  element.

- [ ] **Step 2: Remove the `.MOV` files from the repo.**
  Move originals out of the repo first (to `~/Desktop/lake-salt-originals/`), then:
```bash
git rm website/images/IMG_2481.MOV website/images/IMG_2481-1.MOV \
       website/images/IMG_2499.MOV website/images/IMG_7738.MOV \
       website/images/IMG_7748.MOV website/images/IMG_7782.MOV
```

- [ ] **Step 3: Optimize large images.**
  Convert the largest JP/PNG (e.g. `IMG_8491.jpeg` 2.8MB, `menu-*.png` 1.5MB) to
  WebP; add `loading="lazy"` to below-the-fold `<img>`; add `srcset` where a
  large image is displayed small. Keep the originals as fallback `<img src>` only
  if needed.

- [ ] **Step 4: Verify.**
  Preview homepage; confirm it renders identically and check
  `preview_network` that image transfer size dropped and below-fold images
  lazy-load. No broken images (`preview_console_logs level:error`).

- [ ] **Step 5: Commit.**
```bash
git add -A website/images website/index.html
git commit -m "perf(site): remove committed .MOV files; WebP + lazy-load large images

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** No `.MOV` in the repo; homepage image payload materially smaller;
no broken images.

---

## Task 11: Nurture engine — data model, templates, admin panel (dry-run)

Automate the tiered cadence for the 90 expo leads. This task builds everything
EXCEPT live sending (Task 12). Everything here is safe.

**Files:**
- Create: `website/admin/js/nurture.js` (admin panel module)
- Modify: `website/admin/index.html` (register the Nurture panel/nav)
- Modify: `firestore.rules` (new collections/docs admin-only)
- Seed script: `scripts/seed-nurture-templates.js`

- [ ] **Step 1: Define the data model.**
  `settings/nurture` = `{ armed:false, dryRun:true, offer:'10% expo discount', pacingDays:2 }`.
  `settings/nurture_templates` = `{ tier1:{subject,body}, ... tier6:{...} }`
  (bodies from `cohort1_template_draft.md` + `cohort2-6_templates_draft.md`).
  On each expo-cohort lead: `nurtureTier` (1–6 by months-to-wedding) and
  `nurtureState` = `{ nextSendAt, sendsCompleted:0, paused:false, pausedReason:'' }`.

- [ ] **Step 2: Seed templates.**
  Write `scripts/seed-nurture-templates.js` (Node + firebase-admin, mirroring the
  existing scripts in `scripts/`) that reads the two cohort markdown drafts and
  writes `settings/nurture_templates`. Run it against the project.

- [ ] **Step 3: Tier assignment.**
  Add a one-time admin action ("Assign nurture tiers") in `nurture.js` that, for
  every lead in the Wedding-Expo cohort without a `nurtureTier`, computes the tier
  from `eventDate` (months out: 0–3→1, 3–6→2, 6–12→3, 12–18→4, 18+→5, no date→6)
  and sets `nurtureState.nextSendAt = today`.

- [ ] **Step 4: Admin panel UI.**
  `nurture.js` renders: per-tier counts, a table of who is queued with next-send
  dates, an **ARM/DISARM** toggle (writes `settings/nurture.armed`), a dry-run
  indicator, and a "Preview next batch" button that shows what *would* send.

- [ ] **Step 5: Rules.**
  Add `settings/nurture`, `settings/nurture_templates`, and `nurture_queue/*` as
  admin-only in `firestore.rules`.

- [ ] **Step 6: Verify.**
  Preview the Nurture panel: run "Assign nurture tiers" on test data, confirm
  tiers computed correctly, confirm the ARM toggle flips the flag in Firestore,
  confirm "Preview next batch" lists the right leads. No live email is possible
  yet (Task 12).

- [ ] **Step 7: Commit.**
```bash
git add website/admin/js/nurture.js website/admin/index.html firestore.rules scripts/seed-nurture-templates.js
git commit -m "feat(nurture): data model, templates, tier assignment, admin panel (dry-run)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** Tiers assign correctly; admin panel shows queue + ARM toggle;
nothing sends.

---

## Task 12: Nurture daily send function (dry-run → HUMAN GATE → armed)

**Files:**
- Modify: `functions/index.js` (`dailyNurtureRun`)
- Modify: `functions/package.json` (add email provider SDK — Resend recommended, Q2)

- [ ] **Step 1: HUMAN GATE — confirm transport (spec Q2).**
  Confirm with Kendell the send provider (recommend Resend for deliverability +
  unsubscribe) and add its API key as a Cloud Functions secret. Do not hardcode.
  If undecided, stop here — Task 11's dry-run is fully functional without this.

- [ ] **Step 2: Implement `dailyNurtureRun` (dry-run first).**
  `onSchedule` daily 9am America/Denver. Load `settings/nurture`. Query expo
  leads where `nurtureState.paused=false`, stage not in {Booked, Completed, Lost},
  and `nurtureState.nextSendAt <= today`. Build the batch (lead + tier template).
  If `armed !== true` OR `dryRun === true`: write the batch to
  `nurture_queue/{today}` and return WITHOUT sending. Only when `armed===true &&
  dryRun===false`: send each via the provider (with unsubscribe link), then set
  `nurtureState.sendsCompleted++`, `nextSendAt = today + pacingDays`, and log.

- [ ] **Step 3: Verify dry-run in emulator.**
  Seed armed=false; run the function; confirm `nurture_queue/{today}` is populated
  with the correct leads and NO email is sent. Confirm the admin "Preview next
  batch" reads the same queue.

- [ ] **Step 4: Commit (still dry-run).**
```bash
git add functions/index.js functions/package.json
git commit -m "feat(nurture): daily send function (dry-run; gated by armed flag)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: HUMAN GATE — arming.**
  Do NOT arm automatically. Present the previewed first batch to Kendell. He flips
  `settings/nurture.armed=true` and `dryRun=false` (or approves you to) only after
  reviewing. The first live batch should be small (Tier 1, 8 urgent brides) before
  the rest.

**Acceptance:** Dry-run populates the queue and sends nothing; live sending is
possible only after the human arming gate.

---

## Task 13: Quote-outcome dashboard

Turn the Task 2 data into insight: is price *ever* the blocker?

**Files:**
- Modify: `website/admin/js/dashboard.js` (or `analytics.js`)

- [ ] **Step 1: Compute metrics** from `quotes`: win rate (won / (won+lost)),
  avg days-to-close (wonAt − sentAt), win rate bucketed by quoted-total band
  (<$1k, $1–2k, $2–3k, $3k+), and a lost-reason breakdown (count per reason).

- [ ] **Step 2: Render a dashboard card** with those numbers + a simple bar for
  lost reasons (reuse existing chart style in `analytics.js`).

- [ ] **Step 3: Verify.**
  Preview; confirm the card renders with real numbers and no console errors.

- [ ] **Step 4: Commit.**
```bash
git add website/admin/js/dashboard.js
git commit -m "feat(dashboard): quote win-rate, days-to-close, lost-reason analytics

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** Dashboard shows win rate, days-to-close, and lost-reason
breakdown; if "Price" is rarely the lost reason, that confirms the diagnosis.

---

## Task 14: Nurture reporting + reply-pause hardening

**Files:**
- Modify: `functions/index.js` (weekly report; reply-pause)
- Modify: `website/admin/js/nurture.js` (report display)

- [ ] **Step 1: Reply/booking auto-pause.**
  When a lead replies (comms agent sets a flag / stage advances past Contacted) or
  is booked, set `nurtureState.paused=true`, `pausedReason='engaged'` so the
  automated cadence stops and a human takes over. Add a check in `dailyNurtureRun`
  to skip paused leads (already covered) and a trigger to set paused on stage
  advance.

- [ ] **Step 2: Weekly nurture report.**
  `onSchedule` weekly: summarize sends, replies, and bookings attributed to the
  nurture cohort in the last 7 days; write to `nurture_reports/{date}` and surface
  in the admin panel.

- [ ] **Step 3: Verify.**
  Emulator: advance a nurtured lead's stage → confirm `paused=true`. Run the
  weekly job → confirm a report doc is written and renders in the panel.

- [ ] **Step 4: Commit.**
```bash
git add functions/index.js website/admin/js/nurture.js
git commit -m "feat(nurture): reply-pause + weekly performance report

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Acceptance:** Engaged leads exit the cadence; a weekly report is generated and
visible.

---

## Post-Plan: Deploy

After the tasks Kendell wants live are complete and verified, "push to
production" per project convention:
```bash
firebase deploy
git push origin main
```
Do this only when Kendell says so (especially before Task 12 is armed).

---

## Self-Review Notes (author)

- **Spec coverage:** Phase 1.1→Task 1; 1.2→Task 2; 1.3→Tasks 3–4; 1.4→Tasks
  11–12; 1.5→Task 5; 2.1→Task 6; 2.2→Task 9; 2.3→Task 8; 2.4→Task 7; 2.5→Task 10;
  3.1→Task 13; 3.2→Task 14. All spec items mapped.
- **Open decisions:** Q1 (budget) resolved in Task 7; Q2 (transport) gated in
  Task 12 Step 1; Q3 (arming) gated in Task 12 Step 5.
- **Safety:** every outward-facing action (real reviews key, live email) sits
  behind a HUMAN GATE; `/loop` builds and verifies in dry-run and stops at gates.
- **Adaptation:** no fabricated test framework — verification uses the Firebase
  emulator, `preview_*` tools, and direct Firestore inspection, matching this
  codebase's actual tooling.
