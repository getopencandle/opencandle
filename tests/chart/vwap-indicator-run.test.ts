import {describe,it,expect,vi} from 'vitest';
import {startVwapIndicatorRun} from '../../src/chart/vwap-indicator-run';
import type {Bar} from '../../src/domain/types';
import type {OwnedVwapPrefix} from '../../src/chart/vwap-prefix-source';
import type {VwapCalculationSettings,VwapClient,VwapResultLease} from '../../src/vwap/types';
// Isolated conversion/cleanup unit doubles only. Native integration tests use genuine client leases.
vi.mock('../../src/vwap/client',()=>({assertVwapResultLease:(lease:VwapResultLease)=>lease.assertCurrent()}));

const settings:VwapCalculationSettings={kernelVersion:2,source:'hlc3',anchor:'Session',timezone:'UTC',transform:'standard',bandMode:'Percentage',band1Enabled:false,band1Multiplier:1,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3};
function fixture(count=3){
 let current=true,resolve!:(value:VwapResultLease)=>void,reject!:(error:unknown)=>void,releases=0,cancels=0,requests=0;
 const chunks:Array<[number,number]>=[],values:Array<[number,number]>=[],resumes:Array<()=>void>=[];
 const rows:Bar[]=Array.from({length:count},(_,index)=>({time:100+index,open:index+1,high:index+2,low:index,close:index+1,volume:2}));
 const assert=()=>{if(!current)throw Error('source retired');};
 const prefix:OwnedVwapPrefix={rows:count,executionIdentity:'synthetic-run',transform:'standard',assertCurrent:assert,prepare:async()=>new ArrayBuffer(count*48),readRows(start,length){assert();chunks.push([start,length]);return rows.slice(start,start+length).map(row=>({...row}));}};
 const lease:VwapResultLease={rows:count,plots:[{id:'vwap',label:'VWAP'}],plotIds:['vwap'],policies:['synthetic test'],diagnostics:[],assertCurrent:assert,valueAt:()=>0,readChunk(_plot,start,length){assert();values.push([start,length]);return Array.from({length},(_,index)=>start+index===0?null:start+index);},release(){releases++;}};
 const promise=new Promise<VwapResultLease>((yes,no)=>{resolve=yes;reject=no;});
 const client:VwapClient={request(){requests++;return{result:promise,assertCurrent:assert,cancel(){cancels++;}};},dispose(){throw Error('shared client must not be disposed');}};
 const host={prefix,client,settings,token:{},assertCurrent:assert,assertCapacity(){},schedule(resume:()=>void){resumes.push(resume);return()=>{};}};
 return{host,prefix,lease,resolve,reject,rows,chunks,values,resumes,retire(){current=false;},get releases(){return releases;},get cancels(){return cancels;},get requests(){return requests;}};
}
const micro=async()=>{await Promise.resolve();await Promise.resolve();};
describe('version2 VWAP detached native conversion',()=>{
 it('uses bounded exact-prefix chunks and releases service storage after owned copies',async()=>{
  const f=fixture(129),run=startVwapIndicatorRun(f.host);f.resolve(f.lease);await micro();expect(f.resumes).toHaveLength(1);f.resumes.shift()!();const result=await run.result;
  expect(f.chunks).toEqual([[0,128],[128,1]]);expect(f.values).toEqual(f.chunks);expect(result.bars).toEqual(f.rows);expect(result.bars[0]).not.toBe(f.rows[0]);expect(result.result.series[0].values).toEqual([null,...Array.from({length:128},(_,index)=>index+1)]);expect(f.releases).toBe(1);expect(f.cancels).toBe(0);run.assertCurrent();
 });
 it('retires before a late worker lease and still releases that exact acquisition',async()=>{
  const f=fixture(),run=startVwapIndicatorRun(f.host);const rejected=expect(run.result).rejects.toThrow('cancelled');run.cancel();f.resolve(f.lease);await rejected;await micro();expect(f.releases).toBe(1);expect(f.chunks).toEqual([]);expect(f.cancels).toBe(1);
 });
 it('source replacement between conversion slices prevents further prefix reads',async()=>{
  const f=fixture(129),run=startVwapIndicatorRun(f.host);const rejected=expect(run.result).rejects.toThrow('source retired');f.resolve(f.lease);await micro();f.retire();f.resumes.shift()!();await rejected;expect(f.chunks).toEqual([[0,128]]);expect(f.releases).toBe(1);expect(f.cancels).toBe(1);
 });
 it('admits the complete allocation before any row or result chunk',async()=>{
  const f=fixture();f.host.assertCapacity=()=>{throw Error('capacity');};const run=startVwapIndicatorRun(f.host);f.resolve(f.lease);await expect(run.result).rejects.toThrow('capacity');expect(f.chunks).toEqual([]);expect(f.values).toEqual([]);expect(f.releases).toBe(1);
 });
 it('shares the admission deadline with final host materialization',async()=>{
  const f=fixture(129);let time=0;const run=startVwapIndicatorRun({...f.host,clock:()=>time});f.resolve(f.lease);await micro();time=60000;f.resumes.shift()!();await expect(run.result).rejects.toThrow('shared deadline');expect(f.chunks).toEqual([[0,128]]);expect(f.releases).toBe(1);
 });
 it('empty prefix is a settled unavailable result without a queued worker',async()=>{
  const f=fixture(0),run=startVwapIndicatorRun(f.host);const result=await run.result;expect(result.result.series).toEqual([]);expect(result.result.diagnostics[0]).toContain('prefix contains bars');expect(f.requests).toBe(0);expect(f.chunks).toEqual([]);run.cancel();
 });
 it('release failure rejects conversion and still cancels the job',async()=>{
  const f=fixture();f.lease.release=()=>{throw Error('release failed');};const run=startVwapIndicatorRun(f.host);f.resolve(f.lease);await expect(run.result).rejects.toThrow('release failed');expect(f.cancels).toBe(1);
 });
 it('rejects a scheduler that resumes synchronously and attempts its cleanup',async()=>{
  const f=fixture(129);let cleanup=0;const run=startVwapIndicatorRun({...f.host,schedule(resume){resume();return()=>{cleanup++;};}});f.resolve(f.lease);await expect(run.result).rejects.toThrow('must yield asynchronously');expect(cleanup).toBe(1);expect(f.releases).toBe(1);
 });
});
