/* ─── APP SHELL: ROUTING, NAV, TOAST, MODAL ─── */

// ── Module registry ──
const MODULES = {
  dashboard:  renderDashboard,
  crm:        renderCRM,
  projects:   renderProjects,
  bartenders: renderBartenders,
  analytics:  renderAnalytics,
  expenses:   renderExpenses,
  inventory:  renderInventory,
  funnel:     renderFunnel
};

// ── Load a module ──
function loadModule(name) {
  const validModules = Object.keys(MODULES);
  if (!validModules.includes(name)) name = 'dashboard';

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
    // Close mobile sidebar if open
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
// DASHBOARD MODULE
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
      ${[1,2,3,4].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="dashboard-grid">
      <div class="card" style="grid-column:span 2 / span 2">
        <div class="card-header"><span class="card-title">Recent Leads</span></div>
        <div id="dash-leads">Loading…</div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Activity</span></div>
        <div id="dash-activity"><div class="text-muted" style="font-size:13px">No recent activity</div></div>
      </div>
    </div>`;

  // Fetch stats in parallel
  const [leadsSnap, eventsSnap, expensesSnap, bartSnap] = await Promise.all([
    db.collection('leads').get(),
    db.collection('events').get(),
    db.collection('expenses').get(),
    db.collection('bartenders').where('status','==','Active').get()
  ]);

  const revenue = eventsSnap.docs.reduce((s, d) => s + (d.data().revenue || 0), 0);
  const expenses = expensesSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
  const openLeads = leadsSnap.docs.filter(d => !['Completed','Lost'].includes(d.data().stage)).length;

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card gold"><div class="stat-label">Revenue YTD</div><div class="stat-value">${fmtMoney(revenue)}</div></div>
    <div class="stat-card teal"><div class="stat-label">Open Leads</div><div class="stat-value">${openLeads}</div></div>
    <div class="stat-card green"><div class="stat-label">Events Completed</div><div class="stat-value">${eventsSnap.size}</div></div>
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
}

// ── Boot ──
// Scripts are at bottom of <body>, so DOMContentLoaded may have already fired.
// Use readyState check to guarantee initAuth() always runs.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
