import {describe,expect,it} from 'vitest';
import {COINBASE_PROVIDER_ID} from '../../src/domain/coinbase-live';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {BarDataset} from '../../src/domain/types';
import {liveChartPlaceholder} from '../../src/ui/live-workspace';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState,resizeMultiChartState,type GridTreeInput} from '../../src/ui/MultiChartGrid';
import {createGridTreeCoordinator,type GridCellReadiness} from '../../src/chart/grid-tree-coordinator';

// Switching back to a layout tab whose live feed closed while it was away (the warm feed idled out) stages its charts on
// the "connecting" stand-in: 0 bars under the live dataset id. The feed reopens only once the tab is shown and a staged tree
// never follows the live channel, so that chart cannot settle before publication. The switch used to wait for it until the
// 30 s deadline ("Native chart configuration did not settle within 30 seconds") with the workspace inert, then roll back.
// SYNTHETIC fixtures and a mocked native port only.
function tree(dataset:BarDataset,status:GridCellReadiness|undefined,layout:'single'|'two-columns'='single'){
 const state=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),layout);
 const input:GridTreeInput={state,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary'};
 let canonical:unknown=null;
 const coordinator=createGridTreeCoordinator({read:()=>input,alive:()=>true,staging:()=>true,controller:()=>null,runtime:()=>null,cell:()=>status,holdLinks:()=>({release(){}}),pending:()=>{},failed:()=>{},canonical:value=>{canonical=value;}});
 return{input,coordinator,canonical:()=>canonical};
}
const ethStandIn=()=>liveChartPlaceholder({providerId:COINBASE_PROVIDER_ID,symbol:'ETH-USD',interval:'5m'},true)!;

describe('a layout tab whose live feed closed while it was away',()=>{
 it('stages without waiting for the empty live chart, publishes its saved cells and suspends again',async()=>{
  const standIn=ethStandIn();expect(standIn.bars).toHaveLength(0);expect(standIn.provenance.datasetId.startsWith('live:')).toBe(true);
  // A reused (parked) chart keeps its refusal of the empty input to itself, so the cell never settles and reports no error.
  for(const layout of ['single','two-columns'] as const)for(const status of [undefined,{input:null,settled:false,error:''}]){
   const h=tree(standIn,status,layout),started=Date.now(),lease=await h.coordinator.waitUntilReady(h.input,new AbortController().signal);
   expect(Date.now()-started).toBeLessThan(1000);expect(lease.activeController).toBeNull();expect(lease.isCurrent()).toBe(true);
   for(const id of Object.keys(h.input.state.cells))expect(lease.canonicalState.cells[id]).toBe(h.input.state.cells[id]);
   expect(lease.publish()).toEqual({publicationErrors:[]});expect(h.canonical()).toBe(lease.canonicalState);
   const hold=h.coordinator.suspend(h.input);expect(hold.isCurrent()).toBe(true);hold.resume();
  }
 });
 it('a live chart with bars still waits for its chart (only the empty one is skipped)',async()=>{
  const bars=fixtureDataset('ETH',5).bars,live={...ethStandIn(),bars} as BarDataset;
  const h=tree(live,{input:null,settled:false,error:''}),abort=new AbortController(),wait=h.coordinator.waitUntilReady(h.input,abort.signal);setTimeout(()=>abort.abort(),60);
  await expect(wait).rejects.toThrow('cancel');
  expect(()=>h.coordinator.suspend(h.input)).toThrow('not settled');
 });
});
