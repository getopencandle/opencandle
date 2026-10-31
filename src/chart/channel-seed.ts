// The channel level defaults are written into the CANONICAL drawing document, never into the
// native store (a vela ParallelChannel keeps no props, so a native update is dropped on the next capture). The write follows the native placement merge
// inside the same atomic reconciliation and records no history of its own, so the placement stays one undo step and the member is part of every save.
import type {SerializedDrawing} from '@luxalgo/vela';
import type {LosslessDrawingDocument} from './contracts';
import {seedNewChannel} from './channel-levels-data';

/** Seeds the listed ids (parallel channels still on the legacy member only). Returns true when a row changed. Call inside document.atomic. */
export function applyChannelSeeds(document:LosslessDrawingDocument,ids:ReadonlySet<string>,knownTypes:ReadonlySet<string>,retained:ReadonlySet<string>):boolean{
 if(!ids.size)return false;
 const rows=document.all();let changed=false;
 const next=rows.map(row=>{
  if(!ids.has(String(row.id))||row.type!=='parallelchannel'||retained.has(String(row.id)))return row;
  const seeded=seedNewChannel(row as unknown as SerializedDrawing) as unknown as Record<string,unknown>;
  if(seeded.props!==row.props&&JSON.stringify(seeded.props)!==JSON.stringify(row.props)){changed=true;return seeded;}
  return row;
 });
 if(!changed)return false;
 document.mergeRenderable(next.filter(row=>knownTypes.has(String(row.type))&&!retained.has(String(row.id))),knownTypes,false,retained);
 return true;
}
