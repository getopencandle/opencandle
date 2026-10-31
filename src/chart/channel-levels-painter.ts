// Parallel channel level lines and extensions, as a pure plan plus a small canvas drawer.
// The plan is data only (no canvas, no native model), so it is tested without a renderer. The adapter installs the drawer next to the
// trendline statistics installation. Defaults are our own choice, see channel-levels-data.ts.
import type {ChannelLevelsSettings} from './channel-levels-data';

export interface ChannelAnchor {readonly time:number;readonly price:number}
export interface ChannelProjection {xOf(time:number):number;yOf(price:number):number}
export interface ChannelBounds {readonly left:number;readonly right:number;readonly top:number;readonly bottom:number}
export interface ChannelBaseStyle {readonly color:string;readonly width:number;readonly style:'solid'|'dashed'|'dotted'}
export interface ChannelLineOp {readonly kind:'line';readonly x1:number;readonly y1:number;readonly x2:number;readonly y2:number;readonly color:string;readonly alpha:number;readonly width:number;readonly dash:readonly number[]}

const dashFor=(style:'solid'|'dashed'|'dotted',width:number):number[]=>style==='dotted'?[width,width*2]:style==='dashed'?[width*4,width*3]:[];
const finite=(...values:number[])=>values.every(Number.isFinite);

/** Level r is the base line moved by r times the channel offset (r 0 is the base line, r 1 the parallel line). The offset is the third anchor minus the
 * midpoint of the first two prices, the same definition the coordinate editor uses. Extension follows the segment slope to the pane edge.
 * Returns [] for no member, for the legacy settings and for any non-finite geometry. Never throws. */
export function planChannelLevels(settings:Readonly<ChannelLevelsSettings>|undefined,anchors:readonly ChannelAnchor[],proj:ChannelProjection,bounds:ChannelBounds,base:ChannelBaseStyle):ChannelLineOp[]{
 try{
  if(!settings||anchors.length<3)return[];
  const anyLevel=settings.levels.some(level=>level.enabled);
  if(!anyLevel&&!settings.extendLeft&&!settings.extendRight)return[];
  const [a,b,c]=anchors,offset=c.price-(a.price+b.price)/2;
  const x0=proj.xOf(a.time),x1=proj.xOf(b.time);
  if(!finite(offset,x0,x1,bounds.left,bounds.right)||x0===x1)return[];
  const left=x0<=x1?{time:a.time,price:a.price,x:x0}:{time:b.time,price:b.price,x:x1},right=x0<=x1?{time:b.time,price:b.price,x:x1}:{time:a.time,price:a.price,x:x0};
  const out:ChannelLineOp[]=[];
  const line=(ratio:number,color:string,alpha:number,width:number,dash:readonly number[],tailsOnly:boolean)=>{
   const ly=proj.yOf(left.price+ratio*offset),ry=proj.yOf(right.price+ratio*offset);
   if(!finite(ly,ry))return false;
   const slope=(ry-ly)/(right.x-left.x),yAt=(x:number)=>ly+slope*(x-left.x);
   const startX=settings.extendLeft?Math.min(bounds.left,left.x):left.x,endX=settings.extendRight?Math.max(bounds.right,right.x):right.x;
   const op=(xa:number,ya:number,xb:number,yb:number)=>out.push({kind:'line',x1:xa,y1:ya,x2:xb,y2:yb,color,alpha,width,dash});
   if(tailsOnly){
    if(settings.extendLeft&&startX<left.x)op(startX,yAt(startX),left.x,ly);
    if(settings.extendRight&&endX>right.x)op(right.x,ry,endX,yAt(endX));
   }else op(startX,startX===left.x?ly:yAt(startX),endX,endX===right.x?ry:yAt(endX));
   return true;
  };
  if(settings.extendLeft||settings.extendRight){
   // The renderer already draws the two channel lines between the anchors; only their continuation is drawn here.
   const dash=dashFor(base.style,base.width);
   for(const ratio of [0,1])if(!line(ratio,base.color,1,base.width,dash,true))return[];
  }
  for(const row of settings.levels){
   if(!row.enabled)continue;
   if(!line(row.ratio,row.color,row.opacity/100,row.width,dashFor(row.style,row.width),false))return[];
  }
  return out.every(op=>finite(op.x1,op.y1,op.x2,op.y2))?out:[];
 }catch{return[];}
}

/** Draws a plan inside one save/restore pair, clipped to nothing (the plan is already bounded to the pane). */
export function paintChannelLevels(ctx:CanvasRenderingContext2D,ops:readonly ChannelLineOp[]):void{
 if(!ops.length)return;
 ctx.save();
 try{
  for(const op of ops){
   ctx.globalAlpha=op.alpha;ctx.strokeStyle=op.color;ctx.lineWidth=op.width;ctx.setLineDash([...op.dash]);
   ctx.beginPath();ctx.moveTo(op.x1,op.y1);ctx.lineTo(op.x2,op.y2);ctx.stroke();
  }
 }finally{ctx.restore();}
}
