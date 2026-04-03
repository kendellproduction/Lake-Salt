/* ══════════════════════════════════════
   MODULE 5 — EXPENSE TRACKER
══════════════════════════════════════ */

const EXPENSE_CATEGORIES = [
  'Bar Supplies', 'Equipment', 'Marketing', 'Staff', 'Travel',
  'Venue', 'Food & Bev', 'Licensing', 'Insurance', 'Misc'
];

async function renderExpenses() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Expenses</div>
        <div class="page-subtitle">Track costs, receipts, and profit impact</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="exportExpensesCSV()" title="Export CSV">📥 Export</button>
        <button class="btn btn-primary" onclick="openAddExpenseModal()">+ Add Expense</button>
      </div>
    </div>
    <div class="stat-grid" id="expense-stats">
      ${[1,2,3,4].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:8px">
        <span class="card-title">Expense Records</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input class="filter-select" id="expense-search" placeholder="Search…" oninput="filterExpenses()" style="min-width:120px"/>
          <select class="filter-select" id="expense-cat" onchange="filterExpenses()">
            <option value="">All Categories</option>
            ${EXPENSE_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          <select class="filter-select" id="expense-event" onchange="filterExpenses()">
            <option value="">All Events</option>
          </select>
          <select class="filter-select" id="expense-range" onchange="handleExpenseDateRange()">
            <option value="">All Time</option>
            <option value="this-month">This Month</option>
            <option value="last-30">Last 30 Days</option>
            <option value="this-quarter">This Quarter</option>
            <option value="ytd">Year to Date</option>
            <option value="custom">Custom Range</option>
          </select>
          <div id="expense-custom-range" style="display:none;gap:6px;align-items:center">
            <input class="form-input" type="date" id="expense-date-from" onchange="filterExpenses()" style="width:130px;padding:6px"/>
            <span style="color:var(--text-muted);font-size:12px">to</span>
            <input class="form-input" type="date" id="expense-date-to" onchange="filterExpenses()" style="width:130px;padding:6px"/>
          </div>
        </div>
      </div>
      <div class="table-wrap" id="expense-table">Loading…</div>
    </div>`;

  // Fetch data
  const [expSnap, eventsSnap] = await Promise.all([
    db.collection('expenses').orderBy('date','desc').get(),
    db.collection('events').orderBy('date','desc').get()
  ]);

  window._allExpenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  window._allExpenseEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Populate event filter
  const evSel = document.getElementById('expense-event');
  window._allExpenseEvents.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name || e.id;
    evSel.appendChild(opt);
  });

  // Stats
  const now = new Date();
  const ytdTotal   = window._allExpenses.reduce((s,e) => s + (e.amount||0), 0);
  const thisMonth  = now.getMonth();
  const mtdTotal   = window._allExpenses.filter(e => e.date && new Date(e.date).getMonth() === thisMonth && new Date(e.date).getFullYear() === now.getFullYear())
                       .reduce((s,e) => s + (e.amount||0), 0);
  const byCat      = {};
  window._allExpenses.forEach(e => { const c = e.category||'Misc'; byCat[c] = (byCat[c]||0)+(e.amount||0); });
  const topCat     = Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  const taxDeductTotal = window._allExpenses.filter(e => e.taxDeductible).reduce((s,e) => s + (e.amount||0), 0);

  document.getElementById('expense-stats').innerHTML = `
    <div class="stat-card red"><div class="stat-label">YTD Expenses</div><div class="stat-value">${fmtMoney(ytdTotal)}</div><div class="stat-sub">${window._allExpenses.length} entries</div></div>
    <div class="stat-card gold"><div class="stat-label">Month-to-Date</div><div class="stat-value">${fmtMoney(mtdTotal)}</div></div>
    <div class="stat-card teal"><div class="stat-label">Top Category</div><div class="stat-value">${topCat ? topCat[0] : '—'}</div><div class="stat-sub">${topCat ? fmtMoney(topCat[1]) : ''}</div></div>
    <div class="stat-card green"><div class="stat-label">Tax Deductible</div><div class="stat-value">${fmtMoney(taxDeductTotal)}</div><div class="stat-sub">${window._allExpenses.filter(e=>e.taxDeductible).length} items</div></div>`;

  filterExpenses();
}

function handleExpenseDateRange() {
  const range = document.getElementById('expense-range')?.value;
  const customEl = document.getElementById('expense-custom-range');
  if (range === 'custom') {
    customEl.style.display = 'flex';
  } else {
    customEl.style.display = 'none';
    filterExpenses();
  }
}

function getDateRange() {
  const range = document.getElementById('expense-range')?.value;
  if (!range) return { from: null, to: null };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from, to;

  switch (range) {
    case 'this-month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'last-30':
      from = new Date(today.getTime() - 30 * 86400000);
      to = today;
      break;
    case 'this-quarter':
      const q = Math.floor(now.getMonth() / 3);
      from = new Date(now.getFullYear(), q * 3, 1);
      to = new Date(now.getFullYear(), (q + 1) * 3, 0);
      break;
    case 'ytd':
      from = new Date(now.getFullYear(), 0, 1);
      to = today;
      break;
    case 'custom':
      const f = document.getElementById('expense-date-from')?.value;
      const t = document.getElementById('expense-date-to')?.value;
      from = f ? new Date(f) : null;
      to = t ? new Date(t) : null;
      break;
    default:
      return { from: null, to: null };
  }
  return { from, to };
}

function filterExpenses() {
  const expenses = window._allExpenses || [];
  const search   = (document.getElementById('expense-search')?.value || '').toLowerCase();
  const cat      = document.getElementById('expense-cat')?.value || '';
  const eventId  = document.getElementById('expense-event')?.value || '';
  const { from, to } = getDateRange();

  const filtered = expenses.filter(e => {
    if (cat && e.category !== cat) return false;
    if (eventId && e.eventId !== eventId) return false;
    if (from || to) {
      const d = e.date ? new Date(e.date) : null;
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > new Date(to.getTime() + 86400000)) return false;
    }
    if (search) {
      const desc = (e.description||'').toLowerCase();
      const vend = (e.vendor||'').toLowerCase();
      if (!desc.includes(search) && !vend.includes(search)) return false;
    }
    return true;
  });

  const eventMap = {};
  (window._allExpenseEvents || []).forEach(e => { eventMap[e.id] = e.name || e.id; });

  const tableEl = document.getElementById('expense-table');
  if (!filtered.length) {
    tableEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">No expenses found</div><div class="empty-sub">Adjust filters or add a new expense</div></div>`;
    return;
  }

  const filteredTotal = filtered.reduce((s,e) => s + (e.amount||0), 0);

  tableEl.innerHTML = `
    <div style="padding:8px 12px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--navy-bd)">
      Showing ${filtered.length} expenses · Total: <strong style="color:var(--gold)">${fmtMoney(filteredTotal)}</strong>
    </div>
    <table><thead><tr>
      <th>Date</th><th>Description</th><th>Vendor</th><th>Category</th><th>Event</th><th>Amount</th><th>Receipt</th><th></th>
    </tr></thead><tbody>
    ${filtered.map(e => `<tr>
      <td>${e.date || '—'}</td>
      <td><strong>${e.description||'—'}</strong>${e.taxDeductible ? ' <span style="color:var(--green);font-size:10px" title="Tax deductible">✓tax</span>' : ''}</td>
      <td class="text-muted">${e.vendor||'—'}</td>
      <td><span class="badge">${e.category||'Misc'}</span></td>
      <td class="text-muted">${eventMap[e.eventId]||'—'}</td>
      <td class="text-gold"><strong>${fmtMoney(e.amount)}</strong></td>
      <td>${e.receiptUrl ? `<a href="${e.receiptUrl}" target="_blank" style="color:var(--teal);font-size:12px">View</a>` : '<span class="text-muted">—</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openExpenseModal('${e.id}')">Edit</button></td>
    </tr>`).join('')}
    </tbody></table>`;
}

// ── Export to CSV ──
function exportExpensesCSV() {
  const expenses = window._allExpenses || [];
  if (!expenses.length) { showToast('No expenses to export', 'warning'); return; }
  const eventMap = {};
  (window._allExpenseEvents || []).forEach(e => { eventMap[e.id] = e.name || e.id; });

  const rows = [['Date','Description','Vendor','Category','Event','Amount','Tax Deductible','Receipt']];
  expenses.forEach(e => {
    rows.push([
      e.date||'', e.description||'', e.vendor||'', e.category||'',
      eventMap[e.eventId]||'', e.amount||0, e.taxDeductible ? 'Yes' : 'No',
      e.receiptUrl ? 'Yes' : 'No'
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `lake-salt-expenses-${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV downloaded!', 'success');
}

// ── Expense Modal ──
function openExpenseModal(id) {
  const exp = (window._allExpenses || []).find(e => e.id === id);
  if (!exp) return;
  openModal(`Expense: ${exp.description||''}`, expenseFormHTML(exp), {
    onOpen: () => {
      document.getElementById('expense-form').onsubmit = (ev) => saveExpenseEdit(ev, id);
      document.getElementById('receipt-input')?.addEventListener('change', (ev) => handleReceiptPreview(ev));
    }
  });
}

function openAddExpenseModal() {
  openModal('Add Expense', expenseFormHTML(), {
    onOpen: () => {
      document.getElementById('expense-form').onsubmit = saveNewExpense;
      document.getElementById('receipt-input')?.addEventListener('change', handleReceiptPreview);
    }
  });
}

function handleReceiptPreview(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const prev = document.getElementById('receipt-preview');
  if (!prev) return;
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => { prev.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:140px;border-radius:6px;margin-top:8px;"/>` };
    reader.readAsDataURL(file);
  } else {
    prev.innerHTML = `<div style="font-size:12px;color:var(--teal);margin-top:6px">📄 ${file.name}</div>`;
  }
}

function expenseFormHTML(e = {}) {
  const events = window._allExpenseEvents || [];
  return `
  <form id="expense-form">
    <div class="form-row">
      <div class="form-group"><label class="form-label">Date *</label>
        <input class="form-input" name="date" type="date" value="${e.date||''}" required/></div>
      <div class="form-group"><label class="form-label">Amount ($) *</label>
        <input class="form-input" name="amount" type="number" step="0.01" value="${e.amount||''}" required placeholder="0.00"/></div>
    </div>
    <div class="form-group"><label class="form-label">Description *</label>
      <input class="form-input" name="description" value="${e.description||''}" required placeholder="What was purchased?"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Vendor</label>
        <input class="form-input" name="vendor" value="${e.vendor||''}" placeholder="Store / supplier name"/></div>
      <div class="form-group"><label class="form-label">Category</label>
        <select class="form-select" name="category">
          ${EXPENSE_CATEGORIES.map(c=>`<option ${e.category===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Linked Event</label>
        <select class="form-select" name="eventId">
          <option value="">— None —</option>
          ${events.map(ev=>`<option value="${ev.id}" ${e.eventId===ev.id?'selected':''}>${ev.name||ev.id}</option>`).join('')}
        </select></div>
      <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:8px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-light)">
          <input type="checkbox" name="taxDeductible" value="true" ${e.taxDeductible?'checked':''} style="accent-color:var(--teal);width:18px;height:18px"/>
          Tax Deductible
        </label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Receipt ${e.receiptUrl?'(replace)':''}</label>
      <label style="display:block;background:var(--navy-lt);border:2px dashed var(--navy-bd);border-radius:8px;padding:16px;text-align:center;cursor:pointer;transition:border-color 0.2s" onmouseover="this.style.borderColor='var(--teal)'" onmouseout="this.style.borderColor='var(--navy-bd)'">
        <div style="font-size:24px;margin-bottom:4px">📷</div>
        <div style="font-size:13px;color:var(--teal)">Tap to take photo or choose file</div>
        <input id="receipt-input" type="file" accept="image/*,application/pdf" capture="environment" style="display:none"/>
      </label>
      ${e.receiptUrl ? `<a href="${e.receiptUrl}" target="_blank" style="font-size:12px;color:var(--teal);display:block;margin-top:4px">Current receipt ↗</a>` : ''}
      <div id="receipt-preview"></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea class="form-textarea" name="notes" placeholder="Any additional details…">${e.notes||''}</textarea></div>
    <div class="modal-footer" style="padding:0;margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      ${e.id ? `<button type="button" class="btn btn-danger btn-sm" onclick="deleteExpense('${e.id}')">Delete</button>` : ''}
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">Save Expense</button>
    </div>
  </form>`;
}

async function uploadReceiptFile(file, expenseId) {
  const ref = storage.ref(`receipts/${expenseId}_${Date.now()}_${file.name}`);
  await ref.put(file);
  return await ref.getDownloadURL();
}

async function saveNewExpense(ev) {
  ev.preventDefault();
  const fd   = new FormData(ev.target);
  const data = Object.fromEntries(fd.entries());
  const file = document.getElementById('receipt-input')?.files[0];

  data.amount = Number(data.amount);
  data.taxDeductible = data.taxDeductible === 'true';
  data.createdAt = TS();
  if (!data.eventId) delete data.eventId;
  if (!data.notes)   delete data.notes;

  const btn = ev.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const docRef = await db.collection('expenses').add(data);
    if (file) {
      const url = await uploadReceiptFile(file, docRef.id);
      await docRef.update({ receiptUrl: url, receiptName: file.name });
      logActivity('uploaded', 'expenses', docRef.id, `Receipt uploaded: ${file.name}`);
    }
    logActivity('created', 'expenses', docRef.id, `New expense: ${data.description} (${fmtMoney(data.amount)})`);
    closeModal();
    showToast('Expense added!', 'success');
    renderExpenses();
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
    btn.disabled = false; btn.textContent = 'Save Expense';
  }
}

async function saveExpenseEdit(ev, id) {
  ev.preventDefault();
  const fd   = new FormData(ev.target);
  const data = Object.fromEntries(fd.entries());
  const file = document.getElementById('receipt-input')?.files[0];

  data.amount = Number(data.amount);
  data.taxDeductible = data.taxDeductible === 'true';
  data.updatedAt = TS();
  if (!data.eventId) delete data.eventId;

  const btn = ev.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (file) {
      const url = await uploadReceiptFile(file, id);
      data.receiptUrl = url;
      data.receiptName = file.name;
    }
    await db.collection('expenses').doc(id).update(data);
    logActivity('updated', 'expenses', id, `Updated expense: ${data.description}`);
    closeModal();
    showToast('Expense updated', 'success');
    renderExpenses();
  } catch(err) {
    showToast('Save failed: ' + err.message, 'error');
    btn.disabled = false; btn.textContent = 'Save Expense';
  }
}

async function deleteExpense(id) {
  if (!confirmAction('Delete this expense?')) return;
  const exp = (window._allExpenses||[]).find(e => e.id === id);
  await db.collection('expenses').doc(id).delete();
  logActivity('deleted', 'expenses', id, `Deleted expense: ${exp?.description||'Unknown'}`);
  closeModal();
  showToast('Expense deleted', 'info');
  renderExpenses();
}
