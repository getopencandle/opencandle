import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {alpacaSearchDatasets,selectAlpacaSyntheticStub} from '../../src/domain/alpaca-live';
import type {BarDataset} from '../../src/domain/types';
import {createPaperAccount} from '../../src/domain/paper';
import {fixtureDataset} from '../../src/domain/fixtures';
import {clearLiveDatasets,liveDatasetById,registerLiveDataset} from '../../src/ui/live-registry';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createLayoutLibrary,openedLayout,type LayoutLibrary} from '../../src/ui/layout-library';
import {createMultiChartState,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {projectGrid,workspaceDatasets} from '../../src/ui/workspace-grid';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {liveChartsOf,persistableWorkspace,reconnectLiveCharts,restoreLiveCharts,type SavedLiveChartRef} from '../../src/ui/live-workspace';
import {liveTabGrid} from '../../src/ui/layout-tabs-live';
import {exactGridDataset} from '../../src/chart/grid-analysis-coordinator';
import {cellSessionRefusal} from '../../src/chart/cell-session';
import {defaultTheme} from '../../src/ui/themes';

type Workspace=ReturnType<typeof createInitialWorkspace>&{grid:MultiChartState;layoutLibrary:LayoutLibrary;liveCharts?:Record<string,SavedLiveChartRef>};
const on={coinbase:false,alpacaKey:true},off={coinbase:false,alpacaKey:false},pending={...off,alpacaPending:true};
const times=['2024-06-03T13:00:00Z','2024-06-03T13:30:00Z','2024-06-03T14:00:00Z','2024-06-03T20:00:00Z'].map(value=>Date.parse(value)/1000);
function live(symbol:string,interval='30m'):BarDataset{
 const source=alpacaSearchDatasets(true,[symbol],interval).find(row=>row.instrument.symbol===symbol)!;
 const result:BarDataset={...source,bars:times.map((time,index)=>({time,open:100+index,high:102+index,low:99+index,close:101+index,volume:10+index})),provenance:{...source.provenance,state:'ready',asOf:times[3]+1800,revision:'synthetic-session-persistence-v1'}};
 registerLiveDataset(result);return result;
}
function workspace():Workspace{
 const gme=live('GME'),spy=live('SPY'),first=createMultiChartState(gme,{appearance:defaultTheme.appearance,session:'extended'}),peer=createMultiChartState(spy,{appearance:defaultTheme.appearance,session:'regular'});
 const firstCell=first.cells[first.layout.activeCellId],peerCell=peer.cells[peer.layout.activeCellId];first.presetId='two-columns';first.layout.cells=[{...first.layout.cells[0],id:'gme'},{...peer.layout.cells[0],id:'spy'}];first.layout.activeCellId='gme';first.cells={gme:firstCell,spy:peerCell};
 return projectGrid({...createInitialWorkspace(),layoutLibrary:createLayoutLibrary(first)},first) as Workspace;
}
const fileOf=(value:Workspace)=>({...value,paper:createPaperAccount({initialBalance:5000}),alerts:[]});
const restore=(value:Workspace)=>prepareWorkspaceData(JSON.parse(JSON.stringify(fileOf(value)))).workspace as Workspace;
function safeOf(value:Workspace):Workspace{return persistableWorkspace(value) as Workspace;}
function setCellSource(grid:MultiChartState,id:string,dataset:BarDataset,session?:'regular'|'extended'):void{
 const fresh=createMultiChartState(dataset,{appearance:grid.cells[id].appearance,...(session?{session}:{})});grid.cells[id]=fresh.cells[fresh.layout.activeCellId];
 const row=grid.layout.cells.find(row=>row.id===id)!;row.symbol=dataset.instrument.symbol;row.interval=dataset.resolution;
}
function addOther(value:Workspace):void{
 const grid=structuredClone(value.grid),cells=grid.cells;grid.layout.id='synthetic-other-layout';grid.layout.name='Other';
 grid.layout.cells=grid.layout.cells.map(row=>({...row,id:'other-'+row.id}));grid.layout.activeCellId='other-'+grid.layout.activeCellId;grid.cells=Object.fromEntries(Object.entries(cells).map(([id,cell])=>['other-'+id,cell]));
 value.layoutLibrary.entries.push({id:grid.layout.id,name:grid.layout.name,revision:1,createdAt:0,savedAt:0,favorite:false,grid});
}
beforeEach(()=>{clearLiveDatasets();selectAlpacaSyntheticStub(true);});
afterEach(()=>{clearLiveDatasets();selectAlpacaSyntheticStub(false);});

describe('live chart trading-session persistence',()=>{
 it('saves mixed GME extended and SPY regular through the actual durable validation path',()=>{
  const current=workspace();expect(cellSessionRefusal(exactGridDataset(current.grid,'gme',workspaceDatasets(current)),'extended')).toBeNull();
  const safe=safeOf(current),restored=restore(safe);
  expect(safe.grid.cells.gme.session).toBeUndefined();expect(safe.grid.cells.spy.session).toBeUndefined();
  expect(safe.liveCharts?.gme).toEqual({providerId:'alpaca-stub',symbol:'GME',interval:'30m',session:'extended'});
  expect(safe.liveCharts?.spy).toEqual({providerId:'alpaca-stub',symbol:'SPY',interval:'30m',session:'regular'});
  expect(restored.liveCharts).toEqual(safe.liveCharts);expect(current.grid.cells.gme.session).toBe('extended');expect(current.grid.cells.spy.session).toBe('regular');
 });
 it('reconnects both exact session choices and preserves generic feed-open request shapes',()=>{
  const safe=restore(safeOf(workspace()));clearLiveDatasets();const result=reconnectLiveCharts(safe,on);
  expect(result.workspace.grid!.cells.gme.session).toBe('extended');expect(result.workspace.grid!.cells.spy.session).toBe('regular');
  expect(result.workspace.grid!.layout.cells.map(row=>row.interval)).toEqual(['30m','30m']);
  expect(result.reopen.map(row=>Object.keys(row))).toEqual([['cellId','providerId','symbol','interval'],['cellId','providerId','symbol','interval']]);
  const gme=live('GME'),spy=live('SPY');expect(exactGridDataset(result.workspace.grid!,'gme',[gme,spy]).bars).toHaveLength(4);expect(exactGridDataset(result.workspace.grid!,'spy',[gme,spy]).bars).toHaveLength(2);
 });
 it('keeps desired choices on empty disconnected sources and survives saving them again',()=>{
  const safe=restore(safeOf(workspace()));clearLiveDatasets();const result=reconnectLiveCharts(safe,off);
  expect(result.reopen).toEqual([]);expect(result.disconnected).toHaveLength(2);
  for(const id of ['gme','spy'])expect(liveDatasetById(result.workspace.grid!.cells[id].datasetId)?.bars).toEqual([]);
  expect(result.workspace.grid!.cells.gme.session).toBe('extended');expect(result.workspace.grid!.cells.spy.session).toBe('regular');
  const again=restore(safeOf(result.workspace as Workspace));expect(again.liveCharts?.gme.session).toBe('extended');expect(again.liveCharts?.spy.session).toBe('regular');
 });
 it('preserves desired choices across pending key status and a stub namespace becoming available',()=>{
  const safe=restore(safeOf(workspace()));clearLiveDatasets();selectAlpacaSyntheticStub(false);
  const waiting=reconnectLiveCharts(safe,pending);expect(waiting.reopen).toEqual([]);expect(waiting.workspace.grid!.cells.spy.session).toBe('regular');
  selectAlpacaSyntheticStub(true);const ready=reconnectLiveCharts(waiting.workspace,on);
  expect(ready.reopen.map(row=>row.providerId)).toEqual(['alpaca-stub','alpaca-stub']);expect(ready.workspace.grid!.cells.gme.session).toBe('extended');expect(ready.workspace.grid!.cells.spy.session).toBe('regular');
 });
 it('keeps different working and saved sessions for the same chart id',()=>{
  const current=workspace();current.layoutLibrary.autosave=false;current.layoutLibrary.entries[0].grid.cells.gme.session='regular';
  const safe=restore(safeOf(current));expect(safe.liveCharts?.gme.session).toBe('extended');expect(safe.liveCharts?.gme.layouts).toEqual([{layoutId:current.grid.layout.id,providerId:'alpaca-stub',symbol:'GME',interval:'30m',session:'regular'}]);
  const working=reconnectLiveCharts(safe,on);expect(working.workspace.grid!.cells.gme.session).toBe('extended');
  const savedGrid=openedLayout(safe.layoutLibrary,safe.layoutLibrary.activeId).grid,opened=liveTabGrid(safe,savedGrid,on,'another-layout');expect(opened.grid.cells.gme.session).toBe('regular');
 });
 it('keeps full differing saved feed metadata rather than joining it by chart id alone',()=>{
  const current=workspace(),entry=current.layoutLibrary.entries[0].grid;setCellSource(entry,'gme',live('SPY'),'regular');
  const safe=restore(safeOf(current));expect(safe.liveCharts?.gme.symbol).toBe('GME');expect(safe.liveCharts?.gme.layouts?.[0]).toMatchObject({symbol:'SPY',session:'regular'});
  const working=reconnectLiveCharts(safe,on);expect(working.workspace.grid!.layout.cells[0].symbol).toBe('GME');
  const opened=liveTabGrid(safe,openedLayout(safe.layoutLibrary,safe.layoutLibrary.activeId).grid,on,'another-layout');expect(opened.grid.layout.cells[0].symbol).toBe('SPY');expect(opened.grid.cells.gme.session).toBe('regular');
 });
 it('does not reopen a working local source just because its saved entry is live',()=>{
  const current=workspace(),local=fixtureDataset('GME',500);setCellSource(current.grid,'gme',local);
  const safe=restore(safeOf(current));expect(safe.liveCharts?.gme.working).toBe(false);
  const result=reconnectLiveCharts(safe,on);expect(result.workspace.grid!.cells.gme.datasetId).toBe(local.provenance.datasetId);expect(result.workspace.grid!.cells.gme.session).toBeUndefined();expect(result.reopen.some(row=>row.cellId==='gme')).toBe(false);
 });
 it('restores saved-only stub context on its tab after top-level namespace normalization',()=>{
  const current=workspace(),local=fixtureDataset('GME',500);setCellSource(current.grid,'gme',local);
  const safe=restore(safeOf(current));clearLiveDatasets();selectAlpacaSyntheticStub(false);
  const working=reconnectLiveCharts(safe,on);expect(working.workspace.grid!.cells.gme.datasetId).toBe(local.provenance.datasetId);
  const opened=liveTabGrid(safe,openedLayout(safe.layoutLibrary,safe.layoutLibrary.activeId).grid,on,'another-layout');expect(opened.grid.cells.gme.session).toBe('extended');expect(opened.grid.cells.gme.datasetId).toBe('live:alpaca-iex:GME:30m');expect(opened.reopen.some(row=>row.cellId==='gme'&&row.providerId==='alpaca-iex')).toBe(true);
 });
 it('retains inactive-layout metadata and rejects chart-id collisions between different saved entries',()=>{
  const current=workspace();addOther(current);const safe=restore(safeOf(current));expect(safe.liveCharts?.['other-gme'].session).toBe('extended');
  const opened=liveTabGrid(safe,openedLayout(safe.layoutLibrary,'synthetic-other-layout').grid,on,current.grid.layout.id);expect(opened.grid.cells['other-spy'].session).toBe('regular');
  const bad=workspace();addOther(bad);const peer=bad.layoutLibrary.entries[1].grid;peer.layout.cells[0].id='gme';peer.cells.gme=peer.cells['other-gme'];delete peer.cells['other-gme'];expect(()=>safeOf(bad)).toThrow(/identity|layout/i);
 });
 it('preserves a saved local fixture while the working chart remains live',()=>{
  const current=workspace(),entry=current.layoutLibrary.entries[0].grid,local=fixtureDataset('GME',500);setCellSource(entry,'gme',local);
  const safe=restore(safeOf(current));
  const working=reconnectLiveCharts(safe,on);expect(working.workspace.grid!.cells.gme.session).toBe('extended');expect(working.workspace.grid!.cells.gme.datasetId).toBe('live:alpaca-stub:GME:30m');
  const opened=liveTabGrid(safe,openedLayout(safe.layoutLibrary,safe.layoutLibrary.activeId).grid,on,'another-layout');expect(opened.grid.cells.gme.datasetId).toBe(local.provenance.datasetId);expect(opened.grid.cells.gme.session).toBeUndefined();expect(opened.reopen.some(row=>row.cellId==='gme')).toBe(false);expect(safe.liveCharts?.gme.layouts).toEqual([{layoutId:current.grid.layout.id,live:false}]);
 });
 it('preserves a saved imported source while the working chart remains live',()=>{
  const current=workspace(),entry=current.layoutLibrary.entries[0].grid,local={...fixtureDataset('GME',500),provenance:{...fixtureDataset('GME',500).provenance,datasetId:'local:synthetic-saved-session-import'}};current.imports=[local];setCellSource(entry,'gme',local);
  const safe=restore(safeOf(current));
  const working=reconnectLiveCharts(safe,on);expect(working.workspace.grid!.cells.gme.session).toBe('extended');
  const opened=liveTabGrid(safe,openedLayout(safe.layoutLibrary,safe.layoutLibrary.activeId).grid,on,'another-layout');expect(opened.grid.cells.gme.datasetId).toBe(local.provenance.datasetId);expect(opened.grid.cells.gme.session).toBeUndefined();expect(opened.reopen.some(row=>row.cellId==='gme')).toBe(false);expect(safe.liveCharts?.gme.layouts).toEqual([{layoutId:current.grid.layout.id,live:false}]);
 });
 it('does not overwrite a later current live session or an inherited choice',()=>{
  const safe=restore(safeOf(workspace())),ready=reconnectLiveCharts(safe,on).workspace as Workspace;
  ready.grid.cells.gme.session='regular';delete ready.grid.cells.spy.session;
  const again=reconnectLiveCharts(ready,on);expect(again.workspace.grid!.cells.gme.session).toBe('regular');expect(again.workspace.grid!.cells.spy.session).toBeUndefined();
 });
 it('keeps ordinary legacy references unchanged and drops removed stale references',()=>{
  const current=workspace();for(const grid of [current.grid,current.layoutLibrary.entries[0].grid])for(const cell of Object.values(grid.cells))delete cell.session;
  const safe=safeOf(current);expect(safe.liveCharts?.gme).toEqual({providerId:'alpaca-stub',symbol:'GME',interval:'30m'});expect(restoreLiveCharts(safe.liveCharts)).toEqual(safe.liveCharts);
  const local=createInitialWorkspace() as Workspace;local.liveCharts=safe.liveCharts;const clean=safeOf(local);expect(clean.liveCharts).toBeUndefined();
 });
 it('does not include live observations, keys or account material in saved reference metadata',()=>{
  const safe=safeOf(workspace()),refs=JSON.stringify(safe.liveCharts);expect(refs).not.toMatch(/bars|open|high|low|close|volume|apiKey|secret|account|paper/i);expect(JSON.stringify(safe.grid)).not.toContain('live:');
  expect(restoreLiveCharts(safe.liveCharts,safe)).toEqual(safe.liveCharts);expect(fileOf(safe).paper.settings.initialBalance).toBe(5000);
 });
 it('requires owner context for new settings and rejects malformed, unsupported or unknown fields',()=>{
  const safe=safeOf(workspace()),basis=safe.liveCharts!.gme;
  expect(()=>restoreLiveCharts({gme:basis})).toThrow(/owner workspace/);
  // {session,interval:'1D'} on Alpaca is a valid dormant choice now (alpaca-dwm-1029.test.ts).
  for(const patch of [{session:'overnight'},{session:undefined},{session:'regular',providerId:'coinbase-public',symbol:'BTC-USD',interval:'5m'},{apiKey:'synthetic-forbidden-field'},{working:true}])expect(()=>restoreLiveCharts({gme:{...basis,...patch}},safe)).toThrow();
 });
 it('rejects foreign, duplicate, recursive and prototype layout contexts without invoking accessors',()=>{
  const current=workspace();current.layoutLibrary.entries[0].grid.cells.gme.session='regular';addOther(current);const safe=safeOf(current),basis=safe.liveCharts!.gme,context=basis.layouts![0];
  for(const layouts of [[{...context,layoutId:'foreign-layout'}],[{...context,layoutId:'synthetic-other-layout'}],[context,context],[{...context,layouts:[]}],[{layoutId:context.layoutId,live:false,session:'regular'}],[{layoutId:context.layoutId,live:true}],[Object.assign(Object.create({inherited:true}),context)]])expect(()=>restoreLiveCharts({gme:{...basis,layouts}},safe)).toThrow();
  let calls=0;const getter={...context};Object.defineProperty(getter,'symbol',{enumerable:true,get(){calls++;return 'GME';}});expect(()=>restoreLiveCharts({gme:{...basis,layouts:[getter]}},safe)).toThrow();expect(calls).toBe(0);expect(()=>restoreLiveCharts({gme:{...basis,layouts:[{layoutId:current.grid.layout.id,live:false}]}},current)).toThrow(/local layout context/);
  const owner=Object.create(safe);expect(()=>restoreLiveCharts({gme:basis},owner)).toThrow();expect(()=>restoreLiveCharts({foreign:basis},safe)).toThrow(/foreign/);
 });
 it('rejects new contextual references with or without session targeting an imported source',()=>{
  for(const withSession of [true,false]){
   const current=workspace();if(!withSession)for(const grid of [current.grid,current.layoutLibrary.entries[0].grid])for(const cell of Object.values(grid.cells))delete cell.session;
   const imported={...fixtureDataset('GME',500),provenance:{...fixtureDataset('GME',500).provenance,datasetId:'local:synthetic-persistence-import'}};current.imports=[imported];setCellSource(current.grid,'gme',imported);
   const safe=safeOf(current);if(!withSession){const basis=safe.liveCharts!.gme;safe.liveCharts!.gme={...basis,working:false,layouts:[{layoutId:current.grid.layout.id,...basis}]};}expect(safe.liveCharts?.gme.working).toBe(false);const forged=structuredClone(safe);delete forged.liveCharts!.gme.working;
   expect(()=>restore(forged)).toThrow(/working source|layout context/);const before=liveDatasetById('live:alpaca-stub:GME:30m');expect(()=>reconnectLiveCharts(forged,on)).not.toThrow();expect(liveDatasetById('live:alpaca-stub:GME:30m')).toBe(before);expect(forged.grid.cells.gme.datasetId).toBe(imported.provenance.datasetId);
  }
 });
 // An override on 1D is dormant (Alpaca 4h with Extended hours off could not open 1D/1W/1M). It is kept, never
 // silently deleted, and restores with the chart.
 it('keeps a dormant daily override through sanitization and restore instead of deleting it',()=>{
  const current=workspace(),daily=live('GME','1D');current.grid.layout.cells[0].interval='1D';current.grid.cells.gme.datasetId=daily.provenance.datasetId;
  const safe=safeOf(current);expect(safe.liveCharts?.gme).toMatchObject({interval:'1D',session:'extended'});
  const restored=restore(safe);expect(()=>reconnectLiveCharts(restored,on)).not.toThrow();
 });
});
