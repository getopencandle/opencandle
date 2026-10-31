import {expect,it} from 'vitest';
import {DrawingDuplicatePublicationError} from '../../src/chart/drawing-duplicate-publication';
import {drawingDuplicatePublicationFixture as fixture} from '../chart/drawing-duplicate-publication-harness';

it.each(['after acknowledgement','during final notification'] as const)('does not quarantine an equal-value canonical replacement %s',async phase=>{
 const f=await fixture();try{
  const replace=()=>f.document.load(f.document.serialize());
  if(phase==='after acknowledgement')f.afterWrite(replace);else f.notify(replace);
  let failure:unknown;try{f.run();}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(DrawingDuplicatePublicationError);
  expect((failure as DrawingDuplicatePublicationError).receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:false});
  expect(f.document.all()).toHaveLength(2);expect(f.state().workspace.drawings.drawings).toHaveLength(2);expect(f.history.status().undo).toBe(1);
  expect(f.state().holds).toBe(0);expect(f.state().quarantines).toBe(0);
 }finally{f.dispose();}
});

it('an old retained acknowledgement cannot mark a later command accepted',async()=>{
 const f=await fixture();try{
  f.run();const previous=f.state().workspace,ack=f.retainedAck();
  f.beforeWrite(()=>ack());let failure:unknown;try{f.run();}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(DrawingDuplicatePublicationError);
  expect((failure as DrawingDuplicatePublicationError).receipt).toMatchObject({canonicalAccepted:true,workspaceAcknowledged:false,observersComplete:false});
  expect(f.state().workspace).toBe(previous);expect(f.history.status().undo).toBe(1);expect(f.state().holds).toBe(0);
 }finally{f.dispose();}
});

it('readonly capture rejects native replacement from its final source callback',async()=>{
 async function probe(injectAt?:number){
  const f=await fixture();let capturing=false,calls=0,injected=false,result:unknown,captureError:unknown,nativeWidth:number|undefined;
  const capture=f.host.captureSource;
  f.host.captureSource=()=>{const assert=capture();return()=>{assert();if(capturing&&++calls===injectAt){injected=true;const id=f.document.all().at(-1)!.id as string;f.native.controller.update(id,{style:{lineWidth:9}});nativeWidth=f.native.controller.store.get(id).style.lineWidth;}};};
  f.beforeWrite(()=>{capturing=true;try{result=f.publisher.captureReadOnly();}catch(error){captureError=error;}finally{capturing=false;}});
  try{try{f.run();}catch{/* The outer transaction outcome is distinct from the readonly capture assertion. */}return{calls,injected,result,captureError,nativeWidth};}finally{f.dispose();}
 }
 const control=await probe();expect(control.calls).toBeGreaterThan(0);expect(control.result).toBeDefined();expect(control.captureError).toBeUndefined();
 const fault=await probe(control.calls);expect(fault.injected).toBe(true);expect(fault.nativeWidth).toBe(9);
 expect(fault.captureError).toBeInstanceOf(Error);expect(fault.result).toBeUndefined();
});
