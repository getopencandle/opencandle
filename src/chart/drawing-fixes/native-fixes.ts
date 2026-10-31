// OpenCandle 0.8.1 drawing fixes on pinned native Vela classes. Each entry REPLACES a native registration in place
// (replacesNative, lv-types/contract.ts), so saved records keep their type ids; placement, handles, serialization, undo and
// the native painter branch (which dispatches by class and reads the model's geometry/entryLines) stay native. Only the
// model geometry or text that was wrong is overridden. Every define() pins the native shape it overrides and fails closed.
//
// What is fixed here (the spec tests are tests/chart/drawing-*-081*.test.ts):
//  * Directed extension: Ray hit testing (its painter is LV-VELA-DRAWING-FIXES-1, src/chart/vela-compat-patch-plan.json), Pitchfork, Schiff, Modified Schiff and Inside pitchfork median and tines, Fib fan and Gann fan lines
//    run from their origin to the pane edge in the drawn direction (drawn right to left, they extend left).
//  * Bar space: Fib time zones (standard definition: counted in bars), Gann box and Gann square time divisions, the Modified
//    Schiff median origin, the Inside pitchfork base midpoint and the Parallel channel middle handle are computed on the
//    logical bar axis, so weekends and session gaps no longer move them.
//  * Parallel channel: the parallel line is the base line shifted by one screen offset (the price offset on a linear scale,
//    the log price offset on a log scale), so it stays parallel on a log scale.
//  * Prices: Fib extension and Trend-based fib extension level prices, the Date and price range change and the Info line change
//    (read by the LV-VELA-DRAWING-FIXES-1 painter through lvPriceText) use the instrument tick decimals (./price-format.ts).
//  * Ray and Info line keep their native factory (the drawing-factory-defaults seed wrapper): a model it builds adopts the fixed
//    subclass prototype, which adds methods only (no fields, no constructor work).
//  * Trend-based fib extension: levels project the A-B move from C (C + r(B - A)) and run from C to the right; a dashed
//    grey A-B-C path shows what is measured (the type paints itself through LV-VELA-DRAWING-PAINT-HOOK-1).
//  * Fib arcs: centred on the second point (the end of the measured move), as in the classic definition, so each arc crosses
//    the trend line at its retracement ratio measured back from the end of the move.
//  * Labels (second round, painters in LV-VELA-DRAWING-FIXES-1): Head and shoulders vertex labels sit on label pills
//    (lvLabelPills; the Elliott waves ask for them in ./elliott-origin.ts); Callout, Comment and Note text wraps at
//    DRAWING_TEXT_WRAP_WIDTH (lvWrapWidth), and their hit box follows the wrapped text.
//  * Regression trend: Upper and Lower deviation inputs (default 2, the native fixed band) and the fit statistic shown as
//    Pearson's R (the signed correlation of close with bar index, the reading a regression trend reports; lvFitLabel).
//  * Third round: Fib speed resistance fan lines (including the vertical 0 time line) and the Trend-based fib extension levels
//    follow the drawn direction; Gann box time divisions carry their ratio labels; Gann fan angles are written in the classic
//    time x price notation (1/2 is the steep 63.75 degree line); Price note and Price label write their price with the
//    instrument tick (lvPriceTag, read by the LV-VELA-DRAWING-FIXES-1 painter).
//  * Default level additions (new drawings only; saved levels never change): Trend-based fib extension 0.236, 0.786, 1.272,
//    3.618 and 4.236; Fib time zones 55 and 89.
//
// Elliott waves (an origin point) live in ./elliott-origin.ts; they register after the OpenCandle wave and pattern modules,
// which pin the native labels.
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,type Init,type NativeBase,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvDrawingToolModule,LvTypeDefinition} from '../lv-types/contract';
import {defineLvDrawingToolModule} from '../lv-types/contract';
import {barMidX,barStepX,channelLineY,directedRay,segmentDistance,type Segment} from './geometry';
import {drawingPriceDecimals,formatDrawingPrice,formatSignedDrawingPrice} from './price-format';
import {DRAWING_TEXT_WRAP_WIDTH,wrapTextLines} from './text-wrap';
import {REGRESSION_DEFAULT_DEVIATION,regressionDeviation} from './regression-deviation';
export {REGRESSION_DEFAULT_DEVIATION,regressionDeviation};

type Anchor={time:number;price:number};
type Level={ratio:number;color:string;enabled:boolean;label?:string};
interface Entry{color:string;label?:string;x1:number;y1:number;x2:number;y2:number;numberText:string;numberX:number;numberY:number;numberAlign:string;labelX:number;labelY:number}
interface SegmentModel extends NativeModel{geometry(proj:Projector):{segments:number[][];fill:number[][]|null}|null;medianStart?(a:Anchor,b:Anchor,c:Anchor):Anchor}
interface FibModel extends NativeModel{levels:Level[];showRatios:boolean;showPrices:boolean;entryLines(proj:Projector):Entry[]|null;defaultLevels():Level[];levelText?(ratio:number,price:number):string}

/** Pixel of an anchor, or null when its pane is gone or a value is not finite. */
function px(model:{paneId:string},proj:Projector,p:Anchor|undefined):[number,number]|null{
 if(!p)return null;const y=proj.yOf(p.price,model.paneId),x=proj.xOf(p.time);
 return y==null||!Number.isFinite(x)||!Number.isFinite(y)?null:[x,y];
}
/** A linear test projector (x = time, y = 1000 - price) for the pins. */
const LINEAR={xOf:(time:number)=>time,yOf:(price:number)=>1000-price,width:2000,height:1000,pxToPoint:(x:number,y:number)=>({time:x,price:1000-y}),barsBetween:(a:number,b:number)=>Math.abs(b-a)} as unknown as Projector;
const probeInit=(anchors:Anchor[]):Init=>({id:'lv-drawing-type-probe',paneId:'price',createdAt:0,anchors});

function meta(base:NativeBase,create:(init:Init)=>NativeModel):DrawingTypeMeta{
 const m=base.meta;
 return{...m,type:lvKey(m.type),defaultStyle:cloneStyle(m),create:init=>create(init)} as DrawingTypeMeta;
}
function pinned(type:string,members:readonly string[]):NativeBase{
 const base=nativeBase(type);
 if(Object.hasOwn(base.prototype,'lvDrawingFix081'))fail(type+' is already fixed by another module instance');
 for(const key of members)method(base.prototype,key);
 return base;
}
const FIXED={lvDrawingFix081:{value:true,enumerable:false}} as const;

// ---------------------------------------------------------------- ray and info line (adopted prototypes)

/** The registered factory (with any seed wrapper) builds the native model, which then adopts `Sub`'s prototype. */
function adopting(base:NativeBase,Sub:{prototype:object}):DrawingTypeMeta{
 const create=base.meta.create;
 return{...base.meta,defaultStyle:cloneStyle(base.meta),create:(init:Init)=>{const model=create(init);if(Object.getPrototypeOf(model)===base.prototype)Object.setPrototypeOf(model,Sub.prototype);return model;}} as DrawingTypeMeta;
}
interface RayModel extends NativeModel{pixels(proj:Projector):[number,number,number,number]|null}
function defineRay():DrawingTypeMeta{
 const base=pinned('ray',['pixels','hitTest','handlePoints']);
 const Base=base.ctor as unknown as new(init:Init)=>RayModel;
 const probe=new Base(probeInit([{time:300,price:500},{time:200,price:600}]));
 // Pin: the native ray hit-tests to the right even when drawn to the left.
 if(probe.hitTest(500,700,LINEAR,2)!==true||probe.hitTest(100,300,LINEAR,2)!==false)fail('ray hit testing changed');
 class LvRay extends Base{
  /** The line from the first point through the second, to the pane edge in the drawn direction. */
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   const p=this.pixels(proj);if(!p)return false;
   const [x1,y1,x2,y2]=directedRay(p[0],p[1],p[2],p[3],proj.width,proj.height);
   return segmentDistance(px,py,x1,y1,x2,y2)<=tol;
  }
 }
 Object.defineProperties(LvRay.prototype,FIXED);
 return adopting(base,LvRay);
}
function defineInfoLine():DrawingTypeMeta{
 const base=pinned('infoline',['handlePoints','hitTest']);
 class LvInfoLine extends (base.ctor as unknown as new(init:Init)=>NativeModel){
  /** The signed-less price change as the Info line writes it (the painter adds the sign). */
  lvPriceText(change:number):string{const [a,b]=this.anchors;return Number.isFinite(change)?change.toFixed(drawingPriceDecimals(this,a&&b?Math.max(Math.abs(a.price),Math.abs(b.price)):change)):'';}
 }
 Object.defineProperties(LvInfoLine.prototype,FIXED);
 return adopting(base,LvInfoLine);
}

// ---------------------------------------------------------------- pitchforks

/** Pitchfork segments: median from `start` through the base midpoint, tines from P1 and P2 parallel to it, all in the drawn
 *  direction; then the base line and any construction lines. `dir` overrides the median direction (Inside pitchfork). */
export function pitchforkSegments(P0:[number,number],P1:[number,number],P2:[number,number],start:[number,number],w:number,h:number,options:{readonly direction?:[number,number];readonly medianFrom?:[number,number];readonly construction?:readonly Segment[]}={}):Segment[]{
 const mx=(P1[0]+P2[0])/2,my=(P1[1]+P2[1])/2;
 const [dx,dy]=options.direction??[mx-start[0],my-start[1]];
 const from=options.medianFrom??start;
 return[
  directedRay(from[0],from[1],from[0]+dx,from[1]+dy,w,h),
  directedRay(P1[0],P1[1],P1[0]+dx,P1[1]+dy,w,h),
  directedRay(P2[0],P2[1],P2[0]+dx,P2[1]+dy,w,h),
  [P1[0],P1[1],P2[0],P2[1]],
  ...(options.construction??[]),
 ];
}
type PitchforkKind='pitchfork'|'schiffpitchfork'|'modifiedschiffpitchfork'|'insidepitchfork';
/** The pitchfork geometry of `kind` (null while a point is missing), with bar-space midpoints. */
export function pitchforkGeometry(kind:PitchforkKind,model:{anchors:readonly Anchor[];paneId:string},proj:Projector):{segments:number[][];fill:null}|null{
 const [a,b,c]=model.anchors;
 const P0=px(model,proj,a),P1=px(model,proj,b);if(!P0||!P1)return null;
 if(!c)return{segments:[[P0[0],P0[1],P1[0],P1[1]]],fill:null};
 const P2=px(model,proj,c);if(!P2)return null;
 const w=proj.width,h=proj.height,back:Segment=[P0[0],P0[1],P1[0],P1[1]];
 if(kind==='pitchfork')return{segments:pitchforkSegments(P0,P1,P2,P0,w,h),fill:null};
 // Schiff: the median starts halfway up the pivot-to-P1 leg (in price), at the pivot's bar. Modified Schiff: at the midpoint
 // of that leg, its bar being the bar-space midpoint. Inside: the median runs through the base midpoint parallel to the line
 // from the leg midpoint to P2.
 const midY=proj.yOf((a.price+b.price)/2,model.paneId);if(midY==null||!Number.isFinite(midY))return null;
 if(kind==='schiffpitchfork')return{segments:pitchforkSegments(P0,P1,P2,[P0[0],midY],w,h,{construction:[back]}),fill:null};
 const B:[number,number]=[barMidX(P0[0],P1[0]),midY];
 if(kind==='modifiedschiffpitchfork')return{segments:pitchforkSegments(P0,P1,P2,B,w,h,{construction:[back]}),fill:null};
 const M:[number,number]=[(P1[0]+P2[0])/2,(P1[1]+P2[1])/2];
 return{segments:pitchforkSegments(P0,P1,P2,B,w,h,{direction:[P2[0]-B[0],P2[1]-B[1]],medianFrom:M,construction:[[B[0],B[1],P2[0],P2[1]],back]}),fill:null};
}
function definePitchfork(kind:PitchforkKind):DrawingTypeMeta{
 const base=pinned(kind,['geometry','anchorSchema','handlePoints','hitTest','priceRange','schema','serialize']);
 // Pin: drawn left to right, the native median runs from the (start) point to the right edge; 4 segments (plus construction).
 const sample=new (base.ctor as unknown as new(init:Init)=>SegmentModel)(probeInit([{time:100,price:500},{time:300,price:600},{time:300,price:400}]));
 const g=sample.geometry(LINEAR);
 if(!g||g.segments.length!==(kind==='pitchfork'?4:kind==='insidepitchfork'?6:5)||Math.round(g.segments[0][2])!==LINEAR.width+2)fail(kind+' geometry changed');
 const Base=base.ctor as unknown as new(init:Init)=>SegmentModel;
 class LvPitchfork extends Base{geometry(proj:Projector){return pitchforkGeometry(kind,this,proj);}}
 Object.defineProperties(LvPitchfork.prototype,FIXED);
 return meta(base,init=>new LvPitchfork(init));
}

// ---------------------------------------------------------------- fans

interface FanLine{ratio:number;color:string;label?:string;x1:number;y1:number;x2:number;y2:number;labelX:number;labelY:number}
interface FanModel extends FibModel{fanLines(proj:Projector):FanLine[]|null}
/** Fib fan lines from the first point through each level price at the second point's bar, in the drawn direction. */
export function fibFanLines(model:{anchors:readonly Anchor[];paneId:string;levels:readonly Level[]},proj:Projector):FanLine[]|null{
 const [a,b]=model.anchors;const O=px(model,proj,a);if(!O||!b)return null;
 const xb=proj.xOf(b.time),delta=b.price-a.price,out:FanLine[]=[];
 for(const lv of model.levels){
  if(!lv.enabled)continue;
  const ty=proj.yOf(a.price+lv.ratio*delta,model.paneId);if(ty==null)continue;
  const [x1,y1,x2,y2]=directedRay(O[0],O[1],xb,ty,proj.width,proj.height);
  // Labels sit just outside the second point's bar, on the side the fan opens to.
  const lx=xb>=O[0]?xb+5:xb-5;
  out.push({ratio:lv.ratio,color:lv.color,...(lv.label?{label:lv.label}:{}),x1,y1,x2,y2,labelX:lx,labelY:ty});
 }
 return out;
}
function defineFibFan():DrawingTypeMeta{
 const base=pinned('fibfan',['fanLines','entryLines','hitTest']);
 const Base=base.ctor as unknown as new(init:Init)=>FanModel;
 const sample=new Base(probeInit([{time:100,price:500},{time:200,price:600}]));
 const lines=sample.fanLines(LINEAR);if(!lines||!lines.length||Math.round(lines[0].x2)!==LINEAR.width+2)fail('fib fan geometry changed');
 class LvFibFan extends Base{
  fanLines(proj:Projector){return fibFanLines(this,proj);}
  entryLines(proj:Projector){
   const rows=super.entryLines(proj),lines=this.fanLines(proj);if(!rows||!lines)return rows;
   // Number labels align away from the origin.
   const [a,b]=this.anchors,left=a&&b?proj.xOf(b.time)<proj.xOf(a.time):false;
   return rows.map(row=>left?{...row,numberAlign:'right'}:row);
  }
 }
 Object.defineProperties(LvFibFan.prototype,FIXED);
 return meta(base,init=>new LvFibFan(init));
}
/** Gann fan angle labels in the classic time x price notation: "a/b" is a units of time per b units of price, so 1/1 is the
 *  45 degree line, 1/2 the steep line rising two price units per time unit (63.75 degrees), 2/1 the shallow one (26.25 degrees),
 *  out to 1/8 (82.5) and 8/1 (7.5). Sources: W. D. Gann's angle table as given by Investopedia "Gann Angles" and "Gann Fan"
 *  (1x2 = 63.75, 2x1 = 26.25, 1x8 = 82.5, 8x1 = 7.5 degrees), the notation the Gann square in this app uses. The native fan
 *  writes the price-per-time ratio instead (2/1 on the steep line), so its default labels are swapped here. A label the user
 *  typed is kept; only a native default label is rewritten, so saved drawings keep their geometry and now read correctly. */
export function classicGannFanLabel(ratio:number,label:string|undefined,nativeDefaults:ReadonlyMap<number,string>):string{
 const text=label??String(ratio);
 return nativeDefaults.get(ratio)===text&&/^\d+\/\d+$/.test(text)?text.split('/').reverse().join('/'):text;
}
function defineGannFan():DrawingTypeMeta{
 const base=pinned('gannfan',['entryLines','hitTest','defaultLevels']);
 const Base=base.ctor as unknown as new(init:Init)=>FibModel;
 const sample=new Base(probeInit([{time:100,price:500},{time:200,price:600}]));
 const rows=sample.entryLines(LINEAR);if(!rows||!rows.length||Math.round(rows[0].x2)!==LINEAR.width+2||rows[0].numberX!==205)fail('gann fan geometry changed');
 const nativeDefaults=new Map(sample.defaultLevels().map(lv=>[lv.ratio,lv.label??String(lv.ratio)]));
 if(nativeDefaults.get(2)!=='2/1'||nativeDefaults.get(0.5)!=='1/2')fail('gann fan default labels changed');
 class LvGannFan extends Base{
  /** New drawings store the classic labels. */
  defaultLevels(){return super.defaultLevels().map(lv=>({...lv,label:classicGannFanLabel(lv.ratio,lv.label,nativeDefaults)}));}
  entryLines(proj:Projector){
   const [a,b]=this.anchors;const O=px(this,proj,a);if(!O||!b)return null;
   const xb=proj.xOf(b.time),dp=b.price-a.price,left=xb<O[0],out:Entry[]=[];
   for(const lv of this.levels){
    if(!lv.enabled)continue;
    const ty=proj.yOf(a.price+dp*lv.ratio,this.paneId);if(ty==null)continue;
    const [x1,y1,x2,y2]=directedRay(O[0],O[1],xb,ty,proj.width,proj.height);
    const nx=left?xb-5:xb+5;
    out.push({color:lv.color,x1,y1,x2,y2,numberText:classicGannFanLabel(lv.ratio,lv.label,nativeDefaults),numberX:nx,numberY:ty,numberAlign:left?'right':'left',labelX:nx,labelY:ty});
   }
   return out;
  }
 }
 Object.defineProperties(LvGannFan.prototype,FIXED);
 return meta(base,init=>new LvGannFan(init));
}

/** Fib speed resistance fan: from the first point through each fraction of the advance on the second point's bar (price lines)
 *  and through each fraction of the time span on the second point's price (time lines), every line in the drawn direction, so
 *  the vertical 0 time line also starts at the first point. The 1 time line is the 1 price line. Labels as the native fan. */
export function fibSpeedFanLines(model:{anchors:readonly Anchor[];paneId:string;levels:readonly Level[]},proj:Projector):Entry[]|null{
 const [a,b]=model.anchors;if(!a||!b)return null;
 const y1=proj.yOf(a.price,model.paneId),y2=proj.yOf(b.price,model.paneId);if(y1==null||y2==null)return null;
 const x1=proj.xOf(a.time),x2=proj.xOf(b.time),dx=x2-x1,dy=y2-y1,right=dx>=0,out:Entry[]=[];
 for(const lv of model.levels){
  if(!lv.enabled)continue;
  const pex=x1+dx,pey=y1+dy*lv.ratio,pr=directedRay(x1,y1,pex,pey,proj.width,proj.height);
  out.push({color:lv.color,...(lv.label?{label:lv.label}:{}),x1:pr[0],y1:pr[1],x2:pr[2],y2:pr[3],numberText:String(lv.ratio),numberX:right?pex+5:pex-5,numberY:pey,numberAlign:right?'left':'right',labelX:pex,labelY:pey});
  if(lv.ratio===1)continue;
  const tex=x1+dx*lv.ratio,tey=y1+dy,tr=directedRay(x1,y1,tex,tey,proj.width,proj.height);
  out.push({color:lv.color,...(lv.label?{label:lv.label}:{}),x1:tr[0],y1:tr[1],x2:tr[2],y2:tr[3],numberText:String(lv.ratio),numberX:tex,numberY:tey+(dy>=0?12:-12),numberAlign:'center',labelX:tex,labelY:tey+12});
 }
 return out;
}
function defineFibSpeedFan():DrawingTypeMeta{
 const base=pinned('fibspeedfan',['entryLines','hitTest']);
 const Base=base.ctor as unknown as new(init:Init)=>FibModel;
 const rows=new Base(probeInit([{time:100,price:500},{time:200,price:600}])).entryLines(LINEAR);
 // Pin: drawn left to right, the native 0 price line runs flat from the first point to the right edge.
 if(!rows||!rows.length||rows[0].x1!==100||rows[0].y1!==500||rows[0].y2!==500||!(rows[0].x2>=LINEAR.width))fail('fib speed fan geometry changed');
 class LvFibSpeedFan extends Base{entryLines(proj:Projector){return fibSpeedFanLines(this,proj);}}
 Object.defineProperties(LvFibSpeedFan.prototype,FIXED);
 return meta(base,init=>new LvFibSpeedFan(init));
}

// ---------------------------------------------------------------- bar-space time levels

/** Standard Fibonacci time zone sequence additions (new drawings only). */
export const FIB_TIME_ZONE_ADDED_LEVELS:readonly number[]=Object.freeze([55,89]);
interface ZoneModel extends FibModel{zoneLines(proj:Projector):{n:number;color:string;label?:string;x:number}[]|null}
function defineFibTimeZones():DrawingTypeMeta{
 const base=pinned('fibtimezones',['zoneLines','entryLines','defaultLevels']);
 const Base=base.ctor as unknown as new(init:Init)=>ZoneModel;
 const sample=new Base(probeInit([{time:100,price:500},{time:110,price:500}]));
 const zones=sample.zoneLines(LINEAR);
 if(!zones||zones.map(zone=>zone.n).join()!=='0,1,2,3,5,8,13,21,34'||zones[2].x!==120)fail('fib time zones geometry changed');
 class LvFibTimeZones extends Base{
  defaultLevels(){const levels=super.defaultLevels(),template=levels[levels.length-1];return[...levels,...FIB_TIME_ZONE_ADDED_LEVELS.filter(n=>!levels.some(lv=>lv.ratio===n)).map(ratio=>({...template,ratio,enabled:true}))];}
  /** Zone n is n bar units after the first point, one unit being the bar distance between the two points. */
  zoneLines(proj:Projector){
   const [a,b]=this.anchors;if(!a||!b)return null;
   const xa=proj.xOf(a.time),xb=proj.xOf(b.time);if(!Number.isFinite(xa)||!Number.isFinite(xb)||Math.abs(xb-xa)<1e-9)return null;
   return this.levels.filter(lv=>lv.enabled).map(lv=>({n:lv.ratio,color:lv.color,...(lv.label?{label:lv.label}:{}),x:barStepX(xa,xb,lv.ratio)}));
  }
 }
 Object.defineProperties(LvFibTimeZones.prototype,FIXED);
 return meta(base,init=>new LvFibTimeZones(init));
}

/** Gann box and square: the vertical time divisions at each level, in bar space. `rows` are the native entries; vertical rows
 *  (no number text, x1 = x2) are matched to the enabled levels in order. */
export function barSpaceVerticals(rows:Entry[],levels:readonly Level[],xa:number,xb:number):Entry[]{
 const enabled=levels.filter(lv=>lv.enabled);let k=0;
 return rows.map(row=>{
  if(row.numberText!==''||row.x1!==row.x2||row.y1===row.y2||k>=enabled.length)return row;
  const x=barStepX(xa,xb,enabled[k++].ratio);
  return{...row,x1:x,x2:x,numberX:x,labelX:x};
 });
}
/** Gann box time divisions labelled with their ratio like the price divisions, centred just below the box. */
export function labelledVerticals(rows:Entry[],levels:readonly Level[]):Entry[]{
 const enabled=levels.filter(lv=>lv.enabled);let k=0;
 return rows.map(row=>{
  if(row.numberText!==''||row.x1!==row.x2||row.y1===row.y2||k>=enabled.length)return row;
  const lv=enabled[k++];
  return{...row,numberText:lv.label??String(lv.ratio),numberX:row.x1,numberY:Math.max(row.y1,row.y2)+10,numberAlign:'center'};
 });
}
function defineGannGrid(type:'gannbox'|'gannsquare'):DrawingTypeMeta{
 const base=pinned(type,['entryLines','hitTest']);
 const Base=base.ctor as unknown as new(init:Init)=>FibModel;
 const sample=new Base(probeInit([{time:100,price:500},{time:200,price:600}]));
 const rows=sample.entryLines(LINEAR),verticals=(rows??[]).filter(row=>row.numberText===''&&row.x1===row.x2&&row.y1!==row.y2);
 if(verticals.length!==sample.levels.filter(lv=>lv.enabled).length||verticals[1]?.x1!==100+100*sample.levels.filter(lv=>lv.enabled)[1].ratio)fail(type+' time divisions changed');
 class LvGannGrid extends Base{
  entryLines(proj:Projector){
   const rows=super.entryLines(proj),[a,b]=this.anchors;if(!rows||!a||!b)return rows;
   const fixed=barSpaceVerticals(rows,this.levels,proj.xOf(a.time),proj.xOf(b.time));
   return type==='gannbox'?labelledVerticals(fixed,this.levels):fixed;
  }
 }
 Object.defineProperties(LvGannGrid.prototype,FIXED);
 return meta(base,init=>new LvGannGrid(init));
}

// ---------------------------------------------------------------- parallel channel

interface ChannelModel extends SegmentModel{offset():number}
function defineParallelChannel():DrawingTypeMeta{
 const base=pinned('parallelchannel',['geometry','handlePoints','offset','priceRange','timeExtent']);
 const Base=base.ctor as unknown as new(init:Init)=>ChannelModel;
 const sample=new Base(probeInit([{time:100,price:500},{time:300,price:600},{time:200,price:650}]));
 const g=sample.geometry(LINEAR),h=sample.handlePoints(LINEAR);
 if(!g||g.segments.length!==2||g.segments[1].join()!=='100,400,300,300'||h.length!==3||h[2].join()!=='200,350')fail('parallel channel geometry changed');
 class LvParallelChannel extends Base{
  /** Base line a..b and the parallel line through the offset handle, one screen offset apart (log-parallel on a log scale). */
  geometry(proj:Projector){
   const [a,b,c]=this.anchors;if(!c)return super.geometry(proj);
   const A=px(this,proj,a),B=px(this,proj,b),yc=proj.yOf(c.price,this.paneId);
   if(!A||!B||yc==null||!Number.isFinite(yc))return null;
   const {y1,y2}=channelLineY(A[1],B[1],yc,1);
   return{segments:[[A[0],A[1],B[0],B[1]],[A[0],y1,B[0],y2]],fill:[[A[0],A[1]],[B[0],B[1]],[B[0],y2],[A[0],y1]]};
  }
  /** The offset handle sits on the parallel line at the bar-space midpoint of the base line. */
  handlePoints(proj:Projector){
   const pts=super.handlePoints(proj);
   if(pts.length===3)pts[2]=[barMidX(pts[0][0],pts[1][0]),pts[2][1]];
   return pts;
  }
  /** Price extent of both offset readings (additive on a linear scale, multiplicative on a log scale): the model does not know
   *  the scale, and autoscale only needs a range that contains the drawn lines. */
  priceRange(){
   const range=super.priceRange(),[a,b,c]=this.anchors;if(!range||!a||!b||!c||!(a.price>0&&b.price>0&&c.price>0))return range;
   const k=c.price/Math.sqrt(a.price*b.price),extra=[a.price*k,b.price*k].filter(Number.isFinite);
   return{min:Math.min(range.min,...extra),max:Math.max(range.max,...extra)};
  }
 }
 Object.defineProperties(LvParallelChannel.prototype,FIXED);
 return meta(base,init=>new LvParallelChannel(init));
}

// ---------------------------------------------------------------- prices

function levelText(model:{showRatios:boolean;showPrices:boolean},ratio:number,price:number):string{
 const p=formatDrawingPrice(price,model);
 if(model.showRatios&&model.showPrices)return `${ratio} (${p})`;
 if(model.showRatios)return String(ratio);
 return model.showPrices?p:'';
}
/** The native level text with the instrument's decimals (used by Fib retracement and Fib extension). */
export const fibLevelText=levelText;
function defineFibExtension():DrawingTypeMeta{
 const base=pinned('fibextension',['levelText','entryLines']);
 const Base=base.ctor as unknown as new(init:Init)=>FibModel;
 const sample=new Base(probeInit([]));
 if(sample.levelText?.(1,1.08235)!=='1 (1.08)')fail('fib extension level text changed');
 class LvFibExtension extends Base{levelText(ratio:number,price:number){return levelText(this,ratio,price);}}
 Object.defineProperties(LvFibExtension.prototype,FIXED);
 return meta(base,init=>new LvFibExtension(init));
}
/** Standard trend-based extension levels added to new drawings (the native set has 0, 0.382, 0.5, 0.618, 1, 1.618, 2.618). */
export const TREND_EXTENSION_ADDED_LEVELS:readonly number[]=Object.freeze([0.236,0.786,1.272,3.618,4.236]);
/** The dashed A-B-C path colour (a neutral grey that reads on light and dark backgrounds). */
export const TREND_EXTENSION_PATH_COLOR='#808080';
const NAMED_SIZE:Readonly<Record<string,number>>={tiny:10,small:12,normal:14,large:18,huge:28};
const namedSize=(size:unknown)=>typeof size==='string'&&Object.hasOwn(NAMED_SIZE,size)?NAMED_SIZE[size]:12;
function strokeLine(ctx:CanvasRenderingContext2D,style:{lineColor:string;lineWidth:number;lineStyle:string},points:readonly (readonly [number,number])[]):void{
 const w=Math.max(1,style.lineWidth);ctx.strokeStyle=style.lineColor;ctx.lineWidth=style.lineWidth;ctx.setLineDash(style.lineStyle==='dotted'?[w,w*2]:style.lineStyle==='dashed'?[w*4,w*3]:[]);
 ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(const p of points.slice(1))ctx.lineTo(p[0],p[1]);ctx.stroke();ctx.setLineDash([]);
}
function defineFibExtensionTrend():DrawingTypeMeta{
 const base=pinned('fibextensiontrend',['entryLines','defaultLevels','priceRange']);
 const Base=base.ctor as unknown as new(init:Init)=>FibModel;
 const sample=new Base(probeInit([{time:0,price:100},{time:10,price:110},{time:20,price:105}]));
 const rows=sample.entryLines(LINEAR);
 if(!rows||rows[0].numberText!=='0 (105.00)'||rows[0].x1!==0||rows[0].x2!==20)fail('trend-based fib extension geometry changed');
 class LvFibExtensionTrend extends Base{
  defaultLevels(){
   const levels=super.defaultLevels(),color=(ratio:number)=>[...levels].sort((p,q)=>Math.abs(p.ratio-ratio)-Math.abs(q.ratio-ratio))[0]?.color??'#787b86';
   return[...levels,...TREND_EXTENSION_ADDED_LEVELS.filter(r=>!levels.some(lv=>lv.ratio===r)).map(ratio=>({ratio,color:color(ratio),enabled:true}))].sort((p,q)=>p.ratio-q.ratio);
  }
  /** Levels project the A-B move from C (price C + r * (B - A)) and run from C in the drawn direction (A to B), one A-B bar
   *  span long (to the pane edge with Extend right): drawn right to left they run to the left of C, like rays, pitchforks and
   *  fans. While only A and B are placed, nothing is projected yet. */
  entryLines(proj:Projector){
   const [a,b,c]=this.anchors;if(!a||!b||!c)return null;
   const xa=proj.xOf(a.time),xb=proj.xOf(b.time),xc=proj.xOf(c.time);
   if(![xa,xb,xc].every(Number.isFinite))return null;
   const dir=xb<xa?-1:1,extend=(this.style as {extendRight?:boolean}).extendRight;
   const x1=xc,x2=extend?(dir>0?proj.width:0):xc+dir*Math.max(40,Math.abs(xb-xa)),move=b.price-a.price,out:Entry[]=[];
   for(const lv of this.levels){
    if(!lv.enabled)continue;
    const price=c.price+lv.ratio*move,y=proj.yOf(price,this.paneId);if(y==null)continue;
    out.push({color:lv.color,...(lv.label?{label:lv.label}:{}),x1,y1:y,x2,y2:y,numberText:`${lv.ratio} (${formatDrawingPrice(price,this)})`,numberX:x1+4*dir,numberY:y-7,numberAlign:dir>0?'left':'right',labelX:(x1+x2)/2,labelY:y-7});
   }
   return out;
  }
  /** The dashed A-B-C path the levels are measured on (two points while placing). */
  trendPath(proj:Projector):[number,number][]|null{
   const out:[number,number][]=[];for(const anchor of this.anchors.slice(0,3)){const p=px(this,proj,anchor);if(!p)return null;out.push(p);}
   return out.length>=2?out:null;
  }
  hitTest(px0:number,py0:number,proj:Projector,tol:number):boolean{
   if(super.hitTest(px0,py0,proj,tol))return true;
   const path=this.trendPath(proj);if(!path)return false;
   for(let i=1;i<path.length;i++)if(segmentDistance(px0,py0,path[i-1][0],path[i-1][1],path[i][0],path[i][1])<=tol)return true;
   return false;
  }
  /** The dashed path, then the level lines exactly as the native Fibonacci painter draws them. */
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:{fontFamily:string}):void{
   const path=this.trendPath(proj);
   if(path)strokeLine(ctx,{lineColor:TREND_EXTENSION_PATH_COLOR,lineWidth:1,lineStyle:'dashed'},path);
   const lines=this.entryLines(proj);if(!lines||!lines.length)return;
   const style=this.style as {lineColor:string;lineWidth:number;lineStyle:string},sizes=this as unknown as {numbersSize?:string;labelsSize?:string};
   ctx.textBaseline='middle';
   for(const l of lines){
    strokeLine(ctx,{...style,lineColor:l.color},[[l.x1,l.y1],[l.x2,l.y2]]);
    ctx.fillStyle=l.color;ctx.font=`${namedSize(sizes.numbersSize)}px ${theme.fontFamily}`;ctx.textAlign=l.numberAlign as CanvasTextAlign;ctx.fillText(l.numberText,l.numberX,l.numberY);
    if(l.label){ctx.font=`${namedSize(sizes.labelsSize)}px ${theme.fontFamily}`;ctx.textAlign='center';ctx.fillText(l.label,l.labelX,l.labelY);}
   }
   ctx.textAlign='left';ctx.textBaseline='alphabetic';
  }
 }
 Object.defineProperties(LvFibExtensionTrend.prototype,FIXED);
 return meta(base,init=>new LvFibExtensionTrend(init));
}
interface MeasureModel extends NativeModel{priceLabel():string}
function defineDatePriceRange():DrawingTypeMeta{
 const base=pinned('datepricerange',['priceLabel','measureLabel','timeLabel']);
 const Base=base.ctor as unknown as new(init:Init)=>MeasureModel;
 if(new Base(probeInit([{time:0,price:100},{time:10,price:101.5}])).priceLabel()!=='+1.50 (+1.50%)')fail('date and price range text changed');
 class LvDatePriceRange extends Base{
  priceLabel(){
   const [a,b]=this.anchors;if(!a||!b)return '';
   const delta=b.price-a.price,percent=a.price!==0?delta/a.price*100:0;
   return `${formatSignedDrawingPrice(delta,this,Math.max(Math.abs(a.price),Math.abs(b.price)))} (${percent>=0?'+':''}${percent.toFixed(2)}%)`;
  }
 }
 Object.defineProperties(LvDatePriceRange.prototype,FIXED);
 return meta(base,init=>new LvDatePriceRange(init));
}

/** Price note and Price label: the pinned price in the instrument tick decimals (MetaTrader "Price label": symbol digits), read
 *  by the LV-VELA-DRAWING-FIXES-1 painter through lvPriceTag; labelText (the approximate hit box) uses the same text. */
interface PriceTagModel extends NativeModel{labelText():string}
function definePriceTag(type:'pricenote'|'pricelabel'):DrawingTypeMeta{
 const base=pinned(type,['labelText','schema']);
 const Base=base.ctor as unknown as new(init:Init)=>PriceTagModel;
 if(new Base(probeInit([{time:0,price:450}])).labelText()!=='450.00')fail(type+' text changed');
 class LvPriceTag extends Base{
  lvPriceTag():string{const p=this.anchors[0]?.price;return p==null?'':formatDrawingPrice(p,this);}
  labelText():string{const p=this.anchors[0]?.price;return p==null?super.labelText():formatDrawingPrice(p,this);}
 }
 Object.defineProperties(LvPriceTag.prototype,FIXED);
 return meta(base,init=>new LvPriceTag(init));
}

// ---------------------------------------------------------------- fib arcs

interface RadialModel extends FibModel{radial(proj:Projector):{cx:number;cy:number;R0:number;a0:number;a1:number}|null;boundingLines(proj:Projector):number[][]}
function defineFibArcs():DrawingTypeMeta{
 const base=pinned('fibarcs',['radial','boundingLines','hitTest']);
 const Base=base.ctor as unknown as new(init:Init)=>RadialModel;
 const r=new Base(probeInit([{time:100,price:500},{time:200,price:500}])).radial(LINEAR);
 if(!r||r.cx!==100||r.R0!==100)fail('fib arcs geometry changed');
 class LvFibArcs extends Base{
  /** Centre on the second point; the half circle opens back toward the first point. Source: the arcs are "centered on the
   *  second extreme point" and cross the trend line at the Fibonacci ratios (MetaTrader 5 Help, Fibonacci Arcs,
   *  https://www.metatrader5.com/en/terminal/help/objects/fibo/fibo_arcs; Barchart Trader Help, Fibonacci Arc,
   *  https://www.barchart.com/trader/help/chart/fibonacci_arcs.php; Fidelity Learning Center, Fibonacci Arc, "measured from
   *  the second extreme point"). */
  radial(proj:Projector){
   const [s,e]=this.anchors,S=px(this,proj,s),E=px(this,proj,e);if(!S||!E)return null;
   const R0=Math.hypot(S[0]-E[0],S[1]-E[1]),phi=Math.atan2(S[1]-E[1],S[0]-E[0]);
   return{cx:E[0],cy:E[1],R0,a0:phi-Math.PI/2,a1:phi+Math.PI/2};
  }
 }
 Object.defineProperties(LvFibArcs.prototype,FIXED);
 return meta(base,init=>new LvFibArcs(init));
}

// ---------------------------------------------------------------- labels

function defineHeadShoulders():DrawingTypeMeta{
 const base=pinned('headshoulders',['vertexLabels','necklineIndices']);
 class LvHeadShoulders extends (base.ctor as unknown as new(init:Init)=>NativeModel){lvLabelPills():boolean{return true;}}
 Object.defineProperties(LvHeadShoulders.prototype,FIXED);
 return meta(base,init=>new LvHeadShoulders(init));
}
type Box={x:number;y:number;w:number;h:number};
type TextModel=NativeModel&{text?:{value?:string;size?:string};labelText():string;box(proj:Projector):Box|null};
const SIZE_PX:Readonly<Record<string,number>>={tiny:10,small:12,normal:14,large:18,huge:24,auto:14};
/** The native approximate box (0.6 em per character), re-measured on the wrapped lines. */
export function wrappedTextBox(text:string,size:string|undefined,box:Box,centred:boolean):Box{
 const fs=SIZE_PX[size??'normal']??14,measure=(line:string)=>line.length*fs*0.6;
 const lines=wrapTextLines(text.split('\n'),DRAWING_TEXT_WRAP_WIDTH,measure),cols=Math.max(1,...lines.map(line=>line.length));
 const w=centred?Math.max(20,cols*fs*0.6)+16:Math.max(12,cols*fs*0.6)+8,h=centred?lines.length*fs*1.4+12:lines.length*fs*1.4+4;
 return centred?{x:box.x+box.w/2-w/2,y:box.y+box.h/2-h/2,w,h}:{x:box.x,y:box.y,w,h};
}
function defineWrapped(type:'callout'|'comment'|'note'):DrawingTypeMeta{
 const base=pinned(type,['box','labelText','hitTest']);
 const centred=type!=='note';
 class LvWrapped extends (base.ctor as unknown as new(init:Init)=>TextModel){
  lvWrapWidth():number{return DRAWING_TEXT_WRAP_WIDTH;}
  box(proj:Projector):Box|null{const box=super.box(proj);return box?wrappedTextBox(this.labelText(),this.text?.size,box,centred):box;}
 }
 Object.defineProperties(LvWrapped.prototype,FIXED);
 return adopting(base,LvWrapped);
}

// ---------------------------------------------------------------- regression trend

export interface RegressionFit{t0:number;t1:number;mid0:number;mid1:number;dev:number;up:number;down:number;r:number;r2:number;n:number}
/** Least-squares fit of close on bar index, the residual standard deviation times each deviation input, and Pearson's r. */
export function regressionFit(bars:readonly {time:number;close:number}[],upper=REGRESSION_DEFAULT_DEVIATION,lower=REGRESSION_DEFAULT_DEVIATION):RegressionFit|null{
 const n=bars.length;if(n<2)return null;
 let sx=0,sy=0,sxy=0,sxx=0,syy=0;
 for(let i=0;i<n;i++){const y=bars[i].close;sx+=i;sy+=y;sxy+=i*y;sxx+=i*i;syy+=y*y;}
 const denom=n*sxx-sx*sx,slope=denom===0?0:(n*sxy-sx*sy)/denom,intercept=(sy-slope*sx)/n;
 let sse=0;for(let i=0;i<n;i++){const e=bars[i].close-(intercept+slope*i);sse+=e*e;}
 const sigma=Math.sqrt(sse/n),den=Math.sqrt(denom*(n*syy-sy*sy)),r=den===0?0:Math.max(-1,Math.min(1,(n*sxy-sx*sy)/den));
 return{t0:bars[0].time,t1:bars[n-1].time,mid0:intercept,mid1:intercept+slope*(n-1),dev:upper*sigma,up:upper*sigma,down:lower*sigma,r,r2:r*r,n};
}
/** Pearson's R as the regression trend writes it. */
export const pearsonLabel=(r:number):string=>"Pearson's R "+(Number.isFinite(r)?r.toFixed(2):'0.00');
type RegressionModel=NativeModel&{reg:Record<string,unknown>;cachedRange:{min:number;max:number}|null};
function defineRegression():DrawingTypeMeta{
 const base=pinned('regressionchannel',['fit','layout','band','hitTest','schema','readProps','writeProps']);
 const Base=base.ctor as unknown as new(init:Init)=>RegressionModel;
 if(!new Base(probeInit([])).schema().fields.some(field=>field.path==='reg.showR2'))fail('regression trend settings changed');
 class LvRegression extends Base{
  fit(proj:Projector):RegressionFit|null{
   const [a,b]=this.anchors;if(!a||!b)return null;
   const read=(proj as {barsInRange?:(from:number,to:number)=>{time:number;close:number}[]|null}).barsInRange;
   const bars=read?read(Math.min(a.time,b.time),Math.max(a.time,b.time)):null;
   const f=bars?regressionFit(bars,regressionDeviation(this.reg.upperDeviation),regressionDeviation(this.reg.lowerDeviation)):null;
   if(f)this.cachedRange={min:Math.min(f.mid0,f.mid1)-f.down,max:Math.max(f.mid0,f.mid1)+f.up};
   return f;
  }
  layout(proj:Projector){
   const f=this.fit(proj);if(!f)return null;
   const y=(price:number)=>proj.yOf(price,this.paneId);
   const midY0=y(f.mid0),midY1=y(f.mid1),upperY0=y(f.mid0+f.up),upperY1=y(f.mid1+f.up),lowerY0=y(f.mid0-f.down),lowerY1=y(f.mid1-f.down);
   if(midY0==null||midY1==null||upperY0==null||upperY1==null||lowerY0==null||lowerY1==null)return null;
   return{x0:proj.xOf(f.t0),x1:proj.xOf(f.t1),midY0,midY1,upperY0,upperY1,lowerY0,lowerY1,r:f.r,r2:f.r2,showR2:this.reg.showR2};
  }
  lvFitLabel(layout:{r?:number}):string{return pearsonLabel(layout.r??0);}
  schema(){
   const own=super.schema();
   return{...own,fields:[
    {path:'reg.upperDeviation',label:'Upper deviation',kind:'number' as const,group:'behavior' as const,min:0,max:50,step:0.1},
    {path:'reg.lowerDeviation',label:'Lower deviation',kind:'number' as const,group:'behavior' as const,min:0,max:50,step:0.1},
    ...own.fields.map(field=>field.path==='reg.showR2'?{...field,label:"Show Pearson's R"}:field)]};
  }
 }
 Object.defineProperties(LvRegression.prototype,FIXED);
 return meta(base,init=>new LvRegression(init));
}

const replace=(type:string,define:()=>DrawingTypeMeta):LvTypeDefinition=>({type,base:type,define,replacesNative:true});
/** Registered BEFORE the OpenCandle tool modules, so the modules built on these bases (Gann square fixed, Price range, Date range)
 *  inherit the fixes. */
export const DRAWING_FIXES_081_MODULE:LvDrawingToolModule=defineLvDrawingToolModule({
 id:'drawing-fixes-081',
 types:[
  ...(['pitchfork','schiffpitchfork','modifiedschiffpitchfork','insidepitchfork'] as const).map(kind=>replace(kind,()=>definePitchfork(kind))),
  replace('fibfan',defineFibFan),
  replace('gannfan',defineGannFan),
  replace('fibspeedfan',defineFibSpeedFan),
  replace('fibtimezones',defineFibTimeZones),
  replace('gannbox',()=>defineGannGrid('gannbox')),
  replace('gannsquare',()=>defineGannGrid('gannsquare')),
  replace('parallelchannel',defineParallelChannel),
  replace('fibextension',defineFibExtension),
  {type:'fibextensiontrend',base:'fibextensiontrend',define:defineFibExtensionTrend,replacesNative:true,requiresPaintHook:true},
  replace('datepricerange',defineDatePriceRange),
  replace('pricenote',()=>definePriceTag('pricenote')),
  replace('pricelabel',()=>definePriceTag('pricelabel')),
  replace('fibarcs',defineFibArcs),
  replace('ray',defineRay),
  replace('infoline',defineInfoLine),
  replace('headshoulders',defineHeadShoulders),
  replace('regressionchannel',defineRegression),
 ],
});
/** Registered AFTER the OpenCandle tool modules: Pin and Table build on the native Note and keep its plain box. */
export const DRAWING_FIXES_081_LATE_MODULE:LvDrawingToolModule=defineLvDrawingToolModule({
 id:'drawing-fixes-081-late',
 types:(['callout','comment','note'] as const).map(type=>replace(type,()=>defineWrapped(type))),
});
