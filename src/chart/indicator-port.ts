import {captureNativeRegistryLookup,type NativeRegistryLookup} from './native-registry-lookup';
import {calculationBarsForStyle} from './calculation-bars';
import {closedTimeframeContextFacts,captureOriginalClosedTimeframeContext,closedTimeframeInputValuesMatch} from './source-context';
import {nyseDailyChartInterval,planNyseDailyTimeframe} from '../domain/indicator-resample';
import {planNysePeriodTimeframe} from '../domain/nyse-mtf-alert-source';
import type {PrimarySourceBasis,PrimarySourceFrame,PrimarySourcePlan} from './seasonality-source';
import {captureSeasonalityDailyContext,seasonalityDailyContextMode} from './source-context';
import type {SeasonalityResult} from '../domain/indicators-ext/seasonality-types';
import {seasonalityCompletionCutoff} from '../domain/indicators-ext/seasonality-catalog';
import {seasonalityAlignedResult} from './seasonality-presentation';
import {SEASONALITY_CALENDAR_AXIS_LIMITS,seasonalityCalendarSpine,seasonalityIntradayCoordinates,type SeasonalityCalendarAxisHandle} from './seasonality-calendar-axis';
import type {SeasonalityCalendarContract} from '../domain/indicators-ext/seasonality-months';
import {seasonalityIntradayBoxes,type SeasonalityIntradayBoxCoordinates} from './seasonality-intraday-boxes';
import type {SeasonalityNativeOrigin} from './seasonality-native-origin';
import {alignConsumedLivePrimarySourceResult,consumedPrimaryCalendarFrame,consumedPrimaryIntradayGeometry,isPrimarySourcePending,subscribePrimaryAbort,normalizePrimarySourceRequest,planPrimarySource,prepareOwnedPrimarySource,beginOwnedLivePrimarySource,type OwnedPrimarySourceHost,type OwnedPreparedPrimarySource,type PrimarySourceRequest,type PrimarySourceView} from './seasonality-source';
import {acquireAlpacaSeasonalityDailyDemand,releaseAlpacaSeasonalityDailyDemand,alpacaSeasonalityDailyDemandMatches,subscribeAlpacaSeasonalityDailyDemand,type AlpacaSeasonalityDailyDemand,type AlpacaSeasonalityDailyPlan} from '../domain/alpaca-live';
import {isDerivedStyle} from './derived/common';
import {createBuiltinPresentationPort,type BuiltinSettlementWait,type BuiltinSourceReservation,type BuiltinScenePublication,type BuiltinModelHooks,type BuiltinNumericDraft,type BuiltinProducerBudget,type BuiltinReadoutSnapshot} from './builtin-presentation-proof';
import type {ClaimNativeDescriptor} from './native-full-model';
import {startVwapIndicatorRun,VwapRunCleanupError,type VwapIndicatorRun,type MaterializedVwap} from './vwap-indicator-run';
import {consumeVwapPresentation,type PreparedVwapPresentation} from './vwap-presentation';
import type {OwnedVwapPrefix} from './vwap-prefix-source';
import type {VwapClient} from '../vwap/types';
import {effectiveVwapSettings} from '../vwap/settings';
import {captureSeasonalityDiagnosticTrace,seasonalityDiagnosticToken,traceSeasonalityDiagnostic} from './seasonality-diagnostic-trace';
import { registerNativeIndicator, unregisterNativeIndicator, getNativeIndicator, type Vela, type NativeIndicatorDescriptor, type NativeIndicator, type NativeIndicatorContext, type IndicatorHandle, type InputValue, type NativeIndicatorOutput } from '@luxalgo/vela';
import { calculateIndicator, indicatorActivePlotIds, type IndicatorId, type IndicatorInputs, type IndicatorResult, type IndicatorCalculationOptions } from '../domain/indicators';
import {CATALOG_INDICATORS,catalogDefinition,catalogInputValue} from '../domain/indicator-catalog';
import {isVwapEventAnchor,vwapEventDatesFor} from '../domain/vwap-event-anchors';
import {createIncrementalIndicatorSession,type IncrementalIndicatorSession} from '../domain/indicator-incremental';
import {isSealedIndicatorValues} from '../domain/indicator-sealed-values';
import {parseIndicatorSource,encodeIndicatorSource,validateIndicatorSourceGraph,indicatorSourceDependents,INDICATOR_SOURCE_KINDS,INDICATOR_SOURCE_MAX_DEPTH} from '../domain/indicator-source';
import type { Bar } from '../domain/types';
import { requireVolume } from './contracts';
import {createAnalysisPublication,AnalysisPublicationError,isAnalysisPublicationFailure,type AnalysisPublicationHost} from './analysis-publication';
import type {IndicatorPrecision} from './indicator-settings';
import {indicatorValueSuffix} from './indicator-number-format';
import {createPaneRegistry,type PaneRegistry} from './pane-registry';
import {readIndicatorOwnScale,indicatorNativeScaleSupported,indicatorScaleSides,readIndicatorScalePlacement,setIndicatorScalePlacement,INDICATOR_SCALE_GAPS,INDICATOR_SCALE_GROUP_GAP,indicatorScaleGroupsSupported,readIndicatorScaleGroup,readIndicatorPaneId,indicatorScaleChoices,type IndicatorScaleChoice,VOLUME_OVERLAY_MARGINS,setIndicatorScaleMargins,type IndicatorScaleSide} from './indicator-scale';
import {registerIndicatorDisplayPort,type IndicatorDisplayPlot} from './indicator-display-source';
import {evaluateIndicatorOnTimeframe,indicatorTimeframeOf} from './indicator-timeframe';
import {profileFinerLookup,profileLowerTimeframe,subscribeProfileDatasets,assertCurrentProfilePrimarySource,profilePrimaryInputMatches} from './vp-visible-range-ltf';
import {indicatorHistoryLookup} from './indicator-history-lookup';
import {subscribeScriptRequestResolver} from '../ui/script-requests';
import {INDICATOR_KINDS as DOMAIN_INDICATORS,indicatorDefaults as defaults,indicatorLegacyDefaults,defaultIndicatorPresentation,assertIndicatorBatchBudget,indicatorInputSchema,validateIndicatorSettings,validateIndicatorSnapshots,validateIndicatorInputs,assertIndicatorRecord,indicatorEstimatedWork,mergeStoredIndicatorInputs,applyIndicatorInputEdit,assertIndicatorEditOffset,assertIndicatorNewInputs,INDICATOR_WORK_LIMIT,INDICATOR_MAX_OFFSET,INDICATOR_MAX_INSTANCES,type IndicatorPlotStyle,type IndicatorInstanceSettings,type IndicatorSnapshot} from './indicator-settings';
export {DOMAIN_INDICATORS,indicatorInputSchema,type IndicatorPlotStyle,type IndicatorInstanceSettings,type IndicatorSnapshot} from './indicator-settings';
type MoveTarget=Parameters<IndicatorHandle['moveTo']>[0];

const overlayKinds=new Set(['sma','ema','bb','vwap',...CATALOG_INDICATORS.filter(definition=>definition.overlay).map(definition=>definition.id)]);
export interface VwapIndicatorHost {capture():OwnedVwapPrefix;client():VwapClient}
const exactVwap=(settings:IndicatorInstanceSettings)=>settings.kind==='vwap'&&settings.inputs.kernelVersion===2;
export type IndicatorTimeframeCalculation='legacy'|'accepted-calendar'|'pending'|'unavailable';
const liveDailyPortModes=new WeakMap<object,(id?:string)=>boolean>();
interface SeasonalityContinuation {resume:((view:PrimarySourceView)=>void)|null;failure:((error:unknown)=>void)|null}
function seasonalityCompletion(job:WeakRef<SeasonalityContinuation>){return{
 fulfilled(view:PrimarySourceView){const actual=job.deref();if(!actual?.resume){view.dispose();return;}actual.resume(view);},
 rejected(error:unknown){job.deref()?.failure?.(error);}
};}

// Resource-only retry state. No model, input array, prepared source, history,
// reservation or provider group is strongly captured by a retained port wake.
interface SeasonalitySettlementEntry {model:DomainRenderingIndicator}
interface SeasonalitySettlementDesired {
 settings:WeakRef<IndicatorInstanceSettings>;ctx:WeakRef<NativeIndicatorContext>;handle:WeakRef<IndicatorHandle>;
 generation:number;context:WeakRef<object>;execution:string;
}
interface SeasonalitySettlementScope {
 live:boolean;entries:WeakRef<ReadonlyMap<string,SeasonalitySettlementEntry>>;host:WeakRef<OwnedPrimarySourceHost>|null;
 waits:WeakMap<DomainRenderingIndicator,SeasonalitySettlementRetry>;records:Set<SeasonalitySettlementRetry>;
}
interface SeasonalitySettlementRetry {
 scope:WeakRef<SeasonalitySettlementScope>;model:WeakRef<DomainRenderingIndicator>;entry:WeakRef<SeasonalitySettlementEntry>;
 id:string;ticket:object;lease:BuiltinSettlementWait|null;wake:(()=>void)|null;
 live:boolean;detached:boolean;awaiting:boolean;desired:SeasonalitySettlementDesired|null;
}
function detachSeasonalitySettlementRetry(record:SeasonalitySettlementRetry):void{
 const scope=record.scope.deref(),model=record.model.deref();record.detached=true;
 if(scope){if(model&&scope.waits.get(model)===record)scope.waits.delete(model);scope.records.delete(record);}
}
function disposeSeasonalitySettlementRetry(record:SeasonalitySettlementRetry):void{
 if(!record.live)return;record.live=false;detachSeasonalitySettlementRetry(record);
 const lease=record.lease;record.lease=null;record.wake=null;record.desired=null;lease?.dispose();
}
function seasonalitySettlementActor(record:SeasonalitySettlementRetry):DomainRenderingIndicator|null{
 const scope=record.scope.deref(),model=record.model.deref(),entry=record.entry.deref(),desired=record.desired;
 if(!record.live||!scope?.live||!model||!entry||!desired||scope.entries.deref()?.get(record.id)!==entry||entry.model!==model||model.removed||model.recoveryError||!model.settings.visible||model.settings.kind!=='seasonality'||model.settings!==desired.settings.deref()||model.ctx!==desired.ctx.deref()||model.handle!==desired.handle.deref()||model.editGeneration!==desired.generation)return null;
 if(record.detached?scope.waits.has(model):scope.waits.get(model)!==record)return null;
 return model;
}
function seasonalitySettlementSourceCurrent(record:SeasonalitySettlementRetry):boolean{
 const host=record.scope.deref()?.host?.deref(),desired=record.desired;if(!host||!desired||!seasonalitySettlementActor(record))return false;
 const mode=host.sourceMode?host.sourceMode():host.capture();
 if(!mode||mode.context!==desired.context.deref()||mode.execution!==desired.execution)return false;
 mode.assertCurrent();return !!seasonalitySettlementActor(record);
}
function seasonalitySettlementWake(scope:WeakRef<SeasonalitySettlementScope>,model:WeakRef<DomainRenderingIndicator>,ticket:object):()=>void{return()=>{
 const owner=scope.deref(),actual=model.deref(),record=actual&&owner?.waits.get(actual);
 if(!record||record.ticket!==ticket||!record.live)return;
 try{
  // The kernel queues this only after the actual physical group AND the
  // previous scalar charge have retired. It grants no source authority.
  if(!record.awaiting||!seasonalitySettlementSourceCurrent(record))return;
  detachSeasonalitySettlementRetry(record);
  const lease=record.lease;record.lease=null;lease?.dispose();
  if(!seasonalitySettlementSourceCurrent(record))return;
  const current=seasonalitySettlementActor(record);if(current)current.compute();
 }finally{disposeSeasonalitySettlementRetry(record);}
};}
function seasonalitySettlementRetire(scope:WeakRef<SeasonalitySettlementScope>,model:WeakRef<DomainRenderingIndicator>):()=>void{return()=>{
 const actual=model.deref(),record=actual&&scope.deref()?.waits.get(actual);if(record)disposeSeasonalitySettlementRetry(record);
};}

interface SeasonalityDemandOwner {key:AlpacaSeasonalityDailyDemand|null;controller:AbortController;live:boolean;ticket:object|null;wake:(()=>void)|null;off:(()=>void)|null}
function releaseSeasonalityDemandOwner(owner:SeasonalityDemandOwner):void{
 if(!owner.live)return;owner.live=false;owner.ticket=null;const key=owner.key,off=owner.off;owner.key=null;owner.off=null;owner.wake=null;const errors:unknown[]=[];
 for(const release of [()=>off?.(),()=>owner.controller.abort(),()=>{if(key)releaseAlpacaSeasonalityDailyDemand(key);}])try{release();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'The actual daily source demand did not fully retire.');
}
function seasonalityDemandWake(model:WeakRef<DomainRenderingIndicator>,owner:WeakRef<SeasonalityDemandOwner>):()=>void{return()=>{const actual=model.deref(),record=owner.deref();if(!record?.live||!actual||actual.removed||!actual.settings.visible||!actual.ctx)return;try{actual.compute();}catch{/* The model's actual owner/publication path reports current source refusal. */}};}
function deferredSeasonalityDemandRetire(map:WeakRef<Map<DomainRenderingIndicator,SeasonalityDemandOwner>>,model:WeakRef<DomainRenderingIndicator>,owner:WeakRef<SeasonalityDemandOwner>,ticket:object):()=>void{return()=>{
 const registry=map.deref(),actual=model.deref(),record=owner.deref();if(!registry||!actual||!record?.live||record.ticket!==ticket||registry.get(actual)!==record)return;registry.delete(actual);try{releaseSeasonalityDemandOwner(record);}catch{/* Authority already retired; each exact provider release was attempted. */}
};}
/** Descriptive UI mode ONLY. Actual constructor/port/current-source membership
 * is required; fake/copied/proxy ports are refused before supplied properties.
 * This cannot grant prices, native acceptance, completion or display authority. */
export function seasonalityUsesLiveDailyHistory(port:object,id?:string):boolean{
 if(id!==undefined&&typeof id!=='string')return false;const inspect=liveDailyPortModes.get(port);if(!inspect)return false;try{return inspect(id);}catch{return false;}
}

export interface IndicatorInstanceView extends IndicatorInstanceSettings {timeframeCalculation?:IndicatorTimeframeCalculation;rendererId:string;diagnostics:string[];policies:string[];series:{id:string;label:string}[];paneId:string|null;informationBars:number;latestInformationTime:number|null;presentationDiagnostics:string[]}
export {defaultPlotStyle,renderIndicatorSeries} from './indicator-rendering';
import {releaseIndicatorPoints} from './indicator-rendering';
import {renderIndicatorPresentation,type IndicatorPresentationContext,type IndicatorPresentationOwner} from './indicator-presentation';
import {subscribeSecondSymbols} from '../domain/second-symbol';
/** Main chart styles accepted as the basis of a 1D/1W/1M own-timeframe indicator. */
export const TIMEFRAME_BASIS_STYLES:ReadonlySet<string>=new Set(['candles','bars','hlcbars','line','area','baseline','hollow','heikinashi']);
const toDomainBar=(bar:ReturnType<NativeIndicatorContext['bars']>[number]):Bar=>({...bar,time:bar.time/1000,volume:bar.volume??NaN});
/**
 * Every indicator of a chart converts the same native bars on every live tick. The native array is the chart's
 * own series, which vela grows in place (the forming bar is replaced, a new bar is pushed). The last conversion is kept
 * per native array: a call returns the same converted array while every native bar is the same object with the same
 * values, and on a tick it reconverts only from the first bar that differs (new array, earlier converted bars reused).
 * The converted rows are exactly what a full conversion builds. Bars with fields beyond OHLCV-and-time always take the
 * full conversion, so a field this check does not compare can never be served stale.
 */
type NativeBar=ReturnType<NativeIndicatorContext['bars']>[number];
const domainBarMemo=new WeakMap<readonly NativeBar[],{seen:NativeBar[];output:Bar[]}>();
const CONVERTED_KEYS=new Set(['time','open','high','low','close','volume']);
/** Spread copies own enumerable string and symbol keys; only the compared OHLCV-and-time keys may be present. */
function memoizable(bar:NativeBar):boolean{if(bar===null||typeof bar!=='object')return false;const keys=Object.keys(bar);if(keys.length>6)return false;for(let index=0;index<keys.length;index++)if(!CONVERTED_KEYS.has(keys[index]))return false;return Object.getOwnPropertySymbols(bar).length===0;}
function sameConverted(bar:NativeBar,row:Bar):boolean{return Object.is(bar.time/1000,row.time)&&Object.is(bar.open,row.open)&&Object.is(bar.high,row.high)&&Object.is(bar.low,row.low)&&Object.is(bar.close,row.close)&&Object.is(bar.volume??NaN,row.volume);}
/** Exported for the equality tests. */
export function asDomainBars(bars:ReturnType<NativeIndicatorContext['bars']>):Bar[]{
  if(!Array.isArray(bars))return bars.map(toDomainBar);
  const memo=domainBarMemo.get(bars),count=bars.length;let from=0;
  if(memo){const limit=Math.min(count,memo.seen.length);while(from<limit){const bar=bars[from];if(bar!==memo.seen[from]||!sameConverted(bar,memo.output[from]))break;from++;}
    if(from===count&&count===memo.seen.length)return memo.output;}
  // `seen` is private to the memo and shortened in place; `output` was handed out, so it is copied.
  const seen=memo?memo.seen:[],output=memo?memo.output.slice(0,from):[];seen.length=from;
  for(let index=from;index<count;index++){const bar=bars[index];if(!memoizable(bar)){domainBarMemo.delete(bars);return bars.map(toDomainBar);}seen.push(bar);output.push(toDomainBar(bar));}
  domainBarMemo.set(bars,{seen,output});return output;
}
function needsVolume(kind:IndicatorId,inputs:IndicatorInputs):boolean{return ['volume','vwap','obv'].includes(kind)||inputs.basisType==='VWMA'||catalogDefinition(kind)?.requiresVolume===true;}
/** `session` (one per live indicator instance) recalculates only the newest bars of a live tick, exactly (src/domain/indicator-incremental.ts). */
export function evaluateDomainIndicator(kind:IndicatorId,bars:readonly Bar[],inputs:IndicatorInputs,options?:IndicatorCalculationOptions,session?:IncrementalIndicatorSession):IndicatorResult{
  try{assertIndicatorRecord(inputs);if(!DOMAIN_INDICATORS.includes(kind))throw new Error('Unsupported indicator.');}catch(error){return {id:kind,series:[],diagnostics:[String(error)],policies:[]};}
  const supportedInputs=new Set([...indicatorInputSchema(kind).map(field=>field.key),...catalogDefinition(kind)?.retiredInputs?.map(field=>field.key)??[]]);// retired catalog inputs from stored state are still calculated
  const unknown=Object.keys(inputs).filter(key=>!supportedInputs.has(key));
  if(unknown.length)return {id:kind,series:[],diagnostics:[`Unsupported indicator inputs: ${unknown.join(', ')}`],policies:['Unsupported controls never silently no-op.']};
  if(kind==='atr'&&inputs.smoothing==='VWMA')return {id:kind,series:[],diagnostics:['VWMA smoothing is not a documented ATR option.'],policies:['ATR exposes RMA, SMA, EMA and WMA only.']};
  try{const work=indicatorEstimatedWork(kind,bars.length,inputs);if(work>INDICATOR_WORK_LIMIT)return {id:kind,series:[],diagnostics:[`Indicator workload ${work} exceeds the local ${INDICATOR_WORK_LIMIT} operation limit. Reduce the history or window length.`],policies:['Work is bounded before synchronous calculation.']};}catch(error){return {id:kind,series:[],diagnostics:[error instanceof Error?error.message:String(error)],policies:[]};}
  if(needsVolume(kind,inputs)){const available=requireVolume(bars,kind);if(!available.ok)return {id:kind,series:[],diagnostics:[available.diagnostic.message],policies:['Missing volume is unavailable; no zero substitution.']};}
  return session?session.calculate(kind,bars,inputs,options):calculateIndicator(kind,bars,inputs,options);
}
const VIEWPORT_FAILURE='Visible range recalculation failed; the previous profile stays: ';
/** A grow publishes the full private snapshot before native applyBar reaches its final prefix. */
function computationRaw(input:ReturnType<NativeIndicatorContext['bars']>,primary:readonly Bar[]|undefined,style:string|undefined):readonly Bar[]|null{
 if(!primary)return asDomainBars(input);
 if(isDerivedStyle(style??''))return primary;
 if(primary.length===input.length)return primary;
 // HA applies as one reload; a mismatched old view must not be transformed twice or see future rows.
 if(style==='heikinashi')return null;
 return asDomainBars(input);
}
interface TimeframeCalculation {result:IndicatorResult;assertCurrent():void;publication:BuiltinScenePublication;finish(success:boolean):void}
interface TimeframeProducer {prepare(bars:readonly Bar[],raw:readonly Bar[],budget:BuiltinProducerBudget,assert:()=>void):TimeframeCalculation|'pending'|{unavailable:string}|undefined;retire():void}
class DomainRenderingIndicator implements NativeIndicator{
  #scalar:BuiltinModelHooks|undefined;
  #primary:((()=>readonly Bar[]))|undefined;
  #preflight:(count:number)=>BuiltinProducerBudget;
  #timeframe:TimeframeProducer|undefined;timeframeReady:(()=>void)|undefined;
  /** Port-owned evaluator that resolves indicator-on-indicator sources; absent = plain domain calculation. */
  evaluate:((settings:IndicatorInstanceSettings,bars:readonly Bar[],raw?:readonly Bar[])=>IndicatorResult)|undefined;
  seasonalityCompute:((assert:()=>void,local:()=>void,initial:InitialEmissionOwner|undefined)=>void)|undefined;seasonalityRetire:(()=>void)|undefined;seasonalityShow:(()=>void)|undefined;seasonalityReady:(()=>void)|undefined;seasonalitySettlementRetire:(()=>void)|undefined;
  vwapCompute:((assert:()=>void,local:()=>void,initial:InitialEmissionOwner|undefined)=>void)|undefined;vwapRetire:(()=>void)|undefined;vwapHide:(()=>void)|undefined;
  initialRetirement:InitialEmissionOwner|undefined;acceptedDescendant:((generation:number)=>boolean)|undefined;editGeneration=0;inputObserver:((inputs:Record<string,InputValue>)=>void)|undefined;recoveryError:Error|undefined;
  ctx:NativeIndicatorContext|null=null;result:IndicatorResult;removed=false;handle:IndicatorHandle|null=null;informationBars=0;latestInformationTime:number|null=null;presentationDiagnostics:string[]=[];acceptedOutput:NativeIndicatorOutput={series:[],fills:[],priceLines:[]};
  displayPrecision:IndicatorPrecision='auto';
  display:readonly IndicatorDisplayPlot[]=[];displaySeries:NonNullable<NativeIndicatorOutput['series']>=[];displayInput:readonly unknown[]|null=null;
  constructor(public settings:IndicatorInstanceSettings,private changed:()=>void,private calculationBars:(bars:readonly Bar[])=>Bar[],preflight:(count:number)=>BuiltinProducerBudget,private presentationContext:(()=>IndicatorPresentationContext)|undefined,private mutation:<T>(action:()=>T)=>T,private captureComputationOwner:()=>()=>void,private captureInitialOwner:(ctx:NativeIndicatorContext,assertLocal:()=>void)=>InitialEmissionOwner|undefined,makeScalar?:(model:DomainRenderingIndicator)=>BuiltinModelHooks,primary?:()=>readonly Bar[],makeTimeframe?:(model:DomainRenderingIndicator)=>TimeframeProducer){this.#timeframe=makeTimeframe?.(this);this.#preflight=preflight;this.#primary=primary;this.result={id:settings.kind,series:[],diagnostics:[],policies:[]};this.#scalar=makeScalar?.(this);}
  start(ctx:NativeIndicatorContext,inputs:Record<string,InputValue>){if(this.removed)throw new Error('Indicator instance is retired.');this.seasonalityShow?.();if(this.seasonalityShow)this.settings.visible=true;this.ctx=ctx;this.settings.inputs={...this.settings.inputs,...inputs};this.compute(true);}
  onBars(){this.compute();}
  /** A visible-range kind recalculates on pan and zoom (the descriptor sets reactsToViewport). A failure keeps the last accepted output and is reported. */
  onViewport(){if(!catalogDefinition(this.settings.kind)?.viewport||!this.ctx||this.removed||!this.settings.visible)return;try{this.compute();}catch(error){this.presentationDiagnostics=[...this.presentationDiagnostics.filter(row=>!row.startsWith(VIEWPORT_FAILURE)),VIEWPORT_FAILURE+(error instanceof Error?error.message:String(error))];}}
  setInputs(inputs:Record<string,InputValue>){if(this.recoveryError)throw this.recoveryError;this.inputObserver?.(inputs);this.settings.inputs={...this.settings.inputs,...inputs};this.compute();}
  suspend(){this.#scalar?.retire();return this.mutation(()=>{this.settings.visible=false;this.#timeframe?.retire();try{this.seasonalitySettlementRetire?.();}finally{this.seasonalityRetire?.();}this.vwapHide?.();this.changed();});}
  resume(){this.seasonalityShow?.();return this.mutation(()=>{this.settings.visible=true;this.compute();});}
  stop(){this.#scalar?.retire();try{this.#timeframe?.retire();this.seasonalityRetire?.();this.vwapRetire?.();}finally{this.ctx=null;}}
  renewScalarPresentation(){this.#scalar?.renew();}
  compute(initial=false){if(!exactVwap(this.settings)&&this.settings.kind!=='seasonality')this.#scalar?.retire();const generation=this.editGeneration,settings=this.settings,ctx=this.ctx;if(!ctx||this.removed)return;const source=this.captureComputationOwner(),local=()=>{if(this.editGeneration!==generation||this.settings!==settings||this.ctx!==ctx||this.removed)throw new InputEditRetired(Error('Indicator calculation was replaced'));};const assert=()=>{local();source();local();};assert();const initialOwner=initial&&this.handle===null?this.captureInitialOwner(ctx,local):undefined;assert();let delayed:{error:unknown}|undefined;this.mutation(()=>{try{this.computeOwned(assert,local,initialOwner);}catch(error){if(this.acceptedDescendant?.(generation)){delayed={error};return;}throw error;}});if(delayed)throw delayed.error;}

  /** The custom asynchronous C path publishes through the same instance
   * notifier as ordinary native calculations; its owned port guards binding. */
  notifySeasonalityChange(){if(this.settings.kind!=='seasonality')throw Error('A Seasonality instance is required.');this.changed();}
  private computeOwned(assertSource:()=>void,local:()=>void,initialOwner:InitialEmissionOwner|undefined){
   let context:IndicatorPresentationContext|undefined;const assert=()=>{assertSource();try{if(context?.profileSource&&catalogDefinition(this.settings.kind)?.profile)assertCurrentProfilePrimarySource(context.profileSource);}catch(error){throw new InputSourceRetired(error);}};
   if(this.recoveryError)throw this.recoveryError;
   if(!this.ctx||this.removed)return;
   if(this.settings.kind==='seasonality'){if(!this.seasonalityCompute)throw Error('Seasonality source service is unavailable.');this.seasonalityCompute(assert,local,initialOwner);return;}
   if(exactVwap(this.settings)){if(!this.vwapCompute)throw Error('Exact VWAP service is unavailable.');this.vwapCompute(assert,local,initialOwner);if(!initialOwner||this.initialRetirement!==initialOwner)assert();return;}
   this.vwapRetire?.();
   assert();const input=this.ctx.bars();assert();const primary=this.#primary?.();assert();context=this.presentationContext?.();assert();const raw=computationRaw(input,primary,context?.style);if(raw===null)return;const bars=this.calculationBars(raw);assert();const scalarBudget=this.#preflight(bars.length);assert();
   const timeframe=this.#timeframe?.prepare(bars,raw,scalarBudget,assert),unavailable=timeframe&&timeframe!=='pending'&&'unavailable'in timeframe?timeframe.unavailable:null;if((timeframe==='pending'||unavailable!==null)&&!initialOwner)return;const qualified=timeframe&&timeframe!=='pending'&&'result'in timeframe?timeframe:undefined;
   const result=unavailable!==null?{id:this.settings.kind,series:[],diagnostics:[unavailable],policies:['Calendar-aware daily values are unavailable; a UTC calculation is not substituted.']}:timeframe==='pending'?{id:this.settings.kind,series:[],diagnostics:['Calendar-aware timeframe input is waiting for its actual accepted native frame.'],policies:['No UTC calculation is substituted while the qualified source is pending.']}:qualified?.result??(this.evaluate?this.evaluate(this.settings,bars,raw):evaluateDomainIndicator(this.settings.kind,bars,this.settings.inputs,{resolution:context?.resolution??null,calendar:context?.calendar??null,...(this.settings.kind==='vwap'?{corporateActions:vwapEventDatesFor(context?.instrument)}:{})}));
   result.policies.push('Display offsets use loaded bar timestamps only; points outside the loaded grid are omitted. Beyond-loaded projection and exchange-calendar parity remain unresolved.');
   const scalarDraft=this.#scalar?.prepare(this.settings,result,raw,bars,input,scalarBudget,()=>{assert();qualified?.assertCurrent();},context?.style);
   let timeframeAccepted=false,timeframeFailed=false,timeframeFailure:unknown;try{
   if(qualified){assert();qualified.assertCurrent();}const prepared=renderIndicatorPresentation(this.settings,result,bars,context,scalarDraft),previous=this.acceptedOutput;qualified?.publication.prepared(result,prepared.output);qualified?.assertCurrent();
   let emitted=false;
   try{assert();qualified?.assertCurrent();qualified?.publication.enter();let failed=false,failure:unknown;try{this.ctx.emit(prepared.output);}catch(error){failed=true;failure=error;}try{qualified?.publication.returned();}catch(error){if(failed)throw new AggregateError([failure,error],'Timeframe emission and retention failed.');throw error;}if(failed)throw failure;emitted=true;assert();qualified?.assertCurrent();this.ctx.setStatus('idle');assert();qualified?.publication.accepted();qualified?.assertCurrent();}
   catch(error){if(emitted&&error instanceof InputSourceRetired&&initialOwner){local();try{initialOwner.acceptEmission();}catch(proof){throw new AggregateError([error,proof],'Initial indicator source retired without exact completed native emission proof.');}this.initialRetirement=initialOwner;this.changed();return;}try{assert();}catch(retired){throw new AggregateError([error,retired],'Indicator emission owner retired; recovery was not applied.');}try{this.ctx.emit(previous);assert();this.displaySeries=previous.series??[];}catch(rollback){try{assert();this.display=[];}catch{/* No metadata writes through a retired calculation. */}throw new AggregateError([error,rollback],'Indicator emission failed and native rollback was incomplete.');}throw error;}
   assert();
   this.result=result;this.informationBars=bars.length;this.latestInformationTime=bars.at(-1)?.time??null;
   this.presentationDiagnostics=prepared.diagnostics;this.acceptedOutput=prepared.output;this.display=prepared.display;this.displaySeries=prepared.output.series??[];this.displayInput=input;this.displayPrecision=prepared.precision;this.result.policies.push(...prepared.policies);this.#scalar?.accept(scalarDraft,result,prepared.output,prepared.precision);qualified?.assertCurrent();qualified?.publication.assertCurrent();timeframeAccepted=true;this.changed();assert();
   }catch(error){timeframeFailed=true;timeframeFailure=error;throw error;}finally{this.#scalar?.abort(scalarDraft);try{qualified?.finish(timeframeAccepted);}catch(cleanup){if(timeframeFailed)throw new AggregateError([timeframeFailure,cleanup],'Timeframe calculation and cleanup failed.');throw cleanup;}}
  }
}
function inputData(owner:unknown,key:string,optional=false):any{if(!owner||typeof owner!=='object')throw Error('Native input owner unavailable: '+key);const field=Object.getOwnPropertyDescriptor(owner,key);if(!field){if(optional)return undefined;throw Error('Native input field unavailable: '+key);}if(!Object.hasOwn(field,'value'))throw Error('Native input owner requires data fields: '+key);return field.value;}
function verifyTimeframeNative(frame:PrimarySourceFrame,count:number,calculated:readonly Bar[]):void{
 const FIELDS=['time','open','high','low','close','volume'] as const,arrays=[frame.raw,frame.nativeRaw,frame.native,frame.shown,calculated];for(const rows of arrays)if(inputData(rows,'length')!==count)throw Error('The timeframe native prefix is incomplete.');
 let haOpen:number|undefined,haClose:number|undefined;
 for(let index=0;index<count;index++){
  const rows=arrays.map(array=>inputData(array,String(index))),values=FIELDS.map(key=>inputData(rows[0],key));for(let field=0;field<FIELDS.length;field++)if(typeof values[field]!=='number'||field!==5&&!Number.isFinite(values[field])||field===5&&!Number.isFinite(values[field])&&!Number.isNaN(values[field]))throw Error('The timeframe raw row is invalid.');
  const [time,o,h,l,c,v]=values,nextOpen=haOpen===undefined?(o+c)/2:(haOpen+haClose!)/2,nextClose=(o+h+l+c)/4,expected=frame.style==='heikinashi'?[time*1000,nextOpen,Math.max(h,nextOpen,nextClose),Math.min(l,nextOpen,nextClose),nextClose,v]:[time*1000,o,h,l,c,v];
  for(let field=0;field<FIELDS.length;field++){if(!Object.is(inputData(rows[1],FIELDS[field]),field?values[field]:time*1000)||!Object.is(inputData(rows[2],FIELDS[field]),expected[field])||!Object.is(inputData(rows[3],FIELDS[field]),expected[field])||!Object.is(inputData(rows[4],FIELDS[field]),field?expected[field]:time))throw Error('The timeframe native values differ from the accepted raw/HA frame.');}haOpen=nextOpen;haClose=nextClose;
 }
}
interface InitialEmissionOwner{assertCurrent():void;acceptEmission():void;acceptHandle(handle:IndicatorHandle):void}
class InputEditRetired extends Error{constructor(readonly original:unknown){super('Indicator edit owner retired; no old input, metadata or output recovery was applied.');}}
class InputSourceRetired extends InputEditRetired{}
function inputMethod(owner:object,key:string){for(let current:object|null=owner;current;current=Object.getPrototypeOf(current)){const descriptor=Object.getOwnPropertyDescriptor(current,key);if(descriptor){if(!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')throw Error('Native input method requires data: '+key);return{owner:current,descriptor};}}throw Error('Native input method unavailable: '+key);}
function inputDescriptors(value:unknown,kind:IndicatorId){validateIndicatorInputs(kind,value,true);const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);if(keys.length>64||keys.some(key=>typeof key!=='string'||!descriptors[key].writable||!descriptors[key].configurable||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value')))throw Error('Native inputs require bounded mutable own data');return descriptors;}
function exactInputTuple(value:unknown,expected:IndicatorInputs,kind:IndicatorId){const descriptors=inputDescriptors(value,kind),keys=Object.keys(descriptors);if(keys.length!==Object.keys(expected).length||keys.some(key=>!Object.hasOwn(expected,key)||descriptors[key].value!==expected[key]))throw Error('Native input tuple differs from its accepted owner');return descriptors;}
function assertInputFields(value:object,expected:PropertyDescriptorMap){const current=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(current),before=Reflect.ownKeys(expected);if(keys.length!==before.length||keys.some(key=>{const a=current[key as string],b=expected[key as string];return !b||!Object.hasOwn(a,'value')||a.value!==b.value||a.writable!==b.writable||a.configurable!==b.configurable||a.enumerable!==b.enumerable;}))throw Error('Exact VWAP input fields changed.');}
/** Only a native-delivered, privately authenticated mutable argument may lose keys. */
function captureInputRecovery(chart:Vela,model:DomainRenderingIndicator,type:string,descriptor:NativeIndicatorDescriptor,previous:IndicatorInputs,next:IndicatorInputs,assertLocal:()=>void){
 const coreField=Object.getOwnPropertyDescriptor(chart,'orchestrator');if(!coreField)return undefined; // Reduced public-only fixtures grant no alias-write authority.
 const core=inputData(chart,'orchestrator'),registry=inputData(core,'registry'),handles=inputData(core,'handles'),renderer=inputData(core,'renderer'),handle=model.handle;
 if(!handle||!(handles instanceof Map)||Object.getPrototypeOf(handles)!==Map.prototype||Object.hasOwn(handles,'get'))throw Error('Native input handle ownership unavailable');
 const methods=[[registry,'get'],[handle,'setInputs'],[model,'setInputs'],[core,'applyInputs'],[renderer,'setIndicatorInputs']].map(([owner,key])=>({target:owner as object,key:key as string,...inputMethod(owner as object,key as string)}));
 const get=methods[0],record=Reflect.apply(get.descriptor.value,registry,[handle.id]);assertLocal();const native=inputData(record,'native'),pins:Array<{owner:object;key:string;descriptor:PropertyDescriptor}>=[];
 const pin=(owner:object,key:string)=>{const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('Native input pin requires own data: '+key);pins.push({owner,key,descriptor});};
 for(const[owner,keys]of [[handle,['id']],[chart,['orchestrator']],[core,['registry','handles','renderer','bars']],[record,['native']],[native,['type','descriptor','instance']]] as Array<[object,string[]]>)for(const key of keys)pin(owner,key);
 let argument:Record<string,InputValue>|undefined,admitted:PropertyDescriptorMap|undefined,phase:'forward'|'repair'='forward',forwardCalls=0,repairCalls=0,unusable=false;
 let retired:InputEditRetired|undefined;
 // The original SDK leaves hidden absent on a default visible plain record.
 // Validate before native callbacks too: applyInputs itself reads record.hidden.
 function hiddenState(expected?:boolean):boolean{
  if(retired)throw retired;
  try{
   const field=Object.getOwnPropertyDescriptor(record,'hidden');let value:boolean;
   if(field){if(!Object.hasOwn(field,'value')||typeof field.value!=='boolean')throw Error('Native input visibility requires an own boolean');value=field.value;}
   else{const prototype=Object.getPrototypeOf(record);if(prototype!==Object.prototype||Object.getOwnPropertyDescriptor(prototype,'hidden')!==undefined)throw Error('Native input default visibility requires the plain SDK record');value=false;}
   if(expected!==undefined&&value!==expected)throw Error('Accepted indicator visibility changed');return value;
  }catch(error){retired=error instanceof InputEditRetired?error:new InputEditRetired(error);throw retired;}
 }
 function checkPins(){for(const pin of pins){const now=Object.getOwnPropertyDescriptor(pin.owner,pin.key),before=pin.descriptor;if(!now||now.value!==before.value||now.writable!==before.writable||now.configurable!==before.configurable||now.enumerable!==before.enumerable)throw Error('Native input ownership changed: '+pin.key);}for(const method of methods){const now=inputMethod(method.target,method.key),a=now.descriptor,b=method.descriptor;if(now.owner!==method.owner||a.value!==b.value||a.writable!==b.writable||a.configurable!==b.configurable||a.enumerable!==b.enumerable)throw Error('Native input method changed: '+method.key);}}
 function guard(){if(retired)throw retired;try{assertLocal();checkPins();const current=Reflect.apply(get.descriptor.value,registry,[handle!.id]);assertLocal();checkPins();hiddenState();if(current!==record||Map.prototype.get.call(handles,handle!.id)!==handle||inputData(native,'descriptor')!==descriptor||inputData(native,'instance')!==model||inputData(native,'type')!==type||getNativeIndicator(type)!==descriptor||inputData(core,'renderer')!==renderer)throw Error('Native input descriptor/record/instance owner changed');}catch(error){retired=error instanceof InputEditRetired?error:new InputEditRetired(error);throw retired;}}
 guard();exactInputTuple(inputData(record,'inputValues'),previous,model.settings.kind);guard();
 return{
  assertCurrent:guard,
  accepted(){guard();const values=inputData(record,'inputValues');exactInputTuple(values,next,model.settings.kind);const accepted=inputData(record,'model'),renderHandle=inputData(record,'renderHandle'),scene=inputData(renderer,'scene'),models=inputData(scene,'indicators');if(!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype)throw Error('Accepted indicator scene unavailable');const mounted=Map.prototype.get.call(models,handle.id),hidden=hiddenState(!model.settings.visible);// No mounted model is exact while hidden, or while showing a restored-hidden instance whose native
     // start is still pending (neither the core record nor this instance has started; its first emit mounts).
     const startPending=model.ctx===null&&inputData(native,'started',true)!==true;
     if(hidden!==!model.settings.visible||inputData(accepted,'id')!==handle.id||(mounted===undefined?!hidden&&!startPending:inputData(mounted,'id')!==handle.id))throw Error('Accepted indicator scene owner differs');guard();return()=>{guard();if(inputData(record,'inputValues')!==values||inputData(record,'model')!==accepted||inputData(record,'renderHandle')!==renderHandle||hiddenState(hidden)!==hidden||inputData(renderer,'scene')!==scene||inputData(scene,'indicators')!==models||Map.prototype.get.call(models,handle.id)!==mounted)throw Error('Accepted indicator native/scene state changed');exactInputTuple(values,next,model.settings.kind);guard();};},
  observe(inputs:Record<string,InputValue>){guard();if(phase==='forward'?++forwardCalls!==1:++repairCalls!==1){unusable=true;throw Error('Native input callback repeated or reentered');}if(inputData(record,'inputValues')!==inputs){unusable=true;throw Error('Native input argument is not the current owned tuple');}try{const fields=exactInputTuple(inputs,phase==='forward'?next:previous,model.settings.kind);guard();if(inputData(record,'inputValues')!==inputs)throw Error('Native input argument replaced during admission');if(phase==='forward'){argument=inputs;admitted=fields;}}catch(error){unusable=true;throw error;}},
  restore(){guard();if(unusable||!argument||!admitted||inputData(record,'inputValues')!==argument)throw Error('Native input rollback has no current authenticated callback argument');const fields=admitted,current=Object.getOwnPropertyDescriptors(argument),keys=Reflect.ownKeys(current),known=Reflect.ownKeys(fields);if(keys.length!==known.length||keys.some(key=>!Object.hasOwn(fields,key)||!Object.hasOwn(current[key as string],'value')||current[key as string].value!==fields[key as string].value||current[key as string].get||current[key as string].set||current[key as string].writable!==true||current[key as string].configurable!==true||current[key as string].enumerable!==true))throw Error('Native input callback data changed before rollback');guard();
   for(const key of Object.keys(current))if(!Object.hasOwn(previous,key)&&!Reflect.deleteProperty(argument,key))throw Error('Native input rollback could not remove a rejected key');for(const[key,value]of Object.entries(previous))Object.defineProperty(argument,key,{value,writable:true,configurable:true,enumerable:true});exactInputTuple(argument,previous,model.settings.kind);guard();if(inputData(record,'inputValues')!==argument)throw Error('Native input callback owner changed during rollback');phase='repair';
  },
  verify(){guard();const values=inputData(record,'inputValues');exactInputTuple(values,previous,model.settings.kind);guard();if(inputData(record,'inputValues')!==values)throw Error('Native input tuple changed during recovery readback');},
 };
}
/** Initial emit success is not rejection merely because the captured publication source retired. */
function captureInitialEmissionOwner(chart:Vela,model:DomainRenderingIndicator,descriptor:NativeIndicatorDescriptor|undefined,ctx:NativeIndicatorContext,assertLocal:()=>void):InitialEmissionOwner|undefined{
 if(!Object.getOwnPropertyDescriptor(chart,'orchestrator'))return undefined;
 const core=inputData(chart,'orchestrator'),registry=inputData(core,'registry'),handles=inputData(core,'handles'),renderer=inputData(core,'renderer'),scene=inputData(renderer,'scene'),get=inputMethod(registry,'get'),id=ctx.id;
 if(!descriptor||getNativeIndicator(descriptor.type)!==descriptor||!(handles instanceof Map)||Object.getPrototypeOf(handles)!==Map.prototype)throw Error('Initial indicator native owner unavailable');
 const record=Reflect.apply(get.descriptor.value,registry,[id]);assertLocal();const native=inputData(record,'native'),handle=Map.prototype.get.call(handles,id),settings=model.settings;
 if(inputData(native,'descriptor')!==descriptor||inputData(native,'instance')!==model||!handle||inputData(handle,'id')!==id)throw Error('Initial indicator native instance differs');
 let retired=false,emission:{model:object;renderHandle:object;models:Map<string,unknown>}|undefined;
 function assertCurrent(){if(retired)throw Error('Initial indicator acceptance proof retired');try{assertLocal();if(inputData(chart,'orchestrator')!==core||inputData(core,'registry')!==registry||inputData(core,'handles')!==handles||inputData(core,'renderer')!==renderer||inputData(renderer,'scene')!==scene||model.settings!==settings||model.ctx!==ctx||model.handle!==null&&model.handle!==handle||Map.prototype.get.call(handles,id)!==handle||getNativeIndicator(descriptor!.type)!==descriptor)throw Error('Initial indicator native ownership replaced');const method=inputMethod(registry,'get');if(method.owner!==get.owner||method.descriptor.value!==get.descriptor.value)throw Error('Initial indicator registry method replaced');const current=Reflect.apply(get.descriptor.value,registry,[id]);assertLocal();const after=inputMethod(registry,'get');if(after.owner!==get.owner||after.descriptor.value!==get.descriptor.value)throw Error('Initial indicator registry method retired during callback');if(current!==record||inputData(chart,'orchestrator')!==core||inputData(core,'registry')!==registry||inputData(core,'handles')!==handles||inputData(core,'renderer')!==renderer||inputData(renderer,'scene')!==scene||inputData(record,'native')!==native||inputData(native,'descriptor')!==descriptor||inputData(native,'instance')!==model||Map.prototype.get.call(handles,id)!==handle||model.settings!==settings||model.ctx!==ctx)throw Error('Initial indicator native record replaced');if(emission&&(inputData(record,'model')!==emission.model||inputData(record,'renderHandle')!==emission.renderHandle||inputData(scene,'indicators')!==emission.models||Map.prototype.get.call(emission.models,id)!==emission.model))throw Error('Initial indicator accepted scene/model changed');}catch(error){retired=true;throw error;}}
 assertCurrent();return Object.freeze({assertCurrent,acceptEmission(){assertCurrent();if(emission)throw Error('Initial indicator emission proof already consumed');const mounted=inputData(record,'model'),renderHandle=inputData(record,'renderHandle'),models=inputData(scene,'indicators');if(!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype||inputData(mounted,'id')!==id||inputData(inputData(mounted,'native'),'type')!==descriptor.type||inputData(renderHandle,'id')!==id||Map.prototype.get.call(models,id)!==mounted)throw Error('Initial indicator completed emission differs from mounted native model');emission={model:mounted,renderHandle,models};assertCurrent();},acceptHandle(candidate:IndicatorHandle){assertCurrent();if(!emission||candidate!==handle)throw Error('Initial indicator returned a different native handle');assertCurrent();}});
}
/** Strict observation for an already admitted live source slot. No old lookup fallback exists. */
function requireNativeRegistryLookup(lookup:NativeRegistryLookup,registry:object){
 const value=lookup.read(registry);if(!value)throw Error('The bounded native registry observation retired.');return value;
}
/** Same native ownership proof as the legacy route, with only bounded registry observations. */
function captureInitialEmissionOwnerBounded(chart:Vela,model:DomainRenderingIndicator,descriptor:NativeIndicatorDescriptor|undefined,ctx:NativeIndicatorContext,assertLocal:()=>void,lookup:NativeRegistryLookup):InitialEmissionOwner|undefined{
 if(!Object.getOwnPropertyDescriptor(chart,'orchestrator'))return undefined;
 const core=inputData(chart,'orchestrator'),registry=inputData(core,'registry'),handles=inputData(core,'handles'),renderer=inputData(core,'renderer'),scene=inputData(renderer,'scene'),get=requireNativeRegistryLookup(lookup,registry),id=ctx.id;
 if(!descriptor||getNativeIndicator(descriptor.type)!==descriptor||!(handles instanceof Map)||Object.getPrototypeOf(handles)!==Map.prototype)throw Error('Initial indicator native owner unavailable');
 const record=Reflect.apply(get.descriptor.value,registry,[id]);assertLocal();const observed=requireNativeRegistryLookup(lookup,registry);assertLocal();if(observed.owner!==get.owner||observed.descriptor.value!==get.descriptor.value)throw Error('Initial indicator bounded registry changed during capture');const native=inputData(record,'native'),handle=Map.prototype.get.call(handles,id),settings=model.settings;
 if(inputData(native,'descriptor')!==descriptor||inputData(native,'instance')!==model||!handle||inputData(handle,'id')!==id)throw Error('Initial indicator native instance differs');
 let retired=false,emission:{model:object;renderHandle:object;models:Map<string,unknown>}|undefined;
 function assertCurrent(){if(retired)throw Error('Initial indicator acceptance proof retired');try{assertLocal();if(inputData(chart,'orchestrator')!==core||inputData(core,'registry')!==registry||inputData(core,'handles')!==handles||inputData(core,'renderer')!==renderer||inputData(renderer,'scene')!==scene||model.settings!==settings||model.ctx!==ctx||model.handle!==null&&model.handle!==handle||Map.prototype.get.call(handles,id)!==handle||getNativeIndicator(descriptor!.type)!==descriptor)throw Error('Initial indicator native ownership replaced');const method=requireNativeRegistryLookup(lookup,registry);if(method.owner!==get.owner||method.descriptor.value!==get.descriptor.value)throw Error('Initial indicator registry method replaced');const current=Reflect.apply(get.descriptor.value,registry,[id]);assertLocal();const after=requireNativeRegistryLookup(lookup,registry);if(after.owner!==get.owner||after.descriptor.value!==get.descriptor.value)throw Error('Initial indicator registry method retired during callback');if(current!==record||inputData(chart,'orchestrator')!==core||inputData(core,'registry')!==registry||inputData(core,'handles')!==handles||inputData(core,'renderer')!==renderer||inputData(renderer,'scene')!==scene||inputData(record,'native')!==native||inputData(native,'descriptor')!==descriptor||inputData(native,'instance')!==model||Map.prototype.get.call(handles,id)!==handle||model.settings!==settings||model.ctx!==ctx)throw Error('Initial indicator native record replaced');if(emission&&(inputData(record,'model')!==emission.model||inputData(record,'renderHandle')!==emission.renderHandle||inputData(scene,'indicators')!==emission.models||Map.prototype.get.call(emission.models,id)!==emission.model))throw Error('Initial indicator accepted scene/model changed');}catch(error){retired=true;throw error;}}
 assertCurrent();return Object.freeze({assertCurrent,acceptEmission(){assertCurrent();if(emission)throw Error('Initial indicator emission proof already consumed');const mounted=inputData(record,'model'),renderHandle=inputData(record,'renderHandle'),models=inputData(scene,'indicators');if(!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype||inputData(mounted,'id')!==id||inputData(inputData(mounted,'native'),'type')!==descriptor.type||inputData(renderHandle,'id')!==id||Map.prototype.get.call(models,id)!==mounted)throw Error('Initial indicator completed emission differs from mounted native model');emission={model:mounted,renderHandle,models};assertCurrent();},acceptHandle(candidate:IndicatorHandle){assertCurrent();if(!emission||candidate!==handle)throw Error('Initial indicator returned a different native handle');assertCurrent();}});
}
/** The async result cannot borrow another native instance or an independently replaced scene. */
function captureVwapNativeOwner(chart:Vela,model:DomainRenderingIndicator,descriptor:NativeIndicatorDescriptor,assertLocal:()=>void){
 const core=inputData(chart,'orchestrator'),registry=inputData(core,'registry'),handles=inputData(core,'handles'),renderer=inputData(core,'renderer'),scene=inputData(renderer,'scene'),models=inputData(scene,'indicators'),bars=inputData(core,'bars'),ctx=model.ctx!;
 const records=inputData(registry,'records');if(!(records instanceof Map)||Object.getPrototypeOf(records)!==Map.prototype||Object.hasOwn(records,'get'))throw Error('Exact VWAP requires its native registry map.');
 const id=inputData(ctx,'id'),get=inputMethod(registry,'get'),record=Reflect.apply(get.descriptor.value,registry,[id]),native=inputData(record,'native'),handle=Map.prototype.get.call(handles,id),inputs=inputData(record,'inputValues'),expected=exactInputTuple(inputs,model.settings.inputs,'vwap');
 const emits=inputMethod(ctx,'emit'),statuses=inputMethod(ctx,'setStatus');let retired=false;
 let projection:{model:unknown;renderHandle:unknown;mounted:unknown}|undefined;
 function fields(){assertLocal();if(inputData(chart,'orchestrator')!==core||inputData(core,'registry')!==registry||inputData(registry,'records')!==records||Map.prototype.get.call(records,id)!==record||inputData(core,'handles')!==handles||inputData(core,'renderer')!==renderer||inputData(core,'bars')!==bars||inputData(renderer,'scene')!==scene||inputData(scene,'indicators')!==models||Map.prototype.get.call(handles,id)!==handle||inputData(handle,'id')!==id||inputData(record,'native')!==native||inputData(native,'descriptor')!==descriptor||inputData(native,'instance')!==model||getNativeIndicator(descriptor.type)!==descriptor||inputData(record,'inputValues')!==inputs)throw Error('Exact VWAP native incarnation changed.');
  for(const [object,key,pin]of [[registry,'get',get],[ctx,'emit',emits],[ctx,'setStatus',statuses]] as const){const current=inputMethod(object,key),a=current.descriptor,b=pin.descriptor;if(current.owner!==pin.owner||a.value!==b.value||a.writable!==b.writable||a.configurable!==b.configurable||a.enumerable!==b.enumerable)throw Error('Exact VWAP native method changed.');}
  assertInputFields(inputs,expected);if(projection&&(inputData(record,'model')!==projection.model||inputData(record,'renderHandle')!==projection.renderHandle||Map.prototype.get.call(models,id)!==projection.mounted))throw Error('Exact VWAP native projection replaced.');}
 function local(){if(retired)throw Error('Exact VWAP native incarnation retired.');try{fields();}catch(error){retired=true;throw error;}}
 function assert(){if(retired)throw Error('Exact VWAP native incarnation retired.');try{fields();const current=Reflect.apply(get.descriptor.value,registry,[id]);fields();if(current!==record)throw Error('Exact VWAP native record changed.');
 }catch(error){retired=true;throw error;}}
 function accept(){assertLocal();const value=inputData(record,'model'),renderHandle=inputData(record,'renderHandle'),mounted=Map.prototype.get.call(models,id),hidden=inputData(record,'hidden');if(!value||inputData(value,'id')!==id||!renderHandle||inputData(renderHandle,'id')!==id||(mounted===undefined?!hidden:mounted!==value))throw Error('Exact VWAP returned emission does not match the native scene.');projection={model:value,renderHandle,mounted};assert();}
 return{assert,local,accept,input:bars as readonly unknown[]};
}
let portSequence=0;
export function createIndicatorPort(chart:Vela,panes:PaneRegistry=createPaneRegistry(chart),calculationBars:(bars:readonly Bar[])=>Bar[]=bars=>bars.map(bar=>({...bar})),inputBars?:()=>readonly Bar[],claimNative?:ClaimNativeDescriptor,presentationContextInput?:(owner?:IndicatorPresentationOwner)=>IndicatorPresentationContext,publicationHost?:AnalysisPublicationHost,vwapHost?:VwapIndicatorHost){
 return buildIndicatorPort(chart,panes,calculationBars,inputBars,claimNative,presentationContextInput,publicationHost,vwapHost).port;
}
export interface OwnedPrimarySourceControl {prepare(instanceId:string,request:PrimarySourceRequest):Promise<PrimarySourceView>;dispose():void}
export interface OwnedIndicatorPortOptions {
 chart:Vela;panes?:PaneRegistry;calculationBars?:(bars:readonly Bar[])=>Bar[];inputBars?:()=>readonly Bar[];
 claimNative?:ClaimNativeDescriptor;presentationContext?:(owner?:IndicatorPresentationOwner)=>IndicatorPresentationContext;
 publication?:AnalysisPublicationHost;vwap?:VwapIndicatorHost;primaryHost:OwnedPrimarySourceHost;calendar?:true;
}
/** Creates ONE fresh real port. No existing-port lookup/attachment or controller capability is exposed. */
export function createIndicatorPortWithPrimarySource(options:OwnedIndicatorPortOptions){
 const built=buildIndicatorPort(options.chart,options.panes,options.calculationBars,options.inputBars,options.claimNative,options.presentationContext,options.publication,options.vwap,options.primaryHost,options.calendar===true);
 if(!built.primary){built.port.dispose();throw Error('The original candle source control was not constructed.');}return Object.freeze({port:built.port,primary:built.primary});
}
function buildIndicatorPort(chart:Vela,panes:PaneRegistry=createPaneRegistry(chart),calculationBars:(bars:readonly Bar[])=>Bar[]=bars=>bars.map(bar=>({...bar})),inputBars?:()=>readonly Bar[],claimNative?:ClaimNativeDescriptor,presentationContextInput?:(owner?:IndicatorPresentationOwner)=>IndicatorPresentationContext,publicationHost?:AnalysisPublicationHost,vwapHost?:VwapIndicatorHost,primaryHost?:OwnedPrimarySourceHost,calendarEnabled=false){
 const ownedPrimary:{value:OwnedPrimarySourceControl|null}={value:null};
 const built=createBuiltinPresentationPort(chart as unknown as object,publicationHost,inputBars,scalar=>{
  const prefix=`lv-domain-port-${++portSequence}`;const instances=new Map<string,{model:DomainRenderingIndicator;type:string;descriptor?:NativeIndicatorDescriptor;release?:()=>void;scalarEvaluator?:DomainRenderingIndicator['evaluate']}>();
  const scalarHooks=new WeakMap<DomainRenderingIndicator,BuiltinModelHooks>();
  const settlementScope:SeasonalitySettlementScope={live:true,entries:new WeakRef<ReadonlyMap<string,SeasonalitySettlementEntry>>(instances),host:primaryHost?new WeakRef(primaryHost):null,waits:new WeakMap(),records:new Set()};
  let batchDepth=0,disposed=false,releaseDisplay=()=>{};
  const notifications=createAnalysisPublication('Indicator',publicationHost),changed=notifications.changed;
  const acceptedEdits=new WeakMap<DomainRenderingIndicator,{generation:number;assert:()=>void}>();
  const incomplete=(model:DomainRenderingIndicator,error:unknown,owner:ReturnType<NonNullable<typeof publicationHost>['captureOwner']>|undefined)=>{const generation=model.editGeneration,settings=model.settings,entry=instances.get(settings.id);if(disposed||entry?.model!==model)return;if(owner&&!owner.isCurrent())return;if(disposed||instances.get(settings.id)!==entry||model.removed||model.editGeneration!==generation||model.settings!==settings)return;model.recoveryError=new AggregateError([error],'Indicator edit failed and native rollback was incomplete. Reopen this chart before continuing.');};
  const assertActive=()=>{if(disposed)throw new Error('Indicator port is disposed.');notifications.assertMutable();};
  const budget=(count:number,records:readonly IndicatorInstanceSettings[]=[...instances.values()].map(entry=>entry.model.settings))=>{const admitted=assertIndicatorBatchBudget(withSourceChains(records),count);scalar.reconcile(admitted);return admitted;};
  const presentationOwnerTokens=new WeakMap<DomainRenderingIndicator,object>();
  const presentationIncarnations=new WeakMap<DomainRenderingIndicator,{model:unknown;handle:unknown;scene:unknown;mounted:unknown;token:object}>();
  const capturePresentationOwner=(id:string):IndicatorPresentationOwner|null=>{
   assertActive();const entry=instances.get(id),model=entry?.model;if(!entry||!model||model.removed)return null;
   const settings=model.settings,ctx=model.ctx,handle=model.handle,generation=model.editGeneration,source=publicationHost?.captureOwner();
   const local=()=>{if(disposed||instances.get(id)!==entry||entry.model!==model||model.removed||model.settings!==settings||model.ctx!==ctx||model.handle!==handle||model.editGeneration!==generation||source&&!source.isCurrent())throw Error('Indicator presentation owner changed.');};local();
   let proof:InitialEmissionOwner|undefined;
   // A NEW local read-only proof; the initial-retirement receipt and publication clock are never consumed or changed.
   if(ctx&&handle){const candidate=captureInitialEmissionOwner(chart,model,entry.descriptor,ctx,local);if(candidate){const scene=inputData(inputData(inputData(chart,'orchestrator'),'renderer'),'scene'),models=inputData(scene,'indicators');if(!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype)throw Error('Indicator native scene map is unavailable.');if(Map.prototype.has.call(models,inputData(ctx,'id'))){candidate.acceptEmission();proof=candidate;}}}local();
   let token=presentationOwnerTokens.get(model);if(!token){token=Object.freeze({});presentationOwnerTokens.set(model,token);}
   const nativeId=proof&&ctx?inputData(ctx,'id') as string:null;
   if(nativeId!==null&&(typeof nativeId!=='string'||!nativeId||nativeId.length>4096))throw Error('Indicator native identity is unavailable.');
   let nativeIncarnation:object|null=null;
   if(proof&&nativeId!==null){const core=inputData(chart,'orchestrator'),registry=inputData(core,'registry'),get=inputMethod(registry,'get'),record=Reflect.apply(get.descriptor.value,registry,[nativeId]),scene=inputData(inputData(core,'renderer'),'scene'),mounted=Map.prototype.get.call(inputData(scene,'indicators'),nativeId),current={model:inputData(record,'model'),handle:inputData(record,'renderHandle'),scene,mounted};proof.assertCurrent();local();let prior=presentationIncarnations.get(model);if(!prior||prior.model!==current.model||prior.handle!==current.handle||prior.scene!==current.scene||prior.mounted!==current.mounted){prior={...current,token:Object.freeze({})};presentationIncarnations.set(model,prior);}nativeIncarnation=prior.token;}
   return Object.freeze({instanceOwner:token,nativeId,nativeIncarnation,assertCurrent(){local();proof?.assertCurrent();local();}});
  };
  const capturePresentationOwnerBounded=(id:string,lookup:NativeRegistryLookup):IndicatorPresentationOwner|null=>{
   assertActive();const entry=instances.get(id),model=entry?.model;if(!entry||!model||model.removed)return null;
   const settings=model.settings,ctx=model.ctx,handle=model.handle,generation=model.editGeneration,source=publicationHost?.captureOwner();
   const local=()=>{if(disposed||instances.get(id)!==entry||entry.model!==model||model.removed||model.settings!==settings||model.ctx!==ctx||model.handle!==handle||model.editGeneration!==generation||source&&!source.isCurrent())throw Error('Indicator presentation owner changed.');};local();
   let proof:InitialEmissionOwner|undefined;
   // A NEW local read-only proof; the initial-retirement receipt and publication clock are never consumed or changed.
   if(ctx&&handle){const candidate=captureInitialEmissionOwnerBounded(chart,model,entry.descriptor,ctx,local,lookup);if(candidate){const scene=inputData(inputData(inputData(chart,'orchestrator'),'renderer'),'scene'),models=inputData(scene,'indicators');if(!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype)throw Error('Indicator native scene map is unavailable.');if(Map.prototype.has.call(models,inputData(ctx,'id'))){candidate.acceptEmission();proof=candidate;}}}local();
   let token=presentationOwnerTokens.get(model);if(!token){token=Object.freeze({});presentationOwnerTokens.set(model,token);}
   const nativeId=proof&&ctx?inputData(ctx,'id') as string:null;
   if(nativeId!==null&&(typeof nativeId!=='string'||!nativeId||nativeId.length>4096))throw Error('Indicator native identity is unavailable.');
   let nativeIncarnation:object|null=null;
   if(proof&&nativeId!==null){const core=inputData(chart,'orchestrator'),registry=inputData(core,'registry'),get=requireNativeRegistryLookup(lookup,registry),record=Reflect.apply(get.descriptor.value,registry,[nativeId]);local();const after=requireNativeRegistryLookup(lookup,registry);local();if(after.owner!==get.owner||after.descriptor.value!==get.descriptor.value)throw Error('Indicator bounded registry changed during presentation capture.');const scene=inputData(inputData(core,'renderer'),'scene'),mounted=Map.prototype.get.call(inputData(scene,'indicators'),nativeId),current={model:inputData(record,'model'),handle:inputData(record,'renderHandle'),scene,mounted};proof.assertCurrent();local();let prior=presentationIncarnations.get(model);if(!prior||prior.model!==current.model||prior.handle!==current.handle||prior.scene!==current.scene||prior.mounted!==current.mounted){prior={...current,token:Object.freeze({})};presentationIncarnations.set(model,prior);}nativeIncarnation=prior.token;}
   return Object.freeze({instanceOwner:token,nativeId,nativeIncarnation,assertCurrent(){local();proof?.assertCurrent();local();}});
  };
  const presentationContext=presentationContextInput?(id?:string)=>{const context=presentationContextInput(id!==undefined&&instances.get(id)?.model.settings.kind==='tradingsessions'?capturePresentationOwner(id)??undefined:undefined);if(!context.profileSource||profilePrimaryInputMatches(context.profileSource,inputBars?.()))return context;const {profileSource,...local}=context;return local;}:undefined;
  const currentCount=()=>inputBars?.().length??[...instances.values()].find(entry=>entry.model.ctx)?.model.ctx?.bars().length??0;
  interface PrimarySlot {nativeLookup:NativeRegistryLookup|null;request:AbortSignal;cleanupFailed:boolean;cleanupError:unknown;beginPublication:(()=>void)|null;acceptPublication:(()=>void)|null;emitting:boolean;assertCurrent:(()=>void)|null;generation:object;controller:AbortController;reservation:ReturnType<typeof scalar.reserveSource>;prepared:OwnedPreparedPrimarySource|null;preparation?:BuiltinScenePublication|null;plan?:Readonly<PrimarySourcePlan>;off:(()=>void)|null;calendarKind?:SeasonalityCalendarContract['kind'];calendarHold?:{lease:SeasonalityCalendarAxisHandle|null;pending:boolean};calendarCohort?:CalendarCohort|null}
  interface CalendarCohort {frame:object;publication:object;policy:number;lease:SeasonalityCalendarAxisHandle}
  const primarySlots=new Map<DomainRenderingIndicator,PrimarySlot>();
  const seasonalityDemands=new Map<DomainRenderingIndicator,SeasonalityDemandOwner>();
  function dailyDemandFor(model:DomainRenderingIndicator,plan:AlpacaSeasonalityDailyPlan,current:()=>void):AlpacaSeasonalityDailyDemand{
   current();const prior=seasonalityDemands.get(model);if(prior?.live&&prior.key&&alpacaSeasonalityDailyDemandMatches(prior.key,plan)){prior.ticket=null;current();return prior.key;}
   if(prior){seasonalityDemands.delete(model);releaseSeasonalityDemandOwner(prior);}current();if(seasonalityDemands.size>=1000)throw Error('The current daily-history client inventory is full.');
   const controller=new AbortController(),key=acquireAlpacaSeasonalityDailyDemand(plan,controller.signal),owner:SeasonalityDemandOwner={key,controller,live:true,ticket:null,wake:null,off:null};
   try{current();if(seasonalityDemands.has(model))throw Error('The actual daily-history client changed during acquisition.');seasonalityDemands.set(model,owner);owner.wake=seasonalityDemandWake(new WeakRef(model),new WeakRef(owner));owner.off=subscribeAlpacaSeasonalityDailyDemand(key,owner.wake);current();if(seasonalityDemands.get(model)!==owner)throw Error('The daily-history client was replaced.');return key;}
   catch(error){if(seasonalityDemands.get(model)===owner)seasonalityDemands.delete(model);try{releaseSeasonalityDemandOwner(owner);}catch(cleanup){throw new AggregateError([error,cleanup],'Daily-history client acquisition and cleanup failed.');}throw error;}
  }
  function deferDailyDemand(model:DomainRenderingIndicator):void{
   const owner=seasonalityDemands.get(model);if(!owner?.live)return;const ticket={};owner.ticket=ticket;queueMicrotask(deferredSeasonalityDemandRetire(new WeakRef(seasonalityDemands),new WeakRef(model),new WeakRef(owner),ticket));
  }
  let calendarCohort:CalendarCohort|null=null;
  const calendarDefaults=calendarEnabled?Object.freeze(Object.fromEntries(['calendar','session','dateLabels','projectionGeometry'].map(key=>[key,catalogInputValue(catalogDefinition('seasonality')!,{},key)]))):null;
  const liveCalendarPolicy=():number|null=>{
   if(!primaryHost)return null;const basis=primaryHost.capture();if(!basis||basis.execution!=='ordinary'||!basis.assertSessionCurrent||(basis.session!=='regular'&&basis.session!=='extended'))return null;
   const daily=captureSeasonalityDailyContext(basis.context,2015,2028,basis.execution);if(!daily)return null;basis.assertCurrent();basis.assertSessionCurrent();daily.assertCurrent();return basis.session==='regular'?9:11;
  };
  // These fixed declarations govern geometry only, never numerical/source permission.
  const calendarPolicy=(settings:IndicatorInstanceSettings,live:number|null=null):number|null=>{
   if(!calendarEnabled||settings.kind!=='seasonality'||!settings.visible)return null;
   const get=(key:string)=>inputData(settings.inputs,key,true)??calendarDefaults![key];
   if(get('projectionGeometry')!==true)return null;
   if(live!==null)return live;
   const calendar=get('calendar'),session=get('session'),labels=get('dateLabels');
   if(calendar!=='utc-continuous'&&calendar!=='nyse'||session!=='continuous'&&session!=='regular'&&session!=='extended'||labels!=='utc-date'&&labels!=='calendar-midnight')throw Error('Seasonality calendar declarations are unavailable.');
   return Number(calendar==='nyse')*6+(session==='regular'?2:session==='extended'?4:0)+Number(labels==='calendar-midnight');
  };
  const calendarPreflight=(settings:IndicatorInstanceSettings,replacing=settings.id)=>{
   const live=liveCalendarPolicy(),policy=calendarPolicy(settings,live);if(policy===null)return;
   for(const entry of instances.values()){const other=entry.model.settings;if(other.id!==replacing){const existing=calendarPolicy(other,live);if(existing!==null&&existing!==policy)throw Error('Visible Seasonality projections must share one declared calendar, session and date-label policy on this chart. Hide the conflicting projection or use another chart.');}}
  };
  const releaseCalendar=(slot:PrimarySlot)=>{
   const cohort=slot.calendarCohort;
   if(!cohort){const lease=slot.calendarHold?.lease;if(!lease)return;let failure:unknown,failed=false;try{lease.dispose();}catch(error){failure=error;failed=true;}const detached=lease.isDetached();if(detached&&slot.calendarHold)slot.calendarHold.lease=null;if(failed)throw failure;if(!detached)throw Error('The unpublished calendar copy remains held.');return;}
   slot.calendarCohort=null;
   // Transfer coverage only to another actual pinned source reservation. No
   // owner registry or new numerical proof is created by this bounded scan.
   for(const other of primarySlots.values())if(other!==slot&&other.calendarCohort===cohort&&other.reservation&&other.calendarHold?.lease===cohort.lease){if(slot.calendarHold)slot.calendarHold.lease=null;return;}
   let failure:unknown,failed=false;try{cohort.lease.dispose();}catch(error){failure=error;failed=true;}
   const detached=cohort.lease.isDetached();if(detached){if(slot.calendarHold)slot.calendarHold.lease=null;if(calendarCohort===cohort)calendarCohort=null;}
   if(failed)throw failure;if(!detached)throw Error('The prior Seasonality calendar copy could not be proved detached; its source charge remains held.');
  };
  const releasePrimary=(model:DomainRenderingIndicator,slot:PrimarySlot)=>{
   if(slot.plan?.liveDaily){
    const retry=settlementScope.waits.get(model);if(retry?.live&&retry.ticket===slot.generation)retry.awaiting=true;
    if(primarySlots.get(model)===slot)primarySlots.delete(model);const off=slot.off,prepared=slot.prepared,reservation=slot.reservation,preparation=slot.preparation;slot.off=null;slot.prepared=null;slot.reservation=null;slot.preparation=null;slot.nativeLookup=null;slot.plan=undefined;slot.assertCurrent=null;slot.beginPublication=null;slot.acceptPublication=null;slot.emitting=false;
    const failures:unknown[]=[];for(const release of [()=>releaseCalendar(slot),()=>slot.controller.abort(),()=>off?.(),()=>prepared?.dispose(),()=>preparation?.retire(),()=>reservation?.release()])try{release();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Live daily source cleanup was incomplete.');return;
   }
   if(primarySlots.get(model)===slot)primarySlots.delete(model);const off=slot.off,prepared=slot.prepared,reservation=slot.reservation;slot.off=null;slot.prepared=null;slot.reservation=null;slot.nativeLookup=null;slot.assertCurrent=null;slot.beginPublication=null;slot.acceptPublication=null;slot.emitting=false;const failures:unknown[]=[];for(const release of [()=>releaseCalendar(slot),()=>reservation?.release(),()=>slot.controller.abort(),()=>off?.(),()=>prepared?.dispose()])try{release();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Original source cleanup was incomplete.');
  };

  const observeSeasonalitySettlement=(model:DomainRenderingIndicator,slot:PrimarySlot,reservation:BuiltinSourceReservation)=>{
   if(settlementScope.waits.has(model)||!settlementScope.live)return;
   const entry=instances.get(model.settings.id);if(!entry||entry.model!==model||primarySlots.get(model)!==slot||slot.reservation!==reservation)return;
   const wake=seasonalitySettlementWake(new WeakRef(settlementScope),new WeakRef(model),slot.generation);
   // This admission is deliberately NON-mutating: budget() reconciles and
   // could cancel the prior owner before its observers are installed.
   const admitted=assertIndicatorBatchBudget(withSourceChains([...instances.values()].map(value=>value.model.settings)),currentCount());
   const lease=scalar.waitSeasonalitySourceSettlement(model,reservation,admitted,wake);
   // Optional observer headroom must not change A's existing source admission.
   if(!lease)return;
   if(!settlementScope.live||disposed||instances.get(model.settings.id)!==entry||entry.model!==model||primarySlots.get(model)!==slot||slot.reservation!==reservation||settlementScope.waits.has(model)){lease.dispose();return;}
   const record:SeasonalitySettlementRetry={scope:new WeakRef(settlementScope),model:new WeakRef(model),entry:new WeakRef(entry),id:model.settings.id,ticket:slot.generation,lease,wake,live:true,detached:false,awaiting:false,desired:null};
   settlementScope.waits.set(model,record);settlementScope.records.add(record);
  };

  const primaryControl:OwnedPrimarySourceControl=Object.freeze({async prepare(instanceId:string,input:PrimarySourceRequest){
   assertActive();if(!primaryHost)throw Error('An actual original candle source host is required.');const entry=instances.get(instanceId),model=entry?.model;if(!entry||!model||model.removed||model.recoveryError||!model.settings.visible||!model.ctx||!model.handle)throw Error('The actual owning study is unavailable.');
   const settings=model.settings,kind=settings.kind,generation=model.editGeneration,ctx=model.ctx,handle=model.handle,publication=publicationHost?.captureOwner();let nativeOwner:IndicatorPresentationOwner|null=null;
   const owned=()=>!disposed&&instances.get(instanceId)===entry&&entry.model===model&&!model.removed&&!model.recoveryError&&model.settings===settings&&settings.kind===kind&&model.editGeneration===generation&&model.ctx===ctx&&model.handle===handle&&(!publication||publication.isCurrent());
   const basis=primaryHost.capture();if(!basis||!owned())throw Error('The actual chart source is unavailable.');const request=normalizePrimarySourceRequest(input);if(!owned())throw Error('The owning study changed during source request validation.');basis.assertCurrent();const plan=planPrimarySource(basis,request,settings.kind==='seasonality',calendarEnabled&&settings.kind==='seasonality'&&request.projectionGeometry?SEASONALITY_CALENDAR_AXIS_LIMITS.owners:0),prior=primarySlots.get(model);if(prior)releasePrimary(model,prior);
   const diagnostic=plan.liveDaily?captureSeasonalityDiagnosticTrace(model,basis.context):null;traceSeasonalityDiagnostic(diagnostic,'plan',plan.originalRows,plan.inputRows);
   const slot:PrimarySlot={nativeLookup:null,request:request.signal,cleanupFailed:false,cleanupError:undefined,beginPublication:null,acceptPublication:null,emitting:false,assertCurrent:null,generation:{},controller:new AbortController(),reservation:null,prepared:null,off:null};if(calendarEnabled&&settings.kind==='seasonality'&&request.projectionGeometry){if(!plan.liveDaily)slot.calendarKind=plan.contract.kind;slot.calendarHold={lease:null,pending:false};}primarySlots.set(model,slot);slot.plan=plan;
   const current=()=>{if(primarySlots.get(model)!==slot||slot.controller.signal.aborted||!owned())throw Error('The owning source preparation was replaced.');if(!slot.emitting)nativeOwner?.assertCurrent();if(slot.calendarCohort&&!slot.calendarCohort.lease.isCurrent())throw Error('The accepted Seasonality calendar geometry changed.');};slot.assertCurrent=current;
   const acceptNativeOwner=()=>{current();const lookup=slot.nativeLookup;if(plan.liveDaily&&!lookup)throw Error('The admitted live native registry observation is absent.');nativeOwner=plan.liveDaily?capturePresentationOwnerBounded(instanceId,lookup!):capturePresentationOwner(instanceId);if(!nativeOwner?.nativeIncarnation)throw Error('The actual study pane is not accepted.');current();};
   // Only the closed Seasonality model publisher can advance its own loading emission to its exact descendant.
   slot.beginPublication=()=>{current();basis.assertCurrent();if(slot.emitting)throw Error('Source publication is already in progress.');slot.emitting=true;};
   slot.acceptPublication=()=>{if(!slot.emitting)throw Error('Source publication was not begun.');current();basis.assertCurrent();const lookup=slot.nativeLookup;if(plan.liveDaily&&!lookup)throw Error('The admitted live native registry observation is absent.');nativeOwner=plan.liveDaily?capturePresentationOwnerBounded(instanceId,lookup!):capturePresentationOwner(instanceId);if(!nativeOwner?.nativeIncarnation)throw Error('The completed Seasonality pane is unavailable.');basis.assertCurrent();slot.emitting=false;current();};
   let reservation:ReturnType<typeof scalar.reserveSource>=null;
   try{current();reservation=scalar.reserveSource(model,()=>{try{current();basis.assertCurrent();return true;}catch{return false;}},budget(currentCount()),plan.cost);traceSeasonalityDiagnostic(diagnostic,'reserve',0,0,!!reservation);if(!reservation)throw Error('The original candle source exceeds the current shared study budget.');slot.reservation=reservation;if(plan.liveDaily)slot.preparation=scalar.armSeasonalityPreparation(model,reservation);
    // Capture metadata only after BOTH the source charge and preparation hold exist.
    if(plan.liveDaily){
     current();basis.assertCurrent();const core=inputData(chart,'orchestrator'),registry=inputData(core,'registry'),lookup=captureNativeRegistryLookup(registry);
     if(!lookup)throw Error('The actual live native registry has no bounded method observation.');
     current();basis.assertCurrent();if(inputData(chart,'orchestrator')!==core||inputData(core,'registry')!==registry||primarySlots.get(model)!==slot||slot.reservation!==reservation)throw Error('The admitted live native registry changed during observation.');slot.nativeLookup=lookup;
    }
    const cancel=()=>{try{releasePrimary(model,slot);}catch(error){slot.cleanupFailed=true;slot.cleanupError=error;try{if(owned())incomplete(model,error,publication);}catch{/* A retired cleanup cannot quarantine a replacement. */}}};let offHost=()=>{},offRequest=()=>{},offReservation=()=>{};slot.off=()=>{const failures:unknown[]=[];for(const off of [offHost,offRequest,offReservation])try{off();}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Original source unsubscription failed.');};offReservation=subscribePrimaryAbort(reservation.signal,cancel);offRequest=subscribePrimaryAbort(request.signal,cancel);offHost=primaryHost.subscribeSettled(()=>{try{current();basis.assertCurrent();}catch{cancel();}});if(primarySlots.get(model)!==slot){offHost();throw Error('The source request retired during subscription.');}
    if(plan.liveDaily){
     const preparation=slot.preparation;if(!preparation)throw Error('The required daily preparation hold is absent.');const demand=dailyDemandFor(model,plan.liveDaily.source,current);current();
     const live=beginOwnedLivePrimarySource(primaryHost,basis,request,plan,reservation,current,acceptNativeOwner,demand,preparation,group=>{current();scalar.attachSeasonalityPreparationGroup(model,reservation!,group);observeSeasonalitySettlement(model,slot,reservation!);current();},diagnostic);slot.prepared=live.owned;current();live.start();
     // No await retains this model/ctx/port activation across provider IPC.
     // The actual source owns separate weak-only completion factories.
     return live.ready;
    }
    current();const prepared=await prepareOwnedPrimarySource(primaryHost,basis,request,plan,reservation,current,acceptNativeOwner);current();slot.prepared=prepared;return prepared.view;
   }catch(error){const failures:unknown[]=[error];for(const release of [()=>reservation?.release(),()=>releasePrimary(model,slot)])try{release();}catch(cause){failures.push(cause);}if(slot.cleanupFailed&&!failures.includes(slot.cleanupError))failures.push(slot.cleanupError);if(failures.length>1)throw new AggregateError(failures,'Original source preparation and cleanup failed.');throw error;}
  },dispose(){const failures:unknown[]=[];for(const [model,slot]of [...primarySlots])try{releasePrimary(model,slot);}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Original source disposal was incomplete.');}});
  if(primaryHost)notifications.subscribe(()=>{for(const [model,slot]of [...primarySlots])try{if(!slot.assertCurrent)throw Error('Source owner retired.');slot.assertCurrent();}catch{try{releasePrimary(model,slot);}catch{/* All exact source releases were attempted; optional failure cannot reject an accepted ordinary calculation. */}}});
  if(primaryHost)ownedPrimary.value=primaryControl;
  const pendingPanes=new Map<string,string>();
  const logicalByInstance=new Map<string,string>();
  /** Explicit scale pins (true = own scale column). Absent = the renderer's natural scale for that pane. */
  const scaleFallback=new Map<string,'left'|'none'>()/* Saved left/none kept (and re-serialized) while the renderer lacks that side; the indicator runs on its own pane scale */,fallbackSide=(id:string)=>pinnedScale.get(id)==='own'?scaleFallback.get(id):undefined;
  const pinnedScale=new Map<string,IndicatorScaleSide>()/* Shared, own (right column), left or none */;let portPlacing=0;
  /** The shared extra scale an own or left pin is on (saved as scaleGroup); it counts only beside such a pin. */
  const pinnedGroup=new Map<string,string>(),groupOf=(id:string)=>{const side=pinnedScale.get(id);return side==='own'||side==='left'?pinnedGroup.get(id):undefined;};
  /** The group the renderer is asked for. A renderer that cannot share scales gets none; the saved group is kept and re-serialized. */
  const nativeGroup=(id:string)=>indicatorScaleGroupsSupported(chart)?groupOf(id):undefined,groupHeld=(id:string,nativeId:string)=>!indicatorScaleGroupsSupported(chart)||(readIndicatorScaleGroup(chart,nativeId)??undefined)===groupOf(id);
  const placing=<T,>(action:()=>T):T=>{portPlacing++;try{return action();}finally{portPlacing--;}};
  const volumeOverlay=new Set<string>()/* new Volume instances overlaying the price pane */;
  /** Pins waiting for the renderer to report their indicator again. A redo or restore that adds an indicator hidden, then a
   * Show, re-mounts the native model after setVisible returns (the core starts it asynchronously) with its default scale, so
   * the saved pin (for Volume, the no-scale bottom-band overlay) is applied as soon as the indicator is reported. */
  const pendingPins=new Set<string>(),pinExhausted=new Set<string>();let pinRetryTimer:ReturnType<typeof setTimeout>|null=null,pinRetries=0;
  const retryPins=()=>{if(disposed){pendingPins.clear();return;}for(const id of [...pendingPins]){const model=instances.get(id)?.model,nativeId=model?.handle?.id,want=pinnedScale.get(id);if(!model||model.removed||want===undefined){pendingPins.delete(id);continue;}if(!model.settings.visible||!nativeId)continue;const placed=readIndicatorScalePlacement(chart,nativeId);if(placed===null)continue;const held=placed===want&&groupHeld(id,nativeId);try{applyPinnedScale(id,model);if(!held)changed();}catch{/* the renderer refused the saved pin; it is tried again while the window lasts, then the indicator keeps the renderer's placement (the Pin to scale menu shows it) */}}};
  /** Watches the pending pins for a short window (30 checks, 50 ms apart, restarted by each new request): a re-mount can land after the first check and reset the placement, so a pin stays watched for the whole window, not only until it first reads back. */
  const schedulePinRetry=()=>{pinRetries=0;if(pinRetryTimer!==null||typeof setTimeout!=='function')return;const tick=()=>{pinRetryTimer=null;retryPins();if(++pinRetries>=30||disposed){for(const id of [...pendingPins])if(instances.get(id)?.model.settings.visible){pendingPins.delete(id);/* the window ended without the renderer taking the pin: placement waits stop watching it until the next Show or Pin to scale */pinExhausted.add(id);}return;}if(pendingPins.size)pinRetryTimer=setTimeout(tick,50);};pinRetryTimer=setTimeout(tick,0);};
  const applyPinnedScale=(id:string,model:DomainRenderingIndicator)=>{const want=pinnedScale.get(id),nativeId=model.handle?.id;if(want===undefined||!nativeId)return;/* A hidden (or not yet re-mounted) indicator is not reported by the renderer, so its pin waits: it is applied once the renderer reports the indicator again (retryPins). */if(readIndicatorScalePlacement(chart,nativeId)===null){pendingPins.add(id);schedulePinRetry();return;}if(volumeOverlay.has(id)){try{setIndicatorScaleMargins(chart,nativeId,VOLUME_OVERLAY_MARGINS);}catch{/* a renderer without margins keeps the full-height scale */}}if(volumeOverlay.has(id)){/* default overlay pin is best effort: a host without native scale support keeps the plain overlay */try{if(readIndicatorScalePlacement(chart,nativeId)!==want)placing(()=>setIndicatorScalePlacement(chart,nativeId,want));}catch{/* while a shown indicator is still re-mounting the pin stays and is retried (retryPins) */if(!pendingPins.has(id))pinnedScale.delete(id);}return;}if(readIndicatorScalePlacement(chart,nativeId)===want&&groupHeld(id,nativeId))return;placing(()=>setIndicatorScalePlacement(chart,nativeId,want,nativeGroup(id)));};
  /** Pin to scale > an existing scale: put an indicator on the extra scale another indicator on its pane is drawn on.
   * A target holding its scale alone joins a new group (named by its instance id) first; a refusal of the second write restores it.
   * Both pins are saved. */
  /** An indicator added on another indicator's output (Source = that indicator's plot) on that indicator's own
   * pane is drawn on the parent's scale: the pane scale when the parent is on it, otherwise the parent's extra right or left
   * scale through a scale group (a parent holding its extra scale alone joins a group named by its id first). Without this,
   * the renderer gives the newcomer a second scale column. Runs only when nothing saved names a placement; on any refusal the
   * renderer's own placement stays. */
  const inheritSourceScale=(id:string,settings:IndicatorInstanceSettings,pane:string)=>{
   const ref=parseIndicatorSource(settings.inputs.source);if(!ref||ref.instance===id||logicalByInstance.get(ref.instance)!==pane)return;
   const parent=instances.get(ref.instance)?.model;if(!parent||parent.removed)return;
   const nativeId=parent.handle?.id,side=pinnedScale.get(ref.instance)??(nativeId?readIndicatorScalePlacement(chart,nativeId):null)??'shared';
   if(side==='shared'||side==='none'){pinnedScale.set(id,side);return;}
   if(!nativeId||!indicatorScaleGroupsSupported(chart))return;
   try{
    let group=readIndicatorScaleGroup(chart,nativeId)??pinnedGroup.get(ref.instance);
    if(group===undefined){group=ref.instance;const groupName=group;placing(()=>setIndicatorScalePlacement(chart,nativeId,side,groupName));pinnedScale.set(ref.instance,side);pinnedGroup.set(ref.instance,group);scaleFallback.delete(ref.instance);}
    pinnedScale.set(id,side);pinnedGroup.set(id,group);
   }catch{/* the parent keeps its scale and the newcomer the renderer's placement */}
  };
  const joinScale=(id:string,model:DomainRenderingIndicator,target:string)=>{
   if(target===id)throw new Error('An indicator cannot share its own scale.');
   const other=instances.get(target)?.model;if(!other?.handle||other.removed)throw new Error(`Unknown indicator instance: ${target}`);
   if(!indicatorScaleGroupsSupported(chart))throw new Error(INDICATOR_SCALE_GROUP_GAP);
   const nativeId=model.handle!.id,otherId=other.handle.id,side=readIndicatorScalePlacement(chart,otherId);
   if(side!=='own'&&side!=='left')throw new Error('That indicator has no extra scale to share. Pin it to a new right or left scale first.');
   const pane=readIndicatorPaneId(chart,nativeId);if(pane===null||pane!==readIndicatorPaneId(chart,otherId))throw new Error('Only an indicator on the same pane can share that scale.');
   const existing=readIndicatorScaleGroup(chart,otherId),group=existing??target,prior={placement:pinnedScale.get(target),group:pinnedGroup.get(target)};
   if(existing===null){placing(()=>setIndicatorScalePlacement(chart,otherId,side,group));pinnedScale.set(target,side);pinnedGroup.set(target,group);scaleFallback.delete(target);}
   try{placing(()=>setIndicatorScalePlacement(chart,nativeId,side,group));}
   catch(error){
    if(existing!==null)throw error;
    try{placing(()=>setIndicatorScalePlacement(chart,otherId,side));}catch(rollback){throw new AggregateError([error,rollback],'Scale sharing failed and the other indicator could not be restored. Reopen the chart before continuing.');}
    finally{if(prior.placement===undefined)pinnedScale.delete(target);else pinnedScale.set(target,prior.placement);if(prior.group===undefined)pinnedGroup.delete(target);else pinnedGroup.set(target,prior.group);}
    throw error;
   }
   pinnedScale.set(id,side);pinnedGroup.set(id,group);pinExhausted.delete(id);scaleFallback.delete(id);changed();
  };
  /** Resolve a Source input that names another instance's plot. Hidden or moved sources calculate the same; a missing source is explicitly unavailable, never replaced by a price field. */
  /** An instance with its own timeframe calculates on bars built from the chart's standard bars (raw) and is aligned back; never on the chart bars instead. */
  const evaluateSettings=(settings:IndicatorInstanceSettings,bars:readonly Bar[],stack:ReadonlySet<string>=new Set(),raw?:readonly Bar[]):IndicatorResult=>{
   const timeframe=indicatorTimeframeOf(settings.presentation).interval;
   if(timeframe!==null){const context=presentationContext?.();return evaluateIndicatorOnTimeframe(settings,context?.resolution??null,raw??null,bars,calculationBars,htf=>evaluateChartSettings(settings,htf,stack,undefined,timeframe),undefined,context?.calendar??null);}
   return evaluateChartSettings(settings,bars,stack,raw,presentationContext?.()?.resolution??null);
  };
  interface TimeframeJob {basis:PrimarySourceBasis;settings:IndicatorInstanceSettings;ctx:NativeIndicatorContext;generation:number;reservation:BuiltinSourceReservation|null;publication:BuiltinScenePublication|null;off:(()=>void)|null;live:boolean;pending:boolean;working:boolean;queued:boolean;readCurrent:(()=>void)|null;check:()=>void}
  const timeframeJobs=new Map<DomainRenderingIndicator,TimeframeJob>(),timeframeResults=new WeakSet<object>(),timeframeRefusals=new WeakMap<DomainRenderingIndicator,string>();
  function timeframeCalculation(model:DomainRenderingIndicator):IndicatorTimeframeCalculation|undefined{
   const job=timeframeJobs.get(model);if(timeframeRefusals.has(model))return 'unavailable';if(job?.pending)return 'pending';
   if(job||timeframeResults.has(model.result)){try{if(!job?.readCurrent)throw Error('Timeframe retired.');job.readCurrent();return 'accepted-calendar';}catch{return 'unavailable';}}
   return indicatorTimeframeOf(model.settings.presentation).interval===null?undefined:'legacy';
  }
  function timeframePresentation(model:DomainRenderingIndicator):{policies:string[];diagnostics?:string[];timeframeCalculation?:IndicatorTimeframeCalculation}{
   const mode=timeframeCalculation(model),refusal=timeframeRefusals.get(model);
   if(mode==='pending')return {timeframeCalculation:mode,diagnostics:['Calendar-aware daily values are waiting for their current accepted source.'],policies:['Calendar-aware daily values are waiting for the actual source and native chart to settle; a UTC calculation is not substituted.']};
   if(mode==='unavailable')return {timeframeCalculation:mode,diagnostics:[refusal??'The previous calendar-aware calculation is no longer current.'],policies:refusal?[refusal,'Calendar-aware daily values are unavailable; a UTC calculation is not substituted.']:['The previous calendar-aware calculation is no longer current. Values are unavailable until the source is accepted again.']};
   return {policies:[...model.result.policies],...(mode?{timeframeCalculation:mode}:{})};
  }
  function retireTimeframe(model:DomainRenderingIndicator,expected?:TimeframeJob){
   const job=timeframeJobs.get(model);if(!job||expected&&job!==expected)return;timeframeJobs.delete(model);job.live=false;
   const off=job.off,reservation=job.reservation,publication=job.publication;job.off=null;job.reservation=null;job.publication=null;job.readCurrent=null;
   // The existing renderer cache must not outlive a retiring calendar reservation.
   releaseIndicatorPoints([model.settings.id]);const failures:unknown[]=[];
   for(const release of [()=>off?.(),()=>publication?.retire(),()=>reservation?.release()])try{release();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'Timeframe source cleanup failed.');
  }
  function refuseTimeframe(model:DomainRenderingIndicator,job:TimeframeJob,message:string):{unavailable:string}{
   // Mark refusal before reentrant cleanup. A late A never overwrites B's cleared/replaced marker.
   if(timeframeJobs.get(model)===job)timeframeRefusals.set(model,message);retireTimeframe(model,job);return {unavailable:message};
  }
  /** The own timeframes calculated on the New York regular session (the alert route): 1D, and 1W and 1M built on it. */
  const qualifiedSessionTarget=(interval:string|null):interval is '1D'|'1W'|'1M'=>interval==='1D'||interval==='1W'||interval==='1M';
  function timeframeProducer(model:DomainRenderingIndicator):TimeframeProducer{
   model.timeframeReady=()=>{if(primaryHost&&qualifiedSessionTarget(indicatorTimeframeOf(model.settings.presentation).interval)&&model.handle&&model.ctx&&!model.removed&&model.settings.visible)model.compute();};
   return {retire:()=>retireTimeframe(model),prepare(bars,raw,admitted,assert){
    const settings=model.settings,target=indicatorTimeframeOf(settings.presentation).interval,active=timeframeJobs.get(model);if(active?.working&&active.settings===settings&&active.ctx===model.ctx&&active.generation===model.editGeneration)return 'pending';timeframeRefusals.delete(model);
    if(!primaryHost||!qualifiedSessionTarget(target)||parseIndicatorSource(settings.inputs.source)||settings.kind==='seasonality'||exactVwap(settings)||settings.kind==='vwap'&&isVwapEventAnchor(settings.inputs.anchor)||catalogDefinition(settings.kind)?.profile||catalogDefinition(settings.kind)?.viewport||catalogDefinition(settings.kind)?.finerBars||catalogDefinition(settings.kind)?.dailyHistory||catalogDefinition(settings.kind)?.secondSymbol){retireTimeframe(model);return;}
    assert();const basis=primaryHost.capture();assert();const facts=basis&&closedTimeframeContextFacts(basis.context);
    if(!basis||!facts||!TIMEFRAME_BASIS_STYLES.has(basis.style)||!nyseDailyChartInterval(facts.resolution,'1D')){retireTimeframe(model);return;}
    const prior=timeframeJobs.get(model);let job:TimeframeJob;
    if(prior?.pending&&prior.settings===settings&&prior.ctx===model.ctx&&prior.generation===model.editGeneration&&prior.basis.basis===basis.basis){job=prior;try{job.check();}catch(error){retireTimeframe(model,job);throw error;}}
    else{
     if(prior)retireTimeframe(model,prior);const ctx=model.ctx!,entry=instances.get(settings.id),generation=model.editGeneration,owner=publicationHost?.captureOwner(),inputs=settings.inputs,inputFields=inputDescriptors(inputs,settings.kind),inputKeys=[...new Set([...Object.keys(inputFields),...indicatorInputSchema(settings.kind).map(field=>field.key),...(catalogDefinition(settings.kind)?.retiredInputs??[]).map(field=>field.key)])],plots=settings.plots,presentation=settings.presentation,timeframe=presentation?.timeframe,tfPins=timeframe?[timeframe.schemaVersion,timeframe.interval,timeframe.waitForClose]:null,offset=settings.offset;
     if(inputKeys.length>128)throw Error('The timeframe input declaration is unavailable.');
     job={basis,settings,ctx,generation,reservation:null,publication:null,off:null,live:true,pending:true,working:false,queued:false,readCurrent:null,check:()=>{}};
     const localOwner=()=>{if(!job.live||timeframeJobs.get(model)!==job||disposed||instances.get(settings.id)!==entry||entry?.model!==model||inputData(model,'settings')!==settings||inputData(model,'ctx')!==ctx||inputData(model,'editGeneration')!==generation||inputData(model,'removed')||inputData(settings,'visible')!==true||inputData(settings,'inputs')!==inputs||inputData(settings,'plots')!==plots||inputData(settings,'presentation',true)!==presentation||(presentation?inputData(presentation,'timeframe',true):undefined)!==timeframe||inputData(settings,'offset')!==offset)throw Error('The timeframe calculation owner retired.');for(const key of inputKeys){const actual=Object.getOwnPropertyDescriptor(inputs,key),expected=inputFields[key];if(!expected){if(actual)throw Error('The timeframe effective inputs changed.');continue;}if(!actual||!Object.hasOwn(actual,'value')||!Object.is(actual.value,expected.value)||actual.writable!==expected.writable||actual.configurable!==expected.configurable||actual.enumerable!==expected.enumerable)throw Error('The timeframe effective inputs changed.');}if(timeframe&&tfPins&&!['schemaVersion','interval','waitForClose'].every((key,index)=>Object.is(inputData(timeframe,key),tfPins[index])))throw Error('The timeframe controls changed.');};
     job.check=()=>{localOwner();if(owner&&!owner.isCurrent())throw Error('The timeframe publication owner retired.');localOwner();basis.assertCurrent();localOwner();};
     timeframeJobs.set(model,job);try{job.check();const N=facts.sourceRows,M=facts.rows,P=indicatorActivePlotIds(settings.kind,settings.inputs).length,Q=inputKeys.length;
     // Reserve before any origin/clone/calendar/native traversal or subscription. D <= N.
     const cost={operations:2048*N+65536+128*(2*P+64)*(Q+32),numericSlots:18*N+(4*P+24)*M+8*Q+512,pendingSlots:128};
     const reservation=scalar.reserveSource(model,()=>{try{job.check();return true;}catch{return false;}},admitted,cost);if(!reservation)return refuseTimeframe(model,job,'The current shared study budget cannot admit this calendar-aware daily calculation.');
     job.reservation=reservation;job.publication=scalar.armTimeframePreparation(model,reservation);job.check();}catch(error){try{retireTimeframe(model,job);}catch(cleanup){throw new AggregateError([error,cleanup],'Timeframe setup and cleanup failed.');}throw error;}
    }
    const current=()=>{job.check();job.reservation!.assertCurrent();job.check();};
    job.working=true;try{
     current();const frame=primaryHost.accepted(basis.basis);current();
     if(!frame||!frame.presentationReady()){
      if(!job.off){const off=primaryHost.subscribeSettled(()=>{if(timeframeJobs.get(model)!==job||!job.live||!job.pending||job.queued)return;job.queued=true;queueMicrotask(()=>{job.queued=false;if(timeframeJobs.get(model)!==job||!job.live||!job.pending)return;try{job.check();model.compute();}catch{try{retireTimeframe(model,job);}catch{/* Every exact release was attempted. */}}});});if(timeframeJobs.get(model)!==job||!job.live){off();return 'pending';}job.off=off;}
      job.working=false;return 'pending';
     }
     if(frame.basis!==basis.basis||frame.context!==basis.context||frame.style!==basis.style||frame.execution!==basis.execution||raw!==frame.raw||bars.length!==facts.rows)throw Error('The timeframe frame changed before native acceptance.');
     frame.assertCurrent();current();const observation=captureOriginalClosedTimeframeContext(frame.context,facts.rows,frame.execution);current();if(!observation||!closedTimeframeInputValuesMatch(frame.context,raw,facts.rows))return refuseTimeframe(model,job,'The current source does not have an exact admitted closed-period observation.');
     verifyTimeframeNative(frame,facts.rows,bars);observation.assertCurrent();frame.assertCurrent();current();
     const planned=planNyseDailyTimeframe(raw,facts.resolution,observation);observation.assertCurrent();frame.assertCurrent();current();if(!planned.ok)return refuseTimeframe(model,job,planned.message);
     // A 1W or 1M instance groups the same regular-session daily plan into New York weeks or
     // months, the calculation its alert uses, so an extended-hours chart no longer folds pre/post-market rows into the display.
     let plan=planned.plan;if(target==='1W'||target==='1M'){try{plan=planNysePeriodTimeframe(planned.plan,target);}catch(error){return refuseTimeframe(model,job,error instanceof Error?error.message:String(error));}}
     const result=evaluateIndicatorOnTimeframe(settings,facts.resolution,raw,bars,rows=>calculationBarsForStyle(rows,basis.style),htf=>evaluateDomainIndicator(settings.kind,htf,settings.inputs,{resolution:target,calendar:'us-equity'}),plan);current();observation.assertCurrent();frame.assertCurrent();current();if(!closedTimeframeInputValuesMatch(frame.context,raw,facts.rows))return refuseTimeframe(model,job,'The actual source values changed during calendar preparation.');observation.assertCurrent();frame.assertCurrent();current();
     job.reservation!.accept();job.publication=scalar.pinTimeframeScene(model,result,job.reservation!);timeframeResults.add(result);
     const off=job.off;job.off=null;off?.();current();
     const check=()=>{current();observation.assertCurrent();frame.assertCurrent();current();};check();
     return {result,publication:job.publication,assertCurrent:check,finish(success){job.working=false;if(!success)retireTimeframe(model,job);else{check();if(model.result!==result)throw Error('The accepted timeframe result changed.');const output=model.acceptedOutput;job.readCurrent=()=>{check();if(model.result!==result||model.acceptedOutput!==output)throw Error('The accepted timeframe result was replaced.');job.publication!.assertCurrent();};job.pending=false;scalar.reconcile(admitted);}}};
    }catch(error){try{retireTimeframe(model,job);}catch(cleanup){throw new AggregateError([error,cleanup],'Timeframe calculation and cleanup failed.');}throw error;}
   }};
  }
  /** Each live instance keeps its own incremental calculation session; it goes with the instance. */
  const sessions=new WeakMap<DomainRenderingIndicator,IncrementalIndicatorSession>();
  const sessionOf=(id:string):IncrementalIndicatorSession|undefined=>{const model=instances.get(id)?.model;if(!model||model.removed)return undefined;let session=sessions.get(model);if(!session){session=createIncrementalIndicatorSession({shared:true,sealed:true});sessions.set(model,session);}return session;};
  /** The declared interval of the bars being calculated (the instance timeframe on the INDTF path) and the chart's session calendar. */
  const chartFacts=(resolution:string|null,kind?:IndicatorId,id?:string)=>{const context=presentationContext?.(),definition=kind?catalogDefinition(kind):undefined;return {resolution,calendar:context?.calendar??null,...(definition?.tradingSessions?{tickSize:context?.tickSize??null,exchangeZone:context?.exchangeZone??null,style:context?.style??null}:{}),...(kind==='vwap'?{corporateActions:vwapEventDatesFor(context?.instrument)}:{}),...(definition&&(definition.profile||definition.viewport||definition.finerBars||definition.dailyHistory)?profileFacts(context,resolution,id,definition.profile===true):{})};};
  /** Profile instances whose last calculation is waiting for finer bars on demand. */
  const finerPending=new Set<string>();
  /** The pane's visible range (seconds), the instrument tick size and loaded finer bars, for the profile kinds only. */
  const profileFacts=(context:IndicatorPresentationContext|undefined,resolution:string|null,id?:string,profile=true)=>{if(id!==undefined)finerPending.delete(id);const pending=id!==undefined?()=>{finerPending.add(id);}:undefined,finerBars=profile?profileFinerLookup(context?.datasetId,resolution,pending,undefined,context?.requestSource,context?.profileSource):indicatorHistoryLookup(context?.datasetId,resolution,pending,undefined,context?.requestSource);let visibleRange:{from:number;to:number}|null=null;try{const range=typeof (chart as {getVisibleRange?:unknown}).getVisibleRange==='function'?chart.getVisibleRange():null;if(range&&Number.isFinite(range.from)&&Number.isFinite(range.to))visibleRange={from:range.from/1000,to:range.to/1000};}catch{visibleRange=null;}return {visibleRange,tickSize:context?.tickSize??null,lowerTimeframe:profile&&!context?.requestSource?profileLowerTimeframe(context?.instrument,resolution,undefined,context?.profileSource):null,...(finerBars?{finerBars}:{})};};
  const evaluateChartSettings=(settings:IndicatorInstanceSettings,bars:readonly Bar[],stack:ReadonlySet<string>,raw:readonly Bar[]|undefined,resolution:string|null):IndicatorResult=>{
   const ref=parseIndicatorSource(settings.inputs.source);if(!ref)return evaluateDomainIndicator(settings.kind,bars,settings.inputs,chartFacts(resolution,settings.kind,settings.id),sessionOf(settings.id));
   const unavailable=(message:string):IndicatorResult=>({id:settings.kind,series:[],diagnostics:[message],policies:['A missing or unavailable source indicator is never replaced by a price source.']});
   if(ref.instance===settings.id||stack.has(ref.instance)||stack.size>=INDICATOR_SOURCE_MAX_DEPTH)return unavailable('This indicator source would create a calculation cycle.');
   const target=instances.get(ref.instance)?.model;if(!target||target.removed)return unavailable('The source indicator was removed. Choose another source; no price source was substituted.');
   if(target.recoveryError)return unavailable('The source indicator is unavailable after an incomplete edit.');
   const upstream=evaluateSettings(target.settings,bars,new Set([...stack,settings.id]),raw),plot=upstream.series.find(series=>series.id===ref.plot);
   if(!plot)return unavailable('The source plot is unavailable'+(upstream.diagnostics.length?': '+upstream.diagnostics.join(' '):'.'));
   const result=evaluateDomainIndicator(settings.kind,bars,settings.inputs,{sourceValues:plot.values,...chartFacts(resolution,settings.kind,settings.id)});result.policies.push('Source values are the referenced plot as calculated, without its display offset.');return result;
  };
  /** Dependents recalculate their whole source chain, so the work budget counts each chain member again. */
  const withSourceChains=(records:readonly IndicatorInstanceSettings[]):IndicatorInstanceSettings[]=>{const byId=new Map(records.map(record=>[record.id,record])),out=[...records];for(const record of records){let ref=parseIndicatorSource(record.inputs.source),depth=0;const seen=new Set([record.id]);while(ref&&depth++<INDICATOR_SOURCE_MAX_DEPTH&&!seen.has(ref.instance)){const target=byId.get(ref.instance);if(!target)break;seen.add(target.id);out.push(target);ref=parseIndicatorSource(target.inputs.source);}}return out;};
  const recomputeDependents=(id:string)=>{const rows=[...instances.values()].filter(entry=>!entry.model.removed).map(entry=>entry.model.settings);for(const dependent of indicatorSourceDependents(rows,id)){const model=instances.get(dependent)?.model;if(model&&!model.removed&&model.settings.visible&&model.ctx)model.compute();}};
  const rendererPane=(model:DomainRenderingIndicator)=>model.handle?panes.info(model.handle)?.id??null:null;
  const logicalPane=panes.logical;
  const bindPane=(model:DomainRenderingIndicator,logical:string)=>{if(model.handle)panes.bind(model.handle,logical);};
  const canonical=(value:unknown):string=>JSON.stringify(value,(_key,next)=>next&&typeof next==='object'&&!Array.isArray(next)?Object.fromEntries(Object.entries(next).sort(([a],[b])=>a.localeCompare(b))):next);
  type VwapState={settings:IndicatorInstanceSettings;ctx:NativeIndicatorContext;run?:VwapIndicatorRun;assert:()=>void;done:Promise<void>;resolve:()=>void;reject:(error:unknown)=>void;settled:boolean;error?:unknown};
  const seasonalitySnapshots=new WeakMap<DomainRenderingIndicator,{value:IndicatorResult;result:IndicatorResult;generation:number;job:SeasonalityJob|null}>();
  const seasonalitySnapshot=(result:IndicatorResult):IndicatorResult=>Object.freeze({id:'seasonality',series:result.series.length?result.series:Object.freeze([]),diagnostics:Object.freeze([...result.diagnostics]),policies:Object.freeze([...result.policies])}) as unknown as IndicatorResult;
  const cacheSeasonalitySnapshot=(model:DomainRenderingIndicator)=>seasonalitySnapshots.set(model,{value:seasonalitySnapshot(model.result),result:model.result,generation:model.editGeneration,job:seasonalityJobs.get(model)??null});
  interface SeasonalityAccepted {sourceResult:Readonly<SeasonalityResult>;result:IndicatorResult;reservation:BuiltinSourceReservation;output:NativeIndicatorOutput;precision:IndicatorPrecision}
  interface SeasonalityJob extends SeasonalityContinuation {nativeOrigin:SeasonalityNativeOrigin|null;accepted:SeasonalityAccepted|null;settings:IndicatorInstanceSettings;inputs:object;ctx:NativeIndicatorContext;controller:AbortController;current:()=>void;view:PrimarySourceView|null;publication:BuiltinScenePublication|null;off:(()=>void)|null;consuming:boolean;wake:number;queued:boolean;token:BuiltinNumericDraft|undefined;settled:boolean}
  const seasonalityJobs=new Map<DomainRenderingIndicator,SeasonalityJob>();
  function retireSeasonality(model:DomainRenderingIndicator,expected?:SeasonalityJob){
   const job=seasonalityJobs.get(model);if(!job||expected&&job!==expected)return;traceSeasonalityDiagnostic(seasonalityDiagnosticToken(model),'job-retire');seasonalityJobs.delete(model);seasonalitySnapshots.delete(model);
   const view=job.view,off=job.off,publication=job.publication,nativeOrigin=job.nativeOrigin,token=job.token,slot=primarySlots.get(model);job.view=null;job.off=null;job.publication=null;job.nativeOrigin=null;job.accepted=null;job.token=undefined;job.resume=null;job.failure=null;deferDailyDemand(model);
   const failures:unknown[]=[];for(const release of [()=>scalarHooks.get(model)?.retireAccepted(token),()=>job.controller.abort(),()=>off?.(),()=>nativeOrigin?.dispose(),()=>view?.dispose(),()=>publication?.retire()])try{release();}catch(error){failures.push(error);}if(slot?.request===job.controller.signal&&slot.cleanupFailed&&!failures.includes(slot.cleanupError))failures.push(slot.cleanupError);if(failures.length)throw new AggregateError(failures,'Seasonality source cleanup was incomplete.');
  }
  const seasonalityPlacementRevision=new WeakMap<DomainRenderingIndicator,number>();
  interface SeasonalityPaneMove {current:()=>void;matches:(paneId:string)=>boolean;used:boolean}
  const seasonalityPaneMoves=new WeakMap<DomainRenderingIndicator,SeasonalityPaneMove>();
  const applySeasonalityPin=(id:string,model:DomainRenderingIndicator,owner:()=>void)=>{
   owner();const want=pinnedScale.get(id),group=pinnedGroup.get(id),overlay=volumeOverlay.has(id),nativeId=model.handle?.id;
   const current=()=>{owner();if(pinnedScale.get(id)!==want||pinnedGroup.get(id)!==group||volumeOverlay.has(id)!==overlay)throw new InputEditRetired(Error('Seasonality saved scale intent changed.'));};
   const read=<T,>(action:()=>T):T=>{current();const value=action();current();return value;};
   if(want===undefined||!nativeId)return;
   if(read(()=>readIndicatorScalePlacement(chart,nativeId))===null){current();pendingPins.add(id);schedulePinRetry();current();return;}
   if(overlay){try{read(()=>setIndicatorScaleMargins(chart,nativeId,VOLUME_OVERLAY_MARGINS));}catch{current();}}
   if(overlay){try{if(read(()=>readIndicatorScalePlacement(chart,nativeId))!==want)placing(()=>read(()=>setIndicatorScalePlacement(chart,nativeId,want)));}catch{current();if(!pendingPins.has(id))pinnedScale.delete(id);}return;}
   if(read(()=>readIndicatorScalePlacement(chart,nativeId))===want&&read(()=>groupHeld(id,nativeId)))return;
   const native=read(()=>nativeGroup(id));placing(()=>read(()=>setIndicatorScalePlacement(chart,nativeId,want,native)));
  };
  function acceptSeasonalityPaneMove(model:DomainRenderingIndicator,paneId:string):boolean{
   const move=seasonalityPaneMoves.get(model);if(!move||move.used)return false;
   try{move.current();if(seasonalityPaneMoves.get(model)!==move||!move.matches(paneId))return false;move.used=true;return true;}catch{return false;}
  }
  function notifySeasonalityPane(id:string,model:DomainRenderingIndicator):void{
   const entry=instances.get(id),settings=model.settings,generation=model.editGeneration,ctx=model.ctx,handle=model.handle,logical=logicalByInstance.get(id),revision=seasonalityPlacementRevision.get(model)??0;
   let publication:ReturnType<NonNullable<typeof publicationHost>['captureOwner']>|undefined,nativeCurrent:(()=>void)|undefined;
   const local=()=>{if(disposed||!entry||instances.get(id)!==entry||entry.model!==model||model.removed||settings.kind!=='seasonality'||model.settings!==settings||model.editGeneration!==generation||model.ctx!==ctx||model.handle!==handle||logicalByInstance.get(id)!==logical||(seasonalityPlacementRevision.get(model)??0)!==revision)throw new InputEditRetired(Error('Seasonality pane notification owner changed.'));};
   const current=()=>{local();if(publication&&!publication.isCurrent())throw new InputSourceRetired(Error('Seasonality placement source changed.'));local();nativeCurrent?.();local();if(publication&&!publication.isCurrent())throw new InputSourceRetired(Error('Seasonality placement source retired during native callback.'));local();};
   local();publication=publicationHost?.captureOwner();current();const desired=pendingPanes.get(id);
   if((desired||pendingPins.has(id))&&handle&&ctx&&settings.visible&&Object.getOwnPropertyDescriptor(chart,'orchestrator')){
    // Fixed metadata only: observe own/immediate get without an unbounded
    // prototype walk or a retained lookup object before source admission.
    const core=inputData(chart,'orchestrator'),registry=inputData(core,'registry'),handles=inputData(core,'handles'),renderer=inputData(core,'renderer'),scene=inputData(renderer,'scene'),models=inputData(scene,'indicators'),nativeId=inputData(ctx,'id');
    const method=()=>{const parent=Object.getPrototypeOf(registry),own=Object.getOwnPropertyDescriptor(registry,'get'),owner=own?registry:parent,descriptor=own??(owner&&Object.getOwnPropertyDescriptor(owner,'get'));if(!owner||!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')throw Error('Seasonality native registry method is unavailable.');return{parent,owner,descriptor};};
    const get=method();current();const record=Reflect.apply(get.descriptor.value,registry,[nativeId]);current();const native=inputData(record,'native'),mounted=inputData(record,'model'),renderHandle=inputData(record,'renderHandle');
    const nativeFields=()=>{
     local();const now=method(),a=now.descriptor,b=get.descriptor;
     if(inputData(chart,'orchestrator')!==core||inputData(core,'registry')!==registry||inputData(core,'handles')!==handles||inputData(core,'renderer')!==renderer||inputData(renderer,'scene')!==scene||inputData(scene,'indicators')!==models||now.parent!==get.parent||now.owner!==get.owner||a.value!==b.value||a.writable!==b.writable||a.configurable!==b.configurable||a.enumerable!==b.enumerable)throw Error('Seasonality native placement graph changed.');
     if(!(handles instanceof Map)||Object.getPrototypeOf(handles)!==Map.prototype||!(models instanceof Map)||Object.getPrototypeOf(models)!==Map.prototype||Map.prototype.get.call(handles,nativeId)!==handle||inputData(handle,'id')!==nativeId||inputData(record,'id')!==nativeId||inputData(record,'native')!==native||inputData(native,'instance')!==model||inputData(native,'descriptor')!==entry!.descriptor||inputData(native,'type')!==entry!.type||getNativeIndicator(entry!.type)!==entry!.descriptor)throw Error('Seasonality native placement owner changed.');
     if(inputData(record,'model')!==mounted||inputData(record,'renderHandle')!==renderHandle)throw Error('Seasonality native placement model was replaced.');const hidden=Object.getOwnPropertyDescriptor(record,'hidden');
     if(hidden?(!Object.hasOwn(hidden,'value')||hidden.value!==false):(Object.getPrototypeOf(record)!==Object.prototype||Object.getOwnPropertyDescriptor(Object.prototype,'hidden')!==undefined))throw Error('Seasonality native placement visibility changed.');
     if(inputData(mounted,'id')!==nativeId||inputData(renderHandle,'id')!==nativeId||Map.prototype.get.call(models,nativeId)!==mounted)throw Error('Seasonality native placement is not mounted.');
     const after=method();if(after.parent!==get.parent||after.owner!==get.owner||after.descriptor.value!==get.descriptor.value||after.descriptor.writable!==b.writable||after.descriptor.configurable!==b.configurable||after.descriptor.enumerable!==b.enumerable)throw Error('Seasonality native method changed during callback.');local();
    };
    nativeCurrent=()=>{nativeFields();const actual=Reflect.apply(get.descriptor.value,registry,[nativeId]);local();if(actual!==record)throw Error('Seasonality native placement record was replaced.');nativeFields();};
    current();if(desired){const pane=rendererPane(model);current();
    if(pane){
     if(pendingPanes.get(id)!==desired)throw new InputEditRetired(Error('Seasonality pending pane was replaced.'));
     const bound=panes.bind(handle,desired,undefined,{assertCurrent:current,mutate(action){
      current();const previous=seasonalityPaneMoves.get(model),move:SeasonalityPaneMove={current,matches:paneId=>inputData(inputData(record,'model'),'paneId')===paneId,used:false};seasonalityPaneMoves.set(model,move);
      try{placing(()=>{current();action();current();});}finally{if(seasonalityPaneMoves.get(model)===move){if(previous)seasonalityPaneMoves.set(model,previous);else seasonalityPaneMoves.delete(model);}}
     }});current();
     if(!bound)throw Error('The actual Seasonality native pane could not be bound.');if(pendingPanes.get(id)!==desired)throw new InputEditRetired(Error('Seasonality pending pane changed during binding.'));pendingPanes.delete(id);applySeasonalityPin(id,model,current);current();
    }else throw Error('The actual Seasonality native pane is not mounted.');
    }else{current();applySeasonalityPin(id,model,current);current();}
   }
   current();changed();current();
  }
  function installSeasonality(model:DomainRenderingIndicator){
   if(model.settings.kind!=='seasonality')return;
   model.seasonalityRetire=()=>retireSeasonality(model);
   model.seasonalitySettlementRetire=seasonalitySettlementRetire(new WeakRef(settlementScope),new WeakRef(model));
   if(calendarEnabled)model.seasonalityShow=()=>{
    const operation=publicationHost?.captureOwner();
    const entry=instances.get(model.settings.id),settings=model.settings,handle=model.handle,generation=model.editGeneration,context=model.ctx;
    const localCurrent=()=>!disposed&&instances.get(settings.id)===entry&&entry?.model===model&&!model.removed&&model.settings===settings&&model.handle===handle&&model.editGeneration===generation&&model.ctx===context;
    const current=()=>localCurrent()&&(!operation||operation.isCurrent())&&localCurrent();
    try{if(!current())throw Error('The Seasonality show owner changed.');calendarPreflight({...settings,visible:true});if(!current())throw Error('The Seasonality show owner changed.');}
    catch(error){
     // core.show has already exposed the native row before start/resume. Restore
     // the SAME actual handle, never a replacement, through its genuine API.
     if(!current()||!handle)throw error;let rollback:unknown,failed=false;
     try{const method=inputMethod(handle,'setVisible');if(!current())throw Error('The Seasonality rollback owner changed.');Reflect.apply(method.descriptor.value,handle,[false]);if(!current())throw Error('The Seasonality rollback owner changed.');}catch(cause){rollback=cause;failed=true;}
     if(failed){if(current())incomplete(model,new AggregateError([error,rollback],'Seasonality show conflict and visibility recovery failed.'),operation);throw new AggregateError([error,rollback],'Seasonality show conflict and visibility recovery failed.');}throw error;
    }
   };
   model.seasonalityReady=()=>{if(model.handle&&model.ctx&&!model.removed&&model.settings.visible)model.compute();};
   model.seasonalityCompute=(assert,local,initial)=>{
    if(calendarEnabled)calendarPreflight(model.settings);
    const prior=seasonalityJobs.get(model);if(!settlementScope.waits.get(model)?.awaiting&&prior?.settings===model.settings&&prior.ctx===model.ctx){try{prior.current();if(prior.accepted&&scalar.capture(model).state!=='ready'){const value=prior.accepted;prior.token=scalar.acceptSeasonality(model,prior.settings,value.result,value.sourceResult,value.reservation,value.output,value.precision);prior.current();}return;}catch{retireSeasonality(model,prior);}}
    else if(prior)retireSeasonality(model,prior);
    const settings=model.settings,inputs=settings.inputs,inputFields=inputDescriptors(inputs,settings.kind),plots=settings.plots,presentation=settings.presentation,ctx=model.ctx!,entry=instances.get(settings.id),generation=model.editGeneration,publication=publicationHost?.captureOwner();
    const localOwner=()=>{local();if(disposed||instances.get(settings.id)!==entry||entry?.model!==model||model.settings!==settings||model.ctx!==ctx||model.editGeneration!==generation||model.removed||model.settings.inputs!==inputs||model.settings.plots!==plots||model.settings.presentation!==presentation||publication&&!publication.isCurrent())throw Error('The Seasonality model/source was replaced.');assertInputFields(inputs,inputFields);};
    const loading=(message:string)=>{
     localOwner();const output:NativeIndicatorOutput={series:[],fills:[],priceLines:[]};let emitted=false;
     try{ctx.emit(output);emitted=true;assert();ctx.setStatus('idle');assert();}
     catch(error){if(emitted&&initial&&error instanceof InputSourceRetired){local();initial.acceptEmission();model.initialRetirement=initial;(primaryHost?model.notifySeasonalityChange():changed());return;}throw error;}
     localOwner();model.result={id:'seasonality',series:[],diagnostics:[message],policies:['Seasonality needs privately owned local daily/monthly observations and explicit calendar/completion declarations.']};model.acceptedOutput=output;model.display=[];model.displaySeries=[];model.displayInput=null;model.informationBars=0;model.latestInformationTime=null;model.presentationDiagnostics=[];cacheSeasonalitySnapshot(model);(primaryHost?model.notifySeasonalityChange():changed());localOwner();
    };
    if(!model.handle){loading('Seasonality is waiting for its actual native study pane.');return;}
    if(!primaryHost){loading('Seasonality needs an original local daily/monthly source. Live multi-year history is not yet supported.');return;}

    const retry=settlementScope.waits.get(model);
    if(retry?.live&&retry.awaiting){traceSeasonalityDiagnostic(seasonalityDiagnosticToken(model),'await-settlement');
     let desired:SeasonalitySettlementDesired|null=null;
     try{
      localOwner();const handle=model.handle,mode=primaryHost.sourceMode?primaryHost.sourceMode():primaryHost.capture();localOwner();
      if(!mode)throw Error('The current chart source is unavailable while prior history settles.');
      mode.assertCurrent();localOwner();
      if(!handle||model.handle!==handle||settlementScope.waits.get(model)!==retry||retry.entry.deref()!==entry)throw Error('The pending history replacement was superseded.');
      desired={settings:new WeakRef(settings),ctx:new WeakRef(ctx),handle:new WeakRef(handle),generation,context:new WeakRef(mode.context),execution:mode.execution};retry.desired=desired;
      loading('Seasonality is waiting for the previous history request to settle.');mode.assertCurrent();localOwner();if(model.handle!==handle)throw Error('The pending native study was replaced.');
     }catch(error){
      if(desired&&settlementScope.waits.get(model)===retry&&retry.desired===desired)disposeSeasonalitySettlementRetry(retry);
      loading(error instanceof Error?error.message:'Seasonality cannot retry this retired history request.');
     }
     return;
    }

    const definition=catalogDefinition('seasonality')!,get=(key:string)=>catalogInputValue(definition,settings.inputs,key);
    let request:PrimarySourceRequest;
    try{
     const sourceBasis=primaryHost.capture(),live=sourceBasis&&captureSeasonalityDailyContext(sourceBasis.context,2015,2028,sourceBasis.execution);localOwner();
     if(!sourceBasis&&primaryHost.sourceMode){const mode=primaryHost.sourceMode();if(mode&&seasonalityDailyContextMode(mode.context,mode.execution)){mode.assertCurrent();localOwner();throw Error('The selected chart style has no supported original native frame for live daily-history Seasonality. Use Candles or Heikin Ashi.');}}
     if(live){sourceBasis!.assertCurrent();sourceBasis!.assertSessionCurrent?.();live.assertCurrent();if(sourceBasis!.session!=='regular'&&sourceBasis!.session!=='extended')throw Error('The selected live chart session is unavailable.');}
     const cutoff=live?live.facts.closedThrough:seasonalityCompletionCutoff(get('closedThrough'))!;
     request={calendar:live?'nyse':get('calendar') as PrimarySourceRequest['calendar'],session:live?sourceBasis!.session!:get('session') as PrimarySourceRequest['session'],dateLabels:live?'calendar-midnight':get('dateLabels') as PrimarySourceRequest['dateLabels'],closedThrough:cutoff,startYear:get('startYear') as number,endYear:get('endYear') as number,excludedMonths:get('excludedMonths') as string,includeDevelopingInSummaries:get('includeDevelopingInSummaries') as boolean,meanRow:get('meanRow') as boolean,deviationRow:get('deviationRow') as boolean,positiveFrequencyRow:get('positiveFrequencyRow') as boolean,projectionGeometry:get('projectionGeometry') as boolean,signal:new AbortController().signal};localOwner();
    }
    catch(error){loading(error instanceof Error?error.message:'Seasonality source declarations are unavailable.');return;}
    loading('Seasonality calculation is pending.');localOwner();
    const job:SeasonalityJob={nativeOrigin:null,resume:null,failure:null,accepted:null,settings,inputs,ctx,controller:new AbortController(),view:null,publication:null,off:null,consuming:false,wake:0,queued:false,token:undefined,settled:false,current:()=>{localOwner();if(seasonalityJobs.get(model)!==job||job.controller.signal.aborted)throw Error('Seasonality calculation was retired.');if(job.settled){job.view?.assertCurrent();job.publication?.assertCurrent();job.nativeOrigin?.assertCurrent();}}};seasonalityJobs.set(model,job);request={...request,signal:job.controller.signal};
    const fail=(error:unknown)=>{
     if(seasonalityJobs.get(model)!==job)return;
     let paint=false;try{job.current();paint=true;}catch{}
     try{retireSeasonality(model,job);}catch{/* Every exact cleanup was attempted before any publication. */}
     traceSeasonalityDiagnostic(seasonalityDiagnosticToken(model),'fail-paint',0,0,paint);if(!paint||model.recoveryError||isAnalysisPublicationFailure(error))return;
     try{notifications.transaction(()=>{localOwner();loading(error instanceof Error?error.message.slice(0,1024):'Seasonality is unavailable.');});}catch{/* A retired source or quarantined publication cannot paint its replacement. */}
    };
    const consume=()=>{
     if(job.consuming||job.settled||seasonalityJobs.get(model)!==job)return;
     const wake=job.wake;job.consuming=true;let pending=false,geometryOrigin:SeasonalityNativeOrigin|null=null;
     try{
      job.current();const view=job.view;if(!view)return;const sourceResult=view.read();const retainedSlot=primarySlots.get(model),reservation=retainedSlot?.reservation;if(!reservation)throw Error('The source reservation retired before scene retention.');job.publication=scalar.pinSeasonalityScene(model,sourceResult,reservation);
      if(retainedSlot?.calendarHold){const hold=retainedSlot.calendarHold;job.publication.retainCalendar(()=>!hold.pending&&(hold.lease===null||hold.lease.isDetached()));}
      job.current();if(sourceResult.status!=='ready')throw Error(sourceResult.diagnostic);
      const raw=inputBars?.();job.current();view.assertCurrent();if(!raw)throw Error('The current original source rows are unavailable.');
      const retainedPlan=retainedSlot?.plan,contract=retainedPlan?.liveDaily?retainedPlan.contract:request,result=retainedPlan?.liveDaily?alignConsumedLivePrimarySourceResult(sourceResult,reservation,raw):seasonalityAlignedResult(sourceResult.scene,raw,contract),slot=primarySlots.get(model);if(retainedPlan?.liveDaily)result.policies=['Observed provider daily history with New York day labels and conservative full-day completion; these prices are not relabeled as regular-session-only history.','Requested Starting Year remains saved. Provider history is available from 2015; NYSE calendar calculations after 2028 are unavailable. Sparse or absent returned observations remain explicit.','Historical inspection uses statistics frozen at month opening; current developing observations use the actual received stream and are not archived point-in-time history.'];job.current();if(!slot?.reservation||!slot.beginPublication||!slot.acceptPublication)throw Error('The exact source reservation was retired.');
      let liveCoordinates:Readonly<SeasonalityIntradayBoxCoordinates>|null=null;
      if(retainedPlan?.liveDaily&&request.projectionGeometry){
       const live=retainedPlan.liveDaily,native=consumedPrimaryCalendarFrame(sourceResult,slot.reservation),geometry=consumedPrimaryIntradayGeometry(sourceResult,slot.reservation);
       if(!native?.captureOrigin||!native.installSegments||!geometry||!slot.calendarHold||!model.handle||geometry.times.length!==retainedPlan.inputRows||geometry.firstLoadedTime!==live.firstLoadedTime)throw Error('The actual live source/native geometry is unavailable.');
       geometryOrigin=native.captureOrigin(model,model.handle.id);if(!geometryOrigin||geometryOrigin.indexOffset!==0||geometryOrigin.count!==geometry.times.length||geometryOrigin.firstLoadedTime!==geometry.firstLoadedTime)throw Error('The actual whole-chart index origin is unavailable.');geometryOrigin.assertCurrent();job.current();view.assertCurrent();
       const projections=sourceResult.scene.projections,last=projections[projections.length-1],previous=projections[projections.length-2],right=Math.max(last?.geometry?.right??-Infinity,previous?.geometry?.right??-Infinity),future=right>native.tail?seasonalityIntradayCoordinates({minutes:live.minutes,session:live.session},native.tail,right):null;
       // Both typed arrays are produced HERE and never exposed to a caller.
       // This complete <=373 check precedes the pristine native copy and pure
       // box math. No callback can obtain a mutable alias to these inputs.
       if(future){let time=native.tail*1000,offset=0;if(future.times.length!==future.offsets.length||future.times.length>373)throw Error('The complete future coordinate pairs are unavailable.');for(let index=0;index<future.times.length;index++){const next=future.times[index],distance=future.offsets[index];if(!Number.isSafeInteger(next)||!Number.isSafeInteger(distance)||next<=time||distance<=offset||distance>89280)throw Error('The future coordinate pair changed.');time=next;offset=distance;}
        const hold=slot.calendarHold,pending=hold.pending;hold.pending=true;
        try{job.current();view.assertCurrent();geometryOrigin.assertCurrent();calendarPreflight(settings);const policy=calendarPolicy(settings,liveCalendarPolicy())!;let cohort=calendarCohort;
         if(cohort&&!cohort.lease.isCurrent()){cohort.lease.dispose();if(!cohort.lease.isDetached())throw Error('A prior calendar copy is still retained.');if(calendarCohort===cohort)calendarCohort=null;cohort=null;}
         job.current();view.assertCurrent();geometryOrigin.assertCurrent();job.current();
         if(cohort&&(cohort.frame!==native.frame||cohort.publication!==native.publication||cohort.policy!==policy))throw Error('The accepted intraday calendar conflicts with this source.');
         if(!cohort){const lease=native.installSegments(future.times,future.offsets,hold);cohort={frame:native.frame,publication:native.publication,policy,lease};slot.calendarCohort=cohort;calendarCohort=cohort;}
         hold.lease=cohort.lease;slot.calendarCohort=cohort;job.current();view.assertCurrent();geometryOrigin.assertCurrent();if(!cohort.lease.isCurrent())throw Error('The actual intraday calendar copy retired.');
        }catch(error){try{releaseCalendar(slot);}catch(cleanup){throw new AggregateError([error,cleanup],'Intraday calendar installation and cleanup failed.');}throw error;}finally{hold.pending=pending;}
       }
       liveCoordinates=Object.freeze({loadedTimes:geometry.times,firstObservedTime:geometry.firstObservedTime,firstLoadedTime:geometry.firstLoadedTime,prefixBars:geometry.prefixBars,future});geometryOrigin.assertCurrent();job.current();view.assertCurrent();
      }
      if(slot.calendarKind){
       const native=consumedPrimaryCalendarFrame(sourceResult,slot.reservation);if(!native)throw Error('The original source has no accepted native calendar frame.');
       // Only the final observed month can extend past the native tail. The
       // compiler may also append ONE empty current month at its close boundary.
       const projections=sourceResult.scene.projections,last=projections[projections.length-1],previous=projections[projections.length-2],right=Math.max(last?.geometry?.right??-Infinity,previous?.geometry?.right??-Infinity);
       if(right>native.tail){
        const hold=slot.calendarHold!,pending=hold.pending;hold.pending=true;
        try{
         job.current();calendarPreflight(settings);const policy=calendarPolicy(settings,liveCalendarPolicy())!;let cohort=calendarCohort;
         if(cohort&&!cohort.lease.isCurrent()){cohort.lease.dispose();if(!cohort.lease.isDetached())throw Error('A prior calendar copy is still retained.');if(calendarCohort===cohort)calendarCohort=null;cohort=null;}
         job.current();view.assertCurrent();job.current();
         if(cohort&&(cohort.frame!==native.frame||cohort.publication!==native.publication||cohort.policy!==policy))throw Error('The accepted Seasonality calendar cohort conflicts with this source.');
         if(!cohort){const labels=seasonalityCalendarSpine({calendar:request.calendar,session:request.session,dateLabels:request.dateLabels,kind:slot.calendarKind},native.tail,right);job.current();if(!labels)throw Error('The future calendar has no qualified labels.');const lease=native.install(labels,hold);cohort={frame:native.frame,publication:native.publication,policy,lease};slot.calendarCohort=cohort;calendarCohort=cohort;job.current();if(!lease.isCurrent())throw Error('The new calendar frame was replaced.');}
         hold.lease=cohort.lease;slot.calendarCohort=cohort;job.current();
        }catch(error){try{releaseCalendar(slot);}catch(cleanup){throw new AggregateError([error,cleanup],'Calendar installation and owner cleanup failed.');}throw error;}
        finally{hold.pending=pending;}
       }
      }
      const context=presentationContext?.(settings.id);job.current();geometryOrigin?.assertCurrent();const painted=renderIndicatorPresentation(settings,result,raw,context);job.current();view.assertCurrent();geometryOrigin?.assertCurrent();const boxes=liveCoordinates?seasonalityIntradayBoxes(painted.output.boxes??[],liveCoordinates):painted.output.boxes??[],prepared={...painted,output:{...painted.output,tables:painted.output.tables??[],boxes}};geometryOrigin?.assertCurrent();job.publication!.prepared(result,prepared.output);job.current();view.assertCurrent();
      notifications.transaction(()=>{
       job.current();if(calendarEnabled)calendarPreflight(settings);job.current();if(primarySlots.get(model)!==slot)throw Error('Seasonality source publication was replaced.');slot.beginPublication!();job.current();const scenePublication=job.publication;if(!scenePublication)throw Error('The exact scene publication retired.');
       let attempted=false;
       try{
        scenePublication.enter();attempted=true;geometryOrigin?.assertCurrent();geometryOrigin?.dispose();geometryOrigin=null;let emissionFailure:unknown,emissionFailed=false;try{ctx.emit(prepared.output);}catch(error){emissionFailed=true;emissionFailure=error;}try{scenePublication.returned();}catch(error){if(emissionFailed)throw new AggregateError([emissionFailure,error],'Seasonality native emission and retention cleanup failed.');throw error;}if(emissionFailed)throw emissionFailure;job.current();slot.acceptPublication!();job.current();ctx.setStatus('idle');job.current();scenePublication.accepted();job.current();scenePublication.assertCurrent();
        model.result=result;model.acceptedOutput=prepared.output;model.display=prepared.display;model.displaySeries=prepared.output.series??[];model.displayInput=inputData(inputData(chart,'orchestrator'),'bars');model.displayPrecision=prepared.precision;model.presentationDiagnostics=prepared.diagnostics;model.informationBars=raw.length;model.latestInformationTime=raw.at(-1)?.time??null;
        if(liveCoordinates){const native=consumedPrimaryCalendarFrame(sourceResult,slot.reservation!);if(!native?.captureOrigin||!model.handle)throw Error('The accepted live native origin is unavailable.');const acknowledged=native.captureOrigin(model,model.handle.id);if(!acknowledged)throw Error('The actual accepted live scene has no whole-chart origin.');job.nativeOrigin=acknowledged;acknowledged.assertCurrent();}
        job.token=scalar.acceptSeasonality(model,settings,result,sourceResult,slot.reservation!,prepared.output,prepared.precision);job.current();scenePublication.assertCurrent();job.accepted={sourceResult,result,reservation:slot.reservation!,output:prepared.output,precision:prepared.precision};cacheSeasonalitySnapshot(model);job.settled=true;traceSeasonalityDiagnostic(seasonalityDiagnosticToken(model),'published',raw.length);if(!calendarEnabled){const off=job.off;job.off=null;off?.();}job.current();(primaryHost?model.notifySeasonalityChange():changed());job.current();recomputeDependents(settings.id);job.current();if(retainedPlan?.liveDaily)scalar.retireSeasonalityPreparationWork(model,sourceResult,slot.reservation!);
       }catch(error){if(attempted&&seasonalityJobs.get(model)===job){scalarHooks.get(model)?.retireAccepted(job.token);job.token=undefined;incomplete(model,error,publication);}throw error;}
      });
     }catch(error){if(isPrimarySourcePending(error)){traceSeasonalityDiagnostic(seasonalityDiagnosticToken(model),'consume-pending');pending=true;}else fail(error);}
     finally{
      geometryOrigin?.dispose();geometryOrigin=null;job.consuming=false;
      // One coalesced retry is owed only to an actual settled event delivered during this attempt.
      if(pending&&job.wake!==wake&&!job.queued&&seasonalityJobs.get(model)===job){job.queued=true;queueMicrotask(()=>{job.queued=false;if(seasonalityJobs.get(model)===job)consume();});}
     }
    };
    job.resume=view=>{traceSeasonalityDiagnostic(seasonalityDiagnosticToken(model),'job-resume');
     if(seasonalityJobs.get(model)!==job){view.dispose();return;}job.view=view;
     try{job.current();const off=primaryHost.subscribeSettled(()=>{job.wake++;if(calendarEnabled&&job.settled){try{job.current();return;}catch{if(seasonalityJobs.get(model)!==job||job.queued)return;job.queued=true;queueMicrotask(()=>{job.queued=false;if(seasonalityJobs.get(model)!==job||model.removed||!model.settings.visible)return;try{model.compute();}catch(error){fail(error);}});return;}}consume();});if(seasonalityJobs.get(model)!==job||job.settled&&!calendarEnabled){off();return;}job.off=off;job.current();consume();}catch(error){fail(error);}
    };job.failure=fail;const callbacks=seasonalityCompletion(new WeakRef(job));void primaryControl.prepare(settings.id,request).then(callbacks.fulfilled,callbacks.rejected);
   };
  }
  const removingSeasonality=new WeakSet<DomainRenderingIndicator>();
  function removeSeasonality(id:string,entry:NonNullable<ReturnType<typeof instances.get>>){
   if(removingSeasonality.has(entry.model))return;
   const failures:unknown[]=[],operation=publicationHost?.captureOwner(),current=()=>instances.get(id)===entry&&(!operation||operation.isCurrent())&&instances.get(id)===entry;notifications.transaction(()=>{
    assertActive();if(!current())return;const model=entry.model;
    for(const release of [()=>model.seasonalitySettlementRetire?.(),()=>retireSeasonality(model),()=>scalar.drop(model)]){if(!current())return;try{release();}catch(error){failures.push(error);}if(!current())return;}
    if(!current())return;
    removingSeasonality.add(model);
    try{model.handle?.remove();}catch(error){failures.push(error);}finally{removingSeasonality.delete(model);}
    let detached=false;
    try{const core=inputData(chart,'orchestrator'),records=inputData(inputData(core,'registry'),'records'),handles=inputData(core,'handles'),models=inputData(inputData(inputData(core,'renderer'),'scene'),'indicators'),nativeId=model.handle?.id;detached=typeof nativeId==='string'&&[records,handles,models].every(map=>map instanceof Map&&Object.getPrototypeOf(map)===Map.prototype&&!Map.prototype.has.call(map,nativeId));}catch{/* Unknown native removal is not a completed detach. */}
    if(!detached){const error=new AggregateError(failures.length?failures:[Error('The native Seasonality owner is still present.')],'Seasonality removal was incomplete. Retry Remove or reopen this chart.');model.recoveryError=error;changed();failures.length=0;failures.push(error);return;}
    model.removed=true;const releaseEntry=entry.release;entry.release=undefined;for(const release of [()=>releaseEntry?.(),()=>{if(getNativeIndicator(entry.type)===entry.descriptor)unregisterNativeIndicator(entry.type);}])try{release();}catch(error){failures.push(error);}
    if(instances.get(id)!==entry)return;instances.delete(id);seasonalitySnapshots.delete(model);finerPending.delete(id);releaseIndicatorPoints([id]);pendingPanes.delete(id);logicalByInstance.delete(id);pinnedScale.delete(id);pinnedGroup.delete(id);volumeOverlay.delete(id);pendingPins.delete(id);pinExhausted.delete(id);changed();recomputeDependents(id);
   });
   if(failures.length)throw new AnalysisPublicationError('Indicator cleanup',failures);
  }
  type ScalarVwapTicket={run:VwapIndicatorRun;result:IndicatorResult;bars:readonly Bar[];calculationPrefix:OwnedVwapPrefix;phase:'accepting'|'settled'|'retired';source:()=>void;draft?:BuiltinNumericDraft;acceptedDraft?:BuiltinNumericDraft};
  const vwapStates=new Map<DomainRenderingIndicator,VwapState>();let vwapRevision=0;
  const emptyOutput=():NativeIndicatorOutput=>({series:[],fills:[],priceLines:[]});
  const clearVwapMetadata=(model:DomainRenderingIndicator,message:string)=>{model.result={id:'vwap',series:[],diagnostics:message?[message]:[],policies:[]};model.acceptedOutput=emptyOutput();model.display=[];model.displaySeries=[];model.displayInput=null;model.informationBars=0;model.latestInformationTime=null;model.presentationDiagnostics=[];};
  function retireVwap(model:DomainRenderingIndicator){scalar.drop(model);const state=vwapStates.get(model);if(!state)return;vwapStates.delete(model);vwapRevision++;state.reject(Error('VWAP calculation was replaced.'));state.run?.cancel();}
  function installVwap(model:DomainRenderingIndicator){
   model.vwapRetire=()=>retireVwap(model);
   model.vwapHide=()=>{if(!exactVwap(model.settings))return;retireVwap(model);clearVwapMetadata(model,'');};
   const computeVwap:NonNullable<DomainRenderingIndicator['vwapCompute']>=(assert,local,initial)=>{
    const current=vwapStates.get(model);if(current?.settings===model.settings&&current.ctx===model.ctx){try{current.assert();return;}catch{/* Replaced source cannot borrow the old job. */}}
    retireVwap(model);assert();if(!vwapHost)throw Error('Exact VWAP requires its owned local service.');
    const settings=model.settings,ctx=model.ctx!,inputs=settings.inputs,entry=instances.get(settings.id),generation=model.editGeneration,inputFields=inputDescriptors(inputs,settings.kind);const scalarInputFieldCount=Object.keys(inputFields).length;
    let state!:VwapState,runRetired=false;const localRun=()=>{if(runRetired)throw Error('VWAP calculation incarnation retired.');try{local();if(disposed||instances.get(settings.id)!==entry||entry?.model!==model||model.ctx!==ctx||model.settings!==settings||settings.inputs!==inputs||model.editGeneration!==generation||vwapStates.get(model)!==state)throw Error('VWAP calculation incarnation was replaced.');assertInputFields(inputs,inputFields);}catch(error){runRetired=true;throw error;}};
    let doneResolve!:()=>void,doneReject!:(error:unknown)=>void;const done=new Promise<void>((yes,no)=>{doneResolve=yes;doneReject=no;});void done.catch(()=>{});
    state={settings,ctx,assert:()=>{localRun();assert();localRun();},done,resolve:doneResolve,reject:doneReject,settled:false};vwapStates.set(model,state);vwapRevision++;
    let native:ReturnType<typeof captureVwapNativeOwner>,prefix:OwnedVwapPrefix|undefined,acceptedCalculationPrefix:OwnedVwapPrefix|undefined;
    try{if(!entry?.descriptor)throw Error('VWAP native descriptor is unavailable.');native=captureVwapNativeOwner(chart,model,entry.descriptor,localRun);}
    catch(error){state.error=error;state.reject(error);throw error;}
    const sourceProof=()=>{localRun();assert();localRun();if(prefix){try{prefix.assertCurrent();}catch(error){throw new InputSourceRetired(error);}localRun();}};
    let proofRetired:unknown;
    state.assert=()=>{if(proofRetired)throw proofRetired;try{sourceProof();native.assert();if(acceptedCalculationPrefix){try{acceptedCalculationPrefix.assertCurrent();}catch(error){throw new InputSourceRetired(error);}localRun();}sourceProof();native.local();}catch(error){proofRetired=error;throw error;}};
    const owned=()=>{state.assert();native.assert();state.assert();};
    let operationOwner:ReturnType<NonNullable<typeof publicationHost>['captureOwner']>|undefined;
    function emit(result:IndicatorResult,bars:readonly Bar[],pending=false,onAccepted?:()=>void,requireDeadline=true,presentation?:PreparedVwapPresentation,ticket?:ScalarVwapTicket){
     owned();const context=presentationContext?.();owned();if(ticket){scalar.drop(model);try{ticket.source();const raw=inputBars?.();if(raw)ticket.draft=scalarHooks.get(model)?.prepareVwap(settings,result,raw,bars,native.input,budget(bars.length),ticket.source,context?.style,scalarInputFieldCount);ticket.source();}catch{/* Optional readout refusal never rejects an accepted worker result. */scalarHooks.get(model)?.abort(ticket.draft);ticket.draft=undefined;}}const prepared=pending?{output:emptyOutput(),display:[],precision:settings.presentation?.precision??'auto',diagnostics:[],policies:[]}:presentation?consumeVwapPresentation(presentation,{settings,result,bars,context}):renderIndicatorPresentation(settings,result,bars,context);owned();
     let emitted=false;
     try{if(!pending&&requireDeadline)state.run?.assertBeforeEmission();ctx.emit(prepared.output);emitted=true;localRun();native.accept();onAccepted?.();changed();assert();localRun();}
     catch(error){if(pending&&emitted&&error instanceof InputSourceRetired&&initial){localRun();initial.acceptEmission();model.initialRetirement=initial;changed();state.error=error;state.reject(error);return false;}throw error;}
     owned();ctx.setStatus(pending?'loading':'idle');owned();
     model.result=result;model.acceptedOutput=prepared.output;model.display=prepared.display;model.displaySeries=prepared.output.series??[];model.displayInput=native.input;model.displayPrecision=prepared.precision;model.presentationDiagnostics=prepared.diagnostics;model.informationBars=bars.length;model.latestInformationTime=bars.at(-1)?.time??null;model.result.policies.push(...prepared.policies);changed();owned();return true;
    }
    try{owned();operationOwner=publicationHost?.captureOwner();owned();if(!emit({id:'vwap',series:[],diagnostics:['VWAP calculation is pending.'],policies:[]},[],true))return;}
    catch(error){state.error=error;state.reject(error);throw error;}
    if(!settings.visible){state.settled=true;state.resolve();return;}
    const failedPublication=(error:unknown,ticket?:ScalarVwapTicket)=>{scalarHooks.get(model)?.retireAccepted(ticket?.acceptedDraft);state.error=error;state.reject(error);if(isAnalysisPublicationFailure(error))return;try{owned();incomplete(model,error,operationOwner);}catch{/* A retired incarnation cannot block its replacement. */}};
    function publish(result:IndicatorResult,bars:readonly Bar[],requireDeadline=true,presentation?:PreparedVwapPresentation,ticket?:ScalarVwapTicket){
     let accepted=false,delayed:unknown,publicationComplete=false;
     try{notifications.transaction(()=>{try{owned();emit(result,bars,false,()=>{accepted=true;},requireDeadline,presentation,ticket);owned();if(ticket){ticket.source();ticket.phase='settled';ticket.acceptedDraft=ticket.draft;scalarHooks.get(model)?.accept(ticket.draft,result,model.acceptedOutput,model.displayPrecision);ticket.source();}}catch(error){if(accepted&&error instanceof InputSourceRetired){localRun();native.assert();changed();delayed=error;return;}throw error;}});if(delayed)throw new AnalysisPublicationError('Indicator',[delayed]);publicationComplete=true;}
     catch(error){if(delayed)throw new AggregateError([delayed,error],'Accepted VWAP emission source retired during publication.');throw error;}
     finally{if(ticket){scalarHooks.get(model)?.abort(ticket.draft);ticket.draft=undefined;if(!publicationComplete){ticket.phase='retired';scalarHooks.get(model)?.retireAccepted(ticket.acceptedDraft);}}}
    }
    const failure=(error:unknown)=>{
     try{owned();const message=error instanceof Error?error.message.slice(0,1024):'The local VWAP calculation is unavailable.';
      if(error instanceof VwapRunCleanupError){failedPublication(error);return;}
      publish({id:'vwap',series:[],diagnostics:[message],policies:['Exact VWAP was not replaced by the legacy synchronous kernel.']},[],false);owned();state.settled=true;state.resolve();
     }catch(publication){failedPublication(publication);}
    };
    try{owned();prefix=vwapHost.capture();owned();prefix.assertCurrent();owned();
     // Preparation may permanently retire its handle on invalid private data.
     // Retain a distinct, already captured metadata lease for unavailable output;
     // never acquire a replacement source after a calculation failure.
     const capturedPrefix=vwapHost.capture();owned();capturedPrefix.assertCurrent();owned();
     if(capturedPrefix===prefix||capturedPrefix.rows!==prefix.rows||capturedPrefix.transform!==prefix.transform||capturedPrefix.executionIdentity!==prefix.executionIdentity)throw Error('VWAP calculation requires distinct matching owned source and calculation leases.');
     const calculation=effectiveVwapSettings(inputs,capturedPrefix.transform),check=()=>{owned();capturedPrefix.assertCurrent();owned();};
     const client=vwapHost.client();check();const preparedContext=settings.offset===0?presentationContext?.():undefined;check();
     const run=state.run=startVwapIndicatorRun({prefix:capturedPrefix,client,settings:calculation,token:model,assertCurrent:check,assertCapacity(rows){budget(rows);},...(settings.offset===0?{presentation:{settings,context:preparedContext}}:{})});
     void run.result.then((materialized:MaterializedVwap)=>{
      const ticket:ScalarVwapTicket={run,result:materialized.result,bars:materialized.bars,calculationPrefix:capturedPrefix,phase:'accepting',source:()=>{check();capturedPrefix.assertCurrent();check();if(ticket.phase==='retired'||state.error||state.run!==run||model.vwapCompute!==computeVwap||ticket.run!==run||ticket.calculationPrefix!==capturedPrefix||ticket.result!==materialized.result||ticket.bars!==materialized.bars||materialized.executionIdentity!==capturedPrefix.executionIdentity)throw Error('VWAP scalar job owner retired.');}};
      try{check();publish(materialized.result,materialized.bars,true,materialized.presentation,ticket);check();acceptedCalculationPrefix=capturedPrefix;owned();state.settled=true;state.resolve();}
      catch(error){ticket.phase='retired';failedPublication(error,ticket);}
     },failure);
    }catch(error){failure(error);}
   };model.vwapCompute=computeVwap;
  }
  const list=():IndicatorInstanceView[]=>[...instances.values()].filter(({model})=>!model.removed).map(({model})=>({
    ...structuredClone(model.settings),rendererId:model.handle?.id??'',presentationDiagnostics:[...model.presentationDiagnostics],diagnostics:[...(model.recoveryError?[model.recoveryError.message]:[]),...model.result.diagnostics,...Object.values(model.result.plotDiagnostics??{}).flat(),...model.presentationDiagnostics],...timeframePresentation(model),series:(model.recoveryError?[]:model.result.series).map(plot=>({id:plot.id,label:plot.label})),paneId:chart.panes.list().find(pane=>pane.indicators.some(indicator=>indicator.id===model.handle?.id))?.id??null,informationBars:model.informationBars,latestInformationTime:model.latestInformationTime,
  }));
  /** Read-only legend/readout access. values() keeps returning a detached mutable deep copy (callers may edit it, pinned by
   * seasonality-registered-model.test.ts), but cloning the whole result for every legend row on every hover frame cost about 51 ms per
   * second of hover. peekValues() returns one deeply frozen copy per accepted result, so a hot reader cannot corrupt what the next reader
   * sees. The copy is rebuilt whenever model.result is replaced or its shape (series, value lengths, diagnostics, policies) changes. */
  const peekCache=new WeakMap<object,{shape:string;value:IndicatorResult}>();
  const resultShape=(result:IndicatorResult)=>{let text=result.series.length+'|'+result.diagnostics.length+'|'+result.policies.length;for(const series of result.series)text+='|'+series.values.length;return text;};
  /** A sealed values array (frozen, built by src/domain/indicator-sealed-values.ts) is already an immutable copy, so the
   * frozen legend copy shares it instead of cloning about 4,000 numbers per plot on every live tick. Everything else is cloned. */
  const peekCopy=(result:IndicatorResult):IndicatorResult=>{const series=Array.isArray(result.series)?result.series:null,shared=series?series.map(plot=>plot&&typeof plot==='object'&&isSealedIndicatorValues(plot.values)?plot.values:null):[];if(!series||shared.every(values=>values===null))return deepFreeze(structuredClone(result));
   const copy=structuredClone({...result,series:series.map((plot,index)=>shared[index]?{...plot,values:[]}:plot)});copy.series.forEach((plot,index)=>{const values=shared[index];if(values)plot.values=values as IndicatorResult['series'][number]['values'];});return deepFreeze(copy);};
  const deepFreeze=<T,>(value:T):T=>{if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)&&!Object.isFrozen(value)){for(const key of Object.keys(value))deepFreeze((value as Record<string,unknown>)[key]);Object.freeze(value);}return value;};
  const port={
    invalidateVwap(){vwapRevision++;const failures:unknown[]=[];
     if(calendarEnabled)for(const slot of primarySlots.values()){let current=true;try{slot.assertCurrent?.();}catch{current=false;}if(!current)try{releaseCalendar(slot);}catch(error){failures.push(error);}}for(const {model}of [...instances.values()]){
     if(!exactVwap(model.settings))continue;const entry=instances.get(model.settings.id),settings=model.settings,context=model.ctx,generation=model.editGeneration;
     const local=()=>{if(disposed||instances.get(settings.id)!==entry||entry?.model!==model||model.settings!==settings||model.editGeneration!==generation||model.ctx!==context||model.removed||vwapStates.has(model))throw Error('VWAP invalidation incarnation retired.');};
     try{retireVwap(model);}catch(error){failures.push(error);}
     try{local();notifications.transaction(()=>{local();const owner=publicationHost?.captureOwner();const assert=()=>{local();if(owner&&!owner.isCurrent())throw Error('VWAP invalidation source retired.');local();};assert();if(context){context.emit(emptyOutput());assert();}clearVwapMetadata(model,'VWAP source changed; calculation is awaiting the committed input.');changed();assert();});}catch(error){failures.push(error);}
    }if(failures.length)throw new AggregateError(failures,'VWAP invalidation cleanup was incomplete.');},
    /** True while a shown indicator's saved pin differs from what the renderer reports and is being re-applied (retryPins), so analysis placement (and the historical frame check after it) waits for it; the retry window bounds the wait. */
    pinsPending(){let waiting=false;for(const [id,want] of pinnedScale){const model=instances.get(id)?.model,nativeId=model?.handle?.id;if(!model||model.removed||!model.settings.visible||!nativeId||pendingPanes.has(id)||pinExhausted.has(id))continue;const placed=readIndicatorScalePlacement(chart,nativeId);if(placed===want&&groupHeld(id,nativeId))continue;waiting=true;/* not yet re-applied (a native re-mount reset it): watch it like a Show */if(!pendingPins.has(id)){pendingPins.add(id);schedulePinRetry();}}return waiting&&pinRetryTimer!==null;},
    async waitForVwap(){const revision=vwapRevision,states=[...instances.values()].filter(({model})=>exactVwap(model.settings)&&model.settings.visible).map(({model})=>{const state=vwapStates.get(model);if(!state)throw Error('VWAP has no current accepted calculation.');return state;});await Promise.all(states.map(state=>state.done));if(disposed||revision!==vwapRevision)throw Error('VWAP readiness owner was replaced.');port.assertVwapReady();},
    assertVwapReady(){if(disposed)throw Error('Indicator port is disposed.');for(const {model}of instances.values())if(exactVwap(model.settings)&&model.settings.visible){const state=vwapStates.get(model);if(!state||!state.settled||state.error||model.recoveryError)throw state?.error??model.recoveryError??Error('VWAP calculation is pending or unpublished.');state.assert();}},
    assertCapacity(count:number){return budget(count);},
    beginExternalTransaction:notifications.beginExternalTransaction,
    capturePresentationOwner,
    recomputeInstance(id:string){assertActive();const entry=instances.get(id);if(!entry||entry.model.removed)throw Error('Indicator instance is unavailable.');if(!entry.model.settings.visible)return;return notifications.transaction(()=>{entry.model.compute();return capturePresentationOwner(id);});},
    recompute(){assertActive();return notifications.transaction(()=>{for(const {model} of instances.values())model.compute();});},
    /** True when every live (not removed) instance is one of these kinds on the chart's own timeframe (no
     * presentation timeframe). Cheap: no settings or series copies. */
    kindsWithin(kinds:readonly string[]){for(const {model} of instances.values())if(!model.removed&&(!kinds.includes(model.settings.kind)||model.settings.presentation?.timeframe!==undefined))return false;return true;},
    catalog:DOMAIN_INDICATORS,
    inputSchema:indicatorInputSchema,
    list,
    subscribe:notifications.subscribe,
    add(kind:IndicatorId,inputs:IndicatorInputs={},saved?:Partial<IndicatorInstanceSettings>&{paneId?:string|null;ownScale?:boolean;scalePlacement?:'left'|'none';scaleGroup?:string},options?:{/** Place a new Volume over the bottom band of the price pane. Ignored for other kinds and saved placements. */volumeOverlay?:boolean}){
      return notifications.transaction(()=>{
      assertActive();if(!DOMAIN_INDICATORS.includes(kind))throw new Error(`Unsupported indicator: ${kind}`);
      if(instances.size>=INDICATOR_MAX_INSTANCES)throw new Error('Indicator instance limit reached.');
      validateIndicatorInputs(kind,inputs,true);/* add() receives saved defaults; pre-fix values are stored state */if(saved!==undefined){assertIndicatorRecord(saved);if(Object.keys(saved).some(key=>!['id','kind','inputs','plots','offset','visible','paneId','presentation','ownScale','scalePlacement','scaleGroup'].includes(key))||saved.kind!==undefined&&saved.kind!==kind)throw new Error('Unsupported saved indicator field.');if(saved.ownScale!==undefined&&typeof saved.ownScale!=='boolean')throw new Error('Saved indicator scale placement must be a boolean.');if(saved.scalePlacement!==undefined&&(saved.scalePlacement!=='left'&&saved.scalePlacement!=='none'||saved.ownScale!==true))throw new Error('Saved indicator scale side must be left or none on its own scale.');if(saved.scaleGroup!==undefined&&(typeof saved.scaleGroup!=='string'||!saved.scaleGroup.trim()||saved.scaleGroup.length>200||saved.ownScale!==true||saved.scalePlacement==='none'))throw new Error('Saved indicator scale group must name an own right or left scale.');if(saved.inputs!==undefined)validateIndicatorInputs(kind,saved.inputs,true);if(saved.plots!==undefined)assertIndicatorRecord(saved.plots);}
      // `saved` is stored state (a workspace snapshot or a library default) and keeps the stored bounds above.
      // Explicit inputs are new input: each value the stored base does not hold meets the fact bounds (retired keys are legacy).
      assertIndicatorNewInputs(kind,inputs,[saved?.inputs,saved?indicatorLegacyDefaults[kind]:undefined,defaults[kind]]);
      const id=saved?.id??crypto.randomUUID();if(instances.has(id))throw new Error(`Duplicate indicator instance: ${id}`);
      let settings:IndicatorInstanceSettings={id,kind,inputs:mergeStoredIndicatorInputs(kind,saved?indicatorLegacyDefaults[kind]:defaults[kind],saved?.inputs,inputs),plots:saved?.plots??{},offset:saved?.offset??0,visible:saved?.visible??true,...(saved?Object.hasOwn(saved,'presentation')?{presentation:saved.presentation!}:{}:{presentation:defaultIndicatorPresentation(kind)})};
      validateIndicatorSettings(settings);settings=structuredClone(settings);if(saved?.paneId!==undefined)validateIndicatorSettings({...settings,paneId:saved.paneId},true);
      if(exactVwap(settings)&&!vwapHost)throw Error('Exact VWAP requires its owned local service.');
      if(calendarEnabled)calendarPreflight(settings);
      validateIndicatorSourceGraph([...instances.values()].map(entry=>entry.model.settings).concat(settings),{allowMissing:true});
      budget(currentCount(),[...instances.values()].map(entry=>entry.model.settings).concat(settings));
      const type=`${prefix}:${id}`;const model:DomainRenderingIndicator=new DomainRenderingIndicator(settings,()=>{if(model.settings.kind==='seasonality'&&primaryHost){notifySeasonalityPane(id,model);return;}const desired=pendingPanes.get(id);if(desired&&model.handle&&rendererPane(model)){pendingPanes.delete(id);placing(()=>bindPane(model,desired));applyPinnedScale(id,model);}else if(pendingPins.has(id))retryPins();changed();},calculationBars,count=>budget(count),presentationContext?()=>presentationContext(id):undefined,notifications.transaction,()=>{const owner=publicationHost?.captureOwner();return()=>{const current=owner?.isCurrent()??true;if(disposed||instances.get(id)?.model!==model||model.removed)throw new InputEditRetired(Error('Indicator calculation entry retired'));if(!current)throw new InputSourceRetired(Error('Indicator calculation source retired'));};},(ctx,local)=>{
       const current=()=>{local();if(disposed||instances.get(id)?.model!==model)throw new InputEditRetired(Error('Initial indicator entry retired'));};
       if(model.settings.kind==='seasonality'&&primaryHost){
        current();const mode=primaryHost.sourceMode?primaryHost.sourceMode():primaryHost.capture();current();
        if(mode){const live=mode.execution==='ordinary'&&seasonalityDailyContextMode(mode.context,mode.execution);current();if(live){mode.assertCurrent();current();return undefined;}}
       }
       return captureInitialEmissionOwner(chart,model,instances.get(id)?.descriptor,ctx,()=>{local();if(disposed||instances.get(id)?.model!==model)throw new InputEditRetired(Error('Initial indicator entry retired'));});
      },current=>{const hooks=scalar.hooks(current,()=>{const entry=instances.get(id);return !disposed&&entry?.model===current&&!current.removed&&!current.recoveryError&&current.evaluate===entry.scalarEvaluator&&inputData(current,'calculationBars')===calculationBars;});scalarHooks.set(current,hooks);return hooks;},inputBars,primaryHost?current=>timeframeProducer(current):undefined);instances.set(id,{model,type});model.acceptedDescendant=generation=>{const child=acceptedEdits.get(model);if(!child||child.generation<=generation)return false;try{child.assert();return true;}catch{return false;}};
      installVwap(model);installSeasonality(model);model.evaluate=(current,bars,raw)=>evaluateSettings(current,bars,undefined,raw);instances.get(id)!.scalarEvaluator=model.evaluate;
      const newVolume=kind==='volume'&&options?.volumeOverlay===true&&saved?.paneId===undefined&&saved?.scalePlacement===undefined&&saved?.ownScale===undefined;const pane=saved?.paneId??(overlayKinds.has(kind)||newVolume?'price':`lv-pane-${crypto.randomUUID()}`);pendingPanes.set(id,pane);logicalByInstance.set(id,pane);scaleFallback.delete(id);if(saved?.scalePlacement!==undefined){if(indicatorScaleSides(chart)[saved.scalePlacement])pinnedScale.set(id,saved.scalePlacement);else{pinnedScale.set(id,'own');scaleFallback.set(id,saved.scalePlacement);}}else if(saved?.ownScale!==undefined)pinnedScale.set(id,saved.ownScale?'own':'shared');else if(newVolume){volumeOverlay.add(id);pinnedScale.set(id,indicatorScaleSides(chart).none?'none':'own');}pinnedGroup.delete(id);if(saved?.scaleGroup!==undefined)pinnedGroup.set(id,saved.scaleGroup);if(saved?.ownScale===undefined&&saved?.scalePlacement===undefined&&saved?.scaleGroup===undefined)inheritSourceScale(id,settings,pane);/* a restored Volume on No scale is the bottom-band overlay again (margins, best-effort pin). */if(kind==='volume'&&pinnedScale.get(id)==='none')volumeOverlay.add(id);
      const descriptor:NativeIndicatorDescriptor={type,...(catalogDefinition(kind)?.viewport?{reactsToViewport:true}:{}),title:kind.toUpperCase(),shortTitle:`OpenCandle ${kind.toUpperCase()}`,paneHint:overlayKinds.has(kind)||newVolume?'price':'new',overlay:overlayKinds.has(kind)||newVolume,inputsSchema:()=>indicatorInputSchema(kind),defaultInputs:()=>({...settings.inputs} as Record<string,InputValue>),create:()=>model};
      instances.get(id)!.descriptor=descriptor;
      registerNativeIndicator(descriptor);
      const entry=instances.get(id)!;
      try{entry.release=claimNative?.(descriptor);const handle=chart.addNativeIndicator(type);if(disposed||instances.get(id)!==entry||model.removed)throw new InputEditRetired(Error('Indicator add entry replaced'));if(model.initialRetirement){model.initialRetirement.acceptHandle(handle);model.handle=handle;changed();model.seasonalityReady?.();model.timeframeReady?.();return id;}model.handle=handle;const desired=pendingPanes.get(id);if(desired&&rendererPane(model)){pendingPanes.delete(id);placing(()=>bindPane(model,desired));applyPinnedScale(id,model);}
      // A restored-hidden native instance never starts or emits, so the pending pane binding above has
      // nothing to bind yet; the core's hidden-row mount places it now, and its saved pane binds here.
      if(!settings.visible){model.handle.setVisible(false);/* a pin restored on a hidden indicator waits for its Show (update), so a refusal while hidden does not drop it */if(pinnedScale.has(id))pendingPins.add(id);const hiddenPane=pendingPanes.get(id);if(hiddenPane&&rendererPane(model)){pendingPanes.delete(id);placing(()=>bindPane(model,hiddenPane));/* the core's hidden-row mount reported a move into a fresh pane (indicator:moved) before the bind relabelled it, so the saved logical pane is recorded again; otherwise the next save gives the hidden indicator a new pane and a reload splits a shared pane */logicalByInstance.set(id,hiddenPane);applyPinnedScale(id,model);}}model.seasonalityReady?.();model.timeframeReady?.();changed();recomputeDependents(id);return id;}
      catch(error){if(instances.get(id)===entry&&!disposed){scalar.drop(model);try{model.handle?.remove();}finally{entry.release?.();if(getNativeIndicator(type)===descriptor)unregisterNativeIndicator(type);if(instances.get(id)===entry){instances.delete(id);finerPending.delete(id);pendingPanes.delete(id);logicalByInstance.delete(id);}}}throw error;}
      });
    },
    update(id:string,patch:Partial<Omit<IndicatorInstanceSettings,'id'|'kind'>>){
      const entry=instances.get(id),model=entry?.model;if(!entry||!model||model.removed)throw new Error(`Unknown indicator instance: ${id}`);
      // Validate selected source-calculation drafts before advancing their accepted owner generation.
      const timeframeConsumer=timeframeJobs.has(model)||timeframeRefusals.has(model);
      if(model.settings.kind==='seasonality'||timeframeConsumer){
       assertActive();assertIndicatorRecord(patch);if(Object.keys(patch).some(key=>!['inputs','plots','offset','visible','presentation'].includes(key)))throw Error('Unsupported indicator edit field.');
       for(const field of ['inputs','plots'] as const)if(Object.hasOwn(patch,field))assertIndicatorRecord(patch[field]);
       const candidate={...model.settings,...patch,inputs:patch.inputs?applyIndicatorInputEdit(model.settings.kind,model.settings.inputs,patch.inputs):model.settings.inputs,plots:{...model.settings.plots,...patch.plots}};
       if(timeframeConsumer&&Object.hasOwn(patch,'offset')&&patch.offset!==model.settings.offset)assertIndicatorEditOffset(model.settings.kind,patch.offset);
       validateIndicatorSettings(candidate);if(timeframeConsumer){validateIndicatorSourceGraph([...instances.values()].map(row=>row.model===model?candidate:row.model.settings),{allowMissing:true});if(exactVwap(candidate)&&!vwapHost)throw Error('Exact VWAP requires its owned local service.');}
       if(calendarEnabled)calendarPreflight(candidate);if(canonical(candidate)===canonical(model.settings))return;budget(currentCount(),[...instances.values()].map(row=>row.model===model?candidate:row.model.settings));
      }
      const generation=++model.editGeneration,context=model.ctx,handle=model.handle,inputsBefore=canonical(model.settings.inputs);model.inputObserver=undefined;
      let expected=model.settings,owner:ReturnType<NonNullable<typeof publicationHost>['captureOwner']>|undefined,retired:InputEditRetired|undefined,delayed:{error:unknown}|undefined;
      const assertLocal=()=>{if(retired)throw retired;try{if(disposed||instances.get(id)!==entry||model.removed||model.editGeneration!==generation||model.settings!==expected||inputData(model,'ctx')!==context||inputData(model,'handle')!==handle)throw Error('Indicator update replaced');if(owner&&!owner.isCurrent())throw Error('Indicator source changed');if(disposed||instances.get(id)!==entry||model.removed||model.editGeneration!==generation||model.settings!==expected||inputData(model,'ctx')!==context||inputData(model,'handle')!==handle)throw Error('Indicator update owner changed');}catch(error){retired=new InputEditRetired(error);throw retired;}};
      const hasAcceptedChild=()=>{const child=acceptedEdits.get(model);if(!child||child.generation<=generation)return false;try{child.assert();return true;}catch{return false;}};
      try{notifications.transaction(()=>{
       try{
        assertLocal();assertActive();assertLocal();if(model.recoveryError)throw model.recoveryError;
        owner=publicationHost?.captureOwner();assertLocal();
        assertIndicatorRecord(patch);if(Object.keys(patch).some(key=>!['inputs','plots','offset','visible','presentation'].includes(key)))throw new Error('Unsupported indicator edit field.');
        for(const field of ['inputs','plots'] as const)if(Object.hasOwn(patch,field))assertIndicatorRecord(patch[field]);
        const editedInputs=patch.inputs?applyIndicatorInputEdit(model.settings.kind,model.settings.inputs,patch.inputs):model.settings.inputs;if(Object.hasOwn(patch,'offset')&&patch.offset!==model.settings.offset)assertIndicatorEditOffset(model.settings.kind,patch.offset);// only a changed offset meets the edit bound
        const candidate={...model.settings,...patch,inputs:editedInputs,plots:{...model.settings.plots,...patch.plots}};
        validateIndicatorSettings(candidate);const next=structuredClone(candidate);assertLocal();validateIndicatorSourceGraph([...instances.values()].map(row=>row.model===model?next:row.model.settings),{allowMissing:true});
        if(exactVwap(next)&&!vwapHost)throw Error('Exact VWAP requires its owned local service.');
        if(canonical(next)===canonical(model.settings))return;
        const count=currentCount();assertLocal();budget(count,[...instances.values()].map(row=>row.model===model?next:row.model.settings));assertLocal();
        if(model.ctx&&!exactVwap(next)&&next.kind!=='seasonality'){const input=model.ctx.bars();assertLocal();const primary=inputBars?.();assertLocal();const context=presentationContext?.(id);assertLocal();const raw=computationRaw(input,primary,context?.style);if(raw===null)throw Error('Chart input is still being applied. Retry this study edit when it settles.');const bars=calculationBars(raw);assertLocal();const inputsChanged=canonical(next.inputs)!==canonical(model.settings.inputs)||canonical(indicatorTimeframeOf(next.presentation))!==canonical(indicatorTimeframeOf(model.settings.presentation)),result=inputsChanged?evaluateSettings(next,bars,undefined,raw):model.result;if(inputsChanged&&result.diagnostics.length)throw new Error(result.diagnostics.join('; '));renderIndicatorPresentation(next,result,bars,context);assertLocal();}
        const previous=structuredClone(model.settings),previousResult=model.result,previousCount=model.informationBars,previousTime=model.latestInformationTime,previousPresentation=model.presentationDiagnostics,previousOutput=model.acceptedOutput,previousDisplay=model.display,previousDisplayInput=model.displayInput,previousPrecision=model.displayPrecision,previousSeries=model.displaySeries;
        const inputsChanged=canonical(next.inputs)!==canonical(previous.inputs),recovery=entry.descriptor?captureInputRecovery(chart,model,entry.type,entry.descriptor,previous.inputs,next.inputs,assertLocal):undefined;assertLocal();
        const observe=recovery?.observe;let nativeStarted=false;
        try{
         model.settings=expected=next;model.inputObserver=observe;
         if(inputsChanged){nativeStarted=true;assertLocal();model.handle?.setInputs(next.inputs as Record<string,InputValue>);assertLocal();}
         if(patch.visible!==undefined){model.handle?.setVisible(patch.visible);assertLocal();if(patch.visible){pinExhausted.delete(id);if(pinnedScale.has(id)){pendingPins.add(id);schedulePinRetry();}applyPinnedScale(id,model);assertLocal();}}
         if(model.settings.visible){model.compute();assertLocal();}changed();assertLocal();
         const nativeAccepted=recovery?.accepted();assertLocal();
         const acceptedSettings=model.settings,acceptedResult=model.result,acceptedOutput=model.acceptedOutput,acceptedDisplay=model.display,acceptedSeries=model.displaySeries,acceptedInput=model.displayInput,acceptedPresentation=model.presentationDiagnostics,acceptedPrecision=model.displayPrecision,acceptedCount=model.informationBars,acceptedTime=model.latestInformationTime;
         if(nativeAccepted)acceptedEdits.set(model,{generation,assert(){assertLocal();nativeAccepted?.();assertLocal();if(model.recoveryError||model.settings!==acceptedSettings||model.result!==acceptedResult||model.acceptedOutput!==acceptedOutput||model.display!==acceptedDisplay||model.displaySeries!==acceptedSeries||model.displayInput!==acceptedInput||model.presentationDiagnostics!==acceptedPresentation||model.displayPrecision!==acceptedPrecision||model.informationBars!==acceptedCount||model.latestInformationTime!==acceptedTime)throw Error('Accepted indicator descendant state changed');}});
        }catch(error){
         try{assertLocal();recovery?.assertCurrent();}catch(lost){if(!hasAcceptedChild())incomplete(model,new AggregateError([error,lost],'Indicator edit owner retired with incomplete recovery'),owner);throw new AggregateError([error,lost],'Indicator edit owner retired; no stale recovery was applied.');}
         const failures:unknown[]=[];
         try{
          if(nativeStarted&&recovery)recovery.restore();assertLocal();model.settings=expected=structuredClone(previous);
          if(nativeStarted){model.handle?.setInputs(previous.inputs as Record<string,InputValue>);assertLocal();recovery?.verify();}
          if(patch.visible!==undefined){model.handle?.setVisible(previous.visible);assertLocal();}
          if(previous.visible){model.compute();assertLocal();}model.ctx?.emit(previousOutput);assertLocal();
         }catch(cause){failures.push(cause);}
         if(failures.length){try{assertLocal();}catch(lost){throw new AggregateError([error,...failures,lost],'Indicator edit owner retired during incomplete rollback.');}incomplete(model,new AggregateError([error,...failures]),owner);throw model.recoveryError;}
         assertLocal();model.settings=expected=previous;model.result=previousResult;model.informationBars=previousCount;model.latestInformationTime=previousTime;model.presentationDiagnostics=previousPresentation;model.acceptedOutput=previousOutput;model.display=previousDisplay;model.displaySeries=previousSeries;model.displayInput=previousDisplayInput;model.displayPrecision=previousPrecision;throw error;
        }finally{if(model.inputObserver===observe)model.inputObserver=undefined;}
       }catch(error){if(hasAcceptedChild()){delayed={error};return;}throw error;}
      });}catch(error){if(delayed)throw new AggregateError([delayed.error,error],'Earlier indicator edit retired and accepted descendant publication failed.');throw error;}
      if(delayed)throw delayed.error;
      if(canonical(model.settings.inputs)!==inputsBefore)recomputeDependents(id);
    },
    move(id:string,target:MoveTarget){return notifications.transaction(()=>{assertActive();const model=instances.get(id)?.model;if(!model?.handle)throw new Error(`Unknown indicator instance: ${id}`);const pending=model.settings.kind==='seasonality'?{entry:instances.get(id),settings:model.settings,generation:model.editGeneration,ctx:model.ctx,handle:model.handle,value:pendingPanes.get(id)}:null;if(pending)seasonalityPlacementRevision.set(model,(seasonalityPlacementRevision.get(model)??0)+1);const before=logicalByInstance.get(id)??logicalPane(rendererPane(model));if(!before)throw new Error('Indicator pane is unavailable.');try{const handle=model.handle;placing(()=>{if(typeof target==='object'&&'pane' in target){handle.moveTo({pane:panes.renderer(target.pane)??target.pane});}else handle.moveTo(target);});const logical=logicalPane(rendererPane(model));if(!logical)throw new Error('Native indicator move did not retain a pane.');logicalByInstance.set(id,logical);if(pending&&instances.get(id)===pending.entry&&pending.entry?.model===model&&!model.removed&&model.settings===pending.settings&&model.editGeneration===pending.generation&&model.ctx===pending.ctx&&model.handle===pending.handle&&pendingPanes.get(id)===pending.value)pendingPanes.delete(id);
 // Vela's moveIndicator is a no-op when the indicator is already on the target pane, so a pin the renderer still reports stands; any other move returns the indicator to its natural scale.
 const kept=pinnedScale.get(id),wasOverlay=volumeOverlay.has(id);if(!(logical===before&&kept!==undefined&&readIndicatorScalePlacement(chart,handle.id)===kept&&groupHeld(id,handle.id))){pinnedScale.delete(id);pinnedGroup.delete(id);volumeOverlay.delete(id);scaleFallback.delete(id);}
 // Move rule: a Volume moved into the price pane is the bottom-band overlay a new
 // Volume gets; one moved out of it drops the band so it fills its new pane.
 if(model.settings.kind==='volume'&&logical!==before){if(logical==='price'){volumeOverlay.add(id);pinnedGroup.delete(id);pinnedScale.set(id,indicatorScaleSides(chart).none?'none':'own');applyPinnedScale(id,model);}else if(wasOverlay){try{setIndicatorScaleMargins(chart,handle.id,{top:0,bottom:0});}catch{/* a renderer without margins never had the band */}}}
 changed();}catch(error){try{placing(()=>bindPane(model,before));logicalByInstance.set(id,before);applyPinnedScale(id,model);}catch(rollback){throw new AggregateError([error,rollback],'Indicator move failed and native rollback was incomplete. Reopen this chart before continuing.');}throw error;}});},
    /** Plots of other instances this instance may use as its Source (excludes itself and its own dependents). */
    sourceChoices(id:string):{value:string;instanceId:string;kind:IndicatorId;plot:string;label:string}[]{const model=instances.get(id)?.model;if(!model)throw new Error(`Unknown indicator instance: ${id}`);if(!INDICATOR_SOURCE_KINDS.includes(model.settings.kind))return [];const rows=[...instances.values()].filter(entry=>!entry.model.removed).map(entry=>entry.model.settings),blocked=new Set([id,...indicatorSourceDependents(rows,id)]);return rows.filter(row=>!blocked.has(row.id)&&!exactVwap(row)).flatMap(row=>indicatorActivePlotIds(row.kind,row.inputs).map(plot=>({value:encodeIndicatorSource(row.id,plot),instanceId:row.id,kind:row.kind,plot,label:instances.get(row.id)?.model.result.series.find(series=>series.id===plot)?.label??plot})));},
    /** Scale placement as reported by the renderer; supported=false when the renderer cannot pin it. */
    /** Placement is the renderer-reported side; gaps lists only the sides this renderer cannot draw. */
    scale(id:string):{ownScale:boolean|null;placement:IndicatorScaleSide|null;pinned:boolean;supported:boolean;gaps:Partial<typeof INDICATOR_SCALE_GAPS>;fallback?:'left'|'none';group?:string}{const model=instances.get(id)?.model;if(!model)throw new Error(`Unknown indicator instance: ${id}`);const nativeId=model.handle?.id,sides=indicatorScaleSides(chart),gaps:Partial<typeof INDICATOR_SCALE_GAPS>={...(sides.left?{}:{left:INDICATOR_SCALE_GAPS.left}),...(sides.none?{}:{none:INDICATOR_SCALE_GAPS.none})};return {ownScale:nativeId?readIndicatorOwnScale(chart,nativeId):null,placement:nativeId?readIndicatorScalePlacement(chart,nativeId):null,pinned:pinnedScale.has(id),...(fallbackSide(id)?{fallback:fallbackSide(id)}:{}),...(nativeId&&readIndicatorScaleGroup(chart,nativeId)!==null?{group:readIndicatorScaleGroup(chart,nativeId)!}:{}),supported:!!nativeId&&indicatorNativeScaleSupported(chart,nativeId),gaps};},
    /** The existing extra scales on this indicator's pane it can share (Pin to scale submenu), in pane order. */
    scaleChoices(id:string,titleOf?:(id:string)=>string):IndicatorScaleChoice[]{const nativeId=instances.get(id)?.model.handle?.id;if(!nativeId)return [];const rows:{id:string;rendererId:string}[]=[];for(const [key,entry] of instances){const rendererId=entry.model.handle?.id;if(rendererId&&!entry.model.removed)rows.push({id:key,rendererId});}return indicatorScaleChoices(chart,nativeId,rows,titleOf);},
    /** Pin to the pane's shared scale, a new right column, a new left scale, no scale, or the existing extra scale
     *  of another indicator on the pane ({scaleOf}); persisted until the next pane move. */
    setScale(id:string,placement:IndicatorScaleSide|{scaleOf:string}){return notifications.transaction(()=>{assertActive();const model=instances.get(id)?.model;if(!model?.handle)throw new Error(`Unknown indicator instance: ${id}`);if(typeof placement==='object'&&placement!==null){if(model.recoveryError)throw model.recoveryError;joinScale(id,model,String((placement as {scaleOf?:unknown}).scaleOf));return;}if(placement!=='shared'&&placement!=='own'&&placement!=='left'&&placement!=='none')throw new Error('Scale placement must be shared, own, left or none.');if(model.recoveryError)throw model.recoveryError;const nativeId=model.handle.id;placing(()=>setIndicatorScalePlacement(chart,nativeId,placement));pinnedScale.set(id,placement);pinnedGroup.delete(id);pinExhausted.delete(id);scaleFallback.delete(id);changed();});},
    /** Chart settings > Scales placement, Stack on the left / Stack on the right: moves every extra indicator
     *  scale (a right column or a left scale) on every pane to that side. Members of a shared scale keep their group, so they share
     *  one scale on the new side too; a hidden one moves when it shows again. Shared-scale and no-scale indicators stay. Returns
     *  how many indicators moved; all are saved. */
    stackScales(side:'left'|'right'){return notifications.transaction(()=>{assertActive();const want=side==='left'?'left' as const:'own' as const;
      if(side!=='left'&&side!=='right')throw new Error('Scales stack on the left or on the right.');
      let moved=0;
      for(const [id,entry] of instances){const model=entry.model;if(!model.handle||model.removed||model.recoveryError)continue;const nativeId=model.handle.id,current=readIndicatorScalePlacement(chart,nativeId);
        // A hidden (not reported) indicator keeps its pin waiting, as applyPinnedScale does: the new side applies once it shows.
        if(current===null){const pinned=pinnedScale.get(id);if((pinned==='own'||pinned==='left')&&pinned!==want){pinnedScale.set(id,want);pinExhausted.delete(id);scaleFallback.delete(id);applyPinnedScale(id,model);moved++;}continue;}
        if(current!=='own'&&current!=='left'||current===want)continue;
        const group=readIndicatorScaleGroup(chart,nativeId)??undefined;
        placing(()=>setIndicatorScalePlacement(chart,nativeId,want,group));pinnedScale.set(id,want);if(group!==undefined)pinnedGroup.set(id,group);else pinnedGroup.delete(id);pinExhausted.delete(id);scaleFallback.delete(id);moved++;}
      if(moved)changed();return moved;});},
    remove(id:string){const owned=instances.get(id);if(owned?.model.settings.kind==='seasonality'&&primaryHost)return removeSeasonality(id,owned);return notifications.transaction(()=>{const entry=instances.get(id);if(!entry)return;retireTimeframe(entry.model);scalar.drop(entry.model);try{entry.model.handle?.remove();}finally{entry.release?.();unregisterNativeIndicator(entry.type);}instances.delete(id);finerPending.delete(id);releaseIndicatorPoints([id]);pendingPanes.delete(id);logicalByInstance.delete(id);pinnedScale.delete(id);pinnedGroup.delete(id);volumeOverlay.delete(id);pendingPins.delete(id);pinExhausted.delete(id);changed();recomputeDependents(id);});},
    captureReadout(id:string):BuiltinReadoutSnapshot{return scalar.capture(instances.get(id)?.model??null);},
    values(id:string){const model=instances.get(id)?.model;if(!model)throw new Error(`Unknown indicator instance: ${id}`);const timeframe=timeframeCalculation(model);if(timeframe==='pending'||timeframe==='unavailable')return{id:model.settings.kind,series:[],diagnostics:['Calendar-aware timeframe values are waiting for their current accepted source.'],policies:timeframePresentation(model).policies};if(model.settings.kind==='seasonality'){if(model.recoveryError)return seasonalitySnapshot({id:'seasonality',series:[],diagnostics:[model.recoveryError.message],policies:[]});try{const job=seasonalityJobs.get(model),cached=seasonalitySnapshots.get(model);if(cached?.value.series.length){const exact=()=>seasonalitySnapshots.get(model)===cached&&seasonalityJobs.get(model)===job&&!!job?.settled&&cached.job===job&&cached.result===model.result&&job.accepted?.result===cached.result&&cached.generation===model.editGeneration;if(!exact())throw Error('The current Seasonality calculation is unavailable.');job!.current();if(!exact())throw Error('The Seasonality calculation changed during inspection.');}return cached?.value??seasonalitySnapshot({id:'seasonality',series:[],diagnostics:['Seasonality is waiting for its original source.'],policies:[]});}catch{return seasonalitySnapshot({id:'seasonality',series:[],diagnostics:['The accepted Seasonality calculation is no longer current.'],policies:[]});}}return model.recoveryError?{id:model.settings.kind,series:[],diagnostics:[model.recoveryError.message],policies:[]}:structuredClone(model.result);},
    /** The same value as values(id), deeply frozen and shared between calls while the accepted result is unchanged. Read only. */
    peekValues(id:string):IndicatorResult{const model=instances.get(id)?.model;if(!model)throw new Error(`Unknown indicator instance: ${id}`);if(model.settings.kind==='seasonality'||model.recoveryError)return port.values(id);const timeframe=timeframeCalculation(model);if(timeframe==='pending'||timeframe==='unavailable')return port.values(id);const result=model.result;if(!result||typeof result!=='object')return port.values(id);const shape=resultShape(result),hit=peekCache.get(result);if(hit&&hit.shape===shape)return hit.value;const value=peekCopy(result);peekCache.set(result,{shape,value});return value;},
    serialize():IndicatorSnapshot[]{return list().map(({rendererId,diagnostics,policies,series,paneId,informationBars,latestInformationTime,presentationDiagnostics,timeframeCalculation,...settings})=>({...settings,paneId:logicalByInstance.get(settings.id)??logicalPane(paneId),...(pinnedScale.has(settings.id)?{ownScale:pinnedScale.get(settings.id)!=='shared'}:{}),...(fallbackSide(settings.id)?{scalePlacement:fallbackSide(settings.id)!}:pinnedScale.get(settings.id)==='left'||pinnedScale.get(settings.id)==='none'?{scalePlacement:pinnedScale.get(settings.id) as 'left'|'none'}:{}),...(groupOf(settings.id)!==undefined?{scaleGroup:groupOf(settings.id)!}:{})}));},
    restore(snapshot:readonly IndicatorSnapshot[]){
      assertActive();validateIndicatorSnapshots(snapshot);
      if(calendarEnabled){let policy:number|null=null;const live=liveCalendarPolicy();for(const record of snapshot){const next=calendarPolicy(record,live);if(next!==null){if(policy!==null&&policy!==next)throw Error('The saved visible Seasonality projections request conflicting calendar policies.');policy=next;}}}
      budget(currentCount(),snapshot);
      const previous=port.serialize();if(canonical(previous)===canonical(snapshot))return {changed:false};
      const apply=(records:readonly IndicatorSnapshot[])=>{for(const id of [...instances.keys()])port.remove(id);for(const saved of records)port.add(saved.kind,{},saved);};
      return notifications.transaction(()=>{batchDepth++;try{apply(snapshot);}catch(error){try{apply(previous);}catch(rollback){throw new AggregateError([error,rollback],'Indicator restoration failed and native rollback was incomplete. Reopen this chart before continuing.');}throw error;}finally{batchDepth--;changed();}
      const fallen=[...instances.keys()].map(fallbackSide).filter((side):side is 'left'|'none'=>!!side);
      return fallen.length?{changed:true,notices:[fallen.length+(fallen.length===1?' indicator uses its own pane scale instead of the saved ':' indicators use their own pane scale instead of the saved ')+[...new Set(fallen)].map(side=>side==='left'?'left scale':'no scale').join(' or ')+' placement. '+INDICATOR_SCALE_GAPS[fallen[0]]]}:{changed:true};
      });
    },
    dispose(){if(disposed)return;disposed=true;settlementScope.live=false;const failures:unknown[]=[],attempt=(release:()=>void)=>{try{release();}catch(error){failures.push(error);}};for(const record of [...settlementScope.records])attempt(()=>disposeSeasonalitySettlementRetry(record));for(const model of [...timeframeJobs.keys()])attempt(()=>retireTimeframe(model));for(const model of [...seasonalityJobs.keys()])attempt(()=>retireSeasonality(model));for(const [model,owner]of [...seasonalityDemands]){seasonalityDemands.delete(model);attempt(()=>releaseSeasonalityDemandOwner(owner));}attempt(()=>primaryControl.dispose());attempt(()=>scalar.dispose());finerPending.clear();pendingPins.clear();pinExhausted.clear();if(pinRetryTimer!==null){clearTimeout(pinRetryTimer);pinRetryTimer=null;}notifications.dispose();attempt(releaseDisplay);pendingPanes.clear();logicalByInstance.clear();pinnedScale.clear();pinnedGroup.clear();for(const off of nativeUnsubscribes)try{off();}catch(error){failures.push(error);}for(const {model,type,release}of instances.values()){model.removed=true;try{model.handle?.remove();}catch(error){failures.push(error);}try{release?.();unregisterNativeIndicator(type);}catch(error){failures.push(error);}model.ctx=null;}releaseIndicatorPoints([...instances.keys()]);instances.clear();if(failures.length)throw new AggregateError(failures,'Indicator disposal was incomplete.');},
  };
  const nativeUnsubscribes:Array<()=>void>=[];
  try{if(typeof chart.on==='function'){
   // Only a removal of an instance this port owns opens a publication. A foreign id (a
   // comparison, or another port's model removed while a retired chart disposes) is not this port's change; the owned-id
   // path keeps every assertMutable/owner check.
   nativeUnsubscribes.push(chart.on('indicator:removed',({id})=>{if(![...instances.values()].some(entry=>entry.model.handle?.id===id))return;notifications.transaction(()=>{for(const [key,entry]of instances)if(entry.model.handle?.id===id){if(removingSeasonality.has(entry.model))continue;try{entry.model.seasonalitySettlementRetire?.();}finally{retireTimeframe(entry.model);scalar.drop(entry.model);entry.model.removed=true;instances.delete(key);finerPending.delete(key);releaseIndicatorPoints([key]);pendingPanes.delete(key);logicalByInstance.delete(key);pinnedScale.delete(key);entry.release?.();unregisterNativeIndicator(entry.type);changed();recomputeDependents(key);}}});}));
   nativeUnsubscribes.push(chart.on('indicator:moved',({id,paneId})=>notifications.transaction(()=>{for(const [key,entry]of instances)if(entry.model.handle?.id===id){const ownedMove=entry.model.settings.kind==='seasonality'&&portPlacing>0&&acceptSeasonalityPaneMove(entry.model,paneId);if(!ownedMove){if(entry.model.settings.kind==='seasonality')seasonalityPlacementRevision.set(entry.model,(seasonalityPlacementRevision.get(entry.model)??0)+1);const logical=logicalPane(paneId);if(logical)logicalByInstance.set(key,logical);}if(!portPlacing)pinnedScale.delete(key);entry.model.renewScalarPresentation();changed();}})));
  }}catch(error){const failures:unknown[]=[];for(const off of nativeUnsubscribes)try{off();}catch(cause){failures.push(cause);}disposed=true;if(failures.length)throw new AggregateError([error,...failures],'Indicator listener acquisition and cleanup failed.');throw error;}
  // A second symbol arriving or updating recalculates the two-symbol indicators (and their dependents) that read it.
  nativeUnsubscribes.push(subscribeSecondSymbols(()=>{if(disposed)return;for(const {model} of [...instances.values()]){if(model.removed||!model.ctx||!model.settings.visible||model.recoveryError||!catalogDefinition(model.settings.kind)?.secondSymbol)continue;try{model.compute();recomputeDependents(model.settings.id);}catch{/* the next update tries again; the last diagnostic stays */}}}));
  // A new loaded-source publication retires private primary proofs and refreshes current profile owners, including late same-source history.
  nativeUnsubscribes.push(subscribeProfileDatasets(()=>{if(disposed)return;for(const {model} of [...instances.values()]){if(model.removed||!model.ctx||!model.settings.visible||model.recoveryError||!catalogDefinition(model.settings.kind)?.profile)continue;try{model.compute();recomputeDependents(model.settings.id);}catch{/* Existing source/publication guards retire an obsolete calculation. */}}}));
  // Pending profile retries are kept. Data studies also recalculate when ready history is corrected or
  // replaced, so chart bars need not change before their values and source dependents refresh.
  nativeUnsubscribes.push(subscribeScriptRequestResolver(()=>{if(disposed)return;for(const {model} of [...instances.values()]){const definition=catalogDefinition(model.settings.kind),dataStudy=definition?.finerBars||definition?.dailyHistory;if(!finerPending.has(model.settings.id)&&!dataStudy||model.removed||!model.ctx||!model.settings.visible||model.recoveryError)continue;try{model.compute();recomputeDependents(model.settings.id);}catch{/* the next update tries again; the last diagnostic stays */}}}));
  releaseDisplay=registerIndicatorDisplayPort(port,chart,()=>{assertActive();return [...instances.values()].filter(({model,descriptor})=>!model.removed&&!model.recoveryError&&model.settings.visible&&!!model.handle&&!!descriptor).map(({model,type,descriptor})=>({id:model.settings.id,rendererId:model.handle!.id,type,descriptor:descriptor!,instance:model,input:model.displayInput,series:model.displaySeries,plots:model.display,precision:model.displayPrecision,valueSuffix:indicatorValueSuffix(model.settings.kind)}));});
  liveDailyPortModes.set(port,id=>{
   if(disposed||!primaryHost)return false;const target=id===undefined?null:instances.get(id);if(id!==undefined&&(!target||target.model.removed||target.model.settings.kind!=='seasonality'))return false;
   const mode=primaryHost.sourceMode?primaryHost.sourceMode():primaryHost.capture();if(!mode||!seasonalityDailyContextMode(mode.context,mode.execution))return false;mode.assertCurrent();return !disposed&&(id===undefined||instances.get(id)===target&&target!.model.settings.kind==='seasonality'&&!target!.model.removed);
  });
  const exposed:Omit<typeof port,'captureReadout'>&{captureReadout?:(id:string)=>BuiltinReadoutSnapshot}=port;return exposed;
 });
 return {port:built,primary:ownedPrimary.value};
}
