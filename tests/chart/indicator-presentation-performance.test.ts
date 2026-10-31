import {expect,it} from 'vitest';
import {cpus,platform,release,arch,totalmem} from 'node:os';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {assertIndicatorBatchBudget,defaultIndicatorPresentation,indicatorDefaults,INDICATOR_OUTPUT_LIMIT,type IndicatorInstanceSettings} from '../../src/chart/indicator-settings';
import type {Bar} from '../../src/domain/types';

// Informational predefined latency/memory targets; quota/integrity failures are test failures.
// Real DOM, canvas painting, concurrently mounted charts, GPU and GUI FPS are unmeasured.
const TARGETS={normalElapsedMs:500,nearElapsedMs:1000,chartTimerDelayMs:50,heapGrowthMiB:256};
const kinds:IndicatorId[]=['volume','sma','ema','rsi','macd','bb','vwap','stochastic','atr','obv'];
const fixture=(count:number):Bar[]=>Array.from({length:count},(_,index)=>{const close=100+index%31/4;return{time:1700000000+index*60,open:close-.25,high:close+.5,low:close-.5,close,volume:100+index%19};});
const settings=(kind:IndicatorId,id:string):IndicatorInstanceSettings=>({id,kind,inputs:{...indicatorDefaults[kind],...(['sma','ema','rsi','obv'].includes(kind)?{smoothingType:'SMA+BB',smoothingLength:14,smoothingMultiplier:2}:{})},plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation(kind)});
const MiB=1024*1024;
function memory(){const value=process.memoryUsage();return{heapMiB:value.heapUsed/MiB,rssMiB:value.rss/MiB,externalMiB:value.external/MiB};}
function runChart(rows:readonly IndicatorInstanceSettings[],bars:readonly Bar[]){
 const budget=assertIndicatorBatchBudget(rows,bars.length),outputs=[];let slots=0,checksum=0;
 for(const row of rows){const result=calculateIndicator(row.kind,bars,row.inputs),native=renderIndicatorPresentation(row,result,bars);expect(result.diagnostics).toEqual([]);
  slots+=result.series.reduce((sum,plot)=>sum+plot.values.length,0)+native.output.series!.reduce((sum,plot)=>sum+('points' in plot?plot.points.length*2:0),0)+native.output.priceLines!.length;
  checksum+=result.series.reduce((sum,plot)=>sum+(plot.values.at(-1)??0),0);outputs.push({result,output:native.output});
 }
 expect(slots).toBeLessThanOrEqual(budget.numericSlots);return{slots,checksum,budget,outputs};
}
async function sampledChart(rows:readonly IndicatorInstanceSettings[],bars:readonly Bar[]){
 const started=performance.now();let timerDelayMs=0;const timer=new Promise<void>(resolve=>setTimeout(()=>{timerDelayMs=performance.now()-started;resolve();},0));
 const result=runChart(rows,bars),after=memory(),computeMs=performance.now()-started;await timer;return{result,after,computeMs,timerDelayMs};
}
it('records bounded synthetic calculation/native-descriptor workloads with machine, thresholds and explicit violations',async()=>{
 const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8')),hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
 // One small warmup per kernel, disclosed below; no full-history near-ceiling warmup.
 for(const kind of kinds)runChart([settings(kind,'warmup-'+kind)],fixture(20));
 const normalBars=fixture(500),normalRows=kinds.map(kind=>settings(kind,'normal-'+kind)),normalBefore=memory(),normalStart=performance.now();let maxTimer=0,peakHeap=normalBefore.heapMiB,peakRss=normalBefore.rssMiB,checksum=0,chartSlots=0;
 for(let chart=0;chart<16;chart++){const sample=await sampledChart(normalRows.map(row=>({...row,id:row.id+'-'+chart})),normalBars);checksum+=sample.result.checksum;chartSlots=sample.result.slots;maxTimer=Math.max(maxTimer,sample.timerDelayMs);peakHeap=Math.max(peakHeap,sample.after.heapMiB);peakRss=Math.max(peakRss,sample.after.rssMiB);}
 const normalElapsed=performance.now()-normalStart;
 const nearSettings=settings('rsi','near-ceiling');nearSettings.inputs.smoothingLength=1;
 // Preserve the exact slot boundary with a distinct admitted work configuration. The old14-period workload now exceeds20m.
 const nearRows=[{...nearSettings,offset:1}],count=99999,nearBudget=assertIndicatorBatchBudget(nearRows,count);expect(nearBudget.numericSlots).toBe(1999999);
 let reads=0;const inaccessible=new Proxy(new Array(count),{get(target,key){if(key==='length')return target.length;reads++;throw Error('Quota rejection must precede data reads');}}) as Bar[];
 expect(()=>renderIndicatorPresentation({...nearRows[0],offset:2},{id:'rsi',series:[],diagnostics:[],policies:[]},inaccessible)).toThrow(/batch exceeds/);expect(reads).toBe(0);
 const nearBars=fixture(count),nearBefore=memory(),nearStart=performance.now(),near=await sampledChart(nearRows,nearBars),nearElapsed=performance.now()-nearStart;
 expect(near.result.slots).toBe(nearBudget.numericSlots);expect(Number.isFinite(checksum+near.result.checksum)).toBe(true);
 const normal={charts:16,studiesPerChart:10,bars:500,slotsPerChart:chartSlots,elapsedMs:normalElapsed,maxChartTimerDelayMs:maxTimer,heapGrowthMiB:Math.max(0,peakHeap-normalBefore.heapMiB),peakHeapMiB:peakHeap,peakRssMiB:peakRss,checksum};
 const nearRecord={charts:1,studiesPerChart:1,bars:count,smoothingLength:1,offset:1,slots:near.result.slots,cap:INDICATOR_OUTPUT_LIMIT,elapsedMs:nearElapsed,computeMs:near.computeMs,timerDelayMs:near.timerDelayMs,heapGrowthMiB:Math.max(0,near.after.heapMiB-nearBefore.heapMiB),after:near.after,checksum:near.result.checksum,budget:nearBudget};
 const violations:string[]=[];
 if(normal.elapsedMs>TARGETS.normalElapsedMs)violations.push('normal elapsed exceeds500ms');if(nearRecord.elapsedMs>TARGETS.nearElapsedMs)violations.push('near-ceiling elapsed exceeds1000ms');
 if(normal.maxChartTimerDelayMs>TARGETS.chartTimerDelayMs)violations.push('normal chart timer delay exceeds50ms');if(nearRecord.timerDelayMs>TARGETS.chartTimerDelayMs)violations.push('near-ceiling chart timer delay exceeds50ms');
 if(normal.heapGrowthMiB>TARGETS.heapGrowthMiB)violations.push('normal sampled heap growth exceeds256MiB');if(nearRecord.heapGrowthMiB>TARGETS.heapGrowthMiB)violations.push('near-ceiling sampled heap growth exceeds256MiB');
 const report={schemaVersion:1,observedAt:new Date().toISOString(),machine:{platform:platform(),release:release(),arch:arch(),cpu:cpus()[0]?.model,logicalProcessors:cpus().length,totalMemoryMiB:totalmem()/MiB,node:process.version,versions:pkg.devDependencies??{}},method:'Node/domain + native-descriptor construction. Simulated charts sequentially, retain all ten studies until each chart sample; yield to timers between charts. One20bar warmup per kernel. Fixtures generated before measurement. Peak memory sampled after each chart; GC not forced.',command:'npm.cmd exec --cache .cache/npm -- vitest run tests/chart/indicator-presentation-performance.test.ts',targets:TARGETS,normal,nearCeiling:nearRecord,violations,targetsMet:violations.length===0,quotaPreflight:{overCapSlots:2000015,barReads:reads,rejected:true},sources:Object.fromEntries(['src/chart/indicator-port.ts','src/chart/indicator-presentation.ts','src/chart/indicator-rendering.ts','src/chart/indicator-settings.ts','src/domain/indicators.ts','tests/chart/indicator-presentation-performance.test.ts'].map(path=>[path,hash(path)])),limitations:['Informational performance targets are recorded, not hidden or relaxed. Quota/data-integrity assertions are the test gate.','No actual rendering, real browser frame, concurrently mounted charts, packaged GUI or reference comparison.','Timer delay measures synchronous event-loop occupancy plus scheduling, not interaction or FPS. Memory is sampled process usage, not an allocation profiler.','No credentials/provider data: all input bars are synthetic.']};
 mkdirSync('reports',{recursive:true});writeFileSync('reports/indicator-presentation-performance-finite-range.json',JSON.stringify({...report,workloadMigration:'RSI smoothingLength1 near-slot boundary replaces the now-work-refused14-period configuration; distinct workload, no repair claim for prior measured latency.'},null,2)+'\n');
 console.info(JSON.stringify({normalElapsedMs:normal.elapsedMs,nearElapsedMs:nearRecord.elapsedMs,nearTimerDelayMs:nearRecord.timerDelayMs,violations}));
},30000);
