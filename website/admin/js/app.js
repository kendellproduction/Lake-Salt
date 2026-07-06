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
  expo:       () => renderExpo(),
  'event-day': () => renderEventDay(),
  marketing:   () => renderMarketing(),
  notes:       () => renderNotes(),
  quotes:      () => renderQuotes(),
  nurture:     () => renderNurture(),
  settings:    () => renderSettings()
};

/* Apply the saved theme (from settings.js) before any module renders. */
if (typeof initTheme === 'function') initTheme();

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

/* ─── Upcoming calls banner ─── Renders 1-3 next /book call bookings at the
 *    top of the Dashboard. Highlights anything happening today or tomorrow.
 *    Tap a row to open the lead card (where the cancel-booking button lives). */
function renderUpcomingCalls(callsSnap) {
  const el = document.getElementById('upcoming-calls');
  if (!el || !callsSnap || callsSnap.empty) {
    if (el) el.innerHTML = '';
    return;
  }
  const calls = callsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.status !== 'cancelled');
  if (!calls.length) { el.innerHTML = ''; return; }

  const now = new Date();
  const todayDay = now.toDateString();
  const tomorrowDay = new Date(now.getTime() + 86400000).toDateString();

  el.innerHTML = `
    <div class="card upcoming-calls-card" style="margin-bottom:16px;background:linear-gradient(135deg, rgba(201,168,76,0.12), rgba(139,155,126,0.10));border:1px solid rgba(201,168,76,0.35)">
      <div class="card-header" style="margin-bottom:8px">
        <span class="card-title">📞 Upcoming calls</span>
        <span class="text-muted" style="font-size:12px">${calls.length} scheduled</span>
      </div>
      <div class="upcoming-calls-list" style="display:flex;flex-direction:column;gap:8px">
        ${calls.slice(0, 3).map(c => {
          const t = c.slotStart && c.slotStart.toDate ? c.slotStart.toDate() : new Date();
          const dayLabel = t.toDateString() === todayDay ? 'TODAY' :
                           t.toDateString() === tomorrowDay ? 'TOMORROW' :
                           t.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const timeLabel = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' });
          const isUrgent = t.toDateString() === todayDay || t.toDateString() === tomorrowDay;
          const bg = isUrgent ? 'rgba(201,168,76,0.10)' : 'rgba(255,255,255,0.03)';
          const border = isUrgent ? 'rgba(201,168,76,0.35)' : 'var(--border)';
          const leadId = c.leadId || '';
          return `
            <button type="button" class="upcoming-call-open" data-lead-id="${leadId}" aria-label="Open lead ${escapeHtmlSafe(c.name || '')}" style="background:${bg};border:1px solid ${border};color:inherit;text-align:left;cursor:pointer;padding:12px 14px;border-radius:10px;display:flex;align-items:center;gap:14px;min-height:56px;width:100%">
              <div style="flex-shrink:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:${isUrgent ? 'var(--gold)' : 'var(--text-muted)'};min-width:80px;line-height:1.35">
                ${dayLabel}<br><span style="color:var(--text);font-weight:600;letter-spacing:0;text-transform:none">${timeLabel}</span>
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtmlSafe(c.name || '(no name)')}</div>
                <div class="text-muted" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                  ${escapeHtmlSafe(c.eventType || 'Wedding')}${c.eventDate ? ' · ' + escapeHtmlSafe(c.eventDate) : ''}${c.email ? ' · ' + escapeHtmlSafe(c.email) : ''}
                </div>
              </div>
            </button>
          `;
        }).join('')}
      </div>
      ${calls.length > 3 ? `<div class="text-muted" style="font-size:12px;text-align:center;margin-top:8px">+ ${calls.length - 3} more upcoming</div>` : ''}
    </div>
  `;

  el.querySelectorAll('.upcoming-call-open').forEach(btn => {
    btn.addEventListener('click', () => {
      const leadId = btn.getAttribute('data-lead-id');
      if (leadId && typeof openLeadModal === 'function') {
        openLeadModal(leadId);
      } else {
        window.location.hash = '#crm';
      }
    });
  });
}

/* ─── Cancel a call booking (used from the lead modal) ─── */
async function cancelCallBooking(bookingId, leadName) {
  if (!bookingId) return;
  if (!confirmAction(`Cancel the scheduled call with ${leadName || 'this lead'}?\n\nThe booking is marked cancelled but the lead stays in your CRM.`)) return;
  try {
    await db.collection('call_bookings').doc(bookingId).update({
      status: 'cancelled',
      cancelledAt: TS(),
      cancelledBy: currentUser?.displayName || 'Admin'
    });
    logActivity('cancel', 'call_bookings', bookingId, `Cancelled call with ${leadName || ''}`.trim());
    // Refresh dashboard banner if it's currently visible
    if (document.getElementById('upcoming-calls')) {
      const nowTs = firebase.firestore.Timestamp.now();
      const fresh = await db.collection('call_bookings')
        .where('slotStart', '>=', nowTs).orderBy('slotStart', 'asc').limit(5).get();
      renderUpcomingCalls(fresh);
    }
    // Close the modal so the user lands back on the dashboard
    if (typeof closeModal === 'function') closeModal();
  } catch (err) {
    console.error('Cancel booking failed:', err);
    alert('Could not cancel the booking — see console for details.');
  }
}
window.cancelCallBooking = cancelCallBooking;
function escapeHtmlSafe(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function stageColor(stage) {
  const map = {
    'New Lead':         '#1A9E8F',
    'Expo Email Sent':  '#06b6d4',
    'Call Scheduled':   '#3b82f6',
    'Contacted':        '#C9A84C',
    'Proposal Sent':    '#a855f7',
    'Booked-Tentative': '#16a34a',
    'Booked':           '#22c55e',
    'Completed':        '#64748b',
    'Lost':             '#E05252'
  };
  return map[stage] || '#64748b';
}

function stageBadgeClass(stage) {
  const map = {
    'New Lead':         'badge-new-lead',
    'Expo Email Sent':  'badge-contacted',
    'Call Scheduled':   'badge-contacted',
    'Contacted':        'badge-contacted',
    'Proposal Sent':    'badge-proposal',
    'Booked-Tentative': 'badge-booked',
    'Booked':           'badge-booked',
    'Completed':        'badge-completed',
    'Lost':             'badge-lost'
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
// DASHBOARD MODULE
// ══════════════════════════════════════
// renderDashboard() now lives in js/dashboard.js (cockpit: date filter,
// clickable stat cards, action widgets, insight widgets, alerts strip).
// renderUpcomingCalls() above is still used by it.


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
