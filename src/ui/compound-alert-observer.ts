import type {Bar,BarDataset} from '../domain/types';
import {CompoundAlertStore,type CompoundState,type CompoundBatch,type CompoundPreparation,type CompoundContext,type CompoundDefinition} from '../domain/compound-alerts';
import {liveAlertCompletionFacts,captureLiveAlertCompletion,type LiveAlertCompletion} from '../domain/live-history';
import {sourceContextForDataset,type ChartSourceContext} from '../chart/source-context';
import {sourceValues,sma} from '../domain/indicators';
import {planAlpacaInterval} from '../domain/live-intervals';
import {TECHNICAL_ALERT_LIMITS} from '../domain/technical-alerts';

export const COMPOUND_HISTORY_EXPORT_NOTICE="All-conditions alert history is kept on this computer only and can't be exported.";

/** Trusted ROOT application-owner interface, not a public source registrar.
 * Source permission ALWAYS comes from the real private producer capture below. */
export interface CompoundChartInputPort {
 getStyle():string;
 isInputExact(input:{bars:readonly Bar[];source:ChartSourceContext;style:string}):boolean;
 isInputCurrent(input:{bars:readonly Bar[];source:ChartSourceContext;style:string}):boolean;
}
export interface CompoundRootOwner {
 readonly chart:CompoundChartInputPort;readonly dataset:BarDataset;readonly rows:readonly Bar[];
 readonly store:CompoundAlertStore;readonly definitionRevision:number;
 readonly execution:'ordinary';readonly enabled:boolean;readonly suspended:boolean;
}
export interface CompoundRootWriter {
 /** Actual current App/chart/definition owner. No source permission is inferred
  * from this callback or from the returned context strings. */
 read():CompoundRootOwner|null;
 /** Closed ROOT writer contract: before acknowledgment run NO user callbacks
  * or await; all externally callable guards have already completed. Recheck
  * its authoritative collection/owner references; call acknowledge exactly
  * once, assign its authoritative collection ref in that SAME critical section,
  * then notify React/delivery. A boolean without acknowledgment is insufficient.
  * This constructor-selected infrastructure must be audited at real integration;
  * an arbitrary test callback is NOT evidence the actual App is wired. */
 publish(expected:CompoundRootOwner,next:CompoundState,acknowledge:()=>boolean,binding:CompoundPublicationBinding|null):boolean;
}
/** Descriptive frozen revision/provenance for ROOT's separately budgeted local
 * save/notification adapter. This never grants source or export permission. */
export interface CompoundPublicationBinding {
 readonly declaration:CompoundDefinition;readonly revision:number;readonly restriction:'restricted-live';
 readonly provenance:Readonly<{providerId:string;datasetId:string;revision:string;resolution:string;basis:string}>;
}
export interface CompoundOwnedPublication {
 readonly values:readonly(number|null)[];readonly confirmed:boolean;
 readonly priming:boolean;
 readonly restriction:'restricted-live';readonly estimatedWork:number;readonly numericSlots:number;
 assertCurrent():void;commit():boolean;rollback():boolean;
}
type Fields='time'|'open'|'high'|'low'|'close'|'volume';
const fields:readonly Fields[]=['time','open','high','low','close','volume'];
const nativeQueue=queueMicrotask;
const freeze=Object.freeze;
const bindingRecords=new WeakMap<object,CompoundPublicationBinding>(),bindingGet=WeakMap.prototype.get,bindingSet=WeakMap.prototype.set,bindingApply=Reflect.apply;
/** Actual binding-birth membership ONLY. No supplied fields/prototype/traps
 * are read. Frozen declaration/provenance metadata is not price, completion,
 * source-currentness, export or publication authority. No registrar exists. */
export function compoundPublicationBindingFacts(value:unknown):Readonly<CompoundPublicationBinding>|null{
 if(!value||typeof value!=='object')return null;return bindingApply(bindingGet,bindingRecords,[value])??null;
}
// One closed source ledger across ALL instances. This never owns/credits the
// separate ROOT book's persistent history or grants any source permission.
let sharedWork=0,sharedSlots=0;
export function compoundObservationSharedUsage():Readonly<{work:number;slots:number}>{return freeze({work:sharedWork,slots:sharedSlots});}
interface Bill {work:number;slots:number;live:boolean;active:number;releaseRequested:boolean;queued:boolean}
interface Cut {
 rows:readonly Readonly<Bar>[]|null;originals:readonly WeakRef<object>[]|null;
 dataset:WeakRef<BarDataset>;input:WeakRef<readonly Bar[]>;chart:WeakRef<CompoundChartInputPort>;store:WeakRef<CompoundAlertStore>;
 state:WeakRef<CompoundState>;revision:number;source:ChartSourceContext|null;lease:LiveAlertCompletion|null;health:boolean;
 context:Readonly<CompoundContext>;barId:string;barTime:number;confirmed:boolean;completeRows:number;endpointIndex:number;prime:boolean;binding:CompoundPublicationBinding|null;sampleSequence:number;
 bill:Bill;live:boolean;generation:bigint;publicChecks:number;values:readonly(number|null)[];batch:CompoundBatch|null;
}
export class CompoundObservationUnavailable extends Error {
 constructor(readonly state:'pending'|'unavailable'|'budget',message:string){super(message);this.name='CompoundObservationUnavailable';}
}
const unavailable=(message:string):never=>{throw new CompoundObservationUnavailable('unavailable',message);};
function data(value:unknown,key:PropertyKey):unknown {
 if(!value||typeof value!=='object')return unavailable('The current compound source is unavailable.');
 const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value')||!d.enumerable&&!(Array.isArray(value)&&key==='length'))return unavailable('The compound source requires own data fields.');return d.value;
}
function row(value:unknown):Readonly<Bar>{
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return unavailable('The source row is unavailable.');
 const values=fields.map(key=>data(value,key));
 if(values.some(value=>typeof value!=='number'||!Number.isFinite(value))||!Number.isSafeInteger(values[0])||(values[0] as number)<0)return unavailable('The source row has invalid numbers.');
 const [time,open,high,low,close,volume]=values as number[];
 if(Math.min(open,high,low,close)<=0||volume<0||high<Math.max(open,low,close)||low>Math.min(open,high,close))return unavailable('The source row has invalid OHLC bounds.');
 const result={time,open,high,low,close,volume};freeze(result);if(!Object.isFrozen(result))return unavailable('The source cut could not be frozen.');return result;
}
function equalContext(a:CompoundContext,b:CompoundContext):boolean{return a.instrumentId===b.instrumentId&&a.sourceFamily===b.sourceFamily&&a.interval===b.interval&&a.session===b.session&&a.basis===b.basis;}
function describeContext(dataset:BarDataset,source:ChartSourceContext,interval:string):Readonly<CompoundContext>|null{
 if(!['1m','5m','15m','60m'].includes(interval)||data(dataset.provenance,'session')!=='regular'||typeof source.basisIdentity!=='string')return null;
 const instrumentId=data(dataset.instrument,'id');if(typeof instrumentId!=='string')return null;
 return freeze({instrumentId,sourceFamily:source.datasetId,interval:interval as CompoundContext['interval'],session:'regular',basis:source.basisIdentity});
}
/** Descriptive form context after fixed genuine producer membership. No rows
 * are returned, scanned, closed or admitted; copied datasets return null. The
 * portable source-context constructor retains its existing metadata validation.
 * A returned context is NEVER source permission for a later prepare/commit. */
export function compoundSourceContext(dataset:BarDataset,rows:readonly Bar[]):Readonly<CompoundContext>|null{
 try{const facts=liveAlertCompletionFacts(dataset,rows,'ordinary');if(!facts||facts.replay||data(dataset.provenance,'state')!=='ready')return null;
  const planned=planAlpacaInterval(facts.resolution);if(!planned.ok)return null;return describeContext(dataset,sourceContextForDataset(dataset,rows),planned.plan.id);
 }catch{return null;}
}
interface Calculation {field:Parameters<typeof sourceValues>[1];length:number|null;key:string}
function calculations(state:CompoundState):readonly Calculation[]{
 return state.definition.predicates.map(p=>{
  if(p.source.kind==='price')return{field:p.source.field,length:null,key:'price:'+p.source.field};
  const s=p.source,keys=Object.keys(s.inputs);if(s.indicator!=='sma'||s.plot!=='sma'||keys.length!==2||!keys.includes('length')||!keys.includes('source')||!Number.isSafeInteger(s.inputs.length)||(s.inputs.length as number)<1||(s.inputs.length as number)>10000||typeof s.inputs.source!=='string'||!['open','high','low','close','hl2','hlc3','ohlc4'].includes(s.inputs.source))return unavailable('Only frozen SMA length and raw price-source inputs are supported.');
  return{field:s.inputs.source as Calculation['field'],length:s.inputs.length as number,key:'sma:'+s.inputs.source+':'+s.inputs.length};
 });
}
/** One observer owns at most one active computation and one pending publication.
 * Every Bill stays charged through active async/callback stacks and deferred
 * unwind. Accepted and replacement cuts overlap under the SAME private totals.
 * No public admission/credit method exists and no coefficient changes a source
 * permission. This is a bounded first source prototype, not all-alert scaling. */
export class CompoundAlertObserver {
 #writer:CompoundRootWriter|null;#generation=0n;#pending:Cut|null=null;#accepted:Cut|null=null;
 #running=false;#disposed=false;#work=0;#slots=0;#primeRequired=true;
 #page: {store:WeakRef<CompoundAlertStore>;head:WeakRef<object>;offset:number;limit:number;rows:readonly Readonly<{at:number;values:readonly number[];restriction:'restricted-live'}>[]} | null=null;
 constructor(writer:CompoundRootWriter){this.#writer={read:writer.read.bind(writer),publish:writer.publish.bind(writer)};}
 retainedUsage():Readonly<{work:number;slots:number}>{return freeze({work:this.#work,slots:this.#slots});}
 #reserve(N:number,M:number,K:number,F:number,state:CompoundState):Bill {
  const H=state.history?.size??0,idBound=6*state.definition.id.length+80;
  // Own source/copy/currentness bound + canonical SMA's complete numerical
  // passes/exact fallback allowance. All full outputs are charged through
  // unwind even though only scalar endpoints survive. No history traversal.
  // Each canonical exact fallback is bounded to 2115 bits. The 8192 allowance
  // includes binary conversion and bounded multiword division, rather than
  // treating every BigInt operation as one free scalar operation.
  const work=1024*N+2048*M+K*8192*M+131072;
  const slots=16*N+(32+2*K+F)*M+(H+1)*(40+state.definition.predicates.length+Math.ceil(idBound/4))+4096;
  if(!Number.isSafeInteger(work)||!Number.isSafeInteger(slots)||this.#work+work>TECHNICAL_ALERT_LIMITS.operations||this.#slots+slots>TECHNICAL_ALERT_LIMITS.numericSlots||sharedWork+work>TECHNICAL_ALERT_LIMITS.operations||sharedSlots+slots>TECHNICAL_ALERT_LIMITS.numericSlots)throw new CompoundObservationUnavailable('budget','The complete compound source, history and calculation overlap exceeds the local alert budget.');
  const bill:Bill={work,slots,live:true,active:1,releaseRequested:false,queued:false};this.#work+=work;this.#slots+=slots;sharedWork+=work;sharedSlots+=slots;return bill;
 }
 #release(bill:Bill):void {
  bill.releaseRequested=true;if(!bill.live||bill.active||bill.queued)return;bill.queued=true;
  // The captured Bill is fixed scalar bookkeeping, never a source graph. Keep
  // it until debit release even if the retired Cut becomes unreachable.
  const owner=new WeakRef(this);nativeQueue(()=>{const actual=owner.deref();bill.queued=false;if(!bill.live||bill.active||!bill.releaseRequested)return;
   // Only #retire (after severing the cut's graphs), or a failed acquisition's
   // active-stack finally, requests this release. The queued scalar Bill stays
   // alive even if the weak observer disappears; it cannot strand global fees.
   const work=bill.work,slots=bill.slots;bill.live=false;bill.work=0;bill.slots=0;sharedWork-=work;sharedSlots-=slots;if(actual){actual.#work-=work;actual.#slots-=slots;}
  });
 }
 #retire(cut:Cut|null):void {if(!cut)return;cut.live=false;cut.rows=null;cut.originals=null;cut.source=null;cut.lease=null;cut.binding=null;cut.batch=null;cut.values=[];this.#release(cut.bill);}
 #owner(cut?:Cut):CompoundRootOwner {
  if(this.#disposed||!this.#writer)return unavailable('Compound observation is disposed.');const owner=this.#writer.read();
  if(!owner||owner.execution!=='ordinary'||!owner.enabled||owner.suspended)throw new CompoundObservationUnavailable('pending','Compound evaluation is waiting for its current ordinary chart.');
  if(cut&&(cut.generation!==this.#generation||!cut.live||owner.chart!==cut.chart.deref()||owner.dataset!==cut.dataset.deref()||owner.rows!==cut.input.deref()||owner.store!==cut.store.deref()||owner.definitionRevision!==cut.revision||owner.store.current!==cut.state.deref()))return unavailable('The compound chart, source or definition changed.');
  return owner;
 }
 #assert(cut:Cut):CompoundRootOwner {
  try{return this.#check(cut);}catch(error){
   // Same-source chart/transaction pending is a temporary refusal. Actual
   // origin/value/owner failure is terminal for this exact cut, even if a
   // caller later restores visible values. Never clear a newer pending cut.
   if(!(error instanceof CompoundObservationUnavailable&&error.state==='pending')){if(cut.generation===this.#generation&&!this.#disposed)this.#primeRequired=true;if(this.#pending===cut)this.#pending=null;this.#retire(cut);}throw error;
  }
 }
 #check(cut:Cut):CompoundRootOwner {
  const owner=this.#owner(cut);if(cut.health)return owner;
  const rows=cut.rows,refs=cut.originals,lease=cut.lease,source=cut.source;if(!rows||!refs||!lease||!source)return unavailable('The owned compound cut retired.');
  lease.assertCurrent();const style=owner.chart.getStyle();this.#owner(cut);if(style!=='candles')throw new CompoundObservationUnavailable('pending','Compound calculation requires the current Candles chart.');
  const input={bars:owner.rows,source,style};const exact=owner.chart.isInputExact(input);this.#owner(cut);if(exact!==true)throw new CompoundObservationUnavailable('pending','Compound calculation requires the full actual accepted chart input.');
  if(owner.chart.isInputCurrent(input)!==true)throw new CompoundObservationUnavailable('pending','Compound calculation is waiting for current Candles chart input.');this.#owner(cut);
  if(data(owner.dataset,'bars')!==owner.rows||data(owner.rows,'length')!==rows.length)return unavailable('The actual compound input changed.');
  for(let i=0;i<rows.length;i++){const original=data(owner.rows,String(i));if(!original||typeof original!=='object'||refs[i].deref()!==original)return unavailable('The actual compound row was replaced.');for(const field of fields)if(!Object.is(data(original,field),rows[i][field]))return unavailable('The actual compound row changed during observation.');}
  lease.assertCurrent();return this.#owner(cut);
 }
 #still(owner:CompoundRootOwner,state:CompoundState,generation:bigint):void {
  const current=this.#owner();if(generation!==this.#generation||current.chart!==owner.chart||current.dataset!==owner.dataset||current.rows!==owner.rows||current.store!==owner.store||current.definitionRevision!==owner.definitionRevision||current.store.current!==state)return unavailable('The compound owner changed during acquisition.');
 }
 #health(owner:CompoundRootOwner,state:CompoundState,observedAt:number,bill:Bill,generation:bigint):Cut {
  // Actual unusable source was observed even if a later ROOT CAS refuses the
  // status publication. Recovery must seed, not bridge that health loss.
  this.#primeRequired=true;
  const values=freeze(state.definition.predicates.map(()=>null)),barTime=state.barTime??0,barId=state.barId??'unavailable',sequence=(state.lastSequence??0)+1;
  if(!Number.isSafeInteger(sequence))return unavailable('The compound batch sequence is exhausted.');
  const batch:CompoundBatch={context:state.definition.context,mode:'ordinary',sequence,observedAt,cutoffTime:observedAt,barId,barTime,barClosed:false,kind:'unavailable',samples:state.definition.predicates.map((p,i)=>({predicateId:p.id,value:null,sequence:state.samples[i]?.sequence??0,time:state.samples[i]?.time??barTime,availableAt:observedAt,barId,confirmed:false}))};
  const cut:Cut={rows:null,originals:null,dataset:new WeakRef(owner.dataset),input:new WeakRef(owner.rows),chart:new WeakRef(owner.chart),store:new WeakRef(owner.store),state:new WeakRef(state),revision:state.revision,source:null,lease:null,health:true,context:state.definition.context,barId,barTime,confirmed:false,completeRows:0,endpointIndex:-1,prime:false,binding:null,sampleSequence:this.#accepted?.sampleSequence??0,bill,live:true,generation,publicChecks:0,values,batch};
  this.#still(owner,state,generation);this.#pending=cut;return cut;
 }
 cancelPendingForWorkspace():void {this.#generation++;const pending=this.#pending;this.#pending=null;this.#retire(pending);}
 dispose():void {if(this.#disposed)return;this.#disposed=true;this.cancelPendingForWorkspace();const accepted=this.#accepted;this.#accepted=null;this.#retire(accepted);this.#page=null;this.#writer=null;}
 async prepare(observedAt:number):Promise<CompoundOwnedPublication>{
  if(!Number.isSafeInteger(observedAt)||observedAt<0)return unavailable('Invalid compound observation time.');
  if(this.#running)throw new CompoundObservationUnavailable('pending','The prior compound source calculation is unwinding.');
  this.cancelPendingForWorkspace();const generation=this.#generation;this.#running=true;let cut:Cut|null=null,bill:Bill|null=null;
  try{
   const actual=this.#owner(),owner=freeze({chart:actual.chart,dataset:actual.dataset,rows:actual.rows,store:actual.store,definitionRevision:actual.definitionRevision,execution:actual.execution,enabled:actual.enabled,suspended:actual.suspended}),state=owner.store.current;if(owner.definitionRevision!==state.revision||observedAt<state.clock)return unavailable('The compound revision or observation clock changed.');this.#still(owner,state,generation);
   // Real fixed private membership BEFORE numerical input access/allocation.
   const facts=liveAlertCompletionFacts(owner.dataset,owner.rows,'ordinary');if(!facts||facts.replay){bill=this.#reserve(0,0,0,0,state);cut=this.#health(owner,state,observedAt,bill,generation);return this.#publication(cut);}
   const planned=planAlpacaInterval(facts.resolution);if(!planned.ok||!['1m','5m','15m','60m'].includes(planned.plan.id)||data(owner.dataset.provenance,'state')!=='ready'){bill=this.#reserve(0,0,0,0,state);cut=this.#health(owner,state,observedAt,bill,generation);return this.#publication(cut);}
   const specs=calculations(state),K=new Set(specs.filter(v=>v.length!==null).map(v=>v.key)).size,F=new Set(specs.map(v=>v.field)).size;
   bill=this.#reserve(facts.sourceRows,facts.rows,K,F,state);
   const source=sourceContextForDataset(owner.dataset,owner.rows),context=describeContext(owner.dataset,source,planned.plan.id);
   if(!context||!equalContext(context,state.definition.context)){cut=this.#health(owner,state,observedAt,bill,generation);return this.#publication(cut);}
   this.#still(owner,state,generation);const style=owner.chart.getStyle();this.#still(owner,state,generation);if(style!=='candles')throw new CompoundObservationUnavailable('pending','Compound calculation requires the current Candles chart.');
   const input={bars:owner.rows,source,style};const exact=owner.chart.isInputExact(input);this.#still(owner,state,generation);if(exact!==true)throw new CompoundObservationUnavailable('pending','Compound calculation requires the full actual accepted chart input.');
   const current=owner.chart.isInputCurrent(input);this.#still(owner,state,generation);if(current!==true)throw new CompoundObservationUnavailable('pending','Compound calculation is waiting for current chart input.');
   const lease=captureLiveAlertCompletion(owner.dataset,owner.rows,'ordinary');if(!lease||lease.rows!==facts.rows){cut=this.#health(owner,state,observedAt,bill,generation);return this.#publication(cut);}lease.assertCurrent();
   if(lease.closedThrough>observedAt)return unavailable('The producer observation is not yet available at this observation time.');
   const rows:Readonly<Bar>[]=[],refs:WeakRef<object>[]=[];let previous=-Infinity;
   for(let i=0;i<facts.rows;i++){const original=data(owner.rows,String(i)),copy=row(original);if(copy.time<=previous||copy.time>observedAt)return unavailable('The full compound input has an unordered or future row.');previous=copy.time;rows.push(copy);refs.push(new WeakRef(original as object));}
   freeze(rows);freeze(refs);if(!Object.isFrozen(rows)||!Object.isFrozen(refs))return unavailable('The compound cut is not immutable.');
   if(rows[0].time<lease.coveredFrom)return unavailable('The complete source prefix has no admitted same-interval coverage.');
   const endAt=(i:number)=>{const time=rows[i].time,range=planned.plan.bucketRange?.(time),start=range?.start??time,end=range?.end??time+planned.plan.nominalSeconds;if(start!==time||!Number.isSafeInteger(end)||end<=start)return unavailable('The source row has no supported canonical bucket.');return end;};
   // All M rows remain captured/proved/funded. This is an endpoint query, not
   // a history trim to fit a budget. Genuine producer coverage is mandatory;
   // a later caller clock cannot advance this confirmed prefix.
   let low=0,high=rows.length;while(low<high){const mid=Math.floor((low+high)/2);if(endAt(mid)<=lease.closedThrough)low=mid+1;else high=mid;}const completeRows=low;
   const endpointIndex=state.definition.frequency==='once-per-bar-close'?completeRows-1:rows.length-1;
   if(endpointIndex<0){cut=this.#health(owner,state,observedAt,bill,generation);return this.#publication(cut);}
   const last=rows[endpointIndex],confirmed=endpointIndex<completeRows;
   const old=this.#accepted,definitionChanged=!!old&&(old.store.deref()!==owner.store||old.revision!==state.revision||old.binding?.declaration!==state.definition);
   let changed=!old?.rows||old.rows.length!==rows.length||old.barTime!==last.time||old.confirmed!==confirmed||old.completeRows!==completeRows||definitionChanged;
   if(!changed&&old?.rows)for(let i=0;i<rows.length&&!changed;i++)for(const field of fields)if(!Object.is(old.rows[i][field],rows[i][field])){changed=true;break;}
   const previousSequence=old?.sampleSequence??Math.max(0,...state.samples.map(v=>v?.sequence??0));
   const sampleSequence=previousSequence+(changed?1:0),barId=JSON.stringify([source.datasetId,context.interval,context.session,last.time]);if(!Number.isSafeInteger(sampleSequence))return unavailable('The source observation sequence is exhausted.');
   const providerId=data(owner.dataset.provenance,'providerId');if(typeof providerId!=='string'||providerId.length>500)return unavailable('The current source provenance is unavailable.');
   const binding=freeze({declaration:state.definition,revision:state.revision,restriction:'restricted-live' as const,provenance:freeze({providerId,datasetId:source.datasetId,revision:source.revision,resolution:facts.resolution,basis:source.basisIdentity!})});
   bindingApply(bindingSet,bindingRecords,[binding,binding]);
   const repeatedClose=state.definition.frequency==='once-per-bar-close'&&state.closedBarTime!==null&&last.time<=state.closedBarTime;
   // Manual lifecycle reset clears baselines but retains numerical pins. A
   // transaction suspension or clock-only state update does not clear them.
   const lifecycleCleared=!!old&&old.store.deref()===owner.store&&state.previous.every(v=>v===null)&&state.samples.some(v=>v!==null);
   const prime=this.#primeRequired||definitionChanged||lifecycleCleared||confirmed&&(repeatedClose||state.closedBarTime!==null&&state.previousClosed.every(v=>v===null));
   cut={rows,originals:refs,dataset:new WeakRef(owner.dataset),input:new WeakRef(owner.rows),chart:new WeakRef(owner.chart),store:new WeakRef(owner.store),state:new WeakRef(state),revision:state.revision,source,lease,health:false,context:freeze(context),barId,barTime:last.time,confirmed,completeRows,endpointIndex,prime,binding,sampleSequence,bill,live:true,generation,publicChecks:0,values:[],batch:null};this.#pending=cut;
   this.#assert(cut);await Promise.resolve();this.#assert(cut);
   const series=new Map<Calculation['field'],number[]>(),endpoints=new Map<string,number|null>();
   for(const spec of specs){if(endpoints.has(spec.key))continue;let values=series.get(spec.field);if(!values){values=sourceValues(rows,spec.field);series.set(spec.field,values);}const output=spec.length===null?values:sma(values,spec.length),value=output[endpointIndex];endpoints.set(spec.key,typeof value==='number'&&Number.isFinite(value)?value:null);}
   this.#assert(cut);const values=specs.map(spec=>endpoints.get(spec.key)??null);freeze(values);cut.values=values;
   const sequence=(state.lastSequence??0)+1;if(!Number.isSafeInteger(sequence))return unavailable('The compound batch sequence is exhausted.');
   let correction=false,gap=false;
   if(old?.rows){if(rows.length<old.rows.length||rows[0].time!==old.rows[0].time)correction=true;else{gap=state.definition.frequency==='once-per-bar-close'?completeRows>old.completeRows+1:rows.length>old.rows.length+1;for(let i=0;i<old.rows.length&&!correction;i++)if(!(i>=old.completeRows&&rows[i]?.time===old.rows[i].time))for(const field of fields)if(!rows[i]||!Object.is(old.rows[i][field],rows[i][field])){correction=true;break;}}}
   cut.batch={context:cut.context,mode:'ordinary',sequence,observedAt,cutoffTime:state.definition.frequency==='once-per-bar-close'?endAt(endpointIndex):observedAt,barId,barTime:last.time,barClosed:confirmed,kind:values.some(v=>v===null)?'unavailable':correction?'correction':gap?'gap':'observation',samples:values.map((value,i)=>({predicateId:state.definition.predicates[i].id,value,sequence:sampleSequence,time:last.time,availableAt:observedAt,barId,confirmed}))};
   this.#assert(cut);return this.#publication(cut);
  }catch(error){if(generation===this.#generation&&!this.#disposed&&!(error instanceof CompoundObservationUnavailable&&error.state==='pending'))this.#primeRequired=true;if(cut){if(this.#pending===cut)this.#pending=null;this.#retire(cut);}else if(bill)this.#release(bill);throw error;}
  finally{this.#running=false;if(bill){bill.active--;if(bill.releaseRequested)this.#release(bill);}}
 }
 #publication(cut:Cut):CompoundOwnedPublication {
  const weakOwner=new WeakRef(this),weakCut=new WeakRef(cut),values=cut.values,estimatedWork=cut.bill.work,numericSlots=cut.bill.slots;
  const current=()=>{const owner=weakOwner.deref(),c=weakCut.deref();if(!owner||!c||owner.#pending!==c)return unavailable('The compound publication retired.');return{owner,cut:c};};
  return freeze({values,confirmed:cut.confirmed,priming:cut.prime,restriction:'restricted-live' as const,estimatedWork,numericSlots,
   // A publication offers ONE optional external full comparison. Commit has
   // its own two mandatory comparisons. Repeated public calls cannot turn one
   // admitted calculation into an unbounded sequence of funded M traversals.
   assertCurrent:()=>{const state=current();if(state.cut.publicChecks++!==0)return unavailable('The publication currentness check was already consumed.');state.cut.bill.active++;try{state.owner.#assert(state.cut);}finally{state.cut.bill.active--;if(state.cut.bill.releaseRequested)state.owner.#release(state.cut.bill);}},
   commit:()=>{const state=current();return state.owner.#commit(state.cut);},
   rollback:()=>{const owner=weakOwner.deref(),c=weakCut.deref();if(!owner||!c||owner.#pending!==c)return false;owner.#pending=null;owner.#retire(c);return true;}});
 }
 #commit(cut:Cut):boolean {
  let domain:CompoundPreparation|null=null,acknowledged=false,entered=false,retired:Cut|null=null;
  cut.bill.active++;
  try{
   const owner=this.#assert(cut);if(!cut.batch)return unavailable('The compound batch retired.');
   domain=cut.prime?owner.store.prime(cut.batch):owner.store.prepare(cut.batch);this.#assert(cut);
   const prepared=domain;
   // All source/chart/domain-prepare callbacks happened above. The selected
   // actual ROOT writer now rechecks its collection refs before this callback-
   // free acknowledgment. A false return alone cannot mint a source receipt.
   const writer=this.#writer;if(!writer)return unavailable('Compound publication owner retired.');entered=true;const published=writer.publish(owner,prepared.next,()=>{
    if(!entered||acknowledged||this.#disposed||this.#pending!==cut||!cut.live||cut.generation!==this.#generation)return false;
    if(!prepared.commit())return false;
    acknowledged=true;this.#pending=null;
    if(cut.health){this.#primeRequired=true;retired=cut;}else{this.#primeRequired=cut.values.some(v=>v===null);retired=this.#accepted;this.#accepted=cut;cut.batch=null;cut.lease=null;}
    return true;
   },cut.binding);entered=false;
   if(acknowledged&&!published)throw Error('The closed compound writer refused after authoritative acknowledgment.');
   if(!acknowledged){prepared.rollback();if(this.#pending===cut)this.#pending=null;this.#retire(cut);return false;}
   return true;
  }catch(error){entered=false;if(!acknowledged){domain?.rollback();if(this.#pending===cut)this.#pending=null;this.#retire(cut);}throw error;}
  finally{entered=false;this.#retire(retired);cut.bill.active--;if(cut.bill.releaseRequested)this.#release(cut.bill);}
 }
 /** Explicit display page only. Offset zero follows the newest <=100 items;
  * a deeper page is a stable snapshot until navigation/explicit refresh. New
  * notifications cannot cause its O(offset) walk on every render/tick. Every
  * value remains restricted-live, regardless of sourceFamily or saved labels. */
 historyPage(store:CompoundAlertStore,offset:number,limit:number):readonly Readonly<{at:number;values:readonly number[];restriction:'restricted-live'}>[] {
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000||!Number.isSafeInteger(limit)||limit<1||limit>100)return unavailable('Invalid compound history page.');
  const head=store.current.history;if(!head)return freeze([]);
  const cached=this.#page;if(cached&&cached.store.deref()===store&&cached.offset===offset&&cached.limit===limit&&(offset>0||cached.head.deref()===head))return cached.rows;
  const out:Array<Readonly<{at:number;values:readonly number[];restriction:'restricted-live'}>>=[];let node:CompoundState['history']=store.current.history;
  for(let i=0;node&&i<offset+limit;i++,node=node.previous)if(i>=offset)out.push(freeze({at:node.item.at,values:node.item.values,restriction:'restricted-live' as const}));
  const rows=freeze(out);this.#page={store:new WeakRef(store),head:new WeakRef(head),offset,limit,rows};return rows;
 }
 refreshHistoryPage():void{this.#page=null;}
 /** This first source route has NO export-allowed branch. Local/private save
  * and workspace/share sanitization require the actual ROOT bridge; do not
  * recursively stringify the linked runtime state as a substitute. */
 exportHistory():never{throw Error(COMPOUND_HISTORY_EXPORT_NOTICE);}
}
