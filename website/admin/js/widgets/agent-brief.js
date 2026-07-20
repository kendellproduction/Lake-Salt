/* ═══════════════════════════════════════════════════════════════════════
   AGENT BRIEF WIDGET — executive-assistant hero.
   Left: the daily AI brief from agent_brief/latest (written by the
   dailyAgentBrief function at 7am MT): rotating quote → neon-highlighted
   summary → expandable task list → heads-up for later this week.
   Right: chat with manual sessions (only the active session's history is
   sent to the model, so topics never bleed together).
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  function toDate(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  function timeAgo(v, now) {
    const d = toDate(v);
    if (!d) return '';
    const s = Math.max(0, Math.floor(((now || new Date()) - d) / 1000));
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const days = Math.floor(h / 24);
    if (days < 7) return days + 'd ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function esc(s) {
    return (typeof escapeHtmlSafe === 'function')
      ? escapeHtmlSafe(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* "text with **key phrases**" → escaped HTML with cycling neon spans. */
  function neonize(text) {
    let i = 0;
    return String(text || '').split(/\*\*/).map((chunk, idx) =>
      idx % 2 === 1
        ? '<span class="brief-neon brief-neon-' + (i++ % 4) + '">' + esc(chunk) + '</span>'
        : esc(chunk)
    ).join('');
  }

  /* ─── Daily brief (left side) ──────────────────────────────────────── */
  let _brief = null;
  let _briefUnsub = null;
  let _briefBusy = false;

  function renderBrief() {
    const el = document.getElementById('brief-summary');
    if (!el) return;
    if (!_brief) {
      el.innerHTML =
        '<div class="brief-empty">No brief yet today.</div>' +
        '<button type="button" class="brief-refresh-cta" id="brief-generate-btn">✨ Generate my brief</button>';
      return;
    }
    const b = _brief;
    const tasksHtml = (b.tasks || []).map((t, i) => {
      const chip = t.status === 'handled'
        ? '<span class="brief-task-chip brief-chip-done">✓ handled</span>'
        : t.needsApproval
          ? '<button type="button" class="brief-task-approve" data-task-i="' + i + '">Approve</button>'
          : (t.status === 'fyi' ? '<span class="brief-task-chip brief-chip-fyi">fyi</span>' : '');
      return '<div class="brief-task" data-task-toggle="' + i + '">' +
        '<div class="brief-task-head"><span class="brief-task-title">' + esc(t.title) + '</span>' + chip + '</div>' +
        '<div class="brief-task-detail" id="brief-task-detail-' + i + '">' + esc(t.detail || '') + '</div>' +
      '</div>';
    }).join('');

    el.innerHTML =
      '<div class="brief-quote">“' + esc(b.quote || '') + '”</div>' +
      '<div class="brief-exec">' + neonize(b.brief) + '</div>' +
      (tasksHtml ? '<div class="dash-sub-label brief-section">TODAY</div>' + tasksHtml : '') +
      (b.headsUp ? '<div class="dash-sub-label brief-section">HEADS UP</div>' +
        '<div class="brief-headsup">' + esc(b.headsUp) + '</div>' : '') +
      '<div class="brief-meta-row">' +
        '<span>' + esc(timeAgo(b.generatedAt)) + '</span>' +
        '<button type="button" class="brief-refresh" id="brief-refresh-btn" aria-label="Refresh brief">⟳ refresh</button>' +
      '</div>';
  }

  async function refreshBrief() {
    if (_briefBusy) return;
    _briefBusy = true;
    const btn = document.getElementById('brief-refresh-btn') || document.getElementById('brief-generate-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'thinking…'; }
    try { await firebase.functions().httpsCallable('refreshAgentBrief')({}); }
    catch (e) { console.warn('refreshAgentBrief failed:', e.message); if (btn) { btn.disabled = false; btn.textContent = '⟳ retry'; } }
    finally { _briefBusy = false; }
    /* Fresh doc arrives via the snapshot listener. */
  }

  async function approveTask(i) {
    const t = _brief && _brief.tasks && _brief.tasks[i];
    if (!t || !t.action) return;
    try {
      await firebase.firestore().collection('agent_tasks').add({
        agent: t.action.agent || 'general',
        title: t.action.title || t.title,
        instruction: t.action.instruction || t.detail || '',
        status: 'queued', source: 'brief_approval',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      t.status = 'handled'; t.needsApproval = false;
      renderBrief();
    } catch (e) { console.warn('approveTask failed:', e.message); }
  }

  /* ─── Chat with manual sessions (right side) ───────────────────────── */
  const SESSION_KEY = 'ls_agent_chat_session';
  let _chatUnsub = null;
  let _chatBusy = false;

  function currentSession() {
    try { return localStorage.getItem(SESSION_KEY) || 'main'; } catch (e) { return 'main'; }
  }
  function setSession(id) {
    try { localStorage.setItem(SESSION_KEY, id); } catch (e) { /* ok */ }
    listenChat();
  }
  function newSession() {
    setSession('s' + Date.now().toString(36));
  }

  function chatShellHtml() {
    return (
      '<div class="brief-chat-head">' +
        '<span class="dash-sub-label brief-section" style="margin:0">TALK TO YOUR AGENTS</span>' +
        '<button type="button" class="brief-new-session" id="brief-new-session" title="Start a fresh conversation — old context won\'t carry over">＋ New session</button>' +
      '</div>' +
      '<div class="brief-chat-log" id="brief-chat-log" aria-live="polite"></div>' +
      '<form class="brief-chat-form" id="brief-chat-form">' +
        '<input type="text" id="brief-chat-input" class="brief-chat-input" maxlength="4000" ' +
          'placeholder="Message your agents…" autocomplete="off" aria-label="Message your agents">' +
        '<button type="submit" class="brief-chat-send" id="brief-chat-send" aria-label="Send">➤</button>' +
      '</form>'
    );
  }

  function renderChatMessages(docs) {
    const log = document.getElementById('brief-chat-log');
    if (!log) return;
    if (!docs.length) {
      log.innerHTML = '<div class="brief-empty">Fresh session — ask anything, kick off work, or make a call on something.</div>';
      return;
    }
    log.innerHTML = docs.map(d => {
      const m = d.data();
      const mine = m.role === 'user';
      const actions = (m.actions && m.actions.length)
        ? '<div class="brief-chat-actions">' + m.actions.map(a => '⚡ ' + esc(a)).join('<br>') + '</div>'
        : '';
      return '<div class="brief-chat-msg ' + (mine ? 'brief-chat-me' : 'brief-chat-agent') + '">' +
        '<div class="brief-chat-bubble">' + esc(m.text || '') + actions + '</div>' +
        '<div class="brief-chat-meta">' + (mine ? 'You' : 'Agent') + ' · ' + esc(timeAgo(m.createdAt)) + '</div>' +
      '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;
  }

  function listenChat() {
    try {
      if (_chatUnsub) _chatUnsub();
      _chatUnsub = firebase.firestore()
        .collection('agent_chat').doc(currentSession()).collection('messages')
        .orderBy('createdAt', 'desc').limit(30)
        .onSnapshot(snap => renderChatMessages(snap.docs.slice().reverse()),
          err => console.warn('agent chat listen failed:', err.message));
    } catch (e) { console.warn('agent chat init failed:', e.message); }
  }

  function setChatBusy(busy) {
    _chatBusy = busy;
    const send = document.getElementById('brief-chat-send');
    const input = document.getElementById('brief-chat-input');
    if (send) { send.disabled = busy; send.textContent = busy ? '…' : '➤'; }
    if (input) input.disabled = busy;
  }

  function initChat() {
    const form = document.getElementById('brief-chat-form');
    if (!form || form.dataset.wired) return;
    form.dataset.wired = '1';
    listenChat();

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (_chatBusy) return;
      const input = document.getElementById('brief-chat-input');
      const text = (input && input.value || '').trim();
      if (!text) return;
      input.value = '';
      setChatBusy(true);
      try {
        await firebase.functions().httpsCallable('agentChat')({ message: text, sessionId: currentSession() });
      } catch (e) {
        const log = document.getElementById('brief-chat-log');
        if (log) log.insertAdjacentHTML('beforeend',
          '<div class="brief-chat-msg brief-chat-agent"><div class="brief-chat-bubble brief-chat-error">' +
          esc('Couldn\'t reach the agent: ' + (e.message || e)) + '</div></div>');
      } finally { setChatBusy(false); }
    });
  }

  /* ─── Widget entry point ───────────────────────────────────────────── */
  function renderAgentBriefWidget(data, now) {
    const el = document.getElementById('w-agent-brief');
    if (!el) return;

    if (!document.getElementById('brief-summary') || !el.contains(document.getElementById('brief-summary'))) {
      el.innerHTML = '<div id="brief-summary">Loading…</div><div id="brief-chat">' + chatShellHtml() + '</div>';
      initChat();

      /* One delegated click handler for the whole widget. */
      el.addEventListener('click', (ev) => {
        const approve = ev.target.closest('[data-task-i]');
        if (approve) { ev.stopPropagation(); approveTask(Number(approve.dataset.taskI)); return; }
        const toggle = ev.target.closest('[data-task-toggle]');
        if (toggle) {
          const d = document.getElementById('brief-task-detail-' + toggle.dataset.taskToggle);
          if (d) d.classList.toggle('open');
          return;
        }
        if (ev.target.closest('#brief-refresh-btn') || ev.target.closest('#brief-generate-btn')) { refreshBrief(); return; }
        if (ev.target.closest('#brief-new-session')) { newSession(); return; }
      });

      /* Live-follow the daily brief doc. */
      try {
        if (_briefUnsub) _briefUnsub();
        _briefUnsub = firebase.firestore().collection('agent_brief').doc('latest')
          .onSnapshot(doc => { _brief = doc.exists ? doc.data() : null; renderBrief(); },
            err => console.warn('brief listen failed:', err.message));
      } catch (e) { console.warn('brief init failed:', e.message); }
    }
  }

  root.renderAgentBriefWidget = renderAgentBriefWidget;
})(typeof self !== 'undefined' ? self : this);
