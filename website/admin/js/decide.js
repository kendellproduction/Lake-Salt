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

/* Resolve any answer key — fixed (yes/no/done), an agent-supplied option
   ('opt:<key>' from a notification button, or the key itself from an in-app
   button), or 'custom' (free-text note is the whole answer). */
function resolveDecideAnswer(fu, answer, note) {
  if (DECIDE_ANSWERS[answer]) return { ...DECIDE_ANSWERS[answer], acts: answer !== 'done' };
  const key = String(answer || '').replace(/^opt:/, '');
  const opt = (fu.options || []).find(o => o.key === key);
  if (opt) return { decision: 'option:' + opt.key, label: opt.label, emoji: '👉', acts: true };
  if (answer === 'custom' && note) return { decision: 'custom', label: 'Guidance sent', emoji: '🧭', acts: true };
  return { ...DECIDE_ANSWERS.done, acts: false };
}

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

  /* Button tap on the notification itself → apply without asking again.
     Handles yes/no/done AND agent-supplied 'opt:<key>' actions. */
  if (preAnswer && (DECIDE_ANSWERS[preAnswer] ||
      (fu.options || []).some(o => 'opt:' + o.key === preAnswer || o.key === preAnswer))) {
    await applyDecideAnswer(fu, preAnswer, '');
    return;
  }

  const isDecision = fu.type === 'decision';
  const hasOpts = Array.isArray(fu.options) && fu.options.length > 0;
  /* Buttons: agent-supplied choices win; else Yes/No for decisions, Done for tasks. */
  const btns = hasOpts
    ? fu.options.map((o, i) =>
        `<button type="button" class="decide-btn ${i === 0 ? 'decide-yes' : ''}" onclick="submitDecide('${escapeHtmlSafe(fu.id)}','${escapeHtmlSafe(o.key)}')">${escapeHtmlSafe(o.label)}</button>`).join('')
    : isDecision
      ? `<button type="button" class="decide-btn decide-yes" onclick="submitDecide('${escapeHtmlSafe(fu.id)}','yes')">✅ Yes — go ahead</button>
         <button type="button" class="decide-btn decide-no" onclick="submitDecide('${escapeHtmlSafe(fu.id)}','no')">❌ No — don't</button>`
      : `<button type="button" class="decide-btn decide-yes" onclick="submitDecide('${escapeHtmlSafe(fu.id)}','done')">✓ Mark handled</button>`;

  c.innerHTML = `
    <div class="decide-wrap">
      <div class="dash-sub-label" style="margin-bottom:8px">${isDecision ? '🤔 AGENT NEEDS YOUR CALL' : '⏰ NEEDS ATTENTION'}</div>
      <div class="decide-title">${escapeHtmlSafe(fu.title || 'Follow-up')}</div>
      <div class="decide-notes">${escapeHtmlSafe(fu.notes || '')}</div>
      <div class="decide-btns">${btns}</div>
      <div class="dash-sub-label" style="margin:16px 0 6px">🧭 GUIDANCE FOR YOUR AGENT <span class="decide-private">private — never sent to the client</span></div>
      <textarea id="decide-note" class="decide-note" rows="3"
        placeholder="Coach the agent in your own words — e.g. 'Yes, but only if they cover travel' or 'Decline politely and refer them to someone in Vegas'. It writes its own client message from this."
        oninput="document.getElementById('decide-custom-send').style.display = this.value.trim() ? '' : 'none'"></textarea>
      <div class="decide-btns">
        <button type="button" id="decide-custom-send" class="decide-btn" style="display:none"
          onclick="submitDecide('${escapeHtmlSafe(fu.id)}','custom')">🧭 Send guidance to agent</button>
      </div>
      <div class="decide-hint">Tap a button above to answer directly — anything typed here rides along as private instructions. Or send guidance alone and let the agent run with it.</div>
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
  const note = ((document.getElementById('decide-note') || {}).value || '').trim();
  if (answer === 'custom' && !note) {
    if (typeof showToast === 'function') showToast('Type your answer first', 'warning');
    return;
  }
  if (!fu) { renderDecideScreen(fuId, answer); return; }
  await applyDecideAnswer(fu, answer, note);
}
window.submitDecide = submitDecide;

async function applyDecideAnswer(fu, answer, note) {
  const a = resolveDecideAnswer(fu, answer, note);
  const c = document.getElementById('module-container');
  try {
    await db.collection('kendell_followups').doc(fu.id).update({
      status: a.decision === 'done' ? 'done' : 'answered',
      completed: true,
      decision: a.decision,
      decisionLabel: a.label,
      decisionNote: note || '',
      answeredVia: 'push_action',
      answeredAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    /* Decisions feed straight back to the agent: queue the follow-on task so
       the comms agent acts on the answer without another human step. Runs for
       yes/no, agent-supplied options, and free-text custom answers alike. */
    if (fu.type === 'decision' && a.acts) {
      const answerLine = a.decision === 'custom'
        ? `Kendell didn't pick a button — instead he sent you this guidance: "${note}".`
        : `Kendell chose: "${a.label}".${note ? ` He also sent you this guidance: "${note}".` : ''}`;
      await db.collection('agent_tasks').add({
        agent: fu.sourceAgent || 'comms',
        kind: 'decision_followthrough',
        leadId: fu.leadId || null,
        title: `Act on decision: ${String(fu.title || '').replace(/^🤔\s*/, '').slice(0, 100)}`,
        instruction:
          `You previously asked: "${fu.notes || fu.title}". ` +
          answerLine + ' ' +
          `IMPORTANT: any guidance quoted above is PRIVATE coaching from Kendell to you — never forward ` +
          `or paste it to a client; follow its intent and write your own client-facing words. ` +
          `Act on this answer now (query the lead + threads first for context). ` +
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

    const acted = fu.type === 'decision' && a.acts
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
