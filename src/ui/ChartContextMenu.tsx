import {LV_BARS_PATTERN} from '../chart/lv-types/bars-pattern';
import {tpoMergeChoiceAt} from '../chart/tpo-merge-menu';
import React,{useEffect,useRef,useState} from 'react';
import {contextPriceTargetError} from '../chart/context-price-target';
import {createContextMenuFocus,contextMenuKeyAction} from '../chart/context-menu-focus';
import {createContextMenuExecution} from '../chart/context-menu-execution';
import {CONTEXT_RESET_HINT,BAR_MARKS_HIDE_LABEL,BAR_MARKS_SHOW_LABEL,barMarksVisibility,type BarMarksVisibility,type ChartContextActionOptions,type ChartContextActions,type ChartMenuSnapshot,type RootChartMenuAction} from '../chart/context-menu';
import {legendMoreMenu,indicatorClipboard,indicatorOrderState,indicatorVisualOrderAvailable,visualOrderItems,type IndicatorClip,type LegendMoreItemId} from '../chart/legend-model';
import {readIndicatorScalePlacement,indicatorScaleSides} from '../chart/indicator-scale';
import {indicatorAcronyms} from './indicator-dialog-model';
import {indicatorMoveChoices} from './indicator-move-targets';
import './chart-commands.css';
import {pinToScaleMenu} from './object-tree-model';
import {seriesPinToScaleItems} from './series-legend-menu';
/** One submenu row; `options` absent runs the parent action with `{item:id}` (the Trade rows carry their order preset instead). */
/** A 20px icon column on every row (empty for rows without a glyph) so the labels line up; glyphs are LV-drawn. */
const ICON_PATHS:Partial<Record<RootChartMenuAction,string>>={
 theme:'M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6L15 15M15 5l-1.4 1.4M6.4 13.6L5 15',
 'drawing-settings':'M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM10 3v2M10 15v2M3 10h2M15 10h2',
 'price-alert':'M10 4a4 4 0 0 0-4 4v3l-1.5 2.5h11L14 11V8a4 4 0 0 0-4-4zM8.5 15.5a1.5 1.5 0 0 0 3 0',
 'drawing-alert':'M10 4a4 4 0 0 0-4 4v3l-1.5 2.5h11L14 11V8a4 4 0 0 0-4-4zM8.5 15.5a1.5 1.5 0 0 0 3 0',
 'remove-drawings':'M5 6h10M8 6V4h4v2M6.5 6l.5 10h6l.5-10',
 'remove-indicators':'M5 6h10M8 6V4h4v2M6.5 6l.5 10h6l.5-10',
 'drawing-remove':'M5 6h10M8 6V4h4v2M6.5 6l.5 10h6l.5-10',
 'copy-price':'M7 7h7v8H7zM5 13V5h7',
 'drawing-copy':'M7 7h7v8H7zM5 13V5h7',
};
function menuIcon(action:RootChartMenuAction){
 const path=ICON_PATHS[action];
 return <span className="lv-popup-icon-slot" aria-hidden="true">{path&&<svg width="20" height="20" viewBox="0 0 20 20"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}</span>;
}
type MenuChild={id:string;label:string;checked?:boolean;options?:ChartContextActionOptions};
type MenuEntry={action:RootChartMenuAction;/** The command a 'command' row runs (passed as options.item). */item?:string;label:string;unavailable?:string;hint?:string;/** Rows with the same group number sit together; a divider separates groups. */group?:number;/** The row opens a submenu (Trade, Visual order, Move to, Pin to scale) instead of running its action. */submenu?:boolean;children?:readonly MenuChild[];submenuLabel?:string};
import {contextPriceLabel,type ContextOrderPreset} from './context-price-request';
import {contextTargetPrice} from '../chart/context-price-target';
import {pricePlusMenu} from '../chart/price-scale-plus';
import {derivedPaperRefusal} from '../domain/symbol-math-live';
import {cursorTimeLock,CURSOR_LOCK_LABEL,CURSOR_UNLOCK_LABEL,type CursorTimeLockStore} from './cursor-time-lock';
import {fitFixedMenu} from './menu-placement';
import {copyPlainText} from './text-clipboard';
const priceText=(price:number,tickSize:number)=>contextPriceLabel(price,tickSize);
/** One row of the Trade submenu. `order` absent: the plain clicked-price ticket. */
export interface TradeSubmenuEntry{id:string;label:string;order?:ContextOrderPreset}
/** The Trade submenu at the clicked price: the price scale + menu's two order rows (same wording, and the same side rule
 * against the last loaded close: above it a limit sells and a stop buys, at or below it a limit buys and a stop sells), then
 * the plain ticket. Each row goes through the paper-ticket action with its preset, so the one-click rules of the + menu
 * apply unchanged (one-click on with a preset places at once, otherwise the ticket opens with that side and type).
 * The "Order ticket" wording is our own choice. */
export function tradeSubmenuEntries(snapshot:ChartMenuSnapshot):TradeSubmenuEntry[]{
 const tick=(snapshot.instrument as {tickSize?:number}|undefined)?.tickSize??0.01,raw=snapshot.point.price;
 if(raw===null||!Number.isFinite(raw)||derivedPaperRefusal(snapshot))return[];// No Trade rows on a derived symbol
 const price=contextTargetPrice(snapshot),text=priceText(raw,tick),last=snapshot.input?.bars?.at(-1)?.close;
 const rows=pricePlusMenu({price,text,last:typeof last==='number'&&Number.isFinite(last)?last:null,symbol:snapshot.instrument?.symbol||null,host:true,line:false});
 const orders:TradeSubmenuEntry[]=rows.filter(row=>row.id!=='alert'&&row.id!=='hline').map(row=>{const [side,orderType]=row.id.split('-') as [ContextOrderPreset['side'],ContextOrderPreset['orderType']];return{id:row.id,label:row.label,order:{side,orderType}};});
 return[...orders,{id:'ticket',label:'Order ticket at '+text+'…'},{id:'dom',label:'Open DOM at '+text}];
}
/** Trade submenu keys (WAI-ARIA menu pattern): Right, Enter or Space on Trade opens it; Left or Escape inside
 * closes only the submenu and returns to Trade. Null: the ordinary menu handling. */
export function tradeMenuKey(key:string,where:{onTrade:boolean;inSubmenu:boolean}):'open'|'close'|null{
 if(where.onTrade&&(key==='ArrowRight'||key==='Enter'||key===' '))return 'open';
 if(where.inSubmenu&&(key==='ArrowLeft'||key==='Escape'))return 'close';
 return null;
}
/** counts: the active cell's drawing and indicator totals once the removal port exists (null or absent: the Remove rows are not offered).
 * A row is offered only when its handler exists and it can run; there are no disabled rows. */
/** Lock and hide state of the clicked drawings: locked or hidden only when every one is. No rows known: both false. */
export function drawingMenuLabels(rows:readonly Record<string,unknown>[],ids:readonly string[]):{locked:boolean;hidden:boolean}{
 const chosen=rows.filter(row=>ids.includes(String(row.id)));
 return{locked:chosen.length>0&&chosen.every(row=>row.locked===true),hidden:chosen.length>0&&chosen.every(row=>row.visible===false)};
}
/** "Copy price {price}": the clicked price on the price
 * pane, rounded and formatted to the symbol's tick (the same text the Add alert and Trade rows show). Null: no row. */
export function copyPriceText(snapshot:ChartMenuSnapshot):string|null{
 const raw=snapshot.point.price;if(raw===null||!Number.isFinite(raw)||snapshot.point.unit==='indicator')return null;
 try{return priceText(raw,(snapshot.instrument as {tickSize?:number}|undefined)?.tickSize??0.01);}catch{return null;}
}
/** State the chart menu wording reads besides the snapshot (default: this window's stores). */
export interface ChartMenuExtras {marksHidden?:boolean;clip?:IndicatorClip|null;seriesHidden?:boolean}
function defaultExtras(snapshot:ChartMenuSnapshot,marks:Pick<BarMarksVisibility,'hiddenFor'>=barMarksVisibility):ChartMenuExtras{
 let seriesHidden=false;try{seriesHidden=(snapshot.controller.chart as unknown as {renderer?:{get?:(key:string)=>unknown}}|undefined)?.renderer?.get?.('candleVisible')===false;}catch{seriesHidden=false;}
 return{marksHidden:marks.hiddenFor(snapshot.cellId),clip:indicatorClipboard.get(),seriesHidden};
}
const mainScaleSideOf=(snapshot:ChartMenuSnapshot):'left'|'right'=>{try{return snapshot.controller.priceScale.settings().mainSide==='left'?'left':'right';}catch{return 'right';}};
/** The clicked indicator's own menu, the legend More menu rows
 * (Add alert, Add indicator on it, Visual order, Visibility on intervals, Move to,
 * Pin to scale, Copy, Hide, Remove, Object tree, Settings) in that order with its separators. As in the rest of this menu a row
 * the host cannot run is left out; so are the favorite row (its state lives in the workspace) and the hotkey hints (on the chart
 * those keys act on drawings and the symbol, not on the indicator). */
const INDICATOR_ROW_ACTIONS:Partial<Record<LegendMoreItemId,RootChartMenuAction>>={anchor:'indicator-anchor',alert:'indicator-alert',addIndicator:'indicator-add-on',visualOrder:'indicator-order',intervals:'indicator-intervals',moveTo:'indicator-move',pinToScale:'indicator-pin',copy:'indicator-copy',hide:'indicator-hide',remove:'indicator-remove',objectTree:'objects',settings:'indicator-settings'};
/** On a comparison series the note row names that series' market (the App note action targets it). */
function comparisonNoteLabel(snapshot:ChartMenuSnapshot):string|null{const entity=snapshot.entity;if(entity.kind!=='series'||entity.owner==='main'||entity.owner.kind!=='comparison')return null;const id=entity.owner.id;try{const row=snapshot.controller.comparisons.list().find(item=>item.id===id);return row?'Note for '+row.dataset.instrument.symbol:null;}catch{return null;}}
export function indicatorMenuEntries(snapshot:ChartMenuSnapshot,actions:ChartContextActions):MenuEntry[]{
 const entity=snapshot.entity;if(entity.kind!=='indicator')return [];
 let rows:ReturnType<ChartMenuSnapshot['controller']['indicators']['list']>=[];try{rows=snapshot.controller.indicators.list();}catch{return [];}
 const row=rows.find(item=>item.id===entity.id&&item.rendererId===entity.rendererId);if(!row)return [];
 const title=indicatorAcronyms[row.kind]??row.kind,order=rows.map(item=>({id:item.id,paneId:item.paneId})),vela=snapshot.controller.chart;
 const placement=(()=>{try{return vela?readIndicatorScalePlacement(vela,row.rendererId):null;}catch{return null;}})();
 const ordering=!!actions['indicator-order']&&indicatorVisualOrderAvailable(order,row.id);
 const menu=legendMoreMenu('indicator',{surface:'legend',title,value:null,hidden:!row.visible,favorite:false,scalePlacement:placement,mainScaleSide:mainScaleSideOf(snapshot),linkedToSeries:false,routes:{favorite:false,visualOrder:ordering,copy:!!actions['indicator-copy'],anchor:row.kind==='avwap'&&!!actions['indicator-anchor']}});
 const children:Partial<Record<RootChartMenuAction,MenuChild[]>>={
  'indicator-order':ordering?visualOrderItems(indicatorOrderState(order,row.id)).filter(item=>!item.disabled).map(item=>({id:item.id,label:item.label})):[],
  'indicator-move':(()=>{try{return indicatorMoveChoices(snapshot.controller,row.rendererId,rows).filter(choice=>!choice.disabled).map(choice=>({id:choice.id,label:choice.label}));}catch{return [];}})(),
  'indicator-pin':(()=>{if(placement===null||!vela)return [];try{const choices=snapshot.controller.indicators.scaleChoices(row.id,id=>{const item=rows.find(entry=>entry.id===id);return item?indicatorAcronyms[item.kind]??item.kind:id;});return pinToScaleMenu(placement,indicatorScaleSides(vela),choices).filter(item=>!item.disabled).map(item=>({id:item.id,label:item.label??item.id,checked:!!item.checked}));}catch{return [];}})(),
 };
 const out:MenuEntry[]=[];let group=0;
 for(const item of menu){
  if(item.kind==='separator'){group++;continue;}
  const action=INDICATOR_ROW_ACTIONS[item.id];if(item.availability.state!=='enabled'||!action||!actions[action])continue;
  const kids=children[action];if(kids!==undefined&&!kids.length)continue;
  out.push({action,label:item.label,group,...(kids?{submenu:true,children:kids,submenuLabel:item.label}:{})});
 }
 return out;
}
/** The removal counts of the active chart, published by root on each render (the same counts as the trash rail
 * menu). Only that controller gets them, so the Remove rows never show on another cell, whose removal would act on the active one. */
let publishedCounts:{controller:object;counts:{drawings:number;indicators:number}}|null=null;
export function publishChartMenuCounts(controller:object|null,counts:{drawings:number;indicators:number}|null):void{publishedCounts=controller&&counts?{controller,counts:{drawings:counts.drawings,indicators:counts.indicators}}:null;}
export function chartMenuCountsFor(controller:unknown):{drawings:number;indicators:number}|null{return publishedCounts&&publishedCounts.controller===controller?publishedCounts.counts:null;}
/** App commands the chart menu offers through the 'command' action (options.item); the host runs them as its command
 * palette does. 'hide-drawings' is the Hide or show all drawings toggle (Ctrl + Alt + H). */
export const CHART_MENU_COMMANDS=['compare','symbol-info','replay','data-window','hide-drawings'] as const;
export type ChartMenuCommand=typeof CHART_MENU_COMMANDS[number];
const CHART_MENU_COMMAND_LABELS:Record<ChartMenuCommand,string>={compare:'Compare symbol…','symbol-info':'Symbol info',replay:'Bar replay','data-window':'Data window','hide-drawings':'Hide or show all drawings'};
const CHART_MENU_COMMAND_HINTS:Record<ChartMenuCommand,string|undefined>={compare:undefined,'symbol-info':undefined,replay:undefined,'data-window':'Alt + D','hide-drawings':'Ctrl + Alt + H'};
/** Menu actions the menu runs itself; a host action of the same name wins. */
export const BUILT_IN_CHART_MENU_ACTIONS:ChartContextActions={'copy-symbol':async snapshot=>{const symbol=snapshot.instrument?.symbol;if(!symbol)return{ok:false,message:'This chart has no symbol to copy.'};const copied=await copyPlainText(symbol);return copied.ok?true:{ok:false,message:copied.message};}};
const countLabel=(count:number,one:string,many:string)=>count>0?'Remove '+count+' '+(count===1?one:many):'Remove '+many;
export function chartMenuEntries(snapshot:ChartMenuSnapshot,actions:ChartContextActions={},counts?:{drawings:number;indicators:number}|null,drawingState?:{locked:boolean;hidden:boolean},lock:Pick<CursorTimeLockStore,'lockedFor'>=cursorTimeLock,extras:ChartMenuExtras=defaultExtras(snapshot)):MenuEntry[]{
 if(snapshot.entity.kind==='indicator')return indicatorMenuEntries(snapshot,actions);
 if(snapshot.entity.kind==='drawing'){
  const single=snapshot.entity.ids.length===1;
  const drawingRows:MenuEntry[]=[{action:'drawing-settings',label:'Settings…',group:0},{action:'drawing-template',label:'Template',group:0},{action:'drawing-visibility',label:'Visibility on intervals…',group:0},{action:'drawing-alert',label:'Add alert',group:1},{action:'drawing-clone',label:'Clone',group:1},{action:'drawing-copy',label:'Copy',group:1},{action:'drawing-cut',label:'Cut',hint:'Ctrl + X',group:1},{action:'drawing-lock',label:drawingState?drawingState.locked?'Unlock':'Lock':'Lock / Unlock',group:1},{action:'drawing-hide',label:drawingState?drawingState.hidden?'Show':'Hide':'Hide',group:1},{action:'drawing-front',label:'Bring to front',group:2},{action:'drawing-back',label:'Send to back',group:2},{action:'drawing-forward',label:'Bring forward',group:2},{action:'drawing-backward',label:'Send backward',group:2},{action:'drawing-remove',label:'Remove',group:3}];
  const barsPattern=single&&(()=>{try{return snapshot.controller.drawingManager.list().some(row=>String(row.id)===String(snapshot.entity.kind==='drawing'?snapshot.entity.ids[0]:'')&&row.type===LV_BARS_PATTERN);}catch{return false;}})();
  if(barsPattern)drawingRows.splice(3,0,{action:'drawing-mirror',label:'Mirror',group:0},{action:'drawing-flip',label:'Flip',group:0});
  // Visual order rows in this order: Bring to front, Send to
  // back, Bring forward, Send backward. A step that cannot move the drawings is not offered,
  // following this menu's no-disabled-rows rule; an unreadable order state keeps every row.
  const order=(()=>{try{return snapshot.controller.drawingManager.orderState(snapshot.entity.kind==='drawing'?snapshot.entity.ids.map(String):[]);}catch{return null;}})();
  const orderOff=(action:RootChartMenuAction)=>!!order&&(action==='drawing-front'&&order.front||action==='drawing-back'&&order.back||action==='drawing-forward'&&order.forward||action==='drawing-backward'&&order.backward);
  return drawingRows.filter(row=>!!actions[row.action]&&!orderOff(row.action)&&(single||(row.action!=='drawing-settings'&&row.action!=='drawing-alert'&&row.action!=='drawing-template'&&row.action!=='drawing-visibility')));
 }
 const removable=(count:number|undefined,empty:string)=>count===0?empty:undefined;
 const targetError=contextPriceTargetError(snapshot),at=snapshot.point.price!==null&&Number.isFinite(snapshot.point.price)?' at '+priceText(snapshot.point.price,(snapshot.instrument as {tickSize?:number}|undefined)?.tickSize??0.01):'';
 const symbol=snapshot.instrument?.symbol||'',command=(item:ChartMenuCommand,group:number):MenuEntry=>({action:'command',item,label:CHART_MENU_COMMAND_LABELS[item],hint:CHART_MENU_COMMAND_HINTS[item],group});
 // Groups: 0 at the clicked price, 1 the symbol, 2 the chart view, 3 drawings and indicators, 4 export, 5 the clicked
 // main series, 6 settings. Rows the host cannot run are left out (no disabled rows).
 const rows:MenuEntry[]=[
  {action:'price-alert',label:'Add alert'+at,hint:'Alt + A',group:0,unavailable:targetError??undefined},
  {action:'paper-ticket',label:'Trade'+at,group:0,unavailable:targetError??derivedPaperRefusal(snapshot)??undefined,submenu:true},
  // "Draw horizontal line at {price}" (the price scale + menu's row and wording) at the clicked price.
  ...(at?[{action:'hline' as const,label:'Draw horizontal line at '+at.slice(4),hint:'Alt + H',group:0,unavailable:targetError??undefined}]:[]),
  ...(()=>{const text=copyPriceText(snapshot);return text?[{action:'copy-price' as const,label:'Copy price '+text,group:0}]:[];})(),
  ...(symbol?[{action:'copy-symbol' as const,label:'Copy symbol '+symbol,group:1},{action:'watchlist-add' as const,label:'Add '+symbol+' to watchlist',hint:'Alt + W',group:1}]:[]),
  command('compare',1),command('symbol-info',1),
  {action:'note',label:comparisonNoteLabel(snapshot)??'Instrument note',hint:'Alt + N',group:1},
  {action:'indicator',label:'Add indicator',hint:'/',group:2},{action:'chart-type-focus',label:'Chart type…',group:2},
  {action:'interval',label:'Change interval',hint:',',group:2},{action:'date',label:'Go to date',hint:'Alt + G',group:2},command('replay',2),
  ...(lock.lockedFor(snapshot.cellId)?[{action:'cursor-lock' as const,label:CURSOR_UNLOCK_LABEL,group:2}]:snapshot.point.barTime!==null&&Number.isFinite(snapshot.point.barTime)?[{action:'cursor-lock' as const,label:CURSOR_LOCK_LABEL,group:2}]:[]),
  {action:'table-view',label:'Table view',group:2},command('data-window',2),
  {action:'reset-view',label:'Reset chart view',hint:CONTEXT_RESET_HINT,group:2},
  {action:'objects',label:'Drawing objects',group:3},
  ...(pasteReady(snapshot)?[{action:'paste' as const,label:'Paste',hint:'Ctrl + V',group:3}]:[]),
  ...(extras.clip?[{action:'indicator-paste' as const,label:'Paste '+extras.clip.title,group:3}]:[]),
  command('hide-drawings',3),
  {action:'hide-marks',label:extras.marksHidden?BAR_MARKS_SHOW_LABEL:BAR_MARKS_HIDE_LABEL,group:3},
  ...(counts==null?[]:[{action:'remove-drawings' as const,label:countLabel(counts.drawings,'drawing','drawings'),unavailable:removable(counts.drawings,'No drawings on this chart'),group:3},{action:'remove-indicators' as const,label:countLabel(counts.indicators,'indicator','indicators'),unavailable:removable(counts.indicators,'No indicators on this chart'),group:3}]),
  {action:'source-csv',label:'Export chart data (CSV)',group:4},{action:'indicators-xlsx',label:'Export all indicators (.xlsx)',group:4},{action:'png-copy',label:'Copy chart image',hint:'Alt + S',group:4},{action:'png-save',label:'Save chart image',hint:'Ctrl + Alt + S',group:4},
  {action:'theme',label:'Settings…',group:6}];
 // On a TPO chart, the clicked profile can join the profile before it (a merge point) or split back out.
 if(snapshot.input?.style==='tpo'){let choice:ReturnType<typeof tpoMergeChoiceAt>=null;try{choice=tpoMergeChoiceAt(snapshot.input.bars,snapshot.controller.getChartSettingsBook?.()?.tpo,snapshot.input.source,snapshot.point.barTime);}catch{choice=null;}if(choice?.merge)rows.push({action:'tpo-merge',label:'Merge with previous profile',group:2});if(choice?.unmerge)rows.push({action:'tpo-unmerge',label:'Unmerge profile',group:2});}
 // A click on the candles adds the main series rows Pin to scale and Hide.
 if(snapshot.entity.kind==='series'&&snapshot.entity.owner==='main'){const side=mainScaleSideOf(snapshot);rows.push({action:'series-pin',label:'Pin to scale (now '+side+')',group:5,submenu:true,submenuLabel:'Pin to scale',children:seriesPinToScaleItems(side).filter(item=>!item.disabled).map(item=>({id:item.id,label:item.label,checked:!!item.checked}))},{action:'series-hide',label:extras.seriesHidden?'Show':'Hide',group:5});}
 return rows.filter(row=>!!actions[row.action]&&!row.unavailable&&(!row.children||row.children.length>0)).sort((x,y)=>(x.group??0)-(y.group??0));
}
/** The chart menu's Paste row ("Paste", Ctrl + V) is offered
 * only while the shared drawing clipboard holds drawings. */
function pasteReady(snapshot:ChartMenuSnapshot):boolean{try{const size=(snapshot.controller as {clipboardSize?:()=>number}).clipboardSize;return typeof size==='function'&&size()>0;}catch{return false;}}
function drawingStateOf(snapshot:ChartMenuSnapshot){
 if(snapshot.entity.kind!=='drawing')return undefined;
 try{return drawingMenuLabels(snapshot.controller.drawingManager.list() as unknown as Record<string,unknown>[],snapshot.entity.ids.map(String));}catch{return undefined;}
}
/** Renders its children unless "Hide marks on bars" is on for that chart cell. */
export function BarMarksGate({cellId,store=barMarksVisibility,children}:{cellId:string|null|undefined;store?:BarMarksVisibility;children:React.ReactNode}){
 const hidden=React.useSyncExternalStore(store.subscribe,()=>!!cellId&&store.hiddenFor(cellId),()=>false);
 return hidden?null:<>{children}</>;
}
/** How often an open chart menu checks that its target is still current, and how long the target may read as retired
 * before the menu closes (a chart update in flight, such as the layout autosave, makes it read so for a few frames). */
export const CONTEXT_MENU_POLL_MS=100,CONTEXT_MENU_STALE_GRACE_MS=750;
export function ChartContextMenu({snapshot,actions:hostActions,counts,onClose,onFailure,focusTarget}:{snapshot:ChartMenuSnapshot;actions:ChartContextActions;/** A refused choice closes the menu and passes its message here (the chart's notice); absent, the menu stays open with a retry line. */onFailure?:(message:string)=>void;/** Drawing and indicator totals for the Remove rows; root supplies them once the removal port exists. */counts?:{drawings:number;indicators:number}|null;focusTarget:()=>HTMLElement|null;onClose:(snapshot:ChartMenuSnapshot)=>void}){
 const actions=React.useMemo(()=>({...BUILT_IN_CHART_MENU_ACTIONS,...hostActions}),[hostActions]);
 const host=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),alive=useRef(true),currentSnapshot=useRef(snapshot),latest=useRef({actions,onClose,onFailure}),entries=chartMenuEntries(snapshot,actions,counts!==undefined?counts:chartMenuCountsFor(snapshot.controller),drawingStateOf(snapshot));
 latest.current={actions,onClose,onFailure};currentSnapshot.current=snapshot;
 const focus=React.useMemo(()=>createContextMenuFocus({current:()=>alive.current&&currentSnapshot.current===snapshot&&snapshot.controller.contextMenu.isCurrent(snapshot),chart:focusTarget,menu:()=>host.current,ownsFocus:()=>document.activeElement===document.body||document.activeElement===focusTarget()||!!host.current?.contains(document.activeElement)}),[snapshot,focusTarget]);
 const execution=React.useMemo(()=>createContextMenuExecution(snapshot,{current:()=>alive.current&&currentSnapshot.current===snapshot,actions:()=>latest.current.actions,close:()=>latest.current.onClose(snapshot),error:value=>{const report=latest.current.onFailure;if(report){latest.current.onClose(snapshot);report(value);return;}setError(value);focus.failed();},busy:setBusy,beforeAction:()=>focus.beforeAction()}),[snapshot,focus]);
 // The Trade row opens a submenu (fixed position beside the row, inside this menu element so outside clicks
 // and the action lifecycle stay the menu's own). Layout and keys are our own choice. Every submenu row (Visual
 // order, Move to, Pin to scale) opens the same way; one submenu is open at a time.
 const [trade,setTrade]=useState<{action:RootChartMenuAction;left:number;top:number}|null>(null),subRows=useRef(new Map<RootChartMenuAction,HTMLButtonElement>()),submenu=useRef<HTMLDivElement>(null),focusSubmenu=useRef(false);
 const tradeRows=entries.some(row=>row.action==='paper-ticket'&&row.submenu)?tradeSubmenuEntries(snapshot):[];
 const childrenOf=(row:MenuEntry):MenuChild[]=>row.action==='paper-ticket'?tradeRows.map(item=>({id:item.id,label:item.label,...(item.order?{options:{order:item.order}}:item.id==='dom'?{options:{item:'dom'}}:{})})):[...(row.children??[])];
 const openRow=trade?entries.find(row=>row.submenu&&row.action===trade.action)??null:null,openChildren=openRow?childrenOf(openRow):[];
 useEffect(()=>{if(trade&&focusSubmenu.current){focusSubmenu.current=false;submenu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();}},[trade]);
 function openTrade(row:MenuEntry,withFocus:boolean){
  const box=subRows.current.get(row.action)?.getBoundingClientRect?.(),width=260,rowTop=box?box.top:(snapshot.client?.y??0),right=box?box.right:(snapshot.client?.x??0)+width;
  const left=right+2+width<=window.innerWidth?right+2:Math.max(0,(box?box.left:right-width)-width-2),top=Math.max(0,Math.min(rowTop-6,window.innerHeight-60*childrenOf(row).length));
  focusSubmenu.current=withFocus;setTrade({action:row.action,left,top});
 }
 // The target can read as not current for a moment while the chart applies an update (an autosave, a live write, a
 // drawing capture); the menu stays open through that and closes only when the target stays retired for
 // CONTEXT_MENU_STALE_GRACE_MS. A choice made meanwhile runs once the target is current again (or is dropped with the menu).
 const queued=useRef<(()=>unknown)|null>(null),staleSince=useRef<number|null>(null);
 const whenCurrent=(run:()=>unknown)=>{if(snapshot.controller.contextMenu.isCurrent(snapshot)){queued.current=null;return run();}queued.current=run;return undefined;};
 useEffect(()=>()=>execution.dispose(),[execution]);
 useEffect(()=>{alive.current=true;setError('');setBusy(false);queued.current=null;staleSince.current=null;host.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();const close=()=>latest.current.onClose(snapshot),mine=()=>alive.current&&currentSnapshot.current===snapshot;
  const outside=(event:PointerEvent)=>{if(mine()&&!host.current?.contains(event.target as Node))close();};document.addEventListener('pointerdown',outside,true);
  const timer=setInterval(()=>{if(!mine())return;if(snapshot.controller.contextMenu.isCurrent(snapshot)){staleSince.current=null;const run=queued.current;queued.current=null;void run?.();return;}const now=Date.now();staleSince.current??=now;if(now-staleSince.current>=CONTEXT_MENU_STALE_GRACE_MS){clearInterval(timer);close();}},CONTEXT_MENU_POLL_MS);
  return()=>{alive.current=false;queued.current=null;clearInterval(timer);document.removeEventListener('pointerdown',outside,true);};},[snapshot]);
 const point=snapshot.client??{x:window.innerWidth/2,y:window.innerHeight/2},left=Math.max(0,Math.min(point.x,window.innerWidth-280)),top=Math.max(0,Math.min(point.y,window.innerHeight-420));
 // The measured menu is placed once it is laid out (before paint): below and right of the click,
 // flipped up or left when there is no room, else clamped to the viewport; a menu taller than the viewport scrolls.
 const placeHost=(node:HTMLDivElement|null)=>{(host as React.MutableRefObject<HTMLDivElement|null>).current=node;fitFixedMenu(node,{x:point.x,y:point.y});};
 return <div ref={placeHost} data-lv-context-menu="true" tabIndex={-1} role="menu" aria-label="Chart context menu" className="lv-popup-menu lv-chart-context-menu" style={{left,top}} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{event.stopPropagation();if(!alive.current||currentSnapshot.current!==snapshot)return;
  const active=document.activeElement as HTMLElement|null,inSubmenu=!!trade&&!!active&&!!submenu.current?.contains(active),activeRow=active?entries.find(row=>row.submenu&&subRows.current.get(row.action)===active)??null:null,tradeKey=event.nativeEvent.isComposing?null:tradeMenuKey(event.key,{onTrade:!!activeRow,inSubmenu});
  if(tradeKey==='open'&&activeRow){event.preventDefault();if(childrenOf(activeRow).length)openTrade(activeRow,true);return;}
  if(tradeKey==='close'){event.preventDefault();const back=trade?subRows.current.get(trade.action):undefined;setTrade(null);back?.focus();return;}
  const action=contextMenuKeyAction(event.key,event.nativeEvent.isComposing);if(action==='ignore'){event.preventDefault();return;}if(action==='dismiss'){event.preventDefault();focus.dismiss('escape');onClose(snapshot);}else if(action==='navigate'){event.preventDefault();const scope=inSubmenu?submenu.current!:host.current!,buttons=[...scope.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button=>inSubmenu||!submenu.current?.contains(button)),i=buttons.indexOf(document.activeElement as HTMLButtonElement),n=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[n]?.focus();}}}>
 {entries.map((row,index)=><React.Fragment key={row.action+(row.item?':'+row.item:'')}>{index>0&&entries[index-1]!.group!==row.group&&<hr role="separator" className="lv-popup-separator"/>}{row.submenu
  ?<button ref={node=>{if(node)subRows.current.set(row.action,node);else subRows.current.delete(row.action);}} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={trade?.action===row.action} disabled={busy||!!error||!childrenOf(row).length} onMouseEnter={()=>{if(trade?.action!==row.action)openTrade(row,false);}} onClick={()=>{if(trade?.action===row.action)setTrade(null);else openTrade(row,true);}}>{menuIcon(row.action)}<span>{row.label}</span></button>
  :<button type="button" role="menuitem" disabled={busy||!!error} aria-keyshortcuts={row.hint?row.hint.replace(/ \+ /g,'+'):undefined} onMouseEnter={()=>{if(trade)setTrade(null);}} onClick={()=>whenCurrent(()=>execution.execute(row.action,row.item?{item:row.item}:undefined))}>{menuIcon(row.action)}<span>{row.label}</span>{row.hint&&<span className="lv-popup-shortcut">{row.hint}</span>}</button>}</React.Fragment>)}
 {trade&&openRow&&openChildren.length>0&&<div ref={node=>{(submenu as React.MutableRefObject<HTMLDivElement|null>).current=node;const row=subRows.current.get(openRow.action)?.getBoundingClientRect?.();if(row)fitFixedMenu(node,{x:row.right+2,y:row.top-6,flipRight:row.left-2,flipBottom:row.bottom+6});}} role="menu" aria-label={openRow.action==='paper-ticket'?'Trade':openRow.submenuLabel??openRow.label} className="lv-popup-menu lv-chart-context-submenu" style={{left:trade.left,top:trade.top}}>{openChildren.map(row=><button key={row.id} type="button" role={row.checked===undefined?'menuitem':'menuitemradio'} aria-checked={row.checked===undefined?undefined:row.checked} disabled={busy||!!error} onClick={()=>whenCurrent(()=>execution.execute(openRow.action,row.options??(openRow.action==='paper-ticket'?undefined:{item:row.id})))}>{row.label}</button>)}</div>}
 {error&&<output role="alert">That action didn't work. Try again.</output>}
 </div>;
}
