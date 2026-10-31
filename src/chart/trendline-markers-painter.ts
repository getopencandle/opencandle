// Trendline middle point and price labels (props.lvTrendlineMarkers), as a pure plan plus a small canvas drawer.
// The reference facts give only the two toggles (showMiddlePoint, showPriceLabels). The glyph (a filled dot
// at handle size) and the placement (anchor prices printed against the price scale edge, right aligned) are OpenCandle's own design.
// An absent member means no markers, so a trendline saved before this wave paints exactly as before. The adapter installs the drawer
// next to the trendline statistics installation.
// The same member and painter serve the rest of the trendline family the reference dialog records the four rows for
// (Ray, Extended line, Info line, Arrow: visual-drawing-dialogs#dialog.LineTool{Ray,Extended,InfoLine,Arrow}.style.2/.3/.5). For those
// tools the shape layer also paints Distance and Angle (`statistics`), since the trendline statistics painter is trendline only.
import type {TrendlineMarkersSettings} from './trendline-stats-data';
import {calculateTrendlineAngle} from '../domain/trendline-statistics';

/** Renderer types whose dialog records Middle point, Price labels and the Stats Distance and Angle items (trendline first). */
export const LINE_MARKER_TYPES:readonly string[]=Object.freeze(['trendline','ray','extendedline','infoline','arrow']);
export function isLineMarkerType(type:unknown):boolean{return typeof type==='string'&&LINE_MARKER_TYPES.includes(type);}

export interface MarkerAnchor {readonly time:number;readonly price:number}
/** indexOf: fractional logical bar index of an anchor time (Distance needs it); null when the bars cannot place it. */
export interface MarkerProjection {xOf(time:number):number;yOf(price:number):number;indexOf?(time:number):number|null}
export interface MarkerBounds {readonly left:number;readonly right:number;readonly top:number;readonly bottom:number}
/** statistics: also plan the Distance and Angle lines (the line tools other than trendline). */
export interface MarkerOptions {readonly color:string;readonly format?:(price:number)=>string;readonly statistics?:boolean}
export type MarkerOp=
 | {readonly kind:'dot';readonly x:number;readonly y:number;readonly radius:number;readonly color:string}
 | {readonly kind:'text';readonly text:string;readonly x:number;readonly y:number;readonly align:'right';readonly color:string}
 // The Distance and Angle lines, centred above the segment midpoint on a theme background (the trendline statistics block layout).
 | {readonly kind:'block';readonly lines:readonly string[];readonly x:number;readonly y:number;readonly lineHeight:number};

/** Handle-sized: the same order of size as the drawing handles. */
export const MARKER_DOT_RADIUS=3;
/** Line height and gap of the statistics block, as the trendline statistics painter draws it (12px font, 16px lines, 6px off the midpoint). */
export const MARKER_BLOCK_LINE_HEIGHT=16;
const BLOCK_GAP=6;
const defaultFormat=(price:number)=>String(Number(price.toPrecision(8)));
const statNumber=(value:number)=>value===0?'0':Number(value.toPrecision(12)).toString();

/** The bar count and the price difference as a pair. Unavailable when the bars cannot place an anchor. */
export function lineDistanceText(anchors:readonly MarkerAnchor[],proj:MarkerProjection):string{
 const first=proj.indexOf?.(anchors[0].time)??null,second=proj.indexOf?.(anchors[1].time)??null;
 if(first===null||second===null||!Number.isFinite(first)||!Number.isFinite(second))return 'Distance: unavailable (an anchor is outside the loaded bars)';
 const price=Math.abs(anchors[1].price-anchors[0].price);
 if(!Number.isFinite(price))return 'Distance: unavailable (the price difference is not finite)';
 return 'Distance: '+statNumber(Math.abs(second-first))+' bars, '+statNumber(price);
}
/** Degrees of the projected segment, recomputed on every paint (two decimals, as the trendline statistics block). */
export function lineAngleText(first:{x:number;y:number},second:{x:number;y:number}):string{
 const angle=calculateTrendlineAngle(first,second);
 return angle.state==='available'?'Angle: '+statNumber(Number(angle.value.toFixed(2)))+' deg':'Angle: unavailable ('+angle.reason+')';
}

/** Pure and total: returns [] for no member, every toggle off, or any non-finite geometry. */
export function planTrendlineMarkers(settings:Readonly<TrendlineMarkersSettings>|undefined,anchors:readonly MarkerAnchor[],proj:MarkerProjection,bounds:MarkerBounds,options:MarkerOptions):MarkerOp[]{
 try{
  const statistics=options.statistics===true&&!!settings&&(settings.distance||settings.angle);
  if(!settings||!(settings.middlePoint||settings.priceLabels||statistics)||anchors.length<2)return[];
  const [first,second]=anchors,points=[first,second].map(anchor=>({x:proj.xOf(anchor.time),y:proj.yOf(anchor.price),price:anchor.price}));
  if(!points.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)&&Number.isFinite(point.price))||!Number.isFinite(bounds.right))return[];
  const format=options.format??defaultFormat,out:MarkerOp[]=[];
  const midX=(points[0].x+points[1].x)/2,midY=(points[0].y+points[1].y)/2;
  if(settings.middlePoint)out.push({kind:'dot',x:midX,y:midY,radius:MARKER_DOT_RADIUS,color:options.color});
  if(settings.priceLabels)for(const point of points)out.push({kind:'text',text:format(point.price),x:bounds.right-4,y:point.y,align:'right',color:options.color});
  if(statistics){
   const lines:string[]=[];
   if(settings.distance)lines.push(lineDistanceText([first,second],proj));
   if(settings.angle)lines.push(lineAngleText(points[0],points[1]));
   out.push({kind:'block',lines,x:midX,y:midY-BLOCK_GAP-lines.length*MARKER_BLOCK_LINE_HEIGHT,lineHeight:MARKER_BLOCK_LINE_HEIGHT});
  }
  return out;
 }catch{return[];}
}

/** One save/restore pair around all marker operations. background/textColor: the block colors (the chart theme). */
export function paintTrendlineMarkers(ctx:CanvasRenderingContext2D,ops:readonly MarkerOp[],theme:{readonly fontFamily:string;readonly background?:string;readonly textColor?:string}):void{
 if(!ops.length)return;
 ctx.save();
 try{
  ctx.font='12px '+theme.fontFamily;ctx.textBaseline='middle';
  for(const op of ops){
   if(op.kind==='block'){
    let widest=0;for(const line of op.lines){const width=Number(ctx.measureText?.(line)?.width);if(Number.isFinite(width)&&width>widest)widest=width;}
    ctx.textAlign='center';ctx.textBaseline='top';
    ctx.fillStyle=theme.background??'#ffffff';ctx.fillRect(op.x-widest/2-4,op.y-4,widest+8,op.lines.length*op.lineHeight+8);
    ctx.fillStyle=theme.textColor??'#131722';
    op.lines.forEach((line,index)=>ctx.fillText(line,op.x,op.y+index*op.lineHeight));
    ctx.textBaseline='middle';continue;
   }
   ctx.fillStyle=op.color;
   if(op.kind==='dot'){ctx.beginPath();ctx.arc(op.x,op.y,op.radius,0,Math.PI*2);ctx.fill();}
   else{ctx.textAlign=op.align;ctx.fillText(op.text,op.x,op.y);}
  }
 }finally{ctx.restore();}
}
