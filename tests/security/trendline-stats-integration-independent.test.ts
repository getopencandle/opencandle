import {expect,it,vi} from 'vitest';
import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {drawingEditor,patchDrawingProperties} from '../../src/chart/drawing-port';
import {templateProperties} from '../../src/chart/drawing-manager';
import {DrawingEditRecoveryError} from '../../src/chart/drawing-edit-transaction';
import {templateAdapterHarness} from '../chart/drawing-template-adapter-harness';

const prefix='props.lvTrendlineStats.';
const empty={schemaVersion:1,priceRange:false,percentChange:false,barsRange:false,dateTimeRange:false,alwaysShow:false,position:'right'};
const chosen={schemaVersion:1,priceRange:true,percentChange:false,barsRange:true,dateTimeRange:true,alwaysShow:true,position:'below'};
const opaque={schemaVersion:99,mode:'SYNTHETIC future statistics',payload:{values:[false,null,'retain\r\nexact']}};
const bars=Array.from({length:6},(_,index)=>({time:1000+60*index,open:100,high:220,low:90,close:120,volume:10}));
const absent=Symbol('legacy omission');

function row(id:string,stats:unknown=absent):SerializedDrawing{
 const result=createDrawing('trendline',{id,paneId:'price',anchors:[{time:1000000,price:100},{time:1240000,price:200}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize();
 delete result.props;
 if(stats!==absent)result.props={lvTrendlineStats:structuredClone(stats),futureProps:{retain:[1,null,'SYNTHETIC']}};
 (result as any).futureRecord={untouched:'SYNTHETIC canonical'};
 return result;
}
function paths(settings:Record<string,unknown>){return Object.fromEntries(Object.entries(settings).filter(([name])=>name!=='schemaVersion').map(([name,value])=>[prefix+name,value]));}
function statsProperties(properties:Record<string,unknown>){return Object.fromEntries(Object.entries(properties).filter(([path])=>path.startsWith(prefix)));}
function stats(record:any){return record.props?.lvTrendlineStats;}
function methodOwner(value:object,key:string):object{
 for(let owner:object|null=value;owner;owner=Object.getPrototypeOf(owner))if(Object.getOwnPropertyDescriptor(owner,key))return owner;
 throw Error('Actual native method is unavailable: '+key);
}

it('legacy opening values and complete untouched Apply retain exact omission and record identity',()=>{
 const source=row('SYNTHETIC stats legacy'),editor=drawingEditor(source,bars),before=structuredClone(source);
 expect(statsProperties(editor.values)).toEqual(paths(empty));
 expect(editor.fields.filter(field=>field.path.startsWith(prefix)).map(field=>field.path).sort()).toEqual(Object.keys(paths(empty)).sort());
 expect(patchDrawingProperties(source,editor.values)).toBe(source);
 expect(patchDrawingProperties(source,paths(empty))).toBe(source);
 const styled=patchDrawingProperties(source,{'style.lineWidth':3,...paths(empty)});
 expect(Object.hasOwn(styled.props??{},'lvTrendlineStats')).toBe(false);expect(styled.style.lineWidth).toBe(3);expect(source).toEqual(before);
});

it('a statistics-only canonical patch never calls actual native applySettings or serialize',()=>{
 const source=row('SYNTHETIC stats only'),model=createDrawing('trendline',{paneId:'price'})!,apply=vi.spyOn(methodOwner(model,'applySettings') as any,'applySettings'),serialize=vi.spyOn(methodOwner(model,'serialize') as any,'serialize');
 try{
  const changed=patchDrawingProperties(source,paths(chosen));expect(stats(changed)).toEqual(chosen);expect(changed.anchors).toEqual(source.anchors);expect(changed.style).toEqual(source.style);
  expect(apply).not.toHaveBeenCalled();expect(serialize).not.toHaveBeenCalled();expect(stats(source)).toBeUndefined();
 }finally{serialize.mockRestore();apply.mockRestore();}
});

it('direct stats paths reject explicit undefined and malformed values before a valid sibling changes anything',()=>{
 const source=row('SYNTHETIC direct invalid'),before=structuredClone(source);
 for(const invalid of [{[prefix+'priceRange']:undefined},{[prefix+'alwaysShow']:'true'},{[prefix+'position']:'middle'},{[prefix+'schemaVersion']:1},{[prefix+'future']:true}]){
  expect(()=>patchDrawingProperties(source,{'style.lineWidth':4,...invalid})).toThrow();expect(source).toEqual(before);
 }
 // Existing unrelated optional native fields remain omission-compatible.
 expect(patchDrawingProperties(source,{'text.value':undefined})).toBe(source);
});

it('actual single-edit admission rejects explicit stats undefined before detached input normalization',async()=>{
 const f=await templateAdapterHarness([row('SYNTHETIC actual undefined')],undefined,{bars});try{
  const before=f.document.serialize(),update=vi.spyOn(f.native.controller,'updateMany'),state=f.state();
  expect(()=>f.edit(f.rows[0].id,{'style.lineWidth':4,[prefix+'priceRange']:undefined})).toThrow();
  expect(update).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(before);expect(f.state()).toEqual(state);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});

it('mixed scalar, annotation, coordinates and stats commit once while actual native serialization strips only canonical stats',async()=>{
 const initial=row('SYNTHETIC combined');initial.text={value:'SYNTHETIC before',size:'normal',hAlign:'center',vAlign:'center',lvAnnotation:{schemaVersion:1,enabled:false},futureText:{preserved:'SYNTHETIC'}} as any;
 const f=await templateAdapterHarness([initial],undefined,{bars});try{
  const before=f.document.serialize(),model=createDrawing('trendline',{paneId:'price'})!,method=methodOwner(model,'applySettings') as any,original=method.applySettings,seen:string[][]=[];
  const apply=vi.spyOn(method,'applySettings').mockImplementation(function(this:object,patch:unknown){seen.push(Object.keys(patch as object));return Reflect.apply(original,this,[patch]);});
  try{expect(f.edit(initial.id,{'style.lineWidth':4,'text.value':'SYNTHETIC after','text.lvAnnotation.enabled':true,...paths(chosen)},[{price:110},{timeSeconds:1300}])).toEqual({accepted:true,changed:true});}
  finally{apply.mockRestore();}
  const accepted=f.document.serialize(),current=f.document.all()[0];
  expect(stats(current)).toEqual(chosen);expect(current.anchors).toEqual([{time:1000000,price:110},{time:1300000,price:200}]);expect((current.style as any).lineWidth).toBe(4);
  expect(current.text).toEqual(expect.objectContaining({value:'SYNTHETIC after',lvAnnotation:{schemaVersion:1,enabled:true},futureText:{preserved:'SYNTHETIC'}}));expect(current.futureRecord).toEqual({untouched:'SYNTHETIC canonical'});
  expect(seen.flat().some(path=>path.startsWith(prefix))).toBe(false);
  const native=f.native.controller.store.get(initial.id).serialize();expect(Object.hasOwn(native.props??{},'lvTrendlineStats')).toBe(false);expect(native.anchors).toEqual(current.anchors);expect(native.style.lineWidth).toBe(4);
  expect(f.state()).toMatchObject({notifications:1,reconciliations:0,nativeEdited:1,analysisUnavailable:''});expect(f.save()).toEqual(accepted);expect(f.state().reconciliations).toBe(1);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(accepted);
 }finally{f.native.dispose();}
});

it('opaque future statistics hide only Stats controls and survive unrelated actual text/style edits byte-for-byte',async()=>{
 const initial=row('SYNTHETIC opaque',opaque),editor=drawingEditor(initial,bars);
 expect(editor.fields.some(field=>field.path.startsWith(prefix))).toBe(false);expect((editor as any).statsDiagnostic).toBeTruthy();
 const f=await templateAdapterHarness([initial],undefined,{bars});try{
  const original=JSON.stringify(stats(f.document.all()[0])),before=f.document.serialize();
  expect(f.edit(initial.id,{'style.lineWidth':4,'text.value':'SYNTHETIC unrelated'}).changed).toBe(true);
  const current=f.document.all()[0];expect(JSON.stringify(stats(current))).toBe(original);expect((current.props as any).futureProps).toEqual({retain:[1,null,'SYNTHETIC']});expect((current.text as any).value).toBe('SYNTHETIC unrelated');
  const accepted=f.document.serialize();expect(()=>f.edit(initial.id,{[prefix+'priceRange']:true})).toThrow();expect(f.document.serialize()).toEqual(accepted);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});

it('templates include all six explicit supported values, including all-off, and omit legacy or opaque statistics',()=>{
 expect(statsProperties(templateProperties(row('SYNTHETIC legacy template')))).toEqual({});
 expect(statsProperties(templateProperties(row('SYNTHETIC future template',opaque)))).toEqual({});
 expect(statsProperties(templateProperties(row('SYNTHETIC enabled template',chosen)))).toEqual(paths(chosen));
 expect(statsProperties(templateProperties(row('SYNTHETIC explicit off template',empty)))).toEqual(paths(empty));
});

it('actual template save/apply retains canonical stats, target identity and one command; repeated Apply is a true no-op',async()=>{
 const target=row('SYNTHETIC target',empty);target.anchors=[{time:1060000,price:130},{time:1300000,price:180}];
 const f=await templateAdapterHarness([row('SYNTHETIC source',chosen),target],undefined,{bars});try{
  const id=f.manager.saveTemplate('SYNTHETIC source','SYNTHETIC statistics template');
  const saved=f.manager.state().templates.find(template=>template.id===id)!;expect(statsProperties(saved.properties)).toEqual(paths(chosen));
  f.select([target.id]);const before=f.document.serialize(),beforeTarget=f.document.all().find(value=>value.id===target.id)!;
  expect(f.batches.commit(f.batches.prepare([target.id],id)).changed).toBe(true);
  const accepted=f.document.serialize(),current=f.document.all().find(value=>value.id===target.id)!;expect(stats(current)).toEqual(chosen);expect(current.anchors).toEqual(beforeTarget.anchors);expect(current.id).toBe(beforeTarget.id);expect(current.lvPaneBinding).toEqual(beforeTarget.lvPaneBinding);expect(current.futureRecord).toEqual(beforeTarget.futureRecord);
  expect(Object.hasOwn(f.native.controller.store.get(target.id).serialize().props??{},'lvTrendlineStats')).toBe(false);
  const state=f.state(),defaults=f.native.controller.toolDefaults();expect(f.batches.commit(f.batches.prepare([target.id],id)).changed).toBe(false);expect(f.state()).toEqual(state);expect(f.native.controller.toolDefaults()).toEqual(defaults);expect(f.document.serialize()).toEqual(accepted);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toEqual(accepted);
 }finally{f.native.dispose();}
});

it('a template without stats does not override supported target stats, and explicit all-off does',async()=>{
 const source=row('SYNTHETIC no-stats template'),target=row('SYNTHETIC retained target',chosen);target.style.lineWidth=4;
 const f=await templateAdapterHarness([source,target],undefined,{bars});try{
  const legacy=f.manager.saveTemplate(source.id,'SYNTHETIC legacy style');f.select([target.id]);expect(f.batches.commit(f.batches.prepare([target.id],legacy)).changed).toBe(true);expect(stats(f.document.all().find(value=>value.id===target.id))).toEqual(chosen);
  f.select([source.id]);f.edit(source.id,{[prefix+'priceRange']:true});f.edit(source.id,{[prefix+'priceRange']:false});expect(stats(f.document.all().find(value=>value.id===source.id))).toEqual(empty);
  const off=f.manager.saveTemplate(source.id,'SYNTHETIC explicit off');f.select([target.id]);expect(f.batches.commit(f.batches.prepare([target.id],off)).changed).toBe(true);expect(stats(f.document.all().find(value=>value.id===target.id))).toEqual(empty);
 }finally{f.native.dispose();}
});

it('one opaque target refuses an entire supported Stats template before native, defaults or history mutation',async()=>{
 const f=await templateAdapterHarness([row('SYNTHETIC eligible'),row('SYNTHETIC opaque target',opaque)],{'style.lineWidth':4,...paths(chosen)},{bars});try{
  const before=f.document.serialize(),defaults=f.native.controller.toolDefaults(),update=vi.spyOn(f.native.controller,'updateMany');
  expect(()=>f.batches.prepare(f.rows.map(value=>value.id),'synthetic-template')).toThrow();
  expect(update).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(before);expect(f.native.controller.toolDefaults()).toEqual(defaults);expect(f.document.undo()).toBe(false);expect(f.state()).toMatchObject({notifications:0,nativeEdited:0});
 }finally{f.native.dispose();}
});

it('explicit undefined in an in-memory saved template rejects before read-copy normalization',async()=>{
 const f=await templateAdapterHarness([row('SYNTHETIC bad saved template')],{'style.lineWidth':4},{bars});try{
  const imported=f.document.serialize() as any;imported.lvDrawingManager.templates[0].properties[prefix+'priceRange']=undefined;f.document.load(imported);
  const before=f.document.serialize(),update=vi.spyOn(f.native.controller,'updateMany');
  expect(()=>f.batches.prepare([f.rows[0].id],'synthetic-template')).toThrow();expect(update).not.toHaveBeenCalled();expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});

it('actual saved-document load round trips supported/opaque Stats and template values while native rows omit them',async()=>{
 const f=await templateAdapterHarness([row('SYNTHETIC roundtrip known',chosen),row('SYNTHETIC roundtrip opaque',opaque)],paths(chosen),{bars});try{
  const snapshot=JSON.parse(JSON.stringify(f.save()));f.load(snapshot);const restored=f.save();
  expect(restored).toEqual(snapshot);expect((restored.drawings as any[]).map(stats)).toEqual([chosen,opaque]);
  expect((restored.lvDrawingManager as any).templates[0].properties).toEqual(paths(chosen));
  for(const native of f.native.controller.all())expect(Object.hasOwn(native.props??{},'lvTrendlineStats')).toBe(false);
 }finally{f.native.dispose();}
});

it('accepted publication rejection retains exact canonical Stats and one history command',async()=>{
 const f=await templateAdapterHarness([row('SYNTHETIC rejected notification')],undefined,{bars});try{
  const before=f.document.serialize();let saved:Record<string,unknown>|undefined;f.subscribe(()=>{saved=f.save();return false;});let failure:unknown;
  try{f.edit(f.rows[0].id,paths(chosen));}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(DrawingEditRecoveryError);expect((failure as DrawingEditRecoveryError).accepted).toBe(true);expect(stats(f.document.all()[0])).toEqual(chosen);expect(saved).toEqual(f.document.serialize());
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);expect(f.document.undo()).toBe(false);expect(f.state()).toMatchObject({notifications:1,nativeEdited:1});
 }finally{f.native.dispose();}
});
