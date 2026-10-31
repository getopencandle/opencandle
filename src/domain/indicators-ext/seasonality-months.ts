import {newYorkClock,newYorkWallTime,NYSE_CALENDAR_YEARS,usSessionDay} from '../us-market-hours';
import {
 reserveSeasonality,seasonalityArrayLength,seasonalityArray,seasonalityRecord,seasonalityOwn,seasonalityMonthIndex,seasonalityMonthKey,validateSeasonalitySettings,SeasonalityUnavailable,
 type SeasonalityMonth,type SeasonalitySample,type SeasonalitySettings,type SeasonalityUsage,
} from './seasonality-types';
import type {SeasonalityInput} from './seasonality';

/** Explicit supplied completion/availability is a pure input contract, not a private source or transport proof. */
export interface SeasonalitySourcePoint {time:number;close:number;availableAt:number;finalized:boolean}
export interface SeasonalityCalendarContract {
 calendar:'utc-continuous'|'nyse';session:'continuous'|'regular'|'extended';
 kind:'daily'|'monthly';dateLabels:'utc-date'|'calendar-midnight';
}
export interface SeasonalityCompilerInput {points:readonly SeasonalitySourcePoint[];contract:SeasonalityCalendarContract;settings:SeasonalitySettings;sourceKeyDescription:string;asOf:number}
export type SeasonalityCompilerResult={status:'ready';input:Readonly<SeasonalityInput>;contract:Readonly<SeasonalityCalendarContract>;usage:Readonly<SeasonalityUsage>}|{status:'unavailable';input:null;diagnostic:string;usage:Readonly<SeasonalityUsage>|null};
interface CalendarMonth {index:number;opening:number;next:number;first:string;last:string;end:number;expected:number}
interface Group {calendar:CalendarMonth;firstTime:number|null;last:SeasonalitySourcePoint|null;lastDate:string|null;endpoint:SeasonalitySourcePoint|null;observed:number;finalized:number}
const DAY=86400,integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value);
function utc(date:string):number{const parts=/^(\d{4,5})-(\d\d)-(\d\d)$/.exec(date);if(!parts)throw new SeasonalityUnavailable('Seasonality date labels are unavailable.');const stamp=new Date(0);stamp.setUTCFullYear(Number(parts[1]),Number(parts[2])-1,Number(parts[3]));stamp.setUTCHours(0,0,0,0);const value=stamp.getTime()/1000;if(!integer(value))throw new SeasonalityUnavailable('Seasonality date labels are unavailable.');return value;}
function lastDate(index:number):string{const next=seasonalityMonthKey(index+1)+'-01';return new Date((utc(next)-DAY)*1000).toISOString().slice(0,10);}
function opening(date:string,contract:SeasonalityCalendarContract):number{return contract.calendar==='nyse'?newYorkWallTime(date,0):utc(date);}
function calendarMonth(index:number,contract:SeasonalityCalendarContract):CalendarMonth{
 const year=Math.floor(index/12),key=seasonalityMonthKey(index),first=key+'-01',last=lastDate(index),start=utc(first),end=utc(last);let expected=0,firstDay:string|null=null,lastDay:string|null=null,lastEnd=0;
 if(contract.calendar==='nyse'&&(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last))throw new SeasonalityUnavailable('Seasonality NYSE month certification is limited to 2015 through 2028.');
 for(let time=start;time<=end;time+=DAY){const date=new Date(time*1000).toISOString().slice(0,10),day=contract.calendar==='nyse'?usSessionDay(date):null;if(day&&(day.weekend||day.holiday))continue;
  firstDay??=date;lastDay=date;expected++;lastEnd=day?newYorkWallTime(date,contract.session==='regular'?day.close:day.postClose):time+DAY;
 }
 if(!firstDay||!lastDay)throw new SeasonalityUnavailable('Seasonality has no qualified calendar sessions for this month.');
 return {index,opening:opening(first,contract),next:opening(seasonalityMonthKey(index+1)+'-01',contract),first:firstDay,last:lastDay,end:lastEnd,expected};
}
function pointDate(time:number,contract:SeasonalityCalendarContract):string{
 const date=contract.dateLabels==='utc-date'?new Date(time*1000).toISOString().slice(0,10):contract.calendar==='nyse'?newYorkClock(time).date:new Date(time*1000).toISOString().slice(0,10);
 const expected=contract.dateLabels==='utc-date'?utc(date):opening(date,contract);
 if(time!==expected)throw new SeasonalityUnavailable('Seasonality requires the declared exact daily or month-opening date label.');
 return date;
}
function validateContract(contract:SeasonalityCalendarContract):void{
 seasonalityRecord(contract,['calendar','session','kind','dateLabels']);
 if(!['utc-continuous','nyse'].includes(contract.calendar)||!['daily','monthly'].includes(contract.kind)||!['utc-date','calendar-midnight'].includes(contract.dateLabels)||contract.calendar==='utc-continuous'&&contract.session!=='continuous'||contract.calendar==='nyse'&&contract.session!=='regular'&&contract.session!=='extended')throw new SeasonalityUnavailable('Seasonality requires a supported explicit calendar, session and date-label contract.');
}
/** Direct daily/monthly compiler only. No intraday aggregation, provider selection, borrowed history or source authority. */
export function compileSeasonalityMonths(input:SeasonalityCompilerInput):SeasonalityCompilerResult{
 let usage:Readonly<SeasonalityUsage>|null=null;
 try{
  seasonalityRecord(input,['points','contract','settings','sourceKeyDescription','asOf']);validateContract(input.contract);validateSeasonalitySettings(input.settings);
  if(!integer(input.asOf)||typeof input.sourceKeyDescription!=='string'||!input.sourceKeyDescription.length||input.sourceKeyDescription.length>4096)throw new SeasonalityUnavailable('Seasonality needs an explicit information cutoff and bounded source description.');
  const contract=input.contract,settings=input.settings,count=seasonalityArrayLength(input.points),firstRequested=settings.startYear*12,lastRequested=settings.endYear*12+11;
  if(contract.calendar==='nyse'&&(settings.startYear<NYSE_CALENDAR_YEARS.first||settings.endYear>NYSE_CALENDAR_YEARS.last))throw new SeasonalityUnavailable('Seasonality NYSE month certification is limited to 2015 through 2028.');
  const includeSeed=settings.startYear>1&&(contract.calendar!=='nyse'||settings.startYear>NYSE_CALENDAR_YEARS.first),first=firstRequested-Number(includeSeed),monthCount=lastRequested-first+1;
  // Reserve complete requested table and downstream four scalar/readout/geometry sets before calendar/group allocation.
  usage=reserveSeasonality({chartBars:count,monthFrames:monthCount,sourceRows:count,calendarDays:monthCount*31,settings,compiler:true});seasonalityArray(input.points);
  const calendars=new Map<number,CalendarMonth>(),groups=new Map<number,Group>(),samples:Readonly<SeasonalitySample>[]=[],asOfDate=contract.calendar==='nyse'?newYorkClock(input.asOf).date:new Date(input.asOf*1000).toISOString().slice(0,10),asOfMonth=asOfDate.slice(0,7),current=seasonalityMonthIndex(asOfMonth);
  for(let index=first;index<=lastRequested;index++)calendars.set(index,calendarMonth(index,contract));
  let lastTime=-Infinity,lastLabel='';
  for(let i=0;i<count;i++){
   const point=seasonalityOwn(input.points,String(i)) as SeasonalitySourcePoint;seasonalityRecord(point,['time','close','availableAt','finalized']);
   if(!integer(point.time)||point.time<=lastTime||typeof point.close!=='number'||!Number.isFinite(point.close)||!integer(point.availableAt)||typeof point.finalized!=='boolean')throw new SeasonalityUnavailable('Seasonality source points require ordered primitive prices, availability and completion.');
   const date=pointDate(point.time,contract),index=seasonalityMonthIndex(date.slice(0,7));if(date<=lastLabel||contract.kind==='monthly'&&!date.endsWith('-01'))throw new SeasonalityUnavailable('Seasonality source date labels are duplicated, conflicting or not month openings.');lastTime=point.time;lastLabel=date;
   if(index<first||index>lastRequested)continue;
   const calendar=calendars.get(index)!;let end:number,dayStart:number;
   if(contract.kind==='daily'){
    const day=contract.calendar==='nyse'?usSessionDay(date):null;if(day&&(day.weekend||day.holiday))throw new SeasonalityUnavailable('Seasonality daily data conflicts with its declared trading calendar.');
    dayStart=opening(date,contract);end=day?newYorkWallTime(date,contract.session==='regular'?day.close:day.postClose):utc(date)+DAY;
   }else{dayStart=calendar.opening;end=calendar.end;}
   if(point.availableAt<dayStart||point.finalized&&point.availableAt<end)throw new SeasonalityUnavailable('Seasonality completion precedes the declared session or month endpoint.');
   if(point.availableAt>input.asOf)continue;
   let group=groups.get(index);if(!group){group={calendar,firstTime:null,last:null,lastDate:null,endpoint:null,observed:0,finalized:0};groups.set(index,group);}
   if(contract.kind==='monthly'&&group.observed)throw new SeasonalityUnavailable('Seasonality monthly labels must be unique.');
   const copy=Object.freeze({...point});group.last=copy;group.lastDate=date;group.observed++;group.finalized+=Number(point.finalized);
   if(contract.kind==='monthly'||date===calendar.first)group.firstTime=point.time;
   if(point.finalized&&(contract.kind==='monthly'||date===calendar.last))group.endpoint=copy;
   samples.push(Object.freeze({time:point.time,month:seasonalityMonthKey(index)}));
  }
  const months:Readonly<SeasonalityMonth>[]=[];
  for(let index=first;index<=lastRequested;index++){
   const calendar=calendars.get(index)!,group=groups.get(index),endpoint=group?.endpoint,developing=!endpoint&&index===current&&!!group?.last;
   const selected=endpoint??(developing?group!.last:null),coverage=contract.kind==='monthly'?'unknown':group?.finalized===calendar.expected?'complete':index<=current?'sparse':'unknown';
   const labelOpeningTime=contract.dateLabels==='utc-date'?utc(seasonalityMonthKey(index)+'-01'):calendar.opening,nextLabelOpeningTime=contract.dateLabels==='utc-date'?utc(seasonalityMonthKey(index+1)+'-01'):calendar.next;
   months.push(Object.freeze({month:seasonalityMonthKey(index),openingTime:calendar.opening,nextOpeningTime:calendar.next,labelOpeningTime,nextLabelOpeningTime,firstTime:group?.firstTime??null,close:selected?.close??null,availableAt:selected?.availableAt??null,completion:endpoint?'closed':developing?'developing':'unavailable',coverage,expectedSessions:contract.kind==='daily'?calendar.expected:null,observedSessions:group?.observed??0}));
  }
  // Compiler samples remain retained while the pure model creates arrays. Carry that reservation into its next call.
  const downstreamSettings=Object.freeze({...settings,externalNumericSlots:settings.externalNumericSlots+usage.compilerSlots+usage.calendarCacheSlots});
  return Object.freeze({status:'ready',input:Object.freeze({months:Object.freeze(months),samples:Object.freeze(samples),settings:downstreamSettings,sourceKeyDescription:input.sourceKeyDescription,asOf:input.asOf,asOfMonth}),contract:Object.freeze({...contract}),usage});
 }catch(error){return Object.freeze({status:'unavailable',input:null,diagnostic:error instanceof Error?error.message:String(error),usage});}
}
