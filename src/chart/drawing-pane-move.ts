import type {DrawingPaneBinding} from './drawing-document-bindings';

/** A drawing's More > Move to submenu: "Existing pane above" and
 * "Existing pane below", the adjacent panes in top-to-bottom order; a row with no pane there is left out.
 * The move keeps every anchor (time and value) and changes only the pane and its portable binding; the
 * caller's change notification records the one undo step. Pure apart from the given host. */
export interface DrawingMoveTargets {above:string|null;below:string|null}
export function drawingMoveTargets(paneOrder:readonly string[],current:string):DrawingMoveTargets{
 const at=paneOrder.indexOf(current);if(at<0)return{above:null,below:null};
 return{above:at>0?paneOrder[at-1]:null,below:at<paneOrder.length-1?paneOrder[at+1]:null};
}
type Row=Record<string,unknown>;
export function moveDrawingRows(document:Row,ids:readonly string[],paneId:string,binding:DrawingPaneBinding):Row{
 const rows=Array.isArray(document.drawings)?document.drawings as Row[]:null;
 if(!rows||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!rows.some(row=>row.id===id)))throw new Error('Select drawings on this chart to move.');
 if(ids.some(id=>rows.find(row=>row.id===id)?.locked===true))throw new Error('Unlock the drawing before moving it to another pane.');
 return{...document,drawings:rows.map(row=>{if(!ids.includes(String(row.id)))return row;const next:Row={...row,paneId,lvPaneBinding:structuredClone(binding)};delete next.lvPaneOwners;delete next.lvLogicalPaneId;return next;})};
}
export function commitDrawingPaneMove(host:{read:()=>Row;write:(document:Row)=>void;project:()=>void;notify:()=>void},ids:readonly string[],paneId:string,binding:DrawingPaneBinding):boolean{
 const previous=host.read(),next=moveDrawingRows(previous,ids,paneId,binding);if(JSON.stringify(previous)===JSON.stringify(next))return false;
 try{host.write(next);host.project();}catch(error){host.write(previous);try{host.project();}catch(rollback){throw new AggregateError([error,rollback],'Drawing pane move rollback failed');}throw error;}
 host.notify();return true;
}
