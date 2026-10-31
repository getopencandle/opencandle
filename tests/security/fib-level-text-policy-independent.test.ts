import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {assertNewFibLevelLabel,assertRetainedFibLevelLabel,validateFibLevelLabelChange} from '../../src/chart/fib-level-text-policy';
import {patchDrawingProperties} from '../../src/chart/drawing-port';
import {templateProperties} from '../../src/chart/drawing-manager';
import {templateAdapterHarness} from '../chart/drawing-template-adapter-harness';

// Synthetic independent literals. UTF-16 and the separator set are LV policy;
// these expectations do not assert the reference's Unicode counting algorithm.
function fib(id='SYNTHETIC independent text',label='SYNTHETIC opening'):SerializedDrawing{
 const row=createDrawing('fibretracement',{id,paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
 row.props={...row.props,reverse:false,levels:[
  {ratio:0,color:'#112233',enabled:false,label},
  {ratio:.5,color:'#445566',enabled:true,label:'SYNTHETIC untouched'},
  {ratio:1,color:'#778899',enabled:true},
 ],lvFibText:{schemaVersion:1,enabled:false,position:'right'},lvFibBackground:{schemaVersion:99,future:{missing:undefined,minus:-0}}};
 return row;
}
function labels(row:SerializedDrawing){return row.props!.levels as {ratio:number;color:string;enabled:boolean;label?:string}[];}
function exactSibling(row:Record<string,unknown>){const member=(row.props as any).lvFibBackground;expect(member.schemaVersion).toBe(99);expect(Object.hasOwn(member.future,'missing')).toBe(true);expect(member.future.missing).toBeUndefined();expect(Object.is(member.future.minus,-0)).toBe(true);}

it('uses literal UTF-16 boundaries without normalizing combining marks, supplementary symbols or spaces',()=>{
 const exact=' '.repeat(44)+'\ud83d\ude80'+'e\u0301'+'\ud800'+'\t';
 expect(exact.length).toBe(50);expect(()=>assertNewFibLevelLabel(exact)).not.toThrow();
 expect(()=>assertNewFibLevelLabel(exact+'x')).toThrow(/50/);
 expect(validateFibLevelLabelChange('\u00e9','e\u0301')).toBe('changed');
 expect(validateFibLevelLabelChange('e\u0301','e\u0301')).toBe('unchanged');
});

it('does not coerce a boxed scalar or inspect its poisoned providers',()=>{
 let reads=0;const value=Object.defineProperties(new String('SYNTHETIC'),{toString:{get(){reads++;throw Error('unreachable');}},valueOf:{get(){reads++;throw Error('unreachable');}},[Symbol.toPrimitive]:{get(){reads++;throw Error('unreachable');}}});
 expect(()=>assertNewFibLevelLabel(value)).toThrow();expect(()=>validateFibLevelLabelChange('old',value)).toThrow();expect(reads).toBe(0);
});

it('keeps the old 20000-unit bound distinct from an edit and admits a deliberate clear',()=>{
 const old='x'.repeat(19998)+'\r\n';expect(old.length).toBe(20000);
 expect(()=>assertRetainedFibLevelLabel(old)).not.toThrow();expect(validateFibLevelLabelChange(old,old)).toBe('unchanged');
 expect(validateFibLevelLabelChange(old,'')).toBe('changed');expect(()=>validateFibLevelLabelChange(old,old+'x')).toThrow();
 expect(()=>assertRetainedFibLevelLabel(old+'x')).toThrow(/20000/);
});

it.each(['x'.repeat(51),'a\rb','a\nb','a\u000bb','a\u000cb','a\u0085b','a\u2028b','a\u2029b'])('actual port refuses a changed dormant label atomically: %#',next=>{
 const row=fib(),before=structuredClone(row);
 expect(()=>patchDrawingProperties(row,{'levels.1.color':'#abcdef','levels.0.label':next})).toThrow();
 expect(row).toStrictEqual(before);exactSibling(row as unknown as Record<string,unknown>);
});

it('raw undefined and an accessor are refused before an otherwise valid patch without getter execution',()=>{
 const row=fib(),before=structuredClone(row);let reads=0;
 const getter={'levels.1.color':'#abcdef'};Object.defineProperty(getter,'levels.0.label',{enumerable:true,get(){reads++;return'valid';}});
 for(const patch of [{'levels.1.color':'#abcdef','levels.0.label':undefined},getter])expect(()=>patchDrawingProperties(row,patch)).toThrow();
 expect(reads).toBe(0);expect(row).toStrictEqual(before);
});

it('equal old multiline text is an exact no-op while an unrelated level edit retains all legacy metadata',()=>{
 const row=fib('SYNTHETIC retained old','SYNTHETIC\r\n'+'x'.repeat(80)),before=structuredClone(row);
 expect(patchDrawingProperties(row,{'levels.0.label':labels(row)[0].label})).toBe(row);
 const next=patchDrawingProperties(row,{'levels.1.color':'#abcdef','levels.0.label':labels(row)[0].label}),expected=structuredClone(row);
 labels(expected)[1].color='#abcdef';expect(next).toStrictEqual(expected);expect(row).toStrictEqual(before);exactSibling(next as unknown as Record<string,unknown>);
});

it('empty opening-label no-ops retain both absence and own undefined rather than materializing a new label',()=>{
 for(const present of [false,true]){const row=fib();if(present)labels(row)[0].label=undefined;else delete labels(row)[0].label;
  const before=structuredClone(row);expect(patchDrawingProperties(row,{'levels.0.label':''})).toBe(row);expect(row).toStrictEqual(before);expect(Object.hasOwn(labels(row)[0],'label')).toBe(present);
 }
});

it('new template capture refuses an equal old invalid label rather than grandfathering the new template',()=>{
 for(const old of ['S'.repeat(51),'SYNTHETIC\nold']){const row=fib('SYNTHETIC capture',old),before=structuredClone(row);expect(()=>templateProperties(row)).toThrow();expect(row).toStrictEqual(before);}
 const valid=fib('SYNTHETIC capture valid',' '.repeat(50));expect(templateProperties(valid)['levels.0.label']).toBe(' '.repeat(50));
});

it('actual owned edits preserve legacy text, then one accepted repair can Undo back to that old text',async()=>{
 const old='SYNTHETIC\n'+'q'.repeat(90),row=fib('SYNTHETIC owned legacy',old),f=await templateAdapterHarness([row],{});try{
  const opening=f.document.serialize(),opened=f.document.all()[0],state=f.state();
  expect(f.edit(row.id,{'levels.0.label':old})).toStrictEqual({accepted:true,changed:false});expect(f.state()).toStrictEqual(state);expect(f.document.serialize()).toStrictEqual(opening);
  expect(()=>f.edit(row.id,{'levels.1.color':'#abcdef','levels.0.label':'r'.repeat(51)})).toThrow();expect(f.document.serialize()).toStrictEqual(opening);expect(f.native.controller.store.get(row.id).levels[0].label).toBe(old);
  expect(f.edit(row.id,{'levels.0.label':'SYNTHETIC repaired'})).toStrictEqual({accepted:true,changed:true});const accepted=f.document.serialize();
  expect((f.document.all()[0].props as any).levels[0].label).toBe('SYNTHETIC repaired');expect(f.document.all()[0].anchors).toStrictEqual(opened.anchors);exactSibling(f.document.all()[0]);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(opening);expect(f.document.undo()).toBe(false);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toStrictEqual(accepted);
  const saved=f.save();f.load(saved);expect(f.document.serialize()).toStrictEqual(saved);exactSibling(f.document.all()[0]);
 }finally{f.native.dispose();}
});

it('old template application validates every genuine target before the first native or canonical write',async()=>{
 const old='SYNTHETIC\r\n'+'t'.repeat(65),a=fib('SYNTHETIC equal A',old),b=fib('SYNTHETIC unequal B','SYNTHETIC different');
 const f=await templateAdapterHarness([a,b],{'levels.0.label':old,'levels.1.color':'#abcdef'});try{
  const opening=f.document.serialize(),native=structuredClone(f.native.controller.all()),state=f.state();
  expect(()=>f.batches.prepare([a.id,b.id],'synthetic-template')).toThrow();expect(f.document.serialize()).toStrictEqual(opening);expect(f.native.controller.all()).toStrictEqual(native);expect(f.state()).toStrictEqual(state);expect(f.document.undo()).toBe(false);
  f.select([a.id]);expect(f.batches.commit(f.batches.prepare([a.id],'synthetic-template')).changed).toBe(true);
  const expected=structuredClone(opening.drawings as any[]);expected[0].props.levels[1].color='#abcdef';expect(f.document.all()).toStrictEqual(expected);exactSibling(f.document.all()[0]);
  expect(f.native.controller.store.get(a.id).levels[0].label).toBe(old);expect(f.native.controller.store.get(b.id).levels[0].label).toBe('SYNTHETIC different');
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(opening);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});

it('real manager rejects saving a new template with legacy-invalid labels without touching its library or history',async()=>{
 const row=fib('SYNTHETIC manager old','m'.repeat(51)),f=await templateAdapterHarness([row],{});try{
  const before=f.document.serialize(),state=f.state(),native=structuredClone(f.native.controller.all());expect(()=>f.manager.saveTemplate(row.id,'SYNTHETIC refused label')).toThrow();
  expect(f.document.serialize()).toStrictEqual(before);expect(f.native.controller.all()).toStrictEqual(native);expect(f.state()).toStrictEqual(state);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});

it('an in-memory old template cannot erase a raw undefined label before atomic preparation',async()=>{
 const row=fib(),f=await templateAdapterHarness([row],{});try{
  const raw=f.document.serialize();(raw.lvDrawingManager as any).templates[0].properties={'levels.0.label':undefined,'levels.1.color':'#abcdef'};f.document.load(raw);
  const before=f.document.serialize(),native=structuredClone(f.native.controller.all()),state=f.state();
  expect(Object.hasOwn((before.lvDrawingManager as any).templates[0].properties,'levels.0.label')).toBe(true);
  expect(()=>f.batches.prepare([row.id],'synthetic-template')).toThrow();expect(f.document.serialize()).toStrictEqual(before);expect(f.native.controller.all()).toStrictEqual(native);expect(f.state()).toStrictEqual(state);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});

it('keeps non-Fib-retracement undefined no-ops unchanged across direct, owned edit and old-template routes',async()=>{
 const row=createDrawing('fibextension',{id:'SYNTHETIC separate extension',paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
 (row.props!.levels as any[])[0].label='SYNTHETIC other tool';
 expect(patchDrawingProperties(row,{'levels.0.label':undefined})).toBe(row);
 const next=patchDrawingProperties(row,{'levels.0.label':'v'.repeat(51)});expect((next.props!.levels as any[])[0].label).toBe('v'.repeat(51));
 const f=await templateAdapterHarness([row],{});try{
  const raw=f.document.serialize();(raw.lvDrawingManager as any).templates[0].properties={'levels.0.label':undefined};f.document.load(raw);
  const before=f.document.serialize(),state=f.state(),native=structuredClone(f.native.controller.all());
  expect(f.edit(row.id,{'levels.0.label':undefined})).toStrictEqual({accepted:true,changed:false});
  expect(f.batches.commit(f.batches.prepare([row.id],'synthetic-template')).changed).toBe(false);
  expect(f.document.serialize()).toStrictEqual(before);expect(f.state()).toStrictEqual(state);expect(f.native.controller.all()).toStrictEqual(native);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});
