import {hasNyseAlertCalculation,isNyseAlertInterval,type NyseAlertInterval} from '../domain/nyse-mtf-alert-source';
import {liveAlertCompletionFacts} from '../domain/live-history';
import {nyseDailyChartInterval} from '../domain/indicator-resample';
import {isUsEquityInstrument} from '../domain/intervals';
import type {ChartController} from '../chart/adapter';
import {sourceContextForDataset,sameChartSourceBasis} from '../chart/source-context';
import {barInputIdentity,isLiveInputIdentity} from '../chart/bar-input-identity';
import {indicatorPlotIds} from '../chart/indicator-settings';
import type {Bar,BarDataset,PriceSource} from '../domain/types';
import type {LocalAlert} from '../domain/alerts';
import {alertDatasetWithPrefix,validateTechnicalAlertSource,alertConditionMemberRefusal,ALERT_GROUP_CONDITION_LIMIT,type AlertSourceSnapshot,type AlertConditionSource} from '../domain/alert-observation';
import {captureNyseIndicatorAlertSource,captureIndicatorAlertSource,technicalSourceKey,technicalSourceLabel,type TechnicalTransform} from '../domain/technical-alerts';
import {indicatorAlertBlock} from '../domain/indicator-alertability';
import type {AlertSourceChoice} from './AlertDialog';
import {prepareDrawingAlertGrid,type DrawingBoundarySnapshot} from '../chart/drawing-alert-geometry';
import {drawingAlertName} from '../chart/drawing-alert-shapes';
import {REGRESSION_ALERT_WORK_PER_ROW} from '../chart/regression-alert-fit';
import {drawingSourceShape} from '../domain/drawing-alert-rules';
import {capturePositionDrawing,describePosition} from '../domain/alert-position';
import {isPositionDrawing} from '../domain/position-drawing';
import {captureFibActiveLevels,captureFibChannelLevels,describeAlertLevels} from '../domain/alert-levels';
import {readFibChannelAlert} from '../chart/fib-channel-alert-data';
import {captureTpoExtendedLevels,TPO_ALERT_KINDS,TPO_ALERT_LABELS} from '../domain/alert-tpo-levels';
import {footprintAlertChoices} from '../chart/footprint-alerts';
import {scriptOutputs} from './script-outputs';
import type {StrategyConfig} from '../domain/strategy';
import {STRATEGY_FILL_OUTPUT_ID,freezeStrategyConfig} from '../domain/strategy-alert';
import {isPatternIndicator} from '../domain/indicators-ext/patterns-catalog';
import {calculateIndicator} from '../domain/indicators';
import {catalogAlertTitles} from '../domain/indicator-alertability';
import {indicatorAcronyms} from './indicator-dialog-model';

/** The source list names an indicator plot the way the legend does ("RSI", "RSI-based MA",
 *  "MACD: Signal"), never by its plot id or transform id. The stored source and its export label are unchanged. */
export function indicatorChoiceLabel(kind:string,plotId:string,inputs:Record<string,unknown>,bars:readonly Bar[],options:{ordinal?:number;heikinAshi?:boolean;interval?:string}={}):string{
 const titles=catalogAlertTitles(kind,plotId),acronym=titles?.name??(indicatorAcronyms as Record<string,string|undefined>)[kind]??kind.toUpperCase();
 let plot:string|undefined=titles?.plot;
 if(!plot||plot===plotId){try{plot=calculateIndicator(kind,bars.slice(-64),inputs as never).series.find(row=>row.id===plotId)?.label;}catch{plot=undefined;}}
 const plain=plot&&plot!==plotId?plot:plotId.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
 const base=acronym+(options.ordinal?' '+options.ordinal:'');
 // A plot named like its indicator ("RSI", or "Bullish" in "Hammer (bullish)") reads as the indicator alone.
 const main=plain.toLowerCase()===acronym.toLowerCase()||plain.length>=4&&acronym.toLowerCase().split(/[^a-z0-9%]+/).includes(plain.toLowerCase());
 const text=main?base:!options.ordinal&&plain.toLowerCase().startsWith(acronym.toLowerCase())?plain:base+': '+plain;
 return text+(options.interval?', '+options.interval:'')+(options.heikinAshi?' (Heikin Ashi)':'');
}

/** A script that proposes virtual orders (ctx.order) is a strategy; it also offers order-fill alerts. */
export function scriptProposesOrders(source:string):boolean{return /\bctx\s*\.\s*order\s*\(/.test(source);}
export interface TechnicalCaptureOptions {
 /** The applied Strategy tester properties, frozen into strategy order-fill sources. Absent: those sources are unavailable. */
 strategy?:StrategyConfig|null;
}

/** A normal queued native input has not committed yet. No usable observation was lost by itself. */
export class TechnicalChartWaitError extends Error{}
export function retainContinuityAfterTechnicalFailure(error:unknown,observationStarted:boolean):boolean{return !observationStarted&&error instanceof TechnicalChartWaitError;}
/** Alerts read a live feed from the subscription's own first bar (liveAlertBars), so older
 *  history loaded on the left never shifts a row. The chart draws that older history too, and it can already hold a newer
 *  snapshot of the same live input than the throttled UI bars. On a live input the chart's series must
 *  therefore cover the alert bars (start no later, end no earlier, at least as many rows), not equal them. Before, every live
 *  stock chart failed once history loaded (1033 chart bars against 300 alert bars): Source "No data source" and an empty
 *  Level. A fixed input still has to match exactly. */
export function inspectionCoversAlertBars(series:{count:number;firstTime:number|null;lastTime:number|null},bars:readonly Bar[],live:boolean):boolean{
 const first=bars[0]?.time??null,last=bars.at(-1)?.time??null;
 if(!live||first===null||last===null)return series.count===bars.length&&series.firstTime===first&&series.lastTime===last;
 return series.count>=bars.length&&series.firstTime!==null&&series.lastTime!==null&&series.firstTime<=first&&series.lastTime>=last;
}
/** Capture ports are read only after the controller proves it owns this exact immutable information prefix. */
export function requireTechnicalChart(chart:ChartController|null,dataset:BarDataset,bars:readonly Bar[]):ChartController{
 if(!chart)throw new Error('The active chart is not ready for technical alert capture.');
 const unavailable=chart.getAnalysisUnavailable?.();if(unavailable)throw new Error('Chart analysis is unavailable: '+unavailable);
 const desired=sourceContextForDataset(alertDatasetWithPrefix(dataset,bars),bars),actual=chart.getSourceContext();
 if(!sameChartSourceBasis(actual,desired,true)||actual.inputIdentity!==barInputIdentity(bars))throw new TechnicalChartWaitError('The chart source or information prefix is changing. Technical alerts are waiting.');
 const inspection=chart.getDataWindow();
 if(inspection.pending)throw new TechnicalChartWaitError('The chart has not committed this exact information prefix.');
 if(!inspectionCoversAlertBars(inspection.series,bars,isLiveInputIdentity(actual.inputIdentity))||inspection.series.style!==chart.getStyle())throw new Error('The committed chart inspection disagrees with its information prefix.');
 if(!['line','linemarkers','step','area','hlcarea','baseline','columns','bars','hlcbars','highlow','candles','hollow','volumecandles','heikinashi','tpo','sessionvp','footprint'].includes(chart.getStyle()))throw new Error('This non-time or advanced chart transform is not yet an eligible technical alert source.');
 return chart;
}
/**
 * Why a 1D (or 1W / 1M) own-timeframe indicator cannot use the qualified session alert route on this chart, or null when it can. The
 * route needs a US stock or ETF, a chart interval on the New York regular-session grid, and a source that reports confirmed
 * session closes (the live producer or a replay frame). Each refusal names what the user can change.
 */
export function dailyTimeframeAlertRefusal(chart:Pick<ChartController,'getExecutionIdentity'>,dataset:BarDataset,bars:readonly Bar[],interval:NyseAlertInterval='1D'):string|null{
 const instrument=dataset.instrument,period=interval==='1W'?'week':interval==='1M'?'month':'day';
 if(!isUsEquityInstrument(instrument)||instrument.timezone!=='America/New_York')return "A "+interval+" indicator timeframe alert uses the New York regular session, so it is available for US stocks and ETFs only. Set this indicator's timeframe to Chart to create an alert.";
 if(!nyseDailyChartInterval(typeof dataset.resolution==='string'?dataset.resolution:null,'1D'))return "A "+interval+" indicator timeframe alert needs an intraday chart interval that divides the New York regular session, such as 1m, 5m, 15m, 30m or 60m. Change the chart interval, or set this indicator's timeframe to Chart.";
 const execution=chart.getExecutionIdentity(),field=Object.getOwnPropertyDescriptor(dataset,'bars'),raw=execution==='ordinary'&&field&&Object.hasOwn(field,'value')?field.value:bars,facts=liveAlertCompletionFacts(dataset,raw,execution);
 if(facts&&nyseDailyChartInterval(facts.resolution,'1D'))return null;
 if(dataset.provenance?.state==='loading')return 'This '+interval+' indicator timeframe alert is waiting for the chart source to finish loading.';
 return "This chart's data source does not report confirmed session closes, so a "+interval+" indicator timeframe alert cannot tell when each "+period+" is complete. Use a live or replay chart, or set this indicator's timeframe to Chart.";
}
/** Stable snapshot IDs survive cosmetic changes; changed calculation settings create a distinct capture. */
const PRICE_SOURCE_NAMES:Readonly<Record<PriceSource,string>>={open:'Open',high:'High',low:'Low',close:'Close',hl2:'HL2',hlc3:'HLC3',ohlc4:'OHLC4'};
/** The condition source reads like a product ("GME, Close"); the stored source and its export label are unchanged. */
export function priceSourceLabel(symbol:string,field:PriceSource,suffix=''):string{return `${symbol}, ${PRICE_SOURCE_NAMES[field]??field}${suffix}`;}
/** A cache key that tells apart what JSON would merge (undefined, NaN, Infinity, -0). */
function exactKey(value:unknown):string{return JSON.stringify(value,(_key,item)=>item===undefined?'\u0000undefined':typeof item==='number'&&(!Number.isFinite(item)||Object.is(item,-0))?'\u0000'+(Object.is(item,-0)?'-0':String(item)):item);}
export class TechnicalAlertCatalog{
 private snapshots=new Map<string,string>();private comparisons=new Map<string,string>();private geometry=new Map<string,DrawingBoundarySnapshot>();private comparisonUsed=new Set<string>();
 /** The comparison and all-conditions keys selected since the previous capture, and in the round before it. A
  *  draft with several conditions selects several comparisons; each keeps its snapshot identity while it stays selected. */
 private selected=new Set<string>();private retained=new Set<string>();private groups=new Map<string,string>();
 constructor(private identity:()=>string){}
 /** The frozen indicator source and its canonical key are pure functions of the portable settings, plot and
  *  transform (validation included), so a capture reuses them while those are unchanged. A refusal is just as deterministic and
  *  is thrown again unchanged. Each use returns its own deep copy, as a fresh capture did. */
 private indicatorSources=new Map<string,{ok:true;pending:AlertSourceSnapshot;key:string}|{ok:false;error:unknown}>();
 private indicatorSource(portable:Parameters<typeof captureIndicatorAlertSource>[0],plotId:string,transform:TechnicalTransform,daily:boolean,used:Set<string>):{pending:AlertSourceSnapshot;key:string}{
  const cacheKey=exactKey([daily,portable,plotId,transform]);used.add(cacheKey);let held=this.indicatorSources.get(cacheKey);
  if(!held){try{const pending=daily?captureNyseIndicatorAlertSource(portable,plotId,transform,'pending'):captureIndicatorAlertSource(portable,plotId,transform,'pending');held={ok:true,pending:structuredClone(pending),key:technicalSourceKey(pending)};}catch(error){held={ok:false,error};}this.indicatorSources.set(cacheKey,held);}
  if(!held.ok)throw held.error;
  return{pending:structuredClone(held.pending),key:held.key};
 }
 /** IndicatorChoiceLabel may calculate the indicator over the last bars; its text is kept per immutable bar array. */
 private labels=new WeakMap<readonly Bar[],Map<string,string>>();
 private label(kind:string,plotId:string,inputs:Record<string,unknown>,bars:readonly Bar[],options:{ordinal?:number;heikinAshi?:boolean;interval?:string}):string{
  let rows=this.labels.get(bars);if(!rows){rows=new Map();this.labels.set(bars,rows);}
  const key=exactKey([kind,plotId,inputs,options]);let text=rows.get(key);if(text===undefined){text=indicatorChoiceLabel(kind,plotId,inputs,bars,options);if(rows.size>=2048)rows.clear();rows.set(key,text);}
  return text;
 }
 capture(chart:ChartController,dataset:BarDataset,bars:readonly Bar[],alerts:readonly LocalAlert[],options:TechnicalCaptureOptions={}):AlertSourceChoice[]{
  requireTechnicalChart(chart,dataset,bars);
  this.retained=this.selected;this.selected=new Set();
  const transform:TechnicalTransform=chart.getStyle()==='heikinashi'?'heikinashi':'standard',choices:AlertSourceChoice[]=[],used=new Set<string>(),geometryUsed=new Set<string>();this.comparisonUsed.clear();
  const snapshot=(key:string)=>{used.add(key);let id=this.snapshots.get(key);if(!id){id=this.identity();this.snapshots.set(key,id);}return id;};
  for(const field of ['open','high','low','close','hl2','hlc3','ohlc4'] as PriceSource[]){choices.push({id:`price:${field}:chart`,label:priceSourceLabel(dataset.instrument.symbol,field,transform==='heikinashi'?' (Heikin Ashi)':''),source:{kind:'price',field,transformId:transform}});if(transform==='heikinashi')choices.push({id:`price:${field}:standard`,label:priceSourceLabel(dataset.instrument.symbol,field,' (regular candles)'),source:{kind:'price',field,transformId:'standard'}});}
  const sourcesUsed=new Set<string>(),indicators=chart.indicators.serialize(),indicatorCounts=new Map<string,number>(),indicatorSeen=new Map<string,number>();
  for(const settings of indicators)indicatorCounts.set(settings.kind,(indicatorCounts.get(settings.kind)??0)+1);
  for(const settings of indicators){const ordinal=(indicatorSeen.get(settings.kind)??0)+1;indicatorSeen.set(settings.kind,ordinal);
   const shown=(plotId:string,interval?:string)=>this.label(settings.kind,plotId,settings.inputs as Record<string,unknown>,bars,{...((indicatorCounts.get(settings.kind)??0)>1?{ordinal}:{}),heikinAshi:transform==='heikinashi',...(interval?{interval}:{})});
   for(const plotId of indicatorPlotIds[settings.kind]??[]){
   const id=`indicator:${settings.id}:${plotId}`;
   try{const historyBlock=indicatorAlertBlock(settings.kind,settings.inputs,dataset.resolution);if(historyBlock)throw new Error(historyBlock);const {paneId,...portable}=settings;const ownInterval=settings.presentation?.timeframe?.interval,daily=isNyseAlertInterval(ownInterval);
    if(daily){const refused=dailyTimeframeAlertRefusal(chart,dataset,bars,ownInterval);if(refused)throw Error(refused);}
    const frozen=this.indicatorSource(portable,plotId,transform,daily,sourcesUsed),source={...frozen.pending,snapshotId:snapshot(frozen.key)};
    // A pattern signal plot reads 1 on the bar a pattern appears, else 0; choosing it presets "Greater than 0".
    const period=daily?(ownInterval==='1W'?'weekly':ownInterval==='1M'?'monthly':'daily'):undefined;
    if(isPatternIndicator(settings.kind))choices.push({id,label:`${shown(plotId,period)}: pattern appeared`,source,scriptSignal:true});else choices.push({id,label:shown(plotId,period),source,...(hasNyseAlertCalculation(source)?{constantOnly:true}:{})});}
   catch(error){choices.push({id,label:shown(plotId),source:null,disabledReason:error instanceof Error?error.message:String(error)});}
  }}
  // On a TPO chart each extended level kind is one price source with its frozen levels (LV policy in alert-tpo-levels.ts, default TPO settings).
  if(chart.getStyle()==='tpo')for(const kind of TPO_ALERT_KINDS){const id=`tpo:${kind}`,tpo=captureTpoExtendedLevels(bars,kind,dataset.instrument.tickSize>0?dataset.instrument.tickSize:null);choices.push(tpo.ok?{id,label:`${TPO_ALERT_LABELS[kind]}: ${describeAlertLevels(tpo.levels)}`,source:{kind:'price',field:'close',transformId:transform},levels:tpo.levels}:{id,label:TPO_ALERT_LABELS[kind],source:null,disabledReason:tpo.diagnostics.join(' ')});}
  // On a Volume footprint chart each footprint metric is one source with frozen settings.
  if(chart.getStyle()==='footprint')for(const row of footprintAlertChoices(bars,chart.getChartSettingsBook?.()?.footprint??{},dataset.instrument.tickSize>0?dataset.instrument.tickSize:null))choices.push(row.source?{id:row.id,label:row.label,source:{...row.source,snapshotId:snapshot(technicalSourceKey(row.source))},...(row.signal?{scriptSignal:true}:{})}:{id:row.id,label:row.label,source:null,disabledReason:row.disabledReason});
  const drawingDocument=chart.saveDrawings(),drawings=Array.isArray(drawingDocument.drawings)?drawingDocument.drawings:[];
  if(drawings.length>10000)throw new Error('Drawing catalog exceeds the local 10000-object bound.');
  // Version 2 capture (drawing-alert-shapes.ts): lines, channels and the vertical line, on any price scale,
  // following the drawing when it moves. Choices are named after the drawing (its own name, else the tool name, with a number
  // when two share a name), never by internal id.
  const grid=drawings.length?prepareDrawingAlertGrid(bars,{source:chart.getSourceContext(),style:chart.getStyle(),scale:chart.getChartOptions().scale}):null;
  let catalogLabels:Map<string,string>|undefined;try{const rows=typeof chart.drawingCatalog==='function'?chart.drawingCatalog():[];catalogLabels=new Map(rows.map(row=>[String(row.type),String(row.label)]));}catch{catalogLabels=undefined;}
  const nameCounts=new Map<string,number>(),namesSeen=new Map<string,number>();for(const drawing of drawings){const name=drawingAlertName(drawing,catalogLabels);nameCounts.set(name,(nameCounts.get(name)??0)+1);}
  const pickerName=(drawing:unknown)=>{const name=drawingAlertName(drawing,catalogLabels);if((nameCounts.get(name)??0)<2)return name;const index=(namesSeen.get(name)??0)+1;namesSeen.set(name,index);return `${name} ${index}`;};
  let captureWork=bars.length*32;
  for(const drawing of drawings){
   const label=pickerName(drawing);
   if(isPositionDrawing(drawing.type)){const id=String(drawing.id),position=capturePositionDrawing(drawing,dataset.instrument);choices.push(position.ok?{id:`position:${id}`,label:`${label}: ${describePosition(position.position)}`,source:{kind:'price',field:'close',transformId:'standard'},position:position.position}:{id:`position:${id}`,label,source:null,disabledReason:position.diagnostics.join(' ')});continue;}
   // A Fib retracement is one price source with its frozen active levels (LV policy in alert-levels.ts).
   if(drawing.type==='fibretracement'){const id=String(drawing.id),fib=captureFibActiveLevels(drawing);choices.push(fib.ok?{id:`drawing:${id}`,label:`${label}: any level`,source:{kind:'price',field:'close',transformId:transform},levels:fib.levels}:{id:`drawing:${id}`,label,source:null,disabledReason:fib.diagnostics.join(' ')});continue;}
   const id=String(drawing.id),cost=(grid?.ok?grid.grid.sourceBasis.length*3+2000:2000)+(drawing.type==='regressionchannel'?bars.length*(REGRESSION_ALERT_WORK_PER_ROW+(transform==='heikinashi'?20:0)):0);captureWork+=cost;
   const captured=captureWork>20000000?{ok:false as const,diagnostics:['Drawing capture batch limit reached. Reduce loaded drawings or history.']}:grid?.ok?grid.grid.captureShape(drawing,{labels:catalogLabels}):{ok:false as const,diagnostics:grid?.diagnostics??['Drawing grid is unavailable.']};
   // A Fib channel also offers its levels, after its channel choice.
   const fibLevels=()=>{if(drawing.type!=='fibchannel')return;const levelId=`drawing:${id}:levels`;
    let ratios:readonly number[]=[];try{ratios=readFibChannelAlert((drawing as {props?:unknown}).props).enabledRatios;}catch{ratios=[];}
    const levels=captureFibChannelLevels(drawing,ratios),framed=grid?.ok?grid.grid.captureShape(drawing,{labels:catalogLabels,shape:'levels'}):{ok:false as const,diagnostics:grid?.diagnostics??['Drawing grid is unavailable.']};
    if(!levels.ok||!framed.ok){choices.push({id:levelId,label:`${label}: any level`,source:null,disabledReason:(!framed.ok?framed.diagnostics:!levels.ok?levels.diagnostics:[]).join(' ')});return;}
    const shot=framed.snapshot,levelKey=JSON.stringify([shot.shape,shot.drawingId,shot.sourceBasis,shot.transform,shot.gridOrigin,shot.drawingKey,shot.coordinateModel,shot.name,shot.anchors,shot.lines]);geometryUsed.add(levelKey);
    let geometry=this.geometry.get(levelKey);if(!geometry){geometry=shot;this.geometry.set(levelKey,geometry);}
    const pending:AlertSourceSnapshot={kind:'drawing-boundary',instanceId:id,snapshotId:'pending',geometry,mutationPolicy:'follow'};
    choices.push({id:levelId,label:`${label}: any level`,source:{...pending,snapshotId:snapshot(technicalSourceKey(pending))},levels:levels.levels});
   };
   if(!captured.ok){choices.push({id:`drawing:${id}`,label,source:null,disabledReason:captured.diagnostics.join(' ')});fibLevels();continue;}
   // The same drawing on the same grid keeps one geometry (and so one source session) while bars arrive; any move is a new key.
   const shot=captured.snapshot,geometryKey=JSON.stringify([shot.drawingId,shot.sourceBasis,shot.transform,shot.gridOrigin,shot.drawingKey,shot.coordinateModel,shot.name,shot.tool==='regressionchannel'?null:shot.anchors,shot.tool==='regressionchannel'?null:shot.lines,shot.lineTime]);geometryUsed.add(geometryKey);
   let geometry=this.geometry.get(geometryKey);if(!geometry){geometry=shot;this.geometry.set(geometryKey,geometry);}
   const pending:AlertSourceSnapshot={kind:'drawing-boundary',instanceId:id,snapshotId:'pending',geometry,mutationPolicy:'follow'};
   const source={...pending,snapshotId:snapshot(technicalSourceKey(pending))};
   if(shot.shape==='channel'){choices.push({id:`drawing:${id}`,label:`${label}: close${transform==='heikinashi'?' (Heikin Ashi)':''} in the channel`,source,drawingShape:'channel'});fibLevels();continue;}
   if(shot.shape==='time'){choices.push({id:`drawing:${id}`,label:`${label}: time reaching the line`,source,drawingShape:'time'});continue;}
   choices.push({id:`boundary:${id}`,label,source,targetOnly:true});
   choices.push({id:`drawing:${id}`,label,source:this.expression({kind:'price',field:'close',transformId:transform},source,true),drawingShape:'line'});
  }
  // Each chart script instance offers its alert conditions, its ctx.alert names and its plots. The source
  // text and input values are frozen at capture, like built-in indicator settings.
  const scripts=scriptOutputs.list(chart.scripts);
  for(const entry of scripts){
   const frozen=(output:'condition'|'alert'|'plot',outputId:string)=>{const pending:AlertSourceSnapshot={kind:'script',instanceId:entry.bindingId,snapshotId:'pending',title:entry.title,source:entry.source,inputs:{...entry.inputs},output,outputId,transformId:transform};return{...pending,snapshotId:snapshot(technicalSourceKey(pending))};};
   const plotTitles=entry.plots.map(plot=>plot.title).slice(0,64);
   const add=(id:string,label:string,output:'condition'|'alert'|'plot',outputId:string,signal:boolean)=>{try{const source=frozen(output,outputId);choices.push({id,label,source,...(signal?{scriptSignal:true}:{}),...(plotTitles.length?{plotTitles}:{})});}catch(error){choices.push({id,label,source:null,disabledReason:error instanceof Error?error.message:String(error)});}};
   for(const condition of entry.conditions)add(`script:${entry.bindingId}:condition:${condition.title}`,`Script ${entry.title}: condition "${condition.title}"`,'condition',condition.title,true);
   for(const name of entry.alertNames)add(`script:${entry.bindingId}:alert:${name}`,`Script ${entry.title}: any ctx.alert "${name}"`,'alert',name,true);
   for(const plot of entry.plots)add(`script:${entry.bindingId}:plot:${plot.id}`,`Script ${entry.title} / ${plot.title}`,'plot',plot.id,false);
   // Order fills of a strategy, backtested with the Strategy tester properties frozen at creation.
   if(scriptProposesOrders(entry.source)){
    const id=`script:${entry.bindingId}:fill`,label=`Script ${entry.title}: strategy order fills`;
    try{
     if(!options.strategy)throw new Error('The Strategy tester properties are not available here.');
     const pending:AlertSourceSnapshot={kind:'script',instanceId:entry.bindingId,snapshotId:'pending',title:entry.title,source:entry.source,inputs:{...entry.inputs},output:'fill',outputId:STRATEGY_FILL_OUTPUT_ID,transformId:transform,strategy:freezeStrategyConfig(options.strategy,transform)};
     choices.push({id,label,source:{...pending,snapshotId:snapshot(technicalSourceKey(pending))},scriptSignal:true,strategyFill:true,...(plotTitles.length?{plotTitles}:{})});
    }catch(error){choices.push({id,label,source:null,disabledReason:error instanceof Error?error.message:String(error)});}
   }
  }
  if(!scripts.length)choices.push({id:'unavailable-script',label:'Script alert conditions',source:null,disabledReason:'Add a script to this chart. Its ctx.alertcondition conditions, ctx.alert names and plots appear here once it has calculated.'});
  const known=new Set(choices.filter(row=>row.source).map(row=>technicalSourceKey(row.source!)));
  for(const alert of alerts){const binding=alert.definition.observationBinding;if(binding?.schemaVersion!==2||alert.definition.instrumentId!==dataset.instrument.id||binding.source.kind==='all')continue;
   try{validateTechnicalAlertSource(binding.source);const key=technicalSourceKey(binding.source);if(known.has(key))continue;known.add(key);const shape=drawingSourceShape(binding.source);choices.push({id:`saved:${alert.definition.id}`,label:`Saved frozen source: ${alert.definition.name}`,source:structuredClone(binding.source),...(hasNyseAlertCalculation(binding.source)?{constantOnly:true}:{}),targetOnly:binding.source.kind==='drawing-boundary'&&shape!=='channel'&&shape!=='time',...(shape==='channel'||shape==='time'?{drawingShape:shape}:{})});}catch{/* Unsupported saved records remain visible in their alert; they never become an approximate source. */}
  }
  for(const key of this.snapshots.keys())if(!used.has(key))this.snapshots.delete(key);
  for(const key of this.geometry.keys())if(!geometryUsed.has(key))this.geometry.delete(key);
  for(const key of this.indicatorSources.keys())if(!sourcesUsed.has(key))this.indicatorSources.delete(key);
  for(const key of this.comparisons.keys())if(!this.comparisonUsed.has(key)&&!this.retained.has(key)&&!this.selected.has(key))this.comparisons.delete(key);
  for(const key of this.groups.keys())if(!this.retained.has(key)&&!this.selected.has(key))this.groups.delete(key);
  return choices;
 }
 expression(left:AlertSourceSnapshot,right:AlertSourceSnapshot|null,catalog=false):AlertSourceSnapshot{
  if(!right)return left;
  if(hasNyseAlertCalculation(left)||hasNyseAlertCalculation(right))throw Error('Daily timeframe alerts currently compare with a constant only.');
  if(left.kind==='comparison'||right.kind==='comparison')throw new Error('A saved comparison cannot be nested in another comparison. Select its individual operands.');
  const pending:AlertSourceSnapshot={kind:'comparison',snapshotId:'pending',left,right},key=technicalSourceKey(pending);
  if(catalog)this.comparisonUsed.add(key);else this.selected.add(key);
  let id=this.comparisons.get(key);if(!id){id=this.identity();this.comparisons.set(key,id);}return{...pending,snapshotId:id};
 }
 /** The all-conditions source of a draft with several conditions (each from expression()). The same members keep the
  * same snapshot identity, so the alert keeps one observation session while the draft is unchanged. */
 group(members:readonly AlertSourceSnapshot[]):AlertSourceSnapshot{
  if(members.length<2||members.length>ALERT_GROUP_CONDITION_LIMIT)throw new Error('An all-conditions alert needs 2 to '+ALERT_GROUP_CONDITION_LIMIT+' conditions.');
  members.forEach((member,index)=>{const refused=alertConditionMemberRefusal(member);if(refused)throw new Error('Condition '+(index+1)+': '+refused);});
  const pending:AlertSourceSnapshot={kind:'all',snapshotId:'pending',members:members.map(member=>structuredClone(member) as AlertConditionSource)},key=technicalSourceKey(pending);
  this.selected.add(key);let id=this.groups.get(key);if(!id){id=this.identity();this.groups.set(key,id);}return{...pending,snapshotId:id};
 }
}
