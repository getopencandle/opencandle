import {expect,it,vi} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';

// A Fib retracement body drag in the packaged app quarantined the
// chart. The native interaction releases the press, emits the edit, and the core store
// commit synchronously re-syncs the renderer BEFORE the adapter's 'drawing:edited'
// listener writes the canonical document. The dragged drawing is still lifted onto the
// top canvas (syncLift runs only after the emit), so it paints inside that window with
// the core store one edit ahead of the canonical record. The presentation binding then
// threw "Native drawing changed or differs from its canonical record" out of the render,
// the annotation quarantined the chart, and every later Fib paint (the visibility
// rollback, settings, undo, delete) failed with "Fibonacci trend-line source changed."
// SYNTHETIC rows; actual native interaction/store/renderer bodies.

type Harness=Awaited<ReturnType<typeof fibBaselineHarness>>;
function record(){const row=fibBaselineRecord();row.props={...row.props,lvFibBackground:{schemaVersion:1,opacity:40}};return row;}
function nativeShape(f:Harness){
 // Production order: interleaved committed drawings, and the native changed() that lifts first.
 f.setBoundary([10]);
 Object.assign(f.interaction.deps,{changed:()=>{f.controller.syncLift();f.controller.render();}});
}
/** The adapter writes the canonical document from the core store after the store commit. */
function followCanonical(f:Harness,canonicalFollows=true,afterCommit:()=>void=()=>{}){
 const intents:any[]=[];
 f.controller.intentCb=(intent:any)=>{intents.push(intent);Reflect.apply(f.core.controller.onIntent,f.core.controller,[intent]);afterCommit();if(canonicalFollows&&(intent.kind==='edit'||intent.kind==='edit-many'))f.document.load({version:1,drawings:f.core.controller.store.serialize().drawings});};
 f.controller.popup.open=()=>{};
 return intents;
}
const fills=(f:Harness)=>[f.top,...f.slices].flatMap(record=>record.commands).filter(command=>command.op==='fillRect').length;

it('a legitimate body drag commits without quarantining the chart and repaints with the saved presentation',async()=>{
 const f=await fibBaselineHarness();try{
  nativeShape(f);f.sync([record()]);f.drain();const intents=followCanonical(f);
  f.interaction.down(300,150,'off',false,false);expect(f.interaction.state.kind).toBe('pressed');
  f.interaction.move(310,156);f.interaction.move(320,162);expect(f.interaction.state.moved).toBe(true);
  expect(()=>f.interaction.up(320,162)).not.toThrow();
  expect(intents.filter(intent=>intent.kind==='edit')).toHaveLength(1);
  expect(f.diagnostics).toEqual([]);
  // The canonical record caught up: the next frame binds and paints the full presentation.
  f.top.commands.length=0;f.render();f.drain();
  expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);
  expect(fills(f)).toBeGreaterThan(0);
  expect(f.document.all()[0].anchors).toEqual(f.core.controller.store.serialize().drawings[0].anchors);
  // Still usable afterwards: a second drag also commits cleanly.
  f.interaction.down(320,162,'off',false,false);f.interaction.move(340,174);expect(()=>f.interaction.up(340,174)).not.toThrow();
  expect(f.diagnostics).toEqual([]);
 }finally{f.cleanup();}
});

it('while the saved record lags, the presentation is withheld for that frame (not painted from unbound native data)',async()=>{
 const f=await fibBaselineHarness();try{
  nativeShape(f);f.sync([record()]);f.drain();
  let window:{op:string}[]=[],diagnostics='',repush:unknown='not run';
  followCanonical(f,false,()=>{window=[...f.top.commands];diagnostics=JSON.stringify(f.baseline.diagnostics());
   // A visibility-projection re-push of the committed rows (Hide all / interval refresh)
   // renders inside the same window and must not fail either.
   try{f.controller.syncDrawings(f.core.controller.store.serialize().drawings);repush=undefined;}catch(error){repush=error;}});
  f.interaction.down(300,150,'off',false,false);f.interaction.move(320,162);
  f.top.commands.length=0;expect(()=>f.interaction.up(320,162)).not.toThrow();
  expect(f.diagnostics).toEqual([]);
  // The commit-window frame (drawing still lifted onto the top canvas) shows the native
  // levels without LV fills and says why: no LV presentation from unbound native data.
  expect(window.some(command=>command.op==='stroke')).toBe(true);
  expect(window.filter(command=>command.op==='fillRect')).toHaveLength(0);
  expect(diagnostics).toContain('differs from its canonical record');
  expect(repush).toBeUndefined();
  // Once the record follows, the diagnostic retires and the presentation returns.
  f.document.load({version:1,drawings:f.core.controller.store.serialize().drawings});
  f.top.commands.length=0;f.render();f.drain();
  expect(f.baseline.diagnostics()).toEqual([]);expect(f.diagnostics).toEqual([]);
  expect(fills(f)).toBeGreaterThan(0);
 }finally{f.cleanup();}
});

it('a genuinely changed source is still refused during the commit window',async()=>{
 const f=await fibBaselineHarness();let descriptor:PropertyDescriptor|undefined,prototype:any;
 try{
  nativeShape(f);f.sync([record()]);f.drain();followCanonical(f);
  f.interaction.down(300,150,'off',false,false);f.interaction.move(320,162);
  // The source retires inside the commit-window frame itself (first native projection).
  prototype=Object.getPrototypeOf(f.coords);descriptor=Object.getOwnPropertyDescriptor(prototype,'timeToX');if(!descriptor||typeof descriptor.value!=='function')throw Error('SYNTHETIC expected native timeToX provider');
  const original=descriptor.value;let armed=true;Object.defineProperty(prototype,'timeToX',{...descriptor,value:function(...args:any[]){const result=Reflect.apply(original,this,args);if(armed){armed=false;f.retireSource();}return result;}});
  f.top.commands.length=0;
  expect(()=>f.interaction.up(320,162)).toThrow(/source retired/);
  expect(armed).toBe(false);
 }finally{if(descriptor)Object.defineProperty(prototype,'timeToX',descriptor);f.cleanup();}
});

it('a commit-window difference beyond the committed geometry is still refused (presentation conflict): withheld, never quarantined (FIB-SETTINGS-1029)',async()=>{
 const f=await fibBaselineHarness();try{
  nativeShape(f);f.sync([record()]);f.drain();followCanonical(f);
  f.interaction.down(300,150,'off',false,false);f.interaction.move(320,162);
  // The saved record disagrees with native on presentation, not only on the just-committed anchors.
  const conflicting=record();conflicting.props={...conflicting.props,lvFibBackground:{schemaVersion:1,opacity:80}};f.document.load({version:1,drawings:[conflicting]});
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});try{
   expect(()=>f.interaction.up(320,162)).not.toThrow();
   expect(f.diagnostics).toEqual([]);expect(warn.mock.calls.some(call=>String(call[1]).includes('differs from its canonical record'))).toBe(true);
  }finally{warn.mockRestore();}
 }finally{f.cleanup();}
});
