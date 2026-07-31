#!/usr/bin/env node
/**
 * scripts/import-2025-events.js
 * ─────────────────────────────
 * ONE-TIME: imports the 13 historical 2025 Lake Salt events into the CRM
 * `leads` collection as Completed records. Uses the Admin SDK (bypasses
 * Firestore security rules).
 *
 * RUN: from the project root
 *   node scripts/import-2025-events.js          # dry run (prints, writes nothing)
 *   node scripts/import-2025-events.js --write   # actually creates the 13 docs
 *
 * Safe to re-run: it tags every doc with importBatch and SKIPS creating a
 * record if one with the same (name + eventDate + importBatch) already exists,
 * so a second run won't duplicate.
 *
 * After it succeeds, delete this file.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const IMPORT_BATCH = '2025-events-v1';

const EVENTS = [
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'June 22, 2025', guestCount: '300', budget: 2300, note: '2025 event — Adobe 1st Event (3 staff, 2 hrs). Revenue $2,300 · Net profit $200. Imported from 2025 summary.' },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'August 26, 2025', guestCount: '900', budget: 7044, note: '2025 event — Adobe Oktoberfest (7 staff, 3 hrs). Revenue $7,044 · Net profit $3,044. Imported from 2025 summary.' },
  { name: 'Anshu', eventType: 'Private Celebration', eventDate: 'September 6, 2025', guestCount: '60', budget: 632, note: "2025 event — Anshu's Summer Party (1 staff, 4 hrs). Revenue $631.58 · Net profit $331.58. Imported from 2025 summary." },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'September 10, 2025', guestCount: '', budget: 1800, note: '2025 event — Adobe Sangria Event (2 staff, 2 hrs). Revenue $1,800 · Net profit $1,100. Imported from 2025 summary.' },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'September 16, 2025', guestCount: '200', budget: 2500, note: '2025 event — Adobe Summer Bonfire (3 staff, 2 hrs). Revenue $2,500 · Net profit $1,700. Imported from 2025 summary.' },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'September 17, 2025', guestCount: '175', budget: 1600, note: '2025 event — Adobe WF Happy Hour 1 (2 staff, 2 hrs). Revenue $1,600 · Net profit $1,000. Imported from 2025 summary.' },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'October 6, 2025', guestCount: '15', budget: 900, note: '2025 event — Adobe WF 15-Person Happy Hour (1 staff, 1 hr). Revenue $900 · Net profit $700. Imported from 2025 summary.' },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'October 7, 2025', guestCount: '200', budget: 2500, note: '2025 event — Adobe Art Night (3 staff, 2 hrs). Revenue $2,500 · Net profit $1,700. Imported from 2025 summary.' },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'October 8, 2025', guestCount: '100', budget: 2000, note: '2025 event — Adobe WF Happy Hour 2 (2 staff, 2 hrs). Revenue $2,000 · Net profit $1,500. Imported from 2025 summary.' },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'November 12, 2025', guestCount: '100', budget: 1400, note: '2025 event — Adobe Happy Hour (November) (2 hrs). Revenue $1,400 · Net profit $1,100. Imported from 2025 summary.' },
  { name: 'Adobe', eventType: 'Corporate Event', eventDate: 'November 13, 2025', guestCount: '300', budget: 2500, note: '2025 event — Adobe Hola x Escape Event (3 staff, 2 hrs). Revenue $2,500 · Net profit $2,200. Imported from 2025 summary.' },
  { name: 'Adobe / Eight Fifty South', eventType: 'Corporate Event', eventDate: 'December 9, 2025', guestCount: '1200', budget: 11500, venue: 'Eight Fifty South', note: '2025 event — Adobe Christmas Event (3 invoices, 3 hrs). Revenue $11,500 · Net profit $5,500. Imported from 2025 summary.' },
  { name: 'Kendall Rodriguez', eventType: 'Private Celebration', eventDate: 'December 12, 2025', guestCount: '60', budget: 615, note: '2025 event — Queen of SLC Private Event (2 staff, 4 hrs). Revenue $615 · Net profit $215. Imported from 2025 summary.' },
];

function fmtTime(d) {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${mon} ${d.getDate()}, ${h}:${m} ${ap}`;
}

async function main() {
  const WRITE = process.argv.includes('--write');
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'lake-salt' });
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const timeStr = fmtTime(new Date());

  console.log(`\n${WRITE ? 'WRITING' : 'DRY RUN'} — ${EVENTS.length} events → leads collection (project: lake-salt)\n`);

  let created = 0, skipped = 0, revenue = 0;
  for (const e of EVENTS) {
    revenue += e.budget;
    // Dedup guard: skip if a same-batch record with this name+date already exists.
    const dupe = await db.collection('leads')
      .where('importBatch', '==', IMPORT_BATCH)
      .where('name', '==', e.name)
      .where('eventDate', '==', e.eventDate)
      .limit(1).get();
    if (!dupe.empty) {
      console.log(`  SKIP (exists): ${e.name} — ${e.eventDate}`);
      skipped++;
      continue;
    }
    const doc = {
      name: e.name,
      email: '',
      phone: '',
      eventType: e.eventType,
      eventDate: e.eventDate,
      guestCount: e.guestCount || '',
      venue: e.venue || '',
      budget: e.budget,
      source: 'Referral',
      priority: 'Normal',
      stage: 'Completed',
      followUpDate: '',
      message: e.note,
      notes: [{ text: e.note, author: 'Import', time: timeStr }],
      tasks: [],
      importBatch: IMPORT_BATCH,
      createdAt: now,
      updatedAt: now,
    };
    if (WRITE) {
      const ref = await db.collection('leads').add(doc);
      console.log(`  CREATED ${ref.id}: ${e.name} — ${e.eventDate} ($${e.budget})`);
      created++;
    } else {
      console.log(`  WOULD CREATE: ${e.name} — ${e.eventDate} ($${e.budget})`);
    }
  }

  console.log(`\nTotal revenue across ${EVENTS.length} events: $${revenue.toLocaleString()}`);
  if (WRITE) console.log(`Created: ${created} · Skipped (already existed): ${skipped}`);
  else console.log(`(dry run — nothing written. Re-run with --write to create.)`);
  process.exit(0);
}

main().catch(err => { console.error('\nIMPORT FAILED:', err.message); process.exit(1); });
