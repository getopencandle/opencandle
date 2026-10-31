import {expect,it} from 'vitest';
import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingDuplicatePublisher,DrawingDuplicatePublicationError,type DrawingDuplicatePublicationHost} from '../../src/chart/drawing-duplicate-publication';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {nativeDrawingHarness} from './drawing-native-harness';

import {drawingDuplicatePublicationFixture as fixture} from './drawing-duplicate-publication-harness';

it.each([1,2])('copies %i actual native drawings with exact canonical metadata and one workspace history step',async count=>{
 const f=await fixture(count);try{
  const before=f.state().workspace,prior={drawings:{version:1,drawings:[]}};f.history.record(prior,null);
  const nativeHistory=f.native.controller.history.undoStack,receipt=f.run();
  expect(receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});
  expect(receipt.ids).toHaveLength(count);expect(f.native.selection()).toEqual(receipt.ids);
  expect(f.native.controller.history.undoStack).toBe(nativeHistory);
  expect(f.state()).toMatchObject({holds:0,notifications:1,quarantines:0});
  const copies=f.document.all().slice(count),saved=f.state().workspace.drawings.drawings as any[];
  for(let index=0;index<count;index++){
   expect(copies[index]).toEqual({...f.rows[index],id:receipt.ids[index],zIndex:Math.ceil(count-0.5)+index+1});
   expect(Object.hasOwn((copies[index] as any).future,'absent')).toBe(true);expect(Object.is((copies[index] as any).future.zero,-0)).toBe(true);
   expect(Object.hasOwn(saved[count+index].future,'absent')).toBe(true);expect(Object.is(saved[count+index].future.zero,-0)).toBe(true);
  }
  expect(f.history.status().undo).toBe(2);const accepted=f.state().workspace;
  expect(f.history.undo(accepted,null)?.workspace).toBe(before);
  const redone=f.history.redo(before,null)!.workspace;expect(redone).toBe(accepted);expect(redone.drawings.drawings.slice(count).map((row:any)=>row.id)).toEqual(receipt.ids);
  expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(f.rows);expect(f.document.redo()).toBe(true);expect(f.document.all().slice(count)).toEqual(copies);
  expect(f.publisher.captureReadOnly()).toBeUndefined();
 }finally{f.dispose();}
});

it('rejects complete workspace capacity before native insertion or canonical/history changes',async()=>{
 const f=await fixture();try{const before=f.document.serialize(),nativeBefore=f.native.controller.toJSON();f.prepare(()=>{throw Error('Synthetic whole workspace quota');});
  expect(f.run).toThrow(/quota/);expect(f.document.serialize()).toEqual(before);expect(f.native.controller.toJSON()).toEqual(nativeBefore);
  expect(f.history.status().undo).toBe(0);expect(f.state()).toMatchObject({holds:0,notifications:0,quarantines:0});
 }finally{f.dispose();}
});

it('refuses equal canonical replacement during allocation and rejects nested commands before callbacks',async()=>{
 const f=await fixture();try{
  let nested=0;f.allocate(()=>{expect(()=>f.publisher.duplicate(f.selected,()=>{nested++;})).toThrow(/already/);f.document.load(f.document.serialize());return 'SYNTHETIC-copy';});
  expect(f.run).toThrow(/retired|changed/);expect(nested).toBe(0);expect(f.native.controller.all()).toHaveLength(1);expect(f.history.status().undo).toBe(0);
 }finally{f.dispose();}
});

it('throws for staging saves and supplies exact accepted capture without another reconciliation/history entry',async()=>{
 const f=await fixture();try{
  const original=f.native.controller.port.syncDrawings;let staging=0,accepted:any;
  f.native.controller.port.syncDrawings=(rows:SerializedDrawing[])=>{staging++;expect(()=>f.publisher.captureReadOnly()).toThrow(/staging/);original(rows);};
  f.beforeWrite(()=>{accepted=f.publisher.captureReadOnly();});
  f.notify(()=>expect(f.publisher.captureReadOnly()).toEqual(f.state().workspace.drawings));
  const receipt=f.run();expect(staging).toBe(1);expect(accepted.drawings.map((row:any)=>row.id)).toEqual([...f.selected,...receipt.ids]);expect(f.history.status().undo).toBe(1);
  expect(Object.hasOwn(accepted.drawings[1].future,'absent')).toBe(true);
 }finally{f.dispose();}
});

it('retains explicit partial native state and never guesses rollback after sync throws',async()=>{
 const f=await fixture(2);try{
  const saved=f.state().workspace,original=f.native.controller.port.syncDrawings;let syncs=0;
  f.native.controller.port.syncDrawings=(rows:SerializedDrawing[])=>{syncs++;original(rows);throw Error('Synthetic native sync failure');};
  let error:unknown;try{f.run();}catch(cause){error=cause;}
  expect(error).toBeInstanceOf(DrawingDuplicatePublicationError);expect((error as DrawingDuplicatePublicationError).receipt).toMatchObject({nativeState:'forwarded-incomplete',canonicalAccepted:false,workspaceAcknowledged:false,observersComplete:false});
  expect(syncs).toBe(1);expect(f.native.controller.all()).toHaveLength(3);expect(f.document.all()).toHaveLength(4);
  expect(f.state().workspace).toBe(saved);expect(f.state()).toMatchObject({holds:0,notifications:0,quarantines:1});expect(f.history.status().undo).toBe(0);
 }finally{f.dispose();}
});

it.each(['throw','double','missing'] as const)('preserves canonical acceptance and distinguishes workspace acknowledgement on %s',async mode=>{
 const f=await fixture();try{
  if(mode==='throw')f.afterWrite(()=>{throw Error('Synthetic observer after workspace write');});else f.ack(mode);
  let error:unknown;try{f.run();}catch(cause){error=cause;}
  expect(error).toBeInstanceOf(DrawingDuplicatePublicationError);
  expect((error as DrawingDuplicatePublicationError).receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:mode!=='missing',observersComplete:false});
  expect(f.document.all()).toHaveLength(2);expect(f.state().workspace.drawings.drawings).toHaveLength(2);expect(f.history.status().undo).toBe(1);expect(f.state().holds).toBe(0);
 }finally{f.dispose();}
});

it('retires late acknowledgement and suppresses stale quarantine after source replacement',async()=>{
 const f=await fixture();try{
  f.afterWrite(()=>{f.retire();throw Error('Synthetic replaced source');});
  let error:unknown;try{f.run();}catch(cause){error=cause;}
  expect((error as DrawingDuplicatePublicationError).receipt.workspaceAcknowledged).toBe(true);
  expect(()=>f.retainedAck()()).toThrow(/late|repeated/);expect(f.state()).toMatchObject({holds:0,quarantines:0,notifications:0});expect(f.native.selection()).toEqual(f.selected);
 }finally{f.dispose();}
});
