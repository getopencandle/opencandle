import {it,expect} from 'vitest';
import {Worker as NodeWorker} from 'node:worker_threads';
import {build} from 'vite';
import {resolve,basename} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createVwapClient} from '../../src/vwap/client';
import type {VwapWorkerPort} from '../../src/vwap/types';
import type {Bar} from '../../src/domain/types';
import {VWAP_BAND_DEFAULTS} from '../../src/domain/indicators';
import {indicatorEstimatedSlots,defaultIndicatorPresentation,assertIndicatorBatchBudget} from '../../src/chart/indicator-settings';
import {indicatorPlotNativeId} from '../../src/chart/indicator-rendering';
import {indicatorDecorationId} from '../../src/chart/indicator-presentation';
import {vwapIndicatorNativeHarness} from './vwap-indicator-native-harness';

const runner=await import(/* @vite-ignore */ pathToFileURL(resolve('.tmp/run-vwap-indicator-performance.mjs')).href);
const requestedCase=process.env.LV_VWAP_CASE??'default';
if(!['default','all7'].includes(requestedCase))throw Error('Unsupported fixed VWAP performance case.');
const all=requestedCase==='all7',count=all?60606:100000;
const output=runner.checkedRawPath(process.env.LV_VWAP_REPORT??`reports/vwap-native-performance-${new Date().toISOString().replace(/[^0-9]/g,'')}-${randomUUID().slice(0,8)}-${requestedCase}-raw.json`);
const files:readonly string[]=runner.MEASURED_FILES;
const hashes=()=>Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
const errorText=(error:unknown)=>{try{return(error instanceof Error?error.message:String(error)).slice(0,2048);}catch{return 'Unprintable performance error';}};

it('records the complete owned native v2 route without treating unavailable output as numerical success',async()=>{
 const report:Record<string,any>={schemaVersion:2,notice:'SYNTHETIC constant-price, varying-volume source/model experiment. Actual compiled production worker executes on a separate Node thread. Controlled native ancillary sinks; no browser/package/GUI/font/raster/reference evidence.',started:new Date().toISOString(),status:'initializing',configuration:{case:all?'all7-near-cap':'default',rows:count,plots:all?7:1,fills:all?3:0,coldRecordedSamples:1,warmups:0,all7At100000Admitted:false,productionDeadlineMs:60000,blockingGateMs:50,heartbeatGateMs:50,heartbeatPeriodMs:10,prices:'all raw OHLC exactly10',volume:'1+(ordinal%23)',cadenceSeconds:60,transform:'standard',anchor:'Session',timezone:'UTC'},hashes:hashes(),phases:[]};
 let reportCreated=false;
 const persist=()=>{mkdirSync(resolve('reports'),{recursive:true});const text=JSON.stringify(report,null,2)+'\n';if(Buffer.byteLength(text)>8*1024*1024)throw Error('Raw performance report exceeds8MiB.');writeFileSync(output,text,{flag:reportCreated?'w':'wx'});reportCreated=true;};
 persist();
 type Termination={fulfilled:true;code:number}|{fulfilled:false;error:unknown};
 type OwnedWorker={worker:NodeWorker;exitObserved:boolean;exitCode:number|null;requests:Promise<Termination>[];errors:unknown[]};
 const workers:OwnedWorker[]=[],transport={postRows:[] as number[],postBytes:[] as number[],workerMessages:0,terminations:0};
 const requestTermination=(owned:OwnedWorker)=>{
  if(owned.requests.length>=4)throw Error('Too many termination requests for the fixed worker.');
  // Observe rejection immediately even though the production transport is void.
  const request=owned.worker.terminate().then<Termination,Termination>(code=>({fulfilled:true,code}),error=>({fulfilled:false,error}));
  owned.requests.push(request);return request;
 };
 let h:Awaited<ReturnType<typeof vwapIndicatorNativeHarness>>|undefined,client:ReturnType<typeof createVwapClient>|undefined,routeStarted=false;
 let failure:unknown,failed=false;
 const cleanupErrors:unknown[]=[];
 let deadline=performance.now()+10,maxLate=0,missed=0,ticks=0;
 const heartbeat=setInterval(()=>{const now=performance.now(),late=Math.max(0,now-deadline);maxLate=Math.max(maxLate,late);missed+=Math.floor(late/10);ticks++;deadline=now+10;},10);
 const phase=async(name:string,action:()=>unknown|Promise<unknown>,kind:'sync'|'async-elapsed')=>{
  if(report.phases.length>=6)throw Error('Unexpected extra performance phase.');
  const row:Record<string,any>={name,kind,status:'running',started:new Date().toISOString()};report.phases.push(row);persist();const start=performance.now();
  try{const value=action();if(kind==='async-elapsed')await value;row.elapsedMs=performance.now()-start;row.status='complete';if(kind==='sync')row.blockingPass=row.elapsedMs<=50;}
  catch(error){row.elapsedMs=performance.now()-start;row.status='failed';row.error=errorText(error);throw error;}
  finally{persist();}
 };
 try{
  await new Promise(resolve=>setTimeout(resolve,20));
  let url!:URL;
  await phase('compile-fixed-production-worker',async()=>{
   const bundle=await build({configFile:false,logLevel:'silent',build:{write:false,minify:true,lib:{entry:resolve('src/vwap/worker.ts'),formats:['es'],fileName:'vwap-worker'}}});
   const chunks=(Array.isArray(bundle)?bundle:[bundle]).flatMap(item=>'output'in item?item.output:[]).filter(item=>item.type==='chunk');
   if(chunks.length!==1)throw Error('Expected one fixed worker chunk.');
   const code=chunks[0].code;
   report.workerBundleSha256=createHash('sha256').update(code).digest('hex');report.workerBundleBytes=Buffer.byteLength(code);
   const encoded='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
   const bridge=`import {parentPort} from 'node:worker_threads';globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);parentPort.on('message',data=>globalThis.onmessage?.({data}));await import(${JSON.stringify(encoded)});`;
   report.executedWorkerArtifacts=[];
   for(const [role,text] of [['worker',code],['node-bridge',bridge]] as const){
    const path=output.replace(/-raw\.json$/,`-${role}.mjs`),bytes=Buffer.byteLength(text);
    if(bytes<1||bytes>8*1024*1024)throw Error('Executed worker artifact exceeds its byte bound.');
    writeFileSync(path,text,{flag:'wx'});
    report.executedWorkerArtifacts.push({role,path:'reports/'+basename(path),bytes,sha256:createHash('sha256').update(text).digest('hex'),meaning:role==='worker'?'Exact minified module used in the data URL':'Exact Node bridge used in the Worker data URL'});
   }
   url=new URL('data:text/javascript;base64,'+Buffer.from(bridge).toString('base64'));
  },'async-elapsed');
  client=createVwapClient({factory():VwapWorkerPort{
   if(workers.length>=1)throw Error('Unexpected additional worker acquisition.');
   const worker=new NodeWorker(url),owned:OwnedWorker={worker,exitObserved:false,exitCode:null,requests:[],errors:[]};workers.push(owned);
   worker.once('exit',code=>{owned.exitObserved=true;owned.exitCode=code;});
   worker.on('error',error=>{if(owned.errors.length<8)owned.errors.push(error);});
   const listeners=new Map<(event:any)=>void,{type:string;wrapped:(value:any)=>void}>();
   return{
    postMessage(message:any,transfer){if(transport.postRows.length>=2)throw Error('Unexpected repeated worker transfer.');transport.postRows.push(message.rows);transport.postBytes.push(message.buffer.byteLength);worker.postMessage(message,transfer as ArrayBuffer[]);},
    addEventListener(type,listener){if(listeners.size>=4)throw Error('Too many worker transport listeners.');const wrapped=type==='message'?(data:unknown)=>{transport.workerMessages++;listener({data});}:listener;listeners.set(listener,{type,wrapped});worker.on(type,wrapped);},
    removeEventListener(_type,listener){const row=listeners.get(listener);if(row){worker.off(row.type,row.wrapped);listeners.delete(listener);}},
    terminate(){transport.terminations++;requestTermination(owned);}
   };
  }});
  let rows:Bar[]=[];
  await phase('synthetic-source-production',()=>{rows=Array.from({length:count},(_,index)=>({time:1700000000+index*60,open:10,high:10,low:10,close:10,volume:1+index%23}));},'sync');
  await phase('native-harness-module-setup-and-private-input-copy',async()=>{h=await vwapIndicatorNativeHarness(rows,client);},'async-elapsed');
  if(!h)throw Error('The owned native performance fixture did not initialize.');
  const inputs={...VWAP_BAND_DEFAULTS,kernelVersion:2,source:'hlc3',band1Enabled:all,band2Enabled:all,band3Enabled:all};
  report.publicationSlots=indicatorEstimatedSlots('vwap',count,inputs,defaultIndicatorPresentation('vwap'));
  expect(report.publicationSlots).toBe(all?1999998:300000);
  if(all){expect(()=>assertIndicatorBatchBudget([{kind:'vwap',inputs,presentation:defaultIndicatorPresentation('vwap')}],100000)).toThrow(/limits/);report.all7At100000RejectedBeforeMutation=true;}
  report.setupHeartbeat={maxLatenessMs:maxLate,missedIntervals:missed,ticks};
  await new Promise(resolve=>setTimeout(resolve,20));maxLate=0;missed=0;ticks=0;deadline=performance.now()+10;
  let id='';const started=performance.now();routeStarted=true;
  // Keep the original awaited sync-phase microtask boundaries and report I/O.
  await phase('actual-native-setBars-input-ingress',()=>{h!.native.introPlayed=true;h!.renderer.setBars(h!.core.bars);},'sync');
  await phase('port-add-prefix-seal-pending-native-emission',()=>{id=h!.port.add('vwap',inputs);},'sync');
  report.status='waiting-current-native-publication';persist();
  await phase('queue-prepare-worker-validation-materialization-final-native-publication',()=>h!.port.waitForVwap(),'async-elapsed');
  report.routeElapsedMs=performance.now()-started;
  h.port.assertVwapReady();await new Promise(resolve=>setTimeout(resolve,20));
  report.routeHeartbeat={maxLatenessMs:maxLate,missedIntervals:missed,ticks,policy:'10ms; reset next deadline from each callback. Route starts after compiler/fixture setup and includes preparation through publication.'};
  const auditStart=performance.now(),result=h.port.values(id),view=h.port.list().find(row=>row.id===id)!;
  const native=h.native.scene.indicators.get(view.rendererId),expected:Record<string,number>={vwap:10,upper1:10.1,lower1:9.9,upper2:10.2,lower2:9.8,upper3:10.3,lower3:9.7};
  const pointCheck=(series:any,value:number)=>series?.points?.length===count&&series.points.every((point:any,index:number)=>point.time===(1700000000+index*60)*1000&&point.value===value);
  const active=all?['vwap','upper1','lower1','upper2','lower2','upper3','lower3']:['vwap'];
  const nativePlotsComplete=active.every(plot=>pointCheck(native.series.find((series:any)=>series.id===indicatorPlotNativeId(id,'vwap',plot)),expected[plot]));
  const nativeFillsComplete=native.fills.length===(all?3:0)&&(!all||[1,2,3].every(pair=>{const fill=native.fills.find((fill:any)=>fill.id===indicatorDecorationId(id,`fill:band${pair}`));return fill&&pointCheck(native.series.find((series:any)=>series.id===fill.fromSeriesId),expected['lower'+pair])&&pointCheck(native.series.find((series:any)=>series.id===fill.toSeriesId),expected['upper'+pair]);}));
  const domainComplete=result.series.length===active.length&&result.series.every(plot=>plot.values.length===count&&plot.values.every(value=>value===expected[plot.id]));
  const callerUntouched=!Object.isFrozen(rows)&&rows.every((row,index)=>!Object.isFrozen(row)&&row.time===1700000000+index*60&&row.open===10&&row.high===10&&row.low===10&&row.close===10&&row.volume===1+index%23);
  const numericalComplete=domainComplete&&nativePlotsComplete&&nativeFillsComplete&&native.series.length===(all?13:1)&&view.informationBars===count&&view.latestInformationTime===1700000000+(count-1)*60&&h.quarantines.length===0&&result.diagnostics.length===0&&Object.values(result.plotDiagnostics??{}).every(values=>values.length===0)&&view.presentationDiagnostics.length===0;
  report.result={acceptedReady:true,numericalComplete,callerUntouched,auditChecks:{domainComplete,nativePlotsComplete,nativeFillsComplete},diagnostics:result.diagnostics,plotDiagnostics:result.plotDiagnostics??{},presentationDiagnostics:view.presentationDiagnostics,domainPlots:result.series.map(plot=>({id:plot.id,rows:plot.values.length,first:plot.values[0],last:plot.values.at(-1)})),nativeSeries:native.series.map((series:any)=>({id:series.id,title:series.title,points:series.points?.length??0,first:series.points?.[0],last:series.points?.at(-1)})),nativeFills:native.fills.length,informationBars:view.informationBars,latestInformationTime:view.latestInformationTime,quarantines:h.quarantines.length};
  report.auditMs=performance.now()-auditStart;
  const entryNames=['actual-native-setBars-input-ingress','port-add-prefix-seal-pending-native-emission'];
  const entryPhases=report.phases.filter((row:any)=>entryNames.includes(row.name));
  for(const name of entryNames)expect(entryPhases.filter((row:any)=>row.name===name)).toHaveLength(1);
  report.gates={numericalComplete,entryBlocking:entryPhases.length===2&&entryPhases.every((row:any)=>row.blockingPass===true),routeHeartbeat:maxLate<=50,responsivenessAdmitted:false,wholePlanComplete:false};
  report.limits=['One cold sample per case; no statistical latency admission.','Original phase report I/O and awaited phase boundaries remain; no method wrappers are installed.','Preparation, worker, host validation, materialization and native emission are not individually isolated. No GC or exclusive timer attribution.','Compiled worker uses a Node bridge; termination request return is not shutdown confirmation. Cleanup awaits the owned termination promises and observed worker exit.','Constant-price varied-volume synthetic workload. Broader numerical oracle evidence is separate.','Numerical/native/caller audit and cleanup are outside route elapsed and the captured route heartbeat.','Listed measured inputs are not a self-contained dependency closure.'];
  expect(report.phases).toHaveLength(6);expect(ticks).toBeGreaterThan(0);
  expect(transport.postRows).toEqual([count]);expect(transport.postBytes).toEqual([count*48]);expect(transport.workerMessages).toBe(2);expect(transport.terminations).toBe(1);
  expect(numericalComplete).toBe(true);expect(callerUntouched).toBe(true);
 }catch(error){failed=true;failure=error;report.error=errorText(error);report.status='failed';if(routeStarted)report.partialRouteHeartbeat={maxLatenessMs:maxLate,missedIntervals:missed,ticks};}
 finally{
  clearInterval(heartbeat);
  const cleanupStart=performance.now(),workerCleanup:Array<Record<string,unknown>>=[];
  try{h?.dispose();}catch(error){cleanupErrors.push(error);}
  try{client?.dispose();}catch(error){cleanupErrors.push(error);}
  for(const owned of workers){
   const row:Record<string,unknown>={confirmed:false};workerCleanup.push(row);
   try{requestTermination(owned);}catch(error){cleanupErrors.push(error);row.requestError=errorText(error);}
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const requests=await Promise.race([Promise.all(owned.requests),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),5000);})]);
    if(requests===null){cleanupErrors.push(Error('Worker shutdown is unconfirmed after5000ms.'));row.timedOut=true;}
    else{for(const request of requests)if(!request.fulfilled)cleanupErrors.push(request.error);row.confirmed=owned.exitObserved&&requests.length>0&&requests.every(request=>request.fulfilled);if(!row.confirmed)cleanupErrors.push(Error('Worker shutdown was not confirmed.'));}
   }catch(error){cleanupErrors.push(error);row.cleanupError=errorText(error);}
   finally{if(timer!==undefined)clearTimeout(timer);if(row.confirmed!==true)try{owned.worker.unref();}catch(error){cleanupErrors.push(error);row.unrefError=errorText(error);}}
   cleanupErrors.push(...owned.errors);row.exitObserved=owned.exitObserved;row.exitCode=owned.exitCode;row.requests=owned.requests.length;
  }
  report.cleanup={elapsedMs:performance.now()-cleanupStart,errors:cleanupErrors.map(errorText),workersCreated:workers.length,workersConfirmed:workerCleanup.filter(row=>row.confirmed===true).length,workerShutdownConfirmed:workers.length===1&&workerCleanup.every(row=>row.confirmed===true),workers:workerCleanup};
  report.transport=transport;report.ended=new Date().toISOString();
  try{report.endHashes=hashes();report.sourceStable=Object.entries(report.hashes).every(([file,hash])=>report.endHashes[file]===hash);}catch(error){report.sourceStable=false;cleanupErrors.push(error);report.cleanup.errors=cleanupErrors.map(errorText);}
  if(!failed&&cleanupErrors.length===0&&report.sourceStable&&report.cleanup.workerShutdownConfirmed)report.status='complete';else report.status='failed';
  persist();
 }
 if(failed||cleanupErrors.length)throw new AggregateError([...(failed?[failure]:[]),...cleanupErrors],'The complete native VWAP measurement failed; see preserved raw causes.');
 expect(report.sourceStable).toBe(true);expect(report.cleanup.workerShutdownConfirmed).toBe(true);expect(report.cleanup.errors).toEqual([]);
},110000);
