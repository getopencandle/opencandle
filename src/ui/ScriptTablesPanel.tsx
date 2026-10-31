import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {assertScriptTables,readScriptTables,type ScriptTablesSnapshot,type ScriptTablesValue} from '../chart/script-presentation-proof';
import type {ScriptTableDestinationLease} from '../chart/script-port';

export interface ScriptTablesTarget {readonly cellId:string;readonly bindingId:string;readonly title:string;readonly cellLabel:string;readonly visible:boolean}
/** Routing only. The private producer, never this header or callback, qualifies every table read. */
export interface ScriptTablesSource {
 /** Readonly owner/inventory invalidation. This never returns data or grants a table view. */
 subscribeInventory?(changed:()=>void):()=>void;
 prepareDestination?(expectedGrid:object,cellId:string,bindingId:string):ScriptTableDestinationLease;
 inventory():readonly ScriptTablesTarget[];
 capture(target:ScriptTablesTarget):ScriptTablesSnapshot|null;
 subscribe(target:ScriptTablesTarget,changed:()=>void):()=>void;
}
export interface ScriptTablesPanelProps {layoutId:string;revision:object|undefined;source:ScriptTablesSource|null;active:boolean}
const targetKey=(target:ScriptTablesTarget)=>JSON.stringify([target.cellId,target.bindingId]);
const CSS='.lv-script-tables{height:100%;min-height:0;display:flex;flex-direction:column;user-select:text}.lv-script-tables-chooser{flex:0 0 auto;padding:6px 10px}.lv-script-tables-scroll{overflow:auto;min-height:0;flex:1;padding:8px;display:flex;flex-direction:column;align-items:flex-start;gap:12px}.lv-script-tables-grid{display:grid;gap:0;flex:none;max-width:none}.lv-script-table-cell{padding:4px 8px;white-space:pre-wrap;overflow-wrap:anywhere;min-width:1em;user-select:text}.lv-script-tables-empty{padding:10px}';
/** Sparse cells are positioned on the existing bounded grid. No rows*columns array or blank DOM cells. */
export function scriptTableNodes(value:ScriptTablesValue):React.ReactNode{
 return value.tables.map((table,ordinal)=>{const rows:Array<Array<ScriptTablesValue['tables'][number]['cells'][number]>>=Array.from({length:table.rows},()=>[]);for(const cell of table.cells)rows[cell.row].push(cell);return <div key={ordinal} role="table" aria-label={'Script table '+(ordinal+1)} aria-rowcount={table.rows} aria-colcount={table.columns} className="lv-script-tables-grid" data-script-table={table.id} style={{gridTemplateColumns:'repeat('+table.columns+',max-content)',gridTemplateRows:'repeat('+table.rows+',minmax(1.2em,auto))',background:table.bgColor??undefined,border:table.frameWidth+'px solid '+(table.frameColor??'transparent')}}>{rows.map((cells,row)=><div key={row} role="row" aria-rowindex={row+1} style={{display:'contents'}}>{cells.map((cell,index)=><div key={index} role="cell" aria-rowindex={cell.row+1} aria-colindex={cell.column+1} className="lv-script-table-cell" title={cell.tooltip||undefined} style={{gridRow:cell.row+1,gridColumn:cell.column+1,color:cell.textColor??undefined,background:cell.bgColor??undefined,textAlign:cell.hAlign,alignSelf:cell.vAlign==='top'?'start':cell.vAlign==='bottom'?'end':'center',fontSize:({auto:12,tiny:10,small:11,normal:12,large:16,huge:20} as const)[cell.textSize],border:table.borderWidth+'px solid '+(table.borderColor??'transparent')}}>{cell.text}</div>)}</div>)}</div>;});
}
export function ScriptTablesPanel(props:ScriptTablesPanelProps){
 const latest=useRef(props);latest.current=props;
 const [choice,setChoice]=useState<{layoutId:string;key:string}|null>(null),[,setRevision]=useState(0),[inventoryRevision,setInventoryRevision]=useState(0);
 const held=useRef<{active:boolean;source:ScriptTablesSource;layoutId:string;revision:object|undefined;target:ScriptTablesTarget;view:ScriptTablesSnapshot|null;value:ScriptTablesValue|null;nodes:React.ReactNode}|null>(null);
 const targets=useMemo(()=>{try{return props.source?.inventory()??[];}catch{return[] as readonly ScriptTablesTarget[];}},[props.source,props.revision,props.layoutId,props.active,inventoryRevision]);
 useLayoutEffect(()=>{
  const source=props.source,layoutId=props.layoutId;if(!source||!props.active)return;let active=true,off:(()=>void)|null=null;
  const current=()=>active&&latest.current.source===source&&latest.current.layoutId===layoutId&&latest.current.active;
  const stop=()=>{active=false;const release=off;off=null;release?.();};
  try{const subscribe=source.subscribeInventory;if(!subscribe||!current())return;const release=subscribe.call(source,()=>{if(current())setInventoryRevision(value=>value+1);});if(typeof release!=='function')throw Error('Table inventory observer did not return cleanup.');if(current())off=release;else release();}
  catch(error){try{stop();}catch(cleanup){throw new AggregateError([error,cleanup],'Table inventory observation cleanup failed.');}throw error;}
  return stop;
 },[props.source,props.layoutId,props.active]);
 const selected=useMemo(()=>targets.find(row=>choice?.layoutId===props.layoutId&&targetKey(row)===choice.key)??targets[0],[targets,choice,props.layoutId]),selectedKey=selected?targetKey(selected):'';
 useLayoutEffect(()=>{
  const source=props.source,target=selected;if(!props.active||!source||!target||!target.visible)return;
  const owner={active:true,source,layoutId:props.layoutId,revision:props.revision,target,view:null as ScriptTablesSnapshot|null,value:null as ScriptTablesValue|null,nodes:null as React.ReactNode};held.current=owner;
  const owns=()=>owner.active&&held.current===owner&&latest.current.active&&latest.current.source===source&&latest.current.layoutId===owner.layoutId&&latest.current.revision===owner.revision;
  let off:(()=>void)|null=null;
  const refresh=()=>{if(!owns())return;owner.view=null;owner.value=null;owner.nodes=null;try{const view=source.capture(target);if(!owns())return;if(view){const value=readScriptTables(view),nodes=scriptTableNodes(value);assertScriptTables(view);if(owns()){owner.view=view;owner.value=value;owner.nodes=nodes;}}}catch{/* Pending/hidden/retired results remain empty. */}if(owns())setRevision(value=>value+1);};
  const stop=()=>{owner.active=false;owner.view=null;owner.value=null;owner.nodes=null;if(held.current===owner)held.current=null;const release=off;off=null;release?.();};
  try{const release=source.subscribe(target,refresh);if(owns())off=release;else release();if(owns())refresh();}catch{try{stop();}finally{if(latest.current.source===source)setRevision(value=>value+1);}}
  return stop;
 },[props.source,props.layoutId,props.revision,props.active,selectedKey,selected]);
 let value:ScriptTablesValue|null=null;const owner=held.current;
 if(props.active&&selected?.visible&&owner?.active&&owner.source===props.source&&owner.layoutId===props.layoutId&&owner.revision===props.revision&&targetKey(owner.target)===selectedKey&&owner.target===selected&&owner.view){try{assertScriptTables(owner.view);value=owner.value;}catch{owner.view=null;owner.value=null;owner.nodes=null;}}
 // Nodes were projected once on the selected port event and privately checked after projection. Hover does not rebuild them.
 const nodes=value&&owner?.view?owner.nodes:null;
 return <section className="lv-script-tables" aria-label="Script tables"><style>{CSS}</style>{targets.length>0&&<label className="lv-script-tables-chooser">Script <select aria-label="Script tables source" value={selectedKey} onChange={event=>{if(held.current){held.current.active=false;held.current.view=null;held.current.value=null;held.current.nodes=null;}setChoice({layoutId:props.layoutId,key:event.target.value});}}>{targets.map(target=><option key={targetKey(target)} value={targetKey(target)}>{target.cellLabel+' / '+target.title}</option>)}</select></label>}{!selected?<p className="lv-script-tables-empty">Assign a script's tables to this panel from its Script actions menu.</p>:!selected.visible?<p className="lv-script-tables-empty">Script hidden</p>:!value?<p className="lv-script-tables-empty" role="status">Waiting for current script tables</p>:value.tables.length===0?<p className="lv-script-tables-empty">This script produced no tables</p>:<div className="lv-script-tables-scroll">{nodes}</div>}</section>;
}
