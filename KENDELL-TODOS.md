# Kendell's Wedding-Expo TODO Command Center

The single source of truth for what's left to do. Code is built; what's below is **stuff only you can do** (cloud setup, deploys, physical things, decisions).

Today is **Wed May 6 2026**. Expo is **Sat May 9 2026**.

---

## 🔥 BLOCKING — must finish by Friday EOD May 8

### Cloud setup (45 min, in order)
- [ ] **Create "Lake Salt Bookings" Google Calendar** (and share read-only with each bartender's Google email). [Steps in EXPO-SETUP.md §1](EXPO-SETUP.md)
- [ ] **Create GCP service account `lakesalt-calendar-writer`** + download JSON key. [§2](EXPO-SETUP.md)
- [ ] **Enable Calendar API** for project `lake-salt`. [§2 step 4](EXPO-SETUP.md)
- [ ] **Share the calendar with the service-account email** (Make changes to events). [§2 step 5](EXPO-SETUP.md)
- [ ] **Set Functions secret + config**:
  ```bash
  cd functions
  firebase functions:secrets:set GOOGLE_APPLICATION_CREDENTIALS_JSON < ~/Downloads/lake-salt-xxxxx.json
  firebase functions:config:set lakesalt.calendar_id="<the-calendar-id>"
  ```

### Deploy (5 min)
- [ ] `firebase deploy --only firestore:rules`
- [ ] `cd functions && npm install && cd .. && firebase deploy --only functions`
- [ ] `firebase deploy --only hosting`
- [ ] **Verify**: open `https://lakesalt.us/expo` → raffle page loads. Open `/admin/quick-add` and `/admin/close` → auth screens load.

### Booth staff onboarding
- [ ] Get Google email for **each of the 4 booth staff**.
- [ ] Have each one sign in once at https://lakesalt.us/admin (will be denied).
- [ ] Add each to the `admins` Firestore collection. [Steps in EXPO-SETUP.md §4](EXPO-SETUP.md)
- [ ] Have each one re-sign in and confirm `/admin/quick-add` loads on their actual phone (not your phone).

### Print + physical prep
- [ ] **Print [website/admin/expo-booth-prints.html](website/admin/expo-booth-prints.html)** at 100% on US Letter.
  - Page 1 = table tent + soft-close script (display at booth)
  - Page 2 = 4 lanyard cards (cut + laminate, one per staff)
- [ ] **Print the QR code separately** at large size for a retractable banner. SVG: [website/assets/expo-qr-code.svg](website/assets/expo-qr-code.svg) — scales infinitely, send to any print shop.
- [ ] **Stock raffle prizes**: 4–6 × $50 gift cards.
- [ ] **Stock mocktail samples** + branded cups/napkins (per Wedding-Expo-Prep-Playbook.html).
- [ ] **Phone chargers** + 2 backup battery packs for the booth (4 phones running all day).
- [ ] **Backup paper notebook + pen** (for the "phone died" edge case).

### Friday-night dry run (30 min, after dinner)
- [ ] Walk through all 4 paths from [EXPO-SETUP.md §5](EXPO-SETUP.md).
- [ ] **Cleanup the test data afterwards**: delete the 4 test leads from `/admin#crm`, delete the test calendar event from "Lake Salt Bookings", delete the test `kendell_followups` doc.

### Friday-night staff briefing (15 min)
- [ ] Walk the 4 staff through the 3 paths using the printed lanyard cards as a guide.
- [ ] Read the soft-close script out loud together so everyone knows the words.
- [ ] Hand each person their lanyard card + login.
- [ ] Decide who's the **closer** (only one or two people should run `/admin/close` to avoid double-booking; everyone else uses `/admin/quick-add`).

---

## 🎉 Saturday May 9 — at the booth

### Doors-open checklist (5 min before guests arrive)
- [ ] All 4 staff signed in to `/admin/quick-add` on their phones (open tab, leave it open)
- [ ] Closer signed in to `/admin/close` (separate tab)
- [ ] Test the QR code on your own phone — it should load `/expo`
- [ ] Open `/admin#crm` filtered to "Wedding Expo · 5/9" cohort on your tablet/laptop — leave running so you can spot-check captures throughout the day
- [ ] Mocktails poured, table tent up, banner up, lanyard cards on staff

### During the day
- [ ] Glance at the CRM cohort filter every 30–60 min — make sure leads are landing
- [ ] If a phone dies, fall back to the paper notebook (transcribe Sunday)
- [ ] If a date conflict comes up and the closer is unsure, **don't promise** — say "let me check with Kendell, I'll email you tomorrow."

### End of day
- [ ] Final cohort count check: how many raffle entries? how many booth chats? how many locked?
- [ ] Pick raffle winners (random — use a quick `Math.random()` script if you want, or just pull names from a hat)
- [ ] Email/DM the winners directly that night so they know

---

## 📨 Sunday May 10 — follow-up

- [ ] Open Claude Code in the project, paste the prompt from [sunday-followup-prompt.md](sunday-followup-prompt.md)
- [ ] Approve the first 3 drafts (read for tone)
- [ ] Let it batch-send the rest
- [ ] Spot-check the Sent folder
- [ ] Email the raffle winners with a small note + their gift card

---

## 📅 Days 14–28 post-expo — manual deposit collection

Each lead locked at the booth has a `kendell_followups` Firestore doc with `dueAt = lockDate + 14 days`. Starting around **May 23**:

- [ ] Each weekday morning: open https://console.firebase.google.com/project/lake-salt/firestore/data/kendell_followups, filter `completed == false` and `dueAt <= today`
- [ ] For each due item:
  - [ ] Send a $100 invoice via Chase to the lead's email
  - [ ] Mark the followup `completed: true`
- [ ] If a lead hasn't paid by `autoReleaseAt` (~21 days post-lock):
  - [ ] Decide: extend grace, or release.
  - [ ] If releasing: delete the calendar event, set lead `stage: "Lost"` + `lostReason: "Did not deposit"`, send a polite "we needed to release your date" email.

---

## 🚀 Phase 2 — week of May 11–17 (post-expo)

In priority order. Each is its own brainstorm-able unit, none are blocking the expo.

- [ ] **Set up Stripe** (free signup, 30 min) — replaces manual Chase invoicing with automated `/createDepositInvoice` Cloud Function.
- [ ] **Auto-release Cloud Scheduler cron** — runs daily, releases unpaid dates after grace.
- [ ] **Day-10 + Day-28 personalized nurture** via comms agent on a cron (extend [sunday-followup-prompt.md](sunday-followup-prompt.md) into a recurring schedule).
- [ ] **Public consult-booking widget at `/book`** — revive the existing `getAvailableSlots` + `bookCallSlot` Cloud Functions on the public site.
- [ ] **Bartender shift assignment** — `assignedStaff` field on leads, `/admin/my-shifts` page filtered to logged-in bartender.
- [ ] **Dedicated EmailJS templates**: `template_expo_raffle`, `template_expo_locked`, `template_expo_followup` — currently we reuse `template_fch6b4c` for everything.
- [ ] **Mocktail recipe PDF download** for the raffle thank-you page CTA (currently links to `/recipes.html` — works but a single-card PDF is more shareable).
- [ ] **Soft-close Stripe Payment Link** — closer mode could optionally collect $100 right there for the most committed brides.

---

## 🗂 File reference

| File | What it is |
|---|---|
| [EXPO-SETUP.md](EXPO-SETUP.md) | Operator runbook — calendar/SA/deploy/Sunday/manual-invoicing |
| [sunday-followup-prompt.md](sunday-followup-prompt.md) | Copy-paste prompt for the Sunday agent run |
| [website/admin/expo-booth-prints.html](website/admin/expo-booth-prints.html) | Printable table tent + soft-close + lanyard cards |
| [website/assets/expo-qr-code.svg](website/assets/expo-qr-code.svg) | Vector QR for any print job |
| [Wedding-Expo-Prep-Playbook.html](Wedding-Expo-Prep-Playbook.html) | Booth design, day-of timeline, packing, vendor walk (existing) |
| `~/.claude/plans/we-are-working-a-humming-oasis.md` | The original approved spec |

## 🛠 What got built (code reference, no action needed)

| Path | What it is |
|---|---|
| [website/expo.html](website/expo.html) | Public QR-target raffle page |
| [website/admin/quick-add.html](website/admin/quick-add.html) | Staff fast-entry |
| [website/admin/close.html](website/admin/close.html) | Closer-mode date lock |
| [functions/index.js](functions/index.js) | `checkDateAvailability` + `lockEventDate` Cloud Functions |
| [website/admin/js/crm.js](website/admin/js/crm.js) | Cohort filter chip on CRM |
| [website/admin/js/app.js](website/admin/js/app.js) | Booth Mode banner on dashboard (auto-hides after May 23) |
| [firestore.rules](firestore.rules) | New rules for `kendell_followups` + `call_bookings` |
| [firebase.json](firebase.json) | Functions block restored, URL rewrites for `/expo`, `/admin/close`, `/admin/quick-add` |

---

**When in doubt:** open [EXPO-SETUP.md](EXPO-SETUP.md). When stuck: ask Claude.
