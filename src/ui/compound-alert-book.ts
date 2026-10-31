import {CompoundAlertStore,COMPOUND_HISTORY_LIMIT,COMPOUND_PRIVATE_BYTES,compoundHistorySize,serializeCompoundDefinition,type CompoundDefinition,type CompoundState,type CompoundPreparation} from '../domain/compound-alerts';
import {copyAlertDelivery,type AlertDeliverySettings} from '../domain/alert-delivery';
import type {Bar,BarDataset} from '../domain/types';
import {restoreCompoundPrivateCollection,type CompoundDocumentSnapshot,type CompoundJournalBinding,type CompoundJournalNode,type RestoredCompoundRecord} from './compound-alert-document';
import {compoundSourceContext,compoundPublicationBindingFacts,type CompoundChartInputPort,type CompoundPublicationBinding,type CompoundRootOwner,type CompoundRootWriter} from './compound-alert-observer';

type Ref<T>={readonly current:T};
/** These are the actual existing App refs, selected by the trusted main-window
 * constructor. They are not a source registrar. No host callback is accepted. */
export interface CompoundBookHostRefs {
 readonly financial:Ref<{paper:unknown;paperBook:unknown;alerts:unknown}>;
 readonly currentInput:Ref<{dataset:BarDataset;bars:readonly Bar[];replay:unknown}|null>;
 readonly activeController:Ref<CompoundChartInputPort|null>;
 readonly financialGeneration:Ref<number>;readonly gridGeneration:Ref<number>;
 readonly storageMutation:Ref<boolean>;readonly workspaceTransaction:Ref<boolean>;
 readonly currentReplay:Ref<unknown>;readonly startup:Ref<{phase:string}>;
 readonly mainWindow:boolean;
}
export interface CompoundBookUsage {readonly bytes:number;readonly nodes:number;readonly history:number;readonly reservedBytes:number;readonly reservedNodes:number}
export interface CompoundBookEntry extends CompoundDocumentSnapshot {
 readonly id:string;readonly generation:object;readonly store:CompoundAlertStore;
}
export interface CompoundBookChange {
 readonly kind:'create'|'edit'|'lifecycle'|'remove'|'adopt';readonly expectedVersion:bigint;
 assertCurrent():void;commit():boolean;rollback():boolean;
}
export interface CompoundBookEvent {
 readonly version:bigint;readonly kind:'create'|'edit'|'lifecycle'|'remove'|'adopt'|'observation';
 readonly entry:CompoundBookEntry|null;
 /** Exactly this new acknowledged item only. Restored journals never appear. */
 readonly fresh:CompoundJournalNode|null;
}
const freeze=Object.freeze,ownDescriptor=Object.getOwnPropertyDescriptor,hasOwn=Object.hasOwn,apply=Reflect.apply,enqueue=queueMicrotask;
const storeCurrent=ownDescriptor(CompoundAlertStore.prototype,'current')!.get!;
const editStore=CompoundAlertStore.prototype.prepareEdit;
const intrinsicMapGet=Map.prototype.get,intrinsicMapSet=Map.prototype.set,intrinsicMapDelete=Map.prototype.delete;
const intrinsicWeakGet=WeakMap.prototype.get,intrinsicWeakSet=WeakMap.prototype.set;
const intrinsicSetForEach=Set.prototype.forEach,intrinsicPush=Array.prototype.push;
const mapGet=<K,V>(map:Map<K,V>,key:K):V|undefined=>apply(intrinsicMapGet,map,[key]);
const mapSet=<K,V>(map:Map<K,V>,key:K,value:V):void=>{apply(intrinsicMapSet,map,[key,value]);};
const mapDelete=<K,V>(map:Map<K,V>,key:K):void=>{apply(intrinsicMapDelete,map,[key]);};
const methods={pause:CompoundAlertStore.prototype.pause,resume:CompoundAlertStore.prototype.resume,rearm:CompoundAlertStore.prototype.rearm,advance:CompoundAlertStore.prototype.advanceClock};
const MAX_NODES=500000,MAX_ENTRIES=10000;
// This is a conservative persistent-record/text account, NOT a browser heap
// measurement, observer W/U credit, provider/source grant or export permission.
// Every UTF-16 unit is charged six JSON bytes (including lone surrogates).
const PREPARE_BYTES=600000,PREPARE_NODES=2048;
const BOOK_BASE_COST={bytes:65536,nodes:512,history:0};
const books=new WeakMap<object,CompoundAlertBook>();
function fail(message:string):never{throw Error(message);}
function data(value:unknown,key:PropertyKey):unknown{
 if(!value||typeof value!=='object')return fail('Compound Root ownership is unavailable.');
 const d=ownDescriptor(value,key);if(!d||!hasOwn(d,'value'))return fail('Compound Root ownership requires actual own data refs.');return d.value;
}
function current<T>(ref:Ref<T>):T{return data(ref,'current') as T;}
function stateOf(store:CompoundAlertStore):CompoundState{return apply(storeCurrent,store,[]);}
function integer(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)return fail('Invalid compound collection clock or generation.');return value;}
/** Keeps the optional webhook and sound duration. */
function copyDelivery(value:unknown):Readonly<AlertDeliverySettings>{return copyAlertDelivery(value);}
interface Cost {bytes:number;nodes:number;history:number}
const zero=():Cost=>({bytes:0,nodes:0,history:0});
const plus=(a:Cost,b:Cost):Cost=>({bytes:a.bytes+b.bytes,nodes:a.nodes+b.nodes,history:a.history+b.history});
const minus=(a:Cost,b:Cost):Cost=>({bytes:a.bytes-b.bytes,nodes:a.nodes-b.nodes,history:a.history-b.history});
const positive=(cost:Cost):Cost=>({bytes:Math.max(0,cost.bytes),nodes:Math.max(0,cost.nodes),history:Math.max(0,cost.history)});
function deferredBookNotice(emit:(event:CompoundBookEvent)=>void,event:CompoundBookEvent,retire:()=>void,release:()=>void):void{
 enqueue(()=>{try{emit(event);}finally{retire();release();}});
}
function textCost(text:string):number{return 6*text.length;}
function definitionCost(definition:CompoundDefinition):Cost{return{bytes:2048+textCost(serializeCompoundDefinition(definition)),nodes:128+32*definition.predicates.length,history:0};}
function stateCost(state:CompoundState):Cost{
 const text=(state.barId??'')+(state.lastTriggeredBar??'');
 return{bytes:8192+textCost(text)+256*state.definition.predicates.length,nodes:128+16*state.definition.predicates.length,history:0};
}
function journalCost(node:CompoundJournalNode):Cost{const n=node.item;return{bytes:1024+textCost(n.id)+textCost(n.alertId)+textCost(n.barId)+128*n.values.length,nodes:48+4*n.values.length,history:1};}
function bindingCost(binding:CompoundJournalBinding):Cost{const p=binding.provenance;return{bytes:1024+textCost(binding.id)+textCost(p.providerId)+textCost(p.datasetId)+textCost(p.revision)+textCost(p.resolution)+textCost(p.basis),nodes:48,history:0};}
function bindingKey(binding:Pick<CompoundPublicationBinding,'revision'|'provenance'>):string{
 const p=binding.provenance,part=(value:string)=>`${value.length}:${value}`;
 return `${binding.revision}|${part(p.providerId)}${part(p.datasetId)}${part(p.revision)}${part(p.resolution)}${part(p.basis)}`;
}
const validProvenanceText=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=500;
interface Host {
 financial:number;grid:number;paper:unknown;paperBook:unknown;alerts:unknown;
 input:unknown;chart:CompoundChartInputPort|null;dataset:BarDataset|null;rows:readonly Bar[]|null;
 ready:boolean;held:boolean;ordinary:boolean;
}
interface ReplacementHost {financial:number;grid:number;paper:unknown;paperBook:unknown;alerts:unknown;startup:unknown;phase:unknown;storage:boolean;workspace:boolean}
type BookBase={version:bigint;host:Host}|{version:bigint;replacement:ReplacementHost};
const sameReplacement=(a:ReplacementHost,b:ReplacementHost)=>a.financial===b.financial&&a.grid===b.grid&&a.paper===b.paper&&a.paperBook===b.paperBook&&a.alerts===b.alerts&&a.startup===b.startup&&a.phase===b.phase&&a.storage===b.storage&&a.workspace===b.workspace;
type IdentityPin={weak:WeakRef<object>}|{value:unknown};
const identityPin=(value:unknown):IdentityPin=>(typeof value==='object'&&value!==null||typeof value==='function')?{weak:new WeakRef(value as object)}:{value};
const matchesIdentity=(pin:IdentityPin,value:unknown)=>'weak' in pin?pin.weak.deref()===value:pin.value===value;
function sameHost(a:Host,b:Host):boolean{return a.financial===b.financial&&a.grid===b.grid&&a.paper===b.paper&&a.paperBook===b.paperBook&&a.alerts===b.alerts&&a.input===b.input&&a.chart===b.chart&&a.dataset===b.dataset&&a.rows===b.rows&&a.ready===b.ready&&a.held===b.held&&a.ordinary===b.ordinary;}
interface Entry {
 view:CompoundBookEntry;cost:Cost;stateCost:Cost;
 definitions:Map<number,CompoundDefinition>;counts:Map<number,number>;
 bindings:Map<string,CompoundJournalBinding>;bindingSequence:number;
}
function entryView(store:CompoundAlertStore,state:CompoundState,generation:object,delivery:Readonly<AlertDeliverySettings>,declarations:CompoundDocumentSnapshot['declarations'],journal:CompoundJournalNode|null):CompoundBookEntry{
 return freeze({id:state.definition.id,generation,store,state,delivery,declarations,journal});
}
function declarations(map:ReadonlyMap<number,CompoundDefinition>):CompoundDocumentSnapshot['declarations']{return freeze([...map].map(([revision,definition])=>freeze({revision,definition})));}

/** Canonical stores/history live beside Workspace. Per-tick publication does
 * not enumerate the book, flatten history, copy the declaration table or walk
 * earlier journal nodes. Mutation permission comes only from the actual
 * constructor-selected observer's final acknowledgment, not from these labels. */
export class CompoundAlertBook {
 #refs!:CompoundBookHostRefs;#entries=new Map<string,Entry>();#version=0n;#reviewVersion=0n;#usage={...BOOK_BASE_COST};#reserved=zero();
 #reservations=new WeakMap<()=>void,{remaining:Cost;live:boolean}>();
 #locked=false;#closed=false;#listeners=new Set<(event:CompoundBookEvent)=>void>();#errors:string[]=[];
 #emitBound=(event:CompoundBookEvent)=>this.#emit(event);
 constructor(refs:CompoundBookHostRefs){
  if(books.has(refs.financial))return fail('The actual financial ref already owns a compound book.');
  this.#refs=freeze({...refs});this.#host();books.set(refs.financial,this);
 }
 get version():bigint{return this.#version;}
 /** Replacement-review UI only. Save/commit MUST retain exact version CAS. */
 get reviewVersion():bigint{return this.#reviewVersion;}
 usage():CompoundBookUsage{return freeze({...this.#usage,reservedBytes:this.#reserved.bytes,reservedNodes:this.#reserved.nodes});}
 /** Explicit UI/save snapshot, O(collection count), never called by publish. */
 entries():readonly CompoundBookEntry[]{return freeze([...this.#entries.values()].map(entry=>entry.view));}
 entry(id:string):CompoundBookEntry|null{return this.#entries.get(id)?.view??null;}
 documentSnapshots():readonly CompoundDocumentSnapshot[]{return freeze(this.entries().map(entry=>freeze({state:entry.state,declarations:entry.declarations,delivery:entry.delivery,journal:entry.journal})));}
 subscribe(listener:(event:CompoundBookEvent)=>void):()=>void{if(this.#listeners.size>=32)return fail('Too many compound collection listeners.');this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};}
 notificationErrors():readonly string[]{const errors=freeze(this.#errors.slice());this.#errors=[];return errors;}
 /** Closing retires writers; records/accounting remain available for private
  * save. Observer.dispose never calls this or modifies collection accounting. */
 close():void{if(this.#locked)return fail('Compound collection publication is in progress.');this.#closed=true;this.#listeners.clear();this.#version++;}
 #host():Host{
  const r=this.#refs,financial=current(r.financial),input=current(r.currentInput),chart=current(r.activeController);
  const financialEpoch=integer(current(r.financialGeneration)),grid=integer(current(r.gridGeneration));
  const storage=current(r.storageMutation),workspace=current(r.workspaceTransaction);if(typeof storage!=='boolean'||typeof workspace!=='boolean')return fail('Compound Root holds require boolean data refs.');
  const ready=data(current(r.startup),'phase')==='ready'&&r.mainWindow===true;
  const replay=current(r.currentReplay),inputReplay=input?data(input,'replay'):null;
  const dataset=input?data(input,'dataset') as BarDataset:null,rows=input?data(input,'bars') as readonly Bar[]:null;
  const ordinary=replay===null&&inputReplay===null;
  if(dataset&&data(dataset,'bars')!==rows)return{financial:financialEpoch,grid,paper:data(financial,'paper'),paperBook:data(financial,'paperBook'),alerts:data(financial,'alerts'),input,chart,dataset:null,rows:null,ready,held:storage||workspace,ordinary};
  return{financial:financialEpoch,grid,paper:data(financial,'paper'),paperBook:data(financial,'paperBook'),alerts:data(financial,'alerts'),input,chart,dataset,rows,ready,held:storage||workspace,ordinary};
 }
 #available(host:Host):boolean{return !this.#closed&&!this.#locked&&host.ready&&!host.held&&host.ordinary;}
 #replacement():ReplacementHost{
  const r=this.#refs,f=current(r.financial),startup=current(r.startup),storage=current(r.storageMutation),workspace=current(r.workspaceTransaction);
  if(typeof storage!=='boolean'||typeof workspace!=='boolean')return fail('Compound replacement holds require actual boolean data refs.');
  return{financial:integer(current(r.financialGeneration)),grid:integer(current(r.gridGeneration)),paper:data(f,'paper'),paperBook:data(f,'paperBook'),alerts:data(f,'alerts'),startup,phase:data(startup,'phase'),storage,workspace};
 }
 #budget(add:Cost,replace:Cost=zero()):void{
  const total=plus(minus(this.#usage,replace),plus(this.#reserved,add));
  if(total.bytes>COMPOUND_PRIVATE_BYTES||total.nodes>MAX_NODES||total.history>COMPOUND_HISTORY_LIMIT)return fail('The retained compound collection exceeds its private budget.');
 }
 #reserve(cost:Cost):()=>void{
  this.#budget(cost);this.#reserved=plus(this.#reserved,cost);const record={remaining:{...cost},live:true};
  const release=()=>{if(record.live){record.live=false;enqueue(()=>{this.#reserved=minus(this.#reserved,record.remaining);record.remaining=zero();});}};
  apply(intrinsicWeakSet,this.#reservations,[release,record]);return release;
 }
 #promote(release:()=>void,amount:Cost):void{
  const record=apply(intrinsicWeakGet,this.#reservations,[release]) as {remaining:Cost;live:boolean}|undefined;if(!record||!record.live)return fail('Compound candidate reservation retired.');
  const remaining=minus(record.remaining,amount);if(remaining.bytes<0||remaining.nodes<0||remaining.history<0)return fail('Compound persistent metadata exceeds its candidate reservation.');
  record.remaining=remaining;this.#reserved=minus(this.#reserved,amount);
 }
 #checkPromotion(release:()=>void,amount:Cost):void{
  const record=apply(intrinsicWeakGet,this.#reservations,[release]) as {remaining:Cost;live:boolean}|undefined;
  if(!record||!record.live||amount.bytes>record.remaining.bytes||amount.nodes>record.remaining.nodes||amount.history>record.remaining.history)return fail('Compound metadata exceeds its admitted candidate reservation.');
 }
 #retire(cost:Cost):()=>void{
  // Transfer, not new admission: the matching cost leaves #usage in the SAME
  // callback-free section. It remains charged until owned notification unwind.
  this.#reserved=plus(this.#reserved,cost);let live=true;
  return()=>{if(live){live=false;enqueue(()=>{this.#reserved=minus(this.#reserved,cost);});}};
 }
 #emit(event:CompoundBookEvent):void{
  // Snapshot limits callback-driven listener insertion to the original <=32.
  // Throwing/falsy notification handlers cannot undo an acknowledged record.
  const listeners:Array<(event:CompoundBookEvent)=>void>=[];
  apply(intrinsicSetForEach,this.#listeners,[(listener:(event:CompoundBookEvent)=>void)=>{apply(intrinsicPush,listeners,[listener]);}]);
  for(let i=0;i<listeners.length;i++)try{listeners[i](event);}catch{if(this.#errors.length<16)apply(intrinsicPush,this.#errors,['Compound collection notification failed.']);}
 }
 #base():BookBase{const host=this.#host();if(!this.#available(host))return fail('The current main-window compound collection is suspended.');return{version:this.#version,host};}
 #adoptionBase():BookBase{if(this.#closed||this.#locked)return fail('The compound replacement owner retired.');return{version:this.#version,replacement:this.#replacement()};}
 #matches(base:BookBase):boolean{
  if(this.#version!==base.version||this.#closed||this.#locked)return false;
  if('replacement' in base)return sameReplacement(base.replacement,this.#replacement());
  const host=this.#host();return this.#available(host)&&sameHost(base.host,host);
 }
 #action(kind:CompoundBookChange['kind'],base:BookBase,release:()=>void,commit:()=>CompoundBookEntry|null,options:{deferred?:boolean;retired?:Cost;review?:boolean}={}):CompoundBookChange{
  const expectedVersion=base.version;let live=true,guard:BookBase|null=base,action:(()=>CompoundBookEntry|null)|null=commit;commit=()=>null;
  // The settled object must retain neither old host graphs nor mutation
  // closures. Guards and candidates occupy nullable slots only while pending.
  base=null as unknown as BookBase;
  return freeze({kind,expectedVersion,assertCurrent:()=>{if(!live||!guard||!this.#matches(guard))return fail('The prepared compound collection action is no longer current.');},commit:()=>{
   if(!live)return false;live=false;
   const run=action,owner=guard;action=null;guard=null;let retirement=()=>{},deferred=false;
   try{if(!owner||!this.#matches(owner)||!run)return false;this.#locked=true;let entry:CompoundBookEntry|null;try{if(options.retired)retirement=this.#retire(options.retired);entry=run();this.#version++;if(options.review!==false)this.#reviewVersion++;}finally{this.#locked=false;}
    const event=freeze({kind,version:this.#version,entry,fresh:null});
    if(options.deferred){deferred=true;deferredBookNotice(this.#emitBound,event,retirement,release);}else this.#emit(event);
    return true;
   }finally{if(!deferred){retirement();release();}}
  },rollback:()=>{if(!live)return false;live=false;action=null;guard=null;release();return true;}});
 }
 prepareCreate(definition:unknown,delivery:unknown):CompoundBookChange{
  const base=this.#base(),release=this.#reserve({bytes:PREPARE_BYTES,nodes:PREPARE_NODES,history:0});
  try{
   const store=new CompoundAlertStore(definition),state=stateOf(store),id=state.definition.id;if(this.#entries.has(id)||this.#entries.size>=MAX_ENTRIES)return fail('Compound alert identity or count is unavailable.');
   const d=copyDelivery(delivery),definitions=new Map([[state.revision,state.definition]]),view=entryView(store,state,freeze({}),d,declarations(definitions),null),sc=stateCost(state),cost=plus(sc,definitionCost(state.definition));
   if(cost.bytes>PREPARE_BYTES||cost.nodes>PREPARE_NODES)return fail('Compound candidate metadata exceeds its admitted preparation.');
   const entry:Entry={view,cost,stateCost:sc,definitions,counts:new Map([[state.revision,0]]),bindings:new Map(),bindingSequence:0};
   return this.#action('create',base,release,()=>{this.#promote(release,cost);this.#entries.set(id,entry);this.#usage=plus(this.#usage,cost);return view;});
  }catch(error){release();throw error;}
 }
 prepareEdit(id:string,expected:CompoundBookEntry,definition:unknown,delivery:unknown,now:number):CompoundBookChange{
  const base=this.#base(),entry=this.#entries.get(id);if(!entry||entry.view!==expected||stateOf(entry.view.store)!==expected.state)return fail('The compound edit owner changed.');
  const release=this.#reserve({bytes:PREPARE_BYTES+512*entry.definitions.size,nodes:PREPARE_NODES+16*entry.definitions.size,history:0});let prepared:CompoundPreparation|undefined;
  try{
   prepared=apply(editStore,entry.view.store,[definition,integer(now)]);const next=prepared!.next,d=copyDelivery(delivery),definitions=new Map(entry.definitions),counts=new Map(entry.counts);let removed=zero();
   if((counts.get(expected.state.revision)??0)===0){removed=definitionCost(expected.state.definition);definitions.delete(expected.state.revision);counts.delete(expected.state.revision);}
   definitions.set(next.revision,next.definition);counts.set(next.revision,0);
   const sc=stateCost(next),cost=plus(minus(minus(entry.cost,entry.stateCost),removed),plus(sc,definitionCost(next.definition)));
   const added=plus(sc,definitionCost(next.definition));if(added.bytes>PREPARE_BYTES||added.nodes>PREPARE_NODES)return fail('Compound edit metadata exceeds preparation budget.');
   const view=entryView(expected.store,next,freeze({}),d,declarations(definitions),expected.journal),p=prepared!;
   const growth=positive(minus(cost,entry.cost)),retired=positive(minus(entry.cost,cost));
   return this.#action('edit',base,release,()=>{
    if(entry.view!==expected||!p.commit())return fail('The canonical compound edit changed.');
    this.#promote(release,growth);this.#usage=plus(minus(this.#usage,entry.cost),cost);entry.view=view;entry.cost=cost;entry.stateCost=sc;entry.definitions=definitions;entry.counts=counts;return view;
   },{retired});
  }catch(error){prepared?.rollback();release();throw error;}
 }
 prepareRemove(id:string,expected:CompoundBookEntry):CompoundBookChange{
  const base=this.#base(),entry=this.#entries.get(id);if(!entry||entry.view!==expected)return fail('The compound removal owner changed.');
  const release=this.#reserve({bytes:1024,nodes:8,history:0});
  return this.#action('remove',base,release,()=>{if(entry.view!==expected)return fail('The compound removal owner changed.');this.#entries.delete(id);this.#usage=minus(this.#usage,entry.cost);return null;},{retired:entry.cost});
 }
 prepareLifecycle(id:string,expected:CompoundBookEntry,kind:keyof typeof methods,now:number):CompoundBookChange{
  const base=this.#base(),entry=this.#entries.get(id);integer(now);if(!entry||entry.view!==expected||stateOf(expected.store)!==expected.state)return fail('The compound lifecycle owner changed.');
  const state=expected.state;if(now<state.clock||now<state.armedAt||state.lastTime!==null&&now<state.lastTime)return fail('Compound lifecycle clock moved backwards.');
  if(kind==='rearm'&&(state.definition.expiresAt!==null&&state.definition.expiresAt<=now||state.reason==='history-limit'||state.revision>=Number.MAX_SAFE_INTEGER))return fail('This compound declaration cannot be rearmed.');
  if(!hasOwn(methods,kind))return fail('Unsupported compound lifecycle action.');
  const release=this.#reserve({bytes:PREPARE_BYTES+512*entry.definitions.size,nodes:PREPARE_NODES+16*entry.definitions.size,history:0});
  try{
  // Lifecycle methods are captured canonical domain methods with no callbacks.
  // The current table is prepared before the critical state transition.
  const defs=new Map(entry.definitions),counts=new Map(entry.counts);let removed=zero(),added=zero();
  if(kind==='rearm'){if((counts.get(state.revision)??0)===0){defs.delete(state.revision);counts.delete(state.revision);removed=definitionCost(state.definition);}defs.set(state.revision+1,state.definition);counts.set(state.revision+1,0);added=definitionCost(state.definition);}
  const table=kind==='rearm'?declarations(defs):expected.declarations;
  const nextView={id:expected.id,generation:kind==='advance'?expected.generation:freeze({}),store:expected.store,state,delivery:expected.delivery,declarations:table,journal:expected.journal};
  // Domain lifecycle clears or retains sample text; it cannot enlarge it.
  // Keep its already-paid old state allowance rather than guessing a refund.
  const cost=plus(minus(entry.cost,removed),added),sc=entry.stateCost;
  const growth=positive(minus(cost,entry.cost)),retired=positive(minus(entry.cost,cost));
  const review=kind!=='advance'||state.status!=='stopped'&&state.status!=='expired'&&state.definition.expiresAt!==null&&now>=state.definition.expiresAt;
  return this.#action('lifecycle',base,release,()=>{
   if(entry.view!==expected||stateOf(expected.store)!==state)return fail('The compound lifecycle owner changed.');
   apply(methods[kind],expected.store,[now]);nextView.state=stateOf(expected.store);const view=freeze(nextView);
   this.#promote(release,growth);this.#usage=plus(minus(this.#usage,entry.cost),cost);entry.view=view;entry.cost=cost;entry.stateCost=sc;entry.definitions=defs;entry.counts=counts;return view;
  },{retired,review});
  }catch(error){release();throw error;}
 }
 /** Explicit load/replace only, O(H); this path never emits a fresh journal. */
 prepareAdopt(json:string,now:number):CompoundBookChange{
  const base=this.#adoptionBase();if(typeof json!=='string'||json.length>COMPOUND_PRIVATE_BYTES)return fail('Compound private ingress exceeds bounds.');
  // Pre-admit a conservative maximum from the already bounded input text.
  const peak={bytes:65536+64*json.length,nodes:2048+8*json.length,history:Math.min(COMPOUND_HISTORY_LIMIT,Math.floor(json.length/32))},release=this.#reserve(peak);
  try{
   const restored=restoreCompoundPrivateCollection(json,integer(now)),entries=new Map<string,Entry>();let cost={...BOOK_BASE_COST};
   for(const record of restored){const entry=this.#restored(record);if(entries.has(entry.view.id))return fail('Duplicate compound restored identity.');entries.set(entry.view.id,entry);cost=plus(cost,entry.cost);}
   const born=minus(cost,BOOK_BASE_COST),retired=minus(this.#usage,BOOK_BASE_COST);
   if(born.bytes>peak.bytes||born.nodes>peak.nodes||born.history>peak.history)return fail('Compound restored records exceed admitted metadata.');
   return this.#action('adopt',base,release,()=>{this.#promote(release,born);this.#entries=entries;this.#usage=cost;return null;},{retired,deferred:true});
  }catch(error){release();throw error;}
 }
 #restored(record:RestoredCompoundRecord):Entry{
  const state=stateOf(record.store),definitions=new Map(record.declarations.map(d=>[d.revision,d.definition])),counts=new Map<number,number>(),bindings=new Map<string,CompoundJournalBinding>();let cost=stateCost(state),actual=state.history,node=record.journal,bindingSequence=0;
  for(const d of record.declarations)cost=plus(cost,definitionCost(d.definition));
  while(node){if(!actual||node.item!==actual.item)return fail('Restored compound journal is not canonical.');cost=plus(cost,journalCost(node));counts.set(node.item.revision,(counts.get(node.item.revision)??0)+1);const key=bindingKey(node.binding);if(!bindings.has(key)){bindings.set(key,node.binding);cost=plus(cost,bindingCost(node.binding));const sequence=/^book-binding-(\d+)$/.exec(node.binding.id);if(sequence)bindingSequence=Math.max(bindingSequence,integer(Number(sequence[1])));}node=node.previous;actual=actual.previous;}
  if(actual||definitions.get(state.revision)!==state.definition)return fail('Restored compound declaration owner is not canonical.');
  if(!counts.has(state.revision))counts.set(state.revision,0);
  return{view:entryView(record.store,state,freeze({}),record.delivery,record.declarations,record.journal),cost,stateCost:stateCost(state),definitions,counts,bindings,bindingSequence};
 }
 /** Read-only collection availability; never source/numeric/mutation authority.
  * The actual action still runs the unchanged fresh #base/#matches guards. */
 describeCollectionAvailability():boolean{return this.#available(this.#host());}
 /** Descriptive current-source context only. This reads the actual fixed Root
  * refs and the existing private producer membership helper. It returns no
  * rows, receipt, numeric/native/currentness or export authority. */
 describeCurrentSource():ReturnType<typeof compoundSourceContext>{
  const before=this.#host();if(!this.#available(before)||!before.chart||!before.dataset||!before.rows)return null;
  const context=compoundSourceContext(before.dataset,before.rows),after=this.#host();
  return context&&this.#available(after)&&sameHost(before,after)?context:null;
 }
 createWriter(id:string):CompoundRootWriter{
  let initial:Entry|null=this.#entries.get(id)??null;if(!initial)return fail('Compound writer has no current entry.');
  const entryRef=new WeakRef(initial),generation=initial.view.generation;initial=null;
  let actual:Host|null=this.#host();
  const opening={financial:actual.financial,grid:actual.grid,paper:identityPin(actual.paper),paperBook:identityPin(actual.paperBook),alerts:identityPin(actual.alerts)};actual=null;
  let expired=false;
  const read=():CompoundRootOwner|null=>{
   const entry=entryRef.deref();if(!entry)return null;
   if(expired||this.#closed||this.#locked||mapGet(this.#entries,id)!==entry||entry.view.generation!==generation)return null;
   const host=this.#host();if(host.financial!==opening.financial||host.grid!==opening.grid||!matchesIdentity(opening.paper,host.paper)||!matchesIdentity(opening.paperBook,host.paperBook)||!matchesIdentity(opening.alerts,host.alerts)){expired=true;return null;}
   const view=entry.view;if(!this.#available(host)||!host.chart||!host.dataset||!host.rows||stateOf(view.store)!==view.state)return null;
   return freeze({chart:host.chart,dataset:host.dataset,rows:host.rows,store:view.store,definitionRevision:view.state.revision,execution:'ordinary',enabled:view.state.status==='active'||view.state.status==='waiting-for-data',suspended:false});
  };
  return freeze({read,publish:(expected:CompoundRootOwner,next:CompoundState,acknowledge:()=>boolean,binding:CompoundPublicationBinding|null)=>{
   const entry=entryRef.deref();if(!entry)return false;
   const owner=read();if(!owner||!owner.enabled||owner.chart!==expected.chart||owner.dataset!==expected.dataset||owner.rows!==expected.rows||owner.store!==expected.store||owner.definitionRevision!==expected.definitionRevision||expected.execution!=='ordinary'||expected.enabled!==true||expected.suspended!==false)return false;
   const view=entry.view,base=this.#version,host=this.#host();if(!next||next===view.state||next.definition!==view.state.definition||next.revision!==view.state.revision)return false;
   compoundHistorySize(next); // Actual canonical state membership; no row read.
   const release=this.#reserve({bytes:PREPARE_BYTES,nodes:PREPARE_NODES,history:next.history===view.state.history?0:1});
   let retirement=()=>{};
   try{
   let journal=view.journal,newBinding:CompoundJournalBinding|null=null,key:string|null=null,extra=zero();
   const nextHistory=next.history,oldHistory=view.state.history,facts=compoundPublicationBindingFacts(binding);
   if(nextHistory!==oldHistory){
    if(!nextHistory||nextHistory.previous!==oldHistory||nextHistory.size!==(oldHistory?.size??0)+1||!facts||facts.declaration!==view.state.definition||facts.revision!==view.state.revision||facts.restriction!=='restricted-live')return false;
    const item=nextHistory.item;if(item.revision!==facts.revision||item.alertId!==id)return false;
    // Producer metadata is descriptive. Copy/freeze it BEFORE the final guard;
    // the actual observer still supplies and acknowledges numerical ownership.
    const p=facts.provenance,provenance=freeze({providerId:p.providerId,datasetId:p.datasetId,revision:p.revision,resolution:p.resolution,basis:p.basis});
    if(!validProvenanceText(p.providerId)||!validProvenanceText(p.datasetId)||!validProvenanceText(p.revision)||!validProvenanceText(p.resolution)||!validProvenanceText(p.basis)||provenance.datasetId!==view.state.definition.context.sourceFamily||provenance.basis!==view.state.definition.context.basis||provenance.resolution!==view.state.definition.context.interval)return false;
    key=bindingKey({revision:next.revision,provenance});let actual=mapGet(entry.bindings,key);
    if(!actual){if(entry.bindingSequence>=Number.MAX_SAFE_INTEGER)return false;newBinding=freeze({id:`book-binding-${entry.bindingSequence+1}`,revision:next.revision,declaration:next.definition,restriction:'restricted-live',provenance});actual=newBinding;extra=plus(extra,bindingCost(actual));}
    journal=freeze({item,binding:actual,delivery:view.delivery,previous:journal,size:nextHistory.size});extra=plus(extra,journalCost(journal));
   }
   const sc=stateCost(next),cost=plus(minus(entry.cost,entry.stateCost),plus(sc,extra)),growth=positive(minus(cost,entry.cost)),retired=positive(minus(entry.cost,cost));this.#checkPromotion(release,growth);
   const nextView=entryView(view.store,next,generation,view.delivery,view.declarations,journal),nextUsage=plus(minus(this.#usage,entry.cost),cost),nextVersion=base+1n;
   const nextCount=(mapGet(entry.counts,next.revision)??0)+1,event=freeze({kind:'observation' as const,version:nextVersion,entry:nextView,fresh:nextHistory!==oldHistory?journal:null});
   const nextReview=this.#reviewVersion+(nextHistory!==oldHistory||next.status!==view.state.status||next.reason!==view.state.reason?1n:0n);
   // All allocation, candidate metadata and budget work is complete. Bind the
   // private lookup slot before acknowledgment, and undo it on refusal. No H
   // traversal or public callback lies between final owner guard and ack.
   if(newBinding&&key)mapSet(entry.bindings,key,newBinding);
   let acknowledged=false;
   try{
    const final=read();if(!final||this.#version!==base||entry.view!==view||stateOf(view.store)!==view.state||!sameHost(host,this.#host())||final.chart!==expected.chart||final.dataset!==expected.dataset||final.rows!==expected.rows)return false;
    this.#locked=true;
    try{
     if(acknowledge()!==true)return false;
     if(stateOf(view.store)!==next)return fail('Compound acknowledgment did not commit the actual canonical store.');
     // Authoritative state/version assignment, immediately after ack. Captured
     // canonical getter only; no React/delivery/host callback in this section.
     this.#promote(release,growth);retirement=this.#retire(retired);entry.view=nextView;this.#usage=nextUsage;entry.cost=cost;entry.stateCost=sc;
     if(newBinding)entry.bindingSequence++;
     if(nextHistory!==oldHistory)mapSet(entry.counts,next.revision,nextCount);
     this.#version=nextVersion;this.#reviewVersion=nextReview;acknowledged=true;
    }finally{this.#locked=false;}
    this.#emit(event);return true;
   }finally{if(!acknowledged&&newBinding&&key&&mapGet(entry.bindings,key)===newBinding)mapDelete(entry.bindings,key);}
   }finally{retirement();release();}
  }});
 }
}
export function compoundAlertBookFor(financial:object):CompoundAlertBook|null{return books.get(financial)??null;}
