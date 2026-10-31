import type {IndicatorResult} from '../domain/indicators';
import {seasonalityAlignedOwnedLiveResult} from './seasonality-presentation';
import {ownedLiveAlignmentCost} from '../domain/indicators-ext/seasonality-live-input';
import {traceSeasonalityDiagnostic,type SeasonalityDiagnosticTrace} from './seasonality-diagnostic-trace';
import {isDerivedStyle} from './derived/common';
import {seasonalityCalendarAxisCost,seasonalityIntradayAxisCost,type SeasonalityCalendarAxisHandle} from './seasonality-calendar-axis';
import type {Bar} from '../domain/types';
import {newYorkClock,newYorkWallTime,usSessionDay} from '../domain/us-market-hours';
import {compileSeasonalityMonths,type SeasonalitySourcePoint,type SeasonalityCalendarContract} from '../domain/indicators-ext/seasonality-months';
import {calculateSeasonality} from '../domain/indicators-ext/seasonality';
import {reserveSeasonality,type SeasonalitySettings,type SeasonalityResult,type SeasonalityMonth,type SeasonalitySample} from '../domain/indicators-ext/seasonality-types';
import {captureLocalCandleContext,localCandleContextFacts,captureSeasonalityDailyContext,seasonalityDailyContextInputValuesMatch,type ChartSourceContext,type LocalCandleContextLease} from './source-context';
import {localCandleCloneMatchesContext,seasonalityLiveNativeInputMatches} from './profile-input-clone';
import type {BuiltinSourceCost,BuiltinSourceReservation,BuiltinScenePublication} from './builtin-presentation-proof';
import {BUILTIN_SEASONALITY_PREPARATION_COST} from './builtin-presentation-proof';
import {previewAlpacaSeasonalityDailyPlanPreparation,createAlpacaSeasonalityPreparationGroup,runAlpacaSeasonalityPreparationGroup,releaseAlpacaSeasonalityPreparationGroup,assertAlpacaSeasonalityDailyWindow,releaseAlpacaSeasonalityDailyWindow,consumeAlpacaSeasonalityDailyWindowOwned,consumeAlpacaSeasonalityDailyWindow,alpacaSeasonalityDailyDemandMatches,captureAlpacaSeasonalityGeometryFacts,alpacaSeasonalityPreparationWorkFacts,alpacaSeasonalityHistoryResultMatches,type AlpacaSeasonalityDailyPlan,type AlpacaSeasonalityPreparationCost,type AlpacaSeasonalityDailyDemand,type AlpacaSeasonalityDailyWindow,type AlpacaSeasonalityPreparationGroup} from '../domain/alpaca-live';
import {parseInterval} from '../domain/intervals';
import {seasonalityIntradayBoxCost} from './seasonality-intraday-boxes';
import {SEASONALITY_NATIVE_ORIGIN_COST,type SeasonalityNativeOrigin} from './seasonality-native-origin';

/** Constructor-only dependencies. No public chart/indicator method receives this host. */
export interface PrimarySourceBasis {
 readonly basis:object;readonly phase:'pending'|'accepted';readonly context:ChartSourceContext;
 readonly rows:number;readonly style:string;readonly execution:string;readonly forming:boolean;
 /** Actual constructor-selected chart mode, descriptive geometry only. */
 readonly session?:'regular'|'extended';readonly firstTime?:number;assertSessionCurrent?():void;
 assertCurrent():void;
}
/** Constructor-issued geometry only. Numerical/source permission still needs the actual consumed-result witness. */
export interface PrimaryCalendarHold {lease:SeasonalityCalendarAxisHandle|null;pending:boolean}
export interface PrimaryCalendarFrame {
 readonly publication:object;readonly frame:object;readonly count:number;readonly tail:number;
 install(labels:Float64Array,hold:PrimaryCalendarHold):SeasonalityCalendarAxisHandle;
 installSegments?(times:Float64Array,offsets:Float64Array,hold:PrimaryCalendarHold):SeasonalityCalendarAxisHandle;
 captureOrigin?(model:object,rendererId:string):SeasonalityNativeOrigin|null;
}
export interface PrimarySourceFrame {
 readonly basis:object;readonly context:ChartSourceContext;readonly raw:readonly Bar[];
 readonly nativeRaw:readonly unknown[];readonly native:readonly unknown[];readonly shown:readonly unknown[];
 readonly nativeTimes?:readonly number[];
 readonly style:string;readonly execution:string;readonly forming:boolean;readonly calendar?:Readonly<PrimaryCalendarFrame>;
 assertCurrent():void;presentationReady():boolean;
}
/** Fixed actual constructor description. A mode descriptor provides no
 * accepted native frame and never replaces capture()/accepted() numeric gates. */
export interface PrimarySourceMode {readonly context:ChartSourceContext;readonly execution:string;assertCurrent():void}
export interface OwnedPrimarySourceHost {
 sourceMode?():PrimarySourceMode|null;
 capture():PrimarySourceBasis|null;
 accepted(basis:object,liveGeometry?:true):PrimarySourceFrame|null;
 subscribeSettled(listener:()=>void):()=>void;
}
export interface PrimarySourceRequest {
 calendar:'utc-continuous'|'nyse';session:'continuous'|'regular'|'extended';dateLabels:'utc-date'|'calendar-midnight';
 closedThrough:number;startYear:number;endYear:number;excludedMonths:string;includeDevelopingInSummaries:boolean;
 meanRow:boolean;deviationRow:boolean;positiveFrequencyRow:boolean;projectionGeometry:boolean;signal:AbortSignal;
}
/** Owner/frame assertions are not numerical proof; read() consumes the complete current-original result once. */
export interface PrimarySourceView {assertCurrent():void;read():Readonly<SeasonalityResult>;dispose():void}
export interface PrimaryLiveDailyPlan {readonly source:AlpacaSeasonalityDailyPlan;readonly preparation:Readonly<AlpacaSeasonalityPreparationCost>;readonly session:'regular'|'extended';readonly minutes:number;readonly firstLoadedTime:number}
export interface PrimarySourcePlan {readonly cost:Readonly<BuiltinSourceCost>;readonly settings:Readonly<SeasonalitySettings>;readonly contract:Readonly<SeasonalityCalendarContract>;readonly originalRows:number;readonly inputRows:number;readonly cutoff:number;readonly liveDaily?:Readonly<PrimaryLiveDailyPlan>}
interface LivePlanWork {peakOperations:number;retainedOperations:number}
const livePlanWork=new WeakMap<object,Readonly<LivePlanWork>>();
class PrimarySourcePending extends Error{}
export const isPrimarySourcePending=(error:unknown):boolean=>error instanceof PrimarySourcePending;
const unavailable=()=>Error('The current original candle source is unavailable.');
const signalAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,addAbort=EventTarget.prototype.addEventListener,removeAbort=EventTarget.prototype.removeEventListener;
export function primarySourceAborted(signal:AbortSignal):boolean{return Reflect.apply(signalAborted,signal,[]) as boolean;}
/** Native brand check and native subscription: no caller accessor/method can provide cancellation authority. */
export function subscribePrimaryAbort(signal:AbortSignal,callback:()=>void):()=>void{primarySourceAborted(signal);Reflect.apply(addAbort,signal,['abort',callback,{once:true}]);return()=>{Reflect.apply(removeAbort,signal,['abort',callback]);};}

function releaseSourceSubscriptions(releases:readonly (()=>void)[]):void{const failures:unknown[]=[];for(const release of releases)try{release();}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Original source subscriptions failed to release.');}
function own(value:unknown,key:PropertyKey):any{if(!value||typeof value!=='object')throw unavailable();const field=Object.getOwnPropertyDescriptor(value,key);if(!field?.enumerable||!Object.hasOwn(field,'value'))throw unavailable();return field.value;}
function numeric(value:unknown):number{if(typeof value!=='number'||!Number.isFinite(value))throw unavailable();return value;}
function count(value:unknown):number{const field=value&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,'length'):undefined;if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||!field||!Object.hasOwn(field,'value')||!Number.isSafeInteger(field.value)||field.value<1||field.value>100000)throw unavailable();return field.value;}
const FIELDS=['time','open','high','low','close','volume'] as const;
const REQUEST=['calendar','session','dateLabels','closedThrough','startYear','endYear','excludedMonths','includeDevelopingInSummaries','meanRow','deviationRow','positiveFrequencyRow','projectionGeometry','signal'] as const;
/** Fixed known descriptors: arbitrary additional own properties are never enumerated or trusted. */
export function normalizePrimarySourceRequest(request:PrimarySourceRequest):Readonly<PrimarySourceRequest>{
 const values=REQUEST.map(key=>own(request,key));const normalized=Object.fromEntries(REQUEST.map((key,index)=>[key,values[index]])) as unknown as PrimarySourceRequest;
 if(!['utc-continuous','nyse'].includes(normalized.calendar)||!['continuous','regular','extended'].includes(normalized.session)||!['utc-date','calendar-midnight'].includes(normalized.dateLabels)||!Number.isSafeInteger(normalized.closedThrough)||normalized.calendar==='utc-continuous'&&normalized.session!=='continuous'||normalized.calendar==='nyse'&&normalized.session==='continuous')throw unavailable();
 if(!Number.isSafeInteger(normalized.startYear)||!Number.isSafeInteger(normalized.endYear)||normalized.startYear<1||normalized.endYear>9999||normalized.startYear>normalized.endYear||typeof normalized.excludedMonths!=='string'||normalized.excludedMonths.length>200)throw unavailable();
 for(const key of ['includeDevelopingInSummaries','meanRow','deviationRow','positiveFrequencyRow','projectionGeometry'] as const)if(typeof normalized[key]!=='boolean')throw unavailable();
 if(primarySourceAborted(normalized.signal))throw unavailable();return Object.freeze(normalized);
}
/** Before numerical capture, native arrays, calendar work or await. No supplied budget amounts. */
export function planPrimarySource(basis:PrimarySourceBasis,request:Readonly<PrimarySourceRequest>,nativeSeasonality=false,calendarOwners=0):Readonly<PrimarySourcePlan>{
 if(nativeSeasonality){const route=captureSeasonalityDailyContext(basis.context,2015,2028,basis.execution);if(route){const daily=captureSeasonalityDailyContext(basis.context,request.startYear,request.endYear,basis.execution);if(!daily)throw Error('The saved requested years have no supported observed daily-history window. History starts in 2015; NYSE calendar calculations after 2028 are unavailable.');return planLiveDailyPrimarySource(basis,request,daily,calendarOwners);}}
 basis.assertCurrent();const facts=localCandleContextFacts(basis.context);if(!facts||facts.inputRows!==basis.rows)throw unavailable();
 const kind=facts.resolution==='1D'?'daily':facts.resolution==='1M'?'monthly':null;if(!kind||isDerivedStyle(basis.style))throw unavailable();
 const N=facts.rows,M=facts.inputRows,F=(request.endYear-request.startYear+1)*12+Number(request.startYear>1&&(request.calendar!=='nyse'||request.startYear>2015));
 const A=7*N+1552+8*M+512+6*N+1024+N+128+4*M+256+16;
 const settings:SeasonalitySettings={startYear:request.startYear,endYear:request.endYear,excludedMonths:request.excludedMonths,includeDevelopingInSummaries:request.includeDevelopingInSummaries,meanRow:request.meanRow,deviationRow:request.deviationRow,positiveFrequencyRow:request.positiveFrequencyRow,projectionGeometry:request.projectionGeometry,externalNumericSlots:A};
 const compiler=reserveSeasonality({chartBars:N,sourceRows:N,monthFrames:F,calendarDays:F*31,settings,compiler:true});
 const model=reserveSeasonality({chartBars:N,sourceRows:0,monthFrames:F,calendarDays:0,settings:{...settings,externalNumericSlots:A+compiler.compilerSlots+compiler.calendarCacheSlots},compiler:false});
 // The actual model kind selects this mode in the private factory; requests contain no budget amounts.
 // Alignment may use NY source-clock formatting once per row; native cells/shapes include layout scratch.
 const T=model.tableCells,extraW=nativeSeasonality?1024*N+256*T+128*F+262144:0,extraU=nativeSeasonality?M+32*T+48*F+256*4+512:0;
 const calendar=nativeSeasonality&&request.projectionGeometry&&calendarOwners?seasonalityCalendarAxisCost(calendarOwners):null;
 const cost=Object.freeze({operations:(calendar?.operations??0)+compiler.operations+model.operations+1024*N+16384+512*M+8192+256*M+8192+1024*M+8192+7*8192+1024*N+16384+extraW,numericSlots:(calendar?.numericSlots??0)+Math.max(compiler.numericSlots,model.numericSlots)+extraU,pendingSlots:nativeSeasonality?1024:512});
 if(!Number.isSafeInteger(cost.operations)||cost.operations>20000000||cost.numericSlots+cost.pendingSlots>2000000)throw Error('The original candle source exceeds the current study budget.');basis.assertCurrent();
 return Object.freeze({cost,settings:Object.freeze(settings),contract:Object.freeze({calendar:request.calendar,session:request.session,kind,dateLabels:request.dateLabels}),originalRows:N,inputRows:M,cutoff:request.closedThrough});
}
/** Actual provider classification selects this route. Failure is unavailable;
 * it never substitutes the chart's M bars as multi-year daily observations.
 * The four stored declarations remain saved but do not rewrite actual source
 * timeframe/session/day basis or the provider's closed observed cutoff. */
function planLiveDailyPrimarySource(basis:PrimarySourceBasis,request:Readonly<PrimarySourceRequest>,daily:AlpacaSeasonalityDailyPlan,calendarOwners:number):Readonly<PrimarySourcePlan>{
 basis.assertCurrent();daily.assertCurrent();basis.assertSessionCurrent?.();const session=basis.session,first=basis.firstTime,M=basis.rows,N=daily.sourceRows,spec=parseInterval(basis.context.resolution??'');
 if((session!=='regular'&&session!=='extended')||!basis.assertSessionCurrent||!Number.isSafeInteger(first)||spec.kind!=='time'||!spec.seconds||spec.seconds%60!==0||spec.seconds<60||spec.seconds>=86400||isDerivedStyle(basis.style)||!Number.isSafeInteger(M)||M<1||M>N)throw unavailable();
 const preparation=previewAlpacaSeasonalityDailyPlanPreparation(daily,request.projectionGeometry?{firstLoadedTime:first!,session}:undefined),F=preparation.monthFrames;
 // Full original selection pins + actual profile clone/native/HA passes,
 // current result and old/new native layouts. No new N-sized snapshot exists.
 const A=14*N+32*M+4096,settings:SeasonalitySettings={startYear:request.startYear,endYear:request.endYear,excludedMonths:request.excludedMonths,includeDevelopingInSummaries:request.includeDevelopingInSummaries,meanRow:request.meanRow,deviationRow:request.deviationRow,positiveFrequencyRow:request.positiveFrequencyRow,projectionGeometry:request.projectionGeometry,externalNumericSlots:A};
 const model=reserveSeasonality({chartBars:M,sourceRows:0,monthFrames:F,calendarDays:0,settings,compiler:false}),T=model.tableCells,axis=request.projectionGeometry&&calendarOwners?seasonalityIntradayAxisCost(calendarOwners):null,fee=BUILTIN_SEASONALITY_PREPARATION_COST;
 const boxes=request.projectionGeometry?seasonalityIntradayBoxCost(F):null,originW=boxes?24*SEASONALITY_NATIVE_ORIGIN_COST.operations:0,originU=boxes?2*SEASONALITY_NATIVE_ORIGIN_COST.numericSlots:0,pairW=boxes?32*373+2048:0,binsCost=ownedLiveAlignmentCost(F);
 const verification=2048*N+3072*M+2048*F+model.operations+256*T+262144+(axis?.operations??0)+(boxes?.operations??0)+originW+pairW+binsCost.operations,persistent=A+model.numericSlots+32*T+48*F+4096+(axis?.numericSlots??0)+(boxes?.numericSlots??0)+fee.numericSlots+1024+originU+40+64+binsCost.numericSlots+256;
 // Preparation and ready arithmetic are disjoint stacks. Their physical
 // overlap U is conservatively SUMMED; no page/cache/native credit is borrowed.
 // 2048/1024 additionally funds initial scope+model demand acquisition.
 const cost=Object.freeze({operations:Math.max(preparation.providerOperations+preparation.additionalPeakOperations+fee.operations+2048+1024+4608+32768,verification+fee.operations+1024+4608+32768),numericSlots:preparation.providerNumericSlots+preparation.additionalPeakNumericSlots+persistent,pendingSlots:1024});
 if(!Number.isSafeInteger(cost.operations)||!Number.isSafeInteger(cost.numericSlots)||cost.operations>20000000||cost.numericSlots+cost.pendingSlots>2000000)throw Error('The complete daily-history/source/native overlap exceeds the current Seasonality budget.');
 const retainedOperations=1024*M+128*F+256*T+(axis?.operations??0)+(boxes?.operations??0)+originW+pairW+262144+fee.operations+3072+1024+4608+binsCost.operations+32768;if(!Number.isSafeInteger(retainedOperations)||retainedOperations>cost.operations)throw unavailable();
 basis.assertCurrent();basis.assertSessionCurrent();daily.assertCurrent();const planned=Object.freeze({cost,settings:Object.freeze(settings),contract:Object.freeze({calendar:'nyse' as const,session,kind:'daily' as const,dateLabels:'calendar-midnight' as const}),originalRows:N,inputRows:M,cutoff:daily.facts.closedThrough,liveDaily:Object.freeze({source:daily,preparation,session,minutes:spec.seconds/60,firstLoadedTime:first!})});livePlanWork.set(planned,Object.freeze({peakOperations:cost.operations,retainedOperations}));return planned;
}
function utcDate(date:string):number{const value=new Date(0);const [year,month,day]=date.split('-').map(Number);value.setUTCFullYear(year,month-1,day);value.setUTCHours(0,0,0,0);return value.getTime()/1000;}
function endOfLabel(time:number,contract:SeasonalityCalendarContract):number{
 const date=contract.dateLabels==='utc-date'?new Date(time*1000).toISOString().slice(0,10):contract.calendar==='nyse'?newYorkClock(time).date:new Date(time*1000).toISOString().slice(0,10);
 if(contract.kind==='daily'){const day=contract.calendar==='nyse'?usSessionDay(date):null;if(day&&(day.holiday||day.weekend))throw unavailable();return day?newYorkWallTime(date,contract.session==='regular'?day.close:day.postClose):utcDate(date)+86400;}
 const next=new Date(utcDate(date)*1000);next.setUTCMonth(next.getUTCMonth()+1,1);const nextTime=next.getTime()/1000;if(contract.calendar==='utc-continuous')return nextTime;
 for(let time=nextTime-86400;time>=utcDate(date);time-=86400){const label=new Date(time*1000).toISOString().slice(0,10),day=usSessionDay(label);if(!day.weekend&&!day.holiday)return newYorkWallTime(label,contract.session==='regular'?day.close:day.postClose);}throw unavailable();
}
/** No copy or lock of source/native rows. All passes are charged by the closed planner. */
function verifyNative(frame:PrimarySourceFrame,plan:PrimarySourcePlan,assert:()=>void):void{
 const M=plan.inputRows;if(plan.liveDaily){if(!frame.nativeTimes||!seasonalityLiveNativeInputMatches(frame.raw,frame.context,M,frame.nativeRaw,frame.native,frame.shown,frame.style,frame.nativeTimes,assert))throw unavailable();return;}
 const clone=localCandleCloneMatchesContext;if(count(frame.raw)!==M||count(frame.nativeRaw)!==M||count(frame.native)!==M||count(frame.shown)!==M||!clone(frame.raw,frame.context,M))throw unavailable();
 let haOpen:number|undefined,haClose:number|undefined,prior=-Infinity;
 for(let index=0;index<M;index++){
  assert();const raw=own(frame.raw,String(index)),nativeRaw=own(frame.nativeRaw,String(index)),native=own(frame.native,String(index)),shown=own(frame.shown,String(index));
  const time=numeric(own(raw,'time'));if(time<=prior)throw unavailable();prior=time;
  const values=FIELDS.map(key=>numeric(own(raw,key)));if(Math.min(values[1],values[2],values[3],values[4])<=0||values[5]<0||values[2]<Math.max(values[1],values[3],values[4])||values[3]>Math.min(values[1],values[2],values[4]))throw unavailable();
  const o=values[1],h=values[2],l=values[3],c=values[4],nextOpen=haOpen===undefined?(o+c)/2:(haOpen+haClose!)/2,nextClose=(o+h+l+c)/4;
  const expected=frame.style==='heikinashi'?[time*1000,nextOpen,Math.max(h,nextOpen,nextClose),Math.min(l,nextOpen,nextClose),nextClose,values[5]]:[time*1000,...values.slice(1)];
  for(let field=0;field<FIELDS.length;field++){if(!Object.is(numeric(own(nativeRaw,FIELDS[field])),field?values[field]:time*1000)||!Object.is(numeric(own(native,FIELDS[field])),expected[field])||!Object.is(numeric(own(shown,FIELDS[field])),expected[field]))throw unavailable();}
  haOpen=nextOpen;haClose=nextClose;assert();
 }
 if(!clone(frame.raw,frame.context,M))throw unavailable();assert();
}
interface PreparedState {diagnostic?:SeasonalityDiagnosticTrace|null;frame:PrimarySourceFrame|null;reservation:BuiltinSourceReservation|null;origin:Pick<LocalCandleContextLease,'isCurrent'|'assertCurrent'|'dispose'>|null;result:Readonly<SeasonalityResult>|null;current:(()=>void)|null;off:(()=>void)|null;live:boolean;busy:boolean;consumed:boolean}
interface LivePreparation {
 host:WeakRef<OwnedPrimarySourceHost>;basis:WeakRef<PrimarySourceBasis>;plan:Readonly<PrimarySourcePlan>;request:Readonly<PrimarySourceRequest>;demand:AlpacaSeasonalityDailyDemand;
 alignmentConsumed:boolean;times:readonly number[]|null;geometry:Readonly<{times:readonly number[];firstObservedTime:number;firstLoadedTime:number;prefixBars:number}>|null;preparation:BuiltinScenePublication;group:AlpacaSeasonalityPreparationGroup|null;window:AlpacaSeasonalityDailyWindow|null;
 acceptNativeOwner:(()=>void)|null;attachGroup:((group:AlpacaSeasonalityPreparationGroup)=>void)|null;offs:(()=>void)[];
 resolve:((view:PrimarySourceView)=>void)|null;reject:((error:unknown)=>void)|null;view:PrimarySourceView|null;started:boolean;ready:boolean;numericUnwindPending:boolean;
}
const livePreparations=new WeakMap<PreparedState,LivePreparation>();
const ownedSourceStates=new WeakMap<object,PreparedState>();
interface ViewHandle {state:WeakRef<PreparedState>}
const views=new WeakMap<object,ViewHandle>();
// A readonly witness for ONE actual successful consumption; no resolver or attachment/mint API exists.
const consumedResults=new WeakMap<object,WeakRef<PreparedState>>();
export function consumedPrimarySourceResultBelongs(result:object,reservation:BuiltinSourceReservation):boolean{const state=consumedResults.get(result)?.deref();return !!state&&state.reservation===reservation&&state.result===result&&state.live&&state.consumed&&!state.busy;}
/** Callback-free fixed lookup after ONE genuine admitted consumption. No public metadata can mint this association. */
export function consumedPrimaryCalendarFrame(result:object,reservation:BuiltinSourceReservation):Readonly<PrimaryCalendarFrame>|null{
 if(!consumedPrimarySourceResultBelongs(result,reservation))return null;return consumedResults.get(result)!.deref()!.frame?.calendar??null;
}
/** Geometry values are available only for the SAME privately consumed live
 * result/reservation and actual provider frontier. The M array was constructed
 * and frozen inside that admitted operation; this is not a supplied grid key. */
export function consumedPrimaryIntradayGeometry(result:object,reservation:BuiltinSourceReservation):Readonly<{times:readonly number[];firstObservedTime:number;firstLoadedTime:number;prefixBars:number}>|null{
 if(!consumedPrimarySourceResultBelongs(result,reservation))return null;const state=consumedResults.get(result)?.deref(),meta=state&&livePreparations.get(state);return meta?.geometry??null;
}
export function consumedPrimarySourceResultMatches(result:object,reservation:BuiltinSourceReservation):boolean{
 if(!consumedPrimarySourceResultBelongs(result,reservation))return false;const state=consumedResults.get(result)!.deref()!;
 try{return currentState(state)===state;}catch{return false;}
}
/** Fixed private phased-work witness ONLY. No caller supplies a credit/retained
 * amount. ROOT additionally requires SAME armed group, actual native acceptance
 * and its own publication-stack unwind before retiring peak-minus-retained W.
 * No U or source/publication authority is granted/released by this query. */
export function consumedPrimarySourceWorkComponents(result:object,reservation:BuiltinSourceReservation):Readonly<{peakOperations:number;retainedOperations:number;preparationGroup:AlpacaSeasonalityPreparationGroup;unwound:boolean}>|null{
 if(!consumedPrimarySourceResultMatches(result,reservation))return null;const state=consumedResults.get(result)?.deref(),meta=state&&livePreparations.get(state),work=meta&&livePlanWork.get(meta.plan),group=meta?.group;
 if(!state||!meta||!work||!group||!meta.window||state.result!==result)return null;const physical=alpacaSeasonalityPreparationWorkFacts(group,result);if(!physical||!consumedPrimarySourceResultMatches(result,reservation)||livePreparations.get(state)!==meta||meta.group!==group)return null;
 return Object.freeze({peakOperations:work.peakOperations,retainedOperations:work.retainedOperations,preparationGroup:group,unwound:physical.unwound&&!meta.numericUnwindPending});
}
function retire(state:PreparedState){if(!state.live)return;if(livePreparations.has(state)){retireLiveState(state);return;}state.live=false;const reservation=state.reservation,origin=state.origin,off=state.off;state.reservation=null;state.origin=null;state.frame=null;state.result=null;state.current=null;state.off=null;const failures:unknown[]=[];for(const release of [()=>reservation?.release(),()=>origin?.dispose(),()=>off?.()])try{release();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Original source lease cleanup was incomplete.');}
function stateRecord(key:object):PreparedState{const state=views.get(key)?.state.deref();if(!state?.live)throw unavailable();return state;}
function stateFor(key:object):PreparedState{return currentState(stateRecord(key));}
function currentState(state:PreparedState):PreparedState{try{state.reservation!.assertCurrent();state.current!();state.frame!.assertCurrent();if(!state.origin!.isCurrent())throw unavailable();state.current!();state.frame!.assertCurrent();state.reservation!.assertCurrent();return state;}catch(error){try{retire(state);}catch(cleanup){throw new AggregateError([error,cleanup],'Original source ownership and cleanup failed.');}throw error;}}
/** Owner assertions are cheap; only this one whole-model consumption proves current original values. */
function view(key:object):PrimarySourceView{return Object.freeze({
 assertCurrent(){const state=stateRecord(key);if(state.busy)throw Error('The original candle source is being consumed.');stateFor(key);},
 read(){
  const state=stateRecord(key);
  // Reject invalid/reentrant requests before any owned callback; neither can retire a current owner.
  if(state.busy)throw Error('The original candle source is being consumed.');
  if(state.consumed)throw Error('The original candle source was already consumed. Prepare it again for a new calculation.');
  state.busy=true;let pending:Error|undefined;
  try{
   stateFor(key);
   if(!state.frame!.presentationReady()){traceSeasonalityDiagnostic(state.diagnostic,'presentation-pending',0,0,true);stateFor(key);pending=new PrimarySourcePending('The chart source is still settling.');throw pending;}
   stateFor(key);state.consumed=true;if(livePreparations.has(state))consumeLiveState(state);
   // Exactly one admitted N-row pass; no await, formatter, output clone or consumer callback.
   state.origin!.assertCurrent();stateFor(key);consumedResults.set(state.result!,new WeakRef(state));return state.result!;
  }catch(error){if(pending===undefined||error!==pending)try{retire(state);}catch(cleanup){throw new AggregateError([error,cleanup],'Original source ownership and cleanup failed.');}throw error;}
  finally{state.busy=false;}
 },
 dispose(){const state=views.get(key)?.state.deref();views.delete(key);if(state)retire(state);}
});}
/** Kept only in the actual owning model's private source slot. Public views use weak opaque keys. */
export interface OwnedPreparedPrimarySource {readonly view:PrimarySourceView;dispose():void}
export interface OwnedLivePrimarySource {readonly owned:OwnedPreparedPrimarySource;readonly ready:Promise<PrimarySourceView>;start():void}
function ownedSourceDispose(owner:WeakRef<object>):()=>void{return()=>{const key=owner.deref(),state=key&&ownedSourceStates.get(key);if(key)ownedSourceStates.delete(key);if(state)retire(state);};}
function ownedSourceHandle(state:PreparedState):OwnedPreparedPrimarySource{
 const key={};views.set(key,{state:new WeakRef(state)});const owned={view:view(key),dispose:()=>{}};owned.dispose=ownedSourceDispose(new WeakRef(owned));ownedSourceStates.set(owned,state);return Object.freeze(owned);
}
function liveStateAbort(state:WeakRef<PreparedState>):()=>void{return()=>{const actual=state.deref();if(actual)retire(actual);};}
function liveStateWake(state:WeakRef<PreparedState>):()=>void{return()=>{const actual=state.deref();if(actual?.live)try{readyLiveState(actual);}catch(error){failLiveState(actual,error);}};}
function liveNumericUnwind(state:WeakRef<PreparedState>):()=>void{return()=>{const actual=state.deref(),meta=actual&&livePreparations.get(actual);if(meta)meta.numericUnwindPending=false;};}
function liveWindowCompletion(state:WeakRef<PreparedState>){return{
 fulfilled(window:AlpacaSeasonalityDailyWindow){const actual=state.deref(),live=actual&&livePreparations.get(actual);if(!actual?.live||!live){releaseAlpacaSeasonalityDailyWindow(window);return;}live.window=window;traceSeasonalityDiagnostic(actual.diagnostic,'window-ready');try{readyLiveState(actual);}catch(error){failLiveState(actual,error);}},
 rejected(error:unknown){const actual=state.deref();if(actual?.live)failLiveState(actual,error);}
};}
function failLiveState(state:PreparedState,error:unknown):void{traceSeasonalityDiagnostic(state.diagnostic,'source-fail');
 const meta=livePreparations.get(state),reject=meta?.reject;if(meta){meta.reject=null;meta.resolve=null;}let cleanup:unknown,failed=false;try{retire(state);}catch(cause){failed=true;cleanup=cause;}reject?.(failed?new AggregateError([error,cleanup],'Live daily source and cleanup failed.'):error);
}
function liveSourceLease(state:WeakRef<PreparedState>):Pick<LocalCandleContextLease,'isCurrent'|'assertCurrent'|'dispose'>{return Object.freeze({
 assertCurrent(){const actual=state.deref();if(!actual?.live)throw unavailable();checkLiveState(actual);},
 isCurrent(){const actual=state.deref();if(!actual?.live)return false;try{checkLiveState(actual);return true;}catch{return false;}},
 dispose(){}
});}
function checkLiveState(state:PreparedState):LivePreparation{
 const meta=livePreparations.get(state),basis=meta?.basis.deref();if(!state.live||!meta||!basis||primarySourceAborted(meta.request.signal))throw unavailable();
 state.reservation!.assertCurrent();state.current!();basis.assertCurrent();basis.assertSessionCurrent!();meta.plan.liveDaily!.source.assertCurrent();
 if(!alpacaSeasonalityDailyDemandMatches(meta.demand,meta.plan.liveDaily!.source))throw unavailable();if(meta.window)assertAlpacaSeasonalityDailyWindow(meta.window);return meta;
}
function readyLiveState(state:PreparedState):void{
 const meta=checkLiveState(state);if(meta.ready||!meta.window)return;const basis=meta.basis.deref()!,host=meta.host.deref();if(!host)throw unavailable();
 const frame=host.accepted(basis.basis,true);if(!frame){traceSeasonalityDiagnostic(state.diagnostic,'frame-null');return;}if(frame.basis!==basis.basis||frame.context!==basis.context||frame.style!==basis.style||frame.execution!==basis.execution)throw unavailable();
 state.frame=frame;state.origin=liveSourceLease(new WeakRef(state));meta.acceptNativeOwner!();checkLiveState(state);frame.assertCurrent();meta.ready=true;traceSeasonalityDiagnostic(state.diagnostic,'source-ready');meta.acceptNativeOwner=null;meta.attachGroup=null;const resolve=meta.resolve;meta.resolve=null;meta.reject=null;resolve?.(meta.view!);
}
function retireLiveState(state:PreparedState):void{
 const meta=livePreparations.get(state);if(!state.live||!meta)return;state.live=false;livePreparations.delete(state);
 const reservation=state.reservation,origin=state.origin,reject=meta.reject,window=meta.window,group=meta.group,offs=meta.offs,preparation=meta.preparation;
 state.reservation=null;state.origin=null;state.frame=null;state.result=null;state.current=null;state.off=null;meta.offs=[];meta.geometry=null;meta.times=null;meta.window=null;meta.group=null;meta.resolve=null;meta.reject=null;meta.view=null;meta.acceptNativeOwner=null;meta.attachGroup=null;
 const failures:unknown[]=[];for(const release of [...offs,()=>origin?.dispose(),()=>{if(window)releaseAlpacaSeasonalityDailyWindow(window);},()=>{if(group)releaseAlpacaSeasonalityPreparationGroup(group);},()=>preparation.retire(),()=>reservation?.release()])try{release();}catch(error){failures.push(error);}
 // The armed retention retires through its own weak microtask, after this
 // borrowed native/frame/off stack unwinds. Pending physical groups stay paid.
 reject?.(unavailable());if(failures.length)throw new AggregateError(failures,'Live daily source cleanup was incomplete.');
}
function startLiveState(state:WeakRef<PreparedState>):()=>void{return()=>{
 const actual=state.deref(),meta=actual&&livePreparations.get(actual);if(!actual?.live||!meta||meta.started)return;meta.started=true;
 try{
  checkLiveState(actual);const live=meta.plan.liveDaily!,key=createAlpacaSeasonalityPreparationGroup(meta.demand,live.source,meta.request.signal,meta.request.projectionGeometry?{firstLoadedTime:live.firstLoadedTime,session:live.session}:undefined);meta.group=key;
  meta.attachGroup!(key);traceSeasonalityDiagnostic(actual.diagnostic,'group-attached');checkLiveState(actual);const callbacks=liveWindowCompletion(state);void runAlpacaSeasonalityPreparationGroup(key).then(callbacks.fulfilled,callbacks.rejected);
 }catch(error){failLiveState(actual,error);}
};}
/** Actual closed port construction only. Caller first reserves and arms, then
 * stores owned in its source slot BEFORE start creates/runs the physical group.
 * All retained asynchronous callbacks are separate weak-only factories. */
export function beginOwnedLivePrimarySource(host:OwnedPrimarySourceHost,basis:PrimarySourceBasis,request:Readonly<PrimarySourceRequest>,plan:Readonly<PrimarySourcePlan>,reservation:BuiltinSourceReservation,current:()=>void,acceptNativeOwner:()=>void,demand:AlpacaSeasonalityDailyDemand,preparation:BuiltinScenePublication,attachGroup:(group:AlpacaSeasonalityPreparationGroup)=>void,diagnostic?:SeasonalityDiagnosticTrace|null):OwnedLivePrimarySource{
 if(!plan.liveDaily||!livePlanWork.has(plan))throw unavailable();const state:PreparedState={diagnostic,frame:null,reservation,origin:null,result:null,current,off:null,live:true,busy:false,consumed:false};
 const meta:LivePreparation={alignmentConsumed:false,times:null,geometry:null,host:new WeakRef(host),basis:new WeakRef(basis),plan,request,demand,preparation,group:null,window:null,acceptNativeOwner,attachGroup,offs:[],resolve:null,reject:null,view:null,started:false,ready:false,numericUnwindPending:false};livePreparations.set(state,meta);
 const owned=ownedSourceHandle(state);meta.view=owned.view;const ready=liveReadyPromise(state);try{
  checkLiveState(state);const weak=new WeakRef(state),abort=liveStateAbort(weak);meta.offs.push(subscribePrimaryAbort(request.signal,abort));meta.offs.push(subscribePrimaryAbort(reservation.signal,abort));meta.offs.push(host.subscribeSettled(liveStateWake(weak)));checkLiveState(state);
 }catch(error){failLiveState(state,error);}return Object.freeze({owned,ready,start:startLiveState(new WeakRef(state))});
}
function liveReadyPromise(state:PreparedState):Promise<PrimarySourceView>{return new Promise((resolve,reject)=>{const meta=livePreparations.get(state)!;meta.resolve=resolve;meta.reject=reject;});}
function consumeLiveState(state:PreparedState):void{
 const meta=checkLiveState(state),frame=state.frame!,plan=meta.plan,live=plan.liveDaily!;if(!meta.ready||!meta.window)throw unavailable();
 meta.numericUnwindPending=true;
 try{
 const assert=()=>{checkLiveState(state);frame.assertCurrent();};if(!frame.nativeTimes)throw unavailable();
 const captured:{times:readonly number[]|null}={times:null};const matched=seasonalityLiveNativeInputMatches(frame.raw,frame.context,plan.inputRows,frame.nativeRaw,frame.native,frame.shown,frame.style,frame.nativeTimes,assert,times=>{captured.times=times;});const times=captured.times;if(!matched||!times)throw unavailable();assert();
 const geometry=captureAlpacaSeasonalityGeometryFacts(meta.window),first=geometry?.firstObservedTime??live.firstLoadedTime;
 const choices=Object.freeze({startYear:plan.settings.startYear,endYear:plan.settings.endYear,excludedMonths:plan.settings.excludedMonths,includeDevelopingInSummaries:plan.settings.includeDevelopingInSummaries,meanRow:plan.settings.meanRow,deviationRow:plan.settings.deviationRow,positiveFrequencyRow:plan.settings.positiveFrequencyRow,projectionGeometry:plan.settings.projectionGeometry});
 const grid=Object.freeze({times,firstObservedTime:first}),result=consumeAlpacaSeasonalityDailyWindowOwned(meta.window,grid,choices);assert();if(result.status!=='ready')throw Error(result.diagnostic);if(!alpacaSeasonalityHistoryResultMatches(result,meta.window,grid))throw unavailable();meta.geometry=geometry?Object.freeze({times,firstObservedTime:geometry.firstObservedTime,firstLoadedTime:geometry.firstLoadedTime,prefixBars:geometry.prefixBars}):null;meta.times=times;state.result=result;state.reservation!.accept();assert();
 }finally{queueMicrotask(liveNumericUnwind(new WeakRef(state)));}
}
export async function prepareOwnedPrimarySource(host:OwnedPrimarySourceHost,basis:PrimarySourceBasis,request:Readonly<PrimarySourceRequest>,plan:Readonly<PrimarySourcePlan>,reservation:BuiltinSourceReservation,current:()=>void,acceptNativeOwner:()=>void):Promise<OwnedPreparedPrimarySource>{
 const state:PreparedState={frame:null,reservation,origin:null,result:null,current,off:null,live:true,busy:false,consumed:false};
 const check=()=>{reservation.assertCurrent();if(primarySourceAborted(request.signal))throw unavailable();current();basis.assertCurrent();};
 const abort=()=>retire(state);let offRequest=()=>{},offReservation=()=>{};state.off=()=>releaseSourceSubscriptions([offRequest,offReservation]);offRequest=subscribePrimaryAbort(request.signal,abort);offReservation=subscribePrimaryAbort(reservation.signal,abort);
 try{
  check();let frame=host.accepted(basis.basis);
  if(!frame)frame=await new Promise<PrimarySourceFrame>((resolve,reject)=>{
   let done=false,acquiring=true,finished=false,off=()=>{},offRequest=()=>{},offReservation=()=>{},completion:{value?:PrimarySourceFrame;error?:unknown;failed:boolean}|null=null;
   const finish=()=>{if(finished||!done||acquiring||!completion)return;finished=true;let cleanup:unknown,cleanupFailed=false;try{releaseSourceSubscriptions([off,offRequest,offReservation]);}catch(error){cleanup=error;cleanupFailed=true;}if(cleanupFailed){reject(completion.failed?new AggregateError([completion.error,cleanup],'Original source wait and cleanup failed.'):cleanup);return;}if(completion.value)resolve(completion.value);else reject(completion.failed?completion.error:unavailable());};
   const end=(value?:PrimarySourceFrame,error?:unknown,failed=false)=>{if(done)return;done=true;completion={value,error,failed};finish();};
   const cancel=()=>end(undefined,unavailable(),true),wake=()=>{if(done)return;try{check();const next=host.accepted(basis.basis);if(next)end(next);}catch(error){end(undefined,error,true);}};
   try{off=host.subscribeSettled(wake);if(!done)offRequest=subscribePrimaryAbort(request.signal,cancel);if(!done)offReservation=subscribePrimaryAbort(reservation.signal,cancel);}catch(error){end(undefined,error,true);}
   finally{acquiring=false;if(!done){if(primarySourceAborted(request.signal)||primarySourceAborted(reservation.signal))cancel();else wake();}finish();}
  });
  check();if(frame.basis!==basis.basis||frame.context!==basis.context||frame.style!==basis.style||frame.execution!==basis.execution)throw unavailable();state.frame=frame;acceptNativeOwner();
  const assert=()=>{check();frame!.assertCurrent();};assert();
  state.origin=captureLocalCandleContext(frame.context,{externalNumericSlots:plan.cost.numericSlots-(7*plan.originalRows+1552),externalOperations:plan.cost.operations-(1024*plan.originalRows+16384)});if(!state.origin||(state.origin as LocalCandleContextLease).rows!==plan.originalRows)throw unavailable();
  verifyNative(frame,plan,assert);const origin=state.origin as LocalCandleContextLease,points:Readonly<SeasonalitySourcePoint>[]=[],completed=plan.inputRows-Number(frame.forming);let asOf=-Infinity;
  for(let start=0;start<plan.inputRows;start+=128){assert();const rows=origin.readRows(start,Math.min(128,plan.inputRows-start));for(let offset=0;offset<rows.length;offset++){
   const index=start+offset,source=rows[offset],raw=own(frame.raw,String(index)),time=numeric(own(raw,'time'));if(time!==source.time)throw unavailable();
   if(index<completed){for(const key of FIELDS)if(!Object.is(own(raw,key),source[key]))throw unavailable();const end=endOfLabel(source.time,plan.contract);if(end<=plan.cutoff){points.push(Object.freeze({time:source.time,close:source.close,availableAt:end,finalized:true}));asOf=Math.max(asOf,end);}}
   else asOf=Math.max(asOf,time);
  }assert();}
  if(!Number.isFinite(asOf))throw Error('No closed observed original candle is available under the declared cutoff.');asOf=Math.min(asOf,plan.cutoff);
  const compiled=compileSeasonalityMonths({points:Object.freeze(points),contract:plan.contract,settings:plan.settings,sourceKeyDescription:'User-supplied local document, declared calendar and logical close',asOf});if(compiled.status!=='ready')throw Error(compiled.diagnostic);
  let input=compiled.input;
  if(frame.forming){const time=numeric(own(own(frame.raw,String(plan.inputRows-1)),'time'));if(time<=asOf){const month=(plan.contract.calendar==='nyse'&&plan.contract.dateLabels==='calendar-midnight'?newYorkClock(time).date:new Date(time*1000).toISOString().slice(0,10)).slice(0,7),frames:Readonly<SeasonalityMonth>[]=input.months.map(row=>row.month===month&&row.firstTime===null?Object.freeze({...row,firstTime:time}):row),samples:Readonly<SeasonalitySample>[]=[...input.samples];if(!samples.length||samples[samples.length-1].time<time)samples.push(Object.freeze({time,month}));input=Object.freeze({...input,months:Object.freeze(frames),samples:Object.freeze(samples)});}}
  const result=calculateSeasonality(input);if(result.status!=='ready')throw Error(result.diagnostic);assert();origin.assertCurrent();assert();state.result=result;
  reservation.accept();assert();const key={};views.set(key,{state:new WeakRef(state)});const returned=view(key);return Object.freeze({view:returned,dispose(){retire(state);}});
 }catch(error){try{retire(state);}catch(cleanup){throw new AggregateError([error,cleanup],'Original source ownership and cleanup failed.');}throw error;}
}

/** SAME private consumed state only; no supplied row resolver, history holder,
 * source/native receipt or calendar label can select an input. */
export function alignConsumedLivePrimarySourceResult(result:Readonly<SeasonalityResult>,reservation:BuiltinSourceReservation,bars:readonly Bar[]):IndicatorResult{
 const state=consumedResults.get(result)?.deref();
 if(!state||!state.live||state.busy||!state.consumed||state.result!==result||state.reservation!==reservation)throw unavailable();
 const meta=livePreparations.get(state),times=meta?.times;
 if(!meta||!times||!state.frame||state.frame.raw!==bars||!meta.window||meta.alignmentConsumed)throw unavailable();
 // Exactly one alignment birth per actual consumed result; no callback can
 // recursively allocate another4M graph or borrow this source's admission.
 meta.alignmentConsumed=true;state.busy=true;
 try{
 currentState(state);
 if(livePreparations.get(state)!==meta||meta.times!==times||state.frame.raw!==bars||state.result!==result||state.reservation!==reservation)throw unavailable();
 const aligned=seasonalityAlignedOwnedLiveResult(result,bars,times);
 currentState(state);
 if(livePreparations.get(state)!==meta||meta.times!==times||state.frame.raw!==bars||state.result!==result||state.reservation!==reservation)throw unavailable();
 return aligned;
 }finally{state.busy=false;}
}
