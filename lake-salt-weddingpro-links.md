# Lake Salt — WeddingPro / The Knot / WeddingWire Links

## ⭐ Review request links (share with past clients)

These take a client straight to the review form. Send them via text or email — they'll fill in their experience and submit a star rating that shows up on your storefront.

- **The Knot review link:**
  https://theknot.com/review-wedding-vendors/2104739

- **WeddingWire review link:**
  https://www.weddingwire.com/shared/rate/new?vid=c6f9386a89e86d6a

> **Goal:** 2 reviews on each (4 total). Top priorities: Adobe contact, recent wedding clients.

---

## 📊 Your admin dashboards (where you log in to manage)

Sign in with: `contact@lakesalt.us`

- **Main dashboard / Pro Playbook (visibility & to-dos):**
  https://www.weddingpro.com/dashboard

- **Reviews admin (where you got the share links above):**
  https://www.weddingpro.com/reviews

- **Availability calendar (mark booked/blackout dates):**
  https://www.weddingpro.com/availability

- **Inbox (couples who message you):**
  https://www.weddingpro.com/inbox

- **Insights (storefront views, leads, conversion):**
  https://www.weddingpro.com/insights

- **Pricing & Deals (edit pricing/packages):**
  https://www.weddingpro.com/pricing-deals

- **Media (add/remove photos):**
  https://www.weddingpro.com/media

- **Profile (business details, travel radius, team size):**
  https://www.weddingpro.com/profile

---

## 🔑 Identifiers

- **Storefront ID:** `45570835-6e88-4d3c-ac08-626640836ad2`
- **WeddingWire vendor ID:** `c6f9386a89e86d6a`
- **The Knot vendor ID:** `2104739`

---

## 📅 Google Calendar — for Claude Code booking system

**Decision: One calendar for everything.** All systems (The Knot, Claude Code booking system, bartenders) use the **primary `contact@lakesalt.us` calendar**.

### Why one calendar?

WeddingPro's calendar sync connects at the **account level** (`contact@lakesalt.us`), not per-calendar. It reads ALL calendars under that account to determine free/busy. A separate sub-calendar would still get read by WeddingPro and add complexity for bartenders without giving any real isolation. Cleaner to have one source of truth.

### Calendar ID (use this in Claude Code):

```
primary
```

Or, equivalently, the email itself: `contact@lakesalt.us`

### Setup notes

1. **WeddingPro Availability is connected** to `contact@lakesalt.us` already (see Availability → Connected accounts → ACTIVE). No further action needed.
2. **In Claude Code**, use `'primary'` as the `calendarId` in Google Calendar API calls. Auth as `contact@lakesalt.us`.
3. **Bartenders** subscribe to `contact@lakesalt.us` via standard Google Calendar sharing. Choose access level per role:
   - "See only free/busy (hide details)" — most bartenders, just for scheduling
   - "See all event details" — leads / managers
   - "Make changes to events" — only admins
4. **Privacy on the storefront:** WeddingPro promises *"We won't display any names or details of your booked events. We'll only show available or unavailable blocks based on the capacity per day that you set up."* — so personal events on the calendar stay private to couples.

### One thing to fix later

Your primary calendar's time zone is currently **Central Time - Chicago**. You're in Utah (Mountain Time). Update at: Calendar Settings → General → Time zone → Mountain Time - Denver. Otherwise Knot events created on your behalf may show up off by an hour.

---

## ⚠️ Important note about WeddingWire

The Profile page shows: *"You are not currently a premium WeddingWire vendor. Explore this feature and upgrade to share on your WeddingWire Storefront."*

This means your **free tier covers The Knot only** — WeddingWire requires a paid upgrade for the full storefront. The 4/7 dashboard tasks for WeddingWire may be limited until/unless you upgrade. The review link above still works for collecting WeddingWire reviews, but the storefront content there is limited on the free plan.

Upgrade page: https://www.weddingwire.com/vendor/VendorListingSettings

---

## 📋 Three follow-ups to maximize visibility

1. **Get 2 reviews per platform** — biggest lift. Use the review links above.
2. **Add availability** — go to /availability and block out dates you're booked or unavailable. Helps you rank when couples filter by date.
3. **Finish WeddingWire-specific fields** — only matters if you upgrade WeddingWire.

---

*Created: May 6, 2026*
