import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import type {Bar} from '../../src/domain/types';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset,sameChartSourceBasis} from '../../src/chart/source-context';
import {barInputIdentity} from '../../src/chart/bar-input-identity';
import {heikinAshiBars} from '../../src/chart/calculation-bars';
import {isDerivedStyle} from '../../src/chart/derived/common';
import {createScriptPort} from '../../src/chart/script-port';
import type {PaneRegistry} from '../../src/chart/pane-registry';
import {captureScriptPresentationInputFrame,scriptPresentationNumber,retireScriptPresentationPort,renewScriptPresentationPort} from '../../src/chart/script-presentation-proof';
import type {ScriptBinding} from '../../src/ui/script-library';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import type {executeScriptOnBars,ScriptResult} from '../../src/ui/script-jobs';

export const SYNTHETIC_BINDING:ScriptBinding={id:'synthetic-study',documentId:'synthetic-document',version:1,name:'Synthetic study',source:'({onBar(){}})',pane:'price',visible:true,plots:{}};
export const syntheticRows=():Bar[]=>[
 {time:100,open:10,high:14,low:6,close:12,volume:10},
 {time:160,open:12,high:20,low:8,close:16,volume:20},
 {time:220,open:16,high:22,low:12,close:18,volume:30},
];
export const syntheticResult=(values:[number,number|null][]=[[100,7],[160,null],[220,11]]):ScriptResult=>({plots:[{id:'lvplot:Value',title:'Value',color:'#123456',values:values.map(([time,value])=>({time,value}))}],orders:[],alerts:[],diagnostics:[],elapsedMs:1,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic literal output'}} as ScriptResult);
export const settle=async()=>{for(let index=0;index<6;index++)await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));};

/** Actual staged/main adapter host body in a Node-only synthetic producer. No app/native DOM or desktop. */
function producer(input:any,chart:any){
 const sourceRoot=process.env.LV_SCRIPT_PRESENTATION_SOURCE_ROOT??process.cwd(),text=readFileSync(resolve(sourceRoot,'src/chart/adapter.ts'),'utf8');
 const from=text.indexOf('  const scriptPresentationHost:ScriptPresentationHost='),to=text.indexOf('  const scripts=createScriptPort(',from);
 if(from<0)return{host:undefined,publish() {},setPending() {},setExecution() {},setDerived() {},bindPort() {},async rejectInput() {},close() {}};
 if(to<from)throw Error('Synthetic producer cannot locate the actual adapter host boundary.');
 const restoreFrom=text.indexOf('  const restoreRejectedVwapInput='),restore=text.slice(restoreFrom,text.indexOf('\n',restoreFrom));
 const host=text.slice(from,to),code=stripTypeScriptTypes(`function build(input,chart,tools){
 const {sameChartSourceBasis,isDerivedStyle,captureScriptPresentationInputFrame,scriptPresentationNumber,retireScriptPresentationPort,renewScriptPresentationPort}=tools;
 let currentBars=input.bars,currentSource=input.source,requestedStyle=input.style,currentExecutionIdentity='ordinary',vwapSourceEpoch={},exactInput=input.bars,derivedMemo=null;
 let disposed=false,analysisUnavailable=null,analysisPending=0,marketUpdating=false,pending=false;
 const marketQueue={isPending:()=>pending};
 const controller={isInputExact:value=>value.bars===exactInput&&value.style===requestedStyle&&sameChartSourceBasis(currentSource,value.source,true)};
 const analysisPublication={captureOwner(){const source=currentSource,bars=currentBars,style=requestedStyle,epoch=vwapSourceEpoch,execution=currentExecutionIdentity;return{isCurrent:()=>!disposed&&source===currentSource&&bars===currentBars&&style===requestedStyle&&epoch===vwapSourceEpoch&&execution===currentExecutionIdentity,quarantine(){}};}};
 let scripts;const indicators={recompute(){}};
 ${host}
 ${restore}
 return{host:scriptPresentationHost,bindPort(value){scripts=value;},async rejectInput(){vwapSourceEpoch={};retireScriptPresentationPort(scripts);const epoch=vwapSourceEpoch;return restoreRejectedVwapInput(Promise.resolve({ok:false,diagnostic:{message:'Synthetic rejected input'}}),epoch);},publish(next){currentBars=next.bars;currentSource=next.source;requestedStyle=next.style;exactInput=next.bars;vwapSourceEpoch={};},setPending(value){pending=value;},setExecution(value){currentExecutionIdentity=value;vwapSourceEpoch={};},setDerived(value){derivedMemo=value;},close(){disposed=true;vwapSourceEpoch={};}};
 }`,{mode:'transform'});
 const build=new Function(code+';return build;')();return build(input,chart,{sameChartSourceBasis,isDerivedStyle,captureScriptPresentationInputFrame,scriptPresentationNumber,retireScriptPresentationPort,renewScriptPresentationPort});
}

export function scriptPresentationFixture(options:{live?:boolean;style?:string;host?:boolean}={}){
 const dataset=fixtureDataset('GME',3);dataset.bars=syntheticRows();
 if(options.live){dataset.provenance={...dataset.provenance,datasetId:'live:alpaca-iex:SYNTHETIC',providerId:'alpaca-iex',fixture:false};}
 let input={bars:dataset.bars,source:sourceContextForDataset(dataset),style:options.style??'candles'};
 const calculations=()=>input.style==='heikinashi'?heikinAshiBars(input.bars):input.bars.map(row=>({...row}));
 let sequence=0,fail=0,barReads=0;const events=new Map<string,Set<(event:any)=>void>>(),live=new Map<string,any>();
 const scene={indicators:new Map<string,any>(),panes:new Map<string,any>([['price',{id:'price'}]])},core={bars:calculations().map(row=>({...row,time:row.time*1000})),registry:{records:new Map<string,any>()},handles:new Map<string,any>(),renderer:{scene}};
 const fire=(event:string,value:any)=>{for(const callback of [...events.get(event)??[]])callback(value);};
 const chart:any={orchestrator:core,on(event:string,callback:(event:any)=>void){const rows=events.get(event)??new Set();rows.add(callback);events.set(event,rows);return()=>rows.delete(callback);},addNativeIndicator(type:string){
  const descriptor=getNativeIndicator(type)!;const model:any=descriptor.create(),id='synthetic-native-'+(++sequence),record:any={native:{type,descriptor,instance:model},hidden:false,model:null,renderHandle:null};
  const handle={id,remove(){model.stop();live.delete(id);core.registry.records.delete(id);core.handles.delete(id);scene.indicators.delete(id);fire('indicator:removed',{id});},setVisible(value:boolean){record.hidden=!value;if(value){scene.indicators.set(id,record.model);model.resume();}else{model.suspend();scene.indicators.delete(id);}fire('indicator:visibility',{id,visible:value});},moveTo(target:any){const paneId=target?.pane??'synthetic-pane-'+sequence;scene.panes.set(paneId,{id:paneId});record.model.paneId=paneId;fire('indicator:moved',{id,paneId});}};
  core.registry.records.set(id,record);core.handles.set(id,handle);live.set(id,model);
  const ctx={id,bars(){barReads++;return core.bars;},emit(output:any){if(fail){fail--;throw Error('Synthetic native emission failed.');}const paneId=record.model?.paneId??'price';record.model={id,paneId,native:{type},...output};record.renderHandle={id,emission:{}};if(!record.hidden)scene.indicators.set(id,record.model);}};
  model.start(ctx,descriptor.defaultInputs());return handle;
 }};
 const produced=producer(input,chart),panes:any={info(handle:any){const record=core.registry.records.get(handle.id);return record?.model?{id:record.model.paneId,indicators:[{id:handle.id,ownScale:false}]}:undefined;},bind(handle:any,paneId:string){const record=core.registry.records.get(handle.id);scene.panes.set(paneId,{id:paneId});record.model.paneId=paneId;},renderer:(id:string)=>id,logical:(id:string)=>id};
 const port=createScriptPort(chart as Vela,panes as PaneRegistry,undefined,options.host===false?undefined:produced.host);
 produced.bindPort(port);
 let bindings=[structuredClone(SYNTHETIC_BINDING)],runtime:ScriptBindingRuntime|undefined;
 const pending:Array<{input:any;resolve:(value:any)=>void;reject:(error:unknown)=>void}>=[],execute:typeof executeScriptOnBars=value=>new Promise((resolve,reject)=>pending.push({input:value,resolve,reject}));
 const csvOwner={get input(){return input;},execution:'ordinary',assertCurrent(binding:ScriptBinding){if(!bindings.some(row=>row.id===binding.id&&row.source===binding.source&&JSON.stringify(row.inputs??null)===JSON.stringify(binding.inputs??null)))throw Error('Synthetic effective binding changed.');}};
 const context=()=>({bars:calculations(),identity:'synthetic-input-'+input.source.revision+input.style,fixture:input.source.fixture,bindings,ready:true,csvJobOwner:csvOwner});
 return{
  dataset,chart,core,port,pending,produced,csvOwner,context,model:()=>[...live.values()][0],allModels:()=>[...live.values()],get barReads(){return barReads;},get input(){return input;},get bindings(){return bindings;},
  runtime(onResult:()=>void=()=>{}){return runtime??=new ScriptBindingRuntime(port,()=>{},onResult,execute);},
  setBindings(value:ScriptBinding[]){bindings=value;},
  complete(index=0,result=syntheticResult()){pending[index].resolve({result,barIds:pending[index].input.bars.map((_:unknown,i:number)=>'synthetic-'+i)});},
  publish(rows:Bar[],source=input.source){retireScriptPresentationPort(port);input={bars:rows,source:{...source,inputIdentity:barInputIdentity(rows)},style:input.style};produced.publish(input);core.bars=calculations().map(row=>({...row,time:row.time*1000}));for(const model of [...live.values()])model.onBars();},
  nativeOnly(rows:Bar[]){core.bars=rows.map(row=>({...row,time:row.time*1000}));for(const model of [...live.values()])model.onBars();},
  move(){const model=[...live.values()][0];model.handle.moveTo({pane:'synthetic-other-pane'});},
  fail(count=1){fail=count;},close(){runtime?.dispose();port.dispose();produced.close();},
 };
}
