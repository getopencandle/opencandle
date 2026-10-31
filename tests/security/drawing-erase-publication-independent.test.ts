import {expect,it} from 'vitest';
import {DrawingErasePublicationError} from '../../src/chart/drawing-erase-publication';
import {drawingErasePublicationFixture as fixture} from '../chart/drawing-erase-publication-harness';

// Actual installed native controller and the shared prepared-workspace fixture.
// No private implementation copies, GUI claim or new native extraction path.
// Capture callback errors first; assert outside callbacks production may catch.
function failure(action:()=>unknown):DrawingErasePublicationError{
 let caught:unknown;try{action();}catch(error){caught=error;}
 expect(caught).toBeInstanceOf(DrawingErasePublicationError);return caught as DrawingErasePublicationError;
}

it('two accepted distinct hits create two exact workspace steps and retain the emptied group',async()=>{
 const f=await fixture();try{
  const first=f.state().workspace;f.run('SYNTHETIC-a');const second=f.state().workspace;f.run('SYNTHETIC-b');const third=f.state().workspace;
  expect(f.document.all()).toEqual([]);expect(f.native.controller.all()).toEqual([]);expect(f.native.selection()).toEqual([]);
  expect(f.document.serialize().lvDrawingManager).toEqual({schemaVersion:1,groups:[{id:'SYNTHETIC-group',name:'SYNTHETIC group',memberIds:[],future:'preserve'}],templates:[]});
  expect(f.history.status()).toMatchObject({undo:2,redo:0});expect(f.state()).toMatchObject({holds:0,notifications:2,quarantines:0});
  expect(f.history.undo(third,null)?.workspace).toBe(second);expect(f.history.undo(second,null)?.workspace).toBe(first);
  expect(f.history.redo(first,null)?.workspace).toBe(second);expect(f.history.redo(second,null)?.workspace).toBe(third);
 }finally{f.dispose();}
});

it('repeating the already erased target refuses without a second write, notification or Undo step',async()=>{
 const f=await fixture();try{
  f.run();const accepted=f.state().workspace,error=failure(()=>f.run());
  expect(error.receipt).toMatchObject({nativeState:'before-forward',canonicalAccepted:false,workspaceAcknowledged:false,observersComplete:false});
  expect(f.state().workspace).toBe(accepted);expect(f.history.status()).toMatchObject({undo:1,redo:0});expect(f.state()).toMatchObject({holds:0,notifications:1,quarantines:0});
  expect(f.document.all()).toEqual([f.rows[1]]);expect(f.publisher.captureReadOnly()).toBeUndefined();
 }finally{f.dispose();}
});

it('source retirement during complete-workspace preparation cannot mutate or quarantine its replacement',async()=>{
 const f=await fixture();try{
  const before=f.document.serialize(),workspace=f.state().workspace;f.prepare(f.retire);const error=failure(f.run);
  expect(error.receipt).toMatchObject({nativeState:'before-forward',canonicalAccepted:false,workspaceAcknowledged:false});
  expect(f.document.serialize()).toEqual(before);expect(f.native.controller.all().map((row:{id:string})=>row.id)).toEqual(['SYNTHETIC-a','SYNTHETIC-b']);
  expect(f.state().workspace).toBe(workspace);expect(f.history.status().undo).toBe(0);expect(f.state()).toMatchObject({holds:0,notifications:0,quarantines:0});
 }finally{f.dispose();}
});

for(const phase of ['before acknowledgement','after acknowledgement','final notification'] as const)it('equal-value canonical replacement '+phase+' retires old quarantine and capture authority',async()=>{
 const f=await fixture();try{
  const before=f.state().workspace;let replacement:Record<string,unknown>|undefined;
  const replace=()=>{replacement=f.document.serialize();f.document.load(replacement);if(phase==='before acknowledgement')throw Error('SYNTHETIC replaced before write');};
  if(phase==='before acknowledgement')f.beforeWrite(replace);else if(phase==='after acknowledgement')f.afterWrite(replace);else f.notify(replace);
  const error=failure(f.run);expect(replacement).toBeDefined();expect(f.document.serialize()).toEqual(replacement);
  expect(error.receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:phase!=='before acknowledgement',observersComplete:false});
  expect(f.state().workspace===before).toBe(phase==='before acknowledgement');expect(f.history.status().undo).toBe(phase==='before acknowledgement'?0:1);
  expect(f.state().holds).toBe(0);expect(f.state().quarantines).toBe(0);expect(f.publisher.captureReadOnly()).toBeUndefined();
 }finally{f.dispose();}
});

for(const phase of ['native forwarding','before acknowledgement','after acknowledgement'] as const)it('retired pointer action '+phase+' cannot release the still-owned failed capture barrier',async()=>{
 const f=await fixture();try{
  const before=f.state().workspace;let actionCurrent=true;const action=()=>{if(!actionCurrent)throw Error('SYNTHETIC pointer ended');};
  if(phase==='native forwarding'){
   const sync=f.native.controller.port.syncDrawings;f.native.controller.port.syncDrawings=(rows:unknown)=>{sync(rows);actionCurrent=false;throw Error('SYNTHETIC interrupted after native mutation');};
  }else if(phase==='before acknowledgement')f.beforeWrite(()=>{actionCurrent=false;throw Error('SYNTHETIC pointer ended before write');});
  else f.afterWrite(()=>{actionCurrent=false;});
  const error=failure(()=>f.publisher.erase('SYNTHETIC-a',action));
  expect(error.receipt).toMatchObject({nativeState:phase==='native forwarding'?'forwarded-incomplete':'complete',canonicalAccepted:phase!=='native forwarding',workspaceAcknowledged:phase==='after acknowledgement',observersComplete:false});
  expect(f.native.controller.all().map((row:{id:string})=>row.id)).toEqual(['SYNTHETIC-b']);expect(f.document.all()).toEqual([f.rows[1]]);
  expect(f.state().workspace===before).toBe(phase!=='after acknowledgement');expect(f.history.status().undo).toBe(phase==='after acknowledgement'?1:0);
  expect(f.state().holds).toBe(0);expect(f.state().quarantines).toBe(0);
  expect(()=>f.publisher.captureReadOnly()).toThrow(/failed|reopen/i);expect(()=>f.publisher.erase('SYNTHETIC-b',()=>{})).toThrow(/reopen/i);
  expect(f.state().workspace===before).toBe(phase!=='after acknowledgement');
 }finally{f.dispose();}
});

it('a replaced canonical/native document can start a new hit without an unrelated capture clearing the old failed frame',async()=>{
 const f=await fixture();try{
  const before=f.document.serialize(),sync=f.native.controller.port.syncDrawings;f.native.controller.port.syncDrawings=(rows:unknown)=>{sync(rows);throw Error('SYNTHETIC first interrupted frame');};
  const error=failure(f.run);expect(error.receipt.nativeState).toBe('forwarded-incomplete');expect(f.history.status().undo).toBe(0);
  f.native.controller.port.syncDrawings=sync;f.document.load(before);f.native.controller.fromJSON({version:1,drawings:f.rows});
  // No captureReadOnly call occurs between replacement and this new action.
  const receipt=f.run();expect(receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});
  expect(f.state().workspace.drawings.drawings).toEqual([f.rows[1]]);expect(f.history.status().undo).toBe(1);expect(f.state().holds).toBe(0);
 }finally{f.dispose();}
});

it('a retained acknowledgement cannot acknowledge the following hit or unblock its failed frame',async()=>{
 const f=await fixture();try{
  f.run();const first=f.state().workspace,oldAck=f.retainedAck();f.beforeWrite(oldAck);
  const error=failure(()=>f.run('SYNTHETIC-b'));expect(error.receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:false,observersComplete:false});
  expect(f.state().workspace).toBe(first);expect(f.history.status().undo).toBe(1);expect(f.document.all()).toEqual([]);
  expect(()=>oldAck()).toThrow(/late|repeated/);expect(error.receipt.workspaceAcknowledged).toBe(false);expect(()=>f.publisher.captureReadOnly()).toThrow(/failed|reopen/i);
 }finally{f.dispose();}
});

for(const acknowledged of [false,true])for(const result of ['null','boolean','promise'] as const)it('non-void '+result+' publication '+(acknowledged?'after acknowledgement':'without acknowledgement')+' preserves the exact consumed outcome',async()=>{
 const f=await fixture();try{
  const before=f.state().workspace,capture=f.host.captureWorkspace;
  f.host.captureWorkspace=()=>{const command=capture();return{...command,prepare(candidate){const prepared=command.prepare(candidate);return{...prepared,publish(mark){if(acknowledged)prepared.publish(mark);return result==='null'?null:result==='boolean'?true:Promise.resolve();}};}};};
  const error=failure(f.run);expect(error.receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:acknowledged,observersComplete:false});
  expect(f.state().workspace===before).toBe(!acknowledged);expect(f.history.status().undo).toBe(acknowledged?1:0);expect(f.state().holds).toBe(0);
  expect(f.document.all()).toEqual([f.rows[1]]);expect(()=>f.publisher.captureReadOnly()).toThrow(/failed|reopen/i);
  if(acknowledged)expect(()=>f.retainedAck()()).toThrow(/late|repeated/);
 }finally{f.dispose();}
});

for(const phase of ['before publication','notification'] as const)it('a nested hit during '+phase+' cannot borrow the outer frame or record another history step',async()=>{
 const f=await fixture();try{
  let nested:unknown,captured:unknown,captureError:unknown;
  const probe=()=>{try{f.run('SYNTHETIC-b');}catch(error){nested=error;}try{captured=f.publisher.captureReadOnly();}catch(error){captureError=error;}};
  if(phase==='before publication')f.beforeWrite(probe);else f.notify(probe);
  const receipt=f.run();expect(nested).toBeInstanceOf(Error);expect(String(nested)).toMatch(/already finishing/);expect(receipt.observersComplete).toBe(true);
  if(phase==='before publication'){expect(captureError).toBeInstanceOf(Error);expect(captured).toBeUndefined();}else{expect(captureError).toBeUndefined();expect(captured).toEqual(f.state().workspace.drawings);}
  expect(f.document.all()).toEqual([f.rows[1]]);expect(f.history.status().undo).toBe(1);expect(f.state()).toMatchObject({holds:0,notifications:1,quarantines:0});
 }finally{f.dispose();}
});

it('post-acknowledgement read-only captures are detached exact values, not mutation authority',async()=>{
 const f=await fixture();try{
  let first:Record<string,unknown>|undefined,second:Record<string,unknown>|undefined;
  f.afterWrite(()=>{first=f.publisher.captureReadOnly();if(first)first.drawings=[];second=f.publisher.captureReadOnly();});
  f.run();expect(first?.drawings).toEqual([]);expect(second).toEqual(f.state().workspace.drawings);expect(second).not.toBe(f.state().workspace.drawings);
  expect(f.document.all()).toEqual([f.rows[1]]);expect(f.history.status().undo).toBe(1);expect(f.publisher.captureReadOnly()).toBeUndefined();
 }finally{f.dispose();}
});

it('read-only capture rejects a survivor mutation from the final callback-bearing source check',async()=>{
 async function probe(injectAt?:number){
  const f=await fixture();let capturing=false,calls=0,injected=false,result:unknown,captureError:unknown;
  const capture=f.host.captureSource;
  f.host.captureSource=()=>{const current=capture();return()=>{current();if(capturing&&++calls===injectAt){injected=true;f.native.controller.update('SYNTHETIC-b',{style:{lineWidth:9}});}};};
  f.afterWrite(()=>{capturing=true;try{result=f.publisher.captureReadOnly();}catch(error){captureError=error;}finally{capturing=false;}});
  try{try{f.run();}catch{/* The transaction error is distinct from the capture result under examination. */}return{calls,injected,result,captureError};}finally{f.dispose();}
 }
 const normal=await probe();expect(normal.calls).toBeGreaterThan(0);expect(normal.result).toBeDefined();expect(normal.captureError).toBeUndefined();
 const changed=await probe(normal.calls);expect(changed.injected).toBe(true);expect(changed.result).toBeUndefined();expect(changed.captureError).toBeInstanceOf(Error);
});

it('error diagnostics do not invoke an untrusted message getter after canonical acceptance',async()=>{
 const f=await fixture();try{
  let reads=0;const bad=Object.defineProperty({},'message',{get(){reads++;return 'SYNTHETIC secret getter';}}),before=f.state().workspace;
  f.beforeWrite(()=>{throw bad;});const error=failure(f.run);expect(reads).toBe(0);expect(error.message).not.toContain('secret getter');
  expect(error.receipt).toMatchObject({canonicalAccepted:true,workspaceAcknowledged:false});expect(f.state().workspace).toBe(before);expect(f.history.status().undo).toBe(0);
  expect(()=>f.publisher.captureReadOnly()).toThrow(/failed|reopen/i);expect(f.state().holds).toBe(0);
 }finally{f.dispose();}
});

it('the final failed-frame source callback cannot quarantine an equal-value replacement canonical document',async()=>{
 async function probe(injectAt?:number){
  const f=await fixture();let failing=false,calls=0,replaced=false,captureError:unknown;
  const capture=f.host.captureSource;
  f.host.captureSource=()=>{const current=capture();return()=>{current();if(failing&&++calls===injectAt){replaced=true;f.document.load(f.document.serialize());}};};
  f.beforeWrite(()=>{failing=true;throw Error('SYNTHETIC pre-ack publication refusal');});
  try{
   const error=failure(f.run),failureCalls=calls,quarantines=f.state().quarantines;
   try{f.publisher.captureReadOnly();}catch(cause){captureError=cause;}
   return{calls:failureCalls,replaced,quarantines,captureError,receipt:error.receipt,history:f.history.status().undo,holds:f.state().holds};
  }finally{f.dispose();}
 }
 const normal=await probe();expect(normal.calls).toBeGreaterThan(0);expect(normal.quarantines).toBe(1);expect(normal.captureError).toBeInstanceOf(Error);
 const replacement=await probe(normal.calls);expect(replacement.replaced).toBe(true);expect(replacement.quarantines).toBe(0);expect(replacement.captureError).toBeUndefined();
 expect(replacement.receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:false,observersComplete:false});expect(replacement.history).toBe(0);expect(replacement.holds).toBe(0);
});
