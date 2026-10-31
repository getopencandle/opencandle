import type {SerializedDrawing,Vela} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {captureNativeDrawingProjection} from '../../src/chart/drawing-native-projection';
import {readTrendlineAnnotation} from '../../src/chart/trendline-annotation-data';
import {installTrendlineAnnotation} from '../../src/chart/trendline-annotation';
import {nativeDrawingHarness} from './drawing-native-harness';
import {annotationNativeHarness} from './trendline-annotation-native-harness';
import {installNativeDrawingReset,type NativeDrawingResetPublication} from '../../src/chart/native-drawing-reset';
import {realVelaChart} from '../helpers/real-vela-chart';
import type {DerivedDrawingLens} from '../../src/chart/derived/derived-drawings';

/** Actual native opening/reset callback/render/emit/core/store/history bodies execute.
 * Popup DOM presentation and canvas commands are controlled; no mounted GUI claim. */
/** options.lens (additive): a derived chart; rows are source time, the renderer is fed and its intents return through the lens. */
export async function nativeResetHarness(rows:SerializedDrawing[],options:{lens?:DerivedDrawingLens;hostMap?:boolean}={}){
 const lens=options.lens;
 const core=await nativeDrawingHarness(),paint=await annotationNativeHarness(),document=new LosslessDrawingDocument(),knownTypes=new Set(rows.map(row=>row.type));let source={},disposed=false,latest:any=null,openHook:()=>void=()=>{},hold=0,dirty=false;
 const popup=Object.create({syncPanel(){},isOpen(){return latest!==null;},close(){latest=null;},contains(){return false;},open(drawings:any[],anchor:unknown,actions:any){openHook();latest={drawings,anchor,actions};}});
 paint.controller.popup=popup;paint.controller.popupMulti=false;
 const chart=(await realVelaChart({renderer:paint.renderer,core:core.controller})).chart,assertOwner=()=>{const expected=source;return()=>{if(disposed||source!==expected)throw Error('SYNTHETIC reset owner retired');};};
 const annotation=installTrendlineAnnotation(paint.renderer,chart as unknown as Vela,{captureOwner:assertOwner,unavailable:message=>diagnostics.push(message)}),diagnostics:string[]=[],intents:any[]=[];
 const selection=core.controller.port.setSelection;core.controller.port.setSelection=(ids:string[])=>{selection(ids);paint.controller.setSelection(ids);};
 core.controller.port.syncDrawings=(records:SerializedDrawing[])=>paint.sync(lens?records.map(record=>lens.toNativeRow(record)):records);
 paint.controller.intentCb=(intent:any)=>{intents.push(structuredClone(intent));const routed=lens?lens.intentToSource(intent):intent;if(routed)core.controller.onIntent(routed);};
 const reconcile=()=>{if(document.all().some(row=>row.type==='trendline'&&readTrendlineAnnotation(row.text).state==='supported')){const receipt=captureNativeDrawingProjection(chart.drawings,document,assertOwner());document.mergeRenderable(receipt.rows,knownTypes,false,new Set(),receipt.authority);}else document.mergeRenderable(core.controller.all(),knownTypes,false);};
 core.on('drawing:edited',()=>{if(hold){dirty=true;return;}reconcile();});
 try{document.load({version:1,drawings:rows});core.controller.fromJSON({version:1,drawings:rows});}catch(error){annotation.dispose();core.dispose();paint.dispose();throw error;}
 const publishOwned=(batch:NativeDrawingResetPublication)=>{
  batch.assertActionOwner();const lease=document.prepareOwnedEditBatch(batch.expected,batch.next);let canonicalOwner=()=>lease.assertCurrent(),accepted=false;
  hold++;try{lease.stage();const receipt=batch.forward(()=>canonicalOwner());receipt.assertValueOwner();const canonical=lease.accept();canonicalOwner=()=>canonical.assertCurrent();accepted=true;receipt.assertValueOwner();return receipt;}
  catch(error){if(!accepted){try{lease.assertCurrent();batch.assertActionOwner();const progress=batch.inspectProgress();if(progress.forwardStarted)diagnostics.push('SYNTHETIC Reset native publication may be partial; native history cannot be restored exactly');else{const restored=lease.rollback();canonicalOwner=()=>restored.assertCurrent();}}catch{/* A foreign document/source/session keeps its state and history. */}}throw error;}
  finally{hold--;dirty=false;}
 };
 let publish:(batch:NativeDrawingResetPublication)=>unknown=publishOwned,assertMutable=()=>{};
 const defaultPublish=publishOwned,reset=installNativeDrawingReset(paint.renderer,chart as unknown as Vela,{document,captureOwner:assertOwner,assertMutable:()=>assertMutable(),publish:batch=>{publish(batch);},unavailable:message=>diagnostics.push(message),...(lens&&options.hostMap!==false?{rendererRowToSource:(row:Record<string,unknown>)=>lens.toSourceRow(row)}:{})});
 return{core,paint,document,chart,popup,intents,diagnostics,reset,publishDefault:defaultPublish,captureOwner:assertOwner,setMutable(action:()=>void){assertMutable=action;},setPublish(action:(batch:NativeDrawingResetPublication)=>void){publish=action;},open(ids=rows.map(row=>row.id)){if(ids.length===1)paint.controller.openSettingsById(ids[0],0,0);else{core.controller.setSelection(ids);paint.controller.openSettingsForSelection(ids);}if(!latest)throw Error('SYNTHETIC native popup not opened');return latest;},latest:()=>latest,onOpen(action:()=>void){openHook=action;},retire(){source={};paint.retire();},dispose(){disposed=true;reset.dispose();annotation.dispose();core.dispose();paint.dispose();}};
}
