import {expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {annotationNativeHarness,annotationRecord} from './trendline-annotation-native-harness';
import {statsPainterHarness,statsRecord} from './trendline-stats-painter-harness';
import {installTrendlineAnnotation,registerOwnedTrendlineStatistics,resolveOwnedStatisticsFrame,resolveOwnedStatisticsTarget,type OwnedTrendlineStatisticsRegistration} from '../../src/chart/trendline-annotation';
import {captureNativeInlineLayoutOwner,resolveNativeInlineLayoutOwner} from '../../src/chart/native-inline-layout-owner';
import {captureTrendlineStatisticsNativeOwner,resolveTrendlineStatisticsNativeOwner} from '../../src/chart/trendline-stats-owner';
const rejects=(action:()=>unknown)=>{try{action();return false;}catch{return true;}};
const labels=(f:Awaited<ReturnType<typeof statsPainterHarness>>)=>f.top.commands.filter(command=>command.op==='fillText'&&/^(Price|Change|Bars|Time):/.test(command.values[0]));

it('exact native local components bind canonical receipt and source; local failure retires the full proof after field restoration',async()=>{
 const row=statsRecord(),f=await statsPainterHarness([row]);try{
  const source=f.host.captureOwner(),owner=f.document.captureReadOnlyOwner(),full=captureTrendlineStatisticsNativeOwner({ctrl:f.core.controller},row,row,owner,source),local=resolveTrendlineStatisticsNativeOwner(full,owner,source);
  expect(()=>resolveTrendlineStatisticsNativeOwner(full,f.document.captureReadOnlyOwner(),source)).toThrow();expect(()=>resolveTrendlineStatisticsNativeOwner(full,owner,()=>source())).toThrow();expect(()=>resolveTrendlineStatisticsNativeOwner(full.bind(null),owner,source)).toThrow();
  const model=f.core.controller.store.get(row.id),type=model.type;model.type='ray';expect(local).toThrow();model.type=type;expect(local).toThrow();expect(full).toThrow();
 }finally{f.cleanup();}
});

it('native local resolution does not invoke a structurally supplied canonical callback as pure authority',async()=>{
 const row=statsRecord(),f=await statsPainterHarness([row]);try{let calls=0;const fake={assertCurrent(){calls++;}},source=f.host.captureOwner(),full=captureTrendlineStatisticsNativeOwner({ctrl:f.core.controller},row,row,fake,source);calls=0;expect(()=>resolveTrendlineStatisticsNativeOwner(full,f.document.captureReadOnlyOwner(),source)).toThrow();expect(calls).toBe(0);}finally{f.cleanup();}
});

it('layout components bind exact renderer pane and callback and retain permanent retirement',async()=>{
 const f=await statsPainterHarness(),other=await statsPainterHarness([]);try{const source=f.host.captureOwner(),full=captureNativeInlineLayoutOwner(f.renderer,'price',source),local=resolveNativeInlineLayoutOwner(full,f.renderer,'price',source);
  expect(()=>resolveNativeInlineLayoutOwner(full,other.renderer,'price',source)).toThrow();expect(()=>resolveNativeInlineLayoutOwner(full,f.renderer,'other',source)).toThrow();expect(()=>resolveNativeInlineLayoutOwner(full,f.renderer,'price',()=>source())).toThrow();expect(()=>resolveNativeInlineLayoutOwner(full.bind(null),f.renderer,'price',source)).toThrow();
  const min=f.pane.scale.min;f.pane.scale.min=1;expect(local).toThrow();f.pane.scale.min=min;expect(local).toThrow();expect(full).toThrow();
 }finally{other.cleanup();f.cleanup();}
});

it('frame and target components reject copies cross-chart registrations and ended frames, and target failure retires the full target',async()=>{
 const f=await annotationNativeHarness(),other=await annotationNativeHarness();f.sync([annotationRecord(false)]);other.sync([annotationRecord(false)]);
 const annotation=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.host),otherAnnotation=installTrendlineAnnotation(other.renderer,other.chart as unknown as Vela,other.host);let registration:OwnedTrendlineStatisticsRegistration,token:object|undefined,oldTarget:any,oldLocal:(()=>void)|undefined;const observed:boolean[]=[];
 const otherRegistration=registerOwnedTrendlineStatistics(other.renderer,{begin(){return undefined;}});
 registration=registerOwnedTrendlineStatistics(f.renderer,{begin(_kind,_assert,current){token=current;return{dispose(){},paint(target){oldTarget=target;const frame=resolveOwnedStatisticsFrame(f.renderer,registration,current!),local=resolveOwnedStatisticsTarget(f.renderer,registration,current!,target);oldLocal=local;
  observed.push(rejects(()=>resolveOwnedStatisticsFrame(f.renderer,registration,{...current})),rejects(()=>resolveOwnedStatisticsFrame(other.renderer,otherRegistration,current!)),rejects(()=>resolveOwnedStatisticsTarget(f.renderer,registration,current!,{...target})),rejects(()=>resolveOwnedStatisticsTarget(f.renderer,otherRegistration,current!,target)));
  const model=f.controller.drawings[0],type=model.type;model.type='ray';observed.push(rejects(local));model.type=type;observed.push(rejects(local),rejects(()=>target.assertCurrent()));frame.assertLocal();
 }};}});
 try{f.render();expect(observed).toEqual(Array(7).fill(true));expect(()=>resolveOwnedStatisticsFrame(f.renderer,registration,token!)).toThrow();expect(()=>resolveOwnedStatisticsTarget(f.renderer,registration,token!,oldTarget)).toThrow();expect(oldLocal!).toThrow();}finally{registration.dispose();otherRegistration.dispose();otherAnnotation.dispose();annotation.dispose();other.dispose();f.dispose();}
});

it('frame source callback failure permanently retires its exact local/full frame components',async()=>{
 const f=await annotationNativeHarness();f.sync([annotationRecord(false)]);const annotation=installTrendlineAnnotation(f.renderer,f.chart as unknown as Vela,f.host);let registration:OwnedTrendlineStatisticsRegistration;const observed:boolean[]=[];
 registration=registerOwnedTrendlineStatistics(f.renderer,{begin(_kind,full,token){const parts=resolveOwnedStatisticsFrame(f.renderer,registration,token!);observed.push(rejects(()=>parts.assertSource(()=>{throw Error('SYNTHETIC source failure');})),rejects(()=>parts.assertLocal()),rejects(full));return undefined;}});
 try{expect(()=>f.render()).not.toThrow();expect(observed).toEqual([true,true,true]);}finally{registration.dispose();annotation.dispose();f.dispose();}
});

for(const [name,mutate]of [
 ['canonical equal load',(f:Awaited<ReturnType<typeof statsPainterHarness>>)=>f.canonical([statsRecord()])],
 ['layout',(f:Awaited<ReturnType<typeof statsPainterHarness>>)=>{f.pane.scale.min=1;}],
 ['native identity',(f:Awaited<ReturnType<typeof statsPainterHarness>>)=>{const row=f.core.controller.store.get(statsRecord().id);f.core.controller.store.byId.set(row.id,{...row});}],
 ['target type',(f:Awaited<ReturnType<typeof statsPainterHarness>>)=>{f.controller.drawings[0].type='ray';}],
 ['installation',(f:Awaited<ReturnType<typeof statsPainterHarness>>)=>{f.annotation.dispose();}],
] as const)it('last statistics source callback cannot authorize old glyphs after '+name,async()=>{
 const f=await statsPainterHarness();let fired=false;try{f.top.commands.length=0;f.onStatsSourceAssert(()=>{if(!fired&&f.top.ctx.font==='12px sans-serif'){fired=true;mutate(f);}});try{f.render();}catch{/* Exact retired installation may stop the native frame too. */}expect(fired).toBe(true);expect(labels(f)).toEqual([]);if(name==='canonical equal load'||name==='installation')expect(f.notices).toEqual([]);}finally{f.cleanup();}
});

it('painter rejects replacement canonical capture without invoking a public-shaped receipt',async()=>{
 const f=await statsPainterHarness();let calls=0;try{Object.defineProperty(f.document,'captureReadOnlyOwner',{configurable:true,value:()=>{calls++;return{assertCurrent(){calls++;}};}});f.stats.invalidate();f.top.commands.length=0;f.render();expect(calls).toBe(0);expect(labels(f)).toEqual([]);}finally{f.cleanup();}
});
