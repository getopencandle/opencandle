import type {DrawingLabel} from '@luxalgo/vela';
import type {Bar} from '../domain/types';
import type {IndicatorResult} from '../domain/indicators';
import type {IndicatorPlotStyle} from './indicator-settings';
import {indicatorColorOpacity} from './indicator-opacity';
import {formatIndicatorNumber,type IndicatorPrecision} from './indicator-number-format';

/** Swing-point studies whose sparse plots are drawn as markers beside the bar instead of a 1-2 px cross on the wick.
 *  Williams fractals: a triangle above an up fractal's high and below a down fractal's low (Bill Williams' arrows).
 *  Pivot points high/low: the pivot price in a callout above the pivot high and below the pivot low. */
export const SWING_MARKER_KINDS:Readonly<Record<string,{high:string;low:string;price:boolean}>>=Object.freeze({
 fractals:{high:'up',low:'down',price:false},
 pivotshl:{high:'high',low:'low',price:true},
});
export const SWING_MARKER_POLICY='Swing points are drawn as markers just outside the bar (highs above, lows below) on their own bar; the plot values, data window and alerts keep the exact high or low.';
export function isSwingMarkerKind(kind:string):boolean{return Object.hasOwn(SWING_MARKER_KINDS,kind);}

/** Decimals for a price callout: the plot precision when set, else enough to show the bar prices (2 for prices of 1 and up). */
function priceDecimals(value:number,precision:IndicatorPrecision):number{
 if(precision!=='auto')return precision;
 const size=Math.abs(value);return size>=1?2:size>=0.01?4:8;
}
export function swingMarkerLabels(kind:string,result:IndicatorResult,bars:readonly Bar[],plotStyle:(id:string)=>IndicatorPlotStyle,precision:IndicatorPrecision,id:(role:string)=>string):DrawingLabel[]{
 const spec=SWING_MARKER_KINDS[kind];if(!spec)return [];
 const labels:DrawingLabel[]=[];
 for(const [plot,high] of [[spec.high,true],[spec.low,false]] as const){
  const values=result.series.find(row=>row.id===plot)?.values,style=plotStyle(plot);if(!values||!style.visible)continue;
  const color=indicatorColorOpacity(style.color,style.opacity??100);
  for(let i=0;i<values.length&&i<bars.length;i++){
   const value=values[i];if(typeof value!=='number'||!Number.isFinite(value))continue;
   labels.push({id:id(`swing:${plot}:${bars[i].time}`),paneId:'',xloc:'bar_time',x:bars[i].time*1000,y:value,yloc:high?'abovebar':'belowbar',
    text:spec.price?formatIndicatorNumber(value,priceDecimals(value,precision)):'',
    style:spec.price?(high?'label_down':'label_up'):(high?'triangleup':'triangledown'),
    color,textColor:spec.price?'#ffffff':color,size:spec.price?'small':'tiny',textAlign:'center',
    tooltip:`${spec.price?(high?'Pivot high':'Pivot low'):(high?'Up fractal':'Down fractal')} ${formatIndicatorNumber(value,priceDecimals(value,precision))}`,fontFamily:'default'} as DrawingLabel);
  }
 }
 return labels;
}
