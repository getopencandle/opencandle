import type {Bar,NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';

/**
 * Built-ins: SMI, RCI, Trend strength, TWAP, ASI, AC and Chaikin volatility. Formulas follow the documented definitions
 * cited per row; calculations are original code. Colors are LV's own (LV_INDICATOR_PALETTE, LV_HISTOGRAM_COLORS and
 * LV_GUIDE_COLOR in src/chart/indicator-settings.ts, repeated here as literals because the chart module imports this one).
 * Defaults not stated by a cited page are our own choice and listed in `unknownDefaults`.
 */
export const IND1028_INDICATOR_IDS=['smi','rci','trendstrength','twap','asi','accelosc','chaikinvol'] as const;
export type Ind1028IndicatorId=typeof IND1028_INDICATOR_IDS[number];

/** LV palette entries (src/chart/indicator-settings.ts): cyan, amber, violet, coral, blue; histogram jade/coral; guide grey. */
export const IND1028_COLORS=Object.freeze({cyan:'#4fc3d9',amber:'#f5b14c',violet:'#b48cf2',coral:'#f07a7a',blue:'#6e9cf2',up:'#3fbf8f',down:'#e8605a',guide:'#8a92a6'});
const C=IND1028_COLORS;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const LENGTH_2={type:'int' as const,min:2,max:5000,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
/** Public help-article definitions, cited by article id under the catalog's public-definition prefix. */
const HELP='public-indicator-definition:';
/** Public study input defaults. */
const CL='public-indicator-definition:study-input-defaults';
/** Public list of built-in names. */
const LIST='public-indicator-definition:builtin-indicators-list';
const COLORS_LV='Plot, histogram and level colors are OpenCandle\'s own palette (OpenCandle-defined), not the reference colors.';

const highs=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.high)?bar.high:null),lows=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.low)?bar.low:null);
const closes=(bars:readonly Bar[])=>bars.map(bar=>finite(bar.close)?bar.close:null);
function extreme(values:readonly (number|null)[],index:number,window:number,pick:'max'|'min'):number|null{
 if(index<window-1)return null;let out=pick==='max'?-Infinity:Infinity;
 for(let i=index-window+1;i<=index;i++){const value=values[i];if(!finite(value))return null;out=pick==='max'?Math.max(out,value):Math.min(out,value);}return out;
}
const pair=(a:readonly (number|null)[],b:readonly (number|null)[],f:(x:number,y:number)=>number|null):NumericSeries=>a.map((x,i)=>{const y=b[i];return finite(x)&&finite(y)?f(x,y):null;});

/** Pearson correlation of a full finite window ending at index against x = 0..n-1 (x rises with time); null on a flat window. */
export function correlationWithIndex(values:readonly (number|null)[],index:number,n:number):number|null{
 if(index<n-1)return null;let sy=0,syy=0,sxy=0;const sx=n*(n-1)/2,sxx=(n-1)*n*(2*n-1)/6;
 for(let k=0;k<n;k++){const y=values[index-n+1+k];if(!finite(y))return null;sy+=y;syy+=y*y;sxy+=k*y;}
 const cov=n*sxy-sx*sy,vx=n*sxx-sx*sx,vy=n*syy-sy*sy;if(!(vx>0)||!(vy>0))return null;
 const r=cov/Math.sqrt(vx*vy);return Number.isFinite(r)?Math.max(-1,Math.min(1,r)):null;
}
/** Ascending ranks from 0, ties sharing the mean of their positions (example: 10, 12, 15, 12 -> 0, 1.5, 3, 1.5). */
export function tieAveragedRanks(values:readonly number[]):number[]{
 const order=values.map((value,i)=>({value,i})).sort((a,b)=>a.value-b.value||a.i-b.i),ranks=new Array<number>(values.length);
 for(let start=0;start<order.length;){let end=start;while(end+1<order.length&&order[end+1].value===order[start].value)end++;const rank=(start+end)/2;for(let k=start;k<=end;k++)ranks[order[k].i]=rank;start=end+1;}
 return ranks;
}
/** RCI at index: 100 x the correlation between the price ranks and the bar positions of the window (Spearman with tie ranks). */
export function rciAt(values:readonly (number|null)[],index:number,n:number):number|null{
 if(index<n-1)return null;const window:number[]=[];for(let k=index-n+1;k<=index;k++){const value=values[k];if(!finite(value))return null;window.push(value);}
 const r=correlationWithIndex(tieAveragedRanks(window),n-1,n);return r===null?null:zero(100*r);
}
export const SMOOTHING_TYPES=['None','SMA','SMA + Bollinger Bands','EMA','SMMA (RMA)','WMA','VWMA'] as const;
/** Shared with the CCI smoothing section. */
export function smoothing(ctx:CatalogContext,values:readonly (number|null)[],type:string,length:number):NumericSeries{
 const {tk,bars}=ctx;
 if(type==='SMA'||type==='SMA + Bollinger Bands')return tk.sma(values,length);if(type==='EMA')return tk.ema(values,length);if(type==='SMMA (RMA)')return tk.rma(values,length);if(type==='WMA')return tk.wma(values,length);
 if(type==='VWMA')return values.map((_,i)=>{if(i<length-1)return null;let sv=0,s=0;for(let k=i-length+1;k<=i;k++){const value=values[k],volume=bars[k]?.volume;if(!finite(value)||!finite(volume)||volume<0)return null;sv+=value*volume;s+=volume;}return s>0?sv/s:null;});
 return values.map(()=>null);
}
export function deviation(values:readonly (number|null)[],index:number,n:number):number|null{
 if(index<n-1)return null;let sum=0;for(let k=index-n+1;k<=index;k++){const value=values[k];if(!finite(value))return null;sum+=value;}const mean=sum/n;let ss=0;for(let k=index-n+1;k<=index;k++)ss+=((values[k] as number)-mean)**2;return Math.sqrt(ss/n);
}

// ---- Time weighted average price ----
export const TWAP_ANCHORS=['1h','4h','1D','1W','1M','3M','12M'] as const;
const zoneFormatters=new Map<string,Intl.DateTimeFormat>();
function localDate(time:number,zone:string):{year:number;month:number;day:number}{
 let formatter=zoneFormatters.get(zone);if(!formatter){formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});zoneFormatters.set(zone,formatter);}
 const parts=Object.fromEntries(formatter.formatToParts(time*1000).map(part=>[part.type,part.value]));return {year:Number(parts.year),month:Number(parts.month),day:Number(parts.day)};
}
/** The TWAP period of a bar: hours on the UTC clock, days and longer on the calendar of `zone` (weeks start Monday). */
export function twapPeriodKey(time:number,anchor:string,zone:string):string{
 if(anchor==='1h')return 'h'+Math.floor(time/3600);if(anchor==='4h')return 'h4:'+Math.floor(time/14400);
 const {year,month,day}=localDate(time,zone),days=Math.round(Date.UTC(year,month-1,day)/86400000);
 if(anchor==='1D')return 'd'+days;if(anchor==='1W')return 'w'+Math.floor((days+3)/7);
 if(anchor==='1M')return 'm'+(year*12+month-1);if(anchor==='3M')return 'q'+Math.floor((year*12+month-1)/3);if(anchor==='12M')return 'y'+year;
 throw new Error('Unknown TWAP anchor period.');
}
export function twap(bars:readonly Bar[],source:readonly (number|null)[],anchor:string,zone:string):NumericSeries{
 let key:string|null=null,sum=0,count=0;
 return bars.map((bar,i)=>{const next=twapPeriodKey(bar.time,anchor,zone);if(next!==key){key=next;sum=0;count=0;}const value=source[i];if(finite(value)){sum+=value;count++;}return count?zero(sum/count):null;});
}

// ---- Accumulative swing index (J. Welles Wilder) ----
/** Swing index of a bar against the prior bar, Wilder (1978); T is the limit move. A zero R (no range at all) swings 0. */
export function swingIndex(bar:Bar,prior:Bar,limit:number):number|null{
 const {open:o,high:h,low:l,close:c}=bar,{open:oy,close:cy}=prior;if(![o,h,l,c,oy,cy].every(finite)||!(limit>0))return null;
 const hc=Math.abs(h-cy),lc=Math.abs(l-cy),hl=Math.abs(h-l),co=Math.abs(cy-oy),k=Math.max(hc,lc);
 const r=hc>=lc&&hc>=hl?hc-0.5*lc+0.25*co:lc>=hc&&lc>=hl?lc-0.5*hc+0.25*co:hl+0.25*co;
 if(r===0)return 0;const value=50*((c-cy)+0.5*(c-o)+0.25*(cy-oy))/r*(k/limit);return Number.isFinite(value)?zero(value):null;
}

const definitions:readonly CatalogDefinition[]=[
 {id:'smi',name:'Stochastic momentum index',acronym:'SMI',overlay:false,
  inputs:[{key:'lengthK',title:'%K length',defval:10,...LENGTH},{key:'lengthD',title:'%D length',defval:3,...LENGTH},{key:'lengthEMA',title:'EMA length',defval:3,...LENGTH}],
  plots:[{id:'smi',label:'SMI',color:C.cyan,width:1},{id:'ema',label:'SMI-based EMA',color:C.amber,width:1}],
  guides:[{id:'upper',value:40,color:C.guide},{id:'zero',value:0,color:C.guide},{id:'lower',value:-40,color:C.guide}],band:'guides',fill:{color:C.cyan,opacity:5},
  provenance:[{url:HELP+'stochastic-momentum-index',facts:'Stochastic Momentum Index: highestLowestRange = highestHigh - lowestLow; relativeRange = close - (highestHigh + lowestLow) / 2; smi = 200 x (emaEma(relativeRange, lengthD) / emaEma(highestLowestRange, lengthD)) with emaEma = EMA of the EMA; %K length (high/low window) 10, %D length 3; an EMA of the SMI on EMA length; overbought 40 and oversold -40.'}],
  unknownDefaults:['EMA length 3 is OpenCandle-defined (the page states no default). The 0 line, the band fill between 40 and -40 and the input titles\' casing are OpenCandle-defined.',COLORS_LV],
  policies:['EMAs use the SMA seed (StockCharts, TA-Lib). A zero double-smoothed range is unavailable.'],
  calculate(ctx){const {bars,tk,num}=ctx,n=num('lengthK'),d=num('lengthD'),h=highs(bars),l=lows(bars),c=closes(bars);
   const hh=h.map((_,i)=>extreme(h,i,n,'max')),ll=l.map((_,i)=>extreme(l,i,n,'min'));
   const range=pair(hh,ll,(a,b)=>a-b),rel=c.map((value,i)=>{const a=hh[i],b=ll[i];return finite(value)&&finite(a)&&finite(b)?value-(a+b)/2:null;});
   const ee=(values:readonly (number|null)[])=>tk.ema(tk.ema(values,d),d),num2=ee(rel),den=ee(range);
   const smi=pair(num2,den,(a,b)=>b===0?null:zero(200*a/b));return {smi,ema:tk.ema(smi,num('lengthEMA'))};},
  warmup:value=>value('lengthK')+2*value('lengthD')+value('lengthEMA'),work:(count,value)=>count*(value('lengthK')*2+24)},
 {id:'rci',name:'Rank correlation index',acronym:'RCI',overlay:false,sourceSeries:true,
  inputs:[{key:'length',title:'RCI length',defval:12,...LENGTH_2,max:1000},SOURCE,{key:'maType',title:'Smoothing type',type:'string',defval:'None',options:SMOOTHING_TYPES},{key:'maLength',title:'Smoothing length',defval:14,...LENGTH},{key:'bbMult',title:'BB StdDev',type:'float',defval:2,min:0.5,max:50,step:0.5}],
  plots:[{id:'rci',label:'RCI',color:C.cyan,width:1},{id:'ma',label:'Smoothing',color:C.amber,width:1},{id:'bbUpper',label:'Upper Bollinger band',color:C.up,width:1},{id:'bbLower',label:'Lower Bollinger band',color:C.up,width:1}],
  guides:[{id:'upper',value:80,color:C.guide},{id:'zero',value:0,color:C.guide},{id:'lower',value:-80,color:C.guide}],
  provenance:[{url:HELP+'rank-correlation-index-rci',facts:'RCI: rank the prices ascending from 0, tied prices share the average of their positions; the correlation between the price ranks and the bar indices x 100; range -100..100; levels -80, 0, +80; Source close by default; smoothing types None, SMA, SMA + Bollinger Bands, EMA, SMMA (RMA), WMA, VWMA with Length and BB StdDev.'},{url:CL,facts:'rank correlation index.length: default 12, integer, min 1.'},{url:LIST,facts:'"Rank Correlation Index" is in the built-in list.'}],
  unknownDefaults:['Smoothing type None, smoothing length 14 and BB StdDev 2 are OpenCandle-defined (the page states no defaults). Length 12 is the common default; OpenCandle bounds it 2 to 1000 because a one-bar window has no correlation.',COLORS_LV],
  policies:['Bar indices rise with time across the window, so a steadily rising price reads +100. A window of identical prices has no correlation and is unavailable. Bollinger bands use the population standard deviation of the RCI over the smoothing length around the SMA.'],
  calculate(ctx){const {source,num,str}=ctx,n=num('length'),rci=source.map((_,i)=>rciAt(source,i,n)),type=str('maType'),m=num('maLength'),k=num('bbMult'),ma=smoothing(ctx,rci,type,m);
   const bands=type==='SMA + Bollinger Bands';
   return {rci,ma,bbUpper:ma.map((value,i)=>{if(!bands||!finite(value))return null;const sd=deviation(rci,i,m);return sd===null?null:value+k*sd;}),bbLower:ma.map((value,i)=>{if(!bands||!finite(value))return null;const sd=deviation(rci,i,m);return sd===null?null:value-k*sd;})};},
  warmup:value=>value('length')+value('maLength'),work:(count,value)=>count*(value('length')*12+value('maLength')*4)},
 {id:'trendstrength',name:'Trend strength index',acronym:'TSIdx',overlay:false,
  inputs:[{key:'length',title:'Length',defval:14,...LENGTH_2}],
  plots:[{id:'tsi',label:'Trend strength',color:C.up,width:1}],guides:[{id:'zero',value:0,color:C.guide}],
  pointPalette:{plot:'tsi',colors:[C.up,C.down],labels:['Bullish','Bearish'],state:values=>values('tsi').map(value=>value===null?null:value>=0?0:1)},
  provenance:[{url:HELP+'trend-strength-index',facts:'Trend Strength Index: the Pearson correlation coefficient between the closing prices and the bar index over Length bars (the bar index starts at 0 and rises by one per bar); near 1 a steady rise, near -1 a steady fall, near 0 no trend; Bullish and Bearish colors for positive and negative values.'},{url:LIST,facts:'"Trend Strength Index" is in the built-in list.'}],
  unknownDefaults:['Length 14 is OpenCandle-defined (the page states no default). The gradient fill between the plot and zero is not drawn; the line takes the Bullish or Bearish color per bar instead (OpenCandle-defined).',COLORS_LV],
  policies:['A window with a flat close has no correlation and is unavailable. Any missing close in the window is unavailable.'],
  calculate({bars,num}){const n=num('length'),c=closes(bars);return {tsi:c.map((_,i)=>{const r=correlationWithIndex(c,i,n);return r===null?null:zero(r);})};},
  warmup:value=>value('length'),work:(count,value)=>count*value('length')*3},
 {id:'twap',name:'Time weighted average price',acronym:'TWAP',overlay:true,sourceSeries:true,
  inputs:[{key:'anchor',title:'Anchor period',type:'string',defval:'1D',options:TWAP_ANCHORS},{...SOURCE,defval:'ohlc4'}],
  plots:[{id:'twap',label:'TWAP',color:C.violet,width:2}],
  provenance:[{url:HELP+'time-weighted-average-price',facts:'Time Weighted Average Price: Anchor Period = how often the calculation resets (each period should hold several bars); Source default ohlc4; Offset default 0.'}],
  unknownDefaults:['Anchor period 1D and the choice list 1h, 4h, 1D, 1W, 1M, 3M, 12M are OpenCandle-defined (the reference lists the chart\'s intervals). Day and longer periods follow the New York calendar on US-equity charts and UTC otherwise; hours follow the UTC clock (OpenCandle-defined).',COLORS_LV],
  policies:['TWAP = the mean of the source over the bars of the current anchor period up to this bar; a missing source does not count. Offset is the shared display offset.'],
  calculate({bars,source,str,chart}){return {twap:twap(bars,source,str('anchor'),chart?.calendar==='us-equity'?'America/New_York':'UTC')};},
  warmup:()=>1,work:count=>count*24},
 {id:'asi',name:'Accumulative swing index',acronym:'ASI',overlay:false,
  inputs:[{key:'limit',title:'Limit move value',type:'float',defval:10,min:0.1,max:100000,step:0.1}],
  plots:[{id:'asi',label:'ASI',color:C.cyan,width:1}],guides:[{id:'zero',value:0,color:C.guide}],
  provenance:[{url:CL,facts:'accumulative swing index.limit move value: default 10, float, min 0.1, max 100000; one plot "asi" (line).'},{url:LIST,facts:'"Accumulative Swing Index" is in the built-in list.'},{url:'lv-defined:wilder-new-concepts-1978',facts:'J. Welles Wilder, New Concepts in Technical Trading Systems (1978): SI = 50 x (C - Cy + 0.5 (C - O) + 0.25 (Cy - Oy)) / R x K / T, K = max(|H - Cy|, |L - Cy|), R by the largest of |H - Cy|, |L - Cy|, |H - L| (minus half the other close distance, plus a quarter of |Cy - Oy|); ASI = running total of SI.'}],
  unknownDefaults:['The formula is Wilder\'s published one; the reference implementation was not read. The zero line is OpenCandle-defined.',COLORS_LV],
  policies:['The first bar has no prior bar and is unavailable; the running total starts on the second bar. A bar with no range at all against the prior bar (R = 0) swings 0. A bar with a missing price is unavailable and adds nothing.'],
  calculate({bars,num}){const limit=num('limit');let total=0;return {asi:bars.map((bar,i)=>{if(!i)return null;const si=swingIndex(bar,bars[i-1],limit);if(si===null)return null;total+=si;return zero(total);})};},
  warmup:()=>2,work:count=>count*16},
 {id:'accelosc',name:'Accelerator oscillator',acronym:'AC',overlay:false,
  inputs:[],
  plots:[{id:'ac',label:'AC',kind:'histogram',color:C.up,width:1}],guides:[{id:'zero',value:0,color:C.guide}],
  pointPalette:{plot:'ac',colors:[C.up,C.down],labels:['Rising','Falling'],state:values=>{const v=values('ac');return v.map((value,i)=>{if(value===null)return null;const prior=v[i-1];return prior===null||prior===undefined||value>=prior?0:1;});}},
  provenance:[{url:LIST,facts:'"Accelerator Oscillator" is a common built-in drawn as one histogram plot.'},{url:'lv-defined:bill-williams-trading-chaos-1995',facts:'Bill Williams: AO = SMA(median price, 5) - SMA(median price, 34); AC = AO - SMA(AO, 5); a bar higher than the prior one is rising, lower is falling.'}],
  unknownDefaults:['No inputs are recorded for the reference; OpenCandle keeps the author lengths 5, 34 and 5 fixed (OpenCandle-defined). An equal bar keeps the rising color (OpenCandle-defined).',COLORS_LV],
  policies:['Median price = (high + low) / 2.'],
  calculate({bars,tk}){const hl2=bars.map(bar=>finite(bar.high)&&finite(bar.low)?(bar.high+bar.low)/2:null),ao=pair(tk.sma(hl2,5),tk.sma(hl2,34),(a,b)=>a-b);return {ac:pair(ao,tk.sma(ao,5),(a,b)=>zero(a-b))};},
  warmup:()=>38,work:count=>count*48},
 {id:'chaikinvol',name:'Chaikin volatility',acronym:'CV',overlay:false,
  inputs:[{key:'periods',title:'Periods',defval:10,...LENGTH},{key:'lookback',title:'Rate of change lookback',defval:10,...LENGTH}],
  plots:[{id:'cv',label:'Chaikin volatility',color:C.violet,width:1}],guides:[{id:'zero',value:0,color:C.guide}],
  provenance:[{url:CL,facts:'chaikin volatility.periods: default 10 (integer); chaikin volatility.rate of change lookback: default 10 (integer); one line plot and a zero line at 0.'},{url:'lv-defined:chaikin-volatility-textbook',facts:'Marc Chaikin: EMA of (high - low) over Periods; Chaikin volatility = 100 x (EMA - EMA n bars ago) / (EMA n bars ago), n = Rate of change lookback.'}],
  unknownDefaults:['The reference implementation was not read; the formula is the textbook one.',COLORS_LV],
  policies:['The EMA uses the SMA seed (StockCharts, TA-Lib). A zero earlier EMA is unavailable.'],
  calculate({bars,tk,num}){const ema=tk.ema(bars.map(bar=>finite(bar.high)&&finite(bar.low)?bar.high-bar.low:null),num('periods')),n=num('lookback');
   return {cv:ema.map((value,i)=>{const prior=i>=n?ema[i-n]:null;return finite(value)&&finite(prior)&&prior!==0?zero(100*(value-prior)/prior):null;})};},
  warmup:value=>value('periods')+value('lookback'),work:count=>count*16},
];
export const IND1028_INDICATORS:readonly CatalogDefinition[]=definitions;
