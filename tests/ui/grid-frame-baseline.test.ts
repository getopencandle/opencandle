import {expect,it} from 'vitest';
import {prepareGridFrameHistory} from '../../src/ui/grid-frame-baseline';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {workspaceDatasets,selectedDataset} from '../../src/ui/workspace-grid';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {createReplay,replayPrefix} from '../../src/domain/replay';
import type {GridFrameEditBaseline} from '../../src/ui/MultiChartGrid';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
function setup(){
 const workspace=createInitialWorkspace(),grid=workspace.grid!,id=grid.layout.activeCellId,dataset=selectedDataset(workspace),datasets=workspaceDatasets(workspace),current={dataset,datasets,bars:dataset.bars,replay:null},source=sourceContextForDataset(dataset,dataset.bars);
 const opening:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null};
 const next=structuredClone(grid);next.cells[id].frame=structuredClone(opening);next.cells[id].frame!.panes[0].manualRange={min:12,max:30};next.cells[id].chartOptions.auto=false;
 const baseline:GridFrameEditBaseline={kind:'native-frame',expectedGrid:grid,frames:{[id]:opening},viewports:{[id]:{from:100,to:200}},inputs:{[id]:{source,bars:dataset.bars,style:'candles',executionIdentity:'ordinary'}}};
 return{workspace,grid,id,dataset,datasets,current,source,opening,next,baseline};
}
it('first native frame edit records the observed opening frame and Undo/Redo retains both exact ranges',()=>{
 const s=setup(),history=createWorkspaceHistory<any>(),prior=prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current);history.record(prior,null);const after={...s.workspace,grid:s.next};
 expect(s.workspace.grid!.cells[s.id].frame).toBeUndefined();expect(prior.grid.cells[s.id].frame!.panes[0].manualRange).toBeNull();const undone=history.undo(after,null)!.workspace;expect(undone.grid.cells[s.id].frame.panes[0].manualRange).toBeNull();expect(undone.grid.cells[s.id].viewport).toEqual({from:100,to:200});expect(history.redo(prior,null)!.workspace.grid.cells[s.id].frame.panes[0].manualRange).toEqual({min:12,max:30});
 s.opening.panes[0].heightWeight=9;expect(prior.grid.cells[s.id].frame!.panes[0].heightWeight).toBe(1);
});
it('equal-valued substituted arrays, retired grids and replay run identities cannot enrich history',()=>{
 const s=setup();for(const baseline of [{...s.baseline,expectedGrid:structuredClone(s.grid)},{...s.baseline,inputs:{[s.id]:{...s.baseline.inputs[s.id],bars:s.current.bars.slice()}}},{...s.baseline,inputs:{[s.id]:{...s.baseline.inputs[s.id],executionIdentity:'retired'}}}])expect(()=>prepareGridFrameHistory(s.workspace,s.next,baseline,s.current)).toThrow('The chart layout change was not applied.');
 const replay=createReplay(s.dataset,4,'frame-run'),bars=replayPrefix(s.dataset,replay),current={...s.current,replay,bars},baseline={...s.baseline,inputs:{[s.id]:{...s.baseline.inputs[s.id],bars,source:sourceContextForDataset(s.dataset,bars),executionIdentity:replay.runId}}};expect(prepareGridFrameHistory(s.workspace,s.next,baseline,current).grid.cells[s.id].frame).toBeDefined();expect(()=>prepareGridFrameHistory(s.workspace,s.next,baseline,{...current,replay:{...replay,runId:'other-run'}})).toThrow('The chart layout change was not applied.');
});
it('rejects hidden source/analysis edits, missing opening frames, invalid ranges and inconsistent aliases',()=>{
 const s=setup();for(const mutate of [(n:typeof s.next)=>{n.cells[s.id].style='line';},(n:typeof s.next)=>{n.cells[s.id].chartOptions.source='open';},(n:typeof s.next)=>{n.cells[s.id].frame!.panes[0].manualRange={min:10,max:9};},(n:typeof s.next)=>{n.cells[s.id].chartOptions.auto=true;},(n:typeof s.next)=>{n.layout.activeCellId='other';}]){const next=structuredClone(s.next);mutate(next);expect(()=>prepareGridFrameHistory(s.workspace,next,s.baseline,s.current)).toThrow();}
 expect(()=>prepareGridFrameHistory(s.workspace,s.next,{...s.baseline,frames:{}},s.current)).toThrow('The chart layout change was not applied.');
});
it('accepts native scale/flip aliases only when derived from the accepted price frame',()=>{
 const s=setup();s.next.cells[s.id].frame!.panes[0].log=true;s.next.cells[s.id].frame!.panes[0].invert=true;s.next.cells[s.id].chartOptions.scale='logarithmic';s.next.cells[s.id].chartOptions.invert=true;expect(prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current).grid.cells[s.id].frame!.panes[0].log).toBe(false);
 s.next.cells[s.id].chartOptions.invert=false;expect(()=>prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current)).toThrow('disagree');
});
it('does not create an observed frame or history entry for unchanged gestures',()=>{
 const s=setup();s.next.cells[s.id].frame=structuredClone(s.opening);s.next.cells[s.id].chartOptions.auto=true;expect(()=>prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current)).toThrow('The chart layout change was not applied.');
});
it('FX-F1: a frame publication may carry its own price scale document as one Undo step; an invalid or removed document is refused',async()=>{
 const {defaultPriceScaleSettings}=await import('../../src/chart/price-scale-state');
 const s=setup(),locked={...defaultPriceScaleSettings(),lockRatio:true,ratio:0.6};s.workspace.grid!.cells[s.id].priceScale=structuredClone(locked);
 const next=structuredClone(s.next);next.cells[s.id].priceScale={...locked,lockRatio:false,ratio:null};
 const prior=prepareGridFrameHistory(s.workspace,next,s.baseline,s.current);expect(prior.grid.cells[s.id].priceScale).toEqual(locked);expect(prior.grid.cells[s.id].frame!.panes[0].manualRange).toBeNull();
 const invalid=structuredClone(s.next);(invalid.cells[s.id] as any).priceScale={...locked,ratio:'bad'};expect(()=>prepareGridFrameHistory(s.workspace,invalid,s.baseline,s.current)).toThrow();
 const removed=structuredClone(s.next);delete removed.cells[s.id].priceScale;expect(()=>prepareGridFrameHistory(s.workspace,removed,s.baseline,s.current)).toThrow('The chart layout change was not applied.');
});
// The FX-F1 fold may carry only the lock fields (lockRatio, ratio) of the cell's own price scale document.
// Every other price scale field stays fixed across a frame publication, and a locked closing state must be manual.
it('BFABC-R1: a frame publication refuses any price scale change other than the lock and its ratio',async()=>{
 const {defaultPriceScaleSettings}=await import('../../src/chart/price-scale-state');
 const base={...defaultPriceScaleSettings(),lockRatio:true,ratio:0.6};
 const mutations:Array<[string,(p:any)=>void]>=[['placement',p=>{p.placement='left';}],['plusButton',p=>{p.plusButton=!p.plusButton;}],['scaleSeriesOnly',p=>{p.scaleSeriesOnly=!p.scaleSeriesOnly;}],['labels',p=>{p.labels.symbolName=!p.labels.symbolName;}],['lines',p=>{p.lines.priceLine=!p.lines.priceLine;}]];
 for(const [field,mutate] of mutations){
  const s=setup();s.workspace.grid!.cells[s.id].priceScale=structuredClone(base);
  const next=structuredClone(s.next),unlocked={...structuredClone(base),lockRatio:false,ratio:null};mutate(unlocked);next.cells[s.id].priceScale=unlocked;
  expect(()=>prepareGridFrameHistory(s.workspace,next,s.baseline,s.current),field).toThrow('The chart layout change was not applied.');
  const only=structuredClone(s.next),changed=structuredClone(base);mutate(changed);only.cells[s.id].priceScale=changed;
  expect(()=>prepareGridFrameHistory(s.workspace,only,s.baseline,s.current),field+' alone').toThrow('The chart layout change was not applied.');
 }
});
it('BFABC-R1: a cell without a stored document compares against the factory defaults',async()=>{
 const {defaultPriceScaleSettings}=await import('../../src/chart/price-scale-state');
 const s=setup();expect(s.workspace.grid!.cells[s.id].priceScale).toBeUndefined();
 const lock=structuredClone(s.next);lock.cells[s.id].priceScale={...defaultPriceScaleSettings(),lockRatio:true,ratio:0.25};
 const prior=prepareGridFrameHistory(s.workspace,lock,s.baseline,s.current);expect(prior.grid.cells[s.id].priceScale).toBeUndefined();
 const labelled=structuredClone(s.next),doc={...defaultPriceScaleSettings(),lockRatio:true,ratio:0.25};doc.labels.highLow=true;labelled.cells[s.id].priceScale=doc;
 expect(()=>prepareGridFrameHistory(s.workspace,labelled,s.baseline,s.current)).toThrow('The chart layout change was not applied.');
});
it('BFABC-R1: a lock riding a frame publication requires a manual closing range (auto off)',async()=>{
 const {defaultPriceScaleSettings}=await import('../../src/chart/price-scale-state');
 const s=setup(),opening=structuredClone(s.opening);opening.panes[0].manualRange={min:5,max:9};s.workspace.grid!.cells[s.id].chartOptions.auto=false;
 const baseline={...s.baseline,frames:{[s.id]:opening}},next=structuredClone(s.workspace.grid!);next.cells[s.id].frame=structuredClone(s.opening);next.cells[s.id].chartOptions.auto=true;
 next.cells[s.id].priceScale={...defaultPriceScaleSettings(),lockRatio:true,ratio:0.5};
 expect(()=>prepareGridFrameHistory(s.workspace,next,baseline,s.current)).toThrow(/manual price range/);
 // The same auto-on closing state without a lock (Reset of a lock) is the accepted FX-F1 shape.
 s.workspace.grid!.cells[s.id].priceScale={...defaultPriceScaleSettings(),lockRatio:true,ratio:0.5};const reset=structuredClone(next);reset.cells[s.id].priceScale=defaultPriceScaleSettings();
 const prior=prepareGridFrameHistory(s.workspace,reset,baseline,s.current);expect(prior.grid.cells[s.id].priceScale).toEqual({...defaultPriceScaleSettings(),lockRatio:true,ratio:0.5});
});
it(' live smoke: a newer snapshot of the same live feed during the gesture is the same input; another array is not',async()=>{
 // Packaged-app live smoke (Coinbase 1m): the App live state (1 Hz) landed inside the gesture window, so input.bars!==bars
 // refused the publication and the cell was quarantined ("Reopen the affected charts").
 const {stampLiveLineage}=await import('../../src/chart/bar-input-identity');
 const s=setup(),opening=[...s.dataset.bars],last=opening.at(-1)!,newer=[...opening.slice(0,-1),{...last,close:last.close+0.01}];
 stampLiveLineage(opening,'live:coinbase-public:SYNTH:1m|live-v1:s:1',1);stampLiveLineage(newer,'live:coinbase-public:SYNTH:1m|live-v1:s:1',2);
 const baseline={...s.baseline,inputs:{[s.id]:{...s.baseline.inputs[s.id],bars:opening,source:sourceContextForDataset(s.dataset,opening)}}};
 expect(prepareGridFrameHistory(s.workspace,s.next,baseline,{...s.current,bars:newer}).grid.cells[s.id].frame).toBeDefined();
 const other=[...newer];stampLiveLineage(other,'live:coinbase-public:SYNTH:1m|live-v1:s:2',3);
 expect(()=>prepareGridFrameHistory(s.workspace,s.next,baseline,{...s.current,bars:other})).toThrow('The chart layout change was not applied.');
});
it('a frame gesture on a live chart holding a replay copy (choosing the start bar, or replaying) is this chart, not a changed one',async()=>{
 const {freezeLiveDataset}=await import('../../src/domain/replay-live-snapshot');
 const {registerLiveDataset,clearLiveDatasets}=await import('../../src/ui/live-registry');
 const s=setup(),live={...s.dataset,provenance:{...s.dataset.provenance,datasetId:'live:SYNTHETIC-replay-hold:1D',revision:'live-v1:hold:1',fixture:false}};
 clearLiveDatasets();registerLiveDataset(live);
 const grid=structuredClone(s.grid);grid.cells[s.id].datasetId=live.provenance.datasetId;const workspace={...s.workspace,grid};
 const frozen=freezeLiveDataset(live)!,datasets=s.datasets.filter(row=>row.provenance.datasetId!==s.dataset.provenance.datasetId).concat(live);
 // The cell draws the copy's bars under the live feed's source; the root input names the copy itself.
 const source=sourceContextForDataset(live,frozen.bars),opening:HistoricalChartFrame={...structuredClone(s.opening),basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'}};
 const next=structuredClone(grid);next.cells[s.id].frame={...structuredClone(opening),panes:[{...opening.panes[0],manualRange:{min:12,max:30}}]};next.cells[s.id].chartOptions.auto=false;
 const baseline:GridFrameEditBaseline={kind:'native-frame',expectedGrid:grid,frames:{[s.id]:opening},viewports:{[s.id]:{from:100,to:200}},inputs:{[s.id]:{source,bars:frozen.bars,style:'candles',executionIdentity:'ordinary'}}};
 const current={dataset:frozen,datasets,bars:frozen.bars,replay:null};
 expect(prepareGridFrameHistory(workspace,next,baseline,current).grid.cells[s.id].viewport).toEqual({from:100,to:200});
 // A copy frozen from another revision of the feed, or another dataset entirely, is still a changed chart.
 const stale=freezeLiveDataset({...live,provenance:{...live.provenance,revision:'live-v1:hold:2'}})!;
 expect(()=>prepareGridFrameHistory(workspace,next,baseline,{...current,dataset:stale})).toThrow('The chart layout change was not applied.');
 expect(()=>prepareGridFrameHistory(workspace,next,baseline,{...current,dataset:{...frozen,provenance:{...frozen.provenance,datasetId:'live:SYNTHETIC-other:1D'}}})).toThrow('The chart layout change was not applied.');
 clearLiveDatasets();
});
