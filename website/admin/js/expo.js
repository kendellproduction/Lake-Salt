/* ══════════════════════════════════════════════════════════════════════════
   MODULE 8 — EXPOS HUB

   One place to view and manage every expo Lake Salt has done (or will do).
   Designed to scale: add a new entry to EXPOS below and the hub picks it up.

   Views:
     1. List view   → grid of expo cards (when no expo is selected)
     2. Detail view → tabbed interface for one expo:
          • Overview   — at-a-glance stats + status
          • Analytics  — live cohort + funnel + traffic charts
          • Cohort     — per-bucket lead lists (paste-ready BCC)
          • Notes      — free-form notes + learnings (Firestore-backed, autosaved)
          • Prep       — checklist + cost tracker for upcoming expos

   Adding a future expo:
     1. Add an entry to the EXPOS array below
     2. Tag leads with the matching `campaign` value (e.g. via /book URL)
     3. Reload — it shows up automatically

   Phase 2: replace EXPOS with a Firestore-backed `expos` collection so adding
   one is a UI action instead of a code edit.
   ════════════════════════════════════════════════════════════════════════ */

const EXPOS = [
  {
    id: 'wedding-expo-2026-05-09',
    name: 'Salt Lake City Bridal & Wedding Expo',
    venue: 'Mountain America Expo Center, Sandy UT',
    date: '2026-05-09',                  // the actual day-of expo (used for hourly traffic chart)
    eventDayStartHour: 12,               // 12pm Mountain — expo doors open
    eventDayEndHour:   19,               // 7pm Mountain — expo doors close
    status: 'completed',                 // upcoming | prepping | active | completed | archived
    campaign: 'WeddingExpo2026-05-09',   // matches lead/page_event campaign tag
    eventStart: '2026-05-08T00:00:00',   // 4-day capture window for sessions
    eventEnd:   '2026-05-12T00:00:00',
    /* Cost is the local default. The Firestore expos/{id} doc may override it
     * via a 'costOverride' field saved from the editable UI. */
    cost: 1200,
    expectedNextRegistration: '2026-11-01', // when next year's signup opens (estimate)
  },
  // Future expos go here — same shape:
  // {
  //   id: 'fall-bridal-2026-09-19',
  //   name: 'Fall Bridal Showcase',
  //   ...
  //   status: 'upcoming',
  // },
];

let _expoState = {
  activeId: null,            // null = list view; expo.id = detail view
  activeTab: 'overview',     // overview | analytics | cohort | notes | prep
  charts: {},
  notesTimer: null,
  buckets: null,
  leads: [],
  events: [],
};

async function renderExpo() {
  /* Always wipe old charts when re-rendering */
  Object.values(_expoState.charts).forEach(ch => { try { ch.destroy(); } catch(e){} });
  _expoState.charts = {};

  /* Auto-select the only expo on first render so users don't see a single-card list */
  if (_expoState.activeId == null && EXPOS.length === 1) {
    _expoState.activeId = EXPOS[0].id;
  }

  if (!_expoState.activeId) return renderExpoList();
  const expo = EXPOS.find(e => e.id === _expoState.activeId);
  if (!expo) { _expoState.activeId = null; return renderExpoList(); }
  return renderExpoDetail(expo);
}

/* ─── LIST VIEW ──────────────────────────────────────────────────────── */
function renderExpoList() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Expos</div>
        <div class="page-subtitle">Every expo Lake Salt has worked — analytics, notes, and learnings in one place.</div>
      </div>
      <button class="btn btn-secondary" onclick="alert('Coming in Phase 2 — for now add a new entry to EXPOS in admin/js/expo.js')">+ Add expo</button>
    </div>

    <div class="dashboard-grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px">
      ${EXPOS.map(e => `
        <div class="card" style="cursor:pointer;transition:transform 0.15s,border-color 0.15s" onclick="openExpo('${e.id}')" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:500;color:var(--text);line-height:1.2">${escapeHtml(e.name)}</div>
            ${statusPill(e.status)}
          </div>
          <div class="text-muted" style="font-size:13px;margin-bottom:4px">${formatDate(e.date)}</div>
          <div class="text-muted" style="font-size:12px;margin-bottom:14px">${escapeHtml(e.venue || '')}</div>
          <div style="font-size:12px;color:var(--gold);letter-spacing:0.06em;text-transform:uppercase">View →</div>
        </div>
      `).join('')}
    </div>
  `;
}

function openExpo(id) {
  _expoState.activeId = id;
  _expoState.activeTab = 'overview';
  renderExpo();
}
function backToExpoList() {
  _expoState.activeId = null;
  /* Clean up any active listeners (analytics tab) */
  cleanupListeners();
  renderExpo();
}
function setExpoTab(tab) {
  _expoState.activeTab = tab;
  cleanupListeners();
  Object.values(_expoState.charts).forEach(ch => { try { ch.destroy(); } catch(e){} });
  _expoState.charts = {};
  renderExpoDetail(EXPOS.find(e => e.id === _expoState.activeId));
}

/* ─── DETAIL VIEW ────────────────────────────────────────────────────── */
function renderExpoDetail(expo) {
  const c = document.getElementById('module-container');
  const tab = _expoState.activeTab;
  c.innerHTML = `
    <div class="page-header">
      <div>
        <a href="#expo" onclick="backToExpoList();return false;" style="font-size:12px;color:var(--gold);text-decoration:none;letter-spacing:0.08em;text-transform:uppercase">← All expos</a>
        <div class="page-title" style="margin-top:4px">${escapeHtml(expo.name)}</div>
        <div class="page-subtitle">${formatDate(expo.date)} · ${escapeHtml(expo.venue || '')} ${statusPill(expo.status)}</div>
      </div>
    </div>

    <!-- Tab strip -->
    <div style="display:flex;gap:6px;border-bottom:1px solid var(--border);margin-bottom:20px;flex-wrap:wrap">
      ${[
        ['overview',  'Overview'],
        ['analytics', 'Analytics'],
        ['cohort',    'Cohort'],
        ['notes',     'Notes & Learnings'],
        ['prep',      'Prep & Logistics'],
      ].map(([id, label]) => `
        <button onclick="setExpoTab('${id}')" style="font-family:inherit;background:transparent;border:none;color:${tab === id ? 'var(--gold)' : 'var(--text-muted)'};padding:10px 18px;cursor:pointer;font-size:13px;font-weight:${tab === id ? 600 : 500};letter-spacing:0.04em;border-bottom:2px solid ${tab === id ? 'var(--gold)' : 'transparent'};margin-bottom:-1px">${label}</button>
      `).join('')}
    </div>

    <div id="expo-tab-content"></div>
  `;

  /* Render the active tab */
  if      (tab === 'overview')  renderTabOverview(expo);
  else if (tab === 'analytics') renderTabAnalytics(expo);
  else if (tab === 'cohort')    renderTabCohort(expo);
  else if (tab === 'notes')     renderTabNotes(expo);
  else if (tab === 'prep')      renderTabPrep(expo);
}

/* ─── TAB: OVERVIEW ──────────────────────────────────────────────────── */
async function renderTabOverview(expo) {
  const el = document.getElementById('expo-tab-content');
  el.innerHTML = `
    <div class="stat-grid" id="ov-stats">
      ${[1,2,3,4,5].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="card" style="margin-top:18px">
      <div class="card-header"><span class="card-title">Snapshot</span></div>
      <div id="ov-snapshot" style="font-size:14px;line-height:1.7"></div>
    </div>
  `;

  /* Wrap Firestore reads so a query failure surfaces in the UI instead of
   * leaving the skeleton spinning forever. */
  let leadsSnap, evSnap;
  try {
    leadsSnap = await db.collection('leads').where('campaign', '==', expo.campaign).get();
  } catch (e) {
    return showOverviewError('Couldn\'t load leads — ' + (e.message || e.code || e));
  }
  const leads = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.email && !String(l.email).includes('@test.local'));
  const ig = leads.filter(l => l.instagramFollowed).length;
  const buckets = bucketize(leads);
  const near = buckets['0-3'].length + buckets['3-6'].length;

  /* Pull traffic — count, no painting on overview */
  const start = firebase.firestore.Timestamp.fromDate(new Date(expo.eventStart));
  const end   = firebase.firestore.Timestamp.fromDate(new Date(expo.eventEnd));
  let events = [];
  try {
    evSnap = await db.collection('page_events')
      .where('timestamp', '>=', start).where('timestamp', '<=', end).limit(5000).get();
    events = evSnap.docs.map(d => d.data());
  } catch (e) {
    /* Don't block the whole page if traffic query fails — just zero it out. */
    console.warn('expo overview: page_events read failed', e);
  }
  const sessions = new Set(events.map(e => e.sessionId));
  const raffSess = new Set(events.filter(e => e.event === 'raffle_submitted').map(e => e.sessionId));
  const bookSess = new Set(events.filter(e => (e.page||'').includes('book')).map(e => e.sessionId));
  const conv = bookSess.size ? Math.round((raffSess.size / bookSess.size) * 100) : 0;

  /* Cache lead arrays for drill-down on each stat card */
  _expoState._drill = {
    total: { title: 'All entries · ' + leads.length, leads: leads, blurb: 'Every raffle / call / info-only submission tagged with this expo\'s campaign.' },
    near:  { title: 'Near-term pipeline · ' + near, leads: [...buckets['0-3'], ...buckets['3-6']], blurb: 'Brides whose wedding is within 6 months of today (' + new Date().toLocaleDateString() + ').' },
    ig:    { title: 'Brides who checked the IG-follow box · ' + ig, leads: leads.filter(l => l.instagramFollowed), blurb: 'Self-reported on the raffle form. Actual @lakesaltbartending follower count is tracked separately on Instagram. Per Kendell: ~22 NEW followers gained around the expo.' },
  };

  document.getElementById('ov-stats').innerHTML = `
    <div class="stat-card gold drill" data-drill="total" style="cursor:pointer">
      <div class="stat-label" title="Every raffle, call, or info-only submission tagged with this expo's campaign.">Total entries</div>
      <div class="stat-value">${leads.length}</div>
      <div class="stat-sub">${leadsSnap.size - leads.length} test rows excluded · click to view list</div>
    </div>
    <div class="stat-card drill" data-drill="ig" style="cursor:pointer;border-left:3px solid #C9A84C">
      <div class="stat-label" title="Self-reported via the IG-follow checkbox during raffle entry. Not a true new-follower count — for that, monitor Instagram directly.">IG opt-in (self-reported)</div>
      <div class="stat-value">${ig} <span style="font-size:14px;color:var(--text-muted);font-weight:400">/${leads.length}</span></div>
      <div class="stat-sub">~22 actual new IG followers (per Kendell)</div>
    </div>
    <div class="stat-card drill" data-drill="near" style="cursor:pointer;border-left:3px solid var(--green)">
      <div class="stat-label" title="Wedding date is within 6 months of today.">Near-term pipeline</div>
      <div class="stat-value" style="color:var(--green)">${near}</div>
      <div class="stat-sub">brides ≤ 6 mo out · click to view</div>
    </div>
    <div class="stat-card">
      <div class="stat-label" title="An anonymous browser session that visited /book at any point during the campaign window. One bride may have multiple sessions if she came back later.">/book sessions</div>
      <div class="stat-value">${sessions.size}</div>
      <div class="stat-sub">${events.length} events captured</div>
    </div>
    <div class="stat-card">
      <div class="stat-label" title="Of the sessions that landed on /book, what percent completed a raffle entry. Higher = the page is converting well.">Raffle conv.</div>
      <div class="stat-value">${conv}%</div>
      <div class="stat-sub">${raffSess.size} of ${bookSess.size} /book sessions</div>
    </div>
  `;

  /* Wire drill-down clicks */
  document.querySelectorAll('#ov-stats .drill').forEach(card => {
    card.addEventListener('click', () => openExpoDrill(card.dataset.drill));
  });

  /* Cache for analytics tab */
  _expoState.leads = leads;
  _expoState.events = events;
  _expoState.buckets = buckets;

  /* Cost: pull override from Firestore if user edited it */
  let costNow = expo.cost;
  try {
    const d = await db.collection('expos').doc(expo.id).get();
    if (d.exists && typeof d.data().costOverride === 'number') costNow = d.data().costOverride;
  } catch (e) { /* ignore */ }

  document.getElementById('ov-snapshot').innerHTML = `
    <div><strong>Status:</strong> ${escapeHtml(expo.status)}</div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <strong>Total cost:</strong>
      <input type="number" id="ov-cost" value="${costNow || 0}" style="width:100px;background:rgba(255,255,255,0.04);border:1.5px solid var(--border);border-radius:6px;color:var(--text);padding:4px 8px;font-family:inherit;font-size:14px" />
      <button class="btn btn-secondary" id="ov-cost-save" style="font-size:11px;padding:4px 12px">Save</button>
      <a href="#expenses" style="font-size:12px;color:var(--gold);text-decoration:none">Track itemized expenses →</a>
    </div>
    <div style="font-size:12px;color:var(--text-muted)">Total includes booth fee, samples, prizes, travel, signage, etc. Add itemized entries via the Expenses module above for full P&amp;L tracking.</div>
    <div style="margin-top:6px"><strong>Campaign tag:</strong> <code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px">${escapeHtml(expo.campaign)}</code></div>
    ${expo.expectedNextRegistration ? `<div><strong>Next-year registration window:</strong> est. ${formatDate(expo.expectedNextRegistration)} (Phase 2 agent will monitor)</div>` : ''}
  `;

  document.getElementById('ov-cost-save').addEventListener('click', async () => {
    const v = parseFloat(document.getElementById('ov-cost').value);
    if (isNaN(v)) return showToast('Invalid number', 'warn');
    try {
      await db.collection('expos').doc(expo.id).set({ costOverride: v, expoId: expo.id }, { merge: true });
      showToast('Cost saved');
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  });

  /* Raffle draw section */
  const drawCard = document.createElement('div');
  drawCard.className = 'card';
  drawCard.style.marginTop = '18px';
  drawCard.innerHTML = `
    <div class="card-header">
      <span class="card-title">🎲 Raffle winner draw</span>
      <span class="text-muted" style="font-size:12px">Crypto-grade fair random — spin as many times as you want</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <label style="font-size:13px;color:var(--text-muted)">Winners to draw:</label>
      <input type="number" id="raffle-count" value="4" min="1" max="20" style="width:70px;background:rgba(255,255,255,0.04);border:1.5px solid var(--border);border-radius:6px;color:var(--text);padding:4px 8px;font-family:inherit;font-size:14px">
      <button class="btn btn-primary" id="raffle-draw-btn" style="font-size:13px">🎲 Draw winner${'(s)'}</button>
      <button class="btn btn-secondary" id="raffle-redraw-btn" style="font-size:13px">↺ Spin again</button>
      <span class="text-muted" id="raffle-pool-info" style="font-size:12px"></span>
    </div>
    <div id="raffle-results"></div>
  `;
  document.getElementById('expo-tab-content').appendChild(drawCard);

  /* Cache for raffle drawing */
  _expoState._raffleLeads = leads;

  document.getElementById('raffle-pool-info').textContent = `Pool: ${leads.length} eligible (test rows excluded)`;
  document.getElementById('raffle-draw-btn').addEventListener('click', () => drawRaffleWinners(expo));
  document.getElementById('raffle-redraw-btn').addEventListener('click', () => drawRaffleWinners(expo));

  /* Quick links — moved here from the main Dashboard so the dashboard stays clean. */
  const linksCard = document.createElement('div');
  linksCard.className = 'card';
  linksCard.style.marginTop = '18px';
  linksCard.innerHTML = `
    <div class="card-header"><span class="card-title">Quick links for this expo</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">
      <a href="/expo" target="_blank" rel="noopener" style="text-decoration:none;display:flex;flex-direction:column;padding:14px;background:rgba(201,169,110,0.18);border:1px solid rgba(201,169,110,0.4);border-radius:10px;color:var(--text);transition:background 0.2s" onmouseover="this.style.background='rgba(201,169,110,0.28)'" onmouseout="this.style.background='rgba(201,169,110,0.18)'">
        <span style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#DFC08A">QR Target</span>
        <span style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:500;margin-top:2px">Raffle Page →</span>
        <span style="font-size:11px;color:var(--text-muted);margin-top:4px">What the QR scans to</span>
      </a>
      <a href="/book" target="_blank" rel="noopener" style="text-decoration:none;display:flex;flex-direction:column;padding:14px;background:rgba(34,197,94,0.18);border:1px solid rgba(34,197,94,0.4);border-radius:10px;color:var(--text);transition:background 0.2s" onmouseover="this.style.background='rgba(34,197,94,0.28)'" onmouseout="this.style.background='rgba(34,197,94,0.18)'">
        <span style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#86efac">Public Wizard</span>
        <span style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:500;margin-top:2px">Book a Date →</span>
        <span style="font-size:11px;color:var(--text-muted);margin-top:4px">9-step wizard + 15-min call slot picker</span>
      </a>
      <a href="expo-booth-prints.html" target="_blank" rel="noopener" style="text-decoration:none;display:flex;flex-direction:column;padding:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18);border-radius:10px;color:var(--text);transition:background 0.2s" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
        <span style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#DFC08A">Print</span>
        <span style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:500;margin-top:2px">Booth Signs →</span>
        <span style="font-size:11px;color:var(--text-muted);margin-top:4px">Table tent + lanyard cards</span>
      </a>
      <a href="#crm" onclick="setTimeout(()=>typeof setCohort==='function'&&setCohort('${escapeHtml(expo.campaign)}'),200)" style="text-decoration:none;display:flex;flex-direction:column;padding:14px;background:rgba(59,130,246,0.18);border:1px solid rgba(59,130,246,0.4);border-radius:10px;color:var(--text);transition:background 0.2s" onmouseover="this.style.background='rgba(59,130,246,0.28)'" onmouseout="this.style.background='rgba(59,130,246,0.18)'">
        <span style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#93c5fd">Live</span>
        <span style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:500;margin-top:2px">Cohort in CRM →</span>
        <span style="font-size:11px;color:var(--text-muted);margin-top:4px">Filtered CRM view of these leads</span>
      </a>
    </div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted)">
      <strong style="color:#DFC08A">Booth flow:</strong> brides scan QR → /expo raffle → tap "book a 15-min call" → /book wizard. No staff phones; one iPad behind bar for the rare assist case.
    </div>
  `;
  document.getElementById('expo-tab-content').appendChild(linksCard);

  /* Tip block at the bottom */
  const tip = document.createElement('div');
  tip.style = 'margin-top:14px;color:var(--text-muted);font-size:13px';
  tip.innerHTML = 'Tabs above: <em>Analytics</em> for charts &amp; funnel · <em>Cohort</em> for the wedding-date buckets &amp; paste-ready emails · <em>Notes</em> for thoughts &amp; learnings · <em>Prep</em> for checklists.';
  document.getElementById('expo-tab-content').appendChild(tip);
}

function showOverviewError(msg) {
  const el = document.getElementById('expo-tab-content');
  if (!el) return;
  el.innerHTML = `
    <div class="card" style="border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.06)">
      <div class="card-header"><span class="card-title" style="color:#ef4444">Couldn't load this expo's data</span></div>
      <div style="font-size:13px;color:var(--text);line-height:1.5">${escapeHtml(msg)}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:14px">
        If you're signed in but still seeing this, your account may not be in the <code>admins</code> Firestore collection.
        Try the <a href="#crm" style="color:var(--gold)">CRM</a> tab — if it loads there, it's an expo-specific bug, ping Kendell.
      </div>
      <button class="btn btn-secondary" onclick="renderExpo()" style="margin-top:14px">Retry</button>
    </div>
  `;
}

/* ─── TAB: ANALYTICS ─────────────────────────────────────────────────── */
function renderTabAnalytics(expo) {
  const el = document.getElementById('expo-tab-content');
  el.innerHTML = `
    <div class="dashboard-grid" style="grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><span class="card-title">Wedding-date distribution</span><span class="text-muted" id="ana-distro-sub" style="font-size:12px"></span></div>
        <div style="position:relative;height:260px;width:100%"><canvas id="ana-distro"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">/book funnel</span><span class="text-muted" id="ana-funnel-sub" style="font-size:12px"></span></div>
        <div style="position:relative;height:260px;width:100%"><canvas id="ana-funnel"></canvas></div>
      </div>
    </div>
    <div class="dashboard-grid" style="grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><span class="card-title">Traffic by hour (campaign window)</span></div>
        <div style="position:relative;height:220px;width:100%"><canvas id="ana-hourly"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Sources</span></div>
        <div style="position:relative;height:220px;width:100%"><canvas id="ana-source"></canvas></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <span class="card-title">Wizard step dropoff</span>
        <span class="text-muted" id="ana-dropoff-sub" style="font-size:12px"></span>
      </div>
      <div style="position:relative;height:220px;width:100%"><canvas id="ana-dropoff"></canvas></div>
      <div class="text-muted" style="font-size:12px;margin-top:8px">
        Steps 2-9 are the call-booking wizard (date, guests, venue, drinks, budget, notes, contact, slot picker).
        Step 11 is the raffle quick-form. Step 10 is the success / confirmation screen.
      </div>
    </div>
  `;

  /* Live subscriptions (auto-update if events stream in) */
  const cohortUnsub = db.collection('leads').where('campaign', '==', expo.campaign).onSnapshot(snap => {
    const leads = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.email && !String(l.email).includes('@test.local'));
    _expoState.leads = leads;
    _expoState.buckets = bucketize(leads);
    paintAnalyticsLeads();
  });
  _activeListeners.push(cohortUnsub);

  const start = firebase.firestore.Timestamp.fromDate(new Date(expo.eventStart));
  const end   = firebase.firestore.Timestamp.fromDate(new Date(expo.eventEnd));
  const evUnsub = db.collection('page_events')
    .where('timestamp', '>=', start).where('timestamp', '<=', end)
    .orderBy('timestamp', 'desc').limit(5000)
    .onSnapshot(snap => {
      _expoState.events = snap.docs.map(d => d.data());
      paintAnalyticsTraffic();
    });
  _activeListeners.push(evUnsub);
}

function paintAnalyticsLeads() {
  if (!document.getElementById('ana-distro')) return;
  const buckets = _expoState.buckets || {};
  const order = ['0-3','3-6','6-12','12-18','18+','no-date'];
  const distEl = document.getElementById('ana-distro');
  if (_expoState.charts.distro) try { _expoState.charts.distro.destroy(); } catch(e){}
  _expoState.charts.distro = new Chart(distEl, {
    type: 'bar',
    data: {
      labels: order.map(b => bucketShort(b)),
      datasets: [{
        label: 'Brides',
        data: order.map(b => (buckets[b]||[]).length),
        backgroundColor: ['#dc2626','#f59e0b','#22c55e','#3b82f6','#8b5cf6','#94a3b8'],
        borderRadius: 6,
      }]
    },
    options: chartOpts({ legend: false }),
  });
  document.getElementById('ana-distro-sub').textContent = `${_expoState.leads.length} entries`;

  /* Source doughnut */
  if (document.getElementById('ana-source') && _expoState.leads.length) {
    const sources = {};
    _expoState.leads.forEach(l => sources[l.source||'(none)'] = (sources[l.source||'(none)'] || 0) + 1);
    if (_expoState.charts.source) try { _expoState.charts.source.destroy(); } catch(e){}
    _expoState.charts.source = new Chart(document.getElementById('ana-source'), {
      type: 'doughnut',
      data: { labels: Object.keys(sources), datasets: [{ data: Object.values(sources), backgroundColor: ['#C9A84C','#22c55e','#3b82f6','#8b5cf6','#f59e0b','#94a3b8'] }] },
      options: chartOpts({ legend: true, percent: true }),
    });
  }
}

function paintAnalyticsTraffic() {
  const events = _expoState.events || [];
  const bookSess = new Set(events.filter(e => (e.page||'').includes('book')).map(e => e.sessionId));
  const stepReached = new Set(events.filter(e => e.event === 'wizard_step_view' && e.props && e.props.step >= 11).map(e => e.sessionId));
  const raffSess = new Set(events.filter(e => e.event === 'raffle_submitted').map(e => e.sessionId));
  const callSess = new Set(events.filter(e => e.event === 'wizard_submitted' && e.props && e.props.kind === 'call').map(e => e.sessionId));
  const infoSess = new Set(events.filter(e => e.event === 'wizard_submitted' && e.props && e.props.kind === 'info').map(e => e.sessionId));
  const totalSubs = raffSess.size + callSess.size + infoSess.size;

  if (document.getElementById('ana-funnel')) {
    if (_expoState.charts.funnel) try { _expoState.charts.funnel.destroy(); } catch(e){}
    _expoState.charts.funnel = new Chart(document.getElementById('ana-funnel'), {
      type: 'bar',
      data: {
        labels: ['/book sessions','Reached form','Submitted raffle','Submitted call','Submitted info'],
        datasets: [{ data: [bookSess.size, stepReached.size, raffSess.size, callSess.size, infoSess.size], backgroundColor: ['#3b82f6','#0ea5e9','#22c55e','#a855f7','#f59e0b'], borderRadius: 6 }]
      },
      options: chartOpts({ legend: false, indexAxis: 'y' }),
    });
    document.getElementById('ana-funnel-sub').textContent = `${totalSubs} subs · ${pct(totalSubs, bookSess.size)} of /book`;
  }

  /* Wizard step dropoff chart */
  if (document.getElementById('ana-dropoff')) {
    const STEP_LABELS = {
      0: 'Welcome',
      2: 'Date',
      3: 'Guests',
      4: 'Venue',
      5: 'Drinks',
      6: 'Budget',
      7: 'Notes',
      8: 'Contact',
      9: 'Slot picker',
      10: 'Confirmation ✓',
      11: 'Raffle form',
    };
    /* Count UNIQUE sessions reaching each step (not total step views — those inflate from back-clicks) */
    const sessionsByStep = {};
    events.forEach(e => {
      if (e.event !== 'wizard_step_view') return;
      const s = e.props && e.props.step;
      if (s == null) return;
      if (!sessionsByStep[s]) sessionsByStep[s] = new Set();
      sessionsByStep[s].add(e.sessionId);
    });
    const stepOrder = [0, 2, 3, 4, 5, 6, 7, 8, 9, 11, 10];
    const labels = stepOrder.map(s => STEP_LABELS[s] || ('Step ' + s));
    const counts = stepOrder.map(s => (sessionsByStep[s] && sessionsByStep[s].size) || 0);
    if (_expoState.charts.dropoff) try { _expoState.charts.dropoff.destroy(); } catch(e){}
    _expoState.charts.dropoff = new Chart(document.getElementById('ana-dropoff'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Sessions reached',
          data: counts,
          backgroundColor: counts.map((_, i) => {
            const colors = ['#94a3b8','#3b82f6','#3b82f6','#3b82f6','#3b82f6','#3b82f6','#3b82f6','#3b82f6','#3b82f6','#22c55e','#a855f7'];
            return colors[i] || '#94a3b8';
          }),
          borderRadius: 6,
        }]
      },
      options: chartOpts({ legend: false }),
    });
    const submitSess = counts[counts.length - 1]; // confirmation
    const startSess  = counts[0]; // welcome
    const sub = document.getElementById('ana-dropoff-sub');
    if (sub) sub.textContent = `${startSess} sessions reached step 0 → ${submitSess} completed (${startSess ? Math.round((submitSess/startSess)*100) : 0}% completion)`;
  }

  if (document.getElementById('ana-hourly')) {
    /* Filter to ONLY the day-of-expo (e.g. May 9) and bin by Mountain-time hour.
     * Without this filter the chart aggregates across the 4-day capture window
     * and the hours look meaningless (e.g. 24-hour totals). */
    const expo = EXPOS.find(e => e.id === _expoState.activeId) || EXPOS[0];
    const expoDayStr = expo.date; // YYYY-MM-DD
    const hours = new Array(24).fill(0);
    /* en-US time formatter pinned to America/Denver — works regardless of
     * the admin user's browser timezone. */
    const hourFmt = new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Denver' });
    const dayFmt  = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Denver' });

    events.forEach(e => {
      if (!e.timestamp) return;
      const dt = e.timestamp.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
      const dayMt = dayFmt.format(dt); // 'YYYY-MM-DD' in Mountain time
      if (dayMt !== expoDayStr) return;
      const h = parseInt(hourFmt.format(dt), 10);
      if (!isNaN(h)) hours[h]++;
    });

    if (_expoState.charts.hourly) try { _expoState.charts.hourly.destroy(); } catch(e){}
    _expoState.charts.hourly = new Chart(document.getElementById('ana-hourly'), {
      type: 'bar',
      data: {
        labels: hours.map((_,i) => {
          const ampm = i === 0 ? '12am' : i < 12 ? i + 'am' : i === 12 ? '12pm' : (i - 12) + 'pm';
          return ampm;
        }),
        datasets: [{ label: 'Events', data: hours, backgroundColor: '#C9A84C', borderRadius: 4 }]
      },
      options: chartOpts({ legend: false }),
    });
    /* Update the card subtitle so it's clear what we're showing */
    const subEl = document.querySelector('#expo-tab-content .card-header .card-title');
    /* find the hourly card and add a sub */
    const hourlyCard = document.getElementById('ana-hourly').closest('.card');
    if (hourlyCard) {
      const hdr = hourlyCard.querySelector('.card-header');
      if (hdr && !hdr.querySelector('.hourly-sub')) {
        hdr.insertAdjacentHTML('beforeend',
          `<span class="hourly-sub text-muted" style="font-size:12px">${expoDayStr} · Mountain time</span>`);
      }
    }
  }
}

/* ─── TAB: COHORT ────────────────────────────────────────────────────── */
async function renderTabCohort(expo) {
  const el = document.getElementById('expo-tab-content');
  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Nurture lists by wedding-date bucket</span>
        <button class="btn btn-secondary" onclick="copyAllCohortBuckets()" style="font-size:12px">Copy all emails</button>
      </div>
      <div id="cohort-buckets" class="text-muted" style="padding:24px;text-align:center;font-size:13px">Loading…</div>
    </div>
  `;

  const snap = await db.collection('leads').where('campaign', '==', expo.campaign).get();
  const leads = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.email && !String(l.email).includes('@test.local'));
  const buckets = bucketize(leads);
  _expoState.buckets = buckets;

  document.getElementById('cohort-buckets').innerHTML = ['0-3','3-6','6-12','12-18','18+','no-date']
    .map(b => {
      const list = buckets[b] || [];
      if (!list.length) return '';
      return `
        <div style="margin:0 0 18px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
            <strong style="color:var(--gold);font-size:13px;letter-spacing:0.06em;text-transform:uppercase">${bucketLabel(b)} · ${list.length}</strong>
            <button class="btn btn-secondary" onclick="copyCohortBucket('${b}')" style="font-size:11px;padding:4px 10px">Copy ${list.length} emails</button>
          </div>
          <div style="font-size:13px;line-height:1.6">
            ${list.slice(0, 50).map(l =>
              `<div style="padding:3px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:12px">
                 <span><strong>${escapeHtml(l.name||'(no name)')}</strong> · <span class="text-muted">${escapeHtml(l.email||'')}</span></span>
                 <span class="text-muted">${escapeHtml(l.eventDate||'no date')}</span>
               </div>`
            ).join('')}
            ${list.length > 50 ? `<div class="text-muted" style="padding-top:6px;font-size:12px">+ ${list.length - 50} more (use Copy emails to get full list)</div>` : ''}
          </div>
        </div>
      `;
    })
    .filter(Boolean).join('') || `<div class="text-muted" style="padding:24px;text-align:center;font-size:13px">No leads yet for this campaign.</div>`;
}

function copyCohortBucket(b) {
  const list = (_expoState.buckets && _expoState.buckets[b]) || [];
  const emails = list.map(l => l.email).filter(Boolean).join(', ');
  copyToClipboard(emails, `${list.length} emails copied`);
}
function copyAllCohortBuckets() {
  const all = Object.values(_expoState.buckets || {}).flat();
  const emails = all.map(l => l.email).filter(Boolean).join(', ');
  copyToClipboard(emails, `${all.length} emails copied`);
}

/* ─── TAB: NOTES & LEARNINGS (Firestore-backed, autosave) ────────────── */
async function renderTabNotes(expo) {
  const el = document.getElementById('expo-tab-content');
  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Notes &amp; Learnings</span>
        <span id="notes-status" class="text-muted" style="font-size:12px">loading…</span>
      </div>
      <div style="padding:0 0 12px">
        <div class="text-muted" style="font-size:13px;margin-bottom:12px;line-height:1.55">
          Free-form thoughts about this expo. Anything you want to remember next year — what worked, what didn't,
          which booth neighbors were great, which raffle prizes converted, copy ideas, layout sketches.
          <strong>Autosaves on blur.</strong>
        </div>
        <textarea id="expo-notes" placeholder="What worked at this expo? What would you do differently?

• ..." style="width:100%;min-height:300px;padding:14px;background:rgba(255,255,255,0.04);border:1.5px solid var(--border);border-radius:10px;color:var(--text);font-family:inherit;font-size:14px;line-height:1.6;resize:vertical"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px">
        <div>
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">What worked</div>
          <textarea id="expo-worked" placeholder="• big QR sign was a magnet
• mocktail samples drew a crowd
• ..." style="width:100%;min-height:160px;padding:12px;background:rgba(34,197,94,0.06);border:1.5px solid rgba(34,197,94,0.25);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;line-height:1.6;resize:vertical"></textarea>
        </div>
        <div>
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#ef4444;margin-bottom:6px">Would change</div>
          <textarea id="expo-change" placeholder="• our booth was crammed with 4 people
• raffle entries dominated, no one used the call CTA
• ..." style="width:100%;min-height:160px;padding:12px;background:rgba(239,68,68,0.06);border:1.5px solid rgba(239,68,68,0.25);border-radius:10px;color:var(--text);font-family:inherit;font-size:13px;line-height:1.6;resize:vertical"></textarea>
        </div>
      </div>
      <div style="margin-top:14px;font-size:12px;color:var(--text-muted)">
        Stored at <code>expos/${escapeHtml(expo.id)}</code> in Firestore. Edit any field and click outside to save.
      </div>
    </div>
  `;

  /* Load existing notes from Firestore */
  const ref = db.collection('expos').doc(expo.id);
  const doc = await ref.get();
  const data = doc.exists ? doc.data() : {};
  document.getElementById('expo-notes').value  = data.notes  || '';
  document.getElementById('expo-worked').value = data.worked || '';
  document.getElementById('expo-change').value = data.change || '';
  document.getElementById('notes-status').textContent = doc.exists ? 'saved · ' + relTime(data.notesUpdatedAt) : 'no notes yet';

  /* Autosave on blur */
  function saveField(field, val) {
    const status = document.getElementById('notes-status');
    if (status) status.textContent = 'saving…';
    const payload = {};
    payload[field] = val;
    payload.notesUpdatedAt = firebase.firestore.FieldValue.serverTimestamp();
    payload.expoId = expo.id;
    ref.set(payload, { merge: true }).then(() => {
      if (status) status.textContent = 'saved · just now';
    }).catch(e => {
      if (status) status.textContent = 'save failed';
      console.warn('expo notes save:', e);
    });
  }
  ['expo-notes','expo-worked','expo-change'].forEach(id => {
    const fieldName = id === 'expo-notes' ? 'notes' : id === 'expo-worked' ? 'worked' : 'change';
    document.getElementById(id).addEventListener('blur', e => saveField(fieldName, e.target.value));
  });
}

/* ─── TAB: PREP & LOGISTICS ──────────────────────────────────────────── */
async function renderTabPrep(expo) {
  const el = document.getElementById('expo-tab-content');
  const ref = db.collection('expos').doc(expo.id);
  const doc = await ref.get();
  const checklist = (doc.exists && doc.data().checklist) || [
    { text: 'Confirm booth space + load-in time', done: false },
    { text: 'Print booth signage + lanyard cards', done: false },
    { text: 'Stock raffle prizes', done: false },
    { text: 'Order/buy mocktail samples + cups', done: false },
    { text: 'Charge phones + bring battery packs', done: false },
    { text: 'Test QR code with real phones', done: false },
    { text: 'Sign team into /admin#expo before doors open', done: false },
    { text: 'Day-after: draw raffle winners + send emails', done: false },
  ];

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Pre-expo checklist</span>
        <button class="btn btn-secondary" onclick="addPrepItem()" style="font-size:12px">+ Add item</button>
      </div>
      <div id="prep-list">${checklist.map((it, i) => prepItemHtml(it, i)).join('')}</div>
      <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
        <div>
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Booth cost</div>
          <div style="color:var(--text);font-size:18px;font-weight:600">${expo.cost ? '$' + expo.cost : '—'}</div>
        </div>
        <div>
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Status</div>
          <div>${statusPill(expo.status)}</div>
        </div>
      </div>
    </div>
  `;
  /* Stash + bind */
  _expoState._checklist = checklist;
  document.querySelectorAll('.prep-check').forEach((cb, i) => {
    cb.addEventListener('change', () => {
      _expoState._checklist[i].done = cb.checked;
      ref.set({ checklist: _expoState._checklist, expoId: expo.id }, { merge: true });
    });
  });
}
function prepItemHtml(it, i) {
  return `<label class="prep-item" style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;cursor:pointer">
    <input type="checkbox" class="prep-check" data-i="${i}" ${it.done ? 'checked' : ''} style="margin-top:3px;width:16px;height:16px;accent-color:var(--gold);cursor:pointer">
    <span style="${it.done ? 'text-decoration:line-through;color:var(--text-muted)' : 'color:var(--text)'}">${escapeHtml(it.text)}</span>
  </label>`;
}
function addPrepItem() {
  const text = prompt('New checklist item:');
  if (!text) return;
  _expoState._checklist.push({ text, done: false });
  /* Re-render — easiest */
  renderTabPrep(EXPOS.find(e => e.id === _expoState.activeId));
}

/* ─── HELPERS (shared across tabs) ───────────────────────────────────── */
function bucketize(leads) {
  const today = new Date();
  const buckets = { 'past': [], '0-3': [], '3-6': [], '6-12': [], '12-18': [], '18+': [], 'no-date': [] };
  for (const lead of leads) {
    const m = monthsOut(lead.eventDate, today);
    let b = 'no-date';
    if (m !== null) {
      if (m < 0) b = 'past';
      else if (m <= 3) b = '0-3';
      else if (m <= 6) b = '3-6';
      else if (m <= 12) b = '6-12';
      else if (m <= 18) b = '12-18';
      else b = '18+';
    }
    buckets[b].push(lead);
  }
  return buckets;
}
function monthsOut(yyyymmdd, today) {
  if (!yyyymmdd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return null;
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return ((new Date(y, m - 1, d)) - today) / (1000 * 60 * 60 * 24 * 30.4375);
}
function bucketLabel(b) {
  return ({
    'past': 'Past dates',
    '0-3': 'Urgent · 0–3 mo out',
    '3-6': 'Hot · 3–6 mo out',
    '6-12': 'Warm · 6–12 mo out',
    '12-18': 'Cool · 12–18 mo out',
    '18+': '18+ mo out',
    'no-date': 'No date set',
  })[b] || b;
}
function bucketShort(b) {
  return ({ 'past':'Past','0-3':'0-3mo','3-6':'3-6mo','6-12':'6-12mo','12-18':'12-18mo','18+':'18mo+','no-date':'no date' })[b] || b;
}
function pct(a, b) { return b ? Math.round((a/b)*100) + '%' : '0%'; }
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function relTime(ts) {
  if (!ts) return 'just now';
  if (ts.toDate) ts = ts.toDate();
  if (typeof ts === 'string') ts = new Date(ts);
  const sec = Math.floor((Date.now() - ts.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec/60) + ' min ago';
  if (sec < 86400) return Math.floor(sec/3600) + ' hr ago';
  return Math.floor(sec/86400) + ' day(s) ago';
}
function statusPill(s) {
  const styles = {
    completed: 'background:rgba(100,116,139,0.18);color:#94a3b8',
    upcoming:  'background:rgba(59,130,246,0.18);color:#60a5fa',
    prepping:  'background:rgba(245,158,11,0.18);color:#fbbf24',
    active:    'background:rgba(34,197,94,0.18);color:#4ade80',
    archived:  'background:rgba(120,120,120,0.15);color:#888',
  };
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;font-weight:600;${styles[s] || styles.archived}">${escapeHtml(s || '')}</span>`;
}

function chartOpts(opts) {
  opts = opts || {};
  const grid = 'rgba(255,255,255,0.06)';
  const text = 'rgba(255,255,255,0.65)';
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: opts.indexAxis,
    plugins: {
      legend: { display: !!opts.legend, labels: { color: text, font: { size: 11 } } },
      tooltip: { backgroundColor: 'rgba(0,0,0,0.85)', titleColor: '#fff', bodyColor: '#fff' }
    },
    scales: opts.percent ? {} : {
      x: { ticks: { color: text }, grid: { color: grid } },
      y: { ticks: { color: text }, grid: { color: grid } }
    },
  };
}

/* ─── Raffle winner draw ──────────────────────────────────────────────── */
function drawRaffleWinners(expo) {
  const pool = (_expoState._raffleLeads || []).filter(l => l.email);
  const count = Math.min(parseInt(document.getElementById('raffle-count').value, 10) || 4, pool.length);
  if (!pool.length) return showToast('No eligible entries', 'warn');

  /* Fisher–Yates shuffle using crypto-grade randomness */
  const shuffled = [...pool];
  const buf = new Uint32Array(shuffled.length);
  crypto.getRandomValues(buf);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = buf[i] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const winners = shuffled.slice(0, count);

  document.getElementById('raffle-results').innerHTML = `
    <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:6px">
      <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold);margin-bottom:10px">
        ${count} winner${count === 1 ? '' : 's'} · drawn ${new Date().toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}
      </div>
      ${winners.map((w, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;margin-bottom:8px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.3);border-radius:10px">
          <div style="flex:1;font-size:14px">
            <strong style="color:var(--text)">#${i+1} · ${escapeHtml(w.name||'(no name)')}</strong>
            <span class="text-muted"> · ${escapeHtml(w.email||'')}</span>
            <div class="text-muted" style="font-size:12px">${escapeHtml(w.phone||'')}${w.eventDate ? ' · wedding ' + escapeHtml(w.eventDate) : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-secondary" onclick="markRaffleWinnerLead('${w.id}', '${escapeHtml(expo.id)}', this)" style="font-size:11px;padding:5px 10px">⭐ Mark as winner</button>
            <button class="btn btn-secondary" onclick="(typeof openLeadModal==='function') ? openLeadModal('${w.id}') : (window.location.hash='#crm')" style="font-size:11px;padding:5px 10px">View card</button>
          </div>
        </div>
      `).join('')}
      <div class="text-muted" style="font-size:12px;margin-top:8px">
        ↺ Click "Spin again" for a fresh draw. "Mark as winner" stamps the lead's CRM card with raffle-winner status and timestamp.
      </div>
    </div>
  `;
}

async function markRaffleWinnerLead(leadId, expoId, btn) {
  try {
    btn.disabled = true;
    btn.textContent = '… saving';
    const now = firebase.firestore.FieldValue.serverTimestamp();
    /* Append a note + flag the lead as a raffle winner */
    const ref = db.collection('leads').doc(leadId);
    const doc = await ref.get();
    const existing = (doc.exists && doc.data().notes) || [];
    const note = {
      text: '⭐ Drawn as raffle winner ($50 Amazon gift card) — Wedding Expo ' + expoId,
      author: 'System',
      time: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    };
    await ref.update({
      raffleWinner: true,
      raffleWinnerOfExpo: expoId,
      raffleWinnerDrawnAt: now,
      raffleWinnerPrize: '$50 Amazon gift card',
      notes: [...existing, note],
      updatedAt: now,
    });
    btn.textContent = '✓ Saved to CRM';
    btn.style.background = 'rgba(34,197,94,0.18)';
    btn.style.borderColor = 'rgba(34,197,94,0.4)';
    btn.style.color = '#4ade80';
    showToast('Marked as raffle winner — note added to lead card');
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '⭐ Mark as winner';
    showToast('Save failed: ' + e.message, 'error');
  }
}

/* ─── Drill-down modal ────────────────────────────────────────────────── */
function openExpoDrill(key) {
  const drill = (_expoState._drill || {})[key];
  if (!drill) return;
  /* Remove any existing drill modal */
  const old = document.getElementById('expo-drill-modal');
  if (old) old.remove();

  const m = document.createElement('div');
  m.id = 'expo-drill-modal';
  m.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:60px 20px;overflow-y:auto';
  m.onclick = (e) => { if (e.target === m) m.remove(); };

  const list = drill.leads || [];
  m.innerHTML = `
    <div style="background:var(--bg-card,#1a1a1f);border:1px solid var(--border);border-radius:14px;max-width:720px;width:100%;padding:24px;max-height:80vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.4)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px">
        <div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:500;color:var(--text);line-height:1.2">${escapeHtml(drill.title)}</div>
          <div class="text-muted" style="font-size:13px;margin-top:4px;line-height:1.5">${escapeHtml(drill.blurb || '')}</div>
        </div>
        <button onclick="document.getElementById('expo-drill-modal').remove()" style="background:transparent;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;padding:4px 8px">×</button>
      </div>
      ${list.length ? `
        <div style="font-size:13px">
          ${list.map(l => `
            <div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;cursor:pointer" onclick="document.getElementById('expo-drill-modal').remove();(typeof openLeadModal === 'function') ? openLeadModal('${l.id}') : (window.location.hash = '#crm');">
              <div style="flex:1">
                <strong style="color:var(--text)">${escapeHtml(l.name||'(no name)')}</strong>
                <span class="text-muted"> · ${escapeHtml(l.email||'')}</span>
              </div>
              <div class="text-muted" style="text-align:right;flex-shrink:0">
                ${escapeHtml(l.eventDate||'no date')} <span style="color:var(--gold);margin-left:8px">→</span>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:14px;font-size:12px;color:var(--text-muted)">Click any row to open the lead's CRM card.</div>
      ` : `<div class="text-muted" style="padding:24px;text-align:center">No matching leads.</div>`}
    </div>
  `;
  document.body.appendChild(m);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function copyToClipboard(text, msg) {
  if (!text) return showToast('Nothing to copy', 'warn');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(msg || 'Copied'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast(msg || 'Copied'); } catch(e) { showToast('Copy failed', 'error'); }
    document.body.removeChild(ta);
  }
}
