import {describe,expect,it,vi} from 'vitest';
import type {Bar} from '../../src/domain/types';
import type {OwnedVwapPrefix} from '../../src/chart/vwap-prefix-source';
import type {VwapCalculationSettings,VwapClient,VwapResultLease} from '../../src/vwap/types';
import type {IndicatorResult} from '../../src/domain/indicators';
import type {IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import type {PreparedVwapPresentation} from '../../src/chart/vwap-presentation';
import {startVwapIndicatorRun} from '../../src/chart/vwap-indicator-run';
import {consumeVwapPresentation} from '../../src/chart/vwap-presentation';

// Isolated lifecycle/cleanup doubles. Actual-native tests use genuine client leases.
vi.mock('../../src/vwap/client',()=>({assertVwapResultLease:(lease:VwapResultLease)=>lease.assertCurrent()}));
const observed=vi.hoisted(()=>({complete:[] as Array<{receipt:PreparedVwapPresentation;result:IndicatorResult;bars:Bar[];settings:IndicatorInstanceSettings}>}));
vi.mock('../../src/chart/vwap-presentation',async original=>{
 const actual=await original<typeof import('../../src/chart/vwap-presentation')>();
 return {...actual,createVwapPresentationPreparation(host:Parameters<typeof actual.createVwapPresentationPreparation>[0]){
  const owned=actual.createVwapPresentationPreparation(host);
  return {append(start:number,count:number){owned.append(start,count);},complete(result:IndicatorResult){const receipt=owned.complete(result);observed.complete.push({receipt,result,bars:host.bars,settings:host.settings});return receipt;},retire(){owned.retire();}};
 }};
});
const settings:VwapCalculationSettings={kernelVersion:2,source:'close',anchor:'Session',timezone:'UTC',transform:'standard',bandMode:'Percentage',band1Enabled:false,band1Multiplier:1,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3};
const presentationSettings=():IndicatorInstanceSettings=>({id:'run-preparation',kind:'vwap',inputs:{kernelVersion:2,source:'close',bandMode:'Percentage',band1Enabled:false,band1Multiplier:1,band2Enabled:false,band2Multiplier:2,band3Enabled:false,band3Multiplier:3},plots:{},offset:0,visible:true});
function fixture(count=129){
 observed.complete=[];let current=true,releases=0,cancels=0,cleanups=0,time=0,resolve!:(value:VwapResultLease)=>void;
 let releaseHook=()=>{},valueAt=(index:number):number|null=>index===0?null:index;
 const resumes:Array<()=>void>=[],chunks:Array<[number,number]>=[],bars:Bar[]=Array.from({length:count},(_,index)=>({time:1700000000+index,open:1,high:1,low:1,close:1,volume:1}));
 const assert=()=>{if(!current)throw Error('literal source retired');};
 const prefix:OwnedVwapPrefix={rows:count,executionIdentity:'literal-run',transform:'standard',assertCurrent:assert,prepare:async()=>new ArrayBuffer(count*48),readRows(start,size){assert();chunks.push([start,size]);return bars.slice(start,start+size).map(row=>({...row}));}};
 const lease:VwapResultLease={rows:count,plots:[{id:'vwap',label:'VWAP'}],plotIds:['vwap'],diagnostics:[],policies:['literal policy'],assertCurrent:assert,valueAt:(_plot,index)=>valueAt(index),readChunk(_plot,start,size){assert();return Array.from({length:size},(_,index)=>valueAt(start+index));},release(){releases++;releaseHook();}};
 const promise=new Promise<VwapResultLease>(yes=>{resolve=yes;});
 const client:VwapClient={request(){return{result:promise,assertCurrent:assert,cancel(){cancels++;}};},dispose(){throw Error('shared client is not owned');}};
 const saved=presentationSettings(),host={prefix,client,settings,token:{},presentation:{settings:saved,context:{resolution:'1m'}},assertCurrent:assert,assertCapacity(){},clock:()=>time,schedule(resume:()=>void){resumes.push(resume);return()=>{cleanups++;};}};
 return{host,lease,resolve,resumes,chunks,saved,retire(){current=false;},onRelease(hook:()=>void){releaseHook=hook;},setValue(hook:(index:number)=>number|null){valueAt=hook;},setClock(value:number){time=value;},get releases(){return releases;},get cancels(){return cancels;},get cleanups(){return cleanups;}};
}
const micro=async()=>{await Promise.resolve();await Promise.resolve();};
const consumeObserved=()=>{const last=observed.complete.at(-1)!;return consumeVwapPresentation(last.receipt,{...last,context:{resolution:'1m'}});};
describe('VWAP run owns bounded presentation lifetime',()=>{
 it('keeps staged output private until all129 rows complete and releases the result exactly once',async()=>{
  const f=fixture(),run=startVwapIndicatorRun(f.host);f.resolve(f.lease);await micro();expect(observed.complete).toEqual([]);expect(f.chunks).toEqual([[0,128]]);expect(f.resumes).toHaveLength(1);f.resumes.shift()!();const result=await run.result;
  expect(f.chunks).toEqual([[0,128],[128,1]]);expect(f.releases).toBe(1);expect(f.cleanups).toBe(1);expect(result.presentation).toBe(observed.complete[0].receipt);
  const output=consumeObserved();expect(output.output.series![0]).toMatchObject({title:'VWAP'});expect((output.output.series![0] as any).points).toEqual(result.bars.map((row,index)=>({time:row.time*1000,value:index===0?null:index})));run.cancel();expect((output.output.series![0] as any).points).toHaveLength(129);
 });
 it('cancels a partial point candidate, lease, pending task and old callback without completion',async()=>{
  const f=fixture(),run=startVwapIndicatorRun(f.host),rejected=expect(run.result).rejects.toThrow(/cancelled/);f.resolve(f.lease);await micro();run.cancel();f.resumes.shift()!();await rejected;await micro();expect(f.chunks).toEqual([[0,128]]);expect(observed.complete).toEqual([]);expect(f.releases).toBe(1);expect(f.cancels).toBe(1);expect(f.cleanups).toBe(1);
 });
 it('source retirement during a yield leaves no complete receipt or additional row reads',async()=>{
  const f=fixture(),run=startVwapIndicatorRun(f.host),rejected=expect(run.result).rejects.toThrow(/source retired/);f.resolve(f.lease);await micro();f.retire();f.resumes.shift()!();await rejected;expect(observed.complete).toEqual([]);expect(f.chunks).toEqual([[0,128]]);expect(f.releases).toBe(1);
 });
 it('revokes the already completed receipt when lease release fails',async()=>{
  const f=fixture(1);f.onRelease(()=>{throw Error('literal lease release failure');});const run=startVwapIndicatorRun(f.host);f.resolve(f.lease);await expect(run.result).rejects.toThrow(/release failed/);expect(observed.complete).toHaveLength(1);expect(()=>consumeObserved()).toThrow(/retired/);expect(f.releases).toBe(1);expect(f.cancels).toBe(1);
 });
 it('cancellation inside result release revokes the completed receipt before result settlement',async()=>{
  const f=fixture(1),run=startVwapIndicatorRun(f.host),rejected=expect(run.result).rejects.toThrow(/cancelled/);f.onRelease(()=>run.cancel());f.resolve(f.lease);await rejected;await micro();expect(observed.complete).toHaveLength(1);expect(()=>consumeObserved()).toThrow(/retired/);expect(f.releases).toBe(1);expect(f.cancels).toBe(1);
 });
 it('cancellation after materialization revokes the unconsumed receipt',async()=>{
  const f=fixture(1),run=startVwapIndicatorRun(f.host);f.resolve(f.lease);await run.result;run.cancel();expect(()=>consumeObserved()).toThrow(/retired/);expect(f.releases).toBe(1);
 });
 it('a late nonfinite value rejects the complete candidate and still releases storage',async()=>{
  const f=fixture();f.setValue(index=>index===128?Infinity:0);const run=startVwapIndicatorRun(f.host),rejected=expect(run.result).rejects.toThrow(/numerical/);f.resolve(f.lease);await micro();f.resumes.shift()!();await rejected;expect(observed.complete).toEqual([]);expect(f.releases).toBe(1);expect(f.cancels).toBe(1);
 });
 it('retains the original total deadline while presentation is staged',async()=>{
  const f=fixture(),run=startVwapIndicatorRun(f.host),rejected=expect(run.result).rejects.toThrow(/shared deadline/);f.resolve(f.lease);await micro();f.setClock(60000);f.resumes.shift()!();await rejected;expect(f.chunks).toEqual([[0,128]]);expect(observed.complete).toEqual([]);expect(f.releases).toBe(1);
 });
 it('zero rows still skip service and preparation and settle unavailable',async()=>{
  const f=fixture(0);f.host.client.request=()=>{throw Error('zero rows must not start service');};const run=startVwapIndicatorRun(f.host),result=await run.result;expect(result.presentation).toBeUndefined();expect(result.result.series).toEqual([]);expect(observed.complete).toEqual([]);expect(f.releases).toBe(0);run.cancel();
 });
});
