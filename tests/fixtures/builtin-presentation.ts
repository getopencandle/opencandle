import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {heikinAshiBars} from '../../src/chart/calculation-bars';
import type {Bar} from '../../src/domain/types';
import type {AnalysisPublicationHost} from '../../src/chart/analysis-publication';
export const builtinRows=():Bar[]=>[100,160,400,700].map((time,index)=>{const close=[3,9,6,12][index];return{time,open:close-2,high:close+1,low:close-3,close,volume:10*(index+1)};});
/** Actual existing adapter publication closure; no DOM/app/global registrars or source metadata authority. */
function publication(input:readonly Bar[],initialSource:ReturnType<typeof sourceContextForDataset>,initialStyle:string){
 const text=readFileSync(resolve('src/chart/adapter.ts'),'utf8'),from=text.indexOf('  const analysisPublication:AnalysisPublicationHost='),to=text.indexOf('\n',from);if(from<0)throw Error('Actual publication owner missing.');
 const code=stripTypeScriptTypes(`function create(input,initialSource,initialStyle){let currentBars=input,currentSource=initialSource,requestedStyle=initialStyle,vwapSourceEpoch={},currentExecutionIdentity='ordinary',disposed=false,analysisUnavailable=null;const unavailable=message=>{analysisUnavailable=message;};${text.slice(from,to)};return{host:analysisPublication,publish(bars,source,style){vwapSourceEpoch={};currentBars=bars;currentSource=source;requestedStyle=style;},unavailable(value){analysisUnavailable=value;},execution(value){vwapSourceEpoch={};currentExecutionIdentity=value;},close(){disposed=true;vwapSourceEpoch={};}};}`,{mode:'transform'});
 return new Function(code+';return create;')()(input,initialSource,initialStyle) as {host:AnalysisPublicationHost;publish(bars:readonly Bar[],source:typeof initialSource,style:string):void;unavailable(value:string|null):void;execution(value:string):void;close():void};
}
export async function builtinPresentationFixture(options:{style?:string;host?:boolean;rows?:Bar[]}={}){
 const h=await nativeCoreHarness(),dataset=fixtureDataset('GME',4);let rows=options.rows??builtinRows(),style=options.style??'candles';dataset.resolution='1m';dataset.bars=rows;let source=sourceContextForDataset(dataset),revision=0;
 // The existing pinned-core harness uses this exact Map through registry.get; expose its canonical data field too.
 Object.defineProperty(h.core.registry,'records',{value:h.records,configurable:true});
 h.core.bars=(style==='heikinashi'?heikinAshiBars(rows):rows).map(row=>({...row,time:row.time*1000}));const owner=publication(rows,source,style);
 const port=createIndicatorPort(h.chart,undefined,bars=>style==='heikinashi'?heikinAshiBars(bars):bars.map(row=>({...row})),()=>rows,h.bridge.claim,()=>({resolution:'1m',style}),options.host===false?undefined:owner.host);
 return{...h,port,owner,get rows(){return rows;},get source(){return source;},get style(){return style;},
  instance(id:string){const rendererId=port.list().find(row=>row.id===id)?.rendererId;if(!rendererId)throw Error('Synthetic study missing.');return h.instances.get(rendererId)!;},
  publish(next:Bar[],newStyle=style){rows=next;style=newStyle;dataset.bars=rows;dataset.provenance={...dataset.provenance,revision:'synthetic-'+(++revision)};source=sourceContextForDataset(dataset);owner.publish(rows,source,style);h.core.bars=(style==='heikinashi'?heikinAshiBars(rows):rows).map(row=>({...row,time:row.time*1000}));for(const model of [...h.instances.values()])model.onBars();},
  prefix(next:Bar[],count:number){rows=next;dataset.bars=rows;dataset.provenance={...dataset.provenance,revision:'synthetic-prefix-'+(++revision)};source=sourceContextForDataset(dataset);owner.publish(rows,source,style);const native=style==='heikinashi'?heikinAshiBars(rows):rows;h.core.bars=native.slice(0,count).map(row=>({...row,time:row.time*1000}));for(const model of [...h.instances.values()])model.onBars();},
  dispose(){try{port.dispose();}finally{owner.close();h.dispose();}},
 };
}
