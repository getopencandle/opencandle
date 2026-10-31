import type {ChartSourceContext} from './source-context';
import type {FinerBarsLookup} from '../domain/volume-profile';
import type {Bar} from '../domain/types';
import {parseInterval} from '../domain/intervals';
import {chartBarEnd} from '../domain/indicator-resample';
import {currentScriptRequestResolver,type ScriptDatasetResolverExtras,type ScriptRequestResolver,type ScriptRequestSeries} from '../ui/script-requests';

/** A chart-owned request for actual same-symbol history, including equal-interval volume and coarser daily history. */
export function indicatorHistoryLookup(datasetId:string|undefined,resolution:string|null|undefined,onLoading?:()=>void,_resolver?:unknown,requestSource?:ChartSourceContext):FinerBarsLookup|null{
 if(!datasetId||typeof resolution!=='string'||!resolution)return null;
 return interval=>{
  const resolver=currentScriptRequestResolver();if(!resolver)return {state:'unavailable',bars:null,message:null};
  try{
   // The resolver enforces this dataset's instrument/provider identity and source coverage; no cross-symbol fallback.
   const requested=parseInterval(interval).id,series=resolver({id:'indicator-history',symbol:null,interval:requested},{datasetId,resolution,owner:'chart',...(requestSource?{source:requestSource,sessionOverride:requestSource.sessionOverride}:{})});
   if(parseInterval(series.resolution).id!==requested)return {state:'unavailable',bars:null,message:'History at the requested interval is unavailable.'};
   return {state:'ready',bars:series.bars,message:null};
  }catch(cause){
   if(/\bloading\b/i.test(cause instanceof Error?cause.message:String(cause))){onLoading?.();return {state:'loading',bars:null,message:null};}
   return {state:'unavailable',bars:null,message:null};
  }
 };
}

/** Chart-owned history requests that a replaying chart must not read past its clock. */
const REPLAY_CLIPPED_REQUESTS=new Set(['indicator-history','volume-profile']);
const clipped=new WeakMap<readonly Bar[],{clock:number;bars:readonly Bar[]}>();
/**
 * The rows of a history series that had closed by `clock` (a replay event-time watermark, Unix seconds): a row is kept when
 * its own period end (series.ends when supplied, else the open time plus the interval) is at or before the clock. During Bar
 * Replay the forming chart bar is built from revealed replay steps only, so intrabar volume (Volume delta, Up/Down volume,
 * CVD) must read the same revealed rows, never the rest of the hour. Returns the same array when nothing is cut.
 */
export function historyRowsClosedBy(series:Pick<ScriptRequestSeries,'bars'|'resolution'|'ends'>,clock:number):readonly Bar[]{
 const bars=series.bars;if(!bars.length)return bars;
 const cached=clipped.get(bars);if(cached&&cached.clock===clock)return cached.bars;
 const spec=parseInterval(series.resolution),end=(i:number)=>{const own=series.ends?.[i];return typeof own==='number'&&Number.isFinite(own)?own:chartBarEnd(bars[i].time,spec);};
 // Rows are in time order, so their period ends are too: the first row ending after the clock starts the cut.
 let low=0,high=bars.length;while(low<high){const middle=(low+high)>>1;if(end(middle)<=clock)low=middle+1;else high=middle;}
 const out=low===bars.length?bars:Object.freeze(bars.slice(0,low));clipped.set(bars,{clock,bars:out});return out;
}
/**
 * The installed request resolver with chart-owned history clipped to each replaying chart's clock. `clockOf` names the
 * replay clock for a chart dataset id, or null when that chart is not replaying (its requests pass through unchanged).
 */
export function replayClippedResolver(resolver:ScriptRequestResolver&ScriptDatasetResolverExtras,clockOf:(datasetId:string)=>number|null):ScriptRequestResolver&ScriptDatasetResolverExtras{
 const wrap=(inner:ScriptRequestResolver):ScriptRequestResolver=>(request,base)=>{
  const series=inner(request,base),clock=base.owner==='chart'&&REPLAY_CLIPPED_REQUESTS.has(request.id)?clockOf(base.datasetId):null;
  if(clock===null||!Number.isFinite(clock))return series;
  const bars=historyRowsClosedBy(series,clock);if(bars===series.bars)return series;
  return {...series,bars,...(series.ends?{ends:series.ends.slice(0,bars.length)}:{})};
 };
 const out:ScriptRequestResolver&ScriptDatasetResolverExtras=wrap(resolver);
 if(resolver.loadedOnly)out.loadedOnly=resolver.loadedOnly===resolver?out:wrap(resolver.loadedOnly);
 if(resolver.calendarFor)out.calendarFor=resolver.calendarFor;
 return out;
}
