import {expect,it} from 'vitest';
import {assertOwnedFibTargetGraph,composeOwnedFibTargetProof,registerOwnedFibTrendLine,type OwnedFibTrendLineTarget} from '../../src/chart/trendline-annotation';
import {statsPainterHarness} from './trendline-stats-painter-harness';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';

// Synthetic genuine annotation target; abort deliberately before painting. This
// probes composition, while the existing installed-route faults cover Canvas.
async function targetProbe(action:(target:OwnedFibTrendLineTarget,f:Awaited<ReturnType<typeof statsPainterHarness>>,events:string[])=>void){
 const f=await statsPainterHarness([]),events:string[]=[],stop={},capture=f.host.captureOwner;
 let entered=false,armed=false;
 f.host.captureOwner=function(){const source=Reflect.apply(capture,this,[]);return()=>{source();if(armed)events.push('target-source');};};
 const registration=registerOwnedFibTrendLine(f.renderer,{paint(){},hit(){return undefined;},paintWithLevels(target){entered=true;armed=true;try{action(target,f,events);}finally{armed=false;}throw stop;}});
 try{try{f.sync([fibBaselineRecord()]);}catch(error){if(error!==stop)throw error;}expect(entered).toBe(true);}
 finally{registration.dispose();f.cleanup();}
}

it('cannot compose a copied or structural target',()=>{
 const fake={assertLocal(){},assertCurrent(){}} as unknown as OwnedFibTrendLineTarget;
 expect(()=>composeOwnedFibTargetProof(fake,()=>{},()=>{})).toThrow('genuine target');
 expect(()=>composeOwnedFibTargetProof({...fake},()=>{},()=>{})).toThrow('genuine target');
});
it('preserves exact prefix / target source / host source / prefix order',async()=>{
 await targetProbe((target,_f,events)=>{
  const proof=composeOwnedFibTargetProof(target,()=>{events.push('prefix');target.assertLocal();},()=>events.push('host-source'));
  events.length=0;proof.check();expect(events).toEqual(['prefix','target-source','host-source','prefix']);
  events.length=0;proof.check();expect(events).toEqual(['prefix','target-source','host-source','prefix']);
 });
});
it('opaque prefix mutation is observed by its mandatory full target tail and restoration cannot revive it',async()=>{
 await targetProbe((target,f)=>{
  const model=f.controller.drawings[0],before=model.style.lineWidth;
  const proof=composeOwnedFibTargetProof(target,()=>{model.style.lineWidth=before+1;},()=>{});
  // Local proofs no longer re-walk the graph; the frame-end walk
  // observes the mutation and retires the target for good.
  proof.local();expect(()=>assertOwnedFibTargetGraph(target)).toThrow(/target data changed/);model.style.lineWidth=before;
  expect(()=>proof.local()).toThrow();expect(()=>proof.check()).toThrow();
 });
});
it('a host source callback mutation gets a fresh whole target proof before return',async()=>{
 await targetProbe((target,f)=>{
  const model=f.controller.drawings[0],before=model.style.lineWidth;let sources=0;
  const proof=composeOwnedFibTargetProof(target,()=>{},()=>{sources++;model.style.lineWidth=before+1;});
  // The mutation is observed by the frame-end graph walk.
  proof.check();expect(sources).toBe(1);expect(()=>assertOwnedFibTargetGraph(target)).toThrow(/target data changed/);model.style.lineWidth=before;
  expect(()=>proof.check()).toThrow();expect(sources).toBe(1);
 });
});
it.each(['prefix','source'] as const)('throw undefined in %s permanently retires the composition',async phase=>{
 await targetProbe(target=>{
  let calls=0;
  const fail=()=>{calls++;throw undefined;};
  const proof=composeOwnedFibTargetProof(target,phase==='prefix'?fail:()=>{},phase==='source'?fail:()=>{});
  let caught=false;try{proof.check();}catch(error){caught=true;expect(error).toBeUndefined();}
  expect(caught).toBe(true);expect(calls).toBe(1);expect(()=>proof.check()).toThrow();expect(()=>proof.local()).toThrow();expect(calls).toBe(1);
 });
});
it.each(['local','check'] as const)('swallowed nested %s still retires the outer composition',async method=>{
 await targetProbe(target=>{
  let proof:ReturnType<typeof composeOwnedFibTargetProof>;
  proof=composeOwnedFibTargetProof(target,()=>{try{proof[method]();}catch{/* deliberate swallow */}},()=>{});
  expect(()=>proof.check()).toThrow();expect(()=>proof.local()).toThrow();
 });
});
it('a replaced iterator-dependent provider executes the same exhaustive checks as the original composition',async()=>{
 await targetProbe((target,_f,events)=>{
  const proof=composeOwnedFibTargetProof(target,()=>target.assertLocal(),()=>events.push('host-source'));
  const descriptor=Object.getOwnPropertyDescriptor(Array.prototype,'some')!,original=descriptor.value;
  let calls=0,oldCalls=0,newCalls=0;let oldEvents:string[]=[],newEvents:string[]=[];
  try{
   Object.defineProperty(Array.prototype,'some',{...descriptor,value:function(this:unknown[],...args:unknown[]){calls++;return Reflect.apply(original,this,args);}});
   events.length=0;proof.local();target.assertCurrent();events.push('host-source');proof.local();oldCalls=calls;oldEvents=events.slice();
   calls=0;events.length=0;proof.check();newCalls=calls;newEvents=events.slice();
  }finally{Object.defineProperty(Array.prototype,'some',descriptor);}
  expect(oldCalls).toBeGreaterThan(0);expect(newCalls).toBe(oldCalls);expect(newEvents).toEqual(oldEvents);
 });
});
it('the installed native route keeps exact legacy/default commands and aborts after a real Canvas source loss',async()=>{
 const f=await fibBaselineHarness();const row=fibBaselineRecord();
 const move=f.top.ctx.moveTo;
 try{
  if(!row.props)throw Error('SYNTHETIC Fib fixture requires drawing properties.');
  row.props.lvFibTrendLine={...row.props.lvFibTrendLine as object,enabled:false};delete row.props.lvFibBackground;delete row.props.lvFibText;
  // Harness construction renders the empty store once. Check that complete
  // setup frame, then give both compared drawing frames the same boundary.
  expect(f.top.commands).toStrictEqual([
   {op:'setTransform',values:[1,0,0,1,0,0]},
   {op:'clearRect',values:[0,0,400,300]},
  ]);
  f.top.commands.length=0;
  f.sync([row]);const legacy=structuredClone(f.top.commands);const explicit=structuredClone(row);
  if(!explicit.props)throw Error('Cloned SYNTHETIC Fib fixture lost its drawing properties.');
  explicit.props.lvFibBackground={schemaVersion:1,opacity:6};explicit.props.lvFibText={schemaVersion:1,enabled:true,position:'center'};
  f.top.commands.length=0;f.sync([explicit]);expect(f.top.commands).toStrictEqual(legacy);
  let cut=0,calls=0;f.top.ctx.moveTo=function(...args:unknown[]){const result=Reflect.apply(move,this,args);if(!calls++){f.retireSource();cut=f.top.commands.length;}return result;};
  f.top.commands.length=0;expect(()=>f.render()).toThrow();expect(calls).toBe(1);
  expect(f.top.commands.slice(cut).filter(command=>['fillText','stroke','fillRect','lineTo'].includes(command.op))).toEqual([]);
 }finally{f.top.ctx.moveTo=move;f.cleanup();}
});
