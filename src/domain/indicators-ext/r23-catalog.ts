import type {Bar,NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {parseInterval} from '../intervals';
import {newYorkClock,usSessionPhase,US_SESSION_MINUTES} from '../us-market-hours';

/**
 * Extended built-ins. Formulas are the standard published ones (original author or textbook, cited
 * per row under the `:` provenance prefix, or a public indicator definition under
 * `public-indicator-definition:`). Every name, input title, default,
 * color and width that is not quoted from a public article is our own choice and listed in `unknownDefaults`.
 * Calculations are original code.
 */
export const R23_INDICATOR_IDS=['ichimoku','pivots','vwma','hv','uo','trix','cmo','stddev','lrc','alma','dema','tema','zigzag','efi'] as const;
export type R23IndicatorId=typeof R23_INDICATOR_IDS[number];

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
/** Bounds (no fact exists for these kinds). A float input's default must sit on its min + k x step grid, or the
 * dialog's HTML step check refuses the default and Ok does nothing (tests/domain/r24-indicator-input-steps.test.ts).
 * ALMA sigma and Zig zag deviation edit from 0.1 in 0.1 steps; storedMin keeps the older 0.001 floor loadable. */
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const LENGTH_2={type:'int' as const,min:2,max:5000,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const HELP='public-indicator-definition:';
const LV='lv-defined:';
const UNKNOWN='The name, input titles, defaults, colors and widths are OpenCandle-defined (conventional author or textbook values).';
const BLUE='#2962ff',ORANGE='#ff6d00',GREEN='#43a047',RED='#f23645',PURPLE='#7e57c2';

function extreme(values:readonly number[],index:number,window:number,pick:'max'|'min'):number|null{
 if(index<window-1||index<0)return null;let out=pick==='max'?-Infinity:Infinity;
 for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;out=pick==='max'?Math.max(out,value):Math.min(out,value);}return out;
}
function windowSum(values:readonly (number|null)[],index:number,window:number):number|null{
 if(index<window-1)return null;let sum=0;for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;sum+=value;}return sum;
}
/** Two-pass mean and squared deviation sum of a full finite window; null when any value is missing. */
function windowMoments(values:readonly (number|null)[],index:number,window:number):{mean:number;ss:number}|null{
 if(index<window-1)return null;let sum=0;
 for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;sum+=value;}
 const mean=sum/window;let ss=0;for(let i=index-window+1;i<=index;i++)ss+=((values[i] as number)-mean)**2;return {mean,ss};
}
const highs=(bars:readonly Bar[])=>bars.map(bar=>bar.high),lows=(bars:readonly Bar[])=>bars.map(bar=>bar.low),closes=(bars:readonly Bar[])=>bars.map(bar=>bar.close);
const midpoint=(h:readonly number[],l:readonly number[],i:number,n:number)=>{const hi=extreme(h,i,n,'max'),lo=extreme(l,i,n,'min');return hi===null||lo===null?null:(hi+lo)/2;};

// ---- Pivot points standard ----
export const PIVOT_TYPES=['Traditional','Fibonacci','Woodie','Classic','DM','Camarilla'] as const;
export const PIVOT_TIMEFRAMES=['Auto','Daily','Weekly','Monthly','Quarterly','Yearly'] as const;
export type PivotTimeframe=Exclude<typeof PIVOT_TIMEFRAMES[number],'Auto'>;
export const PIVOT_LEVELS=['p','r1','s1','r2','s2','r3','s3','r4','s4','r5','s5'] as const;
type PivotLevels=Partial<Record<typeof PIVOT_LEVELS[number],number>>;
/** 'us-equity': New York trading dates and the regular session; 'utc': UTC calendar periods (crypto and other 24/7 feeds). */
export type PivotCalendar='us-equity'|'utc';
const DAY=86400;
/** Smallest positive spacing between consecutive bars, in seconds (Infinity when there is none). */
function barSpacing(bars:readonly {time:number}[]):number{let spacing=Infinity;for(let i=1;i<bars.length;i++){const step=bars[i].time-bars[i-1].time;if(Number.isFinite(step)&&step>0)spacing=Math.min(spacing,step);}return spacing;}
/** Interval length in seconds from the chart resolution; null when absent, unparsable or not a time interval (tick, range). */
function resolutionSeconds(resolution:string|null|undefined):number|null{
 if(typeof resolution!=='string')return null;
 try{const spec=parseInterval(resolution);if(spec.kind!=='time')return null;if(spec.unit==='day')return spec.multiplier*DAY;if(spec.unit==='week')return spec.multiplier*7*DAY;if(spec.unit==='month')return spec.multiplier*30*DAY;return spec.seconds;}catch{return null;}
}
/**
 * Auto rule: 1D for resolutions up to and including 15 minutes, 1W above 15 minutes and below 1 day,
 * 1M from 1 day. The chart resolution decides when the calculation receives one; otherwise LV falls back to the smallest
 * positive bar spacing, where 20 hours or more counts as daily so DST-shortened daily bars stay daily.
 */
export function pivotAutoTimeframe(bars:readonly {time:number}[],resolution?:string|null):PivotTimeframe{
 const declared=resolutionSeconds(resolution);
 if(declared!==null)return declared<=900?'Daily':declared<DAY?'Weekly':'Monthly';
 const spacing=barSpacing(bars);if(!Number.isFinite(spacing))return 'Monthly';
 return spacing<=900?'Daily':spacing<72000?'Weekly':'Monthly';
}
/** True when the bars are daily or longer (declared resolution, else a spacing of 20 hours or more). */
export function dailyOrLonger(bars:readonly {time:number}[],resolution?:string|null):boolean{const declared=resolutionSeconds(resolution);return declared!==null?declared>=DAY:barSpacing(bars)>=72000;}
/** New York trading date of a bar. A daily-or-longer bar is read 12 hours after its stamp, so New York midnight and UTC midnight stamps both land on their own trading date. */
function newYorkDate(time:number,daily:boolean):string{return newYorkClock(daily?time+DAY/2:time).date;}
/**
 * The calendar the context declares; otherwise US equity unless the bars show a 24/7 feed: a bar on a New York Saturday
 * or Sunday, or an intraday bar outside the 04:00-20:00 New York extended session, selects UTC. No bars: UTC.
 */
export function pivotCalendar(bars:readonly {time:number}[],resolution?:string|null,declared?:PivotCalendar|null):PivotCalendar{
 if(declared==='us-equity'||declared==='utc')return declared;
 if(!bars.length)return 'utc';const daily=dailyOrLonger(bars,resolution);
 for(const bar of bars){if(!Number.isFinite(bar.time))continue;const clock=newYorkClock(daily?bar.time+DAY/2:bar.time);if(clock.weekday===0||clock.weekday===6)return 'utc';if(!daily&&(clock.minutes<US_SESSION_MINUTES.preOpen||clock.minutes>=US_SESSION_MINUTES.postClose))return 'utc';}
 return 'us-equity';
}
/** The chart-declared calendar for a source: New York stocks, ETFs and indexes are US equity (the same classes as the
 * session shading), crypto is UTC, anything else is undefined and left to inference. */
export function sourcePivotCalendar(assetClass:string|undefined,timezone:string|undefined):PivotCalendar|undefined{
 if(assetClass==='crypto')return 'utc';
 return ['stock','etf','index'].includes(assetClass??'')&&timezone==='America/New_York'?'us-equity':undefined;
}
/** Period key. UTC: UTC calendar days, Monday weeks, months, quarters, years. US equity: the same over New York trading dates. */
export function pivotPeriodKey(time:number,timeframe:PivotTimeframe,calendar:PivotCalendar='utc',daily=false):string|null{
 if(!Number.isFinite(time))return null;let y:number,m:number,d:number,weekday:number;
 if(calendar==='us-equity'){[y,m,d]=newYorkDate(time,daily).split('-').map(Number);m-=1;weekday=new Date(Date.UTC(y,m,d)).getUTCDay();}
 else{const date=new Date(time*1000);if(!Number.isFinite(date.getTime()))return null;y=date.getUTCFullYear();m=date.getUTCMonth();d=date.getUTCDate();weekday=date.getUTCDay();}
 if(timeframe==='Yearly')return String(y);
 if(timeframe==='Quarterly')return `${y}-Q${Math.floor(m/3)}`;
 if(timeframe==='Monthly')return `${y}-${m}`;
 if(timeframe==='Daily')return `${y}-${m}-${d}`;
 return String(Date.UTC(y,m,d)-((weekday+6)%7)*86400000);
}
/** Standard pivot level formulas. Levels a type does not define are absent. */
export function pivotLevels(type:string,prev:{open:number;high:number;low:number;close:number},currentOpen:number|null):PivotLevels{
 const {open:O,high:H,low:L,close:C}=prev,range=H-L;
 if(type==='Traditional'){const P=(H+L+C)/3;return {p:P,r1:P*2-L,s1:P*2-H,r2:P+range,s2:P-range,r3:P*2+(H-2*L),s3:P*2-(2*H-L),r4:P*3+(H-3*L),s4:P*3-(3*H-L),r5:P*4+(H-4*L),s5:P*4-(4*H-L)};}
 if(type==='Fibonacci'){const P=(H+L+C)/3;return {p:P,r1:P+0.382*range,s1:P-0.382*range,r2:P+0.618*range,s2:P-0.618*range,r3:P+range,s3:P-range};}
 if(type==='Woodie'){if(currentOpen===null)return {};const P=(H+L+2*currentOpen)/4,r3=H+2*(P-L),s3=L-2*(H-P);return {p:P,r1:2*P-L,s1:2*P-H,r2:P+range,s2:P-range,r3,s3,r4:r3+range,s4:s3-range};}
 if(type==='Classic'){const P=(H+L+C)/3;return {p:P,r1:2*P-L,s1:2*P-H,r2:P+range,s2:P-range,r3:P+2*range,s3:P-2*range,r4:P+3*range,s4:P-3*range};}
 if(type==='DM'){const X=O===C?H+L+2*C:C>O?2*H+L+C:2*L+H+C;return {p:X/4,r1:X/2-L,s1:X/2-H};}
 if(type==='Camarilla'){const P=(H+L+C)/3,out:PivotLevels={p:P,r1:C+1.1*range/12,s1:C-1.1*range/12,r2:C+1.1*range/6,s2:C-1.1*range/6,r3:C+1.1*range/4,s3:C-1.1*range/4,r4:C+1.1*range/2,s4:C-1.1*range/2};if(L!==0){const r5=H/L*C;out.r5=r5;out.s5=C-(r5-C);}return out;}
 throw new Error(`Unsupported pivot type: ${type}`);
}
function pivotPoints(ctx:CatalogContext):Record<string,NumericSeries>{
 const {bars}=ctx,type=ctx.str('type'),choice=ctx.str('timeframe'),back=ctx.num('pivotsBack'),resolution=ctx.chart?.resolution??null;
 const timeframe=choice==='Auto'?pivotAutoTimeframe(bars,resolution):choice as PivotTimeframe;
 const calendar=pivotCalendar(bars,resolution,ctx.chart?.calendar),daily=dailyOrLonger(bars,resolution);
 // US equity intraday: only regular-session bars build a period's open, high, low and close; pre- and after-hours bars
 // belong to their New York trading date but do not count. Daily-or-longer bars and UTC periods count every bar.
 const counts=(bar:Bar)=>calendar==='utc'||daily||Number.isFinite(bar.time)&&usSessionPhase(bar.time)==='regular';
 const keys=bars.map(bar=>pivotPeriodKey(bar.time,timeframe,calendar,daily));
 // Consecutive runs of equal keys are periods; each aggregates its finite counted prices only.
 const period:number[]=[],aggregates:{open:number|null;high:number;low:number;close:number|null}[]=[];let last:string|null|undefined;
 keys.forEach((key,i)=>{if(key===null){period.push(-1);return;}if(key!==last){aggregates.push({open:null,high:-Infinity,low:Infinity,close:null});last=key;}period.push(aggregates.length-1);
  const bar=bars[i],row=aggregates[aggregates.length-1];if(!counts(bar))return;if(row.open===null&&finite(bar.open))row.open=bar.open;if(finite(bar.high))row.high=Math.max(row.high,bar.high);if(finite(bar.low))row.low=Math.min(row.low,bar.low);if(finite(bar.close))row.close=bar.close;});
 const complete=(row:typeof aggregates[number]|undefined)=>!!row&&row.open!==null&&row.close!==null&&finite(row.high)&&finite(row.low);
 // The prior period is the nearest earlier one with complete counted prices (a date without regular-session bars is skipped).
 const prior:number[]=[];let lastComplete=-1;aggregates.forEach((row,k)=>{prior.push(lastComplete);if(complete(row))lastComplete=k;});
 const out:Record<string,NumericSeries>=Object.fromEntries(PIVOT_LEVELS.map(level=>[level,[] as NumericSeries]));
 const firstShown=aggregates.length-back;let runningOpen:number|null=null,runningPeriod=-1;
 bars.forEach((bar,i)=>{
  const k=period[i];if(k!==runningPeriod){runningPeriod=k;runningOpen=null;}if(runningOpen===null&&counts(bar)&&finite(bar.open))runningOpen=bar.open;
  const source=k>=0&&prior[k]>=0?aggregates[prior[k]]:undefined;
  const levels=k>=firstShown&&complete(source)?pivotLevels(type,{open:source!.open!,high:source!.high,low:source!.low,close:source!.close!},runningOpen):{};
  for(const level of PIVOT_LEVELS){const value=levels[level];out[level].push(finite(value)?zero(value):null);}
 });
 return out;
}

// ---- Zig zag ----
/** Percent-reversal zig zag on highs and lows; the confirmed pivots plus the current extreme, joined linearly. */
export function zigzagPivots(bars:readonly Bar[],deviation:number,depth:number):{index:number;price:number}[]{
 const pivots:{index:number;price:number}[]=[],d=deviation/100;let dir=0,hiIdx=-1,loIdx=-1,extIdx=-1,ext=NaN,lastPivot=-Infinity;
 const moved=(from:number,to:number)=>from!==0&&Math.abs(to-from)/Math.abs(from)>=d;
 // A depth-blocked leg (its reversal came too soon after its pivot) that then trades beyond its own
 // starting pivot never qualified (; without this the zig zag froze for the rest of the series on most demo symbols,
 // and Auto pitchfork / Auto fib extension drew nothing). With an earlier pivot the previous leg simply continues: the
 // starting pivot moves to this bar. The very first pivot has no previous leg, so the blocked leg's extreme becomes the first
 // pivot instead and the direction turns.
 const blocked=(i:number,beyond:number,opposite:number,legExt:number,legIdx:number)=>{
  if(pivots.length>1){pivots[pivots.length-1]={index:i,price:beyond};lastPivot=i;ext=opposite;extIdx=i;return;}
  pivots[0]={index:legIdx,price:legExt};lastPivot=legIdx;dir=-dir;ext=beyond;extIdx=i;
 };
 bars.forEach((bar,i)=>{
  if(!finite(bar.high)||!finite(bar.low))return;
  if(dir===0){
   if(hiIdx<0||bar.high>bars[hiIdx].high)hiIdx=i;if(loIdx<0||bar.low<bars[loIdx].low)loIdx=i;
   if(!moved(bars[loIdx].low,bars[hiIdx].high))return;
   if(hiIdx>loIdx){pivots.push({index:loIdx,price:bars[loIdx].low});lastPivot=loIdx;dir=1;extIdx=hiIdx;ext=bars[hiIdx].high;}
   else{pivots.push({index:hiIdx,price:bars[hiIdx].high});lastPivot=hiIdx;dir=-1;extIdx=loIdx;ext=bars[loIdx].low;}
   return;
  }
  if(dir===1){if(bar.high>ext){ext=bar.high;extIdx=i;}else if(ext-bar.low>=Math.abs(ext)*d&&extIdx-lastPivot>=depth){pivots.push({index:extIdx,price:ext});lastPivot=extIdx;dir=-1;ext=bar.low;extIdx=i;}else if(bar.low<pivots[pivots.length-1].price)blocked(i,bar.low,bar.high,ext,extIdx);}
  else{if(bar.low<ext){ext=bar.low;extIdx=i;}else if(bar.high-ext>=Math.abs(ext)*d&&extIdx-lastPivot>=depth){pivots.push({index:extIdx,price:ext});lastPivot=extIdx;dir=1;ext=bar.high;extIdx=i;}else if(bar.high>pivots[pivots.length-1].price)blocked(i,bar.high,bar.low,ext,extIdx);}
 });
 // A depth-blocked move on the last bar leaves the current extreme on the moved pivot's own bar; skip it (no vertical leg).
 if(dir!==0&&extIdx!==pivots[pivots.length-1]?.index)pivots.push({index:extIdx,price:ext});
 return pivots;
}

const definitions:CatalogDefinition[]=[
 {id:'ichimoku',name:'Ichimoku cloud',acronym:'Ichimoku',overlay:true,
  inputs:[{key:'conversionLength',title:'Conversion line length',defval:9,...LENGTH},{key:'baseLength',title:'Base line length',defval:26,...LENGTH},{key:'spanBLength',title:'Leading span B length',defval:52,...LENGTH},{key:'displacement',title:'Displacement',defval:26,...LENGTH}],
  plots:[{id:'conversion',label:'Conversion line',color:BLUE,width:1},{id:'base',label:'Base line',color:'#b71c1c',width:1},{id:'lagging',label:'Lagging span',color:GREEN,width:1},{id:'upper',label:'Leading span A',color:'#a5d6a7',width:1},{id:'lower',label:'Leading span B',color:'#ef9a9a',width:1}],
  band:'plots',fill:{color:GREEN,opacity:10},bearishFill:{color:RED,opacity:10},projects:true,
  provenance:[{url:LV+'hosoda-ichimoku-kinko-hyo-1969',facts:'Goichi Hosoda: conversion line = (highest high + lowest low) / 2 over 9; base line = the same over 26; leading span A = (conversion + base) / 2 plotted 26 periods ahead; leading span B = (highest high + lowest low) / 2 over 52 plotted 26 periods ahead; lagging span = close plotted 26 periods behind.'}],
  unknownDefaults:[UNKNOWN,'Inputs 9/26/52/26 are the author defaults.'],
  policies:['Displacement counts the current bar as the first period (Japanese inclusive counting): spans shift by Displacement - 1 bars. Parity with the reference shift is unverified.','Leading spans are shifted inside the calculation, so the value at a bar is the value displayed there. Their latest Displacement - 1 values, and the cloud between them, are drawn past the last loaded bar (chart display only: the data window, legend values and alerts keep one value per loaded bar). The lagging span at the latest Displacement - 1 bars is unavailable until later closes exist.','The cloud has two backgrounds: the bullish one where Leading span A is above Leading span B, the bearish one on every other bar, equal spans included. Each keeps its own visibility, color and opacity.'],
  calculate({bars,num,projection}){const h=highs(bars),l=lows(bars),c=closes(bars),shift=num('displacement')-1,n=bars.length;
   const conversion=bars.map((_,i)=>midpoint(h,l,i,num('conversionLength'))),base=bars.map((_,i)=>midpoint(h,l,i,num('baseLength')));
   const upper=bars.map((_,i)=>{const j=i-shift;if(j<0)return null;const a=conversion[j],b=base[j];return finite(a)&&finite(b)?(a+b)/2:null;});
   const lower=bars.map((_,i)=>i-shift<0?null:midpoint(h,l,i-shift,num('spanBLength')));
   const lagging=bars.map((_,i)=>i+shift<n&&finite(c[i+shift])?c[i+shift]:null);
   // The leading spans at the future slots n .. n + shift - 1 come from the last shift bars.
   if(n&&shift>0)projection?.({upper:Array.from({length:shift},(_,k)=>{const j=n+k-shift;if(j<0)return null;const a=conversion[j],b=base[j];return finite(a)&&finite(b)?(a+b)/2:null;}),lower:Array.from({length:shift},(_,k)=>n+k-shift<0?null:midpoint(h,l,n+k-shift,num('spanBLength')))});
   return {conversion,base,lagging,upper,lower};},
  warmup:value=>Math.max(value('conversionLength'),value('baseLength'),value('spanBLength'))+value('displacement')-1,work:(count,value)=>count*(value('conversionLength')+value('baseLength')+value('spanBLength'))*2+count*16},
 {id:'pivots',name:'Pivot points standard',acronym:'Pivots',overlay:true,
  inputs:[{key:'type',title:'Type',type:'string',defval:'Traditional',options:PIVOT_TYPES},{key:'timeframe',title:'Pivots timeframe',type:'string',defval:'Auto',options:PIVOT_TIMEFRAMES},{key:'pivotsBack',title:'Number of pivots back',defval:15,type:'int',min:1,max:5000,step:1}],
  // R3-R5 and S3-S5 start hidden (StockCharts' standard pivot set is P, R1, R2, S1, S2): drawn, the far levels set the price
  // scale and squash the candles. Each stays one Style toggle away.
  plots:PIVOT_LEVELS.map(level=>({id:level,label:level.toUpperCase(),color:level==='p'?ORANGE:level.startsWith('r')?RED:GREEN,width:1,...(/[345]$/.test(level)?{visible:false}:{})})),
  provenance:[{url:HELP+'pivot-points-standard',facts:'Types Traditional, Fibonacci, Woodie, Classic, DM, Camarilla with the published P/R1-R5/S1-S5 formulas from the prior period high, low, close (and open: DM prior open, Woodie current open); only Traditional and Camarilla define R5/S5, Fibonacci stops at R3/S3, Woodie and Classic at R4/S4, DM at R1/S1; Auto timeframe = 1D up to 15 minutes, 1W above 15 minutes and below 1 day, 1M from 1 day; Number of pivots back default 15.'}],
  unknownDefaults:[UNKNOWN,'Type Traditional and Pivots timeframe Auto are OpenCandle-defined defaults (the article does not state them); Number of pivots back 15 is quoted from the article. Use daily-based values, labels and per-level toggles are not implemented.'],
  policies:['US equities (declared by the chart, or inferred when no bar falls on a New York weekend or outside 04:00-20:00 New York): periods are New York trading dates, Monday weeks, months, quarters and years, and on intraday bars only regular-session bars (09:30 to the close, 13:00 on early-close days) set a period\'s open, high, low and close; a daily pivot therefore uses the prior regular session. Daily-or-longer bars count whole. Other feeds (crypto): UTC calendar periods, every bar.','The prior period is the nearest earlier one with a complete open, high, low and close; each period aggregates finite prices only.','Auto uses the chart\'s declared interval; without one it infers the interval from the smallest positive bar spacing (20 hours or more counts as daily).','Each level is a horizontal segment per period: the stroke that would join two periods is transparent. Values exist on every bar of the period for the data window and alerts.','Only the latest Number of pivots back periods (including the current one) carry values.'],
  segmented:true,legendNames:true,calculate:pivotPoints,warmup:()=>2,work:count=>count*64},
 {id:'vwma',name:'Volume weighted moving average',acronym:'VWMA',overlay:true,requiresVolume:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH},SOURCE],plots:[{id:'vwma',label:'VWMA',color:BLUE,width:1}],
  provenance:[{url:LV+'textbook-vwma',facts:'VWMA = sum(source x volume) / sum(volume) over Length (Buff Dormeier, Investing with Volume Analysis, 2011).'}],unknownDefaults:[UNKNOWN],
  policies:['A window with zero total volume or any missing price or volume is unavailable.'],
  calculate({bars,source,num}){const n=num('length'),weighted=source.map((value,i)=>finite(value)&&finite(bars[i].volume)?value*bars[i].volume:null),volume=bars.map(bar=>bar.volume);
   return {vwma:bars.map((_,i)=>{const a=windowSum(weighted,i,n),b=windowSum(volume,i,n);return a===null||b===null||b===0?null:a/b;})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*2},
 {id:'hv',name:'Historical volatility',acronym:'HV',overlay:false,inputs:[{key:'length',title:'Length',defval:10,...LENGTH_2},{key:'periodsPerYear',title:'Periods per year',defval:252,type:'int',min:1,max:1000000,step:1}],plots:[{id:'hv',label:'HV',color:BLUE,width:1}],
  provenance:[{url:LV+'hull-options-futures-derivatives',facts:'John C. Hull: volatility estimate = sample standard deviation of log returns ln(close / prior close) over n periods, annualized by the square root of the number of periods per year (252 trading days).'}],
  unknownDefaults:[UNKNOWN,'Periods per year 252 is the textbook trading-day count; the reference annualization is unverified.'],
  policies:['HV = 100 x sample standard deviation (n - 1) of ln(close / prior close) over Length x sqrt(Periods per year). A missing or nonpositive close makes its return unavailable.'],
  // Sample (n - 1) deviation and 252 per Hull; 24/7 markets set Periods per year (365) themselves, so saved instances never move.
  calculate({bars,num}){const n=num('length'),factor=Math.sqrt(num('periodsPerYear')),c=closes(bars),r=c.map((value,i)=>i&&finite(value)&&finite(c[i-1])&&value>0&&c[i-1]>0?Math.log(value/c[i-1]):null);
   return {hv:r.map((_,i)=>{const m=windowMoments(r,i,n);return m===null?null:zero(100*Math.sqrt(m.ss/(n-1))*factor);})};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*2},
 {id:'uo',name:'Ultimate oscillator',acronym:'UO',overlay:false,inputs:[{key:'fast',title:'Fast length',defval:7,...LENGTH},{key:'middle',title:'Middle length',defval:14,...LENGTH},{key:'slow',title:'Slow length',defval:28,...LENGTH}],plots:[{id:'uo',label:'UO',color:RED,width:1}],
  provenance:[{url:LV+'williams-ultimate-oscillator-1985',facts:'Larry Williams (1985): buying pressure = close - min(low, prior close); true range = max(high, prior close) - min(low, prior close); average n = sum(BP) / sum(TR) over n; UO = 100 x (4 x A7 + 2 x A14 + A28) / 7.'}],unknownDefaults:[UNKNOWN,'Lengths 7/14/28 are the author defaults.'],
  policies:['The first bar has no prior close and is unavailable. A window with zero total true range is unavailable.'],
  calculate({bars,num}){const bp:NumericSeries=[],tr:NumericSeries=[];bars.forEach((bar,i)=>{const prior=i?bars[i-1].close:NaN;if(!i||![bar.high,bar.low,bar.close,prior].every(finite)){bp.push(null);tr.push(null);return;}const low=Math.min(bar.low,prior);bp.push(bar.close-low);tr.push(Math.max(bar.high,prior)-low);});
   const average=(n:number,i:number)=>{const a=windowSum(bp,i,n),b=windowSum(tr,i,n);return a===null||b===null||b===0?null:a/b;};
   return {uo:bars.map((_,i)=>{const a=average(num('fast'),i),b=average(num('middle'),i),c=average(num('slow'),i);return a===null||b===null||c===null?null:100*(4*a+2*b+c)/7;})};},
  warmup:value=>Math.max(value('fast'),value('middle'),value('slow'))+1,work:(count,value)=>count*(value('fast')+value('middle')+value('slow'))*2},
 {id:'trix',name:'TRIX',acronym:'TRIX',overlay:false,inputs:[{key:'length',title:'Length',defval:18,...LENGTH}],plots:[{id:'trix',label:'TRIX',color:RED,width:1}],guides:[{id:'zero',value:0,color:'#787b86'}],
  provenance:[{url:LV+'hutson-trix-1983',facts:'Jack Hutson (1983): TRIX = 1-period percent rate of change of a triple exponential moving average of the close.'}],unknownDefaults:[UNKNOWN,'Length 18 is OpenCandle-defined (Hutson used 15).'],
  policies:['TRIX = 100 x (E3 - prior E3) / prior E3, E3 = EMA(EMA(EMA(close))). The EMAs use the SMA seed (StockCharts, TA-Lib), so TRIX starts once the third EMA is seeded. A zero prior E3 is unavailable.'],
  // x 100 is Hutson's percent rate of change (TASC 1983); some tools scale by 10000 instead.
  calculate({bars,tk,num}){const n=num('length'),e3=tk.ema(tk.ema(tk.ema(closes(bars),n),n),n);return {trix:e3.map((value,i)=>{const prior=i?e3[i-1]:null;return finite(value)&&finite(prior)&&prior!==0?zero(100*(value-prior)/prior):null;})};},
  warmup:value=>3*value('length')-1,work:count=>count*16},
 {id:'cmo',name:'Chande momentum oscillator',acronym:'ChandeMO',overlay:false,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:9,...LENGTH},SOURCE],plots:[{id:'cmo',label:'ChandeMO',color:BLUE,width:1}],guides:[{id:'zero',value:0,color:'#787b86'}],
  provenance:[{url:LV+'chande-kroll-new-technical-trader-1994',facts:'Tushar Chande: CMO = 100 x (sum of up changes - sum of down changes) / (sum of up changes + sum of down changes) over n.'},{url:'indicator-list:indicators',facts:'The name Chande momentum oscillator is the conventional name.'}],
  unknownDefaults:[UNKNOWN,'Length 9 is OpenCandle-defined.'],
  policies:['Changes need the prior source value, so the first bar is unavailable. A window with no change at all is unavailable.'],
  calculate({source,num}){const n=num('length'),d=source.map((value,i)=>i&&finite(value)&&finite(source[i-1])?value-(source[i-1] as number):null),up=d.map(value=>value===null?null:Math.max(value,0)),down=d.map(value=>value===null?null:Math.max(-value,0));
   return {cmo:d.map((_,i)=>{const a=windowSum(up,i,n),b=windowSum(down,i,n);return a===null||b===null||a+b===0?null:zero(100*(a-b)/(a+b));})};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*2},
 {id:'stddev',name:'Standard deviation',acronym:'StdDev',overlay:false,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH},SOURCE],plots:[{id:'stddev',label:'StdDev',color:BLUE,width:1}],
  provenance:[{url:LV+'textbook-population-standard-deviation',facts:'Population standard deviation sqrt(sum((x - mean)^2) / n) of the source over n (the same estimator as the OpenCandle Bollinger Bands).'}],unknownDefaults:[UNKNOWN],
  policies:['Population (n) estimator, two-pass. A window with any missing value is unavailable.'],
  calculate({source,num}){const n=num('length');return {stddev:source.map((_,i)=>{const m=windowMoments(source,i,n);return m===null?null:Math.sqrt(m.ss/n);})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*2},
 {id:'lrc',name:'Linear regression channel',acronym:'LinReg',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Count',defval:100,...LENGTH_2},{key:'upperDeviation',title:'Upper deviation',type:'float',defval:2,min:0,max:100000,step:0.1},{key:'lowerDeviation',title:'Lower deviation',type:'float',defval:2,min:0,max:100000,step:0.1},SOURCE],
  plots:[{id:'upper',label:'Upper',color:BLUE,width:1},{id:'basis',label:'Linear regression',color:RED,width:1},{id:'lower',label:'Lower',color:BLUE,width:1}],band:'plots',fill:{color:BLUE,opacity:10},
  provenance:[{url:LV+'textbook-least-squares-channel',facts:'Ordinary least-squares line of the source against bar position over the last Count bars; the channel is the line +/- k standard deviations of the residuals (standard deviation channel).'}],unknownDefaults:[UNKNOWN],
  policies:['Only the latest Count bars carry values (the channel is refitted on each new bar). With fewer than Count bars loaded, the channel fits all loaded bars (at least 2; OpenCandle-defined). Residual deviation uses the population (n) estimator. A missing value in the window makes the whole channel unavailable.'],
  // Population (n) residual deviation is kept: published standard deviation channels differ (n or n - 1) and saved channels stay put.
  calculate({source,num}){const count=source.length,n=Math.min(num('length'),count),empty=()=>source.map(()=>null as number|null),basis=empty(),upper=empty(),lower=empty();
   if(n>=2){const start=count-n;let sx=0,sy=0,sxx=0,sxy=0,ok=true;for(let k=0;k<n;k++){const y=source[start+k];if(!finite(y)){ok=false;break;}sx+=k;sy+=y;sxx+=k*k;sxy+=k*y;}
    if(ok){const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx),intercept=(sy-slope*sx)/n;let ss=0;for(let k=0;k<n;k++)ss+=((source[start+k] as number)-(intercept+slope*k))**2;const deviation=Math.sqrt(ss/n);
     for(let k=0;k<n;k++){const line=intercept+slope*k;basis[start+k]=line;upper[start+k]=line+num('upperDeviation')*deviation;lower[start+k]=line-num('lowerDeviation')*deviation;}}}
   return {upper,basis,lower};},
  warmup:value=>value('length'),work:(_,value)=>value('length')*8},
 {id:'alma',name:'Arnaud Legoux moving average',acronym:'ALMA',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Window size',defval:9,...LENGTH},{key:'offset',title:'Offset',type:'float',defval:0.85,min:0,max:1,step:0.01},{key:'sigma',title:'Sigma',type:'float',defval:6,min:0.1,max:100000,step:0.1,storedMin:0.001},SOURCE],plots:[{id:'alma',label:'ALMA',color:BLUE,width:1}],
  provenance:[{url:HELP+'arnaud-legoux-moving-average',facts:'Weighted sum over the window with Gaussian weights whose peak is set by the offset and width by sigma, divided by the sum of the weights; window default 9, offset 0.85, sigma 6; developed by Arnaud Legoux and Dimitrios Douzis-Loukas.'},{url:'indicator-list:indicators',facts:'The name Arnaud Legoux moving average is the conventional name.'}],
  unknownDefaults:[UNKNOWN,'Window 9, offset 0.85 and sigma 6 are quoted from the article; input titles and the Source default are OpenCandle-defined.'],
  policies:['Weight k (k = 0 oldest .. n - 1 newest) = exp(-(k - m)^2 / (2 s^2)), m = offset x (n - 1) (not floored), s = n / sigma.'],
  calculate({source,num}){const n=num('length'),m=num('offset')*(n-1),s=n/num('sigma'),weights=Array.from({length:n},(_,k)=>Math.exp(-((k-m)**2)/(2*s*s))),total=weights.reduce((a,b)=>a+b,0);
   return {alma:source.map((_,i)=>{if(i<n-1||total===0)return null;let sum=0;for(let k=0;k<n;k++){const value=source[i-n+1+k];if(!finite(value))return null;sum+=value*weights[k];}return sum/total;})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')},
 {id:'dema',name:'Double EMA',acronym:'DEMA',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:9,...LENGTH},SOURCE],plots:[{id:'dema',label:'DEMA',color:'#43a047',width:1}],
  provenance:[{url:LV+'mulloy-dema-1994',facts:'Patrick Mulloy (1994): DEMA = 2 x EMA(source, n) - EMA(EMA(source, n), n).'}],unknownDefaults:[UNKNOWN],
  policies:['EMAs use the SMA seed (StockCharts, TA-Lib), so DEMA starts on bar 2 x (Length - 1).'],
  calculate({source,tk,num}){const n=num('length'),e1=tk.ema(source,n),e2=tk.ema(e1,n);return {dema:e1.map((value,i)=>finite(value)&&finite(e2[i])?2*value-(e2[i] as number):null)};},
  warmup:value=>2*value('length')-1,work:count=>count*12},
 {id:'tema',name:'Triple EMA',acronym:'TEMA',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:9,...LENGTH},SOURCE],plots:[{id:'tema',label:'TEMA',color:RED,width:1}],
  provenance:[{url:LV+'mulloy-tema-1994',facts:'Patrick Mulloy (1994): TEMA = 3 x EMA1 - 3 x EMA2 + EMA3, EMA2 = EMA(EMA1), EMA3 = EMA(EMA2).'}],unknownDefaults:[UNKNOWN],
  policies:['EMAs use the SMA seed (StockCharts, TA-Lib), so TEMA starts on bar 3 x (Length - 1).'],
  calculate({source,tk,num}){const n=num('length'),e1=tk.ema(source,n),e2=tk.ema(e1,n),e3=tk.ema(e2,n);return {tema:e1.map((value,i)=>finite(value)&&finite(e2[i])&&finite(e3[i])?3*value-3*(e2[i] as number)+(e3[i] as number):null)};},
  warmup:value=>3*value('length')-2,work:count=>count*16},
 {id:'zigzag',name:'Zig zag',acronym:'ZZ',overlay:true,inputs:[{key:'depth',title:'Depth',defval:10,...LENGTH},{key:'deviation',title:'Price deviation for reversals (%)',type:'float',defval:5,min:0.1,max:100,step:0.1,storedMin:0.001}],plots:[{id:'zigzag',label:'Zig zag',color:BLUE,width:2}],
  provenance:[{url:LV+'textbook-zigzag-percent-reversal',facts:'Percent-reversal zig zag (Arthur Merrill, Filtered Waves, 1977): a swing ends when price reverses from its extreme by at least the deviation percent; swings join consecutive extremes with straight lines.'}],
  unknownDefaults:[UNKNOWN,'Deviation 5% and Depth 10 are OpenCandle-defined; the reference Depth semantics are unverified.','Extending the last leg to the newest bar close is OpenCandle-defined.'],
  policies:['Highs and lows drive the swings. Depth is the minimum number of bars between consecutive pivots: an earlier reversal is ignored and the leg continues. The last leg runs to the current extreme and may change on later bars. From that extreme a line extends to the close of the newest bar, so the latest bar always has a value (OpenCandle-defined); it moves with every new bar.','Values between pivots are the straight-line interpolation by bar index (display geometry); a bar with a missing high or low is unavailable.'],
  calculate({bars,num}){const points=zigzagPivots(bars,num('deviation'),num('depth')),out:NumericSeries=bars.map(()=>null);
   const drawn=(i:number)=>finite(bars[i].high)&&finite(bars[i].low),line=(a:{index:number;price:number},b:{index:number;price:number})=>{for(let i=a.index;i<=b.index;i++)if(drawn(i))out[i]=b.index===a.index?b.price:a.price+(b.price-a.price)*(i-a.index)/(b.index-a.index);};
   for(let p=1;p<points.length;p++)line(points[p-1],points[p]);
   // The last leg extends from the extreme to the close of the newest drawable bar, so the legend has a value
   // on the newest bar.
   const last=points.at(-1);let newest=bars.length-1;while(newest>=0&&!(drawn(newest)&&finite(bars[newest].close)))newest--;
   if(points.length>1&&last&&newest>last.index)line(last,{index:newest,price:bars[newest].close});
   return {zigzag:out};},
  warmup:()=>2,work:count=>count*16},
 {id:'efi',name:'Elder force index',acronym:'EFI',overlay:false,requiresVolume:true,inputs:[{key:'length',title:'Length',defval:13,...LENGTH}],plots:[{id:'efi',label:'EFI',color:RED,width:1}],guides:[{id:'zero',value:0,color:'#787b86'}],
  provenance:[{url:LV+'elder-trading-for-a-living-1993',facts:'Alexander Elder: force index = (close - prior close) x volume, smoothed by a 13-period EMA.'}],unknownDefaults:[UNKNOWN,'Length 13 is the author default.'],
  policies:['The first bar has no prior close and is unavailable; the EMA uses the SMA seed (StockCharts, TA-Lib) of the first Length raw values.'],
  calculate({bars,tk,num}){const raw=bars.map((bar,i)=>i&&finite(bar.close)&&finite(bars[i-1].close)&&finite(bar.volume)?(bar.close-bars[i-1].close)*bar.volume:null);return {efi:tk.ema(raw,num('length')).map(value=>finite(value)?zero(value):null)};},
  warmup:value=>value('length')+1,work:count=>count*8},
];
export const R23_INDICATORS:readonly CatalogDefinition[]=definitions;
