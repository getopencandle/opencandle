import {newYorkClock,newYorkWallTime,usSessionDay,usSessionSegment,US_SESSION_MINUTES} from '../domain/us-market-hours';
import type {IntervalSpec} from '../domain/intervals';
import {addDays} from './statements';
/** Point-in-time alignment: when a filing became public, when a chart bar ends, and which value each bar shows.
 * A bar shows a value only when value.availableAt < bar end, for every bar size. */
const DAY=86400;
export const isTradingDay=(date:string)=>{const day=usSessionDay(date);return !day.weekend&&!day.holiday;};
const closeOf=(date:string)=>newYorkWallTime(date,usSessionDay(date).close);
/** Start (04:00 New York) of the first trading session after a date. */
export function nextSessionStart(date:string):number{
 let next=addDays(date,1);for(let n=0;n<20&&!isTradingDay(next);n++)next=addDays(next,1);
 return newYorkWallTime(next,US_SESSION_MINUTES.preOpen);
}
/** EDGAR acceptance times are Eastern wall-clock times: a filing accepted after 17:30 carries the next business day as
 * its filing date. The submissions JSON prints them with a trailing Z, but the digits are New York time. Reading them
 * as New York time is also the later of the two readings, so a value can never appear early. */
export function parseAcceptance(raw:string|null|undefined):number|null{
 if(typeof raw!=='string')return null;
 const m=/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,9})?Z?$/.exec(raw.trim());if(!m)return null;
 const date=m[1],hour=Number(m[2]),minute=Number(m[3]),second=Number(m[4]??0),day=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==date||hour>23||minute>59||second>59)return null;
 return newYorkWallTime(date,hour*60+minute)+second;
}
/** Accession to acceptance text from parsed submissions rows (analysis-news/filings.ts Filing rows). */
export function acceptanceFromFilings(rows:readonly {accession:string;acceptanceReported:string|null}[]):Map<string,string|null>{
 return new Map(rows.map(row=>[row.accession,row.acceptanceReported]));
}
/** The instant a fact filed on `filed` under `accession` became public. The acceptance time is used when it is known
 * and consistent with the filed date (the same day, or up to four days before for after-hours acceptances). Otherwise
 * the start of the next New York session after the filed date. */
export function availabilityResolver(acceptance:ReadonlyMap<string,string|null>|null|undefined):(accession:string|null,filed:string)=>number{
 const cache=new Map<string,number>();
 return (accession,filed)=>{
  const key=(accession??'')+'|'+filed,hit=cache.get(key);if(hit!==undefined)return hit;
  const fallback=nextSessionStart(filed),accepted=accession?parseAcceptance(acceptance?.get(accession)):null;
  let at=fallback;
  if(accepted!==null){const date=newYorkClock(accepted).date;at=date<=filed&&date>=addDays(filed,-4)?accepted:Math.max(accepted,fallback);}
  cache.set(key,at);return at;
 };
}
const tradingDayIn=(first:string,last:string)=>{for(let date=last,n=0;date>=first&&n<400;date=addDays(date,-1),n++)if(isTradingDay(date))return date;return last;};
const dateOf=(seconds:number)=>new Date(seconds*1000).toISOString().slice(0,10);
const MONDAY=Date.parse('1969-12-29T00:00:00Z')/1000;
/** New York date and end instant of each bar.
 * Intraday bars end at open + interval, cut at their New York session segment (a 15:30 hourly bar ends at the 16:00
 * close). Day, week and month bars are labelled by the New York date at their midday (the app's calendar-bar rule) and
 * end at the regular close of the last trading session they cover, so an after-close filing belongs to the next bar. */
export function barClock(bars:readonly {time:number}[],interval:Pick<IntervalSpec,'unit'|'multiplier'|'seconds'>):{dates:string[];ends:Float64Array}{
 const n=bars.length,dates:string[]=new Array(n),ends=new Float64Array(n),mult=Math.max(1,Math.floor(interval.multiplier||1));
 const calendar=interval.unit==='day'||interval.unit==='week'||interval.unit==='month';
 for(let i=0;i<n;i++){
  const time=bars[i].time;
  if(!calendar){const seconds=interval.seconds&&interval.seconds>0?interval.seconds:60;dates[i]=newYorkClock(time).date;ends[i]=Math.min(time+seconds,usSessionSegment(time).end);continue;}
  const date=newYorkClock(time+DAY/2).date;dates[i]=date;
  if(interval.unit==='day')ends[i]=closeOf(tradingDayIn(date,addDays(date,mult-1)));
  else if(interval.unit==='week'){const first=dateOf(MONDAY+Math.floor((Date.parse(date+'T00:00:00Z')/1000-MONDAY)/(7*DAY))*7*DAY);ends[i]=closeOf(tradingDayIn(first,addDays(first,7*mult-1)));}
  else {const y=Number(date.slice(0,4)),m=Number(date.slice(5,7))-1,first=date.slice(0,8)+'01',last=dateOf(Date.UTC(y,m+mult,1)/1000-DAY);ends[i]=closeOf(tradingDayIn(first,last));}
 }
 return {dates,ends};
}
/** A value that can be placed on bars: the period it describes and when it became public. */
export interface PitEvent {end:string;at:number}
/** Index of the event each bar shows, or -1. A bar shows, among the events with at < bar end, the one with the
 * greatest period end; for the same period end the later one (a newer version) wins. Values step forward and are never
 * interpolated. Bar ends must not decrease. */
export function alignEvents(events:readonly PitEvent[],ends:Float64Array):Int32Array{
 const order=events.map((_,i)=>i).sort((a,b)=>events[a].at-events[b].at||a-b),out=new Int32Array(ends.length).fill(-1);
 let best=-1,next=0;
 for(let i=0;i<ends.length;i++){
  while(next<order.length&&events[order[next]].at<ends[i]){
   const candidate=order[next++];
   if(best<0||events[candidate].end>events[best].end||events[candidate].end===events[best].end&&events[candidate].at>=events[best].at)best=candidate;
  }
  out[i]=best;
 }
 return out;
}
