import {afterEach,expect,it,vi} from 'vitest';
import {publishedSource,flushMtf,unix,response,syntheticSession,type Request} from '../fixtures/qualified-nyse-mtf-source';
import {ownedInputStylePipelineFixture} from '../fixtures/seasonality-input-style-pipeline';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {CompoundAlertStore,COMPOUND_POLICY,compoundHistory,type CompoundDefinition,type CompoundOperator} from '../../src/domain/compound-alerts';
import {COMPOUND_HISTORY_EXPORT_NOTICE,CompoundAlertObserver,compoundSourceContext,compoundObservationSharedUsage,compoundPublicationBindingFacts,type CompoundRootOwner,type CompoundRootWriter,type CompoundChartInputPort,type CompoundPublicationBinding,type CompoundOwnedPublication} from '../../src/ui/compound-alert-observer';
import * as kernels from '../../src/domain/indicators';
import {isAlpacaSyntheticStub,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import type {BarDataset} from '../../src/domain/types';

// Real provider + actual adapter/native input fixture. Only the ROOT collection
// holder is controlled. No source registrar, fake numerical result, fake native
// ready signal, profile/key/network access, DOM or GUI proof is introduced.
const closes:Array<()=>unknown>=[];
afterEach(()=>{const failures:unknown[]=[];for(const close of closes.splice(0).reverse())try{close();}catch(error){failures.push(error);}vi.restoreAllMocks();if(failures.length)throw new AggregateError(failures,'Synthetic compound source cleanup failed.');});
function declaration(dataset:BarDataset,ops:readonly CompoundOperator[]=[{kind:'greater',value:125},{kind:'greater',value:129}],frequency:CompoundDefinition['frequency']='every-time'):CompoundDefinition{
 const context=compoundSourceContext(dataset,dataset.bars);if(!context)throw Error('The genuine synthetic compound source context is unavailable.');
 return{kind:'compound',schemaVersion:1,policy:COMPOUND_POLICY,mode:'ordinary',id:'synthetic-source-and',name:'Synthetic price and SMA',message:'Synthetic only',context,predicates:ops.map((operator,i)=>({id:'c'+i,operator,source:i===0?{kind:'price',field:'close'}:{kind:'indicator',indicator:'sma',plot:'sma',snapshotId:'frozen-'+i,inputs:{length:2,source:'close'}}})),frequency,createdAt:0,expiresAt:null};
}
async function setup(options:Parameters<typeof publishedSource>[0]={},ops?:readonly CompoundOperator[],frequency?:CompoundDefinition['frequency']){
 const prior=isAlpacaSyntheticStub();selectAlpacaSyntheticStub(true);closes.push(()=>selectAlpacaSyntheticStub(prior));
 const p=await publishedSource({...options,resolution:'15m'});closes.push(()=>p.dispose());const dataset=p.regular();
 const native=await ownedInputStylePipelineFixture({dataset});closes.push(()=>native.dispose());expect((await native.accept(dataset)).accepted).toBe(true);
 const store=new CompoundAlertStore(declaration(dataset,ops,frequency));
 let owner:CompoundRootOwner={chart:native.controller as CompoundChartInputPort,dataset,rows:dataset.bars,store,definitionRevision:1,execution:'ordinary',enabled:true,suspended:false},published=store.current,refuse=false,throwBefore=false,omitAcknowledgment=false,notified=()=>{};
 const bindings:CompoundPublicationBinding[]=[];
 const writer:CompoundRootWriter={read:()=>owner,publish(expected,next,acknowledge,binding){
  // Controlled closed ROOT holder: no callbacks between its authoritative
  // reference check, domain acknowledgment and collection-ref assignment.
  if(throwBefore)throw 0;if(omitAcknowledgment)return true;if(refuse||owner!==expected||published!==owner.store.current)return false;
  if(!acknowledge())return false;published=next;if(binding)bindings.push(binding);notified();return true;
 }};
 const observer=new CompoundAlertObserver(writer);closes.push(()=>observer.dispose());
 return{p,native,store,observer,bindings,owner:()=>owner,published:()=>published,acknowledgeLifecycle(){published=store.current;},afterPublished(callback:()=>void){notified=callback;},refuse(value:boolean){refuse=value;},noAcknowledge(value:boolean){omitAcknowledgment=value;},throwBefore(value:boolean){throwBefore=value;},setOwner(value:CompoundRootOwner){owner=value;},async update(){const next=p.regular();expect((await native.accept(next)).accepted).toBe(true);owner={...owner,dataset:next,rows:next.bars};return next;}};
}
const now=unix('2024-03-11T20:00:00Z');
function concurrentSourceRows(){return ['2024-02-23','2024-02-26','2024-02-27','2024-02-28','2024-02-29','2024-03-01','2024-03-04','2024-03-05','2024-03-06','2024-03-07','2024-03-08','2024-03-11'].flatMap(date=>syntheticSession(date+(date==='2024-03-11'?'T13:30:00Z':'T14:30:00Z'),26,130));}
function sibling(f:Awaited<ReturnType<typeof setup>>,id:string,kernels:number,first:CompoundOperator={kind:'greater',value:100}){
 const original=f.owner(),base=declaration(original.dataset,Array.from({length:kernels+1},(_,i)=>i===0?first:{kind:'greater' as const,value:100})),definition={...base,id,predicates:base.predicates.map((p,i)=>i===0?p:{...p,source:{kind:'indicator' as const,indicator:'sma',plot:'sma',snapshotId:'SYNTHETIC shared '+i,inputs:{length:i+1,source:'close'}}})},store=new CompoundAlertStore(definition);let owner:CompoundRootOwner={...original,store},published=store.current,notified=()=>{};
 const writer:CompoundRootWriter={read:()=>owner,publish(expected,next,acknowledge){if(expected!==owner||published!==store.current)return false;if(!acknowledge())return false;published=next;notified();return true;}};
 const observer=new CompoundAlertObserver(writer);closes.push(()=>observer.dispose());return{store,observer,refresh(){owner={...f.owner(),store,definitionRevision:store.current.revision};},afterPublished(callback:()=>void){notified=callback;}};
}

it('calculates actual price130 and frozen SMA2=130 from one genuine current cut',async()=>{
 const f=await setup(),before=vi.spyOn(kernels,'sma'),p=await f.observer.prepare(now);expect(p.values).toEqual([130,130]);expect(p.confirmed).toBe(true);expect(before).toHaveBeenCalledTimes(1);
 expect(p.priming).toBe(true);expect(p.commit()).toBe(true);expect(f.published()).toBe(f.store.current);expect(f.store.current.previousClosed).toEqual([130,130]);expect(compoundHistory(f.store.current)).toEqual([]);expect(p.rollback()).toBe(false);
});

it('shares one actual SMA calculation for numerically identical frozen declarations',async()=>{
 const f=await setup({},[{kind:'greater',value:125},{kind:'greater',value:129},{kind:'less',value:140},{kind:'greater',value:100},{kind:'inside',lower:120,upper:140}]);
 const calculate=vi.spyOn(kernels,'sma'),read=vi.spyOn(kernels,'sourceValues'),p=await f.observer.prepare(now);expect(p.values).toEqual([130,130,130,130,130]);expect(calculate).toHaveBeenCalledTimes(1);expect(read).toHaveBeenCalledTimes(1);expect(p.commit()).toBe(true);expect(compoundHistory(f.store.current)).toEqual([]);
});

it('does not latch a real price crossing until a later SMA condition becomes true',async()=>{
 const time=unix('2024-03-11T19:59:50Z'),f=await setup({now:time},[{kind:'crossing-up',value:140},{kind:'greater',value:145}]);expect((await f.observer.prepare(time)).commit()).toBe(true);expect(compoundHistory(f.store.current)).toEqual([]);
 const tick=async(price:number,offset:number)=>{f.p.setNow(time+offset);f.p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:time+offset,price,high:price,low:price,size:1}],receivedAt:''});await flushMtf();await f.update();const p=await f.observer.prepare(time+offset);expect(p.commit()).toBe(true);return p.values;};
 expect(await tick(150,1)).toEqual([150,140]);expect(compoundHistory(f.store.current)).toEqual([]);
 expect(await tick(170,2)).toEqual([170,150]);expect(compoundHistory(f.store.current)).toEqual([]);
 await tick(135,3);expect(await tick(170,4)).toEqual([170,150]);expect(compoundHistory(f.store.current).map(n=>n.values)).toEqual([[170,150]]);
});

it('cannot close a genuine forming source merely by supplying a later observer clock',async()=>{
 const actual=unix('2024-03-11T19:59:59Z'),f=await setup({now:actual});const p=await f.observer.prepare(actual);expect(p.values).toEqual([130,130]);expect(p.confirmed).toBe(false);expect(p.rollback()).toBe(true);
 const later=await f.observer.prepare(actual+120);expect(later.confirmed).toBe(false);expect(later.rollback()).toBe(true);expect(compoundHistory(f.store.current)).toEqual([]);
});

it('refuses a future-valued full source before running the canonical kernel',async()=>{
 const f=await setup(),calculate=vi.spyOn(kernels,'sma'),last=f.owner().rows.at(-1)!.time;
 await expect(f.observer.prepare(last-1)).rejects.toThrow(/not yet available/);expect(calculate).not.toHaveBeenCalled();await Promise.resolve();expect(f.observer.retainedUsage()).toEqual({work:0,slots:0});
});

it('copied source objects offer only unknown status and never numerical source permission',async()=>{
 const f=await setup(),calculate=vi.spyOn(kernels,'sma'),old=f.owner();
 f.setOwner({...old,dataset:{...old.dataset,bars:old.rows as BarDataset['bars']}});
 const p=await f.observer.prepare(now);expect(p.values).toEqual([null,null]);expect(p.confirmed).toBe(false);expect(calculate).not.toHaveBeenCalled();expect(p.commit()).toBe(true);expect(f.store.current.status).toBe('waiting-for-data');expect(compoundHistory(f.store.current)).toEqual([]);
 f.setOwner(old);const recovered=await f.observer.prepare(now+1);expect(recovered.priming).toBe(true);expect(recovered.commit()).toBe(true);expect(f.store.current.previousClosed).toEqual([130,130]);expect(compoundHistory(f.store.current)).toEqual([]);
});

it('observed original-value failure terminally retires that cut even after restoration',async()=>{
 const f=await setup(),p=await f.observer.prepare(now),row=f.owner().rows[0],original=row.close;row.close=original+1;
 expect(()=>p.assertCurrent()).toThrow(/changed/);row.close=original;expect(()=>p.commit()).toThrow(/retired/);expect(compoundHistory(f.store.current)).toEqual([]);await Promise.resolve();expect(f.observer.retainedUsage()).toEqual({work:0,slots:0});
});

it('actual root lifecycle replacement during a chart guard cannot publish stale values',async()=>{
 const f=await setup(),original=f.native.controller.isInputCurrent!;let once=true;
 vi.spyOn(f.native.controller,'isInputCurrent').mockImplementation(input=>{const result=original.call(f.native.controller,input);if(once){once=false;f.store.pause(now);}return result;});
 await expect(f.observer.prepare(now)).rejects.toThrow(/changed/);expect(f.store.current.status).toBe('paused');expect(compoundHistory(f.store.current)).toEqual([]);
});

it('rejects source retirement across the actual asynchronous calculation boundary',async()=>{
 const f=await setup(),pending=f.observer.prepare(now);f.p.dispose();await expect(pending).rejects.toThrow();expect(compoundHistory(f.store.current)).toEqual([]);await Promise.resolve();expect(f.observer.retainedUsage()).toEqual({work:0,slots:0});
});

it('refused or falsy-failed closed publication preserves a fresh source retry',async()=>{
 const f=await setup(),p=await f.observer.prepare(now);f.refuse(true);expect(p.commit()).toBe(false);expect(compoundHistory(f.store.current)).toEqual([]);f.refuse(false);
 const second=await f.observer.prepare(now+1);f.throwBefore(true);let failure:unknown=Symbol();try{second.commit();}catch(error){failure=error;}expect(failure).toBe(0);expect(compoundHistory(f.store.current)).toEqual([]);f.throwBefore(false);
 expect((await f.observer.prepare(now+2)).commit()).toBe(true);expect(f.store.current.previousClosed).toEqual([130,130]);expect(compoundHistory(f.store.current)).toEqual([]);
});

it('workspace cancellation preserves committed baselines while manual pause clears them',async()=>{
 const f=await setup({},[{kind:'crossing-up',value:140},{kind:'greater',value:0}]);expect((await f.observer.prepare(now)).commit()).toBe(true);expect(f.store.current.previous).toEqual([130,130]);
 const pending=await f.observer.prepare(now+1);f.observer.cancelPendingForWorkspace();expect(pending.rollback()).toBe(false);expect(f.store.current.previous).toEqual([130,130]);f.store.pause(now+2);expect(f.store.current.previous).toEqual([null,null]);expect(compoundHistory(f.store.current)).toEqual([]);
});

it('bounds display pages and never allows restricted source history export',async()=>{
 const initial=unix('2024-03-11T19:59:50Z'),f=await setup({now:initial});expect((await f.observer.prepare(initial)).commit()).toBe(true);expect(compoundHistory(f.store.current)).toEqual([]);
 const time=initial+1;f.p.setNow(time);f.p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();await f.update();expect((await f.observer.prepare(time)).commit()).toBe(true);
 const page=f.observer.historyPage(f.store,0,10);expect(page).toEqual([{at:time,values:[150,140],restriction:'restricted-live'}]);expect(f.observer.historyPage(f.store,0,10)).toBe(page);
 const deep=f.observer.historyPage(f.store,1,10);expect(deep).toEqual([]);f.p.setNow(time+1);f.p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:time+1,price:160,high:160,low:160,size:1}],receivedAt:''});await flushMtf();await f.update();expect((await f.observer.prepare(time+1)).commit()).toBe(true);expect(f.observer.historyPage(f.store,1,10)).toBe(deep);f.observer.refreshHistoryPage();expect(f.observer.historyPage(f.store,1,10)).toEqual(page);
 expect(()=>f.observer.historyPage(f.store,0,101)).toThrow(/page/);expect(()=>f.observer.exportHistory()).toThrow(COMPOUND_HISTORY_EXPORT_NOTICE);
});

it('keeps both paid cuts through closed-writer notification and releases only after unwind',async()=>{
 const f=await setup(),first=await f.observer.prepare(now);expect(first.commit()).toBe(true);await Promise.resolve();const before=f.observer.retainedUsage();
 const second=await f.observer.prepare(now+1);expect(f.observer.retainedUsage()).toEqual({work:before.work+second.estimatedWork,slots:before.slots+second.numericSlots});let during:ReturnType<CompoundAlertObserver['retainedUsage']>|null=null;
 f.afterPublished(()=>{during=f.observer.retainedUsage();});expect(second.commit()).toBe(true);expect(during).toEqual({work:before.work+second.estimatedWork,slots:before.slots+second.numericSlots});
 await Promise.resolve();expect(f.observer.retainedUsage()).toEqual({work:second.estimatedWork,slots:second.numericSlots});f.observer.dispose();expect(f.observer.retainedUsage().work).toBe(second.estimatedWork);await Promise.resolve();expect(f.observer.retainedUsage()).toEqual({work:0,slots:0});
});

it('requires the full exact accepted native input despite shared live-lineage identity',async()=>{
 const time=unix('2024-03-11T19:59:59Z'),f=await setup({now:time}),old=f.owner();
 f.p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();
 const next=f.p.regular(),source=sourceContextForDataset(next,next.bars);f.setOwner({...old,dataset:next,rows:next.bars});
 // Real producer advanced; the actual native input has not yet accepted it.
 expect(f.native.controller.isInputCurrent!({bars:next.bars,source,style:'candles'})).toBe(true);expect(f.native.controller.isInputExact!({bars:next.bars,source,style:'candles'})).toBe(false);
 const calculate=vi.spyOn(kernels,'sma');await expect(f.observer.prepare(time)).rejects.toThrow(/full actual accepted/);expect(calculate).not.toHaveBeenCalled();expect(compoundHistory(f.store.current)).toEqual([]);
});

it('charges the real consumer before private completion inspects numerical row descriptors',async()=>{
 const f=await setup(),value=f.owner().rows[0],original=Object.getOwnPropertyDescriptor(value,'close')!,own=Object.getOwnPropertyDescriptor;let getters=0,charged=false;
 Object.defineProperty(value,'close',{enumerable:true,configurable:true,get(){getters++;return original.value;}});
 try{
  vi.spyOn(Object,'getOwnPropertyDescriptor').mockImplementation((target,key)=>{if(target===value&&key==='close')charged=f.observer.retainedUsage().work>0;return Reflect.apply(own,Object,[target,key]);});
  const calculate=vi.spyOn(kernels,'sma'),p=await f.observer.prepare(now);expect(charged).toBe(true);expect(getters).toBe(0);expect(calculate).not.toHaveBeenCalled();expect(p.values).toEqual([null,null]);expect(p.rollback()).toBe(true);
 }finally{Object.defineProperty(value,'close',original);}
});

it('a success boolean without actual closed acknowledgment cannot publish numerical history',async()=>{
 const f=await setup(),p=await f.observer.prepare(now);f.noAcknowledge(true);expect(p.commit()).toBe(false);expect(compoundHistory(f.store.current)).toEqual([]);expect(f.published()).toBe(f.store.current);
});

it('an abandoned old publication cannot cancel or commit its genuine replacement',async()=>{
 const f=await setup(),old=await f.observer.prepare(now),current=await f.observer.prepare(now+1);expect(old.rollback()).toBe(false);expect(()=>old.commit()).toThrow(/retired/);expect(current.commit()).toBe(true);expect(f.store.current.previousClosed).toEqual([130,130]);expect(compoundHistory(f.store.current)).toEqual([]);
});

it('bounds optional public comparisons while commit retains its mandatory source fences',async()=>{
 const f=await setup(),p=await f.observer.prepare(now);expect(()=>p.assertCurrent()).not.toThrow();expect(()=>p.assertCurrent()).toThrow(/already consumed/);expect(p.commit()).toBe(true);expect(f.store.current.previousClosed).toEqual([130,130]);expect(compoundHistory(f.store.current)).toEqual([]);
});

it('hands the closed writer original frozen declaration and restrictive actual provenance',async()=>{
 const f=await setup(),definition=f.store.current.definition,dataset=f.owner().dataset,source=sourceContextForDataset(dataset,dataset.bars),p=await f.observer.prepare(now);expect(p.commit()).toBe(true);
 expect(f.bindings).toHaveLength(1);const binding=f.bindings[0];expect(binding.declaration).toBe(definition);expect(binding.revision).toBe(1);expect(binding.restriction).toBe('restricted-live');expect(Object.isFrozen(binding)).toBe(true);expect(Object.isFrozen(binding.provenance)).toBe(true);expect(binding.provenance).toEqual({providerId:dataset.provenance.providerId,datasetId:source.datasetId,revision:source.revision,resolution:'15m',basis:source.basisIdentity});
 expect(()=>f.observer.exportHistory()).toThrow(COMPOUND_HISTORY_EXPORT_NOTICE);
});

it('shares descriptive form context without treating it or a copied dataset as source permission',async()=>{
 const f=await setup(),owner=f.owner(),context=compoundSourceContext(owner.dataset,owner.rows);expect(context).toEqual(f.store.current.definition.context);expect(Object.isFrozen(context)).toBe(true);
 expect(compoundSourceContext({...owner.dataset},owner.rows)).toBeNull();const copied={...owner.dataset,bars:owner.rows as BarDataset['bars']};f.setOwner({...owner,dataset:copied});const candidate=await f.observer.prepare(now);expect(candidate.values).toEqual([null,null]);expect(candidate.commit()).toBe(true);expect(compoundHistory(f.store.current)).toEqual([]);
});

it('primes a genuine confirmed9 without replay and crosses11 only after producer-confirmed closure',async()=>{
 vi.useFakeTimers({now:Date.now()+86400000});closes.push(()=>vi.useRealTimers());
 const bars=[...syntheticSession('2024-03-08T14:30:00Z',26,9),...syntheticSession('2024-03-11T13:30:00Z',25,9),...syntheticSession('2024-03-11T19:45:00Z',1,11)];
 const held:Array<{request:Request;resolve:(value:ReturnType<typeof response>)=>void}>=[];
 const initial=unix('2024-03-11T19:59:59Z');
 const f=await setup({now:initial,bars,reply:request=>request.timeframe!=='1Min'?Promise.resolve(response(request,bars.filter(row=>row.time>=request.start&&row.time<=request.end))):new Promise(resolve=>held.push({request,resolve}))},[{kind:'crossing-up',value:10},{kind:'greater',value:0}],'once-per-bar-close');
 const seed=await f.observer.prepare(initial);expect(seed.values).toEqual([9,9]);expect(seed.priming).toBe(true);expect(seed.commit()).toBe(true);expect(f.store.current.previousClosed).toEqual([9,9]);expect(compoundHistory(f.store.current)).toEqual([]);
 const time=unix('2024-03-11T20:00:05Z');f.p.setNow(time);await vi.advanceTimersByTimeAsync(60000);
 const pending=await f.observer.prepare(time);expect(pending.values).toEqual([9,9]);expect(pending.priming).toBe(true);expect(pending.commit()).toBe(true);expect(compoundHistory(f.store.current)).toEqual([]);
 expect(held.length).toBe(1);const work=held.shift()!;expect(work.request.timeframe).toBe('1Min');expect(work.request.end).toBe(unix('2024-03-11T20:00:00Z'));
 // Sparse invented minute prints are genuine returned REST rows. Each retained
 // 15-minute bucket has its actual unchanged OHLC/volume; no price is filled.
 work.resolve(response(work.request,bars.filter(row=>row.time>=work.request.start&&row.time+60<=work.request.end)));await flushMtf();await f.update();
 const closed=await f.observer.prepare(time+1);expect(closed.values).toEqual([11,10]);expect(closed.confirmed).toBe(true);expect(closed.priming).toBe(false);expect(closed.commit()).toBe(true);expect(compoundHistory(f.store.current).map(item=>item.values)).toEqual([[11,10]]);
});

it('primes a resumed forming source under its unchanged numerical ordinal without resetting workspace suspension',async()=>{
 const time=unix('2024-03-11T19:59:50Z'),f=await setup({now:time});const first=await f.observer.prepare(time);expect(first.confirmed).toBe(false);expect(first.priming).toBe(true);expect(first.commit()).toBe(true);const ordinal=f.store.current.samples[0]!.sequence;
 f.observer.cancelPendingForWorkspace();const suspended=await f.observer.prepare(time+1);expect(suspended.priming).toBe(false);expect(suspended.rollback()).toBe(true);expect(f.store.current.previous).toEqual([130,130]);
 f.store.pause(time+2);f.store.resume(time+3);f.acknowledgeLifecycle();expect(f.store.current.previous).toEqual([null,null]);
 const resumed=await f.observer.prepare(time+4);expect(resumed.confirmed).toBe(false);expect(resumed.priming).toBe(true);expect(resumed.commit()).toBe(true);expect(f.store.current.previous).toEqual([130,130]);expect(f.store.current.samples[0]!.sequence).toBe(ordinal);expect(compoundHistory(f.store.current)).toEqual([]);
 f.p.setNow(time+5);f.p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:time+5,price:150,high:150,low:150,size:1}],receivedAt:''});await flushMtf();await f.update();const market=await f.observer.prepare(time+5);expect(market.priming).toBe(false);expect(market.values).toEqual([150,140]);expect(market.commit()).toBe(true);expect(compoundHistory(f.store.current).map(item=>item.values)).toEqual([[150,140]]);
});

it('admits distinct genuine stores under one shared source budget and recovers only after retired-cut unwind',async()=>{
 const f=await setup({bars:concurrentSourceRows()});expect(f.owner().rows).toHaveLength(300);expect(f.p.raw().bars).toHaveLength(300);await Promise.resolve();expect(compoundObservationSharedUsage()).toEqual({work:0,slots:0});
 const a=sibling(f,'SYNTHETIC aggregate A',4),b=sibling(f,'SYNTHETIC aggregate B',4),first=await a.observer.prepare(now);expect(first.values).toEqual([130,130,130,130,130]);expect(first.commit()).toBe(true);expect(a.store).not.toBe(b.store);
 const charged=compoundObservationSharedUsage();expect(charged).toEqual({work:first.estimatedWork,slots:first.numericSlots});expect(Object.isFrozen(charged)).toBe(true);const calculate=vi.spyOn(kernels,'sma');await expect(b.observer.prepare(now+1)).rejects.toThrow(/budget/);expect(calculate).not.toHaveBeenCalled();expect(compoundObservationSharedUsage()).toEqual(charged);expect(b.observer.retainedUsage()).toEqual({work:0,slots:0});
 a.observer.dispose();expect(compoundObservationSharedUsage()).toEqual(charged);await Promise.resolve();expect(compoundObservationSharedUsage()).toEqual({work:0,slots:0});const retry=await b.observer.prepare(now+2);expect(retry.values).toEqual([130,130,130,130,130]);expect(retry.commit()).toBe(true);expect(compoundHistory(b.store.current)).toEqual([]);expect(compoundObservationSharedUsage()).toEqual({work:retry.estimatedWork,slots:retry.numericSlots});
});

it('keeps global old/new debits during reentrant ROOT notification before admitting another genuine observer',async()=>{
 const f=await setup({bars:concurrentSourceRows()}),a=sibling(f,'SYNTHETIC overlap A',2),b=sibling(f,'SYNTHETIC overlap B',4),first=await a.observer.prepare(now);expect(first.commit()).toBe(true);const next=await a.observer.prepare(now+1);let attempted:Promise<CompoundOwnedPublication>|null=null,during:ReturnType<typeof compoundObservationSharedUsage>|null=null;
 a.afterPublished(()=>{during=compoundObservationSharedUsage();attempted=b.observer.prepare(now+2);void attempted.catch(()=>{});});expect(next.commit()).toBe(true);expect(during).toEqual({work:first.estimatedWork+next.estimatedWork,slots:first.numericSlots+next.numericSlots});expect(compoundObservationSharedUsage()).toEqual(during);expect(attempted).not.toBeNull();await expect(attempted!).rejects.toThrow(/budget/);await Promise.resolve();expect(compoundObservationSharedUsage()).toEqual({work:next.estimatedWork,slots:next.numericSlots});
 const retry=await b.observer.prepare(now+3);expect(retry.values).toEqual([130,130,130,130,130]);expect(retry.commit()).toBe(true);expect(compoundObservationSharedUsage()).toEqual({work:next.estimatedWork+retry.estimatedWork,slots:next.numericSlots+retry.numericSlots});expect(compoundHistory(a.store.current)).toEqual([]);expect(compoundHistory(b.store.current)).toEqual([]);
});

it('authenticates only real binding birth without reading unknown, copied or Proxy metadata',async()=>{
 const f=await setup(),p=await f.observer.prepare(now);expect(p.commit()).toBe(true);const binding=f.bindings[0],facts=compoundPublicationBindingFacts(binding);expect(facts).toBe(binding);expect(facts!.declaration).toBe(f.store.current.definition);expect(facts!.restriction).toBe('restricted-live');expect(Object.isFrozen(facts)).toBe(true);expect(Object.isFrozen(facts!.provenance)).toBe(true);
 let traps=0;const proxy=new Proxy(binding,{get(){traps++;throw Error('Unexpected metadata get.');},getOwnPropertyDescriptor(){traps++;throw Error('Unexpected metadata descriptor.');},getPrototypeOf(){traps++;throw Error('Unexpected metadata prototype.');},ownKeys(){traps++;throw Error('Unexpected metadata keys.');}}),revocable=Proxy.revocable(binding,{});revocable.revoke();
 for(const value of [null,undefined,0,false,{},Object.freeze({...binding}),proxy,revocable.proxy])expect(compoundPublicationBindingFacts(value)).toBeNull();expect(traps).toBe(0);f.observer.dispose();await Promise.resolve();expect(compoundPublicationBindingFacts(binding)).toBe(facts); // Historical metadata membership is NOT current source permission.
});

it('primes the next real source after global budget refusal instead of reporting a recovery crossing',async()=>{
 const time=unix('2024-03-11T19:59:50Z'),f=await setup({now:time,bars:concurrentSourceRows()}),a=sibling(f,'SYNTHETIC recovery A',2,{kind:'crossing-up',value:140}),b=sibling(f,'SYNTHETIC recovery B',4);
 expect((await a.observer.prepare(time)).commit()).toBe(true);const pins=a.store.current.samples;expect(a.store.current.previous).toEqual([130,130,130]);
 const suspended=a.observer.prepare(time+1);a.observer.cancelPendingForWorkspace();await expect(suspended).rejects.toThrow(/changed|retired/);await Promise.resolve();const unchanged=await a.observer.prepare(time+1);expect(unchanged.priming).toBe(false);expect(unchanged.rollback()).toBe(true);await Promise.resolve();
 expect((await b.observer.prepare(time)).commit()).toBe(true);const charged=compoundObservationSharedUsage();await expect(a.observer.prepare(time+1)).rejects.toThrow(/budget/);expect(a.store.current.samples).toBe(pins);expect(a.store.current.previous).toEqual([130,130,130]);expect(compoundHistory(a.store.current)).toEqual([]);
 b.observer.dispose();expect(compoundObservationSharedUsage()).toEqual(charged);await Promise.resolve();
 const tick=async(price:number,at:number)=>{f.p.setNow(at);f.p.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:at,price,high:price,low:price,size:1}],receivedAt:''});await flushMtf();await f.update();a.refresh();return a.observer.prepare(at);};
 const recovered=await tick(150,time+2);expect(recovered.priming).toBe(true);expect(recovered.values.slice(0,2)).toEqual([150,140]);expect(recovered.commit()).toBe(true);expect(compoundHistory(a.store.current)).toEqual([]);expect(a.store.current.samples[0]!.sequence).toBe(pins[0]!.sequence+1);
 const below=await tick(135,time+3);expect(below.priming).toBe(false);expect(below.commit()).toBe(true);const crossed=await tick(150,time+4);expect(crossed.priming).toBe(false);expect(crossed.values.slice(0,2)).toEqual([150,140]);expect(crossed.commit()).toBe(true);expect(compoundHistory(a.store.current).map(item=>item.values.slice(0,2))).toEqual([[150,140]]);
});
