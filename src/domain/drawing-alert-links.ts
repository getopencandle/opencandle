// Which saved alerts belong to a drawing, and which drawings a workspace change deleted.
// When a drawing with alerts is deleted, LV asks whether to delete those alerts too or keep them (src/ui/DrawingAlertCleanup.tsx).
// The rule, wording and buttons are LV's. Before this, LV left the alerts in place without a word.
// An alert belongs to a drawing when it was made from it:
//  - a drawing boundary source (frozen geometry, geometry.drawingId), or either side of a comparison;
//  - the older 'drawing' source kind (instanceId is the drawing id);
//  - a Long/Short position alert (condition.position.drawingId);
//  - a Fib retracement level-crossing alert (condition.levels.drawingId).
// A deletion is a drawing id that a chart cell held and no longer holds, in the same saved layout, the same cell and the same
// drawing scope (instrument). A layout switch, a symbol change of the cell, a new cell or a removed cell never counts: the
// documents were swapped, not edited. An id still held anywhere else in the layout (another cell, an inactive scope) is not
// deleted.
import type {LocalAlert} from './alerts';
import type {AlertScalarSource} from './alert-observation';

const text=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=200?value:null;
function sourceDrawingId(source:AlertScalarSource|undefined):string|null{
 if(!source)return null;
 if(source.kind==='drawing-boundary')return text(source.geometry?.drawingId)??text(source.instanceId);
 if(source.kind==='drawing')return text(source.instanceId);
 return null;
}
/** The drawing ids an alert was made from (usually one, at most two for a comparison). */
export function alertDrawingIds(alert:LocalAlert):string[]{
 const ids=new Set<string>(),definition=alert.definition,source=definition.observationBinding?.source;
 const add=(id:string|null)=>{if(id)ids.add(id);};
 if(source){if(source.kind==='comparison'){add(sourceDrawingId(source.left));add(sourceDrawingId(source.right));}else add(sourceDrawingId(source));}
 add(text(definition.condition?.position?.drawingId));
 add(text(definition.condition?.levels?.drawingId));
 return [...ids];
}

interface ScopedDocumentLike {drawings?:unknown;drawingScopes?:{activeBasis?:{instrumentId?:unknown};inactive?:unknown}}
interface CellLike extends ScopedDocumentLike {datasetId?:unknown}
export interface DrawingLayoutSnapshot {layoutId:string|null;grid:{cells?:Record<string,CellLike>}|null|undefined}
export interface DrawingRemoval {instrumentId:string|null;ids:string[]}

const documentIds=(document:unknown):string[]=>{
 const rows=document&&typeof document==='object'?(document as {drawings?:unknown}).drawings:undefined;
 if(!Array.isArray(rows))return [];
 const ids:string[]=[];for(const row of rows){const id=row&&typeof row==='object'?text((row as {id?:unknown}).id):null;if(id)ids.push(id);}return ids;
};
const cellInstrument=(cell:CellLike):string|null=>text(cell.drawingScopes?.activeBasis?.instrumentId);
// The scope a cell's active document belongs to: its basis instrument, else (older saves without scopes) its dataset.
const cellScope=(cell:CellLike)=>cellInstrument(cell)??('dataset:'+String(cell.datasetId));
const cellsOf=(snapshot:DrawingLayoutSnapshot|null)=>{const cells=snapshot?.grid&&typeof snapshot.grid==='object'?snapshot.grid.cells:undefined;return cells&&typeof cells==='object'?Object.entries(cells).filter(([,cell])=>!!cell&&typeof cell==='object'):[];};

/** The drawings each cell lost between two saved states of the same layout. */
export function drawingRemovals(previous:DrawingLayoutSnapshot|null,next:DrawingLayoutSnapshot):DrawingRemoval[]{
 if(!previous||previous.layoutId!==next.layoutId)return [];
 const held=new Set<string>();
 for(const [,cell] of cellsOf(next)){
  for(const id of documentIds(cell.drawings))held.add(id);
  const inactive=cell.drawingScopes?.inactive;
  if(Array.isArray(inactive))for(const entry of inactive)for(const id of documentIds(entry&&typeof entry==='object'?(entry as {document?:unknown}).document:undefined))held.add(id);
 }
 const after=new Map(cellsOf(next)),removals:DrawingRemoval[]=[];
 for(const [cellId,before] of cellsOf(previous)){
  const now=after.get(cellId);
  if(!now||cellScope(now)!==cellScope(before)||before.drawings===now.drawings)continue;
  const ids=documentIds(before.drawings).filter(id=>!held.has(id));
  if(ids.length)removals.push({instrumentId:cellInstrument(before),ids:[...new Set(ids)]});
 }
 return removals;
}

/** The drawings each cell gained between two saved states of the same layout (the mirror of
 * drawingRemovals, so an Undo of a deletion brings the drawing's deleted alerts back). Same rules: same layout, same cell, same
 * drawing scope; an id another cell already held before is not an addition. */
export function drawingAdditions(previous:DrawingLayoutSnapshot|null,next:DrawingLayoutSnapshot):DrawingRemoval[]{
 if(!previous||previous.layoutId!==next.layoutId)return [];
 const held=new Set<string>();
 for(const [,cell] of cellsOf(previous)){
  for(const id of documentIds(cell.drawings))held.add(id);
  const inactive=cell.drawingScopes?.inactive;
  if(Array.isArray(inactive))for(const entry of inactive)for(const id of documentIds(entry&&typeof entry==='object'?(entry as {document?:unknown}).document:undefined))held.add(id);
 }
 const before=new Map(cellsOf(previous)),additions:DrawingRemoval[]=[];
 for(const [cellId,now] of cellsOf(next)){
  const prior=before.get(cellId);
  if(!prior||cellScope(now)!==cellScope(prior)||prior.drawings===now.drawings)continue;
  const ids=documentIds(now.drawings).filter(id=>!held.has(id));
  if(ids.length)additions.push({instrumentId:cellInstrument(now),ids:[...new Set(ids)]});
 }
 return additions;
}

/** The saved alerts that belong to the deleted drawings (same instrument when the cell's scope names one), in list order. */
export function alertsOfRemovedDrawings(alerts:readonly LocalAlert[],removals:readonly DrawingRemoval[]):LocalAlert[]{
 if(!removals.length)return [];
 return alerts.filter(alert=>{
  const ids=alertDrawingIds(alert);if(!ids.length)return false;
  return removals.some(removal=>(removal.instrumentId===null||removal.instrumentId===alert.definition.instrumentId)&&ids.some(id=>removal.ids.includes(id)));
 });
}

/** The saved collection without the given alerts; ids already gone are ignored. */
export function withoutAlerts(alerts:readonly LocalAlert[],ids:readonly string[]):LocalAlert[]{const drop=new Set(ids);return alerts.filter(alert=>!drop.has(alert.definition.id));}
