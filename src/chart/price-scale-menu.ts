// Price scale context menu and bottom-toolbar models: order, labels, checkmarks,
// hotkey hints and availability. Each entry carries a stable factId;
// availability reasons are OpenCandle wording.
import {formatPriceToBarRatio,type PaneScaleView,type PriceScaleLabelId,type PriceScaleLineId,type PriceScaleModeId,type PriceScaleSettings} from './price-scale-state';

export type PriceScaleActionId='reset'|'auto'|'lockRatio'|'scaleSeriesOnly'|'invert'|PriceScaleModeId|'moveLeft'|'moveRight'|'mergeLeft'|'mergeRight'|`labels.${PriceScaleLabelId}`|`lines.${PriceScaleLineId}`|'plusButton'|'more';
export interface PriceScaleMenuItem {kind:'item';id:PriceScaleActionId;factId:string;label:string;role:'menuitem'|'menuitemcheckbox'|'menuitemradio';checked?:boolean;shortcut?:string;hint?:string;disabled?:string}
export interface PriceScaleMenuSeparator {kind:'separator';factId:string}
export interface PriceScaleSubmenu {kind:'submenu';id:'merge'|'labels'|'lines';factId:string;label:string;items:(PriceScaleMenuItem|PriceScaleMenuSeparator)[];disabled?:string}
export type PriceScaleMenuEntry=PriceScaleMenuItem|PriceScaleMenuSeparator|PriceScaleSubmenu;

/** What the host chart can honor. Every false capability renders as a disabled entry with a reason; nothing is faked. */
export interface PriceScaleMenuContext {
 pane:PaneScaleView;
 settings:PriceScaleSettings;
 /** Current price-to-bar ratio of the main series scale (shown right-aligned beside Lock). */
 ratio:number|null;
 /** Number of price scales on this pane: its master scale plus every stacked indicator scale column (left or right). */
 scaleCount:number;
 /** True for Point & Figure (modes are disabled there per menu.regular). LV has no P&F style yet. */
 pointAndFigure?:boolean;
 /** Host bindings available for this chart. `mainSide`: the settings document is bound (commitSettings), so a scale move can be saved. */
 host:{appearance:boolean;openSettings:boolean;mainSide?:boolean;
  /** The chart can move this pane's indicator scales back onto the pane scale (Merge all scales into one). */
  merge?:boolean};
 /** The renderer's actual main price scale side (LV-VELA-SCALE-LEFT-1); absent when the renderer cannot move the scale. */
 mainSide?:'left'|'right';
 /** Instrument data availability for conditional labels. */
 data?:{prePost:boolean;bidAsk:boolean};
}

const UNSUPPORTED={
 move:'OpenCandle can move only the main price scale.',
 moveRenderer:'This chart renderer cannot move the price scale.',
 merge:'This chart cannot merge its price scales.',
 mergeLeft:'Only the main price scale can merge on the left. Use On the right for this pane.',
 prePost:'This source has no pre-market, post-market or overnight prices.',
 binding:'This chart is not connected to its saved workspace settings.',
 lockedMode:'Unlock the price to bar ratio to change the scale mode.',
 lockedAuto:'Unlock the price to bar ratio to use auto scale.',
} as const;

const check=(id:PriceScaleActionId,factId:string,label:string,checked:boolean,extra:Partial<PriceScaleMenuItem>={}):PriceScaleMenuItem=>({kind:'item',id,factId,label,role:'menuitemcheckbox',checked,...extra});
const sep=(factId:string):PriceScaleMenuSeparator=>({kind:'separator',factId});

/** Root menu, Reset first and More last. */
export function priceScaleMenuEntries(context:PriceScaleMenuContext):PriceScaleMenuEntry[]{
 const {pane,settings}=context,main=pane.kind==='price',locked=main&&settings.lockRatio;
 const modeDisabled=locked?UNSUPPORTED.lockedMode:context.pointAndFigure?'Scale modes are unavailable for this chart type.':undefined;
 const rows:PriceScaleMenuEntry[]=[];
 // menu.reset: shown only after the scale was changed by hand (auto off).
 if(!pane.auto)rows.push({kind:'item',id:'reset',factId:'menu.reset',label:'Reset price scale',role:'menuitem',shortcut:'Alt + R'},sep('menu.reset.followedBy'));
 rows.push(check('auto','menu.auto','Auto (fits data to screen)',pane.auto,locked?{disabled:UNSUPPORTED.lockedAuto}:{}));
 if(main)rows.push(check('lockRatio','menu.lockRatio','Lock price to bar ratio',settings.lockRatio,{hint:formatPriceToBarRatio(settings.lockRatio?settings.ratio:context.ratio)}));
 rows.push(check('scaleSeriesOnly','menu.scaleSeriesOnly','Scale price chart only',settings.scaleSeriesOnly));
 rows.push(check('invert','menu.invert','Invert scale',pane.invert,{shortcut:'Alt + I'}));
 rows.push(sep('menu.sep1'));
 const mode=(id:PriceScaleModeId,factId:string,label:string,shortcut?:string):PriceScaleMenuItem=>({kind:'item',id,factId,label,role:'menuitemradio',checked:pane.mode===id,...(shortcut?{shortcut}:{}),...(modeDisabled?{disabled:modeDisabled}:{})});
 rows.push(mode('regular','menu.regular','Regular'),mode('percent','menu.percent','Percent','Alt + P'),mode('indexed','menu.indexed','Indexed to 100'),mode('logarithmic','menu.log','Logarithmic','Alt + L'));
 rows.push(sep('menu.sep2'));
 // menu.merge: a submenu with several scales; a single item with one scale on the right.
 // Merging moves every indicator scale column of this pane onto the pane scale, then puts that scale on
 // the chosen side. Only the main price scale can change side (LV-VELA-SCALE-LEFT-1), so a study pane merges on the right.
 if(context.scaleCount>1){
  const side=main&&context.mainSide==='left'?'left':'right';
  const mergeReason=(target:'left'|'right')=>!context.host.merge?UNSUPPORTED.merge:target===side?undefined:!main?UNSUPPORTED.mergeLeft:!context.mainSide?UNSUPPORTED.moveRenderer:!context.host.mainSide?UNSUPPORTED.binding:undefined;
  const merge=(id:'mergeLeft'|'mergeRight',label:string,target:'left'|'right'):PriceScaleMenuItem=>{const disabled=mergeReason(target);return {kind:'item',id,factId:'menu.merge',label,role:'menuitem',...(disabled?{disabled}:{})};};
  rows.push({kind:'submenu',id:'merge',factId:'menu.merge',label:'Merge all scales into one',items:[merge('mergeLeft','On the left','left'),merge('mergeRight','On the right','right')]});
 }
 else{
  // variantWhenSingleScale: 'Move scale to left' with the scale on the right, 'Move scale to right' with it on the left.
  const left=main&&context.mainSide==='left';
  const disabled=!main?UNSUPPORTED.move:!context.mainSide?UNSUPPORTED.moveRenderer:!context.host.mainSide?UNSUPPORTED.binding:undefined;
  rows.push({kind:'item',id:left?'moveRight':'moveLeft',factId:'menu.merge',label:left?'Move scale to right':'Move scale to left',role:'menuitem',...(disabled?{disabled}:{})});
 }
 rows.push(sep('menu.sep3'));
 rows.push({kind:'submenu',id:'labels',factId:'menu.labels',label:'Labels',items:priceScaleLabelItems(context)});
 rows.push({kind:'submenu',id:'lines',factId:'menu.lines',label:'Lines',items:priceScaleLineItems(context)});
 rows.push(check('plusButton','menu.plus','Plus button',settings.plusButton));
 rows.push(sep('menu.sep4'));
 rows.push({kind:'item',id:'more',factId:'menu.more',label:'More settings...',role:'menuitem',...(context.host.openSettings?{}:{disabled:UNSUPPORTED.binding})});
 return rows;
}

/** Labels submenu (12 entries).
 * Conditional entries: bid/ask only with a bid/ask source, average close only with its
 * featureset (not observed as on, so hidden), pre/post disabled without extended-hours prices. */
export function priceScaleLabelItems(context:PriceScaleMenuContext):(PriceScaleMenuItem|PriceScaleMenuSeparator)[]{
 const {labels}=context.settings,appearance=context.host.appearance?{}:{disabled:UNSUPPORTED.binding},main=context.pane.kind==='price';
 const rows:(PriceScaleMenuItem|PriceScaleMenuSeparator)[]=[
  check('labels.symbolName','labels.symbolName','Symbol name label',labels.symbolName),
  check('labels.symbolLast','labels.symbolLast','Symbol last price label',labels.symbolLast),
  check('labels.prevClose','labels.prevClose','Symbol previous day close price label',labels.prevClose),
  check('labels.prePost','labels.prePost','Pre/post/night market price label',labels.prePost,context.data?.prePost?{}:{disabled:UNSUPPORTED.prePost}),
  check('labels.highLow','labels.highLow','High and low price labels',labels.highLow),
 ];
 if(context.data?.bidAsk)rows.push(check('labels.bidAsk','labels.bidAsk','Bid and ask labels',labels.bidAsk));
 rows.push(
  check('labels.indName','labels.indName','Indicators and financials name labels',labels.indName),
  check('labels.indValue','labels.indValue','Indicators and financials value labels',labels.indValue),
 );
 if(main)rows.push(check('labels.countdown','labels.countdown','Countdown to bar close',labels.countdown,appearance));
 rows.push(sep('labels.sep'),check('labels.noOverlap','labels.noOverlap','No overlapping labels',labels.noOverlap));
 return rows;
}

/** Lines submenu. Bid and ask lines need a bid/ask source. */
export function priceScaleLineItems(context:PriceScaleMenuContext):(PriceScaleMenuItem|PriceScaleMenuSeparator)[]{
 const {lines}=context.settings,appearance=context.host.appearance?{}:{disabled:UNSUPPORTED.binding};
 const rows:(PriceScaleMenuItem|PriceScaleMenuSeparator)[]=[
  check('lines.priceLine','lines.priceLine','Price line',lines.priceLine,appearance),
  check('lines.prevCloseLine','lines.prevCloseLine','Previous day close price line',lines.prevCloseLine),
  check('lines.prePostLine','lines.prePostLine','Pre/post/night market price line',lines.prePostLine),
  check('lines.highLowLines','lines.highLowLines','High and low price lines',lines.highLowLines,appearance),
 ];
 if(context.data?.bidAsk)rows.push(check('lines.bidAskLines','lines.bidAskLines','Bid and ask lines',lines.bidAskLines));
 return rows;
}

/** The price scale hotkeys; codes are physical keys. */
export const PRICE_SCALE_HOTKEYS=Object.freeze([
 {code:'KeyI',keys:'Alt + I',action:'invert' as const,factId:'hotkey.1'},
 {code:'KeyP',keys:'Alt + P',action:'percent' as const,factId:'hotkey.2'},
 {code:'KeyL',keys:'Alt + L',action:'logarithmic' as const,factId:'hotkey.3'},
 {code:'KeyR',keys:'Alt + R',action:'resetChart' as const,factId:'hotkey.4'},
]);
export type PriceScaleHotkeyAction=(typeof PRICE_SCALE_HOTKEYS)[number]['action'];
/** Alt plus exactly one of I/P/L/R with no other modifier, outside composition. */
export function priceScaleHotkey(event:{code?:string;key?:string;altKey:boolean;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;isComposing?:boolean;repeat?:boolean}):PriceScaleHotkeyAction|null{
 if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing)return null;
 const byCode=PRICE_SCALE_HOTKEYS.find(row=>row.code===event.code);
 if(byCode)return byCode.action;
 const key=typeof event.key==='string'&&event.key.length===1?event.key.toUpperCase():'';
 return PRICE_SCALE_HOTKEYS.find(row=>row.code==='Key'+key)?.action??null;
}

/** Bottom toolbar scale toggles: percentage, logarithm, auto. */
export interface PriceScaleToolbarButton {id:'percent'|'logarithmic'|'auto';factId:string;text:string;tooltip:string;dataName:string;pressed:boolean}
/** Pressed state follows the main series scale. While the ratio is locked a click is a
 * no-op; the buttons stay enabled. */
export function priceScaleToolbarButtons(main:PaneScaleView):PriceScaleToolbarButton[]{
 return[
  {id:'percent',factId:'bottom.right.percentage',text:'%',tooltip:'Toggle Percentage',dataName:'percentage',pressed:main.mode==='percent'},
  {id:'logarithmic',factId:'bottom.right.logarithm',text:'log',tooltip:'Toggle Log Scale',dataName:'logarithm',pressed:main.mode==='logarithmic'},
  {id:'auto',factId:'bottom.right.auto',text:'auto',tooltip:'Toggle Auto Scale',dataName:'auto',pressed:main.auto},
 ];
}

/** Flat list of focusable (enabled, non-separator) entries for keyboard navigation. */
export function focusableEntries(entries:readonly PriceScaleMenuEntry[]):(PriceScaleMenuItem|PriceScaleSubmenu)[]{
 return entries.filter((row):row is PriceScaleMenuItem|PriceScaleSubmenu=>row.kind!=='separator'&&!row.disabled);
}
