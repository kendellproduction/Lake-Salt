/* ══════════════════════════════════════
   MODULE 2 — PROJECT BOARD & TASKS
══════════════════════════════════════ */

const TASK_STATUSES  = ['To Do', 'In Progress', 'Done'];
const TASK_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

let allProjects = {};
let allTasks    = {};
let activeProjectId = null;
let projectsView = 'kanban';

async function renderProjects() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Projects &amp; Tasks</div>
        <div class="page-subtitle">Booked events become projects automatically</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="setProjectsView('kanban')">Kanban</button>
        <button class="btn btn-ghost btn-sm" onclick="setProjectsView('list')">List</button>
        <button class="btn btn-ghost btn-sm" onclick="setProjectsView('my-tasks')">My Tasks</button>
        <button class="btn btn-primary" onclick="openAddProjectModal()">+ Project</button>
      </div>
    </div>
    <div id="projects-content">Loading…</div>`;

  // Push unsubs to cleanup array
  const unsub1 = db.collection('projects').orderBy('createdAt','desc').onSnapshot(snap => {
    allProjects = {};
    snap.forEach(d => { allProjects[d.id] = { id: d.id, ...d.data() }; });
    loadProjectsView();
  });
  _activeListeners.push(unsub1);

  const unsub2 = db.collection('tasks').onSnapshot(snap => {
    allTasks = {};
    snap.forEach(d => { allTasks[d.id] = { id: d.id, ...d.data() }; });
    loadProjectsView();
  });
  _activeListeners.push(unsub2);
}

function setProjectsView(v) {
  projectsView = v;
  loadProjectsView();
}

function loadProjectsView() {
  if (projectsView === 'kanban') renderProjectKanban();
  else if (projectsView === 'list') renderTaskList_all();
  else renderMyTasks();
}

function renderProjectKanban() {
  const projects = Object.values(allProjects).filter(p => p.status !== 'Archived');
  const el = document.getElementById('projects-content');
  if (!el) return;

  if (!projects.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div>
      <div class="empty-title">No projects yet</div>
      <div class="empty-sub">Projects are created when a lead is moved to "Booked" in the CRM, or you can add one manually.</div>
      <button class="btn btn-primary" onclick="openAddProjectModal()">+ Add Project</button></div>`;
    return;
  }

  el.innerHTML = `<div class="kanban-board">
    ${projects.map(p => {
      const tasks = Object.values(allTasks).filter(t => t.projectId === p.id);
      return `
      <div class="kanban-col" style="min-width:260px">
        <div class="kanban-col-header" style="flex-direction:column;align-items:flex-start;gap:4px;cursor:pointer" onclick="openProjectModal('${p.id}')">
          <span class="kanban-col-title">${p.eventName||p.leadName||'Project'}</span>
          <span style="font-size:11px;color:var(--text-muted)">${p.eventDate||''} · ${tasks.length} tasks</span>
        </div>
        <div class="kanban-cards">
          ${TASK_STATUSES.map(status => {
            const ts = tasks.filter(t => t.status === status);
            return ts.length ? ts.map(t => taskCardHTML(t)).join('') : '';
          }).join('')}
          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:4px" onclick="openAddTaskModal('${p.id}')">+ Add Task</button>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function taskCardHTML(t) {
  return `<div class="lead-card" onclick="openTaskModal('${t.id}')">
    <div class="lead-card-name" style="font-size:12px">${t.title}</div>
    <div class="lead-card-tags" style="margin-top:6px">
      <span class="badge ${priorityBadgeClass(t.priority)}">${t.priority||'Normal'}</span>
      <span class="badge ${t.status==='Done'?'badge-booked':t.status==='In Progress'?'badge-contacted':'badge-todo'}">${t.status||'To Do'}</span>
      ${t.dueDate ? `<span style="font-size:10px;color:var(--text-muted)">📅 ${t.dueDate}</span>` : ''}
    </div>
    ${t.assignee ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">👤 ${t.assignee}</div>` : ''}
  </div>`;
}

function renderTaskList_all() {
  const tasks = Object.values(allTasks).sort((a,b) => {
    const p = { Urgent:4, High:3, Normal:2, Low:1 };
    return (p[b.priority]||2) - (p[a.priority]||2);
  });
  const el = document.getElementById('projects-content');
  if (!el) return;

  el.innerHTML = `<div class="card">
    <div class="card-header">
      <span class="card-title">All Tasks (${tasks.length})</span>
      <button class="btn btn-primary btn-sm" onclick="openAddTaskModal()">+ Task</button>
    </div>
    <div class="table-wrap">
    <table><thead><tr>
      <th>Task</th><th>Project</th><th>Assignee</th><th>Due</th><th>Priority</th><th>Status</th>
    </tr></thead><tbody>
    ${tasks.map(t => {
      const p = allProjects[t.projectId];
      return `<tr style="cursor:pointer" onclick="openTaskModal('${t.id}')">
        <td>${t.title}</td>
        <td><span class="text-muted">${p?.eventName||'—'}</span></td>
        <td>${t.assignee||'—'}</td>
        <td>${t.dueDate||'—'}</td>
        <td><span class="badge ${priorityBadgeClass(t.priority)}">${t.priority||'Normal'}</span></td>
        <td><span class="badge ${t.status==='Done'?'badge-booked':t.status==='In Progress'?'badge-inprogress':'badge-todo'}">${t.status||'To Do'}</span></td>
      </tr>`;
    }).join('')}
    </tbody></table></div></div>`;
}

function renderMyTasks() {
  const myName = currentUser?.displayName || '';
  const tasks  = Object.values(allTasks).filter(t =>
    !t.assignee || t.assignee.toLowerCase().includes(myName.split(' ')[0].toLowerCase())
  );
  const el = document.getElementById('projects-content');
  if (!el) return;

  const grouped = { 'To Do': [], 'In Progress': [], 'Done': [] };
  tasks.forEach(t => { if (grouped[t.status]) grouped[t.status].push(t); else grouped['To Do'].push(t); });

  el.innerHTML = Object.entries(grouped).map(([status, ts]) => `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);font-weight:700;margin-bottom:10px">${status} (${ts.length})</div>
      ${ts.length ? ts.map(t => `
        <div class="lead-card" style="margin-bottom:8px" onclick="openTaskModal('${t.id}')">
          <div style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" ${t.status==='Done'?'checked':''} onclick="event.stopPropagation();quickCompleteTask('${t.id}',this.checked)" style="accent-color:var(--teal)"/>
            <span style="font-size:13px;font-weight:600;${t.status==='Done'?'text-decoration:line-through;color:var(--text-muted)':''}">${t.title}</span>
            <span class="badge ${priorityBadgeClass(t.priority)}" style="margin-left:auto">${t.priority||'Normal'}</span>
          </div>
          ${t.dueDate ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;margin-left:22px">📅 ${t.dueDate}</div>` : ''}
        </div>`).join('') : `<div style="font-size:12px;color:var(--text-muted);padding:8px">No tasks</div>`}
    </div>`).join('');
}

async function quickCompleteTask(id, done) {
  await db.collection('tasks').doc(id).update({ status: done ? 'Done' : 'To Do', updatedAt: TS() });
}

function openTaskModal(id) {
  const t = allTasks[id];
  if (!t) return;
  const p = allProjects[t.projectId];
  openModal(`Task: ${t.title}`, `
    <div class="form-group"><label class="form-label">Title</label>
      <input class="form-input" id="task-title" value="${t.title||''}"/></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Status</label>
        <select class="form-select" id="task-status">
          ${TASK_STATUSES.map(s=>`<option ${t.status===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Priority</label>
        <select class="form-select" id="task-priority">
          ${TASK_PRIORITIES.map(s=>`<option ${t.priority===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Assigned To</label>
        <select class="form-select" id="task-assignee">
          <option ${t.assignee==='Owner'?'selected':''}>Owner</option>
          <option ${t.assignee==='Manager'?'selected':''}>Manager</option>
        </select></div>
      <div class="form-group"><label class="form-label">Due Date</label>
        <input class="form-input" type="date" id="task-due" value="${t.dueDate||''}"/></div>
    </div>
    <div class="form-group"><label class="form-label">Notes</label>
      <textarea class="form-textarea" id="task-notes">${t.notes||''}</textarea></div>
    <div class="modal-footer" style="padding:0;margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-danger btn-sm" onclick="deleteTask_project('${id}')">Delete</button>
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTask('${id}')">Save</button>
    </div>`);
}

async function saveTask(id) {
  const title = document.getElementById('task-title').value;
  await db.collection('tasks').doc(id).update({
    title,
    status:   document.getElementById('task-status').value,
    priority: document.getElementById('task-priority').value,
    assignee: document.getElementById('task-assignee').value,
    dueDate:  document.getElementById('task-due').value,
    notes:    document.getElementById('task-notes').value,
    updatedAt: TS()
  });
  logActivity('updated', 'tasks', id, `Updated task: ${title}`);
  closeModal();
  showToast('Task saved', 'success');
}

async function deleteTask_project(id) {
  if (!confirmAction('Delete this task?')) return;
  const t = allTasks[id];
  await db.collection('tasks').doc(id).delete();
  logActivity('deleted', 'tasks', id, `Deleted task: ${t?.title||'Unknown'}`);
  closeModal();
  showToast('Task deleted', 'info');
}

function openAddTaskModal(projectId) {
  const projects = Object.values(allProjects);
  openModal('Add Task', `
    <form onsubmit="saveNewTask(event)">
      <div class="form-group"><label class="form-label">Title *</label>
        <input class="form-input" name="title" required placeholder="e.g. Confirm bar layout"/></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Project</label>
          <select class="form-select" name="projectId">
            <option value="">— None —</option>
            ${projects.map(p=>`<option value="${p.id}" ${p.id===projectId?'selected':''}>${p.eventName||p.leadName}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Assigned To</label>
          <select class="form-select" name="assignee">
            <option>Owner</option><option>Manager</option>
          </select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Priority</label>
          <select class="form-select" name="priority">
            ${TASK_PRIORITIES.map(p=>`<option>${p}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Due Date</label>
          <input class="form-input" type="date" name="dueDate"/></div>
      </div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add Task</button>
      </div>
    </form>`);
}

async function saveNewTask(e) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  data.status    = 'To Do';
  data.notes     = '';
  data.createdAt = TS();
  data.updatedAt = TS();
  const docRef = await db.collection('tasks').add(data);
  logActivity('created', 'tasks', docRef.id, `New task: ${data.title}`);
  closeModal();
  showToast('Task created!', 'success');
}

function openAddProjectModal() {
  openModal('Add Project', `
    <form onsubmit="saveNewProject(event)">
      <div class="form-group"><label class="form-label">Event Name *</label>
        <input class="form-input" name="eventName" required placeholder="e.g. Smith Wedding"/></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Event Type</label>
          <select class="form-select" name="eventType">
            <option>Wedding</option><option>Corporate Event</option>
            <option>Private Celebration</option><option>Themed Experience</option>
          </select></div>
        <div class="form-group"><label class="form-label">Event Date</label>
          <input class="form-input" type="date" name="eventDate"/></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Venue</label>
          <input class="form-input" name="venue" placeholder="Venue name or city"/></div>
        <div class="form-group"><label class="form-label">Revenue ($)</label>
          <input class="form-input" type="number" name="revenue" placeholder="0"/></div>
      </div>
      <div class="modal-footer" style="padding:0;margin-top:16px">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create Project</button>
      </div>
    </form>`);
}

async function saveNewProject(e) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  data.status    = 'Active';
  data.createdAt = TS();
  const docRef = await db.collection('projects').add(data);
  logActivity('created', 'projects', docRef.id, `New project: ${data.eventName}`);
  closeModal();
  showToast('Project created!', 'success');
}

function openProjectModal(id) {
  const p = allProjects[id];
  if (!p) return;
  const tasks = Object.values(allTasks).filter(t => t.projectId === id);
  openModal(`Project: ${p.eventName||p.leadName}`, `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="stat-grid" style="margin-bottom:0">
        <div class="stat-card gold"><div class="stat-label">Revenue</div><div class="stat-value">${fmtMoney(p.revenue)}</div></div>
        <div class="stat-card teal"><div class="stat-label">Tasks</div><div class="stat-value">${tasks.length}</div></div>
        <div class="stat-card green"><div class="stat-label">Done</div><div class="stat-value">${tasks.filter(t=>t.status==='Done').length}</div></div>
      </div>
      <div class="form-row">
        <div class="lead-info-item"><span class="lead-info-label">Date</span><span class="lead-info-value">${p.eventDate||'—'}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Venue</span><span class="lead-info-value">${p.venue||'—'}</span></div>
      </div>
      <div class="divider"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span class="form-section-title" style="margin:0">Tasks</span>
        <button class="btn btn-primary btn-sm" onclick="closeModal();openAddTaskModal('${id}')">+ Task</button>
      </div>
      ${tasks.map(t => taskCardHTML(t)).join('') || '<div class="text-muted" style="font-size:13px">No tasks yet</div>'}
      <div class="divider"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-danger btn-sm" onclick="deleteProject('${id}')">Delete Project</button>
      </div>
    </div>`, { wide: true });
}

async function deleteProject(id) {
  if (!confirmAction('Delete this project and all its tasks?')) return;
  const p = allProjects[id];
  const tasks = Object.values(allTasks).filter(t => t.projectId === id);
  await Promise.all(tasks.map(t => db.collection('tasks').doc(t.id).delete()));
  await db.collection('projects').doc(id).delete();
  logActivity('deleted', 'projects', id, `Deleted project: ${p?.eventName||'Unknown'} (${tasks.length} tasks)`);
  closeModal();
  showToast('Project deleted', 'info');
}
