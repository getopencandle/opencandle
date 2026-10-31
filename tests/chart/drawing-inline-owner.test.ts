import {expect,it} from 'vitest';
import {captureInlineDrawingOwner} from '../../src/chart/drawing-inline-owner';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

it('inline ownership uses constant-time identity and epoch checks after its initial native comparison',async()=>{
 const f=await templateAdapterHarness();try{
  const id=f.rows[0].id,model=f.native.controller.store.get(id),serialize=model.serialize;let calls=0;model.serialize=function(){calls++;return serialize.call(this);};
  const assertCurrent=captureInlineDrawingOwner(f.document,{ctrl:f.native.controller},id,f.projection()[0],()=>{}),initial=calls;for(let i=0;i<100;i++)assertCurrent();expect(calls).toBe(initial);expect(f.document.undo()).toBe(false);
  f.edit(id,{'style.lineWidth':4});expect(assertCurrent).toThrow();
 }finally{f.native.dispose();}
});
it.each(['canonical equal load','native equal load','source'] as const)('inline owner permanently retires after %s',async change=>{
 const f=await templateAdapterHarness();try{
  let source=true;const id=f.rows[0].id,assertCurrent=captureInlineDrawingOwner(f.document,{ctrl:f.native.controller},id,f.projection()[0],()=>{if(!source)throw Error('SYNTHETIC source replaced');});
  if(change==='canonical equal load')f.document.load(f.document.serialize());else if(change==='native equal load')f.native.controller.fromJSON(f.document.serialize());else source=false;expect(assertCurrent).toThrow();source=true;expect(assertCurrent).toThrow();
 }finally{f.native.dispose();}
});
it('new projected values during native sync cannot borrow the old canonical record before its edited event',async()=>{
 const f=await templateAdapterHarness();try{
  const id=f.rows[0].id,sync=f.native.controller.port.syncDrawings;let captured=0;f.native.controller.port.syncDrawings=(rows:any)=>{sync(rows);if(rows[0].style.lineWidth===4){captured++;expect(()=>captureInlineDrawingOwner(f.document,{ctrl:f.native.controller},id,f.projection()[0],()=>{})).toThrow(/canonical/);}};
  f.native.controller.updateMany([{id,patch:{style:{lineWidth:4}}}]);expect(captured).toBeGreaterThan(0);expect((f.document.all()[0].style as any).lineWidth).toBe(4);
 }finally{f.native.dispose();}
});
it('ownership acquisition rejects a serializer that replaces the canonical document',async()=>{
 const f=await templateAdapterHarness();try{
  const id=f.rows[0].id,model=f.native.controller.store.get(id),serialize=model.serialize,projected=f.projection()[0];model.serialize=function(){const result=serialize.call(this);f.document.load(f.document.serialize());return result;};
  expect(()=>captureInlineDrawingOwner(f.document,{ctrl:f.native.controller},id,projected,()=>{})).toThrow();
 }finally{f.native.dispose();}
});
