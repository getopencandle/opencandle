import {expect,it,vi} from 'vitest';
import {createVwapClient} from '../../src/vwap/client';
import type {VwapCalculationSettings,VwapWorkerPort} from '../../src/vwap/types';

const settings:VwapCalculationSettings={kernelVersion:2,source:'close',anchor:'Century',timezone:'UTC',transform:'standard',bandMode:'Percentage',band1Enabled:false,band1Multiplier:1,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3};
const input=()=>({rows:1,settings,prepare:()=>new Float64Array([1000,10,10,10,10,1]).buffer});

it('queue overflow refuses only the new request before private packing and retains all16FIFO siblings',async()=>{
 let packs=0,factories=0,release!:()=>void;
 const blocked=new Promise<ArrayBuffer>(resolve=>{release=()=>resolve(new Float64Array([1000,10,10,10,10,1]).buffer);});
 const client=createVwapClient({factory(){factories++;throw Error('No worker before private packing returns');}});
 const failures:Promise<unknown>[]=[];
 const request=()=>{const job=client.request({...input(),prepare(){packs++;return blocked;}},{token:{},signal:new AbortController().signal,assertCurrent(){}});failures.push(job.result.catch(error=>error));return job;};
 try{
  const active=request();for(let index=0;index<12;index++)await Promise.resolve();
  const waiting=Array.from({length:16},()=>request());
  expect(()=>request()).toThrow(/queue.*full/i);expect(packs).toBe(1);expect(factories).toBe(0);
  expect(()=>active.assertCurrent()).not.toThrow();for(const job of waiting)expect(()=>job.assertCurrent()).not.toThrow();
 }finally{client.dispose();release();await Promise.all(failures);}
});

it('reserves the result-byte budget before queued packing and releases cancelled reservations without evicting another owner',async()=>{
 let packs=0,release!:()=>void;
 const blocked=new Promise<ArrayBuffer>(resolve=>{release=()=>resolve(new ArrayBuffer(0));});
 const client=createVwapClient({factory(){throw Error('No worker before private packing returns');}});
 const failures:Promise<unknown>[]=[];
 const allBands={...settings,band1Enabled:true,band2Enabled:true,band3Enabled:true};
 const request=()=>{const job=client.request({rows:100000,settings:allBands,prepare(){packs++;return blocked;}},{token:{},signal:new AbortController().signal,assertCurrent(){}});failures.push(job.result.catch(error=>error));return job;};
 try{
  const live=Array.from({length:5},()=>request());
  expect(()=>request()).toThrow(/capacity|budget/i);expect(packs).toBe(0);
  live[2].cancel();const replacement=request();expect(()=>replacement.assertCurrent()).not.toThrow();
  for(const job of [live[0],live[1],live[3],live[4]])expect(()=>job.assertCurrent()).not.toThrow();
  expect(packs).toBe(0);
 }finally{client.dispose();release();await Promise.all(failures);}
});

it('late-acquired worker termination failure promptly retires already queued siblings instead of leaving them pending',async()=>{
 vi.useFakeTimers();const abort=new AbortController();let factories=0,terminations=0,siblingPacks=0,siblingSettled=false,siblingError:unknown;
 const client=createVwapClient({factory(){
  factories++;abort.abort();
  const port:VwapWorkerPort={addEventListener(){},removeEventListener(){},postMessage(){},terminate(){terminations++;throw Error('Late acquired worker termination failed');}};
  return port;
 }});
 try{
  const first=client.request(input(),{token:{},signal:abort.signal,assertCurrent(){}});
  const firstFailure=first.result.catch(error=>error);
  const sibling=client.request({...input(),prepare(){siblingPacks++;return input().prepare();}},{token:{},signal:new AbortController().signal,assertCurrent(){}});
  const siblingFailure=sibling.result.then(()=>{siblingSettled=true;},error=>{siblingSettled=true;siblingError=error;});
  for(let index=0;index<30;index++)await Promise.resolve();
  expect(await firstFailure).toBeInstanceOf(Error);expect(factories).toBe(1);expect(terminations).toBe(1);expect(siblingPacks).toBe(0);
  expect(siblingSettled).toBe(true);expect(siblingError).toBeInstanceOf(Error);expect(String(siblingError)).toMatch(/quarantin|cleanup|terminat/i);
  await siblingFailure;
 }finally{try{client.dispose();}finally{vi.useRealTimers();}}
});
