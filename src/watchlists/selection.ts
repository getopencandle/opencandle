/**
 * Row selection policy for the watchlist table. selected[0] is always the focused row, which drives details,
 * Enter, Source and single-row moves. The anchor is the last plain or Ctrl/Cmd-clicked row and is the fixed
 * end of Shift ranges. Ranges cover visible symbol rows only (collapsed members and section headers are skipped).
 * This is a local LV policy; the reference application's exact multi-selection rules are not documented.
 */
export interface WatchSelection {selected:string[];anchor:string|null}
export const emptyWatchSelection=():WatchSelection=>({selected:[],anchor:null});
function range(ids:readonly string[],from:string,to:string):string[]|null{const a=ids.indexOf(from),b=ids.indexOf(to);return a<0||b<0?null:ids.slice(Math.min(a,b),Math.max(a,b)+1);}
/** Combined selections hold only the given visible symbol IDs, so a section heading or hidden row is never carried into a batch. */
function focusFirst(focus:string,members:readonly string[],ids:readonly string[]):string[]{const set=new Set(members);set.delete(focus);return [focus,...ids.filter(id=>set.has(id))];}
export function selectWatchClick(state:WatchSelection,ids:readonly string[],id:string,modifiers:{ctrl?:boolean;shift?:boolean}):WatchSelection{
 if(modifiers.shift){const anchor=state.anchor&&ids.includes(state.anchor)?state.anchor:state.selected.find(item=>ids.includes(item))??id,span=range(ids,anchor,id);if(span)return{selected:focusFirst(id,modifiers.ctrl?[...state.selected,...span]:span,ids),anchor};}
 if(modifiers.ctrl){if(state.selected.includes(id)){const rest=state.selected.filter(item=>item!==id);return{selected:rest,anchor:id};}return{selected:focusFirst(id,state.selected,ids),anchor:id};}
 return{selected:[id],anchor:id};
}
/** Arrow/Home/End move focus; Shift extends from the anchor; Ctrl/Cmd+A selects every visible symbol. Null means not handled. */
export function selectWatchKey(state:WatchSelection,ids:readonly string[],key:string,modifiers:{shift?:boolean;ctrl?:boolean}):WatchSelection|null{
 if(!ids.length)return null;
 if(modifiers.ctrl&&!modifiers.shift&&key.toLowerCase()==='a'){const focus=state.selected.find(id=>ids.includes(id))??ids[0];return{selected:focusFirst(focus,ids,ids),anchor:state.anchor??focus};}
 if(modifiers.ctrl||!['ArrowDown','ArrowUp','Home','End'].includes(key))return null;
 const index=ids.indexOf(state.selected[0]),next=key==='Home'?0:key==='End'?ids.length-1:Math.max(0,Math.min(ids.length-1,index+(key==='ArrowDown'?1:-1))),target=ids[next];
 if(modifiers.shift){const anchor=state.anchor&&ids.includes(state.anchor)?state.anchor:index>=0?ids[index]:target;return{selected:focusFirst(target,range(ids,anchor,target)!,ids),anchor};}
 return{selected:[target],anchor:target};
}
/** Drop IDs that no longer exist so stale rows can never be acted on. Returns the same object when nothing changed. */
export function pruneWatchSelection(state:WatchSelection,existing:ReadonlySet<string>):WatchSelection{const selected=state.selected.filter(id=>existing.has(id)),anchor=state.anchor&&existing.has(state.anchor)?state.anchor:null;return selected.length===state.selected.length&&anchor===state.anchor?state:{selected,anchor};}
