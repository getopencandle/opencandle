import {invalidDrawingAlertNotes} from '../domain/alert-drawing-status';
import type {LocalAlert} from '../domain/alerts';

const notesByOwner=new WeakMap<object,ReadonlyMap<string,string>>();
/** Read the current document on every render. Reuse only an equal result, never the source rows or their identity. */
export function alertDrawingNotesForOwner(owner:object,alerts:readonly LocalAlert[],readDrawings:(instrumentId:string)=>readonly unknown[]|null|undefined):ReadonlyMap<string,string>{
 const next=invalidDrawingAlertNotes(alerts,readDrawings,notesByOwner.get(owner));notesByOwner.set(owner,next);return next;
}
