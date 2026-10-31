import {NyseMtfAlertEvaluator,NyseAlertUnavailable,nyseAlertGroupKey,hasNyseAlertCalculation,qualifiedNyseAlertObservation,assertNysePendingObservation,retireNyseAlertEvaluator,captureNyseAlertHistory,nyseAlertHistoryExtends,releaseNyseAlertHistory,nyseAlertRetainedUsage,holdNyseAlertHistory,type NyseAlertHistory,type NyseAlertHistoryRead} from '../domain/nyse-mtf-alert-source';
import type {Bar,BarDataset} from '../domain/types';
import {LiveBarCloseWatcher} from '../domain/live-bars';
import {closedBarDataset,isFredDatasetId,isLiveDatasetId} from '../domain/live-provider';
import {heatmapResolutionSeconds} from '../domain/heatmap';
import type {TechnicalVwapEvaluator} from './vwap-alert-evaluator';
import type {TechnicalScriptEvaluator} from './script-alert-evaluator';
import type {AlertEvent,LocalAlert} from '../domain/alerts';
import {alertDatasetKey,alertSourceDatasetKey,alertDatasetWithPrefix,alertObservationContext,createAlertObservationSession,liveHistoryCorrected,observeAlertSnapshot,sameAlertBinding,type AlertObservationBinding,type AlertObservationContext,type AlertObservationSession,type AlertSourceSnapshot} from '../domain/alert-observation';
import {evaluateTechnicalAlertSources,technicalAlertEstimatedSlots,technicalAlertEstimatedWork,technicalPrefixChanged,technicalSourceKey,type TechnicalAlertBatch,type TechnicalAlertSampleResult,TECHNICAL_ALERT_LIMITS} from '../domain/technical-alerts';
import {indicatorVwapKernelVersion} from '../domain/indicators';
import {validateTechnicalAlertSource} from '../domain/alert-observation';
import {vwapEventDatesFor,type VwapEventDate} from '../domain/vwap-event-anchors';
import {alertChartFacts} from '../domain/indicator-alertability';
import {alertSecondSymbolSeries,type SecondSeries} from '../domain/second-symbol';
import {alertSecondSymbolReads,secondSymbolAlertGate} from '../domain/second-symbol-alerts';

export interface TechnicalAlertInput{
 dataset:BarDataset;bars:readonly Bar[];chartId:string;replay:{runId:string;cursor:number}|null;assumeReplayCompletion:boolean;barClosed?:boolean;
 selectedSource:AlertSourceSnapshot|null;alerts:readonly LocalAlert[];vwap?:TechnicalVwapEvaluator;
 /** Runs frozen script alert sources in the restricted worker. */
 script?:TechnicalScriptEvaluator;
 /** Also evaluate active ordinary alerts whose saved source session belongs to this exact dataset, continuing each
  alert's own session and event sequence. The first observation after adoption is marked a gap, so no crossing is invented. */
 adopt?:boolean;
 /** This symbol's drawings from the saved workspace, for the older 'drawing' alert kind. Absent: unavailable. */
 drawings?:readonly unknown[]|null;
 /** Split and dividend ex-dates for VWAP Dividends and Splits anchors. Absent: the dates App remembered. */
 corporateActions?:readonly VwapEventDate[]|null;
 /** The second series of the two-symbol kinds, at the dataset interval. Absent: the application
  second-symbol registry (alertSecondSymbolSeries: the App loader, with a lease on the feed). */
 secondSeries?:(symbol:string,resolution:string)=>SecondSeries;
}
export interface TechnicalAlertView{
 key:string;now:number;events:AlertEvent[];selectedEvent:AlertEvent|null;selectedContext:AlertObservationContext|null;
 contexts:AlertObservationContext[];diagnostics:string[];inactiveAlertIds:string[];estimatedWork:number;cancelled:boolean;
 /** Events from live bars that just closed, in order; App must process these before `events`. */
 closedEvents?:AlertEvent[];
}
export interface TechnicalAlertPublication {view:TechnicalAlertView;commit:()=>void;rollback:()=>boolean}
/** One LiveBarCloseWatcher per live dataset: created on its first live update, disposed when the dataset/feed goes away.
 * Closes found while feeding are returned to the caller (evaluated before any newer forming bar); wall-clock closes with no
 * new data arrive through onTimerClose with the closed-bar dataset. Non-live datasets never create a watcher. */
export class LiveCloseTracker{
 private entry:{key:string;watcher:LiveBarCloseWatcher;dataset:BarDataset}|null=null;private feeding:Bar[]|null=null;
 constructor(private readonly onTimerClose:(closed:BarDataset,bar:Bar)=>void){}
 feed(dataset:BarDataset,bars:readonly Bar[]):Bar[]{
  if(!isLiveDatasetId(dataset.provenance.datasetId)||dataset.provenance.fixture){this.stop();return[];}
  try{
   const key=alertDatasetKey(dataset),seconds=heatmapResolutionSeconds(dataset.resolution);
   if(seconds===null||!Number.isSafeInteger(seconds)||seconds<1){this.stop();return[];}
   if(this.entry&&this.entry.key!==key)this.stop();
   if(!this.entry){const holder:{key:string;watcher:LiveBarCloseWatcher;dataset:BarDataset}={key,dataset,watcher:new LiveBarCloseWatcher({seconds,onClose:bar=>{
    if(this.feeding){this.feeding.push(bar);return;}
    const closed=closedBarDataset(holder.dataset,bar.time);if(closed)this.onTimerClose(closed,bar);
   }})};this.entry=holder;}
   this.entry.dataset={...dataset,bars:[...bars]};const found:Bar[]=[];this.feeding=found;
   try{this.entry.watcher.update(bars);}finally{this.feeding=null;}
   return found;
  }catch{return[];}
 }
 stop():void{this.entry?.watcher.dispose();this.entry=null;}
}
interface Stream{session:AlertObservationSession;lastEvent:AlertEvent|null;pendingGap:boolean;nyseTarget?:string;nyseClosed?:boolean;nyseHistory?:NyseAlertHistory;nyseCurrent?:()=>void}
interface GroupCache{bars:readonly Bar[];sources:string;batch:TechnicalAlertBatch;vwapAvailable:boolean;drawings:readonly unknown[]|null;events:readonly VwapEventDate[]|null;second:ReadonlyMap<string,readonly Bar[]>|null;assertCurrent?:()=>void}
interface ObserverCheckpoint {key:string|null;streams:Map<string,Stream>;priorBars:readonly Bar[]|null;priorInput:readonly Bar[]|null;cache:Map<string,GroupCache>;lastIndex:number|null;now:number|null}
const sameSecond=(a:ReadonlyMap<string,readonly Bar[]>|null,b:ReadonlyMap<string,readonly Bar[]>|null)=>a===b||!!a&&!!b&&a.size===b.size&&[...a].every(([symbol,bars])=>b.get(symbol)===bars);
/** The evaluation group of a source on the chart, the same failure domains as the background watcher
 * (backgroundAlertGroup): each VWAP kernel 2 source alone, every other source shared. */
export function technicalEvaluationGroup(source:AlertSourceSnapshot,sourceKey:string):string{
 const operands=source.kind==='comparison'?[source.left,source.right]:[source];
 if(hasNyseAlertCalculation(source))return nyseAlertGroupKey(source);
 const exact=operands.some(operand=>{if(operand.kind!=='indicator'||operand.indicator!=='vwap')return false;try{return indicatorVwapKernelVersion(operand.inputs)===2;}catch{return true;}});
 return exact?'vwap:'+sourceKey:'shared';
}
/** App owns alert state. An action cannot evaluate its new state before that exact collection commits. */
export class AlertCommitEvaluationGate{
 private candidate:readonly LocalAlert[]|null=null;private pending:readonly LocalAlert[]|null=null;
 staged(alerts:readonly LocalAlert[]):void{this.candidate=alerts;}
 request():void{if(!this.candidate)throw new Error('No saved alert change is pending for evaluation.');this.pending=this.candidate;}
 take(committed:readonly LocalAlert[]):boolean{if(!this.pending||this.pending!==committed)return false;this.pending=null;return true;}
 clear():void{this.candidate=null;this.pending=null;}
}
export function technicalContextKey(input:TechnicalAlertInput):string{
 return JSON.stringify([2,alertDatasetKey(input.dataset,2),input.chartId,input.replay?.runId??null,input.replay?input.dataset.provenance.revision:null,input.replay&&input.assumeReplayCompletion]);
}
/** An idle-callback host (the renderer window). */
export interface ObservationIdleHost{requestIdleCallback?:(callback:()=>void,options?:{timeout?:number})=>number;cancelIdleCallback?:(handle:number)=>void}
export interface ObservationScheduler{request():void;cancel():void;readonly pending:boolean}
/** A source observation requested while a frame is being committed (symbol, interval or style switch, replay
 *  step, new bars) runs after that frame paints instead of blocking it: on the next idle period, at most `timeout` ms later.
 *  Requests made before it runs share one run; the run reads the latest input, as a queued observation does. Without an idle
 *  callback (tests, workers) the request runs at once, exactly as before. */
export function createObservationScheduler(run:()=>void,host:ObservationIdleHost=globalThis as ObservationIdleHost,timeout=100):ObservationScheduler{
 let handle:number|null=null;
 return{
  request(){if(typeof host.requestIdleCallback!=='function'){run();return;}if(handle!==null)return;handle=host.requestIdleCallback(()=>{handle=null;run();},{timeout});},
  cancel(){if(handle===null)return;const held=handle;handle=null;host.cancelIdleCallback?.(held);},
  get pending(){return handle!==null;},
 };
}
/** Runtime sessions never attach persisted definitions by source name alone. Explicit rearm is required after retirement. */
export class TechnicalAlertObserver{
 private readonly timeframeEvaluator=new NyseMtfAlertEvaluator();
 private nyseHistories=new Set<NyseAlertHistory>();private nyseCheckpoint:ObserverCheckpoint|null=null;
 private key:string|null=null;private streams=new Map<string,Stream>();private priorBars:readonly Bar[]|null=null;private priorInput:readonly Bar[]|null=null;
 private pendingAbort:AbortController|null=null;
 private cache=new Map<string,GroupCache>();private generation=0;private stateOwner=0n;private lastIndex:number|null=null;private now:number|null=null;
 private lastInput:{input:TechnicalAlertInput;reason:'source-observation'|'explicit-evaluation'}|null=null;private readonly closeTracker:LiveCloseTracker;
 constructor(private identity:()=>string,private yieldControl:()=>Promise<void>=()=>new Promise(resolve=>setTimeout(resolve,0)),private onBarClosed?:(view:TechnicalAlertView)=>void){
  this.closeTracker=new LiveCloseTracker(closed=>{void this.timerClose(closed);});
 }
 /** Dispose the live bar-close watcher (dataset or feed removed). */
 dispose():void{const qualified=this.nyseHistories.size>0;retireNyseAlertEvaluator(this.timeframeEvaluator);if(qualified){this.priorBars=null;this.priorInput=null;this.cache=new Map();}this.closeTracker.stop();this.lastInput=null;for(const stream of this.streams.values())if(hasNyseAlertCalculation(stream.session.binding.source)){stream.nyseCurrent=undefined;stream.nyseHistory=undefined;stream.pendingGap=true;}if(this.nyseCheckpoint){this.clearCheckpoint(this.nyseCheckpoint);this.nyseCheckpoint=null;}this.reconcileNyseHistory();}
 retainedUsage():Readonly<{work:number;slots:number}>{const funded=nyseAlertRetainedUsage(this.timeframeEvaluator),prior=this.priorBars,checkpoint=this.nyseCheckpoint?.priorBars;return Object.freeze({work:funded.work,slots:funded.slots+7*(prior?.length??0)+7*(checkpoint&&checkpoint!==prior?checkpoint.length:0)});}
 private async timerClose(closed:BarDataset):Promise<void>{
  const last=this.lastInput;if(!last||!this.onBarClosed)return;
  try{const view=await this.observeCore({...last.input,dataset:closed,bars:closed.bars,barClosed:true},Math.floor(Date.now()/1000),last.reason);
   if(!view.cancelled&&view.events.length)this.onBarClosed({...view,closedEvents:view.events});}catch{/* a failed close evaluation never stops the feed */}
 }
 private resetInputState():void{this.cancelPending();this.stateOwner++;this.key=null;this.streams.clear();this.priorBars=null;this.priorInput=null;this.cache=new Map();this.lastIndex=null;this.now=null;}
 reset():void{this.resetInputState();if(this.nyseCheckpoint){this.clearCheckpoint(this.nyseCheckpoint);this.nyseCheckpoint=null;}this.reconcileNyseHistory();}
 private clearCheckpoint(checkpoint:ObserverCheckpoint):void{checkpoint.streams=new Map();checkpoint.cache=new Map();checkpoint.priorBars=null;checkpoint.priorInput=null;}
 private reconcileNyseHistory():void{const wanted=new Set<NyseAlertHistory>();for(const stream of this.streams.values())if(stream.nyseHistory)wanted.add(stream.nyseHistory);for(const stream of this.nyseCheckpoint?.streams.values()??[])if(stream.nyseHistory)wanted.add(stream.nyseHistory);for(const history of this.nyseHistories)if(!wanted.has(history)){this.nyseHistories.delete(history);releaseNyseAlertHistory(history);}}
 cancelPending():void{this.generation++;retireNyseAlertEvaluator(this.timeframeEvaluator);const pending=this.pendingAbort;this.pendingAbort=null;pending?.abort();}
 invalidate():void{this.cancelPending();this.stateOwner++;for(const stream of this.streams.values())stream.pendingGap=true;}
 /** Retain bounded runtime state until the corresponding alert collection is accepted by App. */
 async observeForPublication(input:TechnicalAlertInput,now:number,reason:'source-observation'|'explicit-evaluation'='source-observation'):Promise<TechnicalAlertPublication>{
  const qualified=this.nyseHistories.size>0||this.nyseCheckpoint!==null||!!input.selectedSource&&hasNyseAlertCalculation(input.selectedSource)||input.alerts.some(alert=>hasNyseAlertCalculation(alert.definition.observationBinding?.source));
  if(qualified&&this.nyseCheckpoint){const previous=this.nyseCheckpoint;this.cancelPending();this.stateOwner++;this.key=previous.key;this.streams=previous.streams;this.priorBars=previous.priorBars;this.priorInput=previous.priorInput;this.cache=previous.cache;this.lastIndex=previous.lastIndex;this.now=previous.now;this.nyseCheckpoint=null;this.clearCheckpoint(previous);}
  const checkpoint:ObserverCheckpoint={key:this.key,streams:new Map([...this.streams].map(([key,stream])=>[key,{...stream}])),priorBars:this.priorBars,priorInput:this.priorInput,cache:this.cache,lastIndex:this.lastIndex,now:this.now};
  if(qualified){this.nyseCheckpoint=checkpoint;this.reconcileNyseHistory();}
  const pending=this.observe(input,now,reason),stateOwner=this.stateOwner;let view:TechnicalAlertView;
  try{view=await pending;}catch(error){if(qualified){if(this.nyseCheckpoint===checkpoint)this.nyseCheckpoint=null;this.clearCheckpoint(checkpoint);this.reconcileNyseHistory();}throw error;}
  let settled=false;
  const finish=()=>{if(!qualified)return;if(this.nyseCheckpoint===checkpoint)this.nyseCheckpoint=null;this.clearCheckpoint(checkpoint);this.reconcileNyseHistory();};
  return{view,commit:()=>{settled=true;finish();},rollback:()=>{
   if(settled||view.cancelled||this.stateOwner!==stateOwner||qualified&&this.nyseCheckpoint!==checkpoint){finish();return false;}settled=true;
   this.cancelPending();this.stateOwner++;this.key=checkpoint.key;this.streams=checkpoint.streams;this.priorBars=checkpoint.priorBars;this.priorInput=checkpoint.priorInput;this.cache=checkpoint.cache;this.lastIndex=checkpoint.lastIndex;this.now=checkpoint.now;finish();return true;
  }};
 }

 private empty(input:TechnicalAlertInput,now:number,diagnostics:string[],cancelled=false):TechnicalAlertView{return{key:this.key??'',now,events:[],selectedEvent:null,selectedContext:null,contexts:[],diagnostics,inactiveAlertIds:input.alerts.map(alert=>alert.definition.id),estimatedWork:0,cancelled};}
 async observe(input:TechnicalAlertInput,now:number,reason:'source-observation'|'explicit-evaluation'='source-observation'):Promise<TechnicalAlertView>{
  try{
  if(input.replay||input.barClosed){this.closeTracker.stop();return await this.observeCore(input,now,reason);}
  this.lastInput={input,reason};
  const closedBars=this.closeTracker.feed(input.dataset,input.bars),closedEvents:AlertEvent[]=[];
  for(const bar of closedBars){
   const closed=closedBarDataset({...input.dataset,bars:[...input.bars]},bar.time);if(!closed)continue;
   const view=await this.observeCore({...input,dataset:closed,bars:closed.bars,barClosed:true},now,reason);
   if(view.cancelled)return view;
   closedEvents.push(...view.events);
  }
  const view=await this.observeCore(input,now,reason);
  return closedEvents.length&&!view.cancelled?{...view,closedEvents}:view;
  }finally{this.reconcileNyseHistory();}
 }

 private async observeCore(input:TechnicalAlertInput,now:number,reason:'source-observation'|'explicit-evaluation'):Promise<TechnicalAlertView>{
  const key=technicalContextKey(input),index=input.bars.length-1;
  if(!input.chartId||input.chartId.length>200||!Number.isSafeInteger(now)||now<0||input.replay&&input.replay.cursor!==index)throw new Error('Technical chart identity, local clock or exact replay prefix is invalid.');
  const historyReads:NyseAlertHistoryRead[]=[];let ownedPrior:readonly Bar[]|null=null,bodyFailed=false,bodyError:unknown;
  try{for(const history of this.nyseHistories)historyReads.push(holdNyseAlertHistory(history));
  if(this.key!==key||this.lastIndex!==null&&index<this.lastIndex||this.now!==null&&now<this.now){
   // A display-hours change can reset legacy streams without changing this
   // regular-session calculation. All numerical witnesses still retire below.
   const calculationContext=(value:string)=>{const tuple=JSON.parse(value) as unknown[],basis=JSON.parse(tuple[1] as string) as unknown[];basis[12]='nyse-regular';tuple[1]=JSON.stringify(basis);return JSON.stringify(tuple);};
   const keepDaily=this.key!==null&&this.key!==key&&!input.replay&&(this.now===null||now>=this.now)&&calculationContext(this.key)===calculationContext(key);
   const kept=keepDaily?new Map([...this.streams].filter(([,stream])=>hasNyseAlertCalculation(stream.session.binding.source)).map(([key,stream])=>[key,{...stream,nyseCurrent:undefined}])):null;
   this.resetInputState();if(kept)this.streams=kept;this.key=key;
  }
  this.cancelPending();const abort=new AbortController();this.pendingAbort=abort;
  const generation=this.generation,cancelled=()=>generation!==this.generation||abort.signal.aborted;this.stateOwner++;
  if(input.adopt)this.adopt(input,now);
  const sourceMap=new Map<string,AlertSourceSnapshot>();
  if(input.selectedSource)sourceMap.set(technicalSourceKey(input.selectedSource),input.selectedSource);
  // Only runtime-owned bindings are eligible. Historical definitions cannot forge a new current session.
  for(const alert of input.alerts){const binding=alert.definition.observationBinding;if(!binding||binding.schemaVersion!==2||['expired','stopped','paused'].includes(alert.status))continue;
   const sourceKey=technicalSourceKey(binding.source),stream=this.streams.get(sourceKey);
   if(stream&&sameAlertBinding(binding,stream.session.binding))sourceMap.set(sourceKey,binding.source);
  }
  // Chart-bar timers never certify target daily completion. The final genuine producer update owns that group.
  if(input.barClosed)for(const [sourceKey,source]of sourceMap)if(hasNyseAlertCalculation(source))sourceMap.delete(sourceKey);
  if(sourceMap.size>TECHNICAL_ALERT_LIMITS.expressions){this.invalidate();return this.empty(input,now,['More than 256 eligible technical expressions. No partial batch was evaluated.']);}
  // A source that reads a second symbol is evaluated only on a ready, settled second series that has its
  // bar for this endpoint (second-symbol-alerts.ts). Otherwise it waits: not evaluated (never on partial data), with a
  // plain reason. While the series is loading its stream is gapped, so the next value is a fresh baseline; while only the
  // endpoint bar is late or forming its stream keeps its last value, so the crossing is still evaluated exactly once.
  const waiting:string[]=[],waitingKeys:string[]=[];let second:Map<string,readonly Bar[]>|null=null;
  if(index>=0){
   const endTime=input.bars[index].time,closed=!!input.barClosed||!!input.replay||!isLiveDatasetId(input.dataset.provenance.datasetId),resolution=input.dataset.resolution;
   const lookup=input.secondSeries??((symbol:string,interval:string)=>alertSecondSymbolSeries(symbol,interval));
   for(const [key,source] of [...sourceMap]){
    const reads=alertSecondSymbolReads(source);if(!reads.length)continue;
    const gate=secondSymbolAlertGate(reads,{endTime,closed,lookup:symbol=>lookup(symbol,resolution)});
    if(gate.kind==='ready'){second??=new Map();for(const [symbol,bars] of gate.series)second.set(symbol,bars);continue;}
    sourceMap.delete(key);waiting.push(gate.reason);
    const stream=this.streams.get(key);if(!stream)continue;
    if(gate.kind==='loading')this.streams.set(key,{...stream,pendingGap:true});
    waitingKeys.push(key);
   }
  }
  const secondSeries=second?(symbol:string):SecondSeries=>{const bars=second!.get(symbol);return bars?{bars,state:'ready',message:null}:{bars:null,state:'unavailable',message:`${symbol} has no loaded data for this alert.`};}:undefined;
  const sources=[...sourceMap.values()],sourceKey=[...sourceMap.keys()].sort().join('\n');
  const snapshotDataset=alertDatasetWithPrefix(input.dataset,input.bars);
  if(!sources.length){
   if(!input.barClosed&&this.nyseHistories.size){this.priorBars=null;this.priorInput=null;this.cache=new Map();for(const [sourceKey,stream]of this.streams){stream.pendingGap=true;if(!hasNyseAlertCalculation(stream.session.binding.source))continue;stream.nyseCurrent=undefined;stream.nyseHistory=undefined;const paused=input.alerts.some(alert=>alert.status==='paused'&&!!alert.definition.observationBinding&&sameAlertBinding(alert.definition.observationBinding,stream.session.binding));if(!paused)this.streams.delete(sourceKey);}}
   this.now=now;const view=this.empty(input,now,[...new Set(waiting)]);return waitingKeys.length?{...view,inactiveAlertIds:view.inactiveAlertIds.filter(id=>!this.waitingAlert(input,id,waitingKeys))}:view;
  }
  const drawings=input.drawings??null,eventDates=input.corporateActions!==undefined?input.corporateActions:vwapEventDatesFor(input.dataset.instrument.id);
  // One evaluation group per failure domain. A failed batch gives none of its sources a value, so each VWAP
  // kernel 2 source (the asynchronous worker: budget, queue, deadline, volume, owned prefix) is its own group and every
  // other source shares one. A failed group marks only its own streams as a gap; the others publish as usual.
  const groups=new Map<string,Map<string,AlertSourceSnapshot>>();
  for(const [key,source] of sourceMap){const group=technicalEvaluationGroup(source,key);let members=groups.get(group);if(!members){members=new Map();groups.set(group,members);}members.set(key,source);}
  const retainedNyse=nyseAlertRetainedUsage(this.timeframeEvaluator);
  if(groups.size>1||sources.some(hasNyseAlertCalculation)||retainedNyse.work>0||retainedNyse.slots>0)try{
   // The local budget stays one budget for the whole chart batch, as it was before the split.
   const sourceRows=sources.some(hasNyseAlertCalculation)?this.timeframeEvaluator.facts(input.dataset,input.bars,input.replay?.runId??'ordinary')?.sourceRows??input.bars.length:input.bars.length;
   const qualifiedFamily=sources.some(hasNyseAlertCalculation)||retainedNyse.work>0||retainedNyse.slots>0,partitions=qualifiedFamily?[...groups.values()].map(members=>[...members.values()]):[sources];
   const work=partitions.reduce((sum,members)=>sum+technicalAlertEstimatedWork(input.bars.length,members,sourceRows),0)+retainedNyse.work;if(work>TECHNICAL_ALERT_LIMITS.operations)throw new Error(`Technical alert batch requires ${work} estimated operations; local limit is ${TECHNICAL_ALERT_LIMITS.operations}. Reduce history or active expressions.`);
   const slots=partitions.reduce((sum,members)=>sum+technicalAlertEstimatedSlots(input.bars.length,members,sourceRows),0)+retainedNyse.slots+(sources.some(hasNyseAlertCalculation)||retainedNyse.slots>0?7*input.bars.length+7*(this.priorBars?.length??0):0);if(slots>TECHNICAL_ALERT_LIMITS.numericSlots)throw new Error(`Technical alert batch requires ${slots} numeric slots; local limit is ${TECHNICAL_ALERT_LIMITS.numericSlots}. Reduce history or active expressions.`);
  }catch(error){return this.failAll(input,now,error);}
  const results=new Map<string,TechnicalAlertSampleResult>(),failedGroups=new Map<string,string>(),proofs=new Map<string,()=>void>(),nextCache=new Map<string,GroupCache>(),pendingGroups=new Map<string,unknown>();let estimatedWork=0;
  for(const [group,members] of groups){
   const memberKey=[...members.keys()].sort().join('\n');let batch:TechnicalAlertBatch,calculationProof:(()=>void)|undefined;
   try{
    let cached=this.cache.get(group)??null;
    if(cached&&!(cached.bars===input.bars&&cached.sources===memberKey&&cached.vwapAvailable===!!input.vwap&&cached.drawings===drawings&&cached.events===eventDates&&sameSecond(cached.second,second)))cached=null;
    if(cached)try{cached.assertCurrent?.();}catch{cached=null;}
    if(cached){batch=cached.batch;calculationProof=cached.assertCurrent;}else{
     batch=await evaluateTechnicalAlertSources(input.bars,[...members.values()],input.dataset.instrument.currency,{cancelled,signal:abort.signal,yieldControl:this.yieldControl,sourceBasis:alertDatasetKey(input.dataset,2),sourceRevision:input.dataset.provenance.revision,...(group.startsWith('nyse:')?{timeframe:{evaluator:this.timeframeEvaluator,dataset:input.dataset,bars:input.bars,execution:input.replay?.runId??'ordinary'}}:{}),...alertChartFacts(input.dataset),...(input.vwap?{evaluateVwap:request=>{calculationProof=input.vwap!.assertCurrent;return input.vwap!.evaluate(request);}}:{}),...(input.script?{evaluateScript:request=>input.script!.evaluate(request)}:{}),drawings,corporateActions:eventDates,...(secondSeries?{secondSeries}:{})});
    }
    if(batch.timeframe)calculationProof=batch.timeframe.assertCurrent;
    calculationProof?.();
    if(batch.cancelled||cancelled())return this.empty(input,now,[],true);
   }catch(error){if(cancelled())return this.empty(input,now,[],true);if(group.startsWith('nyse:')&&error instanceof NyseAlertUnavailable&&error.state==='pending'){pendingGroups.set(group,error);waiting.push(error.message);continue;}failedGroups.set(group,error instanceof Error?error.message:String(error));continue;}
   for(const [key,result] of batch.results)results.set(key,result);
   estimatedWork+=batch.estimatedWork;if(calculationProof)proofs.set(group,calculationProof);
   nextCache.set(group,{bars:input.bars,sources:memberKey,batch,vwapAvailable:!!input.vwap,drawings,events:eventDates,second,...(calculationProof?{assertCurrent:calculationProof}:{})});
  }
  // Every group failed: the same result as one failed batch (all streams gap, nothing published).
  if(failedGroups.size===groups.size)return this.failAll(input,now,[...failedGroups.values()]);
  const liveForming=!input.replay&&!input.dataset.provenance.fixture&&isLiveDatasetId(input.dataset.provenance.datasetId)&&!isFredDatasetId(input.dataset.provenance.datasetId);
  // For live feeds, revising the forming bar or the just-closed bar (the per-minute Coinbase REST
  // reconcile, Alpaca's late minute bar) is finalization: the batch above re-evaluated on it and the crossing baseline stays.
  // All fields count (volume indicators read volume), so only older bars, removed bars or moved times are corrections.
  const correction=this.priorInput!==input.bars&&(liveForming?liveHistoryCorrected(this.priorBars,input.bars):technicalPrefixChanged(this.priorBars,input.bars));
  const nextStreams=new Map(this.streams),observed:{group:string;sourceKey:string;event:AlertEvent|null;context:AlertObservationContext;diagnostics:string[]}[]=[],diagnostics:string[]=[...waiting];
  for(const [group,message] of failedGroups){diagnostics.push(message);for(const sourceKey of groups.get(group)!.keys()){const existing=nextStreams.get(sourceKey);if(existing)nextStreams.set(sourceKey,{...existing,pendingGap:true});}}
  for(const [sourceKey,source] of sourceMap){
   const group=technicalEvaluationGroup(source,sourceKey);if(failedGroups.has(group))continue;
   if(pendingGroups.has(group)){const previous=nextStreams.get(sourceKey);if(previous){let genuine=false;try{assertNysePendingObservation(pendingGroups.get(group));genuine=true;}catch{}const stream={...previous,...(genuine?{session:{...previous.session,lastObservedAt:now}}:{})};stream.nyseCurrent=undefined;nextStreams.set(sourceKey,stream);observed.push({group,sourceKey,event:null,context:alertObservationContext(stream.session,snapshotDataset),diagnostics:[String((pendingGroups.get(group) as Error).message)]});}continue;}
   const existing=nextStreams.get(sourceKey),stream:Stream=existing?{...existing}:{session:createAlertObservationSession(snapshotDataset,{version:2,chartId:input.chartId,sessionId:this.identity(),mode:input.replay?'replay':'ordinary',replayRunId:input.replay?.runId,assumeReplayCompletion:!!input.replay&&input.assumeReplayCompletion,startedAt:now,source}),lastEvent:null,pendingGap:false};
   const calculated=results.get(sourceKey)!;
   let qualifiedCorrection=false;
   if(hasNyseAlertCalculation(source)){
    const qualified=qualifiedNyseAlertObservation(calculated.sample);qualified.assertCurrent();
    qualifiedCorrection=!!stream.nyseHistory&&!nyseAlertHistoryExtends(stream.nyseHistory,calculated.sample);const history=captureNyseAlertHistory(calculated.sample);this.nyseHistories.add(history);historyReads.push(holdNyseAlertHistory(history));
    stream.nyseCurrent=qualified.assertCurrent;
    if(qualified.closed&&stream.nyseClosed&&stream.nyseTarget===qualified.barId&&!stream.pendingGap&&!qualifiedCorrection&&reason!=='explicit-evaluation'){
     stream.session={...stream.session,lastObservedAt:now};if(qualifiedCorrection)stream.pendingGap=true;stream.nyseHistory=history;nextStreams.set(sourceKey,stream);observed.push({group,sourceKey,event:null,context:{...alertObservationContext(stream.session,snapshotDataset),completion:input.replay?'simulated-complete':'observed-closed'},diagnostics:qualifiedCorrection?['A completed daily seed was corrected; crossing history restarts with a new observation.']:[]});continue;
    }
    stream.nyseTarget=qualified.barId;stream.nyseClosed=qualified.closed;stream.nyseHistory=history;
   }
   const result=observeAlertSnapshot(stream.session,{dataset:snapshotDataset,observedAt:now,replayRunId:input.replay?.runId,barIndex:index,sample:calculated.sample,reason,correction:correction||qualifiedCorrection,...(input.barClosed?{barClosed:true}:{}),continuity:stream.pendingGap?'gap':'continuous'});
   stream.session=result.session;
   if(result.event){stream.lastEvent=result.event;stream.pendingGap=false;}
   else if(result.diagnostics.length)stream.pendingGap=true;
   nextStreams.set(sourceKey,stream);
   observed.push({group,sourceKey,event:result.event??null,context:result.context,diagnostics:[...calculated.diagnostics.map(message=>`${source.kind==='indicator'?source.indicator:source.kind}: ${message}`),...result.diagnostics]});
  }
  if(cancelled())return this.empty(input,now,[],true);
  // A group whose owned chart input changed while later groups ran publishes nothing this time: its streams keep their state
  // from before this observation (as a cancelled observation would), and the other groups still publish.
  const staleGroups=new Set<string>();
  for(const [group,proof] of proofs)try{proof();}catch(error){staleGroups.add(group);nextCache.delete(group);diagnostics.push(error instanceof Error?error.message:String(error));for(const sourceKey of groups.get(group)!.keys()){const prior=this.streams.get(sourceKey);if(prior)nextStreams.set(sourceKey,prior);else nextStreams.delete(sourceKey);}}
  if(cancelled())return this.empty(input,now,[],true);
  if(staleGroups.size&&staleGroups.size+failedGroups.size===groups.size){this.cache=new Map();return this.empty(input,now,diagnostics,true);}
  const events:AlertEvent[]=[],contexts:AlertObservationContext[]=[];let selectedEvent:AlertEvent|null=null,selectedContext:AlertObservationContext|null=null;
  const selectedKey=input.selectedSource?technicalSourceKey(input.selectedSource):null;
  for(const row of observed){if(staleGroups.has(row.group))continue;if(row.event)events.push(row.event);contexts.push(row.context);diagnostics.push(...row.diagnostics);if(row.sourceKey===selectedKey){selectedContext=row.context;selectedEvent=row.event??nextStreams.get(row.sourceKey)?.lastEvent??null;}}
  // A waiting second-symbol source is still running: its context is listed (it is not reported inactive), with no event.
  for(const key of waitingKeys){const stream=nextStreams.get(key);if(stream)contexts.push(alertObservationContext(stream.session,snapshotDataset));}
  for(const [streamKey,stream] of nextStreams){const selected=streamKey===selectedKey;const retained=input.alerts.some(alert=>!['expired','stopped'].includes(alert.status)&&!!alert.definition.observationBinding&&sameAlertBinding(alert.definition.observationBinding,stream.session.binding));if(!selected&&!retained)nextStreams.delete(streamKey);}
  if(nextStreams.size>TECHNICAL_ALERT_LIMITS.expressions){this.invalidate();return this.empty(input,now,['Too many alert data streams. Remove unused ones before adding another.']);}
  const replacePrior=this.priorInput!==input.bars;
  if(replacePrior)ownedPrior=sources.some(hasNyseAlertCalculation)||this.nyseHistories.size?input.bars.map(bar=>({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume:bar.volume})):input.bars.map(bar=>({...bar}));
  if(cancelled())return this.empty(input,now,[],true);
  this.streams=nextStreams;this.cache=nextCache;
  if(replacePrior){this.priorBars=ownedPrior;this.priorInput=input.bars;}
  this.lastIndex=index;this.now=now;
  const inactiveAlertIds=input.alerts.filter(alert=>!contexts.some(context=>!!alert.definition.observationBinding&&sameAlertBinding(alert.definition.observationBinding,context.binding))).map(alert=>alert.definition.id);
  return{key,now,events,selectedEvent,selectedContext,contexts,diagnostics:[...new Set(diagnostics)],inactiveAlertIds,estimatedWork,cancelled:false};
  }catch(error){bodyFailed=true;bodyError=error;throw error;}finally{
   ownedPrior=null;const failures:unknown[]=[];for(const read of historyReads.splice(0).reverse())try{read.release();}catch(error){failures.push(error);}if(failures.length){if(bodyFailed)throw new AggregateError([bodyError,...failures],'Daily alert calculation and history-read cleanup failed.');if(failures.length===1)throw failures[0];throw new AggregateError(failures,'Daily alert history-read cleanup failed.');}
  }
 }

 /** One failed batch, or every group failed: all streams gap, the cache is dropped, nothing is published. */
 private waitingAlert(input:TechnicalAlertInput,alertId:string,keys:readonly string[]):boolean{
  const binding=input.alerts.find(alert=>alert.definition.id===alertId)?.definition.observationBinding;if(!binding)return false;
  return keys.some(key=>{const stream=this.streams.get(key);return !!stream&&sameAlertBinding(binding,stream.session.binding);});
 }
 private failAll(input:TechnicalAlertInput,now:number,error:unknown):TechnicalAlertView{
  for(const stream of this.streams.values())stream.pendingGap=true;this.cache=new Map();
  const messages=Array.isArray(error)?error.map(String):[error instanceof Error?error.message:String(error)];
  return this.empty(input,now,[...new Set(messages)]);
 }
 private adopt(input:TechnicalAlertInput,now:number):void{
  if(input.replay)return;
  let datasetKey:string,qualifiedDatasetKey:string|null|undefined;try{datasetKey=alertDatasetKey(input.dataset,2);}catch{return;}
  const wanted=new Map<string,{binding:AlertObservationBinding;sequence:number}>();
  for(const alert of input.alerts){
   const binding=alert.definition.observationBinding;
   if(!binding||binding.schemaVersion!==2||binding.replayRunId!==null||alert.definition.mode!=='ordinary'||!['active','waiting-for-data'].includes(alert.status))continue;
   if(hasNyseAlertCalculation(binding.source)){if(qualifiedDatasetKey===undefined)try{qualifiedDatasetKey=alertSourceDatasetKey(input.dataset,binding.source,2);}catch{qualifiedDatasetKey=null;}if(binding.datasetKey!==qualifiedDatasetKey)continue;}else if(binding.datasetKey!==datasetKey)continue;
   let sourceKey:string;try{validateTechnicalAlertSource(binding.source);sourceKey=technicalSourceKey(binding.source);}catch{continue;}
   if(this.streams.has(sourceKey))continue;
   const known=wanted.get(sourceKey);
   if(!known)wanted.set(sourceKey,{binding,sequence:alert.lastSequence??0});
   else if(sameAlertBinding(known.binding,binding))known.sequence=Math.max(known.sequence,alert.lastSequence??0);
  }
  if(!wanted.size)return;
  const snapshot=alertDatasetWithPrefix(input.dataset,input.bars);
  for(const [sourceKey,{binding,sequence}] of wanted){
   try{
    const session=createAlertObservationSession(snapshot,{version:2,chartId:binding.chartId,sessionId:binding.sessionId,mode:'ordinary',startedAt:now,source:binding.source});
    if(!sameAlertBinding(session.binding,binding))continue;
    this.streams.set(sourceKey,{session:{...session,sequence},lastEvent:null,pendingGap:true});
   }catch{/* a binding that cannot be rebuilt stays inactive until it is rearmed */}
  }
 }
 /** Useful for an explicit rearm UI: frozen source settings may remain usable after the chart instance is removed. */
 currentContext(source:AlertSourceSnapshot,dataset:BarDataset):AlertObservationContext|null{const stream=this.streams.get(technicalSourceKey(source));if(stream&&hasNyseAlertCalculation(source)){try{if(!stream.nyseCurrent)return null;stream.nyseCurrent();}catch{return null;}}return stream?alertObservationContext(stream.session,dataset):null;}
}
