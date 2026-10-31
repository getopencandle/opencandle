// The close the legend's "Last day change" part compares with, for the bar under the crosshair (or the last bar).
// Daily charts use the bar before it; intraday charts use the last bar of the previous calendar day in the chart time zone;
// weekly and longer charts have no daily close here, so the part says it is unavailable instead of guessing.
// Same rule as the Data window's Last day change row (ui/data-window-model.ts), but measured at any bar, not only the latest.
import type {Bar} from '../domain/types';
import {parseInterval} from '../domain/intervals';

function unitOf(interval:string):string|null{try{return parseInterval(interval).unit;}catch{return null;}}
function dayKeyFor(timezone:string){
 let formatter:Intl.DateTimeFormat;
 try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});}
 catch{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'});}
 return(seconds:number)=>formatter.format(new Date(seconds*1000));
}
function inOrder(bars:readonly Bar[],from:number,to:number):boolean{for(let at=from+1;at<=to;at++)if(!(bars[at-1].time<=bars[at].time))return false;return true;}
export function previousSessionClose(bars:readonly Bar[],index:number,interval:string,timezone:string):number|null{
 if(!Number.isSafeInteger(index)||index<0||index>=bars.length)return null;
 const unit=unitOf(interval);
 if(unit==='day')return index>0?bars[index-1].close:null;
 if(unit!=='minute'&&unit!=='second')return null;
 const key=dayKeyFor(timezone),today=key(bars[index].time);
 // Bars are in time order, so their day keys only grow; a binary search finds the last bar of an earlier
 // day in O(log n) formats. The walk back formatted every bar of the day: 10R range bars on 5m BTC put thousands in one day,
 // a 40 ms hover/legend task. Out-of-order bars (the boundary check fails) still get the original walk.
 if(index>0&&key(bars[index-1].time)!==today)return bars[index-1].close;
 let low=0,high=index-1;
 if(high>=0&&key(bars[0].time)!==today){while(low<high){const middle=(low+high+1)>>1;if(key(bars[middle].time)!==today)low=middle;else high=middle-1;}
  if(key(bars[low+1].time)===today&&inOrder(bars,low,index))return bars[low].close;}
 else if(high>=0&&inOrder(bars,0,index))return null;
 for(let back=index-1;back>=0;back--)if(key(bars[back].time)!==today)return bars[back].close;
 return null;
}
