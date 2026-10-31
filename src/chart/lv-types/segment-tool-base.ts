// Shared base of the segment tools (Pitchfan, Cyclic lines, Time cycles, Sine line, Sector, Arrow marker, Position
// forecast). Each type subclasses the pinned native `triangle` class (SegmentDrawing): the model only supplies its anchor
// schema and a pixel geometry {segments, fill}, and the native SegmentDrawing code does the rest. Placement (one click
// per point), hit testing (segments, and the fill polygon when a fill color is set), handles, bounds, body drag, handle
// drag, serialization, undo and the native segment painter branch (stroke each segment, fill the polygon, paint the
// text label) all stay native. This is the same mechanism the Double curve module uses on the native Curve.
//
// Fail closed: define() proves the installed triangle class still has the exact shape written against (3 free slots,
// its geometry is 3 segments plus one fill polygon, hit testing reads the geometry). A mismatch throws PinError and
// the registration loop leaves the type unregistered with a reason; its toolbar row then reports it as unavailable.
//
// Facts: none of these tools has a recorded anchor count or factory default (static-drawing-defaults#tool.<id>.creation
// pointsCountKnown false; static-drawing-defaults-2#tool.<id>.status factoryDefaults unknown). Their geometry, anchor
// counts and style are slice approximations, recorded per tool as an `unverified` unapplied row.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import type {UnappliedDefault} from '../drawing-factory-defaults';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';

export type Point=[number,number];
export type Segment=[number,number,number,number];
export interface SegmentGeometry{segments:number[][];fill:Point[]|null}
interface TriangleModel extends NativeModel{geometry(proj:Projector):SegmentGeometry|null}

export const SEGMENT_BASE='triangle';
const BASE_MEMBERS=['anchorSchema','geometry','hitTest','hitHandle','handlePoints','bounds','priceRange','schema','serialize','translateBody','constrainHandleDrag','onPlaced'];

/** Proves the native triangle is still a 3-point SegmentDrawing whose geometry drives hit testing. */
export function pinSegmentBase(){
 const base=nativeBase(SEGMENT_BASE);
 for(const key of BASE_MEMBERS)method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==3||shape.max!==3||shape.roles!=='v1/v2/v3')fail('triangle anchor schema changed: '+JSON.stringify(shape));
 const probe=new (base.ctor as unknown as new(init:Init)=>TriangleModel)({id:'lv-drawing-type-probe',paneId:'price',createdAt:0,anchors:[{time:0,price:100},{time:100,price:100},{time:50,price:50}]});
 const proj={xOf:(time:number)=>time,yOf:(price:number)=>200-price,width:400,height:300} as unknown as Projector;
 const g=probe.geometry(proj);
 if(!g||g.segments.length!==3||!g.fill||g.fill.length!==3||g.segments[0].join()!=='0,100,100,100')fail('triangle geometry changed');
 // Hit testing reads the geometry: on the first edge yes, far from every edge (and with the fill off) no.
 probe.style.fillColor=undefined;
 if(probe.hitTest(50,100,proj,3)!==true||probe.hitTest(50,20,proj,3)!==false)fail('triangle hit testing no longer follows its geometry');
 const groups=(base.sample.schema().fields as {group?:string}[]).map(field=>field.group);
 if(!groups.includes('line')||!groups.includes('fill')||!groups.includes('text'))fail('triangle settings groups changed');
 return base;
}

/** One free point per role, in click order. */
export const freeSlots=(roleNames:readonly string[])=>({min:roleNames.length,max:roleNames.length,slots:roleNames.map(role=>({role,free:'both' as const}))});

/** Pixel position of anchor `index`, or null when its pane is gone or the value is not finite. */
export function anchorPx(model:{anchors:readonly {time:number;price:number}[];paneId:string},proj:Projector,index:number):Point|null{
 const a=model.anchors[index];if(!a)return null;
 const y=proj.yOf(a.price,model.paneId),x=proj.xOf(a.time);
 return y==null||!Number.isFinite(x)||!Number.isFinite(y)?null:[x,y];
}
/** All anchors in pixels (stops at the first missing one). */
export function anchorPoints(model:{anchors:readonly {time:number;price:number}[];paneId:string},proj:Projector):Point[]|null{
 const out:Point[]=[];
 for(let i=0;i<model.anchors.length;i++){const p=anchorPx(model,proj,i);if(!p)return null;out.push(p);}
 return out;
}
/** Polyline segments through `points`. */
export function polylineSegments(points:readonly Point[]):Segment[]{
 const out:Segment[]=[];for(let i=1;i<points.length;i++)out.push([points[i-1][0],points[i-1][1],points[i][0],points[i][1]]);return out;
}
/** The point where the ray from `from` through `through` leaves the pane rectangle [0,width] x [0,height] (`through` itself when
 *  the ray is degenerate). A start outside the pane is clipped against the far edge it is heading to. */
export function rayToEdge(from:Point,through:Point,width:number,height:number):Point{
 const dx=through[0]-from[0],dy=through[1]-from[1];
 if(Math.abs(dx)<1e-9&&Math.abs(dy)<1e-9)return [through[0],through[1]];
 const candidates:number[]=[];
 if(dx>1e-9)candidates.push((width-from[0])/dx);else if(dx<-1e-9)candidates.push((0-from[0])/dx);
 if(dy>1e-9)candidates.push((height-from[1])/dy);else if(dy<-1e-9)candidates.push((0-from[1])/dy);
 const t=Math.max(1,Math.min(...candidates.filter(value=>Number.isFinite(value))));
 return [from[0]+t*dx,from[1]+t*dy];
}

export interface SegmentToolSpec{
 readonly type:string;
 readonly toolId:string;
 readonly rowId:string;
 /** Reference row label (static-drawing-toolbar#tool.<toolId>). */
 readonly label:string;
 /** Slot roles in click order (the anchor count is their number). */
 readonly roles:readonly string[];
 /** The pixel geometry for the anchors placed so far (fewer than roles while placing). */
 readonly geometry:(points:readonly Point[],proj:Projector)=>SegmentGeometry|null;
 /** Keeps the native fill fields and the polygon fill; false drops the fill fields and the base fill color. */
 readonly fill:boolean;
 /** The shape runs to the pane edges, so it never culls by its anchor time span. */
 readonly unbounded?:boolean;
 /** Catalog note (LV wording, user facing). */
 readonly note:string;
}

/** Builds the registry entry of one segment tool. `extend` adds members (a paint hook type adds lvPaint). */
export function defineSegmentTool(spec:SegmentToolSpec,extend?:(Base:new(init:Init)=>SegmentToolModel)=>new(init:Init)=>SegmentToolModel):DrawingTypeMeta{
 const base=pinSegmentBase();
 const Native=base.ctor as unknown as new(init:Init)=>TriangleModel;
 const schema=freeSlots(spec.roles);
 class LvSegmentTool extends Native{
  constructor(init:Init){super(init);(this as {type:string}).type=spec.type;}
  anchorSchema(){return{min:schema.min,max:schema.max,slots:schema.slots.map(slot=>({...slot}))};}
  geometry(proj:Projector):SegmentGeometry|null{
   const points=anchorPoints(this,proj);
   if(!points||points.length===0)return null;
   const g=spec.geometry(points.slice(0,spec.roles.length),proj);
   if(!g)return null;
   return spec.fill?g:{segments:g.segments,fill:null};
  }
  timeExtent(){return spec.unbounded?null:super.timeExtent();}
  schema(){
   const fields=super.schema().fields;
   return{...super.schema(),fields:spec.fill?fields:fields.filter(field=>field.group!=='fill')} as ReturnType<NativeModel['schema']>;
  }
 }
 const Model=extend?extend(LvSegmentTool as unknown as new(init:Init)=>SegmentToolModel):LvSegmentTool;
 const probe=new Model({id:'lv-drawing-type-probe',paneId:'price',createdAt:0}),shape=roles(probe);
 if(shape.min!==spec.roles.length||shape.max!==spec.roles.length||shape.roles!==spec.roles.join('/'))fail(spec.type+' anchor schema not applied');
 const style=cloneStyle(base.meta);
 if(!spec.fill)delete (style as {fillColor?:string}).fillColor;
 return{type:lvKey(spec.type),group:base.meta.group,label:spec.label,icon:base.meta.icon,defaultStyle:style,create:init=>new Model(init)};
}
export interface SegmentToolModel extends NativeModel{geometry(proj:Projector):SegmentGeometry|null;timeExtent():{min:number;max:number}|null}

/** The `unverified` anchor-count row every segment tool records (no reference anchor count, no factory defaults). */
export function segmentToolUnapplied(spec:SegmentToolSpec,shape:string):UnappliedDefault{
 return Object.freeze({toolId:spec.toolId,factId:'tool.'+spec.toolId+'.creation',property:'pointsCount',value:null,reason:'unverified' as const,
  note:'The reference anchor count is not recorded (pointsCountKnown false). Slice approximation pending reference observation: OpenCandle places '+spec.roles.length+' points ('+spec.roles.join(', ')+') and draws '+shape+'. Factory defaults are unknown (static-drawing-defaults-2#tool.'+spec.toolId+'.status), so nothing is seeded and the renderer Triangle style'+(spec.fill?'':' without its fill')+' remains; those are OpenCandle renderer defaults.'});
}
