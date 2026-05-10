# Phase 2 — Post-Expo Roadmap

These are the things we deliberately deferred so you could ship by Saturday.
None of them block the expo. Tackle them the week of May 11 in priority order.

---

## 🚦 Priority 0 — Recipe automation for SEO (the biggest organic-traffic lever)

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
