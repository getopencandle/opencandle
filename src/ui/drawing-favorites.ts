import {drawingTypes} from '@luxalgo/vela';

/** OpenCandle-owned drawing type ids (src/chart/lv-drawing-types.ts). They can be unregistered in a build
 * where the pinned renderer model changed, or come from a newer OpenCandle build; such saved favorites are
 * retained opaquely (inert in the toolbar, removable) instead of failing the workspace restore. */
export const LV_OWNED_DRAWING_TYPE=/^lv[a-z0-9]{1,62}$/;
const MAX_RETAINED_UNREGISTERED=16;
/** Persist exact tool identifiers. Display normalization must never discard saved data. */
export function restoreDrawingFavorites(value:unknown):string[]{
 const known=new Set<string>(drawingTypes().map(row=>row.type));
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>known.size+MAX_RETAINED_UNREGISTERED)throw Error('Unsupported drawing favorites: expected a bounded list of drawing tools.');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==value.length+1||keys.some(key=>typeof key!=='string'||key!=='length'&&!/^(0|[1-9]\d*)$/.test(key)))throw Error('Unsupported drawing favorites: the list must contain ordinary entries only.');
 const result:string[]=[],seen=new Set<string>();let unregistered=0;
 for(let index=0;index<value.length;index++){
  const field=Object.getOwnPropertyDescriptor(value,String(index));
  if(!field||!field.enumerable||!Object.hasOwn(field,'value')||typeof field.value!=='string')throw Error('Unsupported drawing favorites: each entry must be a tool identifier.');
  const type=field.value;
  if(!known.has(type)&&(!LV_OWNED_DRAWING_TYPE.test(type)||++unregistered>MAX_RETAINED_UNREGISTERED))throw Error('Unsupported drawing favorite tool: '+type.slice(0,128));
  if(seen.has(type))throw Error('Unsupported drawing favorites: duplicate tool '+type+'.');
  seen.add(type);result.push(type);
 }
 return result;
}

export interface DrawingFavoriteOwner {
 workspace:object;favorites:readonly string[];chart:object|null;gridEpoch:number;ready:boolean;blocked:boolean;
}
export interface DrawingFavoriteHost {
 read:()=>DrawingFavoriteOwner;
 catalog:()=>readonly string[];
 publish:(next:string[])=>boolean;
}
const equal=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((value,index)=>value===b[index]);
export function drawingFavoriteOwnerCurrent(owner:DrawingFavoriteOwner,current:DrawingFavoriteOwner):boolean{
 return owner.ready&&!owner.blocked&&!!owner.chart&&current.ready&&!current.blocked&&current.workspace===owner.workspace&&current.favorites===owner.favorites&&current.chart===owner.chart&&current.gridEpoch===owner.gridEpoch;
}
/** A request belongs to one rendered workspace. Publication is the final action. */
export function captureDrawingFavoriteRequest(host:DrawingFavoriteHost,owner=host.read()):(proposed:unknown)=>boolean{
 const current=()=>drawingFavoriteOwnerCurrent(owner,host.read());
 return proposed=>{
  if(!current())return false;
  let next:string[];
  try{
   const before=restoreDrawingFavorites(owner.favorites);next=restoreDrawingFavorites(proposed);
   if(!current())return false;
   const catalog=host.catalog();if(!current())return false;
   const available=new Set(catalog);if(!current())return false;
   if(equal(before,next))return true;
   const added=next.length===before.length+1&&equal(before,next.slice(0,-1))&&!before.includes(next[next.length-1]);
   const removed=next.length===before.length-1&&equal(next,before.filter(type=>next.includes(type)));
   if(!added&&!removed)throw Error('Change one favorite at a time.');
   // Saved favorites whose tool is unavailable here stay retained and inert; they can be removed,
   // but nothing is added until they are resolved, so no saved entry is ever dropped implicitly.
   if(added&&before.some(type=>!available.has(type)))throw Error('Some saved favorites are unavailable in this chart. Remove them before adding another.');
   if(added&&!available.has(next[next.length-1]))throw Error('This drawing tool is unavailable in the current chart.');
   if(!current())return false;
  }catch(error){if(!current())return false;throw error;}
  return host.publish(next);
 };
}
