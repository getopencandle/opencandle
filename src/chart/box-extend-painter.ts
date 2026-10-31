// Rectangle Extend (props.lvBoxExtend) as a pure plan plus a small canvas drawer, painted by the DWB3 shape layer.
// An
// extended side repeats the rectangle's background and its top and bottom border lines from the rectangle's edge to the pane edge,
// in the rectangle's own colors, width and line style. The extension is paint only: hit testing and handles stay on the rectangle.
import type {BoxExtendSettings} from './box-extend-data';

export interface BoxExtendAnchor {readonly time:number;readonly price:number}
export interface BoxExtendProjection {xOf(time:number):number;yOf(price:number):number}
export interface BoxExtendBounds {readonly left:number;readonly right:number;readonly top:number;readonly bottom:number}
export interface BoxExtendStyle {readonly lineColor:string;readonly lineWidth:number;readonly lineStyle:'solid'|'dashed'|'dotted';readonly fillColor:string|null}
export type BoxExtendOp=
 | {readonly kind:'fill';readonly x:number;readonly y:number;readonly width:number;readonly height:number;readonly color:string}
 | {readonly kind:'line';readonly x1:number;readonly x2:number;readonly y:number;readonly color:string;readonly width:number;readonly dash:readonly number[]};

/** Dash pattern per line style (the same proportions as the dialog preview strip, drawing-dialog-model.ts). */
const DASH:Readonly<Record<BoxExtendStyle['lineStyle'],readonly number[]>>={solid:[],dashed:[6,4],dotted:[1.5,3]};

/** Pure and total: [] for no member, both switches off, fewer than two anchors or any non-finite geometry. */
export function planBoxExtend(settings:Readonly<BoxExtendSettings>|undefined,anchors:readonly BoxExtendAnchor[],proj:BoxExtendProjection,bounds:BoxExtendBounds,style:BoxExtendStyle):BoxExtendOp[]{
 try{
  if(!settings||!(settings.left||settings.right)||anchors.length<2)return[];
  const xs=[proj.xOf(anchors[0].time),proj.xOf(anchors[1].time)],ys=[proj.yOf(anchors[0].price),proj.yOf(anchors[1].price)];
  if(![...xs,...ys,bounds.left,bounds.right].every(Number.isFinite))return[];
  const left=Math.min(xs[0],xs[1]),right=Math.max(xs[0],xs[1]),top=Math.min(ys[0],ys[1]),bottom=Math.max(ys[0],ys[1]);
  const width=Number.isFinite(style.lineWidth)&&style.lineWidth>0?style.lineWidth:1,dash=DASH[style.lineStyle]??[];
  const spans:Array<[number,number]>=[];
  if(settings.left&&left>bounds.left)spans.push([bounds.left,left]);
  if(settings.right&&right<bounds.right)spans.push([right,bounds.right]);
  const out:BoxExtendOp[]=[];
  for(const [from,to] of spans){
   if(style.fillColor&&bottom>top)out.push({kind:'fill',x:from,y:top,width:to-from,height:bottom-top,color:style.fillColor});
   for(const y of [top,bottom])out.push({kind:'line',x1:from,x2:to,y,color:style.lineColor,width,dash});
  }
  return out;
 }catch{return[];}
}

/** One save/restore pair around all operations. */
export function paintBoxExtend(ctx:CanvasRenderingContext2D,ops:readonly BoxExtendOp[]):void{
 if(!ops.length)return;
 ctx.save();
 try{
  for(const op of ops){
   if(op.kind==='fill'){ctx.fillStyle=op.color;ctx.fillRect(op.x,op.y,op.width,op.height);continue;}
   ctx.strokeStyle=op.color;ctx.lineWidth=op.width;ctx.setLineDash([...op.dash]);
   ctx.beginPath();ctx.moveTo(op.x1,op.y);ctx.lineTo(op.x2,op.y);ctx.stroke();
  }
  ctx.setLineDash([]);
 }finally{ctx.restore();}
}
