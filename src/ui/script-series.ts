import type {Bar} from '../domain/types';
import {parseInterval} from '../domain/intervals';
import {chartBarEnd,planHigherTimeframe} from '../domain/indicator-resample';
import {scriptRequestEnds,type ScriptDatasetResolverExtras,type ScriptRequestBase,type ScriptRequestResolver} from './script-requests';

/**
 * The renderer side of ctx.timeframe (SCRIPT.RUNTIME.MTF) and ctx.symbol (SCRIPT.RUNTIME.MULTISYMBOL).
 *
 * Each declared series becomes `{rows, visible}`: completed rows oldest first, and for every script bar the number of
 * leading rows that are complete by the end of that bar. The worker reads only rows below that count, and the main
 * process checks again that no visible row starts after its bar or ends after the next bar begins.
 *
 * Timeframes are built from the bars the script runs on with planHigherTimeframe, on New York trading sessions for a
 * US equity chart (calendar 'us-equity') and the UTC calendar policy otherwise. A higher-timeframe bar becomes visible
 * on the chart bar where the planner confirms it, so a developing bar is never visible. Symbols read only datasets the
 * app has already loaded, through the resolver's loaded-only path; nothing is fetched and no feed is opened.
 */
export const SCRIPT_SERIES_DEPTH=500;
export const SCRIPT_SERIES_ROWS=5500;
export interface ScriptTimeframeDeclaration {id:string;interval:string}
export interface ScriptSymbolDeclaration {id:string;symbol:string}
export interface ScriptSeriesRow {time:number;open:number;high:number;low:number;close:number;volume:number|null;end:number}
export interface ScriptSeriesFeed {rows:ScriptSeriesRow[];visible:number[]}
export interface ResolvedScriptSeries {feeds:Record<string,ScriptSeriesFeed>;labels:string[];fixture:boolean}

const row=(bar:Bar,end:number):ScriptSeriesRow=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:Number.isFinite(bar.volume)&&bar.volume>=0?bar.volume:null,end});
/** Keep only the rows any bar can reach (its visible count minus the history depth), re-based to the kept slice. */
function trimmed(rows:ScriptSeriesRow[],visible:number[],what:string):ScriptSeriesFeed{
 if(!visible.length)return {rows:[],visible:[]};
 const low=Math.max(0,visible[0]-1-SCRIPT_SERIES_DEPTH),high=visible[visible.length-1];
 if(high-low>SCRIPT_SERIES_ROWS)throw new Error(what+' needs '+(high-low)+' rows for these bars; the limit is '+SCRIPT_SERIES_ROWS+'. Use fewer chart bars.');
 return {rows:rows.slice(low,high),visible:visible.map(count=>count-low)};
}
function chartSpec(resolution:string|null){
 if(!resolution)throw new Error('This chart style or source has no time interval, so script timeframes and symbols cannot be aligned.');
 let spec;try{spec=parseInterval(resolution);}catch{throw new Error('The chart interval '+resolution+' is not a supported time interval.');}
 if(spec.kind!=='time')throw new Error('The chart uses '+spec.id+' event bars. Script timeframes and symbols need time intervals.');
 return spec;
}

/** Completed higher-timeframe bars of the script's own bars. The same interval as the chart reads the chart bars.
 *  completeRows: chart bars known to be closed (a live or replay forming last bar is not); absent = all of them. A
 *  higher-timeframe bar whose last chart bar is still forming stays developing and is not visible. */
export function resolveScriptTimeframes(declarations:readonly ScriptTimeframeDeclaration[],bars:readonly Bar[],resolution:string|null,calendar:'us-equity'|'utc'|null,completeRows?:number):ResolvedScriptSeries{
 const feeds:Record<string,ScriptSeriesFeed>=Object.create(null),labels:string[]=[];
 const chart=chartSpec(resolution);
 for(const declaration of declarations){
  const what='Timeframe '+declaration.id;
  let target:string;try{target=parseInterval(declaration.interval).id;}catch{throw new Error(what+': '+declaration.interval+' is not a supported interval.');}
  if(target===chart.id){
   feeds[declaration.id]=trimmed(bars.map(bar=>row(bar,chartBarEnd(bar.time,chart))),bars.map((_,index)=>index+1),what);
   labels.push(declaration.id+' = chart bars ('+target+')');continue;
  }
  const planned=planHigherTimeframe(bars,chart.id,target,{calendar,...(completeRows!==undefined?{completeRows}:{})});
  if(!planned.ok)throw new Error(what+': '+planned.message);
  const plan=planned.plan,rows=plan.bars.map((bar,index)=>row(bar,plan.buckets[index].end)),visible:number[]=new Array(bars.length);
  // confirmedAt is non-decreasing; a null (developing) bucket is never counted.
  let count=0;for(let index=0;index<bars.length;index++){while(count<plan.confirmedAt.length&&plan.confirmedAt[count]!==null&&plan.confirmedAt[count]!<=index)count++;visible[index]=count;}
  feeds[declaration.id]=trimmed(rows,visible,what);
  labels.push(declaration.id+' = '+target+' from the chart bars'+(calendar==='us-equity'?' (New York sessions)':' (UTC calendar)'));
 }
 return {feeds:{...feeds},labels,fixture:false};
}

/** Another loaded symbol at the chart interval, aligned without lookahead. Refuses instead of opening a feed. */
export function resolveScriptSymbols(declarations:readonly ScriptSymbolDeclaration[],bars:readonly Bar[],base:ScriptRequestBase,resolver:ScriptRequestResolver&ScriptDatasetResolverExtras):ResolvedScriptSeries{
 const feeds:Record<string,ScriptSeriesFeed>=Object.create(null),labels:string[]=[];let fixture=false;
 const chart=chartSpec(base.resolution);
 const loaded=resolver.loadedOnly;
 if(!loaded)throw new Error('Script symbols need the loaded-data resolver, which is not available here.');
 for(const declaration of declarations){
  const what='Symbol '+declaration.id;
  let series;try{series=loaded({id:declaration.id,symbol:declaration.symbol,interval:null},base);}catch(error){throw new Error(what+': '+(error instanceof Error?error.message:String(error)));}
  const ends=scriptRequestEnds(series),source=series.bars;
  for(let i=1;i<source.length;i++)if(!(source[i].time>source[i-1].time)||ends[i]<ends[i-1])throw new Error(what+': loaded bars must have strictly increasing times.');
  const rows=source.map((bar,index)=>row(bar,ends[index])),visible:number[]=new Array(bars.length);
  let count=0;for(let index=0;index<bars.length;index++){const end=chartBarEnd(bars[index].time,chart);while(count<rows.length&&rows[count].end<=end)count++;visible[index]=count;}
  feeds[declaration.id]=trimmed(rows,visible,what);
  labels.push(declaration.id+' = '+series.label+(series.fixture?' (synthetic)':''));fixture||=series.fixture;
 }
 return {feeds:{...feeds},labels,fixture};
}
