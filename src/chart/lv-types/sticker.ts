// Stickers (the Stickers tab of the Icons group) on the pinned native `box` class (Rectangle: two corner
// anchors c1/c2, corner handles), painted through LV-VELA-DRAWING-PAINT-HOOK-1 (lvPaint) with OpenCandle's own art (sticker-set.ts).
//
// The sticker artwork, its factory size, its placement gesture and its settings are OpenCandle's own,
// so everything below is our own choice:
//  * Placement: a click drops the picked sticker centred on the click at STICKER_DEFAULT_PX; a press-drag-release draws it into the
//    dragged box instead (drags smaller than STICKER_MIN_DRAG_PX count as a click).
//  * Move: drag the body (anywhere inside the box). Resize: drag either corner handle (native Rectangle handles). The art keeps its
//    aspect and is centred in the box.
//  * Settings: the sticker can be changed in its settings (Sticker). No colors: a sticker paints its own colors.
import type {DrawingTypeMeta,SettingsField} from '@luxalgo/vela';
import {cloneStyle,fail,lvKey,method,nativeBase,roles,type Init,type NativeModel,type Projector} from '../lv-drawing-pin';
import type {LvPaintTheme} from '../lv-paint-hook';
import {defineLvDrawingToolModule} from './contract';
import {STICKERS,paintSticker,selectedSticker,stickerById} from './sticker-set';

export const LV_STICKER='lvsticker';
export const STICKER_TOOL_ID='LineToolSticker';
export const STICKER_ROW='DW.ANNOTATION.STICKERS';
export const STICKER_PROP='lvSticker';
export const STICKER_DEFAULT_PX=64;
export const STICKER_MIN_DRAG_PX=8;
const BASE='box';

/** Open questions for this tool (each answered by an OpenCandle choice for now). */
export const STICKER_MISSING_FACTS=Object.freeze([
 'the reference sticker catalog (deliberately not recorded: artwork; OpenCandle draws its own set)',
 'factory size, placement gesture and resize behaviour of LineToolSticker (OpenCandle: click to drop at 64 px, drag to size, corner handles)',
 'settings dialog and floating toolbar buttons of LineToolSticker',
]);

interface BoxModel extends NativeModel{
 rect(proj:Projector):{x1:number;y1:number;x2:number;y2:number}|null;
 anchors:{time:number;price:number}[];paneId:string;
}

function pinBox(){
 const base=nativeBase(BASE);
 for(const key of ['rect','hitHandle','handlePoints','bounds','priceRange','serialize','readProps','writeProps','placementMode','onPlaced'])method(base.prototype,key);
 const shape=roles(base.sample);
 if(shape.min!==2||shape.max!==2||shape.roles!=='c1/c2')fail('rectangle anchor schema changed: '+JSON.stringify(shape));
 return base;
}

function defineSticker():DrawingTypeMeta{
 const base=pinBox();
 const Base=base.ctor as unknown as new(init:Init)=>BoxModel;
 const stickerField:SettingsField={path:STICKER_PROP,label:'Sticker',kind:'select',options:STICKERS.map(row=>({value:row.id,label:row.label})),group:'line'} as SettingsField;
 class LvSticker extends Base{
  declare lvSticker:string;
  constructor(init:Init){super(init);(this as {type:string}).type=LV_STICKER;if(typeof this.lvSticker!=='string')this.lvSticker=selectedSticker();}
  /** min 1 lets a bare click finish the placement; onPlaced then adds the second corner. Saved stickers always hold two. */
  anchorSchema(){return{min:1,max:2,slots:[{role:'c1',free:'both'},{role:'c2',free:'both'}]} as ReturnType<NativeModel['anchorSchema']>;}
  placementMode(){return'drag' as const;}
  onPlaced(proj:Projector){
   const a=this.anchors[0];if(!a)return;
   const ax=proj.xOf(a.time),ay=proj.yOf(a.price,this.paneId);if(ay==null)return;
   const b=this.anchors[1],bx=b?proj.xOf(b.time):ax,by=b?proj.yOf(b.price,this.paneId):ay;
   if(b&&by!=null&&(Math.abs(bx-ax)>=STICKER_MIN_DRAG_PX||Math.abs(by-ay)>=STICKER_MIN_DRAG_PX))return;
   const half=STICKER_DEFAULT_PX/2,p1=proj.pxToPoint(ax-half,ay-half,this.paneId),p2=proj.pxToPoint(ax+half,ay+half,this.paneId);
   if(!p1||!p2||![p1.time,p1.price,p2.time,p2.price].every(Number.isFinite))return;
   this.anchors=[{time:p1.time,price:p1.price},{time:p2.time,price:p2.price}];
  }
  /** The pixel box: both corners, or (while the first corner is being placed) the default size centred on it. */
  box(proj:Projector){
   const r=this.rect(proj);
   if(r)return{x:Math.min(r.x1,r.x2),y:Math.min(r.y1,r.y2),w:Math.abs(r.x2-r.x1),h:Math.abs(r.y2-r.y1)};
   const a=this.anchors[0];if(!a)return null;const y=proj.yOf(a.price,this.paneId);if(y==null)return null;
   return{x:proj.xOf(a.time)-STICKER_DEFAULT_PX/2,y:y-STICKER_DEFAULT_PX/2,w:STICKER_DEFAULT_PX,h:STICKER_DEFAULT_PX};
  }
  hitTest(px:number,py:number,proj:Projector,tol:number):boolean{
   const box=this.box(proj);
   return !!box&&px>=box.x-tol&&px<=box.x+box.w+tol&&py>=box.y-tol&&py<=box.y+box.h+tol;
  }
  schema(){return{fields:[structuredClone(stickerField)]} as ReturnType<NativeModel['schema']>;}
  protected readProps(props:Record<string,unknown>):void{
   const value=props?.[STICKER_PROP];
   if(typeof value==='string'&&value.length<=64)this.lvSticker=value;
  }
  protected writeProps():Record<string,unknown>{return{[STICKER_PROP]:this.lvSticker};}
  lvPaint(ctx:CanvasRenderingContext2D,proj:Projector,theme:LvPaintTheme){
   const box=this.box(proj);if(!box)return;
   paintSticker(ctx,stickerById(this.lvSticker),box,theme?.fontFamily||'sans-serif');
  }
 }
 const probe=new LvSticker({id:'lv-drawing-type-probe',paneId:'price',createdAt:0});
 if(probe.lvSticker!==selectedSticker()||probe.anchorSchema().min!==1)fail('rectangle subclass no longer takes the sticker fields');
 if(JSON.stringify(new LvSticker({id:'lv-drawing-type-probe',paneId:'price',createdAt:0,props:{[STICKER_PROP]:'star'}}).serialize().props)!==JSON.stringify({[STICKER_PROP]:'star'}))fail('rectangle props round trip changed');
 return{type:lvKey(LV_STICKER),group:base.meta.group,label:'Sticker',icon:base.meta.icon,defaultStyle:cloneStyle(base.meta),create:init=>new LvSticker(init)};
}

export const STICKER_MODULE=defineLvDrawingToolModule({
 id:'sticker',
 types:[{type:LV_STICKER,base:BASE,define:defineSticker,requiresPaintHook:true}],
 catalog:[{rowId:STICKER_ROW,type:LV_STICKER,note:'Pick a sticker, then click the chart to drop it, or drag to size it.'}],
});
