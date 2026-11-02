import type {CompanyFacts} from './company-facts';
import {dateDay} from './company-facts';
import {lineById,statementCurrencies} from './statements';
import {FactStore,LineEngine,combine,derivedAt,derivedYoy,type PitKind,type PitLine,type Struct} from './pit-periods';
import {alignEvents,availabilityResolver,barClock} from './pit-align';
import {alpacaSplits,barFactors,inferRestatementSplits,mergeSplits,vintageFactor,type BarFactors,type SplitSeries} from './pit-splits';
import type {PeBandsRequest,PeBandsResult,PitChart,PitCompanyInput,PitDisplay,PitMetricKey,PitMetricSpec,PitPeriod,PitRequest,PitRevisions,PitSeries,PitSplit,PitStamp,PitVersion} from './pit-types';
/** Point-in-time fundamental metrics on chart bars: statement lines, margins, valuation ratios, P/E bands and the
 * Graham number. Everything is on one split basis; ratios use each bar's own close. */
const tagsOf=(id:string)=>lineById.get(id)!.tags;
const flow=(id:string,label:string,concept:string,tags:readonly string[],measure:PitLine['measure']='money'):PitLine=>({id,label,concept,tags,measure,kind:'flow'});
const instant=(id:string,label:string,concept:string,tags:readonly string[],measure:PitLine['measure']='money',positiveOnly=false):PitLine=>({id,label,concept,tags,measure,kind:'instant',...(positiveOnly?{positiveOnly}:{})});
const SHARE_TAGS=['dei:EntityCommonStockSharesOutstanding','us-gaap:CommonStockSharesOutstanding'];
/** Statement lines: the statements.ts tag lists, plus the fallback tags appended here. */
export const PIT_LINES=Object.freeze({
 revenue:flow('revenue','Revenue','revenue',tagsOf('revenue')),
 net_income:flow('net_income','Net income','net income',tagsOf('net_income')),
 gross_profit:flow('gross_profit','Gross profit','gross profit',tagsOf('gross_profit')),
 operating_income:flow('operating_income','Operating income','operating income',tagsOf('operating_income')),
 ocf:flow('ocf','Operating cash flow','operating cash flow',[...tagsOf('operating_cash_flow'),'us-gaap:NetCashProvidedByUsedInOperatingActivitiesContinuingOperations']),
 capex:flow('capex','Capex','capital expenditures',[...tagsOf('capital_expenditures'),'us-gaap:PaymentsToAcquireProductiveAssets']),
 eps:flow('eps','Diluted EPS','diluted EPS',tagsOf('eps_diluted'),'per-share'),
 dps:flow('dps','Dividends per share','dividends per share',['us-gaap:CommonStockDividendsPerShareDeclared','us-gaap:CommonStockDividendsPerShareCashPaid'],'per-share'),
 current_assets:instant('current_assets','Current assets','current assets',tagsOf('current_assets')),
 current_liabilities:instant('current_liabilities','Current liabilities','current liabilities',tagsOf('current_liabilities')),
 total_liabilities:instant('total_liabilities','Total liabilities','total liabilities',tagsOf('total_liabilities')),
 total_equity:instant('total_equity',"Shareholders' equity","shareholders' equity",tagsOf('total_equity')),
 preferred:instant('preferred','Preferred stock','preferred stock',['us-gaap:PreferredStockValue']),
 shares:instant('shares','Shares outstanding','shares outstanding',SHARE_TAGS,'count',true),
 shares_balance:instant('shares_balance','Shares outstanding','shares outstanding',['us-gaap:CommonStockSharesOutstanding'],'count',true),
 shares_cover:instant('shares_cover','Shares outstanding','shares outstanding',['dei:EntityCommonStockSharesOutstanding'],'count',true),
});
const m=(key:PitMetricKey,label:string,short:string,measure:PitMetricSpec['measure'],ratio=false):PitMetricSpec=>({key,label,short,measure,ratio});
export const PIT_METRICS:readonly PitMetricSpec[]=Object.freeze([
 m('eps','Diluted EPS','EPS','per-share'),m('revenue','Revenue','Revenue','money'),m('net_income','Net income','Net income','money'),
 m('ocf','Operating cash flow','OCF','money'),m('capex','Capex','Capex','money'),m('fcf','Free cash flow','FCF','money'),
 m('fcf_margin','FCF margin %','FCF margin','percent'),m('fcf_ps','FCF per share (OpenCandle calculation)','FCF/share','per-share'),
 m('gross_margin','Gross margin %','Gross margin','percent'),m('op_margin','Operating margin %','Operating margin','percent'),m('net_margin','Net margin %','Net margin','percent'),
 m('current_ratio','Current ratio','Current ratio','ratio'),m('liab_equity','Total liabilities to equity','Liabilities/equity','ratio'),
 m('shares','Shares outstanding','Shares','count'),m('dps','Dividends per share','DPS','per-share'),
 m('pe','P/E','P/E','ratio',true),m('ey','Earnings yield %','Earnings yield','percent',true),m('mcap','Market cap','Market cap','money',true),
 m('ps','P/S','P/S','ratio',true),m('pb','P/B','P/B','ratio',true),m('pfcf','P/FCF','P/FCF','ratio',true),m('fcfy','FCF yield %','FCF yield','percent',true),m('dy','Dividend yield %','Dividend yield','percent',true),
]);
export const pitMetric=(key:PitMetricKey)=>PIT_METRICS.find(spec=>spec.key===key)!;
/** Fixed texts, shared with the indicator layer. */
export const PIT_TEXT=Object.freeze({
 totalReturn:'Ratios need split-adjusted or raw prices; this chart uses total-return prices.',
 epsNotPositive:(v:string)=>'P/E is not meaningful while TTM EPS is zero or negative ('+v+'). Choose Earnings yield to chart it.',
 staleShares:(date:string)=>'The latest share count ('+date+') is over a year old.',
 multiClass:(entity:string,tickers:readonly string[])=>entity+' has several share classes'+(tickers.length>1?' ('+tickers.join(', ')+')':'')+'. Market value needs each class\'s price, so this is left empty.',
 untagged:(entity:string,concept:string)=>entity+' does not tag '+concept+' in its filings.',
 noCurrency:(currency:string)=>'The loaded dataset does not state a currency, so it cannot be matched to the '+currency+' filing values. OpenCandle never guesses a currency.',
 currencyMismatch:(price:string,currency:string)=>'The loaded price is in '+price+' but the filing values are in '+currency+'. OpenCandle does not convert currencies.',
 splitsUnknown:(date:string)=>'Splits after '+date+' are not known without Alpaca corporate actions.',
 ownHistoryShort:(years:string)=>'Own-history bands need 1 year of bars; this chart has '+years+' years.',
 ownHistoryEarly:'Own-history bands need 1 year of P/E history before this bar.',
});
const fmt=(v:number)=>v.toLocaleString('en-US',{maximumFractionDigits:4});
const daysBetween=(from:string,to:string)=>dateDay(to)-dateDay(from);
interface Events {versions:PitVersion[];untagged:string|null}
const NO_EVENTS:Events={versions:[],untagged:null};
type Fn=(values:number[])=>{value:number|null;reason?:string|null};
const identity:Fn=([v])=>({value:v});
/** One company's filings, prepared for point-in-time use. Build it with buildPitCompany. */
export class PitCompany {
 readonly cik:string;readonly entityName:string;readonly retrievedAt:string;
 /** Filing currency (most common statement currency), or null when no monetary facts exist. */
 readonly currency:string|null;
 /** Set when this company cannot be charted at all (no US GAAP facts). */
 readonly gate:string|null;
 readonly splits:readonly PitSplit[];readonly alpacaLoaded:boolean;readonly latestFiled:string|null;
 readonly classTickers:readonly string[];readonly multiClass:boolean;
 private store:FactStore;private engines=new Map<PitRevisions,LineEngine>();private memo=new Map<string,Events>();
 constructor(input:PitCompanyInput){
  const facts=input.facts;
  this.cik=facts.cik;this.entityName=facts.entityName;this.retrievedAt=input.retrievedAt;
  this.store=new FactStore(facts,availabilityResolver(input.acceptance));
  const namespaces=new Set(facts.concepts.map(c=>c.namespace));
  this.gate=namespaces.has('us-gaap')?null:namespaces.has('ifrs-full')?facts.entityName+' reports under IFRS. This version reads US GAAP filings only.':facts.entityName+' has no US GAAP facts in its filings.';
  let currency:string|null=statementCurrencies(facts)[0]??null;
  if(!currency)for(const unit of this.store.units('us-gaap:EarningsPerShareDiluted'))if(/^[A-Z]{3}\/shares$/.test(unit)){currency=unit.slice(0,3);break;}
  this.currency=currency;
  this.classTickers=[...new Set(input.classTickers??[])];this.multiClass=this.classTickers.length>1;
  this.latestFiled=this.store.latestFiled();
  this.alpacaLoaded=Array.isArray(input.splitActions);
  const series:SplitSeries[]=[];
  for(const [tag,positive] of [['us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding',false],['dei:EntityCommonStockSharesOutstanding',true]] as const)for(const f of this.store.periods(tag,'shares',positive))series.push({kind:'shares',vintages:f.vintages});
  for(const unit of this.store.units('us-gaap:EarningsPerShareDiluted'))if(unit.endsWith('/shares'))for(const f of this.store.periods('us-gaap:EarningsPerShareDiluted',unit))series.push({kind:'eps',vintages:f.vintages});
  this.splits=mergeSplits(this.alpacaLoaded?alpacaSplits(input.splitActions!):null,inferRestatementSplits(series));
 }
 engine(revisions:PitRevisions):LineEngine{
  let e=this.engines.get(revisions);
  if(!e){const cache=new Map<string,number>(),splits=this.splits;e=new LineEngine(this.store,revisions,this.currency??'USD',filed=>{let k=cache.get(filed);if(k===undefined){k=vintageFactor(splits,filed);cache.set(filed,k);}return k;});this.engines.set(revisions,e);}
  return e;
 }
 private build(key:string,make:()=>Events):Events{let hit=this.memo.get(key);if(!hit){hit=make();this.memo.set(key,hit);}return hit;}
 private series(engine:LineEngine,lines:readonly PitLine[],kind:PitKind,display:PitDisplay,label:string,fn:Fn,ends?:readonly string[]):Events{
  const untagged=lines.find(l=>!engine.tagged(l));if(untagged)return {versions:[],untagged:PIT_TEXT.untagged(this.entityName,untagged.concept)};
  const all=ends??[...new Set(lines.flatMap(l=>engine.ends(l,kind)))].sort(),versions:PitVersion[]=[];
  for(const end of all){const s:Struct|null=display==='yoy'?derivedYoy(engine,lines,kind,end,label,fn):derivedAt(engine,lines,kind,end,label,fn);if(s)versions.push(...s.versions);}
  return {versions,untagged:null};
 }
 /** Version events of a statement metric (not ratios), on the latest split basis. */
 statementEvents(metric:PitMetricKey,period:PitPeriod,display:PitDisplay,revisions:PitRevisions):Events{
  return this.build(['s',metric,period,display,revisions].join('|'),()=>{
   const engine=this.engine(revisions),L=PIT_LINES,kind:PitKind=period==='ttm'?'ttm':period==='quarterly'?'quarter':'annual',label=pitMetric(metric).label;
   const pct=(num:(v:number[])=>number):Fn=>v=>{const r=v[v.length-1];return r<=0?{value:null,reason:'Revenue is zero or negative for this period, so the margin is not meaningful.'}:{value:num(v)/r*100};};
   const instants=(lines:readonly PitLine[],fn:Fn)=>{
    let ends=[...new Set(lines.flatMap(l=>engine.ends(l,'instant')))].sort();
    if(period==='annual'){const fy=this.store.fiscalYearEnds();ends=ends.filter(e=>fy.has(e));}
    return this.series(engine,lines,'instant',display,label,fn,ends);
   };
   switch(metric){
    case 'eps':return this.series(engine,[L.eps],kind,display,label,identity);
    case 'revenue':return this.series(engine,[L.revenue],kind,display,label,identity);
    case 'net_income':return this.series(engine,[L.net_income],kind,display,label,identity);
    case 'ocf':return this.series(engine,[L.ocf],kind,display,label,identity);
    case 'capex':return this.series(engine,[L.capex],kind,display,label,identity);
    case 'dps':return this.series(engine,[L.dps],kind,display,label,identity);
    case 'fcf':return this.series(engine,[L.ocf,L.capex],kind,display,label,([o,c])=>({value:o-c}));
    case 'fcf_margin':return this.series(engine,[L.ocf,L.capex,L.revenue],kind,display,label,pct(([o,c])=>o-c));
    case 'gross_margin':return this.series(engine,[L.gross_profit,L.revenue],kind,display,label,pct(([g])=>g));
    case 'op_margin':return this.series(engine,[L.operating_income,L.revenue],kind,display,label,pct(([o])=>o));
    case 'net_margin':return this.series(engine,[L.net_income,L.revenue],kind,display,label,pct(([n])=>n));
    case 'current_ratio':return instants([L.current_assets,L.current_liabilities],([a,l])=>l<=0?{value:null,reason:'Current liabilities are zero or negative; the reference definition leaves this result empty.'}:{value:a/l});
    case 'liab_equity':return instants([L.total_liabilities,L.total_equity],([l,e])=>e===0?{value:null,reason:"Shareholders' equity is zero for this period, so the ratio is left empty."}:{value:l/e});
    case 'shares':{const out=instants([L.shares],identity);return {...out,versions:out.versions.map(v=>v.conflict?{...v,reason:PIT_TEXT.multiClass(this.entityName,this.classTickers)}:v)};}
    default:return NO_EVENTS;
   }
  });
 }
 /** Shareholders' equity at each balance-sheet date (instants). */
 equityEvents(revisions:PitRevisions):Events{
  return this.build('equity|'+revisions,()=>this.series(this.engine(revisions),[PIT_LINES.total_equity],'instant','value',"Shareholders' equity",identity));
 }
 /** Book value per share: (equity - preferred stock when tagged) / the share count at the equity date (the balance-sheet
  * count on that date, else the cover-page count of the same filing). */
 bvpsEvents(revisions:PitRevisions):Events{
  return this.build('bvps|'+revisions,()=>{
   const engine=this.engine(revisions),L=PIT_LINES;
   if(!engine.tagged(L.total_equity))return {versions:[],untagged:PIT_TEXT.untagged(this.entityName,L.total_equity.concept)};
   const versions:PitVersion[]=[];
   for(const end of engine.ends(L.total_equity,'instant')){
    const eq=engine.at(L.total_equity,'instant',end);if(!eq)continue;
    const count=engine.at(L.shares_balance,'instant',end)??engine.instantFromFiling(L.shares_cover,eq.versions[0].accession);
    if(!count){versions.push({...eq.versions[0],value:null,reason:'No share count is reported at '+end+'.',method:'computed',tag:null});continue;}
    const pref=engine.at(L.preferred,'instant',end),inputs=[eq.versions,count.versions,...(pref?[pref.versions]:[])];
    for(const v of combineBook(inputs,end))versions.push(v.conflict?{...v,reason:PIT_TEXT.multiClass(this.entityName,this.classTickers)}:v);
   }
   return {versions,untagged:null};
  });
 }
}
function combineBook(inputs:PitVersion[][],end:string):PitVersion[]{
 return combine(inputs,([e,c,p])=>c.value!<=0?{value:null,reason:'The share count at '+end+' is not positive.'}:{value:(e.value!-(p?p.value!:0))/c.value!},{start:null,end,tag:null,method:'computed'});
}
const companies=new WeakMap<CompanyFacts,{input:PitCompanyInput;company:PitCompany}>();
/** The prepared company for these inputs. The same facts object with the same acceptance map, split actions, ticker
 * list and retrieval time returns the same instance, so its memoized events are reused across recomputes. */
export function buildPitCompany(input:PitCompanyInput):PitCompany{
 const hit=companies.get(input.facts);
 if(hit&&hit.input.retrievedAt===input.retrievedAt&&(hit.input.acceptance??null)===(input.acceptance??null)&&(hit.input.splitActions??null)===(input.splitActions??null)&&sameList(hit.input.classTickers,input.classTickers))return hit.company;
 const company=new PitCompany(input);companies.set(input.facts,{input,company});return company;
}
const sameList=(a:readonly string[]|undefined,b:readonly string[]|undefined)=>(a??[]).length===(b??[]).length&&(a??[]).every((x,i)=>x===(b??[])[i]);
/** Stamp table built as bars reference versions; each version gets one row. */
class Stamps {
 table:PitStamp[]=[];private rows=new Map<PitVersion,number>();
 constructor(private retrievedAt:string){}
 row(v:PitVersion,method=v.method):number{
  let i=this.rows.get(v);
  if(i===undefined){i=this.table.length;this.table.push({start:v.start,end:v.end,filed:v.filed,accession:v.accession,form:v.form,tag:v.tag,method,retrievedAt:this.retrievedAt,availableAt:v.at,note:v.note});this.rows.set(v,i);}
  return i;
 }
}
const nulls=(n:number)=>new Array<number|null>(n).fill(null);
/** An all-empty series with a reason (gates, missing service, errors). */
export function emptyPitSeries(n:number,reason:string|null,notes:string[]=[]):PitSeries{
 return {values:nulls(n),fundamentalStamps:{table:[],index:new Int32Array(n).fill(-1)},gapNotes:new Array(n).fill(null),reason,notes};
}
interface Prepared {dates:string[];ends:Float64Array;factors:BarFactors;notes:string[]}
function prepare(company:PitCompany,chart:PitChart,perShare:boolean):Prepared{
 const {dates,ends}=barClock(chart.bars,chart.interval),factors=barFactors(company.splits,chart.bars,dates,chart.adjustment),notes=[...factors.seriesNotes];
 if(perShare&&!company.alpacaLoaded&&company.latestFiled)notes.push(PIT_TEXT.splitsUnknown(company.latestFiled));
 return {dates,ends,factors,notes};
}
/** The version each bar shows, or null. */
const aligned=(events:Events,ends:Float64Array)=>{const idx=alignEvents(events.versions,ends);return (i:number)=>idx[i]<0?null:events.versions[idx[i]];};
function ratioGate(company:PitCompany,chart:PitChart):string|null{
 if(chart.adjustment==='total-return')return PIT_TEXT.totalReturn;
 const currency=company.currency;if(!currency)return 'No filing currency is reported for '+company.entityName+'.';
 if(!chart.currency)return PIT_TEXT.noCurrency(currency);
 if(chart.currency!==currency)return PIT_TEXT.currencyMismatch(chart.currency,currency);
 return null;
}
function shareGate(company:PitCompany,v:PitVersion,date:string):string|null{
 if(v.value===null)return v.reason;
 if(daysBetween(v.end,date)>400)return PIT_TEXT.staleShares(v.end);
 if(company.multiClass)return PIT_TEXT.multiClass(company.entityName,company.classTickers);
 return null;
}
/** One `fundamental` plot on chart bars. Never throws: failures come back as an empty series with a reason. */
export function computeFundamentalSeries(company:PitCompany,chart:PitChart,request:PitRequest):PitSeries{
 const n=chart.bars.length;
 try{
  if(company.gate)return emptyPitSeries(n,company.gate);
  const spec=pitMetric(request.metric);if(!spec)return emptyPitSeries(n,'Unknown fundamental metric.');
  const usesShares=spec.ratio||spec.measure==='per-share'||spec.measure==='count';
  const prep=prepare(company,chart,usesShares);
  return spec.ratio||spec.key==='fcf_ps'?ratioSeries(company,chart,request,prep):statementSeries(company,chart,request,prep);
 }catch(error){return emptyPitSeries(n,'Fundamental values could not be computed: '+(error instanceof Error?error.message:String(error)));}
}
function statementSeries(company:PitCompany,chart:PitChart,request:PitRequest,prep:Prepared):PitSeries{
 const n=chart.bars.length,spec=pitMetric(request.metric),events=company.statementEvents(request.metric,request.period,request.display,request.revisions);
 if(events.untagged)return emptyPitSeries(n,events.untagged,prep.notes);
 const at=aligned(events,prep.ends),stamps=new Stamps(company.retrievedAt),out=emptyPitSeries(n,null,prep.notes),scale=request.display==='value'?spec.measure:'percent';
 for(let i=0;i<n;i++){
  const v=at(i);if(!v)continue;
  out.fundamentalStamps.index[i]=stamps.row(v);
  if(v.value===null){out.gapNotes[i]=v.reason;continue;}
  if(spec.key==='shares'&&request.display==='value'){const gate=shareGate(company,v,prep.dates[i]);if(gate){out.gapNotes[i]=gate;continue;}}
  if(scale==='per-share'||scale==='count'){
   const f=prep.factors.factor[i];if(Number.isNaN(f)){out.gapNotes[i]=prep.factors.notes[i];continue;}
   out.values[i]=scale==='per-share'?v.value*f:v.value/f;
  }else out.values[i]=v.value;
 }
 out.fundamentalStamps={table:stamps.table,index:out.fundamentalStamps.index};
 return out;
}
function ratioSeries(company:PitCompany,chart:PitChart,request:PitRequest,prep:Prepared):PitSeries{
 const n=chart.bars.length,key=request.metric,rev=request.revisions,priced=key!=='fcf_ps';
 if(priced){const gate=ratioGate(company,chart);if(gate)return emptyPitSeries(n,gate,prep.notes);}
 const needShares=key==='mcap'||key==='ps'||key==='pb'||key==='pfcf'||key==='fcfy'||key==='fcf_ps';
 const primaryEvents=key==='pe'||key==='ey'?company.statementEvents('eps','ttm','value',rev):key==='ps'?company.statementEvents('revenue','ttm','value',rev):key==='pb'?company.equityEvents(rev):key==='pfcf'||key==='fcfy'||key==='fcf_ps'?company.statementEvents('fcf','ttm','value',rev):key==='dy'?company.statementEvents('dps','ttm','value',rev):company.statementEvents('shares','ttm','value',rev);
 if(primaryEvents.untagged)return emptyPitSeries(n,primaryEvents.untagged,prep.notes);
 const shareEvents=needShares?company.statementEvents('shares','ttm','value',rev):null;
 if(shareEvents?.untagged)return emptyPitSeries(n,shareEvents.untagged,prep.notes);
 const primary=aligned(primaryEvents,prep.ends),shares=shareEvents?aligned(shareEvents,prep.ends):null,stamps=new Stamps(company.retrievedAt),out=emptyPitSeries(n,null,prep.notes);
 for(let i=0;i<n;i++){
  const p=primary(i);if(!p)continue;
  out.fundamentalStamps.index[i]=stamps.row(p,'computed');
  const set=(value:number|null,note:string|null=null)=>{if(value!==null&&Number.isFinite(value))out.values[i]=value;else out.gapNotes[i]=note??'The result is not a finite number.';};
  if(p.value===null){out.gapNotes[i]=p.reason;continue;}
  const close=chart.bars[i].close;if(priced&&!(close>0&&Number.isFinite(close))){out.gapNotes[i]='The bar close is not a positive number.';continue;}
  const f=prep.factors.factor[i];
  let count:number|null=null;
  if(shares){
   const s=shares(i);if(!s){out.gapNotes[i]='No share count has been filed yet.';continue;}
   const gate=shareGate(company,s,prep.dates[i]);if(gate){out.gapNotes[i]=gate;continue;}
   if(Number.isNaN(f)){out.gapNotes[i]=prep.factors.notes[i];continue;}
   count=s.value!/f;
  }
  const perShare=(v:number)=>Number.isNaN(f)?null:v*f;
  switch(key){
   case 'pe':{const eps=perShare(p.value);if(eps===null){out.gapNotes[i]=prep.factors.notes[i];break;}if(eps<=0){out.gapNotes[i]=PIT_TEXT.epsNotPositive(fmt(eps));break;}set(close/eps);break;}
   case 'ey':{const eps=perShare(p.value);if(eps===null){out.gapNotes[i]=prep.factors.notes[i];break;}set(eps/close*100);break;}
   case 'dy':{const dps=perShare(p.value);if(dps===null){out.gapNotes[i]=prep.factors.notes[i];break;}set(dps/close*100);break;}
   case 'mcap':set(close*count!);break;
   case 'ps':if(p.value<=0)out.gapNotes[i]='P/S is not meaningful while TTM revenue is zero or negative.';else set(close*count!/p.value);break;
   case 'pb':if(p.value<=0)out.gapNotes[i]="P/B is not meaningful while shareholders' equity is zero or negative.";else set(close*count!/p.value);break;
   case 'pfcf':if(p.value<=0)out.gapNotes[i]='P/FCF is not meaningful while TTM free cash flow is zero or negative.';else set(close*count!/p.value);break;
   case 'fcfy':set(p.value/(close*count!)*100);break;
   case 'fcf_ps':set(p.value/count!);break;
  }
 }
 out.fundamentalStamps={table:stamps.table,index:out.fundamentalStamps.index};
 return out;
}
const shiftYears=(date:string,years:number)=>{const y=Number(date.slice(0,4))-years,md=date.slice(5);const text=String(y).padStart(4,'0')+'-'+md;return md==='02-29'&&!(y%4===0&&(y%100!==0||y%400===0))?text.slice(0,8)+'28':text;};
const lowerBound=(a:readonly number[],x:number)=>{let lo=0,hi=a.length;while(lo<hi){const mid=(lo+hi)>>1;if(a[mid]<x)lo=mid+1;else hi=mid;}return lo;};
interface BandState {sorted:number[];queue:{date:string;pe:number}[];head:number;sum:number;sumsq:number;/** First date with a valid P/E. */first:string|null}
const cloneState=(s:BandState):BandState=>({sorted:s.sorted.slice(),queue:s.queue.slice(s.head),head:0,sum:s.sum,sumsq:s.sumsq,first:s.first});
interface BandMemo {times:Float64Array;pe:(number|null)[];resumeAt:number;state:BandState;median:(number|null)[];upper:(number|null)[];lower:(number|null)[];notes:(string|null)[]}
export interface PeBandsEngine {compute(chart:PitChart):PeBandsResult}
/** P/E bands on price. Multiples: k x TTM EPS. Own history: percentiles (25/50/75) or mean +/- 1 sigma of one P/E per
 * New York date (that date's last close / TTM EPS), over the trailing lookback, causal: a bar uses earlier dates plus
 * its own P/E. Dates with EPS <= 0 are skipped. Bands start 365 days after the first valid P/E date, and the chart needs valid dates spanning 365 days.
 * The per-date window is memoized: when only the last date's bars change (ticks), only those bars are recomputed. */
export function createPeBands(company:PitCompany,request:PeBandsRequest):PeBandsEngine{
 let memo:BandMemo|null=null;
 const lookback=Number.isFinite(request.lookbackYears)&&request.lookbackYears>0?Math.round(request.lookbackYears):5;
 return {compute(chart){
  const n=chart.bars.length,empty=():PeBandsResult=>({median:nulls(n),upper:nulls(n),lower:nulls(n),m1:nulls(n),m2:nulls(n),m3:nulls(n),graham:nulls(n),fundamentalStamps:{table:[],index:new Int32Array(n).fill(-1)},gapNotes:new Array(n).fill(null),reason:null,notes:[]});
  const out=empty();
  try{
   if(company.gate){out.reason=company.gate;return out;}
   const gate=ratioGate(company,chart);if(gate){out.reason=gate;return out;}
   const prep=prepare(company,chart,true);out.notes=prep.notes;
   const epsEvents=company.statementEvents('eps','ttm','value',request.revisions);if(epsEvents.untagged){out.reason=epsEvents.untagged;return out;}
   const eps=aligned(epsEvents,prep.ends),stamps=new Stamps(company.retrievedAt),epsBar=nulls(n),pe=nulls(n),epsNote:(string|null)[]=new Array(n).fill(null);
   for(let i=0;i<n;i++){
    const v=eps(i);if(!v)continue;out.fundamentalStamps.index[i]=stamps.row(v);
    if(v.value===null){epsNote[i]=v.reason;continue;}
    const f=prep.factors.factor[i];if(Number.isNaN(f)){epsNote[i]=prep.factors.notes[i];continue;}
    const e=v.value*f,close=chart.bars[i].close;
    if(e<=0){epsNote[i]=PIT_TEXT.epsNotPositive(fmt(e));continue;}
    epsBar[i]=e;if(close>0&&Number.isFinite(close))pe[i]=close/e;
   }
   out.fundamentalStamps={table:stamps.table,index:out.fundamentalStamps.index};
   for(let i=0;i<n;i++)if(epsBar[i]===null)out.gapNotes[i]=epsNote[i];
   if(request.mode==='multiples'){
    const [a,b,c]=request.multiples;
    for(let i=0;i<n;i++){const e=epsBar[i];if(e===null)continue;out.m1[i]=a*e;out.m2[i]=b*e;out.m3[i]=c*e;}
   }else ownHistory(chart,prep.dates,pe,epsBar,out);
   if(request.graham)grahamLine(company,request.revisions,prep,epsBar,out);
  }catch(error){const r=empty();r.reason='Fundamental values could not be computed: '+(error instanceof Error?error.message:String(error));return r;}
  return out;
 }};
 function ownHistory(chart:PitChart,dates:string[],pe:(number|null)[],epsBar:(number|null)[],out:PeBandsResult){
  const n=pe.length,times=Float64Array.from(chart.bars,b=>b.time);
  // Whole-chart check: P/E dates must span a year somewhere on this chart.
  let first:string|null=null,last:string|null=null;for(let i=0;i<n;i++)if(pe[i]!==null){first??=dates[i];last=dates[i];}
  const spanDays=first&&last?daysBetween(first,last):0;
  if(spanDays<365){out.reason=PIT_TEXT.ownHistoryShort((Math.floor(spanDays/365*10)/10).toFixed(1));return;}
  let start=0,state:BandState={sorted:[],queue:[],head:0,sum:0,sumsq:0,first:null};
  if(memo&&memo.resumeAt<=n&&memo.resumeAt>0){
   let same=true;for(let i=0;i<memo.resumeAt&&same;i++)if(memo.times[i]!==times[i]||memo.pe[i]!==pe[i])same=false;
   if(same){start=memo.resumeAt;state=cloneState(memo.state);for(let i=0;i<start;i++){out.median[i]=memo.median[i];out.upper[i]=memo.upper[i];out.lower[i]=memo.lower[i];if(memo.notes[i]!==null)out.gapNotes[i]=memo.notes[i];}}
  }
  // The memo keeps the window as it stood before the last date's first bar, so ticks on that date resume there.
  let lastDateStart=n-1;while(lastDateStart>0&&dates[lastDateStart-1]===dates[lastDateStart])lastDateStart--;
  let snapshot:BandState|null=start===lastDateStart?cloneState(state):null;
  for(let i=start;i<n;i++){
   const date=dates[i];
   if(i===lastDateStart&&i>start)snapshot=cloneState(state);
   if(i>0&&dates[i-1]!==date){
    // Close the previous date: its last bar's P/E joins the window.
    const prev=pe[i-1];if(prev!==null){state.first??=dates[i-1];state.queue.push({date:dates[i-1],pe:prev});state.sorted.splice(lowerBound(state.sorted,prev),0,prev);state.sum+=prev;state.sumsq+=prev*prev;}
    const cutoff=shiftYears(date,lookback);
    while(state.head<state.queue.length&&state.queue[state.head].date<=cutoff){const old=state.queue[state.head++].pe;state.sorted.splice(lowerBound(state.sorted,old),1);state.sum-=old;state.sumsq-=old*old;}
    if(state.head>4096){state.queue=state.queue.slice(state.head);state.head=0;}
   }
   const x=pe[i],e=epsBar[i];if(x===null||e===null)continue;
   const earliest=state.first??date;
   if(daysBetween(earliest,date)<365){out.gapNotes[i]=PIT_TEXT.ownHistoryEarly;continue;}
   const s=state.sorted,count=s.length+1,pos=lowerBound(s,x),kth=(j:number)=>j<pos?s[j]:j===pos?x:s[j-1];
   let mid:number,hi:number,lo:number;
   if(request.bands==='sigma'){const mean=(state.sum+x)/count,sd=Math.sqrt(Math.max(0,(state.sumsq+x*x)/count-mean*mean));mid=mean;hi=mean+sd;lo=mean-sd;}
   else {const q=(p:number)=>{const h=(count-1)*p,k=Math.floor(h),a=kth(k);return k+1<count?a+(h-k)*(kth(k+1)-a):a;};mid=q(0.5);hi=q(0.75);lo=q(0.25);}
   out.median[i]=mid*e;out.upper[i]=hi*e;out.lower[i]=lo>0?lo*e:null;
  }
  memo=snapshot&&lastDateStart>0?{times,pe:pe.slice(),resumeAt:lastDateStart,state:snapshot,median:out.median.slice(),upper:out.upper.slice(),lower:out.lower.slice(),notes:out.gapNotes.slice()}:null;
 }
 function grahamLine(company:PitCompany,revisions:PitRevisions,prep:Prepared,epsBar:(number|null)[],out:PeBandsResult){
  const events=company.bvpsEvents(revisions);if(events.untagged)return;
  const bvps=aligned(events,prep.ends);
  for(let i=0;i<epsBar.length;i++){
   const e=epsBar[i],b=bvps(i);if(e===null||!b||b.value===null)continue;
   if(daysBetween(b.end,prep.dates[i])>400||company.multiClass)continue;
   const f=prep.factors.factor[i];if(Number.isNaN(f))continue;
   const book=b.value*f;if(book>0)out.graham[i]=Math.sqrt(22.5*e*book);
  }
 }
}
