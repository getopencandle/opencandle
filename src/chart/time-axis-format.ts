// Time scale label formats and the interval-change left-edge pin. The 19 date formats
// (sample date 29 Sep 1997, LV ids format-1..19) come from src/chart/chart-settings-facts.ts DATE_FORMAT_OPTIONS;
// the weekday prefix, the hours format and the left-edge pin (default false) follow their Chart settings rows.

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const pad2=(value:number)=>String(value).padStart(2,'0');

export interface TimeScaleSettings {dayOfWeek:boolean;dateFormat:string;timeHours:'24'|'12'}
/** The fact defaults (Mon 29 Sep '97, 24-hours). */
export const DEFAULT_TIME_SCALE_SETTINGS:Readonly<TimeScaleSettings>=Object.freeze({dayOfWeek:true,dateFormat:'format-3',timeHours:'24'});

interface Parts {y:number;m:number;d:number;wd:number;h:number;min:number}
type Formatter=(p:Parts)=>string;
const yy=(p:Parts)=>pad2(p.y%100),mm=(p:Parts)=>pad2(p.m+1),dd=(p:Parts)=>pad2(p.d),mon=(p:Parts)=>MONTHS[p.m],q=(p:Parts)=>'Q'+(Math.floor(p.m/3)+1);
/** Each format reproduces its fact sample for 1997-09-29 exactly. */
const FORMATS:Record<string,Formatter>={
 'format-1':p=>`${q(p)} '${yy(p)}`,
 'format-2':p=>`${q(p)} ${p.y}`,
 'format-3':p=>`${p.d} ${mon(p)} '${yy(p)}`,
 'format-4':p=>`${mon(p)} '${yy(p)}`,
 'format-5':p=>`${mon(p)} ${p.d}, ${p.y}`,
 'format-6':p=>`${mon(p)} ${p.d}, ${p.y}`,
 'format-7':p=>`${mon(p)} ${p.y}`,
 'format-8':p=>`${mon(p)} ${p.d}`,
 'format-9':p=>`${p.d} ${mon(p)}`,
 'format-10':p=>`${p.y}-${mm(p)}-${dd(p)}`,
 'format-11':p=>`${yy(p)}-${mm(p)}-${dd(p)}`,
 'format-12':p=>`${yy(p)}/${mm(p)}/${dd(p)}`,
 'format-13':p=>`${p.y}/${mm(p)}/${dd(p)}`,
 'format-14':p=>`${dd(p)}-${mm(p)}-${p.y}`,
 'format-15':p=>`${dd(p)}-${mm(p)}-${yy(p)}`,
 'format-16':p=>`${dd(p)}/${mm(p)}/${yy(p)}`,
 'format-17':p=>`${dd(p)}/${mm(p)}/${p.y}`,
 'format-18':p=>`${mm(p)}/${dd(p)}/${yy(p)}`,
 'format-19':p=>`${mm(p)}/${dd(p)}/${p.y}`,
};
export const TIME_SCALE_DATE_FORMAT_IDS:readonly string[]=Object.freeze(Object.keys(FORMATS));

/** Wall-clock parts of `ms` in `zone` (null when the zone is unknown on this computer). */
export function zonedParts(ms:number,zone:string):Parts|null{
 if(!Number.isFinite(ms))return null;
 try{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone||'UTC',hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',weekday:'short'}).formatToParts(new Date(ms));
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??'';
  return{y:Number(get('year')),m:Number(get('month'))-1,d:Number(get('day')),wd:WEEKDAYS.indexOf(get('weekday')),h:Number(get('hour'))%24,min:Number(get('minute'))};
 }catch{return null;}
}
export function formatTimeScaleDate(ms:number,zone:string,settings:TimeScaleSettings):string|null{
 const format=FORMATS[settings.dateFormat],p=zonedParts(ms,zone);if(!format||!p)return null;
 return (settings.dayOfWeek?WEEKDAYS[p.wd]+' ':'')+format(p);
}
export type TimeLabelResult={ok:true;text:string}|{ok:false;reason:string};
/** Time of day in a zone: "14:05" (24-hours) or "2:05 PM" (12-hours; midnight is 12:00 AM). Null for an unknown zone or time. */
export function formatTimeOfDay(ms:number,zone:string,hours:'24'|'12'):string|null{
 const p=zonedParts(ms,zone);if(!p)return null;
 if(hours==='24')return `${pad2(p.h)}:${pad2(p.min)}`;
 return `${p.h%12===0?12:p.h%12}:${pad2(p.min)} ${p.h<12?'AM':'PM'}`;
}
/** Crosshair/time label: date, plus the time of day below a daily interval (24-hours "HH:MM", 12-hours "h:mm AM"). */
export function formatTimeScaleLabel(ms:number,zone:string,barIntervalMs:number,settings:TimeScaleSettings):TimeLabelResult{
 const date=formatTimeScaleDate(ms,zone,settings);if(date===null)return{ok:false,reason:'This date or timezone cannot be shown.'};
 if(barIntervalMs>=86400000)return{ok:true,text:date};
 const time=formatTimeOfDay(ms,zone,settings.timeHours);return time===null?{ok:false,reason:'This date or timezone cannot be shown.'}:{ok:true,text:`${date} ${time}`};
}
/** True when the pinned renderer already draws these settings: its crosshair stamp is "Mon 29 Sep '97 HH:MM"
 * (@luxalgo/vela 0.8.4 formatTimeStamp), which is the fact default. Any other choice is saved but not drawn. */
export function rendererDrawsTimeScale(settings:TimeScaleSettings):boolean{
 return settings.dayOfWeek===DEFAULT_TIME_SCALE_SETTINGS.dayOfWeek&&settings.dateFormat===DEFAULT_TIME_SCALE_SETTINGS.dateFormat&&settings.timeHours===DEFAULT_TIME_SCALE_SETTINGS.timeHours;
}

/**
 * Save chart left edge on an interval change (scales.saveLeftChartEdge). With the pin on, the new interval's view
 * starts at the first bar at or after the old left edge time and keeps the old number of visible bars (bar spacing
 * is unchanged across an interval switch in the pinned renderer). With the pin off, null: the host keeps its default
 * (latest bars). Returns bar times in the same unit as `times`.
 */
export function pinnedLeftRange(pin:boolean,previous:{from:number;to:number}|null,previousBarCount:number,times:readonly number[]):{from:number;to:number}|null{
 if(!pin||!previous||!times.length||!(previousBarCount>0)||!Number.isFinite(previous.from))return null;
 let index=times.findIndex(time=>time>=previous.from);if(index<0)index=times.length-1;
 const last=Math.min(times.length-1,index+Math.max(1,Math.round(previousBarCount))-1);
 return{from:times[index],to:times[last]};
}
