import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {CoinbaseLiveProvider,type CoinbaseBridge,type CoinbaseStatus} from '../../src/domain/coinbase-live';
import {all,mountControlledComponent} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState,resizeMultiChartState,type GridTreeInput} from '../../src/ui/MultiChartGrid';
import {createGridTreeCoordinator,gridCellBars,type GridCellReadiness} from '../../src/chart/grid-tree-coordinator';
import {liveLineageOf,newerLiveBars,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {clearLiveDatasets} from '../../src/ui/live-registry';
import {defaultTheme} from '../../src/ui/themes';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';
import type {Bar,BarDataset} from '../../src/domain/types';

// 1 -> 2x2 on a live Coinbase chart hung 20 s ("The layout change did not
// finish within 20 seconds"). A feed opened cold publishes a 0-bar shell first; the App universe keeps that first dataset
// object through live growth, so the three NEW cells of the staged tree were given 0 bars. A staged cell
// never follows the live channel and a 0-bar live input is never written, so those cells never built a chart and
// waitUntilReady polled until the timeout. SYNTHETIC Coinbase bridge with delayed REST responses; no network.
const T0=Date.UTC(2026,9,28,12,0,0)/1000;
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const status=(state:CoinbaseStatus['state']):CoinbaseStatus=>({schemaVersion:1,state,productIds:['BTC-USD'],attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{}} as CoinbaseStatus);
const candles=(size:number,start:number,end:number)=>{const out:Bar[]=[];for(let t=Math.ceil(start/size)*size;t<=end;t+=size)out.push({time:t,open:100,high:101,low:99,close:100,volume:1});return out;};
function coinbase(){
 const waiting:Array<()=>void>=[];
 const bridge={
  // Every REST reply waits until the test releases it (a slow first backfill: the feed shows its 0-bar shell meanwhile).
  fetchCoinbaseCandles:vi.fn(async(input:any)=>{await new Promise<void>(yes=>waiting.push(yes));return{ok:true as const,value:{schemaVersion:1 as const,productId:input.productId,granularity:input.granularity,seconds:86400,bars:candles(86400,input.start,input.end),provenance:{provider:'synthetic',kind:'public-unauthenticated' as const,sourceUrl:'synthetic',retrievedAt:'',bytes:0,license:''}}};}),
  subscribeCoinbase:vi.fn(async()=>({ok:true as const,value:status('ready')})),unsubscribeCoinbase:vi.fn(async()=>({ok:true as const,value:status('idle')})),onCoinbaseEvent:vi.fn(()=>()=>{}),
 } satisfies CoinbaseBridge;
 return{provider:new CoinbaseLiveProvider(bridge,{now:()=>T0*1000}),release:()=>{for(const run of waiting.splice(0))run();}};
}
/** A cold live open: the universe's dataset (first snapshot, 0 bars) and the shown snapshot after the delayed backfill. */
async function coldLive(){
 const cb=coinbase(),handle=cb.provider.open('BTC-USD','1D');let shown:BarDataset=handle.dataset();handle.onChange(next=>{shown=next;});
 const shell=handle.dataset();await flush();expect(shell.bars).toHaveLength(0);
 cb.release();await flush();cb.release();await flush();
 return{handle,shell,shown:()=>shown};
}
/** The bars MultiChartGrid hands each GridCell of a tree. */
function cellBars(input:GridTreeInput,staging:boolean):Map<string,Bar[]>{
 const ui=mountControlledComponent(()=>MultiChartGrid({state:input.state,datasets:input.datasets,activeBars:input.activeBars,activeDatasetId:input.activeDatasetId,staging,onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 try{return new Map(all(ui.render(),node=>typeof node.type==='function'&&node.type.name==='GridCell').map(node=>[node.props.id as string,node.props.bars as Bar[]]));}finally{ui.dispose();}
}
/** Staged native cells as ChartPanel behaves: a 0-bar live input is never written, so no chart and no readiness. */
function stagedTree(input:GridTreeInput,bars:Map<string,Bar[]>,buildMs:number[]){
 const ready=new Map<string,GridCellReadiness>(),charts=new Map<string,ChartController>(),runtimes=new Map<string,ScriptBindingRuntime>();
 input.state.layout.cells.forEach((row,index)=>{
  const given=bars.get(row.id)!,data=input.datasets[0];if(!given.length)return;
  setTimeout(()=>{ready.set(row.id,{input:{bars:given,source:sourceContextForDataset(data,given),style:input.state.cells[row.id].style},settled:true,error:''});
   charts.set(row.id,{isInputCurrent:()=>true,waitForAnalysisPlacement:async()=>{},saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},suspendTree:()=>({isCurrent:()=>true,resume(){},retire(){},dispose(){}})} as unknown as ChartController);
   let staged=false;runtimes.set(row.id,{prepareBindings:()=>({pauseAndCapture(){},stage(){staged=true;},resume(){},abandon(){},rollback(){},changed:true}),configurationStatus:()=>({state:staged?'ready':'pending',diagnostics:[]})} as unknown as ScriptBindingRuntime);
  },buildMs[index%buildMs.length]);
 });
 return createGridTreeCoordinator({read:()=>input,alive:()=>true,staging:()=>true,controller:id=>charts.get(id)??null,runtime:id=>runtimes.get(id)??null,cell:id=>ready.get(id),holdLinks:()=>({release(){}}),pending(){},failed(){},canonical(){}});
}
function fourChartInput(shell:BarDataset,shown:BarDataset):GridTreeInput{
 const state=resizeMultiChartState(createMultiChartState(shell,{appearance:defaultTheme.appearance}),'four');
 return{state,datasets:[shell],activeBars:shown.bars,activeDatasetId:shell.provenance.datasetId,activeExecutionIdentity:'ordinary'};
}
async function settleWithin(promise:Promise<unknown>,ms:number){let done:unknown='pending';void promise.then(value=>{done=value;},error=>{done=error;});const started=Date.now();while(done==='pending'&&Date.now()-started<ms)await vi.advanceTimersByTimeAsync(25);return{done,ms:Date.now()-started};}

beforeEach(()=>{clearLiveDatasets();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date'],now:T0*1000});});
afterEach(()=>{clearLiveDatasets();vi.useRealTimers();});

describe('DIAG-2X2-1028 the 1 -> 2x2 hang on a live chart',()=>{
 it('repro: a cold feed keeps its 0-bar first snapshot as the universe dataset; the shown snapshot is newer growth of it',async()=>{
  const live=await coldLive();
  expect(live.shown().bars.length).toBeGreaterThan(100);
  expect(liveLineageOf(live.shell.bars)?.key).toBe(liveLineageOf(live.shown().bars)?.key);
  expect(newerLiveBars(live.shell.bars,live.shown().bars)).toBe(true);
  // Without the fix every new cell was given the shell: the staged coordinator never sees those charts and times out.
  const input=fourChartInput(live.shell,live.shown()),before=new Map(input.state.layout.cells.map(row=>[row.id,row.id===input.state.layout.activeCellId?input.activeBars:live.shell.bars]));
  const wait=await settleWithin(stagedTree(input,before,[40]).waitUntilReady(input,new AbortController().signal),3000);
  expect(wait.done).toBe('pending');
  live.handle.close();
 });
 it('every cell of the staged 2x2 tree gets the shown bars, and the native wait settles at once (20 tries, delayed builds)',async()=>{
  for(let attempt=0;attempt<20;attempt++){
   const live=await coldLive(),input=fourChartInput(live.shell,live.shown()),bars=cellBars(input,true);
   expect(bars.size).toBe(4);
   for(const value of bars.values())expect(value).toBe(live.shown().bars);
   const result=await settleWithin(stagedTree(input,bars,[10+attempt*7,60,25,90]).waitUntilReady(input,new AbortController().signal),1000);
   expect(result.done instanceof Error?result.done.message:typeof result.done).toBe('object');
   expect(result.ms).toBeLessThan(1000);
   live.handle.close();clearLiveDatasets();
  }
 });
 it('the rule is narrow: non-empty, other-lineage and non-live dataset bars are kept exactly',async()=>{
  const live=await coldLive(),shown=live.shown().bars,active='a';
  expect(gridCellBars(active,active,live.shell.bars,shown)).toBe(shown);
  expect(gridCellBars('b',active,live.shell.bars,shown)).toBe(shown);
  const cached=shown.slice(0,5);stampLiveLineage(cached,liveLineageOf(shown)!.key,0);
  expect(gridCellBars('b',active,cached,shown)).toBe(cached);
  const other:Bar[]=[];stampLiveLineage(other,'live:other|1',1);
  expect(gridCellBars('b',active,other,shown)).toBe(other);
  const plain:Bar[]=[];expect(gridCellBars('b',active,plain,shown)).toBe(plain);
  expect(gridCellBars('b',active,live.shell.bars,[])).toBe(live.shell.bars);
  live.handle.close();
 });
});
