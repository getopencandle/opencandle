import {expect,it,vi} from 'vitest';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

it.each(['pending','queue'] as const)('same-owner %s eligibility change before native forwarding rolls back only its owned staged command',async gate=>{
 const f=await templateAdapterHarness();try{
  const before=f.document.serialize(),model=f.native.controller.store.get(f.rows[0].id),serialize=model.serialize;let changed=false;
  model.serialize=function(){const value=serialize.call(this);if(!changed&&(f.document.all()[0].style as any).lineColor==='#abcdef'){changed=true;f[gate](true);}return value;};
  const token=f.batches.prepare(f.rows.map(row=>row.id),'synthetic-template'),update=vi.spyOn(f.native.controller,'updateMany');
  expect(()=>f.batches.commit(token)).toThrow();expect(changed).toBe(true);expect(update).not.toHaveBeenCalled();
  expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
  expect(f.native.controller.all().map((row:any)=>row.style.lineColor)).toEqual(['#123456','#123456']);
  expect(f.state()).toMatchObject({drawingBatch:0,nativeDrawingReconciliationHold:0,notifications:0});
 }finally{f.native.dispose();}
});
