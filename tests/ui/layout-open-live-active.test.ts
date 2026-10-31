import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {alpacaSearchDatasets,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import {coinbaseSearchDatasets} from '../../src/domain/coinbase-live';
import type {BarDataset} from '../../src/domain/types';
import {createPaperAccount} from '../../src/domain/paper';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createLayoutLibrary,duplicateSavedLayout,openedLayout,type LayoutLibrary} from '../../src/ui/layout-library';
import {createMultiChartState,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {ensureWorkspaceGrid,projectGrid,selectedDataset} from '../../src/ui/workspace-grid';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {persistableWorkspace} from '../../src/ui/live-workspace';
import {liveTabGrid} from '../../src/ui/layout-tabs-live';
import {NEW_TAB_LAYOUT_NAME} from '../../src/ui/layout-tabs';
import {defaultTheme} from '../../src/ui/themes';

// SYNTHETIC bars only. Mirrors App's layout create (New tab, Ctrl+T, Create and open) and open (a recent layout)
// with the active chart on a live feed: the opened workspace is validated the way it would be saved.
type Workspace=ReturnType<typeof createInitialWorkspace>&{grid:MultiChartState;layoutLibrary:LayoutLibrary};
const day=86400,times=Array.from({length:30},(_,index)=>1749945600+index*day);
function live(symbol:string,interval='1D'):BarDataset{
 const source=alpacaSearchDatasets(true,[symbol],interval).find(row=>row.instrument.symbol===symbol)!;
 const result:BarDataset={...source,bars:times.map((time,index)=>({time,open:100+index,high:102+index,low:99+index,close:101+index,volume:10+index})),provenance:{...source.provenance,state:'ready',asOf:times.at(-1)!+day,revision:'synthetic-layout-open'}};
 registerLiveDataset(result);return result;
}
const on={coinbase:true,alpacaKey:true};
const paperOf=()=>({paper:createPaperAccount({initialBalance:5000}),alerts:[]});
/** App.openSavedLayout's projection and its pre-transition validation. */
function openLayout(expected:Workspace,id:string,validate:(next:Workspace)=>Workspace):Workspace{
 const book=openedLayout(expected.layoutLibrary,id),opened=liveTabGrid(expected,book.grid,on,expected.grid.layout.id);
 const next=projectGrid({...expected,layoutLibrary:book.library},opened.grid) as Workspace;
 prepareWorkspaceData(JSON.parse(JSON.stringify({...validate(next),...paperOf()})));return next;
}
/** App.layoutAction 'create': one chart of the active chart's symbol and interval. */
function createLayout(expected:Workspace,active:BarDataset):{next:Workspace;id:string}{
 const original=createMultiChartState(active,{appearance:defaultTheme.appearance,themeId:defaultTheme.id,chartOptions:{source:'close',scale:'linear',invert:false,auto:true,timezone:'UTC'}});
 const copy=duplicateSavedLayout(expected.layoutLibrary,expected.grid,original,NEW_TAB_LAYOUT_NAME,Date.now(),()=>crypto.randomUUID());
 return {next:{...expected,layoutLibrary:copy.library},id:copy.entry.id};
}
const persisted=(next:Workspace)=>persistableWorkspace(next) as Workspace;
beforeEach(()=>{clearLiveDatasets();selectAlpacaSyntheticStub(false);});
afterEach(()=>clearLiveDatasets());

describe('opening a layout while the active chart is a live feed',()=>{
 it('a new tab opens with the active live symbol and interval in a single chart',()=>{
  const gme=live('GME'),grid=createMultiChartState(gme,{appearance:defaultTheme.appearance});
  const current=projectGrid({...createInitialWorkspace(),layoutLibrary:createLayoutLibrary(grid)},grid) as Workspace;
  expect(current.sourceId).toBe('live:alpaca-iex:GME:1D');
  const {next,id}=createLayout(current,gme);
  // The unsanitized workspace names a live feed as its selected source, which no saved file may hold.
  expect(()=>openLayout(next,id,value=>value)).toThrow('Selected dataset is missing.');
  const opened=openLayout(next,id,persisted);
  expect(opened.layoutLibrary.activeId).toBe(id);expect(opened.grid.layout.cells).toHaveLength(1);
  expect(opened.grid.layout.cells[0]).toMatchObject({symbol:'GME',interval:'1D'});
  expect(opened.grid.cells[opened.grid.layout.activeCellId].datasetId).toBe('live:alpaca-iex:GME:1D');
  expect(selectedDataset(opened)).toBe(gme);
 });
 it('a recent layout opens from a live chart, and back again',()=>{
  const gme=live('GME'),grid=createMultiChartState(gme,{appearance:defaultTheme.appearance});
  const current=projectGrid({...createInitialWorkspace(),layoutLibrary:createLayoutLibrary(grid)},grid) as Workspace,first=current.layoutLibrary.activeId;
  const demo=ensureWorkspaceGrid(createInitialWorkspace()).grid,copy=duplicateSavedLayout(current.layoutLibrary,current.grid,demo,'Demo',Date.now(),()=>crypto.randomUUID()),demoId=copy.entry.id;
  const withDemo={...current,layoutLibrary:copy.library};
  const demoOpen=openLayout(withDemo,demoId,persisted);expect(demoOpen.sourceId).toBeNull();
  const back=openLayout(demoOpen,first,persisted);expect(back.grid.cells[back.grid.layout.activeCellId].datasetId).toBe('live:alpaca-iex:GME:1D');
 });
 it('a fresh example-data profile still creates and opens a new tab on the active symbol',()=>{
  const fresh=ensureWorkspaceGrid(createInitialWorkspace()),current={...fresh,layoutLibrary:createLayoutLibrary(fresh.grid)} as Workspace;
  const {next,id}=createLayout(current,selectedDataset(current));
  const opened=openLayout(next,id,persisted);expect(opened.layoutLibrary.activeId).toBe(id);expect(opened.grid.layout.cells[0].symbol).toBe(current.symbol);
 });
 it('fresh profile, Coinbase BTC-USD active: clicking another existing tab opens it, and back again',()=>{
  const fresh=ensureWorkspaceGrid(createInitialWorkspace()),demoGrid=fresh.grid;
  const source=coinbaseSearchDatasets(true,'1h').find(row=>row.instrument.symbol==='BTC-USD')!;
  const btc:BarDataset={...source,bars:times.map((time,index)=>({time,open:100+index,high:102+index,low:99+index,close:101+index,volume:10+index})),provenance:{...source.provenance,state:'ready',asOf:times.at(-1)!+day,revision:'synthetic-layout-open'}};registerLiveDataset(btc);
  const grid=createMultiChartState(btc,{appearance:defaultTheme.appearance}),library=createLayoutLibrary(grid),copy=duplicateSavedLayout(library,grid,demoGrid,'Other',Date.now(),()=>crypto.randomUUID());
  const current=projectGrid({...fresh,layoutLibrary:{...copy.library,activeId:library.activeId}},grid) as Workspace;
  expect(current.sourceId).toBe(btc.provenance.datasetId);
  expect(()=>openLayout(current,copy.entry.id,value=>value)).toThrow('Selected dataset is missing.');
  const other=openLayout(current,copy.entry.id,persisted);expect(other.layoutLibrary.activeId).toBe(copy.entry.id);
  const back=openLayout(other,library.activeId,persisted);expect(back.grid.layout.cells[0]).toMatchObject({symbol:'BTC-USD',interval:btc.resolution});expect(back.grid.cells[back.grid.layout.activeCellId].datasetId).toBe(btc.provenance.datasetId);
 });
});

describe('App wiring (source check)',()=>{
 it('validates the opened layout as it would be saved',()=>{
  const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
  expect(app).toContain('prepareWorkspaceData({...persistableWorkspace(next),paper:financial.current.paper');
  expect(app).not.toContain('prepareWorkspaceData({...next,');
 });
});
