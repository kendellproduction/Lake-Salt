/* ══════════════════════════════════════
   MODULE — TEAM NOTES / SHARED MEMORY
   Firebase Firestore collection: notes
   Shared across all team members, all devices.

   Fields: title, body, category, pinned,
           createdBy, createdAt, updatedAt
══════════════════════════════════════ */

const NOTE_CATS = [
  { key: 'all',        label: 'All Notes',  icon: '◈' },
  { key: 'procedures', label: 'Procedures', icon: '◫' },
  { key: 'brand',      label: 'Brand',      icon: '◑' },
  { key: 'clients',    label: 'Clients',    icon: '◬' },
  { key: 'team',       label: 'Team',       icon: '◷' },
  { key: 'general',    label: 'General',    icon: '◰' },
];

let _notesActiveCat = 'all';
let _notesAll = [];

async function renderNotes() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Team Notes</div>
        <div class="page-subtitle">Shared memory — procedures, brand rules, client notes, and team info</div>
      </div>
      <button class="btn btn-gold" onclick="openNoteEditor()">+ New Note</button>
    </div>

    <div class="notes-module-grid">
      <!-- Sidebar: categories -->
      <div class="notes-sidebar">
        <div class="notes-sidebar-header">Categories</div>
        <div class="notes-cat-list" id="notes-cat-list">
          ${NOTE_CATS.map(cat => `
            <div class="notes-cat-item ${cat.key === _notesActiveCat ? 'active' : ''}"
                 data-cat="${cat.key}"
                 onclick="setNotesCategory('${cat.key}')">
              <span style="font-size:12px;opacity:0.6">${cat.icon}</span>
              <span>${cat.label}</span>
              <span class="notes-cat-count" id="notes-count-${cat.key}">—</span>
            </div>`).join('')}
        </div>
      </div>

      <!-- Main: notes list -->
      <div class="notes-main" id="notes-main">
        <div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">Loading…</div>
      </div>
    </div>
  `;

  await loadNotes();
}

async function loadNotes() {
  try {
    const snap = await db.collection('notes').orderBy('pinned', 'desc').orderBy('updatedAt', 'desc').get();
    _notesAll = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateNoteCounts();
    renderNotesList();
  } catch(e) {
    console.warn('loadNotes:', e);
    const main = document.getElementById('notes-main');
    if (main) main.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red);font-size:13px">Failed to load notes. Check Firestore rules.</div>`;
  }
}

function updateNoteCounts() {
  NOTE_CATS.forEach(cat => {
    const el = document.getElementById(`notes-count-${cat.key}`);
    if (!el) return;
    const count = cat.key === 'all'
      ? _notesAll.length
      : _notesAll.filter(n => n.category === cat.key).length;
    el.textContent = count || '';
  });
}

function renderNotesList() {
  const main = document.getElementById('notes-main');
  if (!main) return;

  const filtered = _notesActiveCat === 'all'
    ? _notesAll
    : _notesAll.filter(n => n.category === _notesActiveCat);

  if (filtered.length === 0) {
    main.innerHTML = `
      <div style="padding:60px;text-align:center;color:var(--text-muted);font-size:13px">
        <div style="font-size:2rem;margin-bottom:12px;opacity:0.3">◈</div>
        No notes yet in this category.<br>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="openNoteEditor('${_notesActiveCat === 'all' ? 'general' : _notesActiveCat}')">Create first note</button>
      </div>`;
    return;
  }

  main.innerHTML = filtered.map(note => {
    const date = note.updatedAt?.toDate
      ? note.updatedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '—';
    const preview = (note.body || '').slice(0, 180).replace(/</g, '&lt;');
    return `
      <div class="note-card ${note.pinned ? 'pinned' : ''}" onclick="openNoteEditor('${note.category || 'general'}', '${note.id}')">
        <div class="note-card-header">
          <div>
            <div class="note-card-title">${note.title || 'Untitled'}</div>
            <div class="note-card-meta" style="margin-top:4px">
              <span class="note-cat-pill ${note.category || 'general'}">${capitalise(note.category || 'general')}</span>
              <span>·</span>
              <span>${note.createdBy || 'Team'}</span>
              <span>·</span>
              <span>${date}</span>
              ${note.pinned ? '<span style="color:var(--gold);font-size:10px">📌 pinned</span>' : ''}
            </div>
          </div>
          <div class="note-card-actions">
            <button class="btn btn-ghost btn-sm btn-icon" title="${note.pinned ? 'Unpin' : 'Pin'}"
              onclick="event.stopPropagation();toggleNotePin('${note.id}',${!!note.pinned})">
              ${note.pinned ? '📌' : '📍'}
            </button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Delete" style="color:var(--text-muted)"
              onclick="event.stopPropagation();deleteNote('${note.id}')">✕</button>
          </div>
        </div>
        <div class="note-card-body">${preview || '<span style="opacity:0.4">No content</span>'}</div>
      </div>`;
  }).join('');
}

function setNotesCategory(cat) {
  _notesActiveCat = cat;
  document.querySelectorAll('.notes-cat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === cat);
  });
  renderNotesList();
}

/* ── Note Editor Modal ── */
function openNoteEditor(defaultCat = 'general', noteId = null) {
  const existing = noteId ? _notesAll.find(n => n.id === noteId) : null;
  const catOptions = NOTE_CATS.filter(c => c.key !== 'all').map(c =>
    `<option value="${c.key}" ${(existing?.category || defaultCat) === c.key ? 'selected' : ''}>${c.label}</option>`
  ).join('');

  openModal(existing ? 'Edit Note' : 'New Note', `
    <div class="note-editor">
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="note-title" value="${existing?.title || ''}" placeholder="e.g. Bar setup checklist, Brand voice rules…">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="note-cat">${catOptions}</select>
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:1px">
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted);cursor:pointer">
            <input type="checkbox" id="note-pinned" ${existing?.pinned ? 'checked' : ''} style="accent-color:var(--gold);width:14px;height:14px">
            Pin to top
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Content</label>
        <textarea id="note-body" class="form-textarea" style="min-height:220px;font-size:13px;line-height:1.6"
          placeholder="Write procedures, notes, brand rules, client preferences…">${existing?.body || ''}</textarea>
      </div>
    </div>
    <div class="modal-footer" style="padding:0;margin-top:4px;justify-content:space-between">
      ${existing ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteNote('${noteId}');closeModal()">Delete</button>` : '<span></span>'}
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancel</button>
        <button class="btn btn-gold btn-sm" onclick="saveNote('${noteId || ''}')">Save Note</button>
      </div>
    </div>
  `, { wide: false });

  setTimeout(() => document.getElementById('note-title')?.focus(), 100);
}

async function saveNote(noteId) {
  const title  = document.getElementById('note-title')?.value.trim();
  const body   = document.getElementById('note-body')?.value.trim();
  const cat    = document.getElementById('note-cat')?.value;
  const pinned = document.getElementById('note-pinned')?.checked;

  if (!title) { showToast('Title required', 'error'); return; }

  const payload = {
    title, body, category: cat, pinned,
    updatedAt: TS()
  };

  try {
    if (noteId) {
      await db.collection('notes').doc(noteId).update(payload);
      showToast('Note updated', 'success');
    } else {
      await db.collection('notes').add({
        ...payload,
        createdBy: currentUser?.displayName?.split(' ')[0] || 'Team',
        createdAt: TS()
      });
      showToast('Note saved', 'success');
    }
    closeModal();
    await loadNotes();
  } catch(e) {
    console.error('saveNote:', e);
    showToast('Failed to save note', 'error');
  }
}

async function deleteNote(noteId) {
  if (!confirmAction('Delete this note permanently?')) return;
  try {
    await db.collection('notes').doc(noteId).delete();
    _notesAll = _notesAll.filter(n => n.id !== noteId);
    updateNoteCounts();
    renderNotesList();
    showToast('Note deleted', 'success');
  } catch(e) {
    showToast('Failed to delete note', 'error');
  }
}

async function toggleNotePin(noteId, currentlyPinned) {
  try {
    await db.collection('notes').doc(noteId).update({ pinned: !currentlyPinned, updatedAt: TS() });
    const note = _notesAll.find(n => n.id === noteId);
    if (note) note.pinned = !currentlyPinned;
    _notesAll.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    renderNotesList();
    showToast(currentlyPinned ? 'Unpinned' : 'Pinned to top', 'success');
  } catch(e) {
    showToast('Failed to update pin', 'error');
  }
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}
