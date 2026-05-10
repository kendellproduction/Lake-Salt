# Cowork prompt — Post-expo email campaign (DRAFT + STAGE only — DO NOT SEND)

> **⚠️ Read the safety block before pasting into Cowork. The prompt below explicitly tells Cowork NOT to send anything until Kendell authorizes each batch. Verify Cowork understands this on the first turn before letting it draft anything.**

---

## How to use this file

1. Open a fresh Cowork chat window.
2. Paste **everything between `===PROMPT START===` and `===PROMPT END===`** below.
3. Cowork will respond with: (a) the cohort it pulled from Firestore, (b) Tier 1 drafts personalized to each lead, (c) **a request for your authorization before sending**.
4. Reply with `APPROVED — send Tier 1` to release that batch. Cowork holds everything else until you approve each batch.

---

## What this campaign does

- Sends 5 different emails to 89 real raffle entries (test rows excluded), grouped by how far away their wedding is
- Closer wedding = more direct close: ask for a quote or a call right now
- Further wedding = pure value, no ask, just be a warm presence so we're top-of-mind later
- Includes a **soft referral ask** in the middle tiers (allowed)
- **Does NOT ask for Google or Knot reviews** — see "On reviews" section below for why
- Updates each lead's CRM card after the email is sent
- Schedules Day-10 + Day-28 follow-up reminders for each lead
- Cancels scheduled touches if the lead replies before then

---

## On reviews — short answer: don't ask

You asked: "Can we ask expo attendees for Google reviews? They paid to enter the event, we paid to be there."

**Google's policy** ([source](https://support.google.com/contributionpolicy/answer/7400114)): a review must reflect "a genuine experience at a location or with a business." Reviews "where you have a vested interest" or "in exchange for incentives" are removable. Google specifically calls out that the reviewer must have *engaged with the business itself* — not the venue, not the event organizer, not a third party.

**What expo attendees actually transacted:** they paid the expo organizer for entry. They didn't pay Lake Salt anything. They sampled free drinks but didn't book a service. The "business engagement" is paper-thin from Google's POV.

**Risks if you ask anyway:**
- Google's review-quality system can flag reviews from non-customers and remove them
- A spike of reviews from accounts with no booking history (no Google Pay trail, no follow-up engagement) is a known suspicious pattern
- New Google Business profiles are watched more closely; suspension is rare but happens

**What's safe and works just as well:**
- Ask for **Instagram tags + shares** (allowed, social media isn't review-platform-policed)
- Ask for **referrals** (totally allowed, no platform TOS to violate)
- Ask for **Google reviews AFTER they actually book + get served** at their wedding — that's the legitimate, high-conversion moment, and Phase 2 includes a post-event automation for it

The campaign below uses IG tag asks + referral asks. Reviews come later.

---

## Notes for the Expos Notes tab (paste these in)

When you're ready, click into `/admin#expo` → Notes & Learnings tab and paste these into the appropriate columns:

### What worked (green column)
- 99% of entries checked the IG follow box → form completion was high
- 44% raffle conversion (89 of 203 /book sessions) — above industry baseline (15-40%) for a giveaway form
- $50 Amazon raffle prize + mocktail samples drew real engagement
- Booth had 4 people which felt cramped at peak times but kept conversations going
- Wedding-date capture rate was strong: only 11% submitted with no date

### What to change (red column)
- Cohort skews late: 35% of brides are 12+ months out (long nurture cycle, slow revenue)
- Near-term pipeline was only 32 brides (37%); next year tweak the pitch to attract closer-date brides
- Almost no one (1 person) used the "book a 15-min call" CTA after the raffle. The CTA didn't get visibility — brides scanned, won, walked off
- 13-24 click events recorded total — brides didn't explore /book beyond raffle entry
- Real cost was higher than $1,200 estimate (need itemized expense tracking next year)
- We had ~22 NEW IG followers but the form said 99% claimed they followed — the gap means the IG checkbox is honor-system honor-broken

### Free-form notes (main column)
- 89 real entries on May 9, 2026 expo
- Top buckets: 3-6 months out (25 brides), 12-18 months out (26 brides)
- 0 duplicate phone numbers, 0 duplicate emails — clean cohort
- 44% raffle conversion is strong; the post-raffle CTAs (call booking, info-only) need rework — almost zero conversions there
- For next year: design booth signage that emphasizes "in-season weddings" or "summer 2027 weddings" to skew the cohort closer to bookable

---

```
===PROMPT START===

# TASK: Draft and stage the post-expo nurture email campaign for Lake Salt
#       Bartending. DO NOT SEND ANYTHING until Kendell explicitly authorizes
#       each batch with the phrase "APPROVED — send Tier N".

## ⚠️ HARD CONSTRAINT — read this first

You are PREPARING and SHOWING drafts only. Do not call any "send email"
tool/MCP/function until Kendell has reviewed the drafts for that tier and
explicitly typed "APPROVED — send Tier N" where N is the tier number.

If you reach a point where you would send an email and don't see explicit
approval for that exact tier in the conversation, STOP and ask. Repeating
the policy: NEVER click send without the explicit "APPROVED" line.

## CONTEXT

- **Business:** Lake Salt Bartending, women-owned dry-hire bar service in
  Salt Lake City, Utah. Co-owned by Maddie + Kendell Andrews.
- **Sender identity:** "Kendell & Maddie · Lake Salt"
- **Reply-to:** contact@lakesalt.us
- **Today:** May 10, 2026
- **Real cohort size:** 89 entries (after filtering one @test.local row)
- **Pricing reference:** Lake Salt has simple base packages on the website
  (https://lakesalt.us/index.html#pricing-packages — Mobile Bar Full Setup
  starts $995, Bartender Only $395, Mocktail Bar $695, Dirty Soda Bar $495).
  But every event is custom — we customize the quote to the actual guest
  count, hours, drinks, and venue.

## DATA SOURCE

Lead data is in Firestore at `leads where campaign == 'WeddingExpo2026-05-09'`.

To pull the per-bucket lists, choose ONE:

A. **Use the admin UI:** sign in to https://lakesalt.us/admin → Expos →
   Cohort tab → click "Copy 25 emails" per bucket (paste into BCC or
   process one-by-one).

B. **Use the script** from the project root:
   `node scripts/expo-analytics-rest.js > expo-report.md`
   then parse the per-bucket lists at the bottom of the report.

Each lead doc has these fields (use them for personalization):
  - name (string, may be "First Last" or just first name)
  - email (string)
  - phone (string, e.g. "8015551234")
  - eventDate (string, "YYYY-MM-DD" or empty)
  - instagramFollowed (bool)
  - raffleEntered (bool)
  - source (string, usually "Expo Raffle (quick)")
  - campaign ("WeddingExpo2026-05-09")

## CAMPAIGN PHILOSOPHY (read carefully — calibrates tone)

The biggest mistake at this stage: pitching too hard at brides whose
wedding is 12+ months out. They're dreaming, not buying. If we shoot too
early we lose them.

Inversely: brides 0-6 months out are decision-mode. Soft, friendly,
no-ask emails to them = wasted opportunity. They want help choosing.

Five tiers, calibrated:

| Tier | Wedding distance | Goal of email | Tone |
|---|---|---|---|
| 1 | 0-3 months out (URGENT) | Get a quote request or call this week | Direct, confident, low-friction |
| 2 | 3-6 months out (HOT) | Inspire + soft close — request quote | Warm, confident, value-led |
| 3 | 6-12 months out (WARM) | Plant seed + share planning value | Helpful, no pitch |
| 4 | 12-18 months out (COOL) | Pure value, just be friendly | Warm, generous, no ask |
| 5 | 18+ months / no-date (DREAMING) | Show up nicely, build relationship | Just hello |

## WHAT TO INSPIRE (use sparingly, weave naturally — don't fake stats)

Honest, true things you can say:
- A bartender is one of the few wedding vendors guests interact with for
  hours. The DJ runs the music; the photographer captures moments; the
  bartender shapes the ENERGY of the night.
- ~30% of guests at most weddings don't drink (designated drivers,
  pregnancy, kids, religion, sober choice). A real mocktail menu is
  often the difference between those guests feeling included vs. ignored.
- Last call comes too soon when the bar is understaffed. Drink pacing
  determines dance-floor energy.
- A signature cocktail co-designed with the couple gets photographed,
  Instagrammed, and remembered for years. We design these for free with
  every booking.

DO NOT make up statistics. If you reach for a stat, hedge it ("most
couples report..." instead of a specific %).

## REFERRAL ASK (allowed, soft, only in Tiers 2 + 5)

Tier 2 (Hot) gets a P.S. like:
  "P.S. Got a friend planning a Utah wedding? We'd love an introduction —
  word-of-mouth from someone like you means more to us than any ad."

Tier 5 (Dreaming) gets a similar P.S. but warmer:
  "P.S. Even if Lake Salt isn't right for your wedding, a referral to a
  friend planning theirs would mean the world. We're a small team and
  every introduction is huge for us."

DO NOT add referral asks to Tier 1 (too pushy at the close), Tier 3, or
Tier 4 (those tiers are pure value).

## NO REVIEW ASKS

Do NOT include any prompt to leave Google, Knot, Yelp, or WeddingWire
reviews. Per Google policy, reviews must be from people who actually
engaged with the business as customers. Expo attendees who tasted samples
do not qualify. Review asks come AFTER a wedding is actually booked + the
event has happened. Phase 2 has a separate post-event automation for that.

You CAN include an Instagram tag/share ask in Tiers 2-5:
  "If our drinks made the day a little better, tag us
  @lakesaltbartending in your stories — best way to support a small
  business."

## EMAIL TEMPLATES (personalize per lead before staging)

Merge fields you must fill:
  [NAME]            → first name only (split on space, take first word)
  [MONTH NAME]      → 'September' from '2026-09-12'
  [MONTH YEAR]      → 'September 2026'
  [WEEKS_AWAY]      → integer weeks from today (Tier 1 only)

### Tier 1 — 0-3 months out (7 brides) — "Let's lock this in"

Subject: Quick — your [MONTH] wedding bar
Body:

  Hi [NAME],

  Thanks for stopping by Lake Salt at the expo Saturday. Your wedding is
  about [WEEKS_AWAY] weeks away, and the bar is one of the last big
  pieces couples lock down. Don't let it slip.

  If you'd like a custom quote with no pressure to commit, hit reply with:

  1. Approximate guest count
  2. Venue (or "still deciding")
  3. Drinks vibe — full cocktails, mocktails, beer & wine, themed?

  I'll send a custom quote within 48 hours. If you'd rather hop on a
  15-min call first, here's the link: https://lakesalt.us/book

  We have base packages on our site
  (https://lakesalt.us/index.html#pricing-packages) but every wedding
  is unique — your quote will be tailored.

  Talk soon,

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service
  lakesalt.us · @lakesaltbartending

### Tier 2 — 3-6 months out (25 brides) — "Confident, no rush"

Subject: A quote for your [MONTH] wedding (no pressure)
Body:

  Hi [NAME],

  Thanks for entering our raffle Saturday. Your wedding in [MONTH YEAR]
  puts us right in the sweet spot where most couples are nailing down
  the bartender.

  One thing most brides realize too late: the bar is one of the few
  vendors your guests actually interact with for hours. The DJ runs the
  music; the photographer captures the moment; the bartender shapes the
  ENERGY of the reception — pacing, laughter, who's having fun, who
  isn't. It's a quiet but huge lever.

  When you're ready, I'd love to send you a custom quote. Reply with:

  1. Approximate guest count
  2. Venue (or "still deciding")
  3. Drinks vibe — full cocktails, mocktails, beer & wine, themed?

  Or pick a 15-min call: https://lakesalt.us/book

  Base packages start at $995 for full mobile bar setup
  (https://lakesalt.us/index.html#pricing-packages), but every wedding
  is custom-quoted to your guest count, hours, and drinks.

  P.S. If our drinks made an impression Saturday, tagging us
  @lakesaltbartending in your stories means the world to us.

  P.P.S. Got a friend planning a Utah wedding? We'd love an
  introduction — word-of-mouth from someone like you means more to
  us than any ad.

  Either way, congratulations.

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service

### Tier 3 — 6-12 months out (15 brides) — "Plant the seed"

Subject: Three things to know while you plan
Body:

  Hi [NAME],

  Thanks for stopping by Saturday. I won't pitch you yet — your wedding
  in [MONTH YEAR] is months out and you've got bigger pieces to figure
  out first (venue, photographer, dress).

  But three things worth knowing as you plan:

  1. Most popular bartenders book 6-9 months ahead in Utah. Lock the bar
     early, even if it's not us.

  2. Mocktail menus are massively underused. About a third of guests at
     most weddings don't drink — designated drivers, pregnancy, kids,
     religion, sober choice. Giving them something special instead of a
     watery seltzer is the easiest way to make them feel actually included.

  3. A signature cocktail tells your story. We co-design one for every
     couple — based on your favorite flavors, where you got engaged, the
     season. Free service for every booking.

  When you're ready (no rush), 15-min planning chats are open here:
  https://lakesalt.us/book

  Have a great week,

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service
  @lakesaltbartending

### Tier 4 — 12-18 months out (26 brides) — "Be a friendly voice"

Subject: Mocktail recipe + a thought for your wedding
Body:

  Hi [NAME],

  Thanks for entering our raffle Saturday. Your wedding's a year+ out so
  no pitch from me. Two things in case they're useful:

  The recipe we poured Saturday (the citrus-rosemary spritz) is up on
  our recipes page if you want to make it at home or steal the idea
  for an engagement party: https://lakesalt.us/recipes

  One thing to keep in your back pocket for when wedding planning starts
  to feel real: the bartender is one of the few vendors actively
  engaging with every guest, all night long. When you're a year out it
  sounds like an afterthought. When you're three weeks out and trying
  to figure out who's keeping drinks flowing for 150 people, it
  suddenly isn't.

  When you're ready (no rush), I'm here: https://lakesalt.us/book

  Talk soon,

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service
  @lakesaltbartending

### Tier 5 — 18+ months / no-date (15 brides) — "Just show up nicely"

Subject: A recipe + congrats on the engagement 💍
Body:

  Hi [NAME],

  Just wanted to say thanks for stopping by Lake Salt's booth Saturday
  and entering our raffle. Whether you have a date set or you're still
  in the "we just got engaged" haze, congratulations.

  No sales pitch — promise. One thing in case it's helpful:

  The drinks we poured Saturday are on our recipes page:
  https://lakesalt.us/recipes — make any of them at home, share them
  with your fiancé, send the citrus-rosemary spritz to your sister.

  When the wedding starts to feel real (could be 6 months from now,
  could be 2 years), Lake Salt is here. Until then I'll only email
  you if there's something genuinely useful — recipe drops, holiday
  content, etc. No spam.

  P.S. Even if Lake Salt isn't right for your wedding, a referral to
  a friend planning theirs would mean the world. We're a small team
  and every introduction is huge for us.

  Talk soon,

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service
  @lakesaltbartending

## SENDING WORKFLOW (you must follow this exactly)

1. **Pull the cohort.** Use Source A or B above to get the 89 leads with
   names, emails, phones, eventDates, bucketed by months-out.
2. **Confirm the bucket counts** match: 7 / 25 / 15 / 26 / 5+10=15.
   If they're off by more than 1, stop and report the discrepancy.
3. **Personalize each lead's email.** Fill all merge fields. Tier 1 ALSO
   gets 1-2 sentences of additional personalization where possible (if
   the lead's notes/source mention any specifics).
4. **Show me the FIRST 3 drafts of Tier 1.** Wait. I'll either approve
   tone or send edits.
5. **After my approval ("APPROVED — send Tier 1"):** send the remaining
   Tier 1 emails one at a time (Tier 1 is high-touch — never bulk).
6. **After Tier 1 finishes:** show me 2 random samples of Tier 2 before
   batch-sending.
7. **Tiers 2-5 can be batch-sent** AFTER per-tier approval. Use BCC if
   your sending tool supports it; otherwise loop one at a time.
8. **Final report after all tiers:** sends per tier, bounces, replies.

REPEAT: do not click send anywhere without explicit "APPROVED — send
Tier N" from Kendell.

## CRM UPDATES (after each successful send)

For every lead emailed, update the Firestore doc at `leads/{id}`:

  {
    stage: "Contacted",
    lastContactedAt: <serverTimestamp>,
    contactHistory: [
      ...existing,
      {
        type: "expo-followup-tier-N",
        sentAt: <serverTimestamp>,
        subject: "<actual subject line>",
        snippet: "<first 120 chars of body>",
        sender: "kendell"
      }
    ]
  }

If lead.stage is already past "Contacted" (e.g. "Call Scheduled",
"Booked-Tentative"), DO NOT downgrade. Just append to contactHistory.

## FOLLOW-UP REMINDERS

For every lead, schedule TWO follow-up reminders:

1. **Day 10** from send date — title: "Day-10 follow-up: [NAME] · [WEDDING_DATE]"
2. **Day 28** from send date — title: "Day-28 follow-up: [NAME] · [WEDDING_DATE]"

Schedule via Google Calendar (Kendell's primary calendar) at 9 AM
Mountain, OR write `kendell_followups` Firestore docs with `dueAt`
and `type: 'nurture-touch-2' / 'nurture-touch-3'`.

If a lead REPLIES before Day 10, CANCEL their Day 10 reminder. Their
follow-up becomes a real conversation, not a scheduled touch.

## EDGE CASES

- **Bounced email** → mark `stage: 'Bounced'`, skip future touches
- **No wedding date** → use Tier 5 (already-grouped no-date)
- **Wedding date in the past** → skip + flag for me (typo)
- **Reply received during campaign** → STOP scheduled touches for that
  lead, alert me with the reply + CRM context

## STARTING

Begin by:
1. Confirming you understand the DO NOT SEND constraint.
2. Pulling the cohort and reporting the bucket counts.
3. Showing me the first 3 drafts of Tier 1 with merge fields filled.
4. WAITING for "APPROVED — send Tier 1".

===PROMPT END===
```

---

## After you've fed it to Cowork

When Cowork shows you the first 3 Tier 1 drafts:
1. Read them out loud — does it sound like *you*?
2. Spot-check personalization: does it actually reference the bride's wedding date / month?
3. Reply with `APPROVED — send Tier 1` to release that batch
4. Or `Edit:` followed by your changes if you want adjustments

If Cowork tries to send before you approve, paste this:
> "Stop. Re-read the HARD CONSTRAINT block. Do NOT send anything without my explicit 'APPROVED — send Tier N' line. Show me drafts only."

## Phase 2 — what to add to nurture later

After this campaign sends, build:
- **Day 10 + Day 28 multi-touch** drafts (already scheduled via reminders, but write the email content)
- **Post-event review automation** (the legitimate Google + Knot review ask, fires 7 days after each wedding)
- **Bank-account integration** (Plaid) so expense capture stops being manual
- **IG follower + inbox monitor** so we know real follower deltas, not just opt-in claims

All four are in [PHASE-2.md](PHASE-2.md) priorities 0c-0f.
