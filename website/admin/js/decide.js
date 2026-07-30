/* ═══════════════════════════════════════════════════════════════════════
   DECIDE SCREEN — the landing page for actionable push notifications.
   Routes (see app.js):
     #decide/<followupId>        → show the item with one-tap answer buttons
     #act/<followupId>/<answer>  → apply the answer immediately (notification
                                   action button on Android/desktop), then
                                   show the confirmation state.
   Answering a `decision` item also queues an agent task so the comms agent
   ACTS on the answer (e.g. "No, we don't serve Vegas" → agent politely
   declines to the client). Kendell never needs to open the Claude app.
   ═══════════════════════════════════════════════════════════════════════ */

/* Map an answer keyword to the followup resolution + whether the agent acts. */
const DECIDE_ANSWERS = {
  yes:  { decision: 'approved', label: 'Yes',  emoji: '✅' },
  no:   { decision: 'denied',   label: 'No',   emoji: '❌' },
  done: { decision: 'done',     label: 'Handled', emoji: '✓' }
};

async function renderDecideScreen(fuId, preAnswer) {
  const c = document.getElementById('module-container');
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  history.replaceState(null, '', '#decide/' + fuId);
  c.innerHTML = '<div class="empty-state"><div class="skeleton skeleton-line w-1/2" style="height:28px;margin:0 auto 24px;"></div></div>';

  let doc;
  try { doc = await db.collection('kendell_followups').doc(fuId).get(); }
  catch (e) { c.innerHTML = decideShell('⚠️', 'Couldn\'t load this item', escapeHtmlSafe(e.message), ''); return; }

  if (!doc.exists) {
    c.innerHTML = decideShell('👻', 'This item no longer exists',
      'It may have been resolved and cleaned up already.', decideBackBtns(null));
    return;
  }
  const fu = { id: doc.id, ...doc.data() };

  /* Already resolved → confirm instead of double-acting (also catches a
     second tap on a stale notification). */
  if (fu.status !== 'open') {
    const via = fu.answeredVia || fu.resolvedBy || 'the CRM';
    c.innerHTML = decideShell('✅', 'Already handled',
      escapeHtmlSafe((fu.title || '') + ' — resolved via ' + via +
        (fu.decision ? ' (' + fu.decision + ')' : '') + '.'), decideBackBtns(fu.leadId));
    return;
  }

  /* Button tap on the notification itself → apply without asking again. */
  if (preAnswer && DECIDE_ANSWERS[preAnswer]) {
    await applyDecideAnswer(fu, preAnswer, '');
    return;
  }

  const isDecision = fu.type === 'decision';
  const btns = isDecision
    ? `<button type="button" class="decide-btn decide-yes" onclick="submitDecide('${escapeHtmlSafe(fu.id)}','yes')">✅ Yes — go ahead</button>
       <button type="button" class="decide-btn decide-no" onclick="submitDecide('${escapeHtmlSafe(fu.id)}','no')">❌ No — don't</button>`
    : `<button type="button" class="decide-btn decide-yes" onclick="submitDecide('${escapeHtmlSafe(fu.id)}','done')">✓ Mark handled</button>`;

  c.innerHTML = `
    <div class="decide-wrap">
      <div class="dash-sub-label" style="margin-bottom:8px">${isDecision ? '🤔 AGENT NEEDS YOUR CALL' : '⏰ NEEDS ATTENTION'}</div>
      <div class="decide-title">${escapeHtmlSafe(fu.title || 'Follow-up')}</div>
      <div class="decide-notes">${escapeHtmlSafe(fu.notes || '')}</div>
      <textarea id="decide-note" class="decide-note" rows="2"
        placeholder="Optional note — context or instructions for the agent…"></textarea>
      <div class="decide-btns">${btns}</div>
      <div class="decide-btns" style="margin-top:10px">${decideBackBtns(fu.leadId)}</div>
    </div>`;
  window._decideCurrent = fu;
}

function decideShell(icon, title, sub, btns) {
  return `<div class="decide-wrap" style="text-align:center">
    <div style="font-size:44px;margin-bottom:10px">${icon}</div>
    <div class="decide-title">${title}</div>
    <div class="decide-notes">${sub}</div>
    <div class="decide-btns" style="justify-content:center;margin-top:16px">${btns}</div>
  </div>`;
}

function decideBackBtns(leadId) {
  const lead = leadId
    ? `<button type="button" class="decide-btn decide-ghost" onclick="loadModule('crm/lead/${escapeHtmlSafe(leadId)}')">👤 Open lead card</button>`
    : '';
  return `${lead}<button type="button" class="decide-btn decide-ghost" onclick="loadModule('dashboard')">← Dashboard</button>`;
}

async function submitDecide(fuId, answer) {
  const fu = (window._decideCurrent && window._decideCurrent.id === fuId)
    ? window._decideCurrent : null;
  const note = (document.getElementById('decide-note') || {}).value || '';
  if (!fu) { renderDecideScreen(fuId, answer); return; }
  await applyDecideAnswer(fu, answer, note.trim());
}
window.submitDecide = submitDecide;

async function applyDecideAnswer(fu, answer, note) {
  const a = DECIDE_ANSWERS[answer] || DECIDE_ANSWERS.done;
  const c = document.getElementById('module-container');
  try {
    await db.collection('kendell_followups').doc(fu.id).update({
      status: a.decision === 'done' ? 'done' : 'answered',
      completed: true,
      decision: a.decision,
      decisionNote: note || '',
      answeredVia: 'push_action',
      answeredAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    /* Decisions feed straight back to the agent: queue the follow-on task so
       the comms agent acts on the answer without another human step. */
    if (fu.type === 'decision' && (a.decision === 'approved' || a.decision === 'denied')) {
      await db.collection('agent_tasks').add({
        agent: fu.sourceAgent || 'comms',
        kind: 'decision_followthrough',
        leadId: fu.leadId || null,
        title: `Act on decision: ${String(fu.title || '').replace(/^🤔\s*/, '').slice(0, 100)}`,
        instruction:
          `You previously asked: "${fu.notes || fu.title}". ` +
          `Kendell answered: ${a.label.toUpperCase()}${note ? ` — "${note}"` : ''}. ` +
          `Act on this decision now (query the lead + threads first for context). ` +
          `If it means telling a client no, decline warmly and professionally, and where it fits, ` +
          `point them somewhere useful. Update the lead stage/notes to reflect the outcome.`,
        status: 'queued', source: 'push_decision',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    /* Task items marked handled: clear a past-due followUpDate so the 8am
       scan doesn't resurrect the same reminder tomorrow. */
    if (fu.type !== 'decision' && fu.leadId) {
      try {
        const leadRef = db.collection('leads').doc(fu.leadId);
        const lead = await leadRef.get();
        const today = new Date().toISOString().slice(0, 10);
        if (lead.exists && lead.data().followUpDate && lead.data().followUpDate <= today) {
          await leadRef.update({ followUpDate: null, followUpClearedBy: 'push action: marked handled' });
        }
      } catch (e) { /* non-fatal */ }
    }

    const acted = fu.type === 'decision' && a.decision !== 'done'
      ? 'The agent has been queued to act on it — it\'ll handle the client reply within ~30 minutes.'
      : 'It won\'t nag you again.';
    c.innerHTML = decideShell(a.emoji, `${a.label} — got it`,
      `${escapeHtmlSafe(String(fu.title || '').replace(/^[🤔⏰💬📄🎉]\s*/, ''))}<br>${acted}`,
      decideBackBtns(fu.leadId));
    if (typeof showToast === 'function') showToast(`${a.emoji} Answer saved`);
  } catch (e) {
    c.innerHTML = decideShell('⚠️', 'Couldn\'t save your answer',
      escapeHtmlSafe(e.message) + '<br>Try again from the dashboard followups list.',
      decideBackBtns(fu.leadId));
  }
}
