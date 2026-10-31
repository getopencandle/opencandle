// Small geometry helpers for the LV icon set. All icons are original LV drawings on a
// 1px stroke grid; these helpers only trim line ends so hollow anchor rings stay hollow.
export type Point=readonly [number,number];

/** Anchor ring radius (stroke centre). With a 1px stroke the ring is about 4px across. */
export const ANCHOR_R=1.5;
/** Where a line meets an anchor ring: ring radius plus half the stroke. */
export const ANCHOR_GAP=ANCHOR_R+0.5;

const round=(value:number)=>Math.round(value*100)/100;
const fmt=(point:Point)=>`${round(point[0])} ${round(point[1])}`;

/** Path for the segment a->b, shortened by `trimA` at a and `trimB` at b. */
export function segment(a:Point,b:Point,trimA=0,trimB=0):string{
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
 if(!(length>trimA+trimB))throw new Error('Icon segment is shorter than its trims.');
 const ux=dx/length,uy=dy/length;
 return `M${fmt([a[0]+ux*trimA,a[1]+uy*trimA])}L${fmt([b[0]-ux*trimB,b[1]-uy*trimB])}`;
}

/** Consecutive segments through `points`; points flagged in `anchored` get a ring gap. */
export function chain(points:readonly Point[],anchored:readonly boolean[],closed=false):string{
 const pairs:string[]=[];
 const count=closed?points.length:points.length-1;
 for(let index=0;index<count;index++){
  const next=(index+1)%points.length;
  pairs.push(segment(points[index]!,points[next]!,anchored[index]?ANCHOR_GAP:0,anchored[next]?ANCHOR_GAP:0));
 }
 return pairs.join('');
}

/** Open arrowhead at `tip`, pointing away from `from`. */
export function arrowHead(tip:Point,from:Point,length=3,degrees=40):string{
 const dx=from[0]-tip[0],dy=from[1]-tip[1],size=Math.hypot(dx,dy),ux=dx/size,uy=dy/size,angle=degrees*Math.PI/180;
 const rotate=(sign:number):Point=>[tip[0]+length*(ux*Math.cos(angle)-sign*uy*Math.sin(angle)),tip[1]+length*(sign*ux*Math.sin(angle)+uy*Math.cos(angle))];
 return `M${fmt(rotate(1))}L${fmt(tip)}L${fmt(rotate(-1))}`;
}

/** Point on a circle; degrees grow clockwise on screen (SVG y axis points down). */
export function onCircle(cx:number,cy:number,r:number,degrees:number):Point{
 const angle=degrees*Math.PI/180;return [cx+r*Math.cos(angle),cy+r*Math.sin(angle)];
}

/** Clockwise arc from `from` to `to` degrees with an arrowhead at its end. */
export function arcArrow(cx:number,cy:number,r:number,from:number,to:number,head=3):string{
 const start=onCircle(cx,cy,r,from),end=onCircle(cx,cy,r,to),large=((to-from+360)%360)>180?1:0;
 const before=onCircle(cx,cy,r,to-8);
 return `M${fmt(start)}A${r} ${r} 0 ${large} 1 ${fmt(end)}`+arrowHead(end,before,head);
}

/** Polygon points for a regular polygon (first vertex straight up). */
export function regularPolygon(cx:number,cy:number,r:number,sides:number):string{
 return Array.from({length:sides},(_,index)=>fmt(onCircle(cx,cy,r,-90+index*360/sides)).replace(' ',',')).join(' ');
}

/** Polygon points for an n-pointed star (first point straight up). */
export function starPolygon(cx:number,cy:number,outer:number,inner:number,points=5):string{
 return Array.from({length:points*2},(_,index)=>fmt(onCircle(cx,cy,index%2?inner:outer,-90+index*180/points)).replace(' ',',')).join(' ');
}

/** Circular arc from `from` to `to` degrees (clockwise when to > from), optionally with a leading move. */
export function arc(cx:number,cy:number,r:number,from:number,to:number,move=true):string{
 const start=onCircle(cx,cy,r,from),end=onCircle(cx,cy,r,to),delta=to-from;
 return (move?`M${fmt(start)}`:'')+`A${r} ${r} 0 ${Math.abs(delta)>180?1:0} ${delta>0?1:0} ${fmt(end)}`;
}

/** Rotate points about a centre by `degrees` (clockwise on screen). */
export function rotate(points:readonly Point[],center:Point,degrees:number):Point[]{
 const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return points.map(([x,y])=>{const dx=x-center[0],dy=y-center[1];return [round(center[0]+dx*c-dy*s),round(center[1]+dx*s+dy*c)] as Point;});
}

/** `points` attribute text for polygon/polyline. */
export function pointList(points:readonly Point[]):string{return points.map(point=>fmt(point).replace(' ',',')).join(' ');}

/** Outline of a block arrow from `start` along `degrees` (0 = right, -90 = up). */
export function blockArrow(start:Point,degrees:number,length:number,headLength:number,shaftHalf:number,headHalf:number):string{
 const base=length-headLength,local:Point[]=[[0,-shaftHalf],[base,-shaftHalf],[base,-headHalf],[length,0],[base,headHalf],[base,shaftHalf],[0,shaftHalf]];
 return pointList(rotate(local.map(([x,y])=>[start[0]+x,start[1]+y] as Point),start,degrees));
}
