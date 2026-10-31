import { registerChartType, registerRendererLayer, type RendererLayerArgs, type RendererLayerInstance,type BarTransform } from '@luxalgo/vela';
import type { AppearanceSettings } from './appearance';
import {PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE,candlePriceDirection,latestPricePresentation,realLastPrice} from './appearance-price';
export {PREVIOUS_CLOSE_STYLE,PREVIOUS_CLOSE_HA_STYLE} from './appearance-price';

export function registerHeikinAppearanceTransform(transform:BarTransform|undefined){if(transform)registerChartType({id:PREVIOUS_CLOSE_HA_STYLE,label:'OpenCandle Heikin Ashi with previous-close coloring',barTransform:transform,basePainting:'none'});}
export const APPEARANCE_LAYER='lv-appearance';
export function appearanceBoolean(value:unknown):boolean { return value===true||value===1||value==='1'; }
export function candleDirection(open:number,close:number,previousClose:number|undefined,previousMode:boolean):'up'|'down' {
  // Explicit LV equality policy until an independently observed reference establishes it.
  return candlePriceDirection(open,close,previousClose,previousMode);
}
export function visibleExtremes(bars:RendererLayerArgs['bars'],from:number,to:number):{high:number;low:number}|null {
  const start=Math.max(0,Math.ceil(from)),end=Math.min(bars.length-1,Math.floor(to));
  if(start>end)return null;
  let high=-Infinity,low=Infinity;
  for(let index=start;index<=end;index++){high=Math.max(high,bars[index].high);low=Math.min(low,bars[index].low);}
  return Number.isFinite(high)&&Number.isFinite(low)?{high,low}:null;
}
class AppearanceLayer implements RendererLayerInstance {
  private canvas:HTMLCanvasElement|null=null;
  mount(canvas:HTMLCanvasElement){this.canvas=canvas;canvas.dataset.lvLayer=APPEARANCE_LAYER;}
  render(args:RendererLayerArgs){
    const canvas=this.canvas;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
    const settings=args.settings as AppearanceSettings;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);ctx.beginPath();ctx.rect(0,args.bounds.top,args.coords.width,args.bounds.height);ctx.clip();
    const s='mainSeriesProperties.',c=s+'candleStyle.';
    const color=(key:string,fallback:string)=>typeof settings[key]==='string'&&settings[key]!==''?String(settings[key]):fallback;
    let paintedCandles=0;
    if(args.priceStyle===PREVIOUS_CLOSE_STYLE||args.priceStyle===PREVIOUS_CLOSE_HA_STYLE){
      const range=args.coords.visibleLogicalRange();
      const start=Math.max(0,Math.floor(range.from)-1),end=Math.min(args.bars.length-1,Math.ceil(range.to)+1);
      const width=Math.max(1,args.coords.bodySpacing()*0.7);
      for(let index=start;index<=end;index++){
        const bar=args.bars[index],direction=candleDirection(bar.open,bar.close,args.bars[index-1]?.close,true);
        const suffix=direction==='up'?'UpColor':'DownColor';
        const bodyColor=color(c+(direction==='up'?'upColor':'downColor'),direction==='up'?args.theme.upColor:args.theme.downColor);
        const x=args.coords.logicalToX(index),yOpen=args.coords.priceToY(bar.open,args.scale,args.bounds),yClose=args.coords.priceToY(bar.close,args.scale,args.bounds);
        const top=Math.min(yOpen,yClose),height=Math.max(1,Math.abs(yOpen-yClose));
        if(appearanceBoolean(settings[c+'drawWick'])){ctx.strokeStyle=color(c+'wick'+suffix,bodyColor);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,args.coords.priceToY(bar.high,args.scale,args.bounds));ctx.lineTo(x,args.coords.priceToY(bar.low,args.scale,args.bounds));ctx.stroke();}
        if(appearanceBoolean(settings[c+'drawBody'])){ctx.fillStyle=bodyColor;ctx.fillRect(x-width/2,top,width,height);}
        if(appearanceBoolean(settings[c+'drawBorder'])){ctx.strokeStyle=color(c+'border'+suffix,bodyColor);ctx.lineWidth=1;ctx.strokeRect(x-width/2,top,width,height);}
        paintedCandles++;
      }
    }
    const line=(price:number,ink:string,width:number)=>{const y=args.coords.priceToY(price,args.scale,args.bounds);ctx.strokeStyle=ink;ctx.lineWidth=width;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(args.coords.width,y);ctx.stroke();};
    const last=args.bars.at(-1);let priceLines=0;
    if(last&&appearanceBoolean(settings[s+'showPriceLine'])){
      const up=candleDirection(last.open,last.close,args.bars.at(-2)?.close,appearanceBoolean(settings[c+'barColorsOnPrevClose']))==='up';
      const supplied=args.settings['lvTypeSettings'],typeSettings={source:settings['lvPriceSource']??'close',...(supplied&&typeof supplied==='object'&&!Array.isArray(supplied)?supplied:{})};
      const presentation=latestPricePresentation({priceStyle:args.priceStyle,bars:args.bars,style:{chartTypes:{[args.priceStyle]:typeSettings}},candleOverride:{upColor:settings[c+'upColor'],downColor:settings[c+'downColor']}},args.coords,args.theme,{scale:args.scale,bounds:args.bounds},realLastPrice(args.priceStyle,settings,(args as RendererLayerArgs&{lvRealBars?:unknown}).lvRealBars,args.bars));
      line(presentation?.value??last.close,color(s+'priceLineColor',presentation?.color??color(c+(up?'upColor':'downColor'),up?args.theme.upColor:args.theme.downColor)),Number(settings[s+'priceLineWidth'])||1);priceLines++;
    }
    if(appearanceBoolean(settings[s+'highLowAvgPrice.highLowPriceLinesVisible'])){
      const range=args.coords.visibleLogicalRange(),extremes=visibleExtremes(args.bars,range.from,range.to);
      if(extremes){const ink=color(s+'highLowAvgPrice.highLowPriceLinesColor',args.theme.textColor),width=Number(settings[s+'highLowAvgPrice.highLowPriceLinesWidth'])||1;line(extremes.high,ink,width);line(extremes.low,ink,width);priceLines+=2;}
    }
    ctx.restore();canvas.dataset.lvPaintedCandles=String(paintedCandles);canvas.dataset.lvPaintedPriceLines=String(priceLines);canvas.dataset.lvFrames=String(Number(canvas.dataset.lvFrames??0)+1);
  }
  destroy(){this.canvas=null;}
}
let registered=false;
export function registerAppearanceExtensions(){
  if(registered)return;registered=true;
  registerChartType({id:PREVIOUS_CLOSE_STYLE,label:'OpenCandle candles with previous-close coloring',basePainting:'none'});
  registerRendererLayer({id:APPEARANCE_LAYER,placement:'above-data',create:()=>new AppearanceLayer()});
}
