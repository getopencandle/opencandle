import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {templateAdapterHarness} from './drawing-template-adapter-harness';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';
import {duplicateAdapterFixture} from './drawing-duplicate-adapter-harness';

const key='lvFibTrendLine';
const bars=[1000,1060,1120,1180,1240].map(time=>({time,open:100,high:200,low:90,close:150,volume:10}));
function row(id:string,baseline:unknown={...nativeFibTrendLineDefaults(),enabled:true,color:'rgba(10,20,30,0.35)',width:5,style:'dashed'}):SerializedDrawing{
 const value=createDrawing('fibretracement',{id,paneId:'price',createdAt:1,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();value.props![key]=baseline;return value;
}
const value=(record:any)=>record.props[key];

it('actual adapter baseline edit produces one canonical/native history step and survives a JSON save/reload',async()=>{
 const original=row('SYNTHETIC baseline history'),f=await templateAdapterHarness([original],{}, {bars});
 try{
  const opening=f.document.serialize(),originalAnchors=structuredClone(original.anchors),originalLevels=structuredClone(original.props!.levels);
  const patch={'lvFibTrendLine.enabled':false,'lvFibTrendLine.color':'#abcdef80','lvFibTrendLine.width':10,'lvFibTrendLine.style':'dotted'};
  expect(f.edit(original.id,patch)).toEqual({accepted:true,changed:true});const saved=f.save(),changed={schemaVersion:1,enabled:false,color:'#abcdef80',width:10,style:'dotted'};
  expect(value(f.document.all()[0])).toEqual(changed);expect(value(f.native.controller.all()[0])).toEqual(changed);expect(f.document.all()[0].anchors).toEqual(originalAnchors);expect((f.document.all()[0].props as any).levels).toEqual(originalLevels);
  expect(f.document.undo()).toBe(true);f.native.controller.undo();expect(f.document.serialize()).toEqual(opening);expect(value(f.native.controller.all()[0])).toEqual(value(original));expect(f.document.undo()).toBe(false);expect(f.native.controller.canUndo()).toBe(false);
  expect(f.document.redo()).toBe(true);f.native.controller.redo();expect(value(f.document.all()[0])).toEqual(changed);expect(value(f.native.controller.all()[0])).toEqual(changed);
  f.load(JSON.parse(JSON.stringify(saved)));expect(value(f.document.all()[0])).toEqual(changed);expect(value(f.native.controller.all()[0])).toEqual(changed);const state=f.state();expect(f.edit(original.id,patch)).toEqual({accepted:true,changed:false});expect(f.state()).toEqual(state);
 }finally{f.native.dispose();}
});

it('saving and applying a real template includes baseline settings independently of level styling',async()=>{
 const first=row('SYNTHETIC baseline template source'),second=row('SYNTHETIC baseline target',{...nativeFibTrendLineDefaults(),enabled:false});
 const f=await templateAdapterHarness([first,second],{}, {bars});try{
  const id=f.manager.saveTemplate(first.id,'SYNTHETIC baseline preset'),template=f.manager.state().templates.find(item=>item.id===id)!;
  for(const field of ['enabled','color','width','style'])expect(template.properties[key+'.'+field]).toEqual((value(first) as any)[field]);
  f.select([second.id]);expect(f.batches.commit(f.batches.prepare([second.id],id)).changed).toBe(true);expect(value(f.document.all().find(item=>item.id===second.id))).toEqual(value(first));expect(value(f.native.controller.all().find((item:any)=>item.id===second.id))).toEqual(value(first));
  expect(f.document.all().find(item=>item.id===second.id)?.anchors).toEqual(second.anchors);expect(f.document.undo()).toBe(true);f.native.controller.undo();expect(value(f.document.all().find(item=>item.id===second.id))).toEqual(value(second));expect(value(f.native.controller.all().find((item:any)=>item.id===second.id))).toEqual(value(second));
 }finally{f.native.dispose();}
});

it.each([undefined,{...nativeFibTrendLineDefaults(),enabled:true,future:undefined}])('unrelated actual adapter edits and template application retain unsupported member %j',async baseline=>{
 const original=row('SYNTHETIC unknown baseline',baseline);if(baseline===undefined)original.props![key]=undefined;
 const f=await templateAdapterHarness([original],{'style.lineWidth':7}, {bars});try{
  const assertRetained=()=>{for(const actual of [f.document.all()[0],f.native.controller.all()[0]]){expect(Object.hasOwn(actual.props!,key)).toBe(true);expect(value(actual)).toStrictEqual(baseline);}};
  assertRetained();expect(f.edit(original.id,{'levels.0.color':'#123456'}).changed).toBe(true);assertRetained();
  expect(f.batches.commit(f.batches.prepare([original.id],'synthetic-template')).changed).toBe(true);assertRetained();
  const before=f.document.serialize();expect(()=>f.edit(original.id,{'lvFibTrendLine.enabled':true,'style.lineWidth':3})).toThrow();expect(f.document.serialize()).toEqual(before);assertRetained();
  const saved=f.save();f.load(saved);assertRetained();expect(f.state().analysisUnavailable).toBe('');
 }finally{f.native.dispose();}
});

it.each(['known','legacy','unknown'] as const)('actual Duplicate preserves %s baseline and one workspace history step',async kind=>{
 const original=row('SYNTHETIC duplicate baseline');if(kind==='legacy')delete original.props![key];if(kind==='unknown')original.props![key]={...nativeFibTrendLineDefaults(),enabled:true,future:{own:undefined,zero:-0}};
 const f=await duplicateAdapterFixture([original]);try{
  f.controller.bindDrawingWorkspaceHost(f.host);const before=f.workspace(),receipt=f.controller.duplicateDrawings([original.id]);expect(receipt).toMatchObject({canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true,nativeState:'complete'});expect(receipt.ids).toHaveLength(1);
  const copy=f.f.document.all().find((item:any)=>item.id===receipt.ids[0])!;expect(copy.anchors).toStrictEqual(original.anchors);expect(Object.hasOwn(copy.props!,key)).toBe(kind!=='legacy');expect(value(copy)).toStrictEqual(value(original));
  const native=f.f.native.controller.all().find((item:any)=>item.id===receipt.ids[0]);expect(value(native)).toStrictEqual(kind==='legacy'?nativeFibTrendLineDefaults():value(original));expect(f.history.status().undo).toBe(1);expect(f.history.undo(f.workspace(),null)?.workspace).toBe(before);expect(f.state().analysisUnavailable).toBe('');
 }finally{f.dispose();}
});
