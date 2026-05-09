# Lake Salt — Analytics Setup & Reference

## How analytics work on this site

We use **Firebase Analytics** (which is Google Analytics 4 under the hood, accessed via your existing Firebase project — no separate account needed). Events are tracked client-side and flow into the Firebase Console where you can view dashboards, build funnels, and export to BigQuery if you ever want to.

---

## One-time activation (5 minutes)

You only have to do this once. After that, every event below starts flowing into the dashboard.

1. Open the [Firebase Console](https://console.firebase.google.com/) and select the `lake-salt` project.
2. In the left sidebar, click **Analytics** → **Dashboard**. If you see "Get started", click it. Firebase will provision a Google Analytics property automatically and link it to this Firebase project.
3. Once enabled, Firebase will show you a **Measurement ID** that looks like `G-XXXXXXXX`. Copy it.
4. Open `website/firebase-config.js` (gitignored — local file only) and add the `measurementId` field to the config object:
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "...",
     projectId: "lake-salt",
     // ... existing fields
     measurementId: "G-XXXXXXXX" // ← paste yours here
   };
   ```
5. Deploy. Events start flowing within minutes; Realtime view shows them instantly.

**Until you do step 4**, the tracking code falls back to `console.log('[analytics]', eventName, params)` in the browser DevTools — so you can verify wiring locally before going live.

---

## Events tracked

Each event includes timestamp + page automatically. Custom params listed per event.

### Page-level
| Event | When | Params |
|---|---|---|
| `page_view_landing` | Every visit to `/` | `{ mode: 'wedding'\|'corporate'\|'all', returning: true\|false }` |

### Intent picker (the "What are you looking for?" section)
| Event | When | Params |
|---|---|---|
| `intent_bartending_clicked` | "Bartending for an Event" button | `{}` |
| `intent_rental_clicked` | "Rent the Bar" or "Tables & Chairs" button | `{ rentalType: 'bar'\|'tables' }` |
| `intent_sale_clicked` | "Buy a Custom Bar" button | `{}` |

### 8-step bartending questionnaire
| Event | When | Params |
|---|---|---|
| `quiz_step_view` | Each step the user reaches | `{ step: 1-8, name: 'event_type'\|'drinks'\|'venue'\|'date'\|'guests'\|'budget'\|'contact'\|'submit' }` |
| `quiz_skipped` | User clicks the close X or "Take me to the site" | `{ step: <where they were> }` |
| `quiz_completed` | User finishes the 8 steps | `{ eventType, drinks: <count>, hasDate: bool }` |
| `lead_submitted` | Form sends successfully (Firestore + EmailJS) | `{ intent: 'bartending', eventType }` |

### Hero / homepage CTAs
| Event | When | Params |
|---|---|---|
| `hero_cta_clicked` | "Book Your Event" or "Explore Services" buttons | `{ cta: 'book_your_event'\|'explore_services' }` |
| `knot_badge_clicked` | The Knot badge in the hero or intent step | `{ location: 'hero'\|'intent' }` |

---

## Useful funnels to build in the Firebase Console

Once events are flowing, go to **Analytics → Funnels** and build:

1. **Bartending conversion funnel**
   `page_view_landing` → `intent_bartending_clicked` → `quiz_step_view` (step:8) → `lead_submitted`
   Tells you exactly where in the 8-step you're losing people.

2. **Rental interest funnel**
   `page_view_landing` → `intent_rental_clicked` → (form submit on rentals.html — track later)
   Tells you how many bartending visitors actually click rental.

3. **Skip vs engage**
   Compare counts of `quiz_skipped` vs `lead_submitted`. High skip + low submit = friction in early steps.

4. **Hero CTA performance**
   `hero_cta_clicked` (cta='book_your_event') vs `lead_submitted`. Tells you the conversion rate of "Book Your Event".

---

## Adding more events later

If you want to track a new interaction, call `trackEvent('your_event_name', { paramKey: paramValue })` from anywhere in the code. The helper handles the Firebase call and falls back to console.log if Analytics isn't yet active.

Example — tracking when someone opens the FAQ:
```js
<button onclick="trackEvent('faq_opened', { question: 'how-far-in-advance' }); toggleFaq(this)">
```

Keep event names lowercase with underscores (`like_this_one`) — that matches GA4 conventions and makes them filterable.

---

## Privacy

- Firebase Analytics respects browser-level Do Not Track by default
- No PII (names, emails, phone) is sent in event params — just structural data (which step, which button, which mode)
- Lead data goes to Firestore separately (existing flow), which is not joined to analytics

If you ever want to add a cookie banner, GA4 has a built-in consent mode you can flip on; happy to wire that up when you're ready.
