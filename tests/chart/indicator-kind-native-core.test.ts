import {expect,it} from 'vitest';
import {nativeCoreHarness} from './native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {DOMAIN_INDICATORS,indicatorPlotIds} from '../../src/chart/indicator-settings';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';

// L1 lane evidence: the real indicator port against the ORIGINAL pinned Vela core/renderer functions
// (tests/chart/native-core-harness.ts). Checks native ownership for MULTIPLE_INSTANCES, HIDE, REMOVE
// and the per-plot tracking line (PRICE_LINE). Not a DOM chart, packaged GUI or reference comparison.
const rows=Array.from({length:60},(_,i)=>{const close=50+5*Math.sin(i/3)+(i%4);return {time:1700000000000+i*60000,open:close-0.5,high:close+1+(i%3)*0.2,low:close-1-(i%2)*0.3,close,volume:100+(i*13)%50};});
const points=(model:any)=>structuredClone(model.series.map((series:any)=>series.points.map((point:any)=>point.value)));
const tracking=(model:any)=>(model?.priceLines??[]).filter((line:any)=>line.id.includes('track:'));

it.each([...DOMAIN_INDICATORS])('actual pinned core: two %s instances own separate scene models; tracking, hide/show and remove stay instance-owned',async kind=>{
 const t=await nativeCoreHarness(),port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim);
 try{
  t.core.bars=rows;const factory=factoryIndicatorDefault(kind),a=port.add(kind,factory.inputs,factory),b=port.add(kind,factory.inputs,factory);
  const [ra,rb]=port.list().map(row=>row.rendererId),scene=t.native.scene.indicators,ma=scene.get(ra),mb=scene.get(rb);
  expect(ra).not.toBe(rb);expect(ma).toBeTruthy();expect(mb).toBeTruthy();expect(ma).not.toBe(mb);
  const ids=(model:any)=>model.series.map((series:any)=>series.id);expect(ids(ma).length).toBeGreaterThan(0);expect(ids(ma).some((id:string)=>ids(mb).includes(id))).toBe(false);
  const beforeA=points(ma),beforeB=points(mb),plot=indicatorPlotIds[kind][0];
  port.update(a,{plots:{[plot]:{...port.list()[0].plots[plot],trackPrice:true}}});const endpoint=port.values(a).series.find(series=>series.id===plot)!.values.at(-1);
  expect(tracking(scene.get(ra))).toEqual([expect.objectContaining({price:endpoint})]);expect(tracking(scene.get(rb))).toEqual([]);
  expect(points(scene.get(ra))).toEqual(beforeA);
  // The harness's setVisible(true) does not model the core's re-mount on show, so Show is covered by
  // tests/ui/indicator-kind-lifecycle.test.ts; here only Hide is checked against the actual renderer.
  port.update(a,{visible:false});expect(scene.has(ra)).toBe(false);expect(t.records.get(ra).hidden).toBe(true);expect(points(scene.get(rb))).toEqual(beforeB);expect(port.list().map(row=>row.visible)).toEqual([false,true]);
  port.remove(a);expect(scene.has(ra)).toBe(false);expect(t.records.has(ra)).toBe(false);expect(port.list().map(row=>row.id)).toEqual([b]);expect(points(scene.get(rb))).toEqual(beforeB);
 }finally{port.dispose();t.dispose();}
});
