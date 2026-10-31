import {expect,it} from 'vitest';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

// Supported-API callback reentry into the current adapter, not a demonstrated
// synchronous App UI route. Preserve these assertions across the repair.
it.each(['equal-value','different-value'] as const)('failed older single edit preserves a %s loaded replacement and its history',async kind=>{
 const f=await templateAdapterHarness();try{
  const replacement=f.document.serialize();if(kind==='different-value')replacement.syntheticReplacement='SYNTHETIC single edit replacement';
  let entered=false,expected:Record<string,unknown>|undefined;
  f.native.on('drawing:edited',()=>{if(entered)return;entered=true;f.load(replacement);const row=f.document.all()[0];f.document.stageEditedRecord(row,{...row,syntheticNewEdit:'SYNTHETIC replacement command'});expected=f.document.serialize();});
  const update=f.native.controller.updateMany.bind(f.native.controller);f.native.controller.updateMany=(rows:any)=>{update(rows);throw Error('SYNTHETIC single edit late failure');};
  expect(()=>f.edit(f.rows[0].id,{'style.lineWidth':4})).toThrow();expect(entered).toBe(true);expect(expected).toBeDefined();
  expect(f.document.serialize()).toEqual(expected);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(replacement);expect(f.document.undo()).toBe(false);expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(expected);
 }finally{f.native.dispose();}
});
