import {expect,it} from 'vitest';
import {DrawingStore,createDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {commitPortableDrawingBindings,reprojectPortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
import type {AnalysisPaneInventory} from '../../src/chart/analysis-transaction';
const known=new Set(['trendline']),inventory:AnalysisPaneInventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]},{paneId:'study-old',logicalPaneId:'rsi',replaceable:true,owners:[{kind:'built',id:'rsi-1',rendererId:'handle-old'}]}],occupiedIds:[]};
const row=(id='line',paneId='study-old')=>({...createDrawing('trendline',{id,paneId,anchors:[{time:1000,price:10},{time:2000,price:20}]})!.serialize(),future:{keep:123}} as unknown as Record<string,unknown>);
it('new live study binding is canonical before immediate reprojection; repaint preserves native selection and undo',()=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[]});const native=[row()];document.mergeRenderable(native,known);commitPortableDrawingBindings(document,inventory,native);
 let loads=0,syncs=0,selected=['line'],nativeHistory=['before-add'];
 const host={nativeRows:native,load:()=>{loads++;selected=[];nativeHistory=[];},sync:()=>{syncs++;}};
 for(let i=0;i<3;i++){const resolved=reprojectPortableDrawingDocument(document,inventory,known,host);expect(resolved.unavailableIds).toEqual([]);}
 expect(loads).toBe(0);expect(syncs).toBe(3);expect(selected).toEqual(['line']);expect(nativeHistory).toEqual(['before-add']);expect(document.all()[0]).toHaveProperty('lvPaneBinding');expect(document.undo()).toBe(true);expect(document.all()).toEqual([]);expect(document.redo()).toBe(true);expect(document.all()[0]).toHaveProperty('lvPaneBinding');
});
it('enrichment rejects stale input, geometry/order/metadata changes and accessors without consuming history',()=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[]});document.mergeRenderable([row()],known);const expected=document.serialize();let reads=0;
 for(const replacement of [{...expected,foreign:'changed'},{...expected,drawings:[{...row(),anchors:[{time:1000,price:99}]}]}])expect(()=>document.enrichPaneBindings(expected,replacement)).toThrow('cannot change');
 const unsafe={...expected};Object.defineProperty(unsafe,'foreign',{enumerable:true,get(){reads++;return 1;}});expect(()=>document.enrichPaneBindings(expected,unsafe)).toThrow('accessors');expect(reads).toBe(0);
 document.mergeRenderable([{...row(),locked:true}],known);expect(()=>document.enrichPaneBindings(expected,expected)).toThrow('changed');expect(document.undo()).toBe(true);expect(document.serialize()).toEqual(expected);expect(document.undo()).toBe(true);expect(document.all()).toEqual([]);
});
it('recreated native pane requires one reload, then ordinary source changes only project',()=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[row()]});commitPortableDrawingBindings(document,inventory,[row()]);const next:AnalysisPaneInventory={...inventory,panes:inventory.panes.map(pane=>pane.paneId==='price'?pane:{...pane,paneId:'study-new',owners:[{kind:'built',id:'rsi-1',rendererId:'handle-new'}]})};
 let native:Record<string,unknown>[]=[row()],loads=0,syncs=0;const host=()=>({nativeRows:native,load:(doc:Record<string,unknown>)=>{loads++;native=doc.drawings as Record<string,unknown>[];},sync:()=>{syncs++;}});
 reprojectPortableDrawingDocument(document,next,known,host());expect(loads).toBe(1);expect(native[0].paneId).toBe('study-new');reprojectPortableDrawingDocument(document,next,known,host());expect(loads).toBe(1);expect(syncs).toBe(1);expect(document.all()[0].future).toEqual({keep:123});
});
it('failed repaint does not change canonical bindings or consume drawing history',()=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[]});document.mergeRenderable([row()],known);commitPortableDrawingBindings(document,inventory,[row()]);const before=document.serialize();expect(()=>reprojectPortableDrawingDocument(document,inventory,known,{nativeRows:[row()],load:()=>{throw Error('unexpected reload');},sync:()=>{throw Error('paint rejected');}})).toThrow('paint rejected');expect(document.serialize()).toEqual(before);expect(document.undo()).toBe(true);
});
it('failed binding admission rolls back the native merge and its newly recorded undo entry',()=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[]});document.mergeRenderable([row()],known);const before=document.serialize();expect(()=>document.atomic(()=>{document.mergeRenderable([{...row(),locked:true}],known);commitPortableDrawingBindings(document,{...inventory,panes:[...inventory.panes,inventory.panes[0]]},[row()]);})).toThrow();expect(document.serialize()).toEqual(before);expect(document.undo()).toBe(true);expect(document.all()).toEqual([]);expect(document.undo()).toBe(false);
});
it('synchronous native publication cannot replace a changed canonical binding baseline',()=>{
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[row()]});commitPortableDrawingBindings(document,inventory,[row()]);expect(()=>reprojectPortableDrawingDocument(document,inventory,known,{nativeRows:[row()],load:()=>{},sync:()=>document.mergeRenderable([{...row(),locked:true}],known)})).toThrow('changed before');expect(document.all()[0].locked).toBe(true);
});
it('actual pinned DrawingStore allocator can collide with retained unknown dw IDs after load',()=>{
 const native=new DrawingStore();native.load({version:1,drawings:[{id:'dw-1',type:'future-pattern',opaque:true}]});expect(native.all()).toEqual([]);expect(native.nextId()).toBe('dw-1');
 const canonical=new LosslessDrawingDocument(),before={version:1,drawings:[{id:'dw-1',type:'future-pattern',opaque:true}]};canonical.load(before);expect(()=>canonical.mergeRenderable([row('dw-1','price')],known)).toThrow('collides');expect(canonical.serialize()).toEqual(before);
});
