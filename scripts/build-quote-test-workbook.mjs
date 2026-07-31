import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const ROOT = decodeURIComponent(new URL('..', import.meta.url).pathname);
const outDir = `${ROOT}output/quote-test-pack`;
const data = JSON.parse(await fs.readFile(`${outDir}/results.json`, 'utf8'));
const wb = Workbook.create();
const summary = wb.worksheets.add('Summary');
const scenarios = wb.worksheets.add('Scenarios');
const assumptions = wb.worksheets.add('Assumptions');
for (const s of [summary, scenarios, assumptions]) s.showGridLines = false;

const navy = '#173A3A', gold = '#B58C45', pale = '#E9E2D2', light = '#F7F4ED', red = '#FCE8E6', green = '#E7F4EA';
summary.getRange('A1:H1').merge(); summary.getRange('A1').values = [['Lake Salt Quote Agent - Private Test Pack']];
summary.getRange('A2:H2').merge(); summary.getRange('A2').values = [['Generated from the current admin quote logic. No prices were exposed publicly or sent to clients.']];
summary.getRange('A4:B9').values = [['Metric','Value'],['Scenarios tested',data.results.length],['Ready to lock/send',data.results.filter(r=>r.readiness.canLock).length],['Blocked for missing information',data.results.filter(r=>!r.readiness.canLock).length],['PDF previews generated',data.results.length],['Public instant quote', 'DISABLED']];
summary.getRange('D4:H4').merge(); summary.getRange('D4').values = [['Review focus']];
summary.getRange('D5:H8').merge(true); summary.getRange('D5').values = [['1. Are the suggested totals commercially fair?'],['2. Are bartender counts realistic?'],['3. Do the drink recommendations show enough contrast?'],['4. Should the incomplete lead be blocked for exactly these fields?']];
summary.getRange('A11:H11').merge(); summary.getRange('A11').values = [['PDF previews are stored in output/quote-test-pack/pdfs/. The Scenarios sheet contains the exact file path for each preview.']];

const headers = ['ID','Scenario','Event type','Date','Guests','Service window','Venue/bar setup','Drink package','Drink vibes','Generated total','Cost basis','Profit','Margin','Cap applied','Ready?','Missing required information','Drink recommendations','PDF path','Your review / decision'];
scenarios.getRange('A1:S1').values = [headers];
const rows = data.results.map(r => [r.id,r.name,r.lead.eventType,r.lead.eventDate,r.lead.guestCount,`${r.lead.eventStartTime || ''} - ${r.lead.eventEndTime || ''}`,`${r.lead.venue} / ${r.lead.hasBuiltInBar}`,Array.isArray(r.lead.drinks)?r.lead.drinks.join(', '):r.lead.drinks,r.lead.drinkVibes.join(', '),r.calc.total,r.calc.costBasis,r.calc.profit,r.calc.marginPct/100,r.calc.capApplied?'Yes':'No',r.readiness.canLock?'READY':'BLOCKED',r.readiness.sections.flatMap(s=>s.items.filter(i=>i.required!==false&&!i.ok).map(i=>i.label)).join(', ') || 'None',r.drinkPlan.recommendations.map(x=>`${x.label}: ${x.title}`).join(' | '),`${ROOT}output/quote-test-pack/pdfs/${r.id}.pdf`,'']);
scenarios.getRange(`A2:S${rows.length+1}`).values = rows;

assumptions.getRange('A1:C1').values = [['Assumption','Current test value','Notes']];
assumptions.getRange('A2:C10').values = [
 ['Average bartender pay',200,'Adjust by event complexity; test range $150-$300'],
 ['Bartender pay range', '$150-$300','Short/easy to large/complex events'],
 ['Average supplies',150,'Bulk purchasing reduces event-to-event variance'],
 ['Supplies range', '$100-$300','Adjust by guests, hours, menu, setup'],
 ['Target margin',0.4,'Current default'],
 ['Temporary close-out floor',0.35,'Controlled test floor; review before permanent use'],
 ['Quote-ready gate','9 fields','Date/year, start/end, venue/city, guests, bar, drinks, glassware if needed, special requests'],
 ['Price exposure','Private only','Kendell approval required before send'],
 ['EmailJS','Not tested','Payload is present; dashboard template is a separate review']
];

summary.getRange('A1:H1').format = {fill:navy,font:{bold:true,color:'#FFFFFF',size:16},horizontalAlignment:'center',verticalAlignment:'center'};
summary.getRange('A2:H2').format = {fill:light,font:{italic:true,color:'#586565',size:10},wrapText:true};
summary.getRange('A4:B4').format = {fill:gold,font:{bold:true,color:'#FFFFFF'}};
summary.getRange('D4:H4').format = {fill:gold,font:{bold:true,color:'#FFFFFF'}};
summary.getRange('A4:B9').format.borders = {preset:'outside',style:'thin',color:'#C8C2B5'};
summary.getRange('D5:H8').format = {fill:light,wrapText:true};
scenarios.getRange('A1:S1').format = {fill:navy,font:{bold:true,color:'#FFFFFF',size:9},wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};
scenarios.getRange(`A2:S${rows.length+1}`).format = {wrapText:true,verticalAlignment:'top'};
scenarios.getRange(`J2:M${rows.length+1}`).format.numberFormat = [['$#,##0','$#,##0','$#,##0','0.0%']];
scenarios.getRange(`J2:M${rows.length+1}`).format.horizontalAlignment = 'right';
scenarios.getRange(`O2:O${rows.length+1}`).format = {font:{bold:true}};
assumptions.getRange('A1:C1').format = {fill:navy,font:{bold:true,color:'#FFFFFF'}};
assumptions.getRange('A2:C10').format = {wrapText:true,verticalAlignment:'top'};
assumptions.getRange('B6:B7').format.numberFormat = [['0.0%'],['0.0%']];
scenarios.getRange(`O2:O${rows.length+1}`).conditionalFormats.add('custom', {formula:'=$O2="READY"', format:{fill:green,font:{color:'#176B35',bold:true}}});
scenarios.getRange(`O2:O${rows.length+1}`).conditionalFormats.add('custom', {formula:'=$O2="BLOCKED"', format:{fill:red,font:{color:'#9B2C2C',bold:true}}});
for (const [sheet, widths] of [[summary,[22,22,4,22,18,18,18,18]],[scenarios,[20,24,18,13,10,22,34,28,28,14,14,14,12,12,12,32,52,68,28]],[assumptions,[28,25,72]]]) {
  widths.forEach((w,i)=>sheet.getRangeByIndexes(0,i,1,1).format.columnWidth = w);
}
summary.getRange('A1:H11').format.rowHeight = 22;
scenarios.freezePanes.freezeRows(1);
scenarios.getRange('A1:S7').format.borders = {preset:'inside',style:'thin',color:'#DDD8CC'};

const check = await wb.inspect({kind:'table',sheetId:'Scenarios',range:'A1:S7',include:'values,formulas',tableMaxRows:7,tableMaxCols:19});
await fs.writeFile(`${outDir}/workbook-check.ndjson`, check.ndjson || '');
const errors = await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',options:{useRegex:true,maxResults:100},summary:'quote test workbook formula error scan'});
await fs.writeFile(`${outDir}/workbook-errors.ndjson`, errors.ndjson || '');
const preview = await wb.render({sheetName:'Scenarios',range:'A1:S7',scale:1,format:'png'});
await fs.writeFile(`${outDir}/workbook-preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(`${outDir}/Lake-Salt-Quote-Agent-Test-Pack.xlsx`);
console.log('Workbook exported:', `${outDir}/Lake-Salt-Quote-Agent-Test-Pack.xlsx`);
