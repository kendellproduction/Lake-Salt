# Cowork prompt — Post-expo email campaign + CRM updates + follow-up reminders

Copy everything between the `===PROMPT START===` and `===PROMPT END===` lines into a fresh Cowork chat. Adjust paths/dates if context has changed.

```
===PROMPT START===

# TASK: Run the post-expo nurture email campaign for Lake Salt Bartending.

You're handling the multi-touch nurture for 90 leads from the May 9, 2026
Salt Lake City Bridal Expo. The expo is over, and now we want to nurture
without being pushy.

## CONTEXT (read this whole block before doing anything)

- **Business:** Lake Salt Bartending, women-owned dry-hire bar service in Utah.
  Co-owners: Maddie Andrews + Kendell Andrews.
- **Sender identity for all emails:** "Kendell & Maddie · Lake Salt"
- **Reply-to:** contact@lakesalt.us
- **Today's date:** May 10, 2026
- **Total cohort:** 90 entries (filter out emails containing `@test.local`)
- **All entries checked the IG-follow box (99%)** — they at least know about us
- **Wedding-date distribution:**
  - 0-3 months out: 8 brides (urgent)
  - 3-6 months out: 25 brides (hot — actively shopping)
  - 6-12 months out: 15 brides (warm — vendor research)
  - 12-18 months out: 26 brides (cool — early planner)
  - 18+ months / no date: 15 brides (just engaged or undecided)

## DATA SOURCE

Lead data lives in Firestore at `leads where campaign == 'WeddingExpo2026-05-09'`.

Get the per-bucket email list via either:
1. **Admin UI**: sign in to https://lakesalt.us/admin → Expos → Cohort tab →
   click "Copy 25 emails" per bucket.
2. **Script**: run from the Lake Salt project root:
   `node scripts/expo-analytics-rest.js > expo-report.md`
   then parse the per-bucket lists at the bottom of expo-report.md.

Each lead doc has these fields you should personalize on:
  - `name`, `email`, `phone`, `eventDate` (YYYY-MM-DD), `instagramFollowed`,
    `raffleEntered`, `source`, `campaign`

## CONSTRAINTS — READ CAREFULLY

1. **NO review asks.** Do NOT include any prompt to leave reviews on The Knot,
   Google Business, Yelp, or WeddingWire. Per platform TOS, reviews must come
   from actual customers (people who hired Lake Salt for their wedding).
   Expo attendees who tasted samples are NOT customers. Asking risks getting
   our storefronts flagged or suspended.

2. **Instead of review asks, use:**
   - Instagram tag/share request: "If our drinks made the day a little
     better, tag us @lakesaltbartending in your stories — best way to
     support a small business."
   - Friend referrals: "Got a Utah-based friend planning a wedding? We'd
     love an introduction."

3. **Reviews come later** — once a bride actually books + the event happens,
   THAT'S when we ask for The Knot review (handled by a separate post-event
   automation, not by you).

4. **Tone calibrated to wedding-date distance:**
   - Closer wedding = more confident pitch (still warm, never pushy)
   - Further wedding = pure value, no ask, just be a friendly voice

5. **Personalization is mandatory.** Every email must reference at least one
   detail from their submission (name + wedding month at minimum). Generic
   templates with merge tags are the failure mode.

## EMAILS TO SEND — 5 TIERS

Send each tier on a different day so the work is paced.
Schedule:
- **Today (Day 0):** Tier 1 (Urgent, 8 brides) — handle individually
- **Tomorrow (Day 1):** Tier 2 (Hot, 25 brides) — bulk OK with personalization
- **Day 2:** Tier 3 (Warm, 15 brides) — bulk OK
- **Day 3:** Tier 4 (Cool, 26 brides) — bulk OK
- **Day 4:** Tier 5 (Dreaming, 15 brides) — bulk OK

### Tier 1 — 0-3 months out (8 brides) — "Let's lock this in"

Subject: Quick — your [MONTH NAME] wedding bar
Body:
  Hi [NAME],

  Thanks for stopping by Lake Salt at the expo Saturday. Your wedding is
  about [WEEKS_AWAY] weeks away and I'm guessing the bar is one of the
  last big pieces still up in the air.

  If you'd like a quote without any pressure to commit, hit reply with:

  1. Approximate guest count
  2. Venue (or "still deciding")
  3. Drinks vibe — full cocktails, mocktails, beer & wine, themed?

  I'll send a custom quote within 48 hours. If you'd rather hop on a 15-min
  call first, here's the link: https://lakesalt.us/book

  Talk soon,

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service
  lakesalt.us · @lakesaltbartending

### Tier 2 — 3-6 months out (25 brides) — "Confident, no rush"

Subject: A quote for your [MONTH NAME] wedding (no pressure)
Body:
  Hi [NAME],

  Thanks for entering our raffle Saturday. I noticed your wedding is in
  [MONTH NAME YEAR], which puts us right in the sweet spot where most
  couples are nailing down the bartender.

  Here's something most brides don't think about until later than they
  should: the bar is one of the few vendors your guests actually interact
  with for hours. The photographer captures the moment. The bartender
  shapes the entire vibe of the reception — pacing, energy, who's having
  fun, who's quietly drained.

  When you're ready to think about it, I'd love to send you a custom quote.
  Reply with:

  1. Approximate guest count
  2. Venue (or "still deciding")
  3. Drinks vibe — cocktails, mocktails, beer & wine, themed?

  Or skip ahead and pick a 15-min call: https://lakesalt.us/book

  P.S. If our drinks made an impression Saturday, tagging us @lakesaltbartending
  in your stories is the best way to support a small business — we'd love
  the cheer.

  Either way, congratulations.

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service

### Tier 3 — 6-12 months out (15 brides) — "Plant the seed"

Subject: Three things to know while you plan
Body:
  Hi [NAME],

  Thanks for stopping by Saturday. I won't pitch you yet — your wedding
  in [MONTH NAME YEAR] is still months out and you probably have bigger
  pieces to figure out first (venue, photographer, dress).

  But three things worth knowing as you plan:

  1. Most popular bartenders book 6-9 months ahead in Utah. If you've got
     a date locked, lock the bar early — even if it's not us, just don't
     put it off.

  2. Mocktail menus are massively underused. A solid third of your guests
     don't drink for any reason — designated drivers, pregnancy, kids,
     religion, sober choice. Giving them something special instead of a
     watery seltzer is the easiest way to make them feel actually included.

  3. A signature cocktail tells your story. We co-design one with every
     couple — based on your favorite flavors, where you got engaged, the
     season. Costs nothing to ask.

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

  Thanks for entering our raffle on Saturday. Your wedding's a year+ out
  so I won't pitch you. But two things, in case they're useful:

  The recipe we poured Saturday (the citrus-rosemary spritz) is up on our
  site if you want to make it at home or swipe the idea for an engagement
  party: https://lakesalt.us/recipes

  One thing to keep in your back pocket for when wedding planning starts
  feeling real: the bartender is one of the few vendors who's actively
  engaging with every single guest, all night long. When you're a year
  out it sounds like an afterthought. When you're three weeks out and
  trying to figure out who's going to keep drinks flowing for 150 people,
  it suddenly isn't. Plan ahead.

  When you're ready (no rush, truly), I'm here: https://lakesalt.us/book

  Talk soon,

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service
  @lakesaltbartending

### Tier 5 — 18+ months / no-date (15 brides) — "Just show up nicely"

Subject: A recipe + congrats on the engagement 💍
Body:
  Hi [NAME],

  Just wanted to say thanks for stopping by Lake Salt's booth on Saturday
  and entering our raffle. Whether you have a date set or you're still
  in the "we just got engaged" haze, congratulations.

  No sales pitch in this email — promise. Just one thing, in case it's
  helpful:

  The drinks we poured Saturday are written up on our recipes page:
  https://lakesalt.us/recipes — make any of them at home, share them with
  your fiancé, send the citrus-rosemary spritz to your sister.

  When the wedding starts to feel real (could be 6 months from now, could
  be 2 years), Lake Salt is here. Until then I'll only email you if there's
  something genuinely useful — recipe drops, holiday content, etc. No spam.

  Talk soon,

  Kendell & Maddie
  Lake Salt — Utah women-owned bar service
  @lakesaltbartending

## SENDING LOGISTICS

For each lead in each tier:

1. **Personalize the merge fields** before sending:
   - [NAME] → first name from `lead.name`. If full name, use first word.
   - [MONTH NAME YEAR] → format `lead.eventDate` like "September 2026"
   - [WEEKS_AWAY] (Tier 1 only) → calculate from today
   - [MONTH NAME] → just the month name

2. **Tier 1 = handle individually.** Don't bulk-send. Personalize 1-2 extra
   sentences per email if you have details (venue mentioned, drink prefs).

3. **Tiers 2-5 = bulk-send OK** but each must still personalize the merge
   fields above. Use BCC if your sending tool supports it; otherwise loop
   one at a time.

4. **Show me the first 3 drafts of each tier** before sending the full batch.
   I want to spot-check tone before mass-send.

5. **Send via Gmail** as contact@lakesalt.us. Use a sending domain that
   matches the brand. Avoid no-reply addresses — every email should accept
   replies straight to my inbox.

## CRM UPDATES (after each email sent)

For every lead emailed, update their Firestore doc at `leads/{id}`:

  {
    stage: "Contacted",
    lastContactedAt: <serverTimestamp>,
    contactHistory: [
      ...existing,
      {
        type: "expo-followup-tier-N",       // N = 1..5
        sentAt: <serverTimestamp>,
        subject: "<the actual subject line>",
        snippet: "<first 120 chars of body>",
        sender: "kendell"
      }
    ]
  }

If a lead's `stage` is already past "Contacted" (e.g. "Call Scheduled",
"Booked-Tentative"), DO NOT downgrade. Just append to contactHistory.

## FOLLOW-UP REMINDERS

For every lead, schedule TWO follow-up reminders:

1. **Day 10 reminder** — 10 days from the email send date.
   Reminder title: "Day-10 follow-up: [NAME] · [WEDDING_DATE]"
   Notes: link back to the lead in CRM, suggested tone "warmer than touch 1"

2. **Day 28 reminder** — 28 days from the email send date.
   Reminder title: "Day-28 follow-up: [NAME] · [WEDDING_DATE]"
   Notes: "Final touch in expo nurture sequence. If they haven't replied
   by now, they're cold — soft close out OR move to Lost stage."

Schedule these in:
- Google Calendar (Kendell's primary calendar) as all-day events with 9 AM Mountain reminders
- OR a Firestore `kendell_followups` doc with `dueAt: <day10/day28>`,
  `type: 'nurture-touch-2'/'nurture-touch-3'`, `leadId: ...`

If a lead replies before Day 10, CANCEL their Day 10 reminder. Their
follow-up becomes a real conversation, not a scheduled touch.

## APPROVAL GATES (don't skip these)

Stop and wait for me to approve at each of these checkpoints:

1. **Before any send:** show me the count per tier and the first 3 drafts
   of Tier 1 (urgent). I'll approve or send back edits.

2. **After Tier 1 is sent:** show me 1 random sample from Tier 2 before
   batch-sending Tiers 2-5.

3. **After all 5 tiers are sent:** give me a final report:
   - Total emails sent (per tier + total)
   - Any sends that failed (bad email, Gmail bounce, etc.)
   - Any leads that replied during the send window (these are HOT)
   - CRM updates confirmed
   - Reminders scheduled

## EDGE CASES

- **Bounced email** → mark lead `stage: 'Bounced'`, skip future touches
- **Lead with no wedding date** → use Tier 5 (no-date)
- **Lead with wedding date in the past** → skip; flag for me to review (probably typo)
- **Reply received during campaign** → STOP scheduled touches for that lead,
  alert me with their reply and CRM context

## STARTING

Begin by pulling the cohort from Firestore (or asking me to copy it from
the admin), confirming the bucket counts match (8/25/15/26/15), and
sending me the first 3 drafts of Tier 1.

===PROMPT END===
```

---

## What's different from the playbook version

The big changes from [POST-EXPO-PLAYBOOK.md](POST-EXPO-PLAYBOOK.md):

1. **All Knot review CTAs removed** — replaced with optional IG tag asks (only in Tiers 2 & soft mention in Tiers 3-5)
2. **Tone is even softer** — Tiers 4 + 5 have no asks at all, just value
3. **Cowork is given specific instructions** for personalization, sending, CRM updates, and reminders
4. **Approval gates are explicit** — Cowork won't mass-send without you spot-checking
5. **Day-10 + Day-28 reminders** are scheduled per lead, not just "send the next batch"
6. **Reply handling** — if anyone replies, the scheduled touches cancel and you get alerted

## When the actual review asks should happen

Phase 2 priority — **post-event review request automation**:
- Trigger: 7 days after a wedding event date passes
- Action: send personalized email to the bride with The Knot direct link
- Honest, in compliance with Knot TOS, and the strongest review-collection moment (right after a positive experience)
- I can build this when you're ready (~3 hours)

## Saved to the project

The full prompt is committed at [COWORK-EMAIL-CAMPAIGN-PROMPT.md](COWORK-EMAIL-CAMPAIGN-PROMPT.md) — copy the whole thing between `===PROMPT START===` and `===PROMPT END===` into Cowork. Want me to commit + push so you have it in GitHub?