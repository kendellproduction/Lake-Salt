/* ═══════════════════════════════════════════════════════════════════════
   DASH-CORE — pure logic for the Dashboard (no DOM, no Firebase)
   ───────────────────────────────────────────────────────────────────────
   Every function here is a pure function of its inputs so it can be unit
   tested in Node (see scripts/test/dash-core.test.js). The rendering layer
   (dashboard.js) maps Firestore snapshots into plain objects and calls these.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ── Business constants ───────────────────────────────────────────────── */
  const BUSINESS_START_YEAR = 2025;          // Lake Salt's first year of events
  const HOME_STATE = 'UT';
  const OFF_BUSINESS_KEYWORDS = [
    'boat', 'jet ski', 'jetski', 'yacht', 'tv', 'television', 'electronics',
    'vacation', 'furniture', 'gaming', 'console', 'playstation', 'xbox',
    'jewelry', 'watch', 'designer', 'casino', 'lottery'
  ];
  const OPEN_STAGES = ['New Lead', 'Expo Email Sent', 'Call Scheduled', 'Contacted', 'Proposal Sent', 'Booked-Tentative'];
  const CLOSED_WON  = ['Booked', 'Completed'];

  /* ── Date helpers ─────────────────────────────────────────────────────── */

  /* Parse either an ISO 'YYYY-MM-DD' or a human 'June 16, 2026' into a local Date.
     ISO strings are parsed component-wise to avoid UTC day-shift. Returns null
     when unparseable. */
  function parseEventDate(str) {
    if (!str) return null;
    if (str instanceof Date) return isNaN(str) ? null : str;
    if (typeof str === 'object' && typeof str.toDate === 'function') return str.toDate();
    const s = String(str).trim();
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  /* The selectable filter options for a given "now". Years run from the
     business start year up to (but not including) the current year, because
     the current year is already covered by YTD. */
  function buildFilterOptions(now) {
    now = now || new Date();
    const opts = [
      { key: 'mtd', label: 'MTD' },
      { key: 'ytd', label: 'YTD' }
    ];
    for (let y = now.getFullYear() - 1; y >= BUSINESS_START_YEAR; y--) {
      opts.push({ key: String(y), label: String(y) });
    }
    opts.push({ key: 'all', label: 'All time' });
    return opts;
  }

  /* Resolve a filter key into {start, end} Date bounds (either may be null
     meaning "unbounded"). `now` is injectable for testing. */
  function getDateRange(filter, now) {
    now = now || new Date();
    const y = now.getFullYear();
    if (filter === 'mtd') return { start: new Date(y, now.getMonth(), 1), end: now };
    if (filter === 'ytd') return { start: new Date(y, 0, 1), end: now };
    if (filter === 'all') return { start: null, end: null };
    if (/^\d{4}$/.test(filter)) {
      const yr = +filter;
      return { start: new Date(yr, 0, 1), end: new Date(yr, 11, 31, 23, 59, 59, 999) };
    }
    // Unknown → default to YTD
    return { start: new Date(y, 0, 1), end: now };
  }

  function inRange(date, range) {
    if (!date) return false;
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  }

  /* ── Math helpers ─────────────────────────────────────────────────────── */
  function median(nums) {
    const arr = nums.filter(n => typeof n === 'number' && !isNaN(n)).slice().sort((a, b) => a - b);
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  }
  function sum(nums) { return nums.reduce((s, n) => s + (Number(n) || 0), 0); }
  function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }

  /* ── Event-type normalization ─────────────────────────────────────────── */
  function eventCategory(eventType) {
    const t = String(eventType || '').toLowerCase();
    if (t.includes('corporate')) return 'Corporate';
    if (t.includes('wedding')) return 'Wedding';
    if (t.includes('private') || t.includes('celebration')) return 'Private';
    if (t.includes('theme')) return 'Themed';
    return 'Other';
  }

  /* ═══════════════════════════════════════════════════════════════════════
     STAT COMPUTATIONS (events / expenses / payments are plain object arrays)
     ═══════════════════════════════════════════════════════════════════════ */

  /* Filter events to a range using their `date` field. */
  function eventsInRange(events, range) {
    return events.filter(e => inRange(parseEventDate(e.date), range));
  }
  function expensesInRange(expenses, range) {
    return expenses.filter(e => inRange(parseEventDate(e.date), range));
  }

  /* Money Made widget + Revenue stat card. */
  function computeMoneyStats(events, range) {
    const inR = eventsInRange(events, range);
    const withRev = inR.filter(e => (e.revenue || 0) > 0);
    const byMonth = new Array(12).fill(0);
    withRev.forEach(e => {
      const d = parseEventDate(e.date);
      if (d) byMonth[d.getMonth()] += (e.revenue || 0);
    });
    return {
      total: sum(withRev.map(e => e.revenue)),
      count: inR.length,
      loggedCount: withRev.length,
      byMonth,
      events: inR
    };
  }

  /* Costs stat card. */
  function computeCosts(expenses, payments, range) {
    const exp = expensesInRange(expenses, range);
    // payments carry an event via eventId; range-filter by their own `date` when present
    const pay = payments.filter(p => !p.date || inRange(parseEventDate(p.date), range));
    return {
      expenses: exp,
      payments: pay,
      expenseTotal: sum(exp.map(e => e.amount)),
      laborTotal: sum(pay.map(p => p.amount)),
      total: sum(exp.map(e => e.amount)) + sum(pay.map(p => p.amount))
    };
  }

  /* Event Size & Profitability widget. */
  function computeProfitability(events, expenses, payments, range) {
    const evs = eventsInRange(events, range).filter(e => (e.revenue || 0) > 0);
    if (!evs.length) return { count: 0, avgGuests: 0, avgRevenue: 0, revPerGuest: 0, avgMargin: 0, byType: {} };

    const guests = evs.filter(e => e.guestCount > 0).map(e => e.guestCount);
    const margins = [];
    const byType = {};

    evs.forEach(e => {
      const exp = sum(expenses.filter(x => x.eventId === e.id).map(x => x.amount));
      const lab = sum(payments.filter(p => p.eventId === e.id).map(p => p.amount));
      const net = (e.revenue || 0) - exp - lab;
      const margin = e.revenue > 0 ? (net / e.revenue) * 100 : 0;
      margins.push(margin);
      const cat = eventCategory(e.eventType);
      if (!byType[cat]) byType[cat] = { count: 0, revenue: 0, marginSum: 0 };
      byType[cat].count++;
      byType[cat].revenue += (e.revenue || 0);
      byType[cat].marginSum += margin;
    });

    Object.keys(byType).forEach(k => { byType[k].avgMargin = Math.round(byType[k].marginSum / byType[k].count); });

    const totalRev = sum(evs.map(e => e.revenue));
    const totalGuests = sum(guests);
    return {
      count: evs.length,
      avgGuests: guests.length ? Math.round(totalGuests / guests.length) : 0,
      avgRevenue: Math.round(totalRev / evs.length),
      revPerGuest: totalGuests > 0 ? Math.round(totalRev / totalGuests) : 0,
      avgMargin: Math.round(margins.reduce((s, m) => s + m, 0) / margins.length),
      byType
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PIPELINE (leads are plain object arrays)
     ═══════════════════════════════════════════════════════════════════════ */

  function leadEventDate(lead) {
    return parseEventDate(lead.eventDate);
  }
  function leadCreatedDate(lead) {
    if (lead.createdAt && typeof lead.createdAt.toDate === 'function') return lead.createdAt.toDate();
    if (lead.createdAt && lead.createdAt.seconds) return new Date(lead.createdAt.seconds * 1000);
    return parseEventDate(lead.createdAt);
  }
  function leadTouchedDate(lead) {
    if (lead.updatedAt && typeof lead.updatedAt.toDate === 'function') return lead.updatedAt.toDate();
    if (lead.updatedAt && lead.updatedAt.seconds) return new Date(lead.updatedAt.seconds * 1000);
    return leadCreatedDate(lead);
  }

  /* Upcoming Events widget: booked leads with a future event date. */
  function computeUpcoming(leads, now) {
    now = now || new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return leads
      .filter(l => ['Booked', 'Booked-Tentative'].includes(l.stage))
      .map(l => ({ lead: l, when: leadEventDate(l) }))
      .filter(x => x.when && x.when >= today)
      .sort((a, b) => a.when - b.when)
      .map(x => {
        const staffed = Array.isArray(x.lead.bartenders) ? x.lead.bartenders.length > 0
                       : !!x.lead.bartender;
        return { ...x.lead, _when: x.when, _staffed: staffed };
      });
  }

  /* Deals to Close widget: open leads, prioritized, with a next action. */
  function prioritizeDeals(leads, now) {
    now = now || new Date();
    const open = leads.filter(l => OPEN_STAGES.includes(l.stage));
    const DAY = 86400000;
    function daysSince(d) { return d ? Math.floor((now - d) / DAY) : 999; }

    return open.map(l => {
      const touched = leadTouchedDate(l);
      const days = daysSince(touched);
      let tier, action;
      if (l.stage === 'Proposal Sent') { tier = 0; action = 'Follow up on proposal'; }
      else if (!l.followUpDate) { tier = 1; action = 'Set a follow-up date'; }
      else if (days >= 7) { tier = 2; action = 'Re-engage — going cold'; }
      else { tier = 3; action = l.stage === 'New Lead' ? 'Make first contact' : 'Keep warm'; }
      return { ...l, _tier: tier, _daysSinceTouch: days, _nextAction: action };
    }).sort((a, b) => (a._tier - b._tier) || (b._daysSinceTouch - a._daysSinceTouch));
  }

  /* Lead Flow widget: by-source counts + stage funnel + conversion. */
  function computeLeadFlow(leads, range) {
    const created = leads.filter(l => inRange(leadCreatedDate(l), range));
    const bySource = {};
    created.forEach(l => {
      const src = l.source || 'Unknown';
      bySource[src] = (bySource[src] || 0) + 1;
    });
    const funnel = {
      New: created.filter(l => ['New Lead', 'Expo Email Sent'].includes(l.stage)).length,
      Contacted: created.filter(l => ['Contacted', 'Call Scheduled'].includes(l.stage)).length,
      Proposal: created.filter(l => l.stage === 'Proposal Sent').length,
      Booked: created.filter(l => ['Booked', 'Booked-Tentative', 'Completed'].includes(l.stage)).length
    };
    const won = created.filter(l => CLOSED_WON.includes(l.stage)).length;
    return { total: created.length, bySource, funnel, conversionPct: pct(won, created.length) };
  }

  /* Open leads count for the stat card (not date-filtered — it's a "now" number). */
  function openLeadsCount(leads) {
    return leads.filter(l => !['Completed', 'Lost'].includes(l.stage)).length;
  }

  /* Single source of truth for the daily sales queue. Explicit actionState
     wins; legacy leads are inferred from stage and follow-up date. */
  function computeActionQueue(leads, now) {
    now = now || new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const due = l => {
      const d = parseEventDate(l.followUpDate);
      return d && d <= today;
    };
    const items = leads.filter(l => !['Lost', 'Completed', 'Booked'].includes(l.stage)).map(l => {
      let state = String(l.actionState || '').trim();
      if (!state) {
        if (l.stage === 'New Lead' || l.stage === 'Expo Email Sent') state = 'Needs Reply';
        else if (l.stage === 'Proposal Sent' && due(l)) state = 'Follow-Up Due';
        else if (l.stage === 'Proposal Sent') state = 'Waiting on Client';
        else if (due(l)) state = 'Follow-Up Due';
        else state = 'Needs Reply';
      }
      const rank = {
        'Needs Kendell': 0,
        'Quote Ready - Needs Price': 1,
        'Needs Reply': 2,
        'Follow-Up Due': 3,
        'Waiting on Client': 4
      }[state];
      return { lead: l, state, rank: rank == null ? 5 : rank };
    });
    return items.sort((a, b) => (a.rank - b.rank) || String(a.lead.eventDate || '').localeCompare(String(b.lead.eventDate || '')));
  }

  /* ═══════════════════════════════════════════════════════════════════════
     WEBSITE ANALYTICS (page_events are plain object arrays)
     ═══════════════════════════════════════════════════════════════════════ */
  function peDate(ev) {
    if (ev.timestamp && typeof ev.timestamp.toDate === 'function') return ev.timestamp.toDate();
    if (ev.timestamp && ev.timestamp.seconds) return new Date(ev.timestamp.seconds * 1000);
    return parseEventDate(ev.timestamp);
  }
  function computeWebsite(pageEvents, range) {
    const inR = pageEvents.filter(ev => inRange(peDate(ev), range));
    const sessions = new Set(inR.map(ev => ev.sessionId).filter(Boolean));
    const pageViews = inR.filter(ev => ev.event === 'page_view');

    const topPages = {};
    pageViews.forEach(ev => { const p = ev.page || '/'; topPages[p] = (topPages[p] || 0) + 1; });

    const sources = {};
    pageViews.forEach(ev => {
      let src = (ev.utm && ev.utm.utm_source) || '';
      if (!src) {
        const ref = ev.referrer || '';
        if (!ref) src = 'Direct';
        else { try { src = new URL(ref).hostname.replace(/^www\./, ''); } catch (e) { src = 'Other'; } }
      }
      sources[src] = (sources[src] || 0) + 1;
    });

    const bookVisits = pageViews.filter(ev => (ev.page || '').includes('book')).length;
    const formStarts = inR.filter(ev =>
      ev.event === 'element_click' && (ev.page || '').includes('book')
    ).length;

    return {
      sessions: sessions.size,
      pageViews: pageViews.length,
      topPages,
      sources,
      funnel: { bookVisits, formStarts }
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     ANOMALY / ALERT DETECTION
     ═══════════════════════════════════════════════════════════════════════ */
  function detectExpenseAnomalies(expenses, opts) {
    opts = opts || {};
    const keywords = opts.keywords || OFF_BUSINESS_KEYWORDS;
    const homeState = (opts.homeState || HOME_STATE).toUpperCase();
    const mult = opts.largeMultiple || 3;
    const med = median(expenses.map(e => e.amount).filter(n => typeof n === 'number'));
    const largeFloor = Math.max(opts.largeFloor || 100, med * mult);

    const out = [];
    expenses.forEach(e => {
      const desc = String(e.description || '').toLowerCase();
      const hit = keywords.find(k => desc.includes(k));
      if (hit) {
        out.push({ id: e.id, type: 'off-business', severity: 'amber',
          summary: `Off-business expense: "${e.description}" (${money(e.amount)}) — matched "${hit}"` });
      }
      if (typeof e.amount === 'number' && e.amount > largeFloor && med > 0) {
        out.push({ id: e.id, type: 'large', severity: 'amber',
          summary: `Unusually large expense: ${money(e.amount)} for "${e.description || 'expense'}" (typical is ~${money(med)})` });
      }
      if (e.state && String(e.state).toUpperCase() !== homeState) {
        out.push({ id: e.id, type: 'out-of-state', severity: 'amber',
          summary: `Out-of-state expense: "${e.description || 'expense'}" in ${String(e.state).toUpperCase()} (${money(e.amount)})` });
      }
    });
    return out;
  }

  function detectActivityAlerts(activityDocs, opts) {
    opts = opts || {};
    const bigDelta = opts.bigDelta || 1000;
    const out = [];
    activityDocs.forEach(a => {
      if (a.action === 'deleted' && ['events', 'leads', 'payments'].includes(a.collection)) {
        out.push({ id: a.id, type: 'deletion', severity: 'red',
          summary: `Deleted from ${a.collection}: ${a.summary || a.docId || ''}`.trim() });
      }
      const m = a.metadata || {};
      if (a.action === 'updated' && ['revenue', 'amount'].includes(m.field) && Math.abs(m.delta || 0) >= bigDelta) {
        out.push({ id: a.id, type: 'money-edit', severity: 'red',
          summary: `Large ${m.field} change (${money(m.delta)}): ${a.summary || ''}`.trim() });
      }
      if (a.action === 'signin' && m.newDevice) {
        out.push({ id: a.id, type: 'signin', severity: 'red',
          summary: `New sign-in from ${m.device || 'an unrecognized device'} (${a.userName || 'unknown'})` });
      }
    });
    return out;
  }

  // local money formatter (rendering layer has its own fmtMoney; keep core self-contained)
  function money(n) {
    if (n === undefined || n === null || n === '') return '$0';
    return '$' + Math.round(Number(n)).toLocaleString('en-US');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     SUGGESTION ENGINE — deterministic, returns one sentence or null
     ═══════════════════════════════════════════════════════════════════════ */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function getSuggestion(type, stats) {
    if (!stats) return null;
    try {
      if (type === 'money') {
        const months = stats.byMonth || [];
        const active = months.map((v, i) => ({ i, v })).filter(x => x.v > 0);
        if (active.length < 2) return null;
        const sorted = active.slice().sort((a, b) => b.v - a.v);
        const top = sorted.slice(0, Math.min(3, sorted.length)).map(x => MONTHS[x.i]);
        const slow = months.map((v, i) => ({ i, v })).filter(x => x.v === 0).map(x => MONTHS[x.i]);
        if (slow.length) return `Your strongest months were ${top.join(', ')}. Push outreach into your quiet months (${slow.slice(0, 3).join(', ')}) to smooth out the year.`;
        return `Your strongest months were ${top.join(', ')} — lean into whatever drove those.`;
      }
      if (type === 'profitability') {
        const types = Object.keys(stats.byType || {});
        if (types.length < 1) return null;
        const ranked = types.map(t => ({ t, m: stats.byType[t].avgMargin })).sort((a, b) => b.m - a.m);
        if (ranked.length >= 2 && ranked[0].m - ranked[ranked.length - 1].m >= 10) {
          return `${ranked[0].t} events run ${ranked[0].m}% margin vs ${ranked[ranked.length - 1].m}% for ${ranked[ranked.length - 1].t} — prioritize ${ranked[0].t} leads.`;
        }
        return `Your average margin is ${stats.avgMargin}% at ${money(stats.revPerGuest)}/guest — use that as your pricing floor.`;
      }
      if (type === 'website') {
        const f = stats.funnel || {};
        if (f.bookVisits >= 20 && f.formStarts / Math.max(f.bookVisits, 1) < 0.1) {
          return `Your booking page got ${f.bookVisits} visits but only ${f.formStarts} form starts — the form is your drop-off point, tighten it.`;
        }
        const srcs = Object.entries(stats.sources || {}).sort((a, b) => b[1] - a[1]);
        if (srcs.length && stats.sessions >= 10) {
          return `${srcs[0][0]} is your biggest traffic source (${srcs[0][1]} views) — make sure it links straight to booking.`;
        }
        return null;
      }
      if (type === 'leadflow') {
        const srcs = Object.entries(stats.bySource || {}).sort((a, b) => b[1] - a[1]);
        if (!srcs.length) return null;
        if (stats.conversionPct > 0) {
          return `${srcs[0][0]} brought the most leads (${srcs[0][1]}). Overall ${stats.conversionPct}% convert to booked — double down on what's working and fix where they stall.`;
        }
        return `${srcs[0][0]} brought the most leads (${srcs[0][1]}) — focus follow-up there.`;
      }
    } catch (e) { return null; }
    return null;
  }

  /* ── Export (browser global + Node) ───────────────────────────────────── */
  const api = {
    BUSINESS_START_YEAR, HOME_STATE, OFF_BUSINESS_KEYWORDS, OPEN_STAGES, CLOSED_WON,
    parseEventDate, buildFilterOptions, getDateRange, inRange,
    median, sum, pct, eventCategory,
    eventsInRange, expensesInRange,
    computeMoneyStats, computeCosts, computeProfitability,
    computeUpcoming, prioritizeDeals, computeLeadFlow, openLeadsCount, computeActionQueue,
    computeWebsite,
    detectExpenseAnomalies, detectActivityAlerts,
    getSuggestion,
    leadEventDate, leadCreatedDate, leadTouchedDate
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DashCore = api;
})(typeof self !== 'undefined' ? self : this);
