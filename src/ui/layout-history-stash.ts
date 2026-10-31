// Per-layout chart Undo for layout tabs.
// Before, opening a layout (a tab switch is one) cleared chart Undo. Now the history of the layout
// being left is kept for this session, and the layout being opened gets back the history it had when it was left.
// History entries restore only the chart grid of their own layout (historicalChartWorkspace refuses another layout), so
// a kept entry can never change another tab or any global state. Reopening the layout that is already open still starts
// over, as before (its saved version replaces the in-memory one). Kept for the four most recently left layouts.
export const KEPT_LAYOUT_HISTORIES=4;
type HistoryRef<H>={current:H};
const stashes=new WeakMap<object,Map<string,unknown>>();
function stashOf<H>(ref:HistoryRef<H>):Map<string,H>{let stash=stashes.get(ref);if(!stash){stash=new Map();stashes.set(ref,stash);}return stash as Map<string,H>;}
/** Keeps ref.current for `leaving` and makes the kept history of `opening` (or a new one) current. */
export function switchLayoutHistory<H extends {clear():void}>(ref:HistoryRef<H>,leaving:string,opening:string,create:()=>H):void{
 const stash=stashOf(ref);
 if(leaving===opening){ref.current.clear();return;}
 stash.delete(leaving);stash.set(leaving,ref.current);
 const kept=stash.get(opening);stash.delete(opening);
 while(stash.size>KEPT_LAYOUT_HISTORIES)stash.delete(stash.keys().next().value!);
 ref.current=kept??create();
}
/** A deleted layout's kept history goes with it. */
export function forgetLayoutHistory(ref:HistoryRef<unknown>,layoutId:string):void{stashes.get(ref)?.delete(layoutId);}
/** Workspace reset or restore: every kept history goes. */
export function forgetLayoutHistories(ref:HistoryRef<unknown>):void{stashes.get(ref)?.clear();}
/** Test support: the layouts that keep a history. */
export function keptLayoutHistories(ref:HistoryRef<unknown>):string[]{return [...(stashes.get(ref)?.keys()??[])];}
