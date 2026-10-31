import {dateDay,type FactsDocument} from './company-facts';
import {buildStatement,statementCells,statementCurrencies,lineById,derivedById,type StatementBasis,type StatementCell,type StatementKind,type StatementRevisions} from './statements';
import {linkedDocumentId,type FundamentalsLink,type FundamentalsMarket} from './preferences';
import {demoDataMode} from '../domain/demo-mode';
import type {FundamentalsAvailability,FundamentalsSummarySource,FundamentalsSummaryPeriod,FundamentalsSummaryField,SymbolFundamentalsSummary} from '../ui/symbol-details-fundamentals';
export type {FundamentalsAvailability,FundamentalsSummarySource,FundamentalsSummaryPeriod,FundamentalsSummaryField,SymbolFundamentalsSummary} from '../ui/symbol-details-fundamentals';
/** Twelve fields, the C03 limit. Derived fields list only ids that are also in this summary. */
export const SUMMARY_FIELDS=['revenue','gross_profit','operating_income','net_income','eps_diluted','total_assets','total_liabilities','total_equity','operating_cash_flow','capital_expenditures','free_cash_flow','net_margin'] as const;
export interface SummaryInput {market:FundamentalsMarket;documents:readonly FactsDocument[];links:readonly FundamentalsLink[];asOf:string|null;basis?:Exclude<StatementBasis,'FQ'>;revisions?:StatementRevisions;currency?:string|null;assetClass?:string|null}
const clip=(text:string,max:number)=>text.length<=max?text:text.slice(0,max-1)+'…';
const fits=(text:string|null,max:number)=>text!==null&&text.length<=max?text:null;
/** C03 requires non-empty names and labels; blank upstream text falls back to stated identifiers. */
const nonBlank=(text:string,fallback:string)=>text.trim()?text:fallback;
function shell(input:SummaryInput,availability:FundamentalsAvailability,reason:string,document:FactsDocument|null=null,asOf:string|null=input.asOf):SymbolFundamentalsSummary{
 return {schemaVersion:1,market:{exchange:input.market.exchange,symbol:input.market.symbol,synthetic:input.market.synthetic},availability,reason:clip(reason,400),source:document?sourceOf(document):null,entity:document?{name:clip(nonBlank(document.facts.entityName,'CIK '+document.facts.cik),200),cik:document.facts.cik}:null,asOf,fields:[]};
}
function sourceOf(document:FactsDocument):FundamentalsSummarySource{const s=document.source;return {kind:s.kind,label:clip(nonBlank(s.label,s.kind==='sec-public'?'SEC EDGAR companyfacts':s.kind==='synthetic'?'Synthetic fixture':'Local companyfacts import'),160),retrievedAt:fits(s.retrievedAt,40),sourceUrl:fits(s.sourceUrl,400),sha256:s.sha256};}
/** The period is the latest end where revenue or net income resolves; total assets only as a fallback,
 * so a balance-only date never displaces a period with income values. */
const FLOW_KEYS=['revenue','net_income'],STOCK_KEYS=['total_assets'];
/** Build the summary for one exact market identity from its explicitly linked facts document. */
export function buildSymbolFundamentalsSummary(input:SummaryInput):SymbolFundamentalsSummary{
 const {market}=input,name=market.exchange+':'+market.symbol,basis=input.basis??'FY';
 if(input.asOf!==null){try{if(typeof input.asOf!=='string')throw 0;dateDay(input.asOf);}catch{return shell(input,'error','The filing cutoff is not a valid YYYY-MM-DD date.',null,null);}}
 if(input.assetClass&&/^(etf|fund|etn)$/i.test(input.assetClass))return shell(input,'not-applicable','ETF and fund metrics (AUM, expense ratio, holdings, flows) have no connected source. SEC companyfacts covers operating-company statements only.');
 const id=linkedDocumentId(input.links,market);
 if(id===null)return market.synthetic?shell(input,'not-applicable',/* Plain wording outside the legacy demo */demoDataMode()==='legacy'?'SYNTHETIC DEMO symbols have no reported fundamentals unless a synthetic facts fixture is explicitly linked.':demoDataMode()==='example'?'Example data has no fundamentals.':'No fundamentals for this symbol.'):shell(input,'not-loaded','No company filing data is linked to '+name+'. Open fundamentals to load SEC companyfacts and link it. OpenCandle does not map tickers to CIKs.');
 const document=input.documents.find(row=>row.id===id);
 if(!document)return shell(input,'unavailable','The companyfacts document linked to '+name+' was removed.');
 if((document.source.kind==='synthetic')!==market.synthetic)return shell(input,'unavailable',market.synthetic?'The linked document is real filing data, which a SYNTHETIC DEMO symbol never shows.':'The linked document is a synthetic fixture, which a real-market symbol never shows.');
 const currency=input.currency??statementCurrencies(document.facts,input.asOf)[0]??null;
 if(currency===null)return shell(input,'unavailable','The linked companyfacts document has no reported currency values for statement lines'+(input.asOf?' filed on or before '+input.asOf:'')+'.',document);
 const revisions=input.revisions??'latest',options=(statement:StatementKind)=>({statement,basis:statement==='balance'?(basis==='TTM'?'FQ' as const:'FY' as const):basis,currency,asOf:input.asOf,revisions,columns:20});
 let cells:Record<string,StatementCell>;
 try{
  const ends=[...new Set((['income','balance','cashflow'] as const).flatMap(statement=>buildStatement(document.facts,options(statement)).columns))].sort().reverse();
  const has=(keys:string[])=>(day:string)=>{const found=statementCells(document.facts,options('statistics'),keys,day);return keys.some(id=>found[id].value!==null);};
  const end=ends.find(has(FLOW_KEYS))??ends.find(has(STOCK_KEYS));
  if(!end)return shell(input,'unavailable','No '+(basis==='FY'?'annual':'TTM')+' revenue, net income or total assets in '+currency+' were filed '+(input.asOf?'on or before '+input.asOf:'in this document')+'.',document);
  cells=statementCells(document.facts,options('statistics'),SUMMARY_FIELDS,end);
 }catch(error){return shell(input,'error','Fundamentals could not be computed: '+(error instanceof Error?error.message:String(error)),document);}
 const end=Object.values(cells)[0].end;
 const fields=SUMMARY_FIELDS.map((fieldId):FundamentalsSummaryField=>{
  const spec=lineById.get(fieldId),derived=derivedById.get(fieldId),found=cells[fieldId],stock=spec?.kind==='stock';
  const label=clip((spec?.label??derived!.label)+(stock?'':' ('+basis+')'),80),value=found.value;
  return {id:fieldId,label,value,unit:fits(found.unit,40),period:{start:found.start,end,fiscalYear:null,fiscalPeriod:stock?'Instant':basis},filed:found.filed,form:fits(found.form,20),accession:fits(found.accession,40),missingReason:value===null?clip(found.reason??'Not reported for the period ending '+end+'.',200):null,...(derived?{derived:{formula:clip(derived.formula,200),inputs:[...derived.inputs]}}:{})};
 });
 return {...shell(input,'available','Period ending '+end+' ('+(basis==='FY'?'reported annual':'TTM')+'), '+(input.asOf?'filed on or before '+input.asOf:'latest supplied filings')+', '+(revisions==='latest'?'latest filed version':'as first reported')+'. SEC as-reported tags, not vendor-standardized; no prices, float or estimates.',document),fields};
}
/** Stable-identity memo, as the C03 contract requires: identical inputs return the same object. */
export function createSummaryMemo(limit=200){
 const byDocument=new WeakMap<readonly FactsDocument[],Map<string,SymbolFundamentalsSummary>>();
 return (input:SummaryInput):SymbolFundamentalsSummary=>{
  const key=JSON.stringify([input.market.exchange,input.market.symbol,input.market.synthetic,linkedDocumentId(input.links,input.market),input.asOf,input.basis??'FY',input.revisions??'latest',input.currency??null,input.assetClass??null]);
  let cache=byDocument.get(input.documents);if(!cache){cache=new Map();byDocument.set(input.documents,cache);}
  // Least-recently-used eviction, one entry at a time, so summaries still on screen keep their identity.
  const hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit;}
  if(cache.size>=limit)cache.delete(cache.keys().next().value!);
  const summary=buildSymbolFundamentalsSummary(input);cache.set(key,summary);return summary;
 };
}
