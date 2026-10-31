import React,{useMemo,useState} from 'react';
import type {FactsDocument} from '../fundamentals/company-facts';
import type {StatementBasis,StatementRevisions,StatementScale} from '../fundamentals/statements';
import type {PriceInput} from '../fundamentals/price-ratios';
import {baseCatalogRows,buildMetricCatalog,formatCatalogValue,sectionRows,CATALOG_GROUPS,CATALOG_SECTIONS,CATALOG_UNAVAILABLE,type CatalogRow,type CatalogTable} from '../fundamentals/metric-catalog';
import {InfoTip} from './dialog-extras';
import './fundamentals.css';
export interface FundamentalsMetricsProps {document:FactsDocument;basis:StatementBasis;currency:string;asOf:string|null;revisions:StatementRevisions;columns:number;scale:StatementScale;price:PriceInput|null;today:string;onExport?:(table:CatalogTable)=>void}
export const METRICS_POLICY='Every value is computed from the SEC as-reported tags of this company and lists its inputs. A missing input leaves the value unavailable with the reason; nothing is filled in. Rows marked OpenCandle-defined use a choice OpenCandle made where published definitions differ. Balance-sheet inputs are period-end values. Quarterly ratios are not annualized unless the formula says so.';
type Filter='all'|'sections'|'unavailable'|(typeof CATALOG_GROUPS)[number][0];
/** Build the view model without React, so tests can check it directly. */
export function metricsModel(props:FundamentalsMetricsProps){
 const options={basis:props.basis,currency:props.currency,asOf:props.asOf,revisions:props.revisions,columns:props.columns,price:props.price,today:props.today};
 const table=buildMetricCatalog(props.document.facts,options),base=baseCatalogRows(props.document.facts,options,table.columns);
 const largest=Math.max(0,...table.rows.filter(r=>r.measure==='currency').flatMap(r=>r.cells.map(c=>c.value===null?0:Math.abs(c.value))));
 const scale=props.scale==='auto'?(largest>=1e9?'billions':largest>=1e6?'millions':largest>=1e3?'thousands':'units'):props.scale;
 return {table,base,scale};
}
export function FundamentalsMetrics(props:FundamentalsMetricsProps){
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<Filter>('all'),[picked,setPicked]=useState<string|null>(null);
 const model=useMemo(()=>{try{return {...metricsModel(props),error:''};}catch(e){return {table:null,base:[],scale:'units' as const,error:String(e)};}},[props.document,props.basis,props.currency,props.asOf,props.revisions,props.columns,props.scale,props.price,props.today]);
 const {table,base,scale}=model;
 if(!table)return <p className="help">{model.error}</p>;
 const needle=search.trim().toLowerCase(),match=(row:CatalogRow)=>!needle||row.label.toLowerCase().includes(needle)||(row.formula??'').toLowerCase().includes(needle);
 const selected=table.rows.find(r=>r.id===picked)??base.find(r=>r.id===picked)??null;
 const grid=(rows:CatalogRow[],label:string)=>rows.length?<div className="table-scroll"><table className="data-table fund-statement" aria-label={label}><thead><tr><th>Metric</th>{table.columns.map(end=><th key={end}>{table.options.basis} ending {end}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className={row.id===picked?'selected':''}><th scope="row"><button aria-label={'Inspect '+row.label} onClick={()=>setPicked(row.id)}>{row.label}</button>{row.basis==='LV-DEFINED'&&<span className="fund-tag" title="OpenCandle chose this definition where published definitions differ">OpenCandle-defined</span>}</th>{row.cells.map(cell=><td key={cell.end} className={cell.value===null?'fund-unavailable':''} title={cell.value===null?cell.reason??'':undefined}>{formatCatalogValue(cell.value,row.measure,scale)}</td>)}</tr>)}</tbody></table></div>:null;
 const groups=CATALOG_GROUPS.filter(([id])=>filter==='all'||filter===id).map(([id,label])=>{const rows=table.rows.filter(r=>r.group===id&&match(r));return rows.length?<section key={id} className="fund-metric-group" aria-label={label}><h4>{label}</h4>{id==='valuation'&&<p className="help">{table.priceNote}</p>}{grid(rows,label)}</section>:null;});
 const sections=CATALOG_SECTIONS.map(s=>{const rows=sectionRows(table,s,base).filter(match);return rows.length?<section key={s.id} className="fund-metric-group" aria-label={s.label}><h4>{s.label}</h4>{grid(rows,s.label)}</section>:null;});
 const unavailable=<div className="fund-unavailable-list" aria-label="Metrics not available"><strong>Not available from local sources</strong><ul>{CATALOG_UNAVAILABLE.map(u=><li key={u.id}>{u.label}: {u.reason}</li>)}</ul></div>;
 return <div className="fund-metrics">
  <p className="help fund-policy">{table.rows.length} metrics · {table.columns.length} periods · {table.options.currency} · values in {scale==='units'?'units':scale} where monetary<InfoTip label="About these metrics">{METRICS_POLICY}</InfoTip></p>
  <div className="screener-toolbar"><input aria-label="Search metrics" placeholder="Search metrics" value={search} onChange={e=>setSearch(e.target.value)}/><label>Show<select aria-label="Metric group" value={filter} onChange={e=>setFilter(e.target.value as Filter)}><option value="all">All groups</option><option value="sections">Overview sections</option>{CATALOG_GROUPS.map(([id,label])=><option key={id} value={id}>{label}</option>)}<option value="unavailable">Not available</option></select></label>{props.onExport&&<button onClick={()=>props.onExport!(table)}>Export metrics CSV</button>}</div>
  {table.notices.map(n=><p key={n} className="help" role="note">{n}</p>)}
  {selected&&<div className="source-note fund-detail" aria-label="Metric detail"><strong>{selected.label}</strong> · {selected.unit}{selected.formula&&<> · Formula: {selected.formula}</>}{selected.basis==='LV-DEFINED'&&<> · OpenCandle-defined</>}{selected.note&&<p className="help">{selected.note}</p>}<ul>{selected.cells.map(cell=><li key={cell.end}>Period ending {cell.end}: {cell.value===null?'Unavailable: '+cell.reason:formatCatalogValue(cell.value,selected.measure,'units')+(cell.method&&cell.method!=='formula'?' · '+cell.method:'')}{cell.inputs.length>0&&<ul>{cell.inputs.map((input,i)=><li key={i}>{input.label}{input.value===null?'':' = '+input.value.toLocaleString('en-US',{maximumFractionDigits:4})} ({input.end})</li>)}</ul>}</li>)}</ul></div>}
  {filter==='unavailable'?unavailable:filter==='sections'?sections:<>{groups}{filter==='all'&&unavailable}</>}
 </div>;
}
