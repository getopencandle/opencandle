import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it,vi} from 'vitest';
import {createMarketQueue} from '../../src/chart/market-queue';
import {sourceContextForInput,sameChartSourceBasis} from '../../src/chart/source-context';
import {barInputIdentity,isLiveInputIdentity,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {createCalculationBarCache} from '../../src/chart/calculation-bars';
import {isDerivedStyle} from '../../src/chart/derived/common';
import {requireVolume} from '../../src/chart/contracts';
import type {Bar} from '../../src/domain/types';

// Owner report (0.8.2): a Fib retracement flickered and bounced while zooming or scrolling a live chart, and after switching to 4h.
// Each history page (and the interval switch) reloads through vela setMarket, which leaves the reload's default view in place until
// the adapter restores the kept view. Re-projecting the drawings makes the renderer paint the drawing layer at once
// (syncDrawings -> render) with the viewport of that moment, while candles and axes wait for the next frame. Re-projected
// before the restore, every drawing showed for one frame where the default view puts it. The actual adapter write/apply bodies
// run against a controlled native chart; a re-projection records the viewport the drawing layer would be painted with.
// SYNTHETIC bars only.
const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
const slice=(start:string,end:string)=>{const first=source.indexOf(start),last=source.indexOf(end,first);if(first<0||last<0)throw Error('Review adapter boundary: '+start);return source.slice(first,last);};
const T0=1_800_000_000-(1_800_000_000%60);
const minutes=(from:number,count:number,step=60):Bar[]=>Array.from({length:count},(_,i)=>({time:from+i*step,open:100,high:101,low:99,close:100,volume:1}));
const feed=(product:string,resolution='1m')=>{const id='live:coinbase-public:'+product+':'+resolution,lineage=id+'|live-v1:s:1';return{
 live:(bars:Bar[],seq:number)=>{stampLiveLineage(bars,lineage,seq);return bars;},
 source:(bars:Bar[])=>({datasetId:id,revision:'live-v1:s:1',fixture:false,label:'SYNTHETIC live',resolution,basisIdentity:'basis-'+product,inputIdentity:barInputIdentity(bars)}),
};};
type Viewport={barSpacing:number;rightOffset:number};
const USER_VIEW:Viewport={barSpacing:3.25,rightOffset:-240},DEFAULT_VIEW:Viewport={barSpacing:3.25,rightOffset:5};

function harness(){
 const btc=feed('BTC-USD'),initial=btc.live(minutes(T0,300),1),range={from:(T0+5*60)*1000,to:(T0+120*60)*1000};
 let view:Viewport={...USER_VIEW};
 const painted:Viewport[]=[];
 const renderer={scene:{panes:new Map(),indicatorScales:new Map()},scheduler:{invalidate:vi.fn()},bars:initial.map(bar=>({time:bar.time})),coords:{barCount:300,getViewport:()=>({...view})},applyViewport:vi.fn((next:Viewport)=>{view={...next};}),clampViewport:(barSpacing:number,rightOffset:number)=>({barSpacing,rightOffset})};
 // vela setMarket loads the new bars and leaves its own default view (right edge) until the adapter puts the kept view back.
 const native={setMarket:vi.fn(async()=>{view={...DEFAULT_VIEW};}),setVisibleRange:vi.fn(),getVisibleRange:vi.fn(()=>range),orchestrator:{applyBar:vi.fn(),rawBars:[],bars:[],barTransform:null,renderer:{bars:[]}}};
 // A re-projection paints the drawing layer synchronously with the current viewport (vela UserDrawings.syncDrawings -> render).
 const reproject=()=>{painted.push({...view});};
 const spacingCarry={reset:vi.fn(),begin:vi.fn(()=>({barSpacing:9})),finish:vi.fn((target:{applyViewport(next:Viewport):void},carry:{barSpacing:number})=>{target.applyViewport({barSpacing:carry.barSpacing,rightOffset:5});})};
 const code=`const {createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,native,start,rendererHolder,reproject,spacingCarry}=injected;
 const bars=initial;let currentBars=[...initial],currentSource=start;
 let requestedStyle='candles',disposed=false,marketUpdating=false,lastCrosshair={hover:true},fedDerivedKey=null,derivedMemo=null,calculationBarCache=createCalculationBarCache(),vwapSourceEpoch={};
 const chart=native,scripts={invalidateResults(){}},indicators={assertCapacity(){},invalidateVwap(){}};
 const typicalBarStep=times=>times.length>1?times[1]-times[0]:0;
 const retireStatisticsSource=()=>{},retireVwapSource=()=>{},queueInlineRefresh=()=>{},reprojectDrawings=reproject,publishDerivedPayload=()=>{},derivedFeedKey=()=>null,velaFeed=value=>value,toVelaBars=value=>value;
 const restoreRejectedVwapInput=result=>result;
 ${slice('  const writeMarketInput=','  let lastCrosshair:')}
 return{controller:{${slice('    setBars:','\n')}},read:()=>({bars:currentBars,source:currentSource})};`;
 const f=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,native,start:btc.source(initial),rendererHolder:{current:renderer},reproject,spacingCarry});
 return {f,native,initial,renderer,btc,painted,spacingCarry,view:()=>view};
}

it('a history page re-projects the drawings only after the kept view is back, so a Fib never paints where the default view puts it',async()=>{
 const {f,native,initial,renderer,btc,painted,view}=harness();
 expect((await f.controller.setBars(btc.live([...minutes(T0-300*60,300),...initial],2),f.read().source)).ok).toBe(true);
 expect(native.setMarket).toHaveBeenCalledTimes(1);
 expect(renderer.applyViewport).toHaveBeenCalledWith(USER_VIEW);
 expect(painted).toEqual([USER_VIEW]);
 expect(view()).toEqual(USER_VIEW);
});

it('an interval switch re-projects the drawings after the carried spacing is applied',async()=>{
 const {f,native,painted,spacingCarry}=harness(),hours=feed('BTC-USD','4h'),next=hours.live(minutes(T0-200*14400,200,14400),1);
 expect((await f.controller.setBars(next,hours.source(next))).ok).toBe(true);
 expect(native.setMarket).toHaveBeenCalledTimes(1);
 expect(spacingCarry.finish).toHaveBeenCalledTimes(1);
 expect(painted).toEqual([{barSpacing:9,rightOffset:5}]);
});
