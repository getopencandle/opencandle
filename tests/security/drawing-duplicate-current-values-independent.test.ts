import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {prepareNativeDrawingInsert} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';

async function fixture(sharedStyle=false){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 const rows=Array.from({length:2},(_,index)=>createDrawing('trendline',{id:'SYNTHETIC current-values original '+index,paneId:'price',zIndex:index+1,anchors:[{time:1000000,price:10},{time:1240000,price:20}]})!.serialize());
 document.load({version:1,drawings:rows});native.controller.fromJSON({version:1,drawings:rows});
 if(sharedStyle)native.controller.store.get(rows[1].id).style=native.controller.store.get(rows[0].id).style;
 const originals=document.all(),copies=originals.map((row,index)=>({...structuredClone(row),id:'SYNTHETIC current-values copy '+index,zIndex:10+index}));
 const canonical=document.prepareOwnedInsertBatch(originals,copies);let canonicalOwner=()=>canonical.assertCurrent(),action=()=>{},calls=0,sourceCurrent=true;
 const helper=prepareNativeDrawingInsert({ctrl:native.controller},copies.map(row=>deserializeDrawing(row as unknown as SerializedDrawing)!.serialize()),{assertCurrent(){calls++;action();if(!sourceCurrent)throw Error('SYNTHETIC current-values source retired');canonicalOwner();},assertWorkspaceCapacity(){}});
 canonical.stage();expect(helper.insert().state).toBe('complete');const accepted=canonical.accept();canonicalOwner=()=>accepted.assertCurrent();
 const receipt=helper.captureAcceptedValueOwner();helper.dispose();calls=0;
 const models=[...native.controller.store.byId.values()] as any[];
 return{native,document,helper,receipt,models,arm(callback:()=>void){action=callback;calls=0;},calls:()=>calls,source(value:boolean){sourceCurrent=value;},dispose(){action=()=>{};helper.dispose();native.dispose();}};
}

it('explicitly admits only final-correct independent-row restoration under the amended current-values policy',async()=>{
 const f=await fixture(),later=f.models[3],before=later.anchors[0].price;
 try{
  const nativeBefore=f.models.map(model=>model.serialize()),canonicalBefore=f.document.serialize();let sawTransient=false;
  f.arm(()=>{if(f.calls()===2)later.anchors[0].price=before+3;else if(f.calls()===3){sawTransient=later.anchors[0].price===before+3;later.anchors[0].price=before;}});
  expect(()=>f.receipt.assertCurrent()).not.toThrow();expect(sawTransient).toBe(true);expect(f.calls()).toBe(f.models.length+2);
  expect(f.models.map(model=>model.serialize())).toEqual(nativeBefore);expect(f.document.serialize()).toEqual(canonicalBefore);
  f.arm(()=>{});expect(()=>f.receipt.assertCurrent()).not.toThrow();
 }finally{later.anchors[0].price=before;f.dispose();}
});

it('checks shared captured nodes at the current target boundary and cannot revive observed retirement',async()=>{
 const f=await fixture(true),shared=f.models[0].style,before=shared.lineWidth;
 try{
  expect(f.models[1].style).toBe(shared);f.arm(()=>{if(f.calls()===2)shared.lineWidth=9;else if(f.calls()===3)shared.lineWidth=before;});
  expect(()=>f.receipt.assertCurrent()).toThrow(/changed|retired/);expect(f.calls()).toBe(2);
  shared.lineWidth=before;expect(()=>f.receipt.assertCurrent()).toThrow(/retired/);
 }finally{shared.lineWidth=before;f.dispose();}
});

it.each(['persistent','final'] as const)('rejects %s changes outside the current target through the complete final proof',async fault=>{
 const f=await fixture(),later=f.models[3],before=later.anchors[0].price;
 try{
  f.arm(()=>{if(f.calls()===(fault==='final'?f.models.length+2:2))later.anchors[0].price=before+3;});
  expect(()=>f.receipt.assertCurrent()).toThrow(/changed|retired/);
  if(fault==='final')expect(f.calls()).toBe(f.models.length+2);
  later.anchors[0].price=before;expect(()=>f.receipt.assertCurrent()).toThrow(/retired/);
 }finally{later.anchors[0].price=before;f.dispose();}
});

it('rejects a future target accessor before invoking it and permanently retires the receipt',async()=>{
 const f=await fixture(),anchor=f.models[3].anchors[0],prior=Object.getOwnPropertyDescriptor(anchor,'price')!;let reads=0;
 try{
  f.arm(()=>{if(f.calls()===2)Object.defineProperty(anchor,'price',{get(){reads++;return 10;},enumerable:true,configurable:true});});
  expect(()=>f.receipt.assertCurrent()).toThrow(/changed|retired/);expect(reads).toBe(0);
  Object.defineProperty(anchor,'price',prior);expect(()=>f.receipt.assertCurrent()).toThrow(/retired/);
 }finally{Object.defineProperty(anchor,'price',prior);f.dispose();}
});

it.each(['source','canonical'] as const)('cannot accept a restored native graph after %s authority retires',async kind=>{
 const f=await fixture(),later=f.models[3],before=later.anchors[0].price;
 try{
  f.arm(()=>{if(f.calls()===2){later.anchors[0].price=before;if(kind==='source')f.source(false);else f.document.load(f.document.serialize());}});
  expect(()=>f.receipt.assertCurrent()).toThrow();f.source(true);expect(()=>f.receipt.assertCurrent()).toThrow(/retired/);
 }finally{later.anchors[0].price=before;f.dispose();}
});

it('retires an armed outer assertion after swallowed capture reentry instead of treating consumed as a harmless callback',async()=>{
 const f=await fixture();let inner:unknown;
 try{
  f.arm(()=>{try{f.helper.captureAcceptedValueOwner();}catch(error){inner=error;}});
  expect(()=>f.receipt.assertCurrent()).toThrow(/retired|reentered/);expect(inner).toBeInstanceOf(Error);
  f.arm(()=>{});expect(()=>f.receipt.assertCurrent()).toThrow(/retired/);
 }finally{f.dispose();}
});
