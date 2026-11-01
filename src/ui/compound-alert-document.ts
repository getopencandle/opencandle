import {COMPOUND_POLICY,COMPOUND_HISTORY_LIMIT,COMPOUND_PRIVATE_BYTES,CompoundAlertStore,compoundHistory,compoundHistorySize,parseCompoundSavedCore,serializeCompoundSavedCore,type CompoundSavedCore,type CompoundState,type CompoundDefinition,type CompoundNotification} from '../domain/compound-alerts';
import {copyAlertDelivery,type AlertDeliverySettings} from '../domain/alert-delivery';
import {parseInterval} from '../domain/intervals';

/** Local PRIVATE DATA only. None of these records restores producer/source,
 * numerical completion, native permission or notification-delivery authority. */
export interface CompoundDocumentProvenance {readonly providerId:string;readonly datasetId:string;readonly revision:string;readonly resolution:string;readonly basis:string}
export interface CompoundDocumentBinding {
 readonly id:string;readonly revision:number;readonly restriction:'restricted-live';readonly provenance:Readonly<CompoundDocumentProvenance>;
}
export interface CompoundJournalBinding extends CompoundDocumentBinding {readonly declaration:CompoundDefinition}
export interface CompoundJournalNode {
 readonly item:CompoundNotification;readonly binding:CompoundJournalBinding;readonly delivery:Readonly<AlertDeliverySettings>;
 readonly previous:CompoundJournalNode|null;readonly size:number;
}
export interface CompoundDocumentJournalItem {readonly notificationId:string;readonly bindingId:string;readonly delivery:Readonly<AlertDeliverySettings>}
export interface CompoundPrivateRecord {
 readonly core:Readonly<CompoundSavedCore>;readonly delivery:Readonly<AlertDeliverySettings>;
 readonly provenanceBindings:readonly CompoundDocumentBinding[];readonly journal:readonly CompoundDocumentJournalItem[];
}
export interface CompoundPrivateDocument {
 readonly kind:'lv-compound-private-alerts';readonly schemaVersion:1;readonly policy:typeof COMPOUND_POLICY;readonly savedAt:number;
 readonly records:readonly CompoundPrivateRecord[];
}
/** Actual ROOT book snapshot, kept BESIDE Workspace, never inside chartUndo.
 * The ROOT writer owns collection CAS, retained budget and storage destination. */
export interface CompoundDocumentSnapshot {
 readonly state:CompoundState;readonly declarations:CompoundSavedCore['declarations'];
 readonly delivery:Readonly<AlertDeliverySettings>;readonly journal:CompoundJournalNode|null;
}
export interface RestoredCompoundRecord {
 readonly store:CompoundAlertStore;readonly declarations:CompoundSavedCore['declarations'];
 readonly delivery:Readonly<AlertDeliverySettings>;readonly journal:CompoundJournalNode|null;
}
const freeze=Object.freeze,MAX_RECORDS=10000,MAX_NODES=500000,MAX_DEPTH=40;
function fail(message:string):never{throw Error(message);}
function own(object:unknown,key:PropertyKey):unknown{
 if(!object||typeof object!=='object')return fail('Compound private data requires records.');
 const d=Object.getOwnPropertyDescriptor(object,key);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)return fail('Compound private data requires own data fields.');return d.value;
}
function record(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail('Expected a compound private record.');
 const names=Reflect.ownKeys(value);if(names.length!==keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))return fail('Unexpected compound private fields.');
 const out:Record<string,unknown>=Object.create(null);for(const key of keys)out[key]=own(value,key);return out;
}
function list(value:unknown,max:number):unknown[]{
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return fail('Expected an ordinary compound array.');
 const d=Object.getOwnPropertyDescriptor(value,'length'),count=d&&Object.hasOwn(d,'value')?d.value:undefined;
 if(!Number.isSafeInteger(count)||count<0||count>max||Reflect.ownKeys(value).length!==count+1)return fail('Compound array exceeds bounds.');
 const out:unknown[]=[];for(let i=0;i<count;i++)out.push(own(value,String(i)));return out;
}
function integer(value:unknown):number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:fail('Invalid compound metadata integer.');}
function text(value:unknown,max=500):string{return typeof value==='string'&&value.length>0&&value.length<=max?value:fail('Invalid compound metadata text.');}
function delivery(value:unknown):Readonly<AlertDeliverySettings>{
 return copyAlertDelivery(value);/* Keeps webhook and soundRepeat */
}
function readJSON(json:string):unknown{
 if(typeof json!=='string'||json.length>COMPOUND_PRIVATE_BYTES||new TextEncoder().encode(json).length>COMPOUND_PRIVATE_BYTES)return fail('Compound private collection exceeds20MiB.');
 const value:unknown=JSON.parse(json),pending=[{value,depth:0}];let nodes=1;
 while(pending.length){const entry=pending.pop()!,item=entry.value;if(entry.depth>MAX_DEPTH)return fail('Compound private nesting exceeds40.');
  if(typeof item==='number'){if(!Number.isFinite(item))return fail('Nonfinite compound private number.');continue;}
  if(typeof item==='string'){if(item.length>100000)return fail('Compound private text exceeds bounds.');continue;}
  if(item===null||typeof item==='boolean')continue;if(!item||typeof item!=='object')return fail('Expected JSON compound private data.');
  const array=Array.isArray(item);for(const key of Object.keys(item)){if(['__proto__','prototype','constructor'].includes(key))return fail('Unsafe compound private key.');if(++nodes>MAX_NODES)return fail('Compound private node budget exceeded.');pending.push({value:own(item,key),depth:entry.depth+1});}
  if(array&&Object.keys(item).length!==(item as unknown[]).length)return fail('Sparse compound private array.');
 }return value;
}
function binding(value:unknown,definitions:ReadonlyMap<number,CompoundDefinition>):CompoundDocumentBinding{
 const r=record(value,['id','revision','restriction','provenance']),revision=integer(r.revision),definition=definitions.get(revision);if(!definition||r.restriction!=='restricted-live')return fail('Compound provenance has no original declaration.');
 const p=record(r.provenance,['providerId','datasetId','revision','resolution','basis']),provenance=freeze({providerId:text(p.providerId),datasetId:text(p.datasetId),revision:text(p.revision),resolution:text(p.resolution),basis:text(p.basis)});
 if(provenance.datasetId!==definition.context.sourceFamily||provenance.basis!==definition.context.basis||parseInterval(provenance.resolution).id!==definition.context.interval)return fail('Compound provenance belongs to another declaration basis.');
 return freeze({id:text(r.id),revision,restriction:'restricted-live',provenance});
}
function bindingKey(value:CompoundDocumentBinding):string{const p=value.provenance;return JSON.stringify([value.revision,p.providerId,p.datasetId,p.revision,p.resolution,p.basis]);}
function supportedDefinition(d:CompoundDefinition):boolean{
 if(d.context.session!=='regular'||!['1m','5m','15m','60m'].includes(d.context.interval))return false;
 return d.predicates.every(p=>p.source.kind==='price'||p.source.indicator==='sma'&&p.source.plot==='sma'&&Object.keys(p.source.inputs).length===2&&Number.isSafeInteger(p.source.inputs.length)&&(p.source.inputs.length as number)>=1&&(p.source.inputs.length as number)<=10000&&typeof p.source.inputs.source==='string'&&['open','high','low','close','hl2','hlc3','ohlc4'].includes(p.source.inputs.source));
}

/** Pure flat validation. Ordinary save normalization calls this, NOT fromSaved;
 * validating a file must not rearm/reset the live runtime collection. */
export function parseCompoundPrivateDocument(json:string):CompoundPrivateDocument{
 const r=record(readJSON(json),['kind','schemaVersion','policy','savedAt','records']);if(r.kind!=='lv-compound-private-alerts'||r.schemaVersion!==1||r.policy!==COMPOUND_POLICY)return fail('Unsupported compound private document.');
 const savedAt=integer(r.savedAt),ids=new Set<string>();let historyCount=0;
 const records=list(r.records,MAX_RECORDS).map(value=>{
  const row=record(value,['core','delivery','provenanceBindings','journal']),core=parseCompoundSavedCore(JSON.stringify(row.core));
  if(core.savedAt!==savedAt||ids.has(core.definition.id)||(historyCount+=core.history.length)>COMPOUND_HISTORY_LIMIT)return fail('Duplicate or over-budget compound collection.');ids.add(core.definition.id);
  if(!core.declarations.every(d=>supportedDefinition(d.definition)))return fail('Unsupported compound private declaration source or interval.');
  const definitions=new Map(core.declarations.map(d=>[d.revision,d.definition])),byId=new Map<string,CompoundDocumentBinding>(),keys=new Set<string>();
  const provenanceBindings=list(row.provenanceBindings,core.history.length).map(value=>{const b=binding(value,definitions),key=bindingKey(b);if(byId.has(b.id)||keys.has(key))return fail('Duplicate compound provenance binding.');byId.set(b.id,b);keys.add(key);return b;});
  const used=new Set<string>(),journal=list(row.journal,core.history.length).map((value,index)=>{
   const entry=record(value,['notificationId','bindingId','delivery']),notificationId=text(entry.notificationId,8192),bindingId=text(entry.bindingId),b=byId.get(bindingId),item=core.history[index];
   if(!item||item.id!==notificationId||!b||b.revision!==item.revision)return fail('Compound journal lost original notification provenance.');used.add(bindingId);return freeze({notificationId,bindingId,delivery:delivery(entry.delivery)});
  });
  if(journal.length!==core.history.length||used.size!==byId.size)return fail('Incomplete or orphan compound journal metadata.');
  return freeze({core,delivery:delivery(row.delivery),provenanceBindings:freeze(provenanceBindings),journal:freeze(journal)});
 });
 return freeze({kind:'lv-compound-private-alerts',schemaVersion:1,policy:COMPOUND_POLICY,savedAt,records:freeze(records)});
}

/** Explicit private save only, O(H). Each chunk is byte-admitted before joining
 * the complete text. ROOT must also hold actual old/new persistent collection
 * and encoding overlap, then CAS its captured collection before storage. */
export function encodeCompoundPrivateDocument(snapshots:readonly CompoundDocumentSnapshot[],savedAt:number):string{
 integer(savedAt);const rows=list(snapshots,MAX_RECORDS),chunks:string[]=[],encoder=new TextEncoder();let total=0,bytes=0;
 const add=(part:string)=>{if(part.length>COMPOUND_PRIVATE_BYTES-bytes)return fail('Compound private collection exceeds20MiB.');bytes+=encoder.encode(part).length;if(bytes>COMPOUND_PRIVATE_BYTES)return fail('Compound private collection exceeds20MiB.');chunks.push(part);};
 // Canonical domain identity only: this is not numerical/source authority.
 for(const value of rows){const row=record(value,['state','declarations','delivery','journal']);total+=compoundHistorySize(row.state as CompoundState);if(total>COMPOUND_HISTORY_LIMIT)return fail('Compound history collection exceeds100000.');}
 add('{"kind":"lv-compound-private-alerts","schemaVersion":1,"policy":'+JSON.stringify(COMPOUND_POLICY)+',"savedAt":'+savedAt+',"records":[');
 rows.forEach((value,index)=>{
  const row=record(value,['state','declarations','delivery','journal']),state=row.state as CompoundState,core=serializeCompoundSavedCore(state,row.declarations as CompoundSavedCore['declarations'],savedAt),H=compoundHistorySize(state),definitions=new Map<number,CompoundDefinition>();
  for(const value of list(row.declarations,H+1)){const d=record(value,['revision','definition']);definitions.set(integer(d.revision),d.definition as CompoundDefinition);}
  const reversed:Array<{notificationId:string;bindingId:string;delivery:Readonly<AlertDeliverySettings>}>=[],bindings=new Map<string,CompoundDocumentBinding>(),identities=new Map<string,object>();let node=row.journal,actual:CompoundState['history']=state.history;
  while(node!==null){if(reversed.length>=H)return fail('Compound companion journal is cyclic or oversized.');const item=own(node,'item'),owner=own(node,'binding'),b=record(owner,['id','revision','restriction','provenance','declaration']),size=integer(own(node,'size')),id=text(b.id),revision=integer(b.revision);
   if(!actual||item!==actual.item||size!==H-reversed.length)return fail('Compound companion journal differs from canonical domain history.');
   // ROOT canonicalizes declaration objects per revision and binding objects
   // per source tuple once at acknowledgment/restore. Never reparse/reclone a
   // full declaration for every historical item during private encoding.
   if(b.declaration!==definitions.get(revision))return fail('Compound journal lost its canonical original declaration.');
   if(identities.has(id)&&identities.get(id)!==owner)return fail('Provenance binding identity changed.');
   if(!bindings.has(id)){const portable=binding({id,revision,restriction:b.restriction,provenance:b.provenance},definitions);bindings.set(id,portable);identities.set(id,owner as object);}
   reversed.push({notificationId:actual.item.id,bindingId:id,delivery:delivery(own(node,'delivery'))});node=own(node,'previous');actual=actual.previous;
  }
  if(reversed.length!==H)return fail('Compound companion journal is incomplete.');
  if(index)add(',');add('{"core":');add(core);add(',"delivery":');add(JSON.stringify(delivery(row.delivery)));add(',"provenanceBindings":[');
  let count=0;for(const b of bindings.values()){if(count++)add(',');add(JSON.stringify(b));}add('],"journal":[');
  for(let i=reversed.length-1;i>=0;i--){if(i!==reversed.length-1)add(',');add(JSON.stringify(reversed[i]));}add(']}');
 });add(']}');const json=chunks.join('');parseCompoundPrivateDocument(json);return json;
}

/** Explicit startup/load/replacement ONLY. Returned canonical runtime stores
 * and persistent journal nodes stay outside Workspace/chartUndo. Restored
 * journal is display history, never a list of pending delivery actions. */
export function restoreCompoundPrivateCollection(json:string,now:number):readonly RestoredCompoundRecord[]{
 const document=parseCompoundPrivateDocument(json);integer(now);if(now<document.savedAt)return fail('Restore clock precedes saved collection.');
 return freeze(document.records.map(record=>{
  const store=CompoundAlertStore.fromSaved(JSON.stringify(record.core),now),history=compoundHistory(store.current);
  // Current revision shares the ACTUAL new canonical store definition, while
  // older revisions retain their original frozen declarations. No values or
  // text change: core validation already required exact declaration equality.
  const declarations=freeze(record.core.declarations.map(d=>d.revision===store.current.revision?freeze({revision:d.revision,definition:store.current.definition}):d)),definitions=new Map(declarations.map(d=>[d.revision,d.definition])),bindings=new Map(record.provenanceBindings.map(b=>[b.id,freeze({...b,declaration:definitions.get(b.revision)!})]));let journal:CompoundJournalNode|null=null;
  for(let i=0;i<history.length;i++){const metadata=record.journal[i];journal=freeze({item:history[i],binding:bindings.get(metadata.bindingId)!,delivery:metadata.delivery,previous:journal,size:i+1});}
  return freeze({store,declarations,delivery:record.delivery,journal});
 }));
}
/** No purpose flag, label, sourceFamily or restored provenance can allow this
 * first live-only document through exportWorkspace/exportData/share/CSV. */
export const COMPOUND_SHARE_NOTICE="All-conditions alerts are kept on this computer only and can't be included in a workspace export. Delete them to export the workspace.";
export function refuseCompoundDocumentShare():never{throw Error(COMPOUND_SHARE_NOTICE);}

