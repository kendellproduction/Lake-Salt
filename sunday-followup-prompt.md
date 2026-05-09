# Sunday May 10 — Wedding Expo Follow-Up Prompt

**When:** Sunday morning, May 10 2026 (the day after the expo).
**Where:** Open Claude Code from the Lake Salt project root, paste the prompt below.

```bash
cd ~/Desktop/Coding\ Projects/Current\ Lake-Salt
claude
```

Then paste this block as your first message:

---

I need you to handle the wedding-expo follow-up emails. Here's what I want:

**Step 1 — Pull the cohort.**
Use the lake-salt-comms tooling (or query Firestore directly via the `_db` global on lakesalt.us) to fetch every lead where:
- `campaign == "WeddingExpo2026-05-09"`
- AND `stage == "New Lead"` (skip leads that staff already moved to "Booked-Tentative" or further)
- AND `email` is not empty

For each lead, capture: name, email, phone, eventDate, eventType, guestCount, venue, source, notes, followedInstagram, raffleEntry, createdAt.

**Step 2 — Pick the top 3 to draft first.**
Sort by lead quality, where higher = more captured fields and a real wedding date. Draft personalized emails for those 3 first and show them to me. **Do not send yet.**

**Tone:**
- Warm, low-pressure. We met them at a busy expo; they don't owe us anything.
- Short. 4–6 sentences max. They're getting a flood of vendor emails this weekend.
- *Specific* — reference at least one detail from their submission. If they picked an outdoor backyard wedding, mention setup logistics for that. If their wedding is in October, mention seasonal drinks. Generic copy ("congratulations on your engagement!") is the failure mode.
- Sign off as **Kendell**.
- No emojis.

**Subject line:** something specific to them, not "thanks for visiting our booth." Something like "Your [month] wedding at [venue] — quick note from Lake Salt" or "Mocktail ideas for your [month] wedding."

**CTA:**
- For raffle entries: "If you want a custom quote, reply with a few details and I'll send one this week."
- For booth chats with a wedding date: "Want to lock the date with our soft-close (no payment up front)? Reply YES and I'll send the booking link."
- For "Wants consult call" leads: "Pick a 15-min slot here: [link to /book — TODO if not built yet, fall back to 'reply with 3 times that work and I'll confirm one']"

**Step 3 — After I approve the top 3 drafts, batch-send the rest.**
Use the same logic and tone. Don't ask me to approve every one — spot-check 1 in 10 yourself for tone, then send.

**Step 4 — Track sends.**
For every lead you email, update the Firestore `leads` doc:
```js
{
  stage: "Contacted",
  lastContactedAt: serverTimestamp(),
  contactHistory: [...existing, { type: "expo-followup-1", sentAt: serverTimestamp(), subject, snippet: first 120 chars }]
}
```

**Step 5 — Hand back a report.**
Tell me:
- N total leads in the cohort
- N skipped (no email, already past New Lead, etc.)
- N drafted, N sent
- Any leads that looked unusually high-intent or worth a personal Kendell call instead of an email.

---

## If the agent can't query Firestore directly

The `lake-salt-comms` plugin should have access. If not, I can grab the data manually:

1. Open https://console.firebase.google.com/project/lake-salt/firestore/data/leads
2. Filter: `campaign == "WeddingExpo2026-05-09"`
3. Export to JSON (Firebase doesn't have a built-in export — use the **gcloud** CLI: `gcloud firestore export gs://lake-salt-export --collection-ids=leads`) OR just copy field-by-field for the smaller cohorts (~20–50 leads is manageable).

Or paste the data inline:
```json
[
  { "name": "...", "email": "...", "eventDate": "...", "eventType": "...", "guestCount": "...", "venue": "...", "notes": [...] },
  ...
]
```

The agent can then draft emails from that JSON without Firestore access.

---

## After Sunday

Schedule the same prompt for **Day 10 (May 19)** and **Day 28 (June 6)** as multi-touch nurture. The cadence stops automatically once a lead's `stage` advances past `Contacted` (the agent should check that before each touch).
