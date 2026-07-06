/* ══════════════════════════════════════
   MODULE — NURTURE ENGINE (expo cohort)
   Automates the 6-tier follow-up cadence for the Wedding Expo leads.
   SAFETY: builds a send queue only. Nothing is emailed until Kendell flips
   settings/nurture.armed = true AND dryRun = false (see functions/dailyNurtureRun).
   ══════════════════════════════════════ */

const NURTURE_COHORT = 'WeddingExpo2026-05-09';
const NURTURE_TIERS = [
  { n: 1, label: 'URGENT · 0–3 mo out' },
  { n: 2, label: 'HOT · 3–6 mo out' },
  { n: 3, label: 'WARM · 6–12 mo out' },
  { n: 4, label: 'COOL · 12–18 mo out' },
  { n: 5, label: 'EARLY · 18+ mo out' },
  { n: 6, label: 'NO DATE SET' }
];

const NURTURE_DEFAULTS = { armed: false, dryRun: true, offer: '10% expo discount', pacingDays: 2 };

let _nurtureSettings = { ...NURTURE_DEFAULTS };
let _nurtureTemplates = {};
let _nurtureLeads = [];
let _nurtureReport = null;

function todayYMD() { return new Date().toISOString().slice(0, 10); }

function monthsUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
}

function nurtureTierFor(dateStr) {
  const m = monthsUntil(dateStr);
  if (m === null) return 6;
  if (m < 3) return 1;
  if (m < 6) return 2;
  if (m < 12) return 3;
  if (m < 18) return 4;
  return 5;
}

/* A lead is "due" if it has a tier, isn't paused, isn't a closed-stage lead,
   and its nextSendAt has arrived. Mirrors functions/dailyNurtureRun logic. */
function nurtureIsDue(lead) {
  const s = lead.nurtureState || {};
  if (!lead.nurtureTier) return false;
  if (s.paused) return false;
  if (['Booked', 'Booked-Tentative', 'Completed', 'Lost'].includes(lead.stage)) return false;
  return !s.nextSendAt || s.nextSendAt <= todayYMD();
}

async function renderNurture() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Nurture Engine</div>
        <div class="page-subtitle">Automated follow-up for the Wedding Expo cohort</div>
      </div>
    </div>
    <div id="nurture-body">Loading…</div>`;

  // Load settings, templates, cohort leads, and the latest weekly report.
  const [setDoc, tplDoc, leadsSnap, reportSnap] = await Promise.all([
    db.collection('settings').doc('nurture').get(),
    db.collection('settings').doc('nurture_templates').get(),
    db.collection('leads').where('campaign', '==', NURTURE_COHORT).get(),
    db.collection('nurture_reports').orderBy('date', 'desc').limit(1).get().catch(() => ({ docs: [] }))
  ]);
  _nurtureSettings = { ...NURTURE_DEFAULTS, ...(setDoc.exists ? setDoc.data() : {}) };
  _nurtureTemplates = tplDoc.exists ? tplDoc.data() : {};
  _nurtureLeads = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  _nurtureReport = (reportSnap.docs && reportSnap.docs[0]) ? reportSnap.docs[0].data() : null;

  renderNurtureBody();
}

function renderNurtureBody() {
  const el = document.getElementById('nurture-body');
  if (!el) return;
  const s = _nurtureSettings;
  const armed = s.armed && !s.dryRun;

  const banner = armed
    ? `<div class="card" style="border-left:4px solid var(--red);background:rgba(220,80,80,0.06)">
         <strong style="color:var(--red)">● LIVE — emails will send</strong>
         <p class="text-muted" style="font-size:13px;margin-top:4px">The daily job sends real email to due leads. Disarm to stop.</p>
         <button class="btn" style="margin-top:10px" onclick="nurtureSetArmed(false)">Disarm (back to dry-run)</button>
       </div>`
    : `<div class="card" style="border-left:4px solid var(--gold);background:rgba(201,168,76,0.06)">
         <strong style="color:var(--gold)">◐ DRY-RUN — nothing sends</strong>
         <p class="text-muted" style="font-size:13px;margin-top:4px">The daily job builds a preview queue only. Review the batch below, then arm to go live. First live batch should be Tier 1 only.</p>
         <button class="btn btn-primary" style="margin-top:10px" onclick="nurtureSetArmed(true)">Arm live sending…</button>
       </div>`;

  // Per-tier counts
  const byTier = {};
  NURTURE_TIERS.forEach(t => byTier[t.n] = { total: 0, due: 0, untiered: 0 });
  let untiered = 0;
  _nurtureLeads.forEach(l => {
    if (!l.nurtureTier) { untiered++; return; }
    const b = byTier[l.nurtureTier];
    if (!b) return;
    b.total++;
    if (nurtureIsDue(l)) b.due++;
  });

  const tierCards = NURTURE_TIERS.map(t => {
    const b = byTier[t.n];
    const tpl = _nurtureTemplates['tier' + t.n];
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <strong>Tier ${t.n}</strong>
        <span class="text-muted" style="font-size:12px">${t.label}</span>
      </div>
      <div style="font-size:28px;margin:6px 0">${b.total}<span class="text-muted" style="font-size:13px"> leads · ${b.due} due</span></div>
      <div class="text-muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${tpl ? '✉️ ' + (tpl.subject || '(no subject)') : '⚠️ no template — run seed'}
      </div>
    </div>`;
  }).join('');

  const dueTotal = Object.values(byTier).reduce((s2, b) => s2 + b.due, 0);

  el.innerHTML = `
    ${banner}
    <div class="card" style="margin-top:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-primary" onclick="nurtureAssignTiers()">Assign / refresh tiers</button>
        <button class="btn" onclick="nurturePreviewBatch()">Preview next batch (${dueTotal} due)</button>
        <span class="text-muted" style="font-size:13px">${_nurtureLeads.length} cohort leads · ${untiered} untiered · offer: ${_nurtureSettings.offer}</span>
      </div>
    </div>
    <div class="stat-grid" style="margin-top:14px">${tierCards}</div>
    ${_nurtureReport ? `<div class="card" style="margin-top:14px">
      <div class="card-header"><span class="card-title">📊 Weekly report — week of ${_nurtureReport.weekStart || '—'}</span></div>
      <div class="text-muted" style="font-size:13px">
        ${_nurtureReport.queuedSends || 0} sends queued · ${_nurtureReport.liveRuns || 0} live runs ·
        ${_nurtureReport.cohortBooked || 0} booked · ${_nurtureReport.cohortActive || 0} active · ${_nurtureReport.cohortPaused || 0} paused (in conversation)
      </div>
    </div>` : ''}
    <div id="nurture-queue" style="margin-top:14px"></div>`;
}

/* Assign a tier + first send date to every cohort lead that doesn't have one. */
async function nurtureAssignTiers() {
  let assigned = 0;
  const batch = db.batch();
  _nurtureLeads.forEach(l => {
    if (l.nurtureTier) return;
    const tier = nurtureTierFor(l.eventDate);
    batch.update(db.collection('leads').doc(l.id), {
      nurtureTier: tier,
      nurtureState: { nextSendAt: todayYMD(), sendsCompleted: 0, paused: false, pausedReason: '' },
      updatedAt: TS()
    });
    l.nurtureTier = tier;
    l.nurtureState = { nextSendAt: todayYMD(), sendsCompleted: 0, paused: false, pausedReason: '' };
    assigned++;
  });
  if (!assigned) { showToast('All cohort leads already have a tier', 'info'); return; }
  await batch.commit();
  logActivity('update', 'leads', 'nurture', `Assigned nurture tiers to ${assigned} leads`);
  showToast(`Assigned tiers to ${assigned} leads`, 'success');
  renderNurtureBody();
}

/* Show who WOULD be emailed on the next daily run (client-side preview). */
function nurturePreviewBatch() {
  const due = _nurtureLeads.filter(nurtureIsDue)
    .sort((a, b) => (a.nurtureTier || 9) - (b.nurtureTier || 9));
  const el = document.getElementById('nurture-queue');
  if (!due.length) { el.innerHTML = `<div class="card"><em class="text-muted">No leads are due right now.</em></div>`; return; }
  const rows = due.map(l => {
    const tpl = _nurtureTemplates['tier' + l.nurtureTier] || {};
    return `<tr>
      <td>${escapeHtml(l.name || '—')}</td>
      <td>${escapeHtml(l.email || '—')}</td>
      <td>Tier ${l.nurtureTier}</td>
      <td>${escapeHtml(l.eventDate || 'no date')}</td>
      <td class="text-muted" style="font-size:12px">${escapeHtml(tpl.subject || '⚠️ no template')}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Next batch — ${due.length} leads (preview only)</span></div>
      <p class="text-muted" style="font-size:12px;margin-bottom:10px">This is exactly what the daily job would send once armed. Nothing is sent from this screen.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Wedding</th><th>Subject</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

/* Flip the armed flag. Arming requires an explicit confirm. */
async function nurtureSetArmed(on) {
  if (on) {
    const ok = confirm('Arm LIVE nurture sending?\n\nThe daily job will email real leads that are due. Make sure you have previewed the batch and are starting with Tier 1 only. You can disarm any time.');
    if (!ok) return;
  }
  await db.collection('settings').doc('nurture').set(
    { armed: !!on, dryRun: !on }, { merge: true }
  );
  _nurtureSettings.armed = !!on;
  _nurtureSettings.dryRun = !on;
  logActivity('update', 'settings', 'nurture', on ? 'ARMED live nurture sending' : 'Disarmed nurture (dry-run)');
  showToast(on ? 'Nurture ARMED — live sending on' : 'Nurture disarmed — dry-run', on ? 'success' : 'info');
  renderNurtureBody();
}

window.renderNurture = renderNurture;
window.nurtureAssignTiers = nurtureAssignTiers;
window.nurturePreviewBatch = nurturePreviewBatch;
window.nurtureSetArmed = nurtureSetArmed;
