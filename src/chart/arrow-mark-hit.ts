// Arrow mark up / Arrow mark down hit area.
//
// The pinned native ArrowMark hit-tests the exact filled glyph polygon (an arrowhead 18 px wide over a 7 px stem) and ignores the
// hit tolerance the chart passes every drawing, so a click a few pixels off the stem, or on the anchor tip itself (a polygon corner),
// never selected the mark. This widens the hit area to the glyph's bounding box grown by the tolerance. Placement, painting, handles,
// bounds and serialization stay native. Registration fails closed: when the installed class no longer has the pinned shape nothing is
// patched and the native hit test remains.
import {fail,nativeBase,PinError,type NativeModel,type Projector} from './lv-drawing-pin';

export const ARROW_MARK_TYPES:readonly string[]=Object.freeze(['arrowmarkup','arrowmarkdown']);
const INSTALLED=Symbol.for('larryvision.arrowMarkHitArea');

export interface ArrowMarkHitStatus{readonly state:'installed'|'unavailable';readonly reason?:string}

/** Widened hit test: the glyph bounds grown by the tolerance on every side. */
export function arrowMarkHit(this:NativeModel,px:number,py:number,proj:Projector,tol:number):boolean{
 const box=this.bounds(proj);
 if(!box)return false;
 const pad=Number.isFinite(tol)&&tol>0?tol:0;
 return px>=box.x-pad&&px<=box.x+box.w+pad&&py>=box.y-pad&&py<=box.y+box.h+pad;
}

export function installArrowMarkHitArea():ArrowMarkHitStatus{
 try{
  const parents=new Set<object>();
  for(const type of ARROW_MARK_TYPES){
   const base=nativeBase(type);
   const parent=Object.getPrototypeOf(base.prototype) as object|null;
   if(!parent)fail('arrow mark has no shared base class');
   for(const key of ['hitTest','bounds','glyphPoints']){
    const d=Object.getOwnPropertyDescriptor(parent!,key);
    if(!d||typeof d.value!=='function')fail('arrow mark base lacks '+key);
   }
   if(base.sample.anchorSchema().max!==1)fail('arrow mark anchor schema changed');
   parents.add(parent!);
  }
  if(parents.size!==1)fail('arrow mark up and down no longer share one base class');
  const [parent]=[...parents];
  if(!(parent as Record<symbol,unknown>)[INSTALLED]){
   Object.defineProperty(parent,'hitTest',{value:arrowMarkHit,writable:true,configurable:true,enumerable:false});
   Object.defineProperty(parent,INSTALLED,{value:true});
  }
  return Object.freeze({state:'installed'});
 }catch(error){
  if(!(error instanceof PinError))throw error;
  return Object.freeze({state:'unavailable',reason:error.message});
 }
}
