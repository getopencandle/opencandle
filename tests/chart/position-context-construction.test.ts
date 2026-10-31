import {afterEach,expect,it} from 'vitest';
import {cleanupPositionConstructionFixtures,partialPositionConstructor} from '../fixtures/position-context-construction';
afterEach(cleanupPositionConstructionFixtures);
const causes=(error:unknown):unknown[]=>error instanceof AggregateError?error.errors.flatMap(causes):[error];

it('a failed initial subscription array releases the actual registered position context before native destruction',()=>{
 for(const fault of [undefined,null,0,false,'',Error('SYNTHETIC initial subscription failure')]){
  const h=partialPositionConstructor({failOn:2,fault});
  expect(h.failed).toBe(true);expect(h.failure).toBe(fault);expect(h.nativeCalls()).toBe(1);
  expect(h.probe()).toBe(0.01);expect(h.contains()).toBe(0);
  expect(h.positionOffs()).toBe(1);expect(h.trace).toEqual(['position','native']);
 }
});
it('failure before position acquisition creates no context and still preserves a falsy original error',()=>{
 const h=partialPositionConstructor({failOn:1,fault:false});expect(h.failed).toBe(true);expect(h.failure).toBe(false);expect(h.positionOffs()).toBe(0);expect(h.nativeCalls()).toBe(1);expect(h.probe()).toBe(0.01);expect(h.contains()).toBe(0);
});
it('successful construction retains actual context lookup until one retirement across early and registered inventories',()=>{
 const h=partialPositionConstructor();expect(h.failed).toBe(false);expect(h.probe()).toBe(0.5);expect(h.contains()).toBeGreaterThan(0);expect(h.positionOffs()).toBe(0);
 h.chart.destroy();h.chart.destroy();expect(h.positionOffs()).toBe(1);expect(h.nativeCalls()).toBe(1);expect(h.nativeOffs()).toHaveLength(h.subscriptions());expect(h.probe()).toBe(0.01);
});
it('a later fault and throwing position release preserve both causes and attempt every native unsubscribe and destructor',()=>{
 const fault=Error('SYNTHETIC later initialization'),h=partialPositionConstructor({laterFailure:true,fault,cleanupFailure:true,cleanupFault:0});
 expect(h.failed).toBe(true);expect(causes(h.failure)).toEqual([fault,0]);expect(h.positionOffs()).toBe(1);expect(h.nativeOffs()).toHaveLength(h.subscriptions());expect(h.nativeCalls()).toBe(1);expect(h.probe()).toBe(0.01);
});
it('position retirement reentering destruction cannot repeat itself or native destruction',()=>{
 const h=partialPositionConstructor({failOn:2,fault:0,reenter:true});expect(h.failure).toBe(0);expect(h.positionOffs()).toBe(1);expect(h.nativeCalls()).toBe(1);h.chart.destroy();expect(h.positionOffs()).toBe(1);expect(h.nativeCalls()).toBe(1);
});
it('late retirement of failed A cannot clear the replacement context B on the same canvas',()=>{
 const canvas={},a=partialPositionConstructor({canvas,failOn:2,fault:0}),b=partialPositionConstructor({canvas});
 expect(a.failed).toBe(true);expect(b.failed).toBe(false);expect(b.probe()).toBe(0.5);a.chart.destroy();expect(b.probe()).toBe(0.5);expect(b.positionOffs()).toBe(0);b.chart.destroy();expect(b.positionOffs()).toBe(1);expect(b.probe()).toBe(0.01);
});
