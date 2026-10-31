import {expect,it} from 'vitest';
import {duplicateAdapterFixture} from './drawing-duplicate-adapter-harness';
import {annotationRecord} from './trendline-annotation-native-harness';

// Executes the current adapter history guard (extracted from src/chart/adapter.ts by the
// shared Duplicate harness) through the installed native facade. Controlled workspace,
// no DOM, keyboard dispatch or GUI claim.
const ERASER_REFUSAL='Press Escape or choose Cursor before using Undo or Redo with the eraser.';
const row=()=>({...annotationRecord(),id:'SYNTHETIC-A',lvPaneBinding:{schemaVersion:1,target:{kind:'price'}}});
async function armed(){const f=await duplicateAdapterFixture([row()] as any);f.controller.bindDrawingWorkspaceHost(f.host);f.controller.setDrawingMode('eraser');return f;}

it.each(['undo','redo'] as const)('ERASER.UNDO_MESSAGE %s in eraser mode shows the eraser exit instruction and dispatches nothing',async direction=>{
 const f=await armed();try{
  expect(()=>f.f.facade[direction]()).toThrow(ERASER_REFUSAL);
  expect(f.historyDispatches).toEqual([]);expect(f.f.facade.getMode()).toBe('eraser');
  f.controller.setDrawingMode(null);f.f.facade[direction]();expect(f.historyDispatches).toEqual([direction]);
 }finally{f.dispose();}
});
it('ERASER.UNDO_MESSAGE a genuine native drag keeps the gesture/editor message even while the eraser is armed',async()=>{
 const f=await armed();try{
  const input=f.f.paint.renderer.input;input.dragging=true;
  expect(()=>f.f.facade.undo()).toThrow('Finish the active native gesture or text editor before drawing history.');
  expect(f.historyDispatches).toEqual([]);input.dragging=false;
  expect(()=>f.f.facade.undo()).toThrow(ERASER_REFUSAL);
 }finally{f.dispose();}
});
it('ERASER.UNDO_MESSAGE an open native text editor without the eraser keeps the gesture/editor message',async()=>{
 const f=await duplicateAdapterFixture([row()] as any);try{
  f.controller.bindDrawingWorkspaceHost(f.host);f.f.paint.controller.textEditor={};
  expect(()=>f.f.facade.undo()).toThrow('Finish the active native gesture or text editor before drawing history.');
  expect(f.historyDispatches).toEqual([]);
 }finally{f.dispose();}
});
