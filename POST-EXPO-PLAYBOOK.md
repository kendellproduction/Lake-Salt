# Lake Salt — Post-Expo Playbook (with real data)

Generated **May 10, 2026**, the morning after the Salt Lake City Bridal Expo.

---

## 📊 The numbers

Pulled fresh from Firestore via `node scripts/expo-analytics-rest.js`. Full report at [expo-report.md](expo-report.md).

| Metric | Result |
|---|---|
| **Real entries (test rows excluded)** | **90** |
| IG-follow checked | **89 / 90 (99%)** ← high engagement |
| Unique website sessions during expo | 186 |
| /book sessions | 162 |
| Raffle conversion | **89 / 162 (55%)** of /book visits became entries |
| Call-booking submissions | 1 |
| Info-only quote submissions | 0 |
| Click events | 13 |
| Wizard step views | 235 (most landing on the raffle path / step 11) |
| Page events total | 1,554 |

### Wedding-date distribution

| Bucket | Count | % | Read |
|---|---|---|---|
| 0–3 months out | **8** | 9% | URGENT — needs a bartender NOW |
| 3–6 months out | **25** | 28% | HOT — actively shopping |
| 6–12 months out | **15** | 17% | WARM — vendor research mode |
| 12–18 months out | **26** | 29% | COOL — early planner |
| 18+ months out | **5** | 6% | Just engaged |
| Already passed | 1 | 1% | (likely typo) |
| No date set | **10** | 11% | Inspiration mode |

**The two big takeaways:**
1. **37% of entries (33 brides) have weddings within 6 months.** Real revenue pipeline.
2. **35% of entries (31 brides) are 12+ months out.** Don't pitch hard. Stay in their inbox.

### What the funnel tells us

- Brides came, scanned, entered, **left**. The "Book a 15-min call" and "Just send me a quote" CTAs were tapped almost zero times.
- **That's not a failure** — it's information. At a busy expo, brides don't have time for a 90-second wizard. They scan, win, walk on.
- The win is what we now have: 90 emails, 89 confirmed Instagram follows, 33 hot-cohort wedding dates, all tagged and ready to nurture.

---

## 🎲 Step 1 — Draw 4 winners (fair random)

```bash
cd ~/Desktop/Coding\ Projects/Current\ Lake-Salt
node scripts/expo-analytics-rest.js --pick --winners=4
```

Random draw from all 90 valid entries using `crypto.randomInt`. Run it whenever you're ready — same numbers, different draw each time, so once is enough.

I still recommend NOT weighting toward the 3-5 month cohort. Two reasons:
1. The QR copy promised a fair drawing.
2. The "real prize" for Lake Salt is the **list of 90 emails segmented by wedding date** — that's worth way more than the four $50 cards. Run the fair draw, then pour energy into nurture.

---

## 🎁 Step 2 — Send 4 Amazon e-gift cards

Free, email-only, ~2 min per winner.

1. amazon.com → "Send a gift card" (or [direct link](https://www.amazon.com/gp/product/B004LLIKVU))
2. Pick **Email gift card** → $50
3. Recipient email from the winner draw
4. From: "Lake Salt Bartending"
5. Personal message: paste the winner email below
6. Send now

### Winner email (sent separately as a regular email, since the gift-card note is short)

> **Subject:** You won the Lake Salt $50 raffle — and your wedding's coming up 🎉
>
> Hi [NAME],
>
> Congrats — you're one of our 4 winners from Saturday's Bridal Expo raffle. Your $50 Amazon gift card just landed in your inbox (separate email straight from Amazon).
>
> Real quick — your wedding on **[DATE]** is closer than you might realize, and we'd love to be the bar at it. No pressure, no obligation: hit reply with three things and I'll send a custom quote within 48 hours.
>
> 1. Approximate guest count
> 2. Venue (or "still deciding")
> 3. Drinks vibe — full cocktails, mocktails, beer & wine, themed?
>
> One more thing: we're brand new on **The Knot** and trying to build our review base. If you tasted our drinks Saturday and they made the day better, would you take 60 seconds to share that? It would mean everything.
>
> 👉 **https://theknot.com/review-wedding-vendors/2104739**
>
> Either way, congrats again, and thank you for entering.
>
> — Kendell & Maddie
> *Lake Salt — a Utah women-led bar & mocktail service*
> lakesalt.us

---

## 📨 Step 3 — Tiered nurture emails (5 tiers)

You said it best: *"if we shoot our shot too early we might miss the opportunity."* Here are five tiers calibrated to time-from-wedding. Each tier dials confidence up and pitch volume down based on how close the wedding is.

### How to think about it

- **Within 6 months**: they're decision-mode. Help them say yes by removing friction.
- **6–12 months**: they're researching. Help them pick the right vendor by showing depth.
- **12+ months**: they're dreaming. Don't sell. Be a friendly voice in the inbox so when they're ready, you're top-of-mind.
- **No date**: they're idea-collecting. Pure value, no ask.

The Knot review CTA is in EVERY email — soft, never the main thing. Same line each time so it builds recognition.

### 🔥 Tier 1 — 0-3 months out (8 brides) — *"Let's lock this in"*

> **Subject:** Quick — your [MONTH] wedding bar
>
> Hi [NAME],
>
> Thanks for stopping by Lake Salt at the expo Saturday. Your wedding is **[X] weeks away**, and I'm guessing the bar is one of the last big pieces still up in the air. That's normal.
>
> If you'd like a quote without any pressure to commit, hit reply with these three things:
>
> 1. Approximate guest count
> 2. Venue (or "still deciding")
> 3. Drinks vibe — full cocktails, mocktails, beer & wine, themed?
>
> I'll send a custom quote within 48 hours. If you'd rather hop on a 15-min call first, here's the link: **https://lakesalt.us/book**
>
> 👉 We're new on The Knot and trying to build our review base. If you tasted our drinks Saturday and liked them, a quick review would mean a lot:
> **https://theknot.com/review-wedding-vendors/2104739**
>
> Talk soon,
>
> Kendell & Maddie
> *Lake Salt — Utah women-led bar service*

### 🌶 Tier 2 — 3-6 months out (25 brides) — *"Confident, no rush"*

> **Subject:** A quote for your [MONTH] wedding (no pressure)
>
> Hi [NAME],
>
> Thanks for entering our raffle Saturday — winners notified separately. I noticed your wedding is in **[MONTH YEAR]**, which puts us right in the sweet spot where most couples are nailing down the bartender.
>
> Here's something most brides don't think about until later than they should: **the bar is one of the few vendors your guests actually interact with for hours**. The photographer captures the moment. The bartender shapes the entire vibe of the reception — pacing, energy, who's having fun, who's quietly drained.
>
> So when you're ready to think about it, I'd love to send you a custom quote. Reply with:
>
> 1. Approximate guest count
> 2. Venue (or "still deciding")
> 3. Drinks vibe — cocktails, mocktails, beer & wine, themed?
>
> Or skip ahead and pick a 15-min call: **https://lakesalt.us/book**
>
> 👉 We're new on The Knot — if our drinks made an impression Saturday, your review would mean everything:
> **https://theknot.com/review-wedding-vendors/2104739**
>
> Either way, congratulations.
>
> Kendell & Maddie
> *Lake Salt — Utah women-led bar service*

### 🌱 Tier 3 — 6-12 months out (15 brides) — *"Plant the seed"*

> **Subject:** Three things to know while you plan
>
> Hi [NAME],
>
> Thanks for stopping by Saturday. I won't pitch you yet — your wedding's still some months out and you probably have bigger pieces to figure out first (venue, photographer, dress).
>
> But three things worth knowing as you plan:
>
> 1. **Most popular bartenders book 6-9 months ahead** in Utah. If you've got a date locked, lock the bar early — even if it's not us, just don't put it off.
> 2. **Mocktail menus are massively underused.** A solid third of your guests don't drink for any reason — designated drivers, pregnancy, kids, religion, sober choice. Giving them something special instead of a watery seltzer is the easiest way to make them feel actually included.
> 3. **A signature cocktail tells your story.** We co-design one with every couple — based on your favorite flavors, where you got engaged, the season. Costs nothing to ask.
>
> When you're ready (no rush), 15-min planning chats are open here: **https://lakesalt.us/book**
>
> 👉 Tasted our drinks Saturday and remembered them? We're new on The Knot and your review would mean a lot:
> **https://theknot.com/review-wedding-vendors/2104739**
>
> Have a great week,
>
> Kendell & Maddie
> *Lake Salt — Utah women-led bar service*

### ❄️ Tier 4 — 12-18 months out (26 brides) — *"Be a friendly voice"*

> **Subject:** Mocktail recipe + a thought for your wedding
>
> Hi [NAME],
>
> Thanks for entering our raffle on Saturday. Your wedding's a year+ out so I won't pitch you. But two things, in case they're useful:
>
> **The recipe we poured Saturday** (the citrus-rosemary spritz) is up on our site if you want to make it at home or swipe the idea for an engagement party: **https://lakesalt.us/recipes**
>
> **One thing to keep in your back pocket** for when wedding planning starts feeling real: the bartender is one of the few vendors who's actively engaging with every single guest, all night long. When you're a year out it sounds like an afterthought. When you're three weeks out and trying to figure out who's going to keep drinks flowing for 150 people, it suddenly isn't. Plan ahead.
>
> When you're ready (no rush, truly), I'm here: **https://lakesalt.us/book**
>
> 👉 P.S. We're brand new on The Knot. If our drinks earned a smile Saturday, a quick review would mean a lot:
> **https://theknot.com/review-wedding-vendors/2104739**
>
> Talk soon,
>
> Kendell & Maddie
> *Lake Salt — Utah women-led bar service*

### 💭 Tier 5 — 18+ months out + no-date (15 brides) — *"Just show up nicely"*

> **Subject:** A recipe + congrats on the engagement 💍
>
> Hi [NAME],
>
> Just wanted to say thanks for stopping by Lake Salt's booth on Saturday and entering our raffle. Whether you have a date set or you're still in the "we just got engaged" haze, congratulations.
>
> No sales pitch in this email — promise. Just one thing, in case it's helpful:
>
> The drinks we poured Saturday are written up on our recipes page: **https://lakesalt.us/recipes** — make any of them at home, share them with your fiancé, send the citrus-rosemary spritz to your sister.
>
> When the wedding starts to feel real (could be 6 months from now, could be 2 years), Lake Salt is here. Until then I'll only email you if there's something genuinely useful — recipe drops, a holiday, etc. No spam.
>
> 👉 P.S. We're new on The Knot — if our drinks made the day a little better, a quick review would mean the world:
> **https://theknot.com/review-wedding-vendors/2104739**
>
> Talk soon,
>
> Kendell & Maddie
> *Lake Salt — Utah women-led bar service*

---

## 🪪 Step 4 — Animated GIF profile icon (the "stand out in the inbox" trick)

You're right that this stands out. Here's how it actually works in 2026:

**Where it shows up:** Gmail web + Gmail mobile both render *static* PNG/JPG profile photos. **GIFs in Google Workspace profile photos don't animate** in most clients — Google strips animation. Outlook strips it. Yahoo strips it.

**What DOES animate:**
- **Your email signature image** (logo or banner image) can be a GIF if you embed it inline. Gmail keeps the animation as long as the file is ≤2MB.
- **The header/banner in tools like Apollo / HubSpot / Mailchimp** preserves GIFs.
- **Mailerlite/Loops/Resend** preserve GIFs.

So the play isn't a GIF profile icon (won't work). It's an **animated signature banner**. Two options:

### Option A — Subtle animated logo (recommended)
- Take your Lake Salt logo
- Add a 1-second loop with a single subtle motion: a glint passes across the wordmark, OR a tiny bubble rises behind it
- Keep it under 800kb
- Tools: **ezgif.com** (free, browser-based), **figma.com → animate plugin**, or **canva.com** (premium has GIF export)

### Option B — Animated drink hero
- A 2-second loop of a drink being garnished or poured
- More attention-grabbing but reads less professional than the wordmark
- Same tools

### Where to install it
- Gmail → Settings → See all settings → General → Signature
- Click "Insert image" → upload your GIF
- Save → done. Every email you send forward includes it inline.

**Tip:** use the smallest dimensions that look good (~400px wide is plenty). Bigger files trigger Gmail's "view trimmed content" wall.

---

## 🍹 Step 5 — Recipe automation for SEO

Yes, regular recipe posts massively help SEO. Here's the plan.

### Why it works (the mechanics)
1. **Fresh content frequency** is one of Google's strongest ranking signals for local businesses.
2. **Long-tail recipe queries** ("citrus rosemary spritz wedding utah") are easier to rank for than competitive terms ("wedding bartender utah").
3. **Recipe schema markup** (`@type: Recipe`) lets your recipes show up in Google's rich-snippet recipe carousel — huge visibility.
4. **Internal linking** from recipes back to /book and /index pages distributes domain authority.

### Phase 2 build (~6-10 hours)

**Architecture:**
- A new Firestore collection `recipes` with: `slug, title, ingredients, instructions, mocktail (bool), seasonality, heroImage, publishedAt, schemaJson`
- A Cloud Function `publishRecipe(recipeId)` that flips a recipe's `published: true` flag and bumps the `publishedAt` timestamp
- A Cloud Scheduler cron that runs every Tuesday at 9 AM Mountain and publishes the next recipe in the queue
- A static page `/recipes/<slug>.html` per recipe (or one dynamic page that hydrates from Firestore on load)
- Auto-generated Recipe schema JSON-LD per page

**Content pipeline (your time):**
- Pre-write 12-20 recipes, drop them into Firestore as `published: false`
- Tuesday cron auto-publishes one per week
- A new sitemap entry per published recipe → Google re-crawls → ranks within 1-3 months

I can scaffold this as a Phase 2 priority right after the admin dashboard. Adding to PHASE-2.md now.

### Quick win you can do TODAY
- Open existing /recipes.html in your browser
- Make sure each recipe has a unique `<h2>` and `<meta>` description (good for SEO right now)
- Add the JSON-LD schema for any recipe you'd consider your "hero" recipe (the citrus rosemary spritz?)
- Submit your sitemap to Google Search Console if you haven't

---

## 🚺 Step 6 — Women-owned business signal

Yes — this is a real SEO + filter advantage. Two places to put it:

### 1. Inside `index.html` (where I'll put it tonight)

**Updated `<meta name="description">`:**
> "Lake Salt is Utah's premier women-led dry-hire bar & mocktail service. TIPS-certified bartenders for weddings, corporate events, and private celebrations across the Wasatch Front. Craft cocktails AND mocktails — we do it all."

**Updated JSON-LD `description`** (same line, also `keywords` field):

**New schema field:** `actionableFeedbackPolicy` and a custom `additionalProperty` for women-owned status. Plus body content: an "About us" section with "Maddie & Kendell co-own Lake Salt — a Utah-based, women-led bar service" — this is the visible signal Google understands as authentic.

I'll commit this update with the next push.

### 2. Outside the site (where it really matters)

These are bigger SEO+marketing levers than the website itself:

- **Google Business Profile** → Edit profile → Business attributes → Identity → check **"Women-owned"** and **"Family-owned"** if both are true
- **The Knot** vendor profile → settings → "Women-owned" tag (if available in their UI)
- **WeddingPro / WeddingWire** → same
- **Yelp** → business attributes → women-owned
- Many wedding-couple search filters explicitly include "women-owned" as a checkbox — getting the badge unlocks all of them at once

### About the "SEO .md page we created recently"

Heads up — I searched the project and don't see a dedicated SEO .md document we created in this session. Possibilities:
- You might be thinking of the JSON-LD schema *inside* `website/index.html` (which I'll update tonight)
- Or the [README.md](website/README.md) inside `website/`
- Or `lake-salt-weddingpro-links.md` (which is more of a link directory)

If you have a different file in mind, paste me its path and I'll update it. **OR** if you'd like, I can create a proper `website/llms.txt` (the emerging standard for AI-crawler-friendly documentation that ChatGPT, Claude, and Perplexity now read when they search the web) — that's a great place to declare "women-owned" prominently.

---

## 📋 This week's checklist

- [ ] **Today:** run `node scripts/expo-analytics-rest.js --pick --winners=4` to draw winners
- [ ] **Today:** send 4 Amazon e-gift cards (Step 2)
- [ ] **Today:** send winner emails (uses winner draft above)
- [ ] **Tomorrow:** send Tier 1 nurture (8 brides, urgent — handle individually if possible)
- [ ] **Tomorrow:** send Tier 2 nurture (25 brides, BCC bulk OK)
- [ ] **Wednesday:** send Tier 3 nurture (15 brides, BCC bulk OK)
- [ ] **Thursday:** send Tier 4 nurture (26 brides, BCC bulk OK)
- [ ] **Friday:** send Tier 5 nurture (15 brides, BCC bulk OK)
- [ ] **Anytime this week:** add "Women-owned" attribute on Google Business + Knot + WeddingPro
- [ ] **Anytime this week:** create your animated email-signature banner (Step 4)
- [ ] **Mark each lead's `lastContactedAt` and `stage: 'Contacted'` in CRM** as you send

---

## 🚀 Phase 2 priorities (post-this-week)

Adding to existing [PHASE-2.md](PHASE-2.md):

1. ⭐ **Recipe automation for SEO** (Step 5 above) — biggest organic-traffic lever
2. ⭐ **Admin real-time leads + analytics dashboard** — so you don't run scripts
3. **Day-10 + Day-28 multi-touch follow-up** via the comms agent
4. **Stripe deposit + auto-release** — replaces manual Chase invoicing
5. **Calendar visualization with `getDateCapacity` API** — see "half/full" status at a glance for any date
