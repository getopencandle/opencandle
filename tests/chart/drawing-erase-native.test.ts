import {expect, it} from 'vitest';
import {createDrawing, type SerializedDrawing} from '@luxalgo/vela';
import {prepareNativeDrawingInsert, prepareNativeDrawingRemoval, type NativeDrawingInsertHost, type NativeDrawingRemoval} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from './drawing-native-harness';

// Actual pinned native controller/store/synchronization, with the existing
// small harness. This does not exercise canvas hit testing or workspace commits.
function row(id:string, zIndex:number):SerializedDrawing {
 return createDrawing('trendline',{id,paneId:'price',zIndex,locked:false,visible:true,
  anchors:[{time:1000000,price:10+zIndex},{time:1240000,price:20+zIndex}],
  style:{lineColor:'#123456',lineWidth:3,lineStyle:'solid'}})!.serialize();
}
async function fixture() {
 const native=await nativeDrawingHarness(), rows=[row('SYNTHETIC-A',1),row('SYNTHETIC-B',2),row('SYNTHETIC-C',3)];
 native.controller.fromJSON({version:1,drawings:rows});
 const facade={ctrl:native.controller}, expected=structuredClone(native.controller.store.get('SYNTHETIC-B').serialize()) as SerializedDrawing;
 let source=true,capacity=()=>{},assertion=()=>{};
 const host:NativeDrawingInsertHost={assertCurrent(){if(!source)throw Error('SYNTHETIC retired source');assertion();},assertWorkspaceCapacity(){capacity();}};
 return{native,facade,expected,host,prepare:()=>prepareNativeDrawingRemoval(facade,[expected],host),
  ids:()=>native.controller.all().map((value:SerializedDrawing)=>value.id),source:(value:boolean)=>{source=value;},
  capacity:(action:()=>void)=>{capacity=action;},assertion:(action:()=>void)=>{assertion=action;},dispose:()=>native.dispose()};
}

it('removes only the exact middle model with one native sync, no native history/selection/default/allocator change',async()=>{
 const f=await fixture();let helper:NativeDrawingRemoval|undefined;
 try{
  const core=f.native.controller,store=core.store,A=store.get('SYNTHETIC-A'),C=store.get('SYNTHETIC-C');
  const beforeA=A.serialize(),beforeC=C.serialize(),history=core.history.undoStack,redo=core.history.redoStack,defaults=core.defaults,reserved=store.reservedIds,seq=store.seq,z=store.zCounter;
  let syncs=0,removedEvents=0;const original=core.port.syncDrawings,off=f.native.on('drawing:removed',()=>{removedEvents++;});
  core.port.syncDrawings=(drawings:SerializedDrawing[])=>{syncs++;expect(drawings.map(value=>value.id)).toEqual(['SYNTHETIC-A','SYNTHETIC-C']);original(drawings);};
  helper=f.prepare();const result=helper.remove();
  expect(result).toEqual({state:'complete',canonicalAccepted:false,ids:['SYNTHETIC-B'],attemptedIds:['SYNTHETIC-B'],cleanupComplete:true,diagnostics:[]});
  expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-C']);expect(store.get('SYNTHETIC-A')).toBe(A);expect(store.get('SYNTHETIC-C')).toBe(C);
  expect(A.serialize()).toEqual(beforeA);expect(C.serialize()).toEqual(beforeC);expect(A.anchors).toEqual([{time:1000000,price:11},{time:1240000,price:21}]);
  expect(core.history.undoStack).toBe(history);expect(history).toEqual([]);expect(core.history.redoStack).toBe(redo);expect(redo).toEqual([]);
  expect(core.defaults).toBe(defaults);expect(store.reservedIds).toBe(reserved);expect(store.seq).toBe(seq);expect(store.zCounter).toBe(z);expect(f.native.selection()).toEqual([]);
  expect(syncs).toBe(1);expect(removedEvents).toBe(0);helper.assertCurrent();off();
 }finally{helper?.dispose();f.dispose();}
});

it('can remove the only model and prove an empty accepted native value set',async()=>{
 const f=await fixture();let helper:NativeDrawingRemoval|undefined;
 try{
  f.native.controller.fromJSON({version:1,drawings:[f.expected]});helper=f.prepare();expect(helper.remove().state).toBe('complete');
  const accepted=helper.captureAcceptedValueOwner();helper.dispose();accepted.assertCurrent();expect(f.ids()).toEqual([]);
 }finally{helper?.dispose();f.dispose();}
});

it('the accepted value receipt requires completed removal/disposal and refuses target reinsertion afterward',async()=>{
 const f=await fixture(),helper=f.prepare(),target=f.native.controller.store.get('SYNTHETIC-B');
 try{
  expect(()=>helper.captureAcceptedValueOwner()).toThrow(/complete/);expect(helper.remove().state).toBe('complete');
  const accepted=helper.captureAcceptedValueOwner();expect(()=>helper.captureAcceptedValueOwner()).toThrow(/consumed/);
  helper.dispose();accepted.assertCurrent();const beforeZ=f.native.controller.store.zCounter;
  f.native.controller.store.add(target);
  // The installed provider advances its allocator even for this old model.
  // Its earlier ownership refusal must not be mistaken for a missing guard.
  expect(f.native.controller.store.zCounter).toBe(beforeZ+1);
  // Public all() sorts the unchanged z values 1,2,3; map ownership retains
  // insertion order and therefore places the reinserted B after C.
  expect(target.zIndex).toBe(2);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);
  expect([...f.native.controller.store.byId.keys()]).toEqual(['SYNTHETIC-A','SYNTHETIC-C','SYNTHETIC-B']);
  expect(()=>accepted.assertCurrent()).toThrow(/^Duplicate native descriptor changed: zCounter$/);
  f.native.controller.store.remove(target.id);expect(()=>accepted.assertCurrent()).toThrow(/retired/);
 }finally{helper.dispose();f.dispose();}
});

it('accepted membership refuses direct target reinsertion even without allocator drift',async()=>{
 const f=await fixture(),helper=f.prepare(),store=f.native.controller.store,target=store.get('SYNTHETIC-B');
 try{
  expect(helper.remove().state).toBe('complete');const accepted=helper.captureAcceptedValueOwner();helper.dispose();accepted.assertCurrent();
  const beforeZ=store.zCounter;store.byId.set(target.id,target);
  expect(store.zCounter).toBe(beforeZ);expect(target.zIndex).toBe(2);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);
  expect([...store.byId.keys()]).toEqual(['SYNTHETIC-A','SYNTHETIC-C','SYNTHETIC-B']);
  expect(()=>accepted.assertCurrent()).toThrow(/^Duplicate accepted native membership or order changed\.$/);
  store.byId.delete(target.id);expect(()=>accepted.assertCurrent()).toThrow(/retired/);
 }finally{helper.dispose();f.dispose();}
});

it.each(['SYNTHETIC-B','SYNTHETIC-A'] as const)('refuses stale direct %s geometry before forwarding',async id=>{
 const f=await fixture(),helper=f.prepare();
 try{f.native.controller.store.get(id).anchors[0].price=999;const result=helper.remove();expect(result.state).toBe('not-forwarded');expect(result.attemptedIds).toEqual([]);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);}
 finally{helper.dispose();f.dispose();}
});

it('refuses changed target values during preparation rather than treating an ID as authority',async()=>{
 const f=await fixture();try{
  f.expected.anchors[0].price=101;expect(()=>f.prepare()).toThrow(/changed|differs/);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);
  expect(Object.hasOwn(f.native.controller.store,'remove')).toBe(false);
 }finally{f.dispose();}
});

it.each(['locked','visible'] as const)('refuses a current protected target whose %s state is ineligible',async field=>{
 const f=await fixture();try{
  const protectedRow={...f.expected,[field]:field==='locked'};f.native.controller.fromJSON({version:1,drawings:[protectedRow]});
  expect(()=>prepareNativeDrawingRemoval(f.facade,[protectedRow],f.host)).toThrow(/locked|visible|eligible|protected/);expect(f.ids()).toEqual(['SYNTHETIC-B']);
 }finally{f.dispose();}
});

it('rejects missing, zero/multiple, sparse, decorated and accessor expected-row inputs without getters or mutation',async()=>{
 const f=await fixture();try{
  let calls=0;const getter=new Array<SerializedDrawing>(1);Object.defineProperty(getter,'0',{enumerable:true,get(){calls++;throw Error('not called');}});
  const decorated=[f.expected];Object.defineProperty(decorated,'extra',{value:true,enumerable:true});
  for(const input of [[],[f.expected,f.expected],new Array<SerializedDrawing>(1),decorated,getter,[{...f.expected,id:'SYNTHETIC-missing'}]])expect(()=>prepareNativeDrawingRemoval(f.facade,input,f.host)).toThrow();
  expect(calls).toBe(0);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);expect(Object.hasOwn(f.native.controller.store,'remove')).toBe(false);
 }finally{f.dispose();}
});

it('a capacity refusal forwards nothing and a retired source cannot revive the same lease',async()=>{
 const f=await fixture();let helper=f.prepare();try{
  f.capacity(()=>{throw Error('SYNTHETIC workspace capacity');});expect(helper.remove().state).toBe('not-forwarded');expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);helper.dispose();
  f.capacity(()=>{});helper=f.prepare();f.source(false);expect(()=>helper.assertCurrent()).toThrow(/retired source/);f.source(true);expect(helper.remove().state).toBe('not-forwarded');
 }finally{helper.dispose();f.dispose();}
});

it('rejects a nonempty native selection before acquiring mutation wrappers',async()=>{
 const f=await fixture();try{
  f.native.controller.select(['SYNTHETIC-A']);expect(()=>f.prepare()).toThrow(/empty.*selection/);
  expect(Object.hasOwn(f.native.controller.store,'remove')).toBe(false);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);
 }finally{f.dispose();}
});

it.each(['sequence','stack','reservation','order'] as const)('refuses direct %s drift before deleting the target',async change=>{
 const f=await fixture(),helper=f.prepare();try{
  const core=f.native.controller,store=core.store;
  if(change==='sequence')store.seq++;
  else if(change==='stack')core.history.undoStack.push({synthetic:true});
  else if(change==='reservation')store.reservedIds.add('SYNTHETIC-reservation');
  else{const A=store.byId.get('SYNTHETIC-A');store.byId.delete('SYNTHETIC-A');store.byId.set('SYNTHETIC-A',A);}
  const result=helper.remove();expect(result.state).toBe('not-forwarded');expect(result.attemptedIds).toEqual([]);expect(store.get('SYNTHETIC-B')).toBeDefined();
 }finally{helper.dispose();f.dispose();}
});

it.each(['capacity','sourceAssertion'] as const)('refuses target geometry changed inside the %s callback without forwarding',async callback=>{
 const f=await fixture(),helper=f.prepare();try{
  const mutate=()=>{f.native.controller.store.get('SYNTHETIC-B').anchors[0].price=999;};
  if(callback==='capacity')f.capacity(mutate);else f.assertion(mutate);
  const result=helper.remove();expect(result.state).toBe('not-forwarded');expect(result.attemptedIds).toEqual([]);
  expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);expect(f.native.controller.store.get('SYNTHETIC-B').anchors[0].price).toBe(999);
 }finally{helper.dispose();f.dispose();}
});

it.each(['coreRemoveMany','storeRemove','historyCommit','equalLock'] as const)('an outside %s attempt cannot borrow the one target removal permit',async action=>{
 const f=await fixture(),helper=f.prepare();try{
  const core=f.native.controller,before=core.store.serialize(),redo=core.history.redoStack;
  if(action==='coreRemoveMany'){
   // deleteMany opens history before its guarded commit, even with no IDs.
   expect(()=>core.removeMany([])).toThrow(/^Duplicate native descriptor changed: pending$/);
   expect(core.history.pending).toEqual(before);expect(core.history.depth).toBe(1);expect(core.history.undoStack).toEqual([]);expect(core.history.redoStack).toBe(redo);
  }else if(action==='equalLock'){
   // setLocked records history before reaching the guarded store operation.
   expect(()=>core.setLocked('SYNTHETIC-B',false)).toThrow(/^Duplicate native descriptor changed: redoStack$/);
   expect(core.history.undoStack).toEqual([before]);expect(core.history.redoStack).not.toBe(redo);expect(core.history.redoStack).toEqual([]);
   expect(core.history.pending).toBeNull();expect(core.history.depth).toBe(0);expect(core.store.get('SYNTHETIC-B').locked).toBe(false);
  }else if(action==='storeRemove')expect(core.store.remove('SYNTHETIC-missing')).toBe(false);
  else expect(core.history.commit()).toBeUndefined();
  expect(()=>helper.assertCurrent()).toThrow(/retired|mutation/);
  const result=helper.remove();expect(result.state).toBe('not-forwarded');expect(result.attemptedIds).toEqual([]);
  expect(core.store.serialize()).toEqual(before);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);
 }finally{helper.dispose();f.dispose();}
});

it('consumes the remove permit before native emit, so a nested missing-ID remove makes the result incomplete',async()=>{
 const f=await fixture();let nested=false;const off=f.native.controller.store.onChange(()=>{if(!nested){nested=true;f.native.controller.store.remove('SYNTHETIC-missing');}}),helper=f.prepare();
 try{const result=helper.remove();expect(result.state).toBe('forwarded-incomplete');expect(result.attemptedIds).toEqual(['SYNTHETIC-B']);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-C']);expect(Object.hasOwn(f.native.controller.store,'remove')).toBe(false);}
 finally{helper.dispose();off();f.dispose();}
});

it('a native listener throw never invents a rollback or second removal',async()=>{
 const f=await fixture();let emitted=0;const off=f.native.controller.store.onChange(()=>{emitted++;throw Error('SYNTHETIC remove listener');}),helper=f.prepare();
 try{const result=helper.remove();expect(result.state).toBe('forwarded-incomplete');expect(result.attemptedIds).toEqual(['SYNTHETIC-B']);expect(result.diagnostics.join(' ')).toMatch(/remove listener/);expect(emitted).toBe(1);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-C']);expect(()=>helper.captureAcceptedValueOwner()).toThrow(/complete/);}
 finally{helper.dispose();off();f.dispose();}
});

it('source replacement during emit is preserved and never restored by removal cleanup',async()=>{
 const f=await fixture(),replacement={},off=f.native.controller.store.onChange(()=>{f.source(false);(f.facade as {ctrl:unknown}).ctrl=replacement;}),helper=f.prepare();
 try{expect(helper.remove().state).toBe('forwarded-incomplete');expect(f.facade.ctrl).toBe(replacement);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-C']);}
 finally{helper.dispose();off();f.dispose();}
});

it('insertion and removal share one claim and never grant each other a method permit',async()=>{
 const f=await fixture(),copy={...f.expected,id:'SYNTHETIC-copy',zIndex:4};let remove:NativeDrawingRemoval|undefined,insert:ReturnType<typeof prepareNativeDrawingInsert>|undefined;
 try{
  remove=f.prepare();expect(()=>prepareNativeDrawingInsert(f.facade,[copy],f.host)).toThrow(/already owned/);remove.dispose();
  insert=prepareNativeDrawingInsert(f.facade,[copy],f.host);expect(()=>f.prepare()).toThrow(/already owned/);expect(insert.insert().state).toBe('complete');insert.dispose();
  remove=f.prepare();expect(remove.remove().state).toBe('complete');expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-C','SYNTHETIC-copy']);
 }finally{remove?.dispose();insert?.dispose();f.dispose();}
});

it('wrong receivers, consumed remove calls and disposal never grant new deletion authority',async()=>{
 const f=await fixture(),helper=f.prepare();try{
  expect(()=>helper.remove.call({...helper})).toThrow(/receiver/);expect(()=>helper.dispose.call({...helper})).toThrow(/receiver/);
  expect(helper.remove().state).toBe('complete');expect(()=>helper.remove()).toThrow(/consumed/);helper.dispose();expect(()=>helper.assertCurrent()).toThrow(/retired/);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-C']);
 }finally{helper.dispose();f.dispose();}
});

it('disposal before forwarding is cancellation and cannot later delete a model',async()=>{
 const f=await fixture(),helper=f.prepare();try{
  helper.dispose();const result=helper.remove();expect(result.state).toBe('not-forwarded');expect(result.attemptedIds).toEqual([]);
  expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);expect(Object.hasOwn(f.native.controller.store,'remove')).toBe(false);
 }finally{helper.dispose();f.dispose();}
});

it('cleanup preserves a replacement remove method instead of overwriting a newer owner',async()=>{
 const f=await fixture(),helper=f.prepare(),replacement=()=>false;
 try{
  Object.defineProperty(f.native.controller.store,'remove',{value:replacement,writable:true,configurable:true});expect(()=>helper.assertCurrent()).toThrow(/changed/);expect(()=>helper.dispose()).toThrow(/foreign method/);expect(f.native.controller.store.remove).toBe(replacement);
  delete f.native.controller.store.remove;expect(Object.hasOwn(f.native.controller,'removeMany')).toBe(false);expect(f.ids()).toEqual(['SYNTHETIC-A','SYNTHETIC-B','SYNTHETIC-C']);
 }finally{helper.dispose();f.dispose();}
});
