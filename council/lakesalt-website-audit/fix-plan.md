# Lake Salt Website — Correction Plan
*Derived from the council audit (report.md) + Kendell's decisions on 2026-08-05*

## Decisions locked in
- **Real phone number: (801) 692-3585** — the (385) 743-7771 on quote.html and the 555 number in schema were both wrong.
- **Rentals are removed** from the site (bar/tables/chairs) — not exploring that space for now.
- **book.html is repurposed** as the evergreen booking page (expo/raffle content stripped, the 10-step flow + 15-min call scheduling kept).
- **Email standardized** to contact@lakesalt.us (replacing hello@lakesalt.us in schema and llms files).
- **NAP locality: Saratoga Springs, UT** everywhere.
- **Canonical host: https://lakesalt.us** (non-www), extensionless URLs (Firebase `cleanUrls` is on).

## Code fixes (done in this pass)
1. Schema: real phone, contact@ email, Saratoga Springs, rental Offers removed.
2. Tap-to-call/text: `tel:`/`sms:` links in header, footer, contact section + sticky mobile Call/Text bar.
3. Social-proof zero-state killed: stats render real static values without JS; reviews section has a real fallback (links to Google/The Knot) instead of an infinite "Loading…" — no fabricated quotes.
4. Rentals removed: rentals.html deleted (301 → home), quiz cards, nav/footer links, sitemap, llms.txt/llms-full.txt, index schema.
5. book.html: evergreen booking page at /book (old expo redirects removed from firebase.json).
6. Homepage un-gated: hero shows first; the intake quiz opens on "Book Your Event" click instead of blocking cold visitors.
7. quote.html: noindexed (private proposals), phone corrected.
8. URL hygiene: one host (lakesalt.us), extensionless internal links/canonicals/sitemap; recipes.html www canonical fixed.
9. weddings.html: keyword H1 ("Utah Wedding Bartending & Mobile Bar Service"), poetic line kept as subhead.
10. Quick wins: unified price anchor, response-time promise at the submit button, "venue-ready" trust strip (TIPS · Insured · COI within 24h), dead footer links fixed, © 2026.

## Things only Kendell can do (in order)
1. **Claim/verify Google Business Profile** as a Saratoga Springs *service-area* business (hide address). Category "Bartending service" + "Wedding service", 20+ photos, booking link. Start now — verification takes days.
2. **Paste the real Google Place ID** into index.html (`GOOGLE_PLACE_ID`) once GBP is live, so the live reviews widget works.
3. **Review engine**: within 48h of every event, text clients the Google review link first, then The Knot/WeddingWire (links in lake-salt-weddingpro-links.md). Target 10+ Google reviews this quarter.
4. **Check the 403**: verify crawlers get 200s — Search Console URL inspection + `curl -A GPTBot https://lakesalt.us/`. If Firebase/WAF blocks bots, SEO work is invisible.
5. **Citations** (identical NAP with the new number): Thumbtack, GigSalad, The Bash, Yelp, Apple Maps, Bing Places.
6. **Share card**: create a real 1200×630 og:image (current one is portrait and crops badly in iMessage/Facebook).
7. **City pages** (next content sprint): Wedding Bartender Salt Lake City, Corporate Bartending Lehi (Adobe angle), then Provo/Orem, Park City.
8. **"How much does a mobile bar cost in Utah?"** blog post — pricing content already exists, just needs an indexable page.

## What to measure weekly
Form/quiz submissions · calls+texts to (801) 692-3585 · GBP actions & review count · rankings for "mobile bartending salt lake city", "wedding bartender utah".
