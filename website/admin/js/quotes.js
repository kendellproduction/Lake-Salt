/* ═════════════════════════════════════════════════════════════════════════
   QUOTES — real-time quote builder + standalone hub + settings.

   Two surfaces, one builder:
     • renderQuoteBuilder(container, lead)  — embedded in the lead modal
     • renderQuotes()                       — standalone /admin/#quotes hub

   Storage:
     • settings/quote_defaults  — your rates, packages, peak rules
     • quotes/{id}              — every saved quote (draft/sent/locked/expired)
     • leads/{id} mirrors latestQuoteId/Total/Status for fast list display

   Margin is computed silently and shown to admin only (never in copy text).
   ───────────────────────────────────────────────────────────────────────── */

const DEFAULT_QUOTE_DEFAULTS = {
  bartenderRate: 45,        // $/hr per bartender (charged to client)
  bartenderCostHr: 22,      // $/hr per bartender (your cost — for margin)
  travelBase: 75,
  hoursDefault: 5,
  bartendersPerGuests: 75,
  packages: {
    beerWine:  { label: 'Beer & Wine',         perGuest: 18 },
    fullBar:   { label: 'Full Bar',            perGuest: 28 },
    signature: { label: 'Full Bar + Signature', perGuest: 38 },
    custom:    { label: 'Custom (flat fee)',   perGuest: 0  }
  },
  addOns: {
    glassware:    { label: 'Glassware service',     price: 95 },
    tablecloths:  { label: 'Tablecloths',           price: 120 },
    mixerKit:     { label: 'Mixer & garnish kit',   price: 85 },
    iceService:   { label: 'Ice service',           price: 60 },
    smokeShow:    { label: 'Smoke-show signature',  price: 150 }
  },
  depositPct: 30,
  saturdayPeakMultiplier: 1.15,
  peakMonths: [5, 6, 9, 10],  // May, June, Sept, Oct (1-indexed)
  discountPresets: [
    { label: 'Returning client', pct: 5 },
    { label: 'Military / first-responder', pct: 10 },
    { label: 'Match competitor', pct: 8 }
  ],
  quoteExpiryDays: 14,
  packageCostPctOfRevenue: 0.30 // rough COGS % for margin estimate on drink package
};

let QUOTE_DEFAULTS = { ...DEFAULT_QUOTE_DEFAULTS };

async function loadQuoteDefaults() {
  try {
    const doc = await db.collection('settings').doc('quote_defaults').get();
    if (doc.exists) QUOTE_DEFAULTS = { ...DEFAULT_QUOTE_DEFAULTS, ...doc.data() };
  } catch (e) { console.warn('Quote defaults load failed:', e); }
  return QUOTE_DEFAULTS;
}

async function saveQuoteDefaults(updates) {
  QUOTE_DEFAULTS = { ...QUOTE_DEFAULTS, ...updates };
  await db.collection('settings').doc('quote_defaults').set(QUOTE_DEFAULTS, { merge: true });
  return QUOTE_DEFAULTS;
}

/* Bootstrap defaults on admin load. */
if (typeof db !== 'undefined') loadQuoteDefaults();

const moneyFmt = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function parseGuests(g) {
  if (!g) return 100;
  if (typeof g === 'number') return g;
  // Handles "150", "150-300", "150–300"
  const m = String(g).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 100;
}

function suggestPeak(eventDate) {
  if (!eventDate) return { isPeak: false, reason: '' };
  const d = new Date(eventDate);
  if (isNaN(d)) return { isPeak: false, reason: '' };
  const day = d.getDay();         // 0=Sun, 6=Sat
  const month = d.getMonth() + 1; // 1-indexed
  const isSat = day === 6;
  const isPeakMonth = QUOTE_DEFAULTS.peakMonths.includes(month);
  if (isSat && isPeakMonth) return { isPeak: true, reason: 'Saturday in peak season' };
  if (isSat) return { isPeak: true, reason: 'Saturday' };
  if (isPeakMonth) return { isPeak: true, reason: 'Peak season' };
  return { isPeak: false, reason: '' };
}

/* ─── In-memory quote state (per active builder instance) ─── */
function makeInitialQuote(lead) {
  const guests = parseGuests(lead?.guestCount);
  const peak = suggestPeak(lead?.eventDate);
  return {
    leadId: lead?.id || null,
    leadName: lead?.name || '',
    serviceHours: QUOTE_DEFAULTS.hoursDefault,
    bartenders: Math.max(1, Math.ceil(guests / QUOTE_DEFAULTS.bartendersPerGuests)),
    bartenderRate: QUOTE_DEFAULTS.bartenderRate,
    travelFee: QUOTE_DEFAULTS.travelBase,
    packageKey: 'fullBar',
    packageFlatFee: 0,
    guestCount: guests,
    addOns: {},
    peakApplied: peak.isPeak,
    peakReason: peak.reason,
    peakMultiplier: QUOTE_DEFAULTS.saturdayPeakMultiplier,
    discountType: 'pct',  // 'pct' | 'amt'
    discountValue: 0,
    depositPct: QUOTE_DEFAULTS.depositPct,
    notes: '',
    budgetTarget: parseBudget(lead?.budget)
  };
}

function parseBudget(b) {
  if (!b) return 0;
  if (typeof b === 'number') return b;
  const n = parseInt(String(b).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/* Pure calc — no DOM. Returns { subtotal, peakAdj, beforeDiscount, discountAmt, total, deposit, costEstimate, profit, marginPct } */
function calcQuote(q) {
  const bartenderTotal = (q.serviceHours || 0) * (q.bartenderRate || 0) * (q.bartenders || 0);
  const pkg = QUOTE_DEFAULTS.packages[q.packageKey] || { perGuest: 0, label: '' };
  const drinkTotal = q.packageKey === 'custom'
    ? (q.packageFlatFee || 0)
    : (pkg.perGuest || 0) * (q.guestCount || 0);
  const addOnTotal = Object.entries(q.addOns || {})
    .filter(([_, on]) => on)
    .reduce((sum, [k]) => sum + (QUOTE_DEFAULTS.addOns[k]?.price || 0), 0);

  const subtotal = bartenderTotal + drinkTotal + addOnTotal + (q.travelFee || 0);
  const peakAdj = q.peakApplied ? subtotal * (q.peakMultiplier - 1) : 0;
  const beforeDiscount = subtotal + peakAdj;
  const discountAmt = q.discountType === 'pct'
    ? beforeDiscount * (q.discountValue / 100)
    : (q.discountValue || 0);
  const total = Math.max(0, beforeDiscount - discountAmt);
  const deposit = total * ((q.depositPct || 0) / 100);

  /* Cost estimate (for margin): bartender labor + package COGS estimate.
     Travel and add-ons treated as ~50% margin. */
  const laborCost = (q.serviceHours || 0) * (QUOTE_DEFAULTS.bartenderCostHr || 0) * (q.bartenders || 0);
  const packageCost = drinkTotal * (QUOTE_DEFAULTS.packageCostPctOfRevenue || 0.3);
  const travelCost = (q.travelFee || 0) * 0.4;
  const addOnCost = addOnTotal * 0.4;
  const costEstimate = laborCost + packageCost + travelCost + addOnCost;
  const profit = total - costEstimate;
  const marginPct = total > 0 ? (profit / total) * 100 : 0;

  return { subtotal, peakAdj, beforeDiscount, discountAmt, total, deposit, costEstimate, profit, marginPct,
           breakdown: { bartenderTotal, drinkTotal, addOnTotal, travelFee: q.travelFee || 0 } };
}

/* Markdown-style quote text for copy/email. Margin NEVER included. */
function quoteText(q, calc) {
  const pkg = QUOTE_DEFAULTS.packages[q.packageKey];
  const addOnLines = Object.entries(q.addOns || {})
    .filter(([_, on]) => on)
    .map(([k]) => `• ${QUOTE_DEFAULTS.addOns[k]?.label || k}: ${moneyFmt(QUOTE_DEFAULTS.addOns[k]?.price || 0)}`);
  const lines = [
    `Lake Salt Bartending — Quote for ${q.leadName || 'your event'}`,
    `─────────────────────────────────────`,
    `Bartenders: ${q.bartenders} × ${q.serviceHours} hrs @ ${moneyFmt(q.bartenderRate)}/hr = ${moneyFmt(calc.breakdown.bartenderTotal)}`,
    `Drinks: ${pkg?.label || 'Custom'}${q.packageKey !== 'custom' ? ` × ${q.guestCount} guests` : ''} = ${moneyFmt(calc.breakdown.drinkTotal)}`,
    `Travel: ${moneyFmt(q.travelFee)}`,
    ...addOnLines,
    `─────────────────────────────────────`,
    `Subtotal: ${moneyFmt(calc.subtotal)}`,
    q.peakApplied ? `Peak adjustment (${q.peakReason}, +${Math.round((q.peakMultiplier-1)*100)}%): ${moneyFmt(calc.peakAdj)}` : null,
    calc.discountAmt > 0 ? `Discount: −${moneyFmt(calc.discountAmt)}` : null,
    ``,
    `TOTAL: ${moneyFmt(calc.total)}`,
    `Deposit to lock the date (${q.depositPct}%): ${moneyFmt(calc.deposit)}`,
    ``,
    `Quote valid for ${QUOTE_DEFAULTS.quoteExpiryDays} days.`,
    q.notes ? `\nNotes: ${q.notes}` : ''
  ].filter(Boolean);
  return lines.join('\n');
}

/* ═════════════════════════════════════════════════════════════════════════
   QUOTE BUILDER COMPONENT
   Renders into the provided container. Self-managed state.
   ───────────────────────────────────────────────────────────────────────── */

function renderQuoteBuilder(containerId, lead, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const state = { q: makeInitialQuote(lead) };

  function render() {
    const q = state.q;
    const calc = calcQuote(q);

    // Budget comparison color
    let budgetBadge = '';
    if (q.budgetTarget > 0) {
      const diff = calc.total - q.budgetTarget;
      if (diff <= 0) {
        budgetBadge = `<span class="badge" style="background:rgba(34,197,94,0.15);color:#22c55e">✓ Under budget (saving ${moneyFmt(-diff)})</span>`;
      } else if (diff / q.budgetTarget < 0.1) {
        budgetBadge = `<span class="badge" style="background:rgba(250,204,21,0.15);color:#FACC15">⚠ ${moneyFmt(diff)} over budget</span>`;
      } else {
        budgetBadge = `<span class="badge" style="background:rgba(224,82,82,0.15);color:#E05252">${moneyFmt(diff)} over budget</span>`;
      }
    }

    const marginColor = calc.marginPct >= 50 ? '#22c55e' : calc.marginPct >= 35 ? '#FACC15' : '#E05252';

    container.innerHTML = `
      <div class="qb-wrap" style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;flex-wrap:wrap">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--gold)">💰 Quote builder</div>
          ${budgetBadge}
        </div>

        <!-- LINE ITEMS GRID -->
        <div class="qb-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
          <label class="qb-field"><span>Service hours</span>
            <input type="number" min="1" step="0.5" id="qb-hours" value="${q.serviceHours}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Bartenders</span>
            <input type="number" min="1" id="qb-bartenders" value="${q.bartenders}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Rate ($/hr per bartender)</span>
            <input type="number" min="0" id="qb-rate" value="${q.bartenderRate}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Travel fee</span>
            <input type="number" min="0" id="qb-travel" value="${q.travelFee}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Drink package</span>
            <select id="qb-package" class="form-select qb-input">
              ${Object.entries(QUOTE_DEFAULTS.packages).map(([k,p]) =>
                `<option value="${k}" ${k===q.packageKey?'selected':''}>${p.label}${p.perGuest?` ($${p.perGuest}/guest)`:''}</option>`).join('')}
            </select></label>
          ${q.packageKey === 'custom'
            ? `<label class="qb-field"><span>Custom drink fee ($)</span><input type="number" min="0" id="qb-pkgflat" value="${q.packageFlatFee}" class="form-input qb-input"></label>`
            : `<label class="qb-field"><span>Guest count</span><input type="number" min="1" id="qb-guests" value="${q.guestCount}" class="form-input qb-input"></label>`}
        </div>

        <!-- ADD-ONS -->
        <div style="margin-top:14px">
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:6px">Add-ons</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${Object.entries(QUOTE_DEFAULTS.addOns).map(([k,a]) => `
              <label class="qb-addon" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid ${q.addOns[k]?'var(--gold)':'var(--border)'};border-radius:20px;font-size:12px;cursor:pointer;background:${q.addOns[k]?'rgba(201,168,76,0.12)':'transparent'}">
                <input type="checkbox" data-addon="${k}" ${q.addOns[k]?'checked':''} style="margin:0">
                ${a.label} · ${moneyFmt(a.price)}
              </label>`).join('')}
          </div>
        </div>

        <!-- PEAK + DISCOUNT -->
        <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="padding:10px 12px;border:1px dashed var(--border);border-radius:8px">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
              <input type="checkbox" id="qb-peak" ${q.peakApplied?'checked':''}>
              <span>Peak +${Math.round((q.peakMultiplier-1)*100)}%</span>
            </label>
            ${q.peakReason?`<div class="text-muted" style="font-size:11px;margin-top:4px;margin-left:24px">${q.peakReason}</div>`:''}
          </div>
          <div style="padding:10px 12px;border:1px dashed var(--border);border-radius:8px">
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:6px">Discount</div>
            <div style="display:flex;gap:6px;align-items:center">
              <select id="qb-disctype" class="form-select" style="flex:0 0 70px;padding:4px 6px;font-size:12px">
                <option value="pct" ${q.discountType==='pct'?'selected':''}>%</option>
                <option value="amt" ${q.discountType==='amt'?'selected':''}>$</option>
              </select>
              <input type="number" min="0" id="qb-discval" value="${q.discountValue}" class="form-input" style="flex:1;padding:4px 8px;font-size:13px">
            </div>
            <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
              ${QUOTE_DEFAULTS.discountPresets.map(p => `<button type="button" class="qb-preset btn btn-ghost" data-pct="${p.pct}" style="padding:2px 8px;font-size:11px">${p.label} (${p.pct}%)</button>`).join('')}
            </div>
          </div>
        </div>

        <!-- TOTALS STRIP -->
        <div style="margin-top:14px;padding:12px;background:linear-gradient(135deg,rgba(201,168,76,0.10),rgba(139,155,126,0.08));border:1px solid rgba(201,168,76,0.35);border-radius:10px">
          <div style="display:grid;grid-template-columns:1fr auto;row-gap:4px;font-size:13px">
            <div class="text-muted">Subtotal</div><div style="text-align:right">${moneyFmt(calc.subtotal)}</div>
            ${q.peakApplied?`<div class="text-muted">Peak adj.</div><div style="text-align:right">+${moneyFmt(calc.peakAdj)}</div>`:''}
            ${calc.discountAmt>0?`<div class="text-muted">Discount</div><div style="text-align:right;color:#22c55e">−${moneyFmt(calc.discountAmt)}</div>`:''}
            <div style="font-weight:700;color:var(--text);font-size:18px;margin-top:4px">Total</div>
            <div style="text-align:right;font-weight:700;color:var(--gold);font-size:22px">${moneyFmt(calc.total)}</div>
            <div class="text-muted" style="font-size:12px">Deposit (${q.depositPct}%)</div><div style="text-align:right;font-size:12px">${moneyFmt(calc.deposit)}</div>
          </div>
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:12px">
            <span class="text-muted">Est. profit (admin only)</span>
            <span style="color:${marginColor};font-weight:700">${moneyFmt(calc.profit)} · ${Math.round(calc.marginPct)}% margin</span>
          </div>
        </div>

        <!-- NOTES -->
        <textarea id="qb-notes" placeholder="Internal/client notes (optional)…" class="form-input" style="margin-top:12px;width:100%;min-height:50px;font-size:13px">${q.notes}</textarea>

        <!-- ACTIONS -->
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-secondary btn-sm" id="qb-save">💾 Save draft</button>
          <button class="btn btn-primary btn-sm" id="qb-lock">🔒 Lock in & mark Proposal Sent</button>
          <button class="btn btn-ghost btn-sm" id="qb-copy">📋 Copy quote text</button>
          <button class="btn btn-ghost btn-sm" id="qb-email">✉ Email proposal</button>
        </div>
        <div id="qb-history" style="margin-top:14px"></div>
      </div>
    `;

    /* Wire inputs — single delegated approach */
    container.querySelectorAll('.qb-input').forEach(el => {
      el.addEventListener('input', () => sync());
      el.addEventListener('change', () => sync());
    });
    container.querySelectorAll('input[data-addon]').forEach(el => {
      el.addEventListener('change', () => {
        state.q.addOns[el.dataset.addon] = el.checked;
        render();
      });
    });
    container.querySelector('#qb-peak')?.addEventListener('change', (e) => { state.q.peakApplied = e.target.checked; render(); });
    container.querySelector('#qb-disctype')?.addEventListener('change', (e) => { state.q.discountType = e.target.value; sync(); });
    container.querySelector('#qb-discval')?.addEventListener('input', (e) => { state.q.discountValue = parseFloat(e.target.value) || 0; render(); });
    container.querySelectorAll('.qb-preset').forEach(b => {
      b.addEventListener('click', () => {
        state.q.discountType = 'pct';
        state.q.discountValue = parseFloat(b.dataset.pct);
        render();
      });
    });
    container.querySelector('#qb-notes')?.addEventListener('input', (e) => { state.q.notes = e.target.value; });

    container.querySelector('#qb-save')?.addEventListener('click', () => saveQuote('draft'));
    container.querySelector('#qb-lock')?.addEventListener('click', () => saveQuote('locked'));
    container.querySelector('#qb-copy')?.addEventListener('click', () => copyToClipboard(quoteText(state.q, calc)));
    container.querySelector('#qb-email')?.addEventListener('click', () => emailProposal());

    loadHistory();
  }

  function sync() {
    const q = state.q;
    q.serviceHours    = parseFloat(document.getElementById('qb-hours').value) || 0;
    q.bartenders      = parseInt(document.getElementById('qb-bartenders').value, 10) || 1;
    q.bartenderRate   = parseFloat(document.getElementById('qb-rate').value) || 0;
    q.travelFee       = parseFloat(document.getElementById('qb-travel').value) || 0;
    const newPkg      = document.getElementById('qb-package').value;
    const pkgChanged  = newPkg !== q.packageKey;
    q.packageKey      = newPkg;
    if (q.packageKey === 'custom') {
      q.packageFlatFee = parseFloat(document.getElementById('qb-pkgflat')?.value) || 0;
    } else {
      q.guestCount = parseInt(document.getElementById('qb-guests')?.value, 10) || q.guestCount;
    }
    if (pkgChanged) render(); // need to swap the guest/flat-fee input
    else render();
  }

  async function saveQuote(status) {
    const calc = calcQuote(state.q);
    if (status === 'locked' && !state.q.leadId) {
      alert('Link a lead before locking the quote.');
      return;
    }
    const payload = {
      leadId: state.q.leadId,
      leadName: state.q.leadName,
      lineItems: {
        serviceHours: state.q.serviceHours,
        bartenders: state.q.bartenders,
        bartenderRate: state.q.bartenderRate,
        travelFee: state.q.travelFee,
        packageKey: state.q.packageKey,
        packageFlatFee: state.q.packageFlatFee,
        guestCount: state.q.guestCount,
        addOns: { ...state.q.addOns }
      },
      subtotal: calc.subtotal,
      peakApplied: state.q.peakApplied,
      peakMultiplier: state.q.peakMultiplier,
      peakAdj: calc.peakAdj,
      peakReason: state.q.peakReason,
      discountType: state.q.discountType,
      discountValue: state.q.discountValue,
      discountAmt: calc.discountAmt,
      total: calc.total,
      depositPct: state.q.depositPct,
      deposit: calc.deposit,
      costEstimate: calc.costEstimate,
      profit: calc.profit,
      marginPct: calc.marginPct,
      budgetTarget: state.q.budgetTarget,
      notes: state.q.notes,
      status,
      expiresAt: new Date(Date.now() + QUOTE_DEFAULTS.quoteExpiryDays * 86400000).toISOString().slice(0,10),
      createdAt: TS(),
      createdBy: currentUser?.displayName || currentUser?.email || 'Admin'
    };
    if (status === 'locked') payload.lockedAt = TS();

    try {
      const ref = await db.collection('quotes').add(payload);
      logActivity(status === 'locked' ? 'quote_locked' : 'quote_saved', 'quotes', ref.id,
        `${status === 'locked' ? 'Locked' : 'Saved'} quote for ${state.q.leadName || 'lead'} — ${moneyFmt(calc.total)}`,
        { total: calc.total, leadId: state.q.leadId });

      /* Mirror summary on the lead for fast list display. */
      if (state.q.leadId) {
        const update = {
          latestQuoteId: ref.id,
          latestQuoteTotal: calc.total,
          latestQuoteStatus: status,
          updatedAt: TS()
        };
        if (status === 'locked') update.stage = 'Proposal Sent';
        await db.collection('leads').doc(state.q.leadId).update(update);
      }
      showToast(status === 'locked' ? '🔒 Quote locked — stage moved to Proposal Sent' : 'Quote saved');
      if (status === 'locked' && typeof closeModal === 'function') closeModal();
      else loadHistory();
    } catch (err) {
      console.error('Save quote failed:', err);
      alert('Could not save quote — see console.');
    }
  }

  async function loadHistory() {
    const wrap = document.getElementById('qb-history');
    if (!wrap || !state.q.leadId) { if (wrap) wrap.innerHTML = ''; return; }
    try {
      const snap = await db.collection('quotes').where('leadId','==',state.q.leadId).get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b.createdAt?.toMillis?.()||0) - (a.createdAt?.toMillis?.()||0));
      if (!list.length) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = `
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin:14px 0 6px">Quote history (${list.length})</div>
        ${list.map((q,i) => {
          const when = q.createdAt?.toDate ? q.createdAt.toDate().toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
          const statusColor = q.status==='locked'?'#22c55e':q.status==='sent'?'#3b82f6':'var(--text-muted)';
          return `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-top:1px solid var(--border)">
            <span>v${list.length - i} · ${when}</span>
            <span><span style="color:${statusColor};text-transform:uppercase;font-size:10px;letter-spacing:.1em;margin-right:8px">${q.status}</span><strong>${moneyFmt(q.total)}</strong></span>
          </div>`;
        }).join('')}
      `;
    } catch (e) { console.warn('History load failed:', e); }
  }

  function emailProposal() {
    const calc = calcQuote(state.q);
    const subject = encodeURIComponent(`Lake Salt — Quote for your event`);
    const body = encodeURIComponent(quoteText(state.q, calc) + '\n\nLooking forward to bartending your event!\n— Kendell · Lake Salt');
    const to = encodeURIComponent(options.leadEmail || '');
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  render();
  return state;
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    showToast('Copied to clipboard');
  }
}

/* ═════════════════════════════════════════════════════════════════════════
   STANDALONE QUOTES HUB — /admin/#quotes
   ───────────────────────────────────────────────────────────────────────── */

async function renderQuotes() {
  await loadQuoteDefaults();
  const c = document.getElementById('module-container');
  c.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Quotes</div>
        <div class="page-subtitle">All quotes across every lead · proposals sent · revenue pipeline</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="quotes-merge">⚠ Merge duplicates</button>
        <button class="btn btn-primary" id="quotes-new">+ New quote</button>
      </div>
    </div>

    <div class="stat-grid" id="quotes-stats" style="margin-bottom:18px">
      <div class="stat-card"><div class="stat-label">Drafts</div><div class="stat-value" id="qs-draft">…</div></div>
      <div class="stat-card"><div class="stat-label">Locked / Sent</div><div class="stat-value" id="qs-locked">…</div></div>
      <div class="stat-card"><div class="stat-label">Locked $ this month</div><div class="stat-value" id="qs-month">…</div></div>
      <div class="stat-card"><div class="stat-label">Avg locked $</div><div class="stat-value" id="qs-avg">…</div></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">All quotes</span></div>
      <div id="quotes-list">Loading…</div>
    </div>
  `;

  document.getElementById('quotes-new').addEventListener('click', openNewQuoteModal);
  document.getElementById('quotes-merge').addEventListener('click', openMergeDuplicatesModal);

  const unsub = db.collection('quotes').orderBy('createdAt','desc').onSnapshot(snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    /* Stats */
    const drafts = list.filter(q => q.status === 'draft').length;
    const locked = list.filter(q => q.status === 'locked' || q.status === 'sent').length;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthLocked = list.filter(q =>
      (q.status === 'locked' || q.status === 'sent') &&
      q.createdAt?.toDate && q.createdAt.toDate() >= monthStart
    );
    const monthSum = thisMonthLocked.reduce((s,q) => s + (q.total || 0), 0);
    const lockedQ = list.filter(q => q.status === 'locked' || q.status === 'sent');
    const avg = lockedQ.length ? lockedQ.reduce((s,q)=>s+(q.total||0),0)/lockedQ.length : 0;

    document.getElementById('qs-draft').textContent = drafts;
    document.getElementById('qs-locked').textContent = locked;
    document.getElementById('qs-month').textContent = moneyFmt(monthSum);
    document.getElementById('qs-avg').textContent = moneyFmt(avg);

    /* List */
    const listEl = document.getElementById('quotes-list');
    if (!list.length) { listEl.innerHTML = '<div class="text-muted" style="padding:12px;font-size:13px">No quotes yet. Click "+ New quote" to start.</div>'; return; }
    listEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:10px;align-items:center;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);padding:6px 8px;border-bottom:1px solid var(--border)">
        <div>Lead</div><div>Status</div><div style="text-align:right">Total</div><div style="text-align:right">When</div><div></div>
      </div>
      ${list.map(q => {
        const when = q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
        const statusColor = q.status==='locked'?'#22c55e':q.status==='sent'?'#3b82f6':q.status==='expired'?'#E05252':'var(--text-muted)';
        return `<div style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:10px;align-items:center;padding:10px 8px;border-bottom:1px solid var(--border);font-size:13px">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${q.leadName || '(unlinked)'}</div>
          <div style="text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:${statusColor};font-weight:700">${q.status}</div>
          <div style="text-align:right;font-weight:700">${moneyFmt(q.total)}</div>
          <div style="text-align:right;color:var(--text-muted);font-size:12px">${when}</div>
          <div style="text-align:right">${q.leadId?`<button class="btn btn-ghost btn-sm" onclick="openLeadModal('${q.leadId}')" style="font-size:11px;padding:3px 8px">Open lead</button>`:''}</div>
        </div>`;
      }).join('')}
    `;
  });
  _activeListeners.push(unsub);
}

/* Modal: pick existing lead OR create one inline, then open the builder. */
function openNewQuoteModal() {
  openModal('New quote', `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="border:1px solid var(--border);border-radius:10px;padding:12px">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:8px">Link to existing lead</div>
        <input type="text" id="nq-search" class="form-input" placeholder="Type a name or email…" autofocus>
        <div id="nq-results" style="max-height:200px;overflow-y:auto;margin-top:8px"></div>
      </div>
      <div style="text-align:center;color:var(--text-muted);font-size:12px">— or —</div>
      <div style="border:1px solid var(--border);border-radius:10px;padding:12px">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:8px">Create a new lead</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input id="nq-name" class="form-input" placeholder="Name *">
          <input id="nq-email" class="form-input" placeholder="Email">
          <input id="nq-phone" class="form-input" placeholder="Phone">
          <input id="nq-event" class="form-input" placeholder="Event type (Wedding…)">
          <input id="nq-date" type="date" class="form-input">
          <input id="nq-guests" type="number" class="form-input" placeholder="Guest count">
          <input id="nq-venue" class="form-input" placeholder="Venue">
          <input id="nq-budget" type="number" class="form-input" placeholder="Stated budget $">
        </div>
        <button class="btn btn-primary btn-sm" id="nq-create" style="margin-top:10px;width:100%">Create lead & start quote</button>
      </div>
    </div>
  `, { wide: false });

  /* Search */
  const search = document.getElementById('nq-search');
  const results = document.getElementById('nq-results');
  let searchTimeout;
  search.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const term = search.value.toLowerCase().trim();
    if (!term) { results.innerHTML = ''; return; }
    searchTimeout = setTimeout(async () => {
      try {
        const snap = await db.collection('leads').limit(200).get();
        const matches = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(l => `${l.name||''}${l.email||''}${l.phone||''}`.toLowerCase().includes(term))
          .slice(0, 8);
        results.innerHTML = matches.length
          ? matches.map(l => `<div style="padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer" onclick="closeModal();setTimeout(()=>openLeadModal('${l.id}'),50)">
              <div style="font-size:13px;font-weight:600">${l.name||'(no name)'}</div>
              <div class="text-muted" style="font-size:11px">${l.email||''} · ${l.eventType||''} · ${l.eventDate||''}</div>
            </div>`).join('')
          : '<div class="text-muted" style="padding:8px;font-size:12px">No matches</div>';
      } catch (e) { console.warn(e); }
    }, 200);
  });

  /* Create new lead — with email/phone-based duplicate guard */
  document.getElementById('nq-create').addEventListener('click', async () => {
    const name = document.getElementById('nq-name').value.trim();
    const email = document.getElementById('nq-email').value.trim().toLowerCase();
    const phone = document.getElementById('nq-phone').value.trim().replace(/\D/g, '');
    if (!name) { alert('Name is required.'); return; }

    /* Block on duplicate match (email > phone > name+date). Offer to open existing instead. */
    try {
      const existing = await findDuplicateLead({ email, phone, name });
      if (existing) {
        const useExisting = confirm(
          `Looks like this lead already exists:\n\n  ${existing.name || '(no name)'} — ${existing.email || existing.phone || ''}\n\n` +
          `OK = open the existing card and quote from there\nCancel = create anyway (probably the wrong call)`
        );
        if (useExisting) {
          closeModal();
          setTimeout(() => openLeadModal(existing.id), 100);
          return;
        }
      }
    } catch (e) { console.warn('Dedup check failed (continuing):', e); }

    const leadData = {
      name,
      email,
      phone:      document.getElementById('nq-phone').value.trim(),
      eventType:  document.getElementById('nq-event').value.trim() || 'Wedding',
      eventDate:  document.getElementById('nq-date').value || '',
      guestCount: document.getElementById('nq-guests').value || '',
      venue:      document.getElementById('nq-venue').value.trim(),
      budget:     document.getElementById('nq-budget').value || '',
      stage:      'New Lead',
      source:     'Admin · Manual Quote',
      createdAt:  TS()
    };
    try {
      const ref = await db.collection('leads').add(leadData);
      logActivity('create', 'leads', ref.id, `Created lead '${name}' from new-quote modal`);
      closeModal();
      setTimeout(() => openLeadModal(ref.id), 100);
    } catch (e) {
      console.error(e); alert('Could not create lead.');
    }
  });
}

/* ─── Duplicate detection ─── Match by email (case-insensitive), then phone
 * (digits only), then name+eventDate. Skips empty values. */
async function findDuplicateLead({ email, phone, name, eventDate }) {
  const snap = await db.collection('leads').get();
  const norm = (s) => String(s || '').trim().toLowerCase();
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const e = norm(email), p = digits(phone), n = norm(name), d = norm(eventDate);

  for (const doc of snap.docs) {
    const l = doc.data();
    if (e && norm(l.email) === e) return { id: doc.id, ...l };
    if (p && digits(l.phone) === p && p.length >= 7) return { id: doc.id, ...l };
    if (n && d && norm(l.name) === n && norm(l.eventDate) === d) return { id: doc.id, ...l };
  }
  return null;
}

/* ─── Merge-duplicates tool ─── Scans leads, groups by email/phone, surfaces
 * groups of 2+ for one-click merge. Kept lead is the OLDEST (by createdAt or
 * doc id fallback). Younger leads' notes, tasks, quotes, call_bookings are
 * reassigned to the kept lead, then younger leads are deleted. */
async function openMergeDuplicatesModal() {
  openModal('Merge duplicate leads', `
    <div id="md-body">
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Scanning leads for duplicates by email and phone…</div>
    </div>
  `, { wide: true });

  const body = document.getElementById('md-body');
  let snap;
  try { snap = await db.collection('leads').get(); }
  catch (e) { body.innerHTML = `<div style="color:#E05252">Failed to load leads: ${e.message}</div>`; return; }

  const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const norm = (s) => String(s || '').trim().toLowerCase();
  const digits = (s) => String(s || '').replace(/\D/g, '');

  /* Group by email and phone — collect every group of 2+ */
  const groupsMap = new Map();
  const seenIds = new Set();

  for (const l of leads) {
    const e = norm(l.email);
    const p = digits(l.phone);
    const key = e || (p.length >= 7 ? p : null);
    if (!key) continue;
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(l);
  }

  const groups = [...groupsMap.values()].filter(g => g.length >= 2);

  if (!groups.length) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:#22c55e">✓ No duplicates found.</div>`;
    return;
  }

  body.innerHTML = `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;line-height:1.5">
      Found <strong>${groups.length}</strong> duplicate group${groups.length===1?'':'s'}.
      For each group, the <strong>oldest</strong> lead is kept and the younger ones are merged into it
      (notes, tasks, quotes, and call bookings are reassigned, then the younger leads are deleted).
    </p>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${groups.map((g, i) => {
        const sorted = [...g].sort((a,b) => (a.createdAt?.toMillis?.()||0) - (b.createdAt?.toMillis?.()||0));
        const keep = sorted[0];
        const drop = sorted.slice(1);
        return `
          <div style="border:1px solid var(--border);border-radius:10px;padding:12px" data-group="${i}">
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:6px">Group ${i+1} · ${keep.email || keep.phone || ''}</div>
            <div style="background:rgba(34,197,94,0.10);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:8px;margin-bottom:6px">
              <div style="font-size:11px;color:#22c55e;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px">Keep (oldest)</div>
              <div style="font-size:13px"><strong>${keep.name || '(no name)'}</strong> · ${keep.eventDate || ''} · ${keep.stage || ''}</div>
              <div style="font-size:11px;color:var(--text-muted)">id: ${keep.id}</div>
            </div>
            ${drop.map(d => `
              <div style="background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.3);border-radius:8px;padding:8px;margin-bottom:4px">
                <div style="font-size:11px;color:#E05252;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:2px">Merge & delete</div>
                <div style="font-size:13px"><strong>${d.name || '(no name)'}</strong> · ${d.eventDate || ''} · ${d.stage || ''}</div>
                <div style="font-size:11px;color:var(--text-muted)">id: ${d.id}</div>
              </div>`).join('')}
            <button class="btn btn-primary btn-sm md-merge" data-keep="${keep.id}" data-drop="${drop.map(d=>d.id).join(',')}" data-name="${keep.name || ''}">Merge this group</button>
          </div>`;
      }).join('')}
    </div>
  `;

  body.querySelectorAll('.md-merge').forEach(btn => {
    btn.addEventListener('click', async () => {
      const keepId = btn.dataset.keep;
      const dropIds = btn.dataset.drop.split(',').filter(Boolean);
      const keepName = btn.dataset.name;
      if (!confirm(`Merge ${dropIds.length} lead${dropIds.length===1?'':'s'} into ${keepName || keepId}?\n\nThis cannot be undone.`)) return;
      btn.disabled = true;
      btn.textContent = 'Merging…';
      try {
        await mergeLeads(keepId, dropIds);
        btn.textContent = '✓ Merged';
        btn.closest('[data-group]').style.opacity = '0.5';
        showToast(`Merged ${dropIds.length+1} leads into ${keepName}`);
      } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.textContent = 'Retry';
        alert('Merge failed — see console.');
      }
    });
  });
}

async function mergeLeads(keepId, dropIds) {
  const keepRef = db.collection('leads').doc(keepId);
  const keepDoc = await keepRef.get();
  if (!keepDoc.exists) throw new Error('Keep lead does not exist');
  let keep = keepDoc.data();
  const mergedNotes = Array.isArray(keep.notes) ? [...keep.notes] : [];
  const mergedTasks = Array.isArray(keep.tasks) ? [...keep.tasks] : [];

  for (const dropId of dropIds) {
    const dropDoc = await db.collection('leads').doc(dropId).get();
    if (!dropDoc.exists) continue;
    const d = dropDoc.data();

    /* Fold in notes + tasks */
    if (Array.isArray(d.notes)) mergedNotes.push(...d.notes);
    if (Array.isArray(d.tasks)) mergedTasks.push(...d.tasks);

    /* Fill any blank fields on keep from drop */
    ['phone','venue','eventType','eventDate','guestCount','budget','message','source','priority','followUpDate']
      .forEach(k => { if (!keep[k] && d[k]) keep[k] = d[k]; });

    /* Reassign related docs */
    const [quotes, bookings] = await Promise.all([
      db.collection('quotes').where('leadId','==',dropId).get(),
      db.collection('call_bookings').where('leadId','==',dropId).get()
    ]);
    const batch = db.batch();
    quotes.forEach(q => batch.update(q.ref, { leadId: keepId, leadName: keep.name || dropDoc.data().name }));
    bookings.forEach(b => batch.update(b.ref, { leadId: keepId, name: keep.name || dropDoc.data().name }));
    await batch.commit();

    /* Delete the dropped lead */
    await db.collection('leads').doc(dropId).delete();
    logActivity('merge', 'leads', dropId, `Merged into ${keep.name || keepId}`, { mergedInto: keepId });
  }

  /* Save the consolidated keep doc */
  await keepRef.update({
    notes: mergedNotes,
    tasks: mergedTasks,
    phone: keep.phone || '',
    venue: keep.venue || '',
    eventType: keep.eventType || '',
    eventDate: keep.eventDate || '',
    guestCount: keep.guestCount || '',
    budget: keep.budget || '',
    message: keep.message || '',
    source: keep.source || '',
    priority: keep.priority || '',
    followUpDate: keep.followUpDate || '',
    updatedAt: TS()
  });
}

window.openMergeDuplicatesModal = openMergeDuplicatesModal;

window.openNewQuoteModal = openNewQuoteModal;

/* ═════════════════════════════════════════════════════════════════════════
   SETTINGS CARD — drops into the Settings page.
   ───────────────────────────────────────────────────────────────────────── */

function renderQuoteSettingsCard(mountId) {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const D = QUOTE_DEFAULTS;
  mount.innerHTML = `
    <div class="card" style="margin-top:18px">
      <div class="card-header"><span class="card-title">💰 Quote defaults</span></div>
      <p class="text-muted" style="font-size:13px;margin-bottom:14px;line-height:1.5">Pricing used when a new quote is created. Saves to Firestore so your phone and laptop share the same numbers.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="qb-field"><span>Bartender rate ($/hr, charged)</span><input type="number" id="qs-rate" value="${D.bartenderRate}" class="form-input"></label>
        <label class="qb-field"><span>Bartender cost ($/hr, you pay)</span><input type="number" id="qs-cost" value="${D.bartenderCostHr}" class="form-input"></label>
        <label class="qb-field"><span>Travel base ($)</span><input type="number" id="qs-travel" value="${D.travelBase}" class="form-input"></label>
        <label class="qb-field"><span>Default hours</span><input type="number" id="qs-hours" value="${D.hoursDefault}" class="form-input"></label>
        <label class="qb-field"><span>1 bartender per N guests</span><input type="number" id="qs-bpg" value="${D.bartendersPerGuests}" class="form-input"></label>
        <label class="qb-field"><span>Deposit %</span><input type="number" id="qs-dep" value="${D.depositPct}" class="form-input"></label>
        <label class="qb-field"><span>Peak multiplier (e.g. 1.15)</span><input type="number" step="0.05" id="qs-peak" value="${D.saturdayPeakMultiplier}" class="form-input"></label>
        <label class="qb-field"><span>Quote expires after (days)</span><input type="number" id="qs-exp" value="${D.quoteExpiryDays}" class="form-input"></label>
      </div>

      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin:14px 0 6px">Drink packages ($/guest)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${Object.entries(D.packages).filter(([k]) => k !== 'custom').map(([k,p]) =>
          `<label class="qb-field"><span>${p.label}</span><input type="number" data-pkg="${k}" value="${p.perGuest}" class="form-input qs-pkg"></label>`).join('')}
      </div>

      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin:14px 0 6px">Add-on prices ($)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${Object.entries(D.addOns).map(([k,a]) =>
          `<label class="qb-field"><span>${a.label}</span><input type="number" data-addon="${k}" value="${a.price}" class="form-input qs-addon"></label>`).join('')}
      </div>

      <button class="btn btn-primary" id="qs-save" style="margin-top:14px">Save quote defaults</button>
    </div>
  `;

  document.getElementById('qs-save').addEventListener('click', async () => {
    const updates = {
      bartenderRate: +document.getElementById('qs-rate').value,
      bartenderCostHr: +document.getElementById('qs-cost').value,
      travelBase: +document.getElementById('qs-travel').value,
      hoursDefault: +document.getElementById('qs-hours').value,
      bartendersPerGuests: +document.getElementById('qs-bpg').value,
      depositPct: +document.getElementById('qs-dep').value,
      saturdayPeakMultiplier: +document.getElementById('qs-peak').value,
      quoteExpiryDays: +document.getElementById('qs-exp').value,
      packages: { ...D.packages },
      addOns: { ...D.addOns }
    };
    document.querySelectorAll('.qs-pkg').forEach(el => {
      const k = el.dataset.pkg;
      updates.packages[k] = { ...D.packages[k], perGuest: +el.value };
    });
    document.querySelectorAll('.qs-addon').forEach(el => {
      const k = el.dataset.addon;
      updates.addOns[k] = { ...D.addOns[k], price: +el.value };
    });
    try {
      await saveQuoteDefaults(updates);
      logActivity('update', 'settings', 'quote_defaults', 'Updated quote defaults');
      showToast('Quote defaults saved');
    } catch (e) {
      console.error(e); alert('Save failed — see console.');
    }
  });
}

window.renderQuoteBuilder = renderQuoteBuilder;
window.renderQuotes = renderQuotes;
window.renderQuoteSettingsCard = renderQuoteSettingsCard;
