import {createRequire} from 'node:module';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import {csvModelFixture} from './r42-csv-model';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createScriptPort} from '../../src/chart/script-port';
import type {PaneRegistry} from '../../src/chart/pane-registry';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import {executeScriptOnBars,ScriptJobQueue,type ScriptResult} from '../../src/ui/script-jobs';
import {scriptExecutionIdentity} from '../../src/ui/script-input';
import {scriptCsvBindingKey} from '../../src/chart/script-csv-job-proof';
import {captureChartCsvColumns} from '../../src/chart/chart-csv-capture';
import {chartSourceCsv} from '../../src/ui/chart-source-export';
import {createDatasetRequestResolver,type ScriptRequestDeclaration,type ScriptRequestResolver,type ScriptSymbolLoader} from '../../src/ui/script-requests';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {BarDataset} from '../../src/domain/types';

export const H=3600,D=86400,T0=D*20000;
export const DEP={id:'dep',symbol:'SPY',interval:'1D'} satisfies ScriptRequestDeclaration;
let sequence=0;
export function dependencyDataset(kind:'local'|'synthetic'|'live'|'unknown'='local',resolution='1D'):BarDataset{
 const value=fixtureDataset('SPY',2),step=resolution==='1D'?D:H,count=resolution==='1D'?2:48;value.resolution=resolution;
 value.bars=Array.from({length:count},(_,index)=>{const close=resolution==='1D'?1000+100*index:100+index;return {time:T0+index*step,open:close,high:close+1,low:close-1,close,volume:10};});
 if(kind==='local')Object.assign(value.provenance,{providerId:'local-import',providerName:'Synthetic local import',datasetId:'local:SPY',fixture:false});
 if(kind==='live')Object.assign(value.provenance,{providerId:'alpaca-iex',providerName:'Synthetic live-policy fixture',datasetId:'live:synthetic-policy:SPY',fixture:false});
 if(kind==='unknown')Object.assign(value.provenance,{providerId:'unknown-policy',providerName:'Synthetic unknown provider',datasetId:'unknown:SPY',fixture:true});return value;
}
export const settle=async()=>{for(let index=0;index<12;index++)await new Promise(resolve=>setTimeout(resolve,0));};
export function scriptDepsHarness(options:{dataset?:BarDataset;resolver?:ScriptRequestResolver;loader?:ScriptSymbolLoader;worker?:boolean;declarations?:ScriptRequestDeclaration[];finalRequests?:ScriptRequestDeclaration[];defer?:boolean}={}){
 const data=fixtureDataset('GME',4);data.resolution='60m';data.bars=[0,23,24,47].map(hour=>({time:T0+hour*H,open:10,high:15,low:9,close:12,volume:100}));
 const f=csvModelFixture(data,data.bars,'candles'),sourceDataset=options.dataset??dependencyDataset(),declarations=options.declarations??[DEP];
 let current=true,fail=false,nativeSequence=0,executeCount=0,resolverCount=0,disposed=false,activeBindings:ScriptBinding[]=[];
 const events=new Map<string,Set<(value:any)=>void>>(),instances=new Map<string,any>(),payloads:any[]=[],pending:Array<{payload:any;resolve:(value:any)=>void}>=[];
 const native=f.chart.chart as any;
 native.on=(event:string,callback:(value:any)=>void)=>{const values=events.get(event)??new Set();values.add(callback);events.set(event,values);return()=>values.delete(callback);};
 native.addNativeIndicator=(type:string)=>{
  const descriptor=getNativeIndicator(type)!,instance=descriptor.create(),id='synthetic-native-script-'+(++nativeSequence);instances.set(id,instance);
  const record:any={id,native:{type,descriptor,instance},hidden:false},handle={id,setVisible(value:boolean){record.hidden=!value;value?instance.resume():instance.suspend();},moveTo(){},remove(){instance.stop();instances.delete(id);f.records.delete(id);f.models.delete(id);for(const callback of events.get('indicator:removed')??[])callback({id});}};record.renderHandle=handle;f.records.set(id,record);
  const ctx={bars:()=>f.core.bars,emit(output:any){if(fail){fail=false;throw Error('Synthetic native emission failed');}const model={id,native:{type},paneId:'price',series:output.series??[]};record.model=model;f.models.set(id,model);}};
  instance.start(ctx as any,descriptor.defaultInputs());return handle;
 };
 const port=createScriptPort(native as Vela,{info:()=>undefined} as unknown as PaneRegistry);(f.chart as any).scripts=port;
 const source='({requests:'+JSON.stringify(Object.fromEntries(declarations.map(({id,symbol,interval})=>[id,{...(symbol===null?{}:{symbol}),...(interval===null?{}:{interval})}])) )+",onBar(ctx){const x=ctx.request('dep');ctx.plot('Requested close',x?x.close:null);}}) /* Synthetic original "+(++sequence)+' */';
 const binding:ScriptBinding={id:'synthetic-dependent-script',documentId:'synthetic-document',version:1,name:'Synthetic requested study',source,pane:'price',visible:true,plots:{}};activeBindings=[binding];
 const resolver=options.resolver??createDatasetRequestResolver({datasets:[f.data,...(options.loader?[]:[sourceDataset])],load:options.loader??null}),countedResolver:ScriptRequestResolver=(request,base)=>{resolverCount++;return resolver(request,base);};
 const execution=scriptExecutionIdentity(f.input.source,f.input.style,'ordinary');
 const response=(payload:any)=>({ok:true,value:{plots:payload.bars.length?[{id:'requested',title:'Requested close',color:'#123456',values:payload.bars.map((row:any,index:number)=>({time:row.time,value:payload.requests?.dep?.[index]?.close??null}))}]:[],orders:[],alerts:[],diagnostics:[],elapsedMs:0,provisional:false,state:null,inputs:payload.inputs??{},declarations:{inputs:[],requests:structuredClone(payload.bars.length?options.finalRequests??declarations:declarations)},provenance:payload.provenance} as ScriptResult});
 const realJobs=options.worker?new(createRequire(new URL('../../package.json',import.meta.url))('./electron/script-jobs.cjs').ScriptJobs)():null;
 const bridge={executeScript(payload:any){executeCount++;payloads.push(payload);if(realJobs)return realJobs.run(payload);if(options.defer&&payload.bars.length)return new Promise(resolve=>pending.push({payload,resolve}));return Promise.resolve(response(payload));},cancel:async({requestId}:{requestId:string})=>({ok:true,value:{cancelled:realJobs?.cancel(requestId)??false}})};
 let completion:Awaited<ReturnType<typeof executeScriptOnBars>>|undefined;
 const execute:typeof executeScriptOnBars=input=>executeScriptOnBars({...input,bridge:bridge as any,queue:new ScriptJobQueue(1),request:{base:input.request!.base,resolver:countedResolver}}).then(value=>{completion=value;return value;});
 let onResult:(()=>void)|undefined;const runtime=new ScriptBindingRuntime(port,()=>{},()=>onResult?.(),execute),csvJobOwner={input:f.input,execution:'ordinary',assertCurrent(expected:ScriptBinding){const actual=activeBindings.find(row=>row.id===expected.id);if(!current||!f.chart.isInputCurrent(f.input)||!actual||scriptCsvBindingKey(actual)!==scriptCsvBindingKey(expected))throw Error('Synthetic script owner changed');}};
 const context=()=>({bars:f.input.bars,identity:execution,fixture:true,bindings:activeBindings,ready:true,requestBase:{datasetId:f.input.source.datasetId,resolution:f.input.source.resolution!,owner:'chart' as const},csvJobOwner});
 const capture=()=>captureChartCsvColumns(f.chart,f.input,'ordinary',{indicators:[],comparisons:[],scripts:activeBindings.map(row=>row.id)},()=>{if(!current)throw Error('Synthetic source retired');});
 return {f,port,runtime,binding,data:f.data,sourceDataset,payloads,pending,context,capture,csv(){const value=capture();return chartSourceCsv(f.input,'ordinary',value.columns,value.assertCurrent);},response,
  get executeCount(){return executeCount;},get resolverCount(){return resolverCount;},get completion(){return completion;},model:()=>[...instances.values()][0],
  async ready(){for(let index=0;index<500;index++){if(port.list()[0]?.plotDescriptors.length)return;await new Promise(resolve=>setTimeout(resolve,2));}throw Error('Synthetic script did not finish its accepted calculation');},
  start(){runtime.update(context());},finish(){const job=pending.shift();if(!job)throw Error('No pending synthetic response');job.resolve(response(job.payload));},retire(){current=false;},setBindings(value:ScriptBinding[]){activeBindings=value;runtime.update(context());},onResult(callback:()=>void){onResult=callback;},failEmission(){fail=true;},
  dispose(){if(disposed)return;disposed=true;runtime.dispose();port.dispose();realJobs?.close();f.dispose();},
 };
}
