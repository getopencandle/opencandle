import {afterEach,expect,it} from 'vitest';
import {COMPOUND_POLICY,COMPOUND_PRIVATE_BYTES,CompoundAlertStore,compoundHistory,compoundHistorySize,serializeCompoundSavedCore,parseCompoundSavedCore,type CompoundDefinition,type CompoundBatch,type CompoundNotification,type CompoundState} from '../../src/domain/compound-alerts';
import {encodeCompoundPrivateDocument,parseCompoundPrivateDocument,restoreCompoundPrivateCollection,refuseCompoundDocumentShare,type CompoundJournalBinding,type CompoundJournalNode,type CompoundDocumentSnapshot} from '../../src/ui/compound-alert-document';
import {compoundNotificationView} from '../../src/ui/compound-alert-presentation';
import {CompoundAlertObserver,compoundSourceContext,type CompoundRootOwner,type CompoundRootWriter,type CompoundPublicationBinding,type CompoundChartInputPort} from '../../src/ui/compound-alert-observer';
import {publishedSource,flushMtf,unix} from '../fixtures/qualified-nyse-mtf-source';
import {ownedInputStylePipelineFixture} from '../fixtures/seasonality-input-style-pipeline';
import {selectAlpacaSyntheticStub,isAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import type {AlertDeliverySettings} from '../../src/domain/alert-delivery';

// Pure journal cases use invented scalar domain DTOs, never source authority.
// The final case additionally uses the genuine provider/original SDK fixture.
const closes:Array<()=>unknown>=[];
afterEach(()=>{const errors:unknown[]=[];for(const close of closes.splice(0).reverse())try{close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Synthetic private document cleanup failed.');});
const initialDelivery=Object.freeze({schemaVersion:1 as const,popup:true,desktop:false,sound:null});
function definition(name='Original',count=2):CompoundDefinition{return{kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'synthetic-document',name,message:'Message '+name,context:{instrumentId:'SYNTHETIC',sourceFamily:'SYNTHETIC feed',interval:'1m',session:'regular',basis:'SYNTHETIC basis'},predicates:Array.from({length:count},(_,i)=>({id:'c'+i,source:i===0?{kind:'price' as const,field:'close' as const}:{kind:'indicator' as const,indicator:'sma',plot:'sma',snapshotId:'synthetic-'+i,inputs:{length:2,source:'close'}},operator:{kind:'greater' as const,value:(i+1)*10}})),frequency:'every-time',createdAt:0,expiresAt:null};}
function batch(store:CompoundAlertStore,values:readonly number[],sequence:number,at=sequence*60):CompoundBatch{return{context:store.current.definition.context,mode:'ordinary',sequence,observedAt:at,cutoffTime:at,barId:'b'+(at-60),barTime:at-60,barClosed:true,kind:'observation',samples:values.map((value,i)=>({predicateId:store.current.definition.predicates[i].id,value,sequence,time:at-60,availableAt:at,barId:'b'+(at-60),confirmed:true}))};}
function book(d=definition()){
 const store=new CompoundAlertStore(d),declarations=new Map([[1,store.current.definition]]),bindings=new Map<string,CompoundJournalBinding>();let journal:CompoundJournalNode|null=null,currentDelivery:Readonly<AlertDeliverySettings>=initialDelivery;
 return{store,declarations,bindings,get journal(){return journal;},setDelivery(d:Readonly<AlertDeliverySettings>){currentDelivery=Object.freeze({...d});},append(values:readonly number[],sequence:number,sourceRevision='SYNTHETIC sourceA'){
  const p=store.prepare(batch(store,values,sequence));expect(p.commit()).toBe(true);if(p.notification){const declaration=declarations.get(p.notification.revision)!;let binding=bindings.get(sourceRevision);if(!binding){binding=Object.freeze({id:'binding-'+bindings.size,revision:p.notification.revision,declaration,restriction:'restricted-live',provenance:Object.freeze({providerId:'SYNTHETIC provider',datasetId:declaration.context.sourceFamily,revision:sourceRevision,resolution:'1m',basis:declaration.context.basis})});bindings.set(sourceRevision,binding);}journal=Object.freeze({item:p.notification,binding,delivery:currentDelivery,previous:journal,size:(journal?.size??0)+1});}return p.notification;
 },snapshot():CompoundDocumentSnapshot{return{state:store.current,declarations:[...declarations].map(([revision,definition])=>({revision,definition})),delivery:currentDelivery,journal};}};
}
function mutate(text:string,action:(document:any)=>void):string{const value=JSON.parse(text);action(value);return JSON.stringify(value);}

it('roundtrips a flat private journal while resetting all runtime numerical authority and retaining high-water',()=>{
 const b=book();b.append([11,21],1);b.append([0,0],7);const text=encodeCompoundPrivateDocument([b.snapshot()],500),saved=parseCompoundPrivateDocument(text),restored=restoreCompoundPrivateCollection(text,501)[0];
 expect(saved.records[0].core.batchHighWater).toBe(7);expect(restored.store.current.lastSequence).toBe(7);expect(restored.store.current.previous).toEqual([null,null]);expect(restored.store.current.previousClosed).toEqual([null,null]);expect(restored.store.current.samples).toEqual([null,null]);expect(restored.store.current.barId).toBeNull();expect(restored.store.current.closedBarTime).toBeNull();expect(restored.store.current.status).toBe('waiting-for-data');expect(compoundHistory(restored.store.current).map(n=>n.values)).toEqual([[11,21]]);
 expect(restored.declarations.find(d=>d.revision===restored.store.current.revision)!.definition).toBe(restored.store.current.definition);expect(restored.journal!.binding.declaration).toBe(restored.store.current.definition);
 const seed=restored.store.prime(batch(restored.store,[9,19],8,502));expect(seed.notification).toBeNull();expect(seed.commit()).toBe(true);const next=restored.store.prepare(batch(restored.store,[11,21],9,562));expect(next.notification?.id).toBe(JSON.stringify(['synthetic-document',1,9]));expect(next.commit()).toBe(true);expect(compoundHistory(restored.store.current).map(n=>n.sequence)).toEqual([1,9]);
});

it('retains original two-condition history through a three-condition edit without relabeling old text',()=>{
 const b=book();b.append([11,21],1);const history=b.store.current.history,edit=b.store.prepareEdit({...definition('Edited',3),createdAt:0},70);expect(edit.notification).toBeNull();expect(edit.commit()).toBe(true);expect(b.store.current.history).toBe(history);expect(b.store.current.previous).toEqual([null,null,null]);b.declarations.set(2,b.store.current.definition);b.append([11,21,31],2,'SYNTHETIC sourceB');
 const restored=restoreCompoundPrivateCollection(encodeCompoundPrivateDocument([b.snapshot()],150),160)[0],current=restored.journal!,old=current.previous!;
 expect(current.binding.declaration.name).toBe('Edited');expect(current.item.values).toEqual([11,21,31]);expect(old.binding.declaration.name).toBe('Original');expect(old.item.values).toEqual([11,21]);expect(compoundNotificationView(old.binding,old.item).title).toContain('Original');expect(compoundNotificationView(current.binding,current.item).title).toContain('Edited');expect(old.binding.declaration.predicates).toHaveLength(2);
});

it('keeps two genuine-source-revision descriptions under one alert revision and freezes delivery at acknowledgment',()=>{
 const b=book();b.append([11,21],1,'SYNTHETIC sourceA');b.setDelivery({schemaVersion:1,popup:false,desktop:true,sound:'lv-chime'});b.append([12,22],2,'SYNTHETIC sourceB');
 const saved=parseCompoundPrivateDocument(encodeCompoundPrivateDocument([b.snapshot()],150)),restored=restoreCompoundPrivateCollection(JSON.stringify(saved),160)[0],head=restored.journal!;
 expect(saved.records[0].provenanceBindings).toHaveLength(2);expect(head.item.revision).toBe(1);expect(head.previous!.item.revision).toBe(1);expect(head.binding.provenance.revision).toBe('SYNTHETIC sourceB');expect(head.previous!.binding.provenance.revision).toBe('SYNTHETIC sourceA');expect(head.delivery).toEqual({schemaVersion:1,popup:false,desktop:true,sound:'lv-chime'});expect(head.previous!.delivery).toEqual(initialDelivery);
});

it('validates ordinary save data without rearming or changing the running store',()=>{
 const b=book();b.append([11,21],1);const state=b.store.current,text=encodeCompoundPrivateDocument([b.snapshot()],100);parseCompoundPrivateDocument(text);expect(b.store.current).toBe(state);expect(b.store.current.previous).toEqual([11,21]);expect(b.store.current.lastSequence).toBe(1);
});

it('rejects missing, mismatched, duplicate and orphan revision/provenance journal bindings',()=>{
 const b=book();b.append([11,21],1);const text=encodeCompoundPrivateDocument([b.snapshot()],100);
 for(const change of [(x:any)=>x.records[0].core.declarations=[],(x:any)=>x.records[0].core.history[0].values=[11],(x:any)=>x.records[0].journal[0].bindingId='missing',(x:any)=>x.records[0].provenanceBindings.push({...x.records[0].provenanceBindings[0],id:'extra'}),(x:any)=>x.records[0].provenanceBindings[0].provenance.basis='foreign'])expect(()=>parseCompoundPrivateDocument(mutate(text,change))).toThrow();
});

it('rejects invalid clocks, identity, sequence, delivery and private-schema changes atomically',()=>{
 const b=book();b.append([11,21],1);const text=encodeCompoundPrivateDocument([b.snapshot()],100),state=b.store.current;
 for(const change of [(x:any)=>x.schemaVersion=2,(x:any)=>x.records[0].core.history[0].at=101,(x:any)=>x.records[0].core.batchHighWater=0,(x:any)=>x.records[0].core.history[0].alertId='foreign',(x:any)=>x.records[0].journal[0].delivery.sound='unknown',(x:any)=>x.records[0].core.history.push(x.records[0].core.history[0])])expect(()=>restoreCompoundPrivateCollection(mutate(text,change),110)).toThrow();expect(b.store.current).toBe(state);expect(()=>restoreCompoundPrivateCollection(text,99)).toThrow();
});

it('preserves manual pause and only-once stop while expiry still prevents a restored active alert',()=>{
 const paused=book();paused.append([11,21],1);paused.store.pause(61);expect(restoreCompoundPrivateCollection(encodeCompoundPrivateDocument([paused.snapshot()],100),110)[0].store.current.status).toBe('paused');
 const stopped=book({...definition(),frequency:'only-once'});stopped.append([11,21],1);expect(restoreCompoundPrivateCollection(encodeCompoundPrivateDocument([stopped.snapshot()],100),110)[0].store.current.status).toBe('stopped');
 const expiring=book({...definition(),expiresAt:150});expiring.append([11,21],1);expect(restoreCompoundPrivateCollection(encodeCompoundPrivateDocument([expiring.snapshot()],100),160)[0].store.current.status).toBe('expired');
 for(const b of [paused,stopped]){const p=b.store.prepareEdit({...b.store.current.definition,name:'Explicit edited revision'},110);expect(p.next.status).toBe('waiting-for-data');expect(p.next.previous).toEqual([null,null]);expect(p.notification).toBeNull();expect(p.commit()).toBe(true);}
 const expired=restoreCompoundPrivateCollection(encodeCompoundPrivateDocument([expiring.snapshot()],100),160)[0].store,p=expired.prepareEdit({...expired.current.definition,expiresAt:300},170);expect(p.next.status).toBe('waiting-for-data');expect(p.commit()).toBe(true);
});

it('keeps old state and shared history on false, falsy throw and reentrant failed definition edits',()=>{
 const b=book();b.append([11,21],1);const state=b.store.current;
 expect(()=>b.store.prepareEdit({...definition(),createdAt:1},70)).toThrow();expect(()=>b.store.prepareEdit({...definition(),id:'different'},70)).toThrow();
 expect(b.store.prepareEdit({...definition('Edited'),createdAt:0},70).commit(()=>false)).toBe(false);expect(b.store.current).toBe(state);let error:unknown=Symbol();try{b.store.prepareEdit({...definition('Edited'),createdAt:0},70).commit(()=>{throw 0;});}catch(value){error=value;}expect(error).toBe(0);expect(b.store.current).toBe(state);
 const stale=b.store.prepareEdit({...definition('Edited'),createdAt:0},70);expect(stale.commit(()=>{b.store.pause(71);return true;})).toBe(false);expect(b.store.current.status).toBe('paused');expect(b.store.current.history).toBe(state.history);
});

it('drops only unreferenced prior declaration metadata across repeated edits with no notification',()=>{
 const b=book(),original=b.store.current.definition;for(const [name,at]of [['Edited once',10],['Edited twice',20]] as const){expect(b.store.prepareEdit({...definition(name),createdAt:0},at).commit()).toBe(true);b.declarations.clear();b.declarations.set(b.store.current.revision,b.store.current.definition);}
 const text=encodeCompoundPrivateDocument([b.snapshot()],30),saved=parseCompoundPrivateDocument(text);expect(saved.records[0].core.revision).toBe(3);expect(saved.records[0].core.declarations).toHaveLength(1);expect(saved.records[0].core.history).toEqual([]);expect(()=>encodeCompoundPrivateDocument([{...b.snapshot(),declarations:[{revision:1,definition:original},...b.snapshot().declarations]}],30)).toThrow();
});

it('rejects fabricated state and detached companion items instead of normalizing them into a private saved history',()=>{
 const b=book();b.append([11,21],1);const snapshot=b.snapshot();expect(()=>encodeCompoundPrivateDocument([{...snapshot,state:{...snapshot.state}}],100)).toThrow();expect(()=>encodeCompoundPrivateDocument([{...snapshot,journal:{...snapshot.journal!,item:{...snapshot.journal!.item}}}],100)).toThrow();expect(()=>encodeCompoundPrivateDocument([{...snapshot,journal:{...snapshot.journal!,binding:{...snapshot.journal!.binding,restriction:'allowed'} as any}}],100)).toThrow();
});

it('refuses portable sharing even after a valid private roundtrip and rejects forged permission labels',()=>{
 const b=book();b.append([11,21],1);const text=encodeCompoundPrivateDocument([b.snapshot()],100);expect(parseCompoundPrivateDocument(text).records[0].provenanceBindings[0].restriction).toBe('restricted-live');expect(()=>parseCompoundPrivateDocument(mutate(text,x=>{x.records[0].provenanceBindings[0].restriction='allowed';}))).toThrow();expect(()=>refuseCompoundDocumentShare()).toThrow('Live market data is for personal display only and cannot be exported or shared.');
});

it('bounds serialized ingress before parsing and requires canonical dense finite historical vectors',()=>{
 expect(()=>parseCompoundPrivateDocument(' '.repeat(COMPOUND_PRIVATE_BYTES+1))).toThrow(/20MiB/);const b=book();b.append([11,21],1);const text=encodeCompoundPrivateDocument([b.snapshot()],100);expect(()=>parseCompoundPrivateDocument(text.replace('"values":[11,21]','"values":[1e999,21]'))).toThrow();expect(()=>parseCompoundPrivateDocument(mutate(text,x=>{x.records[0].core.history[0].values={0:11,1:21,length:2};}))).toThrow();
});

it('refuses unsupported private declaration intervals, sessions and frozen kernels without inventing restoration support',()=>{
 const original=definition();for(const context of [{...original.context,interval:'1D' as const},{...original.context,session:'extended' as const}]){const b=book({...original,context});expect(()=>encodeCompoundPrivateDocument([b.snapshot()],100)).toThrow(/Unsupported/);}
 const b=book({...original,predicates:original.predicates.map((p,i)=>i===1?{...p,source:{kind:'indicator',indicator:'rsi',plot:'rsi',snapshotId:'SYNTHETIC unsupported',inputs:{length:2}}}:p)});expect(()=>encodeCompoundPrivateDocument([b.snapshot()],100)).toThrow(/Unsupported/);
});

it('restores an admitted flat100000-entry core iteratively without a linked-JSON recursion or numerical authority',()=>{
 const d={...definition(),id:'s'},history=Array.from({length:100000},(_,i)=>({id:JSON.stringify(['s',1,i+1]),alertId:'s',revision:1,sequence:i+1,at:i+1,barId:'b'+i,values:[11,21],local:true})),text=JSON.stringify({schemaVersion:1,savedAt:100001,definition:d,revision:1,status:'active',batchHighWater:100000,declarations:[{revision:1,definition:d}],history});
 expect(new TextEncoder().encode(text).length).toBeLessThan(COMPOUND_PRIVATE_BYTES);const store=CompoundAlertStore.fromSaved(text,100002);expect(compoundHistorySize(store.current)).toBe(100000);expect(store.current.history?.item.sequence).toBe(100000);expect(store.current.status).toBe('paused');expect(store.current.reason).toBe('history-limit');expect(store.current.previous).toEqual([null,null]);let n:CompoundState['history']=store.current.history,count=0;while(n){count++;n=n.previous;}expect(count).toBe(100000);const edit=store.prepareEdit({...d,name:'Explicit edit at capacity'},100003);expect(edit.next.status).toBe('paused');expect(edit.next.reason).toBe('history-limit');expect(edit.next.history).toBe(store.current.history);
});

it('uses genuine source reacquisition to prime a private restored journal and publishes only a later real price event',async()=>{
 const previous=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);closes.push(()=>selectAlpacaSyntheticStub(previous));const time=unix('2024-03-11T19:59:50Z'),p=await publishedSource({now:time,resolution:'15m'});closes.push(()=>p.dispose());let dataset=p.regular();const native=await ownedInputStylePipelineFixture({dataset});closes.push(()=>native.dispose());expect((await native.accept(dataset)).accepted).toBe(true);
 const context=compoundSourceContext(dataset,dataset.bars)!;let store=new CompoundAlertStore({...definition(),context,predicates:[{id:'c0',source:{kind:'price',field:'close'},operator:{kind:'greater',value:125}},{id:'c1',source:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC frozen',inputs:{length:2,source:'close'}},operator:{kind:'greater',value:129}}]}),journal:CompoundJournalNode|null=null,declarations=[{revision:1,definition:store.current.definition}],published=store.current,owner:CompoundRootOwner={chart:native.controller as CompoundChartInputPort,dataset,rows:dataset.bars,store,definitionRevision:1,execution:'ordinary',enabled:true,suspended:false};
 const bindings=new Map<string,CompoundJournalBinding>(),key=(b:Pick<CompoundPublicationBinding,'revision'|'provenance'>)=>JSON.stringify([b.revision,b.provenance.providerId,b.provenance.datasetId,b.provenance.revision,b.provenance.resolution,b.provenance.basis]);
 const writer:CompoundRootWriter={read:()=>owner,publish(expected,next,acknowledge,binding){if(owner!==expected||published!==store.current)return false;const newItem=next.history!==published.history?next.history?.item:null;if(!acknowledge())return false;published=next;if(newItem&&binding){const stamp=key(binding);let b=bindings.get(stamp);if(!b){b=Object.freeze({id:'SYNTHETIC binding'+bindings.size,revision:binding.revision,declaration:declarations[0].definition,restriction:'restricted-live',provenance:binding.provenance});bindings.set(stamp,b);}journal=Object.freeze({item:newItem,binding:b,delivery:initialDelivery,previous:journal,size:(journal?.size??0)+1});}return true;}};
 let observer=new CompoundAlertObserver(writer);closes.push(()=>observer.dispose());expect((await observer.prepare(time)).commit()).toBe(true);
 const tick=async(value:number,at:number)=>{p.setNow(at);p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:at,price:value,high:value,low:value,size:1}],receivedAt:''});await flushMtf();dataset=p.regular();expect((await native.accept(dataset)).accepted).toBe(true);owner={...owner,dataset,rows:dataset.bars,store};};
 await tick(150,time+1);expect((await observer.prepare(time+1)).commit()).toBe(true);const saved=encodeCompoundPrivateDocument([{state:store.current,declarations,delivery:initialDelivery,journal}],time+1);observer.dispose();const restored=restoreCompoundPrivateCollection(saved,time+2)[0];store=restored.store;declarations=[...restored.declarations];expect(declarations[0].definition).toBe(store.current.definition);journal=restored.journal;expect(journal!.binding.declaration).toBe(store.current.definition);bindings.clear();if(journal)bindings.set(key(journal.binding),journal.binding);published=store.current;owner={...owner,store};observer=new CompoundAlertObserver(writer);
 const seed=await observer.prepare(time+2);expect(seed.priming).toBe(true);expect(seed.commit()).toBe(true);expect(compoundHistory(store.current).map(n=>n.values)).toEqual([[150,140]]);await tick(160,time+3);expect((await observer.prepare(time+3)).commit()).toBe(true);const history=compoundHistory(store.current);expect(history.map(n=>n.values)).toEqual([[150,140],[160,145]]);expect(new Set(history.map(n=>n.id)).size).toBe(2);expect(store.current.lastSequence).toBe(4);expect(parseCompoundPrivateDocument(encodeCompoundPrivateDocument([{state:store.current,declarations,delivery:initialDelivery,journal}],time+3)).records[0].journal).toHaveLength(2);expect(()=>refuseCompoundDocumentShare()).toThrow('Live market data is for personal display only and cannot be exported or shared.');
});
