import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {ownedSourceFixture} from '../fixtures/seasonality-live-owned-source';
import {publishedSource,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import * as builtin from '../../src/chart/builtin-presentation-proof';
import * as provider from '../../src/domain/alpaca-live';

// NEW WIP tests only. Actual provider/public CJS NYSE transport and unchanged
// owned-port fixture (canonical SDK +actual extracted adapter owner block).
// Native/UI scheduling stays the original controlled fixture boundary; no
// constructor/proof registration, fake numerical receipt or budget override.
const requireActual=createRequire(path.join(process.cwd(),'electron/alpaca-stub.cjs'));
const {AlpacaMarketData}=requireActual('./public-alpaca.cjs'),{alpacaStubTransport}=requireActual('./alpaca-stub.cjs');
const NOW=Date.parse('2026-10-20T16:00:00Z')/1000;
const FULL={startYear:2016,endYear:2026,meanRow:true,deviationRow:true,positiveFrequencyRow:true,projectionGeometry:true};
type NativeFixture=Awaited<ReturnType<typeof ownedSourceFixture>>;
type Reservation=NonNullable<ReturnType<builtin.BuiltinPresentationControl['reserveSource']>>;
const closes:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{const errors:unknown[]=[];for(const close of closes.splice(0).reverse())try{await close();}catch(error){errors.push(error);}vi.restoreAllMocks();vi.unstubAllGlobals();if(errors.length)throw new AggregateError(errors,'Actual pending-retry cleanup failed.');});
const nativeAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
function aborted(signal:AbortSignal){return Reflect.apply(nativeAborted,signal,[]) as boolean;}

async function actual(){
 let now=NOW,release!:()=>void,started!:(sent:Request)=>void,parsed!:()=>void,hold=true;
 const gate=new Promise<void>(resolve=>{release=resolve;}),request=new Promise<Request>(resolve=>{started=resolve;}),received=new Promise<void>(resolve=>{parsed=resolve;}),reservations:Reservation[]=[],groups:provider.AlpacaSeasonalityPreparationGroup[]=[],responses:Array<{timeframe:string;rows:number;start:number;end:number}>=[],admissions:Array<null|{priorGroupSettled:boolean;priorSignalAborted:boolean}>=[],replies=new Set<Promise<unknown>>();
 const network=()=>{throw Error('No real network/socket in SYNTHETIC pending retry.');};vi.stubGlobal('fetch',network);vi.stubGlobal('WebSocket',network);
 const transport=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},packaged:false,profile:path.join(os.tmpdir(),'lv-synthetic-pending-retry'),tmpdir:os.tmpdir(),elapsedNow:()=>(now-NOW)*1000});expect(transport.mode).toBe('synthetic');
 const market=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,marketNow:()=>now*1000,restMinIntervalMs:0,restTimeoutMs:30000,emit:()=>{}});
 let p:Awaited<ReturnType<typeof publishedSource>>|undefined,f:NativeFixture|undefined,disposed=false;
 const dispose=async()=>{if(disposed)return;disposed=true;release();const errors:unknown[]=[];try{f?.dispose();}catch(error){errors.push(error);}try{p?.dispose();}catch(error){errors.push(error);}try{market.close();}catch(error){errors.push(error);}await Promise.allSettled([...replies]);await flushMtf();if(errors.length)throw new AggregateError(errors,'Real pending-retry fixture disposal failed.');};closes.push(dispose);
 // Every wrapper forwards the actual arguments/result without modification.
 // The observed keys/signals are genuine returned resource owners, not grants.
 const originalPort=builtin.createBuiltinPresentationPort;
 const observe:typeof originalPort=(chart,publication,bars,build)=>originalPort(chart,publication,bars,control=>{const reserve=control.reserveSource.bind(control);vi.spyOn(control,'reserveSource').mockImplementation((...args:Parameters<typeof reserve>)=>{const previous=reservations[0],prior=previous?{priorGroupSettled:!!groups[0]&&provider.alpacaSeasonalityPreparationSettled(groups[0]),priorSignalAborted:aborted(previous.signal)}:null,result=reserve(...args);if(result&&args[3].operations>15000000){reservations.push(result);admissions.push(prior);}return result;});return build(control);});vi.spyOn(builtin,'createBuiltinPresentationPort').mockImplementation(observe);
 const originalGroup=provider.createAlpacaSeasonalityPreparationGroup;vi.spyOn(provider,'createAlpacaSeasonalityPreparationGroup').mockImplementation((...args:Parameters<typeof originalGroup>)=>{const key=originalGroup(...args);groups.push(key);return key;});
 p=await publishedSource({resolution:'1m',now,plan:'free',reply:sent=>{const pending=(async()=>{const stop=sent.timeframe==='1Day'&&hold;if(stop){hold=false;started(sent);}const result=await market.bars(sent);if(result.ok)responses.push({timeframe:sent.timeframe,rows:result.value.bars.length,start:sent.start,end:sent.end});if(stop){parsed();await gate;}return result;})();replies.add(pending);void pending.then(()=>replies.delete(pending),()=>replies.delete(pending));return pending;}});
 const producer=p;
 await vi.waitFor(()=>{expect(producer.raw().bars).toHaveLength(300);expect(producer.raw().provenance.state).not.toBe('loading');},{timeout:5000,interval:10});f=await ownedSourceFixture({dataset:producer.raw()});
 const fixture=f;
 async function pending(id:string){const sent=await request;await received;expect(sent.timeframe).toBe('1Day');expect(fixture.port.captureReadout!(id).state).toBe('unavailable');expect(reservations).toHaveLength(1);expect(groups).toHaveLength(1);expect(provider.alpacaSeasonalityPreparationGroupKnown(groups[0])).toBe(true);expect(provider.alpacaSeasonalityPreparationSettled(groups[0])).toBe(false);expect(aborted(reservations[0].signal)).toBe(false);expect(provider.alpacaSeasonalityDailyUsage(producer.provider)!.operations).toBeGreaterThan(13000000);return{reservation:reservations[0],group:groups[0]};}
 async function tick(){now=NOW+1;producer.setNow(now);producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:now,price:28.125,high:28.125,low:28.125,size:1}],receivedAt:''});await flushMtf();expect(producer.raw().bars).toHaveLength(301);await fixture.apply(producer.raw());await flushMtf();}
 return{f:fixture,p:producer,reservations,groups,responses,admissions,pending,tick,release,dispose,dailyRequests:()=>producer.requests.filter(sent=>sent.timeframe==='1Day')};
}
async function ready(f:NativeFixture,id:string){let result=f.port.captureReadout!(id);await vi.waitFor(()=>{result=f.port.captureReadout!(id);expect(result.state,'actual owned-port pending status: '+JSON.stringify(f.port.list().find(row=>row.id===id))).toBe('ready');},{timeout:10000,interval:10});if(result.state!=='ready')throw Error('The actual current C readout is unavailable.');return result;}
function values(f:NativeFixture,view:Awaited<ReturnType<typeof ready>>){return view.readAt(f.raw().at(-1)!.time).plots.map(row=>row.value);}

it('retries the SAME actual model after a genuine M tick only after its real physical group AND scalar reservation retire',async()=>{
 const h=await actual(),id=h.f.port.add('seasonality',FULL),old=await h.pending(id);await h.tick();expect(h.f.port.captureReadout!(id).state).toBe('unavailable');expect(provider.alpacaSeasonalityPreparationSettled(old.group)).toBe(false);expect(aborted(old.reservation.signal)).toBe(false);expect(h.dailyRequests()).toHaveLength(1);
 h.release();const view=await ready(h.f,id);expect(provider.alpacaSeasonalityPreparationSettled(old.group)).toBe(true);expect(aborted(old.reservation.signal)).toBe(true);expect(h.admissions[1]).toEqual({priorGroupSettled:true,priorSignalAborted:true});expect(values(h.f,view)).toEqual([28.125,12.5,0,10]);expect(h.dailyRequests()).toHaveLength(2);expect(h.f.raw()).toHaveLength(301);
});

it('automatically replans a SAME-model factory-to-full11year edit after real old D/source-charge unwind without borrowing its old year authority',async()=>{
 const h=await actual(),id=h.f.port.add('seasonality',{...FULL,startYear:2015,endYear:2028}),old=await h.pending(id);h.f.port.update(id,{inputs:FULL});await flushMtf();expect(h.f.port.list().find(row=>row.id===id)!.inputs).toMatchObject({startYear:2016,endYear:2026});expect(h.f.port.captureReadout!(id).state).toBe('unavailable');expect(h.dailyRequests()).toHaveLength(1);expect(aborted(old.reservation.signal)).toBe(false);
 h.release();const view=await ready(h.f,id);expect(aborted(old.reservation.signal)).toBe(true);expect(provider.alpacaSeasonalityPreparationSettled(old.group)).toBe(true);expect(h.admissions[1]).toEqual({priorGroupSettled:true,priorSignalAborted:true});expect(h.dailyRequests()).toHaveLength(2);expect(h.dailyRequests()[1].start).toBe(Date.parse('2015-12-01T05:00:00Z')/1000);expect(values(h.f,view)).toEqual([28.125,12.5,0,10]);
});

it('does not auto-grant unrelated model B while A is pending or merely after A becomes ready',async()=>{
 const h=await actual(),a=h.f.port.add('seasonality',FULL);await h.pending(a);const b=h.f.port.add('seasonality',FULL);await flushMtf();expect(h.f.port.captureReadout!(b).state).toBe('unavailable');expect(h.dailyRequests()).toHaveLength(1);h.release();const first=await ready(h.f,a);expect(values(h.f,first)).toEqual([28.125,12.5,0,10]);await flushMtf();expect(h.f.port.captureReadout!(b).state).toBe('unavailable');expect(h.dailyRequests()).toHaveLength(1);
 h.f.port.update(b,{visible:false});h.f.port.update(b,{visible:true});const second=await ready(h.f,b);expect(values(h.f,second)).toEqual([28.125,12.5,0,10]);first.assertCurrent();
});

it('a fake abort event on the exact old resource signal cannot supply native aborted proof or wake a second backend owner',async()=>{
 const h=await actual(),id=h.f.port.add('seasonality',FULL),old=await h.pending(id);await h.tick();old.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();expect(aborted(old.reservation.signal)).toBe(false);expect(provider.alpacaSeasonalityPreparationSettled(old.group)).toBe(false);expect(h.f.port.captureReadout!(id).state).toBe('unavailable');expect(h.dailyRequests()).toHaveLength(1);
 h.release();expect(values(h.f,await ready(h.f,id))).toEqual([28.125,12.5,0,10]);const requests=h.dailyRequests().length;old.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();expect(h.dailyRequests()).toHaveLength(requests);expect(values(h.f,await ready(h.f,id))).toEqual([28.125,12.5,0,10]);
});

it('Hide cancels the pending retry without resurrection and a later explicit Show acquires fresh current admission',async()=>{
 const h=await actual(),id=h.f.port.add('seasonality',FULL),old=await h.pending(id);await h.tick();h.f.port.update(id,{visible:false});h.release();await vi.waitFor(()=>expect(provider.alpacaSeasonalityPreparationSettled(old.group)).toBe(true),{timeout:5000,interval:10});await flushMtf();expect(h.f.port.list().find(row=>row.id===id)!.visible).toBe(false);expect(h.f.port.captureReadout!(id).state).toBe('unavailable');expect(h.dailyRequests()).toHaveLength(1);
 h.f.port.update(id,{visible:true});expect(values(h.f,await ready(h.f,id))).toEqual([28.125,12.5,0,10]);
});

it('Remove prevents an old waiter or late resource notification from recreating the actual model',async()=>{
 const h=await actual(),id=h.f.port.add('seasonality',FULL),old=await h.pending(id);await h.tick();h.f.port.remove(id);h.release();await vi.waitFor(()=>expect(provider.alpacaSeasonalityPreparationSettled(old.group)).toBe(true),{timeout:5000,interval:10});old.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();expect(h.f.port.list().some(row=>row.id===id)).toBe(false);expect(h.dailyRequests()).toHaveLength(1);
});

it('actual port disposal cancels pending retry and no late physical settlement starts another daily request',async()=>{
 const h=await actual(),id=h.f.port.add('seasonality',FULL),old=await h.pending(id);await h.tick();h.f.port.dispose();h.release();await vi.waitFor(()=>expect(provider.alpacaSeasonalityPreparationSettled(old.group)).toBe(true),{timeout:5000,interval:10});old.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();expect(h.dailyRequests()).toHaveLength(1);expect(provider.alpacaSeasonalityDailyUsage(h.p.provider)!.operations).toBe(0);
});

it('a newer accepted edit generation supersedes the retired waiter and only the last complete year request can publish',async()=>{
 const h=await actual(),id=h.f.port.add('seasonality',{...FULL,startYear:2015,endYear:2028}),old=await h.pending(id);h.f.port.update(id,{inputs:FULL});h.f.port.update(id,{inputs:{...FULL,startYear:2017}});old.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();expect(h.dailyRequests()).toHaveLength(1);expect(h.f.port.captureReadout!(id).state).toBe('unavailable');h.release();const view=await ready(h.f,id);
 expect(h.f.port.list().find(row=>row.id===id)!.inputs).toMatchObject({startYear:2017,endYear:2026});expect(h.dailyRequests()).toHaveLength(2);expect(h.dailyRequests()[1].start).toBe(Date.parse('2016-12-01T05:00:00Z')/1000);expect(values(h.f,view)).toEqual([28.125,12.5,0,9]);old.reservation.signal.dispatchEvent(new Event('abort'));await flushMtf();view.assertCurrent();expect(h.dailyRequests()).toHaveLength(2);
});
