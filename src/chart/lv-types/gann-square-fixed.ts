// Gann square fixed (reference LineToolGannFixed) on the pinned native `gannsquare` class (GannSquare).
// The native Gann square (grid levels, the 3x1 .. 1x3 fan, the arcs, its level editor, painting, hit testing, handles,
// serialization and undo) is used unchanged; only its proportions are held.
//
// Behaviour (pending reference observation; the facts record no anchor count, geometry or default for this
// tool: static-drawing-defaults#tool.LineToolGannFixed.creation pointsCountKnown false, static-drawing-defaults-2#
// tool.LineToolGannFixed.status factoryDefaults unknown):
//  * placement: the second click sets the width (time); the height is made equal to the width in pixels at that moment,
//    on the side of the second click, so the square starts square on screen;
//  * the price-per-bar ratio of the box is then fixed (0.8.1: counted in bars, not milliseconds, so a box that spans a weekend
//    keeps its proportions): dragging either corner handle changes the size, and the other side follows so the ratio stays the same. Body drag moves the square unchanged. The ratio is read from the saved
//    anchors, so a reloaded square keeps it with no extra member. A Coordinates edit sets new corners (and so a new ratio).
import type {DrawingTypeMeta} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import {defineLvDrawingToolModule} from './contract';

export const LV_GANN_SQUARE_FIXED='lvgannsquarefixed';
const BASE='gannsquare';

interface GannModel extends NativeModel{entryLines(proj:Projector):unknown[]|null;constrainHandleDrag(index:number):void;onPlaced(proj:Projector):void}
/** Distance in bars between two times (the projector's barsBetween), or the time distance when no bar axis is known. */
export type BarDistance=(t1:number,t2:number)=>number;
const timeDistance:BarDistance=(t1,t2)=>Math.abs(t2-t1);
/** Price per bar of the box diagonal, or null when the box has no width or no height. */
export function gannRatio(anchors:readonly {time:number;price:number}[],bars:BarDistance=timeDistance):number|null{
 const [a,b]=anchors;if(!a||!b)return null;
 const dt=Math.abs(bars(a.time,b.time)),dp=Math.abs(b.price-a.price);
 return dt>0&&dp>0&&Number.isFinite(dp/dt)?dp/dt:null;
}
/** The fixed-ratio correction after handle `index` moved: the moved corner keeps its time; its price is set from the ratio. */
export function constrainFixedRatio(anchors:{time:number;price:number}[],index:number,ratio:number|null,previousSign:number,bars:BarDistance=timeDistance):void{
 const moved=anchors[index],other=anchors[1-index];if(!moved||!other||ratio==null)return;
 const sign=Math.sign(moved.price-other.price)||previousSign||1;
 moved.price=other.price+sign*ratio*Math.abs(bars(other.time,moved.time));
}
const barsOf=(proj:Projector|undefined):BarDistance=>{const between=(proj as {barsBetween?:BarDistance}|undefined)?.barsBetween;return typeof between==='function'?(t1,t2)=>between(t1,t2):timeDistance;};

function pinGannSquare(){
 const base=nativeBase(BASE);
 for(const key of ['anchorSchema','entryLines','arcGeom','box','hitTest','hitHandle','handlePoints','bounds','schema','serialize','readProps','writeProps','constrainHandleDrag','onPlaced','editableLevels'])method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==2||shape.max!==2||shape.roles!=='p1/p2')fail('gann square anchor schema changed: '+JSON.stringify(shape));
 const written=base.sample.serialize().props;
 if(!written||Object.keys(written).sort().join()!=='labelsSize,levels,numbersSize')fail('gann square retained props changed');
 return base;
}

function defineGannFixed():DrawingTypeMeta{
 const base=pinGannSquare();
 const Base=base.ctor as unknown as new(init:Init)=>GannModel;
 /** The ratio and price direction captured before a handle drag starts (the press hit-tests the handle first). */
 const captured=new WeakMap<object,{ratio:number|null;sign:number;bars:BarDistance}>();
 class LvGannSquareFixed extends Base{
  constructor(init:Init){super(init);(this as {type:string}).type=LV_GANN_SQUARE_FIXED;}
  private capture(proj?:Projector){const [a,b]=this.anchors,bars=barsOf(proj);captured.set(this,{ratio:gannRatio(this.anchors,bars),sign:a&&b?Math.sign(b.price-a.price):0,bars});}
  hitHandle(px:number,py:number,proj:Projector,tol:number):number{
   const index=super.hitHandle(px,py,proj,tol);
   if(index>=0)this.capture(proj);
   return index;
  }
  constrainHandleDrag(index:number):void{
   super.constrainHandleDrag(index);
   const held=captured.get(this);if(!held)return;
   const signFromFirst=index===1?held.sign:-held.sign;
   constrainFixedRatio(this.anchors,index,held.ratio,signFromFirst,held.bars);
  }
  onPlaced(proj:Projector):void{
   super.onPlaced(proj);
   const [a,b]=this.anchors;if(!a||!b)return;
   const ya=proj.yOf(a.price,this.paneId),yb=proj.yOf(b.price,this.paneId);
   if(ya==null||yb==null)return;
   const dx=Math.abs(proj.xOf(b.time)-proj.xOf(a.time));if(dx<1)return;
   const y=ya+(yb>ya?1:-1)*dx,price=proj.pxToPoint(proj.xOf(b.time),y,this.paneId).price;
   if(Number.isFinite(price))b.price=price;
   this.capture(proj);
  }
 }
 const probe=new LvGannSquareFixed({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(roles(probe).roles!=='p1/p2')fail('gann square fixed anchor schema changed');
 return{type:lvKey(LV_GANN_SQUARE_FIXED),group:base.meta.group,label:'Gann square fixed',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvGannSquareFixed(init)};
}

export const GANN_SQUARE_FIXED_MODULE=defineLvDrawingToolModule({
 id:'gann-square-fixed',
 types:[{type:LV_GANN_SQUARE_FIXED,base:BASE,define:defineGannFixed}],
 unappliedDefaults:[Object.freeze({toolId:'LineToolGannFixed',factId:'tool.LineToolGannFixed.creation',property:'pointsCount',value:null,reason:'unverified' as const,
  note:'The reference anchor count and proportions are not recorded (pointsCountKnown false). Slice approximation pending reference observation: OpenCandle places 2 corners, squares the box on screen at placement and then holds its price-per-time ratio when a corner is dragged. Factory defaults are unknown (static-drawing-defaults-2#tool.LineToolGannFixed.status), so nothing is seeded and the native Gann square levels and style remain; those are OpenCandle renderer defaults.'})],
 catalog:[{rowId:'DW.GANN.GANN_SQUARE_FIXED',type:LV_GANN_SQUARE_FIXED,note:'Click a corner, then the width. The square keeps its proportions when resized.'}],
});
