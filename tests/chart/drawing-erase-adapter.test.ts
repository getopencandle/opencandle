import {expect,it,vi} from 'vitest';
import {duplicateAdapterFixture} from './drawing-duplicate-adapter-harness';
import {annotationRecord} from './trendline-annotation-native-harness';

// Executes the current adapter block with the installed native facade, hit-test,
// annotation and store bodies. Construction services are controlled, not GUI.
const row=(id='SYNTHETIC-A')=>({...annotationRecord(),id,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}}});
function bind(f:Awaited<ReturnType<typeof duplicateAdapterFixture>>){f.controller.bindDrawingWorkspaceHost(f.host);}
it('ERASER.ADAPTER.ARM uses the native mode, selection and focus route without drawing/history publication',async()=>{
 const f=await duplicateAdapterFixture([row()] as any);try{bind(f);f.f.native.controller.setSelection(['SYNTHETIC-A']);const prior=f.f.document.serialize();f.controller.setDrawingMode('eraser');
  expect(f.f.facade.getMode()).toBe('eraser');expect(f.f.paint.controller.eraserMode).toBe(true);expect(f.f.native.selection()).toEqual([]);expect(f.focuses()).toBe(1);expect(f.f.document.serialize()).toEqual(prior);expect(f.history.status().undo).toBe(0);expect(f.state().notifications).toBe(0);
  f.controller.setDrawingMode(null);expect(f.f.facade.getMode()).toBe(null);expect(f.f.paint.controller.eraserMode).toBe(false);expect(f.focuses()).toBe(1);
 }finally{f.dispose();}
});
it('ERASER.ADAPTER.DRAG publishes two exact native hits as two workspace history entries with one notification each',async()=>{
 const a=row(),b={...row('SYNTHETIC-B'),anchors:[{time:1100000,price:20},{time:1200000,price:20}]},f=await duplicateAdapterFixture([a,b] as any);try{bind(f);const original=f.workspace(),nativeHistory=f.f.native.controller.history.undoStack;f.controller.setDrawingMode('eraser');const lease=f.controller.beginDrawingEraseGesture(()=>{}),input=f.f.paint.renderer.input;input.dragging=true;input.region='drawing';
  f.f.paint.controller.pointerDown(20,200);lease.assertCurrent();expect(f.workspace().drawings.drawings.map((x:any)=>x.id)).toEqual(['SYNTHETIC-B']);expect(f.history.status().undo).toBe(1);expect(f.savedDuringPublish()).toEqual(f.workspace().drawings);
  f.f.paint.controller.pointerMove(120,280);expect(f.workspace().drawings.drawings).toEqual([]);expect(f.f.document.all()).toEqual([]);expect(f.f.native.controller.all()).toEqual([]);expect(f.history.status().undo).toBe(2);expect(f.state()).toMatchObject({notifications:2,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0,analysisUnavailable:''});expect(f.f.native.controller.history.undoStack).toBe(nativeHistory);
  f.f.paint.controller.pointerUp(120,280);input.dragging=false;lease.finish();f.controller.setDrawingMode(null);const first=f.history.undo(f.workspace(),null)!.workspace;expect(first.drawings.drawings.map((x:any)=>x.id)).toEqual(['SYNTHETIC-B']);expect(f.history.undo(first,null)!.workspace).toBe(original);
 }finally{f.dispose();}
});
it.each(['pending','queue','inline','drag','touch','editor','placing','unavailable'] as const)('ERASER.ADAPTER.ARM refuses %s before changing native mode',async kind=>{
 const f=await duplicateAdapterFixture([row()] as any);try{bind(f);const input=f.f.paint.renderer.input,native=f.f.paint.controller;
  if(kind==='drag')input.dragging=true;else if(kind==='touch')input.touches.set(5,{});else if(kind==='editor')native.textEditor={};else if(kind==='placing')native.interaction.state={kind:'placing'};else f[kind](true);
  expect(()=>f.controller.setDrawingMode('eraser')).toThrow();expect(f.f.facade.getMode()).toBe(null);expect(native.eraserMode).toBe(false);expect(f.focuses()).toBe(0);expect(f.history.status().undo).toBe(0);expect(f.f.document.ids()).toEqual(['SYNTHETIC-A']);
 }finally{f.dispose();}
});
it('ERASER.ADAPTER.FOCUS does not focus after a mode observer replaces its chart source',async()=>{
 const f=await duplicateAdapterFixture([row()] as any);try{bind(f);f.f.native.on('drawing:mode',()=>f.retire());expect(()=>f.controller.setDrawingMode('eraser')).toThrow(/owner changed|source/);expect(f.focuses()).toBe(0);expect(f.f.facade.getMode()).toBe('eraser');expect(f.history.status().undo).toBe(0);}finally{f.dispose();}
});
it('ERASER.ADAPTER.QUOTA refuses the actual pointer hit before native mutation and keeps canonical/workspace data',async()=>{
 const f=await duplicateAdapterFixture([row()] as any);try{bind(f);f.controller.setDrawingMode('eraser');const before=f.workspace(),lease=f.controller.beginDrawingEraseGesture(()=>{});f.prepare(()=>{throw Error('SYNTHETIC quota');});expect(()=>f.f.paint.controller.pointerDown(20,200)).toThrow('quota');expect(f.workspace()).toBe(before);expect(f.controller.saveDrawings()).toEqual(before.drawings);expect(f.f.native.controller.all()).toHaveLength(1);expect(f.history.status().undo).toBe(0);expect(f.state().notifications).toBe(0);expect(f.f.paint.controller.erasing).toBe(false);expect(()=>lease.assertCurrent()).toThrow();}finally{f.dispose();}
});
it('ERASER.ADAPTER.PARTIAL blocks Save after forwarded sync failure and retains authoritative workspace',async()=>{
 const f=await duplicateAdapterFixture([row()] as any);try{bind(f);f.controller.setDrawingMode('eraser');const before=f.workspace();f.controller.beginDrawingEraseGesture(()=>{});f.f.native.controller.port.syncDrawings=()=>{throw Error('SYNTHETIC sync failure');};expect(()=>f.f.paint.controller.pointerDown(20,200)).toThrow('sync failure');expect(f.workspace()).toBe(before);expect(f.history.status().undo).toBe(0);expect(f.f.native.controller.all()).toEqual([]);expect(()=>f.controller.saveDrawings()).toThrow();expect(f.state().analysisUnavailable).not.toBe('');}finally{f.dispose();}
});
it('ERASER.ADAPTER.HISTORY requires exiting the eraser before invoking workspace Undo',async()=>{
 const f=await duplicateAdapterFixture([row()] as any);try{bind(f);f.controller.setDrawingMode('eraser');expect(()=>f.f.facade.undo()).toThrow('Press Escape or choose Cursor before using Undo or Redo with the eraser.');expect(f.historyDispatches).toEqual([]);f.controller.setDrawingMode(null);f.f.facade.undo();expect(f.historyDispatches).toEqual(['undo']);}finally{f.dispose();}
});
