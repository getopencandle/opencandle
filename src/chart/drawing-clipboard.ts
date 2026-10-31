// DWUTIL COPY/PASTE: the LV in-memory drawing clipboard. Process memory only; the system clipboard and the native clipboard are never used.
// Contract for the router and Duplicate publisher: copy(canonicalRows) snapshots; paste(known, utility?) returns prepared rows with fresh ids,
// the same coordinates and the current toolbar sync stamp, or a refusal. The caller publishes the prepared rows as one owned history step.
import {stampNewRow,type DrawingUtility} from './drawing-utility-state';
type Row=Record<string,unknown>;
/** No symbol conversion; unknown types refuse the whole paste with this text. */
export const PASTE_UNKNOWN_TYPE_MESSAGE='Some copied drawings are not available in this chart and were not pasted.';
export const PASTE_EMPTY_MESSAGE='Nothing to paste.';
/** Same cap as the owned Duplicate route (1 to 128 drawings). */
export const CLIPBOARD_LIMIT=128;
export type PasteResult={ok:true;rows:Row[]}|{ok:false;message:string};
export interface DrawingClipboard{copy:(rows:readonly Row[])=>boolean;paste:(known:(type:string)=>boolean,utility?:DrawingUtility)=>PasteResult;size:()=>number;clear:()=>void}
export function createDrawingClipboard(options:{newId?:()=>string}={}):DrawingClipboard{
 let snapshot:Row[]=[],counter=0;
 const session=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 const newId=options.newId??(()=>'paste-'+session+'-'+(++counter).toString(36));
 return{
  copy(rows){if(!rows.length||rows.length>CLIPBOARD_LIMIT)return false;snapshot=rows.map(row=>structuredClone(row) as Row);return true;},
  paste(known,utility){
   if(!snapshot.length)return{ok:false,message:PASTE_EMPTY_MESSAGE};
   if(snapshot.some(row=>typeof row.type!=='string'||!known(row.type)))return{ok:false,message:PASTE_UNKNOWN_TYPE_MESSAGE};
   const ids=new Set<string>();
   const rows=snapshot.map(row=>{let id=newId();while(ids.has(id))id=newId();ids.add(id);const next=structuredClone(row) as Row;next.id=id;return utility?stampNewRow(next,utility):(delete next.lvSyncScope,next);});
   return{ok:true,rows};
  },
  size:()=>snapshot.length,clear(){snapshot=[];}
 };
}
