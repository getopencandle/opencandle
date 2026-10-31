import {expect,it} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from '../chart/fib-trend-line-painter-harness';

it('does not let an own anchor-array map manufacture a different baseline than later native serialization',async()=>{
 const f=await fibBaselineHarness();try{
  const row=fibBaselineRecord();f.sync([row]);
  expect(f.top.commands.some(value=>value.op==='lineTo'&&value.values[0]===400&&value.values[1]===100.00000000000001)).toBe(true);
  const model=f.controller.drawings[0],anchors=structuredClone(row.anchors);let calls=0;
  Object.defineProperty(anchors,'map',{configurable:true,writable:true,value:function(callback:Function,thisArg:unknown){
   calls++;
   if(calls===1)return[{time:1000000,price:250},{time:1240000,price:250}];
   return Reflect.apply(Array.prototype.map,this,[callback,thisArg]);
  }});
  model.applySettings({anchors});expect(model.anchors).toBe(anchors);
  expect([anchors[0],anchors[1]]).toStrictEqual(row.anchors);
  f.top.commands.length=0;let error:unknown;try{f.render();}catch(cause){error=cause;}
  // The forged first copy is a horizontal250-price baseline (y50), while
  // canonical data and every later serialization retain the original anchors.
  let forged=false,forgedStrokes=0;for(const value of f.top.commands){if(value.op==='beginPath')forged=false;if(value.op==='lineTo'&&value.values[0]===400&&value.values[1]===49.999999999999986)forged=true;if(value.op==='stroke'&&forged)forgedStrokes++;}
  expect(forgedStrokes).toBe(0);
  expect(f.top.commands.filter(value=>value.op==='lineTo'&&value.values[0]===400&&value.values[1]===49.999999999999986)).toHaveLength(0);
  expect(calls).toBe(0);
  if(error)expect(error).toBeInstanceOf(Error);
 }finally{f.cleanup();}
});
