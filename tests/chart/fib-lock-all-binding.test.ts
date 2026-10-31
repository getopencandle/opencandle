import {expect,it} from 'vitest';
import type {SerializedDrawing} from '@luxalgo/vela';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';
import {createDrawingPreview} from '../../src/chart/drawing-preview';
import {createDrawingVisibilityProjection} from '../../src/chart/drawing-visibility';

// "Lock all drawings" projects locked:true onto the RENDERER copy only, through the
// visibility projection's overlay; the saved record and the native store keep their own locked value. The Fib
// painter's full canonical comparison then refused the renderer copy and the annotation quarantined the chart.
// SYNTHETIC rows; the production preview + visibility projection modules push into the actual renderer port,
// composed as adapter.ts lines 223-224 compose them (overlay included).

type Harness=Awaited<ReturnType<typeof fibBaselineHarness>>;
type Row=Record<string,unknown>;
type Preview=ReturnType<typeof createDrawingPreview>;
const ID='SYNTHETIC owned Fib baseline';
const BARS=[1000,1120,1240].map(time=>({time,open:100,high:200,low:100,close:200,volume:1}));
function record(){const row=fibBaselineRecord();row.props={...row.props,lvFibBackground:{schemaVersion:1,opacity:40}};return row;}
const strokes=(f:Harness)=>[f.top,...f.slices].flatMap(r=>r.commands).filter(c=>c.op==='stroke').length;
const quiet=(action:()=>void)=>{try{action();}catch{/* the owned render rethrows after quarantining */}};
// A refused binding withholds that one Fib's LV presentation with a diagnostic; it never quarantines the chart.
const withheld=(f:Harness,text='differs from its canonical record')=>{expect(f.diagnostics).toEqual([]);expect(JSON.stringify(f.baseline.diagnostics())).toContain(text);};

interface State{drawingsLocked:boolean;drawingsHidden:boolean;preview?:Preview}
/** The proposed adapter host members, verbatim in shape: one overlay source of truth. */
function hostMembers(state:State,overlay:()=>{hidden:boolean;locked:boolean}){
 return{
  previewMembers(id:string){const p=state.preview;if(!p||!p.has(id))return;const {id:_id,...members}=p.apply({id});return members;},
  overlayMembers(_id:string){return overlay().locked?{locked:true}:undefined;},
 };
}
async function rig(options:{attested?:boolean}={}){
 const state:State={drawingsLocked:false,drawingsHidden:false};
 const overlay=()=>({hidden:state.drawingsHidden===true,locked:state.drawingsLocked===true});
 const f=await fibBaselineHarness(options.attested===false?{}:hostMembers(state,overlay));
 f.sync([record()]);
 let projection:ReturnType<typeof createDrawingVisibilityProjection<Row>>|undefined;
 const preview=createDrawingPreview({read:()=>f.document.all() as Row[],bars:()=>BARS as never,changed:()=>projection!.refresh()});
 projection=createDrawingVisibilityProjection<Row>({overlay,read:()=>f.document.all() as Row[],resolution:()=>'1D',push:rows=>f.controller.syncDrawings(rows as unknown as SerializedDrawing[]),preview:row=>preview.apply(row)});
 state.preview=preview;projection.sync(f.document.all() as Row[]);f.drain();
 /** The toolbar toggle: drawing-utility-state flips, the projection re-projects the renderer copy (no canonical write). */
 const lockAll=(on:boolean)=>{state.drawingsLocked=on;projection!.refresh();f.drain();};
 return{f,preview,projection,lockAll,state};
}

it('FIB-SETTINGS-1029: Lock all with a visible Fib and no overlay attestation withholds the presentation, never quarantines',async()=>{
 const {f,lockAll}=await rig({attested:false});try{
  expect(f.diagnostics).toEqual([]);
  // The projection's failed push rolls the renderer copy back, but the chart is already quarantined.
  quiet(()=>lockAll(true));
  withheld(f);
 }finally{f.cleanup();}
});

it('Lock all with a visible Fib paints without quarantine; the saved record and native store stay unlocked; unlock stays clean',async()=>{
 const {f,lockAll}=await rig();try{
  expect(f.diagnostics).toEqual([]);const before=strokes(f);
  expect(()=>lockAll(true)).not.toThrow();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  expect((f.controller.drawings.find((d:any)=>d.id===ID) as any).locked).toBe(true);
  expect((f.document.all()[0] as any).locked).not.toBe(true);
  expect((f.core.controller.store.get(ID) as any).locked).not.toBe(true);
  expect(strokes(f)).toBeGreaterThan(before);
  f.render();f.drain();expect(f.diagnostics).toEqual([]);
  expect(()=>lockAll(false)).not.toThrow();f.render();f.drain();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
 }finally{f.cleanup();}
});

it('Lock all together with an attested settings preview paints without quarantine',async()=>{
 const {f,lockAll,preview}=await rig();try{
  lockAll(true);
  expect(()=>{preview.show(ID,{'lvFibTrendLine.width':3});f.drain();}).not.toThrow();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  const painted=f.controller.drawings.find((d:any)=>d.id===ID) as any;expect(painted.locked).toBe(true);expect(painted.lvFibTrendLine.width).toBe(3);
  preview.clear(ID);f.drain();lockAll(false);f.drain();expect(f.diagnostics).toEqual([]);
 }finally{f.cleanup();}
});

it('refused: the renderer copy is locked while the overlay attests nothing (Lock all off)',async()=>{
 const {f}=await rig();try{
  const foreign=structuredClone(f.document.all()[0]) as any;foreign.locked=true;
  quiet(()=>{f.controller.syncDrawings([foreign]);f.drain();});
  withheld(f);
 }finally{f.cleanup();}
});

it('refused: Lock all attested, but the renderer copy carries a foreign member beyond locked',async()=>{
 const {f,lockAll}=await rig();try{
  lockAll(true);expect(f.diagnostics).toEqual([]);
  const foreign=structuredClone(f.document.all()[0]) as any;foreign.locked=true;foreign.props.lvFibTrendLine.width=4;
  quiet(()=>{f.controller.syncDrawings([foreign]);f.drain();});
  withheld(f);
 }finally{f.cleanup();}
});

it('refused: Lock all attested, but the native store itself became locked (store must equal the saved record)',async()=>{
 const {f,lockAll}=await rig();try{
  const store=f.core.controller.store.get(ID) as any;store.locked=true;
  quiet(()=>lockAll(true));
  withheld(f);
 }finally{f.cleanup();}
});

it('refused: an overlay attestation naming anything but locked:true',async()=>{
 for(const members of [{visible:false},{locked:false},{locked:'yes'},{props:{}}]){
  const f=await fibBaselineHarness({overlayMembers:()=>members});try{
   quiet(()=>{f.sync([record()]);f.render();f.drain();});
   expect(f.diagnostics[0]).toContain('Fibonacci overlay attestation');
  }finally{f.cleanup();}
 }
});

it('nit: a preview draft whose anchors are not two finite time/price points is refused',async()=>{
 for(const anchors of [[{time:1000000,price:100}],[{time:1000000,price:100},{time:NaN,price:200}],[{time:1000000,price:100},{time:1240000,price:'200'}],[{time:1000000,price:100},{time:1240000,price:200},{time:1300000,price:150}]]){
  const f=await fibBaselineHarness({previewMembers:()=>({anchors})});try{
   quiet(()=>{f.sync([record()]);f.render();f.drain();});
   expect(f.diagnostics[0]).toContain('Fibonacci preview anchors');
  }finally{f.cleanup();}
 }
});

it('nit: the saved anchors change under an active anchors preview: the stale anchors are refused, a fresh preview is admitted',async()=>{
 const {f,preview,projection}=await rig();try{
  preview.show(ID,{'lvFibTrendLine.width':3});f.drain();expect(f.diagnostics).toEqual([]);
  // The saved record moves (an edit lands) while the preview built from the OLD anchors is still active.
  const moved=structuredClone(f.document.all()[0]) as any;moved.anchors=[{time:1000000,price:110},{time:1240000,price:210}];
  quiet(()=>{f.document.load({version:1,drawings:[moved]});f.core.controller.fromJSON({version:1,drawings:[moved]});});
  // The adapter re-projects the saved rows; the projection lays the OLD preview anchors over the moved row.
  quiet(()=>{f.baseline.invalidate();projection.sync(f.document.all() as Row[]);f.drain();});
  expect((f.controller.drawings.find((d:any)=>d.id===ID) as any).anchors[0].price).toBe(100);
  expect([...f.diagnostics,...f.baseline.diagnostics().map(d=>d.message)].join('\n')).toContain('Fibonacci preview anchors are stale');
 }finally{f.cleanup();}
 const fresh=await rig();try{
  const {f,preview,projection}=fresh;preview.show(ID,{'lvFibTrendLine.width':3});f.drain();
  // Apply order (drawing-preview.ts): the preview clears, then the saved edit lands, then the dialog previews again.
  preview.clear(ID);f.drain();expect(f.diagnostics).toEqual([]);
  const moved=structuredClone(f.document.all()[0]) as any;moved.anchors=[{time:1000000,price:110},{time:1240000,price:210}];
  f.document.load({version:1,drawings:[moved]});f.core.controller.fromJSON({version:1,drawings:[moved]});
  f.baseline.invalidate();projection.sync(f.document.all() as Row[]);f.drain();expect(f.diagnostics).toEqual([]);
  // The dialog re-shows the draft from the current saved row: admitted.
expect(()=>{preview.show(ID,{'lvFibTrendLine.width':3});f.drain();}).not.toThrow();
  expect((fresh.f.controller.drawings.find((d:any)=>d.id===ID) as any).anchors[0].price).toBe(110);
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
 }finally{fresh.f.cleanup();}
});
