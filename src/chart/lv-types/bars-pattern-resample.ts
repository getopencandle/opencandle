// Bars pattern "Interval" setting. The default is the interval the pattern was captured on. Another interval re-samples
// the SAME captured span:
//  * coarser (or equal): aggregated from the captured bars stored in the drawing, no loaded data needed;
//  * finer: from finer bars already stored in the drawing (an earlier fetch), else from loaded imported/synthetic data
//    (bars-pattern-source.ts resampleBarsPattern), else fetched over the span from the chart's live source through the
//    existing bridges (the result asks the host to fetch; the fetched bars are then stored in the drawing);
//  * otherwise a plain message and the current interval is kept.
// The anchor never moves here; the drawn length follows the bar count (one bar per chart slot, bars-pattern.ts frame()).
// Pure apart from the fetcher, which the host supplies; no globals, no DOM.
import type {Bar,BarDataset} from '../../domain/types';
import {aggregateInterval,parseInterval,type IntervalSpec} from '../../domain/intervals';
import {COINBASE_PROVIDER_ID,COINBASE_RESOLUTIONS,type CoinbaseBridge} from '../../domain/coinbase-live';
import {ALPACA_IEX_PROVIDER_ID,ALPACA_RESOLUTIONS,ALPACA_SIP_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID,ALPACA_SIP_DELAY_SECONDS,currentAlpacaAdjustment,currentAlpacaDataPlan,type AlpacaBridge} from '../../domain/alpaca-live';
import {BARS_PATTERN_BAR_CAP,BARS_PATTERN_MEMBER,columnsToBars,decodeBars,encodeBars,makeBarsPatternMember,readBarsPattern,type BarsPatternMember,type BarsPatternSeries,type BarsPatternSource,type PatternBar} from './bars-pattern-data';
import {approxSeconds,bindBarsPatternSource,periodEnd,resampleBarsPattern,resolutionLabel,type ResampleContext,type ResampleRequest,type ResampleResult,type ResampleSummary} from './bars-pattern-source';

const DAY=86_400;
const fmt=(n:number)=>n.toLocaleString('en-US');
const canonical=(resolution:string)=>{try{return parseInterval(resolution).id;}catch{return resolution;}};
const toPattern=(bar:PatternBar):PatternBar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close});

export interface StoredSeries{readonly resolution:string;readonly bars:readonly PatternBar[]}
/** One span fetch from a live source. Times are Unix seconds, half-open [start, end). */
export interface SpanFetchRequest{readonly providerId:string;readonly symbol:string;readonly resolution:string;readonly start:number;readonly end:number}
export type SpanFetchResult={readonly ok:true;readonly series:StoredSeries}|{readonly ok:false;readonly message:string};
/** Raw fetcher: bars at `resolution` (or the finer native interval it returns) over the span. */
export type SpanFetcher=(request:SpanFetchRequest)=>Promise<{readonly resolution:string;readonly bars:readonly Bar[]}>;
export interface IntervalContext extends ResampleContext{
 /** True when the host can fetch finer bars from a live source (BarsPatternData.fetchSpan is wired). */
 readonly canFetch?:boolean;
}
export type IntervalResampleResult=ResampleResult|{readonly ok:false;readonly code:'FETCH';readonly message:string;readonly fetch:SpanFetchRequest};

/** The interval of evenly spaced bars (smallest step), for patterns placed before a dataset identity was known. */
export function inferResolution(bars:readonly {time:number}[]):string|null{
 let step=Infinity;for(let i=1;i<bars.length;i++)step=Math.min(step,bars[i].time-bars[i-1].time);
 if(!Number.isFinite(step)||step<=0)return null;
 try{
  if(step%DAY===0){const days=step/DAY;if(days>=28&&days<=31)return '1M';return days%7===0?parseInterval(days/7+'W').id:parseInterval(days+'D').id;}
  if(step%60===0)return parseInterval(step/60+'m').id;
  return parseInterval(step+'s').id;
 }catch{return null;}
}
function decoded(series:BarsPatternSeries|undefined,source:BarsPatternSource):StoredSeries|null{
 if(!series)return null;
 const columns=decodeBars(series.bars,source);
 return typeof columns==='string'?null:{resolution:canonical(series.resolution),bars:columnsToBars(columns)};
}
/** The bars as captured at placement, with their interval; null for a pattern re-sampled before captured bars were stored. */
export function capturedSeries(member:BarsPatternMember):StoredSeries|null{
 if(member.captured)return decoded(member.captured,member.source);
 const s=member.source;
 if(s.placedResolution!==null&&s.resolution!==null&&canonical(s.resolution)!==canonical(s.placedResolution))return null;
 const own=decoded({resolution:s.placedResolution??s.resolution??'1D',bars:member.bars},s);if(!own)return null;
 const resolution=s.placedResolution??s.resolution??inferResolution(own.bars);
 return resolution?{resolution:canonical(resolution),bars:own.bars}:null;
}
export function fetchedSeries(member:BarsPatternMember):StoredSeries|null{return decoded(member.fetched,member.source);}
/** The member with `series` stored as its fetched bars (keeps the shown bars and the captured copy). */
export function withFetchedSeries(member:BarsPatternMember,series:StoredSeries):BarsPatternMember{
 const captured=capturedSeries(member);
 const next:BarsPatternMember={...member,...captured&&!member.captured?{captured:{resolution:captured.resolution,bars:encodeBars(captured.bars)}}:{},fetched:{resolution:canonical(series.resolution),bars:encodeBars(series.bars.map(toPattern))}};
 const read=readBarsPattern({[BARS_PATTERN_MEMBER]:next});
 if(read.state!=='supported')throw Error(read.state==='unavailable'?read.message:'Pattern data is missing.');
 return read.member;
}

const IDENTITY=['instrumentId','symbol','fixture','datasetKey','revision','sourceFingerprint'] as const;
const LIVE_PROVIDERS=[COINBASE_PROVIDER_ID,ALPACA_IEX_PROVIDER_ID,ALPACA_SIP_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID];
/** The live source the pattern's instrument is loaded from (the chart's own dataset first), as provider and symbol. */
function liveSourceOf(context:IntervalContext,source:BarsPatternSource):{providerId:string;symbol:string}|null{
 if(source.instrumentId===null)return null;
 const rows=context.datasets.filter(dataset=>dataset.instrument?.id===source.instrumentId&&LIVE_PROVIDERS.includes(dataset.provenance?.providerId));
 rows.sort((a,b)=>Number(b.provenance.datasetId===context.chart?.datasetId)-Number(a.provenance.datasetId===context.chart?.datasetId));
 for(const row of rows){
  const parts=row.provenance.datasetId.split(':'),symbol=parts[0]==='live'?parts[2]:parts[1];
  if(symbol)return{providerId:row.provenance.providerId,symbol};
 }
 return null;
}
function templateOf(context:IntervalContext,source:BarsPatternSource,resolution:string,bars:readonly PatternBar[]):BarDataset{
 const own=context.datasets.find(dataset=>source.instrumentId!==null&&dataset.instrument?.id===source.instrumentId);
 const instrument=own?{...own.instrument}:{id:source.instrumentId??'lv-bars-pattern',symbol:source.symbol??'PATTERN',name:'Bars pattern',exchange:'',currency:'',assetClass:'crypto' as const,tickSize:0.01,lotSize:1,timezone:'UTC'};
 return{instrument,resolution,bars:bars.map(bar=>({...toPattern(bar),volume:0})),provenance:{providerId:'lv-bars-pattern',providerName:'Bars pattern stored bars',datasetId:'lv-bars-pattern',fixture:source.fixture??false,coverage:'Bars stored with the drawing',asOf:0,delaySeconds:null,adjustment:'raw',session:'all',timezone:'UTC',state:'ready',license:'stored',revision:'1',notes:[]}} as BarDataset;
}
const keptMessage=(current:string)=>` The interval stays ${resolutionLabel(current)}.`;

/** Re-samples the pattern's span at `request.target` (rules in the header). Every failure keeps the current pattern. */
export function resampleBarsPatternInterval(member:BarsPatternMember,context:IntervalContext,request:ResampleRequest):IntervalResampleResult{
 let target:IntervalSpec;
 try{target=parseInterval(request.target);}catch(error){return{ok:false,code:'INVALID',message:String((error as Error).message??error)};}
 if(target.kind!=='time')return{ok:false,code:'INVALID',message:'Tick and range bars need actual event data; a pattern cannot be re-sampled to them.'};
 const captured=capturedSeries(member);
 // Legacy payloads (re-sampled before captured bars were stored) and the explicit source/range choices keep the loaded-data path.
 if(!captured||request.sourceKey||request.range==='available'){const result=resampleBarsPattern(member,context,request);return result.ok&&captured?attach(result,member,captured):result;}
 let source:BarsPatternSource={...member.source,placedResolution:member.source.placedResolution??captured.resolution};
 if(source.instrumentId===null&&context.datasets.length){
  let probe:BarsPatternMember|null=null;try{probe=makeBarsPatternMember({...member.source,resolution:null,placedResolution:null},captured.bars);}catch{probe=null;}
  const bound=probe?bindBarsPatternSource(probe,context.datasets,context.chart):null;
  if(bound?.ok)source={...source,...Object.fromEntries(IDENTITY.map(key=>[key,bound.source[key]??null])),resolution:source.resolution??captured.resolution};
 }
 const current=member.source.resolution??captured.resolution,label=resolutionLabel(target.id);
 const stored={captured:member.captured??{resolution:captured.resolution,bars:encodeBars(captured.bars)},fetched:member.fetched??null};
 const fromSeries=(series:StoredSeries):ResampleResult=>{
  let bars:readonly PatternBar[];
  if(canonical(series.resolution)===target.id)bars=series.bars;
  else{
   try{bars=aggregateInterval(templateOf(context,source,series.resolution,series.bars),target.id,context.policy).dataset.bars;}
   catch(error){return{ok:false,code:'NO_SOURCE',message:`${label[0].toUpperCase()+label.slice(1)} bars cannot be built from the stored ${resolutionLabel(series.resolution)} bars (${String((error as Error).message??error)}).`+keptMessage(current)};}
  }
  if(!bars.length)return{ok:false,code:'EMPTY',message:`No ${label} bars inside this pattern's span.`+keptMessage(current)};
  if(bars.length>BARS_PATTERN_BAR_CAP)return{ok:false,code:'OVER_CAP',message:`Needs ${fmt(bars.length)} bars at ${label}; the limit is ${fmt(BARS_PATTERN_BAR_CAP)}.`+keptMessage(current),needs:bars.length,limit:BARS_PATTERN_BAR_CAP};
  const {spanStart,spanEnd}=source,trimmedFirst=bars[0].time<spanStart,trimmedLast=periodEnd(bars[bars.length-1].time,target)>spanEnd;
  let gaps=0;for(let i=1;i<bars.length;i++)if(bars[i].time>periodEnd(bars[i-1].time,target))gaps++;
  const derived=canonical(series.resolution)!==target.id;
  const next:BarsPatternSource={...source,resolution:target.id,derived,trimmed:trimmedFirst||trimmedLast};
  try{
   const out=makeBarsPatternMember(next,bars.map(bar=>toPattern(bar.time<spanStart?{...bar,time:spanStart}:bar)),stored);
   const summary:ResampleSummary={count:bars.length,resolution:target.id,derived,trimmed:next.trimmed,trimmedFirst,extendsPastSpan:false,gaps,spanStart,spanEnd,symbol:source.symbol??'this chart',fixture:source.fixture===true,narrowed:false};
   return{ok:true,member:out,summary};
  }catch(error){return{ok:false,code:'INVALID',message:String((error as Error).message??error)+keptMessage(current)};}
 };
 if(approxSeconds(target.id)>=approxSeconds(captured.resolution))return fromSeries(captured);
 const fetched=fetchedSeries(member);
 if(fetched&&approxSeconds(fetched.resolution)<=approxSeconds(target.id)){const result=fromSeries(fetched);if(result.ok)return result;}
 const loaded=resampleBarsPattern({...member,source},context,request);
 if(loaded.ok)return attach(loaded,member,captured);
 if(loaded.code!=='NO_SOURCE'&&loaded.code!=='UNBOUND')return loaded;
 const live=context.canFetch?liveSourceOf(context,source):null;
 if(live)return{ok:false,code:'FETCH',message:`Loading ${label} data for this span...`,fetch:{...live,resolution:target.id,start:source.spanStart,end:source.spanEnd}};
 return{ok:false,code:'NO_SOURCE',message:`No ${label} data is available for this span.`+keptMessage(current)};
}
/** A loaded-data result with the captured bars (and any fetched bars) still stored. */
function attach(result:Extract<ResampleResult,{ok:true}>,member:BarsPatternMember,captured:StoredSeries):ResampleResult{
 const next={...result.member,captured:member.captured??{resolution:captured.resolution,bars:encodeBars(captured.bars)},...member.fetched?{fetched:member.fetched}:{}};
 const read=readBarsPattern({[BARS_PATTERN_MEMBER]:next});
 return read.state==='supported'?{...result,member:read.member}:result;
}

// ---------------------------------------------------------------- live span fetch (existing bridges only)

let requests=0;
const ALPACA_SPAN_NATIVE=Object.freeze(Object.fromEntries(Object.entries(ALPACA_RESOLUTIONS).filter(([id])=>id!=='60m'))) as typeof ALPACA_RESOLUTIONS;
/** The coarsest native interval that divides `target` (bars at it aggregate exactly into the target buckets). */
function nativeFor<T extends {seconds:number}>(table:Readonly<Record<string,T>>,target:IntervalSpec):[string,T]|null{
 const bucket=target.seconds??(target.unit==='week'?7*DAY*target.multiplier:DAY*(target.unit==='day'?target.multiplier:1));
 const rows=Object.entries(table).sort((a,b)=>b[1].seconds-a[1].seconds);
 return rows.find(([,row])=>row.seconds<=bucket&&bucket%row.seconds===0)??null;
}
/** A SpanFetcher over the existing main-process bridges (window.lv): Coinbase public candles and Alpaca bars. */
export function barsPatternSpanFetcher(bridges:{coinbase?:Pick<CoinbaseBridge,'fetchCoinbaseCandles'>|null;alpaca?:Pick<AlpacaBridge,'fetchAlpacaBars'>|null}):SpanFetcher{
 return async request=>{
  const target=parseInterval(request.resolution);
  if(request.providerId===COINBASE_PROVIDER_ID){
   const bridge=bridges.coinbase;if(!bridge)throw Error('the live crypto source is not connected');
   const native=nativeFor(COINBASE_RESOLUTIONS,target);if(!native)throw Error('the source has no matching interval');
   const [id,{granularity,seconds}]=native;
   if((request.end-request.start)/seconds>BARS_PATTERN_BAR_CAP)throw Error(`more than ${fmt(BARS_PATTERN_BAR_CAP)} bars`);
   const out:Bar[]=[],step=300*seconds;
   for(let start=request.start;start<request.end;start+=step){
    const result=await bridge.fetchCoinbaseCandles({requestId:'bp-'+(++requests),productId:request.symbol,granularity,start,end:Math.min(request.end,start+step)});
    if(!result.ok)throw Error(result.error.message);
    out.push(...result.value.bars);
   }
   return{resolution:id,bars:out};
  }
  if(request.providerId===ALPACA_IEX_PROVIDER_ID||request.providerId===ALPACA_SIP_PROVIDER_ID){
   const bridge=bridges.alpaca;if(!bridge)throw Error('the live stock source is not connected');
   // Alpaca 1Hour bars start on the clock hour, not at the 09:30 open, so hour targets fold 15Min bars
   // into session buckets (aggregateInterval's US equity anchor), as live-intervals.ts ALPACA_SHAPE does.
   const native=nativeFor(ALPACA_SPAN_NATIVE,target);if(!native)throw Error('the source has no matching interval');
   // Spans follow the chart's sources: all exchanges for a paid plan or a span that ended 15 minutes ago.
   const paid=currentAlpacaDataPlan()==='paid',historical=request.end<=Math.floor(Date.now()/1000)-ALPACA_SIP_DELAY_SECONDS;
   const [id,{timeframe}]=native,feed=request.providerId===ALPACA_SIP_PROVIDER_ID||paid||historical?'sip' as const:'iex' as const,out:Bar[]=[];
   let pageToken:string|undefined;
   for(let page=0;page<200;page++){
    const result=await bridge.fetchAlpacaBars({requestId:'bp-'+(++requests),symbol:request.symbol,timeframe,feed,start:request.start,end:request.end,adjustment:currentAlpacaAdjustment(),...paid?{plan:'paid' as const}:{},...pageToken?{pageToken}:{}});
    if(!result.ok)throw Error(result.error.message);
    out.push(...result.value.bars);if(out.length>BARS_PATTERN_BAR_CAP)throw Error(`more than ${fmt(BARS_PATTERN_BAR_CAP)} bars`);
    if(!result.value.nextPageToken)break;pageToken=result.value.nextPageToken;
   }
   return{resolution:id,bars:out};
  }
  throw Error('this chart has no live source for finer bars');
 };
}
/** Runs a span fetch and returns usable bars inside the span, or a plain message. Never throws. */
export async function fetchBarsPatternSpan(request:SpanFetchRequest,fetcher:SpanFetcher|null|undefined):Promise<SpanFetchResult>{
 const failed=(reason:string):SpanFetchResult=>({ok:false,message:`Could not load ${resolutionLabel(request.resolution)} data for this span (${reason}). The interval is unchanged.`});
 if(!fetcher)return failed('no live source is connected');
 let raw;
 try{raw=await fetcher(request);}catch(error){return failed(String((error as Error)?.message??error));}
 const seen=new Set<number>(),bars:PatternBar[]=[];
 for(const bar of [...raw.bars].sort((a,b)=>a.time-b.time)){
  if(!(bar.time>=request.start&&bar.time<request.end)||seen.has(bar.time))continue;
  if(![bar.open,bar.high,bar.low,bar.close].every(value=>Number.isFinite(value)&&value>0)||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close))continue;
  seen.add(bar.time);bars.push(toPattern(bar));
 }
 if(!bars.length)return failed('the source returned no bars for it');
 if(bars.length>BARS_PATTERN_BAR_CAP)return failed(`more than ${fmt(BARS_PATTERN_BAR_CAP)} bars`);
 return{ok:true,series:{resolution:canonical(raw.resolution),bars}};
}
