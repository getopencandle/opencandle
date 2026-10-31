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

// A same-subscription reload (a history page, the after-open prefetch) goes through vela setMarket, whose
// setBars refits every price scale to auto. The actual adapter write/apply bodies run against a controlled native chart whose
// setMarket clears manual scales the way vela 0.8.4 does (reframeKeepZoom). SYNTHETIC bars only.
const source=readFileSync('src/chart/adapter.ts','utf8').replace(/\r\n/g,'\n');
const slice=(start:string,end:string)=>{const first=source.indexOf(start),last=source.indexOf(end,first);if(first<0||last<0)throw Error('Review adapter boundary: '+start);return source.slice(first,last);};
const T0=1_800_000_000-(1_800_000_000%60);
const minutes=(from:number,count:number):Bar[]=>Array.from({length:count},(_,i)=>({time:from+i*60,open:100,high:101,low:99,close:100,volume:1}));
const feed=(product:string)=>{const lineage='live:coinbase-public:'+product+':1m|live-v1:s:1';return{
 live:(bars:Bar[],seq:number)=>{stampLiveLineage(bars,lineage,seq);return bars;},
 source:(bars:Bar[])=>({datasetId:'live:coinbase-public:'+product+':1m',revision:'live-v1:s:1',fixture:false,label:'SYNTHETIC live',resolution:'1m',basisIdentity:'basis-'+product,inputIdentity:barInputIdentity(bars)}),
};};
type Scale={min:number;max:number;log:boolean;invert:boolean};
type Holder={manualScale:Scale|null;scale:Scale;scaleTarget:Scale;initialized:boolean};
const holder=(manual:Scale|null):Holder=>({manualScale:manual,scale:manual?{...manual}:{min:90,max:110,log:false,invert:false},scaleTarget:manual?{...manual}:{min:90,max:110,log:false,invert:false},initialized:!!manual});

function harness(manual:{price?:Scale|null;study?:Scale|null}){
 const btc=feed('BTC-USD'),initial=btc.live(minutes(T0,300),1),range={from:(T0+5*60)*1000,to:(T0+120*60)*1000};
 const panes=new Map<string,Holder>([['price',holder(manual.price??null)]]),indicatorScales=new Map<string,Holder>([['rsi-1',holder(manual.study??null)]]);
 const renderer={scene:{panes,indicatorScales},axisScaleButtons:{reposition:vi.fn()},scheduler:{invalidate:vi.fn()},bars:initial.map(bar=>({time:bar.time})),coords:{barCount:300,getViewport:()=>({barSpacing:3.25,rightOffset:10})},applyViewport:vi.fn(),clampViewport:(barSpacing:number,rightOffset:number)=>({barSpacing,rightOffset})};
 // vela 0.8.4 setMarket -> setBarSeries -> renderer.setBars -> reframeKeepZoom: every manual scale back to auto.
 const native={setMarket:vi.fn(async()=>{for(const map of [panes,indicatorScales])for(const h of map.values()){h.manualScale=null;h.scale={min:1,max:2,log:false,invert:false};}}),setVisibleRange:vi.fn(),getVisibleRange:vi.fn(()=>range),orchestrator:{applyBar:vi.fn(),rawBars:[],bars:[],barTransform:null,renderer:{bars:[]}}};
 const code=`const {createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,native,start,rendererHolder}=injected;
 const bars=initial;let currentBars=[...initial],currentSource=start;
 let requestedStyle='candles',disposed=false,marketUpdating=false,lastCrosshair={hover:true},fedDerivedKey=null,derivedMemo=null,calculationBarCache=createCalculationBarCache(),vwapSourceEpoch={};
 const chart=native,scripts={invalidateResults(){}},indicators={assertCapacity(){},invalidateVwap(){}};
 const retireStatisticsSource=()=>{},retireVwapSource=()=>{},queueInlineRefresh=()=>{},reprojectDrawings=()=>{},publishDerivedPayload=()=>{},derivedFeedKey=()=>null,velaFeed=value=>value,toVelaBars=value=>value;
 const restoreRejectedVwapInput=result=>result;
 ${slice('  const writeMarketInput=','  let lastCrosshair:')}
 return{controller:{${slice('    setBars:','\n')}},read:()=>({bars:currentBars,source:currentSource})};`;
 const f=new Function('return '+stripTypeScriptTypes('(function(injected){'+code+'})',{mode:'strip'}))()({createMarketQueue,sourceContextForInput,sameChartSourceBasis,barInputIdentity,isLiveInputIdentity,createCalculationBarCache,isDerivedStyle,requireVolume,initial,native,start:btc.source(initial),rendererHolder:{current:renderer}});
 return {f,native,initial,panes,indicatorScales,renderer,btc};
}
const DRAGGED:Scale={min:95.5,max:104.25,log:true,invert:false};

it('a history page of the same subscription keeps a manual price scale the user dragged (the scale stays as saved)',async()=>{
 const {f,native,initial,panes,renderer,btc}=harness({price:DRAGGED});
 expect((await f.controller.setBars(btc.live([...minutes(T0-300*60,300),...initial],2),f.read().source)).ok).toBe(true);
 expect(native.setMarket).toHaveBeenCalledTimes(1);
 const price=panes.get('price')!;
 expect(price.manualScale).toEqual(DRAGGED);expect(price.scale).toEqual(DRAGGED);expect(price.scaleTarget).toEqual(DRAGGED);expect(price.initialized).toBe(true);
 expect(price.manualScale).not.toBe(price.scale);
 expect(renderer.scheduler.invalidate).toHaveBeenCalledWith(4);expect(renderer.axisScaleButtons.reposition).toHaveBeenCalled();
 // The viewport restore still runs.
 expect(renderer.applyViewport).toHaveBeenCalledWith({barSpacing:3.25,rightOffset:10});
});
it('a manual indicator scale is kept too, and an auto scale stays auto',async()=>{
 const {f,initial,panes,indicatorScales,btc}=harness({study:DRAGGED});
 expect((await f.controller.setBars(btc.live([...minutes(T0-300*60,300),...initial],2),f.read().source)).ok).toBe(true);
 expect(indicatorScales.get('rsi-1')!.manualScale).toEqual(DRAGGED);
 expect(panes.get('price')!.manualScale).toBeNull();
});
it('with every scale on auto nothing is written back',async()=>{
 const {f,initial,panes,renderer,btc}=harness({});
 expect((await f.controller.setBars(btc.live([...minutes(T0-300*60,300),...initial],2),f.read().source)).ok).toBe(true);
 expect(panes.get('price')!.manualScale).toBeNull();expect(renderer.scheduler.invalidate).not.toHaveBeenCalled();
});
it('a new subscription (symbol switch) still opens on auto',async()=>{
 const {f,native,panes}=harness({price:DRAGGED}),eth=feed('ETH-USD'),bars=eth.live(minutes(T0,300),1);
 expect((await f.controller.setBars(bars,eth.source(bars))).ok).toBe(true);
 expect(native.setMarket).toHaveBeenCalledTimes(1);
 expect(panes.get('price')!.manualScale).toBeNull();
});
it('a scale the reload already put in manual itself is not overwritten',async()=>{
 const {f,native,initial,panes,btc}=harness({price:DRAGGED}),own:Scale={min:1,max:9,log:false,invert:false};
 native.setMarket.mockImplementation(async()=>{const h=panes.get('price')!;h.manualScale={...own};});
 expect((await f.controller.setBars(btc.live([...minutes(T0-300*60,300),...initial],2),f.read().source)).ok).toBe(true);
 expect(panes.get('price')!.manualScale).toEqual(own);
});
