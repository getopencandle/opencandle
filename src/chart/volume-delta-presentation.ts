import type {CandleSeries,DrawingLine} from '@luxalgo/vela';
import type {IndicatorResult} from '../domain/indicators';
import type {Bar} from '../domain/types';
import type {IndicatorInstanceSettings} from './indicator-settings';
import {defaultPlotStyle,indicatorDisplayTimes} from './indicator-rendering';
import {indicatorColorOpacity} from './indicator-opacity';

/** Scalar OHLC values remain inspectable; only fully known candles are painted. No gap is filled with zeros.
 *  The renderer reads a candle series by chart bar index (bars[i - offset]), exactly like line points, so the array
 *  stays aligned one row per chart bar: a bar without intrabar data keeps a NaN placeholder that is neither painted,
 *  read out nor folded into the pane autoscale. Compacting the known candles shifted them onto the first chart bars,
 *  off screen, and left the pane scale without them. */
export function volumeDeltaCandleSeries(settings:IndicatorInstanceSettings,result:IndicatorResult,bars:readonly Bar[]):CandleSeries{
 const plots=new Map(result.series.map(row=>[row.id,row.values])),at=indicatorDisplayTimes(bars);
 const style=(plot:string,ordinal:number)=>settings.plots[plot]??defaultPlotStyle(settings.kind,plot,ordinal);
 const close=style('close',3),down=style('low',2),up=indicatorColorOpacity(close.color,close.opacity??100),falling=indicatorColorOpacity(down.color,down.opacity??100);
 const candles:CandleSeries['bars']=[];let known=0;
 for(let i=0;i<bars.length;i++){
  const values=['open','high','low','close'].map(plot=>plots.get(plot)?.[i]),time=at(i+settings.offset)*1000;
  if(!values.every(value=>typeof value==='number'&&Number.isFinite(value))){candles.push({time,open:NaN,high:NaN,low:NaN,close:NaN});continue;}
  const [open,high,low,endpoint]=values as number[];
  if(high<Math.max(open,endpoint)||low>Math.min(open,endpoint))throw new Error('Volume delta candle boundaries are invalid.');
  candles.push({time,open,high,low,close:endpoint});known++;
 }
 if(!known)candles.length=0;
 return {id:`lv-volume-candles:${JSON.stringify(settings.id)}`,title:settings.kind==='cvd'?'Cumulative volume delta':'Volume delta',paneId:'',kind:'candle',visible:close.visible,
  display:{pane:close.visible,priceScale:close.visible&&close.priceScale,legend:false,dataWindow:false},bars:candles,style:{up,down:falling,wickUp:up,wickDown:falling,borderUp:up,borderDown:falling}};
}

/** Public Up/Down behavior: a short horizontal notch in the prevailing side's color at the signed difference. */
export function upDownDeltaLines(settings:IndicatorInstanceSettings,result:IndicatorResult,bars:readonly Bar[]):DrawingLine[]{
 const plot=result.series.find(row=>row.id==='delta'),style=settings.plots.delta??defaultPlotStyle(settings.kind,'delta',2);
 if(!plot||!style.visible)return [];
 const at=indicatorDisplayTimes(bars),lines:DrawingLine[]=[];
 for(let i=0;i<bars.length;i++){
  const value=plot.values[i];if(value===null||!Number.isFinite(value))continue;
  const colorStyle=settings.plots[value<0?'down':'up']??defaultPlotStyle(settings.kind,value<0?'down':'up',value<0?1:0);
  const center=at(i+settings.offset)*1000,next=at(i+settings.offset+1)*1000,previous=at(i+settings.offset-1)*1000,half=Math.min(next-center,center-previous)*0.25;
  if(!Number.isFinite(half)||half<=0)continue;
  lines.push({id:`lv-volume-notch:${JSON.stringify([settings.id,bars[i].time])}`,paneId:'',xloc:'bar_time',x1:center-half,x2:center+half,y1:value,y2:value,extend:'none',color:indicatorColorOpacity(colorStyle.color,style.opacity??100),width:style.width,style:'solid',invisible:false,arrowLeft:false,arrowRight:false});
 }
 return lines;
}
