import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {cpus,platform,release} from 'node:os';
import {annotationRecord} from './trendline-annotation-native-harness';
import {nativeResetHarness} from './native-drawing-reset-harness';

// Explicit performance fixture; ordinary correctness suite excludes *.fixture.ts.
const OUTPUT='reports/native-drawing-reset-receipts-performance-first.json',TARGET_MS=50;
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
async function timed(action:()=>void){const start=performance.now();let timerDelayMs=0;const timer=new Promise<void>(resolve=>setTimeout(()=>{timerDelayMs=performance.now()-start;resolve();},0));action();const synchronousMs=performance.now()-start;await timer;return{synchronousMs,timerDelayMs,targetMet:synchronousMs<=TARGET_MS&&timerDelayMs<=TARGET_MS};}
it('measures current complete-state receipt path at one and two targets',async()=>{
 const report:any={schemaVersion:1,observedAt:new Date().toISOString(),sources:Object.fromEntries(['src/chart/native-drawing-reset.ts','src/chart/contracts.ts','src/chart/trendline-annotation.ts','tests/chart/native-drawing-reset-harness.ts','tests/chart/native-drawing-reset-current-performance.fixture.ts'].map(path=>[path,hash(path)])),machine:{node:process.version,platform:platform(),release:release(),cpu:cpus()[0]?.model},targetMs:TARGET_MS,method:'One actual one-target warmup. Three fresh actual-native fixtures per target1/2 and opaque canonical retained0/512. Setup outside measurement; opening and complete Reset measured separately with scheduled zero-delay timers. Current helper full native readback and genuine epoch/acceptance receipts; no generic reconcile. No forced GC or mounted GUI claim.',cases:[],complete:false,targetsMet:false,limitations:['50ms failures remain explicit.','No128-target admission or performance inference.','Synthetic fixtures, actual native callback/core/store/painter bodies, controlled popup/DOM/canvas services.']};
 const save=()=>writeFileSync(OUTPUT,JSON.stringify(report,null,2)+'\n');save();
 const warm=await nativeResetHarness([annotationRecord(false)]);try{warm.open().actions.resetSettings();}finally{warm.dispose();}
 for(const retained of [0,512])for(const targets of [1,2]){const record={targets,retained,samples:[] as any[]};report.cases.push(record);
  for(let sample=0;sample<3;sample++){const rows=Array.from({length:targets},(_,index)=>({...annotationRecord(index%2===0),id:'SYNTHETIC current timing '+index})),fixture=await nativeResetHarness(rows),opaque=Array.from({length:retained},(_,index)=>({id:'SYNTHETIC retained '+index,type:'SYNTHETIC unsupported tool',opaque:{label:'SYNTHETIC retained metadata',sequence:index,items:[1,null,'SYNTHETIC']}}));
   try{if(opaque.length)fixture.document.load({version:1,drawings:[...rows,...opaque]});let opening:any;const open=await timed(()=>{opening=fixture.open();});fixture.paint.top.commands.length=0;const reset=await timed(()=>opening.actions.resetSettings());expect(fixture.document.all().slice(targets)).toEqual(opaque);expect(fixture.core.controller.all().map((row:any)=>row.text)).toEqual(rows.map(()=>undefined));record.samples.push({sample:sample+1,open,reset});save();}finally{fixture.dispose();}
  }
 }
 report.complete=true;report.targetsMet=report.cases.every((record:any)=>record.samples.every((sample:any)=>sample.open.targetMet&&sample.reset.targetMet));report.finishedAt=new Date().toISOString();save();
},90000);
