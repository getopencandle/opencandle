import type {Bar,NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {intervalBucketRange} from '../intervals';
import {SECOND_SYMBOL_INPUT,pearson,secondCloses} from './r28-catalog';
import type {PatternBox,PatternLine} from './patterns-catalog';

/**
 * More built-ins that bars (and the second symbol) can supply. Formulas are the published or textbook ones cited per
 * row, everything else is our own choice and listed in `unknownDefaults`. Colors are LV's own palette
 * (src/chart/indicator-settings.ts).
 */
export const INDGAPS3_INDICATOR_IDS=['volcc','volohlc','volindex','mamultiple','emacross','smiergodicosc','ratio','correlationlog','mtfcandles','performance'] as const;
export type IndGaps3IndicatorId=typeof INDGAPS3_INDICATOR_IDS[number];

/** LV palette entries (src/chart/indicator-settings.ts LV_INDICATOR_PALETTE / LV_HISTOGRAM_COLORS / LV_GUIDE_COLOR). */
const C=Object.freeze({cyan:'#4fc3d9',amber:'#f5b14c',violet:'#b48cf2',coral:'#f07a7a',green:'#7fd17a',blue:'#6e9cf2',pink:'#e88ad8',sand:'#d9cf6a',teal:'#4fbfa3',tan:'#c9a27e',up:'#3fbf8f',down:'#e8605a',guide:'#8a92a6'});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const LENGTH_2={type:'int' as const,min:2,max:5000,step:1};
const ANNUAL:CatalogInput={key:'annual',title:'Annual',defval:252,type:'int',min:1,max:1000000,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const CL='public-indicator-definition:study-input-defaults';
const LIST='public-indicator-definition:builtin-indicators-list';
const TV_LIST='public-indicator-definition:indicators-list';
const LV='lv-defined:';
const COLORS_LV='Plot, marker, box and level colors are OpenCandle\'s own palette (OpenCandle-defined), not the reference colors.';
const SECOND_POLICY='The second symbol loads at the chart interval through the chart loaders (the shared second-symbol loaders) and aligns on exact bar times; a bar with no second-symbol bar is unavailable, nothing is carried forward.';
const nulls=(n:number):NumericSeries=>new Array(n).fill(null);
const logReturns=(values:readonly (number|null)[]):NumericSeries=>values.map((value,i)=>{const prior=values[i-1];return i&&finite(value)&&finite(prior)&&value>0&&prior>0?zero(Math.log(value/prior)):null;});

// ---- Volatility estimators ----
/** Close-to-close: 100 x sample standard deviation (n - 1) of ln(close / prior close) over n bars x sqrt(annual). */
export function closeToCloseVolatility(bars:readonly Bar[],n:number,annual:number):NumericSeries{
 const r=logReturns(bars.map(bar=>bar.close)),factor=Math.sqrt(annual);
 return r.map((_,i)=>{if(i<n||n<2)return null;let s=0;for(let k=i-n+1;k<=i;k++){const v=r[k];if(v===null)return null;s+=v;}const mean=s/n;let ss=0;for(let k=i-n+1;k<=i;k++){const d=(r[k] as number)-mean;ss+=d*d;}return zero(100*Math.sqrt(ss/(n-1))*factor);});
}
/** Garman-Klass (1980): per bar 0.5 ln(H/L)^2 - (2 ln 2 - 1) ln(C/O)^2; volatility = 100 x sqrt(mean over n x annual). */
export function garmanKlassVolatility(bars:readonly Bar[],n:number,annual:number):NumericSeries{
 const k=2*Math.LN2-1,u=bars.map(bar=>[bar.open,bar.high,bar.low,bar.close].every(value=>finite(value)&&value>0)?0.5*Math.log(bar.high/bar.low)**2-k*Math.log(bar.close/bar.open)**2:null);
 return u.map((_,i)=>{if(i<n-1)return null;let s=0;for(let j=i-n+1;j<=i;j++){const v=u[j];if(v===null)return null;s+=v;}const variance=s/n;return variance<0?null:zero(100*Math.sqrt(variance*annual));});
}
/** Williams VIX Fix: 100 x (highest close over n - low) / highest close over n. */
export function vixFix(bars:readonly Bar[],n:number):NumericSeries{
 return bars.map((bar,i)=>{if(i<n-1||!finite(bar.low))return null;let hi=-Infinity;for(let k=i-n+1;k<=i;k++){const c=bars[k].close;if(!finite(c))return null;hi=Math.max(hi,c);}return hi>0?zero(100*(hi-bar.low)/hi):null;});
}

// ---- Moving averages ----
export const MULTIPLE_MA_TYPES=['SMA','EMA','WMA','RMA'] as const;
const MA_COUNT=6,MA_LENGTHS=[5,10,20,50,100,200],MA_COLORS=[C.cyan,C.amber,C.violet,C.coral,C.green,C.blue];
function average(tk:CatalogContext['tk'],type:string,values:readonly (number|null)[],n:number):NumericSeries{return type==='EMA'?tk.ema(values,n):type==='WMA'?tk.wma(values,n):type==='RMA'?tk.rma(values,n):tk.sma(values,n);}
/** Up cross: short - long turns above 0 (previous at or below 0); down cross: turns below 0 (previous at or above 0). The
 *  value is the short average on that bar (where the marker sits), else unavailable. */
export function emaCrosses(short:readonly (number|null)[],long:readonly (number|null)[]):{up:NumericSeries;down:NumericSeries}{
 const up=nulls(short.length),down=nulls(short.length);
 for(let i=1;i<short.length;i++){const a=short[i],b=long[i],pa=short[i-1],pb=long[i-1];if(!finite(a)||!finite(b)||!finite(pa)||!finite(pb))continue;const d=a-b,prior=pa-pb;if(d>0&&prior<=0)up[i]=a;else if(d<0&&prior>=0)down[i]=a;}
 return {up,down};
}
/** Blau's SMI ergodic: TSI(long, short) = 100 x EMA(EMA(change, long), short) / EMA(EMA(|change|, long), short); signal = EMA(SMI, signal). */
function smiErgodic(tk:CatalogContext['tk'],values:readonly (number|null)[],long:number,short:number,signal:number):{smi:NumericSeries;signal:NumericSeries}{
 const change=values.map((value,i)=>{const prior=values[i-1];return i&&finite(value)&&finite(prior)?value-prior:null;});
 const num=tk.ema(tk.ema(change,long),short),den=tk.ema(tk.ema(change.map(value=>value===null?null:Math.abs(value)),long),short);
 const smi=num.map((a,i)=>{const b=den[i];return finite(a)&&finite(b)&&b!==0?zero(100*a/b):null;});
 return {smi,signal:tk.ema(smi,signal)};
}

// ---- Multi-time period charts ----
export const MTF_INTERVALS=['15m','30m','60m','240m','1D','1W','1M'] as const;
export interface HigherBar {start:number;first:number;last:number;open:number;high:number;low:number;close:number}
/** Groups the chart bars into UTC-policy buckets of `target` (intervalBucketRange, the chart's local aggregation). Each bar
 *  sees its bucket's OHLC so far: the newest higher bar is still developing and never reads a later bar. */
export function higherBars(bars:readonly Bar[],target:string):{rows:HigherBar[];at:(HigherBar|null)[]}{
 const rows:HigherBar[]=[],at:(HigherBar|null)[]=[];let current:HigherBar|null=null,broken=false;
 for(let i=0;i<bars.length;i++){
  const bar=bars[i];if(!finite(bar.time)){at.push(null);continue;}
  const start=intervalBucketRange(bar.time,target).start;
  if(!current||current.start!==start){current={start,first:i,last:i,open:NaN,high:-Infinity,low:Infinity,close:NaN};rows.push(current);broken=false;}
  const ok=[bar.open,bar.high,bar.low,bar.close].every(finite);
  if(!ok)broken=true;else if(!broken){if(!finite(current.open))current.open=bar.open;current.high=Math.max(current.high,bar.high);current.low=Math.min(current.low,bar.low);current.close=bar.close;}
  current.last=i;at.push(broken||!finite(current.open)?null:{...current});
 }
 return {rows,at};
}
function mtfCandles(ctx:CatalogContext):Record<string,NumericSeries>{
 const {bars}=ctx,target=ctx.str('interval'),found=higherBars(bars,target),n=bars.length;
 const out={up:nulls(n),down:nulls(n),open:nulls(n),high:nulls(n),low:nulls(n),close:nulls(n)};
 found.at.forEach((row,i)=>{if(!row)return;const rising=row.close>=row.open;out.up[i]=rising?1:0;out.down[i]=rising?0:1;out.open[i]=zero(row.open);out.high[i]=zero(row.high);out.low[i]=zero(row.low);out.close[i]=zero(row.close);});
 const shown=found.rows.map(row=>found.at[row.last]).filter((row):row is HigherBar=>!!row).slice(-ctx.num('maxCandles'));
 const boxes:PatternBox[]=[],lines:PatternLine[]=[];
 for(const row of shown){const plot=row.close>=row.open?'up':'down',mid=Math.floor((row.first+row.last)/2);
  boxes.push({plot,from:{index:row.first,price:Math.max(row.open,row.close)},to:{index:row.last,price:Math.min(row.open,row.close)}});
  lines.push({plot,from:{index:mid,price:row.high},to:{index:mid,price:row.low}});}
 ctx.marks?.({markers:[],lines,boxes});
 return out;
}

// ---- Performance ----
export const PERFORMANCE_PERIODS=[{id:'w1',label:'1W'},{id:'m1',label:'1M'},{id:'m3',label:'3M'},{id:'m6',label:'6M'},{id:'ytd',label:'YTD'},{id:'y1',label:'1Y'}] as const;
/** The UTC instant `months` calendar months before `time`, the day clamped to the target month's length (31 Mar - 1M = 28/29 Feb). */
export function monthsBefore(time:number,months:number):number{
 const d=new Date(time*1000),y=d.getUTCFullYear(),m=d.getUTCMonth()-months,ty=y+Math.floor(m/12),tm=((m%12)+12)%12;
 const days=new Date(Date.UTC(ty,tm+1,0)).getUTCDate();
 return Date.UTC(ty,tm,Math.min(d.getUTCDate(),days),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds())/1000;
}
/** Close of the newest bar at or before `limit` (strictly before when `strict`) among bars[0..upto]; null if none or missing. */
function closeAtOrBefore(bars:readonly Bar[],upto:number,limit:number,strict:boolean):number|null{
 let lo=0,hi=upto,found=-1;
 while(lo<=hi){const mid=(lo+hi)>>1,t=bars[mid].time;if(strict?t<limit:t<=limit){found=mid;lo=mid+1;}else hi=mid-1;}
 const c=found>=0?bars[found].close:null;return finite(c)&&c!==0?c:null;
}
export function performanceReturns(bars:readonly Bar[]):Record<string,NumericSeries>{
 const out:Record<string,NumericSeries>=Object.fromEntries(PERFORMANCE_PERIODS.map(row=>[row.id,nulls(bars.length)]));
 bars.forEach((bar,i)=>{
  if(!finite(bar.close)||!finite(bar.time))return;const t=bar.time;
  const refs:Record<string,number|null>={w1:closeAtOrBefore(bars,i,t-7*86400,false),m1:closeAtOrBefore(bars,i,monthsBefore(t,1),false),m3:closeAtOrBefore(bars,i,monthsBefore(t,3),false),m6:closeAtOrBefore(bars,i,monthsBefore(t,6),false),
   ytd:closeAtOrBefore(bars,i,Date.UTC(new Date(t*1000).getUTCFullYear(),0,1)/1000,true),y1:closeAtOrBefore(bars,i,monthsBefore(t,12),false)};
  for(const id of Object.keys(refs)){const ref=refs[id];if(ref!==null)out[id][i]=zero(100*(bar.close/ref-1));}
 });
 return out;
}

const definitions:readonly CatalogDefinition[]=[
 {id:'volcc',name:'Volatility close-to-close',acronym:'VCC',overlay:false,
  inputs:[{key:'length',title:'Length',defval:10,...LENGTH_2},ANNUAL],
  plots:[{id:'volatility',label:'Volatility',color:C.cyan,width:1}],
  provenance:[{url:CL,facts:'volatility close-to-close: length 10, annual 252; one line plot.'},{url:LIST,facts:'"Volatility Close-to-Close" is in the built-in list.'},{url:LV+'close-to-close-volatility-estimator',facts:'Classic close-to-close estimator: 100 x sample standard deviation (n - 1) of ln(close / prior close) over n bars x sqrt(annual periods).'}],
  unknownDefaults:['The reference implementation was not read; the estimator is the textbook one (OpenCandle-defined). With the same inputs it equals OpenCandle Historical volatility.',COLORS_LV],
  policies:['A missing or nonpositive close makes its return unavailable, and any window holding one is unavailable. Only the current and earlier bars are read.'],
  calculate({bars,num}){return {volatility:closeToCloseVolatility(bars,num('length'),num('annual'))};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')*2},
 {id:'volohlc',name:'Volatility O-H-L-C',acronym:'VOHLC',overlay:false,
  inputs:[{key:'length',title:'Length',defval:10,...LENGTH},ANNUAL],
  plots:[{id:'volatility',label:'Volatility',color:C.amber,width:1}],
  provenance:[{url:CL,facts:'volatility o-h-l-c: length 10, annual 252; one line plot.'},{url:LIST,facts:'"Volatility O-H-L-C" is in the built-in list.'},{url:LV+'garman-klass-1980',facts:'Garman and Klass (1980), J. Business 53(1): per bar 0.5 ln(H/L)^2 - (2 ln 2 - 1) ln(C/O)^2; volatility = 100 x sqrt(mean over n bars x annual periods).'}],
  unknownDefaults:['OpenCandle-defined: the estimator is Garman-Klass (the reference estimator is not documented). Yang-Zhang was not chosen because it needs the prior close and a k weight the reference does not state.',COLORS_LV],
  policies:['A missing or nonpositive open, high, low or close makes the bar unavailable, and any window holding one is unavailable. Overnight gaps are not counted (Garman-Klass reads each bar alone).'],
  calculate({bars,num}){return {volatility:garmanKlassVolatility(bars,num('length'),num('annual'))};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')},
 {id:'volindex',name:'Volatility index',acronym:'VolIdx',overlay:false,
  inputs:[{key:'length',title:'Length',defval:22,...LENGTH}],
  plots:[{id:'index',label:'Volatility index',color:C.violet,width:1}],
  provenance:[{url:TV_LIST,facts:'"Volatility Index" is in the built-in list.'},{url:LV+'williams-vix-fix-2007',facts:'Larry Williams, "The VIX Fix" (Active Trader, Dec 2007): 100 x (highest close over 22 bars - low) / highest close over 22 bars, a bars-only proxy that tracks the VIX.'}],
  unknownDefaults:['OpenCandle-defined: a VIX-style proxy from bars only (Williams VIX Fix, length 22); no options data is read, so it is not the CBOE VIX.',COLORS_LV],
  policies:['A missing close in the window or a missing low is unavailable. Only the current and earlier bars are read.'],
  calculate({bars,num}){return {index:vixFix(bars,num('length'))};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')},
 {id:'mamultiple',name:'Moving average multiple',acronym:'MA Multiple',overlay:true,sourceSeries:true,
  inputs:[{key:'maType',title:'MA type',type:'string',defval:'SMA',options:MULTIPLE_MA_TYPES},...MA_LENGTHS.map((length,k)=>({key:'length'+(k+1),title:`MA ${k+1} length`,defval:length,...LENGTH})),SOURCE],
  plots:MA_LENGTHS.map((_,k)=>({id:'ma'+(k+1),label:'MA '+(k+1),color:MA_COLORS[k],width:1})),
  provenance:[{url:TV_LIST,facts:'"Moving Average Multiple" is in the built-in list: several moving averages of one source on the chart.'},{url:LV+'textbook-moving-averages',facts:'SMA, EMA, WMA and RMA (Wilder) of the Source over each length.'}],
  unknownDefaults:['OpenCandle-defined: six averages, lengths 5/10/20/50/100/200, type SMA. Hide an average from its Style row.',COLORS_LV],
  policies:['EMA uses the SMA seed (StockCharts, TA-Lib); RMA is the OpenCandle SMMA. Each average is unavailable until its window fills.'],
  calculate({source,tk,num,str}){const type=str('maType');return Object.fromEntries(Array.from({length:MA_COUNT},(_,k)=>['ma'+(k+1),average(tk,type,source,num('length'+(k+1)))]));},
  warmup:value=>Math.max(...MA_LENGTHS.map((_,k)=>value('length'+(k+1)))),work:count=>count*MA_COUNT*8},
 {id:'emacross',name:'EMA cross',acronym:'EMA Cross',overlay:true,sourceSeries:true,
  inputs:[{key:'shortLength',title:'Short',defval:9,...LENGTH},{key:'longLength',title:'Long',defval:26,...LENGTH},SOURCE],
  plots:[{id:'short',label:'Short EMA',color:C.amber,width:1},{id:'long',label:'Long EMA',color:C.blue,width:1},{id:'crossUp',label:'Cross up',kind:'cross',color:C.up,width:4},{id:'crossDown',label:'Cross down',kind:'cross',color:C.down,width:4}],
  provenance:[{url:CL,facts:'ema cross: short 9, long 26; two lines and a crossing plot.'},{url:LIST,facts:'"EMA Cross" is in the built-in list.'},{url:LV+'textbook-moving-average-crossover',facts:'A short EMA crossing above (below) a long EMA marks a rising (falling) trend change.'}],
  unknownDefaults:['OpenCandle-defined: separate up and down cross markers on the short EMA (cross plots, like MA Cross). The IND-GAPS2 pattern marks were not used because a pattern kind hides its line plots.',COLORS_LV],
  policies:['A cross is a bar where short - long turns above 0 from 0 or below (up) or below 0 from 0 or above (down). A missing average on the bar or the bar before gives no marker, so the first possible cross is one bar after both EMAs are seeded. EMAs use the SMA seed (StockCharts, TA-Lib).'],
  // Both EMAs take the SMA seed (tk.ema, the EMA indicator's seed), so neither line exists before its Length - 1 bar and a
  // cross can only be marked once both lines were defined on the bar before (no false cross from a shared first value).
  calculate({source,tk,num}){const short=tk.ema(source,num('shortLength')),long=tk.ema(source,num('longLength')),cross=emaCrosses(short,long);return {short,long,crossUp:cross.up,crossDown:cross.down};},
  warmup:value=>Math.max(value('shortLength'),value('longLength'))+1,work:count=>count*8},
 {id:'smiergodicosc',name:'SMI ergodic oscillator',acronym:'SMIO',overlay:false,sourceSeries:true,
  inputs:[{key:'longLength',title:'Long length',defval:20,...LENGTH},{key:'shortLength',title:'Short length',defval:5,...LENGTH},{key:'signalLength',title:'Signal line length',defval:5,...LENGTH},SOURCE],
  plots:[{id:'oscillator',label:'Oscillator',kind:'histogram',color:C.teal,width:1}],guides:[{id:'zero',value:0,color:C.guide}],histogramPalette:true,histogramColors:{growing:C.up,falling:C.down},
  provenance:[{url:LIST,facts:'"SMI Ergodic Oscillator" is listed separately from "SMI Ergodic Indicator".'},{url:LV+'blau-momentum-direction-divergence-1995',facts:'William Blau: SMI = TSI(20, 5); signal = EMA(SMI, 5); oscillator = SMI - signal.'}],
  unknownDefaults:['Lengths 20/5/5 are the author defaults; the histogram style is OpenCandle-defined. The combined SMI ergodic indicator/oscillator kind stays as it is.',COLORS_LV],
  policies:['Momentum is the 1-bar change; the long EMA is applied first. EMAs use the SMA seed (StockCharts, TA-Lib). A zero denominator is unavailable.'],
  calculate({source,tk,num}){const {smi,signal}=smiErgodic(tk,source,num('longLength'),num('shortLength'),num('signalLength'));return {oscillator:smi.map((a,i)=>{const b=signal[i];return finite(a)&&finite(b)?zero(a-b):null;})};},
  warmup:value=>value('longLength')+value('shortLength')+value('signalLength')-1,work:count=>count*24},
 {id:'ratio',name:'Ratio',acronym:'Ratio',overlay:false,secondSymbol:true,sourceSeries:true,
  inputs:[SECOND_SYMBOL_INPUT,SOURCE],
  plots:[{id:'ratio',label:'Ratio',color:C.cyan,width:2}],
  provenance:[{url:TV_LIST,facts:'"Ratio" is in the built-in list: the chart symbol divided by a second symbol.'},{url:LV+'price-ratio',facts:'Ratio = chart Source / second symbol close, bar by bar.'}],
  unknownDefaults:['OpenCandle-defined: Symbol SPY and Source close (the second-symbol defaults); no rescaling.',COLORS_LV],
  policies:[SECOND_POLICY,'A second-symbol close of zero makes that bar unavailable. While the second symbol loads, or when it cannot open, the indicator says why and plots nothing.'],
  calculate(ctx){const other=secondCloses(ctx);return {ratio:ctx.source.map((x,i)=>{const y=other[i];return finite(x)&&finite(y)&&y!==0?zero(x/y):null;})};},
  warmup:()=>1,work:count=>count*4},
 {id:'correlationlog',name:'Correlation - Log',acronym:'CorrLog',overlay:false,secondSymbol:true,sourceSeries:true,
  inputs:[SECOND_SYMBOL_INPUT,SOURCE,{key:'length',title:'Length',defval:20,...LENGTH_2}],
  plots:[{id:'correlation',label:'Correlation',color:C.violet,width:2}],guides:[{id:'upper',value:1,color:C.guide},{id:'zero',value:0,color:C.guide},{id:'lower',value:-1,color:C.guide}],
  provenance:[{url:TV_LIST,facts:'"Correlation - Log" is in the built-in list.'},{url:LV+'pearson-of-log-returns',facts:'Pearson correlation over Length bars of the log returns ln(x / prior x) of the chart Source and of the second symbol close.'}],
  unknownDefaults:['OpenCandle-defined: Symbol SPY, Source close and Length 20 (the Correlation coefficient defaults).',COLORS_LV],
  policies:[SECOND_POLICY,'A missing or nonpositive value makes its return unavailable; a window with an unavailable return on either side, or a flat window, is unavailable.'],
  calculate(ctx){const a=logReturns(ctx.source),b=logReturns(secondCloses(ctx)),n=ctx.num('length');return {correlation:ctx.bars.map((_,i)=>pearson(a,b,i,n))};},
  warmup:value=>value('length')+1,work:(count,value)=>count*(2*value('length')+4)},
 {id:'mtfcandles',name:'Multi-time period charts',acronym:'MTPC',overlay:true,pattern:'chart',
  inputs:[{key:'interval',title:'Interval',type:'string',defval:'1D',options:MTF_INTERVALS},{key:'maxCandles',title:'Candles shown',defval:200,type:'int',min:1,max:2000,step:1}],
  plots:[{id:'up',label:'Up candle',color:C.up,width:1},{id:'down',label:'Down candle',color:C.down,width:1},{id:'open',label:'Open',color:C.cyan,width:1},{id:'high',label:'High',color:C.green,width:1},{id:'low',label:'Low',color:C.coral,width:1},{id:'close',label:'Close',color:C.amber,width:1}],
  provenance:[{url:TV_LIST,facts:'"Multi-Time Period Charts" is in the built-in list: higher-interval candles drawn over the chart.'},{url:LV+'interval-bucket-range',facts:'Buckets are the chart\'s local interval aggregation (intervalBucketRange, UTC calendar policy, weeks from Monday).'}],
  unknownDefaults:['OpenCandle-defined: interval 1D, the newest 200 candles, body boxes and a wick line in the Up candle / Down candle colors; UTC buckets (US equity session anchoring is not applied).',COLORS_LV],
  policies:['Each chart bar carries its higher bar\'s open, high, low and close so far: the newest higher candle is still developing and grows with each bar, and nothing reads a later bar. A missing price breaks the rest of that higher bar (unavailable). Up candle / Down candle are 1/0 by close at or above the open.'],
  calculate:mtfCandles,warmup:()=>1,work:count=>count*6},
 {id:'performance',name:'Performance',acronym:'Perf',overlay:false,
  inputs:[],
  plots:PERFORMANCE_PERIODS.map((row,k)=>({id:row.id,label:row.label,color:[C.cyan,C.amber,C.violet,C.coral,C.green,C.blue][k],width:1})),guides:[{id:'zero',value:0,color:C.guide}],valueSuffix:'%',precision:2,
  provenance:[{url:TV_LIST,facts:'"Performance" is in the built-in list: returns over 1W, 1M, 3M, 6M, YTD and 1Y.'},{url:LV+'simple-period-return',facts:'Return = 100 x (close / reference close - 1); the reference is the newest bar at or before the same instant one week or n calendar months earlier; YTD uses the newest bar before 1 January (UTC).'}],
  unknownDefaults:['OpenCandle-defined: one line per period in its own pane (the legend and data window read as the returns table, since catalog kinds have no table output); UTC calendar; month ends clamp (31 Mar - 1M = end of Feb).',COLORS_LV],
  policies:['A period whose reference instant is before the first loaded bar, or whose reference close is missing or zero, is unavailable. Only the current and earlier bars are read.'],
  calculate({bars}){return performanceReturns(bars);},
  warmup:()=>1,work:count=>count*30},
];
export const INDGAPS3_INDICATORS:readonly CatalogDefinition[]=definitions;
