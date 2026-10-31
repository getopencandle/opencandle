import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {drawingEditor,patchDrawingProperties} from '../../src/chart/drawing-port';
import {assertNativeDrawingMatchesCanonical,projectNativeDrawingRecord} from '../../src/chart/drawing-canonical';
import {resolvePortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
import {templateAdapterHarness} from './drawing-template-adapter-harness';
import {duplicateAdapterFixture} from './drawing-duplicate-adapter-harness';

const bg='lvFibBackground',txt='lvFibText';
const bars=[1000,1060,1120,1180,1240].map(time=>({time,open:100,high:200,low:90,close:150,volume:10}));
function row():SerializedDrawing{
 const value=createDrawing('fibretracement',{id:'SYNTHETIC presentation',paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
 delete value.props![bg];delete value.props![txt];return value;
}
const inventory={panes:[{paneId:'price',logicalPaneId:'price',owners:[],replaceable:false}],occupiedIds:['price']};

it('exposes three legacy effective controls without writing defaults during no-op or unrelated editing',()=>{
 const original=row(),editor=drawingEditor(original,bars);
 expect(editor.values[bg+'.opacity']).toBe(6);expect(editor.values[txt+'.enabled']).toBe(true);expect(editor.values[txt+'.position']).toBe('center');
 expect(patchDrawingProperties(original,{[bg+'.opacity']:6,[txt+'.enabled']:true,[txt+'.position']:'center'})).toBe(original);
 const changed=patchDrawingProperties(original,{'levels.0.label':'SYNTHETIC custom label'});
 expect(Object.hasOwn(changed.props!,bg)).toBe(false);expect(Object.hasOwn(changed.props!,txt)).toBe(false);
 expect((changed.props!.levels as any[])[0].label).toBe('SYNTHETIC custom label');expect((original.props!.levels as any[])[0].label).toBeUndefined();
});

it('writes independent complete tuples and retains hidden labels and source geometry',()=>{
 const original=row();(original.props!.levels as any[])[0].label='SYNTHETIC retained';original.props!.background=false;original.props!.showRatios=false;original.props!.showPrices=true;
 const changed=patchDrawingProperties(original,{[bg+'.opacity']:37.5,[txt+'.enabled']:false,[txt+'.position']:'right'});
 expect(changed.props![bg]).toEqual({schemaVersion:1,opacity:37.5});expect(changed.props![txt]).toEqual({schemaVersion:1,enabled:false,position:'right'});
 for(const key of ['levels','background','showRatios','showPrices','numbersSize','labelsSize'])expect(changed.props![key]).toEqual(original.props![key]);
 expect(changed.anchors).toEqual(original.anchors);expect(changed.style).toEqual(original.style);
});

it.each([bg,txt])('retains unknown %s through unrelated edits and portable import',key=>{
 const original=row();original.props![key]={schemaVersion:2,future:{unset:undefined,negativeZero:-0}};
 const changed=patchDrawingProperties(original,{'levels.0.color':'#456789'});
 expect(changed.props![key]).toStrictEqual(original.props![key]);expect(Object.is((changed.props![key] as any).future.negativeZero,-0)).toBe(true);
 const resolved=resolvePortableDrawingDocument({version:1,drawings:[original]},inventory,new Set(['fibretracement']));
 expect(resolved.unavailableIds).toEqual([]);expect(resolved.diagnostics.some(value=>value.code===(key===bg?'FIB_BACKGROUND_UNAVAILABLE':'FIB_TEXT_UNAVAILABLE'))).toBe(true);
 expect((resolved.nativeDocument.drawings as SerializedDrawing[])[0].props![key]).toStrictEqual(original.props![key]);
 const patched=patchDrawingProperties(original,key===bg?{[txt+'.enabled']:false}:{[bg+'.opacity']:20});expect(patched.props![key]).toStrictEqual(original.props![key]);
});

it.each([bg,txt])('retains own undefined %s and refuses JSON-equivalent reinterpretation',key=>{
 const original=row();original.props![key]=undefined;
 const changed=patchDrawingProperties(original,{'style.lineWidth':4});expect(Object.hasOwn(changed.props!,key)).toBe(true);expect(changed.props![key]).toBeUndefined();
 expect(()=>assertNativeDrawingMatchesCanonical(original,deserializeDrawing(original)!.serialize())).not.toThrow();
 expect(()=>assertNativeDrawingMatchesCanonical(original,JSON.parse(JSON.stringify(original)))).toThrow();
 const native=deserializeDrawing(original)!.serialize();native.props![key]=key===bg?{schemaVersion:1,opacity:6}:{schemaVersion:1,enabled:true,position:'center'};
 const retained=projectNativeDrawingRecord(original as any,native as any);expect(Object.hasOwn(retained.props as object,key)).toBe(true);expect((retained.props as any)[key]).toBeUndefined();
});

it.each([
 {[bg+'.opacity']:undefined}, {[bg+'.opacity']:-1}, {[bg+'.opacity']:101}, {[bg+'.opacity']:NaN}, {[bg+'.opacity']:Number.MIN_VALUE},
 {[txt+'.enabled']:undefined}, {[txt+'.enabled']:'true'}, {[txt+'.position']:undefined}, {[txt+'.position']:'middle'}, {[txt+'.enabled']:false,[txt+'.position']:'invalid'},
 {[bg]:undefined}, {['props.'+txt+'.enabled']:true},
])('rejects invalid or dormant raw fields atomically: %j',patch=>{
 const original=row(),before=structuredClone(original);expect(()=>patchDrawingProperties(original,{...patch,'levels.0.label':'must not commit'})).toThrow();expect(original).toStrictEqual(before);
});

it('real adapter edit records one history entry and survives save/reload with hidden custom labels',async()=>{
 const original=row();(original.props!.levels as any[])[0].label='SYNTHETIC hidden text';const f=await templateAdapterHarness([original],{}, {bars});
 try{
  const before=f.document.serialize(),patch={[bg+'.opacity']:100,[txt+'.enabled']:false,[txt+'.position']:'left'};
  expect(f.edit(original.id,patch)).toEqual({accepted:true,changed:true});const saved=f.save();
  for(const actual of [f.document.all()[0],f.native.controller.all()[0]]){expect(actual.props![bg]).toEqual({schemaVersion:1,opacity:100});expect(actual.props![txt]).toEqual({schemaVersion:1,enabled:false,position:'left'});expect(actual.props!.levels[0].label).toBe('SYNTHETIC hidden text');}
  expect(f.document.undo()).toBe(true);f.native.controller.undo();expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);expect(f.native.controller.canUndo()).toBe(false);
  expect(f.document.redo()).toBe(true);f.native.controller.redo();f.load(JSON.parse(JSON.stringify(saved)));expect((f.document.all()[0].props as Record<string,any>)[txt]).toEqual({schemaVersion:1,enabled:false,position:'left'});
  const state=f.state();expect(f.edit(original.id,patch)).toEqual({accepted:true,changed:false});expect(f.state()).toEqual(state);
 }finally{f.native.dispose();}
});

it('real saved template applies both controls without changing target anchors',async()=>{
 const source=row(),target=row();target.id='SYNTHETIC target';source.props![bg]={schemaVersion:1,opacity:25};source.props![txt]={schemaVersion:1,enabled:false,position:'right'};
 const f=await templateAdapterHarness([source,target],{}, {bars});try{
  const id=f.manager.saveTemplate(source.id,'SYNTHETIC presentation preset'),template=f.manager.state().templates.find(value=>value.id===id)!;
  expect(template.properties[bg+'.opacity']).toBe(25);expect(template.properties[txt+'.enabled']).toBe(false);expect(template.properties[txt+'.position']).toBe('right');
  f.select([target.id]);expect(f.batches.commit(f.batches.prepare([target.id],id)).changed).toBe(true);const result=f.document.all().find(value=>value.id===target.id)!;
  expect((result.props as Record<string,any>)[bg]).toEqual(source.props![bg]);expect((result.props as Record<string,any>)[txt]).toEqual(source.props![txt]);expect(result.anchors).toEqual(target.anchors);
 }finally{f.native.dispose();}
});

it.each(['legacy','known','unknown'] as const)('real Duplicate retains %s presentation state',async kind=>{
 const original=row();if(kind==='known'){original.props![bg]={schemaVersion:1,opacity:70};original.props![txt]={schemaVersion:1,enabled:false,position:'right'};}if(kind==='unknown'){original.props![bg]=undefined;original.props![txt]={schemaVersion:2,future:{own:undefined,zero:-0}};}
 const f=await duplicateAdapterFixture([original]);try{f.controller.bindDrawingWorkspaceHost(f.host);const receipt=f.controller.duplicateDrawings([original.id]);const copy=f.f.document.all().find((value:any)=>value.id===receipt.ids[0])!;
  for(const key of [bg,txt]){expect(Object.hasOwn(copy.props!,key)).toBe(kind!=='legacy');expect(copy.props![key]).toStrictEqual(original.props![key]);}expect(copy.anchors).toEqual(original.anchors);expect(f.history.status().undo).toBe(1);
 }finally{f.dispose();}
});
