/* ══════════════════════════════════════
   MODULE 4 — EVENT ANALYTICS & METRICS
══════════════════════════════════════ */

let analyticsCharts = {};

async function renderAnalytics() {
  // Destroy old charts first
  Object.values(analyticsCharts).forEach(ch => { try { ch.destroy(); } catch(e){} });
  analyticsCharts = {};

  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Analytics</div>
        <div class="page-subtitle">Revenue, margins, and event performance</div>
      </div>
      <div style="display:flex;gap:8px">
        <select class="filter-select" id="analytics-range" onchange="renderAnalytics()">
          <option value="ytd">Year to Date</option>
          <option value="this-month">This Month</option>
          <option value="this-quarter">This Quarter</option>
          <option value="last-year">Last Year</option>
          <option value="all">All Time</option>
        </select>
        <button class="btn btn-primary" onclick="openAddEventModal()">+ Log Event</button>
      </div>
    </div>
    <div class="stat-grid" id="analytics-stats">
      ${[1,2,3,4].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="chart-grid">
      <div class="chart-card">
        <div class="card-title" style="margin-bottom:14px">Revenue by Month</div>
        <canvas id="chart-revenue"></canvas>
      </div>
      <div class="chart-card">
        <div class="card-title" style="margin-bottom:14px">Events by Type</div>
        <canvas id="chart-types"></canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Event Records</span>
      </div>
      <div class="table-wrap" id="events-table">Loading…</div>
    </div>`;

  // Fetch data
  const [eventsSnap, expensesSnap, paymentsSnap] = await Promise.all([
    db.collection('events').orderBy('date','desc').get(),
    db.collection('expenses').get(),
    db.collection('payments').get()
  ]);

  const allEvents   = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allExpenses = expensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allPayments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Apply date range filter
  const range = document.getElementById('analytics-range')?.value || 'ytd';
  const now = new Date();
  let dateFrom = null, dateTo = null;
  switch(range) {
    case 'this-month':
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      dateTo   = new Date(now.getFullYear(), now.getMonth()+1, 0);
      break;
    case 'this-quarter':
      const q = Math.floor(now.getMonth()/3);
      dateFrom = new Date(now.getFullYear(), q*3, 1);
      dateTo   = new Date(now.getFullYear(), (q+1)*3, 0);
      break;
    case 'ytd':
      dateFrom = new Date(now.getFullYear(), 0, 1);
      dateTo   = now;
      break;
    case 'last-year':
      dateFrom = new Date(now.getFullYear()-1, 0, 1);
      dateTo   = new Date(now.getFullYear()-1, 11, 31);
      break;
    default: break; // all time
  }

  function inRange(dateStr) {
    if (!dateFrom && !dateTo) return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > new Date(dateTo.getTime() + 86400000)) return false;
    return true;
  }

  const events   = allEvents.filter(e => inRange(e.date));
  const expenses = allExpenses.filter(e => inRange(e.date));
  const payments = allPayments.filter(p => inRange(p.date));

  // ── Aggregate stats ──
  const revenue    = events.reduce((s,e) => s + (e.revenue||0), 0);
  const totalExp   = expenses.reduce((s,e) => s + (e.amount||0), 0);
  const totalPay   = payments.reduce((s,p) => s + (p.amount||0), 0);
  const netProfit  = revenue - totalExp - totalPay;
  const margins    = events.filter(e => e.revenue > 0).map(e => {
    const eventExp = allExpenses.filter(ex=>ex.eventId===e.id).reduce((s,ex)=>s+(ex.amount||0),0);
    const barCosts = allPayments.filter(p=>p.eventId===e.id).reduce((s,p)=>s+(p.amount||0),0);
    const net = e.revenue - eventExp - barCosts;
    return e.revenue > 0 ? (net / e.revenue) * 100 : 0;
  });
  const avgMargin  = margins.length ? margins.reduce((s,m)=>s+m,0)/margins.length : 0;
  const avgRevGuest = events.filter(e=>e.guestCount>0).length > 0
    ? events.filter(e=>e.guestCount>0).reduce((s,e)=>s+(e.revenue/(e.guestCount||1)),0) / events.filter(e=>e.guestCount>0).length
    : 0;

  document.getElementById('analytics-stats').innerHTML = `
    <div class="stat-card gold"><div class="stat-label">Revenue</div><div class="stat-value">${fmtMoney(revenue)}</div><div class="stat-sub">${events.length} events</div></div>
    <div class="stat-card red"><div class="stat-label">Total Costs</div><div class="stat-value">${fmtMoney(totalExp + totalPay)}</div><div class="stat-sub">expenses + labor</div></div>
    <div class="stat-card" style="border-left:3px solid ${netProfit>=0?'var(--green)':'var(--red)'}"><div class="stat-label">Net Profit</div><div class="stat-value" style="color:${netProfit>=0?'var(--green)':'var(--red)'}">${fmtMoney(netProfit)}</div><div class="stat-sub">${avgMargin.toFixed(0)}% avg margin</div></div>
    <div class="stat-card green"><div class="stat-label">Avg Rev / Guest</div><div class="stat-value">${fmtMoney(avgRevGuest)}</div></div>`;

  // ── Revenue by month chart ──
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const revenueByMonth = new Array(12).fill(0);
  const expByMonth     = new Array(12).fill(0);
  events.forEach(e => {
    const m = e.date ? new Date(e.date).getMonth() : -1;
    if (m >= 0) revenueByMonth[m] += (e.revenue||0);
  });
  expenses.forEach(ex => {
    const m = ex.date ? new Date(ex.date).getMonth() : -1;
    if (m >= 0) expByMonth[m] += (ex.amount||0);
  });

  const revenueCtx = document.getElementById('chart-revenue')?.getContext('2d');
  if (revenueCtx) {
    analyticsCharts.revenue = new Chart(revenueCtx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Revenue', data: revenueByMonth, backgroundColor: 'rgba(201,168,76,0.7)', borderRadius: 4 },
          { label: 'Expenses', data: expByMonth, backgroundColor: 'rgba(224,82,82,0.5)', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#8A9DB5', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#8A9DB5', font:{size:10} }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#8A9DB5', font:{size:10}, callback: v => '$'+v.toLocaleString() }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }

  // ── Events by type donut ──
  const typeCounts = {};
  events.forEach(e => {
    const t = e.eventType || 'Other';
    typeCounts[t] = (typeCounts[t]||0) + 1;
  });
  const typesCtx = document.getElementById('chart-types')?.getContext('2d');
  if (typesCtx && Object.keys(typeCounts).length) {
    analyticsCharts.types = new Chart(typesCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(typeCounts),
        datasets: [{ data: Object.values(typeCounts), backgroundColor: ['#C9A84C','#1A9E8F','#a855f7','#22c55e','#E05252'], borderWidth: 0 }]
      },
      options: {
        responsive: true, cutout: '65%',
        plugins: { legend: { position: 'right', labels: { color: '#8A9DB5', font:{size:11} } } }
      }
    });
  }

  // ── Events table ──
  const tableHTML = events.length ? `
    <table><thead><tr>
      <th>Event</th><th>Date</th><th>Type</th><th>Revenue</th><th>Net</th><th>Margin</th><th>Guests</th><th>Rating</th><th></th>
    </tr></thead><tbody>
    ${events.map(e => {
      const eventExp   = allExpenses.filter(ex=>ex.eventId===e.id).reduce((s,ex)=>s+(ex.amount||0),0);
      const barCosts   = allPayments.filter(p=>p.eventId===e.id).reduce((s,p)=>s+(p.amount||0),0);
      const totalCosts = eventExp + barCosts + (e.supplyCosts||0);
      const net        = (e.revenue||0) - totalCosts;
      const margin     = e.revenue > 0 ? ((net/e.revenue)*100).toFixed(0) : 0;
      return `<tr>
        <td><strong>${e.name||'—'}</strong></td>
        <td>${e.date||'—'}</td>
        <td><span class="badge ${e.eventType==='Wedding'?'badge-wedding':'badge-corporate'}">${e.eventType||'—'}</span></td>
        <td class="text-gold">${fmtMoney(e.revenue)}</td>
        <td style="color:${net>=0?'var(--green)':'var(--red)'}">${fmtMoney(net)}</td>
        <td>${margin}%</td>
        <td>${e.guestCount||'—'}</td>
        <td>${e.rating ? '⭐'.repeat(e.rating) : '—'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="openEventModal('${e.id}')">Edit</button></td>
      </tr>`;
    }).join('')}
    </tbody></table>` :
    `<div class="empty-state"><div class="empty-icon">💰</div>
    <div class="empty-title">No events in this period</div>
    <div class="empty-sub">Log completed events to track revenue and profitability</div>
    <button class="btn btn-primary" onclick="openAddEventModal()">+ Log Event</button></div>`;

  document.getElementById('events-table').innerHTML = tableHTML;
}

// ── Event Modal ──
function openEventModal(id) {
  db.collection('events').doc(id).get().then(doc => {
    if (!doc.exists) return;
    const e = { id: doc.id, ...doc.data() };
    openModal(`Event: ${e.name}`, eventFormHTML(e), {
      onOpen: () => {
        document.getElementById('event-form').onsubmit = (ev) => saveEventEdit(ev, id);
      }
    });
  });
}

function openAddEventModal() {
  openModal('Log Event', eventFormHTML(), {
    onOpen: () => {
      document.getElementById('event-form').onsubmit = saveNewEvent;
    }
  });
}

function eventFormHTML(e = {}) {
  return `
  <form id="event-form">
    <div class="form-row">
      <div class="form-group"><label class="form-label">Event Name *</label>
        <input class="form-input" name="name" value="${e.name||''}" required placeholder="Smith Wedding"/></div>
      <div class="form-group"><label class="form-label">Date *</label>
        <input class="form-input" name="date" type="date" value="${e.date||''}" required/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Event Type</label>
        <select class="form-select" name="eventType">
          ${['Wedding','Corporate Event','Private Celebration','Themed Experience'].map(t=>`<option ${e.eventType===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Guest Count</label>
        <input class="form-input" name="guestCount" type="number" value="${e.guestCount||''}" placeholder="150"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Gross Revenue ($)</label>
        <input class="form-input" name="revenue" type="number" value="${e.revenue||''}" placeholder="3500"/></div>
      <div class="form-group"><label class="form-label">Supply Costs ($)</label>
        <input class="form-input" name="supplyCosts" type="number" value="${e.supplyCosts||''}" placeholder="250"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Rating (1-5)</label>
        <select class="form-select" name="rating">
          <option value="">No rating</option>
          ${[1,2,3,4,5].map(n=>`<option value="${n}" ${e.rating==n?'selected':''}>⭐ ${n}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Linked Project</label>
        <select class="form-select" name="projectId">
          <option value="">— None —</option>
          ${Object.values(allProjects||{}).map(p=>`<option value="${p.id}" ${e.projectId===p.id?'selected':''}>${p.eventName||p.leadName}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-group"><label class="form-label">Post-Event Notes</label>
      <textarea class="form-textarea" name="notes" placeholder="How did it go? Anything to improve?">${e.notes||''}</textarea></div>
    <div class="modal-footer" style="padding:0;margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      ${e.id ? `<button type="button" class="btn btn-danger btn-sm" onclick="deleteEvent('${e.id}')">Delete</button>` : ''}
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">Save Event</button>
    </div>
  </form>`;
}

async function saveNewEvent(e) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (data.revenue)     data.revenue     = Number(data.revenue);
  if (data.supplyCosts) data.supplyCosts = Number(data.supplyCosts);
  if (data.guestCount)  data.guestCount  = Number(data.guestCount);
  if (data.rating)      data.rating      = Number(data.rating);
  data.createdAt = TS();
  const docRef = await db.collection('events').add(data);
  logActivity('created', 'events', docRef.id, `Logged event: ${data.name} (${fmtMoney(data.revenue)})`);
  closeModal();
  showToast('Event logged!', 'success');
  renderAnalytics();
}

async function saveEventEdit(e, id) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (data.revenue)     data.revenue     = Number(data.revenue);
  if (data.supplyCosts) data.supplyCosts = Number(data.supplyCosts);
  if (data.guestCount)  data.guestCount  = Number(data.guestCount);
  if (data.rating)      data.rating      = Number(data.rating);
  data.updatedAt = TS();
  await db.collection('events').doc(id).update(data);
  logActivity('updated', 'events', id, `Updated event: ${data.name}`);
  closeModal();
  showToast('Event updated', 'success');
  renderAnalytics();
}

async function deleteEvent(id) {
  if (!confirmAction('Delete this event record?')) return;
  await db.collection('events').doc(id).delete();
  logActivity('deleted', 'events', id, 'Deleted event record');
  closeModal();
  showToast('Event deleted', 'info');
  renderAnalytics();
}
