import type {Bar,NumericSeries} from '../types';
import type {CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {rciAt} from './ind1028-catalog';

/**
 * More built-ins. Formulas follow the documented or textbook definitions cited per row; calculations are original LV
 * code. Colors are LV's own (LV_INDICATOR_PALETTE, LV_HISTOGRAM_COLORS and LV_GUIDE_COLOR in
 * src/chart/indicator-settings.ts, repeated here as literals because the chart module imports this one).
 * Defaults not stated by a cited page are our own choice and listed in `unknownDefaults`.
 */
export const INDGAPS_INDICATOR_IDS=['rciribbon','vol24h','machannel','stderror','mahamming','majority','volzt','typprice','avgprice','medprice'] as const;
export type IndGapsIndicatorId=typeof INDGAPS_INDICATOR_IDS[number];

/** LV palette entries (src/chart/indicator-settings.ts). */
export const INDGAPS_COLORS=Object.freeze({cyan:'#4fc3d9',amber:'#f5b14c',violet:'#b48cf2',coral:'#f07a7a',green:'#7fd17a',blue:'#6e9cf2',pink:'#e88ad8',teal:'#4fbfa3',up:'#3fbf8f',guide:'#8a92a6'});
const C=INDGAPS_COLORS;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const SHIFT={type:'int' as const,min:0,max:500,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
/** Public study input defaults. */
const CL='public-indicator-definition:study-input-defaults';
/** Public list of built-in names. */
const LIST='public-indicator-definition:builtin-indicators-list';
/** Public help-article definitions, cited by article id. */
const HELP='public-indicator-definition:';
const COLORS_LV='Plot, histogram and level colors are OpenCandle\'s own palette (OpenCandle-defined), not the reference colors.';

const price=(bars:readonly Bar[],f:(bar:Bar)=>number,fields:readonly (keyof Bar)[]):NumericSeries=>bars.map(bar=>fields.every(field=>finite(bar[field]))?zero(f(bar)):null);
/** The value `shift` bars earlier (a forward display shift that only reads the past). */
const shifted=(values:NumericSeries,shift:number):NumericSeries=>shift?values.map((_,i)=>i>=shift?values[i-shift]:null):values;

/** Standard error of the least-squares line of the full window ending at index: sqrt(sum of squared residuals / (n - 2)). */
export function standardErrorAt(values:readonly (number|null)[],index:number,n:number):number|null{
 if(n<3||index<n-1)return null;let sy=0,sxy=0;const sx=n*(n-1)/2,sxx=(n-1)*n*(2*n-1)/6;
 for(let k=0;k<n;k++){const y=values[index-n+1+k];if(!finite(y))return null;sy+=y;sxy+=k*y;}
 const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx),intercept=(sy-slope*sx)/n;let ss=0;
 for(let k=0;k<n;k++){const residual=(values[index-n+1+k] as number)-(intercept+slope*k);ss+=residual*residual;}
 const out=Math.sqrt(ss/(n-2));return Number.isFinite(out)?zero(out):null;
}
/** Hamming window weights 0.54 - 0.46 cos(2 pi k / (n - 1)), k = 0..n-1 (one bar weighs 1). */
export function hammingWeights(n:number):number[]{return n<=1?[1]:Array.from({length:n},(_,k)=>0.54-0.46*Math.cos(2*Math.PI*k/(n-1)));}
/** Sum of the volume of the bars opened within the 24 hours up to and including each bar (bar open times, seconds). */
export function rolling24hVolume(bars:readonly Bar[]):NumericSeries{
 let start=0,sum=0,missing=0;const out:NumericSeries=[];
 for(let i=0;i<bars.length;i++){
  const volume=bars[i].volume;if(finite(volume))sum+=volume;else missing++;
  while(start<i&&bars[start].time<=bars[i].time-86400){const old=bars[start].volume;if(finite(old))sum-=old;else missing--;start++;}
  out.push(missing?null:zero(sum));
 }
 return out;
}

const definitions:readonly CatalogDefinition[]=[
 {id:'rciribbon',name:'RCI ribbon',acronym:'RCI Ribbon',overlay:false,sourceSeries:true,
  inputs:[SOURCE,{key:'shortLength',title:'Short RCI length',defval:10,type:'int',min:2,max:1000,step:1},{key:'middleLength',title:'Middle RCI length',defval:30,type:'int',min:2,max:1000,step:1},{key:'longLength',title:'Long RCI length',defval:50,type:'int',min:2,max:1000,step:1}],
  plots:[{id:'short',label:'Short RCI',color:C.coral,width:1},{id:'middle',label:'Middle RCI',color:C.green,width:1},{id:'long',label:'Long RCI',color:C.blue,width:1}],
  guides:[{id:'upper',value:80,color:C.guide},{id:'lower',value:-80,color:C.guide}],band:'guides',fill:{color:C.cyan,opacity:5},
  provenance:[{url:HELP+'rank-correlation-index-rci',facts:'RCI = 100 x the correlation between the tie-averaged price ranks and the bar indices; range -100..100; levels -80 and +80.'},{url:LIST,facts:'"RCI Ribbon" (three RCIs of different lengths) is a built-in.'}],
  unknownDefaults:['Short 10, middle 30 and long 50 are the commonly published RCI ribbon lengths; the cited pages state no defaults (OpenCandle-defined). The band fill between 80 and -80 is OpenCandle-defined.',COLORS_LV],
  policies:['Each line is the OpenCandle Rank correlation index of the Source over its length (the same calculation). A flat window is unavailable.'],
  calculate({source,num}){const line=(key:string)=>{const n=num(key);return source.map((_,i)=>rciAt(source,i,n));};return {short:line('shortLength'),middle:line('middleLength'),long:line('longLength')};},
  warmup:value=>Math.max(value('shortLength'),value('middleLength'),value('longLength')),work:(count,value)=>count*(value('shortLength')+value('middleLength')+value('longLength'))*12},
 {id:'vol24h',name:'24-hour volume',acronym:'24h Vol',overlay:false,requiresVolume:true,
  inputs:[],
  plots:[{id:'volume',label:'24-hour volume',kind:'histogram',color:C.teal,width:1}],
  provenance:[{url:LIST,facts:'"24-hour Volume" is a built-in: the volume traded over the trailing 24 hours.'}],
  unknownDefaults:['The window is the bars opened within the 24 hours up to and including each bar (OpenCandle-defined). On daily and longer bars that is the bar\'s own volume. Drawn as a histogram in its own pane (OpenCandle-defined).',COLORS_LV],
  policies:['A bar whose 24-hour window holds a missing volume is unavailable. Only the current and earlier bars are read, so the value never changes once a bar closes.'],
  calculate({bars}){return {volume:rolling24hVolume(bars)};},
  warmup:()=>1,work:count=>count*4},
 {id:'machannel',name:'Moving average channel',acronym:'MAC',overlay:true,
  inputs:[{key:'upperLength',title:'Upper length',defval:20,...LENGTH},{key:'lowerLength',title:'Lower length',defval:20,...LENGTH},{key:'upperShift',title:'Upper offset',defval:0,...SHIFT},{key:'lowerShift',title:'Lower offset',defval:0,...SHIFT}],
  plots:[{id:'upper',label:'Upper',color:C.cyan,width:1},{id:'lower',label:'Lower',color:C.amber,width:1}],band:'plots',fill:{color:C.cyan,opacity:5},
  provenance:[{url:CL,facts:'moving average channel: upper band length 20, lower band length 20, upper band shift 0, lower band shift 0; two plots and a background between them.'},{url:LIST,facts:'"Moving Average Channel" is in the built-in list.'},{url:'lv-defined:moving-average-channel-textbook',facts:'Upper = SMA(high, upper length); lower = SMA(low, lower length); each shifted forward by its offset.'}],
  unknownDefaults:['The reference implementation was not read; the formula is the textbook one. Offsets are limited to 0..500 bars forward (OpenCandle-defined; a backward shift would read the future).',COLORS_LV],
  policies:['A missing high or low in the window is unavailable.'],
  calculate({bars,tk,num}){const h=price(bars,bar=>bar.high,['high']),l=price(bars,bar=>bar.low,['low']);return {upper:shifted(tk.sma(h,num('upperLength')),num('upperShift')),lower:shifted(tk.sma(l,num('lowerLength')),num('lowerShift'))};},
  warmup:value=>Math.max(value('upperLength')+value('upperShift'),value('lowerLength')+value('lowerShift')),work:count=>count*8},
 {id:'stderror',name:'Standard error',acronym:'Standard error',overlay:false,sourceSeries:true,
  inputs:[{key:'length',title:'Length',defval:14,type:'int',min:3,max:5000,step:1},SOURCE],
  plots:[{id:'stderror',label:'Standard error',color:C.violet,width:1}],
  provenance:[{url:CL,facts:'standard error.length: default 14; one line plot.'},{url:LIST,facts:'"Standard Error" is in the built-in list.'},{url:'lv-defined:regression-standard-error',facts:'Standard error of the estimate: sqrt(sum((y - yhat)^2) / (n - 2)) around the least-squares line of the last n values against the bar index.'}],
  unknownDefaults:['Source close and the minimum length 3 are OpenCandle-defined (a line through two points has no residual).',COLORS_LV],
  policies:['A missing value in the window is unavailable.'],
  calculate({source,num}){const n=num('length');return {stderror:source.map((_,i)=>standardErrorAt(source,i,n))};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*4},
 {id:'mahamming',name:'Moving average Hamming',acronym:'MA Hamming',overlay:true,sourceSeries:true,
  inputs:[{key:'length',title:'Length',defval:10,...LENGTH},SOURCE],
  plots:[{id:'ma',label:'MA Hamming',color:C.pink,width:1}],
  provenance:[{url:CL,facts:'moving average hamming.length: default 10; one line plot.'},{url:LIST,facts:'"Moving Average Hamming" is in the built-in list.'},{url:'lv-defined:hamming-window',facts:'Hamming window: w(k) = 0.54 - 0.46 cos(2 pi k / (N - 1)); the moving average is the window-weighted mean sum(w x price) / sum(w).'}],
  unknownDefaults:['The reference implementation was not read; the weights are the textbook Hamming window. Source close is OpenCandle-defined.',COLORS_LV],
  policies:['The window is symmetric, so the oldest and the newest bar weigh the same (0.08). A missing value in the window is unavailable.'],
  calculate({source,num}){const n=num('length'),w=hammingWeights(n),total=w.reduce((a,b)=>a+b,0);
   return {ma:source.map((_,i)=>{if(i<n-1)return null;let sum=0;for(let k=0;k<n;k++){const value=source[i-n+1+k];if(!finite(value))return null;sum+=w[k]*value;}return zero(sum/total);})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*2},
 {id:'majority',name:'Majority rule',acronym:'MR',overlay:false,
  inputs:[{key:'length',title:'Rolling period',defval:14,...LENGTH}],
  plots:[{id:'majority',label:'Majority rule',color:C.cyan,width:1}],guides:[{id:'zero',value:50,color:C.guide}],
  provenance:[{url:CL,facts:'majority rule.rolling period: default 14; one line plot.'},{url:LIST,facts:'"Majority Rule" is in the built-in list.'},{url:'lv-defined:majority-rule-textbook',facts:'Majority rule: the percentage of the bars in the rolling period that closed above the prior close.'}],
  unknownDefaults:['The reference implementation was not read; the formula is the textbook one. The 50 line is OpenCandle-defined.',COLORS_LV],
  policies:['An unchanged close is not an up bar. The first bar has no prior close; a missing close in the window is unavailable.'],
  calculate({bars,num}){const n=num('length'),up=bars.map((bar,i)=>{const prior=bars[i-1]?.close;return i&&finite(bar.close)&&finite(prior)?bar.close>prior?1:0:null;});
   return {majority:up.map((_,i)=>{if(i<n)return null;let s=0;for(let k=i-n+1;k<=i;k++){const value=up[k];if(value===null)return null;s+=value;}return zero(100*s/n);})};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')},
 {id:'volzt',name:'Volatility zero trend close-to-close',acronym:'VZT',overlay:false,
  inputs:[{key:'length',title:'Length',defval:10,...LENGTH},{key:'annual',title:'Annual',defval:252,type:'int',min:1,max:1000000,step:1}],
  plots:[{id:'volatility',label:'Volatility',color:C.amber,width:1}],
  provenance:[{url:CL,facts:'volatility zero trend close-to-close: length 10, annual 252; one line plot.'},{url:LIST,facts:'"Volatility Zero Trend Close-to-Close" is in the built-in list.'},{url:'lv-defined:zero-mean-close-to-close-volatility',facts:'Zero-trend (zero-mean) close-to-close volatility: 100 x sqrt(mean of ln(close / prior close)^2 over n bars) x sqrt(annual periods); the mean return is taken as 0.'}],
  unknownDefaults:['The reference implementation was not read; the formula is the textbook zero-mean estimator.',COLORS_LV],
  policies:['A missing or nonpositive close makes its return unavailable, and any window holding one is unavailable. Historical volatility (sample deviation around the mean return) stays its own kind.'],
  calculate({bars,num}){const n=num('length'),factor=Math.sqrt(num('annual')),r=bars.map((bar,i)=>{const prior=bars[i-1]?.close;return i&&finite(bar.close)&&finite(prior)&&bar.close>0&&prior>0?Math.log(bar.close/prior):null;});
   return {volatility:r.map((_,i)=>{if(i<n)return null;let ss=0;for(let k=i-n+1;k<=i;k++){const value=r[k];if(value===null)return null;ss+=value*value;}return zero(100*Math.sqrt(ss/n)*factor);})};},
  warmup:value=>value('length')+1,work:(count,value)=>count*value('length')},
 {id:'typprice',name:'Typical price',acronym:'Typical price',overlay:true,inputs:[],
  plots:[{id:'price',label:'Typical price',color:C.violet,width:1}],
  provenance:[{url:LIST,facts:'"Typical Price" is in the built-in list.'},{url:'lv-defined:typical-price',facts:'Typical price = (high + low + close) / 3.'}],
  unknownDefaults:['No inputs are recorded for the reference (OpenCandle-defined).',COLORS_LV],policies:['A missing price makes the bar unavailable.'],
  calculate({bars}){return {price:price(bars,bar=>(bar.high+bar.low+bar.close)/3,['high','low','close'])};},warmup:()=>1,work:count=>count*2},
 {id:'avgprice',name:'Average price',acronym:'Average price',overlay:true,inputs:[],
  plots:[{id:'price',label:'Average price',color:C.cyan,width:1}],
  provenance:[{url:LIST,facts:'"Average Price" is in the built-in list.'},{url:'lv-defined:average-price',facts:'Average price = (open + high + low + close) / 4.'}],
  unknownDefaults:['No inputs are recorded for the reference (OpenCandle-defined).',COLORS_LV],policies:['A missing price makes the bar unavailable.'],
  calculate({bars}){return {price:price(bars,bar=>(bar.open+bar.high+bar.low+bar.close)/4,['open','high','low','close'])};},warmup:()=>1,work:count=>count*2},
 {id:'medprice',name:'Median price',acronym:'Median price',overlay:true,inputs:[],
  plots:[{id:'price',label:'Median price',color:C.amber,width:1}],
  provenance:[{url:LIST,facts:'"Median Price" is in the built-in list.'},{url:'lv-defined:median-price',facts:'Median price = (high + low) / 2.'}],
  unknownDefaults:['No inputs are recorded for the reference (OpenCandle-defined). The rolling Median indicator stays its own kind.',COLORS_LV],policies:['A missing price makes the bar unavailable.'],
  calculate({bars}){return {price:price(bars,bar=>(bar.high+bar.low)/2,['high','low'])};},warmup:()=>1,work:count=>count*2},
];
export const INDGAPS_INDICATORS:readonly CatalogDefinition[]=definitions;
