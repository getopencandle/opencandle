import type {SerializedDrawing,Vela} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {installDrawingCommandRouter,type DrawingCommandRouterHost,type DrawingDuplicateReceipt} from '../../src/chart/drawing-command-router';
import {installNativeDrawingReset,type NativeDrawingResetPublication} from '../../src/chart/native-drawing-reset';
import {installTrendlineAnnotation} from '../../src/chart/trendline-annotation';
import {nativeDrawingHarness} from './drawing-native-harness';
import {annotationNativeHarness,annotationRecord} from './trendline-annotation-native-harness';
import {realVelaChart} from '../helpers/real-vela-chart';

/** Original native facade/core/input/popup/render bodies, with controlled construction-only DOM services. */
export async function drawingRouterHarness(rows:SerializedDrawing[]=[annotationRecord()]){
 const native=await nativeDrawingHarness(),paint=await annotationNativeHarness(),real=await realVelaChart({renderer:paint.renderer,core:native.controller}),document=new LosslessDrawingDocument();
 const facade=real.facade,chart=real.chart as unknown as Record<string,any>;
 let source={},disposed=false,latest:any=null,openHook=()=>{},closeHook=()=>{},mutable=()=>{},duplicateHook:DrawingCommandRouterHost['duplicate']|undefined,historyHook:DrawingCommandRouterHost['history']|undefined;
 const calls:readonly string[][]=[],duplicates=calls as string[][],histories:string[]=[],intents:any[]=[],diagnostics:string[]=[];
 const popup=Object.create({syncPanel(){},contains(){return false;},isOpen(){return latest!==null;},close(){closeHook();latest=null;},open(drawings:any[],anchor:unknown,actions:any){openHook();latest={drawings,anchor,actions};}});
 paint.controller.popup=popup;paint.controller.popupMulti=false;paint.controller.historyChords=true;paint.controller.measureMode=false;paint.controller.eraserMode=false;
 const selection=native.controller.port.setSelection;native.controller.port.setSelection=(ids:string[])=>{selection(ids);paint.controller.setSelection(ids);};
 native.controller.port.syncDrawings=(records:SerializedDrawing[])=>paint.sync(records);
 paint.controller.intentCb=function(intent:any){intents.push(intent);native.controller.onIntent(intent);};
 const captureOwner=()=>{const expected=source;return()=>{if(disposed||source!==expected)throw Error('SYNTHETIC router source retired');};};
 const annotation=installTrendlineAnnotation(paint.renderer,chart as unknown as Vela,{captureOwner,unavailable:message=>diagnostics.push(message)});
 document.load({version:1,drawings:rows});native.controller.fromJSON({version:1,drawings:rows});
 const receipt=(ids:readonly string[]):DrawingDuplicateReceipt=>Object.freeze({ids:Object.freeze([...ids]),nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});
 const host:DrawingCommandRouterHost={captureOwner,assertMutable(){mutable();},duplicate(ids,assert){assert();duplicates.push([...ids]);return duplicateHook?duplicateHook(ids,assert):receipt(ids);},history(direction,assert){assert();histories.push(direction);historyHook?.(direction,assert);},historyStatus(){return{canUndo:true,canRedo:false};}};
 const router=installDrawingCommandRouter(paint.renderer,chart as unknown as Vela,host);
 const publish=(batch:NativeDrawingResetPublication)=>{const lease=document.prepareOwnedEditBatch(batch.expected,batch.next);let current=()=>lease.assertCurrent();lease.stage();const native=batch.forward(()=>current());native.assertValueOwner();const accepted=lease.accept();current=()=>accepted.assertCurrent();native.assertValueOwner();};
 const reset=installNativeDrawingReset(paint.renderer,chart as unknown as Vela,{document,captureOwner,assertMutable(){mutable();},publish,unavailable:message=>diagnostics.push(message),duplicatePopup:router.popupPort});
 return{native,paint,facade,chart,setFacade:real.setFacade,document,router,reset,host,popup,duplicates,histories,intents,diagnostics,receipt,captureOwner,
  open(ids=rows.map(row=>row.id)){if(ids.length===1)paint.controller.openSettingsById(ids[0],0,0);else{native.controller.setSelection(ids);paint.controller.openSettingsForSelection(ids);}if(!latest)throw Error('SYNTHETIC popup not opened');return latest;},
  latest:()=>latest,onOpen(action:()=>void){openHook=action;},onClose(action:()=>void){closeHook=action;},setMutable(action:()=>void){mutable=action;},setDuplicate(action:DrawingCommandRouterHost['duplicate']){duplicateHook=action;},setHistory(action:DrawingCommandRouterHost['history']){historyHook=action;},retire(){source={};paint.retire();},
  dispose(){disposed=true;const errors:unknown[]=[];for(const release of [()=>reset.dispose(),()=>router.dispose(),()=>annotation.dispose(),()=>native.dispose(),()=>paint.dispose()])try{release();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'SYNTHETIC router cleanup failed');}};
}
