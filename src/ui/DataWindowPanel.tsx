import React,{useEffect,useRef,useState} from 'react';
import type {ChartController} from '../chart/adapter';
import type {IndicatorInstanceView} from '../chart/indicator-port';
import {defaultPlotStyle} from '../chart/indicator-rendering';
import type {IndicatorResult} from '../domain/indicators';
import type {Bar,BarDataset} from '../domain/types';
import {ChartCandlesIcon,CompareIcon,EyeIcon,HideDrawingsIcon,IndicatorsIcon} from './icons';
import type {Inspection} from './DataWindow';
import {buildDataWindow,type DataWindowComparisonInput,type DataWindowIndicatorInput,type DataWindowScriptInput,type DataWindowView} from './data-window-model';
import type {ChartClockHours} from './chart-time-text';
import './data-window-panel.css';

export type DataWindowChart=Pick<ChartController,'indicators'>&Partial<{comparisons:Pick<ChartController['comparisons'],'list'|'subscribe'>;scripts:Pick<ChartController['scripts'],'list'|'subscribe'>}>;
export interface DataWindowPanelProps {
 chart:DataWindowChart|null;
 dataset:Pick<BarDataset,'instrument'|'resolution'>|null;
 /** Displayed (calculation) bars of the active chart: Heikin Ashi charts pass transformed bars. */
 bars:readonly Bar[];
 /** Untransformed bars for "Last day change"; defaults to bars. */
 sourceBars?:readonly Bar[];
 /** Owner-checked chart inspection (App: matchingInspection). Null or not hovered means the last bar. */
 inspection:Inspection|null;
 /** Indicator instances in legend order. */
 indicators:readonly IndicatorInstanceView[];
 /** Chart time zone (App: the resolved chart timezone, chartTimeZone). */
 timezone:string;
 /** Chart time hours format (scales.timeHours) for the Time row. */
 timeHours?:ChartClockHours;
 /** Chart date format id (scales.dateFormat) for the Date row. */
 dateFormat?:string;
 /** Optional persisted "Hide data" section keys; local state otherwise. */
 hiddenSections?:readonly string[];
 onHiddenSectionsChange?:(keys:string[])=>void;
 /** Object tree selection; the matching section shows the active state. */
 activeSourceKey?:string|null;
 /** False while the tab is not shown: keeps state without computing values. */
 active?:boolean;
}
// Indicator results are immutable per accepted view object; the port replaces views on every change.
const results=new WeakMap<IndicatorInstanceView,IndicatorResult|null>();
function resultFor(chart:DataWindowChart|null,view:IndicatorInstanceView):IndicatorResult|null{
 if(results.has(view))return results.get(view)!;
 let value:IndicatorResult|null=null;try{value=chart?chart.indicators.values(view.id):null;}catch{value=null;}
 // A view read before its first calculation finished has no values yet; caching that null left the
 // indicator section empty (RSI header, no rows) until the view changed. Only a real result is kept.
 if(value&&value.series?.length)results.set(view,value);return value;
}
export function dataWindowIndicators(chart:DataWindowChart|null,views:readonly IndicatorInstanceView[]):DataWindowIndicatorInput[]{
 return views.map(view=>{
  const result=resultFor(chart,view),labels=new Map(view.series.map(row=>[row.id,row.label]));
  const plots=(result?.series??[]).map((plot,ordinal)=>{const style=view.plots?.[plot.id]??defaultPlotStyle(view.kind,plot.id,ordinal);return {id:plot.id,label:plot.label||labels.get(plot.id)||plot.id,color:style.color,dataWindow:style.dataWindow!==false,values:plot.values};});
  return {id:view.id,kind:view.kind,visible:view.visible,offset:view.offset??0,precision:view.presentation?.precision??'auto',plots};
 });
}
type ComparisonRow=ReturnType<ChartController['comparisons']['list']>[number];
type ScriptRow=ReturnType<ChartController['scripts']['list']>[number];
type Readout=NonNullable<Inspection['readout']>;
/** Compare symbols in their chart order, with their own bars, symbol precision and line colour. */
export function dataWindowComparisons(rows:readonly ComparisonRow[]):DataWindowComparisonInput[]{
 return rows.map(row=>({id:row.id,symbol:row.dataset.instrument.symbol,exchange:row.dataset.instrument.exchange,interval:row.dataset.resolution,description:row.dataset.instrument.name,tickSize:row.dataset.instrument.tickSize,color:row.color,visible:row.visible,bars:row.dataset.bars}));
}
/**
 * Script indicators and strategies. The script port keeps no plot values for the host, so the values are
 * the chart's own data window readout at the inspected bar (the same snapshot as the bar, formatted on the plot's scale). A
 * script plot's readout row is labelled "{script title} · {plot title}"; each readout group is given to the first script, in
 * chart order, that it carries a row of, so two scripts with one title keep their own values. A hidden script draws nothing
 * and the chart has no readout for it: its rows stay listed with the empty value.
 */
export function dataWindowScripts(rows:readonly ScriptRow[],readout:Readout|null|undefined):DataWindowScriptInput[]{
 const groups=(readout?.groups??[]).map(group=>new Map(group.rows.map(row=>[row.label,row]))),taken=new Set<number>();
 return rows.map(row=>{
  const descriptors=row.plotDescriptors??[],labels=descriptors.map(plot=>row.title+' · '+plot.title);
  const found=row.visible?groups.findIndex((group,index)=>!taken.has(index)&&labels.some(label=>group.has(label))):-1;
  if(found>=0)taken.add(found);
  const values=found>=0?groups[found]:null;
  const plots=descriptors.map((plot,ordinal)=>{const style=row.plots?.[plot.id],shown=values?.get(labels[ordinal]);return {id:plot.id,label:plot.title||plot.id,color:style?.color??plot.color,dataWindow:style?.dataWindow!==false,value:shown?shown.value:null};});
  return {id:row.id,title:row.title,visible:row.visible,plots};
 });
}
export interface DataWindowSources {comparisons:readonly ComparisonRow[];scripts:readonly ScriptRow[]}
const NO_SOURCES:DataWindowSources=Object.freeze({comparisons:[],scripts:[]});
/** Reads the chart's compare symbols and scripts; a chart without either port (or a failing read) lists none. */
export function readDataWindowSources(chart:DataWindowChart|null):DataWindowSources{
 if(!chart)return NO_SOURCES;
 let comparisons:readonly ComparisonRow[]=[],scripts:readonly ScriptRow[]=[];
 try{comparisons=typeof chart.comparisons?.list==='function'?chart.comparisons.list():[];}catch{comparisons=[];}
 try{scripts=typeof chart.scripts?.list==='function'?chart.scripts.list():[];}catch{scripts=[];}
 return {comparisons,scripts};
}
export function dataWindowView(props:Pick<DataWindowPanelProps,'chart'|'dataset'|'bars'|'sourceBars'|'inspection'|'indicators'|'timezone'|'timeHours'|'dateFormat'>,hidden:ReadonlySet<string>,sources:DataWindowSources=NO_SOURCES):DataWindowView|null{
 if(!props.dataset)return null;
 const shown=props.inspection?.displayed,index=shown&&shown.hovered&&shown.index>=0?shown.index:null;
 const {instrument,resolution}=props.dataset;
 return buildDataWindow({series:{symbol:instrument.symbol,exchange:instrument.exchange,interval:resolution,description:instrument.name,tickSize:instrument.tickSize},bars:props.bars,sourceBars:props.sourceBars,index,timezone:props.timezone,timeHours:props.timeHours,dateFormat:props.dateFormat,indicators:dataWindowIndicators(props.chart,props.indicators),comparisons:dataWindowComparisons(sources.comparisons),scripts:dataWindowScripts(sources.scripts,props.inspection?.readout),hidden});
}

export function DataWindowPanel(props:DataWindowPanelProps){
 const [localHidden,setLocalHidden]=useState<string[]>([]);
 const hiddenKeys=props.hiddenSections??localHidden,hidden=new Set(hiddenKeys);
 // Compare symbols and scripts are read once per chart change notification, not per crosshair frame (a
 // comparison list copies its bars). The cache is keyed by the chart and a revision that every comparisons or scripts
 // notification bumps, so add, remove, restore (an analysis restore notifies), live refresh and undo all re-read. It is
 // dropped while the tab is hidden, and showing the tab again re-reads, so a change made while hidden is never missed.
 const [revision,setRevision]=useState(0),sources=useRef<{chart:DataWindowChart|null;revision:number;value:DataWindowSources}|null>(null);
 const chart=props.chart,active=props.active!==false;
 useEffect(()=>{
  if(!active||!chart)return;
  const bump=()=>setRevision(value=>value+1),offs:Array<()=>unknown>=[];
  for(const port of [chart.comparisons,chart.scripts])if(port&&typeof port.subscribe==='function')try{offs.push(port.subscribe(bump));}catch{/* a retired port lists nothing */}
  bump();
  return()=>{for(const off of offs)try{off();}catch{/* already released */}};
 },[chart,active]);
 if(!active){sources.current=null;return <section className="lv-dw" aria-label="Data window"/>;}
 if(!sources.current||sources.current.chart!==chart||sources.current.revision!==revision)sources.current={chart,revision,value:readDataWindowSources(chart)};
 const view=dataWindowView(props,hidden,sources.current.value);
 const toggle=(key:string)=>{const next=hidden.has(key)?hiddenKeys.filter(item=>item!==key):[...hiddenKeys,key];if(props.onHiddenSectionsChange)props.onHiddenSectionsChange(next);else setLocalHidden(next);};
 return <section className="lv-dw" aria-label="Data window" data-hovered={view?.hovered?'true':'false'} data-bar-index={view?.index}>
  {!view?<p className="lv-dw-empty">No chart is open.</p>:<>
   <div className="lv-dw-date" role="list" aria-label="Bar date">{view.date.map(row=><div key={row.key} role="listitem" className="lv-dw-row" data-row={row.key}><span className="lv-dw-label">{row.label}</span><span className="lv-dw-value">{row.value}</span></div>)}</div>
   <div className="lv-dw-sections" role="list" aria-label="Data window sources">
    {view.sections.map(section=><div key={section.key} role="listitem" data-role="menuitem" data-section={section.key} aria-label={section.title} className={'lv-dw-section'+(section.key===props.activeSourceKey?' is-active':'')+(section.visible?'':' is-source-hidden')+(section.hidden?' is-data-hidden':'')}>
     <div className="lv-dw-section-header">
      <span className="lv-dw-section-icon" aria-hidden="true">{section.kind==='series'?<ChartCandlesIcon width={28} height={28}/>:section.kind==='compare'?<CompareIcon width={28} height={28}/>:<IndicatorsIcon width={28} height={28}/>}</span>
      <span className="lv-dw-section-title" title={section.tooltip||undefined}>{section.title}</span>
      <button type="button" className="lv-dw-hide" aria-label={section.hidden?'Show data':'Hide data'} title={section.hidden?'Show data':'Hide data'} aria-pressed={section.hidden} onClick={()=>toggle(section.key)}>{section.hidden?<HideDrawingsIcon width={22} height={22}/>:<EyeIcon width={22} height={22}/>}</button>
     </div>
     {section.rows.map(row=><div key={row.key} className="lv-dw-row" data-row={row.key}><span className="lv-dw-label">{row.label}</span><span className="lv-dw-value" style={row.color?{color:row.color}:undefined}>{row.value}</span></div>)}
    </div>)}
   </div>
  </>}
 </section>;
}
