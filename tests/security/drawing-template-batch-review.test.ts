import {expect,it,vi} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingTemplateBatches,captureNativeDrawingLease,DrawingTemplateBatchError,type DrawingTemplateBatchHost} from '../../src/chart/drawing-template-batch';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';
async function fixture(){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 const rows=['independent-a','independent-b'].map(id=>createDrawing('trendline',{id,paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize());
 document.load({version:1,drawings:rows,opaque:{preserved:'SYNTHETIC'},lvDrawingManager:{schemaVersion:1,groups:[],templates:[{id:'independent-template',name:'SYNTHETIC',type:'trendline',properties:{'style.lineColor':'#abcdef'}}]}});native.controller.fromJSON({version:1,drawings:rows});
 let alive=true,selection=rows.map(row=>row.id),depth=0;native.controller.setSelection(selection);
 // Forwarding no longer reconciles or recovers uncertain native changes. The
 // checkpoint2549 fixture is retained in its immutable source archive.
 const update=vi.fn((changes:Array<{id:string;patch:SerializedDrawing}>)=>{native.controller.updateMany(changes);}),recover=vi.spyOn(native.controller,'fromJSON'),quarantine=vi.fn();
 const host:DrawingTemplateBatchHost={assertMutable:()=>{},captureOwner:()=>()=>{if(!alive)throw Error('independent replacement owner');},readDocument:()=>document.serialize(),captureNative:ids=>captureNativeDrawingLease({ctrl:native.controller},ids),prepareEdit:(before,after)=>document.prepareOwnedEditBatch(before,after),begin:()=>{depth++;},end:()=>{depth--;},update,quarantine};
 return{...native,document,rows,host,update,recover,quarantine,batches:createDrawingTemplateBatches(host),ids:()=>[...selection],retire:()=>{alive=false;},depth:()=>depth};
}

it('native serialization retirement cannot issue a prepared capability or change accepted state',async()=>{
 const f=await fixture();try{const original=f.host.captureNative,expected=f.document.serialize();f.host.captureNative=ids=>{const lease=original(ids);return{...lease,read(){const result=lease.read();f.retire();return result;}};};
 expect(()=>f.batches.prepare(f.ids(),'independent-template')).toThrow(/replacement/);expect(f.update).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(expected);expect(f.quarantine).not.toHaveBeenCalled();
 }finally{f.dispose();}
});

it('edit lease preparation reentrancy is checked before staging or starting native publication',async()=>{
 const f=await fixture();try{const stage=vi.fn(),capture=f.host.prepareEdit;f.host.prepareEdit=(before,after)=>{const lease=capture(before,after);f.retire();return{count:lease.count,assertCurrent:()=>lease.assertCurrent(),accept:()=>lease.accept(),rollback:()=>lease.rollback(),stage(){stage();lease.stage();}};};
 let token:ReturnType<typeof f.batches.prepare>|undefined;expect(()=>{token=f.batches.prepare(f.ids(),'independent-template');if(token)f.batches.commit(token);}).toThrow(/replacement/);
 expect(stage).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();expect(f.depth()).toBe(0);expect(f.quarantine).not.toHaveBeenCalled();if(token)expect(()=>f.batches.commit(token!)).toThrow(/consumed/);
 }finally{f.dispose();}
});

it('source retirement during staging forbids old-owner rollback and never touches native rows',async()=>{
 const f=await fixture();try{const opening=f.document.serialize(),prepare=f.host.prepareEdit;f.host.prepareEdit=(before,after)=>{const lease=prepare(before,after);return{count:lease.count,assertCurrent:()=>lease.assertCurrent(),accept:()=>lease.accept(),rollback:()=>lease.rollback(),stage(){lease.stage();f.retire();}};};const token=f.batches.prepare(f.ids(),'independent-template');
 expect(()=>f.batches.commit(token)).toThrow(DrawingTemplateBatchError);expect(f.document.serialize()).not.toEqual(opening);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(opening);expect(f.document.undo()).toBe(false);expect(f.update).not.toHaveBeenCalled();expect(f.recover).not.toHaveBeenCalled();expect(f.quarantine).not.toHaveBeenCalled();expect(f.depth()).toBe(0);
 }finally{f.dispose();}
});

it('a native callback that replaces ownership cannot trigger recovery or quarantine writes into replacement',async()=>{
 const f=await fixture();try{const token=f.batches.prepare(f.ids(),'independent-template'),original=f.host.update;f.host.update=changes=>{original(changes);f.retire();throw Error('independent native retirement fault');};let cause:unknown;
 try{f.batches.commit(token);}catch(error){cause=error;}
 expect(cause).toBeInstanceOf(DrawingTemplateBatchError);expect(String(cause)).toContain('independent native retirement fault');expect(String(cause)).toContain('replacement');expect(f.recover).not.toHaveBeenCalled();expect(f.quarantine).not.toHaveBeenCalled();expect(f.depth()).toBe(0);
 }finally{f.dispose();}
});

it('accepted publication and quarantine faults both remain visible without rolling accepted history back',async()=>{
 const f=await fixture();try{const token=f.batches.prepare(f.ids(),'independent-template');f.host.end=()=>{throw Error('independent accepted publication fault');};f.host.quarantine=()=>{throw Error('independent quarantine fault');};let cause:unknown;
 try{f.batches.commit(token);}catch(error){cause=error;}
 expect(cause).toBeInstanceOf(DrawingTemplateBatchError);expect((cause as DrawingTemplateBatchError).accepted).toBe(true);expect(String(cause)).toContain('accepted publication fault');expect(String(cause)).toContain('quarantine fault');expect(f.document.all()[0].style).toMatchObject({lineColor:'#abcdef'});expect(f.document.undo()).toBe(true);expect(f.document.all()[0].style).toMatchObject({lineColor:'#123456'});expect(f.recover).not.toHaveBeenCalled();expect(()=>f.batches.commit(token)).toThrow(/consumed/);
 }finally{f.dispose();}
});

it('a failed-capture receipt cannot quarantine a retired owner or be transferred to another manager',async()=>{
 const f=await fixture(),g=await fixture();try{const receipt=f.batches.commit(f.batches.prepare(f.ids(),'independent-template'));expect(()=>g.batches.publicationFailed(receipt,Error('foreign'))).toThrow(/Foreign/);f.retire();
 expect(()=>f.batches.publicationFailed(receipt,Error('independent rejected capture'))).toThrow(/rejected capture/);expect(f.quarantine).not.toHaveBeenCalled();expect(g.quarantine).not.toHaveBeenCalled();expect(()=>f.batches.publicationFailed(receipt,Error('repeat'))).toThrow(/consumed/);
 }finally{f.dispose();g.dispose();}
});

it('a prepared changed batch cannot survive an equal-value supported canonical load',async()=>{
 const f=await fixture();try{
  const original=f.document.serialize(),token=f.batches.prepare(f.ids(),'independent-template');f.document.load(original);
  expect(()=>f.batches.commit(token)).toThrow(/retired|changed|owner|mutation/i);
  expect(f.update).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(original);expect(f.document.undo()).toBe(false);expect(f.depth()).toBe(0);
 }finally{f.dispose();}
});

it('accepted save rejects a selected native change made by an earlier publication callback',async()=>{
 const f=await fixture();try{
  let saved:unknown,captureError:unknown;const end=f.host.end;
  f.host.end=publish=>{end(publish);f.controller.updateDrawing(f.rows[0].id,{style:{lineColor:'#ff00ff'}});try{saved=f.batches.captureReadOnly();}catch(error){captureError=error;}};
  let error:unknown;try{f.batches.commit(f.batches.prepare(f.ids(),'independent-template'));}catch(cause){error=cause;}
  expect(saved).toBeUndefined();expect(captureError).toBeInstanceOf(Error);expect(error).toBeInstanceOf(DrawingTemplateBatchError);expect((error as DrawingTemplateBatchError).accepted).toBe(true);
  expect(f.document.all()[0].style).toMatchObject({lineColor:'#abcdef'});expect(f.controller.store.get(f.rows[0].id).style.lineColor).toBe('#ff00ff');expect(f.recover).not.toHaveBeenCalled();expect(f.quarantine).not.toHaveBeenCalled();
 }finally{f.dispose();}
});

it('native target replacement values after a successful read-only save cannot produce a false-success receipt',async()=>{
 const f=await fixture();try{
  let saved:unknown;const end=f.host.end;
  f.host.end=publish=>{end(publish);saved=f.batches.captureReadOnly();f.controller.updateDrawing(f.rows[0].id,{style:{lineColor:'#ff00ff'}});};
  let error:unknown;try{f.batches.commit(f.batches.prepare(f.ids(),'independent-template'));}catch(cause){error=cause;}
  expect(saved).toEqual(f.document.serialize());expect(error).toBeInstanceOf(DrawingTemplateBatchError);expect((error as DrawingTemplateBatchError).accepted).toBe(true);
  expect(f.document.all()[0].style).toMatchObject({lineColor:'#abcdef'});expect(f.controller.store.get(f.rows[0].id).style.lineColor).toBe('#ff00ff');expect(f.recover).not.toHaveBeenCalled();expect(f.quarantine).not.toHaveBeenCalled();
 }finally{f.dispose();}
});

it('a transient pre-forward read fault rolls back only the still-owned staged canonical lease',async()=>{
 const f=await fixture();try{
  const capture=f.host.captureNative,original=f.document.serialize();let injected=false;
  f.host.captureNative=ids=>{const native=capture(ids);return{...native,read(){
   if(!injected&&(f.document.all()[0].style as any).lineColor==='#abcdef'){injected=true;throw Error('Independent transient pre-forward read fault');}
   return native.read();
  }};};
  const token=f.batches.prepare(f.ids(),'independent-template');expect(()=>f.batches.commit(token)).toThrow(/transient pre-forward/);
  expect(injected).toBe(true);expect(f.document.serialize()).toEqual(original);expect(f.document.undo()).toBe(false);expect(f.update).not.toHaveBeenCalled();expect(f.recover).not.toHaveBeenCalled();expect(f.quarantine).not.toHaveBeenCalled();expect(f.depth()).toBe(0);
 }finally{f.dispose();}
});
