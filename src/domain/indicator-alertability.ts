import {catalogDefinition,catalogInputValue} from './indicator-catalog';
import {isIntradayResolution} from './indicators-ext/r40-volume-catalog';
import {VP_ALERTABLE_IDS} from './indicators-ext/vp-catalog';
import {sourcePivotCalendar,type PivotCalendar} from './indicators-ext/r23-catalog';
import type {BarDataset} from './types';

/**
 * Which built-in indicators can be a technical alert source.
 *
 * Every catalog kind is alertable on each of its plots, and
 * the alert recalculates it on the observed prefix with the frozen inputs, as for the original ten. Exceptions:
 * the two-symbol kinds (their second series is loaded by a chart, not by the alert evaluation, so the background watcher
 * could not reproduce it) and the volume profile kinds (their rows depend on the visible range, the tick size and finer
 * bars that only a chart supplies). Those stay listed but disabled, with the reason below.
 * The profile kinds that do not follow the visible range (Periodic, Session and Auto anchored) are
 * alertable on their plots with Number Of Rows; `inputs` are the frozen inputs of the source.
 * The two-symbol kinds (Correlation coefficient, Relative strength, Spread) are alertable too. The alert
 * loads its second series through the second-symbol registry and App loader, at its own interval, and waits while it loads
 * (second-symbol-alerts.ts). Only the view-dependent profile kinds stay refused.
 */
export function indicatorAlertBlock(kind:string,inputs?:Readonly<Record<string,unknown>>,resolution?:string|null):string|null{
 const definition=catalogDefinition(kind);
 if(definition?.seasonality)return 'Seasonality is a chart-only study. Background alerts cannot reproduce its private original history and calendar/completion declarations.';
 if(definition?.tradingSessions)return 'Trading sessions is a chart-only visual study. Background alerts cannot capture or evaluate its session decorations.';
 if(kind==='autotrendlines')return 'Auto trendlines is a chart-only visual study. Its lines and pivots are not values, so it cannot be alerted on.';
 if(kind==='autoelliott')return 'Auto Elliott waves is a chart-only visual study. Its wave labels are not values, so it cannot be alerted on.';
 if(!definition)return null;// the original ten are checked by their own rules
 if(definition.dailyHistory&&isIntradayResolution(resolution))return `${definition.name} needs daily history on intraday charts. Background alerts do not receive that history, so it cannot be alerted on.`;
 if(definition.finerBars)return `${definition.name} needs lower-timeframe history that background alerts do not receive, so it cannot be alerted on.`;
 if(definition.viewport&&!definition.profile)return `${definition.name} depends on the chart's visible range, so it cannot be alerted on.`;
 if(definition.profile){
  if(definition.viewport||!(VP_ALERTABLE_IDS as readonly string[]).includes(kind))return `${definition.name} depends on the chart's visible range and finer bars, so it cannot be alerted on.`;
  let layout:unknown;try{layout=catalogInputValue(definition,inputs??{},'rowsLayout');}catch{layout=undefined;}
  if(layout!=='Number Of Rows')return `${definition.name} with Ticks Per Row needs the instrument tick size, which alerts do not have. Use Number Of Rows to alert on it.`;
 }
 return null;
}
/** The chart facts a catalog kind receives on the chart, derived from the observed dataset the same way the chart derives
 *  them from its source (declared resolution; the session calendar of New York stocks, ETFs and indexes, or UTC for crypto). */
export function alertChartFacts(dataset:Pick<BarDataset,'resolution'|'instrument'>):{resolution:string|null;calendar:PivotCalendar|null;exchangeZone:string|null}{
 const resolution=typeof dataset.resolution==='string'&&dataset.resolution.length<=40?dataset.resolution:null,zone=dataset.instrument?.timezone;
 // exchangeZone: the instrument time zone, the same field the chart reads (sourceExchangeTimeZone), for 'Exchange' VWAPs.
 return {resolution,calendar:sourcePivotCalendar(dataset.instrument?.assetClass,dataset.instrument?.timezone)??null,exchangeZone:typeof zone==='string'&&zone.length>0&&zone.length<=80?zone:null};
}
/** The indicator's own name and plot title for alert labels; null for the original ten (they keep their historical label). */
export function catalogAlertTitles(kind:string,plotId:string):{name:string;plot:string}|null{
 const definition=catalogDefinition(kind);if(!definition)return null;
 return {name:definition.name,plot:definition.plots.find(row=>row.id===plotId)?.label??plotId};
}
