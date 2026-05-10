#!/usr/bin/env node
/**
 * scripts/expo-analytics.js
 * ─────────────────────────
 * Post-expo analysis + raffle winner picker for the May 9 2026 wedding expo.
 *
 * RUN ONCE: authenticate via gcloud (opens a browser, ~30 sec)
 *   gcloud auth application-default login
 *
 * RUN: from the project root
 *   node scripts/expo-analytics.js
 *
 * OPTIONAL FLAGS:
 *   --pick                Run a fair random winner draw across ALL valid entries.
 *   --pool=3-6            Restrict winner pool to brides whose wedding falls in
 *                         that month range (1-3, 3-6, 6-12, 12+).
 *   --winners=4           How many winners to draw (default 4).
 *   --campaign=Foo        Override the default campaign tag.
 *
 * The script prints a markdown report to stdout. Pipe to a file if you want:
 *   node scripts/expo-analytics.js --pick > expo-report.md
 */

const admin = require('firebase-admin');
const path = require('path');

const PROJECT = 'lake-salt';
const DEFAULT_CAMPAIGN = 'WeddingExpo2026-05-09';

/* ── Argument parsing ──────────────────────────────────────────────────── */
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      return [k, v === undefined ? true : v];
    }
    return [a, true];
  })
);
const PICK = !!args.pick;
const POOL = args.pool || 'all';            // 'all' | '0-3' | '3-6' | '6-12' | '12+' | 'no-date'
const WINNERS = parseInt(args.winners || '4', 10);
const CAMPAIGN = args.campaign || DEFAULT_CAMPAIGN;

/* ── Init ──────────────────────────────────────────────────────────────── */
try {
  admin.initializeApp({ projectId: PROJECT });
} catch (e) {
  console.error('Could not init Firebase Admin. Did you run `gcloud auth application-default login`?');
  console.error(e.message);
  process.exit(1);
}
const db = admin.firestore();

const now = new Date();
function monthsFromNow(yyyymmdd) {
  if (!yyyymmdd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return null;
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const diffMs = target - now;
  return diffMs / (1000 * 60 * 60 * 24 * 30.4375);
}
function bucketForMonths(months) {
  if (months === null) return 'no-date';
  if (months < 0)      return 'past';
  if (months <= 3)     return '0-3';
  if (months <= 6)     return '3-6';
  if (months <= 12)    return '6-12';
  return '12+';
}

(async () => {
  /* ── Pull cohort ─────────────────────────────────────────────────────── */
  const cohortSnap = await db.collection('leads').where('campaign', '==', CAMPAIGN).get();
  const allLeads = cohortSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  /* ── Pull page_events for this expo period ──────────────────────────── */
  const expoStart = new Date('2026-05-08T00:00:00');
  const expoEnd   = new Date('2026-05-12T00:00:00');
  const evSnap = await db.collection('page_events')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(expoStart))
    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(expoEnd))
    .get();
  const events = evSnap.docs.map(d => d.data());

  /* ── Bucket leads by wedding-date proximity ─────────────────────────── */
  const buckets = { 'past': [], '0-3': [], '3-6': [], '6-12': [], '12+': [], 'no-date': [] };
  for (const lead of allLeads) {
    const m = monthsFromNow(lead.eventDate);
    buckets[bucketForMonths(m)].push(lead);
  }

  /* ── Page events stats ───────────────────────────────────────────────── */
  const byPage = {};
  const byEvent = {};
  const sessions = new Set();
  let totalScrollMilestones = 0;
  let totalClicks = 0;
  for (const ev of events) {
    sessions.add(ev.sessionId);
    byPage[ev.page] = (byPage[ev.page] || 0) + 1;
    byEvent[ev.event] = (byEvent[ev.event] || 0) + 1;
    if (ev.event === 'scroll_depth') totalScrollMilestones++;
    if (ev.event === 'element_click') totalClicks++;
  }

  /* ── Output ──────────────────────────────────────────────────────────── */
  console.log(`# Lake Salt — Wedding Expo Post-Mortem\n`);
  console.log(`Generated ${now.toISOString()}\nCampaign: \`${CAMPAIGN}\`\n`);

  console.log(`## 1. Cohort summary\n`);
  console.log(`- **Total raffle/lead entries:** ${allLeads.length}`);
  const ig = allLeads.filter(l => l.instagramFollowed).length;
  console.log(`- IG follow checked: ${ig} (${pct(ig, allLeads.length)})`);
  const sources = {};
  allLeads.forEach(l => sources[l.source || '(none)'] = (sources[l.source || '(none)'] || 0) + 1);
  console.log(`- By source:`);
  Object.entries(sources).sort((a,b) => b[1]-a[1]).forEach(([s, n]) => console.log(`    - ${s}: ${n}`));

  console.log(`\n## 2. Wedding date distribution\n`);
  console.log(`| Bucket | Count | %  |`);
  console.log(`|---|---|---|`);
  ['0-3', '3-6', '6-12', '12+', 'past', 'no-date'].forEach(b => {
    const n = buckets[b].length;
    console.log(`| ${labelForBucket(b)} | ${n} | ${pct(n, allLeads.length)} |`);
  });

  console.log(`\n## 3. Traffic during expo (May 8–11)\n`);
  console.log(`- Unique sessions: ${sessions.size}`);
  console.log(`- Page events captured: ${events.length}`);
  console.log(`- Click events: ${totalClicks}`);
  console.log(`- Scroll-depth milestones: ${totalScrollMilestones}\n`);

  console.log(`### Events by type`);
  Object.entries(byEvent).sort((a,b) => b[1]-a[1]).forEach(([e, n]) => console.log(`- ${e}: ${n}`));

  console.log(`\n### Events by page`);
  Object.entries(byPage).sort((a,b) => b[1]-a[1]).forEach(([p, n]) => console.log(`- \`${p}\`: ${n}`));

  /* ── Conversion funnel for /book ─────────────────────────────────────── */
  const bookSessions = new Set(events.filter(e => e.page === '/book' || e.page === '/book.html').map(e => e.sessionId));
  const bookRaffleSessions = new Set(events.filter(e => e.event === 'raffle_submitted').map(e => e.sessionId));
  const bookCallSessions   = new Set(events.filter(e => e.event === 'wizard_submitted' && e.props && e.props.kind === 'call').map(e => e.sessionId));
  const bookInfoSessions   = new Set(events.filter(e => e.event === 'wizard_submitted' && e.props && e.props.kind === 'info').map(e => e.sessionId));

  console.log(`\n### /book conversion funnel`);
  console.log(`- /book sessions: ${bookSessions.size}`);
  console.log(`- → submitted raffle: ${bookRaffleSessions.size} (${pct(bookRaffleSessions.size, bookSessions.size)})`);
  console.log(`- → submitted call booking: ${bookCallSessions.size} (${pct(bookCallSessions.size, bookSessions.size)})`);
  console.log(`- → submitted info-only quote: ${bookInfoSessions.size} (${pct(bookInfoSessions.size, bookSessions.size)})`);

  /* ── Wizard step drop-off ────────────────────────────────────────────── */
  const stepCounts = {};
  events.filter(e => e.event === 'wizard_step_view').forEach(e => {
    const s = e.props && e.props.step;
    if (s != null) stepCounts[s] = (stepCounts[s] || 0) + 1;
  });
  if (Object.keys(stepCounts).length) {
    console.log(`\n### Wizard step views (drop-off pattern)`);
    Object.keys(stepCounts).sort((a,b) => Number(a) - Number(b)).forEach(s => {
      console.log(`- step ${s}: ${stepCounts[s]}`);
    });
  }

  /* ── Optional: pick a winner ─────────────────────────────────────────── */
  if (PICK) {
    console.log(`\n## 4. Random winner draw\n`);
    let pool;
    if (POOL === 'all') {
      pool = allLeads.filter(l => l.email && l.email.trim() && !l.email.includes('@test.local'));
      console.log(`Pool: **all valid entries** (excludes test emails) — ${pool.length} eligible`);
    } else {
      pool = (buckets[POOL] || []).filter(l => l.email && l.email.trim() && !l.email.includes('@test.local'));
      console.log(`Pool: **${labelForBucket(POOL)}** — ${pool.length} eligible`);
    }
    if (pool.length === 0) {
      console.log(`\n**No eligible entries in this pool.**`);
    } else {
      /* Crypto random — fair shuffle */
      const crypto = require('crypto');
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const winners = shuffled.slice(0, Math.min(WINNERS, pool.length));
      console.log(`\n**${winners.length} winner(s) drawn:**\n`);
      winners.forEach((w, i) => {
        const m = monthsFromNow(w.eventDate);
        console.log(`${i + 1}. **${w.name}** — ${w.email} — wedding ${w.eventDate || 'TBD'}${m !== null ? ` (${m.toFixed(1)} months out)` : ''} — leadId \`${w.id}\``);
      });
    }
  } else {
    console.log(`\n_Tip: re-run with \`--pick\` to draw a random winner. Add \`--pool=3-6\` to limit to brides 3-6 months out._`);
  }

  process.exit(0);
})().catch(e => {
  console.error('Failed:', e.message);
  process.exit(1);
});

function pct(n, total) {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}
function labelForBucket(b) {
  return ({
    'past':    'Already passed',
    '0-3':     '0-3 months out (hottest)',
    '3-6':     '3-6 months out (warm)',
    '6-12':    '6-12 months out',
    '12+':     '12+ months out',
    'no-date': 'No date specified',
  })[b] || b;
}
