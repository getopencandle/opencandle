import type {Bar,NumericSeries} from '../types';
import type {CatalogDefinition,CatalogInput} from '../indicator-catalog';

/**
 * Built-ins: MA Cross, Volatility stop and Chop zone. Formulas are the
 * standard published ones (original author or textbook), cited per row under the `:` prefix. Every
 * name, input title,
 * default, color and width is our own choice and listed in `unknownDefaults`. Calculations are original code.
 */
export const R29_INDICATOR_IDS=['macross','volstop','chopzone'] as const;
export type R29IndicatorId=typeof R29_INDICATOR_IDS[number];

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const LENGTH_2={type:'int' as const,min:2,max:5000,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const LV='lv-defined:';
const UNKNOWN='The name, input titles, defaults, colors and widths are OpenCandle-defined.';
const BLUE='#2962ff',ORANGE='#ff6d00',GREEN='#43a047',RED='#f23645',GREY='#787b86',YELLOW='#fdd835';

/** Highest/lowest of a full finite window ending at index; null when any value is missing. */
function extreme(values:readonly (number|null)[],index:number,window:number,pick:'max'|'min'):number|null{
 if(index<window-1)return null;let out=pick==='max'?-Infinity:Infinity;
 for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;out=pick==='max'?Math.max(out,value):Math.min(out,value);}return out;
}

/** MA Cross markers: an up cross where short - long turns above 0 (previous <= 0), a down cross where it turns below 0
 *  (previous >= 0). The marker sits on the short average. A missing value on either bar gives no marker. */
export function maCrossMarkers(short:readonly (number|null)[],long:readonly (number|null)[]):NumericSeries{
 return short.map((value,i)=>{
  if(!i)return null;const a=value,b=long[i],pa=short[i-1],pb=long[i-1];
  if(!finite(a)||!finite(b)||!finite(pa)||!finite(pb))return null;
  const d=a-b,prior=pa-pb;return d>0&&prior<=0||d<0&&prior>=0?a:null;
 });
}

/**
 * Volatility stop (Wilder's Volatility System, LV form). ATR is Wilder's RMA of the true range. In an uptrend the stop is
 * the highest source since the trend began minus Multiplier x ATR; in a downtrend it is the lowest source plus
 * Multiplier x ATR. A source beyond the previous bar's stop reverses the trend, and the extreme restarts at that source.
 * The first bar with an ATR starts an uptrend. A missing source or ATR is unavailable and keeps the state.
 */
// No ratchet: Wilder's Volatility System (1978) recomputes SAR = SIC -/+ ARC each bar, so the stop may loosen when ATR widens.
export function volatilityStop(source:readonly (number|null)[],atr:readonly (number|null)[],multiplier:number):{up:NumericSeries;down:NumericSeries}{
 const up:(number|null)[]=[],down:(number|null)[]=[];
 let started=false,rising=true,extremeValue=0,stop=0;
 for(let i=0;i<source.length;i++){
  const value=source[i],range=atr[i];
  if(!finite(value)||!finite(range)){up.push(null);down.push(null);continue;}
  if(!started){started=true;rising=true;extremeValue=value;}
  else if(rising&&value<stop){rising=false;extremeValue=value;}
  else if(!rising&&value>stop){rising=true;extremeValue=value;}
  else extremeValue=rising?Math.max(extremeValue,value):Math.min(extremeValue,value);
  stop=rising?extremeValue-multiplier*range:extremeValue+multiplier*range;
  if(!Number.isFinite(stop))throw new Error('The volatility stop arithmetic overflowed; the indicator is unavailable.');
  up.push(rising?zero(stop):null);down.push(rising?null:zero(stop));
 }
 return {up,down};
}

/** Chop zone palette, strongest rise first: index 4 is the flat zone. */
export const CHOP_ZONE_COLORS=Object.freeze(['#26c6da','#1b5e20','#81c784','#00e676',YELLOW,'#ffcc80','#ff9800','#f44336','#b71c1c']);
/** Style tab names of the nine buckets, in CHOP_ZONE_COLORS order (LV wording). */
export const CHOP_ZONE_LABELS=Object.freeze(['Rising, 4 and above','Rising, 2 to 4','Rising, 1 to 2','Rising, 0.5 to 1','Flat','Falling, -0.5 to -1','Falling, -1 to -2','Falling, -2 to -4','Falling, -4 and below']);
/** Bucket edges on the EMA slope (percent of the range per bar), descending; below the last edge is the last bucket. */
export const CHOP_ZONE_EDGES=Object.freeze([4,2,1,0.5,-0.5,-1,-2,-4]);
/** Bucket of one slope: 0 for slope >= 4, ..., 3 for >= 0.5, 4 for above -0.5 (flat), ..., 8 for -4 and below. */
export function chopZoneBucket(slope:number|null):number|null{
 if(!finite(slope))return null;
 for(let k=0;k<4;k++)if(slope>=CHOP_ZONE_EDGES[k])return k;
 for(let k=4;k<8;k++)if(slope>CHOP_ZONE_EDGES[k])return k;
 return 8;
}

const highs=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.high)?bar.high:null),lows=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.low)?bar.low:null);

const definitions:CatalogDefinition[]=[
 {id:'macross',name:'MA Cross',acronym:'MA Cross',overlay:true,sourceSeries:true,
  inputs:[{key:'shortLength',title:'Short length',defval:9,...LENGTH},{key:'longLength',title:'Long length',defval:21,...LENGTH},SOURCE],
  plots:[{id:'short',label:'Short MA',color:ORANGE,width:1},{id:'long',label:'Long MA',color:BLUE,width:1},{id:'cross',label:'Crossing',kind:'cross',color:GREY,width:4}],
  provenance:[{url:LV+'textbook-moving-average-crossover',facts:'Moving average crossover: a short simple moving average crossing above (below) a long one marks a rising (falling) trend change.'}],
  unknownDefaults:[UNKNOWN,'Lengths 9 and 21, simple averages and a cross marker on the short average are OpenCandle-defined.'],
  policies:['A crossing is a bar where short - long turns above 0 from 0 or below, or below 0 from 0 or above. A missing average on the bar or the bar before gives no marker.'],
  calculate({source,tk,num}){const short=tk.sma(source,num('shortLength')),long=tk.sma(source,num('longLength'));return {short,long,cross:maCrossMarkers(short,long)};},
  warmup:value=>Math.max(value('shortLength'),value('longLength'))+1,work:count=>count*8},
 {id:'volstop',name:'Volatility stop',acronym:'VStop',overlay:true,
  inputs:[{key:'length',title:'Length',defval:7,...LENGTH},SOURCE,{key:'multiplier',title:'Multiplier',type:'float',defval:3,min:0.1,max:100,step:0.1}],
  plots:[{id:'up',label:'Uptrend stop',kind:'cross',color:GREEN,width:1},{id:'down',label:'Downtrend stop',kind:'cross',color:RED,width:1}],
  provenance:[{url:LV+'wilder-new-concepts-1978-volatility-system',facts:'J. Welles Wilder, New Concepts in Technical Trading Systems (1978), Volatility System: stop and reverse = significant close -/+ ATR x constant, with ATR of 7 periods and a constant of 2.8 to 3.1.'}],
  unknownDefaults:[UNKNOWN,'Length 7 and Multiplier 3 are the author values. The source input, the two cross plots and the reversal on the previous bar\'s stop are OpenCandle-defined.'],
  policies:['ATR is Wilder\'s RMA of the true range. The stop follows the most extreme source of the current trend; a source beyond the previous bar\'s stop reverses the trend. The first bar with an ATR starts an uptrend. A missing value is unavailable and keeps the trend.'],
  calculate({bars,source,tk,num}){return volatilityStop(source,tk.rma(tk.trueRange(bars),num('length')),num('multiplier'));},
  warmup:value=>value('length')+1,work:count=>count*10},
 {id:'chopzone',name:'Chop zone',acronym:'Chop Zone',overlay:false,
  inputs:[{key:'emaLength',title:'EMA length',defval:34,...LENGTH},{key:'rangeLength',title:'Range length',defval:30,...LENGTH_2},SOURCE],
  plots:[{id:'zone',label:'Chop zone',kind:'histogram',color:YELLOW,width:1},{id:'slope',label:'EMA slope',color:GREY,width:1,visible:false}],
  pointPalette:{plot:'zone',colors:CHOP_ZONE_COLORS,labels:CHOP_ZONE_LABELS,state:values=>values('slope').map(chopZoneBucket)},
  provenance:[{url:LV+'textbook-ema-slope-zones',facts:'Chop zone: columns colored by the slope of an exponential moving average, normalized by the recent high-low range, from strongly rising through flat to strongly falling.'}],
  unknownDefaults:[UNKNOWN,'EMA 34 and range 30 are OpenCandle-defined. The slope unit (percent of the range per bar), the eight bucket edges 4, 2, 1, 0.5, -0.5, -1, -2, -4 and the nine colors are OpenCandle-defined and are not claimed to match any reference coloring.'],
  policies:['Slope = 100 x (EMA - previous EMA) / (highest high - lowest low over Range length). The column is 1 on every bar with a slope. A flat range or a missing value is unavailable. The EMA uses the SMA seed (StockCharts, TA-Lib).'],
  calculate({bars,source,tk,num}){const e=tk.ema(source,num('emaLength')),n=num('rangeLength'),h=highs(bars),l=lows(bars);
   const slope=bars.map((_,i)=>{if(!i)return null;const a=e[i],b=e[i-1],hi=extreme(h,i,n,'max'),lo=extreme(l,i,n,'min');if(!finite(a)||!finite(b)||hi===null||lo===null||hi===lo)return null;const value=100*(a-b)/(hi-lo);return Number.isFinite(value)?zero(value):null;});
   return {zone:slope.map(value=>value===null?null:1),slope};},
  warmup:value=>Math.max(value('emaLength'),value('rangeLength'))+1,work:(count,value)=>count*(value('rangeLength')*2+6)},
];
export const R29_INDICATORS:readonly CatalogDefinition[]=definitions;
