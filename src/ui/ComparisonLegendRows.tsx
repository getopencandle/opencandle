// Each compared symbol gets a legend row of its own under the main series, as in the
// reference, so a comparison can be hidden, opened in Compare symbols, or removed from the chart without the dialog.
// The host (App) owns saving: onEdit runs the comparison port change and confirms the saved capture, like the legend
// Hide/Remove route for indicators. Wording is OpenCandle's own; colors come from the comparison's own line color.
import React,{useEffect,useState} from 'react';
import {comparisonLegendButtons} from '../chart/legend-model';
import type {ComparisonSettings} from '../chart/compare-port';
import {legendButtonView} from './indicator-legend-view';

/** The slice of chart.comparisons the legend reads and edits. */
export interface ComparisonLegendPort {
 list():Array<ComparisonSettings&{rendererId:string}>;
 subscribe(listener:()=>void):()=>void;
 update(id:string,patch:{visible:boolean}):unknown;
 remove(id:string):unknown;
}
export interface ComparisonLegendRow {id:string;symbol:string;color:string;visible:boolean;last:string|null;label:string}
/** Pure view model: one row per comparison in list order, with the last close of the compared symbol. */
export function comparisonLegendRows(list:readonly ComparisonSettings[]):ComparisonLegendRow[]{
 return list.map(row=>{
  const bars=row.dataset.bars,close=bars.length?bars[bars.length-1]!.close:null,symbol=row.dataset.instrument.symbol;
  return{id:row.id,symbol,color:row.color,visible:row.visible,last:close===null||!Number.isFinite(close)?null:close.toFixed(2),label:symbol+' comparison'};
 });
}
export function ComparisonLegendRows({port,onEdit,onSettings}:{port:ComparisonLegendPort|null|undefined;
 /** Runs one comparison change and saves it (App: confirmAnalysisCapture('comparison', ...)). */
 onEdit:(run:()=>void)=>void;
 /** Opens Compare symbols. */
 onSettings?:()=>void}){
 const read=()=>{try{return port?comparisonLegendRows(port.list()):[];}catch{return[];}};
 const [rows,setRows]=useState<ComparisonLegendRow[]>(read);
 useEffect(()=>{if(!port)return;setRows(read());let live=true;const off=port.subscribe(()=>{if(live)setRows(read());});return()=>{live=false;off();};},[port]);
 if(!port||!rows.length)return null;
 return <>{rows.map(row=>{
  const press:Record<string,()=>void>={hide:()=>onEdit(()=>{port.update(row.id,{visible:!row.visible});}),settings:()=>onSettings?.(),remove:()=>onEdit(()=>{port.remove(row.id);})};
  const buttons=comparisonLegendButtons(!row.visible).filter(button=>button.id!=='settings'||!!onSettings);
  return <div key={row.id} className="lv-legend-row lv-compare-legend-row" data-legend-row={row.id} data-legend-kind="comparison" data-hidden={row.visible?undefined:'true'}>
   <button type="button" className="lv-legend-title" title={row.label} onClick={()=>onSettings?.()}><span className="lv-legend-name" style={{color:row.color}}>{row.symbol}</span></button>
   {row.last!==null&&row.visible?<span className="lv-legend-values"><span style={{color:row.color}}>{row.last}</span></span>:null}
   {buttons.map(button=>legendButtonView(button,row.label,press[button.id]!))}
  </div>;
 })}</>;
}
