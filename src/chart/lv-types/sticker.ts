// Stickers (the Stickers tab of the Icons group) on the pinned native `box` class, painted through
// LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint) with OpenCandle's own art (sticker-set.ts).
//
// The sticker artwork, its factory size, its placement gesture and its settings are OpenCandle's own,
// so everything below is our own choice:
//  * One centre anchor (time and price) and a size in screen pixels (props.lvStickerSize, default STICKER_DEFAULT_PX), like
//    Emojis, Icons and Image: the sticker keeps its size when the chart zooms or the interval changes, and never collapses to
//    nothing on a coarser interval.
//  * Placement: a click drops the picked sticker centred on the click. Move: drag the body or the centre handle. Resize: the
//    Size setting (STICKER_MIN_PX..STICKER_MAX_PX).
//  * Saved stickers from before (two corner anchors, a box in time and price) load centred on the middle of their old box; their
//    size is the pixel size the old box had when first drawn again (the smaller side, as it painted), or the default when that
//    box is too small to measure (for example both corners on one bar of a coarser interval). They save in the new form.
//  * Settings: the sticker and its size. No colors: a sticker paints its own colors.
import type {DrawingTypeMeta,SettingsField} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';
import {STICKERS,paintSticker,selectedSticker,stickerById} from './sticker-set';

export const LV_STICKER='lvsticker';
export const STICKER_TOOL_ID='LineToolSticker';
export const STICKER_ROW='DW.ANNOTATION.STICKERS';
export const STICKER_PROP='lvSticker';
export const STICKER_SIZE_PROP='lvStickerSize';
export const STICKER_DEFAULT_PX=64;
export const STICKER_MIN_PX=16;
export const STICKER_MAX_PX=512;
const BASE='box';

/** Open questions for this tool (each answered by an OpenCandle choice for now). */
export const STICKER_MISSING_FACTS=Object.freeze([
 'the reference sticker catalog (deliberately not recorded: artwork; OpenCandle draws its own set)',
 'factory size, placement gesture and resize behaviour of LineToolSticker (OpenCandle: click to drop at 64 px, a Size setting in pixels)',
 'settings dialog and floating toolbar buttons of LineToolSticker',
]);

type Anchor={time:number;price:number};
interface BoxModel extends NativeModel{anchors:Anchor[];paneId:string}

function pinBox(){
 const base=nativeBase(BASE);
 for(const key of ['hitHandle','handlePoints','bounds','priceRange','serialize','readProps','writeProps','placementMode','onPlaced'])method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==2||shape.max!==2||shape.roles!=='c1/c2')fail('rectangle anchor schema changed: '+JSON.stringify(shape));
 return base;
}
const validSize=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=STICKER_MIN_PX&&value<=STICKER_MAX_PX;

function defineSticker():DrawingTypeMeta{
 const base=pinBox();
 const Base=base.ctor as unknown as new(init:Init)=>BoxModel;
 const stickerField:SettingsField={path:STICKER_PROP,label:'Sticker',kind:'select',options:STICKERS.map(row=>({value:row.id,label:row.label})),group:'line'} as SettingsField;
 const sizeField:SettingsField={path:STICKER_SIZE_PROP,label:'Size',kind:'number',min:STICKER_MIN_PX,max:STICKER_MAX_PX,step:1,group:'line'} as SettingsField;
 /** The two corners of a saved box-form sticker whose pixel size is still to be measured. */
 const legacy=new WeakMap<object,[Anchor,Anchor]>();
 class LvSticker extends Base{
  declare lvSticker:string;
  declare lvStickerSize:number;
  constructor(init:Init){
   super(init);(this as {type:string}).type=LV_STICKER;
   if(typeof this.lvSticker!=='string')this.lvSticker=selectedSticker();
   const sized=validSize(this.lvStickerSize);if(!sized)this.lvStickerSize=STICKER_DEFAULT_PX;
   const [a,b]=this.anchors;
   if(a&&b){
    this.anchors=[{time:(a.time+b.time)/2,price:(a.price+b.price)/2}];
    if(!sized)legacy.set(this,[{...a},{...b}]);
   }
  }
  anchorSchema(){return{min:1,max:1,slots:[{role:'c1',free:'both'}]} as ReturnType<NativeModel['anchorSchema']>;}
  placementMode(){return'click' as const;}
  onPlaced(_proj:Projector){/* the click is the centre */}
  /** The pixel box: the size centred on the anchor. A saved box-form sticker first takes the pixel size its old box has now. */
  box(proj:Projector){
   const a=this.anchors[0];if(!a)return null;
   const old=legacy.get(this);
   if(old){
    legacy.delete(this);
    const y1=proj.yOf(old[0].price,this.paneId),y2=proj.yOf(old[1].price,this.paneId);
    const side=y1==null||y2==null?NaN:Math.round(Math.min(Math.abs(proj.xOf(old[1].time)-proj.xOf(old[0].time)),Math.abs(y2-y1)));
    if(validSize(side))this.lvStickerSize=side;
   }
   const y=proj.yOf(a.price,this.paneId),x=proj.xOf(a.time);if(y==null||!Number.isFinite(x))return null;
   const side=this.lvStickerSize;
   return{x:x-side/2,y:y-side/2,w:side,h:side};
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   const box=this.box(proj);
   return !!box&&px>=box.x-tol&&px<=box.x+box.w+tol&&py>=box.y-tol&&py<=box.y+box.h+tol;
  }
  handlePoints(proj:Projector):[number,number][]{const box=this.box(proj);return box?[[box.x+box.w/2,box.y+box.h/2]]:[];}
  hitHandle(px:number,py:number,proj:Projector,tol:number):number{
   const [c]=this.handlePoints(proj);return c&&Math.hypot(px-c[0],py-c[1])<=tol+3?0:-1;
  }
  bounds(proj:Projector){return this.box(proj);}
  schema(){return{fields:[structuredClone(stickerField),structuredClone(sizeField)]} as ReturnType<NativeModel['schema']>;}
  protected readProps(props:Record<string,unknown>):void{
   const value=props?.[STICKER_PROP];
   if(typeof value==='string'&&value.length<=64)this.lvSticker=value;
   if(validSize(props?.[STICKER_SIZE_PROP]))this.lvStickerSize=props[STICKER_SIZE_PROP] as number;
  }
  /** A saved box-form sticker not drawn yet keeps no size, so it is measured when it is next drawn. */
  protected writeProps():Record<string,unknown>{return legacy.has(this)?{[STICKER_PROP]:this.lvSticker}:{[STICKER_PROP]:this.lvSticker,[STICKER_SIZE_PROP]:this.lvStickerSize};}
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme){
   const box=this.box(proj);if(!box)return;
   paintSticker(ctx,stickerById(this.lvSticker),box,theme?.fontFamily||'sans-serif');
  }
 }
 const probe=new LvSticker({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(probe.lvSticker!==selectedSticker()||probe.anchorSchema().max!==1||probe.lvStickerSize!==STICKER_DEFAULT_PX)fail('rectangle subclass no longer takes the sticker fields');
 if(JSON.stringify(new LvSticker({id:'lv-drawing-type-probe',paneId:'price',createdAt:0,props:{[STICKER_PROP]:'star',[STICKER_SIZE_PROP]:80}}).serialize().props)!==JSON.stringify({[STICKER_PROP]:'star',[STICKER_SIZE_PROP]:80}))fail('rectangle props round trip changed');
 return{type:lvKey(LV_STICKER),group:base.meta.group,label:'Sticker',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvSticker(init)};
}

export const STICKER_MODULE=defineLvDrawingToolModule({
 id:'sticker',
 types:[{type:LV_STICKER,base:BASE,define:defineSticker,requiresPaintHook:true}],
 catalog:[{rowId:STICKER_ROW,type:LV_STICKER,note:'Pick a sticker, then click the chart to drop it. Change its size in its settings.'}],
});
