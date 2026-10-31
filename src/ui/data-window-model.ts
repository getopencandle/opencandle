import type {Bar} from '../domain/types';
import type {IndicatorId} from '../domain/indicators';
import {parseInterval} from '../domain/intervals';
import {demoDataMode} from '../domain/demo-mode';
import {shortIntervalText} from './interval-display';
import {formatIndicatorNumber,isIndicatorPrecision,type IndicatorPrecision} from '../chart/indicator-number-format';
import {indicatorAcronyms,indicatorNames} from './indicator-dialog-model';
import {chartTimeZone,formatChartDateTime,type ChartClockHours} from './chart-time-text';
import {DEFAULT_TIME_SCALE_SETTINGS,formatTimeScaleDate} from '../chart/time-axis-format';

// Pure model for the Data window panel: rows, labels and formatted values at one bar.
// No chart access here.

/** Missing values (warm-up, before the first bar, unavailable inputs). LV glyph; reference glyph unresolved. */
export const DATA_WINDOW_EMPTY='∅';

/** Panel layout sizes in pixels. */
export const DATA_WINDOW_LAYOUT=Object.freeze({itemPitch:26,itemTitleHeight:18,sectionHeaderHeight:38,labelInset:16,sectionTitleInset:52,hideButton:22});

export interface DataWindowSeriesInput {symbol:string;exchange:string;interval:string;description:string;tickSize:number}
export interface DataWindowPlotInput {id:string;label:string;color:string;dataWindow:boolean;values:readonly (number|null)[]}
export interface DataWindowIndicatorInput {id:string;kind:IndicatorId;visible:boolean;offset:number;precision:IndicatorPrecision;plots:readonly DataWindowPlotInput[]}
/** A compare symbol (chart.comparisons) with its own bars, matched to the chart bar by exact time. */
export interface DataWindowComparisonInput {id:string;symbol:string;exchange:string;interval:string;description:string;tickSize:number;color:string;visible:boolean;bars:readonly Bar[]}
/** One script (indicator or strategy) plot; `value` is the chart's own formatted readout text, or null. */
export interface DataWindowScriptPlotInput {id:string;label:string;color:string;dataWindow:boolean;value:string|null}
export interface DataWindowScriptInput {id:string;title:string;visible:boolean;plots:readonly DataWindowScriptPlotInput[]}
export interface DataWindowInput {
 series:DataWindowSeriesInput;
 /** Displayed (calculation) bars; indicator values are aligned to these. */
 bars:readonly Bar[];
 /** Untransformed source bars for "Last day change" (defaults to bars). */
 sourceBars?:readonly Bar[];
 /** Bar under the crosshair; null or out of range means the last bar. */
 index:number|null;
 timezone:string;
 indicators:readonly DataWindowIndicatorInput[];
 hidden?:ReadonlySet<string>;
 /** Chart time hours format (scales.timeHours) for the Time row. Default 24-hours. */
 timeHours?:ChartClockHours;
 /** Chart date format id (scales.dateFormat) for the Date row. Default format-3. */
 dateFormat?:string;
 /** Compare symbols, listed after the main series. */
 comparisons?:readonly DataWindowComparisonInput[];
 /** Script indicators and strategies, listed after the built-in indicators. */
 scripts?:readonly DataWindowScriptInput[];
}
export interface DataWindowRow {key:string;label:string;value:string;color?:string}
export interface DataWindowSection {key:string;kind:'series'|'study'|'compare'|'script';id:string;title:string;tooltip:string;visible:boolean;hidden:boolean;rows:DataWindowRow[]}
export interface DataWindowView {index:number;hovered:boolean;date:DataWindowRow[];sections:DataWindowSection[]}

export const SERIES_SECTION='series';
export const studySection=(id:string)=>'study:'+id;
export const compareSection=(id:string)=>'compare:'+id;
export const scriptSection=(id:string)=>'script:'+id;

/** Decimals implied by the instrument tick size (0.01 -> 2, 0.25 -> 2, 1 -> 0). */
export function tickDecimals(tickSize:number):number{
 if(!Number.isFinite(tickSize)||tickSize<=0)return 2;
 for(let decimals=0;decimals<=10;decimals++){const scaled=tickSize*10**decimals;if(Math.abs(scaled-Math.round(scaled))<1e-9*Math.max(1,scaled))return decimals;}
 return 10;
}
const plain=(text:string)=>text.startsWith('-')&&Number(text)===0?text.slice(1):text;
/** Price at symbol precision (no digit grouping). */
export function formatPrice(value:number|null|undefined,tickSize:number):string{
 if(typeof value!=='number'||!Number.isFinite(value))return DATA_WINDOW_EMPTY;
 return plain(value.toFixed(tickDecimals(tickSize)));
}
/** Abbreviated volume (K/M/B), with a space before the suffix,
 * as the legend shows it ("Vol 39.76 M"). */
export function formatVolume(value:number|null|undefined):string{
 if(typeof value!=='number'||!Number.isFinite(value))return DATA_WINDOW_EMPTY;
 const a=Math.abs(value);
 if(a>=1e9)return plain((value/1e9).toFixed(2))+' B';
 if(a>=1e6)return plain((value/1e6).toFixed(2))+' M';
 if(a>=1e3)return plain((value/1e3).toFixed(2))+' K';
 return plain(Number.isInteger(value)?String(value):value.toFixed(2));
}
const signed=(text:string)=>text.startsWith('-')||Number(text)===0?text:'+'+text;
/** Change as "abs (pct%)". Positive sign is LV policy. */
export function formatChange(current:number|null|undefined,previous:number|null|undefined,tickSize:number):string{
 if(typeof current!=='number'||typeof previous!=='number'||!Number.isFinite(current)||!Number.isFinite(previous))return DATA_WINDOW_EMPTY;
 const change=current-previous,abs=signed(formatPrice(change,tickSize));
 if(previous===0)return abs+' ('+DATA_WINDOW_EMPTY+')';
 return abs+' ('+signed(plain((change/Math.abs(previous)*100).toFixed(2)))+'%)';
}
/** Chart header change: close minus the previous bar's close, "+abs (pct%)" with 2 decimals as the
 * header always showed. Without a previous bar (bar 0) there is no change, so the header shows the Data window's empty glyph
 * instead of "+0.00 (0.00%)"; a zero previous close keeps the change and shows the empty glyph for the percent. */
export function chartHeaderChange(current:{close:number}|null|undefined,previous:{close:number}|null|undefined):{text:string;positive:boolean|null}{
 if(!current||!previous||!Number.isFinite(current.close)||!Number.isFinite(previous.close))return{text:DATA_WINDOW_EMPTY,positive:null};
 const change=current.close-previous.close,positive=change>=0,abs=(positive?'+':'')+change.toFixed(2);
 return{text:abs+' ('+(previous.close?(change/previous.close*100).toFixed(2)+'%':DATA_WINDOW_EMPTY)+')',positive};
}
/** The zone the Data window reads, through the shared chart-time-text precedence (an unknown zone is UTC). */
const zone=(timezone:string)=>chartTimeZone(timezone);
/** Weekday + date in the chart date format, e.g. Ddd DD Mon 'YY.
 * The chart Date format (scales.dateFormat) applies; the weekday is always shown. The
 * factory format-3 keeps the two-digit day ("Sat 04 Jul '26"). */
export function formatDataWindowDate(seconds:number,timezone:string,dateFormat?:string):string{
 const shown=zone(timezone);
 if(dateFormat&&dateFormat!==DEFAULT_TIME_SCALE_SETTINGS.dateFormat){const text=formatTimeScaleDate(seconds*1000,shown,{dayOfWeek:true,dateFormat,timeHours:'24'});if(text!==null)return text;}
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:shown,weekday:'short',day:'2-digit',month:'short',year:'2-digit'}).formatToParts(new Date(seconds*1000)).map(part=>[part.type,part.value]));
 return parts.weekday+' '+parts.day+' '+parts.month+" '"+parts.year;
}
/** Intraday charts add a Time row in the chart time zone: the time of day of the shared chart-time-text
 * formatter (formatChartDateTime, no zone suffix), so 12-hours reads "2:30 PM" as on every other surface. */
export function formatDataWindowTime(seconds:number,timezone:string,hours:ChartClockHours='24'):string{
 const text=formatChartDateTime(seconds,zone(timezone),{hours,zone:false}),space=text.indexOf(' ');
 return space<0?text:text.slice(space+1);
}
function intervalUnit(interval:string):string|null{try{return parseInterval(interval).unit;}catch{return null;}}
const dayKey=(seconds:number,timezone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone(timezone),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000));
/**
 * "Last day change": latest close
 * against the previous day's final close. Daily charts use the previous bar; intraday charts use
 * the last bar of the previous calendar day in the chart time zone. Weekly and longer charts have
 * no daily close here and show the empty value. Follows the latest bar, not the crosshair.
 */
export function lastDayChange(bars:readonly Bar[],interval:string,timezone:string,tickSize:number):string{
 const last=bars.at(-1);if(!last)return DATA_WINDOW_EMPTY;
 const unit=intervalUnit(interval);
 if(unit==='day')return formatChange(last.close,bars.at(-2)?.close,tickSize);
 if(unit!=='minute'&&unit!=='second')return DATA_WINDOW_EMPTY;
 const today=dayKey(last.time,timezone);
 for(let index=bars.length-2;index>=0;index--)if(dayKey(bars[index].time,timezone)!==today)return formatChange(last.close,bars[index].close,tickSize);
 return DATA_WINDOW_EMPTY;
}
const VOLUME_KINDS=new Set<IndicatorId>(['volume','obv']),PERCENT_KINDS=new Set<IndicatorId>(['rsi','stochastic']);
/**
 * Indicator value text. An explicit precision uses the same formatter as the legend
 * (formatIndicatorNumber). Automatic precision is LV policy: volume-unit plots abbreviate,
 * RSI and Stochastic use 2 decimals, price-unit plots use the symbol precision.
 */
/** What a reader needs to show an indicator plot the way it is drawn. offset is the instance display offset in bars. */
export interface IndicatorPlotReading {kind:IndicatorId;offset?:number;precision:IndicatorPrecision}
/**
 * The text of one indicator plot at chart bar `bar` (null = the last value), exactly as it is drawn: the plot is shifted by
 * the display offset, so the value at a bar is values[bar - offset] (outside the series is the empty glyph), formatted by
 * formatIndicatorValue with the instance precision and the symbol tick size. The data window, the table view and the main
 * legend all read through this one function so they cannot disagree.
 */
export function indicatorPlotTextAt(values:ArrayLike<number|null>,bar:number|null,reading:IndicatorPlotReading,tickSize:number):string{
 const offset=Number.isSafeInteger(reading.offset)?reading.offset as number:0,at=bar===null?values.length-1:bar,source=at-offset;
 return formatIndicatorValue(source>=0&&source<values.length?values[source]:null,reading.kind,reading.precision,tickSize);
}
export function formatIndicatorValue(value:number|null|undefined,kind:IndicatorId,precision:IndicatorPrecision,tickSize:number):string{
 if(typeof value!=='number'||!Number.isFinite(value))return DATA_WINDOW_EMPTY;
 if(precision!=='auto'&&isIndicatorPrecision(precision))return formatIndicatorNumber(value,precision);
 if(VOLUME_KINDS.has(kind))return formatVolume(value);
 if(PERCENT_KINDS.has(kind))return plain(value.toFixed(2));
 return formatPrice(value,tickSize);
}

/** Section header pattern: "{symbol} · {interval} · {exchange}". */
/** The interval reads as the chart header does (240m is 4h), and the demo exchange code (SYNTHETIC) is not
 *  shown outside the legacy demo. */
export function seriesSectionTitle(series:DataWindowSeriesInput):string{return [series.symbol,shortIntervalText(series.interval),series.exchange==='SYNTHETIC'&&demoDataMode()!=='legacy'?'':series.exchange].filter(Boolean).join(' · ');}

export function buildDataWindow(input:DataWindowInput):DataWindowView{
 const {bars,series}=input,count=bars.length,hidden=input.hidden??new Set<string>();
 const hovered=input.index!==null&&Number.isSafeInteger(input.index)&&input.index>=0&&input.index<count;
 const index=hovered?input.index!:count-1,bar=index>=0?bars[index]:undefined,previous=index>0?bars[index-1]:undefined;
 const unit=intervalUnit(series.interval),intraday=unit==='minute'||unit==='second'||unit==='tick'||unit==='range';
 // Date comes first; Time is the LV intraday addition.
 const date:DataWindowRow[]=[{key:'date',label:'Date',value:bar?formatDataWindowDate(bar.time,input.timezone,input.dateFormat):DATA_WINDOW_EMPTY}];
 if(intraday)date.push({key:'time',label:'Time',value:bar?formatDataWindowTime(bar.time,input.timezone,input.timeHours):DATA_WINDOW_EMPTY});
 // The series value rows.
 const seriesRows:DataWindowRow[]=[
  {key:'open',label:'Open',value:formatPrice(bar?.open,series.tickSize)},
  {key:'high',label:'High',value:formatPrice(bar?.high,series.tickSize)},
  {key:'low',label:'Low',value:formatPrice(bar?.low,series.tickSize)},
  {key:'close',label:'Close',value:formatPrice(bar?.close,series.tickSize)},
  {key:'change',label:'Change',value:formatChange(bar?.close,previous?.close,series.tickSize)},
  {key:'vol',label:'Vol',value:formatVolume(bar?.volume)},
  {key:'last-day-change',label:'Last day change',value:lastDayChange(input.sourceBars??bars,series.interval,input.timezone,series.tickSize)},
 ];
 const sections:DataWindowSection[]=[{key:SERIES_SECTION,kind:'series',id:SERIES_SECTION,title:seriesSectionTitle(series),tooltip:series.description,visible:true,hidden:hidden.has(SERIES_SECTION),rows:hidden.has(SERIES_SECTION)?[]:seriesRows}];
 // Compare symbols follow the main series (they sit under it in the legend). Each one reads its own bar
 // at the chart bar's exact time (the comparison's own alignment rule) and shows prices, not the percent the line plots.
 for(const compare of input.comparisons??[]){
  const key=compareSection(compare.id),isHidden=hidden.has(key);
  sections.push({key,kind:'compare',id:compare.id,title:seriesSectionTitle(compare),tooltip:compare.description,visible:compare.visible,hidden:isHidden,rows:isHidden?[]:comparisonRows(compare,bar?.time)});
 }
 // Each indicator in legend order; one row per plot.
 for(const study of input.indicators){
  const key=studySection(study.id),isHidden=hidden.has(key);
  const rows=isHidden?[]:study.plots.filter(plot=>plot.dataWindow).map(plot=>({key:plot.id,label:plot.label,value:indicatorPlotTextAt(plot.values,index,study,series.tickSize),color:plot.color}));
  sections.push({key,kind:'study',id:study.id,title:indicatorAcronyms[study.kind]??study.kind,tooltip:indicatorNames[study.kind]??study.kind,visible:study.visible,hidden:isHidden,rows});
 }
 // Script indicators and strategies: one row per plot shown in the data window, as built-in indicators.
 for(const script of input.scripts??[]){
  const key=scriptSection(script.id),isHidden=hidden.has(key);
  const rows=isHidden?[]:script.plots.filter(plot=>plot.dataWindow).map(plot=>({key:plot.id,label:plot.label,value:plot.value??DATA_WINDOW_EMPTY,color:plot.color}));
  sections.push({key,kind:'script',id:script.id,title:script.title,tooltip:script.title,visible:script.visible,hidden:isHidden,rows});
 }
 return {index,hovered,date,sections};
}

const compareIndex=new WeakMap<readonly Bar[],Map<number,number>>();
function comparisonAt(bars:readonly Bar[],time:number):number{
 let byTime=compareIndex.get(bars);
 if(!byTime){byTime=new Map(bars.map((row,position)=>[row.time,position]));compareIndex.set(bars,byTime);}
 return byTime.get(time)??-1;
}
/** The compare symbol's rows at chart time `time`: its own Open, High, Low, Close, Change (against its previous bar) and Vol,
 * in its own symbol precision and line colour. No bar at that exact time shows the empty value in every row. */
export function comparisonRows(compare:DataWindowComparisonInput,time:number|undefined):DataWindowRow[]{
 const at=typeof time==='number'?comparisonAt(compare.bars,time):-1,row=at>=0?compare.bars[at]:undefined,previous=at>0?compare.bars[at-1]:undefined;
 return [
  {key:'open',label:'Open',value:formatPrice(row?.open,compare.tickSize),color:compare.color},
  {key:'high',label:'High',value:formatPrice(row?.high,compare.tickSize),color:compare.color},
  {key:'low',label:'Low',value:formatPrice(row?.low,compare.tickSize),color:compare.color},
  {key:'close',label:'Close',value:formatPrice(row?.close,compare.tickSize),color:compare.color},
  {key:'change',label:'Change',value:formatChange(row?.close,previous?.close,compare.tickSize),color:compare.color},
  {key:'vol',label:'Vol',value:formatVolume(row?.volume),color:compare.color},
 ];
}
