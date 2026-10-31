import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {vi} from 'vitest';
import {createDrawing,DrawingsControl,getNativeIndicator,type SerializedDrawing,type Vela} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingTemplateBatches,captureNativeDrawingLease} from '../../src/chart/drawing-template-batch';
import {captureDrawingRuntimeState} from '../../src/chart/drawing-runtime-state';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';
import {createDrawingVisibilityProjection,validateDrawingVisibility} from '../../src/chart/drawing-visibility';
import {commitPortableDrawingBindings,resolvePortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
import {stampNewDrawings} from "../../src/chart/drawing-linked-plan";
import {createDrawingIdReservations} from '../../src/chart/drawing-id-reservations';
import {publishDrawingSubscribers} from '../../src/chart/drawing-publication';
import {createDrawingManager,DrawingManagerPublicationError} from '../../src/chart/drawing-manager';
import {captureNativeDrawingProjection} from '../../src/chart/drawing-native-projection';
import {readTrendlineAnnotation} from '../../src/chart/trendline-annotation-data';
import {assertNativeDrawingMatchesCanonical} from '../../src/chart/drawing-canonical';
import {patchDrawingEdit} from '../../src/chart/drawing-port';
import {commitDrawingEdit,DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {attemptEveryCleanup} from '../../src/chart/chart-retirement';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {IndicatorId} from '../../src/domain/indicators';

// OTDW history harness (SYNTHETIC, not mounted). Drawings: the CURRENT adapter.ts drawing
// document, reconciliation, notification batching, drawing manager and loadDrawings source
// (sliced from src/chart/adapter.ts the same way tests/chart/drawing-template-adapter-harness.ts
// does) over the actual native Vela DrawingController behind the package DrawingsControl facade.
// Indicators: the actual indicator port over a minimal native host whose panes keep an order and
// honor newPane before/after. Undo: the actual createWorkspaceHistory, recording one entry per
// published change exactly where MultiChartGrid captures (onDrawingsChanged + indicators.subscribe,
// payload saveDrawings() + indicators.serialize()), restoring through the same ports the analysis
// restore uses (indicators.restore, loadDrawings). The App/grid commit loop itself is modeled.
export const drawingRecord=(id:string,price:number):SerializedDrawing=>createDrawing('trendline',{id,paneId:'price',anchors:[{time:1000000,price},{time:1240000,price:price+10}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize();
export const hostBars=Array.from({length:60},(_,i)=>{const close=100+5*Math.sin(i/5)+(i%4)*0.5;return {time:1700000000000+i*86400000,open:close-0.4,high:close+1.2,low:close-1.1,close,volume:1000+(i*53)%500};});

/** Indicator native host with ordered panes; empty study panes disappear as in the renderer. */
export function orderedIndicatorHost(bars:readonly {time:number}[]=hostBars){
 let sequence=0,order:string[]=['price'];const live=new Map<string,any>();
 const prune=()=>{order=order.filter(id=>id==='price'||[...live.values()].some(row=>row.pane===id));};
 const panes=()=>{prune();return order.map((id,index)=>({id,kind:id==='price'?'price':'study',order:index,collapsed:false,maximized:false,indicators:[...live].filter(([,row])=>row.pane===id).map(([nativeId,row])=>({id:nativeId,title:row.type,ownScale:false}))}));};
 const place=(target:any):string=>{
  if(target==='price')return 'price';
  if(target&&typeof target==='object'&&'pane' in target)return order.includes(target.pane)?target.pane:'price';
  const id='native-pane-'+ ++sequence,spec=target?.newPane;
  if(spec&&spec!==true&&(spec.before!==undefined||spec.after!==undefined)){const anchor=spec.before??spec.after,at=order.indexOf(anchor);if(at<0)order.push(id);else order.splice(spec.before!==undefined?at:at+1,0,id);}else order.push(id);
  return id;
 };
 const chart={panes:{list:panes},indicators:()=>[...live.values()].map(row=>row.handle),addNativeIndicator(type:string){
  const descriptor=getNativeIndicator(type)!,id='native-'+ ++sequence,model=descriptor.create(),state:any={type,model,pane:'price',inputs:descriptor.defaultInputs(),visible:true,handle:null};
  state.handle={id,remove:()=>{model.stop();live.delete(id);},moveTo:(target:any)=>{state.pane=place(target);prune();},setInputs:(inputs:any)=>{state.inputs=structuredClone(inputs);model.setInputs(inputs);},setVisible:(next:boolean)=>{state.visible=next;next?model.resume():model.suspend();},get visible(){return state.visible;}};
  live.set(id,state);model.start({id,bars:()=>bars,emit:()=>{},setStatus:()=>{}} as any,state.inputs);return state.handle;
 }};
 // The renderer orchestrator reorder hook (pinned Vela EngineOrchestrator.reorderPanes, present on the real chart shape per
 // tests/chart/indui-pane-above.test.ts). It is not put on `chart`: the indicator port treats an own orchestrator as full native
 // internals. The UI-facing chart view below carries it instead.
 const reorderPanes=(next:string[])=>{prune();if(next.length!==order.length||next.some(id=>!order.includes(id)))throw Error('Pane order must list every pane once.');order=[...next];};
 return {chart,live,reorderPanes,order:()=>panes().map(pane=>pane.id)};
}

export async function objectTreeHistoryHarness(options:{drawings?:string[];indicators?:IndicatorId[]}={}){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 try{
  const original=(options.drawings??['line-a','line-b','line-c']).map((id,index)=>drawingRecord(id,100+index*10)),knownTypes=new Set(['trendline']),inventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]}],occupiedIds:[]};
  const initial=resolvePortableDrawingDocument({version:1,drawings:original},inventory,knownTypes);
  document.load(initial.document);native.controller.fromJSON(initial.nativeDocument);
  const visibility=createDrawingVisibilityProjection({read:()=>document.all(),resolution:()=>'1D',push:()=>{}});native.controller.port.syncDrawings=(values:any)=>visibility.sync(values);visibility.sync(native.controller.all());
  const facade=new DrawingsControl(native.controller as never);
  const source=readFileSync('src/chart/adapter.ts','utf8'),begin=source.indexOf('  const templateBatches=createDrawingTemplateBatches({'),end=source.indexOf('\n  let managerNativeTouched=',begin),editedBegin=source.indexOf('  const updateDocument = () =>'),editedEnd=source.indexOf('\n  const unsubscribes =',editedBegin),reconcileBegin=source.indexOf('  const reconcileNativeDrawings='),notifyBegin=source.indexOf('  const notifyDrawings='),managerEnd=source.indexOf('\n  const controller = {',end),restoreBegin=source.indexOf('  const restore ='),restoreEnd=source.indexOf('  let prepareAnalysis:');
  if([begin,end,editedBegin,editedEnd,reconcileBegin,notifyBegin,managerEnd,restoreBegin,restoreEnd].some(index=>index<0))throw Error('Current adapter source boundary changed; review this actual-host harness');
  const code=`const {document,facade,native,createDrawingTemplateBatches,captureNativeDrawingLease,captureDrawingRuntimeState,visibility,inventory,knownTypes,createDrawingIdReservations,publishDrawingSubscribers,createDrawingManager,DrawingManagerPublicationError,captureNativeDrawingProjection,readTrendlineAnnotation,assertNativeDrawingMatchesCanonical,patchDrawingEdit,validateDrawingVisibility,commitDrawingEdit,DrawingEditRecoveryError,attemptEveryCleanup,resolvePortableDrawingDocument,stampNewDrawings}=injected;
  let drawingUtilityState;let currentSource={},currentBars=[],requestedStyle='candles',disposed=false,analysisUnavailable='',analysisPending=0,selectedDrawingIds=[],drawingBatch=0,nativeDrawingReconciliationHold=0,drawingDirty=false,notifications=0;
  const chart={drawings:facade},marketQueue={isPending:()=>false};
  const contextMenus=null,drawingSubscribers=new Set();drawingSubscribers.add(()=>{notifications++;});
  ${source.slice(notifyBegin,reconcileBegin)}
  const drawingProjection=visibility,analysisInventory=()=>inventory,drawingReservations=createDrawingIdReservations(ids=>native.controller.reserveIds(ids));let unavailableDrawingIds=new Set(),drawingBindingDiagnostics=[];
  const commitPortableDrawingBindings=injected.commitPortableDrawingBindings;
  ${source.slice(reconcileBegin,editedBegin)}
  const recoverNativeDrawingDocument=previous=>native.controller.fromJSON(previous);
  const unavailable=message=>{analysisUnavailable=message;};
  ${source.slice(editedBegin,editedEnd)}
  native.on('drawing:edited',()=>updateDocument());native.on('drawing:selected',({ids})=>{selectedDrawingIds=[...ids];});
  ${source.slice(begin,end)}
  ${source.slice(end,managerEnd)}
  const drawingCoordinateContext=()=>({timeCoordinatesAvailable:true}),rendererDrawingPort={};
  ${source.slice(restoreBegin,restoreEnd)}
  const drawingErasePublisher={captureReadOnly:()=>undefined},drawingDuplicatePublisher={captureReadOnly:()=>undefined},resetPublisher={captureReadOnly:()=>undefined};
  const saveDrawings=()=>drawingErasePublisher.captureReadOnly()??drawingDuplicatePublisher.captureReadOnly()??resetPublisher.captureReadOnly()??templateBatches.captureReadOnly()??reconcileNativeDrawings(false);
  return {manager:drawingManager,save:saveDrawings,load:doc=>restore(doc),subscribe:callback=>{drawingSubscribers.add(callback);return()=>{drawingSubscribers.delete(callback);};},notifications:()=>notifications,unavailable:()=>analysisUnavailable};`;
  const compiled=stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'});
  const adapter:{manager:ReturnType<typeof createDrawingManager>;save():Record<string,unknown>;load(doc:unknown):unknown;subscribe(callback:()=>void):()=>void;notifications():number;unavailable():string}=new Function('return '+compiled)()({document,facade,native,createDrawingTemplateBatches,captureNativeDrawingLease,captureDrawingRuntimeState,visibility,inventory,knownTypes,createDrawingIdReservations,commitPortableDrawingBindings,publishDrawingSubscribers,createDrawingManager,DrawingManagerPublicationError,captureNativeDrawingProjection,readTrendlineAnnotation,assertNativeDrawingMatchesCanonical,patchDrawingEdit,validateDrawingVisibility,commitDrawingEdit,DrawingEditRecoveryError,attemptEveryCleanup,resolvePortableDrawingDocument,stampNewDrawings});
  const indicatorHost=orderedIndicatorHost(),port=createIndicatorPort(indicatorHost.chart as unknown as Vela);
  const ids=(options.indicators??[]).map(kind=>port.add(kind,factoryIndicatorDefault(kind).inputs,factoryIndicatorDefault(kind)));
  // Workspace history loop (modeled App commit: one record per changed capture).
  type Snapshot={drawings:Record<string,unknown>;indicators:ReturnType<typeof port.serialize>};
  const history=createWorkspaceHistory<Snapshot>(),snapshot=():Snapshot=>({drawings:structuredClone(adapter.save()),indicators:port.serialize()}),same=(a:Snapshot,b:Snapshot)=>JSON.stringify(a)===JSON.stringify(b);
  let committed=snapshot(),restoring=false,publications=0;
  const capture=()=>{if(restoring)return;publications++;const next=snapshot();if(same(next,committed))return;history.record(committed,null);committed=next;};
  const offs=[adapter.subscribe(capture),port.subscribe(capture)];
  const restore=(direction:'undo'|'redo')=>{const entry=direction==='undo'?history.peekUndo():history.peekRedo();if(!entry)return false;restoring=true;try{port.restore(entry.workspace.indicators);adapter.load(entry.workspace.drawings);if(!history[direction](committed,null))throw Error('History entry vanished.');committed=snapshot();}finally{restoring=false;}return true;};
  const chart={
   drawingManager:adapter.manager,captureDrawingManagerOwner:()=>()=>{},
   onDrawingsChanged:(callback:()=>void)=>adapter.subscribe(callback),
   onDrawingSelection:(callback:(ids:string[])=>void)=>native.on('drawing:selected',({ids}:{ids:string[]})=>callback(ids)),
   drawings:facade,indicators:port,
   // UI-facing renderer view: the same panes plus the orchestrator reorder hook New pane above needs.
   chart:{panes:indicatorHost.chart.panes,orchestrator:{reorderPanes:indicatorHost.reorderPanes}},drawingCatalog:()=>[{type:'trendline',label:'Trend Line'}],
   duplicateDrawings:vi.fn((list:readonly string[])=>({accepted:true,ids:list})),
  };
  const nativeRows=()=>(facade.toJSON() as {drawings:SerializedDrawing[]}).drawings;
  return {native,facade,adapter,port,indicatorHost,ids,chart,history,restore,committed:()=>committed,snapshot,publications:()=>publications,nativeRows,dispose:()=>{offs.forEach(off=>off());native.dispose();}};
 }catch(error){native.dispose();throw error;}
}
