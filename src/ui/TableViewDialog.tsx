import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Modal} from './Modal';
import {tableViewModel,TABLE_VIEW_PAGE,type TableViewModel} from './table-view-model';
import {seriesSectionTitle,type DataWindowIndicatorInput,type DataWindowSeriesInput} from './data-window-model';
import type {Bar} from '../domain/types';
import './chart-commands.css';

/** Rows drawn above and below the visible part of the table, so a fast scroll never shows blank space. */
const OVERSCAN=20;
/** Row height before the first row is measured (12 px text with 3 px padding and a 1 px rule). */
const DEFAULT_ROW_PX=21;
/** What the table shows, as one string: a new array of the same studies (built on every chart render) keeps the table. */
function indicatorKey(indicators:readonly DataWindowIndicatorInput[],values:{ids:WeakMap<object,number>;next:number}):string{
 const id=(array:object)=>{let known=values.ids.get(array);if(known===undefined){known=++values.next;values.ids.set(array,known);}return known;};
 return JSON.stringify(indicators.map(study=>[study.id,study.kind,study.visible,study.offset,study.precision,study.plots.map(plot=>[plot.id,plot.label,plot.color,plot.dataWindow,id(plot.values as object)])]));
}
// Table view (chart menu, Quick search). Read-only; the newest TABLE_VIEW_PAGE bars first, Show more adds a page.
// Only the rows on screen are built and drawn (the rest are spacer height), so every bar can be shown without freezing.
export function TableViewDialog({series,bars,timezone,indicators,synthetic,onClose}:{series:DataWindowSeriesInput;bars:readonly Bar[];timezone:string;indicators:readonly DataWindowIndicatorInput[];synthetic:boolean;onClose:()=>void}){
 const [limit,setLimit]=useState(TABLE_VIEW_PAGE);
 const valueIds=useRef({ids:new WeakMap<object,number>(),next:0}).current,studies=indicatorKey(indicators,valueIds),latest=useRef(indicators);latest.current=indicators;
 const seriesKey=JSON.stringify([series.symbol,series.exchange,series.interval,series.description,series.tickSize]);
 const view:TableViewModel=useMemo(()=>tableViewModel({series,bars,timezone,indicators:latest.current,limit}),[seriesKey,bars,timezone,studies,limit]);
 const scroller=useRef<HTMLDivElement|null>(null),firstRow=useRef<HTMLTableRowElement|null>(null);
 const [scroll,setScroll]=useState({top:0,height:600}),[rowPx,setRowPx]=useState(DEFAULT_ROW_PX);
 useLayoutEffect(()=>{
  const element=scroller.current;if(element&&element.clientHeight&&element.clientHeight!==scroll.height)setScroll({top:element.scrollTop,height:element.clientHeight});
  const measured=firstRow.current?.getBoundingClientRect().height;if(measured&&measured>4&&Math.abs(measured-rowPx)>0.25)setRowPx(measured);
 });
 const first=Math.max(0,Math.floor(scroll.top/rowPx)-OVERSCAN),last=Math.min(view.count,Math.ceil((scroll.top+scroll.height)/rowPx)+OVERSCAN);
 const rows=[];for(let i=first;i<last;i++)rows.push(view.row(i));
 return <Modal title={'Table view: '+seriesSectionTitle(series)} onClose={onClose} wide>
  <div className="lv-table-view">
   <p role="status" style={{margin:0,color:'var(--lv-text-secondary)'}}>{(synthetic?'Example data. ':'')+(view.total?'Newest '+view.count+' of '+view.total+' bars, in the chart time zone.':'There are no bars on this chart yet.')}</p>
   {view.count>0&&<div ref={scroller} className="lv-table-view-scroll" tabIndex={0} role="region" aria-label="Bars" onScroll={event=>{const element=event.currentTarget;setScroll({top:element.scrollTop,height:element.clientHeight||scroll.height});}}><table aria-rowcount={view.count+1}>
    <thead><tr aria-rowindex={1}>{view.columns.map(column=><th key={column.key} scope="col" style={column.color?{borderBottom:'2px solid '+column.color}:undefined}>{column.label}</th>)}</tr></thead>
    <tbody>
     {first>0&&<tr aria-hidden="true" style={{height:first*rowPx}}/>}
     {rows.map((row,offset)=><tr key={row.key} ref={offset===0?firstRow:undefined} aria-rowindex={first+offset+2}>{row.cells.map((cell,index)=>index===0?<th key={index} scope="row" style={{position:'static',fontWeight:400,color:'var(--lv-text-primary)'}}>{cell}</th>:<td key={index}>{cell}</td>)}</tr>)}
     {last<view.count&&<tr aria-hidden="true" style={{height:(view.count-last)*rowPx}}/>}
    </tbody>
   </table></div>}
   <div className="dialog-actions">{view.count<view.total&&<button type="button" onClick={()=>setLimit(value=>value+TABLE_VIEW_PAGE)}>Show more</button>}<button type="button" onClick={onClose}>Close</button></div>
  </div>
 </Modal>;
}
