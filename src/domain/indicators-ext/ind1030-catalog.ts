import type {Bar,NumericSeries} from '../types';
import type {CatalogDefinition,CatalogInput,CatalogToolkit} from '../indicator-catalog';
import type {PatternMarker} from './patterns-catalog';

/**
 * Built-ins: Sequential 9-13 (a setup 1-9 and countdown 1-13 exhaustion count), Hull Suite (the Hull moving
 * average family with trend colors) and KDJ (the stochastic-derived random index). Rules are the published textbook ones cited per row; calculations are original
 * OpenCandle code written from those rules, and no third-party script source was copied. Anything a cited rule leaves open is
 * our own choice and listed in `unknownDefaults`.
 */
export const IND1030_INDICATOR_IDS=['seq913','hullsuite','kdj'] as const;
export type Ind1030IndicatorId=typeof IND1030_INDICATOR_IDS[number];

/** LV palette entries (src/chart/indicator-settings.ts LV_INDICATOR_PALETTE / LV_HISTOGRAM_COLORS / LV_GUIDE_COLOR). */
const C=Object.freeze({cyan:'#4fc3d9',amber:'#f5b14c',violet:'#b48cf2',green:'#7fd17a',blue:'#6e9cf2',pink:'#e88ad8',up:'#3fbf8f',down:'#e8605a',guide:'#8a92a6'});
/** Hull Suite trend colors requested for the release (bull and bear). */
export const HULL_SUITE_COLORS=Object.freeze({bull:'#4CAF50',bear:'#F23645'});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
const LV='lv-defined:';
const MARK_LIMIT=5000;
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};

// ---- Sequential 9-13 ----
export interface SequentialSeries {buySetup:NumericSeries;sellSetup:NumericSeries;buy9:NumericSeries;sell9:NumericSeries;buyPerfected:NumericSeries;sellPerfected:NumericSeries;buyCountdown:NumericSeries;sellCountdown:NumericSeries;buy13:NumericSeries;sell13:NumericSeries}
/**
 * One causal pass (bar i reads bars 0..i only).
 * Setup: a buy setup bar closes below the close `lookback` bars earlier; bar 1 needs a price flip (the prior bar closed above
 * the close `lookback` bars before it). Consecutive bars count 1..9; a bar that fails the comparison resets the count. A
 * completed 9 ends the setup, so a new one needs a new flip. Sell is the mirror (closes above, flip from below).
 * Perfection (judged on bar 9): buy when the low of bar 8 or bar 9 is at or below the lows of bars 6 and 7; sell mirror on highs.
 * Countdown: a completed buy setup starts a buy countdown (bar 9 itself may count) that counts bars, not necessarily
 * consecutive, closing at or below the low `countdownLookback` bars earlier, up to 13. A completed sell setup cancels a buy
 * countdown (and the mirror). A same-direction setup completing while a countdown runs does not restart it (no recycle).
 * Values: setup and countdown plots hold the count on the bar that counts (0 otherwise); the 9 / 13 / perfected plots are 1 on
 * the bar that completes (0 otherwise). A bar whose close or comparison close is missing is unavailable and resets the setups.
 */
export function sequentialSeries(bars:readonly Bar[],lookback:number,countdownLookback:number):SequentialSeries{
 const n=bars.length,make=()=>new Array<number|null>(n).fill(null);
 const out:SequentialSeries={buySetup:make(),sellSetup:make(),buy9:make(),sell9:make(),buyPerfected:make(),sellPerfected:make(),buyCountdown:make(),sellCountdown:make(),buy13:make(),sell13:make()};
 const close=(i:number)=>i>=0&&finite(bars[i]?.close)?bars[i].close:null,low=(i:number)=>i>=0&&finite(bars[i]?.low)?bars[i].low:null,high=(i:number)=>i>=0&&finite(bars[i]?.high)?bars[i].high:null;
 let buy=0,sell=0,buyBars:number[]=[],sellBars:number[]=[],buyCd:number|null=null,sellCd:number|null=null;
 for(let i=0;i<n;i++){
  const c=close(i),ref=close(i-lookback),prev=close(i-1),prevRef=close(i-1-lookback);
  let buyDone=false,sellDone=false;
  if(c!==null&&ref!==null){
   const down=c<ref,up=c>ref;
   if(buy>0){if(down){buy++;buyBars.push(i);}else{buy=0;buyBars=[];}}
   else if(down&&prev!==null&&prevRef!==null&&prev>prevRef){buy=1;buyBars=[i];}
   if(sell>0){if(up){sell++;sellBars.push(i);}else{sell=0;sellBars=[];}}
   else if(up&&prev!==null&&prevRef!==null&&prev<prevRef){sell=1;sellBars=[i];}
   out.buySetup[i]=buy;out.sellSetup[i]=sell;out.buy9[i]=0;out.sell9[i]=0;out.buyPerfected[i]=0;out.sellPerfected[i]=0;
   if(buy===9){
    buyDone=true;out.buy9[i]=1;const [l6,l7,l8,l9]=buyBars.slice(5,9).map(low);
    if(l6!==null&&l7!==null&&(l8!==null&&l8<=l6&&l8<=l7||l9!==null&&l9<=l6&&l9<=l7))out.buyPerfected[i]=1;buy=0;buyBars=[];
   }
   if(sell===9){
    sellDone=true;out.sell9[i]=1;const [h6,h7,h8,h9]=sellBars.slice(5,9).map(high);
    if(h6!==null&&h7!==null&&(h8!==null&&h8>=h6&&h8>=h7||h9!==null&&h9>=h6&&h9>=h7))out.sellPerfected[i]=1;sell=0;sellBars=[];
   }
  }else{buy=0;sell=0;buyBars=[];sellBars=[];}
  if(buyDone){sellCd=null;if(buyCd===null)buyCd=0;}
  if(sellDone){buyCd=null;if(sellCd===null)sellCd=0;}
  if(c===null)continue;
  out.buyCountdown[i]=0;out.sellCountdown[i]=0;out.buy13[i]=0;out.sell13[i]=0;
  const lowRef=low(i-countdownLookback),highRef=high(i-countdownLookback);
  if(buyCd!==null&&lowRef!==null&&c<=lowRef){buyCd++;out.buyCountdown[i]=buyCd;if(buyCd===13){out.buy13[i]=1;buyCd=null;}}
  if(sellCd!==null&&highRef!==null&&c>=highRef){sellCd++;out.sellCountdown[i]=sellCd;if(sellCd===13){out.sell13[i]=1;sellCd=null;}}
 }
 return out;
}
export interface SequentialDisplay {showSetup:boolean;showCountdown:boolean;showFrom:number;perfected:boolean}
/** Markers: buy setup numbers below the bar and sell setup numbers above; countdown numbers sit on the other side of the bar
 *  (buy countdown above, sell countdown below) so a bar that counts both never stacks two labels. */
export function sequentialMarkers(series:SequentialSeries,display:SequentialDisplay):PatternMarker[]{
 const markers:PatternMarker[]=[];
 for(let i=0;i<series.buySetup.length;i++){
  if(display.showSetup)for(const side of ['buy','sell'] as const){
   const count=(side==='buy'?series.buySetup:series.sellSetup)[i];if(!finite(count)||count<1||count<display.showFrom)continue;
   const nine=count===9,perfect=nine&&display.perfected&&(side==='buy'?series.buyPerfected:series.sellPerfected)[i]===1,name=side==='buy'?'Buy':'Sell';
   markers.push({index:i,plot:nine?side+'9':side+'Setup',text:perfect?(side==='buy'?'9▲':'9▼'):String(count),tooltip:`${name} setup ${count}${nine?(perfect?' (completed, perfected)':' (completed)'):''}`,position:side==='buy'?'below':'above'});
  }
  if(display.showCountdown)for(const side of ['buy','sell'] as const){
   const count=(side==='buy'?series.buyCountdown:series.sellCountdown)[i];if(!finite(count)||count<1)continue;
   markers.push({index:i,plot:count===13?side+'13':side+'Countdown',text:String(count),tooltip:`${side==='buy'?'Buy':'Sell'} countdown ${count}${count===13?' (completed)':''}`,position:side==='buy'?'above':'below'});
  }
 }
 return markers.slice(-MARK_LIMIT);
}

// ---- Hull Suite ----
export const HULL_MODES=['HMA','EHMA','THMA'] as const;
const pair=(a:readonly (number|null)[],b:readonly (number|null)[],f:(x:number,y:number)=>number):NumericSeries=>a.map((x,i)=>{const y=b[i];return finite(x)&&finite(y)?f(x,y):null;});
/** The effective length: Length x Length multiplier, truncated, at least 1. */
export const hullLength=(length:number,multiplier:number)=>Math.max(1,Math.floor(length*multiplier+1e-9));
/** HMA = WMA(2 WMA(n/2) - WMA(n), round(sqrt n)); EHMA the same with EMAs; THMA = WMA(3 WMA(n/3) - WMA(n/2) - WMA(n), n).
 *  Fractional lengths truncate (at least 1). EMAs are the SMA-seeded EMA (seeded by the SMA of its first values). */
export function hullFamily(tk:CatalogToolkit,source:readonly (number|null)[],mode:string,n:number):NumericSeries{
 const half=Math.max(1,Math.floor(n/2)),root=Math.max(1,Math.round(Math.sqrt(n)));
 if(mode==='EHMA')return tk.emaSmaSeed(pair(tk.emaSmaSeed(source,half),tk.emaSmaSeed(source,n),(a,b)=>2*a-b),root);
 if(mode==='THMA'){const third=Math.max(1,Math.floor(n/3)),a=tk.wma(source,third),b=tk.wma(source,half),c=tk.wma(source,n);
  return tk.wma(a.map((x,i)=>{const y=b[i],z=c[i];return finite(x)&&finite(y)&&finite(z)?3*x-y-z:null;}),n);}
 if(mode!=='HMA')throw new Error('Unknown Hull mode.');
 return tk.wma(pair(tk.wma(source,half),tk.wma(source,n),(a,b)=>2*a-b),root);
}

// ---- KDJ ----
/** RSV = 100 (close - lowest low n) / (highest high n - lowest low n); a zero range carries the previous RSV (50 before any).
 *  K = ((m1 - 1) K[1] + RSV) / m1, D = ((m2 - 1) D[1] + K) / m2, both seeded at 50; J = 3K - 2D (may leave 0..100).
 *  A bar whose window has a missing price is unavailable and leaves K and D unchanged. */
export function kdjSeries(bars:readonly Bar[],n:number,m1:number,m2:number):{k:NumericSeries;d:NumericSeries;j:NumericSeries}{
 const k:NumericSeries=[],d:NumericSeries=[],j:NumericSeries=[];let pk=50,pd=50,prsv:number|null=null;
 for(let i=0;i<bars.length;i++){
  let hh=-Infinity,ll=Infinity,ok=i>=n-1&&finite(bars[i].close);
  for(let t=i-n+1;ok&&t<=i;t++){const bar=bars[t];if(!finite(bar.high)||!finite(bar.low)){ok=false;break;}hh=Math.max(hh,bar.high);ll=Math.min(ll,bar.low);}
  if(!ok){k.push(null);d.push(null);j.push(null);continue;}
  const range=hh-ll,rsv:number=range>0?100*(bars[i].close-ll)/range:prsv??50;prsv=rsv;
  pk=((m1-1)*pk+rsv)/m1;pd=((m2-1)*pd+pk)/m2;k.push(zero(pk));d.push(zero(pd));j.push(zero(3*pk-2*pd));
 }
 return {k,d,j};
}

const definitions:readonly CatalogDefinition[]=[
 {id:'seq913',name:'Sequential 9-13',acronym:'Seq 9-13',overlay:true,pattern:'chart',
  keywords:['TD','sequential','9 count','13 count','setup','countdown','exhaustion'],
  inputs:[{key:'showSetup',title:'Show setup',type:'bool',defval:true},{key:'showCountdown',title:'Show countdown',type:'bool',defval:true},
   {key:'showFrom',title:'Show setup numbers from',type:'int',defval:1,min:1,max:9,step:1},{key:'perfected',title:'Mark perfected 9',type:'bool',defval:true},
   {key:'lookback',title:'Setup lookback',type:'int',defval:4,min:1,max:50,step:1},{key:'countdownLookback',title:'Countdown lookback',type:'int',defval:2,min:1,max:50,step:1}],
  plots:[{id:'buySetup',label:'Buy setup',color:C.up,width:1},{id:'sellSetup',label:'Sell setup',color:C.down,width:1},
   {id:'buy9',label:'Buy setup 9',color:C.green,width:1},{id:'sell9',label:'Sell setup 9',color:C.amber,width:1},
   {id:'buyCountdown',label:'Buy countdown',color:C.cyan,width:1},{id:'sellCountdown',label:'Sell countdown',color:C.pink,width:1},
   {id:'buy13',label:'Buy countdown 13',color:C.blue,width:1},{id:'sell13',label:'Sell countdown 13',color:C.violet,width:1},
   {id:'buyPerfected',label:'Buy 9 perfected',color:C.green,width:1},{id:'sellPerfected',label:'Sell 9 perfected',color:C.amber,width:1}],
  provenance:[{url:'public-indicator-definition:textbook-sequential-setup-countdown',facts:'Setup 1-9 and countdown 1-13 exhaustion count: a buy setup is nine consecutive closes below the close four bars earlier, started by a price flip (the prior bar closed above the close four bars before it); a sell setup is the mirror. Perfected buy: the low of bar 8 or 9 at or below the lows of bars 6 and 7 (sell mirror on highs). Buy countdown: after a completed buy setup, thirteen bars (not necessarily consecutive) closing at or below the low two bars earlier; sell mirror with highs. A completed opposite setup cancels a countdown.'}],
  unknownDefaults:['Show setup on, show countdown on, setup numbers from 1, perfected marks on, lookbacks 4 and 2 are OpenCandle-defined defaults matching the textbook rule.','No recycling: a same-direction setup that completes while a countdown runs leaves the running countdown in place (OpenCandle-defined). The optional 13th-bar qualifier and setup trend levels are not drawn (OpenCandle-defined).','Countdown numbers sit on the other side of the bar from the setup numbers; a perfected 9 shows an arrow next to the 9 (OpenCandle-defined). Marker colors are OpenCandle\'s own palette.'],
  policies:['Every count reads only the bar and earlier bars, so a drawn number never changes and replay never sees later bars.','The plots hold the setup or countdown count on the bar that counts (0 otherwise); the 9, 13 and perfected plots are 1 on the completing bar. They are what alerts, the legend and the data window read; the chart draws the numbers. The show settings change only the drawn numbers.','A bar with a missing close (or a missing comparison close) is unavailable and resets both setups; countdowns skip it.'],
  calculate(ctx){const series=sequentialSeries(ctx.bars,ctx.num('lookback'),ctx.num('countdownLookback'));
   ctx.marks?.({markers:sequentialMarkers(series,{showSetup:ctx.bool('showSetup'),showCountdown:ctx.bool('showCountdown'),showFrom:ctx.num('showFrom'),perfected:ctx.bool('perfected')}),lines:[]});
   return {...series};},
  warmup:value=>value('lookback')+2,work:count=>count*24},
 {id:'hullsuite',name:'Hull Suite',acronym:'Hull Suite',overlay:true,sourceSeries:true,
  keywords:['hull','HMA','EHMA','THMA','moving average','trend'],
  inputs:[SOURCE,{key:'length',title:'Length',type:'int',defval:55,min:1,max:5000,step:1},{key:'mode',title:'Hull variation',type:'string',defval:'HMA',options:HULL_MODES},
   {key:'lengthMult',title:'Length multiplier',type:'float',defval:1,min:0.1,max:10,step:0.1},{key:'colorByTrend',title:'Color by trend',type:'bool',defval:true},{key:'showBand',title:'Show as band',type:'bool',defval:true}],
  plots:[{id:'upper',label:'Hull',color:HULL_SUITE_COLORS.bull,width:2},{id:'lower',label:'Hull 2 bars ago',color:C.guide,width:1},{id:'trend',label:'Trend',color:C.guide,width:1,visible:false}],
  band:'plots',fill:{color:HULL_SUITE_COLORS.bull,opacity:50},bearishFill:{color:HULL_SUITE_COLORS.bear,opacity:50},
  pointPalette:{plot:'upper',colors:[HULL_SUITE_COLORS.bull,HULL_SUITE_COLORS.bear],labels:['Rising','Falling'],state:values=>values('trend').map(value=>value===1?0:value===-1?1:null)},
  provenance:[{url:'public-indicator-definition:textbook-hull-moving-average',facts:'Alan Hull: HMA = WMA(2 x WMA(src, n/2) - WMA(src, n), sqrt(n)). Exponential variant EHMA = EMA(2 x EMA(src, n/2) - EMA(src, n), sqrt(n)); triple variant THMA = WMA(3 x WMA(src, n/3) - WMA(src, n/2) - WMA(src, n), n). A rising Hull compared with two bars earlier is bullish.'}],
  unknownDefaults:['Length 55, mode HMA, multiplier 1, trend colors on, band on, bull #4CAF50 and bear #F23645 at transparency 50 are the requested defaults (OpenCandle-defined). The band transparency is the fill opacity on the Style tab.','The second line is the Hull two bars earlier; it is grey and only bounds the band (OpenCandle-defined).'],
  policies:['Effective length = Length x Length multiplier, truncated, at least 1; n/2, n/3 truncate and sqrt(n) rounds. EMAs are seeded by the SMA of their first values, so every variant is unavailable until it has a full window.','Rising (bull) when the Hull is above its value two bars earlier, otherwise falling (bear). The Trend plot is 1 rising and -1 falling, and unavailable when Color by trend is off (the Hull line then keeps its own color). The band fill between the Hull and its value two bars earlier is bull while the Hull is above it and bear otherwise; Show as band off removes the second line and the fill.'],
  calculate({source,tk,num,str,bool}){
   const hull=hullFamily(tk,source,str('mode'),hullLength(num('length'),num('lengthMult'))),prior=hull.map((_,i)=>i>=2&&finite(hull[i-2])?hull[i-2]:null);
   const trend=hull.map((value,i)=>{const before=prior[i];return bool('colorByTrend')&&finite(value)&&finite(before)?(value>before?1:-1):null;});
   return {upper:hull.map(value=>finite(value)?zero(value):null),lower:bool('showBand')?prior:prior.map(()=>null),trend};},
  warmup:value=>{const n=hullLength(value('length'),value('lengthMult'));return 2*n+Math.round(Math.sqrt(n))+2;},work:(count,value)=>count*hullLength(value('length'),value('lengthMult'))*8},
 {id:'kdj',name:'KDJ',acronym:'KDJ',overlay:false,
  keywords:['KDJ','stochastic','random index'],
  inputs:[{key:'period',title:'Period',type:'int',defval:9,min:1,max:5000,step:1},{key:'kSmoothing',title:'K smoothing',type:'int',defval:3,min:1,max:500,step:1},{key:'dSmoothing',title:'D smoothing',type:'int',defval:3,min:1,max:500,step:1}],
  plots:[{id:'k',label:'K',color:C.cyan,width:1},{id:'d',label:'D',color:C.amber,width:1},{id:'j',label:'J',color:C.violet,width:1}],
  guides:[{id:'upper',value:80,color:C.guide},{id:'lower',value:20,color:C.guide}],band:'guides',fill:{color:C.cyan,opacity:5},
  provenance:[{url:'public-indicator-definition:textbook-kdj-random-index',facts:'KDJ (random index): RSV = 100 x (close - lowest low of n) / (highest high of n - lowest low of n); K = 2/3 x K[1] + 1/3 x RSV; D = 2/3 x D[1] + 1/3 x K; J = 3K - 2D; K and D start at 50; n 9, smoothing 3 and 3; overbought 80, oversold 20.'}],
  unknownDefaults:['A zero high-low range carries the previous RSV (50 before any), the 80/20 band fill and the colors are OpenCandle-defined; the price is always high, low and close.'],
  policies:['Smoothing weight is 1 / K smoothing and 1 / D smoothing (3 gives the 2/3 and 1/3 weights). J is not clipped and may leave 0..100. Each bar reads only itself and earlier bars. A window with a missing price is unavailable and leaves K and D where they were. K crossing D is an alert on K against D.'],
  calculate({bars,num}){return kdjSeries(bars,num('period'),num('kSmoothing'),num('dSmoothing'));},
  warmup:value=>value('period')+4*Math.max(value('kSmoothing'),value('dSmoothing')),work:(count,value)=>count*(value('period')*2+8)},
];
export const IND1030_INDICATORS:readonly CatalogDefinition[]=definitions;
