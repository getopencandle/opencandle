import {afterEach,expect,it} from 'vitest';
import {calculateIndicator,VWAP_EXCHANGE_ZONE} from '../../src/domain/indicators';
import {captureIndicatorAlertSource,evaluateTechnicalAlertSources,technicalSourceKey} from '../../src/domain/technical-alerts';
import {alertChartFacts} from '../../src/domain/indicator-alertability';
import {alertDatasetKey} from '../../src/domain/alert-observation';
import {createBackgroundVwapEvaluator} from '../../src/domain/vwap-background-kernel';
import {createTechnicalVwapEvaluator} from '../../src/ui/vwap-alert-evaluator';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createOwnedVwapPrefixSource,type VwapPrefixBasis} from '../../src/chart/vwap-prefix-source';
import {createVwapClient} from '../../src/vwap/client';
import {effectiveVwapSettings} from '../../src/vwap/settings';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import type {VwapClient,VwapResultLease,VwapWorkerPort} from '../../src/vwap/types';
import type {ChartController} from '../../src/chart/adapter';
import type {Bar} from '../../src/domain/types';

// SYNTHETIC US equity 30m bars with extended hours. 2024-01-02 09:30, 15:30, 16:30 (after hours) and 19:30 New York
// (00:30 UTC on Jan 3), then 2024-01-03 09:30 and 10:00. An 'Exchange' VWAP keeps the 19:30 bar in the Jan 2 session.
const day=Date.UTC(2024,0,2)/1000,H=3600;
const times=[day+14.5*H,day+20.5*H,day+21.5*H,day+24.5*H,day+38.5*H,day+39*H];
const closes=[10,12,14,16,20,22],volumes=[1,3,2,2,1,1];
const bars:Bar[]=times.map((time,i)=>({time,open:closes[i],high:closes[i],low:closes[i],close:closes[i],volume:volumes[i]}));
// Hand values: session Jan 2 = bars 0-3 (cumulative), Jan 3 = bars 4-5.
const expected=[10,(10+36)/4,(10+36+28)/6,(10+36+28+32)/8,20,21];

class WorkerPort implements VwapWorkerPort{
 listeners=new Map<string,Set<(event:any)=>void>>();
 constructor(){queueMicrotask(()=>this.emit({v:1,type:'ready'}));}
 addEventListener(type:string,fn:(event:any)=>void){const list=this.listeners.get(type)??new Set();list.add(fn);this.listeners.set(type,list);}
 removeEventListener(type:string,fn:(event:any)=>void){this.listeners.get(type)?.delete(fn);}
 postMessage(message:unknown,transfer:Transferable[]){const copy=structuredClone(message,{transfer});queueMicrotask(()=>{try{this.emit(calculateVwapWorkerMessage(copy));}catch(error){this.emit({v:1,type:'error',code:'VWAP_TEST',message:String(error)});}});}
 terminate(){}
 emit(data:unknown){for(const fn of this.listeners.get('message')??[])fn({data});}
}
const clients:VwapClient[]=[];afterEach(()=>{for(const client of clients.splice(0))client.dispose();});
const client=()=>{const value=createVwapClient({factory:()=>new WorkerPort()});clients.push(value);return value;};
const read=(lease:VwapResultLease)=>{try{return lease.readChunk('vwap',0,lease.rows);}finally{lease.release();}};
const near=(got:readonly (number|null)[],want:readonly number[])=>{expect(got.length).toBe(want.length);want.forEach((value,i)=>expect(got[i] as number,'bar '+i).toBeCloseTo(value,12));};

it("an 'Exchange' VWAP gives the same values on the kernel 1 chart, the kernel 2 chart, the background kernel and the alert evaluators",async()=>{
 const dataset=fixtureDataset('GME',2);dataset.instrument={...dataset.instrument,assetClass:'stock',timezone:'America/New_York'};dataset.resolution='30m';dataset.bars=bars;
 const facts=alertChartFacts(dataset);expect(facts).toMatchObject({calendar:'us-equity',exchangeZone:'America/New_York'});
 const kernel1={anchor:'Session',timezone:VWAP_EXCHANGE_ZONE,source:'close'},kernel2={...kernel1,kernelVersion:2};
 // Kernel 1 chart (the port passes exchangeZone and calendar in its chart facts).
 near(calculateIndicator('vwap',bars,kernel1,{exchangeZone:facts.exchangeZone,calendar:facts.calendar}).series[0].values,expected);
 // Kernel 2 chart: indicator-port resolves the zone from its presentation context before the worker request.
 const settings=effectiveVwapSettings(kernel2,'standard',{exchangeZone:facts.exchangeZone,calendar:facts.calendar});expect(settings.timezone).toBe('America/New_York');
 const pack=new Float64Array(bars.flatMap(row=>[row.time,row.open,row.high,row.low,row.close,row.volume])).buffer;
 near(read(await client().request({rows:bars.length,settings,prepare:()=>pack},{token:{},signal:new AbortController().signal,assertCurrent:()=>{}}).result),expected);
 // Alerts: kernel 1 sources compute in technical-alerts with the observed facts; kernel 2 sources go to the background kernel
 // and to the chart's alert evaluator with the alert's facts on the request.
 const sourceBasis=alertDatasetKey(dataset,2),sourceRevision=dataset.provenance.revision;
 const background=createBackgroundVwapEvaluator({bars,sourceBasis,sourceRevision,isCurrent:()=>true,client});
 let basis:VwapPrefixBasis={epoch:{},source:{},bars:structuredClone(bars),style:'candles',executionIdentity:'ordinary',disposed:false};const prefix=createOwnedVwapPrefixSource({readBasis:()=>basis});
 const chart={getStyle:()=>basis.style,getExecutionIdentity:()=>'ordinary',isInputCurrent:(input:any)=>input.bars===bars,captureVwapPrefix:()=>prefix.capture()} as unknown as ChartController;
 const evaluator=createTechnicalVwapEvaluator({chart,dataset,bars,executionIdentity:'ordinary',isCurrent:()=>true,client});
 for(const evaluateVwap of [background.evaluate,evaluator.evaluate]){
  for(let count=1;count<=bars.length;count++){
   const slice=bars.slice(0,count),captured=[kernel1,kernel2].map(inputs=>captureIndicatorAlertSource({id:'owned',kind:'vwap',inputs,plots:{},offset:0,visible:true},'vwap','standard','snapshot'));
   const batch=await evaluateTechnicalAlertSources(slice,captured,'USD',{...facts,sourceBasis,sourceRevision,evaluateVwap,yieldControl:()=>Promise.resolve()});
   for(const source of captured)expect(batch.results.get(technicalSourceKey(source))!.sample.value as number,`bar ${count-1} kernel ${source.kind==='indicator'?source.inputs.kernelVersion??1:'?'}`).toBeCloseTo(expected[count-1],12);
  }
 }
 // The chart's alert evaluator also resolves a request without facts from its own dataset.
 near(read(await evaluator.evaluate({inputs:kernel2,transform:'standard',prefix:bars,sourceBasis,sourceRevision,signal:new AbortController().signal,cancelled:()=>false})),expected);
 // A saved 'UTC' VWAP keeps the UTC reset (bar 3 starts a new session), so the zones really differ on this data.
 expect(calculateIndicator('vwap',bars,{...kernel1,timezone:'UTC'},{exchangeZone:facts.exchangeZone,calendar:facts.calendar}).series[0].values[3]).toBe(16);
 basis={...basis};
});
