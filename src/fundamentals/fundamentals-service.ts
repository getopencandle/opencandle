import {FUNDAMENTALS_TEXT,notifyFundamentals,type FundamentalsChartFacts,type FundamentalsLoader,type FundamentalsState} from '../domain/fundamentals-source';
import {newYorkDate,type CorporateActionEvent} from '../domain/chart-events';
import {normalizeSubmissions} from '../analysis-news/filings';
import {normalizeCompanyFacts,type CompanyFacts,type FactsDocument} from './company-facts';
import {lookupCik,parseTickerFile,type CikMap} from './cik-map';
import {linkedDocumentId,type FundamentalsLink,type FundamentalsMarket,type LoadedCikStore} from './preferences';
import {acceptanceFromFilings} from './pit-align';
import {buildPitCompany,type PitCompany} from './pit-metrics';

/**
 * Company filings for the chart's fundamentals indicators: symbol to SEC company (CIK), the gates, one load per company,
 * and the network rule.
 *
 * Network rule. Nothing is requested at startup: restored charts and the off-chart export read saved copies only, and the
 * asset-class and missing-company checks send nothing. A request is sent only after the user adds a fundamentals indicator
 * (activate) or chooses Refresh company data (refresh); the company is then remembered on this PC (LoadedCikStore). A
 * remembered company gets at most one refresh of its companyfacts and submissions per New York day (daily), only while a
 * chart carrying it is on screen (the host calls daily for the visible chart only, never for hidden tabs), only while the
 * "Refresh SEC company data daily" setting is on, and for a restored chart never during startup: only once the app has
 * been open for STARTUP_QUIET_MS or the user has interacted with that chart (interact). The
 * ticker file is refreshed at most every 7 days (the main process cache decides). Without the user's SEC contact no
 * request is sent at all.
 *
 * Order for a symbol without an explicit link: ticker file, then submissions, then the fund and IFRS gates, then
 * companyfacts, so a fund costs one small request and its companyfacts is never fetched.
 */
export type SecRefresh='cache-only'|'if-stale'|'force';
export type SecKind='companyfacts'|'submissions'|'tickers';
export interface SecEnvelope {schemaVersion:1;cik:string|null;entityName:string;data:Record<string,unknown>;provenance:{retrievedAt:string;sourceUrl:string;sha256:string}}
export type SecResult<T>={ok:true;value:T}|{ok:false;error:{code:string;message:string}};
export interface SecCachedValue {envelope:SecEnvelope|null;cachedAt:string|null;fromCache:boolean;refreshError:{code:string;message:string}|null;resumeAt:string|null}
export interface SecDataBridge {
 loadSecData(input:{requestId:string;kind:SecKind;cik:string|null;refresh:SecRefresh}):Promise<SecResult<SecCachedValue>>;
 getSecIdentity?():Promise<SecResult<{set:boolean;value:string}>>;
}
export interface SecIdentityBridge {getSecIdentity():Promise<SecResult<{set:boolean;value:string}>>;setSecIdentity(input:{value:string}):Promise<SecResult<{set:boolean}>>}
export const SEC_CONTACT_HINT='Your name and email. Sent only to SEC with each request, as SEC asks. Stored on this PC only.';
const lvBridge=():Record<string,unknown>|null=>{try{const lv=(globalThis as {window?:{lv?:unknown}}).window?.lv;return lv&&typeof lv==='object'?lv as Record<string,unknown>:null;}catch{return null;}};
/** The desktop bridge's SEC data calls, or null outside the desktop app. */
export function secDataBridge():SecDataBridge|null{const lv=lvBridge();return lv&&typeof lv.loadSecData==='function'?lv as unknown as SecDataBridge:null;}
/** The desktop bridge's SEC contact calls, or null when this build has none. */
export function secIdentityBridge():SecIdentityBridge|null{const lv=lvBridge();return lv&&typeof lv.getSecIdentity==='function'&&typeof lv.setSecIdentity==='function'?lv as unknown as SecIdentityBridge:null;}
const identityListeners=new Set<()=>void>();
/** The SEC contact was saved or cleared: loads waiting for it run again. */
export function notifySecIdentityChanged():void{for(const listener of [...identityListeners])try{listener();}catch{/* one failure never stops the others */}}
export function onSecIdentityChanged(listener:()=>void):()=>void{identityListeners.add(listener);return()=>{identityListeners.delete(listener);};}

export interface FundamentalsServiceOptions {
 bridge:SecDataBridge|null;
 /** The user's explicit chart-symbol links and saved company documents (workspace). */
 links():readonly FundamentalsLink[];documents():readonly FactsDocument[];
 /** The ticker file the user imported in Fundamentals, if any. */
 cikMap():CikMap|null;
 /** The "Refresh SEC company data daily" setting (default on). */
 dailyEnabled():boolean;
 /** The companies the user has loaded before (a per-PC preference); absent = this session only. */
 loadedCiks?:LoadedCikStore;
 now?():number;notify?():void;
}
/** A restored chart waits this long after the app opens (or for the user's first interaction) before its daily refresh. */
export const STARTUP_QUIET_MS=60000;
export interface FundamentalsService {
 loader:FundamentalsLoader;
 company(facts:FundamentalsChartFacts):FundamentalsState;
 /** The user added a fundamentals indicator for this market: the first request may go out now. */
 activate(market:FundamentalsMarket):void;
 /** Refresh company data: a forced reload of this market's company (the main process allows one a minute). */
 refresh(market:FundamentalsMarket):void;
 /** The once-a-day refresh for the markets of the chart on screen. */
 daily(markets:readonly FundamentalsMarket[]):void;
 /** The user interacted with the chart of this market: its daily refresh need not wait for the startup quiet time. */
 interact(market:FundamentalsMarket):void;
 /** Links, documents or the imported ticker file changed: read saved copies again (no request). */
 invalidate():void;
 /** Alpaca split actions for a symbol (null: not loaded). The array identity is kept for reuse. */
 setSplitActions(symbol:string,events:readonly CorporateActionEvent[]|null):void;
 /** The New York date of the last refresh request of each CIK (inspection). */
 lastRefresh(cik:string):string|null;
 dispose():void;
}
/** daily: the once-a-day refresh, which leaves the ticker file to its own 7-day refresh on the next add. */
type Mode='cache'|'network'|'daily'|'force';
interface Prepared {facts:CompanyFacts;retrievedAt:string;acceptance:ReadonlyMap<string,string|null>|null;classTickers:readonly string[]}
interface Entry {key:string;market:FundamentalsMarket;gen:number;state:FundamentalsState['state'];reason:string|null;cik:string|null;company:PitCompany|null;prepared:Prepared|null;activated:boolean;loaded:boolean;interacted:boolean}
interface Submissions {entityType:string|null;forms:string[];acceptance:Map<string,string|null>}
const marketKey=(market:FundamentalsMarket)=>JSON.stringify([market.exchange,market.symbol,market.synthetic]);
const marketOfFacts=(facts:FundamentalsChartFacts):FundamentalsMarket=>({exchange:facts.exchange,symbol:facts.symbol,synthetic:facts.synthetic});
const clock=(iso:string|null)=>{const time=iso?Date.parse(iso):NaN;if(!Number.isFinite(time))return 'a few minutes';const d=new Date(time);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
/** The plain reason for a failed or empty read. */
function reasonFor(error:{code:string;message:string}|null,resumeAt:string|null,identityUnset:boolean,symbol:string):string{
 if(identityUnset||error?.code==='IDENTITY_UNSET'||error?.code==='CONTACT_UNSET')return FUNDAMENTALS_TEXT.identity;
 if(error?.code==='SEC_DISABLED_RUN')return FUNDAMENTALS_TEXT.disabledRun;
 if(error?.code==='RATE_LIMITED')return FUNDAMENTALS_TEXT.backoff(clock(resumeAt));
 if(error)return FUNDAMENTALS_TEXT.offline;
 return FUNDAMENTALS_TEXT.notCached(symbol);
}
export function createFundamentalsService(options:FundamentalsServiceOptions):FundamentalsService{
 const bridge=options.bridge,now=options.now??Date.now,notify=options.notify??notifyFundamentals;
 const entries=new Map<string,Entry>(),memory=new Map<string,SecCachedValue>(),lastDaily=new Map<string,string>(),splitActions=new Map<string,readonly CorporateActionEvent[]|null>();
 const facts=new WeakMap<object,CompanyFacts>(),submissions=new WeakMap<object,Submissions|null>(),tickerMaps=new WeakMap<object,CikMap|null>(),classLists=new WeakMap<CikMap,Map<string,readonly string[]>>();
 let disposed=false,sequence=0;const startedAt=now(),loadedCiks=options.loadedCiks;
 const remember=(cik:string)=>{try{loadedCiks?.add(cik);}catch{/* this session still knows it */}};
 const today=()=>newYorkDate(now()/1000);
 async function read(kind:SecKind,cik:string|null,refresh:SecRefresh):Promise<{value:SecCachedValue|null;error:{code:string;message:string}|null}>{
  const key=kind+':'+(cik??'');
  if(refresh==='cache-only'){const held=memory.get(key);if(held?.envelope)return {value:held,error:null};}
  if(!bridge)return {value:null,error:null};
  let result:SecResult<SecCachedValue>;
  try{result=await bridge.loadSecData({requestId:'fundamentals-'+(++sequence),kind,cik,refresh});}catch(error){return {value:memory.get(key)??null,error:{code:'BRIDGE_ERROR',message:error instanceof Error?error.message:String(error)}};}
  if(!result.ok)return {value:memory.get(key)??null,error:result.error};
  if(result.value.envelope)memory.set(key,result.value);
  return {value:result.value.envelope?result.value:memory.get(key)??result.value,error:result.value.refreshError};
 }
 const tickerMapOf=(envelope:SecEnvelope|null|undefined):CikMap|null=>{
  if(!envelope)return null;if(tickerMaps.has(envelope))return tickerMaps.get(envelope)!;
  let map:CikMap|null=null;try{map=parseTickerFile(JSON.stringify(envelope.data),envelope.provenance.retrievedAt).map;}catch{map=null;}
  tickerMaps.set(envelope,map);return map;
 };
 const fetchedTickerMap=()=>tickerMapOf(memory.get('tickers:')?.envelope);
 const classTickers=(cik:string,...maps:(CikMap|null)[]):readonly string[]=>{
  for(const map of maps){if(!map)continue;let byCik=classLists.get(map);if(!byCik){byCik=new Map();classLists.set(map,byCik);}
   let list=byCik.get(cik);if(!list){list=Object.freeze(map.entries.filter(row=>row.cik===cik).map(row=>row.ticker));byCik.set(cik,list);}if(list.length)return list;}
  return EMPTY;
 };
 const submissionsOf=(envelope:SecEnvelope,cik:string):Submissions|null=>{
  if(submissions.has(envelope))return submissions.get(envelope)!;
  let out:Submissions|null=null;
  try{const doc=normalizeSubmissions(envelope.data,{kind:'sec-public',retrievedAt:envelope.provenance.retrievedAt,sourceUrl:'https://data.sec.gov/submissions/CIK'+cik+'.json',sha256:null});out={entityType:doc.profile?.entityType??null,forms:doc.rows.map(row=>row.form),acceptance:acceptanceFromFilings(doc.rows)};}catch{out=null;}
  submissions.set(envelope,out);return out;
 };
 const factsOf=(envelope:SecEnvelope):CompanyFacts=>{let found=facts.get(envelope);if(!found){found=normalizeCompanyFacts(envelope.data);facts.set(envelope,found);}return found;};
 /** Funds and IFRS filers, from the filing list. */
 const filingGate=(info:Submissions,entity:string):string|null=>{
  const gaap=info.forms.some(form=>/^10-[KQ]/.test(form)),ifrs=info.forms.find(form=>/^(20-F|40-F)/.test(form));
  if(!gaap&&ifrs)return FUNDAMENTALS_TEXT.ifrs(entity,ifrs.replace(/\/A$/,''));
  if(info.entityType&&info.entityType.toLowerCase()!=='operating'||!gaap)return FUNDAMENTALS_TEXT.fund;
  return null;
 };
 const build=(entry:Entry)=>{const p=entry.prepared!;const actions=splitActions.has(entry.market.symbol)?splitActions.get(entry.market.symbol)!:null;return buildPitCompany({facts:p.facts,retrievedAt:p.retrievedAt,acceptance:p.acceptance,splitActions:actions,classTickers:p.classTickers});};
 async function load(entry:Entry,mode:Mode):Promise<void>{
  const gen=++entry.gen,current=()=>!disposed&&entry.gen===gen,symbol=entry.market.symbol;
  if(!entry.company){entry.state='loading';entry.reason=FUNDAMENTALS_TEXT.loading(symbol);}
  const done=(patch:Partial<Entry>)=>{if(!current())return;Object.assign(entry,{loaded:true},patch);notify();};
  const gap=(reason:string)=>done({state:'unavailable',reason,company:null,prepared:null});
  try{
   // The SEC contact is checked first (no network): without it nothing is sent.
   let identityUnset=false;
   if(bridge?.getSecIdentity){try{const identity=await bridge.getSecIdentity();if(!current())return;if(identity.ok&&!identity.value.set)identityUnset=true;}catch{/* the main process refuses unset requests itself */}}
   const network=mode!=='cache'&&!identityUnset,refresh=(kind:SecKind):SecRefresh=>!network||mode==='daily'&&kind==='tickers'?'cache-only':mode==='force'&&kind!=='tickers'?'force':'if-stale';
   const links=options.links(),documentId=linkedDocumentId(links,entry.market),doc=documentId?options.documents().find(row=>row.id===documentId):undefined;
   if(entry.market.synthetic&&!doc)return gap(FUNDAMENTALS_TEXT.demo);
   const imported=options.cikMap();
   if(doc){
    // An explicit link: the user's own document. Only an SEC document asks for its filing list (acceptance times).
    const cik=doc.facts.cik;let acceptance:ReadonlyMap<string,string|null>|null=null;
    if(doc.source.kind==='sec-public'&&bridge){const sub=await read('submissions',cik,refresh('submissions'));if(!current())return;const info=sub.value?.envelope?submissionsOf(sub.value.envelope,cik):null;if(info){const gate=filingGate(info,doc.facts.entityName);if(gate)return gap(gate);acceptance=info.acceptance;}if(network){lastDaily.set(cik,today());remember(cik);}}
    entry.prepared={facts:doc.facts,retrievedAt:doc.source.retrievedAt,acceptance,classTickers:classTickers(cik,imported,fetchedTickerMap())};
    return done({state:'ready',reason:null,cik,company:build(entry)});
   }
   if(!bridge)return gap(FUNDAMENTALS_TEXT.desktopOnly);
   // Symbol to CIK: the imported ticker file, then SEC's own ticker file. The two built-in CIKs are never used on a chart.
   let cik:string|null=null,classMap:CikMap|null=null;
   const own=imported?lookupCik(imported,symbol):null;if(own?.source==='ticker-file'){cik=own.cik;classMap=imported;}
   if(!cik){
    const tickers=await read('tickers',null,refresh('tickers'));if(!current())return;
    const map=tickerMapOf(tickers.value?.envelope);if(!map)return gap(reasonFor(tickers.error,tickers.value?.resumeAt??null,identityUnset,symbol));
    const hit=lookupCik(map,symbol);if(hit?.source!=='ticker-file')return gap(FUNDAMENTALS_TEXT.noCik(symbol));
    cik=hit.cik;classMap=map;
   }
   entry.cik=cik;
   const sub=await read('submissions',cik,refresh('submissions'));if(!current())return;
   if(!sub.value?.envelope)return gap(reasonFor(sub.error,sub.value?.resumeAt??null,identityUnset,symbol));
   const info=submissionsOf(sub.value.envelope,cik);if(!info)return gap('The SEC filing list saved for '+symbol+' could not be read.');
   const entity=sub.value.envelope.entityName||symbol,gate=filingGate(info,entity);if(gate)return gap(gate);
   const companyfacts=await read('companyfacts',cik,refresh('companyfacts'));if(!current())return;
   if(network){lastDaily.set(cik,today());remember(cik);}
   if(!companyfacts.value?.envelope)return gap(reasonFor(companyfacts.error,companyfacts.value?.resumeAt??null,identityUnset,symbol));
   const companyFacts=factsOf(companyfacts.value.envelope);
   if(companyFacts.cik!==cik)return gap('The saved SEC company data does not match '+symbol+'.');
   const namespaces=new Set(companyFacts.concepts.map(row=>row.namespace));
   if(!namespaces.has('us-gaap')&&namespaces.has('ifrs-full'))return gap(FUNDAMENTALS_TEXT.ifrs(companyFacts.entityName,info.forms.find(form=>/^(20-F|40-F)/.test(form))?.replace(/\/A$/,'')??'20-F'));
   entry.prepared={facts:companyFacts,retrievedAt:companyfacts.value.envelope.provenance.retrievedAt,acceptance:info.acceptance,classTickers:classTickers(cik,classMap,imported,fetchedTickerMap())};
   return done({state:'ready',reason:null,cik,company:build(entry)});
  }catch(error){return gap(error instanceof Error?error.message:String(error));}
 }
 const entryOf=(market:FundamentalsMarket):Entry=>{const key=marketKey(market);let entry=entries.get(key);if(!entry){entry={key,market:{...market},gen:0,state:'loading',reason:FUNDAMENTALS_TEXT.loading(market.symbol),cik:null,company:null,prepared:null,activated:false,loaded:false,interacted:false};entries.set(key,entry);void load(entry,'cache');}return entry;};
 const service:FundamentalsService={
  loader:{company:facts=>service.company(facts)},
  company(chartFacts){const entry=entryOf(marketOfFacts(chartFacts));return {state:entry.state,company:entry.company,reason:entry.reason,cik:entry.cik};},
  activate(market){
   const fresh=!entries.has(marketKey(market)),entry=entryOf(market);entry.activated=true;
   // The first request for a company goes out now; a company already loaded refreshes only while the daily setting is on.
   if(fresh||!entry.company||options.dailyEnabled())void load(entry,'network');
  },
  refresh(market){const entry=entryOf(market);entry.activated=true;void load(entry,'force');},
  daily(markets){
   if(!options.dailyEnabled())return;const day=today();
   const quiet=now()-startedAt<STARTUP_QUIET_MS;
   for(const market of markets){
    const entry=entries.get(marketKey(market));if(!entry||!entry.cik||lastDaily.get(entry.cik)===day)continue;
    // Loaded in this session, or remembered from before and past the startup quiet time (or touched by the user).
    const remembered=!!loadedCiks?.has(entry.cik)&&(!quiet||entry.interacted);
    if(!entry.activated&&!remembered)continue;
    lastDaily.set(entry.cik,day);void load(entry,'daily');
   }
  },
  interact(market){const entry=entries.get(marketKey(market));if(entry)entry.interacted=true;},
  invalidate(){for(const entry of entries.values())void load(entry,'cache');},
  setSplitActions(symbol,events){
   if(splitActions.has(symbol)&&splitActions.get(symbol)===events)return;splitActions.set(symbol,events);
   let changed=false;for(const entry of entries.values())if(entry.market.symbol===symbol&&entry.prepared&&entry.company){entry.company=build(entry);changed=true;}
   if(changed)notify();
  },
  lastRefresh:cik=>lastDaily.get(cik)??null,
  dispose(){disposed=true;entries.clear();memory.clear();offIdentity();},
 };
 // A saved or cleared SEC contact: activated companies try again (network), the others re-read saved copies.
 const offIdentity=onSecIdentityChanged(()=>{if(disposed)return;for(const entry of entries.values())void load(entry,entry.activated?'network':'cache');});
 return service;
}
const EMPTY:readonly string[]=Object.freeze([]);
