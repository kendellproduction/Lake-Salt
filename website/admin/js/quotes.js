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

  /* Lake Salt offers a curated custom menu of cocktails + mocktails.
   * No "Full Bar" tier. Off-menu requests are a separate per-drink charge. */
  customMenuFeeDefault: 450,
  offMenuPerDrink: 12,

  depositPct: 30,
  saturdayPeakMultiplier: 1.15,
  peakMonths: [5, 6, 9, 10],  // May, June, Sept, Oct (1-indexed)
  discountPresets: [
    { label: 'Returning client', pct: 5 },
    { label: 'Military / first-responder', pct: 10 },
    { label: 'Match competitor', pct: 8 }
  ],
  quoteExpiryDays: 14,
  menuCostPctOfRevenue: 0.30 // rough COGS % on the custom-menu fee, for margin
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

/* Bootstrap defaults — only AFTER auth, so we don't generate
 * permission-denied noise on the sign-in screen. Also runs a one-shot
 * silent auto-merge of high-confidence duplicates (same email or phone). */
let _quotesBootRan = false;
if (typeof auth !== 'undefined' && auth.onAuthStateChanged) {
  auth.onAuthStateChanged(async (user) => {
    if (!user || _quotesBootRan) return;
    _quotesBootRan = true;
    loadQuoteDefaults();
    try {
      const merged = await autoMergeHighConfidence();
      if (merged > 0 && typeof showToast === 'function') {
        showToast(`Auto-merged ${merged} duplicate lead${merged===1?'':'s'} (same email/phone)`, 'info', 5000);
      }
    } catch (e) { console.warn('Auto-merge on load failed:', e); }
  });
}

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
  const budget = parseBudget(lead?.budget);
  return {
    leadId: lead?.id || null,
    leadName: lead?.name || '',
    guestCount: guests,
    serviceHours: QUOTE_DEFAULTS.hoursDefault,
    bartenders: Math.max(1, Math.ceil(guests / QUOTE_DEFAULTS.bartendersPerGuests)),
    bartenderRate: QUOTE_DEFAULTS.bartenderRate,
    travelFee: QUOTE_DEFAULTS.travelBase,

    /* Custom drink menu — Lake Salt's actual offering. Flat fee.
     * Off-menu requests are an optional per-drink upcharge. */
    customMenuFee: QUOTE_DEFAULTS.customMenuFeeDefault,
    offMenuEnabled: false,
    offMenuQty: 0,
    offMenuPrice: QUOTE_DEFAULTS.offMenuPerDrink,

    /* User-defined line items: [{ label, price }] */
    lineItems: [],

    peakApplied: peak.isPeak,
    peakReason: peak.reason,
    peakMultiplier: QUOTE_DEFAULTS.saturdayPeakMultiplier,
    discountType: 'pct',  // 'pct' | 'amt'
    discountValue: 0,
    depositPct: QUOTE_DEFAULTS.depositPct,

    /* Top-down override. When set, this becomes the quoted total and an
     * "Adjustment to target" line is implied in the breakdown. */
    totalOverride: null,

    notes: '',
    budgetRaw: budget.raw,
    budgetValid: budget.valid,
    budgetTarget: budget.valid ? budget.value : 0
  };
}

/* Parse the lead's stated budget. Returns { value, raw, valid } where valid
 * is true only if the parsed number is in a plausible event-bartending range
 * ($300–$50,000). This guards against guest-count strings like "150-300"
 * accidentally getting parsed as $150,300. */
function parseBudget(b) {
  const raw = b == null ? '' : String(b);
  if (!raw) return { value: 0, raw: '', valid: false };
  if (typeof b === 'number') {
    return { value: b, raw, valid: b >= 300 && b <= 50000 };
  }
  /* Detect dashes (guest-count style) — refuse to combine the two numbers. */
  if (/[-–—]/.test(raw)) return { value: 0, raw, valid: false };
  const digits = raw.replace(/[^0-9.]/g, '');
  const n = parseFloat(digits);
  if (isNaN(n)) return { value: 0, raw, valid: false };
  return { value: n, raw, valid: n >= 300 && n <= 50000 };
}

/* Pure calc — no DOM. Returns the full breakdown including a derived
 * "targetAdjustment" line when the user has set a top-down totalOverride. */
function calcQuote(q) {
  const bartenderTotal = (q.serviceHours || 0) * (q.bartenderRate || 0) * (q.bartenders || 0);
  const menuTotal = q.customMenuFee || 0;
  const offMenuTotal = q.offMenuEnabled ? (q.offMenuQty || 0) * (q.offMenuPrice || 0) : 0;
  const lineItemTotal = (q.lineItems || []).reduce((s, li) => s + (Number(li.price) || 0), 0);

  const subtotal = bartenderTotal + menuTotal + offMenuTotal + lineItemTotal + (q.travelFee || 0);
  const peakAdj = q.peakApplied ? subtotal * (q.peakMultiplier - 1) : 0;
  const beforeDiscount = subtotal + peakAdj;
  const discountAmt = q.discountType === 'pct'
    ? beforeDiscount * (q.discountValue / 100)
    : (q.discountValue || 0);
  const computedTotal = Math.max(0, beforeDiscount - discountAmt);

  /* Top-down: if user set an override, that's the real total. The difference
   * vs computed becomes a visible "Adjustment to target" line. */
  const hasOverride = q.totalOverride != null && !isNaN(q.totalOverride);
  const total = hasOverride ? Number(q.totalOverride) : computedTotal;
  const targetAdjustment = hasOverride ? total - computedTotal : 0;

  const deposit = total * ((q.depositPct || 0) / 100);

  /* Margin estimate: bartender labor + custom menu COGS + travel/line-items at ~40% cost. */
  const laborCost = (q.serviceHours || 0) * (QUOTE_DEFAULTS.bartenderCostHr || 0) * (q.bartenders || 0);
  const menuCost = (menuTotal + offMenuTotal) * (QUOTE_DEFAULTS.menuCostPctOfRevenue || 0.3);
  const travelCost = (q.travelFee || 0) * 0.4;
  const lineCost = lineItemTotal * 0.4;
  const costEstimate = laborCost + menuCost + travelCost + lineCost;
  const profit = total - costEstimate;
  const marginPct = total > 0 ? (profit / total) * 100 : 0;

  return {
    subtotal, peakAdj, beforeDiscount, discountAmt,
    computedTotal, total, hasOverride, targetAdjustment,
    deposit, costEstimate, profit, marginPct,
    breakdown: { bartenderTotal, menuTotal, offMenuTotal, lineItemTotal, travelFee: q.travelFee || 0 }
  };
}

/* Markdown-style quote text for copy/email. Margin NEVER included. */
function quoteText(q, calc) {
  const lineItemLines = (q.lineItems || [])
    .filter(li => (li.label || '').trim() || (li.price || 0) > 0)
    .map(li => `• ${li.label || 'Add-on'}: ${moneyFmt(li.price)}`);
  const lines = [
    `Lake Salt Bartending — Quote for ${q.leadName || 'your event'}`,
    `─────────────────────────────────────`,
    `Bartenders: ${q.bartenders} × ${q.serviceHours} hrs @ ${moneyFmt(q.bartenderRate)}/hr = ${moneyFmt(calc.breakdown.bartenderTotal)}`,
    `Custom drink menu (cocktails + mocktails): ${moneyFmt(calc.breakdown.menuTotal)}`,
    q.offMenuEnabled && calc.breakdown.offMenuTotal > 0
      ? `Off-menu requests: ${q.offMenuQty} × ${moneyFmt(q.offMenuPrice)} = ${moneyFmt(calc.breakdown.offMenuTotal)}`
      : null,
    `Travel: ${moneyFmt(q.travelFee)}`,
    ...lineItemLines,
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

/* Show the math behind the budget-vs-quote comparison. */
function showBudgetMath(q, calc) {
  const diff = q.budgetValid ? calc.total - q.budgetTarget : null;
  openModal('Budget comparison', `
    <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.6">
      <div style="display:flex;justify-content:space-between"><span class="text-muted">Lead's stated budget (raw value)</span><span style="font-family:ui-monospace,Menlo,monospace">"${escapeHtmlSafe(q.budgetRaw || '(blank)')}"</span></div>
      <div style="display:flex;justify-content:space-between"><span class="text-muted">Parsed as</span><span><strong>${q.budgetValid ? moneyFmt(q.budgetTarget) : 'unparseable — ignored'}</strong></span></div>
      ${!q.budgetValid ? `<div style="background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.3);padding:8px 10px;border-radius:8px;font-size:12px">
        The budget field on this lead doesn't look like a clean dollar amount in the $300–$50,000 range. Common cause: a guest-count string ("150–300") accidentally typed into the budget field. Fix it on the lead and re-open this quote, or ignore.
      </div>` : ''}
      <hr style="border:none;border-top:1px solid var(--border);margin:6px 0">
      <div style="display:flex;justify-content:space-between"><span class="text-muted">Quoted total</span><span><strong>${moneyFmt(calc.total)}</strong></span></div>
      ${q.budgetValid ? `
        <div style="display:flex;justify-content:space-between"><span class="text-muted">Difference (quote − budget)</span>
          <span style="font-weight:700;color:${diff <= 0 ? '#22c55e' : '#E05252'}">${diff > 0 ? '+' : ''}${moneyFmt(diff)}</span></div>
        <div style="font-size:12px;color:var(--text-muted)">
          ${diff <= 0 ? 'You are at or below their stated budget — room to upsell or hold firm.' : 'You are over their stated budget. Consider trimming line items, applying a discount, or asking what level of flex they have.'}
        </div>` : ''}
    </div>
  `, { wide: false });
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

    /* Budget badge — only shown when budget parsed cleanly into a sane range.
     * Click → modal with the math. */
    let budgetBadge = '';
    if (q.budgetValid && q.budgetTarget > 0) {
      const diff = calc.total - q.budgetTarget;
      let bg = 'rgba(34,197,94,0.15)', color = '#22c55e', label = `✓ Under budget by ${moneyFmt(-diff)}`;
      if (diff > 0 && diff / q.budgetTarget < 0.1) {
        bg = 'rgba(250,204,21,0.15)'; color = '#FACC15'; label = `⚠ ${moneyFmt(diff)} over budget`;
      } else if (diff > 0) {
        bg = 'rgba(224,82,82,0.15)'; color = '#E05252'; label = `${moneyFmt(diff)} over budget`;
      }
      budgetBadge = `<button type="button" id="qb-budget-info" class="badge" style="background:${bg};color:${color};border:none;cursor:pointer">${label} ⓘ</button>`;
    } else if (q.budgetRaw) {
      budgetBadge = `<button type="button" id="qb-budget-info" class="badge" style="background:rgba(100,116,139,0.15);color:var(--text-muted);border:none;cursor:pointer">Budget unclear ⓘ</button>`;
    }

    const marginColor = calc.marginPct >= 50 ? '#22c55e' : calc.marginPct >= 35 ? '#FACC15' : '#E05252';

    container.innerHTML = `
      <div class="qb-wrap" style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;flex-wrap:wrap">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--gold)">💰 Quote builder</div>
          ${budgetBadge}
        </div>

        <!-- BARTENDER + TRAVEL -->
        <div class="qb-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
          <label class="qb-field"><span>Service hours</span>
            <input type="number" min="0" step="0.5" id="qb-hours" value="${q.serviceHours}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Bartenders</span>
            <input type="number" min="0" id="qb-bartenders" value="${q.bartenders}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Rate ($/hr per bartender)</span>
            <input type="number" min="0" id="qb-rate" value="${q.bartenderRate}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Travel fee</span>
            <input type="number" min="0" id="qb-travel" value="${q.travelFee}" class="form-input qb-input"></label>
        </div>

        <!-- DRINK MENU (Lake Salt's real model: custom curated menu, flat fee) -->
        <div style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px">
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:8px">Custom drink menu</div>
          <label class="qb-field"><span>Menu fee (cocktails + mocktails, curated)</span>
            <input type="number" min="0" id="qb-menu" value="${q.customMenuFee}" class="form-input qb-input"></label>

          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-top:10px">
            <input type="checkbox" id="qb-offmenu" ${q.offMenuEnabled?'checked':''}>
            <span>Allow off-menu requests (generic drinks beyond the curated menu)</span>
          </label>
          ${q.offMenuEnabled ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:8px;padding-left:24px">
              <label class="qb-field"><span>Expected off-menu drinks</span>
                <input type="number" min="0" id="qb-offqty" value="${q.offMenuQty}" class="form-input qb-input"></label>
              <label class="qb-field"><span>Per drink ($)</span>
                <input type="number" min="0" id="qb-offprice" value="${q.offMenuPrice}" class="form-input qb-input"></label>
            </div>
            <div class="text-muted" style="font-size:11px;margin-top:4px;padding-left:24px">${moneyFmt((q.offMenuQty||0)*(q.offMenuPrice||0))} expected</div>
          `: ''}
        </div>

        <!-- USER-DEFINED LINE ITEMS -->
        <div style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted)">Additional items / add-ons</div>
            <button type="button" id="qb-add-line" class="btn btn-ghost btn-sm" style="padding:3px 10px;font-size:12px">+ Add line</button>
          </div>
          ${(q.lineItems || []).length === 0
            ? `<div class="text-muted" style="font-size:12px;padding:6px 0">No add-ons. Click "+ Add line" for things like tablecloths, glassware, smoke effects — anything you want to itemize.</div>`
            : (q.lineItems.map((li, i) => `
                <div style="display:grid;grid-template-columns:1fr 110px 32px;gap:8px;margin-bottom:6px;align-items:center">
                  <input type="text" data-li-idx="${i}" data-li-field="label" value="${escapeHtmlSafe(li.label || '')}" placeholder="Label (e.g. Smoke-show signature)" class="form-input qb-line-input" style="font-size:13px;padding:6px 8px">
                  <input type="number" min="0" data-li-idx="${i}" data-li-field="price" value="${li.price || 0}" placeholder="$" class="form-input qb-line-input" style="font-size:13px;padding:6px 8px">
                  <button type="button" data-li-rm="${i}" class="btn btn-ghost btn-sm" style="padding:4px;font-size:14px;color:#E05252">✕</button>
                </div>`).join(''))
          }
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
            <div class="text-muted">Computed total</div><div style="text-align:right;${calc.hasOverride?'text-decoration:line-through;opacity:.7':''}">${moneyFmt(calc.computedTotal)}</div>
            ${calc.hasOverride && calc.targetAdjustment !== 0 ? `<div class="text-muted">Adjustment to target</div><div style="text-align:right;color:${calc.targetAdjustment>0?'#FACC15':'#22c55e'}">${calc.targetAdjustment>0?'+':''}${moneyFmt(calc.targetAdjustment)}</div>`:''}
            <div style="font-weight:700;color:var(--text);font-size:18px;margin-top:4px">Quoted total</div>
            <div style="text-align:right;font-weight:700;color:var(--gold);font-size:22px">${moneyFmt(calc.total)}</div>
            <div class="text-muted" style="font-size:12px">Deposit (${q.depositPct}%)</div><div style="text-align:right;font-size:12px">${moneyFmt(calc.deposit)}</div>
          </div>

          <!-- TOP-DOWN OVERRIDE -->
          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap">
              <input type="checkbox" id="qb-override-on" ${calc.hasOverride?'checked':''}>
              <span>Set my own total — I know the number, fit the line items to it</span>
              ${calc.hasOverride?`<input type="number" min="0" id="qb-override-val" value="${q.totalOverride}" class="form-input" style="flex:0 0 120px;padding:4px 8px;font-size:13px">`:''}
            </label>
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
          <button class="btn btn-primary btn-sm" id="qb-lock">🔒 Lock in price</button>
          <button class="btn btn-primary btn-sm" id="qb-send" style="background:#22c55e;border-color:#22c55e">📤 Send proposal</button>
          <button class="btn btn-ghost btn-sm" id="qb-copy">📋 Copy text</button>
        </div>
        <div class="text-muted" style="font-size:11px;margin-top:6px;line-height:1.5">
          <strong>Lock</strong> = final number (no stage change). <strong>Send</strong> = deliver to the client and move the lead to <em>Proposal Sent</em>.
        </div>
        <div id="qb-history" style="margin-top:14px"></div>
      </div>
    `;

    /* Wire inputs */
    container.querySelectorAll('.qb-input').forEach(el => {
      el.addEventListener('input', () => sync());
      el.addEventListener('change', () => sync());
    });
    container.querySelector('#qb-offmenu')?.addEventListener('change', (e) => {
      state.q.offMenuEnabled = e.target.checked; render();
    });
    container.querySelector('#qb-peak')?.addEventListener('change', (e) => { state.q.peakApplied = e.target.checked; render(); });
    container.querySelector('#qb-disctype')?.addEventListener('change', (e) => { state.q.discountType = e.target.value; render(); });
    container.querySelector('#qb-discval')?.addEventListener('input', (e) => { state.q.discountValue = parseFloat(e.target.value) || 0; render(); });
    container.querySelectorAll('.qb-preset').forEach(b => {
      b.addEventListener('click', () => {
        state.q.discountType = 'pct';
        state.q.discountValue = parseFloat(b.dataset.pct);
        render();
      });
    });
    container.querySelector('#qb-add-line')?.addEventListener('click', () => {
      state.q.lineItems.push({ label: '', price: 0 });
      render();
    });
    container.querySelectorAll('.qb-line-input').forEach(el => {
      el.addEventListener('input', () => {
        const i = +el.dataset.liIdx;
        const f = el.dataset.liField;
        if (f === 'price') state.q.lineItems[i].price = parseFloat(el.value) || 0;
        else state.q.lineItems[i].label = el.value;
        /* don't re-render on every keystroke for label — re-render only for price totals */
        if (f === 'price') render();
      });
      el.addEventListener('blur', () => render());
    });
    container.querySelectorAll('[data-li-rm]').forEach(b => {
      b.addEventListener('click', () => {
        state.q.lineItems.splice(+b.dataset.liRm, 1);
        render();
      });
    });
    container.querySelector('#qb-override-on')?.addEventListener('change', (e) => {
      if (e.target.checked) {
        const c = calcQuote(state.q);
        state.q.totalOverride = Math.round(c.computedTotal);
      } else {
        state.q.totalOverride = null;
      }
      render();
    });
    container.querySelector('#qb-override-val')?.addEventListener('input', (e) => {
      state.q.totalOverride = parseFloat(e.target.value) || 0;
      render();
    });
    container.querySelector('#qb-budget-info')?.addEventListener('click', () => showBudgetMath(state.q, calc));
    container.querySelector('#qb-notes')?.addEventListener('input', (e) => { state.q.notes = e.target.value; });

    container.querySelector('#qb-save')?.addEventListener('click', () => saveQuote('draft'));
    container.querySelector('#qb-lock')?.addEventListener('click', () => saveQuote('locked'));
    container.querySelector('#qb-send')?.addEventListener('click', () => openSendProposalMenu(calc));
    container.querySelector('#qb-copy')?.addEventListener('click', () => copyToClipboard(quoteText(state.q, calc)));

    loadHistory();
  }

  function sync() {
    const q = state.q;
    q.serviceHours    = parseFloat(document.getElementById('qb-hours').value) || 0;
    q.bartenders      = parseInt(document.getElementById('qb-bartenders').value, 10) || 0;
    q.bartenderRate   = parseFloat(document.getElementById('qb-rate').value) || 0;
    q.travelFee       = parseFloat(document.getElementById('qb-travel').value) || 0;
    q.customMenuFee   = parseFloat(document.getElementById('qb-menu').value) || 0;
    if (q.offMenuEnabled) {
      q.offMenuQty   = parseInt(document.getElementById('qb-offqty')?.value, 10) || 0;
      q.offMenuPrice = parseFloat(document.getElementById('qb-offprice')?.value) || 0;
    }
    render();
  }

  /* Save a quote at the given status. Lock does NOT change the lead stage —
   * only Send does. Status values: 'draft' | 'locked' | 'sent'. */
  async function saveQuote(status, sendMeta = null) {
    const calc = calcQuote(state.q);
    if ((status === 'locked' || status === 'sent') && !state.q.leadId) {
      alert('Link a lead before locking or sending the quote.');
      return null;
    }
    const payload = {
      leadId: state.q.leadId,
      leadName: state.q.leadName,
      lineItems: {
        serviceHours: state.q.serviceHours,
        bartenders: state.q.bartenders,
        bartenderRate: state.q.bartenderRate,
        travelFee: state.q.travelFee,
        customMenuFee: state.q.customMenuFee,
        offMenuEnabled: state.q.offMenuEnabled,
        offMenuQty: state.q.offMenuQty,
        offMenuPrice: state.q.offMenuPrice,
        guestCount: state.q.guestCount,
        custom: [...(state.q.lineItems || [])]
      },
      totalOverride: state.q.totalOverride,
      computedTotal: calc.computedTotal,
      targetAdjustment: calc.targetAdjustment,
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
    if (status === 'sent') {
      payload.lockedAt = TS();
      payload.sentAt = TS();
      payload.sentBy = currentUser?.displayName || currentUser?.email || 'Admin';
      if (sendMeta) payload.sentVia = sendMeta;
    }

    try {
      const ref = await db.collection('quotes').add(payload);
      const action = status === 'sent' ? 'quote_sent' : status === 'locked' ? 'quote_locked' : 'quote_saved';
      const verb = status === 'sent' ? 'Sent' : status === 'locked' ? 'Locked' : 'Saved';
      logActivity(action, 'quotes', ref.id,
        `${verb} quote for ${state.q.leadName || 'lead'} — ${moneyFmt(calc.total)}${sendMeta ? ' via ' + sendMeta : ''}`,
        { total: calc.total, leadId: state.q.leadId });

      /* Mirror summary on the lead. Only Send moves the stage. */
      if (state.q.leadId) {
        const update = {
          latestQuoteId: ref.id,
          latestQuoteTotal: calc.total,
          latestQuoteStatus: status,
          updatedAt: TS()
        };
        if (status === 'sent') update.stage = 'Proposal Sent';
        await db.collection('leads').doc(state.q.leadId).update(update);
      }
      const toast = status === 'sent' ? '📤 Marked as sent — stage moved to Proposal Sent'
                  : status === 'locked' ? '🔒 Price locked'
                  : 'Draft saved';
      showToast(toast);
      loadHistory();
      return ref.id;
    } catch (err) {
      console.error('Save quote failed:', err);
      alert('Could not save quote — see console.');
      return null;
    }
  }

  /* Send-proposal chooser. Currently no automated send — picks a delivery
   * method, opens it, and marks the quote sent in Firestore. */
  function openSendProposalMenu(calc) {
    if (!state.q.leadId) { alert('Link a lead before sending.'); return; }
    const email = options.leadEmail || '';
    const phone = (lead?.phone || '').replace(/\D/g, '');
    const text = quoteText(state.q, calc);
    const subject = `Lake Salt — Quote for your event`;

    openModal('Send proposal', `
      <p class="text-muted" style="font-size:13px;line-height:1.5;margin-bottom:14px">
        Choose how you're delivering the quote. The system currently <strong>does not</strong> auto-send —
        it opens your mail/SMS app or copies the text. Once you've actually sent it, the quote is logged as
        <em>sent</em>, your lead moves to <em>Proposal Sent</em>, and an activity entry is recorded.
      </p>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary" id="sp-email" ${email?'':'disabled'} style="text-align:left;padding:12px 14px">
          ✉ Open email draft ${email?`<span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">→ ${email}</span>`:'<span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">(no email on lead)</span>'}
        </button>
        <button class="btn btn-secondary" id="sp-sms" ${phone?'':'disabled'} style="text-align:left;padding:12px 14px">
          💬 Open SMS draft ${phone?`<span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">→ ${phone}</span>`:'<span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">(no phone on lead)</span>'}
        </button>
        <button class="btn btn-ghost" id="sp-cowork" style="text-align:left;padding:12px 14px">
          🤖 Copy a Cowork prompt <span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">(paste into the comms agent to draft + send)</span>
        </button>
        <button class="btn btn-ghost" id="sp-copy" style="text-align:left;padding:12px 14px">
          📋 Just copy the quote text <span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">(I'll deliver it manually)</span>
        </button>
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted);line-height:1.5">
        After any of these, click <strong>Mark as sent</strong> below. Nothing is recorded until you confirm.
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn btn-primary" id="sp-confirm" style="background:#22c55e;border-color:#22c55e;flex:1">✓ Mark as sent</button>
        <button class="btn btn-ghost" id="sp-cancel">Cancel</button>
      </div>
    `, { wide: false });

    let chosenMethod = null;
    document.getElementById('sp-email').addEventListener('click', () => {
      chosenMethod = 'email';
      const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + '\n\nLooking forward to bartending your event!\n— Kendell · Lake Salt')}`;
      window.location.href = url;
    });
    document.getElementById('sp-sms').addEventListener('click', () => {
      chosenMethod = 'sms';
      window.location.href = `sms:${phone}?&body=${encodeURIComponent(text)}`;
    });
    document.getElementById('sp-cowork').addEventListener('click', () => {
      chosenMethod = 'cowork';
      const prompt = `Send the following quote to ${state.q.leadName} at ${email || phone || '[no contact info]'} via email. Use a warm, professional tone — Kendell's voice. Sign as "Kendell · Lake Salt Bartending". Quote text below:\n\n${text}`;
      copyToClipboard(prompt);
      showToast('Cowork prompt copied — paste it into the lake-salt-comms agent');
    });
    document.getElementById('sp-copy').addEventListener('click', () => {
      chosenMethod = 'copy';
      copyToClipboard(text);
    });
    document.getElementById('sp-cancel').addEventListener('click', () => { if (typeof closeModal==='function') closeModal(); });
    document.getElementById('sp-confirm').addEventListener('click', async () => {
      if (!chosenMethod) {
        if (!confirm('You haven\'t picked a delivery method yet — mark sent anyway?')) return;
        chosenMethod = 'manual';
      }
      await saveQuote('sent', chosenMethod);
      if (typeof closeModal === 'function') closeModal();
    });
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
        <button class="btn btn-ghost" id="quotes-merge" style="display:none">⚠ Review possible duplicates</button>
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

  const newBtn = document.getElementById('quotes-new');
  const mergeBtn = document.getElementById('quotes-merge');
  newBtn.addEventListener('click', openNewQuoteModal);
  mergeBtn.addEventListener('click', openMergeDuplicatesModal);

  /* Show the merge button only if there are low-confidence groups (name+date
   * matches) that need human eyes. High-confidence groups were auto-merged
   * silently at admin load — but we re-run scan here too in case new dupes
   * came in since auth. */
  scanForDuplicateLeads().then(groups => {
    const needsReview = groups.filter(g => g.confidence === 'name_date');
    if (needsReview.length) {
      mergeBtn.style.display = '';
      mergeBtn.textContent = `⚠ Review ${needsReview.length} possible duplicate${needsReview.length===1?'':'s'}`;
    }
  }).catch(e => console.warn('Dedup scan failed:', e));

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

  /* Search — substring match first, then fuzzy (Levenshtein ≤ 2 per word).
   * "kenzie" finds "Kinzie", "estman" finds "Eastman", etc. */
  const search = document.getElementById('nq-search');
  const results = document.getElementById('nq-results');
  let searchTimeout;
  search.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const term = search.value.toLowerCase().trim();
    if (!term) { results.innerHTML = ''; return; }
    searchTimeout = setTimeout(async () => {
      try {
        const snap = await db.collection('leads').limit(500).get();
        const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const scored = leads.map(l => ({ l, m: scoreLeadMatch(l, term) }))
          .filter(x => x.m !== null)
          .sort((a, b) => a.m - b.m)
          .slice(0, 8)
          .map(x => x.l);
        results.innerHTML = scored.length
          ? scored.map(l => `<div style="padding:8px 10px;border-bottom:1px solid var(--border);cursor:pointer" onclick="closeModal();setTimeout(()=>openLeadModal('${l.id}'),50)">
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

/* ─── Scanner ─── Returns { groups, byKeyType } where byKeyType classifies
 * each group as 'email', 'phone', or 'name_date' based on the strongest
 * match key that put its leads together. High-confidence (email/phone)
 * groups can be auto-merged. */
async function scanForDuplicateLeads() {
  const snap = await db.collection('leads').get();
  const leads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const norm = (s) => String(s || '').trim().toLowerCase();
  const digits = (s) => String(s || '').replace(/\D/g, '');

  const keysForLead = (l) => {
    const out = [];
    const e = norm(l.email);
    const p = digits(l.phone);
    const nd = norm(l.name) && norm(l.eventDate) ? `nd:${norm(l.name)}|${norm(l.eventDate)}` : '';
    if (e) out.push({ kind: 'email', key: `e:${e}` });
    if (p.length >= 7) out.push({ kind: 'phone', key: `p:${p}` });
    if (nd) out.push({ kind: 'name_date', key: nd });
    return out;
  };

  const parent = new Map(); leads.forEach(l => parent.set(l.id, l.id));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  /* For each group root, track which key-kinds connected it. */
  const groupKinds = new Map();
  const keyToLead = new Map();
  for (const l of leads) {
    for (const { kind, key } of keysForLead(l)) {
      if (keyToLead.has(key)) union(l.id, keyToLead.get(key));
      else keyToLead.set(key, l.id);
    }
  }
  for (const l of leads) {
    for (const { kind } of keysForLead(l)) {
      const root = find(l.id);
      if (!groupKinds.has(root)) groupKinds.set(root, new Set());
      groupKinds.get(root).add(kind);
    }
  }

  const groupsMap = new Map();
  for (const l of leads) {
    const root = find(l.id);
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root).push(l);
  }

  const groups = [];
  for (const [root, members] of groupsMap.entries()) {
    if (members.length < 2) continue;
    const kinds = groupKinds.get(root) || new Set();
    /* Confidence: email > phone > name_date. */
    const confidence = kinds.has('email') ? 'email'
                     : kinds.has('phone') ? 'phone'
                     : 'name_date';
    groups.push({ members, confidence });
  }
  return groups;
}

/* Auto-merge any email/phone groups silently. Returns count merged. */
async function autoMergeHighConfidence() {
  let groups;
  try { groups = await scanForDuplicateLeads(); }
  catch (e) { console.warn('Auto-merge scan failed:', e); return 0; }
  const safe = groups.filter(g => g.confidence === 'email' || g.confidence === 'phone');
  if (!safe.length) return 0;
  let merged = 0;
  for (const g of safe) {
    const sorted = [...g.members].sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    const keep = sorted[0];
    const drop = sorted.slice(1).map(d => d.id);
    try {
      await mergeLeads(keep.id, drop);
      merged += drop.length;
    } catch (e) {
      console.warn('Auto-merge failed for group:', keep.id, e);
    }
  }
  return merged;
}
window.autoMergeHighConfidence = autoMergeHighConfidence;

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
  let groups;
  try { groups = await scanForDuplicateLeads(); }
  catch (e) { body.innerHTML = `<div style="color:#E05252">Failed to load leads: ${e.message}</div>`; return; }

  /* Only show low-confidence groups here. High-confidence (email/phone)
   * groups are handled silently by autoMergeHighConfidence(). */
  const reviewGroups = groups.filter(g => g.confidence === 'name_date');

  if (!reviewGroups.length) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:#22c55e">✓ No duplicates need review.</div>`;
    return;
  }

  body.innerHTML = `
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px;line-height:1.5">
      Found <strong>${reviewGroups.length}</strong> possible duplicate group${reviewGroups.length===1?'':'s'} that need your eyes — these matched on <em>same name + same event date</em> only (no shared email or phone), so I won't auto-merge. Review each one and merge if it's really the same person.
    </p>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${reviewGroups.map(({ members: g }, i) => {
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

/* Merge dropIds into keepId without destroying information.
 *   • Every dropped lead's full pre-merge data is preserved as a snapshot
 *     on the keeper under mergeHistory[].
 *   • An auto-generated note is added to the keeper's notes thread for
 *     each merged lead, describing what was folded in (submission date,
 *     source, any unique field values, original message).
 *   • Notes and tasks arrays are concatenated.
 *   • Blank fields on the keeper are backfilled. Conflicting field values
 *     are NOT overwritten — they're recorded in mergeHistory so nothing
 *     is silently lost.
 *   • Related quotes + call_bookings are reassigned to the keeper.
 *   • The dropped lead doc is then deleted.
 */
async function mergeLeads(keepId, dropIds) {
  const keepRef = db.collection('leads').doc(keepId);
  const keepDoc = await keepRef.get();
  if (!keepDoc.exists) throw new Error('Keep lead does not exist');
  let keep = { ...keepDoc.data() };
  const mergedNotes = Array.isArray(keep.notes) ? [...keep.notes] : [];
  const mergedTasks = Array.isArray(keep.tasks) ? [...keep.tasks] : [];
  const mergeHistory = Array.isArray(keep.mergeHistory) ? [...keep.mergeHistory] : [];

  const trackedFields = ['name','email','phone','venue','eventType','eventDate','guestCount','budget','message','source','priority','followUpDate','hasBuiltInBar','drinks','drinkDetail','eventStartTime','eventEndTime'];

  for (const dropId of dropIds) {
    const dropDoc = await db.collection('leads').doc(dropId).get();
    if (!dropDoc.exists) continue;
    const d = dropDoc.data();
    const fullSnapshot = { id: dropId, ...d };

    /* Find which fields differ between keep and drop */
    const conflicts = {};
    const backfilled = {};
    for (const k of trackedFields) {
      const kv = keep[k];
      const dv = d[k];
      if (!kv && dv) {
        keep[k] = dv;
        backfilled[k] = dv;
      } else if (kv && dv && String(kv).trim() !== String(dv).trim()) {
        conflicts[k] = { kept: kv, dropped: dv };
      }
    }

    /* Build a human-readable auto-note */
    const submittedAt = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}) : 'unknown date';
    const noteLines = [
      `📎 Merged from a duplicate submission`,
      `Submitted: ${submittedAt}`,
      d.source ? `Source: ${d.source}` : null,
      d.message ? `Original message: ${d.message}` : null,
      Object.keys(backfilled).length ? `Filled blank fields: ${Object.keys(backfilled).join(', ')}` : null,
      Object.keys(conflicts).length ? `Conflicts (kept current values, full snapshot preserved):\n  ${Object.entries(conflicts).map(([k,v]) => `${k}: kept "${v.kept}" — also seen "${v.dropped}"`).join('\n  ')}` : null
    ].filter(Boolean);
    mergedNotes.push({
      text: noteLines.join('\n'),
      author: currentUser?.displayName || 'Admin',
      time: new Date().toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }),
      kind: 'merge'
    });

    /* Fold in notes + tasks */
    if (Array.isArray(d.notes)) mergedNotes.push(...d.notes);
    if (Array.isArray(d.tasks)) mergedTasks.push(...d.tasks);

    /* Add full snapshot to mergeHistory so the data is recoverable */
    mergeHistory.push({
      mergedAt: new Date().toISOString(),
      mergedBy: currentUser?.displayName || currentUser?.email || 'Admin',
      sourceLeadId: dropId,
      conflicts,
      backfilled,
      snapshot: fullSnapshot
    });

    /* Reassign related docs */
    const [quotes, bookings] = await Promise.all([
      db.collection('quotes').where('leadId','==',dropId).get(),
      db.collection('call_bookings').where('leadId','==',dropId).get()
    ]);
    const batch = db.batch();
    quotes.forEach(q => batch.update(q.ref, { leadId: keepId, leadName: keep.name || d.name || '' }));
    bookings.forEach(b => batch.update(b.ref, { leadId: keepId, name: keep.name || d.name || '' }));
    if (!quotes.empty || !bookings.empty) await batch.commit();

    /* Delete the dropped lead */
    await db.collection('leads').doc(dropId).delete();
    logActivity('merge', 'leads', dropId, `Merged into ${keep.name || keepId} (submitted ${submittedAt})`, {
      mergedInto: keepId,
      conflicts: Object.keys(conflicts),
      backfilled: Object.keys(backfilled)
    });
  }

  /* Save the consolidated keep doc */
  await keepRef.update({
    ...Object.fromEntries(trackedFields.map(k => [k, keep[k] || ''])),
    notes: mergedNotes,
    tasks: mergedTasks,
    mergeHistory,
    updatedAt: TS()
  });
}

window.openMergeDuplicatesModal = openMergeDuplicatesModal;

window.openNewQuoteModal = openNewQuoteModal;

/* ─── Fuzzy lead matching ─── Returns a numeric score (lower = better) or
 * null for no match. Tries cheap checks first (substring on the combined
 * name/email/phone haystack), then per-word Levenshtein on the name. */
function scoreLeadMatch(lead, term) {
  if (!term) return null;
  const t = term.toLowerCase();
  const name  = String(lead.name  || '').toLowerCase();
  const email = String(lead.email || '').toLowerCase();
  const phone = String(lead.phone || '').replace(/\D/g, '');
  const tdig  = t.replace(/\D/g, '');

  /* Cheap exact / substring matches */
  if (name === t || email === t) return 0;
  if (name.startsWith(t) || email.startsWith(t)) return 1;
  if (name.includes(t)) return 2;
  if (email.includes(t)) return 3;
  if (tdig.length >= 4 && phone.includes(tdig)) return 4;

  /* Fuzzy: each search word must approximately match some word in the name */
  const termWords = t.split(/\s+/).filter(Boolean);
  const nameWords = name.split(/\s+/).filter(Boolean);
  if (!nameWords.length) return null;

  let totalDist = 0;
  for (const tw of termWords) {
    let best = Infinity;
    for (const nw of nameWords) {
      if (nw.startsWith(tw)) { best = 0; break; }
      const lenDiff = Math.abs(nw.length - tw.length);
      if (lenDiff > 2) continue;
      const d = levenshteinCapped(nw, tw, 2);
      if (d < best) best = d;
    }
    if (best === Infinity || best > 2) return null;
    totalDist += best;
  }
  /* Offset so fuzzy hits sort below exact hits */
  return 10 + totalDist;
}

/* Levenshtein distance with an early-exit cap. Returns Infinity if the true
 * distance exceeds `cap`. Adequate for short names (under ~20 chars). */
function levenshteinCapped(a, b, cap) {
  const m = a.length, n = b.length;
  if (!m) return n <= cap ? n : Infinity;
  if (!n) return m <= cap ? m : Infinity;
  if (Math.abs(m - n) > cap) return Infinity;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return Infinity;
    [prev, curr] = [curr, prev];
  }
  return prev[n] <= cap ? prev[n] : Infinity;
}

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
      <p class="text-muted" style="font-size:13px;margin-bottom:14px;line-height:1.5">Pricing used as starting values when a new quote is created. Saves to Firestore so your phone and laptop share the same numbers. You always edit per-quote on top of these.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="qb-field"><span>Bartender rate ($/hr, charged)</span><input type="number" id="qs-rate" value="${D.bartenderRate}" class="form-input"></label>
        <label class="qb-field"><span>Bartender cost ($/hr, you pay)</span><input type="number" id="qs-cost" value="${D.bartenderCostHr}" class="form-input"></label>
        <label class="qb-field"><span>Travel base ($)</span><input type="number" id="qs-travel" value="${D.travelBase}" class="form-input"></label>
        <label class="qb-field"><span>Default service hours</span><input type="number" id="qs-hours" value="${D.hoursDefault}" class="form-input"></label>
        <label class="qb-field"><span>1 bartender per N guests</span><input type="number" id="qs-bpg" value="${D.bartendersPerGuests}" class="form-input"></label>
        <label class="qb-field"><span>Deposit %</span><input type="number" id="qs-dep" value="${D.depositPct}" class="form-input"></label>
        <label class="qb-field"><span>Peak multiplier (e.g. 1.15)</span><input type="number" step="0.05" id="qs-peak" value="${D.saturdayPeakMultiplier}" class="form-input"></label>
        <label class="qb-field"><span>Quote expires after (days)</span><input type="number" id="qs-exp" value="${D.quoteExpiryDays}" class="form-input"></label>
        <label class="qb-field"><span>Custom drink menu — default fee ($)</span><input type="number" id="qs-menu" value="${D.customMenuFeeDefault}" class="form-input"></label>
        <label class="qb-field"><span>Off-menu request — default $/drink</span><input type="number" id="qs-off" value="${D.offMenuPerDrink}" class="form-input"></label>
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
      customMenuFeeDefault: +document.getElementById('qs-menu').value,
      offMenuPerDrink: +document.getElementById('qs-off').value
    };
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
