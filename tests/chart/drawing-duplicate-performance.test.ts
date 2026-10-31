import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {deepStrictEqual} from 'node:assert';
import {duplicateAdapterFixture} from './drawing-duplicate-adapter-harness';
import {annotationRecord} from './trendline-annotation-native-harness';
import {assertNativeDrawingMatchesCanonical} from '../../src/chart/drawing-canonical';

const profile=process.env.LV_DUPLICATE_PERF==='1';
const count=profile?Number(process.env.LV_DUPLICATE_PERF_COUNT):1;
if(![1,2,128].includes(count))throw Error('Duplicate performance count must be exactly1,2or128.');
const measuredInputs=[
 'src/chart/adapter.ts','src/chart/drawing-command-router.ts','src/chart/drawing-duplicate-publication.ts','src/chart/drawing-duplicate-native.ts',
 'src/chart/native-drawing-reset.ts','src/chart/native-drawing-reset-publication.ts','src/chart/contracts.ts','src/chart/drawing-canonical.ts',
 'src/chart/drawing-document-bindings.ts','src/chart/drawing-template-batch.ts','src/chart/drawing-id-reservations.ts','src/chart/drawing-publication.ts',
 'src/chart/trendline-annotation.ts','src/chart/trendline-annotation-data.ts','src/ui/workspace-history.ts','src/ui/workspace-json.ts',
 'tests/chart/drawing-duplicate-adapter-harness.ts','tests/chart/drawing-command-router-harness.ts','tests/chart/drawing-native-harness.ts',
 'tests/chart/trendline-annotation-native-harness.ts','tests/chart/drawing-duplicate-performance.test.ts',
 '.tmp/drawing-duplicate-performance.vitest.config.mjs','.tmp/run-drawing-duplicate-performance.mjs',
 'package.json','package-lock.json','tsconfig.json','vite.config.ts','node_modules/@luxalgo/vela/package.json',
 'node_modules/@luxalgo/vela/dist/index.js','node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js','node_modules/@luxalgo/vela/dist/chunk-ALTGHKIM.js',
];
const hashes=()=>Object.fromEntries(measuredInputs.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
const rawPath=profile?resolve(process.env.LV_DUPLICATE_PERF_RAW??''):undefined;
if(profile){const path=relative(resolve('reports'),rawPath!);if(!path||path.startsWith('..')||isAbsolute(path))throw Error('Duplicate profile raw path must stay in reports.');}
const raw:any={schemaVersion:1,synthetic:true,workload:{targetCount:count,initialNativeRows:count,initialCanonicalRows:count,expectedFinalRows:count*2,recordedSamples:1,warmups:0},status:'not-started',phase:'not-started',complete:false,functionalPassed:false,sourceStable:false,
 scope:'Actual current extracted adapter and original native facade/core/store/history/render/popup bodies; controlled in-memory workspace/DOM services. One cold command per child. No GUI, disk persistence, App/Grid assembly or statistical latency admission.',
 limitations:['Listed inputs supplement a complete source checkpoint; this manifest is not the entire transitive dependency graph.','Fixture setup/import time is reported separately; route time covers complete synchronous public Duplicate through ACK, selection and notification.','Verification and cleanup are outside route time and separately reported.','One sample per target count; no warmup or percentile claim.']};
const persist=()=>{if(rawPath){mkdirSync(dirname(rawPath),{recursive:true});writeFileSync(rawPath,JSON.stringify(raw,null,2)+'\n');}};
function heartbeat(){let maximum=0,samples=0,last=performance.now(),timer:ReturnType<typeof setTimeout>|undefined,active=true;const beat=()=>{if(!active)return;const time=performance.now();maximum=Math.max(maximum,Math.max(0,time-last-10));last=time;samples++;timer=setTimeout(beat,10);};timer=setTimeout(beat,10);return{stop(){active=false;if(timer!==undefined)clearTimeout(timer);return{intervalMs:10,maximumLatenessMs:maximum,samples};}};}

it(profile?`synthetic actual Duplicate cold profile ${count}`:'actual Duplicate public entry completes one synthetic copy with exact canonical/native/workspace state',async()=>{
 let f:Awaited<ReturnType<typeof duplicateAdapterFixture>>|undefined,clock:ReturnType<typeof heartbeat>|undefined;
 try{
  if(profile){raw.inputs=hashes();persist();}
  raw.status='running';raw.phase='setup';raw.startedAt=new Date().toISOString();persist();
  const started=performance.now(),base=annotationRecord(false),rows=Array.from({length:count},(_,index)=>({...structuredClone(base),id:`SYNTHETIC-duplicate-perf-${index}`,zIndex:index+1,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}},future:{missing:undefined,negativeZero:-0,index}}));
  f=await duplicateAdapterFixture(rows as any);f.controller.bindDrawingWorkspaceHost(f.host);raw.setupElapsedMs=performance.now()-started;
  const nativeHistory=f.f.native.controller.history.undoStack,priorWorkspace=f.workspace(),originalCanonical=structuredClone(f.f.document.all()),originalNative=structuredClone(f.f.native.controller.all());let observed:unknown;
  f.subscribe(()=>{observed=f!.controller.saveDrawings();});
  raw.phase='duplicate';persist();clock=heartbeat();const entry=performance.now();let receipt:any;
  try{receipt=f.controller.duplicateDrawings(rows.map(row=>row.id));}finally{raw.entrySyncMs=performance.now()-entry;await new Promise(resolve=>setTimeout(resolve,20));raw.heartbeat=clock.stop();clock=undefined;persist();}
  raw.receipt={ids:[...receipt.ids],nativeState:receipt.nativeState,canonicalAccepted:receipt.canonicalAccepted,workspaceAcknowledged:receipt.workspaceAcknowledged,observersComplete:receipt.observersComplete};
  raw.phase='verify';persist();const verification=performance.now(),canonical=f.f.document.all(),native=f.f.native.controller.all(),workspace=f.workspace();
  expect(receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});
  expect(receipt.ids).toHaveLength(count);expect(new Set(receipt.ids).size).toBe(count);expect(canonical).toHaveLength(count*2);expect(native).toHaveLength(count*2);
  deepStrictEqual(canonical.slice(0,count),originalCanonical);deepStrictEqual(native.slice(0,count),originalNative);
  deepStrictEqual(workspace.drawings,f.f.document.serialize());deepStrictEqual(observed,workspace.drawings);deepStrictEqual(f.savedDuringPublish(),workspace.drawings);
  const byId=new Map(native.map((row:any)=>[row.id,row]));
  for(let index=0;index<count;index++){
   const copy=canonical[count+index],expected={...rows[index],id:receipt.ids[index],zIndex:count+index+1};deepStrictEqual(copy,expected);
   assertNativeDrawingMatchesCanonical(copy as any,byId.get(receipt.ids[index]) as any);
   expect(Object.hasOwn((copy as any).future,'missing')).toBe(true);expect(Object.is((copy as any).future.negativeZero,-0)).toBe(true);
  }
  expect(f.history.status().undo).toBe(1);expect(f.f.native.controller.history.undoStack).toBe(nativeHistory);expect(f.state()).toMatchObject({notifications:1,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0,analysisUnavailable:'',selectedDrawingIds:receipt.ids});
  expect(f.history.undo(workspace,null)?.workspace).toBe(priorWorkspace);expect(f.history.redo(priorWorkspace,null)?.workspace).toBe(workspace);
  expect(f.f.document.undo()).toBe(true);deepStrictEqual(f.f.document.all(),rows);expect(f.f.document.undo()).toBe(false);expect(f.f.document.redo()).toBe(true);deepStrictEqual(f.f.document.serialize(),workspace.drawings);
  raw.verifyMs=performance.now()-verification;raw.observed={canonicalRows:canonical.length,nativeRows:native.length,workspaceRows:(workspace.drawings.drawings as unknown[]).length,copyIds:receipt.ids.length,notifications:f.state().notifications,reconciliations:f.state().reconciliations,quarantined:f.state().analysisUnavailable!==''};
  raw.functionalPassed=true;raw.phase='cleanup';persist();const cleanup=performance.now();f.dispose();f=undefined;raw.cleanupMs=performance.now()-cleanup;
  if(profile){raw.endInputs=hashes();raw.sourceStable=JSON.stringify(raw.inputs)===JSON.stringify(raw.endInputs);}else raw.sourceStable=true;
  raw.gates={functional:raw.functionalPassed,sourceStable:raw.sourceStable,heartbeatObserved:raw.heartbeat.samples>0,entry50ms:raw.entrySyncMs<=50,heartbeat50ms:raw.heartbeat.samples>0&&raw.heartbeat.maximumLatenessMs<=50};raw.responsive50ms=Object.values(raw.gates).every(Boolean);raw.status='complete';raw.phase='complete';raw.complete=true;persist();
 }catch(error){raw.status='failed';raw.error=error instanceof Error?error.message:'Details unavailable';persist();throw error;}
 finally{if(clock)raw.heartbeat=clock.stop();if(f){const cleanup=performance.now();try{f.dispose();}catch(error){raw.cleanupError=error instanceof Error?error.message:'Details unavailable';raw.functionalPassed=false;raw.status='failed';throw error;}finally{raw.cleanupMs=performance.now()-cleanup;}}if(profile){raw.endInputs=hashes();raw.sourceStable=JSON.stringify(raw.inputs)===JSON.stringify(raw.endInputs);if(raw.gates){raw.gates.sourceStable=raw.sourceStable;raw.responsive50ms=raw.functionalPassed&&Object.values(raw.gates).every(Boolean);}raw.finishedAt=new Date().toISOString();persist();}}
},profile?180000:30000);
