import {linkLiveSessionSource,liveSessionSourceCurrent} from '../domain/live-session-source';
/** US equity pre-market and post-market sessions on the chart.
 * Phases by New York wall clock, the same hours as src/domain/us-market-hours.ts: pre 04:00-09:30, regular 09:30-16:00,
 * post 16:00-20:00, overnight otherwise. A bar is classified by its open. The zones feed the renderer's own `sessionZones`
 * feature, which paints them with its own premarket and postmarket shades (behind the grid, snapped to bar slots).
 * On a listed NYSE early-close day the regular session ends at 13:00 and post-market runs 13:00-17:00. */
import {liveLineageOf,stampLiveLineage} from './bar-input-identity';
import {newYorkClock,usSessionPhase,usSessionSegment} from '../domain/us-market-hours';
import type {Bar,BarDataset} from '../domain/types';
import {parseInterval} from '../domain/intervals';

export type SessionMode='regular'|'extended';
export type SessionPhase='pre'|'regular'|'post'|'overnight';
export interface SessionZones{pre:[number,number][];post:[number,number][];extended:[number,number][]}

/**
 * The New York phase of an instant and the end of its session segment are pure functions of the Unix second
 * (us-market-hours: wall clock plus the fixed NYSE calendar), but each costs a date conversion. A live tick recomputed
 * them for every loaded bar, twice (about 100 ms per pass at 20,000 one-minute bars). Results are kept per second, so a
 * tick computes only its new bars. Bounded: cleared past SESSION_MEMO_LIMIT entries.
 */
const SESSION_MEMO_LIMIT=250000;
const phaseMemo=new Map<number,SessionPhase>(),segmentEndMemo=new Map<number,number>();
function memoPhase(time:number):SessionPhase{
 let phase=phaseMemo.get(time);
 if(phase===undefined){phase=usSessionPhase(time);if(phaseMemo.size>=SESSION_MEMO_LIMIT)phaseMemo.clear();phaseMemo.set(time,phase);}
 return phase;
}
function segmentEnd(time:number):number{
 let end=segmentEndMemo.get(time);
 if(end===undefined){end=usSessionSegment(time).end;if(segmentEndMemo.size>=SESSION_MEMO_LIMIT)segmentEndMemo.clear();segmentEndMemo.set(time,end);}
 return end;
}
export function barSessionPhase(openMs:number):SessionPhase{
 return Number.isFinite(openMs)?memoPhase(Math.floor(openMs/1000)):'overnight';
}
/** Sessions exist for US-listed instruments quoted in New York time, on intraday bars only. */
export function sessionsApply(assetClass:string|undefined,timezone:string|undefined,intervalMs:number):boolean{
 return['stock','etf','option','index'].includes(assetClass??'')&&timezone==='America/New_York'&&Number.isFinite(intervalMs)&&intervalMs>0&&intervalMs<86_400_000;
}
/** Contiguous pre and post runs as [first open, last open + interval) in epoch ms, cut at the segment end (a session
 * bucket such as 09:00-09:30 never shades past the open). Bars carry Unix seconds. */
export function sessionZonesFor(bars:readonly {time:number}[],intervalMs:number):SessionZones{
 const zones:SessionZones={pre:[],post:[],extended:[]};let run:{phase:'pre'|'post';from:number;to:number}|null=null;
 const close=()=>{if(run)zones[run.phase].push([run.from,run.to]);run=null;};
 const known=Array.isArray(bars)?barPhases(bars):null;
 for(let index=0;index<bars.length;index++){const row=bars[index],open=row.time*1000,phase=known?PHASES[known.phase[index]]:barSessionPhase(open);
  if(phase!=='pre'&&phase!=='post'){close();continue;}
  const end=Math.min(open+intervalMs,(known?known.end[index]:segmentEnd(row.time))*1000);
  if(run&&run.phase===phase)run.to=end;else{close();run={phase,from:open,to:end};}}
 close();return zones;
}
/** The chart's own bar array grows in place on a live tick. Per array, the phase and segment end of each bar are
 * kept with the time they were computed for; a call recomputes only the bars whose time changed (and new bars). */
const PHASES:readonly SessionPhase[]=['regular','pre','post','overnight'];
const phaseCodes:Record<SessionPhase,number>={regular:0,pre:1,post:2,overnight:3};
const barPhaseMemo=new WeakMap<object,{count:number;time:Float64Array;phase:Uint8Array;end:Float64Array}>();
function barPhases(bars:readonly {time:number}[]):{phase:Uint8Array;end:Float64Array}{
 const count=bars.length;let memo=barPhaseMemo.get(bars);
 if(!memo||memo.time.length<count){const size=Math.max(count,(memo?.time.length??0)*2,256),time=new Float64Array(size),phase=new Uint8Array(size),end=new Float64Array(size);if(memo){time.set(memo.time.subarray(0,memo.count));phase.set(memo.phase.subarray(0,memo.count));end.set(memo.end.subarray(0,memo.count));}memo={count:memo?.count??0,time,phase,end};barPhaseMemo.set(bars,memo);}
 const {time,phase,end}=memo,known=Math.min(memo.count,count);
 for(let index=0;index<count;index++){
  const row=bars[index],at=row.time;
  if(index<known&&Object.is(time[index],at))continue;
  const code=phaseCodes[barSessionPhase(at*1000)];time[index]=at;phase[index]=code;end[index]=code===1||code===2?segmentEnd(at):0;
 }
 memo.count=count;return memo;
}
/** Session-break times for an intraday US equity chart, in epoch ms. A break sits
 * at the open of the first bar of each New York trading date after the first one shown (with extended hours on, that
 * is the first pre-market bar; with them off, the 09:30 bar), so it falls between the last bar of one session and the
 * first bar of the next. Bars carry Unix seconds, ascending. Pure: drawing the lines needs a chart setting and a
 * painter, neither of which is in the recorded reference facts yet. */
export function sessionBreakTimes(bars:readonly {time:number}[]):number[]{
 const out:number[]=[];let previous:string|null=null;const dates=Array.isArray(bars)?barDates(bars):null;
 for(let index=0;index<bars.length;index++){const row=bars[index];if(!Number.isFinite(row.time))continue;const date=dates?dates[index]:newYorkClock(row.time).date;if(previous!==null&&date!==previous)out.push(row.time*1000);previous=date;}
 return out;
}
/** New York dates of a bar array's finite times, kept per array with the time each was computed for. */
const barDateMemo=new WeakMap<object,{time:number[];date:string[]}>();
function barDates(bars:readonly {time:number}[]):string[]{
 let memo=barDateMemo.get(bars);if(!memo){memo={time:[],date:[]};barDateMemo.set(bars,memo);}
 const {time,date}=memo;
 for(let index=0;index<bars.length;index++){const at=bars[index].time;if(!Number.isFinite(at))continue;if(index<time.length&&Object.is(time[index],at))continue;time[index]=at;date[index]=newYorkClock(at).date;}
 return date;
}
/** Session break line color (dark and light themes). */
export const SESSION_BREAK_COLOR='#4985e7';
/** Session breaks setting: break times for the chart, or none when sessions do not apply (not a US equity
 * quoted in New York time) or the bars are daily or longer. Epoch ms, ascending. */
export function sessionBreaksFor(bars:readonly {time:number}[],instrument:{assetClass?:string;timezone?:string}|null|undefined,intervalMs:number):number[]{
 return sessionsApply(instrument?.assetClass,instrument?.timezone,intervalMs)?sessionBreakTimes(bars):[];
}
/** Regular-hours-only data (Extended trading hours off): keeps bars that open from 09:30 to 16:00 New York time. */
export function regularSessionBars<T extends {time:number}>(bars:readonly T[]):T[]{return bars.filter(row=>barSessionPhase(row.time*1000)==='regular');}
/** Lineage suffix of a regular-hours view of a live snapshot (the raw lineage key plus this suffix, same seq). */
export const RTH_LINEAGE_SUFFIX='|rth';
const rthViews=new WeakMap<readonly Bar[],{bars:Bar[];count:number;seq:number|undefined}>(),rawOfView=new WeakMap<readonly Bar[],Bar[]>();
/** The bars a chart shows for a session mode. 'extended', non-US-equity, daily+ or regular-only input returns the SAME array
 * (identity kept, so nothing downstream sees a new input). 'regular' otherwise returns one cached filtered array per input;
 * a live snapshot's view joins a sibling lineage (key + RTH_LINEAGE_SUFFIX, same seq) so its growth stays one input.
 * A view that would be empty (only pre/post bars loaded so far) keeps the input: an empty chart cannot render. */
export function sessionChartBars(bars:Bar[],mode:SessionMode,instrument:{assetClass?:string;timezone?:string},refresh=false):Bar[]{
 const raw=rawOfView.get(bars)??bars;
 if(mode!=='regular'||!sessionsApply(instrument.assetClass,instrument.timezone,barIntervalMs(raw)))return raw;
 const sequence=liveLineageOf(raw)?.seq,cached=rthViews.get(raw);if(!refresh&&cached&&cached.count===raw.length&&cached.seq===sequence)return cached.bars;
 const filtered=regularSessionBars(raw);
 if(!filtered.length||filtered.length===raw.length){rthViews.set(raw,{bars:raw,count:raw.length,seq:sequence});return raw;}
 const lineage=liveLineageOf(raw);if(lineage)stampLiveLineage(filtered,lineage.key+RTH_LINEAGE_SUFFIX,lineage.seq);
 rthViews.set(raw,{bars:filtered,count:raw.length,seq:sequence});rawOfView.set(filtered,raw);return filtered;
}
const datasetViews=new WeakMap<BarDataset,Map<SessionMode,BarDataset>>(),rawDatasets=new WeakMap<BarDataset,BarDataset>();
/** The dataset a chart shows for a session mode: the same object when its bars are unchanged, else one cached copy with
 * the session bars (instrument and provenance shared). A view maps back to its raw dataset, so switching modes never stacks. */
export function sessionDataset(dataset:BarDataset,mode:SessionMode):BarDataset{
 const raw=rawDatasets.get(dataset)??dataset;
 let views=datasetViews.get(raw);const hit=views?.get(mode),current=!hit||liveSessionSourceCurrent(hit);
 const bars=sessionChartBars(raw.bars,mode,raw.instrument,!current);if(hit&&current&&hit.bars===bars)return hit;const view=bars===raw.bars?raw:{...raw,bars};
 if(view!==raw){rawDatasets.set(view,raw);linkLiveSessionSource(view,raw);}
 if(!views){views=new Map();datasetViews.set(raw,views);}views.set(mode,view);return view;
}
/** The raw dataset behind a session view (the dataset itself when it is not a view). */
export function rawSessionDataset(dataset:BarDataset):BarDataset{return rawDatasets.get(dataset)??dataset;}
export function sessionDatasets(datasets:BarDataset[],mode:SessionMode):BarDataset[]{
 const next=datasets.map(row=>sessionDataset(row,mode));return next.every((row,index)=>row===datasets[index])?datasets:next;
}
/** The nominal bar interval in ms from the source resolution (time intervals only); session-anchored buckets make the
 *  measured step shorter than the interval (a 09:00-09:30 bucket in 1h bars), so the measured step is only the fallback. */
export function nominalBarIntervalMs(resolution:string|undefined,bars:readonly {time:number}[]):number{
 try{if(resolution){const spec=parseInterval(resolution);if(spec.kind!=='event'&&spec.seconds!==null&&spec.seconds>0)return spec.seconds*1000;}}catch{/* unparsed resolution: measure */}
 return barIntervalMs(bars);
}
/** Bar interval in ms: the smallest positive step between the last 64 bars (gaps such as overnight never win). 0 if unknown. */
export function barIntervalMs(bars:readonly {time:number}[]):number{
 let best=Infinity;for(let index=Math.max(1,bars.length-64);index<bars.length;index++){const step=(bars[index].time-bars[index-1].time)*1000;if(step>0&&step<best)best=step;}
 return Number.isFinite(best)?best:0;
}
