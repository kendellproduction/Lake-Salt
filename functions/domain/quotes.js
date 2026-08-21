'use strict';

const BASE_REQUIRED = ['eventDate', 'serviceStart', 'serviceEnd', 'venueName', 'venueCity', 'travelZone', 'guestCount', 'eventType', 'barProvider', 'scope', 'specialRequests', 'staffingRequirements', 'equipmentAddOns', 'capacityVerified'];

function finiteNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
function money(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }

function validateQuoteInputs(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, missing: BASE_REQUIRED.slice(), errors: ['input_must_be_object'] };
  const missing = BASE_REQUIRED.filter((key) => input[key] === undefined || input[key] === null || input[key] === '');
  if (!isRealDate(input.eventDate)) errors.push('eventDate_must_include_valid_year');
  if (!finiteNumber(input.guestCount) || input.guestCount <= 0) errors.push('guestCount_must_be_positive');
  if (input.capacityVerified !== true) errors.push('capacity_must_be_verified');
  if (!Array.isArray(input.scope) || input.scope.length === 0) errors.push('scope_must_be_nonempty_array');
  if (Array.isArray(input.scope) && input.scope.includes('cocktails')) {
    if (!finiteNumber(input.cocktailCount)) missing.push('cocktailCount');
    if (!input.signatureDrinkComplexity) missing.push('signatureDrinkComplexity');
  }
  if (Array.isArray(input.scope) && input.scope.includes('champagne') && !input.glasswareRequirements) missing.push('glasswareRequirements');
  if (input.barProvider === 'lake_salt' && !input.equipmentAddOns) missing.push('equipmentAddOns');
  return { valid: missing.length === 0 && errors.length === 0, missing: [...new Set(missing)].sort(), errors: [...new Set(errors)].sort() };
}

function calculateQuote({ quoteId, leadId, businessEventId, policyVersion, input, policy }) {
  if (!policyVersion) throw new TypeError('policyVersion is required');
  if (![quoteId, leadId, businessEventId].every((x) => typeof x === 'string' && x.trim())) return { status: 'hold', reason: 'quote_identity_incomplete', policyVersion };
  const validation = validateQuoteInputs(input);
  if (!validation.valid) return { status: 'hold', reason: 'required_inputs_incomplete', policyVersion, validation };
  if (!policy || policy.version !== policyVersion) throw new Error('pricing_policy_version_mismatch');
  if (input.dueDates !== undefined || input.paymentMethods !== undefined) return { status: 'hold', reason: 'unapproved_payment_terms_override', policyVersion };
  if (!finiteNumber(input.gratuity || 0) || (input.gratuity || 0) < 0) throw new Error('invalid_gratuity');
  const trace = [];
  const complexity = input.scope.includes('cocktails') ? (input.signatureDrinkComplexity === 'complex' || input.cocktailCount >= 3 ? 'complex' : 'standard') : 'beerWine';
  const ratio = policy.staffingRatios[complexity];
  if (!finiteNumber(ratio) || ratio <= 0) throw new Error('invalid_staffing_ratio');
  const computedStaff = Math.ceil(input.guestCount / ratio);
  const adminStaff = input.staffingRequirements === '' ? 0 : Number(input.staffingRequirements);
  const minimumStaff = policy.minimumBartenders?.[complexity] ?? 1;
  if (!finiteNumber(adminStaff) || adminStaff < 0 || !Number.isInteger(adminStaff)) throw new Error('invalid_staffing_requirement');
  if (!finiteNumber(minimumStaff) || minimumStaff <= 0 || !Number.isInteger(minimumStaff)) throw new Error('invalid_minimum_bartenders');
  const bartenderCount = Math.max(computedStaff, adminStaff, minimumStaff);
  trace.push({ rule: `staffing.${complexity}`, inputs: { guestCount: input.guestCount, ratio, adminStaff }, output: bartenderCount });
  const context = { ...input, bartenderCount, serviceHours: hoursBetween(input.serviceStart, input.serviceEnd, policy.allowOvernightService === true) };
  const lineItems = policy.costRules.map((rule) => {
    const quantity = rule.quantity ? rule.quantity(context) : 1;
    const unitAmount = rule.amount ? rule.amount(context) : rule.unitAmount;
    if (!finiteNumber(quantity) || quantity < 0 || !finiteNumber(unitAmount) || unitAmount < 0) throw new Error(`invalid_cost_rule:${rule.id || 'unknown'}`);
    const amount = money(quantity * unitAmount);
    if (!finiteNumber(amount)) throw new Error(`invalid_cost_rule_result:${rule.id || 'unknown'}`);
    trace.push({ rule: rule.id, inputs: { quantity, unitAmount }, output: amount });
    return { ruleId: rule.id, label: rule.label || rule.id, quantity, unitAmount: money(unitAmount), amount };
  }).filter((item) => item.amount !== 0);
  const operatingCost = money(lineItems.reduce((sum, item) => sum + item.amount, 0));
  const margin = policy.targetMargins[input.eventType];
  if (!finiteNumber(margin) || margin < 0 || margin >= 1) throw new Error('invalid_target_margin');
  const unrounded = operatingCost / (1 - margin);
  const minimum = policy.minimums[input.eventType] || 0;
  const increment = policy.roundingIncrement || 5;
  if (!finiteNumber(minimum) || minimum < 0 || !finiteNumber(increment) || increment <= 0) throw new Error('invalid_pricing_boundary');
  const subtotal = money(Math.ceil(Math.max(unrounded, minimum) / increment) * increment);
  const gratuity = money(input.gratuity || 0);
  const total = money(subtotal + gratuity);
  const depositPercent = policy.depositPercent;
  if (!finiteNumber(depositPercent) || depositPercent < 0 || depositPercent > 1) throw new Error('invalid_deposit_percent');
  const depositAmount = money(total * depositPercent);
  trace.push({ rule: 'margin_and_minimum', inputs: { operatingCost, margin, minimum, increment }, output: subtotal });
  trace.push({ rule: 'deposit', inputs: { total, depositPercent }, output: depositAmount });
  return {
    quoteId, leadId, businessEventId, policyVersion, requiredInputs: { ...input }, lineItems,
    operatingCost, subtotal, discounts: [], gratuity, total, depositPercent, depositAmount,
    balance: money(total - depositAmount), dueDates: structuredDueDates(policy.dueDates),
    paymentMethods: structuredPaymentMethods(policy.paymentMethods), computationTrace: trace,
    confidence: finiteNumber(policy.confidence) ? policy.confidence : 1,
    status: 'computed', frozen: false,
  };
}

function hoursBetween(start, end, allowOvernight) {
  const parse = (v) => { const m = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(v || ''); return m ? Number(v.slice(0, 2)) + Number(v.slice(3)) / 60 : NaN; };
  let result = parse(end) - parse(start);
  if (result < 0 && allowOvernight) result += 24;
  if (!Number.isFinite(result) || result <= 0) throw new Error('invalid_service_times');
  return result;
}

function acceptQuote(quote, acceptedAt, approvalEvidence) {
  verifyAcceptedQuote(quote, approvalEvidence, { allowPreAcceptance: true });
  return deepFreeze({ ...structuredClone(quote), status: 'accepted', acceptedAt: acceptedAt || new Date().toISOString(), frozen: true });
}

function verifyAcceptedQuote(quote, approvalEvidence, options = {}) {
  validateAcceptableQuote(quote, approvalEvidence);
  const allowed = options.allowPreAcceptance ? ['computed', 'approved', 'sent', 'accepted'] : ['accepted'];
  if (!allowed.includes(quote.status)) throw new Error('quote_not_accepted');
  return true;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateAcceptableQuote(quote, evidence) {
  if (!quote || typeof quote !== 'object') throw new TypeError('structured quote required');
  for (const key of ['quoteId', 'leadId', 'businessEventId', 'policyVersion']) if (!stableIdentifier(quote[key])) throw new Error(`quote_${key}_required`);
  for (const key of ['subtotal', 'total', 'depositPercent', 'depositAmount', 'balance', 'gratuity']) if (!finiteNumber(quote[key]) || quote[key] < 0) throw new Error(`quote_${key}_invalid`);
  if (!Array.isArray(quote.lineItems) || !Array.isArray(quote.discounts)) throw new Error('quote_economic_structure_invalid');
  validateEconomicEntries(quote.lineItems, 'line_item');
  validateEconomicEntries(quote.discounts, 'discount');
  if (quote.total <= 0 || quote.depositAmount > quote.total) throw new Error('quote_economics_invalid');
  const discounts = money(quote.discounts.reduce((sum, item) => sum + item.amount, 0));
  if (money(quote.subtotal - discounts + quote.gratuity) !== money(quote.total)) throw new Error('quote_total_mismatch');
  if (quote.depositPercent > 1 || money(quote.total * quote.depositPercent) !== money(quote.depositAmount)) throw new Error('quote_deposit_mismatch');
  if (money(quote.total - quote.depositAmount) !== money(quote.balance)) throw new Error('quote_balance_mismatch');
  const dueDates = structuredDueDates(quote.dueDates);
  const methods = structuredPaymentMethods(quote.paymentMethods);
  if (!evidence || evidence.policyVersion !== quote.policyVersion || !stableIdentifier(evidence.approvalId) || !stableIdentifier(evidence.approvedBy)) throw new Error('quote_approval_evidence_required');
  if (JSON.stringify(dueDates) !== JSON.stringify(structuredDueDates(evidence.dueDates)) || JSON.stringify(methods) !== JSON.stringify(structuredPaymentMethods(evidence.paymentMethods))) throw new Error('quote_payment_terms_not_approved');
}

function validateEconomicEntries(entries, kind) {
  const ids = new Set();
  for (const entry of entries) {
    if (!entry || !stableIdentifier(entry.ruleId) || ids.has(entry.ruleId) || !finiteNumber(entry.amount) || entry.amount < 0) throw new Error(`quote_${kind}_invalid`);
    ids.add(entry.ruleId);
  }
}

function stableIdentifier(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }

function structuredDueDates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) throw new Error('quote_dueDates_required');
  for (const [key, date] of Object.entries(value)) if (!stableIdentifier(key) || !isRealDate(date)) throw new Error('quote_dueDates_invalid');
  return { ...value };
}

function structuredPaymentMethods(value) {
  if (!Array.isArray(value) || value.length === 0 || value.some((x) => !stableIdentifier(x))) throw new Error('quote_paymentMethods_required');
  return [...new Set(value.map((x) => x.trim()))];
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function createShadowComparison(computedQuote, approvedQuote, attribution = {}) {
  if (!computedQuote || !approvedQuote || ['quoteId', 'leadId', 'businessEventId'].some((key) => computedQuote[key] !== approvedQuote[key])) throw new Error('shadow_quote_identity_mismatch');
  if (!computedQuote.policyVersion || computedQuote.policyVersion !== approvedQuote.policyVersion) throw new Error('shadow_quote_policy_version_mismatch');
  const computedByRule = Object.fromEntries((computedQuote.lineItems || []).map((x) => [x.ruleId, x.amount]));
  const approvedByRule = Object.fromEntries((approvedQuote.lineItems || []).map((x) => [x.ruleId, x.amount]));
  const ruleIds = [...new Set([...Object.keys(computedByRule), ...Object.keys(approvedByRule)])].sort();
  const ruleVariance = ruleIds.map((ruleId) => ({ ruleId, variance: money((approvedByRule[ruleId] || 0) - (computedByRule[ruleId] || 0)), attribution: attribution[ruleId] || 'unattributed' }));
  const explained = money(ruleVariance.reduce((sum, x) => sum + x.variance, 0));
  const totalVariance = money(approvedQuote.total - computedQuote.total);
  return deepFreeze({ quoteId: computedQuote.quoteId, leadId: computedQuote.leadId, businessEventId: computedQuote.businessEventId, policyVersion: computedQuote.policyVersion, computed: structuredClone(computedQuote), approved: structuredClone(approvedQuote), totalVariance, ruleVariance, unexplainedVariance: money(totalVariance - explained), status: 'shadow_recorded' });
}

module.exports = { acceptQuote, calculateQuote, createShadowComparison, validateQuoteInputs, verifyAcceptedQuote };
