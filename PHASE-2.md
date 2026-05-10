# Phase 2 — Post-Expo Roadmap

These are the things we deliberately deferred so you could ship by Saturday.
None of them block the expo. Tackle them the week of May 11 in priority order.

---

## 🚦 Priority 0c — Mobile-first expense capture (the "I'm at the store, just log it" tool)

**The need:** "When I'm on my phone I dont think to use it. How can we make it so stupid easy I can actually use it. Like if it was a widget on my screen or a icon when I slide down my top of phone."

### Three layers, all worth shipping
1. **iOS Shortcut** with a 3-field form (amount, category, vendor → submit). Accessible from:
   - Home screen icon (one tap, opens the shortcut)
   - Control Center (the slide-down panel) — Apple supports custom Shortcuts there in iOS 17+
   - Siri ("Hey Siri, log expense $42 at Costco for raffle prizes")
   - Widget on home screen (mid-size widget shows last 3 expenses + a big "+ Add" button)
   - Lock screen widget (iOS 16+)
2. **PWA install** — install lakesalt.us/admin as a home-screen app for fullscreen access without browser chrome.
3. **Backend endpoint** — new Cloud Function `addExpense({amount, category, vendor, description, receipt})` that the iOS Shortcut posts to. Writes to Firestore `expenses` collection.

### Build effort
- iOS Shortcut + Cloud Function endpoint: ~2 hours
- PWA manifest + service worker: ~1 hour
- Custom widget: would require a SwiftUI native iOS app (~1 week — too much for the marginal benefit)

**Recommendation:** ship iOS Shortcut + PWA. Skip native widget. Total ~3 hours.

---

## 🚦 Priority 0d — Bank-account auto-categorize agent (Plaid integration)

**The need:** "If an agent can monitor our bank account and see when charges are entered, and then automatically add then, categorize them that would be awesome."

### How it works
- **Plaid Link** — Plaid is the standard for bank-account API access in the US. Free for low-volume use; ~$0.50/connected-account/month past the free tier.
- Lake Salt connects its Chase business account once via Plaid Link
- A Cloud Function runs nightly via Cloud Scheduler, calls Plaid's `/transactions/sync` endpoint
- New transactions get auto-categorized using a hybrid rules + LLM approach:
  - **Rules first** (cheap, fast): if vendor matches a known pattern (Costco → "Supplies", Square*Lake Salt → "Revenue ignore", etc.), assign category
  - **LLM fallback**: for unknown vendors, ask Claude/GPT to guess category given the vendor name + amount + Lake Salt context
- All transactions land in Firestore `expenses` (or `revenue` for incoming) with `categorized: true|false` and `confidence: 0..1` scores
- Admin gets a daily digest email with newly-categorized items + low-confidence items needing review

### Build effort
- Plaid Link setup + Cloud Function: ~6 hours
- Categorization rules + LLM: ~4 hours
- Digest email + admin review UI: ~3 hours
- Total: 12-15 hours

### What it replaces
- Manual expense entry on phone (no need to remember; bank does it for you)
- Scrolling through Chase statements at month-end
- Tax-prep transaction sorting

---

## 🚦 Priority 0e — Instagram follower + inbox monitor

**The need:** "We only had 22 new IG followers after the event. Can you monitor our IG follower count and stuff? Can you monitor our IG inbox too?"

### Two separate features

**1. Follower count tracking (~3 hours)**
- Daily snapshot of @lakesaltbartending follower count via Instagram Graph API (requires IG Business account + Facebook app — Lake Salt likely already has this for the Knot integration)
- Stored in Firestore `ig_snapshots` with `{ date, followers, following, posts }`
- Plotted in a new admin chart: 30-day follower delta + per-event spikes
- Per-expo: tag the expo date so the Expo Overview can show "This expo brought +22 IG followers"

**2. Inbox monitoring + auto-routing (~6 hours)**
- Webhook subscription to IG message events (Meta Webhooks for Instagram)
- New messages land in Firestore `ig_inbox` collection
- Auto-classifier: is this a wedding inquiry? a partnership? spam? a fan?
- If wedding inquiry: create a CRM lead (or update existing if email/phone matches), tag `source: 'Instagram DM'`, alert Kendell via push
- Admin UI: `/admin#ig-inbox` shows unread DMs with quick-reply buttons

### Combined Phase 2 effort
- ~9 hours for both follower tracking + inbox monitoring
- Best paired with the existing `lake-salt-comms` agent — let it draft DM replies for review

---

## 🚦 Priority 0f — Admin theme switcher (color-scheme picker)

**The need:** "Add a feature to the settings page of the dashboard to change the color scheme for the entire admin backend. I want easy click color options."

### Build
- New Settings module at `/admin#settings` (nav entry under Operations)
- Theme picker: 6-8 preset color schemes as click-to-apply tiles:
  - Current: Navy + Champagne (default)
  - Lake Salt Cream (light theme — ivory bg, navy text, champagne accents)
  - Midnight (true black bg, gold text)
  - Forest (deep green bg, copper accents)
  - Burgundy + Rose (warm dark theme)
  - Slate (neutral gray)
- Each theme = a CSS variable override JSON: `{ --bg-card, --bg, --text, --gold, --border, ... }`
- Selected theme stored in `localStorage` → applied via `:root` CSS variable update on load
- Optional: per-admin (stored in `admins/{uid}.theme`) so different users get their preferred theme
- Live preview as user hovers over each tile

### Build effort
- ~3 hours total

---

## 🚦 Priority 0a — Expo registration monitor agent

**The need:** "Eventually set up a agent that can monitor for the day these expo registration go live. I want to sign up the day of because of early bird discounts."

### What it does
A scheduled agent that polls a list of known expo websites (Salt Lake Bridal Expo, Utah Bridal Showcase, Park City Wedding Expo, etc.) and alerts Kendell the moment next-year's registration window opens.

### Build
- New Firestore collection `expo_watch` with: `{ name, registrationUrl, lastChecked, lastStatus, alertedAt, registrationDetected, expectedWindow }`
- Cloud Scheduler cron runs every 6 hours
- For each watched expo:
  1. Fetch the registration URL via Firecrawl/HTTP
  2. Check for trigger phrases ("Register now", "Open for vendors", "2027 booth", price changes from $0 to $X)
  3. If detected: write `registrationDetected: true` and send Kendell an SMS + email + Slack alert
- Admin UI in `/admin#expo` → list of watched expos with manual add + status

### Estimated effort
- ~6 hours for the scaffolding (Firestore collection, Cloud Function, scheduled trigger)
- ~2 hours per expo to configure each URL + trigger heuristics
- Total: 8-10 hours for v1 with 5 watched expos

### Why later not now
The May 9 expo just happened. Next year's registration window probably opens November 2026 (most expos open ~6 months ahead). We have time to build this properly.

---

## 🚦 Priority 0b — Recipe automation for SEO (the biggest organic-traffic lever)

**Why this matters most**: Lake Salt's Wedding Expo cohort showed 35% of brides are 12+ months out from their wedding. The single best way to capture them later is to be the top organic result when they finally Google "wedding bartender utah." Recipe content is the cheapest, fastest path there.

### Mechanics
- **Fresh content frequency** is one of Google's strongest local-business signals
- **Recipe schema markup** (`@type: Recipe`) gets you into the recipe carousel — huge visibility
- **Long-tail recipe queries** ("citrus rosemary spritz utah") are easier to rank for than "wedding bartender utah"
- **Internal linking** from recipes back to /book and / distributes domain authority to your money pages

### Build (~6-10 hours)
1. New Firestore collection `recipes` with fields: `slug, title, ingredients, instructions, mocktail (bool), seasonality, heroImage, publishedAt, schemaJson, published (bool)`
2. New static page `website/recipes/<slug>.html` per recipe (Cloud Function generates these on publish, OR use a single dynamic page that hydrates from Firestore on load)
3. Auto-generated Recipe schema JSON-LD per page
4. Cloud Scheduler cron: every Tuesday 9 AM Mountain → publish next queued recipe → bump sitemap
5. Pre-write 12-20 recipes, queue them, autopilot from there

### Quick win Kendell can do TODAY without code
- Open `website/recipes.html`
- Make sure each recipe has a unique `<h2>` and Recipe schema JSON-LD
- Submit sitemap to Google Search Console
- Re-publish manually each week with one new recipe

---

## 🚦 Priority 1 — Admin lead + analytics dashboard

**The need:** "Can we add a page in the admin section for me to watch leads in
real time, and see the analytics of all my pages?"

**Build:** a new `/admin#analytics` module (or extend the existing `dashboard`
module) with:

### Real-time lead feed
- Live Firestore subscription to the `leads` collection (newest first, last 24h)
- Card per lead with: name, source tag (Raffle / Call Booked / Info-only / Wedding Wizard / etc), wedding date, contact, "view full record" button
- Auto-updates as new leads arrive — no refresh needed
- Sound chime on new lead (toggleable, off by default)

### Analytics charts
Backed by the `page_events` Firestore collection (already populated tonight on `/book`):
- **Funnel chart**: page_view → wizard_step_view by step → wizard_submitted (raffle vs call vs info)
  - Clearly shows which step has the highest dropoff
- **Hourly traffic** during the expo (bar chart, 9 AM–9 PM Saturday)
- **Source breakdown** (raffle entries vs call bookings vs info-only) over time
- **Device/browser** mix from `ua` field
- **Avg time-to-submit** (time delta between earliest page_view and submission for each sessionId)

Build with Chart.js or Recharts. Both are tiny and play nice with Firestore data.

### Estimated effort: 6–10 hours

---

## 🚦 Priority 2 — Cross-page analytics

**Currently:** only `/book` writes `page_events` to Firestore.

**Add page-view tracking to:**
- `/index.html` (the main lakesalt.us onboarding wizard) — already has form-submit tracking, just needs page_view + wizard_step_view
- `/admin/index.html` (track admin tool usage so you can see what features people use)
- `/recipes.html` and any other landing pages

**Pattern to copy** (from `book.html`, after Firebase init):
```js
const _sessionId = (sessionStorage.getItem('lsSession') || (() => {
  const s = Math.random().toString(36).slice(2,10) + Date.now().toString(36);
  sessionStorage.setItem('lsSession', s); return s;
})());
function track(event, props) {
  try {
    db.collection('page_events').add({
      sessionId: _sessionId,
      page: window.location.pathname,
      event, props: props || {},
      ua: (navigator.userAgent || '').slice(0, 200),
      referrer: document.referrer || '',
      utmSource: new URLSearchParams(location.search).get('utm_source') || '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {}
}
track('page_view');
```

Add a few key events on each page (`form_started`, `form_submitted`, `clicked_pricing`, etc).

### Estimated effort: 2–3 hours per page

---

## 🚦 Priority 3 — Stripe deposit + auto-release

Currently after a call → quote → accept, Kendell manually sends the $100 Chase
invoice. Replace with:

- **Stripe Connect** account setup (free, ~30 min)
- New Cloud Function `createDepositInvoice(leadId, amount)` — generates a
  Stripe Payment Link and emails it
- **Cloud Scheduler cron** runs daily, scans `kendell_followups` for
  `dueAt < now AND completed == false`, auto-sends payment link
- Webhook from Stripe → mark `kendell_followups.completed = true` + advance
  lead to `Booked` stage

### Estimated effort: 8–12 hours

---

## 🚦 Priority 4 — Multi-touch nurture sequence

The `lake-salt-comms` agent already exists. Wire it to cron:
- Day 0: confirmation email (already done in /book)
- **Day 3**: "did you have any questions after our chat?"
- **Day 10**: agent-drafted personalized check-in (uses captured event details)
- **Day 28**: "wanted to circle back" + final CTA before lead ages out

**How it differs from generic drip:** the agent reads the lead's captured data
(wedding date, drinks picked, venue type) and writes a NEW email per touch —
not a template with merge tags. Same approach as the Sunday follow-up plan in
`sunday-followup-prompt.md`, but on a schedule.

### Estimated effort: 6–8 hours

---

## 🚦 Priority 5 — Real-time CRM lead detail with quote calculator

Currently the CRM has a basic lead-detail modal. Extend it with:

- **Inline pricing calculator** — based on captured fields (guest count, drinks,
  hours, venue type), show suggested quote ranges. Helps you quote faster
  during the 15-min call.
- **"Send Quote" button** — creates a custom quote PDF + email + advances stage
  to `Proposal Sent`
- **Quote acceptance link** — bride clicks → calls `markBooked` Cloud Function
  → lead becomes `Booked-Tentative` → triggers Stripe deposit invoice (P3)

### Estimated effort: 10–14 hours

---

## 🚦 Priority 6 — Contract generation + e-signing

Currently no contract. Plan:
- **Contract template** (you write the text, I draft the structure):
  - Parties, event details, services, pricing, deposit terms, cancellation
    policy, liability/insurance, signatures
- **DocuSign embedded signing** (or Dropbox Sign, cheaper) integrated into
  the CRM lead-detail page
- After deposit paid → contract auto-sent → bride signs → lead advances to
  `Booked` → calendar event finalized

### Estimated effort: 12–16 hours

---

## 🚦 Priority 7 — Bartender shift assignment + my-shifts page

Currently bartenders have admin access but no role-specific view. Add:
- `assignedStaff` field on each lead (multi-select)
- New `/admin#my-shifts` module — filtered to events where the logged-in
  bartender is `assignedStaff`
- Each card: event details, drink menu, venue address, expected guest count,
  "I'm available / not available" toggle (used for future scheduling)

### Estimated effort: 4–6 hours

---

## 🚦 Priority 8 — Polish + accessibility

After the above is done:
- WCAG 2.1 AA review of `/book` (color contrast, focus states, keyboard nav)
- iOS Safari on older iPhones (test 13 / 14)
- Reduced-motion fallback (turn off starfield/firefly when `prefers-reduced-motion: reduce`)
- Real Open Graph + Twitter Card images for `/book` (when shared, looks great)
- Progressive enhancement: pages should work without JS (fallback to a static
  contact form)

### Estimated effort: 6–8 hours

---

## 🚦 Priority 9 — Mocktail recipe download (PDF)

The `/expo` thank-you used to link to `/recipes.html` for the mocktail recipe
giveaway. Make this:
- A single-page printable PDF (signature mocktail recipe + Lake Salt branding)
- Hosted at `/recipes.pdf`
- Available as a download CTA after raffle entry

Easy win. Adds value at zero ongoing cost.

### Estimated effort: 1–2 hours

---

## 📅 Suggested 2-week sprint after the expo

**Week 1 (May 12–18):**
- [ ] Priority 1 — admin dashboard (gives you visibility on follow-up)
- [ ] Priority 2 — cross-page analytics (lets P1's charts show all pages)
- [ ] Priority 9 — mocktail PDF (easy win, finishes the loop)

**Week 2 (May 19–25):**
- [ ] Priority 3 — Stripe deposit (removes manual Chase invoicing)
- [ ] Priority 4 — Multi-touch nurture (replaces manual follow-ups)

**Weeks 3–4:**
- [ ] Priority 5 — Quote calculator
- [ ] Priority 6 — Contract + signing
- [ ] Priority 7 — Bartender shifts
- [ ] Priority 8 — Polish

---

## 🛡 Things ALREADY working (no Phase 2 work needed)

For your peace of mind tomorrow morning — these are confirmed live:

- ✅ `/book` raffle path → Firestore lead with `raffleEntered: true`
- ✅ `/book` 15-min call booking path → Firestore lead + call_bookings doc + kendell_followups task
- ✅ `/book` info-only quote path → Firestore lead with no call_bookings doc
- ✅ Atomic slot-booking transaction (no double-booking possible)
- ✅ Page-view + step-by-step + abandonment + submission analytics on `/book`
- ✅ Auth-protected `/admin` with the existing CRM Kanban
- ✅ "Wedding Expo · 5/9" cohort filter on the CRM
- ✅ Booth Mode banner on dashboard with quick-link cards
- ✅ Email confirmation via EmailJS for all submission types
- ✅ Mobile-first responsive layout, iOS Safari tested
- ✅ Canvas starfield + fireflies with battery-friendly tab-hide pause
- ✅ Reduced-motion support is *not yet* in — that's Priority 8
