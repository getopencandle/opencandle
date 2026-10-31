import {afterEach,expect,it,vi} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {createComparisonPort} from '../../src/chart/compare-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {AnalysisPublicationHost} from '../../src/chart/analysis-publication';

// Bug 5 (data-window receipt 20261017T071538366Z console): retiring a chart (the
// switch to two columns replaces the cell's chart) logged "[vela] event handler error for "indicator:removed" Error: Chart
// analysis is unavailable. Reopen the chart before editing." once per removed indicator. The adapter (src/chart/adapter.ts
// disposeChart) marks itself disposed, then disposes the indicator port (which removes its native Volume) BEFORE the
// comparison port; the comparison port's indicator:removed listener opened a publication transaction for an id it does not
// own, and that transaction's assertMutable refused. SYNTHETIC bars on the pinned vela core; not executable UI evidence.
function adapterHost(){
 let unavailable=false;
 const host:AnalysisPublicationHost={captureOwner:()=>({isCurrent:()=>!unavailable,quarantine(){}}),assertMutable(){if(unavailable)throw Error('Chart analysis is unavailable. Reopen the chart before editing.');}};
 return {host,retire(){unavailable=true;}};
}
// The pinned vela emitter (chunk-UNUVPQFW.js:36) catches a listener error and logs it; the core harness emitter rethrows,
// so listeners are wrapped exactly like vela's emit loop.
async function velaCore(){const native=await nativeCoreHarness(),on=(native.chart as any).on;(native.chart as any).on=(name:string,callback:(value:any)=>void)=>on(name,(value:any)=>{try{callback(value);}catch(err){console.error(`[vela] event handler error for "${String(name)}"`,err);}});return native;}
const handlerErrors=(spy:{mock:{calls:unknown[][]}})=>spy.mock.calls.map((call:unknown[])=>call.map(String).join(' ')).filter((text:string)=>/event handler error/.test(text));
afterEach(()=>{vi.restoreAllMocks();});

it('retiring a chart in the adapter order (indicators, then comparisons) logs no indicator:removed handler error',async()=>{
 const native=await velaCore(),owner=adapterHost(),indicators=createIndicatorPort(native.chart,undefined,undefined,undefined,native.bridge.claim,undefined,owner.host),comparisons=createComparisonPort(native.chart,native.bridge.claim,owner.host);
 const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  indicators.add('volume',{});indicators.add('sma',{length:2});expect(indicators.list()).toHaveLength(2);
  owner.retire();
  indicators.dispose();comparisons.dispose();
  expect(handlerErrors(spy)).toEqual([]);
 }finally{native.dispose();}
});

it('a foreign native removal never opens an indicator publication while the chart is unavailable',async()=>{
 const native=await velaCore(),owner=adapterHost(),indicators=createIndicatorPort(native.chart,undefined,undefined,undefined,native.bridge.claim,undefined,owner.host),comparisons=createComparisonPort(native.chart,native.bridge.claim,owner.host);
 const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  comparisons.add(fixtureDataset('SPY',1));indicators.add('sma',{length:2});
  owner.retire();
  comparisons.dispose();indicators.dispose();
  expect(handlerErrors(spy)).toEqual([]);
 }finally{native.dispose();}
});

it('the guard is kept: a native removal of a comparison the port owns while the chart is unavailable is still refused',async()=>{
 const native=await velaCore(),owner=adapterHost(),comparisons=createComparisonPort(native.chart,native.bridge.claim,owner.host);
 const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  comparisons.add(fixtureDataset('SPY',1));const rendererId=comparisons.list()[0].rendererId;
  owner.retire();
  (native.chart as any).orchestrator.handles.get(rendererId).remove();
  expect(handlerErrors(spy).join('\n')).toMatch(/Chart analysis is unavailable/);
 }finally{try{comparisons.dispose();}catch{/* retired */}native.dispose();}
});

it('BKR-5: the guard is kept: a native removal of an indicator the port owns while the chart is unavailable is still refused',async()=>{
 const native=await velaCore(),owner=adapterHost(),indicators=createIndicatorPort(native.chart,undefined,undefined,undefined,native.bridge.claim,undefined,owner.host);
 const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  indicators.add('volume',{});const owned=[...(native.chart as any).orchestrator.handles.values()].find((handle:any)=>typeof handle.remove==='function');expect(owned,'the native Volume handle the port owns').toBeDefined();
  owner.retire();
  owned.remove();
  expect(handlerErrors(spy).join('\n')).toMatch(/Chart analysis is unavailable/);
 }finally{try{indicators.dispose();}catch{/* retired */}native.dispose();}
});
