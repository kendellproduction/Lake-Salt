/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD — the cockpit. Renders on top of pure logic in dash-core.js.
   Layout (top → bottom):
     1. Alerts strip (only when flagged)
     2. Date filter + clickable stat cards
     3. Action row    — Upcoming Events · Deals to Close · Lead Flow
     4. Insight row    — Money Made · Profitability · Website Analytics
   ═══════════════════════════════════════════════════════════════════════ */

const DASH_FILTER_KEY = 'ls_dash_filter';
const DASH_DISMISS_KEY = 'ls_dash_dismissed_alerts';
const DASH_PREFS_KEY = 'dashboardPrefs';

/* ═══════════════════════════════════════════════════════════════════════
   WIDGET FRAMEWORK — self-describing registry. The dashboard renders only
   enabled widgets, in the user's order, at the user's chosen size. Prefs
   live in localStorage (`dashboardPrefs`) and mirror to Firestore
   users/{uid}/prefs/dashboard so they follow Kendell across devices.
   Existing render*Widget internals are untouched — each entry just wraps
   one and points at the card body element it already targets.
   ═══════════════════════════════════════════════════════════════════════ */
const WIDGETS = [
  { id: 'agentBrief', title: '🤖 Agent Brief', elId: 'w-agent-brief',
    defaultOn: true, defaultOrder: 0, sizes: ['sm', 'md', 'lg'],
    render(now, range) { if (typeof renderAgentBriefWidget === 'function') renderAgentBriefWidget(_dashData, now); } },
  { id: 'upcoming', title: '📅 Upcoming Events', elId: 'w-upcoming',
    defaultOn: true, defaultOrder: 10, sizes: ['sm', 'md', 'lg'],
    render(now, range) { renderUpcomingWidget(now); } },
  { id: 'deals', title: '🎯 Deals to Close', elId: 'w-deals',
    defaultOn: true, defaultOrder: 20, sizes: ['sm', 'md', 'lg'],
    render(now, range) { renderDealsWidget(now); } },
  { id: 'leadflow', title: '📈 Lead Flow', elId: 'w-leadflow',
    defaultOn: true, defaultOrder: 30, sizes: ['sm', 'md', 'lg'],
    render(now, range) { renderLeadFlowWidget(range); } },
  { id: 'money', title: '💰 Money Made', elId: 'w-money',
    defaultOn: true, defaultOrder: 40, sizes: ['sm', 'md', 'lg'],
    render(now, range) { renderMoneyWidget(range); } },
  { id: 'profit', title: '⚖️ Event Size & Profitability', elId: 'w-profit',
    defaultOn: true, defaultOrder: 50, sizes: ['sm', 'md', 'lg'],
    render(now, range) { renderProfitWidget(range); } },
  { id: 'web', title: '🌐 Website Analytics', elId: 'w-web',
    defaultOn: true, defaultOrder: 60, sizes: ['sm', 'md', 'lg'],
    render(now, range) { renderWebWidget(range); } },
  { id: 'cohort', title: '🎪 Wedding Expo Cohort — Funnel', elId: 'w-cohort',
    defaultOn: true, defaultOrder: 70, sizes: ['sm', 'md', 'lg'],
    render(now, range) { renderCohortFunnelWidget(); } }
];

let _customizeMode = false;

function defaultDashPrefs() {
  const sorted = WIDGETS.slice().sort((a, b) => a.defaultOrder - b.defaultOrder);
  const enabled = {};
  sorted.forEach(w => { enabled[w.id] = !!w.defaultOn; });
  return { enabled, order: sorted.map(w => w.id), sizes: {}, widgetSettings: {} };
}

/* Read prefs from localStorage and normalize: drop unknown widget ids,
   append any newly-registered widgets at the end at their default state. */
function getDashPrefs() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(DASH_PREFS_KEY) || 'null'); } catch (e) { p = null; }
  const def = defaultDashPrefs();
  if (!p || typeof p !== 'object') return def;
  const known = WIDGETS.map(w => w.id);
  const order = (Array.isArray(p.order) ? p.order : []).filter(id => known.includes(id));
  def.order.forEach(id => { if (!order.includes(id)) order.push(id); });
  const enabled = {};
  known.forEach(id => {
    enabled[id] = (p.enabled && typeof p.enabled[id] === 'boolean') ? p.enabled[id] : def.enabled[id];
  });
  const sizes = {};
  known.forEach(id => {
    const w = WIDGETS.find(x => x.id === id);
    if (p.sizes && w.sizes.includes(p.sizes[id])) sizes[id] = p.sizes[id];
  });
  return { enabled, order, sizes, widgetSettings: (p.widgetSettings && typeof p.widgetSettings === 'object') ? p.widgetSettings : {} };
}

function saveDashPrefs(prefs) {
  try { localStorage.setItem(DASH_PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* storage full/blocked */ }
  // Mirror to Firestore so prefs follow across devices. Own-doc only.
  try {
    if (typeof currentUser !== 'undefined' && currentUser?.uid) {
      db.collection('users').doc(currentUser.uid).collection('prefs').doc('dashboard')
        .set({ ...prefs, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: false })
        .catch(() => {});
    }
  } catch (e) { /* offline — localStorage copy still wins locally */ }
}

/* Pull the Firestore mirror once per dashboard load (newer device wins by
   simply adopting whatever the cloud copy says, if one exists). */
async function loadRemoteDashPrefs() {
  try {
    if (typeof currentUser === 'undefined' || !currentUser?.uid) return;
    const snap = await db.collection('users').doc(currentUser.uid).collection('prefs').doc('dashboard').get();
    if (snap.exists) {
      const { updatedAt, ...prefs } = snap.data() || {};
      localStorage.setItem(DASH_PREFS_KEY, JSON.stringify(prefs));
    }
  } catch (e) { /* rules not deployed yet or offline — local prefs are fine */ }
}

function widgetSize(prefs, w) { return prefs.sizes[w.id] || 'md'; }

/* Build the card shells for enabled widgets, in order, at size. */
function renderWidgetGrid() {
  const grid = document.getElementById('dash-widgets');
  if (!grid) return;
  const prefs = getDashPrefs();
  grid.innerHTML = prefs.order
    .filter(id => prefs.enabled[id])
    .map(id => {
      const w = WIDGETS.find(x => x.id === id);
      if (!w) return '';
      return `<div class="card dash-widget dash-size-${widgetSize(prefs, w)}" data-widget="${w.id}">
        <div class="card-header"><span class="card-title">${w.title}</span></div>
        <div id="${w.elId}">Loading…</div>
      </div>`;
    }).join('');
}

/* ── Customize mode: on/off switches + ↑/↓ reorder + size + reset ─────── */
function toggleCustomizeMode() {
  _customizeMode = !_customizeMode;
  renderCustomizePanel();
  const btn = document.getElementById('dash-customize-btn');
  if (btn) btn.textContent = _customizeMode ? '✓ Done' : '⚙️ Customize';
}
window.toggleCustomizeMode = toggleCustomizeMode;

function renderCustomizePanel() {
  const el = document.getElementById('dash-customize');
  if (!el) return;
  if (!_customizeMode) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = '';
  const prefs = getDashPrefs();
  el.innerHTML = `
    <div class="customize-head">
      <span class="dash-sub-label" style="margin:0">CUSTOMIZE YOUR FEED</span>
      <button type="button" class="customize-reset" onclick="resetDashPrefs()">Reset to default</button>
    </div>
    ${prefs.order.map((id, i) => {
      const w = WIDGETS.find(x => x.id === id);
      if (!w) return '';
      const on = !!prefs.enabled[id];
      const size = widgetSize(prefs, w);
      return `<div class="customize-row${on ? '' : ' customize-row-off'}">
        <div class="customize-move">
          <button type="button" class="customize-btn" onclick="moveDashWidget('${w.id}',-1)" ${i === 0 ? 'disabled' : ''} aria-label="Move ${w.title} up">↑</button>
          <button type="button" class="customize-btn" onclick="moveDashWidget('${w.id}',1)" ${i === prefs.order.length - 1 ? 'disabled' : ''} aria-label="Move ${w.title} down">↓</button>
        </div>
        <span class="customize-title">${w.title}</span>
        <div class="customize-sizes">
          ${w.sizes.map(s => `<button type="button" class="customize-size${s === size ? ' active' : ''}" onclick="setDashWidgetSize('${w.id}','${s}')">${s}</button>`).join('')}
        </div>
        <button type="button" class="customize-switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="Toggle ${w.title}" onclick="toggleDashWidget('${w.id}')"><span class="customize-knob"></span></button>
      </div>`;
    }).join('')}`;
}

function applyPrefsChange(mutate) {
  const prefs = getDashPrefs();
  mutate(prefs);
  saveDashPrefs(prefs);
  renderCustomizePanel();
  renderWidgetGrid();
  renderAll();
}
function toggleDashWidget(id) { applyPrefsChange(p => { p.enabled[id] = !p.enabled[id]; }); }
function moveDashWidget(id, dir) {
  applyPrefsChange(p => {
    const i = p.order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.order.length) return;
    [p.order[i], p.order[j]] = [p.order[j], p.order[i]];
  });
}
function setDashWidgetSize(id, size) { applyPrefsChange(p => { p.sizes[id] = size; }); }
function resetDashPrefs() { applyPrefsChange(p => { Object.assign(p, defaultDashPrefs()); }); }
window.toggleDashWidget = toggleDashWidget;
window.moveDashWidget = moveDashWidget;
window.setDashWidgetSize = setDashWidgetSize;
window.resetDashPrefs = resetDashPrefs;

/* Snapshot of fetched data, kept so the filter can re-render without re-fetching. */
let _dashData = null;

function getActiveFilter() {
  const saved = localStorage.getItem(DASH_FILTER_KEY);
  const valid = DashCore.buildFilterOptions(new Date()).map(o => o.key);
  return valid.includes(saved) ? saved : 'ytd';
}
function setActiveFilter(key) {
  localStorage.setItem(DASH_FILTER_KEY, key);
}

function getDismissedAlerts() {
  try { return JSON.parse(localStorage.getItem(DASH_DISMISS_KEY) || '[]'); }
  catch (e) { return []; }
}
function dismissAlert(id) {
  const d = getDismissedAlerts();
  if (!d.includes(id)) { d.push(id); localStorage.setItem(DASH_DISMISS_KEY, JSON.stringify(d)); }
  const el = document.querySelector(`[data-alert-id="${id}"]`);
  if (el) el.remove();
  const strip = document.getElementById('dash-alerts');
  if (strip && !strip.querySelector('.dash-alert-row')) strip.innerHTML = '';
}
window.dismissAlert = dismissAlert;

async function renderDashboard() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">Welcome back, ${currentUser?.displayName?.split(' ')[0] || 'Kendell'}</div>
      </div>
      <button type="button" id="dash-customize-btn" class="dash-customize-toggle" onclick="toggleCustomizeMode()">⚙️ Customize</button>
    </div>
    <div id="dash-customize" class="dash-customize-panel" style="display:none"></div>
    <div id="upcoming-calls"></div>
    <div id="dash-alerts" style="margin-bottom:16px"></div>
    <div id="quick-actions"></div>
    <div class="card" id="action-queue" style="margin-bottom:16px"><div class="card-header"><span class="card-title">Action Queue</span><span class="card-subtitle">What needs attention next</span></div><div id="w-action-queue">Loading…</div></div>
    <div id="dash-filter" class="dash-filter"></div>
    <div class="stat-grid" id="dash-stats">
      ${[1,2,3,4,5].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="dash-widget-grid" id="dash-widgets"></div>`;

  renderWidgetGrid();

  // Fetch everything in parallel
  const nowTs = firebase.firestore.Timestamp.now();
  const [leadsSnap, eventsSnap, expensesSnap, paymentsSnap, bartSnap, activitySnap, callsSnap, pageSnap, followupsSnap, unmatchedSnap] = await Promise.all([
    db.collection('leads').get(),
    db.collection('events').get(),
    db.collection('expenses').get(),
    db.collection('payments').get(),
    db.collection('bartenders').where('status','==','Active').get(),
    db.collection('activity').orderBy('createdAt','desc').limit(50).get(),
    db.collection('call_bookings').where('slotStart', '>=', nowTs).orderBy('slotStart', 'asc').limit(5).get(),
    db.collection('page_events').orderBy('timestamp','desc').limit(2000).get().catch(()=>({docs:[]})),
    db.collection('kendell_followups').where('status','==','open').get().catch(()=>({docs:[]})),
    db.collection('unmatched_messages').where('resolved','==',false).limit(25).get().catch(()=>({docs:[]}))
  ]);

  renderUpcomingCalls(callsSnap);

  // Map snapshots → plain objects once
  _dashData = {
    leads:    leadsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    events:   eventsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    expenses: expensesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    payments: paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    activity: activitySnap.docs.map(d => ({ id: d.id, ...d.data() })),
    pageEvents: (pageSnap.docs || []).map(d => ({ id: d.id, ...d.data() })),
    followups: (followupsSnap.docs || []).map(d => ({ id: d.id, ...d.data() })),
    unmatched: (unmatchedSnap.docs || []).map(d => ({ id: d.id, ...d.data() })),
    bartenders: bartSnap.size
  };

  // Adopt cloud prefs (cross-device), then rebuild the grid if they differ.
  await loadRemoteDashPrefs();
  renderWidgetGrid();

  renderFilter();
  renderAlerts();
  renderAll();
  if (typeof initQuickScanWidget === 'function') initQuickScanWidget();
}

/* ── Date filter control ──────────────────────────────────────────────── */
function renderFilter() {
  const el = document.getElementById('dash-filter');
  const active = getActiveFilter();
  el.innerHTML = DashCore.buildFilterOptions(new Date()).map(o =>
    `<button type="button" class="dash-filter-chip${o.key === active ? ' active' : ''}" data-filter="${o.key}">${o.label}</button>`
  ).join('');
  el.querySelectorAll('.dash-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveFilter(btn.dataset.filter);
      renderFilter();
      renderAll();
    });
  });
}

/* ── Re-render every stat + widget for the active range (no re-fetch) ──── */
function renderAll() {
  if (!_dashData) return;
  const now = new Date();
  const range = DashCore.getDateRange(getActiveFilter(), now);
  renderStats(range, now);
  renderActionQueue(now);
  // Registered widgets: only enabled ones render (their cards are the only
  // ones in the DOM — see renderWidgetGrid), in the user's order.
  const prefs = getDashPrefs();
  prefs.order.filter(id => prefs.enabled[id]).forEach(id => {
    const w = WIDGETS.find(x => x.id === id);
    if (!w) return;
    try { w.render(now, range); } catch (e) { console.error('widget ' + id + ' failed', e); }
  });
}

function renderActionQueue(now) {
  const el = document.getElementById('w-action-queue');
  if (!el) return;
  const items = DashCore.computeActionQueue(_dashData.leads || [], now).slice(0, 8);
  if (!items.length) { el.innerHTML = emptyState('✓', 'No open lead actions'); return; }
  const styles = {
    'Needs Kendell': ['var(--red)', 'Your review'],
    'Quote Ready - Needs Price': ['var(--gold)', 'Price review'],
    'Needs Reply': ['var(--blue)', 'Reply'],
    'Follow-Up Due': ['var(--gold)', 'Follow up'],
    'Waiting on Client': ['var(--text-muted)', 'Waiting']
  };
  el.innerHTML = items.map(({ lead, state }) => {
    const [color, label] = styles[state] || ['var(--text-muted)', state];
    const name = escapeHtmlSafe(lead.name || lead.email || 'Unnamed lead');
    const detail = escapeHtmlSafe([lead.eventType, lead.eventDate, lead.venue].filter(Boolean).join(' · '));
    return `<button type="button" class="dash-list-row" style="width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--border);cursor:pointer" data-lead-id="${escapeHtmlSafe(lead.id)}">
      <div class="dash-row-main"><span class="dash-row-title">${name}</span><span class="dash-row-sub">${detail || 'Lead details'}</span></div>
      <span class="badge" style="color:${color};background:${color}22">${escapeHtmlSafe(label)}</span></button>`;
  }).join('');
  bindLeadOpenClicks(el);
}

/* Lead ids can be client-chosen (public create on /leads), so never interpolate
   them into inline onclick handlers — bind via data attribute instead. */
function bindLeadOpenClicks(container) {
  container.querySelectorAll('[data-lead-id]').forEach(btn => {
    btn.addEventListener('click', () => openLeadFromDash(btn.dataset.leadId));
  });
}

/* ── Insight widget: Wedding Expo cohort funnel ───────────────────────────
 * Rolls the 90 expo leads up into a conversion funnel + booked revenue, so the
 * cohort's performance is visible on the dashboard (not just filtered in CRM). */
function renderCohortFunnelWidget() {
  const el = document.getElementById('w-cohort');
  if (!el) return;
  const COHORT = 'WeddingExpo2026-05-09';
  const stageOrder = ['New Lead','Expo Email Sent','Call Scheduled','Contacted','Proposal Sent','Booked-Tentative','Booked','Completed','Lost'];
  const idx = s => stageOrder.indexOf(s || 'New Lead');

  const leads = (_dashData.leads || []).filter(l => l.campaign === COHORT);
  if (!leads.length) { el.innerHTML = emptyState('🎪', 'No expo-cohort leads yet'); return; }

  const total     = leads.length;
  const contacted = leads.filter(l => l.stage !== 'Lost' && idx(l.stage) >= idx('Contacted')).length;
  const proposal  = leads.filter(l => l.stage !== 'Lost' && idx(l.stage) >= idx('Proposal Sent')).length;
  const bookedSet = leads.filter(l => ['Booked','Completed'].includes(l.stage));
  const booked    = bookedSet.length;
  const lost      = leads.filter(l => l.stage === 'Lost').length;
  const revenue   = bookedSet.reduce((s,l) => s + (l.latestQuoteTotal || 0), 0);

  const bar = (label, n) => {
    const pct = total ? Math.round(n / total * 100) : 0;
    return `<div class="dash-bar-row"><span class="dash-bar-label">${label}</span>
      <span class="dash-bar"><span class="dash-bar-fill" style="width:${pct}%"></span></span>
      <span class="dash-bar-val">${n} · ${pct}%</span></div>`;
  };
  el.innerHTML = `
    ${bar('Captured', total)}
    ${bar('Contacted+', contacted)}
    ${bar('Proposal sent+', proposal)}
    ${bar('Booked', booked)}
    <div class="dash-list-row" style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.08);padding-top:8px">
      <div class="dash-row-main"><span class="dash-row-title">💰 Booked revenue</span>
        <span class="dash-row-sub">${lost} lost · ${total - contacted - lost} not yet worked</span></div>
      <span class="badge" style="background:var(--gold)22;color:var(--gold)">$${Math.round(revenue).toLocaleString('en-US')}</span>
    </div>`;
}

/* ── Stat cards (clickable) ───────────────────────────────────────────── */
function renderStats(range, now) {
  const d = _dashData;
  const money = DashCore.computeMoneyStats(d.events, range);
  const costs = DashCore.computeCosts(d.expenses, d.payments, range);
  const netProfit = money.total - costs.total;
  const openLeads = DashCore.openLeadsCount(d.leads);

  document.getElementById('dash-stats').innerHTML = `
    <button type="button" class="stat-card gold clickable" onclick="openStatDrill('revenue')">
      <div class="stat-label">Revenue <span class="stat-view">↗</span></div>
      <div class="stat-value">${fmtMoney(money.total)}</div>
      <div class="stat-sub">${money.loggedCount} of ${money.count} events logged</div></button>
    <button type="button" class="stat-card red clickable" onclick="openStatDrill('costs')">
      <div class="stat-label">Costs <span class="stat-view">↗</span></div>
      <div class="stat-value">${fmtMoney(costs.total)}</div>
      <div class="stat-sub">${costs.expenses.length} expenses · ${costs.payments.length} labor</div></button>
    <button type="button" class="stat-card clickable" style="border-left:3px solid ${netProfit>=0?'var(--green)':'var(--red)'}" onclick="openStatDrill('profit')">
      <div class="stat-label">Net Profit <span class="stat-view">↗</span></div>
      <div class="stat-value" style="color:${netProfit>=0?'var(--green)':'var(--red)'}">${fmtMoney(netProfit)}</div>
      <div class="stat-sub">revenue − costs</div></button>
    <button type="button" class="stat-card teal clickable" onclick="openStatDrill('leads')">
      <div class="stat-label">Open Leads <span class="stat-view">↗</span></div>
      <div class="stat-value">${openLeads}</div>
      <div class="stat-sub">${d.leads.length} total leads</div></button>
    <button type="button" class="stat-card clickable" onclick="loadModule('bartenders')">
      <div class="stat-label">Active Bartenders <span class="stat-view">↗</span></div>
      <div class="stat-value">${d.bartenders}</div>
      <div class="stat-sub">view team</div></button>`;
}

/* ── Stat drill-down modals ───────────────────────────────────────────── */
function openStatDrill(type) {
  const now = new Date();
  const range = DashCore.getDateRange(getActiveFilter(), now);
  const d = _dashData;
  const label = DashCore.buildFilterOptions(now).find(o => o.key === getActiveFilter())?.label || '';

  if (type === 'leads') { loadModule('crm'); return; }

  if (type === 'revenue') {
    const m = DashCore.computeMoneyStats(d.events, range);
    const rows = m.events.filter(e => e.revenue > 0)
      .sort((a,b) => (b.revenue||0) - (a.revenue||0))
      .map(e => `<tr><td>${escapeHtmlSafe(e.name||'—')}</td><td class="text-muted">${escapeHtmlSafe(e.date||'')}</td><td style="text-align:right;color:var(--green);font-weight:600">${fmtMoney(e.revenue)}</td></tr>`).join('');
    openModal(`Revenue · ${label}`, `
      <div class="table-wrap"><table>
        <thead><tr><th>Event</th><th>Date</th><th style="text-align:right">Revenue</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" class="text-muted">No revenue in this range</td></tr>'}</tbody>
        <tfoot><tr><td colspan="2"><strong>Total</strong></td><td style="text-align:right"><strong>${fmtMoney(m.total)}</strong></td></tr></tfoot>
      </table></div>`, { wide: true });
    return;
  }

  if (type === 'costs') {
    const costs = DashCore.computeCosts(d.expenses, d.payments, range);
    const eventName = id => (d.events.find(e => e.id === id)?.name) || '';
    const expRows = costs.expenses.sort((a,b)=>(b.amount||0)-(a.amount||0))
      .map(e => `<tr><td>${escapeHtmlSafe(e.description||'—')}</td><td class="text-muted">${escapeHtmlSafe(e.date||'')}</td><td class="text-muted">${escapeHtmlSafe(e.category||'')}</td><td style="text-align:right;color:var(--red)">${fmtMoney(e.amount)}</td></tr>`).join('');
    const payRows = costs.payments.sort((a,b)=>(b.amount||0)-(a.amount||0))
      .map(p => `<tr><td>${escapeHtmlSafe(p.bartenderName||p.name||'Bartender')}</td><td class="text-muted">${escapeHtmlSafe(eventName(p.eventId))}</td><td style="text-align:right;color:var(--red)">${fmtMoney(p.amount)}</td></tr>`).join('');
    openModal(`Costs · ${label}`, `
      <div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px">EXPENSES — ${fmtMoney(costs.expenseTotal)}</div>
      <div class="table-wrap" style="margin-bottom:18px"><table>
        <thead><tr><th>Description</th><th>Date</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${expRows || '<tr><td colspan="4" class="text-muted">No expenses</td></tr>'}</tbody></table></div>
      <div style="font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px">LABOR PAYMENTS — ${fmtMoney(costs.laborTotal)}</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Bartender</th><th>Event</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${payRows || '<tr><td colspan="3" class="text-muted">No payments</td></tr>'}</tbody></table></div>`, { wide: true });
    return;
  }

  if (type === 'profit') {
    const m = DashCore.computeMoneyStats(d.events, range);
    const costs = DashCore.computeCosts(d.expenses, d.payments, range);
    const net = m.total - costs.total;
    openModal(`Net Profit · ${label}`, `
      <table style="width:100%;font-size:15px">
        <tr><td style="padding:8px 0">Revenue</td><td style="text-align:right;color:var(--green)">${fmtMoney(m.total)}</td></tr>
        <tr><td style="padding:8px 0">− Expenses</td><td style="text-align:right;color:var(--red)">${fmtMoney(costs.expenseTotal)}</td></tr>
        <tr><td style="padding:8px 0">− Labor</td><td style="text-align:right;color:var(--red)">${fmtMoney(costs.laborTotal)}</td></tr>
        <tr style="border-top:1px solid var(--border)"><td style="padding:12px 0"><strong>Net Profit</strong></td><td style="text-align:right;font-weight:700;color:${net>=0?'var(--green)':'var(--red)'}">${fmtMoney(net)}</td></tr>
      </table>`);
    return;
  }
}
window.openStatDrill = openStatDrill;

/* ── Action widget: Upcoming Events ───────────────────────────────────── */
function renderUpcomingWidget(now) {
  const up = DashCore.computeUpcoming(_dashData.leads, now);
  const el = document.getElementById('w-upcoming');
  if (!up.length) { el.innerHTML = emptyState('🗓️', 'No upcoming booked events'); return; }
  el.innerHTML = `<div class="dash-list">${up.slice(0, 8).map(l => `
    <button type="button" class="dash-list-row" data-lead-id="${escapeHtmlSafe(l.id)}">
      <div class="dash-row-main">
        <span class="dash-row-title">${escapeHtmlSafe(l.name || '—')}</span>
        <span class="dash-row-sub">${escapeHtmlSafe(l.eventType||'')} · ${l._when.toLocaleDateString('en-US',{month:'short',day:'numeric'})}${l.guestCount?` · ${escapeHtmlSafe(String(l.guestCount))} guests`:''}</span>
      </div>
      <div class="dash-row-side">
        ${l.budget ? `<span class="dash-row-amt">${fmtMoney(l.budget)}</span>` : ''}
        <span class="badge ${l._staffed?'badge-green':'badge-amber'}">${l._staffed?'✅ staffed':'⚠ staff'}</span>
      </div>
    </button>`).join('')}</div>`;
  bindLeadOpenClicks(el);
}

/* ── Action widget: Deals to Close ────────────────────────────────────── */
function renderDealsWidget(now) {
  const deals = DashCore.prioritizeDeals(_dashData.leads, now);
  const el = document.getElementById('w-deals');
  if (!deals.length) { el.innerHTML = emptyState('🎯', 'No open deals — pipeline is clear'); return; }
  el.innerHTML = `<div class="dash-list">${deals.slice(0, 8).map(l => `
    <button type="button" class="dash-list-row" data-lead-id="${escapeHtmlSafe(l.id)}">
      <div class="dash-row-main">
        <span class="dash-row-title">${escapeHtmlSafe(l.name || '—')}</span>
        <span class="dash-row-sub">${escapeHtmlSafe(l._nextAction)} · ${l._daysSinceTouch}d since touch</span>
      </div>
      <span class="badge" style="background:${stageColor(l.stage)}22;color:${stageColor(l.stage)}">${escapeHtmlSafe(l.stage)}</span>
    </button>`).join('')}</div>
    ${deals.length > 8 ? `<button class="dash-link" onclick="loadModule('crm')">View all ${deals.length} in CRM →</button>` : ''}`;
  bindLeadOpenClicks(el);
}
function openLeadFromDash(id) {
  if (typeof openLeadModal === 'function') openLeadModal(id);
  else loadModule('crm');
}
window.openLeadFromDash = openLeadFromDash;

/* ── Action widget: Lead Flow ─────────────────────────────────────────── */
function renderLeadFlowWidget(range) {
  const flow = DashCore.computeLeadFlow(_dashData.leads, range);
  const el = document.getElementById('w-leadflow');
  if (!flow.total) { el.innerHTML = emptyState('📈', 'No new leads in this range'); return; }
  const srcMax = Math.max(...Object.values(flow.bySource));
  const sources = Object.entries(flow.bySource).sort((a,b)=>b[1]-a[1]).map(([s,n]) => `
    <div class="dash-bar-row"><span class="dash-bar-label">${escapeHtmlSafe(s)}</span>
      <span class="dash-bar"><span class="dash-bar-fill" style="width:${Math.round(n/srcMax*100)}%"></span></span>
      <span class="dash-bar-val">${n}</span></div>`).join('');
  const f = flow.funnel;
  el.innerHTML = `
    <div class="dash-sub-label">New leads by source (${flow.total})</div>
    ${sources}
    <div class="dash-sub-label" style="margin-top:12px">Pipeline funnel</div>
    <div class="dash-funnel">
      <span>New ${f.New}</span><span>→</span><span>Contacted ${f.Contacted}</span><span>→</span><span>Proposal ${f.Proposal}</span><span>→</span><span style="color:var(--green)">Booked ${f.Booked}</span>
    </div>
    <div class="dash-conv">${flow.conversionPct}% convert to booked</div>
    ${suggestionLine(DashCore.getSuggestion('leadflow', flow))}`;
}

/* ── Insight widget: Money Made ───────────────────────────────────────── */
function renderMoneyWidget(range) {
  const m = DashCore.computeMoneyStats(_dashData.events, range);
  const el = document.getElementById('w-money');
  const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  const max = Math.max(...m.byMonth, 1);
  const bars = m.byMonth.map((v,i) => `
    <div class="dash-month" title="${MONTHS[i]}: ${fmtMoney(v)}">
      <div class="dash-month-bar" style="height:${Math.round(v/max*60)+2}px;background:${v>0?'var(--gold)':'var(--border)'}"></div>
      <div class="dash-month-lbl">${MONTHS[i]}</div></div>`).join('');
  el.innerHTML = `
    <div class="dash-big">${fmtMoney(m.total)}<span class="dash-big-sub">across ${m.loggedCount} events</span></div>
    <div class="dash-months">${bars}</div>
    ${suggestionLine(DashCore.getSuggestion('money', m))}`;
}

/* ── Insight widget: Event Size & Profitability ───────────────────────── */
function renderProfitWidget(range) {
  const d = _dashData;
  const p = DashCore.computeProfitability(d.events, d.expenses, d.payments, range);
  const el = document.getElementById('w-profit');
  if (!p.count) { el.innerHTML = emptyState('⚖️', 'No completed events in this range'); return; }
  const typeRows = Object.entries(p.byType).sort((a,b)=>b[1].avgMargin-a[1].avgMargin).map(([t,s]) =>
    `<div class="dash-bar-row"><span class="dash-bar-label">${escapeHtmlSafe(t)} (${s.count})</span>
      <span class="dash-bar"><span class="dash-bar-fill" style="width:${Math.max(0,Math.min(100,s.avgMargin))}%;background:var(--green)"></span></span>
      <span class="dash-bar-val">${s.avgMargin}%</span></div>`).join('');
  el.innerHTML = `
    <div class="dash-metric-grid">
      <div><div class="dash-metric-v">${p.avgGuests}</div><div class="dash-metric-l">avg guests</div></div>
      <div><div class="dash-metric-v">${fmtMoney(p.avgRevenue)}</div><div class="dash-metric-l">avg / event</div></div>
      <div><div class="dash-metric-v">${fmtMoney(p.revPerGuest)}</div><div class="dash-metric-l">/ guest</div></div>
      <div><div class="dash-metric-v">${p.avgMargin}%</div><div class="dash-metric-l">avg margin</div></div>
    </div>
    <div class="dash-sub-label" style="margin-top:10px">Margin by type</div>
    ${typeRows}
    ${suggestionLine(DashCore.getSuggestion('profitability', p))}`;
}

/* ── Insight widget: Website Analytics ────────────────────────────────── */
function renderWebWidget(range) {
  const w = DashCore.computeWebsite(_dashData.pageEvents, range);
  const el = document.getElementById('w-web');
  if (!w.pageViews) { el.innerHTML = emptyState('🌐', 'No website traffic in this range'); return; }
  const topPages = Object.entries(w.topPages).sort((a,b)=>b[1]-a[1]).slice(0,4)
    .map(([p,n]) => `<div class="dash-bar-row"><span class="dash-bar-label" title="${escapeHtmlSafe(p)}">${escapeHtmlSafe(p.length>22?p.slice(0,22)+'…':p)}</span><span class="dash-bar-val">${n}</span></div>`).join('');
  const topSrc = Object.entries(w.sources).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([s,n]) => `${escapeHtmlSafe(s)} (${n})`).join(' · ');
  el.innerHTML = `
    <div class="dash-metric-grid">
      <div><div class="dash-metric-v">${w.sessions}</div><div class="dash-metric-l">visitors</div></div>
      <div><div class="dash-metric-v">${w.pageViews}</div><div class="dash-metric-l">page views</div></div>
      <div><div class="dash-metric-v">${w.funnel.bookVisits}</div><div class="dash-metric-l">book visits</div></div>
      <div><div class="dash-metric-v">${w.funnel.formStarts}</div><div class="dash-metric-l">form starts</div></div>
    </div>
    <div class="dash-sub-label" style="margin-top:10px">Top pages</div>
    ${topPages}
    <div class="dash-sub-label" style="margin-top:8px">Sources</div>
    <div style="font-size:12px;color:var(--text-muted)">${topSrc || '—'}</div>
    ${suggestionLine(DashCore.getSuggestion('website', w))}`;
}

/* ── Alerts strip ─────────────────────────────────────────────────────── */
function renderAlerts() {
  const d = _dashData;
  const dismissed = getDismissedAlerts();
  const followupAlerts = (d.followups || []).map(f => ({
    id: 'followup_' + f.id,
    summary: f.title || 'Follow-up needed',
    severity: f.type === 'quote_accepted' ? 'red' : 'gold'
  }));
  const alerts = [
    ...followupAlerts,
    ...DashCore.detectExpenseAnomalies(d.expenses, {}),
    ...DashCore.detectActivityAlerts(d.activity, {})
  ].filter(a => a.id && !dismissed.includes(a.id));

  const el = document.getElementById('dash-alerts');
  if (!alerts.length) { el.innerHTML = ''; return; }
  el.innerHTML = alerts.slice(0, 6).map(a => {
    const color = a.severity === 'red' ? 'var(--red)' : 'var(--gold)';
    const icon = a.severity === 'red' ? '🔴' : '⚠️';
    return `<div class="dash-alert-row" data-alert-id="${a.id}" style="border-left:3px solid ${color}">
      <span>${icon}</span>
      <span class="dash-alert-text">${escapeHtmlSafe(a.summary)}</span>
      <button type="button" class="dash-alert-x" onclick="dismissAlert('${a.id}')" aria-label="Dismiss">✕</button>
    </div>`;
  }).join('');
}

/* ── Small render helpers ─────────────────────────────────────────────── */
function emptyState(icon, text) {
  return `<div class="dash-empty"><div class="dash-empty-icon">${icon}</div><div>${escapeHtmlSafe(text)}</div></div>`;
}
function suggestionLine(text) {
  if (!text) return '';
  return `<div class="dash-suggestion">💡 ${escapeHtmlSafe(text)}</div>`;
}
