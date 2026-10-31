import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {prepareNativeDrawingInsert} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';

async function fixture(){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 const original=createDrawing('trendline',{id:'SYNTHETIC independent source',paneId:'price',zIndex:1,anchors:[{time:1000000,price:10},{time:1240000,price:20}]})!.serialize();
 original.props={...original.props,future:{label:'SYNTHETIC opaque',omission:undefined,zero:-0}};
 document.load({version:1,drawings:[original]});native.controller.fromJSON({version:1,drawings:[original]});
 const before=document.all(),copy={...structuredClone(before[0]),id:'SYNTHETIC independent copy',zIndex:2},canonical=document.prepareOwnedInsertBatch(before,[copy]);
 const projected=deserializeDrawing(copy as unknown as SerializedDrawing)!.serialize();let canonicalOwner=()=>canonical.assertCurrent(),hook=()=>{};
 const helper=prepareNativeDrawingInsert({ctrl:native.controller},[projected],{assertCurrent(){hook();canonicalOwner();},assertWorkspaceCapacity(){}});
 return{native,document,copy,helper,onAssert(action:()=>void){hook=action;},complete(){canonical.stage();expect(helper.insert().state).toBe('complete');const accepted=canonical.accept();canonicalOwner=()=>accepted.assertCurrent();},dispose(){helper.dispose();native.dispose();}};
}

it('public native assertion cannot succeed after its host swallows a nested assertion retirement',async()=>{
 const f=await fixture();let inner:unknown,attempted=false;
 try{
  f.onAssert(()=>{if(attempted)return;attempted=true;try{f.helper.assertCurrent();}catch(error){inner=error;}});
  expect(()=>f.helper.assertCurrent()).toThrow(/retired|reentered/i);
  expect(attempted).toBe(true);expect(inner).toBeInstanceOf(Error);expect(()=>f.helper.assertCurrent()).toThrow(/retired/i);
 }finally{f.onAssert(()=>{});f.dispose();}
});

it('accepted native values survive permitted selection/reservation while canonical opaque copies remain exact',async()=>{
 const f=await fixture();try{
  f.complete();const value=f.helper.captureAcceptedValueOwner();f.helper.dispose();
  f.native.controller.store.reserveIds(['SYNTHETIC later reservation']);f.native.controller.setSelection([f.copy.id]);value.assertCurrent();
  const copied=f.document.all().find(row=>row.id===f.copy.id)!;expect(copied).toEqual(f.copy);
  const future=(copied.props as any).future;expect(Object.hasOwn(future,'omission')).toBe(true);expect(Object.is(future.zero,-0)).toBe(true);
  expect(()=>f.helper.assertCurrent()).toThrow();value.assertCurrent();
 }finally{f.dispose();}
});

it('same-value canonical replacement permanently retires accepted native value authority',async()=>{
 const f=await fixture();try{
  f.complete();const value=f.helper.captureAcceptedValueOwner();f.helper.dispose();value.assertCurrent();
  const exact=f.document.serialize();f.document.load(exact);expect(()=>value.assertCurrent()).toThrow();
  f.document.load(exact);expect(()=>value.assertCurrent()).toThrow(/retired/i);
  expect(f.native.controller.all().map((row:SerializedDrawing)=>row.id)).toEqual(['SYNTHETIC independent source',f.copy.id]);
 }finally{f.dispose();}
});
