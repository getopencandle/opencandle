// The last ten minutes of the US regular session (16:00 New York, 13:00 on an NYSE early-close day), as a short
// countdown: whole minutes from 10 down to 2, then seconds from 60 down to 1. Nothing outside that window, on
// weekends or on NYSE holidays.
import {newYorkClock,newYorkWallTime,usSessionDay} from './us-market-hours';

export const MARKET_CLOSE_COUNTDOWN_SECONDS=600;
export interface MarketCloseCountdown {seconds:number;text:string;final:boolean}
export function marketCloseCountdown(nowMs:number):MarketCloseCountdown|null{
 if(!Number.isFinite(nowMs))return null;
 const now=nowMs/1000,day=usSessionDay(newYorkClock(Math.floor(now)).date);
 if(day.weekend||day.holiday)return null;
 const left=newYorkWallTime(day.date,day.close)-now;
 if(!(left>0)||left>MARKET_CLOSE_COUNTDOWN_SECONDS)return null;
 const seconds=Math.ceil(left),final=seconds<=60;
 return{seconds,final,text:final?`${seconds}s to close`:`${Math.ceil(seconds/60)} min to close`};
}
