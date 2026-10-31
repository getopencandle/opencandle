import {expect,it,vi} from 'vitest';
import {Worker as NodeWorker} from 'node:worker_threads';
import {build} from 'vite';
import {resolve,dirname,basename} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {pathToFileURL} from 'node:url';
import type {Bar} from '../../src/domain/types';
import type {VwapWorkerPort} from '../../src/vwap/types';

// Diagnostic-only original-body wrappers. Genuine source, job and result
// handles remain identical; no scheduler, callback proof or kernel is replaced.
const profile=vi.hoisted(()=>{
 type Span={id:number;name:string;parent:number|null;startMs:number;endMs:number|null;elapsedMs:number|null;status:'running'|'complete'|'failed';rows?:number};
 type Event={name:string;atMs:number};
 const state={active:false,spans:[] as Span[],stack:[] as number[],events:[] as Event[],droppedSpans:0,droppedEvents:0};
 function event(name:string){if(!state.active)return;if(state.events.length>=64){state.droppedEvents++;return;}state.events.push({name,atMs:performance.now()});}
 function measure<T>(name:string,action:()=>T,rows?:number):T{
  if(!state.active)return action();
  if(state.spans.length>=128){state.droppedSpans++;return action();}
  const id=state.spans.length,span:Span={id,name,parent:state.stack.at(-1)??null,startMs:performance.now(),endMs:null,elapsedMs:null,status:'running',...(rows===undefined?{}:{rows})};
  state.spans.push(span);state.stack.push(id);
  try{const value=action();span.status='complete';return value;}catch(error){span.status='failed';throw error;}
  finally{span.endMs=performance.now();span.elapsedMs=span.endMs-span.startMs;state.stack.pop();}
 }
 return{state,event,measure};
});

vi.mock('../../src/chart/indicator-presentation',async importOriginal=>{
 const original=await importOriginal<typeof import('../../src/chart/indicator-presentation')>();
 return{...original,renderIndicatorPresentation(this:unknown,...args:Parameters<typeof original.renderIndicatorPresentation>){
  return profile.measure('presentation.render',()=>Reflect.apply(original.renderIndicatorPresentation,this,args),args[2].length);
 }};
});
vi.mock('../../src/chart/indicator-rendering',async importOriginal=>{
 const original=await importOriginal<typeof import('../../src/chart/indicator-rendering')>();
 return{...original,renderIndicatorSeries(this:unknown,...args:Parameters<typeof original.renderIndicatorSeries>){
  return profile.measure('presentation.series',()=>Reflect.apply(original.renderIndicatorSeries,this,args),args[3].length);
 }};
});
vi.mock('../../src/chart/vwap-indicator-run',async importOriginal=>{
 const original=await importOriginal<typeof import('../../src/chart/vwap-indicator-run')>();
 return{...original,startVwapIndicatorRun(this:unknown,...args:Parameters<typeof original.startVwapIndicatorRun>){
  const run=profile.measure('run.start',()=>Reflect.apply(original.startVwapIndicatorRun,this,args)) as ReturnType<typeof original.startVwapIndicatorRun>;
  // Observe the original promise; return the identical receiver-bound run.
  void run.result.then(()=>profile.event('run.materialized'),()=>profile.event('run.rejected'));
  return run;
 }};
});

import {createVwapClient} from '../../src/vwap/client';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import {indicatorEstimatedSlots,defaultIndicatorPresentation,assertIndicatorBatchBudget} from '../../src/chart/indicator-settings';
import {indicatorPlotNativeId} from '../../src/chart/indicator-rendering';
import {indicatorDecorationId} from '../../src/chart/indicator-presentation';
import {vwapIndicatorNativeHarness} from './vwap-indicator-native-harness';

const requestedCase=process.env.LV_VWAP_PHASE_CASE??'default';
if(!['default','all7'].includes(requestedCase))throw Error('Unsupported bounded VWAP phase case.');
const smokeValue=process.env.LV_VWAP_PHASE_SMOKE??'0';
if(!['0','1'].includes(smokeValue))throw Error('Unsupported VWAP phase smoke flag.');
const all=requestedCase==='all7',smoke=smokeValue==='1',count=smoke?129:all?60606:100000;
const requestedReportPath=process.env.LV_VWAP_PHASE_REPORT??`reports/vwap-route-phase-${new Date().toISOString().replace(/[^0-9]/g,'')}-${randomUUID().slice(0,8)}-${requestedCase}-raw.json`;
const reportPath=resolve(requestedReportPath);
if(requestedReportPath.length>512||dirname(reportPath)!==resolve('reports')||!/^vwap-route-phase-[A-Za-z0-9_-]+-raw\.json$/.test(basename(reportPath)))throw Error('Phase raw reports must be unique files directly within reports.');
const measuredFiles:readonly string[]=(await import(/* @vite-ignore */ pathToFileURL(resolve('.tmp/run-vwap-route-phase-profile.mjs')).href)).MEASURED_FILES;
const hashes=()=>Object.fromEntries(measuredFiles.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
// Memory budget: nominal120s/10ms=12000 observations plus4384 slack.
// Timer scheduling does not prove this bound; excess remains a failed gate.
const MAX_DELAYED_WINDOWS=16384;
type HeartbeatWindow={priorTickMs:number;expectedMs:number;actualMs:number;latenessMs:number};
function retainDelayedWindow(windows:HeartbeatWindow[],row:HeartbeatWindow):boolean{
 if(row.latenessMs<10)return true;
 if(windows.length>=MAX_DELAYED_WINDOWS)return false;
 windows.push(row);return true;
}
function includeMaximumWindow(windows:HeartbeatWindow[],maximum:HeartbeatWindow|null):HeartbeatWindow[]{
 const result=windows.slice();if(maximum&&!result.includes(maximum))result.push(maximum);return result;
}
type CorrelatedSpan={id:number;name:string;parent:number|null;startMs:number;endMs:number|null};
function correlateWindow(window:HeartbeatWindow,spans:readonly CorrelatedSpan[],events:readonly {name:string;atMs:number}[]){
 return{...window,overlappingSynchronousSpans:spans.filter(span=>span.endMs!==null&&span.startMs<window.actualMs&&span.endMs>window.expectedMs).map(span=>({id:span.id,name:span.name,parent:span.parent,overlapMs:Math.max(0,Math.min(span.endMs!,window.actualMs)-Math.max(span.startMs,window.expectedMs))})),eventsDuringDelay:events.filter(row=>row.atMs>=window.expectedMs&&row.atMs<=window.actualMs)};
}
function errorText(error:unknown):string{try{return(error instanceof Error?error.message:String(error)).slice(0,2048);}catch{return 'Unprintable diagnostic error';}}
function sameDescriptor(left:PropertyDescriptor|undefined,right:PropertyDescriptor|undefined):boolean{
 if(!left||!right)return left===right;
 return(['value','get','set','writable','enumerable','configurable'] as const).every(key=>Object.hasOwn(left,key)===Object.hasOwn(right,key)&&left[key]===right[key]);
}
function installTimedMethod(target:object,key:string,name:string,restore:Array<()=>void>,observe?:(args:readonly unknown[])=>void){
 const previous=Object.getOwnPropertyDescriptor(target,key),path:Array<{object:object;prototype:object|null;descriptor:PropertyDescriptor|undefined}>=[];
 let owner:object|null=target,descriptor:PropertyDescriptor|undefined;
 while(owner){descriptor=Object.getOwnPropertyDescriptor(owner,key);const prototype=Object.getPrototypeOf(owner) as object|null;path.push({object:owner,prototype,descriptor});if(descriptor)break;owner=prototype;}
 if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')throw Error('Original native phase method unavailable: '+key);
 const original=descriptor.value;
 const wrapper=function(this:unknown,...args:unknown[]){return profile.measure(name,()=>{if(profile.state.active)observe?.(args);return Reflect.apply(original,this,args);});};
 const installed:PropertyDescriptor={value:wrapper,writable:true,configurable:true,enumerable:previous?.enumerable??false};
 const assertProvider=()=>{for(const row of path)if(Object.getPrototypeOf(row.object)!==row.prototype||(row.object!==target&&!sameDescriptor(Object.getOwnPropertyDescriptor(row.object,key),row.descriptor)))throw Error('The phase profiler lost its original method provider: '+key);};
 // Register attempted acquisition first, including a write-then-throw failure.
 restore.push(()=>{
  assertProvider();
  const current=Object.getOwnPropertyDescriptor(target,key);
  if(sameDescriptor(current,installed)){if(previous)Object.defineProperty(target,key,previous);else if(!Reflect.deleteProperty(target,key))throw Error('Cannot remove owned phase wrapper: '+key);}
  else if(!sameDescriptor(current,previous))throw Error('The phase profiler lost exact method ownership: '+key);
  assertProvider();
  if(!sameDescriptor(Object.getOwnPropertyDescriptor(target,key),previous))throw Error('Original method descriptor or own absence was not restored: '+key);
 });
 Object.defineProperty(target,key,installed);
 assertProvider();
 if(!sameDescriptor(Object.getOwnPropertyDescriptor(target,key),installed))throw Error('Exact phase wrapper acquisition failed: '+key);
}

it('preserves original method receivers, own flags and inherited absence',()=>{
 const prototype={method(this:{value:number},add:number){return this.value+add;}},inherited=Object.assign(Object.create(prototype),{value:7}),restore:Array<()=>void>=[];
 const prior=Object.getOwnPropertyDescriptor(prototype,'method');
 installTimedMethod(inherited,'method','control',restore);
 expect(inherited.method(3)).toBe(10);
 restore[0]();expect(Object.hasOwn(inherited,'method')).toBe(false);expect(Object.getOwnPropertyDescriptor(prototype,'method')).toEqual(prior);
 const own={value:11};Object.defineProperty(own,'method',{value:prototype.method,writable:false,configurable:true,enumerable:true});
 const descriptor=Object.getOwnPropertyDescriptor(own,'method'),ownRestore:Array<()=>void>=[];
 installTimedMethod(own,'method','control',ownRestore);ownRestore[0]();expect(Object.getOwnPropertyDescriptor(own,'method')).toEqual(descriptor);
});

it('refuses changed wrapper flags or provider paths without replacing foreign state',()=>{
 const prototype={method(){return 1;}},target=Object.create(prototype),restore:Array<()=>void>=[];
 installTimedMethod(target,'method','control',restore);
 const wrapper=Object.getOwnPropertyDescriptor(target,'method')!;
 Object.defineProperty(target,'method',{...wrapper,enumerable:!wrapper.enumerable});
 expect(restore[0]).toThrow(/exact method ownership/);
 expect(Object.getOwnPropertyDescriptor(target,'method')?.enumerable).toBe(!wrapper.enumerable);
 const second=Object.create(prototype),secondRestore:Array<()=>void>=[];
 installTimedMethod(second,'method','control',secondRestore);
 Object.setPrototypeOf(second,{method(){return 2;}});
 expect(secondRestore[0]).toThrow(/method provider/);
});

it('cleans a write-then-throw acquisition and rejects a false own-absence restoration',()=>{
 const prototype={method(){return 1;}},backing=Object.create(prototype),restore:Array<()=>void>=[];
 const target=new Proxy(backing,{defineProperty(object,key,descriptor){Reflect.defineProperty(object,key,descriptor);throw Error('OWN ACQUISITION AFTER WRITE');}});
 expect(()=>installTimedMethod(target,'method','control',restore)).toThrow('OWN ACQUISITION AFTER WRITE');
 expect(restore).toHaveLength(1);restore[0]();expect(Object.hasOwn(backing,'method')).toBe(false);
 const retained=Object.create(prototype),lying=new Proxy(retained,{deleteProperty(){return true;}}),failedRestore:Array<()=>void>=[];
 installTimedMethod(lying,'method','control',failedRestore);
 expect(failedRestore[0]).toThrow(/own absence/);expect(Object.hasOwn(retained,'method')).toBe(true);
});

class ControlledProcess extends EventEmitter{
 pid:number;exitCode:number|null=null;signalCode:string|null=null;unrefs=0;killRequests=0;
 constructor(pid:number){super();this.pid=pid;}
 kill(){this.killRequests++;return true;}
 unref(){this.unrefs++;return this;}
 exit(code:number){this.exitCode=code;this.emit('exit',code,null);}
 close(code:number){this.emit('close',code,null);}
}
const runner=()=>import(/* @vite-ignore */ pathToFileURL(resolve('.tmp/run-vwap-route-phase-profile.mjs')).href);
const controlledSpec={name:'default',smoke:true,raw:'reports/vwap-route-phase-control-default-raw.json',test:'reports/vwap-route-phase-control-default-vitest.json'};

it('does not settle on child exit or before a started kill command closes',async()=>{
 const {runOwnedPhaseCase}=await runner(),child=new ControlledProcess(1001),signals=new EventEmitter();
 let settled=false;
 const ordinary=runOwnedPhaseCase(controlledSpec,{spawnProcess:()=>child,signals,watchdogMs:1000,cleanupGraceMs:100,platform:'win32'}).then((value:unknown)=>{settled=true;return value;});
 child.exit(0);await Promise.resolve();expect(settled).toBe(false);child.close(0);
 expect((await ordinary).cleanupConfirmed).toBe(true);
 const pending=new ControlledProcess(1002),killer=new ControlledProcess(1003);let acquisitions=0,cancelledSettled=false;
 const cancelled=runOwnedPhaseCase(controlledSpec,{spawnProcess:()=>++acquisitions===1?pending:killer,signals,watchdogMs:1000,cleanupGraceMs:100,platform:'win32'}).then((value:unknown)=>{cancelledSettled=true;return value;});
 signals.emit('SIGTERM');signals.emit('SIGINT');pending.exit(1);pending.close(1);
 await Promise.resolve();await Promise.resolve();expect(cancelledSettled).toBe(false);expect(acquisitions).toBe(2);
 killer.exit(0);await Promise.resolve();expect(cancelledSettled).toBe(false);killer.close(0);
 const result=await cancelled;expect(result.cancelled).toBe(true);expect(result.termination.killCommandClosed).toBe(true);expect(result.cleanupConfirmed).toBe(true);
 expect(signals.listenerCount('SIGTERM')).toBe(0);expect(signals.listenerCount('SIGINT')).toBe(0);
});

it('bounds an unclosed child and kill command without claiming cleanup',async()=>{
 const {runOwnedPhaseCase}=await runner(),child=new ControlledProcess(1004),killer=new ControlledProcess(1005),signals=new EventEmitter();let acquisitions=0;
 const result=await runOwnedPhaseCase(controlledSpec,{spawnProcess:()=>++acquisitions===1?child:killer,signals,watchdogMs:5,cleanupGraceMs:20,platform:'win32'});
 expect(result.censored).toBe(true);expect(result.cleanupConfirmed).toBe(false);
 expect(result.termination.terminationUnconfirmed).toBe(true);expect(result.termination.killCommandTerminationUnconfirmed).toBe(true);
 expect(child.unrefs).toBe(1);expect(killer.unrefs).toBe(1);expect(killer.killRequests).toBe(1);
 expect(signals.listenerCount('SIGTERM')).toBe(0);expect(signals.listenerCount('SIGINT')).toBe(0);
});

it('rejects escaped paths, missing heartbeat observations and incomplete result or cleanup gates',async()=>{
 const {checkedRawPath,checkRawCompletion,checkVitestCompletion,MEASURED_FILES}=await runner();
 for(const path of ['outside.json','reports/../vwap-route-phase-escape-raw.json','reports/nested/vwap-route-phase-escape-raw.json','reports/vwap-route-phase-data.txt'])expect(()=>checkedRawPath(path)).toThrow();
 expect(checkedRawPath(controlledSpec.raw)).toBe(resolve(controlledSpec.raw));
 const hashes=Object.fromEntries((MEASURED_FILES as readonly string[]).map(path=>[path,'a'.repeat(64)]));
 const first={priorTickMs:0,expectedMs:10,actualMs:109,latenessMs:99,overlappingSynchronousSpans:[],eventsDuringDelay:[]};
 const report={status:'complete',hashes,endHashes:{...hashes},sourceStable:true,configuration:{case:'default',smoke:true,rows:129,blockingGateMs:50,heartbeatGateMs:50,heartbeatPeriodMs:10,productDeadlineMs:60000},result:{numericalComplete:true,callerUntouched:true},nativeInputSeriesCounts:[0,1],presentationCoverage:{policy:'v2-offset0-staged',metadataRenderCount:1,metadataSeriesCount:1,fullHistoryRenderCount:0,fullHistorySeriesCount:0,nativeBuilds:2,nativeApplies:2,nativeMounts:2},ingress:{setBarsStartMs:1,addReturnedMs:61,setBarsStartToAddReturnMs:60,heartbeatTicksAtAddReturn:0},publication:{finalApply:{name:'native.applyModel',status:'complete',startMs:200,endMs:210,elapsedMs:10}},gates:{numericalComplete:true,diagnosticCoverage:true},droppedInstrumentation:{spans:0,events:0},heartbeat:{ticks:1,maxLatenessMs:99,droppedWindows:0,windowCapacity:MAX_DELAYED_WINDOWS,windows:[],firstObservedWindow:first,maximumWindow:first,maximumCorrelation:first},cleanup:{originalMethodsRestored:true,workerShutdownConfirmed:true,workersCreated:1,workersConfirmed:1,errors:[]}};
 expect(checkRawCompletion(report,controlledSpec)).toEqual([]); //50ms failure is preserved, not relabeled numerical failure.
 const missingHelper={...hashes};delete missingHelper['src/chart/vwap-presentation.ts'];
 for(const patch of [{sourceStable:false},{hashes:missingHelper},{endHashes:{one:'b'.repeat(64)}},{result:{...report.result,numericalComplete:false}},{nativeInputSeriesCounts:[1,1]},{presentationCoverage:{...report.presentationCoverage,fullHistoryRenderCount:1}},{ingress:{...report.ingress,heartbeatTicksAtAddReturn:1}},{heartbeat:{...report.heartbeat,firstObservedWindow:null}},{heartbeat:{...report.heartbeat,maximumCorrelation:null}},{publication:{finalApply:null}},{heartbeat:{...report.heartbeat,ticks:0}},{heartbeat:{...report.heartbeat,droppedWindows:1}},{heartbeat:{...report.heartbeat,windowCapacity:256}},{heartbeat:{...report.heartbeat,windows:Array(MAX_DELAYED_WINDOWS+2).fill(null)}},{cleanup:{...report.cleanup,originalMethodsRestored:false}},{cleanup:{...report.cleanup,workerShutdownConfirmed:false}}])expect(checkRawCompletion({...report,...patch},controlledSpec).length).toBeGreaterThan(0);
 const file={name:resolve('tests/chart/vwap-route-phase-profile.fixture.ts'),status:'passed',message:'',assertionResults:Array.from({length:9},(_,index)=>({status:'passed',fullName:'literal control '+index,failureMessages:[]}))};
 const tests={success:true,numTotalTestSuites:1,numPassedTestSuites:1,numFailedTestSuites:0,numPendingTestSuites:0,numTotalTests:9,numPassedTests:9,numFailedTests:0,numPendingTests:0,numTodoTests:0,snapshot:{failure:false},testResults:[file]};
 expect(checkVitestCompletion(tests)).toEqual([]);
 for(const patch of [{success:false},{numTotalTests:undefined},{numTodoTests:1},{numFailedTestSuites:1},{testResults:[]},{testResults:[{...file,status:'failed'}]},{testResults:[{...file,assertionResults:file.assertionResults.slice(1)}]},{testResults:[{...file,assertionResults:file.assertionResults.map((row,index)=>index?row:{...row,status:'skipped'})}]},{unhandledErrors:['ERROR']}])expect(checkVitestCompletion({...tests,...patch}).length).toBeGreaterThan(0);
});

it('retains delayed windows beyond256 up to the fixed cap and exposes overflow without losing the maximum',async()=>{
 expect((await runner()).MAX_DELAYED_WINDOWS).toBe(MAX_DELAYED_WINDOWS);
 const windows:HeartbeatWindow[]=[],row=(index:number,latenessMs=10):HeartbeatWindow=>({priorTickMs:index*20,expectedMs:index*20+10,actualMs:index*20+10+latenessMs,latenessMs});
 let dropped=0;
 for(let index=0;index<257;index++)if(!retainDelayedWindow(windows,row(index)))dropped++;
 expect(windows).toHaveLength(257);expect(dropped).toBe(0);
 for(let index=257;index<MAX_DELAYED_WINDOWS;index++)if(!retainDelayedWindow(windows,row(index)))dropped++;
 expect(windows).toHaveLength(MAX_DELAYED_WINDOWS);expect(dropped).toBe(0);
 expect(retainDelayedWindow(windows,row(MAX_DELAYED_WINDOWS,9))).toBe(true);expect(windows).toHaveLength(MAX_DELAYED_WINDOWS);
 const maximum=row(MAX_DELAYED_WINDOWS,105);
 if(!retainDelayedWindow(windows,maximum))dropped++;
 expect(dropped).toBe(1);expect(windows).toHaveLength(MAX_DELAYED_WINDOWS);
 const correlated=includeMaximumWindow(windows,maximum);
 expect(correlated).toHaveLength(MAX_DELAYED_WINDOWS+1);expect(correlated.at(-1)).toBe(maximum);expect(windows).toHaveLength(MAX_DELAYED_WINDOWS);
 expect(includeMaximumWindow(windows,windows[0])).toHaveLength(MAX_DELAYED_WINDOWS);
});

it('correlates initial ingress and final native apply without treating overlap as exclusive cause',()=>{
 const spans=[{id:0,name:'native.setBars',parent:null,startMs:0,endMs:20},{id:1,name:'port.add',parent:null,startMs:20,endMs:60},{id:2,name:'native.applyModel',parent:null,startMs:200,endMs:230},{id:3,name:'native.mountIndicator',parent:2,startMs:210,endMs:211}],events=[{name:'port.add.returned',atMs:60},{name:'route.ready',atMs:231}];
 const first=correlateWindow({priorTickMs:0,expectedMs:10,actualMs:65,latenessMs:55},spans,events);
 expect(first.overlappingSynchronousSpans).toEqual([{id:0,name:'native.setBars',parent:null,overlapMs:10},{id:1,name:'port.add',parent:null,overlapMs:40}]);
 expect(first.eventsDuringDelay).toEqual([{name:'port.add.returned',atMs:60}]);
 const final=correlateWindow({priorTickMs:195,expectedMs:205,actualMs:235,latenessMs:30},spans,events);
 expect(final.overlappingSynchronousSpans).toEqual([{id:2,name:'native.applyModel',parent:null,overlapMs:25},{id:3,name:'native.mountIndicator',parent:2,overlapMs:1}]);
 expect(final.eventsDuringDelay).toEqual([{name:'route.ready',atMs:231}]);
 // Parent IDs remain present: the nested mount is not added to apply as
 // independent exclusive work, and the uncovered delay is not called GC.
 expect(final.overlappingSynchronousSpans[1].parent).toBe(final.overlappingSynchronousSpans[0].id);
});

it('locates complete original presentation and native emission spans without changing source or numerical authority',async()=>{
 const report:Record<string,any>={schemaVersion:3,started:new Date().toISOString(),status:'initializing',hashes:hashes(),
  notice:'SYNTHETIC original production kernel/worker and pinned core with controlled ancillary sinks. Diagnostic wrappers invoke original bodies on original receivers. No browser/package/GUI/raster/reference evidence.',
  configuration:{case:requestedCase,smoke,rows:count,plots:all?7:1,fills:all?3:0,prices:'all raw OHLC exactly10',volume:'1+(ordinal%23)',cadenceSeconds:60,transform:'standard',anchor:'Session',timezone:'UTC',coldRecordedSamples:1,warmups:0,blockingGateMs:50,heartbeatGateMs:50,heartbeatPeriodMs:10,productDeadlineMs:60000},
  limits:['Inclusive spans have explicit parents; never sum nested presentation/series or apply/mount twice.','No GC observer is installed. Neither overlap nor absence of spans proves a GC cause.','Original default timer schedulers are unchanged. Prefix preparation and client job-result spans are unmeasured; validation/materialization task costs are not individually isolated.','No per-loop logging or file writes occur inside the measured route. Original async phase microtask boundaries are retained, but baseline report I/O is omitted.','Own method wrappers shorten provider lookup and add instrumentation. These diagnostic timings are not baseline-equivalent or overhead-only adjustments.','Staged version2 uses one empty-history metadata render; full-history point preparation is outside those generic render spans. No per-chunk instrumentation is added.','SetBars through add-return is an elapsed observation across synchronous bodies and the existing resolved-await boundary; first/max heartbeat correlations locate overlap without exclusive cause.','Listed measured source inputs are not a self-contained dependency closure.']};
 let reportCreated=false;
 const persist=()=>{mkdirSync(resolve('reports'),{recursive:true});const text=JSON.stringify(report,null,2)+'\n';if(Buffer.byteLength(text)>8*1024*1024)throw Error('Phase raw report exceeds the bounded JSON size.');writeFileSync(reportPath,text,{flag:reportCreated?'w':'wx'});reportCreated=true;};
 persist();
 type Termination={fulfilled:true;code:number}|{fulfilled:false;error:unknown};
 type OwnedWorker={worker:NodeWorker;exitObserved:boolean;exitCode:number|null;requests:Promise<Termination>[];errors:unknown[]};
 const workers:OwnedWorker[]=[],restore:Array<()=>void>=[],nativeInputSeriesCounts:number[]=[];
 const requestTermination=(owned:OwnedWorker)=>{
  if(owned.requests.length>=4)throw Error('Too many termination requests for one diagnostic worker.');
  // Observe immediately: a void transport method must not leave a rejecting
  // Node termination promise unhandled until the later fixture cleanup.
  const request=owned.worker.terminate().then<Termination,Termination>(code=>({fulfilled:true,code}),error=>({fulfilled:false,error}));
  owned.requests.push(request);return request;
 };
 const transport={postRows:[] as number[],postBytes:[] as number[],workerMessages:0,terminations:0};
 let h:Awaited<ReturnType<typeof vwapIndicatorNativeHarness>>|undefined,client:ReturnType<typeof createVwapClient>|undefined;
 let heartbeat:ReturnType<typeof setInterval>|undefined,deadline=0,priorTick=0,maxLate=0,ticks=0,missed=0,droppedWindows=0;
 const windows:HeartbeatWindow[]=[],maxWindow:{value:HeartbeatWindow|null}={value:null},firstWindow:{value:HeartbeatWindow|null}={value:null};
 let routeStart=0,routeEnd=0;
 try{
  const compileStart=performance.now();
  const bundle=await build({configFile:false,logLevel:'silent',build:{write:false,minify:true,lib:{entry:resolve('src/vwap/worker.ts'),formats:['es'],fileName:'vwap-worker'}}});
  const chunks=(Array.isArray(bundle)?bundle:[bundle]).flatMap(item=>'output'in item?item.output:[]).filter(item=>item.type==='chunk');
  if(chunks.length!==1)throw Error('Expected one fixed production worker chunk.');
  const code=chunks[0].code;
  report.compileMs=performance.now()-compileStart;report.workerBundleSha256=createHash('sha256').update(code).digest('hex');report.workerBundleBytes=Buffer.byteLength(code);
  const encoded='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  const bridge=`import {parentPort} from 'node:worker_threads';globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);parentPort.on('message',data=>globalThis.onmessage?.({data}));await import(${JSON.stringify(encoded)});`;
  report.executedWorkerArtifacts=[];
  for(const [role,text] of [['worker',code],['node-bridge',bridge]] as const){
   const path=reportPath.replace(/-raw\.json$/,`-${role}.mjs`),bytes=Buffer.byteLength(text);
   if(bytes>8*1024*1024)throw Error('Executed diagnostic worker artifact exceeds its byte bound.');
   writeFileSync(path,text,{flag:'wx'});
   report.executedWorkerArtifacts.push({role,path:'reports/'+basename(path),bytes,sha256:createHash('sha256').update(text).digest('hex'),meaning:role==='worker'?'Exact minified worker module used in the data URL':'Exact Node bridge text used in the Worker data URL'});
  }
  const url=new URL('data:text/javascript;base64,'+Buffer.from(bridge).toString('base64'));
  client=createVwapClient({factory():VwapWorkerPort{
   if(workers.length>=1)throw Error('Unexpected additional diagnostic worker acquisition.');
   profile.event('worker.factory');const worker=new NodeWorker(url),owned:OwnedWorker={worker,exitObserved:false,exitCode:null,requests:[],errors:[]};workers.push(owned);
   worker.once('exit',code=>{owned.exitObserved=true;owned.exitCode=code;});
   worker.on('error',error=>{if(owned.errors.length<8)owned.errors.push(error);});
   const listeners=new Map<(event:any)=>void,{type:string;wrapped:(value:any)=>void}>();
   return{
    postMessage(message:any,transfer){if(transport.postRows.length>=2)throw Error('Unexpected repeated diagnostic transfer.');profile.event('worker.post.begin');profile.measure('worker.postMessage',()=>{transport.postRows.push(message.rows);transport.postBytes.push(message.buffer.byteLength);worker.postMessage(message,transfer as ArrayBuffer[]);});profile.event('worker.post.end');},
    addEventListener(type,listener){if(listeners.size>=4)throw Error('Too many diagnostic transport listeners.');const wrapped=type==='message'?(data:unknown)=>{transport.workerMessages++;profile.event(transport.workerMessages===1?'worker.message.first':'worker.message.result');listener({data});}:listener;listeners.set(listener,{type,wrapped});worker.on(type,wrapped);},
    removeEventListener(_type,listener){const row=listeners.get(listener);if(row){worker.off(row.type,row.wrapped);listeners.delete(listener);}},
    terminate(){profile.event('worker.terminate.request.begin');transport.terminations++;requestTermination(owned);profile.event('worker.terminate.request.returned');}
   };
  }});
  const sourceStart=performance.now();
  const input:Bar[]=Array.from({length:count},(_,index)=>({time:1700000000+index*60,open:10,high:10,low:10,close:10,volume:1+index%23}));
  report.sourceProductionMs=performance.now()-sourceStart;
  const setupStart=performance.now();h=await vwapIndicatorNativeHarness(input,client);report.harnessSetupMs=performance.now()-setupStart;
  installTimedMethod(h.core,'buildNativeModel','native.buildNativeModel',restore,args=>{
   if(nativeInputSeriesCounts.length>=4)throw Error('Too many diagnostic native build observations.');
   const output=args[1];if(!output||typeof output!=='object')throw Error('Native build input is unavailable.');
   const series=Object.getOwnPropertyDescriptor(output,'series');
   if(!series||!Object.hasOwn(series,'value')||!Array.isArray(series.value))throw Error('Native build series must be own array data.');
   const length=Object.getOwnPropertyDescriptor(series.value,'length');
   if(!length||!Object.hasOwn(length,'value')||!Number.isSafeInteger(length.value)||length.value<0||length.value>2048)throw Error('Native build series count is unavailable.');
   nativeInputSeriesCounts.push(length.value);
  });
  installTimedMethod(h.core,'applyModel','native.applyModel',restore);
  installTimedMethod(h.renderer,'mountIndicator','native.mountIndicator',restore);
  const inputs={...VWAP_BAND_DEFAULTS,kernelVersion:2,source:'hlc3',band1Enabled:all,band2Enabled:all,band3Enabled:all};
  report.publicationSlots=indicatorEstimatedSlots('vwap',count,inputs,defaultIndicatorPresentation('vwap'));
  expect(report.publicationSlots).toBe(count*(all?33:3));
  if(all){expect(()=>assertIndicatorBatchBudget([{kind:'vwap',inputs,presentation:defaultIndicatorPresentation('vwap')}],100000)).toThrow(/limits/);report.all7At100000RejectedBeforeMutation=true;}
  await new Promise(resolve=>setTimeout(resolve,20));
  profile.state.spans=[];profile.state.stack=[];profile.state.events=[];profile.state.droppedSpans=0;profile.state.droppedEvents=0;
  routeStart=performance.now();priorTick=routeStart;deadline=routeStart+10;
  heartbeat=setInterval(()=>{
   const actual=performance.now(),late=Math.max(0,actual-deadline),row:HeartbeatWindow={priorTickMs:priorTick,expectedMs:deadline,actualMs:actual,latenessMs:late};
   if(firstWindow.value===null)firstWindow.value=row;
   ticks++;missed+=Math.floor(late/10);if(late>maxLate){maxLate=late;maxWindow.value=row;}
   if(!retainDelayedWindow(windows,row))droppedWindows++;
   priorTick=actual;deadline=actual+10;
  },10);
  profile.state.active=true;profile.event('route.start');
  await profile.measure('native.setBars',()=>{h!.native.introPlayed=true;h!.renderer.setBars(h!.core.bars);});
  const id=profile.measure('port.add',()=>h!.port.add('vwap',inputs));profile.event('port.add.returned');const heartbeatTicksAtAddReturn=ticks;
  await Promise.resolve(); // Retain the original awaited sync-phase boundary.
  await h.port.waitForVwap();h.port.assertVwapReady();routeEnd=performance.now();profile.event('route.ready');
  // Let the delayed heartbeat observe the final synchronous publication turn.
  await new Promise(resolve=>setTimeout(resolve,20));
  profile.state.active=false;clearInterval(heartbeat);heartbeat=undefined;
  const spans=profile.state.spans,events=profile.state.events;
  const event=(name:string)=>events.find(row=>row.name===name)?.atMs??null;
  const between=(first:string,last:string)=>{const a=event(first),b=event(last);return a===null||b===null?null:b-a;};
  const correlated=includeMaximumWindow(windows,maxWindow.value);
  report.spans=spans;report.events=events;
  report.routeElapsedMs=routeEnd-routeStart;
  report.heartbeat={periodMs:10,maxLatenessMs:maxLate,ticks,missedIntervals:missed,droppedWindows,windowCapacity:MAX_DELAYED_WINDOWS,maximumWindow:maxWindow.value,
   firstObservedWindow:firstWindow.value?correlateWindow(firstWindow.value,spans,events):null,
   maximumCorrelation:maxWindow.value?correlateWindow(maxWindow.value,spans,events):null,
   windows:correlated.map(window=>correlateWindow(window,spans,events)),
   policy:'A delayed window begins at the expected deadline, not at the final callback. Span overlap locates work but is not exclusive causal attribution.',
   capacityPolicy:'Retain16384 delayed windows plus at most1 separately preserved maximum in the windows array. First/max summaries add at most2 fixed records. Nominal120s/10ms=12000 observations plus4384 slack is sizing rationale, not a timer guarantee. Any overflow remains counted and fails completeness; the8MiB report limit still applies.'};
  const ingressStart=spans.find(row=>row.name==='native.setBars')!.startMs,addReturned=event('port.add.returned')!;
  report.ingress={setBarsStartMs:ingressStart,addReturnedMs:addReturned,setBarsStartToAddReturnMs:addReturned-ingressStart,heartbeatTicksAtAddReturn,
   interpretation:'Original synchronous setBars and add bodies with the existing awaited-resolved microtask boundary, no scheduled yield inserted. The first timer callback is separately observed. Elapsed group duration includes instrumentation/gaps and is not a sum of exclusive body costs.'};
  report.publication={finalBuild:spans.filter(row=>row.name==='native.buildNativeModel').at(-1),finalApply:spans.filter(row=>row.name==='native.applyModel').at(-1),finalMount:spans.filter(row=>row.name==='native.mountIndicator').at(-1),
   interpretation:'Final occurrences follow the literal empty pending emission. Apply includes nested mount; do not add these durations. Heartbeat correlations are overlap evidence, not exclusive attribution.'};
  report.elapsedBoundaries={
   addStartToWorkerFactoryMs:event('worker.factory')===null?null:event('worker.factory')!-spans.find(row=>row.name==='port.add')!.startMs,
   workerStartupMs:between('worker.factory','worker.message.first'),
   workerAndTransportMs:between('worker.post.end','worker.message.result'),
   replyToTerminationRequestMs:between('worker.message.result','worker.terminate.request.begin'),
   terminationRequestReturnToMaterializationMs:between('worker.terminate.request.returned','run.materialized'),
   materializedToReadyMs:between('run.materialized','route.ready'),
   interpretation:'Elapsed intervals include scheduling/callback tails. Reply-to-request includes host validation; request-return-to-materialized includes final client checks and conversion. Termination request return is not confirmed shutdown. These are not pure CPU, kernel or timer-wait measurements; prefix.prepare and client job.result are unmeasured.'};
  const auditStart=performance.now(),result=h.port.values(id),view=h.port.list().find(row=>row.id===id)!;
  const native=h.native.scene.indicators.get(view.rendererId),expected:Record<string,number>={vwap:10,upper1:10.1,lower1:9.9,upper2:10.2,lower2:9.8,upper3:10.3,lower3:9.7};
  const active=all?['vwap','upper1','lower1','upper2','lower2','upper3','lower3']:['vwap'];
  const pointCheck=(series:any,value:number)=>series?.points?.length===count&&series.points.every((point:any,index:number)=>point.time===(1700000000+index*60)*1000&&point.value===value);
  const nativePlotsComplete=active.every(plot=>pointCheck(native.series.find((series:any)=>series.id===indicatorPlotNativeId(id,'vwap',plot)),expected[plot]));
  const nativeFillsComplete=native.fills.length===(all?3:0)&&(!all||[1,2,3].every(pair=>{const fill=native.fills.find((row:any)=>row.id===indicatorDecorationId(id,`fill:band${pair}`));return fill&&pointCheck(native.series.find((series:any)=>series.id===fill.fromSeriesId),expected['lower'+pair])&&pointCheck(native.series.find((series:any)=>series.id===fill.toSeriesId),expected['upper'+pair]);}));
  const domainComplete=result.series.length===active.length&&result.series.every(plot=>plot.values.length===count&&plot.values.every(value=>value===expected[plot.id]));
  const callerUntouched=!Object.isFrozen(input)&&input.every((row,index)=>!Object.isFrozen(row)&&row.time===1700000000+index*60&&row.open===10&&row.high===10&&row.low===10&&row.close===10&&row.volume===1+index%23);
  const numericalComplete=domainComplete&&nativePlotsComplete&&nativeFillsComplete&&native.series.length===(all?13:1)&&view.informationBars===count&&view.latestInformationTime===1700000000+(count-1)*60&&h.quarantines.length===0&&result.diagnostics.length===0&&Object.values(result.plotDiagnostics??{}).every(rows=>rows.length===0)&&view.presentationDiagnostics.length===0;
  report.result={acceptedReady:true,numericalComplete,domainComplete,nativePlotsComplete,nativeFillsComplete,callerUntouched,informationBars:view.informationBars,latestInformationTime:view.latestInformationTime,nativeSeries:native.series.length,nativeFills:native.fills.length,quarantines:h.quarantines.length,diagnostics:result.diagnostics,plotDiagnostics:result.plotDiagnostics??{},presentationDiagnostics:view.presentationDiagnostics};
  const finalPresentation=spans.filter(row=>row.name==='presentation.render'&&row.rows===count),finalSeries=spans.filter(row=>row.name==='presentation.series'&&row.rows===count);
  const metadataPresentation=spans.filter(row=>row.name==='presentation.render'&&row.rows===0),metadataSeries=spans.filter(row=>row.name==='presentation.series'&&row.rows===0);
  for(const name of ['native.setBars','port.add','run.start'])expect(spans.filter(row=>row.name===name)).toHaveLength(1);
  // Explicit diagnostic migration: archived pre-staging runs required one
  // full-history render. The accepted staged path requires only metadata.
  expect(finalPresentation).toHaveLength(0);expect(finalSeries).toHaveLength(0);
  expect(metadataPresentation).toHaveLength(1);expect(metadataSeries).toHaveLength(1);expect(metadataSeries[0].parent).toBe(metadataPresentation[0].id);
  // Pending emission uses the port's literal empty native output, bypassing
  // presentation conversion. Prove that input as well as the final model.
  report.nativeInputSeriesCounts=nativeInputSeriesCounts;
  expect(nativeInputSeriesCounts).toEqual([0,all?13:1]);
  expect(spans.filter(row=>row.name==='native.buildNativeModel')).toHaveLength(2);
  expect(spans.filter(row=>row.name==='native.applyModel')).toHaveLength(2);
  expect(spans.filter(row=>row.name==='native.mountIndicator')).toHaveLength(2);
  report.presentationCoverage={policy:'v2-offset0-staged',metadataRenderCount:metadataPresentation.length,metadataSeriesCount:metadataSeries.length,fullHistoryRenderCount:finalPresentation.length,fullHistorySeriesCount:finalSeries.length,nativeBuilds:spans.filter(row=>row.name==='native.buildNativeModel').length,nativeApplies:spans.filter(row=>row.name==='native.applyModel').length,nativeMounts:spans.filter(row=>row.name==='native.mountIndicator').length};
  expect(spans.every(row=>row.status==='complete')).toBe(true);
  expect(profile.state.droppedSpans).toBe(0);expect(profile.state.droppedEvents).toBe(0);
  expect(ticks).toBeGreaterThan(0);expect(droppedWindows).toBe(0);expect(heartbeatTicksAtAddReturn).toBe(0);expect(firstWindow.value!.actualMs).toBeGreaterThanOrEqual(addReturned);
  expect(events.filter(row=>row.name==='run.materialized')).toHaveLength(1);
  expect(numericalComplete).toBe(true);expect(callerUntouched).toBe(true);
  expect(transport.postRows).toEqual([count]);expect(transport.postBytes).toEqual([count*48]);expect(transport.workerMessages).toBe(2);expect(transport.terminations).toBe(1);
  report.auditMs=performance.now()-auditStart;
  report.gates={numericalComplete,entryBlocking:spans.filter(row=>row.name==='native.setBars'||row.name==='port.add').every(row=>row.elapsedMs!==null&&row.elapsedMs<=50),routeHeartbeat:maxLate<=50,diagnosticCoverage:true,smokeOnly:smoke,responsivenessAdmitted:false,wholePlanComplete:false};
  report.status='complete';
 }catch(error){report.status='failed';report.error=errorText(error);report.spans=profile.state.spans;report.events=profile.state.events;report.partialHeartbeat={maxLatenessMs:maxLate,ticks,missedIntervals:missed,maximumWindow:maxWindow.value};throw error;}
 finally{
  profile.state.active=false;if(heartbeat!==undefined)clearInterval(heartbeat);
  const cleanupStart=performance.now(),errors:unknown[]=[],methodErrors:unknown[]=[],workerCleanup:Array<Record<string,unknown>>=[];
  try{h?.dispose();}catch(error){errors.push(error);}
  try{client?.dispose();}catch(error){errors.push(error);}
  for(const owned of workers){
   const row:Record<string,unknown>={confirmed:false};workerCleanup.push(row);
   try{requestTermination(owned);}catch(error){errors.push(error);row.requestError=errorText(error);}
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const result=await Promise.race([Promise.all(owned.requests),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),5000);})]);
    if(result===null){errors.push(Error('Diagnostic worker shutdown is unconfirmed after 5000ms.'));row.timedOut=true;owned.worker.unref();}
    else{for(const request of result)if(!request.fulfilled)errors.push(request.error);row.confirmed=owned.exitObserved&&result.length>0&&result.every(request=>request.fulfilled);if(!row.confirmed)errors.push(Error('Diagnostic worker shutdown was not confirmed.'));}
   }catch(error){errors.push(error);row.cleanupError=errorText(error);}
   finally{if(timer!==undefined)clearTimeout(timer);}
   errors.push(...owned.errors);row.exitObserved=owned.exitObserved;row.exitCode=owned.exitCode;row.requests=owned.requests.length;
  }
  for(const off of restore.reverse())try{off();}catch(error){methodErrors.push(error);errors.push(error);}
  report.cleanup={elapsedMs:performance.now()-cleanupStart,errors:errors.map(errorText),originalMethodsRestored:methodErrors.length===0,workersCreated:workers.length,workersConfirmed:workerCleanup.filter(row=>row.confirmed===true).length,workerShutdownConfirmed:workers.length===1&&workerCleanup.every(row=>row.confirmed===true),workers:workerCleanup};
  report.transport=transport;report.droppedInstrumentation={spans:profile.state.droppedSpans,events:profile.state.droppedEvents};
  report.nativeInputSeriesCounts=nativeInputSeriesCounts;
  report.endHashes=hashes();report.sourceStable=Object.entries(report.hashes).every(([path,hash])=>report.endHashes[path]===hash);report.ended=new Date().toISOString();
  if(errors.length||!report.sourceStable){report.status='failed';report.finalizationFailed=true;}
  persist();expect(errors).toEqual([]);expect(report.sourceStable).toBe(true);
 }
},110000);
