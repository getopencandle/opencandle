import {describe,expect,it} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {BULK_PROPERTY_PATHS,BULK_STYLE_OPTIONS,BULK_WIDTH_OPTIONS,NO_TOOLBAR_DRAWING_TYPES,bulkPropertyBar} from '../../src/chart/drawing-template-batch';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

// property batch beside the template batch . The pure bar model
// follows SDD2#rule.floatingToolbar.defaultButtons and SDD2#list.lineWidths.floatingToolbar.
// The batch runs through the actual adapter host (template adapter harness): one prepared,
// owned, one-step edit over a mixed selection.
const make=(id:string,type:string,price:number)=>createDrawing(type as never,{id,paneId:'price',anchors:[{time:1000000,price},{time:1240000,price:price+10}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}} as never)!.serialize() as SerializedDrawing;
const mixed=()=>[make('trend-1','trendline',100),make('box-1','box',110),make('text-1','text',120),make('trend-2','trendline',130)];

describe('bulk property bar model',()=>{
 it('shows a button only when every selected tool exposes the property; width options are 1 to 4 titled Line tool widths',()=>{
  const trends=[make('a','trendline',1),make('b','trendline',2),make('c','trendline',3)];
  const bar=bulkPropertyBar(trends as never);
  expect(bar.visible).toBe(true);
  expect(bar.buttons.map(button=>button.id)).toEqual(['lineColor','textColor','lineWidth','lineStyle']);
  expect(bar.buttons.map(button=>button.title)).toEqual(['Line tool colors','Line tool text colors','Line tool widths','Style']);
  expect(bar.buttons.find(button=>button.id==='lineWidth')!.options).toEqual([1,2,3,4]);expect(BULK_WIDTH_OPTIONS).toEqual([1,2,3,4]);
  expect(bar.buttons.find(button=>button.id==='lineStyle')!.options).toEqual(BULK_STYLE_OPTIONS);
  expect(bar.buttons.every(button=>BULK_PROPERTY_PATHS.includes(button.path))).toBe(true);
 });
 it('adds the background button only when every tool has a fill, and a Text drawing narrows the bar to what it exposes',()=>{
  const boxes=[make('a','box',1),make('b','box',2)];
  expect(bulkPropertyBar(boxes as never).buttons.map(button=>button.id)).toContain('backgroundColor');
  expect(bulkPropertyBar(boxes as never).buttons.find(button=>button.id==='backgroundColor')!.title).toBe('Line tool backgrounds');
  expect(bulkPropertyBar([make('a','trendline',1),make('b','box',2)] as never).buttons.map(button=>button.id)).not.toContain('backgroundColor');
  expect(bulkPropertyBar([make('a','trendline',1),make('t','text',2)] as never).buttons.map(button=>button.id)).toEqual(['textColor']);
 });
 it('shows no bar for one drawing, for Tweet, Idea or Image types, or for an unsupported record',()=>{
  expect(bulkPropertyBar([make('a','trendline',1)] as never)).toEqual({visible:false,buttons:[]});
  expect(NO_TOOLBAR_DRAWING_TYPES).toEqual(['tweet','idea','image']);
  for(const type of NO_TOOLBAR_DRAWING_TYPES)expect(bulkPropertyBar([make('a','trendline',1),{id:'z',type}] as never)).toEqual({visible:false,buttons:[]});
  expect(bulkPropertyBar([make('a','trendline',1),{id:'future',type:'future-tool'}] as never).visible).toBe(false);
  expect(bulkPropertyBar([] as never).visible).toBe(false);
 });
});

describe('property batch through the actual adapter host',()=>{
 it('bulk color over three mixed tools changes only the shared property, leaves a tool without it untouched and is one history step',async()=>{
  const f=await templateAdapterHarness(mixed());try{
   const ids=['trend-1','box-1','text-1'];f.select(ids);const before=f.document.all(),untouched=JSON.stringify(before.find(row=>row.id==='trend-2'));
   const receipt=f.batches.commit(f.batches.prepareProperties(ids,{'style.lineColor':'#ff0000'}));
   expect(receipt.changed).toBe(true);
   const after=f.document.all(),color=(id:string)=>((after.find(row=>row.id===id) as any).style?.lineColor);
   expect(color('trend-1')).toBe('#ff0000');expect(color('box-1')).toBe('#ff0000');
   expect(JSON.stringify(after.find(row=>row.id==='text-1'))).toBe(JSON.stringify(before.find(row=>row.id==='text-1')));// Text exposes no line color
   expect(JSON.stringify(after.find(row=>row.id==='trend-2'))).toBe(untouched);
   expect((after.find(row=>row.id==='trend-1') as any).anchors).toEqual((before.find(row=>row.id==='trend-1') as any).anchors);
   expect(f.state()).toMatchObject({notifications:1,reconciliations:0,nativeEdited:2});// two native edits, one publication
   expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(before);expect(f.document.undo()).toBe(false);
   expect(f.document.redo()).toBe(true);expect(color('trend-1')).toBe('#ff0000');
   expect(f.save()).toEqual(f.document.serialize());
  }finally{f.native.dispose();}
 });
 it('width and style apply together as one step through the manager port',async()=>{
  const f=await templateAdapterHarness(mixed());try{
   const ids=['trend-1','box-1','trend-2'];f.select(ids);
   f.manager.applyProperties(ids,{'style.lineWidth':4,'style.lineStyle':'dashed'});
   for(const id of ids)expect((f.document.all().find(row=>row.id===id) as any).style).toMatchObject({lineWidth:4,lineStyle:'dashed'});
   expect((f.document.all().find(row=>row.id==='text-1') as any).style).toMatchObject({lineWidth:2,lineStyle:'solid'});
   expect(f.document.undo()).toBe(true);expect(f.document.undo()).toBe(false);
  }finally{f.native.dispose();}
 });
 it('a no-op value is accepted without a history step or notification',async()=>{
  const f=await templateAdapterHarness(mixed());try{
   const ids=['trend-1','trend-2'];f.select(ids);const receipt=f.batches.commit(f.batches.prepareProperties(ids,{'style.lineColor':'#123456'}));
   expect(receipt.changed).toBe(false);expect(f.state().notifications).toBe(0);expect(f.document.undo()).toBe(false);
  }finally{f.native.dispose();}
 });
 it('refuses unsupported properties, a property no selected tool exposes, and widths outside the tool rules, with nothing changed',async()=>{
  const f=await templateAdapterHarness(mixed());try{
   f.select(['trend-1','box-1']);const before=f.document.serialize();
   expect(()=>f.batches.prepareProperties(['trend-1','box-1'],{'style.arrowLeft':true})).toThrow('line color, background color, text color, width and style only');
   expect(()=>f.batches.prepareProperties(['trend-1','box-1'],{})).toThrow('line color, background color, text color, width and style only');
   expect(()=>f.batches.prepareProperties(['trend-1','box-1'],{'style.lineWidth':'wide'})).toThrow();
   f.select(['text-1']);expect(()=>f.batches.prepareProperties(['text-1'],{'style.lineColor':'#ff0000'})).toThrow('No selected drawing exposes this property');
   expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
  }finally{f.native.dispose();}
 });
 it('a prepared property batch is single use and bound to the selection',async()=>{
  const f=await templateAdapterHarness(mixed());try{
   f.select(['trend-1','box-1']);const token=f.batches.prepareProperties(['trend-1','box-1'],{'style.lineColor':'#00ff00'});f.batches.commit(token);
   expect(()=>f.batches.commit(token)).toThrow('consumed');
   expect(()=>f.batches.prepareProperties(['box-1','trend-1'],{'style.lineColor':'#00ff00'})).toThrow(/selection/);
  }finally{f.native.dispose();}
 });
});

describe('multi-selection displacement application seam ',()=>{
 it('moveMany applies final anchors to every selected drawing as one owned step, keeping count and unrelated rows',async()=>{
  const f=await templateAdapterHarness(mixed());try{
   const ids=['trend-1','box-1'];f.select(ids);const before=f.document.all(),other=JSON.stringify(before.find(row=>row.id==='trend-2'));
   const moves=ids.map(id=>({id,anchors:(before.find(row=>row.id===id) as any).anchors.map((anchor:any)=>({time:anchor.time+60000,price:anchor.price+5}))}));
   expect(f.manager.moveMany(moves)).toMatchObject({accepted:true,changed:true});
   const after=f.document.all();
   for(const move of moves)expect((after.find(row=>row.id===move.id) as any).anchors.map((anchor:any)=>[anchor.time,anchor.price])).toEqual(move.anchors.map((anchor:any)=>[anchor.time,anchor.price]));
   expect(JSON.stringify(after.find(row=>row.id==='trend-2'))).toBe(other);expect(f.state().notifications).toBe(1);
   expect(f.document.undo()).toBe(true);expect(f.document.all()).toEqual(before);expect(f.document.undo()).toBe(false);
  }finally{f.native.dispose();}
 });
 it('refuses a changed anchor count, non-finite values and duplicate ids with nothing changed',async()=>{
  const f=await templateAdapterHarness(mixed());try{
   f.select(['trend-1']);const before=f.document.serialize(),anchors=(id:string)=>(before.drawings as any[]).find(row=>row.id===id).anchors;
   expect(()=>f.manager.prepareMoves([{id:'trend-1',anchors:anchors('trend-1').slice(0,1)}])).toThrow('anchor count');
   expect(()=>f.manager.prepareMoves([{id:'trend-1',anchors:[{time:Number.NaN,price:1},{time:2,price:2}]}])).toThrow('finite');
   expect(()=>f.manager.prepareMoves([{id:'trend-1',anchors:anchors('trend-1')},{id:'trend-1',anchors:anchors('trend-1')}])).toThrow('unique');
   expect(f.document.serialize()).toEqual(before);
  }finally{f.native.dispose();}
 });
});
