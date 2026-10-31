import type {Bar,NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {parseInterval,STANDARD_INTERVALS} from '../intervals';
import {chartBarEnd} from '../indicator-resample';
import {pivotPeriodKey,type PivotTimeframe} from './r23-catalog';

/** Clean-room implementations from public indicator definitions. */
export const R40_VOLUME_INDICATOR_IDS=['updownvolume','volumedelta','cvd','visibleavg'] as const;
export type R40VolumeIndicatorId=typeof R40_VOLUME_INDICATOR_IDS[number];
const DAY=86400,finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const GREEN='#089981',RED='#f23645',BLUE='#2962ff',GREY='#787b86';
const SOURCE:CatalogInput={key:'source',title:'Source',type:'string',defval:'close',options:['open','high','low','close','hl2','hlc3','ohlc4']};
const CUSTOM:CatalogInput={key:'useCustomTimeframe',title:'Use custom timeframe',type:'bool',defval:false};
const TIMEFRAME:CatalogInput={key:'timeframe',title:'Timeframe',type:'string',defval:'1m',options:STANDARD_INTERVALS.filter(row=>row.kind==='time').map(row=>row.id)};
const UNKNOWN='Colors, widths, the initial 1m custom choice, anchor default Day and source default Close are OpenCandle defaults; their reference values have not been observed.';
const UPDOWN='public-indicator-definition:up-down-volume';
const DELTA='public-indicator-definition:volume-delta';
const CVD='public-indicator-definition:cumulative-volume-delta';
const VISIBLE='public-indicator-definition:visible-average-price';

function duration(resolution:string):number{
 const spec=parseInterval(resolution);if(spec.kind!=='time')throw new Error('Intrabar volume needs a time-based chart.');
 return spec.seconds??spec.multiplier*(spec.unit==='day'?DAY:spec.unit==='week'?7*DAY:28*DAY);
}
/** Public automatic ladder: second charts 1s, minute/hour charts 1m, daily 5m, longer 60m. */
export function volumeDeltaInterval(resolution:string|null|undefined,custom=false,timeframe='1m'):string{
 if(typeof resolution!=='string')throw new Error('Intrabar volume needs a declared time-based chart interval.');
 const chart=parseInterval(resolution);if(chart.kind!=='time')throw new Error('Intrabar volume needs a time-based chart.');
 const interval=custom?parseInterval(timeframe).id:chart.unit==='second'?'1s':chart.unit==='minute'?'1m':chart.unit==='day'?'5m':'60m';
 if(parseInterval(interval).kind!=='time'||duration(interval)>duration(resolution))throw new Error('Choose an intrabar timeframe at or below the chart interval.');
 return interval;
}
export function isIntradayResolution(resolution:string|null|undefined):boolean{
 try{const spec=typeof resolution==='string'?parseInterval(resolution):null;return spec?.kind==='time'&&(spec.unit==='second'||spec.unit==='minute');}catch{return false;}
}
function validRows(rows:readonly Bar[],volume:boolean):void{
 if(!Array.isArray(rows)||rows.length>100000)throw new Error('Indicator history must contain at most 100000 bars.');
 for(let i=0;i<rows.length;i++){
  const row=rows[i];if(!row||!Number.isSafeInteger(row.time)||i>0&&row.time<=rows[i-1].time||![row.open,row.high,row.low,row.close].every(finite)||row.high<Math.max(row.open,row.close)||row.low>Math.min(row.open,row.close)||volume&&(!finite(row.volume)||row.volume<0))throw new Error('Intrabar history needs ordered finite prices and available nonnegative volume.');
 }
}
function lookupRows(ctx:CatalogContext,interval:string,label:'intrabar'|'daily'):readonly Bar[]|null{
 if(label==='intrabar'&&ctx.chart?.lowerTimeframe){
  const loaded=ctx.chart.lowerTimeframe;let match=false;try{match=parseInterval(loaded.interval).id===interval;}catch{/* An invalid loaded interval never substitutes for the requested one. */}
  if(match&&loaded.bars.length){validRows(loaded.bars,true);return loaded.bars;}
 }
 const found=ctx.chart?.finerBars?.(interval);
 if(found?.state==='ready'&&found.bars?.length){validRows(found.bars,label==='intrabar');return found.bars;}
 if(found?.state==='loading')ctx.diagnostic?.(label==='daily'?'Loading daily history for the 52-week range. Values wait for the daily bars.':`Loading ${interval} bars for intrabar volume. Values wait for the required bars.`);
 else ctx.diagnostic?.(label==='daily'?'Daily history is unavailable for the 52-week range. Load daily bars for this symbol.':'Intrabar data is unavailable. Load bars at the selected lower timeframe for this symbol.');
 return null;
}
const blanks=(count:number,keys:readonly string[]):Record<string,NumericSeries>=>Object.fromEntries(keys.map(key=>[key,Array(count).fill(null)]));
function chartEnd(bars:readonly Bar[],index:number,resolution:string):number{
 const end=chartBarEnd(bars[index].time,parseInterval(resolution));
 return Math.min(end,bars[index+1]?.time??Infinity);
}
function anchorKey(ctx:CatalogContext,time:number):string|null{
 const periods:Record<string,PivotTimeframe>={Day:'Daily',Week:'Weekly',Month:'Monthly',Year:'Yearly'};
 const resolution=ctx.chart?.resolution,spec=typeof resolution==='string'?parseInterval(resolution):null;
 return pivotPeriodKey(time,periods[ctx.str('anchor')],ctx.chart?.calendar??'utc',spec?.unit==='day'||spec?.unit==='week'||spec?.unit==='month');
}
/** No chart-bar fallback. Each chart bucket uses the available real intrabars; absent buckets stay gaps. */
function intrabarVolume(ctx:CatalogContext,kind:'updownvolume'|'volumedelta'|'cvd'):Record<string,NumericSeries>{
 const out=blanks(ctx.bars.length,kind==='updownvolume'?['up','down','delta']:['open','high','low','close']);
 if(!ctx.bars.length)return out;
 const interval=volumeDeltaInterval(ctx.chart?.resolution,ctx.bool('useCustomTimeframe'),ctx.str('timeframe'));
 const rows=lookupRows(ctx,interval,'intrabar');if(!rows)return out;
 const fineSpec=parseInterval(interval),signed:(number|null)[]=[],updown:(number|null)[]=[];let sign:number|null=null;
 for(let i=0;i<rows.length;i++){
  const row=rows[i],prior=rows[i-1];
  if(row.close>row.open)sign=1;else if(row.close<row.open)sign=-1;
  else if(prior&&row.close>prior.close)sign=1;else if(prior&&row.close<prior.close)sign=-1;
  signed.push(sign===null?null:sign*row.volume);
  // An unchanged intrabar carries the previous direction (the tick rule's zero tick, Lee and Ready 1991), the same
  // classification Volume delta and CVD use, so Up/Down volume and Volume delta agree on every intrabar.
  updown.push(sign===null?null:sign*row.volume);
 }
 let cursor=0,total=0,period:string|null|undefined,unknown=false,missing=0;
 for(let index=0;index<ctx.bars.length;index++){
  const start=ctx.bars[index].time,end=chartEnd(ctx.bars,index,ctx.chart!.resolution!);
  if(kind==='cvd'){const next=anchorKey(ctx,start);if(next!==period){total=0;unknown=false;period=next;}}
  while(cursor<rows.length&&rows[cursor].time<start)cursor++;
  let positive=0,negative=0,delta=0,high=0,low=0,count=0,unusable=false;
  while(cursor<rows.length&&rows[cursor].time<end){
   const i=cursor++,row=rows[i];
   if(chartBarEnd(row.time,fineSpec)>end){unusable=true;continue;}
   const value=kind==='updownvolume'?updown[i]:signed[i];if(value===null){unusable=true;continue;}
   count++;if(value>=0)positive+=value;else negative+=value;
   delta+=value;high=Math.max(high,delta);low=Math.min(low,delta);
   if(![positive,negative,delta].every(finite))throw new Error('Intrabar volume accumulation overflowed; values are unavailable.');
  }
  if(!count||unusable){missing++;if(kind==='cvd')unknown=true;continue;}
  if(kind==='updownvolume'){out.up[index]=positive;out.down[index]=negative===0?0:negative;out.delta[index]=delta===0?0:delta;continue;}
  if(kind==='cvd'&&unknown)continue;
  const base=kind==='cvd'?total:0,close=base+delta,hi=base+high,lo=base+low;
  if(![close,hi,lo].every(finite))throw new Error('Cumulative volume arithmetic overflowed; values are unavailable.');
  out.open[index]=base;out.high[index]=hi;out.low[index]=lo;out.close[index]=close;total=close;
 }
 if(missing)ctx.diagnostic?.(`${missing} chart bar${missing===1?' has':'s have'} no intrabar coverage or an unresolved intrabar direction. Values remain unavailable${kind==='cvd'?' until the next anchor after a gap':''}.`);
 return out;
}
function visibleAverage(ctx:CatalogContext):Record<string,NumericSeries>{
 const range=ctx.chart?.visibleRange,inside=ctx.bars.map(row=>!range||row.time>=range.from&&row.time<=range.to),values=ctx.source.filter((_,i)=>inside[i]);
 if(!values.length)return {average:Array(ctx.bars.length).fill(null)};
 if(!values.every(finite))throw new Error('Visible average price requires a finite visible source value for every visible bar.');
 // Reuse the compensated/exact SMA kernel, preserving finite means even when a naive sum overflows.
 const average=ctx.tk.sma(values,values.length).at(-1);if(!finite(average))throw new Error('Visible average price arithmetic overflowed.');
 return {average:inside.map(shown=>shown?average===0?0:average:null)};
}

/** Intraday 52-week range: completed daily history plus the observed current chart day, never the future daily close. */
export function intradayWeeklyRange(ctx:CatalogContext):Record<string,NumericSeries>{
 const out=blanks(ctx.bars.length,['high','low']);if(!ctx.bars.length)return out;
 const daily=lookupRows(ctx,'1D','daily');if(!daily)return out;
 const calendar=ctx.chart?.calendar??'utc',date=(time:number,isDaily:boolean)=>{
  const key=pivotPeriodKey(time,'Daily',calendar,isDaily);if(key===null)throw new Error('Daily history has an invalid calendar date.');
  const [year,month,day]=key.split('-').map(Number);const result=new Date(0);result.setUTCFullYear(year,month,day);result.setUTCHours(0,0,0,0);return result.getTime()/1000;
 };
 const close=ctx.str('extremes')==='Close',span=ctx.num('weeks')*7*DAY,first=daily[0].time;
 const days=daily.map(row=>date(row.time,true)),maxQ:number[]=[],minQ:number[]=[];let highHead=0,lowHead=0,cursor=0,dayKey:number|undefined,currentHigh=-Infinity,currentLow=Infinity;
 for(let index=0;index<ctx.bars.length;index++){
  const bar=ctx.bars[index],day=date(bar.time,false),cutoff=bar.time-span;
  while(cursor<daily.length&&days[cursor]<day){
   const row=daily[cursor],h=close?row.close:row.high,l=close?row.close:row.low;
   while(maxQ.length>highHead&&(close?daily[maxQ.at(-1)!].close:daily[maxQ.at(-1)!].high)<=h)maxQ.pop();
   while(minQ.length>lowHead&&(close?daily[minQ.at(-1)!].close:daily[minQ.at(-1)!].low)>=l)minQ.pop();
   maxQ.push(cursor);minQ.push(cursor);cursor++;
  }
  while(highHead<maxQ.length&&daily[maxQ[highHead]].time<=cutoff)highHead++;
  while(lowHead<minQ.length&&daily[minQ[lowHead]].time<=cutoff)lowHead++;
  if(day!==dayKey){dayKey=day;currentHigh=-Infinity;currentLow=Infinity;}
  if(close){currentHigh=bar.close;currentLow=bar.close;}else{currentHigh=Math.max(currentHigh,bar.high);currentLow=Math.min(currentLow,bar.low);}
  if(first>cutoff+DAY||highHead>=maxQ.length||lowHead>=minQ.length)continue;
  const high=Math.max(currentHigh,close?daily[maxQ[highHead]].close:daily[maxQ[highHead]].high),low=Math.min(currentLow,close?daily[minQ[lowHead]].close:daily[minQ[lowHead]].low);
  if(!finite(high)||!finite(low))throw new Error('Daily range needs finite chart and history prices.');
  out.high[index]=high;out.low[index]=low;
 }
 return out;
}
const PLOTS=[{id:'open',label:'Open',color:GREEN,width:1},{id:'high',label:'High',color:GREEN,width:1},{id:'low',label:'Low',color:RED,width:1},{id:'close',label:'Close',color:GREEN,width:1}] as const;
const POLICY='Uses actual source bars at the selected interval, without a chart-volume approximation. A chart bucket with no intrabars is unavailable. Sparse intrabars represent only the available observations; exchange completeness is unknown. Day, week and month completion follows the existing UTC calendar policy; exchange-session and DST bar anchors are not inferred. The next actual chart bar can shorten a bucket.';
const CANDLE_POLICY='Displayed as OHLC candles. An unchanged intrabar close inherits its predecessor\'s direction; an unresolved first doji stays unavailable.';
export const R40_VOLUME_INDICATORS:readonly CatalogDefinition[]=Object.freeze([
 {id:'updownvolume',name:'Up/Down volume',acronym:'Up/Down Vol',overlay:false,requiresVolume:true,finerBars:true,
  inputs:[CUSTOM,TIMEFRAME],plots:[{id:'up',label:'Up volume',kind:'histogram',color:GREEN,width:2},{id:'down',label:'Down volume',kind:'histogram',color:RED,width:2},{id:'delta',label:'Delta',kind:'cross',color:BLUE,width:2}],guides:[{id:'zero',value:0,color:GREY}],
  provenance:[{url:UPDOWN,facts:'Intrabar volume classified by open/close and previous close; up above zero, down below zero; difference shown as Delta. Automatic intrabar ladder and custom timeframe inputs.'}],unknownDefaults:[UNKNOWN],
  policies:[POLICY,'An unchanged intrabar compares with the previous close; equal closes carry the previous direction (the tick rule), as in Volume delta. Delta is drawn as a short horizontal notch in the prevailing volume color; its half-bar width is an OpenCandle geometry choice.'],
  calculate:ctx=>intrabarVolume(ctx,'updownvolume'),warmup:()=>1,work:count=>count*48+3200000},
 {id:'volumedelta',name:'Volume delta',acronym:'Vol Delta',overlay:false,requiresVolume:true,finerBars:true,volumeDelta:true,inputs:[CUSTOM,TIMEFRAME],plots:PLOTS,
  provenance:[{url:DELTA,facts:'Intrabar signed volume accumulates from zero on each chart bar. The path produces open, high, low and close; unchanged intrabar close carries its predecessor direction.'}],unknownDefaults:[UNKNOWN],policies:[POLICY,CANDLE_POLICY],
  calculate:ctx=>intrabarVolume(ctx,'volumedelta'),warmup:()=>1,work:count=>count*48+3200000},
 {id:'cvd',name:'Cumulative volume delta',acronym:'CVD',overlay:false,requiresVolume:true,finerBars:true,volumeDelta:true,
  inputs:[{key:'anchor',title:'Anchor period',type:'string',defval:'Day',options:['Day','Week','Month','Year']},CUSTOM,TIMEFRAME],plots:PLOTS,
  provenance:[{url:CVD,facts:'Signed intrabar volume accumulates across chart bars, resets at each anchor period and is presented as OHLC candles.'}],unknownDefaults:[UNKNOWN],
  policies:[POLICY,CANDLE_POLICY,'Anchor periods use the declared chart calendar (New York US equities, UTC otherwise). Accumulation starts at the first loaded chart bar; an absent bucket makes the remaining anchor unavailable.'],
  calculate:ctx=>intrabarVolume(ctx,'cvd'),warmup:()=>1,work:count=>count*56+3200000},
 {id:'visibleavg',name:'Visible average price',acronym:'Visible Avg',overlay:true,viewport:true,sourceSeries:true,inputs:[SOURCE],plots:[{id:'average',label:'Avg price',color:BLUE,width:2}],
  provenance:[{url:VISIBLE,facts:'Mean of the chosen source over the bars currently visible on the chart, recalculated after a pan or zoom.'}],unknownDefaults:[UNKNOWN],
  policies:['A bar is included when its open timestamp lies within the visible bounds, inclusive (OpenCandle edge policy). The arithmetic mean is drawn on those bars. Without chart bounds, all loaded bars are used.'],
  calculate:visibleAverage,warmup:()=>1,work:count=>count*8}
]);
