// Pitchfan, Cyclic lines, Time cycles, Sine line, Sector and Arrow marker on the shared segment base
// (./segment-tool-base.ts, pinned native `triangle`). Every geometry below is a slice approximation: the
// reference facts record the rows (static-drawing-toolbar#tool.<toolId>), the one-click-per-point gesture
// (static-drawing-defaults#tool.<toolId>.creation) and nothing else about these tools (pointsCountKnown false,
// factoryDefaults unknown). Sector alone has confirmed floating toolbar settings (static-drawing-defaults-2#
// tool.LineToolProjection.status: Background color 1, Background color 2, line widths); one fill color and the line width
// map to native style.fillColor / style.lineWidth, and the second background color is recorded as an unapplied row.
//
// All geometry is in pixels, so repetition follows the chart's bar spacing (the time axis is bar-indexed).
import type {Projector} from '../lv-drawing-pin';
import {defineLvDrawingToolModule,type LvDrawingToolModule} from './contract';
import {defineSegmentTool,polylineSegments,rayToEdge,segmentToolUnapplied,SEGMENT_BASE,type Point,type Segment,type SegmentGeometry,type SegmentToolSpec} from './segment-tool-base';

/** Upper bound of repeated cycles or samples per drawing (a 1 px cycle on a wide pane stays bounded). */
export const MAX_REPEATS=400;
const MIN_PERIOD_PX=2;
const line=(a:Point,b:Point):Segment=>[a[0],a[1],b[0],b[1]];

// ── Pitchfan ──
/** Pitchfan: the pivot fans rays through the second point, the midpoint of the second and third points (the
 *  pitchfork median direction) and the third point, out to the pane edge; the second and third points are joined. */
export function pitchfanGeometry(points:readonly Point[],proj:Projector):SegmentGeometry|null{
 const [a,b,c]=points;if(!a)return null;
 if(!b)return{segments:[],fill:null};
 if(!c)return{segments:[line(a,b)],fill:null};
 const mid:Point=[(b[0]+c[0])/2,(b[1]+c[1])/2];
 const rays=[b,mid,c].map(target=>line(a,rayToEdge(a,target,proj.width,proj.height)));
 return{segments:[...rays,line(b,c)],fill:null};
}

// ── Cyclic lines ──
/** Cyclic lines: full-height vertical lines at the first point and every multiple of the distance from the first to
 *  the second point, repeated forward (in the direction of the second point) to the pane edge. */
export function cyclicLinesGeometry(points:readonly Point[],proj:Projector):SegmentGeometry|null{
 const [a,b]=points;if(!a)return null;
 const vertical=(x:number):Segment=>[x,0,x,proj.height];
 const period=b?b[0]-a[0]:0;
 if(!b||Math.abs(period)<MIN_PERIOD_PX)return{segments:[vertical(a[0])],fill:null};
 const segments:Segment[]=[];
 // First repeat at or inside the near pane edge, then forward to the far edge.
 const start=period>0?Math.max(0,Math.ceil((0-a[0])/period)):Math.max(0,Math.ceil((a[0]-proj.width)/-period));
 for(let k=start;segments.length<MAX_REPEATS;k++){const x=a[0]+k*period;if(period>0?x>proj.width:x<0)break;segments.push(vertical(x));}
 return{segments,fill:null};
}

// ── Time cycles ──
/** Samples per half-ellipse arc. */
export const ARC_SAMPLES=24;
/** Time cycles: half ellipses standing on the first point's level, each as wide as the distance from the first to the
 *  second point and as tall as their price gap (a half circle when the gap is zero), repeated forward to the pane edge. The arcs
 *  bulge toward the second point's side. */
export function timeCyclesGeometry(points:readonly Point[],proj:Projector):SegmentGeometry|null{
 const [a,b]=points;if(!a)return null;
 if(!b)return{segments:[],fill:null};
 const width=b[0]-a[0];
 if(Math.abs(width)<MIN_PERIOD_PX)return{segments:[line(a,b)],fill:null};
 const rx=Math.abs(width)/2,gap=b[1]-a[1],ry=Math.abs(gap)>=1?Math.abs(gap):rx,up=gap<=0?-1:1;
 const segments:Segment[]=[];
 const start=width>0?Math.max(0,Math.floor((0-a[0])/width)):Math.max(0,Math.floor((a[0]-proj.width)/-width));
 for(let k=start;segments.length<MAX_REPEATS*ARC_SAMPLES;k++){
  const x0=a[0]+k*width;if(width>0?x0>proj.width:x0<0)break;
  const cx=x0+width/2;let prev:Point|null=null;
  for(let i=0;i<=ARC_SAMPLES;i++){
   const t=Math.PI*i/ARC_SAMPLES,p:Point=[cx-Math.cos(t)*width/2,a[1]+up*Math.sin(t)*ry];
   if(prev)segments.push(line(prev,p));prev=p;
  }
 }
 return{segments,fill:null};
}

// ── Sine line ──
export const SINE_STEP_PX=4;
/** Sine line: the first point is a crest (or trough) and the second the next trough (or crest), so their distance is
 *  half a period and their gap is the full swing. The wave is drawn across the whole pane width in 4 px steps. */
export function sineValueAt(a:Point,b:Point,x:number):number{
 const half=b[0]-a[0],center=(a[1]+b[1])/2,amplitude=(b[1]-a[1])/2;
 return center-amplitude*Math.cos(Math.PI*(x-a[0])/half);
}
export function sineLineGeometry(points:readonly Point[],proj:Projector):SegmentGeometry|null{
 const [a,b]=points;if(!a)return null;
 if(!b)return{segments:[],fill:null};
 if(Math.abs(b[0]-a[0])<MIN_PERIOD_PX)return{segments:[line(a,b)],fill:null};
 const samples:Point[]=[],step=Math.max(SINE_STEP_PX,proj.width/(MAX_REPEATS*4));
 for(let x=0;x<proj.width+step;x+=step)samples.push([Math.min(x,proj.width),sineValueAt(a,b,Math.min(x,proj.width))]);
 return{segments:polylineSegments(samples),fill:null};
}

// ── Sector ──
export const SECTOR_SAMPLES=48;
/** Sector: the first point is the center, the second sets the radius and the start angle, the third the end angle.
 *  The sector sweeps the smaller turn from start to end; its outline (two radii and the arc) is stroked and the area filled. */
export function sectorGeometry(points:readonly Point[]):SegmentGeometry|null{
 const [o,b,c]=points;if(!o)return null;
 if(!b)return{segments:[],fill:null};
 if(!c)return{segments:[line(o,b)],fill:null};
 const r=Math.hypot(b[0]-o[0],b[1]-o[1]);
 if(r<1)return{segments:[line(o,b),line(o,c)],fill:null};
 const start=Math.atan2(b[1]-o[1],b[0]-o[0]);let sweep=Math.atan2(c[1]-o[1],c[0]-o[0])-start;
 while(sweep>Math.PI)sweep-=2*Math.PI;while(sweep<-Math.PI)sweep+=2*Math.PI;
 const arc:Point[]=[];
 for(let i=0;i<=SECTOR_SAMPLES;i++){const t=start+sweep*i/SECTOR_SAMPLES;arc.push([o[0]+r*Math.cos(t),o[1]+r*Math.sin(t)]);}
 return{segments:[line(o,arc[0]),...polylineSegments(arc),line(arc[arc.length-1],o)],fill:[o,...arc]};
}

// ── Arrow marker ──
/** Arrow marker: a filled block arrow from the first point (tail) to the second (tip). Head length is 40 percent of
 *  the arrow, capped at 28 px; shaft width 8 px, head width 20 px (both scaled down for arrows shorter than 30 px). */
export function arrowMarkerOutline(tail:Point,tip:Point):Point[]|null{
 const dx=tip[0]-tail[0],dy=tip[1]-tail[1],length=Math.hypot(dx,dy);
 if(length<1)return null;
 const ux=dx/length,uy=dy/length,nx=-uy,ny=ux,scale=Math.min(1,length/30);
 const head=Math.min(28,length*0.4),shaft=4*scale,wing=10*scale;
 const neck:Point=[tip[0]-ux*head,tip[1]-uy*head];
 const at=(p:Point,w:number):Point=>[p[0]+nx*w,p[1]+ny*w];
 return[at(tail,shaft),at(neck,shaft),at(neck,wing),[tip[0],tip[1]],at(neck,-wing),at(neck,-shaft),at(tail,-shaft)];
}
export function arrowMarkerGeometry(points:readonly Point[]):SegmentGeometry|null{
 const [a,b]=points;if(!a)return null;
 if(!b)return{segments:[],fill:null};
 const outline=arrowMarkerOutline(a,b);
 if(!outline)return{segments:[line(a,b)],fill:null};
 return{segments:polylineSegments([...outline,outline[0]]),fill:outline};
}

// ── Specs and modules ──
export const LV_PITCHFAN='lvpitchfan',LV_CYCLIC_LINES='lvcycliclines',LV_TIME_CYCLES='lvtimecycles',LV_SINE_LINE='lvsineline',LV_SECTOR='lvsector',LV_ARROW_MARKER='lvarrowmarker';
export const PITCHFAN_SPEC:SegmentToolSpec=Object.freeze({type:LV_PITCHFAN,toolId:'LineToolPitchfan',rowId:'DW.FIB.PITCHFAN',label:'Pitchfan',roles:Object.freeze(['pivot','p1','p2']),geometry:pitchfanGeometry,fill:false,unbounded:true,
 note:'Click the pivot, then two points. Rays run from the pivot through each point and through their midpoint.'});
export const CYCLIC_LINES_SPEC:SegmentToolSpec=Object.freeze({type:LV_CYCLIC_LINES,toolId:'LineToolCircleLines',rowId:'DW.CYCLE.CYCLIC_LINES',label:'Cyclic lines',roles:Object.freeze(['start','next']),geometry:cyclicLinesGeometry,fill:false,unbounded:true,
 note:'Click two points one cycle apart. Vertical lines repeat at that spacing.'});
export const TIME_CYCLES_SPEC:SegmentToolSpec=Object.freeze({type:LV_TIME_CYCLES,toolId:'LineToolTimeCycles',rowId:'DW.CYCLE.TIME_CYCLES',label:'Time cycles',roles:Object.freeze(['start','end']),geometry:timeCyclesGeometry,fill:false,unbounded:true,
 note:'Click the start and the end of one cycle. Arcs repeat at that width.'});
export const SINE_LINE_SPEC:SegmentToolSpec=Object.freeze({type:LV_SINE_LINE,toolId:'LineToolSineLine',rowId:'DW.CYCLE.SINE_LINE',label:'Sine line',roles:Object.freeze(['peak','trough']),geometry:sineLineGeometry,fill:false,unbounded:true,
 note:'Click a peak, then the next trough. The wave continues across the chart.'});
export const SECTOR_SPEC:SegmentToolSpec=Object.freeze({type:LV_SECTOR,toolId:'LineToolProjection',rowId:'DW.FORECAST.SECTOR',label:'Sector',roles:Object.freeze(['center','start','end']),geometry:(points:readonly Point[])=>sectorGeometry(points),fill:true,
 note:'Click the center, then the start of the arc, then its end.'});
export const ARROW_MARKER_SPEC:SegmentToolSpec=Object.freeze({type:LV_ARROW_MARKER,toolId:'LineToolArrowMarker',rowId:'DW.SHAPE.ARROW_MARKER',label:'Arrow marker',roles:Object.freeze(['tail','tip']),geometry:(points:readonly Point[])=>arrowMarkerGeometry(points),fill:true,
 note:'Click the tail, then the tip.'});

const SHAPES:Readonly<Record<string,string>>=Object.freeze({
 [LV_PITCHFAN]:'three rays from the pivot (through each point and their midpoint) plus the line joining the two points',
 [LV_CYCLIC_LINES]:'vertical lines repeating at the spacing of the two points',
 [LV_TIME_CYCLES]:'half ellipses repeating at the width of the two points',
 [LV_SINE_LINE]:'a sine wave with the two points as a peak and the next trough',
 [LV_SECTOR]:'a filled circular sector',
 [LV_ARROW_MARKER]:'a filled block arrow from the first to the second point',
});

function segmentModule(id:string,spec:SegmentToolSpec,extra:Partial<LvDrawingToolModule>={}):LvDrawingToolModule{
 return defineLvDrawingToolModule({
  id,
  types:[{type:spec.type,base:SEGMENT_BASE,define:()=>defineSegmentTool(spec)}],
  ...extra,
  unappliedDefaults:[segmentToolUnapplied(spec,SHAPES[spec.type]),...(extra.unappliedDefaults??[])],
  catalog:[{rowId:spec.rowId,type:spec.type,note:spec.note}],
 });
}
export const PITCHFAN_MODULE=segmentModule('pitchfan',PITCHFAN_SPEC);
export const CYCLIC_LINES_MODULE=segmentModule('cyclic-lines',CYCLIC_LINES_SPEC);
export const TIME_CYCLES_MODULE=segmentModule('time-cycles',TIME_CYCLES_SPEC);
export const SINE_LINE_MODULE=segmentModule('sine-line',SINE_LINE_SPEC);
export const SECTOR_MODULE=segmentModule('sector',SECTOR_SPEC,{unappliedDefaults:[Object.freeze({toolId:'LineToolProjection',factId:'tool.LineToolProjection.status',property:'color2',value:null,reason:'renderer' as const,
 note:'The confirmed floating toolbar has two background colors. The renderer segment shape has one fill color (style.fillColor, Background color 1); a second background color is not built.'})]});
export const ARROW_MARKER_MODULE=segmentModule('arrow-marker',ARROW_MARKER_SPEC);
