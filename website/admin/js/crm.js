/* ══════════════════════════════════════
   MODULE 1 — CRM & LEAD PIPELINE
══════════════════════════════════════ */

const CRM_STAGES = ['New Lead', 'Contacted', 'Proposal Sent', 'Booked', 'Completed', 'Lost'];

async function renderCRM() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">CRM &amp; Lead Pipeline</div>
        <div class="page-subtitle">Track inquiries from first contact to booked</div>
      </div>
      <button class="btn btn-primary" onclick="openAddLeadModal()">+ Add Lead</button>
    </div>
    <div class="filter-bar">
      <input class="search-input" id="crm-search" placeholder="🔍 Search leads…" oninput="filterKanban()"/>
      <select class="filter-select" id="crm-filter-type" onchange="filterKanban()">
        <option value="">All Event Types</option>
        <option>Wedding</option><option>Corporate Event</option>
        <option>Private Celebration</option><option>Themed Experience</option>
      </select>
    </div>
    <div class="kanban-board" id="kanban-board">
      ${CRM_STAGES.map(s => `
        <div class="kanban-col" data-stage="${s}">
          <div class="kanban-col-header">
            <span class="kanban-col-title" style="color:${stageColor(s)}">${s}</span>
            <span class="kanban-col-count" id="col-count-${s.replace(/\s/g,'-')}">0</span>
          </div>
          <div class="kanban-cards" id="col-${s.replace(/\s/g,'-')}"></div>
        </div>`).join('')}
    </div>`;

  // Real-time listener
  db.collection('leads').orderBy('createdAt','desc').onSnapshot(snap => {
    crmLeads = {};
    snap.forEach(doc => { crmLeads[doc.id] = { id: doc.id, ...doc.data() }; });
    renderKanban();
  });
}

let crmLeads = {};

function renderKanban(filter = '') {
  const search   = (document.getElementById('crm-search')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('crm-filter-type')?.value || '';

  CRM_STAGES.forEach(stage => {
    const colId = 'col-' + stage.replace(/\s/g,'-');
    const cntId = 'col-count-' + stage.replace(/\s/g,'-');
    const col = document.getElementById(colId);
    const cnt = document.getElementById(cntId);
    if (!col || !cnt) return;

    const leads = Object.values(crmLeads).filter(l => {
      if (l.stage !== stage) return false;
      if (search && !`${l.name}${l.email}${l.phone}${l.eventType}`.toLowerCase().includes(search)) return false;
      if (typeFilter && l.eventType !== typeFilter) return false;
      return true;
    });

    cnt.textContent = leads.length;
    col.innerHTML   = leads.length ? leads.map(leadCardHTML).join('') :
      `<div style="text-align:center;padding:20px 10px;color:var(--text-muted);font-size:12px">No leads</div>`;
  });
}

function filterKanban() { renderKanban(); }

function leadCardHTML(l) {
  return `<div class="lead-card" onclick="openLeadModal('${l.id}')">
    <div class="lead-card-name">${l.name || 'Unknown'}</div>
    <div class="lead-card-meta">
      ${l.email ? `<div class="lead-card-row">✉ ${l.email}</div>` : ''}
      ${l.eventType ? `<div class="lead-card-row">🎉 ${l.eventType}</div>` : ''}
      ${l.eventDate ? `<div class="lead-card-row">📅 ${l.eventDate}</div>` : ''}
      ${l.guestCount ? `<div class="lead-card-row">👥 ${l.guestCount} guests</div>` : ''}
    </div>
    <div class="lead-card-tags">
      ${l.source ? `<span class="badge" style="background:rgba(201,168,76,0.1);color:var(--gold)">${l.source}</span>` : ''}
      ${l.notes && l.notes.length ? `<span class="badge" style="background:rgba(26,158,143,0.1);color:var(--teal)">${l.notes.length} note${l.notes.length>1?'s':''}</span>` : ''}
    </div>
  </div>`;
}

// ── Open Lead Detail Modal ──
function openLeadModal(id) {
  const l = crmLeads[id];
  if (!l) return;

  openModal(`Lead: ${l.name || 'Unknown'}`, `
    <div class="lead-modal-grid">
      <!-- Left: info + stage -->
      <div class="lead-modal-section">
        <div class="form-section-title">Contact Info</div>
        <div class="lead-info-item"><span class="lead-info-label">Name</span><span class="lead-info-value">${l.name||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Email</span><span class="lead-info-value">${l.email||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Phone</span><span class="lead-info-value">${l.phone||'—'}</span></div>
        <div class="divider"></div>
        <div class="form-section-title">Event Details</div>
        <div class="lead-info-item"><span class="lead-info-label">Type</span><span class="lead-info-value">${l.eventType||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Date</span><span class="lead-info-value">${l.eventDate||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Guests</span><span class="lead-info-value">${l.guestCount||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Venue</span><span class="lead-info-value">${l.venue||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Budget</span><span class="lead-info-value">${l.budget ? fmtMoney(l.budget) : '—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Source</span><span class="lead-info-value">${l.source||'Website'}</span></div>
        ${l.message ? `<div class="lead-info-item"><span class="lead-info-label">Message</span><span class="lead-info-value">${l.message}</span></div>` : ''}
        <div class="divider"></div>
        <div class="form-section-title">Pipeline Stage</div>
        <select class="form-select" id="lead-stage-select" onchange="updateLeadStage('${id}',this.value)">
          ${CRM_STAGES.map(s => `<option ${l.stage===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <div class="mt-8" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="openEditLeadModal('${id}')">✏ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteLead('${id}')">🗑 Delete</button>
        </div>
      </div>

      <!-- Right: notes + tasks -->
      <div class="lead-modal-section">
        <div class="form-section-title">Notes</div>
        <div class="notes-thread" id="notes-thread-${id}">
          ${(l.notes||[]).length ? (l.notes||[]).map(n => `
            <div class="note-entry">
              <div class="note-meta">${n.author||'Admin'} · ${n.time||''}</div>
              <div class="note-text">${n.text}</div>
            </div>`).join('') : '<div style="font-size:12px;color:var(--text-muted)">No notes yet</div>'}
        </div>
        <div class="note-form mt-8">
          <input class="form-input" id="note-input-${id}" placeholder="Add a note…" onkeydown="if(event.key==='Enter')addNote('${id}')"/>
          <button class="btn btn-primary btn-sm" onclick="addNote('${id}')">Add</button>
        </div>

        <div class="divider"></div>
        <div class="form-section-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>Tasks</span>
          <button class="btn btn-ghost btn-sm" onclick="addTask('${id}')">+ Task</button>
        </div>
        <div class="task-list" id="task-list-${id}">
          ${renderTaskList(l.tasks||[], id)}
        </div>
      </div>
    </div>`,
  { wide: true });
}

function renderTaskList(tasks, leadId) {
  if (!tasks.length) return '<div style="font-size:12px;color:var(--text-muted)">No tasks</div>';
  return tasks.map((t,i) => `
    <div class="task-item ${t.done?'done':''}">
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTask('${leadId}',${i},this.checked)"/>
      <span class="task-text">${t.title}</span>
      <span style="font-size:11px;color:var(--text-muted)">${t.assignee||''}</span>
      <button class="task-delete" onclick="deleteTask('${leadId}',${i})">✕</button>
    </div>`).join('');
}

// ── Lead actions ──
async function updateLeadStage(id, stage) {
  await db.collection('leads').doc(id).update({ stage, updatedAt: TS() });
  // Auto-create project when booked
  if (stage === 'Booked') {
    const l = crmLeads[id];
    const existing = await db.collection('projects').where('leadId','==',id).get();
    if (existing.empty) {
      await db.collection('projects').add({
        leadId: id, leadName: l.name, eventName: `${l.name} — ${l.eventType||'Event'}`,
        eventType: l.eventType, eventDate: l.eventDate,
        venue: l.venue, guestCount: l.guestCount,
        status: 'Active', revenue: 0, createdAt: TS()
      });
      showToast('Project auto-created for this booking!', 'info');
    }
  }
  showToast(`Moved to ${stage}`, 'success');
  closeModal();
}

async function addNote(leadId) {
  const input = document.getElementById(`note-input-${leadId}`);
  const text  = input?.value?.trim();
  if (!text) return;
  const note = {
    text, author: currentUser?.displayName || 'Admin',
    time: new Date().toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
  };
  const l = crmLeads[leadId];
  const notes = [...(l.notes||[]), note];
  await db.collection('leads').doc(leadId).update({ notes, updatedAt: TS() });
  input.value = '';
  const thread = document.getElementById(`notes-thread-${leadId}`);
  if (thread) {
    thread.innerHTML = notes.map(n => `
      <div class="note-entry">
        <div class="note-meta">${n.author} · ${n.time}</div>
        <div class="note-text">${n.text}</div>
      </div>`).join('');
    thread.scrollTop = thread.scrollHeight;
  }
}

async function addTask(leadId) {
  const title = prompt('Task title:');
  if (!title) return;
  const assignee = prompt('Assign to (Owner/Manager):') || 'Owner';
  const l = crmLeads[leadId];
  const tasks = [...(l.tasks||[]), { title, assignee, done: false }];
  await db.collection('leads').doc(leadId).update({ tasks, updatedAt: TS() });
  const tl = document.getElementById(`task-list-${leadId}`);
  if (tl) tl.innerHTML = renderTaskList(tasks, leadId);
}

async function toggleTask(leadId, idx, done) {
  const l = crmLeads[leadId];
  const tasks = [...(l.tasks||[])];
  if (tasks[idx]) tasks[idx].done = done;
  await db.collection('leads').doc(leadId).update({ tasks, updatedAt: TS() });
}

async function deleteTask(leadId, idx) {
  const l = crmLeads[leadId];
  const tasks = [...(l.tasks||[])];
  tasks.splice(idx, 1);
  await db.collection('leads').doc(leadId).update({ tasks, updatedAt: TS() });
  const tl = document.getElementById(`task-list-${leadId}`);
  if (tl) tl.innerHTML = renderTaskList(tasks, leadId);
}

async function deleteLead(id) {
  if (!confirmAction('Delete this lead permanently?')) return;
  await db.collection('leads').doc(id).delete();
  closeModal();
  showToast('Lead deleted', 'info');
}

// ── Add Lead Modal ──
function openAddLeadModal() {
  openModal('Add New Lead', leadFormHTML(), { onOpen: () => {} });
}

function openEditLeadModal(id) {
  const l = crmLeads[id];
  openModal('Edit Lead', leadFormHTML(l), {
    wide: false,
    onOpen: () => {}
  });
  document.getElementById('lead-form').onsubmit = (e) => saveLeadEdit(e, id);
}

function leadFormHTML(l = {}) {
  return `
  <form id="lead-form" onsubmit="${l.id ? '' : 'saveNewLead(event)'}">
    <div class="form-row">
      <div class="form-group"><label class="form-label">Full Name *</label>
        <input class="form-input" name="name" value="${l.name||''}" required placeholder="Jane Smith"/></div>
      <div class="form-group"><label class="form-label">Email *</label>
        <input class="form-input" name="email" type="email" value="${l.email||''}" required placeholder="jane@email.com"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Phone</label>
        <input class="form-input" name="phone" value="${l.phone||''}" placeholder="(801) 555-0000"/></div>
      <div class="form-group"><label class="form-label">Event Type</label>
        <select class="form-select" name="eventType">
          <option value="">Select…</option>
          ${['Wedding','Corporate Event','Private Celebration','Themed Experience'].map(o => `<option ${l.eventType===o?'selected':''}>${o}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Event Date</label>
        <input class="form-input" name="eventDate" value="${l.eventDate||''}" placeholder="June 14, 2026"/></div>
      <div class="form-group"><label class="form-label">Guest Count</label>
        <input class="form-input" name="guestCount" value="${l.guestCount||''}" placeholder="~150"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Venue / Location</label>
        <input class="form-input" name="venue" value="${l.venue||''}" placeholder="The Grand, Salt Lake City"/></div>
      <div class="form-group"><label class="form-label">Budget</label>
        <input class="form-input" name="budget" type="number" value="${l.budget||''}" placeholder="1500"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Source</label>
        <select class="form-select" name="source">
          ${['Website','Referral','Google','Instagram','Facebook','Other'].map(o => `<option ${l.source===o?'selected':''}>${o}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Stage</label>
        <select class="form-select" name="stage">
          ${CRM_STAGES.map(s => `<option ${(l.stage||'New Lead')===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-group"><label class="form-label">Message / Notes</label>
      <textarea class="form-textarea" name="message" placeholder="Vision, theme, special requests…">${l.message||''}</textarea></div>
    <div class="modal-footer" style="padding:0;margin-top:16px">
      <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button type="submit" class="btn btn-primary">Save Lead</button>
    </div>
  </form>`;
}

async function saveNewLead(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  data.createdAt = TS();
  data.updatedAt = TS();
  data.notes = [];
  data.tasks = [];
  if (!data.stage) data.stage = 'New Lead';
  await db.collection('leads').add(data);
  closeModal();
  showToast('Lead added!', 'success');
}

async function saveLeadEdit(e, id) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  data.updatedAt = TS();
  await db.collection('leads').doc(id).update(data);
  closeModal();
  showToast('Lead updated', 'success');
}
