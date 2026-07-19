/* ═══════════════════════════════════════════════════════════════════════
   AGENT BRIEF WIDGET — plain-English "what happened / what needs you"
   summary at the top of the dashboard. Registered in the WIDGETS registry
   (dashboard.js) as id 'agentBrief'; renders into #w-agent-brief.
   Read-only: consumes the _dashData snapshot fetched by renderDashboard.
   ═══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* "2h ago" style relative time from a Firestore Timestamp / Date / string. */
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
    const w = Math.floor(days / 7);
    if (w < 5) return w + 'w ago';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function esc(s) {
    return (typeof escapeHtmlSafe === 'function')
      ? escapeHtmlSafe(s)
      : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function sectionHead(label) {
    return '<div class="dash-sub-label brief-section">' + esc(label) + '</div>';
  }
  function emptyLine(text) {
    return '<div class="brief-empty">' + esc(text) + '</div>';
  }

  /* One-liner for an activity doc: prefer its summary, fall back to
     "action collection" phrasing. */
  function activityLine(a, now) {
    const what = a.summary || [a.userName, a.action, a.collection].filter(Boolean).join(' ') || 'Something happened';
    return '<div class="brief-row"><span class="brief-dot"></span>' +
      '<span class="brief-text">' + esc(what) + '</span>' +
      '<span class="brief-time">' + esc(timeAgo(a.createdAt, now)) + '</span></div>';
  }

  /* ── Agent Chat — talk to your agents, kick off work, approve questions ──
     The chat DOM is built once and survives brief re-renders; messages stream
     in live from agent_chat/main/messages. Sending calls the agentChat
     function, which lets Claude queue agent_tasks / resolve followups. */
  let _chatUnsub = null;
  let _chatBusy = false;

  function chatShellHtml() {
    return (
      '<div class="dash-sub-label brief-section">TALK TO YOUR AGENTS</div>' +
      '<div class="brief-chat-log" id="brief-chat-log" aria-live="polite">' +
        '<div class="brief-empty">Say something — ask about the business, kick off work, or answer agent questions.</div>' +
      '</div>' +
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
    if (!docs.length) return; // keep the empty-state hint
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

    try {
      if (_chatUnsub) _chatUnsub();
      _chatUnsub = firebase.firestore()
        .collection('agent_chat').doc('main').collection('messages')
        .orderBy('createdAt', 'desc').limit(30)
        .onSnapshot(snap => renderChatMessages(snap.docs.slice().reverse()),
          err => console.warn('agent chat listen failed:', err.message));
    } catch (e) { console.warn('agent chat init failed:', e.message); }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (_chatBusy) return;
      const input = document.getElementById('brief-chat-input');
      const text = (input && input.value || '').trim();
      if (!text) return;
      input.value = '';
      setChatBusy(true);
      try {
        await firebase.functions().httpsCallable('agentChat')({ message: text });
        /* Reply arrives via the snapshot listener. */
      } catch (e) {
        const log = document.getElementById('brief-chat-log');
        if (log) log.insertAdjacentHTML('beforeend',
          '<div class="brief-chat-msg brief-chat-agent"><div class="brief-chat-bubble brief-chat-error">' +
          esc('Couldn\'t reach the agent: ' + (e.message || e)) + '</div></div>');
      } finally { setChatBusy(false); }
    });
  }

  /* Approve / deny an open followup straight from the brief (deterministic
     client-side write — no model in the loop for a button press). */
  async function resolveFollowup(id, decision) {
    try {
      await firebase.firestore().collection('kendell_followups').doc(id).update({
        status: 'answered', completed: true, decision,
        answeredVia: 'agent_brief', answeredAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      if (typeof renderDashboard === 'function') renderDashboard();
    } catch (e) { console.warn('resolveFollowup failed:', e.message); }
  }

  function renderAgentBriefWidget(data, now) {
    const el = document.getElementById('w-agent-brief');
    if (!el) return;
    data = data || {};
    now = now || new Date();

    /* Two-zone layout: #brief-summary is rebuilt every refresh; the chat is
       built once so the input, focus, and listener survive re-renders. */
    if (!document.getElementById('brief-summary') || !el.contains(document.getElementById('brief-summary'))) {
      el.innerHTML = '<div id="brief-summary"></div><div id="brief-chat">' + chatShellHtml() + '</div>';
      initChat();
      el.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-fu-id]');
        if (btn) resolveFollowup(btn.dataset.fuId, btn.dataset.fuDecision || 'done');
      });
    }
    const summaryEl = document.getElementById('brief-summary');
    renderBriefSummary(summaryEl, data, now);
  }

  function renderBriefSummary(el, data, now) {
    if (!el) return;

    /* ── Since you last looked — recent activity ── */
    const activity = (data.activity || []).slice(0, 5);
    const activityHtml = activity.length
      ? activity.map(a => activityLine(a, now)).join('')
      : emptyLine('All quiet — nothing new since your last visit.');

    /* ── Needs you — unmatched messages + open followups ── */
    const unmatched = (data.unmatched || [])
      .slice()
      .sort((a, b) => (toDate(b.sentAt || b.createdAt) || 0) - (toDate(a.sentAt || a.createdAt) || 0))
      .slice(0, 4);
    const followups = (data.followups || []).slice(0, 4);

    const unmatchedHtml = unmatched.map(m => {
      const who = m.fromDisplay || m.from || 'Unknown sender';
      const subj = m.subject || '(no subject)';
      return '<button type="button" class="brief-row brief-link" onclick="loadModule(\'crm\')" ' +
        'aria-label="Open CRM to handle message from ' + esc(who) + '">' +
        '<span class="brief-dot brief-dot-amber"></span>' +
        '<span class="brief-text"><strong>' + esc(subj) + '</strong> — from ' + esc(who) + '</span>' +
        '<span class="brief-time">' + esc(timeAgo(m.sentAt || m.createdAt, now)) + ' · CRM →</span></button>';
    }).join('');

    const followupsHtml = followups.map(f => {
      const btns = f.id
        ? '<span class="brief-fu-btns">' +
          '<button type="button" class="brief-fu-btn brief-fu-yes" data-fu-id="' + esc(f.id) + '" data-fu-decision="approved" aria-label="Approve">✓</button>' +
          '<button type="button" class="brief-fu-btn brief-fu-no" data-fu-id="' + esc(f.id) + '" data-fu-decision="denied" aria-label="Deny / dismiss">✕</button>' +
          '</span>'
        : '';
      return '<div class="brief-row"><span class="brief-dot brief-dot-amber"></span>' +
        '<span class="brief-text">' + esc(f.title || 'Follow-up needed') + '</span>' +
        btns +
        '<span class="brief-time">' + esc(timeAgo(f.createdAt, now)) + '</span></div>';
    }).join('');

    const needsYouHtml = (unmatchedHtml + followupsHtml) ||
      emptyLine('Nothing needs you right now. Enjoy it.');

    /* ── Pipeline — lead counts by stage ── */
    const leads = data.leads || [];
    const stageOrder = ['New Lead', 'Expo Email Sent', 'Call Scheduled', 'Contacted',
      'Proposal Sent', 'Booked-Tentative', 'Booked', 'Completed', 'Lost'];
    const counts = {};
    leads.forEach(l => {
      const s = l.stage || 'New Lead';
      counts[s] = (counts[s] || 0) + 1;
    });
    const stages = stageOrder.filter(s => counts[s])
      .concat(Object.keys(counts).filter(s => !stageOrder.includes(s)).sort());
    const pipelineHtml = stages.length
      ? '<div class="brief-pipeline">' + stages.map(s =>
          '<span class="brief-stage"><span class="brief-stage-n">' + counts[s] + '</span> ' + esc(s) + '</span>'
        ).join('') + '</div>'
      : emptyLine('No leads yet — time to go find some.');

    el.innerHTML =
      sectionHead('SINCE YOU LAST LOOKED') + activityHtml +
      sectionHead('NEEDS YOU') + needsYouHtml +
      sectionHead('PIPELINE') + pipelineHtml;
  }

  root.renderAgentBriefWidget = renderAgentBriefWidget;
})(typeof self !== 'undefined' ? self : this);
