import type {BuiltinNumericDraft} from './builtin-presentation-proof';
import {stableSeriesId,type LineLikeSeries} from '@luxalgo/vela';
import type {IndicatorId,IndicatorResult} from '../domain/indicators';
import type {Bar} from '../domain/types';
import {INDICATOR_MAX_OFFSET,indicatorPlotIds,LV_INDICATOR_PALETTE,LV_HISTOGRAM_COLORS,type IndicatorPlotStyle} from './indicator-settings';
import {indicatorColorOpacity} from './indicator-opacity';
import {catalogDefinition} from '../domain/indicator-catalog';
import {rsiDivergenceDisplayValues,rsiDivergenceKindOfPlot} from '../domain/rsi-divergence';
import {isSealedIndicatorValues} from '../domain/indicator-sealed-values';

/** LV ordinal palette for plots without a recorded fact (the original built-ins and adx/supertrend/lsma/smma): the palette. */
const palette:readonly string[]=LV_INDICATOR_PALETTE;
/** Volume MA: #2962ff, width 1, hidden by default. */
const VOLUME_MA={color:'#2962ff',width:1,visible:false};
/** LV colors for the RSI divergence lines (no reference color exists; these reuse the LV histogram jade and coral). */
/** Hidden divergences use LV palette cyan and amber. */
const DIVERGENCE_STYLE:Readonly<Record<string,{color:string;width:number}>>=Object.freeze({divergenceBullish:{color:LV_HISTOGRAM_COLORS.up,width:2},divergenceBearish:{color:LV_HISTOGRAM_COLORS.down,width:2},divergenceHiddenBullish:{color:LV_INDICATOR_PALETTE[0],width:2},divergenceHiddenBearish:{color:LV_INDICATOR_PALETTE[1],width:2}});
/** A marker kind's 0/1 signal plots and the sparse RSI divergence plots stay out of the legend values by default (the reference legend shows none). */
export function defaultPlotStyle(kind:IndicatorId,plot:string,ordinal:number):IndicatorPlotStyle{
 const fact=catalogDefinition(kind)?.plots.find(row=>row.id===plot),volumeMa=kind==='volume'&&plot==='ma',divergence=kind==='rsi'?DIVERGENCE_STYLE[plot]:undefined;
 return {visible:volumeMa?VOLUME_MA.visible:fact?.visible??true,color:fact?.color??divergence?.color??(volumeMa?VOLUME_MA.color:palette[ordinal%palette.length]),width:fact?.width??divergence?.width??(volumeMa?VOLUME_MA.width:2),lineStyle:'solid',kind:fact?.kind??(plot==='histogram'?'histogram':kind==='volume'&&plot==='volume'?'columns':'line'),priceScale:true,legend:!divergence&&(!fact||!catalogDefinition(kind)?.pattern||catalogDefinition(kind)?.linePlots?.includes(plot)===true),dataWindow:true};
}
export function indicatorPlotNativeId(instanceId:string,kind:IndicatorId,plot:string):string{
 const ordinal=indicatorPlotIds[kind].indexOf(plot);if(ordinal<0)throw new Error('Unknown numerical plot.');
 return stableSeriesId({instanceId,kind:defaultPlotStyle(kind,plot,ordinal).kind,title:`${kind}:${plot}`,ordinal});
}
/** Shared scalar coordinate rule; callers still own the supplied time grid. */
export function validatedIndicatorDisplayTime(time:number):number{
 if(!Number.isSafeInteger(time)||time< -62135596800||time>253402300799)throw new Error('Plot offset exceeds supported time coordinates.');return time;
}
export function indicatorDisplayTime(bars:readonly Bar[],index:number):number{return indicatorDisplayTimes(bars)(index);}
/** IndicatorDisplayTime with the two cadences read once for a whole plot (same rule, same results). */
export function indicatorDisplayTimes(bars:readonly Bar[]):(index:number)=>number{
 // Read on the first call, as the single-index form reads them before each point.
 let firstCadence=0,lastCadence=0,read=false;
 return index=>{
  if(!read){firstCadence=bars.length>1?bars[1].time-bars[0].time:60;lastCadence=bars.length>1?bars.at(-1)!.time-bars.at(-2)!.time:60;read=true;}
  const time=bars[index]?.time??(index<0?(bars[0]?.time??NaN)+index*firstCadence:(bars.at(-1)?.time??NaN)+(index-bars.length+1)*lastCadence);
  return validatedIndicatorDisplayTime(time);
 };
}
/**
 * A live tick changes the newest one or two values of each plot, yet every emission built a new point object for
 * every bar (20,000 per plot). The last points of each plot are kept (bounded, by native plot id). At offset 0 a point is
 * reused while its value (Object.is) and its bar time are those of the new plot; the rest are built exactly as before.
 * The kept points are the ones the renderer already holds, so this adds no copies. Plots whose points are recolored or
 * withheld in place after this step (the Volume column, the MACD histogram, the RSI-based MA palettes, the Bollinger
 * expansion colors and catalog per-bar palettes) always get fresh points.
 */
type PlotPoint={time:number;value:number|null};
// At most 24 plots are kept (about 18 MB at 20k bars), and an instance's entries are
// released when the instance is removed or its chart is disposed (releaseIndicatorPoints, called by the indicator port).
const POINT_REUSE_LIMIT=24;
const reusablePoints=new Map<string,{points:readonly PlotPoint[];own:number;instance:string}>();
/** Forgets the reusable points of these indicator instances (removed, or their chart disposed). */
export function releaseIndicatorPoints(instanceIds:Iterable<string>):void{const gone=new Set(instanceIds);if(!gone.size)return;for(const [id,entry] of [...reusablePoints])if(gone.has(entry.instance))reusablePoints.delete(id);}
/** Test support: how many plots keep reusable points. */
export function reusableIndicatorPointCount():number{return reusablePoints.size;}
function pointsFor(id:string,reuse:boolean,values:readonly (number|null)[],bars:readonly Bar[],offset:number,displayTime:(index:number)=>number,instance=''):PlotPoint[]{
 const prior=reuse&&offset===0?reusablePoints.get(id):undefined;let kept=0;
 if(prior){const limit=Math.min(prior.own,values.length,bars.length),points=prior.points;while(kept<limit){const point=points[kept],bar=bars[kept];if(!bar||bar.time!==point.time/1000||!Object.is(point.value,values[kept]))break;kept++;}}
 const points:PlotPoint[]=kept?prior!.points.slice(0,kept):[];
 for(let index=kept;index<values.length;index++)points.push({time:displayTime(index+offset)*1000,value:values[index]});
 if(reuse){reusablePoints.delete(id);reusablePoints.set(id,{points,own:values.length,instance});while(reusablePoints.size>POINT_REUSE_LIMIT)reusablePoints.delete(reusablePoints.keys().next().value!);}else reusablePoints.delete(id);
 return points;
}
/** Only histogram/columns plots own a zero base (their bars are drawn from it). Vela autoscale folds any explicit
 *  `style.base` into the pane range, so a base on a line/area/step/marker plot pulled the price pane down to 0
 *. Line-like plots carry no base; warmup nulls are already skipped by the autoscale. */
export function plotBaseStyle(kind:string):{base?:number}{return kind==='histogram'||kind==='columns'?{base:0}:{};}
/** The same scan as the .some() above for a sealed array (dense, so .some() would visit every index), without a callback per value. */
function invalidSealed(values:readonly (number|null)[],plot:number,readout:BuiltinNumericDraft|undefined):boolean{
 if(readout?.sealedValues)readout.sealedValues(plot,values);
 for(let point=0;point<values.length;point++){const value=values[point];if(readout&&!readout.sealedValues)readout.value(plot,point,value);if(value!==null&&!Number.isFinite(value))return true;}
 return false;
}
export function renderIndicatorSeries(instanceId:string,kind:IndicatorId,result:IndicatorResult,bars:readonly Bar[],styles:Record<string,IndicatorPlotStyle>,offset:number,readout?:BuiltinNumericDraft):LineLikeSeries[]{
 if(!Number.isSafeInteger(offset)||Math.abs(offset)>INDICATOR_MAX_OFFSET)throw new Error('Plot offset must be an integer from -100000 through 100000 bars');
 const seen=new Set<string>(),displayTime=indicatorDisplayTimes(bars);
 return result.series.map((plot,index)=>{
  readout?.plot(plot,index);
  if(seen.has(plot.id)||plot.values.length!==bars.length||(isSealedIndicatorValues(plot.values)?invalidSealed(plot.values,index,readout):plot.values.some((value,point)=>{readout?.value(index,point,value);return value!==null&&!Number.isFinite(value);})))throw new Error('Invalid numerical plot result.');readout?.finishPlot(index);seen.add(plot.id);
  const ordinal=indicatorPlotIds[kind].indexOf(plot.id);if(ordinal<0)throw new Error('Unknown numerical plot result.');
  const style=Object.hasOwn(styles,plot.id)?styles[plot.id]:defaultPlotStyle(kind,plot.id,ordinal);
  // RSI divergence lines: the calculation holds sparse markers on confirmation bars; the native line draws a straight segment between the two pivots.
  const divergenceKind=kind==='rsi'?rsiDivergenceKindOfPlot(plot.id):undefined,shown=divergenceKind&&result.divergence?rsiDivergenceDisplayValues(result.divergence.segments,divergenceKind,bars.length):plot.values;
  const nativeId=indicatorPlotNativeId(instanceId,kind,plot.id),reuse=shown===plot.values&&plot.id!=='histogram'&&!(kind==='volume'&&plot.id==='volume')&&!(kind==='rsi'&&plot.id==='smooth')&&!(kind==='bb'&&(plot.id==='upper'||plot.id==='lower'))&&catalogDefinition(kind)?.pointPalette?.plot!==plot.id&&!catalogDefinition(kind)?.segmented;
  return {id:nativeId,title:plot.label,paneId:'',kind:style.kind,visible:style.visible,
   display:{pane:style.visible,priceScale:style.visible&&style.priceScale,legend:style.legend,dataWindow:style.dataWindow},
   points:pointsFor(nativeId,reuse,shown,bars,offset,displayTime,instanceId),style:{color:indicatorColorOpacity(style.color,style.opacity??100),width:style.width,lineStyle:style.lineStyle,...plotBaseStyle(style.kind)}} as LineLikeSeries;
 });
}
