import {NYSE_CALENDAR_YEARS,usSessionDay} from './us-market-hours';

// Public calendar arithmetic only. This function grants no source or completion permission.
const clock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export interface NyseRegularBarRange {readonly date:string;readonly sessionOpen:number;readonly sessionClose:number;readonly barEnd:number}
/** Supported regular-session grid, including the shorter last candle. No persistent offset cache. */
export function nyseRegularBarRange(time:number,seconds:number):NyseRegularBarRange|null{
 if(!Number.isSafeInteger(time)||!Number.isSafeInteger(seconds)||seconds<60||seconds>3600)return null;
 try{
  const parts=clock.formatToParts(new Date(time*1000)),read=(kind:string)=>parts.find(part=>part.type===kind)!.value;
  const date=read('year')+'-'+read('month')+'-'+read('day'),year=Number(read('year'));
  if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last)return null;
  const day=usSessionDay(date);if(day.weekend||day.holiday)return null;
  const wall=Number(read('hour'))*3600+Number(read('minute'))*60+Number(read('second')),midnight=time-wall;
  const sessionOpen=midnight+day.open*60,sessionClose=midnight+day.close*60;
  if(time<sessionOpen||time>=sessionClose||(time-sessionOpen)%seconds!==0)return null;
  return {date,sessionOpen,sessionClose,barEnd:Math.min(time+seconds,sessionClose)};
 }catch{return null;}
}
