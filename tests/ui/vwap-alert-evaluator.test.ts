import {afterEach,expect,it} from 'vitest';
import {createTechnicalVwapEvaluator} from '../../src/ui/vwap-alert-evaluator';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {captureIndicatorAlertSource} from '../../src/domain/technical-alerts';
import {alertDatasetKey} from '../../src/domain/alert-observation';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createOwnedVwapPrefixSource,type VwapPrefixBasis} from '../../src/chart/vwap-prefix-source';
import {createVwapClient} from '../../src/vwap/client';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import type {VwapClient,VwapWorkerPort} from '../../src/vwap/types';
import type {ChartController} from '../../src/chart/adapter';

const drain=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
class WorkerPort implements VwapWorkerPort{
 listeners=new Map<string,Set<(event:any)=>void>>();request:any;stopped=0;
 constructor(private auto:boolean){queueMicrotask(()=>this.emit({v:1,type:'ready'}));}
 addEventListener(type:string,fn:(event:any)=>void){const list=this.listeners.get(type)??new Set();list.add(fn);this.listeners.set(type,list);}
 removeEventListener(type:string,fn:(event:any)=>void){this.listeners.get(type)?.delete(fn);}
 postMessage(message:unknown,transfer:Transferable[]){this.request=structuredClone(message,{transfer});if(this.auto)queueMicrotask(()=>this.finish());}
 terminate(){this.stopped++;}
 emit(data:unknown){for(const fn of this.listeners.get('message')??[])fn({data});}
 finish(){try{this.emit(calculateVwapWorkerMessage(this.request));}catch(error){this.emit({v:1,type:'error',code:'VWAP_TEST',message:String(error)});}}
}
const clients:VwapClient[]=[];afterEach(()=>{for(const client of clients.splice(0))client.dispose();});
function setup(auto=true){
 const dataset=fixtureDataset('GME',2);dataset.bars=[{time:1700000000,open:2,high:8,low:2,close:6,volume:1},{time:1700000060,open:6,high:10,low:4,close:8,volume:1}];const bars=dataset.bars;
 let live=true,run='ordinary',basis:VwapPrefixBasis={epoch:{},source:{},bars:structuredClone(bars),style:'candles',executionIdentity:run,disposed:false};const prefix=createOwnedVwapPrefixSource({readBasis:()=>basis}),workers:WorkerPort[]=[];
 const client=createVwapClient({factory:()=>{const port=new WorkerPort(auto);workers.push(port);return port;}});clients.push(client);
 const chart={getStyle:()=>basis.style,getExecutionIdentity:()=>run,isInputCurrent:(input:any)=>input.bars===bars&&input.style===basis.style,captureVwapPrefix:(_input:any,expected:string)=>{if(run!==expected)throw Error('Changed run');return prefix.capture();}} as unknown as ChartController;
 const evaluator=()=>createTechnicalVwapEvaluator({chart,dataset,bars,executionIdentity:run,isCurrent:()=>live,client:()=>client});
 const request=(transform:'standard'|'heikinashi'='standard')=>({inputs:{kernelVersion:2,source:'close',anchor:'Century',timezone:'UTC'},transform,prefix:bars,sourceBasis:alertDatasetKey(dataset,2),sourceRevision:dataset.provenance.revision,signal:new AbortController().signal,cancelled:()=>false});
 return{dataset,bars,chart,workers,evaluator,request,retire:()=>live=false,replace:()=>{basis={...basis,epoch:{},bars:structuredClone(bars)};},run:(next:string)=>{run=next;basis={...basis,epoch:{},executionIdentity:next};}};
}
it('actual evaluator transports only the private raw prefix and explicitly applies frozen HA independently of visible style',async()=>{
 const f=setup(),evaluate=f.evaluator(),standard=await evaluate.evaluate(f.request());expect(standard.readChunk('vwap',0,2)).toEqual([6,7]);standard.release();
 const ha=await evaluate.evaluate(f.request('heikinashi'));expect(f.chart.getStyle()).toBe('candles');expect(ha.readChunk('vwap',0,2)).toEqual([4.5,5.75]);ha.release();expect(f.workers[1].request.settings.transform).toBe('heikin-ashi');
});
it.each(['prefix','sourceBasis','sourceRevision'] as const)('rejects an unrelated %s before requesting a worker',async key=>{
 const f=setup(),request=f.request();(request as any)[key]=key==='prefix'?structuredClone(f.bars):'changed';await expect(f.evaluator().evaluate(request)).rejects.toThrow('owned source');expect(f.workers).toHaveLength(0);
});
it.each(['source','run','ui'] as const)('%s retirement while a worker is active cannot deliver a lease to an old alert',async kind=>{
 const f=setup(false),pending=f.evaluator().evaluate(f.request()),failure=expect(pending).rejects.toThrow();await drain();expect(f.workers).toHaveLength(1);if(kind==='source')f.replace();else if(kind==='run')f.run('replay:new');else f.retire();f.workers[0].finish();await failure;
});
it('observer cancellation terminates active v2 work and publishes no partial event',async()=>{
 const f=setup(false),observer=new TechnicalAlertObserver(()=> 'local-session',()=>Promise.resolve()),source=captureIndicatorAlertSource({id:'vwap',kind:'vwap',inputs:f.request().inputs,plots:{},offset:0,visible:true},'vwap','standard','exact-capture');
 const input={dataset:f.dataset,bars:f.bars,chartId:'chart',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts:[],vwap:f.evaluator()};const pending=observer.observe(input,1700001000);await drain();expect(f.workers).toHaveLength(1);observer.cancelPending();const result=await pending;expect(result.cancelled).toBe(true);expect(result.events).toEqual([]);expect(f.workers[0].stopped).toBe(1);f.workers[0].finish();
});
it('observer cache needs its original private prefix proof and recomputes after same-ID replacement',async()=>{
 const f=setup(),observer=new TechnicalAlertObserver(()=> 'local-session',()=>Promise.resolve()),source=captureIndicatorAlertSource({id:'vwap',kind:'vwap',inputs:f.request().inputs,plots:{},offset:0,visible:true},'vwap','standard','exact-capture');
 const input=()=>({dataset:f.dataset,bars:f.bars,chartId:'chart',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts:[],vwap:f.evaluator()});
 const first=await observer.observe(input(),1700001000);expect(first.selectedEvent?.value).toBe(7);expect(f.workers).toHaveLength(1);await observer.observe(input(),1700001001);expect(f.workers).toHaveLength(1);f.replace();const replaced=await observer.observe(input(),1700001002);expect(replaced.cancelled).toBe(false);expect(replaced.selectedEvent?.value).toBe(7);expect(f.workers).toHaveLength(2);
});
