import type {LocalAlert} from './alerts';
import {alertDrawingIds} from './drawing-alert-links';

/** Display metadata only: deletion never changes a saved alert's lifecycle or captured source. */
export const DELETED_ALERT_DRAWING_NOTE='Drawing deleted. Undo to bring it back.';

/** A reader returning no rows has established that the drawing is absent. null/undefined means unknown, not deleted.
 * Recomputed from each supplied document, so Undo, Redo and restored layouts remove or restore the marker immediately.
 * Each instrument is read once. Reader failures leave its status unknown without hiding the saved alerts.
 */
export function invalidDrawingAlertNotes(alerts:readonly LocalAlert[],readDrawings:(instrumentId:string)=>readonly unknown[]|null|undefined,previous?:ReadonlyMap<string,string>):ReadonlyMap<string,string>{
 const instruments=new Map<string,Set<string>|null>(),notes=new Map<string,string>();
 for(const alert of alerts){
  const ids=alertDrawingIds(alert);if(!ids.length)continue;
  const instrumentId=alert.definition.instrumentId;
  if(!instruments.has(instrumentId)){
   let rows:readonly unknown[]|null|undefined;try{rows=readDrawings(instrumentId);}catch{rows=null;}
   instruments.set(instrumentId,Array.isArray(rows)?new Set(rows.flatMap(row=>row&&typeof row==='object'&&typeof (row as {id?:unknown}).id==='string'?[(row as {id:string}).id]:[])):null);
  }
  const present=instruments.get(instrumentId);if(present&&ids.some(id=>!present.has(id)))notes.set(alert.definition.id,DELETED_ALERT_DRAWING_NOTE);
 }
 if(previous&&previous.size===notes.size&&[...notes].every(([id,note])=>previous.get(id)===note))return previous;
 return notes;
}
