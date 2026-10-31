/** LV drawing point resolution over the Vela native renderer (installed by adapter.ts's LVRenderer).
 * 1. Bar slots: a placed or dragged anchor's time always lands on a bar time, or on an extrapolated bar slot
 *    before the first or past the last bar. Only the
 *    pointer-to-point conversion changes, so saved drawings with off-bar times still load unchanged.
 * 2. Magnet: weak snaps to the nearest candidate value when the cursor is within WEAK_MAGNET_PX vertically of
 *    it (the time is already on the bar, so horizontal distance is not counted); strong always snaps.
 * 3. Snap to indicators: with the magnet on, the plotted values of the visible
 *    indicators in the pane under the cursor are candidates too (overlays on the price pane, plots in
 *    indicator panes). Off, an indicator pane snaps only the time, as before.
 * The 10 px weak radius (Vela uses 8 px from the cursor point). */
export const WEAK_MAGNET_PX=10;
const PRICE_PANE='price';
let indicatorSnap=false;
/** Workspace preference (drawingPreferences.snapToIndicators), shared by every chart. */
export function setIndicatorSnap(on:boolean){indicatorSnap=on===true;}
export const indicatorSnapOn=()=>indicatorSnap;

export interface SnapPoint {time:number;price:number}
export interface SnapCoords {timeToLogical(ms:number):number;logicalToTime(logical:number):number}
interface Projector {pxToPoint(x:number,y:number,paneId:string):SnapPoint;yOf(price:number,paneId:string):number|null|undefined}
interface SeriesLike {kind?:string;points?:readonly ({value?:number}|undefined|null)[];bars?:readonly ({close?:number}|undefined|null)[]}
interface ModelLike {id:string;paneId?:string|null;native?:{type?:string}|null;series?:readonly SeriesLike[]}
export interface SnapHost {
 bars:readonly {time:number;open:number;high:number;low:number;close:number}[];
 coords:SnapCoords;
 scene?:{indicators?:Map<string,ModelLike>;offsetOf?:(id:string)=>number};
}

/** Nearest bar slot of a time (extrapolated past either end by the bar interval). */
export function snapTimeToSlot(coords:SnapCoords,time:number):number{
 if(!Number.isFinite(time))return time;const logical=coords.timeToLogical(time);if(!Number.isFinite(logical))return time;
 const slot=coords.logicalToTime(Math.round(logical));return Number.isFinite(slot)?slot:time;
}
/** The projector with its pointer conversion moved to bar slots; every other member is the original. */
export function slotProjector<P extends {pxToPoint:Projector['pxToPoint']}>(projector:P,coords:SnapCoords):P{
 const original=projector.pxToPoint.bind(projector);
 return Object.assign(Object.create(Object.getPrototypeOf(projector)),projector,{pxToPoint(x:number,y:number,paneId:string){const point=original(x,y,paneId);return point&&Number.isFinite(point.time)?{...point,time:snapTimeToSlot(coords,point.time)}:point;}});
}
/** Plotted values at bar `index` of the visible indicators drawn in `paneId`. */
export function indicatorValuesAt(host:SnapHost,paneId:string,index:number):number[]{
 const out:number[]=[],models=host.scene?.indicators;if(!models)return out;
 for(const model of models.values()){
  const type=model.native?.type;if(type==='volume'||type==='vpvr')continue;
  if((model.paneId??PRICE_PANE)!==paneId)continue;
  const offset=host.scene?.offsetOf?.(model.id)??0,at=index-(Number.isFinite(offset)?offset:0);
  for(const series of model.series??[]){
   const value=Array.isArray(series.points)?series.points[at]?.value:Array.isArray(series.bars)?series.bars[at]?.close:undefined;
   if(typeof value==='number'&&Number.isFinite(value))out.push(value);
  }
 }
 return out;
}
/** The magnet: returns `point` itself when nothing snaps. */
export function magnetSnap(host:SnapHost,projector:Projector,point:SnapPoint,paneId:string,mode:string,cursor?:{x:number;y:number},indicators=indicatorSnap):SnapPoint{
 if(mode==='off')return point;const n=host.bars.length;if(!n)return point;
 const logical=Math.round(host.coords.timeToLogical(point.time));if(!Number.isFinite(logical)||logical<0||logical>n-1)return point;
 const bar=host.bars[logical];if(!bar)return point;
 const candidates=paneId===PRICE_PANE?[bar.open,bar.high,bar.low,bar.close]:[];
 if(indicators)candidates.push(...indicatorValuesAt(host,paneId,logical));
 if(!candidates.length)return{time:bar.time,price:point.price};
 let price=candidates[0];for(const value of candidates)if(Math.abs(value-point.price)<Math.abs(price-point.price))price=value;
 if(mode==='weak'&&cursor){const y=projector.yOf(price,paneId);if(typeof y!=='number'||!Number.isFinite(y)||Math.abs(y-cursor.y)>WEAK_MAGNET_PX)return point.time===bar.time?point:{time:bar.time,price:point.price};}
 return{time:bar.time,price};
}
/** Installs both behaviors on a renderer subclass PROTOTYPE (LVRenderer), over the base class's private snapToCandle and
 * drawingProjector. Prototype methods, not instance members: the annotation, inline-layout and appearance owners reserve
 * renderer methods and refuse an instance that already owns one. */
type SnapSelf=SnapHost&{drawingProjector():Projector};
export function installDrawingSnap(prototype:object):void{
 const base=Object.getPrototypeOf(prototype) as {drawingProjector?:(this:SnapSelf)=>Projector;snapToCandle?:unknown}|null;
 const baseProjector=base?.drawingProjector;
 if(typeof baseProjector!=='function'||typeof base?.snapToCandle!=='function'||Object.hasOwn(prototype,'drawingProjector'))return;
 Object.defineProperties(prototype,{
  drawingProjector:{configurable:true,writable:true,value:function(this:SnapSelf){return slotProjector(baseProjector.call(this),this.coords);}},
  snapToCandle:{configurable:true,writable:true,value:function(this:SnapSelf,point:SnapPoint,paneId:string,mode='strong',cursor?:{x:number;y:number}){return magnetSnap(this,baseProjector.call(this),point,paneId,mode,cursor);}},
 });
}
