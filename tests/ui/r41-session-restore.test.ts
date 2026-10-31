import {describe,it,expect} from 'vitest';
import {sessionFixture,sessionGrid} from '../fixtures/r41-session-fixture';
import {exactGridDataset} from '../../src/chart/grid-analysis-coordinator';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createLayoutLibrary} from '../../src/ui/layout-library';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {projectGrid,patchWorkspace} from '../../src/ui/workspace-grid';
import {createWorkspaceHistory,historicalChartWorkspace} from '../../src/ui/workspace-history';
import {resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {resetIncompatibleFrame} from '../../src/ui/frame-reset-policy';
import {validatePreparedGridInput} from '../../src/ui/grid-prepared-input';
import {sourceContextForDataset} from '../../src/chart/source-context';
function workspace(){const gme=sessionFixture(),spy=sessionFixture('SPY'),initial=createInitialWorkspace(),grid=sessionGrid(gme,spy);return projectGrid({...initial,imports:[gme,spy],layoutLibrary:createLayoutLibrary(grid)},grid);}
describe(' persisted per-cell trading session overrides',()=>{
 it('round trips mixed GME ETH and SPY RTH without serializing renderer routing metadata',()=>{
  const before=workspace(),json=JSON.stringify(before),saved=restoreWorkspace(JSON.parse(json),createInitialWorkspace());
  expect(saved.grid!.cells.gme.session).toBe('extended');expect(saved.grid!.cells.spy.session).toBe('regular');expect(json).not.toContain('sessionOverride');
  expect(exactGridDataset(saved.grid!,'gme',saved.imports).bars).toHaveLength(4);expect(exactGridDataset(saved.grid!,'spy',saved.imports).bars).toHaveLength(2);
 });
 it('missing override remains a legacy workspace fallback and malformed explicit choices refuse',()=>{
  const saved=workspace();delete saved.grid!.cells.gme.session;saved.layoutLibrary=createLayoutLibrary(saved.grid!);const restored=restoreWorkspace(JSON.parse(JSON.stringify(saved)),createInitialWorkspace());expect(restored.grid!.cells.gme.session).toBeUndefined();
  const bad=structuredClone(saved);(bad.grid!.cells.gme as any).session='overnight';expect(()=>restoreWorkspace(bad,createInitialWorkspace())).toThrow('trading session');
 });
 it('focus projects each exact cell view without altering its peer state or feed source',()=>{
  const saved=workspace(),first=exactGridDataset(saved.grid!,'gme',saved.imports),peer=exactGridDataset(saved.grid!,'spy',saved.imports),grid={...saved.grid!,layout:{...saved.grid!.layout,activeCellId:'spy'}};
  const focused=projectGrid(saved,grid);expect(focused.grid!.cells.gme).toBe(saved.grid!.cells.gme);expect(focused.grid!.cells.spy).toBe(saved.grid!.cells.spy);
  expect(exactGridDataset(focused.grid!,'gme',focused.imports)).toBe(first);expect(exactGridDataset(focused.grid!,'spy',focused.imports)).toBe(peer);expect(focused.sourceId).toBe(peer.provenance.datasetId);
 });
 it('undo and redo retain each cell override while global workspace settings remain current',()=>{
  const before=workspace(),grid=structuredClone(before.grid!);grid.cells.gme.session='regular';const after=projectGrid(before,grid),history=createWorkspaceHistory<typeof before>();history.record(before,null);
  const undo=historicalChartWorkspace(after,history.undo(after,null)!.workspace);expect(undo.grid!.cells.gme.session).toBe('extended');expect(exactGridDataset(undo.grid!,'gme',undo.imports).bars).toHaveLength(4);
  const redo=historicalChartWorkspace(undo,history.redo(undo,null)!.workspace);expect(redo.grid!.cells.gme.session).toBe('regular');expect(exactGridDataset(redo.grid!,'gme',redo.imports).bars).toHaveLength(2);
 });
 it('layout resize and removal preserve retained overrides and new charts inherit the active choice',()=>{
  const before=workspace().grid!,single=resizeMultiChartState(before,'single'),expanded=resizeMultiChartState(single,'two-columns',()=> 'synthetic-added-cell');
  expect(single.cells.gme.session).toBe('extended');expect(Object.keys(single.cells)).toEqual(['gme']);expect(expanded.cells['synthetic-added-cell'].session).toBe('extended');expect(expanded.cells.spy).toBeUndefined();
 });
 // Daily history no longer refuses the switch; the explicit choice is kept dormant (no session on 1D) and returns on intraday.
 it('symbol switches preserve explicit choices and keep them dormant on daily history',()=>{
  const before=workspace(),next=patchWorkspace(before,{symbol:'SPY',sourceId:before.imports[1].provenance.datasetId});expect(next.grid!.cells.gme.session).toBe('extended');expect(exactGridDataset(next.grid!,'gme',next.imports).bars).toHaveLength(4);
  const daily=sessionFixture('SPY','1D'),saved=JSON.stringify(next),onDaily=patchWorkspace({...next,imports:[...next.imports,daily]},{sourceId:daily.provenance.datasetId});expect(JSON.stringify(next)).toBe(saved);
  expect(onDaily.grid!.cells.gme.session).toBe('extended');expect(exactGridDataset(onDaily.grid!,'gme',onDaily.imports).bars).toBe(daily.bars);
 });
 it('session changes reset manual frames without discarding time-price drawings',()=>{
  const saved=workspace(),before={...saved.grid!.cells.gme,frame:{synthetic:true} as any},after=resetIncompatibleFrame(before,{...before,session:'regular'},saved.imports,saved.imports);
  expect(after.frame).toBeUndefined();expect(after.chartOptions.auto).toBe(true);expect(after.drawings).toBe(before.drawings);
 });
 it('prepared input accepts the exact session view and refuses raw ETH bars for a regular chart',()=>{
  const saved=workspace(),grid=structuredClone(saved.grid!);grid.cells.gme.session='regular';const regular=exactGridDataset(grid,'gme',saved.imports),raw=saved.imports[0],prepared={nextDatasets:saved.imports,nextActiveBars:regular.bars,nextActiveExecutionIdentity:'ordinary',activeCellId:'gme',activeDatasetId:raw.provenance.datasetId,activeResolution:'1m'};
  const current={dataset:raw,datasets:saved.imports,bars:raw.bars,replay:null};expect(validatePreparedGridInput(grid,prepared,current).dataset).toBe(regular);
  expect(()=>validatePreparedGridInput(grid,{...prepared,nextActiveBars:raw.bars},current)).toThrow('accepted full input');expect(sourceContextForDataset(regular).sessionOverride).toBe('regular');
 });
});
