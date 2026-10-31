import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {all,mountControlledComponent} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {ScriptBindingsRunner} from '../../src/ui/ScriptBindingsRunner';
import {LiveHistoryEdge} from '../../src/ui/live-registry';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
export type NoticeMode='none'|'waiting'|'error'|'both'|'history'|'all';
/** Actual private GridCell/Panel/Runner/History render functions, explicit synthetic hooks, no effects/native mounts. */
export function cellFixture(options:{two?:boolean;historyActive?:boolean;staging?:boolean;selected?:number}={}){
 const dataset=fixtureDataset('GME',8),source=sourceContextForDataset(dataset);let state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});if(options.two)state=resizeMultiChartState(state,'two-columns');
 if(options.selected===1)state={...state,layout:{...state.layout,activeCellId:state.layout.cells[1].id}};
 let parentProps:any={state,datasets:[dataset],historyActive:options.historyActive,staging:options.staging,onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}};
 const parent=mountControlledComponent(()=>MultiChartGrid(parentProps));let elements=all(parent.render(),node=>typeof node.type==='function'&&node.type.name==='GridCell');const selected=elements.find(node=>node.props.id===state.layout.activeCellId)!;
 let props:any={...selected.props},controller:any={getExecutionIdentity:()=> 'ordinary'},component=selected.type as (props:any)=>unknown;
 const cell=mountControlledComponent(()=>component(props));const panel=()=>all(cell.render(),node=>node.type===ChartPanel)[0];
 (panel().props.onReady as any)(controller,{bars:dataset.bars,source,style:'candles'},'ordinary');
 const tree=()=>cell.render(),history=()=>all(tree(),node=>node.type===LiveHistoryEdge);
 return{dataset,source,controller,cell,parent,tree,history,parentTree:()=>parent.render(),elements:()=>elements,props:()=>props,parentProps:()=>parentProps,setProps(patch:any){props={...props,...patch};},setParent(patch:any){parentProps={...parentProps,...patch};elements=all(parent.render(),node=>typeof node.type==='function'&&node.type.name==='GridCell');},ready(next=controller,data=dataset){controller=next;(panel().props.onReady as any)(next,{bars:data.bars,source:sourceContextForDataset(data),style:'candles'},'ordinary');},dispose(){cell.dispose();parent.dispose();}};
}
/** Materializes only actual component output. Synthetic state is scoped to each component's own controlled hook owner. */
export function actualMarkup(fixture:ReturnType<typeof cellFixture>,mode:NoticeMode){
 const owners:ReturnType<typeof mountControlledComponent>[]=[],retry:Array<()=>void>=[];
 function materialize(value:any):any{
  if(Array.isArray(value))return value.map(materialize);if(!React.isValidElement(value))return value;const node=value as React.ReactElement<any>;
  if(typeof node.type==='function'){
   if(node.type.name==='GridCell'&&node.props.id===fixture.props().id)return materialize(fixture.tree());
   if(node.type===ChartPanel){
    // Real SSR owns default React hook dispatch; named hooks remain in this explicit synthetic owner.
    const panel=mountControlledComponent(()=>renderToStaticMarkup(React.createElement(ChartPanel,node.props)));owners.push(panel);
    return React.createElement('div',{style:{display:'contents'},dangerouslySetInnerHTML:{__html:panel.render()}});
   }
   const component=node.type as (props:any)=>any,ui=mountControlledComponent(()=>component(node.props));owners.push(ui);
   const render=()=>ui.render();render();
   if(node.type===ScriptBindingsRunner){ui.owner.cells[2]=[...(mode==='waiting'||mode==='both'||mode==='all'?[{id:'SYNTHETIC waiting',name:'SYNTHETIC waiting',status:'waiting',message:'SYNTHETIC waiting'}]:[]),...(mode==='error'||mode==='both'||mode==='all'?[{id:'SYNTHETIC error',name:'SYNTHETIC script',status:'error',message:'SYNTHETIC calculation unavailable. Retry retains the original input.'}]:[])];}
   if(node.type===LiveHistoryEdge){ui.owner.cells[0]=mode==='history'||mode==='all'?{status:'error',message:'SYNTHETIC older history is temporarily unavailable.',revision:1}:null;ui.owner.cells[2]=mode==='history'||mode==='all';}
   const output=render();if(node.type===ScriptBindingsRunner){const button=all(output,child=>child.type==='button'&&child.props.children==='Retry chart scripts')[0];if(button)retry.push(button.props.onClick as ()=>void);}
   return materialize(output);
  }
  return React.cloneElement(node,undefined,...React.Children.toArray(node.props.children).map(materialize));
 }
 const output=materialize(fixture.parentTree());return{html:renderToStaticMarkup(output),retry,dispose(){for(const owner of owners)owner.dispose();}};
}
