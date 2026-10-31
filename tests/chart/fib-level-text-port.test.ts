import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {drawingEditor,patchDrawingProperties} from '../../src/chart/drawing-port';
import {templateProperties} from '../../src/chart/drawing-manager';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

function row(label?:string):SerializedDrawing{
 const value=createDrawing('fibretracement',{id:'SYNTHETIC label policy',paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
 const level=(value.props!.levels as Array<Record<string,unknown>>)[0];delete level.label;if(label!==undefined)level.label=label;return value;
}
const label=(value:SerializedDrawing)=>(value.props!.levels as Array<Record<string,unknown>>)[0].label;
it.each(['x'.repeat(51),'a\nb','a\rb','a\u0085b','a\u2028b',undefined,null,5])('refuses changed raw label %j atomically with a valid style edit',next=>{
 const original=row('old'),before=structuredClone(original);
 expect(()=>patchDrawingProperties(original,{'style.lineWidth':4,'levels.0.label':next})).toThrow();expect(original).toStrictEqual(before);
});
it('admits exact 50-unit labels and preserves surrounding spaces without normalizing',()=>{
 const original=row('old'),next=' '+ 'x'.repeat(48)+' ';expect(label(patchDrawingProperties(original,{'levels.0.label':next}))).toBe(next);
});
it.each(['x'.repeat(51),'old\nlabel'])('retains exact legacy text %j on no-op and unrelated edits',old=>{
 const original=row(old);expect(drawingEditor(original,[]).values['levels.0.label']).toBe(old);
 expect(patchDrawingProperties(original,{'levels.0.label':old})).toBe(original);
 expect(label(patchDrawingProperties(original,{'levels.0.label':old,'style.lineWidth':4}))).toBe(old);
 expect(label(patchDrawingProperties(original,{'levels.0.label':'repaired'}))).toBe('repaired');
});
it('empty edit of an absent label preserves omission',()=>{const original=row();expect(patchDrawingProperties(original,{'levels.0.label':''})).toBe(original);expect(Object.hasOwn((original.props!.levels as any[])[0],'label')).toBe(false);});
it('raw accessor labels refuse without getter execution',()=>{
 let calls=0;const patch=Object.defineProperty({},'levels.0.label',{enumerable:true,get(){calls++;return'new';}});expect(()=>patchDrawingProperties(row(),patch)).toThrow();expect(calls).toBe(0);
});
it.each(['x'.repeat(51),'old\nlabel'])('new template capture refuses legacy text %j while preserving the drawing',old=>{
 const original=row(old),before=structuredClone(original);expect(()=>templateProperties(original)).toThrow(/50|line/);expect(original).toStrictEqual(before);
});
it('raw undefined survives no normalizer into a silent accepted edit',async()=>{
 const original=row('old'),f=await templateAdapterHarness([original]);try{
  const before=f.document.serialize();expect(()=>f.edit(original.id,{'levels.0.label':undefined,'style.lineWidth':4})).toThrow();expect(f.document.serialize()).toStrictEqual(before);expect(f.native.controller.canUndo()).toBe(false);
 }finally{f.native.dispose();}
});
it('unchanged legacy template text may apply style, preserves history, and refuses changed text at another target',async()=>{
 const original=row('x'.repeat(51)),f=await templateAdapterHarness([original],{'levels.0.label':'x'.repeat(51),'style.lineWidth':4});try{
  const before=f.document.serialize();expect(f.batches.commit(f.batches.prepare([original.id],'synthetic-template'))).toMatchObject({accepted:true,changed:true});
  expect(label(f.document.all()[0] as unknown as SerializedDrawing)).toBe('x'.repeat(51));expect(f.document.undo()).toBe(true);f.native.controller.undo();expect(f.document.serialize()).toStrictEqual(before);
 }finally{f.native.dispose();}
 const other=row('short'),g=await templateAdapterHarness([other],{'levels.0.label':'x'.repeat(51),'style.lineWidth':4});try{
  const before=g.document.serialize();expect(()=>g.batches.prepare([other.id],'synthetic-template')).toThrow(/50/);expect(g.document.serialize()).toStrictEqual(before);expect(g.native.controller.canUndo()).toBe(false);
 }finally{g.native.dispose();}
});
