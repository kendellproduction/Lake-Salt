/* ══════════════════════════════════════
   MODULE 7 — FUNNEL & CONVERSION METRICS
══════════════════════════════════════ */

async function renderFunnel() {
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Funnel</div>
        <div class="page-subtitle">Lead-to-booked conversion rates and pipeline health</div>
      </div>
    </div>
    <div class="stat-grid" id="funnel-stats">
      ${[1,2,3,4].map(()=>`<div class="stat-card"><div class="skeleton skeleton-line w-1/4" style="height:11px;margin-bottom:10px;"></div><div class="skeleton skeleton-line w-1/2" style="height:28px;"></div></div>`).join('')}
    </div>
    <div class="chart-grid" style="grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">Lead Pipeline Funnel</div>
        <div id="funnel-visual"></div>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">Leads by Event Type</div>
        <canvas id="chart-lead-types" height="220"></canvas>
      </div>
    </div>
    <div class="chart-grid" style="grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">Monthly Lead Volume</div>
        <canvas id="chart-lead-volume" height="200"></canvas>
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:16px">Stage Conversion Rates</div>
        <div id="conversion-rates"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Traffic Sources</span>
        <span class="text-muted" style="font-size:12px">Connect GA4 to enable live data</span>
      </div>
      <div id="traffic-sources"></div>
    </div>`;

  // Fetch lead + event data
  const [leadsSnap, eventsSnap] = await Promise.all([
    db.collection('leads').get(),
    db.collection('events').get()
  ]);

  const leads  = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ── Stage counts ──
  const stages = ['New Lead','Contacted','Proposal Sent','Booked','Completed','Lost'];
  const stageCounts = {};
  stages.forEach(s => { stageCounts[s] = 0; });
  leads.forEach(l => { const s = l.stage||'New Lead'; stageCounts[s] = (stageCounts[s]||0)+1; });

  const total      = leads.length;
  const booked     = (stageCounts['Booked']||0) + (stageCounts['Completed']||0);
  const inPipeline = ['New Lead','Contacted','Proposal Sent'].reduce((s,st)=>s+(stageCounts[st]||0),0);
  const lost       = stageCounts['Lost'] || 0;
  const closeRate  = total > 0 ? ((booked / total) * 100).toFixed(1) : 0;
  const lossRate   = total > 0 ? ((lost / total) * 100).toFixed(1) : 0;

  document.getElementById('funnel-stats').innerHTML = `
    <div class="stat-card gold"><div class="stat-label">Total Leads</div><div class="stat-value">${total}</div><div class="stat-sub">all time</div></div>
    <div class="stat-card green"><div class="stat-label">Close Rate</div><div class="stat-value">${closeRate}%</div><div class="stat-sub">${booked} booked/completed</div></div>
    <div class="stat-card teal"><div class="stat-label">In Pipeline</div><div class="stat-value">${inPipeline}</div><div class="stat-sub">active opportunities</div></div>
    <div class="stat-card red"><div class="stat-label">Lost Rate</div><div class="stat-value">${lossRate}%</div><div class="stat-sub">${lost} lost leads</div></div>`;

  // ── Funnel visual ──
  const funnelColors = {
    'New Lead':      '#1A9E8F',
    'Contacted':     '#C9A84C',
    'Proposal Sent': '#a855f7',
    'Booked':        '#22c55e',
    'Completed':     '#64748b',
    'Lost':          '#E05252'
  };
  const activeStages = ['New Lead','Contacted','Proposal Sent','Booked','Completed'];
  const maxCount = Math.max(...activeStages.map(s => stageCounts[s]||0), 1);

  document.getElementById('funnel-visual').innerHTML = activeStages.map((s, idx) => {
    const count = stageCounts[s] || 0;
    const pct   = Math.max(((count / maxCount) * 100), 8);
    const prevCount = idx > 0 ? (stageCounts[activeStages[idx-1]]||0) : count;
    const dropoff = prevCount > 0 && idx > 0 ? (((prevCount - count) / prevCount) * 100).toFixed(0) : null;
    return `
      <div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:12px;color:#8A9DB5">${s}</span>
          <span style="font-size:12px;color:${funnelColors[s]};font-weight:600">${count}${dropoff ? ` <span style="color:#E05252;font-size:10px">↓${dropoff}%</span>` : ''}</span>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:28px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${funnelColors[s]};opacity:0.85;border-radius:4px;transition:width 0.5s ease;display:flex;align-items:center;padding-left:8px">
            <span style="font-size:11px;color:#fff;font-weight:600">${count > 0 ? count : ''}</span>
          </div>
        </div>
      </div>`;
  }).join('') + `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between">
    <span style="font-size:11px;color:#8A9DB5">Lost: ${lost}</span>
    <span style="font-size:11px;color:var(--green)">Overall close rate: ${closeRate}%</span>
  </div>`;

  // ── Lead types doughnut ──
  const typeCounts = {};
  leads.forEach(l => {
    const t = l.eventType||'Other';
    typeCounts[t] = (typeCounts[t]||0) + 1;
  });
  const typesCtx = document.getElementById('chart-lead-types')?.getContext('2d');
  if (typesCtx && Object.keys(typeCounts).length) {
    new Chart(typesCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(typeCounts),
        datasets: [{ data: Object.values(typeCounts), backgroundColor: ['#C9A84C','#1A9E8F','#a855f7','#22c55e','#E05252'], borderWidth: 0 }]
      },
      options: {
        responsive: true, cutout: '65%',
        plugins: { legend: { position: 'right', labels: { color: '#8A9DB5', font:{size:11} } } }
      }
    });
  } else if (typesCtx) {
    document.getElementById('chart-lead-types').parentElement.innerHTML += `<div class="empty-state" style="padding:20px 0"><div class="empty-icon">📊</div><div class="empty-title">No leads yet</div></div>`;
  }

  // ── Monthly lead volume bar chart ──
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const leadsByMonth  = new Array(12).fill(0);
  const bookedByMonth = new Array(12).fill(0);
  leads.forEach(l => {
    const m = l.createdAt?.toDate ? l.createdAt.toDate().getMonth() : (l.eventDate ? new Date(l.eventDate).getMonth() : -1);
    if (m >= 0) {
      leadsByMonth[m]++;
      if (l.stage === 'Booked' || l.stage === 'Completed') bookedByMonth[m]++;
    }
  });
  const volCtx = document.getElementById('chart-lead-volume')?.getContext('2d');
  if (volCtx) {
    new Chart(volCtx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Leads',  data: leadsByMonth,  backgroundColor: 'rgba(201,168,76,0.6)', borderRadius: 3 },
          { label: 'Booked', data: bookedByMonth, backgroundColor: 'rgba(34,197,94,0.7)',  borderRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#8A9DB5', font:{size:11} } } },
        scales: {
          x: { ticks: { color: '#8A9DB5', font:{size:10} }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#8A9DB5', font:{size:10}, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
      }
    });
  }

  // ── Stage-to-stage conversion rates ──
  const convEl = document.getElementById('conversion-rates');
  const convPairs = [
    ['New Lead → Contacted',     'New Lead',     'Contacted'],
    ['Contacted → Proposal',     'Contacted',    'Proposal Sent'],
    ['Proposal → Booked',        'Proposal Sent','Booked'],
    ['Overall → Booked',         null,            null]
  ];
  convEl.innerHTML = convPairs.map(([label, from, to]) => {
    let rate, fromCount, toCount;
    if (!from && !to) {
      fromCount = total;
      toCount   = booked;
    } else {
      fromCount = stageCounts[from] || 0;
      toCount   = stageCounts[to]   || 0;
    }
    rate = fromCount > 0 ? ((toCount / fromCount) * 100).toFixed(0) : 0;
    const barColor = Number(rate) >= 50 ? 'var(--green)' : Number(rate) >= 25 ? 'var(--gold)' : 'var(--red)';
    return `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:12px;color:#8A9DB5">${label}</span>
          <span style="font-size:12px;font-weight:600;color:${barColor}">${rate}%</span>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:4px;height:8px">
          <div style="height:100%;width:${Math.min(rate,100)}%;background:${barColor};border-radius:4px"></div>
        </div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${toCount} of ${fromCount}</div>
      </div>`;
  }).join('');

  // ── Traffic sources (static placeholder with GA4 instructions) ──
  document.getElementById('traffic-sources').innerHTML = `
    <div style="padding:20px 0">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px">
        ${[
          { src: 'Direct', icon: '🔗', note: 'Bookmarked / typed' },
          { src: 'Organic Search', icon: '🔍', note: 'Google / Bing SEO' },
          { src: 'Social', icon: '📱', note: 'Instagram / TikTok' },
          { src: 'Referral', icon: '🤝', note: 'Word-of-mouth links' }
        ].map(s => `
          <div class="stat-card" style="text-align:center;padding:16px">
            <div style="font-size:24px;margin-bottom:6px">${s.icon}</div>
            <div style="font-size:13px;font-weight:600;margin-bottom:2px">${s.src}</div>
            <div style="font-size:11px;color:#64748b">${s.note}</div>
            <div style="font-size:11px;color:var(--teal);margin-top:8px">Connect GA4 →</div>
          </div>`).join('')}
      </div>
      <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:8px;padding:16px">
        <div style="font-size:13px;font-weight:600;color:var(--gold);margin-bottom:8px">🔌 Connect Google Analytics 4</div>
        <div style="font-size:12px;color:#8A9DB5;line-height:1.6">
          To enable live traffic source data, add your GA4 Measurement ID to <code style="color:var(--teal)">firebase-init.js</code> and
          configure the GA4 Data API. Your measurement ID is <code style="color:var(--teal)">G-LSQL7V93XB</code> — already included in your Firebase config.
          <br/><br/>
          Enable the GA4 Data API in Google Cloud Console → APIs & Services → Enable APIs, then use a service account with the Analytics Viewer role.
        </div>
      </div>
    </div>`;
}
