import {activeWatchList,clearWatchList,deleteWatchList,deleteWatchSection,moveWatchRow,removeWatchRows,setWatchManualOrder,type WatchBook,type WatchRow} from './model';
import {addWatchMembers,watchListById,WatchStaleError,type WatchAddResult} from './membership';

export interface WatchConfirmation {action:'delete'|'clear'|'section-all';listId:string;rowId:string|null;snapshot:string;name:string;scope?:'active'|'list'}
/** Confirmation belongs to the exact list contents the user reviewed. */
export function captureWatchConfirmation(book:WatchBook,action:WatchConfirmation['action'],rowId:string|null=null):WatchConfirmation{
 const list=activeWatchList(book);
 if(action==='section-all'&&!list.rows.some(row=>row.id===rowId&&row.kind==='section'))throw new Error('Select a section first.');
 return {action,listId:list.id,rowId,snapshot:JSON.stringify(list),name:list.name};
}
export function applyWatchConfirmation(book:WatchBook,pending:WatchConfirmation,fallbackId:string):WatchBook{
 const scoped=pending.scope==='list';let list;try{list=scoped?watchListById(book,pending.listId):activeWatchList({...book,activeId:pending.listId});}catch{throw new Error('This list changed while confirmation was open. Cancel and review the current contents.');}
 if(!scoped&&book.activeId!==pending.listId||JSON.stringify(list)!==pending.snapshot)throw new Error('This list changed while confirmation was open. Cancel and review the current contents.');
 return pending.action==='delete'?deleteWatchList(book,pending.listId,fallbackId):pending.action==='clear'?clearWatchList(book,pending.listId):deleteWatchSection(book,pending.listId,pending.rowId!,true);
}
/** Sections move across adjacent complete sections, never into their member block. */
export function moveWatchSelection(book:WatchBook,listId:string,rowId:string,direction:-1|1):WatchBook{
 const list=activeWatchList({...book,activeId:listId}),rows=list.rows,start=rows.findIndex(row=>row.id===rowId);
 if(start<0)throw new Error('Selected row is missing.');
 const row=rows[start];let before:string|null;
 if(row.kind==='section'){
  if(direction<0){let previous=start-1;while(previous>=0&&rows[previous].kind!=='section')previous--;if(previous<0)return book;before=rows[previous].id;}
  else {let next=start+1;while(next<rows.length&&rows[next].kind!=='section')next++;if(next===rows.length)return book;next++;while(next<rows.length&&rows[next].kind!=='section')next++;before=rows[next]?.id??null;}
 }else{
  if(direction<0){if(start===0)return book;before=rows[start-1].id;}
  else{if(start===rows.length-1)return book;before=rows[start+2]?.id??null;}
 }
 return moveWatchRow(book,listId,rowId,before);
}
/** Confirmation for a list chosen in the list chooser; it need not be active. A flagged list can only be cleared. */
export function captureWatchListConfirmation(book:WatchBook,listId:string,action:'delete'|'clear'):WatchConfirmation{
 const list=watchListById(book,listId);if(action==='delete'&&listId.startsWith('flag:'))throw new Error('A flagged list disappears when its flags are cleared. Use Clear instead.');
 return {action,listId,rowId:null,snapshot:JSON.stringify(list),name:list.name,scope:'list'};
}
/** Rows captured when a row menu opened. Acting requires the same list and unchanged target rows. */
export interface WatchRowTarget {listId:string;rowIds:string[];snapshot:string}
export function captureWatchRowTarget(book:WatchBook,rowIds:readonly string[]):WatchRowTarget{
 const list=activeWatchList(book),rows=rowIds.map(id=>list.rows.find(row=>row.id===id));if(!rows.length||rows.some(row=>!row))throw new Error('Select rows in the current list first.');
 return {listId:list.id,rowIds:[...rowIds],snapshot:JSON.stringify(rows)};
}
export function assertWatchRowTarget(book:WatchBook,target:WatchRowTarget):WatchRow[]{
 const list=book.activeId===target.listId?activeWatchList(book):null,rows=list?target.rowIds.map(id=>list.rows.find(row=>row.id===id)):[];
 if(!list||rows.some(row=>!row)||JSON.stringify(rows)!==target.snapshot)throw new WatchStaleError('The list changed while this menu was open. Reopen the menu on the current rows.');
 return rows as WatchRow[];
}
/** Copy selected symbols into another list, then remove them from this custom list, in one validated change. */
export function moveWatchRowsToList(book:WatchBook,fromId:string,toId:string,rowIds:readonly string[],makeId:()=>string):WatchAddResult{
 if(fromId===toId)throw new Error('Choose a different list.');if(fromId.startsWith('flag:'))throw new Error('Symbols are moved out of custom lists only. Use flag actions for flagged lists.');
 const from=watchListById(book,fromId),rows=from.rows.filter(row=>row.kind==='symbol'&&rowIds.includes(row.id));if(!rows.length)throw new Error('Select symbols to move.');
 watchListById(book,toId);// Remove first so a move is net zero against the book-wide row limit; the target's own limit still applies.
 return addWatchMembers(removeWatchRows(book,fromId,rows.map(row=>row.id)),toId,rows.flatMap(row=>row.kind==='symbol'?[row.reference]:[]),makeId);
}
/**
 * Drag several selected rows at once. The moved rows keep their list order and land together before the
 * drop row (null: at the end). Dropping on one of the moved rows changes nothing. A single row, or a selection holding a
 * section heading, keeps the one-row behaviour of moveWatchRow (a heading carries its member block). Order rule:
 * the reference documents dragging but not how a multi-row drop orders its rows.
 */
export function moveWatchRows(book:WatchBook,listId:string,rowIds:readonly string[],before:string|null):WatchBook{
 const list=activeWatchList({...book,activeId:listId}),moving=new Set(rowIds);
 if(!rowIds.length)throw new Error('Select rows to move.');
 for(const id of moving)if(!list.rows.some(row=>row.id===id))throw new Error('Moved row is missing.');
 if(moving.size===1||list.rows.some(row=>row.kind==='section'&&moving.has(row.id)))return moveWatchRow(book,listId,rowIds[0]!,before);
 if(before!==null&&moving.has(before))return book;
 const block=list.rows.filter(row=>moving.has(row.id)),rest=list.rows.filter(row=>!moving.has(row.id)),at=before===null?rest.length:rest.findIndex(row=>row.id===before);
 if(at<0)throw new Error('Target row is missing.');
 rest.splice(at,0,...block);
 return setWatchManualOrder(book,listId,rest.map(row=>row.id));
}
