import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createMarketQueue} from '../../src/chart/market-queue';
import {sourceContextForInput,sameChartSourceBasis} from '../../src/chart/source-context';
import {barInputIdentity,isLiveInputIdentity} from '../../src/chart/bar-input-identity';
import {createCalculationBarCache} from '../../src/chart/calculation-bars';
import {isDerivedStyle} from '../../src/chart/derived/common';
import {requireVolume} from '../../src/chart/contracts';
import type {Bar} from '../../src/domain/types';

/** vela 0.8.4 treats setMarket({data:[]}) as "load from the symbol provider" and parks
 * until one is registered, which never happens here, so the promise never settles. The adapter must never hand vela an
 * empty feed: an empty write is refused (no renderer call, no source change) and the market queue stays usable. */
function nativeChart(){
 return{setMarket:vi.fn((next:{data?:unknown[]})=>next.data&&next.data.length?Promise.resolve():new Promise<void>(()=>{})),setVisibleRange:vi.fn(),getVisibleRange:vi.fn(()=>({from:1,to:2})),orchestrator:null,reprojections:0};
}
function fixture(initial:Bar[],feed:(bars:readonly Bar[])=>readonly Bar[]=bars=>bars){
 const native=nativeChart(),source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const slice=(start:string,end:string)=>{const first=source.indexOf(start),last=source.indexOf(end,first);if(first<0||last<0)throw Error('Review adapter boundary: '+start);return source.slice(first,last);};
 const writes=slice('  const writeMarketInput=','  let lastCrosshair:'),setBars=slice('    setBars:','\n');
 const code=`const {createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,native,feed}=injected;
 const bars=initial;let currentBars=structuredClone([...initial]),currentSource={datasetId:'synthetic-a',revision:'1',fixture:true,label:'SYNTHETIC A',resolution:'1D',basisIdentity:'basis',inputIdentity:barInputIdentity(initial)};
 let requestedStyle='candles',disposed=false,marketUpdating=false,lastCrosshair=null,fedDerivedKey=null,derivedMemo=null,calculationBarCache=createCalculationBarCache(),vwapSourceEpoch={};
 const chart=native,scripts={invalidateResults(){}},indicators={assertCapacity(){},invalidateVwap(){}};
 const retireStatisticsSource=()=>{},retireVwapSource=()=>{},queueInlineRefresh=()=>{},reprojectDrawings=()=>{native.reprojections++;},publishDerivedPayload=()=>{},derivedFeedKey=()=>null,velaFeed=feed,toVelaBars=value=>value.map(bar=>({...bar,time:bar.time*1000}));
 const restoreRejectedVwapInput=result=>result,EMPTY_MARKET_MESSAGE='There are no bars to draw for this chart input yet.';
 ${writes}
 return{controller:{${setBars}},read:()=>({bars:currentBars,source:currentSource}),isPending:()=>marketQueue.isPending()};`;
 const harness=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,native,feed});
 return{...harness,native} as {controller:{setBars:(bars:Bar[],source?:unknown)=>Promise<{ok:boolean;diagnostic?:{code:string}}>};read:()=>{bars:Bar[];source:any};isPending:()=>boolean;native:ReturnType<typeof nativeChart>};
}
const bars=(count:number,base=100):Bar[]=>Array.from({length:count},(_,i)=>({time:1_700_000_000+i*86400,open:base,high:base+1,low:base-1,close:base,volume:1}));
const settled=async<T>(work:Promise<T>)=>{let done=false,value:unknown;void work.then(v=>{done=true;value={ok:true,v};},e=>{done=true;value={ok:false,e};});await vi.advanceTimersByTimeAsync(2000);return{done,value:value as {ok:boolean;v?:T;e?:unknown}};};
beforeEach(()=>{vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();});

it('an empty write settles as a refusal without calling the renderer and the queue keeps accepting writes',async()=>{
 const f=fixture(bars(5)),before=f.read();
 const empty=await settled(f.controller.setBars([],{datasetId:'synthetic-b',revision:'1',fixture:true,label:'SYNTHETIC B',resolution:'1D'}));
 expect(empty.done).toBe(true);
 expect(empty.value.ok&&empty.value.v?.ok).toBe(false);
 expect(empty.value.v?.diagnostic?.code).toBe('MARKET_INPUT_EMPTY');
 expect(f.native.setMarket).not.toHaveBeenCalled();
 expect(f.read().bars).toEqual(before.bars);expect(f.read().source.datasetId).toBe('synthetic-a');
 expect(f.isPending()).toBe(false);
 const next=await settled(f.controller.setBars(bars(7,200),{datasetId:'synthetic-c',revision:'1',fixture:true,label:'SYNTHETIC C',resolution:'1D'}));
 expect(next.done).toBe(true);expect(next.value.v?.ok).toBe(true);expect(f.read().bars).toHaveLength(7);
});

it('a derived chart type whose construction yields no feed settles (rolled back) instead of parking the queue',async()=>{
 const f=fixture(bars(5),raw=>raw.length<6?[]:raw);
 const derived=await settled(f.controller.setBars(bars(3,300),{datasetId:'synthetic-d',revision:'1',fixture:true,label:'SYNTHETIC D',resolution:'1D'}));
 expect(derived.done).toBe(true);
 expect(f.isPending()).toBe(false);
 const next=await settled(f.controller.setBars(bars(8,400),{datasetId:'synthetic-e',revision:'1',fixture:true,label:'SYNTHETIC E',resolution:'1D'}));
 expect(next.done).toBe(true);expect(next.value.v?.ok).toBe(true);expect(f.read().source.datasetId).toBe('synthetic-e');
});
