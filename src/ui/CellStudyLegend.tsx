import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {ChartController} from '../chart/adapter';
import type {IndicatorInstanceView} from '../chart/indicator-port';
import type {ScriptPresentationMetadataRow} from '../chart/script-port';
import {readScriptReadoutPosition,type ScriptReadoutSnapshot} from '../chart/script-presentation-proof';
import type {ScriptBinding} from './script-library';
import type {ChartSettingsDocument} from '../chart/chart-settings-document';
import type {ChartAppearance} from './themes';
import {PaneIndicatorLayer,PaneLegendMenu} from './PaneIndicatorLayer';
import {indicatorInstanceLabels,indicatorAcronyms,indicatorDataStatus} from './indicator-dialog-model';
import {indicatorLegendArguments,indicatorLegendReadout} from '../chart/indicator-display';
import {legendButtons,legendMoreMenu,LEGEND_TOGGLER_QA_ID,indicatorOrderState,indicatorVisualOrderAvailable,visualOrderItems,isIndicatorOrderStep,type LegendMoreItemId} from '../chart/legend-model';
import {legendButtonView,legendMoreMenuView,legendValuesView,legendPaneView,indicatorReasonView,type LegendSubmenuItem} from './indicator-legend-view';
import {indicatorMoveChoices} from './indicator-move-targets';
import {readIndicatorScalePlacement,indicatorScaleSides} from '../chart/indicator-scale';
import {pinToScaleMenu,pinToScalePlacement} from './object-tree-model';
import {formatIndicatorValue,DATA_WINDOW_EMPTY} from './data-window-model';
import {statusLinePriceFormat} from '../chart/status-line-model';
import {isSymbolMathDatasetId} from '../domain/symbol-math-live';
import {builtinStudyFingerprint,scriptStudyFingerprint,type CellStudyAction,type CellStudySubject,type CellStudyInspectionStream,type CellStudyPositionAddress} from './cell-study-intents';
import {ChevronDownIcon} from './icons';
import {legendRowMenuProps} from './legend-row-menu';
import {ScriptSettingsDialog,useScriptOutput} from './ScriptSettingsDialog';
import {scriptLegendButtons,useScriptLegendInputs} from './script-legend-inputs';
import {scriptPriceScaleControlsForSettings} from './script-price-scale-controls';
import {ScriptRuntimeErrorMark} from './ScriptRuntimeErrorMark';
import {defaultPlotStyle,type IndicatorPlotStyle} from '../chart/indicator-port';
import {parseIndicatorSource} from '../domain/indicator-source';
import type {IndicatorId} from '../domain/indicators';

/**
 * The legend plates follow the chart template, not the app shell. The cell root carries the template's pane
 * colour (--lv-chart-background, gradient start for a gradient pane: the legend sits at the top) and data-chart-surface, so a light
 * template gets dark legend text (components.css / indicator-legend.css). Luminance threshold (0.5 relative).
 */
export function chartSurfaceColor(appearance:Pick<ChartAppearance,'backgroundType'|'background'|'gradientStart'>|null|undefined):string|null{
 if(!appearance)return null;
 const value=appearance.backgroundType==='gradient'?appearance.gradientStart:appearance.background;
 return typeof value==='string'&&value.trim()?value.trim():null;
}
export function chartSurfaceLight(color:string|null):boolean{
 if(!color)return false;
 let r:number,g:number,b:number;
 const hex=/^#([0-9a-f]{3,8})$/i.exec(color),rgb=/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(color);
 if(hex){const h=hex[1].length<6?hex[1].slice(0,3).split('').map(c=>c+c).join(''):hex[1].slice(0,6);r=parseInt(h.slice(0,2),16);g=parseInt(h.slice(2,4),16);b=parseInt(h.slice(4,6),16);}
 else if(rgb){r=Number(rgb[1]);g=Number(rgb[2]);b=Number(rgb[3]);}
 else return false;
 const lin=(v:number)=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
 return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)>0.5;
}
/** Attributes for the element that holds a chart's legends: the template pane colour and its light/dark surface. */
export function chartSurfaceProps(appearance:Pick<ChartAppearance,'backgroundType'|'background'|'gradientStart'>|null|undefined):{style?:React.CSSProperties;'data-chart-surface'?:'light'|'dark'}{
 const color=chartSurfaceColor(appearance);
 return color?{style:{['--lv-chart-background' as string]:color},'data-chart-surface':chartSurfaceLight(color)?'light':'dark'}:{};
}

interface ScalarValue {precision?:number|'auto';plots:readonly {label:string;color:string;value:number|null;legend?:boolean;dataWindow?:boolean}[]}
interface ScalarView {state:'unavailable'|'ready';assertCurrent?:()=>void;readAt?:(time:number)=>ScalarValue;readPosition?:(position:CellStudyPositionAddress)=>ScalarValue}
export interface CellStudyLegendProps {
 chart:ChartController;cellId:string;owner:object;isCurrent:()=>boolean;visible:boolean;
 bindings:readonly ScriptBinding[];favorites:readonly string[];settings:ChartSettingsDocument;appearance:ChartAppearance;tickSize:number;
 stream:CellStudyInspectionStream;inspectTime:(time:number|null,ghost:boolean)=>number|null;
 onAction:(subject:CellStudySubject,action:CellStudyAction)=>boolean;
}
/** Bar times per chart for the indicator-on-indicator fallback below, refreshed when the bar count changes. */
const barTimes=new WeakMap<object,readonly number[]>();
/** An indicator calculated on another indicator (SMA on RSI) has no proven scalar readout (the readout proof admits price
 * sources only), so an inactive cell showed the empty glyph while its scale tag read 35.86. Such a row reads the same accepted
 * values the active cell's legend reads (peekValues, indexed by calculation bar), at the inspected bar or the last bar. */
export function indicatorOnIndicatorPlots(chart:Pick<ChartController,'indicators'|'getSourceBars'>,row:Pick<IndicatorInstanceView,'id'|'kind'|'plots'|'inputs'>,time:number|null):ScalarValue|null{
 if(!parseIndicatorSource(row.inputs?.source))return null;
 const port=chart.indicators as unknown as {peekValues?:(id:string)=>{series:readonly {id:string;values:ArrayLike<number|null>}[]};values:(id:string)=>{series:readonly {id:string;values:ArrayLike<number|null>}[]}};
 const result=port.peekValues?.(row.id)??port.values(row.id);if(!result.series.length)return null;
 const count=result.series[0].values.length;let index=count-1;
 if(time!==null){
  let times=barTimes.get(chart);if(!times||times.length!==count){times=chart.getSourceBars().map(bar=>bar.time);barTimes.set(chart,times);}
  let low=0,high=times.length-1;index=-1;while(low<=high){const mid=(low+high)>>>1;if(times[mid]===time){index=mid;break;}if(times[mid]<time)low=mid+1;else high=mid-1;}
 }
 return{plots:result.series.map((series,plot)=>{const style=row.plots?.[series.id]??defaultPlotStyle(row.kind as IndicatorId,series.id,plot),value=index>=0&&index<series.values.length?series.values[index]:null;return{label:series.id,color:style.color,value:typeof value==='number'&&Number.isFinite(value)?value:null,legend:style.visible!==false&&style.legend!==false};})};
}
const ownerKeys=new WeakMap<object,string>();let ownerSequence=0;
function ownerKey(owner:object):string{let key=ownerKeys.get(owner);if(!key){key=String(++ownerSequence);ownerKeys.set(owner,key);}return key;}
/** Full study rows use actual per-cell metadata/panes. Scalar readers never grant commands. */
export function CellStudyLegend(props:CellStudyLegendProps){
 const latest=useRef(props);latest.current=props;
 const host=useRef<HTMLDivElement|null>(null),[expanded,setExpanded]=useState(true),[menu,setMenu]=useState<{id:string;open:LegendMoreItemId|null}|null>(null),[,setRevision]=useState(0),[problem,setProblem]=useState('');
 const [metadata,setMetadata]=useState<{chart:ChartController;owner:object;rows:IndicatorInstanceView[];scripts:readonly ScriptPresentationMetadataRow[];fingerprints:ReadonlyMap<string,string>;tables?:ReadonlyMap<string,number>}|null>(null);
 const [inspection,setInspection]=useState<{chart:ChartController;owner:object;time:number|null;position:CellStudyPositionAddress}|null>(null);
 const scriptFingerprints=useMemo(()=>new Map(props.bindings.map(binding=>[binding.id,scriptStudyFingerprint(binding)])),[props.bindings]);
 const current=()=>latest.current.visible&&latest.current.owner===props.owner&&latest.current.chart===props.chart&&latest.current.isCurrent();
 const inputText=useScriptLegendInputs(props.chart,props.bindings,props.visible&&props.settings.statusLine.indicatorInputs,props.owner,current);
 const hasStudies=!!(metadata?.chart===props.chart&&metadata.owner===props.owner&&metadata.rows.length)||props.bindings.length>0;
 useEffect(()=>{
  const {chart,cellId,owner,stream}=props;let alive=true,frame=0,metadataDirty=true;const off:Array<()=>void>=[];
  const sourceOwns=()=>alive&&latest.current.chart===chart&&latest.current.owner===owner&&latest.current.isCurrent(),owns=()=>sourceOwns()&&latest.current.visible;
  const releaseAll=()=>{for(const release of off.splice(0))try{release();}catch{/* Every acquired subscription must be released. */}};
  const refresh=()=>{frame=0;if(!owns())return;
   if(metadataDirty){metadataDirty=false;try{const rows=chart.indicators.list(),scripts=chart.scripts.presentationMetadata?.()??[],fingerprints=new Map(rows.map(row=>[row.id,builtinStudyFingerprint(row)]));const tables=new Map((chart.scripts.tableInventory?.()??[]).map(row=>[row.id,row.count] as const));if(owns())setMetadata({chart,owner,rows,scripts,fingerprints,tables});}catch{if(owns())setMetadata({chart,owner,rows:[],scripts:[],fingerprints:new Map()});}}
   stream.refresh(cellId,owner);if(owns())setRevision(value=>value+1);
  };
  const schedule=(metadataChanged=false)=>{if(!owns())return;metadataDirty||=metadataChanged;if(!frame)frame=requestAnimationFrame(refresh);};
  const cleanup=()=>{alive=false;if(frame)cancelAnimationFrame(frame);releaseAll();};
  try{
   let resolvedTime:number|null=null;off.push(stream.register(cellId,{chart,owner,isCurrent:sourceOwns,resolve:(time,ghost)=>latest.current.inspectTime(time,ghost),resolvePosition:(time,ghost,resolved)=>time===null&&!ghost?{kind:'latest'}:resolved===null?{kind:'unavailable'}:{kind:'axis-time',time:resolved}},time=>{resolvedTime=time;},value=>{if(owns()&&value.owner===owner&&value.chart===chart)setInspection({chart,owner,time:resolvedTime,position:value.address});}));
   if(props.visible){off.push(chart.indicators.subscribe(()=>schedule(true)));off.push(chart.scripts.subscribe(()=>schedule(true)));}
   off.push(chart.onMarketApplied(()=>{stream.invalidate(cellId,owner);schedule(true);}));
   off.push(chart.onViewportChanged(()=>{stream.invalidate(cellId,owner);schedule();}));
   if(props.visible)refresh();
  }catch{cleanup();if(latest.current.owner===owner&&latest.current.chart===chart)setProblem('Study updates are temporarily unavailable.');}
  return cleanup;
 },[props.chart,props.cellId,props.owner,props.visible,props.stream]);
 useEffect(()=>{if(!current())setMenu(null);},[props.owner,props.visible]);
 if(!props.visible)return null;
 if(!hasStudies)return problem?<p className="lv-study-control-message" role="status">{problem}</p>:null;
 const rows=metadata?.chart===props.chart&&metadata.owner===props.owner?metadata.rows:[],scripts=metadata?.chart===props.chart&&metadata.owner===props.owner?metadata.scripts:[];
 const background=props.settings.statusLine.background.visible?'color-mix(in srgb, var(--lv-chart-background, #0f0f0f) '+Math.max(0,Math.min(100,100-props.settings.statusLine.background.transparency))+'%, transparent)':'transparent';
 const labels=indicatorInstanceLabels(rows),currentInspection=inspection?.chart===props.chart&&inspection.owner===props.owner?inspection:null,time=currentInspection?.time??null;
 // One additional owner check for all published reasons; no scalar/history read.
 const reasonCurrent=expanded&&rows.some(row=>row.visible&&(!row.informationBars||row.diagnostics.length>0&&!row.series.length))&&(()=>{try{return current();}catch{return false;}})();
 const issue=(subject:CellStudySubject,action:CellStudyAction)=>{setMenu(null);try{if(!current()||!latest.current.onAction(subject,action))throw Error('This chart is busy or changed. Open its study controls again.');setProblem('');return true;}catch{setProblem('This chart is busy or changed. Open its study controls again.');return false;}};
 // Display precision shares one current main-series reference per whole legend render. It never supplies script values.
 let scriptFormatter:((value:number)=>string)|undefined,scriptFormatCurrent:(()=>void)|undefined,scriptFormatError:unknown,scriptFormatAttempted=false;
 const formatScriptValue=(value:number|null):string=>{
  if(typeof value!=='number'||!Number.isFinite(value))return DATA_WINDOW_EMPTY;
  if(scriptFormatAttempted&&!scriptFormatter)throw scriptFormatError;
  if(!scriptFormatter){scriptFormatAttempted=true;try{
   const precision=props.settings.symbol.precision;let reference:number|null=null;
   if(precision===undefined||precision==='default'){
    if(!current())throw Error('The cell changed.');const source=props.chart.getSourceContext();if(!current())throw Error('The cell changed.');
    if(isSymbolMathDatasetId(source.datasetId)){
     const view=props.chart.captureSeriesReadout();if(!current()||view.state!=='ready')throw Error('A current main-series display reference is unavailable.');view.assertCurrent();
     const shown=view.readPosition(currentInspection?.position??{kind:'unavailable'});view.assertCurrent();if(!current()||!shown.bar||!Number.isFinite(shown.bar.close))throw Error('A current main-series display reference is unavailable.');reference=shown.bar.close;scriptFormatCurrent=()=>view.assertCurrent();
    }
   }
   scriptFormatter=statusLinePriceFormat(precision,props.tickSize,reference);
  }catch(error){scriptFormatError=error;throw error;}}
  return scriptFormatter(value);
 };
 const scalar=(kind:'builtin'|'script',id:string,row?:IndicatorInstanceView)=>{
  if(!expanded||props.appearance.indicatorValuesVisible===false)return null;
  try{
   if(!current())throw Error('No current per-cell inspection.');
   let value:ScalarValue,scriptView:ScriptReadoutSnapshot|undefined;
   if(kind==='script'){
    scriptView=props.chart.scripts.captureReadout?.(id);value=readScriptReadoutPosition(scriptView as ScriptReadoutSnapshot,currentInspection?.position??{kind:'unavailable'});
   }else{
    const reader=props.chart.indicators as unknown as {captureReadout?:(id:string)=>ScalarView},view=reader.captureReadout?.(id),at=currentInspection?.position.kind==='axis-time'?currentInspection.position.time:currentInspection?.position.kind==='unavailable'?undefined:null,onIndicator=row&&at!==undefined&&(view?.state!=='ready'||!view.readAt)?indicatorOnIndicatorPlots(props.chart,row,at):null;if(onIndicator)value=onIndicator;else{if(view?.state!=='ready'||!view.readAt||time===null)throw Error('No current accepted readout.');view.assertCurrent?.();value=view.readAt(time);}
   }
   if(!current())throw Error('The cell changed.');
   let shown:React.ReactNode;
   if(kind==='script'){
    const parts=value.plots.filter(plot=>plot.legend!==false);shown=parts.length?<span className="lv-legend-values" data-legend-values="true">{parts.map((plot,index)=><span key={index} data-plot={plot.label} style={{color:plot.color}}>{formatScriptValue(plot.value)}</span>)}</span>:null;
   }else shown=legendValuesView(value.plots.filter(plot=>plot.legend!==false).map(plot=>({plot:plot.label,text:row?formatIndicatorValue(plot.value,row.kind,value.precision??2,props.tickSize):formatScriptValue(plot.value),color:plot.color})));
   // The formatter may cross a main-series boundary. Recheck both accepted owners before returning any mixed text.
   if(scriptView){if(scriptView.state!=='ready')throw Error('No current accepted readout.');scriptView.assertCurrent();scriptFormatCurrent?.();}if(!current())throw Error('The cell changed.');return shown;
  }catch{return <span className="lv-legend-values lv-study-unavailable" title="Current calculated values are unavailable for this chart." data-study-values="unavailable">{DATA_WINDOW_EMPTY}</span>;}
 };
 const builtRow=(row:IndicatorInstanceView)=>{
  const label=labels.get(row.id)??'Indicator',subject:CellStudySubject={kind:'builtin',id:row.id,fingerprint:metadata?.fingerprints.get(row.id)??''},shown=indicatorLegendReadout({acronym:indicatorAcronyms[row.kind]??'Indicator',arguments:indicatorLegendArguments(row.kind,row.inputs,id=>labels.get(id)??null)},{titles:props.settings.statusLine.indicatorTitles,inputs:props.settings.statusLine.indicatorInputs});
  const opened=menu?.id===row.id&&current(),orderRows=opened?rows.map(item=>({id:item.id,paneId:item.paneId})):[];
  const press:Record<string,()=>void>={hide:()=>issue(subject,{kind:'visibility'}),settings:()=>issue(subject,{kind:'settings'}),intervalSettings:()=>issue(subject,{kind:'settings',tab:'Visibility'}),remove:()=>issue(subject,{kind:'remove'}),more:()=>setMenu(opened?null:{id:row.id,open:null})};
  const fact=<T,>(read:()=>T,fallback:T):T=>{if(!opened||!current())return fallback;try{const value=read();return current()?value:fallback;}catch{return fallback;}};
  const placement=fact(()=>readIndicatorScalePlacement(props.chart.chart,row.rendererId),null),sides=fact(()=>indicatorScaleSides(props.chart.chart),{left:false,none:false}),choices=fact(()=>props.chart.indicators.scaleChoices(row.id,id=>labels.get(id)??'Indicator'),[]);
  const moveTo:LegendSubmenuItem[]=fact(()=>indicatorMoveChoices(props.chart,row.rendererId,rows).map(choice=>({id:choice.id,label:choice.label,...(choice.disabled?{disabled:true,title:choice.disabled}:{})})),[]),mainScaleSide=fact<'left'|'right'>(()=>props.chart.priceScale.settings().mainSide==='left'?'left':'right','right'),openNow=opened&&current();
  const more=(id:LegendMoreItemId)=>{if(id==='moveTo'||id==='pinToScale'||id==='visualOrder'){setMenu({id:row.id,open:menu?.open===id?null:id});return;}if(id==='settings'||id==='intervals')issue(subject,{kind:'settings',...(id==='intervals'?{tab:'Visibility'}:{})});else if(id==='hide')issue(subject,{kind:'visibility'});else if(id==='remove')issue(subject,{kind:'remove'});else if(id==='copy'||id==='favorite'||id==='alert')issue(subject,{kind:id});else if(id==='addIndicator')issue(subject,{kind:'add-indicator'});else if(id==='objectTree')issue(subject,{kind:'object-tree'});};
  return <div key={'builtin:'+row.id} className="lv-legend-row" data-legend-row={row.id} data-hidden={row.visible?undefined:'true'} style={{background}} {...legendRowMenuProps(()=>{if(current())setMenu({id:row.id,open:null});})}>
   <button type="button" className="lv-legend-title" title={label} aria-label={'Settings for '+label} onClick={()=>issue(subject,{kind:'settings'})}><span className="lv-legend-name">{shown.title}</span><span className="lv-legend-args">{shown.arguments?' '+shown.arguments:''}</span></button>{scalar('builtin',row.id,row)}{reasonCurrent&&row.visible&&(!row.informationBars||row.diagnostics.length>0&&!row.series.length)?indicatorReasonView(label,indicatorDataStatus(row)):null}
   {legendButtons('indicator',{hidden:!row.visible,intervalRestricted:!!row.presentation?.visibility&&row.presentation.visibility.mode!=='all'}).map(button=>legendButtonView(button,label,press[button.id],button.id==='more'?{expanded:openNow}:{}))}
   {openNow&&<PaneLegendMenu isCurrent={current}>{legendMoreMenuView(legendMoreMenu('indicator',{surface:'legend',title:indicatorAcronyms[row.kind]??'Indicator',value:null,hidden:!row.visible,favorite:props.favorites.includes(row.kind),scalePlacement:placement,mainScaleSide,linkedToSeries:false,routes:{visualOrder:indicatorVisualOrderAvailable(orderRows,row.id),copy:true}}),{label,open:menu!.open,submenus:{moveTo,visualOrder:visualOrderItems(indicatorOrderState(orderRows,row.id)),pinToScale:pinToScaleMenu(placement,sides,choices).map(item=>({id:item.id,label:item.label??'Scale',checked:item.checked,disabled:item.disabled,title:item.title}))},onItem:more,onSubmenu:(parent,id)=>{if(parent==='moveTo'&&(id==='above'||id==='below'||id==='existing-above'||id==='existing-below'))issue(subject,{kind:'move',where:id});else if(parent==='pinToScale')issue(subject,{kind:'scale',placement:pinToScalePlacement(id)});else if(parent==='visualOrder'&&isIndicatorOrderStep(id))issue(subject,{kind:'order',step:id});},onClose:()=>setMenu(null)})}</PaneLegendMenu>}
  </div>;
 };
 const scriptRow=(binding:ScriptBinding)=>{const subject:CellStudySubject={kind:'script',id:binding.id,fingerprint:scriptFingerprints.get(binding.id)??''};return <div key={'script:'+binding.id} className="lv-legend-row" data-legend-script={binding.id} data-hidden={binding.visible?undefined:'true'}><button type="button" className="lv-legend-title" title={binding.name} aria-label={'Study title: '+binding.name} onClick={()=>issue(subject,{kind:'settings'})}><span className="lv-legend-name">{props.settings.statusLine.indicatorTitles?binding.name:null}</span><span className="lv-legend-args">{inputText(binding)?(props.settings.statusLine.indicatorTitles?' ':'')+inputText(binding):null}</span></button><ScriptRuntimeErrorMark bindingId={binding.id} name={binding.name}/>{scalar('script',binding.id)}{(binding.tablePlacement==='bottom'||(metadata?.chart===props.chart&&metadata.owner===props.owner?metadata.tables?.get(binding.id)??0:0)>0)&&<details className="lv-script-actions"><summary aria-label={'Script actions for '+binding.name}>Script actions</summary><button type="button" onClick={()=>issue(subject,{kind:'tables',destination:binding.tablePlacement==='bottom'?'chart':'bottom'})}>{binding.tablePlacement==='bottom'?'Show tables on chart':'Show tables in bottom panel'}</button></details>}{scriptLegendButtons(binding.name,binding.visible,{hide:()=>issue(subject,{kind:'visibility'}),settings:()=>issue(subject,{kind:'settings'}),remove:()=>issue(subject,{kind:'remove'})})}</div>;};
 const panes=new Map<string,React.ReactNode[]>(),unplaced:React.ReactNode[]=[];
 const add=(pane:string|null,node:React.ReactNode)=>{if(pane===null){unplaced.push(node);return;}const list=panes.get(pane)??[];list.push(node);panes.set(pane,list);};
 if(expanded){for(const row of rows)add(row.paneId,builtRow(row));for(const binding of props.bindings)add(scripts.find(row=>row.id===binding.id)?.actualPaneId??null,scriptRow(binding));}
 const toggle=<button key="collapse" type="button" className="lv-legend-toggler" data-qa={LEGEND_TOGGLER_QA_ID} aria-expanded={expanded} title={expanded?'Hide indicator legend':'Show indicator legend'} aria-label={(expanded?'Hide':'Show')+' indicator legend'} onClick={()=>{setMenu(null);setExpanded(value=>!value);}}><ChevronDownIcon style={{transform:expanded?'rotate(180deg)':undefined}}/>{!expanded&&<span className="lv-legend-counter">{rows.length+props.bindings.length}</span>}</button>;
 return <div ref={host} className="indicator-legend lv-cell-study-legend" data-lv-study-chrome="true" data-legend-visible={expanded?'true':'false'} data-study-cell={props.cellId} data-inspected-time={time??undefined}>
  <div className="lv-legend-pane lv-legend-price-scroll" data-legend-pane="price">{panes.get('price')}</div>
  {unplaced.length>0&&<div className="lv-study-unplaced" data-study-placement="unavailable"><span className="help">Placement unavailable</span>{unplaced}</div>}<div className="lv-cell-study-toggle">{toggle}</div>
  {[...panes].filter(([pane])=>pane!=='price').map(([pane,children])=>legendPaneView(pane,children))}<span className="lv-pane-legend-separators" aria-hidden="true"/>{problem&&<p className="lv-study-control-message" role="status">{problem}</p>}
  <PaneIndicatorLayer chart={props.chart} host={host} ownerKey={props.cellId+'|'+ownerKey(props.owner)} isCurrent={current} onPriceBottom={()=>{}}/>
 </div>;
}

/** The root supplies the dialog's cell/tree/source owner. Settings never borrows a replacement chart. */
export function CellScriptSettings({chart,binding,assertOwner,onApply,onClose}:{chart:ChartController;binding:ScriptBinding;assertOwner:()=>void;onApply:Parameters<typeof ScriptSettingsDialog>[0]['onApply'];onClose:()=>void}){
 // Capture once for this opened chart; a fresh owner callback alone is not a new dialog.
 const entry=useScriptOutput(chart,binding.id),priceScaleSupported=useMemo(()=>scriptPriceScaleControlsForSettings(chart,assertOwner),[chart]);let renderedPlots:Record<string,IndicatorPlotStyle>={},renderedVisuals:Record<string,IndicatorPlotStyle>={},titles:Record<string,string>={},unavailable:string|undefined;
 try{assertOwner();const row=chart.scripts.presentationMetadata?.().find(item=>item.id===binding.id);if(!row)throw Error('Script styles are unavailable.');
  for(const [index,plot]of row.plots.entries()){titles[plot.id]=plot.title;renderedPlots[plot.id]={...defaultPlotStyle('sma',plot.id,index),color:plot.color,visible:plot.visible,legend:plot.legend,dataWindow:plot.dataWindow};}
  const complete=row as ScriptPresentationMetadataRow&{renderedPlots?:Record<string,IndicatorPlotStyle>;renderedVisuals?:Record<string,IndicatorPlotStyle>;stylesAvailable?:boolean};
  if(complete.stylesAvailable===false)unavailable='Current styles are unavailable. Saved styles are kept.';else{renderedPlots=complete.renderedPlots??renderedPlots;renderedVisuals=complete.renderedVisuals??{};}
  assertOwner();
 }catch{unavailable='Current styles are unavailable. Saved styles are kept.';}
 return <ScriptSettingsDialog binding={binding} entry={entry} priceScaleSupported={priceScaleSupported} renderedPlots={renderedPlots} renderedVisuals={renderedVisuals} plotTitles={titles} stylesUnavailableReason={unavailable} assertOwner={assertOwner} onApply={onApply} onClose={onClose}/>;
}
