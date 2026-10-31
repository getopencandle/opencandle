import {dateDay,type FactsDocument} from './company-facts';
import {buildMetricCatalog,CATALOG_ENTRIES} from './metric-catalog';
import {buildStatement,derivedById,lineById,statementCurrencies,unitFor,DERIVED_METRICS,STATEMENT_LINES,type LineMeasure,type StatementBasis,type StatementKind} from './statements';
/** Fundamentals graph model: statement lines over FY, FQ or TTM periods for one or more saved
 * documents. Values are exactly the statement-table cells; scale transforms are display-only. */
export type GraphScale='regular'|'log'|'percent'|'indexed';
export type GraphRange='3Y'|'5Y'|'10Y'|'all';
export type GraphView='symbol'|'metric';
export const GRAPH_SCALES:[GraphScale,string][]=[['regular','Regular'],['log','Logarithmic'],['percent','Percent change'],['indexed','Indexed to 100']];
export const GRAPH_RANGES:[GraphRange,string][]=[['3Y','3 years'],['5Y','5 years'],['10Y','10 years'],['all','All']];
export const MAX_GRAPH_DOCUMENTS=6,MAX_GRAPH_METRICS=6,MAX_GRAPH_SERIES=8;
export type SnapshotBackground='theme'|'light'|'transparent';
/** currency null: each company's main reported currency. colors: series key to a palette index. */
export interface GraphConfig {schemaVersion:1;view:GraphView;documentIds:string[];metricIds:string[];basis:StatementBasis;scale:GraphScale;range:GraphRange;overlay:boolean;currency:string|null;snapshot:{legend:boolean;background:SnapshotBackground};colors:Record<string,number>}
export const GRAPH_PALETTE_SIZE=8,MAX_GRAPH_COLORS=16;
export const FX_POLICY='OpenCandle never converts currencies. Each company is drawn in the chosen reported currency; a company that does not report in it is left out with a note.';
export function createGraphConfig():GraphConfig{return {schemaVersion:1,view:'symbol',documentIds:[],metricIds:['revenue','net_income'],basis:'FY',scale:'regular',range:'all',overlay:false,currency:null,snapshot:{legend:true,background:'theme'},colors:{}};}
export interface GraphMetric {id:string;label:string;measure:LineMeasure;statement:StatementKind|'catalog'}
/** Every statement line and derived metric the statement tables can produce. */
export const GRAPH_METRICS:readonly GraphMetric[]=[
 ...STATEMENT_LINES.map(s=>({id:s.id,label:s.label,measure:s.measure as LineMeasure,statement:s.statement as StatementKind})),
 ...DERIVED_METRICS.map(d=>({id:d.id,label:d.label,measure:d.measure as LineMeasure,statement:'statistics' as StatementKind})),
 // Metric catalog rows. Price-based rows are left out: they exist for the newest period only.
 ...CATALOG_ENTRIES.filter(e=>!(e.kind==='formula'&&e.price)).map(e=>({id:e.id,label:e.label,measure:(e.measure==='days'||e.measure==='years'||e.measure==='score'?'ratio':e.measure) as LineMeasure,statement:'catalog' as const})),
];
/** Move one selected id left (-1) or right (+1); out-of-range moves leave the order unchanged. */
export function moveGraphItem(ids:readonly string[],id:string,delta:-1|1):string[]{const i=ids.indexOf(id),j=i+delta;if(i<0||j<0||j>=ids.length)return [...ids];const next=[...ids];[next[i],next[j]]=[next[j],next[i]];return next;}
export interface GraphPoint {end:string;value:number}
export interface GraphSeries {key:string;documentId:string;entity:string;metricId:string;label:string;unit:string;measure:LineMeasure;basis:StatementBasis;points:GraphPoint[];notes:string[]}
export interface GraphBuild {series:GraphSeries[];notices:string[]}
const own=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function restoreGraphConfig(input:unknown):GraphConfig{
 const keys=['schemaVersion','view','documentIds','metricIds','basis','scale','range','overlay'],optional=['currency','snapshot','colors'];
 // Configurations saved before currency, snapshot and colors existed restore with their defaults.
 if(!own(input)||!keys.every(k=>Object.hasOwn(input,k))||Object.keys(input).some(k=>!keys.includes(k)&&!optional.includes(k))||input.schemaVersion!==1)throw new Error('Invalid fundamentals graph configuration.');
 const currency=input.currency??null;if(currency!==null&&(typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)))throw new Error('Invalid fundamentals graph currency.');
 const snap=input.snapshot??{legend:true,background:'theme'};if(!own(snap)||Object.keys(snap).length!==2||typeof snap.legend!=='boolean'||!['theme','light','transparent'].includes(snap.background as string))throw new Error('Invalid fundamentals graph snapshot options.');
 const colors=input.colors??{};if(!own(colors)||Object.keys(colors).length>MAX_GRAPH_COLORS||Object.entries(colors).some(([k,v])=>!k||k.length>300||!Number.isInteger(v)||(v as number)<0||(v as number)>=GRAPH_PALETTE_SIZE))throw new Error('Invalid fundamentals graph colors.');
 const ids=(v:unknown,max:number,items:number)=>{if(!Array.isArray(v)||v.length>items||v.some(x=>typeof x!=='string'||!x||x.length>max)||new Set(v).size!==v.length)throw new Error('Invalid fundamentals graph selection.');return v as string[];};
 if(!['symbol','metric'].includes(input.view as string)||!['FY','FQ','TTM'].includes(input.basis as string)||!GRAPH_SCALES.some(s=>s[0]===input.scale)||!GRAPH_RANGES.some(r=>r[0]===input.range)||typeof input.overlay!=='boolean')throw new Error('Invalid fundamentals graph settings.');
 const documentIds=ids(input.documentIds,200,MAX_GRAPH_DOCUMENTS),metricIds=ids(input.metricIds,64,MAX_GRAPH_METRICS);
 if(!metricIds.every(id=>GRAPH_METRICS.some(m=>m.id===id)))throw new Error('Unknown fundamentals graph metric.');
 return {schemaVersion:1,view:input.view as GraphView,documentIds,metricIds,basis:input.basis as StatementBasis,scale:input.scale as GraphScale,range:input.range as GraphRange,overlay:input.overlay,currency,snapshot:{legend:snap.legend as boolean,background:snap.background as SnapshotBackground},colors:{...colors} as Record<string,number>};
}
/** The two views limit what can vary: by symbol charts several metrics of one company, by metric one metric across companies. */
export function constrainGraphConfig(config:GraphConfig):GraphConfig{
 const documentIds=config.view==='symbol'?config.documentIds.slice(0,1):config.documentIds.slice(0,MAX_GRAPH_DOCUMENTS),metricIds=config.view==='metric'?config.metricIds.slice(0,1):config.metricIds.slice(0,MAX_GRAPH_METRICS);
 return {...config,documentIds,metricIds};
}
export function buildGraphSeries(documents:readonly FactsDocument[],config:GraphConfig,asOf:string|null):GraphBuild{
 const series:GraphSeries[]=[],notices:string[]=[],cfg=constrainGraphConfig(config);
 if(cfg.documentIds.length*cfg.metricIds.length>MAX_GRAPH_SERIES)notices.push('At most '+MAX_GRAPH_SERIES+' lines are drawn.');
 const tables=new Map<string,ReturnType<typeof buildStatement>|null>(),catalogs=new Map<string,ReturnType<typeof buildMetricCatalog>|null>();
 for(const documentId of cfg.documentIds){
  const document=documents.find(d=>d.id===documentId);
  if(!document){notices.push('A selected company document was removed.');continue;}
  let currency:string|undefined,reported:string[];try{reported=statementCurrencies(document.facts,asOf);currency=cfg.currency??reported[0];}catch(e){notices.push(String(e));continue;}
  if(!reported.length){notices.push(document.facts.entityName+' has no reported currency values on the supported statement tags.');continue;}
  if(!reported.includes(currency!)){notices.push(document.facts.entityName+' does not report in '+currency+' (reports '+reported.join(', ')+'). OpenCandle does not convert currencies.');continue;}
  for(const metricId of cfg.metricIds){
   if(series.length>=MAX_GRAPH_SERIES)break;
   const metric=GRAPH_METRICS.find(m=>m.id===metricId);if(!metric)continue;
   const measure=lineById.get(metricId)?.measure??derivedById.get(metricId)?.measure??metric.measure,label=metric.label;
   const key=documentId+'|'+metricId,notes:string[]=[];let points:GraphPoint[]=[];
   if(metric.statement==='catalog'){
    const tableKey=documentId+'|catalog|'+cfg.basis;
    if(!catalogs.has(tableKey)){try{catalogs.set(tableKey,buildMetricCatalog(document.facts,{basis:cfg.basis,currency:currency!,asOf,revisions:'latest',columns:20,price:null,today:asOf??'9999-12-31'}));}catch(e){catalogs.set(tableKey,null);notes.push(String(e));}}
    const table=catalogs.get(tableKey),row=table?.rows.find(r=>r.id===metricId);
    if(table&&row){points=table.columns.flatMap((end,i)=>row.cells[i]?.value!=null?[{end,value:row.cells[i].value as number}]:[]).sort((a,b)=>a.end.localeCompare(b.end));if(!points.length)notes.push('No '+cfg.basis+' values for this metric.');}
   }
   else if(metric.statement==='balance'&&cfg.basis==='TTM')notes.push('Balance-sheet values are point-in-time. Choose Annual or Quarterly.');
   else {
    const tableKey=documentId+'|'+metric.statement+'|'+cfg.basis;
    if(!tables.has(tableKey)){try{tables.set(tableKey,buildStatement(document.facts,{statement:metric.statement as StatementKind,basis:cfg.basis,currency,asOf,revisions:'latest',columns:20}));}catch(e){tables.set(tableKey,null);notes.push(String(e));}}
    const table=tables.get(tableKey),row=table?.rows.find(r=>r.id===metricId);
    if(table&&row){points=table.columns.flatMap((end,i)=>row.cells[i]?.value!=null?[{end,value:row.cells[i].value as number}]:[]).sort((a,b)=>a.end.localeCompare(b.end));if(!points.length)notes.push('No reported '+cfg.basis+' values for this line.');}
   }
   series.push({key,documentId,entity:document.facts.entityName,metricId,label,unit:unitFor(measure,currency),measure,basis:cfg.basis,points,notes});
  }
 }
 return {series,notices};
}
/** Keep points from the last N years before the latest period end across all series (calendar-year arithmetic). */
export function applyRange(series:readonly GraphSeries[],range:GraphRange):GraphSeries[]{
 if(range==='all')return series.map(s=>({...s}));
 const years=Number.parseInt(range,10),ends=series.flatMap(s=>s.points.map(p=>p.end));if(!ends.length)return series.map(s=>({...s}));
 const last=ends.reduce((a,b)=>a>b?a:b),cut=String(Number(last.slice(0,4))-years).padStart(4,'0')+last.slice(4);
 return series.map(s=>({...s,points:s.points.filter(p=>p.end>cut)}));
}
export interface ScaledSeries extends GraphSeries {scaledUnit:string;dropped:number}
/** Display transforms. Log keeps only positive values; percent is relative to the first shown value's magnitude; indexed needs a positive base. Impossible cases drop points and say why. */
export function scaleSeries(series:GraphSeries,scale:GraphScale):ScaledSeries{
 const notes=[...series.notes],pts=series.points;
 if(scale==='regular')return {...series,notes,scaledUnit:series.unit,dropped:0};
 if(scale==='log'){const kept=pts.filter(p=>p.value>0),dropped=pts.length-kept.length;if(dropped)notes.push(dropped+' zero or negative value'+(dropped===1?'':'s')+' cannot be drawn on a logarithmic scale.');return {...series,points:kept,notes,scaledUnit:series.unit,dropped};}
 const base=pts[0]?.value;
 if(base===undefined||base===0||scale==='indexed'&&base<0){if(pts.length)notes.push(base===0?'The first value is zero, so a relative scale is undefined.':'The first value is negative, so an index to 100 is undefined.');return {...series,points:[],notes,scaledUnit:scale==='percent'?'%':'index',dropped:pts.length};}
 const points=pts.map(p=>({end:p.end,value:scale==='percent'?(p.value-base)/Math.abs(base)*100:p.value/base*100}));
 return {...series,points,notes,scaledUnit:scale==='percent'?'% change':'index (first=100)',dropped:0};
}
export interface PriceOverlayBar {date:string;close:number}
/** Daily closes inside the drawn period, thinned to at most `limit` points for drawing only. */
export function overlayPoints(bars:readonly PriceOverlayBar[],from:string,to:string,limit=400):PriceOverlayBar[]{
 const inRange=bars.filter(b=>b.date>=from&&b.date<=to&&b.close>0&&Number.isFinite(b.close));
 if(inRange.length<=limit)return inRange;
 const step=inRange.length/limit;return Array.from({length:limit},(_,i)=>inRange[Math.min(inRange.length-1,Math.floor(i*step))]).concat(inRange.at(-1)!).filter((b,i,a)=>a.indexOf(b)===i);
}
export const dayNumber=dateDay;
