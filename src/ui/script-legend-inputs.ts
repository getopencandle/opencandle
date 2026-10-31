import React,{useEffect,useRef,useState} from 'react';
import {comparisonLegendButtons} from '../chart/legend-model';
import {legendButtonView} from './indicator-legend-view';
import type {ChartController} from '../chart/adapter';
import type {ScriptBinding} from './script-library';
import {scriptOutputs,sameScriptInputOverrides,type ScriptInputDescription} from './script-outputs';

/** Accepted configuration text only; never a plot-value or current-bar authority. */
export function formatScriptLegendInputs(description:ScriptInputDescription|null):string|null{
 if(!description)return null;
 const parts=description.parts.filter(row=>row.type!=='bool'&&row.type!=='color').map(row=>typeof row.value==='string'?(row.value===''?'""':row.value):String(row.value));
 return parts.length?parts.join(' '):null;
}
type InputBinding=Pick<ScriptBinding,'id'|'source'|'inputs'>;
const snapshotBindings=(bindings:readonly ScriptBinding[]):readonly InputBinding[]=>bindings.map(row=>({id:row.id,source:row.source,inputs:row.inputs?{...row.inputs}:undefined}));
function sameBindings(left:readonly InputBinding[],right:readonly ScriptBinding[]):boolean{
 return left.length===right.length&&left.every((row,index)=>{const other=right[index];return row.id===other.id&&row.source===other.source&&sameScriptInputOverrides(row.inputs,other.inputs);});
}
interface Cache {chart:ChartController;owner:object;epoch:object;texts:ReadonlyMap<string,string>}
/** One port-scoped subscription. Cursor renders only look up already formatted text. */
export function useScriptLegendInputs(chart:ChartController|null,bindings:readonly ScriptBinding[],enabled:boolean,owner:object,isCurrent:()=>boolean):(binding:ScriptBinding)=>string|null{
 enabled=enabled&&bindings.length>0;
 const latest=useRef({chart,bindings,enabled,owner,isCurrent});latest.current={chart,bindings,enabled,owner,isCurrent};
 const basis=useRef<{bindings:readonly ScriptBinding[];semantics:readonly InputBinding[];epoch:object;enabled:boolean}|null>(null);
 if(!basis.current||basis.current.bindings!==bindings||basis.current.enabled!==enabled){const previous=basis.current;basis.current={bindings,enabled,semantics:enabled?snapshotBindings(bindings):[],epoch:previous&&(!enabled||previous.enabled&&sameBindings(previous.semantics,bindings))?previous.epoch:{}};}
 const epoch=basis.current.epoch,cache=useRef<Cache|null>(null),[,setRevision]=useState(0);
 const acknowledged=(()=>{try{return isCurrent();}catch{return false;}})();
 useEffect(()=>{
  let alive=true,frame=0;const releases:Array<()=>void>=[];
  const owns=()=>alive&&latest.current.chart===chart&&latest.current.owner===owner&&basis.current?.epoch===epoch&&latest.current.enabled&&latest.current.isCurrent();
  const clear=(invalidate=false)=>{const old=cache.current;if(old?.chart===chart&&old.owner===owner&&old.epoch===epoch){cache.current=null;if(invalidate&&alive)setRevision(value=>value+1);}};
  const cleanup=()=>{alive=false;try{if(frame)cancelAnimationFrame(frame);}catch{/* Still release every subscription. */}frame=0;for(const release of releases.splice(0).reverse())try{release();}catch{/* All-attempt cleanup. */}clear();};
  const refresh=()=>{frame=0;try{if(!chart||!owns()){clear(true);return;}const texts=new Map<string,string>();
    for(const binding of latest.current.bindings){const description=scriptOutputs.inputDescription(chart.scripts,binding);if(!owns()){clear(true);return;}const value=formatScriptLegendInputs(description);if(value!==null)texts.set(binding.id,value);}
    if(!owns()){clear(true);return;}const old=cache.current,changed=!old||old.chart!==chart||old.owner!==owner||old.epoch!==epoch||old.texts.size!==texts.size||[...texts].some(([id,value])=>old.texts.get(id)!==value);
    cache.current={chart,owner,epoch,texts};if(changed)setRevision(value=>value+1);
   }catch{clear(true);}};
  const schedule=()=>{try{if(owns()){if(!frame)frame=requestAnimationFrame(refresh);}else clear(true);}catch{clear(true);}};
  try{if(chart&&enabled&&acknowledged){releases.push(scriptOutputs.subscribeInputs(chart.scripts,schedule));refresh();}else clear();}catch{cleanup();}
  return cleanup;
 },[chart,owner,enabled,epoch,acknowledged]);
 return binding=>{const current=cache.current;return enabled&&acknowledged&&current?.chart===chart&&current.owner===owner&&current.epoch===epoch?current.texts.get(binding.id)??null:null;};
}

/** A script legend row's Hide/Show, Settings and Remove are the built-in indicator
 * row's icon buttons (same classes, qa ids and sizes, shown on row hover by indicator-legend.css), not permanent text buttons.
 * The accessible names stay the script row's own ("Hide X", "Settings for X", "Remove script X"). */
export function scriptLegendButtons(name:string,visible:boolean,press:{hide:()=>void;settings:()=>void;remove:()=>void}):React.ReactNode[]{
 const names:Record<'hide'|'settings'|'remove',string>={hide:(visible?'Hide ':'Show ')+name,settings:'Settings for '+name,remove:'Remove script '+name};
 return comparisonLegendButtons(!visible).map(button=>{const id=button.id as 'hide'|'settings'|'remove',node=legendButtonView(button,name,press[id]);return React.isValidElement(node)?React.cloneElement(node as React.ReactElement<Record<string,unknown>>,{'aria-label':names[id]}):node;});
}
