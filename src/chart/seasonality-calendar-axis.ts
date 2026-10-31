import {newYorkClock,newYorkWallTime,usSessionDay,NYSE_CALENDAR_YEARS} from '../domain/us-market-hours';
import type {SeasonalityCalendarContract} from '../domain/indicators-ext/seasonality-months';

/** Original LV geometry policy. These values confer no original-source/native/scalar authority. */
export const SEASONALITY_CALENDAR_AXIS_LIMITS=Object.freeze({days:62,futureLabels:62,owners:1000});
export interface SeasonalityCalendarAxisCost {readonly operations:number;readonly numericSlots:number}
export interface SeasonalityCalendarAxisHandle {readonly qualifiedThrough:number;isCurrent():boolean;isDetached():boolean;dispose():void}
export interface SeasonalityCalendarAxisRenderer {
 lvCaptureTimeFrame(confirmedCount:number,tailTimeMs:number):object;
 lvSetFutureTimeSpine(frame:object,labels:Float64Array):SeasonalityCalendarAxisHandle;
}
const DAY=86400,MAX_LABELS=62,NativeFloat64=Float64Array;
const slice=Float64Array.prototype.subarray;
const unavailable=()=>Error('The declared Seasonality future calendar is unavailable.');

/** The actual private port supplies its job count; a supplied amount never grants a budget. */
export function seasonalityCalendarAxisCost(owners:number):Readonly<SeasonalityCalendarAxisCost>{
 if(!Number.isSafeInteger(owners)||owners<1||owners>1000)throw unavailable();
 return Object.freeze({operations:1024*62+128*62+512*owners+16384,numericSlots:3*62+24*owners+512});
}
function utc(year:number,month:number,day:number):number{const date=new Date(0);date.setUTCFullYear(year,month,day);date.setUTCHours(0,0,0,0);return date.getTime()/1000;}
function label(date:string,time:number,contract:Readonly<SeasonalityCalendarContract>):number{return contract.calendar==='nyse'&&contract.dateLabels==='calendar-midnight'?newYorkWallTime(date,0):time;}
function certified(year:number,contract:Readonly<SeasonalityCalendarContract>):void{if(!Number.isSafeInteger(year)||year<1||year>9999||contract.calendar==='nyse'&&(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last))throw unavailable();}

/**
 * Call ONLY after the actual private C reservation admits the complete worst-case
 * cost, including this 62-slot backing store, the new native copy and old copy.
 * Calendar enumeration is <=62 dates ONCE, never a paint/hover operation. The
 * subarray is a zero-copy view of the owned 62-slot backing store, not a second
 * numeric candidate. The renderer subsequently copies its actual H<=62 entries.
 * Contract/tail/right inputs are descriptive pure facts, not source permission.
 */
export function seasonalityCalendarSpine(contract:Readonly<SeasonalityCalendarContract>,tailTime:number,requiredRight:number):Float64Array|null{
 if(!['utc-continuous','nyse'].includes(contract.calendar)||!['daily','monthly'].includes(contract.kind)||!['utc-date','calendar-midnight'].includes(contract.dateLabels)||contract.calendar==='utc-continuous'&&contract.session!=='continuous'||contract.calendar==='nyse'&&contract.session!=='regular'&&contract.session!=='extended'||!Number.isSafeInteger(tailTime)||!Number.isSafeInteger(requiredRight))throw unavailable();
 if(requiredRight<=tailTime)return null;
 const text=contract.calendar==='nyse'&&contract.dateLabels==='calendar-midnight'?newYorkClock(tailTime).date:new Date(tailTime*1000).toISOString().slice(0,10);
 const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);if(!parts)throw unavailable();
 const year=Number(parts[1]),month=Number(parts[2])-1,day=Number(parts[3]),start=utc(year,month,day);certified(year,contract);
 if(label(text,start,contract)!==tailTime)throw unavailable();
 const next=utc(year,month+1,1),nextDate=new Date(next*1000),nextYear=nextDate.getUTCFullYear();certified(nextYear,contract);
 const boundaryText=nextDate.toISOString().slice(0,10),boundary=label(boundaryText,next,contract);
 // The single current-month right edge is the admitted horizon. Arbitrary future
 // target dates never turn this helper into an unbounded calendar resolver.
 if(requiredRight!==boundary)throw unavailable();
 if(contract.kind==='monthly'){
  if(day!==1)throw unavailable();const output=new NativeFloat64(1);output[0]=boundary*1000;return output;
 }
 if(contract.calendar==='nyse'){const actual=usSessionDay(text);if(actual.weekend||actual.holiday)throw unavailable();}
 const limit=utc(year,month+2,1),output=new NativeFloat64(MAX_LABELS);let count=0,visited=0,previous=tailTime;
 for(let time=start+DAY;time<limit&&visited<62;time+=DAY){
  visited++;const date=new Date(time*1000),dateYear=date.getUTCFullYear();certified(dateYear,contract);const key=date.toISOString().slice(0,10);
  if(contract.calendar==='nyse'){const session=usSessionDay(key);if(session.weekend||session.holiday)continue;}
  const value=label(key,time,contract);if(!Number.isSafeInteger(value)||value<=previous||count>=MAX_LABELS)throw unavailable();previous=value;output[count++]=value*1000;
  if(value>=requiredRight)return Reflect.apply(slice,output,[0,count]) as Float64Array;
 }
 throw unavailable();
}

/** Pure expected geometry, never a permission to read bars or future values.
 * The constructor-owned caller supplies the ACTUAL selected minute plan/session
 * after complete private admission. No caller callback, array or row is read. */
export interface SeasonalityIntradayAxisPlan {
 readonly minutes:number;
 readonly session:'regular'|'extended';
}
export interface SeasonalityIntradayAxisCoordinates {
 readonly times:Float64Array;
 readonly offsets:Float64Array;
}
export interface SeasonalityIntradayAxisRenderer extends SeasonalityCalendarAxisRenderer {
 lvSetFutureTimeSegments(frame:object,times:Float64Array,offsets:Float64Array):SeasonalityCalendarAxisHandle;
}
export const SEASONALITY_INTRADAY_AXIS_LIMITS=Object.freeze({days:62,anchors:373,maxOffset:89280});

/** Fixed worst overlap covers TWO supplied373 arrays, TWO new native373 copies
 * and TWO retained prior373 copies, including legacy62. No overlap credit.
 * Add to, rather than replace, existing compiler/native-cohort reservations. */
export function seasonalityIntradayAxisCost(owners:number):Readonly<SeasonalityCalendarAxisCost>{
 if(!Number.isSafeInteger(owners)||owners<1||owners>1000)throw unavailable();
 return Object.freeze({operations:2048*62+256*373+1024*owners+32768,numericSlots:6*373+24*owners+1024});
}

/** Enumerate dates/at most3 segments each; never enumerate dense intraday bars.
 * Each segment contributes its first/last expected bar and their exact ordinal
 * distance. Between segments/days the next expected bar advances ONE ordinal.
 * The actual native tail is implicit at offset0 and is not copied into output.
 * Backings remain373 even when the returned intrinsic views are shorter.
 * Completion extends to the first expected bar on/after current-month boundary.
 * Uncertified calendars, off-grid tail, arbitrary future targets fail explicitly. */
export function seasonalityIntradayCoordinates(plan:Readonly<SeasonalityIntradayAxisPlan>,tailTime:number,requiredRight:number):Readonly<SeasonalityIntradayAxisCoordinates>|null{
 const minutes=plan.minutes,session=plan.session;
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440||(session!=='regular'&&session!=='extended')||!Number.isSafeInteger(tailTime)||!Number.isSafeInteger(tailTime*1000)||!Number.isSafeInteger(requiredRight))throw unavailable();
 if(requiredRight<=tailTime)return null;
 const text=newYorkClock(tailTime).date,date=new Date(text+'T00:00:00Z'),year=date.getUTCFullYear(),month=date.getUTCMonth(),start=date.getTime()/1000;
 if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last)throw unavailable();
 const nextDate=new Date(utc(year,month+1,1)*1000),nextKey=nextDate.toISOString().slice(0,10);
 if(nextDate.getUTCFullYear()>NYSE_CALENDAR_YEARS.last||requiredRight!==newYorkWallTime(nextKey,0))throw unavailable();
 const day=usSessionDay(text);
 if(day.weekend||day.holiday)throw unavailable();
 const step=minutes*60;
 let tailMatched=false;
 // No per-date segment/value arrays or iterator machinery; fixed three passes.
 for(let segment=0;segment<3;segment++){
  if(session==='regular'&&segment!==1)continue;
  const left=newYorkWallTime(text,segment===0?day.preOpen:segment===1?day.open:day.close),right=newYorkWallTime(text,segment===0?day.open:segment===1?day.close:day.postClose);
  if(tailTime>=left&&tailTime<right&&(tailTime-left)%step===0)tailMatched=true;
 }
 if(!tailMatched)throw unavailable();
 const times=new NativeFloat64(373),offsets=new NativeFloat64(373);let count=0,ordinal=0,previous=tailTime;
 const emit=(time:number,advance:number)=>{
  ordinal+=advance;
  if(count>=373||!Number.isSafeInteger(time)||time<=previous||!Number.isSafeInteger(time*1000)||!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>89280)throw unavailable();
  times[count]=time*1000;offsets[count]=ordinal;count++;previous=time;
 };
 for(let visit=0;visit<62;visit++){
  const at=new Date((start+visit*DAY)*1000),key=at.toISOString().slice(0,10),currentYear=at.getUTCFullYear();
  if(currentYear<NYSE_CALENDAR_YEARS.first||currentYear>NYSE_CALENDAR_YEARS.last)throw unavailable();
  const current=usSessionDay(key);if(current.weekend||current.holiday)continue;
  for(let segment=0;segment<3;segment++){
   if(session==='regular'&&segment!==1)continue;
   const left=newYorkWallTime(key,segment===0?current.preOpen:segment===1?current.open:current.close),right=newYorkWallTime(key,segment===0?current.open:segment===1?current.close:current.postClose);
   const first=tailTime<left?left:left+(Math.floor((tailTime-left)/step)+1)*step;
   if(first>=right)continue;
   const remaining=Math.ceil((right-first)/step),last=first+(remaining-1)*step;
   emit(first,1);
   if(first>=requiredRight)return Object.freeze({times:Reflect.apply(slice,times,[0,count]) as Float64Array,offsets:Reflect.apply(slice,offsets,[0,count]) as Float64Array});
   if(remaining>1)emit(last,remaining-1);
   if(last>=requiredRight)return Object.freeze({times:Reflect.apply(slice,times,[0,count]) as Float64Array,offsets:Reflect.apply(slice,offsets,[0,count]) as Float64Array});
  }
 }
 throw unavailable();
}
