/**
 * The tabbed bottom panel of the chart area.
 *
 * The script editor, Strategy tester and trading panel dock as tabs of one resizable bottom panel. The tab set, the
 * labels, the sizes and the behaviour below are our own choice. Replay trading is not a separate tab: the Trading panel shows the replay virtual
 * account while replay runs (the paper dock already did). No keyboard shortcut is cited, so none is bound.
 *
 * Saved per layout under the workspace field `bottomPanel` (schema step 1): the open tab, whether the panel is expanded,
 * and its height. Absent means the defaults, so a workspace without the field round-trips unchanged. Maximize is per
 * session and never saved, so a launch always shows the chart.
 */
export type BottomPanelTab='script'|'strategy'|'trading'|'tables';
export const SCRIPT_TABLES_TAB=Object.freeze({id:'tables' as const,label:'Tables',title:'Tables from the selected local script'});
export const BOTTOM_PANEL_TABS:readonly {readonly id:BottomPanelTab;readonly label:string;readonly title:string}[]=Object.freeze([
 Object.freeze({id:'script' as const,label:'Script editor',title:'Edit and run local CandleScript indicators and strategies'}),
 Object.freeze({id:'strategy' as const,label:'Strategy tester',title:'The report of the last strategy run on this chart'}),
 Object.freeze({id:'trading' as const,label:'Trading panel',title:'Paper trading with virtual money'}),
]);
export interface BottomPanelView {open:boolean;tab:BottomPanelTab;height:number}
export interface BottomPanelBook {schemaVersion:1;layouts:Record<string,BottomPanelView>}
/** Saved heights, in CSS pixels. The rendered height is also capped by the chart area (BOTTOM_PANEL_CHART_RESERVE). */
export const BOTTOM_PANEL_MIN_HEIGHT=120,BOTTOM_PANEL_MAX_HEIGHT=4000,BOTTOM_PANEL_DEFAULT_HEIGHT=320;
/** The chart keeps at least this many pixels above an expanded, not maximized panel. */
export const BOTTOM_PANEL_CHART_RESERVE=96;
/** Arrow keys on the resize handle move it by this many pixels (PageUp/PageDown by four steps). */
export const BOTTOM_PANEL_KEY_STEP=24;
/** One entry per saved layout at most; the layout library holds 128. */
export const BOTTOM_PANEL_LAYOUT_LIMIT=128;
export const BOTTOM_PANEL_DEFAULT:Readonly<BottomPanelView>=Object.freeze({open:false,tab:'script',height:BOTTOM_PANEL_DEFAULT_HEIGHT});
const TAB_IDS=[...BOTTOM_PANEL_TABS.map(row=>row.id),'tables'] as readonly string[];
const fail=(message:string):never=>{throw new Error(message);};
const layoutKey=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value);
function plain(value:unknown,keys:readonly string[],label:string):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('Invalid '+label+'.');
 const own=Reflect.ownKeys(value as object);if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))fail('Unsupported '+label+' fields.');
 for(const key of own){const field=Object.getOwnPropertyDescriptor(value,key)!;if(!field.enumerable||!Object.hasOwn(field,'value'))fail('Invalid '+label+' property.');}
}
export function clampBottomPanelHeight(height:number):number{
 if(!Number.isFinite(height))return BOTTOM_PANEL_DEFAULT_HEIGHT;
 return Math.min(BOTTOM_PANEL_MAX_HEIGHT,Math.max(BOTTOM_PANEL_MIN_HEIGHT,Math.round(height)));
}
function restoreView(value:unknown):BottomPanelView{
 plain(value,['open','tab','height'],'bottom panel layout');
 if(typeof value.open!=='boolean'||!TAB_IDS.includes(value.tab as string)||!Number.isSafeInteger(value.height)||(value.height as number)<BOTTOM_PANEL_MIN_HEIGHT||(value.height as number)>BOTTOM_PANEL_MAX_HEIGHT)fail('Invalid bottom panel layout.');
 return {open:value.open as boolean,tab:value.tab as BottomPanelTab,height:value.height as number};
}
/** Workspace recovery: a present value must be exact (schema step 1); an invalid one fails recovery like other saved fields. */
export function restoreBottomPanelBook(value:unknown):BottomPanelBook{
 plain(value,['schemaVersion','layouts'],'bottom panel settings');
 if(value.schemaVersion!==1)fail('Unsupported bottom panel settings version.');
 const layouts=value.layouts;
 if(!layouts||typeof layouts!=='object'||Array.isArray(layouts)||![Object.prototype,null].includes(Object.getPrototypeOf(layouts)))fail('Invalid bottom panel layouts.');
 const entries=Object.entries(layouts as Record<string,unknown>);
 if(entries.length>BOTTOM_PANEL_LAYOUT_LIMIT||Reflect.ownKeys(layouts as object).length!==entries.length)fail('Invalid bottom panel layouts.');
 const out:Record<string,BottomPanelView>={};
 for(const [key,view] of entries){if(!layoutKey(key))fail('Invalid bottom panel layout identity.');out[key]=restoreView(view);}
 return {schemaVersion:1,layouts:out};
}
/** Lenient read for rendering: the saved view of one layout, or the defaults. */
export function bottomPanelView(book:unknown,layoutId:string):BottomPanelView{
 if(!book||typeof book!=='object')return {...BOTTOM_PANEL_DEFAULT};
 const layouts=(book as {layouts?:unknown}).layouts;
 if(!layouts||typeof layouts!=='object'||!Object.hasOwn(layouts,layoutId))return {...BOTTOM_PANEL_DEFAULT};
 try{return restoreView((layouts as Record<string,unknown>)[layoutId]);}catch{return {...BOTTOM_PANEL_DEFAULT};}
}
/** The book with one layout's view replaced. `keep` lists the layouts that still exist; other entries are dropped. */
export function withBottomPanelView(book:unknown,layoutId:string,view:BottomPanelView,keep?:readonly string[]):BottomPanelBook{
 if(!layoutKey(layoutId))fail('Invalid bottom panel layout identity.');
 const next=restoreView({open:view.open,tab:view.tab,height:clampBottomPanelHeight(view.height)});
 let previous:Record<string,BottomPanelView>={};
 try{previous=restoreBottomPanelBook(book).layouts;}catch{previous={};}
 const allowed=keep?new Set([...keep,layoutId]):null,layouts:Record<string,BottomPanelView>={};
 for(const [key,row] of Object.entries(previous))if(key!==layoutId&&(!allowed||allowed.has(key)))layouts[key]=row;
 layouts[layoutId]=next;
 const keys=Object.keys(layouts);
 for(const key of keys.slice(0,Math.max(0,keys.length-BOTTOM_PANEL_LAYOUT_LIMIT)))delete layouts[key];
 return {schemaVersion:1,layouts};
}
/** The saved-layout identity the panel view belongs to: the active library entry, else the working grid's layout. */
export function bottomPanelLayoutId(workspace:{layoutLibrary?:{activeId:string}|undefined;grid?:{layout:{id:string}}|undefined}):string{
 return workspace.layoutLibrary?.activeId??workspace.grid?.layout.id??'default';
}
const WITH_TRADING:readonly BottomPanelTab[]=Object.freeze(['script','strategy','trading']),WITHOUT_TRADING:readonly BottomPanelTab[]=Object.freeze(['script','strategy']);
/** The tabs offered: the Trading panel needs a virtual account. Constant arrays, so a kept panel element stays kept. */
const WITH_TABLES=Object.freeze([...WITH_TRADING,'tables'] as BottomPanelTab[]),WITHOUT_TRADING_WITH_TABLES=Object.freeze([...WITHOUT_TRADING,'tables'] as BottomPanelTab[]);
export function bottomPanelTabsFor(trading:boolean,tables=false):readonly BottomPanelTab[]{return tables?trading?WITH_TABLES:WITHOUT_TRADING_WITH_TABLES:trading?WITH_TRADING:WITHOUT_TRADING;}
export function sameBottomPanelView(a:BottomPanelView,b:BottomPanelView){return a.open===b.open&&a.tab===b.tab&&a.height===b.height;}
/** A tab click: an inactive or collapsed tab opens; the active tab of an expanded panel collapses it. */
export function selectBottomTab(view:BottomPanelView,tab:BottomPanelTab):BottomPanelView{return view.open&&view.tab===tab?{...view,open:false}:{...view,open:true,tab};}
/** Opens the panel on a tab (menus, the indicator dialog, Dock to bottom): never collapses. */
export function openBottomTab(view:BottomPanelView,tab:BottomPanelTab):BottomPanelView{return {...view,open:true,tab};}
export function collapseBottomPanel(view:BottomPanelView):BottomPanelView{return view.open?{...view,open:false}:view;}
export function resizeBottomPanel(view:BottomPanelView,height:number):BottomPanelView{return {...view,height:clampBottomPanelHeight(height)};}
/** The resize handle's keyboard: ArrowUp/ArrowDown by one step, PageUp/PageDown by four, Home and End to the limits. Null for other keys. */
export function bottomPanelKeyHeight(key:string,height:number,limit=BOTTOM_PANEL_MAX_HEIGHT):number|null{
 const top=Math.max(BOTTOM_PANEL_MIN_HEIGHT,Math.min(BOTTOM_PANEL_MAX_HEIGHT,limit));
 const step=key==='ArrowUp'?BOTTOM_PANEL_KEY_STEP:key==='ArrowDown'?-BOTTOM_PANEL_KEY_STEP:key==='PageUp'?4*BOTTOM_PANEL_KEY_STEP:key==='PageDown'?-4*BOTTOM_PANEL_KEY_STEP:null;
 if(key==='Home')return BOTTOM_PANEL_MIN_HEIGHT;
 if(key==='End')return top;
 if(step===null)return null;
 return Math.min(top,clampBottomPanelHeight(height+step));
}
/** A pointer drag of the handle: dragging up grows the panel. `limit` is the largest height the chart area allows. */
export function bottomPanelDragHeight(startHeight:number,startY:number,clientY:number,limit=BOTTOM_PANEL_MAX_HEIGHT):number{
 const top=Math.max(BOTTOM_PANEL_MIN_HEIGHT,Math.min(BOTTOM_PANEL_MAX_HEIGHT,limit));
 return Math.min(top,clampBottomPanelHeight(startHeight+startY-clientY));
}
/** The tabs whose content stays mounted: none while collapsed; otherwise the active tab and every tab shown since the panel
 * last expanded (so the script editor keeps its undo history while the Strategy tester is shown). */
export function mountedBottomTabs(view:BottomPanelView,visited:readonly BottomPanelTab[]):readonly BottomPanelTab[]{
 if(!view.open)return [];
 return BOTTOM_PANEL_TABS.map(row=>row.id).filter(id=>id===view.tab||visited.includes(id));
}
/** The visited list after a panel change from `before` to `after`. */
export function nextVisitedTabs(before:BottomPanelView,after:BottomPanelView,visited:readonly BottomPanelTab[]):readonly BottomPanelTab[]{
 if(!after.open)return [];
 const kept=before.open?mountedBottomTabs(before,visited):[];
 return kept.includes(after.tab)?kept:[...kept,after.tab];
}
