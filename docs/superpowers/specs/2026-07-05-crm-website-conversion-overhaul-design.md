# Lake Salt — CRM + Website Conversion Overhaul

**Date:** 2026-07-05
**Author:** Kendell + Claude
**Status:** Approved for implementation (execution via `/loop`)

---

## 1. Problem Statement

Wedding leads are not converting to booked events. Kendell suspects he may be
overcharging. Three independent reviews (competitive pricing, CRM codebase,
public website funnel) were run to diagnose the cause.

**Finding: pricing is not the problem. The problem is follow-up velocity and
trust/conversion on the site.**

### Evidence

**Pricing is competitive, not high.**
- Jared Samson quote: $1,450 for a 145-guest mocktail wedding (~$10/guest).
- The Knot competitors in the Wasatch Front market (Bitty's, Garnish, Juniper
  Bloom, Sips On Wheels, Cocktail Compass, Love On Tap, Peace Bartending) land
  at **$900–$1,500** for comparable weddings. Lake Salt sits mid-band.
- Public site already states "most couples invest $1,200–$1,800." That is in
  range for the market.

**The leak is between "interested" and "booked."**
- 90 high-intent leads captured at the May 9 expo; 37% have weddings within 6
  months. The tiered nurture emails (Tiers 1–6) were **drafted but never sent**.
- Hot active leads are stalled waiting on Kendell: Alexis Shiner (all 8 data
  points collected, awaiting price), Jared Samson (awaiting mocktail selection +
  lock), Stephanie Morales (awaiting Vegas travel decision, 3+ days overdue).
- The CRM has **no follow-up automation**. `followUpDate` is a manual field with
  no reminder. Quotes have **no decline/lost-reason capture**, so deals go cold
  silently and there is no data on *why*.

**The website undersells trust and clarity.**
- Real Google reviews are not loading — the API key and Place ID are still
  placeholders (`YOUR_API_KEY_HERE`, `YOUR_PLACE_ID_HERE` at index.html:5159–5160).
  Visitors see 8 generic hardcoded fallback reviews with no dates.
- No About/owner story. Couples booking a wedding vendor want a human connection;
  the footer "About Us" link is dead.
- No dedicated weddings page — wedding content is only a homepage anchor
  (`#weddings`), so it does not rank for "wedding bartender Utah."
- Pricing mismatch: hero packages start at $500–$695, but the section says "most
  couples invest $1,200–$1,800." This confuses expectation-setting.
- ~220MB of `.MOV` video files are committed into `website/images/` (five files;
  one referenced in index.html). Repo bloat + slow mobile loads.

---

## 2. Goals & Non-Goals

### Goals
1. Stop the pipeline leak: automate follow-up so leads never go cold silently.
2. Capture outcome data (won/lost + reason) so pricing and messaging become
   data-driven instead of guesswork.
3. Deploy the tiered nurture to the 90 expo leads on an automated cadence.
4. Raise website trust & conversion: real reviews, About story, dedicated
   weddings page, consistent pricing, faster loads.
5. Finish and safely ship the in-progress quotes pricing-model refactor.

### Non-Goals
- Changing the underlying pricing *model* (cost-plus-margin is sound; keep it).
- Rebuilding the CRM architecture. It is production-ready; we extend it.
- A full site redesign. We add pages and fix conversion blockers; we do not
  re-theme.
- Building a bespoke email-marketing platform. We use the simplest reliable
  send path (see §4.1).

---

## 3. Guiding Constraints

- **Deploy convention:** "push to production" = `firebase deploy` **AND**
  `git push origin main`. (Per project memory.)
- **Outward-facing safety:** sending real emails to real leads is irreversible.
  Any automated send must be *armed* by an explicit Kendell-controlled flag and
  must run in dry-run mode until armed. `/loop` builds and tests in dry-run only;
  it never sends live email without the armed flag set.
- **Pricing display rule:** Kendell always sets the final client price. Public
  pricing is expectation-setting, never an auto-quote.
- **Follow existing patterns:** Firestore collections, vanilla-JS admin modules,
  EmailJS on the public site, Cloud Functions for privileged operations.

---

## 4. Design

The work is organized into four phases, sequenced by revenue impact. Phase 0 is
business action (Kendell + comms agent); Phases 1–3 are code Claude builds.

### Phase 0 — Unstick the pipeline (business action, days)

Not code, but the highest near-term revenue. Included so the plan is complete.
- Draft Kendell-voice responses for the three stalled leads (Alexis price,
  Jared mocktail confirm + lock, Stephanie Vegas travel decision).
- Approve nurture offer (10% expo discount) + send pacing, then let the
  automation (Phase 1.4) deliver — or comms agent sends the first batch manually
  if automation is not yet armed.

### Phase 1 — Stop the CRM leak (code)

**1.1 Finish & ship the quotes pricing-model refactor.**
The uncommitted `quotes.js` diff (468 lines) rewrites pricing from hourly-rate to
cost-plus-margin with profit cap (weddings) and corp floor (Adobe). It is
~90% done. Remaining: remove deprecated settings fields (qs-rate, qs-cost,
qs-peak, customMenuFee, offMenuPerDrink) from the settings UI so the form only
renders new fields; verify legacy quotes still render; commit `crm.js` +
`quotes.js` together (the crm.js diff adds the "Expo Email Sent" stage).
*Acceptance:* creating a new quote uses cost-plus-margin math and profit guards;
opening a legacy quote does not error; settings form shows only current fields.

**1.2 Lost-reason & outcome capture.**
Add explicit outcome tracking to quotes and the Lost stage. New fields on
`quotes/{id}`: `outcome` ('won' | 'lost' | 'open'), `lostReason` (enum: Price /
Went with competitor / Went DIY / Date unavailable / Ghosted / Other), and
`lostReasonNote`. When a lead is dragged to "Lost", prompt for a reason. When a
client accepts (`clientAcceptedAt`), auto-set `outcome='won'`.
*Acceptance:* moving a lead to Lost requires a reason; won/lost is queryable.

**1.3 Follow-up automation.**
Turn the dormant `followUpDate` into a live reminder system.
- A daily scheduled Cloud Function (`onSchedule`, v2) scans `leads` for
  `followUpDate <= today` and stage not in {Booked, Completed, Lost}, and
  creates a task ("Follow up: {name}") + surfaces it on the dashboard.
- When a quote is sent (`sentAt` set), auto-create a follow-up task due +3 days.
- Quote-expiry: when `now > sentAt + quoteExpiryDays` and not accepted, flag the
  lead on the dashboard as "Quote expiring / expired."
*Acceptance:* a lead with a past `followUpDate` produces a dashboard task; a sent
quote schedules a +3-day nudge; expiring quotes surface.

**1.4 Nurture engine (the 90 expo leads).**
Automate the tiered cadence.
- Store the 6 tier templates (from `cohort1_template_draft.md` /
  `cohort2-6_templates_draft.md`) in Firestore `settings/nurture_templates`.
- Each lead in the Wedding-Expo cohort gets a `nurtureTier` (1–6, by months-to-
  wedding) and a `nurtureState` (next-send date, sends-completed, paused).
- A daily scheduled function computes who is due, and either (a) sends via the
  chosen transport, or (b) in dry-run mode, writes the would-send batch to a
  Firestore `nurture_queue` doc for review. **Sends only when
  `settings/nurture.armed === true`.**
- Admin UI: a "Nurture" panel showing each tier, who is queued, and an
  ARM/DISARM toggle + "preview next batch."
*Acceptance:* in dry-run, the daily run populates `nurture_queue` with correct
leads per tier; arming the flag causes real sends; a reply or booking pauses that
lead's cadence.

**1.5 Cohort analytics into the dashboard.**
Roll the existing per-stage cohort counts up into the dashboard: expo-cohort
conversion funnel (leads → contacted → proposal → booked) and $ booked from the
cohort.
*Acceptance:* dashboard shows expo-cohort funnel + revenue.

### Phase 2 — Make the website convert (code)

**2.1 Fix Google Reviews (high impact, low effort).**
Configure the Places API key + Place ID (Kendell provides, or store in
`firebase-config.js` / a config doc), so real 5★ reviews render. Keep the
hardcoded set as graceful fallback.
*Acceptance:* live reviews load from Google; fallback still works if API fails.

**2.2 Dedicated `/weddings` page.**
New indexable page targeting "wedding bartender Utah / SLC." Wedding-specific
hero, the existing wedding pillars, real wedding gallery + reviews, clear pricing
expectation ("most weddings invest $1,200–$1,800"), FAQ, and a wedding
consultation CTA that pre-fills eventType=Wedding on the contact form. Add to
sitemap.
*Acceptance:* page exists, is indexable, links from nav + hero, pre-fills the form.

**2.3 About page (trust).**
Maddie & Kendell story + photos, credentials (TIPS-certified), service area.
Wire the dead footer "About Us" link to it. Add to sitemap.
*Acceptance:* About page exists; footer link works; owner photos present.

**2.4 Reconcile hero pricing.**
Make the homepage hero/pricing expectation consistent: keep the transparent
starting prices, but surface the "most weddings invest $1,200–$1,800" range near
the top so leads self-qualify. Decide on the budget-required field (§5, open Q1).
*Acceptance:* no contradictory pricing numbers above the fold.

**2.5 Image/performance cleanup.**
Remove the five `.MOV` files from `website/images/` (git-rm; move originals out
of the repo). Re-encode any needed video to compressed MP4/WebM hosted
appropriately. Convert large hero/gallery JPEGs/PNGs to WebP with `srcset` +
lazy-load below the fold.
*Acceptance:* no `.MOV` in the repo; homepage transfers materially less; images
lazy-load.

### Phase 3 — Make it self-improving (code)

**3.1 Quote-outcome dashboard.**
Using 1.2 data: win rate, avg days-to-close, win rate by quoted price band, and
top lost reasons. This is how Kendell will *actually* learn whether price is ever
the blocker.
*Acceptance:* dashboard card shows win rate + lost-reason breakdown.

**3.2 Harden the nurture cron + reporting.**
Weekly summary (sends, replies, bookings attributed to nurture) to Kendell.
Backoff/reply-detection so engaged leads exit the automated cadence into a human
thread.
*Acceptance:* weekly nurture report generated; replies auto-pause cadence.

---

## 5. Open Decisions (resolve during implementation)

**Q1 — Budget field required?** The in-progress diff makes budget required on the
contact form. This likely adds friction for early-stage brides. *Recommendation:*
make it a range **selector** (not free text) with a "still figuring it out"
option, so it qualifies without blocking. Revisit with real submission data.

**Q2 — Nurture email transport.** `functions/` has `googleapis` (Gmail API
capable) but no domain-wide delegation and it's a personal Gmail. Options:
(a) Gmail API via OAuth refresh token stored as a functions secret;
(b) SendGrid/Resend (better deliverability, marketing-grade, easy);
(c) reuse the existing comms-agent + scheduled-tasks path to send.
*Recommendation:* **(b) Resend or SendGrid** for the bulk nurture (deliverability
+ unsubscribe compliance matters at 90 recipients); keep 1:1 replies on Gmail via
the comms agent. Confirm with Kendell before wiring.

**Q3 — Nurture arming.** First live batch requires Kendell to flip
`settings/nurture.armed = true` after previewing the queue. `/loop` will build,
test in dry-run, and stop at the armed gate.

---

## 6. Data Model Changes

`quotes/{id}`: add `outcome`, `lostReason`, `lostReasonNote`.
`leads/{id}`: add `nurtureTier`, `nurtureState` (map: `nextSendAt`,
`sendsCompleted`, `paused`, `pausedReason`), reuse existing `followUpDate`.
`settings/nurture_templates`: 6 tier templates.
`settings/nurture`: `{ armed: bool, dryRun: bool, offer: string, pacingDays: n }`.
`nurture_queue/{date}`: dry-run preview of due sends.
New Cloud Functions: `dailyFollowupScan`, `dailyNurtureRun` (both `onSchedule`).

Firestore rules: new collections admin-only; `nurture_queue` admin read/write.

---

## 7. Sequencing & Execution

Execution order for `/loop`: **1.1 → 1.2 → 1.3 → 1.5 → 2.1 → 2.4 → 2.3 → 2.2 →
2.5 → 1.4 → 3.1 → 3.2.**

Rationale: ship the safe, self-contained CRM + website wins first (1.1, 1.2,
1.3, 1.5, and the low-risk site fixes), because they are pure code with clear
acceptance and no outward-facing risk. The nurture engine (1.4) and its
dashboard (3.x) come after the tracking foundation exists and after the
transport decision (Q2) is confirmed, and they stop at the arming gate.

Each item is committed independently. "Push to production" (firebase deploy +
git push) happens per Kendell's cadence, not automatically mid-loop, unless he
says otherwise.

---

## 8. Risks

- **Sending email to real leads** — mitigated by dry-run + armed flag + preview.
- **Breaking live quotes** with the pricing refactor — mitigated by legacy-quote
  compatibility checks before commit.
- **Places API cost/quota** — cache reviews daily rather than per pageview.
- **Deliverability** — use a real transactional/marketing provider with SPF/DKIM
  and unsubscribe links for the nurture (Q2).
