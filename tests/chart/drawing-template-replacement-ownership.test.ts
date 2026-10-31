import {expect,it} from 'vitest';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

// Controlled supported-API reentry. This proves the transaction boundary, not
// that the current App UI synchronously loads another document during editing.
it.each(['equal-value','different-value'] as const)('template failure preserves a %s supported replacement and its new history',async kind=>{
 const f=await templateAdapterHarness();
 try{
  const original=f.document.serialize(),replacement=structuredClone(original);
  if(kind==='different-value')replacement.syntheticReplacement='SYNTHETIC newer document';
  let reentered=false,acceptedReplacement:Record<string,unknown>|undefined;
  f.native.on('drawing:edited',()=>{
   if(reentered)return;reentered=true;
   f.load(replacement);
   // A supported command on the replacement must survive the older callback.
   const first=f.document.all()[0],next={...first,syntheticReplacementEdit:'SYNTHETIC newer command'};
   f.document.stageEditedRecord(first,next);acceptedReplacement=f.document.serialize();
  });
  const update=f.native.controller.updateDrawing.bind(f.native.controller);let calls=0;
  f.native.controller.updateDrawing=(id:string,patch:any)=>{if(++calls===2)throw Error('SYNTHETIC later native failure');return update(id,patch);};
  const batch=f.batches.prepare(f.rows.map(row=>row.id),'synthetic-template');
  expect(()=>f.batches.commit(batch)).toThrow();expect(reentered).toBe(true);expect(acceptedReplacement).toBeDefined();
  expect(f.document.serialize()).toEqual(acceptedReplacement);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(replacement);expect(f.document.undo()).toBe(false);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(acceptedReplacement);
 }finally{f.native.dispose();}
});
