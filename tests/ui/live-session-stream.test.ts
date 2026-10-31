import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveBarSeries} from '../../src/domain/live-bars';
import {buildLiveDataset,liveStatusLabel,type LiveEntry,type ProvenanceTemplate} from '../../src/domain/live-provider';
import {fixtureInstrument} from '../../src/domain/fixtures';
import type {Bar,BarDataset} from '../../src/domain/types';
import {sourceContextForDataset,sameChartSourceBasis} from '../../src/chart/source-context';
import {barInputIdentity,sameBarsInput,newerLiveBars} from '../../src/chart/bar-input-identity';
import {chartInputCommitted} from '../../src/chart/input-visibility';
import {alertDatasetKey} from '../../src/domain/alert-observation';
import {technicalContextKey} from '../../src/ui/technical-alert-observer';
import {sameAlertInput,alertInputKey} from '../../src/ui/WorkspaceAlerts';
import {demoDataset,stableDatasetUniverse,workspaceDatasets} from '../../src/ui/workspace-grid';
import {publishLiveDataset,subscribeLiveDataset,clearLiveDatasets,liveDatasetById} from '../../src/ui/live-registry';
import {createMarketQueue} from '../../src/chart/market-queue';
import {createNativeCaptureAuthority} from '../../src/chart/native-capture-authority';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import {matchingInspection} from '../../src/ui/inspection-guard';
import {acceptChartInput} from '../../src/chart/input-lifecycle';

// SYNTHETIC live stream: generated prices fed through the real LiveBarSeries and buildLiveDataset at 4 Hz.
const T0=1_800_000_000-(1_800_000_000%60);
function liveFeed(datasetId='live:alpaca-iex:SYNTH:1m'){
 const series=new LiveBarSeries({seconds:60,baseSeconds:60,ticks:true,aligned:true});
 const entry:LiveEntry={key:datasetId,symbol:'SYNTH',resolution:'1m',seconds:60,series,refs:1,listeners:new Set(),cached:null,cachedRevision:-1,backfilled:true,lastError:null,seeding:new Set(),reconcileAfter:null};
 const template:ProvenanceTemplate={providerId:'alpaca-iex',providerName:'SYNTHETIC live test feed',datasetId,coverage:'SYNTHETIC IEX test coverage',delaySeconds:0,session:'regular',timezone:'America/New_York',license:'SYNTHETIC',notes:['SYNTHETIC test feed.'],asOf:0};
 const instrument={...fixtureInstrument('SYNTH'),id:'SYNTHETIC:LIVE:SYNTH',exchange:'IEX'};
 const backfill:Bar[]=Array.from({length:300},(_,i)=>({time:T0-(300-i)*60,open:100,high:101,low:99,close:100+(i%5)/10,volume:10}));
 series.setBackfill(backfill);series.setState('ready');
 let price=100,seconds=T0;
 const dataset=()=>buildLiveDataset(entry,instrument,'s1',template);
 return{series,dataset,tick(){seconds+=0.25;price=Math.max(1,price+((Math.floor(seconds*4)%7)-3)/100);series.applyTick({time:Math.floor(seconds),price:Math.round(price*100)/100,size:1});return dataset();}};
}

beforeEach(()=>{vi.useFakeTimers();clearLiveDatasets();});
afterEach(()=>{vi.useRealTimers();clearLiveDatasets();});

describe('LIVE-SESSION: a 4 Hz stream keeps one source identity for the life of the subscription',()=>{
 it('two simulated hours: revision, coverage, basis, input identity and alert keys never change',()=>{
  const feed=liveFeed(),first=feed.dataset(),firstSource=sourceContextForDataset(first),committed={bars:first.bars,source:firstSource,style:'candles'};
  const firstKey=alertDatasetKey(first,2),firstTechnical=technicalContextKey({dataset:first,bars:first.bars,chartId:'cell',replay:null,assumeReplayCompletion:false,selectedSource:null,alerts:[]});
  let latest=first,ticks=0,appended=0,lastLength=first.bars.length;
  const timer=setInterval(()=>{latest=feed.tick();ticks++;if(latest.bars.length>lastLength){appended++;lastLength=latest.bars.length;}
   expect(latest.provenance.revision).toBe(first.provenance.revision);
   expect(latest.provenance.coverage).toBe(first.provenance.coverage);
   const source=sourceContextForDataset(latest);
   expect(sameChartSourceBasis(source,firstSource,true)).toBe(true);
   expect(barInputIdentity(latest.bars)).toBe(barInputIdentity(first.bars));
   expect(chartInputCommitted(committed,{bars:latest.bars,source,style:'candles'})).toBe(true);
  },250);
  vi.advanceTimersByTime(2*60*60*1000);clearInterval(timer);
  expect(ticks).toBe(28800);expect(appended).toBeGreaterThan(100);
  expect(alertDatasetKey(latest,2)).toBe(firstKey);
  expect(technicalContextKey({dataset:latest,bars:latest.bars,chartId:'cell',replay:null,assumeReplayCompletion:false,selectedSource:null,alerts:[]})).toBe(firstTechnical);
  expect(newerLiveBars(first.bars,latest.bars)).toBe(true);expect(newerLiveBars(latest.bars,first.bars)).toBe(false);
 });
 it('a reopened subscription is a different source; ordinary arrays keep exact identity',()=>{
  const a=liveFeed().dataset(),b=liveFeed().dataset();
  expect(a.provenance.revision).not.toBe(b.provenance.revision);expect(sameBarsInput(a.bars,b.bars)).toBe(false);
  const plain=demoDataset('GME').bars,copy=[...plain];expect(sameBarsInput(plain,copy)).toBe(false);expect(barInputIdentity(plain)).not.toBe(barInputIdentity(copy));
 });
 it('stale and connecting feeds are never labelled Live',()=>{
  expect(liveStatusLabel({state:'stale',delaySeconds:0})).toBe('Delayed');
  expect(liveStatusLabel({state:'loading',delaySeconds:0})).toBe('Connecting');
  expect(liveStatusLabel({state:'disconnected',delaySeconds:0})).toBe('Disconnected');
  expect(liveStatusLabel({state:'ready',delaySeconds:0})).toBe('Live');
 });
});

describe('LIVE-SESSION: demo and universe identity survive live growth (no grid reload)',()=>{
 it('demo datasets are generated once and the universe keeps its identity while a feed grows',()=>{
  expect(demoDataset('SPY')).toBe(demoDataset('SPY'));
  const feed=liveFeed();publishLiveDataset(feed.dataset());
  const workspace={symbol:'GME',sourceId:null,imports:[],chartStyle:'candles',themeId:'dark'} as any;
  let universe=stableDatasetUniverse(null,workspaceDatasets(workspace));const opening=universe;
  for(let i=0;i<400;i++){publishLiveDataset(feed.tick());universe=stableDatasetUniverse(universe,workspaceDatasets(workspace));}
  expect(universe).toBe(opening);
  const other=liveFeed('live:alpaca-iex:OTHER:1m');publishLiveDataset(other.dataset());
  expect(stableDatasetUniverse(universe,workspaceDatasets(workspace))).not.toBe(opening);
 });
 it('the live channel delivers every snapshot to subscribers and keeps the newest registered',()=>{
  const feed=liveFeed(),seen:BarDataset[]=[];const off=subscribeLiveDataset('live:alpaca-iex:SYNTH:1m',value=>seen.push(value));
  for(let i=0;i<40;i++)publishLiveDataset(feed.tick());off();publishLiveDataset(feed.tick());
  expect(seen).toHaveLength(40);expect(liveDatasetById('live:alpaca-iex:SYNTH:1m')).not.toBe(seen.at(-1));
 });
});

describe('LIVE-SESSION: owners and guards treat live growth as the same input',()=>{
 it('alert dialog readiness and its observation key survive a 4 Hz stream (alert edit works mid-stream)',()=>{
  const feed=liveFeed(),first=feed.dataset(),observed={dataset:first,bars:first.bars},key=JSON.stringify(alertInputKey(first,first.bars));
  for(let i=0;i<4*60*10;i++){const next=feed.tick();expect(sameAlertInput(observed,{dataset:next,bars:next.bars})).toBe(true);expect(JSON.stringify(alertInputKey(next,next.bars))).toBe(key);}
  const demo=demoDataset('GME');expect(sameAlertInput({dataset:demo,bars:demo.bars},{dataset:demo,bars:[...demo.bars]})).toBe(false);
 });
 it('native capture authority (drawings, indicators, viewport) stays current across ticks',()=>{
  const feed=liveFeed(),first=feed.dataset(),source=sourceContextForDataset(first),configuration={},owner={};
  const desired={bars:first.bars,source,style:'candles'};
  const state:any={controller:owner,desired,accepted:desired,executionIdentity:'ordinary',configuration,acceptedConfiguration:configuration,applying:false,loading:false,settled:true};
  const authority=createNativeCaptureAuthority(owner,{desired,executionIdentity:'ordinary',configuration},()=>state,(_c,input)=>sameBarsInput(input.bars,first.bars));
  for(let i=0;i<200;i++){const next=feed.tick(),nextSource=sourceContextForDataset(next);state.desired={bars:next.bars,source:nextSource,style:'candles'};if(i%3===0)state.accepted=state.desired;expect(authority.isCurrent()).toBe(true);}
  expect(authority.publish(()=>'drawing',value=>value)).toBe('drawing');
 });
 it('a pan or zoom gesture that spans ticks publishes its frame instead of quarantining the chart',()=>{
  const feed=liveFeed();let latest=feed.dataset();const failed:string[]=[];const published:unknown[]=[];
  const chart:any={captureHistoricalFrame:()=>({panes:[{key:{kind:'price'},log:false,mode:'price',invert:false,manualRange:null}],zoom:published.length}),getViewport:()=>({from:1,to:2+ticks})};
  let ticks=0;const state:any={layout:{cells:[{id:'a',group:null}],sync:{}},cells:{a:{chartOptions:{scale:'linear',invert:false,auto:true}}}};
  const gesture=createGridFrameGesture({read:()=>state,cell:()=>({chart,input:{bars:latest.bars,source:sourceContextForDataset(latest),style:'candles'},executionIdentity:'ordinary',fingerprints:{}}),publish:next=>{published.push(next);return true;},failed:(_ids,message)=>failed.push(message)});
  expect(gesture.begin('a')).toBe(true);for(let i=0;i<3;i++){latest=feed.tick();ticks++;}
  gesture.finish();vi.advanceTimersByTime(250);
  expect(failed).toEqual([]);expect(published).toHaveLength(1);gesture.dispose();
 });
 it('the data window keeps a live snapshot that is newer than the throttled UI bars',()=>{
  const feed=liveFeed(),ui=feed.dataset(),source=sourceContextForDataset(ui);let chartBars=ui.bars;for(let i=0;i<300;i++)chartBars=feed.tick().bars;
  const snapshot:any={pending:false,source,series:{count:chartBars.length,firstTime:chartBars[0].time,lastTime:chartBars.at(-1)!.time,style:'candles'},standard:{bar:null},displayed:{bar:chartBars.at(-1)}};
  expect(matchingInspection(snapshot,ui.bars,source,'candles')).toBe(snapshot);
 });
 it('a newer live snapshot is still written to the chart (owned input is not exact input)',async()=>{
  const feed=liveFeed(),first=feed.dataset(),next=feed.tick();let applied:readonly Bar[]=first.bars;const writes:Array<readonly Bar[]>=[];
  const chart={isInputCurrent:(input:{bars:readonly Bar[]})=>sameBarsInput(input.bars,applied),isInputExact:(input:{bars:readonly Bar[]})=>input.bars===applied,ready:async()=>{},setStyle:()=>({ok:true as const}),setBars:async(bars:readonly Bar[])=>{writes.push(bars);applied=bars;return{ok:true as const};}} as any;
  const result=await acceptChartInput(chart,{bars:next.bars,source:sourceContextForDataset(next),style:'candles'},()=>true);
  expect(result.accepted).toBe(true);expect(writes).toEqual([next.bars]);
 });
 it('live growth waits behind a held chart input and the newest snapshot is written on release',async()=>{
  const written:number[]=[];let current={bars:[] as Bar[],source:{datasetId:'x',revision:'1',fixture:false,label:'x'}};
  const queue=createMarketQueue({read:()=>current,write:input=>{current=input;},apply:async bars=>{written.push(bars.length);},disposed:()=>false});
  const hold=queue.reserve();
  const results=[1,2,3].map(n=>queue.set(Array.from({length:n},(_,i)=>({time:i+1,open:1,high:1,low:1,close:1,volume:1})),undefined,undefined,undefined,{deferWhileHeld:true}));
  const refused=await queue.set([],undefined);expect(refused.ok).toBe(false);
  hold.release();
  expect((await Promise.all(results)).every(row=>row.ok)).toBe(true);expect(written).toEqual([3]);
 });
});
