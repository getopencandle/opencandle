import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {prepareNativeDrawingInsert} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from './drawing-native-harness';

async function fixture(armed=false){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 const row=createDrawing('trendline',{id:'SYNTHETIC provider original',paneId:'price',zIndex:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
 document.load({version:1,drawings:[row]});native.controller.fromJSON({version:1,drawings:[row]});
 const originals=document.all(),copies=originals.map(value=>({...structuredClone(value),id:'SYNTHETIC provider copy',zIndex:2}));
 const canonical=document.prepareOwnedInsertBatch(originals,copies);let canonicalOwner=()=>canonical.assertCurrent(),action=()=>{},calls=0;
 const helper=prepareNativeDrawingInsert({ctrl:native.controller},copies.map(value=>deserializeDrawing(value as unknown as SerializedDrawing)!.serialize()),{assertCurrent(){calls++;action();canonicalOwner();},assertWorkspaceCapacity(){}});
 let assert=()=>helper.assertCurrent();
 if(armed){canonical.stage();expect(helper.insert().state).toBe('complete');const accepted=canonical.accept();canonicalOwner=()=>accepted.assertCurrent();const receipt=helper.captureAcceptedValueOwner();helper.dispose();assert=()=>receipt.assertCurrent();}
 return{native,document,helper,assert,calls:()=>calls,onHost(callback:()=>void){action=callback;calls=0;},dispose(){action=()=>{};helper.dispose();native.dispose();}};
}

it.each(['active','armed'] as const)('retains every provider descriptor/path check for an %s proof',async mode=>{
 // Fresh actual native owner for each mutation; never carry retired authority
 // or altered native prototype descriptors into another case.
 for(const fault of ['delete','extra','getter','value','flags','provider-parent','receiver-prototype'] as const){
  const f=await fixture(mode==='armed'),history=f.native.controller.history,provider=Object.getPrototypeOf(history),key='abort',descriptor=Object.getOwnPropertyDescriptor(provider,key)!,parent=Object.getPrototypeOf(provider);let reads=0;
  const restore=()=>{if(fault==='extra')Reflect.deleteProperty(provider,'SYNTHETIC extra provider method');else if(fault==='provider-parent')Object.setPrototypeOf(provider,parent);else if(fault==='receiver-prototype')Object.setPrototypeOf(history,provider);else Object.defineProperty(provider,key,descriptor);};
  try{
   if(fault==='delete')Reflect.deleteProperty(provider,key);
   else if(fault==='extra')Object.defineProperty(provider,'SYNTHETIC extra provider method',{configurable:true,value(){}});
   else if(fault==='getter')Object.defineProperty(provider,key,{configurable:true,get(){reads++;throw Error('SYNTHETIC getter must not execute');}});
   else if(fault==='value')Object.defineProperty(provider,key,{...descriptor,value(){}});
   else if(fault==='flags')Object.defineProperty(provider,key,{...descriptor,enumerable:!descriptor.enumerable});
   else if(fault==='provider-parent')Object.setPrototypeOf(provider,{});
   else Object.setPrototypeOf(history,Object.create(provider));
   expect(f.assert,fault).toThrow(/changed|retired/);expect(reads).toBe(0);restore();expect(f.assert,fault+' cannot revive').toThrow(/retired/);
  }finally{restore();f.dispose();}
 }
});

it.each(['active','armed'] as const)('checks each %s receiver own wrapper or restored absence after the provider manifest',async mode=>{
 const f=await fixture(mode==='armed'),core=f.native.controller,prior=Object.getOwnPropertyDescriptor(core,'onIntent');
 try{
  Object.defineProperty(core,'onIntent',{configurable:true,writable:true,value(){}});
  expect(f.assert).toThrow(/wrapper|changed/);
  if(prior)Object.defineProperty(core,'onIntent',prior);else Reflect.deleteProperty(core,'onIntent');
  expect(f.assert).toThrow(/retired/);
 }finally{if(prior)Object.defineProperty(core,'onIntent',prior);else Reflect.deleteProperty(core,'onIntent');f.dispose();}
});

it('keeps exact N+2 host order and rejects a final-host provider replacement through the complete private tail',async()=>{
 const f=await fixture(true),provider=Object.getPrototypeOf(f.native.controller.history),before=Object.getOwnPropertyDescriptor(provider,'abort')!;
 try{
  f.onHost(()=>{});f.assert();expect(f.calls()).toBe(4);
  f.onHost(()=>{if(f.calls()===4)Object.defineProperty(provider,'abort',{...before,value(){}});});
  expect(f.assert).toThrow(/descriptor|changed|retired/);expect(f.calls()).toBe(4);
  Object.defineProperty(provider,'abort',before);expect(f.assert).toThrow(/retired/);
 }finally{Object.defineProperty(provider,'abort',before);f.dispose();}
});

it('falls back to the original descriptor path when the reflection provider is replaced',async()=>{
 const f=await fixture(true),provider=Object.getPrototypeOf(f.native.controller.history),original=Object.getOwnPropertyDescriptor(Object,'getOwnPropertyDescriptor')!,get=original.value as typeof Object.getOwnPropertyDescriptor;let abortReads=0,error:unknown;
 try{
  Object.defineProperty(Object,'getOwnPropertyDescriptor',{...original,value(owner:object,key:PropertyKey){if(owner===provider&&key==='abort')abortReads++;return get(owner,key);}});
  try{f.assert();}catch(cause){error=cause;}
 }finally{Object.defineProperty(Object,'getOwnPropertyDescriptor',original);}
 try{expect(error).toBeUndefined();expect(abortReads).toBeGreaterThanOrEqual(2);f.assert();}finally{f.dispose();}
});

it('preserves delegated Map iterator fallback rather than silently skipping the old iteration boundary',async()=>{
 const f=await fixture(true),iterator=Object.getPrototypeOf(new Map()[Symbol.iterator]()),original=Object.getOwnPropertyDescriptor(iterator,'next')!,next=original.value as (this:unknown)=>unknown;let calls=0,error:unknown;
 try{
  Object.defineProperty(iterator,'next',{...original,value(this:unknown){calls++;return next.call(this);}});
  try{f.assert();}catch(cause){error=cause;}
 }finally{Object.defineProperty(iterator,'next',original);}
 try{expect(error).toBeUndefined();expect(calls).toBeGreaterThan(0);f.assert();}finally{f.dispose();}
});
