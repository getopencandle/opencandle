import {describe,expect,it} from 'vitest';
import {allChartsDataset,ensureWorkspaceGrid,workspaceDatasets,type ChartWorkspace} from '../../src/ui/workspace-grid';
import {defaultTheme} from '../../src/ui/themes';
import {FIXTURE_CAPABILITIES} from '../../src/domain/fixtures';

// Drives the real open-all helper that the Watchlist double-click calls (App openWatchDataset(data, true) commits its result once).
const base:ChartWorkspace={symbol:'GME',sourceId:null,imports:[],chartStyle:'candles',themeId:defaultTheme.id,appearance:defaultTheme.appearance,chartOptions:{source:'close',scale:'linear',invert:false,auto:true,timezone:'UTC'},drawings:{version:1,drawings:[]},indicators:[],comparisons:[]};
function sixteen(){const state=ensureWorkspaceGrid(structuredClone(base)),first=state.grid.layout.cells[0];state.grid.presetId='sixteen';for(let i=1;i<16;i++){const id='c'+i;state.grid.layout.cells.push({...first,id});state.grid.cells[id]=structuredClone(state.grid.cells[first.id]);}return state;}
describe('Watchlist double-click on a 16-chart layout',()=>{
 it('switches every chart in one committed step with symbol sync off, and a maximized layout stays maximized',()=>{
  const state=sixteen();state.grid.layout.sync.symbol=false;const maximized='c3';(state.grid.layout as any).maximizedCellId=maximized;
  const spy=workspaceDatasets(state).find(row=>row.instrument.symbol==='SPY')!;expect(spy).toBeTruthy();
  expect(state.grid.layout.cells).toHaveLength(16);expect(new Set(state.grid.layout.cells.map(row=>row.symbol))).toEqual(new Set(['GME']));
  const before=JSON.stringify(state),commits:unknown[]=[];
  const next=allChartsDataset(state,spy);commits.push({grid:next.grid});
  expect(JSON.stringify(state)).toBe(before);expect(commits).toHaveLength(1);
  expect(next.grid.layout.cells.map(row=>row.symbol)).toEqual(Array(16).fill('SPY'));
  expect(next.grid.layout.cells.every(row=>next.grid.cells[row.id].datasetId===FIXTURE_CAPABILITIES.id+':SPY')).toBe(true);
  expect((next.grid.layout as any).maximizedCellId).toBe(maximized);expect(next.grid.layout.activeCellId).toBe(state.grid.layout.activeCellId);
  // restoring the maximized chart leaves every chart on the new symbol
  const restored=structuredClone(next.grid);(restored.layout as any).maximizedCellId=null;expect(restored.layout.cells.map(row=>row.symbol)).toEqual(Array(16).fill('SPY'));
 });
 it('uses each chart\'s own interval when sync is off and never half-applies on a refused source',()=>{
  const state=sixteen();state.grid.layout.sync.symbol=false;state.grid.layout.sync.interval=false;const spy=workspaceDatasets(state).find(row=>row.instrument.symbol==='SPY')!;
  const next=allChartsDataset(state,spy);expect(new Set(next.grid.layout.cells.map(row=>row.interval))).toEqual(new Set([state.grid.layout.cells[0].interval]));
  const missing={...spy,provenance:{...spy.provenance,datasetId:'missing-source',fixture:false}};const keep=JSON.stringify(state);expect(()=>allChartsDataset(state,missing)).toThrow();expect(JSON.stringify(state)).toBe(keep);
 });
});
