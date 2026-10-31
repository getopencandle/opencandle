import {nyseRegularBarRange} from './nyse-session-bars';
import {newYorkClock,newYorkWallTime,usSessionDay,usEquitySessionBucket} from './us-market-hours';
import type {Bar,BarDataset,NumericSeries} from './types';
import {aggregateInterval,parseInterval,DEFAULT_AGGREGATION_POLICY,type IntervalSpec} from './intervals';

/**
 * An indicator's own (higher) timeframe, built from the chart's loaded bars with the existing LV interval
 * aggregation (aggregateInterval, explicit UTC calendar policy). Nothing here creates finer bars, fills absent buckets
 * or reads a bar after the one being labelled.
 *
 * Behavior: a value changes only on the chart bar where a higher-timeframe bar is confirmed, and every later chart bar holds
 * the last confirmed value, so the current period shows the previous period's value, never a blank. With wait-for-close off,
 * the latest bar may show the developing value of the unconfirmed period instead.
 */
export interface HigherTimeframeBucket {start:number;end:number;first:number;last:number}
export interface HigherTimeframePlan {
 chartInterval:string;target:string;bars:Bar[];buckets:HigherTimeframeBucket[];
 /** Chart bar index where each bucket is first known to be complete, or null while it is still developing. */
 confirmedAt:(number|null)[];
 /** The last bucket has no confirmation on the loaded bars. */
 developing:boolean;
 policies:string[];
}
export type HigherTimeframeResult={ok:true;plan:HigherTimeframePlan}|{ok:false;code:'CHART_INTERVAL_UNKNOWN'|'EVENT_INTERVAL'|'LOWER_TIMEFRAME'|'SAME_TIMEFRAME'|'NO_BARS'|'RESAMPLE_UNAVAILABLE';message:string};

const DAY=86400,WEEK_ORIGIN=-3*DAY;// Monday 1969-12-29, the default policy's week start (weekStartsOn 1, anchor 1970-01-01)
export const INDICATOR_TIMEFRAME_POLICIES=[
 'Higher-timeframe bars are built from the loaded chart bars with the OpenCandle UTC calendar aggregation policy (UTC day, Monday week, calendar month). Exchange sessions, holidays and DST anchors are not applied.',
 'A higher-timeframe bar is confirmed on the chart bar whose own period reaches the bar\'s end. When the loaded bars stop earlier (a session close or a gap), it is confirmed on the first chart bar of a later period, never on an earlier bar. Slice approximation (IND.MTF.U.SESSION_ENDPOINT unresolved): without exchange session calendars, a session-data value therefore appears one bar later than a calendar-aware confirmation on the last bar of the session.',
 'No value is moved to a bar before the information that produced it. Absent periods are not filled.',
];
/** Smallest nominal length in seconds; only used to recognise a timeframe finer than the chart. */
function nominal(spec:IntervalSpec):number{return spec.seconds??(spec.unit==='day'?DAY:spec.unit==='week'?7*DAY:28*DAY)*spec.multiplier;}
/** End of a chart bar's own period under the default UTC policy (fixed-length bars: open time plus length). */
export function chartBarEnd(time:number,spec:IntervalSpec):number{
 if(spec.seconds!==null)return time+spec.seconds;
 if(spec.unit==='day')return (Math.floor(time/DAY)+spec.multiplier)*DAY;
 if(spec.unit==='week')return Math.floor((time-WEEK_ORIGIN)/(7*DAY))*7*DAY+WEEK_ORIGIN+7*DAY*spec.multiplier;
 const date=new Date(time*1000);return Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+spec.multiplier,1)/1000;
}
function syntheticDataset(bars:readonly Bar[],resolution:string):BarDataset{
 return {instrument:{id:'lv-indicator-timeframe',symbol:'LV',name:'Indicator timeframe source',exchange:'LV',currency:'XXX',assetClass:'other',tickSize:0.01,lotSize:1,timezone:'UTC'},bars:bars.map(bar=>({...bar,volume:Number.isFinite(bar.volume)?bar.volume:0})),resolution,
  provenance:{providerId:'lv-chart-bars',providerName:'Loaded chart bars',datasetId:'indicator-timeframe',fixture:false,coverage:'',asOf:0,delaySeconds:null,adjustment:'unknown',session:'unknown',timezone:'UTC',state:'ready',license:'local',revision:'chart',notes:[]}};
}
/** Build the higher-timeframe bars and the per-bucket confirmation index. Refuses (never falls back to chart bars). */
/** The chart's session calendar. 'us-equity' (US stocks, ETFs and indexes quoted in New York) builds the higher
 *  timeframe on New York trading sessions; absent, null or 'utc' keeps the UTC calendar policy unchanged. */
export interface HigherTimeframeOptions {readonly calendar?:'us-equity'|'utc'|null;
 /** Chart rows known to be closed (rows 0..completeRows-1). A live or replay forming last bar is not closed even when its
  *  nominal period reaches the bucket end, so a bucket whose last row is at or after completeRows stays developing.
  *  Absent = every loaded row is closed (historical data). Follows planNyseDailyTimeframe's completeRows. */
 readonly completeRows?:number}
/** A bucket confirms on its own last row only when that row is closed; otherwise on the first row of a later bucket. */
function confirmations(buckets:readonly HigherTimeframeBucket[],reaches:(row:HigherTimeframeBucket)=>boolean,completeRows:number):(number|null)[]{
 return buckets.map((row,index)=>row.last<completeRows&&reaches(row)?row.last:index+1<buckets.length?buckets[index+1].first:null);
}
function closedRows(options:HigherTimeframeOptions,length:number):number{const value=options.completeRows;return value===undefined?length:Number.isSafeInteger(value)&&value>=0?Math.min(value,length):0;}
export function planHigherTimeframe(bars:readonly Bar[],chartResolution:string|null,target:string,options:HigherTimeframeOptions={}):HigherTimeframeResult{
 let chart:IntervalSpec,spec:IntervalSpec;
 try{spec=parseInterval(target);}catch(error){return {ok:false,code:'RESAMPLE_UNAVAILABLE',message:'Indicator timeframe '+target+' is not a valid interval: '+(error instanceof Error?error.message:String(error))};}
 if(spec.kind!=='time')return {ok:false,code:'EVENT_INTERVAL',message:'Tick and range timeframes need actual event data; an indicator cannot calculate on '+spec.id+' from OHLC bars.'};
 if(chartResolution===null)return {ok:false,code:'CHART_INTERVAL_UNKNOWN',message:'The chart interval is unknown, so the indicator timeframe '+spec.id+' cannot be built. It is not calculated on the chart bars instead.'};
 try{chart=parseInterval(chartResolution);}catch{return {ok:false,code:'CHART_INTERVAL_UNKNOWN',message:'The chart interval '+chartResolution+' is not a supported time interval, so the indicator timeframe '+spec.id+' cannot be built.'};}
 if(chart.kind!=='time')return {ok:false,code:'EVENT_INTERVAL',message:'The chart uses '+chart.id+' event bars; an indicator timeframe needs time bars.'};
 if(chart.id===spec.id)return {ok:false,code:'SAME_TIMEFRAME',message:'The indicator timeframe equals the chart interval.'};
 if(nominal(spec)<nominal(chart))return {ok:false,code:'LOWER_TIMEFRAME',message:'Indicator timeframe '+spec.id+' is lower than the chart interval '+chart.id+'. Lower timeframes need intrabar data that is not loaded; the indicator is not calculated on the chart bars instead.'};
 if(!bars.length)return {ok:false,code:'NO_BARS',message:'No chart bars are loaded for the indicator timeframe.'};
 if(options.calendar==='us-equity'){const session=planSessionTimeframe(bars,chart,spec,closedRows(options,bars.length));if(session)return session;}
 let derived;try{derived=aggregateInterval(syntheticDataset(bars,chart.id),spec.id,DEFAULT_AGGREGATION_POLICY);}catch(error){return {ok:false,code:'RESAMPLE_UNAVAILABLE',message:'Indicator timeframe '+spec.id+' cannot be built from the '+chart.id+' chart bars: '+(error instanceof Error?error.message:String(error))};}
 const buckets=derived.derivation!.buckets.map(row=>({start:row.start,end:row.end,first:row.sourceFirstIndex,last:row.sourceLastIndex}));
 const output=derived.dataset.bars.map((bar,index)=>{const row=buckets[index];let missing=false;for(let i=row.first;i<=row.last;i++)if(!Number.isFinite(bars[i].volume)){missing=true;break;}return missing?{...bar,volume:NaN}:bar;});
 const confirmedAt=confirmations(buckets,row=>chartBarEnd(bars[row.last].time,chart)>=row.end,closedRows(options,bars.length));
 return {ok:true,plan:{chartInterval:chart.id,target:spec.id,bars:output,buckets,confirmedAt,developing:confirmedAt.at(-1)===null,policies:[...INDICATOR_TIMEFRAME_POLICIES]}};
}
export const SESSION_TIMEFRAME_POLICIES=[
 'Higher-timeframe bars follow New York trading sessions: a day is one New York trading date, a week runs Monday to Sunday by New York date, and a month is a New York calendar month. Holidays, early closes and daylight saving changes come from the NYSE calendar (2015 to 2028; other years count weekdays only). Intraday timeframes anchor at the session segments (09:30 regular open).',
 'A day, week or month is confirmed on the chart bar that reaches the close of its last trading session: the regular close (13:00 on an early close), or the after-hours close when the chart has extended-hours bars. When that bar is not loaded it is confirmed on the first chart bar of a later period, never on an earlier bar.',
 'No value is moved to a bar before the information that produced it. Absent periods are not filled.',
];
const sessionDate=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*DAY*1000).toISOString().slice(0,10);
const tradingDay=(date:string)=>{const day=usSessionDay(date);return !day.weekend&&!day.holiday;};
/** Last trading date in [first, last] (inclusive), or last itself when the span has none. */
function lastTradingDate(first:string,last:string):string{for(let date=last,n=0;date>=first&&n<400;date=sessionDate(date,-1),n++)if(tradingDay(date))return date;return last;}
/**
 * Session-calendar buckets for US equity charts. Returns null when the combination keeps
 * the UTC policy: multi-day targets, weekly or monthly chart bars (their own anchors straddle sessions) and second targets.
 * Days, weeks and months group New York trading dates (calendar-label chart bars use the date at their midday, as the pivot
 * calendar does); minute targets use the session-anchored buckets of the interval menu.
 */
function planSessionTimeframe(bars:readonly Bar[],chart:IntervalSpec,spec:IntervalSpec,completeRows:number):HigherTimeframeResult|null{
 const intraday=chart.seconds!==null;
 if(!intraday&&!(chart.unit==='day'&&chart.multiplier===1))return null;
 if(spec.unit==='second'||spec.unit==='day'&&spec.multiplier!==1)return null;
 if(spec.unit==='minute'&&!intraday)return null;
 const n=bars.length,dates:string[]=new Array(n),ends:number[]=new Array(n);let extended=false;
 for(let i=0;i<n;i++){
  const time=bars[i].time;if(!Number.isSafeInteger(time)||i>0&&time<=bars[i-1].time)return {ok:false,code:'RESAMPLE_UNAVAILABLE',message:'Indicator timeframe '+spec.id+' needs chart bars in increasing time order.'};
  if(intraday){
   const clock=newYorkClock(time);dates[i]=clock.date;
   let end=time+chart.seconds!;if(chart.unit==='minute'){const own=usEquitySessionBucket(time,chart.multiplier);if(own.start===time)end=own.end;}ends[i]=end;
   const day=usSessionDay(clock.date),open=newYorkWallTime(clock.date,day.open),close=newYorkWallTime(clock.date,day.close);if(end<=open||time>=close)extended=true;
  }else dates[i]=newYorkClock(time+DAY/2).date;
 }
 const closeOf=(date:string)=>{const day=usSessionDay(date);return newYorkWallTime(date,intraday&&extended?day.postClose:day.close);};
 if(!intraday)for(let i=0;i<n;i++)ends[i]=closeOf(dates[i]);
 const MONDAY=Date.parse('1969-12-29T00:00:00Z')/1000,MONTH0=1970*12;
 const period=(i:number):{key:number;end:number;start:number}=>{
  const date=dates[i];
  if(spec.unit==='minute'){const own=usEquitySessionBucket(bars[i].time,spec.multiplier);return {key:own.start,start:own.start,end:own.end};}
  if(spec.unit==='day')return {key:Date.parse(date+'T00:00:00Z')/1000,start:bars[i].time,end:closeOf(date)};
  if(spec.unit==='week'){const span=7*spec.multiplier,key=Math.floor((Date.parse(date+'T00:00:00Z')/1000-MONDAY)/(span*DAY)),first=new Date((MONDAY+key*span*DAY)*1000).toISOString().slice(0,10);return {key,start:bars[i].time,end:closeOf(lastTradingDate(first,sessionDate(first,span-1)))};}
  const index=Number(date.slice(0,4))*12+Number(date.slice(5,7))-1,key=MONTH0+Math.floor((index-MONTH0)/spec.multiplier)*spec.multiplier;
  const iso=(value:number)=>String(Math.floor(value/12)).padStart(4,'0')+'-'+String(value%12+1).padStart(2,'0')+'-01',first=iso(key),last=sessionDate(iso(key+spec.multiplier),-1);
  return {key,start:bars[i].time,end:closeOf(lastTradingDate(first,last))};
 };
 const output:Bar[]=[],buckets:HigherTimeframeBucket[]=[];let current:{key:number}|null=null;
 for(let i=0;i<n;i++){
  const bar=bars[i],row=period(i),volume=Number.isFinite(bar.volume)?bar.volume:NaN;
  if(current&&row.key<current.key)return {ok:false,code:'RESAMPLE_UNAVAILABLE',message:'Indicator timeframe '+spec.id+' cannot be built: the chart bars do not follow the session calendar in order.'};
  if(!current||row.key!==current.key){current={key:row.key};output.push({time:bar.time,open:bar.open,high:bar.high,low:bar.low,close:bar.close,volume});buckets.push({start:row.start,end:Math.max(row.end,ends[i]),first:i,last:i});continue;}
  const out=output[output.length-1],bucket=buckets[buckets.length-1];out.high=Math.max(out.high,bar.high);out.low=Math.min(out.low,bar.low);out.close=bar.close;out.volume=Number.isFinite(out.volume)&&Number.isFinite(volume)?out.volume+volume:NaN;bucket.last=i;bucket.end=Math.max(bucket.end,ends[i]);
 }
 const confirmedAt=confirmations(buckets,row=>ends[row.last]>=row.end,completeRows);
 return {ok:true,plan:{chartInterval:chart.id,target:spec.id,bars:output,buckets,confirmedAt,developing:confirmedAt.at(-1)===null,policies:[...SESSION_TIMEFRAME_POLICIES]}};
}
/**
 * Map one higher-timeframe series back onto the chart bars.
 * Both modes: from the chart bar where a higher-timeframe bar is confirmed, every chart bar holds that value until the next
 * confirmation. waitForClose false: the latest chart bar shows the developing value of an unconfirmed last bucket instead;
 * earlier bars of that bucket keep the confirmed value, since a developing value for them would need later bars.
 * Values before the first confirmation stay null (unavailable, never zero).
 */
export function alignHigherTimeframe(values:NumericSeries,plan:HigherTimeframePlan,chartLength:number,waitForClose:boolean):NumericSeries{
 if(values.length!==plan.buckets.length)throw new Error('Higher-timeframe values do not match the planned bars.');
 const out:NumericSeries=new Array(chartLength).fill(null),set=new Array<boolean>(chartLength).fill(false);
 plan.confirmedAt.forEach((index,bucket)=>{if(index!==null&&index<chartLength){out[index]=values[bucket];set[index]=true;}});
 let held:number|null=null;for(let i=0;i<chartLength;i++){if(set[i])held=out[i];else out[i]=held;}
 if(!waitForClose&&plan.developing&&chartLength>0)out[chartLength-1]=values[values.length-1];
 return out;
}

/** Internal producer facts are supplied only after actual source/native admission by the port.
 * This pure planner grants no source authority. Unknown sources continue to use planHigherTimeframe. */
export interface ClosedDailyObservation {readonly completeRows:number;readonly coveredFrom:number;readonly closedThrough:number}
export function nyseDailyChartInterval(resolution:string|null,target:string):boolean{
 try{const chart=resolution===null?null:parseInterval(resolution);return target==='1D'&&chart?.kind==='time'&&chart.seconds!==null&&chart.seconds>=60&&(23400%chart.seconds===0&&12600%chart.seconds===0||chart.seconds===3600);}catch{return false;}
}
function sessionScalar(owner:unknown,key:string):number{if(!owner||typeof owner!=='object')throw Error('Calendar rows require own data.');const field=Object.getOwnPropertyDescriptor(owner,key);if(!field||!Object.hasOwn(field,'value')||typeof field.value!=='number'||key!=='volume'&&!Number.isFinite(field.value)||key==='volume'&&!Number.isFinite(field.value)&&!Number.isNaN(field.value))throw Error('Calendar rows require numeric own data.');return field.value;}
export function planNyseDailyTimeframe(bars:readonly Bar[],chartResolution:string|null,observation:ClosedDailyObservation):HigherTimeframeResult{
 const refuse=(message:string):HigherTimeframeResult=>({ok:false,code:'RESAMPLE_UNAVAILABLE',message});
 if(!nyseDailyChartInterval(chartResolution,'1D')||!Number.isSafeInteger(observation.completeRows)||observation.completeRows<0||observation.completeRows>bars.length||!Number.isSafeInteger(observation.closedThrough)||!(Number.isFinite(observation.coveredFrom)||observation.coveredFrom===-Infinity))return refuse('A qualified regular-session daily observation is unavailable.');
 if(!bars.length)return {ok:false,code:'NO_BARS',message:'No chart bars are loaded for the indicator timeframe.'};
 const seconds=parseInterval(chartResolution!).seconds!,output:Bar[]=[],buckets:HigherTimeframeBucket[]=[],confirmedAt:(number|null)[]=[];let prior=-Infinity,dayDate='';
 try{
  for(let index=0;index<bars.length;index++){
   const rowField=Object.getOwnPropertyDescriptor(bars,String(index));if(!rowField||!Object.hasOwn(rowField,'value'))throw Error('Calendar input rows require own data.');const row=rowField.value,time=sessionScalar(row,'time');if(!Number.isSafeInteger(time)||time<=prior||time<observation.coveredFrom)throw Error('The selected prefix is outside its observed request coverage.');prior=time;
   const range=nyseRegularBarRange(time,seconds);if(!range)throw Error('The input is outside the supported regular-session grid.');const {date,sessionOpen:open,sessionClose:end}=range;
   const o=sessionScalar(row,'open'),h=sessionScalar(row,'high'),l=sessionScalar(row,'low'),c=sessionScalar(row,'close'),v=sessionScalar(row,'volume');if(h<Math.max(o,l,c)||l>Math.min(o,h,c)||Number.isFinite(v)&&v<0)throw Error('Invalid calendar OHLCV row.');
   if(date!==dayDate){dayDate=date;output.push({time:open,open:o,high:h,low:l,close:c,volume:v});buckets.push({start:open,end,first:index,last:index});confirmedAt.push(null);}else{const current=output[output.length-1],bucket=buckets[buckets.length-1];current.high=Math.max(current.high,h);current.low=Math.min(current.low,l);current.close=c;const volume=Number.isFinite(current.volume)&&Number.isFinite(v)?current.volume+v:NaN;current.volume=Number.isFinite(volume)?volume:NaN;bucket.last=index;}
   // A later loaded period never substitutes for a producer-observed close of this exact endpoint.
   if(index<observation.completeRows&&range.barEnd===end&&end<=observation.closedThrough)confirmedAt[confirmedAt.length-1]=index;
  }
  return {ok:true,plan:{chartInterval:parseInterval(chartResolution!).id,target:'1D',bars:output,buckets,confirmedAt,developing:confirmedAt.at(-1)===null,policies:['Daily values use the supported New York regular-session calendar, including holidays, early closes and DST.','Confirmation requires both the loaded session endpoint and the actual producer-observed closed-through boundary. REST observations are current published prices and can be revised; they are not exchange finality or point-in-time archives.','Only loaded chart observations are aggregated; a partially loaded first day is not a complete-session history claim. Missing sessions are not filled; no value moves before the information that produced it.']}};
 }catch(error){return refuse(error instanceof Error?error.message:'The qualified daily input is unavailable.');}
}
