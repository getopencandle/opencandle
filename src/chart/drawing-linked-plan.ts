import {DRAWING_TEMPLATE_LIMITS} from './drawing-template-batch';

/** DWUTIL spec 3.7: the pure linked-drawing planner. It reads documents and returns private
 * candidates; it never publishes, forwards or writes history. The caller (the Grid drawing
 * workspace host) prepares one workspace candidate from the plan, all or none. */
type Row=Record<string,unknown>;
export type LinkedDrawingKind='erase'|'clone'|'paste'|'remove';
export type DrawingSyncScope='layout'|'global';
/** Total candidate rows across all cells, the prepared property batch limit. */
export const LINKED_DRAWING_CANDIDATE_LIMIT=DRAWING_TEMPLATE_LIMITS.targets;
export const LINKED_DRAWING_LIMIT_MESSAGE='Too many synchronized drawings to change at once.';
/** A same-scope peer whose drawing document is unavailable or quarantined refuses the
 * whole action before forwarding. LV wording. */
export const LINKED_PEER_UNAVAILABLE_MESSAGE='A chart with synchronized drawings is unavailable. Reopen it, then try again. Nothing was changed.';

const record=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** A row is synchronized only when it carries a valid stamp; anything else stays local. */
export function drawingSyncScope(row:unknown):DrawingSyncScope|null{const value=record(row)?row.lvSyncScope:undefined;return value==='layout'||value==='global'?value:null;}
const withScope=<T extends Row>(row:T,scope:DrawingSyncScope|null):T=>{const next={...row} as Row;if(scope)next.lvSyncScope=scope;else delete next.lvSyncScope;return next as T;};

/** Run inside the canonical pass that first sees each id (never a separate
 * write or history step). A new id takes the current toolbar stamp (syncOn ? syncMode : null), so a
 * pasted or cloned copy never inherits its source row's stamp. A known id keeps its previous stamp,
 * because a native edit drops unknown fields. Unchanged objects are returned as-is. */
export function stampNewDrawings<T extends Row>(prevRows:readonly T[],nextRows:readonly T[],toolbarStamp:DrawingSyncScope|null):T[]{
 if(toolbarStamp!==null&&toolbarStamp!=='layout'&&toolbarStamp!=='global')throw Error('Invalid drawing sync stamp.');
 const previous=new Map<unknown,T>();for(const row of prevRows)previous.set(row.id,row);
 return nextRows.map(row=>{const old=previous.get(row.id),scope=old?drawingSyncScope(old):toolbarStamp;return drawingSyncScope(row)===scope&&(scope!==null||!Object.hasOwn(row,'lvSyncScope'))?row:withScope(row,scope);});
}

export interface LinkedDrawingChange {removeIds:string[];addRows:Row[];originChanged:number}
const rowsOf=(document:unknown):Row[]=>{if(!record(document)||!Array.isArray(document.drawings)||document.drawings.length>10000||!document.drawings.every(record))throw Error(LINKED_PEER_UNAVAILABLE_MESSAGE);return document.drawings as Row[];};
/** The origin's own prepared candidate against its opening document: removed ids and new rows. */
export function linkedDrawingChange(before:Row,after:Row):LinkedDrawingChange{
 const opening=rowsOf(before),next=rowsOf(after),openingIds=new Set(opening.map(row=>row.id)),nextIds=new Set(next.map(row=>row.id));
 const removeIds=opening.filter(row=>!nextIds.has(row.id)).map(row=>String(row.id)),addRows=next.filter(row=>!openingIds.has(row.id));
 return{removeIds,addRows,originChanged:removeIds.length+addRows.length};
}

export interface LinkedDrawingPlanInput {
 kind:LinkedDrawingKind;originId:string;
 layout:{cells:readonly {id:string}[]};
 cells:Readonly<Record<string,{drawings:Row}|undefined>>;
 /** drawingScopeKey of each cell's active scope; a throw makes that cell unavailable. */
 scopeKey(cellId:string):string;
 mounted(cellId:string):boolean;
 available(cellId:string):boolean;
 targetIds?:readonly string[];addRows?:readonly Row[];
 /** Rows the origin itself changes; defaults to the targets plus the new rows. */
 originChanged?:number;
}
export interface LinkedPeerCandidate {cellId:string;mode:'native'|'canonical-only';drawings:Row;removedIds:string[];addedIds:string[]}
export interface LinkedDrawingPlan {kind:LinkedDrawingKind;originId:string;peers:readonly LinkedPeerCandidate[];affectedCellIds:string[];candidates:number}

/** Prune removed ids from a schema-1 flat group book; absent stays absent; anything else refuses
 * (eraser group: unknown manager schema refuses before forwarding and is retained). */
function pruneManager(document:Row,removed:ReadonlySet<string>):Row{
 if(!Object.hasOwn(document,'lvDrawingManager'))return document;
 const manager=document.lvDrawingManager;
 if(!record(manager)||manager.schemaVersion!==1||!Array.isArray(manager.groups)||!manager.groups.every(group=>record(group)&&Array.isArray(group.memberIds)&&group.memberIds.every(id=>typeof id==='string')))throw Error(LINKED_PEER_UNAVAILABLE_MESSAGE);
 const groups=(manager.groups as Row[]).map(group=>(group.memberIds as string[]).some(id=>removed.has(id))?{...group,memberIds:(group.memberIds as string[]).filter(id=>!removed.has(id))}:group);
 return{...document,lvDrawingManager:{...manager,groups}};
}

export function planLinkedDrawingAction(input:LinkedDrawingPlanInput):LinkedDrawingPlan{
 const {kind,originId}=input,targetIds=[...(input.targetIds??[])],addRows=[...(input.addRows??[])];
 if(!['erase','clone','paste','remove'].includes(kind))throw Error('Unknown linked drawing action.');
 if((kind==='erase'||kind==='remove')&&addRows.length||(kind==='clone'||kind==='paste')&&targetIds.length)throw Error('The prepared drawing change does not match the requested action.');
 const origin=input.cells[originId];if(!origin||!input.layout.cells.some(cell=>cell.id===originId))throw Error('The linked drawing origin is not in this layout.');
 const originRows=rowsOf(origin.drawings),byId=new Map(originRows.map(row=>[row.id,row]));
 // Only stamped rows are synchronized; an unscoped target or copy stays in its own chart.
 const scopedTargets=targetIds.filter(id=>drawingSyncScope(byId.get(id))!==null),scopedAdds=addRows.filter(row=>drawingSyncScope(row)!==null);
 let candidates=input.originChanged??targetIds.length+addRows.length;
 const peers:LinkedPeerCandidate[]=[];
 if(scopedTargets.length||scopedAdds.length){
  let originKey:string;try{originKey=input.scopeKey(originId);}catch{throw Error(LINKED_PEER_UNAVAILABLE_MESSAGE);}
  for(const {id} of input.layout.cells){
   if(id===originId)continue;
   // Peers are every cell of the layout whose active drawingScopeKey equals the
   // origin's, regardless of link group. Another symbol or adjustment is never touched.
   let key:string;try{key=input.scopeKey(id);}catch{throw Error(LINKED_PEER_UNAVAILABLE_MESSAGE);}
   if(key!==originKey)continue;
   const cell=input.cells[id];if(!cell||!input.available(id))throw Error(LINKED_PEER_UNAVAILABLE_MESSAGE);
   const rows=rowsOf(cell.drawings),present=new Set(rows.map(row=>row.id));
   const removed=new Set(scopedTargets.filter(target=>present.has(target)));
   if(scopedAdds.some(row=>present.has(row.id)))throw Error(LINKED_PEER_UNAVAILABLE_MESSAGE);
   if(!removed.size&&!scopedAdds.length)continue;
   let drawings:Row={...cell.drawings,drawings:[...rows.filter(row=>!removed.has(String(row.id))),...scopedAdds.map(row=>structuredClone(row))]};
   if(removed.size)drawings=pruneManager(drawings,removed);
   candidates+=removed.size+scopedAdds.length;
   peers.push({cellId:id,mode:input.mounted(id)?'native':'canonical-only',drawings,removedIds:[...removed],addedIds:scopedAdds.map(row=>String(row.id))});
  }
 }
 if(candidates>LINKED_DRAWING_CANDIDATE_LIMIT)throw Error(LINKED_DRAWING_LIMIT_MESSAGE);
 return Object.freeze({kind,originId,peers:Object.freeze(peers),affectedCellIds:[originId,...peers.map(peer=>peer.cellId)],candidates});
}
