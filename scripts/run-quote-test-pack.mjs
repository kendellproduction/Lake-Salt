import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile('website/admin/js/quotes.js', 'utf8');
const safeSource = source.slice(0, source.indexOf('function renderQuoteBuilder')) + `\nthis.__exports = { calcQuote, buildDeterministicPricing, buildQuoteReadiness, DETERMINISTIC_PRICING_VERSION, DEFAULT_QUOTE_DEFAULTS };`;
const context = { console, Date, Math, Number, String, Array, Object, JSON, Intl, RegExp, parseInt, parseFloat, isNaN, setTimeout, clearTimeout, window: {} };
vm.createContext(context);
vm.runInContext(safeSource, context, { filename: 'website/admin/js/quotes.js' });
const { calcQuote, buildDeterministicPricing, buildQuoteReadiness, DETERMINISTIC_PRICING_VERSION, DEFAULT_QUOTE_DEFAULTS } = context.__exports;

const scenarios = [
  {
    id: '01-alisa-accepted-legacy',
    name: 'Alisa accepted quote (immutable history)',
    acceptedLegacy: true,
    expectedTotal: 792,
    lead: { name:'Alisa Hartline', email:'alisa@example.com', eventType:'Wedding', eventDate:'2027-08-07', eventStartTime:'5:00 PM', eventEndTime:'9:00 PM', venue:'Mill Pond Farms, Spanish Fork', guestCount:95, hasBuiltInBar:'yes', drinks:['Cocktails','Beer & wine','Champagne / bubbly'], drinkVibes:['Spirit-forward','Refreshing & sparkling'], drinkDetail:'Old Fashioned and champagne cocktail.', champagneGlassware:'Venue flutes' },
    quote: { bartenders:1, bartenderPay:200, supplies:150, travel:0, marginPct:40, pricingKind:'wedding', applyProfitCap:true, applyCorpFloor:false, guestCount:95, serviceHours:4, totalOverride:792, depositPct:10, leadName:'Alisa Hartline', eventType:'Wedding', eventDate:'2027-08-07', venue:'Mill Pond Farms, Spanish Fork' }
  },
  {
    id: '02-private-full-scope',
    name: 'Private event with alcohol, mocktails, water, and mobile bar',
    lead: { name:'Heather Leishman', email:'heather@example.com', phone:'801-555-0102', eventType:'Private Celebration', eventDate:'2026-12-05', eventStartTime:'7:00 PM', eventEndTime:'11:00 PM', venue:'Private home, Highland', guestCount:50, beverageGuestCount:50, serviceHours:4, hasBuiltInBar:false, alcoholicService:true, mocktailService:true, waterStation:true, cocktailCount:2, cocktailComplexity:'standard', gratuityPct:0, drinks:['Cocktails','Mocktails','Wine'], drinkVibes:['Seasonal & herbal'], drinkDetail:'Two cocktails also offered zero-proof.' }
  },
  {
    id: '03-beer-wine-minimum',
    name: 'Short beer and wine event hits minimum',
    lead: { name:'Jordan Lee', email:'jordan@example.com', phone:'801-555-0103', eventType:'Private Celebration', eventDate:'2026-09-18', eventStartTime:'6:00 PM', eventEndTime:'9:00 PM', venue:'Draper', guestCount:30, beverageGuestCount:25, serviceHours:3, hasBuiltInBar:true, alcoholicService:true, mocktailService:false, waterStation:false, cocktailCount:0, cocktailComplexity:'simple', gratuityPct:0, drinks:['Beer & wine'], drinkVibes:['Simple service'], drinkDetail:'Beer and wine only.' }
  },
  {
    id: '04-large-complex-wedding',
    name: 'Large full-service wedding',
    lead: { name:'Morgan Davis', email:'morgan@example.com', phone:'801-555-0104', eventType:'Wedding', eventDate:'2026-08-22', eventStartTime:'5:00 PM', eventEndTime:'10:00 PM', venue:'Park City', guestCount:220, beverageGuestCount:200, serviceHours:5, hasBuiltInBar:false, alcoholicService:true, mocktailService:true, waterStation:true, cocktailCount:3, cocktailComplexity:'complex', gratuityPct:20, drinks:['Signature cocktails','Mocktails','Beer & wine'], drinkVibes:['Bright & citrusy'], drinkDetail:'Three complex cocktails and one zero-proof option.' }
  },
  {
    id: '05-missing-beverage-scope',
    name: 'Incomplete scope must be blocked',
    lead: { name:'Casey Unknown', email:'casey@example.com', eventType:'Wedding', eventDate:'2027-06-12', eventStartTime:'5:00 PM', eventEndTime:'9:00 PM', venue:'Provo', guestCount:100, serviceHours:4, hasBuiltInBar:true, drinks:['Cocktails'], drinkVibes:['Surprise me'], drinkDetail:'Cocktails requested.' }
  }
];

const results = scenarios.map((scenario) => {
  if (scenario.acceptedLegacy) {
    const calc = calcQuote(scenario.quote);
    return { ...scenario, pricingModelVersion:'legacy-accepted', canSend:true, missingScope:[], calc };
  }
  const priced = buildDeterministicPricing(scenario.lead);
  const q = {
    ...scenario.lead,
    leadName:scenario.lead.name,
    pricingModelVersion:DETERMINISTIC_PRICING_VERSION,
    bartenders:priced.assumptions.bartenders,
    bartenderPay:priced.costs.labor / priced.assumptions.bartenders,
    supplies:priced.costs.operatingCost - priced.costs.labor - priced.costs.travel,
    travel:priced.costs.travel,
    marginPct:scenario.lead.eventType === 'Corporate' ? 55 : 40
  };
  const calc = calcQuote(q);
  const readiness = buildQuoteReadiness(q, scenario.lead);
  return { ...scenario, pricingModelVersion:DETERMINISTIC_PRICING_VERSION, canSend:priced.canSend && readiness.canSend, missingScope:priced.missingScope, priced, calc, readiness:{canSend:readiness.canSend,readyCount:readiness.readyCount,totalCount:readiness.totalCount} };
});

const failures = [];
const alisa = results.find(r => r.id === '01-alisa-accepted-legacy');
if (alisa.calc.total !== 792) failures.push(`Alisa history changed: expected 792, got ${alisa.calc.total}`);
const blocked = results.find(r => r.id === '05-missing-beverage-scope');
if (blocked.canSend) failures.push('Missing-scope scenario was allowed to send');
if (!blocked.missingScope.includes('beverageGuestCount')) failures.push('Missing beverage guest count was not reported');
for (const result of results.filter(r => !r.acceptedLegacy && r.canSend)) {
  if (result.priced.assumptions.disposableCupsIncluded !== true || result.priced.costs.disposableCups <= 0) failures.push(`${result.id} did not include disposable cups`);
  if (result.calc.total !== result.priced.revenue.total) failures.push(`${result.id} calcQuote disagrees with deterministic engine`);
  if (result.priced.revenue.deposit !== result.priced.revenue.total * 0.10) failures.push(`${result.id} deposit is inconsistent`);
}

await fs.mkdir('output/quote-test-pack', { recursive:true });
await fs.writeFile('output/quote-test-pack/results.json', JSON.stringify({ generatedAt:new Date().toISOString(), assumptions:DEFAULT_QUOTE_DEFAULTS, results }, null, 2));
console.log(JSON.stringify(results.map(r => ({ id:r.id, total:r.calc.total, cost:r.calc.costBasis, profit:r.calc.profit, margin:r.calc.marginPct, canSend:r.canSend, missing:r.missingScope })), null, 2));
if (failures.length) {
  console.error(`\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('\nQuote pricing regression pack passed.');
}
