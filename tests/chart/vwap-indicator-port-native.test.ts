import {it,expect} from 'vitest';
import {vwapIndicatorNativeHarness,syntheticVwapRows,drainVwap} from './vwap-indicator-native-harness';
import {acquireIndicatorDisplayPort} from '../../src/chart/indicator-display-source';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {nativeCoreHarness} from './native-core-harness';
import {isAnalysisPublicationFailure} from '../../src/chart/analysis-publication';
import {defaultIndicatorPresentation} from '../../src/chart/indicator-settings';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';

it('v2 starts empty/pending then accepts genuine exact worker values into actual native/domain/display state',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2,source:'close'}),nativeId=h.port.list()[0].rendererId;
  expect(h.native.scene.indicators.get(nativeId).series).toEqual([]);expect(h.port.values(id).series).toEqual([]);expect(()=>h.port.assertVwapReady()).toThrow(/pending/);await h.finish();h.port.assertVwapReady();
  expect(h.port.values(id).series[0].values).toEqual([11,35/3,37/3]);const native=h.native.scene.indicators.get(nativeId);expect(native.series[0].points.map((point:any)=>point.value)).toEqual([11,35/3,37/3]);expect(acquireIndicatorDisplayPort(h.port,h.chart).read()[0].plots[0].value).toBe(37/3);
 }finally{h.dispose();}
});
it('a pending source replacement clears all projections and old callbacks cannot publish',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2});await drainVwap();const old=h.ports[0],waiting=h.port.waitForVwap();const rejected=expect(waiting).rejects.toThrow(/replaced/);h.replace(syntheticVwapRows(2));await rejected;
  expect(h.port.values(id).series).toEqual([]);expect(h.port.list()[0].series).toEqual([]);expect(acquireIndicatorDisplayPort(h.port,h.chart).read()[0].plots).toEqual([]);old.emit({v:1,type:'ready'});await h.finish();expect(h.port.values(id).series[0].values).toHaveLength(2);expect(h.quarantines).toEqual([]);
 }finally{h.dispose();}
});
it('missing volume becomes accepted unavailable and settles readiness without legacy substitution',async()=>{
 const rows=syntheticVwapRows();Reflect.deleteProperty(rows[1],'volume');const h=await vwapIndicatorNativeHarness(rows);try{
  const id=h.port.add('vwap',{kernelVersion:2});await drainVwap();const worker=h.ports[0];try{worker.finish();}catch(error){worker.emit({v:1,type:'error',code:'VWAP_VOLUME',message:(error as Error).message});}await h.port.waitForVwap();h.port.assertVwapReady();expect(h.port.values(id).series).toEqual([]);expect(h.port.values(id).diagnostics.join(' ')).toContain('volume');expect(h.quarantines).toEqual([]);
 }finally{h.dispose();}
});
it('whole native hide cancels pending work and settles; actual show schedules current input',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2}),nativeId=h.port.list()[0].rendererId;h.enableActualVisibility(nativeId);await drainVwap();h.port.update(id,{visible:false});await h.port.waitForVwap();h.port.assertVwapReady();expect(h.port.values(id).series).toEqual([]);expect(h.native.scene.indicators.has(nativeId)).toBe(false);
  h.port.update(id,{visible:true});expect(()=>h.port.assertVwapReady()).toThrow(/pending/);await h.finish();expect(h.native.scene.indicators.get(nativeId).series[0].points).toHaveLength(3);
 }finally{h.dispose();}
});
it('a presentation-only pending edit publishes only the final owned style and tracking endpoint',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2,source:'close'}),nativeId=h.port.list()[0].rendererId;h.port.update(id,{plots:{vwap:{...defaultPlotStyle('vwap','vwap',0),color:'#ff0000',trackPrice:true}}});await h.finish();const native=h.native.scene.indicators.get(nativeId);expect(native.series[0].style.color).toBe('#ff0000');expect(native.priceLines[0].price).toBe(37/3);h.port.assertVwapReady();
 }finally{h.dispose();}
});
it('empty prefix settles explicitly unavailable without starting a worker',async()=>{
 const h=await vwapIndicatorNativeHarness([]);try{const id=h.port.add('vwap',{kernelVersion:2});await h.port.waitForVwap();expect(h.ports).toEqual([]);expect(h.port.values(id).diagnostics[0]).toContain('prefix');}finally{h.dispose();}
});
it('all active percentage pairs, fills, offset and hide-on-daily preserve underlying exact values',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{...VWAP_BAND_DEFAULTS,kernelVersion:2,source:'close',band1Enabled:true,band2Enabled:true,band3Enabled:true}),nativeId=h.port.list()[0].rendererId;await h.finish();let native=h.native.scene.indicators.get(nativeId);expect(h.port.values(id).series).toHaveLength(7);expect(native.fills).toHaveLength(3);expect(native.series).toHaveLength(13);
  const values=h.port.values(id).series[0].values;h.port.update(id,{offset:1,presentation:{...defaultIndicatorPresentation('vwap'),precision:3}});await h.finish();native=h.native.scene.indicators.get(nativeId);expect(native.series[0].points[0].value).toBe(null);expect(h.port.values(id).series[0].values).toEqual(values);
  h.port.update(id,{presentation:{...defaultIndicatorPresentation('vwap'),hideOnDaily:true}});h.setResolution('1D');await h.finish();expect(h.port.values(id).series[0].values).toEqual(values);expect(h.native.scene.indicators.get(nativeId).series).toEqual([]);h.port.assertVwapReady();
 }finally{h.dispose();}
});
it('returned native emission followed by source loss remains accepted without replacement observers/quarantine',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2}),nativeId=h.port.list()[0].rendererId,mount=h.renderer.mountIndicator.bind(h.renderer);let notifications=0;h.port.subscribe(()=>{notifications++;});
  h.renderer.mountIndicator=next=>{const value=mount(next);if(next.series.some(series=>'points' in series&&series.points.length===3))h.retire();return value;};
  let failure:unknown;try{await h.finish();}catch(error){failure=error;}
  expect(isAnalysisPublicationFailure(failure)).toBe(true);expect(h.native.scene.indicators.get(nativeId).series[0].points).toHaveLength(3);expect(h.port.list().map(row=>row.id)).toEqual([id]);expect(notifications).toBe(0);expect(h.quarantines).toEqual([]);expect(()=>h.port.assertVwapReady()).toThrow();
 }finally{h.dispose();}
});
it('observer rejection retains accepted current values and blocks readiness as publication failure',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2});h.port.subscribe(()=>false);let failure:unknown;try{await h.finish();}catch(error){failure=error;}
  expect(isAnalysisPublicationFailure(failure)).toBe(true);expect(h.port.values(id).series[0].values).toHaveLength(3);expect(h.quarantines).toHaveLength(1);expect(()=>h.port.assertVwapReady()).toThrow();
 }finally{h.dispose();}
});
it('version2 without a host rejects before native mutation while omitted/1 legacy remains unchanged',async()=>{
 const h=await nativeCoreHarness(),port=createIndicatorPort(h.chart,undefined,undefined,undefined,h.bridge.claim);try{
  const before=h.records.size;expect(()=>port.add('vwap',{kernelVersion:2})).toThrow(/owned local service/);expect(h.records.size).toBe(before);expect(port.serialize()).toEqual([]);
  const omitted=port.add('vwap'),explicit=port.add('vwap',{kernelVersion:1});expect(Object.hasOwn(port.list().find(row=>row.id===omitted)!.inputs,'kernelVersion')).toBe(false);expect(port.list().find(row=>row.id===explicit)!.inputs.kernelVersion).toBe(1);expect(port.values(omitted).series).toEqual(port.values(explicit).series);await port.waitForVwap();
 }finally{port.dispose();h.dispose();}
});
it('initial returned empty emission source loss retains its accepted registration without starting a worker',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const mount=h.renderer.mountIndicator.bind(h.renderer);h.renderer.mountIndicator=next=>{const value=mount(next);h.retire();return value;};let failure:unknown;try{h.port.add('vwap',{kernelVersion:2});}catch(error){failure=error;}
  expect(isAnalysisPublicationFailure(failure)).toBe(true);expect(h.port.list()).toHaveLength(1);expect(h.ports).toEqual([]);expect(h.quarantines).toEqual([]);expect(h.native.scene.indicators.has(h.port.list()[0].rendererId)).toBe(true);
 }finally{h.dispose();}
});
it('native removal cancels its pending job without disposing the application-owned client',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const id=h.port.add('vwap',{kernelVersion:2});await drainVwap();const old=h.ports[0],waiting=h.port.waitForVwap(),rejected=expect(waiting).rejects.toThrow(/replaced/);h.port.remove(id);await rejected;expect(old.terminated).toBe(1);expect(h.port.list()).toEqual([]);await h.port.waitForVwap();
  const second=h.port.add('vwap',{kernelVersion:2});await h.finish();expect(h.port.values(second).series[0].values).toHaveLength(3);
 }finally{h.dispose();}
});
it('invalidation attempts every native instance even when active worker cleanup throws',async()=>{
 const h=await vwapIndicatorNativeHarness();try{
  const first=h.port.add('vwap',{kernelVersion:2}),second=h.port.add('vwap',{kernelVersion:2});await drainVwap();const worker=h.ports[0],terminate=worker.terminate.bind(worker);worker.terminate=()=>{terminate();throw Error('literal worker termination failed');};
  h.retire();expect(()=>h.port.invalidateVwap()).toThrow(/incomplete/);expect(h.port.values(first).series).toEqual([]);expect(h.port.values(second).series).toEqual([]);expect(h.port.list().every(row=>row.series.length===0)).toBe(true);expect(acquireIndicatorDisplayPort(h.port,h.chart).read().every(row=>row.plots.length===0)).toBe(true);for(const row of h.port.list())expect(h.native.scene.indicators.get(row.rendererId).series).toEqual([]);expect(()=>h.port.assertVwapReady()).toThrow();expect(h.quarantines).toEqual([]);
 }finally{h.dispose();}
});
