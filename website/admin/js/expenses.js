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
      <button class="btn btn-primary" onclick="openAddExpenseModal()">+ Add Expense</button>
    </div>
    <div class="stat-grid" id="expense-stats">
      ${[1,2,3,4].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Expense Records</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input class="filter-select" id="expense-search" placeholder="Search…" oninput="filterExpenses()" style="min-width:140px"/>
          <select class="filter-select" id="expense-cat" onchange="filterExpenses()">
            <option value="">All Categories</option>
            ${EXPENSE_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          <select class="filter-select" id="expense-event" onchange="filterExpenses()">
            <option value="">All Events</option>
          </select>
          <select class="filter-select" id="expense-month" onchange="filterExpenses()">
            <option value="">All Months</option>
            ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>`<option value="${i}">${m}</option>`).join('')}
          </select>
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
  const ytdTotal   = window._allExpenses.reduce((s,e) => s + (e.amount||0), 0);
  const thisMonth  = new Date().getMonth();
  const mtdTotal   = window._allExpenses.filter(e => e.date && new Date(e.date).getMonth() === thisMonth)
                       .reduce((s,e) => s + (e.amount||0), 0);
  const byCat      = {};
  window._allExpenses.forEach(e => { const c = e.category||'Misc'; byCat[c] = (byCat[c]||0)+(e.amount||0); });
  const topCat     = Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  const withReceipt = window._allExpenses.filter(e => e.receiptUrl).length;

  document.getElementById('expense-stats').innerHTML = `
    <div class="stat-card red"><div class="stat-label">YTD Expenses</div><div class="stat-value">${fmtMoney(ytdTotal)}</div><div class="stat-sub">${window._allExpenses.length} entries</div></div>
    <div class="stat-card gold"><div class="stat-label">Month-to-Date</div><div class="stat-value">${fmtMoney(mtdTotal)}</div></div>
    <div class="stat-card teal"><div class="stat-label">Top Category</div><div class="stat-value">${topCat ? topCat[0] : '—'}</div><div class="stat-sub">${topCat ? fmtMoney(topCat[1]) : ''}</div></div>
    <div class="stat-card"><div class="stat-label">Receipts Filed</div><div class="stat-value">${withReceipt}</div><div class="stat-sub">of ${window._allExpenses.length} total</div></div>`;

  filterExpenses();
}

function filterExpenses() {
  const expenses = window._allExpenses || [];
  const events   = window._allExpenseEvents || [];
  const search   = (document.getElementById('expense-search')?.value || '').toLowerCase();
  const cat      = document.getElementById('expense-cat')?.value || '';
  const eventId  = document.getElementById('expense-event')?.value || '';
  const month    = document.getElementById('expense-month')?.value;

  const filtered = expenses.filter(e => {
    if (cat && e.category !== cat) return false;
    if (eventId && e.eventId !== eventId) return false;
    if (month !== '' && month !== undefined) {
      const m = e.date ? new Date(e.date).getMonth() : -1;
      if (m !== Number(month)) return false;
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

  tableEl.innerHTML = `
    <table><thead><tr>
      <th>Date</th><th>Description</th><th>Vendor</th><th>Category</th><th>Event</th><th>Amount</th><th>Receipt</th><th></th>
    </tr></thead><tbody>
    ${filtered.map(e => `<tr>
      <td>${e.date || '—'}</td>
      <td><strong>${e.description||'—'}</strong></td>
      <td class="text-muted">${e.vendor||'—'}</td>
      <td><span class="badge">${e.category||'Misc'}</span></td>
      <td class="text-muted">${eventMap[e.eventId]||'—'}</td>
      <td class="text-gold"><strong>${fmtMoney(e.amount)}</strong></td>
      <td>${e.receiptUrl ? `<a href="${e.receiptUrl}" target="_blank" style="color:var(--teal);font-size:12px">View</a>` : '<span class="text-muted">—</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openExpenseModal('${e.id}')">Edit</button></td>
    </tr>`).join('')}
    </tbody></table>`;
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
    <div class="form-group"><label class="form-label">Linked Event</label>
      <select class="form-select" name="eventId">
        <option value="">— None —</option>
        ${events.map(ev=>`<option value="${ev.id}" ${e.eventId===ev.id?'selected':''}>${ev.name||ev.id}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Receipt ${e.receiptUrl?'(replace)':''}</label>
      <input class="form-input" id="receipt-input" type="file" accept="image/*,application/pdf" capture="environment"/>
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
  data.createdAt = TS();
  if (!data.eventId) delete data.eventId;
  if (!data.notes)   delete data.notes;

  const btn = ev.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const docRef = await db.collection('expenses').add(data);
    if (file) {
      const url = await uploadReceiptFile(file, docRef.id);
      await docRef.update({ receiptUrl: url });
    }
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
  data.updatedAt = TS();
  if (!data.eventId) delete data.eventId;

  const btn = ev.target.querySelector('[type=submit]');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (file) {
      const url = await uploadReceiptFile(file, id);
      data.receiptUrl = url;
    }
    await db.collection('expenses').doc(id).update(data);
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
  await db.collection('expenses').doc(id).delete();
  closeModal();
  showToast('Expense deleted', 'info');
  renderExpenses();
}
