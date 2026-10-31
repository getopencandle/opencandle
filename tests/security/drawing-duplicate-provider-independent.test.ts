import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {prepareNativeDrawingInsert} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';

async function fixture(){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 const row=createDrawing('trendline',{id:'SYNTHETIC provider original',paneId:'price',zIndex:1,anchors:[{time:1000000,price:10},{time:1240000,price:20}]})!.serialize();
 document.load({version:1,drawings:[row]});native.controller.fromJSON({version:1,drawings:[row]});
 const originals=document.all(),copies=originals.map(value=>({...structuredClone(value),id:'SYNTHETIC provider copy',zIndex:2}));
 const canonical=document.prepareOwnedInsertBatch(originals,copies);let assertCanonical=()=>canonical.assertCurrent();
 const helper=prepareNativeDrawingInsert({ctrl:native.controller},copies.map(value=>deserializeDrawing(value as unknown as SerializedDrawing)!.serialize()),{assertCurrent(){assertCanonical();},assertWorkspaceCapacity(){}});
 canonical.stage();expect(helper.insert().state).toBe('complete');const accepted=canonical.accept();assertCanonical=()=>accepted.assertCurrent();
 const receipt=helper.captureAcceptedValueOwner();helper.dispose();
 return{native,receipt,dispose(){helper.dispose();native.dispose();}};
}

it.each(['Array.some','Map.has','ArrayIterator.next'] as const)('preserves a removed callback boundary through exhaustive fallback: %s',async method=>{
 const f=await fixture(),provider=Object.getPrototypeOf(f.native.controller),field=Object.getOwnPropertyDescriptor(provider,'sync')!,keys=Reflect.ownKeys(provider);
 const constructor=Object.getOwnPropertyDescriptor(provider,'constructor')!.value;
 const iteratorProvider=Object.getPrototypeOf([][Symbol.iterator]());
 const target=method==='Array.some'?Array.prototype:method==='Map.has'?Map.prototype:iteratorProvider;
 const key=method==='Array.some'?'some':method==='Map.has'?'has':'next';
 const original=Object.getOwnPropertyDescriptor(target,key)!,mapGet=Map.prototype.get;
 let observed=false,failure:unknown;
 const mutate=()=>{if(!observed){observed=true;Object.defineProperty(provider,'sync',{...field,enumerable:!field.enumerable});}};
 const wrapper=function(this:any,...args:any[]){
  if(method==='Array.some'){
   let matches=Array.isArray(this)&&this.length===keys.length;
   if(matches)for(let i=0;i<keys.length;i++)if(this[i]!==keys[i]){matches=false;break;}
   if(matches)mutate();
   return Reflect.apply(original.value,this,args);
  }
  if(method==='Map.has'){
   if(args[0]==='constructor'){
    const descriptor=Reflect.apply(mapGet,this,['constructor']);
    if(descriptor&&typeof descriptor==='object'&&Object.getOwnPropertyDescriptor(descriptor,'value')?.value===constructor)mutate();
   }
   return Reflect.apply(original.value,this,args);
  }
  const result:any=Reflect.apply(original.value,this,args);
  if(result.value&&typeof result.value==='object'&&Object.getOwnPropertyDescriptor(result.value,'provider')?.value===provider)mutate();
  return result;
 };
 try{
  // No assertion framework executes while a shared intrinsic is substituted.
  Object.defineProperty(target,key,{...original,value:wrapper});
  try{f.receipt.assertCurrent();}catch(error){failure=error;}
 }finally{
  Object.defineProperty(target,key,original);Object.defineProperty(provider,'sync',field);
 }
 try{
  expect(observed).toBe(true);expect(failure).toBeInstanceOf(Error);
  expect(()=>f.receipt.assertCurrent()).toThrow(/retired/);
 }finally{f.dispose();}
});
