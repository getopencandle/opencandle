// Painters for the derived chart types. Pure geometry helpers are exported for numeric tests; the
// layer paints the `DerivedLayerPayload` pushed on its native-data channel, index-aligned with the
// renderer feed built by derived-axis.ts. Widths and line thickness are LV presentation choices.
import type {RendererLayerArgs,RendererLayerInstance} from '@luxalgo/vela';
import type {DerivedBar,DerivedStyle} from './common';
import {derivedSettingsDefaults} from './derived-settings';

export interface DerivedLayerPayload {style:DerivedStyle;bars:readonly DerivedBar[];projectionFrom:number;step:number|null}
export interface Cell {low:number;high:number;mark:'X'|'O'}
/** Point and figure boxes of one column, bottom to top. */
export function pnfCells(bar:Pick<DerivedBar,'open'|'close'|'direction'|'boxes'>,step:number):Cell[]{
  const count=bar.boxes??Math.round(Math.abs(bar.close-bar.open)/step),bottom=Math.min(bar.open,bar.close),mark=bar.direction==='up'?'X':'O';
  return Array.from({length:count},(_,index)=>({low:bottom+index*step,high:bottom+(index+1)*step,mark}));
}
export interface KagiPiece {fromIndex:number;fromPrice:number;toIndex:number;toPrice:number;yang:boolean}
/** Kagi line pieces in (logical index, price) space: one vertical per segment (split at the switch price) and a horizontal shoulder/waist connector to the next segment. */
export function kagiPieces(bars:readonly DerivedBar[]):KagiPiece[]{
  const pieces:KagiPiece[]=[];
  bars.forEach((bar,index)=>{
    const start=bar.yangStart??bar.direction==='up',end=bar.yangEnd??start;
    if(bar.switchPrice!=null&&start!==end){pieces.push({fromIndex:index,fromPrice:bar.open,toIndex:index,toPrice:bar.switchPrice,yang:start});pieces.push({fromIndex:index,fromPrice:bar.switchPrice,toIndex:index,toPrice:bar.close,yang:end});}
    else pieces.push({fromIndex:index,fromPrice:bar.open,toIndex:index,toPrice:bar.close,yang:end});
    if(index+1<bars.length)pieces.push({fromIndex:index,fromPrice:bar.close,toIndex:index+1,toPrice:bar.close,yang:end});
  });
  return pieces;
}
/** Fill/border/wick colors of one display bar from the settings. */
export function derivedColors(bar:Pick<DerivedBar,'direction'|'projection'>,settings:Record<string,unknown>,style:DerivedStyle):{fill:string;border:string;wick:string}{
  const up=bar.direction==='up',pick=(key:string,fallback:string)=>String(settings[key]??settings[fallback]);
  if(bar.projection){const fill=up?'upProjectionColor':'downProjectionColor';return {fill:pick(fill,fill),border:pick(up?'borderUpProjectionColor':'borderDownProjectionColor',fill),wick:pick(fill,fill)};}
  if(style==='range'&&settings.rangeStyle==='candles')return {fill:pick(up?'candlesUpColor':'candlesDownColor',''),border:pick(up?'candlesBorderUpColor':'candlesBorderDownColor',''),wick:pick(up?'candlesWickUpColor':'candlesWickDownColor','')};
  const fill=up?'color':'downColor';
  return {fill:pick(fill,fill),border:pick(up?'borderUpColor':'borderDownColor',fill),wick:pick(up?'wickUpColor':'wickDownColor',fill)};
}
export const KAGI_WIDTHS=Object.freeze({yang:3,yin:1});

export class DerivedLayer implements RendererLayerInstance{
  private canvas:HTMLCanvasElement|null=null;
  constructor(private id:DerivedStyle){}
  mount(canvas:HTMLCanvasElement){this.canvas=canvas;canvas.dataset.lvChartType=this.id;}
  render(args:RendererLayerArgs){
    const canvas=this.canvas;if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);
    const payload=args.data as DerivedLayerPayload|undefined;
    if(args.priceStyle!==this.id||!payload||payload.style!==this.id||!payload.bars.length)return;
    const settings={...derivedSettingsDefaults(this.id),...args.settings},bars=payload.bars;
    const range=args.coords.visibleLogicalRange(),start=Math.max(0,Math.floor(range.from)-1),end=Math.min(bars.length-1,Math.ceil(range.to)+1);if(start>end)return;
    const x=(index:number)=>args.coords.logicalToX(index),y=(price:number)=>args.coords.priceToY(price,args.scale,args.bounds),spacing=args.coords.bodySpacing(),width=Math.max(1,spacing*0.8);
    ctx.save();ctx.scale(args.coords.dpr,args.coords.dpr);ctx.beginPath();ctx.rect(0,args.bounds.top,args.coords.width,args.bounds.height);ctx.clip();
    if(this.id==='kagi'){
      ctx.lineCap='square';
      for(const piece of kagiPieces(bars))if(piece.toIndex>=start&&piece.fromIndex<=end){const projected=bars[piece.fromIndex].projection;ctx.strokeStyle=String(settings[projected?(piece.yang?'upProjectionColor':'downProjectionColor'):(piece.yang?'color':'downColor')]);ctx.lineWidth=piece.yang?KAGI_WIDTHS.yang:KAGI_WIDTHS.yin;ctx.beginPath();ctx.moveTo(x(piece.fromIndex),y(piece.fromPrice));ctx.lineTo(x(piece.toIndex),y(piece.toPrice));ctx.stroke();}
    }else for(let index=start;index<=end;index++){
      const bar=bars[index],colors=derivedColors(bar,settings,this.id),xx=x(index);
      if(this.id==='pointfigure'&&payload.step){
        ctx.strokeStyle=colors.fill;ctx.lineWidth=1;
        for(const cell of pnfCells(bar,payload.step)){const top=y(cell.high),bottom=y(cell.low),half=Math.min(width,Math.abs(bottom-top))/2,mid=(top+bottom)/2;ctx.beginPath();if(cell.mark==='X'){ctx.moveTo(xx-half,mid-half);ctx.lineTo(xx+half,mid+half);ctx.moveTo(xx+half,mid-half);ctx.lineTo(xx-half,mid+half);}else ctx.ellipse(xx,mid,half,half,0,0,Math.PI*2);ctx.stroke();}
      }else if(this.id==='range'&&settings.rangeStyle!=='candles'){
        ctx.strokeStyle=colors.fill;ctx.lineWidth=settings.thinBars===false?Math.max(1,Math.min(5,spacing*0.18)):1;ctx.beginPath();ctx.moveTo(xx,y(bar.high));ctx.lineTo(xx,y(bar.low));ctx.moveTo(xx-width/2,y(bar.open));ctx.lineTo(xx,y(bar.open));ctx.moveTo(xx,y(bar.close));ctx.lineTo(xx+width/2,y(bar.close));ctx.stroke();
      }else{
        // Range candles always draw borders and wicks (there are no toggles for them).
        const wicks=this.id==='renko'?settings.wicks!==false:this.id==='range',borders=true;
        if(wicks){ctx.strokeStyle=colors.wick;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,y(bar.high));ctx.lineTo(xx,y(bar.low));ctx.stroke();}
        const top=Math.min(y(bar.open),y(bar.close)),height=Math.max(1,Math.abs(y(bar.open)-y(bar.close))),w=this.id==='range'?width:Math.max(1,spacing);
        ctx.fillStyle=colors.fill;ctx.fillRect(xx-w/2,top,w,height);
        if(borders){ctx.strokeStyle=colors.border;ctx.lineWidth=1;ctx.strokeRect(xx-w/2,top,w,height);}
      }
    }
    ctx.restore();canvas.dataset.lvPaintedBars=String(end-start+1);canvas.dataset.lvFrames=String(Number(canvas.dataset.lvFrames??0)+1);
  }
  destroy(){this.canvas=null;}
}
