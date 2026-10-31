import {expect,it} from 'vitest';
import {NativeDrawingResetPublicationError} from '../../src/chart/native-drawing-reset-publication';
import {resetAdapterFixture} from './native-drawing-reset-adapter-harness';

it('actual Reset adapter saves the accepted canonical document without reconciliation and produces one history step',async()=>{
 for(const count of [1,2]){const f=await resetAdapterFixture(count);try{
  let saved:unknown;f.subscribe(()=>{saved=f.save();return true;});
  f.open().actions.resetSettings();const after=f.document.serialize();
  expect(saved).toEqual(after);expect(f.state()).toEqual({notifications:1,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0,analysisUnavailable:''});
  expect(f.document.all().every((row:any)=>!row.text)).toBe(true);
  expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(f.rows);expect(f.document.undo()).toBe(false);expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(after);
  expect(f.core.controller.history.undoStack).toHaveLength(1);
  f.open().actions.resetSettings();expect(f.state().notifications).toBe(1);expect(f.document.serialize()).toEqual(after);
  expect(f.publisher.captureReadOnly()).toBeUndefined();f.save();expect(f.state().reconciliations).toBe(1);
 }finally{f.dispose();}}
});
it('actual Reset adapter preserves accepted state and history for false or throwing workspace observers',async()=>{
 for(const mode of ['false','throw']){const f=await resetAdapterFixture();try{
  let saved:unknown,siblings=0;f.subscribe(()=>{saved=f.save();if(mode==='throw')throw Error('SYNTHETIC persistence failure');return false;});f.subscribe(()=>{siblings++;});
  expect(()=>f.open().actions.resetSettings()).toThrow(NativeDrawingResetPublicationError);
  expect(saved).toEqual(f.document.serialize());expect(siblings).toBe(1);expect(f.document.all()[0].text).toBeUndefined();expect(f.document.undo()).toBe(true);
  expect(f.state()).toMatchObject({drawingBatch:0,nativeDrawingReconciliationHold:0,reconciliations:0});expect(f.state().analysisUnavailable).toContain('accepted');
  expect(f.publisher.captureReadOnly()).toBeUndefined();
 }finally{f.dispose();}}
});
it('actual adapter keeps accepted A when final save opens replacement popup B and does not quarantine B',async()=>{
 const f=await resetAdapterFixture(2);try{
  let b:any;f.subscribe(()=>{f.save();b=f.open([f.rows[1].id]);return true;});
  expect(()=>f.open([f.rows[0].id]).actions.resetSettings()).toThrow();
  expect(f.latest()).toBe(b);expect(f.document.all()[0].text).toBeUndefined();expect(f.document.all()[1].text).toEqual(f.rows[1].text);
  expect(f.state().analysisUnavailable).toBe('');expect(f.document.undo()).toBe(true);expect(f.publisher.captureReadOnly()).toBeUndefined();
 }finally{f.dispose();}
});
it('actual adapter does not overwrite replacement canonical state during an accepted publication tail',async()=>{
 const f=await resetAdapterFixture();try{
  const replacement={...f.document.serialize(),futureDocument:{label:'SYNTHETIC replacement'}};
  f.subscribe(()=>{f.document.load(replacement);return true;});
  expect(()=>f.open().actions.resetSettings()).toThrow();
  expect(f.document.serialize()).toEqual(replacement);expect(f.document.undo()).toBe(false);expect(f.state().analysisUnavailable).toBe('');
  expect(f.state()).toMatchObject({drawingBatch:0,nativeDrawingReconciliationHold:0});
 }finally{f.dispose();}
});
it('actual adapter source replacement during final notify retires readonly saves and does not quarantine the new source',async()=>{
 const f=await resetAdapterFixture();try{
  let blocked=false;f.subscribe(()=>{f.retire();try{f.save();}catch{blocked=true;}return true;});
  expect(()=>f.open().actions.resetSettings()).toThrow();expect(blocked).toBe(true);
  expect(f.state()).toMatchObject({reconciliations:0,analysisUnavailable:'',drawingBatch:0,nativeDrawingReconciliationHold:0});
  expect(f.document.all()[0].text).toBeUndefined();
 }finally{f.dispose();}
});
it('actual adapter rejects pending/queued mutations before changing core, canonical or history',async()=>{
 for(const kind of ['pending','queue']){const f=await resetAdapterFixture();try{
  const before=f.document.serialize(),popup=f.open();f[kind](true);
  expect(()=>popup.actions.resetSettings()).toThrow('unavailable');expect(f.document.serialize()).toEqual(before);expect(f.core.controller.canUndo()).toBe(false);
  expect(f.state()).toMatchObject({notifications:0,drawingBatch:0,nativeDrawingReconciliationHold:0});
 }finally{f.dispose();}}
});
it('actual adapter does not roll back an uncertain partial native forward',async()=>{
 const f=await resetAdapterFixture(2);try{
  const update=f.core.controller.updateDrawing.bind(f.core.controller);let calls=0;
  f.core.controller.updateDrawing=(id:string,patch:any)=>{if(++calls===2)throw Error('SYNTHETIC partial forward');return update(id,patch);};
  expect(()=>f.open().actions.resetSettings()).toThrow();
  expect(f.document.all().every((row:any)=>!row.text)).toBe(true);expect(f.core.controller.all().filter((row:any)=>!row.text)).toHaveLength(1);
  expect(f.state()).toMatchObject({notifications:0,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0});
  expect(f.state().analysisUnavailable).toContain('may be partial');expect(f.document.undo()).toBe(true);
 }finally{f.dispose();}
});
it('actual adapter missing portable binding fails without making a canonical history entry',async()=>{
 const f=await resetAdapterFixture();try{
  const before=f.document.serialize();delete (before.drawings as any[])[0].lvPaneBinding;f.document.load(before);
  expect(()=>f.open().actions.resetSettings()).toThrow('portable pane binding');expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
  expect(f.state()).toMatchObject({notifications:0,drawingBatch:0,nativeDrawingReconciliationHold:0});
 }finally{f.dispose();}
});
