// Shared pixel geometry for the 0.8.1 drawing fixes. Pure functions, no canvas, no native model.
//
// Bar space. The projector's x is linear in the logical bar index (CoordinateSystem.logicalToX), so "n bars after anchor A,
// counted in units of the A..B bar distance" is simply xA + n * (xB - xA) in pixels. Doing the arithmetic on x, not on epoch
// milliseconds, is what counts bars instead of calendar time: weekends, holidays and session gaps no longer stretch a step.
// This is the convention for Fibonacci time zones, Gann box and square time divisions, midpoints of pitchfork bases and the
// parallel channel middle handle.
//
// Directed rays. A ray, a pitchfork median or tine and a fan line start at their origin and run to the pane edge in the
// direction they were drawn: drawn right to left, they extend to the left.
export type Segment=[number,number,number,number];

/** From (x1, y1) through (x2, y2) to just past the pane edge, in the drawn direction. A vertical direction runs to the top or
 *  bottom edge. Returns the segment origin -> edge point. */
export function directedRay(x1:number,y1:number,x2:number,y2:number,width:number,height:number):Segment{
 const dx=x2-x1,dy=y2-y1;
 if(Math.abs(dx)<1e-6){
  if(Math.abs(dy)<1e-9)return[x1,y1,x2,y2];
  return[x1,y1,x2,dy>0?height:0];
 }
 const slope=dy/dx,edge=dx>0?width+2:-2;
 return[x1,y1,edge,y1+slope*(edge-x1)];
}
/** x of the point `n` bar units after `xa`, where one unit is the bar distance from `xa` to `xb`. */
export const barStepX=(xa:number,xb:number,n:number)=>xa+n*(xb-xa);
/** x of the midpoint of two anchors in bar space. */
export const barMidX=(xa:number,xb:number)=>(xa+xb)/2;

/** A parallel channel in screen space: the base line a..b and the parallel line through the offset handle c, shifted by the same
 *  pixel distance at both ends. On a linear scale this equals the native price offset; on a log scale it is the log price offset,
 *  so the two lines stay parallel on screen. `ratio` 1 is the parallel line, 0 the base line, others the channel levels. */
export function channelLineY(ya:number,yb:number,yc:number,ratio:number):{readonly y1:number;readonly y2:number}{
 const dy=yc-(ya+yb)/2;
 return{y1:ya+ratio*dy,y2:yb+ratio*dy};
}

/** Intersection of the infinite lines p1-p2 and p3-p4, or null when they are parallel. */
export function lineIntersection(p1:readonly [number,number],p2:readonly [number,number],p3:readonly [number,number],p4:readonly [number,number]):[number,number]|null{
 const d=(p1[0]-p2[0])*(p3[1]-p4[1])-(p1[1]-p2[1])*(p3[0]-p4[0]);
 if(Math.abs(d)<1e-9)return null;
 const a=p1[0]*p2[1]-p1[1]*p2[0],b=p3[0]*p4[1]-p3[1]*p4[0];
 const x=(a*(p3[0]-p4[0])-(p1[0]-p2[0])*b)/d,y=(a*(p3[1]-p4[1])-(p1[1]-p2[1])*b)/d;
 return Number.isFinite(x)&&Number.isFinite(y)?[x,y]:null;
}
/** Point-to-segment distance in pixels. */
export function segmentDistance(px:number,py:number,ax:number,ay:number,bx:number,by:number):number{
 const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;if(len2<=1e-9)return Math.hypot(px-ax,py-ay);
 const t=Math.min(1,Math.max(0,((px-ax)*dx+(py-ay)*dy)/len2));return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}
