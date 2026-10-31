// The main series More menu of the legend, as pure data, and the registry commands its rows run.
// A row the host cannot run in this window is left out (as the indicator menu leaves out Copy and Visual order); a row it
// can run but not right now stays visible, disabled, with its reason. Rows that have a command in the registry
// (src/ui/command-registry.ts) run that command through App's CommandRuns, so no handler is written twice.
import type {AppCommandId} from './command-registry';
import {tidyMoreRows,type LegendAvailability,type MoreRow} from '../chart/legend-model';
import type {LegendSubmenuItem} from './indicator-legend-view';

export type SeriesMoreItemId='alert'|'order'|'addIndicator'|'symbolInfo'|'metrics'|'copyPrice'|'paste'|'tableView'|'moveTo'|'pinToScale'|'hide'|'watchlist'|'note'|'settings';
export type SeriesMoreRow=MoreRow<SeriesMoreItemId>;
/** Series rows that are registry commands. The host runs `commandRuns[SERIES_MORE_COMMANDS[id]]`. */
export const SERIES_MORE_COMMANDS:Readonly<Partial<Record<SeriesMoreItemId,AppCommandId>>>=Object.freeze({alert:'create-alert',addIndicator:'indicators',symbolInfo:'symbol-info',tableView:'table-view',note:'notes'});
/** Metrics submenu children that are registry commands (the fact lists nine; LV has a panel for these two). */
export const SERIES_METRICS_COMMANDS:Readonly<Record<'financials'|'news',AppCommandId>>=Object.freeze({financials:'fundamentals',news:'news'});
const METRIC_LABELS:Record<keyof typeof SERIES_METRICS_COMMANDS,string>={financials:'Financials',news:'News'};
/** Rows with a submenu: a click opens or closes it instead of running anything. */
export const SERIES_SUBMENU_ROWS:ReadonlySet<SeriesMoreItemId>=new Set(['metrics','moveTo','pinToScale','watchlist']);

/** Per row: absent = not connected in this window (left out), null = enabled, text = disabled with that reason. */
export type SeriesAvailability=Partial<Record<SeriesMoreItemId,string|null>>;
export interface SeriesMoreContext {
 /** Ticker shown in the wording ("Add alert on GME at ..."). */
 symbol:string;
 /** Formatted last (or crosshair) price; null leaves the price out of the wording and disables Copy price. */
 price:string|null;
 /** The main series is hidden (the row reads Show). */
 hidden:boolean;
 /** Side of the main price scale; absent = right. */
 mainScaleSide?:'left'|'right';
 availability:SeriesAvailability;
}
export const SERIES_REASONS=Object.freeze({
 price:'There is no price to copy yet.',
 moveTo:'The main series always stays in the top pane in OpenCandle.',
 noScale:'The main series always keeps a price scale in OpenCandle.',
 busy:'This action is not available on this chart right now.',
});

/** The rows, in fact order: alert, order, indicator, Symbol info, Metrics, Copy price, Paste, Table view, Move to, Pin to scale,
 * Hide, Add to watchlist, text note, Settings. "Add financial metric" and "Visual order" have no LV action and are never listed. */
export function seriesMoreMenu(context:SeriesMoreContext):SeriesMoreRow[]{
 const av=context.availability,symbol=context.symbol,at=context.price?' at '+context.price:'';
 const state=(id:SeriesMoreItemId,extra:string|null=null):LegendAvailability|null=>{if(!(id in av))return null;const reason=av[id]??extra;return reason?{state:'unavailable',reason}:{state:'enabled'};};
 const rows:SeriesMoreRow[]=[];
 const item=(id:SeriesMoreItemId,label:string,hotkey?:string,extra:string|null=null)=>{const availability=state(id,extra);if(availability)rows.push({kind:'item',id,label,availability,...(hotkey?{hotkey}:{})});};
 const sep=(order:number)=>rows.push({kind:'separator',id:'separator-'+order});
 item('alert','Add alert on '+symbol+at+'…','Alt + A');
 // The fact shows Shift + T; LV binds no key to the order ticket, so no hotkey is printed.
 item('order','Add order on '+symbol+at+'…');
 item('addIndicator','Add indicator/strategy on '+symbol+'…');
 sep(5);
 item('symbolInfo','Symbol info…');
 item('metrics','Metrics');
 sep(8);
 item('copyPrice',context.price?'Copy price '+context.price:'Copy price',undefined,context.price?null:SERIES_REASONS.price);
 item('paste','Paste','Ctrl + V');
 sep(11);
 item('tableView','Table view');
 sep(13);
 item('moveTo','Move to');
 item('pinToScale','Pin to scale (now '+(context.mainScaleSide==='left'?'left':'right')+')');
 item('hide',context.hidden?'Show':'Hide');
 sep(18);
 item('watchlist','Add '+symbol+' to watchlist');
 item('note','Add text note for '+symbol,'Alt + N');
 sep(21);
 item('settings','Settings…');
 return tidyMoreRows(rows);
}

/** Metrics children with a runner; absent ones are left out. */
export function seriesMetricsItems(available:Partial<Record<keyof typeof SERIES_METRICS_COMMANDS,string|null>>):LegendSubmenuItem[]{
 return (Object.keys(METRIC_LABELS) as (keyof typeof SERIES_METRICS_COMMANDS)[]).filter(id=>id in available).map(id=>({id,label:METRIC_LABELS[id],...(available[id]?{disabled:true,title:available[id]!}:{})}));
}
/** "Move to": New pane above, New pane below. The main series cannot leave its pane in LV. */
export function seriesMoveToItems():LegendSubmenuItem[]{return[{id:'above',label:'New pane above',disabled:true,title:SERIES_REASONS.moveTo},{id:'below',label:'New pane below',disabled:true,title:SERIES_REASONS.moveTo}];}
/** "Pin to scale (now right)": Pinned to right scale, Pin to new left scale, No scale (disabled).
 * The wording with the scale on the left mirrors it ("Pinned to left scale", "Pin to new right scale"). */
export function seriesPinToScaleItems(side:'left'|'right'='right'):LegendSubmenuItem[]{
 return[
  {id:'right',label:side==='right'?'Pinned to right scale':'Pin to new right scale',checked:side==='right'},
  {id:'left',label:side==='left'?'Pinned to left scale':'Pin to new left scale',checked:side==='left'},
  {id:'none',label:'No scale (fullscreen)',disabled:true,title:SERIES_REASONS.noScale},
 ];
}
export const CREATE_LIST_ITEM='create';
export const LIST_ITEM_PREFIX='list:';
/** "Add AAPL to watchlist": the custom lists, then "Create new list…". A list that already holds the
 * symbol is checked (: choosing it again reports that, it never removes the symbol). */
export function seriesWatchlistItems(lists:readonly {id:string;name:string;kind:'custom'|'flag'}[],holds:(listId:string)=>boolean,createReason:string|null=null):LegendSubmenuItem[]{
 return[
  ...lists.filter(list=>list.kind==='custom').map(list=>({id:LIST_ITEM_PREFIX+list.id,label:list.name,checked:holds(list.id)})),
  {id:CREATE_LIST_ITEM,label:'Create new list…',...(createReason?{disabled:true,title:createReason}:{})},
 ];
}
