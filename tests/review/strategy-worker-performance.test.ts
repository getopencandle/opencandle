import {afterAll,beforeAll,expect,it} from 'vitest';
import {Worker as NodeWorker} from 'node:worker_threads';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'vite';
import {createStrategyReportClient,type ReportWorkerPort} from '../../src/strategy-report/client';
import {DEFAULT_STRATEGY_CONFIG} from '../../src/domain/strategy';
import type {StrategyReportJobInput} from '../../src/strategy-report/types';

// Actual production worker entry on a Node worker, never Electron GUI evidence.
// Flat100 prices give an independent zero-profit/no-drawdown numerical oracle.
let workerUrl:URL;
const workers:NodeWorker[]=[],measurements:Record<string,unknown>[]=[];
beforeAll(async()=>{
 const result=await build({configFile:false,logLevel:'silent',build:{write:false,minify:true,lib:{entry:resolve('src/strategy-report/worker.ts'),formats:['es'],fileName:'report-review-worker'}}});
 const chunks=(Array.isArray(result)?result:[result]).flatMap(row=>'output' in row?row.output:[]).filter(row=>row.type==='chunk');expect(chunks).toHaveLength(1);
 const module='data:text/javascript;base64,'+Buffer.from(chunks[0].code).toString('base64');
 const bridge=`import {parentPort} from 'node:worker_threads';globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);globalThis.addEventListener=(type,listener)=>{if(type==='message')parentPort.on('message',data=>listener({data}));};await import(${JSON.stringify(module)});`;
 workerUrl=new URL('data:text/javascript;base64,'+Buffer.from(bridge).toString('base64'));
},30000);
afterAll(async()=>{await Promise.all(workers.map(worker=>worker.terminate()));mkdirSync('reports',{recursive:true});writeFileSync('reports/performance-strategy-worker.json',JSON.stringify({observedAt:new Date().toISOString(),host:process.version,kind:'Minified production entry on actual Node worker; no native GUI',limitations:['Event-loop delay is observed timer lateness, not browser frame latency.','Phase elapsed values include message dispatch; they are not isolated CPU timings.','Heap deltas are main test-thread retained heap, not process peak.','No external workers or application windows are measured.'],measurements},null,2)+'\n');});
function factory():ReportWorkerPort{
 const worker=new NodeWorker(workerUrl);workers.push(worker);const listeners=new Map<string,Map<(event:any)=>void,(event:any)=>void>>();
 return{postMessage:message=>worker.postMessage(message),terminate:()=>{void worker.terminate();},addEventListener(type,listener){const wrapper=type==='message'?(data:unknown)=>listener({data}):listener;if(!listeners.has(type))listeners.set(type,new Map());listeners.get(type)!.set(listener,wrapper);worker.on(type,wrapper);},removeEventListener(type,listener){const wrapper=listeners.get(type)?.get(listener);if(wrapper)worker.off(type,wrapper);listeners.get(type)?.delete(listener);}};
}
for(const [rows,closedTrades] of [[5000,1000],[50000,10000],[200000,0]] as const){
 it('measures real-worker responsiveness for '+rows+' rows and '+closedTrades+' closed trades',async()=>{
  const bars=Array.from({length:rows},(_,index)=>({time:1000+index*60,open:100,high:100,low:100,close:100,volume:1})),barIds=bars.map((_,index)=>'synthetic-worker-review:'+index),proposals:Record<string,unknown>[]=[];
  for(let trade=0;trade<closedTrades;trade++)for(let leg=0;leg<2;leg++){const index=trade*5+leg;proposals.push({sequence:proposals.length+1,side:leg?'sell':'buy',quantity:1,event:{id:barIds[index],time:bars[index].time,revision:1},virtual:true});}
  const input:StrategyReportJobInput={execution:{bars,barIds,proposals,chartType:'standard',context:{executionId:'synthetic-performance:'+rows,sourceLabel:'Synthetic constant100 independent worker workload',currency:'USD',timezone:'UTC'}},config:{...DEFAULT_STRATEGY_CONFIG,initialCapital:1000000,commission:{kind:'fixed',value:0}}};
  const client=createStrategyReportClient({factory}),abort=new AbortController(),phaseTimes:Record<string,number>={};let beats=0,maxTimerLatenessMs=0,last=performance.now();
  const timer=setInterval(()=>{const now=performance.now();maxTimerLatenessMs=Math.max(maxTimerLatenessMs,now-last-5);last=now;beats++;},5),heapBefore=process.memoryUsage().heapUsed,started=performance.now();
  try{
   const pending=client.start(input,{signal:abort.signal,assertCurrent(){}},progress=>{phaseTimes[progress.phase]??=performance.now()-started;});
   const synchronousStartMs=performance.now()-started,handle=await pending,totalMs=performance.now()-started;
   expect(handle.summary.counts).toMatchObject({bars:rows,trades:closedTrades});expect(handle.summary.metrics.all.finalEquity.value).toBe(1000000);expect(handle.summary.metrics.all.closedNet.value).toBe(0);expect(handle.summary.drawdown.amount).toBe(0);
   const queryStart=performance.now(),plot=await handle.plot({series:'equity',percent:false,benchmark:false,favorable:false,adverse:false}),queryMs=performance.now()-queryStart;
   expect(plot.count).toBe(rows);expect(plot.values.length).toBeLessThanOrEqual(2000);expect(plot.values.every(point=>point.value===1000000)).toBe(true);expect((await handle.inspect(rows-1)).point.equity).toBe(1000000);expect(beats).toBeGreaterThan(1);
   measurements.push({rows,closedTrades,synchronousStartMs,totalMs,phaseTimes,queryMs,maxTimerLatenessMs,beats,mainHeapDeltaBytes:process.memoryUsage().heapUsed-heapBefore,interactionTargetMs:50,observedTimerTargetPassed:maxTimerLatenessMs<50,reportWork:handle.summary.work});
   // Responsiveness target is recorded separately; this generous watchdog is
   // only a bounded transport/computation ceiling, never a fast-UI claim.
   expect(totalMs).toBeLessThan(60000);
  }finally{clearInterval(timer);client.dispose();}
 },90000);
}
