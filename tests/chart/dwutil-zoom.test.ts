import {describe,expect,it,vi} from 'vitest';
import {createZoomStack,regionToRange,createZoomController,createZoomGesture} from '../../src/chart/drawing-zoom';
describe(' zoom (DD-2, DD-3)',()=>{
 it('region to range orders the span and cancels when narrower than one bar',()=>{
  expect(regionToRange(100,200,60)).toEqual({from:100,to:200});expect(regionToRange(200,100,60)).toEqual({from:100,to:200});
  expect(regionToRange(100,159,60)).toBeNull();expect(regionToRange(100,160,60)).toEqual({from:100,to:160});expect(regionToRange(100,100,60)).toBeNull();
  expect(regionToRange(NaN,5,1)).toBeNull();expect(regionToRange(1,2,0)).toBeNull();
 });
 it('stack push/pop and can-zoom-out',()=>{
  const s=createZoomStack();expect(s.canZoomOut()).toBe(false);expect(s.pop()).toBeNull();
  s.push({from:1,to:2});s.push({from:3,to:4});expect(s.canZoomOut()).toBe(true);expect(s.depth()).toBe(2);expect(s.pop()).toEqual({from:3,to:4});expect(s.pop()).toEqual({from:1,to:2});expect(s.canZoomOut()).toBe(false);
  s.push({from:1,to:2});s.clear();expect(s.canZoomOut()).toBe(false);
 });
 it('controller: commit sets range, pushes previous; zoom out restores; context change clears',()=>{
  let range={from:0,to:1000};const set=vi.fn((r:{from:number;to:number})=>{range=r;});
  const c=createZoomController({getRange:()=>range,setRange:set,barInterval:()=>60});
  expect(c.commit(100,100)).toBe(false);expect(set).not.toHaveBeenCalled();expect(c.canZoomOut()).toBe(false);
  expect(c.commit(200,400)).toBe(true);expect(range).toEqual({from:200,to:400});expect(c.canZoomOut()).toBe(true);
  expect(c.zoomOut()).toBe(true);expect(range).toEqual({from:0,to:1000});expect(c.canZoomOut()).toBe(false);expect(c.zoomOut()).toBe(false);
  c.commit(200,400);c.observeContext('AAPL|D|l1');expect(c.canZoomOut()).toBe(false);
  c.commit(200,400);c.observeContext('AAPL|D|l1');expect(c.canZoomOut()).toBe(true);
  c.observeContext('AAPL|1h|l1');expect(c.canZoomOut()).toBe(false);
  c.commit(200,400);c.observeContext('MSFT|1h|l1');expect(c.canZoomOut()).toBe(false);c.commit(200,400);c.observeContext('MSFT|1h|l2');expect(c.canZoomOut()).toBe(false);
 });
 it('controller: unavailable range refuses without change',()=>{const c=createZoomController({getRange:()=>null,setRange:vi.fn(),barInterval:()=>60});expect(c.commit(0,500)).toBe(false);expect(c.canZoomOut()).toBe(false);});
 it('gesture: press drag release commits once and disarms; Escape cancels',()=>{
  const onRange=vi.fn(),onCancel=vi.fn(),g=createZoomGesture({timeAt:x=>x*10,barInterval:()=>60,onRange,onCancel});
  g.down(5);g.move(20);g.up(30);expect(onRange).toHaveBeenCalledWith(50,300);expect(onCancel).not.toHaveBeenCalled();
  g.up(40);expect(onRange).toHaveBeenCalledTimes(1);
  g.down(5);g.escape();g.up(50);expect(onRange).toHaveBeenCalledTimes(1);expect(onCancel).toHaveBeenCalledTimes(1);
  g.down(5);g.up(6);expect(onRange).toHaveBeenCalledTimes(1);expect(onCancel).toHaveBeenCalledTimes(2);
  const un=createZoomGesture({timeAt:()=>null,barInterval:()=>60,onRange,onCancel});un.down(1);un.up(9);expect(onRange).toHaveBeenCalledTimes(1);
  expect(g.span()).toBeNull();g.down(3);g.move(9);expect(g.span()).toEqual({from:3,to:9});
 });
});
