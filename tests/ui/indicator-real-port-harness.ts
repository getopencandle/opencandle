import {vi} from 'vitest';
import {getNativeIndicator,type Vela} from '@luxalgo/vela';
import {IndicatorDialog,IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault,type IndicatorLibrary} from '../../src/ui/indicator-library';
import {indicatorInstanceLabels} from '../../src/ui/indicator-dialog-model';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {calculateIndicator,type IndicatorId} from '../../src/domain/indicators';

// Shared L1 harness: ACTUAL IndicatorDialog handlers wired to the REAL indicator port (real
// validation, calculation, presentation, pane registry). The native chart is a minimal in-memory
// host, not the packaged renderer. Callers install the deterministic React hook mock and pass its
// cell store here. Model + component-handler evidence only; no DOM, focus, keyboard or GUI.
export interface HookStore {cells:any[];cursor:number}
export const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
export function findAll(tree:any,predicate:(node:any)=>boolean):any[]{const out:any[]=[];const visit=(node:any)=>{if(Array.isArray(node))return node.forEach(visit);if(!node?.props)return;if(predicate(node))out.push(node);visit(node.props.children);};visit(tree);return out;}
export function find(tree:any,predicate:(node:any)=>boolean):any{const found=findAll(tree,predicate)[0];if(!found)throw new Error('Handler target missing');return found;}
/** Synthetic labelled fixture bars (ms timestamps, daily cadence, positive volume). */
export const bars=Array.from({length:80},(_,i)=>{const close=100+8*Math.sin(i/4)+(i%7)*0.75;return {time:1700000000000+i*86400000,open:close-0.6+(i%3)*0.4,high:close+1.5+(i%4)*0.3,low:close-1.4-(i%5)*0.2,close,volume:1000+(i*37)%400};});
export const domainBars=bars.map(bar=>({...bar,time:bar.time/1000}));
export const overlayKinds=new Set<IndicatorId>(['sma','ema','bb','vwap']);

/** Minimal native host: honours add/remove/move/setInputs/setVisible and records each emission. */
export function nativeHost(hostBars:readonly {time:number}[]=bars){
 let sequence=0;const live=new Map<string,any>();
 const panes=()=>['price',...new Set([...live.values()].map(row=>row.pane).filter(pane=>pane!=='price'))].map(id=>({id,kind:id==='price'?'price':'study',order:0,collapsed:false,maximized:false,indicators:[...live].filter(([,row])=>row.pane===id).map(([nativeId,row])=>({id:nativeId,title:row.type,ownScale:false}))}));
 const chart={panes:{list:panes},indicators:()=>[...live.values()].map(row=>row.handle),addNativeIndicator(type:string){
  const descriptor=getNativeIndicator(type)!,id='native-'+ ++sequence,model=descriptor.create(),state:any={type,model,pane:'price',inputs:descriptor.defaultInputs(),emitted:null,visible:true,handle:null};
  state.handle={id,remove:()=>{model.stop();live.delete(id);},moveTo:(target:any)=>{if(target==='price')state.pane='price';else if('pane' in target){if(panes().some(pane=>pane.id===target.pane))state.pane=target.pane;}else state.pane='native-pane-'+ ++sequence;},setInputs:(inputs:any)=>{state.inputs=structuredClone(inputs);model.setInputs(inputs);},setVisible:(next:boolean)=>{state.visible=next;next?model.resume():model.suspend();},get visible(){return state.visible;}};
  live.set(id,state);model.start({id,bars:()=>hostBars,emit:(value:any)=>{state.emitted=value;},setStatus:()=>{}} as any,state.inputs);return state.handle;
 }};
 return {chart,live};
}
export function realChart(hostBars:readonly {time:number}[]=bars){const host=nativeHost(hostBars),port=createIndicatorPort(host.chart as unknown as Vela);return {host,port,controller:{indicators:port,chart:host.chart,getCalculationBars:()=>hostBars.map(bar=>({...bar,time:bar.time/1000}))}};}
export type RealPort=ReturnType<typeof createIndicatorPort>;
export const valuesOf=(port:RealPort,id:string)=>port.values(id).series.map(series=>({id:series.id,values:series.values}));
export const expected=(kind:IndicatorId,inputs:Record<string,unknown>,source=domainBars)=>calculateIndicator(kind,source,inputs).series.map(series=>({id:series.id,values:series.values}));
export const settingsOf=(row:any)=>({kind:row.kind,inputs:row.inputs,plots:row.plots,offset:row.offset,visible:row.visible,presentation:row.presentation});

export function makeHarness(hooks:HookStore){
 const scopes=new Map<string,any[]>();
 function renderIn<T>(scope:string,fn:()=>T):T{if(!scopes.has(scope))scopes.set(scope,[]);hooks.cells=scopes.get(scope)!;hooks.cursor=0;return fn();}
 function dialog(options:{library?:IndicatorLibrary;seed?:IndicatorId[];initialSelected?:number;bars?:readonly {time:number}[]}={}){
  const chart=realChart(options.bars),onChange=vi.fn(()=>true);let library=options.library??createIndicatorLibrary();
  const ids=(options.seed??[]).map(kind=>chart.port.add(kind,factoryIndicatorDefault(kind).inputs,factoryIndicatorDefault(kind)));
  const props:any={chart:chart.controller,get instances(){return chart.port.list();},get library(){return library;},ownerToken:{},onLibraryChange:vi.fn((value:IndicatorLibrary)=>{library=value;return true;}),onClose:vi.fn(),onChange,initialSelected:options.initialSelected===undefined?undefined:ids[options.initialSelected]};
  const render=()=>renderIn('dialog',()=>IndicatorDialog({...props,instances:props.instances,library:props.library}));
  let mountedKey:string|null=null;
  const settings=()=>{const tree=render(),element=findAll(tree,node=>node.type===IndicatorSettings)[0];if(!element){mountedKey=null;return null;}if(mountedKey!==element.key){scopes.delete('settings:'+element.key);mountedKey=element.key;}return {element,tree:renderIn('settings:'+element.key,()=>IndicatorSettings(element.props))};};
  const S=()=>{const value=settings();if(!value)throw new Error('No settings editor');return value;};
  const label=(value:string)=>(node:any)=>node.props?.['aria-label']===value;
  const buttonText=(value:string)=>(node:any)=>node.type==='button'&&text(node)===value;
  return {...chart,ids,props,render,labels:()=>indicatorInstanceLabels(chart.port.list()),
   click:(name:string)=>find(render(),label(name)).props.onClick(),
   /** Add leaves the dialog without an editor (the reference app); this then opens the newest instance's settings as the Edit row control does. */
   addAndEdit:(name:string)=>{find(render(),label(name)).props.onClick();const edits=findAll(render(),node=>String(node.props?.['aria-label']??'').startsWith('Edit '));edits[edits.length-1].props.onClick();},
   sClick:(value:string)=>find(S().tree,buttonText(value)).props.onClick(),
   sButton:(value:string)=>find(S().tree,buttonText(value)),
   sEdit:(name:string,value:string)=>find(S().tree,label(name)).props.onChange({target:{value}}),
   sCheck:(name:string,checked:boolean)=>find(S().tree,label(name)).props.onChange({target:{checked}}),
   sField:(name:string)=>find(S().tree,label(name)),
   sHas:(name:string)=>findAll(S().tree,label(name)).length>0,
   sSubmit:()=>S().tree.props.onSubmit({preventDefault(){}}),
   sForm:()=>S().tree,
   sText:()=>text(S().tree),text:()=>text(render()),sAlert:()=>text(find(S().tree,node=>node.props?.role==='alert')),
   get library(){return library;},selected:()=>settings()?.element.props.row.id??null};
 }
 return {scopes,renderIn,dialog};
}
