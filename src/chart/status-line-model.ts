// Status line model: maps the chart settings status line document, the bar under the crosshair (or the last bar) and the
// indicator rows to the parts the legend draws. Pure data, no chart access.
// Toggles and their defaults match the Chart settings Status line tab; the logo is an 18px first-letter circle.
// Every part is gated by its own toggle. Missing data produces an explicit unavailable part with a reason, never a blank.
import type {ChartSettingsDocument} from './chart-settings-document';
import {indicatorLegendReadout} from './indicator-display';
import {tickDecimals} from './axis-labels';
import {derivedPriceDecimals,precisionFormatter} from './symbol-precision';

export type StatusLineSettings=ChartSettingsDocument['statusLine'];
export interface StatusLineSeries {symbol:string;name?:string|null;exchange?:string;interval:string;logoUrl?:string|null}
export interface StatusLineBar {time:number;open:number;high:number;low:number;close:number;volume?:number|null}
export interface StatusLineIndicatorRow {id:string;acronym:string;arguments:readonly string[]}
export interface StatusLineOptions {
 /** Whether the indicator legend is expanded (the legend toggler state). */
 legendVisible:boolean;
 /** Number formatter for prices; defaults to two decimals. */
 format?:(value:number)=>string;
 /** Close of the previous session, for the last day change part. Null when the source does not carry one. */
 previousSessionClose?:number|null;
 /** Chart settings > Status line > Indicators > Values (legend.studyValues, stored as appearance
  * lv.indicatorValuesVisible; absent means shown). False leaves the live values out of every indicator row. */
 indicatorValues?:boolean;
}
/** Price text for the status line: a stored Chart settings Precision wins, otherwise the instrument tick sets the decimals
 * (the same rule the price scale follows), otherwise two decimals. Pass the result as `options.format`.
 * `derivedReference` is the shown value of a derived (symbol math) series, such as the header bar's close.
 * When it is a finite number, the decimals are derivedPriceDecimals of it (at least 5 significant digits) for
 * every value the formatter prints, so OHLC and the absolute change share one precision. A stored Precision still wins. */
export function statusLinePriceFormat(precision:string|undefined,instrumentTick:number|undefined,derivedReference?:number|null):(value:number)=>string{
 const fallback=typeof derivedReference==='number'&&Number.isFinite(derivedReference)?derivedPriceDecimals(derivedReference):instrumentTick!==undefined&&instrumentTick>0&&Number.isFinite(instrumentTick)?tickDecimals(instrumentTick):2;
 return precisionFormatter(precision,value=>value.toFixed(fallback));
}
export const LEGEND_TOGGLER_TOOLTIP='Hide indicator legend';
/** The fact records only the expanded tooltip ("Hide indicator legend"); the collapsed wording is ours. */
export const LEGEND_TOGGLER_COLLAPSED_TOOLTIP='Show indicator legend';
export const STATUS_LOGO_DIAMETER=18;
export const STATUS_TITLE_TOOLTIP='Change symbol';
export const STATUS_INTERVAL_TOOLTIP='Change interval';

export type StatusLinePart=
 |{id:'logo';state:'shown';diameter:number;letter:string;image:string|null}
 |{id:'title';state:'shown';text:string;tooltip:string}
 |{id:'interval';state:'shown';text:string;tooltip:string}
 |{id:'exchange';state:'shown';text:string}
 |{id:'chartValues';state:'shown';values:Array<{label:'O'|'H'|'L'|'C';text:string}>}
 |{id:'barChange'|'lastDayChange';state:'shown';absolute:string;percent:string;direction:'up'|'down'|'flat'}
 |{id:'volume';state:'shown';text:string}
 |{id:'title'|'interval'|'exchange'|'chartValues'|'barChange'|'volume'|'lastDayChange';state:'unavailable';reason:string};
export interface StatusLineParts {
 parts:StatusLinePart[];
 indicators:{rows:Array<{id:string;title:string;arguments:string;text:string}>;values:boolean};
 legend:{visible:boolean;tooltip:string};
 background:{visible:boolean;transparency:number};
}

// Two decimals as the default price format, K/M/B volume compaction, the "SYMBOL, Name" join for Symbol and name,
// and a legend toggler that is session state (SCD#statusLine.defaults records showLegend as a persisted legend property;
// persisting it needs the document field proposed in the integration notes).
const defaultFormat=(value:number)=>value.toFixed(2);
const sign=(value:number,text:string)=>value>0?'+'+text:text;
const compactVolume=(value:number)=>{
 const magnitude=Math.abs(value);
 for(const [unit,scale] of [['B',1e9],['M',1e6],['K',1e3]] as const)if(magnitude>=scale)return String(Math.round(value/scale*100)/100)+unit;
 return String(Math.round(value*100)/100);
};
function change(close:number,reference:number|null|undefined,format:(value:number)=>string,reason:string):{absolute:string;percent:string;direction:'up'|'down'|'flat'}|string{
 if(reference===null||reference===undefined||!Number.isFinite(reference))return reason;
 if(reference===0)return 'The previous close is zero, so a percent change cannot be shown.';
 const delta=close-reference,percent=delta/reference*100;
 return{absolute:sign(delta,format(delta)),percent:sign(percent,percent.toFixed(2))+'%',direction:delta>0?'up':delta<0?'down':'flat'};
}

export function statusLineParts(settings:StatusLineSettings,series:StatusLineSeries,bar:StatusLineBar|null,previousBar:StatusLineBar|null,indicators:readonly StatusLineIndicatorRow[],options:StatusLineOptions):StatusLineParts{
 const format=options.format??defaultFormat,parts:StatusLinePart[]=[];
 const unavailable=(id:Extract<StatusLinePart,{state:'unavailable'}>['id'],reason:string):StatusLinePart=>({id,state:'unavailable',reason});
 if(settings.logo)parts.push({id:'logo',state:'shown',diameter:STATUS_LOGO_DIAMETER,letter:(series.symbol.trim().charAt(0)||'?').toUpperCase(),image:series.logoUrl??null});
 if(settings.title.visible){
  const name=series.name?.trim()||'',source=settings.title.source;
  if(source==='symbol')parts.push({id:'title',state:'shown',text:series.symbol,tooltip:STATUS_TITLE_TOOLTIP});
  else if(!name)parts.push(unavailable('title','This symbol has no description to show.'));
  else parts.push({id:'title',state:'shown',text:source==='name'?name:series.symbol+', '+name,tooltip:STATUS_TITLE_TOOLTIP});
 }
 // The interval and exchange parts default to shown. The chart settings document has no toggle for either, so both are always shown.
 parts.push(series.interval.trim()?{id:'interval',state:'shown',text:series.interval,tooltip:STATUS_INTERVAL_TOOLTIP}:unavailable('interval','This chart has no interval to show.'));
 parts.push(series.exchange?.trim()?{id:'exchange',state:'shown',text:series.exchange}:unavailable('exchange','This source carries no exchange.'));
 if(settings.chartValues){
  parts.push(bar?{id:'chartValues',state:'shown',values:[['O',bar.open],['H',bar.high],['L',bar.low],['C',bar.close]].map(([label,value])=>({label:label as 'O'|'H'|'L'|'C',text:format(value as number)}))}:unavailable('chartValues','There is no bar to read values from yet.'));
 }
 if(settings.barChange){
  if(!bar)parts.push(unavailable('barChange','There is no bar to measure a change on yet.'));
  else{const result=change(bar.close,previousBar?.close,format,'There is no previous bar to compare with.');parts.push(typeof result==='string'?unavailable('barChange',result):{id:'barChange',state:'shown',...result});}
 }
 if(settings.volume){
  if(!bar)parts.push(unavailable('volume','There is no bar to read volume from yet.'));
  else if(bar.volume===null||bar.volume===undefined||!Number.isFinite(bar.volume))parts.push(unavailable('volume','This bar carries no volume.'));
  else parts.push({id:'volume',state:'shown',text:compactVolume(bar.volume)});
 }
 if(settings.lastDayChange){
  if(!bar)parts.push(unavailable('lastDayChange','There is no bar to measure a change on yet.'));
  else{const result=change(bar.close,options.previousSessionClose,format,'The previous session close is not available from this source.');parts.push(typeof result==='string'?unavailable('lastDayChange',result):{id:'lastDayChange',state:'shown',...result});}
 }
 const rows=options.legendVisible?indicators.map(row=>({id:row.id,...indicatorLegendReadout(row,{titles:settings.indicatorTitles,inputs:settings.indicatorInputs})})):[];
 return{
  parts,
  indicators:{rows,values:options.indicatorValues!==false},
  legend:{visible:options.legendVisible,tooltip:options.legendVisible?LEGEND_TOGGLER_TOOLTIP:LEGEND_TOGGLER_COLLAPSED_TOOLTIP},
  background:{visible:settings.background.visible,transparency:settings.background.transparency},
 };
}
