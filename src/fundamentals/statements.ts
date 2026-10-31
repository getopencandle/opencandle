import {dateDay,queryFacts,type CompanyFacts,type FactRow} from './company-facts';
/** Financial statement views over SEC companyfacts.
 * Values are SEC as-reported standard-taxonomy tags selected per period, never vendor-standardized
 * figures. Every arithmetic result lists its inputs. Unknown stays null with a reason, never 0. */
export type StatementKind='income'|'balance'|'cashflow'|'statistics';
export type StatementBasis='FY'|'FQ'|'TTM';
export type StatementRevisions='latest'|'original';
export type StatementScale='auto'|'units'|'thousands'|'millions'|'billions';
export type LineMeasure='currency'|'per-share'|'shares'|'percent'|'ratio';
export interface StatementLineSpec {id:string;statement:'income'|'balance'|'cashflow';label:string;tags:readonly string[];measure:'currency'|'per-share'|'shares';kind:'flow'|'stock';additive:boolean;catalogId:string|null}
/** negativeDenominator: 'allow' computes; 'reference' is empty because the cited article says so;
 * 'policy' is an LV decision where the reference is silent (margins on negative revenue). */
export interface DerivedMetricSpec {id:string;label:string;statements:readonly StatementKind[];inputs:readonly [string,string];operation:'percent'|'ratio'|'difference';measure:'currency'|'percent'|'ratio';formula:string;negativeDenominator:'allow'|'reference'|'policy';catalogId:string|null;reference:string}
export interface UnavailableMetric {id:string;label:string;catalogId:string|null;reason:string}
const g=(tag:string)=>'us-gaap:'+tag,M='AN.FUND.METRIC.';
const line=(statement:StatementLineSpec['statement'],id:string,label:string,tags:string[],catalog:string|null,measure:StatementLineSpec['measure']='currency',additive=measure==='currency'):StatementLineSpec=>({id,statement,label,tags:tags.map(g),measure,kind:statement==='balance'?'stock':'flow',additive,catalogId:catalog&&M+catalog});
/** Ordered tag preferences. The first tag with a value for the exact period is used and shown;
 * later tags are fallbacks for issuers that report the concept under another standard tag. */
export const STATEMENT_LINES:readonly StatementLineSpec[]=[
 line('income','revenue','Total revenue',['Revenues','RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','SalesRevenueNet','SalesRevenueGoodsNet'],'43000553619'),
 line('income','cost_of_revenue','Cost of goods sold',['CostOfRevenue','CostOfGoodsAndServicesSold','CostOfGoodsSold'],'43000553618'),
 line('income','gross_profit','Gross profit',['GrossProfit'],'43000553611'),
 line('income','research_development','Research and development',['ResearchAndDevelopmentExpense'],'43000553612'),
 line('income','sga','Selling, general and administrative',['SellingGeneralAndAdministrativeExpense'],'43000553613'),
 line('income','operating_expenses','Operating expenses (as tagged)',['OperatingExpenses'],'43000563463'),
 line('income','operating_income','Operating income',['OperatingIncomeLoss'],'43000563464'),
 line('income','interest_expense','Interest expense',['InterestExpense'],'43000563466'),
 line('income','pretax_income','Pretax income',['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest','IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'],'43000563462'),
 line('income','income_tax','Income tax expense (benefit)',['IncomeTaxExpenseBenefit'],'43000563492'),
 line('income','net_income','Net income',['NetIncomeLoss'],'43000553617'),
 line('income','eps_basic','EPS, basic',['EarningsPerShareBasic'],'43000563520','per-share'),
 line('income','eps_diluted','EPS, diluted',['EarningsPerShareDiluted'],'43000553616','per-share'),
 line('income','shares_basic','Weighted average shares, basic',['WeightedAverageNumberOfSharesOutstandingBasic'],'43000670320','shares'),
 line('income','shares_diluted','Weighted average shares, diluted',['WeightedAverageNumberOfDilutedSharesOutstanding'],'43000670322','shares'),
 line('balance','cash','Cash and cash equivalents',['CashAndCashEquivalentsAtCarryingValue'],'43000563709'),
 line('balance','short_term_investments','Short-term investments',['ShortTermInvestments'],'43000563716'),
 line('balance','receivables','Accounts receivable, net',['AccountsReceivableNetCurrent'],'43000563740'),
 line('balance','inventory','Inventories',['InventoryNet'],'43000563745'),
 line('balance','current_assets','Total current assets',['AssetsCurrent'],'43000557441'),
 line('balance','ppe_net','Property, plant and equipment, net',['PropertyPlantAndEquipmentNet'],'43000563657'),
 line('balance','goodwill','Goodwill',['Goodwill'],'43000563688'),
 line('balance','total_assets','Total assets',['Assets'],'43000553623'),
 line('balance','accounts_payable','Accounts payable',['AccountsPayableCurrent'],'43000563619'),
 line('balance','current_liabilities','Total current liabilities',['LiabilitiesCurrent'],'43000557437'),
 line('balance','long_term_debt','Long-term debt, noncurrent',['LongTermDebtNoncurrent'],'43000563521'),
 line('balance','total_liabilities','Total liabilities',['Liabilities'],'43000553624'),
 line('balance','total_equity',"Shareholders' equity (parent)",['StockholdersEquity'],'43000557442'),
 line('balance','liabilities_and_equity',"Total liabilities and shareholders' equity",['LiabilitiesAndStockholdersEquity'],'43000553626'),
 line('cashflow','operating_cash_flow','Cash from operating activities',['NetCashProvidedByUsedInOperatingActivities'],'43000553627'),
 line('cashflow','depreciation_amortization','Depreciation and amortization',['DepreciationDepletionAndAmortization','DepreciationAndAmortization'],'43000563477'),
 line('cashflow','share_based_compensation','Share-based compensation',['ShareBasedCompensation'],null),
 line('cashflow','capital_expenditures','Capital expenditures (payments for PP&E)',['PaymentsToAcquirePropertyPlantAndEquipment'],'43000564167'),
 line('cashflow','investing_cash_flow','Cash from investing activities',['NetCashProvidedByUsedInInvestingActivities'],'43000553628'),
 line('cashflow','share_repurchases','Repurchase of common stock',['PaymentsForRepurchaseOfCommonStock'],null),
 line('cashflow','dividends_paid','Dividends paid',['PaymentsOfDividends','PaymentsOfDividendsCommonStock'],'43000564183'),
 line('cashflow','financing_cash_flow','Cash from financing activities',['NetCashProvidedByUsedInFinancingActivities'],'43000553629'),
];
const TV='public-definition:';
/** Formulas follow the cited public help articles. Derived values exist only where every input exists. */
export const DERIVED_METRICS:readonly DerivedMetricSpec[]=[
 {id:'free_cash_flow',label:'Free cash flow',statements:['cashflow','statistics'],inputs:['operating_cash_flow','capital_expenditures'],operation:'difference',measure:'currency',formula:'Cash from operating activities - Capital expenditures',negativeDenominator:'allow',catalogId:M+'43000553630',reference:TV+'43000553630-free-cash-flow/'},
 {id:'gross_margin',label:'Gross margin %',statements:['statistics'],inputs:['gross_profit','revenue'],operation:'percent',measure:'percent',formula:'Gross profit / Total revenue * 100',negativeDenominator:'policy',catalogId:M+'43000597811',reference:TV+'43000597811-gross-margin/'},
 {id:'operating_margin',label:'Operating margin %',statements:['statistics'],inputs:['operating_income','revenue'],operation:'percent',measure:'percent',formula:'Operating income / Total revenue * 100',negativeDenominator:'policy',catalogId:M+'43000597076',reference:TV+'43000597076-operating-margin/'},
 {id:'net_margin',label:'Net margin %',statements:['statistics'],inputs:['net_income','revenue'],operation:'percent',measure:'percent',formula:'Net income / Total revenue * 100',negativeDenominator:'policy',catalogId:M+'43000597074',reference:TV+'43000597074-net-margin/'},
 {id:'fcf_margin',label:'Free cash flow margin %',statements:['statistics'],inputs:['free_cash_flow','revenue'],operation:'percent',measure:'percent',formula:'Free cash flow / Total revenue * 100',negativeDenominator:'policy',catalogId:M+'43000597813',reference:TV+'43000597813-free-cash-flow-margin/'},
 {id:'current_ratio',label:'Current ratio',statements:['statistics'],inputs:['current_assets','current_liabilities'],operation:'ratio',measure:'ratio',formula:'Total current assets / Total current liabilities',negativeDenominator:'reference',catalogId:M+'43000597051',reference:TV+'43000597051-current-ratio/'},
 {id:'liabilities_to_equity',label:'Total liabilities to equity',statements:['statistics'],inputs:['total_liabilities','total_equity'],operation:'ratio',measure:'ratio',formula:"Total liabilities / Shareholders' equity (parent)",negativeDenominator:'allow',catalogId:null,reference:TV+'43000699503-financial-position/'},
];
const PRICE='Needs point-in-time prices and share counts. OpenCandle has no permitted point-in-time price source and does not infer one from chart bars.';
export const UNAVAILABLE_METRICS:readonly UnavailableMetric[]=[
 {id:'market_cap',label:'Market capitalization',catalogId:M+'43000597015',reason:PRICE},
 {id:'price_earnings',label:'Price to earnings ratio',catalogId:M+'43000597017',reason:PRICE},
 {id:'price_sales',label:'Price to sales ratio',catalogId:M+'43000597019',reason:PRICE},
 {id:'price_book',label:'Price to book ratio',catalogId:M+'43000597016',reason:PRICE},
 {id:'enterprise_value',label:'Enterprise value',catalogId:M+'43000597077',reason:'Needs a price. The Metrics tab computes it from the last loaded close (Valuation group).'},
 {id:'dividend_yield',label:'Dividend yield',catalogId:M+'43000597817',reason:PRICE},
 {id:'free_float',label:'Free float',catalogId:M+'43000670341',reason:'No float source is connected. OpenCandle does not infer float from shares outstanding.'},
 {id:'debt_to_equity',label:'Debt to equity ratio',catalogId:M+'43000597078',reason:'Shown in the Metrics tab (Debt and coverage) with an OpenCandle-defined total debt. Total liabilities to equity here is a different metric.'},
 {id:'eps_estimates',label:'EPS estimates',catalogId:M+'43000597066',reason:'Consensus estimates are vendor data. No permitted public estimate source is connected.'},
 {id:'revenue_estimates',label:'Revenue estimates',catalogId:M+'43000597067',reason:'Consensus estimates are vendor data. No permitted public estimate source is connected.'},
 {id:'etf_metrics',label:'ETF AUM, expense ratio, holdings and flows',catalogId:null,reason:'SEC companyfacts covers operating-company filings. No fund data source is connected, so ETF metrics stay unavailable.'},
];
export const STATEMENT_POLICY='Values are SEC as-reported standard tags for the exact period, not vendor-standardized figures, so they can differ from other platforms. Annual means a 300-400 day reported period and quarterly a 60-120 day reported period. The filing cutoff is inclusive at day precision; later filings and amendments are excluded. Quarters are never derived by subtracting year-to-date totals. TTM uses a reported twelve-month period, four contiguous reported quarters, or the latest annual period plus the current year-to-date minus the prior-year comparable year-to-date. Balance-sheet values are never summed. No currency conversion.';
export interface StatementInput {id:string;label:string;tag:string|null;start:string|null;end:string;value:number;sign:1|-1;filed:string|null;form:string|null;accession:string|null}
export type CellMethod='reported'|'reported-annual'|'four-quarters'|'annual-plus-ytd'|'derived';
/** refused: an input exists but conflicts or is ambiguous, so LV declined to choose a value. */
export interface StatementCell {value:number|null;reason:string|null;refused:boolean;start:string|null;end:string;unit:string|null;tag:string|null;filed:string|null;form:string|null;accession:string|null;method:CellMethod|null;inputs:StatementInput[]}
export interface StatementRow {id:string;label:string;measure:LineMeasure;unit:string;catalogId:string|null;tags:readonly string[];formula:string|null;derivedInputs:readonly string[]|null;cells:StatementCell[]}
export interface StatementOptions {statement:StatementKind;basis:StatementBasis;currency:string;asOf:string|null;revisions:StatementRevisions;columns:number}
export interface StatementTable {options:StatementOptions;columns:string[];rows:StatementRow[];notices:string[];droppedColumns:number;availableColumns:number}
interface Resolved {value:number|null;reason:string|null;row:FactRow}
interface Entry {tag:string;start:string|null;end:string;unit:string;days:number|null;resolved:Resolved}
export function addDays(day:string,days:number):string{return new Date((dateDay(day)+days)*86400000).toISOString().slice(0,10);}
const span=(start:string,end:string)=>dateDay(end)-dateDay(start)+1;
const annual=(days:number|null)=>days!==null&&days>=300&&days<=400,quarter=(days:number|null)=>days!==null&&days>=60&&days<=120;
const maxFiled=(rows:{filed:string|null}[])=>rows.some(row=>row.filed===null)?null:rows.map(row=>row.filed!).sort().at(-1)??null;
/** One period group from queryFacts. Same-day conflicts and undated disagreements stay unavailable.
 * When several filings on the same day report the same value, the provenance shown is the one with
 * the smallest accession number (missing accession last), so it never depends on input order. */
const byAccession=(a:FactRow,b:FactRow)=>(a.accession??'\uffff').localeCompare(b.accession??'\uffff');
function resolveGroup(rows:FactRow[]):Resolved{
 const values=[...new Set(rows.map(row=>row.value))],dated=rows.filter(row=>!row.chronologyUnknown).sort(byAccession),row=dated[0]??[...rows].sort(byAccession)[0];
 if(rows.some(row=>row.ambiguous))return {value:null,reason:'Conflicting values ('+values.join(', ')+') were filed on '+row.filed+'. OpenCandle does not pick one.',row};
 if(values.length>1)return {value:null,reason:'A value with an unknown filing date differs from the dated value. OpenCandle cannot rank them; set a filing cutoff to exclude undated values.',row};
 return {value:row.value,reason:null,row};
}
/** Per-tag period index using the existing cutoff and revision selection (company-facts.queryFacts). */
class FactIndex {
 private cache=new Map<string,Entry[]>();private concepts:Map<string,CompanyFacts['concepts'][number]>;
 constructor(facts:CompanyFacts,private asOf:string|null,private revisions:StatementRevisions){this.concepts=new Map(facts.concepts.map(concept=>[concept.id,concept]));}
 entries(tag:string):Entry[]{
  const cached=this.cache.get(tag);if(cached)return cached;
  const concept=this.concepts.get(tag),entries:Entry[]=[];
  if(concept)for(const unit of concept.units){
   const groups=new Map<string,FactRow[]>();
   for(const row of queryFacts(concept,{unit,period:'all',asOf:this.asOf,revisions:this.revisions}).rows){const key=(row.start??'')+'|'+row.end,group=groups.get(key)??[];group.push(row);groups.set(key,group);}
   for(const rows of groups.values())entries.push({tag,start:rows[0].start,end:rows[0].end,unit,days:rows[0].start===null?null:span(rows[0].start,rows[0].end),resolved:resolveGroup(rows)});
  }
  this.cache.set(tag,entries);return entries;
 }
}
export const lineById=new Map(STATEMENT_LINES.map(row=>[row.id,row])),derivedById=new Map(DERIVED_METRICS.map(row=>[row.id,row]));
export function unitFor(measure:LineMeasure,currency:string):string{return measure==='currency'?currency:measure==='per-share'?currency+'/shares':measure==='shares'?'shares':measure==='percent'?'%':'x';}
/** Currency units present on monetary statement concepts, most observations first. With a cutoff,
 * only observations filed on or before it count (undated ones are excluded, as in queries). */
export function statementCurrencies(facts:CompanyFacts,asOf:string|null=null):string[]{
 if(asOf!==null)dateDay(asOf);
 const tags=new Set(STATEMENT_LINES.filter(row=>row.measure==='currency').flatMap(row=>row.tags)),counts=new Map<string,number>();
 for(const concept of facts.concepts)if(tags.has(concept.id))for(const row of concept.observations)if(/^[A-Z]{3}$/.test(row.unit)&&(asOf===null||row.filed!==null&&row.filed<=asOf))counts.set(row.unit,(counts.get(row.unit)??0)+1);
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([unit])=>unit);
}
const missing=(end:string,unit:string|null,reason:string,method:CellMethod|null=null,refused=false):StatementCell=>({value:null,reason,refused,start:null,end,unit,tag:null,filed:null,form:null,accession:null,method,inputs:[]});
const fromEntry=(entry:Entry,method:CellMethod):StatementCell=>({value:entry.resolved.value,reason:entry.resolved.reason,refused:entry.resolved.value===null,start:entry.start,end:entry.end,unit:entry.unit,tag:entry.tag,filed:entry.resolved.row.filed,form:entry.resolved.row.form,accession:entry.resolved.row.accession,method,inputs:[]});
function combine(spec:StatementLineSpec,parts:{entry:Entry;sign:1|-1}[],start:string,end:string,unit:string,method:CellMethod):StatementCell{
 const broken=parts.find(part=>part.entry.resolved.value===null);
 if(broken)return missing(end,unit,'TTM input '+(broken.entry.start??'')+' to '+broken.entry.end+' is unavailable: '+broken.entry.resolved.reason,method,true);
 const inputs=parts.map(({entry,sign}):StatementInput=>({id:spec.id,label:spec.label,tag:entry.tag,start:entry.start,end:entry.end,value:entry.resolved.value!,sign,filed:entry.resolved.row.filed,form:entry.resolved.row.form,accession:entry.resolved.row.accession}));
 return {value:inputs.reduce((sum,input)=>sum+input.sign*input.value,0),reason:null,refused:false,start,end,unit,tag:parts[0].entry.tag,filed:maxFiled(inputs),form:null,accession:null,method,inputs};
}
function ttmFromEntries(spec:StatementLineSpec,entries:Entry[],end:string,unit:string):StatementCell|null{
 const durations=entries.filter(entry=>entry.unit===unit&&entry.start!==null);
 const yearly=durations.filter(entry=>entry.end===end&&annual(entry.days));
 if(yearly.length>1)return missing(end,unit,'Several annual periods under '+yearly[0].tag+' end on '+end+'. OpenCandle does not choose one.',null,true);
 if(yearly.length)return fromEntry(yearly[0],'reported-annual');
 if(!spec.additive)return null;
 const quarters:Entry[]=[];let cursor=end;
 for(let i=0;i<4;i++){const found=durations.filter(entry=>entry.end===cursor&&quarter(entry.days));if(found.length!==1)break;quarters.unshift(found[0]);cursor=addDays(found[0].start!,-1);}
 if(quarters.length===4&&annual(span(quarters[0].start!,end)))return combine(spec,quarters.map(entry=>({entry,sign:1})),quarters[0].start!,end,unit,'four-quarters');
 const ytds=durations.filter(entry=>entry.end===end&&entry.days!==null&&entry.days>=60&&entry.days<300).sort((a,b)=>b.days!-a.days!);
 for(const ytd of ytds){
  const years=durations.filter(entry=>entry.end===addDays(ytd.start!,-1)&&annual(entry.days));if(years.length!==1)continue;const year=years[0];
  const priors=durations.filter(entry=>entry.start===year.start&&entry.end<year.end&&Math.abs(entry.days!-ytd.days!)<=7);if(priors.length!==1)continue;const prior=priors[0];
  if(!annual(span(addDays(prior.end,1),end)))continue;
  return combine(spec,[{entry:year,sign:1},{entry:ytd,sign:1},{entry:prior,sign:-1}],addDays(prior.end,1),end,unit,'annual-plus-ytd');
 }
 return null;
}
interface Context {index:FactIndex;options:StatementOptions;memo:Map<string,StatementCell>}
/** Other-unit note, limited to entries that would qualify for this view's period rule. */
function otherUnitNote(spec:StatementLineSpec,ctx:Context,end:string,unit:string):string|null{
 const basis=ctx.options.basis,qualifies=(entry:Entry)=>spec.kind==='stock'?entry.start===null:basis==='FY'?annual(entry.days):basis==='FQ'?quarter(entry.days):entry.days!==null&&entry.days>=60&&entry.days<=400;
 const others=new Set(spec.tags.flatMap(tag=>ctx.index.entries(tag)).filter(entry=>entry.end===end&&entry.unit!==unit&&qualifies(entry)).map(entry=>entry.unit));
 return others.size?'Reported only in '+[...others].sort().join(', ')+', not '+unit+'. OpenCandle does not convert units or currencies.':null;
}
function lineCell(spec:StatementLineSpec,end:string,ctx:Context):StatementCell{
 const unit=unitFor(spec.measure,ctx.options.currency),basis=ctx.options.basis;
 if(spec.kind==='stock'){
  for(const tag of spec.tags){const found=ctx.index.entries(tag).find(entry=>entry.end===end&&entry.start===null&&entry.unit===unit);if(found)return fromEntry(found,'reported');}
  return missing(end,unit,otherUnitNote(spec,ctx,end,unit)??'No instant value is reported at '+end+'.');
 }
 if(basis==='TTM'){
  for(const tag of spec.tags){const cell=ttmFromEntries(spec,ctx.index.entries(tag),end,unit);if(cell)return cell;}
  return missing(end,unit,otherUnitNote(spec,ctx,end,unit)??(spec.additive?'No reported twelve-month period, four contiguous reported quarters, or annual plus matching year-to-date periods end on '+end+'.':'Per-share and share-count values are not additive. TTM is shown only where a twelve-month period is reported.'));
 }
 const band=basis==='FY'?annual:quarter;
 for(const tag of spec.tags){
  const found=ctx.index.entries(tag).filter(entry=>entry.end===end&&entry.unit===unit&&band(entry.days));
  if(found.length>1)return missing(end,unit,'Several '+(basis==='FY'?'annual':'quarterly')+' periods under '+tag+' end on '+end+' ('+found.map(entry=>entry.start).join(', ')+'). OpenCandle does not choose one.',null,true);
  if(found.length)return fromEntry(found[0],'reported');
 }
 const note=otherUnitNote(spec,ctx,end,unit);if(note)return missing(end,unit,note);
 if(basis==='FQ'&&spec.tags.some(tag=>ctx.index.entries(tag).some(entry=>entry.end===end&&entry.unit===unit&&entry.days!==null&&entry.days>120)))return missing(end,unit,'Only a longer period ending '+end+' is reported, not a standalone quarter. OpenCandle does not subtract year-to-date totals.');
 return missing(end,unit,'Not reported for the period ending '+end+'.');
}
function labelOf(id:string){return lineById.get(id)?.label??derivedById.get(id)?.label??id;}
function cellById(id:string,end:string,ctx:Context):StatementCell{
 const key=id+'|'+end,cached=ctx.memo.get(key);if(cached)return cached;
 const spec=lineById.get(id),derived=derivedById.get(id);
 const cell=spec?lineCell(spec,end,ctx):derived?derivedCell(derived,end,ctx):missing(end,null,'Unknown line '+id+'.');
 ctx.memo.set(key,cell);return cell;
}
function derivedCell(spec:DerivedMetricSpec,end:string,ctx:Context):StatementCell{
 const unit=unitFor(spec.measure,ctx.options.currency),[a,b]=spec.inputs.map(id=>cellById(id,end,ctx)),[la,lb]=spec.inputs.map(labelOf);
 const fail=(reason:string,refused=false)=>missing(end,unit,reason,'derived',refused);
 if(a.value===null)return fail(la+' is unavailable: '+a.reason,a.refused);
 if(b.value===null)return fail((spec.operation==='difference'?'':'Denominator ')+lb+' is unavailable: '+b.reason,b.refused);
 if(a.start!==b.start||a.end!==b.end)return fail('Inputs cover different periods ('+(a.start??'instant')+' to '+a.end+' versus '+(b.start??'instant')+' to '+b.end+'). OpenCandle does not combine them.');
 if(a.unit!==b.unit)return fail('Inputs use different units ('+a.unit+' versus '+b.unit+'). OpenCandle does not combine them.');
 if(spec.operation!=='difference'&&b.value===0)return fail('Denominator '+lb+' is zero for this period.');
 if(spec.operation!=='difference'&&b.value<0&&spec.negativeDenominator==='reference')return fail('Denominator '+lb+' is negative; the reference definition leaves this result empty.');
 if(spec.operation!=='difference'&&b.value<0&&spec.negativeDenominator==='policy')return fail('Denominator '+lb+' is negative. OpenCandle leaves margins on negative revenue empty; the reference article does not define this case.');
 const value=spec.operation==='difference'?a.value-b.value:spec.operation==='ratio'?a.value/b.value:a.value/b.value*100;
 if(!Number.isFinite(value))return fail('The result is not a finite number.');
 const inputs=[a,b].map((cell,i):StatementInput=>({id:spec.inputs[i],label:i?lb:la,tag:cell.tag,start:cell.start,end:cell.end,value:cell.value!,sign:spec.operation==='difference'&&i===1?-1:1,filed:cell.filed,form:cell.form,accession:cell.accession}));
 return {value,reason:null,refused:false,start:a.start,end,unit,tag:null,filed:maxFiled(inputs),form:null,accession:null,method:'derived',inputs};
}
function columnEnds(ctx:Context):string[]{
 const {statement,basis}=ctx.options,ends=new Set<string>();
 const flows=STATEMENT_LINES.filter(spec=>spec.kind==='flow'&&(statement==='income'||statement==='cashflow'?spec.statement===statement:true));
 for(const spec of flows)for(const tag of spec.tags)for(const entry of ctx.index.entries(tag)){
  // Quarterly balance sheet and statistics also use fiscal-year ends: their instants are reported in
  // the 10-K even when no standalone Q4 flow is, so point-in-time ratios exist there.
  if(basis==='FY'?annual(entry.days):basis==='FQ'?quarter(entry.days)||(statement==='balance'||statement==='statistics')&&annual(entry.days):entry.days!==null&&entry.days>=60&&entry.days<=400)ends.add(entry.end);
 }
 if(statement==='balance'){const instants=new Set(STATEMENT_LINES.filter(spec=>spec.kind==='stock').flatMap(spec=>spec.tags.flatMap(tag=>ctx.index.entries(tag).filter(entry=>entry.start===null).map(entry=>entry.end))));for(const end of [...ends])if(!instants.has(end))ends.delete(end);}
 return [...ends].sort().reverse();
}
export const COLUMN_LIMITS=[4,8,12,20] as const;
export function validateStatementOptions(options:StatementOptions):void{
 if(!['income','balance','cashflow','statistics'].includes(options.statement)||!['FY','FQ','TTM'].includes(options.basis)||!['latest','original'].includes(options.revisions)||!(COLUMN_LIMITS as readonly number[]).includes(options.columns))throw new Error('Invalid statement view options.');
 if(typeof options.currency!=='string'||!options.currency||options.currency.length>40)throw new Error('Choose a reported currency.');
 if(options.asOf!==null)dateDay(options.asOf);
}
/** Build one statement table. Columns are period end dates with at least one value, newest first. */
export function buildStatement(facts:CompanyFacts,options:StatementOptions):StatementTable{
 validateStatementOptions(options);
 const ctx:Context={index:new FactIndex(facts,options.asOf,options.revisions),options,memo:new Map()},notices:string[]=[];
 const specs:(StatementLineSpec|DerivedMetricSpec)[]=[...STATEMENT_LINES.filter(spec=>spec.statement===options.statement),...DERIVED_METRICS.filter(spec=>spec.statements.includes(options.statement))];
 if(options.statement==='balance'&&options.basis==='TTM'){notices.push('Balance-sheet values are point-in-time. Choose Annual (FY) or Quarterly (FQ); TTM applies to income, cash-flow and statistics views.');return {options,columns:[],rows:[],notices,droppedColumns:0,availableColumns:0};}
 const ends=columnEnds(ctx);
 const build=(end:string)=>specs.map(spec=>cellById(spec.id,end,ctx));
 const kept:{end:string;cells:StatementCell[]}[]=[];let dropped=0;
 for(const end of ends){const cells=build(end);if(cells.some(cell=>cell.value!==null||cell.refused))kept.push({end,cells});else dropped++;}
 if(!ends.length)notices.push(options.basis==='FQ'?'No reported 60-120 day periods were found for this view and filing cutoff.':options.basis==='FY'?'No reported 300-400 day periods were found for this view and filing cutoff.':'No reported periods support TTM for this view and filing cutoff.');
 if(dropped)notices.push(dropped+' period end'+(dropped===1?' has':'s have')+' no '+options.currency+' values in this view and '+(dropped===1?'is':'are')+' not shown.');
 const visible=kept.slice(0,options.columns);
 if(kept.length>visible.length)notices.push('Showing the latest '+visible.length+' of '+kept.length+' periods.');
 const rows=specs.map((spec,i):StatementRow=>{const derived='formula'in spec;return {id:spec.id,label:spec.label,measure:spec.measure,unit:unitFor(spec.measure,options.currency),catalogId:spec.catalogId,tags:derived?[]:spec.tags,formula:derived?spec.formula:null,derivedInputs:derived?spec.inputs:null,cells:visible.map(column=>column.cells[i])};});
 return {options,columns:visible.map(column=>column.end),rows,notices,droppedColumns:dropped,availableColumns:kept.length};
}
/** Resolve named lines or derived metrics at one period end without building a table (used by the
 * SymbolDetails summary so each missing value keeps its own reason). options.statement is ignored. */
export function statementCells(facts:CompanyFacts,options:StatementOptions,ids:readonly string[],end:string):Record<string,StatementCell>{
 validateStatementOptions(options);dateDay(end);
 const ctx:Context={index:new FactIndex(facts,options.asOf,options.revisions),options,memo:new Map()};
 return Object.fromEntries(ids.map(id=>[id,cellById(id,end,ctx)]));
}
/** Metric catalog support: every period end the statistics view can use, newest first,
 * before any column limit, so year-over-year lookups can reach older periods. */
export function statementPeriodEnds(facts:CompanyFacts,options:StatementOptions):string[]{
 validateStatementOptions(options);
 return columnEnds({index:new FactIndex(facts,options.asOf,options.revisions),options:{...options,statement:'statistics'},memo:new Map()});
}
/** Resolve catalog line specs (extra) and built-in lines or derived metrics (by id) at several period
 * ends with one shared index. Result key is id + '|' + end. options.statement is ignored. */
export function resolveCatalogCells(facts:CompanyFacts,options:StatementOptions,extra:readonly StatementLineSpec[],ids:readonly string[],ends:readonly string[]):Map<string,StatementCell>{
 validateStatementOptions(options);
 const ctx:Context={index:new FactIndex(facts,options.asOf,options.revisions),options,memo:new Map()},specs=new Map(extra.map(spec=>[spec.id,spec])),out=new Map<string,StatementCell>();
 for(const end of ends)for(const id of ids){const spec=specs.get(id);out.set(id+'|'+end,spec?lineCell(spec,end,ctx):cellById(id,end,ctx));}
 return out;
}
const DIVISORS={units:1,thousands:1e3,millions:1e6,billions:1e9} as const;
export const SCALE_SUFFIX={units:'',thousands:'K',millions:'M',billions:'B'} as const;
export function resolveScale(scale:StatementScale,table:StatementTable):Exclude<StatementScale,'auto'>{
 if(scale!=='auto')return scale;
 const largest=Math.max(0,...table.rows.filter(row=>row.measure==='currency'||row.measure==='shares').flatMap(row=>row.cells.map(cell=>cell.value===null?0:Math.abs(cell.value))));
 return largest>=1e9?'billions':largest>=1e6?'millions':largest>=1e3?'thousands':'units';
}
/** Display only. Exports keep exact reported values. Unknown is shown as unavailable, never 0. */
export function formatStatementValue(value:number|null,measure:LineMeasure,scale:Exclude<StatementScale,'auto'>):string{
 if(value===null)return 'Unavailable';
 const fixed=(n:number,digits:number)=>n.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
 if(measure==='percent')return fixed(value,2)+'%';
 if(measure==='ratio'||measure==='per-share')return fixed(value,2);
 return scale==='units'?value.toLocaleString('en-US',{maximumFractionDigits:2}):fixed(value/DIVISORS[scale],2)+SCALE_SUFFIX[scale];
}
export function describeMethod(cell:StatementCell):string{
 if(cell.value===null)return 'Unavailable: '+cell.reason;
 const inputs=cell.inputs.map(input=>(input.sign<0?'- ':'+ ')+input.label+' '+(input.start?input.start+' to ':'at ')+input.end+' = '+input.value).join(' ');
 return cell.method==='reported'?'Reported under '+cell.tag:cell.method==='reported-annual'?'Reported twelve-month period under '+cell.tag:cell.method==='four-quarters'?'Sum of four reported quarters: '+inputs:cell.method==='annual-plus-ytd'?'Annual plus year-to-date minus prior year-to-date: '+inputs:'Derived: '+inputs;
}
/** Values stay numbers so a CSV writer never treats a negative value as a formula-like string. */
export function statementExportRows(table:StatementTable):(string|number)[][]{
 const out:(string|number)[][]=[['line_id','line','period_start','period_end','value','unit','method','tag','filed','form','accession','reason','formula']];
 for(const row of table.rows)for(const cell of row.cells)out.push([row.id,row.label,cell.start??'',cell.end,cell.value===null?'':cell.value,cell.unit??'',cell.method??'',cell.tag??'',cell.filed??'',cell.form??'',cell.accession??'',cell.reason??'',row.formula??(cell.inputs.length?describeMethod(cell):'')]);
 return out;
}
