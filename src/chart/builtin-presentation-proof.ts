import {releaseAlpacaSeasonalityPreparationGroup,alpacaSeasonalityPreparationSettled,alpacaSeasonalityPreparationGroupKnown,subscribeAlpacaSeasonalityPreparationSettled,type AlpacaSeasonalityPreparationGroup} from '../domain/alpaca-live';
import {consumedPrimarySourceWorkComponents,consumedPrimarySourceResultBelongs,consumedPrimarySourceResultMatches} from './seasonality-source';
import {seasonalityAlignedResultMatches,seasonalityAlignedTimes} from './seasonality-presentation';
import type {SeasonalityResult} from '../domain/indicators-ext/seasonality-types';
import {getNativeIndicator} from '@luxalgo/vela';
import type {Bar} from '../domain/types';
import type {IndicatorResult,IndicatorSeries} from '../domain/indicators';
import {catalogDefinition} from '../domain/indicator-catalog';
import {isVwapEventAnchor} from '../domain/vwap-event-anchors';
import {parseIndicatorSource} from '../domain/indicator-source';
import {isSealedIndicatorValues} from '../domain/indicator-sealed-values';
import {isDerivedStyle} from './derived/common';
import {INDICATOR_OUTPUT_LIMIT,INDICATOR_BATCH_OUTPUT_LIMIT,INDICATOR_BATCH_WORK_LIMIT,indicatorDefaults,indicatorPlotIds,type IndicatorInstanceSettings} from './indicator-settings';
import {defaultPlotStyle} from './indicator-rendering';
import type {IndicatorPrecision} from './indicator-number-format';
import type {AnalysisPublicationHost,AnalysisPublicationOwner} from './analysis-publication';

export interface BuiltinReadoutValue {title:string;paneId:string;visible:boolean;precision:IndicatorPrecision;time:number;plots:readonly Readonly<{label:string;color:string;value:number|null;legend:boolean;dataWindow:boolean}>[]}
export type BuiltinReadoutSnapshot={state:'unavailable';message:string}|{state:'ready';assertCurrent():void;readAt(time:number):BuiltinReadoutValue};
export interface BuiltinProducerBudget {operations:number;numericSlots:number}
/** Optional hooks are handed only to the actual private DomainRenderingIndicator. */
export interface BuiltinNumericDraft {plot(plot:IndicatorSeries,index:number):void;value(plot:number,index:number,value:number|null):void;finishPlot(plot:number):void;/** Value() for every index of a sealed values array at once. */sealedValues?(plot:number,values:readonly (number|null)[]):void}
export interface BuiltinModelHooks {
 retire():void;
 retireAccepted(draft:BuiltinNumericDraft|undefined):void;
 prepare(settings:IndicatorInstanceSettings,result:IndicatorResult,raw:readonly Bar[],bars:readonly Bar[],input:readonly unknown[],budget:BuiltinProducerBudget,assertSource:()=>void,style:string|undefined):BuiltinNumericDraft|undefined;
 /** Private port-only accepted VWAP materialization; validates once before native acceptance. */
 prepareVwap(settings:IndicatorInstanceSettings,result:IndicatorResult,raw:readonly Bar[],bars:readonly Bar[],input:readonly unknown[],budget:BuiltinProducerBudget,assertSource:()=>void,style:string|undefined,inputFieldCount:number):BuiltinNumericDraft|undefined;
 accept(draft:BuiltinNumericDraft|undefined,result:IndicatorResult,output:object,precision:IndicatorPrecision):void;
 abort(draft:BuiltinNumericDraft|undefined):void;
 renew():void;
}
/** Provider group4096W/1024U +settlement observer1024W/128U +closed pipeline metadata2048W/256U. Paid once BEFORE group birth; all source/native/history costs remain separate. */
export const BUILTIN_SEASONALITY_PREPARATION_COST=Object.freeze({operations:7168,numericSlots:1408});
export interface BuiltinSourceCost {operations:number;numericSlots:number;pendingSlots:number}
/** Only the owning factory receives this control; it never appears on a public port. */
export interface BuiltinSourceReservation {readonly signal:AbortSignal;assertCurrent():void;accept():void;release():void}
export interface BuiltinScenePublication {retainCalendar(detached:()=>boolean):void;prepared(result:IndicatorResult,output:object):void;enter():void;returned():void;accepted():void;assertCurrent():void;retire():void}
export interface BuiltinPresentationControl {waitSeasonalitySourceSettlement(model:object,reservation:BuiltinSourceReservation,budget:BuiltinProducerBudget,wake:()=>void):BuiltinSettlementWait|null;retireSeasonalityPreparationWork(model:object,result:Readonly<SeasonalityResult>,reservation:BuiltinSourceReservation):void;armSeasonalityPreparation(model:object,reservation:BuiltinSourceReservation):BuiltinScenePublication;attachSeasonalityPreparationGroup(model:object,reservation:BuiltinSourceReservation,group:AlpacaSeasonalityPreparationGroup):void;armTimeframePreparation(model:object,reservation:BuiltinSourceReservation):BuiltinScenePublication;pinTimeframeScene(model:object,result:IndicatorResult,reservation:BuiltinSourceReservation):BuiltinScenePublication;pinSeasonalityScene(model:object,result:Readonly<SeasonalityResult>,reservation:BuiltinSourceReservation):BuiltinScenePublication;acceptSeasonality(model:object,settings:IndicatorInstanceSettings,result:IndicatorResult,sourceResult:Readonly<SeasonalityResult>,reservation:BuiltinSourceReservation,output:object,precision:IndicatorPrecision):BuiltinNumericDraft|undefined;reserveSource(model:object,owned:()=>boolean,budget:BuiltinProducerBudget,cost:BuiltinSourceCost):BuiltinSourceReservation|null;reconcile(budget:BuiltinProducerBudget):void;hooks(model:object,owned:()=>boolean):BuiltinModelHooks;capture(model:object|null):BuiltinReadoutSnapshot;drop(model:object):void;dispose():void}
/** A resource-only observer, never a source reservation or a numerical grant.
 * The fixed charge includes both terminal notices, at most one queued wake,
 * native listener removal, weak port metadata and an unwind finalizer. */
export const BUILTIN_SEASONALITY_SETTLEMENT_WAIT_COST=Object.freeze({operations:32768,numericSlots:4096});
export interface BuiltinSettlementWait {dispose():void}
interface SettlementWaitRecord {
 model:WeakRef<object>|null;group:WeakRef<AlpacaSeasonalityPreparationGroup>|null;
 signal:AbortSignal|null;wake:WeakRef<()=>void>|null;notice:(()=>void)|null;offGroup:(()=>void)|null;
 signalAttached:boolean;groupSettled:boolean;retired:boolean;released:boolean;queued:boolean;cleanupQueued:boolean;active:number;wakeTicket:object|null;cleanupTicket:object|null;
}
const settlementSignalAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const settlementSignalAdd=EventTarget.prototype.addEventListener,settlementSignalRemove=EventTarget.prototype.removeEventListener;
const settlementSignalAny=AbortSignal.any,settlementSignalIterator=Array.prototype[Symbol.iterator];
interface SettlementWaitTicket {owner:WeakRef<Pipeline>;record:WeakRef<SettlementWaitRecord>;kind:'wake'|'finish';entered:boolean}
const settlementWaitTickets=new WeakMap<object,SettlementWaitTicket>();
function settlementWaitNotice(owner:WeakRef<Pipeline>,key:WeakRef<SettlementWaitRecord>):()=>void{return()=>{const pipeline=owner.deref(),record=key.deref();if(pipeline&&record)pipeline.noticeSettlementWait(record);};}
/** Neither a directly called class target nor a supplied scheduling flag can
 * mature this module-private receipt. Only our captured native queue enters. */
function settlementWaitQueued(key:WeakRef<object>):()=>void{return()=>{const actual=key.deref(),ticket=actual&&settlementWaitTickets.get(actual);if(!actual||!ticket)return;ticket.entered=true;try{const pipeline=ticket.owner.deref();if(ticket.kind==='wake')pipeline?.runSettlementWait(actual);else pipeline?.finishSettlementWait(actual);}finally{settlementWaitTickets.delete(actual);const record=ticket.record.deref();if(record?.wakeTicket===actual)record.wakeTicket=null;if(record?.cleanupTicket===actual)record.cleanupTicket=null;}};}
function settlementWaitHandle(owner:WeakRef<Pipeline>,key:WeakRef<SettlementWaitRecord>):BuiltinSettlementWait{return Object.freeze({dispose(){const pipeline=owner.deref(),record=key.deref();if(pipeline&&record)pipeline.retireSettlementWait(record);}});}

const ports=new WeakMap<object,Pipeline>();
interface ViewKey {owner:WeakRef<Pipeline>;model:WeakRef<object>;version:number}
const views=new WeakMap<object,ViewKey>();
const missing=()=>Error('Current accepted study values are unavailable.');
class QueryError extends Error{}
function own(value:unknown,key:string,optional=false):any{if(!value||typeof value!=='object')throw missing();const field=Object.getOwnPropertyDescriptor(value,key);if(!field){if(optional)return undefined;throw missing();}if(!Object.hasOwn(field,'value'))throw missing();return field.value;}
function scalar(value:unknown):boolean{return value===undefined||value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value);}
const BAR_VALUE_KEYS=['open','high','low','close','volume'] as const;
function barNumber(value:unknown,key:string):number{return key==='volume'&&(value===undefined||typeof value==='number'&&Number.isNaN(value))?NaN:number(value);}
function number(value:unknown):number{if(typeof value!=='number'||!Number.isFinite(value))throw missing();return value;}
function array(value:unknown):any[]{if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw missing();const length=own(value,'length');if(!Number.isSafeInteger(length)||length<0)throw missing();return value;}
interface Group {target:object;keys:readonly string[];values:readonly unknown[]}
/**
 * The first plot's row checks read 3 rows and 13 fields per bar through property descriptors: about 6 ms per study at
 * 4,000 bars on every live tick, 200 times the cost of reading them directly. A row object is admitted once (an ordinary or
 * null-prototype object whose time, OHLC and volume are all own data properties); its fields are then read directly, so
 * every later value change, including the time edits the boundary tests make, is still seen on each calculation. Rows
 * that are not admitted (a missing volume, an accessor, an exotic prototype) and asynchronous drafts keep the descriptor path.
 */
const ROW_KEYS=['time','open','high','low','close','volume'] as const;
interface PlainRow {time:number;open:number;high:number;low:number;close:number;volume:number}
/**
 * `seen` holds admitted rows by index, one list per role (native input, calculation bars, primary) per port, kept across
 * publications until the port is disposed; each entry is a row that passed admission, so an identity match at any index
 * proves admission. (A WeakSet of rows cost about
 * 2 microseconds per add, more than the descriptor reads, when a page merge brings thousands of new rows.)
 */
function plainRowAt(list:readonly unknown[],seen:unknown[],index:number):PlainRow|null{
 const value=list[index];if(!value||typeof value!=='object')return null;if(seen[index]===value)return value as PlainRow;
 const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)return null;
 for(const key of ROW_KEYS){const field=Object.getOwnPropertyDescriptor(value,key);if(!field||!Object.hasOwn(field,'value'))return null;}
 if(index<=seen.length)seen[index]=value;return value as PlainRow;
}
/** True when every row check passes on admitted rows. Throws (as the descriptor path does) on a failed check; false defers to that path. */
function plainRowsMatch(draft:Draft,index:number):boolean{
 const lists=draft.rowLists;if(!lists)return false;
 const native=plainRowAt(draft.input,lists[0],index),bar=plainRowAt(draft.bars,lists[1],index),primary=plainRowAt(draft.primary,lists[2],index),prior=index?plainRowAt(draft.bars,lists[1],index-1):null;
 if(!native||!bar||!primary||index&&!prior)return false;
 const time=number(bar.time);if(!Object.is(number(native.time)/1000,time)||!Object.is(number(primary.time),time)||index&&time<=number(prior!.time))throw missing();
 const other=draft.style==='heikinashi'?bar:primary;
 if(!Object.is(number(native.open),number(other.open))||!Object.is(number(native.high),number(other.high))||!Object.is(number(native.low),number(other.low))||!Object.is(number(native.close),number(other.close))||!Object.is(barNumber(native.volume,'volume'),barNumber(other.volume,'volume')))throw missing();
 return true;
}
/** plainRowsMatch over [from, to) in one loop. Returns the first index it could not check on admitted rows (to when none). */
function plainRowSweep(draft:Draft,from:number,to:number):number{
 if(draft.asynchronous)return from;
 const lists=draft.rowLists;if(!lists)return from;const input=draft.input,bars=draft.bars,primaryRows=draft.primary,ha=draft.style==='heikinashi';
 let prior:PlainRow|null=from?plainRowAt(bars,lists[1],from-1):null;if(from&&!prior)return from;
 for(let index=from;index<to;index++){
  const native=plainRowAt(input,lists[0],index),bar=plainRowAt(bars,lists[1],index),primary=plainRowAt(primaryRows,lists[2],index);if(!native||!bar||!primary)return index;
  const time=number(bar.time);if(!Object.is(number(native.time)/1000,time)||!Object.is(number(primary.time),time)||index&&time<=number(prior!.time))throw missing();
  const other=ha?bar:primary;
  if(!Object.is(number(native.open),number(other.open))||!Object.is(number(native.high),number(other.high))||!Object.is(number(native.low),number(other.low))||!Object.is(number(native.close),number(other.close))||!Object.is(barNumber(native.volume,'volume'),barNumber(other.volume,'volume')))throw missing();
  prior=bar;
 }
 return to;
}
function group(target:object,keys:readonly string[]):Group {const values=keys.map(key=>{const value=own(target,key,true);if(!scalar(value))throw missing();return value;});return{target,keys,values:Object.freeze(values)};}
function groupCurrent(value:Group):boolean{return value.keys.every((key,index)=>Object.is(own(value.target,key,true),value.values[index]));}
/** `sealed` marks a values array built frozen by src/domain/indicator-sealed-values.ts. Each of its indices is already an
 * immutable own data property, so reading it directly equals the descriptor read and the per-index lock would change nothing. */
interface Plot {id:string;override:object|undefined;source:IndicatorSeries;values:readonly (number|null)[];count:number;label:string;color:string;legend:boolean;dataWindow:boolean;sealed?:boolean}
interface NativeProof {paneId:string;isCurrent():boolean;mounted():boolean;sameIncarnation():boolean;stored():boolean}
function nativeOwner(chart:object,model:object,output:object):NativeProof|null{
 try{
  const core=own(chart,'orchestrator'),registry=own(core,'registry'),records=own(registry,'records'),handles=own(core,'handles'),renderer=own(core,'renderer'),scene=own(renderer,'scene'),models=own(scene,'indicators'),panes=own(scene,'panes'),ctx=own(model,'ctx'),id=own(ctx,'id');
  if(![records,handles,models,panes].every(value=>value instanceof Map&&Object.getPrototypeOf(value)===Map.prototype)||typeof id!=='string')return null;
  const record=Map.prototype.get.call(records,id),handle=Map.prototype.get.call(handles,id),native=own(record,'native'),descriptor=own(native,'descriptor'),type=own(native,'type'),mounted=own(record,'model'),renderHandle=own(record,'renderHandle'),paneId=own(mounted,'paneId');
  if(own(native,'instance')!==model||getNativeIndicator(type)!==descriptor||typeof paneId!=='string'||Map.prototype.get.call(models,id)!==mounted||!Map.prototype.has.call(panes,paneId))return null;
  const emittedKeys:readonly string[]=own(own(model,'settings'),'kind')==='seasonality'?['series','fills','priceLines','tables','boxes']:['series','fills','priceLines'],emitted=emittedKeys.map(key=>own(output,key));if(!emittedKeys.every((key,index)=>own(mounted,key)===emitted[index]))return null;
  const pane=Map.prototype.get.call(panes,paneId);let alive=true,completed=own(model,'handle',true)===handle;
  const current=()=>{if(!alive)return false;try{const assigned=own(model,'handle',true);if(assigned===handle)completed=true;const ok=own(chart,'orchestrator')===core&&own(core,'registry')===registry&&own(registry,'records')===records&&own(core,'handles')===handles&&own(core,'renderer')===renderer&&own(renderer,'scene')===scene&&own(scene,'indicators')===models&&own(scene,'panes')===panes&&Map.prototype.get.call(records,id)===record&&Map.prototype.get.call(handles,id)===handle&&own(record,'native')===native&&own(native,'instance')===model&&own(native,'descriptor')===descriptor&&getNativeIndicator(type)===descriptor&&own(model,'ctx')===ctx&&(assigned===handle||!completed&&assigned===null)&&own(record,'model')===mounted&&own(record,'renderHandle')===renderHandle&&own(mounted,'paneId')===paneId&&emittedKeys.every((key,index)=>own(mounted,key)===emitted[index])&&Map.prototype.get.call(models,id)===mounted&&Map.prototype.get.call(panes,paneId)===pane;if(!ok)alive=false;return ok;}catch{alive=false;return false;}};
  const sameIncarnation=()=>{try{return own(chart,'orchestrator')===core&&Map.prototype.get.call(records,id)===record&&own(record,'native')===native&&own(native,'instance')===model&&own(record,'model')===mounted&&own(record,'renderHandle')===renderHandle&&own(model,'ctx')===ctx&&own(model,'handle',true)===handle&&Map.prototype.get.call(handles,id)===handle&&Map.prototype.get.call(models,id)===mounted;}catch{return false;}};
  return current()?{paneId,isCurrent:current,mounted:()=>current()&&completed,sameIncarnation,stored:()=>{try{const activeCore=own(chart,'orchestrator'),activeRegistry=own(activeCore,'registry'),activeRecords=own(activeRegistry,'records');if(!(activeRecords instanceof Map)||Object.getPrototypeOf(activeRecords)!==Map.prototype)return true;const activeRecord=Map.prototype.get.call(activeRecords,id);if(activeRecord!==record)return false;const activeModel=own(activeRecord,'model');return emittedKeys.some((key,index)=>own(activeModel,key,true)===emitted[index]);}catch{return true;}}}:null;
 }catch{return null;}
}
interface Draft {
 token:BuiltinNumericDraft;model:object;owned:()=>boolean;settings:IndicatorInstanceSettings;result:IndicatorResult;bars:readonly Bar[];input:readonly unknown[];primary:readonly Bar[];source:()=>void;style:string;frame:()=>boolean;inputs:object;styles:object;presentation:object|undefined;timeframe:object|undefined;epoch:object;groups:Group[];plots:Plot[];series:readonly IndicatorSeries[];count:number;plotCount:number;seen:number;W:number;U:number;K:number;asynchronous:boolean;haOpen:number|undefined;haClose:number|undefined;valid:boolean;released:boolean;metadataSlots:number;
 /** Admitted-row caches of input, bars and primary (plainRowsMatch). */
 rowLists?:unknown[][];
}
interface State {acceptedDraft:BuiltinNumericDraft;version:number;model:object;owned:()=>boolean;settings:IndicatorInstanceSettings;result:IndicatorResult;output:object;input:readonly unknown[];primary:readonly Bar[];sourceTimes?:readonly number[];source:()=>void;style:string;frame:()=>boolean;inputs:object;styles:object;presentation:object|undefined;timeframe:object|undefined;epoch:object;groups:Group[];plots:readonly Plot[];series:readonly IndicatorSeries[];native:NativeProof;count:number;precision:IndicatorPrecision;title:string;visible:boolean;W:number;U:number;view:BuiltinReadoutSnapshot|null}
function eligible(settings:IndicatorInstanceSettings):boolean{const def=catalogDefinition(settings.kind);return !def?.seasonality&&!def?.profile&&!def?.viewport&&!def?.finerBars&&!def?.dailyHistory&&!def?.secondSymbol&&!(settings.kind==='vwap'&&(settings.inputs.kernelVersion===2||isVwapEventAnchor(settings.inputs.anchor)))&&!parseIndicatorSource(settings.inputs.source);}
function title(kind:string):string{return catalogDefinition(kind)?.name??({volume:'Volume',sma:'Moving Average',ema:'Exponential Moving Average',rsi:'Relative Strength Index',macd:'MACD',bb:'Bollinger Bands',vwap:'VWAP',stochastic:'Stochastic',atr:'Average True Range',obv:'On Balance Volume'} as Record<string,string>)[kind]??'Study';}
/** A foreign factory cannot replace authority on the actual port that already escaped its own factory. */
export function createBuiltinPresentationPort<T extends object>(chart:object,publication:AnalysisPublicationHost|undefined,inputBars:(()=>readonly Bar[])|undefined,build:(control:BuiltinPresentationControl)=>T):T{const pipeline=new Pipeline(chart,publication,inputBars);try{const port=build(pipeline);if(ports.has(port))throw Error('Study presentation port is already owned.');ports.set(port,pipeline);return port;}catch(error){pipeline.dispose();throw error;}}
function makeView(key:object):BuiltinReadoutSnapshot{return Object.freeze({state:'ready' as const,assertCurrent(){readView(key);},readAt(time:number){return readView(key,time,true)!;}});}
function readView(key:object,time?:number,query=false):BuiltinReadoutValue|undefined{const value=views.get(key),owner=value?.owner.deref(),model=value?.model.deref();if(!value||!owner||!model)throw missing();return owner.read(model,value.version,time,query);}
interface SourceReservationState {model:object|null;owned:(()=>boolean)|null;controller:AbortController;cost:BuiltinSourceCost;accepted:boolean;live:boolean;releaseRequested:boolean;scene:SceneRetention|null;preparation?:SeasonalityPreparationRetention;forcePreparationRelease?:true;retiredOperations?:number;workRetirementQueued?:true;workRetirementTicket?:object}
interface SeasonalityPreparationRetention {group:AlpacaSeasonalityPreparationGroup;wake:(()=>void)|null;off:(()=>void)|null;detaching:boolean}
const preparationOwners=new WeakMap<object,WeakRef<SourceReservationState>>();
/** No model/source/provider/result graph is captured by either terminal notice closure. */
function preparationNotice(owner:WeakRef<Pipeline>,state:WeakRef<SourceReservationState>,group:WeakRef<AlpacaSeasonalityPreparationGroup>):()=>void{return()=>queueMicrotask(preparationReleaseAttempt(owner,state,group));}
function preparationReleaseAttempt(owner:WeakRef<Pipeline>,state:WeakRef<SourceReservationState>,group:WeakRef<AlpacaSeasonalityPreparationGroup>):()=>void{return()=>{const pipeline=owner.deref(),record=state.deref(),actual=group.deref();if(pipeline&&record?.live&&record.releaseRequested&&actual&&record.preparation?.group===actual)pipeline.releaseSettledPreparation(record);};}
const enqueueBuiltinRetention=queueMicrotask.bind(globalThis);
interface WorkRetirementTicket {owner:WeakRef<Pipeline>;state:WeakRef<SourceReservationState>;scene:WeakRef<SceneRetention>;result:WeakRef<Readonly<SeasonalityResult>>;reservation:WeakRef<BuiltinSourceReservation>;entered:boolean}
const workRetirementTickets=new WeakMap<object,WorkRetirementTicket>();
/** One queued attempt after the native/publication caller's stack returns.
 * The opaque ticket matures only inside our captured native microtask callback.
 * Only weak identities cross it; no model/result/source graph is retained. */
function workRetirementAttempt(key:WeakRef<object>):()=>void{return()=>{const actual=key.deref(),ticket=actual&&workRetirementTickets.get(actual);if(!actual||!ticket)return;const pipeline=ticket.owner.deref();ticket.entered=true;try{pipeline?.retireUnwoundSeasonalityWork(actual);}catch{/* Unknown/retired work stays fully funded; no accounting exception can certify numbers. */}finally{workRetirementTickets.delete(actual);const state=ticket.state.deref();if(state?.workRetirementTicket===actual)delete state.workRetirementTicket;}};}
interface SceneRetention {preparationArmed?:true;kind:'seasonality'|'timeframe';result:object|null;output:object|null;original:WeakRef<object>|null;reservation:WeakRef<BuiltinSourceReservation>;native:NativeProof|null;retired:boolean;stackReleased:boolean;phase:'preparing'|'emitting'|'returned';stored:()=>boolean;calendarDetached?:()=>boolean}
interface ScenePublicationKey {owner:WeakRef<Pipeline>;state:WeakRef<SourceReservationState>;scene:WeakRef<SceneRetention>}
const scenePublications=new WeakMap<object,ScenePublicationKey>();
function publicationRecord(key:object){const value=scenePublications.get(key),owner=value?.owner.deref(),state=value?.state.deref(),scene=value?.scene.deref();if(!owner||!state||!scene||!state.live||state.scene!==scene)throw missing();return{owner,state,scene};}
function sourceScenePublication(key:object):BuiltinScenePublication{return Object.freeze({
 // Closed model publisher only. Arming executes no callback and grants no source/numeric/publication authority.
 retainCalendar(detached:()=>boolean){const {state,scene}=publicationRecord(key);if(scene.phase!=='preparing'||scene.retired||scene.calendarDetached||typeof detached!=='function'||!state.live||state.scene!==scene)throw missing();scene.calendarDetached=detached;},
 prepared(result:IndicatorResult,output:object){const {owner,state,scene}=publicationRecord(key);owner.prepareSceneRecord(state,scene,result,output);},
 enter(){const {scene}=publicationRecord(key);if(scene.phase!=='preparing'||!scene.output)throw missing();scene.phase='emitting';},
 returned(){const {scene}=publicationRecord(key);if(scene.phase!=='emitting')throw missing();scene.phase='returned';},
 accepted(){const {owner,state,scene}=publicationRecord(key);owner.acceptSceneRecord(state,scene);},
 assertCurrent(){const {owner,state,scene}=publicationRecord(key);owner.assertSceneRecord(state,scene);},
 retire(){let record:ReturnType<typeof publicationRecord>;try{record=publicationRecord(key);}catch{return;}if(record.scene.retired)return;record.scene.retired=true;record.scene.stackReleased=false;if(record.scene.phase==='preparing'){record.scene.phase='returned';record.scene.stored=()=>false;}record.owner.retireSceneRecord(record.state);}
});}
class Pipeline implements BuiltinPresentationControl {
 private states=new WeakMap<object,State>();private drafts=new WeakMap<object,Draft>();private active=new Set<Draft>();private epoch={};private epochSource:AnalysisPublicationOwner|null=null;
 /** Admitted plain rows by index for the native input, calculation bars and primary rows (plainRowAt). */
 private rowCaches:unknown[][]=[[],[],[]];private W=0;private U=0;private pendingW=0;private pendingSlots=0;private version=0;private closed=false;
 constructor(private chart:object,private publication:AnalysisPublicationHost|undefined,private inputBars:(()=>readonly Bar[])|undefined){}
 private settlementWaits=new Set<SettlementWaitRecord>();private settlementWaitByModel=new WeakMap<object,SettlementWaitRecord>();
 /** Authenticate the exact previous source before touching caller budget/wake.
  * No pruning, source assertion, cancellation, model callback or source walk is
  * allowed before both physical observers are installed. */
 waitSeasonalitySourceSettlement(model:object,reservation:BuiltinSourceReservation,budget:BuiltinProducerBudget,wake:()=>void):BuiltinSettlementWait|null{
  const prior=this.sourceTokens.get(reservation),preparation=prior?.preparation,group=preparation?.group;
  if(this.closed||!prior?.live||prior.model!==model||!group||preparationOwners.get(group)?.deref()!==prior||!alpacaSeasonalityPreparationGroupKnown(group)||this.settlementWaitByModel.has(model)||this.settlementWaits.size>=1000)return null;
  const W=own(budget,'operations'),U=own(budget,'numericSlots'),cost=BUILTIN_SEASONALITY_SETTLEMENT_WAIT_COST;
  if(typeof wake!=='function'||![W,U].every(value=>Number.isSafeInteger(value)&&value>=0)||W+this.W+this.pendingW+this.sourceAcceptedW+this.sourcePendingW+cost.operations>INDICATOR_BATCH_WORK_LIMIT||U+this.U+this.pendingSlots+this.sourceAcceptedU+this.sourcePendingSlots+cost.numericSlots>INDICATOR_BATCH_OUTPUT_LIMIT)return null;
  if(this.closed||!prior.live||prior.model!==model||prior.preparation!==preparation||this.settlementWaitByModel.has(model))return null;
  // Reuse the existing shared admission counters, without creating a source
  // token or acquiring authority to continue any old provider request.
  this.sourcePendingW+=cost.operations;this.sourcePendingSlots+=cost.numericSlots;
  let record:SettlementWaitRecord|null=null;
  try{
   record={model:new WeakRef(model),group:new WeakRef(group),signal:null,wake:new WeakRef(wake),notice:null,offGroup:null,signalAttached:false,groupSettled:false,retired:false,released:false,queued:false,cleanupQueued:false,active:0,wakeTicket:null,cleanupTicket:null};this.settlementWaits.add(record);this.settlementWaitByModel.set(model,record);
   // The derived signal never escapes. Dispatching an event on the old public
   // signal cannot trigger it; only native abort propagation can do so once.
   const signals=[own(reservation,'signal') as AbortSignal];Object.defineProperty(signals,Symbol.iterator,{value:settlementSignalIterator});
   record.signal=Reflect.apply(settlementSignalAny,AbortSignal,[signals]) as AbortSignal;
   const owner=new WeakRef(this),key=new WeakRef(record);record.notice=settlementWaitNotice(owner,key);
   record.offGroup=subscribeAlpacaSeasonalityPreparationSettled(group,record.notice);
   Reflect.apply(settlementSignalAdd,record.signal,['abort',record.notice,{once:true}]);record.signalAttached=true;
   const handle=settlementWaitHandle(owner,key);
   if(this.closed||!this.settlementWaits.has(record)||record.retired||prior.model!==model&&prior.live)throw missing();
   // Already-settled subscription is a no-op; recheck the actual facts after
   // installing both listeners. A forged abort event never satisfies getter.
   this.noticeSettlementWait(record);return handle;
  }catch(error){
   if(record){try{this.retireSettlementWait(record);}catch(cleanup){throw new AggregateError([error,cleanup],'Settlement observer acquisition and cleanup failed.');}}
   else{this.sourcePendingW-=cost.operations;this.sourcePendingSlots-=cost.numericSlots;}
   throw error;
  }
 }
 /** Private weak notice target. Only genuine physical facts latch terminal;
  * no source/native/model computation runs in either notification callback. */
 noticeSettlementWait(record:SettlementWaitRecord):void{
  if(!this.settlementWaits.has(record)||record.retired||record.released)return;record.active++;
  try{
   const group=record.group?.deref();if(group&&alpacaSeasonalityPreparationGroupKnown(group)&&alpacaSeasonalityPreparationSettled(group))record.groupSettled=true;
   if(!record.groupSettled||!record.signal||Reflect.apply(settlementSignalAborted,record.signal,[])!==true||record.queued)return;
   record.queued=true;const key={};record.wakeTicket=key;settlementWaitTickets.set(key,{owner:new WeakRef(this),record:new WeakRef(record),kind:'wake',entered:false});enqueueBuiltinRetention(settlementWaitQueued(new WeakRef(key)));
  }finally{record.active--;if(record.retired)this.queueSettlementWaitFinish(record);}
 }
 /** The exact prior debit has retired before native aborted becomes true.
  * This callback grants only a fresh computation attempt under the port's
  * current generation; its full normal admission still includes this fee. */
 runSettlementWait(key:object):void{
  const ticket=settlementWaitTickets.get(key);if(!ticket?.entered||ticket.kind!=='wake'||ticket.owner.deref()!==this)return;const record=ticket.record.deref();
  if(!record||record.wakeTicket!==key||!record.queued||record.released||!this.settlementWaits.has(record))return;settlementWaitTickets.delete(key);record.queued=false;record.wakeTicket=null;record.active++;
  try{
   if(this.closed||record.retired||!record.groupSettled||!record.signal||Reflect.apply(settlementSignalAborted,record.signal,[])!==true)return;
   try{record.wake?.deref()?.();}catch{/* The private port owns its calculation diagnostics. A resource notice cannot publish numbers or disrupt other releases. */}
  }finally{
   try{this.retireSettlementWait(record);}catch{/* An unproved observer detach remains funded; closed/retired waits cannot wake again. */}finally{record.active--;this.queueSettlementWaitFinish(record);}
  }
 }
 retireSettlementWait(record:SettlementWaitRecord):void{
  if(!this.settlementWaits.has(record)||record.released)return;record.retired=true;const model=record.model?.deref();if(model&&this.settlementWaitByModel.get(model)===record)this.settlementWaitByModel.delete(model);
  const failures:unknown[]=[];
  try{record.offGroup?.();record.offGroup=null;}catch(error){failures.push(error);}
  try{if(record.signalAttached&&record.signal&&record.notice)Reflect.apply(settlementSignalRemove,record.signal,['abort',record.notice]);record.signalAttached=false;}catch(error){failures.push(error);}
  this.queueSettlementWaitFinish(record);if(failures.length)throw new AggregateError(failures,'Settlement observer cleanup was incomplete.');
 }
 private queueSettlementWaitFinish(record:SettlementWaitRecord):void{
  if(!this.settlementWaits.has(record)||record.released||!record.retired||record.active||record.queued||record.cleanupQueued||record.offGroup||record.signalAttached)return;
  record.cleanupQueued=true;const key={};record.cleanupTicket=key;settlementWaitTickets.set(key,{owner:new WeakRef(this),record:new WeakRef(record),kind:'finish',entered:false});enqueueBuiltinRetention(settlementWaitQueued(new WeakRef(key)));
 }
 /** Refund only after listener and caller/callback frames actually unwound. */
 finishSettlementWait(key:object):void{
  const ticket=settlementWaitTickets.get(key);if(!ticket?.entered||ticket.kind!=='finish'||ticket.owner.deref()!==this)return;const record=ticket.record.deref();
  if(!record||record.cleanupTicket!==key||!record.cleanupQueued)return;settlementWaitTickets.delete(key);record.cleanupQueued=false;record.cleanupTicket=null;if(record.released||!record.retired||record.active||record.queued||record.offGroup||record.signalAttached||!this.settlementWaits.has(record))return;
  record.released=true;this.settlementWaits.delete(record);record.model=null;record.group=null;record.signal=null;record.wake=null;record.notice=null;
  this.sourcePendingW-=BUILTIN_SEASONALITY_SETTLEMENT_WAIT_COST.operations;this.sourcePendingSlots-=BUILTIN_SEASONALITY_SETTLEMENT_WAIT_COST.numericSlots;
 }

 private sourceTokens=new WeakMap<object,SourceReservationState>();
 private sourceReservations=new Set<SourceReservationState>();private sourceAcceptedW=0;private sourceAcceptedU=0;private sourcePendingW=0;private sourcePendingSlots=0;
 private releaseSource(state:SourceReservationState,force=false){
  if(!state.live)return;state.releaseRequested=true;
  // Cancellation is immediate; physical refunds wait for the actual invocation,
  // including uncancellable D/F awaits. Never cancel active A from a notice.
  const preparation=state.preparation;
  if(preparation){
   if(force)state.forcePreparationRelease=true;force=force||state.forcePreparationRelease===true;
   try{releaseAlpacaSeasonalityPreparationGroup(preparation.group);if(!alpacaSeasonalityPreparationSettled(preparation.group))return;}catch{return;}
  }
  // An armed unpublished stack is required even during forced disposal. Its
  // caller must retire in finally after borrowed references have unwound.
  if(state.scene?.preparationArmed&&(!state.scene.stackReleased||state.scene.phase!=='returned'||state.scene.stored()))return;
  // A calendar copy can outlive its model arrays or public coords alias. Even
  // forced disposal must hold its charge until the exact private copy detached.
  const calendarScene=state.scene;
  if(calendarScene?.calendarDetached){try{if(calendarScene.calendarDetached()!==true||!state.live||state.scene!==calendarScene)return;}catch{return;}}
  // Accepted model scenes are not optional probes. Hold their entire charge if detachment cannot be proved.
  if(state.scene&&!force){try{const model=state.model;if(!state.scene.stackReleased||state.scene.phase!=='returned'||state.scene.stored()||model&&own(model,'ctx',true)!==null&&own(model,'removed',true)!==true&&(own(model,'result',true)===state.scene.result||own(model,'acceptedOutput',true)===state.scene.output))return;}catch{return;}}
  if(preparation){
   if(preparation.detaching)return;preparation.detaching=true;
   try{preparation.off?.();}catch{preparation.detaching=false;return;}
   if(state.preparation!==preparation||!state.live)return;
   if(preparationOwners.get(preparation.group)?.deref()===state)preparationOwners.delete(preparation.group);
   preparation.wake=null;preparation.off=null;delete state.preparation;
  }
  state.live=false;this.sourceReservations.delete(state);state.scene=null;
  if(state.accepted){this.sourceAcceptedW-=state.cost.operations-(state.retiredOperations??0);this.sourceAcceptedU-=state.cost.numericSlots;}else{this.sourcePendingW-=state.cost.operations;this.sourcePendingSlots-=state.cost.numericSlots+state.cost.pendingSlots;}
  // Accounting and identity retire before a synchronous AbortSignal observer can reenter with B.
  state.model=null;state.owned=null;state.controller.abort();
 }
 /** Internal weak-notice target; the class itself never escapes its factory. */
 releaseSettledPreparation(state:SourceReservationState){if(state.live&&state.releaseRequested)this.releaseSource(state,state.forcePreparationRelease===true);}
 private releaseSources(model?:object,force=false){for(const state of [...this.sourceReservations])if((model===undefined||state.model===model)&&(force||!state.scene))this.releaseSource(state,force);}
 private pruneSources(model?:object){for(const state of [...this.sourceReservations])if(model===undefined||state.model===model){let current=false;try{current=state.owned?.()===true;}catch{}if(!current||state.releaseRequested)this.releaseSource(state);}}
 reserveSource(model:object,owned:()=>boolean,budget:BuiltinProducerBudget,cost:BuiltinSourceCost):BuiltinSourceReservation|null{
  if(this.closed||![budget.operations,budget.numericSlots,cost.operations,cost.numericSlots,cost.pendingSlots].every(value=>Number.isSafeInteger(value)&&value>=0)||!owned())return null;
  // Bounded current factory inventory; retire already-invalid owners before considering new headroom.
  this.pruneSources();
  // At most one pending per actual owned model. An accepted parent stays charged during replacement.
  for(const previous of [...this.sourceReservations])if(previous.model===model&&!previous.accepted)this.releaseSource(previous);
  if(this.closed||!owned()||budget.operations+this.W+this.pendingW+this.sourceAcceptedW+this.sourcePendingW+cost.operations>INDICATOR_BATCH_WORK_LIMIT||budget.numericSlots+this.U+this.pendingSlots+this.sourceAcceptedU+this.sourcePendingSlots+cost.numericSlots+cost.pendingSlots>INDICATOR_BATCH_OUTPUT_LIMIT)return null;
  const state:SourceReservationState={model,owned,controller:new AbortController(),cost:Object.freeze({...cost}),accepted:false,live:true,releaseRequested:false,scene:null};this.sourceReservations.add(state);this.sourcePendingW+=cost.operations;this.sourcePendingSlots+=cost.numericSlots+cost.pendingSlots;
  const assert=()=>{if(!state.live||state.releaseRequested||this.closed||!state.owned?.()){this.releaseSource(state);throw missing();}};
  const token:BuiltinSourceReservation=Object.freeze({signal:state.controller.signal,assertCurrent:assert,accept:()=>{assert();if(state.accepted)return;const prior=[...this.sourceReservations].filter(other=>other!==state&&other.model===state.model&&other.accepted);state.accepted=true;this.sourcePendingW-=cost.operations;this.sourcePendingSlots-=cost.numericSlots+cost.pendingSlots;this.sourceAcceptedW+=cost.operations;this.sourceAcceptedU+=cost.numericSlots;for(const previous of prior)this.releaseSource(previous);assert();},release:()=>this.releaseSource(state)});this.sourceTokens.set(token,state);return token;
 }
 /** Called only after the same consumed result and native scene are accepted.
  * It schedules no recomputation and cannot accept a caller credit/amount. */
 retireSeasonalityPreparationWork(model:object,result:Readonly<SeasonalityResult>,reservation:BuiltinSourceReservation):void{
  const state=this.sourceTokens.get(reservation),scene=state?.scene;
  if(this.closed||!state?.live||state.releaseRequested||!state.accepted||state.model!==model||!scene?.preparationArmed||scene.kind!=='seasonality'||scene.retired||scene.phase!=='returned'||!scene.native||scene.original?.deref()!==result||!state.preparation||state.workRetirementQueued||state.retiredOperations!==undefined)return;
  // A repeat cannot enqueue repeated work or borrow another group's balance.
  state.workRetirementQueued=true;const key={};state.workRetirementTicket=key;
  workRetirementTickets.set(key,{owner:new WeakRef(this),state:new WeakRef(state),scene:new WeakRef(scene),result:new WeakRef(result),reservation:new WeakRef(reservation),entered:false});
  enqueueBuiltinRetention(workRetirementAttempt(new WeakRef(key)));
 }
 /** Internal queued target. Private source/group/result membership authenticates
  * the exact max(preparation,ready) decomposition; subtracting all preparation
  * from an overlapping max would create unearned headroom. Never alter U. */
 retireUnwoundSeasonalityWork(key:object):void{
  const ticket=workRetirementTickets.get(key);if(!ticket||!ticket.entered||ticket.owner.deref()!==this)return;
  const state=ticket.state.deref(),scene=ticket.scene.deref(),result=ticket.result.deref(),reservation=ticket.reservation.deref();if(!state||!scene||!result||!reservation||state.workRetirementTicket!==key)return;
  const preparation=state.preparation,group=preparation?.group;
  const same=()=>!this.closed&&state.live&&!state.releaseRequested&&state.accepted&&state.scene===scene&&scene.preparationArmed===true&&scene.kind==='seasonality'&&!scene.retired&&scene.phase==='returned'&&scene.original?.deref()===result&&scene.reservation.deref()===reservation&&this.sourceTokens.get(reservation)===state&&state.preparation===preparation&&!!group&&state.model!==null&&state.retiredOperations===undefined;
  if(!same()||!group||!alpacaSeasonalityPreparationGroupKnown(group)||!alpacaSeasonalityPreparationSettled(group))return;
  // These may inspect current source/native owners; peak W is still charged.
  this.assertSceneRecord(state,scene);
  const facts=consumedPrimarySourceWorkComponents(result,reservation);
  if(!facts||facts.preparationGroup!==group||facts.unwound!==true||!Number.isSafeInteger(facts.peakOperations)||!Number.isSafeInteger(facts.retainedOperations)||facts.peakOperations!==state.cost.operations||facts.retainedOperations<BUILTIN_SEASONALITY_PREPARATION_COST.operations||facts.retainedOperations>facts.peakOperations)return;
  this.assertSceneRecord(state,scene);
  if(!same()||!alpacaSeasonalityPreparationSettled(group)||!consumedPrimarySourceResultBelongs(result,reservation))return;
  const credit=facts.peakOperations-facts.retainedOperations;
  // No callback/property access follows this atomic primitive accounting pair.
  state.retiredOperations=credit;this.sourceAcceptedW-=credit;
 }
 /** Callback-free required hold BEFORE a group, request, graph or callback is created. */
 armSeasonalityPreparation(model:object,reservation:BuiltinSourceReservation):BuiltinScenePublication{
  const state=this.sourceTokens.get(reservation),fee=BUILTIN_SEASONALITY_PREPARATION_COST;
  if(this.closed||!state?.live||state.releaseRequested||state.accepted||state.model!==model||state.scene||state.cost.operations<fee.operations||state.cost.numericSlots<fee.numericSlots)throw missing();
  const scene:SceneRetention={preparationArmed:true,kind:'seasonality',result:null,output:null,original:null,reservation:new WeakRef(reservation),native:null,retired:false,stackReleased:false,phase:'preparing',stored:()=>true};state.scene=scene;
  const key={};scenePublications.set(key,{owner:new WeakRef(this),state:new WeakRef(state),scene:new WeakRef(scene)});return sourceScenePublication(key);
 }
 /** The provider authenticates the opaque invocation before any group fields.
  * Register before run; one invocation cannot fund two source reservations. */
 attachSeasonalityPreparationGroup(model:object,reservation:BuiltinSourceReservation,group:AlpacaSeasonalityPreparationGroup):void{
  const state=this.sourceTokens.get(reservation),scene=state?.scene;
  if(this.closed||!state?.live||state.releaseRequested||state.accepted||state.model!==model||!scene||scene.kind!=='seasonality'||scene.retired||scene.original||scene.phase!=='preparing'||state.preparation||preparationOwners.has(group))throw missing();
  // A rejected object may contain an unbounded foreign graph. Authenticate
  // the actual fixed opaque key BEFORE retaining it, reading fields or callbacks.
  if(!alpacaSeasonalityPreparationGroupKnown(group))throw missing();
  const wake=preparationNotice(new WeakRef(this),new WeakRef(state),new WeakRef(group)),preparation:SeasonalityPreparationRetention={group,wake,off:null,detaching:false};
  state.preparation=preparation;preparationOwners.set(group,new WeakRef(state));
  try{
   const off=subscribeAlpacaSeasonalityPreparationSettled(group,wake);preparation.off=off;
   if(this.closed||!state.live||state.releaseRequested||state.scene!==scene||scene.retired||state.preparation!==preparation)throw missing();
  }catch(error){
   // Observer admission may itself fail. Keep the authentic physical hold;
   // the caller retires its armed stack in finally. Correct callers attach
   // before run, so cancelling here cannot start or refund a pending request.
   try{releaseAlpacaSeasonalityPreparationGroup(group);}catch(cleanup){throw new AggregateError([error,cleanup],'Preparation observer and cancellation failed.');}
   throw error;
  }
 }
 /** Callback-free arming immediately after one successful source consumption, BEFORE owner/native/format callbacks. */
 pinSeasonalityScene(model:object,result:Readonly<SeasonalityResult>,reservation:BuiltinSourceReservation):BuiltinScenePublication{
  const state=this.sourceTokens.get(reservation);
  if(this.closed||!state?.live||state.releaseRequested||!state.accepted||state.model!==model||!consumedPrimarySourceResultBelongs(result,reservation))throw missing();
  let scene=state.scene;
  if(scene){if(scene.kind!=='seasonality'||scene.retired||scene.phase!=='preparing'||scene.result||scene.output||scene.original)throw missing();scene.original=new WeakRef(result);}
  else{scene={kind:'seasonality',result:null,output:null,original:new WeakRef(result),reservation:new WeakRef(reservation),native:null,retired:false,stackReleased:true,phase:'preparing',stored:()=>true};state.scene=scene;}
  const key={};scenePublications.set(key,{owner:new WeakRef(this),state:new WeakRef(state),scene:new WeakRef(scene)});return sourceScenePublication(key);
 }
 /** Callback-free required preparation hold, immediately after admission and before any numerical work. */
 armTimeframePreparation(model:object,reservation:BuiltinSourceReservation):BuiltinScenePublication{
  const state=this.sourceTokens.get(reservation);if(this.closed||!state?.live||state.accepted||state.model!==model||state.scene)throw missing();
  const scene:SceneRetention={kind:'timeframe',result:null,output:null,original:null,reservation:new WeakRef(reservation),native:null,retired:false,stackReleased:false,phase:'preparing',stored:()=>true};state.scene=scene;
  const key={};scenePublications.set(key,{owner:new WeakRef(this),state:new WeakRef(state),scene:new WeakRef(scene)});return sourceScenePublication(key);
 }
 /** Binding an actual completed result grants no acceptance; native arrays/owner are still mandatory. */
 pinTimeframeScene(model:object,result:IndicatorResult,reservation:BuiltinSourceReservation):BuiltinScenePublication{
  const state=this.sourceTokens.get(reservation),scene=state?.scene;
  if(this.closed||!state?.live||!state.accepted||state.model!==model||!scene||scene.kind!=='timeframe'||scene.retired||scene.phase!=='preparing'||scene.result||scene.output||scene.original)throw missing();
  scene.result=result;scene.original=new WeakRef(result);
  const key={};scenePublications.set(key,{owner:new WeakRef(this),state:new WeakRef(state),scene:new WeakRef(scene)});return sourceScenePublication(key);
 }
 prepareSceneRecord(state:SourceReservationState,scene:SceneRetention,result:IndicatorResult,output:object){
  if(!state.live||state.scene!==scene||scene.phase!=='preparing'||scene.output||scene.kind==='timeframe'&&scene.result!==result)throw missing();scene.result=result;scene.output=output;
  // Own data only. Unknown identity is a hold, never a release proof or numerical grant.
  let id:unknown;try{id=own(own(state.model,'ctx'),'id');}catch{return;}if(typeof id!=='string')return;
  const names:readonly string[]=scene.kind==='seasonality'?['series','fills','priceLines','tables','boxes']:['series','fills','priceLines'],arrays=names.map(name=>own(output,name));
  scene.stored=()=>{try{const core=own(this.chart,'orchestrator'),records=own(own(core,'registry'),'records');if(!(records instanceof Map)||Object.getPrototypeOf(records)!==Map.prototype)return true;const record=Map.prototype.get.call(records,id);if(!record)return false;const actual=own(record,'model');return names.some((name,index)=>own(actual,name,true)===arrays[index]);}catch{return true;}};
 }
 acceptSceneRecord(state:SourceReservationState,scene:SceneRetention){
  if(!state.live||!state.accepted||state.releaseRequested||state.scene!==scene||scene.retired||scene.phase!=='returned'||!scene.result||!scene.output)throw missing();
  const reservation=scene.reservation.deref(),original=scene.original?.deref();
  if(!reservation||!original||!state.owned?.()||!(scene.kind==='timeframe'?original===scene.result:consumedPrimarySourceResultMatches(original,reservation))||!state.live||state.releaseRequested||state.scene!==scene)throw missing();
  const native=nativeOwner(this.chart,state.model!,scene.output);if(!native||!native.isCurrent()||!state.owned?.()||!state.live||state.releaseRequested||state.scene!==scene||!(scene.kind==='timeframe'?original===scene.result:consumedPrimarySourceResultMatches(original,reservation))||!native.isCurrent())throw missing();
  scene.native=native;
 }
 assertSceneRecord(state:SourceReservationState,scene:SceneRetention){
  if(!state.live||!state.accepted||state.releaseRequested||state.scene!==scene||scene.retired||scene.phase!=='returned'||!scene.native?.isCurrent())throw missing();
  const reservation=scene.reservation.deref(),original=scene.original?.deref();if(!reservation||!original||!state.owned?.()||!(scene.kind==='timeframe'?original===scene.result:consumedPrimarySourceResultMatches(original,reservation))||!state.live||state.releaseRequested||state.scene!==scene||!scene.native.isCurrent())throw missing();
 }
 retireSceneRecord(state:SourceReservationState){
  // A failed unpublished materializer still owns local temporaries until its stack unwinds.
  const owner=new WeakRef(this),key=new WeakRef(state),enqueue=state.scene?.preparationArmed?enqueueBuiltinRetention:queueMicrotask;enqueue(()=>{const pipeline=owner.deref(),record=key.deref();if(pipeline&&record?.live){if(record.scene?.retired)record.scene.stackReleased=true;if(record.releaseRequested)pipeline.releaseSource(record);}});
 }
 /** Exact source reservation and constructor-owned aligned output; all retained work/storage was admitted by that source plan. */
 acceptSeasonality(model:object,settings:IndicatorInstanceSettings,result:IndicatorResult,sourceResult:Readonly<SeasonalityResult>,reservation:BuiltinSourceReservation,output:object,precision:IndicatorPrecision):BuiltinNumericDraft|undefined{
  let token:BuiltinNumericDraft|undefined;
  try{
   const lease=this.sourceTokens.get(reservation),primary=this.inputBars?.();
   if(this.closed||settings.kind!=='seasonality'||!lease?.live||!lease.accepted||lease.model!==model||!lease.owned?.()||sourceResult.status!=='ready'||!primary||!consumedPrimarySourceResultMatches(sourceResult,reservation)||!seasonalityAlignedResultMatches(result,sourceResult.scene,primary))return;
   const input=array(own(own(this.chart,'orchestrator'),'bars')),count=primary.length;if(!count||input.length!==count||own(model,'settings')!==settings||own(model,'result')!==result||own(model,'acceptedOutput')!==output)return;
   if(!lease.scene||lease.scene.phase!=='returned'||!lease.scene.native||lease.scene.result!==result||lease.scene.output!==output)return;
   this.assertSceneRecord(lease,lease.scene);
   const native=nativeOwner(this.chart,model,output);if(!native||!native.isCurrent()||!this.source())return;
   const source=()=>{reservation.assertCurrent();if(!consumedPrimarySourceResultMatches(sourceResult,reservation))throw missing();};source();
   const metadata=catalogDefinition(settings.kind)!,keys=metadata.inputs.map(row=>row.key),groups=[group(settings,['kind','offset','visible']),group(settings.inputs,keys)];
   if(settings.presentation)groups.push(group(settings.presentation,['precision']));
   const plots:Plot[]=result.series.map((row,index)=>{const override=own(settings.plots,row.id,true),style=override??defaultPlotStyle(settings.kind,row.id,index);if(override)groups.push(group(style,['visible','color','legend','dataWindow']));return{id:row.id,override,source:row,values:row.values,count,label:row.label,color:own(style,'color'),legend:own(style,'visible')&&(own(style,'legend',true)??true),dataWindow:own(style,'visible')&&(own(style,'dataWindow',true)??true)};});
   if(plots.length!==4||plots.some(row=>row.values.length!==count||!Object.isFrozen(row.values)))return;
   const core=own(this.chart,'orchestrator'),last=own(primary,String(count-1)),nativeLast=own(input,String(count-1)),lastTime=own(last,'time'),nativeTime=own(nativeLast,'time');
   const frame=()=>this.inputBars?.()===primary&&own(primary,'length')===count&&own(primary,String(count-1))===last&&own(last,'time')===lastTime&&own(this.chart,'orchestrator')===core&&own(core,'bars')===input&&own(input,'length')===count&&own(input,String(count-1))===nativeLast&&own(nativeLast,'time')===nativeTime;
   token=Object.freeze({plot(){},value(){},finishPlot(){}});
   const sourceTimes=seasonalityAlignedTimes(result);if(!sourceTimes||sourceTimes.length!==count)return;
   const state:State={sourceTimes,acceptedDraft:token,version:++this.version,model,owned:()=>lease.live&&lease.model===model&&lease.owned?.()===true,settings,result,output,input,primary,source,style:'source-owned',frame,inputs:settings.inputs,styles:settings.plots,presentation:settings.presentation,timeframe:settings.presentation?.timeframe,epoch:this.epoch,groups,plots:Object.freeze(plots),series:result.series,native,count,precision,title:'Seasonality',visible:settings.visible,W:0,U:0,view:null};
   source();if(!frame()||!native.isCurrent()||!state.owned())return;this.drop(model);source();if(!native.isCurrent())return;this.states.set(model,state);return token;
  }catch{return;}
 }
 private clearAll(){this.pruneSources();for(const draft of this.active)this.release(draft);this.states=new WeakMap();this.epoch={};this.W=0;this.U=0;this.epochSource=null;}
 reconcile(budget:BuiltinProducerBudget){
  // Optional source service yields first. Admission of a source itself never clears accepted scalar state.
  if(budget.operations+this.W+this.pendingW+this.sourceAcceptedW+this.sourcePendingW>INDICATOR_BATCH_WORK_LIMIT||budget.numericSlots+this.U+this.pendingSlots+this.sourceAcceptedU+this.sourcePendingSlots>INDICATOR_BATCH_OUTPUT_LIMIT)this.releaseSources();
  if(budget.operations+this.W+this.pendingW>INDICATOR_BATCH_WORK_LIMIT||budget.numericSlots+this.U+this.pendingSlots>INDICATOR_BATCH_OUTPUT_LIMIT)this.clearAll();
  if(budget.operations+this.W+this.pendingW+this.sourceAcceptedW+this.sourcePendingW>INDICATOR_BATCH_WORK_LIMIT||budget.numericSlots+this.U+this.pendingSlots+this.sourceAcceptedU+this.sourcePendingSlots>INDICATOR_BATCH_OUTPUT_LIMIT)throw Error('The study batch still owns a Seasonality scene above the current shared budget. Reduce its history/year range or remove it before adding this study.');
 }
 private source(){if(!this.publication||this.closed)return false;this.publication.assertMutable?.();if(this.epochSource&&!this.epochSource.isCurrent())this.clearAll();if(!this.epochSource)this.epochSource=this.publication.captureOwner();return this.epochSource.isCurrent();}
 private release(draft:Draft){if(draft.released)return;draft.released=true;this.pendingW-=draft.W;this.pendingSlots-=draft.U+draft.K;this.active.delete(draft);this.drafts.delete(draft.token);draft.plots=[];draft.groups=[];draft.bars=[];draft.input=[];draft.primary=[];draft.rowLists=undefined;draft.series=[];draft.source=()=>{throw missing();};draft.frame=()=>false;draft.owned=()=>false;}
 drop(model:object){const state=this.states.get(model),drafts=[...this.active].filter(draft=>draft.model===model);if(state){this.W-=state.W;this.U-=state.U;this.states.delete(model);}this.pruneSources(model);for(const draft of drafts)this.release(draft);}
 hooks(model:object,owned:()=>boolean):BuiltinModelHooks{return{retire:()=>this.drop(model),retireAccepted:token=>{if(token&&this.states.get(model)?.acceptedDraft===token)this.drop(model);},prepare:(settings,result,raw,bars,input,budget,source,style)=>this.prepare(model,owned,settings,result,raw,bars,input,budget,source,style),prepareVwap:(settings,result,raw,bars,input,budget,source,style,inputFieldCount)=>this.prepareVwap(model,owned,settings,result,raw,bars,input,budget,source,style,inputFieldCount),accept:(token,result,output,precision)=>this.accept(token,result,output,precision),abort:token=>{if(token){const draft=this.drafts.get(token);if(draft)this.release(draft);}},renew:()=>this.renew(model)};}
 private prepare(model:object,owned:()=>boolean,settings:IndicatorInstanceSettings,result:IndicatorResult,raw:readonly Bar[],bars:readonly Bar[],input:readonly unknown[],budget:BuiltinProducerBudget,source:()=>void,style:string|undefined,asynchronous=false,inputFieldCount=0):BuiltinNumericDraft|undefined{
  let reserved:Draft|undefined;
  try{
   if(!this.source()||!owned()||(!asynchronous&&!eligible(settings)||asynchronous&&(settings.kind!=='vwap'||settings.inputs.kernelVersion!==2||isVwapEventAnchor(settings.inputs.anchor)))||typeof style!=='string'||isDerivedStyle(style))return;source();
   const series=array(own(result,'series')),N=own(array(bars),'length'),P=own(series,'length'),native=array(input),primary=array(this.inputBars?.());if(!Number.isSafeInteger(N)||N<1||N>100000||P<1||P>indicatorPlotIds[settings.kind].length||native.length!==N||primary.length!==N||raw!==primary)return;
   const V=N*P,G=asynchronous?2*P+9:0,H=asynchronous?8192*(inputFieldCount+1):0,W=64*N+16*V+128*P+256+H*G,U=(asynchronous?192+16*(inputFieldCount+1):128)+32*P,K=(asynchronous?80:64)+8*P;if(![V,W,U,K,budget.operations,budget.numericSlots].every(Number.isSafeInteger)||V>INDICATOR_OUTPUT_LIMIT||budget.operations<0||budget.numericSlots<0)return;
   // Reconciliation replaces an obsolete weak ledger; it never scans historical arrays.
   this.reconcile(budget);
   if(!this.source())return;
   // A later real scalar calculation may reclaim optional source headroom, preserving its accepted normal proof.
   if(budget.operations+this.W+this.pendingW+this.sourceAcceptedW+this.sourcePendingW+W>INDICATOR_BATCH_WORK_LIMIT||budget.numericSlots+this.U+this.pendingSlots+this.sourceAcceptedU+this.sourcePendingSlots+U+K>INDICATOR_BATCH_OUTPUT_LIMIT)this.releaseSources();
   if(!this.source()||budget.operations+this.W+this.pendingW+this.sourceAcceptedW+this.sourcePendingW+W>INDICATOR_BATCH_WORK_LIMIT||budget.numericSlots+this.U+this.pendingSlots+this.sourceAcceptedU+this.sourcePendingSlots+U+K>INDICATOR_BATCH_OUTPUT_LIMIT)return;
   const token:BuiltinNumericDraft={plot:(plot,index)=>this.plot(token,plot,index),value:(plot,index,value)=>this.value(token,plot,index,value),sealedValues:(plot,values)=>this.sealedValues(token,plot,values),finishPlot:index=>this.finishPlot(token,index)};
   const draft:Draft={token,model,owned,settings,result,bars,input,primary,source,style,frame:()=>false,epoch:this.epoch,groups:[],inputs:settings.inputs,styles:settings.plots,presentation:settings.presentation,timeframe:settings.presentation?own(settings.presentation,'timeframe',true):undefined,plots:[],series,count:N,plotCount:P,seen:0,W,U,K,asynchronous,haOpen:undefined,haClose:undefined,valid:true,released:false,metadataSlots:0,rowLists:this.rowCaches};reserved=draft;this.drafts.set(token,draft);this.active.add(draft);this.pendingW+=W;this.pendingSlots+=U+K;
   const core=own(this.chart,'orchestrator');if(own(core,'bars')!==input)throw missing();const last=own(input,String(N-1)),frameKeys=['time','open','high','low','close','volume'] as const,frameValues=frameKeys.map(key=>own(last,key,true)),primaryLast=own(primary,String(N-1)),primaryValues=frameKeys.map(key=>own(primaryLast,key,true));
   draft.frame=()=>this.inputBars?.()===primary&&own(primary,'length')===N&&own(primary,String(N-1))===primaryLast&&frameKeys.every((key,index)=>Object.is(own(primaryLast,key,true),primaryValues[index]))&&own(this.chart,'orchestrator')===core&&own(core,'bars')===input&&own(input,'length')===N&&own(input,String(N-1))===last&&frameKeys.every((key,index)=>Object.is(own(last,key,true),frameValues[index]));
   // These keys come from bounded trusted catalog/default declarations, never an unknown output/input array.
   const declared=catalogDefinition(settings.kind)?.inputs,coreKeys=declared?null:Object.keys(indicatorDefaults[settings.kind]),keyCount=declared?.length??coreKeys!.length+3;
   const settingsKeys=['kind','offset','visible','pane','ownScale','scalePlacement','scaleGroup'] as const;
   const metadataSlots=96+keyCount*2+settingsKeys.length*2+14*P+(draft.timeframe?9:0);if(metadataSlots>U)throw missing();
   const keys=declared?declared.map(row=>row.key):[...coreKeys!,'divergence','maType','kernelVersion'];
   draft.groups=[group(settings,settingsKeys),group(settings.inputs,keys)];if(settings.presentation)draft.groups.push(group(settings.presentation,['precision']));if(draft.timeframe)draft.groups.push(group(draft.timeframe,['schemaVersion','interval','waitForClose']));draft.metadataSlots=metadataSlots;
   if(!this.valid(draft))throw missing();return token;
  }catch{if(reserved)this.release(reserved);return;}
 }
 private prepareVwap(model:object,owned:()=>boolean,settings:IndicatorInstanceSettings,result:IndicatorResult,raw:readonly Bar[],bars:readonly Bar[],input:readonly unknown[],budget:BuiltinProducerBudget,source:()=>void,style:string|undefined,inputFieldCount:number):BuiltinNumericDraft|undefined{
  if(!Number.isSafeInteger(inputFieldCount)||inputFieldCount<1||inputFieldCount>64)return;
  const token=this.prepare(model,owned,settings,result,raw,bars,input,budget,source,style,true,inputFieldCount);if(!token)return;const draft=this.drafts.get(token);if(!draft)return;
  try{for(let plot=0;plot<draft.plotCount;plot++){const row=own(draft.series,String(plot));this.plot(token,row,plot);if(!draft.valid)throw missing();const values=own(row,'values');for(let index=0;index<draft.count;index++){this.value(token,plot,index,own(values,String(index)));if(!draft.valid)throw missing();}this.finishPlot(token,plot);if(!draft.valid)throw missing();}if(!this.valid(draft))throw missing();return token;}catch{this.release(draft);return;}
 }
 private valid(draft:Draft):boolean{if(draft.released||!draft.valid||this.closed||draft.epoch!==this.epoch)return false;try{draft.source();return draft.owned()&&this.epochSource?.isCurrent()===true&&own(draft.model,'settings')===draft.settings&&own(draft.model,'ctx')!==null&&draft.frame()&&own(draft.settings,'inputs')===draft.inputs&&own(draft.settings,'plots')===draft.styles&&own(draft.settings,'presentation',true)===draft.presentation&&(!draft.presentation||own(draft.presentation,'timeframe',true)===draft.timeframe)&&draft.groups.every(groupCurrent);}catch{return false;}}
 private plot(token:BuiltinNumericDraft,plot:IndicatorSeries,index:number){const draft=this.drafts.get(token);if(!draft||!this.valid(draft))return;try{
  if(index!==draft.plots.length||own(draft.series,String(index))!==plot||draft.plots.length>=draft.plotCount)throw missing();
  const values=array(own(plot,'values')),id=own(plot,'id'),label=own(plot,'label');if(values.length!==draft.count||typeof id!=='string'||typeof label!=='string')throw missing();
  const override=own(draft.settings.plots,id,true),style=override??defaultPlotStyle(draft.settings.kind,id,index);if(override)draft.groups.push(group(style,['color','legend','dataWindow']));
  const color=own(style,'color'),legend=own(style,'legend',true)??true,dataWindow=own(style,'dataWindow',true)??true;if(typeof color!=='string'||typeof legend!=='boolean'||typeof dataWindow!=='boolean')throw missing();
  draft.plots.push({id,override,source:plot,values,count:0,label,color,legend,dataWindow,sealed:isSealedIndicatorValues(values)});
 }catch{draft.valid=false;}}
 private value(token:BuiltinNumericDraft,plot:number,index:number,value:number|null){const draft=this.drafts.get(token);if(!draft||draft.released||!draft.valid||this.closed||draft.epoch!==this.epoch)return;try{
  const row=draft.plots[plot];if(!row||index!==row.count||index>=draft.count||value!==null&&(typeof value!=='number'||!Number.isFinite(value))||!Object.is(row.sealed?row.values[index]:own(row.values,String(index)),value))throw missing();
  if(plot===0)this.rowCheck(draft,index);
  // Only already-owned numerical output indices are locked. Native/source rows are never modified.
  if(!row.sealed)Object.defineProperty(row.values,String(index),{value,writable:false,configurable:false});row.count++;
 }catch{draft.valid=false;}}
 /** The first plot's row checks at one index (throws on a failed check). Admitted plain rows are read directly. */
 private rowCheck(draft:Draft,index:number):void{
  if(!draft.asynchronous&&plainRowsMatch(draft,index))return;
  {const native=own(draft.input,String(index)),bar=own(draft.bars,String(index)),primary=own(draft.primary,String(index)),time=number(own(bar,'time'));if(!Object.is(number(own(native,'time'))/1000,time)||!Object.is(number(own(primary,'time')),time)||index&&time<=number(own(own(draft.bars,String(index-1)),'time')))throw missing();if(draft.asynchronous){for(const key of BAR_VALUE_KEYS)if(!Object.is(barNumber(own(bar,key,key==='volume'),key),barNumber(own(primary,key,key==='volume'),key)))throw missing();}
   if(draft.asynchronous&&draft.style==='heikinashi'){const open=number(own(primary,'open')),high=number(own(primary,'high')),low=number(own(primary,'low')),close=number(own(primary,'close')),haClose=(open+high+low+close)/4,haOpen=draft.haOpen===undefined?(open+close)/2:(draft.haOpen+draft.haClose!)/2;
    if(![haOpen,haClose].every(Number.isFinite)||!Object.is(number(own(native,'open')),haOpen)||!Object.is(number(own(native,'high')),Math.max(high,haOpen,haClose))||!Object.is(number(own(native,'low')),Math.min(low,haOpen,haClose))||!Object.is(number(own(native,'close')),haClose)||!Object.is(barNumber(own(native,'volume',true),'volume'),barNumber(own(primary,'volume',true),'volume')))throw missing();draft.haOpen=haOpen;draft.haClose=haClose;
   }else for(const key of BAR_VALUE_KEYS)if(!Object.is(barNumber(own(native,key,key==='volume'),key),barNumber(own(draft.style==='heikinashi'?bar:primary,key,key==='volume'),key)))throw missing();
  }
 }
 /**
  * Value() for every index of a sealed plot in one call (renderIndicatorSeries). The checks per index are value()'s:
  * the next index in order, inside the draft count, finite or null, and the first plot's row checks; a sealed array is
  * immutable, so its indices are neither re-read through descriptors nor locked again. Any failure invalidates the draft.
  */
 private sealedValues(token:BuiltinNumericDraft,plot:number,values:readonly (number|null)[]){const draft=this.drafts.get(token);if(!draft||draft.released||!draft.valid||this.closed||draft.epoch!==this.epoch)return;try{
  const row=draft.plots[plot],count=draft.count;if(!row||!row.sealed||row.values!==values||row.count!==0)throw missing();
  for(let index=0;index<values.length;index++){const value=values[index];if(index>=count||value!==null&&(typeof value!=='number'||!Number.isFinite(value)))throw missing();}
  if(plot===0){let index=0;while(index<values.length){index=plainRowSweep(draft,index,values.length);if(index<values.length){this.rowCheck(draft,index);index++;}}}
  row.count=values.length;
 }catch{draft.valid=false;}}
 private finishPlot(token:BuiltinNumericDraft,index:number){const draft=this.drafts.get(token);if(!draft||!this.valid(draft))return;try{const row=draft.plots[index];if(!row||row.count!==draft.count)throw missing();if(!row.sealed)Object.defineProperty(row.values,'length',{writable:false});draft.seen++;}catch{draft.valid=false;}}
 private accept(token:BuiltinNumericDraft|undefined,result:IndicatorResult,output:object,precision:IndicatorPrecision){if(!token)return;const draft=this.drafts.get(token);if(!draft)return;try{
  if(!this.valid(draft)||result!==draft.result||draft.seen!==draft.plotCount||draft.plots.length!==draft.plotCount||own(draft.model,'result')!==result||own(draft.model,'acceptedOutput')!==output)return;
  const native=nativeOwner(this.chart,draft.model,output);if(!native||!native.isCurrent()||!this.valid(draft))return;
  const state:State={acceptedDraft:token,version:++this.version,model:draft.model,owned:draft.owned,settings:draft.settings,result,output,input:draft.input,primary:draft.primary,source:draft.source,style:draft.style,frame:draft.frame,inputs:draft.inputs,styles:draft.styles,presentation:draft.presentation,timeframe:draft.timeframe,epoch:draft.epoch,groups:draft.groups,plots:Object.freeze(draft.plots),series:draft.series,native,count:draft.count,precision,title:title(draft.settings.kind),visible:own(draft.settings,'visible'),W:draft.W,U:draft.U,view:null};
  this.states.set(draft.model,state);this.W+=state.W;this.U+=state.U;this.pruneSources(draft.model);
 }catch{/* Optional proof never rejects an accepted calculation. */}finally{this.release(draft);}}
 private renew(model:object){const state=this.states.get(model);if(!state)return;try{state.source();if(state.epoch!==this.epoch||!state.owned()||!state.frame()||!state.native.sameIncarnation()||own(model,'result')!==state.result||own(model,'acceptedOutput')!==state.output)throw missing();const native=nativeOwner(this.chart,model,state.output);if(!native)throw missing();const fresh={...state,version:++this.version,native,view:null};this.states.set(model,fresh);}catch{this.drop(model);}}
 capture(model:object|null):BuiltinReadoutSnapshot{const state=model?this.states.get(model):undefined;if(!model||!state)return Object.freeze({state:'unavailable',message:missing().message});try{if(!state.native.isCurrent())throw missing();if(!state.native.mounted())return{state:'unavailable',message:'Waiting for the current study pane.'};this.read(model,state.version);if(state.view)return state.view;const key={};views.set(key,{owner:new WeakRef(this),model:new WeakRef(model),version:state.version});return state.view=makeView(key);}catch{if(model)this.drop(model);return Object.freeze({state:'unavailable',message:missing().message});}}
 read(model:object,version:number,time?:number,query=false):BuiltinReadoutValue|undefined{
  const state=this.states.get(model);if(!state||state.version!==version)throw missing();const assert=()=>{this.publication?.assertMutable?.();state.source();if(this.closed||state.epoch!==this.epoch||this.states.get(model)!==state||!state.owned()||!state.frame()||!state.native.isCurrent()||!state.native.mounted()||own(model,'settings')!==state.settings||own(state.settings,'inputs')!==state.inputs||own(state.settings,'plots')!==state.styles||own(state.settings,'presentation',true)!==state.presentation||state.presentation&&own(state.presentation,'timeframe',true)!==state.timeframe||own(model,'result')!==state.result||own(model,'acceptedOutput')!==state.output||own(state.result,'series')!==state.series||!state.groups.every(groupCurrent))throw missing();for(let i=0;i<state.plots.length;i++){const plot=state.plots[i];if(own(state.series,String(i))!==plot.source||own(plot.source,'values')!==plot.values||own(plot.source,'id')!==plot.id||own(plot.source,'label')!==plot.label||own(state.styles,plot.id,true)!==plot.override||own(plot.values,'length')!==state.count||Object.getPrototypeOf(plot.values)!==Array.prototype)throw missing();}};
  try{assert();if(!query)return;if(typeof time!=='number'||!Number.isFinite(time))throw new QueryError('Choose a finite loaded calculation time.');let low=0,high=state.count-1,index=-1;while(low<=high){const mid=(low+high)>>>1,value=state.sourceTimes?number(own(state.sourceTimes,String(mid))):number(own(own(state.primary,String(mid)),'time'));if(value===time){index=mid;break;}if(value<time)low=mid+1;else high=mid-1;}if(index<0)throw new QueryError('Study values are unavailable outside the accepted calculation rows.');
   // Ordinary/HA calculation times were proven identical to this private raw grid at acceptance.
   const selected=()=>{if(state.sourceTimes&&!Object.is(number(own(state.sourceTimes,String(index))),time)||!Object.is(number(own(own(state.primary,String(index)),'time')),time)||!Object.is(number(own(own(state.input,String(index)),'time'))/1000,time))throw missing();};selected();
   const plots=state.plots.map(plot=>Object.freeze({label:plot.label,color:plot.color,value:own(plot.values,String(index)) as number|null,legend:plot.legend,dataWindow:plot.dataWindow}));selected();assert();return Object.freeze({title:state.title,paneId:state.native.paneId,visible:state.visible,precision:state.precision,time,plots:Object.freeze(plots)});
  }catch(error){if(!(error instanceof QueryError))this.drop(model);throw error;}
 }
 dispose(){this.closed=true;this.rowCaches=[[],[],[]];for(const record of [...this.settlementWaits])try{this.retireSettlementWait(record);}catch{/* Failed observer cleanup stays funded; closed waiters cannot wake. */}this.releaseSources(undefined,true);this.clearAll();this.publication=undefined;this.inputBars=undefined;}
}
