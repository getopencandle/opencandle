import {expect,it} from 'vitest';
import {DrawingErasePublicationError} from '../../src/chart/drawing-erase-publication';
import {drawingErasePublicationFixture as fixture} from './drawing-erase-publication-harness';

it('removes one native/canonical row and group membership with one workspace Undo step',async()=>{
 const f=await fixture();try{
  const before=f.state().workspace,nativeHistory=f.native.controller.history.undoStack;
  const receipt=f.run();expect(receipt).toEqual({ids:['SYNTHETIC-a'],nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});
  expect(f.document.all()).toEqual([f.rows[1]]);expect(f.native.controller.all().map((row:any)=>row.id)).toEqual(['SYNTHETIC-b']);
  expect(f.document.serialize().lvDrawingManager).toEqual({schemaVersion:1,groups:[{id:'SYNTHETIC-group',name:'SYNTHETIC group',memberIds:['SYNTHETIC-b'],future:'preserve'}],templates:[]});
  expect(Object.hasOwn((f.document.all()[0].future as any),'absent')).toBe(true);expect(Object.is((f.document.all()[0].future as any).zero,-0)).toBe(true);
  expect(f.native.controller.history.undoStack).toBe(nativeHistory);expect(f.native.selection()).toEqual([]);expect(f.state()).toMatchObject({holds:0,notifications:1,quarantines:0});
  expect(f.history.status().undo).toBe(1);const accepted=f.state().workspace;expect(f.history.undo(accepted,null)!.workspace).toBe(before);expect(f.history.redo(before,null)!.workspace).toBe(accepted);
  expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(f.rows);expect(f.document.redo()).toBe(true);expect(f.document.all()).toEqual([f.rows[1]]);
 }finally{f.dispose();}
});

it('rejects full-workspace capacity before native mutation and keeps canonical/history unchanged',async()=>{
 const f=await fixture();try{const before=f.document.serialize(),saved=f.state().workspace;f.prepare(()=>{throw Error('SYNTHETIC capacity');});expect(f.run).toThrow(/capacity/);expect(f.document.serialize()).toEqual(before);expect(f.native.controller.all()).toHaveLength(2);expect(f.state().workspace).toBe(saved);expect(f.history.status().undo).toBe(0);expect(f.state()).toMatchObject({holds:0,notifications:0,quarantines:0});}finally{f.dispose();}
});

it.each(['locked','hidden','selected'] as const)('refuses %s target state without changing native membership',async state=>{
 const f=await fixture();try{if(state==='selected')f.native.controller.select([f.rows[0].id]);else f.eligible(()=>{throw Error('SYNTHETIC '+state);});expect(f.run).toThrow();expect(f.native.controller.all()).toHaveLength(2);expect(f.document.all()).toEqual(f.rows);expect(f.history.status().undo).toBe(0);}finally{f.dispose();}
});

it('refuses equal-value canonical replacement during eligibility without writing the replacement',async()=>{
 const f=await fixture();try{f.eligible(()=>f.document.load(f.document.serialize()));expect(f.run).toThrow(/retired|changed/);expect(f.native.controller.all()).toHaveLength(2);expect(f.document.all()).toEqual(f.rows);expect(f.history.status().undo).toBe(0);expect(f.state().quarantines).toBe(0);}finally{f.dispose();}
});

it('blocks staging and pre-ack captures; final notification sees the exact acknowledged candidate',async()=>{
 const f=await fixture();try{let staging:unknown,preAck:unknown,accepted:unknown;const sync=f.native.controller.port.syncDrawings;
  f.native.controller.port.syncDrawings=(rows:any)=>{try{f.publisher.captureReadOnly();}catch(error){staging=error;}sync(rows);};
  f.beforeWrite(()=>{try{f.publisher.captureReadOnly();}catch(error){preAck=error;}});f.notify(()=>{accepted=f.publisher.captureReadOnly();});
  f.run();expect(staging).toBeInstanceOf(Error);expect(preAck).toBeInstanceOf(Error);expect(accepted).toEqual(f.state().workspace.drawings);expect(f.history.status().undo).toBe(1);expect(f.publisher.captureReadOnly()).toBeUndefined();
 }finally{f.dispose();}
});

it('records partial native failure without saving it or inventing a rollback',async()=>{
 const f=await fixture();try{const saved=f.state().workspace,sync=f.native.controller.port.syncDrawings;f.native.controller.port.syncDrawings=(rows:any)=>{sync(rows);throw Error('SYNTHETIC sync failure');};let error:unknown;try{f.run();}catch(cause){error=cause;}
  expect(error).toBeInstanceOf(DrawingErasePublicationError);expect((error as DrawingErasePublicationError).receipt).toMatchObject({nativeState:'forwarded-incomplete',workspaceAcknowledged:false,canonicalAccepted:false});expect(f.state().workspace).toBe(saved);expect(f.history.status().undo).toBe(0);expect(f.state()).toMatchObject({holds:0,notifications:0,quarantines:1});expect(()=>f.publisher.captureReadOnly()).toThrow();
 }finally{f.dispose();}
});

it.each(['throw','double','missing'] as const)('preserves consumed workspace outcome on %s acknowledgement path',async mode=>{
 const f=await fixture();try{if(mode==='throw')f.afterWrite(()=>{throw Error('SYNTHETIC after acknowledgement');});else f.ack(mode);let error:unknown;try{f.run();}catch(cause){error=cause;}
  expect(error).toBeInstanceOf(DrawingErasePublicationError);expect((error as DrawingErasePublicationError).receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:mode!=='missing',observersComplete:false});expect(f.state().workspace.drawings.drawings).toHaveLength(1);expect(f.history.status().undo).toBe(1);expect(f.state().holds).toBe(0);expect(()=>f.retainedAck()()).toThrow(/late|repeated/);
 }finally{f.dispose();}
});
