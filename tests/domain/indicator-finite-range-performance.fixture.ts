import {expect,it} from 'vitest';
import {performance} from 'node:perf_hooks';
import {cpus,platform,release,arch} from 'node:os';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sma} from '../../src/domain/indicators';

const paths=['src/domain/indicators.ts','src/domain/vwap-percentage.ts','tests/domain/indicator-finite-range-performance.fixture.ts','.tmp/indicator-finite-range-performance.vitest.config.mjs','package.json','package-lock.json'];
const inputs=()=>Object.fromEntries(paths.map(path=>{const bytes=readFileSync(path);return[path,{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}];}));
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

it('records ordinary and exact-fallback100k SMA arithmetic, complete output checks and actual timer delay',async()=>{
 const sources=inputs(),count=100000,maximum=Number.MAX_VALUE,minimum=Number.MIN_VALUE;
 const ordinary=Array.from({length:count},(_,index)=>100+(index%31)/4);
 const ordinaryExpected=ordinary.map((_,index)=>{
  if(index<19)return null;
  // The quarter-unit numerator is an exact small integer, independent of floating accumulation.
  let integer=0;for(let at=index-19;at<=index;at++)integer+=400+at%31;
  return integer/80;
 });
 const pattern=[maximum,maximum,-maximum,-maximum,minimum,minimum];
 const extreme=Array.from({length:count},(_,index)=>pattern[index%6]);
 const extremeExpected=extreme.map((_,index)=>index===0?null:[maximum/2,maximum,0,-maximum,-maximum/2,minimum][index%6]);
 const cases=[
  {id:'synthetic-quarter-prices-period20',values:ordinary,period:20,expected:ordinaryExpected,oracle:'Exact quarter-unit integer window sum divided by80; all100k outputs checked.'},
  {id:'synthetic-full-exponent-period2',values:extreme,period:2,expected:extremeExpected,oracle:'Repeated MAX,MAX,-MAX,-MAX,MIN,MIN; pair means are MAX,+0,-MAX,-MAX/2,MIN,MAX/2 with nearest-even rounding.'},
  {id:'synthetic-max-window-period100000',values:Array<number>(count).fill(maximum),period:count,expected:[...Array<null>(count-1).fill(null),maximum],oracle:'A full window of identical finite MAX has exact mean MAX; all preceding outputs unavailable.'},
 ];
 const samples:Array<Record<string,unknown>>=[];
 for(const row of cases){
  sma(row.values.slice(0,20),row.period); // One disclosed20-row warmup, not a full workload warmup.
  for(let iteration=0;iteration<3;iteration++){
   let previous=performance.now(),maximumHeartbeatMs=0,ticks=0;
   const heartbeat=setInterval(()=>{const now=performance.now();maximumHeartbeatMs=Math.max(maximumHeartbeatMs,now-previous);previous=now;ticks++;},10);
   let output:(number|null)[]=[],computeMs=0,totalMs=0,zeroTimerDelayMs=0;
   try{
    await delay(20);
    const started=performance.now();
    const timer=new Promise<void>(resolve=>setTimeout(()=>{zeroTimerDelayMs=performance.now()-started;resolve();},0));
    output=sma(row.values,row.period);computeMs=performance.now()-started;
    await timer;totalMs=performance.now()-started;
    await delay(20);
   }finally{clearInterval(heartbeat);}
   const mismatch=output.length!==count?-2:output.findIndex((value,index)=>!Object.is(value,row.expected[index]));
   samples.push({case:row.id,iteration,rows:count,period:row.period,computeMs,totalMs,zeroTimerDelayMs,maximumHeartbeatMs,heartbeatTicks:ticks,numericalComplete:mismatch===-1,firstMismatch:mismatch,oracle:row.oracle,latency50msPass:totalMs<=50&&zeroTimerDelayMs<=50&&maximumHeartbeatMs<=50});
  }
 }
 const after=inputs(),sourceStable=JSON.stringify(after)===JSON.stringify(sources);
 const report={schemaVersion:1,observedAt:new Date().toISOString(),synthetic:true,environment:{node:process.version,platform:platform(),release:release(),arch:arch(),cpu:cpus()[0]?.model,logicalProcessors:cpus().length},method:'Serial Node direct-helper calls; fixture/oracle creation, output verification and source hashing excluded from timed action. One20-row warmup per case, three full runs.10ms heartbeat warmed20ms before and drained20ms after each action; zero-delay timer scheduled immediately before synchronous SMA. totalMs ends after that timer. No forcedGC. Performance failures remain report data, numerical/cleanup/source gates are assertions.',targets:{totalMs:50,zeroTimerDelayMs:50,maximumHeartbeatMs:50},sources,sourceStable,samples,numericalComplete:samples.every(row=>row.numericalComplete===true),timersCleaned:true,latencyTargetsMet:samples.every(row=>row.latency50msPass===true),limitations:['Direct synchronous kernel only; no browser/native renderer/GUI latency claim.','This is an operation-estimate audit, not proof that64 estimate units bound machine time.','Timing cannot attribute GC or scheduler delay without a separate profiler.','Full finite-window arithmetic fallback is exact only where invoked; ordinary compensated fast-path rounding remains explicitly different from a once-rounded rational guarantee.']};
 writeFileSync('reports/indicator-finite-range-performance-first.json',JSON.stringify(report,null,2)+'\n');
 expect(sourceStable).toBe(true);expect(report.numericalComplete).toBe(true);expect(samples.every(row=>(row.heartbeatTicks as number)>0)).toBe(true);
},30000);
