import {createFrameFingerprintCalculator} from '../../src/ui/frame-fingerprints';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {afterEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {ownedAnalysisUndoPipelineFixture} from '../fixtures/seasonality-analysis-undo-pipeline';
import {publishedSource,flushMtf,type Request} from '../fixtures/qualified-nyse-mtf-source';
import * as clone from '../../src/chart/profile-input-clone';
import * as builtin from '../../src/chart/builtin-presentation-proof';
import * as provider from '../../src/domain/alpaca-live';

const requireActual=createRequire(path.join(process.cwd(),'electron/alpaca-stub.cjs'));
const {AlpacaMarketData}=requireActual('./public-alpaca.cjs'),{alpacaStubTransport}=requireActual('./alpaca-stub.cjs');
const NOW=Date.parse('2026-10-20T16:00:00Z')/1000;
const FULL={startYear:2016,endYear:2026,meanRow:true,deviationRow:true,positiveFrequencyRow:true,projectionGeometry:true};
type NativeFixture=Awaited<ReturnType<typeof ownedAnalysisUndoPipelineFixture>>;
type Reservation=NonNullable<ReturnType<builtin.BuiltinPresentationControl['reserveSource']>>;
const closes:Array<()=>Promise<void>>=[];
afterEach(async()=>{const errors:unknown[]=[];for(const close of closes.splice(0).reverse())try{await close();}catch(error){errors.push(error);}vi.restoreAllMocks();vi.unstubAllGlobals();if(errors.length)throw new AggregateError(errors,'SYNTHETIC actual native-pipeline cleanup failed.');});

async function actual(held=false){
 let now=NOW,releaseD!:()=>void,started!:(request:Request)=>void,hold=held,disposed=false;
 const gate=new Promise<void>(resolve=>{releaseD=resolve;}),firstD=new Promise<Request>(resolve=>{started=resolve;}),replies=new Set<Promise<unknown>>();
 const requests:Array<{timeframe:string;rows:number}>=[],comparisons:Array<{rows:number;matched:boolean}>=[],reservations:Reservation[]=[],groups:provider.AlpacaSeasonalityPreparationGroup[]=[];
 let p:Awaited<ReturnType<typeof publishedSource>>|undefined,f:NativeFixture|undefined,market:InstanceType<typeof AlpacaMarketData>|undefined;
 const dispose=async()=>{if(disposed)return;disposed=true;releaseD();const errors:unknown[]=[];for(const close of [()=>f?.dispose(),()=>p?.dispose(),()=>market?.close()])try{close();}catch(error){errors.push(error);}await Promise.allSettled([...replies]);await flushMtf();if(errors.length)throw new AggregateError(errors,'Actual local CJS/native pipeline did not close.');};closes.push(dispose);
 const external=()=>{throw Error('No external network/socket in SYNTHETIC actual native-pipeline exercise.');};vi.stubGlobal('fetch',external);vi.stubGlobal('WebSocket',external);
 const transport=alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular',LV_ALPACA_SCENARIO:'nyse-seasonality-v1'},packaged:false,profile:path.join(os.tmpdir(),'lv-synthetic-native-pipeline'),tmpdir:os.tmpdir(),elapsedNow:()=>(now-NOW)*1000});expect(transport.mode).toBe('synthetic');
 market=new AlpacaMarketData({keys:transport.keys,fetchImpl:transport.fetch,WebSocketImpl:transport.WebSocket,marketNow:()=>now*1000,restMinIntervalMs:0,restTimeoutMs:30000,emit:()=>{}});
 // Forwarding observation ONLY. Full comparator invocation and all row work
 // remain inside the actual admitted closed source calculation.
 const originalCompare=clone.seasonalityLiveNativeInputMatches;vi.spyOn(clone,'seasonalityLiveNativeInputMatches').mockImplementation((...args:Parameters<typeof originalCompare>)=>{const matched=originalCompare(...args);comparisons.push({rows:args[2],matched});return matched;});
 const originalPort=builtin.createBuiltinPresentationPort,observePort:typeof originalPort=(chart,publication,bars,build)=>originalPort(chart,publication,bars,control=>{const reserve=control.reserveSource.bind(control);vi.spyOn(control,'reserveSource').mockImplementation((...args:Parameters<typeof reserve>)=>{const result=reserve(...args);if(result&&args[3].operations>15000000)reservations.push(result);return result;});return build(control);});vi.spyOn(builtin,'createBuiltinPresentationPort').mockImplementation(observePort);
 const originalGroup=provider.createAlpacaSeasonalityPreparationGroup;vi.spyOn(provider,'createAlpacaSeasonalityPreparationGroup').mockImplementation((...args:Parameters<typeof originalGroup>)=>{const result=originalGroup(...args);groups.push(result);return result;});
 const actualMarket=market;
 p=await publishedSource({resolution:'1m',now,plan:'free',reply:sent=>{const pending=(async()=>{const stop=sent.timeframe==='1Day'&&hold;if(stop){hold=false;started(sent);}const result=await actualMarket.bars(sent);if(result.ok)requests.push({timeframe:sent.timeframe,rows:result.value.bars.length});if(stop)await gate;return result;})();replies.add(pending);void pending.then(()=>replies.delete(pending),()=>replies.delete(pending));return pending;}});
 const producer=p;await vi.waitFor(()=>{expect(producer.raw().bars).toHaveLength(300);expect(producer.raw().provenance.state).not.toBe('loading');},{timeout:5000,interval:10});f=await ownedAnalysisUndoPipelineFixture({dataset:producer.raw()});
 const fixture=f,initialRaw=fixture.raw();
 async function tick(){now=NOW+1;producer.setNow(now);producer.emit({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'GME',time:now,price:28.125,high:28.125,low:28.125,size:1}],receivedAt:''});await flushMtf();expect(producer.raw().bars).toHaveLength(301);return fixture.accept(producer.raw());}
 function facts(){const basis=fixture.host.capture(),frame=basis?fixture.host.accepted(basis.basis,true):null;return{routes:{...fixture.routes},rawIdentityPreserved:fixture.raw()===initialRaw,rawRows:fixture.raw().length,basisRows:basis?.rows??null,basisPhase:basis?.phase??null,nativeRows:frame?.native.length??null,nativeTimes:frame?.nativeTimes?.length??null,comparisons:[...comparisons],requests:[...requests],reservations:reservations.length,groups:groups.length,paid:provider.alpacaSeasonalityDailyUsage(producer.provider)};}
 return{f:fixture,p:producer,firstD,releaseD,tick,facts,comparisons,reservations,groups,dispose};
}
async function ready(h:Awaited<ReturnType<typeof actual>>,id:string){let result=h.f.port.captureReadout!(id);await vi.waitFor(()=>{result=h.f.port.captureReadout!(id);expect(result.state,JSON.stringify({pipeline:h.facts(),study:h.f.port.list().find(row=>row.id===id)})).toBe('ready');},{timeout:10000,interval:20});if(result.state!=='ready')throw Error('Actual native pipeline has no accepted readout.');return result;}
function values(h:Awaited<ReturnType<typeof actual>>,result:Awaited<ReturnType<typeof ready>>){return result.readAt(h.f.raw().at(-1)!.time).plots.map(row=>row.value);}

it('actual full-history C Undo restores owned pane geometry through the original async native and analysis lease',async()=>{
 const h=await actual();expect((await h.f.accept(h.p.raw())).accepted).toBe(true);const id=h.f.port.add('seasonality',FULL);expect(values(h,await ready(h,id))).toEqual([28.125,12.5,0,10]);expect((await h.tick()).accepted).toBe(true);expect(values(h,await ready(h,id))).toEqual([28.125,12.5,0,10]);
 const calculate=createFrameFingerprintCalculator(),fingerprints=async()=>{const workspace=createInitialWorkspace(),cell=workspace.grid!.cells[workspace.grid!.layout.activeCellId];cell.indicators=h.f.port.serialize();cell.scriptBindings=[];cell.comparisons=[];return calculate(cell,[h.p.raw()]);};
 const beforeFingerprints=await fingerprints(),before=h.f.snapshot(beforeFingerprints);
 h.f.port.update(id,{visible:true,inputs:{tableWidth:60,projectionGeometry:false}});expect(values(h,await ready(h,id))).toEqual([28.125,12.5,0,10]);expect(h.f.port.serialize().find(row=>row.id===id)!.inputs).toMatchObject({tableWidth:60,projectionGeometry:false});
 let failure:unknown;try{const lease=await h.f.prepareUndo(before,beforeFingerprints);expect(lease.isCurrent()).toBe(true);lease.commit();lease.seal();}catch(error){failure=error;}
 const details=(error:unknown,depth=0):unknown=>error instanceof AggregateError&&depth<4?{message:error.message,errors:error.errors.slice(0,8).map(value=>details(value,depth+1))}:String(error);
 expect(failure,JSON.stringify({error:failure?details(failure):null,events:h.f.undoEvents,pipeline:h.facts(),studies:h.f.port.list()})).toBeUndefined();
 expect(h.f.port.serialize().find(row=>row.id===id)!.inputs).toMatchObject({tableWidth:100,projectionGeometry:true});expect(values(h,await ready(h,id))).toEqual([28.125,12.5,0,10]);
});
