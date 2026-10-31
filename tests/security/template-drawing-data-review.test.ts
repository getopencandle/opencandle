import {expect,it} from 'vitest';
import {assertTemplateDrawingData,TEMPLATE_DRAWING_LIMITS} from '../../src/ui/template-drawing-validation';
import {prepareTemplateDrawings} from '../../src/ui/template-application';

const panes=[{paneId:'price',replaceable:false,logicalPaneId:'price',owners:[]},{paneId:'owned',replaceable:true,logicalPaneId:'synthetic-pane',owners:[{kind:'built',id:'synthetic-study'}]}];
const document=()=>({version:1,drawings:[{id:'price-original',paneId:'price',type:'opaque-original',data:{label:'Synthetic test only'}},{id:'owned-original',paneId:'owned',type:'opaque-original',data:{value:2},lvPaneBinding:{schemaVersion:1,target:{kind:'logical',id:'synthetic-pane',owners:[{kind:'built',id:'synthetic-study'}]}}}],lvDrawingManager:{schemaVersion:1,groups:[{id:'group',name:'Original',memberIds:['price-original','owned-original']}],templates:[]}});
it('template preparation rejects hidden or behavior-bearing native drawing data before any getter runs',()=>{
 let calls=0;const getter=document();Object.defineProperty(getter,'version',{enumerable:true,get(){calls++;return 1;}});expect(()=>prepareTemplateDrawings(getter,panes)).toThrow(/accessors/);expect(calls).toBe(0);
 const nested=document();Object.defineProperty(nested.drawings[0].data,'extra',{enumerable:true,get(){calls++;return 'never';}});expect(()=>prepareTemplateDrawings(nested,panes)).toThrow(/accessors/);expect(calls).toBe(0);
 const hidden=document();Object.defineProperty(hidden,'unknownReferences',{value:['owned-original'],enumerable:false});expect(()=>prepareTemplateDrawings(hidden,panes)).toThrow(/Hidden/);
 for(const value of [Object.create({version:1}),{value:()=>1},{value:undefined},{value:Infinity},{[Symbol('unsupported')]:1},Object.assign([1],{unknown:2}),new Array(2)])expect(()=>assertTemplateDrawingData(value)).toThrow();
 const custom=[1];Object.setPrototypeOf(custom,null);expect(()=>assertTemplateDrawingData(custom)).toThrow(/prototype/);
});
it('plain opaque price data survives removal and group reconciliation without mutating the original',()=>{
 const original=document(),before=JSON.stringify(original),prepared=prepareTemplateDrawings(original,panes);
 expect(prepared.removedIds).toEqual(['owned-original']);expect((prepared.document.drawings as unknown[])).toEqual([original.drawings[0]]);expect((prepared.document.lvDrawingManager as any).groups[0].memberIds).toEqual(['price-original']);expect(JSON.stringify(original)).toBe(before);
});
it('counts exact escaped JSON UTF-8 before cloning and rejects the32MiB excess',()=>{
 const limit=TEMPLATE_DRAWING_LIMITS.bytes,exact='\u00e9'.repeat((limit-2)/2);expect(new TextEncoder().encode(JSON.stringify(exact)).length).toBe(limit);expect(()=>assertTemplateDrawingData(exact)).not.toThrow();expect(()=>assertTemplateDrawingData(exact+'x')).toThrow(/32 MiB/);
 // Escapes consume six bytes even though each source character is only one unit.
 expect(()=>assertTemplateDrawingData('\u0000'.repeat(Math.floor(limit/6)+1))).toThrow(/32 MiB/);
 for(const scalar of ['"\\\b\t\n\f\r\u0001','\ud800','\udc00','\ud83d\ude00',-0,1e-300,null,true])expect(()=>assertTemplateDrawingData({original:scalar})).not.toThrow();
});
it('bounds nodes and nesting and rejects cyclic inputs without traversing forever',()=>{
 expect(()=>assertTemplateDrawingData(Array(TEMPLATE_DRAWING_LIMITS.nodes).fill(null))).toThrow(/node/);
 const wide=Array(250000).fill(null);wide[wide.length-1]=Array(250000).fill(null);expect(()=>assertTemplateDrawingData(wide)).toThrow(/node/);
 const deep=(levels:number)=>{let value:unknown=1;for(let i=0;i<levels;i++)value={value};return value;};expect(()=>assertTemplateDrawingData(deep(32))).not.toThrow();expect(()=>assertTemplateDrawingData(deep(33))).toThrow(/nesting/);
 const cycle:any={};cycle.self=cycle;expect(()=>assertTemplateDrawingData(cycle)).toThrow(/nesting/);
});
