#!/usr/bin/env node
/**
 * Seeds the Notes & Learnings content for the Wedding Expo May 9, 2026
 * into Firestore `expos/wedding-expo-2026-05-09` so it appears in the
 * admin Notes tab.
 *
 * Run once: `node scripts/seed-expo-notes.js`
 * Requires: gcloud auth print-access-token works (you should already be
 * authed if you've been running expo-analytics-rest.js).
 */
const { execSync } = require('child_process');
const https = require('https');

const PROJECT = 'lake-salt';
const EXPO_ID = 'wedding-expo-2026-05-09';

const notes = `Pulled May 10 2026 — the morning after the expo.

89 real raffle entries, 99% checked the IG follow box (but only ~22 actual new IG followers — the box is honor-system honor-broken).

44% raffle conversion (89 / 203 /book sessions) — above industry baseline (15–40%) for a giveaway form. Good number.

Wedding-date distribution:
• 0–3 months out: 7 brides
• 3–6 months out: 25 brides
• 6–12 months out: 15 brides
• 12–18 months out: 26 brides
• 18+ months out: 5 brides
• No date set: 10 brides
• Already past: 1 (likely typo)

Two key takeaways:
1. 37% of brides (32) are within 6 months — that's the real revenue pipeline this summer/fall.
2. 35% (31) are 12+ months out — long nurture cycle, slow revenue. Need to design next year's booth pitch to skew closer-date.

Zero duplicates by phone or email. Each entry is a unique person — no bots, no double-dippers.`;

const worked = `• High form completion: 99% of entries checked the IG follow box
• Strong raffle conversion: 44% of /book sessions converted to entries (industry baseline is 15–40%)
• $50 Amazon raffle prize + mocktail samples drew real engagement
• Wedding-date capture rate was strong: only 11% submitted with no date
• Clean cohort — zero duplicate entries (no double-dippers / bots)
• 4-person booth kept conversations going at peak times`;

const change = `• Cohort skews late (35% are 12+ months out) — design next year's booth pitch to attract closer-date brides ("Get on our calendar for this summer/fall")
• ONLY 1 person used the post-raffle "Book a 15-min call" CTA. We need to make next year's post-raffle CTA much more visible/incentive-aligned
• Almost zero info-only quote submissions — same problem, CTA was invisible
• The IG-follow checkbox is self-reported. ~22 actual new followers vs. 89 claims. Next year: link to IG with QR overlay so the follow is single-tap
• Booth had 4 staff which was occasionally cramped — limit to 3 next year
• Real booth cost was higher than the $1,200 default — itemize expenses next time

IDEA FOR NEXT YEAR: instead of "scan to enter the raffle," try "scan to request a quote — entries to win a $50 Amazon card." Slightly higher friction but pre-qualifies leads to people who actually want a quote.`;

function patch(path, fields) {
  const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  return new Promise((res, rej) => {
    const fp = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: '/v1/projects/' + PROJECT + '/databases/(default)/documents' + path + '?' + fp,
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    }, r => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => res({ status: r.statusCode, body }));
    });
    req.on('error', rej);
    const payload = { fields: {} };
    for (const [k, v] of Object.entries(fields)) {
      payload.fields[k] = (typeof v === 'string')
        ? { stringValue: v }
        : { timestampValue: v };
    }
    req.write(JSON.stringify(payload));
    req.end();
  });
}

(async () => {
  const r = await patch('/expos/' + EXPO_ID, {
    expoId: EXPO_ID,
    notes,
    worked,
    change,
    notesUpdatedAt: new Date().toISOString(),
  });
  console.log('Wrote expos/' + EXPO_ID + ': HTTP', r.status);
  if (r.status >= 400) console.log(r.body.slice(0, 500));
})();
