// The drawings the saved workspace holds for one instrument, for the background check of
// the older 'drawing' alert kind (src/domain/legacy-drawing-alert.ts). Read only: every chart cell of the layout, its active
// drawing document (when its scope basis is this instrument) and its inactive scoped documents for this instrument, then the
// workspace's own document when its scope is this instrument. Records are returned as saved; the evaluator checks each one.
// Then every other saved layout of the layout library (the layout tabs), cell by cell in the same way, so a
// background drawing alert on a chart in another tab gets its geometry. The open layout is read from the working grid, never
// from its saved library copy (which can be older). The first record of an id wins: the working layout comes first.
import type {CellDrawingScopes} from './drawing-scopes';

interface ScopedDocument {drawings?:unknown;drawingScopes?:CellDrawingScopes}
interface SavedGrid {cells?:Record<string,ScopedDocument>}
interface SavedWorkspaceDrawings extends ScopedDocument {grid?:SavedGrid;layoutLibrary?:{activeId?:unknown;entries?:unknown}}
const rows=(document:unknown):unknown[]=>{const drawings=document&&typeof document==='object'?(document as {drawings?:unknown}).drawings:undefined;return Array.isArray(drawings)?drawings:[];};
const LIMIT=10000;

export function savedDrawingsForInstrument(workspace:SavedWorkspaceDrawings|null|undefined,instrumentId:string):unknown[]{
 if(!workspace||!instrumentId)return [];
 const found:unknown[]=[],seen=new Set<string>();
 const take=(document:unknown)=>{for(const row of rows(document)){if(found.length>=LIMIT)return;const id=row&&typeof row==='object'?String((row as {id?:unknown}).id):'';if(!id||seen.has(id))continue;seen.add(id);found.push(row);}};
 const scoped=(cell:ScopedDocument|undefined)=>{
  if(!cell||typeof cell!=='object')return;const scopes=cell.drawingScopes;
  if(scopes?.activeBasis?.instrumentId===instrumentId)take(cell.drawings);
  for(const entry of Array.isArray(scopes?.inactive)?scopes!.inactive:[])if(entry?.basis?.instrumentId===instrumentId)take(entry.document);
 };
 const grid=(value:SavedGrid|undefined)=>{const cells=value&&typeof value==='object'?value.cells:undefined;if(cells&&typeof cells==='object')for(const cell of Object.values(cells))scoped(cell);};
 grid(workspace.grid);
 scoped(workspace);
 const library=workspace.layoutLibrary,entries=library&&Array.isArray(library.entries)?library.entries:[];
 for(const entry of entries){
  if(!entry||typeof entry!=='object')continue;const saved=entry as {id?:unknown;grid?:SavedGrid};
  if(saved.id===library!.activeId&&workspace.grid)continue;
  grid(saved.grid);
 }
 return found;
}
