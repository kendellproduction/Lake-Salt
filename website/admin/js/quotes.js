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

/* ─────────────────────────────────────────────────────────────────────────
 * PRICING MODEL — cost-plus-margin (Kendell's real model, 2026-06-18)
 *
 *   Cost Basis = (# bartenders × flat pay each) + supplies + travel
 *   Quote      = Cost Basis ÷ (1 − target margin)
 *
 * Profit = Quote − Cost Basis. The margin slider drives it, with two guards:
 *   • PROFIT CAP (weddings/private): once %-based profit would exceed
 *     profitCapTrigger ($1,000), stop scaling and cap profit at a flat
 *     profitCapValue ($1,100 — $100 buffer over a clean $1,000). This is an
 *     anti-overcharge ceiling for normal-size events; raise it for much
 *     larger events.
 *   • PROFIT FLOOR (Adobe/corporate): never make LESS than profitFloorCorp
 *     ($1,000) on a corporate event — and the cap does NOT apply to them.
 *   • MARGIN FLOOR: never quote below marginFloorPct (35%); 40% is the normal target.
 *
 * Bartender pay is a FLAT per-event amount Kendell sets (not hourly). Tips
 * are kept by staff and are NOT part of this calc.
 * ───────────────────────────────────────────────────────────────────────── */
const DEFAULT_QUOTE_DEFAULTS = {
  /* Labor: flat pay PER BARTENDER for the event (Kendell's cost, not hourly) */
  bartenderPayDefault: 200,   // typical flat pay per bartender; adjust $150-$300 by event complexity
  bartendersPerGuests: 60,    // 1 bartender per N guests (cocktail service)

  /* Event costs */
  suppliesDefault: 150,       // cups, ice, garnishes, mixers; adjust by guests/hours/menu
  travelBase: 0,              // travel/gas for out-of-area; built into cost

  hoursDefault: 5,

  /* Margin targets by event type (what % of the quote is profit) */
  marginLargePct: 40,         // weddings/events — 35% is the controlled floor during close-out testing
  marginSmallPct: 40,         // small private events
  marginCorpPct: 65,          // Adobe / corporate repeat
  marginFloorPct: 35,         // temporary floor while Lake Salt builds closing momentum

  /* Profit cap (anti-overcharge ceiling for weddings/private) */
  profitCapTrigger: 1000,     // once %-based profit would exceed this…
  profitCapValue: 1100,       // …cap profit flat here ($100 buffer)

  /* Profit floor for corporate (Adobe can afford it; cap doesn't apply) */
  profitFloorCorp: 1000,

  depositPct: 10,             // 10% deposit holds the date (per Kendell)
  discountPresets: [
    { label: 'Returning client', pct: 5 },
    { label: 'Military / first-responder', pct: 10 },
    { label: 'Match competitor', pct: 8 }
  ],
  quoteExpiryDays: 14
};

/* Versioned deterministic pricing. Accepted legacy quotes never flow through
 * this table unless they explicitly opt in with pricingModelVersion. */
const DETERMINISTIC_PRICING_VERSION = '2026.08';
const DETERMINISTIC_PRICING = Object.freeze({
  baseBartenderPay: 200,          // includes up to four service hours
  extraBartenderHour: 35,
  setupLaborPerBartender: 25,
  cupCostPerGuest: 0.35,          // disposable cups are always included
  baseConsumablesPerGuest: 0.70,  // ice, napkins and standard expendables
  alcoholicServicePerGuest: 0.65, // mixers/garnishes for alcoholic service
  mocktailServicePerGuest: 1.10,
  waterStationPerGuest: 0.35,
  cocktailCostPerGuest: 0.30,
  complexCocktailCostPerGuest: 0.20,
  mobileBarCost: 125,
  equipmentBase: 40,
  travelByArea: Object.freeze({
    local: 0,
    nearby: 35,
    extended: 85,
    park_city: 125
  }),
  minimums: Object.freeze({ private: 450, wedding: 800, corporate: 1200 }),
  targetMargins: Object.freeze({ private: 40, wedding: 40, corporate: 55 }),
  depositPct: 10
});

function boolValue(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (['yes', 'true', 'included', '1'].includes(normalized)) return true;
  if (['no', 'false', 'none', '0'].includes(normalized)) return false;
  return null;
}

function deterministicTravelArea(venue, explicitArea) {
  if (explicitArea && DETERMINISTIC_PRICING.travelByArea[explicitArea] != null) return explicitArea;
  const text = String(venue || '').toLowerCase();
  if (/park city|heber|midway|kamas/.test(text)) return 'park_city';
  if (/salt lake|draper|lehi|highland|american fork|pleasant grove|orem|provo|spanish fork|springville/.test(text)) return 'local';
  return text.trim() ? 'nearby' : null;
}

function inferServiceFlags(input = {}) {
  const drinks = parseLeadListValue(input.drinks).join(' ').toLowerCase();
  return {
    alcoholicService: boolValue(input.alcoholicService) ?? (/cocktail|beer|wine|champagne|alcohol|whiskey|vodka|gin|rum|tequila/.test(drinks) ? true : null),
    mocktailService: boolValue(input.mocktailService) ?? (/mocktail|zero-proof|nonalcoholic|non-alcoholic/.test(drinks) ? true : null),
    waterStation: boolValue(input.waterStation)
  };
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateDeterministicScope(input = {}) {
  const flags = inferServiceFlags(input);
  const values = {
    totalGuests: finiteNumberOrNull(input.guestCount ?? input.totalGuestCount),
    beverageGuests: finiteNumberOrNull(input.beverageGuestCount),
    serviceHours: finiteNumberOrNull(input.serviceHours),
    cocktailCount: finiteNumberOrNull(input.cocktailCount),
    bartenders: finiteNumberOrNull(input.bartenders),
    gratuityPct: finiteNumberOrNull(input.gratuityPct) ?? 0
  };
  const missing = [];
  const invalid = [];
  if (values.totalGuests == null) missing.push('totalGuestCount');
  else if (values.totalGuests < 1 || values.totalGuests > 2000 || !Number.isInteger(values.totalGuests)) invalid.push('totalGuestCount');
  if (values.beverageGuests == null) missing.push('beverageGuestCount');
  else if (values.beverageGuests < 1 || values.beverageGuests > 2000 || !Number.isInteger(values.beverageGuests)) invalid.push('beverageGuestCount');
  if (values.totalGuests != null && values.beverageGuests != null && values.beverageGuests > values.totalGuests) invalid.push('beverageGuestCountExceedsTotal');
  if (values.serviceHours == null) missing.push('serviceHours');
  else if (values.serviceHours < 0.5 || values.serviceHours > 24) invalid.push('serviceHours');
  if (values.bartenders != null && (values.bartenders < 1 || values.bartenders > 30 || !Number.isInteger(values.bartenders))) invalid.push('bartenders');
  if (values.gratuityPct < 0 || values.gratuityPct > 30) invalid.push('gratuityPct');
  if (!String(input.eventType || '').trim()) missing.push('eventType');
  if (!String(input.venue || '').trim()) missing.push('venueOrCity');
  if (flags.alcoholicService == null) missing.push('alcoholicService');
  if (flags.mocktailService == null) missing.push('mocktailService');
  if (flags.waterStation == null) missing.push('waterStation');
  if (flags.alcoholicService && values.cocktailCount == null) missing.push('cocktailCount');
  if (values.cocktailCount != null && (values.cocktailCount < 0 || values.cocktailCount > 10 || !Number.isInteger(values.cocktailCount))) invalid.push('cocktailCount');
  const complexity = String(input.cocktailComplexity || '').toLowerCase();
  if (flags.alcoholicService && values.cocktailCount > 0 && !['simple', 'standard', 'complex'].includes(complexity)) missing.push('cocktailComplexity');
  const hasBuiltInBar = boolValue(input.hasBuiltInBar);
  if (hasBuiltInBar == null) missing.push('hasBuiltInBar');
  const travelArea = deterministicTravelArea(input.venue, input.travelArea);
  if (!travelArea) missing.push('travelArea');
  return { flags, values, complexity, hasBuiltInBar, travelArea, missing, invalid, canSend: missing.length === 0 && invalid.length === 0 };
}

/* Pure, deterministic pricing engine. It intentionally returns missingScope
 * instead of guessing whether every guest drinks alcohol, mocktails or water. */
function buildDeterministicPricing(input = {}) {
  const profile = pricingProfileForEventType(input.eventType);
  const validation = validateDeterministicScope(input);
  const { flags, complexity, hasBuiltInBar, travelArea } = validation;
  const totalGuests = validation.values.totalGuests || 0;
  const beverageGuests = validation.values.beverageGuests || 0;
  const serviceHours = validation.values.serviceHours || 0;
  const cocktailCount = validation.values.cocktailCount;
  const gratuityPct = validation.values.gratuityPct;

  const guestDivisor = flags.alcoholicService && cocktailCount > 0
    ? (complexity === 'complex' || cocktailCount >= 3 ? 50 : 60)
    : 75;
  const suggestedBartenders = totalGuests ? Math.max(1, Math.ceil(beverageGuests / guestDivisor)) : 0;
  const bartenders = validation.values.bartenders == null ? suggestedBartenders : validation.values.bartenders;
  const extraHours = Math.max(0, serviceHours - 4);
  const labor = bartenders * (DETERMINISTIC_PRICING.baseBartenderPay + DETERMINISTIC_PRICING.setupLaborPerBartender + extraHours * DETERMINISTIC_PRICING.extraBartenderHour);
  const disposableCups = beverageGuests * DETERMINISTIC_PRICING.cupCostPerGuest;
  const baseConsumables = beverageGuests * DETERMINISTIC_PRICING.baseConsumablesPerGuest;
  const alcoholicService = flags.alcoholicService ? beverageGuests * DETERMINISTIC_PRICING.alcoholicServicePerGuest : 0;
  const mocktailService = flags.mocktailService ? beverageGuests * DETERMINISTIC_PRICING.mocktailServicePerGuest : 0;
  const waterStation = flags.waterStation ? totalGuests * DETERMINISTIC_PRICING.waterStationPerGuest : 0;
  const cocktails = flags.alcoholicService && cocktailCount > 0 ? beverageGuests * cocktailCount * DETERMINISTIC_PRICING.cocktailCostPerGuest : 0;
  const complexityCost = complexity === 'complex' ? beverageGuests * cocktailCount * DETERMINISTIC_PRICING.complexCocktailCostPerGuest : 0;
  const equipment = DETERMINISTIC_PRICING.equipmentBase + (hasBuiltInBar === false ? DETERMINISTIC_PRICING.mobileBarCost : 0);
  const travel = travelArea ? DETERMINISTIC_PRICING.travelByArea[travelArea] : 0;
  const operatingCost = labor + disposableCups + baseConsumables + alcoholicService + mocktailService + waterStation + cocktails + complexityCost + equipment + travel;
  const targetMarginPct = Number(input.marginPct) || DETERMINISTIC_PRICING.targetMargins[profile.kind];
  const marginPrice = operatingCost / (1 - targetMarginPct / 100);
  const minimum = DETERMINISTIC_PRICING.minimums[profile.kind];
  const servicePrice = Math.ceil(Math.max(minimum, marginPrice) / 5) * 5;
  const gratuity = servicePrice * gratuityPct / 100;
  const total = servicePrice + gratuity;
  const deposit = total * DETERMINISTIC_PRICING.depositPct / 100;
  const profit = servicePrice - operatingCost;

  return {
    pricingModelVersion: DETERMINISTIC_PRICING_VERSION,
    canSend: validation.canSend,
    missingScope: [...validation.missing, ...validation.invalid],
    validation,
    assumptions: { totalGuests, beverageGuests, serviceHours, bartenders, suggestedBartenders, cocktailCount: Number.isFinite(cocktailCount) ? cocktailCount : null, cocktailComplexity: complexity || null, hasBuiltInBar, travelArea, gratuityPct, disposableCupsIncluded: true, ...flags },
    costs: { labor, disposableCups, baseConsumables, alcoholicService, mocktailService, waterStation, cocktails, complexity: complexityCost, equipment, travel, operatingCost },
    revenue: { minimum, marginPrice, servicePrice, gratuity, total, deposit },
    profit: { dollars: profit, marginPct: servicePrice > 0 ? profit / servicePrice * 100 : 0 }
  };
}

function deterministicScopeFromQuote(q = {}) {
  return {
    guestCount: q.guestCount,
    beverageGuestCount: q.beverageGuestCount,
    serviceHours: q.serviceHours,
    venue: q.venue,
    travelArea: q.travelArea,
    alcoholicService: q.alcoholicService,
    mocktailService: q.mocktailService,
    waterStation: q.waterStation,
    cocktailCount: q.cocktailCount,
    cocktailComplexity: q.cocktailComplexity,
    hasBuiltInBar: q.hasBuiltInBar,
    bartenders: q.bartenders,
    gratuityPct: q.gratuityPct
  };
}

function buildPricingSnapshot(q, calc = calcQuote(q)) {
  if (q.pricingModelVersion !== DETERMINISTIC_PRICING_VERSION) return null;
  const priced = calc.deterministicPricing || buildDeterministicPricing(q);
  return {
    pricingModelVersion: DETERMINISTIC_PRICING_VERSION,
    pricingScope: deterministicScopeFromQuote(q),
    pricingAssumptions: priced.assumptions,
    pricingSnapshot: { costs: priced.costs, revenue: priced.revenue, profit: priced.profit, canSend: priced.canSend, missingScope: priced.missingScope }
  };
}

function hydrateQuotePricing(base, saved = {}) {
  const modern = saved.pricingModelVersion === DETERMINISTIC_PRICING_VERSION;
  if (!modern) return { ...base, pricingModelVersion: saved.pricingModelVersion || null };
  return {
    ...base,
    ...saved.pricingScope,
    pricingModelVersion: DETERMINISTIC_PRICING_VERSION,
    deterministicPricing: saved.pricingSnapshot ? { ...saved.pricingSnapshot, assumptions:saved.pricingAssumptions } : buildDeterministicPricing({ ...base, ...saved.pricingScope })
  };
}

async function persistCurrentQuoteBeforeSend(saveCurrent) {
  const quoteId = await saveCurrent('locked');
  if (!quoteId) throw new Error('Current quote state could not be saved before send');
  return quoteId;
}

const PROPOSAL_TEMPLATE_PRESETS = {
  wedding: {
    label: 'Wedding',
    tone: 'warm',
    menuText: [
      'Two signature cocktails selected with you, poured alongside wine and beer.',
      'We can help narrow the menu once you know the exact direction you want the bar to feel.'
    ].join('\n'),
    alcoholNote: 'Lake Salt is a dry-hire service - you provide the alcohol and we handle everything else. Once the menu is set, we send a simple shopping guide sized to your guest count so you buy exactly what you need.',
    nextSteps: 'Reply to move forward and we will lock in your date. A 10% deposit holds the date; the balance is due on or before your event.'
  },
  corporate: {
    label: 'Corporate / Hosted Event',
    tone: 'polished',
    menuText: [
      'Three signature cocktails, each made to order, alongside a curated selection of wines and beer.',
      'We can build the final cocktail list around the room, the meal, and the way you want guests to move through the evening.'
    ].join('\n'),
    alcoholNote: 'Lake Salt is a dry-hire service: we bring the bar, team, drinkware, ice, mixers, garnishes, and service equipment. You purchase alcohol at store prices using our shopping list - no markup, ever.',
    nextSteps: 'Choose the signature cocktail direction, then we will confirm the logistics and follow up with the agreement and alcohol shopping list.'
  },
  simple: {
    label: 'Simple Follow-Up',
    tone: 'direct',
    menuText: 'Custom drink menu, cocktails and mocktails, with wine and beer service as needed.',
    alcoholNote: 'Alcohol is not included. We send the shopping list and handle the bar, mixers, garnishes, supplies, setup, and breakdown.',
    nextSteps: 'Reply when you are ready and we will lock in the date with a deposit.'
  }
};

/* Event-type → which margin default + whether the profit cap applies.
 * Corporate gets the floor (make MORE), everyone else gets the cap. */
function pricingProfileForEventType(eventType) {
  const t = String(eventType || '').toLowerCase();
  if (t.includes('corp') || t.includes('adobe') || t.includes('company') || t.includes('business')) {
    return { kind: 'corporate', marginKey: 'marginCorpPct', applyCap: false, applyCorpFloor: true };
  }
  if (t.includes('wedding')) {
    return { kind: 'wedding', marginKey: 'marginLargePct', applyCap: true, applyCorpFloor: false };
  }
  /* private / birthday / party / default */
  return { kind: 'private', marginKey: 'marginSmallPct', applyCap: true, applyCorpFloor: false };
}

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

const LEAD_READY_LABELS = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  eventType: 'Event type',
  eventDate: 'Event date',
  eventStartTime: 'Service start time',
  eventEndTime: 'Service end time',
  guestCount: 'Guest count',
  venue: 'Venue',
  hasBuiltInBar: 'Built-in bar',
  drinks: 'Drinks',
  drinkVibes: 'Drink vibes',
  drinkDetail: 'Special requests / drink notes',
  champagneGlassware: 'Champagne glassware'
};

function parseLeadListValue(value) {
  if (Array.isArray(value)) {
    return value.map(v => String(v || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[,;\n]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function formatLeadListValue(value, empty = '—') {
  const list = parseLeadListValue(value);
  if (list.length) return list.join(', ');
  const text = String(value || '').trim();
  return text || empty;
}

function leadFieldHasContent(key, value) {
  if (key === 'guestCount' || key === 'budget') return Number(String(value || '').replace(/[^0-9.]/g, '')) > 0;
  if (key === 'hasBuiltInBar') return ['yes', 'no', 'unsure'].includes(String(value || '').trim().toLowerCase());
  if (key === 'drinks' || key === 'drinkVibes') return parseLeadListValue(value).length > 0;
  if (key === 'drinkDetail') return String(value || '').trim().length > 0;
  return String(value || '').trim().length > 0;
}

function getLeadQuoteReadiness(lead = {}) {
  const requiredKeys = ['name', 'email', 'eventType', 'eventDate', 'eventStartTime', 'eventEndTime', 'guestCount', 'venue', 'hasBuiltInBar', 'drinks', 'drinkDetail'];
  const helpfulKeys = ['phone', 'budget', 'drinkVibes'];
  const drinks = parseLeadListValue(lead.drinks).join(' ').toLowerCase();
  if (/champagne|bubbly|toast|prosecco/.test(drinks)) requiredKeys.push('champagneGlassware');
  const normalizedLead = {
    ...lead,
    drinkDetail: lead.drinkDetail || lead.specialRequests || lead.message || (Array.isArray(lead.notes) ? lead.notes.join(' ') : lead.notes) || ''
  };
  const missingRequired = requiredKeys.filter(key => !leadFieldHasContent(key, normalizedLead[key]));
  const missingHelpful = helpfulKeys.filter(key => !leadFieldHasContent(key, normalizedLead[key]));
  return {
    ready: missingRequired.length === 0,
    missingRequired,
    missingHelpful,
    missingRequiredLabels: missingRequired.map(key => LEAD_READY_LABELS[key] || key),
    missingHelpfulLabels: missingHelpful.map(key => LEAD_READY_LABELS[key] || key),
    missingLabels: [...missingRequired, ...missingHelpful]
      .map(key => LEAD_READY_LABELS[key] || key)
      .filter((label, idx, arr) => arr.indexOf(label) === idx),
  };
}

window.getLeadQuoteReadiness = window.getLeadQuoteReadiness || getLeadQuoteReadiness;
window.formatLeadListValue = window.formatLeadListValue || formatLeadListValue;
window.parseLeadListValue = window.parseLeadListValue || parseLeadListValue;

const QUOTE_MARGIN_MIN = 35;
const QUOTE_MARGIN_MAX = 80;

function clampMargin(value, min = QUOTE_MARGIN_MIN, max = QUOTE_MARGIN_MAX) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normQuoteText(value) {
  return String(value || '').toLowerCase().trim();
}

function hasAnyKeyword(value, keywords) {
  const text = normQuoteText(value);
  return keywords.some((kw) => text.includes(kw));
}

function inferSeasonFromDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.getMonth();
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'fall';
}

function inferDrinkVibe(q = {}, season = '') {
  const blob = [
    q.eventType,
    q.venue,
    q.notes,
    q.drinks,
    q.drinkDetail,
    q.message,
    q.proposal?.eventTitle,
    q.proposal?.menuText,
    q.proposal?.alcoholNote,
    q.proposal?.style
  ].join(' ');
  const text = normQuoteText(blob);
  const eventType = normQuoteText(q.eventType);
  const vibe = {
    primary: 'balanced',
    accent: 'contrast',
    label: 'Balanced / adaptable',
    note: 'keeps the menu flexible and easy to tune'
  };

  if (hasAnyKeyword(text, ['corporate', 'company', 'conference', 'seminar', 'adobe', 'business', 'board', 'gala'])) {
    vibe.primary = 'polished';
    vibe.accent = 'bright';
    vibe.label = 'Polished / professional';
    vibe.note = 'leans clean, classic, and easy to serve at scale';
  } else if (hasAnyKeyword(text, ['wedding', 'romantic', 'garden', 'ceremony', 'reception'])) {
    vibe.primary = season === 'winter' ? 'cozy' : 'bright';
    vibe.accent = season === 'winter' ? 'bright' : 'botanical';
    vibe.label = 'Celebratory / wedding-forward';
    vibe.note = 'wants one crowd-pleaser, one contrast, and one zero-proof lane';
  } else if (hasAnyKeyword(text, ['tropical', 'tiki', 'beach', 'summer', 'pool', 'pineapple', 'citrus', 'spritz'])) {
    vibe.primary = 'bright';
    vibe.accent = 'tropical';
    vibe.label = 'Bright / refreshing';
    vibe.note = 'works best with citrus, spritzes, and a crisp backup option';
  } else if (hasAnyKeyword(text, ['winter', 'holiday', 'spice', 'spiced', 'bourbon', 'whiskey', 'espresso', 'mulled'])) {
    vibe.primary = 'cozy';
    vibe.accent = 'polished';
    vibe.label = 'Cozy / seasonal';
    vibe.note = 'benefits from stirred drinks plus one lighter contrast';
  } else if (hasAnyKeyword(text, ['garden', 'herb', 'herbal', 'floral', 'light', 'fresh', 'mint', 'cucumber', 'lavender'])) {
    vibe.primary = 'botanical';
    vibe.accent = 'bright';
    vibe.label = 'Botanical / fresh';
    vibe.note = 'reads bright, airy, and easy to contrast with something richer';
  } else if (hasAnyKeyword(text, ['mocktail', 'zero-proof', 'nonalcoholic', 'dry', 'n/a'])) {
    vibe.primary = 'zeroProof';
    vibe.accent = 'bright';
    vibe.label = 'Zero-proof friendly';
    vibe.note = 'puts a real nonalcoholic lane on the menu instead of a token garnish';
  } else if (hasAnyKeyword(text, ['bourbon', 'manhattan', 'old fashioned', 'negroni', 'martini', 'stirred'])) {
    vibe.primary = 'stirred';
    vibe.accent = 'bright';
    vibe.label = 'Stirred / spirit-forward';
    vibe.note = 'pairs best with one clean bright drink and one mocktail contrast';
  } else if (hasAnyKeyword(text, ['fun', 'playful', 'themed', 'festival', 'birthday', 'party'])) {
    vibe.primary = 'playful';
    vibe.accent = 'botanical';
    vibe.label = 'Playful / crowd-pleasing';
    vibe.note = 'can carry a loud signature, a clean contrast, and a zero-proof bridge';
  } else if (eventType.includes('private')) {
    vibe.primary = 'balanced';
    vibe.accent = 'bright';
    vibe.label = 'Private / balanced';
    vibe.note = 'keeps the menu friendly without making it generic';
  }

  return { ...vibe, season: season || 'year-round' };
}

const DRINK_LIBRARY = {
  bright: {
    title: 'Bright citrus',
    examples: 'grapefruit spritz, lemon-basil gin fizz, paloma',
    note: 'Best when you want something crisp, sunny, and easy to drink early in the event.'
  },
  botanical: {
    title: 'Botanical / herbal',
    examples: 'cucumber cooler, rosemary gin sour, lavender spritz',
    note: 'Feels polished without being heavy.'
  },
  polished: {
    title: 'Polished classics',
    examples: 'paper plane, bourbon peach smash, classic margarita',
    note: 'Smooth, familiar, and good for mixed audiences.'
  },
  cozy: {
    title: 'Cozy / stirred',
    examples: 'spiced old fashioned, espresso martini, apple bourbon sour',
    note: 'Reads deeper, warmer, and more winter-friendly.'
  },
  tropical: {
    title: 'Tropical / lively',
    examples: 'pineapple rum punch, passionfruit margarita, coconut lime spritz',
    note: 'Keeps the menu moving and playful.'
  },
  stirred: {
    title: 'Stirred / spirit-forward',
    examples: 'negroni, boulevardier, whiskey sour variation',
    note: 'Best when the room wants a more serious cocktail lane.'
  },
  playful: {
    title: 'Playful / themed',
    examples: 'berry lemonade vodka, candy-colored spritz, punch bowl format',
    note: 'Good for casual celebrations or a strong theme.'
  },
  zeroProof: {
    title: 'Zero-proof',
    examples: 'citrus thyme tonic, ginger pear spritz, berry shrub soda',
    note: 'Should feel intentionally designed, not like an afterthought.'
  },
  balanced: {
    title: 'Balanced crowd-pleasers',
    examples: 'vodka citrus spritz, gin Collins, whiskey smash',
    note: 'A safe, flexible middle lane.'
  }
};

function buildDrinkRecommendations(q = {}) {
  const season = inferSeasonFromDate(q.eventDate);
  const vibe = inferDrinkVibe(q, season);
  const drinkText = [q.drinks, q.drinkDetail, q.message, q.notes].join(' ').toLowerCase();
  const wantsBeerWine = hasAnyKeyword(drinkText, ['beer', 'wine', 'champagne', 'prosecco', 'sparkling', 'rosé', 'rose']);
  const wantsMocktail = hasAnyKeyword(drinkText, ['mocktail', 'zero-proof', 'nonalcoholic', 'dry', 'n/a']);

  const contrastMap = {
    bright: 'cozy',
    botanical: 'polished',
    polished: 'bright',
    cozy: 'bright',
    tropical: 'botanical',
    stirred: 'bright',
    playful: 'botanical',
    zeroProof: 'polished',
    balanced: 'bright'
  };

  const seasonMap = {
    winter: 'cozy',
    spring: 'botanical',
    summer: 'bright',
    fall: 'stirred'
  };

  const primaryKey = vibe.primary === 'balanced' && seasonMap[season] ? seasonMap[season] : vibe.primary;
  const secondaryKey = contrastMap[primaryKey] || vibe.accent || 'bright';
  const supportKey = wantsMocktail ? 'zeroProof' : (wantsBeerWine ? 'balanced' : 'zeroProof');
  const tertiaryKey = season === 'winter' ? 'cozy' : 'zeroProof';

  const uniqueKeys = [...new Set([primaryKey, secondaryKey, supportKey, tertiaryKey].filter(Boolean))].slice(0, 3);
  while (uniqueKeys.length < 3) uniqueKeys.push('balanced');

  const recs = uniqueKeys.map((key, idx) => {
    const item = DRINK_LIBRARY[key] || DRINK_LIBRARY.balanced;
    return {
      key,
      label: idx === 0 ? 'Primary direction' : idx === 1 ? 'Contrast' : 'Support',
      title: item.title,
      examples: item.examples,
      note: item.note
    };
  });

  const seasonalCue = season ? `${season.charAt(0).toUpperCase() + season.slice(1)}-leaning` : 'Year-round';
  const menuText = [
    `${seasonalCue} drink direction: ${vibe.label}.`,
    `Primary lane: ${recs[0].title} - ${recs[0].examples}.`,
    `Contrast lane: ${recs[1].title} - ${recs[1].examples}.`,
    `Support lane: ${recs[2].title} - ${recs[2].examples}.`,
    `Why it works: ${vibe.note}`
  ].join('\n');

  return {
    season: season || 'year-round',
    vibe,
    recs,
    menuText,
    hasBeerWine: wantsBeerWine
  };
}

function buildQuoteReadiness(q = {}, lead = {}) {
  const deterministic = q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION
    ? buildDeterministicPricing({ ...lead, ...q })
    : null;
  const drinkPlan = buildDrinkRecommendations(q);
  const contact = [lead.email, lead.phone].some(Boolean);
  const startTime = String(lead.eventStartTime || q.eventStartTime || '').trim();
  const endTime = String(lead.eventEndTime || q.eventEndTime || '').trim();
  const timeWindow = !!(startTime && endTime);
  const quoteBarValue = boolValue(q.hasBuiltInBar);
  const effectiveBarValue = quoteBarValue != null ? quoteBarValue : lead.hasBuiltInBar;
  const barInfo = typeof effectiveBarValue === 'boolean' || ['yes', 'no', 'unsure'].includes(String(effectiveBarValue || '').trim().toLowerCase());
  const drinkInfo = parseLeadListValue(lead.drinks).length > 0;
  const specialRequests = String(lead.specialRequests || lead.drinkDetail || lead.message || q.notes || '').trim();
  const drinkText = parseLeadListValue(lead.drinks).join(' ').toLowerCase();
  const needsGlassware = /champagne|bubbly|toast|prosecco/.test(drinkText);
  const glasswareInfo = !needsGlassware || !!String(lead.champagneGlassware || lead.glassware || '').trim();
  const pricingBand = clampMargin(q.marginPct);
  const sections = [
    ...(deterministic ? [{
      title: 'Confirmed pricing scope',
      items: [
        { label: 'Total guest count', ok: !deterministic.missingScope.includes('totalGuestCount'), detail: deterministic.assumptions.totalGuests || 'Missing', required: true },
        { label: 'Guests receiving drinks', ok: !deterministic.missingScope.includes('beverageGuestCount'), detail: deterministic.assumptions.beverageGuests || 'Missing', required: true },
        { label: 'Alcohol / mocktails / water', ok: !['alcoholicService','mocktailService','waterStation'].some(k => deterministic.missingScope.includes(k)), detail: `Alcohol ${deterministic.assumptions.alcoholicService ? 'yes' : 'no'} · Mocktails ${deterministic.assumptions.mocktailService ? 'yes' : 'no'} · Water ${deterministic.assumptions.waterStation ? 'yes' : 'no'}`, required: true },
        { label: 'Cocktail count and complexity', ok: !['cocktailCount','cocktailComplexity'].some(k => deterministic.missingScope.includes(k)), detail: deterministic.assumptions.cocktailCount == null ? 'Missing' : `${deterministic.assumptions.cocktailCount} · ${deterministic.assumptions.cocktailComplexity || 'not applicable'}`, required: true },
        { label: 'Bar and travel area', ok: !['hasBuiltInBar','travelArea'].some(k => deterministic.missingScope.includes(k)), detail: `${deterministic.assumptions.hasBuiltInBar ? 'Built-in bar' : 'Lake Salt bar'} · ${deterministic.assumptions.travelArea || 'Missing'}`, required: true },
        { label: 'Disposable cups', ok: true, detail: 'Included by default', required: true }
      ]
    }] : []),
    {
      title: 'Core lead info',
      items: [
        { label: 'Lead name', ok: !!String(q.leadName || lead.name || '').trim(), detail: q.leadName || lead.name || 'Missing', required: true },
        { label: 'Event type', ok: !!String(q.eventType || lead.eventType || '').trim(), detail: q.eventType || lead.eventType || 'Missing', required: true },
        { label: 'Event date', ok: !!String(q.eventDate || lead.eventDate || '').trim(), detail: q.eventDate || lead.eventDate || 'Missing', required: true },
        { label: 'Guest count', ok: Number(q.guestCount || lead.guestCount) > 0, detail: Number(q.guestCount || lead.guestCount) > 0 ? `${Number(q.guestCount || lead.guestCount)} guests` : 'Missing', required: true },
        { label: 'Venue', ok: !!String(q.venue || lead.venue || '').trim(), detail: q.venue || lead.venue || 'Missing', required: true }
      ]
    },
    {
      title: 'Service logistics',
      items: [
        { label: 'Contact info', ok: contact, detail: contact ? [lead.email, lead.phone].filter(Boolean).join(' / ') : 'Missing — edit the lead card', required: true },
        { label: 'Service window', ok: timeWindow, detail: timeWindow ? `${startTime} - ${endTime}` : 'Missing — edit the lead card', required: true },
        { label: 'Built-in bar info', ok: barInfo, detail: barInfo ? (boolValue(effectiveBarValue) === true ? 'Yes' : boolValue(effectiveBarValue) === false ? 'No — Lake Salt mobile bar' : String(effectiveBarValue)) : 'Missing — set in pricing scope', required: true },
        { label: 'Champagne / glassware', ok: glasswareInfo, detail: glasswareInfo ? (needsGlassware ? (lead.champagneGlassware || lead.glassware) : 'Not needed') : 'Confirm flutes or plastic', required: true }
      ]
    },
    {
      title: 'Menu direction',
      items: [
        { label: 'Drink package', ok: drinkInfo, detail: drinkInfo ? formatLeadListValue(lead.drinks) : 'Missing', required: true },
        { label: 'Drink direction', ok: !!String(lead.drinkVibes || lead.drinkDetail || '').trim(), detail: lead.drinkVibes || lead.drinkDetail || 'Missing', required: true },
        { label: 'Special requests / logistics', ok: !!specialRequests, detail: specialRequests || 'Confirm none or add requests', required: true },
        { label: 'Seasonal fit', ok: !!drinkPlan.season, detail: drinkPlan.season, required: true },
        { label: 'Contrasting lanes', ok: drinkPlan.recs.length === 3, detail: `${drinkPlan.recs[0].title} / ${drinkPlan.recs[1].title} / ${drinkPlan.recs[2].title}`, required: true }
      ]
    },
    {
      title: 'Pricing guardrails',
      items: [
        { label: 'Bartenders', ok: Number(q.bartenders) > 0, detail: Number(q.bartenders) > 0 ? `${q.bartenders} bartenders` : 'Missing', required: true },
        { label: 'Bartender pay', ok: Number(q.bartenderPay) > 0, detail: Number(q.bartenderPay) > 0 ? moneyFmt(q.bartenderPay) : 'Missing', required: true },
        { label: 'Supplies', ok: Number(q.supplies) >= 0, detail: moneyFmt(q.supplies), required: true },
        { label: 'Travel', ok: Number(q.travel) >= 0, detail: moneyFmt(q.travel), required: true },
        { label: 'Margin band', ok: pricingBand >= QUOTE_MARGIN_MIN, detail: `${pricingBand}% target`, required: true }
      ]
    }
  ];

  const requiredItems = sections.flatMap((section) => section.items.filter((item) => item.required !== false));
  const readyCount = requiredItems.filter((item) => item.ok).length;
  const totalCount = requiredItems.length;
  const canLock = requiredItems.every((item) => item.ok) && (!deterministic || deterministic.canSend);
  return { sections, readyCount, totalCount, canLock, canSend: canLock, drinkPlan };
}

/* Readiness details are narrow (~110px in the 2-col grid), so an unbounded value —
   e.g. the client's full inquiry message under "Special requests" — collapses into a
   one-word-per-line ribbon that blows out the panel. Collapse whitespace, cap the
   preview, and keep the full text in a tooltip. */
const READINESS_DETAIL_MAX = 60;
function readinessDetailParts(raw) {
  const text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  // `full` carries the complete text even when no truncation happened: the
  // 3-line CSS clamp can still hide the tail (a 43-char venue clips in this
  // column), so the tooltip has to cover both cases.
  if (text.length <= READINESS_DETAIL_MAX) return { preview: text, full: text };
  return { preview: text.slice(0, READINESS_DETAIL_MAX - 1).trimEnd() + '…', full: text };
}

function renderReadinessHTML(readiness) {
  const pct = readiness.totalCount ? Math.round((readiness.readyCount / readiness.totalCount) * 100) : 0;
  const tone = readiness.canLock ? '#22c55e' : pct >= 70 ? '#FACC15' : '#E05252';
  return `
    <div style="margin-top:12px;padding:12px;border:1px solid rgba(59,130,246,0.25);border-radius:10px;background:rgba(59,130,246,0.06)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <div>
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:#A8B5D9">Private quote readiness</div>
          <div class="text-muted" style="font-size:11px;margin-top:2px">${readiness.readyCount}/${readiness.totalCount} required items ready</div>
        </div>
        <div style="font-size:13px;font-weight:700;color:${tone}">${readiness.canLock ? 'Ready to lock' : 'Needs attention'}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        ${readiness.sections.map((section) => `
          <div style="padding:8px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,0.02)">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:6px">${section.title}</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              ${section.items.map((item) => {
                const detail = readinessDetailParts(item.detail);
                return `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;font-size:12px;line-height:1.35">
                  <span style="color:${item.ok ? 'var(--text)' : '#E05252'}">${item.ok ? '✓' : '•'}&nbsp;${escapeHtmlSafe(item.label)}</span>
                  <span class="text-muted"${detail.full ? ` title="${escapeHtmlSafe(detail.full)}"` : ''} style="text-align:right;max-width:56%;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${escapeHtmlSafe(detail.preview)}</span>
                </div>
              `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function buildQuoteGuidance(q = {}, lead = {}) {
  const season = inferSeasonFromDate(q.eventDate);
  const vibe = inferDrinkVibe(q, season);
  const guests = Number(q.guestCount || lead.guestCount) || parseGuests(q.guestCount || lead.guestCount);
  const bartenderCount = Math.max(1, Math.ceil(guests / QUOTE_DEFAULTS.bartendersPerGuests));
  const basePay = Number(q.bartenderPay || QUOTE_DEFAULTS.bartenderPayDefault) || QUOTE_DEFAULTS.bartenderPayDefault;
  const eventText = [q.eventType, lead.eventType].join(' ').toLowerCase();
  const menuText = [lead.drinks, lead.drinkDetail, q.notes, q.proposal?.menuText].join(' ').toLowerCase();

  let complexity = 0;
  if (hasAnyKeyword(eventText, ['wedding', 'corporate', 'conference', 'gala', 'festival'])) complexity += 1;
  if (hasAnyKeyword(menuText, ['signature', 'craft', 'custom', 'featured', 'cocktail'])) complexity += 1;
  if (hasAnyKeyword(menuText, ['outdoor', 'tent', 'estate', 'mountain', 'remote'])) complexity += 1;
  if (season === 'winter' || season === 'summer') complexity += 1;
  if (lead.hasBuiltInBar === false) complexity += 1;

  const payTarget = Math.max(150, Math.round(basePay + (complexity * 15) + (vibe.primary === 'cozy' || vibe.primary === 'polished' ? 10 : 0)));
  const payLow = Math.max(125, payTarget - 25);
  const payHigh = payTarget + 25;

  const suppliesBase = Number(q.supplies || QUOTE_DEFAULTS.suppliesDefault) || QUOTE_DEFAULTS.suppliesDefault;
  const suppliesTarget = Math.max(100, Math.round(suppliesBase + (guests > 150 ? 50 : guests > 80 ? 25 : 0) + (vibe.primary === 'bright' || vibe.primary === 'tropical' ? 20 : 0) + (lead.hasBuiltInBar === false ? 25 : 0)));
  const suppliesLow = Math.max(75, suppliesTarget - 25);
  const suppliesHigh = suppliesTarget + 35;

  const travelLocal = 0;
  const travelNearby = Math.max(25, Math.round(15 + (complexity * 10)));
  const travelFar = Math.max(75, Math.round(50 + (complexity * 20)));

  const note = [
    lead.hasBuiltInBar === false ? 'No built-in bar usually means a little more setup pressure.' : 'Built-in bar means you can keep setup leaner.',
    hasAnyKeyword(menuText, ['wine', 'beer']) ? 'Beer and wine leaning menus usually keep labor cleaner.' : 'A cocktail-heavy menu usually deserves higher labor and supply guardrails.',
    season ? `${season.charAt(0).toUpperCase() + season.slice(1)} events usually need season-aware garnish and ice planning.` : 'Season is unknown, so stay conservative on supplies.'
  ].join(' ');

  return {
    bartender: { count: bartenderCount, low: payLow, target: payTarget, high: payHigh },
    supplies: { low: suppliesLow, target: suppliesTarget, high: suppliesHigh },
    travel: { local: travelLocal, nearby: travelNearby, far: travelFar },
    vibe,
    note
  };
}

function renderGuidanceHTML(guidance, drinkPlan) {
  return `
    <div style="margin-top:12px;padding:12px;border:1px solid rgba(139,155,126,0.35);border-radius:10px;background:rgba(139,155,126,0.06)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <div>
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--teal-lt)">Internal cost guidance</div>
          <div class="text-muted" style="font-size:11px;margin-top:2px">Flexible ranges for labor and expenses, kept inside the 35-40% band.</div>
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--gold)">${guidance.bartender.count} bartenders suggested</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
        <div style="padding:8px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,0.02)">
          <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:4px">Bartender pay</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:6px">${moneyFmt(guidance.bartender.low)} - ${moneyFmt(guidance.bartender.high)}</div>
          <div class="text-muted" style="font-size:11px;line-height:1.45;margin-bottom:8px">Target ${moneyFmt(guidance.bartender.target)} for this event profile.</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" data-guidance-action="pay" data-guidance-value="${guidance.bartender.low}" style="padding:3px 8px;font-size:11px">Low</button>
            <button type="button" class="btn btn-secondary btn-sm" data-guidance-action="pay" data-guidance-value="${guidance.bartender.target}" style="padding:3px 8px;font-size:11px">Target</button>
            <button type="button" class="btn btn-ghost btn-sm" data-guidance-action="pay" data-guidance-value="${guidance.bartender.high}" style="padding:3px 8px;font-size:11px">High</button>
          </div>
        </div>
        <div style="padding:8px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,0.02)">
          <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:4px">Supplies / setup</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:6px">${moneyFmt(guidance.supplies.low)} - ${moneyFmt(guidance.supplies.high)}</div>
          <div class="text-muted" style="font-size:11px;line-height:1.45;margin-bottom:8px">Target ${moneyFmt(guidance.supplies.target)} for cups, ice, mixers, garnishes, and expendables.</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" data-guidance-action="supplies" data-guidance-value="${guidance.supplies.low}" style="padding:3px 8px;font-size:11px">Lean</button>
            <button type="button" class="btn btn-secondary btn-sm" data-guidance-action="supplies" data-guidance-value="${guidance.supplies.target}" style="padding:3px 8px;font-size:11px">Standard</button>
            <button type="button" class="btn btn-ghost btn-sm" data-guidance-action="supplies" data-guidance-value="${guidance.supplies.high}" style="padding:3px 8px;font-size:11px">Heavy</button>
          </div>
        </div>
        <div style="padding:8px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,0.02)">
          <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:4px">Travel</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:6px">${moneyFmt(guidance.travel.local)} / ${moneyFmt(guidance.travel.nearby)} / ${moneyFmt(guidance.travel.far)}</div>
          <div class="text-muted" style="font-size:11px;line-height:1.45;margin-bottom:8px">Local, nearby, or long-haul planning bands.</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" data-guidance-action="travel" data-guidance-value="${guidance.travel.local}" style="padding:3px 8px;font-size:11px">Local</button>
            <button type="button" class="btn btn-secondary btn-sm" data-guidance-action="travel" data-guidance-value="${guidance.travel.nearby}" style="padding:3px 8px;font-size:11px">Nearby</button>
            <button type="button" class="btn btn-ghost btn-sm" data-guidance-action="travel" data-guidance-value="${guidance.travel.far}" style="padding:3px 8px;font-size:11px">Far</button>
          </div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-muted);line-height:1.5">${escapeHtmlSafe(guidance.note)}</div>
      ${drinkPlan ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:6px">Suggested drink direction</div>
          <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
            ${drinkPlan.recs.map((rec, idx) => `
              <div style="padding:8px;border:1px solid var(--border);border-radius:8px;background:rgba(255,255,255,0.02)">
                <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${idx===0?'var(--gold)':'var(--text-muted)'};margin-bottom:4px">${rec.label}</div>
                <div style="font-size:13px;font-weight:700;margin-bottom:4px">${escapeHtmlSafe(rec.title)}</div>
                <div style="font-size:11px;line-height:1.45;color:var(--text-muted)">${escapeHtmlSafe(rec.examples)}</div>
              </div>
            `).join('')}
          </div>
          <div style="margin-top:8px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
            <div class="text-muted" style="font-size:11px;line-height:1.5">${escapeHtmlSafe(drinkPlan.vibe.note)}</div>
            <button type="button" class="btn btn-secondary btn-sm" id="qb-use-drink-direction">Use this direction</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/* ═════════════════════════════════════════════════════════════════════════
   LEARNING FROM PAST QUOTES — Tier 1 (lookup) + backward-fit support.

   findSimilarQuotes(filters) → past quotes that "look like" this event:
     · same eventType (loose match)
     · guestCount within ±25% (or no filter if guests unknown)
     · within the last 18 months
     · excludes drafts (we learn from what you actually quoted)

   Returns { all, accepted, median, min, max, acceptRate, ratios } where:
     · ratios = average proportion of total that went to each line type
       across accepted quotes. Used by the backward-fit so when you set
       a target total, the breakdown auto-fills in your usual shape.
   ───────────────────────────────────────────────────────────────────────── */
async function findSimilarQuotes({ eventType, guestCount, leadId } = {}) {
  let snap;
  try { snap = await db.collection('quotes').get(); }
  catch (e) { console.warn('Quote history fetch failed:', e); return emptyInsights(); }

  const norm = (s) => String(s || '').toLowerCase().trim();
  const targetType = norm(eventType);
  const targetGuests = Number(guestCount) || 0;
  const eighteenMonthsAgo = Date.now() - 18 * 30 * 86400000;

  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    /* Exclude the lead we're currently quoting from its own history */
    .filter(q => !leadId || q.leadId !== leadId)
    /* Drafts are noise — only learn from what you committed to */
    .filter(q => q.status === 'locked' || q.status === 'sent' || q.status === 'accepted')
    /* Recent enough to be price-relevant */
    .filter(q => {
      const t = q.createdAt?.toMillis?.() || 0;
      return t === 0 || t >= eighteenMonthsAgo;
    });

  /* eventType match: loose, just startsWith on the lead's eventType */
  const typeMatched = targetType
    ? all.filter(q => norm(q.lineItems?.eventType || q.eventType || '').includes(targetType.split(' ')[0]))
    : all;

  /* guestCount window: ±25% */
  const guestMatched = targetGuests
    ? typeMatched.filter(q => {
        const g = Number(q.lineItems?.guestCount) || 0;
        return g >= targetGuests * 0.75 && g <= targetGuests * 1.25;
      })
    : typeMatched;

  /* If guest filter wiped everything, fall back to type-only matches */
  const similar = guestMatched.length >= 2 ? guestMatched : typeMatched;
  if (!similar.length) return emptyInsights();

  const accepted = similar.filter(q => q.status === 'accepted');
  const sortedByTotal = [...similar].sort((a, b) => (a.total || 0) - (b.total || 0));
  const median = sortedByTotal[Math.floor(sortedByTotal.length / 2)]?.total || 0;
  const min = sortedByTotal[0]?.total || 0;
  const max = sortedByTotal[sortedByTotal.length - 1]?.total || 0;
  const acceptRate = similar.length ? accepted.length / similar.length : 0;

  /* Ratio breakdown — only computed from ACCEPTED quotes (those are the
   * shapes that worked). Average of (line_total / quote_total) per line. */
  const sample = accepted.length >= 3 ? accepted : (similar.length >= 3 ? similar : []);
  const ratios = computeBreakdownRatios(sample);

  return { all: similar, accepted, median, min, max, acceptRate, ratios, sampleSize: similar.length, acceptedSize: accepted.length };
}

function emptyInsights() {
  return { all: [], accepted: [], median: 0, min: 0, max: 0, acceptRate: 0, ratios: null, sampleSize: 0, acceptedSize: 0 };
}

/* Tolerant of both new (bartenders×bartenderPay + supplies + travel) and
 * legacy (serviceHours×bartenderRate×bartenders + customMenuFee + travelFee)
 * saved quotes. Guards every field against undefined. */
function computeBreakdownRatios(quotes) {
  if (!quotes.length) return null;
  const sums = { bartender: 0, supplies: 0, travel: 0, custom: 0 };
  let n = 0;
  for (const q of quotes) {
    const total = q.total;
    if (!total || total <= 0) continue;
    const li = q.lineItems || {};
    /* New model: flat pay per bartender. Legacy: hours×rate×count. */
    const bartender = li.bartenderPay != null
      ? (li.bartenders||0) * (li.bartenderPay||0)
      : (li.serviceHours||0) * (li.bartenderRate||0) * (li.bartenders||0);
    /* New: supplies. Legacy: customMenuFee + off-menu folded in as supplies. */
    const supplies = li.supplies != null
      ? (li.supplies||0)
      : ((li.customMenuFee||0) + (li.offMenuEnabled ? (li.offMenuQty||0)*(li.offMenuPrice||0) : 0));
    const travel = (li.travel != null ? li.travel : li.travelFee) || 0;
    const custom = Array.isArray(li.custom) ? li.custom.reduce((s,c) => s + (Number(c.price)||0), 0) : 0;
    sums.bartender += bartender / total;
    sums.supplies  += supplies / total;
    sums.travel    += travel / total;
    sums.custom    += custom / total;
    n++;
  }
  if (!n) return null;
  return {
    bartender: sums.bartender / n,
    supplies:  sums.supplies / n,
    travel:    sums.travel / n,
    custom:    sums.custom / n
  };
}

/* Distribute a target total across line items using historical ratios.
 * Mutates the state object's fields directly. Used when the user sets a
 * top-down total and we want the breakdown to "fit" automatically. */
/* In the cost-plus-margin model the cost inputs (bartenders, pay, supplies,
 * travel) are fixed by the event itself — they aren't dials we stretch to hit
 * a target. So when the user sets a top-down total we simply record it as the
 * override; calcQuote() captures the gap as targetAdjustment. We leave the
 * cost inputs untouched. Kept as a no-op-ish helper for call-site
 * compatibility. */
function distributeToTarget(q, targetTotal /*, ratios */) {
  if (!targetTotal) return;
  q.totalOverride = Math.round(targetTotal);
}

/* ─── In-memory quote state (per active builder instance) ───
 * New cost-plus-margin model. We keep a few legacy fields (serviceHours,
 * lineItems, discount, totalOverride) because the surrounding UI/history/save
 * code still references them and old saved quotes carry them. */
function makeInitialQuote(lead) {
  const guests = lead?.guestCount == null || String(lead.guestCount).trim() === '' ? 0 : parseGuests(lead.guestCount);
  const budget = parseBudget(lead?.budget);
  const profile = pricingProfileForEventType(lead?.eventType);
  const style = profile.kind === 'corporate' ? 'corporate' : (String(lead?.eventType || '').toLowerCase().includes('wedding') ? 'wedding' : 'simple');
  const drinkPlan = buildDrinkRecommendations({
    eventType: lead?.eventType || '',
    eventDate: lead?.eventDate || '',
    venue: lead?.venue || '',
    drinks: lead?.drinks || '',
    drinkDetail: lead?.drinkDetail || '',
    message: lead?.message || '',
    notes: lead?.notes || '',
    proposal: { style }
  });
  const deterministic = buildDeterministicPricing({
    ...lead,
    serviceHours: lead?.serviceHours || QUOTE_DEFAULTS.hoursDefault
  });
  return {
    leadId: lead?.id || null,
    leadName: lead?.name || '',
    eventType: lead?.eventType || '',
    eventDate: lead?.eventDate || '',
    venue: lead?.venue || '',
    guestCount: guests,
    serviceHours: QUOTE_DEFAULTS.hoursDefault,
    beverageGuestCount: Number(lead?.beverageGuestCount) || 0,
    alcoholicService: boolValue(lead?.alcoholicService),
    mocktailService: boolValue(lead?.mocktailService),
    waterStation: boolValue(lead?.waterStation),
    cocktailCount: lead?.cocktailCount == null ? null : Number(lead.cocktailCount),
    cocktailComplexity: lead?.cocktailComplexity || '',
    hasBuiltInBar: boolValue(lead?.hasBuiltInBar),
    travelArea: lead?.travelArea || deterministic.assumptions.travelArea,
    gratuityPct: Number(lead?.gratuityPct) || 0,

    /* COST INPUTS (the real model) */
    bartenders: deterministic.assumptions.suggestedBartenders || 0,
    bartenderPay: QUOTE_DEFAULTS.bartenderPayDefault,   // flat $ per bartender
    supplies: QUOTE_DEFAULTS.suppliesDefault,           // cups/ice/garnish/mixers
    travel: QUOTE_DEFAULTS.travelBase,                  // gas/out-of-area

    /* MARGIN: profile-driven default; user adjusts the slider */
    pricingKind: profile.kind,                          // wedding | private | corporate
    marginPct: profile.kind === 'corporate'
      ? DETERMINISTIC_PRICING.targetMargins.corporate
      : clampMargin(QUOTE_DEFAULTS[profile.marginKey]),
    applyProfitCap: profile.applyCap,                   // weddings/private
    applyCorpFloor: profile.applyCorpFloor,             // corporate

    /* Optional user-defined add-ons that go straight to the client price
     * (already-profit items, e.g. rental glassware passthrough). */
    lineItems: [],

    discountType: 'pct',  // 'pct' | 'amt'
    discountValue: 0,
    depositPct: QUOTE_DEFAULTS.depositPct,

    /* Top-down override — set your own final total, profit recomputes. */
    totalOverride: null,

    notes: '',
    proposal: makeDefaultProposal(lead, style, guests, drinkPlan),
    budgetRaw: budget.raw,
    budgetValid: budget.valid,
    budgetTarget: budget.valid ? budget.value : 0,
    drinkPlan,
    pricingModelVersion: DETERMINISTIC_PRICING_VERSION,
    deterministicPricing: deterministic
  };
}

function makeDefaultProposal(lead, style, guests, drinkPlan = null) {
  const preset = PROPOSAL_TEMPLATE_PRESETS[style] || PROPOSAL_TEMPLATE_PRESETS.simple;
  const eventType = lead?.eventType || 'event';
  const venue = lead?.venue ? ` at ${lead.venue}` : '';
  const date = lead?.eventDate || '';
  const serviceWindow = lead?.eventStartTime && lead?.eventEndTime
    ? `${lead.eventStartTime} - ${lead.eventEndTime}`
    : '';
  return {
    style,
    eventTitle: `${eventType}${venue}`.trim(),
    serviceWindow,
    arrivalPlan: serviceWindow
      ? `We arrive early enough to set the bar so everything is polished before guests arrive.`
      : `We arrive early, set the bar, prep garnishes and mixers, and make sure everything is polished before the first guest walks in.`,
    servicePlan: `Our team pours for ${guests || 'your'} guests with professional bartending, setup, breakdown, mixers, garnishes, ice, and bar equipment included.`,
    drinkPlan: drinkPlan || buildDrinkRecommendations(lead),
    menuText: drinkPlan?.menuText || preset.menuText,
    alcoholNote: preset.alcoholNote,
    nextSteps: date
      ? `Reply to move forward and we will lock in ${formatDateForProposal(date)}. A 10% deposit holds your date; the balance is due on or before your event.`
      : preset.nextSteps
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

/* Pure calc — no DOM. COST-PLUS-MARGIN model.
 *
 *   costBasis = bartenders×pay + supplies + travel
 *   base quote from margin = costBasis ÷ (1 − margin%)
 *   then apply profit cap (weddings/private) or corp floor (corporate),
 *   then add any client-facing line-item add-ons, then discount,
 *   then honor a manual totalOverride.
 *
 * The returned shape stays backward-compatible with the save/history/view
 * code: it still exposes subtotal, discountAmt, computedTotal, total,
 * hasOverride, targetAdjustment, deposit, costEstimate, profit, marginPct,
 * and a breakdown object. */
function calcQuote(q) {
  if (q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION) {
    const priced = buildDeterministicPricing(q);
    const b = priced.costs;
    return {
      subtotal: priced.revenue.servicePrice,
      discountAmt: 0,
      computedTotal: priced.revenue.total,
      total: priced.revenue.total,
      hasOverride: false,
      targetAdjustment: 0,
      deposit: priced.revenue.deposit,
      costEstimate: b.operatingCost + priced.revenue.gratuity,
      profit: priced.profit.dollars,
      marginPct: priced.profit.marginPct,
      costBasis: b.operatingCost,
      priceFromMargin: priced.revenue.marginPrice,
      effectiveMargin: Number(q.marginPct) || DETERMINISTIC_PRICING.targetMargins[pricingProfileForEventType(q.eventType).kind],
      capApplied: false,
      corpFloorApplied: false,
      peakAdj: 0,
      beforeDiscount: priced.revenue.total,
      canSend: priced.canSend,
      missingScope: priced.missingScope,
      deterministicPricing: priced,
      breakdown: { bartenderTotal: b.labor, supplies: b.disposableCups + b.baseConsumables + b.alcoholicService + b.mocktailService + b.waterStation + b.cocktails + b.complexity + b.equipment, travel: b.travel, lineItemTotal: priced.revenue.gratuity }
    };
  }
  const bartenderTotal = (q.bartenders || 0) * (q.bartenderPay || 0);
  const supplies = Number(q.supplies) || 0;
  const travel = Number(q.travel) || 0;
  const lineItemTotal = (q.lineItems || []).reduce((s, li) => s + (Number(li.price) || 0), 0);

  /* True cost of delivering the event (line-item add-ons are treated as
   * client-facing passthrough/profit, NOT cost). */
  const costBasis = bartenderTotal + supplies + travel;

  /* Margin-driven price on the cost basis */
  const marginPctInput = clampMargin(Number(q.marginPct) || 0);
  const marginFloor = QUOTE_DEFAULTS.marginFloorPct || 40;
  const effectiveMargin = Math.max(marginPctInput, marginFloor); // never below floor
  let priceFromMargin = costBasis / (1 - effectiveMargin / 100);
  let profitFromMargin = priceFromMargin - costBasis;

  /* PROFIT CAP (weddings/private): once %-based profit would exceed the
   * trigger, stop scaling and cap profit flat. Anti-overcharge ceiling. */
  let capApplied = false;
  if (q.applyProfitCap && profitFromMargin > QUOTE_DEFAULTS.profitCapTrigger) {
    priceFromMargin = costBasis + QUOTE_DEFAULTS.profitCapValue;
    profitFromMargin = QUOTE_DEFAULTS.profitCapValue;
    capApplied = true;
  }

  /* CORP FLOOR (Adobe/corporate): make at least profitFloorCorp; cap N/A. */
  let corpFloorApplied = false;
  if (q.applyCorpFloor && profitFromMargin < QUOTE_DEFAULTS.profitFloorCorp) {
    priceFromMargin = costBasis + QUOTE_DEFAULTS.profitFloorCorp;
    profitFromMargin = QUOTE_DEFAULTS.profitFloorCorp;
    corpFloorApplied = true;
  }

  /* Add client-facing add-ons on top, then discount. */
  const subtotal = priceFromMargin + lineItemTotal;
  const discountAmt = q.discountType === 'pct'
    ? subtotal * ((q.discountValue || 0) / 100)
    : (q.discountValue || 0);
  const computedTotal = Math.max(0, subtotal - discountAmt);

  /* Manual override wins. */
  const hasOverride = q.totalOverride != null && !isNaN(q.totalOverride);
  const total = hasOverride ? Number(q.totalOverride) : computedTotal;
  const targetAdjustment = hasOverride ? total - computedTotal : 0;

  const deposit = total * ((q.depositPct || 0) / 100);

  /* Real profit/margin against the TRUE cost basis (line items are profit). */
  const costEstimate = costBasis;
  const profit = total - costEstimate;
  const marginPct = total > 0 ? (profit / total) * 100 : 0;

  return {
    subtotal, discountAmt, computedTotal, total, hasOverride, targetAdjustment,
    deposit, costEstimate, profit, marginPct,
    costBasis, priceFromMargin, effectiveMargin,
    capApplied, corpFloorApplied,
    /* legacy fields some callers read */
    peakAdj: 0, beforeDiscount: subtotal,
    breakdown: { bartenderTotal, supplies, travel, lineItemTotal }
  };
}

function formatDateForProposal(value) {
  if (!value) return '';
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function firstNameFromLead(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'there';
}

function proposalField(q, key) {
  return q.proposal && q.proposal[key] != null ? q.proposal[key] : '';
}

function setProposalPreset(q, style) {
  const preset = PROPOSAL_TEMPLATE_PRESETS[style] || PROPOSAL_TEMPLATE_PRESETS.simple;
  const drinkPlan = buildDrinkRecommendations(q);
  q.proposal = {
    ...makeDefaultProposal(q, style, q.guestCount, drinkPlan),
    ...(q.proposal || {}),
    style,
    drinkPlan,
    menuText: drinkPlan.menuText || preset.menuText,
    alcoholNote: preset.alcoholNote,
    nextSteps: q.eventDate
      ? `Reply to move forward and we will lock in ${formatDateForProposal(q.eventDate)}. A 10% deposit holds your date; the balance is due on or before your event.`
      : preset.nextSteps
  };
}

function generateProposalText(q, calc) {
  const proposal = q.proposal || makeDefaultProposal(q, q.pricingKind === 'corporate' ? 'corporate' : 'simple', q.guestCount);
  const style = proposal.style || 'simple';
  const title = proposal.eventTitle || [q.eventType, q.venue].filter(Boolean).join(' at ') || 'your event';
  const dateLine = [q.eventType, formatDateForProposal(q.eventDate), q.venue].filter(Boolean).join('  |  ');
  const serviceLine = [
    q.serviceHours ? `${q.serviceHours} hours of service` : '',
    `${q.bartenders} bartender${q.bartenders === 1 ? '' : 's'}`,
    q.guestCount ? `${q.guestCount} guests` : ''
  ].filter(Boolean).join('  |  ');
  const inclusions = [
    'Professional bartenders',
    'Setup and breakdown',
    'Mobile bar and service equipment',
    'Mixers, garnishes, ice, cups, and supplies'
  ];
  const intro = style === 'corporate'
    ? `An intentional bar experience changes the room. Here is how Lake Salt would support ${title} - polished service, made-to-order drinks, and a team that owns the flow of the night.`
    : `Hi ${firstNameFromLead(q.leadName)}, thank you for thinking of Lake Salt for ${title}. Here is how we would bring the bar to life for your event - the plan, what it includes, and the drinks we would love to pour.`;
  const drinkPlan = proposal.drinkPlan || buildDrinkRecommendations(q);
  const menuText = proposal.menuText || drinkPlan.menuText || 'Custom drink menu, cocktails and mocktails, with wine and beer service as needed.';

  return [
    'LAKE SALT BARTENDING',
    `Prepared for ${q.leadName || 'your event'}${dateLine ? `  |  ${dateLine}` : ''}`,
    '',
    intro,
    '',
    style === 'corporate' ? 'THE SERVICE PLAN' : 'THE PLAN FOR YOUR EVENT',
    proposal.arrivalPlan || '',
    proposal.servicePlan || '',
    proposal.serviceWindow ? `Service window: ${proposal.serviceWindow}` : '',
    '',
    'YOUR INVESTMENT',
    moneyFmt(calc.total),
    serviceLine,
    ...inclusions.map(item => `- ${item}`),
    '',
    proposal.alcoholNote || '',
    '',
    style === 'corporate' ? 'SIGNATURE COCKTAILS / MENU DIRECTION' : "THE MENU WE'D POUR",
    menuText,
    '',
    'NEXT STEPS',
    proposal.nextSteps || `A ${q.depositPct}% deposit (${moneyFmt(calc.deposit)}) holds the date. Quote valid for ${QUOTE_DEFAULTS.quoteExpiryDays} days.`,
    '',
    `Quote valid for ${QUOTE_DEFAULTS.quoteExpiryDays} days.`,
    'Kendell | Lake Salt Bartending | contact@lakesalt.us | lakesalt.us'
  ].filter(line => line !== null && line !== undefined).join('\n');
}

function generatedProposalPreviewHTML(q, calc) {
  return escapeHtmlSafe(generateProposalText(q, calc));
}

/* Client-facing quote text for copy/email. Kendell's rule: quote ONE clean
 * total — no itemized cost breakdown, no bartender pay, supplies, margin, or
 * profit. Just the total, the deposit, the alcohol note, and validity. */
function quoteText(q, calc) {
  if (q.proposal) return generateProposalText(q, calc);
  const lines = [
    `Lake Salt Bartending — Quote for ${q.leadName || 'your event'}`,
    `─────────────────────────────────────`,
    `${q.bartenders} professional bartender${q.bartenders === 1 ? '' : 's'} · custom drink menu (cocktails + mocktails)`,
    ``,
    `TOTAL: ${moneyFmt(calc.total)}`,
    `Deposit to lock the date (${q.depositPct}%): ${moneyFmt(calc.deposit)}`,
    ``,
    `Alcohol not included.`,
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

/* Inner HTML for the totals grid — extracted so repaintTotals() can refresh
 * it in place without rebuilding the whole builder DOM. */
function totalsGridHTML(q, calc) {
  if (q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION && calc.deterministicPricing) {
    const p = calc.deterministicPricing;
    const rows = [
      ['Bartender labor', p.costs.labor], ['Disposable cups', p.costs.disposableCups],
      ['Base consumables', p.costs.baseConsumables], ['Alcohol service', p.costs.alcoholicService],
      ['Mocktail service', p.costs.mocktailService], ['Water / NA station', p.costs.waterStation],
      ['Cocktail count', p.costs.cocktails], ['Cocktail complexity', p.costs.complexity],
      ['Equipment / mobile bar', p.costs.equipment], ['Travel', p.costs.travel]
    ].filter(([, value]) => value > 0);
    return `
      ${rows.map(([label,value]) => `<div class="text-muted">${label}</div><div style="text-align:right">${moneyFmt(value)}</div>`).join('')}
      <div style="font-weight:700;border-top:1px solid var(--border);padding-top:5px">Operating cost</div><div style="text-align:right;font-weight:700;border-top:1px solid var(--border);padding-top:5px">${moneyFmt(p.costs.operatingCost)}</div>
      <div class="text-muted">Margin price / minimum</div><div style="text-align:right">${moneyFmt(p.revenue.marginPrice)} / ${moneyFmt(p.revenue.minimum)}</div>
      <div class="text-muted">Service price</div><div style="text-align:right">${moneyFmt(p.revenue.servicePrice)}</div>
      ${p.revenue.gratuity > 0 ? `<div class="text-muted">Staff gratuity</div><div style="text-align:right">${moneyFmt(p.revenue.gratuity)}</div>` : ''}
      <div style="font-weight:700;color:var(--text);font-size:18px;margin-top:4px">Quoted total</div><div style="text-align:right;font-weight:700;color:var(--gold);font-size:22px">${moneyFmt(p.revenue.total)}</div>
      <div class="text-muted" style="font-size:12px">Deposit (10%)</div><div style="text-align:right;font-size:12px">${moneyFmt(p.revenue.deposit)}</div>
      <div class="text-muted">Operating profit</div><div style="text-align:right">${moneyFmt(p.profit.dollars)} · ${Math.round(p.profit.marginPct)}%</div>`;
  }
  return `
    <div class="text-muted">Cost basis</div><div style="text-align:right">${moneyFmt(calc.costBasis)}</div>
    <div class="text-muted">Margin %</div><div style="text-align:right">${Math.round(calc.effectiveMargin)}%${calc.capApplied?` <span style="color:#FACC15;font-size:11px">profit capped at ${moneyFmt(QUOTE_DEFAULTS.profitCapValue)}</span>`:''}${calc.corpFloorApplied?` <span style="color:#3b82f6;font-size:11px">corp floor ${moneyFmt(QUOTE_DEFAULTS.profitFloorCorp)}</span>`:''}</div>
    ${calc.discountAmt>0?`<div class="text-muted">Discount</div><div style="text-align:right;color:#22c55e">−${moneyFmt(calc.discountAmt)}</div>`:''}
    <div class="text-muted">Computed total</div><div style="text-align:right;${calc.hasOverride?'text-decoration:line-through;opacity:.7':''}">${moneyFmt(calc.computedTotal)}</div>
    ${calc.hasOverride && calc.targetAdjustment !== 0 ? `<div class="text-muted">Adjustment to target</div><div style="text-align:right;color:${calc.targetAdjustment>0?'#FACC15':'#22c55e'}">${calc.targetAdjustment>0?'+':''}${moneyFmt(calc.targetAdjustment)}</div>`:''}
    <div style="font-weight:700;color:var(--text);font-size:18px;margin-top:4px">Quoted total</div>
    <div style="text-align:right;font-weight:700;color:var(--gold);font-size:22px">${moneyFmt(calc.total)}</div>
    <div class="text-muted" style="font-size:12px">Deposit (${q.depositPct}%)</div><div style="text-align:right;font-size:12px">${moneyFmt(calc.deposit)}</div>
  `;
}

function modernScopeControlsHTML(q) {
  const yesNo = (id, value) => `<select id="${id}" class="form-select qb-scope-input"><option value="" ${value == null?'selected':''}>Confirm…</option><option value="true" ${value===true?'selected':''}>Yes</option><option value="false" ${value===false?'selected':''}>No</option></select>`;
  return `<div style="margin-top:12px;padding:12px;border:1px solid rgba(201,168,76,.35);border-radius:10px">
    <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--gold);margin-bottom:8px">Deterministic service scope</div>
    <div class="qb-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
      <label class="qb-field"><span>Event type</span><input id="qb-event-type" type="text" value="${escapeHtmlSafe(q.eventType || '')}" class="form-input qb-scope-input"></label>
      <label class="qb-field"><span>Venue or city</span><input id="qb-venue" type="text" value="${escapeHtmlSafe(q.venue || '')}" class="form-input qb-scope-input"></label>
      <label class="qb-field"><span>Total guests</span><input id="qb-total-guests" type="number" min="1" max="2000" step="1" value="${q.guestCount || ''}" class="form-input qb-scope-input"></label>
      <label class="qb-field"><span>Guests receiving drinks</span><input id="qb-beverage-guests" type="number" min="1" max="2000" step="1" value="${q.beverageGuestCount || ''}" class="form-input qb-scope-input"></label>
      <label class="qb-field"><span>Service hours</span><input id="qb-service-hours" type="number" min="0.5" max="24" step="0.5" value="${q.serviceHours ?? ''}" class="form-input qb-scope-input"></label>
      <label class="qb-field"><span>Bartenders</span><input id="qb-modern-bartenders" type="number" min="1" max="30" step="1" value="${q.bartenders || ''}" class="form-input qb-scope-input"></label>
      <label class="qb-field"><span>Alcoholic service?</span>${yesNo('qb-alcohol',q.alcoholicService)}</label>
      <label class="qb-field"><span>Mocktails?</span>${yesNo('qb-mocktails',q.mocktailService)}</label>
      <label class="qb-field"><span>Water / NA station?</span>${yesNo('qb-water',q.waterStation)}</label>
      <label class="qb-field"><span>Built-in bar?</span>${yesNo('qb-built-in-bar',q.hasBuiltInBar)}</label>
      <label class="qb-field"><span>Cocktail count</span><input id="qb-cocktail-count" type="number" min="0" max="10" step="1" value="${q.cocktailCount == null ? '' : q.cocktailCount}" class="form-input qb-scope-input"></label>
      <label class="qb-field"><span>Cocktail complexity</span><select id="qb-cocktail-complexity" class="form-select qb-scope-input"><option value="">Confirm…</option>${['simple','standard','complex'].map(v=>`<option value="${v}" ${q.cocktailComplexity===v?'selected':''}>${v}</option>`).join('')}</select></label>
      <label class="qb-field"><span>Travel area</span><select id="qb-travel-area" class="form-select qb-scope-input">${['local','nearby','extended','park_city'].map(v=>`<option value="${v}" ${q.travelArea===v?'selected':''}>${v.replace('_',' ')}</option>`).join('')}</select></label>
      <label class="qb-field"><span>Included gratuity %</span><input id="qb-gratuity" type="number" min="0" max="30" step="1" value="${q.gratuityPct ?? 0}" class="form-input qb-scope-input"></label>
    </div><div class="text-muted" style="font-size:11px;margin-top:8px">Disposable cups are included automatically. Alcohol remains client-provided.</div>
  </div>`;
}

function savedDeterministicBreakdownHTML(q = {}) {
  if (q.pricingModelVersion !== DETERMINISTIC_PRICING_VERSION || !q.pricingSnapshot) return '';
  const costs = q.pricingSnapshot.costs || {};
  const revenue = q.pricingSnapshot.revenue || {};
  const profit = q.pricingSnapshot.profit || {};
  const assumptions = q.pricingAssumptions || {};
  const costRows = [
    ['Bartender labor', costs.labor], ['Disposable cups', costs.disposableCups],
    ['Base consumables', costs.baseConsumables], ['Alcohol service', costs.alcoholicService],
    ['Mocktail service', costs.mocktailService], ['Water / NA station', costs.waterStation],
    ['Cocktail count', costs.cocktails], ['Cocktail complexity', costs.complexity],
    ['Equipment / mobile bar', costs.equipment], ['Travel', costs.travel]
  ].filter(([, value]) => Number(value) > 0);
  return `<div data-pricing-view="deterministic">
    <div class="text-muted" style="font-size:11px;margin-bottom:8px">Model ${DETERMINISTIC_PRICING_VERSION} · ${assumptions.beverageGuests || 0}/${assumptions.totalGuests || 0} beverage guests · ${assumptions.serviceHours || 0} hours · ${assumptions.bartenders || 0} bartender${assumptions.bartenders===1?'':'s'}</div>
    <div style="display:grid;grid-template-columns:1fr auto;row-gap:6px;font-size:13px">
      ${costRows.map(([label,value]) => `<div>${label}</div><div style="text-align:right">${moneyFmt(value)}</div>`).join('')}
      <div style="font-weight:700;border-top:1px solid var(--border);padding-top:5px">Operating cost</div><div style="text-align:right;font-weight:700;border-top:1px solid var(--border);padding-top:5px">${moneyFmt(costs.operatingCost)}</div>
      <div>Service price</div><div style="text-align:right">${moneyFmt(revenue.servicePrice)}</div>
      ${Number(revenue.gratuity)>0?`<div>Staff gratuity</div><div style="text-align:right">${moneyFmt(revenue.gratuity)}</div>`:''}
      <div style="font-weight:700">Operating profit</div><div style="text-align:right;font-weight:700">${moneyFmt(profit.dollars)} · ${Math.round(Number(profit.marginPct)||0)}%</div>
    </div>
  </div>`;
}

function budgetBadgeHTML(q, calc) {
  if (q.budgetValid && q.budgetTarget > 0) {
    const diff = calc.total - q.budgetTarget;
    let bg = 'rgba(34,197,94,0.15)', color = '#22c55e', label = `✓ Under budget by ${moneyFmt(-diff)}`;
    if (diff > 0 && diff / q.budgetTarget < 0.1) {
      bg = 'rgba(250,204,21,0.15)'; color = '#FACC15'; label = `⚠ ${moneyFmt(diff)} over budget`;
    } else if (diff > 0) {
      bg = 'rgba(224,82,82,0.15)'; color = '#E05252'; label = `${moneyFmt(diff)} over budget`;
    }
    return `<button type="button" id="qb-budget-info" class="badge" style="background:${bg};color:${color};border:none;cursor:pointer">${label} ⓘ</button>`;
  }
  if (q.budgetRaw) {
    return `<button type="button" id="qb-budget-info" class="badge" style="background:rgba(100,116,139,0.15);color:var(--text-muted);border:none;cursor:pointer">Budget unclear ⓘ</button>`;
  }
  return '';
}

function renderQuoteBuilder(containerId, lead, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const state = { q: makeInitialQuote(lead) };

  /* If the lead has a saved latest quote, hydrate the builder from it
   * instead of the lead-defaults. The user's last work is recoverable. */
  if (lead?.latestQuoteId) {
    db.collection('quotes').doc(lead.latestQuoteId).get().then(doc => {
      if (!doc.exists) return;
      const saved = doc.data();
      const li = saved.lineItems || {};
      /* Map NEW saved fields back. OLD saved quotes only have legacy fields
       * (bartenderRate/customMenuFee/etc.) — fall back to defaults so we never
       * crash, and best-effort approximate cost inputs from the legacy shape. */
      const legacyBartenderTotal = (li.serviceHours||0) * (li.bartenderRate||0) * (li.bartenders||0);
      const legacySupplies = (li.customMenuFee||0) + (li.offMenuEnabled ? (li.offMenuQty||0)*(li.offMenuPrice||0) : 0);
      state.q = hydrateQuotePricing(state.q, saved);
      Object.assign(state.q, {
        bartenders:     li.bartenders   ?? state.q.bartenders,
        bartenderPay:   li.bartenderPay ?? (li.bartenders ? Math.round(legacyBartenderTotal / li.bartenders) : state.q.bartenderPay),
        supplies:       li.supplies     ?? (legacySupplies || state.q.supplies),
        travel:         li.travel       ?? li.travelFee ?? state.q.travel,
        marginPct:      clampMargin(li.marginPct ?? state.q.marginPct),
        pricingKind:    li.pricingKind    ?? state.q.pricingKind,
        applyProfitCap: li.applyProfitCap ?? state.q.applyProfitCap,
        applyCorpFloor: li.applyCorpFloor ?? state.q.applyCorpFloor,
        guestCount:     li.guestCount     ?? state.q.guestCount,
        eventDate:      saved.eventDate    ?? state.q.eventDate,
        venue:          saved.venue        ?? state.q.venue,
        lineItems:      Array.isArray(li.custom) ? [...li.custom] : state.q.lineItems,
        discountType:   saved.discountType ?? state.q.discountType,
        discountValue:  saved.discountValue ?? state.q.discountValue,
        depositPct:     saved.depositPct  ?? state.q.depositPct,
        totalOverride:  saved.totalOverride ?? null,
        notes:          saved.notes || '',
        proposal:       saved.proposal ? { ...state.q.proposal, ...saved.proposal } : state.q.proposal
      });
      state.priorQuoteId = lead.latestQuoteId;
      state.priorStatus = saved.status;
      render();
    }).catch(e => console.warn('Load saved quote failed:', e));
  }

  function render() {
    const q = state.q;
    const calc = calcQuote(q);
    const marginColor = calc.marginPct >= 50 ? '#22c55e' : calc.marginPct >= 35 ? '#FACC15' : '#E05252';
    const readiness = buildQuoteReadiness(q, lead || {});
    const guidance = buildQuoteGuidance(q, lead || {});

    container.innerHTML = `
      <div class="qb-wrap" style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:12px;padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;flex-wrap:wrap">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--gold)">💰 Quote builder</div>
          <div id="qb-budget-slot">${budgetBadgeHTML(q, calc)}</div>
        </div>

        <div id="qb-readiness-slot">${renderReadinessHTML(readiness)}</div>
        <div id="qb-guidance-slot">${q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION ? '' : renderGuidanceHTML(guidance, readiness.drinkPlan)}</div>

        <div id="qb-insights-slot">${q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION ? '<div class="text-muted" style="font-size:11px;margin-bottom:10px">Modern pricing is driven by confirmed scope; historical target overrides are disabled.</div>' : ''}</div>

        <!-- COST INPUTS -->
        ${q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION ? modernScopeControlsHTML(q) : `<div class="qb-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
          <label class="qb-field"><span>Bartenders</span>
            <input type="number" min="0" step="1" id="qb-bartenders" value="${q.bartenders}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Flat pay per bartender ($)</span>
            <input type="number" min="0" step="25" id="qb-pay" value="${q.bartenderPay}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Supplies ($)</span>
            <input type="number" min="0" step="25" id="qb-supplies" value="${q.supplies}" class="form-input qb-input"></label>
          <label class="qb-field"><span>Travel ($)</span>
            <input type="number" min="0" step="25" id="qb-travel" value="${q.travel}" class="form-input qb-input"></label>
        </div>`}

        <!-- MARGIN -->
        ${q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION ? '' : `<div style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted)">Target margin</div>
            <div id="qb-margin-label" style="font-size:13px;font-weight:700;color:var(--gold)">${Math.round(calc.effectiveMargin)}% · ${moneyFmt(calc.profit)} profit</div>
          </div>
          <input type="range" id="qb-margin" min="${QUOTE_MARGIN_MIN}" max="${QUOTE_MARGIN_MAX}" step="1" value="${clampMargin(q.marginPct)}" style="width:100%;accent-color:var(--gold)">
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="qb-margin-preset btn btn-ghost" data-margin="35" data-kind="private" style="padding:2px 10px;font-size:11px">35%</button>
            <button type="button" class="qb-margin-preset btn btn-ghost" data-margin="37" data-kind="wedding" style="padding:2px 10px;font-size:11px">37%</button>
            <button type="button" class="qb-margin-preset btn btn-ghost" data-margin="40" data-kind="corporate" style="padding:2px 10px;font-size:11px">40%</button>
          </div>
          <div class="text-muted" style="font-size:11px;margin-top:6px;line-height:1.5">Keep the quote inside a 35-40% admin margin band. Corporate pricing still has its own profit floor.</div>
        </div>`}

        <!-- USER-DEFINED LINE ITEMS -->
        ${q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION ? '' : `<div style="margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px">
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
        </div>`}

        <!-- PROPOSAL GENERATOR -->
        <div style="margin-top:14px;padding:12px;border:1px solid rgba(139,155,126,0.35);border-radius:10px;background:rgba(139,155,126,0.06)">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <div>
              <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--teal-lt)">Proposal generator</div>
              <div class="text-muted" style="font-size:11px;margin-top:2px">Builds the client-facing quote from your saved examples: plan, investment, dry-hire note, menu, next steps.</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <select id="qb-proposal-style" class="form-select" style="width:auto;min-width:150px;padding:5px 8px;font-size:12px">
                ${Object.entries(PROPOSAL_TEMPLATE_PRESETS).map(([key, preset]) => `<option value="${key}" ${proposalField(q, 'style')===key?'selected':''}>${preset.label}</option>`).join('')}
              </select>
              <button type="button" id="qb-proposal-preset" class="btn btn-ghost btn-sm">Apply</button>
            </div>
          </div>
          <div class="qb-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">
            <label class="qb-field"><span>Proposal title</span>
              <input type="text" id="qb-prop-title" value="${escapeHtmlSafe(proposalField(q, 'eventTitle'))}" class="form-input qb-proposal-input"></label>
            <label class="qb-field"><span>Service window</span>
              <input type="text" id="qb-prop-window" value="${escapeHtmlSafe(proposalField(q, 'serviceWindow'))}" placeholder="5:00 PM - 9:00 PM" class="form-input qb-proposal-input"></label>
          </div>
          <label class="qb-field" style="margin-top:8px"><span>Plan</span>
            <textarea id="qb-prop-plan" class="form-input qb-proposal-input" style="min-height:66px;resize:vertical">${escapeHtmlSafe([proposalField(q, 'arrivalPlan'), proposalField(q, 'servicePlan')].filter(Boolean).join('\n'))}</textarea></label>
          <label class="qb-field" style="margin-top:8px"><span>Menu / signature cocktails</span>
            <textarea id="qb-prop-menu" class="form-input qb-proposal-input" style="min-height:76px;resize:vertical">${escapeHtmlSafe(proposalField(q, 'menuText'))}</textarea></label>
          <label class="qb-field" style="margin-top:8px"><span>Dry-hire alcohol note</span>
            <textarea id="qb-prop-alcohol" class="form-input qb-proposal-input" style="min-height:56px;resize:vertical">${escapeHtmlSafe(proposalField(q, 'alcoholNote'))}</textarea></label>
          <label class="qb-field" style="margin-top:8px"><span>Next steps</span>
            <textarea id="qb-prop-next" class="form-input qb-proposal-input" style="min-height:56px;resize:vertical">${escapeHtmlSafe(proposalField(q, 'nextSteps'))}</textarea></label>
          <div style="margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap">
            <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted)">Generated copy preview</div>
            <button type="button" id="qb-copy-proposal" class="btn btn-secondary btn-sm">Copy proposal</button>
          </div>
          <pre id="qb-proposal-preview" class="qb-proposal-preview">${generatedProposalPreviewHTML(q, calc)}</pre>
        </div>

        <!-- DISCOUNT -->
        ${q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION ? '' : `<div style="margin-top:14px">
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
        </div>`}

        <!-- TOTALS STRIP -->
        <div style="margin-top:14px;padding:12px;background:linear-gradient(135deg,rgba(201,168,76,0.10),rgba(139,155,126,0.08));border:1px solid rgba(201,168,76,0.35);border-radius:10px">
          <div id="qb-totals-grid" style="display:grid;grid-template-columns:1fr auto;row-gap:4px;font-size:13px">${totalsGridHTML(q, calc)}</div>

          <!-- TOP-DOWN OVERRIDE -->
          ${q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION ? '' : `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap">
              <input type="checkbox" id="qb-override-on" ${calc.hasOverride?'checked':''}>
              <span>Set my own total — I know the number, fit the line items to it</span>
              ${calc.hasOverride?`<input type="number" min="0" step="50" id="qb-override-val" value="${q.totalOverride}" class="form-input" style="flex:0 0 120px;padding:4px 8px;font-size:13px">`:''}
            </label>
          </div>`}

          <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:12px">
            <span class="text-muted">Est. profit (admin only)</span>
            <span id="qb-margin-line" style="color:${marginColor};font-weight:700">${moneyFmt(calc.profit)} · ${Math.round(calc.marginPct)}% margin</span>
          </div>
        </div>

        <!-- NOTES -->
        <textarea id="qb-notes" placeholder="Internal/client notes (optional)…" class="form-input" style="margin-top:12px;width:100%;min-height:50px;font-size:13px">${q.notes}</textarea>

        <!-- ACTIONS -->
        <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-secondary btn-sm" id="qb-save">💾 Save draft</button>
          <button class="btn btn-primary btn-sm" id="qb-lock" ${readiness.canLock ? '' : 'disabled title="Complete the readiness checks before locking"'}>🔒 Lock in price</button>
          <button class="btn btn-primary btn-sm" id="qb-send" style="background:#22c55e;border-color:#22c55e" ${readiness.canSend ? '' : 'disabled title="Complete the readiness checks before sending"'}>📤 Send proposal</button>
          <button class="btn btn-ghost btn-sm" id="qb-copy">📋 Copy text</button>
        </div>
        <div class="text-muted" style="font-size:11px;margin-top:6px;line-height:1.5">
          <strong>Lock</strong> = final number (no stage change). <strong>Send</strong> = deliver to the client and move the lead to <em>Proposal Sent</em>.
        </div>
        <div id="qb-history" style="margin-top:14px"></div>
      </div>
    `;

    /* Wire inputs — numeric/text fields call repaintTotals() (NO full
     * re-render, so the field keeps focus and the cursor stays put while
     * you type). Only structural changes call render(). */
    container.querySelectorAll('.qb-input').forEach(el => {
      el.addEventListener('input', () => { readFieldsIntoState(); repaintTotals(); });
    });
    container.querySelectorAll('.qb-scope-input').forEach(el => {
      el.addEventListener('input', () => { readFieldsIntoState(); repaintTotals(); });
      el.addEventListener('change', () => { readFieldsIntoState(); repaintTotals(); });
    });
    container.querySelector('#qb-margin')?.addEventListener('input', (e) => {
      state.q.marginPct = clampMargin(parseFloat(e.target.value) || 0);
      repaintTotals();
    });
    container.querySelectorAll('.qb-margin-preset').forEach(b => {
      b.addEventListener('click', () => {
        state.q.marginPct = clampMargin(parseFloat(b.dataset.margin) || state.q.marginPct);
        state.q.pricingKind = b.dataset.kind;
        if (b.dataset.kind === 'corporate') {
          state.q.applyProfitCap = false;
          state.q.applyCorpFloor = true;
        } else {
          state.q.applyProfitCap = true;
          state.q.applyCorpFloor = false;
        }
        render();
      });
    });
    container.querySelector('#qb-disctype')?.addEventListener('change', (e) => { state.q.discountType = e.target.value; repaintTotals(); });
    container.querySelector('#qb-discval')?.addEventListener('input', (e) => { state.q.discountValue = parseFloat(e.target.value) || 0; repaintTotals(); });
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
        if (f === 'price') {
          state.q.lineItems[i].price = parseFloat(el.value) || 0;
          repaintTotals();
        } else {
          state.q.lineItems[i].label = el.value;
          /* label change doesn't affect totals — no repaint needed,
           * which also means cursor stays put. */
        }
      });
    });
    container.querySelectorAll('[data-li-rm]').forEach(b => {
      b.addEventListener('click', () => {
        state.q.lineItems.splice(+b.dataset.liRm, 1);
        render();
      });
    });
    container.querySelector('#qb-proposal-preset')?.addEventListener('click', () => {
      const style = container.querySelector('#qb-proposal-style')?.value || 'simple';
      setProposalPreset(state.q, style);
      render();
      showToast(`Loaded ${PROPOSAL_TEMPLATE_PRESETS[style]?.label || 'proposal'} template`);
    });
    container.querySelector('#qb-proposal-style')?.addEventListener('change', (e) => {
      state.q.proposal = { ...(state.q.proposal || {}), style: e.target.value };
      repaintTotals();
    });
    container.querySelectorAll('.qb-proposal-input').forEach(el => {
      el.addEventListener('input', () => {
        readProposalIntoState();
        repaintTotals();
      });
    });
    container.querySelector('#qb-copy-proposal')?.addEventListener('click', () => {
      readProposalIntoState();
      copyToClipboard(generateProposalText(state.q, calcQuote(state.q)));
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
      repaintTotals();
    });
    /* When the user finishes typing a target, auto-distribute across line
     * items using their historical breakdown ratios (if we have them). */
    container.querySelector('#qb-override-val')?.addEventListener('change', (e) => {
      const target = parseFloat(e.target.value) || 0;
      if (target > 0 && state.insights?.ratios) {
        distributeToTarget(state.q, target, state.insights.ratios);
        render();
        showToast(`Auto-distributed line items to hit ${moneyFmt(target)}`);
      }
    });

    /* Budget badge sits inside #qb-budget-slot which gets repainted by
     * repaintTotals(); delegate the click so it survives repaints. */
    container.querySelector('#qb-budget-slot')?.addEventListener('click', (e) => {
      if (e.target.closest('#qb-budget-info')) {
        showBudgetMath(state.q, calcQuote(state.q));
      }
    });
    container.querySelector('#qb-notes')?.addEventListener('input', (e) => { state.q.notes = e.target.value; });
    container.querySelector('#qb-guidance-slot')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-guidance-action], #qb-use-drink-direction');
      if (!btn) return;
      if (btn.id === 'qb-use-drink-direction') {
        const plan = buildDrinkRecommendations(state.q);
        state.q.proposal = {
          ...(state.q.proposal || {}),
          drinkPlan: plan,
          menuText: plan.menuText
        };
        render();
        showToast('Applied suggested drink direction');
        return;
      }
      const action = btn.dataset.guidanceAction;
      const value = parseFloat(btn.dataset.guidanceValue) || 0;
      if (action === 'pay') state.q.bartenderPay = value;
      if (action === 'supplies') state.q.supplies = value;
      if (action === 'travel') state.q.travel = value;
      repaintTotals();
    });

    container.querySelector('#qb-save')?.addEventListener('click', () => saveQuote('draft'));
    container.querySelector('#qb-lock')?.addEventListener('click', () => saveQuote('locked'));
    container.querySelector('#qb-send')?.addEventListener('click', () => openSendProposalMenu(calc));
    container.querySelector('#qb-copy')?.addEventListener('click', () => {
      readProposalIntoState();
      copyToClipboard(quoteText(state.q, calcQuote(state.q)));
    });

    loadHistory();
    loadInsights();
  }

  /* Fetches & renders the "from your history" panel. Cached on state so we
   * don't re-query Firestore on every render. Refresh by clearing
   * state.insights before calling. */
  async function loadInsights() {
    const slot = document.getElementById('qb-insights-slot');
    if (!slot) return;
    if (state.q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION) return;
    if (state.insights === undefined) {
      slot.innerHTML = `<div class="text-muted" style="font-size:11px;padding:6px 0">Loading history…</div>`;
      try {
        state.insights = await findSimilarQuotes({
          eventType: lead?.eventType,
          guestCount: state.q.guestCount,
          leadId: state.q.leadId
        });
      } catch (e) {
        console.warn(e); state.insights = emptyInsights();
      }
    }
    const ins = state.insights;
    if (!ins || ins.sampleSize === 0) {
      slot.innerHTML = `<div style="font-size:11px;color:var(--text-muted);padding:6px 10px;background:rgba(255,255,255,0.02);border:1px dashed var(--border);border-radius:8px;margin-bottom:12px">📊 No similar past quotes yet — once you've quoted 3–5 more events like this, suggestions will appear here.</div>`;
      return;
    }
    const acceptColor = ins.acceptRate >= 0.6 ? '#22c55e' : ins.acceptRate >= 0.3 ? '#FACC15' : '#E05252';
    slot.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(59,130,246,0.10),rgba(168,85,247,0.08));border:1px solid rgba(59,130,246,0.30);border-radius:10px;padding:10px 12px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:#A8B5D9">📊 Your similar quotes</div>
          <div style="font-size:11px;color:var(--text-muted)">
            ${ins.sampleSize} found${ins.acceptedSize?` · <span style="color:${acceptColor};font-weight:700">${Math.round(ins.acceptRate*100)}% accepted</span>`:''}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;text-align:center">
          <div><div style="font-size:10px;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase">Min</div><div style="font-size:14px;font-weight:600">${moneyFmt(ins.min)}</div></div>
          <div><div style="font-size:10px;color:var(--gold);letter-spacing:.08em;text-transform:uppercase;font-weight:700">Median</div><div style="font-size:18px;font-weight:700;color:var(--gold)">${moneyFmt(ins.median)}</div></div>
          <div><div style="font-size:10px;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase">Max</div><div style="font-size:14px;font-weight:600">${moneyFmt(ins.max)}</div></div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button type="button" id="qb-use-median" class="btn btn-secondary btn-sm" style="flex:1;font-size:12px;padding:6px 8px">Use ${moneyFmt(ins.median)} as target ${ins.ratios?' + auto-fill':''}</button>
        </div>
        ${ins.ratios ? `<div style="font-size:10px;color:var(--text-muted);margin-top:6px;line-height:1.5">
          Typical breakdown: ${Math.round(ins.ratios.bartender*100)}% labor · ${Math.round(ins.ratios.supplies*100)}% supplies · ${Math.round(ins.ratios.travel*100)}% travel${ins.ratios.custom>0.02?` · ${Math.round(ins.ratios.custom*100)}% extras`:''}
        </div>` : ''}
      </div>
    `;
    document.getElementById('qb-use-median')?.addEventListener('click', () => {
      const target = ins.median;
      state.q.totalOverride = target;
      if (ins.ratios) distributeToTarget(state.q, target, ins.ratios);
      render();
      showToast(`Set target to ${moneyFmt(target)}${ins.ratios?' + auto-distributed line items':''}`);
    });
  }

  /* Read every numeric/text input into state.q WITHOUT touching the DOM.
   * Called on every keystroke so the source of truth stays in sync, but
   * the focused input is never destroyed. */
  function readFieldsIntoState() {
    const q = state.q;
    const v = (id, fn = parseFloat) => {
      const el = document.getElementById(id);
      if (!el) return undefined;
      const n = fn(el.value);
      return isNaN(n) ? 0 : n;
    };
    q.bartenders      = v('qb-bartenders', s => parseInt(s, 10)) ?? q.bartenders;
    q.bartenderPay    = v('qb-pay') ?? q.bartenderPay;
    q.supplies        = v('qb-supplies') ?? q.supplies;
    q.travel          = v('qb-travel') ?? q.travel;
    const nullableNumber = (id) => {
      const el = document.getElementById(id);
      if (!el) return undefined;
      if (el.value === '') return null;
      const number = Number(el.value);
      return Number.isFinite(number) ? number : null;
    };
    const nullableBool = (id) => {
      const el = document.getElementById(id);
      if (!el) return undefined;
      return el.value === '' ? null : el.value === 'true';
    };
    if (q.pricingModelVersion === DETERMINISTIC_PRICING_VERSION) {
      q.eventType = document.getElementById('qb-event-type')?.value.trim() || '';
      q.venue = document.getElementById('qb-venue')?.value.trim() || '';
      const totalGuests = nullableNumber('qb-total-guests');
      const beverageGuests = nullableNumber('qb-beverage-guests');
      const serviceHours = nullableNumber('qb-service-hours');
      const bartenders = nullableNumber('qb-modern-bartenders');
      if (totalGuests !== undefined) q.guestCount = totalGuests;
      if (beverageGuests !== undefined) q.beverageGuestCount = beverageGuests;
      if (serviceHours !== undefined) q.serviceHours = serviceHours;
      if (bartenders !== undefined) q.bartenders = bartenders;
      q.alcoholicService = nullableBool('qb-alcohol');
      q.mocktailService = nullableBool('qb-mocktails');
      q.waterStation = nullableBool('qb-water');
      q.hasBuiltInBar = nullableBool('qb-built-in-bar');
      q.cocktailCount = nullableNumber('qb-cocktail-count');
      q.cocktailComplexity = document.getElementById('qb-cocktail-complexity')?.value || '';
      q.travelArea = document.getElementById('qb-travel-area')?.value || null;
      q.gratuityPct = nullableNumber('qb-gratuity') ?? 0;
      q.deterministicPricing = buildDeterministicPricing(q);
    }
    const marginEl = document.getElementById('qb-margin');
    if (marginEl) q.marginPct = clampMargin(parseFloat(marginEl.value) || q.marginPct);
    const discEl = document.getElementById('qb-discval');
    if (discEl) q.discountValue = parseFloat(discEl.value) || 0;
  }

  function readProposalIntoState() {
    const plan = document.getElementById('qb-prop-plan')?.value || '';
    const planLines = plan.split(/\n+/).map(s => s.trim()).filter(Boolean);
    state.q.proposal = {
      ...(state.q.proposal || {}),
      style: document.getElementById('qb-proposal-style')?.value || state.q.proposal?.style || 'simple',
      eventTitle: document.getElementById('qb-prop-title')?.value || '',
      serviceWindow: document.getElementById('qb-prop-window')?.value || '',
      arrivalPlan: planLines[0] || '',
      servicePlan: planLines.slice(1).join('\n') || '',
      menuText: document.getElementById('qb-prop-menu')?.value || '',
      alcoholNote: document.getElementById('qb-prop-alcohol')?.value || '',
      nextSteps: document.getElementById('qb-prop-next')?.value || ''
    };
  }

  /* Surgical UI refresh — touches only the parts that depend on calc.
   * No focus loss, no scroll jump. */
  function repaintTotals() {
    const calc = calcQuote(state.q);
    const readiness = buildQuoteReadiness(state.q, lead || {});
    const guidance = buildQuoteGuidance(state.q, lead || {});
    const totals = document.getElementById('qb-totals-grid');
    if (totals) totals.innerHTML = totalsGridHTML(state.q, calc);
    const slot = document.getElementById('qb-budget-slot');
    if (slot) slot.innerHTML = budgetBadgeHTML(state.q, calc);
    const readinessSlot = document.getElementById('qb-readiness-slot');
    if (readinessSlot) readinessSlot.innerHTML = renderReadinessHTML(readiness);
    const guidanceSlot = document.getElementById('qb-guidance-slot');
    if (guidanceSlot) guidanceSlot.innerHTML = renderGuidanceHTML(guidance, readiness.drinkPlan);
    const marginLabel = document.getElementById('qb-margin-label');
    if (marginLabel) marginLabel.textContent = `${Math.round(calc.effectiveMargin)}% · ${moneyFmt(calc.profit)} profit`;
    const margin = document.getElementById('qb-margin-line');
    if (margin) {
      const c = calc.marginPct >= 50 ? '#22c55e' : calc.marginPct >= 35 ? '#FACC15' : '#E05252';
      margin.style.color = c;
      margin.textContent = `${moneyFmt(calc.profit)} · ${Math.round(calc.marginPct)}% margin`;
    }
    const lockBtn = document.getElementById('qb-lock');
    if (lockBtn) {
      lockBtn.disabled = !readiness.canLock;
      lockBtn.title = readiness.canLock ? '' : 'Complete the readiness checks before locking';
    }
    const sendBtn = document.getElementById('qb-send');
    if (sendBtn) {
      sendBtn.disabled = !readiness.canSend;
      sendBtn.title = readiness.canSend ? '' : 'Complete the readiness checks before sending';
    }
    const preview = document.getElementById('qb-proposal-preview');
    if (preview) preview.textContent = generateProposalText(state.q, calc);
  }

  /* Save a quote at the given status.
   *
   * Save semantics (no orphan docs):
   *   • Draft or Locked: UPDATE the prior doc if it exists and is itself
   *     draft/locked. Otherwise create a new doc.
   *   • Sent / Accepted: never overwrite. Always create a new version so
   *     history is preserved.
   *
   * Lock does NOT change the lead stage — only Send does. */
  async function saveQuote(status, sendMeta = null) {
    readFieldsIntoState();
    readProposalIntoState();
    const calc = calcQuote(state.q);
    if ((status === 'locked' || status === 'sent') && !state.q.leadId) {
      alert('Link a lead before locking or sending the quote.');
      return null;
    }
    if (status === 'locked' || status === 'sent') {
      const readiness = buildQuoteReadiness(state.q, lead || {});
      if (!readiness.canLock) {
        openModal('Quote not ready', `
          <div style="font-size:13px;line-height:1.5">
            <p class="text-muted" style="margin-bottom:12px">Finish the required fields before you lock or send this quote.</p>
            ${renderReadinessHTML(readiness)}
          </div>
        `, { wide: true });
        return null;
      }
    }
    const now = TS();
    const me = currentUser?.displayName || currentUser?.email || 'Admin';

    /* The data that always overwrites on save */
    const modernSnapshot = buildPricingSnapshot(state.q, calc);
    const payload = {
      leadId: state.q.leadId,
      leadName: state.q.leadName,
      eventType: state.q.eventType,
      eventDate: state.q.eventDate,
      venue: state.q.venue,
      lineItems: {
        bartenders: state.q.bartenders,
        bartenderPay: state.q.bartenderPay,
        supplies: state.q.supplies,
        travel: state.q.travel,
        marginPct: state.q.marginPct,
        pricingKind: state.q.pricingKind,
        applyProfitCap: state.q.applyProfitCap,
        applyCorpFloor: state.q.applyCorpFloor,
        guestCount: state.q.guestCount,
        custom: [...(state.q.lineItems || [])]
      },
      totalOverride: state.q.totalOverride,
      computedTotal: calc.computedTotal,
      targetAdjustment: calc.targetAdjustment,
      subtotal: calc.subtotal,
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
      proposal: {
        ...(state.q.proposal || {}),
        generatedText: generateProposalText(state.q, calc)
      },
      status,
      expiresAt: new Date(Date.now() + QUOTE_DEFAULTS.quoteExpiryDays * 86400000).toISOString().slice(0,10),
      updatedAt: now,
      updatedBy: me
    };
    if (modernSnapshot) Object.assign(payload, modernSnapshot);
    if (status === 'locked') payload.lockedAt = now;
    if (status === 'sent') {
      payload.lockedAt = now;
      payload.sentAt = now;
      payload.sentBy = me;
      if (sendMeta) payload.sentVia = sendMeta;
    }

    try {
      /* Reuse-existing-doc rule: only when the prior doc is itself draft or
       * locked AND we're saving as draft or locked. Sent/accepted always
       * forks to a new version. */
      const canReuse = state.priorQuoteId
        && (state.priorStatus === 'draft' || state.priorStatus === 'locked')
        && (status === 'draft' || status === 'locked');

      let quoteId;
      if (canReuse) {
        await db.collection('quotes').doc(state.priorQuoteId).update(payload);
        quoteId = state.priorQuoteId;
      } else {
        payload.createdAt = now;
        payload.createdBy = me;
        const ref = await db.collection('quotes').add(payload);
        quoteId = ref.id;
      }

      /* Track the now-current quote in the in-memory state so the next save
       * targets the same doc instead of creating yet another version. */
      state.priorQuoteId = quoteId;
      state.priorStatus = status;

      const action = status === 'sent' ? 'quote_sent' : status === 'locked' ? 'quote_locked' : 'quote_saved';
      const verb = canReuse ? 'Updated' : (status === 'sent' ? 'Sent' : status === 'locked' ? 'Locked' : 'Saved');
      logActivity(action, 'quotes', quoteId,
        `${verb} quote for ${state.q.leadName || 'lead'} — ${moneyFmt(calc.total)}${sendMeta ? ' via ' + sendMeta : ''}`,
        { total: calc.total, leadId: state.q.leadId, reusedDoc: canReuse });

      /* Mirror summary on the lead. Only Send moves the stage. */
      if (state.q.leadId) {
        const update = {
          latestQuoteId: quoteId,
          latestQuoteTotal: calc.total,
          latestQuoteStatus: status,
          updatedAt: now
        };
        if (status === 'sent') update.stage = 'Proposal Sent';
        await db.collection('leads').doc(state.q.leadId).update(update);
      }
      const toast = status === 'sent' ? '📤 Marked as sent — stage moved to Proposal Sent'
                  : status === 'locked' ? (canReuse ? '🔒 Price locked' : '🔒 New version locked')
                  : (canReuse ? 'Draft updated' : 'Draft saved');
      showToast(toast);
      loadHistory();
      return quoteId;
    } catch (err) {
      console.error('Save quote failed:', err);
      alert('Could not save quote — see console.');
      return null;
    }
  }

  /* Send-proposal chooser. Saves a quote first (so we have an ID for the
   * public link), then offers delivery methods that include the link.
   * Client opens the link, accepts inline, and the quote auto-flips to
   * 'accepted' — that's the "agreement" step the user asked for. */
  async function openSendProposalMenu(calc) {
    if (!state.q.leadId) { alert('Link a lead before sending.'); return; }
    readProposalIntoState();
    calc = calcQuote(state.q);
    const readiness = buildQuoteReadiness(state.q, lead || {});
    if (!readiness.canSend) {
      openModal('Quote not ready', `
        <div style="font-size:13px;line-height:1.5">
          <p class="text-muted" style="margin-bottom:12px">Finish the required fields before sending the proposal.</p>
          ${renderReadinessHTML(readiness)}
        </div>
      `, { wide: true });
      return;
    }
    const email = options.leadEmail || lead?.email || '';
    const phone = (lead?.phone || '').replace(/\D/g, '');

    /* Save the quote with status='locked' so we have an ID and a frozen
     * snapshot. If the user has already saved, reuse the prior ID instead
     * of creating yet another version. */
    let quoteId;
    try {
      quoteId = await persistCurrentQuoteBeforeSend(saveQuote);
    } catch (error) {
      console.error(error);
      return;
    }
    calc = calcQuote(state.q);
    const shareUrl = `https://lakesalt.us/quote?id=${quoteId}`;
    const text = quoteText(state.q, calc);

    const subject = `Lake Salt — Your event quote (${moneyFmt(calc.total)})`;
    const firstName = (state.q.leadName || '').split(' ')[0] || 'there';
    const emailBody =
`Hi ${firstName},

Thanks for considering Lake Salt for your event. I put together a custom proposal — full breakdown, total, and a one-click accept button:

${shareUrl}

Quick highlights:
• ${state.q.bartenders} professional bartender${state.q.bartenders===1?'':'s'}
• Custom drink menu (cocktails + mocktails) · alcohol not included
• Total: ${moneyFmt(calc.total)} · ${state.q.depositPct}% deposit (${moneyFmt(calc.deposit)}) holds your date

Proposal copy:
${text}

Have questions before you decide? Just reply — happy to talk it through.

— Kendell
Lake Salt Bartending
lakesalt.us`;

    const smsBody =
`Lake Salt — your quote is ready: ${moneyFmt(calc.total)} for ${state.q.bartenders} bartender${state.q.bartenders===1?'':'s'}.

Full proposal + one-tap accept: ${shareUrl}

— Kendell`;

    openModal('Send proposal', `
      <p class="text-muted" style="font-size:13px;line-height:1.5;margin-bottom:8px">
        Quote saved. Share the link below — your client opens it, sees the full proposal, and can <strong>accept inline by typing their name</strong>. Acceptance fires back to your dashboard and locks the date.
      </p>
      <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:8px;padding:10px 12px;margin-bottom:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="text" readonly value="${shareUrl}" id="sp-link" class="form-input" style="flex:1;min-width:180px;font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:6px 10px;background:rgba(255,255,255,0.6);color:var(--charcoal)">
        <button class="btn btn-secondary btn-sm" id="sp-copylink">Copy link</button>
        <a class="btn btn-ghost btn-sm" href="${shareUrl}" target="_blank" rel="noopener">Preview ↗</a>
      </div>

      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:6px">Send it</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary" id="sp-email" ${email?'':'disabled'} style="text-align:left;padding:12px 14px">
          ✉ Open email draft ${email?`<span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">→ ${email}</span>`:'<span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">(no email on lead)</span>'}
        </button>
        <button class="btn btn-secondary" id="sp-sms" ${phone?'':'disabled'} style="text-align:left;padding:12px 14px">
          💬 Open SMS draft ${phone?`<span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">→ ${phone}</span>`:'<span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">(no phone on lead)</span>'}
        </button>
        <button class="btn btn-ghost" id="sp-cowork" style="text-align:left;padding:12px 14px">
          🤖 Copy a Cowork prompt <span class="text-muted" style="font-weight:400;font-size:12px;margin-left:6px">(paste into lake-salt-comms agent for auto-send)</span>
        </button>
      </div>

      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted);line-height:1.5">
        After any of these, click <strong>Mark as sent</strong> to move the lead to <em>Proposal Sent</em> and log the activity.
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn btn-primary" id="sp-confirm" style="background:#22c55e;border-color:#22c55e;flex:1">✓ Mark as sent</button>
        <button class="btn btn-ghost" id="sp-cancel">Cancel</button>
      </div>
    `, { wide: false });

    let chosenMethod = null;
    document.getElementById('sp-copylink').addEventListener('click', () => {
      copyToClipboard(shareUrl);
    });
    document.getElementById('sp-email').addEventListener('click', () => {
      chosenMethod = 'email';
      const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      window.location.href = url;
    });
    document.getElementById('sp-sms').addEventListener('click', () => {
      chosenMethod = 'sms';
      window.location.href = `sms:${phone}?&body=${encodeURIComponent(smsBody)}`;
    });
    document.getElementById('sp-cowork').addEventListener('click', () => {
      chosenMethod = 'cowork';
      const prompt = `Send a quote-ready email to ${state.q.leadName} at ${email || phone || '[no contact info]'}.

Subject: ${subject}

Use a warm, professional tone in Kendell's voice. Sign as "Kendell · Lake Salt Bartending". Use this body:

${emailBody}

The link in the email lets the client accept the quote with one click.`;
      copyToClipboard(prompt);
      showToast('Cowork prompt copied — paste it into lake-salt-comms');
    });
    document.getElementById('sp-cancel').addEventListener('click', () => { if (typeof closeModal==='function') closeModal(); });
    document.getElementById('sp-confirm').addEventListener('click', async () => {
      if (!chosenMethod) {
        if (!confirm('You haven\'t picked a delivery method yet — mark sent anyway?')) return;
        chosenMethod = 'manual';
      }
      /* Update the saved quote to status='sent' instead of creating a new one. */
      try {
        await db.collection('quotes').doc(quoteId).update({
          status: 'sent',
          sentAt: TS(),
          sentBy: currentUser?.displayName || currentUser?.email || 'Admin',
          sentVia: chosenMethod
        });
        if (state.q.leadId) {
          await db.collection('leads').doc(state.q.leadId).update({
            latestQuoteStatus: 'sent',
            stage: 'Proposal Sent',
            updatedAt: TS()
          });
        }
        logActivity('quote_sent', 'quotes', quoteId, `Sent quote to ${state.q.leadName} via ${chosenMethod} — ${moneyFmt(calc.total)}`, { leadId: state.q.leadId });
        showToast('📤 Marked as sent — stage moved to Proposal Sent');
      } catch (e) {
        console.error(e); alert('Could not mark sent — see console.');
      }
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

    /* Wire row clicks → view-quote modal */
    setTimeout(() => {
      document.querySelectorAll('.quote-row').forEach(row => {
        row.addEventListener('click', () => openQuoteViewModal(row.dataset.id));
      });
    }, 0);

    /* List */
    const listEl = document.getElementById('quotes-list');
    if (!list.length) { listEl.innerHTML = '<div class="text-muted" style="padding:12px;font-size:13px">No quotes yet. Click "+ New quote" to start.</div>'; return; }
    listEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:10px;align-items:center;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);padding:6px 8px;border-bottom:1px solid var(--border)">
        <div>Lead</div><div>Status</div><div style="text-align:right">Total</div><div style="text-align:right">When</div><div></div>
      </div>
      ${list.map(q => {
        const when = q.createdAt?.toDate ? q.createdAt.toDate().toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
        const status = q.clientAcceptedAt ? 'accepted' : (q.status || 'draft');
        const statusColor = status==='accepted'?'#22c55e':status==='locked'?'#FACC15':status==='sent'?'#3b82f6':status==='expired'?'#E05252':'var(--text-muted)';
        return `<div class="quote-row" data-id="${q.id}" style="display:grid;grid-template-columns:1fr auto auto auto auto;gap:10px;align-items:center;padding:10px 8px;border-bottom:1px solid var(--border);font-size:13px;cursor:pointer">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${q.leadName || '(unlinked)'}</div>
          <div style="text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:${statusColor};font-weight:700">${status}</div>
          <div style="text-align:right;font-weight:700">${moneyFmt(q.total)}</div>
          <div style="text-align:right;color:var(--text-muted);font-size:12px">${when}</div>
          <div style="text-align:right">${q.leadId?`<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openLeadModal('${q.leadId}')" style="font-size:11px;padding:3px 8px">Lead</button>`:''}</div>
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
          <select id="nq-bar" class="form-select">
            <option value="">Built-in bar?</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="unsure">Unsure</option>
          </select>
          <input id="nq-drinks" class="form-input" placeholder="Drinks (comma-separated)">
          <input id="nq-vibes" class="form-input" placeholder="Drink vibes (comma-separated)">
          <textarea id="nq-drink-detail" class="form-textarea" style="grid-column:1 / -1;min-height:72px;resize:vertical" placeholder="Drink notes, must-haves, things to avoid…"></textarea>
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
      hasBuiltInBar: document.getElementById('nq-bar').value || '',
      drinks:     parseLeadListValue(document.getElementById('nq-drinks').value || ''),
      drinkVibes: parseLeadListValue(document.getElementById('nq-vibes').value || ''),
      drinkDetail: document.getElementById('nq-drink-detail').value || '',
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

  const trackedFields = ['name','email','phone','venue','eventType','eventDate','guestCount','budget','message','source','priority','followUpDate','hasBuiltInBar','drinks','drinkVibes','drinkDetail','eventStartTime','eventEndTime'];

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

/* Read-only view of a single saved quote. Used from the Quotes-hub list. */
async function openQuoteViewModal(quoteId) {
  openModal('Quote details', `<div id="qv-body"><div class="text-muted" style="padding:14px">Loading…</div></div>`, { wide: true });
  let q;
  try {
    const doc = await db.collection('quotes').doc(quoteId).get();
    if (!doc.exists) { document.getElementById('qv-body').innerHTML = '<div style="color:#E05252">Quote not found.</div>'; return; }
    q = { id: doc.id, ...doc.data() };
  } catch (e) {
    document.getElementById('qv-body').innerHTML = `<div style="color:#E05252">Could not load: ${e.message}</div>`;
    return;
  }

  const li = q.lineItems || {};
  /* New model: bartenders × flat pay. Legacy fallback: hours × rate × count. */
  const hasNew = li.bartenderPay != null || li.supplies != null || li.travel != null;
  const bartenderTotal = li.bartenderPay != null
    ? (li.bartenders||0) * (li.bartenderPay||0)
    : (li.serviceHours||0) * (li.bartenderRate||0) * (li.bartenders||0);
  const suppliesTotal = li.supplies != null
    ? (li.supplies||0)
    : ((li.customMenuFee||0) + (li.offMenuEnabled ? (li.offMenuQty||0)*(li.offMenuPrice||0) : 0));
  const travelTotal = (li.travel != null ? li.travel : li.travelFee) || 0;
  const customLines = Array.isArray(li.custom) ? li.custom.filter(l => (l.label||'').trim() || (l.price||0) > 0) : [];
  const modernBreakdown = savedDeterministicBreakdownHTML(q);
  const displayedRevenue = q.pricingSnapshot?.revenue || {};
  const status = q.clientAcceptedAt ? 'accepted' : (q.status || 'draft');
  const statusColor = status==='accepted'?'#22c55e':status==='locked'?'#FACC15':status==='sent'?'#3b82f6':status==='expired'?'#E05252':'var(--text-muted)';
  const shareUrl = `https://lakesalt.us/quote?id=${quoteId}`;

  const events = [
    q.createdAt   && { label: 'Created', ts: q.createdAt,   by: q.createdBy },
    q.lockedAt    && { label: 'Locked',  ts: q.lockedAt,    by: q.createdBy },
    q.sentAt      && { label: `Sent (${q.sentVia || 'manual'})`, ts: q.sentAt, by: q.sentBy },
    q.clientAcceptedAt && { label: `Accepted by ${q.clientAcceptedSignature || 'client'}`, ts: q.clientAcceptedAt }
  ].filter(Boolean);
  const fmtTs = (ts) => ts?.toDate ? ts.toDate().toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}) : '';

  document.getElementById('qv-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div>
        <div style="font-size:16px;font-weight:700">${q.leadName || '(unlinked)'}</div>
        <div class="text-muted" style="font-size:12px">Quote · ${q.createdAt?.toDate ? q.createdAt.toDate().toLocaleString('en-US',{dateStyle:'medium'}) : ''}</div>
      </div>
      <div style="text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:${statusColor};font-weight:700">${status}</div>
    </div>

    <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:8px">Breakdown</div>
      ${modernBreakdown || `<div data-pricing-view="legacy" style="display:grid;grid-template-columns:1fr auto;row-gap:6px;font-size:13px">
        <div>Bartenders <span class="text-muted" style="font-size:11px">${li.bartenders||1} × ${moneyFmt(hasNew ? li.bartenderPay : (li.bartenders ? bartenderTotal/li.bartenders : 0))}</span></div>
        <div style="text-align:right">${moneyFmt(bartenderTotal)}</div>
        <div>Supplies</div>
        <div style="text-align:right">${moneyFmt(suppliesTotal)}</div>
        <div>Travel</div>
        <div style="text-align:right">${moneyFmt(travelTotal)}</div>
        ${customLines.map(c => `<div>${escapeHtmlSafe(c.label||'Add-on')}</div><div style="text-align:right">${moneyFmt(c.price)}</div>`).join('')}
      </div>`}
    </div>

    <div style="background:linear-gradient(135deg,rgba(201,168,76,0.10),rgba(139,155,126,0.08));border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="display:grid;grid-template-columns:1fr auto;row-gap:4px;font-size:13px">
        <div class="text-muted">Subtotal</div><div style="text-align:right">${moneyFmt(displayedRevenue.servicePrice ?? q.subtotal)}</div>
        ${q.discountAmt>0?`<div class="text-muted">Discount</div><div style="text-align:right;color:#22c55e">−${moneyFmt(q.discountAmt)}</div>`:''}
        ${q.totalOverride!=null && q.targetAdjustment ? `<div class="text-muted">Adjustment to target</div><div style="text-align:right">${q.targetAdjustment>0?'+':''}${moneyFmt(q.targetAdjustment)}</div>`:''}
        <div style="font-weight:700;color:var(--text);font-size:16px;margin-top:4px">Total</div>
        <div style="text-align:right;font-weight:700;color:var(--gold);font-size:20px">${moneyFmt(displayedRevenue.total ?? q.total)}</div>
        <div class="text-muted" style="font-size:12px">Deposit (${q.depositPct||10}%)</div><div style="text-align:right;font-size:12px">${moneyFmt(displayedRevenue.deposit ?? q.deposit)}</div>
      </div>
    </div>

    <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:8px">Timeline</div>
      ${events.length ? events.map(e => `<div style="font-size:12px;padding:3px 0">${e.label}: <span class="text-muted">${fmtTs(e.ts)}${e.by?' · '+e.by:''}</span></div>`).join('') : '<div class="text-muted" style="font-size:12px">No events yet</div>'}
    </div>

    ${q.notes ? `<div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:6px">Notes</div>
      <div style="font-size:13px;line-height:1.6">${escapeHtmlSafe(q.notes)}</div>
    </div>` : ''}

    ${q.proposal?.generatedText ? `<div style="background:rgba(139,155,126,0.06);border:1px solid rgba(139,155,126,0.35);border-radius:10px;padding:12px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--teal-lt)">Generated proposal copy</div>
        <button class="btn btn-secondary btn-sm" onclick="copyToClipboard(${JSON.stringify(q.proposal.generatedText).replace(/"/g, '&quot;')})">Copy</button>
      </div>
      <pre class="qb-proposal-preview" style="max-height:260px;margin-top:0">${escapeHtmlSafe(q.proposal.generatedText)}</pre>
    </div>` : ''}

    <div style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted)">Public proposal link</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="text" readonly value="${shareUrl}" id="qv-link" class="form-input" style="flex:1;min-width:200px;font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:6px 10px">
        <button class="btn btn-secondary btn-sm" onclick="copyToClipboard('${shareUrl}')">Copy</button>
        <a class="btn btn-ghost btn-sm" href="${shareUrl}" target="_blank" rel="noopener">Open ↗</a>
      </div>
      <div class="text-muted" style="font-size:11px">${q.clientViewedAt?.length ? `Client opened this link ${q.clientViewedAt.length} time${q.clientViewedAt.length===1?'':'s'}.` : 'Client has not opened this link yet.'}</div>
    </div>

    ${q.leadId ? `<div style="margin-top:14px;text-align:center"><button class="btn btn-primary btn-sm" onclick="closeModal();setTimeout(()=>openLeadModal('${q.leadId}'),50)">Open ${escapeHtmlSafe(q.leadName||'lead')} card →</button></div>` : ''}
  `;
}
window.openQuoteViewModal = openQuoteViewModal;
window.copyToClipboard = copyToClipboard;

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
        <label class="qb-field"><span>Flat pay per bartender ($)</span><input type="number" id="qs-pay" value="${D.bartenderPayDefault}" class="form-input"></label>
        <label class="qb-field"><span>Default supplies ($)</span><input type="number" id="qs-supplies" value="${D.suppliesDefault}" class="form-input"></label>
        <label class="qb-field"><span>1 bartender per N guests</span><input type="number" id="qs-bpg" value="${D.bartendersPerGuests}" class="form-input"></label>
        <label class="qb-field"><span>Travel base ($)</span><input type="number" id="qs-travel" value="${D.travelBase}" class="form-input"></label>
        <label class="qb-field"><span>Default service hours</span><input type="number" id="qs-hours" value="${D.hoursDefault}" class="form-input"></label>
        <label class="qb-field"><span>Deposit %</span><input type="number" id="qs-dep" value="${D.depositPct}" class="form-input"></label>
        <label class="qb-field"><span>Margin — large/wedding (%)</span><input type="number" id="qs-mlarge" value="${D.marginLargePct}" class="form-input"></label>
        <label class="qb-field"><span>Margin — small/private (%)</span><input type="number" id="qs-msmall" value="${D.marginSmallPct}" class="form-input"></label>
        <label class="qb-field"><span>Margin — corporate (%)</span><input type="number" id="qs-mcorp" value="${D.marginCorpPct}" class="form-input"></label>
        <label class="qb-field"><span>Margin floor (%)</span><input type="number" id="qs-mfloor" value="${D.marginFloorPct}" class="form-input"></label>
        <label class="qb-field"><span>Profit cap trigger ($)</span><input type="number" id="qs-captrig" value="${D.profitCapTrigger}" class="form-input"></label>
        <label class="qb-field"><span>Profit cap value ($)</span><input type="number" id="qs-capval" value="${D.profitCapValue}" class="form-input"></label>
        <label class="qb-field"><span>Corporate profit floor ($)</span><input type="number" id="qs-corpfloor" value="${D.profitFloorCorp}" class="form-input"></label>
        <label class="qb-field"><span>Quote expires after (days)</span><input type="number" id="qs-exp" value="${D.quoteExpiryDays}" class="form-input"></label>
      </div>

      <button class="btn btn-primary" id="qs-save" style="margin-top:14px">Save quote defaults</button>
    </div>
  `;

  document.getElementById('qs-save').addEventListener('click', async () => {
    const updates = {
      bartenderPayDefault: +document.getElementById('qs-pay').value,
      suppliesDefault: +document.getElementById('qs-supplies').value,
      bartendersPerGuests: +document.getElementById('qs-bpg').value,
      travelBase: +document.getElementById('qs-travel').value,
      hoursDefault: +document.getElementById('qs-hours').value,
      depositPct: +document.getElementById('qs-dep').value,
      marginLargePct: +document.getElementById('qs-mlarge').value,
      marginSmallPct: +document.getElementById('qs-msmall').value,
      marginCorpPct: +document.getElementById('qs-mcorp').value,
      marginFloorPct: +document.getElementById('qs-mfloor').value,
      profitCapTrigger: +document.getElementById('qs-captrig').value,
      profitCapValue: +document.getElementById('qs-capval').value,
      profitFloorCorp: +document.getElementById('qs-corpfloor').value,
      quoteExpiryDays: +document.getElementById('qs-exp').value
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
