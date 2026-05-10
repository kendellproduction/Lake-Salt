#!/usr/bin/env node
/**
 * REST-API variant of expo-analytics.js
 * Uses `gcloud auth print-access-token` (user creds) + Firestore REST API.
 * Avoids the ADC requirement of the admin-SDK version.
 */
const { execSync } = require('child_process');
const https = require('https');

const PROJECT = 'lake-salt';
const CAMPAIGN = 'WeddingExpo2026-05-09';

function getToken() {
  return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
}

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: '/v1' + path,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ': ' + body.slice(0, 500)));
        resolve(JSON.parse(body));
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function fromFirestoreValue(v) {
  if (v == null) return null;
  if ('stringValue' in v)  return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v)  return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue.values) || []).map(fromFirestoreValue);
  if ('mapValue' in v) {
    const obj = {};
    const fields = v.mapValue.fields || {};
    for (const k of Object.keys(fields)) obj[k] = fromFirestoreValue(fields[k]);
    return obj;
  }
  if ('nullValue' in v) return null;
  return null;
}
function rowFromDoc(doc) {
  const obj = { _docName: doc.name };
  const fields = doc.fields || {};
  for (const k of Object.keys(fields)) obj[k] = fromFirestoreValue(fields[k]);
  return obj;
}

async function runQuery(structuredQuery, token) {
  const out = await post(`/projects/${PROJECT}/databases/(default)/documents:runQuery`, { structuredQuery }, token);
  return (out || []).filter(r => r.document).map(r => rowFromDoc(r.document));
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => {
    if (!a.startsWith('--')) return [a, true];
    const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v];
  }));
  const PICK = !!args.pick;
  const POOL = args.pool || 'all';
  const WINNERS = parseInt(args.winners || '4', 10);

  const token = getToken();

  /* ── Pull cohort ─────────────────────────────────────────────────────── */
  const cohort = await runQuery({
    from: [{ collectionId: 'leads' }],
    where: { fieldFilter: { field: { fieldPath: 'campaign' }, op: 'EQUAL', value: { stringValue: CAMPAIGN } } },
    limit: 1000,
  }, token);

  /* ── Pull page_events for the expo period ───────────────────────────── */
  const expoStart = new Date('2026-05-08T00:00:00').toISOString();
  const expoEnd   = new Date('2026-05-12T00:00:00').toISOString();
  const events = await runQuery({
    from: [{ collectionId: 'page_events' }],
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          { fieldFilter: { field: { fieldPath: 'timestamp' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: expoStart } } },
          { fieldFilter: { field: { fieldPath: 'timestamp' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: expoEnd } } },
        ]
      }
    },
    orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
    limit: 5000,
  }, token);

  /* ── Bucket leads by months-out ──────────────────────────────────────── */
  const today = new Date('2026-05-10T00:00:00');
  function monthsOut(yyyymmdd) {
    if (!yyyymmdd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return null;
    const [y, m, d] = yyyymmdd.split('-').map(Number);
    return ((new Date(y, m - 1, d)) - today) / (1000 * 60 * 60 * 24 * 30.4375);
  }
  const buckets = { 'past': [], '0-3': [], '3-6': [], '6-12': [], '12-18': [], '18+': [], 'no-date': [] };
  for (const lead of cohort) {
    const m = monthsOut(lead.eventDate);
    let b = 'no-date';
    if (m !== null) {
      if (m < 0) b = 'past';
      else if (m <= 3) b = '0-3';
      else if (m <= 6) b = '3-6';
      else if (m <= 12) b = '6-12';
      else if (m <= 18) b = '12-18';
      else b = '18+';
    }
    buckets[b].push(lead);
  }

  /* ── Page event analysis ─────────────────────────────────────────────── */
  const sessions = new Set();
  const byPage = {};
  const byEvent = {};
  let clicks = 0;
  for (const ev of events) {
    sessions.add(ev.sessionId);
    byPage[ev.page || '?'] = (byPage[ev.page || '?'] || 0) + 1;
    byEvent[ev.event || '?'] = (byEvent[ev.event || '?'] || 0) + 1;
    if (ev.event === 'element_click') clicks++;
  }

  /* ── Output ──────────────────────────────────────────────────────────── */
  function pct(a, b) { return b ? Math.round((a/b)*100) + '%' : '0%'; }
  function blabel(b) {
    return ({
      'past': 'Already passed',
      '0-3': '0–3 months out (URGENT — need bartender now)',
      '3-6': '3–6 months out (HOT — actively shopping vendors)',
      '6-12': '6–12 months out (WARM — vendor research mode)',
      '12-18': '12–18 months out (COOL — early planner, dreaming)',
      '18+': '18+ months out (just engaged, year+ out)',
      'no-date': 'No date set yet',
    })[b] || b;
  }

  console.log(`# Lake Salt — Wedding Expo Post-Mortem`);
  console.log(`Generated ${new Date().toISOString()}\nCampaign \`${CAMPAIGN}\` · Today is May 10 2026\n`);

  console.log(`## 1. Cohort summary`);
  console.log(`- **Total entries:** ${cohort.length}`);
  const filtered = cohort.filter(l => l.email && !String(l.email).includes('@test.local'));
  console.log(`- **Real entries (test emails excluded):** ${filtered.length}`);
  const ig = filtered.filter(l => l.instagramFollowed).length;
  console.log(`- IG-follow checked: ${ig} (${pct(ig, filtered.length)} of real entries)`);
  console.log();

  const sources = {};
  filtered.forEach(l => {
    const s = l.source || '(none)';
    sources[s] = (sources[s] || 0) + 1;
  });
  console.log(`## 2. Entries by source`);
  Object.entries(sources).sort((a,b) => b[1]-a[1]).forEach(([s, n]) =>
    console.log(`- ${s}: **${n}**`));
  console.log();

  console.log(`## 3. Wedding-date distribution`);
  console.log(`| Bucket | Count | % of real |`);
  console.log(`|---|---|---|`);
  ['0-3','3-6','6-12','12-18','18+','past','no-date'].forEach(b => {
    const n = buckets[b].filter(l => l.email && !String(l.email).includes('@test.local')).length;
    console.log(`| ${blabel(b)} | ${n} | ${pct(n, filtered.length)} |`);
  });
  console.log();

  console.log(`## 4. Traffic during expo (May 8–11)`);
  console.log(`- Unique sessions: **${sessions.size}**`);
  console.log(`- Total events: **${events.length}**`);
  console.log(`- Click events: ${clicks}`);
  console.log();

  console.log(`### Events by type`);
  Object.entries(byEvent).sort((a,b) => b[1]-a[1]).forEach(([e,n]) => console.log(`- \`${e}\`: ${n}`));
  console.log();

  console.log(`### Events by page`);
  Object.entries(byPage).sort((a,b) => b[1]-a[1]).forEach(([p,n]) => console.log(`- \`${p}\`: ${n}`));
  console.log();

  /* ── /book conversion funnel ─────────────────────────────────────────── */
  const bookSess = new Set(events.filter(e => (e.page || '').includes('book')).map(e => e.sessionId));
  const raffSess = new Set(events.filter(e => e.event === 'raffle_submitted').map(e => e.sessionId));
  const callSess = new Set(events.filter(e => e.event === 'wizard_submitted' && e.props && e.props.kind === 'call').map(e => e.sessionId));
  const infoSess = new Set(events.filter(e => e.event === 'wizard_submitted' && e.props && e.props.kind === 'info').map(e => e.sessionId));
  console.log(`### /book conversion funnel`);
  console.log(`- /book sessions: **${bookSess.size}**`);
  console.log(`- → submitted raffle: ${raffSess.size} (${pct(raffSess.size, bookSess.size)} of /book)`);
  console.log(`- → submitted call booking: ${callSess.size}`);
  console.log(`- → submitted info-only quote: ${infoSess.size}`);
  console.log();

  /* ── Wizard step views ───────────────────────────────────────────────── */
  const stepCounts = {};
  events.filter(e => e.event === 'wizard_step_view').forEach(e => {
    const s = e.props && e.props.step;
    if (s != null) stepCounts[s] = (stepCounts[s] || 0) + 1;
  });
  if (Object.keys(stepCounts).length) {
    console.log(`### Wizard step views`);
    Object.keys(stepCounts).sort((a,b) => Number(a)-Number(b)).forEach(s =>
      console.log(`- step ${s}: ${stepCounts[s]}`));
    console.log();
  }

  /* ── Random winner draw ──────────────────────────────────────────────── */
  if (PICK) {
    console.log(`## 5. Random winner draw`);
    let pool;
    if (POOL === 'all') {
      pool = filtered;
      console.log(`Pool: **all valid entries** — ${pool.length} eligible\n`);
    } else {
      pool = (buckets[POOL] || []).filter(l => l.email && !String(l.email).includes('@test.local'));
      console.log(`Pool: **${blabel(POOL)}** — ${pool.length} eligible\n`);
    }
    if (!pool.length) {
      console.log(`**No eligible entries.**`);
    } else {
      const crypto = require('crypto');
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const winners = shuffled.slice(0, Math.min(WINNERS, pool.length));
      console.log(`**${winners.length} winner(s):**\n`);
      winners.forEach((w, i) => {
        const m = monthsOut(w.eventDate);
        console.log(`${i + 1}. **${w.name}** — ${w.email} — wedding ${w.eventDate || 'TBD'}${m !== null ? ` (${m.toFixed(1)} months out)` : ''}`);
      });
    }
  }

  /* ── Email-list dump for nurture by bucket ───────────────────────────── */
  console.log(`\n## 6. Nurture lists by bucket (paste into BCC)`);
  ['0-3','3-6','6-12','12-18','18+','no-date'].forEach(b => {
    const list = buckets[b].filter(l => l.email && !String(l.email).includes('@test.local'));
    if (!list.length) return;
    console.log(`\n### ${blabel(b)} (${list.length})`);
    list.forEach(l => console.log(`- ${l.name || '(no name)'} — ${l.email}${l.eventDate ? ' — ' + l.eventDate : ''}`));
  });
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
