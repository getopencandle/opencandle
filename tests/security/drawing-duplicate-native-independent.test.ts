import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {prepareNativeDrawingInsert,type NativeDrawingInsert} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';

// Isolated supported-command lease fault tests. Actual native store/controller
// bodies execute; this does not activate workspace Duplicate or prove recovery.
async function fixture(){
 const native=await nativeDrawingHarness();
 const row=createDrawing('trendline',{id:'SYNTHETIC duplicate original',paneId:'price',zIndex:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
 native.controller.fromJSON({version:1,drawings:[row]});
 const copy:SerializedDrawing={...structuredClone(row),id:'SYNTHETIC independent duplicate',zIndex:2};
 let action=()=>{};
 const host={assertCurrent(){action();},assertWorkspaceCapacity(){}};
 return{native,copy,host,setAction(next:()=>void){action=next;},dispose(){native.dispose();}};
}

it('rechecks observable listener membership after the trusted host callback, including an old unsubscribe closure',async()=>{
 const f=await fixture();let helper:NativeDrawingInsert|undefined;
 const unsubscribe=f.native.controller.store.onChange(()=>{});
 try{
  helper=prepareNativeDrawingInsert({ctrl:f.native.controller},[f.copy],f.host);
  let removed=false;f.setAction(()=>{if(!removed){removed=true;unsubscribe();}});
  expect(()=>helper!.assertCurrent()).toThrow(/listener|retired|changed/i);
  expect(removed).toBe(true);expect(f.native.controller.store.has(f.copy.id)).toBe(false);
  expect(helper.insert().state).toBe('not-forwarded');
 }finally{helper?.dispose();unsubscribe();f.dispose();}
});

it('cleans an attempted method installation that writes its owned wrapper and then throws',async()=>{
 const f=await fixture(),core=f.native.controller as object;
 let attempted:{key:PropertyKey;value:unknown}|undefined;
 const proxy=new Proxy(core,{defineProperty(target,key,descriptor){
  if(!attempted){attempted={key,value:descriptor.value};Reflect.defineProperty(target,key,descriptor);throw Error('SYNTHETIC acquisition wrote then threw');}
  return Reflect.defineProperty(target,key,descriptor);
 }});
 try{
  expect(()=>prepareNativeDrawingInsert({ctrl:proxy},[f.copy],f.host)).toThrow(/acquisition wrote then threw/);
  expect(attempted).toBeDefined();expect(Object.hasOwn(core,attempted!.key)).toBe(false);
  expect(f.native.controller.store.has(f.copy.id)).toBe(false);
 }finally{
  // Fault fixture cleanup is exact-owned even against the intentionally broken
  // installer; never remove a competing method or retain the diagnostic wrapper.
  if(attempted&&Object.getOwnPropertyDescriptor(core,attempted.key)?.value===attempted.value)Reflect.deleteProperty(core,attempted.key);
  f.dispose();
 }
});

it('retains forwarded-incomplete state when a native listener throws an object whose diagnostic descriptor trap throws',async()=>{
 const f=await fixture();let helper:NativeDrawingInsert|undefined;
 const failure=new Proxy({}, {getOwnPropertyDescriptor(){throw Error('SYNTHETIC diagnostic descriptor failure');}});
 const unsubscribe=f.native.controller.store.onChange(()=>{if(f.native.controller.store.has(f.copy.id))throw failure;});
 try{
  helper=prepareNativeDrawingInsert({ctrl:f.native.controller},[f.copy],f.host);
  const outcome=helper.insert();
  expect(outcome.state).toBe('forwarded-incomplete');expect(outcome.canonicalAccepted).toBe(false);
  expect(outcome.attemptedIds).toEqual([f.copy.id]);expect(outcome.cleanupComplete).toBe(true);
  expect(outcome.diagnostics.length).toBeGreaterThan(0);expect(outcome.diagnostics.join(' ').length).toBeLessThanOrEqual(32*901);
  expect(f.native.controller.store.has(f.copy.id)).toBe(true);
  expect(Object.hasOwn(f.native.controller.store,'add')).toBe(false);
 }finally{helper?.dispose();unsubscribe();f.dispose();}
});
