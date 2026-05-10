/* ══════════════════════════════════════════════════════════════════════════
   MODULE 8 — EXPO ANALYTICS

   Live cohort + traffic dashboard for the Wedding Expo (and any future
   campaign with a `campaign` tag). Subscribes to Firestore, renders:

     • Top-line stats: entries, IG-follow %, near-term pipeline, traffic
     • Wedding-date distribution chart (bar)
     • /book funnel: page_view → step views → submission split
     • Hourly traffic during the campaign window
     • Source breakdown (raffle / call / info / public)
     • Per-bucket lead lists (paste-ready BCC)

   Uses Chart.js (already loaded in admin/index.html) for charts.
   ════════════════════════════════════════════════════════════════════════ */

let expoCharts = {};

const EXPO_CAMPAIGNS = [
  { id: 'WeddingExpo2026-05-09', label: 'Wedding Expo · May 9 2026', start: '2026-05-08T00:00:00', end: '2026-05-12T00:00:00' },
];
let expoActiveCampaignId = EXPO_CAMPAIGNS[0].id;

async function renderExpo() {
  Object.values(expoCharts).forEach(ch => { try { ch.destroy(); } catch(e){} });
  expoCharts = {};

  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Expo Analytics</div>
        <div class="page-subtitle">Live cohort + traffic for active campaigns</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="filter-select" id="expo-campaign" onchange="setExpoCampaign(this.value)">
          ${EXPO_CAMPAIGNS.map(c =>
            `<option value="${c.id}"${c.id === expoActiveCampaignId ? ' selected' : ''}>${c.label}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <!-- Top-line stat strip -->
    <div class="stat-grid" id="expo-stats">
      ${[1,2,3,4,5].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>

    <!-- Charts row -->
    <div class="dashboard-grid" style="grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><span class="card-title">Wedding-date distribution</span><span class="text-muted" id="expo-distro-sub" style="font-size:12px"></span></div>
        <canvas id="expo-distro-chart" height="240"></canvas>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">/book funnel</span><span class="text-muted" id="expo-funnel-sub" style="font-size:12px"></span></div>
        <canvas id="expo-funnel-chart" height="240"></canvas>
      </div>
    </div>
    <div class="dashboard-grid" style="grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-header"><span class="card-title">Traffic by hour (campaign window)</span></div>
        <canvas id="expo-hourly-chart" height="200"></canvas>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Sources</span></div>
        <canvas id="expo-source-chart" height="200"></canvas>
      </div>
    </div>

    <!-- Per-bucket lists -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <span class="card-title">Nurture lists by wedding-date bucket</span>
        <button class="btn btn-secondary" id="expo-copy-all" onclick="copyAllExpoBuckets()" style="font-size:12px">Copy all emails</button>
      </div>
      <div id="expo-buckets">
        <div class="text-muted" style="padding:24px;text-align:center;font-size:13px">Loading…</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Recent /book sessions</span></div>
      <div id="expo-recent-sessions" class="activity-list">
        <div class="text-muted" style="padding:12px;font-size:13px">Loading…</div>
      </div>
    </div>
  `;

  /* Live subscriptions — register cleanups so app.js's loadModule() can dispose */
  const cohortUnsub = db.collection('leads')
    .where('campaign', '==', expoActiveCampaignId)
    .onSnapshot(snap => {
      const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      window._expoLeads = leads;
      paintExpoCohort(leads);
    }, err => console.warn('expo cohort:', err));
  _activeListeners.push(cohortUnsub);

  /* page_events for the campaign window */
  const camp = EXPO_CAMPAIGNS.find(c => c.id === expoActiveCampaignId);
  const start = firebase.firestore.Timestamp.fromDate(new Date(camp.start));
  const end   = firebase.firestore.Timestamp.fromDate(new Date(camp.end));
  const eventsUnsub = db.collection('page_events')
    .where('timestamp', '>=', start).where('timestamp', '<=', end)
    .orderBy('timestamp', 'desc').limit(5000)
    .onSnapshot(snap => {
      const events = snap.docs.map(d => d.data());
      window._expoEvents = events;
      paintExpoTraffic(events);
    }, err => console.warn('expo events:', err));
  _activeListeners.push(eventsUnsub);
}

function setExpoCampaign(id) {
  expoActiveCampaignId = id;
  renderExpo();
}

/* ── Cohort painters ─────────────────────────────────────────────────── */
function paintExpoCohort(leadsRaw) {
  const leads = leadsRaw.filter(l => l.email && !String(l.email).includes('@test.local'));
  const ig = leads.filter(l => l.instagramFollowed).length;

  /* Bucket leads */
  const buckets = bucketize(leads);
  const near = buckets['0-3'].length + buckets['3-6'].length;
  const dateless = buckets['no-date'].length;

  /* Top-line stats — first 3 cards filled here, last 2 wait for events */
  const statsEl = document.getElementById('expo-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-card gold"><div class="stat-label">Total entries</div><div class="stat-value">${leads.length}</div><div class="stat-sub">${leadsRaw.length - leads.length} test rows excluded</div></div>
      <div class="stat-card teal"><div class="stat-label">IG follow %</div><div class="stat-value">${pct(ig, leads.length)}</div><div class="stat-sub">${ig} / ${leads.length}</div></div>
      <div class="stat-card" style="border-left:3px solid var(--green)"><div class="stat-label">Near-term pipeline</div><div class="stat-value" style="color:var(--green)">${near}</div><div class="stat-sub">brides ≤ 6 mo out</div></div>
      <div class="stat-card" id="expo-stat-sessions"><div class="stat-label">Unique sessions</div><div class="stat-value">—</div></div>
      <div class="stat-card" id="expo-stat-conv"><div class="stat-label">Raffle conv.</div><div class="stat-value">—</div></div>
    `;
  }

  /* Wedding-date distribution chart */
  const distEl = document.getElementById('expo-distro-chart');
  if (distEl) {
    if (expoCharts.distro) try { expoCharts.distro.destroy(); } catch(e){}
    const order = ['0-3','3-6','6-12','12-18','18+','no-date'];
    expoCharts.distro = new Chart(distEl, {
      type: 'bar',
      data: {
        labels: order.map(b => bucketShort(b)),
        datasets: [{
          label: 'Brides',
          data: order.map(b => buckets[b].length),
          backgroundColor: ['#dc2626','#f59e0b','#22c55e','#3b82f6','#8b5cf6','#94a3b8'],
          borderRadius: 6,
        }]
      },
      options: chartOpts({ legend: false, yTitle: 'Count' }),
    });
    document.getElementById('expo-distro-sub').textContent = `${leads.length} entries · ${dateless} no date`;
  }

  /* Buckets list */
  const bucketsEl = document.getElementById('expo-buckets');
  if (bucketsEl) {
    bucketsEl.innerHTML = ['0-3','3-6','6-12','12-18','18+','no-date']
      .map(b => {
        const list = buckets[b];
        if (!list.length) return '';
        return `
          <div style="margin:0 0 18px">
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
              <strong style="color:var(--gold);font-size:13px;letter-spacing:0.06em;text-transform:uppercase">${bucketLabel(b)} · ${list.length}</strong>
              <button class="btn btn-secondary" onclick="copyExpoBucket('${b}')" style="font-size:11px;padding:4px 10px">Copy ${list.length} emails</button>
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
      .filter(Boolean).join('') ||
      `<div class="text-muted" style="padding:24px;text-align:center;font-size:13px">No leads yet for this campaign.</div>`;
  }

  /* Stash buckets for copy buttons */
  window._expoBuckets = buckets;
}

/* ── Traffic painters ─────────────────────────────────────────────────── */
function paintExpoTraffic(events) {
  /* Sessions */
  const sessions = new Set(events.map(e => e.sessionId));
  const sessEl = document.querySelector('#expo-stat-sessions .stat-value');
  if (sessEl) sessEl.textContent = sessions.size;
  const sessSubEl = document.querySelector('#expo-stat-sessions');
  if (sessSubEl && !sessSubEl.querySelector('.stat-sub')) {
    sessSubEl.insertAdjacentHTML('beforeend', `<div class="stat-sub">${events.length} events</div>`);
  }

  /* Funnel: page_view → wizard_step_view → submission */
  const bookSess = new Set(events.filter(e => (e.page||'').includes('book')).map(e => e.sessionId));
  const stepReachedSess = new Set(events.filter(e => e.event === 'wizard_step_view' && e.props && e.props.step >= 11).map(e => e.sessionId));
  const raffSess = new Set(events.filter(e => e.event === 'raffle_submitted').map(e => e.sessionId));
  const callSess = new Set(events.filter(e => e.event === 'wizard_submitted' && e.props && e.props.kind === 'call').map(e => e.sessionId));
  const infoSess = new Set(events.filter(e => e.event === 'wizard_submitted' && e.props && e.props.kind === 'info').map(e => e.sessionId));
  const totalSubs = raffSess.size + callSess.size + infoSess.size;

  /* Conversion stat */
  const convEl = document.querySelector('#expo-stat-conv .stat-value');
  if (convEl) convEl.textContent = bookSess.size ? Math.round((raffSess.size / bookSess.size) * 100) + '%' : '—';
  const convCard = document.querySelector('#expo-stat-conv');
  if (convCard && !convCard.querySelector('.stat-sub')) {
    convCard.insertAdjacentHTML('beforeend', `<div class="stat-sub">${raffSess.size} of ${bookSess.size} /book sessions</div>`);
  }

  /* Funnel chart */
  const funnelEl = document.getElementById('expo-funnel-chart');
  if (funnelEl) {
    if (expoCharts.funnel) try { expoCharts.funnel.destroy(); } catch(e){}
    expoCharts.funnel = new Chart(funnelEl, {
      type: 'bar',
      data: {
        labels: ['/book sessions', 'Reached form', 'Submitted raffle', 'Submitted call', 'Submitted info'],
        datasets: [{
          data: [bookSess.size, stepReachedSess.size, raffSess.size, callSess.size, infoSess.size],
          backgroundColor: ['#3b82f6','#0ea5e9','#22c55e','#a855f7','#f59e0b'],
          borderRadius: 6,
        }]
      },
      options: chartOpts({ legend: false, indexAxis: 'y' }),
    });
    document.getElementById('expo-funnel-sub').textContent = `${totalSubs} total submissions · ${pct(totalSubs, bookSess.size)}`;
  }

  /* Hourly distribution */
  const hourEl = document.getElementById('expo-hourly-chart');
  if (hourEl) {
    if (expoCharts.hourly) try { expoCharts.hourly.destroy(); } catch(e){}
    const hours = new Array(24).fill(0);
    events.forEach(e => {
      if (!e.timestamp) return;
      const dt = e.timestamp.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
      hours[dt.getHours()]++;
    });
    expoCharts.hourly = new Chart(hourEl, {
      type: 'bar',
      data: {
        labels: hours.map((_, i) => i + ':00'),
        datasets: [{ label: 'Events', data: hours, backgroundColor: '#C9A84C', borderRadius: 4 }]
      },
      options: chartOpts({ legend: false }),
    });
  }

  /* Source breakdown — use lead.source, not events */
  const sourceEl = document.getElementById('expo-source-chart');
  const leads = (window._expoLeads || []).filter(l => l.email && !String(l.email).includes('@test.local'));
  if (sourceEl && leads.length) {
    if (expoCharts.source) try { expoCharts.source.destroy(); } catch(e){}
    const sources = {};
    leads.forEach(l => sources[l.source || '(none)'] = (sources[l.source || '(none)'] || 0) + 1);
    expoCharts.source = new Chart(sourceEl, {
      type: 'doughnut',
      data: {
        labels: Object.keys(sources),
        datasets: [{ data: Object.values(sources), backgroundColor: ['#C9A84C','#22c55e','#3b82f6','#8b5cf6','#f59e0b','#94a3b8'] }]
      },
      options: chartOpts({ legend: true, percent: true }),
    });
  }

  /* Recent sessions table */
  const recentEl = document.getElementById('expo-recent-sessions');
  if (recentEl) {
    /* Group events by sessionId, take latest */
    const sessMap = {};
    events.forEach(e => {
      const s = e.sessionId;
      if (!sessMap[s]) sessMap[s] = { id: s, page: e.page, lastEvent: e.event, ts: e.timestamp, count: 0, submitted: false };
      sessMap[s].count++;
      if (e.event === 'raffle_submitted' || e.event === 'wizard_submitted') sessMap[s].submitted = true;
    });
    const recent = Object.values(sessMap).sort((a,b) => (b.ts && b.ts.toMillis ? b.ts.toMillis() : 0) - (a.ts && a.ts.toMillis ? a.ts.toMillis() : 0)).slice(0, 12);
    recentEl.innerHTML = recent.length ? recent.map(s => {
      const t = s.ts && s.ts.toDate ? s.ts.toDate() : new Date();
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;font-size:13px">
        <span><strong>${escapeHtml(s.page||'?')}</strong> · ${s.count} events · ${s.submitted ? '<span style="color:var(--green)">✓ submitted</span>' : '<span class="text-muted">no submit</span>'}</span>
        <span class="text-muted">${t.toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'})}</span>
      </div>`;
    }).join('') : `<div class="text-muted" style="padding:12px;font-size:13px">No traffic yet for this campaign window.</div>`;
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
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
    'past':    'Past dates',
    '0-3':     'Urgent · 0–3 mo out',
    '3-6':     'Hot · 3–6 mo out',
    '6-12':    'Warm · 6–12 mo out',
    '12-18':   'Cool · 12–18 mo out',
    '18+':     '18+ mo out',
    'no-date': 'No date set',
  })[b] || b;
}
function bucketShort(b) {
  return ({
    'past': 'Past', '0-3': '0-3mo', '3-6': '3-6mo', '6-12': '6-12mo',
    '12-18': '12-18mo', '18+': '18mo+', 'no-date': 'no date',
  })[b] || b;
}
function pct(a, b) { return b ? Math.round((a/b)*100) + '%' : '0%'; }

/* Chart.js options that match the admin's dark theme */
function chartOpts(opts) {
  opts = opts || {};
  const grid = 'rgba(255,255,255,0.06)';
  const text = 'rgba(255,255,255,0.65)';
  const o = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: opts.indexAxis,
    plugins: {
      legend: { display: !!opts.legend, labels: { color: text, font: { size: 11 } } },
      tooltip: { backgroundColor: 'rgba(0,0,0,0.85)', titleColor: '#fff', bodyColor: '#fff' }
    },
    scales: opts.percent ? {} : {
      x: { ticks: { color: text }, grid: { color: grid } },
      y: { ticks: { color: text }, grid: { color: grid }, title: opts.yTitle ? { display: true, text: opts.yTitle, color: text } : undefined }
    },
  };
  return o;
}

/* ── Copy-emails actions ──────────────────────────────────────────────── */
function copyExpoBucket(b) {
  const list = (window._expoBuckets && window._expoBuckets[b]) || [];
  const emails = list.map(l => l.email).filter(Boolean).join(', ');
  copyToClipboard(emails, `${list.length} emails copied — paste into BCC`);
}
function copyAllExpoBuckets() {
  const all = Object.values(window._expoBuckets || {}).flat();
  const emails = all.map(l => l.email).filter(Boolean).join(', ');
  copyToClipboard(emails, `${all.length} emails copied — paste into BCC`);
}
function copyToClipboard(text, msg) {
  if (!text) return showToast('Nothing to copy', 'warn');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(msg || 'Copied'));
  } else {
    /* Fallback */
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast(msg || 'Copied'); } catch(e) { showToast('Copy failed', 'error'); }
    document.body.removeChild(ta);
  }
}
