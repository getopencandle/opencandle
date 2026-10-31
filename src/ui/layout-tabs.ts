import {LAYOUT_LIBRARY_LIMIT,type LayoutLibrary,type SavedLayout} from './layout-library';
import type {MultiChartState} from './MultiChartGrid';
import {ONLY_TAB_WINDOW_MESSAGE} from './window-mode';

// Open layouts show as tabs above the header, with a "+" new tab
// (a 34px strip, #1f1f1f, label "<symbol> ... / <layout name>").
// A tab is a saved layout of the existing layout library; the active tab is always the library's active layout, so the
// workspace file keeps persisting the active choice and each tab's charts, drawings and indicators live in its library
// entry. Which layouts are open as tabs, and their order, is a per-computer view preference kept in local storage
// like the recent-symbol list. Closing a tab never deletes its layout.

/** The local-storage key of the open tab list. */
export const LAYOUT_TABS_STORAGE_KEY='lv.layout-tabs.v1';
/** A new tab opens an "Unnamed" layout. */
export const NEW_TAB_LAYOUT_NAME='Unnamed';
/** How a change of the active layout lands in the tab list. 'replace': the layout opened in the current tab (layout
 * menu, Open layout dialog). 'insert': a new tab after the current one. */
export type TabPlacement='replace'|'insert';

const unique=(ids:readonly string[])=>[...new Set(ids)];
/** The open tabs after the library changed: unknown (deleted) layouts drop out, and the active layout is always a tab.
 * previousActiveId is the layout that was active before; when the new active layout is not a tab yet it takes that
 * tab's place ('replace') or opens right after it ('insert'). */
export function reconcileLayoutTabs(open:readonly string[],library:Pick<LayoutLibrary,'activeId'|'entries'>,previousActiveId:string|null=null,placement:TabPlacement='replace'):string[]{
 const known=new Set(library.entries.map(row=>row.id)),active=library.activeId;let tabs=unique(open);
 if(!tabs.includes(active)){
  const at=previousActiveId===null?-1:tabs.indexOf(previousActiveId);
  if(at<0)tabs=[...tabs,active];
  else if(placement==='insert')tabs=[...tabs.slice(0,at+1),active,...tabs.slice(at+1)];
  else tabs=[...tabs.slice(0,at),active,...tabs.slice(at+1)];
 }
 tabs=tabs.filter(id=>known.has(id));
 return tabs.length?tabs.slice(0,LAYOUT_LIBRARY_LIMIT):[active];
}
/** Drag to reorder: the dragged tab takes the target tab's place (dropping right of it when it came from the left). */
export function moveLayoutTab(open:readonly string[],fromId:string,toId:string):string[]{
 const from=open.indexOf(fromId),to=open.indexOf(toId);if(from<0||to<0||from===to)return [...open];
 const next=open.filter(id=>id!==fromId);next.splice(to,0,fromId);return next;
}
/** The tab that becomes active when `id` closes: the next one to the right, else the one to the left (the
 * browser convention). null when the closed tab is not the active one or is the last tab (the last tab cannot close). */
export function closingTabSuccessor(open:readonly string[],id:string,activeId:string):string|null{
 if(id!==activeId||open.length<2)return null;const at=open.indexOf(id);if(at<0)return null;
 return open[at+1]??open[at-1]??null;
}
export function canCloseLayoutTab(open:readonly string[],id:string):boolean{return open.length>1&&open.includes(id);}
export function closeLayoutTab(open:readonly string[],id:string):string[]{return canCloseLayoutTab(open,id)?open.filter(row=>row!==id):[...open];}
/** The tabs of this window without the layouts open in other windows (a layout shows in one window at a time).
 * The active layout always keeps its tab. */
export function withoutElsewhere(open:readonly string[],elsewhere:readonly string[],activeId:string):string[]{
 const tabs=open.filter(id=>id===activeId||!elsewhere.includes(id));return tabs.length?tabs:[activeId];
}
/** Open layout in new window. The active tab first hands over to its close successor (right, else left); the
 * only tab cannot move (this window would have no layout). null: the tab is not the active one, so nothing switches. */
export function windowTabSuccessor(open:readonly string[],id:string,activeId:string):string|null{
 if(id!==activeId)return null;const next=closingTabSuccessor(open,id,activeId);if(!next)throw new Error(ONLY_TAB_WINDOW_MESSAGE);return next;
}
/** Ctrl+Tab and Ctrl+Shift+Tab: the neighbouring tab, wrapping round. */
export function cycleLayoutTab(open:readonly string[],activeId:string,step:1|-1):string|null{
 if(open.length<2)return null;const at=open.indexOf(activeId);if(at<0)return open[0];return open[(at+step+open.length)%open.length];
}
/** The tab label: the symbol of the layout's selected chart, then the layout name (the reference reads
 * "GME ▲ 28.02 +3.2% / Unnamed"; the quote part is left out, since inactive tabs have no open feed). */
export function layoutTabLabel(entry:Pick<SavedLayout,'name'|'grid'>,working?:MultiChartState):{symbol:string;name:string}{
 const grid=working??entry.grid,active=grid.layout.cells.find(row=>row.id===grid.layout.activeCellId);
 return{symbol:active?.symbol??'',name:entry.name};
}

interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void}
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value);
/** The stored open-tab list, or null when there is none or it is unusable (never throws: storage can be blocked). */
export function readLayoutTabs(storage:StorageLike|null):string[]|null{
 try{
  const text=storage?.getItem(LAYOUT_TABS_STORAGE_KEY);if(!text||text.length>64*1024)return null;
  const value=JSON.parse(text) as unknown;if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const row=value as {schemaVersion?:unknown;open?:unknown};
  if(row.schemaVersion!==1||!Array.isArray(row.open)||!row.open.length||row.open.length>LAYOUT_LIBRARY_LIMIT||!row.open.every(identifier))return null;
  return unique(row.open as string[]);
 }catch{return null;}
}
export function writeLayoutTabs(storage:StorageLike|null,open:readonly string[]):boolean{
 try{if(!storage)return false;storage.setItem(LAYOUT_TABS_STORAGE_KEY,JSON.stringify({schemaVersion:1,open:unique(open).slice(0,LAYOUT_LIBRARY_LIMIT)}));return true;}catch{return false;}
}

/** The active tab reads the active chart's ticker and its daily change, e.g. "GME  -5.04%".
 * Green when up, red when down, neutral at 0. With no change known the tab shows the ticker only. */
export interface LayoutTabQuote {symbol:string;changePercent:number|null;last?:number|null;/** The formatted last price. */priceText?:string|null}
export function layoutTabChange(changePercent:number|null|undefined):{text:string;tone:'up'|'down'|'flat'}|null{
 if(typeof changePercent!=='number'||!Number.isFinite(changePercent))return null;
 const rounded=Math.round(changePercent*100)/100;
 if(rounded===0)return{text:'0.00%',tone:'flat'};
 return{text:(rounded>0?'+':'-')+Math.abs(rounded).toFixed(2)+'%',tone:rounded>0?'up':'down'};
}
