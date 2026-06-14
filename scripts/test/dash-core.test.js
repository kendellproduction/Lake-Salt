#!/usr/bin/env node
/* Unit tests for admin/js/dash-core.js — pure logic, no browser/Firebase.
   RUN: node scripts/test/dash-core.test.js  */
const path = require('path');
const C = require(path.join(__dirname, '..', '..', 'website', 'admin', 'js', 'dash-core.js'));

let passed = 0, failed = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}\n     expected ${e}\n     got      ${a}`); }
}
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error(`  ✗ ${msg}`); } }
function group(name, fn) { console.log(`\n${name}`); fn(); }

const NOW = new Date(2026, 5, 14); // Jun 14, 2026

/* ── parseEventDate ── */
group('parseEventDate', () => {
  eq(C.parseEventDate('2026-06-16').getTime(), new Date(2026, 5, 16).getTime(), 'ISO parsed component-wise (no UTC shift)');
  eq(C.parseEventDate('June 16, 2026').getTime(), new Date(2026, 5, 16).getTime(), 'human string parsed');
  ok(C.parseEventDate('') === null, 'empty → null');
  ok(C.parseEventDate('garbage') === null, 'garbage → null');
});

/* ── buildFilterOptions ── */
group('buildFilterOptions', () => {
  eq(C.buildFilterOptions(NOW).map(o => o.key), ['mtd', 'ytd', '2025', 'all'], '2026 shows MTD/YTD/2025/all (no 2024, no 2026 button)');
  eq(C.buildFilterOptions(new Date(2027, 0, 1)).map(o => o.key), ['mtd', 'ytd', '2026', '2025', 'all'], '2027 adds a 2026 button');
});

/* ── getDateRange ── */
group('getDateRange', () => {
  const mtd = C.getDateRange('mtd', NOW);
  eq(mtd.start.getTime(), new Date(2026, 5, 1).getTime(), 'MTD start = month start');
  const ytd = C.getDateRange('ytd', NOW);
  eq(ytd.start.getTime(), new Date(2026, 0, 1).getTime(), 'YTD start = Jan 1');
  const y25 = C.getDateRange('2025', NOW);
  eq(y25.start.getTime(), new Date(2025, 0, 1).getTime(), '2025 start');
  ok(y25.end.getFullYear() === 2025 && y25.end.getMonth() === 11, '2025 end in December');
  const all = C.getDateRange('all', NOW);
  ok(all.start === null && all.end === null, 'all = unbounded');
});

/* ── inRange ── */
group('inRange', () => {
  const r = C.getDateRange('2025', NOW);
  ok(C.inRange(new Date(2025, 6, 1), r) === true, 'mid-2025 in 2025 range');
  ok(C.inRange(new Date(2026, 0, 1), r) === false, '2026 not in 2025 range');
  ok(C.inRange(new Date(2025, 0, 1), C.getDateRange('all', NOW)) === true, 'all range includes everything');
});

/* ── median / eventCategory ── */
group('helpers', () => {
  eq(C.median([1, 2, 3]), 2, 'median odd');
  eq(C.median([1, 2, 3, 4]), 2.5, 'median even');
  eq(C.median([]), 0, 'median empty');
  eq(C.eventCategory('Corporate Event'), 'Corporate', 'corporate category');
  eq(C.eventCategory('Private Celebration'), 'Private', 'private category');
});

/* ── computeMoneyStats ── */
group('computeMoneyStats', () => {
  const events = [
    { id: 'a', date: '2026-02-09', revenue: 2500 },
    { id: 'b', date: '2026-06-09', revenue: 3200 },
    { id: 'c', date: '2025-12-09', revenue: 11500 },
    { id: 'd', date: '2026-06-16', revenue: 0 }
  ];
  const ytd = C.computeMoneyStats(events, C.getDateRange('ytd', NOW));
  eq(ytd.total, 5700, 'YTD revenue = 2500+3200 (2026 only, excludes $0)');
  eq(ytd.count, 2, 'YTD event count = 2 (Jun 16 is future vs NOW=Jun 14, correctly excluded)');
  eq(ytd.loggedCount, 2, 'YTD logged (revenue>0) = 2');
  eq(ytd.byMonth[5], 3200, 'June bucket = 3200');
  const all = C.computeMoneyStats(events, C.getDateRange('all', NOW));
  eq(all.total, 17200, 'All-time revenue = 17200');
});

/* ── computeProfitability ── */
group('computeProfitability', () => {
  const events = [
    { id: 'corp1', date: '2026-03-01', revenue: 2000, guestCount: 100, eventType: 'Corporate Event' },
    { id: 'priv1', date: '2026-03-02', revenue: 1000, guestCount: 50, eventType: 'Private Celebration' }
  ];
  const expenses = [{ eventId: 'corp1', amount: 200 }, { eventId: 'priv1', amount: 400 }];
  const payments = [{ eventId: 'corp1', amount: 300 }, { eventId: 'priv1', amount: 100 }];
  const p = C.computeProfitability(events, expenses, payments, C.getDateRange('all', NOW));
  eq(p.count, 2, 'two profitable events');
  eq(p.avgGuests, 75, 'avg guests = (100+50)/2');
  eq(p.revPerGuest, 20, 'rev/guest = 3000/150');
  eq(p.byType.Corporate.avgMargin, 75, 'corp margin = (2000-500)/2000 = 75%');
  eq(p.byType.Private.avgMargin, 50, 'private margin = (1000-500)/1000 = 50%');
});

/* ── computeUpcoming ── */
group('computeUpcoming', () => {
  const leads = [
    { id: '1', name: 'Min Scarleta', stage: 'Booked', eventDate: 'June 16, 2026' },
    { id: '2', name: 'Past', stage: 'Booked', eventDate: 'January 1, 2026' },
    { id: '3', name: 'Open', stage: 'New Lead', eventDate: 'August 1, 2026' },
    { id: '4', name: 'Tentative', stage: 'Booked-Tentative', eventDate: 'July 1, 2026', bartenders: ['x'] }
  ];
  const up = C.computeUpcoming(leads, NOW);
  eq(up.map(l => l.name), ['Min Scarleta', 'Tentative'], 'only future booked, soonest first');
  eq(up[1]._staffed, true, 'tentative is staffed (has bartenders)');
  eq(up[0]._staffed, false, 'min scarleta not staffed');
});

/* ── prioritizeDeals ── */
group('prioritizeDeals', () => {
  const leads = [
    { id: '1', name: 'Proposal', stage: 'Proposal Sent', updatedAt: { seconds: Math.floor(new Date(2026, 5, 1) / 1000) } },
    { id: '2', name: 'NoFollow', stage: 'Contacted', updatedAt: { seconds: Math.floor(new Date(2026, 5, 13) / 1000) } },
    { id: '3', name: 'Won', stage: 'Booked' }
  ];
  const d = C.prioritizeDeals(leads, NOW);
  ok(!d.find(x => x.name === 'Won'), 'booked excluded from deals');
  eq(d[0].name, 'Proposal', 'proposal sent surfaces first (tier 0)');
  eq(d[0]._nextAction, 'Follow up on proposal', 'proposal next action');
  eq(d[1]._nextAction, 'Set a follow-up date', 'no follow-up date action');
});

/* ── computeLeadFlow ── */
group('computeLeadFlow', () => {
  const mk = (m, d) => ({ seconds: Math.floor(new Date(2026, m, d) / 1000) });
  const leads = [
    { id: '1', source: 'Referral', stage: 'Booked', createdAt: mk(5, 1) },
    { id: '2', source: 'Referral', stage: 'New Lead', createdAt: mk(5, 2) },
    { id: '3', source: 'Expo', stage: 'Proposal Sent', createdAt: mk(5, 3) },
    { id: '4', source: 'Expo', stage: 'New Lead', createdAt: mk(1, 1, 2025) } // old, out of MTD
  ];
  const flow = C.computeLeadFlow(leads, C.getDateRange('mtd', NOW));
  eq(flow.total, 3, 'MTD leads = 3 (June only)');
  eq(flow.bySource, { Referral: 2, Expo: 1 }, 'by source counts');
  eq(flow.conversionPct, 33, '1 of 3 booked = 33%');
});

/* ── detectExpenseAnomalies ── */
group('detectExpenseAnomalies', () => {
  const expenses = [
    { id: 'e1', description: 'Liquor restock', amount: 200 },
    { id: 'e2', description: 'New Boat for fun', amount: 5000 },
    { id: 'e3', description: 'Ice', amount: 30, state: 'CA' },
    { id: 'e4', description: 'Normal', amount: 250 }
  ];
  const a = C.detectExpenseAnomalies(expenses, {});
  ok(a.find(x => x.id === 'e2' && x.type === 'off-business'), 'boat flagged off-business');
  ok(a.find(x => x.id === 'e2' && x.type === 'large'), 'boat also flagged large');
  ok(a.find(x => x.id === 'e3' && x.type === 'out-of-state'), 'CA flagged out-of-state');
  ok(!a.find(x => x.id === 'e1'), 'normal expense not flagged');
});

/* ── detectActivityAlerts ── */
group('detectActivityAlerts', () => {
  const acts = [
    { id: 'a1', action: 'deleted', collection: 'events', summary: 'Adobe event' },
    { id: 'a2', action: 'updated', collection: 'events', metadata: { field: 'revenue', delta: 5000 }, summary: 'rev bump' },
    { id: 'a3', action: 'signin', userName: 'Kendell', metadata: { newDevice: true, device: 'iPhone' } },
    { id: 'a4', action: 'created', collection: 'leads', summary: 'normal' }
  ];
  const al = C.detectActivityAlerts(acts, {});
  eq(al.length, 3, 'three alerts (deletion, money-edit, signin); created ignored');
  ok(al.find(x => x.type === 'deletion'), 'deletion detected');
  ok(al.find(x => x.type === 'money-edit'), 'money-edit detected');
  ok(al.find(x => x.type === 'signin'), 'signin detected');
});

/* ── getSuggestion ── */
group('getSuggestion', () => {
  ok(C.getSuggestion('money', { byMonth: [0, 0, 0, 0, 0, 3000, 0, 5000, 0, 0, 0, 2000] }).includes('strongest'), 'money suggestion mentions strongest months');
  ok(C.getSuggestion('money', { byMonth: new Array(12).fill(0) }) === null, 'money: no data → null');
  ok(C.getSuggestion('profitability', { avgMargin: 60, revPerGuest: 20, byType: { Corporate: { avgMargin: 75 }, Private: { avgMargin: 50 } } }).includes('Corporate'), 'profitability recommends corporate');
  ok(C.getSuggestion('leadflow', { bySource: { Referral: 5, Expo: 2 }, conversionPct: 40 }).includes('Referral'), 'leadflow names top source');
  ok(C.getSuggestion('website', { funnel: { bookVisits: 100, formStarts: 3 }, sessions: 50, sources: {} }).includes('drop-off'), 'website detects funnel drop-off');
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`${passed} passed · ${failed} failed`);
process.exit(failed ? 1 : 0);
