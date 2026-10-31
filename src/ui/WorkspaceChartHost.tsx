import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {MultiChartGrid,type MultiChartGridProps} from './MultiChartGrid';
import {createWorkspaceChartHost,type WorkspaceChartHostController} from './workspace-chart-host';
import {reuseElement,createElementCache,retainElementSlots} from './element-cache';
export type {WorkspaceChartHostController} from './workspace-chart-host';
export function WorkspaceChartHost(props:MultiChartGridProps&{onHostReady?:(controller:WorkspaceChartHostController|null)=>void}){
 const latest=useRef(props);latest.current=props;const alive=useRef(true),[,render]=useState(0);
 const owner=useRef<ReturnType<typeof createWorkspaceChartHost>|null>(null);
 if(!owner.current)owner.current=createWorkspaceChartHost({read:()=>latest.current,changed:()=>{if(alive.current)render(value=>value+1);},alive:()=>alive.current});
 const host=owner.current;host.sync();
 useLayoutEffect(()=>{alive.current=true;latest.current.onHostReady?.(host.controller);return()=>{alive.current=false;host.cancel('The workspace chart host was unmounted.');latest.current.onHostReady?.(null);};},[host]);
 // A reused (parked) tree waits for this render before it establishes readiness on its new input.
 useEffect(()=>{host.rendered();host.flushResults();});
 // A tree's grid element is reused while its input, view values and mode are unchanged (element-cache.ts), so an
 // App re-render that changes nothing the charts read (most 1 Hz live App updates) does not re-render the grid.
 const grids=useRef(createElementCache()).current;retainElementSlots(grids,host.slots().map(slot=>String(slot.id)));
 // The last layout switch (host transition milliseconds, whether a parked tree was reused, parked count) for
 // packaged timing checks. Parked trees render hidden and inert below with their last input, so they do not re-render.
 const timing=host.lastSwitch();
 return <div className="workspace-chart-host" data-last-switch-ms={timing?.milliseconds} data-last-switch-reused={timing?String(timing.reused):undefined} data-parked-trees={timing?.parked} style={{position:'relative',height:'100%',minHeight:0}}>{host.slots().map(slot=>{
  const visible=slot.mode==='active'||slot.mode==='held',interactive=slot.mode==='active';
  return <div key={slot.id} data-chart-tree={slot.id} inert={!interactive} aria-hidden={!visible} style={{position:'absolute',inset:0,opacity:visible?1:0,pointerEvents:interactive?'auto':'none'}}>
   {reuseElement(grids,String(slot.id),<MultiChartGrid {...slot.view} {...slot.input} {...slot.callbacks} staging={slot.mode==='staging'} historyActive={visible} studyChromeVisible={visible}/>)}
  </div>;
 })}{host.slots().filter(slot=>slot.mode==='quarantined').map(slot=><div key={slot.id} role="alert"><p>{slot.error}</p><p>Reload the workspace to restore its saved chart configuration.</p></div>)}</div>;
}
