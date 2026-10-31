import type {WatchReference} from './model';
import type {WatchQuote} from './quotes';
import type {Bar,BarDataset} from '../domain/types';
import {compatibleDailySource,originalDailySource} from './sources';
import {assertWatchPlainData} from './notes';
import {barInputIdentity} from '../chart/bar-input-identity';
import {liveDailyCompanionId} from './live-watch';
import {usSessionDay,usSessionPhase,newYorkClock} from '../domain/us-market-hours';
import {formatDetailPrice} from '../domain/symbol-details-quote';
import {demoDataMode} from '../domain/demo-mode';
import {FIXTURE_CAPABILITIES} from '../domain/fixtures';

export const DETAIL_BLOCK_IDS=['summary','daily','identity','source','notes'] as const;
export type DetailBlockId=typeof DETAIL_BLOCK_IDS[number];
export const DETAIL_BLOCK_LABELS:Record<DetailBlockId,string>={summary:'Price snapshot',daily:'Daily snapshot',identity:'Instrument',source:'Data source',notes:'Local notes'};
/**
 * Table: which detail categories do not apply to an instrument type.
 * The Daily snapshot category lists traded volume, which an index does not have. Unknown types show every category.
 * An inapplicable category is shown disabled with this reason and is never hidden or removed from saved preferences.
 */
export const DETAIL_TYPE_UNAVAILABLE_REASON='Not available for this instrument type';
const NOT_APPLICABLE:Partial<Record<DetailBlockId,readonly string[]>>={daily:['index']};
export function detailBlockAvailability(assetClass:string|null):Record<DetailBlockId,string|null>{return Object.fromEntries(DETAIL_BLOCK_IDS.map(id=>[id,assetClass!==null&&NOT_APPLICABLE[id]?.includes(assetClass)?DETAIL_TYPE_UNAVAILABLE_REASON:null])) as Record<DetailBlockId,string|null>;}
export interface DetailPreferences {schemaVersion:1;order:DetailBlockId[];hidden:DetailBlockId[];collapsed:DetailBlockId[]}
export function defaultDetailPreferences():DetailPreferences{return{schemaVersion:1,order:[...DETAIL_BLOCK_IDS],hidden:[],collapsed:[]};}
export function restoreDetailPreferences(value:unknown):DetailPreferences{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid symbol detail preferences.');
 for(const key of ['order','hidden','collapsed']){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!('value'in descriptor)||!Array.isArray(descriptor.value)||descriptor.value.length>5)throw Error('Symbol detail preferences require bounded plain block lists.');}
 assertWatchPlainData(value,2048);
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==4||!['schemaVersion','order','hidden','collapsed'].every(key=>Object.hasOwn(value,key)))throw Error('Invalid symbol detail preferences.');
 const record=value as Record<string,unknown>;if(record.schemaVersion!==1)throw Error('Unsupported symbol detail preferences version.');
 const list=(key:string,complete=false)=>{const rows=record[key];if(!Array.isArray(rows)||rows.length>5||complete&&rows.length!==5||new Set(rows).size!==rows.length||!rows.every(id=>DETAIL_BLOCK_IDS.includes(id)))throw Error('Symbol detail block order and visibility are invalid.');return [...rows] as DetailBlockId[];};
 return{schemaVersion:1,order:list('order',true),hidden:list('hidden'),collapsed:list('collapsed')};
}
export interface DetailField {label:string;value:string|number|null}
/** The large price line at the top of the details (weight 600, 28px; the change is colored). */
export interface DetailHeadline {last:number|null;change:number|null;changePercent:number|null;tone:'up'|'down'|null;session:string|null}
/** One key statistic; a null value always carries the reason it is unavailable. */
export interface DetailStat {label:string;value:string|number|null;reason:string|null}
/** One performance bar. `base` is the daily bar the period compares with. */
export interface DetailPerformanceRow {id:string;label:string;value:number|null;reason:string|null;base:{time:number;close:number}|null}
export interface DetailPerformance {rows:DetailPerformanceRow[];asOf:number|null;reason:string|null}
/** keyStats and performance are optional so older snapshots (and those built by tests) stay valid; the parent attaches performance. */
export interface DetailSnapshot {symbol:string;exchange:string;synthetic:boolean;description:string;headline?:DetailHeadline;blocks:Record<Exclude<DetailBlockId,'notes'>,DetailField[]>;diagnostic:string;disclaimer:string;keyStats?:DetailStat[];performance?:DetailPerformance}
const field=(label:string,value:string|number|null|undefined):DetailField=>({label,value:value??null});
const timestamp=(value:number|null|undefined)=>value===null||value===undefined?null:Number.isFinite(value)&&Math.abs(value)<=8640000000000?new Date(value*1000).toISOString().slice(0,16).replace('T',' '):'Invalid timestamp';
// "2025-12-01 00:00" (the label names UTC), not the raw ISO string.
function plainFields<T extends object>(value:T):T{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Symbol details require plain source records.');
 const keys=Reflect.ownKeys(value);if(keys.length>40)throw Error('Symbol detail source record exceeds its field limit.');
 const result=Object.create(null) as Record<string,unknown>;
 for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key)!;if(typeof key!=='string'||!descriptor.enumerable||!('value'in descriptor)||['__proto__','prototype','constructor','toJSON'].includes(key))throw Error('Symbol detail source fields cannot contain accessors or hidden data.');result[key]=descriptor.value;}
 return result as T;
}
// Read bounded endpoint descriptors without invoking indexed getters or scanning history.
function sourceParts(dataset:BarDataset|null|undefined){
 if(!dataset)return null;
 const fields=plainFields(dataset),{instrument,provenance,resolution,bars}=fields;
 if(!Array.isArray(bars)||Object.getPrototypeOf(bars)!==Array.prototype||bars.length>100000)throw Error('Symbol detail source bars require a bounded ordinary array.');
 const endpoint=(index:number)=>{if(index<0)return null;const descriptor=Object.getOwnPropertyDescriptor(bars,String(index));if(!descriptor||!descriptor.enumerable||!('value'in descriptor))throw Error('Symbol detail endpoint bars require plain values.');return descriptor.value as BarDataset['bars'][number];};
 const value={instrument,provenance,resolution,last:endpoint(bars.length-1),previous:endpoint(bars.length-2),count:bars.length,derived:Object.hasOwn(fields,'derivation')};
 assertWatchPlainData(value,65536);
 return{...value,bars,stamp:JSON.stringify(value)};
}
function sourceFields(source:NonNullable<ReturnType<typeof sourceParts>>,prefix=''):DetailField[]{const p=source.provenance;return[
 field(prefix+'Provider',p.providerName),field(prefix+'Provider ID',p.providerId),field(prefix+'Dataset ID',p.datasetId),field(prefix+'Revision',p.revision),field(prefix+'Resolution',source.resolution),field(prefix+'Coverage',p.coverage),field(prefix+'Session basis',p.session),field(prefix+'Adjustment',p.adjustment),field(prefix+'Source timezone',p.timezone),field(prefix+'Source as of (UTC)',timestamp(p.asOf)),field(prefix+'Last bar (UTC)',timestamp(source.last?.time)),field(prefix+'Declared delay (seconds)',p.delaySeconds),field(prefix+'Data state',p.state),field(prefix+'Rights statement',p.license),
 ];}
/**
 * The session state of a New York listed instrument at `now`, from LV's own NYSE calendar
 * (us-market-hours.ts). It is a clock reading, not an exchange status feed: halts and unscheduled closures are not known.
 * Other markets return null (unavailable) rather than a guess.
 */
export function detailSessionState(timezone:string|null|undefined,assetClass:string|null|undefined,now:number):string|null{
 if(timezone!=='America/New_York'||assetClass==='crypto'||!Number.isFinite(now))return null;
 const time=Math.floor(now),day=usSessionDay(newYorkClock(time).date);
 if(day.weekend)return 'Closed (weekend), OpenCandle calendar';if(day.holiday)return 'Closed (exchange holiday), OpenCandle calendar';
 const phase=usSessionPhase(time);
 return (phase==='regular'?'Regular session open':phase==='pre'?'Pre-market':phase==='post'?'Post-market':'Closed (overnight)')+(day.earlyClose?', early close day':'')+', OpenCandle calendar';
}
/** The headline numbers; tone follows the daily change sign (the watchlist's Chg colours), zero is neutral. */
function detailHeadline(last:number|null|undefined,change:number|null|undefined,changePercent:number|null|undefined,session:string|null):DetailHeadline{
 const finite=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)?value:null,delta=finite(change);
 return{last:finite(last),change:delta,changePercent:finite(changePercent),tone:delta===null||delta===0?null:delta>0?'up':'down',session};
}
/** Prepare detached fields once and retain a bounded lease over their actual source inputs. */
/**
 * `performanceBars` is the validated daily bar array (the same object the quote holds), or null without a compatible
 * daily snapshot. It is handed out, never read here, so the bounded endpoint contract of this function is unchanged; detailPerformance
 * is the separate, explicit read.
 */
export function prepareDetailSnapshot(reference:WatchReference,quote:WatchQuote,now:number=Date.now()/1000):{snapshot:DetailSnapshot;identity:string;assertSource:()=>void;performanceBars:readonly Bar[]|null}{
 assertWatchPlainData(reference,8192);
 const referenceKey=JSON.stringify(reference),initial=plainFields(quote),primary=initial.dataset,daily=initial.dailyDataset,primaryParts=sourceParts(primary),dailyParts=sourceParts(daily),primaryBars=primaryParts?.bars,dailyBars=dailyParts?.bars;
 const quoteStamp=(value:WatchQuote)=>{const fields=[value.last,value.change,value.changePercent,value.volume,value.extended,value.extendedChange??null,value.extendedChangePercent??null,value.extendedSession??null,value.relativeVolume??null,value.previousClose??null,value.open??null,value.yearLow??null,value.yearHigh??null,value.averageVolume30??null,value.high??null,value.low??null,value.dayRange??null,value.asOf,value.description,value.reason,value.dailyBasis];assertWatchPlainData(fields,65536);return JSON.stringify(fields);};
 const openingQuote=quoteStamp(initial),p=primaryParts?.provenance,i=primaryParts?.instrument;
 // Outside the legacy demo, a demo-identity source (a no-data placeholder, or example data) shows no demo provenance.
 const demoIdentity=demoDataMode()!=='legacy'&&(p?p.fixture===true&&p.providerId===FIXTURE_CAPABILITIES.id:reference.synthetic&&reference.exchange==='SYNTHETIC');
 if(primary&&(i!.symbol!==reference.symbol||i!.exchange!==reference.exchange||p!.fixture!==reference.synthetic||p!.datasetId!==reference.datasetId))throw Error('Symbol detail source does not match its selected reference.');
 const dailyValid=!!primaryParts&&!!dailyParts&&!dailyParts.derived&&initial.dailyBasis&&(daily===primary?originalDailySource(dailyParts as unknown as BarDataset):(reference.dailyDatasetId===dailyParts.provenance.datasetId||reference.dailyDatasetId===null&&dailyParts.provenance.datasetId===liveDailyCompanionId(primaryParts.provenance.datasetId))&&compatibleDailySource(primaryParts as unknown as BarDataset,dailyParts as unknown as BarDataset)),lastDaily=dailyValid?dailyParts!.last:null;
 const snapshot:DetailSnapshot={symbol:reference.symbol,exchange:reference.exchange,synthetic:reference.synthetic,description:initial.description,
  headline:detailHeadline(primary?initial.last:null,dailyValid?initial.change:null,dailyValid&&initial.changePercentState==='value'?initial.changePercent:null,detailSessionState(i?.timezone,i?.assetClass,now)),
  diagnostic:initial.reason,disclaimer:'Independent watchlist snapshot. These values do not follow chart replay and do not establish current market prices.',
  blocks:{summary:[field('Last close',primary?initial.last:null),field('Currency',i?.currency),field('Close timestamp (UTC)',primary?timestamp(initial.asOf):null),field('Bid',typeof initial.bid==='number'&&Number.isFinite(initial.bid)?initial.bid:null),field('Ask',typeof initial.ask==='number'&&Number.isFinite(initial.ask)?initial.ask:null),field('Current market status',detailSessionState(i?.timezone,i?.assetClass,now)),field('Extended-hours last',initial.extended??null),field('Extended-hours change',initial.extendedChange??null),field('Extended-hours change %',initial.extendedChangePercent??null)],
   daily:[field('Daily snapshot change',dailyValid?initial.change:null),field('Daily snapshot change %',dailyValid?initial.changePercent:null),field('Daily snapshot volume',dailyValid?initial.volume:null),field('Daily snapshot high',lastDaily?.high),field('Daily snapshot low',lastDaily?.low),field('Previous close',dailyValid?initial.previousClose??null:null),field('Open',dailyValid?initial.open??null:null),field('Day range',lastDaily&&Number.isFinite(lastDaily.low)&&Number.isFinite(lastDaily.high)?formatDetailPrice(lastDaily.low,i?.tickSize)+' to '+formatDetailPrice(lastDaily.high,i?.tickSize):null),field('Relative volume',dailyValid?initial.relativeVolume??null:null),field('52-week range',dailyValid&&typeof initial.yearLow==='number'&&typeof initial.yearHigh==='number'?formatDetailPrice(initial.yearLow,i?.tickSize)+' to '+formatDetailPrice(initial.yearHigh,i?.tickSize):null),field('Average volume (30 earlier days)',dailyValid?initial.averageVolume30??null:null),field('Daily snapshot timestamp (UTC)',timestamp(lastDaily?.time)),field('Daily provider',dailyValid?dailyParts!.provenance.providerName:null),field('Daily dataset ID',dailyValid?dailyParts!.provenance.datasetId:null)],
   identity:[field('Ticker',reference.symbol),field('Exchange',demoIdentity?null:reference.exchange),field('Instrument ID',i?.id),field('Name',i?.name),field('Asset class',i?.assetClass),field('Currency',i?.currency),field('Exchange timezone',i?.timezone),field('Tick size',i?.tickSize),field('Lot size',i?.lotSize),field('ISIN / CUSIP',null),field('Sector',null)],
   source:demoIdentity?[field('Source',demoDataMode()==='example'?'Example data':'No data yet. Set up live data in Data sources.')]:primaryParts?[...sourceFields(primaryParts),...(dailyValid&&daily!==primary?sourceFields(dailyParts!,'Daily '):[])]:[field('Source','No data source for this symbol.')],
  },keyStats:detailKeyStats(initial,!!dailyValid,i?.tickSize)};
 assertWatchPlainData(snapshot,65536);
 const assertSource=()=>{assertWatchPlainData(reference,8192);const current=plainFields(quote),nextPrimary=sourceParts(current.dataset),nextDaily=sourceParts(current.dailyDataset);if(JSON.stringify(reference)!==referenceKey||current.dataset!==primary||current.dailyDataset!==daily||nextPrimary?.bars!==primaryBars||nextDaily?.bars!==dailyBars||nextPrimary?.stamp!==primaryParts?.stamp||nextDaily?.stamp!==dailyParts?.stamp||quoteStamp(current)!==openingQuote)throw Error('The selected symbol source changed. Reopen its details.');};
 const identity=JSON.stringify([referenceKey,primaryParts?.stamp??null,primaryBars?barInputIdentity(primaryBars):null,dailyParts?.stamp??null,dailyBars?barInputIdentity(dailyBars):null,openingQuote]);
 assertSource();return{snapshot,identity,assertSource,performanceBars:dailyValid?dailyBars as readonly Bar[]:null};
}
/** Wording for statistics LV cannot compute from price history. */
export const DETAIL_FUNDAMENTALS_REASON='Needs company fundamentals. OpenCandle has no permitted fundamentals source.';
const NEEDS_DAILY='Needs a compatible daily snapshot.';
/**
 * The Key stats list of the details panel. Price and volume statistics read the
 * quote's daily-basis fields (quotes.ts), so they need no new source. Statistics that need company fundamentals or a benchmark
 * index are listed as unavailable with the reason, never estimated.
 */
function detailKeyStats(quote:WatchQuote,dailyValid:boolean,tick?:number):DetailStat[]{
 const decimal=(value:number)=>formatDetailPrice(value,tick);
 const finite=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)?value:null;
 const stat=(label:string,value:string|number|null,missing:string):DetailStat=>dailyValid&&value!==null?{label,value,reason:null}:{label,value:null,reason:dailyValid?missing:NEEDS_DAILY};
 const low=finite(quote.low),high=finite(quote.high),yearLow=finite(quote.yearLow),yearHigh=finite(quote.yearHigh);
 return[
  stat('Volume',finite(quote.volume),'Needs the daily bar of the day with volume.'),
  stat('Average volume (30 days)',finite(quote.averageVolume30),'Needs 30 earlier daily bars with volume.'),
  stat('Day range',low!==null&&high!==null?decimal(low)+' to '+decimal(high):null,'Needs the daily bar of the day.'),
  stat('52-week high',yearHigh,'Needs a full year of daily history.'),
  stat('52-week low',yearLow,'Needs a full year of daily history.'),
  ...['Market capitalization','Dividend yield (indicated)','Price to earnings ratio (TTM)','Basic EPS (TTM)','Net income (FY)','Revenue (FY)','Shares float'].map(label=>({label,value:null,reason:DETAIL_FUNDAMENTALS_REASON})),
  {label:'Beta (1Y)',value:null,reason:'Needs a benchmark index series and a reviewed return window. SPY is not substituted for the index.'},
 ];
}
/** The performance bars, in display order (1W, 1M, 3M, 6M, YTD, 1Y). Month periods are calendar months. */
export const DETAIL_PERFORMANCE_PERIODS:readonly {id:string;label:string;months:number|null}[]=Object.freeze([{id:'week',label:'1W',months:0},{id:'month',label:'1M',months:1},{id:'threeMonths',label:'3M',months:3},{id:'sixMonths',label:'6M',months:6},{id:'ytd',label:'YTD',months:null},{id:'year',label:'1Y',months:12}]);
const DAY_SECONDS=86400,dayNumber=(seconds:number)=>Math.floor(seconds/DAY_SECONDS),isoDay=(day:number)=>new Date(day*DAY_SECONDS*1000).toISOString().slice(0,10);
/** The same calendar date `months` earlier; a missing day clamps to the end of that month (local-metrics.ts rule). */
function monthsBefore(day:number,months:number):number{const date=new Date(day*DAY_SECONDS*1000),total=date.getUTCFullYear()*12+date.getUTCMonth()-months,year=Math.floor(total/12),month=total-year*12;return Date.UTC(year,month,Math.min(date.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate()))/1000/DAY_SECONDS;}
/**
 * The Advanced view's performance rule in local-metrics.ts, plus 6M: (close_last / close_base - 1) * 100,
 * where close_base is the close of the last daily bar on or before the base date. 1W is 7 calendar days back; 1M, 3M, 6M and 1Y are
 * calendar months (clamped); YTD compares with the last bar of the previous calendar year (UTC dates of the bars). A period the
 * history does not reach, or a base close that is not positive, is unavailable with the reason.
 * Bounded read: binary search over data descriptors only (about 20 bars per period), so accessors are refused, never run.
 */
export function detailPerformance(bars:readonly Bar[]|null|undefined):DetailPerformance{
 const all=(reason:string):DetailPerformance=>({rows:DETAIL_PERFORMANCE_PERIODS.map(period=>({id:period.id,label:period.label,value:null,reason,base:null})),asOf:null,reason});
 if(bars===null||bars===undefined)return all(NEEDS_DAILY);
 if(!Array.isArray(bars)||Object.getPrototypeOf(bars)!==Array.prototype)throw Error('Symbol detail performance requires an ordinary bar array.');
 const count=bars.length;if(!Number.isSafeInteger(count)||count>100000)throw Error('Symbol detail performance requires a bounded bar array.');
 if(count<2)return all('At least two daily bars are needed.');
 const cache=new Map<number,{time:number;close:number}>();
 const own=(target:object,key:string)=>{const descriptor=Object.getOwnPropertyDescriptor(target,key);if(!descriptor||!descriptor.enumerable||!('value'in descriptor))throw Error('Symbol detail performance bars require plain values.');return descriptor.value as unknown;};
 const read=(index:number)=>{let bar=cache.get(index);if(!bar){const value=own(bars,String(index));if(!value||typeof value!=='object')throw Error('Symbol detail performance bars require plain values.');const time=own(value,'time'),close=own(value,'close');bar={time:typeof time==='number'?time:Number.NaN,close:typeof close==='number'?close:Number.NaN};cache.set(index,bar);}return bar;};
 const last=read(count-1);if(!Number.isSafeInteger(last.time)||!Number.isFinite(last.close))return all('The last daily bar has no usable close.');
 const first=read(0);if(!Number.isSafeInteger(first.time))return all('The first daily bar has no usable time.');
 // Largest index whose time passes `before`; the bars are in time order, so `before` is true up to some index and false after it.
 const lastWhere=(before:(time:number)=>boolean)=>{if(!before(first.time))return -1;let low=0,high=count-1;while(low<high){const middle=Math.ceil((low+high)/2);if(before(read(middle).time))low=middle;else high=middle-1;}return low;};
 const lastDay=dayNumber(last.time),year=new Date(last.time*1000).getUTCFullYear(),newYear=Date.UTC(year,0,1)/1000;
 const rows=DETAIL_PERFORMANCE_PERIODS.map(period=>{
  const none=(reason:string):DetailPerformanceRow=>({id:period.id,label:period.label,value:null,reason,base:null});
  let index:number;
  if(period.months===null){index=lastWhere(time=>time<newYear);if(index<0)return none('No daily bar from the previous calendar year is loaded.');}
  else{const target=period.months===0?lastDay-7:monthsBefore(lastDay,period.months);index=lastWhere(time=>dayNumber(time)<=target);if(index<0)return none('The daily history does not reach '+isoDay(target)+'.');}
  const base=read(index);if(!Number.isFinite(base.close)||base.close<=0||!Number.isSafeInteger(base.time))return none('The base close on '+(Number.isFinite(base.time)?isoDay(dayNumber(base.time)):'that date')+' is missing or not positive.');
  const value=(last.close/base.close-1)*100;return Number.isFinite(value)?{id:period.id,label:period.label,value,reason:null,base:{time:base.time,close:base.close}}:none('The result is not a finite number.');
 });
 return{rows,asOf:last.time,reason:null};
}
