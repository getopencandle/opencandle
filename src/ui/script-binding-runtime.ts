import {captureScriptPresentationJob,scriptPresentationExecutionMode,stageScriptPresentationResult,acceptScriptPresentationJob,finishScriptPresentationJob,renewScriptPresentationPort,retireScriptPresentationPort,retireScriptPresentationBinding,type ScriptPresentationDispatch} from '../chart/script-presentation-proof';
import {captureScriptCsvJobProof,stageScriptCsvJobResult,acceptScriptCsvJobProof,scriptCsvJobOwnerKey,type ScriptCsvJobOwner} from '../chart/script-csv-job-proof';
import type {ChartController} from '../chart/adapter';
import type {Bar} from '../domain/types';
import {restoreScriptBindings,type ScriptBinding} from './script-library';
import type {ScriptInteraction} from '../chart/script-port';
import {executeScriptOnBars,scriptRunBars,SCRIPT_BAR_LIMIT,SCRIPT_TAIL_NOTE,type ScriptResult} from './script-jobs';
import {declaresScriptRequests,type ScriptRequestBase} from './script-requests';
import {scriptOutputEntry,scriptOutputs} from './script-outputs';
import {linkedSignal,scriptNeedsEngineFeed,type ScriptEngineRerun} from '../strategy-report/feedback';
import {scriptBarsKey} from './script-bars-key';
export interface ScriptBindingExecution {bindingId:string;result:ScriptResult;bars:Bar[];barIds:string[];sourceCode:string;identity:string;fixture:boolean;/** Reruns this calculation with an engine feed; present only when the source reads ctx.strategy or defines onFill. */rerun?:ScriptEngineRerun}
export interface BindingStatus {id:string;name:string;status:'waiting'|'running'|'ready'|'error';message:string}
/** RequestBase names the chart for ctx.request; requestRevision changes when the loaded data behind requests changes. */
type Context={chartPositionMode?:'logical-v1';bars:readonly Bar[];identity:string;fixture:boolean;bindings:readonly ScriptBinding[];ready:boolean;requestBase?:ScriptRequestBase|null;requestRevision?:number;csvJobOwner?:ScriptCsvJobOwner};
export type ScriptConfigurationContext=Omit<Context,'ready'|'requestBase'|'requestRevision'>;
export interface ScriptConfigurationStatus {state:'pending'|'ready'|'error';diagnostics:string[];calculations:'pending'|'complete'|'error'}
/** Equal exactly when [identity, fixture, the bars a run reads] stringify equally; see script-bars-key.ts. */
const inputKey=(context:Pick<Context,'identity'|'fixture'|'bars'>)=>JSON.stringify([context.identity,context.fixture])+(context.bars.length>SCRIPT_BAR_LIMIT?'|tail':'|')+scriptBarsKey(scriptRunBars(context.bars));
const plotsKey=(plots:ScriptBinding['plots'])=>JSON.stringify(Object.keys(plots).sort().map(id=>{const style=plots[id];return[id,style.visible,style.color,style.width,style.lineStyle,style.kind,style.priceScale,style.legend,style.dataWindow];}));
const bindingsKey=(bindings:readonly ScriptBinding[])=>JSON.stringify(restoreScriptBindings(bindings).map(binding=>({...binding,plots:plotsKey(binding.plots)})));
/** The script execution limit (script-jobs.ts and the worker refuse more rows). */
export {SCRIPT_BAR_LIMIT,SCRIPT_TAIL_NOTE};
/** The ready status of a run: its plot count and bars, plus the plain note when it read only the newest bars. */
export const scriptReadyMessage=(plots:number,bars:number,trimmed:boolean)=>plots+' plots on '+bars+' supplied bars.'+(trimmed?' '+SCRIPT_TAIL_NOTE:'');
type Executor=typeof executeScriptOnBars;
type Placement={pane:'price'|'new';paneId:string|null;ownScale:boolean};
const placement=(binding:ScriptBinding):Placement=>({pane:binding.pane,paneId:binding.paneId??null,ownScale:binding.ownScale??false});
const failureText=(error:unknown,plain=false):string=>{try{const value=plain&&error instanceof Error?error.message:String(error);return typeof value==='string'?value.slice(0,2000):'Script operation failed.';}catch{return'Script operation failed while reading its error message.';}};
type Entry={binding:ScriptBinding;key:string;controller:AbortController;status:BindingStatus;rendered:boolean;renderedName?:string;appliedPlacement?:Placement;appliedTablePlacement?:'bottom';acceptedKey?:string;requestedKey?:string;presentationGeneration?:object;metadataError?:string;metadataAttempt?:string};
type PresentationVerifier=(value:unknown,port:object,ticket:object)=>Readonly<ScriptPresentationDispatch>|null;
const presentationIssuer:Readonly<{verify?:PresentationVerifier}>=Object.create(null);
/** Immutable ESM wrapper; no public property or caller registration controls the issuer. */
export function readScriptPresentationDispatch(value:unknown,port:object,ticket:object):Readonly<ScriptPresentationDispatch>|null{return presentationIssuer.verify?.(value,port,ticket)??null;}
export type ScriptExpectedCalculation={kind:'accepted-calculation';identity:string;fixture:boolean;capture:(context?:ScriptConfigurationContext)=>Readonly<{bars:readonly Bar[];isCurrent:()=>boolean}>|null};
type ScriptContextGate={input:string|null;bindings:string;calculation?:ScriptExpectedCalculation};
type PresentationRequest={source:string;version:number;documentId:string;inputs:string;requests:string|null;positionMode?:'logical-v1';generation:object};
export interface ScriptTransactionLease {readonly changed:boolean;pauseAndCapture:()=>void;stage:()=>void;rollback:()=>void;resume:(committed:boolean)=>void;abandon:(message:string)=>void}
/** Owns only its cell's render IDs. Saved values contain source/settings, never computed results. */
export class ScriptBindingRuntime{
 #presentationPort:ChartController['scripts'];
 #presentationTickets=new WeakMap<object,Readonly<ScriptPresentationDispatch>>();
 #presentationRequests=new Map<string,PresentationRequest>();
 #presentationOwnerKey:string|null=null;
 private entries=new Map<string,Entry>();private retired=new Map<string,BindingStatus>();private disposed=false;private dataKey='';private dataEpoch=0;private held:symbol|null=null;private contextGate:ScriptContextGate|null=null;private retireHeldExpectation:(()=>void)|null=null;
 private contextReady=false;private configurationListeners=new Set<()=>void>();private configurationOff:(()=>void)|null=null;private configurationSubscription:symbol|null=null;private observerFailure:string|null=null;
 private scopeDepth=0;private nativeDepth=0;private contextRevision=0;private requestedContextKey='';private queuedContext:Context|null=null;private drainTimer:ReturnType<typeof setTimeout>|null=null;private draining=false;private disposePending=false;
 private completing=new Set<Entry>();
 constructor(private port:ChartController['scripts'],private publish:(rows:BindingStatus[])=>void,private onResult:(value:ScriptBindingExecution)=>void=()=>{},private execute:Executor=executeScriptOnBars,private requestContext:()=>void=()=>{}){this.#presentationPort=port;}
 // Only this class's static initialization installs the module-private verifier, exactly once.
 static {
  Object.defineProperty(presentationIssuer,'verify',{value:(value:unknown,port:object,ticket:object):Readonly<ScriptPresentationDispatch>|null=>{
   if(!value||typeof value!=='object'||!(#presentationTickets in value))return null;
   const runtime=value as ScriptBindingRuntime;if(runtime.#presentationPort!==port)return null;return runtime.#presentationTickets.get(ticket)??null;
  },writable:false,configurable:false});Object.freeze(presentationIssuer);
 }
 private preparePresentationRequests(context:Context,input:string,ownerKey:string|null){
  const changed=input!==this.dataKey||ownerKey!==this.#presentationOwnerKey||!context.ready;
  if(changed){retireScriptPresentationPort(this.port);this.#presentationOwnerKey=ownerKey;}
  const wanted=new Set<string>(),requests=JSON.stringify([context.requestRevision??0,context.requestBase??null]);
  for(const binding of context.bindings){
   wanted.add(binding.id);const previous=this.#presentationRequests.get(binding.id),inputs=JSON.stringify(binding.inputs??null),request=declaresScriptRequests(binding.source)?requests:null;
   if(!changed&&previous&&previous.source===binding.source&&previous.version===binding.version&&previous.documentId===binding.documentId&&previous.inputs===inputs&&previous.requests===request&&previous.positionMode===context.chartPositionMode)continue;
   this.#presentationRequests.set(binding.id,{source:binding.source,version:binding.version,documentId:binding.documentId,inputs,requests:request,positionMode:context.chartPositionMode,generation:{}});retireScriptPresentationBinding(this.port,binding.id);
  }
  for(const id of this.#presentationRequests.keys())if(!wanted.has(id)){this.#presentationRequests.delete(id);retireScriptPresentationBinding(this.port,id);}
 }
 private configurationChanged(){const revision=this.contextRevision;if(this.disposed)return;for(const fn of [...this.configurationListeners]){if(this.disposed||this.contextRevision!==revision)return;try{fn();}catch(error){const message=failureText(error).slice(0,500);if(!this.disposed&&this.contextRevision===revision)this.observerFailure='Script readiness observer failed: '+message;}}}
 private emit(){const revision=this.contextRevision;if(!this.disposed&&!this.held)this.publish([...this.retired.values(),...[...this.entries.values()].map(row=>({...row.status}))]);if(!this.disposed&&this.contextRevision===revision)this.configurationChanged();}
 private scope<T>(operation:()=>T):T{this.scopeDepth++;try{return operation();}finally{this.scopeDepth--;if(!this.scopeDepth){if(this.disposed)this.finishDispose();else this.drainContext();}}}
 private drainContext(){
  if(this.scopeDepth||this.draining||this.disposed||this.held||!this.queuedContext)return;
  const context=this.queuedContext;this.queuedContext=null;this.draining=true;
  try{this.update(context);}finally{this.draining=false;if(this.queuedContext&&!this.disposed&&!this.held&&!this.drainTimer)this.drainTimer=setTimeout(()=>{this.drainTimer=null;this.drainContext();},0);}
 }
 private native<T>(operation:()=>T):T{
  this.nativeDepth++;let hold:ReturnType<ChartController['scripts']['beginExternalTransaction']>|undefined,value!:T,failed=false,problem:unknown;
  try{if(typeof this.port.beginExternalTransaction==='function')hold=this.port.beginExternalTransaction();value=operation();}catch(error){failed=true;problem=error;}
  try{hold?.release(!failed);}catch(error){problem=failed?new AggregateError([problem,error],'Script native operation and notification release failed'):error;failed=true;}
  this.nativeDepth--;if(failed)throw problem;return value;
 }
 subscribeConfigurationStatus(callback:()=>void){
  if(this.disposed)throw new Error('Script runtime is disposed.');
  if(typeof callback!=='function')throw new Error('A script readiness callback is required.');
  if(!this.configurationOff){if(typeof this.port.subscribe!=='function')throw new Error('Native script readiness observation is unavailable.');const token=Symbol('readiness subscription');this.configurationSubscription=token;try{this.configurationOff=this.port.subscribe(()=>{if(this.configurationSubscription===token)this.configurationChanged();});}catch(error){if(this.configurationSubscription===token)this.configurationSubscription=null;throw error;}}
  this.configurationListeners.add(callback);let active=true;return()=>{if(!active)return;active=false;this.configurationListeners.delete(callback);if(!this.configurationListeners.size&&this.configurationOff){const off=this.configurationOff;this.configurationOff=null;this.configurationSubscription=null;off();}};
 }
 configurationStatus(context:ScriptConfigurationContext):ScriptConfigurationStatus{
  const pending=(message:string):ScriptConfigurationStatus=>({state:'pending',calculations:'pending',diagnostics:[message]});
  if(this.disposed)return{state:'error',calculations:'error',diagnostics:['Script runtime is disposed.']};
  if(this.observerFailure)return{state:'error',calculations:'error',diagnostics:[this.observerFailure]};
  try{
   const expected=restoreScriptBindings(context.bindings);
   if(this.held||this.contextGate||!this.contextReady||inputKey(context)!==this.dataKey||bindingsKey(expected)!==bindingsKey([...this.entries.values()].map(entry=>entry.binding)))return pending('Waiting for the exact script input and binding configuration.');
   const entries=[...this.entries.values()],failed=entries.filter(entry=>entry.status.status==='error'),calculations=entries.every(entry=>!!entry.key&&entry.acceptedKey===entry.key)?'complete':failed.some(entry=>!entry.metadataError)?'error':'pending';
   const diagnostics=[...this.retired.values()].map(row=>row.message).concat(failed.map(entry=>entry.status.message));
   if(this.retired.size||entries.some(entry=>entry.metadataError))return{state:'error',calculations,diagnostics};
   const native=this.port as typeof this.port&{configurationSnapshot?:()=>Array<{id:string;title:string;pane:'price'|'new';paneId?:string|null;ownScale?:boolean;tablePlacement?:'bottom';visible:boolean;plots:ScriptBinding['plots']}>};
   if(typeof native.configurationSnapshot!=='function'||typeof native.placementStatus!=='function')return{state:'error',calculations,diagnostics:[...diagnostics,'Native script configuration inspection is unavailable.']};
   const snapshot=native.configurationSnapshot(),byId=new Map(snapshot.map(row=>[row.id,row]));
   if(byId.size!==snapshot.length||snapshot.some(row=>!this.entries.has(row.id)))return{state:'error',calculations,diagnostics:[...diagnostics,'Native script configuration contains duplicate or unowned handles.']};
   for(const binding of expected){const entry=this.entries.get(binding.id)!,row=byId.get(binding.id);if(!row||!entry.rendered)return{state:failed.length?'error':'pending',calculations,diagnostics:[...diagnostics,'Configured script handle is not placed: '+binding.id]};
    if(row.title!==binding.name||row.pane!==binding.pane||binding.paneId!==null&&binding.paneId!==undefined&&row.paneId!==binding.paneId||(row.ownScale??false)!==(binding.ownScale??false)||row.visible!==binding.visible||row.tablePlacement!==binding.tablePlacement||plotsKey(row.plots)!==plotsKey(binding.plots))return{state:'error',calculations,diagnostics:[...diagnostics,'Native script settings disagree with the saved binding: '+binding.id]};
   }
   const placement=this.port.placementStatus();if(!placement.ready)return{state:'pending',calculations,diagnostics:[...diagnostics,...placement.diagnostics]};
   return{state:'ready',calculations,diagnostics};
  }catch(error){return{state:'error',calculations:'error',diagnostics:[String(error)]};}
 }
 /** The chart owner restores accepted native results before rollback() restores runtime ownership. */
 prepareBindings(desired:readonly ScriptBinding[],expected?:Pick<Context,'identity'|'fixture'|'bars'>|ScriptExpectedCalculation):ScriptTransactionLease{
  const bindings=restoreScriptBindings(desired);let calculation=expected&&'kind' in expected?expected:undefined;const expectedInput=expected&&!('kind' in expected)?inputKey(expected):null,token=Symbol('script transaction');expected=undefined;let phase:'created'|'paused'|'staging'|'staged'|'rolledback'|'released'='created';
  let captured:{entries:Map<string,Entry>;retired:Map<string,BindingStatus>;dataKey:string;dataEpoch:number;contextReady:boolean;gate:ScriptContextGate|null}|null=null;
  const owned=()=>{if(this.disposed||this.held!==token)throw new Error('Script transaction no longer owns this chart.');},changed=()=>!!calculation||this.retired.size>0||expectedInput!==null&&expectedInput!==(captured?.dataKey??this.dataKey)||bindingsKey([...this.entries.values()].map(entry=>entry.binding))!==bindingsKey(bindings);
  return {
   get changed(){return changed();},
   abandon:(message:string)=>{owned();for(const entry of this.entries.values()){entry.key='';entry.acceptedKey=undefined;entry.controller.abort();owned();entry.metadataError=undefined;entry.metadataAttempt=undefined;entry.status={...entry.status,status:'error',message};}this.contextGate=null;calculation=undefined;this.retireHeldExpectation=null;this.dataKey='';this.dataEpoch++;phase='released';this.held=null;captured=null;const revision=this.contextRevision;this.scope(()=>{this.emit();if(!this.disposed&&!this.held&&this.contextRevision===revision)this.requestContext();});},
   pauseAndCapture:()=>{if(this.disposed||this.held||phase!=='created')throw new Error('Script transaction is already active or unavailable.');this.held=token;this.retireHeldExpectation=()=>{calculation=undefined;captured=null;};retireScriptPresentationPort(this.port);this.contextRevision++;this.requestedContextKey='';this.queuedContext=null;if(this.drainTimer){clearTimeout(this.drainTimer);this.drainTimer=null;}phase='paused';captured={entries:new Map([...this.entries].map(([id,entry])=>[id,{...entry,binding:structuredClone(entry.binding),status:{...entry.status},appliedPlacement:entry.appliedPlacement?{...entry.appliedPlacement}:undefined}])),retired:new Map([...this.retired].map(([id,row])=>[id,{...row}])),dataKey:this.dataKey,dataEpoch:this.dataEpoch,contextReady:this.contextReady,gate:this.contextGate};for(const entry of this.entries.values()){entry.controller.abort();owned();if(phase!=='paused')throw new Error('Script capture was replaced during cancellation.');}},
   stage:()=>{owned();if(this.nativeDepth)throw new Error('Script bindings cannot stage during a native script callback. Retry after it returns.');if(phase!=='paused')throw new Error('Script bindings can only be staged once.');phase='staging';const staging=()=>{owned();if(phase!=='staging')throw new Error('Script staging was replaced during a native callback.');};this.scope(()=>{
    for(const id of new Set([...this.entries.keys(),...this.retired.keys()])){this.native(()=>this.port.remove(id));staging();}this.entries=new Map();this.retired=new Map();this.dataKey='';this.contextReady=false;this.dataEpoch++;
    for(const binding of bindings){const entry:Entry={binding:structuredClone(binding),key:'',controller:new AbortController(),status:{id:binding.id,name:binding.name,status:'waiting',message:'Waiting for committed chart configuration.'},rendered:true,renderedName:binding.name,appliedPlacement:placement(binding),...(binding.tablePlacement?{appliedTablePlacement:binding.tablePlacement}:{})};this.entries.set(binding.id,entry);this.native(()=>this.port.add({plots:[]},{id:binding.id,title:binding.name,pane:binding.pane,paneId:binding.paneId??null,ownScale:binding.ownScale??false,visible:binding.visible,plots:binding.plots,...(binding.tablePlacement?{tablePlacement:binding.tablePlacement}:{})}));staging();}phase='staged';
   });},
   rollback:()=>{owned();if(!captured||!['paused','staging','staged'].includes(phase))throw new Error('Script transaction cannot roll back in this state.');const rollbackPhase=phase;for(const entry of this.entries.values()){entry.controller.abort();owned();if(phase!==rollbackPhase)throw new Error('Script rollback was replaced during cancellation.');}this.entries=new Map([...captured.entries].map(([id,entry])=>[id,{...entry,controller:new AbortController(),key:entry.status.status==='ready'&&entry.rendered&&entry.acceptedKey===entry.key?entry.key:''}]));this.retired=new Map(captured.retired);this.dataKey=captured.dataKey;this.dataEpoch=captured.dataEpoch;this.contextReady=captured.contextReady;this.contextGate=captured.gate;phase='rolledback';},
   resume:(committed:boolean)=>{owned();if(typeof committed!=='boolean'||committed&&phase!=='staged'||!committed&&phase!=='rolledback')throw new Error('Script transaction must commit or roll back before resuming.');if(committed)this.contextGate={input:calculation?null:expectedInput??(captured!.dataKey||null),bindings:bindingsKey(bindings),...(calculation?{calculation}:{})};calculation=undefined;this.retireHeldExpectation=null;phase='released';this.held=null;captured=null;renewScriptPresentationPort(this.port);const revision=this.contextRevision;this.scope(()=>{this.emit();if(!this.disposed&&!this.held&&this.contextRevision===revision)this.requestContext();});},
  };
 }
 /** The abort signal a strategy rerun links to: the binding entry's current controller while that entry still holds the accepted calculation `key` of data epoch `epoch` (it survives a suspension rollback), otherwise the calculation's own (aborted on recalculation, removal or dispose). */
 #rerunSignal(bindingId:string,key:string,epoch:number,job:AbortController):AbortSignal{const live=this.entries.get(bindingId);return !this.disposed&&!this.held&&this.dataEpoch===epoch&&live&&live.key===key&&live.acceptedKey===key?live.controller.signal:job.signal;}
 /** One strategy rerun. A suspension that starts while the rerun is in flight aborts the entry's controller; when the
  * hold ends with the same accepted calculation restored (same key and epoch, new controller) the rerun runs again on it, at most
  * 4 times. A recalculation, removal or dispose leaves no matching entry, so the abort is returned to the caller as before. */
 async #rerun(input:Omit<Parameters<Executor>[0],'signal'|'engine'>,engine:Parameters<ScriptEngineRerun>[0],signal:AbortSignal,bindingId:string,key:string,epoch:number,job:AbortController):Promise<ScriptResult>{
  for(let attempt=0;;attempt++){
   await this.#outOfHold(signal);const bound=this.#rerunSignal(bindingId,key,epoch,job),linked=linkedSignal(signal,bound);
   try{return(await this.execute({...input,engine,signal:linked.signal})).result;}
   catch(error){if(signal.aborted||this.disposed||attempt>=4||!bound.aborted||(error as {name?:unknown}|null)?.name!=='AbortError')throw error;
    await this.#outOfHold(signal);if(signal.aborted||this.#rerunSignal(bindingId,key,epoch,job).aborted)throw error;}
   finally{linked.release();}
  }
 }
 /** Waits (25 ms steps, at most 10 s) while a transaction holds this runtime, so a rerun does not run against a paused calculation. */
 async #outOfHold(signal:AbortSignal){for(let waited=0;this.held&&!this.disposed&&!signal.aborted&&waited<10000;waited+=25)await new Promise(resolve=>setTimeout(resolve,25));}
 private entryCurrent(entry:Entry,revision:number){return !this.disposed&&!this.held&&this.contextRevision===revision&&this.entries.get(entry.binding.id)===entry;}
 private clear(entry:Entry,revision:number){entry.controller.abort();if(!this.entryCurrent(entry,revision))return false;if(entry.rendered){try{this.native(()=>this.port.update(entry.binding.id,{plots:[]}));if(!this.entryCurrent(entry,revision))return false;}catch(error){if(!this.entryCurrent(entry,revision))return false;try{this.native(()=>this.port.remove(entry.binding.id));if(!this.entryCurrent(entry,revision))return false;entry.rendered=false;}catch(removal){const message='Cannot clear previous script output: '+failureText(error)+'; removal failed: '+failureText(removal);if(!this.entryCurrent(entry,revision))return false;entry.status={...entry.status,status:'error',message};entry.key='';return false;}}}return true;}
 update(context:Context){
  if(this.disposed||this.held)return;
  const input=inputKey(context),bindings=bindingsKey(context.bindings),ownerKey=scriptCsvJobOwnerKey(context.csvJobOwner);
  const requested=JSON.stringify([input,bindings,context.ready,context.requestRevision??0,context.requestBase??null,ownerKey,...(context.chartPositionMode?[context.chartPositionMode]:[])]);
  this.preparePresentationRequests(context,input,ownerKey);
  if(this.scopeDepth){
   if(requested===this.requestedContextKey)return;
   this.requestedContextKey=requested;this.contextRevision++;this.queuedContext=context;
   const retiring=[...this.entries.values()].filter(entry=>entry.status.status==='running'||this.completing.has(entry)).map(entry=>({entry,job:entry.controller}));
   for(const {entry} of retiring){entry.key='';entry.acceptedKey=undefined;}
   for(const {job} of retiring)job.abort();
   return;
  }
  this.requestedContextKey=requested;const revision=++this.contextRevision;this.scope(()=>this.updateCurrent(context,revision));
 }
 private updateCurrent(context:Context,revision:number){
  const current=()=>!this.disposed&&!this.held&&this.contextRevision===revision;
  if(!current())return;if(this.contextGate){
   const gate=this.contextGate;if(bindingsKey(context.bindings)!==gate.bindings)return;
   if(gate.calculation){
    const expected=gate.calculation;if(!context.ready||context.identity!==expected.identity||context.fixture!==expected.fixture)return;
    try{const receipt=expected.capture(context);if(!current()||this.contextGate!==gate||!receipt)return;const owns=()=>{const owned=receipt.isCurrent();return owned&&current()&&this.contextGate===gate;};if(!owns())return;const accepted=inputKey({identity:expected.identity,fixture:expected.fixture,bars:receipt.bars});if(!owns()||accepted!==inputKey(context)||!owns())return;}catch{return;}
   }else if(gate.input!==null&&inputKey(context)!==gate.input)return;
   if(!current()||this.contextGate!==gate)return;this.contextGate=null;
  }this.contextReady=context.ready;
  for(const [id,status]of this.retired){try{this.native(()=>this.port.remove(id));if(!current())return;if(this.retired.get(id)===status)this.retired.delete(id);}catch(error){const message='Native script removal failed: '+failureText(error);if(!current()||this.retired.get(id)!==status)return;status.message=message;}}
  const wanted=new Set(context.bindings.map(row=>row.id));for(const [id,entry]of this.entries)if(!wanted.has(id)){entry.controller.abort();if(!current())return;try{this.native(()=>this.port.remove(id));}catch(error){const message='Native script removal failed: '+failureText(error);if(!this.entryCurrent(entry,revision))return;this.retired.set(id,{id,name:entry.binding.name,status:'error',message});}finally{if(this.entries.get(id)===entry){this.entries.delete(id);scriptOutputs.retire(this.port,id);}}if(!current())return;}
  const dataKey=inputKey(context),dataChanged=dataKey!==this.dataKey;if(dataChanged){this.dataKey=dataKey;this.dataEpoch++;}
  for(const binding of context.bindings){if(this.retired.has(binding.id))continue;let entry=this.entries.get(binding.id);const key=JSON.stringify([this.dataEpoch,binding.source,binding.version,binding.documentId,binding.inputs??null,declaresScriptRequests(binding.source)?[context.requestRevision??0,context.requestBase??null]:null,scriptCsvJobOwnerKey(context.csvJobOwner),...(context.chartPositionMode?[context.chartPositionMode]:[])]);
   if(!entry){entry={binding:structuredClone(binding),key:'',controller:new AbortController(),status:{id:binding.id,name:binding.name,status:'waiting',message:'Waiting for chart data.'},rendered:false};this.entries.set(binding.id,entry);}
   const previousBinding=entry.binding;entry.binding=structuredClone(binding);entry.requestedKey=entry.key===key?entry.key:key;if(entry.key===key&&entry.acceptedKey===key)entry.presentationGeneration=this.#presentationRequests.get(binding.id)?.generation;entry.status.name=binding.name;if(dataChanged){if(!this.clear(entry,revision)){if(!current())return;continue;}entry.key='';}
   if(!context.ready){if(this.clear(entry,revision))entry.status={...entry.status,status:'waiting',message:'Waiting for chart data.'};if(!current())return;entry.key='';continue;}
   if(entry.rendered){const desired=placement(binding),metadata=JSON.stringify([binding.plots,binding.visible,binding.name,desired,...(binding.tablePlacement?[binding.tablePlacement]:[])]),recovering=!!entry.metadataError,tablesOnly=!recovering&&entry.appliedTablePlacement!==binding.tablePlacement&&entry.key===key&&!dataChanged&&JSON.stringify([previousBinding.plots,previousBinding.visible,previousBinding.name,placement(previousBinding)])===JSON.stringify([binding.plots,binding.visible,binding.name,desired]);if(entry.metadataError&&entry.metadataAttempt===metadata){entry.status={...entry.status,status:'error',message:entry.metadataError};continue;}try{
    if(!tablesOnly){
    this.native(()=>this.port.replaceStyles(binding.id,binding.plots));if(!this.entryCurrent(entry,revision))return;
    this.native(()=>this.port.show(binding.id,binding.visible));if(!this.entryCurrent(entry,revision))return;
    if(entry.renderedName!==binding.name){this.native(()=>this.port.rename(binding.id,binding.name));if(!this.entryCurrent(entry,revision))return;entry.renderedName=binding.name;}
    if(JSON.stringify(entry.appliedPlacement)!==JSON.stringify(desired)){this.native(()=>this.port.place(binding.id,desired));if(!this.entryCurrent(entry,revision))return;entry.appliedPlacement=desired;}
    }
    if(entry.appliedTablePlacement!==binding.tablePlacement){this.native(()=>{const move=this.port.placeTables;if(!move)throw Error('This script renderer does not support table destinations.');return move.call(this.port,binding.id,binding.tablePlacement??'chart');});if(!this.entryCurrent(entry,revision))return;entry.appliedTablePlacement=binding.tablePlacement;}
     entry.metadataError=undefined;entry.metadataAttempt=undefined;if(recovering&&entry.acceptedKey===key)entry.status={...entry.status,status:'ready',message:'Requested render settings applied.'};
   }catch(error){const message=failureText(error);if(!this.entryCurrent(entry,revision))return;entry.controller.abort();if(!this.entryCurrent(entry,revision))return;entry.metadataError=message;entry.metadataAttempt=metadata;entry.status={...entry.status,status:'error',message};if(entry.acceptedKey!==key)entry.key='';continue;}}
   if(entry.key===key)continue;if(!this.clear(entry,revision)){if(!current())return;continue;}entry.key=key;entry.controller=new AbortController();entry.status={...entry.status,status:'running',message:'Calculating supplied bars.'};/* A chart over the execution limit runs on its newest SCRIPT_BAR_LIMIT bars; older bars stay blank. */const owner=entry,job=entry.controller,epoch=this.dataEpoch,trimmed=context.bars.length>SCRIPT_BAR_LIMIT,bars=scriptRunBars(context.bars).map(bar=>Object.freeze({...bar})),csvProof=captureScriptCsvJobProof(context.csvJobOwner,binding,bars);let completionRevision:number|undefined;
   const jobCurrent=()=>!this.disposed&&!this.held&&this.dataEpoch===epoch&&this.entries.get(binding.id)===owner&&!job.signal.aborted&&owner.controller===job&&owner.key===key;
   // The existing dispatch copy is private and read-only; no second numerical input cache is allocated.
   Object.freeze(bars);const bindingId=binding.id,generation=this.#presentationRequests.get(bindingId)?.generation,settledCurrent=()=>{const accepted=this.entries.get(bindingId);return !this.disposed&&!this.held&&this.dataEpoch===epoch&&accepted?.key===key&&accepted.acceptedKey===key&&accepted.requestedKey===key&&accepted.presentationGeneration===this.#presentationRequests.get(bindingId)?.generation;};
   const ticket={};this.#presentationTickets.set(ticket,Object.freeze({bindingId,positionMode:context.chartPositionMode,expected:context.csvJobOwner?{input:context.csvJobOwner.input,execution:context.csvJobOwner.execution}:undefined,consumed:bars,current:()=>jobCurrent()&&this.#presentationRequests.get(bindingId)?.generation===generation,settled:settledCurrent,signal:job.signal}));
   let presentationJob:ReturnType<typeof captureScriptPresentationJob>;try{presentationJob=captureScriptPresentationJob(this.port,this,ticket);}finally{this.#presentationTickets.delete(ticket);}
   const chartPositionMode=scriptPresentationExecutionMode(this.port,presentationJob);
   if(context.chartPositionMode&&chartPositionMode!==context.chartPositionMode){
    finishScriptPresentationJob(this.port,presentationJob);if(!jobCurrent())continue;
    if(!this.clear(owner,revision)){if(!current())return;continue;}if(!this.entryCurrent(owner,revision))return;
    owner.key='';owner.acceptedKey=undefined;owner.presentationGeneration=undefined;owner.status={...owner.status,status:'waiting',message:'Waiting for the accepted confirmed chart input.'};continue;
   }
   let execution:ReturnType<Executor>;try{execution=this.execute({source:binding.source,bars,...(chartPositionMode?{chartPositionMode}:{}),identity:context.identity,fixture:context.fixture,signal:entry.controller.signal,...(binding.inputs?{inputs:binding.inputs}:{}),...(context.requestBase?{request:{base:context.requestBase}}:{})});}catch(error){finishScriptPresentationJob(this.port,presentationJob);throw error;}
   void execution.then(({result,barIds,dependencyReceipt})=>this.scope(()=>{
    if(!jobCurrent())return;completionRevision=this.contextRevision;const valid=()=>jobCurrent()&&this.contextRevision===completionRevision;this.completing.add(owner);
    try{
    stageScriptPresentationResult(this.port,presentationJob,result);if(!valid())return;
    stageScriptCsvJobResult(result,csvProof,dependencyReceipt);if(!valid())return;
    const saved=owner.binding;if(owner.rendered){
     if(owner.renderedName!==saved.name){this.native(()=>this.port.rename(binding.id,saved.name));if(!valid())return;owner.renderedName=saved.name;}
     this.native(()=>this.port.update(binding.id,result));if(!valid())return;
    }else{
     // Reserve our ID before callbacks. Reentrant updates wait for this native
     // scope to unwind; they cannot mistake a committed add for an absent ID.
     owner.rendered=true;owner.renderedName=saved.name;owner.appliedPlacement=placement(saved);owner.appliedTablePlacement=saved.tablePlacement;
     try{this.native(()=>this.port.add(result,{id:saved.id,title:saved.name,pane:saved.pane,paneId:saved.paneId??null,ownScale:saved.ownScale??false,visible:saved.visible,plots:saved.plots,...(saved.tablePlacement?{tablePlacement:saved.tablePlacement}:{})}));}
     catch(error){
      // No opaque native handle token exists. Only this runtime's still-owned
      // reservation (or its removed entry) may be cleaned, never a newer entry.
      if(!this.disposed&&(this.entries.get(binding.id)===owner||!this.entries.has(binding.id))){try{this.native(()=>this.port.remove(binding.id));owner.rendered=false;}catch(cleanup){throw new AggregateError([error,cleanup],'Script creation failed and owned cleanup was incomplete');}}
      throw error;
     }
     if(!valid()){if(!this.disposed&&!this.entries.has(binding.id))this.native(()=>this.port.remove(binding.id));return;}
    }
    if(!valid())return;const rerunInput={source:binding.source,bars,...(chartPositionMode?{chartPositionMode}:{}),identity:context.identity,fixture:context.fixture,...(binding.inputs?{inputs:binding.inputs}:{}),...(context.requestBase?{request:{base:context.requestBase}}:{})};
    this.onResult({bindingId:saved.id,result,bars,barIds,sourceCode:saved.source,identity:context.identity,fixture:context.fixture,...(scriptNeedsEngineFeed(binding.source)?{rerun:async(engine,signal)=>{/* A rerun also stops when this calculation's job is aborted (a recalculation, removal or dispose). A chart suspension (autosave, workspace transaction) aborts the job's controller and its rollback restores the same accepted calculation under a new one, so the rerun waits out a hold and then follows the entry's current controller while that entry still holds this calculation. */return this.#rerun(rerunInput,engine,signal,bindingId,key,epoch,job);}}:{})});if(!valid())return;
    acceptScriptCsvJobProof(csvProof);if(!valid())return;owner.acceptedKey=key;if(this.#presentationRequests.get(bindingId)?.generation===generation)owner.presentationGeneration=generation;owner.status={...owner.status,status:'ready',message:scriptReadyMessage(result.plots.length,bars.length,trimmed)};
    acceptScriptPresentationJob(this.port,presentationJob);if(!valid())return;
    // Describe the accepted calculation for Settings (declared inputs) and the alert source catalog.
    try{scriptOutputs.publish(this.port,scriptOutputEntry({bindingId:saved.id,title:saved.name,source:saved.source,savedInputs:saved.inputs??null,result}));}catch{/* a description failure never retracts the accepted render */}
    this.emit();
    }finally{this.completing.delete(owner);}
   })).catch(error=>this.scope(()=>{if(!jobCurrent()||completionRevision!==undefined&&completionRevision!==this.contextRevision)return;const message=failureText(error,true);if(!jobCurrent()||completionRevision!==undefined&&completionRevision!==this.contextRevision)return;owner.status={...owner.status,status:'error',message};this.emit();})).finally(()=>finishScriptPresentationJob(this.port,presentationJob));
   if(!current())return;
  }
  this.emit();
 }
 interact(event:ScriptInteraction){if(this.disposed||this.held)return;const entry=this.entries.get(event.id);if(!entry)return;if(event.kind==='removed'){entry.controller.abort();this.entries.delete(event.id);this.retired.delete(event.id);scriptOutputs.retire(this.port,event.id);}else if(event.kind==='visibility')entry.binding.visible=event.visible;else{entry.binding.pane=event.pane;entry.binding.paneId=event.paneId;entry.binding.ownScale=event.ownScale;entry.appliedPlacement=placement(entry.binding);}entry.metadataError=undefined;entry.metadataAttempt=undefined;this.emit();}
 /** A read-only summary of this cell's script calculations for refusal messages (names and error text only). */
 calculationSummary():{pending:string[];failed:Array<{name:string;message:string}>}{const rows=this.disposed?[]:[...this.entries.values()].map(entry=>entry.status);return{pending:rows.filter(row=>row.status==='waiting'||row.status==='running').map(row=>row.name),failed:[...this.retired.values(),...rows.filter(row=>row.status==='error')].map(row=>({name:row.name,message:row.message}))};}
 retry(){if(this.disposed||this.held)return;for(const entry of this.entries.values())if(entry.status.status==='error'){this.requestedContextKey='';if(entry.metadataError)entry.metadataAttempt=undefined;else entry.key='';}}
 private finishDispose(){if(!this.disposePending||this.scopeDepth)return;this.disposePending=false;try{for(const id of new Set([...this.entries.keys(),...this.retired.keys()])){try{this.port.remove(id);}catch{/* Chart teardown continues; no pending script may commit afterward. */}}}finally{this.entries.clear();this.retired.clear();scriptOutputs.clear(this.port);}}
 dispose(){if(this.disposed)return;this.disposed=true;this.contextGate=null;this.retireHeldExpectation?.();this.retireHeldExpectation=null;retireScriptPresentationPort(this.port);this.#presentationRequests.clear();this.#presentationTickets=new WeakMap();this.disposePending=true;this.queuedContext=null;if(this.drainTimer){clearTimeout(this.drainTimer);this.drainTimer=null;}this.configurationSubscription=null;this.configurationListeners.clear();if(this.configurationOff){const off=this.configurationOff;this.configurationOff=null;try{off();}catch{this.observerFailure='Native readiness subscription cleanup failed.';}}for(const entry of this.entries.values())entry.controller.abort();if(!this.scopeDepth)this.finishDispose();}
}
