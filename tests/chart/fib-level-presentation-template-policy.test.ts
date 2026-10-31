import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {templateProperties} from '../../src/chart/drawing-manager';
import {templateAdapterHarness} from './drawing-template-adapter-harness';

const bg='lvFibBackground',txt='lvFibText',defaults={[bg]:{schemaVersion:1,opacity:6},[txt]:{schemaVersion:1,enabled:true,position:'center'}};
function row(id='SYNTHETIC template policy'):SerializedDrawing{
 const value=createDrawing('fibretracement',{id,paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();delete value.props![bg];delete value.props![txt];return value;
}
const keys=[bg+'.opacity',txt+'.enabled',txt+'.position'];
it('legacy template capture omits both presentation tuples',()=>{
 const properties=templateProperties(row());for(const key of keys)expect(Object.hasOwn(properties,key)).toBe(false);
});
it('explicit supported defaults are captured independently from legacy omission',()=>{
 const value=row();Object.assign(value.props!,structuredClone(defaults));const properties=templateProperties(value);
 expect(keys.map(key=>properties[key])).toEqual([6,true,'center']);
});
it('real manager capture keeps unknown whole members exact and excludes their editable paths',async()=>{
 const value=row();value.props![bg]={schemaVersion:1,opacity:6,future:undefined};value.props![txt]=undefined;
 const f=await templateAdapterHarness([value]);try{
  const before=structuredClone(f.document.all()[0].props),id=f.manager.saveTemplate(value.id,'SYNTHETIC unknown policy');
  const saved=f.manager.state().templates.find(item=>item.id===id)!;for(const key of keys)expect(Object.hasOwn(saved.properties,key)).toBe(false);
  for(const key of [bg,txt] as const){expect(Object.hasOwn((f.document.all()[0].props as Record<string,any>),key)).toBe(true);expect((f.document.all()[0].props as Record<string,any>)[key]).toStrictEqual((before as Record<string,unknown>)[key]);}
 }finally{f.native.dispose();}
});
it('explicit default template intentionally materializes complete state with one history step',async()=>{
 const value=row(),f=await templateAdapterHarness([value],{[bg+'.opacity']:6,[txt+'.enabled']:true,[txt+'.position']:'center'});try{
  const before=f.document.serialize();expect(f.batches.commit(f.batches.prepare([value.id],'synthetic-template'))).toMatchObject({accepted:true,changed:true});
  for(const key of [bg,txt] as const)expect((f.document.all()[0].props as Record<string,any>)[key]).toEqual(defaults[key]);
  expect(f.document.undo()).toBe(true);f.native.controller.undo();expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);expect(f.native.controller.canUndo()).toBe(false);
  expect(f.document.redo()).toBe(true);f.native.controller.redo();expect(f.batches.commit(f.batches.prepare([value.id],'synthetic-template'))).toMatchObject({accepted:true,changed:false});
 }finally{f.native.dispose();}
});
