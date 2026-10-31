import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {timeToClientX} from '../../src/chart/time-to-x';
// The controller's time-to-x for placing the drawing edit
// bar near a drawing. Drives the pinned renderer's real CoordinateSystem. SYNTHETIC daily bars; no DOM or GUI claim.
const DAY=86400;
function coords(){const r=new NativeRenderer() as any;r.coords.setSize(800,500,1);r.coords.setBars(Array.from({length:100},(_,i)=>(1704067200+i*DAY)*1000));r.coords.setViewport({barSpacing:8,rightOffset:0});return r.coords;}
describe('timeToClientX',()=>{
 it('maps a bar time to the renderer x of that bar, offset by the chart left edge',()=>{
  const c=coords(),last=1704067200+99*DAY;
  expect(timeToClientX(c,40,last,true)).toBeCloseTo(40+c.logicalToX(99),9);
  expect(timeToClientX(c,40,last-DAY,true)!-timeToClientX(c,40,last,true)!).toBeCloseTo(-8,9);
 });
 it('extends along the bar cadence past the last bar (future anchors)',()=>{
  const c=coords(),last=1704067200+99*DAY;
  expect(timeToClientX(c,0,last+3*DAY,true)!-timeToClientX(c,0,last,true)!).toBeCloseTo(24,9);
 });
 it('is null without geometry, bars, a finite time, or a time axis',()=>{
  const c=coords();
  expect(timeToClientX(null,0,1704067200,true)).toBeNull();
  expect(timeToClientX({barCount:0,timeToLogical:()=>0,logicalToX:()=>0},0,1704067200,true)).toBeNull();
  expect(timeToClientX(c,0,Number.NaN,true)).toBeNull();
  expect(timeToClientX(c,0,1704067200,false)).toBeNull();
 });
 it('the chart controller exposes timeToX beside pricePaneProjection',()=>{
  const source=readFileSync('src/chart/adapter.ts','utf8');
  expect(source).toMatch(/timeToX:\(time:number\):number\|null=>\{/);
  // added a `timeToX:` key inside exportChartImage's overlay frame, earlier in the file, so
  // the order check pins the controller member itself.
  expect(source.search(/timeToX:\(time:number\):number\|null=>\{/)).toBeGreaterThan(source.indexOf('pricePaneProjection:'));
 });
});
