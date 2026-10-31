import {expect,it} from 'vitest';
import {prepareGridFrameHistory} from '../../src/ui/grid-frame-baseline';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {selectedDataset,workspaceDatasets} from '../../src/ui/workspace-grid';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {GridFrameEditBaseline} from '../../src/ui/MultiChartGrid';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
// Actual root history preparation, original literal frame values; no native
// observation, DOM, paint, gesture, executable interaction or reference claim.
function fixture(){
 const workspace=createInitialWorkspace(),grid=workspace.grid!,id=grid.layout.activeCellId,dataset=selectedDataset(workspace),datasets=workspaceDatasets(workspace),source=sourceContextForDataset(dataset,dataset.bars);
 const opening:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null};
 const next=structuredClone(grid);next.cells[id].frame=structuredClone(opening);next.cells[id].frame!.panes[0].manualRange={min:17,max:39};next.cells[id].chartOptions.auto=false;
 const baseline:GridFrameEditBaseline={kind:'native-frame',expectedGrid:grid,frames:{[id]:opening},viewports:{[id]:{from:100,to:200}},inputs:{[id]:{source,bars:dataset.bars,style:'candles',executionIdentity:'ordinary'}}};
 return {workspace,grid,id,dataset,datasets,source,opening,next,baseline,current:{dataset,datasets,bars:dataset.bars,replay:null}};
}
it('copies an opening observation without mutating current model or retaining the mutable frame',()=>{
 const s=fixture(),before=JSON.stringify(s.workspace),result=prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current);expect(result.grid.cells[s.id].frame!.panes[0].manualRange).toBeNull();expect(s.next.cells[s.id].frame!.panes[0].manualRange).toEqual({min:17,max:39});s.opening.panes[0].heightWeight=42;expect(result.grid.cells[s.id].frame!.panes[0].heightWeight).toBe(1);expect(JSON.stringify(s.workspace)).toBe(before);
});
it('a foreign opening frame cannot authorize an unchanged grid or an unobserved viewport edit',()=>{
 const s=fixture(),foreign={...s.baseline,frames:{foreign:s.opening},viewports:{foreign:{from:100,to:200}},inputs:{foreign:s.baseline.inputs[s.id]}},unchanged=structuredClone(s.grid);expect(()=>prepareGridFrameHistory(s.workspace,unchanged,foreign,s.current)).toThrow();unchanged.cells[s.id].viewport={from:100,to:200};expect(()=>prepareGridFrameHistory(s.workspace,unchanged,foreign,s.current)).toThrow();
});
it('an observed first cell cannot authorize an unobserved viewport change in another cell',()=>{
 const s=fixture(),row=s.grid.layout.cells[0];s.grid.presetId='two-rows';s.grid.layout.cells.push({...row,id:'second'});s.grid.cells.second=structuredClone(s.grid.cells[s.id]);s.next.presetId='two-rows';s.next.layout=structuredClone(s.grid.layout);s.next.cells.second=structuredClone(s.grid.cells.second);s.next.cells.second.viewport={from:100,to:200};const before=JSON.stringify(s.workspace);expect(()=>prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current)).toThrow();expect(JSON.stringify(s.workspace)).toBe(before);
});
it('accessors in frame and source metadata reject before any getter invocation',()=>{
 const s=fixture();let reads=0;const source={...s.source};Object.defineProperty(source,'revision',{enumerable:true,get(){reads++;return '1';}});const input={...s.baseline.inputs[s.id],source};expect(()=>prepareGridFrameHistory(s.workspace,s.next,{...s.baseline,inputs:{[s.id]:input}},s.current)).toThrow();expect(reads).toBe(0);const frame=structuredClone(s.opening);Object.defineProperty(frame.panes[0],'manualRange',{enumerable:true,get(){reads++;return null;}});expect(()=>prepareGridFrameHistory(s.workspace,s.next,{...s.baseline,frames:{[s.id]:frame}},s.current)).toThrow();expect(reads).toBe(0);
});
it('missing and ambiguous datasets and equal-valued substitute bar arrays cannot create history baselines',()=>{
 const s=fixture();for(const current of [{...s.current,datasets:[]},{...s.current,datasets:[s.dataset,s.dataset]},{...s.current,bars:s.dataset.bars.slice()}])expect(()=>prepareGridFrameHistory(s.workspace,s.next,s.baseline,current)).toThrow();expect(s.workspace.grid!.cells[s.id].frame).toBeUndefined();
});
it('a simultaneous hidden analysis edit rejects before publishing an opening frame',()=>{
 const s=fixture();s.next.cells[s.id].comparisons=[{id:'foreign',datasetId:s.dataset.provenance.datasetId} as any];expect(()=>prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current)).toThrow('chart layout change was not applied');expect(s.workspace.grid!.cells[s.id].frame).toBeUndefined();
});
it('first pan history copies exact opening live bounds and missing or malformed opening viewports reject',()=>{
 const s=fixture();s.next.cells[s.id].viewport={from:140,to:240};const result=prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current);expect(s.workspace.grid!.cells[s.id].viewport).toBeUndefined();expect(result.grid.cells[s.id].viewport).toEqual({from:100,to:200});s.baseline.viewports[s.id].from=99;expect(result.grid.cells[s.id].viewport!.from).toBe(100);expect(s.next.cells[s.id].viewport).toEqual({from:140,to:240});expect(()=>prepareGridFrameHistory(s.workspace,s.next,{...s.baseline,viewports:{}},s.current)).toThrow();expect(()=>prepareGridFrameHistory(s.workspace,s.next,{...s.baseline,viewports:{[s.id]:{from:100,to:100}}},s.current)).toThrow();
});
