import {afterEach,expect,it,vi} from 'vitest';
import {createVwapClient,assertVwapResultLease,releaseVwapResultLease} from '../../src/vwap/client';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import {effectiveVwapSettings} from '../../src/vwap/settings';
import type {VwapClient,VwapResultLease,VwapWorkerPort} from '../../src/vwap/types';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey,type TechnicalVwapRequest} from '../../src/domain/technical-alerts';
import type {AlertSourceSnapshot} from '../../src/domain/alert-observation';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import type {Bar} from '../../src/domain/types';

const rows=(n=2):Bar[]=>Array.from({length:n},(_,i)=>({time:1000+i,open:10+i*10,high:10+i*10,low:10+i*10,close:10+i*10,volume:1}));
const source=(plot='vwap',bands=false)=>captureIndicatorAlertSource({id:'owned',kind:'vwap',inputs:{kernelVersion:2,source:'close',anchor:'Century',timezone:'UTC',...(bands?{...VWAP_BAND_DEFAULTS,band1Enabled:true,band1Multiplier:10}:{})},plots:{},offset:0,visible:true},plot,'standard','snapshot');
const clients:VwapClient[]=[];
class AutoWorker implements VwapWorkerPort{
 listeners=new Map<string,Set<(event:any)=>void>>();
 constructor(){queueMicrotask(()=>this.emit({v:1,type:'ready'}));}
 addEventListener(type:string,callback:(event:any)=>void){const set=this.listeners.get(type)??new Set();set.add(callback);this.listeners.set(type,set);}
 removeEventListener(type:string,callback:(event:any)=>void){this.listeners.get(type)?.delete(callback);}
 postMessage(message:unknown,transfer:Transferable[]){const copy=structuredClone(message,{transfer});queueMicrotask(()=>{try{this.emit(calculateVwapWorkerMessage(copy));}catch(cause){this.emit({v:1,type:'error',code:'TEST_KERNEL',message:(cause as Error).message});}});}
 terminate(){}
 emit(data:unknown){for(const callback of this.listeners.get('message')??[])callback({data});}
}
function service(){const client=createVwapClient({factory:()=>new AutoWorker(),schedule(resume){let active=true;queueMicrotask(()=>{if(active)resume();});return()=>{active=false;};}});clients.push(client);return client;}
const pack=(bars:readonly Bar[])=>new Float64Array(bars.flatMap(row=>[row.time,row.open,row.high,row.low,row.close,row.volume??NaN])).buffer;
async function acquire(client:VwapClient,bars:readonly Bar[],request:TechnicalVwapRequest,assertCurrent=()=>{}){return client.request({rows:bars.length,settings:effectiveVwapSettings(request.inputs,request.transform),prepare:()=>pack(bars)},{token:{},signal:request.signal,assertCurrent}).result;}
const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
afterEach(()=>{for(const client of clients.splice(0))client.dispose();vi.useRealTimers();});

it('evaluates exact v2 base and band once, releases the genuine lease and preserves mixed operands',async()=>{
 const client=service(),prefix=rows(),base=source(),upper=source('upper1',true),comparison:AlertSourceSnapshot={kind:'comparison',snapshotId:'mixed',left:base,right:{kind:'price',field:'close',transformId:'standard'}};
 let calls=0;const leases:VwapResultLease[]=[];
 const batch=await evaluateTechnicalAlertSources(prefix,[base,comparison,upper],'USD',{yieldControl:()=>Promise.resolve(),sourceBasis:'basis',sourceRevision:'revision',evaluateVwap:async request=>{calls++;expect(request.prefix).toBe(prefix);expect(request.sourceBasis).toBe('basis');expect(Object.isFrozen(request.inputs)).toBe(true);const lease=await acquire(client,prefix,request);leases.push(lease);return lease;}});
 expect(batch.cancelled).toBe(false);expect(calls).toBe(2);expect(batch.results.get(technicalSourceKey(base))!.sample.value).toBe(15);expect(batch.results.get(technicalSourceKey(upper))!.sample.value).toBe(16.5);expect(batch.results.get(technicalSourceKey(comparison))!.sample.value).toBe(-5);
 expect(batch.results.get(technicalSourceKey(base))!.sample).toMatchObject({informationBars:2,informationEndTime:1001,informationEndIndex:1});for(const lease of leases)expect(()=>assertVwapResultLease(lease)).toThrow(/cancel/);
});

it('repairs overflowing production-prefix products without calling a synchronous fallback',async()=>{
 const client=service(),prefix=rows().map(row=>({...row,open:1e308,high:1e308,low:1e308,close:1e308,volume:1e308})),captured=source();
 const batch=await evaluateTechnicalAlertSources(prefix,[captured],'USD',{evaluateVwap:request=>acquire(client,prefix,request)});expect(batch.results.get(technicalSourceKey(captured))!.sample.value).toBe(1e308);
 await expect(evaluateTechnicalAlertSources(prefix,[captured],'USD')).rejects.toThrow(/owned asynchronous/);
});

it('stages ordinary comparison values and metadata before an asynchronous prefix replacement',async()=>{
 const client=service(),prefix=rows(),original=prefix.map(row=>({...row})),captured=source(),comparison:AlertSourceSnapshot={kind:'comparison',snapshotId:'mixed',left:captured,right:{kind:'price',field:'close',transformId:'standard'}};
 const batch=await evaluateTechnicalAlertSources(prefix,[comparison],'USD',{evaluateVwap:async request=>{const lease=await acquire(client,original,request);prefix[1].close=999;prefix.push({...prefix[1],time:1002,close:777});captured.inputs.source='open';return lease;}});
 const result=[...batch.results.values()][0];expect(result.sample.value).toBe(-5);expect(result.sample.informationBars).toBe(2);expect(result.sample.informationEndTime).toBe(1001);expect(result.sample.source.kind).toBe('comparison');
});

it('rejects a public-shaped lease without invoking getters and rejects a genuine mismatched job',async()=>{
 let reads=0;const prefix=rows(),captured=source();
 await expect(evaluateTechnicalAlertSources(prefix,[captured],'USD',{evaluateVwap:async()=>({get plots(){reads++;return[];},get release(){reads++;return()=>{};}} as unknown as VwapResultLease)})).rejects.toThrow(/genuine/);expect(reads).toBe(0);
 const client=service();let lease!:VwapResultLease;
 await expect(evaluateTechnicalAlertSources(prefix,[captured],'USD',{evaluateVwap:async request=>{lease=await acquire(client,prefix,{...request,inputs:{...request.inputs,source:'open'}});return lease;}})).rejects.toThrow(/match/);expect(()=>lease.assertCurrent()).toThrow(/cancel/);
});

it('cancels between materialized chunks, publishing no partial sample and releasing its result',async()=>{
 const client=service(),prefix=rows(257),captured=source(),controller=new AbortController();let lease!:VwapResultLease,yields=0;
 const batch=await evaluateTechnicalAlertSources(prefix,[captured],'USD',{signal:controller.signal,evaluateVwap:async request=>(lease=await acquire(client,prefix,request)),yieldControl:async()=>{if(++yields===1)controller.abort();}});
 expect(batch.cancelled).toBe(true);expect(batch.results.size).toBe(0);expect(yields).toBe(1);expect(()=>lease.assertCurrent()).toThrow(/cancel/);
});

it('rejects retired source authority during a chunk and releases even when current reads fail',async()=>{
 const client=service(),prefix=rows(257),captured=source();let lease!:VwapResultLease,current=true;
 await expect(evaluateTechnicalAlertSources(prefix,[captured],'USD',{evaluateVwap:async request=>(lease=await acquire(client,prefix,request,()=>{if(!current)throw Error('source retired');})),yieldControl:async()=>{current=false;}})).rejects.toThrow(/source retired/);
 current=true;expect(()=>lease.assertCurrent()).toThrow(/cancel/);releaseVwapResultLease(lease);
});

it('applies one deadline across acquisition and materialization and releases an eventual late lease',async()=>{
 vi.useFakeTimers();const client=service(),prefix=rows(),captured=source();let provide!:(lease:VwapResultLease)=>void,request!:TechnicalVwapRequest;
 const pending=evaluateTechnicalAlertSources(prefix,[captured],'USD',{evaluateVwap:input=>{request=input;return new Promise(resolve=>{provide=resolve;});}}),failure=expect(pending).rejects.toThrow(/deadline/);
 await drain();const independent={...request,signal:new AbortController().signal};const lease=await acquire(client,prefix,independent);await vi.advanceTimersByTimeAsync(60001);await failure;provide(lease);await drain();expect(()=>lease.assertCurrent()).toThrow(/cancel/);
});

it('refuses unavailable volume in the exact worker instead of inventing a zero-weight row',async()=>{
 const client=service(),prefix=rows(),captured=source();prefix[1].volume=NaN;
 await expect(evaluateTechnicalAlertSources(prefix,[captured],'USD',{evaluateVwap:request=>acquire(client,prefix,request)})).rejects.toThrow(/volume/i);
});

it('retains exact legacy calculation when no worker evaluator was supplied',async()=>{
 const prefix=rows(),captured={...source(),inputs:{source:'close',anchor:'Century',timezone:'UTC',kernelVersion:1}};
 const batch=await evaluateTechnicalAlertSources(prefix,[captured],'USD');expect(batch.results.get(technicalSourceKey(captured))!.sample.value).toBe(15);expect(captured.inputs.kernelVersion).toBe(1);
});
