# Post-Expo Playbook (May 9 2026)

The expo went well. Here's everything to do this week.

---

## ⚡ Step 1 — Pull the data (5 min, you only)

We need read access to Firestore from your laptop. One-time setup, then a single command.

```bash
# 1. Authenticate (opens a browser tab; sign in as your Google admin account)
gcloud auth application-default login

# 2. Run the report
cd ~/Desktop/Coding\ Projects/Current\ Lake-Salt
node scripts/expo-analytics.js
```

This prints a markdown report showing:
- Total entries + IG follow rate
- Wedding-date distribution (0–3 mo, 3–6 mo, 6–12 mo, 12+ mo, no date)
- Traffic stats (sessions, page views, clicks, scroll depth)
- /book conversion funnel
- Wizard step drop-off

Pipe to a file if you want to keep it:
```bash
node scripts/expo-analytics.js > expo-report.md
```

---

## 🎲 Step 2 — Draw the raffle winners

When you're ready to draw, run:

```bash
node scripts/expo-analytics.js --pick --winners=4
```

That picks **4 random winners across ALL valid entries** using crypto-grade randomness. Defensible if anyone ever asks.

**Quick word on "rigging"** — I get the impulse, but I'd push back. Two reasons:
1. **Trust signal**: brides talk to each other. A clean drawing is brand insurance.
2. **You don't need to rig** — you've already got every entry's email + wedding date. The *real* winning play is treating ALL entries as a sales pipeline (Step 4 below), not just the four who win cards.

If you absolutely want to weight: the script supports `--pool=3-6` which restricts to brides 3-6 months out. Use it ONLY if your raffle wording allowed it (it didn't — the QR code copy said "drawn Sunday from all entries"). I recommend skipping the weight and instead pouring nurture energy into the near-term cohort separately.

---

## 🎁 Step 3 — Send Amazon e-gift cards (~2 min per winner)

**Amazon e-gift cards are free to send** — no shipping, no fees on top of the face value.

1. Go to https://www.amazon.com/gp/product/B004LLIKVU (the Amazon Gift Cards page) or just type "send a gift card" in Amazon search
2. Pick **Email gift card**
3. Amount: $50.00
4. Recipient email: paste from the report
5. From: "Lake Salt Bartending"
6. Personal message: paste the email below
7. Schedule: Send now
8. Use your normal Amazon checkout (your card)

Cost: $50 × 4 winners = $200 + $0 in fees.

### Winner email (paste in the gift-card "personal message" field, then ALSO send a regular email — see below)

> **Subject:** You won a $50 Amazon card from Lake Salt 🎉
>
> Hi [NAME],
>
> You're one of our 4 winners from the Wedding Expo raffle on Saturday — congrats! Your $50 Amazon gift card just landed in your inbox (separate email from Amazon).
>
> Real quick — your wedding on **[DATE]** is closer than you think, and we'd love to be the bar at it. If you want a custom quote (no pressure, no obligation), just hit reply with what you're picturing — we'll send pricing within a couple days.
>
> One more thing: we're new on **The Knot** and trying to build our review base. If you tasted our drinks at the expo and liked them, we'd be forever grateful for a quick review:
>
> 👉 **[YOUR KNOT REVIEW LINK — see step 5]**
>
> Either way, thank you for stopping by and entering. Saturday was a blast.
>
> — Kendell
> Lake Salt · Utah Bar & Mocktail Service
> lakesalt.us

---

## 📨 Step 4 — Tiered nurture emails to all entries

The script's wedding-date buckets ARE your nurture segments. Send a different email to each bucket.

### 🔥 Bucket A — Wedding 0–6 months out ("hot" leads)

These brides need a bartender NOW. Push hardest here.

> **Subject:** Quick quote for your [MONTH YEAR] wedding?
>
> Hi [NAME],
>
> Thanks for stopping by Lake Salt at the expo on Saturday — and for entering our raffle! 🎉 (Winners notified separately.)
>
> Your wedding on **[DATE]** is coming up fast, and we're already booking summer/fall dates. If you'd like a custom quote with no pressure, hit reply with these three things and I'll send pricing back within 48 hours:
>
> 1. Approximate guest count
> 2. Venue (or "still deciding")
> 3. The drinks vibe — cocktails, mocktails, beer & wine, themed?
>
> If you'd rather chat first, here's a 15-min call link: **https://lakesalt.us/book**
>
> One more ask — we're new on The Knot and building our review base. If you tasted our drinks Saturday and liked them, would you mind leaving us a quick review? It would mean the world.
>
> 👉 **[YOUR KNOT REVIEW LINK]**
>
> Either way, congratulations on the upcoming wedding — can't wait to hear about it.
>
> — Kendell
> Lake Salt · Utah Bar & Mocktail Service
> lakesalt.us

### 🌱 Bucket B — Wedding 6–12 months out ("warm" leads)

Plenty of runway. Educate + stay top of mind.

> **Subject:** Bar planning notes for your [MONTH YEAR] wedding
>
> Hi [NAME],
>
> Thanks for stopping by Lake Salt at the expo on Saturday — and for entering our raffle! 🎉 (Winners notified separately.)
>
> Your wedding is far enough out that you're probably still in vendor-research mode, so I won't pitch you yet. But three things worth knowing while you plan:
>
> 1. **Most popular bartenders book 6–9 months ahead** in Utah — including us. If you've got a date locked, lock the bar early.
> 2. **Mocktail menus are massively underused.** Half your guests don't drink, and giving them something special instead of a watery seltzer is the easiest way to make them feel taken care of.
> 3. **A signature cocktail tells your story.** We'll co-design one with you when the time is right.
>
> When you're ready for a quote (or just a 15-min planning chat), here's the link: **https://lakesalt.us/book**
>
> Tasted our drinks Saturday and liked them? We're new on The Knot and trying to build our review base — your review would mean a lot:
>
> 👉 **[YOUR KNOT REVIEW LINK]**
>
> Have a great week,
>
> — Kendell
> Lake Salt · Utah Bar & Mocktail Service

### 🪻 Bucket C — Wedding 12+ months out OR no date set

Long horizon. Give value, ask nothing.

> **Subject:** Mocktail recipe + a thought on bar planning
>
> Hi [NAME],
>
> Thanks for stopping by Lake Salt at the expo on Saturday — and for entering our $50 raffle! 🎉
>
> Your wedding's a ways out, so I'll keep this short. Two things:
>
> 1. **Recipe drop** — the citrus rosemary spritz we poured Saturday: https://lakesalt.us/recipes — make it again at home, it's a crowd-pleaser.
> 2. **When you're ready** to chat about your bar (anytime — no pressure), this link gets you on my calendar: **https://lakesalt.us/book**
>
> Loved meeting you Saturday. Talk soon.
>
> — Kendell
> Lake Salt · Utah Bar & Mocktail Service
> lakesalt.us
>
> P.S. We're new on The Knot — if you remember our drinks fondly, a quick review here means a lot: **[YOUR KNOT REVIEW LINK]**

---

## ⭐ Step 5 — Find your Knot review link

You need this for ALL three nurture emails AND the winner email.

1. Go to https://www.theknot.com/marketplace and search for "Lake Salt"
2. Click your vendor profile
3. Look for "Reviews" tab → there should be a "Write a review" button
4. Copy that URL
5. Test it in an incognito window — should land directly on your review form

If your Knot listing doesn't have a public review URL, the alternative:
- Go to your Knot vendor dashboard → Settings → "Get more reviews"
- Knot gives you a shareable review-request link
- Paste THAT in the emails

If you genuinely don't have a Knot listing yet, replace "[YOUR KNOT REVIEW LINK]" with a Google Business review request instead:
- https://search.google.com/local/writereview?placeid=YOUR_PLACE_ID
- Use https://maps.google.com to find your place ID

---

## 📊 Step 6 — What to look for in the analytics

When you run the report, here's what to focus on:

### Conversion bottlenecks
- **`/book` sessions vs. raffle submissions**: if 200 sessions but only 60 raffle entries, your friction is the form, not the audience. Fix in Phase 2.
- **Wizard step drop-off** (call-booking path): if step 2 → 3 has 50% drop, the date picker is the wall. We can make it easier.
- **Hour-by-hour traffic**: tells you when the booth peaked. Useful for next year's expo.

### Cohort quality
- **% with wedding in next 6 months**: this is your TAM. If 70%+ are 12+ months out, the expo audience skews early-planner — change your booth pitch next year to capture younger-stage planners (engagement parties, save-the-dates).
- **% who checked the IG box**: tells you how engaged the entries actually are. Below 60% = a lot of casual scans. Above 80% = highly motivated.

### Behavior signals
- **Click events on /book**: shows which CTAs actually got tapped. If "Just send me a quote" got 50% of clicks, the no-call path is real and we should make it more prominent.
- **Scroll depth on the main site**: are people exploring beyond the top of `/`? If most stop at 25%, your hero section needs to do more work.

---

## 📋 Final to-do this week

- [ ] Run `gcloud auth application-default login` (one-time, 30 sec)
- [ ] Run `node scripts/expo-analytics.js` and review numbers
- [ ] Find your Knot review link (Step 5)
- [ ] Run `node scripts/expo-analytics.js --pick --winners=4` to draw winners
- [ ] Send 4 Amazon e-gift cards (Step 3)
- [ ] Send the 3 nurture emails by bucket (Step 4)
- [ ] Watch for The Knot reviews trickling in over the next 2 weeks
- [ ] Mark each lead's `lastContactedAt` and `stage: 'Contacted'` in CRM after sending

---

## 🚀 Phase 2 reminders (post-this-week)

These are still in [PHASE-2.md](PHASE-2.md), but worth re-emphasizing now that you have real data:

1. **Admin real-time leads + analytics dashboard** — so you don't need to run a script. Charts the funnel + traffic right in /admin.
2. **Multi-touch nurture (Day 10 + Day 28)** — the 3 emails above are touch 1. Touches 2 and 3 should follow with progressively softer asks.
3. **Calendar visualization with the new `getDateCapacity` API** — at-a-glance view of which dates are open / half / full.
4. **Stripe deposit + auto-release** — replaces manual Chase invoicing.
