import React,{useMemo,useState} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {FactsDocument} from '../fundamentals/company-facts';
import {statementCurrencies} from '../fundamentals/statements';
import {FX_POLICY,moveGraphItem,GRAPH_METRICS,GRAPH_RANGES,GRAPH_SCALES,MAX_GRAPH_DOCUMENTS,MAX_GRAPH_METRICS,applyRange,buildGraphSeries,constrainGraphConfig,createGraphConfig,dayNumber,overlayPoints,scaleSeries,type GraphConfig,type SnapshotBackground,type GraphScale,type GraphView,type PriceOverlayBar,type ScaledSeries} from '../fundamentals/graph';
import type {StatementBasis} from '../fundamentals/statements';
import {Select} from './Select';
import './fundamentals.css';
export const SERIES_COLORS=['#5d9eff','#f2b24c','#4cc9a0','#e86b8a','#a98bf0','#6ccbe0','#c7d36f','#ff8f6b'];
const OVERLAY_COLOR='#8a97ad';
export interface GraphPalette {bg:string;text:string;muted:string;grid:string}
export const SCREEN_PALETTE:GraphPalette={bg:'transparent',text:'var(--lv-text-primary)',muted:'var(--lv-text-secondary)',grid:'var(--lv-divider)'};
const W=880,H=320,L=64,T=12,B=30;
export function compact(value:number,measure:string):string{
 const abs=Math.abs(value);
 if(measure==='currency'||measure==='shares'){const [d,s]=abs>=1e12?[1e12,'T']:abs>=1e9?[1e9,'B']:abs>=1e6?[1e6,'M']:abs>=1e3?[1e3,'K']:[1,''];return (value/d).toLocaleString('en-US',{maximumFractionDigits:abs/d>=100?0:2})+s;}
 return value.toLocaleString('en-US',{maximumFractionDigits:2});
}
function niceTicks(lo:number,hi:number,count:number){return Array.from({length:count},(_,i)=>lo+(hi-lo)*i/(count-1));}
export interface GraphChartProps {series:ScaledSeries[];scale:GraphScale;overlay:PriceOverlayBar[]|null;palette:GraphPalette;legend?:boolean;hoverDate?:string|null;/** Per-series color (STYLE_COLORS); defaults to the palette order. */colors?:string[]}
/** Pure SVG chart: renders identically on screen and through renderToStaticMarkup for the PNG snapshot. */
export function GraphChart({series,scale,overlay,palette,legend=false,hoverDate=null,colors}:GraphChartProps){
 const color=(i:number)=>colors?.[i]??SERIES_COLORS[i%SERIES_COLORS.length];
 const R=overlay&&overlay.length>1?56:16,legendRows=legend?Math.ceil((series.length+(overlay?1:0))/2):0,height=H+legendRows*18+(legend?8:0);
 const days=series.flatMap(s=>s.points.map(p=>dayNumber(p.end)));
 if(!days.length)return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Fundamentals graph (no data)" className="fund-graph-svg"><text x={W/2} y={H/2} textAnchor="middle" style={{fill:palette.muted,fontSize:13}}>No values to draw for this selection</text></svg>;
 let x0=Math.min(...days),x1=Math.max(...days);if(x0===x1){x0-=1;x1+=1;}
 const log=scale==='log',tf=(v:number)=>log?Math.log10(v):v,vals=series.flatMap(s=>s.points.map(p=>tf(p.value)));
 let y0=Math.min(...vals),y1=Math.max(...vals);if(scale==='percent'||scale==='indexed'){y0=Math.min(y0,scale==='percent'?0:100);y1=Math.max(y1,scale==='percent'?0:100);}else if(!log&&y0>0&&y0/y1>0.5){/* keep zero baseline out of narrow ranges */}else if(!log){y0=Math.min(y0,0);y1=Math.max(y1,0);}
 if(y0===y1){y0-=1;y1+=1;}const pad=(y1-y0)*0.06;y0-=pad;y1+=pad;
 const px=(d:number)=>L+(d-x0)/(x1-x0)*(W-L-R),py=(v:number)=>T+(1-(tf(v)-y0)/(y1-y0))*(H-T-B);
 const yTicks=niceTicks(y0,y1,5).map(v=>log?10**v:v),measure=series[0].measure;
 const xTicks:{d:number;label:string}[]=[];for(let y=new Date(x0*86400000).getUTCFullYear();y<=new Date(x1*86400000).getUTCFullYear()+1;y++){const d=Date.UTC(y,0,1)/86400000;if(d>=x0&&d<=x1)xTicks.push({d,label:String(y)});}
 // A short range has under three year starts: label the period ends themselves instead.
 if(xTicks.length<3){const ends=[...new Set(series.flatMap(s=>s.points.map(p=>p.end)))].sort();xTicks.length=0;const every=Math.max(1,Math.ceil(ends.length/6));ends.forEach((end,i)=>{if(i%every===0)xTicks.push({d:dayNumber(end),label:end.slice(0,7)});});}
 const fmt=(v:number)=>scale==='percent'?v.toFixed(0)+'%':scale==='indexed'?v.toFixed(0):compact(v,measure);
 let ov:{d:string;lo:number;hi:number}|null=null;
 if(overlay&&overlay.length>1){const lo=Math.min(...overlay.map(b=>b.close)),hi=Math.max(...overlay.map(b=>b.close)),span=hi-lo||1;ov={d:overlay.map((b,i)=>(i?'L':'M')+px(dayNumber(b.date)).toFixed(1)+' '+(T+(1-(b.close-lo)/span)*(H-T-B)).toFixed(1)).join(' '),lo,hi};}
 const hx=hoverDate?px(dayNumber(hoverDate)):null;
 return <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label="Fundamentals graph" className="fund-graph-svg" style={{background:palette.bg,fontFamily:'system-ui,sans-serif'}}>
  {yTicks.map((v,i)=><g key={i}><line x1={L} x2={W-R} y1={py(v)} y2={py(v)} style={{stroke:palette.grid}} strokeWidth={1}/><text x={L-8} y={py(v)+4} textAnchor="end" style={{fill:palette.muted,fontSize:11}}>{fmt(v)}</text></g>)}
  {xTicks.map(t=><g key={t.d}><line x1={px(t.d)} x2={px(t.d)} y1={H-B} y2={H-B+4} style={{stroke:palette.muted}}/><text x={px(t.d)} y={H-B+16} textAnchor="middle" style={{fill:palette.muted,fontSize:11}}>{t.label}</text></g>)}
  {ov&&<g><path d={ov.d} fill="none" stroke={OVERLAY_COLOR} strokeWidth={1.2} strokeDasharray="4 3"/><text x={W-R+6} y={T+10} style={{fill:palette.muted,fontSize:10}}>{ov.hi.toLocaleString('en-US',{maximumFractionDigits:2})}</text><text x={W-R+6} y={H-B} style={{fill:palette.muted,fontSize:10}}>{ov.lo.toLocaleString('en-US',{maximumFractionDigits:2})}</text></g>}
  {series.map((s,i)=>s.points.length>0&&<g key={s.key}><path d={s.points.map((p,j)=>(j?'L':'M')+px(dayNumber(p.end)).toFixed(1)+' '+py(p.value).toFixed(1)).join(' ')} fill="none" stroke={color(i)} strokeWidth={2} strokeLinejoin="round"/>{s.points.map(p=><circle key={p.end} cx={px(dayNumber(p.end))} cy={py(p.value)} r={2.6} fill={color(i)}/>)}</g>)}
  {hx!==null&&<line x1={hx} x2={hx} y1={T} y2={H-B} style={{stroke:palette.muted}} strokeDasharray="2 3"/>}
  {legend&&[...series.map((s,i)=>({label:s.entity+' '+s.label,color:color(i)})),...(overlay?[{label:'Close price (own axis)',color:OVERLAY_COLOR}]:[])].map((row,i)=><g key={i} transform={`translate(${L+(i%2)*400},${H+6+Math.floor(i/2)*18})`}><rect width={10} height={10} y={-9} fill={row.color}/><text x={16} style={{fill:palette.text,fontSize:11}}>{row.label}</text></g>)}
 </svg>;
}
export const COLOR_NAMES=['Blue','Amber','Green','Rose','Violet','Cyan','Lime','Coral'];
/** Snapshot palettes: the current theme tokens, a fixed light page, or transparent with theme text. */
export function snapshotPalette(background:SnapshotBackground,token:(name:string,fallback:string)=>string):GraphPalette{
 if(background==='light')return {bg:'#ffffff',text:'#1b2230',muted:'#5a6577',grid:'#d9dee7'};
 const theme={bg:token('--lv-bg-raised','#1a2231'),text:token('--lv-text-primary','#e6ecf5'),muted:token('--lv-text-secondary','#a4b3c9'),grid:token('--lv-divider','#354056')};
 return background==='transparent'?{...theme,bg:'transparent'}:theme;
}
export interface FundamentalsGraphProps {documents:FactsDocument[];asOf:string|null;initial?:GraphConfig;onSave?:(config:GraphConfig)=>boolean|void;priceBars?:PriceOverlayBar[]|null;priceLabel?:string;onError:(message:string)=>void}
export function FundamentalsGraph({documents,asOf,initial,onSave,priceBars=null,priceLabel='',onError}:FundamentalsGraphProps){
 const [config,setConfig]=useState<GraphConfig>(()=>{const base=initial??createGraphConfig();return constrainGraphConfig(base.documentIds.length?base:{...base,documentIds:documents.slice(0,1).map(d=>d.id)});}),[hover,setHover]=useState<string|null>(null),[status,setStatus]=useState('');
 const update=(patch:Partial<GraphConfig>)=>{setConfig(c=>constrainGraphConfig({...c,...patch}));setStatus('');};
 const built=useMemo(()=>buildGraphSeries(documents,config,asOf),[documents,config,asOf]);
 const shown=useMemo(()=>applyRange(built.series,config.range).map(s=>scaleSeries(s,config.scale)),[built,config.range,config.scale]);
 const units=new Set(shown.filter(s=>s.points.length).map(s=>s.scaledUnit)),mixed=config.scale==='regular'&&units.size>1,logMixed=config.scale==='log'&&units.size>1;
 const allEnds=shown.flatMap(s=>s.points.map(p=>p.end)).sort(),overlay=useMemo(()=>config.overlay&&priceBars&&allEnds.length?overlayPoints(priceBars,allEnds[0],allEnds.at(-1)!):null,[config.overlay,priceBars,allEnds.join(',')]);
 const hoverRows=hover?shown.flatMap((s,i)=>{const p=[...s.points].reverse().find(q=>q.end<=hover);return p?[{color:SERIES_COLORS[config.colors[s.key]??i%SERIES_COLORS.length],label:s.entity+' '+s.label,end:p.end,value:p.value,unit:s.scaledUnit,measure:s.measure}]:[];}):[];
 const seriesColors=shown.map((s,i)=>SERIES_COLORS[config.colors[s.key]??i%SERIES_COLORS.length]);
 const currencies=[...new Set(documents.filter(d=>config.documentIds.includes(d.id)).flatMap(d=>{try{return statementCurrencies(d.facts,asOf);}catch{return [];}}))].sort();
 const setColor=(key:string,index:number)=>{const next={...config.colors,[key]:index};const keys=Object.keys(next);if(keys.length>16)delete next[keys[0]];update({colors:next});};
 const docOptions=documents.map(d=>({value:d.id,label:d.facts.entityName+' (CIK '+d.facts.cik+')'}));
 const picker=(kind:'symbol'|'metric')=>{
  const byDoc=kind==='symbol',single=(config.view==='symbol')===byDoc,ids=byDoc?config.documentIds:config.metricIds,max=byDoc?MAX_GRAPH_DOCUMENTS:MAX_GRAPH_METRICS;
  const all=byDoc?docOptions:GRAPH_METRICS.map(m=>({value:m.id,label:m.label})),label=(id:string)=>all.find(o=>o.value===id)?.label??id;
  const set=(next:string[])=>update(byDoc?{documentIds:next}:{metricIds:next});
  if(single)return <label>{byDoc?'Company':'Metric'}<Select aria-label={byDoc?'Graph company':'Graph metric'} value={ids[0]??''} onChange={v=>set([v])} options={[{value:'',label:byDoc?'Choose company':'Choose metric',disabled:true},...all]}/></label>;
  return <div className="fund-chips" aria-label={byDoc?'Graph companies':'Graph metrics'}>{ids.map((id,i)=><span key={id} className="fund-chip">{ids.length>1&&<span className="fund-graph-order"><button aria-label={'Move '+label(id)+' earlier'} disabled={i===0} onClick={()=>set(moveGraphItem(ids,id,-1))}>‹</button><button aria-label={'Move '+label(id)+' later'} disabled={i===ids.length-1} onClick={()=>set(moveGraphItem(ids,id,1))}>›</button></span>}{label(id)}<button aria-label={'Remove '+label(id)} onClick={()=>set(ids.filter(x=>x!==id))}>×</button></span>)}
   {ids.length<max&&<Select aria-label={byDoc?'Add company':'Add metric'} value="" onChange={v=>v&&set([...ids,v])} options={[{value:'',label:byDoc?'Add company':'Add metric'},...all.filter(o=>!ids.includes(o.value))]}/>}</div>;
 };
 async function snapshot(){
  try{
   if(!window.lv)throw new Error('Image export needs the desktop app.');
   if(!shown.some(s=>s.points.length))throw new Error('There is nothing to export for this selection.');
   const root=getComputedStyle(document.documentElement),v=(n:string,f:string)=>root.getPropertyValue(n).trim()||f;
   const palette=snapshotPalette(config.snapshot.background,v);
   const markup=renderToStaticMarkup(<GraphChart series={shown} scale={config.scale} overlay={overlay} palette={palette} legend={config.snapshot.legend} colors={seriesColors}/>).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
   const box=/viewBox="0 0 (\d+) (\d+)"/.exec(markup)!,w=Number(box[1]),h=Number(box[2]);
   const image=new Image();const loaded=new Promise<void>((ok,fail)=>{image.onload=()=>ok();image.onerror=()=>fail(new Error('The graph could not be rendered to an image.'));});
   image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup.replace('width="100%"','width="'+w+'" height="'+h+'"'));await loaded;
   const canvas=document.createElement('canvas');canvas.width=w*2;canvas.height=h*2;const ctx=canvas.getContext('2d')!;ctx.scale(2,2);ctx.drawImage(image,0,0,w,h);
   const result=await window.lv.exportChart({pngDataUrl:canvas.toDataURL('image/png'),suggestedName:'OpenCandle-fundamentals-graph.png'});
   if(!result.ok&&result.error.code!=='CANCELLED')onError(result.error.message);else if(result.ok)setStatus('Graph image exported locally.');
  }catch(e){onError(e instanceof Error?e.message:String(e));}
 }
 function save(){if(!onSave){onError('Saving needs the workspace.');return;}const ok=onSave(config);setStatus(ok===false?'':'Graph configuration saved.');}
 return <div className="fund-graph">
  <div className="fund-graph-bar">
   <label>View<Select aria-label="Graph view" value={config.view} onChange={v=>update({view:v as GraphView})} options={[{value:'symbol',label:'By company'},{value:'metric',label:'By metric'}]}/></label>
   {picker('symbol')}{picker('metric')}
  </div>
  <div className="fund-graph-bar">
   <label>Period<Select aria-label="Graph period" value={config.basis} onChange={v=>update({basis:v as StatementBasis})} options={[{value:'FY',label:'Annual (FY)'},{value:'FQ',label:'Quarterly (FQ)'},{value:'TTM',label:'Trailing twelve months (TTM)'}]}/></label>
   <label>Scale<Select aria-label="Graph scale" value={config.scale} onChange={v=>update({scale:v as GraphScale})} options={GRAPH_SCALES.map(([value,label])=>({value,label}))}/></label>
   <div className="fund-range" role="group" aria-label="Graph date range">{GRAPH_RANGES.map(([value,label])=><button key={value} aria-pressed={config.range===value} className={config.range===value?'active':''} onClick={()=>update({range:value})}>{value==='all'?'All':value}<span className="sr-only"> {label}</span></button>)}</div>
   <label>Currency<Select aria-label="Graph currency" value={config.currency??''} onChange={v=>update({currency:v||null})} options={[{value:'',label:'Main reported currency'},...currencies.map(c=>({value:c,label:c})),...(config.currency&&!currencies.includes(config.currency)?[{value:config.currency,label:config.currency+' (not reported)'}]:[])]}/></label>
   <label className="fund-check"><input type="checkbox" aria-label="Show price overlay" checked={config.overlay&&!!priceBars} disabled={!priceBars} onChange={e=>update({overlay:e.target.checked})}/>Price overlay</label>
  </div>
  <p className="help">{FX_POLICY}</p>
  {!priceBars&&<p className="help">Price overlay is not available: no loaded price series was passed for the chart symbol.</p>}
  {overlay&&<p className="help">Dashed line: {priceLabel||'loaded close'} on its own right-hand axis (minimum to maximum). It is a loaded-data overlay, not a fundamentals value.</p>}
  {mixed&&<p className="help" role="note">These lines use different units. Switch to Percent change or Indexed to 100 to compare them honestly.</p>}
  {logMixed&&<p className="help" role="note">These lines use different units on one logarithmic axis. Read each line against its own legend unit.</p>}
  <div className="fund-graph-frame" onMouseLeave={()=>setHover(null)} onMouseMove={e=>{const r=e.currentTarget.getBoundingClientRect(),f=(e.clientX-r.left)/r.width*W;const ends=[...new Set(shown.flatMap(s=>s.points.map(p=>p.end)))].sort();if(!ends.length)return;const lo=dayNumber(ends[0]),hi=dayNumber(ends.at(-1)!),target=lo+(f-L)/(W-L-(overlay?56:16))*(hi-lo);setHover(ends.reduce((a,b)=>Math.abs(dayNumber(b)-target)<Math.abs(dayNumber(a)-target)?b:a));}}>
   <GraphChart series={shown} scale={config.scale} overlay={overlay} palette={SCREEN_PALETTE} hoverDate={hover} colors={seriesColors}/>
  </div>
  <ul className="fund-legend" aria-label="Graph legend">{shown.map((s,i)=><li key={s.key}><span className="fund-swatch" style={{background:seriesColors[i]}}/><Select aria-label={'Color for '+s.entity+' '+s.label} value={String(config.colors[s.key]??i%SERIES_COLORS.length)} onChange={v=>setColor(s.key,Number(v))} options={SERIES_COLORS.map((_,n)=>({value:String(n),label:COLOR_NAMES[n]}))}/>{s.entity} · {s.label} ({s.basis}) · {s.scaledUnit} · {s.points.length} point{s.points.length===1?'':'s'}{s.notes.map(n=><em key={n}> {n}</em>)}</li>)}</ul>
  <p className="help fund-readout" aria-live="polite">{hoverRows.length?hoverRows.map(r=>r.label+' '+compact(r.value,config.scale==='regular'||config.scale==='log'?r.measure:'x')+' '+r.unit+' (period ending '+r.end+')').join(' · '):'Move over the graph to read values at a period end.'}</p>
  {built.notices.map(n=><p key={n} className="help" role="note">{n}</p>)}
  {!built.series.length&&<p className="help">Choose saved company data and at least one metric to draw a graph.</p>}
  <div className="screener-toolbar"><button onClick={()=>void snapshot()}>Snapshot PNG</button><label className="fund-check"><input type="checkbox" aria-label="Include legend in snapshot" checked={config.snapshot.legend} onChange={e=>update({snapshot:{...config.snapshot,legend:e.target.checked}})}/>Legend</label><label>Background<Select aria-label="Snapshot background" value={config.snapshot.background} onChange={v=>update({snapshot:{...config.snapshot,background:v as SnapshotBackground}})} options={[{value:'theme',label:'Current theme'},{value:'light',label:'Light'},{value:'transparent',label:'Transparent'}]}/></label><button onClick={save}>Save configuration</button><button onClick={()=>{setConfig(constrainGraphConfig({...createGraphConfig(),documentIds:documents.slice(0,1).map(d=>d.id)}));setStatus('');}}>Reset graph</button><span className="help" aria-live="polite">{status}</span></div>
 </div>;
}
