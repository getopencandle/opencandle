import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {drainVwap} from '../chart/vwap-indicator-native-harness';
import {createVwapClient} from '../../src/vwap/client';
import {calculateVwapWorkerMessage} from '../../src/vwap/worker-core';
import {createOwnedVwapPrefixSource} from '../../src/chart/vwap-prefix-source';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {heikinAshiBars} from '../../src/chart/calculation-bars';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {VwapWorkerPort} from '../../src/vwap/types';
import type {AnalysisPublicationHost} from '../../src/chart/analysis-publication';
import type {Bar} from '../../src/domain/types';

export const scalarVwapRows=():Bar[]=>[
 {time:1700000040,open:10,high:14,low:6,close:12,volume:1},
 {time:1700000100,open:12,high:20,low:8,close:16,volume:2},
 {time:1700000160,open:16,high:22,low:12,close:18,volume:3},
];
/** Genuine existing adapter owner closure, pinned native core, prefix packer and worker kernel.
 * Only transport scheduling is controlled. This launches no app, browser or worker thread. */
export async function builtinVwapFixture(options:{rows?:Bar[];style?:string}={}){
 const h=await nativeCoreHarness(),dataset=fixtureDataset('GME',3);let rows=(options.rows??scalarVwapRows()).map(row=>({...row})),style=options.style??'candles',epoch={},disposed=false,revision=0;
 h.core.registry.records=h.records;dataset.resolution='1m';dataset.bars=rows;let source=sourceContextForDataset(dataset);
 const text=readFileSync(resolve('src/chart/adapter.ts'),'utf8'),from=text.indexOf('  const analysisPublication:AnalysisPublicationHost='),to=text.indexOf('\n',from);if(from<0)throw Error('Actual private publication owner missing.');
 const code=stripTypeScriptTypes(`function create(input,initialSource,initialStyle){let currentBars=input,currentSource=initialSource,requestedStyle=initialStyle,vwapSourceEpoch={},currentExecutionIdentity='ordinary',disposed=false,analysisUnavailable=null;const unavailable=message=>{analysisUnavailable=message;};${text.slice(from,to)};return{host:analysisPublication,publish(bars,source,style){vwapSourceEpoch={};currentBars=bars;currentSource=source;requestedStyle=style;},unavailable(value){analysisUnavailable=value;},close(){disposed=true;vwapSourceEpoch={};}};}`,{mode:'transform'});
 const owner=new Function(code+';return create;')()(rows,source,style) as {host:AnalysisPublicationHost;publish(bars:readonly Bar[],sourceValue:typeof source,style:string):void;unavailable(value:string|null):void;close():void};
 let publicationObserver=()=>{};
 // Observer hooks cannot grant source authority: each call first checks the actual adapter owner.
 const publication:AnalysisPublicationHost={captureOwner(){const proof=owner.host.captureOwner();return{isCurrent(){const current=proof.isCurrent();if(current)publicationObserver();return current;},quarantine(error){proof.quarantine(error);}};},assertMutable(){owner.host.assertMutable?.();}};
 class Transport implements VwapWorkerPort{
  listeners=new Map<string,Set<(event:any)=>void>>();request:any;terminated=0;
  constructor(){queueMicrotask(()=>this.emit({v:1,type:'ready'}));}
  addEventListener(name:string,callback:(event:any)=>void){const set=this.listeners.get(name)??new Set();set.add(callback);this.listeners.set(name,set);}
  removeEventListener(name:string,callback:(event:any)=>void){this.listeners.get(name)?.delete(callback);}
  postMessage(message:unknown,transfer:Transferable[]){this.request=structuredClone(message,{transfer});}
  terminate(){this.terminated++;}
  emit(data:unknown){for(const callback of this.listeners.get('message')??[])callback({data});}
  finish(){this.emit(calculateVwapWorkerMessage(this.request));}
 }
 const transports:Transport[]=[],client=createVwapClient({factory(){const value=new Transport();transports.push(value);return value;}});
 const prefix=createOwnedVwapPrefixSource({readBasis:()=>({epoch,source,bars:rows,style,executionIdentity:'ordinary',disposed})});
 const sync=()=>{h.core.bars=(style==='heikinashi'?heikinAshiBars(rows):rows).map(row=>({...row,time:row.time*1000}));};sync();
 const port=createIndicatorPort(h.chart,undefined,bars=>style==='heikinashi'?heikinAshiBars(bars):bars.map(row=>({...row})),()=>rows,h.bridge.claim,()=>({resolution:'1m',style}),publication,{capture:()=>prefix.capture(),client:()=>client});
 return{...h,port,owner,prefix,client,transports,get rows(){return rows;},get style(){return style;},
  onPublicationAssert(callback:()=>void){publicationObserver=callback;},
  instance(id:string){const nativeId=port.list().find(row=>row.id===id)?.rendererId;if(!nativeId)throw Error('Synthetic VWAP missing.');return h.instances.get(nativeId)!;},
  retire(){epoch={};owner.publish(rows,source,style);},
  replace(next:Bar[],newStyle=style){epoch={};rows=next.map(row=>({...row}));style=newStyle;dataset.bars=rows;dataset.provenance={...dataset.provenance,revision:'synthetic-vwap-'+(++revision)};source=sourceContextForDataset(dataset);owner.publish(rows,source,style);port.invalidateVwap();sync();port.recompute();},
  enableActualVisibility(id:string){const nativeId=port.list().find(row=>row.id===id)!.rendererId,record=h.records.get(nativeId),handle=h.core.handles.get(nativeId);record.native.started=true;handle.setVisibleState=()=>{};handle.setVisible=(visible:boolean)=>h.core.setVisible(nativeId,visible);},
  async finish(){await drainVwap();const worker=transports.find(value=>value.request&&!value.terminated);if(!worker)throw Error('No current synthetic transport.');worker.finish();await port.waitForVwap();},
  dispose(){const errors:unknown[]=[];try{port.dispose();}catch(error){errors.push(error);}disposed=true;prefix.dispose();owner.close();try{client.dispose();}catch(error){errors.push(error);}h.dispose();if(errors.length)throw new AggregateError(errors,'Synthetic VWAP cleanup failed.');},
 };
}
