import {expect,it} from 'vitest';
import {statsPainterHarness} from '../chart/trendline-stats-painter-harness';
import {fibBaselineRecord} from '../chart/fib-trend-line-painter-harness';
import {composeOwnedFibTargetProof,registerOwnedFibTrendLine,type OwnedFibTrendLineTarget} from '../../src/chart/trendline-annotation';

// Synthetic actual annotation frames mint these targets. A target-shaped object
// never supplies frame ownership. No renderer-method wrappers or timing claims.
async function withTarget(action:(target:OwnedFibTrendLineTarget,f:Awaited<ReturnType<typeof statsPainterHarness>>)=>void){
 const f=await statsPainterHarness([]);let armed=false,visited=0;
 const registration=registerOwnedFibTrendLine(f.renderer,{paint(target){if(armed){visited++;action(target,f);}},hit(){return undefined;}});
 try{
  const row=fibBaselineRecord();f.document.load({version:1,drawings:[row]});f.core.controller.fromJSON({version:1,drawings:[row]});
  armed=true;f.render();expect(visited).toBeGreaterThan(0);
 }finally{registration.dispose();f.cleanup();}
}

it('a swallowed recursive local proof permanently rejects the first outer return',async()=>{
 await withTarget(target=>{
  let nested=0;let proof:ReturnType<typeof composeOwnedFibTargetProof>;
  proof=composeOwnedFibTargetProof(target,()=>{try{proof.local();}catch{nested++;}},()=>{});
  expect(()=>proof.local()).toThrow();expect(nested).toBe(1);expect(()=>proof.local()).toThrow();expect(()=>proof.check()).toThrow();
 });
});

it('an own ordinal getter retains all exhaustive local callback observations',async()=>{
 await withTarget((target,f)=>{
  const array=f.controller.drawings,index=array.findIndex((model:any)=>model.id===target.id),before=Object.getOwnPropertyDescriptor(array,String(index));
  expect(index).toBeGreaterThanOrEqual(0);expect(before&&Object.hasOwn(before,'value')).toBe(true);
  let reads=0,prefixes=0,hostCalls=0;const model=before!.value;
  Object.defineProperty(array,String(index),{configurable:true,enumerable:before!.enumerable,get(){reads++;return model;}});
  try{
   const proof=composeOwnedFibTargetProof(target,()=>{prefixes++;},()=>{hostCalls++;});proof.check();
   // Existing exhaustive schedule: prefix/local, target local/source/local,
   // host source, prefix/local. The ordinal read is itself a callback.
   expect(reads).toBe(4);expect(prefixes).toBe(2);expect(hostCalls).toBe(1);
  }finally{Object.defineProperty(array,String(index),before!);}
 });
});

it('an undefined host failure stays exact and prevents any later composed proof reuse',async()=>{
 await withTarget(target=>{
  let calls=0;const proof=composeOwnedFibTargetProof(target,()=>{},()=>{calls++;throw undefined;});let failed=false,cause:unknown='SYNTHETIC sentinel';
  try{proof.check();}catch(error){failed=true;cause=error;}
  expect(failed).toBe(true);expect(cause).toBeUndefined();expect(calls).toBe(1);expect(()=>proof.local()).toThrow();expect(()=>proof.check()).toThrow();expect(calls).toBe(1);
 });
});

it('a public-shaped target cannot mint composition or invoke opaque callbacks',()=>{
 let calls=0;const callback=()=>{calls++;};const fake={identity:{},scope:{},id:'SYNTHETIC forged target',paneId:'price',mode:'committed',anchors:[],assertCurrent:callback,assertLocal:callback,projected:callback,origin:callback};
 expect(()=>composeOwnedFibTargetProof(fake as unknown as OwnedFibTrendLineTarget,callback,callback)).toThrow();expect(calls).toBe(0);
});
