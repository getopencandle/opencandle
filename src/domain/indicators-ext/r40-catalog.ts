import type {Bar,NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {intradayWeeklyRange,isIntradayResolution} from './r40-volume-catalog';

/**
 * Built-ins a stock trader reaches for often (BBTrend, Chande Kroll stop, Chandelier exit, Aroon oscillator and others).
 * Formulas are the standard published ones (original author or textbook), cited per row under the `:` prefix.
 * Every name, input title, default, color and width is our own choice and listed in `unknownDefaults`. Calculations are
 * original code.
 */
export const R40_INDICATOR_IDS=['w52hl','pivotshl','chandelier','kama','pricechannel','lrslope','median','chandekroll','ulcer','bbtrend','guppy','sebands','aroonosc','techrating'] as const;
export type R40IndicatorId=typeof R40_INDICATOR_IDS[number];

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
/** Bounds. Float defaults sit on their min + k x step grid (tests/domain/r24-indicator-input-steps.test.ts). */
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const LENGTH_2={type:'int' as const,min:2,max:5000,step:1};
const LENGTH_3={type:'int' as const,min:3,max:5000,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const LV='lv-defined:';
const NAMES='indicator-list:indicators';
const named=(name:string)=>({url:NAMES,facts:`The name "${name}" is recorded in the Indicators tab row list.`});
const UNKNOWN='Input titles, defaults, colors and widths are OpenCandle-defined (conventional author or textbook values).';
const UNKNOWN_NAME='The name is OpenCandle-defined too (the dialog fact lists only the first 34 rows alphabetically).';
const BLUE='#2962ff',ORANGE='#ff6d00',GREEN='#089981',RED='#f23645',GREY='#787b86',TEAL='#00bcd4',PURPLE='#7e57c2';
const ZERO=[{id:'zero' as const,value:0,color:GREY}];

const highs=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.high)?bar.high:null),lows=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.low)?bar.low:null);
const closes=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.close)?bar.close:null);
/** Highest/lowest of a full finite window ending at index; null when any value is missing. */
function extreme(values:readonly (number|null)[],index:number,window:number,pick:'max'|'min'):number|null{
 if(index<window-1||index<0)return null;let out=pick==='max'?-Infinity:Infinity;
 for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;out=pick==='max'?Math.max(out,value):Math.min(out,value);}return out;
}
const rolling=(values:readonly (number|null)[],window:number,pick:'max'|'min'):NumericSeries=>values.map((_,i)=>extreme(values,i,window,pick));
const pair=(a:readonly (number|null)[],b:readonly (number|null)[],f:(x:number,y:number)=>number|null):NumericSeries=>a.map((x,i)=>{const y=b[i];return finite(x)&&finite(y)?f(x,y):null;});
/** Least-squares fit of a full finite window ending at index (x = 0..n-1): slope, intercept and residual sum of squares. */
function regression(values:readonly (number|null)[],index:number,n:number):{slope:number;intercept:number;rss:number}|null{
 if(index<n-1)return null;let sx=0,sy=0,sxx=0,sxy=0;
 for(let k=0;k<n;k++){const y=values[index-n+1+k];if(!finite(y))return null;sx+=k;sy+=y;sxx+=k*k;sxy+=k*y;}
 const denominator=n*sxx-sx*sx,slope=denominator===0?0:(n*sxy-sx*sy)/denominator,intercept=(sy-slope*sx)/n;let rss=0;
 for(let k=0;k<n;k++){const residual=(values[index-n+1+k] as number)-(intercept+slope*k);rss+=residual*residual;}
 return Number.isFinite(slope)&&Number.isFinite(rss)?{slope,intercept,rss}:null;
}
/** Two-pass population mean and deviation of a full finite window (the LV Bollinger Bands estimator). */
function windowStats(values:readonly (number|null)[],index:number,window:number):{mean:number;sd:number}|null{
 if(index<window-1)return null;let sum=0;for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;sum+=value;}
 const mean=sum/window;let ss=0;for(let i=index-window+1;i<=index;i++)ss+=((values[i] as number)-mean)**2;return {mean,sd:Math.sqrt(ss/window)};
}
const atrOf=(ctx:CatalogContext,length:number)=>ctx.tk.rma(ctx.tk.trueRange(ctx.bars),length);

// ---- 52 week high/low ----
const WEEK=7*86400;
/** Highest/lowest over the bars whose time lies in (t - weeks, t]. A bar is unavailable until the loaded history reaches the
 *  window start (the first bar is at most one day after it), so a short history never passes for a full year. */
export function trailingWeeksExtremes(bars:readonly Bar[],highValues:readonly (number|null)[],lowValues:readonly (number|null)[],weeks:number):{high:NumericSeries;low:NumericSeries}{
 const span=weeks*WEEK,first=bars.length?bars[0].time:0,high:NumericSeries=[],low:NumericSeries=[];
 const maxQ:number[]=[],minQ:number[]=[];let start=0;
 for(let i=0;i<bars.length;i++){
  const t=bars[i].time;
  while(start<=i&&bars[start].time<=t-span)start++;
  const h=highValues[i],l=lowValues[i];
  if(finite(h)){while(maxQ.length&&(highValues[maxQ[maxQ.length-1]] as number)<=h)maxQ.pop();maxQ.push(i);}
  if(finite(l)){while(minQ.length&&(lowValues[minQ[minQ.length-1]] as number)>=l)minQ.pop();minQ.push(i);}
  while(maxQ.length&&maxQ[0]<start)maxQ.shift();while(minQ.length&&minQ[0]<start)minQ.shift();
  const full=first<=t-span+86400;
  high.push(full&&maxQ.length?highValues[maxQ[0]]:null);low.push(full&&minQ.length?lowValues[minQ[0]]:null);
 }
 return {high,low};
}

// ---- Pivot points high/low ----
/** A pivot at index i: strictly above (high) or below (low) each of the `left` values before it and the `right` values
 *  after it. Placed on its own bar; the newest `right` bars carry no pivot yet. */
export function pivotPoints(values:readonly (number|null)[],left:number,right:number,pick:'high'|'low'):NumericSeries{
 return values.map((center,i)=>{
  if(!finite(center)||i<left||i+right>=values.length)return null;
  for(let k=i-left;k<=i+right;k++){if(k===i)continue;const other=values[k];if(!finite(other))return null;if(pick==='high'?!(center>other):!(center<other))return null;}
  return center;
 });
}

// ---- Chandelier exit ----
/** Chandelier exit (Chuck LeBeau) with a trailing ratchet and a direction switch. Long stop = highest (close or high) -
 *  Multiplier x ATR, never lowered while the prior close stays above the prior long stop; short stop likewise mirrored. The
 *  direction turns up when the close is above the prior short stop and down when it is below the prior long stop. */
export function chandelierExit(bars:readonly Bar[],atr:readonly (number|null)[],length:number,multiplier:number,useClose:boolean){
 const c=closes(bars),hiSrc=useClose?c:highs(bars),loSrc=useClose?c:lows(bars);
 const long:NumericSeries=[],short:NumericSeries=[],buy:NumericSeries=[],sell:NumericSeries=[];
 let prevLong:number|null=null,prevShort:number|null=null,prevClose:number|null=null,dir=1;
 for(let i=0;i<bars.length;i++){
  const hh=extreme(hiSrc,i,length,'max'),ll=extreme(loSrc,i,length,'min'),range=atr[i],price=c[i];
  if(hh===null||ll===null||!finite(range)||!finite(price)){long.push(null);short.push(null);buy.push(null);sell.push(null);continue;}
  let longStop=hh-multiplier*range,shortStop=ll+multiplier*range;
  if(prevLong!==null&&prevClose!==null&&prevClose>prevLong)longStop=Math.max(longStop,prevLong);
  if(prevShort!==null&&prevClose!==null&&prevClose<prevShort)shortStop=Math.min(shortStop,prevShort);
  const prior=dir;
  if(prevShort!==null&&price>prevShort)dir=1;else if(prevLong!==null&&price<prevLong)dir=-1;
  long.push(dir===1?zero(longStop):null);short.push(dir===-1?zero(shortStop):null);
  buy.push(dir===1&&prior===-1?zero(longStop):null);sell.push(dir===-1&&prior===1?zero(shortStop):null);
  prevLong=longStop;prevShort=shortStop;prevClose=price;
 }
 return {long,short,buy,sell};
}

// ---- Kaufman adaptive moving average ----
/** KAMA (Perry Kaufman, Smarter Trading 1995): ER = |x - x[n]| / sum of |x - x[1]| over n (0 when the sum is 0);
 *  sc = (ER x (2/(fast+1) - 2/(slow+1)) + 2/(slow+1))^2; KAMA = prior + sc x (x - prior). The first value is at bar n, with
 *  the source of bar n-1 as the prior. A missing source restarts the average. */
export function kama(source:readonly (number|null)[],n:number,fast:number,slow:number):NumericSeries{
 const fastSc=2/(fast+1),slowSc=2/(slow+1),out:NumericSeries=[];let prior:number|null=null;
 for(let i=0;i<source.length;i++){
  const value=source[i];if(i<n||!finite(value)){out.push(null);prior=null;continue;}
  let noise=0,ok=true;for(let k=i-n+1;k<=i;k++){const a=source[k],b=source[k-1];if(!finite(a)||!finite(b)){ok=false;break;}noise+=Math.abs(a-b);}
  const base=source[i-n];if(!ok||!finite(base)){out.push(null);prior=null;continue;}
  if(prior===null)prior=source[i-1] as number;
  const er=noise===0?0:Math.abs(value-base)/noise,sc=(er*(fastSc-slowSc)+slowSc)**2;
  prior=prior+sc*(value-prior);out.push(zero(prior));
 }
 return out;
}

/** Median of a full finite window ending at index (mean of the two middle values for an even length). */
function windowMedian(values:readonly (number|null)[],index:number,n:number):number|null{
 if(index<n-1)return null;const window:number[]=[];for(let i=index-n+1;i<=index;i++){const value=values[i];if(!finite(value))return null;window.push(value);}
 window.sort((a,b)=>a-b);const mid=n>>1;return n%2?window[mid]:(window[mid-1]+window[mid])/2;
}

// ---- BBTrend ----
/** Column states: 0 positive and not below the previous value (or the first), 1 positive and falling, 2 negative and not above
 *  the previous value (or the first), 3 negative and rising; 0 or missing keeps the plot color (null). */
export function bbTrendState(values:readonly (number|null)[]):(number|null)[]{
 return values.map((value,i)=>{if(!finite(value)||value===0)return null;const prev=i?values[i-1]:null;
  if(value>0)return finite(prev)&&value<prev?1:0;return finite(prev)&&value>prev?3:2;});
}
export const BBTREND_COLORS=Object.freeze(['#089981','#b2dfdb','#f23645','#faa1a4']);

// ---- Guppy multiple moving average ----
const GUPPY_SHORT=[3,5,8,10,12,15],GUPPY_LONG=[30,35,40,45,50,60];
const GUPPY_SHORT_COLORS=['#00bcd4','#00acc1','#0097a7','#00838f','#006064','#004d57'];
const GUPPY_LONG_COLORS=['#ff5252','#f23645','#e53935','#d32f2f','#c62828','#b71c1c'];

// ---- Technical ratings ----
/** Strong buy, buy, neutral, sell, strong sell. */
export const TECH_RATING_COLORS=Object.freeze(['#2962ff','#90bff9','#787b86','#faa1a4','#f23645']);
export const TECH_RATING_LABELS=Object.freeze(['Strong buy','Buy','Neutral','Sell','Strong sell']);
export const TECH_RATING_USES=['All','Moving averages','Oscillators'] as const;
/** Moving-average vote: +1 when the average is below the price, -1 above, 0 equal; null when either is missing. */
export const ratingVoteAbove=(price:number|null,average:number|null):number|null=>finite(price)&&finite(average)?price>average?1:price<average?-1:0:null;
/** Bucket of a rating: 0 strong buy (>= 0.5), 1 buy (>= 0.1), 2 neutral, 3 sell (<= -0.1), 4 strong sell (<= -0.5). */
export function ratingBucket(rating:number|null):number|null{
 if(!finite(rating))return null;return rating>=0.5?0:rating>=0.1?1:rating>-0.1?2:rating>-0.5?3:4;
}
/** Bars before which a group rating is unavailable: the 200-bar averages, and the slowest oscillator chain (Stochastic RSI). */
export const TECH_RATING_READY=Object.freeze({ma:200,osc:50});
/** Mean of a group's votes once the group is ready; a vote still unavailable then (a flat range, a zero divisor) counts as neutral. */
const mean=(votes:readonly (number|null)[],ready:boolean):number|null=>ready?votes.reduce((a:number,b)=>a+(b??0),0)/votes.length:null;
const prevOf=(values:readonly (number|null)[],i:number)=>i?values[i-1]:null;
/** Oscillator rule "below the low level and rising: buy; above the high level and falling: sell"; null when missing. */
export function levelVote(values:readonly (number|null)[],i:number,low:number,high:number):number|null{
 const value=values[i],prev=prevOf(values,i);if(!finite(value)||!finite(prev))return null;
 return value<low&&value>prev?1:value>high&&value<prev?-1:0;
}
/** %K/%D rule: both below the low level with K above D: buy; both above the high level with K below D: sell. */
export function crossVote(k:readonly (number|null)[],d:readonly (number|null)[],i:number,low:number,high:number):number|null{
 const a=k[i],b=d[i];if(!finite(a)||!finite(b))return null;return a<low&&b<low&&a>b?1:a>high&&b>high&&a<b?-1:0;
}
function rawStochastic(values:readonly (number|null)[],hi:readonly (number|null)[],lo:readonly (number|null)[],n:number):NumericSeries{
 return values.map((value,i)=>{const h=extreme(hi,i,n,'max'),l=extreme(lo,i,n,'min');if(!finite(value)||h===null||l===null||h===l)return null;return 100*(value-l)/(h-l);});
}
function cciSeries(values:readonly (number|null)[],n:number,tk:CatalogContext['tk']):NumericSeries{
 const average=tk.sma(values,n);return values.map((value,i)=>{const m=average[i];if(!finite(value)||!finite(m))return null;let deviation=0;for(let j=i-n+1;j<=i;j++)deviation+=Math.abs((values[j] as number)-m);deviation/=n;return deviation===0?null:(value-m)/(0.015*deviation);});
}
function dmiSeries(bars:readonly Bar[],n:number,smoothing:number,tk:CatalogContext['tk']){
 const plus:NumericSeries=[],minus:NumericSeries=[];
 bars.forEach((bar,i)=>{if(!i){plus.push(null);minus.push(null);return;}const prior=bars[i-1];
  if(![bar.high,bar.low,prior.high,prior.low].every(finite)){plus.push(null);minus.push(null);return;}
  const up=bar.high-prior.high,down=prior.low-bar.low;plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);});
 const tr=tk.trueRange(bars).map((value,i)=>i?value:null),str=tk.rma(tr,n),sp=tk.rma(plus,n),sm=tk.rma(minus,n);
 const plusDI=pair(sp,str,(a,b)=>b>0?100*a/b:null),minusDI=pair(sm,str,(a,b)=>b>0?100*a/b:null);
 const dx=pair(plusDI,minusDI,(a,b)=>a+b===0?null:100*Math.abs(a-b)/(a+b));
 return {adx:tk.rma(dx,smoothing),plusDI,minusDI};
}
/** The two group ratings of every bar (mean of the votes; null before the group is ready, TECH_RATING_READY). */
export function technicalRatings(ctx:CatalogContext):{ma:NumericSeries;osc:NumericSeries}{
 const {bars,tk}=ctx,c=closes(bars),h=highs(bars),l=lows(bars),volume=bars.map(bar=>finite(bar.volume)?bar.volume:null);
 const hlc3=bars.map((bar,i)=>finite(h[i])&&finite(l[i])&&finite(c[i])?((h[i] as number)+(l[i] as number)+(c[i] as number))/3:null);
 const hl2=bars.map((_,i)=>finite(h[i])&&finite(l[i])?((h[i] as number)+(l[i] as number))/2:null);
 const averages:NumericSeries[]=[];
 for(const n of [10,20,30,50,100,200])averages.push(tk.sma(c,n),tk.ema(c,n));
 const pv=pair(c,volume,(a,b)=>a*b),sv=tk.sma(volume,20);averages.push(pair(tk.sma(pv,20),sv,(a,b)=>b===0?null:a/b));
 const half=tk.wma(c,4),full=tk.wma(c,9);averages.push(tk.wma(pair(half,full,(a,b)=>2*a-b),3));
 averages.push(bars.map((_,i)=>{const hh=extreme(h,i,26,'max'),ll=extreme(l,i,26,'min');return hh===null||ll===null?null:(hh+ll)/2;}));
 const rsi=tk.rsi(c,14);
 const k=tk.sma(rawStochastic(c,h,l,14),3),d=tk.sma(k,3);
 const cci=cciSeries(hlc3,20,tk);const {adx,plusDI,minusDI}=dmiSeries(bars,14,14,tk);
 const ao=pair(tk.sma(hl2,5),tk.sma(hl2,34),(a,b)=>a-b);
 const mom=c.map((value,i)=>i>=10&&finite(value)&&finite(c[i-10])?value-(c[i-10] as number):null);
 const ema12=tk.ema(c,12),ema26=tk.ema(c,26),macd=pair(ema12,ema26,(a,b)=>a-b),signal=tk.ema(macd,9);
 const srsiK=tk.sma(rawStochastic(rsi,rsi,rsi,14),3),srsiD=tk.sma(srsiK,3);
 const hh14=rolling(h,14,'max'),ll14=rolling(l,14,'min');
 const willr=c.map((value,i)=>{const a=hh14[i],b=ll14[i];return finite(value)&&finite(a)&&finite(b)&&a!==b?-100*(a-value)/(a-b):null;});
 const ema13=tk.ema(c,13),bull=pair(h,ema13,(a,b)=>a-b),bear=pair(l,ema13,(a,b)=>a-b);
 const bp=bars.map((_,i)=>i&&finite(c[i])&&finite(l[i])&&finite(c[i-1])?(c[i] as number)-Math.min(l[i] as number,c[i-1] as number):null);
 const trUo=bars.map((_,i)=>i&&finite(h[i])&&finite(l[i])&&finite(c[i-1])?Math.max(h[i] as number,c[i-1] as number)-Math.min(l[i] as number,c[i-1] as number):null);
 const avg=(n:number)=>pair(tk.sma(bp,n),tk.sma(trUo,n),(a,b)=>b===0?null:a/b);
 const a7=avg(7),a14=avg(14),a28=avg(28),uo=bars.map((_,i)=>finite(a7[i])&&finite(a14[i])&&finite(a28[i])?100*(4*(a7[i] as number)+2*(a14[i] as number)+(a28[i] as number))/7:null);
 const ma:NumericSeries=[],osc:NumericSeries=[];
 for(let i=0;i<bars.length;i++){
  ma.push(finite(c[i])?mean(averages.map(series=>ratingVoteAbove(c[i],series[i])),i>=TECH_RATING_READY.ma-1):null);
  const adxNow=adx[i],adxPrev=prevOf(adx,i),pdi=plusDI[i],mdi=minusDI[i];
  const adxVote=finite(adxNow)&&finite(adxPrev)&&finite(pdi)&&finite(mdi)?adxNow>20&&adxNow>adxPrev&&pdi>mdi?1:adxNow>20&&adxNow>adxPrev&&mdi>pdi?-1:0:null;
  const a0=ao[i],a1=prevOf(ao,i),a2=i>1?ao[i-2]:null;
  const aoVote=finite(a0)&&finite(a1)&&finite(a2)?(a0>0&&a1<=0)||(a0>0&&a1>0&&a2>0&&a0>a1&&a1<a2)?1:(a0<0&&a1>=0)||(a0<0&&a1<0&&a2<0&&a0<a1&&a1>a2)?-1:0:null;
  const m0=mom[i],m1=prevOf(mom,i),momVote=finite(m0)&&finite(m1)?m0>m1?1:m0<m1?-1:0:null;
  const macdVote=finite(macd[i])&&finite(signal[i])?(macd[i] as number)>(signal[i] as number)?1:(macd[i] as number)<(signal[i] as number)?-1:0:null;
  const e=ema13[i],b0=bear[i],b1=prevOf(bear,i),u0=bull[i],u1=prevOf(bull,i),price=c[i];
  const bbpVote=finite(e)&&finite(price)&&finite(b0)&&finite(b1)&&finite(u0)&&finite(u1)?price>e&&b0<0&&b0>b1?1:price<e&&u0>0&&u0<u1?-1:0:null;
  const uoVote=finite(uo[i])?(uo[i] as number)>70?1:(uo[i] as number)<30?-1:0:null;
  osc.push(mean([levelVote(rsi,i,30,70),crossVote(k,d,i,20,80),levelVote(cci,i,-100,100),adxVote,aoVote,momVote,macdVote,crossVote(srsiK,srsiD,i,20,80),levelVote(willr,i,-80,-20),bbpVote,uoVote],finite(c[i])&&i>=TECH_RATING_READY.osc-1));
 }
 return {ma,osc};
}

const definitions:CatalogDefinition[]=[
 {id:'w52hl',name:'52 week high/low',acronym:'52W HL',overlay:true,dailyHistory:true,
  inputs:[{key:'extremes',title:'Source',type:'string',defval:'High/Low',options:['High/Low','Close']},{key:'weeks',title:'Lookback weeks',type:'int',defval:52,min:1,max:520,step:1}],
  plots:[{id:'high',label:'52 week high',color:GREEN,width:1},{id:'low',label:'52 week low',color:RED,width:1}],
  provenance:[{url:LV+'textbook-52-week-range',facts:'The 52-week high and low are the highest and lowest prices of the trailing 52 weeks (one year) of trading.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'The High/Low and Close source choice and the Lookback weeks input (default 52) are OpenCandle-defined.'],
  policies:['The window holds the bars whose time is within the trailing Lookback weeks of the current bar (by time, not a bar count). Until the loaded history reaches the window start, the values are unavailable; intraday charts request daily history, exclude its unfinished daily candle and combine it with the observed chart day.'],
  calculate(ctx){if(isIntradayResolution(ctx.chart?.resolution))return intradayWeeklyRange(ctx);const {bars,str,num}=ctx,close=str('extremes')==='Close',c=closes(bars);return trailingWeeksExtremes(bars,close?c:highs(bars),close?c:lows(bars),num('weeks'));},
  warmup:()=>1,work:count=>count*12},
 {id:'pivotshl',name:'Pivot points high/low',acronym:'Pivots HL',overlay:true,
  inputs:[{key:'leftHigh',title:'Pivot high left',defval:10,...LENGTH},{key:'rightHigh',title:'Pivot high right',defval:10,...LENGTH},{key:'leftLow',title:'Pivot low left',defval:10,...LENGTH},{key:'rightLow',title:'Pivot low right',defval:10,...LENGTH}],
  plots:[{id:'high',label:'Pivot high',kind:'cross',color:GREEN,width:2},{id:'low',label:'Pivot low',kind:'cross',color:RED,width:2}],
  provenance:[{url:LV+'textbook-swing-pivots',facts:'A pivot (swing) high is a bar whose high exceeds the highs of a set number of bars on its left and on its right; a pivot low mirrors it with the lows.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Left and right 10 for both pivots and the cross markers are OpenCandle-defined.'],
  policies:['Strict comparisons: an equal neighbour cancels the pivot. A pivot is placed on its own bar at its high or low and is confirmed only after Right later bars, so the newest Right bars carry no pivot yet.'],
  calculate({bars,num}){return {high:pivotPoints(highs(bars),num('leftHigh'),num('rightHigh'),'high'),low:pivotPoints(lows(bars),num('leftLow'),num('rightLow'),'low')};},
  warmup:value=>Math.max(value('leftHigh')+value('rightHigh'),value('leftLow')+value('rightLow'))+1,work:(count,value)=>count*(value('leftHigh')+value('rightHigh')+value('leftLow')+value('rightLow')+4)},
 {id:'chandelier',name:'Chandelier exit',acronym:'CE',overlay:true,
  inputs:[{key:'length',title:'ATR period',defval:22,...LENGTH},{key:'multiplier',title:'ATR multiplier',type:'float',defval:3,min:0.1,max:100,step:0.1},{key:'useClose',title:'Use close price for extremums',type:'bool',defval:true}],
  plots:[{id:'long',label:'Long stop',color:GREEN,width:2},{id:'short',label:'Short stop',color:RED,width:2},{id:'buy',label:'Buy',kind:'cross',color:GREEN,width:4},{id:'sell',label:'Sell',kind:'cross',color:RED,width:4}],
  provenance:[named('Chandelier exit'),{url:LV+'lebeau-chandelier-exit',facts:'Chuck LeBeau, Chandelier exit: a long exit hangs Multiplier x ATR below the highest point since entry (22 periods and 3 ATR in the published form); the short exit mirrors it from the lowest point.'}],
  unknownDefaults:[UNKNOWN,'ATR period 22 and multiplier 3 are the author values. The close-price extremes, the ratchet, the direction switch and the Buy/Sell markers are OpenCandle-defined.'],
  policies:['ATR is Wilder\'s RMA of the true range. The long stop is never lowered while the prior close stays above the prior long stop; the short stop is never raised while the prior close stays below the prior short stop. The direction turns up on a close above the prior short stop and down on a close below the prior long stop; only the stop of the current direction is drawn. The first bar starts up.'],
  calculate(ctx){const n=ctx.num('length');return chandelierExit(ctx.bars,atrOf(ctx,n),n,ctx.num('multiplier'),ctx.bool('useClose'));},
  warmup:value=>value('length')+1,work:(count,value)=>count*(value('length')*2+12)},
 {id:'kama',name:'Kaufman adaptive moving average',acronym:'KAMA',overlay:true,sourceSeries:true,
  inputs:[{key:'length',title:'Length',defval:10,...LENGTH},{key:'fastLength',title:'Fast length',defval:2,...LENGTH},{key:'slowLength',title:'Slow length',defval:30,...LENGTH},SOURCE],
  plots:[{id:'kama',label:'KAMA',color:BLUE,width:1}],
  provenance:[{url:LV+'kaufman-smarter-trading-1995',facts:'Perry Kaufman, Smarter Trading (1995): efficiency ratio = net change / sum of absolute changes over n; smoothing constant = (ER x (fast - slow) + slow)^2 with fast = 2/(2+1) and slow = 2/(30+1); KAMA = prior + sc x (price - prior). Published defaults 10, 2, 30.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Lengths 10, 2 and 30 are the author values; the input titles, color and the seed are OpenCandle-defined.'],
  policies:['The first value is on bar Length, seeded with the previous source. A flat window has an efficiency ratio of 0. A missing source restarts the average.'],
  calculate({source,num}){return {kama:kama(source,num('length'),num('fastLength'),num('slowLength'))};},
  warmup:value=>value('length')+1,work:(count,value)=>count*(value('length')+6)},
 {id:'pricechannel',name:'Price channel',acronym:'PC',overlay:true,
  inputs:[{key:'length',title:'Length',defval:20,...LENGTH}],
  plots:[{id:'upper',label:'Upper',color:RED,width:1},{id:'lower',label:'Lower',color:GREEN,width:1},{id:'center',label:'Center',color:BLUE,width:1}],
  band:'plots',fill:{color:BLUE,opacity:5},
  provenance:[{url:LV+'textbook-price-channels',facts:'Price channels: the upper line is the highest high and the lower line the lowest low of a set number of periods, excluding the current period, so a close outside the channel is a breakout.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 20, the center line, colors and the fill are OpenCandle-defined.'],
  policies:['The window is the Length bars before the current bar (the current bar is excluded, unlike Donchian channels). Center = (upper + lower) / 2. Offset uses the shared OpenCandle display offset.'],
  calculate({bars,num}){const n=num('length'),h=highs(bars),l=lows(bars),upper=bars.map((_,i)=>extreme(h,i-1,n,'max')),lower=bars.map((_,i)=>extreme(l,i-1,n,'min'));
   return {upper,lower,center:pair(upper,lower,(a,b)=>(a+b)/2)};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*2},
 {id:'lrslope',name:'Linear regression slope',acronym:'LRS',overlay:false,sourceSeries:true,
  inputs:[{key:'length',title:'Length',defval:14,...LENGTH_2},SOURCE],
  plots:[{id:'slope',label:'Slope',color:BLUE,width:1}],guides:ZERO,
  provenance:[{url:LV+'textbook-linear-regression-slope',facts:'Linear regression slope: the slope of the least-squares line fitted to the last n prices, in price units per bar.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 14, the zero line and the color are OpenCandle-defined.'],
  policies:['x runs 0..Length-1 across the window; any missing value in the window is unavailable.'],
  calculate({source,num}){const n=num('length');return {slope:source.map((_,i)=>{const fit=regression(source,i,n);return fit?zero(fit.slope):null;})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*4},
 {id:'median',name:'Median',acronym:'Median',overlay:true,sourceSeries:true,
  inputs:[{...SOURCE,defval:'hl2'},{key:'length',title:'Median length',defval:3,...LENGTH},{key:'atrLength',title:'ATR length',defval:14,...LENGTH},{key:'multiplier',title:'ATR multiplier',type:'float',defval:2,min:0.1,max:100,step:0.1}],
  plots:[{id:'median',label:'Median',color:RED,width:2},{id:'ema',label:'Median EMA',color:BLUE,width:1},{id:'upper',label:'Upper band',color:GREEN,width:1},{id:'lower',label:'Lower band',color:GREEN,width:1}],
  band:'plots',fill:{color:GREEN,opacity:5},
  provenance:[{url:LV+'textbook-rolling-median-atr-bands',facts:'A rolling median of the price (robust to single outliers), its exponential average, and bands at a multiple of the average true range around the median.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Source hl2, median length 3, ATR 14, multiplier 2, the EMA of the median on the median length, colors and the fill are OpenCandle-defined.'],
  policies:['An even length takes the mean of the two middle values. The EMA uses the SMA seed (StockCharts, TA-Lib). ATR is Wilder\'s RMA of the true range. Bands = median +/- multiplier x ATR.'],
  calculate(ctx){const {source,tk,num}=ctx,n=num('length'),median=source.map((_,i)=>windowMedian(source,i,n)),atr=atrOf(ctx,num('atrLength')),m=num('multiplier');
   return {median,ema:tk.ema(median,n),upper:pair(median,atr,(a,b)=>zero(a+m*b)),lower:pair(median,atr,(a,b)=>zero(a-m*b))};},
  warmup:value=>Math.max(value('length'),value('atrLength')),work:(count,value)=>count*(value('length')*4+16)},
 {id:'chandekroll',name:'Chande Kroll stop',acronym:'CKS',overlay:true,
  inputs:[{key:'atrLength',title:'ATR length',defval:10,...LENGTH},{key:'atrCoef',title:'ATR coefficient',type:'float',defval:1,min:0.1,max:100,step:0.1},{key:'stopLength',title:'Stop length',defval:9,...LENGTH}],
  plots:[{id:'stopLong',label:'Stop long',color:GREEN,width:1},{id:'stopShort',label:'Stop short',color:RED,width:1}],
  provenance:[named('Chande Kroll stop'),{url:LV+'chande-kroll-new-technical-trader-1994',facts:'Tushar Chande and Stanley Kroll, The New Technical Trader (1994): first high stop = highest high(p) - x x ATR(p); first low stop = lowest low(p) + x x ATR(p); stop short = highest(first high stop, q); stop long = lowest(first low stop, q); p = 10, x = 1, q = 9.'}],
  unknownDefaults:[UNKNOWN,'p 10, x 1 and q 9 are the author values; the input titles, colors and widths are OpenCandle-defined.'],
  policies:['ATR is Wilder\'s RMA of the true range over the ATR length.'],
  calculate(ctx){const p=ctx.num('atrLength'),x=ctx.num('atrCoef'),q=ctx.num('stopLength'),atr=atrOf(ctx,p),h=highs(ctx.bars),l=lows(ctx.bars);
   const firstHigh=pair(rolling(h,p,'max'),atr,(a,b)=>a-x*b),firstLow=pair(rolling(l,p,'min'),atr,(a,b)=>a+x*b);
   return {stopLong:rolling(firstLow,q,'min').map(value=>value===null?null:zero(value)),stopShort:rolling(firstHigh,q,'max').map(value=>value===null?null:zero(value))};},
  warmup:value=>value('atrLength')+value('stopLength'),work:(count,value)=>count*(value('atrLength')*2+value('stopLength')*2+8)},
 {id:'ulcer',name:'Ulcer index',acronym:'UI',overlay:false,sourceSeries:true,
  inputs:[{key:'length',title:'Length',defval:14,...LENGTH},SOURCE],
  plots:[{id:'ulcer',label:'Ulcer index',color:BLUE,width:1}],
  provenance:[{url:LV+'martin-mccann-investors-guide-to-fidelity-funds-1989',facts:'Peter Martin (1987): percent drawdown R = 100 x (price - highest price of n) / highest price of n; Ulcer index = square root of the mean of R squared over n; n = 14.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 14 is the author value; the source input, the color and the width are OpenCandle-defined.'],
  policies:['The highest source and the mean of squares use the same Length, so the first value is on bar 2 x Length - 2. A zero highest source is unavailable.'],
  calculate({source,num}){const n=num('length'),top=rolling(source,n,'max'),drawdown=pair(source,top,(a,b)=>b===0?null:100*(a-b)/b);
   return {ulcer:drawdown.map((_,i)=>{if(i<n-1)return null;let sum=0;for(let k=i-n+1;k<=i;k++){const r=drawdown[k];if(!finite(r))return null;sum+=r*r;}return zero(Math.sqrt(sum/n));})};},
  warmup:value=>2*value('length')-1,work:(count,value)=>count*value('length')*3},
 {id:'bbtrend',name:'BBTrend',acronym:'BBTrend',overlay:false,sourceSeries:true,
  inputs:[{key:'shortLength',title:'Short BB length',defval:20,...LENGTH_2},{key:'longLength',title:'Long BB length',defval:50,...LENGTH_2},{key:'stdDev',title:'StdDev',type:'float',defval:2,min:0.1,max:100,step:0.1},SOURCE],
  plots:[{id:'bbtrend',label:'BBTrend',kind:'histogram',color:GREEN,width:1}],guides:ZERO,
  pointPalette:{plot:'bbtrend',colors:BBTREND_COLORS,labels:['Positive, rising','Positive, falling','Negative, falling','Negative, rising'],state:values=>bbTrendState(values('bbtrend'))},
  provenance:[named('BBTrend'),{url:LV+'bollinger-bbtrend-2024',facts:'John Bollinger, BBTrend: (|short lower band - long lower band| - |short upper band - long upper band|) / short middle band x 100, from 20- and 50-period Bollinger Bands of 2 standard deviations.'}],
  unknownDefaults:[UNKNOWN,'Lengths 20 and 50 and StdDev 2 are the author values; the input titles, the four column colors and the zero line are OpenCandle-defined.'],
  policies:['The bands use the OpenCandle Bollinger Bands estimator (simple mean, population standard deviation). A zero short middle band is unavailable.'],
  calculate({source,num}){const s=num('shortLength'),l=num('longLength'),k=num('stdDev');
   return {bbtrend:source.map((_,i)=>{const a=windowStats(source,i,s),b=windowStats(source,i,l);if(!a||!b||a.mean===0)return null;
    const lower=Math.abs((a.mean-k*a.sd)-(b.mean-k*b.sd)),upper=Math.abs((a.mean+k*a.sd)-(b.mean+k*b.sd)),value=(lower-upper)/a.mean*100;return Number.isFinite(value)?zero(value):null;})};},
  warmup:value=>Math.max(value('shortLength'),value('longLength')),work:(count,value)=>count*(value('shortLength')+value('longLength'))*2},
 {id:'guppy',name:'Guppy multiple moving average',acronym:'GMMA',overlay:true,sourceSeries:true,
  inputs:[...GUPPY_SHORT.map((n,i)=>({key:`short${i+1}`,title:`Short EMA ${i+1}`,defval:n,...LENGTH})),...GUPPY_LONG.map((n,i)=>({key:`long${i+1}`,title:`Long EMA ${i+1}`,defval:n,...LENGTH})),SOURCE],
  plots:[...GUPPY_SHORT.map((_,i)=>({id:`short${i+1}`,label:`Short EMA ${i+1}`,color:GUPPY_SHORT_COLORS[i],width:1})),...GUPPY_LONG.map((_,i)=>({id:`long${i+1}`,label:`Long EMA ${i+1}`,color:GUPPY_LONG_COLORS[i],width:1}))],
  provenance:[{url:LV+'guppy-trading-tactics-1997',facts:'Daryl Guppy: a short-term group of exponential averages (3, 5, 8, 10, 12, 15) and a long-term group (30, 35, 40, 45, 50, 60) of the close.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'The twelve lengths are the author values; the source input, titles and the two color ramps are OpenCandle-defined.'],
  policies:['Each line is an EMA with the SMA seed (StockCharts, TA-Lib).'],
  calculate({source,tk,num}){const out:Record<string,NumericSeries>={};for(let i=1;i<=6;i++){out[`short${i}`]=tk.ema(source,num(`short${i}`));}for(let i=1;i<=6;i++){out[`long${i}`]=tk.ema(source,num(`long${i}`));}return out;},
  warmup:()=>1,work:count=>count*12*8},
 {id:'sebands',name:'Standard error bands',acronym:'SEB',overlay:true,sourceSeries:true,
  inputs:[{key:'length',title:'Length',defval:21,...LENGTH_3},{key:'smoothing',title:'Smoothing',defval:3,...LENGTH},{key:'multiplier',title:'Standard errors',type:'float',defval:2,min:0.1,max:100,step:0.1},SOURCE],
  plots:[{id:'middle',label:'Middle',color:ORANGE,width:1},{id:'upper',label:'Upper',color:BLUE,width:1},{id:'lower',label:'Lower',color:BLUE,width:1}],
  band:'plots',fill:{color:BLUE,opacity:5},
  provenance:[{url:LV+'andersen-standard-error-bands-1996',facts:'Jon Andersen, Standard error bands (Technical Analysis of Stocks and Commodities, 1996): the linear regression end value of n periods +/- k standard errors of the regression, each smoothed by a short simple average; n 21, smoothing 3, k 2.'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'Length 21, smoothing 3 and 2 standard errors are the author values; titles, colors and the fill are OpenCandle-defined.'],
  policies:['Standard error = square root of (sum of squared residuals / (Length - 2)). Middle, upper and lower are each the SMA over Smoothing of the end value, end + k x SE and end - k x SE.'],
  calculate({source,tk,num}){const n=num('length'),k=num('multiplier'),s=num('smoothing'),end:NumericSeries=[],up:NumericSeries=[],down:NumericSeries=[];
   source.forEach((_,i)=>{const fit=regression(source,i,n);if(!fit){end.push(null);up.push(null);down.push(null);return;}const value=fit.intercept+fit.slope*(n-1),se=Math.sqrt(fit.rss/(n-2));end.push(value);up.push(value+k*se);down.push(value-k*se);});
   return {middle:tk.sma(end,s),upper:tk.sma(up,s),lower:tk.sma(down,s)};},
  warmup:value=>value('length')+value('smoothing')-1,work:(count,value)=>count*(value('length')*6+value('smoothing')*3)},
 {id:'aroonosc',name:'Aroon oscillator',acronym:'Aroon Osc',overlay:false,
  inputs:[{key:'length',title:'Length',defval:14,...LENGTH}],
  plots:[{id:'oscillator',label:'Aroon oscillator',color:BLUE,width:1}],guides:[{id:'upper',value:90,color:GREY},{id:'zero',value:0,color:GREY},{id:'lower',value:-90,color:GREY}],
  provenance:[named('Aroon oscillator'),{url:LV+'chande-aroon-1995',facts:'Tushar Chande (1995): Aroon oscillator = Aroon Up - Aroon Down, where Aroon Up = 100 x (n - bars since the n-period high) / n and Aroon Down likewise with the low; n 25 in the original, 14 is common.'}],
  unknownDefaults:[UNKNOWN,'Length 14 (as the OpenCandle Aroon), the 90 and -90 levels and the color are OpenCandle-defined.'],
  policies:['The window is the current bar plus Length prior bars, as the OpenCandle Aroon; on ties the most recent extreme is used.'],
  calculate({bars,num}){const n=num('length'),h=highs(bars),l=lows(bars),since=(values:readonly (number|null)[],i:number,pick:'max'|'min')=>{if(i<n)return null;let best=i;for(let j=i;j>=i-n;j--){const value=values[j];if(!finite(value))return null;if(pick==='max'?value>(values[best] as number):value<(values[best] as number))best=j;}return i-best;};
   return {oscillator:bars.map((_,i)=>{const up=since(h,i,'max'),down=since(l,i,'min');return up===null||down===null?null:zero((n-up)/n*100-(n-down)/n*100);})};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*2},
 {id:'techrating',name:'Technical ratings',acronym:'Ratings',overlay:false,
  inputs:[{key:'ratingsUse',title:'Rating is based on',type:'string',defval:'All',options:TECH_RATING_USES}],
  plots:[{id:'rating',label:'Rating',kind:'histogram',color:GREY,width:1},{id:'ma',label:'Moving averages rating',color:ORANGE,width:1,visible:false},{id:'osc',label:'Oscillators rating',color:PURPLE,width:1,visible:false}],
  guides:[{id:'upper',value:0.5,color:GREY},{id:'zero',value:0,color:GREY},{id:'lower',value:-0.5,color:GREY}],
  pointPalette:{plot:'rating',colors:TECH_RATING_COLORS,labels:TECH_RATING_LABELS,state:values=>values('rating').map(ratingBucket)},
  provenance:[{url:LV+'public-technical-ratings-method',facts:'Technical ratings: each of 15 moving averages (SMA and EMA 10, 20, 30, 50, 100, 200; VWMA 20; Hull 9; Ichimoku base line) and 11 oscillators (RSI 14, Stochastic 14 3 3, CCI 20, ADX 14, Awesome oscillator, Momentum 10, MACD 12 26 9, Stochastic RSI 3 3 14 14, Williams %R 14, Bull bear power, Ultimate oscillator 7 14 28) votes buy (+1), neutral (0) or sell (-1); a group rating is the mean of its votes and the summary is the mean of the two groups; strong buy from 0.5, buy from 0.1, mirrored for sell.'},{url:'indicator-list:strategies',facts:'The Strategies tab lists "Technical ratings strategy" (the OpenCandle strategy has its own simplified rating).'}],
  unknownDefaults:[UNKNOWN,UNKNOWN_NAME,'The per-indicator vote rules are OpenCandle-defined readings of the public method: the Ichimoku vote is the close against the base line only, ADX votes on the DI order while ADX is above 20 and rising, and the %K/%D votes need both lines past the level with K on the turning side. The five column colors and the 0.5 and -0.5 levels are OpenCandle-defined.'],
  policies:['The moving-average rating starts on bar 200 (the 200-bar averages) and the oscillator rating on bar 50. After that, a vote its indicator cannot give on a bar (a flat range, a zero divisor) counts as neutral. A missing close is unavailable. Rating is based on All = the mean of the two group ratings, or one group alone.'],
  calculate(ctx){const {ma,osc}=technicalRatings(ctx),use=ctx.str('ratingsUse');
   const rating=use==='Moving averages'?ma:use==='Oscillators'?osc:pair(ma,osc,(a,b)=>(a+b)/2);return {rating:rating.map(value=>value===null?null:zero(value)),ma,osc};},
  warmup:()=>TECH_RATING_READY.ma,work:count=>count*400},
];
export const R40_INDICATORS:readonly CatalogDefinition[]=definitions;
