// The crosshair price chip follows the stored Symbol precision for the values
// the renderer tick cannot print (Integer, 9 to 15 decimals, 1/N). OpenCandle's own runtime seam on the pinned renderer's
// crosshair layer, in the appearance-painters style: two instance methods are wrapped (no upstream source rewrite, no new
// COMPAT step). `render(scene, coords, theme, separatorY, external)` is wrapped only to know the frame's coordinates and the
// synced crosshair; `lvAxisChip(pane, ctx, x, y, text, ...)` (COMPAT-8) gets the stored-precision text for a price-mode pane.
// Default, 1 to 8 decimals, percent/indexed panes and study panes keep the renderer text byte for byte.
import type {NativeRenderer} from '@luxalgo/vela';
import {frameCoords} from './derived-time-labels';
import {formatWithPrecision,precisionAxisExact} from './symbol-precision';

type RecordData=Record<string,any>;
type NativeMethod=(this:any,...args:any[])=>any;
const installed=new WeakMap<object,()=>void>();

/** The crosshair chip text for a pane, or null when the renderer text stands. */
export function crosshairChipText(price:number,scene:RecordData,pane:RecordData,precision:string|undefined):string|null{
 if(precision===undefined||precisionAxisExact(precision)||!Number.isFinite(price)||!pane||pane.kind!=='price'||pane.axisFormat==='none'||pane.axisFormat==='volume')return null;
 const mode=scene?.scaleMode;if(mode==='percent'||mode==='indexed')return null;
 return formatWithPrecision(price,precision);
}

function ownMethod(owner:RecordData,key:string):NativeMethod{
 if(Object.hasOwn(owner,key))throw Error(`Precision crosshair method already has an owner: ${key}`);
 const value=owner[key];if(typeof value!=='function')throw Error(`Precision crosshair method changed: ${key}`);return value as NativeMethod;
}

/** Installs the seam on a renderer; `precision` is read once per frame (a throw reads as Default). Returns the uninstaller. */
export function installPrecisionCrosshair(renderer:NativeRenderer,precision:()=>string|undefined):()=>void{
 const host=renderer as unknown as RecordData,layer=host?.crosshairLayer;
 if(!layer||typeof layer!=='object')throw Error('The renderer crosshair layer is unavailable');
 if(installed.has(layer))throw Error('The precision crosshair is already installed');
 const originalRender=ownMethod(layer,'render'),originalChip=ownMethod(layer,'lvAxisChip');
 let frame:{scene:RecordData;coords:RecordData;external:RecordData|null;precision:string|undefined}|null=null,active=true;
 const render:NativeMethod=function(scene:RecordData,given:RecordData,theme:RecordData,separatorY:unknown,external:unknown){
  // A derived chart type's crosshair time chip reads the brick's source time.
  const coords=frameCoords(renderer as object,given);
  if(!active)return Reflect.apply(originalRender,this,[scene,coords,theme,separatorY,external]);
  let stored:string|undefined;try{stored=precision();}catch{stored=undefined;}
  const previous=frame;frame={scene,coords,external:external&&typeof external==='object'?external as RecordData:null,precision:stored};
  try{return Reflect.apply(originalRender,this,[scene,coords,theme,separatorY,external]);}finally{frame=previous;}
 };
 const chip:NativeMethod=function(pane:RecordData,ctx:unknown,x:unknown,y:number,text:unknown,...rest:unknown[]){
  let shown=text;
  if(active&&frame){try{
   const ext=frame.external,price=ext&&ext.y===y&&Number.isFinite(ext.price)?Number(ext.price):Number(frame.coords.yToPrice(y,pane.scale,pane.bounds));
   const next=crosshairChipText(price,frame.scene,pane,frame.precision);if(next!==null)shown=next;
  }catch{shown=text;}}
  return Reflect.apply(originalChip,this,[pane,ctx,x,y,shown,...rest]);
 };
 Object.defineProperty(layer,'render',{configurable:true,writable:true,value:render});
 Object.defineProperty(layer,'lvAxisChip',{configurable:true,writable:true,value:chip});
 const dispose=()=>{
  if(!active)return;active=false;installed.delete(layer);
  for(const [key,value] of [['render',render],['lvAxisChip',chip]] as const){const own=Object.getOwnPropertyDescriptor(layer,key);if(own&&'value' in own&&own.value===value)delete layer[key];}
 };
 installed.set(layer,dispose);return dispose;
}
