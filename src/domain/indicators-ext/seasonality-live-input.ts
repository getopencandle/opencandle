import {compileSeasonalityMonths,type SeasonalitySourcePoint} from './seasonality-months';
import {calculateSeasonality} from './seasonality';
import {newYorkClock,newYorkWallTime} from '../us-market-hours';
import type {SeasonalitySettings,SeasonalityMonth,SeasonalityResult,SeasonalityProjection} from './seasonality-types';

/** Pure numerical bridge only. Actual private provider/window and accepted main
 * native ownership are independently required by the closed C producer. No
 * source permission, callback, row resolver, budget or registrar lives here. */
export interface SeasonalityLiveGrid {
 readonly times:readonly number[];
 /** Actual provider frontier, not an inferred calendar opening. This is a pure
  * value; the actual private caller must authenticate its constructor witness. */
 readonly firstObservedTime:number;
}
export interface SeasonalityLiveMonthCache {
 readonly months:readonly Readonly<SeasonalityMonth>[];
 readonly lastClosedDay:number|null;
 readonly compilerSlots:number;
 readonly calendarCacheSlots:number;
}
const own=(value:object,key:PropertyKey):unknown=>{
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('Seasonality live input requires own data.');
 return descriptor.value;
};

/** Called synchronously INSIDE an admitted provider-window consumption stack.
 * It returns no D-row, point or compiler-input alias. All source D graphs remain
 * owned there; the returned scene contains monthly facts/statistics only.
 * Native alignment subsequently creates the sole4M scalar arrays against the
 * exact accepted M grid through the existing authenticated alignment constructor.
 * No arbitrary Proxy/get-trace equivalence is claimed for this pure supplied API.
 */
export function compileLiveSeasonalityDays(points:readonly Readonly<SeasonalitySourcePoint>[],settings:Readonly<SeasonalitySettings>,asOf:number,sourceDescription:string):Readonly<SeasonalityLiveMonthCache>{
 const firstYear=Math.max(settings.startYear,2015),lastYear=Math.min(settings.endYear,2028);
 if(firstYear>lastYear)throw Error('The requested years contain no certified provider history.');
 let last=-Infinity;
 for(let index=0;index<points.length;index++){
  const point=own(points,String(index)) as Readonly<SeasonalitySourcePoint>;
  if(!point||!Number.isSafeInteger(point.time)||point.time<=last||point.availableAt>asOf||point.finalized!==true)throw Error('The consumed daily window is not a closed chronological prefix.');
  last=point.time;
 }
 const compilerSettings={...settings,startYear:firstYear,endYear:lastYear};
 const compiled=compileSeasonalityMonths({points,contract:{calendar:'nyse',session:'extended',kind:'daily',dateLabels:'calendar-midnight'},settings:compilerSettings,sourceKeyDescription:sourceDescription,asOf});
 if(compiled.status!=='ready')throw Error(compiled.diagnostic);
 // 'extended' is the existing conservative endpoint calendar only. All point
 // finalized availability is separately the observed END OF FULL NY DAY. This
 // bridge does not filter or relabel provider daily prices as RTH/extended-only.
 // No compiled.input.samples/D alias is retained by the cache. The actual owner
 // may clear all D point/response graphs after this synchronous build unwinds.
 return Object.freeze({months:compiled.input.months,lastClosedDay:Number.isFinite(last)?last:null,compilerSlots:compiled.usage.compilerSlots,calendarCacheSlots:compiled.usage.calendarCacheSlots});
}

/** Per accepted M-frame: bounded month facts plus M times, NEVER another D scan.
 * The developing point is a separately scoped close-only observation from the
 * actual provider's existing received stream; there is no hidden1Day entry. */
export function calculateLiveSeasonality(cache:Readonly<SeasonalityLiveMonthCache>,developing:Readonly<SeasonalitySourcePoint>|null,grid:Readonly<SeasonalityLiveGrid>,settings:Readonly<SeasonalitySettings>,asOf:number,sourceDescription:string):SeasonalityResult{
 const times=grid.times,length=own(times,'length');
 if(!Array.isArray(times)||Object.getPrototypeOf(times)!==Array.prototype||typeof length!=='number'||!Number.isSafeInteger(length)||length<1||length>100000||!Number.isSafeInteger(asOf)||!Number.isSafeInteger(grid.firstObservedTime))throw Error('The actual accepted intraday time grid is unavailable.');
 const currentMonth=newYorkClock(asOf).date.slice(0,7);
 if(developing&&(!Number.isSafeInteger(developing.time)||!Number.isSafeInteger(developing.availableAt)||developing.availableAt>asOf||developing.finalized!==false||newYorkClock(developing.time).date.slice(0,7)!==currentMonth))throw Error('The developing daily observation is not current.');
 const firstByMonth=new Map<string,number>();let previous=-Infinity;
 for(let index=0;index<length;index++){
  const time=own(times,String(index));if(typeof time!=='number'||!Number.isSafeInteger(time)||time<=previous||time>asOf)throw Error('The accepted chart time grid changed or exceeds its actual information clock.');previous=time;
  const month=newYorkClock(time).date.slice(0,7);if(!firstByMonth.has(month))firstByMonth.set(month,time);
 }
 const firstLoaded=own(times,'0') as number,oldestMonth=newYorkClock(firstLoaded).date.slice(0,7);
 if(grid.firstObservedTime>firstLoaded||newYorkClock(grid.firstObservedTime).date.slice(0,7)!==oldestMonth)throw Error('The actual oldest-month frontier does not match its native grid.');
 firstByMonth.set(oldestMonth,grid.firstObservedTime);
 const months:Readonly<SeasonalityMonth>[]=cache.months.map(month=>{
  const use=developing&&month.month===currentMonth&&(cache.lastClosedDay===null||developing.time>cache.lastClosedDay);
  return Object.freeze({...month,firstTime:firstByMonth.get(month.month)??null,...(use?{close:developing.close,availableAt:developing.availableAt,completion:'developing' as const,coverage:'sparse' as const,observedSessions:month.observedSessions+1}:{})});
 });
 const modelSettings={...settings,externalNumericSlots:settings.externalNumericSlots+cache.calendarCacheSlots};
 // Empty pure-model samples intentionally avoid retaining a redundant4D/4M
 // source series. Exact M output is built once by seasonalityAlignedResult.
 return calculateSeasonality({months,samples:[],settings:modelSettings,sourceKeyDescription:sourceDescription,asOf,asOfMonth:currentMonth});
}

/** Additional arithmetic metadata only; actual provider/source admission stays
 * outside this pure constructor. All old published prices remain unchanged. */
export function ownedLiveAlignmentCost(months:number):Readonly<{operations:number;numericSlots:number}>{
 if(!Number.isSafeInteger(months)||months<1||months>168)throw Error('The compiled live month extent is unavailable.');
 return liveBinFreeze({operations:2048*months+8192,numericSlots:3*months+128});
}
interface OwnedLiveAlignment {
 result:WeakRef<object>;scene:WeakRef<object>;times:WeakRef<readonly number[]>;boundaries:Float64Array;firstMonth:number;count:number;
}
const ownedLiveAlignmentRecords=new WeakMap<object,OwnedLiveAlignment>(),ownedLiveResultAlignment=new WeakMap<object,WeakRef<object>>();
const liveBinDescriptor=Object.getOwnPropertyDescriptor,liveBinPrototype=Object.getPrototypeOf,liveBinHasOwn=Object.hasOwn,liveBinFrozen=Object.isFrozen,liveBinFreeze=Object.freeze,LiveBinFloat64=Float64Array;
function liveBinOwn(value:unknown,key:PropertyKey):unknown{if(!value||typeof value!=='object')throw Error('Compiled live arithmetic requires own data.');const field=liveBinDescriptor(value,key);if(!field||!liveBinHasOwn(field,'value'))throw Error('Compiled live arithmetic field is unavailable.');return field.value;}
function liveBinMonth(value:unknown):number{
 if(typeof value!=='string'||!/^\d{4}-\d{2}$/.test(value))throw Error('The compiled live month key is unavailable.');const year=Number(value.slice(0,4)),month=Number(value.slice(5));if(year<1||year>9999||month<1||month>12)throw Error('The civil month is unavailable.');return year*12+month-1;
}
function liveBinKey(index:number):string{return String(Math.floor(index/12)).padStart(4,'0')+'-'+String(index%12+1).padStart(2,'0');}
function compiledLiveBins(cache:Readonly<SeasonalityLiveMonthCache>){
 const months=liveBinOwn(cache,'months') as readonly Readonly<SeasonalityMonth>[],F=liveBinOwn(months,'length');
 if(!Array.isArray(months)||liveBinPrototype(months)!==Array.prototype||typeof F!=='number'||!Number.isSafeInteger(F)||F<1||F>168||!liveBinFrozen(months))throw Error('The owned compiled month frames are unavailable.');
 ownedLiveAlignmentCost(F);const boundaries=new LiveBinFloat64(F+1);let firstMonth=-1,previous=-Infinity;
 for(let index=0;index<F;index++){
  const month=liveBinOwn(months,String(index));if(!month||typeof month!=='object'||!liveBinFrozen(month))throw Error('The compiled month is not immutable.');
  const key=liveBinOwn(month,'month'),ordinal=liveBinMonth(key);if(ordinal<2015*12||ordinal>=2029*12)throw Error('The compiled NY month is outside certification.');if(index===0)firstMonth=ordinal;if(ordinal!==firstMonth+index)throw Error('The compiled NY month sequence changed.');
  // Civil midnight labels, including DST and year rollover; never09:30 or UTC.
  const opening=newYorkWallTime(String(key)+'-01',0),next=newYorkWallTime(liveBinKey(ordinal+1)+'-01',0);
  if(!Number.isSafeInteger(opening)||!Number.isSafeInteger(next)||opening>=next||opening<=previous||index&&boundaries[index]!==opening||liveBinOwn(month,'labelOpeningTime')!==opening||liveBinOwn(month,'nextLabelOpeningTime')!==next)throw Error('The compiled NY label boundaries changed.');
  boundaries[index]=opening;boundaries[index+1]=next;previous=opening;
 }
 return{months,F,boundaries,firstMonth};
}
/** Actual daily-window caller authenticates its cache BEFORE this arithmetic.
 * The result/opaque holder grants no provider, original-row or native access.
 * Holder is retained by that real window until its active/unwind lifetime ends. */
export function calculateOwnedLiveSeasonality(cache:Readonly<SeasonalityLiveMonthCache>,developing:Readonly<SeasonalitySourcePoint>|null,grid:Readonly<SeasonalityLiveGrid>,settings:Readonly<SeasonalitySettings>,asOf:number,sourceDescription:string):Readonly<{result:SeasonalityResult;alignment:object|null}>{
 const times=liveBinOwn(grid,'times') as readonly number[],length=liveBinOwn(times,'length'),firstObserved=liveBinOwn(grid,'firstObservedTime');
 if(!Array.isArray(times)||liveBinPrototype(times)!==Array.prototype||!liveBinFrozen(times)||typeof length!=='number'||!Number.isSafeInteger(length)||length<1||length>100000||!Number.isSafeInteger(asOf)||!Number.isSafeInteger(firstObserved))throw Error('The owned accepted time grid is unavailable.');
 const currentMonth=newYorkClock(asOf).date.slice(0,7);
 if(developing&&(!Number.isSafeInteger(developing.time)||!Number.isSafeInteger(developing.availableAt)||developing.availableAt>asOf||developing.finalized!==false||newYorkClock(developing.time).date.slice(0,7)!==currentMonth))throw Error('The developing daily observation is not current.');
 const bins=compiledLiveBins(cache),firstTimes=new LiveBinFloat64(bins.F);firstTimes.fill(NaN);let previous=-Infinity,cursor=-1;
 for(let index=0;index<length;index++){
  const time=liveBinOwn(times,String(index));if(typeof time!=='number'||!Number.isSafeInteger(time)||time<=previous||time>asOf)throw Error('The accepted chart time grid changed or exceeds its actual information clock.');previous=time;
  while(cursor+1<bins.F&&time>=bins.boundaries[cursor+1])cursor++;
  if(cursor>=0&&time<bins.boundaries[cursor+1]&&!Number.isFinite(firstTimes[cursor]))firstTimes[cursor]=time;
 }
 const firstLoaded=liveBinOwn(times,'0') as number,oldestMonth=newYorkClock(firstLoaded).date.slice(0,7);
 if((firstObserved as number)>firstLoaded||newYorkClock(firstObserved as number).date.slice(0,7)!==oldestMonth)throw Error('The actual oldest-month frontier does not match its native grid.');
 const oldestIndex=liveBinMonth(oldestMonth)-bins.firstMonth;if(oldestIndex>=0&&oldestIndex<bins.F)firstTimes[oldestIndex]=firstObserved as number;
 const months:Readonly<SeasonalityMonth>[]=bins.months.map((month,index)=>{
  const use=developing&&month.month===currentMonth&&(cache.lastClosedDay===null||developing.time>cache.lastClosedDay);
  return liveBinFreeze({...month,firstTime:Number.isFinite(firstTimes[index])?firstTimes[index]:null,...(use?{close:developing.close,availableAt:developing.availableAt,completion:'developing' as const,coverage:'sparse' as const,observedSessions:month.observedSessions+1}:{})});
 });
 const modelSettings={...settings,externalNumericSlots:settings.externalNumericSlots+cache.calendarCacheSlots};
 const result=calculateSeasonality({months,samples:[],settings:modelSettings,sourceKeyDescription:sourceDescription,asOf,asOfMonth:currentMonth});
 if(result.status!=='ready')return liveBinFreeze({result,alignment:null});
 const alignment=liveBinFreeze({});ownedLiveAlignmentRecords.set(alignment,{result:new WeakRef(result),scene:new WeakRef(result.scene),times:new WeakRef(times),boundaries:bins.boundaries,firstMonth:bins.firstMonth,count:length});ownedLiveResultAlignment.set(result,new WeakRef(alignment));
 return liveBinFreeze({result,alignment});
}
/** Derived scalar arrays only. No grid/boundary/source resolver is exposed.
 * Actual source-result/reservation permission is separately mandatory in chart. */
export function alignOwnedLiveSeasonality(result:Readonly<SeasonalityResult>,times:readonly number[]):readonly (readonly (number|null)[])[]{
 const key=ownedLiveResultAlignment.get(result)?.deref(),record=key&&ownedLiveAlignmentRecords.get(key);
 if(!record||record.result.deref()!==result||record.times.deref()!==times)throw Error('The owned live alignment retired.');
 if(result.status!=='ready'||record.scene.deref()!==result.scene||!liveBinFrozen(times)||liveBinOwn(times,'length')!==record.count)throw Error('The owned live result/grid changed.');
 const F=record.boundaries.length-1,projections:Array<Readonly<SeasonalityProjection>|null>=Array(F).fill(null);
 for(const row of result.scene.projections){const index=liveBinMonth(row.month)-record.firstMonth;if(index>=0&&index<F)projections[index]=row;}
 const values:Array<Array<number|null>>=Array.from({length:4},()=>Array<number|null>(record.count).fill(null));let cursor=-1;
 for(let index=0;index<record.count;index++){
  const time=times[index];while(cursor+1<F&&time>=record.boundaries[cursor+1])cursor++;
  if(time>result.scene.asOf||cursor<0||time>=record.boundaries[cursor+1])continue;const row=projections[cursor];if(!row||row.state==='excluded')continue;
  values[0][index]=row.price;values[1][index]=row.statistics.mean;values[2][index]=row.statistics.deviation;values[3][index]=row.statistics.count||null;
 }
 return liveBinFreeze(values.map(row=>liveBinFreeze(row)));
}
