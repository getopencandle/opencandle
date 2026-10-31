import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {calculationBarsForStyle} from '../../src/chart/calculation-bars';
import {isDerivedStyle} from '../../src/chart/derived/common';
import type {Bar} from '../../src/domain/types';
import {AlpacaLiveProvider,type AlpacaBridge,type AlpacaBarsValue} from '../../src/domain/alpaca-live';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {sourceContextForDataset,sameChartSourceBasis,type ChartSourceContext} from '../../src/chart/source-context';
import {isLiveInputIdentity} from '../../src/chart/bar-input-identity';
import {createCalculationBarCache} from '../../src/chart/calculation-bars';

/** The actual private adapter cache and standard/HA branch, with controlled source epochs.
 * No SDK/renderer replacement, source permission, native publication or GUI claim. */
function actualCache(){
 const text=readFileSync(resolve(process.env.LV_SHARED_FEED_SOURCE_ROOT??'.','src/chart/adapter.ts'),'utf8').replace(/\r\n/g,'\n');
 const start=text.indexOf('  const feedRowsMemo='),end=text.indexOf('  /** Rows pushed to vela',start),derived=text.indexOf('  const derivedFeedRows=',end),derivedEnd=text.indexOf('  /** Renderer feed:',derived);
 if(start<0||end<0||derived<0||derivedEnd<0)throw Error('The actual adapter cache/standard calculation block is missing.');
 const source=`function build(injected){const {calculationBarsForStyle,isDerivedStyle}=injected;let requestedStyle='candles',vwapSourceEpoch={};${text.slice(start,end)}${text.slice(derived,derivedEnd)}return {read:sharedFeedRows,epoch(){vwapSourceEpoch={};},style(value){requestedStyle=value;vwapSourceEpoch={};},header:()=>lastFeedRows,peek:raw=>feedRowsMemo.get(raw)};}`;
 const build=Function(stripTypeScriptTypes(source,{mode:'transform'})+';return build;')();
 return build({calculationBarsForStyle,isDerivedStyle}) as {read(raw:readonly Bar[]):Bar[];epoch():void;style(value:string):void;header():{raw:readonly Bar[];style:string;epoch:object;rows:Bar[]}|null;peek(raw:readonly Bar[]):unknown};
}
const row=(index:number,close:number,volume=1):Bar=>({time:1700000000+index*60,open:close,high:close+2,low:close-2,close,volume});
const closes=(rows:readonly Bar[])=>rows.map(value=>value.close);

/** Real producer snapshots; all prices are invented and every transport method is local. */
async function genuineLive(){
 const now=Date.parse('2024-03-11T20:00:00Z'),start=Date.parse('2024-03-11T13:30:00Z')/1000;
 const initial=[10,20,30].map((price,index)=>({...row(index,price),time:start+index*900}));
 const bridge={fetchAlpacaBars:async(request:Parameters<AlpacaBridge['fetchAlpacaBars']>[0])=>{
  const url=new URL('https://data.alpaca.markets/v2/stocks/'+request.symbol+'/bars');for(const [key,value]of Object.entries({timeframe:request.timeframe,start:new Date(request.start*1000).toISOString(),end:new Date(request.end*1000).toISOString(),feed:request.feed,adjustment:request.adjustment}))url.searchParams.set(key,String(value));
  const value:AlpacaBarsValue={schemaVersion:1,symbol:request.symbol,timeframe:request.timeframe,seconds:request.timeframe==='1Min'?60:900,feed:request.feed,bars:initial.filter(bar=>bar.time>=request.start&&bar.time<=request.end).map(bar=>({...bar})),nextPageToken:null,provenance:{provider:'SYNTHETIC local bridge',kind:'owner-key',feed:request.feed,delaySeconds:0,sourceUrl:url.href,retrievedAt:'2024-03-11T20:00:00Z',bytes:0,license:'Invented prices; no network or keys'}};
  return {ok:true,value};
 },subscribeAlpaca:async()=>({ok:true,value:{schemaVersion:1,state:'ready',symbols:['SYNTH'],attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}}}),unsubscribeAlpaca:async()=>({ok:true,value:null}),onAlpacaEvent:()=>()=>{}} as unknown as AlpacaBridge;
 const provider=new AlpacaLiveProvider(bridge,{now:()=>now,plan:'paid'}),handle=provider.open('SYNTH','15m');
 const flush=async()=>{for(let turn=0;turn<40;turn++)await Promise.resolve();};await flush();
 return {provider,handle,view:()=>cellSessionDataset(handle.dataset(),{session:'regular'}),flush,dispose(){handle.close();provider.dispose();}};
}

/** Actual write and growth classification with controlled native arrays; no native acceptance claim. */
function actualWrite(initial:ReturnType<typeof sourceContextForDataset>,bars:Bar[]){
 const text=readFileSync(resolve(process.env.LV_SHARED_FEED_SOURCE_ROOT??'.','src/chart/adapter.ts'),'utf8').replace(/\r\n/g,'\n');
 const slice=(from:string,to:string)=>{const a=text.indexOf(from),b=text.indexOf(to,a);if(a<0||b<0)throw Error('Actual write boundary missing: '+from);return text.slice(a,b);};
 const write=slice('  const writeMarketInput=','  // Declared after writeMarketInput'),growth=slice('  const sameBarValues=','  const marketAppliedSubscribers='),publication=text.split('\n').find(line=>line.includes('const analysisPublication:AnalysisPublicationHost=')),retire=text.split('\n').find(line=>line.includes('const retireVwapSource='));
 if(!publication||!retire)throw Error('Actual publication/retirement body missing.');
 const source=`function build(injected){const {initial,bars,isDerivedStyle,isLiveInputIdentity,sameChartSourceBasis,createCalculationBarCache}=injected;let currentBars=bars.map(bar=>({...bar})),currentSource=initial,requestedStyle='candles',disposed=false,vwapSourceEpoch={},currentExecutionIdentity='ordinary',analysisUnavailable='',marketUpdating=false,calculationBarCache=createCalculationBarCache(),derivedMemo=null,livePlan=null,lastCrosshair=null;
 const native=bars.map(bar=>({...bar,time:bar.time*1000})),chart={orchestrator:{rawBars:native,bars:native,renderer:{bars:[...native]},barTransform:null,applyBar(){}},getVisibleRange:()=>({from:1,to:2})};
 const indicators={invalidateVwap(){}},scripts={invalidateResults(){}},publishDerivedPayload=()=>{},retireStatisticsSource=()=>{},queueInlineRefresh=()=>{},unavailable=message=>{throw Error(message);};${retire}${publication}${growth}${write}
 return {write:writeMarketInput,read:()=>({source:currentSource,bars:currentBars,plan:livePlan,crosshair:lastCrosshair}),owner:()=>analysisPublication.captureOwner()};}`;
 const build=Function(stripTypeScriptTypes(source,{mode:'transform'})+';return build;')();
 return build({initial,bars,isDerivedStyle,isLiveInputIdentity,sameChartSourceBasis,createCalculationBarCache}) as {write(input:{bars:Bar[];source:ChartSourceContext}):void;read():{source:ChartSourceContext;bars:Bar[];plan:{kind:string};crosshair:unknown};owner():{isCurrent():boolean}};
}

describe('actual standard calculation cache follows accepted write generations',()=>{
 it('updates a replaced tail in the same grown source array instead of returning old prices',()=>{
  const cache=actualCache(),raw=[row(0,10),row(1,20),row(2,30)],first=cache.read(raw);
  raw[2]=row(2,40);cache.epoch();const next=cache.read(raw);
  expect(closes(next)).toEqual([10,20,40]);expect(next).not.toBe(first);expect(next[0]).toBe(first[0]);expect(next[1]).toBe(first[1]);
 });
 it('appends the actual new rows while preserving the unchanged computed prefix',()=>{
  const cache=actualCache(),raw=[row(0,10),row(1,20),row(2,30)],first=cache.read(raw);
  raw.push(row(3,40),row(4,50));cache.epoch();const next=cache.read(raw);
  expect(closes(next)).toEqual([10,20,30,40,50]);expect(next.slice(0,3)).toEqual(first);expect(next[0]).toBe(first[0]);expect(next[2]).toBe(first[2]);
 });
 it('invalidates a same-count historical correction even when its final raw object is unchanged',()=>{
  const cache=actualCache(),raw=[row(0,10),row(1,20),row(2,30)],tail=raw[2],first=cache.read(raw);
  raw[0]=row(0,12);cache.epoch();const next=cache.read(raw);
  expect(raw[2]).toBe(tail);expect(closes(next)).toEqual([12,20,30]);expect(next).not.toBe(first);expect(first[0].close).toBe(10);
 });
 it('uses Object.is for missing volume and signed zero in aliased prefix comparisons',()=>{
  const cache=actualCache(),raw=[row(0,10,NaN),row(1,20,0),row(2,30)],first=cache.read(raw);
  raw[1]=row(1,20,-0);cache.epoch();const next=cache.read(raw);
  expect(next[0]).toBe(first[0]);expect(Number.isNaN(next[0].volume)).toBe(true);expect(Object.is(next[1].volume,-0)).toBe(true);expect(Object.is(first[1].volume,0)).toBe(true);
 });
 it('preserves the different-array reference-prefix reuse contract',()=>{
  const cache=actualCache(),raw=[row(0,10),row(1,20),row(2,30)],first=cache.read(raw),replacement=[raw[0],raw[1],row(2,40)];
  cache.epoch();const next=cache.read(replacement);
  expect(closes(next)).toEqual([10,20,40]);expect(next[0]).toBe(first[0]);expect(next[1]).toBe(first[1]);expect(next[2]).not.toBe(first[2]);expect(cache.read(replacement)).toBe(next);
 });
 it('rebuilds HA once for a changed generation and reuses that current generation afterward',()=>{
  const cache=actualCache(),raw=[row(0,10),row(1,20),row(2,30)];cache.style('heikinashi');const first=cache.read(raw);
  raw[2]=row(2,40);cache.epoch();const next=cache.read(raw);
  expect(next[2].close).toBe(40);expect(first[2].close).toBe(30);expect(next[0]).not.toBe(first[0]);expect(cache.read(raw)).toBe(next);
 });
 it('does not overwrite the newer source/style cache installed by a calculation callback',()=>{
  const cache=actualCache(),a=[row(0,10),row(1,20),row(2,30)],b=[row(0,100),row(1,200),row(2,300)];cache.read(a);cache.epoch();
  let once=true,current:Bar[]|undefined;const changed=row(2,40);
  Object.defineProperty(changed,'close',{enumerable:true,configurable:true,get(){if(once){once=false;cache.style('bars');current=cache.read(b);}return 40;}});a[2]=changed;
  cache.read(a);
  expect(once).toBe(false);expect(closes(current!)).toEqual([100,200,300]);expect(cache.header()?.raw).toBe(b);expect(cache.header()?.style).toBe('bars');expect(cache.read(b)).toBe(current);
 });
 it('adopts the actual fresh producer context even when a live grow serializes exactly like the prior context',async()=>{
  const p=await genuineLive();try{const a=p.view(),contextA=sourceContextForDataset(a),f=actualWrite(contextA,a.bars),owned=f.read().bars;
   p.provider.receive({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'SYNTH',time:Date.parse('2024-03-11T14:14:30Z')/1000,price:40,high:40,low:40,size:1}],receivedAt:''});await p.flush();
   const b=p.view(),contextB=sourceContextForDataset(b);expect(contextB).not.toBe(contextA);expect(JSON.stringify(contextB)).toBe(JSON.stringify(contextA));expect(b.bars.at(-1)?.close).toBe(40);
   f.write({bars:b.bars.map(bar=>({...bar})),source:contextB});expect(f.read().bars).toBe(owned);expect(f.read().plan.kind).toBe('grow');expect(f.read().bars.at(-1)?.close).toBe(40);expect(f.read().source).toBe(contextB);
  }finally{p.dispose();}
 });
 it('retires an actual prior source publication owner while preserving grow and viewport classification',async()=>{
  const p=await genuineLive();try{const a=p.view(),contextA=sourceContextForDataset(a),f=actualWrite(contextA,a.bars),owner=f.owner();
   p.provider.receive({schemaVersion:1,kind:'batch',bars:[],trades:[{symbol:'SYNTH',time:Date.parse('2024-03-11T14:14:30Z')/1000,price:40,high:40,low:40,size:1}],receivedAt:''});await p.flush();const b=p.view(),contextB=sourceContextForDataset(b);
   f.write({bars:b.bars.map(bar=>({...bar})),source:contextB});expect(owner.isCurrent()).toBe(false);expect(f.owner().isCurrent()).toBe(true);expect(f.read().source).toBe(contextB);expect(f.read().plan.kind).toBe('grow');
  }finally{p.dispose();}
 });
});
