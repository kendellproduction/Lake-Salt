#!/usr/bin/env node
/**
 * scripts/populate-events-collection.js
 * ──────────────────────────────────────
 * Writes the 13 historical 2025 Lake Salt events into the `events` collection
 * so the dashboard Revenue / event count stats are accurate.
 *
 * RUN:
 *   node scripts/populate-events-collection.js          # dry run (prints, writes nothing)
 *   node scripts/populate-events-collection.js --write  # writes to Firestore
 *
 * Safe to re-run: skips any doc where (name + date + importBatch) already exists.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const IMPORT_BATCH = '2025-events-v1';

const EVENTS = [
  { name: 'Adobe — 1st Event',          eventType: 'Corporate Event',    date: '2025-06-22', revenue: 2300,  guestCount: 300,  venue: 'Adobe' },
  { name: 'Adobe — Oktoberfest',         eventType: 'Corporate Event',    date: '2025-08-26', revenue: 7044,  guestCount: 900,  venue: 'Adobe' },
  { name: "Anshu's Summer Party",        eventType: 'Private Celebration', date: '2025-09-06', revenue: 632,   guestCount: 60,   venue: '' },
  { name: 'Adobe — Sangria Event',       eventType: 'Corporate Event',    date: '2025-09-10', revenue: 1800,  guestCount: 0,    venue: 'Adobe' },
  { name: 'Adobe — Summer Bonfire',      eventType: 'Corporate Event',    date: '2025-09-16', revenue: 2500,  guestCount: 200,  venue: 'Adobe' },
  { name: 'Adobe — WF Happy Hour 1',     eventType: 'Corporate Event',    date: '2025-09-17', revenue: 1600,  guestCount: 175,  venue: 'Adobe' },
  { name: 'Adobe — WF 15-Person HH',    eventType: 'Corporate Event',    date: '2025-10-06', revenue: 900,   guestCount: 15,   venue: 'Adobe' },
  { name: 'Adobe — Art Night',           eventType: 'Corporate Event',    date: '2025-10-07', revenue: 2500,  guestCount: 200,  venue: 'Adobe' },
  { name: 'Adobe — WF Happy Hour 2',     eventType: 'Corporate Event',    date: '2025-10-08', revenue: 2000,  guestCount: 100,  venue: 'Adobe' },
  { name: 'Adobe — Happy Hour Nov',      eventType: 'Corporate Event',    date: '2025-11-12', revenue: 1400,  guestCount: 100,  venue: 'Adobe' },
  { name: 'Adobe — Hola x Escape',       eventType: 'Corporate Event',    date: '2025-11-13', revenue: 2500,  guestCount: 300,  venue: 'Adobe' },
  { name: 'Adobe — Christmas Event',     eventType: 'Corporate Event',    date: '2025-12-09', revenue: 11500, guestCount: 1200, venue: 'Eight Fifty South' },
  { name: 'Kendall Rodriguez — Queen of SLC', eventType: 'Private Celebration', date: '2025-12-12', revenue: 615, guestCount: 60, venue: '' },
];

async function main() {
  const WRITE = process.argv.includes('--write');
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'lake-salt' });
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const totalRevenue = EVENTS.reduce((s, e) => s + e.revenue, 0);
  console.log(`\n${WRITE ? '✅ WRITING' : '🔍 DRY RUN'} — ${EVENTS.length} events → events collection (project: lake-salt)`);
  console.log(`Total revenue to import: $${totalRevenue.toLocaleString()}\n`);

  let created = 0, skipped = 0;

  for (const e of EVENTS) {
    const dupe = await db.collection('events')
      .where('importBatch', '==', IMPORT_BATCH)
      .where('name', '==', e.name)
      .where('date', '==', e.date)
      .limit(1).get();

    if (!dupe.empty) {
      console.log(`  SKIP (exists): ${e.name} — ${e.date}`);
      skipped++;
      continue;
    }

    const doc = {
      name:        e.name,
      eventType:   e.eventType,
      date:        e.date,
      revenue:     e.revenue,
      guestCount:  e.guestCount || 0,
      venue:       e.venue || '',
      status:      'Completed',
      importBatch: IMPORT_BATCH,
      createdAt:   now,
      updatedAt:   now,
    };

    if (WRITE) {
      const ref = await db.collection('events').add(doc);
      console.log(`  CREATED ${ref.id}: ${e.name} — ${e.date} ($${e.revenue.toLocaleString()})`);
      created++;
    } else {
      console.log(`  WOULD CREATE: ${e.name} — ${e.date} → $${e.revenue.toLocaleString()}`);
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Events: ${EVENTS.length} total · ${created} created · ${skipped} skipped`);
  console.log(`Revenue: $${totalRevenue.toLocaleString()}`);
  if (!WRITE) console.log(`\nRe-run with --write to actually create the docs.`);
  process.exit(0);
}

main().catch(err => { console.error('\nFAILED:', err.message); process.exit(1); });
