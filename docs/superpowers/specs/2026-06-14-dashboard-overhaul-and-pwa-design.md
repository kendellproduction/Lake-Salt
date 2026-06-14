# Lake Salt — Dashboard Overhaul + Installable App/Hub

**Date:** 2026-06-14
**Author:** Kendell + Claude
**Status:** Draft for review

## Goal

Turn the admin Dashboard from a "numbers you can't trust, widgets you don't use" page into a
decision-making cockpit, and make the whole admin installable as a desktop app with a hub that
launches both Lake Salt and Life OS from one icon.

Two independent projects:
- **A — Dashboard overhaul** (date filter, clickable cards, action widgets, alerts)
- **B — Installable PWA + hub launcher**

---

## Project A — Dashboard Overhaul

### Data model context (important)

The admin has two overlapping collections:
- `events` — clean financial records with ISO `date` (`YYYY-MM-DD`) and numeric `revenue`.
  Holds **completed/historical** events. Just backfilled with 13×2025 + 8×2026 events.
- `leads` — the CRM pipeline. Has `stage`, `source`, `eventDate` (human string e.g. "June 16, 2026"),
  `createdAt` (timestamp), `followUpDate`, `budget`, `notes[]`. Holds **future booked** events and
  all open pipeline.

Rule of thumb the dashboard follows:
- **Money stats** (revenue / costs / profit) → `events` + `expenses` + `payments`.
- **Pipeline widgets** (upcoming, deals, lead flow) → `leads`.

### Dashboard layout (top → bottom)

1. **Alerts strip** (only when something is flagged)
2. **Date filter** + **stat cards** (clickable)
3. **Action row** — Upcoming Events · Deals to Close · Lead Flow
4. **Insight row** — Money Made · Event Size & Profitability · Website Analytics
   (each ending in a 💡 suggestion)

Actionable sits above historical on purpose: the top of the page answers "what do I do today,"
the bottom answers "how is the business doing."

### A1. Global date filter

A segmented control at the top of the dashboard, driving every stat card and money widget.

- Options generated **dynamically**: `MTD`, `YTD`, then one button per full year from **2025** to the
  current year, then `All time`. Today (2026) that renders: `MTD · YTD · 2025 · All time`.
  In 2027 it auto-adds a `2026` button. No hardcoded years.
- Default selection: **YTD**.
- Implemented as `getDateRange(filter) → {start: Date, end: Date}`. A single source of truth that every
  stat and widget filters against. `MTD` = first of current month → now. `YTD` = Jan 1 current year → now.
  `2025` = full calendar year. `All time` = no bounds.
- Selection persists in `localStorage` so it survives reloads.

### A2. Clickable stat cards → drill-down

Each money card becomes clickable and opens the existing modal layer (`#modal-overlay`) showing exactly
what's behind the number, filtered to the active date range:

| Card | Drill-down content |
|------|-------------------|
| Revenue | Every contributing event: name, date, $revenue — sorted desc, with total footer |
| Costs | Two tables: Expenses (desc/date/category/$amount) and Labor payments (bartender/event/$) |
| Net Profit | Revenue total vs Costs total side-by-side, with the math shown |
| Open Leads | The actual open leads (name, stage, event date) — each row clicks through to CRM |

Active Bartenders card links to the Bartenders module (no modal needed).

Visual affordance: cards get a hover state + a small "↗ view" hint so it's obvious they're clickable.

### A3. Three action widgets (replace Recent Leads + Recent Activity)

**1. Upcoming Events** — what to prep for.
- Source: `leads` where `stage ∈ {Booked, Booked-Tentative}` and parsed `eventDate ≥ today`.
- Sorted soonest-first. Each row: date, client, event type, $ (budget), guest count, and a
  **staffing badge** (✅ staffed / ⚠ needs bartender) when assignment data exists.
- Row click → opens the lead in CRM.
- Empty state: "No upcoming booked events."

**2. Deals to Close** — the close-more-deals engine.
- Source: `leads` in open stages `{New Lead, Expo Email Sent, Call Scheduled, Contacted, Proposal Sent, Booked-Tentative}`.
- Prioritized so the most actionable surface first:
  1. **Proposal Sent** with no reply, oldest first (waiting on them)
  2. Leads with **no `followUpDate`** set (falling through cracks)
  3. **Aging** leads (no activity in 7+ days)
- Each row shows the lead, its stage, days since last touch, and a suggested **next action**
  ("Follow up on proposal", "Schedule call", "Set a follow-up date"). Row click → CRM.
- Capped at ~8 rows with a "View all in CRM" link.

**3. Lead Flow** — where deals come from and where they stall.
- Source: `leads` created within the active date range (`createdAt`).
- Two parts:
  - **By source**: count of new leads grouped by `source` (Referral, Expo, Website, etc.) — shows which
    channels are actually producing.
  - **Mini funnel**: counts at each stage (New → Contacted → Proposal → Booked) with the overall
    conversion % (Booked+Completed ÷ total). Makes the stall point visible.

### A3b. Insight / history widgets (with suggestions)

Below the action widgets. These are about understanding the business, and **every one ends with a
one-line 💡 suggestion** derived from its own numbers (see A6). All respect the date filter.

**4. Money Made** — the history view you asked for.
- Source: `events` revenue in range. Shows total made, # of events, and a small bar/line of
  revenue by month so you can see the shape of the year.
- Suggestion example: "Your three biggest months were Aug, Dec, Jun — all corporate. Push corporate
  outreach into your slow months (Jan–Mar)."

**5. Event Size & Profitability** — efficiency stats.
- Source: `events` (+ matched `expenses`/`payments` per `eventId` for margin).
- Metrics: avg guests/event, avg revenue/event, **revenue per guest**, avg **margin %**, and a
  breakdown by event type (Corporate vs Private vs Wedding).
- Suggestion example: "Corporate events net 71% margin vs 48% for private — every corporate booking is
  worth ~2 private ones. Prioritize corporate leads in Deals to Close."

**6. Website Analytics** — from the `page_events` collection.
- Source: `page_events` in range. Metrics: unique sessions (visitors), top pages, traffic sources
  (referrer + UTM), and a **booking funnel**: visits to `book.html` → form interactions → leads created.
- The high-value join: tie `page_events` UTM/referrer to `leads.source` to show **which channels
  actually produce booked business**, not just traffic.
- Suggestion example: "book.html got 210 visits but only 6 form starts — the form is your drop-off
  point, tighten it." or "Instagram drove 40% of traffic but 0 booked leads — traffic ≠ customers."

### A4. Alerts strip

A banner that renders **only when something is flagged**, at the very top of the dashboard.
Dismissed alert IDs are remembered in `localStorage` so they don't nag.

Flag sources:
- **Expense anomalies** (scan of `expenses` in range):
  - **Off-business keywords** in description — configurable blocklist (boat, jet ski, tv, electronics,
    vacation, furniture, …). These have nothing to do with bar catering.
  - **Unusually large** — amount greater than a multiple (e.g. 3×) of the median expense.
  - **Out-of-state** — flagged when an expense's `location`/`state` ≠ home state (Utah).
    *Requires a new optional `state` field on the expense form (see A5).*
- **Activity-log events** (scan of `activity`):
  - Data **deletions** (events / leads / payments removed)
  - **Big money edits** — revenue or payment changed by a large delta
  - **New sign-ins** — a sign-in from a new device/account (requires sign-in logging, see A5)

Each alert row: icon, plain-English summary, timestamp, and a dismiss (✕). Severity color-coded
(red = security/deletion, amber = financial anomaly).

### A6. Suggestion engine

A small rule-based helper (`getSuggestion(widgetType, stats)`) that returns one plain-English,
actionable sentence per insight widget. Not AI/LLM — deterministic rules over the computed stats, so
it's fast, free, and predictable. Examples of the rule shapes:
- Money Made → identify peak vs slow months, recommend outreach timing.
- Profitability → compare margins across event types, recommend which to prioritize.
- Website → detect funnel drop-off (high views ÷ low form starts) or high-traffic-low-conversion sources.
- Lead Flow → name the best-converting source, recommend doubling down.

Rules live in one file so they're easy to tune. Each returns `null` when there isn't enough data
(widget then hides its suggestion line rather than showing a guess).

### A5. Supporting changes (small, necessary)

- **Expense form**: add an optional `state` field (defaults to UT) so out-of-state detection works going
  forward. Existing expenses without it simply aren't geo-flagged.
- **Sign-in logging**: on successful auth, write an `activity` doc `{action:'signin', userName, device, createdAt}`.
  The alert engine flags a sign-in whose device fingerprint hasn't been seen before.

---

## Project B — Installable PWA + Hub Launcher

### B1. Make Lake Salt admin installable

- Add `website/admin/manifest.webmanifest`: name "Lake Salt Admin", `start_url: /admin/`,
  `display: standalone`, theme/background colors matching the dark UI, icon set.
- Add `website/admin/service-worker.js`: cache the app shell (html/css/js + CDN libs) for offline load
  and to satisfy installability. Network-first for Firestore, cache-first for static assets.
- Register the SW + link the manifest from `admin/index.html`.
- Generate maskable PNG icons (192, 512) from the Lake Salt logo in `admin/logos/`.
- Result: the browser shows "Install" → app lands in the Mac dock, opens chrome-less.

### B2. Hub launcher

- New tiny app at `website/hub/` — its own installable PWA (manifest + SW + icons).
- One screen: titled tiles that open each dashboard.
  - **Lake Salt Admin** → `/admin/`
  - **Life OS** → `https://our-finances-93a54.firebaseapp.com/`
  - (Layout leaves room for future tiles.)
- Each app stays 100% independent — the hub only navigates. No shared auth/data in v1.
- Tiles open in the same window (replace) so the installed hub feels like one app; a small "back to hub"
  affordance isn't needed because each dashboard already has its own nav and the user can reopen the hub.

### Deployment

Per project convention, "push to production" = `firebase deploy` **and** `git push origin main`.

---

## Out of scope (explicitly)

- Merging the Life OS and Lake Salt codebases / shared login (revisit later if wanted).
- Revenue-pace-vs-last-year and Adobe-concentration widgets (user doesn't want them).
- True geocoding of expense locations (we use a manual `state` field, not IP/geo lookup).

## Testing / verification

- Date filter: switching options recomputes every stat + widget; totals match the drill-down sums.
- Drill-downs: modal totals equal the card value for the same range.
- Widgets: seeded with current Firestore data, verify Upcoming Events shows Min Scarleta (Jun 16 2026),
  Deals to Close surfaces open leads, Lead Flow groups by source correctly.
- Alerts: inject a test off-business expense ("Boat") and confirm it flags; confirm dismiss persists.
- PWA: Lighthouse "installable" passes; install to dock works; hub launches both apps.
