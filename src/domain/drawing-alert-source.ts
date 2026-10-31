// Evaluation of version 2 drawing alert sources, and the alert lifecycle that follows
// the drawing.
// Mutation policy 'follow' (new alerts, after the reference: the alert follows its drawing):
//  - the drawing is looked up in the drawings the caller supplies (the chart's own document, plus the saved workspace);
//  - unchanged drawing (same drawing key): the geometry captured at creation is used, on a grid shifted by whole bars if the feed
//    starts elsewhere (as version 1 does);
//  - moved or edited drawing: its current geometry is captured on the current information grid;
//  - deleted drawing: no value, with a diagnostic; when the drawing comes back (Undo) the alert reads it again;
//  - no drawings supplied (an evaluation that cannot see the workspace): the creation geometry, as 'frozen'.
// Mutation policy 'frozen' keeps the version 1 meaning: the creation geometry only.
// When a watched drawing moves, the alert restarts (followDrawingAlerts): new revision, cleared baselines, history kept, as a
// Long/Short position alert does when its levels move. A paused alert stays paused. So moving a line across the price never
// fires the alert by itself.
import type {Bar} from './types';
import type {AlertOperandValue,AlertScalarSource,AlertSourceSnapshot} from './alert-observation';
import {editLocalAlert,setLocalAlertPaused,type LocalAlert} from './alerts';
import {drawingAlertKey,evaluateDrawingAlertShape,type DrawingAlertShapeSnapshot} from '../chart/drawing-alert-shapes';
import type {PreparedDrawingBoundaryGrid} from '../chart/drawing-alert-geometry';
import {drawingOperand} from './drawing-alert-rules';

type BoundarySource=Extract<AlertScalarSource,{kind:'drawing-boundary'}>;
export interface DrawingAlertEvaluation {operand:AlertOperandValue;diagnostics:string[]}
export interface DrawingAlertEvaluationContext {
 prefix:readonly Bar[];
 /** The prepared grid of this prefix (null when it could not be prepared; the shapes needing it then refuse). */
 grid:PreparedDrawingBoundaryGrid|null;
 sourceBasis:string|undefined;
 /** The drawings of this symbol the caller can see, as saved (anchor times in milliseconds). Absent: not supplied. */
 drawings:readonly unknown[]|null|undefined;
 currency:string;
 label:string;
 /** Heikin Ashi rows of the same prefix, built once by the caller. */
 heikinAshi:()=>readonly Bar[];
}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const DRAWING_DELETED_DIAGNOSTIC='The drawing this alert watches was deleted. Undo the deletion to bring it back, or delete the alert.';

/** Find a drawing by id in supplied rows (the first row of an id wins). */
function findDrawing(rows:readonly unknown[],id:string):Record<string,unknown>|null{for(const row of rows)if(record(row)&&String(row.id)===id)return row;return null;}

export function evaluateDrawingAlertSource(source:BoundarySource,context:DrawingAlertEvaluationContext):DrawingAlertEvaluation{
 const created=source.geometry as DrawingAlertShapeSnapshot,last=context.prefix[context.prefix.length-1];
 const unit=created.shape==='channel'?'place in the channel (0 lower line, 1 upper line)':created.shape==='levels'?'Fib ratio in the channel (0 base line, 1 offset line)':created.shape==='time'?'seconds from the vertical line':context.currency;
 const result=(value:number|null,basis:string,diagnostics:string[],plots?:AlertOperandValue['plots']):DrawingAlertEvaluation=>({operand:{value:value!==null&&Number.isFinite(value)?value:null,unit,basis,label:context.label,...(plots?{plots}:{})},diagnostics});
 const follows=source.mutationPolicy==='follow';
 if(created.sourceBasis!==context.sourceBasis)return result(null,'Drawing geometry',['Captured drawing belongs to another exact source basis.']);
 let geometry=created,moved=false,current=false;
 if(follows&&Array.isArray(context.drawings)){
  const live=findDrawing(context.drawings,created.drawingId);
  if(!live)return result(null,'Follows the drawing',[DRAWING_DELETED_DIAGNOSTIC]);
  if(live.type!==created.tool)return result(null,'Follows the drawing',[`The drawing is no longer a ${created.name}. Make the alert again from the drawing.`]);
  let key:string|null=null;try{key=drawingAlertKey(live);}catch(error){return result(null,'Follows the drawing',[error instanceof Error?error.message:String(error)]);}
  // The drawing as it is now, on this information grid (so an anchor after the last bar sits where the chart paints it). When
  // that is not possible (an anchor before a shorter feed's first bar), an unchanged drawing keeps its creation geometry.
  if(created.shape==='time'){if(key!==created.drawingKey){const anchors=live.anchors as Array<{time:number}>;geometry={...created,lineTime:anchors[0].time/1000};moved=true;}}
  else{
   const captured=context.grid?context.grid.captureShape(live,{scale:created.coordinateModel==='logical-bar-log-price'?'logarithmic':'linear',shape:created.shape,...(created.tool==='regressionchannel'?{calculationTransform:created.transform}:{})}):{ok:false as const,diagnostics:['Drawing grid is unavailable.']};
   if(captured.ok){geometry=captured.snapshot;current=true;moved=key!==created.drawingKey;}
   else if(key!==created.drawingKey||created.tool==='regressionchannel')return result(null,'Follows the drawing',captured.diagnostics);
  }
 }
 const basis=follows?(moved?'Follows the drawing: its current position':'Follows the drawing: unchanged since the alert was made'):'Frozen drawing geometry';
 const model=geometry.coordinateModel==='logical-bar-log-price'?' in log price':'';
 if(geometry.shape==='time'){const value=last.time-geometry.lineTime!;return result(value,basis,[]);}
 if(geometry.tool==='regressionchannel'&&last.time<geometry.anchors[1].time)return result(null,basis,['This observation precedes the final bar used to fit the captured Regression trend.']);
 // The whole-bar shift of a later feed (see technical-alerts.ts): every anchor must sit the same whole number of bars later.
 let shift=0;
 if(!current&&!moved&&geometry.anchors.length){
  if(!context.grid)return result(null,basis,['Drawing grid is unavailable.']);
  const shifts=geometry.anchors.map(anchor=>{const position=context.grid!.logicalPosition(anchor.time);return position===null?null:position-anchor.logical;});
  const first=shifts[0];
  if(first===null||first===undefined||!Number.isInteger(first)||shifts.some(value=>value!==first))return result(null,basis,['The captured drawing time grid changed or an anchor is beyond this prefix. Recapture its geometry explicitly.']);
  shift=first;
 }
 const value=evaluateDrawingAlertShape(geometry,context.prefix.length-1-shift);
 if(!value.ok)return result(null,basis+model,value.diagnostics);
 if(value.shape==='line')return result(value.price,basis+model,[]);
 if(value.shape==='levels'){
  // The close's Fib ratio between the ratio 0 and ratio 1 lines, in the drawn coordinate (log price on a log
  // scale), so a crossing of ratio r is the close crossing the level r line as painted.
  const log=geometry.coordinateModel==='logical-bar-log-price',close=(geometry.transform==='heikinashi'?context.heikinAshi():context.prefix)[context.prefix.length-1]?.close;
  const plots=[{id:'zero',title:'Level 0 line',value:value.zero},{id:'one',title:'Level 1 line',value:value.one},{id:'price',title:geometry.transform==='heikinashi'?'Close (Heikin Ashi)':'Close',value:Number.isFinite(close)?close:null}];
  if(!Number.isFinite(close)||log&&!(close>0))return result(null,basis+model,['The endpoint bar has no usable close.'],plots);
  const y=(price:number)=>log?Math.log(price):price,height=y(value.one)-y(value.zero);
  if(!(Math.abs(height)>0))return result(null,basis+model,['The channel has no height at this bar.'],plots);
  return result((y(close)-y(value.zero))/height,basis+model,[],plots);
 }
 const close=(geometry.transform==='heikinashi'?context.heikinAshi():context.prefix)[context.prefix.length-1]?.close;
 const plots=[{id:'lower',title:'Lower line',value:value.lower},{id:'upper',title:'Upper line',value:value.upper},{id:'price',title:geometry.transform==='heikinashi'?'Close (Heikin Ashi)':'Close',value:Number.isFinite(close)?close:null}];
 if(!Number.isFinite(close))return result(null,basis+model,['The endpoint bar has no usable close.'],plots);
 if(!(value.upper>value.lower))return result(null,basis+model,['The channel has no height at this bar.'],plots);
 return result((close-value.lower)/(value.upper-value.lower),basis+model,[],plots);
}

/** Alerts that need the drawings supplied to their evaluation (the older 'drawing' kind, and drawings followed by version 2). */
export function alertsWatchDrawings(alerts:readonly LocalAlert[]):boolean{
 return alerts.some(alert=>{const source=alert.definition.observationBinding?.source;if(!source)return false;
  const sides=source.kind==='comparison'?[source.left,source.right]:[source];
  return sides.some(side=>side.kind==='drawing'||side.kind==='drawing-boundary'&&side.mutationPolicy==='follow');});
}

export interface DrawingFollowResult {alerts:LocalAlert[];restarted:string[]}
/**
 * The restart half of 'follow': remembers each followed drawing's key per alert and restarts the alert when the key changes
 * (moved, resized, extension changed, or Undo/Redo of such an edit). The first sight of an alert only records its key. A drawing
 * that is missing is left alone (the evaluation reports it). Stopped and expired alerts are left alone. Returns the same array
 * when nothing restarts. The keys are kept for the session only; a restart needs the drawing seen before and after.
 */
export class DrawingAlertFollow{
 private keys=new Map<string,string>();
 follow(alerts:LocalAlert[],drawings:readonly unknown[],now:number):DrawingFollowResult{
  const rows=new Map<string,Record<string,unknown>>();for(const row of drawings)if(record(row)&&!rows.has(String(row.id)))rows.set(String(row.id),row);
  const restarted:string[]=[],seen=new Set<string>();let changed=false;
  const next=alerts.map(alert=>{
   const operand=drawingOperand(alert.definition.observationBinding?.source as AlertSourceSnapshot|undefined);
   if(!operand||operand.kind!=='drawing-boundary'||operand.mutationPolicy!=='follow')return alert;
   const id=alert.definition.id,live=rows.get((operand.geometry as DrawingAlertShapeSnapshot).drawingId);seen.add(id);
   if(!live)return alert;
   let key:string;try{key=drawingAlertKey(live);}catch{return alert;}
   const before=this.keys.get(id)??key;this.keys.set(id,key);
   if(before===key||!['active','paused','waiting-for-data'].includes(alert.status)||alert.definition.expiresAt!==null&&alert.definition.expiresAt<=now)return alert;
   try{let restartedAlert=editLocalAlert(alert,{condition:structuredClone(alert.definition.condition)},now);if(alert.status==='paused')restartedAlert=setLocalAlertPaused(restartedAlert,true);changed=true;restarted.push(id);return restartedAlert;}
   catch{return alert;}
  });
  for(const id of this.keys.keys())if(!seen.has(id))this.keys.delete(id);
  return{alerts:changed?next:alerts,restarted};
 }
}
