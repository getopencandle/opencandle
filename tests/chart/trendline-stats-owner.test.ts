import {expect,it} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument,type OwnedDrawingEditAcceptance} from '../../src/chart/contracts';
import {captureTrendlineStatisticsNativeOwner} from '../../src/chart/trendline-stats-owner';
import {nativeDrawingHarness} from './drawing-native-harness';

/** Actual pinned controller/store/serializer; canonical cache and source lease controlled. */
async function fixture(){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 try{
  const originals=[0,1].map(index=>{
   const row=createDrawing('trendline',{id:'synthetic-stats-owner-'+index,paneId:'price',zIndex:index+1,anchors:[{time:1000000,price:100},{time:1240000,price:200}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize();
   row.props={...row.props,lvTrendlineStats:{schemaVersion:1,priceRange:true,percentChange:true,barsRange:true,dateTimeRange:true,alwaysShow:false,position:'above'},futureStats:{kept:'SYNTHETIC opaque data'}};
   return row;
  });
  document.load({version:1,drawings:originals});native.controller.fromJSON({version:1,drawings:originals});
  const owner=document.captureReadOnlyOwner(),rows=document.all() as unknown as SerializedDrawing[],projected=native.controller.all() as SerializedDrawing[],facade={ctrl:native.controller};
  owner.assertCurrent();
  const bind=(index=0,assertSource:()=>void=()=>{},receipt:OwnedDrawingEditAcceptance=owner)=>captureTrendlineStatisticsNativeOwner(facade,rows[index],projected[index],receipt,assertSource);
  return{native,document,owner,rows,projected,facade,bind};
 }catch(error){native.dispose();throw error;}
}

it('shares the indexed canonical receipt without any all() lookup or repeated actual native serialization',async()=>{
 const f=await fixture();try{
  const before=f.document.serialize();let serialization=0,delegatedGet=0;
  for(const row of f.rows){const model=f.native.controller.store.get(row.id),serialize=model.serialize;model.serialize=function(){serialization++;return serialize.call(this);};}
  const originalGet=f.native.controller.store.get;f.native.controller.store.get=function(id:string){delegatedGet++;return originalGet.call(this,id);};
  f.document.all=()=>{throw Error('No per-label canonical clone is permitted.');};
  const owners=f.rows.map((_row,index)=>f.bind(index));expect(serialization).toBe(2);expect(delegatedGet).toBe(0);
  for(let index=0;index<100;index++)for(const owner of owners)owner();
  expect(serialization).toBe(2);expect(delegatedGet).toBe(0);expect(owners.every(Object.isFrozen)).toBe(true);
  expect(f.document.serialize()).toEqual(before);expect(Object.hasOwn(f.projected[0].props??{},'lvTrendlineStats')).toBe(false);
 }finally{f.native.dispose();}
});

it.each(['equal canonical load','empty undo','failed canonical load','equal native load'] as const)('permanently retires the indexed owner after %s',async kind=>{
 const f=await fixture();try{
  const owned=f.bind();
  if(kind==='equal canonical load')f.document.load(f.document.serialize());
  else if(kind==='empty undo')expect(f.document.undo()).toBe(false);
  else if(kind==='failed canonical load')expect(()=>f.document.load(null)).toThrow();
  else f.native.controller.fromJSON(f.document.serialize());
  expect(owned).toThrow(/retired|changed|identity/);expect(owned).toThrow(/retired/);
 }finally{f.native.dispose();}
});

it('rejects the actual new native projection before the old canonical row is reconciled',async()=>{
 const f=await fixture();try{
  let observed=0;
  f.native.controller.port.syncDrawings=()=>{
   const model=f.native.controller.store.get(f.rows[0].id),projected=model.serialize();
   if(projected.style.lineWidth===4){observed++;expect(()=>captureTrendlineStatisticsNativeOwner(f.facade,f.rows[0],projected,f.owner,()=>{})).toThrow(/canonical/);}
  };
  f.native.controller.updateMany([{id:f.rows[0].id,patch:{style:{lineWidth:4}}}]);expect(observed).toBeGreaterThan(0);
 }finally{f.native.dispose();}
});

it('compares actual native state even when a detached projection still matches the old canonical row',async()=>{
 const f=await fixture();try{
  f.native.controller.updateMany([{id:f.rows[0].id,patch:{style:{lineWidth:4}}}]);
  expect(()=>f.bind()).toThrow(/canonical/);
 }finally{f.native.dispose();}
});

it.each(['canonical','native'] as const)('rejects %s replacement during the actual serializer call',async kind=>{
 const f=await fixture();try{
  const model=f.native.controller.store.get(f.rows[0].id),serialize=model.serialize;
  model.serialize=function(){const result=serialize.call(this);if(kind==='canonical')f.document.load(f.document.serialize());else f.native.controller.fromJSON(f.document.serialize());return result;};
  expect(()=>f.bind()).toThrow(/retired|changed|identity/);
 }finally{f.native.dispose();}
});

it('rechecks membership after a source callback and never invokes a foreign replacement serializer',async()=>{
 const f=await fixture();try{
  const id=f.rows[0].id,map=f.native.controller.store.byId,model=map.get(id);let action=()=>{},sourceCalls=0,foreignCalls=0;
  const owned=f.bind(0,()=>{sourceCalls++;action();}),foreign={...model,serialize(){foreignCalls++;throw Error('Foreign model must not execute.');}};
  action=()=>{map.set(id,foreign);};expect(owned).toThrow(/identity/);expect(foreignCalls).toBe(0);
  map.set(id,model);action=()=>{};const calls=sourceCalls;expect(owned).toThrow(/retired/);expect(sourceCalls).toBe(calls);expect(foreignCalls).toBe(0);
 }finally{f.native.dispose();}
});

it('source retirement is permanent even if the source becomes available again',async()=>{
 const f=await fixture();try{
  let current=true,calls=0;const owned=f.bind(0,()=>{calls++;if(!current)throw Error('SYNTHETIC source retired.');});
  current=false;expect(owned).toThrow(/source retired/);current=true;const prior=calls;expect(owned).toThrow(/owner retired/);expect(calls).toBe(prior);
 }finally{f.native.dispose();}
});

it.each(['paneId','serialize'] as const)('rejects an accessor replacing native %s without reading it and cannot revive',async key=>{
 const f=await fixture();try{
  const model=f.native.controller.store.get(f.rows[0].id),before=Object.getOwnPropertyDescriptor(model,key),owned=f.bind();let reads=0;
  Object.defineProperty(model,key,{configurable:true,enumerable:true,get(){reads++;throw Error('Accessor must not execute.');}});
  expect(owned).toThrow(/changed|ownership/);expect(reads).toBe(0);
  if(before)Object.defineProperty(model,key,before);else delete model[key];
  expect(owned).toThrow(/retired/);expect(reads).toBe(0);
 }finally{f.native.dispose();}
});

it('rejects descriptor-only and prototype changes, including restored native graphs',async()=>{
 const f=await fixture();try{
  const model=f.native.controller.store.get(f.rows[0].id),before=Object.getOwnPropertyDescriptor(model,'paneId')!,owned=f.bind();
  Object.defineProperty(model,'paneId',{...before,enumerable:!before.enumerable});expect(owned).toThrow(/changed/);Object.defineProperty(model,'paneId',before);expect(owned).toThrow(/retired/);
  const next=f.bind(),prototype=Object.getPrototypeOf(model);Object.setPrototypeOf(model,Object.create(prototype));expect(next).toThrow(/prototype/);Object.setPrototypeOf(model,prototype);expect(next).toThrow(/retired/);
 }finally{f.native.dispose();}
});

it('rejects store/map accessors before invoking delegated reads',async()=>{
 const f=await fixture();try{
  const store=f.native.controller.store;let reads=0;
  Object.defineProperty(store,'get',{configurable:true,get(){reads++;throw Error('Store getter must not execute.');}});
  expect(()=>f.bind()).toThrow(/data field/);expect(reads).toBe(0);delete store.get;
  Object.defineProperty(store.byId,'get',{configurable:true,get(){reads++;throw Error('Map getter must not execute.');}});
  expect(()=>f.bind()).toThrow(/identity map/);expect(reads).toBe(0);delete store.byId.get;
 }finally{f.native.dispose();}
});

it('pins inherited method resolution before invoking a newly shadowing native method',async()=>{
 const f=await fixture();try{
  const model=f.native.controller.store.get(f.rows[0].id),owned=f.bind();let calls=0;
  model.serialize=()=>{calls++;throw Error('Foreign serializer must not execute.');};
  expect(owned).toThrow(/ownership|changed/);expect(calls).toBe(0);delete model.serialize;expect(owned).toThrow(/retired/);
 }finally{f.native.dispose();}
});

it('rejects malformed detached rows before native serialization and preserves opaque canonical data',async()=>{
 const f=await fixture();try{
  const model=f.native.controller.store.get(f.rows[0].id),serialize=model.serialize;let calls=0,reads=0;model.serialize=function(){calls++;return serialize.call(this);};
  const badId={...f.projected[0]};Object.defineProperty(badId,'id',{enumerable:true,get(){reads++;return f.rows[0].id;}});
  expect(()=>captureTrendlineStatisticsNativeOwner(f.facade,f.rows[0],badId,f.owner,()=>{})).toThrow(/data field/);
  const badProps=structuredClone(f.projected[0]);badProps.props={};Object.defineProperty(badProps.props,'future',{enumerable:true,get(){reads++;return 1;}});
  expect(()=>captureTrendlineStatisticsNativeOwner(f.facade,f.rows[0],badProps,f.owner,()=>{})).toThrow(/accessor/);
  expect(calls).toBe(0);expect(reads).toBe(0);
  const before=f.document.serialize();f.bind()();expect(calls).toBe(1);expect(f.document.serialize()).toEqual(before);
 }finally{f.native.dispose();}
});

it('uses the original genuine receipt receiver and rejects borrowing that method',async()=>{
 const f=await fixture();try{
  const model=f.native.controller.store.get(f.rows[0].id),serialize=model.serialize;let calls=0;model.serialize=function(){calls++;return serialize.call(this);};
  const borrowed={assertCurrent:f.owner.assertCurrent};expect(()=>f.bind(0,()=>{},borrowed)).toThrow(/Foreign readonly/);expect(calls).toBe(0);
  f.bind()();expect(calls).toBe(1);
 }finally{f.native.dispose();}
});

it('a reentrant source assertion retires the same owner without recursive work or resurrection',async()=>{
 const f=await fixture();try{
  let action=()=>{};const owned=f.bind(0,()=>action());action=()=>owned();
  expect(owned).toThrow(/reentered/);action=()=>{};expect(owned).toThrow(/retired/);
 }finally{f.native.dispose();}
});
