/**
 * Session grouping for the Time price opportunity and Session volume profile chart types. Pure; additive.
 *
 * Inputs: profilesSessions "All" (default), customSession
 * "0930-1600", customSessionTZ "Exchange". Rules:
 *  * All: every loaded bar of its trading date. US equities (the 'us-equity' calendar) use the New York calendar date, as the
 *    Session volume profile indicator's Extended session does; 24/7 feeds use the UTC date.
 *  * Regular: US equity intraday bars inside the regular session only (09:30 to the close, early closes included). On a UTC
 *    calendar, and on daily or longer bars, Regular equals All.
 *  * Custom: bars whose exchange wall-clock minute lies in [start, end). A range with end at or before start runs overnight
 *    and belongs to the date on which it ends (the trading day convention). Daily or longer bars ignore it (equal All).
 * Each session has an anchor instant: the wall-clock start of the session on its date (All: midnight, Regular: the open,
 * Custom: its start). TPO blocks count from the anchor.
 */
import {newYorkWallTime,usSessionDay,type UsSessionDay} from './us-market-hours';
import type {PivotCalendar} from './indicators-ext/r23-catalog';

export const PROFILE_SESSION_MODES=['All','Regular','Custom'] as const;
export type ProfileSessionMode=typeof PROFILE_SESSION_MODES[number];
const DAY=86_400,NEW_YORK='America/New_York';
/** Wall-clock choices for the custom session rows: every 15 minutes, 'HH:MM'. */
export const SESSION_CLOCK_OPTIONS:readonly string[]=Object.freeze(Array.from({length:96},(_,k)=>`${String(Math.floor(k/4)).padStart(2,'0')}:${String(k%4*15).padStart(2,'0')}`));
/** Minutes after midnight of 'HH:MM' or 'HHMM'; null when invalid. */
export function sessionClockMinutes(value:unknown):number|null{
 const match=/^(\d{2}):?(\d{2})$/.exec(String(value??''));if(!match)return null;
 const h=Number(match[1]),m=Number(match[2]);return h<24&&m<60?h*60+m:null;
}
export interface SessionGrouping {
 mode:ProfileSessionMode;calendar:PivotCalendar;
 /** IANA zone of the exchange clock; defaults to New York on the US equity calendar and UTC otherwise. */
 timeZone?:string|null;
 /** Custom session minutes after midnight (exchange clock). */
 customStart?:number;customEnd?:number;
 /** Daily or longer bars: one date per bar, read 12 hours after its stamp. */
 daily?:boolean;
}
/** A bar's session: day number of its trading date (days since 1970-01-01) or null when the bar is outside the session. */
export interface SessionSlot {day:number}

const zoneFormatters=new Map<string,Intl.DateTimeFormat>(),zoneOffsets=new Map<string,number>();
/** UTC offset (seconds) of a zone at an instant, cached per zone and UTC hour (zones change offset on whole quarter hours at
 *  most; every zone LV meets changes on whole hours). */
function zoneOffset(time:number,zone:string):number{
 if(zone==='UTC'||zone==='Etc/UTC')return 0;
 const hour=Math.floor(time/3600),key=zone+'|'+hour,cached=zoneOffsets.get(key);if(cached!==undefined)return cached;
 let formatter=zoneFormatters.get(zone);
 if(!formatter){formatter=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});zoneFormatters.set(zone,formatter);}
 const at=hour*3600,parts=Object.fromEntries(formatter.formatToParts(new Date(at*1000)).map(part=>[part.type,part.value]));
 const local=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour)%24,Number(parts.minute),Number(parts.second))/1000;
 if(zoneOffsets.size>50_000)zoneOffsets.clear();
 const offset=local-at;zoneOffsets.set(key,offset);return offset;
}
const zoneOf=(grouping:SessionGrouping)=>grouping.timeZone||(grouping.calendar==='us-equity'?NEW_YORK:'UTC');
/** Wall clock of an instant in a zone: day number of the local date and minute of the day. */
export function zoneClock(time:number,zone:string):{day:number;minutes:number}{
 const local=time+zoneOffset(time,zone),day=Math.floor(local/DAY);return {day,minutes:Math.floor((local-day*DAY)/60)};
}
const dateOfDay=(day:number)=>new Date(day*DAY*1000).toISOString().slice(0,10);
const sessionDays=new Map<number,UsSessionDay>();
/** The NYSE session day of a New York date (day number), cached: regular hours and early closes (us-market-hours). */
function usDay(day:number):UsSessionDay{let hit=sessionDays.get(day);if(!hit){if(sessionDays.size>20_000)sessionDays.clear();hit=usSessionDay(dateOfDay(day));sessionDays.set(day,hit);}return hit;}
/** The instant of a wall-clock minute on a local date (day number) in a zone. */
export function zoneWallTime(day:number,minute:number,zone:string):number{
 if(zone===NEW_YORK)return newYorkWallTime(dateOfDay(day),minute);
 const local=day*DAY+minute*60,first=local-zoneOffset(local,zone),second=local-zoneOffset(first,zone);
 return zoneOffset(second,zone)===zoneOffset(first,zone)?first:second;
}
const customRange=(grouping:SessionGrouping)=>{const start=grouping.customStart??570,end=grouping.customEnd??960;return {start,end,overnight:end<=start};};
/** The session slot of a bar time (seconds), or null when the bar is outside the session. */
export function sessionSlot(time:number,grouping:SessionGrouping):SessionSlot|null{
 if(!Number.isFinite(time))return null;
 const zone=zoneOf(grouping);
 if(grouping.daily)return {day:zoneClock(time+DAY/2,zone).day};
 const clock=zoneClock(time,zone);
 // The regular session by the New York clock and the early-close calendar (usSessionPhase, computed from the cached day).
 if(grouping.mode==='Regular'){if(grouping.calendar==='us-equity'){const day=usDay(clock.day);if(clock.minutes<day.open||clock.minutes>=day.close)return null;}return {day:clock.day};}
 if(grouping.mode==='Custom'){
  const {start,end,overnight}=customRange(grouping);
  if(!overnight)return clock.minutes>=start&&clock.minutes<end?{day:clock.day}:null;
  if(clock.minutes>=start)return {day:clock.day+1};
  return clock.minutes<end?{day:clock.day}:null;
 }
 return {day:clock.day};
}
/** Wall-clock minute at which the session of a date opens (All: midnight, Regular: the open, Custom: its start). */
function anchorMinute(day:number,grouping:SessionGrouping):{day:number;minute:number}{
 if(grouping.daily||grouping.mode==='All')return {day,minute:0};
 if(grouping.mode==='Regular')return {day,minute:grouping.calendar==='us-equity'?usDay(day).open:0};
 const {start,overnight}=customRange(grouping);return {day:overnight?day-1:day,minute:start};
}
/** The anchor instant of the session on a trading date (day number). */
export function sessionAnchor(day:number,grouping:SessionGrouping):number{
 const anchor=anchorMinute(day,grouping);return zoneWallTime(anchor.day,anchor.minute,zoneOf(grouping));
}
export interface SessionRun {from:number;to:number;day:number}
/** Contiguous index runs of bars sharing a session date; bars outside the session belong to no run. */
export function sessionRuns(bars:readonly {time:number}[],grouping:SessionGrouping):SessionRun[]{
 const out:SessionRun[]=[];let last:SessionRun|null=null;
 for(let i=0;i<bars.length;i++){
  const slot=sessionSlot(bars[i].time,grouping);if(!slot){last=null;continue;}
  if(last&&last.day===slot.day&&last.to===i-1){last.to=i;continue;}
  last={from:i,to:i,day:slot.day};out.push(last);
 }
 return out;
}
