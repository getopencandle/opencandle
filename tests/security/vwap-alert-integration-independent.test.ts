import {expect,it} from 'vitest';
import {createTechnicalVwapEvaluator} from '../../src/ui/vwap-alert-evaluator';
import {TechnicalAlertObserver} from '../../src/ui/technical-alert-observer';
import {createOwnedVwapPrefixSource,type VwapPrefixBasis} from '../../src/chart/vwap-prefix-source';
import {createVwapClient} from '../../src/vwap/client';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import {fixtureDataset} from '../../src/domain/fixtures';
import {captureIndicatorAlertSource} from '../../src/domain/technical-alerts';
import type {VwapWorkerPort} from '../../src/vwap/types';
import type {ChartController} from '../../src/chart/adapter';

// Actual observer/evaluator/private-prefix/client/kernel; controller and transport
// are controlled. No mounted interface or packaged browser-worker claim.
function fixture(){
 const dataset=fixtureDataset('GME',2);dataset.bars=[{time:1700000000,open:10,high:10,low:10,close:10,volume:1},{time:1700000060,open:20,high:20,low:20,close:20,volume:3}];
 const bars=dataset.bars;let epoch={},live=true,workers=0;
 const read=():VwapPrefixBasis=>({epoch,source:dataset,bars:privateBars,style:'candles',executionIdentity:'ordinary',disposed:!live});
 const privateBars=structuredClone(bars),prefix=createOwnedVwapPrefixSource({readBasis:read});
 class Port implements VwapWorkerPort{
  listeners=new Map<string,Set<(event:any)=>void>>();
  constructor(){workers++;queueMicrotask(()=>this.emit({v:1,type:'ready'}));}
  addEventListener(type:string,listener:(event:any)=>void){const set=this.listeners.get(type)??new Set();set.add(listener);this.listeners.set(type,set);}
  removeEventListener(type:string,listener:(event:any)=>void){this.listeners.get(type)?.delete(listener);}
  postMessage(value:unknown,transfer:Transferable[]){const request=structuredClone(value,{transfer});queueMicrotask(()=>this.emit(calculateVwapWorkerMessage(request)));}
  terminate(){}
  emit(data:unknown){for(const listener of this.listeners.get('message')??[])listener({data});}
 }
 const client=createVwapClient({factory:()=>new Port()});
 const chart={getStyle:()=> 'candles',getExecutionIdentity:()=> 'ordinary',isInputCurrent:(input:any)=>live&&input.bars===bars&&input.style==='candles',captureVwapPrefix:()=>prefix.capture()} as unknown as ChartController;
 const source=captureIndicatorAlertSource({id:'owned-vwap',kind:'vwap',inputs:{kernelVersion:2,source:'close',anchor:'Century',timezone:'UTC'},plots:{},offset:0,visible:true},'vwap','standard','SYNTHETIC-frozen');
 const input=()=>({dataset,bars,chartId:'SYNTHETIC-chart',replay:null,assumeReplayCompletion:false,selectedSource:source,alerts:[],vwap:createTechnicalVwapEvaluator({chart,dataset,bars,executionIdentity:'ordinary',isCurrent:()=>live,client:()=>client})});
 return{input,replace(){epoch={};},retire(){live=false;},workers:()=>workers,dispose(){client.dispose();prefix.dispose();}};
}

it('source retirement during final session creation cannot publish an event or cache the old completed worker result',async()=>{
 const f=fixture();let ids=0;const observer=new TechnicalAlertObserver(()=>{ids++;f.replace();return'SYNTHETIC-session-'+ids;},()=>Promise.resolve());
 try{
  const view=await observer.observe(f.input(),1700001000);expect(ids).toBe(1);expect(view.cancelled).toBe(true);expect(view.events).toEqual([]);expect(view.selectedEvent).toBeNull();
  const fresh=new TechnicalAlertObserver(()=> 'SYNTHETIC-fresh',()=>Promise.resolve()),next=await fresh.observe(f.input(),1700001001);
  expect(next.cancelled).toBe(false);expect(next.selectedEvent?.value).toBe(17.5);expect(f.workers()).toBe(2);
 }finally{f.dispose();}
});

it('an old publication rollback cannot restore its source cache after a newer source observation was accepted',async()=>{
 const f=fixture();let sequence=0;const observer=new TechnicalAlertObserver(()=> 'SYNTHETIC-session-'+(++sequence),()=>Promise.resolve());
 try{
  const old=await observer.observeForPublication(f.input(),1700001000);expect(old.view.selectedEvent?.value).toBe(17.5);
  f.replace();const next=await observer.observeForPublication(f.input(),1700001001);expect(next.view.cancelled).toBe(false);next.commit();
  expect(old.rollback()).toBe(false);expect(f.workers()).toBe(2);
  const reused=await observer.observe(f.input(),1700001002);expect(reused.cancelled).toBe(false);expect(reused.selectedEvent?.value).toBe(17.5);expect(f.workers()).toBe(2);
 }finally{f.dispose();}
});
