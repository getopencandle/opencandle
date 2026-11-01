import {resolvedScriptRequestReceipt,bindScriptRequestJobReceipt,type ScriptRequestExportReceipt,type ScriptRequestJobReceipt} from './script-request-export-proof';
import type {LVBridge} from '../../electron/bridge';
import type {Bar} from '../domain/types';
import {scriptBarIds} from './script-input';
import type {EngineFeed} from '../strategy-report/feedback';
import {currentScriptRequestResolver,declaresScriptRequests,resolveScriptRequests,type ScriptDatasetResolverExtras,type ScriptRequestBase,type ScriptRequestDeclaration,type ScriptRequestResolver} from './script-requests';
import {resolveScriptSymbols,resolveScriptTimeframes,type ScriptSeriesFeed,type ScriptSymbolDeclaration,type ScriptTimeframeDeclaration} from './script-series';
import {closedChartRows} from '../chart/indicator-history-lookup';
export type ScriptResult=Extract<Awaited<ReturnType<LVBridge['executeScript']>>,{ok:true}>['value'];
export type ScriptInputValue=number|string|boolean;
export type ScriptInputDeclaration=NonNullable<ScriptResult['declarations']>['inputs'][number];
const aborted=()=>new DOMException('Script work was cancelled.','AbortError');
type Job={work:()=>Promise<unknown>;signal:AbortSignal;resolve:(value:unknown)=>void;reject:(error:unknown)=>void;started:boolean;cancelled:boolean;unlisten:()=>void};
/** A cancelled running job keeps its slot until its worker settles. */
export class ScriptJobQueue{
 private active=0;private pending:Job[]=[];
 constructor(private limit=2,private maximumPending=1024){if(!Number.isInteger(limit)||limit<1||!Number.isInteger(maximumPending)||maximumPending<1)throw new Error('Invalid script queue limits.');}
 enqueue<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{
  if(signal.aborted)return Promise.reject(aborted());if(this.pending.length>=this.maximumPending)return Promise.reject(new Error('Script queue is full. Cancel unused instances and retry.'));
  return new Promise<T>((resolve,reject)=>{const job:Job={work,signal,resolve:value=>resolve(value as T),reject,started:false,cancelled:false,unlisten:()=>{}};const cancel=()=>{job.cancelled=true;reject(aborted());if(!job.started){this.pending=this.pending.filter(row=>row!==job);job.unlisten();}};job.unlisten=()=>signal.removeEventListener('abort',cancel);signal.addEventListener('abort',cancel,{once:true});this.pending.push(job);this.pump();});
 }
 private pump(){while(this.active<this.limit&&this.pending.length){const job=this.pending.shift()!;if(job.cancelled||job.signal.aborted){job.unlisten();job.reject(aborted());continue;}job.started=true;this.active++;Promise.resolve().then(()=>job.cancelled?Promise.reject(aborted()):job.work()).then(value=>{if(!job.cancelled)job.resolve(value);},error=>{if(!job.cancelled)job.reject(error);}).finally(()=>{job.unlisten();this.active--;this.pump();});}}
 counts(){return{running:this.active,queued:this.pending.length};}
}
export const scriptJobs=new ScriptJobQueue();
export type ScriptDataKind='synthetic'|'live'|'imported';
export function scriptDataKind(input:{fixture:boolean;live?:boolean}):ScriptDataKind{return input.fixture?'synthetic':input.live?'live':'imported';}
/** Plain provenance label for a script run. Live data is not "local history". */
export function scriptProvenanceLabel(kind:ScriptDataKind,identity:string):string{return(kind==='synthetic'?'Example data · ':kind==='live'?'Live market data (personal use) · ':'User-supplied local history · ')+identity;}
/** Panel footer wording for the data a script runs on. */
export function scriptDataFooter(kind:ScriptDataKind):string{return kind==='synthetic'?'Example data':kind==='live'?'Live market data':'Local imported data';}
/** Request declarations depend only on the source text. Bounded cache so the declaration pass runs once per source. */
// The same pass also reports declared timeframes (ctx.timeframe) and loaded symbols (ctx.symbol).
interface ScriptSeriesDeclarations {requests:ScriptRequestDeclaration[];timeframes:ScriptTimeframeDeclaration[];symbols:ScriptSymbolDeclaration[]}
const declarationCache=new Map<string,ScriptSeriesDeclarations>();
function rememberDeclarations(source:string,declarations:ScriptSeriesDeclarations){declarationCache.delete(source);declarationCache.set(source,declarations);while(declarationCache.size>64)declarationCache.delete(declarationCache.keys().next().value!);}
/** The request declarations of a source that has run once (copies; null before its first run). */
export function cachedScriptRequestDeclarations(source:string):ScriptRequestDeclaration[]|null{return declarationCache.get(source)?.requests.map(row=>({...row}))??null;}
export interface ScriptRequestContext {base:ScriptRequestBase;resolver?:(ScriptRequestResolver&ScriptDatasetResolverExtras)|null}
/** The restricted runtime reads at most this many bars per run. A longer chart runs on its newest bars; older bars stay blank. */
export const SCRIPT_BAR_LIMIT=5000;
export const SCRIPT_TAIL_NOTE='Calculated on the latest 5,000 bars.';
/** The bar count a run on `count` chart bars reads, and the note to show beside its result while the chart is over the limit. */
export const scriptRunCount=(count:number)=>Math.min(count,SCRIPT_BAR_LIMIT);
export const scriptTailNote=(count:number)=>count>SCRIPT_BAR_LIMIT?SCRIPT_TAIL_NOTE:'';
/** The bars a script run reads: all of them up to the limit, otherwise the newest SCRIPT_BAR_LIMIT (the same array when nothing is cut). */
export function scriptRunBars<T>(bars:readonly T[]):readonly T[]{return bars.length>SCRIPT_BAR_LIMIT?bars.slice(-SCRIPT_BAR_LIMIT):bars;}
export async function executeScriptOnBars(input:{source:string;bars:readonly Bar[];identity:string;fixture:boolean;live?:boolean;signal:AbortSignal;chartPositionMode?:'logical-v1';bridge?:Pick<LVBridge,'executeScript'|'cancel'>;queue?:ScriptJobQueue;inputs?:Readonly<Record<string,ScriptInputValue>>|null;request?:ScriptRequestContext|null;/** The Strategy tester's engine feed (ctx.strategy and onFill). */engine?:EngineFeed|null}):Promise<{result:ScriptResult;barIds:string[];/** The bars the run read (the newest SCRIPT_BAR_LIMIT of a longer input). */bars?:Bar[];dependencyReceipt?:ScriptRequestJobReceipt}> {
 const bridge=input.bridge??(typeof window==='undefined'?undefined:window.lv);if(!bridge)throw new Error('Scripts need the desktop app.');if(input.signal.aborted)throw aborted();
 const trimmed=input.bars.length>SCRIPT_BAR_LIMIT,chartPositionMode=input.chartPositionMode,bars=scriptRunBars(input.bars).map(bar=>({...bar})),source=input.source,identity=input.identity,fixture=input.fixture,inputs=input.inputs?{...input.inputs}:null;
 return(input.queue??scriptJobs).enqueue(async()=>{
  const barIds=await scriptBarIds(identity,bars);if(input.signal.aborted)throw aborted();
  // Every bridge request this job makes is cancelled with the job.
  type WithoutRequestId<T>=T extends unknown?Omit<T,'requestId'>:never;
  const call=async(payload:WithoutRequestId<Parameters<LVBridge['executeScript']>[0]>)=>{const requestId=crypto.randomUUID(),cancel=()=>{void bridge.cancel({requestId}).catch(()=>{});};input.signal.addEventListener('abort',cancel,{once:true});try{if(input.signal.aborted)throw aborted();const response=await bridge.executeScript({requestId,...payload});if(input.signal.aborted)throw aborted();if(!response.ok)throw new Error(response.error.code+': '+response.error.message);return response.value;}finally{input.signal.removeEventListener('abort',cancel);}};
  const label=scriptProvenanceLabel(scriptDataKind({fixture,live:input.live}),identity);
  let requests:Record<string,unknown[]>|null=null,requestNote='',requestFixture=false,requestReceipt:ScriptRequestExportReceipt|null=null;
  let timeframes:Record<string,ScriptSeriesFeed>|null=null,symbols:Record<string,ScriptSeriesFeed>|null=null;
  if(declaresScriptRequests(source)&&bars.length){
   // Declaration pass: no bars, so onBar never runs and no requested data exists yet.
   let declarations=declarationCache.get(source);
   if(!declarations){const found=(await call({source,bars:[],provenance:{kind:fixture?'synthetic':'local-import',label}})).declarations;declarations={requests:found?.requests.map(row=>({...row}))??[],timeframes:found?.timeframes?.map(row=>({...row}))??[],symbols:found?.symbols?.map(row=>({...row}))??[]};rememberDeclarations(source,declarations);}
   const declared=declarations.requests;
   const resolver=input.request?.resolver===undefined?currentScriptRequestResolver() as (ScriptRequestResolver&ScriptDatasetResolverExtras)|null:input.request.resolver;
   if(declared.length){
    if(!input.request||!resolver)throw new Error('This script requests other symbols or intervals. Those need a chart and loaded data, which are not available here.');
    const resolved=resolveScriptRequests(declared,bars,input.request.base,resolver);requests=resolved.rows;requestReceipt=resolvedScriptRequestReceipt(resolved);requestFixture=resolved.fixture;requestNote=' · requests: '+resolved.labels.join('; ');
   }
   // Higher timeframes come from these bars; symbols only from loaded datasets (no feed is opened).
   if(declarations.timeframes.length){
    if(!input.request)throw new Error('This script reads higher timeframes. Those need a chart with a time interval, which is not available here.');
    // A live or replay forming last bar is not closed, so its higher-timeframe bar stays invisible (wait for the close).
    const resolved=resolveScriptTimeframes(declarations.timeframes,bars,input.request.base.resolution,resolver?.calendarFor?.(input.request.base)??null,closedChartRows(bars,input.request.base.resolution,input.request.base.datasetId));timeframes=resolved.feeds;requestNote+=' · timeframes: '+resolved.labels.join('; ');
   }
   if(declarations.symbols.length){
    if(!input.request||!resolver)throw new Error('This script reads other loaded symbols. Those need a chart and loaded data, which are not available here.');
    const resolved=resolveScriptSymbols(declarations.symbols,bars,input.request.base,resolver);symbols=resolved.feeds;requestFixture||=resolved.fixture;requestNote+=' · symbols: '+resolved.labels.join('; ');
   }
  }
  // Synthetic requested data makes the whole run synthetic, so a mixed result is never labelled as real data.
  const synthetic=fixture||requestFixture;
  const transport=chartPositionMode?{chartPositionMode,bars:bars.map((bar,index)=>({...bar,volume:Number.isNaN(bar.volume)?null:bar.volume,id:barIds[index],revision:1}))}:{bars:bars.map((bar,index)=>({...bar,id:barIds[index],revision:1}))};
  const result=await call({source,...transport,provenance:{kind:synthetic?'synthetic':'local-import',label:((synthetic&&!fixture?'Includes synthetic requested data · ':'')+label+requestNote).slice(0,4000)},...(inputs?{inputs}:{}),...(requests?{requests:requests as never}:{}),...(timeframes?{timeframes}:{}),...(symbols?{symbols}:{}),...(input.engine?{engine:input.engine}:{})});
  // A run on the newest bars says so once, as a plain log line on its first bar.
  if(trimmed&&result.logs&&bars.length)result.logs.entries.unshift({time:bars[0].time,index:0,level:'info',message:SCRIPT_TAIL_NOTE});
  const dependencyReceipt=bindScriptRequestJobReceipt(result,requestReceipt,{source,inputs,identity,bars});if(input.signal.aborted)throw aborted();return{result,barIds,bars,...(dependencyReceipt?{dependencyReceipt}:{})};
 },input.signal);
}
