import {parseInterval} from '../domain/intervals';

/** An address is descriptive. Only the actual adapter can qualify numerical rows. */
export type SeriesReadoutPosition={kind:'latest'}|{kind:'axis-time';time:number}|{kind:'unavailable'};
export interface SeriesScalarBar {readonly time:number;readonly open:number;readonly high:number;readonly low:number;readonly close:number;readonly volume:number|null}
export interface SeriesReadoutValue {readonly eventTime:number;readonly axisTime:number;readonly logicalIndex:number;readonly bar:SeriesScalarBar;readonly previousBar:SeriesScalarBar|null;readonly previousSessionClose:number|null}
export type SeriesReadout={readonly state:'unavailable';readonly message:string}|{readonly state:'ready';assertCurrent():void;readPosition(position:SeriesReadoutPosition):SeriesReadoutValue};
export class SeriesReadoutQueryError extends Error {}
export class SeriesReadoutPendingError extends Error {}
export function seriesOwn(value:unknown,key:PropertyKey):unknown{
 if(!value||typeof value!=='object')throw Error('Series presentation data is unavailable.');
 const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))throw Error('Series presentation requires own data fields.');return field.value;
}
export function seriesNumber(row:unknown,key:string):number{
 const value=seriesOwn(row,key);if(typeof value!=='number'||!Number.isFinite(value))throw Error('Series presentation requires finite numbers.');return value;
}
export function seriesScalarBar(row:unknown,eventTime:number):SeriesScalarBar{
 const rawVolume=Object.getOwnPropertyDescriptor(row as object,'volume');
 if(rawVolume&&!Object.hasOwn(rawVolume,'value'))throw Error('Series volume must be an own data field.');
 const volume=rawVolume?.value;if(volume!==undefined&&volume!==null&&(typeof volume!=='number'||!Number.isFinite(volume)&&!Number.isNaN(volume)))throw Error('Series volume is unavailable.');
 return Object.freeze({time:eventTime,open:seriesNumber(row,'open'),high:seriesNumber(row,'high'),low:seriesNumber(row,'low'),close:seriesNumber(row,'close'),volume:typeof volume==='number'&&Number.isFinite(volume)?volume:null});
}
/** Logarithmic floor lookup. Callers validate their exact owned grid before/after. */
export function seriesFloor(length:number,time:number,at:(index:number)=>number):number{
 if(!Number.isFinite(time))throw new SeriesReadoutQueryError('No bar exists at this cursor position.');
 let low=0,high=length-1,result=-1;while(low<=high){const middle=(low+high)>>>1,value=at(middle);if(!Number.isFinite(value))throw Error('The series time grid is unavailable.');if(value<=time){result=middle;low=middle+1;}else high=middle-1;}return result;
}
/** Existing last-day-change semantics: chart-zone calendar day, not exchange-session inference. */
export function createSeriesDayCloseReader(zone:string){
 let formatter:Intl.DateTimeFormat;try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});}catch{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'});}
 const resolvedZone=formatter.resolvedOptions().timeZone,fixedMatch=/^Etc\/GMT([+-])(\d{1,2})$/.exec(resolvedZone),numericMatch=/^([+-])(\d{2}):(\d{2})$/.exec(resolvedZone);
 const fixedOffset=resolvedZone==='UTC'?0:fixedMatch?(fixedMatch[1]==='+'?-1:1)*Number(fixedMatch[2])*3600:numericMatch?(numericMatch[1]==='+'?1:-1)*(Number(numericMatch[2])*3600+Number(numericMatch[3])*60):null;
 let cachedDay:number|null=null,cachedBoundary:number|null=null;
 const key=(seconds:number)=>{const parts=formatter.formatToParts(new Date(seconds*1000)),part=(name:string)=>Number(parts.find(value=>value.type===name)?.value);return part('year')*10000+part('month')*100+part('day');};
 return(length:number,index:number,interval:string,at:(index:number)=>{time:number;close:number}):number|null=>{
  if(!Number.isSafeInteger(index)||index<0||index>=length)return null;
  let unit:string;try{unit=parseInterval(interval).unit;}catch{return null;}
  if(unit==='day')return index>0?at(index-1).close:null;
  if(unit!=='second'&&unit!=='minute')return null;
  const selected=at(index).time;
  if(fixedOffset!==null){const boundary=Math.floor((selected+fixedOffset)/86400)*86400-fixedOffset;let low=0,high=index-1,prior=-1;while(low<=high){const middle=(low+high)>>>1;if(at(middle).time<boundary){prior=middle;low=middle+1;}else high=middle-1;}return prior>=0?at(prior).close:null;}
  const today=key(selected);
  // Pre-1970 historical date-line reversals need a separately qualified calendar contract.
  if(today<19700101)return null;
  let boundary=cachedDay===today?cachedBoundary:null;
  if(boundary===null){let low=Math.floor(selected)-72*3600,high=Math.floor(selected);
   if(key(low)>=today)return null;
   // Find the real first second of this calendar date. DST midnight gaps/folds do not imply 24h days.
   while(low+1<high){const middle=Math.floor((low+high)/2);if(key(middle)>=today)high=middle;else low=middle;}
   if(key(high)!==today||key(high-1)>=today)return null;
   boundary=high;cachedDay=today;cachedBoundary=boundary;
  }
  let left=0,right=index-1,before=-1;while(left<=right){const middle=(left+right)>>>1;if(at(middle).time<boundary){before=middle;left=middle+1;}else right=middle-1;}
  return before>=0?at(before).close:null;
 };
}
