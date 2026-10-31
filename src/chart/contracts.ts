import type { Bar, BarIdentity } from '../domain/types';
import {measureWorkspaceJSON,prepareWorkspaceJSON} from '../ui/workspace-json';
import {projectNativeDrawingRecord} from './drawing-canonical';
import {sameDrawingData} from './drawing-data-equality';
import {buildDrawingRemovalCandidate} from './drawing-removal-candidate';
import {beginNativeDrawingProjection,finishNativeDrawingProjection,retireNativeDrawingProjection,type NativeDrawingProjectionAuthority} from './drawing-native-projection';

export interface DisplayBar extends Bar {
  id: string;
  identity: BarIdentity;
  sourceTime: number;
  /** Renderer axis coordinate; independent of original event time. */
  logicalIndex: number;
}
export interface DrawingAnchor {
  barId: string;
  logicalIndex: number;
  sourceTime: number;
  price: number;
  paneId: string;
  scaleId: string;
  seriesId: string;
}
export interface ChartDiagnostic {
  code: string;
  feature: string;
  message: string;
  severity: 'unavailable' | 'warning' | 'error';
}
export type ChartResult<T> = { ok: true; value: T } | { ok: false; diagnostic: ChartDiagnostic };
export function requireVolume(bars: readonly Bar[], feature: string): ChartResult<readonly Bar[]> {
  if (!bars.length || bars.some(bar => !Number.isFinite(bar.volume) || bar.volume < 0)) {
    return { ok: false, diagnostic: { code: 'DATA_VOLUME_UNAVAILABLE', feature, message: 'This calculation requires nonnegative volume for every source bar.', severity: 'unavailable' } };
  }
  return { ok: true, value: bars };
}
export function identifyDisplayBars(bars: readonly Bar[], meta: Omit<BarIdentity, 'ordinal' | 'sourceFirstSequence' | 'sourceLastSequence'>, sourceSpans?: readonly [number, number][]): DisplayBar[] {
  return bars.map((bar, ordinal) => {
    const span = sourceSpans?.[ordinal] ?? [ordinal, ordinal];
    const identity = { ...meta, ordinal, sourceFirstSequence: span[0], sourceLastSequence: span[1] };
    return { ...bar, id: JSON.stringify([meta.datasetId, meta.revision, meta.transformId, ordinal]), identity, sourceTime: bar.time, logicalIndex: ordinal };
  });
}

export interface OwnedDrawingEditAcceptance {assertCurrent():void}
export interface OwnedDrawingEditBatch {
  readonly count:number;
  stage():void;
  assertCurrent():void;
  accept():OwnedDrawingEditAcceptance;
  rollback():OwnedDrawingEditAcceptance;
}
export interface OwnedDrawingInsertBatch extends OwnedDrawingEditBatch {
  readonly ids:readonly string[];
  /** Detached preview only; callers must preflight the complete workspace before native writes. */
  readCandidate():Record<string,unknown>;
}
export interface OwnedDrawingRemoveBatch extends OwnedDrawingEditBatch {
  readonly ids:readonly string[];
  /** Detached one-hit preview; native mutation and workspace publication are separate. */
  readCandidate():Record<string,unknown>;
}

/** Lossless LV storage remains authoritative when a renderer cannot understand a type. */
export class LosslessDrawingDocument {
  private document: Record<string, unknown> = { version: 1, drawings: [] };
  private past: Record<string, unknown>[] = [];
  private future: Record<string, unknown>[] = [];
  #mutationEpoch=0;
  #enterMutation():void{if(this.#mutationEpoch===Number.MAX_SAFE_INTEGER)throw Error('Drawing mutation epoch exhausted. Reopen the chart.');this.#mutationEpoch++;}
  load(document: unknown): void {
    this.#enterMutation();
    if (document === null || typeof document !== 'object' || Array.isArray(document)) throw new Error('Drawing document must be an object');
    const doc = document as Record<string, unknown>;
    if (!Array.isArray(doc.drawings)) throw new Error('Drawing document requires drawings array');
    const ids = new Set<string>();
    for (const row of doc.drawings) {
      if (row === null || typeof row !== 'object' || typeof row.id !== 'string' || typeof row.type !== 'string' || ids.has(row.id)) throw new Error('Drawing records need unique string IDs and types');
      ids.add(row.id);
    }
    this.document = structuredClone(doc); this.past = []; this.future = [];
  }
  serialize(): Record<string, unknown> { return structuredClone(this.document); }
  all(): Record<string, unknown>[] { return structuredClone(this.document.drawings as Record<string, unknown>[]); }
  ids():string[]{return(this.document.drawings as Record<string,unknown>[]).map(row=>String(row.id));}
  /** Synchronous reconciliation rollback includes canonical undo/redo ownership. */
  atomic<T>(operation:()=>T):T{this.#enterMutation();const before=this.document,past=this.past.slice(),future=this.future.slice();try{return operation();}catch(error){this.#enterMutation();this.document=before;this.past=past;this.future=future;throw error;}}
  /** Synchronize renderable records without dropping future fields or opaque unknown records. */
  mergeRenderable(rows: readonly Record<string, unknown>[], knownTypes: ReadonlySet<string>, recordHistory = true, retainedIds:ReadonlySet<string>=new Set(),authority?:NativeDrawingProjectionAuthority): void {
    this.#enterMutation();
    const current = this.all();
    const byId=new Map(current.map(row=>[String(row.id),row])),nativeIds=new Set<string>();
    for(const row of rows){if(typeof row.id!=='string'||typeof row.type!=='string'||nativeIds.has(row.id))throw Error('Native drawing records require unique string IDs and types');nativeIds.add(row.id);const prior=byId.get(row.id);if(prior&&(!knownTypes.has(String(prior.type))||retainedIds.has(row.id)||prior.type!==row.type))throw Error('Native drawing ID collides with a retained canonical record: '+row.id);}
    const pass=authority?beginNativeDrawingProjection(authority,this,rows,current):undefined;
    let merged:Record<string,unknown>[];try{merged=rows.map(row=>projectNativeDrawingRecord(byId.get(String(row.id))??{},row,pass));if(pass)finishNativeDrawingProjection(pass);}finally{if(pass)retireNativeDrawingProjection(pass);}
    // Retained records keep their canonical slots; renderable slots follow native
    // paint order. Extra new native rows append after the existing slots.
    const drawings:Record<string,unknown>[]=[];let index=0;
    for(const row of current){if(!knownTypes.has(String(row.type))||retainedIds.has(String(row.id)))drawings.push(row);else if(index<merged.length)drawings.push(merged[index++]);}
    drawings.push(...merged.slice(index));
    const next = { ...this.document, drawings };
    if (sameDrawingData(next,this.document)) return;
    if (recordHistory) { this.past.push(this.serialize()); this.future = []; }
    this.document = next;
  }
  /** Stage the exact validated canonical edit before synchronous native publication. */
  stageEditedRecord(expected:Record<string,unknown>,next:Record<string,unknown>):void{
    this.#enterMutation();
    const before=prepareWorkspaceJSON({row:expected}).row,after=prepareWorkspaceJSON({row:next}).row;
    if(!before||!after||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)||Array.isArray(after))throw Error('Drawing stage requires canonical records');
    const old=before as Record<string,unknown>,replacement=after as Record<string,unknown>,rows=this.document.drawings as Record<string,unknown>[],index=rows.findIndex(row=>row.id===old.id);
    if(index<0||JSON.stringify(rows[index])!==JSON.stringify(old)||old.id!==replacement.id||old.type!==replacement.type)throw Error('Canonical drawing changed before its accepted edit was staged');
    if(JSON.stringify(old)===JSON.stringify(replacement))return;
    this.past.push(this.serialize());this.future=[];this.document={...this.document,drawings:rows.map((row,i)=>i===index?structuredClone(replacement):row)};
  }
  /** One owned template batch creates one canonical history entry, regardless of target count. */
  stageEditedRecords(expectedInput:readonly Record<string,unknown>[],nextInput:readonly Record<string,unknown>[]):void{
    this.#enterMutation();
    const prepared=prepareWorkspaceJSON({expected:expectedInput,next:nextInput}),expected=prepared.expected as Record<string,unknown>[],next=prepared.next as Record<string,unknown>[];
    if(!expected.length||expected.length>128||expected.length!==next.length)throw Error('Canonical drawing batch requires matching bounded rows');
    const rows=this.document.drawings as Record<string,unknown>[],byId=new Map(rows.map(row=>[row.id,row])),changes=new Map<unknown,Record<string,unknown>>();
    for(let index=0;index<expected.length;index++){const before=expected[index],after=next[index];if(!before||!after||typeof before.id!=='string'||changes.has(before.id)||before.id!==after.id||before.type!==after.type||JSON.stringify(byId.get(before.id))!==JSON.stringify(before))throw Error('Canonical drawing batch changed before staging');changes.set(before.id,after);}
    if(expected.every((before,index)=>JSON.stringify(before)===JSON.stringify(next[index])))return;
    this.past.push(this.serialize());this.future=[];this.document={...this.document,drawings:rows.map(row=>changes.has(row.id)?structuredClone(changes.get(row.id)!):row)};
  }
  /** Read-only lifetime of the supported canonical document and history state. */
  captureReadOnlyOwner():OwnedDrawingEditAcceptance{
    const document=this,epoch=this.#mutationEpoch;
    const fields=()=>{const descriptors=Object.getOwnPropertyDescriptors(document);return ['document','past','future'].map(key=>{const field=descriptors[key];if(!field||!Object.hasOwn(field,'value')||field.writable!==true||field.enumerable!==true||field.configurable!==true)throw Error('Readonly drawing owner descriptor changed.');return field.value;});};
    const initial=fields();let live=true;
    const receipt:OwnedDrawingEditAcceptance=Object.freeze({assertCurrent(this:OwnedDrawingEditAcceptance){
      if(this!==receipt)throw Error('Foreign readonly drawing owner receiver.');
      if(!live)throw Error('Readonly drawing owner was retired.');
      try{const current=fields();if(document.#mutationEpoch!==epoch||current.some((value,index)=>value!==initial[index]))throw Error('Readonly drawing owner was retired by another mutation.');}
      catch(error){live=false;throw error;}
    }});
    receipt.assertCurrent();return receipt;
  }
  /** Own only this exact callback-free batch transition; foreign writes retire rollback. */
  prepareOwnedEditBatch(expectedInput:readonly Record<string,unknown>[],nextInput:readonly Record<string,unknown>[]):OwnedDrawingEditBatch{
    const document=this,epoch=this.#mutationEpoch;
    const fields=()=>{const values=Object.getOwnPropertyDescriptors(document);for(const key of ['document','past','future']){const field=values[key];if(!field||!Object.hasOwn(field,'value')||field.writable!==true||field.enumerable!==true||field.configurable!==true)throw Error('Owned drawing edit state owner descriptor changed.');}return{document:values.document.value as Record<string,unknown>,past:values.past.value as Record<string,unknown>[],future:values.future.value as Record<string,unknown>[]};};
    const initial=fields(),before=initial.document,past=initial.past,future=initial.future;
    if(!Array.isArray(past)||!Array.isArray(future)||Object.getPrototypeOf(past)!==Array.prototype||Object.getPrototypeOf(future)!==Array.prototype)throw Error('Owned drawing edit history owner changed.');
    if(!Array.isArray(expectedInput)||!Array.isArray(nextInput)||!expectedInput.length||expectedInput.length>128||expectedInput.length!==nextInput.length)throw Error('Owned drawing edit requires matching bounded rows.');
    if(past.length>100000||future.length>100000)throw Error('Owned drawing edit history exceeds its reference limit.');
    const metrics=measureWorkspaceJSON({document:before,expected:expectedInput,next:nextInput});
    if(metrics.bytes>16*1024*1024||metrics.nodes>300000||metrics.depth>40)throw Error('Owned drawing edit exceeds its resource limit.');
    const expected=structuredClone(expectedInput),next=structuredClone(nextInput);
    const rows=before.drawings as Record<string,unknown>[],byId=new Map(rows.map(row=>[row.id,row])),changes=new Map<unknown,Record<string,unknown>>();
    for(let index=0;index<expected.length;index++){const old=expected[index],value=next[index];if(!old||!value||typeof old.id!=='string'||changes.has(old.id)||old.id!==value.id||old.type!==value.type||!sameDrawingData(byId.get(old.id),old))throw Error('Owned drawing edit no longer matches its canonical rows.');changes.set(old.id,value);}
    if(expected.every((row,index)=>sameDrawingData(row,next[index])))throw Error('Owned drawing edit requires a changed batch.');
    const candidate={...before,drawings:rows.map(row=>changes.get(row.id)??row)},nextPast=[...past,before],nextFuture:Record<string,unknown>[]=[];
    const captured=fields();if(this.#mutationEpoch!==epoch||captured.document!==before||captured.past!==past||captured.future!==future)throw Error('Drawing document changed while preparing its edit.');
    let phase:'prepared'|'staged'|'accepted'|'rolled-back'|'invalidated'='prepared',ownedEpoch=epoch,ownedDocument=before,ownedPast=past,ownedFuture=future;
    const receiver=(value:unknown)=>{if(value!==lease)throw Error('Foreign owned drawing edit receiver.');};
    const exact=()=>{const state=fields();if(document.#mutationEpoch!==ownedEpoch||state.document!==ownedDocument||state.past!==ownedPast||state.future!==ownedFuture)throw Error('Owned drawing edit was retired by another mutation.');};
    const current=()=>{if(!['prepared','staged'].includes(phase))throw Error('Owned drawing edit is consumed or invalidated.');try{exact();}catch(error){phase='invalidated';throw error;}};
    const readonlyReceipt=()=>{let live=true;const receipt:OwnedDrawingEditAcceptance=Object.freeze({assertCurrent(this:OwnedDrawingEditAcceptance){if(this!==receipt)throw Error('Foreign owned drawing acceptance receiver.');if(!live)throw Error('Owned drawing acceptance was retired.');try{exact();}catch(error){live=false;throw error;}}});return receipt;};
    const lease:OwnedDrawingEditBatch=Object.freeze({
      count:expected.length,
      stage(this:OwnedDrawingEditBatch){receiver(this);current();if(phase!=='prepared')throw Error('Owned drawing edit was already staged.');document.#enterMutation();document.document=candidate;document.past=nextPast;document.future=nextFuture;ownedEpoch=document.#mutationEpoch;ownedDocument=candidate;ownedPast=nextPast;ownedFuture=nextFuture;phase='staged';},
      assertCurrent(this:OwnedDrawingEditBatch){receiver(this);current();},
      accept(this:OwnedDrawingEditBatch){receiver(this);current();if(phase!=='staged')throw Error('Owned drawing edit must be staged before acceptance.');phase='accepted';return readonlyReceipt();},
      rollback(this:OwnedDrawingEditBatch){receiver(this);current();if(phase!=='staged')throw Error('Owned drawing edit must be staged before rollback.');phase='rolled-back';document.#enterMutation();document.document=before;document.past=past;document.future=future;ownedEpoch=document.#mutationEpoch;ownedDocument=before;ownedPast=past;ownedFuture=future;return readonlyReceipt();},
    });return lease;
  }
  /** Isolated exact-copy insertion; native mutation/publication requires a separate owned lease. */
  prepareOwnedInsertBatch(expectedInput:readonly Record<string,unknown>[],nextInput:readonly Record<string,unknown>[]):OwnedDrawingInsertBatch{
    const document=this,epoch=this.#mutationEpoch;
    const fields=()=>{
      const descriptors=Object.getOwnPropertyDescriptors(document);
      for(const key of ['document','past','future']){const field=descriptors[key];if(!field||!Object.hasOwn(field,'value')||field.writable!==true||field.enumerable!==true||field.configurable!==true)throw Error('Owned drawing insertion state descriptor changed.');}
      return{document:descriptors.document.value as Record<string,unknown>,past:descriptors.past.value as Record<string,unknown>[],future:descriptors.future.value as Record<string,unknown>[]};
    };
    const initial=fields(),before=initial.document,past=initial.past,future=initial.future;
    const historyRows=(value:Record<string,unknown>[])=>{
      if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('Owned drawing insertion history owner changed.');
      const descriptors=Object.getOwnPropertyDescriptors(value as object),length=descriptors.length;
      if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>100000||Reflect.ownKeys(descriptors).length!==length.value+1)throw Error('Owned drawing insertion history exceeds its reference limit.');
      const rows:Record<string,unknown>[]=[];for(let index=0;index<length.value;index++){const item=descriptors[String(index)];if(!item||!Object.hasOwn(item,'value')||!item.enumerable)throw Error('Owned drawing insertion history requires ordinary data entries.');rows.push(item.value);}
      return rows;
    };
    const previous=historyRows(past);historyRows(future);
    const metrics=measureWorkspaceJSON({document:before,expected:expectedInput,next:nextInput});
    if(metrics.bytes>16*1024*1024||metrics.nodes>300000||metrics.depth>40)throw Error('Owned drawing insertion exceeds its resource limit.');
    if(!Array.isArray(expectedInput)||!Array.isArray(nextInput)||!expectedInput.length||expectedInput.length>128||expectedInput.length!==nextInput.length)throw Error('Owned drawing insertion requires matching bounded rows.');
    // Validation happened before cloning. Preserve opaque own undefined/-0 values too;
    // JSON normalization is intentionally not an authority or lossless-copy operation.
    const expected=structuredClone(expectedInput),next=structuredClone(nextInput),rows=before.drawings;
    if(!Array.isArray(rows)||rows.length+next.length>10000)throw Error('Owned drawing insertion exceeds the 10000-record limit.');
    const text=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=4096;
    const equal=(a:unknown,b:unknown):boolean=>{
      if(Object.is(a,b))return true;
      if(a===null||b===null||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
      const left=Object.keys(a),right=Object.keys(b);return left.length===right.length&&left.every(key=>Object.hasOwn(b,key)&&equal((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
    };
    const byId=new Map<string,Record<string,unknown>>();for(const value of rows){if(!value||typeof value!=='object'||Array.isArray(value)||!text(value.id)||!text(value.type)||byId.has(value.id))throw Error('Owned drawing insertion requires unique canonical identities.');byId.set(value.id,value);}
    const selected=new Set<string>(),inserted=new Set<string>();
    for(let index=0;index<expected.length;index++){
      const source=expected[index],copy=next[index];
      if(!source||!copy||typeof source!=='object'||typeof copy!=='object'||Array.isArray(source)||Array.isArray(copy)||!text(source.id)||!text(copy.id)||selected.has(source.id as string)||inserted.has(copy.id as string)||byId.has(copy.id as string)||source.type!==copy.type||!equal(byId.get(source.id as string),source))throw Error('Owned drawing insertion no longer matches fresh copies of its canonical sources.');
      if(!Number.isSafeInteger(copy.zIndex)||Number(copy.zIndex)<=0)throw Error('Owned drawing insertion requires an explicit positive safe stacking value.');
      const retained=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='id'&&key!=='zIndex'));
      if(!equal(retained(source),retained(copy)))throw Error('Owned drawing insertion may change only the copied ID and stacking value.');
      selected.add(source.id as string);inserted.add(copy.id as string);
    }
    const candidate={...before,drawings:[...rows,...next]},candidateMetrics=measureWorkspaceJSON(candidate);
    if(candidateMetrics.bytes>16*1024*1024||candidateMetrics.nodes>300000||candidateMetrics.depth>40)throw Error('Owned drawing insertion candidate exceeds its resource limit.');
    const nextPast=[...previous,before],nextFuture:Record<string,unknown>[]=[];
    const captured=fields();if(this.#mutationEpoch!==epoch||captured.document!==before||captured.past!==past||captured.future!==future)throw Error('Drawing document changed while preparing its insertion.');
    let phase:'prepared'|'staged'|'accepted'|'rolled-back'|'invalidated'='prepared',ownedEpoch=epoch,ownedDocument=before,ownedPast=past,ownedFuture=future;
    const receiver=(value:unknown)=>{if(value!==lease)throw Error('Foreign owned drawing insertion receiver.');};
    const exact=()=>{const state=fields();if(document.#mutationEpoch!==ownedEpoch||state.document!==ownedDocument||state.past!==ownedPast||state.future!==ownedFuture)throw Error('Owned drawing insertion was retired by another mutation.');};
    const current=()=>{if(phase!=='prepared'&&phase!=='staged')throw Error('Owned drawing insertion is consumed or invalidated.');try{exact();}catch(error){phase='invalidated';throw error;}};
    const readonlyReceipt=()=>{let live=true;const receipt:OwnedDrawingEditAcceptance=Object.freeze({assertCurrent(this:OwnedDrawingEditAcceptance){if(this!==receipt)throw Error('Foreign owned drawing insertion acceptance receiver.');if(!live)throw Error('Owned drawing insertion acceptance was retired.');try{exact();}catch(error){live=false;throw error;}}});return receipt;};
    const lease:OwnedDrawingInsertBatch=Object.freeze({
      count:next.length,ids:Object.freeze([...inserted]),
      readCandidate(this:OwnedDrawingInsertBatch){receiver(this);current();const value=structuredClone(candidate);current();return value;},
      stage(this:OwnedDrawingInsertBatch){receiver(this);current();if(phase!=='prepared')throw Error('Owned drawing insertion was already staged.');document.#enterMutation();document.document=candidate;document.past=nextPast;document.future=nextFuture;ownedEpoch=document.#mutationEpoch;ownedDocument=candidate;ownedPast=nextPast;ownedFuture=nextFuture;phase='staged';},
      assertCurrent(this:OwnedDrawingInsertBatch){receiver(this);current();},
      accept(this:OwnedDrawingInsertBatch){receiver(this);current();if(phase!=='staged')throw Error('Owned drawing insertion must be staged before acceptance.');phase='accepted';return readonlyReceipt();},
      rollback(this:OwnedDrawingInsertBatch){receiver(this);current();if(phase!=='staged')throw Error('Owned drawing insertion must be staged before rollback.');document.#enterMutation();document.document=before;document.past=past;document.future=future;ownedEpoch=document.#mutationEpoch;ownedDocument=before;ownedPast=past;ownedFuture=future;phase='rolled-back';return readonlyReceipt();},
    });return lease;
  }
  /** One exact removal owns its row, group membership and canonical history together. */
  prepareOwnedRemoveBatch(expectedInput:readonly Record<string,unknown>[]):OwnedDrawingRemoveBatch{
    const document=this,epoch=this.#mutationEpoch;
    const fields=()=>{
      const descriptors=Object.getOwnPropertyDescriptors(document);
      for(const key of ['document','past','future']){const field=descriptors[key];if(!field||!Object.hasOwn(field,'value')||field.writable!==true||field.enumerable!==true||field.configurable!==true)throw Error('Owned drawing removal state descriptor changed.');}
      return{document:descriptors.document.value as Record<string,unknown>,past:descriptors.past.value as Record<string,unknown>[],future:descriptors.future.value as Record<string,unknown>[]};
    };
    const initial=fields(),before=initial.document,past=initial.past,future=initial.future;
    const historyRows=(value:Record<string,unknown>[])=>{
      if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('Owned drawing removal history owner changed.');
      const descriptors=Object.getOwnPropertyDescriptors(value as object),length=descriptors.length;
      if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>100000||Reflect.ownKeys(descriptors).length!==length.value+1)throw Error('Owned drawing removal history exceeds its reference limit.');
      const rows:Record<string,unknown>[]=[];for(let index=0;index<length.value;index++){const item=descriptors[String(index)];if(!item||!Object.hasOwn(item,'value')||!item.enumerable)throw Error('Owned drawing removal history requires ordinary data entries.');rows.push(item.value);}return rows;
    };
    const previous=historyRows(past);historyRows(future);
    const {ids,candidate}=buildDrawingRemovalCandidate(before,expectedInput),nextPast=[...previous,before],nextFuture:Record<string,unknown>[]=[];
    const captured=fields();if(this.#mutationEpoch!==epoch||captured.document!==before||captured.past!==past||captured.future!==future)throw Error('Drawing document changed while preparing its removal.');
    let phase:'prepared'|'staged'|'accepted'|'rolled-back'|'invalidated'='prepared',ownedEpoch=epoch,ownedDocument=before,ownedPast=past,ownedFuture=future;
    const receiver=(value:unknown)=>{if(value!==lease)throw Error('Foreign owned drawing removal receiver.');};
    const exact=()=>{const state=fields();if(document.#mutationEpoch!==ownedEpoch||state.document!==ownedDocument||state.past!==ownedPast||state.future!==ownedFuture)throw Error('Owned drawing removal was retired by another mutation.');};
    const current=()=>{if(phase!=='prepared'&&phase!=='staged')throw Error('Owned drawing removal is consumed or invalidated.');try{exact();}catch(error){phase='invalidated';throw error;}};
    const readonlyReceipt=()=>{let live=true;const receipt:OwnedDrawingEditAcceptance=Object.freeze({assertCurrent(this:OwnedDrawingEditAcceptance){if(this!==receipt)throw Error('Foreign owned drawing removal acceptance receiver.');if(!live)throw Error('Owned drawing removal acceptance was retired.');try{exact();}catch(error){live=false;throw error;}}});return receipt;};
    const lease:OwnedDrawingRemoveBatch=Object.freeze({
      count:1,ids,
      readCandidate(this:OwnedDrawingRemoveBatch){receiver(this);current();const value=structuredClone(candidate);current();return value;},
      stage(this:OwnedDrawingRemoveBatch){receiver(this);current();if(phase!=='prepared')throw Error('Owned drawing removal was already staged.');document.#enterMutation();document.document=candidate;document.past=nextPast;document.future=nextFuture;ownedEpoch=document.#mutationEpoch;ownedDocument=candidate;ownedPast=nextPast;ownedFuture=nextFuture;phase='staged';},
      assertCurrent(this:OwnedDrawingRemoveBatch){receiver(this);current();},
      accept(this:OwnedDrawingRemoveBatch){receiver(this);current();if(phase!=='staged')throw Error('Owned drawing removal must be staged before acceptance.');phase='accepted';return readonlyReceipt();},
      rollback(this:OwnedDrawingRemoveBatch){receiver(this);current();if(phase!=='staged')throw Error('Owned drawing removal must be staged before rollback.');document.#enterMutation();document.document=before;document.past=past;document.future=future;ownedEpoch=document.#mutationEpoch;ownedDocument=before;ownedPast=past;ownedFuture=future;phase='rolled-back';return readonlyReceipt();},
    });return lease;
  }
  /** Local template/group metadata is one command and cannot replace drawings or clear prior history. */
  stageManagerMetadata(expectedInput:Record<string,unknown>,nextInput:Record<string,unknown>):boolean{
    this.#enterMutation();
    for(const value of [expectedInput,nextInput,this.document])measureWorkspaceJSON(value);
    const expected=structuredClone(expectedInput),next=structuredClone(nextInput),withoutManager=(value:Record<string,unknown>)=>{const copy={...value};delete copy.lvDrawingManager;return copy;};
    if(!sameDrawingData(expected,this.document))throw Error('Canonical drawing document changed before manager metadata staging');
    if(!sameDrawingData(withoutManager(expected),withoutManager(next)))throw Error('Manager metadata cannot change drawings or other document fields');
    if(sameDrawingData(expected,next))return false;
    this.past.push(this.serialize());this.future=[];this.document=next;return true;
  }
  /** Commit portable pane metadata only; native geometry and undo stacks are untouched. */
  enrichPaneBindings(expected:Record<string,unknown>,enriched:Record<string,unknown>):void{
    this.#enterMutation();
    for(const value of [expected,enriched,this.document])measureWorkspaceJSON(value);
    const before=structuredClone(expected),next=structuredClone(enriched);
    if(!sameDrawingData(before,this.document))throw Error('Canonical drawing document changed before pane binding capture');
    const withoutBindings=(doc:Record<string,unknown>)=>({...doc,drawings:(doc.drawings as Record<string,unknown>[]).map(row=>{const copy={...row};delete copy.lvPaneBinding;return copy;})});
    if(!Array.isArray(next.drawings)||!Array.isArray(before.drawings)||!sameDrawingData(withoutBindings(before),withoutBindings(next)))throw Error('Pane binding enrichment cannot change drawing geometry, order or other metadata');
    this.document=next;
  }
  undo(): boolean { this.#enterMutation();const previous = this.past.pop(); if (!previous) return false; this.future.push(this.serialize()); this.document = previous; return true; }
  redo(): boolean { this.#enterMutation();const next = this.future.pop(); if (!next) return false; this.past.push(this.serialize()); this.document = next; return true; }
  diagnostics(knownTypes: ReadonlySet<string>): ChartDiagnostic[] {
    return this.all().filter(row => !knownTypes.has(String(row.type))).map(row => ({ code: 'DRAWING_RENDERER_UNAVAILABLE', feature: String(row.type), message: `Drawing ${String(row.id)} is retained; this renderer does not support its type.`, severity: 'unavailable' }));
  }
}
