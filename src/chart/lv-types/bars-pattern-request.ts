// Staged re-sample results for the Bars pattern source-resolution setting.
//
// The dialog and the floating-toolbar chip compute a preview off-canvas (they hold the datasets), stage it here, and Apply
// sends only the small token through the ordinary drawing-settings path (field `lvBarsPatternSource`, one canonical record
// change = one history step). The model's setter swaps in the staged member, and only when the drawing still holds the exact
// payload the preview was computed from. Undo/redo restore whole records from history, so nothing here is consulted again
// and nothing is re-fetched. A token that is unknown or stale is refused and the drawing is unchanged.
import {barsPatternFingerprint,type BarsPatternMember} from './bars-pattern-data';

const LIMIT=6;
const staged=new Map<string,{readonly basis:string;member:BarsPatternMember|null}>();
/** A token for a preview that is still loading (a span fetch for the Interval setting). Apply refuses it until `resolve`
 *  supplies the member; the dialog keeps Apply disabled meanwhile. */
export function stagePendingBarsPatternRequest(current:BarsPatternMember|null):{readonly token:string;resolve(next:BarsPatternMember):void}{
 const token='lvbp:'+(++counter)+':'+barsPatternFingerprint(current),entry={basis:barsPatternFingerprint(current),member:null as BarsPatternMember|null};
 staged.set(token,entry);while(staged.size>LIMIT)staged.delete(staged.keys().next().value!);
 return{token,resolve:next=>{entry.member=next;}};
}
let counter=0;

/** Stages `next` as the replacement of `current` and returns the Apply token. Keeps the most recent few previews only. */
export function stageBarsPatternRequest(current:BarsPatternMember|null,next:BarsPatternMember):string{
 const token='lvbp:'+(++counter)+':'+barsPatternFingerprint(next);
 staged.set(token,{basis:barsPatternFingerprint(current),member:next});
 while(staged.size>LIMIT)staged.delete(staged.keys().next().value!);
 return token;
}
/** The staged member for `token` when it was computed from `current`; throws a user-facing message otherwise. */
export function takeStagedBarsPatternRequest(token:string,current:BarsPatternMember|null):BarsPatternMember{
 const entry=staged.get(token);
 if(!entry)throw Error('This interval preview is no longer available. Choose the interval again.');
 if(entry.basis!==barsPatternFingerprint(current))throw Error('The pattern changed after the preview. Choose the interval again.');
 if(!entry.member)throw Error('The bars for this interval are still loading. Apply again when they are ready.');
 return entry.member;
}
export const isBarsPatternRequestToken=(value:unknown):value is string=>typeof value==='string'&&/^lvbp:\d+:[0-9a-f]{16}$/.test(value);
/** Test and lifecycle helper: drops every staged preview. */
export function clearStagedBarsPatternRequests():void{staged.clear();}
