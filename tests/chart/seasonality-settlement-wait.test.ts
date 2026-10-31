import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {ownedSourceFixture} from '../fixtures/seasonality-live-owned-source';
import {publishedSource,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import * as builtin from '../../src/chart/builtin-presentation-proof';
import * as provider from '../../src/domain/alpaca-live';

// NEW primitive-only resource tests. Actual public CJS/provider/owned native
// fixture supplies EVERY observed model, source reservation and group key.
// Ledger fields are read only. No numerical or native grant is synthesized.
const requireActual=createRequire(path.join(process.cwd(),'electron/alpaca-stub.cjs'));
const {AlpacaMarketData}=requireActual('./public-alpaca.cjs'),{alpacaStubTransport}=requireActual('./alpaca-stub.cjs');
const NOW=Date.parse('2026-10-20T16:00:00Z')/1000,inputs={startYear:2016,endYear:2026,meanRow:true,deviationRow:true,positiveFrequencyRow:true,projectionGeometry:true};
const nativeAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const aborted=(signal:AbortSignal)=>Reflect.apply(nativeAborted,signal,[]) as boolean;
type Control=builtin.BuiltinPresentationControl;
type Ledger=Control&{sourcePendingW:number;sourcePendingSlots:number};
type Targets=Ledger&{settlementWaits:Set<object>;noticeSettlementWait(record:object):void;retireSettlementWait(record:object):void;runSettlementWait(key:object):void;finishSettlementWait(key:object):void};
type Reservation=builtin.BuiltinSourceReservation;
const closes:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{const errors:unknown[]=[];for(const close of closes.splice(0).reverse())try{await close();}catch(error){errors.push(error);}vi.restoreAllMocks();vi.unstubAllGlobals();if(errors.length)throw new AggregateError(errors,'Primitive fixture cleanup failed.');});

async function pending(){
 let release!:()=>void,started!:()=>void,held=false;
 const gate=new Promise<void>(resolve=>{release=resolve;}),received=new Promise<void>(resolve=>{started=resolve;}),tasks=new Set<Promise<unknown>>(),callbacks=new Set<()=>void>();
 const captured:{control?:Control;model?:object;reservation?:Reservation;group?:provider.AlpacaSeasonalityPreparationGroup}={},automaticWaits:builtin.BuiltinSettlementWait[]=[];
 let producer:Awaited<ReturnType<typeof publishedSource>>|undefined,f:Awaited<ReturnType<typeof ownedSourceFixture>>|undefined,closed=false;
 const network=()=>{throw Error('Real network/socket forbidden in SYNTHETIC primitive fixture.');};vi.stubGlobal('fetch',network);vi.stubGlobal('WebSocket',network);
 const transport=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},packaged:false,profile:path.join(os.tmpdir(),'lv-synthetic-settlement-primitive'),tmpdir:os.tmpdir(),elapsedNow:()=>0});expect(transport.mode).toBe('synthetic');
 const market=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,marketNow:()=>NOW*1000,restMinIntervalMs:0,restTimeoutMs:30000,emit:()=>{}});
 const close=async()=>{if(closed)return;closed=true;release();const errors:unknown[]=[];for(const stop of [()=>f?.dispose(),()=>producer?.dispose(),()=>market.close()])try{stop();}catch(error){errors.push(error);}await Promise.allSettled([...tasks]);await flushMtf();callbacks.clear();if(errors.length)throw new AggregateError(errors,'Primitive actual source cleanup failed.');};closes.push(close);
 const originalPort=builtin.createBuiltinPresentationPort,instrument:typeof originalPort=(chart,publication,bars,build)=>originalPort(chart,publication,bars,actual=>{captured.control=actual;const observeWait=actual.waitSeasonalitySourceSettlement.bind(actual);vi.spyOn(actual,'waitSeasonalitySourceSettlement').mockImplementation((...args:Parameters<typeof observeWait>)=>{const result=observeWait(...args);if(result)automaticWaits.push(result);return result;});const original=actual.reserveSource.bind(actual);vi.spyOn(actual,'reserveSource').mockImplementation((...args:Parameters<typeof original>)=>{const result=original(...args);if(result&&args[3].operations>15000000&&!captured.reservation){captured.model=args[0];captured.reservation=result;}return result;});return build(actual);});vi.spyOn(builtin,'createBuiltinPresentationPort').mockImplementation(instrument);
 const originalGroup=provider.createAlpacaSeasonalityPreparationGroup;vi.spyOn(provider,'createAlpacaSeasonalityPreparationGroup').mockImplementation((...args:Parameters<typeof originalGroup>)=>{const result=originalGroup(...args);if(!captured.group)captured.group=result;return result;});
 producer=await publishedSource({resolution:'1m',now:NOW,plan:'free',reply:(sent:Request)=>{const task=(async()=>{const result=await market.bars(sent);if(sent.timeframe==='1Day'&&!held){held=true;started();await gate;}return result;})();tasks.add(task);void task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;}});
 const p=producer;await vi.waitFor(()=>{expect(p.raw().bars).toHaveLength(300);expect(p.raw().provenance.state).not.toBe('loading');},{timeout:5000,interval:10});f=await ownedSourceFixture({dataset:p.raw()});const id=f.port.add('seasonality',inputs);await received;
 const {control,model,reservation,group}=captured;if(!control||!model||!reservation||!group)throw Error('The actual source preparation did not issue its private owners.');
 // Primitive unit scope only: retire the genuine automatic port observer,
 // forwarding its original handle/result throughout. Source/demand/group and
 // reservation remain current and physically pending; no authority is retained.
 for(const wait of automaticWaits.splice(0))wait.dispose();await flushMtf();reservation.assertCurrent();
 expect(provider.alpacaSeasonalityPreparationSettled(group)).toBe(false);expect(aborted(reservation.signal)).toBe(false);expect(f.port.captureReadout!(id).state).toBe('unavailable');
 return{f,id,p,control,ledger:control as Ledger,model,reservation,group,release,close,keep<T extends()=>void>(callback:T):T{callbacks.add(callback);return callback;}};
}
const zero=()=>({operations:0,numericSlots:0});

it('rejects unknown/copied source tokens and foreign model BEFORE reading hostile budget descriptors',async()=>{
 const h=await pending();let reads=0,wakes=0;
 const budget=new Proxy(zero(),{getOwnPropertyDescriptor(){reads++;throw Error('Foreign admission data must not be read.');}}),fake=new Proxy({},{get(){throw Error('Foreign token fields must not be read.');}}) as Reservation;
 expect(h.control.waitSeasonalitySourceSettlement(h.model,fake,budget,()=>{wakes++;})).toBeNull();
 expect(h.control.waitSeasonalitySourceSettlement(h.model,{...h.reservation},budget,()=>{wakes++;})).toBeNull();
 expect(h.control.waitSeasonalitySourceSettlement({},h.reservation,budget,()=>{wakes++;})).toBeNull();
 expect(reads).toBe(0);expect(wakes).toBe(0);expect(aborted(h.reservation.signal)).toBe(false);expect(provider.alpacaSeasonalityPreparationSettled(h.group)).toBe(false);
});

it('refuses insufficient genuine W/U headroom without pruning or cancelling the prior source',async()=>{
 const h=await pending(),W=h.ledger.sourcePendingW,U=h.ledger.sourcePendingSlots;
 expect(h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,{operations:20000000,numericSlots:0},()=>{})).toBeNull();
 expect(h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,{operations:0,numericSlots:2000000},()=>{})).toBeNull();
 expect(h.ledger.sourcePendingW).toBe(W);expect(h.ledger.sourcePendingSlots).toBe(U);expect(aborted(h.reservation.signal)).toBe(false);expect(provider.alpacaSeasonalityPreparationSettled(h.group)).toBe(false);expect(h.p.requests.filter(request=>request.timeframe==='1Day')).toHaveLength(1);
});

it('charges exactly one fixed waiter, rejects duplicate/fake notice, and defers disposal refund until unwind',async()=>{
 const h=await pending(),W=h.ledger.sourcePendingW,U=h.ledger.sourcePendingSlots;let calls=0;
 const target=h.control as Targets,notices=vi.spyOn(target,'noticeSettlementWait'),wake=h.keep(()=>{calls++;}),wait=h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,zero(),wake);expect(wait).not.toBeNull();
 expect(h.ledger.sourcePendingW).toBe(W+32768);expect(h.ledger.sourcePendingSlots).toBe(U+4096);
 expect(h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,zero(),wake)).toBeNull();const priorNotices=notices.mock.calls.length;for(let index=0;index<100;index++)h.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();expect(notices.mock.calls).toHaveLength(priorNotices);expect(calls).toBe(0);expect(aborted(h.reservation.signal)).toBe(false);
 wait!.dispose();expect(h.ledger.sourcePendingW).toBe(W+32768);expect(h.ledger.sourcePendingSlots).toBe(U+4096);await flushMtf();expect(h.ledger.sourcePendingW).toBe(W);expect(h.ledger.sourcePendingSlots).toBe(U);wait!.dispose();expect(h.ledger.sourcePendingW).toBe(W);
});

it('wakes only after genuine physical settlement and debit, keeping fee charged through disposal INSIDE wake',async()=>{
 const h=await pending();let calls=0,wait:builtin.BuiltinSettlementWait|null=null;
 const observations:Array<{settled:boolean;aborted:boolean;work:number;slots:number;afterDisposeWork:number}>=[];
 const wake=h.keep(()=>{calls++;const before={settled:provider.alpacaSeasonalityPreparationSettled(h.group),aborted:aborted(h.reservation.signal),work:h.ledger.sourcePendingW,slots:h.ledger.sourcePendingSlots};wait!.dispose();observations.push({...before,afterDisposeWork:h.ledger.sourcePendingW});});
 wait=h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,zero(),wake);expect(wait).not.toBeNull();h.reservation.release();expect(calls).toBe(0);expect(provider.alpacaSeasonalityPreparationSettled(h.group)).toBe(false);expect(aborted(h.reservation.signal)).toBe(false);
 h.release();await vi.waitFor(()=>expect(calls).toBe(1),{timeout:10000,interval:10});await flushMtf();expect(observations).toEqual([{settled:true,aborted:true,work:32768,slots:4096,afterDisposeWork:32768}]);expect(h.ledger.sourcePendingW).toBe(0);expect(h.ledger.sourcePendingSlots).toBe(0);h.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();expect(calls).toBe(1);
});

it.each([undefined,false,new Error('SYNTHETIC private waiter error')])('contains throwing/falsy private wake without leaking fee or invoking a second wake (%s)',async failure=>{
 const h=await pending();let calls=0,paid=0;const wake=h.keep(()=>{calls++;paid=h.ledger.sourcePendingW;throw failure;});
 const wait=h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,zero(),wake);expect(wait).not.toBeNull();h.reservation.release();h.release();await vi.waitFor(()=>expect(calls).toBe(1),{timeout:10000,interval:10});await flushMtf();expect(paid).toBe(32768);expect(h.ledger.sourcePendingW).toBe(0);expect(h.ledger.sourcePendingSlots).toBe(0);wait!.dispose();h.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();expect(calls).toBe(1);
});

it('pipeline disposal cancels queued authority-free observers while real pending source debit remains held until physical completion',async()=>{
 const h=await pending(),W=h.ledger.sourcePendingW,U=h.ledger.sourcePendingSlots;let calls=0;const wake=h.keep(()=>{calls++;});
 const wait=h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,zero(),wake);expect(wait).not.toBeNull();h.f.port.dispose();expect(calls).toBe(0);expect(h.ledger.sourcePendingW).toBe(W+32768);expect(h.ledger.sourcePendingSlots).toBe(U+4096);await flushMtf();expect(h.ledger.sourcePendingW).toBe(W);expect(h.ledger.sourcePendingSlots).toBe(U);expect(aborted(h.reservation.signal)).toBe(false);expect(provider.alpacaSeasonalityPreparationSettled(h.group)).toBe(false);
 h.release();await vi.waitFor(()=>expect(aborted(h.reservation.signal)).toBe(true),{timeout:10000,interval:10});await flushMtf();expect(calls).toBe(0);expect(h.ledger.sourcePendingW).toBe(0);expect(h.ledger.sourcePendingSlots).toBe(0);
});

it('direct fake/actual-record/unentered cleanup targets cannot refund a genuine waiter before captured native unwind',async()=>{
 const h=await pending(),target=h.control as Targets,W=h.ledger.sourcePendingW,U=h.ledger.sourcePendingSlots;let reads=0,calls=0;const wake=h.keep(()=>{calls++;}),wait=h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,zero(),wake);expect(wait).not.toBeNull();
 const record=[...target.settlementWaits][0],fake=new Proxy({},{get(){reads++;throw Error('Unknown queued key fields must not be read.');}});expect(record).toBeDefined();target.noticeSettlementWait(fake);target.retireSettlementWait(fake);target.runSettlementWait(fake);target.finishSettlementWait(fake);target.runSettlementWait(record);target.finishSettlementWait(record);expect(reads).toBe(0);expect(calls).toBe(0);expect(h.ledger.sourcePendingW).toBe(W+32768);
 wait!.dispose();const key=Object.getOwnPropertyDescriptor(record,'cleanupTicket')!.value;expect(key).toBeTruthy();target.finishSettlementWait(key);target.runSettlementWait(key);expect(h.ledger.sourcePendingW).toBe(W+32768);expect(h.ledger.sourcePendingSlots).toBe(U+4096);await flushMtf();expect(h.ledger.sourcePendingW).toBe(W);expect(h.ledger.sourcePendingSlots).toBe(U);expect(calls).toBe(0);
});

it('direct calls with the actual queued wake key BEFORE native queue entry cannot run or consume the genuine later wake',async()=>{
 const h=await pending(),target=h.control as Targets,original=target.noticeSettlementWait.bind(target);let calls=0,attempts=0;const premature:number[]=[],wake=h.keep(()=>{calls++;});
 vi.spyOn(target,'noticeSettlementWait').mockImplementation(record=>{original(record);const key=Object.getOwnPropertyDescriptor(record,'wakeTicket')?.value;if(key){attempts++;target.runSettlementWait(key);target.finishSettlementWait(key);premature.push(calls);}});
 const wait=h.control.waitSeasonalitySourceSettlement(h.model,h.reservation,zero(),wake);expect(wait).not.toBeNull();h.reservation.release();h.release();await vi.waitFor(()=>expect(calls).toBe(1),{timeout:10000,interval:10});await flushMtf();expect(attempts).toBe(1);expect(premature).toEqual([0]);expect(h.ledger.sourcePendingW).toBe(0);expect(h.ledger.sourcePendingSlots).toBe(0);expect(calls).toBe(1);
});
