// Derived intervals are saved as recipes (not bars); demo intraday series switch like any source.
import {describe,expect,it} from 'vitest';
import {createInitialWorkspace,type Workspace} from '../../src/ui/workspace-state';
import {prepareWorkspaceData} from '../../src/ui/workspace-transfer';
import {persistableWorkspace} from '../../src/ui/live-workspace';
import {createPaperAccount} from '../../src/domain/paper';
import {fixtureDataset} from '../../src/domain/fixtures';
import {patchWorkspace,selectedDataset,workspaceDatasets,withDemoSiblings} from '../../src/ui/workspace-grid';
import {selectWorkspaceInterval} from '../../src/ui/workspace-intervals';
import {resolveIntervalSwitch} from '../../src/domain/interval-switch';
import {DERIVED_IMPORTS_KEY} from '../../src/ui/workspace-derived-imports';
import {shortIntervalText} from '../../src/ui/interval-display';
import {intervalStrip} from '../../src/ui/interval-toolbar';
import {createRequire} from 'node:module';
const {saveInput}=createRequire(import.meta.url)('../../electron/validation.cjs');

const save=(ws:Workspace)=>prepareWorkspaceData({...persistableWorkspace(ws),paper:createPaperAccount(),alerts:[]}).data;
const bytes=(data:unknown)=>new TextEncoder().encode(JSON.stringify(data)).length;
/** The App path: resolve like switchInterval, then applyInterval's selectWorkspaceInterval + commit (patchWorkspace). */
function switchTo(ws:Workspace,target:string):Workspace{
 const dataset=selectedDataset(ws),choice=resolveIntervalSwitch(withDemoSiblings(workspaceDatasets(ws),dataset),dataset,target,ws.intervals.policy);
 if(!choice.ok)throw new Error(target+': '+choice.reason);if(choice.kind!=='local')throw new Error(target+': not local');
 if(choice.interval===dataset.resolution)return ws;
 const next=selectWorkspaceInterval(ws,choice.result.dataset,ws.intervals);
 return patchWorkspace(ws,{imports:next.imports,intervals:next.intervals,grid:next.grid}) as Workspace;
}
const activeInterval=(ws:Workspace)=>ws.grid!.layout.cells.find(row=>row.id===ws.grid!.layout.activeCellId)!.interval;

describe('FEEL-FIX-D-1028 workspace size',()=>{
 it('20 demo interval switches leave the saved workspace within a few KB, and the charts come back on load',()=>{
  let ws=createInitialWorkspace();const base=bytes(save(ws));
  const targets=['2m','10m','2h','1W','3m','1m','5m','15m','60m','1D','4h','30m','45m','3h','1M','2D','3D','2W','3M','120m'];
  for(const target of targets)ws=switchTo(ws,target);
  const saved=save(ws),after=bytes(saved);
  expect(after-base).toBeLessThan(6*1024);
  expect(()=>saveInput({schemaVersion:1,expectedRevision:1,data:saved})).not.toThrow();
  expect((saved.imports as unknown[]).length).toBe(0);
  expect((saved[DERIVED_IMPORTS_KEY] as unknown[]).length).toBe(ws.imports.length);
  const loaded=prepareWorkspaceData(JSON.parse(JSON.stringify(saved))).workspace;
  expect(activeInterval(loaded)).toBe('120m');
  expect(loaded.imports.map(row=>row.provenance.datasetId)).toEqual(ws.imports.map(row=>row.provenance.datasetId));
  expect(selectedDataset(loaded).bars).toEqual(selectedDataset(ws).bars);
  expect(bytes(save(loaded))).toBe(after);
 });
 it('migrates a bloated file: persisted derived bars are dropped and rebuilt, the chart stays',()=>{
  let ws=createInitialWorkspace();for(const target of ['2m','10m','2h','1W'])ws=switchTo(ws,target);
  const legacy=JSON.parse(JSON.stringify({...persistableWorkspace(ws),paper:createPaperAccount(),alerts:[]}));
  expect(bytes(legacy)).toBeGreaterThan(500*1024);
  const recovered=prepareWorkspaceData(legacy);
  expect(bytes(recovered.data)).toBeLessThan(bytes(save(createInitialWorkspace()))+3*1024);
  expect(activeInterval(recovered.workspace)).toBe('1W');
  expect(selectedDataset(recovered.workspace).bars).toEqual(selectedDataset(ws).bars);
 });
 it('keeps a supplied import and its bars exactly as before, and rebuilds an interval derived from it',()=>{
  const source=fixtureDataset('GME',400);source.provenance.datasetId='user-import-gme';source.provenance.providerId='user-csv';source.provenance.providerName='User CSV';source.provenance.fixture=false;source.instrument={...source.instrument,id:'XNYS:GME',exchange:'XNYS'};
  let ws=patchWorkspace(createInitialWorkspace(),{imports:[source],symbol:'GME',sourceId:'user-import-gme'}) as Workspace;
  ws=switchTo(ws,'1W');
  const saved=save(ws);
  expect((saved.imports as any[]).map(row=>row.provenance.datasetId)).toEqual(['user-import-gme']);
  expect((saved.imports as any[])[0].bars).toHaveLength(400);
  expect(saved[DERIVED_IMPORTS_KEY]).toHaveLength(1);
  const loaded=prepareWorkspaceData(JSON.parse(JSON.stringify(saved))).workspace;
  expect(selectedDataset(loaded).bars).toEqual(selectedDataset(ws).bars);expect(activeInterval(loaded)).toBe('1W');
 });
 it('refuses a malformed recipe instead of substituting data',()=>{
  let ws=createInitialWorkspace();ws=switchTo(ws,'1W');const saved=JSON.parse(JSON.stringify(save(ws)));
  saved[DERIVED_IMPORTS_KEY][0].sourceKey='["SYNTHETIC:GME","lv-synthetic-v1","lv-synthetic-v1:NOPE:7m","7m"]';
  expect(()=>prepareWorkspaceData(saved)).toThrow();
 });
});

describe('FEEL-FIX-D-1028 demo intraday sources',()=>{
 it.each(['1m','5m','15m','60m'])('demo %s switches without copying the series into imports',target=>{
  const ws=switchTo(createInitialWorkspace(),target);
  expect(activeInterval(ws)).toBe(target);expect(ws.imports).toHaveLength(0);expect(selectedDataset(ws).resolution).toBe(target);
  const loaded=prepareWorkspaceData(JSON.parse(JSON.stringify(save(ws)))).workspace;expect(activeInterval(loaded)).toBe(target);
 });
 it('a drawing still binds to the exact source: an unknown cell source is refused',()=>{
  const ws=switchTo(createInitialWorkspace(),'5m'),grid=structuredClone(ws.grid!);grid.cells[grid.layout.activeCellId].datasetId='lv-synthetic-v1:GME:7m';
  expect(()=>patchWorkspace(ws,{grid})).toThrow();
 });
});

describe('FEEL-FIX-D-1028 hour labels and the stable strip',()=>{
 it('shows whole hours as Nh',()=>{expect(['60m','120m','180m','240m','45m','1D'].map(shortIntervalText)).toEqual(['1h','2h','3h','4h','45m','1D']);});
 it('labels hour favorites as hours',()=>{expect(intervalStrip(['60m','240m'],'120m')).toMatchObject({favorites:[{label:'1h'},{label:'4h'}],current:'2h'});});
});

describe('FEEL-FIX-D-1028 AUDIT5 follow-up',()=>{
 it('the App memo key changes when a demo chart moves between its daily and intraday series',async()=>{
  const {gridSourceKey}=await import('../../src/ui/workspace-grid');
  const daily=createInitialWorkspace(),intraday=switchTo(daily,'5m'),back=switchTo(intraday,'1D');
  expect(gridSourceKey(intraday.grid)).not.toBe(gridSourceKey(daily.grid));expect(gridSourceKey(back.grid)).toBe(gridSourceKey(daily.grid));
  expect(intraday.sourceId).toBeNull();expect(selectedDataset(intraday).provenance.datasetId).toBe(intraday.grid!.cells[intraday.grid!.layout.activeCellId].datasetId);
 });
 it('the per-commit size guard measures only what a save writes (derived bars are left out)',async()=>{
  const {writtenWorkspaceShape}=await import('../../src/ui/workspace-derived-imports');
  let ws=createInitialWorkspace();for(const target of ['2m','10m','2h','1W'])ws=switchTo(ws,target);
  const shape=writtenWorkspaceShape(ws);expect(shape.imports).toHaveLength(0);expect(writtenWorkspaceShape(ws).imports).toBe(shape.imports);
  const plain=createInitialWorkspace();expect(writtenWorkspaceShape(plain)).toBe(plain);
  expect(bytes(shape)).toBeLessThan(bytes(ws)/50);
 });
});
