import {vi} from 'vitest';
import {all,mountControlledComponent} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState,resizeMultiChartState,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {ScriptBindingsRunner} from '../../src/ui/ScriptBindingsRunner';
import {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import {scriptExecutionIdentity} from '../../src/ui/script-input';
import type {ScriptBinding} from '../../src/ui/script-library';
import type {BarDataset,Bar} from '../../src/domain/types';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
import {chartInputCommitted,type ChartInputSnapshot} from '../../src/chart/input-visibility';
import {publishLiveDataset,registerLiveDataset} from '../../src/ui/live-registry';
import {createGridTreeCoordinator,type GridCellReadiness} from '../../src/chart/grid-tree-coordinator';
import type {ChartController} from '../../src/chart/adapter';

// Actual private GridCell/hooks and real registry, Runtime and tree coordinator.
// Native acceptance/placement is controlled; no browser/SDK/App/UI claim.
export function liveData(symbol='GME',revision='1'):BarDataset{
 const base=fixtureDataset(symbol,3),datasetId='live:SYNTHETIC-staging-'+symbol+':30m';
 const bars:Bar[]=[0,1,2].map(index=>({time:1792510200+index*1800,open:10,high:20,low:5,close:12+index,volume:100+index}));
 stampLiveLineage(bars,datasetId+'|'+revision,1);
 return{...base,resolution:'30m',bars,provenance:{...base.provenance,datasetId,fixture:true,revision,coverage:'SYNTHETIC thirty-minute staging exercise'}};
}
export function newer(data:BarDataset,sequence:number,append=false):BarDataset{
 const bars=data.bars.map(row=>({...row}));if(append)bars.push({...bars.at(-1)!,time:bars.at(-1)!.time+1800});
 bars[bars.length-1]={...bars.at(-1)!,close:14+sequence/100,volume:100+sequence};
 stampLiveLineage(bars,data.provenance.datasetId+'|'+data.provenance.revision,sequence);
 return{...data,bars};
}
export const binding:ScriptBinding={id:'SYNTHETIC-staging-script',documentId:'synthetic-document',version:1,name:'Synthetic staging',source:'({onBar(){}})',pane:'price',paneId:null,ownScale:false,visible:true,plots:{}};
export function actualCell(data:BarDataset,staging=true,ownedState?:MultiChartState,cellId?:string){
 const state=ownedState??createMultiChartState(data,{appearance:defaultTheme.appearance});
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets:[data],activeBars:data.bars,activeDatasetId:data.provenance.datasetId,staging,onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const nodes=all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell');
 const node=cellId?nodes.find(value=>value.props.id===cellId):nodes[0];
 if(!node||typeof node.type!=='function')throw Error('Actual private GridCell not found');parent.dispose();
 let props:Record<string,unknown>={...node.props,staging};const component=node.type as (props:Record<string,unknown>)=>unknown;
 const ui=mountControlledComponent(()=>component(props));ui.settle();
 const only=(type:unknown)=>{const rows=all(ui.render(),value=>value.type===type);if(rows.length!==1)throw Error('Expected one actual child');return rows[0].props;};
 return{ui,getProps:()=>props,panel:()=>only(ChartPanel),runner:()=>only(ScriptBindingsRunner),set:(change:Record<string,unknown>)=>{props={...props,...change};ui.settle();},publish:(next:BarDataset)=>{publishLiveDataset(next);ui.settle();},dispose:()=>ui.dispose()};
}
function nativeScripts(){
 const settings=new Map<string,any>(),listeners=new Set<()=>void>();const changed=()=>{for(const callback of [...listeners])callback();};
 const port={add:(_result:unknown,value:any)=>{settings.set(value.id,structuredClone(value));changed();return value.id;},update:()=>changed(),remove:(id:string)=>{settings.delete(id);changed();},replaceStyles:(id:string,plots:unknown)=>{settings.get(id).plots=structuredClone(plots);changed();},show:(id:string,visible:boolean)=>{settings.get(id).visible=visible;changed();},rename:(id:string,title:string)=>{settings.get(id).title=title;changed();},place:(id:string,value:unknown)=>{Object.assign(settings.get(id),value);changed();},configurationSnapshot:()=>structuredClone([...settings.values()]),placementStatus:()=>({ready:true,diagnostics:[]}),subscribe:(callback:()=>void)=>{listeners.add(callback);return()=>{listeners.delete(callback);};}};
 return{port:port as unknown as ChartController['scripts'],settings,listeners};
}
export function actualTree(bindings:ScriptBinding[]=[],count=2){
 const data=liveData(),latest=newer(data,2);registerLiveDataset(latest);
 const state=resizeMultiChartState(createMultiChartState(data,{appearance:defaultTheme.appearance}),'two-columns');
 if(count===1){const single=createMultiChartState(data,{appearance:defaultTheme.appearance});state.layout=single.layout;state.cells=single.cells;}
 for(const id of Object.keys(state.cells))state.cells[id]={...state.cells[id],scriptBindings:bindings};
 let input={state,datasets:[data],activeBars:data.bars,activeDatasetId:data.provenance.datasetId,activeExecutionIdentity:'ordinary'},staging=true,alive=true;
 const cells=new Map<string,ReturnType<typeof actualCell>>(),charts=new Map<string,ChartController>(),runtimes=new Map<string,ScriptBindingRuntime>(),statuses=new Map<string,GridCellReadiness>(),nativeSettings=new Map<string,ReturnType<typeof nativeScripts>>();
 let canonical:unknown,commits=0,stageCount=0,execution='ordinary';
 const update=(id:string)=>{const cell=cells.get(id)!,props=cell.runner();runtimes.get(id)!.update({bars:props.bars as Bar[],identity:scriptExecutionIdentity(props.source as any,props.style as string,execution),fixture:data.provenance.fixture,bindings,ready:true});};
 for(const row of state.layout.cells){
  const cell=actualCell(data,true,state,row.id),native=nativeScripts();cells.set(row.id,cell);nativeSettings.set(row.id,native);
  const accepted=()=>{const props=cell.panel();return{bars:props.bars,source:props.source,style:props.style} as ChartInputSnapshot;};
  let held=false;const chart={scripts:native.port,isInputCurrent:(desired:ChartInputSnapshot)=>!held&&chartInputCommitted(accepted(),desired),waitForAnalysisPlacement:async()=>{},saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},suspendTree:()=>{held=true;let live=true;return{isCurrent:()=>live,resume:()=>{held=false;live=false;},retire:()=>{live=false;},dispose:()=>{live=false;}};}} as unknown as ChartController;charts.set(row.id,chart);
  const runtime=new ScriptBindingRuntime(native.port,()=>{},()=>{},async()=>({barIds:[],result:{plots:[],orders:[],alerts:[],diagnostics:[],elapsedMs:0,provisional:false,state:null,provenance:{kind:'synthetic',label:'Synthetic staging'}}}) as any,()=>update(row.id));
  const prepare=runtime.prepareBindings.bind(runtime);runtime.prepareBindings=((...args:Parameters<typeof prepare>)=>{const lease=prepare(...args),stage=lease.stage;lease.stage=()=>{stageCount++;return stage();};return lease;}) as typeof runtime.prepareBindings;
  runtimes.set(row.id,runtime);statuses.set(row.id,{input:accepted(),settled:true,error:''});update(row.id);
 }
 const refresh=()=>{for(const [id,cell]of cells){const props=cell.panel();statuses.set(id,{input:{bars:props.bars,source:props.source,style:props.style} as ChartInputSnapshot,settled:true,error:''});update(id);}};
 const coordinator=createGridTreeCoordinator({read:()=>input,alive:()=>alive,staging:()=>staging,controller:id=>charts.get(id)??null,runtime:id=>runtimes.get(id)??null,cell:id=>statuses.get(id),holdLinks:()=>({release:()=>{}}),pending:()=>{},failed:()=>{},canonical:value=>{canonical=value;commits++;}});
 return{data,latest,input,coordinator,cells,charts,runtimes,statuses,nativeSettings,refresh,stageCount:()=>stageCount,commits:()=>commits,canonical:()=>canonical,
  publish:(value:BarDataset)=>{publishLiveDataset(value);for(const cell of cells.values())cell.ui.settle();refresh();},
  published:()=>{staging=false;for(const cell of cells.values())cell.set({staging:false});refresh();},
  replaceSource:()=>{input={...input,datasets:[{...data,provenance:{...data.provenance,revision:'different'}}]};},
  replay:()=>{execution='SYNTHETIC-replay-B';input={...input,activeExecutionIdentity:execution};},
  close:()=>{alive=false;for(const runtime of runtimes.values())runtime.dispose();for(const cell of cells.values())cell.dispose();}};
}
