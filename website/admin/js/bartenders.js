/* ══════════════════════════════════════
   MODULE 3 — BARTENDER ROSTER & PAYROLL
══════════════════════════════════════ */

let allBartenders = {};
let allPayments   = {};

async function renderBartenders() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Bartender Roster</div>
        <div class="page-subtitle">Manage staff, track pay, and store W-9s</div>
      </div>
      <button class="btn btn-primary" onclick="openAddBartenderModal()">+ Add Bartender</button>
    </div>
    <div class="filter-bar">
      <input class="search-input" id="bart-search" placeholder="🔍 Search bartenders…" oninput="filterBartenders()"/>
      <select class="filter-select" id="bart-filter-status" onchange="filterBartenders()">
        <option value="">All Status</option>
        <option>Active</option><option>On-Call</option><option>Inactive</option>
      </select>
    </div>
    <div class="bartender-grid" id="bartender-grid">Loading…</div>`;

  // Load payments once
  const paymentsSnap = await db.collection('payments').get();
  allPayments = {};
  paymentsSnap.forEach(d => {
    const p = { id: d.id, ...d.data() };
    if (!allPayments[p.bartenderId]) allPayments[p.bartenderId] = [];
    allPayments[p.bartenderId].push(p);
  });

  db.collection('bartenders').orderBy('name').onSnapshot(snap => {
    allBartenders = {};
    snap.forEach(d => { allBartenders[d.id] = { id: d.id, ...d.data() }; });
    filterBartenders();
  });
}

function filterBartenders() {
  const search = (document.getElementById('bart-search')?.value || '').toLowerCase();
  const status = document.getElementById('bart-filter-status')?.value || '';
  const list   = Object.values(allBartenders).filter(b => {
    if (search && !`${b.name}${b.email}${b.phone}`.toLowerCase().includes(search)) return false;
    if (status && b.status !== status) return false;
    return true;
  });
  const grid = document.getElementById('bartender-grid');
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🍸</div>
      <div class="empty-title">No bartenders found</div>
      <button class="btn btn-primary" onclick="openAddBartenderModal()">+ Add Bartender</button>
    </div>`;
    return;
  }

  grid.innerHTML = list.map(b => bartenderCardHTML(b)).join('');
}

function bartenderCardHTML(b) {
  const payments   = allPayments[b.id] || [];
  const ytdPay     = payments.reduce((s,p) => s + (p.amount||0), 0);
  const lastPay    = payments.sort((a,k) => (k.date||'') > (a.date||'') ? 1 : -1)[0];
  const eventsWrkd = [...new Set(payments.map(p=>p.eventId).filter(Boolean))].length;

  const statusClass = { Active:'badge-active', Inactive:'badge-inactive', 'On-Call':'badge-oncall' }[b.status] || '';
  return `<div class="bartender-card" onclick="openBartenderModal('${b.id}')">
    <div class="bartender-card-header">
      <div class="bartender-avatar">🍸</div>
      <div>
        <div class="bartender-name">${b.name||'—'}</div>
        <div class="bartender-email">${b.email||b.phone||'—'}</div>
        <span class="badge ${statusClass}" style="margin-top:4px;display:inline-block">${b.status||'Active'}</span>
      </div>
    </div>
    <div class="bartender-stats">
      <div class="bartender-stat">
        <span class="bartender-stat-label">YTD Pay</span>
        <span class="bartender-stat-value">${fmtMoney(ytdPay)}</span>
      </div>
      <div class="bartender-stat">
        <span class="bartender-stat-label">Events</span>
        <span class="bartender-stat-value">${eventsWrkd}</span>
      </div>
      <div class="bartender-stat">
        <span class="bartender-stat-label">Rate</span>
        <span class="bartender-stat-value">${b.payRate ? '$'+b.payRate+'/hr' : '—'}</span>
      </div>
    </div>
    ${lastPay ? `<div style="font-size:11px;color:var(--text-muted);margin-top:10px">Last paid: ${lastPay.date||'—'}</div>` : ''}
  </div>`;
}

function openBartenderModal(id) {
  const b = allBartenders[id];
  if (!b) return;
  const payments = (allPayments[id] || []).sort((a,k) => (k.date||'') > (a.date||'') ? 1 : -1);
  const ytd      = payments.reduce((s,p) => s + (p.amount||0), 0);

  openModal(`Bartender: ${b.name}`, `
    <div class="lead-modal-grid">
      <div class="lead-modal-section">
        <div class="form-section-title">Profile</div>
        <div class="lead-info-item"><span class="lead-info-label">Phone</span><span class="lead-info-value">${b.phone||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Email</span><span class="lead-info-value">${b.email||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Status</span>
          <select class="form-select" style="width:auto" onchange="updateBartenderStatus('${id}',this.value)">
            ${['Active','On-Call','Inactive'].map(s=>`<option ${b.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="lead-info-item"><span class="lead-info-label">Default Pay Rate</span>
          <input class="form-input" style="width:auto" type="number" id="bart-rate-${id}" value="${b.payRate||''}" placeholder="$ /hr" onblur="updateBartenderRate('${id}',this.value)"/>
        </div>
        <div class="lead-info-item"><span class="lead-info-label">Date Added</span><span class="lead-info-value">${fmtDate(b.createdAt)}</span></div>
        ${b.notes ? `<div class="lead-info-item"><span class="lead-info-label">Notes</span><span class="lead-info-value">${b.notes}</span></div>` : ''}

        ${b.w9Url ? `
          <div class="lead-info-item">
            <span class="lead-info-label">W-9</span>
            <a href="${b.w9Url}" target="_blank" class="btn btn-ghost btn-sm">📄 View W-9</a>
          </div>` : `
          <div class="lead-info-item">
            <span class="lead-info-label">W-9</span>
            <label class="btn btn-ghost btn-sm" style="cursor:pointer">
              📎 Upload W-9
              <input type="file" accept=".pdf,.png,.jpg" style="display:none" onchange="uploadW9('${id}',this)"/>
            </label>
          </div>`}

        <div class="divider"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="closeModal();openAddBartenderModal('${id}')">✏ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBartender('${id}')">Delete</button>
        </div>
      </div>

      <div class="lead-modal-section">
        <div class="form-section-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>Payment Log — YTD: ${fmtMoney(ytd)}</span>
          <button class="btn btn-primary btn-sm" onclick="openAddPaymentModal('${id}')">+ Payment</button>
        </div>
        ${payments.length ? `
          <div class="table-wrap">
          <table><thead><tr><th>Date</th><th>Amount</th><th>Event</th><th>Method</th></tr></thead><tbody>
          ${payments.map(p => `<tr>
            <td>${p.date||'—'}</td>
            <td style="color:var(--green);font-weight:700">${fmtMoney(p.amount)}</td>
            <td class="text-muted">${p.eventName||'—'}</td>
            <td class="text-muted">${p.method||'—'}</td>
          </tr>`).join('')}
          </tbody></table></div>` :
          `<div class="text-muted" style="font-size:13px">No payments logged yet</div>`}
      </div>
    </div>`, { wide: true });
}

async function updateBartenderStatus(id, status) {
  await db.collection('bartenders').doc(id).update({ status, updatedAt: TS() });
  showToast('Status updated', 'success');
}

async function updateBartenderRate(id, rate) {
  await db.collection('bartenders').doc(id).update({ payRate: Number(rate), updatedAt: TS() });
}

async function uploadW9(id, input) {
  const file = input.files[0];
  if (!file) return;
  showToast('Uploading W-9…', 'info');
  const ref = storage.ref(`w9s/${id}_${file.name}`);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  await db.collection('bartenders').doc(id).update({ w9Url: url });
  showToast('W-9 uploaded!', 'success');
  closeModal();
  openBartenderModal(id);
}

async function deleteBartender(id) {
  if (!confirmAction('Delete this bartender permanently?')) return;
  await db.collection('bartenders').doc(id).delete();
  closeModal();
  showToast('Bartender removed', 'info');
}

// ── Add/Edit Bartender Modal ──
function openAddBartenderModal(editId) {
  const b = editId ? allBartenders[editId] : {};
  openModal(editId ? 'Edit Bartender' : 'Add Bartender', `
    <form onsubmit="saveBartender(event,'${editId||''}')">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Full Name *</label>
          <input class="form-input" name="name" value="${b?.name||''}" required placeholder="Alex Johnson"/></div>
        <div class="form-group"><label class="form-label">Phone</label>
          <input class="form-input" name="phone" value="${b?.phone||''}" placeholder="(801) 555-0000"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-input" name="email" type="email" value="${b?.email||''}" placeholder="alex@email.com"/></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-select" name="status">
            ${['Active','On-Call','Inactive'].map(s=>`<option ${b?.status===s?'selected':''}>${s}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Default Pay Rate ($/hr)</label>
          <input class="form-input" name="payRate" type="number" value="${b?.payRate||''}" placeholder="20"/></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label>
        <textarea class="form-textarea" name="notes" placeholder="Any notes about this bartender…">${b?.notes||''}</textarea></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${editId ? 'Save Changes' : 'Add Bartender'}</button>
      </div>
    </form>`);
}

async function saveBartender(e, editId) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  if (data.payRate) data.payRate = Number(data.payRate);
  if (editId) {
    await db.collection('bartenders').doc(editId).update({ ...data, updatedAt: TS() });
    showToast('Bartender updated', 'success');
  } else {
    data.createdAt = TS();
    await db.collection('bartenders').add(data);
    showToast('Bartender added!', 'success');
  }
  closeModal();
}

// ── Add Payment Modal ──
function openAddPaymentModal(bartenderId) {
  const projects = Object.values(allProjects || {});
  openModal('Log Payment', `
    <form onsubmit="savePayment(event,'${bartenderId}')">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Amount ($) *</label>
          <input class="form-input" name="amount" type="number" required placeholder="250"/></div>
        <div class="form-group"><label class="form-label">Date *</label>
          <input class="form-input" name="date" type="date" required value="${new Date().toISOString().split('T')[0]}"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Linked Event</label>
          <select class="form-select" name="eventId">
            <option value="">— None —</option>
            ${projects.map(p=>`<option value="${p.id}">${p.eventName||p.leadName}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Payment Method</label>
          <select class="form-select" name="method">
            <option>Venmo</option><option>Check</option>
            <option>Direct Deposit</option><option>Cash</option>
          </select></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label>
        <input class="form-input" name="notes" placeholder="Optional notes"/></div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Log Payment</button>
      </div>
    </form>`);
}

async function savePayment(e, bartenderId) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  data.bartenderId = bartenderId;
  data.amount = Number(data.amount);
  // Find event name
  if (data.eventId && allProjects?.[data.eventId]) {
    data.eventName = allProjects[data.eventId].eventName || allProjects[data.eventId].leadName;
  }
  data.createdAt = TS();
  await db.collection('payments').add(data);

  // Update allPayments cache
  if (!allPayments[bartenderId]) allPayments[bartenderId] = [];
  allPayments[bartenderId].push(data);

  closeModal();
  showToast(`Payment of ${fmtMoney(data.amount)} logged!`, 'success');
  openBartenderModal(bartenderId);
}
