import {expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {statsPainterHarness} from '../chart/trendline-stats-painter-harness';
import {annotationNativeHarness,annotationRecord} from '../chart/trendline-annotation-native-harness';
import {installTrendlineAnnotation,registerOwnedTrendlineStatistics,resolveOwnedStatisticsFrame,resolveOwnedStatisticsTarget,type OwnedTrendlineStatisticsRegistration,type OwnedTrendlineStatisticsTarget} from '../../src/chart/trendline-annotation';

type Harness=Awaited<ReturnType<typeof statsPainterHarness>>;
const glyphs=(f:Harness)=>f.top.commands.filter(command=>command.op==='fillText'&&/^(Price|Change|Bars|Time):/.test(command.values[0]));
const rejects=(action:()=>unknown)=>{try{action();return false;}catch{return true;}};

for(const [name,mutate]of [
 ['failed canonical mutation',(f:Harness)=>{try{f.document.load(null);}catch{/* A rejected supported mutation still retires the epoch. */}}],
 ['no-op canonical mutation',(f:Harness)=>{const row=f.document.all()[0];f.document.stageEditedRecord(row,row);}],
 ['removed native pane',(f:Harness)=>{f.renderer.scene.panes.delete('price');}],
 ['same-set selection membership',(f:Harness)=>{f.controller.selectedIds.add(f.controller.drawings[0].id);}],
] as const)it('factored final source callback cannot authorize old glyphs after '+name,async()=>{
 const f=await statsPainterHarness();try{
  f.top.commands.length=0;f.render();expect(glyphs(f).map(command=>command.values[0])).toEqual(['Price: +100.00']);
  const canonical=f.document.serialize(),native=f.core.controller.all();let fired=false;f.top.commands.length=0;
  f.onStatsSourceAssert(()=>{if(!fired&&f.top.ctx.font==='12px sans-serif'){fired=true;mutate(f);}});
  try{f.render();}catch{/* Retired native frame may also reject its enclosing render. */}
  expect(fired).toBe(true);expect(glyphs(f)).toEqual([]);expect(f.document.serialize()).toStrictEqual(canonical);
  expect(f.core.controller.all()).toStrictEqual(native);
  if(name.includes('canonical'))expect(f.notices).toEqual([]);
 }finally{f.cleanup();}
});

it('a metric width getter causing a canonical no-op still retires the exact cached paint',async()=>{
 const f=await statsPainterHarness();try{
  const before=f.document.serialize();let reads=0;f.top.commands.length=0;
  f.top.ctx.measureText=()=>Object.defineProperty({},'width',{get(){reads++;const row=f.document.all()[0];f.document.stageEditedRecord(row,row);return 70;}});
  f.render();expect(reads).toBe(1);expect(glyphs(f)).toEqual([]);expect(f.document.serialize()).toStrictEqual(before);expect(f.notices).toEqual([]);
 }finally{f.cleanup();}
});

it('a late canonical capture accessor never executes or substitutes a public receipt',async()=>{
 const f=await statsPainterHarness();let fired=false,reads=0;try{
  f.top.commands.length=0;f.onStatsSourceAssert(()=>{if(!fired&&f.top.ctx.font==='12px sans-serif'){
   fired=true;Object.defineProperty(f.document,'captureReadOnlyOwner',{configurable:true,get(){reads++;return()=>({assertCurrent(){}});}});
  }});
  f.render();expect(fired).toBe(true);expect(reads).toBe(0);expect(glyphs(f)).toEqual([]);
 }finally{f.cleanup();}
});

it('actual source retirement in the last source observer cannot leave a glyph or a replacement diagnostic',async()=>{
 const f=await statsPainterHarness();let fired=false;try{
  const before=f.document.serialize(),native=f.core.controller.all();f.top.commands.length=0;
  f.onStatsSourceAssert(()=>{if(!fired&&f.top.ctx.font==='12px sans-serif'){fired=true;f.retireSource();}});
  expect(()=>f.render()).toThrow(/retired/);expect(fired).toBe(true);expect(glyphs(f)).toEqual([]);expect(f.notices).toEqual([]);
  expect(f.document.serialize()).toStrictEqual(before);expect(f.core.controller.all()).toStrictEqual(native);
 }finally{f.cleanup();}
});

it('a genuine nested frame cannot borrow the parent frame target or revive a failed parent proof',async()=>{
 const f=await annotationNativeHarness();f.sync([annotationRecord(false)]);
 const annotation=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.host);
 let registration:OwnedTrendlineStatisticsRegistration,outerToken:object|undefined,outerTarget:OwnedTrendlineStatisticsTarget|undefined,outerFull:(()=>void)|undefined;
 let nested=false;const observations:boolean[]=[];
 registration=registerOwnedTrendlineStatistics(f.renderer,{begin(_kind,full,token){return{dispose(){},paint(target){
  if(!nested){outerToken=token;outerTarget=target;outerFull=full;nested=true;f.render();observations.push(rejects(outerFull));}
  else{
   const inner=resolveOwnedStatisticsFrame(f.renderer,registration,token!);
   observations.push(rejects(()=>resolveOwnedStatisticsTarget(f.renderer,registration,token!,outerTarget!)));
   observations.push(rejects(()=>resolveOwnedStatisticsFrame(f.renderer,registration,outerToken!)));
   observations.push(!rejects(()=>inner.assertLocal()));
  }
 }};}});
 try{
  f.render();expect(observations).toEqual([true,true,true,true]);
  expect(()=>resolveOwnedStatisticsFrame(f.renderer,registration,outerToken!)).toThrow();
  expect(()=>resolveOwnedStatisticsTarget(f.renderer,registration,outerToken!,outerTarget!)).toThrow();
 }finally{registration.dispose();annotation.dispose();f.dispose();}
});
