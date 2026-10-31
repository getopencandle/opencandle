import {
 reserveSeasonality,parseSeasonalityExclusions,seasonalityArray,seasonalityArrayLength,seasonalityRecord,seasonalityOwn,seasonalityMonthIndex,seasonalityMonthKey,SeasonalityUnavailable,
 type SeasonalitySettings,type SeasonalityMonth,type SeasonalitySample,type SeasonalityStatistics,type SeasonalityProjection,type SeasonalityCell,type SeasonalityYear,type SeasonalityResult,type SeasonalityUsage,
} from './seasonality-types';

/** Arithmetic, not a reference parity claim. Pure supplied facts confer no source/history authority. */
export interface SeasonalityInput {months:readonly SeasonalityMonth[];samples:readonly SeasonalitySample[];settings:SeasonalitySettings;sourceKeyDescription:string;asOf:number;asOfMonth:string}
interface Accumulator {count:number;mean:number;m2:number;positive:number;sparse:number;unknown:number;developing:number}
const accumulator=():Accumulator=>({count:0,mean:0,m2:0,positive:0,sparse:0,unknown:0,developing:0});
function add(acc:Accumulator,value:number,month:SeasonalityMonth):void{
 const count=acc.count+1,delta=value-acc.mean,mean=acc.mean+delta/count,m2=acc.m2+delta*(value-mean);
 if(!Number.isFinite(mean)||!Number.isFinite(m2)||m2<0)throw new SeasonalityUnavailable('Seasonality statistics overflowed.');
 acc.count=count;acc.mean=mean;acc.m2=m2;acc.positive+=Number(value>0);acc.sparse+=Number(month.coverage==='sparse');acc.unknown+=Number(month.coverage==='unknown');acc.developing+=Number(month.completion==='developing');
}
function statistics(acc:Accumulator):Readonly<SeasonalityStatistics>{
 return Object.freeze({count:acc.count,mean:acc.count?acc.mean:null,deviation:acc.count?Math.sqrt(acc.m2/acc.count):null,positiveFrequency:acc.count?100*acc.positive/acc.count:null,sparseCount:acc.sparse,unknownCoverageCount:acc.unknown,developingCount:acc.developing});
}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value);
function validateMonth(frame:SeasonalityMonth,asOf:number):number{
 seasonalityRecord(frame,['month','openingTime','nextOpeningTime','labelOpeningTime','nextLabelOpeningTime','firstTime','close','availableAt','completion','coverage','expectedSessions','observedSessions']);
 const index=seasonalityMonthIndex(frame.month);
 if(!integer(frame.openingTime)||!integer(frame.nextOpeningTime)||frame.nextOpeningTime<=frame.openingTime||!integer(frame.labelOpeningTime)||!integer(frame.nextLabelOpeningTime)||frame.nextLabelOpeningTime<=frame.labelOpeningTime||frame.firstTime!==null&&!integer(frame.firstTime)||frame.close!==null&&(typeof frame.close!=='number'||!Number.isFinite(frame.close))||frame.availableAt!==null&&!integer(frame.availableAt)||!['closed','developing','unavailable'].includes(frame.completion)||!['complete','sparse','unknown'].includes(frame.coverage)||!integer(frame.observedSessions)||frame.observedSessions<0||frame.expectedSessions!==null&&(!integer(frame.expectedSessions)||frame.expectedSessions<1||frame.observedSessions>frame.expectedSessions))throw new SeasonalityUnavailable('Seasonality monthly facts are invalid.');
 if(frame.completion!=='unavailable'&&(frame.close===null||frame.availableAt===null||frame.observedSessions===0)||frame.completion==='unavailable'&&(frame.close!==null||frame.availableAt!==null)||frame.availableAt!==null&&frame.availableAt<frame.openingTime||frame.completion==='closed'&&frame.availableAt!<=frame.openingTime||frame.firstTime!==null&&(frame.firstTime<frame.labelOpeningTime||frame.firstTime>=frame.nextLabelOpeningTime))throw new SeasonalityUnavailable('Seasonality completion or opening facts are inconsistent.');
 if(frame.firstTime!==null&&(frame.firstTime>asOf||frame.availableAt!==null&&frame.firstTime>frame.availableAt))throw new SeasonalityUnavailable('Seasonality first observation is after its information cutoff.');
 return index;
}
function usableClose(frame:SeasonalityMonth|undefined,cutoff:number):frame is SeasonalityMonth&{close:number;availableAt:number}{return !!frame&&frame.completion==='closed'&&typeof frame.close==='number'&&frame.close>0&&frame.availableAt!==null&&frame.availableAt<=cutoff;}
function returnOf(frame:SeasonalityMonth,previous:SeasonalityMonth|undefined,cutoff:number):number|null{
 if(frame.completion==='unavailable'||frame.close===null||frame.close<=0||frame.availableAt===null||frame.availableAt>cutoff||!usableClose(previous,cutoff))return null;
 const value=100*(frame.close/previous.close-1);return Number.isFinite(value)?value:null;
}
/** Historical snapshots are generated before each month is admitted to a closed pool. Latest table is a separate path. */
export function calculateSeasonality(input:SeasonalityInput):SeasonalityResult{
 let usage:Readonly<SeasonalityUsage>|null=null;
 try{
  seasonalityRecord(input,['months','samples','settings','sourceKeyDescription','asOf','asOfMonth']);
  if(!integer(input.asOf)||typeof input.sourceKeyDescription!=='string'||!input.sourceKeyDescription.length||input.sourceKeyDescription.length>4096)throw new SeasonalityUnavailable('Seasonality needs an explicit information cutoff and bounded source description.');
  const currentMonth=seasonalityMonthIndex(input.asOfMonth);
  const monthCount=seasonalityArrayLength(input.months),sampleCount=seasonalityArrayLength(input.samples);
  usage=reserveSeasonality({chartBars:sampleCount,monthFrames:monthCount,sourceRows:0,calendarDays:0,settings:input.settings,compiler:false});
  seasonalityArray(input.months);seasonalityArray(input.samples);
  const exclusions=parseSeasonalityExclusions(input.settings.excludedMonths),ignored=new Set(exclusions),frames=new Map<number,SeasonalityMonth>(),ordered:SeasonalityMonth[]=[];
  let previousIndex=-Infinity,previousOpening=-Infinity,previousEnd=-Infinity,previousLabelEnd=-Infinity;
  for(let i=0;i<input.months.length;i++){
   const frame=seasonalityOwn(input.months,String(i)) as SeasonalityMonth,index=validateMonth(frame,input.asOf);
   if(index<=previousIndex||frame.openingTime<previousEnd||frame.labelOpeningTime<previousLabelEnd||frame.openingTime<=previousOpening||index<=currentMonth&&frame.openingTime>input.asOf||index>currentMonth&&frame.openingTime<=input.asOf)throw new SeasonalityUnavailable('Seasonality months require ordered distinct calendar windows and a consistent cutoff.');
   const copy=Object.freeze({...frame});frames.set(index,copy);ordered.push(copy);previousIndex=index;previousOpening=frame.openingTime;previousEnd=frame.nextOpeningTime;previousLabelEnd=frame.nextLabelOpeningTime;
  }
  const settings=input.settings,events:Array<{frame:SeasonalityMonth;index:number;value:number;available:number}>=[];
  for(const frame of ordered){const index=seasonalityMonthIndex(frame.month),year=Math.floor(index/12),previous=frames.get(index-1),value=returnOf(frame,previous,input.asOf);
   if(year>=settings.startYear&&year<=settings.endYear&&frame.completion==='closed'&&!ignored.has(frame.month)&&value!==null)events.push({frame,index,value,available:Math.max(frame.availableAt!,previous!.availableAt!)});
  }
  events.sort((a,b)=>a.available-b.available||a.index-b.index);
  const pools=Array.from({length:12},accumulator),latest=Array.from({length:12},accumulator),projections:Readonly<SeasonalityProjection>[]=[],projectionByMonth=new Map<string,Readonly<SeasonalityProjection>>();let eventIndex=0;
  for(const frame of ordered){const index=seasonalityMonthIndex(frame.month),year=Math.floor(index/12);if(year<settings.startYear||year>settings.endYear||frame.openingTime>input.asOf)continue;
   // A closed return is available after its own opening. Thus its calendar-month pool cannot include the target year yet.
   while(eventIndex<events.length&&events[eventIndex].available<=frame.openingTime){const event=events[eventIndex++];add(pools[event.index%12],event.value,event.frame);}
   const frozen=statistics(pools[index%12]),prior=frames.get(index-1),baseline=usableClose(prior,frame.openingTime)?prior.close:null;
   let price=baseline!==null&&frozen.mean!==null?baseline*(1+frozen.mean/100):null;if(price!==null&&(!Number.isFinite(price)||price<=0))price=null;
   const excluded=ignored.has(frame.month),state=excluded?'excluded':frozen.count===0?'no-history':baseline===null||price===null?'missing-baseline':'ready';
   const geometry=state==='ready'&&settings.projectionGeometry&&frame.firstTime!==null?Object.freeze({left:frame.firstTime,right:frame.nextLabelOpeningTime,baseline:baseline!,price:price!}):null;
   const projection=Object.freeze({month:frame.month,openingTime:frame.openingTime,baseline:excluded?null:baseline,price:state==='ready'?price:null,statistics:frozen,state,geometry});projections.push(projection);projectionByMonth.set(frame.month,projection);
  }
  const years:Readonly<SeasonalityYear>[]=[];
  for(let year=settings.startYear;year<=settings.endYear;year++){const cells:Readonly<SeasonalityCell>[]=[];
   for(let month=0;month<12;month++){const index=year*12+month,key=seasonalityMonthKey(index),frame=frames.get(index),previous=frames.get(index-1),value=frame?returnOf(frame,previous,input.asOf):null;
    const state:SeasonalityCell['state']=index>currentMonth?'future':ignored.has(key)?'excluded':!frame||frame.observedSessions===0?'absent':frame.availableAt===null||frame.availableAt>input.asOf||value===null||frame.completion==='developing'&&index!==currentMonth?'unavailable':frame.completion==='developing'?'developing':'closed';
    const reason=state==='unavailable'?frame?.completion==='unavailable'?'Month endpoint is unavailable.':!usableClose(previous,input.asOf)?'The preceding calendar month close is unavailable.':frame?.close===null||frame!==undefined&&frame.close!==null&&frame.close<=0?'The observed price is unavailable.':'The observation is not available at this cutoff.':state==='absent'?'No month observation was supplied.':state==='excluded'?'Month excluded from returns and projections.':null;
    cells.push(Object.freeze({month:key,state,value:state==='closed'||state==='developing'?value:null,coverage:frame?.coverage??'unknown',expectedSessions:frame?.expectedSessions??null,observedSessions:frame?.observedSessions??0,reason}));
    if(frame&&value!==null&&(state==='closed'||state==='developing'&&settings.includeDevelopingInSummaries))add(latest[month],value,frame);
   }years.push(Object.freeze({year,cells:Object.freeze(cells)}));
  }
  const series:(number|null)[][]=Array.from({length:4},()=>Array<number|null>(input.samples.length).fill(null));let lastTime=-Infinity,lastMonth=-Infinity;
  for(let i=0;i<input.samples.length;i++){const sample=seasonalityOwn(input.samples,String(i)) as SeasonalitySample;seasonalityRecord(sample,['time','month']);const index=seasonalityMonthIndex(sample.month);
   const frame=frames.get(index);if(!integer(sample.time)||sample.time<=lastTime||sample.time>input.asOf||index<lastMonth||!frame||sample.time<frame.labelOpeningTime||sample.time>=frame.nextLabelOpeningTime)throw new SeasonalityUnavailable('Seasonality samples require observed increasing times within their explicit calendar-label windows and cutoff.');lastTime=sample.time;lastMonth=index;
   const projection=projectionByMonth.get(sample.month);if(!projection||projection.state==='excluded')continue;
   series[0][i]=projection.price;series[1][i]=projection.statistics.mean;series[2][i]=projection.statistics.deviation;series[3][i]=projection.statistics.count||null;
  }
  return Object.freeze({status:'ready',scene:Object.freeze({policy:'lv-consecutive-closes-population-v1',sourceKeyDescription:input.sourceKeyDescription,asOf:input.asOf,exclusions,years:Object.freeze(years),summaries:Object.freeze(latest.map(statistics)),projections:Object.freeze(projections),series:Object.freeze(series.map(values=>Object.freeze(values)))}),usage});
 }catch(error){return Object.freeze({status:'unavailable',scene:null,diagnostic:error instanceof Error?error.message:String(error),usage});}
}
