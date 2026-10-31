import { registerChartType, registerRendererLayer, type RendererLayerArgs, type RendererLayerInstance } from '@luxalgo/vela';
import type { PriceSource } from '../domain/types';
import { candleDirection } from './appearance-layer';
import {PRICE_APPEARANCE_DEFAULTS,selectedDisplayedPrice} from './appearance-price';
import {DERIVED_STYLES} from './derived/common';
import {DerivedLayer} from './derived/paint';
import {registerTpoChartType} from './tpo';
import {registerSessionVolumeProfileChartType} from './session-vp';
import {registerFootprintChartType} from './footprint';

export const CHART_TYPES=[
  ['line','Line'],['linemarkers','Line with markers'],['step','Step line'],['area','Area'],['hlcarea','HLC area'],['baseline','Baseline'],['columns','Columns'],['bars','Bars'],['highlow','High-low'],['candles','Candles'],['hollow','Hollow candles'],['volumecandles','Volume candles'],['heikinashi','Heikin Ashi'],['renko','Renko'],['kagi','Kagi'],['pointfigure','Point & figure'],['linebreak','Line break'],['range','Range'],['footprint','Volume footprint'],['tpo','Time price opportunity'],['sessionvp','Session volume profile'],
  // The standalone HLC bars type. Appended so
  // the index-based groups above keep their positions; the menu order comes from top-toolbar-model.ts.
  ['hlcbars','HLC bars'],
] as const;
export type ChartTypeId=typeof CHART_TYPES[number][0];
export interface TemporalChartSettings {
  source:PriceSource;
  color:string;downColor:string;width:number;opacity:number;gradient:boolean;gradientStartColor:string;gradientColor:string;
  /** Line, Line with markers and Step line color mode (the Solid | Gradient select on the Line row). Area keeps the gradient toggle. */
  colorType?:'solid'|'gradient';
  markersVisible:boolean;markerRadius:number;
  highColor:string;lowColor:string;closeColor:string;highFill:string;lowFill:string;
  bodyVisible:boolean;borderVisible:boolean;wickVisible:boolean;
  borderUpColor:string;borderDownColor:string;wickUpColor:string;wickDownColor:string;
  previousClose:boolean;labelsVisible:boolean;fontSize:number;
  lineStyle:'solid'|'dashed'|'dotted';baseLevel:number;highWidth:number;lowWidth:number;closeWidth:number;highOpacity:number;lowOpacity:number;closeOpacity:number;highFill2:string;lowFill2:string;openVisible:boolean;thinBars:boolean;
  upWidthPercent:number;downWidthPercent:number;upOpacity:number;downOpacity:number;
  /** HLC area line visibility (highLineVisible/lowLineVisible). */
  highLineVisible?:boolean;lowLineVisible?:boolean;
  /** High-low border and label colors (borderColor/labelColor). */
  borderColor?:string;labelColor?:string;
  /** Baseline base level line color (baselineColor). Saved books gain the default on load (validatedSettingsBook). */
  baselineColor?:string;
}
/** Deliberate LV initial appearance. */
export const LV_TEMPORAL_DEFAULTS:TemporalChartSettings={...PRICE_APPEARANCE_DEFAULTS,width:2,opacity:1,gradient:false,gradientStartColor:'#D500F9',gradientColor:'#2962ff',markersVisible:true,markerRadius:3,highFill:'#22ab9426',lowFill:'#f7525f26',bodyVisible:true,borderVisible:true,wickVisible:true,borderUpColor:'#22ab94',borderDownColor:'#f7525f',wickUpColor:'#22ab94',wickDownColor:'#f7525f',labelsVisible:true,fontSize:11,lineStyle:'solid',highWidth:2,lowWidth:2,closeWidth:2,highOpacity:1,lowOpacity:1,closeOpacity:1,highFill2:'#22ab9400',lowFill2:'#f7525f00',openVisible:true,thinBars:true,upWidthPercent:70,downWidthPercent:70,upOpacity:1,downOpacity:1};
const LINE_GRADIENT_IDS=new Set(['line','linemarkers','step']);
/** Chart types on the time axis (drawings, alert geometry and time-to-x use time coordinates): the 13 standard types plus Time price opportunity. */
/** The standard time-based types: the first 13 catalog rows plus HLC bars (appended to the catalog). */
export const STANDARD_TIME_STYLES:readonly string[]=Object.freeze([...CHART_TYPES.slice(0,13).map(row=>row[0] as string),'hlcbars']);
/** Session volume profile is a candle chart with session profiles behind the candles, so it is on the time axis too. */
export const TIME_AXIS_STYLES:readonly string[]=Object.freeze([...STANDARD_TIME_STYLES,'tpo','sessionvp',/* Volume footprint */'footprint']);
export const TEMPORAL_EXTENSION_IDS=['line','area','baseline','linemarkers','step','hlcarea','columns','highlow','hollow','volumecandles','bars','hlcbars'] as const;
export function selectedPrice(bar:RendererLayerArgs['bars'][number],source:PriceSource):number{
  return selectedDisplayedPrice(bar,source);
}
export function hollowState(open:number,close:number,previousClose:number|undefined):{direction:'up'|'down';filled:boolean}{return {direction:candleDirection(open,close,previousClose,true),filled:close<open};}
export function volumeWidths(volumes:readonly number[],maxWidth:number):number[]{
  if(!Number.isFinite(maxWidth)||maxWidth<0)throw new Error('Maximum volume width must be finite and nonnegative');
  if(volumes.some(v=>!Number.isFinite(v)||v<0))throw new Error('Volume candle width requires nonnegative finite volume');
  let maximum=0;for(const volume of volumes)maximum=Math.max(maximum,volume);
  return volumes.map(volume=>maxWidth===0?0:maximum===0?Math.min(1,maxWidth):Math.min(maxWidth,Math.max(1,maxWidth*volume/maximum)));
}
/** High-low ink. With previous-close coloring on, a bar that closes below the previous close takes the down color. */
export function highLowColor(color:string,downColor:string|undefined,up:boolean,previousClose:unknown):string{return previousClose===true&&!up&&downColor?downColor:color;}
export function verticalBody(first:number,second:number):{top:number;height:number}{return {top:Math.min(first,second),height:Math.max(1,Math.abs(first-second))};}
export function hollowOutlineVisible(bodyVisible:boolean,borderVisible:boolean,filled:boolean):boolean{return borderVisible||(!filled&&bodyVisible);}
export function baselineY(top:number,height:number,level:number):number{return top+height*(1-level/100);}
export function barsStrokeWidth(thin:boolean,spacing:number):number{return thin?1:Math.max(1,Math.min(5,spacing*0.18));}
/** The merged indicator bar colours a COMPAT-11 renderer hands its layers (time in ms to colour); null when absent or empty. */
export function layerBarColors(args:RendererLayerArgs):ReadonlyMap<number,string>|null{const value=(args as RendererLayerArgs&{lvBarColors?:unknown}).lvBarColors;return value instanceof Map&&value.size>0?value as ReadonlyMap<number,string>:null;}
class TemporalLayer implements RendererLayerInstance{
  private canvas:HTMLCanvasElement|null=null;
  constructor(private id:string){}
  mount(canvas:HTMLCanvasElement){this.canvas=canvas;canvas.dataset.lvChartType=this.id;}
  render(args:RendererLayerArgs){
    const canvas=this.canvas;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);
    if(args.priceStyle!==this.id)return;
    const settings={...LV_TEMPORAL_DEFAULTS,...args.settings} as TemporalChartSettings;
    const range=args.coords.visibleLogicalRange(),start=Math.max(0,Math.floor(range.from)-1),end=Math.min(args.bars.length-1,Math.ceil(range.to)+1);
    if(start>end)return;
    const x=(index:number)=>args.coords.logicalToX(index),y=(value:number)=>args.coords.priceToY(value,args.scale,args.bounds);
    const width=Math.max(1,args.coords.bodySpacing()*0.7);
    ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);ctx.beginPath();ctx.rect(0,args.bounds.top,args.coords.width,args.bounds.height);ctx.clip();ctx.globalAlpha=1;ctx.lineWidth=settings.width;
    let ink:string|CanvasGradient=settings.color;
    // Line types draw their gradient pair (gradientStartColor to gradientColor); area keeps color to gradientColor. The reference gradient direction is unresolved; LV draws it top to bottom.
    const gradientOn=LINE_GRADIENT_IDS.has(this.id)?(settings.colorType??(settings.gradient?'gradient':'solid'))==='gradient':settings.gradient;
    if(gradientOn){const gradient=ctx.createLinearGradient(0,args.bounds.top,0,args.bounds.top+args.bounds.height);gradient.addColorStop(0,LINE_GRADIENT_IDS.has(this.id)?settings.gradientStartColor:settings.color);gradient.addColorStop(1,settings.gradientColor);ink=gradient;}
    const drawSeries=(source:PriceSource,color:string|CanvasGradient,step=false,lineWidth=settings.width,opacity=settings.opacity)=>{
      ctx.save();ctx.lineWidth=lineWidth;ctx.globalAlpha=opacity;ctx.setLineDash(settings.lineStyle==='dashed'?[6,4]:settings.lineStyle==='dotted'?[1,3]:[]);ctx.strokeStyle=color;ctx.beginPath();
      for(let index=start;index<=end;index++){const yy=y(selectedPrice(args.bars[index],source));if(index===start)ctx.moveTo(x(index),yy);else {if(step)ctx.lineTo(x(index),y(selectedPrice(args.bars[index-1],source)));ctx.lineTo(x(index),yy);}}
      ctx.stroke();ctx.restore();
    };
    if(this.id==='line'||this.id==='linemarkers'||this.id==='step'){
      drawSeries(settings.source,ink,this.id==='step');
      if(this.id==='linemarkers'&&settings.markersVisible&&args.coords.pxPerBar()>=8){ctx.fillStyle=ink;for(let index=start;index<=end;index++){ctx.beginPath();ctx.arc(x(index),y(selectedPrice(args.bars[index],settings.source)),settings.markerRadius,0,Math.PI*2);ctx.fill();}}
    }else if(this.id==='area'||this.id==='baseline'){
      const baseline=this.id==='area'?args.bounds.top+args.bounds.height:baselineY(args.bounds.top,args.bounds.height,settings.baseLevel);
      const fillPath=()=>{ctx.beginPath();ctx.moveTo(x(start),baseline);for(let index=start;index<=end;index++)ctx.lineTo(x(index),y(selectedPrice(args.bars[index],settings.source)));ctx.lineTo(x(end),baseline);ctx.closePath();};
      if(this.id==='area'){const gradient=ctx.createLinearGradient(0,args.bounds.top,0,args.bounds.top+args.bounds.height);gradient.addColorStop(0,settings.highFill);gradient.addColorStop(1,(args.settings as Partial<TemporalChartSettings>).lowFill??'rgba(0, 0, 0, 0)');ctx.fillStyle=gradient;fillPath();ctx.fill();drawSeries(settings.source,ink);}
      else{
        const half=(top:number,height:number,fill:string,fill2:string,line:string,lineWidth:number,opacity:number)=>{ctx.save();ctx.beginPath();ctx.rect(0,top,args.coords.width,height);ctx.clip();const gradient=ctx.createLinearGradient(0,top,0,top+height);gradient.addColorStop(0,fill);gradient.addColorStop(1,fill2);ctx.fillStyle=gradient;fillPath();ctx.fill();drawSeries(settings.source,line,false,lineWidth,opacity);ctx.restore();};
        half(args.bounds.top,baseline-args.bounds.top,settings.highFill,settings.highFill2,settings.highColor,settings.highWidth,settings.highOpacity);half(baseline,args.bounds.top+args.bounds.height-baseline,settings.lowFill,settings.lowFill2,settings.lowColor,settings.lowWidth,settings.lowOpacity);
        // The base level line in baselineColor. Stroke: 1px solid (the reference line style is not recorded).
        if(settings.baselineColor){ctx.save();ctx.globalAlpha=1;ctx.setLineDash([]);ctx.lineWidth=1;ctx.strokeStyle=settings.baselineColor;ctx.beginPath();ctx.moveTo(0,Math.round(baseline)+0.5);ctx.lineTo(args.coords.width,Math.round(baseline)+0.5);ctx.stroke();ctx.restore();}
      }
    }else if(this.id==='hlcarea'){
      const fillBetween=(upper:PriceSource,lower:PriceSource,color:string)=>{ctx.fillStyle=color;ctx.beginPath();for(let index=start;index<=end;index++){const xx=x(index),yy=y(selectedPrice(args.bars[index],upper));if(index===start)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);}for(let index=end;index>=start;index--)ctx.lineTo(x(index),y(selectedPrice(args.bars[index],lower)));ctx.closePath();ctx.fill();};
      fillBetween('high','close',settings.highFill);fillBetween('close','low',settings.lowFill);if(settings.highLineVisible!==false)drawSeries('high',settings.highColor,false,settings.highWidth,settings.highOpacity);if(settings.lowLineVisible!==false)drawSeries('low',settings.lowColor,false,settings.lowWidth,settings.lowOpacity);drawSeries('close',settings.closeColor,false,settings.closeWidth,settings.closeOpacity);
    }else if(this.id==='bars'){
      ctx.lineWidth=barsStrokeWidth(settings.thinBars,args.coords.bodySpacing());for(let index=start;index<=end;index++){const bar=args.bars[index],direction=candleDirection(bar.open,bar.close,args.bars[index-1]?.close,settings.previousClose),xx=x(index);ctx.strokeStyle=direction==='up'?settings.color:settings.downColor;ctx.beginPath();ctx.moveTo(xx,y(bar.high));ctx.lineTo(xx,y(bar.low));if(settings.openVisible){ctx.moveTo(xx-width/2,y(bar.open));ctx.lineTo(xx,y(bar.open));}ctx.moveTo(xx,y(bar.close));ctx.lineTo(xx+width/2,y(bar.close));ctx.stroke();}
    }else if(this.id==='hlcbars'){
      // HLC bars: one color, high-low stroke and the close tick, no open tick.
      ctx.lineWidth=barsStrokeWidth(settings.thinBars,args.coords.bodySpacing());ctx.strokeStyle=settings.color;ctx.beginPath();for(let index=start;index<=end;index++){const bar=args.bars[index],xx=x(index);ctx.moveTo(xx,y(bar.high));ctx.lineTo(xx,y(bar.low));ctx.moveTo(xx,y(bar.close));ctx.lineTo(xx+width/2,y(bar.close));}ctx.stroke();
    }else if(this.id==='columns'){
      for(let index=start;index<=end;index++){const bar=args.bars[index],value=selectedPrice(bar,settings.source),direction=candleDirection(bar.open,bar.close,args.bars[index-1]?.close,settings.previousClose),columnWidth=args.coords.bodySpacing()*(direction==='up'?settings.upWidthPercent:settings.downWidthPercent)/100;ctx.save();ctx.globalAlpha=direction==='up'?settings.upOpacity:settings.downOpacity;ctx.fillStyle=direction==='up'?settings.color:settings.downColor;const rawBaseline=y(args.scale.log&&args.scale.min>0?args.scale.min:0),baseline=Number.isFinite(rawBaseline)?rawBaseline:args.bounds.top+args.bounds.height;ctx.fillRect(x(index)-columnWidth/2,Math.min(y(value),baseline),columnWidth,Math.max(1,Math.abs(y(value)-baseline)));ctx.restore();}
    }else{
      const visibleVolumes=args.bars.slice(start,end+1).map(bar=>bar.volume??NaN);
      const widths=this.id==='volumecandles'?volumeWidths(visibleVolumes,width):visibleVolumes.map(()=>width);
      // Script bar colours (LV-VELA-RENDER-LEFTOVERS-1 lvBarColors) colour a hollow candle's body, border and wick; a
      // hollow body stays hollow. Absent (no COMPAT-11, or no coloured bar) every candle keeps its own colours.
      const scriptColors=this.id==='hollow'?layerBarColors(args):null;
      for(let index=start;index<=end;index++){
        const bar=args.bars[index],previous=args.bars[index-1]?.close;
        const state=this.id==='hollow'?hollowState(bar.open,bar.close,previous):{direction:candleDirection(bar.open,bar.close,previous,settings.previousClose),filled:true};
        const up=state.direction==='up',scriptColor=scriptColors?.get(bar.time),bodyColor=scriptColor??(this.id==='highlow'?highLowColor(settings.color,settings.downColor,up,settings.previousClose):up?settings.color:settings.downColor);
        const bodyWidth=widths[index-start],{top,height}=this.id==='highlow'?verticalBody(y(bar.high),y(bar.low)):verticalBody(y(bar.open),y(bar.close));
        if(settings.wickVisible&&this.id!=='highlow'){ctx.strokeStyle=scriptColor??(up?settings.wickUpColor:settings.wickDownColor);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x(index),y(bar.high));ctx.lineTo(x(index),y(bar.low));ctx.stroke();}
        if(settings.bodyVisible&&state.filled){ctx.fillStyle=bodyColor;ctx.fillRect(x(index)-bodyWidth/2,top,bodyWidth,height);}
        if(hollowOutlineVisible(settings.bodyVisible,settings.borderVisible,state.filled)){ctx.strokeStyle=this.id==='highlow'?highLowColor(settings.borderColor??bodyColor,settings.downColor,up,settings.previousClose):scriptColor??(settings.borderVisible?(up?settings.borderUpColor:settings.borderDownColor):bodyColor);ctx.lineWidth=1;ctx.strokeRect(x(index)-bodyWidth/2,top,bodyWidth,height);}
        if(this.id==='highlow'&&settings.labelsVisible&&args.coords.pxPerBar()>=30){ctx.fillStyle=settings.labelColor??bodyColor;ctx.font=`${settings.fontSize}px ${args.theme.fontFamily}`;ctx.textAlign='center';const highY=y(bar.high),lowY=y(bar.low);ctx.fillText(String(bar.high),x(index),highY<=lowY?highY-4:highY+settings.fontSize);ctx.fillText(String(bar.low),x(index),lowY>=highY?lowY+settings.fontSize:lowY-4);}
      }
    }
    ctx.restore();canvas.dataset.lvPaintedBars=String(end-start+1);canvas.dataset.lvFrames=String(Number(canvas.dataset.lvFrames??0)+1);
  }
  destroy(){this.canvas=null;}
}
let registered=false;
/** Time price opportunity is a time-based type with its own layer (tpo.ts), registered with the temporal types. */
export function registerTemporalChartTypes(){if(registered)return;registered=true;registerTpoChartType();registerSessionVolumeProfileChartType();registerFootprintChartType();for(const id of TEMPORAL_EXTENSION_IDS){registerChartType({id,label:CHART_TYPES.find(row=>row[0]===id)![1],basePainting:'none'});registerRendererLayer({id,placement:'below-data',create:()=>new TemporalLayer(id)});}}
/** Derived (non-time) types: the LV layer fully replaces the price painting and reads the derived
 * payload (derived/paint.ts DerivedLayerPayload) from its native-data channel. Not a barTransform:
 * vela transforms are 1:1 and time-preserving, these topologies are not. Called by the adapter once it
 * feeds the derived axis; until then the types stay unregistered. */
let derivedRegistered=false;
export const DERIVED_EXTENSION_IDS=DERIVED_STYLES;
export function registerDerivedChartTypes(){if(derivedRegistered)return;derivedRegistered=true;for(const id of DERIVED_STYLES){registerChartType({id,label:CHART_TYPES.find(row=>row[0]===id)![1],basePainting:'none'});registerRendererLayer({id,placement:'below-data',create:()=>new DerivedLayer(id)});}}
