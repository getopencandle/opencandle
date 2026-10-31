import {expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {capturePortableDrawingDocument,resolvePortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
import type {AnalysisPaneInventory} from '../../src/chart/analysis-transaction';
const known=new Set(['trendline']);
const row=(id:string,paneId='price')=>({id,type:'trendline',paneId,anchors:[{time:10,price:20},{time:30,price:40}],style:{lineColor:'#123'},visible:true});
const inventory:AnalysisPaneInventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]},{paneId:'rsi-native',logicalPaneId:'rsi-logical',replaceable:true,owners:[{kind:'built',id:'rsi-1',rendererId:'renderer-1'}]}],occupiedIds:[]};
it('unchanged native save preserves withheld and opaque records in their original visual order',()=>{
 const store=new LosslessDrawingDocument(),a=row('a'),c=row('c','missing'),b=row('b'),opaque={id:'future',type:'future-shape',payload:{z:3}},original={version:1,drawings:[a,c,opaque,b]};store.load(original);
 store.mergeRenderable([a,b],known,false,new Set(['c']));expect(store.serialize()).toEqual(original);
});
it('native bring-to-front reorders rendered rows while preserving retained slots and full metadata',()=>{
 const store=new LosslessDrawingDocument(),a=row('a'),c={...row('c','missing'),future:'keep'},b=row('b');store.load({version:1,drawings:[a,c,b]});store.mergeRenderable([b,a],known,false,new Set(['c']));expect(store.all()).toEqual([b,c,a]);
});
it('an opaque retained ID cannot become a duplicate or be overwritten by a new native drawing',()=>{
 const store=new LosslessDrawingDocument(),original={version:1,drawings:[{id:'collision',type:'future-shape',payload:{keep:true}}]};store.load(original);expect(()=>store.mergeRenderable([row('collision')],known)).toThrow();expect(store.serialize()).toEqual(original);
});
it('portable binding is a complete logical owner claim and does not follow a reused native ID',()=>{
 const original={version:1,drawings:[row('study','rsi-native')]},captured=capturePortableDrawingDocument(original,inventory,original.drawings),changed:AnalysisPaneInventory={...inventory,panes:inventory.panes.map(pane=>pane.paneId==='price'?pane:{...pane,logicalPaneId:'different',owners:[{kind:'built',id:'other',rendererId:'renderer-1'}]})};
 const unavailable=resolvePortableDrawingDocument(captured,changed,known);expect(unavailable.unavailableIds).toEqual(['study']);expect(unavailable.nativeDocument.drawings).toEqual([]);expect(unavailable.document).toEqual(captured);const restored=resolvePortableDrawingDocument(unavailable.document,inventory,known);expect(restored.unavailableIds).toEqual([]);expect((restored.nativeDocument.drawings as any[])[0].paneId).toBe('rsi-native');
});
