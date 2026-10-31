import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createMarketQueue} from '../../src/chart/market-queue';
import {sourceContextForInput,sameChartSourceBasis} from '../../src/chart/source-context';
import {barInputIdentity,isLiveInputIdentity,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {createCalculationBarCache} from '../../src/chart/calculation-bars';
import {isDerivedStyle} from '../../src/chart/derived/common';
import {requireVolume} from '../../src/chart/contracts';
import type {Bar} from '../../src/domain/types';
const toVelaBars=(bars:readonly Bar[])=>bars.map(bar=>({...bar,time:bar.time*1000}));

/** The actual adapter market-write bodies (writeMarketInput through the market queue, plus setBars) with a controlled
 * native chart: proves live growth goes through vela's live-bar path (applyBar), never a full setMarket reload. */
const LINEAGE='live:alpaca-iex:SYNTH:1m|live-v1:s:1';
type VelaBar={time:number;open:number;high:number;low:number;close:number;volume:number};
/** Mirrors vela 0.8.4 Orchestrator.applyBar: replaces the last raw bar, appends a newer one, silently drops an older one;
 * the renderer keeps its own (normalized) array of the same bar objects. */
function nativeChart(initial:readonly Bar[]=[]){
 const raw:VelaBar[]=initial.map(bar=>({...bar,time:bar.time*1000})),renderer={bars:[...raw],updates:0};
 return{setMarket:vi.fn(async()=>{}),setVisibleRange:vi.fn(),getVisibleRange:vi.fn(()=>({from:1,to:2})),orchestrator:{applied:[] as VelaBar[],rawBars:raw,bars:raw,barTransform:null,renderer,applyBar(bar:VelaBar){
  this.applied.push(bar);const last=this.rawBars.at(-1);
  if(last&&bar.time===last.time){this.rawBars[this.rawBars.length-1]=bar;renderer.bars[renderer.bars.length-1]=bar;}
  else if(!last||bar.time>last.time){this.rawBars.push(bar);renderer.bars.push(bar);}else return;
  renderer.updates++;}},reprojections:0};
}
function fixture(initial:Bar[],style='candles'){
 const native=nativeChart(initial),source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
 const slice=(start:string,end:string)=>{const first=source.indexOf(start),last=source.indexOf(end,first);if(first<0||last<0)throw Error('Review adapter boundary: '+start);return source.slice(first,last);};
 const writes=slice('  const writeMarketInput=','  let lastCrosshair:'),setBars=slice('    setBars:','\n');
 const code=`const {createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,style,native}=injected;
 const bars=initial;let currentBars=structuredClone([...initial]),currentSource={datasetId:'live:alpaca-iex:SYNTH:1m',revision:'live-v1:s:1',fixture:false,label:'SYNTHETIC live',resolution:'1m',basisIdentity:'basis',inputIdentity:barInputIdentity(initial)};
 let requestedStyle=style,disposed=false,marketUpdating=false,lastCrosshair={hover:true},fedDerivedKey=null,derivedMemo=null,calculationBarCache=createCalculationBarCache(),vwapSourceEpoch={};
 const chart=native,scripts={invalidateResults(){}},indicators={assertCapacity(){},invalidateVwap(){}};
 const retireStatisticsSource=()=>{},retireVwapSource=()=>{},queueInlineRefresh=()=>{},reprojectDrawings=()=>{native.reprojections++;},publishDerivedPayload=()=>{},derivedFeedKey=()=>null,velaFeed=value=>value,toVelaBars=value=>value;
 const restoreRejectedVwapInput=result=>result;
 ${writes}
 return{controller:{${setBars}},read:()=>({bars:currentBars,source:currentSource,crosshair:lastCrosshair}),applied:subscriber=>{marketAppliedSubscribers.add(subscriber);}};`;
 const harness=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,style,native});
 return{...harness,native} as {controller:{setBars:(bars:Bar[],source:unknown)=>Promise<{ok:boolean}>};read:()=>{bars:Bar[];source:any;crosshair:unknown};applied:(fn:()=>void)=>void;native:ReturnType<typeof nativeChart>};
}
const T0=1_800_000_000-(1_800_000_000%60);
/** SYNTHETIC 1-minute feed: each tick replaces the forming bar or opens a new one, as LiveBarSeries does. */
function stream(){
 let bars:Bar[]=Array.from({length:300},(_,i)=>({time:T0-(300-i)*60,open:100,high:101,low:99,close:100,volume:1}));let seq=0;
 const stamp=(next:Bar[])=>{stampLiveLineage(next,LINEAGE,++seq);return next;};
 stamp(bars);
 return{first:bars,tick(seconds:number){const time=T0+Math.floor(seconds/60)*60,last=bars.at(-1)!,price=100+(Math.round(seconds*4)%13)/10;
  bars=time>last.time?[...bars,{time,open:price,high:price,low:price,close:price,volume:1}]:[...bars.slice(0,-1),{...last,close:price,high:Math.max(last.high,price),low:Math.min(last.low,price),volume:last.volume+1}];return stamp(bars);}};
}
beforeEach(()=>{vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();});

it('a 4 Hz live stream over 30 minutes never reloads, never resets the view and keeps the crosshair',async()=>{
 const feed=stream(),f=fixture(feed.first),owned=f.read().bars;let applied=0;f.applied(()=>applied++);
 let seconds=0,latest=feed.first;const outcomes:Promise<{ok:boolean}>[]=[];
 const timer=setInterval(()=>{seconds+=0.25;latest=feed.tick(seconds);outcomes.push(f.controller.setBars(latest,f.read().source));},250);
 await vi.advanceTimersByTimeAsync(30*60*1000);clearInterval(timer);
 const results=await Promise.all(outcomes),state=f.read();
 expect(results).toHaveLength(7200);expect(results.every(row=>row.ok)).toBe(true);
 expect(f.native.setMarket).not.toHaveBeenCalled();expect(f.native.setVisibleRange).not.toHaveBeenCalled();expect(f.native.reprojections).toBe(0);
 expect(state.bars).toBe(owned); // the adapter grows its own input in place, so owners captured on it stay current
 expect(state.bars).toHaveLength(331);expect(state.bars.at(-1)).toEqual(latest.at(-1));
 expect(state.crosshair).toEqual({hover:true});expect(applied).toBe(7200);
 const native=f.native.orchestrator.applied;expect(native.length).toBe(7200+31);expect(native.at(-1)!.time).toBe(latest.at(-1)!.time*1000);
},120_000);

it('a history correction on the same subscription reloads once and restores the visible range; another source does not carry the view',async()=>{
 const feed=stream(),f=fixture(feed.first);
 expect((await f.controller.setBars(feed.tick(10),f.read().source)).ok).toBe(true);
 const corrected=f.read().bars.map(bar=>({...bar}));corrected[5].close=1;stampLiveLineage(corrected,LINEAGE,99_999);
 expect((await f.controller.setBars(corrected,f.read().source)).ok).toBe(true);
 expect(f.native.setMarket).toHaveBeenCalledTimes(1);expect(f.native.setVisibleRange).toHaveBeenCalledWith({from:1,to:2});expect(f.read().bars[5].close).toBe(1);
 const other=feed.first.map(bar=>({...bar}));
 expect((await f.controller.setBars(other,{datasetId:'synthetic',revision:'1',fixture:true,label:'SYNTHETIC',resolution:'1D',basisIdentity:'other'})).ok).toBe(true);
 expect(f.native.setMarket).toHaveBeenCalledTimes(2);expect(f.native.setVisibleRange).toHaveBeenCalledTimes(1);expect(f.read().crosshair).toBeNull();
});

it('a derived chart type (Renko) keeps the full construction path but holds the view',async()=>{
 const feed=stream(),f=fixture(feed.first,'renko');
 expect((await f.controller.setBars(feed.tick(1),f.read().source)).ok).toBe(true);
 expect(f.native.orchestrator.applied).toHaveLength(0);expect(f.native.setMarket).toHaveBeenCalledTimes(1);expect(f.native.setVisibleRange).toHaveBeenCalledWith({from:1,to:2});
});

/** SYNTHETIC Coinbase 1m: ticks at 4 Hz build the forming minute (volume 0); about 1.5 s into each minute the REST
 * reconcile finalizes the just-closed minute (real volume, small H/L revision) and the forming minute. */
it('LIVE-STREAM-REVIEW F3: two hours of 4 Hz ticks plus the per-minute reconcile never reload the chart',async()=>{
 let bars:Bar[]=Array.from({length:300},(_,i)=>({time:T0-(300-i)*60,open:100,high:101,low:99,close:100,volume:5}));let seq=0;
 const stamp=(next:Bar[])=>{stampLiveLineage(next,LINEAGE,++seq);return next;};stamp(bars);
 const f=fixture(bars);let applied=0;f.applied(()=>applied++);const outcomes:Promise<{ok:boolean}>[]=[];
 let step=0;
 const timer=setInterval(()=>{
  step++;const ms=step*250,time=T0+Math.floor(ms/60000)*60,price=100+(step%13)/10,last=bars.at(-1)!;
  bars=time>last.time?[...bars,{time,open:price,high:price,low:price,close:price,volume:0}]:[...bars.slice(0,-1),{...last,close:price,high:Math.max(last.high,price),low:Math.min(last.low,price)}];
  if(ms%60000===1500){const closed=bars.at(-2)!,forming=bars.at(-1)!;bars=[...bars.slice(0,-2),{...closed,high:closed.high+0.01,low:closed.low-0.01,volume:42},{...forming,volume:3}];}
  outcomes.push(f.controller.setBars(stamp(bars),f.read().source));
 },250);
 await vi.advanceTimersByTimeAsync(2*60*60*1000);clearInterval(timer);
 const results=await Promise.all(outcomes),state=f.read(),native=f.native.orchestrator;
 expect(results.every(row=>row.ok)).toBe(true);
 expect(f.native.setMarket).not.toHaveBeenCalled();expect(f.native.setVisibleRange).not.toHaveBeenCalled();expect(f.native.reprojections).toBe(0);
 expect(applied).toBe(results.length);
 // The native series equals the finalized input bar for bar: every reconciled minute carries its REST volume.
 expect(native.rawBars).toEqual(toVelaBars(bars));expect(native.renderer.bars).toEqual(toVelaBars(bars));expect(state.bars).toEqual(bars);
 expect(native.rawBars.filter(bar=>bar.volume===42)).toHaveLength(120);
},120_000);

it('LIVE-STREAM-REVIEW F3: a revision older than the just-closed bar, or a bar going backwards, still reloads',async()=>{
 const feed=stream(),f=fixture(feed.first);
 expect((await f.controller.setBars(feed.tick(70),f.read().source)).ok).toBe(true); // opens minute 1, so minute 0 just closed
 const recent=f.read().bars.map(bar=>({...bar}));recent.at(-2)!.volume=9;stampLiveLineage(recent,LINEAGE,50_000);
 expect((await f.controller.setBars(recent,f.read().source)).ok).toBe(true);
 expect(f.native.setMarket).not.toHaveBeenCalled();expect(f.native.orchestrator.rawBars.at(-2)!.volume).toBe(9);
 const older=f.read().bars.map(bar=>({...bar}));older.at(-3)!.volume=9;stampLiveLineage(older,LINEAGE,50_001);
 expect((await f.controller.setBars(older,f.read().source)).ok).toBe(true);
 expect(f.native.setMarket).toHaveBeenCalledTimes(1);
 const moved=f.read().bars.map(bar=>({...bar}));moved.at(-1)!.time+=1;stampLiveLineage(moved,LINEAGE,50_002);
 expect((await f.controller.setBars(moved,f.read().source)).ok).toBe(true);
 expect(f.native.setMarket).toHaveBeenCalledTimes(2);
});
