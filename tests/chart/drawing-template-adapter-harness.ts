import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingTemplateBatches,captureNativeDrawingLease,DrawingTemplateBatchError} from '../../src/chart/drawing-template-batch';
import {captureDrawingRuntimeState} from '../../src/chart/drawing-runtime-state';
import {nativeDrawingHarness} from './drawing-native-harness';
import {createDrawingVisibilityProjection} from '../../src/chart/drawing-visibility';
import {commitPortableDrawingBindings,resolvePortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
import {stampNewDrawings} from "../../src/chart/drawing-linked-plan";
import {createDrawingIdReservations} from '../../src/chart/drawing-id-reservations';
import {drawingProjection} from './drawing-native-harness';
import {publishDrawingSubscribers,type DrawingSubscriber} from '../../src/chart/drawing-publication';
import {createDrawingManager,DrawingManagerPublicationError} from '../../src/chart/drawing-manager';
import {captureNativeDrawingProjection} from '../../src/chart/drawing-native-projection';
import {readTrendlineAnnotation} from '../../src/chart/trendline-annotation-data';
import {annotationRecord} from './trendline-annotation-native-harness';
import {assertNativeDrawingMatchesCanonical} from '../../src/chart/drawing-canonical';
import {patchDrawingEdit,type DrawingCoordinatePatch} from '../../src/chart/drawing-port';
import type {Bar} from '../../src/domain/types';
import type {DrawingIntervalVisibility} from '../../src/chart/drawing-visibility';
import {validateDrawingVisibility} from '../../src/chart/drawing-visibility';
import {commitDrawingEdit,DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {attemptEveryCleanup} from '../../src/chart/chart-retirement';

/** Executes current original LV adapter host/edited handler with actual native controller.
 * Real visibility/binding/reconciliation helpers; renderer/persistence sinks controlled. Not mounted. */
export async function templateAdapterHarness(inputRows?:SerializedDrawing[],properties:Record<string,unknown>={'style.lineColor':'#abcdef'},options:{bars?:Bar[];timeCoordinatesAvailable?:boolean;intervalVisibilityAvailable?:boolean}={}){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();try{const original=inputRows??[0,1].map(index=>createDrawing('trendline',{id:'synthetic-adapter-'+index,paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize()),knownTypes=new Set(original.map(row=>row.type)),inventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]}],occupiedIds:[]};
 const initial=resolvePortableDrawingDocument({version:1,drawings:original,lvDrawingManager:{schemaVersion:1,groups:[],templates:[{id:'synthetic-template',type:original[0].type,name:'SYNTHETIC',properties}]}},inventory,knownTypes),rows=initial.document.drawings as unknown as SerializedDrawing[];
 document.load(initial.document);native.controller.fromJSON(initial.nativeDocument);const visibility=createDrawingVisibilityProjection({read:()=>document.all(),resolution:()=>'1m',push:()=>{}});native.controller.port.syncDrawings=(values:any)=>visibility.sync(values);visibility.sync(native.controller.all());
 const facade={ctrl:native.controller,all:()=>native.controller.all(),fromJSON:(value:any)=>native.controller.fromJSON(value),updateMany:(value:any)=>native.controller.updateMany(value),toolDefaults:()=>native.controller.toolDefaults(),setToolDefaults:(value:any)=>native.controller.setToolDefaults(value),getTool:()=>native.controller.getTool(),setTool:(value:any)=>native.controller.setTool(value),select:(ids:readonly string[])=>native.controller.setSelection(ids)};
 const source=readFileSync('src/chart/adapter.ts','utf8'),begin=source.indexOf('  const templateBatches=createDrawingTemplateBatches({'),end=source.indexOf('\n  let managerNativeTouched=',begin),editedBegin=source.indexOf('  const updateDocument = () =>'),editedEnd=source.indexOf('\n  const unsubscribes =',editedBegin),reconcileBegin=source.indexOf('  const reconcileNativeDrawings='),notifyBegin=source.indexOf('  const notifyDrawings='),managerEnd=source.indexOf('\n  const controller = {',end),directBegin=source.indexOf('    updateDrawingEdit:'),directEnd=source.indexOf('    loadDrawings:',directBegin);if(begin<0||end<0||editedBegin<0||editedEnd<0||reconcileBegin<0||notifyBegin<0||managerEnd<0||directBegin<0||directEnd<0)throw Error('Current adapter source boundary changed; review this actual-host test');
 const code=`const {document,facade,native,createDrawingTemplateBatches,captureNativeDrawingLease,captureDrawingRuntimeState,visibility,inventory,knownTypes,createDrawingIdReservations,publishDrawingSubscribers,createDrawingManager,DrawingManagerPublicationError,captureNativeDrawingProjection,readTrendlineAnnotation,assertNativeDrawingMatchesCanonical,patchDrawingEdit,validateDrawingVisibility,commitDrawingEdit,DrawingEditRecoveryError,attemptEveryCleanup,resolvePortableDrawingDocument,stampNewDrawings}=injected;
 let drawingUtilityState;let currentSource={},currentBars=injected.options.bars??[],requestedStyle='candles',disposed=false,analysisUnavailable='',analysisPending=0,queuePending=false,selectedDrawingIds=[],drawingBatch=0,nativeDrawingReconciliationHold=0,drawingDirty=false,notifications=0,reconciliations=0,nativeEdited=0;
 const chart={drawings:facade},marketQueue={isPending:()=>queuePending};
 const contextMenus=null,drawingSubscribers=new Set();drawingSubscribers.add(()=>{notifications++;});
 ${source.slice(notifyBegin,reconcileBegin)}
 const drawingProjection=visibility,analysisInventory=()=>inventory,drawingReservations=createDrawingIdReservations(ids=>native.controller.reserveIds(ids));let unavailableDrawingIds=new Set(),drawingBindingDiagnostics=[];
 const commitPortableDrawingBindings=(...args)=>{reconciliations++;return injected.commitPortableDrawingBindings(...args);};
 ${source.slice(reconcileBegin,editedBegin)}
 const recoverNativeDrawingDocument=previous=>native.controller.fromJSON(previous);
 const unavailable=message=>{analysisUnavailable=message;};
 ${source.slice(editedBegin,editedEnd)}
 native.on('drawing:edited',()=>{nativeEdited++;updateDocument();});native.on('drawing:selected',({ids})=>{selectedDrawingIds=[...ids];});
 ${source.slice(begin,end)}
 ${source.slice(end,managerEnd)}
 const drawingCoordinateContext=()=>({timeCoordinatesAvailable:injected.options.timeCoordinatesAvailable!==false}),rendererDrawingPort=injected.options.intervalVisibilityAvailable===false?undefined:{};
 ${source.slice(source.indexOf('  const restore ='),source.indexOf('  let prepareAnalysis:'))}
 const drawingErasePublisher={captureReadOnly:()=>undefined},drawingDuplicatePublisher={captureReadOnly:()=>undefined},resetPublisher={captureReadOnly:()=>undefined};const directController={${source.slice(directBegin,directEnd)}${source.slice(directEnd,source.indexOf('    setDrawingIntervalVisibility:',directEnd))}};
 return {projection:()=>visibility.nativeRowsSnapshot(),pending:value=>{analysisPending=value?1:0;},queue:value=>{queuePending=value;},save:directController.saveDrawings,edit:directController.updateDrawingEdit,load:directController.loadDrawings,batches:templateBatches,manager:drawingManager,subscribe:callback=>{drawingSubscribers.add(callback);return()=>drawingSubscribers.delete(callback);},select:ids=>facade.select(ids),retire:()=>{currentSource={};},state:()=>({notifications,reconciliations,nativeEdited,drawingBatch,nativeDrawingReconciliationHold,analysisUnavailable})};`;
 const compiled=stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'});
 const host:{projection():SerializedDrawing[];pending(value:boolean):void;queue(value:boolean):void;save():Record<string,unknown>;load(doc:unknown):unknown;edit(id:string,patch:Record<string,unknown>,coordinates?:readonly DrawingCoordinatePatch[],priceOffset?:number,visibility?:DrawingIntervalVisibility):{accepted:true;changed:boolean};batches:ReturnType<typeof createDrawingTemplateBatches>;manager:ReturnType<typeof createDrawingManager>;subscribe(callback:DrawingSubscriber):()=>void;select(ids:string[]):void;retire():void;state():{notifications:number;reconciliations:number;nativeEdited:number;drawingBatch:number;nativeDrawingReconciliationHold:number;analysisUnavailable:string}}=new Function('return '+compiled)()({options,document,facade,native,createDrawingTemplateBatches,captureNativeDrawingLease,captureDrawingRuntimeState,visibility,inventory,knownTypes,createDrawingIdReservations,commitPortableDrawingBindings,publishDrawingSubscribers,createDrawingManager,DrawingManagerPublicationError,captureNativeDrawingProjection,readTrendlineAnnotation,assertNativeDrawingMatchesCanonical,patchDrawingEdit,validateDrawingVisibility,commitDrawingEdit,DrawingEditRecoveryError,attemptEveryCleanup,resolvePortableDrawingDocument,stampNewDrawings});host.select(rows.map(row=>row.id));return{native,document,rows,...host};}catch(error){native.dispose();throw error;}
}
