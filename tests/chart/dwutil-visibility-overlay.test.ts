import {describe,expect,it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingVisibilityProjection,makeDrawingVisibility} from '../../src/chart/drawing-visibility';
import {captureNativeDrawingProjection} from '../../src/chart/drawing-native-projection';
import {createDrawingManager,type DrawingManagerHost} from '../../src/chart/drawing-manager';
import {nativeDrawingHarness} from './drawing-native-harness';
import {annotationNativeHarness,annotationRecord} from './trendline-annotation-native-harness';

// Hide drawings and Lock all drawings are renderer-copy
// overlays applied inside createDrawingVisibilityProjection.prepare. The canonical document,
// saved document and undo never see them, and drawing-native-projection.ts keeps refusing any
// projected non-visibility field. SYNTHETIC rows; component-level evidence only.
type Row=Record<string,unknown>;
const row=(id:string,extra:Row={}):Row=>({id,type:'trendline',paneId:'price',anchors:[{time:1000,price:100},{time:2000,price:120}],visible:true,...extra});
const canonical=()=>[row('a'),row('b',{locked:true}),row('c',{visible:false}),row('d',{lvIntervalVisibility:makeDrawingVisibility('include',['5m'])})];
function fixture(overlay:{hidden?:boolean;locked?:boolean},resolution='5m'){
 const rows=canonical();let pushed:Row[]=[],current={...overlay};
 const projection=createDrawingVisibilityProjection<Row>({read:()=>rows,resolution:()=>resolution,push:value=>{pushed=value;},overlay:()=>current});
 return{rows,projection,pushed:()=>pushed,set:(next:{hidden?:boolean;locked?:boolean})=>{current={...next};}};
}

describe('overlay projection (renderer copy only)',()=>{
 it('Hide drawings pushes visible:false for every row and Show restores each row\'s own visibility and interval rule',()=>{
  const f=fixture({hidden:true}),before=JSON.stringify(f.rows);
  f.projection.sync(structuredClone(f.rows));
  expect(f.pushed().map(item=>item.visible)).toEqual([false,false,false,false]);
  expect(JSON.stringify(f.rows)).toBe(before);// canonical rows, intent and interval rules untouched
  f.set({});f.projection.refresh();
  expect(f.pushed().map(item=>item.visible)).toEqual([true,true,false,true]);// c was hidden by itself and stays hidden; d is shown at 5m
  f.set({hidden:true});f.projection.refresh();f.set({});f.projection.refresh();
  expect(f.pushed().map(item=>item.visible)).toEqual([true,true,false,true]);
 });
 it('Lock all pushes locked:true for every row while canonical locks stay each row\'s own',()=>{
  const f=fixture({locked:true}),before=JSON.stringify(f.rows);
  f.projection.sync(structuredClone(f.rows));
  expect(f.pushed().map(item=>item.locked)).toEqual([true,true,true,true]);
  expect(JSON.stringify(f.rows)).toBe(before);expect(f.rows.map(item=>item.locked)).toEqual([undefined,true,undefined,undefined]);
  f.set({});f.projection.refresh();expect(f.pushed().map(item=>item.locked)).toEqual([undefined,true,undefined,undefined]);// b's own lock survives Unlock
 });
 it('both overlays at once, with an interval rule: out-of-range rows stay hidden after Show',()=>{
  const f=fixture({hidden:true,locked:true},'1D');f.projection.sync(structuredClone(f.rows));
  expect(f.pushed().every(item=>item.visible===false&&item.locked===true)).toBe(true);
  f.set({});f.projection.refresh();expect(f.pushed().map(item=>item.visible)).toEqual([true,true,false,false]);// d is include 5m only
 });
 it('overlays never change the diagnostics of an unavailable rule',()=>{
  const f=fixture({hidden:true});f.rows[3].lvIntervalVisibility={schemaVersion:2,future:true};f.projection.sync(structuredClone(f.rows));
  expect(f.projection.diagnostics().map(item=>item.code)).toEqual(['DRAWING_VISIBILITY_UNAVAILABLE']);
 });
 it('without an overlay getter the projection is exactly the previous behavior',()=>{
  const rows=canonical();let pushed:Row[]=[];const projection=createDrawingVisibilityProjection<Row>({read:()=>rows,resolution:()=>'5m',push:value=>{pushed=value;}});
  projection.sync(structuredClone(rows));expect(pushed.map(item=>item.visible)).toEqual([true,true,false,true]);expect(pushed.every(item=>!('locked' in item)||item.id==='b')).toBe(true);
 });
});

describe('(a) the native projection guard still refuses a projected lock',()=>{
 it('captureNativeDrawingProjection accepts a visibility-only projection and refuses any projected locked',async()=>{
  const native=await nativeDrawingHarness();try{
   const document=new LosslessDrawingDocument(),rows=[annotationRecord()];document.load({version:1,drawings:rows});native.controller.fromJSON({version:1,drawings:rows});
   const facade={ctrl:native.controller};
   expect(captureNativeDrawingProjection(facade,document,()=>{},list=>list.map(item=>({...item,visible:false}))).rows).toHaveLength(1);
   expect(()=>captureNativeDrawingProjection(facade,document,()=>{},list=>list.map(item=>({...item,locked:true})))).toThrow('Projection cannot change');
  }finally{native.dispose();}
 });
});

describe('(b) a native edit under both overlays leaves every other canonical row byte-identical',()=>{
 it('canonicalNativeRows drops leaked overlay values and reconcile writes only the edited geometry',()=>{
  const f=fixture({hidden:true,locked:true}),document=new LosslessDrawingDocument(),known=new Set(['trendline']);
  document.load({version:1,drawings:f.rows});const before=document.all();
  f.projection.sync(structuredClone(f.rows));
  // The renderer copy is projected; a native edit of "a" returns every row as the renderer holds it.
  const leaked=f.pushed().map(item=>item.id==='a'?{...item,anchors:[{time:1000,price:105},{time:2000,price:120}]}:item);
  const restored=f.projection.canonicalNativeRows(leaked);
  expect(restored.map(item=>item.locked)).toEqual([undefined,true,undefined,undefined]);
  expect(restored.map(item=>item.visible)).toEqual([true,true,false,true]);
  document.mergeRenderable(restored,known,true);
  const after=document.all();
  for(const id of ['b','c','d'])expect(JSON.stringify(after.find(item=>item.id===id))).toBe(JSON.stringify(before.find(item=>item.id===id)));
  expect(JSON.stringify(after.find(item=>item.id==='a'))).toBe(JSON.stringify({...before.find(item=>item.id==='a'),anchors:[{time:1000,price:105},{time:2000,price:120}]}));
  expect(after.some(item=>item.visible===false&&item.id!=='c')).toBe(false);
  expect(document.undo()).toBe(true);expect(document.all()).toEqual(before);// one history step, nothing else
 });
});

describe('(c) Lock all leaves the manager and tree reading each row\'s own lock',()=>{
 function managerFixture(){
  let doc:Row={version:1,drawings:[row('a'),row('b',{locked:true})]};let transactions=0;const updates:string[][]=[];
  const host:DrawingManagerHost={read:()=>doc,write:next=>{doc=structuredClone(next);},known:()=>true,update:list=>{updates.push(list.map(item=>item.id));},remove:()=>{},select:()=>{},front:()=>{},back:()=>{},transaction:operation=>{transactions++;return operation();},changed:()=>{}};
  return{port:createDrawingManager(host),doc:()=>doc,updates,transactions:()=>transactions};
 }
 it('toggling one row writes only that row\'s canonical lock in one transaction',()=>{
  const f=managerFixture(),projection=createDrawingVisibilityProjection<Row>({read:()=>f.doc().drawings as Row[],resolution:()=>'1D',push:()=>{},overlay:()=>({locked:true})});
  projection.sync(structuredClone(f.doc().drawings as Row[]));
  expect(f.port.list().map(item=>item.locked)).toEqual([undefined,true]);// the list reads canonical rows, never the projection
  const before=JSON.stringify((f.doc().drawings as Row[])[1]);
  f.port.set(['a'],{locked:true});
  expect(f.transactions()).toBe(1);expect(f.updates).toEqual([['a']]);
  expect((f.doc().drawings as Row[]).map(item=>item.locked)).toEqual([true,true]);expect(JSON.stringify((f.doc().drawings as Row[])[1])).toBe(before);
  f.port.set(['b'],{locked:false});expect((f.doc().drawings as Row[]).map(item=>item.locked)).toEqual([true,false]);
 });
});

describe('(d) Delete under Lock all ',()=>{
 it('a multi-selection Delete removes nothing while the renderer copy is locked (vela deletableSelection), and does once restored',async()=>{
  const paint=await annotationNativeHarness();const intents:any[]=[];
  try{
   const first=annotationRecord(),second={...annotationRecord(),id:'synthetic-second'},canonicalRows=[first as unknown as Row,second as unknown as Row];let overlay={locked:true};
   const projection=createDrawingVisibilityProjection<Row>({read:()=>canonicalRows,resolution:()=>'1D',push:rows=>paint.sync(rows as never),overlay:()=>overlay});
   (paint.controller as any).intentCb=(intent:any)=>intents.push(intent);(paint.controller as any).popup={syncPanel(){},close(){},open(){},isOpen:()=>false,contains:()=>false};
   const press=()=>(paint.controller as any).handleKey({key:'Delete',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,target:null});
   projection.sync(structuredClone(canonicalRows));paint.controller.setSelection([first.id,second.id]);press();
   expect(intents.filter(intent=>intent.kind==='delete')).toEqual([]);
   overlay={locked:false};projection.refresh();paint.controller.setSelection([first.id,second.id]);press();
   expect(intents.filter(intent=>intent.kind==='delete').map(intent=>intent.ids)).toEqual([[first.id,second.id]]);
  }finally{paint.dispose();}
 });
 it('the manager and tree Remove still remove under Lock all because the overlay is renderer-only',()=>{
  let doc:Row={version:1,drawings:[row('a'),row('b'),row('c')]};const removed:string[]=[];
  const host:DrawingManagerHost={read:()=>doc,write:next=>{doc=structuredClone(next);},known:()=>true,update:()=>{},remove:ids=>{removed.push(...ids);},select:()=>{},front:()=>{},back:()=>{},transaction:operation=>operation(),changed:()=>{}};
  const port=createDrawingManager(host),projection=createDrawingVisibilityProjection<Row>({read:()=>doc.drawings as Row[],resolution:()=>'1D',push:()=>{},overlay:()=>({locked:true,hidden:true})});
  projection.sync(structuredClone(doc.drawings as Row[]));
  port.remove(['a','c']);
  expect(removed).toEqual(['a','c']);expect((doc.drawings as Row[]).map(item=>item.id)).toEqual(['b']);
 });
});
