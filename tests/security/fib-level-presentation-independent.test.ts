import {createDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {expect,it} from 'vitest';
import {composeFibBackgroundAlpha,placeFibCustomText,readFibBackground,readFibText,validateFibBackground,validateFibText,patchFibLevelPresentationProps,retainFibLevelPresentationMembers} from '../../src/chart/fib-level-presentation-data';
import {drawingEditor,patchDrawingProperties} from '../../src/chart/drawing-port';
import {templateProperties} from '../../src/chart/drawing-manager';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {templateAdapterHarness} from '../chart/drawing-template-adapter-harness';
import {drawingProjection} from '../chart/drawing-native-harness';
import {LosslessDrawingDocument} from '../../src/chart/contracts';

// Synthetic inputs and literal arithmetic/coordinate expectations. No expected
// result is computed by the production alpha or placement implementation.
const bars=[1000,1060,1120,1180,1240].map(time=>({time,open:100,high:200,low:90,close:150,volume:10}));
const bg='lvFibBackground',text='lvFibText';
function fib(id='SYNTHETIC independent presentation'):SerializedDrawing{
 const row=createDrawing('fibretracement',{id,paneId:'price',zIndex:4,anchors:[{time:1000000,price:100},{time:1240000,price:200}]})!.serialize();
 row.props={...row.props,reverse:false,background:false,showRatios:false,showPrices:true,levels:[
  {ratio:.236,color:'#112233',enabled:true,label:'SYNTHETIC first'},
  {ratio:.5,color:'#445566',enabled:false,label:'SYNTHETIC dormant'},
  {ratio:.618,color:'#778899',enabled:true,label:'SYNTHETIC last'},
 ]};delete row.props[bg];delete row.props[text];return row;
}
function opaque(){return{schemaVersion:9,enabled:false,future:{missing:undefined,minus:-0,label:'SYNTHETIC unknown'}};}
function exactOpaque(value:any){expect(Object.hasOwn(value.future,'missing')).toBe(true);expect(value.future.missing).toBeUndefined();expect(Object.is(value.future.minus,-0)).toBe(true);}

it.each([
 {schemaVersion:1,enabled:false,position:'future'},
 {schemaVersion:1,enabled:false,position:undefined},
 {schemaVersion:1,enabled:false,position:'center',future:0},
 {schemaVersion:2,enabled:false,position:'center'},
])('validates the complete dormant custom-text tuple %j',value=>{
 expect(()=>validateFibText(value)).toThrow();
 expect(readFibText({[text]:value}).state).toBe('unavailable');
 expect(readFibBackground({[text]:value}).state).toBe('legacy');
});

it('rejects accessor and hidden tuple fields without reading a getter',()=>{
 let reads=0;const tuple={schemaVersion:1,enabled:false};Object.defineProperty(tuple,'position',{enumerable:true,get(){reads++;return'center';}});
 expect(readFibText({[text]:tuple}).state).toBe('unavailable');expect(()=>validateFibText(tuple)).toThrow();expect(reads).toBe(0);
 const background={schemaVersion:1};Object.defineProperty(background,'opacity',{value:6,enumerable:false});
 expect(()=>validateFibBackground(background)).toThrow();expect(readFibBackground({[bg]:background}).state).toBe('unavailable');
});

it.each([[1,6,.06],[.5,35,.175],[.25,80,.2],[.75,0,0],[.25,100,.25]] as const)('composes incoming alpha %s and independent percent %s into literal %s',(incoming,percent,expected)=>{
 expect(composeFibBackgroundAlpha(incoming,percent)).toBe(expected);
});

it('refuses nonrepresentable positive alpha and invalid values instead of silently making a transparent band',()=>{
 expect(()=>composeFibBackgroundAlpha(Number.MIN_VALUE,50)).toThrow();
 for(const invalid of [-1,101,Infinity,NaN,'6',undefined])expect(()=>validateFibBackground({schemaVersion:1,opacity:invalid})).toThrow();
 expect(composeFibBackgroundAlpha(0,6)).toBe(0);
});

it.each([
 [100,140,'left',104,43],[140,100,'right',136,43],
 [100,106,'left',103,43],[106,100,'right',103,43],
 [-8,-8,'center',-8,43],[-20,20,'center',0,43],
] as const)('places resolved entry %s→%s at %s with literal coordinates',(x1,x2,position,x,y)=>{
 expect(placeFibCustomText({x1,x2,y1:50,y2:50},position)).toStrictEqual({x,y,align:position});
});

it('rejects nonhorizontal and overflowing entries before supplying drawing coordinates',()=>{
 expect(()=>placeFibCustomText({x1:0,x2:100,y1:50,y2:51},'left')).toThrow();
 expect(()=>placeFibCustomText({x1:-Number.MAX_VALUE,x2:Number.MAX_VALUE,y1:0,y2:0},'center')).toThrow();
 expect(()=>placeFibCustomText({x1:Number.MAX_VALUE,x2:Number.MAX_VALUE,y1:0,y2:0},'right')).toThrow();
});

it('patches a known sibling while retaining an unknown whole member and untouched own presence',()=>{
 const original={[bg]:opaque(),[text]:{schemaVersion:1,enabled:false,position:'left'},future:undefined,minus:-0};
 const next=patchFibLevelPresentationProps(original,{[text+'.position']:'right'}) as any;
 expect(next).toStrictEqual({...original,[text]:{schemaVersion:1,enabled:false,position:'right'}});exactOpaque(next[bg]);
 expect(next[bg]).not.toBe(original[bg]);expect(Object.hasOwn(next,'future')).toBe(true);expect(Object.is(next.minus,-0)).toBe(true);
 expect(()=>patchFibLevelPresentationProps(original,{[bg+'.opacity']:35,[text+'.enabled']:true})).toThrow();
 expect(original[text]).toStrictEqual({schemaVersion:1,enabled:false,position:'left'});
});

it('keeps legacy effective defaults absent and preserves signed zero when deliberately selected',()=>{
 const legacy={future:'SYNTHETIC'};
 expect(patchFibLevelPresentationProps(legacy,{[bg+'.opacity']:6,[text+'.enabled']:true,[text+'.position']:'center'})).toBe(legacy);
 const minus=patchFibLevelPresentationProps(legacy,{[bg+'.opacity']:-0}) as any;expect(Object.is(minus[bg].opacity,-0)).toBe(true);
 const plus=patchFibLevelPresentationProps(minus,{[bg+'.opacity']:0}) as any;expect(Object.is(plus[bg].opacity,0)).toBe(true);expect(Object.is(plus[bg].opacity,-0)).toBe(false);
});

it('restores only matched semantic members after normalizer omission and does not revive unrelated undefined',()=>{
 const raw=fib();raw.props![bg]=undefined;raw.props![text]=opaque();raw.props!.unrelated=undefined;
 const prepared=prepareWorkspaceJSON({row:raw}).row as unknown as SerializedDrawing;
 expect(Object.hasOwn(prepared.props!,bg)).toBe(false);
 const retained=retainFibLevelPresentationMembers(raw,prepared);
 expect(Object.hasOwn(retained.props!,bg)).toBe(true);expect(retained.props![bg]).toBeUndefined();exactOpaque(retained.props![text]);
 expect(Object.hasOwn(retained.props!,'unrelated')).toBe(false);expect(retained).not.toBe(prepared);
 expect(()=>retainFibLevelPresentationMembers(raw,{...prepared,id:'SYNTHETIC replacement'})).toThrow();
});

it('rejects raw undefined, whole tuples, aliases, and accessor paths through the actual port before detach',()=>{
 const row=fib(),before=structuredClone(row);let reads=0;
 for(const patch of [
  {[bg+'.opacity']:undefined},{[text+'.enabled']:undefined},{[text+'.position']:undefined},
  {[bg]:{schemaVersion:1,opacity:35}},{['props.'+text+'.enabled']:false},{[text+'.schemaVersion']:1},
 ])expect(()=>patchDrawingProperties(row,patch)).toThrow();
 const getter={};Object.defineProperty(getter,text+'.position',{enumerable:true,get(){reads++;return'right';}});
 expect(()=>patchDrawingProperties(row,getter)).toThrow();expect(reads).toBe(0);expect(row).toStrictEqual(before);
});

it('actual port changes dormant settings without enabling their presentation or changing ordinal levels',()=>{
 const row=fib(),next=patchDrawingProperties(row,{[bg+'.opacity']:35,[text+'.enabled']:false,[text+'.position']:'right'}),expected=structuredClone(row);
 expected.props![bg]={schemaVersion:1,opacity:35};expected.props![text]={schemaVersion:1,enabled:false,position:'right'};
 expect(next).toStrictEqual(expected);expect(patchDrawingProperties(next,{[bg+'.opacity']:35,[text+'.position']:'right'})).toBe(next);
 const editor=drawingEditor(next,bars);expect(editor.values[bg+'.opacity']).toBe(35);expect(editor.values[text+'.position']).toBe('right');
});

it.each(['background','text'] as const)('actual port keeps unknown %s local while the other feature and level color remain editable',unknown=>{
 const row=fib(),unknownKey=unknown==='background'?bg:text;row.props![unknownKey]=undefined;
 const patch=unknown==='background'?{[text+'.enabled']:false,[text+'.position']:'left'}:{[bg+'.opacity']:35};
 const next=patchDrawingProperties(row,{...patch,'levels.0.color':'#abcdef'});
 expect(Object.hasOwn(next.props!,unknownKey)).toBe(true);expect(next.props![unknownKey]).toBeUndefined();
 expect((next.props!.levels as any[])[0].color).toBe('#abcdef');
 expect(next.props![unknown==='background'?text:bg]).toStrictEqual(unknown==='background'?{schemaVersion:1,enabled:false,position:'left'}:{schemaVersion:1,opacity:35});
 const editor=drawingEditor(next,bars);expect(editor.fields.some(field=>field.path.startsWith((unknown==='background'?text:bg)+'.'))).toBe(true);
});

it.each(['composite','own undefined'] as const)('actual owned edit, no-op, Undo Redo and reopen retain %s sibling and the accepted tuple',async retained=>{
 const row=fib();row.props![bg]=retained==='composite'?opaque():undefined;const f=await templateAdapterHarness([row],undefined,{bars});try{
  const opening=f.document.serialize(),opened=f.document.all()[0],expected=structuredClone(opened);
  const assertSibling=(value:any)=>{expect(Object.hasOwn(value.props,bg)).toBe(true);if(retained==='composite')exactOpaque(value.props[bg]);else expect(value.props[bg]).toBeUndefined();};
  assertSibling(opened);
  (expected.props as any)[text]={schemaVersion:1,enabled:false,position:'right'};
  expect(f.edit(row.id,{[text+'.enabled']:false,[text+'.position']:'right'})).toStrictEqual({accepted:true,changed:true});
  expect(f.document.all()[0]).toStrictEqual(expected);assertSibling(f.document.all()[0]);
  const accepted=f.document.serialize(),state=f.state();expect(f.edit(row.id,{[text+'.position']:'right'})).toStrictEqual({accepted:true,changed:false});expect(f.state()).toStrictEqual(state);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(opening);expect(f.document.undo()).toBe(false);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toStrictEqual(accepted);
  const saved=f.save();f.load(saved);expect(f.document.serialize()).toStrictEqual(saved);assertSibling(f.document.all()[0]);
 }finally{f.native.dispose();}
});

it('validated template batch transfers the complete known choices while preserving target-only opaque sibling and geometry',async()=>{
 const source=fib('SYNTHETIC template source'),target=fib('SYNTHETIC template target');
 source.props![bg]=opaque();target.props![bg]=opaque();target.anchors=[{time:1060000,price:120},{time:1180000,price:180}];
 const configured=patchDrawingProperties(source,{[text+'.enabled']:false,[text+'.position']:'left'}),properties=templateProperties(configured);
 expect(properties[text+'.enabled']).toBe(false);expect(properties[text+'.position']).toBe('left');expect(Object.keys(properties).some(key=>key.startsWith(bg+'.'))).toBe(false);
 const f=await templateAdapterHarness([source,target],properties,{bars});try{
  f.select([target.id]);const opening=f.document.serialize(),prior=f.document.all()[1],sourceBefore=f.document.all()[0];
  expect(f.batches.commit(f.batches.prepare([target.id],'synthetic-template')).changed).toBe(true);
  const actual=f.document.all()[1];expect(actual.anchors).toStrictEqual(prior.anchors);expect((actual.props as any)[bg]).toStrictEqual((prior.props as any)[bg]);exactOpaque((actual.props as any)[bg]);
  expect((actual.props as any)[text]).toStrictEqual({schemaVersion:1,enabled:false,position:'left'});expect(f.document.all()[0]).toStrictEqual(sourceBefore);
  const state=f.state();expect(f.batches.commit(f.batches.prepare([target.id],'synthetic-template')).changed).toBe(false);expect(f.state()).toStrictEqual(state);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(opening);expect(f.document.undo()).toBe(false);
 }finally{f.native.dispose();}
});

it('actual in-memory template preparation rejects raw undefined presentation paths before native or history writes',async()=>{
 const row=fib(),f=await templateAdapterHarness([row],{}, {bars});try{
  const opening=f.document.serialize(),nativeBefore=structuredClone(f.native.controller.all()),state=f.state();
  for(const path of [bg+'.opacity',text+'.enabled',text+'.position']){
   const supplied=structuredClone(opening);(supplied.lvDrawingManager as any).templates[0].properties={[path]:undefined};
   // This intentionally enters as an existing in-memory manager value, not a
   // JSON import that has already omitted the explicit undefined field.
   f.document.load(supplied);expect(Object.hasOwn(((f.document.serialize().lvDrawingManager as any).templates[0].properties),path)).toBe(true);
   expect(()=>f.batches.prepare([row.id],'synthetic-template')).toThrow();
   expect(f.document.serialize()).toStrictEqual(supplied);expect(f.document.undo()).toBe(false);
   expect(f.native.controller.all()).toStrictEqual(nativeBefore);expect(f.state()).toStrictEqual(state);
  }
 }finally{f.native.dispose();}
});

// Added after root preserved the separate four-case template-policy original.
// These are new review controls, not assertions claimed in the first29 run.
it('captures only canonical explicit supported presentation tuples, preserving legacy omission and unknown presence',()=>{
 const legacy=fib(),explicit=fib(),unknown=fib();
 explicit.props![bg]={schemaVersion:1,opacity:6};explicit.props![text]={schemaVersion:1,enabled:true,position:'center'};
 unknown.props![bg]=undefined;unknown.props![text]=opaque();
 const paths=[bg+'.opacity',text+'.enabled',text+'.position'];
 const legacyProperties=templateProperties(legacy),explicitProperties=templateProperties(explicit),unknownProperties=templateProperties(unknown);
 for(const path of paths){expect(Object.hasOwn(legacyProperties,path)).toBe(false);expect(Object.hasOwn(explicitProperties,path)).toBe(true);expect(Object.hasOwn(unknownProperties,path)).toBe(false);}
 expect(explicitProperties[paths[0]]).toBe(6);expect(explicitProperties[paths[1]]).toBe(true);expect(explicitProperties[paths[2]]).toBe('center');
 expect(Object.hasOwn(legacy.props!,bg)).toBe(false);expect(Object.hasOwn(unknown.props!,bg)).toBe(true);expect(unknown.props![bg]).toBeUndefined();exactOpaque(unknown.props![text]);
 expect(patchDrawingProperties(legacy,{[bg+'.opacity']:6,[text+'.enabled']:true,[text+'.position']:'center'})).toBe(legacy);
});

it('explicit default template into wholly absent props materializes both members without reversing the native Fib geometry',async()=>{
 const row=fib();delete row.props;
 const f=await templateAdapterHarness([row],{[bg+'.opacity']:6,[text+'.enabled']:true,[text+'.position']:'center'},{bars});try{
  const before=f.document.serialize(),opened=f.document.all()[0],prices=f.native.controller.store.get(row.id).levelLines(drawingProjection).map((line:any)=>line.price);
  expect(Object.hasOwn(opened,'props')).toBe(false);
  expect(f.batches.commit(f.batches.prepare([row.id],'synthetic-template')).changed).toBe(true);
  const accepted=f.document.serialize(),actual=f.document.all()[0],props=actual.props as any;
  expect(props[bg]).toStrictEqual({schemaVersion:1,opacity:6});expect(props[text]).toStrictEqual({schemaVersion:1,enabled:true,position:'center'});
  expect(actual.anchors).toStrictEqual(opened.anchors);expect(f.native.controller.store.get(row.id).levelLines(drawingProjection).map((line:any)=>line.price)).toStrictEqual(prices);
  const state=f.state();expect(f.batches.commit(f.batches.prepare([row.id],'synthetic-template')).changed).toBe(false);expect(f.state()).toStrictEqual(state);
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);expect(f.document.undo()).toBe(false);expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toStrictEqual(accepted);
 }finally{f.native.dispose();}
});

it.each(['forged next undefined','forged next signed zero','stale expected undefined','stale expected signed zero'] as const)('manager metadata staging rejects JSON-equivalent drawing change: %s',kind=>{
 const row=fib();row.props![bg]=opaque();row.props![text]=undefined;
 const document=new LosslessDrawingDocument();document.load({version:1,drawings:[row]});
 const before=document.serialize(),expected=structuredClone(before),next=structuredClone(before);
 next.lvDrawingManager={schemaVersion:1,groups:[],templates:[]};
 const changed=(kind.startsWith('forged next')?next:expected).drawings as any[];
 if(kind.endsWith('undefined'))delete changed[0].props[text];else changed[0].props[bg].future.minus=0;
 const stripManager=(value:Record<string,unknown>)=>{const copy={...value};delete copy.lvDrawingManager;return copy;};
 expect(JSON.stringify(stripManager(expected))).toBe(JSON.stringify(stripManager(next)));
 expect(()=>document.stageManagerMetadata(expected,next)).toThrow(/changed|cannot|drawing/i);
 expect(document.serialize()).toStrictEqual(before);expect(document.undo()).toBe(false);expect(document.redo()).toBe(false);
});

it('real manager Save Template is one metadata command retaining exact unknown presentation members through Undo Redo',async()=>{
 const row=fib();row.props![bg]=opaque();row.props![text]=undefined;
 const f=await templateAdapterHarness([row],{}, {bars});try{
  const opening=f.document.serialize(),drawingBefore=f.document.all()[0],state=f.state();
  const id=f.manager.saveTemplate(row.id,'SYNTHETIC independent exact metadata');
  const accepted=f.document.serialize();expect(f.document.all()[0]).toStrictEqual(drawingBefore);
  exactOpaque((f.document.all()[0].props as any)[bg]);expect(Object.hasOwn(f.document.all()[0].props as object,text)).toBe(true);
  const template=f.manager.state().templates.find(candidate=>candidate.id===id)!;
  for(const key of [bg+'.opacity',text+'.enabled',text+'.position'])expect(Object.hasOwn(template.properties,key)).toBe(false);
  expect(f.state().nativeEdited).toBe(state.nativeEdited);expect(f.state().analysisUnavailable).toBe('');
  expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(opening);expect(f.document.undo()).toBe(false);
  expect(f.document.redo()).toBe(true);expect(f.document.serialize()).toStrictEqual(accepted);expect(f.document.redo()).toBe(false);
 }finally{f.native.dispose();}
});
