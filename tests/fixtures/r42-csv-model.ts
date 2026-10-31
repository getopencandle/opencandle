import {captureScriptCsvJobProof,stageScriptCsvJobResult,bindScriptCsvJobModel,acceptScriptCsvJobProof} from '../../src/chart/script-csv-job-proof';
import {NativeRenderer,registerNativeIndicator,unregisterNativeIndicator,type NativeIndicatorDescriptor} from '@luxalgo/vela';
import {registerIndicatorDisplayPort} from '../../src/chart/indicator-display-source';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {scriptOutputs} from '../../src/ui/script-outputs';
import type {ChartController} from '../../src/chart/adapter';
import type {ChartInputSnapshot} from '../../src/chart/input-visibility';
import type {BarDataset,Bar} from '../../src/domain/types';

// Synthetic canonical native model shape, no DOM/mount/file dialog or GUI claim. Numerical arrays below are literal oracles.
let sequence=0;
export function csvModelFixture(supplied?:BarDataset,suppliedBars?:Bar[],style='heikinashi'){
 const data=supplied?{...supplied,bars:suppliedBars??supplied.bars}:fixtureDataset('GME',3);if(!supplied)data.bars=[10,14,12].map((close,index)=>({time:[100,160,400][index],open:close,high:close+1,low:close-1,close,volume:100}));
 const source=sourceContextForDataset(data),input:ChartInputSnapshot={bars:data.bars,source,style},records=new Map<string,any>(),models=new Map<string,any>(),panes=new Map([['price',{id:'price'}]]),renderer=Object.create(NativeRenderer.prototype),nativeBars=data.bars.map(row=>({...row,time:row.time*1000}));
 renderer.scene={indicators:models,panes};const registry={get(id:string){return records.get(id);},all(){return [...records.values()];}},core={registry,renderer,bars:nativeBars},native={orchestrator:core},lists:any[][]=[[],[],[]];
 const ports=lists.map(rows=>({list:()=>structuredClone(rows)})),indicators=ports[0],comparisons=ports[1],scripts=ports[2],release=registerIndicatorDisplayPort(indicators,native,()=>[]),types:string[]=[];
 let current=true,execution='ordinary',range={from:data.bars[0].time,to:data.bars.at(-1)!.time};
 const chart={chart:native,indicators,comparisons,scripts,nativeRenderer:()=>renderer,isInputCurrent:(value:ChartInputSnapshot)=>current&&value.bars===input.bars&&value.source.basisIdentity===input.source.basisIdentity&&value.style===input.style,getExecutionIdentity:()=>execution,getStyle:()=>input.style,getSourceContext:()=>source,getViewport:()=>range,getDataWindow:()=>({pending:!current,source,series:{count:data.bars.length,firstTime:data.bars[0].time,lastTime:data.bars.at(-1)!.time,style:input.style},standard:{index:data.bars.length-1,bar:data.bars.at(-1)!,hovered:false},displayed:{index:data.bars.length-1,bar:data.bars.at(-1)!,hovered:false},readout:{groups:[]},crosshair:null})} as unknown as ChartController;
 const inventory=()=>({indicators:lists[0].map(row=>row.id),comparisons:lists[1].map(row=>row.id),scripts:lists[2].map(row=>row.id)});
 function add(category:0|1|2,title:string,series:any[],extra:any={}){
  const id='synthetic-instance-'+(++sequence),rendererId='synthetic-renderer-'+sequence,type='synthetic-csv:'+sequence,settings={id},instance:any={settings,ctx:{bars:()=>core.bars},removed:false,displayInput:core.bars,acceptedOutput:{series},result:{plots:series.map(row=>({id:row.id,title:row.title,values:row.points?.map((point:any)=>({time:point.time/1000,value:point.value}))??[]}))}},descriptor:NativeIndicatorDescriptor={type,title,paneHint:'price',overlay:true,inputsSchema:()=>[],defaultInputs:()=>({}),create:()=>instance};
  registerNativeIndicator(descriptor);types.push(type);const model={id:rendererId,native:{type},paneId:'price',series},record={id:rendererId,native:{type,instance,descriptor},model,renderHandle:{id:rendererId},hidden:false};records.set(rendererId,record);models.set(rendererId,model);
  const row:any=category===0?{id,rendererId,kind:'sma',inputs:{length:2},series:series.map(item=>({id:item.id,label:item.title}))}:category===1?{id,rendererId,dataset:fixtureDataset('SPY',3),mode:'percent',placement:'new-scale'}:{id,rendererId,title,plotDescriptors:series.map(({points,...item})=>item),provenance:{kind:'synthetic'}};
  Object.assign(settings,category===0?{kind:row.kind,inputs:row.inputs}:category===1?{dataset:row.dataset,mode:row.mode,placement:row.placement}:{title:row.title},extra);lists[category].push(settings);
  if(category===2){const binding={id,name:title,source:'Synthetic original script',documentId:'synthetic-document',version:1,pane:'price' as const,visible:true,plots:{}},proof=captureScriptCsvJobProof({input,execution:'ordinary',assertCurrent(){if(!current||execution!=='ordinary')throw Error('Synthetic script job retired');}},binding,data.bars);stageScriptCsvJobResult(instance.result,proof);bindScriptCsvJobModel(instance,instance.result);acceptScriptCsvJobProof(proof);}
  return {id,rendererId,type,instance,descriptor,model,record,row:lists[category].at(-1)};
 }
 const line=(title:string,values:readonly (number|null)[],times=[100,160,400])=>({id:'synthetic-plot-'+(++sequence),title,kind:'line',paneId:'price',visible:false,display:{pane:false,dataWindow:true},points:values.map((value,index)=>({time:times[index]*1000,value})),style:{color:'#123456',width:1,lineStyle:'solid'}});
 return {data,input,chart,core,registry,records,renderer,models,panes,lists,inventory,add,line,source,
  retire(){current=false;},setExecution(value:string){execution=value;},setRange(value:{from:number;to:number}){range=value;},
  publishScript(id:string,requests:any[]=[],plots:any[]=[]){scriptOutputs.publish(scripts,{bindingId:id,title:'Synthetic script',source:'synthetic original fixture',inputs:{},savedInputs:null,declarations:{inputs:[],requests},conditions:[],alertNames:[],plots});},
  dispose(){release();scriptOutputs.clear(scripts);for(const type of types)unregisterNativeIndicator(type);},
 };
}
