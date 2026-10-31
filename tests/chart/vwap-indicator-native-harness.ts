import {createVwapClient} from '../../src/vwap/client';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import type {VwapWorkerPort,VwapClient} from '../../src/vwap/types';
import {createOwnedVwapPrefixSource} from '../../src/chart/vwap-prefix-source';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import type {Bar} from '../../src/domain/types';
import {nativeCoreHarness} from './native-core-harness';

export const syntheticVwapRows=(count=3):Bar[]=>Array.from({length:count},(_,index)=>({time:1700000000+index*60,open:10+index,high:12+index,low:9+index,close:11+index,volume:index+1}));
export const drainVwap=async()=>{for(let index=0;index<64;index++)await Promise.resolve();};
/** Genuine client leases, original worker kernel and original pinned native core/render bodies.
 * Transport is controlled; this is not browser/worker-thread/latency evidence. */
export async function vwapIndicatorNativeHarness(initial:Bar[]=syntheticVwapRows(),providedClient?:VwapClient){
 const h=await nativeCoreHarness();let epoch={},rows=initial.map(row=>({...row})),style='candles',resolution='1m',disposed=false;
 // The real pinned IndicatorRegistry owns this Map; the shared reduced harness omits it.
 h.core.registry.records=h.records;
 const source={},ports:ControlledVwapWorker[]=[],quarantines:unknown[]=[];let publicationAssert=()=>{};
 class ControlledVwapWorker implements VwapWorkerPort{
  listeners=new Map<string,Set<(event:any)=>void>>();request:any;terminated=0;
  constructor(){queueMicrotask(()=>this.emit({v:1,type:'ready'}));}
  addEventListener(name:string,callback:(event:any)=>void){const set=this.listeners.get(name)??new Set();set.add(callback);this.listeners.set(name,set);}
  removeEventListener(name:string,callback:(event:any)=>void){this.listeners.get(name)?.delete(callback);}
  postMessage(message:unknown,transfer:Transferable[]){this.request=structuredClone(message,{transfer});}
  terminate(){this.terminated++;}
  emit(data:unknown){for(const callback of this.listeners.get('message')??[])callback({data});}
  finish(){this.emit(calculateVwapWorkerMessage(this.request));}
 }
 const client=providedClient??createVwapClient({factory(){const worker=new ControlledVwapWorker();ports.push(worker);return worker;}});
 const prefix=createOwnedVwapPrefixSource({readBasis:()=>({epoch,source,bars:rows,style,executionIdentity:'SYNTHETIC:'+rows.length,disposed})});
 const sync=()=>{h.core.bars=rows.map(row=>({...row,time:row.time*1000}));};sync();
 const publication={captureOwner(){const captured=epoch;return{isCurrent:()=>{const current=!disposed&&captured===epoch;publicationAssert();return current;},quarantine(error:unknown){quarantines.push(error);}};}};
 const port=createIndicatorPort(h.chart,undefined,undefined,()=>rows,h.bridge.claim,()=>({resolution}),publication,{capture:()=>prefix.capture(),client:()=>client});
 function enableActualVisibility(id:string){const record=h.records.get(id),handle=h.core.handles.get(id);record.native.started=true;handle.setVisibleState=()=>{};handle.setVisible=(visible:boolean)=>h.core.setVisible(id,visible);}
 return{...h,port,ports,client,prefix,quarantines,enableActualVisibility,onPublicationAssert(callback:()=>void){publicationAssert=callback;},retire(){epoch={};},setResolution(value:string){epoch={};port.invalidateVwap();resolution=value;port.recompute();},setStyle(value:string){epoch={};port.invalidateVwap();style=value;port.recompute();},replace(next:Bar[]){epoch={};port.invalidateVwap();rows=next.map(row=>({...row}));sync();port.recompute();},async finish(){await drainVwap();const worker=ports.find(worker=>worker.request&&!worker.terminated);if(!worker)throw Error('No active synthetic VWAP transport.');worker.finish();await port.waitForVwap();},dispose(){const errors:unknown[]=[];try{port.dispose();}catch(error){errors.push(error);}disposed=true;prefix.dispose();try{client.dispose();}catch(error){errors.push(error);}h.dispose();if(errors.length)throw new AggregateError(errors,'Synthetic VWAP harness cleanup failed.');}};
}
