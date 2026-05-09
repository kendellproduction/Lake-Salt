# Wedding Expo Lead-Capture System — Setup & Go-Live Guide

This is the operator runbook. Built per the approved plan in
`~/.claude/plans/we-are-working-a-humming-oasis.md`. Do these steps in order
between **today (Wed May 6)** and **Friday EOD (May 8)**. The expo is **Saturday
May 9**.

## What got built

| Path | Purpose | Auth |
|---|---|---|
| `/expo` | Public QR landing — raffle entry, 5-field form | none |
| `/admin/quick-add` | Booth staff fast-entry during chats | Google sign-in (admins allowlist) |
| `/admin/close` | Closer mode — check date + lock booking | Google sign-in (admins allowlist) |
| `/admin/index.html#crm` | CRM Kanban with new "Wedding Expo · 5/9" cohort filter | Google sign-in (admins allowlist) |
| Cloud Functions | `checkDateAvailability`, `lockEventDate` (+ existing slot/call functions) | callable from authenticated admins |

---

## 1 — Google Calendar setup (15 min, you only)

**Create the shared bookings calendar:**
1. Open Google Calendar (signed into the Workspace account that owns `contact@lakesalt.us`).
2. Sidebar → "Other calendars" → `+` → **Create new calendar**.
3. Name: **`Lake Salt Bookings`**. Description: "Confirmed and tentative event reservations."
4. Click **Create calendar**.
5. After it appears in the sidebar, click its 3-dot menu → **Settings and sharing**.
6. Under **Share with specific people or groups**, add each bartender's Google email with **"See all event details"** (not editing — closer mode writes via the service account, not bartender accounts).
7. Scroll down to **Integrate calendar**, copy the **Calendar ID** (looks like `xxxxxxxxxxxx@group.calendar.google.com`). Save it for step 2.

## 2 — Service account for Cloud Functions (15 min)

The closer-mode Cloud Functions write events to "Lake Salt Bookings" using a service account, not your personal account.

1. Open https://console.cloud.google.com/iam-admin/serviceaccounts?project=lake-salt
2. **Create service account**:
   - Name: `lakesalt-calendar-writer`
   - Skip the optional "Grant access" step (Calendar permissions are granted via Calendar's own sharing, not IAM)
   - Done.
3. Click the new service account → **Keys** tab → **Add key** → **Create new key** → **JSON**. A `.json` file downloads. Keep this file private (it grants calendar-write).
4. **Enable the Calendar API** for the project (one click): https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=lake-salt → **Enable**.
5. **Share the calendar with the service account**:
   - Back in Google Calendar → "Lake Salt Bookings" settings → Share with specific people.
   - Paste the service account email (looks like `lakesalt-calendar-writer@lake-salt.iam.gserviceaccount.com`).
   - Permission: **Make changes to events**. Save.
6. Set the service-account JSON as a Functions secret. From the project root:
   ```bash
   cd functions
   firebase functions:secrets:set GOOGLE_APPLICATION_CREDENTIALS_JSON < ~/Downloads/lake-salt-xxxxxxx.json
   ```
   (Replace the path with wherever the JSON was downloaded. Old config-based variables work too via `firebase functions:config:set`, but secrets is the modern path.)
7. Set the calendar ID:
   ```bash
   firebase functions:config:set lakesalt.calendar_id="<paste calendar ID from step 1.7>"
   ```

## 3 — Deploy

From the project root:

```bash
# 1. Deploy Firestore rules (required for new kendell_followups + call_bookings collections)
firebase deploy --only firestore:rules

# 2. Install function deps (one time) and deploy functions
cd functions && npm install && cd ..
firebase deploy --only functions

# 3. Deploy hosting (raffle page + admin pages)
firebase deploy --only hosting
```

After deploy:
- `https://lakesalt.us/expo` should load the raffle page
- `https://lakesalt.us/admin/quick-add` and `/admin/close` should load auth screens

## 4 — Add booth staff to admins allowlist (5 min)

Each staffer needs a Google account in the `admins` Firestore collection.

**Easiest path** — they sign in once on the desktop admin (https://lakesalt.us/admin), get rejected with "Access denied," then you add them manually:

1. Go to https://console.firebase.google.com/project/lake-salt/firestore/data/admins
2. Click **Add document**. Document ID: their Firebase Auth UID (from the deny-screen log, or look them up in **Authentication** tab in console).
3. Fields:
   - `email` (string): their email
   - `name` (string): their display name
   - `role` (string): `manager`
   - `createdAt` (timestamp): now
4. Have them refresh `/admin/quick-add` — they're in.

## 5 — Friday-night dry run (30 min)

On Friday May 8, before the staff briefing:

1. **Public path** — scan the QR with your phone:
   - https://lakesalt.us/expo loads
   - Fill form with **"Test Friday Dry Run"** as the name
   - Submit, see thank-you panel with three CTAs
   - Verify the lead lands in `/admin/index.html#crm` under "New Lead" stage with source `Expo Raffle`
2. **Quick-add path**:
   - Open `/admin/quick-add` on a second phone, sign in
   - Add lead "Test Quick Add"
   - Verify it lands in CRM under correct source
3. **Closer-mode path**:
   - `/admin/close`
   - Use any far-future date (try `2026-12-31`) for a test "Test Closer Mode" entry
   - Click "Check this date" — should return available
   - Click "Lock this date" — should succeed with deposit timeline shown
   - Verify in Google Calendar: "TENTATIVE — Test Closer Mode Wedding" appears on Dec 31
   - Verify in Firestore: lead with `stage: Booked-Tentative`, `kendell_followups` doc with type `send_chase_deposit_invoice`
   - **Cleanup**: delete the test calendar event + lead + followup
4. **Conflict path**:
   - Add a manual event to "Lake Salt Bookings" on `2027-01-01`
   - In closer mode, check `2027-01-01` — should return conflict + suggestions
   - Cleanup: delete the test calendar event
5. **Cohort filter**: `/admin/index.html#crm` → click "Wedding Expo · 5/9" chip → only Expo-tagged leads show

## 6 — Saturday morning at the booth

- All 4 staff phones logged into `/admin/quick-add` and `/admin/close` before doors open
- Brand bartender's bookmarked tabs: quick-add (primary) + close (closer)
- Test the QR code with one phone before doors open
- 1 paper notebook + pen as the "phone-died" backup

## 7 — Sunday morning follow-up (one-time procedure)

The plan calls for a `/lake-salt-comms:send-expo-followup` slash command. Since
the plugin is a compiled archive that's hard to extend at the last minute, run
this **inline** on Sunday May 10:

1. Open Claude Code in this project: `cd ~/Desktop/Coding\ Projects/Current\ Lake-Salt && claude`
2. Tell Claude:

   > Pull every Firestore lead where `campaign == "WeddingExpo2026-05-09"` and
   > `stage == "New Lead"`. For each one, draft a personalized email using the
   > captured fields (name, eventDate, eventType, drinks if any, venue if any,
   > guestCount). The tone is warm and specific — reference at least one detail
   > from their submission. Sign off as Kendell. Do NOT use a generic template.
   > Show me the first 3 drafts before sending the rest. Send via Gmail through
   > the lake-salt-comms agent. After sending, update each lead's
   > `stage: "Contacted"` and `lastContactedAt: <now>`.

3. Review the first 3 drafts. Approve them. Let it batch-send the rest.
4. Spot-check the Sent folder in Gmail.

## 8 — Manual Chase deposit invoicing (rolling, days 14–21 after each lock)

Each `lockEventDate` call creates a `kendell_followups` document with:
- `leadName`, `leadEmail`, `leadPhone`
- `eventDate`
- `dueAt` (14 days after lock)
- `type: "send_chase_deposit_invoice"`
- `amount: 100`

**Each weekday morning** (start ~May 23, 14 days post-expo):
1. Open https://console.firebase.google.com/project/lake-salt/firestore/data/kendell_followups
2. Filter: `completed == false` and `dueAt <=` today (or sort by dueAt ascending)
3. For each due item:
   - Open Chase mobile/web → Send invoice → $100 to that lead's email
   - Mark the `kendell_followups` doc `completed: true` and add `chasedAt: <now>`
4. **For unpaid leads ~21 days post-lock** (autoReleaseAt passed):
   - Decide: extend grace, or release the date.
   - If releasing: delete the calendar event from "Lake Salt Bookings", update the lead `stage: "Lost"`, `lostReason: "Did not deposit"`, and send a polite "we needed to release your date" email.
   - **Phase 2** automates this with a Cloud Scheduler cron + Stripe.

## 9 — Phase 2 work (week of May 11)

In priority order:
1. **Stripe setup + auto-deposit cron** → no more manual Chase invoicing
2. **Day-10 + Day-28 automated nurture** via comms agent on a cron
3. **Public `/book` consult-call widget** (revive `getAvailableSlots` + `bookCallSlot` on the frontend)
4. **Bartender shift assignments** (`assignedStaff` + `/admin/my-shifts`)

---

## Troubleshooting

**"Access denied" on /admin/quick-add even though I'm signed in**
→ User UID isn't in `admins` collection. See section 4.

**Closer mode "Check this date" hangs or fails**
→ Cloud Function isn't deployed, or service-account JSON / calendar ID isn't set. Re-check sections 2 + 3. Use the fallback: lock the lead in Firestore manually via the regular CRM, set `stage: Booked-Tentative` and `eventDate` — calendar event creation can be done by hand.

**Raffle entries are landing but not in EmailJS**
→ EmailJS service ID `service_rbzoxto` and template `template_fch6b4c` must exist. Test with the dashboard; the page falls back gracefully (Firestore write is independent).

**A bride's date got "stolen" by another lead between check + lock**
→ Cloud Function re-checks availability inside `lockEventDate` and returns a `failed-precondition` error. The closer-mode UI shows a "couldn't lock" message. Refresh and pick a new date.
