import {it,expect,vi} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {deepStrictEqual} from 'node:assert';

// Deliberately instrumented diagnostic, never the baseline benchmark. Original
// native serializers and their descriptor providers remain untouched.
const spans=vi.hoisted(()=>{
 const rows:Record<string,{calls:number;inclusiveMs:number;maximumMs:number}>={};let enabled=false;
 const invoke=(name:string,fn:Function,receiver:unknown,args:unknown[])=>{
  if(!enabled)return Reflect.apply(fn,receiver,args);
  const start=performance.now();try{return Reflect.apply(fn,receiver,args);}finally{const elapsed=performance.now()-start,row=rows[name]??={calls:0,inclusiveMs:0,maximumMs:0};row.calls++;row.inclusiveMs+=elapsed;row.maximumMs=Math.max(row.maximumMs,elapsed);}
 };
 const callback=(name:string,fn:Function,receiver?:unknown)=>function(this:unknown,...args:unknown[]){return invoke(name,fn,receiver??this,args);};
 const object=(name:string,value:any,nested:Record<string,string>={})=>{
  const fields=Object.getOwnPropertyDescriptors(value),copy=Object.create(Object.getPrototypeOf(value));
  for(const [key,field]of Object.entries(fields))if(Object.hasOwn(field,'value')&&typeof field.value==='function'){
   const original=field.value;field.value=function(...args:unknown[]){const result=invoke(name+'.'+key,original,value,args);return nested[key]&&result?object(nested[key],result):result;};
  }
  Object.defineProperties(copy,fields);return copy;
 };
 return{rows,invoke,callback,object,start(){for(const key of Object.keys(rows))delete rows[key];enabled=true;},stop(){enabled=false;}};
});

vi.mock('../../src/chart/drawing-template-batch',async original=>{
 const module=await original<any>();return{...module,captureNativeDrawingLease(...args:unknown[]){return spans.object('originalNativeLease',spans.invoke('originalNativeLease.capture',module.captureNativeDrawingLease,module,args));}};
});
vi.mock('../../src/chart/drawing-duplicate-native',async original=>{
 const module=await original<any>();return{...module,prepareNativeDrawingInsert(...args:unknown[]){return spans.object('nativeInsert',spans.invoke('nativeInsert.prepare',module.prepareNativeDrawingInsert,module,args),{captureAcceptedValueOwner:'nativeAcceptedValue'});}};
});
vi.mock('../../src/chart/drawing-duplicate-publication',async original=>{
 const module=await original<any>();return{...module,createDrawingDuplicatePublisher(host:any){
  const instrumented={...host};
  for(const key of ['assertMutable','makeId','reserve','select','selection','notify','quarantine'])instrumented[key]=spans.callback('host.'+key,host[key],host);
  instrumented.captureSource=()=>spans.callback('host.source.assertCurrent',spans.invoke('host.captureSource',host.captureSource,host,[]));
  instrumented.captureProjection=()=>spans.object('projection',spans.invoke('projection.capture',host.captureProjection,host,[]));
  instrumented.captureWorkspace=()=>spans.object('workspaceCommand',spans.invoke('workspaceCommand.capture',host.captureWorkspace,host,[]),{prepare:'workspacePrepared'});
  instrumented.begin=()=>spans.object('hold',spans.invoke('hold.begin',host.begin,host,[]));
  return module.createDrawingDuplicatePublisher(instrumented);
 }};
});

import {duplicateAdapterFixture} from './drawing-duplicate-adapter-harness';
import {annotationRecord} from './trendline-annotation-native-harness';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {assertNativeDrawingMatchesCanonical} from '../../src/chart/drawing-canonical';

const count=Number(process.env.LV_DUPLICATE_PHASE_COUNT??128);
if(![1,2,128].includes(count))throw Error('Phase profile count must be1,2or128.');
if(!process.env.LV_DUPLICATE_PHASE_RAW)throw Error('Supply a unique phase raw path through the watchdog runner.');
const path=resolve(process.env.LV_DUPLICATE_PHASE_RAW);
const output=relative(resolve('reports'),path);if(!output||output.startsWith('..')||isAbsolute(output))throw Error('Phase raw path must stay in reports.');
const inputs=['src/chart/adapter.ts','src/chart/drawing-command-router.ts','src/chart/drawing-duplicate-publication.ts','src/chart/drawing-duplicate-native.ts','src/chart/drawing-template-batch.ts','src/chart/contracts.ts','src/chart/drawing-canonical.ts','src/chart/drawing-document-bindings.ts','tests/chart/drawing-duplicate-adapter-harness.ts','tests/chart/drawing-command-router-harness.ts','tests/chart/drawing-native-harness.ts','tests/chart/trendline-annotation-native-harness.ts','tests/chart/drawing-duplicate-phase-profile.fixture.ts','.tmp/drawing-duplicate-phase-profile.vitest.config.mjs','.tmp/run-drawing-duplicate-phase-profile.mjs','package-lock.json','node_modules/@luxalgo/vela/package.json','node_modules/@luxalgo/vela/dist/index.js','node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js','node_modules/@luxalgo/vela/dist/chunk-ALTGHKIM.js'];
const hashes=()=>Object.fromEntries(inputs.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
it(`SYNTHETIC instrumented Duplicate phase diagnosis ${count}`,async()=>{
 const raw:any={schemaVersion:1,synthetic:true,count,status:'setup',complete:false,inputs:hashes(),scope:'Instrumented original-body diagnostic only. Inclusive spans overlap and must not be summed. Wrapper objects delegate with exact original receivers; diagnostic overhead/guard composition differs from uninstrumented baseline. No serializer or native prototype slots changed.'};
 const persist=()=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(raw,null,2)+'\n');};persist();
 let fixture:Awaited<ReturnType<typeof duplicateAdapterFixture>>|undefined;const restores:Array<()=>void>=[];
 try{
  for(const key of ['all','serialize','captureReadOnlyOwner','prepareOwnedInsertBatch'] as const){
   const descriptor=Object.getOwnPropertyDescriptor(LosslessDrawingDocument.prototype,key)!;
   const original=descriptor.value;Object.defineProperty(LosslessDrawingDocument.prototype,key,{...descriptor,value:function(this:unknown,...args:unknown[]){const result=spans.invoke('canonical.'+key,original,this,args);return key==='prepareOwnedInsertBatch'?spans.object('canonicalInsert',result,{accept:'canonicalAccepted'}):result;}});
   restores.push(()=>Object.defineProperty(LosslessDrawingDocument.prototype,key,descriptor));
  }
  const base=annotationRecord(false),rows=Array.from({length:count},(_,index)=>({...structuredClone(base),id:`SYNTHETIC-duplicate-perf-${index}`,zIndex:index+1,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}},future:{missing:undefined,negativeZero:-0,index}}));
  const setup=performance.now();fixture=await duplicateAdapterFixture(rows as any);fixture.controller.bindDrawingWorkspaceHost(fixture.host);raw.setupElapsedMs=performance.now()-setup;
  const originals=structuredClone(fixture.f.document.all()),originalNative=structuredClone(fixture.f.native.controller.all()),nativeHistory=fixture.f.native.controller.history.undoStack,workspaceBefore=fixture.workspace();let observed:unknown;
  fixture.subscribe(()=>{observed=fixture!.controller.saveDrawings();});
  raw.status='entry';persist();spans.start();const start=performance.now();let receipt:any;
  try{receipt=fixture.controller.duplicateDrawings(rows.map(row=>row.id));}finally{raw.instrumentedEntryMs=performance.now()-start;spans.stop();raw.spans=spans.rows;persist();}
  const canonical=fixture.f.document.all(),native=fixture.f.native.controller.all(),workspace=fixture.workspace();
  expect(receipt).toMatchObject({nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});expect(receipt.ids).toHaveLength(count);expect(new Set(receipt.ids).size).toBe(count);expect(canonical).toHaveLength(count*2);expect(native).toHaveLength(count*2);
  deepStrictEqual(canonical.slice(0,count),originals);deepStrictEqual(native.slice(0,count),originalNative);deepStrictEqual(workspace.drawings,fixture.f.document.serialize());deepStrictEqual(observed,workspace.drawings);deepStrictEqual(fixture.savedDuringPublish(),workspace.drawings);
  const byId=new Map(native.map((row:any)=>[row.id,row]));for(let index=0;index<count;index++){const copy=canonical[count+index];deepStrictEqual(copy,{...rows[index],id:receipt.ids[index],zIndex:count+index+1});assertNativeDrawingMatchesCanonical(copy as any,byId.get(receipt.ids[index]) as any);}
  expect(fixture.history.status().undo).toBe(1);expect(fixture.f.native.controller.history.undoStack).toBe(nativeHistory);expect(fixture.state()).toMatchObject({notifications:1,reconciliations:0,drawingBatch:0,nativeDrawingReconciliationHold:0,analysisUnavailable:'',selectedDrawingIds:receipt.ids});
  expect(fixture.history.undo(workspace,null)?.workspace).toBe(workspaceBefore);expect(fixture.history.redo(workspaceBefore,null)?.workspace).toBe(workspace);expect(fixture.f.document.undo()).toBe(true);deepStrictEqual(fixture.f.document.all(),rows);expect(fixture.f.document.undo()).toBe(false);expect(fixture.f.document.redo()).toBe(true);deepStrictEqual(fixture.f.document.serialize(),workspace.drawings);
  raw.receipt=receipt;raw.functionalComplete=true;raw.status='complete';raw.complete=true;
 }catch(error){raw.status='failed';raw.error=error instanceof Error?error.message:'Details unavailable';throw error;}
 finally{spans.stop();try{fixture?.dispose();}finally{for(const restore of restores.reverse())restore();raw.endInputs=hashes();raw.sourceStable=JSON.stringify(raw.inputs)===JSON.stringify(raw.endInputs);persist();if(raw.complete)expect(raw.sourceStable).toBe(true);}}
},120000);
