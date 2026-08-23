/* ══════════════════════════════════════
   MODULE 1 — CRM & LEAD PIPELINE
══════════════════════════════════════ */

const CRM_STAGES = ['New Lead', 'Expo Email Sent', 'Call Scheduled', 'Contacted', 'Proposal Sent', 'Booked-Tentative', 'Booked', 'Completed', 'Lost'];

/* Campaign cohorts — track at-event lead generation. */
const CRM_COHORTS = [
  { id: '', label: 'All Leads' },
  { id: 'WeddingExpo2026-05-09', label: 'Wedding Expo · 5/9' },
];
let crmActiveCohort = '';

/* Older imports stored notes as a single string. Normalize at the edge so a
   character count never masquerades as "614 notes" and the detail modal
   remains safe to open. The source is rewritten only when the lead is next
   edited or a note is added. */
function normalizedNotes(notes) {
  if (Array.isArray(notes)) return notes.filter(n => n && typeof n === 'object');
  if (typeof notes === 'string' && notes.trim()) return [{ text: notes.trim(), author: 'Imported', time: '' }];
  return [];
}

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

    <div class="cohort-tabs" id="cohort-tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px 0">
      ${CRM_COHORTS.map(co => `
        <button type="button" class="cohort-chip${co.id === crmActiveCohort ? ' active' : ''}"
                data-cohort="${co.id}"
                onclick="setCohort('${co.id}')"
                style="font-family:inherit;font-size:12px;font-weight:600;letter-spacing:0.04em;padding:6px 14px;border-radius:999px;cursor:pointer;border:1.5px solid var(--border,rgba(255,245,235,0.18));background:${co.id === crmActiveCohort ? 'var(--gold,#C9A96E)' : 'transparent'};color:${co.id === crmActiveCohort ? '#fff' : 'var(--text,#F2EAE2)'}">
          ${co.label}
        </button>`).join('')}
    </div>

    <div id="cohort-stats" style="display:none;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:var(--text,#F2EAE2);">
      <span id="cohort-stats-text"></span>
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

  // Real-time listener — push unsub to cleanup array
  const unsub = db.collection('leads').orderBy('createdAt','desc').onSnapshot(snap => {
    crmLeads = {};
    snap.forEach(doc => {
      const data = doc.data();
      crmLeads[doc.id] = { id: doc.id, ...data, notes: normalizedNotes(data.notes) };
    });
    renderKanban();
  });
  _activeListeners.push(unsub);
}

let crmLeads = {};

function renderKanban(filter = '') {
  const search   = (document.getElementById('crm-search')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('crm-filter-type')?.value || '';

  /* Apply cohort filter first so stats reflect the same set as the kanban. */
  const cohortFiltered = Object.values(crmLeads).filter(l =>
    !crmActiveCohort || l.campaign === crmActiveCohort
  );

  CRM_STAGES.forEach(stage => {
    const colId = 'col-' + stage.replace(/\s/g,'-');
    const cntId = 'col-count-' + stage.replace(/\s/g,'-');
    const col = document.getElementById(colId);
    const cnt = document.getElementById(cntId);
    if (!col || !cnt) return;

    /* "Booked-Tentative" stage should also catch legacy "Booked" leads only when
       a real "Booked-Tentative" stage isn't set. Each lead matches exactly one column. */
    const leads = cohortFiltered.filter(l => {
      const stageNorm = l.stage || 'New Lead';
      if (stageNorm !== stage) return false;
      if (search && !`${l.name}${l.email}${l.phone}${l.eventType}`.toLowerCase().includes(search)) return false;
      if (typeFilter && l.eventType !== typeFilter) return false;
      return true;
    });

    cnt.textContent = leads.length;
    col.innerHTML   = leads.length ? leads.map(leadCardHTML).join('') :
      `<div style="text-align:center;padding:20px 10px;color:var(--text-muted);font-size:12px">No leads</div>`;
  });

  renderCohortStats(cohortFiltered);
}

function renderCohortStats(filtered) {
  const wrap = document.getElementById('cohort-stats');
  const text = document.getElementById('cohort-stats-text');
  if (!wrap || !text) return;
  if (!crmActiveCohort) { wrap.style.display = 'none'; return; }

  const counts = {
    raffle:  filtered.filter(l => l.source === 'Expo Raffle').length,
    chat:    filtered.filter(l => l.source === 'Expo Booth Chat' || l.source === 'Expo Curious Browse').length,
    consult: filtered.filter(l => l.source === 'Expo Wants Consult').length,
    locked:  filtered.filter(l => l.stage === 'Booked-Tentative' || l.stage === 'Booked').length,
    contacted: filtered.filter(l => l.stage === 'Contacted' || l.stage === 'Proposal Sent').length,
  };
  const cohort = CRM_COHORTS.find(c => c.id === crmActiveCohort);
  text.innerHTML = `
    <strong>${cohort ? cohort.label : 'Cohort'}</strong> · ${filtered.length} total
    &nbsp;·&nbsp; ${counts.raffle} raffle entries
    &nbsp;·&nbsp; ${counts.chat} booth chats
    &nbsp;·&nbsp; ${counts.consult} consult requests
    &nbsp;·&nbsp; <strong style="color:#16a34a">${counts.locked} locked</strong>
    &nbsp;·&nbsp; ${counts.contacted} contacted
  `;
  wrap.style.display = 'block';
}

function setCohort(id) {
  crmActiveCohort = id;
  /* Update chip styles without re-rendering everything (preserves search input focus). */
  document.querySelectorAll('.cohort-chip').forEach(chip => {
    const isActive = chip.dataset.cohort === id;
    chip.style.background = isActive ? 'var(--gold,#C9A96E)' : 'transparent';
    chip.style.color = isActive ? '#fff' : 'var(--text,#F2EAE2)';
    chip.classList.toggle('active', isActive);
  });
  renderKanban();
}

function filterKanban() { renderKanban(); }

function leadCardHTML(l) {
  const priorityDot = l.priority === 'Urgent' ? '🔴' : l.priority === 'High' ? '🟠' : '';
  return `<div class="lead-card" onclick="openLeadModal(${jsStr(l.id)})">
    <div class="lead-card-name">${priorityDot} ${escapeHtml(l.name || 'Unknown')}</div>
    <div class="lead-card-meta">
      ${l.email ? `<div class="lead-card-row">✉ ${escapeHtml(l.email)}</div>` : ''}
      ${l.eventType ? `<div class="lead-card-row">🎉 ${escapeHtml(l.eventType)}</div>` : ''}
      ${l.eventDate ? `<div class="lead-card-row">📅 ${escapeHtml(l.eventDate)}</div>` : ''}
      ${l.guestCount ? `<div class="lead-card-row">👥 ${escapeHtml(l.guestCount)} guests</div>` : ''}
    </div>
    <div class="lead-card-tags">
      ${l.commsUnread > 0 ? `<span class="badge" style="background:rgba(34,197,94,0.18);color:#22c55e;font-weight:700" title="Unread messages">✉ ${escapeHtml(l.commsUnread)} new</span>` : ''}
      ${l.source ? `<span class="badge" style="background:rgba(201,168,76,0.1);color:var(--gold)">${escapeHtml(l.source)}</span>` : ''}
      ${l.budget ? `<span class="badge" style="background:rgba(26,158,143,0.1);color:var(--teal)">${escapeHtml(fmtMoney(l.budget))}</span>` : ''}
      ${normalizedNotes(l.notes).length ? `<span class="badge" style="background:rgba(100,116,139,0.15);color:#8A9DB5">${normalizedNotes(l.notes).length} note${normalizedNotes(l.notes).length>1?'s':''}</span>` : ''}
    </div>
  </div>`;
}

// ── Open Lead Detail Modal ──
async function openLeadModal(id) {
  // Fall back to a direct fetch when the lead isn't in the in-memory cache.
  // crmLeads only populates after visiting the CRM page, so dashboard taps
  // (Upcoming Calls banner, expo drills, etc.) need to hydrate on demand.
  let l = crmLeads[id];
  if (!l) {
    try {
      const doc = await db.collection('leads').doc(id).get();
      if (!doc.exists) {
        alert('That lead no longer exists — it may have been deleted.');
        return;
      }
      l = { id: doc.id, ...doc.data() };
      crmLeads[id] = l;
    } catch (e) {
      console.error('Failed to fetch lead:', e);
      alert('Could not load the lead — see console for details.');
      return;
    }
  }

  const mergeBadge = Array.isArray(l.mergeHistory) && l.mergeHistory.length
    ? `<button type="button" class="badge" onclick="showMergeHistory(${jsStr(id)})" style="background:rgba(100,116,139,0.2);color:#94a3b8;border:none;cursor:pointer;margin-left:6px">📎 Merged from ${l.mergeHistory.length} duplicate${l.mergeHistory.length===1?'':'s'} · view</button>`
    : '';

  /* The title arg is assigned via textContent in openModal (app.js), so it must
     NOT be escaped here — doing so would surface literal &amp; in the heading.
     The second arg is innerHTML; everything interpolated into it is escaped. */
  openModal(`Lead: ${l.name || 'Unknown'}${mergeBadge ? '' : ''}`, `
    <div class="lead-modal-grid">
      <!-- Left: info + stage -->
      <div class="lead-modal-section">
        ${mergeBadge ? `<div style="margin-bottom:10px">${mergeBadge}</div>` : ''}
        <div id="lead-call-booking-${id}"></div>
        <div class="form-section-title">Contact Info</div>
        <div class="lead-info-item"><span class="lead-info-label">Name</span><span class="lead-info-value">${escapeHtml(l.name||'—')}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Email</span><span class="lead-info-value">${escapeHtml(l.email||'—')}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Phone</span><span class="lead-info-value">${escapeHtml(l.phone||'—')}</span></div>
        <div class="divider"></div>
        <div class="form-section-title">Event Details</div>
        <div class="lead-info-item"><span class="lead-info-label">Type</span><span class="lead-info-value">${escapeHtml(l.eventType||'—')}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Date</span><span class="lead-info-value">${escapeHtml(l.eventDate||'—')}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Guests</span><span class="lead-info-value">${escapeHtml(l.guestCount||'—')}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Venue</span><span class="lead-info-value">${escapeHtml(l.venue||'—')}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Budget</span><span class="lead-info-value">${escapeHtml(l.budget ? fmtMoney(l.budget) : '—')}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Source</span><span class="lead-info-value">${escapeHtml(l.source||'Website')}</span></div>
        <div class="lead-info-item"><span class="lead-info-label">Priority</span><span class="lead-info-value"><span class="badge ${priorityBadgeClass(l.priority||'Normal')}">${escapeHtml(l.priority||'Normal')}</span></span></div>
        ${l.followUpDate ? `<div class="lead-info-item"><span class="lead-info-label">Follow-Up</span><span class="lead-info-value" style="color:var(--gold)">${escapeHtml(l.followUpDate)}</span></div>` : ''}
        ${l.message ? `<div class="lead-info-item"><span class="lead-info-label">Message</span><span class="lead-info-value">${escapeHtml(l.message)}</span></div>` : ''}
        <div class="divider"></div>
        <div class="form-section-title">Pipeline Stage</div>
        <select class="form-select" id="lead-stage-select" onchange="updateLeadStage(${jsStr(id)},this.value)">
          ${CRM_STAGES.map(s => `<option ${l.stage===s?'selected':''}>${s}</option>`).join('')}
        </select>
        ${l.stage === 'Lost' && l.lostReason ? `<div style="font-size:12px;color:var(--red);margin-top:6px">Reason: ${escapeHtml(l.lostReason)}</div>` : ''}
        <div class="mt-8" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="openEditLeadModal(${jsStr(id)})">✏ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteLead(${jsStr(id)})">🗑 Delete</button>
        </div>
      </div>

      <!-- Right: quote builder + communications + notes + tasks -->
      <div class="lead-modal-section">
        <div class="form-section-title">Quote</div>
        <div id="lead-quote-builder-${id}"></div>

        <div class="divider"></div>
        <div class="form-section-title">Communications</div>
        <div id="comms-thread-${id}">
          <div style="font-size:12px;color:var(--text-muted)">Loading messages…</div>
        </div>
        <!-- P2 composer mounts here (Send / Draft for me / Polish). Empty in P1. -->
        <div id="comms-composer-${id}"></div>

        <div class="divider"></div>
        <div class="form-section-title">Notes</div>
        <div class="notes-thread" id="notes-thread-${id}">
          ${normalizedNotes(l.notes).length ? normalizedNotes(l.notes).map(n => `
            <div class="note-entry">
              <div class="note-meta">${escapeHtml(n.author||'Admin')} · ${escapeHtml(n.time||'')}</div>
              <div class="note-text">${escapeHtml(n.text)}</div>
            </div>`).join('') : '<div style="font-size:12px;color:var(--text-muted)">No notes yet</div>'}
        </div>
        <div class="note-form mt-8">
          <input class="form-input" id="note-input-${id}" placeholder="Add a note…" onkeydown="if(event.key==='Enter')addNote(${jsStr(id)})"/>
          <button class="btn btn-primary btn-sm" onclick="addNote(${jsStr(id)})">Add</button>
        </div>

        <div class="divider"></div>
        <div class="form-section-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>Tasks</span>
          <button class="btn btn-ghost btn-sm" onclick="addTask(${jsStr(id)})">+ Task</button>
        </div>
        <div class="task-list" id="task-list-${id}">
          ${renderTaskList(l.tasks||[], id)}
        </div>
      </div>
    </div>`,
  { wide: true });

  loadLeadCallBooking(id, l.name);
  if (typeof renderQuoteBuilder === 'function') {
    renderQuoteBuilder(`lead-quote-builder-${id}`, l, { leadEmail: l.email });
  }
  loadLeadComms(id, l);
}

/* ── Communications Hub (P1: read-only thread view) ──
 * Live-renders every message mirrored from Gmail into this lead's
 * threads/{threadId}/messages subcollections, ordered by send time. Bubbles:
 * outbound (Kendell) right-aligned, inbound left. Channel badge for
 * Knot/WeddingPro. ALL message bodies are escaped client-side via escapeHtml()
 * — we never inject server HTML here (defense-in-depth with the server-side
 * sanitize in syncGmail). The unsub is pushed into _activeListeners so the
 * shared module cleanup tears it down, exactly like loadLeadCallBooking's
 * sibling listeners.
 *
 * Sending lives in P2 — this function only reads. The empty
 * #comms-composer-${id} div is where the composer will mount. */
async function loadLeadComms(id, lead) {
  const wrap = document.getElementById(`comms-thread-${id}`);
  if (!wrap) return;

  /* Opening the card "reads" the inbound messages — clear the unread counter
   * (best-effort; never block the UI on it). The kanban badge updates live. */
  if (lead && lead.commsUnread > 0) {
    db.collection('leads').doc(id).update({ commsUnread: 0 }).catch(() => {});
  }

  /* A lead's messages live in one subcollection per thread
   * (leads/{id}/threads/{threadId}/messages). We listen on this lead's threads
   * and, for each thread, attach a live listener on its messages — then merge
   * and sort everything by sentAt for a single chronological view. One master
   * unsub (below) tears down every per-thread listener. */
  const unsubs = [];
  const messagesByThread = {};

  function renderAll() {
    const all = [];
    Object.values(messagesByThread).forEach(arr => arr.forEach(m => all.push(m)));
    all.sort((a, b) => (a.sentAt?.toMillis?.() || 0) - (b.sentAt?.toMillis?.() || 0));
    renderComms(wrap, all);

    /* Stash reply context for the composer: the most-recent message's thread +
     * id are what `sendReply` threads against. Stored on the composer element so
     * the Send handler reads the live latest even after new mail arrives. */
    const composer = document.getElementById(`comms-composer-${id}`);
    if (composer) {
      const last = all[all.length - 1];
      if (last) {
        composer.dataset.gmailThreadId = last.gmailThreadId || '';
        composer.dataset.inReplyToMessageId = last.gmailMessageId || last.id || '';
      }
      if (!composer.dataset.mounted) renderCommsComposer(id);
    }
  }

  /* Listen on this lead's threads; for each thread, listen on its messages. */
  const threadsUnsub = db.collection('leads').doc(id).collection('threads')
    .onSnapshot(threadSnap => {
      threadSnap.docChanges().forEach(change => {
        const threadId = change.doc.id;
        if (change.type === 'added') {
          const mUnsub = db.collection('leads').doc(id)
            .collection('threads').doc(threadId).collection('messages')
            .orderBy('sentAt', 'asc')
            .onSnapshot(msgSnap => {
              messagesByThread[threadId] = msgSnap.docs.map(d => ({ id: d.id, ...d.data() }));
              renderAll();
            }, err => console.warn('comms messages listener error:', err));
          unsubs.push(mUnsub);
        }
      });
      /* If there are no threads at all, show the empty state + mount the
       * composer so it explains there's nothing to reply to yet. */
      if (threadSnap.empty && !Object.keys(messagesByThread).length) {
        wrap.innerHTML = `<div style="font-size:12px;color:var(--text-muted)">No messages yet. Emails sync in automatically once Gmail sync is connected.</div>`;
        const composer = document.getElementById(`comms-composer-${id}`);
        if (composer && !composer.dataset.mounted) renderCommsComposer(id);
      }
    }, err => {
      console.warn('comms threads listener error:', err);
      wrap.innerHTML = `<div style="font-size:12px;color:var(--text-muted)">Couldn't load messages — see console.</div>`;
    });

  /* Push the master unsub (tears down every per-thread listener too). */
  const masterUnsub = () => { try { threadsUnsub(); } catch (e) {} unsubs.forEach(u => { try { u(); } catch (e) {} }); };
  if (typeof _activeListeners !== 'undefined' && Array.isArray(_activeListeners)) {
    _activeListeners.push(masterUnsub);
  }
}

/* Channel badge for non-Gmail sources (The Knot / WeddingPro). */
function commsChannelBadge(channel) {
  if (channel === 'theknot') {
    return `<span class="badge" style="background:rgba(236,72,153,0.15);color:#EC4899">The Knot</span>`;
  }
  if (channel === 'weddingpro') {
    return `<span class="badge" style="background:rgba(139,92,246,0.15);color:#8B5CF6">WeddingPro</span>`;
  }
  return '';
}

/* Render the full bubble thread. Every dynamic value is escaped — bodyText via
 * escapeHtml, never raw server HTML. */
function renderComms(wrap, messages) {
  if (!messages.length) {
    wrap.innerHTML = `<div style="font-size:12px;color:var(--text-muted)">No messages yet. Emails sync in automatically once Gmail sync is connected.</div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="comms-thread" style="display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-y:auto;padding:4px 2px">
      ${messages.map(m => {
        const out = m.direction === 'out';
        const when = m.sentAt && m.sentAt.toDate
          ? m.sentAt.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : '';
        const who = escapeHtml(out ? 'You' : (m.fromDisplay || m.from || 'Them'));
        const body = escapeHtml(m.bodyText || m.snippet || '').replace(/\n/g, '<br>');
        const badge = commsChannelBadge(m.sourceChannel);
        return `
          <div style="display:flex;justify-content:${out ? 'flex-end' : 'flex-start'}">
            <div style="max-width:80%;background:${out ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.04)'};border:1px solid ${out ? 'rgba(201,168,76,0.30)' : 'var(--border)'};border-radius:12px;padding:8px 11px">
              <div style="display:flex;gap:6px;align-items:center;margin-bottom:3px;flex-wrap:wrap">
                <span style="font-size:11px;font-weight:700;color:${out ? 'var(--gold)' : 'var(--text)'}">${who}</span>
                ${badge}
                <span style="font-size:10px;color:var(--text-muted)">${when}</span>
              </div>
              ${m.subject ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">${escapeHtml(m.subject)}</div>` : ''}
              <div style="font-size:13px;line-height:1.5;color:var(--text);white-space:normal;word-break:break-word">${body}</div>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  /* Pin to newest. */
  const t = wrap.querySelector('.comms-thread');
  if (t) t.scrollTop = t.scrollHeight;
}

/* ── Communications composer (P2: Send) ──
 * Mounts a textarea + button row into #comms-composer-${id}. Send calls the
 * `sendReply` callable; the new outbound message appears via the existing
 * onSnapshot (sendReply mirrors it into Firestore), so we don't touch the DOM
 * for the bubble — we just clear the textarea. The button mirrors auth.js's
 * sign-in pattern: disable + "Sending…" while in flight, re-enable on error.
 *
 * Draft/Polish are P3 (AI) — rendered disabled with a "coming soon" title so
 * the layout is final but nothing AI is wired yet. The reply target
 * (gmailThreadId + inReplyToMessageId) is read live from the composer's dataset,
 * which loadLeadComms keeps pointed at the newest message in the thread. */
function renderCommsComposer(id) {
  const composer = document.getElementById(`comms-composer-${id}`);
  if (!composer || composer.dataset.mounted) return;
  composer.dataset.mounted = '1';

  composer.innerHTML = `
    <div style="margin-top:10px">
      <textarea id="comms-input-${id}" class="form-input" rows="3"
        placeholder="Write a reply…"
        style="width:100%;resize:vertical;min-height:64px;font-family:inherit"></textarea>
      <div id="comms-error-${id}" style="display:none;font-size:12px;color:var(--red,#ef4444);margin:6px 2px 0"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center">
        <button class="btn btn-primary btn-sm" id="comms-send-${id}" onclick="sendCommsReply(${jsStr(id)})">Send</button>
        <button class="btn btn-ghost btn-sm" disabled title="Coming soon (P3 — AI draft)">✨ Draft for me</button>
        <button class="btn btn-ghost btn-sm" disabled title="Coming soon (P3 — AI polish)">✨ Polish my draft</button>
        <span id="comms-replyto-${id}" style="font-size:11px;color:var(--text-muted);margin-left:auto"></span>
      </div>
    </div>`;
}

/* Send handler — gated server-side by assertSafeToSend. Surfaces the dedup /
 * failed-precondition block clearly so Kendell knows a quote already went out. */
async function sendCommsReply(id) {
  const composer = document.getElementById(`comms-composer-${id}`);
  const input    = document.getElementById(`comms-input-${id}`);
  const btn      = document.getElementById(`comms-send-${id}`);
  const errEl    = document.getElementById(`comms-error-${id}`);
  if (!composer || !input || !btn) return;
  if (btn.disabled) return;

  const bodyText = (input.value || '').trim();
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

  if (!bodyText) {
    if (errEl) { errEl.textContent = 'Write a message before sending.'; errEl.style.display = 'block'; }
    return;
  }
  const gmailThreadId = composer.dataset.gmailThreadId || '';
  const inReplyToMessageId = composer.dataset.inReplyToMessageId || '';
  if (!gmailThreadId) {
    if (errEl) { errEl.textContent = 'No email thread to reply to yet — this lead has no synced messages.'; errEl.style.display = 'block'; }
    return;
  }

  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const sendReply = firebase.functions().httpsCallable('sendReply');
    const res = await sendReply({ leadId: id, gmailThreadId, bodyText, inReplyToMessageId });
    if (res && res.data && res.data.success) {
      /* The onSnapshot listener renders the new bubble — just clear the box. */
      input.value = '';
    } else {
      throw new Error('Send did not confirm — try again.');
    }
  } catch (e) {
    /* failed-precondition is the dedup/quote-gate block — show it prominently. */
    const code = (e && e.code) || '';
    const msg  = (e && e.message) || 'Something went wrong sending the reply.';
    if (errEl) {
      errEl.textContent = code === 'functions/failed-precondition'
        ? '⛔ ' + msg
        : msg;
      errEl.style.display = 'block';
    }
    console.error('sendReply failed:', e);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

/* Look up any active call_booking for this lead and render a panel with the
 * slot time + a Cancel button. Silent if there's no active booking. */
async function loadLeadCallBooking(leadId, leadName) {
  const slot = document.getElementById(`lead-call-booking-${leadId}`);
  if (!slot) return;
  try {
    const snap = await db.collection('call_bookings').where('leadId', '==', leadId).get();
    const active = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c.status !== 'cancelled')
      .sort((a, b) => (a.slotStart?.toMillis?.() || 0) - (b.slotStart?.toMillis?.() || 0));
    if (!active.length) { slot.innerHTML = ''; return; }

    slot.innerHTML = active.map(c => {
      const t = c.slotStart && c.slotStart.toDate ? c.slotStart.toDate() : null;
      const when = t
        ? t.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver' })
        : 'time unknown';
      return `
        <div style="background:rgba(201,168,76,0.10);border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:12px 14px;margin-bottom:14px">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:var(--gold);margin-bottom:4px">📞 Scheduled call</div>
          <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px">${escapeHtml(when)}</div>
          <button class="btn btn-danger btn-sm" onclick="cancelCallBooking(${jsStr(c.id)}, ${jsStr(leadName || '')})">Cancel booking</button>
        </div>`;
    }).join('');
  } catch (err) {
    console.warn('Could not load call booking:', err);
    slot.innerHTML = '';
  }
}

/* Show every duplicate submission that's been merged into this lead. */
async function showMergeHistory(leadId) {
  let l = crmLeads[leadId];
  if (!l) {
    const doc = await db.collection('leads').doc(leadId).get();
    if (!doc.exists) return;
    l = { id: leadId, ...doc.data() };
  }
  const history = Array.isArray(l.mergeHistory) ? l.mergeHistory : [];
  if (!history.length) { showToast('No merge history on this lead'); return; }

  /* Title goes through textContent — intentionally unescaped. See openLeadModal. */
  openModal(`Merged submissions for ${l.name || 'lead'}`, `
    <p class="text-muted" style="font-size:13px;line-height:1.5;margin-bottom:14px">
      This lead has ${history.length} duplicate submission${history.length===1?'':'s'} merged into it. Full pre-merge data is preserved below so nothing is lost. The current card already includes all unique info; conflicts (where both submissions had different values) are listed so you can decide whether to switch.
    </p>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${history.map((h, i) => {
        const when = h.mergedAt ? new Date(h.mergedAt).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}) : '';
        const submittedAt = h.snapshot?.createdAt?.seconds
          ? new Date(h.snapshot.createdAt.seconds * 1000).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})
          : '—';
        const snap = h.snapshot || {};
        const fields = ['email','phone','venue','eventType','eventDate','guestCount','budget','source','message','drinkDetail']
          .filter(k => snap[k]);
        return `
          <div style="border:1px solid var(--border);border-radius:10px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;flex-wrap:wrap;gap:6px">
              <div style="font-size:13px;font-weight:700">Submission #${i+1} <span class="text-muted" style="font-weight:400">· submitted ${escapeHtml(submittedAt)}</span></div>
              <div class="text-muted" style="font-size:11px">merged ${escapeHtml(when)} by ${escapeHtml(h.mergedBy || 'Admin')}</div>
            </div>
            ${Object.keys(h.conflicts || {}).length ? `
              <div style="background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.3);border-radius:8px;padding:8px 10px;margin-bottom:8px">
                <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#FACC15;margin-bottom:4px">Conflicts — current card kept</div>
                ${Object.entries(h.conflicts).map(([k,v]) => `<div style="font-size:12px;margin:2px 0"><strong>${escapeHtml(k)}:</strong> kept "${escapeHtml(v.kept)}" · also seen "${escapeHtml(v.dropped)}"</div>`).join('')}
              </div>` : ''}
            ${Object.keys(h.backfilled || {}).length ? `
              <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:8px 10px;margin-bottom:8px">
                <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#22c55e;margin-bottom:4px">Backfilled into current card</div>
                ${Object.entries(h.backfilled).map(([k,v]) => `<div style="font-size:12px;margin:2px 0"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</div>`).join('')}
              </div>` : ''}
            <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Full submission snapshot</div>
            <div style="font-size:12px;line-height:1.7">
              ${fields.length ? fields.map(k => `<div><strong>${k}:</strong> ${escapeHtml(snap[k])}</div>`).join('') : '<div class="text-muted">No additional fields recorded</div>'}
            </div>
          </div>`;
      }).join('')}
    </div>
  `, { wide: true });
}
/* NOTE: expo.js and scan-widget.js each declare a global `escapeHtml` too, and
 * nurture.js calls one without declaring any. These are classic scripts, so the
 * last one loaded wins for everybody — currently expo.js (index.html:192), whose
 * copy is byte-identical to this one. scan-widget's differs: it uses `String(t
 * || '')`, which turns 0/false into '' (a display bug, not an escaping gap) and
 * emits &#039; rather than &#39;. All three escape the same five characters, so
 * escaping is sound whichever wins — but this only holds by coincidence. If you
 * reorder the <script> tags or edit one copy, re-check the others. */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
/* jsStr() (inline-handler escaping) is defined once in app.js, which loads
 * before this module — used here for onclick/onchange id arguments. */
window.showMergeHistory = showMergeHistory;

function renderTaskList(tasks, leadId) {
  if (!tasks.length) return '<div style="font-size:12px;color:var(--text-muted)">No tasks</div>';
  return tasks.map((t,i) => `
    <div class="task-item ${t.done?'done':''}">
      <input type="checkbox" ${t.done?'checked':''} onchange="toggleTask(${jsStr(leadId)},${i},this.checked)"/>
      <span class="task-text">${escapeHtml(t.title)}</span>
      <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(t.assignee||'')}</span>
      <button class="task-delete" onclick="deleteTask(${jsStr(leadId)},${i})">✕</button>
    </div>`).join('');
}

// ── Lead actions ──
async function updateLeadStage(id, stage) {
  const l = crmLeads[id];
  const oldStage = l?.stage || 'New Lead';

  // Moving to Lost: capture a reason first so we learn WHY deals die.
  if (stage === 'Lost' && oldStage !== 'Lost') {
    openLostReasonModal(id);
    return;
  }

  await db.collection('leads').doc(id).update({ stage, updatedAt: TS() });

  // Activity log
  logActivity('status_changed', 'leads', id,
    `Moved '${l?.name||'Lead'}' from ${oldStage} to ${stage}`,
    { oldStage, newStage: stage }
  );

  // Auto-create project when booked
  if (stage === 'Booked') {
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

const LOST_REASONS = ['Price', 'Went with competitor', 'Went DIY / self-serve', 'Date unavailable', 'Ghosted / no response', 'Other'];

function openLostReasonModal(id) {
  const opts = LOST_REASONS.map(r => `<option value="${r}">${r}</option>`).join('');
  openModal('Why was this lead lost?', `
    <p class="text-muted" style="font-size:13px;margin-bottom:12px">Capturing the reason builds your win/loss data — so you can see whether price is ever really the blocker.</p>
    <label class="qb-field"><span>Reason</span>
      <select class="form-select" id="lost-reason-select">${opts}</select>
    </label>
    <label class="qb-field" style="margin-top:10px"><span>Notes (optional)</span>
      <textarea class="form-input" id="lost-reason-note" rows="3" placeholder="Anything useful — competitor name, budget gap, etc."></textarea>
    </label>
    <button class="btn btn-primary" style="margin-top:14px" onclick="confirmLostReason(${jsStr(id)})">Mark as Lost</button>
  `);
}

async function confirmLostReason(id) {
  const l = crmLeads[id];
  const oldStage = l?.stage || 'New Lead';
  const lostReason     = document.getElementById('lost-reason-select')?.value || 'Other';
  const lostReasonNote = document.getElementById('lost-reason-note')?.value?.trim() || '';

  await db.collection('leads').doc(id).update({
    stage: 'Lost', lostReason, lostReasonNote, lostAt: TS(), updatedAt: TS()
  });

  // Mirror the outcome onto the linked quote so win/loss analytics stay complete.
  if (l?.latestQuoteId) {
    try {
      await db.collection('quotes').doc(l.latestQuoteId).update({ outcome: 'lost', lostReason, lostReasonNote });
    } catch (e) { console.warn('Could not mark linked quote lost:', e); }
  }

  logActivity('status_changed', 'leads', id,
    `Marked '${l?.name || 'Lead'}' Lost — ${lostReason}`,
    { oldStage, newStage: 'Lost', lostReason });

  showToast('Marked as Lost', 'success');
  closeModal();
}

window.openLostReasonModal = openLostReasonModal;
window.confirmLostReason = confirmLostReason;

async function addNote(leadId) {
  const input = document.getElementById(`note-input-${leadId}`);
  const text  = input?.value?.trim();
  if (!text) return;
  const note = {
    text, author: currentUser?.displayName || 'Admin',
    time: new Date().toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
  };
  const l = crmLeads[leadId];
  const notes = [...normalizedNotes(l.notes), note];
  await db.collection('leads').doc(leadId).update({ notes, updatedAt: TS() });
  input.value = '';
  const thread = document.getElementById(`notes-thread-${leadId}`);
  if (thread) {
    thread.innerHTML = notes.map(n => `
      <div class="note-entry">
        <div class="note-meta">${escapeHtml(n.author)} · ${escapeHtml(n.time)}</div>
        <div class="note-text">${escapeHtml(n.text)}</div>
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
  const l = crmLeads[id];
  await db.collection('leads').doc(id).delete();
  logActivity('deleted', 'leads', id, `Deleted lead '${l?.name||'Unknown'}'`);
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
        <input class="form-input" name="name" value="${escapeHtml(l.name||'')}" required placeholder="Jane Smith"/></div>
      <div class="form-group"><label class="form-label">Email *</label>
        <input class="form-input" name="email" type="email" value="${escapeHtml(l.email||'')}" required placeholder="jane@email.com"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Phone</label>
        <input class="form-input" name="phone" value="${escapeHtml(l.phone||'')}" placeholder="(801) 555-0000"/></div>
      <div class="form-group"><label class="form-label">Event Type</label>
        <select class="form-select" name="eventType">
          <option value="">Select…</option>
          ${['Wedding','Corporate Event','Private Celebration','Themed Experience'].map(o => `<option ${l.eventType===o?'selected':''}>${o}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Event Date</label>
        <input class="form-input" name="eventDate" value="${escapeHtml(l.eventDate||'')}" placeholder="June 14, 2026"/></div>
      <div class="form-group"><label class="form-label">Guest Count</label>
        <input class="form-input" name="guestCount" value="${escapeHtml(l.guestCount||'')}" placeholder="~150"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Venue / Location</label>
        <input class="form-input" name="venue" value="${escapeHtml(l.venue||'')}" placeholder="The Grand, Salt Lake City"/></div>
      <div class="form-group"><label class="form-label">Budget</label>
        <!-- Text, not number: /book submits ranges like "$1,500–$2,500", which a
             number input silently blanks — and saveLeadEdit would then wipe the field. -->
        <input class="form-input" name="budget" value="${escapeHtml(l.budget||'')}" placeholder="1500 or $1,500–$2,500"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Source</label>
        <select class="form-select" name="source">
          ${['Website','Referral','Google','Instagram','Facebook','TikTok','Other'].map(o => `<option ${l.source===o?'selected':''}>${o}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Priority</label>
        <select class="form-select" name="priority">
          ${['Low','Normal','High','Urgent'].map(p => `<option ${(l.priority||'Normal')===p?'selected':''}>${p}</option>`).join('')}
        </select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Stage</label>
        <select class="form-select" name="stage">
          ${CRM_STAGES.map(s => `<option ${(l.stage||'New Lead')===s?'selected':''}>${s}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Follow-Up Date</label>
        <input class="form-input" name="followUpDate" type="date" value="${escapeHtml(l.followUpDate||'')}"/></div>
    </div>
    <div class="form-group"><label class="form-label">Message / Notes</label>
      <textarea class="form-textarea" name="message" placeholder="Vision, theme, special requests…">${escapeHtml(l.message||'')}</textarea></div>
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
  const docRef = await db.collection('leads').add(data);
  logActivity('created', 'leads', docRef.id, `New lead: ${data.name} (${data.eventType||'Event'})`);
  closeModal();
  showToast('Lead added!', 'success');
}

async function saveLeadEdit(e, id) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  data.updatedAt = TS();
  await db.collection('leads').doc(id).update(data);
  logActivity('updated', 'leads', id, `Updated lead: ${data.name}`);
  closeModal();
  showToast('Lead updated', 'success');
}
