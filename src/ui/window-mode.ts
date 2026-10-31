import {useEffect,useRef,useState} from 'react';
import {layoutIsDirty,openedLayout,type LayoutLibrary} from './layout-library';
import type {MultiChartState} from './MultiChartGrid';

// "Open layout in new window", for a second monitor., no captured fact.
// The main window (primary) is the single writer of the workspace file and owns alerts, paper trading, watchlists,
// background feeds and the tray. A layout window (secondary) shows one saved layout with live charts. It loads the saved
// workspace read-only, runs no alerts, paper trading, watchlist or background feeds, and relays its layout saves to the
// main window through main (electron/windows.cjs). Main decides trust by the sending window, never by this page's URL;
// the query only tells the page which layout to show.

export type WindowMode={role:'primary'}|{role:'secondary';windowId:number;layoutId:string};
const LAYOUT_ID=/^[A-Za-z0-9_.:-]{1,200}$/;
/** `?window=<n>&layout=<id>` (main builds it, electron/windows.cjs secondaryURL); anything else is the main window. */
export function windowModeOf(search:unknown):WindowMode{
 if(typeof search!=='string'||!search)return{role:'primary'};
 let params:URLSearchParams;try{params=new URLSearchParams(search);}catch{return{role:'primary'};}
 const id=params.get('window'),layoutId=params.get('layout');
 if(!id||!/^[1-9][0-9]{0,8}$/.test(id)||!layoutId||!LAYOUT_ID.test(layoutId))return{role:'primary'};
 return{role:'secondary',windowId:Number(id),layoutId};
}
export function currentWindowMode():WindowMode{
 try{const search=(globalThis as {location?:{search?:unknown}}).location?.search;return windowModeOf(search);}catch{return{role:'primary'};}
}

export const SECONDARY_WINDOW_NOTICE='This window shows one layout. Alerts, paper trading and watchlists stay in the main window.';
export const SECONDARY_LAYOUT_REFUSAL='Manage layouts in the main window. This window shows one layout.';
export const SECONDARY_MISSING_LAYOUT='The layout of this window is no longer saved, so this window closes.';
export const ONLY_TAB_WINDOW_MESSAGE='Open another layout in this window first. A layout shows in one window at a time.';
export const AUTOSAVE_OFF_WINDOW_MESSAGE='Save this layout before opening it in a new window. Layout autosave is off.';
export const OPEN_ELSEWHERE_MESSAGE='That layout is open in another window.';
/** Dialogs that edit what the main window owns (alerts, paper trading, watchlists, layouts, the workspace file). */
export const PRIMARY_ONLY_DIALOGS:ReadonlySet<string>=new Set(['alerts','paper','order','list-alert','watch-advanced','notes','screener','layouts','import-layout','restore-workspace','storage','import']);
/** Right-rail panels of the main window only. */
export const PRIMARY_ONLY_PANELS:ReadonlySet<string>=new Set(['watchlist','alerts','paper','screener']);
/** Main menu rows kept in a layout window. */
const SECONDARY_MENU_LABELS:ReadonlySet<string>=new Set(['About OpenCandle','Export bars','Export image']);
export function secondaryMenu<T extends {label:string}>(items:ReadonlyArray<T|'separator'>):T[]{
 return items.filter((item):item is T=>item!=='separator'&&SECONDARY_MENU_LABELS.has(item.label));
}

/** The saved workspace as a layout window shows it: its layout open (null when that layout is no longer saved). */
export function secondaryWorkspace<W extends {layoutLibrary?:LayoutLibrary;grid?:MultiChartState}>(workspace:W,layoutId:string,project:(workspace:W,grid:MultiChartState)=>W):W|null{
 const book=workspace.layoutLibrary;if(!book||!book.entries.some(row=>row.id===layoutId))return null;
 if(book.activeId===layoutId&&workspace.grid)return workspace;
 const opened=openedLayout(book,layoutId);return project({...workspace,layoutLibrary:opened.library},opened.grid);
}
/** The main window takes a layout window's grid as that saved layout's new content. The full workspace validation runs
 * on the save that follows. The main window's own layout is never replaced from another window. */
export function replaceRelayedLayout(book:LayoutLibrary,layoutId:string,grid:unknown,now:number):LayoutLibrary{
 if(book.activeId===layoutId)throw new Error('This layout is open in the main window, so it was not saved from the other window.');
 const old=book.entries.find(row=>row.id===layoutId);if(!old)throw new Error('The layout of that window is no longer saved.');
 const value=grid as MultiChartState|null;
 if(!value||typeof value!=='object'||!value.layout||value.layout.id!==layoutId)throw new Error('The other window sent a different layout.');
 if(!Number.isSafeInteger(old.revision)||old.revision>=Number.MAX_SAFE_INTEGER)throw new Error('The layout revision cannot advance safely.');
 const copy=structuredClone(value);copy.layout={...copy.layout,name:old.name};
 const savedAt=Number.isSafeInteger(now)?Math.max(now,old.createdAt,old.savedAt):Math.max(old.createdAt,old.savedAt);
 return{...book,entries:book.entries.map(row=>row.id===layoutId?{...old,grid:copy,savedAt,revision:old.revision+1}:row)};
}

// Workspace-wide edits made in a layout window. These top-level workspace
// fields are not part of a layout and are not owned by a main-window-only feature. A layout window sends the ones it changed
// since it loaded (or since its last relayed save) with its layout save, and the main window takes them as its own before it
// writes the file. The last window to save a field wins. Everything else (the layout library, watchlists, list alerts, imports
// and the fields projected from the active chart, such as the theme, which is saved with the layout) stays with its owner.
// electron/windows.cjs SHARED_WORKSPACE_KEYS is the same list (a test keeps them equal).
export const SHARED_WORKSPACE_KEYS=Object.freeze(['chartSettings','drawingPreferences','drawingFavorites','indicatorTemplates','indicatorLibrary','scriptLibrary','intervals','liveData','appPreferences','chartTypeFavorites'] as const);
export type SharedWorkspaceKey=typeof SHARED_WORKSPACE_KEYS[number];
export type SharedWorkspace=Partial<Record<SharedWorkspaceKey,unknown>>;
const json=(value:unknown)=>value===undefined?undefined:JSON.stringify(value);
/** The workspace-wide fields as plain JSON (the baseline a layout window compares against). */
export function sharedWorkspaceOf(workspace:Record<string,unknown>):SharedWorkspace{
 const out:SharedWorkspace={};for(const key of SHARED_WORKSPACE_KEYS)if(workspace[key]!==undefined)out[key]=JSON.parse(JSON.stringify(workspace[key]));return out;
}
/** The workspace-wide fields that differ from the baseline (a removed field is not sent). null when none changed. */
export function sharedWorkspaceChanges(baseline:SharedWorkspace,workspace:Record<string,unknown>):SharedWorkspace|null{
 const now=sharedWorkspaceOf(workspace),out:SharedWorkspace={};let any=false;
 for(const key of SHARED_WORKSPACE_KEYS)if(now[key]!==undefined&&json(now[key])!==json(baseline[key])){out[key]=now[key];any=true;}
 return any?out:null;
}
/** The main window takes a layout window's workspace-wide changes. Only the listed fields; anything else is refused. The full
 * workspace validation runs on the save that follows. */
export function applySharedWorkspace<W extends Record<string,unknown>>(workspace:W,shared:unknown):W{
 if(shared===undefined||shared===null)return workspace;
 const refuse=()=>{throw new Error('The other window sent workspace settings this window does not take.');};
 if(typeof shared!=='object'||Array.isArray(shared))refuse();
 const keys=Object.keys(shared as object);if(keys.some(key=>!(SHARED_WORKSPACE_KEYS as readonly string[]).includes(key)))refuse();
 if(!keys.length)return workspace;
 const copy=structuredClone(shared) as Record<string,unknown>;return{...workspace,...copy};
}
type RelayBridge={saveLayoutFromWindow?(input:{layoutId:string;grid:Record<string,unknown>;shared?:SharedWorkspace}):Promise<{ok:true;value:{revision:number;savedAt:string}}|{ok:false;error:{code:string;message:string}}>};
/** A layout window's save: its layout's grid (plain JSON), and its workspace-wide changes, go to the main window through main. */
export async function relayLayoutSave(bridge:RelayBridge|undefined,layoutId:string,library:LayoutLibrary,shared?:SharedWorkspace|null){
 if(typeof bridge?.saveLayoutFromWindow!=='function')throw new Error('Saving from a layout window requires the desktop app.');
 const entry=library.entries.find(row=>row.id===layoutId);if(!entry)throw new Error('The layout of this window is no longer saved.');
 return bridge.saveLayoutFromWindow({layoutId,grid:JSON.parse(JSON.stringify(entry.grid)) as Record<string,unknown>,...(shared?{shared:JSON.parse(JSON.stringify(shared)) as SharedWorkspace}:{})});
}

/** With layout Autosave off, a layout window with unsaved layout edits asks before it closes. */
export function closeNeedsPrompt(mode:WindowMode,library:LayoutLibrary|undefined,grid:MultiChartState|undefined,discard:boolean):boolean{
 if(mode.role!=='secondary'||discard||!library||!grid||library.autosave)return false;
 if(library.activeId!==mode.layoutId)return false;
 try{return layoutIsDirty(library,grid);}catch{return false;}
}
export const CLOSE_PROMPT_TEXT='Save the changes to this layout before closing the window? Layout autosave is off.';

/** Shift+B or Shift+S in a layout window. The main window owns paper trading, so the
 * layout window sends the chart's instrument and current quote there, and the main window places the order (one-click with
 * an order preset) or opens its order ticket for that instrument. */
export interface RelayedPaperRequest{side:'buy'|'sell';instrument:{id:string;symbol:string;name:string;exchange:string;currency:string;assetClass:string;tickSize:number;lotSize:number;timezone:string};quote:Record<string,unknown>|null;quoteSource:{key:string;state:string};now:number}
const DATA_STATES=new Set(['ready','loading','stale','disconnected','unavailable','error']);
const text=(value:unknown,max=200)=>typeof value==='string'&&value.length>0&&value.length<=max;
export const RELAYED_PAPER_REFUSAL='The layout window sent a paper request this window does not take.';
/** The main window's check of a relayed paper request (main has already checked its keys and size). */
export function relayedPaperRequest(value:unknown):RelayedPaperRequest{
 const bad=():never=>{throw new Error(RELAYED_PAPER_REFUSAL);};
 if(!value||typeof value!=='object'||Array.isArray(value))bad();
 const row=value as Record<string,unknown>,instrument=row.instrument as Record<string,unknown>|null,quote=row.quote as Record<string,unknown>|null,source=row.quoteSource as Record<string,unknown>|null;
 if(row.side!=='buy'&&row.side!=='sell')bad();
 if(!instrument||typeof instrument!=='object'||!['id','symbol','exchange','currency','assetClass','timezone'].every(key=>text(instrument[key]))||typeof instrument.name!=='string')bad();
 for(const key of ['tickSize','lotSize']){const n=instrument![key];if(typeof n!=='number'||!Number.isFinite(n)||n<=0)bad();}
 if(quote!==null&&(typeof quote!=='object'||quote.instrumentId!==instrument!.id||typeof quote.bid!=='number'||typeof quote.ask!=='number'||!Number.isFinite(quote.bid)||!Number.isFinite(quote.ask)))bad();
 if(!source||typeof source!=='object'||!text(source.key,500)||typeof source.state!=='string'||!DATA_STATES.has(source.state))bad();
 if(typeof row.now!=='number'||!Number.isFinite(row.now)||row.now<0)bad();
 return structuredClone(row) as unknown as RelayedPaperRequest;
}

type PaperAnswer={ok:boolean;message:string;focus?:boolean};
type WindowBridge={onLayoutWindows?(handler:(value:{layoutIds:string[]})=>void):()=>void;onLayoutSaveRequest?(handler:(request:{layoutId:string;grid:unknown;shared?:unknown})=>Promise<{revision:number}>):()=>void;onPaperRequest?(handler:(request:unknown)=>Promise<PaperAnswer>):()=>void};
export interface WindowRelayOptions {
 mode:WindowMode;bridge:WindowBridge|undefined;
 /** Main window: saves a relayed layout (and its workspace-wide changes) through its own save path and returns the new file revision. */
 accept:(request:{layoutId:string;grid:unknown;shared?:unknown})=>Promise<{revision:number}>;
 /** Main window: a paper action asked for in a layout window (Shift+B or Shift+S). */
 paper?:(request:unknown)=>Promise<PaperAnswer>;
 /** Layout window: the layout name for the window title. */
 title:string|null;
}
/** Main window: answers relayed layout saves and tracks the layouts open in other windows. Layout window: its title. */
export function useWindowRelay(options:WindowRelayOptions):readonly string[]{
 const latest=useRef(options);latest.current=options;
 const [elsewhere,setElsewhere]=useState<readonly string[]>([]);
 const primary=options.mode.role==='primary';
 useEffect(()=>{
  const lv=latest.current.bridge;if(!primary||!lv)return;
  const offSave=typeof lv.onLayoutSaveRequest==='function'?lv.onLayoutSaveRequest(request=>latest.current.accept(request)):undefined;
  const offPaper=typeof lv.onPaperRequest==='function'?lv.onPaperRequest(async request=>{const handler=latest.current.paper;if(!handler)return{ok:false,message:'This window does not take paper actions from other windows.'};return handler(request);}):undefined;
  const offList=typeof lv.onLayoutWindows==='function'?lv.onLayoutWindows(value=>{const ids=Array.isArray(value?.layoutIds)?value.layoutIds.filter(id=>typeof id==='string'&&LAYOUT_ID.test(id)):[];setElsewhere(old=>old.length===ids.length&&old.every((id,index)=>id===ids[index])?old:ids);}):undefined;
  return()=>{offSave?.();offPaper?.();offList?.();};
 },[primary]);
 useEffect(()=>{if(!primary&&options.title&&typeof document!=='undefined')document.title=options.title+' - OpenCandle';},[primary,options.title]);
 return elsewhere;
}
