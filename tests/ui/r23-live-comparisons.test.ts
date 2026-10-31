import {afterEach,describe,expect,it} from 'vitest';
import {alpacaSearchDatasets,ALPACA_IEX_PROVIDER_ID} from '../../src/domain/alpaca-live';
import type {BarDataset} from '../../src/domain/types';
import {clearLiveDatasets,liveDatasetById,registerLiveDataset} from '../../src/ui/live-registry';
import {gridReferencesDataset,liveComparisonsOf,persistableWorkspace,reconnectLiveCharts,restoreLiveComparisons} from '../../src/ui/live-workspace';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {createPaperAccount} from '../../src/domain/paper';
import {fixtureDataset} from '../../src/domain/fixtures';

// A live comparison is saved as a reference (feed, symbol, interval and its own
// settings) and comes back on restore, asking the app to reopen its feed. Synthetic bars only; no network, no key.
const t0=1_700_000_000;
function live(symbol:string,interval='5m'):BarDataset{
 const shell=alpacaSearchDatasets(true,[symbol],interval).find(row=>row.instrument.symbol===symbol)!;
 const bars=[0,1,2].map(i=>({time:t0+i*300,open:10+i,high:11+i,low:9+i,close:10.5+i,volume:100}));
 const dataset={...shell,bars};registerLiveDataset(dataset);return dataset;
}
const settings={mode:'percent' as const,color:'#ffb74d',width:2,visible:true,baseline:'first-visible-match' as const};
function gmeWithSpy(){
 const gme=live('GME'),spy=live('SPY');
 const opened=patchWorkspace(createInitialWorkspace(),{symbol:'GME',sourceId:gme.provenance.datasetId});
 const withCompare=patchWorkspace(opened,{comparisons:[{id:'cmp-qqq-demo',datasetId:fixtureDataset('QQQ',50).provenance.datasetId,...settings},{id:'cmp-spy',datasetId:spy.provenance.datasetId,...settings,color:'#42a5f5'}]} as never);
 return{gme,spy,workspace:withCompare,cell:withCompare.grid!.layout.activeCellId};
}
const on={coinbase:false,alpacaKey:true},off={coinbase:false,alpacaKey:false};
afterEach(()=>clearLiveDatasets());

describe('saving a live comparison',()=>{
 it('keeps a reference with the comparison settings and its place, never bars or a key',()=>{
  const {workspace,cell}=gmeWithSpy(),demoId=workspace.grid!.cells[cell].comparisons[0].datasetId;
  const safe=persistableWorkspace(workspace) as Record<string,unknown>;
  expect(safe.liveComparisons).toEqual({[cell]:[{providerId:ALPACA_IEX_PROVIDER_ID,symbol:'SPY',interval:'5m',position:1,comparison:{id:'cmp-spy',...settings,color:'#42a5f5'}}]});
  expect(JSON.stringify(safe.grid)).not.toContain('live:');
  expect(JSON.stringify(safe.liveComparisons)).not.toMatch(/bars|close|secret|apiKey/i);
  // The non-live comparison stays in the cell as before.
  expect((safe as any).grid.cells[cell].comparisons.map((row:any)=>row.datasetId)).toEqual([demoId]);
 });
 it('survives the real save path, and restore is strict about the stored shape',()=>{
  const {workspace,cell}=gmeWithSpy();
  const data=prepareWorkspaceData({...persistableWorkspace(workspace),paper:createPaperAccount({initialBalance:500}),alerts:[]});
  expect(liveComparisonsOf(data.workspace)[cell]?.[0]).toMatchObject({symbol:'SPY',comparison:{id:'cmp-spy'}});
  const good={a:[{providerId:ALPACA_IEX_PROVIDER_ID,symbol:'SPY',interval:'5m',position:0,comparison:{id:'x',...settings}}]};
  expect(restoreLiveComparisons(good)).toEqual(good);
  expect(()=>restoreLiveComparisons({a:[{...good.a[0],apiKey:'x'}]})).toThrow();
  expect(()=>restoreLiveComparisons({a:[{...good.a[0],comparison:{...good.a[0].comparison,dataset:{bars:[]}}}]})).toThrow();
  expect(()=>restoreLiveComparisons({a:[{...good.a[0],interval:'7s'}]})).toThrow();
  expect(()=>restoreLiveComparisons({a:[{...good.a[0],position:-1}]})).toThrow();
  expect(()=>restoreLiveComparisons({a:[good.a[0],good.a[0]]})).toThrow();
  expect(()=>restoreLiveComparisons([])).toThrow();
  expect(liveComparisonsOf({liveComparisons:{a:[{providerId:'x'}],b:5}})).toEqual({});
 });
 it('a layout with no live comparison is unchanged, and a stale reference is not written back',()=>{
  const state=createInitialWorkspace();expect(persistableWorkspace(state)).toBe(state);
  const stale={...state,liveComparisons:{[state.grid!.layout.activeCellId]:[{providerId:ALPACA_IEX_PROVIDER_ID,symbol:'SPY',interval:'5m',position:0,comparison:{id:'gone',...settings}}]}};
  expect(Object.hasOwn(persistableWorkspace(stale),'liveComparisons')).toBe(false);
 });
});

describe('reopening a saved live comparison',()=>{
 function saved(){const {workspace,cell}=gmeWithSpy(),safe=persistableWorkspace(workspace);clearLiveDatasets();return{safe,cell};}
 it('with the source on: SPY is back in the same place with the same settings, and the app is asked to reopen its feed',()=>{
  const {safe,cell}=saved(),result=reconnectLiveCharts(safe,on);
  const rows=result.workspace.grid!.cells[cell].comparisons;
  expect(rows.map(row=>row.id)).toEqual(['cmp-qqq-demo','cmp-spy']);
  const spyId=alpacaSearchDatasets(true,['SPY'],'5m')[0].provenance.datasetId;
  expect(rows[1]).toEqual({id:'cmp-spy',datasetId:spyId,...settings,color:'#42a5f5'});
  expect(liveDatasetById(spyId)?.provenance.state).toBe('loading');
  expect(result.reopen).toEqual(expect.arrayContaining([{cellId:cell,providerId:ALPACA_IEX_PROVIDER_ID,symbol:'SPY',interval:'5m'},{cellId:cell,providerId:ALPACA_IEX_PROVIDER_ID,symbol:'GME',interval:'5m'}]));
  expect(result.workspace.symbol).toBe('GME');
  // The reopened feed stays open: a comparison names it.
  expect(gridReferencesDataset(result.workspace.grid,spyId)).toBe(true);
  // Saving again writes the same reference.
  expect(liveComparisonsOf(persistableWorkspace(result.workspace))).toEqual(liveComparisonsOf(safe));
 });
 it('with the source off: SPY is shown Disconnected with the Data sources message; turning the source on reopens it',()=>{
  const {safe,cell}=saved(),result=reconnectLiveCharts(safe,off);
  const spyId=alpacaSearchDatasets(true,['SPY'],'5m')[0].provenance.datasetId;
  expect(result.workspace.grid!.cells[cell].comparisons.map(row=>row.datasetId)).toContain(spyId);
  expect(liveDatasetById(spyId)?.provenance.state).toBe('disconnected');
  expect(result.reopen).toEqual([]);
  expect(result.disconnected.some(row=>/SPY is a live chart from Alpaca/.test(row.message)&&/Data sources/.test(row.message))).toBe(true);
  const later=reconnectLiveCharts(result.workspace,on);
  expect(later.reopen).toEqual(expect.arrayContaining([{cellId:cell,providerId:ALPACA_IEX_PROVIDER_ID,symbol:'SPY',interval:'5m'}]));
  expect(liveDatasetById(spyId)?.provenance.state).toBe('loading');
 });
 it('a comparison removed after the restore is not put back by a later reconnect',()=>{
  const {safe,cell}=saved(),first=reconnectLiveCharts(safe,on);
  const removed=patchWorkspace(first.workspace,{comparisons:first.workspace.grid!.cells[cell].comparisons.filter(row=>row.id!=='cmp-spy')} as never);
  const again=reconnectLiveCharts(removed,on);
  expect(again.workspace.grid!.cells[cell].comparisons.map(row=>row.id)).toEqual(['cmp-qqq-demo']);
  expect(again.reopen.some(row=>row.symbol==='SPY')).toBe(false);
 });
 it('names the feed in use only for charts and comparisons that hold it',()=>{
  const {workspace,spy}=gmeWithSpy();
  expect(gridReferencesDataset(workspace.grid,spy.provenance.datasetId)).toBe(true);
  expect(gridReferencesDataset(workspace.grid,'live:alpaca-iex:QQQ:5m')).toBe(false);
 });
});
