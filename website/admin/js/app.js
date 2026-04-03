/* ─── APP SHELL: ROUTING, NAV, TOAST, MODAL ─── */

// ── Global listener cleanup ──
// Every module that creates onSnapshot listeners should push
// the unsubscribe function into this array. loadModule() clears them.
const _activeListeners = [];
function cleanupListeners() {
  _activeListeners.forEach(unsub => { try { unsub(); } catch(e){} });
  _activeListeners.length = 0;
}

// ── Module registry ──
const MODULES = {
  dashboard:  () => renderDashboard(),
  crm:        () => renderCRM(),
  projects:   () => renderProjects(),
  bartenders: () => renderBartenders(),
  analytics:  () => renderAnalytics(),
  expenses:   () => renderExpenses(),
  inventory:  () => renderInventory(),
  funnel:     () => renderFunnel(),
  'event-day': () => renderEventDay(),
  marketing:   () => renderMarketing(),
  notes:       () => renderNotes()
};

// ── Load a module ──
function loadModule(name) {
  const validModules = Object.keys(MODULES);
  if (!validModules.includes(name)) name = 'dashboard';

  // Cleanup previous module's listeners
  cleanupListeners();

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.module === name);
  });

  // Update hash without scroll
  history.replaceState(null, '', '#' + name);

  // Render
  const container = document.getElementById('module-container');
  container.innerHTML = '<div class="empty-state"><div class="skeleton skeleton-line w-1/2" style="height:28px;margin:0 auto 24px;"></div></div>';

  setTimeout(() => {
    if (MODULES[name]) MODULES[name]();
    closeMobileSidebar();
  }, 50);
}

// ── Nav click handlers ──
document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    loadModule(a.dataset.module);
  });
});

// ── Hash routing ──
window.addEventListener('hashchange', () => {
  const name = window.location.hash.replace('#', '') || 'dashboard';
  loadModule(name);
});

// ── Mobile sidebar ──
document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
});
document.getElementById('sidebar-close').addEventListener('click', closeMobileSidebar);
document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ══════════════════════════════════════
// TOAST
// ══════════════════════════════════════
function showToast(msg, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  toast.innerHTML = `<span style="color:${type==='success'?'#22c55e':type==='error'?'#E05252':type==='warning'?'#FACC15':'#1A9E8F'}">${icons[type]||'ℹ'}</span> ${msg}`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 280);
  }, duration);
}

// ══════════════════════════════════════
// MODAL
// ══════════════════════════════════════
function openModal(title, bodyHTML, options = {}) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = bodyHTML;
  if (options.wide) document.getElementById('modal-box').classList.add('modal-lg');
  else document.getElementById('modal-box').classList.remove('modal-lg');
  document.getElementById('modal-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (options.onOpen) options.onOpen();
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ══════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════
function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(n) {
  if (n === undefined || n === null || n === '') return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDateInput(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}

function stageColor(stage) {
  const map = {
    'New Lead':      '#1A9E8F',
    'Contacted':     '#C9A84C',
    'Proposal Sent': '#a855f7',
    'Booked':        '#22c55e',
    'Completed':     '#64748b',
    'Lost':          '#E05252'
  };
  return map[stage] || '#64748b';
}

function stageBadgeClass(stage) {
  const map = {
    'New Lead':      'badge-new-lead',
    'Contacted':     'badge-contacted',
    'Proposal Sent': 'badge-proposal',
    'Booked':        'badge-booked',
    'Completed':     'badge-completed',
    'Lost':          'badge-lost'
  };
  return map[stage] || '';
}

function priorityBadgeClass(p) {
  const m = { Low:'badge-low', Normal:'badge-normal', High:'badge-high', Urgent:'badge-urgent' };
  return m[p] || '';
}

function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function confirmAction(msg) {
  return window.confirm(msg);
}

// ══════════════════════════════════════
// ACTIVITY LOG — writes to activity/ collection
// ══════════════════════════════════════
async function logActivity(action, collection, docId, summary, metadata = {}) {
  try {
    await db.collection('activity').add({
      action,
      collection,
      docId:     docId || '',
      summary,
      userId:    currentUser?.uid || '',
      userName:  currentUser?.displayName || 'Admin',
      metadata,
      createdAt: TS()
    });
  } catch (e) {
    console.warn('Activity log failed:', e);
  }
}

// ── Live badge: new leads count ──
db.collection('leads').where('stage','==','New Lead').onSnapshot(snap => {
  const badge = document.getElementById('badge-crm');
  if (!badge) return;
  if (snap.size > 0) { badge.textContent = snap.size; badge.style.display = 'inline'; }
  else badge.style.display = 'none';
});

// ── Live badge: low inventory count ──
db.collection('inventory').onSnapshot(snap => {
  const badge = document.getElementById('badge-inventory');
  if (!badge) return;
  let low = 0;
  snap.forEach(doc => {
    const d = doc.data();
    if ((d.stock || 0) <= (d.threshold || 0)) low++;
  });
  if (low > 0) { badge.textContent = low; badge.style.display = 'inline'; }
  else badge.style.display = 'none';
});

// ══════════════════════════════════════
// DASHBOARD MODULE — with P&L card + activity feed
// ══════════════════════════════════════
async function renderDashboard() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">Welcome back, ${currentUser?.displayName?.split(' ')[0] || 'Kendell'}</div>
      </div>
    </div>
    <div class="stat-grid" id="dash-stats">
      ${[1,2,3,4,5].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="dashboard-grid">
      <div class="card" style="grid-column:span 2 / span 2">
        <div class="card-header"><span class="card-title">Recent Leads</span></div>
        <div id="dash-leads">Loading…</div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Activity</span></div>
        <div id="dash-activity" class="activity-list"><div class="text-muted" style="font-size:13px;padding:12px">Loading…</div></div>
      </div>
    </div>`;

  // Fetch stats in parallel
  const [leadsSnap, eventsSnap, expensesSnap, paymentsSnap, bartSnap, activitySnap] = await Promise.all([
    db.collection('leads').get(),
    db.collection('events').get(),
    db.collection('expenses').get(),
    db.collection('payments').get(),
    db.collection('bartenders').where('status','==','Active').get(),
    db.collection('activity').orderBy('createdAt','desc').limit(15).get()
  ]);

  const revenue   = eventsSnap.docs.reduce((s, d) => s + (d.data().revenue || 0), 0);
  const totalExp  = expensesSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
  const totalPay  = paymentsSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
  const netProfit = revenue - totalExp - totalPay;
  const openLeads = leadsSnap.docs.filter(d => !['Completed','Lost'].includes(d.data().stage)).length;

  // P&L trend arrow (compare this month vs last month)
  const now = new Date();
  const thisMonth = now.getMonth();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const thisMonthRev = eventsSnap.docs.filter(d => {
    const dt = d.data().date;
    return dt && new Date(dt).getMonth() === thisMonth;
  }).reduce((s,d) => s + (d.data().revenue||0), 0);
  const lastMonthRev = eventsSnap.docs.filter(d => {
    const dt = d.data().date;
    return dt && new Date(dt).getMonth() === lastMonth;
  }).reduce((s,d) => s + (d.data().revenue||0), 0);
  const trendArrow = thisMonthRev >= lastMonthRev ? '↑' : '↓';
  const trendColor = thisMonthRev >= lastMonthRev ? 'var(--green)' : 'var(--red)';

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card gold"><div class="stat-label">Revenue</div><div class="stat-value">${fmtMoney(revenue)}</div><div class="stat-sub">${eventsSnap.size} events</div></div>
    <div class="stat-card red"><div class="stat-label">Costs</div><div class="stat-value">${fmtMoney(totalExp + totalPay)}</div><div class="stat-sub">expenses + labor</div></div>
    <div class="stat-card" style="border-left:3px solid ${netProfit>=0?'var(--green)':'var(--red)'}"><div class="stat-label">Net Profit</div><div class="stat-value" style="color:${netProfit>=0?'var(--green)':'var(--red)'}">${fmtMoney(netProfit)}</div><div class="stat-sub"><span style="color:${trendColor}">${trendArrow}</span> vs last month</div></div>
    <div class="stat-card teal"><div class="stat-label">Open Leads</div><div class="stat-value">${openLeads}</div></div>
    <div class="stat-card"><div class="stat-label">Active Bartenders</div><div class="stat-value">${bartSnap.size}</div></div>`;

  // Recent leads
  const recentLeads = leadsSnap.docs
    .sort((a,b) => (b.data().createdAt?.seconds||0) - (a.data().createdAt?.seconds||0))
    .slice(0, 6);

  document.getElementById('dash-leads').innerHTML = recentLeads.length ? `
    <div class="table-wrap">
    <table><thead><tr>
      <th>Name</th><th>Event</th><th>Date</th><th>Stage</th>
    </tr></thead><tbody>
    ${recentLeads.map(d => {
      const l = d.data();
      return `<tr style="cursor:pointer" onclick="loadModule('crm')">
        <td><strong>${l.name||'—'}</strong><br><span class="text-muted">${l.email||''}</span></td>
        <td>${l.eventType||'—'}</td>
        <td>${l.eventDate||'—'}</td>
        <td><span class="badge ${stageBadgeClass(l.stage)}">${l.stage||'New Lead'}</span></td>
      </tr>`;
    }).join('')}
    </tbody></table></div>` : `<div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-title">No leads yet</div><div class="empty-sub">Form submissions will appear here</div></div>`;

  // Activity feed
  const activityEl = document.getElementById('dash-activity');
  if (activitySnap.empty) {
    activityEl.innerHTML = `<div class="text-muted" style="font-size:13px;padding:12px">No recent activity</div>`;
  } else {
    const actionIcons = {
      created: '🟢', updated: '🔵', deleted: '🔴',
      status_changed: '🟡', uploaded: '📎'
    };
    activityEl.innerHTML = activitySnap.docs.map(d => {
      const a = d.data();
      const icon = actionIcons[a.action] || '⚪';
      const time = a.createdAt?.toDate ? a.createdAt.toDate().toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      }) : '';
      return `<div class="activity-item">
        <span class="activity-dot">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;line-height:1.4">${a.summary||a.action}</div>
          <div style="font-size:11px;color:var(--text-muted)">${a.userName||'Admin'} · ${time}</div>
        </div>
      </div>`;
    }).join('');
  }
}

// ══════════════════════════════════════
// TOOL OVERLAY — opens brand guide, content creator,
// content calendar inline (fullscreen iframe, no new tab)
// ══════════════════════════════════════
function openTool(url, title) {
  const overlay = document.getElementById('tool-overlay');
  const frame   = document.getElementById('tool-overlay-frame');
  const label   = document.getElementById('tool-overlay-title');
  if (!overlay || !frame) return;
  if (label) label.textContent = title || '';
  frame.src = url;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeToolOverlay() {
  const overlay = document.getElementById('tool-overlay');
  const frame   = document.getElementById('tool-overlay-frame');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  // Delay src clear so close animation isn't janky
  setTimeout(() => { if (frame) frame.src = ''; }, 200);
}

// Close overlay on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('tool-overlay');
    if (overlay && overlay.classList.contains('open')) closeToolOverlay();
  }
});

// ── Boot ──
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
