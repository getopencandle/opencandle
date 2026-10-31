import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import type {Vela} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createNativeDrawingResetPublisher,NativeDrawingResetPublicationError} from '../../src/chart/native-drawing-reset-publication';
import {installNativeDrawingReset} from '../../src/chart/native-drawing-reset';
import {installTrendlineAnnotation} from '../../src/chart/trendline-annotation';
import {realVelaChart} from '../helpers/real-vela-chart';
import {publishDrawingSubscribers} from '../../src/chart/drawing-publication';
import {resolvePortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
import {nativeDrawingHarness} from './drawing-native-harness';
import {annotationNativeHarness,annotationRecord} from './trendline-annotation-native-harness';

/** Current adapter host, save and edited-event bodies execute with actual native Reset,
 * controller/store/history and annotation painter. Popup DOM and persistence are controlled. */
export async function resetAdapterFixture(count=1){
 const core=await nativeDrawingHarness(),paint=await annotationNativeHarness(),document=new LosslessDrawingDocument();
 const rows=Array.from({length:count},(_,index)=>({...annotationRecord(false),id:'SYNTHETIC adapter reset '+index,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}}}));
 let latest:any=null;
 const popup=Object.create({syncPanel(){},isOpen(){return latest!==null;},close(){latest=null;},contains(){return false;},open(drawings:any[],anchor:unknown,actions:any){latest={drawings,anchor,actions};}});
 paint.controller.popup=popup;paint.controller.popupMulti=false;
 const select=core.controller.port.setSelection;core.controller.port.setSelection=(ids:string[])=>{select(ids);paint.controller.setSelection(ids);};
 core.controller.port.syncDrawings=(values:any)=>paint.sync(values);paint.controller.intentCb=(intent:any)=>core.controller.onIntent(intent);
 const chart=(await realVelaChart({renderer:paint.renderer,core:core.controller})).chart,annotation=installTrendlineAnnotation(paint.renderer,chart as unknown as Vela,{captureOwner:()=>()=>{},unavailable:()=>{}});
 document.load({version:1,drawings:rows,futureDocument:{label:'SYNTHETIC retained'}});core.controller.fromJSON(document.serialize());
 const source=readFileSync('src/chart/adapter.ts','utf8');
 const extract=(start:string,end:string)=>{const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<0)throw Error('Current Reset adapter source boundary changed.');return source.slice(a,b);};
 const save=extract('    saveDrawings:','\n    setDrawingIntervalVisibility:');
 const body=[
 'const {document,chart,paint,core,createNativeDrawingResetPublisher,installNativeDrawingReset,publishDrawingSubscribers,resolvePortableDrawingDocument}=injected;',
 'let disposed=false,currentSource={},currentBars=[],requestedStyle="candles",analysisUnavailable="",analysisPending=0,queuePending=false;',
 'let drawingBatch=0,nativeDrawingReconciliationHold=0,drawingDirty=false,nativeDrawingReset=null,drawingCommands=null,notifications=0,reconciliations=0;',
 'const rendererHolder={current:paint.renderer},marketQueue={isPending:()=>queuePending},contextMenus=null,drawingSubscribers=new Set(),diagnostics=[];',
 'let unavailableDrawingIds=new Set(),drawingBindingDiagnostics=[];const knownTypes=new Set(["trendline"]),drawingReservations={apply(){}},analysisInventory=()=>({panes:[{paneId:"price",logicalPaneId:"price",replaceable:false,owners:[]}],occupiedIds:[]});',
 'const unavailable=message=>{analysisUnavailable=message;};',
 extract('  const notifyDrawings=','  const reconcileNativeDrawings='),
 'const reconcileNativeDrawings=()=>{reconciliations++;document.mergeRenderable(core.controller.all(),knownTypes,false);return document.serialize();};',
 extract('  const updateDocument = () =>','  const unsubscribes ='),
 'const off=core.on("drawing:edited",updateDocument);',
 extract('  const resetPublisher=','  const templateBatches='),
 'const drawingErasePublisher={captureReadOnly:()=>undefined},drawingDuplicatePublisher={captureReadOnly:()=>undefined},templateBatches={captureReadOnly:()=>undefined};const controller={'+save+'};',
 'drawingSubscribers.add(()=>{notifications++;});',
 'return {publisher:resetPublisher,save:controller.saveDrawings,subscribe:callback=>{drawingSubscribers.add(callback);return()=>drawingSubscribers.delete(callback);},pending:value=>{analysisPending=value?1:0;},queue:value=>{queuePending=value;},retire:()=>{currentSource={};},state:()=>({notifications,reconciliations,drawingBatch,nativeDrawingReconciliationHold,analysisUnavailable}),dispose:()=>{disposed=true;nativeDrawingReset.dispose();off();}};'
 ].join('\n');
 try{
  const fn=new Function('return '+stripTypeScriptTypes('(function(injected){'+body+'})',{mode:'strip'}))();
  const host=fn({document,chart,paint,core,createNativeDrawingResetPublisher,installNativeDrawingReset,publishDrawingSubscribers,resolvePortableDrawingDocument});
  return{...host,core,paint,document,rows,open(ids=rows.map(row=>row.id)){if(ids.length===1)paint.controller.openSettingsById(ids[0],0,0);else{core.controller.setSelection(ids);paint.controller.openSettingsForSelection(ids);}return latest;},latest:()=>latest,dispose(){host.dispose();annotation.dispose();core.dispose();paint.dispose();}};
 }catch(error){annotation.dispose();core.dispose();paint.dispose();throw error;}
}

