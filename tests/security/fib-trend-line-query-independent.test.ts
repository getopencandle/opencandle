import {expect,it} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from '../chart/fib-trend-line-painter-harness';

it.each([true,false])('does not adopt live moving anchors mutated by an original-level projector callback (baseline enabled=%s)',async enabled=>{
 const f=await fibBaselineHarness();let prototype:object|undefined,descriptor:PropertyDescriptor|undefined;
 try{
  const row=fibBaselineRecord();(row.props!.lvFibTrendLine as {enabled:boolean}).enabled=enabled;
  f.sync([row]);
  // The disabled control starts the same native body gesture through a normal
  // level, because the new diagonal is unavailable there.
  f.interaction.down(300,enabled?150:123.6,'off',false,false);f.interaction.move(320,enabled?170:143.6);
  expect(f.interaction.state.kind).toBe('pressed');expect(f.interaction.state.moved).toBe(true);
  const model=f.controller.drawings[0],before=structuredClone(model.anchors);
  // The native projector's xOf reaches logicalToX on every path: directly for an anchor inside a loaded bar's period (the
  // dragged anchors here, the first in bar 0 and the second inside the latest bar), through timeToX otherwise.
  prototype=Object.getPrototypeOf(f.coords);descriptor=Object.getOwnPropertyDescriptor(prototype!,'logicalToX');
  if(!descriptor||typeof descriptor.value!=='function')throw Error('SYNTHETIC original native logicalToX missing');
  const original=descriptor.value;let calls=0,mutated=false;
  Object.defineProperty(prototype!,'logicalToX',{...descriptor,value:function(...args:unknown[]){
   const result=Reflect.apply(original,this,args);calls++;if(!mutated){mutated=true;for(const anchor of model.anchors)anchor.price+=100;}return result;
  }});
  let result:unknown,error:unknown;try{result=f.interaction.hitAt(320,70);}catch(cause){error=cause;}
  expect(calls).toBeGreaterThan(0);expect(mutated).toBe(true);
  expect(model.anchors.map((anchor:any)=>anchor.price)).toEqual(before.map((anchor:any)=>anchor.price+100));
  // Native level values are outside this midpoint. No baseline from anchors
  // changed during this same query may become an accepted hit.
  expect(result==null).toBe(true);
  if(error)expect(error).toBeInstanceOf(Error);
 }finally{if(prototype&&descriptor)Object.defineProperty(prototype,'logicalToX',descriptor);f.cleanup();}
});
