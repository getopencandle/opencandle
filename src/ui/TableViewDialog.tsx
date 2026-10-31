import React,{useState} from 'react';
import {Modal} from './Modal';
import {buildTableView,TABLE_VIEW_PAGE} from './table-view-model';
import {seriesSectionTitle,type DataWindowIndicatorInput,type DataWindowSeriesInput} from './data-window-model';
import type {Bar} from '../domain/types';
import './chart-commands.css';

// Table view (chart menu, Quick search). Read-only; the newest TABLE_VIEW_PAGE bars first, Show more adds a page.
export function TableViewDialog({series,bars,timezone,indicators,synthetic,onClose}:{series:DataWindowSeriesInput;bars:readonly Bar[];timezone:string;indicators:readonly DataWindowIndicatorInput[];synthetic:boolean;onClose:()=>void}){
 const [limit,setLimit]=useState(TABLE_VIEW_PAGE);
 const view=buildTableView({series,bars,timezone,indicators,limit});
 return <Modal title={'Table view: '+seriesSectionTitle(series)} onClose={onClose} wide>
  <div className="lv-table-view">
   <p role="status" style={{margin:0,color:'var(--lv-text-secondary)'}}>{(synthetic?'Example data. ':'')+(view.total?'Newest '+view.rows.length+' of '+view.total+' bars, in the chart time zone.':'There are no bars on this chart yet.')}</p>
   {view.rows.length>0&&<div className="lv-table-view-scroll" tabIndex={0} role="region" aria-label="Bars"><table>
    <thead><tr>{view.columns.map(column=><th key={column.key} scope="col" style={column.color?{borderBottom:'2px solid '+column.color}:undefined}>{column.label}</th>)}</tr></thead>
    <tbody>{view.rows.map(row=><tr key={row.key}>{row.cells.map((cell,index)=>index===0?<th key={index} scope="row" style={{position:'static',fontWeight:400,color:'var(--lv-text-primary)'}}>{cell}</th>:<td key={index}>{cell}</td>)}</tr>)}</tbody>
   </table></div>}
   <div className="dialog-actions">{view.rows.length<view.total&&<button type="button" onClick={()=>setLimit(value=>value+TABLE_VIEW_PAGE)}>Show more</button>}<button type="button" onClick={onClose}>Close</button></div>
  </div>
 </Modal>;
}
