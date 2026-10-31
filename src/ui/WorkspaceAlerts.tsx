import {hasNyseAlertCalculation} from '../domain/nyse-mtf-alert-source';
import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
/** One stable reader of the chart's last close per mounted WorkspaceAlerts, so a live tick never changes the
 *  dialog's props (the open dialog keeps its element) while the level default still reads the newest bar. */
const lastPriceReaders=new WeakMap<object,()=>number|null>();
function lastPriceReader(latest:{current:{props:{bars?:readonly {close:number}[]|null}}}):()=>number|null{let reader=lastPriceReaders.get(latest);if(!reader){reader=()=>latest.current.props.bars?.at(-1)?.close??null;lastPriceReaders.set(latest,reader);}return reader;}
import {AlertDialog,type AlertCreateRequest,type AlertSourceChoice,type AlertConditionSelection} from './AlertDialog';
import type {CompoundAlertDialogController} from './compound-alert-dialog';
import {createTechnicalVwapEvaluator} from './vwap-alert-evaluator';
import {createTechnicalScriptEvaluator} from './script-alert-evaluator';
import {processLocalAlertBatch,type LocalAlert} from '../domain/alerts';
import type {Bar,BarDataset} from '../domain/types';
import type {ChartController} from '../chart/adapter';
import {AlertCommitEvaluationGate,TechnicalAlertObserver,createObservationScheduler,type TechnicalAlertView} from './technical-alert-observer';
import {TechnicalAlertCatalog,requireTechnicalChart,retainContinuityAfterTechnicalFailure} from './technical-alert-catalog';
import {sameAlertBinding,alertDatasetKey,alertSourceDatasetKey,type AlertObservationBinding,type AlertSourceSnapshot} from '../domain/alert-observation';
import {assertContextPriceRequest,type ContextPriceProps,type ContextPriceRequest} from './context-price-request';
import {AlertDeliveryHost} from './alert-delivery-host';
import {renderNewAlertMessages} from '../domain/alert-message';
import {followPositionDrawings} from '../domain/alert-position-follow';
import {DrawingAlertFollow} from '../domain/drawing-alert-source';
import {invalidDrawingAlertNotes} from '../domain/alert-drawing-status';
import {alertDrawingIds} from '../domain/drawing-alert-links';
import {sameBarsInput} from '../chart/bar-input-identity';
import {isLiveDatasetId} from '../domain/live-provider';
import {reuseOwnedElement,type OwnedElementCache} from './element-cache';
import type {StrategyConfig} from '../domain/strategy';
/** An observation of a live feed stays the current observation while the feed only grows (same dataset
 * id, revision and live subscription); the one-second observation interval keeps it fresh. Other sources compare exactly. */
export function sameAlertInput(a:{dataset:BarDataset;bars?:readonly Bar[]|null},b:{dataset:BarDataset;bars?:readonly Bar[]|null}):boolean{
 if(a.dataset===b.dataset&&a.bars===b.bars)return true;
 const p=a.dataset.provenance,q=b.dataset.provenance;
 return isLiveDatasetId(p.datasetId)&&p.datasetId===q.datasetId&&p.revision===q.revision&&alertDatasetKey(a.dataset,2)===alertDatasetKey(b.dataset,2)&&a.dataset.resolution===b.dataset.resolution&&sameBarsInput(a.bars??null,b.bars??null);
}
/** Effect key for the observed input: live growth keeps the key, so it neither cancels nor invalidates an observation. */
export function alertInputKey(dataset:BarDataset,bars:readonly Bar[]|undefined):unknown[]{
 const p=dataset.provenance;return isLiveDatasetId(p.datasetId)&&(!bars||sameBarsInput(bars,dataset.bars))?['live',p.datasetId,p.revision,dataset.resolution,alertDatasetKey(dataset,2)]:['exact',dataset,bars,null];
}

/** The charted symbol's drawings for the older 'drawing' alert kind, read from
 * the chart's own drawing document. Only when such an alert is saved; the same content keeps the same rows, so the
 * observer's batch cache still holds while nothing is drawn or moved. */
/** Also when a drawing alert follows its drawing (drawing-alert-source.ts). The chart's own document comes
 * first; saved rows (the other cells and layouts of this symbol) add the drawings it does not hold, so an alert made on another
 * chart of the symbol still finds its drawing. The rows are kept by content, so Undo, Redo and a layout restore that give the
 * same drawings back keep the same rows, and any change gives new ones. */
export function legacyDrawingRows(alerts:readonly LocalAlert[],document:{drawings?:unknown},previous:{json:string;rows:readonly unknown[]}|null,saved?:readonly unknown[]|null):{json:string;rows:readonly unknown[]}|null{
 if(!alerts.some(alert=>alertDrawingIds(alert).length))return null;
 const own=Array.isArray(document.drawings)?document.drawings:[],held=new Set(own.map(row=>row&&typeof row==='object'?String((row as {id?:unknown}).id):''));
 const rows=saved?.length?[...own,...saved.filter(row=>!!row&&typeof row==='object'&&!held.has(String((row as {id?:unknown}).id)))]:own,json=JSON.stringify(rows);
 return previous&&previous.json===json?previous:{json,rows:Object.freeze(structuredClone(rows))};
}
interface Props extends ContextPriceProps {popupHost?:HTMLElement|null;compound?:CompoundAlertDialogController;sessionOverride?:'regular'|'extended';createRequest?:AlertCreateRequest|null;open:boolean;onClose:()=>void;/** The saved-alert confirmation toast. */onSaved?:(message:string)=>void;alerts:LocalAlert[];autoHideToasts?:boolean;onAlertsChange:(alerts:LocalAlert[],expected?:LocalAlert[])=>boolean|void;dataset:BarDataset;bars?:readonly Bar[];chart?:ChartController|null;chartId?:string;replay:{runId:string;cursor:number}|null;enabled:boolean;suspended?:boolean;
 /** The routine background autosave is writing. Unlike suspended, nothing is withdrawn or disabled: the confirmed
  observation, controls and focus stay live; only this component's own evaluation publication (expiry, linked-level
  follow, crossings), which the host's storage lock would refuse, waits and runs right after the write. */
 backgroundSave?:boolean;
 /** Reads the host's storage lock directly. The lock is taken synchronously, before the backgroundSave render
  arrives, so a tick or observation landing in that gap defers instead of publishing into the lock. */
 isStorageLocked?:()=>boolean;
 /** The applied Strategy tester properties, frozen into new strategy order-fill alert sources. */
 strategy?:StrategyConfig|null;
 /** This symbol's drawings saved in the workspace (every cell and layout), for drawing alerts made on
  *  another chart of the symbol. Absent: only the active chart's drawings. */
 readSavedDrawings?:(instrumentId:string)=>readonly unknown[]}
const NO_CONDITIONS:readonly AlertConditionSelection[]=Object.freeze([]);
/** The extra conditions of a draft enter the selection identity, so an observation of another draft is never used. */
function conditionsKey(conditions:readonly AlertConditionSelection[]):string{return conditions.length?JSON.stringify(conditions.map(row=>[row.sourceId,row.targetId])):'';}
function selectionKey(sourceId:string,targetId:string,conditions:readonly AlertConditionSelection[]):string{const extra=conditionsKey(conditions);return sourceId+'|'+targetId+(extra?'|'+extra:'');}
/** The draft's frozen source: one condition (a source, or a source compared with another), or an all-conditions
 * source of the first condition and every added one. `unavailable` overrides the messages for a source that went away. */
export function selectedAlertSource(catalog:TechnicalAlertCatalog,choices:readonly AlertSourceChoice[],sourceId:string,targetId:string,conditions:readonly AlertConditionSelection[],unavailable?:string):AlertSourceSnapshot{
 const one=(source:string,target:string,index:number):AlertSourceSnapshot=>{
  const left=choices.find(choice=>choice.id===source),right=target==='constant'?null:choices.find(choice=>choice.id===target),prefix=index?'Condition '+(index+1)+': ':'';
  if(!left?.source||left.disabledReason)throw new Error(unavailable??prefix+'Selected alert source is unavailable. Choose another source explicitly.');
  if(target!=='constant'&&(!right?.source||right.disabledReason))throw new Error(unavailable??prefix+'Selected comparison target is unavailable.');
  return catalog.expression(left.source,right?.source??null);
 };
 const first=one(sourceId,targetId,0);
 return conditions.length?catalog.group([first,...conditions.map((row,index)=>one(row.sourceId,row.targetId,index+1))]):first;
}
interface ManagerBasis { publisher: Props['onAlertsChange']; chart: ChartController|null; chartId: string|undefined; instrumentId: string; datasetKey: string; runId: string|null; completion: boolean; source: string; target: string; binding: AlertObservationBinding|null; }
function sameManagerBasis(a:ManagerBasis,b:ManagerBasis):boolean {
 return a.publisher===b.publisher&&a.chart===b.chart&&a.chartId===b.chartId&&a.instrumentId===b.instrumentId&&a.datasetKey===b.datasetKey&&a.runId===b.runId&&a.completion===b.completion&&a.source===b.source&&a.target===b.target&&(a.binding===null?b.binding===null:b.binding!==null&&sameAlertBinding(a.binding,b.binding));
}
/** The Alerts dialog element of each WorkspaceAlerts instance (keyed by its observer), kept while nothing it
 * shows changed. WorkspaceAlerts itself still renders with every live bar of the active chart (its one-second evaluation
 * reads the newest bars from its props), but the dialog, open or closed, re-renders only when its own inputs change. */
const keptDialogs=new WeakMap<object,{cache:OwnedElementCache;invalidDrawings?:ReadonlyMap<string,string>;authority:{token:object;assertCurrent:(token:object)=>void}|null}>();
const NO_ROWS:never[]=[];
function keptDialogOf(owner:object){let found=keptDialogs.get(owner);if(!found){found={cache:new Map(),authority:null};keptDialogs.set(owner,found);}return found;}
interface View{result:TechnicalAlertView|null;choices:AlertSourceChoice[];diagnostics:string[];dataset:BarDataset;bars:readonly Bar[];selection:string;now:number;generation?:number}
/** Each eligible frozen expression is observed independently. Draft selection never gates existing alert streams. */
export function WorkspaceAlerts(props:Props){
 const [sourceId,setSourceId]=useState('price:close:chart'),[targetId,setTargetId]=useState('constant'),[conditions,setConditions]=useState<readonly AlertConditionSelection[]>(NO_CONDITIONS),[assumeReplayCompletion,setAssumeReplayCompletion]=useState(false),[busy,setBusy]=useState(false),[epoch,setEpoch]=useState(0),[commitEpoch,setCommitEpoch]=useState(0);
 const [selectedRequest,setSelectedRequest]=useState<ContextPriceRequest|null>(null),[requestError,setRequestError]=useState('');
 const observer=useRef<TechnicalAlertObserver|null>(null),catalog=useRef<TechnicalAlertCatalog|null>(null),drawingRows=useRef<{json:string;rows:readonly unknown[]}|null>(null);
 const drawingFollow=useRef<DrawingAlertFollow|null>(null);if(!drawingFollow.current)drawingFollow.current=new DrawingAlertFollow();
 const commitGate=useRef<AlertCommitEvaluationGate|null>(null);if(!commitGate.current)commitGate.current=new AlertCommitEvaluationGate();
 const closedHandler=useRef<(view:TechnicalAlertView)=>void>(()=>{});const pendingClosed=useRef<TechnicalAlertView[]>([]);
 if(!observer.current)observer.current=new TechnicalAlertObserver(()=>crypto.randomUUID(),undefined,view=>closedHandler.current(view));if(!catalog.current)catalog.current=new TechnicalAlertCatalog(()=>crypto.randomUUID());
 const latest=useRef({props,sourceId,targetId,conditions,assumeReplayCompletion});latest.current={props,sourceId,targetId,conditions,assumeReplayCompletion};
 const running=useRef(false),queued=useRef<'source-observation'|'explicit-evaluation'|null>(null),mounted=useRef(true),version=useRef(0);
 // An evaluation that met a background save; it runs once the write ends (an explicit evaluation is never downgraded).
 const deferred=useRef<'source-observation'|'explicit-evaluation'|null>(null);
 const defer=(reason:'source-observation'|'explicit-evaluation')=>{if(deferred.current!=='explicit-evaluation')deferred.current=reason;};
 // The background write as the prop reports it, or the host lock read directly (it leads the prop by a render).
 const writeLocked=()=>{const live=latest.current.props;return !live.suspended&&(!!live.backgroundSave||live.isStorageLocked?.()===true);};
 // A live bar closed on the wall clock with no newer data: its once-per-bar-close events go through the same publication
 // path as an ordinary observation. Closed events are always processed before the forming-bar events.
 const publishClosed=(view:TechnicalAlertView)=>{
  const live=latest.current;if(!mounted.current||!live.props.enabled||live.props.suspended||!view.closedEvents?.length)return;
  if(writeLocked()){pendingClosed.current.push(view);return;}
  const now=Math.floor(Date.now()/1000),alerts=live.props.alerts,processed=processLocalAlertBatch(alerts,view.closedEvents,now);
  if(processed.alerts===alerts)return;
  const published=renderNewAlertMessages(alerts,processed.alerts,{dataset:live.props.dataset,bars:live.props.bars??[]});
  try{live.props.onAlertsChange(published,alerts);}catch{/* a refused publication never stops the feed */}
 };
 closedHandler.current=publishClosed;
 const ready=useRef<{generation:number;dataset:BarDataset;bars:readonly Bar[];chart:ChartController|null;chartId:string|undefined;runId:string|null;cursor:number|null;completion:boolean;source:string;target:string;conditions:string}|null>(null);
 const [view,setView]=useState<View|null>(null);
 const actionObservation=useRef<View|null>(null);
 const confirmedManagerBinding=useRef<AlertObservationBinding|null>(null),managerBasis=useRef<ManagerBasis|null>(null),managerActionToken=useRef<object>({});
 const manualReady=()=>{const live=latest.current,value=ready.current;return mounted.current&&live.props.enabled&&!live.props.suspended&&!!value&&value.generation===version.current&&sameAlertInput(value,live.props)&&value.chart===(live.props.chart??null)&&value.chartId===live.props.chartId&&value.runId===(live.props.replay?.runId??null)&&value.cursor===(live.props.replay?.cursor??null)&&value.completion===live.assumeReplayCompletion&&value.source===live.sourceId&&value.target===live.targetId&&value.conditions===conditionsKey(live.conditions);};
 useLayoutEffect(()=>{
  const request=props.contextRequest;if(!props.open||!request||selectedRequest===request)return;
  try{assertContextPriceRequest(props,request,'price-alert',props.dataset.instrument);setSourceId(request.style==='heikinashi'?'price:close:standard':'price:close:chart');setTargetId('constant');setConditions(NO_CONDITIONS);setSelectedRequest(request);setRequestError('');}
  catch(error){setRequestError(error instanceof Error?error.message:String(error));}
 },[props.contextRequest,props.open,props.dataset.instrument,selectedRequest]);
 // The source and target belong to the Create draft. Escape/Cancel (onDraftDiscarded) and closing the
 // dialog discard them with the draft; a create request that names a source still preselects it (below).
 const resetSelection=useCallback(()=>{setSourceId('price:close:chart');setTargetId('constant');setConditions(NO_CONDITIONS);},[]);
 useLayoutEffect(()=>{if(!props.open)resetSelection();},[props.open,resetSelection]);
 const handledCreate=useRef<AlertCreateRequest|null>(null);
 useLayoutEffect(()=>{const request=props.createRequest;if(!props.open||!request||props.contextRequest||handledCreate.current===request)return;handledCreate.current=request;if(request.sourceId){setSourceId(request.sourceId);setTargetId('constant');setConditions(NO_CONDITIONS);}},[props.createRequest,props.open,props.contextRequest]);
 const validateCurrentSource=useCallback((binding:AlertObservationBinding)=>{
  const current=latest.current;if(!manualReady())throw new Error('Alert capture and saving are paused until a fresh workspace observation is ready.');const bars=current.props.bars??[],chart=requireTechnicalChart(current.props.chart??null,current.props.dataset,bars);
  if(binding.schemaVersion!==2||binding.datasetKey!==alertSourceDatasetKey(current.props.dataset,binding.source,2)||binding.chartId!==current.props.chartId||binding.replayRunId!==(current.props.replay?.runId??null)||binding.completionPolicy!==(hasNyseAlertCalculation(binding.source)?'nyse-session-observation':current.props.replay&&current.assumeReplayCompletion?'replay-supplied-row':'unknown'))throw new Error('The selected chart context changed before this alert could be saved.');
  const choices=catalog.current!.capture(chart,current.props.dataset,bars,current.props.alerts,{strategy:current.props.strategy??null});
  const selected=selectedAlertSource(catalog.current!,choices,current.sourceId,current.targetId,current.conditions,'A selected source was removed or became unavailable.'),context=observer.current!.currentContext(selected,current.props.dataset);
  if(!context||!sameAlertBinding(context.binding,binding))throw new Error('Captured settings changed before save. Recapture the current source explicitly.');
 },[]);
 const tick=useCallback(async(reason:'source-observation'|'explicit-evaluation'='source-observation')=>{
  if(running.current)return;
  // During a background save the view, readiness and controls are kept as they are (no busy flag either); the
  // evaluation, whose publication the storage lock would refuse, waits for the write.
  if(writeLocked()){defer(reason);return;}
  if(pendingClosed.current.length){const queuedViews=pendingClosed.current.splice(0);for(const queuedView of queuedViews)publishClosed(queuedView);}
  running.current=true;setBusy(true);const generation=version.current,current=latest.current,now=Math.floor(Date.now()/1000),bars=current.props.bars??[];let observationStarted=false,publicationRejected=false,publication:Awaited<ReturnType<TechnicalAlertObserver['observeForPublication']>>|null=null;
  try{
   if(current.props.suspended){observer.current!.cancelPending();if(mounted.current&&generation===version.current){ready.current=null;setView({result:null,choices:[],diagnostics:['Alerts are paused while the workspace updates and resume right after.'],dataset:current.props.dataset,bars,selection:selectionKey(current.sourceId,current.targetId,current.conditions),now});}return;}
   let observedAlerts=current.props.alerts;
   const expiry=processLocalAlertBatch(observedAlerts,[],now);
   if(expiry.alerts!==observedAlerts){if(current.props.onAlertsChange(expiry.alerts,observedAlerts)===false){publicationRejected=true;throw new Error('Alert expiry could not be saved. Nothing changed.');}observedAlerts=expiry.alerts;}
   if(!current.props.enabled){observer.current!.reset();observer.current!.dispose();if(mounted.current&&generation===version.current){ready.current=null;setView({result:null,choices:[],diagnostics:['Local source observation is not enabled.'],dataset:current.props.dataset,bars,selection:selectionKey(current.sourceId,current.targetId,current.conditions),now});}return;}
   const chart=requireTechnicalChart(current.props.chart??null,current.props.dataset,bars);
   if(!current.props.chartId)throw new Error('The active chart identity is missing.');
   const drawingDocument=chart.saveDrawings(),followed=followPositionDrawings(observedAlerts,Array.isArray(drawingDocument.drawings)?drawingDocument.drawings:[],{chartId:current.props.chartId,instrument:current.props.dataset.instrument},now);
   if(followed.alerts!==observedAlerts){if(current.props.onAlertsChange(followed.alerts,observedAlerts)===false){publicationRejected=true;throw new Error('Linked level changes could not be saved. Nothing changed.');}observedAlerts=followed.alerts;}
   // Drawing alerts follow their drawing; a moved drawing restarts its alerts (history kept).
   let savedDrawings:readonly unknown[]|null=null;if(current.props.readSavedDrawings&&observedAlerts.some(alert=>alertDrawingIds(alert).length)){try{savedDrawings=current.props.readSavedDrawings(current.props.dataset.instrument.id);}catch{savedDrawings=null;}}
   drawingRows.current=legacyDrawingRows(observedAlerts,drawingDocument,drawingRows.current,savedDrawings);
   const instrumentId=current.props.dataset.instrument.id,ownAlerts=observedAlerts.filter(alert=>alert.definition.instrumentId===instrumentId);
   const drawingFollowed=drawingRows.current?drawingFollow.current!.follow(ownAlerts,drawingRows.current.rows,now):{alerts:ownAlerts,restarted:[]};
   if(drawingFollowed.alerts!==ownAlerts){const byId=new Map(drawingFollowed.alerts.map(alert=>[alert.definition.id,alert])),nextAlerts=observedAlerts.map(alert=>byId.get(alert.definition.id)??alert);if(current.props.onAlertsChange(nextAlerts,observedAlerts)===false){publicationRejected=true;throw new Error('Drawing alert changes could not be saved. Nothing changed.');}observedAlerts=nextAlerts;}
   const followNotes=[...followed.diagnostics,...(followed.restarted.length?[`${followed.restarted.length} Long/Short position alert${followed.restarted.length===1?'':'s'} restarted with the drawing's new levels; history was kept.`]:[]),...(drawingFollowed.restarted.length?[`${drawingFollowed.restarted.length} drawing alert${drawingFollowed.restarted.length===1?'':'s'} restarted with the drawing's new position; history was kept.`]:[])];
   const choices=catalog.current!.capture(chart,current.props.dataset,bars,observedAlerts,{strategy:current.props.strategy??null});
   let selectedSource=null;const selectionDiagnostics:string[]=[];
   try{selectedSource=selectedAlertSource(catalog.current!,choices,current.sourceId,current.targetId,current.conditions);}catch(error){selectionDiagnostics.push(error instanceof Error?error.message:String(error));}
   const vwap=createTechnicalVwapEvaluator({chart,dataset:current.props.dataset,bars,executionIdentity:current.props.replay?.runId??'ordinary',isCurrent:()=>{const live=latest.current;return mounted.current&&generation===version.current&&live.props.chart===chart&&sameAlertInput(live.props,current.props)&&live.props.chartId===current.props.chartId&&(live.props.replay?.runId??null)===(current.props.replay?.runId??null)&&(live.props.replay?.cursor??null)===(current.props.replay?.cursor??null)&&live.props.enabled&&!live.props.suspended;}});
   observationStarted=true;
   publication=await observer.current!.observeForPublication({dataset:current.props.dataset,bars,chartId:current.props.chartId,replay:current.props.replay,assumeReplayCompletion:current.assumeReplayCompletion,selectedSource,alerts:observedAlerts,vwap,script:createTechnicalScriptEvaluator({dataset:current.props.dataset,sessionOverride:current.props.sessionOverride}),adopt:true,...(drawingRows.current?{drawings:drawingRows.current.rows}:{})},now,reason);
   const result=publication.view;
   if(!mounted.current||generation!==version.current||result.cancelled){publication.rollback();return;}
   // A background save began while this observation was computing: roll it back and run it again after the write.
   if(writeLocked()){publication.rollback();defer(reason);return;}
   requireTechnicalChart(chart,current.props.dataset,bars);
   const processed=processLocalAlertBatch(observedAlerts,[...(result.closedEvents??[]),...result.events],now),publishedAlerts=processed.alerts===observedAlerts?observedAlerts:renderNewAlertMessages(observedAlerts,processed.alerts,{dataset:current.props.dataset,bars});
   if(publishedAlerts!==observedAlerts&&current.props.onAlertsChange(publishedAlerts,observedAlerts)===false){publicationRejected=true;throw new Error('Alert check could not be saved. Nothing changed.');}
   publication.commit();
   const confirmed:View={result,choices,diagnostics:[...followNotes,...selectionDiagnostics,...result.diagnostics,...processed.diagnostics,...(result.inactiveAlertIds.length?[`${result.inactiveAlertIds.length} saved alerts are inactive, paused, or bound to a retired source. Only the active chart is checked.`]:[])],dataset:current.props.dataset,bars,selection:selectionKey(current.sourceId,current.targetId,current.conditions),now,generation};
   actionObservation.current=confirmed;refreshManagerAction();
   ready.current={generation,dataset:current.props.dataset,bars,chart:current.props.chart??null,chartId:current.props.chartId,runId:current.props.replay?.runId??null,cursor:current.props.replay?.cursor??null,completion:current.assumeReplayCompletion,source:current.sourceId,target:current.targetId,conditions:conditionsKey(current.conditions)};
   setView(confirmed);
  }catch(error){publication?.rollback();if(publicationRejected||retainContinuityAfterTechnicalFailure(error,observationStarted))observer.current!.cancelPending();else observer.current!.invalidate();if(mounted.current&&generation===version.current){ready.current=null;setView({result:null,choices:[],diagnostics:[error instanceof Error?error.message:String(error)],dataset:current.props.dataset,bars,selection:selectionKey(current.sourceId,current.targetId,current.conditions),now});}}
  finally{running.current=false;if(mounted.current)setBusy(false);const next=queued.current;queued.current=null;if(next&&mounted.current)queueMicrotask(()=>void tick(next));}
 },[]);
 // Keep the upstream publisher and confirmed source session explicit even though
 // saveAlerts itself is stable. Snapshots are detached to detect in-place changes.
 const refreshManagerAction=()=>{
  try{
   const live=latest.current,observed=actionObservation.current;
   if(observed?.generation===version.current&&sameAlertInput(observed,live.props)&&observed.selection===selectionKey(live.sourceId,live.targetId,live.conditions)&&observed.result){
    const binding=observed.result.selectedContext?.binding??null,prior=confirmedManagerBinding.current;
    if(binding===null?prior!==null:prior===null||!sameAlertBinding(prior,binding))confirmedManagerBinding.current=binding?structuredClone(binding):null;
   }
   const next:ManagerBasis={publisher:live.props.onAlertsChange,chart:live.props.chart??null,chartId:live.props.chartId,instrumentId:live.props.dataset.instrument.id,datasetKey:alertDatasetKey(live.props.dataset,2),runId:live.props.replay?.runId??null,completion:live.assumeReplayCompletion,source:live.sourceId,target:live.targetId+conditionsKey(live.conditions),binding:confirmedManagerBinding.current};
   if(!managerBasis.current||!sameManagerBasis(managerBasis.current,next)){managerBasis.current=next;managerActionToken.current={};}
  }catch{if(managerBasis.current!==null){managerBasis.current=null;managerActionToken.current={};}}
 };
 const assertManagerActionCurrent=useCallback((expectedToken:object)=>{
  refreshManagerAction();
  if(!mounted.current||expectedToken!==managerActionToken.current||!managerBasis.current||!manualReady())throw Error('Selected alert actions are unavailable until the current workspace observation is ready. Reopen the action preview.');
 },[]);
 const saveAlerts=useCallback((next:LocalAlert[],expected?:LocalAlert[])=>{if(!manualReady())return false;const outcome=latest.current.props.onAlertsChange(next,expected??latest.current.props.alerts);if(outcome===false)return false;if(outcome!==true&&outcome!==undefined)throw Error('Could not confirm the alert was saved. Check your alerts before trying again.');commitGate.current!.staged(next);return true;},[]);
 const requestObservation=useCallback((reason?:'after-save')=>{if(reason==='after-save'){commitGate.current!.request();setCommitEpoch(value=>value+1);}else void tick('explicit-evaluation');},[tick]);
 // The input change invalidates at once (version, pending rows); the observation itself, whose source capture took
 // 20-25 ms of every switch and replay step, runs after the frame paints (technical-alert-observer.ts createObservationScheduler).
 const sourceTick=useMemo(()=>createObservationScheduler(()=>{if(running.current)queued.current??='source-observation';else void tick();}),[tick]);
 useEffect(()=>()=>sourceTick.cancel(),[sourceTick]);
 useLayoutEffect(()=>{version.current++;observer.current!.cancelPending();sourceTick.request();},[...alertInputKey(props.dataset,props.bars),props.chart,props.chartId,props.sessionOverride,props.replay?.runId,props.replay?.cursor,props.enabled,props.suspended,sourceId,targetId,conditionsKey(conditions),assumeReplayCompletion,epoch,tick]);
 useLayoutEffect(()=>{if(props.suspended||!commitGate.current!.take(props.alerts))return;version.current++;observer.current!.cancelPending();if(running.current)queued.current='explicit-evaluation';else void tick('explicit-evaluation');},[props.alerts,props.suspended,commitEpoch,tick]);
 // The write ended (or a blocking operation took over, whose own resume re-evaluates): run the deferred evaluation,
 // scheduled like the interval tick (a passive effect), so it is an ordinary evaluation with unchanged pending semantics.
 useEffect(()=>{if(props.backgroundSave)return;const next=deferred.current;deferred.current=null;if(!next||props.suspended)return;if(running.current){if(queued.current!=='explicit-evaluation')queued.current=next;}else void tick(next);},[props.backgroundSave,props.suspended,tick]);
 useEffect(()=>{if(!props.chart)return;const refresh=()=>setEpoch(value=>value+1),off=props.chart.indicators.subscribe(refresh),offDrawings=props.chart.onDrawingsChanged(refresh);return()=>{off();offDrawings();};},[props.chart]);
 useEffect(()=>{mounted.current=true;const timer=setInterval(()=>void tick(),1000);return()=>{mounted.current=false;version.current++;clearInterval(timer);observer.current?.reset();observer.current?.dispose();pendingClosed.current=[];commitGate.current?.clear();};},[tick]);
 const currentSelection=selectionKey(sourceId,targetId,conditions),usable=props.enabled&&!props.suspended&&view?.generation===version.current&&!!view&&sameAlertInput(view,props)&&view.selection===currentSelection&&(!props.contextRequest||selectedRequest===props.contextRequest);
 refreshManagerAction();
 // View metadata is recomputed from the observation's current rows, including Undo, Redo and layout restore.
 const keptDialog=keptDialogOf(observer.current!);
 const invalidDrawings=invalidDrawingAlertNotes(props.alerts,instrumentId=>instrumentId===props.dataset.instrument.id?drawingRows.current?.rows:props.readSavedDrawings?.(instrumentId),keptDialog.invalidDrawings);keptDialog.invalidDrawings=invalidDrawings;
 const authority=keptDialog.authority?.token===managerActionToken.current&&keptDialog.authority.assertCurrent===assertManagerActionCurrent?keptDialog.authority:(keptDialog.authority={token:managerActionToken.current,assertCurrent:assertManagerActionCurrent});
 return reuseOwnedElement(keptDialog.cache,'dialog',<AlertDialog compound={props.compound} invalidDrawings={invalidDrawings} managerActionAuthority={authority} open={props.open} onClose={props.onClose} alerts={props.alerts} onAlertsChange={saveAlerts} externallyProcessed instrument={props.dataset.instrument} now={view?.now??Math.floor(Date.now()/1000)} event={usable?view!.result?.selectedEvent:null} readLastPrice={lastPriceReader(latest)} events={usable?view!.result?.events:NO_ROWS} context={usable?view!.result?.selectedContext:null} contexts={usable?view!.result?.contexts:NO_ROWS} onRequestObservation={requestObservation} replayAssumeCompletion={assumeReplayCompletion} onReplayAssumeCompletionChange={setAssumeReplayCompletion} diagnostics={[...(view?.diagnostics??[]),...(requestError?[requestError]:[])]} sourceChoices={view?.choices??NO_ROWS} selectedSourceId={sourceId} targetSourceId={targetId} onSourceChange={setSourceId} onTargetChange={setTargetId} conditionSelections={conditions} onConditionSelectionsChange={setConditions} sourceSelectionKey={currentSelection} evaluationPending={busy} validateCurrentSource={validateCurrentSource} contextRequest={props.contextRequest} assertContextCurrent={props.assertContextCurrent} onContextComplete={props.onContextComplete} deliveryHost={reuseOwnedElement(keptDialog.cache,'delivery',<AlertDeliveryHost alerts={props.alerts} autoHide={props.autoHideToasts??true} popupHost={props.popupHost}/>)} createRequest={props.createRequest??null} onSaved={props.onSaved} onDraftDiscarded={resetSelection}/>,[],['instrument','diagnostics']);
}
