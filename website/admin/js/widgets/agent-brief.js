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

  function renderAgentBriefWidget(data, now) {
    const el = document.getElementById('w-agent-brief');
    if (!el) return;
    data = data || {};
    now = now || new Date();

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

    const followupsHtml = followups.map(f =>
      '<div class="brief-row"><span class="brief-dot brief-dot-amber"></span>' +
      '<span class="brief-text">' + esc(f.title || 'Follow-up needed') + '</span>' +
      '<span class="brief-time">' + esc(timeAgo(f.createdAt, now)) + '</span></div>'
    ).join('');

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
