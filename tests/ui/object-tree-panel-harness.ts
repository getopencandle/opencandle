import {vi} from 'vitest';
import {createDrawing,DrawingsControl,type SerializedDrawing} from '@luxalgo/vela';
import {createDrawingManager,type DrawingManagerHost} from '../../src/chart/drawing-manager';
import {nativeDrawingHarness} from '../chart/drawing-native-harness';
import {realChart} from './indicator-real-port-harness';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import type {IndicatorId} from '../../src/domain/indicators';

// OTDW harness (SYNTHETIC): the ACTUAL drawing-manager port (src/chart/drawing-manager.ts) over
// the ACTUAL native Vela DrawingController wrapped by the package's own DrawingsControl facade
// (the value chart.drawings returns), plus the ACTUAL indicator port (L1 minimal native host).
// The document host is minimal: it keeps the manager document and copies native z-order, lock
// and visibility back after each change, as the adapter's drawing:edited reconciliation does.
// Component-handler evidence only; no DOM, packaged GUI, focus or reference comparison.
export interface HookStore {cells:any[];cursor:number;effects:Array<()=>unknown>}
export const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
export function findAll(tree:any,predicate:(node:any)=>boolean):any[]{const out:any[]=[];const visit=(node:any)=>{if(Array.isArray(node))return node.forEach(visit);if(!node?.props)return;if(predicate(node))out.push(node);visit(node.props.children);};visit(tree);return out;}
export function find(tree:any,predicate:(node:any)=>boolean):any{const found=findAll(tree,predicate)[0];if(!found)throw new Error('Handler target missing');return found;}
export const event=(extra:Record<string,unknown>={})=>({preventDefault:vi.fn(),stopPropagation:vi.fn(),ctrlKey:false,metaKey:false,shiftKey:false,clientX:10,clientY:20,...extra});

export const drawingRecord=(id:string,price:number):SerializedDrawing=>createDrawing('trendline',{id,paneId:'price',anchors:[{time:1000000,price},{time:1240000,price:price+10}],style:{lineColor:'#123456',lineWidth:2,lineStyle:'solid'}})!.serialize();

export async function objectTreeHarness(options:{drawings?:string[];indicators?:IndicatorId[]}={}){
 const native=await nativeDrawingHarness(),facade=new DrawingsControl(native.controller as never);
 const initial=(options.drawings??['line-a','line-b','line-c']).map((id,index)=>drawingRecord(id,100+index*10));
 native.controller.fromJSON({version:1,drawings:initial});
 const nativeRows=()=>(facade.toJSON() as {drawings:SerializedDrawing[]}).drawings;
 let doc:Record<string,unknown>={version:1,drawings:nativeRows().map(row=>structuredClone(row))};
 const subscribers=new Set<()=>void>(),calls:string[]=[];let retired=false;
 const reconcile=()=>{const live=new Map(nativeRows().map(row=>[row.id,row]));doc={...doc,drawings:(doc.drawings as Record<string,unknown>[]).filter(row=>live.has(String(row.id))).map(row=>{const now=live.get(String(row.id))!;return {...row,zIndex:now.zIndex,locked:now.locked,visible:now.visible};})};};
 const host:DrawingManagerHost={
  read:()=>doc,write:next=>{doc=structuredClone(next);},known:type=>type==='trendline',
  update:rows=>{calls.push('update:'+rows.map(row=>row.id).join(','));facade.updateMany(rows as never);},
  remove:ids=>{calls.push('remove:'+ids.join(','));facade.removeMany(ids);},
  select:ids=>{calls.push('select:'+ids.join(','));facade.select(ids);},
  front:id=>{calls.push('front:'+id);facade.bringToFront(id);},back:id=>{calls.push('back:'+id);facade.sendToBack(id);},
  transaction:operation=>operation(),changed:()=>{reconcile();for(const callback of [...subscribers])callback();},
 };
 const manager=createDrawingManager(host),indicators=realChart();
 const ids=(options.indicators??[]).map(kind=>indicators.port.add(kind,factoryIndicatorDefault(kind).inputs,factoryIndicatorDefault(kind)));
 const chart={
  drawingManager:manager,
  captureDrawingManagerOwner:()=>{const assert=()=>{if(retired)throw Error('SYNTHETIC drawing manager source changed.');};assert();return assert;},
  onDrawingsChanged:(callback:()=>void)=>{subscribers.add(callback);return()=>{subscribers.delete(callback);};},
  onDrawingSelection:(callback:(ids:string[])=>void)=>native.on('drawing:selected',({ids}:{ids:string[]})=>callback(ids)),
  drawings:facade,indicators:indicators.port,chart:indicators.host.chart,
  drawingCatalog:()=>[{type:'trendline',label:'Trend Line'}],
  duplicateDrawings:vi.fn((list:readonly string[])=>{calls.push('duplicate:'+list.join(','));return {accepted:true};}),
 };
 return {native,facade,manager,chart,indicators,ids,calls,doc:()=>doc,nativeRows,retire:()=>{retired=true;},dispose:()=>native.dispose()};
}
