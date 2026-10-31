// The LV drawing clipboard shared by every chart of this window (copy, cut and paste across charts and symbols).
// Process memory only; the system clipboard and the native clipboard are never read or written.
//
// Copy (Ctrl + C) and Clone in the Object tree toolbar menu and the indicator row menu ("Copy", Ctrl + C);
// Paste (Ctrl + V) in the chart menu.
// Cut (Ctrl + X, copy then remove as one step); the clipboard being shared by every chart cell of the
// window; pasting on another chart or symbol at the same time and price (no symbol conversion); pasted rows take the
// target chart's current sync stamp.
// A copy also keeps the groups of the copied rows (each group's name and its copied members, in group
// order). A paste recreates them as new groups with the same names around the pasted copies, in the same step, on any chart.
import {stampNewRow,type DrawingUtility} from './drawing-utility-state';

type Row=Record<string,unknown>;
/** Same cap as the owned Duplicate route. */
export const OBJECT_CLIPBOARD_LIMIT=128;
export const OBJECT_PASTE_EMPTY='Nothing has been copied yet.';
export const OBJECT_PASTE_UNAVAILABLE='Some copied drawings are not available in this chart and were not pasted.';
export interface ObjectClipboardOrigin {/** The chart document the rows came from (identity only, never read). */readonly owner:object;readonly symbol:string|null}
/** A copied group: its name and the SOURCE ids of its copied members. */
export interface ClipboardGroup {readonly name:string;readonly memberIds:readonly string[]}
export interface ObjectClipboardSnapshot {readonly rows:readonly Row[];readonly origin:ObjectClipboardOrigin;readonly cut:boolean;readonly groups?:readonly ClipboardGroup[]}
export interface ObjectClipboard {
 copy(rows:readonly Row[],origin:ObjectClipboardOrigin,cut?:boolean,groups?:readonly ClipboardGroup[]):void;
 read():ObjectClipboardSnapshot|null;
 size():number;
 clear():void;
}
const freeze=<T>(value:T):T=>{if(value&&typeof value==='object'){for(const key of Object.keys(value))freeze((value as Record<string,unknown>)[key]);Object.freeze(value);}return value;};
export function createObjectClipboard():ObjectClipboard{
 let held:ObjectClipboardSnapshot|null=null;
 return Object.freeze({
  copy(rows:readonly Row[],origin:ObjectClipboardOrigin,cut=false,groups:readonly ClipboardGroup[]=[]){
   if(!Array.isArray(rows)||!rows.length||rows.length>OBJECT_CLIPBOARD_LIMIT)throw Error('Copy between 1 and '+OBJECT_CLIPBOARD_LIMIT+' drawings.');
   if(rows.some(row=>!row||typeof row!=='object'||typeof row.id!=='string'||typeof row.type!=='string'))throw Error('Copied drawings need an id and a type.');
   const ids=new Set(rows.map(row=>row.id as string)),kept=clipboardGroups(groups.map((group,index)=>({id:String(index),name:group.name,memberIds:[...group.memberIds]})),[...ids]);
   held=Object.freeze({rows:freeze(rows.map(row=>structuredClone(row))),origin:Object.freeze({owner:origin.owner,symbol:origin.symbol??null}),cut:cut===true,...kept.length?{groups:freeze(kept)}:{}});
  },
  read:()=>held,
  size:()=>held?.rows.length??0,
  clear(){held=null;},
 });
}
/** The window's one clipboard. Each chart adapter reads and writes it, so a copy in one chart cell pastes in another. */
export const sharedObjectClipboard:ObjectClipboard=createObjectClipboard();

/** Which paste route a snapshot takes on a chart. 'duplicate': every source is still on this chart (the owned Duplicate route,
 * Copies each source's current value). 'insert': a cut, or rows from another chart, are inserted from the snapshot. */
export function pasteRouteFor(snapshot:ObjectClipboardSnapshot,owner:object,canonicalIds:ReadonlySet<string>):'duplicate'|'insert'{
 // A copy that carries groups always inserts, so the copies and their new groups land in ONE manager step.
 return !snapshot.cut&&!snapshot.groups?.length&&snapshot.origin.owner===owner&&snapshot.rows.every(row=>canonicalIds.has(String(row.id)))?'duplicate':'insert';
}
/**
 * Rows ready for insertion: fresh ids from `makeId` (never one in `occupied`), stacked above `floor` in copy order (the newest in
 * front, as the Duplicate route does), selection and lock kept, no group (the manager book is not copied) and the target's sync
 * stamp. Refuses a type the target cannot render with OBJECT_PASTE_UNAVAILABLE.
 */
export function preparePastedRows(rows:readonly Row[],options:{occupied:ReadonlySet<string>;makeId:()=>string;floor:number;known:(type:string)=>boolean;utility?:DrawingUtility}):Row[]{
 if(!rows.length)throw Error(OBJECT_PASTE_EMPTY);
 if(rows.some(row=>typeof row.type!=='string'||!options.known(row.type)))throw Error(OBJECT_PASTE_UNAVAILABLE);
 const floor=Number.isFinite(options.floor)?Math.max(0,Math.ceil(options.floor)):0,taken=new Set(options.occupied);
 return rows.map((row,index)=>{
  let id='';for(let attempt=0;attempt<8&&!id;attempt++){const candidate=options.makeId();if(typeof candidate==='string'&&/^[A-Za-z0-9:_-]{1,200}$/.test(candidate)&&!taken.has(candidate))id=candidate;}
  if(!id)throw Error('The drawing ID source repeatedly collided.');taken.add(id);
  const next:Row={...structuredClone(row) as Row,id,zIndex:floor+index+1};
  return options.utility?stampNewRow(next,options.utility):(delete next.lvSyncScope,next);
 });
}
/** The highest numeric draw-order key of a document's rows (0 when none). */
export function stackingFloor(rows:readonly Row[]):number{let floor=0;for(const row of rows)if(typeof row.zIndex==='number'&&Number.isFinite(row.zIndex))floor=Math.max(floor,row.zIndex);return floor;}
/** Status text after a copy or cut (our own wording). */
export function clipboardMessage(count:number,cut:boolean):string{
 const what=count===1?'Drawing':count+' drawings';
 return what+(cut?' cut':' copied')+'. Press Ctrl+V to paste '+(count===1?'it':'them')+'.';
}
/** The groups among `ids` (a manager book's groups): each group's name and its members that are in `ids`, in group
 * order; groups with no copied member are left out. */
export function clipboardGroups(groups:readonly {id:string;name:string;memberIds:readonly string[]}[],ids:readonly string[]):ClipboardGroup[]{
 const chosen=new Set(ids),seen=new Set<string>(),out:ClipboardGroup[]=[];
 for(const group of Array.isArray(groups)?groups:[]){
  if(!group||typeof group.name!=='string'||!Array.isArray(group.memberIds))continue;
  const memberIds=group.memberIds.filter((id:unknown):id is string=>typeof id==='string'&&chosen.has(id)&&!seen.has(id));
  for(const id of memberIds)seen.add(id);
  if(memberIds.length)out.push({name:group.name,memberIds});
 }
 return out;
}
/** The copied groups re-keyed to the pasted ids (`sourceIds[i]` became `pastedIds[i]`). */
export function pastedGroups(groups:readonly ClipboardGroup[],sourceIds:readonly string[],pastedIds:readonly string[]):{name:string;memberIds:string[]}[]{
 if(sourceIds.length!==pastedIds.length)throw Error('Pasted drawings do not match the copied drawings.');
 const map=new Map(sourceIds.map((id,index)=>[id,pastedIds[index]]));
 return groups.map(group=>({name:group.name,memberIds:group.memberIds.map(id=>map.get(id)).filter((id):id is string=>typeof id==='string')})).filter(group=>group.memberIds.length>0);
}
