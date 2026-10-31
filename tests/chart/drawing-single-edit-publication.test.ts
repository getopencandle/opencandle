import {expect,it,vi} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

const bars=Array.from({length:6},(_,index)=>({time:1000+index*60,open:100,high:200,low:90,close:120,volume:10}));
it('one combined unselected edit preserves the other selection and opaque fields, and remembers accepted style defaults with one history command',async()=>{
 const row=createDrawing('trendline',{id:'synthetic-single',paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize();(row as any).futureMetadata={retained:'SYNTHETIC'};
 const f=await templateAdapterHarness([row,{...structuredClone(row),id:'synthetic-selected'}],undefined,{bars});try{
  f.select(['synthetic-selected']);const before=f.document.serialize();
  expect(f.edit(row.id,{'style.lineColor':'#abcdef','style.lineWidth':4,'style.lineStyle':'dashed','text.value':'SYNTHETIC note',locked:true},[{price:105},{barNumber:5}],undefined,{schemaVersion:1,mode:'include',resolutions:['1D']})).toEqual({accepted:true,changed:true});
  const edited=f.document.all()[0];expect(edited.anchors).toEqual([{time:1000000,price:105},{time:1300000,price:200}]);expect(edited.futureMetadata).toEqual({retained:'SYNTHETIC'});expect(edited.lvPaneBinding).toEqual((f.rows[0] as any).lvPaneBinding);expect((edited.text as any).value).toBe('SYNTHETIC note');expect(edited.locked).toBe(true);
  expect(f.native.controller.all()[0].visible).toBe(true);expect(edited.visible).not.toBe(false);expect(f.projection()[0].visible).toBe(false);expect(f.native.controller.toolDefaults()).toMatchObject({trendline:{style:{lineColor:'#abcdef',lineWidth:4,lineStyle:'dashed'}}});
  expect(f.state()).toMatchObject({notifications:1,reconciliations:0,nativeEdited:1,analysisUnavailable:''});const accepted=f.document.serialize();
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(accepted);
 }finally{f.native.dispose();}
});
it('invalid coordinates, style, visibility or missing projection produce no command or native publication',async()=>{
 const f=await templateAdapterHarness(undefined,undefined,{bars,intervalVisibilityAvailable:false});try{
  const before=f.document.serialize(),id=f.rows[0].id,update=vi.spyOn(f.native.controller,'updateMany');
  for(const action of [()=>f.edit(id,{'style.lineColor':'invalid'}),()=>f.edit(id,{},[{price:Infinity},{}]),()=>f.edit(id,{},[{barNumber:1,timeSeconds:1000},{}]),()=>f.edit(id,{},undefined,undefined,{schemaVersion:1,mode:'include',resolutions:['1m']})])expect(action).toThrow();
  expect(update).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});
it('no-op leaves missing text and CRLF bytes intact while clearing nonempty text retains the drawing',async()=>{
 const f=await templateAdapterHarness();try{
  const id=f.rows[0].id,update=vi.spyOn(f.native.controller,'updateMany'),before=f.document.serialize();expect(f.edit(id,{})).toEqual({accepted:true,changed:false});expect(update).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
  f.edit(id,{'text.value':'SYNTHETIC\r\nsecond'});update.mockClear();const state=f.document.serialize();expect(f.edit(id,{'text.value':'SYNTHETIC\r\nsecond'}).changed).toBe(false);expect(f.document.serialize()).toEqual(state);expect(update).not.toHaveBeenCalled();
  expect(f.edit(id,{'text.value':''}).changed).toBe(true);expect(f.document.all()).toHaveLength(2);expect((f.document.all()[0].text as any).value).toBe('');expect(f.native.controller.store.get(id).text.value).toBe('');
 }finally{f.native.dispose();}
});
it.each(['pending','queue'] as const)('single edit rolls back its staged command when %s becomes busy before forwarding',async gate=>{
 const f=await templateAdapterHarness();try{
  const before=f.document.serialize(),model=f.native.controller.store.get(f.rows[0].id),serialize=model.serialize;let changed=false;
  model.serialize=function(){const result=serialize.call(this);if(!changed&&(f.document.all()[0].style as any).lineWidth===4){changed=true;f[gate](true);}return result;};
  const token=f.batches.prepareDrawingEdit(f.rows[0].id,{'style.lineWidth':4}),update=vi.spyOn(f.native.controller,'updateMany');expect(()=>f.batches.commit(token)).toThrow(DrawingEditRecoveryError);expect(changed).toBe(true);expect(update).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);expect(f.state()).toMatchObject({notifications:0,drawingBatch:0,nativeDrawingReconciliationHold:0});
 }finally{f.native.dispose();}
});
it.each(['selection','equal-value reload'] as const)('prepared single edit retires on %s and cannot relax the template selection requirement',async change=>{
 const f=await templateAdapterHarness();try{
  const id=f.rows[0].id;f.select([f.rows[1].id]);expect(()=>f.batches.prepare([id],'synthetic-template')).toThrow(/selection/);const token=f.batches.prepareDrawingEdit(id,{'style.lineWidth':4}),update=vi.spyOn(f.native.controller,'updateMany');
  if(change==='selection')f.select([id]);else f.load(f.document.serialize());expect(()=>f.batches.commit(token)).toThrow();expect(update).not.toHaveBeenCalled();expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});
it('accepted notification rejection keeps values and one command with a drawing-specific terminal error',async()=>{
 const f=await templateAdapterHarness();try{
  const before=f.document.serialize();let saved:unknown;f.subscribe(()=>{saved=f.save();return false;});let error:unknown;try{f.edit(f.rows[0].id,{'style.lineWidth':4});}catch(cause){error=cause;}
  expect(error).toBeInstanceOf(DrawingEditRecoveryError);expect((error as DrawingEditRecoveryError).accepted).toBe(true);expect(String(error)).toContain('drawing changed');expect(String(error)).not.toContain('Template');expect(saved).toEqual(f.document.serialize());expect(f.state()).toMatchObject({notifications:1,reconciliations:0,nativeEdited:1,drawingBatch:0,nativeDrawingReconciliationHold:0});expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});
it('postforward uncertainty never overwrites native progress or advertises an unproved rollback',async()=>{
 const f=await templateAdapterHarness();try{
  const update=f.native.controller.updateMany.bind(f.native.controller);f.native.controller.updateMany=(values:any)=>{update(values);throw Error('SYNTHETIC after write');};let error:unknown;try{f.edit(f.rows[0].id,{'style.lineWidth':4});}catch(cause){error=cause;}
  expect(error).toBeInstanceOf(DrawingEditRecoveryError);expect((error as DrawingEditRecoveryError).accepted).toBe(false);expect(String(error)).toContain('not confirmed');expect((f.document.all()[0].style as any).lineWidth).toBe(4);expect(f.native.controller.all()[0].style.lineWidth).toBe(4);expect(f.state().analysisUnavailable).toContain('not confirmed');expect(f.state()).toMatchObject({notifications:0,drawingBatch:0,nativeDrawingReconciliationHold:0});
 }finally{f.native.dispose();}
});
