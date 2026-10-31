import {expect,it} from 'vitest';
import {createDrawing,type SerializedDrawing,type Vela} from '@luxalgo/vela';
import {createDrawingErasePublisher,DrawingErasePublicationError,type DrawingErasePublicationHost} from '../../src/chart/drawing-erase-publication';
import {installDrawingCommandRouter,type DrawingCommandRouterHost} from '../../src/chart/drawing-command-router';
import {registerOwnedDrawingDeleteDispatch,type OwnedDrawingDeleteInvocation,type OwnedDrawingDeleteRegistration} from '../../src/chart/trendline-annotation';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {installFibTrendLine} from '../../src/chart/fib-trend-line-painter';
import {captureFibTrendLineNativeOwner,captureFibLevelPresentationNativeOwner} from '../../src/chart/fib-trend-line-owner';
import {captureNativeInlineLayoutOwner} from '../../src/chart/native-inline-layout-owner';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';
import {drawingRouterHarness} from './drawing-command-router-harness';
import {annotationRecord} from './trendline-annotation-native-harness';

// Actual native input, annotation query, router, canonical/native removal and
// publisher bodies. Workspace publication uses an explicit synchronous model;
// these cases do not prove DOM pointer IDs, App persistence or packaged input.
async function fixture(rows:SerializedDrawing[]=[annotationRecord(),{...annotationRecord(),id:'SYNTHETIC second',anchors:[{time:1100000,price:20},{time:1200000,price:20}]}]){
 const f=await drawingRouterHarness(rows);f.reset.dispose();f.router.dispose();const input=f.paint.controller;
 input.toolbar={setEraserActive(){},setMeasureActive(){},setActiveTool(){}};input.measure={...input.measure,clear(){},isFinished:()=>false};input.erasing=false;
 const canonicalRows=rows.map(row=>({...row,future:{omitted:undefined,zero:-0}}));
 f.document.load({version:1,drawings:canonicalRows,lvDrawingManager:{schemaVersion:1,groups:[{id:'SYNTHETIC group',name:'SYNTHETIC group',memberIds:rows.map(row=>row.id)}],templates:[]},future:'retained'});
 let workspace={drawings:f.document.serialize()},holds=0,publications=0,notifications=0,quarantines=0;
 let preparation=()=>{},publication=()=>{},notification=()=>{};
 const history=createWorkspaceHistory<typeof workspace>(),source=f.captureOwner();
 const pubHost:DrawingErasePublicationHost={document:f.document,facade:f.facade,captureSource:f.captureOwner,assertMutable:source,
  assertEligible(row){if(row.locked===true||row.visible===false)throw Error('SYNTHETIC protected target');},
  captureProjection:()=>({assertCurrent:source,project:value=>structuredClone(value.drawings as SerializedDrawing[])}),
  captureWorkspace(){let expected=workspace;const current=()=>{source();if(workspace!==expected)throw Error('SYNTHETIC replaced workspace');};return{assertCurrent:current,prepare(candidate){current();preparation();current();const next={drawings:structuredClone(candidate)},record=history.prepareRecord(workspace,null);return{assertCurrent:current,publish(mark){current();publication();current();record.commit();publications++;workspace=next;expected=next;mark();}};}};},
  begin(){holds++;let released=false;return{release(){if(released)throw Error('SYNTHETIC repeated release');released=true;holds--;}};},
  selection:()=>f.native.selection(),notify(){notifications++;notification();},quarantine(){quarantines++;}
 };
 const publisher=createDrawingErasePublisher(pubHost),receipts:unknown[]=[],errors:string[]=[];
 const host:DrawingCommandRouterHost={...f.host,captureErrorOwner:f.captureOwner,reportError:message=>{errors.push(message);},assertEraseMutable:source,erase(id,assert){const result=publisher.erase(id,assert);receipts.push(result);return result;}};
 const router=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,host);input.setMode('eraser');
 return{...f,input,router,publisher,history,canonicalRows,receipts,errors,begin:()=>router.beginEraseGesture(source),state:()=>({workspace,holds,publications,notifications,quarantines}),prepare(callback:()=>void){preparation=callback;},beforePublish(callback:()=>void){publication=callback;},notify(callback:()=>void){notification=callback;},dispose(){router.dispose();f.dispose();}};
}

it('ERASER.COMPOSITION.ONE_HIT native input publishes exact canonical/group state once without core delete fallback',async()=>{
 const f=await fixture(),removed:unknown[]=[];const stop=f.native.on('drawing:removed',value=>removed.push(value));
 try{const before=f.state().workspace,nativePast=f.native.controller.history.undoStack,nativePrototype=Object.getPrototypeOf(f.native.controller),deleteMany=Object.getOwnPropertyDescriptor(nativePrototype,'deleteMany');
  expect(Object.hasOwn(f.native.controller,'deleteMany')).toBe(false);expect(typeof deleteMany?.value).toBe('function');const lease=f.begin();
  f.input.pointerDown(20,200);expect(f.receipts).toEqual([{ids:['synthetic-annotation'],nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true}]);
  expect(f.native.controller.all().map((row:SerializedDrawing)=>row.id)).toEqual(['SYNTHETIC second']);expect(f.document.all()).toStrictEqual([f.canonicalRows[1]]);
  expect(f.state().workspace.drawings).toStrictEqual({version:1,drawings:[f.canonicalRows[1]],lvDrawingManager:{schemaVersion:1,groups:[{id:'SYNTHETIC group',name:'SYNTHETIC group',memberIds:['SYNTHETIC second']}],templates:[]},future:'retained'});
  expect(f.history.peekUndo()!.workspace).toBe(before);expect(f.history.status().undo).toBe(1);expect(f.native.controller.history.undoStack).toBe(nativePast);expect(removed).toEqual([]);expect(Object.getPrototypeOf(f.native.controller)).toBe(nativePrototype);expect(Object.hasOwn(f.native.controller,'deleteMany')).toBe(false);expect(Object.getOwnPropertyDescriptor(nativePrototype,'deleteMany')).toStrictEqual(deleteMany);expect(f.intents.filter((row: {kind:string})=>row.kind==='delete')).toEqual([]);
  expect(f.state()).toMatchObject({holds:0,publications:1,notifications:1,quarantines:0});lease.finish();expect(f.input.erasing).toBe(false);
 }finally{stop();f.dispose();}
});
it('ERASER.COMPOSITION.DRAG accepted hit then empty sample then second hit creates two exact workspace history entries',async()=>{
 const f=await fixture();try{const initial=f.state().workspace,lease=f.begin();f.input.pointerDown(20,200);const first=f.state().workspace;
  f.input.pointerMove(390,10);lease.assertCurrent();expect(f.state().publications).toBe(1);f.input.pointerMove(120,280);lease.assertCurrent();const last=f.state().workspace;
  expect(f.document.all()).toEqual([]);expect(f.native.controller.all()).toEqual([]);expect(f.state()).toMatchObject({publications:2,notifications:2,holds:0});expect(f.history.status().undo).toBe(2);
  expect(f.history.undo(last,null)!.workspace).toBe(first);expect(f.history.undo(first,null)!.workspace).toBe(initial);expect(f.history.redo(initial,null)!.workspace).toBe(first);expect(f.history.redo(first,null)!.workspace).toBe(last);lease.finish();
 }finally{f.dispose();}
});
it('ERASER.COMPOSITION.CAPACITY a pre-forward workspace refusal leaves native/canonical/history intact and a new gesture can recover',async()=>{
 const f=await fixture();try{const before=f.state().workspace,lease=f.begin();f.prepare(()=>{throw Error('SYNTHETIC capacity refused');});expect(()=>f.input.pointerDown(20,200)).toThrow(/capacity/);
  expect(f.state().workspace).toBe(before);expect(f.document.all()).toStrictEqual(f.canonicalRows);expect(f.native.controller.all()).toHaveLength(2);expect(f.history.status().undo).toBe(0);expect(f.input.erasing).toBe(false);expect(()=>lease.assertCurrent()).toThrow();
  f.input.pointerMove(20,200);expect(f.state().publications).toBe(0);f.prepare(()=>{});const fresh=f.begin();f.input.pointerDown(20,200);expect(f.state().publications).toBe(1);fresh.cancel();
 }finally{f.dispose();}
});
it('ERASER.COMPOSITION.UNACKNOWLEDGED canonical/native acceptance without workspace publication is unsavable and not retried',async()=>{
 const f=await fixture();try{const saved=f.state().workspace,lease=f.begin();f.beforePublish(()=>{throw Error('SYNTHETIC publication refused');});let failure:unknown;try{f.input.pointerDown(20,200);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(DrawingErasePublicationError);expect((failure as DrawingErasePublicationError).receipt).toEqual({ids:['synthetic-annotation'],nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:false,observersComplete:false});
  expect(f.state().workspace).toBe(saved);expect(f.document.all()).toStrictEqual([f.canonicalRows[1]]);expect(f.native.controller.all().map((row:SerializedDrawing)=>row.id)).toEqual(['SYNTHETIC second']);expect(f.history.status().undo).toBe(0);expect(f.state()).toMatchObject({holds:0,publications:0,notifications:0,quarantines:1});expect(()=>f.publisher.captureReadOnly()).toThrow(/Reopen/);
  expect(()=>lease.assertCurrent()).toThrow();f.input.pointerMove(120,280);expect(f.document.all()).toHaveLength(1);expect(f.state().publications).toBe(0);
 }finally{f.dispose();}
});
it('ERASER.COMPOSITION.NOTIFY accepted publication followed by observer failure retains one history step and exact acknowledgement',async()=>{
 const f=await fixture();try{let readback:unknown;f.notify(()=>{readback=f.publisher.captureReadOnly();throw Error('SYNTHETIC observer failed');});const lease=f.begin();let failure:unknown;try{f.input.pointerDown(20,200);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(DrawingErasePublicationError);expect((failure as DrawingErasePublicationError).receipt).toEqual({ids:['synthetic-annotation'],nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:false});expect(readback).toStrictEqual(f.state().workspace.drawings);expect(f.history.status().undo).toBe(1);expect(f.state()).toMatchObject({publications:1,notifications:1,holds:0,quarantines:1});expect(f.input.erasing).toBe(false);expect(()=>lease.assertCurrent()).toThrow();
  f.input.pointerMove(120,280);expect(f.state().publications).toBe(1);expect(f.document.all()).toStrictEqual([f.canonicalRows[1]]);
 }finally{f.dispose();}
});
it('ERASER.COMPOSITION.SOURCE accepted notification source replacement receives no old quarantine or second hit',async()=>{
 const f=await fixture();try{f.notify(()=>f.retire());const lease=f.begin();let failure:unknown;try{f.input.pointerDown(20,200);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(DrawingErasePublicationError);expect((failure as DrawingErasePublicationError).receipt.workspaceAcknowledged).toBe(true);expect(f.state()).toMatchObject({publications:1,notifications:1,quarantines:0,holds:0});expect(f.history.status().undo).toBe(1);expect(f.errors).toEqual([]);expect(()=>lease.assertCurrent()).toThrow();f.input.pointerMove(120,280);expect(f.document.all()).toStrictEqual([f.canonicalRows[1]]);
 }finally{f.dispose();}
});
it('ERASER.COMPOSITION.FIB keeps the actual annotation-owned diagonal query inside one eraser publication',async()=>{
 const row=createDrawing('fibretracement',{id:'SYNTHETIC Fib',paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}],props:{lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:true},reverse:false,background:true,levels:[{ratio:.236,color:'#123456',enabled:true},{ratio:.618,color:'#abcdef',enabled:true}]}})!.serialize();
 const f=await fixture([row]);let baseline:ReturnType<typeof installFibTrendLine>|undefined;
 try{const renderer=f.paint.renderer as unknown as Record<string,any>,coords=f.paint.createNativeCoordinates();coords.setSize(400,300,1);coords.setBars([1000000,1120000,1240000]);coords.setViewport({barSpacing:100,rightOffset:0});const pane={id:'price',bounds:{top:0,height:300},scale:{min:0,max:300,log:false,invert:false},collapsed:false};
  Object.assign(renderer,{coords,theme:{fontFamily:'sans-serif',background:'#101010',textColor:'#ffffff'},scene:{panes:new Map([['price',pane]]),orderedPanes:()=>[pane]},bars:[]});f.input.deps.projector=()=>renderer.drawingProjector();
  baseline=installFibTrendLine(f.paint.renderer,f.chart as unknown as Vela,{document:f.document,captureOwner:f.captureOwner,captureNativeOwner:(canonical,projected,owner,source)=>captureFibTrendLineNativeOwner(f.facade,canonical,projected,owner,source),capturePresentationNativeOwner:(canonical,projected,owner,source)=>captureFibLevelPresentationNativeOwner(f.facade,canonical,projected,owner,source),captureLayoutOwner:(paneId,source)=>captureNativeInlineLayoutOwner(f.paint.renderer,paneId,source)});
  const annotationDelete=Object.getOwnPropertyDescriptor(f.input,'deleteAt'),lease=f.begin();f.input.pointerDown(300,150);
  expect(f.native.controller.all()).toEqual([]);expect(f.document.all()).toEqual([]);expect(f.state().publications).toBe(1);expect(f.receipts).toHaveLength(1);expect(baseline.diagnostics()).toEqual([]);expect(Object.getOwnPropertyDescriptor(f.input,'deleteAt')).toEqual(annotationDelete);lease.finish();
 }finally{baseline?.dispose();f.dispose();}
});

it('ERASER.COMPOSITION.CONTINUATION annotation keeps sole slot ownership and native dispatch is synchronous one-use',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();let retained:OwnedDrawingDeleteInvocation|undefined,twice:unknown;const before=Object.getOwnPropertyDescriptor(f.paint.controller,'deleteAt');
 const registration=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch(invocation){retained=invocation;const result=invocation.invoke();try{invocation.invoke();}catch(error){twice=error;}return result;}});
 try{expect(f.paint.controller.deleteAt(20,200)).toBe(true);expect(twice).toBeInstanceOf(Error);expect(()=>retained!.invoke()).toThrow();expect(()=>({...retained!}).invoke()).toThrow(/receiver/);expect(f.intents.filter((row:{kind:string})=>row.kind==='delete')).toHaveLength(1);expect(Object.getOwnPropertyDescriptor(f.paint.controller,'deleteAt')).toEqual(before);expect(()=>({...registration}).dispose()).toThrow(/receiver/);registration.assertCurrent();}
 finally{registration.dispose();f.dispose();}
});
it('ERASER.COMPOSITION.EXCLUSIVE refuses a foreign callback owner and preserves the genuine registration',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();const registration=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch:invocation=>invocation.invoke()});try{expect(()=>registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch:()=>false})).toThrow(/already/);registration.assertCurrent();expect(f.paint.controller.deleteAt(20,200)).toBe(true);}finally{registration.dispose();f.dispose();}
});
it('ERASER.COMPOSITION.DEFERRED cannot run an unforwarded retained query after a Promise result',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();let retained:OwnedDrawingDeleteInvocation|undefined;const registration=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch(invocation){retained=invocation;return Promise.resolve(false);}});
 try{expect(()=>f.paint.controller.deleteAt(20,200)).toThrow(/synchronous/);expect(()=>retained!.invoke()).toThrow(/retired/);expect(f.native.controller.all()).toHaveLength(1);expect(f.intents).toEqual([]);}finally{registration.dispose();f.dispose();}
});
it.each(['omitted','wrong result','forwarded Promise'] as const)('ERASER.COMPOSITION.RESULT refuses %s without a fallback or reusable native continuation',async kind=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();let retained:OwnedDrawingDeleteInvocation|undefined;
 const registration=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch(invocation){retained=invocation;if(kind==='omitted')return false;const result=invocation.invoke();return kind==='wrong result'?!result:Promise.resolve(result);}});
 try{expect(()=>f.paint.controller.deleteAt(20,200)).toThrow(/synchronous/);expect(f.native.controller.all()).toHaveLength(kind==='omitted'?1:0);expect(f.intents.filter((row:{kind:string})=>row.kind==='delete')).toHaveLength(kind==='omitted'?0:1);expect(()=>retained!.invoke()).toThrow();}finally{registration.dispose();f.dispose();}
});
it('ERASER.COMPOSITION.SOURCE_BEFORE_FORWARD rejects a source replacement inside dispatch before native deletion',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();const registration=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch(invocation){f.retire();return invocation.invoke();}});
 try{expect(()=>f.paint.controller.deleteAt(20,200)).toThrow(/retired/);expect(f.native.controller.all()).toHaveLength(1);expect(f.intents).toEqual([]);}finally{registration.dispose();f.dispose();}
});
it('ERASER.COMPOSITION.REGISTRATION replacement keeps its owner when old cleanup or continuation returns',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();let replacement:OwnedDrawingDeleteRegistration|undefined,retained:OwnedDrawingDeleteInvocation|undefined;
 const registration=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch(invocation){retained=invocation;registration.dispose();replacement=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch:current=>current.invoke()});return invocation.invoke();}});
 try{expect(()=>f.paint.controller.deleteAt(20,200)).toThrow(/changed/);expect(f.native.controller.all()).toHaveLength(1);registration.dispose();replacement!.assertCurrent();expect(()=>retained!.invoke()).toThrow();expect(f.paint.controller.deleteAt(20,200)).toBe(true);expect(f.intents.filter((row:{kind:string})=>row.kind==='delete')).toHaveLength(1);}finally{registration.dispose();replacement?.dispose();f.dispose();}
});
it('ERASER.COMPOSITION.ADMISSION reentrant descriptor inspection cannot overwrite an inner registration',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();let inner:OwnedDrawingDeleteRegistration|undefined,trapCalls=0;
 const hooks=new Proxy({dispatch:(invocation:OwnedDrawingDeleteInvocation)=>invocation.invoke()},{getOwnPropertyDescriptor(target,key){if(key==='dispatch'&&++trapCalls===1)inner=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch:invocation=>invocation.invoke()});return Reflect.getOwnPropertyDescriptor(target,key);}});
 try{expect(()=>registerOwnedDrawingDeleteDispatch(f.paint.renderer,hooks)).toThrow(/reentrantly/);expect(trapCalls).toBe(1);inner!.assertCurrent();expect(f.paint.controller.deleteAt(20,200)).toBe(true);}finally{inner?.dispose();f.dispose();}
});
it('ERASER.COMPOSITION.CALLBACK_ABA an observed callback replacement cannot revive the retired registration',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();const original=(invocation:OwnedDrawingDeleteInvocation)=>invocation.invoke(),hooks={dispatch:original};const registration=registerOwnedDrawingDeleteDispatch(f.paint.renderer,hooks);
 try{hooks.dispatch=()=>false;expect(()=>registration.assertCurrent()).toThrow(/changed/);hooks.dispatch=original;expect(()=>registration.assertCurrent()).toThrow(/changed/);expect(()=>f.paint.controller.deleteAt(20,200)).toThrow(/changed/);expect(f.native.controller.all()).toHaveLength(1);}finally{registration.dispose();f.dispose();}
});
it('ERASER.COMPOSITION.NESTED a caught nested query attempt cannot reuse the outer native continuation',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();let nested:unknown;const registration=registerOwnedDrawingDeleteDispatch(f.paint.renderer,{dispatch(invocation){try{f.paint.controller.deleteAt(20,200);}catch(error){nested=error;}return invocation.invoke();}});
 try{expect(()=>f.paint.controller.deleteAt(20,200)).toThrow(/retired/);expect(nested).toBeInstanceOf(Error);expect(f.native.controller.all()).toHaveLength(1);expect(f.intents).toEqual([]);}finally{registration.dispose();f.dispose();}
});
