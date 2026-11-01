import {afterEach,describe,expect,it,vi} from 'vitest';
import {CoinbaseLiveProvider,coinbaseSearchDatasets,type CoinbaseBridge} from '../../src/domain/coinbase-live';
import {alpacaSearchDatasets} from '../../src/domain/alpaca-live';
import {describeSourceRevision} from '../../src/domain/data';
import {isLiveDatasetId,isLiveProviderId,liveStatusLabel} from '../../src/domain/live-provider';
import {buildSymbolSearchCandidates,searchSymbols,sourceLabel,switchRequest,createSymbolSearchSession} from '../../src/ui/symbol-search';
import {chartSourceCsv,chartSourceTermsLabel} from '../../src/ui/chart-source-export';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {liveDataOf,liveSiblings,persistableWorkspace,restoreLiveData} from '../../src/ui/live-workspace';
import {patchWorkspace,selectedDataset,workspaceDatasets} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {createPaperAccount} from '../../src/domain/paper';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';

// Coinbase live app wiring. Pure domain/UI-state checks with a mocked bridge. No network, no timers, no app launch.
const t0=1_700_000_000;
function bridge():CoinbaseBridge&{calls:string[]}{
 const calls:string[]=[];
 const status={schemaVersion:1 as const,state:'ready' as const,attempt:0,lastMessageAt:null,liveMessages:false,lastError:null,counters:{},productIds:['BTC-USD']};
 return{calls,
  fetchCoinbaseCandles:async input=>{calls.push('fetch:'+input.productId);return{ok:true,value:{schemaVersion:1,productId:input.productId,granularity:input.granularity,seconds:300,bars:[
   {time:t0,open:100,high:101,low:99,close:100.5,volume:2},{time:t0+300,open:100.5,high:102,low:100,close:101,volume:3}],provenance:{provider:'test',kind:'public-unauthenticated',sourceUrl:'https://example.invalid/',retrievedAt:'2026-10-20T00:00:00Z',bytes:1,license:'test'}}};},
  subscribeCoinbase:async input=>{calls.push('subscribe:'+input.productIds.join(','));return{ok:true,value:status};},
  unsubscribeCoinbase:async()=>{calls.push('unsubscribe');return{ok:true,value:status};},
  onCoinbaseEvent:()=>()=>{},
 };
}
afterEach(()=>clearLiveDatasets());

describe('Live source kind in symbol search',()=>{
 it('marks Coinbase rows Live, openable, with their dataset id as the source id',()=>{
  const state=createInitialWorkspace(),rows=buildSymbolSearchCandidates([...workspaceDatasets(state),...coinbaseSearchDatasets(true,'5m')],state.imports).filter(row=>row.providerId==='coinbase-public');
  expect(rows.map(row=>row.symbol).sort()).toEqual(['BTC-USD','ETH-USD','SOL-USD']);
  for(const row of rows){expect(row.sourceKind).toBe('live');expect(sourceLabel(row)).toBe('Live');expect(row.openable).toBe(true);expect(row.sourceId).toBe(row.datasetId);expect(row.synthetic).toBe(false);expect(row.datasetId.startsWith('live:')).toBe(true);}
 });
 it('adds no live rows when disabled or when no Alpaca key is saved',()=>{
  expect(coinbaseSearchDatasets(false)).toEqual([]);expect(alpacaSearchDatasets(false,['AAPL'])).toEqual([]);
  const rows=alpacaSearchDatasets(true,['AAPL','MSFT'],'5m');expect(rows).toHaveLength(2);
  const state=createInitialWorkspace(),found=buildSymbolSearchCandidates([...workspaceDatasets(state),...rows],state.imports).filter(row=>row.providerId==='alpaca-iex');
  expect(found.map(row=>[row.symbol,row.sourceKind])).toEqual([['AAPL','live'],['MSFT','live']]);
 });
 it('filters Live only, and Imported only excludes live rows',()=>{
  const state=createInitialWorkspace(),all=buildSymbolSearchCandidates([...workspaceDatasets(state),...coinbaseSearchDatasets(true)],state.imports);
  expect(searchSymbols(all,'BTC',{assetClass:'all',source:'live'}).rows.map(row=>row.symbol)).toEqual(['BTC-USD']);
  expect(searchSymbols(all,'BTC',{assetClass:'all',source:'imported'}).rows.filter(row=>row.sourceKind==='live')).toEqual([]);
  expect(searchSymbols(all,'',{assetClass:'all',source:'live'}).rows.every(row=>row.sourceKind==='live')).toBe(true);
 });
 it('switch request carries the live provider so the app opens a feed instead of an import',()=>{
  const state=createInitialWorkspace(),row=buildSymbolSearchCandidates(coinbaseSearchDatasets(true),state.imports)[0],request=switchRequest(row,'toolbar');
  expect(isLiveProviderId(request.providerId)).toBe(true);expect(request.resolution).toBe('5m');
  const session=createSymbolSearchSession(),ticket=session.begin();
  const accepted=vi.fn(()=>true);expect(session.choose(ticket,row,[row],row.symbol,accepted)).toBe(true);expect(accepted).toHaveBeenCalledOnce();
 });
});

describe('live datasets are their own kind, never local imports',()=>{
 it('describes a live revision plainly',()=>{expect(describeSourceRevision('live-v1:k3j9:42','live:coinbase-public:BTC-USD:5m')).toBe('Live, update 42');});
 it('plain status: Live, Delayed 15 min, Disconnected',()=>{
  expect(liveStatusLabel({state:'ready',delaySeconds:0})).toBe('Live');
  expect(liveStatusLabel({state:'ready',delaySeconds:900})).toBe('Delayed 15 min');
  expect(liveStatusLabel({state:'disconnected',delaySeconds:0})).toBe('Disconnected');
  expect(liveStatusLabel({state:'error',delaySeconds:900})).toBe('Disconnected');
 });
 it('exposes the other supported intervals of the open feed, never resampled',async()=>{
  const provider=new CoinbaseLiveProvider(bridge()),handle=provider.open('BTC-USD','5m'),siblings=liveSiblings(handle.dataset());
  expect(siblings.map(row=>row.resolution).sort()).toEqual(['15m','1D','1m','360m','60m'].sort());
  expect(siblings.every(row=>isLiveDatasetId(row.provenance.datasetId)&&row.bars.length===0)).toBe(true);
  handle.close();provider.dispose();
 });
 it('source CSV of live bars is gated by bar count, not by the provider, and carries the provider terms',async()=>{
  const provider=new CoinbaseLiveProvider(bridge()),handle=provider.open('BTC-USD','5m');
  expect(()=>chartSourceCsv({bars:[],source:{datasetId:handle.datasetId}} as never,'ordinary')).toThrow('Source CSV requires 1 through 1,000,000 supplied bars.');
  expect(chartSourceTermsLabel({datasetId:handle.datasetId,fixture:false,label:'Coinbase public market data'} as never)).toBe('Coinbase public market data');
  handle.close();provider.dispose();
 });
});

describe('opening a live feed on the chart and saving',()=>{
 async function liveWorkspace(){
  const b=bridge(),provider=new CoinbaseLiveProvider(b),handle=provider.open('BTC-USD','5m');
  await Promise.resolve();await new Promise(resolve=>setTimeout(resolve,0));
  registerLiveDataset(handle.dataset());
  const opened=patchWorkspace(createInitialWorkspace(),{symbol:'BTC-USD',sourceId:handle.datasetId});
  return{b,provider,handle,opened};
 }
 it('resolves the live source for the active chart',async()=>{
  const {provider,handle,opened}=await liveWorkspace();
  expect(opened.sourceId).toBe(handle.datasetId);expect(selectedDataset(opened).provenance.providerId).toBe('coinbase-public');
  expect(opened.grid.cells[opened.grid.layout.activeCellId].datasetId).toBe(handle.datasetId);
  handle.close();provider.dispose();
 });
 it('writes the workspace without live bars or live ids, and the result restores',async()=>{
  const {provider,handle,opened}=await liveWorkspace();
  const safe=persistableWorkspace(opened);
  expect(JSON.stringify(safe.grid)).not.toContain('live:');expect(safe.sourceId).toBeNull();expect(safe.symbol).toBe('BTC-USD');
  const data=prepareWorkspaceData({...safe,paper:createPaperAccount({initialBalance:500}),alerts:[]}).data;
  expect(JSON.stringify(data)).not.toContain('live:coinbase');
  // The unsanitized state is rejected: proof that the sanitizer is what makes saves restorable.
  expect(()=>prepareWorkspaceData({...opened,paper:createPaperAccount({initialBalance:500}),alerts:[]})).toThrow();
  handle.close();provider.dispose();
 });
 it('keeps ordinary workspaces untouched (same identity)',()=>{const state=createInitialWorkspace();expect(persistableWorkspace(state)).toBe(state);});
 it('workspace export of a live chart carries no live id',async()=>{
  const {provider,handle,opened}=await liveWorkspace();
  expect(JSON.stringify(prepareWorkspaceJSON({...persistableWorkspace(opened)}))).not.toContain('live:');
  handle.close();provider.dispose();
 });
});

describe('persisted live-data choices',()=>{
 it('default off and stay off without a saved value',()=>{expect(liveDataOf(createInitialWorkspace())).toEqual({coinbase:false,alpacaSymbols:[]});});
 it('round-trips through a saved workspace and rejects malformed values',()=>{
  const state={...createInitialWorkspace(),liveData:{coinbase:true,alpacaSymbols:['AAPL','BRK.B']}};
  const data=prepareWorkspaceData({...state,paper:createPaperAccount({initialBalance:500}),alerts:[]});
  expect(liveDataOf(data.workspace)).toEqual({coinbase:true,alpacaSymbols:['AAPL','BRK.B']});
  expect(()=>restoreLiveData({coinbase:'yes',alpacaSymbols:[]})).toThrow();
  expect(()=>restoreLiveData({coinbase:true,alpacaSymbols:['not a symbol']})).toThrow();
  expect(()=>restoreLiveData({coinbase:true,alpacaSymbols:[],apiKey:'x'})).toThrow();
 });
});
