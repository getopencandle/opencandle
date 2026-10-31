// One formatter for every time shown outside the chart canvas (alert log, Go to date,
// replay start, script logs, paper dock and ticket). The reference shows these times in the chart timezone. LV precedence:
// The chart's own timezone setting, then the app-level "Default chart timezone" (factory
// Exchange: New York for US stocks, UTC for crypto), then UTC.
// Text shape: "2026-10-23 09:30 UTC-4". The date is year-month-day so logs sort and read the same in every
// zone; the offset suffix is the bottom-toolbar clock's ("UTC", "UTC-4", "UTC+5:30"). 12-hours gives "9:30 AM" (the
// crosshair label pattern of formatTimeOfDay). In UTC the text is byte-identical to the old alert log text.
// Typed input (datetime-local "YYYY-MM-DDTHH:MM") is read as chart wall-clock time. A time the clocks skip (the spring DST
// gap) is refused; a time that happens twice (the autumn change) takes the earlier instant.
import type {Instrument} from '../domain/types';
import {TIMEZONE_CITIES} from '../chart/chart-settings-facts';
import {utcOffsetText,zoneOffsetAt} from '../chart/bottom-toolbar';
import {availableZone,resolveChartTimezone} from './app-preferences';

export type ChartClockHours='24'|'12';
export interface ChartTimeOptions {
 /** Hour cycle; the chart's scales.timeHours. Default '24'. */
 hours?:ChartClockHours;
 /** Show seconds. Default false. */
 seconds?:boolean;
 /** Append the zone offset ("UTC-4"). Default true. */
 zone?:boolean;
}
export interface ChartTimeFallback {
 /** The app-level Default chart timezone choice ('exchange' or an IANA zone). */
 defaultChoice?:string|null;
 /** The chart's instrument, for an Exchange choice. */
 instrument?:Pick<Instrument,'assetClass'|'timezone'>|null;
}

/** The zone to show times in: the chart timezone when this computer knows it, else the Default chart timezone, else UTC. */
export function chartTimeZone(chartTimezone:unknown,fallback:ChartTimeFallback={}):string{
 if(availableZone(chartTimezone))return chartTimezone;
 if(chartTimezone==='UTC')return 'UTC';
 return fallback.defaultChoice?resolveChartTimezone(fallback.defaultChoice,fallback.instrument):'UTC';
}

const CITY=new Map(TIMEZONE_CITIES.map(row=>[row.zone,row.city]));
/** "UTC", "New York", "Denver"; a zone outside the chart timezone list keeps its IANA name. */
export function chartZoneName(zone:string):string{
 if(zone==='UTC'||zone==='Etc/UTC')return 'UTC';
 return CITY.get(zone)??zone;
}
/** "UTC", "UTC-4", "UTC+5:30" at `seconds` (DST-aware); "UTC" for an unknown zone. */
export function chartZoneOffsetText(seconds:number,zone:string):string{
 const offset=zoneOffsetAt(seconds*1000,zone);return utcOffsetText(offset??0);
}

interface Wall {y:number;mo:number;d:number;h:number;mi:number;s:number}
const formatters=new Map<string,Intl.DateTimeFormat|null>();
function formatterFor(zone:string):Intl.DateTimeFormat|null{
 if(!formatters.has(zone)){let format:Intl.DateTimeFormat|null=null;try{format=new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{format=null;}formatters.set(zone,format);}
 return formatters.get(zone)??null;
}
function wallClock(ms:number,zone:string):Wall|null{
 if(!Number.isFinite(ms))return null;
 const format=formatterFor(zone);if(!format)return null;
 try{
  const parts=format.formatToParts(new Date(ms)),get=(type:string)=>Number(parts.find(part=>part.type===type)?.value);
  const wall={y:get('year'),mo:get('month'),d:get('day'),h:get('hour')%24,mi:get('minute'),s:get('second')};
  return Object.values(wall).every(Number.isFinite)?wall:null;
 }catch{return null;}
}
const pad2=(value:number)=>String(value).padStart(2,'0');
const pad4=(value:number)=>String(value).padStart(4,'0');

/** "2026-10-23 09:30 UTC-4" (options: 12-hours, seconds, no zone suffix). An unknown zone shows UTC; a non-finite time its number. */
export function formatChartDateTime(seconds:number,zone:string,options:ChartTimeOptions={}):string{
 const ms=seconds*1000;if(!Number.isFinite(ms))return String(seconds);
 let shown=zone,wall=wallClock(ms,zone);
 if(!wall){shown='UTC';wall=wallClock(ms,'UTC');}
 if(!wall)return String(seconds);
 const date=`${pad4(wall.y)}-${pad2(wall.mo)}-${pad2(wall.d)}`,rest=`${pad2(wall.mi)}${options.seconds?':'+pad2(wall.s):''}`;
 const time=options.hours==='12'?`${wall.h%12===0?12:wall.h%12}:${rest} ${wall.h<12?'AM':'PM'}`:`${pad2(wall.h)}:${rest}`;
 return `${date} ${time}`+(options.zone===false?'':' '+chartZoneOffsetText(seconds,shown));
}
/** A formatter bound to one zone and hour cycle (for props such as AlertsDock formatTime). */
export function chartTimeFormatter(zone:string,options:ChartTimeOptions={}):(seconds:number)=>string{
 return seconds=>formatChartDateTime(seconds,zone,options);
}

/** The datetime-local value ("YYYY-MM-DDTHH:MM") of `seconds` on the chart wall clock; '' for an unshowable time. */
export function chartDateTimeInputValue(seconds:number,zone:string):string{
 const wall=wallClock(seconds*1000,zone)??wallClock(seconds*1000,'UTC');if(!wall)return '';
 return `${pad4(wall.y)}-${pad2(wall.mo)}-${pad2(wall.d)}T${pad2(wall.h)}:${pad2(wall.mi)}`;
}
/** Reads a datetime-local value as chart wall-clock time and returns epoch seconds. Refuses a malformed or impossible
 * date, and a time the DST change skips; a repeated time takes the earlier instant. */
export function parseChartDateTimeInput(value:string,zone:string):number{
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
 if(!match)throw new Error('Choose a valid date and time.');
 const [y,mo,d,h,mi]=match.slice(1).map(Number),wall=Date.UTC(y,mo-1,d,h,mi);
 const check=new Date(wall);
 if(!Number.isFinite(wall)||check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d||check.getUTCHours()!==h||check.getUTCMinutes()!==mi)throw new Error('That date or time does not exist.');
 if(!formatterFor(zone))throw new Error('This timezone is not available on this computer.');
 // Each candidate offset comes from a day either side and the wall time itself; a candidate is a solution when its
 // instant shows the typed wall clock again.
 const offsets=new Set<number>();
 for(const probe of [wall-86400000,wall,wall+86400000]){const offset=zoneOffsetAt(probe,zone);if(offset!==null)offsets.add(offset);}
 const solutions=[...offsets].map(offset=>wall-offset*60000).filter(ms=>{const shown=wallClock(ms,zone);return !!shown&&Date.UTC(shown.y,shown.mo-1,shown.d,shown.h,shown.mi)===wall;}).sort((a,b)=>a-b);
 if(!solutions.length)throw new Error(`That time does not exist in ${chartZoneName(zone)}: the clocks skip it when daylight saving time starts.`);
 return Math.floor(solutions[0]/1000);
}
