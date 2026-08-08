# Lake Salt Mobile Bar — Website Audit: Prioritized Action Plan
*lakesalt.us · Synthesized from 5 specialist reviews · 2026-08-05*

Note: the live site returned 403 to all non-browser fetchers in this environment, so every reviewer audited the deployed source in `/home/user/Lake-Salt/website` (the Firebase Hosting root) plus live web searches. One action item below is to verify real crawlers aren't getting that same 403.

---

## 1. Executive Summary

Lake Salt's site is far better built than the average side-business site — transparent pricing ("Starts around $650… Most couples invest $600–$2,000"), a real dry-hire differentiator, strong schema/llms.txt, and 20+ real event photos — but it only ranks for its own brand name while BARMASTERS, With A Twist, and Copa take every "mobile bartending Salt Lake City" lead. The biggest lever is the trust/contact layer: a **fake +1-801-555-0100 phone number is published in your structured data**, there are **zero tel:/sms: links on public pages**, the Google reviews widget is dead (`GOOGLE_PLACE_ID = 'YOUR_PLACE_ID_HERE'`), and stats render as "0.0★ Google Rating" until JS runs. Fix those in one weekend, then stand up a verified Google Business Profile plus 4–6 city pages, and you can realistically expect a 2–3x lift in inquiries within a quarter — mostly from map-pack visibility and the phone/text channel you currently don't have.

## 2. What's Working

- **Transparent pricing** ($500 dry hire / $650 full bar, itemized add-ons) — almost no competitor does this.
- **Real differentiators**: dry-hire/no-alcohol-markup, Utah-law compliance, mocktail/LDS-wedding angle, Adobe Lehi partnership, women-owned, TIPS certified.
- **SEO/AI plumbing**: good titles/descriptions, LocalBusiness + FAQ schema with ~85-city areaServed, sitemap with 30+ recipe URLs, robots.txt allowing AI crawlers, excellent llms.txt/llms-full.txt.
- **Good UX bones**: multi-step quote wizard, 24h/4h response promise, real photos in `/website/images`, alt text everywhere, The Knot Preferred Vendor + 5.0 rating.
- `book.html`'s 10-step flow with 15-min call scheduling ("We'll hold your date until then") is genuinely great copy — currently wasted on an expired expo page.

## 3. Top 10 Improvements (impact vs. effort)

**1. Fix the fake phone number and NAP everywhere.** *(High impact · 1 hour)*
`index.html` (~line 45) publishes `"telephone": "+1-801-555-0100"` in LocalBusiness schema — a 555 number Google and AI assistants can surface. Also: schema says `addressLocality: "Salt Lake City"` while about/weddings schema and The Knot say Saratoga Springs; schema email is hello@lakesalt.us but the site uses contact@lakesalt.us. Replace with the real number — (385) 743-7771 already appears on quote.html — set Saratoga Springs on every page, pick one email, and use that exact NAP in footer, GBP, The Knot, WeddingWire, llms.txt. **Why:** fake/inconsistent NAP actively suppresses local rankings and every fix downstream depends on it.

**2. Add tap-to-call and text links.** *(High impact · 2 hours)*
Grep found zero `tel:`/`sms:` links on public pages; every ranking competitor leads with a phone number. Add "Call/Text (385) 743-7771" as `tel:`/`sms:` links in header, footer, contact section, and a sticky mobile bar. **Why:** brides comparison-shopping on phones will send a 30-second text before filling a 14-field form — reviewers estimate +20–40% inquiries from this segment alone.

**3. Verify/optimize Google Business Profile + fix the dead reviews widget.** *(Highest lead-volume lever · ~3 hours + verification wait)*
No knowledge panel surfaces on brand searches. Claim GBP as a Saratoga Springs *service-area* business (hide address; service area = SL/Utah/Davis/Weber/Summit/Wasatch counties), primary category "Bartending service," secondary "Wedding service," 20+ action photos, booking link. Then paste the real Place ID at `index.html:5175` — it's currently `'YOUR_PLACE_ID_HERE'`, so the "Live from our Google Business profile" section shows "Loading reviews from Google…" forever. **Why:** GBP is where "mobile bar near me" leads come from; the map pack is the single biggest untapped channel.

**4. Kill the zero-state social proof.** *(High impact · 2 hours)*
Stats are hardcoded "0.0★ Google Rating / 0+ Events Served / 0+ Utah Counties" until JS animates them. Bake real static numbers into the HTML and hardcode 3–4 substantive review quotes as fallback (named bride + venue + guest count, a corporate/Adobe quote, a mocktail/LDS quote — not "Great drinks! Mocktails too!"). **Why:** any JS hiccup currently shows a 0.0-star bar service; crawlers see zeros too.

**5. Replace every "Photos Coming Soon" placeholder.** *(High impact · 1 hour)*
Four placeholders sit on revenue cards (Mobile Bar Rental, Tables & Chairs, Custom Bar) while `/website/images` holds 20+ real photos. The $150/day bar rental has no photo of the bar. **Why:** placeholders read as "not a real business" to comparison shoppers; the bar *is* the product.

**6. Build 4–6 city/intent landing pages.** *(High impact · ~2 weekends)*
Only one geo-titled page exists ("Wedding Bartending & Mobile Bar — Salt Lake City"). BARMASTERS ranks with URLs like `/wedding-bartending-services-in-salt-lake-city-ut/`. Build: Wedding Bartender Salt Lake City · Mobile Bar Provo/Orem · Corporate Bartending Lehi (lead with "Trusted by Adobe Lehi") · Park City Weddings · Ogden. Each: unique copy, local venues served, travel-fee note, a local photo, city FAQ, Service schema. Link them from the footer "Areas Served" column (currently five links all pointing at the same `#service-area` anchor). Don't template-spam all 85 cities. **Why:** this is the proven pattern of every competitor outranking you.

**7. Start a review engine.** *(High impact · 1 hour setup, ongoing)*
Within 48h of every event, text clients the Google review link first, then The Knot/WeddingWire (links already in `lake-salt-weddingpro-links.md`). Also: the hardcoded `aggregateRating` (5.0, 11 reviews) has no crawlable reviews backing it — a manual-action risk; publish real review text on-site or populate dynamically. **Why:** review count is the #2 local ranking factor; 15–25 Google reviews in a quarter typically puts a niche service in the map pack.

**8. Fix URL/canonical chaos.** *(Medium impact · 2 hours)*
`firebase.json` sets `cleanUrls: true`, but nav, canonicals, og:urls, and sitemap all use `.html` URLs (every internal click 301s); `recipes.html` canonicalizes to `www.lakesalt.us` while everything else is non-www — and Google currently indexes www. Standardize on one host with a 301, switch everything to extensionless URLs. Add `noindex` to `quote.html` (private client proposals are currently indexable). **Why:** consolidates split ranking signals so existing pages rank at full strength.

**9. Un-gate the homepage.** *(Medium-high impact · half a day)*
The full-screen "How can we help you?" quiz blocks the hero, photos, pricing, and trust content for cold visitors; the escape hatch ("Just looking around? Take me to the site →") is small. Show the hero first; open the quiz on "Book Your Event" click. Also repurpose `book.html` — it still shows "Raffle Closed… Winners were drawn Sunday May 10" (3 months stale) — as the evergreen booking page. **Why:** SEO/Knot traffic wants to vet you before answering 8 steps of questions.

**10. Performance + share-card fixes.** *(Medium impact · half a day)*
`/images` is 11MB with no WebP/srcset; hero first paints from an *Unsplash URL* (index.html:4053) before JS swaps it. Convert to WebP, preload the local hero, drop Unsplash. The og:image is a 1400×1866 portrait declared as 1200×630 — it crops badly in iMessage/Facebook, the main wedding referral channel; build a real 1200×630 share card and add og:images to subpages (weddings.html has none). Also fix the four dead `href="#"` social/Privacy/Terms footer links.

## 4. SEO/GEO Playbook — 30-Day Checklist

**Week 1 — foundation (blocks everything else):**
- [ ] Replace 555 phone + fix locality/email in all schema; add tel:/sms: links site-wide
- [ ] Claim/verify GBP (service-area, Saratoga Springs); start verification immediately — it can take days
- [ ] Verify bots get 200s: Search Console URL inspection + `curl -A GPTBot https://lakesalt.us/` (both fetchers here got 403 — if Firebase/WAF blocks bots, all your llms.txt work is invisible)
- [ ] Fix canonicals/sitemap/internal links to one host + extensionless URLs; 301 www↔non-www; noindex quote.html

**Week 2 — GBP + reviews:**
- [ ] Finish GBP: categories, service areas, 20+ photos, booking link, Q&A seeded from your FAQ
- [ ] Paste real Place ID at index.html:5175; add "See All Reviews on Google" link
- [ ] Text every past client (The Knot 5.0 reviewers first) the Google review link; target 10+ this month
- [ ] Set up the 48h post-event review text as standard practice

**Week 3 — citations & directories:**
- [ ] Identical-NAP profiles: Thumbtack (its "10 Best Mobile Bartending Salt Lake City" list ranks top-3 and you're not on it), GigSalad, The Bash, Yelp, themobilebarfinder.com
- [ ] Apple Maps, Bing Places, Facebook page check (schema already links facebook.com/lakesaltbar)
- [ ] Link The Knot badge to your actual Knot storefront; link "5.0 Google" to the GBP

**Week 4 — content:**
- [ ] Ship 2 city pages first: **Wedding Bartender Salt Lake City** and **Corporate Bartending Lehi** (Adobe angle); wire footer links to them
- [ ] Add keyword-bearing H1s: weddings.html H1 is "Where every sip tells your story" with zero images (`<img` count = 0) — keep the poetic line as subhead, make H1 "Utah Wedding Bartending & Mobile Bar Service," add photos with alts like "mobile bar at Provo wedding reception"
- [ ] Add Service + FAQPage schema to weddings/rentals/sales
- [ ] Publish "How much does a mobile bar cost in Utah?" post — your transparent pricing content is already written; it just needs an indexable page

## 5. Conversion Quick Wins (one weekend)

Saturday morning: items 1, 2, 4, 5 above (phone/NAP, tel links + sticky bar, hardcoded stats/reviews, real photos). Then:
- Unify the price anchor — homepage says "$600–$2,000" but both form budget dropdowns label "$1,500 – $2,500" as "(most weddings)". Pick one story, use it verbatim everywhere.
- Repeat the response promise ("Most weddings get a quote back within 24 hours") directly under the "Send My Inquiry →" button and on the quiz final step.
- Cut the fallback contact form from ~14 fields to 5–6 (name, phone/email, date, guest count, message).
- Add a "Venue-ready: TIPS Certified · Liability Insured · COI to your venue within 24 hours" strip near the hero — it's currently buried in an FAQ accordion, and planners screen on it first.
- Put the differentiator on screen one: "Zero alcohol markup — you buy the bottles, we do everything else." ("Utah's Premier" is what all five competitors above you also say.)
- Fix the four dead footer social links and sync "© 2025" vs "© 2026" footers.

## 6. What to Measure

Keep it to one simple weekly note (analytics.js + Firebase Analytics are already wired):
1. **Form/quiz submissions per week** (and quiz starts vs. completions — you'll see the modal-first cost).
2. **Calls + texts** to (385) 743-7771 — new channel, count from your phone.
3. **GBP actions** (GBP dashboard: calls, website clicks, direction requests) and **Google review count**.
4. Monthly: rankings for "mobile bartending salt lake city," "wedding bartender utah," "mobile bar provo" — you currently appear only on branded searches; watch these move as GBP + city pages land.