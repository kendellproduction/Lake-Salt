import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile('website/admin/js/quotes.js', 'utf8');
const safeSource = source.slice(0, source.indexOf('function renderQuoteBuilder')) + `\nthis.__exports = { calcQuote, buildDeterministicPricing, validateDeterministicScope, makeInitialQuote, buildPricingSnapshot, hydrateQuotePricing, persistCurrentQuoteBeforeSend, buildQuoteReadiness, savedDeterministicBreakdownHTML, DETERMINISTIC_PRICING_VERSION };`;
const context = { console, Date, Math, Number, String, Array, Object, JSON, Intl, RegExp, parseInt, parseFloat, isNaN, setTimeout, clearTimeout, window:{} };
vm.createContext(context);
vm.runInContext(safeSource, context);
const { calcQuote, buildDeterministicPricing, validateDeterministicScope, makeInitialQuote, buildPricingSnapshot, hydrateQuotePricing, persistCurrentQuoteBeforeSend, buildQuoteReadiness, savedDeterministicBreakdownHTML, DETERMINISTIC_PRICING_VERSION } = context.__exports;

const complete = { eventType:'Wedding', venue:'Provo', guestCount:115, beverageGuestCount:100, serviceHours:4, hasBuiltInBar:false, alcoholicService:true, mocktailService:true, waterStation:true, cocktailCount:3, cocktailComplexity:'standard', gratuityPct:0 };
const priced = buildDeterministicPricing(complete);
assert.equal(priced.canSend, true);
assert.equal(priced.assumptions.disposableCupsIncluded, true);
assert.ok(priced.costs.disposableCups > 0);
assert.equal(priced.revenue.deposit, priced.revenue.total * 0.10);
assert.equal(priced.revenue.servicePrice - priced.costs.operatingCost, priced.profit.dollars);

const noMocktails = buildDeterministicPricing({ ...complete, mocktailService:false });
assert.ok(noMocktails.revenue.total < priced.revenue.total);
const noWater = buildDeterministicPricing({ ...complete, waterStation:false });
assert.ok(noWater.revenue.total < priced.revenue.total);
const builtInBar = buildDeterministicPricing({ ...complete, hasBuiltInBar:true });
assert.ok(builtInBar.revenue.total < priced.revenue.total);
const gratuity = buildDeterministicPricing({ ...complete, gratuityPct:20 });
assert.equal(gratuity.revenue.total, gratuity.revenue.servicePrice * 1.20);

const missing = buildDeterministicPricing({ eventType:'Wedding', venue:'Provo', guestCount:100, serviceHours:4, hasBuiltInBar:true });
assert.equal(missing.canSend, false);
assert.ok(missing.missingScope.includes('beverageGuestCount'));
assert.ok(missing.missingScope.includes('mocktailService'));
assert.ok(missing.missingScope.includes('waterStation'));

const legacyAlisa = calcQuote({ bartenders:2, bartenderPay:200, supplies:150, travel:0, marginPct:40, pricingKind:'wedding', applyProfitCap:true, applyCorpFloor:false, totalOverride:792, depositPct:10 });
assert.equal(legacyAlisa.total, 792);
assert.equal(legacyAlisa.deposit, 79.2);

const modern = calcQuote({ ...complete, pricingModelVersion:DETERMINISTIC_PRICING_VERSION });
assert.equal(modern.canSend, true);
assert.equal(modern.total, priced.revenue.total);

// Real builder initial state must preserve unknown scope instead of inventing it.
const emptyInitial = makeInitialQuote({ name:'New lead', eventType:'Wedding', venue:'Provo' });
assert.equal(emptyInitial.guestCount, 0);
assert.equal(emptyInitial.beverageGuestCount, 0);
assert.equal(emptyInitial.cocktailCount, null);
assert.equal(calcQuote(emptyInitial).canSend, false);
const completeInitial = makeInitialQuote({ ...complete, name:'Complete lead' });
assert.equal(completeInitial.pricingModelVersion, DETERMINISTIC_PRICING_VERSION);
assert.equal(calcQuote(completeInitial).canSend, true);

// Modern corporate quotes use the documented deterministic 55%, not legacy 65%.
const corporateInitial = makeInitialQuote({ ...complete, name:'Corporate lead', eventType:'Corporate Event' });
assert.equal(corporateInitial.marginPct, 55);
assert.equal(calcQuote(corporateInitial).effectiveMargin, 55);

// Numeric and cross-field boundaries.
for (const patch of [
  { guestCount:0 }, { guestCount:2001 }, { beverageGuestCount:116 },
  { serviceHours:0 }, { serviceHours:25 }, { cocktailCount:-1 },
  { cocktailCount:11 }, { bartenders:31 }, { gratuityPct:31 }
]) {
  const invalid = buildDeterministicPricing({ ...complete, ...patch });
  assert.equal(invalid.canSend, false, `invalid scope unexpectedly sendable: ${JSON.stringify(patch)}`);
}
assert.equal(validateDeterministicScope({ ...complete, cocktailCount:null }).missing.includes('cocktailCount'), true);

// Persistence round-trip must retain model version, null-capable scope, and math.
const modernQuote = { ...complete, pricingModelVersion:DETERMINISTIC_PRICING_VERSION, cocktailCount:3 };
const snapshot = buildPricingSnapshot(modernQuote, calcQuote(modernQuote));
const serialized = JSON.parse(JSON.stringify(snapshot));
const hydrated = hydrateQuotePricing({ leadName:'Round trip' }, serialized);
assert.equal(hydrated.pricingModelVersion, DETERMINISTIC_PRICING_VERSION);
assert.deepEqual(JSON.parse(JSON.stringify(deterministicScopeFrom(hydrated))), JSON.parse(JSON.stringify(serialized.pricingScope)));
assert.deepEqual(JSON.parse(JSON.stringify(hydrated.deterministicPricing.costs)), JSON.parse(JSON.stringify(serialized.pricingSnapshot.costs)));
const nullCocktailQuote = { ...complete, alcoholicService:false, cocktailCount:null, cocktailComplexity:'', pricingModelVersion:DETERMINISTIC_PRICING_VERSION };
const nullCocktailSnapshot = JSON.parse(JSON.stringify(buildPricingSnapshot(nullCocktailQuote, calcQuote(nullCocktailQuote))));
const nullCocktailHydrated = hydrateQuotePricing({}, nullCocktailSnapshot);
assert.equal(nullCocktailSnapshot.pricingScope.cocktailCount, null);
assert.equal(nullCocktailHydrated.cocktailCount, null);

// Quote-editable bar scope wins over stale lead data; lead remains fallback.
const readinessLead = { name:'Ready Person', email:'ready@example.com', eventType:'Wedding', eventDate:'2027-05-01', eventStartTime:'5 PM', eventEndTime:'9 PM', guestCount:115, venue:'Provo', hasBuiltInBar:false, drinks:['Cocktails'], drinkVibes:['Bright'], drinkDetail:'Three cocktails, no other requests.' };
const readinessQuote = { ...completeInitial, leadName:'Ready Person', eventDate:'2027-05-01', hasBuiltInBar:true, bartenderPay:200, supplies:150, travel:0 };
const qPreferred = buildQuoteReadiness(readinessQuote, readinessLead);
const barItem = qPreferred.sections.find(s => s.title === 'Service logistics').items.find(i => i.label === 'Built-in bar info');
assert.equal(barItem.ok, true);
assert.equal(barItem.detail, 'Yes');
const fallbackQuote = { ...readinessQuote, hasBuiltInBar:null, pricingModelVersion:null };
const fallbackBar = buildQuoteReadiness(fallbackQuote, readinessLead).sections.find(s => s.title === 'Service logistics').items.find(i => i.label === 'Built-in bar info');
assert.equal(fallbackBar.detail, 'No — Lake Salt mobile bar');

// Saved modern details render the persisted snapshot; old records use fallback.
const savedModern = { ...snapshot, depositPct:10 };
const modernDetails = savedDeterministicBreakdownHTML(savedModern);
assert.match(modernDetails, /data-pricing-view="deterministic"/);
assert.match(modernDetails, /Disposable cups/);
assert.equal(savedDeterministicBreakdownHTML({ total:792, status:'accepted' }), '');

// The send invariant always invokes a current locked save; no cached ID shortcut.
const calls = [];
const savedId = await persistCurrentQuoteBeforeSend(async status => { calls.push(status); return 'fresh-current-id'; });
assert.equal(savedId, 'fresh-current-id');
assert.deepEqual(calls, ['locked']);
await assert.rejects(() => persistCurrentQuoteBeforeSend(async () => null), /could not be saved/i);

// Alisa fixture remains legacy and accepted history, not silently migrated.
const alisaSaved = { status:'accepted', total:792, deposit:79.2, lineItems:{ bartenders:2, bartenderPay:200, supplies:150, travel:0 }, totalOverride:792 };
const hydratedAlisa = hydrateQuotePricing({ pricingModelVersion:DETERMINISTIC_PRICING_VERSION }, alisaSaved);
assert.notEqual(hydratedAlisa.pricingModelVersion, DETERMINISTIC_PRICING_VERSION);
assert.equal(alisaSaved.total, 792);

const rules = await fs.readFile('firestore.rules', 'utf8');
assert.match(rules, /resource\.data\.status == 'sent'/);
console.log('quote-pricing.test.mjs passed');

function deterministicScopeFrom(q) {
  return {
    guestCount:q.guestCount, beverageGuestCount:q.beverageGuestCount, serviceHours:q.serviceHours,
    venue:q.venue, travelArea:q.travelArea, alcoholicService:q.alcoholicService,
    mocktailService:q.mocktailService, waterStation:q.waterStation, cocktailCount:q.cocktailCount,
    cocktailComplexity:q.cocktailComplexity, hasBuiltInBar:q.hasBuiltInBar,
    bartenders:q.bartenders, gratuityPct:q.gratuityPct
  };
}
