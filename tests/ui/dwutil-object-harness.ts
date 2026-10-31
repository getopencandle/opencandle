import {createDrawing,DrawingsControl,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingManager,type DrawingManagerHost} from '../../src/chart/drawing-manager';
import {createDrawingTemplateBatches} from '../../src/chart/drawing-template-batch';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';

// object evidence harness (SYNTHETIC): the ACTUAL drawing-manager port over the ACTUAL
// native Vela DrawingController behind the package's own DrawingsControl facade, with a
// workspace history that records the previous document once per accepted change, the way the
// app records one step per onDrawingsChanged. Component-level evidence only; no DOM or GUI claim.
export const dwRecord=(id:string,price:number,type:'trendline'|'hline'|'box'|'text'='trendline',extra:Record<string,unknown>={}):SerializedDrawing=>createDrawing(type as never,{id,paneId:'price',anchors:[{time:1000000,price},{time:1240000,price:price+10}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'},...extra} as never)!.serialize();

export async function dwutilObjectFixture(options:{ids?:string[];types?:Record<string,'trendline'|'hline'|'box'|'text'>}={}){
 const native=await nativeDrawingHarness(),facade=new DrawingsControl(native.controller as never);
 const ids=options.ids??['line-a','line-b','line-c'];
 native.controller.fromJSON({version:1,drawings:ids.map((id,index)=>dwRecord(id,100+index*10,options.types?.[id]??'trendline'))});
 const nativeRows=()=>(facade.toJSON() as {drawings:SerializedDrawing[]}).drawings;
 const lossless=new LosslessDrawingDocument();lossless.load({version:1,drawings:nativeRows().map(row=>structuredClone(row))});
 let doc:Record<string,unknown>=lossless.serialize();
 const subscribers=new Set<()=>void>(),calls:string[]=[];let transactions=0,changes=0;
 const reconcile=()=>{const live=new Map(nativeRows().map(row=>[row.id,row]));doc={...doc,drawings:(doc.drawings as Record<string,unknown>[]).filter(row=>live.has(String(row.id))||!['trendline','hline','box','text'].includes(String(row.type))).map(row=>{const now=live.get(String(row.id));return now?{...row,zIndex:now.zIndex,locked:now.locked,visible:now.visible}:row;})};};
 const host:DrawingManagerHost={
  read:()=>doc,write:next=>{doc=structuredClone(next);},known:type=>['trendline','hline','box','text'].includes(type),
  update:rows=>{calls.push('update:'+rows.map(row=>row.id).join(','));facade.updateMany(rows as never);},
  remove:list=>{calls.push('remove:'+list.join(','));facade.removeMany(list);},
  select:list=>{calls.push('select:'+list.join(','));facade.select(list);},
  front:id=>{calls.push('front:'+id);facade.bringToFront(id);},back:id=>{calls.push('back:'+id);facade.sendToBack(id);},
  transaction:operation=>{transactions++;return operation();},changed:()=>{changes++;reconcile();for(const callback of [...subscribers])callback();},
 };
 reconcile();// baseline: native z, lock and visibility are copied once so later steps compare cleanly
 const manager=createDrawingManager(host);
 // Workspace history as the app records it: one previous-document record per accepted change.
 const history=createWorkspaceHistory<{drawings:Record<string,unknown>}>();let workspace={drawings:structuredClone(doc)};
 const record=()=>{const next={drawings:structuredClone(doc)};if(JSON.stringify(next)===JSON.stringify(workspace))return;history.prepareRecord(workspace,null).commit();workspace=next;};
 subscribers.add(record);
 const restore=(entry:{drawings:Record<string,unknown>}|null)=>{if(!entry)throw Error('SYNTHETIC history is empty');doc=structuredClone(entry.drawings);workspace={drawings:structuredClone(doc)};native.controller.fromJSON({version:1,drawings:(doc.drawings as SerializedDrawing[]).filter(row=>host.known(String(row.type)))});};
 const api={
  native,facade,manager,host,calls,nativeRows,doc:()=>doc,rows:()=>doc.drawings as Record<string,unknown>[],
  row:(id:string)=>(doc.drawings as Record<string,unknown>[]).find(row=>row.id===id)!,
  json:(value:unknown)=>JSON.stringify(value),
  history,steps:()=>history.status().undo,transactions:()=>transactions,changes:()=>changes,
  undo(){restore(history.undo(workspace,null)?.workspace??null);},
  redo(){restore(history.redo(workspace,null)?.workspace??null);},
  /** A save then restore keeps the value: serialize, reload through the lossless document, compare. */
  saved(){const saved=new LosslessDrawingDocument();saved.load(JSON.parse(JSON.stringify(doc)));return saved.all();},
  subscribe:(callback:()=>void)=>{subscribers.add(callback);return()=>{subscribers.delete(callback);};},
  dispose:()=>native.dispose(),
 };
 return api;
}
export type DwutilObjectFixture=Awaited<ReturnType<typeof dwutilObjectFixture>>;
