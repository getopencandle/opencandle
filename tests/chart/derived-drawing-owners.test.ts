// SYNTHETIC rows only. On a derived chart the renderer holds drawing anchors in synthetic time while the
// core store and the canonical document hold source time. Each owner that compares a renderer row with a stored row maps
// it back through the lens first. Each case also runs with the host map withheld, which reproduces the reported failure.
import {expect,it} from 'vitest';
import type {SerializedDrawing} from '@luxalgo/vela';
import {annotationRecord} from './trendline-annotation-native-harness';
import {nativeResetHarness} from './native-drawing-reset-harness';
import {statsPainterHarness,statsRecord} from './trendline-stats-painter-harness';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';
import {captureInlineDrawingOwner} from '../../src/chart/drawing-inline-owner';
import {syntheticDerivedLens,sourceRow,NATIVE_SECONDS,SOURCE_SECONDS} from './derived-lens-fixture';
import {createDerivedDrawingLens} from '../../src/chart/derived/derived-drawings';

const times=(row:{anchors?:readonly {time:number}[]})=>(row.anchors??[]).map(anchor=>anchor.time);
const NATIVE=[NATIVE_SECONDS[0]*1000,NATIVE_SECONDS[2]*1000],SOURCE=[SOURCE_SECONDS[0]*1000,SOURCE_SECONDS[2]*1000];
const statsGlyphs=(commands:any[])=>commands.filter(command=>command.op==='fillText'&&/^(Price|Change|Bars|Time):/.test(command.values[0]));

it('derived chart: drawing settings Reset with another drawing present resets the target and keeps every anchor in source time',async()=>{
 for(const hostMap of [true,false]){
  const lens=syntheticDerivedLens(),rows=[sourceRow(lens,annotationRecord(false)),{...sourceRow(lens,annotationRecord(true)),id:'SYNTHETIC derived unrelated'}];
  const f=await nativeResetHarness(rows,{lens,hostMap});try{
   expect(f.paint.controller.drawings.map((model:any)=>times(model.serialize()))).toEqual([NATIVE,NATIVE]);
   expect(f.core.controller.all().map(times)).toEqual([SOURCE,SOURCE]);
   const before=f.document.serialize();
   if(!hostMap){expect(()=>f.open([rows[0].id]).actions.resetSettings()).toThrow(/canonical|renderer state changed/);expect(f.document.serialize()).toEqual(before);continue;}
   f.open([rows[0].id]).actions.resetSettings();
   const [target,unrelated]=f.document.all();
   expect(Object.hasOwn(target,'text')).toBe(false);expect(unrelated).toEqual(rows[1]);
   expect(f.document.all().map(times)).toEqual([SOURCE,SOURCE]);expect(f.core.controller.all().map(times)).toEqual([SOURCE,SOURCE]);
   expect(f.paint.controller.drawings.map((model:any)=>times(model.serialize()))).toEqual([NATIVE,NATIVE]);
   expect(f.diagnostics).toEqual([]);expect(f.reset.diagnostics()).toEqual([]);
   expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toEqual(before);
  }finally{f.dispose();}
 }
});

it('derived chart: trendline statistics labels stay visible',async()=>{
 const baseline=await statsPainterHarness();let expected:number;try{baseline.top.commands.length=0;baseline.render();expected=statsGlyphs(baseline.top.commands).length;}finally{baseline.cleanup();}
 expect(expected).toBe(1);
 for(const hostMap of [true,false]){
  const lens=syntheticDerivedLens(),f=await statsPainterHarness([sourceRow(lens,statsRecord())],{lens,hostMap});try{
   expect(times(f.controller.drawings[0].serialize())).toEqual(NATIVE);expect(times(f.document.all()[0])).toEqual(SOURCE);
   f.top.commands.length=0;f.render();
   if(hostMap){expect(statsGlyphs(f.top.commands)).toHaveLength(expected);expect(f.notices).toEqual([]);expect(f.stats.diagnostics()).toEqual([]);}
   else{expect(statsGlyphs(f.top.commands)).toEqual([]);expect(f.stats.diagnostics().map(row=>row.message).join('\n')).toMatch(/canonical record/);}
  }finally{f.cleanup();}
 }
});

it('derived chart: the Fib trend line paints as it does on a time chart',async()=>{
 const strokes=(f:Awaited<ReturnType<typeof fibBaselineHarness>>)=>[f.top,...f.slices].flatMap(r=>r.commands).filter(c=>c.op==='stroke').length;
 const time=await fibBaselineHarness();let expected:number;try{time.sync([fibBaselineRecord()]);time.drain();time.render();time.drain();expect(time.diagnostics).toEqual([]);expected=strokes(time);}finally{time.cleanup();}
 expect(expected).toBeGreaterThan(0);
 for(const hostMap of [true,false]){
  const lens=syntheticDerivedLens(),f=await fibBaselineHarness({},{lens,hostMap});try{
   try{f.sync([sourceRow(lens,fibBaselineRecord())]);f.drain();}catch(error){if(hostMap)throw error;/* withheld map: the owned render rethrows after quarantining */}
   expect(times(f.controller.drawings[0].serialize())).toEqual(NATIVE);expect(times(f.core.controller.all()[0])).toEqual(SOURCE);
   try{f.render();f.drain();}catch(error){if(hostMap)throw error;}
   if(hostMap){expect(f.diagnostics).toEqual([]);expect(f.baseline.diagnostics()).toEqual([]);expect(strokes(f)).toBe(expected);}
   else expect(f.diagnostics.join('\n')+f.baseline.diagnostics().map(row=>row.message).join('\n')).toMatch(/canonical record/);
  }finally{f.cleanup();}
 }
});

it('derived chart: inline text editing acquires its drawing owner from the renderer row',async()=>{
 const lens=syntheticDerivedLens(),row=sourceRow(lens,statsRecord()),f=await statsPainterHarness([row],{lens});try{
  const rendered=f.controller.drawings[0].serialize() as SerializedDrawing;expect(times(rendered)).toEqual(NATIVE);
  expect(()=>captureInlineDrawingOwner(f.document,{ctrl:f.core.controller},row.id,rendered,()=>{})).toThrow(/canonical/);
  const assertCurrent=captureInlineDrawingOwner(f.document,{ctrl:f.core.controller},row.id,rendered,()=>{},value=>lens.toSourceRow(value));
  expect(()=>assertCurrent()).not.toThrow();
  // A time chart passes the very same row through: nothing changes there.
  const plain=await statsPainterHarness();try{const projected=plain.controller.drawings[0].serialize() as SerializedDrawing,timeLens=createDerivedDrawingLens();expect(timeLens.toSourceRow(projected)).toBe(projected);expect(()=>captureInlineDrawingOwner(plain.document,{ctrl:plain.core.controller},projected.id,projected,()=>{},value=>timeLens.toSourceRow(value))).not.toThrow();}finally{plain.cleanup();}
 }finally{f.cleanup();}
});
