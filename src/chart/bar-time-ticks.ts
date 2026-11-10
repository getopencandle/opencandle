// Time ticks placed on the chart's own bars. The pinned renderer (@luxalgo/vela 0.8.4, timeTicks) steps evenly through
// clock time, but its x axis is the bar index: bars sit side by side and a closed market takes no room. On a stock chart
// of 1 minute or less, every evenly stepped tick that falls in the overnight or weekend gap landed on the same pixel
// (a pile of grid lines at the day boundary), their labels collided and were dropped, and too few ticks were left for
// the session itself.
// Here every bar is ranked by the largest boundary of the chart-zone wall clock it crosses since the bar before it
// (a second ... an hour ... a day, week, month, year, decade), and ticks are taken from the highest rank down, each
// kept only when it is at least `minBars` bars away from every tick already kept. Spacing is therefore in bars (pixels),
// never in clock time: gaps cost nothing, a day boundary pushes nearby minor ticks away instead of crowding them, and
// the density follows the zoom. This is the weight method open chart libraries use for an index axis, with
// extra ranks (week, quarter, round years, 15 minutes) so the kept ticks sit on rounder times.
// The label is the bar's own time, never rounded to the boundary. The text shapes are the renderer's own ("HH:MM",
// "Oct 21", "Oct", "2026"); "HH:MM:SS" on charts below one minute.
export interface BarTick{logical:number;time:number;label:string;
 /** Boundary rank; a higher rank wins a label collision. */
 weight:number}
export interface BarTickInput{
 /** Visible logical range (bar indexes, fractional at the edges). */
 from:number;to:number;
 /** Bar time (epoch ms) at a whole logical index, extrapolated past either end; a non-finite value has no tick. */
 timeAt:(logical:number)=>number;
 /** The chart's bar interval (ms). */
 intervalMs:number;
 /** Chart-zone offset (ms) at a time: added to it, the UTC getters read the zone's wall clock. */
 offsetAt:(ms:number)=>number;
 /** Least distance between two ticks, in bars. */
 minBars:number;
}
const SEC=1000,MIN=60*SEC,HOUR=60*MIN,DAY=24*HOUR,WEEK=7*DAY;
// Clock ranks 1..12, largest first; then day 13, week 14, month 15, quarter 16, half-year 17, year 18, 2/5/10 years 19..21.
const CLOCK:readonly number[]=[12*HOUR,6*HOUR,3*HOUR,HOUR,30*MIN,15*MIN,5*MIN,MIN,30*SEC,15*SEC,5*SEC,SEC];
const DAY_RANK=13,WEEK_RANK=14,MONTH_RANK=15,YEAR_RANK=18;
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const pad2=(n:number)=>n<10?`0${n}`:String(n);
const MAX_BARS=200000;

/** Rank of the largest wall-clock boundary between `before` and `z` (both zone wall clocks, z later); 0 for none. */
export function boundaryRank(before:number,z:number):number{
 if(Math.floor(before/DAY)===Math.floor(z/DAY)){
  for(let i=0;i<CLOCK.length;i++)if(Math.floor(before/CLOCK[i])!==Math.floor(z/CLOCK[i]))return CLOCK.length-i;
  return 0;
 }
 const a=new Date(before),b=new Date(z),ya=a.getUTCFullYear(),yb=b.getUTCFullYear();
 if(ya!==yb)return YEAR_RANK+(Math.floor(ya/10)!==Math.floor(yb/10)?3:Math.floor(ya/5)!==Math.floor(yb/5)?2:Math.floor(ya/2)!==Math.floor(yb/2)?1:0);
 const ma=a.getUTCMonth(),mb=b.getUTCMonth();
 if(ma!==mb)return MONTH_RANK+(Math.floor(ma/6)!==Math.floor(mb/6)?2:Math.floor(ma/3)!==Math.floor(mb/3)?1:0);
 return Math.floor((before-4*DAY)/WEEK)!==Math.floor((z-4*DAY)/WEEK)?WEEK_RANK:DAY_RANK; // weeks start Monday
}
function labelOf(rank:number,z:number,intraday:boolean,seconds:boolean):string{
 const d=new Date(z);
 if(rank>=YEAR_RANK)return String(d.getUTCFullYear());
 if(rank>=MONTH_RANK&&!intraday)return MONTHS[d.getUTCMonth()];
 if(rank>=DAY_RANK)return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
 const time=`${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
 return seconds?`${time}:${pad2(d.getUTCSeconds())}`:time;
}

/** The ticks in view, left to right; null when this axis cannot be read as bars (the caller keeps the renderer's ticks). */
export function barTimeTicks(input:BarTickInput):BarTick[]|null{
 const{from,to,intervalMs}=input;
 if(!Number.isFinite(from)||!Number.isFinite(to)||!(to>from)||!Number.isFinite(intervalMs)||!(intervalMs>0)||!Number.isFinite(input.minBars))return null;
 const lo=Math.ceil(from),hi=Math.floor(to);if(hi<lo)return[];if(hi-lo>MAX_BARS)return null;
 const minBars=Math.max(1,Math.ceil(input.minBars)),intraday=intervalMs<DAY,seconds=intervalMs<MIN;
 // Candidates by rank. A rank whose bars could never fit (every bar a candidate, closer than minBars) is still cheap:
 // it is walked once and refused by the spacing test.
 const byRank:{logical:number;time:number;z:number}[][]=[];
 let before=input.timeAt(lo-1),beforeZ=Number.isFinite(before)?before+input.offsetAt(before):NaN;
 for(let logical=lo;logical<=hi;logical++){
  const time=input.timeAt(logical);if(!Number.isFinite(time))continue;
  const z=time+input.offsetAt(time);if(!Number.isFinite(z))continue;
  if(Number.isFinite(beforeZ)&&time>before){const rank=boundaryRank(beforeZ,z);if(rank>0)(byRank[rank]??=[]).push({logical,time,z});}
  before=time;beforeZ=z;
 }
 const kept:BarTick[]=[]; // sorted by logical
 for(let rank=byRank.length-1;rank>=1;rank--){
  const row=byRank[rank];if(!row)continue;
  for(const candidate of row){
   let left=0,right=kept.length;while(left<right){const middle=(left+right)>>1;if(kept[middle].logical<candidate.logical)left=middle+1;else right=middle;}
   if(left>0&&candidate.logical-kept[left-1].logical<minBars)continue;
   if(left<kept.length&&kept[left].logical-candidate.logical<minBars)continue;
   kept.splice(left,0,{logical:candidate.logical,time:candidate.time,label:labelOf(rank,candidate.z,intraday,seconds),weight:rank});
  }
 }
 return kept;
}
