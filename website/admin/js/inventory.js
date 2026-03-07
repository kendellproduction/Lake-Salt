/* ══════════════════════════════════════
   MODULE 6 — INVENTORY MANAGEMENT
══════════════════════════════════════ */

const INV_CATEGORIES = [
  'Spirits', 'Wine', 'Beer', 'Mixers', 'Garnishes',
  'Ice & Cups', 'Equipment', 'Smallwares', 'Cleaning', 'Other'
];

let _invListener = null;

async function renderInventory() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Inventory</div>
        <div class="page-subtitle">Stock levels, low-stock alerts, and reorder tracking</div>
      </div>
      <button class="btn btn-primary" onclick="openAddInventoryModal()">+ Add Item</button>
    </div>
    <div class="stat-grid" id="inv-stats">
      ${[1,2,3,4].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Stock List</span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input class="filter-select" id="inv-search" placeholder="Search items…" oninput="renderInventoryTable()" style="min-width:150px"/>
          <select class="filter-select" id="inv-cat" onchange="renderInventoryTable()">
            <option value="">All Categories</option>
            ${INV_CATEGORIES.map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
          <select class="filter-select" id="inv-status" onchange="renderInventoryTable()">
            <option value="">All Stock</option>
            <option value="low">Low / Out</option>
            <option value="ok">Stocked</option>
          </select>
        </div>
      </div>
      <div class="table-wrap" id="inv-table">Loading…</div>
    </div>`;

  // Tear down any previous real-time listener
  if (_invListener) { _invListener(); _invListener = null; }

  // Real-time listener
  _invListener = db.collection('inventory').orderBy('name').onSnapshot(snap => {
    window._allInventory = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateInvStats();
    renderInventoryTable();
  });
}

function updateInvStats() {
  const items   = window._allInventory || [];
  const total   = items.length;
  const low     = items.filter(i => (i.stock||0) <= (i.threshold||0)).length;
  const outOf   = items.filter(i => (i.stock||0) === 0).length;
  const totalVal = items.reduce((s,i) => s + ((i.stock||0) * (i.costPerUnit||0)), 0);

  const el = document.getElementById('inv-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card teal"><div class="stat-label">Total Items</div><div class="stat-value">${total}</div></div>
    <div class="stat-card red"><div class="stat-label">Low Stock</div><div class="stat-value">${low}</div><div class="stat-sub">${outOf} out of stock</div></div>
    <div class="stat-card gold"><div class="stat-label">Inventory Value</div><div class="stat-value">${fmtMoney(totalVal)}</div><div class="stat-sub">at cost</div></div>
    <div class="stat-card green"><div class="stat-label">Fully Stocked</div><div class="stat-value">${total - low}</div></div>`;
}

function renderInventoryTable() {
  const items  = window._allInventory || [];
  const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
  const cat    = document.getElementById('inv-cat')?.value || '';
  const status = document.getElementById('inv-status')?.value || '';

  const filtered = items.filter(i => {
    if (cat && i.category !== cat) return false;
    if (status === 'low' && (i.stock||0) > (i.threshold||0)) return false;
    if (status === 'ok'  && (i.stock||0) <= (i.threshold||0)) return false;
    if (search && !(i.name||'').toLowerCase().includes(search)) return false;
    return true;
  });

  const tableEl = document.getElementById('inv-table');
  if (!tableEl) return;

  if (!filtered.length) {
    tableEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No items found</div><div class="empty-sub">Add inventory items to track stock levels</div><button class="btn btn-primary" onclick="openAddInventoryModal()">+ Add Item</button></div>`;
    return;
  }

  tableEl.innerHTML = `
    <table><thead><tr>
      <th>Item</th><th>Category</th><th>Stock</th><th>Threshold</th><th>Unit</th><th>Cost/Unit</th><th>Value</th><th>Status</th><th></th>
    </tr></thead><tbody>
    ${filtered.map(i => {
      const isLow   = (i.stock||0) <= (i.threshold||0);
      const isOut   = (i.stock||0) === 0;
      const value   = ((i.stock||0) * (i.costPerUnit||0));
      const statusLabel = isOut ? `<span class="badge badge-lost">Out</span>` : isLow ? `<span class="badge badge-contacted">Low</span>` : `<span class="badge badge-booked">OK</span>`;
      return `<tr>
        <td><strong>${i.name||'—'}</strong>${i.notes ? `<br><span class="text-muted" style="font-size:11px">${i.notes}</span>` : ''}</td>
        <td><span class="badge">${i.category||'Other'}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:16px;line-height:1" onclick="adjustStock('${i.id}',-1)">−</button>
            <strong style="min-width:24px;text-align:center;color:${isLow?'var(--red)':'inherit'}">${i.stock||0}</strong>
            <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:16px;line-height:1" onclick="adjustStock('${i.id}',1)">+</button>
          </div>
        </td>
        <td class="text-muted">${i.threshold||0}</td>
        <td class="text-muted">${i.unit||'—'}</td>
        <td class="text-muted">${i.costPerUnit ? fmtMoney(i.costPerUnit) : '—'}</td>
        <td class="text-muted">${value > 0 ? fmtMoney(value) : '—'}</td>
        <td>${statusLabel}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="openInventoryModal('${i.id}')">Edit</button></td>
      </tr>`;
    }).join('')}
    </tbody></table>`;
}

// ── Quick stock adjust ──
async function adjustStock(id, delta) {
  const item = (window._allInventory || []).find(i => i.id === id);
  if (!item) return;
  const newStock = Math.max(0, (item.stock||0) + delta);
  await db.collection('inventory').doc(id).update({ stock: newStock, updatedAt: TS() });
  // onSnapshot will re-render automatically
}

// ── Inventory Modal ──
function openInventoryModal(id) {
  const item = (window._allInventory || []).find(i => i.id === id);
  if (!item) return;
  openModal(`Edit: ${item.name}`, inventoryFormHTML(item), {
    onOpen: () => {
      document.getElementById('inv-form').onsubmit = (ev) => saveInventoryEdit(ev, id);
    }
  });
}

function openAddInventoryModal() {
  openModal('Add Inventory Item', inventoryFormHTML(), {
    onOpen: () => {
      document.getElementById('inv-form').onsubmit = saveNewInventoryItem;
    }
  });
}

function inventoryFormHTML(i = {}) {
  return `
  <form id="inv-form">
    <div class="form-row">
      <div class="form-group"><label class="form-label">Item Name *</label>
        <input class="form-input" name="name" value="${i.name||''}" required placeholder="e.g. Grey Goose Vodka"/></div>
      <div class="form-group"><label class="form-label">Category</label>
        <select class="form-select" name="category">
          ${INV_CATEGORIES.map(c=>`<option ${i.category===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Current Stock *</label>
        <input class="form-input" name="stock" type="number" min="0" value="${i.stock||0}" required/></div>
      <div class="form-group"><label class="form-label">Low-Stock Threshold</label>
        <input class="form-input" name="threshold" type="number" min="0" value="${i.threshold||5}" placeholder="5"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Unit</label>
        <input class="form-input" name="unit" value="${i.unit||''}" placeholder="bottle, case, each…"/></div>
      <div class="form-group"><label class="form-label">Cost per Unit ($)</label>
        <input class="form-input" name="costPerUnit" type="number" step="0.01" value="${i.costPerUnit||''}" placeholder="0.00"/></div>
    </div>
    <div class="form-group"><label class="form-label">Supplier / Notes</label>
      <input class="form-input" name="notes" value="${i.notes||''}" placeholder="Where to reorder, brand notes…"/></div>
    <div class="modal-footer" style="padding:0;margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      ${i.id ? `<button type="button" class="btn btn-danger btn-sm" onclick="deleteInventoryItem('${i.id}')">Delete</button>` : ''}
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">Save Item</button>
    </div>
  </form>`;
}

async function saveNewInventoryItem(ev) {
  ev.preventDefault();
  const fd   = new FormData(ev.target);
  const data = Object.fromEntries(fd.entries());
  data.stock       = Number(data.stock);
  data.threshold   = Number(data.threshold);
  if (data.costPerUnit) data.costPerUnit = Number(data.costPerUnit);
  data.createdAt   = TS();
  await db.collection('inventory').add(data);
  closeModal();
  showToast('Item added!', 'success');
}

async function saveInventoryEdit(ev, id) {
  ev.preventDefault();
  const fd   = new FormData(ev.target);
  const data = Object.fromEntries(fd.entries());
  data.stock       = Number(data.stock);
  data.threshold   = Number(data.threshold);
  if (data.costPerUnit) data.costPerUnit = Number(data.costPerUnit);
  data.updatedAt   = TS();
  await db.collection('inventory').doc(id).update(data);
  closeModal();
  showToast('Item updated', 'success');
}

async function deleteInventoryItem(id) {
  if (!confirmAction('Delete this inventory item?')) return;
  await db.collection('inventory').doc(id).delete();
  closeModal();
  showToast('Item deleted', 'info');
}
