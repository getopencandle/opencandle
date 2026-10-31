import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import type {SerializedDrawing} from '@luxalgo/vela';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';
import {createDrawingPreview,DRAWING_PREVIEW_MEMBERS} from '../../src/chart/drawing-preview';
import {createDrawingVisibilityProjection} from '../../src/chart/drawing-visibility';

// Exe r19b, receipt 20261021T234500524Z-exe-sweep-tools. After the Fib body drag PASSED (the
// drag step even reopened settings to read the moved anchors), the settings step changed "Trend line width"
// 2 -> 3. The dialog's live preview (drawing-preview.ts) pushes the saved row with the draft members laid
// over it to the RENDERER copy only. The Fib painter bound that renderer copy against the bare saved record,
// assertNativeDrawingMatchesCanonical threw "Native Fibonacci trend-line interpretation differs from its
// canonical record" out of the render, and the annotation quarantined the chart (settings, undo and Delete
// then failed). SYNTHETIC rows; actual native interaction/store/renderer/painter bodies; the production
// preview + visibility projection modules push into the actual renderer port, as adapter.ts wires them.

const EXE_FIRST_ERROR='Native Fibonacci trend-line interpretation differs from its canonical record';
type Harness=Awaited<ReturnType<typeof fibBaselineHarness>>;
type Row=Record<string,unknown>;
type Preview=ReturnType<typeof createDrawingPreview>;
function record(){const row=fibBaselineRecord();row.props={...row.props,lvFibBackground:{schemaVersion:1,opacity:40}};return row;}
const BARS=[1000,1120,1240].map(time=>({time,open:100,high:200,low:100,close:200,volume:1}));
/** adapter.ts lines 223-224 composition: preview -> visibility projection -> renderer port push. */
function production(f:Harness){
 let projection:ReturnType<typeof createDrawingVisibilityProjection<Row>>|undefined;
 const preview=createDrawingPreview({read:()=>f.document.all() as Row[],bars:()=>BARS as never,changed:()=>projection!.refresh()});
 projection=createDrawingVisibilityProjection<Row>({read:()=>f.document.all() as Row[],resolution:()=>'1D',push:rows=>f.controller.syncDrawings(rows as unknown as SerializedDrawing[]),preview:row=>preview.apply(row)});
 return{preview,projection};
}
/** The proposed adapter host member, verbatim in shape. */
function attest(holder:{preview?:Preview}){
 return{previewMembers(id:string){const p=holder.preview;if(!p||!p.has(id))return;const {id:_id,...members}=p.apply({id});return members;}};
}
async function rig(attested=true){
 const holder:{preview?:Preview}={};
 const f=await fibBaselineHarness(attested?attest(holder):{});
 f.sync([record()]);const p=production(f);holder.preview=p.preview;p.projection.sync(f.document.all() as Row[]);f.drain();
 return{f,...p};
}
const ID='SYNTHETIC owned Fib baseline';
const strokes=(f:Harness)=>[f.top,...f.slices].flatMap(r=>r.commands).filter(c=>c.op==='stroke').length;
const quiet=(action:()=>void)=>{try{action();}catch{/* the owned render rethrows after quarantining */}};
// A refused binding withholds that one Fib's LV presentation with a diagnostic; it never quarantines the chart.
const withheld=(f:Harness,text='differs from its canonical record')=>{expect(f.diagnostics).toEqual([]);expect(JSON.stringify(f.baseline.diagnostics())).toContain(text);};


it('FIB-SETTINGS-1029: an unattested live preview withholds the presentation and never quarantines the chart',async()=>{
 const {f,preview}=await rig(false);try{
  expect(f.diagnostics).toEqual([]);
  quiet(()=>{preview.show(ID,{'lvFibTrendLine.width':3});f.drain();});
  withheld(f,EXE_FIRST_ERROR);
 }finally{f.cleanup();}
});

it('an attested live preview of the trend-line width paints without quarantine, then Cancel and Apply stay clean',async()=>{
 const {f,preview}=await rig();try{
  expect(f.diagnostics).toEqual([]);
  expect(()=>{preview.show(ID,{'lvFibTrendLine.width':3});f.drain();}).not.toThrow();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  expect((f.controller.drawings.find((d:any)=>d.id===ID) as any).lvFibTrendLine.width).toBe(3);
  expect((f.document.all()[0] as any).props.lvFibTrendLine.width).toBe(5);
  expect(strokes(f)).toBeGreaterThan(0);
  // A presentation-member preview (background opacity) as well.
  expect(()=>{preview.show(ID,{'lvFibTrendLine.width':3,'lvFibBackground.opacity':70});f.drain();}).not.toThrow();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  // Cancel clears the preview.
  preview.clear(ID);f.drain();expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  // Apply: the dialog clears the preview, then the edit commits and the saved record follows.
  preview.show(ID,{'lvFibTrendLine.width':3});f.drain();preview.clear(ID);f.drain();
  const committed=structuredClone(f.document.all()[0]) as any;committed.props.lvFibTrendLine.width=3;f.sync([committed]);f.render();f.drain();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
 }finally{f.cleanup();}
});

it('refused: the renderer copy differs from the attested draft (foreign trend-line interpretation)',async()=>{
 const {f,preview}=await rig();try{
  preview.show(ID,{'lvFibTrendLine.width':3});f.drain();expect(f.diagnostics).toEqual([]);
  const foreign=structuredClone(f.document.all()[0]) as any;foreign.props.lvFibTrendLine.width=4;
  quiet(()=>{f.controller.syncDrawings([foreign]);f.drain();});
  withheld(f,EXE_FIRST_ERROR);
 }finally{f.cleanup();}
});

it('refused: a foreign level ratio on the renderer copy beyond the attested draft',async()=>{
 const {f,preview}=await rig();try{
  preview.show(ID,{'lvFibTrendLine.width':3});f.drain();
  const foreign=structuredClone(f.document.all()[0]) as any;foreign.props.lvFibTrendLine.width=3;foreign.props.levels[0].ratio=.3;
  quiet(()=>{f.controller.syncDrawings([foreign]);f.drain();});
  withheld(f);
 }finally{f.cleanup();}
});

it('refused: the native store no longer equals the saved record while a preview is active',async()=>{
 const {f,preview}=await rig();try{
  const store=f.core.controller.store.get(ID) as any;store.lvFibTrendLine={...store.lvFibTrendLine,width:3};
  quiet(()=>{preview.show(ID,{'lvFibTrendLine.width':3});f.drain();});
  withheld(f,EXE_FIRST_ERROR);
 }finally{f.cleanup();}
});

it('refused: an attestation naming a member a preview cannot replace',async()=>{
 const f=await fibBaselineHarness({previewMembers:()=>({paneId:'other'})});try{
  quiet(()=>{f.sync([record()]);f.render();f.drain();});
  expect(f.diagnostics[0]).toContain('Fibonacci preview attestation names a member a preview cannot replace.');
 }finally{f.cleanup();}
});

it('the painter member list equals DRAWING_PREVIEW_MEMBERS',()=>{
 const source=readFileSync('src/chart/fib-trend-line-painter.ts','utf8'),match=/const PREVIEW_MEMBERS:readonly string\[\]=Object\.freeze\((\[[^\]]*\])\)/.exec(source);
 expect(match).not.toBeNull();expect(JSON.parse(match![1].replace(/'/g,'"'))).toEqual([...DRAWING_PREVIEW_MEMBERS]);
});

// Production-order drags (lift-then-render changed(), store commit before the canonical write).
function nativeShape(f:Harness){f.setBoundary([10]);Object.assign(f.interaction.deps,{changed:()=>{f.controller.syncLift();f.controller.render();}});}
function followCanonical(f:Harness){
 f.controller.intentCb=(intent:any)=>{Reflect.apply(f.core.controller.onIntent,f.core.controller,[intent]);if(intent.kind==='edit'||intent.kind==='edit-many')f.document.load({version:1,drawings:f.core.controller.store.serialize().drawings});};
 f.controller.popup.open=()=>{};
}
it('anchor drag (not the body) commits without quarantine, in production order',async()=>{
 const f=await fibBaselineHarness();try{
  nativeShape(f);f.sync([record()]);f.drain();followCanonical(f);
  const p=f.renderer.drawingProjector(),a=(f.document.all()[0] as any).anchors[1],x=p.xOf(a.time),y=p.yOf(a.price,'price');
  f.interaction.down(300,150,'off',false,false);f.interaction.up(300,150);f.drain();
  const before=JSON.stringify((f.document.all()[0] as any).anchors);
  f.interaction.down(x,y,'off',false,false);for(let i=1;i<=8;i++){f.interaction.move(x+i*3,y+i*2);f.drain();}
  expect(()=>f.interaction.up(x+24,y+16)).not.toThrow();f.drain();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  const after=(f.document.all()[0] as any).anchors;expect(JSON.stringify(after)).not.toBe(before);
  expect(JSON.stringify(after[0])).toBe(JSON.stringify(JSON.parse(before)[0]));
  expect(after).toEqual(f.core.controller.store.serialize().drawings[0].anchors);
 }finally{f.cleanup();}
});

it('body drag in 24 moves with frames painting between moves (exe repro shape) stays clean',async()=>{
 const f=await fibBaselineHarness();try{
  nativeShape(f);f.sync([record()]);f.drain();followCanonical(f);
  f.interaction.down(300,150,'off',false,false);
  for(let i=1;i<=24;i++){f.interaction.move(300+i*70/24,150+i*45/24);f.drain();expect(f.diagnostics).toEqual([]);}
  expect(()=>f.interaction.up(370,195)).not.toThrow();f.drain();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  expect((f.document.all()[0] as any).anchors).toEqual(f.core.controller.store.serialize().drawings[0].anchors);
 }finally{f.cleanup();}
});

it('body drag with a live tick (input bars replaced) between moves: the drag commits; nothing quarantines',async()=>{
 const f=await fibBaselineHarness();try{
  nativeShape(f);f.sync([record()]);f.drain();followCanonical(f);
  f.interaction.down(300,150,'off',false,false);
  for(let i=1;i<=6;i++){f.interaction.move(300+i*5,150+i*3);if(i===3)f.replaceInput([...BARS.slice(0,2),{...BARS[2],close:190}]);f.drain();}
  expect(()=>f.interaction.up(330,168)).not.toThrow();f.drain();
  expect(f.diagnostics).toEqual([]);
  expect((f.document.all()[0] as any).anchors).toEqual(f.core.controller.store.serialize().drawings[0].anchors);
 }finally{f.cleanup();}
});
