import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {ownedNativePipelineFixture} from '../fixtures/seasonality-native-pipeline';
import {ownedSourceFixture} from '../fixtures/seasonality-live-owned-source';
import {publishedSource,flushMtf} from '../fixtures/qualified-nyse-mtf-source';
import {seasonalityUsesLiveDailyHistory} from '../../src/chart/indicator-port';
import * as lookupModule from '../../src/chart/native-registry-lookup';
import * as builtin from '../../src/chart/builtin-presentation-proof';
import * as clone from '../../src/chart/profile-input-clone';
import * as sourceContext from '../../src/chart/source-context';
import * as provider from '../../src/domain/alpaca-live';

// Genuine local synthetic transport/provider and existing actual native/owned
// fixtures. Observers only forward existing calls/results; they mint no source,
// native, budget, result or publication receipt. No DOM/Electron claim.
const requireActual=createRequire(path.join(process.cwd(),'electron/alpaca-stub.cjs'));
const {AlpacaMarketData}=requireActual('./public-alpaca.cjs'),{alpacaStubTransport}=requireActual('./alpaca-stub.cjs');
const NOW=Date.parse('2026-10-20T16:00:00Z')/1000;
const FULL={startYear:2016,endYear:2026,meanRow:true,deviationRow:true,positiveFrequencyRow:true,projectionGeometry:true};
type Fixture=Awaited<ReturnType<typeof ownedNativePipelineFixture>>|Awaited<ReturnType<typeof ownedSourceFixture>>;
type Reservation=NonNullable<ReturnType<builtin.BuiltinPresentationControl['reserveSource']>>;
const closes:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{const failures:unknown[]=[];for(const close of closes.splice(0).reverse())try{await close();}catch(error){failures.push(error);}vi.restoreAllMocks();vi.unstubAllGlobals();if(failures.length)throw new AggregateError(failures,'SYNTHETIC bounded native fixture cleanup failed.');});

async function actual(synchronous=false,style='candles'){
 const previous=provider.isAlpacaSyntheticStub();provider.selectAlpacaSyntheticStub(true);closes.push(()=>provider.selectAlpacaSyntheticStub(previous));
 let p:Awaited<ReturnType<typeof publishedSource>>|undefined,f:Fixture|undefined,market:InstanceType<typeof AlpacaMarketData>|undefined,disposed=false;
 const replies=new Set<Promise<unknown>>(),reservations:Reservation[]=[],armed=new Set<Reservation>(),order:string[]=[],captures:Array<{reservation:Reservation|undefined;armed:boolean;value:lookupModule.NativeRegistryLookup|null}>=[],comparisons:Array<{rows:number;matched:boolean}>=[];
 let beforeCapture:(()=>void)|null=null,beforeCompare:(()=>void)|null=null,afterArm:(()=>void)|null=null;
 const dispose=async()=>{if(disposed)return;disposed=true;const failures:unknown[]=[];for(const close of [()=>f?.dispose(),()=>p?.dispose(),()=>market?.close()])try{close();}catch(error){failures.push(error);}await Promise.allSettled([...replies]);await flushMtf();if(failures.length)throw new AggregateError(failures,'Actual bounded native owners failed to close.');};closes.push(dispose);
 const network=()=>{throw Error('No external network/socket in SYNTHETIC bounded native exercise.');};vi.stubGlobal('fetch',network);vi.stubGlobal('WebSocket',network);
 const transport=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},packaged:false,profile:path.join(os.tmpdir(),'lv-synthetic-bounded-native'),tmpdir:os.tmpdir(),elapsedNow:()=>0});expect(transport.mode).toBe('synthetic');
 market=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,marketNow:()=>NOW*1000,restMinIntervalMs:0,restTimeoutMs:30000,emit:()=>{}});
 const originalPort=builtin.createBuiltinPresentationPort;
 const observe:typeof originalPort=(chart,publication,bars,build)=>originalPort(chart,publication,bars,control=>{
  const reserve=control.reserveSource.bind(control),arm=control.armSeasonalityPreparation.bind(control);
  vi.spyOn(control,'reserveSource').mockImplementation((...args:Parameters<typeof reserve>)=>{const result=reserve(...args);if(result&&(args[0] as {settings?:{kind?:string}}).settings?.kind==='seasonality'){reservations.push(result);order.push('reserve');}return result;});
  vi.spyOn(control,'armSeasonalityPreparation').mockImplementation((...args:Parameters<typeof arm>)=>{const result=arm(...args);armed.add(args[1]);order.push('arm');afterArm?.();return result;});
  return build(control);
 });vi.spyOn(builtin,'createBuiltinPresentationPort').mockImplementation(observe);
 const originalCapture=lookupModule.captureNativeRegistryLookup;
 vi.spyOn(lookupModule,'captureNativeRegistryLookup').mockImplementation((...args:Parameters<typeof originalCapture>)=>{beforeCapture?.();const reservation=reservations.at(-1),wasArmed=!!reservation&&armed.has(reservation),value=originalCapture(...args);captures.push({reservation,armed:wasArmed,value});order.push('capture');return value;});
 const originalCompare=clone.seasonalityLiveNativeInputMatches;
 vi.spyOn(clone,'seasonalityLiveNativeInputMatches').mockImplementation((...args:Parameters<typeof originalCompare>)=>{beforeCompare?.();const matched=originalCompare(...args);comparisons.push({rows:args[2],matched});return matched;});
 const actualMarket=market;
 p=await publishedSource({resolution:'1m',now:NOW,plan:'free',reply:sent=>{const pending=actualMarket.bars(sent);replies.add(pending);void pending.then(()=>replies.delete(pending),()=>replies.delete(pending));return pending;}});
 const producer=p;await vi.waitFor(()=>{expect(producer.raw().bars).toHaveLength(300);expect(producer.raw().provenance.state).not.toBe('loading');},{timeout:5000,interval:10});
 f=synchronous?await ownedSourceFixture({dataset:producer.raw(),style}):await ownedNativePipelineFixture({dataset:producer.raw(),style});
 return{f,p:producer,reservations,order,captures,comparisons,onCapture(action:(()=>void)|null){beforeCapture=action;},onCompare(action:(()=>void)|null){beforeCompare=action;},onArm(action:(()=>void)|null){afterArm=action;}};
}
async function ready(h:Awaited<ReturnType<typeof actual>>,id:string){let view=h.f.port.captureReadout!(id);await vi.waitFor(()=>{view=h.f.port.captureReadout!(id);expect(view.state,JSON.stringify(h.f.port.list().find(row=>row.id===id))).toBe('ready');},{timeout:10000,interval:10});if(view.state!=='ready')throw Error('Genuine current native readout unavailable.');return view;}
function values(h:Awaited<ReturnType<typeof actual>>,view:Awaited<ReturnType<typeof ready>>){return view.readAt(h.f.raw().at(-1)!.time).plots.map(row=>row.value);}
function deepPrototype(parent:object){let traps=0;const proxy=new Proxy(Object.create(parent),{getOwnPropertyDescriptor(target,key){traps++;return Reflect.getOwnPropertyDescriptor(target,key);},getPrototypeOf(target){traps++;return Reflect.getPrototypeOf(target);}});let head:object=proxy;for(let i=0;i<4096;i++)head=Object.create(head);return{head,traps:()=>traps};}
function restorePrototype(registry:object){const parent=Object.getPrototypeOf(registry);closes.push(()=>{Object.setPrototypeOf(registry,parent);});return parent;}

it.each(['candles','heikinashi'])('actual async SDK %s first mount uses current private live classification and captures one lookup only after genuine reserve plus arm',async style=>{
 const h=await actual(false,style);expect(seasonalityUsesLiveDailyHistory(h.f.port)).toBe(true);expect(h.captures).toHaveLength(0);
 const id=h.f.port.add('seasonality',FULL),view=await ready(h,id);expect(values(h,view)).toEqual([28.125,12.5,0,10]);expect(seasonalityUsesLiveDailyHistory(h.f.port,id)).toBe(true);
 expect(h.reservations).toHaveLength(1);expect(h.captures).toHaveLength(1);expect(h.captures[0].reservation).toBe(h.reservations[0]);expect(h.captures[0].armed).toBe(true);expect(h.captures[0].value).not.toBeNull();expect(h.order).toEqual(['reserve','arm','capture']);expect(h.comparisons.some(row=>row.rows===300&&row.matched)).toBe(true);
});

it('genuine synchronous handle-null empty mount defers initial lookup and existing post-add wake reaches unchanged numerical output',async()=>{
 const h=await actual(true),mount=h.f.renderer.mountIndicator.bind(h.f.renderer);let handleNull=false;
 h.f.renderer.mountIndicator=model=>{const instance=h.f.records.get(model.id)?.native.instance;if(instance?.settings.kind==='seasonality')handleNull||=instance.handle===null;return mount(model);};
 const id=h.f.port.add('seasonality',FULL),view=await ready(h,id);expect(handleNull).toBe(true);expect(values(h,view)).toEqual([28.125,12.5,0,10]);expect(h.order).toEqual(['reserve','arm','capture']);expect(h.captures).toHaveLength(1);expect(h.captures[0].armed).toBe(true);
});

it('a genuine source retirement during private initial classification refuses before reserve or lookup without old-source publication',async()=>{
 const h=await actual(true),original=sourceContext.seasonalityDailyContextMode;let retire=true;
 vi.spyOn(sourceContext,'seasonalityDailyContextMode').mockImplementation((...args:Parameters<typeof original>)=>{const result=original(...args);if(result&&retire){retire=false;h.f.stage(h.p.raw());}return result;});
 expect(()=>h.f.port.add('seasonality',FULL)).toThrow();expect(h.reservations).toHaveLength(0);expect(h.captures).toHaveLength(0);expect(h.f.port.list().some(row=>row.kind==='seasonality')).toBe(false);expect(h.comparisons).toHaveLength(0);
});

it('deep native get inheritance inserted after actual arm is refused before capture can walk to the original method',async()=>{
 const h=await actual(),registry=h.f.core.registry,parent=restorePrototype(registry),deep=deepPrototype(parent);let inserted=false;
 h.onArm(()=>{if(!inserted){inserted=true;Object.setPrototypeOf(registry,deep.head);}});
 const id=h.f.port.add('seasonality',FULL);await vi.waitFor(()=>expect(h.captures).toHaveLength(1),{timeout:5000,interval:10});await flushMtf();expect(inserted).toBe(true);expect(h.captures[0].armed).toBe(true);expect(h.captures[0].value).toBeNull();expect(deep.traps()).toBe(0);expect(h.f.port.captureReadout!(id).state).toBe('unavailable');expect(h.comparisons).toHaveLength(0);
});

it('deep insertion inside the genuine registry get callback is rejected by the same lookup post-read before accepting current output',async()=>{
 const h=await actual(),registry=h.f.core.registry,parent=restorePrototype(registry),deep=deepPrototype(parent),get=registry.get;let armed=false,inserted=false;
 Object.defineProperty(registry,'get',{configurable:true,writable:true,value:function(this:object,...args:unknown[]){const value=Reflect.apply(get,this,args);if(armed&&!inserted){armed=false;inserted=true;Object.setPrototypeOf(registry,deep.head);}return value;}});
 h.onCompare(()=>{if(!inserted)armed=true;});const id=h.f.port.add('seasonality',FULL);
 await vi.waitFor(()=>expect(inserted).toBe(true),{timeout:10000,interval:10});await flushMtf();expect(h.captures).toHaveLength(1);expect(h.captures[0].value).not.toBeNull();expect(deep.traps()).toBe(0);expect(h.f.port.captureReadout!(id).state).toBe('unavailable');expect(h.comparisons.some(row=>row.matched)).toBe(false);
 Object.setPrototypeOf(registry,parent);await flushMtf();expect(h.f.port.captureReadout!(id).state).toBe('unavailable');h.onCompare(null);h.f.port.update(id,{visible:false});h.f.port.update(id,{visible:true});expect(values(h,await ready(h,id))).toEqual([28.125,12.5,0,10]);expect(h.captures).toHaveLength(2);
});

it('stale A after reentrant actual get cannot remove or accept replacement B with the same public id',async()=>{
 const h=await actual(),registry=h.f.core.registry,get=registry.get;let armed=false,replaced=false,a='',b='',oldModel:object|null=null,newModel:object|null=null;
 Object.defineProperty(registry,'get',{configurable:true,writable:true,value:function(this:object,...args:unknown[]){const value=Reflect.apply(get,this,args) as {native:{instance:object}};if(armed&&!replaced){armed=false;replaced=true;oldModel=value.native.instance;h.f.port.remove(a);b=h.f.port.add('seasonality',FULL,{id:a});const row=h.f.port.list().find(row=>row.id===b)!;newModel=h.f.records.get(row.rendererId).native.instance;}return value;}});
 h.onCompare(()=>{if(!replaced)armed=true;});a=h.f.port.add('seasonality',FULL);
 await vi.waitFor(()=>expect(replaced).toBe(true),{timeout:10000,interval:10});await flushMtf();h.onCompare(null);expect(b).toBe(a);expect(newModel).not.toBe(oldModel);expect(h.f.port.list().filter(row=>row.id===b)).toHaveLength(1);const row=h.f.port.list().find(row=>row.id===b)!;expect(h.f.records.get(row.rendererId).native.instance).toBe(newModel);
 h.f.port.update(b,{visible:false});h.f.port.update(b,{visible:true});const current=await ready(h,b);expect(values(h,current)).toEqual([28.125,12.5,0,10]);expect(h.f.records.get(h.f.port.list().find(row=>row.id===b)!.rendererId).native.instance).toBe(newModel);current.assertCurrent();
});
