// Split and dividend dates for the VWAP Dividends and Splits anchors, beyond the
// active chart. App loads the active chart's dates itself; this loads them for every other instrument that needs them:
//  - an ordinary background alert (active or waiting for data) whose VWAP source, or either side of a comparison, uses one of
//    the two anchors;
//  - a chart cell of the open layout, or of any saved layout in the layout library (the layout tabs), with a VWAP indicator
//    using one of them.
// Only Alpaca US stocks have corporate actions (chartEventSymbol). Requests go through the same memoized renderer loader as the
// chart markers (loadChartEvents, window.lv.fetchAlpacaCorporateActions), and main queues them on its rate-limited Alpaca
// queue with its once-a-day disk cache. On top of that this side is rate-limited too: one request at a time, at least
// REQUEST_GAP_MS between starts, at most VWAP_EVENT_REACH_LIMIT instruments.
// Cache: per instrument id, the New York day of the last good load. An instrument is asked again only on a new New York day
// (the daily refresh), or RETRY_MS after a failed or stale load. A failure keeps the dates already remembered.
// Every number here (gap, retry, check period, limit) is LV's; the anchors themselves are our own choice
// (src/domain/vwap-event-anchors.ts).
import type {LocalAlert} from '../domain/alerts';
import type {AlertScalarSource} from '../domain/alert-observation';
import {alpacaInstrument,ALPACA_SIP_PROVIDER_ID} from '../domain/alpaca-live';
import {chartEventSymbol,newYorkDate,type ChartEventsResult,type CorporateActionEvent} from '../domain/chart-events';
import {isVwapEventAnchor,rememberVwapEventDates} from '../domain/vwap-event-anchors';
import {alertDatasetId,parseLiveDatasetId} from './background-alert-plan';

export interface VwapEventTarget {instrumentId:string;symbol:string}
export const VWAP_EVENT_REACH_LIMIT=60;
export const VWAP_EVENT_REQUEST_GAP_MS=1500,VWAP_EVENT_RETRY_MS=15*60*1000,VWAP_EVENT_CHECK_MS=10*60*1000;

const SIP_ID=/^([a-z0-9-]+):([^:]+):([^:]+)$/;
/** The provider and symbol of a live (`live:<provider>:<symbol>:<resolution>`) or delayed SIP dataset id, else null. */
export function datasetProviderSymbol(datasetId:unknown):{providerId:string;symbol:string}|null{
 if(typeof datasetId!=='string')return null;
 const live=parseLiveDatasetId(datasetId);if(live)return {providerId:live.providerId,symbol:live.symbol};
 const sip=SIP_ID.exec(datasetId);return sip&&sip[1]===ALPACA_SIP_PROVIDER_ID?{providerId:sip[1],symbol:sip[2]}:null;
}
const eventAnchorSource=(source:AlertScalarSource|undefined)=>!!source&&source.kind==='indicator'&&source.indicator==='vwap'&&isVwapEventAnchor(source.inputs?.anchor);
/** True for an alert whose VWAP source (or either comparison side) uses the Dividends or Splits anchor. */
export function alertUsesVwapEventAnchor(alert:LocalAlert):boolean{
 const source=alert.definition.observationBinding?.source;if(!source)return false;
 return source.kind==='comparison'?eventAnchorSource(source.left)||eventAnchorSource(source.right):eventAnchorSource(source);
}

interface CellLike {datasetId?:unknown;indicators?:unknown}
interface GridLike {cells?:Record<string,CellLike>}
export interface VwapEventReachWorkspace {grid?:GridLike;layoutLibrary?:{entries?:unknown}}
const cellUsesEventAnchor=(cell:CellLike)=>Array.isArray(cell.indicators)&&cell.indicators.some(row=>!!row&&typeof row==='object'&&(row as {kind?:unknown}).kind==='vwap'&&isVwapEventAnchor((row as {inputs?:{anchor?:unknown}}).inputs?.anchor));

/** Every instrument outside the caller's own load that needs Dividends or Splits dates: alerts first, then layout cells. */
export function vwapEventTargets(input:{alerts:readonly LocalAlert[];workspace:VwapEventReachWorkspace|null|undefined}):VwapEventTarget[]{
 const found=new Map<string,VwapEventTarget>();
 const add=(instrumentId:string,providerId:string,symbol:string)=>{if(found.size>=VWAP_EVENT_REACH_LIMIT||!instrumentId||found.has(instrumentId))return;const asked=chartEventSymbol(providerId,symbol);if(asked)found.set(instrumentId,{instrumentId,symbol:asked});};
 for(const alert of input.alerts){
  if(!['active','waiting-for-data'].includes(alert.status)||alert.definition.mode!=='ordinary'||!alertUsesVwapEventAnchor(alert))continue;
  const source=datasetProviderSymbol(alertDatasetId(alert));if(source)add(alert.definition.instrumentId,source.providerId,source.symbol);
 }
 const grid=(value:GridLike|undefined)=>{
  const cells=value&&typeof value==='object'&&value.cells&&typeof value.cells==='object'?Object.values(value.cells):[];
  for(const cell of cells){if(!cell||typeof cell!=='object'||!cellUsesEventAnchor(cell))continue;const source=datasetProviderSymbol(cell.datasetId);if(source)add(alpacaInstrument(source.symbol).id,source.providerId,source.symbol);}
 };
 const workspace=input.workspace;
 grid(workspace?.grid);
 const entries=workspace?.layoutLibrary&&Array.isArray(workspace.layoutLibrary.entries)?workspace.layoutLibrary.entries:[];
 for(const entry of entries)if(entry&&typeof entry==='object')grid((entry as {grid?:GridLike}).grid);
 return [...found.values()];
}

export interface VwapEventReachDeps {
 load:(symbol:string)=>Promise<ChartEventsResult>;
 remember?:(instrumentId:string,events:readonly CorporateActionEvent[])=>void;
 /** Called after an instrument's dates were remembered, so a chart can recalculate. */
 onLoaded?:(instrumentId:string)=>void;
 now?:()=>number;
 setTimer?:(callback:()=>void,ms:number)=>unknown;
 clearTimer?:(handle:unknown)=>void;
}
interface Entry {symbol:string;day:string|null;retryAt:number}

/** Loads and refreshes the dates of the wanted instruments, one request at a time. */
export class VwapEventDateReach {
 private wanted=new Map<string,string>();
 private readonly cache=new Map<string,Entry>();
 private busy=false;private lastStart=-Infinity;private timer:unknown=null;private disposed=false;
 private readonly now:()=>number;private readonly setTimer:(callback:()=>void,ms:number)=>unknown;private readonly clearTimer:(handle:unknown)=>void;
 constructor(private readonly deps:VwapEventReachDeps){
  this.now=deps.now??Date.now;
  this.setTimer=deps.setTimer??((callback,ms)=>setTimeout(callback,ms));
  this.clearTimer=deps.clearTimer??(handle=>clearTimeout(handle as ReturnType<typeof setTimeout>));
 }
 /** Replaces the wanted instruments. Cached dates of instruments no longer wanted are kept in the registry. */
 sync(targets:readonly VwapEventTarget[]):void{
  if(this.disposed)return;
  const next=new Map<string,string>();for(const target of targets.slice(0,VWAP_EVENT_REACH_LIMIT))if(target.instrumentId&&target.symbol)next.set(target.instrumentId,target.symbol);
  this.wanted=next;
  for(const [id,entry] of this.cache)if(!next.has(id)||next.get(id)!==entry.symbol)this.cache.delete(id);
  this.schedule(0);
 }
 /** The instruments that are loaded for today, for tests and diagnostics. */
 loadedToday():string[]{const today=this.today();return [...this.cache].filter(([,entry])=>entry.day===today).map(([id])=>id);}
 dispose():void{this.disposed=true;if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.wanted.clear();}

 private today(){return newYorkDate(this.now()/1000);}
 private schedule(ms:number){
  if(this.disposed)return;
  if(this.timer!==null)this.clearTimer(this.timer);
  this.timer=this.setTimer(()=>{this.timer=null;this.pump();},Math.max(0,ms));
 }
 private pump(){
  if(this.disposed||this.busy)return;
  const now=this.now(),today=this.today();let wait=VWAP_EVENT_CHECK_MS,next:[string,string]|null=null;
  for(const [id,symbol] of this.wanted){
   const entry=this.cache.get(id);
   if(entry&&entry.day===today)continue;
   if(entry&&entry.retryAt>now){wait=Math.min(wait,entry.retryAt-now);continue;}
   next=[id,symbol];break;
  }
  if(!next){if(this.wanted.size)this.schedule(wait);return;}
  const gap=this.lastStart+VWAP_EVENT_REQUEST_GAP_MS-now;
  if(gap>0){this.schedule(gap);return;}
  const [id,symbol]=next;this.busy=true;this.lastStart=now;
  const settle=(result:ChartEventsResult)=>{
   this.busy=false;if(this.disposed)return;
   const at=this.now(),entry:Entry=this.cache.get(id)??{symbol,day:null,retryAt:0};
   if(this.wanted.get(id)===symbol){
    if(result.ok){
     (this.deps.remember??rememberVwapEventDates)(id,result.value.events);
     // A stale answer (main served an older cache because the download failed) is used, and asked again later today.
     if(result.value.stale){entry.retryAt=at+VWAP_EVENT_RETRY_MS;}else{entry.day=newYorkDate(at/1000);entry.retryAt=0;}
     this.cache.set(id,entry);
     try{this.deps.onLoaded?.(id);}catch{/* a chart that cannot recalculate now does so on its next update */}
    }else{entry.retryAt=at+VWAP_EVENT_RETRY_MS;this.cache.set(id,entry);}
   }
   this.pump();
  };
  let pending:Promise<ChartEventsResult>;
  try{pending=this.deps.load(symbol);}catch(error){pending=Promise.resolve({ok:false,error:{code:'FAILED',message:String(error)}});}
  void Promise.resolve(pending).then(settle,error=>settle({ok:false,error:{code:'FAILED',message:String(error)}}));
 }
}
