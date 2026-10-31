import type {Bar,NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {parseInterval} from '../intervals';
import {newYorkClock} from '../us-market-hours';
import {pivotCalendar,pivotPeriodKey,zigzagPivots,type PivotTimeframe} from './r23-catalog';

/**
 * More built-ins. Formulas are the standard published ones, cited per row under the `:`
 * prefix (original author or textbook). Every name, input title, default, color and width is
 * our own choice and listed in `unknownDefaults`. Calculations are original code.
 */
export const R27_INDICATOR_IDS=['rvat','maribbon','bbpb','bbw','autofib','adr','chop','coppock','crsi','dpo','eom','fisher','klinger','kst','mass','mcginley','netvol','ppo','rvgi','rvi','smiergodic','tsi','vo','vortex','alligator','fractals','woodiescci','ad','chaikinosc','pvt','bop','bbpower'] as const;
export type R27IndicatorId=typeof R27_INDICATOR_IDS[number];

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
/** Bounds. Float defaults sit on their min + k x step grid (tests/domain/r24-indicator-input-steps.test.ts). */
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const LENGTH_2={type:'int' as const,min:2,max:5000,step:1};
const OFFSET={type:'int' as const,min:0,max:500,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const MULTIPLIER:CatalogInput={key:'multiplier',title:'StdDev',type:'float',defval:2,min:0,max:100000,step:0.1};
const LV='lv-defined:';
const NAMES='indicator-list:indicators';
const named=(name:string)=>({url:NAMES,facts:`The name "${name}" is recorded in the Indicators tab row list.`});
const UNKNOWN='Input titles, defaults, colors and widths are OpenCandle-defined (conventional author or textbook values).';
const UNKNOWN_NAME='The name is OpenCandle-defined too (the dialog fact lists only the first 34 rows alphabetically).';
const BLUE='#2962ff',ORANGE='#ff6d00',GREEN='#43a047',RED='#f23645',PURPLE='#7e57c2',TEAL='#26a69a',GREY='#787b86';
const ZERO=[{id:'zero' as const,value:0,color:GREY}];

function windowSum(values:readonly (number|null)[],index:number,window:number):number|null{
 if(index<window-1)return null;let sum=0;for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;sum+=value;}return sum;
}
function extreme(values:readonly (number|null)[],index:number,window:number,pick:'max'|'min'):number|null{
 if(index<window-1)return null;let out=pick==='max'?-Infinity:Infinity;
 for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;out=pick==='max'?Math.max(out,value):Math.min(out,value);}return out;
}
/** Two-pass population mean and deviation of a full finite window (the LV Bollinger Bands estimator); null when any value is missing. */
function windowStats(values:readonly (number|null)[],index:number,window:number):{mean:number;sd:number}|null{
 const sum=windowSum(values,index,window);if(sum===null)return null;const mean=sum/window;let ss=0;
 for(let i=index-window+1;i<=index;i++)ss+=((values[i] as number)-mean)**2;return {mean,sd:Math.sqrt(ss/window)};
}
const highs=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.high)?bar.high:null),lows=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.low)?bar.low:null);
const closes=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.close)?bar.close:null);
const pair=(a:readonly (number|null)[],b:readonly (number|null)[],f:(x:number,y:number)=>number|null):NumericSeries=>a.map((x,i)=>{const y=b[i];return finite(x)&&finite(y)?f(x,y):null;});
/** Percent change over n bars; a zero or missing base is unavailable. */
const rocOf=(values:readonly (number|null)[],n:number):NumericSeries=>values.map((value,i)=>{const base=i>=n?values[i-n]:null;return finite(value)&&finite(base)&&base!==0?zero(100*(value-base)/base):null;});
const changeOf=(values:readonly (number|null)[]):NumericSeries=>values.map((value,i)=>i&&finite(value)&&finite(values[i-1])?zero(value-(values[i-1] as number)):null);
/** Cumulative sum of the finite increments; a missing increment emits null and keeps the total (the LV OBV rule). */
function cumulative(increments:readonly (number|null)[]):NumericSeries{let total=0;return increments.map(value=>{if(!finite(value))return null;total+=value;return zero(total);});}
/** Accumulation/distribution line: running sum of CLV x volume (a bar whose high equals its low adds 0). */
function adLine(bars:readonly Bar[]):NumericSeries{
 return cumulative(bars.map(bar=>{if(![bar.high,bar.low,bar.close,bar.volume].every(finite))return null;const range=bar.high-bar.low;return range===0?0:((bar.close-bar.low)-(bar.high-bar.close))/range*bar.volume;}));
}
/** Commodity channel index of a series over n (Lambert): (x - SMA) / (0.015 x mean deviation); a flat window is unavailable. */
/** Woodies trend coloring (Ken Wood's six-bar rule). A bar is in an up trend (0) when it and the five
 *  bars before it all have CCI above 0, and in a down trend (1) when all six are below 0; otherwise null (neutral). A missing
 *  value or a 0 ends the run. */
export const WOODIES_TREND_BARS=6;
export function woodiesTrendStates(cci:readonly (number|null)[],run=WOODIES_TREND_BARS):(number|null)[]{
 let above=0,below=0;
 return cci.map(value=>{if(!finite(value)||value===0){above=0;below=0;return null;}if(value>0){above++;below=0;}else{below++;above=0;}return above>=run?0:below>=run?1:null;});
}
function cciOf(values:readonly (number|null)[],n:number,tk:CatalogContext['tk']):NumericSeries{
 const mean=tk.sma(values,n);return values.map((value,i)=>{const average=mean[i];if(!finite(value)||!finite(average))return null;let deviation=0;for(let j=i-n+1;j<=i;j++)deviation+=Math.abs((values[j] as number)-average);deviation/=n;return deviation===0?null:zero((value-average)/(0.015*deviation));});
}
/** True strength index core (Blau): 100 x EMA(EMA(change, long), short) / EMA(EMA(|change|, long), short). */
function tsiOf(values:readonly (number|null)[],long:number,short:number,tk:CatalogContext['tk']):NumericSeries{
 const change=changeOf(values),numerator=tk.ema(tk.ema(change,long),short),denominator=tk.ema(tk.ema(change.map(value=>value===null?null:Math.abs(value)),long),short);
 return pair(numerator,denominator,(a,b)=>b===0?null:zero(100*a/b));
}

// ---- Relative volume at time ----
export const RVAT_ANCHORS=['Daily','Weekly','Monthly'] as const;
export const RVAT_MODES=['Cumulative','Regular'] as const;
const DAY=86400;
function resolutionSeconds(resolution:string|null|undefined):number|null{
 if(typeof resolution!=='string')return null;
 try{const spec=parseInterval(resolution);if(spec.kind!=='time')return null;if(spec.unit==='day')return spec.multiplier*DAY;if(spec.unit==='week')return spec.multiplier*7*DAY;if(spec.unit==='month')return spec.multiplier*30*DAY;return spec.seconds;}catch{return null;}
}
function dailyOrLonger(bars:readonly {time:number}[],resolution:string|null|undefined):boolean{
 const declared=resolutionSeconds(resolution);if(declared!==null)return declared>=DAY;
 let spacing=Infinity;for(let i=1;i<bars.length;i++){const step=bars[i].time-bars[i-1].time;if(Number.isFinite(step)&&step>0)spacing=Math.min(spacing,step);}
 return Number.isFinite(spacing)&&spacing>=72000;
}
/** Position of a bar inside its anchor period: minute of day (Daily), Monday-based weekday and minute (Weekly), day of month and minute (Monthly). Daily-or-longer bars use day 0 minute 0. */
function rvatSlot(time:number,anchor:PivotTimeframe,calendar:'us-equity'|'utc',daily:boolean):number|null{
 if(!Number.isFinite(time))return null;let minutes:number,weekday:number,day:number;
 if(calendar==='us-equity'){const clock=newYorkClock(daily?time+DAY/2:time);minutes=clock.minutes;weekday=clock.weekday;day=Number(clock.date.slice(8,10));}
 else{const date=new Date(time*1000);if(!Number.isFinite(date.getTime()))return null;minutes=date.getUTCHours()*60+date.getUTCMinutes();weekday=date.getUTCDay();day=date.getUTCDate();}
 if(daily)minutes=0;
 if(anchor==='Weekly')return ((weekday+6)%7)*1440+(daily?0:minutes);
 if(anchor==='Monthly')return (day-1)*1440+(daily?0:minutes);
 return daily?0:minutes;
}
function relativeVolumeAtTime({bars,num,str,chart}:CatalogContext):Record<string,NumericSeries>{
 const anchor=str('anchor') as PivotTimeframe,length=num('length'),cumulativeMode=str('mode')==='Cumulative';
 const calendar=pivotCalendar(bars,chart?.resolution,chart?.calendar),daily=dailyOrLonger(bars,chart?.resolution);
 const history=new Map<number,{period:string;value:number}[]>(),out:NumericSeries=[];let period:string|null=null,running=0;
 for(const bar of bars){
  const key=pivotPeriodKey(bar.time,anchor,calendar,daily),slot=rvatSlot(bar.time,anchor,calendar,daily);
  if(key===null||slot===null||!finite(bar.volume)){out.push(null);continue;}
  if(key!==period){period=key;running=0;}running+=bar.volume;
  const value=cumulativeMode?running:bar.volume,rows=history.get(slot)??[];
  const prior=rows.filter(row=>row.period!==key).slice(-length);
  const mean=prior.length===length?prior.reduce((sum,row)=>sum+row.value,0)/length:null;
  out.push(mean===null||mean===0?null:zero(value/mean));
  if(rows.at(-1)?.period===key)rows[rows.length-1]={period:key,value};else rows.push({period:key,value});
  if(rows.length>length+1)rows.shift();history.set(slot,rows);
 }
 return {rvol:out};
}

// ---- Moving average ribbon ----
export const RIBBON_MA_TYPES=['SMA','EMA','RMA','WMA'] as const;
const RIBBON_COLORS=['#ffe082','#ffb74d','#fb8c00','#e65100'];

// ---- Auto fib retracement ----
export const AUTO_FIB_LEVELS=[[0,'l0','0'],[0.236,'l236','0.236'],[0.382,'l382','0.382'],[0.5,'l5','0.5'],[0.618,'l618','0.618'],[0.786,'l786','0.786'],[1,'l1','1']] as const;
const FIB_COLORS=[GREY,RED,'#81c784',GREEN,TEAL,'#64b5f6',GREY];

// ---- Williams alligator ----
function alligator({bars,num,tk,projection}:CatalogContext):Record<string,NumericSeries>{
 const hl2=bars.map(bar=>finite(bar.high)&&finite(bar.low)?(bar.high+bar.low)/2:null),n=bars.length,out:Record<string,NumericSeries>={},future:Record<string,NumericSeries>={};
 for(const line of ['jaw','teeth','lips']){
  const smma=tk.rma(hl2,num(line+'Length')),shift=num(line+'Offset');
  out[line]=bars.map((_,i)=>i-shift>=0?smma[i-shift]:null);
  if(shift>0)future[line]=Array.from({length:shift},(_,k)=>{const j=n-shift+k;return j>=0&&finite(smma[j])?smma[j]:null;});
 }
 if(n&&Object.keys(future).length)projection?.(future);
 return out;
}

const definitions:CatalogDefinition[]=[
 {id:'rvat',name:'Relative volume at time',acronym:'RelVol',overlay:false,requiresVolume:true,
  inputs:[{key:'anchor',title:'Anchor timeframe',type:'string',defval:'Daily',options:RVAT_ANCHORS},{key:'length',title:'Length',defval:10,...LENGTH},{key:'mode',title:'Calculation mode',type:'string',defval:'Cumulative',options:RVAT_MODES}],
  plots:[{id:'rvol',label:'Relative volume',kind:'histogram',color:BLUE,width:1}],guides:[{id:'upper',value:1,color:GREY}],precision:2,
  provenance:[{url:LV+'textbook-relative-volume-at-time',facts:'Relative volume at time = volume up to this time of the period (cumulative) or of this bar (regular), divided by the average of the same quantity at the same time in the previous Length periods.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Anchor Daily, Length 10 and Cumulative mode are OpenCandle-defined.'],
  policies:['Periods follow the pivot calendar: New York trading dates (pre-market and after-hours bars count toward their trading date) for US equities, UTC days for other feeds; weeks start on Monday. "The same time" is the minute of the day (Weekly: weekday and minute; Monthly: day of the month and minute). Daily-or-longer bars compare whole bars.','The average uses the latest Length earlier periods that have a bar at that time; with fewer, or a zero average, the value is unavailable.'],
  calculate:relativeVolumeAtTime,warmup:value=>value('length')+1,work:(count,value)=>count*(value('length')+16)},
 {id:'maribbon',name:'Moving average ribbon',acronym:'MA Ribbon',overlay:true,sourceSeries:true,
  inputs:[{key:'maType',title:'MA type',type:'string',defval:'SMA',options:RIBBON_MA_TYPES},{key:'length1',title:'MA 1 length',defval:20,...LENGTH},{key:'length2',title:'MA 2 length',defval:50,...LENGTH},{key:'length3',title:'MA 3 length',defval:100,...LENGTH},{key:'length4',title:'MA 4 length',defval:200,...LENGTH},SOURCE],
  plots:[1,2,3,4].map(n=>({id:'ma'+n,label:'MA '+n,color:RIBBON_COLORS[n-1],width:1})),
  provenance:[{url:LV+'textbook-moving-average-ribbon',facts:'A moving average ribbon plots several moving averages of one type and source with increasing lengths.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 20/50/100/200 and type SMA are OpenCandle-defined.'],
  policies:['RMA is the Wilder average (the OpenCandle SMMA); EMA uses the OpenCandle first-value seed.'],
  calculate({source,tk,num,str}){const average={SMA:tk.sma,EMA:tk.ema,RMA:tk.rma,WMA:tk.wma}[str('maType') as typeof RIBBON_MA_TYPES[number]];return Object.fromEntries([1,2,3,4].map(n=>['ma'+n,average(source,num('length'+n))]));},
  warmup:value=>Math.max(value('length1'),value('length2'),value('length3'),value('length4')),work:(count,value)=>count*(value('length1')+value('length2')+value('length3')+value('length4')+16)},
 {id:'bbpb',name:'Bollinger Bands %b',acronym:'BB %B',overlay:false,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH},SOURCE,MULTIPLIER],
  plots:[{id:'pb',label:'Bollinger Bands %B',color:TEAL,width:1}],guides:[{id:'upper',value:1,color:GREY},{id:'lower',value:0,color:GREY}],band:'guides',fill:{color:TEAL,opacity:10},
  provenance:[named('Bollinger Bands %b'),{url:LV+'bollinger-on-bollinger-bands-2001',facts:'John Bollinger: %b = (price - lower band) / (upper band - lower band); bands = SMA(20) +/- 2 standard deviations.'}],
  unknownDefaults:[UNKNOWN,'Length 20 and StdDev 2 are the author defaults.'],
  policies:['Population standard deviation (the OpenCandle Bollinger Bands estimator). A flat window (upper equals lower) is unavailable.'],
  calculate({source,num}){const n=num('length'),k=num('multiplier');return {pb:source.map((value,i)=>{const s=windowStats(source,i,n);if(!s||!finite(value)||s.sd===0||k===0)return null;const lower=s.mean-k*s.sd;return zero((value-lower)/(2*k*s.sd));})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*2},
 {id:'bbw',name:'Bollinger BandWidth',acronym:'BBW',overlay:false,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:20,...LENGTH},SOURCE,MULTIPLIER],
  plots:[{id:'bbw',label:'Bollinger BandWidth',color:BLUE,width:1}],
  provenance:[named('Bollinger BandWidth'),{url:LV+'bollinger-on-bollinger-bands-2001',facts:'John Bollinger: BandWidth = (upper band - lower band) / middle band.'}],
  unknownDefaults:[UNKNOWN,'Length 20 and StdDev 2 are the author defaults. The ratio is not scaled by 100 (OpenCandle-defined).'],
  policies:['Population standard deviation (the OpenCandle Bollinger Bands estimator). A zero middle band is unavailable; a flat window is 0.'],
  calculate({source,num}){const n=num('length'),k=num('multiplier');return {bbw:source.map((_,i)=>{const s=windowStats(source,i,n);return !s||s.mean===0?null:zero(2*k*s.sd/s.mean);})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*2},
 {id:'autofib',name:'Auto fib retracement',acronym:'Auto Fib',overlay:true,
  inputs:[{key:'deviation',title:'Deviation (%)',type:'float',defval:3,min:0.1,max:100,step:0.1},{key:'depth',title:'Depth',defval:10,...LENGTH},{key:'reverse',title:'Reverse',type:'bool',defval:false}],
  plots:AUTO_FIB_LEVELS.map(([,id,label],k)=>({id,label,color:FIB_COLORS[k],width:1})),
  provenance:[named('Auto fib retracement'),{url:LV+'textbook-fibonacci-retracement',facts:'Fibonacci retracement levels 0, 23.6, 38.2, 50, 61.8, 78.6 and 100 percent of a swing, measured back from the swing end.'},{url:LV+'textbook-zigzag-percent-reversal',facts:'The swing is the latest completed leg of the OpenCandle percent-reversal zig zag (the R23 Zig zag kernel).'}],
  unknownDefaults:[UNKNOWN,'Deviation 3% and Depth 10 are OpenCandle-defined; the reference swing detection and level set are unverified.'],
  policies:['The swing is the latest completed zig zag leg (the leg before the one still forming; with only one leg, that leg). Level 0 sits at the swing end and level 1 at its start; Reverse swaps them.','Levels carry values from the swing start to the newest bar and move when a new leg completes. Bars with a missing high or low are unavailable.'],
  calculate({bars,num,bool}){const points=zigzagPivots(bars,num('deviation'),num('depth')),out:Record<string,NumericSeries>=Object.fromEntries(AUTO_FIB_LEVELS.map(([,id])=>[id,bars.map(()=>null as number|null)]));
   if(points.length<2)return out;const [a,b]=points.length>=3?[points.at(-3)!,points.at(-2)!]:[points[0],points[1]],[zeroAt,oneAt]=bool('reverse')?[a.price,b.price]:[b.price,a.price];
   for(const [ratio,id] of AUTO_FIB_LEVELS){const price=zeroAt+(oneAt-zeroAt)*ratio;for(let i=a.index;i<bars.length;i++)if(finite(bars[i].high)&&finite(bars[i].low))out[id][i]=price;}
   return out;},
  warmup:()=>2,work:count=>count*24},
 {id:'adr',name:'Average daily range',acronym:'ADR',overlay:false,inputs:[{key:'length',title:'Length',defval:14,...LENGTH}],plots:[{id:'adr',label:'ADR',color:BLUE,width:1}],
  provenance:[named('Average daily range'),{url:LV+'textbook-average-daily-range',facts:'Average daily range = simple moving average of high - low over n bars.'}],
  unknownDefaults:[UNKNOWN,'Length 14 is OpenCandle-defined.'],
  policies:['ADR uses the chart\'s own bars: on an intraday chart it averages the bar ranges, not daily ranges (use the indicator timeframe 1D for daily ranges).'],
  calculate({bars,tk,num}){return {adr:tk.sma(bars.map(bar=>finite(bar.high)&&finite(bar.low)?bar.high-bar.low:null),num('length'))};},
  warmup:value=>value('length'),work:count=>count*8},
 {id:'chop',name:'Choppiness index',acronym:'CHOP',overlay:false,inputs:[{key:'length',title:'Length',defval:14,...LENGTH_2}],plots:[{id:'chop',label:'CHOP',color:BLUE,width:1}],
  guides:[{id:'upper',value:61.8,color:GREY},{id:'lower',value:38.2,color:GREY}],band:'guides',fill:{color:BLUE,opacity:10},
  provenance:[named('Choppiness index'),{url:LV+'dreiss-choppiness-index',facts:'E. W. Dreiss: CHOP = 100 x log10(sum of true range over n / (highest high - lowest low over n)) / log10(n); bands 61.8 and 38.2.'}],
  unknownDefaults:[UNKNOWN,'Length 14 and the 61.8 / 38.2 bands are the conventional values.'],
  policies:['True range of the first bar is high - low. A window whose highest high equals its lowest low is unavailable.'],
  calculate({bars,tk,num}){const n=num('length'),tr=tk.trueRange(bars),h=highs(bars),l=lows(bars);return {chop:bars.map((_,i)=>{const sum=windowSum(tr,i,n),hi=extreme(h,i,n,'max'),lo=extreme(l,i,n,'min');return sum===null||hi===null||lo===null||hi===lo?null:zero(100*Math.log10(sum/(hi-lo))/Math.log10(n));})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*3},
 {id:'coppock',name:'Coppock curve',acronym:'Coppock',overlay:false,sourceSeries:true,inputs:[{key:'wmaLength',title:'WMA length',defval:10,...LENGTH},{key:'longRocLength',title:'Long RoC length',defval:14,...LENGTH},{key:'shortRocLength',title:'Short RoC length',defval:11,...LENGTH},SOURCE],
  plots:[{id:'coppock',label:'Coppock curve',color:BLUE,width:1}],guides:ZERO,
  provenance:[named('Coppock curve'),{url:LV+'coppock-barrons-1962',facts:'Edwin Coppock (1962): Coppock curve = 10-period weighted moving average of (14-period rate of change + 11-period rate of change).'}],
  unknownDefaults:[UNKNOWN,'Lengths 10/14/11 are the author defaults (monthly bars in the original).'],
  policies:['Rates of change are percentages; a zero base is unavailable.'],
  calculate({source,tk,num}){return {coppock:tk.wma(pair(rocOf(source,num('longRocLength')),rocOf(source,num('shortRocLength')),(a,b)=>a+b),num('wmaLength'))};},
  warmup:value=>Math.max(value('longRocLength'),value('shortRocLength'))+value('wmaLength'),work:(count,value)=>count*(value('wmaLength')+8)},
 {id:'crsi',name:'Connors RSI',acronym:'CRSI',overlay:false,sourceSeries:true,inputs:[{key:'rsiLength',title:'RSI length',defval:3,...LENGTH},{key:'streakLength',title:'Up/down length',defval:2,...LENGTH},{key:'rankLength',title:'ROC length',defval:100,...LENGTH},SOURCE],
  plots:[{id:'crsi',label:'CRSI',color:BLUE,width:1}],guides:[{id:'upper',value:70,color:GREY},{id:'lower',value:30,color:GREY}],band:'guides',fill:{color:PURPLE,opacity:10},
  provenance:[named('Connors RSI'),{url:LV+'connors-research-connorsrsi-2012',facts:'Connors Research: ConnorsRSI = (RSI(close, 3) + RSI(up/down streak, 2) + PercentRank(1-period rate of change, 100)) / 3; the streak counts consecutive up (+) or down (-) closes and resets to 0 on an unchanged close; PercentRank = percent of the previous 100 values below the current one.'}],
  unknownDefaults:[UNKNOWN,'Lengths 3/2/100 are the author defaults; the 70 / 30 guides are OpenCandle-defined.'],
  policies:['RSI is the OpenCandle Wilder RSI. The streak starts on the second bar. The percent rank needs rankLength earlier rate-of-change values, so the first value is on bar rankLength + 2.'],
  calculate({source,tk,num}){const streak:NumericSeries=source.map(()=>null);let run=0;
   source.forEach((value,i)=>{const prior=i?source[i-1]:null;if(!finite(value)||!finite(prior)){run=0;return;}run=value>prior?(run>0?run+1:1):value<prior?(run<0?run-1:-1):0;streak[i]=run;});
   const a=tk.rsi(source,num('rsiLength')),b=tk.rsi(streak,num('streakLength')),roc=rocOf(source,1),n=num('rankLength');
   const rank=roc.map((value,i)=>{if(!finite(value)||i<n)return null;let below=0;for(let j=i-n;j<i;j++){const prior=roc[j];if(!finite(prior))return null;if(prior<value)below++;}return 100*below/n;});
   return {crsi:a.map((value,i)=>finite(value)&&finite(b[i])&&finite(rank[i])?(value+(b[i] as number)+(rank[i] as number))/3:null)};},
  warmup:value=>Math.max(value('rsiLength')+1,value('streakLength')+2,value('rankLength')+2),work:(count,value)=>count*(value('rankLength')+32)},
 {id:'dpo',name:'Detrended price oscillator',acronym:'DPO',overlay:false,sourceSeries:true,inputs:[{key:'length',title:'Period',defval:21,...LENGTH},{key:'centered',title:'Centered',type:'bool',defval:false},SOURCE],
  plots:[{id:'dpo',label:'DPO',color:TEAL,width:1}],guides:ZERO,
  provenance:[{url:LV+'textbook-detrended-price-oscillator',facts:'DPO compares price with an n-period simple moving average displaced by n / 2 + 1 periods: centered, DPO at bar t = price(t) - SMA(t + n/2 + 1); not centered, DPO = price - SMA from n/2 + 1 bars earlier.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Period 21 and Centered off are OpenCandle-defined.'],
  policies:['The displacement is floor(n / 2) + 1. Centered values need later bars, so the latest displacement bars are unavailable (they fill in as bars close).'],
  calculate({source,tk,num,bool}){const n=num('length'),k=Math.floor(n/2)+1,mean=tk.sma(source,n),centered=bool('centered');
   return {dpo:source.map((value,i)=>{const j=centered?i+k:i-k,average=j>=0&&j<source.length?mean[j]:null;return finite(value)&&finite(average)?zero(value-average):null;})};},
  warmup:value=>value('length')+Math.floor(value('length')/2)+1,work:count=>count*8},
 {id:'eom',name:'Ease of movement',acronym:'EOM',overlay:false,requiresVolume:true,inputs:[{key:'length',title:'Length',defval:14,...LENGTH},{key:'divisor',title:'Divisor',type:'int',defval:10000,min:1,max:1000000000,step:1}],
  plots:[{id:'eom',label:'EOM',color:TEAL,width:1}],guides:ZERO,
  provenance:[{url:LV+'arms-ease-of-movement',facts:'Richard Arms: distance moved = (H + L)/2 - (prior H + prior L)/2; box ratio = (volume / divisor) / (H - L); EMV = distance / box ratio, smoothed by an n-period simple moving average (14).'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 14 and Divisor 10000 are the conventional values.'],
  policies:['A bar with zero volume is unavailable; a bar whose high equals its low has an EMV of 0. The first bar has no prior midpoint.'],
  calculate({bars,tk,num}){const divisor=num('divisor'),raw=bars.map((bar,i)=>{const prior=i?bars[i-1]:null;if(!prior||![bar.high,bar.low,bar.volume,prior.high,prior.low].every(finite)||bar.volume===0)return null;return zero(((bar.high+bar.low)/2-(prior.high+prior.low)/2)*(bar.high-bar.low)/(bar.volume/divisor));});return {eom:tk.sma(raw,num('length'))};},
  warmup:value=>value('length')+1,work:count=>count*8},
 {id:'fisher',name:'Fisher transform',acronym:'Fisher',overlay:false,inputs:[{key:'length',title:'Length',defval:9,...LENGTH}],
  plots:[{id:'fisher',label:'Fisher',color:BLUE,width:1},{id:'trigger',label:'Trigger',color:ORANGE,width:1}],guides:[{id:'upper',value:1.5,color:GREY},{id:'zero',value:0,color:GREY},{id:'lower',value:-1.5,color:GREY}],
  provenance:[{url:LV+'ehlers-cybernetic-analysis-2004',facts:'John Ehlers: value = 0.66 x ((hl2 - lowest low) / (highest high - lowest low) - 0.5) + 0.67 x prior value, limited to +/-0.999; Fisher = 0.5 x ln((1 + value) / (1 - value)) + 0.5 x prior Fisher; trigger = prior Fisher.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 9 and the 1.5 / 0 / -1.5 guides are OpenCandle-defined.'],
  policies:['The recursion starts at 0 on the first full window. A flat window contributes 0. A bar with a missing high or low is unavailable and keeps the recursion state.'],
  calculate({bars,num}){const n=num('length'),h=highs(bars),l=lows(bars),fisher:NumericSeries=[],trigger:NumericSeries=[];let value=0,fish=0,previous:number|null=null;
   bars.forEach((bar,i)=>{const hi=extreme(h,i,n,'max'),lo=extreme(l,i,n,'min');if(hi===null||lo===null||!finite(bar.high)||!finite(bar.low)){fisher.push(null);trigger.push(null);return;}
    const ratio=hi===lo?0:((bar.high+bar.low)/2-lo)/(hi-lo)-0.5;value=Math.max(-0.999,Math.min(0.999,0.66*ratio+0.67*value));fish=0.5*Math.log((1+value)/(1-value))+0.5*fish;
    fisher.push(zero(fish));trigger.push(previous);previous=zero(fish);});
   return {fisher,trigger};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*2},
 {id:'klinger',name:'Klinger oscillator',acronym:'KVO',overlay:false,requiresVolume:true,inputs:[{key:'fastLength',title:'Fast length',defval:34,...LENGTH},{key:'slowLength',title:'Slow length',defval:55,...LENGTH},{key:'signalLength',title:'Signal length',defval:13,...LENGTH}],
  plots:[{id:'kvo',label:'KVO',color:BLUE,width:1},{id:'signal',label:'Signal',color:GREEN,width:1}],guides:ZERO,
  provenance:[{url:LV+'klinger-volume-oscillator',facts:'Stephen Klinger: trend = +1 when H + L + C rises versus the prior bar, else -1; dm = H - L; cm = prior cm + dm while the trend holds, else prior dm + dm; volume force = V x |2 x (dm / cm - 1)| x trend x 100 (the MetaStock form); KVO = EMA(VF, 34) - EMA(VF, 55); signal = EMA(KVO, 13).'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 34/55/13 are the author defaults.'],
  policies:['The first bar has no trend. On the second bar cm starts as prior dm + dm. A zero cm is unavailable. EMAs use the OpenCandle first-value seed.'],
  calculate({bars,tk,num}){const vf:NumericSeries=bars.map(()=>null);let trend=0,cm=0;
   bars.forEach((bar,i)=>{const prior=i?bars[i-1]:null;if(!prior||![bar.high,bar.low,bar.close,bar.volume,prior.high,prior.low,prior.close].every(finite)){trend=0;return;}
    const now=bar.high+bar.low+bar.close>prior.high+prior.low+prior.close?1:-1,dm=bar.high-bar.low,priorDm=prior.high-prior.low;cm=trend!==0&&now===trend?cm+dm:priorDm+dm;trend=now;
    vf[i]=cm===0?null:zero(bar.volume*Math.abs(2*(dm/cm-1))*now*100);});
   const kvo=pair(tk.ema(vf,num('fastLength')),tk.ema(vf,num('slowLength')),(a,b)=>zero(a-b));return {kvo,signal:tk.ema(kvo,num('signalLength'))};},
  warmup:()=>2,work:count=>count*24},
 {id:'kst',name:'Know sure thing',acronym:'KST',overlay:false,sourceSeries:true,
  inputs:[{key:'roc1',title:'ROC length 1',defval:10,...LENGTH},{key:'roc2',title:'ROC length 2',defval:15,...LENGTH},{key:'roc3',title:'ROC length 3',defval:20,...LENGTH},{key:'roc4',title:'ROC length 4',defval:30,...LENGTH},{key:'sma1',title:'SMA length 1',defval:10,...LENGTH},{key:'sma2',title:'SMA length 2',defval:10,...LENGTH},{key:'sma3',title:'SMA length 3',defval:10,...LENGTH},{key:'sma4',title:'SMA length 4',defval:15,...LENGTH},{key:'signalLength',title:'Signal length',defval:9,...LENGTH},SOURCE],
  plots:[{id:'kst',label:'KST',color:TEAL,width:1},{id:'signal',label:'Signal',color:RED,width:1}],guides:ZERO,
  provenance:[{url:LV+'pring-know-sure-thing',facts:'Martin Pring: KST = SMA(ROC10, 10) + 2 x SMA(ROC15, 10) + 3 x SMA(ROC20, 10) + 4 x SMA(ROC30, 15); signal = SMA(KST, 9).'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths are the author daily defaults.'],
  policies:['Rates of change are percentages; a zero base is unavailable.'],
  calculate({source,tk,num}){const parts=[1,2,3,4].map(n=>tk.sma(rocOf(source,num('roc'+n)),num('sma'+n)));const kst=source.map((_,i)=>parts.every(part=>finite(part[i]))?zero(parts.reduce((sum,part,k)=>sum+(k+1)*(part[i] as number),0)):null);return {kst,signal:tk.sma(kst,num('signalLength'))};},
  warmup:value=>Math.max(...[1,2,3,4].map(n=>value('roc'+n)+value('sma'+n)))+value('signalLength')-1,work:count=>count*48},
 {id:'mass',name:'Mass index',acronym:'MI',overlay:false,inputs:[{key:'emaLength',title:'EMA length',defval:9,...LENGTH},{key:'sumLength',title:'Sum length',defval:25,...LENGTH}],
  plots:[{id:'mass',label:'Mass index',color:BLUE,width:1}],
  provenance:[{url:LV+'dorsey-mass-index-1992',facts:'Donald Dorsey: Mass index = sum over 25 of EMA(H - L, 9) / EMA(EMA(H - L, 9), 9).'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 9 and 25 are the author defaults.'],
  policies:['EMAs use the OpenCandle first-value seed, so the first ratios are 1. A zero double EMA is unavailable.'],
  calculate({bars,tk,num}){const n=num('emaLength'),e1=tk.ema(bars.map(bar=>finite(bar.high)&&finite(bar.low)?bar.high-bar.low:null),n),ratio=pair(e1,tk.ema(e1,n),(a,b)=>b===0?null:a/b);return {mass:bars.map((_,i)=>windowSum(ratio,i,num('sumLength')))};},
  warmup:value=>value('sumLength'),work:(count,value)=>count*(value('sumLength')+8)},
 {id:'mcginley',name:'McGinley dynamic',acronym:'MD',overlay:true,sourceSeries:true,inputs:[{key:'length',title:'Length',defval:14,...LENGTH},SOURCE],plots:[{id:'md',label:'McGinley dynamic',color:BLUE,width:1}],
  provenance:[{url:LV+'mcginley-dynamic-1997',facts:'John McGinley: MD = prior MD + (price - prior MD) / (N x (price / prior MD)^4).'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 14 is OpenCandle-defined; no 0.6 constant is applied (the original form).'],
  policies:['MD starts at the first finite value. A missing value is unavailable and keeps the state; a zero prior MD restarts from the next value.'],
  calculate({source,num}){const n=num('length');let md:number|null=null;return {md:source.map(value=>{if(!finite(value))return null;if(md===null||md===0){md=value;return zero(md);}const next:number=md+(value-md)/(n*(value/md)**4);md=Number.isFinite(next)?next:value;return zero(md);})};},
  warmup:()=>1,work:count=>count*8},
 {id:'netvol',name:'Net volume',acronym:'Net Vol',overlay:false,requiresVolume:true,inputs:[],plots:[{id:'netvol',label:'Net volume',color:BLUE,width:1}],guides:ZERO,
  provenance:[{url:LV+'textbook-net-volume',facts:'Net volume = up volume - down volume; here a bar\'s volume counts as up when its close rises versus the prior close and down when it falls.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Classifying whole bars by the close change (instead of finer intrabar data) is OpenCandle-defined.'],
  policies:['An unchanged close adds 0. The first bar has no prior close and is unavailable.'],
  calculate({bars}){return {netvol:bars.map((bar,i)=>{const prior=i?bars[i-1].close:null;if(!finite(bar.close)||!finite(prior)||!finite(bar.volume))return null;return bar.close>prior?bar.volume:bar.close<prior?-bar.volume:0;})};},
  warmup:()=>2,work:count=>count*4},
 {id:'ppo',name:'Price oscillator',acronym:'PPO',overlay:false,sourceSeries:true,inputs:[{key:'fastLength',title:'Fast length',defval:12,...LENGTH},{key:'slowLength',title:'Slow length',defval:26,...LENGTH},{key:'signalLength',title:'Signal length',defval:9,...LENGTH},SOURCE],
  plots:[{id:'ppo',label:'PPO',color:BLUE,width:1},{id:'signal',label:'Signal',color:ORANGE,width:1},{id:'histogram',label:'Histogram',kind:'histogram',color:'#ff5252',width:1}],guides:ZERO,histogramPalette:true,histogramColors:{growing:TEAL,falling:'#ff5252'},
  provenance:[{url:LV+'textbook-percentage-price-oscillator',facts:'PPO = (EMA(12) - EMA(26)) / EMA(26) x 100; signal = EMA(PPO, 9); histogram = PPO - signal (Gerald Appel\'s MACD in percent).'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 12/26/9 are the conventional values.'],
  policies:['EMAs use the OpenCandle first-value seed. A zero slow EMA is unavailable.'],
  calculate({source,tk,num}){const ppo=pair(tk.ema(source,num('fastLength')),tk.ema(source,num('slowLength')),(a,b)=>b===0?null:zero(100*(a-b)/b)),signal=tk.ema(ppo,num('signalLength'));return {ppo,signal,histogram:pair(ppo,signal,(a,b)=>zero(a-b))};},
  warmup:value=>value('slowLength'),work:count=>count*16},
 {id:'rvgi',name:'Relative vigor index',acronym:'RVGI',overlay:false,inputs:[{key:'length',title:'Length',defval:10,...LENGTH}],
  plots:[{id:'rvi',label:'RVGI',color:TEAL,width:1},{id:'signal',label:'Signal',color:RED,width:1}],
  provenance:[{url:LV+'ehlers-relative-vigor-index-2002',facts:'John Ehlers: numerator = (C - O) + 2 x (C1 - O1) + 2 x (C2 - O2) + (C3 - O3), all / 6; denominator the same with H - L; RVI = sum(numerator, n) / sum(denominator, n); signal = (RVI + 2 x RVI1 + 2 x RVI2 + RVI3) / 6.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 10 is the author default.'],
  policies:['A window whose denominator sums to zero is unavailable.'],
  calculate({bars,num}){const n=num('length'),sym=(values:readonly (number|null)[]):NumericSeries=>values.map((value,i)=>{if(i<3)return null;const w=[values[i],values[i-1],values[i-2],values[i-3]];return w.every(finite)?((w[0] as number)+2*(w[1] as number)+2*(w[2] as number)+(w[3] as number))/6:null;});
   const num6=sym(bars.map(bar=>finite(bar.close)&&finite(bar.open)?bar.close-bar.open:null)),den6=sym(bars.map(bar=>finite(bar.high)&&finite(bar.low)?bar.high-bar.low:null));
   const rvi=bars.map((_,i)=>{const a=windowSum(num6,i,n),b=windowSum(den6,i,n);return a===null||b===null||b===0?null:zero(a/b);});return {rvi,signal:sym(rvi)};},
  warmup:value=>value('length')+6,work:(count,value)=>count*(value('length')*2+16)},
 {id:'rvi',name:'Relative volatility index',acronym:'RVI',overlay:false,sourceSeries:true,inputs:[{key:'stdLength',title:'Length',defval:10,...LENGTH_2},{key:'smoothLength',title:'Smoothing length',defval:14,...LENGTH},SOURCE],
  plots:[{id:'rvi',label:'RVI',color:PURPLE,width:1}],guides:[{id:'upper',value:80,color:GREY},{id:'lower',value:20,color:GREY}],band:'guides',fill:{color:PURPLE,opacity:10},
  provenance:[{url:LV+'dorsey-relative-volatility-index-1993',facts:'Donald Dorsey: RVI is computed like RSI, but each period adds the 10-period standard deviation (instead of the price change) to the up side when the close rises and to the down side when it falls, with Wilder smoothing over 14.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 10 and 14 are the author defaults; the 80 / 20 guides are OpenCandle-defined.'],
  policies:['Population standard deviation. An unchanged close adds to neither side. Both sides zero is unavailable.'],
  calculate({source,tk,num}){const n=num('stdLength'),m=num('smoothLength'),change=changeOf(source),sd=source.map((_,i)=>windowStats(source,i,n)?.sd??null);
   const up=tk.rma(pair(change,sd,(c,s)=>c>0?s:0),m),down=tk.rma(pair(change,sd,(c,s)=>c<0?s:0),m);return {rvi:pair(up,down,(a,b)=>a+b===0?null:zero(100*a/(a+b)))};},
  warmup:value=>value('stdLength')+value('smoothLength'),work:(count,value)=>count*(value('stdLength')*2+8)},
 {id:'smiergodic',name:'SMI ergodic indicator/oscillator',acronym:'SMIIO',overlay:false,sourceSeries:true,inputs:[{key:'longLength',title:'Long length',defval:20,...LENGTH},{key:'shortLength',title:'Short length',defval:5,...LENGTH},{key:'signalLength',title:'Signal line length',defval:5,...LENGTH},SOURCE],
  plots:[{id:'smi',label:'SMI',color:BLUE,width:1},{id:'signal',label:'Signal',color:ORANGE,width:1},{id:'oscillator',label:'Oscillator',kind:'histogram',color:'#ff5252',width:1}],guides:ZERO,histogramPalette:true,histogramColors:{growing:TEAL,falling:'#ff5252'},
  provenance:[{url:LV+'blau-momentum-direction-divergence-1995',facts:'William Blau: the SMI ergodic indicator is the true strength index with lengths 20 and 5 (100 x double-smoothed momentum / double-smoothed absolute momentum); signal = EMA(SMI, 5); oscillator = SMI - signal.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 20/5/5 are the author defaults. The indicator and the oscillator are one OpenCandle kind.'],
  policies:['Momentum is the 1-bar change; the long EMA is applied first. EMAs use the OpenCandle first-value seed. A zero denominator is unavailable.'],
  calculate({source,tk,num}){const smi=tsiOf(source,num('longLength'),num('shortLength'),tk),signal=tk.ema(smi,num('signalLength'));return {smi,signal,oscillator:pair(smi,signal,(a,b)=>zero(a-b))};},
  warmup:()=>2,work:count=>count*24},
 {id:'tsi',name:'True strength index',acronym:'TSI',overlay:false,sourceSeries:true,inputs:[{key:'longLength',title:'Long length',defval:25,...LENGTH},{key:'shortLength',title:'Short length',defval:13,...LENGTH},{key:'signalLength',title:'Signal length',defval:13,...LENGTH},SOURCE],
  plots:[{id:'tsi',label:'True strength index',color:BLUE,width:1},{id:'signal',label:'Signal',color:RED,width:1}],guides:ZERO,
  provenance:[{url:LV+'blau-true-strength-index-1991',facts:'William Blau: TSI = 100 x EMA(EMA(change, 25), 13) / EMA(EMA(|change|, 25), 13); signal = EMA(TSI, 13).'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 25/13/13 are the conventional values.'],
  policies:['Momentum is the 1-bar change; the long EMA is applied first. EMAs use the OpenCandle first-value seed. A zero denominator is unavailable.'],
  calculate({source,tk,num}){const tsi=tsiOf(source,num('longLength'),num('shortLength'),tk);return {tsi,signal:tk.ema(tsi,num('signalLength'))};},
  warmup:()=>2,work:count=>count*20},
 {id:'vo',name:'Volume oscillator',acronym:'Volume Osc',overlay:false,requiresVolume:true,inputs:[{key:'shortLength',title:'Short length',defval:5,...LENGTH},{key:'longLength',title:'Long length',defval:10,...LENGTH}],
  plots:[{id:'vo',label:'Volume Osc',color:BLUE,width:1}],guides:ZERO,valueSuffix:'%',precision:2,
  provenance:[{url:LV+'textbook-volume-oscillator',facts:'Volume oscillator = (EMA(volume, short) - EMA(volume, long)) / EMA(volume, long) x 100.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 5 and 10 and the percent display are OpenCandle-defined.'],
  policies:['EMAs use the OpenCandle first-value seed. A zero long EMA is unavailable.'],
  calculate({bars,tk,num}){const volume=bars.map(bar=>finite(bar.volume)?bar.volume:null);return {vo:pair(tk.ema(volume,num('shortLength')),tk.ema(volume,num('longLength')),(a,b)=>b===0?null:zero(100*(a-b)/b))};},
  warmup:()=>1,work:count=>count*12},
 {id:'vortex',name:'Vortex indicator',acronym:'VI',overlay:false,inputs:[{key:'length',title:'Length',defval:14,...LENGTH_2}],
  plots:[{id:'viPlus',label:'VI +',color:BLUE,width:1},{id:'viMinus',label:'VI -',color:RED,width:1}],
  provenance:[{url:LV+'botes-siepman-vortex-2010',facts:'Etienne Botes and Douglas Siepman: VM+ = |H - prior L|, VM- = |L - prior H|; VI+ = sum(VM+, n) / sum(true range, n); VI- likewise; n = 14.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 14 is the author default.'],
  policies:['Movements and true range need the prior bar, so the window starts on the second bar. A zero true range sum is unavailable.'],
  calculate({bars,num}){const n=num('length'),plus:NumericSeries=[],minus:NumericSeries=[],tr:NumericSeries=[];
   bars.forEach((bar,i)=>{const prior=i?bars[i-1]:null;if(!prior||![bar.high,bar.low,prior.high,prior.low,prior.close].every(finite)){plus.push(null);minus.push(null);tr.push(null);return;}plus.push(Math.abs(bar.high-prior.low));minus.push(Math.abs(bar.low-prior.high));tr.push(Math.max(bar.high-bar.low,Math.abs(bar.high-prior.close),Math.abs(bar.low-prior.close)));});
   const ratio=(values:NumericSeries)=>bars.map((_,i)=>{const a=windowSum(values,i,n),b=windowSum(tr,i,n);return a===null||b===null||b===0?null:a/b;});return {viPlus:ratio(plus),viMinus:ratio(minus)};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*3},
 {id:'alligator',name:'Williams alligator',acronym:'Alligator',overlay:true,projects:true,
  inputs:[{key:'jawLength',title:'Jaw length',defval:13,...LENGTH},{key:'jawOffset',title:'Jaw offset',defval:8,...OFFSET},{key:'teethLength',title:'Teeth length',defval:8,...LENGTH},{key:'teethOffset',title:'Teeth offset',defval:5,...OFFSET},{key:'lipsLength',title:'Lips length',defval:5,...LENGTH},{key:'lipsOffset',title:'Lips offset',defval:3,...OFFSET}],
  plots:[{id:'jaw',label:'Jaw',color:BLUE,width:1},{id:'teeth',label:'Teeth',color:RED,width:1},{id:'lips',label:'Lips',color:GREEN,width:1}],
  provenance:[{url:LV+'williams-trading-chaos-1995',facts:'Bill Williams: jaw = 13-period smoothed moving average of the median price (H + L) / 2 shifted 8 bars forward; teeth = 8-period SMMA shifted 5; lips = 5-period SMMA shifted 3.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths and offsets 13/8, 8/5, 5/3 are the author defaults.'],
  policies:['SMMA is the Wilder average (the OpenCandle SMMA). Each line is shifted inside the calculation, so the value at a bar is the value displayed there; its latest offset values are drawn past the last loaded bar (chart display only).'],
  calculate:alligator,warmup:value=>Math.max(value('jawLength')+value('jawOffset'),value('teethLength')+value('teethOffset'),value('lipsLength')+value('lipsOffset')),work:count=>count*24},
 {id:'fractals',name:'Williams fractals',acronym:'Fractals',overlay:true,inputs:[{key:'periods',title:'Periods',defval:2,...LENGTH}],
  plots:[{id:'up',label:'Up fractal',kind:'cross',color:GREEN,width:2},{id:'down',label:'Down fractal',kind:'cross',color:RED,width:2}],
  provenance:[{url:LV+'williams-trading-chaos-1995',facts:'Bill Williams: an up fractal is a bar whose high is above the highs of the two bars on each side; a down fractal is a bar whose low is below the lows of the two bars on each side.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Periods 2 is the author default; the cross marker style is OpenCandle-defined.'],
  policies:['Strict comparisons: an equal neighbour cancels the fractal. A fractal is placed on its own bar at its high or low and is confirmed only after Periods later bars, so the newest Periods bars carry no fractal yet.'],
  calculate({bars,num}){const p=num('periods'),h=highs(bars),l=lows(bars),test=(values:readonly (number|null)[],i:number,above:boolean)=>{const center=values[i];if(!finite(center)||i<p||i+p>=values.length)return null;for(let k=1;k<=p;k++){const a=values[i-k],b=values[i+k];if(!finite(a)||!finite(b))return null;if(above?!(center>a&&center>b):!(center<a&&center<b))return null;}return center;};
   return {up:bars.map((_,i)=>test(h,i,true)),down:bars.map((_,i)=>test(l,i,false))};},
  warmup:value=>2*value('periods')+1,work:(count,value)=>count*value('periods')*4},
 {id:'woodiescci',name:'Woodies CCI',acronym:'Woodies CCI',overlay:false,inputs:[{key:'cciLength',title:'CCI length',defval:14,...LENGTH},{key:'turboLength',title:'Turbo length',defval:6,...LENGTH}],
  plots:[{id:'histogram',label:'CCI histogram',kind:'histogram',color:'#90a4ae',width:1},{id:'cci',label:'CCI',color:TEAL,width:2},{id:'turbo',label:'Turbo CCI',color:ORANGE,width:1}],
  guides:[{id:'upper',value:100,color:GREY},{id:'zero',value:0,color:GREY},{id:'lower',value:-100,color:GREY}],
  pointPalette:{plot:'histogram',colors:[GREEN,RED],labels:['Uptrend','Downtrend'],state:values=>woodiesTrendStates(values('cci'))},
  provenance:[{url:LV+'woodie-cci-club',facts:'Ken Wood ("Woodie"): a 14-period CCI of the typical price, drawn as a histogram and a line, with a 6-period "turbo" CCI; CCI (Donald Lambert, 1980) = (typical price - SMA) / (0.015 x mean deviation). A trend is six or more consecutive CCI bars on one side of zero.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 14 and 6 are the conventional values. The trend colors (green, red) and the neutral histogram color are OpenCandle-defined.'],
  policies:['Typical price = (H + L + C) / 3. A flat window is unavailable.','Trend coloring: a histogram bar is green when it and the 5 bars before it all have CCI above 0, red when all 6 are below 0, and keeps the histogram color otherwise. A missing value or a CCI of exactly 0 restarts the count.'],
  calculate({bars,tk,num}){const tp=bars.map(bar=>[bar.high,bar.low,bar.close].every(finite)?(bar.high+bar.low+bar.close)/3:null),cci=cciOf(tp,num('cciLength'),tk);return {histogram:cci,cci,turbo:cciOf(tp,num('turboLength'),tk)};},
  warmup:value=>Math.max(value('cciLength'),value('turboLength')),work:(count,value)=>count*(value('cciLength')+value('turboLength'))*3},
 {id:'ad',name:'Accumulation/distribution',acronym:'Accum/Dist',overlay:false,requiresVolume:true,inputs:[],plots:[{id:'ad',label:'Accumulation/distribution',color:'#999915',width:1}],
  provenance:[named('Accumulation/distribution'),{url:LV+'chaikin-accumulation-distribution',facts:'Marc Chaikin: close location value CLV = ((C - L) - (H - C)) / (H - L); A/D = running total of CLV x volume.'}],
  unknownDefaults:[UNKNOWN],
  policies:['A bar whose high equals its low adds 0. A bar with a missing price or volume is unavailable and keeps the running total.'],
  calculate({bars}){return {ad:adLine(bars)};},warmup:()=>1,work:count=>count*4},
 {id:'chaikinosc',name:'Chaikin oscillator',acronym:'Chaikin Osc',overlay:false,requiresVolume:true,inputs:[{key:'fast',title:'Fast length',defval:3,...LENGTH},{key:'slow',title:'Slow length',defval:10,...LENGTH}],
  plots:[{id:'osc',label:'Chaikin oscillator',color:RED,width:1}],guides:ZERO,
  provenance:[named('Chaikin oscillator'),{url:LV+'chaikin-oscillator',facts:'Marc Chaikin: Chaikin oscillator = EMA(A/D, 3) - EMA(A/D, 10).'}],
  unknownDefaults:[UNKNOWN,'Lengths 3 and 10 are the author defaults.'],
  policies:['EMAs use the OpenCandle first-value seed, so the oscillator starts at 0 on the first bar.'],
  calculate({bars,tk,num}){const ad=adLine(bars);return {osc:pair(tk.ema(ad,num('fast')),tk.ema(ad,num('slow')),(a,b)=>zero(a-b))};},warmup:()=>1,work:count=>count*12},
 {id:'pvt',name:'Price volume trend',acronym:'PVT',overlay:false,requiresVolume:true,inputs:[],plots:[{id:'pvt',label:'PVT',color:BLUE,width:1}],
  provenance:[{url:LV+'textbook-price-volume-trend',facts:'Price volume trend = running total of volume x (close - prior close) / prior close.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME],
  policies:['The first bar has no prior close and is unavailable; the total starts on the second bar. A zero prior close is unavailable and keeps the total.'],
  calculate({bars}){return {pvt:cumulative(bars.map((bar,i)=>{const prior=i?bars[i-1].close:null;return finite(bar.close)&&finite(prior)&&prior!==0&&finite(bar.volume)?bar.volume*(bar.close-prior)/prior:null;}))};},warmup:()=>2,work:count=>count*4},
 {id:'bop',name:'Balance of power',acronym:'BOP',overlay:false,inputs:[],plots:[{id:'bop',label:'BOP',color:RED,width:1}],guides:ZERO,
  provenance:[named('Balance of power'),{url:LV+'livshin-balance-of-power-2001',facts:'Igor Livshin: balance of power = (close - open) / (high - low).'}],
  unknownDefaults:[UNKNOWN,'No smoothing is applied (OpenCandle-defined).'],
  policies:['A bar whose high equals its low is unavailable.'],
  calculate({bars}){return {bop:bars.map(bar=>[bar.open,bar.high,bar.low,bar.close].every(finite)&&bar.high!==bar.low?zero((bar.close-bar.open)/(bar.high-bar.low)):null)};},warmup:()=>1,work:count=>count*4},
 {id:'bbpower',name:'Bull bear power',acronym:'BBPower',overlay:false,inputs:[{key:'length',title:'Length',defval:13,...LENGTH}],
  plots:[{id:'power',label:'BBPower',kind:'histogram',color:TEAL,width:1},{id:'bull',label:'Bull power',color:GREEN,width:1,visible:false},{id:'bear',label:'Bear power',color:RED,width:1,visible:false}],guides:ZERO,histogramPalette:true,histogramColors:{growing:TEAL,falling:'#ff5252'},
  provenance:[named('Bull bear power'),{url:LV+'elder-ray-come-into-my-trading-room-2002',facts:'Alexander Elder (Elder-ray): bull power = high - EMA(close, 13); bear power = low - EMA(close, 13).'}],
  unknownDefaults:[UNKNOWN,'Length 13 is the author default. The histogram of bull power + bear power, with both lines hidden by default, is OpenCandle-defined.'],
  policies:['The EMA uses the OpenCandle first-value seed.'],
  calculate({bars,tk,num}){const e=tk.ema(closes(bars),num('length')),bull=pair(highs(bars),e,(a,b)=>zero(a-b)),bear=pair(lows(bars),e,(a,b)=>zero(a-b));return {power:pair(bull,bear,(a,b)=>zero(a+b)),bull,bear};},
  warmup:()=>1,work:count=>count*8},
];
export const R27_INDICATORS:readonly CatalogDefinition[]=definitions;
