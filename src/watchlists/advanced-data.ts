import {isMarketSymbol} from '../domain/symbol-math';
import {validateChartSourceBasisIdentity} from '../chart/source-context';
import {dateOnly,emptyNewsQuery,restoreNewsQuery,type NewsQuery} from '../analysis-news/news';

export const ADVANCED_LIMITS=Object.freeze({bytes:10*1024*1024,records:10000,totalRecords:20000,nodes:500000,depth:16,rows:5000,datasets:10000,bars:2000000,barsPerSource:100000,cells:500000,work:20000000,page:200});
export const ADVANCED_MODES=['price','financials','performance','risk','technicals'] as const;
export type AdvancedMode=typeof ADVANCED_MODES[number];
export const ADVANCED_COLUMNS={
 price:['last','change','changePercent','volume','averageVolume10','marketCap'],
 financials:['revenue','reportedEps','peDilutedTtm','beta','dividend','yield'],
 performance:['performanceWeek','performanceMonth','performanceThreeMonths','performanceYtd','performanceYear','performanceFiveYears','performanceAllTime'],
 risk:['beta1y','beta3y','beta5y','volatility1d','volatility1w','volatility1m'],
 technicals:['ratingAll','ratingMa','ratingOscillator','rsi14','momentum10','ao','cci20'],
} as const;
export type AdvancedMetric=(typeof ADVANCED_COLUMNS)[AdvancedMode][number];
export const ADVANCED_METRICS=Object.values(ADVANCED_COLUMNS).flat() as AdvancedMetric[];
export const ADVANCED_LABELS:Record<AdvancedMetric,string>={last:'Last',change:'Daily snapshot change',changePercent:'Daily snapshot change %',volume:'Daily volume',averageVolume10:'Average volume (10 daily rows)',marketCap:'Market capitalization',revenue:'Revenue',reportedEps:'Reported EPS',peDilutedTtm:'P/E diluted TTM',beta:'Beta',dividend:'Dividend',yield:'Dividend yield',performanceWeek:'Performance 1W',performanceMonth:'Performance 1M',performanceThreeMonths:'Performance 3M',performanceYtd:'Performance YTD',performanceYear:'Performance 1Y',performanceFiveYears:'Performance 5Y',performanceAllTime:'Performance all time',beta1y:'Beta 1Y',beta3y:'Beta 3Y',beta5y:'Beta 5Y',volatility1d:'Volatility 1D',volatility1w:'Volatility 1W',volatility1m:'Volatility 1M',ratingAll:'Technical rating',ratingMa:'MA rating',ratingOscillator:'Oscillator rating',rsi14:'RSI (14)',momentum10:'Momentum (10)',ao:'Awesome Oscillator',cci20:'CCI (20)'};
export interface AdvancedMarket {exchange:string;symbol:string;synthetic:boolean}
export type AdvancedUnit='currency'|'currency/share'|'percent'|'ratio'|'shares'|'oscillator'|'category';
export interface AdvancedObservation {
 id:string;revision:number;market:AdvancedMarket;metric:AdvancedMetric|'sector';value:number|string|null;unit:AdvancedUnit;currency:string|null;
 period:{label:string;start:number|null;end:number|null};asOf:number;availableAt:number|null;definition:string;
 source:{label:string;datasetId:string|null;basisKey:string|null;fixture:boolean;adjustment:'raw'|'split-adjusted'|'total-return'|'unknown'};
 coverage:'complete-period'|'partial'|'unknown';state:'ready'|'stale'|'disconnected'|'unavailable';
}
export interface AdvancedAssociation {id:string;revision:number;market:AdvancedMarket;kind:'calendar'|'news';documentId:string;itemId:string;availableAt:number|null;source:string}
export interface AdvancedFxQuote {id:string;revision:number;currency:string;rate:number;valuationDate:string;asOf:number;availableAt:number|null;source:string;fixture:boolean}
export interface AdvancedData {schemaVersion:1;observations:AdvancedObservation[];associations:AdvancedAssociation[];fx:AdvancedFxQuote[]}
export interface WatchAdvancedSettings {
 schemaVersion:1;tab:'overview'|'earnings'|'dividends'|'news';mode:AdvancedMode;group:'none'|'section'|'currency'|'type'|'sector'|'exchange';summary:'none'|'min'|'max'|'mean'|'median';currency:'native'|'USD';
 sort:{column:AdvancedMetric|'symbol';direction:'asc'|'desc'}|null;search:string;timezone:string;dividendBasis:'ex-date'|'pay-date';asOf:number|null;news:NewsQuery;
}
export interface WatchAdvancedState {schemaVersion:1;settings:WatchAdvancedSettings;data:AdvancedData}
const encoder=new TextEncoder();
export function advancedBytes(text:string){return encoder.encode(text).length;}
export function advancedPlain(value:unknown,maxNodes:number=ADVANCED_LIMITS.nodes,maxDepth:number=ADVANCED_LIMITS.depth):void{
 const work:{value:unknown;depth:number}[]=[{value,depth:0}],seen=new Set<object>();let scheduled=1,textBytes=0;
 while(work.length){const current=work.pop()!;if(current.depth>maxDepth)throw new Error('Advanced data exceeds nesting limit.');const item=current.value;if(typeof item==='string'){if(item.length>ADVANCED_LIMITS.bytes||(textBytes+=advancedBytes(item))>ADVANCED_LIMITS.bytes)throw new Error('Advanced data text exceeds 10 MiB.');continue;}if(item===null||typeof item==='boolean')continue;if(typeof item==='number'){if(!Number.isFinite(item)||Math.abs(item)>Number.MAX_SAFE_INTEGER)throw new Error('Advanced numbers must be finite and within the safe numeric magnitude.');continue;}if(typeof item!=='object')throw new Error('Advanced data requires plain JSON values.');if(seen.has(item))throw new Error('Advanced data cannot contain cycles or shared object aliases.');seen.add(item);
  const arr=Array.isArray(item);if(arr?Object.getPrototypeOf(item)!==Array.prototype:![Object.prototype,null].includes(Object.getPrototypeOf(item)))throw new Error('Advanced data requires ordinary records and arrays.');
  const keys=Reflect.ownKeys(item);if(scheduled+keys.length-(arr?1:0)>maxNodes)throw new Error('Advanced data exceeds the scheduled node limit.');if(arr&&keys.length!==item.length+1)throw new Error('Advanced arrays must be dense and have no custom fields.');
  for(const key of keys){if(arr&&key==='length')continue;if(typeof key!=='string'||['__proto__','prototype','constructor','toJSON'].includes(key)||arr&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=(item as unknown[]).length))throw new Error('Unsupported advanced data field.');const descriptor=Object.getOwnPropertyDescriptor(item,key)!;if(!descriptor.enumerable||!('value'in descriptor))throw new Error('Advanced data cannot contain accessors or hidden fields.');scheduled++;work.push({value:descriptor.value,depth:current.depth+1});}
 }
}
export function advancedRecord(value:unknown,keys:readonly string[],label:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid '+label+'.');const result=value as Record<string,unknown>,own=Object.keys(result);if(own.length!==keys.length||own.some(key=>!keys.includes(key)))throw new Error('Unexpected or missing '+label+' fields.');return result;}
export function advancedText(value:unknown,label:string,max=256,empty=false):string{if(typeof value!=='string'||value.length>max||!empty&&!value.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new Error('Invalid '+label+'.');return value;}
export function advancedTime(value:unknown,nullable=false):number|null{if(nullable&&value===null)return null;if(!Number.isSafeInteger(value)||Number(value)<-62135596800||Number(value)>253402300799)throw new Error('Advanced timestamps require integer Unix seconds within years 0001 through 9999.');return value as number;}
function revision(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<1)throw new Error('Invalid advanced revision.');return value as number;}
function choice<T extends string>(value:unknown,values:readonly T[],label:string):T{if(typeof value!=='string'||!values.includes(value as T))throw new Error('Invalid '+label+'.');return value as T;}
const currencies=new Set(Intl.supportedValuesOf('currency'));
function currency(value:unknown):string{if(typeof value!=='string'||!currencies.has(value))throw new Error('Unsupported currency code.');return value;}
export function restoreAdvancedMarket(value:unknown):AdvancedMarket{const v=advancedRecord(value,['exchange','symbol','synthetic'],'market');if(typeof v.exchange!=='string'||!/^[A-Z0-9._-]{1,80}$/.test(v.exchange)||!isMarketSymbol(v.symbol,v.exchange)||typeof v.synthetic!=='boolean')throw new Error('Invalid qualified advanced market.');return{exchange:v.exchange,symbol:v.symbol,synthetic:v.synthetic};}
export const advancedMarketKey=(market:AdvancedMarket)=>JSON.stringify([market.exchange,market.symbol,market.synthetic]);
function unique<T extends {id:string;revision:number}>(rows:T[],label:string):T[]{const keys=new Set<string>();for(const row of rows){const key=JSON.stringify([row.id,row.revision]);if(keys.has(key))throw new Error('Duplicate '+label+' identity/revision.');keys.add(key);}return rows;}
function restoreObservation(value:unknown):AdvancedObservation{
 const v=advancedRecord(value,['id','revision','market','metric','value','unit','currency','period','asOf','availableAt','definition','source','coverage','state'],'observation'),market=restoreAdvancedMarket(v.market),metric=choice(v.metric,[...ADVANCED_METRICS,'sector'],'metric'),unit=choice(v.unit,['currency','currency/share','percent','ratio','shares','oscillator','category'],'unit');
 if(metric==='sector'?unit!=='category'||v.value!==null&&typeof v.value!=='string':unit==='category'||v.value!==null&&typeof v.value!=='number')throw new Error('Observation value and metric unit disagree.');if(typeof v.value==='string')advancedText(v.value,'category',256);const money=unit==='currency'||unit==='currency/share';if(money?v.currency===null:v.currency!==null)throw new Error('Monetary observations require a currency; other units must not declare one.');const monetaryCurrency=money?currency(v.currency):null;
 const period=advancedRecord(v.period,['label','start','end'],'period'),start=advancedTime(period.start,true),end=advancedTime(period.end,true),asOf=advancedTime(v.asOf)!;if(start!==null&&end!==null&&start>end||end!==null&&end>asOf)throw new Error('Observation period is inconsistent with its as-of time.');
 const source=advancedRecord(v.source,['label','datasetId','basisKey','fixture','adjustment'],'observation source');if(source.fixture!==market.synthetic)throw new Error('Observation synthetic basis disagrees with its market.');if(source.basisKey!==null)validateChartSourceBasisIdentity(source.basisKey);
 const result:AdvancedObservation={id:advancedText(v.id,'observation ID'),revision:revision(v.revision),market,metric,value:v.value as number|string|null,unit,currency:monetaryCurrency,period:{label:advancedText(period.label,'period label'),start,end},asOf,availableAt:advancedTime(v.availableAt,true),definition:advancedText(v.definition,'definition',512),source:{label:advancedText(source.label,'source',512),datasetId:source.datasetId===null?null:advancedText(source.datasetId,'dataset ID',4096),basisKey:source.basisKey as string|null,fixture:source.fixture as boolean,adjustment:choice(source.adjustment,['raw','split-adjusted','total-return','unknown'],'adjustment')},coverage:choice(v.coverage,['complete-period','partial','unknown'],'coverage'),state:choice(v.state,['ready','stale','disconnected','unavailable'],'source state')};
 if(metric.startsWith('performance')&&(unit!=='percent'||start===null||end===null))throw new Error('Performance observations require percent units and explicit period endpoints.');
 return result;
}
export function createAdvancedData():AdvancedData{return{schemaVersion:1,observations:[],associations:[],fx:[]};}
export function restoreAdvancedData(input:unknown):AdvancedData{
 advancedPlain(input);const v=advancedRecord(input,['schemaVersion','observations','associations','fx'],'advanced data');if(v.schemaVersion!==1)throw new Error('Unsupported advanced data version.');let total=0;for(const key of ['observations','associations','fx']){if(!Array.isArray(v[key])||(v[key] as unknown[]).length>ADVANCED_LIMITS.records)throw new Error('Advanced collection exceeds 10,000 rows.');total+=(v[key] as unknown[]).length;}if(total>ADVANCED_LIMITS.totalRecords||advancedBytes(JSON.stringify(input))>ADVANCED_LIMITS.bytes)throw new Error('Advanced data exceeds 20,000 records or 10 MiB.');
 const observations=unique((v.observations as unknown[]).map(restoreObservation),'observation');
 const associations=unique((v.associations as unknown[]).map(value=>{const row=advancedRecord(value,['id','revision','market','kind','documentId','itemId','availableAt','source'],'association');return{id:advancedText(row.id,'association ID'),revision:revision(row.revision),market:restoreAdvancedMarket(row.market),kind:choice(row.kind,['calendar','news'],'association kind'),documentId:advancedText(row.documentId,'document ID'),itemId:advancedText(row.itemId,'item ID'),availableAt:advancedTime(row.availableAt,true),source:advancedText(row.source,'association source',512)};}),'association');
 const fx=unique((v.fx as unknown[]).map(value=>{const row=advancedRecord(value,['id','revision','currency','rate','valuationDate','asOf','availableAt','source','fixture'],'FX quote');if(typeof row.rate!=='number'||!Number.isFinite(row.rate)||row.rate<=0||typeof row.fixture!=='boolean')throw new Error('FX requires a positive finite USD-per-native-unit rate and synthetic status.');return{id:advancedText(row.id,'FX ID'),revision:revision(row.revision),currency:currency(row.currency),rate:row.rate,valuationDate:dateOnly(row.valuationDate),asOf:advancedTime(row.asOf)!,availableAt:advancedTime(row.availableAt,true),source:advancedText(row.source,'FX source',512),fixture:row.fixture};}),'FX');
 return{schemaVersion:1,observations,associations,fx};
}
export function parseAdvancedData(text:string):AdvancedData{if(typeof text!=='string'||advancedBytes(text)>ADVANCED_LIMITS.bytes)throw new Error('Advanced analysis JSON exceeds 10 MiB UTF-8.');return restoreAdvancedData(JSON.parse(text.replace(/^\uFEFF/,'')));}
export function createWatchAdvancedSettings():WatchAdvancedSettings{return{schemaVersion:1,tab:'overview',mode:'price',group:'none',summary:'none',currency:'native',sort:null,search:'',timezone:'UTC',dividendBasis:'ex-date',asOf:null,news:emptyNewsQuery()};}
export function restoreWatchAdvancedSettings(input:unknown):WatchAdvancedSettings{
 advancedPlain(input,10000);const v=advancedRecord(input,['schemaVersion','tab','mode','group','summary','currency','sort','search','timezone','dividendBasis','asOf','news'],'advanced settings');if(v.schemaVersion!==1)throw new Error('Unsupported advanced settings version.');const timezone=advancedText(v.timezone,'timezone',100);new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(0);let sort:WatchAdvancedSettings['sort']=null;if(v.sort!==null){const s=advancedRecord(v.sort,['column','direction'],'sort');sort={column:choice(s.column,[...ADVANCED_METRICS,'symbol'],'sort column'),direction:choice(s.direction,['asc','desc'],'sort direction')};}
 const mode=choice(v.mode,ADVANCED_MODES,'overview mode');if(sort&&sort.column!=='symbol'&&!(ADVANCED_COLUMNS[mode] as readonly string[]).includes(sort.column))throw new Error('Sorting column must belong to the selected Overview mode.');const news=restoreNewsQuery(v.news);if(news.watchlist)throw new Error('Advanced news uses exact market associations, not bare-symbol watchlist filtering.');
 return{schemaVersion:1,tab:choice(v.tab,['overview','earnings','dividends','news'],'tab'),mode,group:choice(v.group,['none','section','currency','type','sector','exchange'],'group'),summary:choice(v.summary,['none','min','max','mean','median'],'summary'),currency:choice(v.currency,['native','USD'],'display currency'),sort,search:advancedText(v.search,'search',500,true),timezone,dividendBasis:choice(v.dividendBasis,['ex-date','pay-date'],'dividend date basis'),asOf:advancedTime(v.asOf,true),news};
}
export function createWatchAdvancedState():WatchAdvancedState{return{schemaVersion:1,settings:createWatchAdvancedSettings(),data:createAdvancedData()};}
export function restoreWatchAdvancedState(input:unknown):WatchAdvancedState{advancedPlain(input,ADVANCED_LIMITS.nodes+10000,ADVANCED_LIMITS.depth+2);const v=advancedRecord(input,['schemaVersion','settings','data'],'advanced state');if(v.schemaVersion!==1)throw new Error('Unsupported advanced state version.');return{schemaVersion:1,settings:restoreWatchAdvancedSettings(v.settings),data:restoreAdvancedData(v.data)};}
export function advancedDataJson(data:AdvancedData):string{return JSON.stringify(restoreAdvancedData(data));}
/**
 * The beta benchmark a user picked per watchlist (workspace key watchBenchmarks). It is separate from the saved
 * Advanced View settings, whose exact key list is unchanged. Absent means no benchmark. No benchmark is ever chosen by default.
 */
export const WATCH_BENCHMARK_LIMIT=200;
export interface WatchBenchmarks {schemaVersion:1;byList:Record<string,string>}
export function createWatchBenchmarks():WatchBenchmarks{return{schemaVersion:1,byList:{}};}
export function restoreWatchBenchmarks(input:unknown):WatchBenchmarks{
 advancedPlain(input,2000,4);const v=advancedRecord(input,['schemaVersion','byList'],'watch benchmarks');if(v.schemaVersion!==1)throw new Error('Unsupported watch benchmark version.');
 if(!v.byList||typeof v.byList!=='object'||Array.isArray(v.byList))throw new Error('Invalid watch benchmark map.');
 const entries=Object.entries(v.byList as Record<string,unknown>);if(entries.length>WATCH_BENCHMARK_LIMIT)throw new Error('At most 200 watchlist benchmarks are kept.');
 const byList:Record<string,string>={};for(const [listId,datasetId] of entries){advancedText(listId,'benchmark list ID',200);byList[listId]=advancedText(datasetId,'benchmark dataset ID',4096);}
 return{schemaVersion:1,byList};
}
export function setWatchBenchmark(benchmarks:WatchBenchmarks,listId:string,datasetId:string|null):WatchBenchmarks{
 const byList={...benchmarks.byList};if(datasetId===null)delete byList[listId];else byList[listId]=datasetId;return restoreWatchBenchmarks({schemaVersion:1,byList});
}
/** Drop entries whose list no longer exists. Flagged lists (flag:color) are always valid. Call on the next save after a list is deleted. */
export function pruneWatchBenchmarks(benchmarks:WatchBenchmarks,listIds:readonly string[]):WatchBenchmarks{
 const keep=new Set(listIds);return restoreWatchBenchmarks({schemaVersion:1,byList:Object.fromEntries(Object.entries(benchmarks.byList).filter(([id])=>keep.has(id)||id.startsWith('flag:')))});
}
