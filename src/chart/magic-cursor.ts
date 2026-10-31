/** The Magic cursor.
 * Behavior: Magic is the cross cursor with a magnetic crosshair. In the price pane the horizontal line and the
 * price readout snap to the nearest open, high, low or close of the bar under the pointer. Other panes and the space past
 * the last bar keep the free crosshair. While a drawing tool is armed the crosshair is free again (drawings use the magnet).
 * Mechanism: prototype methods on the LV renderer subclass (as drawing-snap.ts), installed once, wrapping the native
 * pointer-move entry; the pane keeps the native cross cursor. */
export interface MagicBar {open:number;high:number;low:number;close:number}
export interface MagicHost {
 bars:readonly MagicBar[];
 coords:{xToLogical(x:number):number;priceToY(price:number,scale:unknown,bounds:{top:number;height:number}):number};
 paneNodeAtY(y:number):{id?:string;scale:unknown;bounds:{top:number;height:number}}|null;
}
const PRICE_PANE='price';
const MAGIC_FLAG=Symbol.for('lv.magicCursor');

/** The crosshair y snapped to the nearest OHLC of the bar under x (price pane only); y itself when nothing applies. */
export function magicCrosshairY(host:MagicHost,x:number,y:number):number{
 const n=host.bars.length;if(!n||!Number.isFinite(x)||!Number.isFinite(y))return y;
 const logical=Math.round(host.coords.xToLogical(x));if(!Number.isFinite(logical)||logical<0||logical>n-1)return y;
 const bar=host.bars[logical],pane=host.paneNodeAtY(y);if(!bar||!pane||(pane.id??PRICE_PANE)!==PRICE_PANE)return y;
 let best=y,distance=Infinity;
 for(const price of [bar.open,bar.high,bar.low,bar.close]){
  if(!Number.isFinite(price))continue;const candidate=host.coords.priceToY(price,pane.scale,pane.bounds);
  if(!Number.isFinite(candidate)||candidate<pane.bounds.top||candidate>pane.bounds.top+pane.bounds.height)continue;
  const d=Math.abs(candidate-y);if(d<distance){distance=d;best=candidate;}
 }
 return best;
}

type MagicSelf=MagicHost&{lvMagicCrosshair?:boolean;lastPointer?:{x:number;y:number}|null};
/** Installs lvSetMagicCrosshair and the pointer-move wrapper on a renderer prototype. Returns false when the prototype has no
 * native pointer-move entry (the Magic cursor then stays unavailable). Idempotent. */
export function installMagicCursor(prototype:object|null|undefined):boolean{
 if(!prototype)return false;
 if((prototype as Record<symbol,unknown>)[MAGIC_FLAG]===true)return true;
 const native=(prototype as {handlePointerMove?:unknown}).handlePointerMove;
 if(typeof native!=='function')return false;
 const move=native as (this:MagicSelf,x:number|null,y:number|null)=>unknown;
 Object.defineProperties(prototype,{
  [MAGIC_FLAG]:{value:true},
  handlePointerMove:{configurable:true,writable:true,value:function(this:MagicSelf,x:number|null,y:number|null){
   if(this.lvMagicCrosshair===true&&typeof x==='number'&&typeof y==='number'){try{y=magicCrosshairY(this,x,y);}catch{/* free crosshair */}}
   return move.call(this,x,y);
  }},
  lvSetMagicCrosshair:{configurable:true,writable:true,value:function(this:MagicSelf,on:boolean){
   const next=on===true;if(this.lvMagicCrosshair===next)return;this.lvMagicCrosshair=next;
   const last=this.lastPointer;if(last)move.call(this,last.x,next?magicCrosshairY(this,last.x,last.y):last.y);
  }},
 });
 return true;
}
export interface MagicRenderer {lvSetMagicCrosshair(on:boolean):void}
export const hasMagicCrosshair=(renderer:unknown):renderer is MagicRenderer=>!!renderer&&typeof (renderer as Partial<MagicRenderer>).lvSetMagicCrosshair==='function';
