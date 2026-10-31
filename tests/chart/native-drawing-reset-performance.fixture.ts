import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cpus,platform,release,arch,totalmem} from 'node:os';
import {performance} from 'node:perf_hooks';
import {annotationRecord} from './trendline-annotation-native-harness';
import {nativeResetHarness} from './native-drawing-reset-harness';

// Explicitly invoked fixture, excluded from the ordinary **/*.test.ts suite.
// This records the immutable2315 implementation before receipt/readback changes.
const BASELINE='88eca68ffdd364010c2bd2ce409c24467ddb22596fcb1453cb9d2121cc12800c';
const OUTPUT='reports/native-drawing-reset-baseline-performance-2315.json';
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const TARGET_MS=50;
async function timed(action:()=>void){
 const started=performance.now();let timerDelayMs=0;
 const timer=new Promise<void>(resolve=>setTimeout(()=>{timerDelayMs=performance.now()-started;resolve();},0));
 action();const synchronousMs=performance.now()-started;await timer;
 return{synchronousMs,timerDelayMs,synchronousTargetMet:synchronousMs<=TARGET_MS,timerTargetMet:timerDelayMs<=TARGET_MS};
}
it('records captured2315 actual native Reset timings before outcome/readback extension',async()=>{
 expect(hash('src/chart/native-drawing-reset.ts')).toBe(BASELINE);
 const sources=Object.fromEntries(['src/chart/native-drawing-reset.ts','src/chart/trendline-annotation.ts','src/chart/contracts.ts','tests/chart/native-drawing-reset-harness.ts','tests/chart/native-drawing-reset-performance.fixture.ts'].map(file=>[file,hash(file)]));
 const report:any={schemaVersion:1,observedAt:new Date().toISOString(),baselineCheckpoint:2315,baselineHelperSha256:BASELINE,sources,machine:{platform:platform(),release:release(),arch:arch(),cpu:cpus()[0]?.model,logicalProcessors:cpus().length,totalMemoryMiB:totalmem()/1024/1024,node:process.version},targetMs:TARGET_MS,method:'One actual one-target warmup; three fresh-fixture samples per case. Synthetic rows and native controller/store/renderer setup are outside timing. Opening and synchronous native Reset callback are measured separately, with a zero-delay timer scheduled before each. No forced GC. Retained rows are opaque unsupported canonical records, not additional native models. The immutable2315 fixture host stages and reconciles under separate notification holds; no adapter/mounted GUI claim.',command:'npm.cmd test -- --config .tmp/native-reset-performance.vitest.config.mjs --maxWorkers=1 --reporter=json --outputFile=reports/native-drawing-reset-baseline-performance-2315-tests.json',cases:[],complete:false,targetsMet:false,violations:[],limitations:['Actual installed native callback/core/store/painter bodies execute with controlled popup/DOM/canvas command sinks.','Timer delay includes synchronous occupancy and Windows scheduling; this is not mounted GUI FPS or input latency.','Resource quotas and exact state assertions are correctness checks; timing violations are reported explicitly, not hidden by relaxing 50ms.','No upstream patch, credentials, diagnostic images or native desktop automation.']};
 const save=()=>writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');save();
 const warm=await nativeResetHarness([annotationRecord(false)]);try{warm.open().actions.resetSettings();}finally{warm.dispose();}
 for(const retainedRows of [0,512])for(const targets of [1,2,128]){
  const row={targets,retainedRows,samples:[] as any[]};report.cases.push(row);save();
  for(let sample=0;sample<3;sample++){
   const rows=Array.from({length:targets},(_,index)=>({...annotationRecord(index%2===0),id:'SYNTHETIC timing target '+index})),fixture=await nativeResetHarness(rows);
   const opaque=Array.from({length:retainedRows},(_,index)=>({id:'SYNTHETIC retained opaque '+index,type:'SYNTHETIC future unsupported tool',opaque:{label:'SYNTHETIC retained metadata',sequence:index,items:[1,null,'SYNTHETIC']}}));
   try{
    if(opaque.length)fixture.document.load({version:1,drawings:[...rows,...opaque]});
    let opening:any;const open=await timed(()=>{opening=fixture.open();});
    fixture.paint.top.commands.length=0;const reset=await timed(()=>opening.actions.resetSettings());
    const canonical=fixture.document.all();expect(canonical.slice(targets)).toEqual(opaque);expect(canonical.slice(0,targets).map(value=>Object.hasOwn(value,'text'))).toEqual(rows.map(()=>false));expect(fixture.core.controller.all().map((value:any)=>value.text)).toEqual(rows.map(()=>undefined));
    const memory=process.memoryUsage();row.samples.push({sample:sample+1,open,reset,heapMiB:memory.heapUsed/1024/1024,rssMiB:memory.rss/1024/1024});
    for(const [operation,value]of Object.entries({open,reset}))if(!value.synchronousTargetMet||!value.timerTargetMet)report.violations.push({targets,retainedRows,sample:sample+1,operation,synchronousMs:value.synchronousMs,timerDelayMs:value.timerDelayMs});save();
   }finally{fixture.dispose();}
  }
 }
 report.complete=true;report.targetsMet=report.violations.length===0;report.finishedAt=new Date().toISOString();save();
},180000);
