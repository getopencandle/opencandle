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
export interface DiCrossOptions {adxFilter:boolean;adxThreshold:number;extremePoint:boolean}
export interface DiCrossEvent {side:'bull'|'bear';crossIndex:number;signalIndex:number;level:number|null;adx:number|null}
/**
 * J. W. Wilder, New Concepts in Technical Trading Systems (1978), Directional Movement chapter: +DI crossing above -DI is
 * the long signal and -DI crossing above +DI the short one. Extreme point rule: on the crossover bar note its high (bull)
 * or low (bear); the cross counts only once a later bar's high exceeds that high (low falls below that low). Wilder holds the
 * extreme point until price exceeds it or the DIs cross back, so an opposite cross cancels a waiting one.
 * A cross is a bar where +DI - -DI turns above 0 from 0 or below (bull) or below 0 from 0 or above (bear), both DIs present
 * on the bar and the bar before. ADX filter (OpenCandle-defined placement): the ADX on the crossover bar must be at or
 * above the threshold (a missing ADX fails it). With the extreme point rule off the signal is the crossover bar itself.
 */
export function diCrossEvents(bars:readonly Bar[],plusDI:readonly (number|null)[],minusDI:readonly (number|null)[],adx:readonly (number|null)[],options:DiCrossOptions):{bull:NumericSeries;bear:NumericSeries;events:DiCrossEvent[]}{
 const n=bars.length,bull=signal(n),bear=signal(n),events:DiCrossEvent[]=[];
 let pendingBull:{cross:number;level:number;adx:number|null}|null=null,pendingBear:{cross:number;level:number;adx:number|null}|null=null;
 for(let i=0;i<n;i++){
  const p=plusDI[i],m=minusDI[i];if(!finite(p)||!finite(m))continue;
  bull[i]=0;bear[i]=0;
  // A waiting cross fires on a later bar whose high (low) breaks the crossover bar's extreme.
  const high=bars[i].high,low=bars[i].low;
  if(pendingBull&&finite(high)&&high>pendingBull.level){bull[i]=1;events.push({side:'bull',crossIndex:pendingBull.cross,signalIndex:i,level:pendingBull.level,adx:pendingBull.adx});pendingBull=null;}
  if(pendingBear&&finite(low)&&low<pendingBear.level){bear[i]=1;events.push({side:'bear',crossIndex:pendingBear.cross,signalIndex:i,level:pendingBear.level,adx:pendingBear.adx});pendingBear=null;}
  const pp=i?plusDI[i-1]:null,pm=i?minusDI[i-1]:null;if(!finite(pp)||!finite(pm))continue;
  const up=p-m>0&&pp-pm<=0,down=p-m<0&&pp-pm>=0;if(!up&&!down)continue;
  // Any cross cancels a waiting cross of the other side, whether or not it passes the ADX filter.
  if(up)pendingBear=null;if(down)pendingBull=null;
  const a=adx[i],strong=!options.adxFilter||finite(a)&&a>=options.adxThreshold;if(!strong)continue;
  const level=up?high:low,adxAt=finite(a)?a:null;
  if(!options.extremePoint){if(up){bull[i]=1;events.push({side:'bull',crossIndex:i,signalIndex:i,level:null,adx:adxAt});}else{bear[i]=1;events.push({side:'bear',crossIndex:i,signalIndex:i,level:null,adx:adxAt});}continue;}
  if(!finite(level))continue;
  if(up)pendingBull={cross:i,level,adx:adxAt};else pendingBear={cross:i,level,adx:adxAt};
 }
 return {bull,bear,events};
}
function diCrossMarks(events:readonly DiCrossEvent[],plusDI:readonly (number|null)[],minusDI:readonly (number|null)[]):{markers:PatternMarker[];lines:PatternLine[]}{
 const markers:PatternMarker[]=[];
 for(const event of events){
  const bullish=event.side==='bull',value=(bullish?plusDI:minusDI)[event.signalIndex];if(!finite(value))continue;
  const why=(bullish?'+DI crossed above -DI':'-DI crossed above +DI')+(event.adx!==null?`, ADX ${fmt(event.adx)}`:'')+(event.level!==null?`; price ${bullish?'exceeded the high':'fell below the low'} of the crossover bar (${fmt(event.level)})`:'');
  markers.push({index:event.signalIndex,plot:bullish?'bullCross':'bearCross',text:bullish?'Bull':'Bear',tooltip:why,position:'price',price:value,direction:bullish?'up':'down'});
 }
 return {markers:markers.slice(-MARK_LIMIT),lines:[]};
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
/**
 * J. W. Wilder, New Concepts in Technical Trading Systems (1978), RSI chapter. Failure swing top: the RSI rises above the
 * overbought level (70) to a peak, falls back to a trough (the failure point), rallies to a lower peak that fails to
 * exceed the first, then falls below the failure point; the signal is that bar. Bottom: the mirror below oversold (30).
 * Causal state machine on closed bars (OpenCandle-defined details): the peak follows the RSI while it keeps rising; the
 * first lower bar starts the decline and the failure point follows it down; the first higher bar starts the rally. A rally
 * that exceeds the first peak makes it the new first peak (the swing restarts); a close at or above an unchanged peak counts
 * as exceeding only when strictly higher. Equal values never cross the failure point. A missing RSI resets the swing.
 * The signal fires on the bar the RSI first falls below (rises above) the failure point, never earlier.
 */
export function rsiFailureSwings(rsi:readonly (number|null)[],overbought:number,oversold:number):{top:NumericSeries;bottom:NumericSeries;events:FailureSwingEvent[]}{
 const n=rsi.length,top=signal(n),bottom=signal(n),events:FailureSwingEvent[]=[];
 for(const side of ['top','bottom'] as const){
  const out=side==='top'?top:bottom,sign=side==='top'?1:-1,level=side==='top'?overbought:oversold;
  // Work on sign x RSI so the bottom is the top's mirror: 'up' always means toward the extreme.
  let phase:0|1|2|3=0,peak=0,peakAt=-1,trough=0,troughAt=-1,second=0,secondAt=-1;
  for(let i=0;i<n;i++){
   const raw=rsi[i];if(!finite(raw)){phase=0;continue;}
   if(side==='top')top[i]=0;else bottom[i]=0;
   const r=sign*raw;
   if(phase===0){if(r>sign*level){phase=1;peak=r;peakAt=i;}}
   else if(phase===1){if(r>=peak){peak=r;peakAt=i;}else{phase=2;trough=r;troughAt=i;}}
   else if(phase===2){if(r<=trough){trough=r;troughAt=i;}else if(r>peak){phase=1;peak=r;peakAt=i;}else{phase=3;second=r;secondAt=i;}}
   else{
    if(r>peak){phase=1;peak=r;peakAt=i;}
    else if(r<trough){out[i]=1;events.push({side,peakIndex:peakAt,failureIndex:troughAt,secondIndex:secondAt,signalIndex:i,peak:sign*peak,failure:sign*trough,second:sign*second});phase=0;}
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
  inputs:[{key:'length',title:'Length',defval:20,...LENGTH},{key:'multiplier',title:'StdDev',type:'float',defval:2,min:0.001,max:50,step:0.5},
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
 {id:'dicross',name:'DI cross signals',acronym:'DI Cross',overlay:false,pattern:'chart',linePlots:['plusDI','minusDI','adx'],
  keywords:['DI','DMI','directional movement','+DI','-DI','crossover','ADX','extreme point','Wilder'],
  inputs:[{key:'diLength',title:'DI length',defval:14,...LENGTH},{key:'adxSmoothing',title:'ADX smoothing',defval:14,...LENGTH},
   {key:'adxFilter',title:'Require ADX at or above threshold',type:'bool',defval:true},{key:'adxThreshold',title:'ADX threshold',type:'float',defval:20,min:0,max:100,step:1},
   {key:'extremePoint',title:'Extreme point rule',type:'bool',defval:true}],
  plots:[{id:'plusDI',label:'+DI',color:C.up,width:1},{id:'minusDI',label:'-DI',color:C.down,width:1},{id:'adx',label:'ADX',color:C.amber,width:1,visible:false},
   {id:'bullCross',label:'Bullish DI cross',color:C.up,width:1},{id:'bearCross',label:'Bearish DI cross',color:C.down,width:1}],
  provenance:[{url:'public-indicator-definition:wilder-new-concepts-1978-directional-movement',facts:'J. Welles Wilder, New Concepts in Technical Trading Systems (1978), Directional Movement: +DI and -DI over 14 periods with Wilder smoothing; +DI crossing above -DI is the long signal and -DI crossing above +DI the short one. Extreme point rule: on the crossover day note the high (long) or low (short) and act only when price exceeds that point; the point is held until price exceeds it or the DIs cross again.'}],
  unknownDefaults:['The ADX filter (on, threshold 20) and checking it on the crossover bar are OpenCandle-defined; Wilder also uses ADX to judge trend strength. The ADX line is hidden by default. Colors are OpenCandle-defined.','On closed bars the extreme point is exceeded when a later bar\'s high is above the crossover bar\'s high (low below its low); an opposite cross cancels a waiting one (OpenCandle-defined reading of the rule).'],
  policies:['+DI, -DI and ADX are the Directional Movement Index built-in values (Wilder RMA smoothing).','A cross is a bar where +DI - -DI turns above 0 from 0 or below (bullish) or below 0 from 0 or above (bearish). With the extreme point rule on, the signal is the first later bar that breaks the crossover bar\'s high (low), unless the DIs cross back first. Each signal reads only its bar and earlier bars, so a drawn mark never changes.','The signal plots are 1 on the signal bar, else 0; they are what alerts, the legend and the data window read.'],
  calculate(ctx){
   const dmi=directionalMovement(ctx.bars,ctx.tk,ctx.num('diLength'),ctx.num('adxSmoothing')),crosses=diCrossEvents(ctx.bars,dmi.plusDI,dmi.minusDI,dmi.adx,{adxFilter:ctx.bool('adxFilter'),adxThreshold:ctx.num('adxThreshold'),extremePoint:ctx.bool('extremePoint')});
   ctx.marks?.(diCrossMarks(crosses.events,dmi.plusDI,dmi.minusDI));
   return {plusDI:dmi.plusDI,minusDI:dmi.minusDI,adx:dmi.adx,bullCross:crosses.bull,bearCross:crosses.bear};},
  warmup:value=>value('diLength')+2*value('adxSmoothing')+2,work:count=>count*24},
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
  inputs:[{key:'length',title:'Length',defval:14,...LENGTH},SOURCE,{key:'overbought',title:'Overbought',type:'float',defval:70,min:0,max:100,step:1},{key:'oversold',title:'Oversold',type:'float',defval:30,min:0,max:100,step:1}],
  plots:[{id:'rsi',label:'RSI',color:C.violet,width:1},{id:'fsTop',label:'Failure swing top',color:C.down,width:1},{id:'fsBottom',label:'Failure swing bottom',color:C.up,width:1}],
  guides:[{id:'upper',value:70,color:C.guide},{id:'lower',value:30,color:C.guide}],band:'guides',fill:{color:C.violet,opacity:5},
  provenance:[{url:'public-indicator-definition:wilder-new-concepts-1978-rsi',facts:'J. Welles Wilder, New Concepts in Technical Trading Systems (1978), Relative Strength Index: 14 periods, overbought 70 and oversold 30. Failure swing top: the RSI goes above 70, falls back, rallies to a peak that fails to exceed the previous peak, then falls below the low of the decline (the failure point). Failure swing bottom: the mirror below 30.'}],
  unknownDefaults:['Turns are bar-to-bar changes of the RSI; a rally that exceeds the first peak restarts the swing from the new peak; a missing RSI resets the swing; the failure-point line and colors are OpenCandle-defined.'],
  policies:['The RSI is the RSI built-in value (Wilder RMA smoothing). The signal fires on the bar the RSI first closes below the failure point (top) or above it (bottom), never earlier, so a drawn mark never changes.','The signal plots are 1 on the signal bar, else 0; they are what alerts, the legend and the data window read. The Overbought and Oversold inputs set the signal levels; the guide lines are set on the Style tab.'],
  calculate(ctx){
   if(ctx.num('oversold')>=ctx.num('overbought'))throw new Error('Oversold must be below Overbought.');
   const r=ctx.tk.rsi(ctx.source,ctx.num('length')),swings=rsiFailureSwings(r,ctx.num('overbought'),ctx.num('oversold'));
   ctx.marks?.(failureSwingMarks(swings.events,r));
   return {rsi:r,fsTop:swings.top,fsBottom:swings.bottom};},
  warmup:value=>value('length')+1,work:count=>count*16},
];
export const SIGNALS_INDICATORS:readonly CatalogDefinition[]=definitions;
