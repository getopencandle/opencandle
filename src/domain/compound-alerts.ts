/** Original LV scalar domain policy. These DTOs and transactions carry NO source
 * permission. The later coordinator must acquire a genuine coherent source cut,
 * validate all source owners, and publish atomically with its own collection.
 * No provider, renderer, registrar, history resolver or callback runs in reduce(). */
export const COMPOUND_POLICY = 'lv-coherent-asof-v1' as const;
export const COMPOUND_HISTORY_LIMIT = 100000;
export type CompoundFrequency = 'only-once'|'once-per-bar'|'once-per-bar-close'|'once-per-minute'|'every-time';
export type CompoundOperator =
 | Readonly<{kind:'greater'|'less'|'crossing'|'crossing-up'|'crossing-down';value:number}>
 | Readonly<{kind:'inside'|'outside'|'entering'|'exiting';lower:number;upper:number}>;
export type CompoundSource = Readonly<{kind:'price';field:'open'|'high'|'low'|'close'|'hl2'|'hlc3'|'ohlc4'}>
 | Readonly<{kind:'indicator';indicator:string;plot:string;snapshotId:string;inputs:Readonly<Record<string,number|string|boolean|null>>}>;
export interface CompoundContext {
 readonly instrumentId:string; readonly sourceFamily:string;
 readonly interval:'1m'|'5m'|'15m'|'60m'|'1D'; readonly session:'regular'|'extended'; readonly basis:string;
}
export interface CompoundPredicate {readonly id:string;readonly source:CompoundSource;readonly operator:CompoundOperator}
export interface CompoundDefinition {
 readonly kind:'compound';readonly schemaVersion:1;readonly policy:typeof COMPOUND_POLICY;readonly mode:'ordinary';
 readonly id:string;readonly name:string;readonly message:string;readonly context:Readonly<CompoundContext>;
 readonly predicates:readonly CompoundPredicate[];readonly frequency:CompoundFrequency;readonly createdAt:number;readonly expiresAt:number|null;
}
/** Values are numerical test/integration inputs, not evidence of a producer. All
 * samples must describe one SAME-interval cut; no partial/latest-event joining. */
export interface CompoundSample {readonly predicateId:string;readonly value:number|null;readonly sequence:number;readonly time:number;readonly availableAt:number;readonly barId:string;readonly confirmed:boolean}
export interface CompoundBatch {
 readonly context:Readonly<CompoundContext>;readonly mode:'ordinary';readonly sequence:number;readonly observedAt:number;
 readonly cutoffTime:number;readonly barId:string;readonly barTime:number;readonly barClosed:boolean;
 readonly kind:'observation'|'gap'|'correction'|'unavailable';readonly samples:readonly CompoundSample[];
}
export interface CompoundNotification {
 readonly id:string;readonly alertId:string;readonly revision:number;readonly sequence:number;readonly at:number;
 readonly barId:string;readonly values:readonly number[];readonly local:true;
}
interface History {readonly item:CompoundNotification;readonly previous:History|null;readonly size:number}
interface SampleState {readonly sequence:number;readonly time:number;readonly value:number|null}
export interface CompoundState {
 readonly definition:CompoundDefinition;readonly revision:number;readonly armedAt:number;readonly clock:number;
 readonly status:'active'|'waiting-for-data'|'paused'|'stopped'|'expired';
 readonly reason:null|'unavailable'|'only-once'|'history-limit'|'manual'|'expired';
 readonly lastSequence:number|null;readonly lastTime:number|null;readonly barId:string|null;readonly barTime:number|null;
 readonly closedBarTime:number|null;readonly previous:readonly(number|null)[];readonly previousClosed:readonly(number|null)[];
 readonly samples:readonly(SampleState|null)[];readonly lastTriggeredBar:string|null;readonly lastTriggeredAt:number|null;
 readonly history:History|null;
}
export interface CompoundPreparation {
 readonly base:CompoundState;readonly next:CompoundState;readonly notification:CompoundNotification|null;
 readonly diagnostic:string|null;
 /** publish must perform the outer collection's compare-and-publish. Reentry
  * invalidates this transaction; no old transaction can restore newer state. */
 commit(publish?:(next:CompoundState,base:CompoundState)=>boolean):boolean;
 rollback():boolean;
}
const frequencies:readonly string[]=['only-once','once-per-bar','once-per-bar-close','once-per-minute','every-time'];
const stateOwners=new WeakSet<object>(); // Domain-state identity only; never source authority.
const freeze=<T extends object>(value:T):Readonly<T>=>Object.freeze(value);
const fail=(message:string):never=>{throw new Error(message);};
const integer=(value:unknown,name:string):number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:fail('Invalid '+name+'.');
const finite=(value:unknown,name:string):number=>typeof value==='number'&&Number.isFinite(value)?value:fail('Invalid '+name+'.');
const text=(value:unknown,name:string,max=500):string=>typeof value==='string'&&value.length>0&&value.length<=max?value:fail('Invalid '+name+'.');
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail('Expected a plain record.');
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))return fail('Unexpected record fields.');
 const result:Record<string,unknown>=Object.create(null);
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!d.enumerable||!Object.hasOwn(d,'value'))return fail('Accessor or hidden record field.');result[key]=d.value;}
 return result;
}
function list(value:unknown,min:number,max:number):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return fail('Expected an ordinary array.');
 const count=Object.getOwnPropertyDescriptor(value,'length')?.value;
 if(!Number.isSafeInteger(count)||count<min||count>max||Reflect.ownKeys(value).length!==count+1)return fail('Invalid array bounds.');
 const result:unknown[]=[];for(let i=0;i<count;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!d.enumerable||!Object.hasOwn(d,'value'))return fail('Sparse or accessor array.');result.push(d.value);}return result;
}
function context(value:unknown):Readonly<CompoundContext>{
 const r=record(value,['instrumentId','sourceFamily','interval','session','basis']);
 if(typeof r.interval!=='string'||!['1m','5m','15m','60m','1D'].includes(r.interval)||typeof r.session!=='string'||!['regular','extended'].includes(r.session))return fail('Unsupported interval/session.');
 return freeze({instrumentId:text(r.instrumentId,'instrument'),sourceFamily:text(r.sourceFamily,'source family'),interval:r.interval as CompoundContext['interval'],session:r.session as CompoundContext['session'],basis:text(r.basis,'basis')});
}
function sameContext(a:Readonly<CompoundContext>,b:Readonly<CompoundContext>):boolean{return a.instrumentId===b.instrumentId&&a.sourceFamily===b.sourceFamily&&a.interval===b.interval&&a.session===b.session&&a.basis===b.basis;}
function source(value:unknown):CompoundSource{
 if(!value||typeof value!=='object')return fail('Invalid source declaration.');
 const kind=Object.getOwnPropertyDescriptor(value,'kind');if(!kind||!Object.hasOwn(kind,'value'))return fail('Invalid source kind.');
 if(kind.value==='price'){const r=record(value,['kind','field']);if(r.kind!==kind.value)return fail('Source tag changed during capture.');if(typeof r.field!=='string'||!['open','high','low','close','hl2','hlc3','ohlc4'].includes(r.field))return fail('Unsupported price field.');return freeze({kind:'price',field:r.field as Extract<CompoundSource,{kind:'price'}>['field']});}
 if(kind.value!=='indicator')return fail('Only price/frozen indicator declarations are supported.');
 const r=record(value,['kind','indicator','plot','snapshotId','inputs']);
 if(r.kind!==kind.value)return fail('Source tag changed during capture.');
 if(!r.inputs||typeof r.inputs!=='object'||Array.isArray(r.inputs)||![Object.prototype,null].includes(Object.getPrototypeOf(r.inputs)))return fail('Invalid frozen inputs.');
 const keys=Reflect.ownKeys(r.inputs);if(keys.length>32||keys.some(key=>typeof key!=='string'||!key.length||key.length>64||['__proto__','prototype','constructor'].includes(key)))return fail('Frozen inputs exceed bounds.');
 const inputRecord=record(r.inputs,keys as string[]),inputs:Record<string,number|string|boolean|null>=Object.create(null);
 for(const key of keys as string[]){const v=inputRecord[key];if(v!==null&&typeof v!=='boolean'&&!(typeof v==='string'&&v.length<=200)&&!(typeof v==='number'&&Number.isFinite(v)))return fail('Invalid frozen input value.');inputs[key]=v as number|string|boolean|null;}
 return freeze({kind:'indicator',indicator:text(r.indicator,'indicator',100),plot:text(r.plot,'plot',100),snapshotId:text(r.snapshotId,'snapshot'),inputs:freeze(inputs)});
}
function operator(value:unknown):CompoundOperator{
 if(!value||typeof value!=='object')return fail('Invalid operator.');
 const d=Object.getOwnPropertyDescriptor(value,'kind');if(!d||!Object.hasOwn(d,'value'))return fail('Invalid operator kind.');
 if(['greater','less','crossing','crossing-up','crossing-down'].includes(d.value)){
  const r=record(value,['kind','value']);if(r.kind!==d.value)return fail('Operator tag changed during capture.');return freeze({kind:r.kind as 'greater',value:finite(r.value,'threshold')});
 }
 if(['inside','outside','entering','exiting'].includes(d.value)){
  const r=record(value,['kind','lower','upper']);if(r.kind!==d.value)return fail('Operator tag changed during capture.');const lower=finite(r.lower,'lower bound'),upper=finite(r.upper,'upper bound');if(lower>upper)return fail('Unordered channel.');return freeze({kind:r.kind as 'inside',lower,upper});
 }
 return fail('Movement/position/levels and unknown operators are unsupported.');
}
/** Strict bounded declaration parsing. This is not producer admission. Catalog
 * eligibility and authentic frozen calculation ownership belong to integration. */
export function parseCompoundDefinition(input:unknown):CompoundDefinition{
 const r=record(input,['kind','schemaVersion','policy','mode','id','name','message','context','predicates','frequency','createdAt','expiresAt']);
 if(r.kind!=='compound'||r.schemaVersion!==1||r.policy!==COMPOUND_POLICY||r.mode!=='ordinary'||typeof r.frequency!=='string'||!frequencies.includes(r.frequency))return fail('Unsupported compound definition policy.');
 const createdAt=integer(r.createdAt,'creation time'),expiresAt=r.expiresAt===null?null:integer(r.expiresAt,'expiry');if(expiresAt!==null&&expiresAt<=createdAt)return fail('Expiry must follow creation.');
 const ids=new Set<string>(),predicates=list(r.predicates,2,5).map(item=>{const p=record(item,['id','source','operator']),id=text(p.id,'predicate identity',100);if(ids.has(id))return fail('Duplicate predicate identity.');ids.add(id);return freeze({id,source:source(p.source),operator:operator(p.operator)});});
 if(typeof r.message!=='string'||r.message.length>4000)return fail('Invalid message.');
 const name=text(r.name,'name',200);if(!name.trim())return fail('Name is required.');
 const result=freeze<CompoundDefinition>({kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:text(r.id,'alert identity'),name,message:r.message,context:context(r.context),predicates:freeze(predicates),frequency:r.frequency as CompoundFrequency,createdAt,expiresAt});
 if(JSON.stringify(result).length>65536)return fail('Encoded declaration exceeds bounds.');return result;
}
export function restoreCompoundDefinition(json:string):CompoundDefinition{if(typeof json!=='string'||json.length>65536)return fail('Declaration text exceeds bounds.');return parseCompoundDefinition(JSON.parse(json));}
export function serializeCompoundDefinition(definition:CompoundDefinition):string{return JSON.stringify(parseCompoundDefinition(definition));}
function ownState(value:CompoundState):CompoundState{if(!stateOwners.has(value))return fail('State was not created by this domain engine.');return value;}
function state(value:CompoundState):CompoundState{const next=freeze(value);stateOwners.add(next);return next;}
function emptyValues(count:number):readonly null[]{return freeze(Array<null>(count).fill(null));}
export function createCompoundState(input:unknown):CompoundState{
 const definition=parseCompoundDefinition(input),empty=emptyValues(definition.predicates.length);
 return state({definition,revision:1,armedAt:definition.createdAt,clock:definition.createdAt,status:'active',reason:null,lastSequence:null,lastTime:null,barId:null,barTime:null,closedBarTime:null,previous:empty,previousClosed:empty,samples:freeze(Array<null>(empty.length).fill(null)),lastTriggeredBar:null,lastTriggeredAt:null,history:null});
}
function batch(input:unknown,d:CompoundDefinition):CompoundBatch{
 const r=record(input,['context','mode','sequence','observedAt','cutoffTime','barId','barTime','barClosed','kind','samples']);
 // Reject foreign context before reading sample records or their scalar fields.
 const c=context(r.context);if(!sameContext(c,d.context)||r.mode!=='ordinary')return fail('Batch context differs; mixed intervals/replay are unsupported.');
 const sequence=integer(r.sequence,'batch sequence'),observedAt=integer(r.observedAt,'observation time'),cutoffTime=integer(r.cutoffTime,'information cutoff'),barTime=integer(r.barTime,'bar time'),barId=text(r.barId,'bar identity');
 if(cutoffTime>observedAt||barTime>cutoffTime||typeof r.barClosed!=='boolean'||typeof r.kind!=='string'||!['observation','gap','correction','unavailable'].includes(r.kind))return fail('Invalid batch timing/kind.');
 const samples=list(r.samples,d.predicates.length,d.predicates.length).map((item,index)=>{
  const s=record(item,['predicateId','value','sequence','time','availableAt','barId','confirmed']);
  if(s.predicateId!==d.predicates[index].id||s.barId!==barId||typeof s.confirmed!=='boolean'||r.barClosed&&!s.confirmed)return fail('Incomplete, reordered or inconsistent same-interval cut.');
  const time=integer(s.time,'source time'),availableAt=integer(s.availableAt,'source availability');if(time<barTime||time>cutoffTime||availableAt<time||availableAt>observedAt)return fail('Future or inconsistent source value.');
  return freeze({predicateId:s.predicateId as string,value:s.value===null?null:finite(s.value,'sample value'),sequence:integer(s.sequence,'sample sequence'),time,availableAt,barId,confirmed:s.confirmed});
 });
 return freeze({context:c,mode:'ordinary',sequence,observedAt,cutoffTime,barTime,barId,barClosed:r.barClosed,kind:r.kind as CompoundBatch['kind'],samples:freeze(samples)});
}
/** Pure arithmetic V2 predicates; no independently notifying single alerts. */
export function compoundPredicateMatches(op:CompoundOperator,previous:number|null,current:number,newSample:boolean):boolean{
 if('value'in op){const up=previous!==null&&previous<op.value&&current>=op.value,down=previous!==null&&previous>op.value&&current<=op.value;
  if(op.kind==='greater')return current>op.value;if(op.kind==='less')return current<op.value;
  return newSample&&(op.kind==='crossing-up'?up:op.kind==='crossing-down'?down:up||down);
 }
 const inside=(v:number)=>v>op.lower&&v<op.upper,outside=(v:number)=>v<op.lower||v>op.upper;
 if(op.kind==='inside')return inside(current);if(op.kind==='outside')return outside(current);
 return newSample&&previous!==null&&(op.kind==='entering'?outside(previous)&&inside(current):inside(previous)&&outside(current));
}
function clear(s:CompoundState):Pick<CompoundState,'previous'|'previousClosed'>{const empty=emptyValues(s.definition.predicates.length);return{previous:empty,previousClosed:empty};}
interface Reduction {next:CompoundState;notification:CompoundNotification|null;diagnostic:string|null}
function reduce(s:CompoundState,b:CompoundBatch,allowNotifications=true):Reduction{
 const unchanged=(diagnostic:string|null):Reduction=>({next:s,notification:null,diagnostic});
 if(b.observedAt<s.clock||b.observedAt<s.armedAt||s.lastTime!==null&&b.observedAt<s.lastTime||s.lastSequence!==null&&b.sequence<=s.lastSequence)return unchanged('Duplicate, old or pre-arm batch.');
 if(s.status==='stopped'||s.status==='expired')return unchanged('Alert is terminal; explicit rearm is required.');
 if(s.definition.expiresAt!==null&&b.observedAt>=s.definition.expiresAt)return{next:state({...s,...clear(s),clock:b.observedAt,status:'expired',reason:'expired'}),notification:null,diagnostic:'Alert expired.'};
 if(s.status==='paused')return unchanged('Alert is manually paused.');
 // Health changes have their OWN batch ordinal, not a fabricated price/source
 // revision. Retain the last known numerical pins while clearing every event
 // baseline. No stale source value or bar metadata is adopted as usable here.
 if(b.kind==='unavailable'||b.samples.some(v=>v.value===null))return{next:state({...s,...clear(s),clock:b.observedAt,lastSequence:b.sequence,lastTime:b.observedAt,status:'waiting-for-data',reason:'unavailable'}),notification:null,diagnostic:'One or more conditions are unavailable.'};
 if(s.barTime!==null&&(b.barTime<s.barTime||b.barTime===s.barTime&&b.barId!==s.barId||b.barTime!==s.barTime&&b.barId===s.barId))return unchanged('Old or inconsistent driver bar.');
 for(let i=0;i<b.samples.length;i++){const old=s.samples[i],v=b.samples[i];if(old&&(v.sequence<old.sequence||v.time<old.time||v.sequence===old.sequence&&(!Object.is(v.value,old.value)||v.time!==old.time)))return unchanged('Source sequence/revision regressed or changed in place.');}
 const recoverClosed=(s.status==='waiting-for-data'||!allowNotifications)&&b.kind==='observation'&&b.barClosed&&b.barTime===s.closedBarTime&&b.barTime===s.barTime&&b.barId===s.barId;
 if(b.kind==='observation'&&s.closedBarTime!==null&&b.barTime<=s.closedBarTime&&!recoverClosed)return unchanged('Completed driver bar cannot be replayed.');
 if(allowNotifications&&b.kind==='observation'&&s.status!=='waiting-for-data'&&!b.barClosed&&b.samples.every((v,i)=>s.samples[i]?.sequence===v.sequence))return unchanged('No new source observation.');
 const samples=freeze(b.samples.map(v=>freeze({sequence:v.sequence,time:v.time,value:v.value})));
 const head={...s,clock:b.observedAt,lastSequence:b.sequence,lastTime:b.observedAt,barId:b.barId,barTime:b.barTime,samples};
 const values=freeze(b.samples.map(v=>v.value as number)),priming=b.kind==='gap'||b.kind==='correction'||s.status==='waiting-for-data',previous=priming?emptyValues(values.length):s.previous,previousClosed=priming?emptyValues(values.length):s.previousClosed;
 const eligible=s.definition.frequency!=='once-per-bar-close'||b.barClosed;
 const matches=allowNotifications&&!recoverClosed&&b.kind!=='correction'&&eligible&&s.definition.predicates.every((p,i)=>compoundPredicateMatches(p.operator,s.definition.frequency==='once-per-bar-close'?previousClosed[i]:previous[i],values[i],!priming&&(s.definition.frequency==='once-per-bar-close'?b.barClosed:s.samples[i]===null||b.samples[i].sequence!==s.samples[i]!.sequence)));
 let next:CompoundState={...head,status:'active',reason:null,previous:values,previousClosed:b.barClosed?values:previousClosed,closedBarTime:b.barClosed?b.barTime:s.closedBarTime};
 const perBar=s.definition.frequency==='once-per-bar'||s.definition.frequency==='once-per-bar-close';
 if(!matches||perBar&&s.lastTriggeredBar===b.barId||s.definition.frequency==='once-per-minute'&&s.lastTriggeredAt!==null&&b.observedAt-s.lastTriggeredAt<60)return{next:state(next),notification:null,diagnostic:recoverClosed?'Closed-bar health recovery primed without a trigger.':b.kind==='correction'?'Correction primed without a market trigger.':b.kind==='gap'?'Gap cleared event baselines.':null};
 if((s.history?.size??0)>=COMPOUND_HISTORY_LIMIT)return{next:state({...next,...clear(s),status:'paused',reason:'history-limit'}),notification:null,diagnostic:'Local history limit reached; earlier history retained.'};
 const notification=freeze({id:JSON.stringify([s.definition.id,s.revision,b.sequence]),alertId:s.definition.id,revision:s.revision,sequence:b.sequence,at:b.observedAt,barId:b.barId,values,local:true as const});
 const history=freeze({item:notification,previous:s.history,size:(s.history?.size??0)+1});
 next={...next,history,lastTriggeredBar:b.barId,lastTriggeredAt:b.observedAt,...(s.definition.frequency==='only-once'?{status:'stopped' as const,reason:'only-once' as const}:{})};
 return{next:state(next),notification,diagnostic:null};
}
/** O(H) export only; the reducer appends one persistent node in O(1). Older
 * state snapshots share frozen history. This function makes no source claim. */
export function compoundHistory(value:CompoundState):readonly CompoundNotification[]{const s=ownState(value),out:CompoundNotification[]=[];for(let node=s.history;node;node=node.previous)out.push(node.item);return freeze(out.reverse());}
export function compoundHistorySize(value:CompoundState):number{return ownState(value).history?.size??0;}
/** Private saved DATA, never producer/sample authority. The flat shape keeps
 * a100k journal out of recursive runtime-state JSON serialization. */
export interface CompoundSavedCore {
 readonly schemaVersion:1;readonly savedAt:number;readonly definition:CompoundDefinition;readonly revision:number;
 readonly status:CompoundState['status'];readonly batchHighWater:number|null;
 readonly declarations:readonly Readonly<{revision:number;definition:CompoundDefinition}>[];
 readonly history:readonly CompoundNotification[];
}
export const COMPOUND_PRIVATE_BYTES=20*1024*1024;
export function parseCompoundSavedCore(json:string):Readonly<CompoundSavedCore>{
 if(typeof json!=='string'||json.length>COMPOUND_PRIVATE_BYTES||new TextEncoder().encode(json).length>COMPOUND_PRIVATE_BYTES)return fail('Compound private state exceeds20MiB.');
 const r=record(JSON.parse(json),['schemaVersion','savedAt','definition','revision','status','batchHighWater','declarations','history']);
 if(r.schemaVersion!==1||typeof r.status!=='string'||!['active','waiting-for-data','paused','stopped','expired'].includes(r.status))return fail('Unsupported compound saved state.');
 const savedAt=integer(r.savedAt,'saved clock'),definition=parseCompoundDefinition(r.definition),revision=integer(r.revision,'saved revision');if(revision<1||savedAt<definition.createdAt)return fail('Invalid saved revision/clock.');
 const batchHighWater=r.batchHighWater===null?null:integer(r.batchHighWater,'batch high-water'),rawHistory=list(r.history,0,COMPOUND_HISTORY_LIMIT),bindings=new Map<number,CompoundDefinition>();
 const declarations=list(r.declarations,1,rawHistory.length+1).map(value=>{const d=record(value,['revision','definition']),v=integer(d.revision,'declaration revision'),parsed=parseCompoundDefinition(d.definition);if(v<1||v>revision||bindings.has(v)||parsed.id!==definition.id)return fail('Invalid historical declaration revision.');bindings.set(v,parsed);return freeze({revision:v,definition:parsed});});
 if(!bindings.has(revision)||serializeCompoundDefinition(bindings.get(revision)!)!==serializeCompoundDefinition(definition))return fail('Current declaration revision is missing or mismatched.');
 const used=new Set<number>([revision]),ids=new Set<string>();let sequence=-1,at=0,lastRevision=0;
 const history=rawHistory.map(value=>{const n=record(value,['id','alertId','revision','sequence','at','barId','values','local']),v=integer(n.revision,'notification revision'),declaration=bindings.get(v),seq=integer(n.sequence,'notification sequence'),time=integer(n.at,'notification clock'),id=text(n.id,'notification identity',8192),barId=text(n.barId,'notification bar');
  if(!declaration||n.alertId!==definition.id||n.local!==true||v<lastRevision||seq<=sequence||time<at||time<declaration.createdAt||time>savedAt||batchHighWater===null||seq>batchHighWater||id!==JSON.stringify([definition.id,v,seq])||ids.has(id))return fail('Invalid compound notification history.');
  const values=freeze(list(n.values,declaration.predicates.length,declaration.predicates.length).map(value=>finite(value,'historical value')));ids.add(id);used.add(v);sequence=seq;at=time;lastRevision=v;
  return freeze({id,alertId:definition.id,revision:v,sequence:seq,at:time,barId,values,local:true as const});
 });
 if(used.size!==bindings.size)return fail('Unreferenced declaration metadata.');
 if(r.status==='expired'&&(definition.expiresAt===null||definition.expiresAt>savedAt)||r.status==='stopped'&&(definition.frequency!=='only-once'||!history.some(item=>item.revision===revision)))return fail('Saved terminal status has no matching cause.');
 return freeze({schemaVersion:1,savedAt,definition,revision,status:r.status as CompoundState['status'],batchHighWater,declarations:freeze(declarations),history:freeze(history)});
}
/** Explicit save action only, O(H). Domain identity validates state shape only;
 * original provenance/export rights remain the separate ROOT document's duty. */
export function serializeCompoundSavedCore(value:CompoundState,declarations:CompoundSavedCore['declarations'],savedAt:number):string{
 const s=ownState(value);integer(savedAt,'save clock');if(savedAt<s.clock)return fail('Save clock moved backwards.');
 const H=s.history?.size??0,entries=list(declarations,1,H+1),chunks:string[]=[],encoder=new TextEncoder();let bytes=0;
 const add=(part:string)=>{if(part.length>COMPOUND_PRIVATE_BYTES-bytes)return fail('Compound private state exceeds20MiB.');bytes+=encoder.encode(part).length;if(bytes>COMPOUND_PRIVATE_BYTES)return fail('Compound private state exceeds20MiB.');chunks.push(part);};
 add('{"schemaVersion":1,"savedAt":'+savedAt+',"definition":');add(serializeCompoundDefinition(s.definition));add(',"revision":'+s.revision+',"status":'+JSON.stringify(s.status)+',"batchHighWater":'+s.lastSequence+',"declarations":[');
 entries.forEach((entry,index)=>{const d=record(entry,['revision','definition']),revision=integer(d.revision,'saved revision'),definition=parseCompoundDefinition(d.definition);if(index)add(',');add('{"revision":'+revision+',"definition":');add(serializeCompoundDefinition(definition));add('}');});add('],"history":[');
 const history=compoundHistory(s);history.forEach((item,index)=>{if(index)add(',');add(JSON.stringify(item));});add(']}');
 const json=chunks.join('');parseCompoundSavedCore(json);return json;
}
export class CompoundAlertStore {
 #state:CompoundState;#version=0;
 constructor(definition:unknown){this.#state=createCompoundState(definition);}
 /** Explicit load/replacement only. Ordinary save normalization must NEVER
  * invoke this constructor and reset a running collection. No source/session,
  * numerical sample pin or missed historical notification is restored. */
 static fromSaved(json:string,now:number):CompoundAlertStore{
  const saved=parseCompoundSavedCore(json);integer(now,'restore clock');if(now<saved.savedAt)return fail('Restore clock precedes private saved state.');
  const store=new CompoundAlertStore(saved.definition),base=store.#state,count=base.definition.predicates.length;let history:History|null=null;
  for(const item of saved.history)history=freeze({item,previous:history,size:((history as History|null)?.size??0)+1});
  let last:CompoundNotification|undefined;for(let i=saved.history.length-1;i>=0;i--)if(saved.history[i].revision===saved.revision){last=saved.history[i];break;}const expired=saved.definition.expiresAt!==null&&now>=saved.definition.expiresAt;
  const status=saved.status==='stopped'?'stopped':expired||saved.status==='expired'?'expired':saved.status==='paused'||saved.history.length>=COMPOUND_HISTORY_LIMIT?'paused':'waiting-for-data';
  store.#state=state({...base,revision:saved.revision,armedAt:now,clock:now,status,reason:status==='stopped'?'only-once':status==='expired'?'expired':status==='paused'?(saved.history.length>=COMPOUND_HISTORY_LIMIT?'history-limit':'manual'):'unavailable',lastSequence:saved.batchHighWater,lastTime:now,previous:emptyValues(count),previousClosed:emptyValues(count),samples:freeze(Array<null>(count).fill(null)),history,lastTriggeredBar:last?.barId??null,lastTriggeredAt:last?.at??null});
  return store;
 }
 get current():CompoundState{return this.#state;}
 /** Revision edit is a data transaction, not source acquisition or rearm by a
  * saved DTO. Original journal nodes are shared, with no whole-history copy. */
 prepareEdit(input:unknown,now:number):CompoundPreparation{
  this.#clock(now);const base=this.#state,version=this.#version,definition=parseCompoundDefinition(input);if(definition.id!==base.definition.id||definition.createdAt!==base.definition.createdAt||base.revision>=Number.MAX_SAFE_INTEGER||definition.expiresAt!==null&&definition.expiresAt<=now)return fail('Invalid edited compound definition.');
  // Explicit edit Save follows the existing LV single-alert restart policy.
  // A history-capacity pause is retained and cannot be bypassed by editing.
  const count=definition.predicates.length,status=base.reason==='history-limit'||(base.history?.size??0)>=COMPOUND_HISTORY_LIMIT?'paused':'waiting-for-data',next=state({...base,definition,revision:base.revision+1,armedAt:now,clock:now,status,reason:status==='paused'?'history-limit':'unavailable',lastTime:now,barId:null,barTime:null,closedBarTime:null,previous:emptyValues(count),previousClosed:emptyValues(count),samples:freeze(Array<null>(count).fill(null)),lastTriggeredBar:null,lastTriggeredAt:null});let settled=false;
  return freeze({base,next,notification:null,diagnostic:null,commit:(publish?:(next:CompoundState,base:CompoundState)=>boolean)=>{if(settled||version!==this.#version||this.#state!==base)return false;settled=true;if(publish&&publish(next,base)!==true)return false;if(version!==this.#version||this.#state!==base)return false;this.#state=next;this.#version++;return true;},rollback:()=>{if(settled)return false;settled=true;return true;}});
 }
 /** Temporary workspace suspension: retire only prepared work, not numerical
  * baselines/source sessions. This is deliberately unlike manual pause. */
 invalidatePrepared():void{this.#version++;}
 prepare(input:unknown):CompoundPreparation{
  const base=this.#state,version=this.#version,b=batch(input,base.definition),reduced=reduce(base,b);let settled=false;
  return freeze({base,...reduced,commit:(publish?:(next:CompoundState,base:CompoundState)=>boolean)=>{
   if(settled||version!==this.#version||this.#state!==base)return false;settled=true;
   // Throwing (including 0/null/undefined) leaves the committed state untouched.
   if(publish&&publish(reduced.next,base)!==true)return false;
   if(version!==this.#version||this.#state!==base)return false;
   this.#state=reduced.next;this.#version++;return true;
  },rollback:()=>{if(settled)return false;settled=true;return true;}});
 }
 /** Establish a numerical baseline without a market trigger. The actual source
  * coordinator must still own the cut and ROOT publication. Initial confirmed
  * history/reacquisition can seed the next close without replaying an old close.
  * Existing history and frequency tokens are retained; no source grant exists. */
 prime(input:unknown):CompoundPreparation{
  const base=this.#state,version=this.#version,b=batch(input,base.definition),reduced=reduce(base,b,false);let settled=false;
  return freeze({base,...reduced,commit:(publish?:(next:CompoundState,base:CompoundState)=>boolean)=>{
   if(settled||version!==this.#version||this.#state!==base)return false;settled=true;
   // Throwing (including 0/null/undefined) leaves the committed state untouched.
   if(publish&&publish(reduced.next,base)!==true)return false;
   if(version!==this.#version||this.#state!==base)return false;
   this.#state=reduced.next;this.#version++;return true;
  },rollback:()=>{if(settled)return false;settled=true;return true;}});
 }
 #clock(now:number):void{integer(now,'lifecycle clock');if(now<this.#state.clock||now<this.#state.armedAt||this.#state.lastTime!==null&&now<this.#state.lastTime)return fail('Lifecycle clock moved backwards.');}
 advanceClock(now:number):void{this.#clock(now);const s=this.#state,expired=s.status!=='stopped'&&s.status!=='expired'&&s.definition.expiresAt!==null&&now>=s.definition.expiresAt;if(expired||now!==s.clock){this.#state=state({...s,clock:now,...(expired?{...clear(s),status:'expired' as const,reason:'expired' as const}:{})});this.#version++;}}
 pause(now:number):void{this.advanceClock(now);const s=this.#state;if(s.status==='stopped'||s.status==='expired')return;this.#state=state({...s,...clear(s),status:'paused',reason:'manual'});this.#version++;}
 resume(now:number):void{this.advanceClock(now);const s=this.#state;if(s.status!=='paused'||s.reason==='history-limit')return;this.#state=state({...s,...clear(s),status:'active',reason:null});this.#version++;}
 rearm(now:number):void{this.#clock(now);const s=this.#state;if(s.definition.expiresAt!==null&&now>=s.definition.expiresAt)return fail('Expired declaration needs a new future expiry.');if(s.revision>=Number.MAX_SAFE_INTEGER)return fail('Revision exhausted.');if(s.reason==='history-limit')return fail('History must be exported/removed before rearming.');this.#state=state({...s,...clear(s),revision:s.revision+1,armedAt:now,clock:now,status:'active',reason:null,lastTriggeredBar:null,lastTriggeredAt:null});this.#version++;}
}

/* Literal domain work/storage ledger (source and kernel work excluded):
 * Admitted declaration: C<=5, inputs<=32 each, encoded JSON<=65536 chars.
 * Parsing object inputs inspects their own keys before rejecting extras: its
 * rejection work is O(supplied keys), NOT a C-only hostile-ingress guarantee.
 * A future untrusted ingress must cap JSON bytes before parse/allocation.
 * Batch: exactly C samples; <=C*constant primitive descriptor reads/copies.
 * Reduction: <=C sequence checks +C values +C predicate evaluations; no N scan.
 * Current numerical state: samples, previous, previousClosed, all <=C.
 * Notification: C values reused from this batch, one persistent history node;
 * max100000 nodes, one append, never clone H nodes on an ordinary batch.
 * Transaction overlap: one caller-held candidate per prepare; caller retaining
 * arbitrarily many preparations is NOT a bounded application queue. Coordinator
 * must bound active candidates and source leases; no resource credit is granted.
 * Explicit history export costs O(H); external saved-state validation/delivery,
 * history bytes, source/currentness callbacks and actual kernels are NOT covered.
 */
