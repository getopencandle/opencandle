// Indicator legend model: hover button order and the More menu, as pure data.
// The Object tree row menu is the same menu without Object tree.
// Wording of reasons is OpenCandle's own. Visual order and Copy are hidden unless connected; other unconnected rows stay disabled. No chart mutation happens here; the host wires each id to its action.
import type {IndicatorScaleSide} from './indicator-scale';
import type {IndicatorInstanceSettings} from './indicator-settings';

export type LegendKind='indicator'|'series';
export interface LegendState {hidden:boolean;intervalRestricted:boolean;multiChart?:boolean}
export type LegendButtonId='flag'|'sync'|'hide'|'intervalSettings'|'settings'|'remove'|'more';
export interface LegendButton {id:LegendButtonId;qaId:string;tooltip:string;width:number;height:number}
/** Every legend button is 28x22. */
export const LEGEND_BUTTON_SIZE=Object.freeze({width:28,height:22});
const button=(id:LegendButtonId,qaId:string,tooltip:string):LegendButton=>({id,qaId,tooltip,...LEGEND_BUTTON_SIZE});

/** Hover buttons in DOM order. The indicator row omits Source code (no Pine) and shows the interval button only when
 * interval visibility is restricted. The main series row never offers Hide. */
export function legendButtons(kind:LegendKind,state:LegendState):LegendButton[]{
 if(kind==='series')return[button('flag','legend-flag-action','Flag symbol'),...(state.multiChart?[button('sync','legend-layout-chart-sync-action','Symbol/interval chart syncing')]:[]),button('more','legend-more-action','More')];
 return[
  button('hide','legend-show-hide-action',state.hidden?'Show':'Hide'),
  ...(state.intervalRestricted?[button('intervalSettings','legend-interval-show-hide-action','Show interval settings')]:[]),
  button('settings','legend-settings-action','Settings'),
  button('remove','legend-delete-action','Remove'),
  button('more','legend-more-action','More'),
 ];
}

/** A compared symbol's legend row (the reference gives each compared symbol a row of its own): Hide/Show,
 * Settings (the Compare dialog) and Remove, with the indicator row's qa ids and sizes. No More menu here yet. */
export function comparisonLegendButtons(hidden:boolean):LegendButton[]{
 return[button('hide','legend-show-hide-action',hidden?'Show':'Hide'),button('settings','legend-settings-action','Settings'),button('remove','legend-delete-action','Remove')];
}

export const LEGEND_TOGGLER_QA_ID='legend-toggler';

export type LegendMoreItemId='anchor'|'alert'|'addIndicator'|'favorite'|'visualOrder'|'intervals'|'moveTo'|'pinToScale'|'copy'|'hide'|'remove'|'objectTree'|'settings';
export type LegendAvailability={state:'enabled'}|{state:'unavailable';reason:string};
/** One More menu row; the indicator menu and the main series menu (src/ui/series-legend-menu.ts) share the shape. */
export type MoreRow<Id extends string>=
 |{kind:'separator';id:string}
 |{kind:'item';id:Id;label:string;hotkey?:string;availability:LegendAvailability};
export type LegendMoreRow=MoreRow<LegendMoreItemId>;
/** Separators never lead, trail or double up. */
export function tidyMoreRows<Row extends {kind:string}>(rows:readonly Row[]):Row[]{
 const out:Row[]=[];
 for(const row of rows){if(row.kind==='separator'&&(!out.length||out[out.length-1]!.kind==='separator'))continue;out.push(row);}
 while(out.length&&out[out.length-1]!.kind==='separator')out.pop();
 return out;
}
export interface LegendMoreContext {
 surface:'legend'|'objectTree';
 /** Short indicator title used in the item wording. */
 title:string;
 /** Live value text for the alert item; null leaves the price out of the wording. */
 value:string|null;
 hidden:boolean;
 favorite:boolean;
 /** Renderer-reported placement; null when the indicator is not mounted or placement is not reported. */
 scalePlacement?:IndicatorScaleSide|null;
 /** Side of the main price scale; absent = right. A shared indicator rides it, so its Pin to scale wording follows. */
 mainScaleSide?:'left'|'right';
 /** Per-item route switches. Alert, addIndicator, favorite, intervals, moveTo, hide, remove, objectTree and settings default
 * to connected; visualOrder, copy and anchor default to not connected: the host connects them (visualOrder when the
 * indicator shares its pane, copy through indicatorClipboard, anchor for Anchored VWAP). */
 routes?:Partial<Record<LegendMoreItemId,boolean>>;
 /** Move to and Pin to scale exist only when the indicator is "not linked to series".
 * True marks Move to and Pin to scale unavailable. The "Visual order" condition ("indicator on the same pane")
 * is carried by routes.visualOrder, which the host sets only when the port has an order action and the pane is shared. */
 linkedToSeries?:boolean;
}

// Labels read "Pin to scale (now right)" and "(now no scale)". "its own scale" (LV's separate right
// column) and "left scale" (the left choice is otherwise named only inside the submenu).
const PLACEMENT_WORDS:Record<IndicatorScaleSide,string>={shared:'right',own:'its own scale',left:'left scale',none:'no scale'};
/** The Pin to scale item label for a placement (null: not mounted). Shared with the Object tree row menu. */
export const pinToScaleLabel=(placement:IndicatorScaleSide|null,mainSide:'left'|'right'='right'):string=>placement===null?'Pin to scale':'Pin to scale (now '+(placement==='shared'?mainSide:PLACEMENT_WORDS[placement])+')';
const REASONS={
 route:'This action is not connected on the chart yet.',
 visualOrder:'This indicator is alone on its pane, so there is nothing to order it against.',
 copy:'This indicator cannot be copied here.',
 pin:'This indicator is not mounted on the chart, so its scale cannot be changed.',
 linked:'This indicator is linked to the main series, so it cannot be moved or pinned on its own.',
} as const;

/** The More menu rows: 16 for the legend (12 items, 4 separators), 14 for the object tree (no Object tree item). */
export function legendMoreMenu(_kind:LegendKind,context:LegendMoreContext):LegendMoreRow[]{
 const routes=context.routes??{};
 const on=(id:LegendMoreItemId,fallback=true)=>routes[id]??fallback;
 const state=(id:LegendMoreItemId,reason:string=REASONS.route,fallback=true):LegendAvailability=>on(id,fallback)?{state:'enabled'}:{state:'unavailable',reason};
 const placement=context.scalePlacement??null;
 const pin:LegendAvailability=context.linkedToSeries?{state:'unavailable',reason:REASONS.linked}:placement===null?{state:'unavailable',reason:REASONS.pin}:state('pinToScale');
 const item=(id:LegendMoreItemId,label:string,availability:LegendAvailability,hotkey?:string):LegendMoreRow=>({kind:'item',id,label,availability,...(hotkey?{hotkey}:{})});
 const sep=(order:number):LegendMoreRow=>({kind:'separator',id:'separator-'+order});
 const rows:LegendMoreRow[]=[
  item('alert','Add alert on '+context.title+(context.value?' at '+context.value:'')+'…',state('alert'),'Alt + A'),
  item('addIndicator','Add indicator/strategy on '+context.title+'…',state('addIndicator')),
  // The remove-from-favorites wording (the fact records only "Add this indicator to favorites").
  item('favorite',context.favorite?'Remove this indicator from favorites':'Add this indicator to favorites',state('favorite')),
  sep(4),
  // Anchored VWAP only: re-enter the click-a-bar placement (the host connects it for that kind).
  item('anchor','Change anchor',state('anchor',REASONS.route,false)),
  item('visualOrder','Visual order',state('visualOrder',REASONS.visualOrder,false)),
  item('intervals','Visibility on intervals',state('intervals')),
  item('moveTo','Move to',context.linkedToSeries?{state:'unavailable',reason:REASONS.linked}:state('moveTo')),
  item('pinToScale',pinToScaleLabel(placement,context.mainScaleSide),pin),
  sep(9),
  item('copy','Copy',state('copy',REASONS.copy,false),'Ctrl + C'),
  item('hide',context.hidden?'Show':'Hide',state('hide')),
  item('remove','Remove',state('remove'),'Del'),
  sep(13),
  item('objectTree','Object tree',state('objectTree')),
  sep(15),
  item('settings','Settings…',state('settings')),
 ];
 // The object tree menu is the legend menu minus Object tree and the separator before it.
 const shown=context.surface==='objectTree'?rows.filter(row=>!(row.kind==='item'&&row.id==='objectTree')&&!(row.kind==='separator'&&row.id==='separator-13')):rows;
 // Rows without a connected behavior (Visual order, Copy, Change anchor) are hidden, not shown disabled; separators never lead, trail or double up.
 return tidyMoreRows(shown.filter(row=>!(row.kind==='item'&&(row.id==='visualOrder'||row.id==='copy'||row.id==='anchor')&&row.availability.state==='unavailable')));
}

// Indicator Visual order. OpenCandle stacks its indicators in their list order (the
// legend and Object tree order, which the saved snapshot keeps): the renderer mounts each one behind those mounted before it,
// so the first listed indicator of a pane paints in front. A Visual order step therefore reorders the list among the
// indicators that share the pane, and the chart re-mounts them in that order through the indicator port's own restore (the
// path undo, redo and layout restore take). The candles stay above the indicators. The stacking rule
// is our own choice.
export type IndicatorOrderStep='front'|'back'|'forward'|'backward';
export interface IndicatorOrderRow {id:string;paneId:string|null}
/** Disabled flags per step (true: the step cannot move the indicator), as drawingManager.orderState returns them. */
export interface IndicatorOrderState {front:boolean;back:boolean;forward:boolean;backward:boolean}
const peersOf=<Row extends IndicatorOrderRow>(rows:readonly Row[],row:Row)=>row.paneId===null?[row]:rows.filter(item=>item.paneId===row.paneId);
/** Null when the indicator is not listed. */
export function indicatorOrderState(rows:readonly IndicatorOrderRow[],id:string):IndicatorOrderState|null{
 const row=rows.find(item=>item.id===id);if(!row)return null;
 const peers=peersOf(rows,row),at=peers.indexOf(row),first=at<=0,last=at>=peers.length-1;
 return{front:first,forward:first,back:last,backward:last};
}
/** The pane holds another indicator, so Visual order can move this one. */
export function indicatorVisualOrderAvailable(rows:readonly IndicatorOrderRow[],id:string):boolean{
 const row=rows.find(item=>item.id===id);return !!row&&peersOf(rows,row).length>1;
}
/** Every listed id in the order after the step, or null when the step moves nothing. Indicators on other panes keep their slots. */
export function indicatorOrderAfter(rows:readonly IndicatorOrderRow[],id:string,step:IndicatorOrderStep):string[]|null{
 const row=rows.find(item=>item.id===id);if(!row)return null;
 const peers=peersOf(rows,row),at=peers.indexOf(row),order=peers.filter(item=>item!==row);
 const to=step==='front'?0:step==='back'?order.length:step==='forward'?Math.max(0,at-1):Math.min(order.length,at+1);
 if(to===at)return null;
 order.splice(to,0,row);
 const slots=new Set<IndicatorOrderRow>(peers),queue=[...order];
 return rows.map(item=>slots.has(item)?queue.shift()!.id:item.id);
}
/** True when `ids` lists exactly the ids of `rows` once each (a reorder request names every indicator). */
export function isIndicatorPermutation(rows:readonly {id:string}[],ids:readonly string[]):boolean{
 if(ids.length!==rows.length||new Set(ids).size!==ids.length)return false;
 const known=new Set(rows.map(row=>row.id));return ids.every(id=>known.has(id));
}
/** The Visual order submenu: Bring to front, Send to back, Bring forward, Send backward; a step that moves nothing is disabled. */
export const VISUAL_ORDER_ITEMS:readonly {id:IndicatorOrderStep;label:string}[]=Object.freeze([{id:'front',label:'Bring to front'},{id:'back',label:'Send to back'},{id:'forward',label:'Bring forward'},{id:'backward',label:'Send backward'}]);
export function visualOrderItems(state:IndicatorOrderState|null):{id:IndicatorOrderStep;label:string;disabled?:boolean}[]{
 return VISUAL_ORDER_ITEMS.map(item=>({...item,...(!state||state[item.id]?{disabled:true}:{})}));
}
export const isIndicatorOrderStep=(id:string):id is IndicatorOrderStep=>id==='front'||id==='back'||id==='forward'||id==='backward';

// Indicator Copy. The legend, Object tree and chart menus copy one indicator's settings (kind, inputs,
// plot styles, offset and presentation; never its id or pane) into this window's indicator clipboard, kept for the session
// only. The chart menu's "Paste {title}" row then adds it to the clicked chart with a new id at the kind's default placement.
// Drawings keep their own clipboard (Ctrl + V); the separate Paste row wording is our own choice.
type ClipSettings={inputs:IndicatorInstanceSettings['inputs'];plots:IndicatorInstanceSettings['plots'];offset:number;presentation?:IndicatorInstanceSettings['presentation']};
export interface IndicatorClip {readonly kind:IndicatorInstanceSettings['kind'];readonly title:string;readonly settings:Readonly<ClipSettings>}
export function createIndicatorClipboard(){
 let clip:IndicatorClip|null=null;const listeners=new Set<()=>void>();
 const emit=()=>{for(const listener of [...listeners]){try{listener();}catch{/* a listener failure never blocks the others */}}};
 return{
  get:():IndicatorClip|null=>clip,
  copy(row:Pick<IndicatorInstanceSettings,'kind'|'inputs'|'plots'|'offset'|'presentation'>,title:string):IndicatorClip{
   if(!row||typeof row.kind!=='string')throw new Error('This indicator cannot be copied.');
   const settings:ClipSettings=structuredClone({inputs:row.inputs,plots:row.plots,offset:row.offset,...(row.presentation?{presentation:row.presentation}:{})});
   clip=Object.freeze({kind:row.kind,title:typeof title==='string'&&title.trim()?title.trim():row.kind,settings:Object.freeze(settings)});emit();return clip;
  },
  clear(){if(clip){clip=null;emit();}},
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
 };
}
export type IndicatorClipboard=ReturnType<typeof createIndicatorClipboard>;
export const indicatorClipboard:IndicatorClipboard=createIndicatorClipboard();
/** The saved settings a paste adds (a fresh copy each time, shown, no id or pane). */
export function indicatorPasteSettings(clip:IndicatorClip):Pick<IndicatorInstanceSettings,'inputs'|'plots'|'offset'|'visible'|'presentation'>{
 const copy:ClipSettings=structuredClone(clip.settings);
 return{inputs:copy.inputs,plots:copy.plots,offset:copy.offset,visible:true,...(copy.presentation?{presentation:copy.presentation}:{})};
}
export const indicatorCopiedMessage=(title:string)=>title+' copied. Right-click a chart and choose Paste '+title+' to add it.';
