import {GLOBAL_DRAWINGS_LIMITS} from './drawing-utility-state';

/** The workspace-level
 * cross-layout store, `workspace.globalDrawings`, keyed 'symbol:<symbol>'. A price-pane row stamped
 * lvSyncScope 'global' is recorded here when its chart changes it, and is applied to every chart of the
 * same symbol when a layout opens. A deleted row, or one whose stamp leaves 'global', is kept as a
 * tombstone row {id, lvGlobalRemoved:true} so its copies on other layouts are removed when those
 * layouts open. Tombstones are ordinary rows of the existing store shape: no schema change, and an old
 * workspace (empty store) loads unchanged. Pure: no host, no history, no storage. */
type Row=Record<string,unknown>;
export type GlobalDrawingStore=Record<string,Row[]>;
interface GridLike {layout:{id?:string;cells:readonly {id:string;symbol:string}[]};cells:Record<string,{drawings:Row}>}
export const GLOBAL_TOMBSTONE='lvGlobalRemoved';
/** Tombstones kept per symbol; the oldest go first. */
export const GLOBAL_TOMBSTONE_LIMIT=256;
export const globalDrawingKey=(symbol:string)=>'symbol:'+symbol;
const record=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const isGlobalRow=(row:unknown):row is Row=>record(row)&&row.lvSyncScope==='global'&&row.paneId==='price'&&typeof row.id==='string'&&!!row.id;
const isTombstone=(row:Row)=>row[GLOBAL_TOMBSTONE]===true;
const rowsOf=(document:unknown):Row[]=>record(document)&&Array.isArray(document.drawings)?(document.drawings as unknown[]).filter(record):[];
const globalsOf=(document:unknown)=>{const map=new Map<string,Row>();for(const row of rowsOf(document))if(isGlobalRow(row))map.set(row.id as string,row);return map;};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const total=(store:GlobalDrawingStore)=>Object.values(store).reduce((sum,list)=>sum+list.length,0);

function capped(store:GlobalDrawingStore):GlobalDrawingStore{
 // Over the row limit, tombstones go first (oldest first); live rows are never dropped here.
 let over=total(store)-GLOBAL_DRAWINGS_LIMITS.rows;if(over<=0)return store;
 const next={...store};
 for(const key of Object.keys(next)){if(over<=0)break;const list=next[key],kept:Row[]=[];for(const row of list){if(over>0&&isTombstone(row)){over--;continue;}kept.push(row);}next[key]=kept;}
 return next;
}

/** Record the global-row edits of every chart whose symbol is unchanged between `before` and `next`
 * (a chart that switched symbol, a new chart or another layout records nothing). Returns `store`
 * itself when nothing changed. Over the store limits a new symbol is not recorded (never a throw:
 * the chart edit itself always commits). */
export function recordGlobalDrawingEdits(store:GlobalDrawingStore,before:GridLike|undefined,next:GridLike|undefined):GlobalDrawingStore{
 if(!before||!next||before.layout.id!==next.layout.id)return store;
 let out:GlobalDrawingStore|null=null;
 for(const layoutCell of next.layout.cells){
  const prior=before.layout.cells.find(row=>row.id===layoutCell.id),was=before.cells[layoutCell.id],now=next.cells[layoutCell.id];
  if(!prior||!was||!now||prior.symbol!==layoutCell.symbol||was.drawings===now.drawings)continue;
  const old=globalsOf(was.drawings),fresh=globalsOf(now.drawings);
  const upserts=[...fresh.values()].filter(row=>!same(old.get(row.id as string),row)),removed=[...old.keys()].filter(id=>!fresh.has(id));
  if(!upserts.length&&!removed.length)continue;
  const key=globalDrawingKey(layoutCell.symbol),base:GlobalDrawingStore=out??store;
  if(!Object.hasOwn(base,key)&&Object.keys(base).length>=GLOBAL_DRAWINGS_LIMITS.scopeKeys)continue;
  // An upsert keeps its place when it was already live, so other layouts keep their order.
  const pending=new Map(upserts.map(row=>[row.id as string,row])),gone=new Set(removed),live:Row[]=[],dead:Row[]=[];
  for(const row of base[key]??[]){const id=row.id as string;
   if(isTombstone(row)){if(!pending.has(id)&&!gone.has(id))dead.push(row);continue;}
   if(gone.has(id))continue;const update=pending.get(id);if(update){live.push(structuredClone(update));pending.delete(id);}else live.push(row);}
  for(const row of pending.values())live.push(structuredClone(row));
  for(const id of removed)dead.push({id,[GLOBAL_TOMBSTONE]:true});
  out={...base,[key]:[...live,...dead.slice(Math.max(0,dead.length-GLOBAL_TOMBSTONE_LIMIT))]};
 }
 return out?capped(out):store;
}

function pruneGroups(document:Row,dropped:ReadonlySet<string>):Row{
 const manager=document.lvDrawingManager;
 if(!dropped.size||!record(manager)||!Array.isArray(manager.groups))return document;
 return{...document,lvDrawingManager:{...manager,groups:(manager.groups as unknown[]).map(group=>record(group)&&Array.isArray(group.memberIds)&&(group.memberIds as unknown[]).some(id=>dropped.has(id as string))?{...group,memberIds:(group.memberIds as unknown[]).filter(id=>!dropped.has(id as string))}:group)}};
}

/** Apply the store to one chart document: tombstoned global copies leave, recorded rows replace their
 * copies in place, missing rows are appended. A global row the store does not know is kept and
 * returned in `unknown` so the caller merges it up (an old workspace never loses a stamped row). */
export function applyGlobalDrawingsToDocument(document:Row,list:readonly Row[]|undefined):{document:Row;unknown:Row[]}{
 const rows=rowsOf(document);if(!list)return{document,unknown:rows.filter(isGlobalRow)};
 const live=new Map<string,Row>(),dead=new Set<string>();for(const row of list){if(isTombstone(row))dead.add(row.id as string);else live.set(row.id as string,row);}
 const present=new Set<string>(),dropped=new Set<string>(),unknown:Row[]=[],next:unknown[]=[];let changed=false;
 for(const row of (record(document)&&Array.isArray(document.drawings)?document.drawings as unknown[]:[])){
  if(!isGlobalRow(row)){if(record(row)&&typeof row.id==='string')present.add(row.id);next.push(row);continue;}
  const id=row.id as string;present.add(id);
  if(dead.has(id)){dropped.add(id);changed=true;continue;}
  const stored=live.get(id);if(!stored){unknown.push(row);next.push(row);continue;}
  if(same(stored,row))next.push(row);else{next.push(structuredClone(stored));changed=true;}
 }
 for(const [id,row] of live)if(!present.has(id)){next.push(structuredClone(row));changed=true;}
 if(!changed)return{document,unknown};
 return{document:pruneGroups({...document,drawings:next},dropped),unknown};
}

/** Apply the store to every chart of a grid that is about to render (a layout opening or a workspace
 * loading). Returns the same grid object when nothing changes, and the store with any unknown global
 * rows merged up. */
export function applyGlobalDrawings<G extends GridLike>(store:GlobalDrawingStore,grid:G):{grid:G;store:GlobalDrawingStore}{
 let cells:G['cells']|null=null,out=store;
 for(const layoutCell of grid.layout.cells){
  const cell=grid.cells[layoutCell.id];if(!cell)continue;const key=globalDrawingKey(layoutCell.symbol);
  const {document,unknown}=applyGlobalDrawingsToDocument(cell.drawings,out[key]);
  if(document!==cell.drawings){cells=cells??{...grid.cells};(cells as Record<string,unknown>)[layoutCell.id]={...cell,drawings:document};}
  if(unknown.length&&(Object.hasOwn(out,key)||Object.keys(out).length<GLOBAL_DRAWINGS_LIMITS.scopeKeys)){
   const known=new Set((out[key]??[]).map(row=>row.id));const add=unknown.filter(row=>!known.has(row.id)).map(row=>structuredClone(row));
   if(add.length&&total(out)+add.length<=GLOBAL_DRAWINGS_LIMITS.rows)out={...out,[key]:[...(out[key]??[]),...add]};
  }
 }
 return{grid:cells?{...grid,cells}:grid,store:out};
}
