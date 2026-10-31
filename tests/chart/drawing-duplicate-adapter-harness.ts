import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {drawingTypes,type SerializedDrawing} from '@luxalgo/vela';
import {drawingRouterHarness} from './drawing-command-router-harness';
import {annotationRecord} from './trendline-annotation-native-harness';
import {bulkPropertyBar} from '../../src/chart/drawing-template-batch';
import {createDrawingDuplicatePublisher,createDrawingPasteRoute,type DrawingDuplicateWorkspaceHost} from '../../src/chart/drawing-duplicate-publication';
import {installDrawingCommandRouter} from '../../src/chart/drawing-command-router';
import {createNativeDrawingResetPublisher} from '../../src/chart/native-drawing-reset-publication';
import {installNativeDrawingReset} from '../../src/chart/native-drawing-reset';
import {publishDrawingSubscribers} from '../../src/chart/drawing-publication';
import {resolvePortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
import {createDrawingIdReservations} from '../../src/chart/drawing-id-reservations';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {createDrawingErasePublisher} from '../../src/chart/drawing-erase-publication';
import {drawingVisibility} from '../../src/chart/drawing-visibility';

/** Exact current adapter Duplicate block/controller/save/edited handler with original
 * native facade/core/store/history/render/open bodies. Workspace/DOM services controlled. */
export async function duplicateAdapterFixture(rows:SerializedDrawing[]=[{...annotationRecord(),lvPaneBinding:{schemaVersion:1,target:{kind:'price'}}} as SerializedDrawing],nativeRows:SerializedDrawing[]=rows,options:{contains?:(target:unknown)=>unknown;nativeChrome?:Record<string,unknown>}={}){
 const f=await drawingRouterHarness(nativeRows);f.reset.dispose();f.router.dispose();if(nativeRows!==rows)f.document.load({version:1,drawings:rows});
 if(options.contains)Object.getPrototypeOf(f.popup).contains=options.contains;
 if(options.nativeChrome){const prototype=Object.getPrototypeOf(f.popup);prototype.contains=f.paint.nativePopupPrototype.contains;prototype.isOwnChrome=f.paint.nativePopupPrototype.isOwnChrome;Object.assign(f.popup,options.nativeChrome);}
 Object.assign(f.paint.renderer,{scene:{seriesZ:new Map()},input:{dragging:false,touches:new Map()}});
 const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const extract=(start:string,end:string)=>{const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<0)throw Error('Current Duplicate adapter boundary changed: '+start);return source.slice(a,b);};
 const commands=extract('  const duplicateOwn=','  const resetPublisher='),reset=extract('  const resetPublisher=','  const templateBatches='),save=extract('    saveDrawings:','\n    setDrawingIntervalVisibility:');
 const controls=extract('    bindDrawingWorkspaceHost,','    waitForAnalysisPlacement:')+extract('    setDrawingMode:','    onToolChanged:');
 let focuses=0;(f.chart.renderer as any).focus=()=>{focuses++;};f.paint.controller.toolbar={setEraserActive(){},setMeasureActive(){},setActiveTool(){}};f.paint.controller.measure={...f.paint.controller.measure,clear(){},isFinished:()=>false};f.paint.controller.erasing=false;(f.native.controller.port as any).setMode=(mode:any)=>f.paint.controller.setMode(mode);
 const code=`const {f,document,chart,createDrawingPasteRoute,bulkPropertyBar,createDrawingDuplicatePublisher,createDrawingErasePublisher,drawingVisibility,installDrawingCommandRouter,createNativeDrawingResetPublisher,installNativeDrawingReset,publishDrawingSubscribers,resolvePortableDrawingDocument,createDrawingIdReservations,drawingTypes}=injected;
 let disposed=false,currentSource={resolution:'1d'},currentBars=[],requestedStyle='candles',currentExecutionIdentity='ordinary',vwapSourceEpoch={},statsSourceEpoch={},analysisUnavailable='',analysisPending=0,marketUpdating=false,queuePending=false;
 let drawingUtilityState;
 let drawingCommands=null,nativeDrawingReset=null,retireDrawingWorkspaceBinding=()=>{},inlineEditor=null,drawingBatch=0,nativeDrawingReconciliationHold=0,drawingEraseHeld=false,drawingDirty=false,selectedDrawingIds=[],notifications=0,reconciliations=0;
 const rendererHolder={current:f.paint.renderer},marketQueue={isPending:()=>queuePending},contextMenus=null,drawingSubscribers=new Set(),knownTypes=new Set(drawingTypes().map(row=>row.type));
 let inventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]}],occupiedIds:[]},unavailableDrawingIds=new Set(),drawingBindingDiagnostics=[];
 const analysisInventory=()=>({...inventory,occupiedIds:[...inventory.occupiedIds,...document.ids()]}),drawingReservations=createDrawingIdReservations(ids=>chart.drawings.reserveIds(ids)),unavailable=message=>{analysisUnavailable=message;};
 drawingReservations.apply(document.ids());
 ${extract('  const notifyDrawings=','  const reconcileNativeDrawings=')}
 const reconcileNativeDrawings=()=>{reconciliations++;document.mergeRenderable(chart.drawings.all(),knownTypes,false);return document.serialize();};
 ${extract('  const updateDocument = () =>','  const unsubscribes =')}
 const offs=[f.native.on('drawing:selected',({ids})=>{selectedDrawingIds=[...ids];}),f.native.on('drawing:created',updateDocument),f.native.on('drawing:edited',updateDocument)];
 ${commands}
 ${reset}
 const templateBatches={captureReadOnly:()=>undefined};const controller={${controls}${save}};
 drawingSubscribers.add(()=>{notifications++;});
 return{controller,publisher:drawingDuplicatePublisher,erasePublisher:drawingErasePublisher,router:()=>drawingCommands,subscribe:callback=>{drawingSubscribers.add(callback);return()=>drawingSubscribers.delete(callback);},
 pending:value=>{analysisPending=value?1:0;},queue:value=>{queuePending=value;},inline:value=>{inlineEditor=value?{isEditing:()=>true}:null;},unavailable:()=>{analysisUnavailable='SYNTHETIC unavailable';},
 retire:()=>{currentSource={};},execution:()=>{currentExecutionIdentity='SYNTHETIC replay';},epoch:()=>{vwapSourceEpoch={};},panes:value=>{inventory=value;},
 state:()=>({notifications,reconciliations,drawingBatch,nativeDrawingReconciliationHold,analysisUnavailable,selectedDrawingIds}),
 dispose(){disposed=true;retireDrawingWorkspaceBinding();nativeDrawingReset.dispose();drawingCommands.dispose();offs.forEach(off=>off());}};`;
 let api:any;try{api=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({f,document:f.document,chart:f.chart,createDrawingPasteRoute,bulkPropertyBar,createDrawingDuplicatePublisher,createDrawingErasePublisher,drawingVisibility,installDrawingCommandRouter,createNativeDrawingResetPublisher,installNativeDrawingReset,publishDrawingSubscribers,resolvePortableDrawingDocument,createDrawingIdReservations,drawingTypes});}catch(error){f.dispose();throw error;}
 const history=createWorkspaceHistory<any>();let workspace={drawings:f.document.serialize()},prepareHook=()=>{},beforeWrite=()=>{},afterWrite=()=>{},savedDuringPublish:unknown,historyDispatches:string[]=[];
 const host:DrawingDuplicateWorkspaceHost={capture(){let expected=workspace;const assertCurrent=()=>{if(workspace!==expected)throw Error('SYNTHETIC workspace replaced');};return{assertCurrent,prepare(candidate){assertCurrent();prepareHook();assertCurrent();const next={drawings:structuredClone(candidate)},undo=history.prepareRecord(workspace,null);let phase='prepared';return{assertCurrent(){assertCurrent();if(phase==='prepared')undo.assertCurrent();},publish(mark){assertCurrent();if(phase!=='prepared')throw Error('SYNTHETIC workspace consumed');beforeWrite();assertCurrent();undo.commit();workspace=next;expected=next;phase='accepted';mark();savedDuringPublish=api.controller.saveDrawings();afterWrite();}};}};},history(direction,assert){assert();historyDispatches.push(direction);},historyStatus(){return{canUndo:history.status().undo>0,canRedo:history.status().redo>0};}};
 return{...api,f,rows,history,host,focuses:()=>focuses,workspace:()=>workspace,savedDuringPublish:()=>savedDuringPublish,historyDispatches,prepare(action:()=>void){prepareHook=action;},beforeWrite(action:()=>void){beforeWrite=action;},afterWrite(action:()=>void){afterWrite=action;},dispose(){api.dispose();f.dispose();}};
}
