// Bottom toolbar model: date range buttons, Go to, the live clock and timezone menu, ADJ, and the
// collapsed date-range variant. Order, labels, tooltips and data names are fixed
// data (each button keeps a factId); the wording of availability reasons is OpenCandle's own.
import type {RangePreset} from './navigation';
import {timezoneOptions} from './chart-settings-facts';
import {intervalLabel,intervalOrderSeconds} from '../domain/intervals';

/** One date range button. `interval` is the interval its tooltip names. */
export interface BottomRange {preset:RangePreset;factId:string;label:string;tooltip:string;dataName:string;interval:string;widthPx:number}
// Widths: visual-layout-spec#bottomToolbar.order[0].widths (27.9 27.9 29.3 29.3 29.3 36.7 27.3 27.3 28.5).
export const BOTTOM_RANGES:readonly BottomRange[]=Object.freeze(([
 {preset:'1D',factId:'range.1D',label:'1D',tooltip:'1 day in 1 minute intervals',dataName:'date-range-tab-1D',interval:'1m',widthPx:27.9},
 {preset:'5D',factId:'range.5D',label:'5D',tooltip:'5 days in 5 minutes intervals',dataName:'date-range-tab-5D',interval:'5m',widthPx:27.9},
 {preset:'1M',factId:'range.1M',label:'1M',tooltip:'1 month in 30 minutes intervals',dataName:'date-range-tab-1M',interval:'30m',widthPx:29.3},
 {preset:'3M',factId:'range.3M',label:'3M',tooltip:'3 months in 1 hour intervals',dataName:'date-range-tab-3M',interval:'60m',widthPx:29.3},
 {preset:'6M',factId:'range.6M',label:'6M',tooltip:'6 months in 2 hours intervals',dataName:'date-range-tab-6M',interval:'120m',widthPx:29.3},
 {preset:'YTD',factId:'range.YTD',label:'YTD',tooltip:'Year to day in 1 day intervals',dataName:'date-range-tab-YTD',interval:'1D',widthPx:36.7},
 {preset:'1Y',factId:'range.12M',label:'1Y',tooltip:'1 year in 1 day intervals',dataName:'date-range-tab-12M',interval:'1D',widthPx:27.3},
 {preset:'5Y',factId:'range.60M',label:'5Y',tooltip:'5 years in 1 week intervals',dataName:'date-range-tab-60M',interval:'1W',widthPx:27.3},
 {preset:'All',factId:'range.ALL',label:'All',tooltip:'All data in 1 month intervals',dataName:'date-range-tab-ALL',interval:'1M',widthPx:28.5},
] as BottomRange[]).map(row=>Object.freeze(row)));

export function bottomRange(preset:string):BottomRange{
 const row=BOTTOM_RANGES.find(item=>item.preset===preset||item.label===preset||(preset==='ALL'&&item.preset==='All'));
 if(!row)throw Error('Unknown date range: '+preset);
 return row;
}

/** The coarser intervals a range button falls back to, finest first. */
const SERVED_FALLBACKS=['1m','5m','15m','30m','60m','120m','240m','1D','1W','1M'];
/** Each range opens in the interval its tooltip names (5Y opens 1W). When this chart's data cannot serve that
 * interval (1D on daily-only data), the button opens the nearest coarser servable interval and its tooltip names that one.
 * Null: nothing servable, the button is disabled. */
export function servedBottomRange(row:BottomRange,servable:(interval:string)=>boolean):{interval:string;tooltip:string}|null{
 if(servable(row.interval))return{interval:row.interval,tooltip:row.tooltip};
 const from=intervalOrderSeconds(row.interval),span=row.tooltip.split(' in ')[0];
 for(const id of SERVED_FALLBACKS)if(intervalOrderSeconds(id)>from&&servable(id))return{interval:id,tooltip:span+' in '+intervalLabel(id)+' intervals'};
 return null;
}

/** Go to. */
export const BOTTOM_GO_TO=Object.freeze({factId:'goToDate',label:'Go to',tooltip:'Go to',dataName:'go-to-date',widthPx:38});
/** Timezone clock button. */
export const BOTTOM_TIMEZONE=Object.freeze({factId:'timezone',tooltip:'Timezone',dataName:'time-zone-menu',widthPx:96});
/** ADJ toggle. */
export const BOTTOM_ADJ=Object.freeze({factId:'adj',label:'ADJ',tooltip:'Adjust data for dividends',dataName:'adj',widthPx:36});
/** Extended trading hours button. Its label, tooltip and 36 px width
 * are our own choice. Shown only
 * for charts whose bars have sessions (US equity intraday in New York time). */
export const BOTTOM_SESSION=Object.freeze({label:{extended:'ETH',regular:'RTH'},tooltip:{extended:'Extended trading hours: on. Click to show regular hours only',regular:'Extended trading hours: off. Click to show pre-market and post-market bars'},dataName:'lv-session-toggle',widthPx:36});
/** Collapsed date-range button. */
export const BOTTOM_RANGE_MENU=Object.freeze({factId:'range.collapsed',label:'Date range',dataName:'date-ranges-menu'});
/** Separator: 1x22 with 8px/4px margins (visual-layout-spec#bottomToolbar.separator). */
export const BOTTOM_SEPARATOR_PX=9;
/** Left margin of the range group (visual-layout-spec#bottomToolbar.order[0].marginLeft). */
export const BOTTOM_RANGE_MARGIN_PX=8;

/**
 * Width the full (uncollapsed) bar needs: ranges, divider, Go to, clock, divider, ADJ.
 * The reference collapses the ranges into one dropdown "when space is short"; its exact breakpoint is unresolved,
 * so LV collapses only when the measured reference widths no longer fit.
 */
export function bottomToolbarFullWidth(session=false):number{
 const ranges=BOTTOM_RANGES.reduce((sum,row)=>sum+row.widthPx,0);
 return BOTTOM_RANGE_MARGIN_PX+ranges+BOTTOM_SEPARATOR_PX+BOTTOM_GO_TO.widthPx+BOTTOM_TIMEZONE.widthPx+BOTTOM_SEPARATOR_PX+BOTTOM_ADJ.widthPx+(session?BOTTOM_SESSION.widthPx:0);
}
export function bottomRangesCollapsed(availableWidthPx:number,session=false):boolean{
 if(!Number.isFinite(availableWidthPx)||availableWidthPx<=0)return false;
 return availableWidthPx<bottomToolbarFullWidth(session);
}

const pad2=(value:number)=>String(value).padStart(2,'0');
/** UTC offset of `zone` at `ms`, in minutes; null when the zone is unknown on this computer. */
export function zoneOffsetAt(ms:number,zone:string):number|null{
 if(!Number.isFinite(ms))return null;
 if(zone==='UTC'||zone==='Etc/UTC')return 0;
 try{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(ms));
  const get=(type:string)=>Number(parts.find(part=>part.type===type)?.value);
  const local=Date.UTC(get('year'),get('month')-1,get('day'),get('hour')%24,get('minute'),get('second'));
  return Math.round((local-Math.floor(ms/1000)*1000)/60000);
 }catch{return null;}
}
/** "UTC", "UTC-7", "UTC+5:30" (for example "UTC-7"). */
export function utcOffsetText(minutes:number):string{
 if(minutes===0)return 'UTC';
 const sign=minutes<0?'-':'+',abs=Math.abs(minutes),hours=Math.floor(abs/60),rest=abs%60;
 return `UTC${sign}${hours}${rest?':'+pad2(rest):''}`;
}
/**
 * The live clock text: "HH:MM:SS UTC" or "20:18:04 UTC-7".
 * With the chart on 12-hours
 * (scales.timeHours) the clock reads "8:18:04 PM UTC-7". The 12-hour clock form was not observed, so that text is
 * The crosshair label pattern of formatTimeOfDay plus seconds.
 */
export function formatToolbarClock(ms:number,zone:string,hours:'24'|'12'='24'):string|null{
 const offset=zoneOffsetAt(ms,zone);if(offset===null)return null;
 const local=new Date(Math.floor(ms/1000)*1000+offset*60000),h=local.getUTCHours();
 const minutes=`${pad2(local.getUTCMinutes())}:${pad2(local.getUTCSeconds())}`,offsetText=utcOffsetText(offset);
 return hours==='12'?`${h%12===0?12:h%12}:${minutes} ${h<12?'AM':'PM'} ${offsetText}`:`${pad2(h)}:${minutes} ${offsetText}`;
}

/** SLICE APPROXIMATION (LV assumption): the reference timezone menu contents were not observed
 * (visual-dialogs-bottom-toolbar unknowns: "Timezone menu and Go to dialog contents"), so the menu reuses the
 * Chart settings timezone list. Timezone menu rows: the Chart settings timezone list (UTC, Exchange, then cities by offset), with the current one checked. */
export interface TimezoneMenuRow {value:string;label:string;checked:boolean;disabled?:string}
export function timezoneMenuRows(current:string,options:{exchangeTimezone?:string|null;at?:Date}={}):TimezoneMenuRow[]{
 const rows=timezoneOptions(options.at);
 const exchange=options.exchangeTimezone??null;
 const out=rows.map(row=>{
  if(row.value==='exchange')return{value:row.value,label:row.label,checked:!!exchange&&exchange===current,...(exchange?{}:{disabled:'The exchange timezone of this symbol is not known.'})};
  return{value:row.value,label:row.label,checked:row.value===current&&!(exchange&&exchange===current)};
 });
 if(!out.some(row=>row.checked)&&current)out.push({value:current,label:current,checked:true});
 return out;
}
/** Resolves a menu choice to an IANA zone (Exchange resolves to the symbol's zone). */
export function resolveTimezoneChoice(value:string,exchangeTimezone?:string|null):string{
 const zone=value==='exchange'?exchangeTimezone:value;
 if(!zone)throw Error('The exchange timezone of this symbol is not known.');
 try{new Intl.DateTimeFormat('en',{timeZone:zone});}catch{throw Error('This timezone is not available on this computer.');}
 return zone;
}

/** ADJ is "Adjust data for dividends":
 * pressed only when the bars are dividend-adjusted, which among LV adjustment bases is 'total-return' alone.
 * 'split-adjusted' is not pressed and takes the reference alternate tooltip "Main symbol data is adjusted for splits
 * only" (#bottom.right.adj altTooltips); 'raw' and 'unknown' are not pressed (unknown is never claimed as adjusted).
 * A source with a dividend basis ('split-adjusted' or 'total-return', the Alpaca bases) toggles the chart
 * setting symbol.dividendsAdjustment (visual-dialogs-chart-settings symbol.candleSymbolDividendsAdjustment). The setting,
 * when given, drives pressed at once, before the reloaded bars report the new basis. `next` is the value a press commits. */
export function adjustmentButton(adjustment:string,dividendsAdjustment?:boolean):{label:string;tooltip:string;pressed:boolean;disabled:string;toggle:boolean;next:boolean}{
 const toggle=adjustment==='split-adjusted'||adjustment==='total-return';
 const pressed=toggle&&typeof dividendsAdjustment==='boolean'?dividendsAdjustment:adjustment==='total-return';
 const tooltip=adjustment==='split-adjusted'&&!pressed?'Main symbol data is adjusted for splits only':BOTTOM_ADJ.tooltip;
 const reason=adjustment==='unknown'?'The source does not state whether its prices are adjusted.':'Price adjustment follows the loaded source. Local and example bars carry no dividend history to adjust.';
 return{label:BOTTOM_ADJ.label,tooltip,pressed,disabled:reason,toggle,next:!pressed};
}

/** Which range button is current: the one whose window the visible range equals, within one bar. */
export function activeRange(visible:{from:number;to:number}|null,bars:{first:number;last:number;barSeconds:number}|null,start:(last:number,preset:RangePreset)=>number|null):RangePreset|null{
 if(!visible||!bars||!(bars.barSeconds>0))return null;
 for(const row of BOTTOM_RANGES){
  const begin=start(bars.last,row.preset),from=begin===null?bars.first:Math.max(begin,bars.first);
  if(Math.abs(visible.from-from)<=bars.barSeconds&&Math.abs(visible.to-bars.last)<=bars.barSeconds)return row.preset;
 }
 return null;
}

/** Calendar days a range button spans (YTD/All excluded: their intervals are daily or coarser). */
const RANGE_SPAN_DAYS:Record<string,number>={'1D':1,'5D':5,'1W':7,'1M':31,'3M':92,'6M':184};
/** The chart cannot draw more bars than its plot holds (0.5 px per bar), so a span that needs more bars than
 * that at the named interval opens the next coarser servable interval instead (3M in 2 hour bars on a narrow window). */
export function fitRangeInterval(preset:string,interval:string,capacityBars:number|null,servable:(interval:string)=>boolean):string{
 const days=RANGE_SPAN_DAYS[preset];if(!days||!capacityBars||!(capacityBars>0))return interval;
 let current=interval;
 for(const id of SERVED_FALLBACKS){
  if(intervalOrderSeconds(id)<intervalOrderSeconds(current))continue;
  if(id!==current&&!servable(id))continue;
  current=id;if(days*86400/intervalOrderSeconds(id)<=capacityBars)return id;
 }
 return current;
}
/** The interval a range button actually opens (served, then fitted to the plot's bar capacity) and a
 * tooltip naming it. The tooltip used to name the served interval: 3M said "1 hour" but opened 2h, 6M said "2 hours" but 4h. */
export function fittedBottomRange(row:BottomRange,servable:(interval:string)=>boolean,capacityBars:number|null):{interval:string;tooltip:string}|null{
 const served=servedBottomRange(row,servable);if(!served)return null;
 const interval=fitRangeInterval(row.preset,served.interval,capacityBars,servable);
 return interval===served.interval?served:{interval,tooltip:row.tooltip.split(' in ')[0]+' in '+intervalLabel(interval)+' intervals'};
}
