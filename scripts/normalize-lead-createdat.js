#!/usr/bin/env node
/**
 * scripts/normalize-lead-createdat.js
 * ────────────────────────────────────
 * Some lead docs carry createdAt as an ISO/date STRING (imports, Zapier,
 * fallback writes) while others use real Firestore Timestamps. Mixed types
 * break orderBy('createdAt') — Firestore sorts by type first, so "newest
 * lead" queries silently lie. This converts every string/number createdAt
 * (and updatedAt) to a Firestore Timestamp.
 *
 * RUN:
 *   node scripts/normalize-lead-createdat.js          # dry run
 *   node scripts/normalize-lead-createdat.js --write  # apply
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

admin.initializeApp({ projectId: 'lake-salt' });
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

function toTimestamp(v) {
  if (v == null || (v && typeof v.toDate === 'function')) return null; // already fine / absent
  const ms = typeof v === 'number' ? v : Date.parse(String(v));
  if (isNaN(ms)) return undefined; // unparseable — report, don't touch
  return admin.firestore.Timestamp.fromMillis(ms);
}

(async () => {
  const snap = await db.collection('leads').get();
  let fixed = 0, bad = 0;
  for (const d of snap.docs) {
    const l = d.data();
    const patch = {};
    for (const k of ['createdAt', 'updatedAt']) {
      const t = toTimestamp(l[k]);
      if (t === undefined) { console.log(`⚠ ${d.id} (${l.name || '?'}): unparseable ${k}:`, JSON.stringify(l[k])); bad++; }
      else if (t) patch[k] = t;
    }
    if (Object.keys(patch).length) {
      fixed++;
      console.log(`${WRITE ? '✔ fixing' : '· would fix'} ${d.id} (${l.name || '?'}):`, Object.keys(patch).join(', '),
        '→', patch.createdAt ? patch.createdAt.toDate().toISOString() : '');
      if (WRITE) await d.ref.update(patch);
    }
  }
  console.log(`\n${snap.size} leads scanned · ${fixed} ${WRITE ? 'fixed' : 'need fixing'} · ${bad} unparseable`);
  process.exit(0);
})();
