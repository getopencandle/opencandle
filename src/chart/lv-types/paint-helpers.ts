// Small canvas helpers shared by the paint-hook tools (position forecast, ghost feed, pin, table). The stroke and dash
// helpers transcribe the native painter's (DrawingPainter.stroke / dashPattern), so an LV-painted line looks like a native
// one; the label plate and font sizes follow the native note plate's metrics (named sizes tiny 10, small 12, normal 14,
// large 18, huge 28 px). Nothing here registers anything.
export interface StrokeStyle{readonly lineColor:string;readonly lineWidth:number;readonly lineStyle:string}
export const dashPattern=(style:string,width:number):number[]=>{const w=Math.max(1,width);return style==='dotted'?[w,w*2]:style==='dashed'?[w*4,w*3]:[];};
export function strokePath(ctx:CanvasRenderingContext2D,style:StrokeStyle,path:()=>void):void{
 ctx.strokeStyle=style.lineColor;ctx.lineWidth=style.lineWidth;ctx.setLineDash(dashPattern(style.lineStyle,style.lineWidth));
 ctx.beginPath();path();ctx.stroke();ctx.setLineDash([]);
}
const NAMED_PX:Readonly<Record<string,number>>=Object.freeze({tiny:10,small:12,normal:14,large:18,huge:28});
export const namedPx=(size:unknown):number=>typeof size==='string'&&Object.hasOwn(NAMED_PX,size)?NAMED_PX[size]:14;
export const lineHeight=(px:number)=>Math.round(px*1.3);
/** Approximate text width when no canvas is at hand (hit boxes): 0.6 em per character, like the native label boxes. */
export const approxTextWidth=(text:string,px:number)=>text.length*px*0.6;
export interface Rect{readonly x:number;readonly y:number;readonly w:number;readonly h:number}
export const inRect=(px:number,py:number,r:Rect,pad=0)=>px>=r.x-pad&&px<=r.x+r.w+pad&&py>=r.y-pad&&py<=r.y+r.h+pad;
/** A price as the plates show it: 2 decimals at or above 1, otherwise 4 significant digits. */
export function formatPlatePrice(price:number):string{
 if(!Number.isFinite(price))return '';
 return Math.abs(price)>=1?price.toFixed(2):Number(price.toPrecision(4)).toString();
}
/** Filled rounded plate with text lines, centred on (cx, cy). Returns the plate rectangle. */
export function paintPlate(ctx:CanvasRenderingContext2D,lines:readonly string[],cx:number,cy:number,opts:{readonly font:string;readonly px:number;readonly fill:string;readonly text:string;readonly padX?:number;readonly padY?:number}):Rect{
 ctx.save();
 ctx.font=opts.font;
 const padX=opts.padX??6,padY=opts.padY??4,lh=lineHeight(opts.px);
 const w=Math.max(...lines.map(line=>ctx.measureText(line).width))+padX*2,h=lines.length*lh+padY*2,x=cx-w/2,y=cy-h/2;
 ctx.fillStyle=opts.fill;ctx.beginPath();ctx.rect(x,y,w,h);ctx.fill();
 ctx.fillStyle=opts.text;ctx.textAlign='center';ctx.textBaseline='middle';
 lines.forEach((line,i)=>ctx.fillText(line,cx,y+padY+lh*i+lh/2));
 ctx.restore();
 return{x,y,w,h};
}
