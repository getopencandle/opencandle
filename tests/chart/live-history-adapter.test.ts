import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it,vi} from 'vitest';
import {createMarketQueue} from '../../src/chart/market-queue';
import {sourceContextForInput,sameChartSourceBasis} from '../../src/chart/source-context';
import {barInputIdentity,isLiveInputIdentity,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {createCalculationBarCache} from '../../src/chart/calculation-bars';
import {isDerivedStyle} from '../../src/chart/derived/common';
import {requireVolume} from '../../src/chart/contracts';
import {LIVE_HISTORY_PREFETCH_BARS,LIVE_HISTORY_PREFETCH_SCREENS,LIVE_HISTORY_ZOOM_ROOM_BARS,nearHistoryStart} from '../../src/domain/live-history';
import type {Bar} from '../../src/domain/types';

// The actual adapter bodies with a controlled native chart. SYNTHETIC bars only.
const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
const slice=(start:string,end:string)=>{const first=source.indexOf(start),last=source.indexOf(end,first);if(first<0||last<0)throw Error('Review adapter boundary: '+start);return source.slice(first,last);};
const LINEAGE='live:coinbase-public:BTC-USD:1m|live-v1:s:1',T0=1_800_000_000-(1_800_000_000%60);
const minutes=(from:number,count:number):Bar[]=>Array.from({length:count},(_,i)=>({time:from+i*60,open:100,high:101,low:99,close:100,volume:1}));
const live=(bars:Bar[],seq:number)=>{stampLiveLineage(bars,LINEAGE,seq);return bars;};
const liveSource=(bars:Bar[])=>({datasetId:'live:coinbase-public:BTC-USD:1m',revision:'live-v1:s:1',fixture:false,label:'SYNTHETIC live',resolution:'1m',basisIdentity:'basis',inputIdentity:barInputIdentity(bars)});

function trigger(bars:Bar[],options:{live?:boolean;style?:string;updating?:boolean;from:number;to?:number;state?:()=>{status:string;message:string|null}|null;renderer?:Record<string,unknown>}){
 const listeners:Array<()=>void>=[],requestLiveHistory=vi.fn(()=>true),liveHistoryState=options.state??(()=>({status:'idle',message:null}));
 const chart={getVisibleRange:()=>({from:options.from*1000,to:(options.to??bars.at(-1)!.time)*1000}),on:(name:string,fn:()=>void)=>{if(name==='viewport:changed')listeners.push(fn);}};
 const code=`const {chart,currentBars,currentSource,requestedStyle,marketUpdating,isLiveInputIdentity,isDerivedStyle,nearHistoryStart,requestLiveHistory,liveHistoryState,LIVE_HISTORY_MIN_INTERVAL_MS,LIVE_HISTORY_PREFETCH_BARS,LIVE_HISTORY_PREFETCH_SCREENS,LIVE_HISTORY_ZOOM_ROOM_BARS,rendererHolder}=injected;const disposed=false;
 ${slice('  // A live chart panned or zoomed to within LIVE_HISTORY_MARGIN_BARS','  const applyRequestedStyle=')}`;
 const run=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))();
 const current=options.live===false?{...liveSource(bars),datasetId:'local:import',inputIdentity:'bars:1'}:liveSource(bars);
 run({chart,currentBars:bars,currentSource:current,requestedStyle:options.style??'candles',marketUpdating:!!options.updating,isLiveInputIdentity,isDerivedStyle,nearHistoryStart,requestLiveHistory,liveHistoryState,LIVE_HISTORY_MIN_INTERVAL_MS:1000,LIVE_HISTORY_PREFETCH_BARS,LIVE_HISTORY_PREFETCH_SCREENS,LIVE_HISTORY_ZOOM_ROOM_BARS,rendererHolder:options.renderer?{current:options.renderer}:undefined});
 for(const fn of listeners)fn();
 return requestLiveHistory;
}

// Past the after-open prefetch (LIVE_HISTORY_PREFETCH_BARS loaded) the margin rule applies; below it a live
// chart keeps paging with no gesture. "Full" series are 6000 bars so the margin cases test the margin.
it('a live chart viewed near its oldest bar asks its feed for the previous page; far views, imports, derived types and reloads do not',()=>{
 vi.useFakeTimers();
 const bars=live(minutes(T0,6000),1);
 expect(trigger(bars,{from:T0+10*60,to:T0+100*60})).toHaveBeenCalledWith('live:coinbase-public:BTC-USD:1m');
 expect(trigger(bars,{from:T0-3600,to:T0+100*60})).toHaveBeenCalledTimes(1);
 expect(trigger(bars,{from:T0+3000*60,to:T0+3100*60})).not.toHaveBeenCalled();
 expect(trigger(minutes(T0,6000),{from:T0,live:false})).not.toHaveBeenCalled();
 expect(trigger(bars,{from:T0,style:'renko'})).not.toHaveBeenCalled();
 expect(trigger(bars,{from:T0,updating:true})).not.toHaveBeenCalled();
 vi.clearAllTimers();vi.useRealTimers();
});

// One view width at first, then two (LIVE_HISTORY_PREFETCH_SCREENS), and a spaced follow-up.
it('requests when less than two view widths of history are left of the view, not when more are',()=>{
 vi.useFakeTimers();
 expect(LIVE_HISTORY_PREFETCH_SCREENS).toBe(2);
 const bars=live(minutes(T0,6000),1);
 expect(trigger(bars,{from:T0+100*60,to:T0+180*60})).toHaveBeenCalledTimes(1);
 expect(trigger(bars,{from:T0+250*60,to:T0+280*60})).not.toHaveBeenCalled();
 vi.clearAllTimers();vi.useRealTimers();
});
it('right after open a live chart keeps paging with no gesture until it holds the prefetch target',()=>{
 vi.useFakeTimers();
 expect(LIVE_HISTORY_PREFETCH_BARS).toBe(5000);
 const opened=trigger(live(minutes(T0,300),1),{from:T0+250*60,to:T0+299*60});vi.advanceTimersByTime(1600);expect(opened).toHaveBeenCalledTimes(1);
 // Far from the oldest bar, the no-gesture prefetch waits until the feed has been on screen 1.5 s
 const dwelling=trigger(live(minutes(T0,4999),1),{from:T0+4900*60,to:T0+4998*60});expect(dwelling).not.toHaveBeenCalled();
 vi.advanceTimersByTime(1600);expect(dwelling).toHaveBeenCalledTimes(1);
 expect(trigger(live(minutes(T0,5000),1),{from:T0+4900*60,to:T0+4999*60})).not.toHaveBeenCalled();
 vi.clearAllTimers();vi.useRealTimers();
});
it('keeps paging after a page lands while the view nears the start, and stops at No more data or an error',()=>{
 vi.useFakeTimers();
 const bars=live(minutes(T0,6000),1);
 const paging=trigger(bars,{from:T0,to:T0+100*60});expect(paging).toHaveBeenCalledTimes(1);
 vi.advanceTimersByTime(1050);expect(paging).toHaveBeenCalledTimes(2);vi.advanceTimersByTime(1050);expect(paging).toHaveBeenCalledTimes(3);
 vi.clearAllTimers();
 let state:{status:string;message:string|null}={status:'idle',message:null};
 const ending=trigger(bars,{from:T0,to:T0+100*60,state:()=>state});expect(ending).toHaveBeenCalledTimes(1);
 state={status:'exhausted',message:'No more data'};vi.advanceTimersByTime(1050);expect(ending).toHaveBeenCalledTimes(2);
 vi.advanceTimersByTime(5000);expect(ending).toHaveBeenCalledTimes(2);
 const failing=trigger(bars,{from:T0,to:T0+100*60,state:()=>({status:'error',message:'x'})});vi.advanceTimersByTime(5000);expect(failing).toHaveBeenCalledTimes(1);
 const reloading=trigger(bars,{from:T0,to:T0+100*60,updating:true});vi.advanceTimersByTime(5000);expect(reloading).not.toHaveBeenCalled();
 vi.clearAllTimers();vi.useRealTimers();
});
it('gives the renderer history room while the feed can page, and none at No more data, for imports or derived types',()=>{
 vi.useFakeTimers();
 const bars=live(minutes(T0,6000),1),room=(options:Parameters<typeof trigger>[1])=>{const renderer:Record<string,unknown>={};trigger(bars,{...options,renderer});return renderer.lvHistoryRoom;};
 expect(room({from:T0+3000*60,to:T0+3100*60})).toBe(LIVE_HISTORY_ZOOM_ROOM_BARS);
 expect(room({from:T0+3000*60,to:T0+3100*60,state:()=>({status:'error',message:'x'})})).toBe(LIVE_HISTORY_ZOOM_ROOM_BARS);
 expect(room({from:T0+3000*60,to:T0+3100*60,state:()=>({status:'exhausted',message:'No more data'})})).toBe(0);
 expect(room({from:T0+3000*60,to:T0+3100*60,state:()=>null})).toBe(0);
 expect(room({from:T0,style:'renko'})).toBe(0);
 vi.clearAllTimers();vi.useRealTimers();
});

function reloadHarness(renderer:Record<string,unknown>|null){
 const initial=live(minutes(T0,300),1),range={from:(T0+5*60)*1000,to:(T0+120*60)*1000};
 const native={setMarket:vi.fn(async()=>{}),setVisibleRange:vi.fn(),getVisibleRange:vi.fn(()=>range),orchestrator:{applyBar:vi.fn(),rawBars:[],bars:[],barTransform:null,renderer:{bars:[]}},reprojections:0};
 const code=`const {createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,native,start,rendererHolder}=injected;
 const bars=initial;let currentBars=[...initial],currentSource=start;
 let requestedStyle='candles',disposed=false,marketUpdating=false,lastCrosshair={hover:true},fedDerivedKey=null,derivedMemo=null,calculationBarCache=createCalculationBarCache(),vwapSourceEpoch={};
 const chart=native,scripts={invalidateResults(){}},indicators={assertCapacity(){},invalidateVwap(){}};
 const retireStatisticsSource=()=>{},retireVwapSource=()=>{},queueInlineRefresh=()=>{},reprojectDrawings=()=>{},publishDerivedPayload=()=>{},derivedFeedKey=()=>null,velaFeed=value=>value,toVelaBars=value=>value;
 const restoreRejectedVwapInput=result=>result;
 ${slice('  const writeMarketInput=','  let lastCrosshair:')}
 return{controller:{${slice('    setBars:','\n')}},read:()=>({bars:currentBars,source:currentSource,crosshair:lastCrosshair})};`;
 const f=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,native,start:liveSource(initial),rendererHolder:renderer?{current:renderer}:undefined});
 return {f,native,initial,range};
}
it('a prepended snapshot of the same subscription reloads once and puts the visible time range back (no jump)',async()=>{
 const {f,native,initial,range}=reloadHarness(null);
 const prepended=live([...minutes(T0-300*60,300),...initial],2);
 expect((await f.controller.setBars(prepended,f.read().source)).ok).toBe(true);
 expect(native.setMarket).toHaveBeenCalledTimes(1);expect(native.setVisibleRange).toHaveBeenCalledWith(range);
 expect(native.orchestrator.applyBar).not.toHaveBeenCalled();
 expect(f.read().bars).toHaveLength(600);expect(f.read().bars[0].time).toBe(T0-300*60);
 expect(f.read().source.inputIdentity).toBe(liveSource(initial).inputIdentity);expect(f.read().crosshair).toEqual({hover:true});
});

// With a renderer the reload puts the exact viewport back (spacing and right offset count from the newest bar).
const mockRenderer=(initial:Bar[],extra:Record<string,unknown>={})=>{
 const renderer:Record<string,unknown>={bars:initial.map(bar=>({time:bar.time})),coords:{barCount:initial.length,getViewport:()=>({barSpacing:3.25,rightOffset:10})},applyViewport:vi.fn(),zoomTo:vi.fn(),clampViewport:vi.fn((barSpacing:number,rightOffset:number)=>({barSpacing,rightOffset})),...extra};
 return renderer;
};
it('a prepended page keeps the exact bar spacing and right offset, not a refitted time range',async()=>{
 const initial=live(minutes(T0,300),1),renderer=mockRenderer(initial);
 const {f,native}=reloadHarness(renderer);
 const prepended=live([...minutes(T0-300*60,300),...initial],2);
 expect((await f.controller.setBars(prepended,f.read().source)).ok).toBe(true);
 expect(native.setMarket).toHaveBeenCalledTimes(1);
 expect(renderer.applyViewport).toHaveBeenCalledWith({barSpacing:3.25,rightOffset:10});
 expect(native.setVisibleRange).not.toHaveBeenCalled();expect(renderer.zoomTo).not.toHaveBeenCalled();
 expect(f.read().bars).toHaveLength(600);expect(new Set(f.read().bars.map((bar:Bar)=>bar.time)).size).toBe(600);
});
it('a wheel zoom still easing when a page lands finishes at its target, its anchor moved by the added bars',async()=>{
 const initial=live(minutes(T0,300),1),coords={barCount:300,getViewport:()=>({barSpacing:3.25,rightOffset:10})};
 const renderer=mockRenderer(initial,{coords,targetBarSpacing:2.9,zoomAnchorLogical:309,zoomAnchorX:968,animator:{active:true}});
 const {f,native}=reloadHarness(renderer);native.setMarket.mockImplementation(async()=>{coords.barCount=600;});
 expect((await f.controller.setBars(live([...minutes(T0-300*60,300),...initial],2),f.read().source)).ok).toBe(true);
 expect(renderer.applyViewport).toHaveBeenCalledWith({barSpacing:3.25,rightOffset:10});
 expect(renderer.zoomTo).toHaveBeenCalledWith(2.9,609,968);
});
it('a reload that moves the newest bar still restores the time range',async()=>{
 const initial=live(minutes(T0,300),1),renderer=mockRenderer(initial.slice(0,-1));
 const {f,native,range}=reloadHarness(renderer);
 expect((await f.controller.setBars(live([...minutes(T0-300*60,300),...initial],2),f.read().source)).ok).toBe(true);
 expect(native.setVisibleRange).toHaveBeenCalledWith(range);expect(renderer.applyViewport).not.toHaveBeenCalled();
});
