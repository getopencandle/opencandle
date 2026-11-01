import type {Bar,NumericSeries} from '../types';
import type {CatalogDefinition,CatalogInput,CatalogToolkit} from '../indicator-catalog';
import type {PatternLine,PatternMarker} from './patterns-catalog';
import {oscillatorDivergence,RSI_DIVERGENCE_KINDS,RSI_DIVERGENCE_LABELS,RSI_DIVERGENCE_TITLES,type RsiDivergenceKind,type RsiDivergencePolicy} from '../rsi-divergence';

/**
 * Signal built-ins: Bollinger Bands breach, DI cross signals, MACD divergence and RSI failure swings. Each one draws its
 * lines (bands or an oscillator) and marks its signals as labelled markers; the signal plots are 1 on the bar where the
 * signal becomes known (else 0), which is what alerts, the legend and the data window read. Rules are the published ones
 * cited per row; the calculations are original OpenCandle code written from those rules, and no third-party script
 * source was copied. Anything a cited rule leaves open is our own choice and listed in `unknownDefaults`.
 */
export const SIGNALS_INDICATOR_IDS=['bbbreach','dicross','macddiv','rsifs'] as const;
export type SignalsIndicatorId=typeof SIGNALS_INDICATOR_IDS[number];

/** LV palette entries (src/chart/indicator-settings.ts LV_INDICATOR_PALETTE / LV_HISTOGRAM_COLORS / LV_GUIDE_COLOR). */
const C=Object.freeze({cyan:'#4fc3d9',amber:'#f5b14c',violet:'#b48cf2',green:'#7fd17a',blue:'#6e9cf2',pink:'#e88ad8',up:'#3fbf8f',down:'#e8605a',guide:'#8a92a6'});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const zero=(value:number)=>value===0?0:value;
const MARK_LIMIT=5000;
const LENGTH={type:'int' as const,min:1,max:5000,step:1};
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const signal=(n:number)=>new Array<number|null>(n).fill(null);
const fmt=(value:number)=>String(Math.round(value*100)/100);

// ---- Bollinger Bands breach ----
/** Bollinger Bands: basis = SMA(close, n); bands = basis +/- k x population standard deviation of the same window (the
 *  Bollinger Bands built-in convention). A window holding a missing close is unavailable. */
export function bollingerSeries(values:readonly (number|null)[],n:number,k:number):{basis:NumericSeries;upper:NumericSeries;lower:NumericSeries}{
 const basis:NumericSeries=[],upper:NumericSeries=[],lower:NumericSeries=[];
 for(let i=0;i<values.length;i++){
  let ok=i>=n-1;for(let t=i-n+1;ok&&t<=i;t++)if(!finite(values[t]))ok=false;
  if(!ok){basis.push(null);upper.push(null);lower.push(null);continue;}
  const origin=values[i-n+1] as number;let offset=0;for(let t=i-n+1;t<=i;t++)offset+=(values[t] as number)-origin;offset/=n;
  let variance=0;for(let t=i-n+1;t<=i;t++)variance+=((values[t] as number)-origin-offset)**2;
  const mean=origin+offset,deviation=Math.sqrt(Math.max(0,variance/n));basis.push(mean);upper.push(mean+k*deviation);lower.push(mean-k*deviation);
 }
 return {basis,upper,lower};
}
export interface BollingerBreachSeries {aboveUpper:NumericSeries;belowLower:NumericSeries;reentryFromAbove:NumericSeries;reentryFromBelow:NumericSeries}
/**
 * Breach: a close above the upper band (below the lower band). With First close outside only, only a close outside whose
 * prior close was not outside on the same side counts (OpenCandle-defined, so a walk along a band marks once).
 * Re-entry (OpenCandle-defined): a close back inside the bands (at or between them) after the prior close was outside;
 * from above after an upper breach, from below after a lower one. Every value reads the bar and the bar before only.
 * J. Bollinger, Bollinger on Bollinger Bands (2001): a close outside the bands is not a signal on its own (tags of the
 * bands are often continuation, not reversal), so these marks are facts for further analysis, not trade signals.
 */
export function bollingerBreach(close:readonly (number|null)[],upper:readonly (number|null)[],lower:readonly (number|null)[],firstOnly:boolean):BollingerBreachSeries{
 const n=close.length,out:BollingerBreachSeries={aboveUpper:signal(n),belowLower:signal(n),reentryFromAbove:signal(n),reentryFromBelow:signal(n)};
 const state=(i:number):'above'|'below'|'inside'|null=>{const c=close[i],u=upper[i],l=lower[i];if(i<0||!finite(c)||!finite(u)||!finite(l))return null;return c>u?'above':c<l?'below':'inside';};
 for(let i=0;i<n;i++){
  const now=state(i);if(now===null)continue;const before=state(i-1);
  out.aboveUpper[i]=now==='above'&&(!firstOnly||before!=='above')?1:0;out.belowLower[i]=now==='below'&&(!firstOnly||before!=='below')?1:0;
  out.reentryFromAbove[i]=now==='inside'&&before==='above'?1:0;out.reentryFromBelow[i]=now==='inside'&&before==='below'?1:0;
 }
 return out;
}
function bollingerMarkers(series:BollingerBreachSeries,reentry:boolean):PatternMarker[]{
 const markers:PatternMarker[]=[];
 for(let i=0;i<series.aboveUpper.length;i++){
  if(series.aboveUpper[i]===1)markers.push({index:i,plot:'aboveUpper',text:'Above',tooltip:'Close above the upper band',position:'above'});
  if(series.belowLower[i]===1)markers.push({index:i,plot:'belowLower',text:'Below',tooltip:'Close below the lower band',position:'below'});
  if(reentry&&series.reentryFromAbove[i]===1)markers.push({index:i,plot:'reentryFromAbove',text:'Re-entry',tooltip:'Close back inside the bands after a close above the upper band',position:'above'});
  if(reentry&&series.reentryFromBelow[i]===1)markers.push({index:i,plot:'reentryFromBelow',text:'Re-entry',tooltip:'Close back inside the bands after a close below the lower band',position:'below'});
 }
 return markers.slice(-MARK_LIMIT);
}

// ---- DI cross signals ----
/** Wilder directional movement, the same rules as the Directional Movement Index built-in (src/domain/indicator-catalog.ts
 *  `directional`): +DM/-DM from the bar and the prior bar, true range, Wilder (RMA) smoothing over the DI length, ADX the
 *  RMA of DX over the ADX smoothing. A bar whose own or prior high/low (or prior close) is missing is unavailable. */
export function directionalMovement(bars:readonly Bar[],tk:CatalogToolkit,diLength:number,adxSmoothing:number):{plusDI:NumericSeries;minusDI:NumericSeries;adx:NumericSeries}{
 const plus:NumericSeries=[],minus:NumericSeries=[],tr:NumericSeries=[];
 bars.forEach((bar,i)=>{
  if(!i){plus.push(null);minus.push(null);tr.push(null);return;}const prior=bars[i-1];
  if(![bar.high,bar.low,prior.high,prior.low,prior.close].every(finite)){plus.push(null);minus.push(null);tr.push(null);return;}
  const up=bar.high-prior.high,down=prior.low-bar.low;
  plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);tr.push(Math.max(bar.high-bar.low,Math.abs(bar.high-prior.close),Math.abs(bar.low-prior.close)));
 });
 const str=tk.rma(tr,diLength),splus=tk.rma(plus,diLength),sminus=tk.rma(minus,diLength);
 const plusDI=str.map((value,i)=>finite(value)&&value>0&&finite(splus[i])?100*(splus[i] as number)/value:null);
 const minusDI=str.map((value,i)=>finite(value)&&value>0&&finite(sminus[i])?100*(sminus[i] as number)/value:null);
 const dx=plusDI.map((value,i)=>{const other=minusDI[i];if(!finite(value)||!finite(other)||value+other===0)return null;return 100*Math.abs(value-other)/(value+other);});
 return {plusDI,minusDI,adx:tk.rma(dx,adxSmoothing)};
}
/** ADXR = (ADX[i] + ADX[i - (n - 1)]) / 2 with n = ADX smoothing, the TA-Lib ADXR placement (ta_ADXR.c); Wilder averages
 *  today's ADX with the ADX of n days earlier. Unavailable while either ADX is missing. */
export function adxrSeries(adx:readonly (number|null)[],n:number):NumericSeries{
 return adx.map((value,i)=>{const back=i-(n-1),other=back>=0?adx[back]:null;return finite(value)&&finite(other)?(value+other)/2:null;});
}
export const DI_TREND_FILTERS=['ADXR','ADX','Off'] as const;
export type DiTrendFilter=typeof DI_TREND_FILTERS[number];
export interface DiCrossOptions {filter:DiTrendFilter;threshold:number;reverseAtExtreme:boolean}
/** A qualifying cross (signal) or the penetration of the extreme point in force (`hit`, side = the side whose level broke). */
export interface DiCrossEvent {kind:'cross'|'hit';side:'bull'|'bear';index:number;level:number|null;filter:number|null}
/** One extreme point level from the bar it starts on through the bar it ends on (hit, replaced, or the last bar). */
export interface DiExtremeSegment {side:'bull'|'bear';from:number;to:number;level:number;hit:boolean}
export interface DiCrossResult {bull:NumericSeries;bear:NumericSeries;extremePoint:NumericSeries;extremeHit:NumericSeries;events:DiCrossEvent[];segments:DiExtremeSegment[]}
/**
 * J. W. Wilder, New Concepts in Technical Trading Systems (1978), Directional Movement chapter: +DI crossing above -DI is
 * the long signal and -DI crossing above +DI the short one; the signal is the crossing bar. Extreme point rule: the extreme
 * price of the crossing day is the reverse point (the low of that day after a bull cross, the high after a bear cross), held
 * even while the DIs stay crossed against the position, until it is penetrated. Trend filter: Wilder trades the system when
 * ADXR is above 25 and not below 20.
 * A cross is a bar where +DI - -DI turns above 0 from 0 or below (bull) or below 0 from 0 or above (bear), both DIs present
 * on the bar and the bar before. The filter reads the crossing bar (at or above the threshold; a missing value fails it,
 * OpenCandle-defined boundary); a filtered cross gives no signal and leaves the level in force unchanged.
 * Extreme point (one causal pass): a qualifying cross starts a new level on its own bar, replacing any level in force. From
 * the next bar a bull level is penetrated by a low below it and a bear level by a high above it; that bar is the hit
 * (extremeHit 1) and the level ends there. OpenCandle-defined: after a hit there is no level until the next qualifying
 * cross; with Reverse at extreme point the hit bar starts the opposite level at its own high (after a bull level broke) or
 * low (after a bear level broke), Wilder's stop and reverse. The level plot carries the level of each bar from its start
 * through its hit bar; on a bar that starts a level it is the new level. The hit is tested before the cross on each bar.
 */
export function diCrossEvents(bars:readonly Bar[],plusDI:readonly (number|null)[],minusDI:readonly (number|null)[],filterValues:readonly (number|null)[],options:DiCrossOptions):DiCrossResult{
 const n=bars.length,out:DiCrossResult={bull:signal(n),bear:signal(n),extremePoint:signal(n),extremeHit:signal(n),events:[],segments:[]};
 let active:{side:'bull'|'bear';from:number;level:number}|null=null;
 const close=(to:number,hit:boolean)=>{if(active)out.segments.push({...active,to,hit});active=null;};
 for(let i=0;i<n;i++){
  const p=plusDI[i],m=minusDI[i];if(!finite(p)||!finite(m))continue;
  out.bull[i]=0;out.bear[i]=0;out.extremeHit[i]=0;
  const high=bars[i].high,low=bars[i].low;
  if(active){
   out.extremePoint[i]=active.level;
   const side:'bull'|'bear'=active.side,level=active.level;
   if(side==='bull'?finite(low)&&low<level:finite(high)&&high>level){
    out.extremeHit[i]=1;out.events.push({kind:'hit',side,index:i,level,filter:null});close(i,true);
    const next:number=side==='bull'?high:low;
    if(options.reverseAtExtreme&&finite(next)){active={side:side==='bull'?'bear':'bull',from:i,level:next};out.extremePoint[i]=next;}
   }
  }
  const pp=i?plusDI[i-1]:null,pm=i?minusDI[i-1]:null;if(!finite(pp)||!finite(pm))continue;
  const up=p-m>0&&pp-pm<=0,down=p-m<0&&pp-pm>=0;if(!up&&!down)continue;
  const f=options.filter==='Off'?null:filterValues[i],strong=options.filter==='Off'||finite(f)&&f>=options.threshold;if(!strong)continue;
  const side=up?'bull':'bear',level=up?low:high,at=finite(f)?f:null;
  (up?out.bull:out.bear)[i]=1;out.events.push({kind:'cross',side,index:i,level:finite(level)?level:null,filter:at});
  if(!finite(level))continue;
  if(active){if(active.from===i)active=null;else close(i,false);}
  active={side,from:i,level};out.extremePoint[i]=level;
 }
 if(active)close(n-1,false);
 return out;
}
function diCrossMarks(result:DiCrossResult,plusDI:readonly (number|null)[],minusDI:readonly (number|null)[],filter:DiTrendFilter,showExtreme:boolean):{markers:PatternMarker[];lines:PatternLine[]}{
 const markers:PatternMarker[]=[],lines:PatternLine[]=[];
 for(const event of result.events){
  const bullish=event.side==='bull';
  if(event.kind==='hit'){
   // The DI of the broken side, so the marker sits on its own line in the DI pane.
   const value=(bullish?plusDI:minusDI)[event.index];if(!finite(value)||event.level===null)continue;
   markers.push({index:event.index,plot:'extremeHit',text:'Stop',tooltip:`Price ${bullish?'fell below':'rose above'} the extreme point ${fmt(event.level)}`,position:'price',price:value,direction:bullish?'down':'up'});continue;
  }
  const value=(bullish?plusDI:minusDI)[event.index];if(!finite(value))continue;
  const why=(bullish?'+DI crossed above -DI':'-DI crossed above +DI')+(event.filter!==null&&filter!=='Off'?`, ${filter} ${fmt(event.filter)}`:'')+(event.level!==null?`. Extreme point (reverse) ${fmt(event.level)}`:'');
  markers.push({index:event.index,plot:bullish?'bullCross':'bearCross',text:bullish?'Bull':'Bear',tooltip:why,position:'price',price:value,direction:bullish?'up':'down'});
 }
 // The level is drawn on the price pane (a price, not a DI value).
 if(showExtreme)for(const row of result.segments)lines.push({plot:'extremePoint',from:{index:row.from,price:row.level},to:{index:row.to,price:row.level},overlay:true});
 return {markers:markers.slice(-MARK_LIMIT),lines:lines.slice(-MARK_LIMIT)};
}

// ---- MACD divergence ----
export const MACD_DIVERGENCE_SERIES=['MACD line','Histogram'] as const;
/** MACD = EMA(fast) - EMA(slow); signal = EMA(MACD, signal); histogram = MACD - signal. EMAs are SMA-seeded, the MACD
 *  built-in convention (the MACD line starts on bar slow - 1, the signal signal - 1 bars later). */
export function macdSeries(tk:CatalogToolkit,source:readonly (number|null)[],fast:number,slow:number,signalLength:number):{macd:NumericSeries;signal:NumericSeries;histogram:NumericSeries}{
 const a=tk.emaSmaSeed(source,fast),b=tk.emaSmaSeed(source,slow),macd=a.map((value,i)=>{const other=b[i];return finite(value)&&finite(other)?value-other:null;});
 const line=tk.emaSmaSeed(macd,signalLength),histogram=macd.map((value,i)=>{const other=line[i];return finite(value)&&finite(other)?value-other:null;});
 return {macd,signal:line,histogram};
}
const MACD_DIV_KIND_INPUT:Readonly<Record<RsiDivergenceKind,string>>=Object.freeze({bullish:'regularBullish',bearish:'regularBearish',hiddenBullish:'hiddenBullish',hiddenBearish:'hiddenBearish'});

// ---- RSI failure swings ----
export interface FailureSwingEvent {side:'top'|'bottom';peakIndex:number;failureIndex:number;secondIndex:number;signalIndex:number;peak:number;failure:number;second:number}
export interface FailureSwingOptions {
 /** Minimum RSI points of the pullback from the first peak to the failure point and of the rally (decline) after it. */
 minSwing:number;
 /** ChartSchool variant: the second peak must not exceed overbought (a top) or fall below oversold (a bottom). */
 secondInside:boolean}
export const FAILURE_SWING_DEFAULTS:Readonly<FailureSwingOptions>=Object.freeze({minSwing:3,secondInside:false});
/**
 * J. W. Wilder, New Concepts in Technical Trading Systems (1978), RSI chapter. Failure swing top: the RSI rises above the
 * overbought level (70) to a peak, falls back to a trough (the failure point), rallies to a lower peak that fails to
 * exceed the first, then falls below the failure point; the signal is that bar. Bottom: the mirror below oversold (30).
 * Wilder's examples are clear swings (70, down to 58, then below 58), so swings are measured, not bar-to-bar ticks.
 * Causal state machine on closed bars (OpenCandle-defined details): the peak follows the RSI while it keeps rising. After
 * it the trough follows every new low; the failure point is fixed only once the pullback (peak to trough) and the rally
 * from the trough both reach Minimum swing points, so a dip that continues before the rally reaches it just lowers the
 * trough. A top's trough reaching the oversold level (a bottom's reaching overbought) ends the swing. A rise above the
 * first peak makes it the new first peak (the swing restarts); a value equal to the peak does not exceed it. With Second
 * peak must stay inside 70/30, a rally above overbought (a decline below oversold) does not count as the second peak: the
 * first peak is kept and the trough starts again from that bar.
 * Equal values never cross the failure point. A missing RSI resets the swing. The signal fires on the bar the RSI first
 * falls below (rises above) the fixed failure point, never earlier.
 */
export function rsiFailureSwings(rsi:readonly (number|null)[],overbought:number,oversold:number,options:FailureSwingOptions=FAILURE_SWING_DEFAULTS):{top:NumericSeries;bottom:NumericSeries;events:FailureSwingEvent[]}{
 const n=rsi.length,top=signal(n),bottom=signal(n),events:FailureSwingEvent[]=[],swing=Math.max(0,options.minSwing);
 for(const side of ['top','bottom'] as const){
  const out=side==='top'?top:bottom,sign=side==='top'?1:-1,level=sign*(side==='top'?overbought:oversold),floor=sign*(side==='top'?oversold:overbought);
  // Work on sign x RSI so the bottom is the top's mirror: 'up' always means toward the extreme.
  // Phases: 0 waiting, 1 rising to the peak, 2 trough forming (failure point not fixed), 3 failure point fixed.
  let phase:0|1|2|3=0,peak=0,peakAt=-1,trough=0,troughAt=-1,second=0,secondAt=-1;
  for(let i=0;i<n;i++){
   const raw=rsi[i];if(!finite(raw)){phase=0;continue;}
   out[i]=0;
   const r=sign*raw;
   if(phase!==0&&r>peak){phase=1;peak=r;peakAt=i;continue;}
   // Second peak must stay inside 70/30: a rally beyond the level does not count; the trough starts again from this bar.
   if(options.secondInside&&phase>=2&&r>level&&r>trough){phase=2;trough=r;troughAt=i;second=r;secondAt=i;continue;}
   if(phase===0){if(r>level){phase=1;peak=r;peakAt=i;}}
   else if(phase===1){if(r<peak){phase=2;trough=r;troughAt=i;second=r;secondAt=i;}else{peakAt=i;}}
   else if(phase===2){
    if(r<=trough){trough=r;troughAt=i;second=r;secondAt=i;}else if(r>second){second=r;secondAt=i;}
    if(!(trough>floor))phase=0;
    else if(peak-trough>=swing&&second-trough>=swing&&secondAt>troughAt)phase=3;
   }
   else{
    if(r<trough){out[i]=1;events.push({side,peakIndex:peakAt,failureIndex:troughAt,secondIndex:secondAt,signalIndex:i,peak:sign*peak,failure:sign*trough,second:sign*second});phase=0;}
    else if(r>second){second=r;secondAt=i;}
   }
  }
 }
 events.sort((a,b)=>a.signalIndex-b.signalIndex||(a.side==='top'?-1:1));
 return {top,bottom,events};
}
function failureSwingMarks(events:readonly FailureSwingEvent[],rsi:readonly (number|null)[]):{markers:PatternMarker[];lines:PatternLine[]}{
 const markers:PatternMarker[]=[],lines:PatternLine[]=[];
 for(const event of events){
  const plot=event.side==='top'?'fsTop':'fsBottom',value=rsi[event.signalIndex];if(!finite(value))continue;
  markers.push({index:event.signalIndex,plot,text:event.side==='top'?'FS top':'FS bottom',position:'price',price:value,direction:event.side==='top'?'down':'up',
   tooltip:`Failure swing ${event.side}: RSI ${event.side==='top'?'peak':'low'} ${fmt(event.peak)}, failure point ${fmt(event.failure)}, ${event.side==='top'?'lower peak':'higher low'} ${fmt(event.second)}, then ${event.side==='top'?'below':'above'} the failure point`});
  // The failure point level from the trough to the signal bar.
  lines.push({plot,from:{index:event.failureIndex,price:event.failure},to:{index:event.signalIndex,price:event.failure}});
 }
 return {markers:markers.slice(-MARK_LIMIT),lines:lines.slice(-MARK_LIMIT)};
}

const DIVERGENCE_INPUTS:readonly CatalogInput[]=[
 {key:'left',title:'Pivot lookback left',type:'int',defval:5,min:1,max:50,step:1},{key:'right',title:'Pivot lookback right',type:'int',defval:5,min:1,max:50,step:1},
 {key:'rangeMin',title:'Min bars between pivots',type:'int',defval:5,min:0,max:1000,step:1},{key:'rangeMax',title:'Max bars between pivots',type:'int',defval:60,min:1,max:1000,step:1},
 {key:'regularBullish',title:'Regular bullish',type:'bool',defval:true},{key:'regularBearish',title:'Regular bearish',type:'bool',defval:true},
 {key:'hiddenBullish',title:'Hidden bullish',type:'bool',defval:false},{key:'hiddenBearish',title:'Hidden bearish',type:'bool',defval:false},
 {key:'bodyOnly',title:'Candle body only',type:'bool',defval:false},
];

const definitions:readonly CatalogDefinition[]=[
 {id:'bbbreach',name:'Bollinger Bands breach',acronym:'BB Breach',overlay:true,pattern:'chart',linePlots:['basis','upper','lower'],
  keywords:['bollinger','bands','breach','outside','band tag','re-entry','reentry','close above upper band','close below lower band'],
  inputs:[{key:'length',title:'Length',defval:20,...LENGTH},{key:'multiplier',title:'StdDev',type:'float',defval:2,min:0.1,max:50,step:0.1},
   {key:'firstOnly',title:'First close outside only',type:'bool',defval:true},{key:'reentry',title:'Show re-entry markers',type:'bool',defval:false}],
  plots:[{id:'basis',label:'Basis',color:C.amber,width:1},{id:'upper',label:'Upper',color:C.blue,width:1},{id:'lower',label:'Lower',color:C.blue,width:1},
   {id:'aboveUpper',label:'Close above upper',color:C.down,width:1},{id:'belowLower',label:'Close below lower',color:C.up,width:1},
   {id:'reentryFromAbove',label:'Re-entry from above',color:C.pink,width:1},{id:'reentryFromBelow',label:'Re-entry from below',color:C.cyan,width:1}],
  band:'plots',fill:{color:C.blue,opacity:5},
  provenance:[{url:'public-indicator-definition:bollinger-on-bollinger-bands-2001',facts:'John Bollinger, Bollinger on Bollinger Bands (2001): middle band = 20-period simple moving average of the close; upper and lower bands = middle band plus and minus 2 population standard deviations of the same 20 closes. A close outside the bands is not in itself a buy or sell signal; tags of the bands are often continuation signals.'}],
  unknownDefaults:['First close outside only on, re-entry markers off, the re-entry rule (a close back at or inside the bands after a close outside) and the colors are OpenCandle-defined.','Bands use the close; Length 20 and StdDev 2 are the author defaults.'],
  policies:['A breach is a bar whose close is above the upper band (below the lower band); with First close outside only, the prior close must not have been outside on the same side. A re-entry is a close at or inside the bands after the prior close was outside. Each mark reads only its bar and the bar before, so a drawn mark never changes.','A close outside the bands is not a signal on its own (Bollinger); the marks describe where price closed relative to the bands.','The signal plots are 1 on the bar the condition is met, else 0; they are what alerts, the legend and the data window read. Show re-entry markers changes only the drawn markers. A window with a missing close is unavailable.'],
  calculate(ctx){
   const close=ctx.bars.map(bar=>finite(bar.close)?bar.close:null),bands=bollingerSeries(close,ctx.num('length'),ctx.num('multiplier')),series=bollingerBreach(close,bands.upper,bands.lower,ctx.bool('firstOnly'));
   ctx.marks?.({markers:bollingerMarkers(series,ctx.bool('reentry')),lines:[]});
   return {...bands,...series};},
  warmup:value=>value('length')+1,work:(count,value)=>count*(value('length')*2+8)},
 {id:'dicross',name:'DI cross signals',acronym:'DI Cross',overlay:false,pattern:'chart',linePlots:['plusDI','minusDI','adx','adxr'],
  keywords:['DI','DMI','directional movement','+DI','-DI','crossover','ADX','ADXR','extreme point','reverse point','stop and reverse','Wilder'],
  inputs:[{key:'diLength',title:'DI length',defval:14,...LENGTH},{key:'adxSmoothing',title:'ADX smoothing',defval:14,...LENGTH},
   // Saved instances keep the filter they had (ADX at 20); new ones get Wilder's ADXR at 25.
   {key:'trendFilter',title:'Trend filter',type:'string',defval:'ADXR',options:DI_TREND_FILTERS,legacyDefval:'ADX'},{key:'adxThreshold',title:'Trend filter threshold',type:'float',defval:25,min:0,max:100,step:1,legacyDefval:20},
   {key:'showExtreme',title:'Show extreme point (stop)',type:'bool',defval:true,legacyOmit:true},{key:'reverseAtExtreme',title:'Reverse at extreme point',type:'bool',defval:false,legacyOmit:true}],
  // Pre-fix inputs: the ADX on/off switch (now Trend filter ADX or Off) and the extreme point entry delay (retired: the
  // signal is always the crossing bar). Stored instances are rewritten on load; captured alerts still read them.
  retiredInputs:[{key:'adxFilter',title:'Require ADX at or above threshold',type:'bool',defval:true,replacedBy:'trendFilter'},{key:'extremePoint',title:'Extreme point rule',type:'bool',defval:true}],
  migrate(inputs){const out={...inputs};if(typeof out.adxFilter==='boolean'){if(!Object.hasOwn(out,'trendFilter'))out.trendFilter=out.adxFilter?'ADX':'Off';delete out.adxFilter;}delete out.extremePoint;return out;},
  plots:[{id:'plusDI',label:'+DI',color:C.up,width:1},{id:'minusDI',label:'-DI',color:C.down,width:1},{id:'adx',label:'ADX',color:C.amber,width:1,visible:false},{id:'adxr',label:'ADXR',color:C.pink,width:1,visible:false},
   {id:'bullCross',label:'Bullish DI cross',color:C.up,width:1},{id:'bearCross',label:'Bearish DI cross',color:C.down,width:1},
   {id:'extremePoint',label:'Extreme point',color:C.violet,width:1},{id:'extremeHit',label:'Extreme point hit',color:C.amber,width:1}],
  provenance:[{url:'public-indicator-definition:wilder-new-concepts-1978-directional-movement',facts:'J. Welles Wilder, New Concepts in Technical Trading Systems (1978), Directional Movement: +DI and -DI over 14 periods with Wilder smoothing; +DI crossing above -DI is the long signal and -DI crossing above +DI the short one, on the crossing day. Extreme point rule: the extreme price of the crossing day is the reverse point (the low of that day when long, the high when short); stay with it, if not stopped out, even when the indexes stay crossed against the position. The system is traded when ADXR is above 25 and not when it is below 20.'},
   {url:'public-indicator-definition:ta-lib-adxr',facts:'TA-Lib ADXR (ta_ADXR.c): ADXR = (ADX today + ADX of (period - 1) bars earlier) / 2.'}],
  unknownDefaults:['ADXR is (ADX + the ADX of ADX smoothing - 1 bars earlier) / 2, the TA-Lib placement; Wilder\'s text averages today\'s ADX with the one 14 days ago. Trend filter ADXR at 25 follows Wilder; checking it on the crossing bar, at or above the threshold, is OpenCandle-defined. The ADX and ADXR lines are hidden by default. Colors are OpenCandle-defined.',
   'OpenCandle-defined: after the extreme point is penetrated there is no level until the next qualifying cross (Wilder\'s always-in system would reverse there; Reverse at extreme point, off by default, starts the opposite level at the high or low of the hit bar). A filtered cross leaves the level in force unchanged. DI crosses saved before this rule keep their ADX filter and threshold.'],
  policies:['+DI, -DI and ADX are the Directional Movement Index built-in values (Wilder RMA smoothing).','A cross is a bar where +DI - -DI turns above 0 from 0 or below (bullish) or below 0 from 0 or above (bearish); the signal is that bar when the trend filter passes there. Each signal reads only its bar and earlier bars, so a drawn mark never changes.',
   'Extreme point is the low of the bullish crossing bar (high of the bearish one), drawn on the price pane from that bar; it holds until a later low falls below it (high rises above it), marked Stop with Extreme point hit = 1, or until the next qualifying cross starts a new level. Extreme point carries the level of each bar through its hit bar, so alerts can compare price with it.',
   'The signal plots are 1 on the signal bar, else 0; they are what alerts, the legend and the data window read. Show extreme point (stop) changes only the drawn level.'],
  calculate(ctx){
   const {bars,tk,num,str,bool,has}=ctx,dmi=directionalMovement(bars,tk,num('diLength'),num('adxSmoothing')),adxr=adxrSeries(dmi.adx,num('adxSmoothing'));
   // A captured pre-fix alert holds adxFilter instead of trendFilter.
   const filter=(!has('trendFilter')&&has('adxFilter')?(bool('adxFilter')?'ADX':'Off'):str('trendFilter')) as DiTrendFilter;
   const crosses=diCrossEvents(bars,dmi.plusDI,dmi.minusDI,filter==='ADX'?dmi.adx:adxr,{filter,threshold:num('adxThreshold'),reverseAtExtreme:bool('reverseAtExtreme')});
   ctx.marks?.(diCrossMarks(crosses,dmi.plusDI,dmi.minusDI,filter,bool('showExtreme')));
   return {plusDI:dmi.plusDI,minusDI:dmi.minusDI,adx:dmi.adx,adxr,bullCross:crosses.bull,bearCross:crosses.bear,extremePoint:crosses.extremePoint,extremeHit:crosses.extremeHit};},
  warmup:value=>value('diLength')+3*value('adxSmoothing')+2,work:count=>count*28},
 {id:'macddiv',name:'MACD divergence',acronym:'MACD Div',overlay:false,pattern:'chart',linePlots:['macd','signal','histogram'],
  keywords:['MACD','divergence','hidden divergence','regular divergence','Appel','pivot'],
  inputs:[{key:'fast',title:'Fast length',defval:12,...LENGTH},{key:'slow',title:'Slow length',defval:26,...LENGTH},{key:'signal',title:'Signal length',defval:9,...LENGTH},SOURCE,
   {key:'divergenceOn',title:'Divergence on',type:'string',defval:'MACD line',options:MACD_DIVERGENCE_SERIES},...DIVERGENCE_INPUTS],
  plots:[{id:'macd',label:'MACD',color:C.blue,width:1},{id:'signal',label:'Signal',color:C.amber,width:1},{id:'histogram',label:'Histogram',kind:'histogram',color:C.guide,width:1},
   {id:'bullish',label:RSI_DIVERGENCE_TITLES.bullish,color:C.up,width:2},{id:'bearish',label:RSI_DIVERGENCE_TITLES.bearish,color:C.down,width:2},
   {id:'hiddenBullish',label:RSI_DIVERGENCE_TITLES.hiddenBullish,color:C.cyan,width:2},{id:'hiddenBearish',label:RSI_DIVERGENCE_TITLES.hiddenBearish,color:C.pink,width:2}],
  guides:[{id:'zero',value:0,color:C.guide}],
  provenance:[{url:'public-indicator-definition:appel-technical-analysis-power-tools-2005',facts:'Gerald Appel, Technical Analysis: Power Tools for Active Investors (2005): MACD = 12-period EMA - 26-period EMA; signal = 9-period EMA of MACD; histogram = MACD - signal. A positive (bullish) divergence is a lower price low with a higher MACD low; a negative (bearish) divergence is a higher price high with a lower MACD high.'}],
  unknownDefaults:['The pivot and pairing rules are the OpenCandle RSI divergence rules (5 bars each side, compared pivots 5 to 60 bars apart, each pivot against the previous pivot of the same side), applied to the MACD line or the histogram. Hidden divergences (higher price low with a lower MACD low; lower price high with a higher MACD high) are OpenCandle-defined additions, off by default as on the RSI. Labels, lines and colors are OpenCandle-defined.'],
  policies:['A pivot needs Left bars on the left and Right bars on the right; a divergence is reported on the bar where the right confirmation completes, never earlier, and is drawn between the two oscillator pivots once confirmed. Equal values never qualify. Candle body only compares min/max(open, close) instead of the wick.','The signal plots are 1 on the confirmation bar, else 0; they are what alerts, the legend and the data window read. EMAs are SMA-seeded (the MACD built-in convention).'],
  calculate(ctx){
   const m=macdSeries(ctx.tk,ctx.source,ctx.num('fast'),ctx.num('slow'),ctx.num('signal')),osc=ctx.str('divergenceOn')==='Histogram'?m.histogram:m.macd;
   const policy:RsiDivergencePolicy={left:ctx.num('left'),right:ctx.num('right'),minBetween:ctx.num('rangeMin'),maxBetween:ctx.num('rangeMax')};
   if(policy.minBetween>policy.maxBetween)throw new Error('Min bars between pivots must not exceed Max bars between pivots.');
   const kinds=RSI_DIVERGENCE_KINDS.filter(kind=>ctx.bool(MACD_DIV_KIND_INPUT[kind])),found=oscillatorDivergence(osc,ctx.bars,policy,{kinds,bodyOnly:ctx.bool('bodyOnly')},'MACD');
   const n=ctx.bars.length,out:Record<string,NumericSeries>={macd:m.macd.map(v=>finite(v)?zero(v):null),signal:m.signal,histogram:m.histogram};
   for(const kind of RSI_DIVERGENCE_KINDS){const values=signal(n);for(let i=0;i<n;i++)if(finite(osc[i]))values[i]=found[kind][i]!==null?1:0;out[kind]=values;}
   const markers:PatternMarker[]=[],lines:PatternLine[]=[];
   for(const row of found.segments){
    lines.push({plot:row.kind,from:{index:row.fromIndex,price:row.fromRsi},to:{index:row.toIndex,price:row.toRsi}});
    markers.push({index:row.toIndex,plot:row.kind,text:RSI_DIVERGENCE_LABELS[row.kind],tooltip:`${RSI_DIVERGENCE_TITLES[row.kind]} (confirmed ${policy.right} bars after the pivot)`,position:'price',price:row.toRsi,direction:row.kind==='bullish'||row.kind==='hiddenBullish'?'up':'down'});
   }
   ctx.marks?.({markers:markers.slice(-MARK_LIMIT),lines:lines.slice(-MARK_LIMIT)});
   return out;},
  warmup:value=>value('slow')+value('signal')+value('left')+value('right'),work:(count,value)=>count*(24+(value('left')+value('right')+1)*2)},
 {id:'rsifs',name:'RSI failure swings',acronym:'RSI FS',overlay:false,pattern:'chart',linePlots:['rsi'],sourceSeries:true,
  keywords:['RSI','failure swing','failure point','Wilder','top','bottom','swing'],
  inputs:[{key:'length',title:'Length',defval:14,...LENGTH},SOURCE,{key:'overbought',title:'Overbought',type:'float',defval:70,min:0,max:100,step:1},{key:'oversold',title:'Oversold',type:'float',defval:30,min:0,max:100,step:1},
   {key:'minSwing',title:'Minimum swing (RSI points)',type:'float',defval:FAILURE_SWING_DEFAULTS.minSwing,min:0,max:100,step:0.5,legacyOmit:true},{key:'secondInside',title:'Second peak must stay inside 70/30',type:'bool',defval:FAILURE_SWING_DEFAULTS.secondInside,legacyOmit:true}],
  plots:[{id:'rsi',label:'RSI',color:C.violet,width:1},{id:'fsTop',label:'Failure swing top',color:C.down,width:1},{id:'fsBottom',label:'Failure swing bottom',color:C.up,width:1}],
  guides:[{id:'upper',value:70,color:C.guide},{id:'lower',value:30,color:C.guide}],band:'guides',fill:{color:C.violet,opacity:5},
  provenance:[{url:'public-indicator-definition:wilder-new-concepts-1978-rsi',facts:'J. Welles Wilder, New Concepts in Technical Trading Systems (1978), Relative Strength Index: 14 periods, overbought 70 and oversold 30. Failure swing top: the RSI goes above 70, falls back, rallies to a peak that fails to exceed the previous peak, then falls below the low of the decline (the failure point). Failure swing bottom: the mirror below 30. His worked example is a clear swing: RSI 70, a down swing to 58, small swings that do not break the high, then 58 penetrated.'},
   {url:'public-indicator-definition:chartschool-rsi-failure-swing',facts:'StockCharts ChartSchool, Relative Strength Index: a bearish failure swing is RSI above 70, a pullback, a bounce that fails to exceed 70, then a break of the pullback low (the bullish one mirrors it below 30).'}],
  unknownDefaults:['OpenCandle-defined: Minimum swing 3 RSI points for the pullback to the failure point and for the rally (decline) after it, so a one-bar wiggle is not a swing; the failure point of a top must stay above the oversold level and that of a bottom below overbought; a rally that exceeds the first peak restarts the swing from the new peak; a missing RSI resets the swing; the failure-point line and colors.','Second peak must stay inside 70/30 is the ChartSchool reading, off by default (Wilder requires only that the second peak does not exceed the first).'],
  policies:['The RSI is the RSI built-in value (Wilder RMA smoothing). The signal fires on the bar the RSI first closes below the failure point (top) or above it (bottom), never earlier, so a drawn mark never changes.','The failure point is fixed once the pullback from the first peak and the rally from the trough (decline, for a bottom) both reach Minimum swing points; until then a lower RSI just lowers the trough. A top whose trough reaches the oversold level (a bottom reaching overbought) is dropped.','The signal plots are 1 on the signal bar, else 0; they are what alerts, the legend and the data window read. The Overbought and Oversold inputs set the signal levels; the guide lines are set on the Style tab.'],
  calculate(ctx){
   if(ctx.num('oversold')>=ctx.num('overbought'))throw new Error('Oversold must be below Overbought.');
   const r=ctx.tk.rsi(ctx.source,ctx.num('length')),swings=rsiFailureSwings(r,ctx.num('overbought'),ctx.num('oversold'),{minSwing:ctx.num('minSwing'),secondInside:ctx.bool('secondInside')});
   ctx.marks?.(failureSwingMarks(swings.events,r));
   return {rsi:r,fsTop:swings.top,fsBottom:swings.bottom};},
  warmup:value=>value('length')+1,work:count=>count*16},
];
export const SIGNALS_INDICATORS:readonly CatalogDefinition[]=definitions;
