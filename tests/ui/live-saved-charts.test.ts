import {afterEach,describe,expect,it} from 'vitest';
import {CoinbaseLiveProvider,coinbaseSearchDatasets,type CoinbaseBridge} from '../../src/domain/coinbase-live';
import {isLiveDatasetId,completedBarsDataset,isFormingLiveDataset} from '../../src/domain/live-provider';
import {clearLiveDatasets,liveDatasetById,registerLiveDataset} from '../../src/ui/live-registry';
import {liveChartsOf,persistableWorkspace,reconnectLiveCharts,restoreLiveCharts,disconnectedLiveMessage} from '../../src/ui/live-workspace';
import {patchWorkspace,selectedDataset} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {createPaperAccount} from '../../src/domain/paper';
import {backtestStrategy} from '../../src/domain/strategy';
import {replayStartCandidate,replayTimeline,replayChartFrame} from '../../src/domain/replay-session';
import {closedViewDataset} from '../../src/domain/watchlist-alerts';
import {scriptDataFooter,scriptDataKind,scriptProvenanceLabel} from '../../src/ui/script-jobs';

const t0=1_700_000_000;
function bridge():CoinbaseBridge{
 const status={schemaVersion:1 as const,state:'ready' as const,attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 return{
  fetchCoinbaseCandles:async input=>({ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:300,bars:[
   {time:t0,open:100,high:101,low:99,close:100.5,volume:2},{time:t0+300,open:100.5,high:102,low:100,close:101,volume:3},{time:t0+600,open:101,high:103,low:100,close:102,volume:1}],provenance:{provider:'test',kind:'public-unauthenticated',sourceUrl:'https://example.invalid/',retrievedAt:'2026-10-20T00:00:00Z',bytes:1,license:'test'}}}),
  subscribeCoinbase:async()=>({ok:true,value:status}),unsubscribeCoinbase:async()=>({ok:true,value:status}),onCoinbaseEvent:()=>()=>{},
 };
}
afterEach(()=>clearLiveDatasets());
async function liveChart(){
 const provider=new CoinbaseLiveProvider(bridge()),handle=provider.open('BTC-USD','5m');
 await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));
 registerLiveDataset(handle.dataset());
 return{provider,handle,opened:patchWorkspace(createInitialWorkspace(),{symbol:'BTC-USD',sourceId:handle.datasetId})};
}
const off={coinbase:false,alpacaKey:false},on={coinbase:true,alpacaKey:false};

describe('saved live charts keep a reference, not bars',()=>{
 it('saves provider, symbol and interval per chart cell and nothing else',async()=>{
  const {provider,handle,opened}=await liveChart(),safe=persistableWorkspace(opened) as Record<string,unknown>;
  const cell=opened.grid.layout.activeCellId;
  expect(safe.liveCharts).toEqual({[cell]:{providerId:'coinbase-public',symbol:'BTC-USD',interval:'5m'}});
  expect(JSON.stringify(safe.grid)).not.toContain('live:');
  expect(JSON.stringify(safe)).not.toMatch(/secret|apiKey/i);
  handle.close();provider.dispose();
 });
 it('survives the real save path and restore',async()=>{
  const {provider,handle,opened}=await liveChart(),cell=opened.grid.layout.activeCellId;
  const data=prepareWorkspaceData({...persistableWorkspace(opened),paper:createPaperAccount({initialBalance:500}),alerts:[]});
  expect(liveChartsOf(data.workspace)[cell]).toEqual({providerId:'coinbase-public',symbol:'BTC-USD',interval:'5m'});
  handle.close();provider.dispose();
 });
 it('rejects malformed references strictly but tolerates older workspaces',()=>{
  expect(()=>restoreLiveCharts({a:{providerId:'coinbase-public',symbol:'BTC-USD',interval:'5m',apiKey:'x'}})).toThrow();
  expect(()=>restoreLiveCharts({a:{providerId:'nope',symbol:'BTC-USD',interval:'5m'}})).toThrow();
  expect(()=>restoreLiveCharts({a:{providerId:'coinbase-public',symbol:'BTC-USD',interval:'7s'}})).toThrow();
  expect(()=>restoreLiveCharts([])).toThrow();
  const state=createInitialWorkspace();
  expect(liveChartsOf(state)).toEqual({});
  expect(()=>prepareWorkspaceData({...state,paper:createPaperAccount({initialBalance:500}),alerts:[]})).not.toThrow();
  expect(liveChartsOf({liveCharts:{a:{providerId:'x'},b:5}})).toEqual({});
 });
});

describe('reopening a saved live chart',()=>{
 async function saved(){
  const {provider,handle,opened}=await liveChart(),safe=persistableWorkspace(opened);
  handle.close();provider.dispose();clearLiveDatasets();
  return safe;
 }
 it('with the source off shows a Disconnected chart with a plain Data sources message, not the synthetic demo',async()=>{
  const safe=await saved(),result=reconnectLiveCharts(safe,off);
  const chart=selectedDataset(result.workspace);
  expect(isLiveDatasetId(chart.provenance.datasetId)).toBe(true);expect(chart.provenance.fixture).toBe(false);
  expect(chart.provenance.state).toBe('disconnected');expect(chart.bars).toEqual([]);expect(chart.resolution).toBe('5m');expect(result.workspace.symbol).toBe('BTC-USD');
  expect(result.reopen).toEqual([]);expect(result.disconnected).toHaveLength(1);
  expect(result.disconnected[0].message).toBe(disconnectedLiveMessage({providerId:'coinbase-public',symbol:'BTC-USD'}));
  expect(result.disconnected[0].message).toMatch(/Data sources/);expect(result.disconnected[0].message).not.toMatch(/live:|coinbase-public|synthetic/i);
  // The stand-in never reaches storage.
  expect(JSON.stringify(persistableWorkspace(result.workspace).grid)).not.toContain('live:');
  expect(Object.keys(liveChartsOf(persistableWorkspace(result.workspace)))).toHaveLength(1);
 });
 it('with the source on asks the app to reopen exactly that feed, under the id the feed will use',async()=>{
  const safe=await saved(),result=reconnectLiveCharts(safe,on);
  expect(result.disconnected).toEqual([]);expect(result.reopen).toEqual([{cellId:safe.grid!.layout.activeCellId,providerId:'coinbase-public',symbol:'BTC-USD',interval:'5m'}]);
  const chart=selectedDataset(result.workspace);
  expect(chart.provenance.state).toBe('loading');
  expect(chart.provenance.datasetId).toBe(coinbaseSearchDatasets(true,'5m').find(row=>row.instrument.symbol==='BTC-USD')!.provenance.datasetId);
  expect(liveDatasetById(chart.provenance.datasetId)).toBeDefined();
 });
 it('leaves a workspace with no saved live chart untouched (same identity)',()=>{
  const state=createInitialWorkspace();expect(reconnectLiveCharts(state,on).workspace).toBe(state);
 });
});

describe('completed bars only',()=>{
 const bar=(i:number)=>({time:t0+i*300,open:100,high:101,low:99,close:100,volume:1});
 const dataset=async()=>{const {provider,handle}=await liveChart();const live=handle.dataset();const c=()=>{handle.close();provider.dispose();};return{live,c};};
 it('treats the last bar of a live dataset as forming and nothing else',async()=>{
  const {live,c}=await dataset();
  expect(isFormingLiveDataset(live)).toBe(true);expect(completedBarsDataset(live).bars).toHaveLength(live.bars.length-1);
  const plain={...live,provenance:{...live.provenance,datasetId:'local:x'}};expect(completedBarsDataset(plain)).toBe(plain);c();
 });
 it('replay cannot start on, step onto, or show the forming live bar',async()=>{
  const {live,c}=await dataset(),last=live.bars.at(-1)!;
  expect(replayStartCandidate(live,last.time).ok).toBe(false);
  expect(replayStartCandidate(live,live.bars[0].time).ok).toBe(true);
  expect(replayTimeline([live])).toHaveLength(live.bars.length-1);
  expect(replayChartFrame(live,last.time+10_000).bars.map(row=>row.time)).not.toContain(last.time);c();
 });
 it('list alerts see the closed view of a live dataset',async()=>{
  const {live,c}=await dataset();expect(closedViewDataset(live).bars).toHaveLength(live.bars.length-1);c();
 });
 it('strategy fills ignore the forming bar',()=>{
  const bars=[bar(0),bar(1),bar(2),{...bar(3),open:100,high:500,low:1,close:100}];
  const run=(exclude:boolean)=>backtestStrategy({bars,signals:[{barIndex:1,orders:[{action:'buy',quantity:1,type:'market'} as never]},{barIndex:3,orders:[{action:'sell',quantity:1,type:'market'} as never]}],excludeFormingBar:exclude});
  const all=run(false),closed=run(true);
  expect(closed.equity.length).toBe(bars.length-1);expect(all.equity.length).toBe(bars.length);
  expect(closed.fills.every(fill=>fill.barIndex<bars.length-1)).toBe(true);
  expect(closed.orders.every(order=>order.createdBar<bars.length-1)).toBe(true);
 });
});

describe('script panel data wording',()=>{
 it('never calls live data local history',()=>{
  expect(scriptDataKind({fixture:false,live:true})).toBe('live');expect(scriptDataKind({fixture:true,live:true})).toBe('synthetic');expect(scriptDataKind({fixture:false})).toBe('imported');
  expect(scriptProvenanceLabel('live','BTC-USD 5m')).not.toMatch(/local/i);expect(scriptDataFooter('live')).toBe('Live market data');
  expect(scriptProvenanceLabel('imported','X')).toMatch(/local history/);expect(scriptDataFooter('imported')).toBe('Local imported data');
 });
});
