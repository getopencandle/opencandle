// Live preview of the drawing settings dialog on the chart.
// A preview is painted in place of the stored drawing on the renderer copy only (through the visibility projection), the
// same boundary as the Hide/Lock overlays: canonical rows, the saved document, undo and the workspace never see it.
// Cancel (or closing the dialog any other way) clears it; Apply clears it and commits the same values through the normal edit.
import type {SerializedDrawing} from '@luxalgo/vela';
import type {Bar} from '../domain/types';
import {patchDrawingEdit,type DrawingCoordinateContext,type DrawingCoordinatePatch} from './drawing-port';

/** Chart controller members the settings dialog uses for the live preview (optional: without them it previews nothing). */
export interface DrawingPreviewPort{
 previewDrawingEdit(id:string,patch:Record<string,unknown>,coordinates?:readonly DrawingCoordinatePatch[],priceOffset?:number):void;
 clearDrawingPreview(id:string):void;
}
/** The record members a preview may replace. Identity, pane, z order and the LV metadata always come from the stored row. */
export const DRAWING_PREVIEW_MEMBERS=Object.freeze(['anchors','style','text','props'] as const);
type Row=Record<string,unknown>;
export interface DrawingPreviewHost{
 /** Canonical rows (the document the dialog edits). */
 read:()=>readonly Row[];
 bars:()=>readonly Bar[];
 context?:()=>DrawingCoordinateContext|undefined;
 /** Re-project the renderer copy after the preview set changed. */
 changed:()=>void;
}
export function createDrawingPreview(host:DrawingPreviewHost){
 const previews=new Map<string,Row>();
 return{
  /** Show the draft (the same patch Apply would send). Throws for an invalid draft and keeps the previous preview. */
  show(id:string,patch:Record<string,unknown>,coordinates?:readonly DrawingCoordinatePatch[],priceOffset?:number):void{
   const record=host.read().find(row=>String(row.id)===id);if(!record)throw Error('Drawing not found: '+id);
   const next=patchDrawingEdit(record as unknown as SerializedDrawing,host.bars(),patch,coordinates,priceOffset,host.context?.()) as unknown as Row;
   if(next===record){if(previews.delete(id))host.changed();return;}
   const members:Row={};for(const key of DRAWING_PREVIEW_MEMBERS)if(Object.hasOwn(next,key))members[key]=structuredClone(next[key]);
   previews.set(id,members);host.changed();
  },
  clear(id:string):void{if(previews.delete(id))host.changed();},
  clearAll():void{if(!previews.size)return;previews.clear();host.changed();},
  has:(id:string)=>previews.has(id),
  /** The row the renderer paints: the stored row with the preview members laid over it. */
  apply<T extends Row>(row:T):T{const preview=previews.get(String(row.id));return preview?{...row,...structuredClone(preview)}:row;},
 };
}
export type DrawingPreview=ReturnType<typeof createDrawingPreview>;
