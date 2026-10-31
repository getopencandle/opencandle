import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {fibBaselineHarness,fibBaselineRecord} from '../chart/fib-trend-line-painter-harness';

it('does not adopt rows returned by a replaced all method as genuine canonical baseline authority',async()=>{
 const f=await fibBaselineHarness(),originalAll=Object.getOwnPropertyDescriptor(f.document,'all');
 const truth=()=>Reflect.apply(LosslessDrawingDocument.prototype.all,f.document,[]);
 try{
  const native=fibBaselineRecord();f.sync([native]);
  const addedBaseline=()=>f.top.commands.filter(value=>value.op==='lineTo'&&value.values[0]===400&&value.values[1]===100.00000000000001);
  expect(addedBaseline()).not.toEqual([]);
  const committed=structuredClone(native);(committed.props!.lvFibTrendLine as {enabled:boolean}).enabled=false;
  f.document.load({version:1,drawings:[committed]});
  expect(((truth()[0].props as Record<string,unknown>).lvFibTrendLine as {enabled:boolean}).enabled).toBe(false);
  expect((f.controller.drawings[0].serialize().props!.lvFibTrendLine as {enabled:boolean}).enabled).toBe(true);
  Object.defineProperty(f.document,'all',{configurable:true,enumerable:true,writable:true,value:()=>[structuredClone(native)]});
  // The genuine record still differs from native, so the Fib is withheld (no LV baseline) instead of quarantining.
  f.top.commands.length=0;expect(()=>f.render()).not.toThrow();expect(JSON.stringify(f.baseline.diagnostics())).toContain('differs from its canonical record');
  expect(((truth()[0].props as Record<string,unknown>).lvFibTrendLine as {enabled:boolean}).enabled).toBe(false);
  expect(addedBaseline()).toEqual([]);
 }finally{if(originalAll)Object.defineProperty(f.document,'all',originalAll);else Reflect.deleteProperty(f.document,'all');f.cleanup();}
});
