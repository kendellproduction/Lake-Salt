#!/usr/bin/env node
/**
 * scripts/seed-nurture-templates.js
 * ─────────────────────────────────
 * Seeds the 6-tier nurture templates + default nurture settings into Firestore
 * (settings/nurture_templates and settings/nurture). Templates use the proven
 * Cohort-1 body (Kendell's voice) as the shared base, with a per-tier subject
 * and stage paragraph swapped in. All are DRAFTS — Kendell reviews/edits them in
 * the admin Nurture panel before arming live sends.
 *
 * Merge fields the sender fills per lead:
 *   {{first_name}} {{month}} {{wedding_year}} {{wedding_date_pretty}}
 *   {{weeks_out}} {{months_out}}
 *
 * NOTE: the "book by June 9" offer deadline is from the original May drafts and
 * is stale — update it in the panel (or here) before arming.
 *
 * RUN:
 *   node scripts/seed-nurture-templates.js           # dry run (prints, writes nothing)
 *   node scripts/seed-nurture-templates.js --write   # writes to Firestore
 *
 * Safe to re-run: overwrites the template doc with the same content (idempotent).
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const BODY_TEMPLATE = `Hi {{first_name}},

Kendell here from Lake Salt Drink Catering — we were the mocktail booth at the SLC Bridal Expo (the one with the line that wouldn't quit 😅). Thanks for tossing your name in the raffle. Quick heads up: the real prize was never the gift card. 10% off your wedding bar saves you way more than $50, and that's what I want to talk to you about.

{{stage_paragraph}}

Here's something we see at every event we work: when there's a real drink bar — beautiful menu, signature drinks, mocktails for the non-drinkers — guests stick around longer, the dance floor stays full, and the whole vibe gets elevated. It's the difference between a "nice wedding" and "the wedding everyone's still texting about Monday morning."

A few things couples love about us:

  • Signature drinks we co-design with you — no extra charge, and they end up photographed and Instagrammed for weeks
  • Mocktails, dirty sodas, cocktails, beer/wine, lemonade — every guest finds something they love
  • We bring the bar, the glassware, the garnishes, the show — you bring the guests

Since you stopped by the booth, I want to lock in an expo-exclusive 10% off for you. On a typical wedding bar that's $150–$300+ in savings.

If you want a quote, hit reply with:
  • Approximate guest count
  • Venue (or city if still deciding)
  • Start + end time
  • Drinks you love — mocktails, dirty sodas, cocktails, beer/wine, themed?

I'll have a tailored number in your inbox within 48 hours. Base package starts at $500 for a bartender + supplies for 3 hours (lakesalt.us/pricing), and every wedding gets a custom number based on your guest count, hours, and drinks.

Rather hop on a quick call? Here: https://lakesalt.us/book

P.S. We're @lakesaltbartending on Instagram — posting recipes, drink-making videos, and behind-the-scenes from weddings this summer. Would love to have you along.

Congrats again — talk soon.

Kendell & Maddie
Lake Salt Drink Catering
lakesalt.us · @lakesaltbartending`;

const SUBJECT_MONTH = 'Saw you at the booth, {{first_name}} — quick note about your {{month}} wedding';
const SUBJECT_YEAR  = 'Saw you at the booth, {{first_name}} — quick note about your {{wedding_year}} wedding';

const STAGE = {
  1: `Your {{wedding_date_pretty}} wedding is {{weeks_out}} weeks out, which means you're in the "lock things down NOW" zone — and drink catering is one of those things that quietly disappears off the planner list once it's handled. If you want it off your plate, now's the time.`,
  2: `Your {{wedding_date_pretty}} wedding is a few months out — the confident-but-don't-wait zone. The bar shapes the whole vibe of the reception, and the good news is you have time to design something you actually love. The catch: {{month}} weekends fill fast, so locking it in now means the date is yours.`,
  3: `Your {{wedding_date_pretty}} wedding is {{months_out}} months out, which is honestly the sweet spot — far enough that you have your pick of dates and vendors, close enough that locking things in now means you can stop thinking about them. 8–12 months out is when smart couples start checking drink catering off the list.`,
  4: `Your {{wedding_date_pretty}} wedding is {{months_out}} months out — and honestly, this is the smartest time to lock in vendors. Most couples wait until 6 months out, panic-book whoever's left, and pay more for less. Booking early means you get the date, the package, and the pricing you actually want.`,
  5: `Your {{wedding_date_pretty}} wedding is still a ways out — no pressure at all. I just wanted to be a friendly face for whenever you start pulling the day together. When drink catering makes it onto your list, we'll be here, and your expo discount will be waiting.`,
  6: `Sounds like you're still nailing down the date — totally normal, and no rush. Whenever it's set, drop me a line and we'll get your wedding bar on the calendar. In the meantime, your expo discount is yours to hold onto.`
};

function tpl(n, subject) {
  return {
    subject,
    body: BODY_TEMPLATE.replace('{{stage_paragraph}}', STAGE[n]),
    status: 'draft',
    tier: n
  };
}

const TEMPLATES = {
  tier1: tpl(1, SUBJECT_MONTH),
  tier2: tpl(2, SUBJECT_MONTH),
  tier3: tpl(3, SUBJECT_MONTH),
  tier4: tpl(4, SUBJECT_YEAR),
  tier5: tpl(5, SUBJECT_YEAR),
  tier6: tpl(6, 'Saw you at the booth, {{first_name}} — let\'s get your wedding on the calendar')
};

const SETTINGS = { armed: false, dryRun: true, offer: '10% expo discount', pacingDays: 2 };

async function main() {
  const WRITE = process.argv.includes('--write');
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'lake-salt' });
  const db = admin.firestore();

  console.log('Nurture templates to seed:');
  for (const [k, v] of Object.entries(TEMPLATES)) {
    console.log(`  ${k}: "${v.subject}" (${v.body.length} chars)`);
  }
  console.log('Settings:', SETTINGS);

  if (!WRITE) {
    console.log('\nDRY RUN — nothing written. Re-run with --write to seed Firestore.');
    return;
  }

  await db.collection('settings').doc('nurture_templates').set(TEMPLATES, { merge: true });
  // Only create settings/nurture if it doesn't exist, so we never clobber a live "armed" flag.
  const setRef = db.collection('settings').doc('nurture');
  const cur = await setRef.get();
  if (!cur.exists) await setRef.set(SETTINGS);
  else console.log('settings/nurture already exists — left as-is (did not touch armed flag).');

  console.log('\n✓ Seeded settings/nurture_templates' + (cur.exists ? '' : ' + settings/nurture'));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
