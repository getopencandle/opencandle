// WSX top toolbar model. Pure: the button list in fact order, tooltips, accessible names, hotkey hints, enablement and
// the Manage layouts menu rows. Fact text goes to the tooltip only; each existing control keeps the accessible name it
// has today, so packaged flows and tests that find controls by name are unchanged. Controls LV has and the facts do
// not name (Type settings, Open layouts, Manage layouts) carry LV wording.
import {shortIntervalText} from './interval-display';
import type {LayoutLibraryAction} from './LayoutLibraryDialog';
import type {LayoutLibrary} from './layout-library';

export type ToolbarCommand='open-symbol-search'|'compare'|'intervals'|'favorite-interval'|'chart-style'|'indicators'|'templates'|'alert'|'replay'|'undo'|'redo'|'layout-setup'|'open-layouts'|'save'|'manage-layouts'|'quick-search'|'settings'|'fullscreen'|'snapshot';
export interface ToolbarState {
 hasChart:boolean;loaded:boolean;hasGrid:boolean;chartTypeName:string;
 layoutName:string|null;layoutDirty:boolean;autosave:boolean;layoutCount:number;
 undoHint:string|null;redoHint:string|null;replayOn:boolean;fullscreen:boolean;favoriteIntervals?:readonly string[];
}
export interface ToolbarItem {
 key:string;side:'left'|'right';factId?:string;command:ToolbarCommand;
 accessibleName:string;tooltip:string;hint?:string;hotkeyHint?:string;text?:string;detail?:string;
 enabled:boolean;reason?:string;pressed?:boolean;interval?:string;
}
const NO_CHART='Open a chart first.';
const NO_DATA='No data is loaded.';
const NO_GRID='No chart layout is available.';
const gate=(ok:boolean,reason:string)=>ok?{enabled:true}:{enabled:false,reason};
/** The tooltip as a title string: the fact text, then the hotkey (or the typing hint) in parentheses, then LV detail. */
export function toolbarTitle(item:Pick<ToolbarItem,'tooltip'|'hint'|'hotkeyHint'|'detail'>):string{
 const extra=item.hotkeyHint??item.hint;
 return item.tooltip+(extra?` (${extra})`:'')+(item.detail?` · ${item.detail}`:'');
}
/** Items in the order given by each fact's order field: left 1 to 9, then right 1 to 9. Items LV does not have are skipped, not reordered. */
export function topToolbarItems(state:ToolbarState):ToolbarItem[]{
 const chart=gate(state.hasChart,NO_CHART);
 const name=state.layoutName??'Local layout';
 const favorites=(state.favoriteIntervals??[]).map<ToolbarItem>(interval=>({key:'favorite:'+interval,side:'left',command:'favorite-interval',accessibleName:shortIntervalText(interval),tooltip:`Choose ${shortIntervalText(interval)} interval`,text:shortIntervalText(interval),interval,enabled:true}));
 return[
  {key:'symbol',side:'left',factId:'top.left.symbol',command:'open-symbol-search',accessibleName:'Search symbols',tooltip:'Symbol search',enabled:true},
  {key:'compare',side:'left',factId:'top.left.compare',command:'compare',accessibleName:'Compare',tooltip:'Compare symbols',...chart},
  {key:'intervals',side:'left',factId:'top.left.intervals',command:'intervals',accessibleName:'Chart intervals',tooltip:'Chart interval',hint:'type a number or comma to change interval',enabled:true},
  ...favorites,
  {key:'chartStyle',side:'left',factId:'top.left.chartStyle',command:'chart-style',accessibleName:'Chart type',tooltip:state.chartTypeName,enabled:true},
  {key:'indicators',side:'left',factId:'top.left.indicators',command:'indicators',accessibleName:'Indicators',tooltip:'Indicators, metrics, and strategies',hotkeyHint:'/',text:'Indicators',...chart},
  {key:'templates',side:'left',factId:'top.left.templates',command:'templates',accessibleName:'Indicator templates',tooltip:'Indicator templates',...chart},
  {key:'alert',side:'left',factId:'top.left.alert',command:'alert',accessibleName:'Create alert',tooltip:'Create alert',hotkeyHint:'Alt + A',text:'Alert',...gate(state.hasChart&&state.loaded,state.hasChart?NO_DATA:NO_CHART)},
  {key:'replay',side:'left',factId:'top.left.replay',command:'replay',accessibleName:'Replay',tooltip:'Bar replay',text:'Replay',pressed:state.replayOn,enabled:true},
  {key:'undo',side:'right',factId:'top.right.undoRedo',command:'undo',accessibleName:'Undo',tooltip:state.undoHint?`Undo ${state.undoHint}`:'Undo',hotkeyHint:'Ctrl + Z',enabled:true},
  {key:'redo',side:'right',factId:'top.right.undoRedo',command:'redo',accessibleName:'Redo',tooltip:state.redoHint?`Redo ${state.redoHint}`:'Redo',hotkeyHint:'Ctrl + Y',enabled:true},
  {key:'layout',side:'right',factId:'top.right.layout',command:'layout-setup',accessibleName:'Layout setup',tooltip:'Layout setup',...gate(state.loaded&&state.hasGrid,state.loaded?NO_GRID:NO_DATA)},
  {key:'openLayouts',side:'right',command:'open-layouts',accessibleName:'Open layouts',tooltip:'Open layouts',hotkeyHint:'.',detail:name,text:name+(state.layoutDirty?' *':''),...gate(state.loaded,NO_DATA)},
  {key:'save',side:'right',factId:'top.right.saveLoad',command:'save',accessibleName:'Save',tooltip:'Save layout',hotkeyHint:'Ctrl + S',text:'Save',...gate(state.loaded,NO_DATA)},
  {key:'manageLayouts',side:'right',command:'manage-layouts',accessibleName:'Manage layouts',tooltip:'Manage layouts',...gate(state.loaded,NO_DATA)},
  {key:'quickSearch',side:'right',factId:'top.right.quickSearch',command:'quick-search',accessibleName:'Quick search',tooltip:'Quick search',hotkeyHint:'Ctrl + K',enabled:true},
  {key:'settings',side:'right',factId:'top.right.settings',command:'settings',accessibleName:'Chart settings',tooltip:'Settings',enabled:true},
  {key:'fullscreen',side:'right',factId:'top.right.fullscreen',command:'fullscreen',accessibleName:'Fullscreen',tooltip:'Fullscreen mode',hotkeyHint:'Shift + F',pressed:state.fullscreen,enabled:true},
  {key:'screenshot',side:'right',factId:'top.right.screenshot',command:'snapshot',accessibleName:'Take a snapshot',tooltip:'Take a snapshot',...chart},
 ];
}

export type LayoutMenuCommand='save'|'duplicate'|'rename'|'create'|'open'|'autosave'|'export-data'|'delete';
export interface LayoutMenuRow {
 id:string;command:LayoutMenuCommand;label:string;hotkeyHint?:string;checked?:boolean;enabled:boolean;reason?:string;
 /** What the row needs from the user before it can run: nothing, a name, or a choice from the saved layouts. */
 input:'none'|'name'|'pick';suggestedName?:string;
}
/** Rows follow static-top-toolbar-sidebar top.right.saveLoad menuItemsObserved order, keeping only what LV can do. Share layout and Load Chart Layout
 * need a hosted account and are omitted rather than shown disabled; Delete layout is LV's own row, last. */
export function manageLayoutsMenu(state:ToolbarState):LayoutMenuRow[]{
 const name=state.layoutName??'Local layout',ready=gate(state.loaded,NO_DATA);
 return[
  {id:'save',command:'save',label:'Save layout',hotkeyHint:'Ctrl + S',input:'none',...ready},
  {id:'duplicate',command:'duplicate',label:'Make a copy',input:'name',suggestedName:name+' copy',...ready},
  {id:'rename',command:'rename',label:'Rename',input:'name',suggestedName:name,...ready},
  {id:'create',command:'create',label:'Create new layout',input:'name',suggestedName:'New layout',...ready},
  {id:'open',command:'open',label:'Open layout',input:'pick',...ready},
  {id:'autosave',command:'autosave',label:'Autosave',checked:state.autosave,input:'none',...ready},
  {id:'export-data',command:'export-data',label:'Download chart data',input:'none',...gate(state.hasChart,NO_CHART)},
  {id:'delete',command:'delete',label:'Delete layout…',input:'pick',...gate(state.loaded&&state.layoutCount>1,state.loaded?'Keep at least one layout.':NO_DATA)},
 ];
}
/** Maps a menu command to the existing layout library action. No new storage. Name and pick commands refuse to run without their input. */
export function layoutMenuAction(command:Exclude<LayoutMenuCommand,'export-data'>,context:{library:LayoutLibrary;name?:string;id?:string;replacementId?:string}):LayoutLibraryAction{
 const {library}=context;
 const name=()=>{if(typeof context.name!=='string'||!context.name.trim())throw new Error('A layout name is required.');return context.name;};
 const id=()=>{if(typeof context.id!=='string'||!context.id)throw new Error('Choose a saved layout first.');return context.id;};
 switch(command){
  case 'save':return{kind:'save'};
  case 'autosave':return{kind:'autosave',enabled:!library.autosave};
  case 'rename':return{kind:'rename',id:library.activeId,name:name()};
  case 'duplicate':return{kind:'duplicate',id:library.activeId,name:name()};
  case 'create':return{kind:'create',name:name()};
  case 'open':return{kind:'open',id:id()};
  case 'delete':return{kind:'delete',id:id(),...(context.replacementId?{replacementId:context.replacementId}:{})};
 }
}

/** The chart type menu order, from visual-dialogs-chart-type-menu menu.items; the array index is the separator-delimited group. */
const CHART_TYPE_GROUPS:readonly (readonly string[])[]=[
 ['bars','hlc bars','candles','hollow candles','volume candles'],
 ['line','line with markers','step line'],
 ['area','hlc area','baseline'],
 ['columns','high-low'],
 ['volume footprint','time price opportunity','session volume profile'],
 ['heikin ashi','renko','line break','kagi','point & figure','range'],
];
const chartTypeKey=(label:string)=>label.trim().toLowerCase().replace(/\band\b/g,'&');
export interface ChartTypeChoice {value:string;label:string;disabled?:boolean;reason?:string}
/** The select lists LV's chart types in the observed menu order; unsupported ones stay in place, disabled with their existing reason.
 * Types the menu does not name keep their given order after the named ones. */
export function orderChartTypes<T extends ChartTypeChoice>(rows:readonly T[]):(T&{group:number})[]{
 const place=(label:string)=>{const key=chartTypeKey(label);for(let group=0;group<CHART_TYPE_GROUPS.length;group++){const index=CHART_TYPE_GROUPS[group].indexOf(key);if(index>=0)return{group,index};}return{group:CHART_TYPE_GROUPS.length,index:0};};
 return rows.map((row,original)=>({row,original,...place(row.label)})).sort((a,b)=>a.group-b.group||a.index-b.index||a.original-b.original).map(entry=>({...entry.row,group:entry.group}));
}

/** The Take a snapshot menu: Download image and Copy image.
 * Copy link, Open image in new tab and Tweet image would need hosted snapshot storage, so LV omits them (local-only).
 * Hotkeys match shortcut-dispatch: Ctrl+Alt+S saves, Ctrl+Shift+S (and Alt+S) copies.
 * `blocked` is the refusal the active chart's data source gives image export (the live-data notice). Both rows
 * are then disabled with that reason, and the menu shows it, so a refused snapshot no longer looks like a dead button. */
export type SnapshotMenuCommand='download-image'|'copy-image';
export interface SnapshotMenuRow {id:SnapshotMenuCommand;label:string;hotkeyHint:string;enabled:boolean;reason?:string}
export function snapshotMenuRows(state:{hasChart:boolean;busy?:boolean;blocked?:string|null}):SnapshotMenuRow[]{
 const refused=state.hasChart&&state.blocked?{enabled:false,reason:state.blocked}:null;
 const ready=refused??(state.busy?{enabled:false,reason:'A save dialog is already open.'}:gate(state.hasChart,NO_CHART));
 return[
  {id:'download-image',label:'Download image',hotkeyHint:'Ctrl + Alt + S',...ready},
  {id:'copy-image',label:'Copy image',hotkeyHint:'Ctrl + Shift + S',...(refused??gate(state.hasChart,NO_CHART))},
 ];
}
/** The plain ticker of a chart symbol: no exchange or source prefix ("SYNTHETIC:GME" gives "GME"), file-name safe. */
export function snapshotTicker(symbol:string):string{
 const tail=String(symbol??'').split(':').pop()!.trim();
 const safe=tail.replace(/[^A-Za-z0-9._-]+/g,'_').replace(/\.{2,}/g,'_').replace(/^[._]+|[._]+$/g,'').slice(0,60);
 return safe||'Chart';
}
/** Snapshot file name in local time: <TICKER>_<YYYY-MM-DD>_<hh-mm-ss>.png. */
export function snapshotFileName(symbol:string,now:Date=new Date()):string{
 const two=(value:number)=>String(value).padStart(2,'0');
 return snapshotTicker(symbol)+'_'+now.getFullYear()+'-'+two(now.getMonth()+1)+'-'+two(now.getDate())+'_'+two(now.getHours())+'-'+two(now.getMinutes())+'-'+two(now.getSeconds())+'.png';
}
