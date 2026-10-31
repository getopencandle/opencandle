import {afterEach,expect,it} from 'vitest';
import {LiveBarSeries} from '../../src/domain/live-bars';
import {buildLiveDataset,type LiveEntry,type ProvenanceTemplate} from '../../src/domain/live-provider';
import {fixtureInstrument} from '../../src/domain/fixtures';
import {sessionDataset} from '../../src/chart/session-zones';
import {cellSessionDataset} from '../../src/chart/cell-session';
import {barInputIdentity,liveLineageOf,sameBarsInput} from '../../src/chart/bar-input-identity';
import {sourceContextForDataset,chartSourceContextKey} from '../../src/chart/source-context';
import {validateHistoricalFrame,type HistoricalChartFrame} from '../../src/chart/historical-frame';
import {createMultiChartState,resizeMultiChartState,type GridFrameEditBaseline} from '../../src/ui/MultiChartGrid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {projectGrid} from '../../src/ui/workspace-grid';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {prepareGridFrameHistory} from '../../src/ui/grid-frame-baseline';
import {clearLiveDatasets,publishLiveDataset} from '../../src/ui/live-registry';
import {createReplay,replayPrefix} from '../../src/domain/replay';
import type {Bar} from '../../src/domain/types';

// Root frame-publication validation, not a DOM/native capture grant. Real live
// array and session constructors own lineage; frames are explicit validated
// portable fixtures, and the real workspace history owns Undo/Redo storage.
afterEach(()=>clearLiveDatasets());
function liveSource(){
 const first=Date.parse('2026-10-20T11:01:00Z')/1000;
 const bars:Bar[]=Array.from({length:300},(_,index)=>({time:first+index*60,open:20,high:24,low:19,close:21,volume:10}));
 const series=new LiveBarSeries({seconds:60,baseSeconds:60,ticks:true,aligned:true});series.setBackfill(bars);series.setState('ready');
 const key='live:alpaca-stub:SYNTHETIC-GME:1m',entry:LiveEntry={key,symbol:'GME',resolution:'1m',seconds:60,series,refs:1,listeners:new Set(),cached:null,cachedRevision:-1,backfilled:true,lastError:null,seeding:new Set(),reconcileAfter:null};
 const template:ProvenanceTemplate={providerId:'alpaca-stub',providerName:'SYNTHETIC session frame exercise',datasetId:key,coverage:'SYNTHETIC regular and premarket bars',delaySeconds:0,session:'unknown',timezone:'America/New_York',license:'SYNTHETIC',notes:[],asOf:0};
 const raw=buildLiveDataset(entry,{...fixtureInstrument('GME'),timezone:'America/New_York'},'SYNTHETIC-session',template);publishLiveDataset(raw);return raw;
}
function setup(options:{peer?:boolean;session?:'regular'|'extended';workspaceSession?:'regular'|'extended'}={}){
 const raw=liveSource(),global=sessionDataset(raw,options.workspaceSession??'extended'),base=createInitialWorkspace();
 let grid=createMultiChartState(global,{appearance:base.appearance});if(options.peer)grid=resizeMultiChartState(grid,'two-columns');
 const active=grid.layout.activeCellId,id=options.peer?grid.layout.cells.find(row=>row.id!==active)!.id:active;
 grid.cells[id]={...grid.cells[id],session:options.session??'regular'};
 const workspace=projectGrid({...base,symbol:'GME',sourceId:raw.provenance.datasetId},grid),activeDataset=cellSessionDataset(global,grid.cells[active]),selected=cellSessionDataset(global,grid.cells[id]);
 const current={dataset:activeDataset,datasets:[global],bars:activeDataset.bars,replay:null},source=sourceContextForDataset(selected);
 const opening=validateHistoricalFrame({schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null});
 const next=structuredClone(grid),closing=structuredClone(opening);closing.panes[0].manualRange={min:12,max:30};next.cells[id].frame=closing;next.cells[id].chartOptions.auto=false;
 const viewport={from:selected.bars[0].time,to:selected.bars.at(-1)!.time};next.cells[id].viewport={from:viewport.from+60,to:viewport.to};
 const baseline:GridFrameEditBaseline={kind:'native-frame',expectedGrid:grid,frames:{[id]:opening},viewports:{[id]:viewport},inputs:{[id]:{bars:selected.bars,source,style:'candles',executionIdentity:'ordinary'}}};
 return{raw,global,workspace,grid,active,id,selected,current,source,opening,next,baseline};
}
it('active explicit RTH300-to151 live input accepts its real cell source and records the exact opening for Undo/Redo',()=>{
 const s=setup();expect(s.raw.bars).toHaveLength(300);expect(s.selected.bars).toHaveLength(151);expect(s.selected.provenance.session).toBe('regular');expect(s.raw.provenance.session).toBe('unknown');expect(liveLineageOf(s.selected.bars)!.key).toBe(liveLineageOf(s.raw.bars)!.key+'|rth');expect(barInputIdentity(s.selected.bars)).toMatch(/^live:/);
 const prior=prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current),history=createWorkspaceHistory<typeof s.workspace>();history.record(prior,null);const after=projectGrid(s.workspace,s.next),undone=history.undo(after,null)!;
 expect(undone.workspace.grid!.cells[s.id].frame).toEqual(s.opening);expect(undone.workspace.grid!.cells[s.id].viewport).toEqual(s.baseline.viewports[s.id]);expect(history.redo(undone.workspace,null)!.workspace.grid!.cells[s.id].frame!.panes[0].manualRange).toEqual({min:12,max:30});expect(prior.grid.cells[s.id].session).toBe('regular');
});
it('a regular peer uses its own151-row cell view while the active chart keeps all300 extended rows',()=>{
 const s=setup({peer:true});expect(s.current.bars).toHaveLength(300);expect(s.selected.bars).toHaveLength(151);expect(s.id).not.toBe(s.active);const prior=prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current);expect(prior.grid.cells[s.id].frame).toEqual(s.opening);expect(prior.grid.cells[s.active]).toEqual(s.grid.cells[s.active]);
});
it('explicit extended hours unwraps the workspace regular view before validating the observed frame',()=>{
 const s=setup({session:'extended',workspaceSession:'regular'});expect(s.global.bars).toHaveLength(151);expect(s.selected.bars).toBe(s.raw.bars);expect(s.source.sessionOverride).toBe('extended');expect(prepareGridFrameHistory(s.workspace,s.next,s.baseline,s.current).grid.cells[s.id].frame).toEqual(s.opening);
});
it('an inherited global regular view remains accepted without manufacturing an explicit cell override',()=>{
 const s=setup({workspaceSession:'regular'});delete s.grid.cells[s.id].session;delete s.next.cells[s.id].session;s.baseline.inputs[s.id]={...s.baseline.inputs[s.id],source:sourceContextForDataset(s.global),bars:s.global.bars};const opening=structuredClone(s.opening);opening.basis.basisIdentity=s.baseline.inputs[s.id].source.basisIdentity!;s.baseline.frames[s.id]=opening;s.next.cells[s.id].frame!.basis={...opening.basis};const current={...s.current,dataset:s.global,bars:s.global.bars};expect(prepareGridFrameHistory(s.workspace,s.next,s.baseline,current).grid.cells[s.id].frame).toEqual(opening);
});
it('regular lineage alone cannot substitute a raw or wrong-session source context at the Root frame boundary',()=>{
 const s=setup();expect(sameBarsInput(s.selected.bars,s.current.bars)).toBe(true);const wrong=sourceContextForDataset(s.raw,s.selected.bars);expect(chartSourceContextKey(wrong)).not.toBe(chartSourceContextKey(s.source));const baseline={...s.baseline,inputs:{[s.id]:{...s.baseline.inputs[s.id],source:wrong}}};expect(()=>prepareGridFrameHistory(s.workspace,s.next,baseline,s.current)).toThrow('The chart layout change was not applied.');expect(()=>prepareGridFrameHistory(s.workspace,s.next,s.baseline,{...s.current,dataset:s.raw})).toThrow('The chart layout change was not applied.');
});
it('a retired or equal-looking unowned input cannot borrow an explicit RTH frame observation',()=>{
 const s=setup(),copied=s.selected.bars.map(row=>({...row}));expect(sameBarsInput(copied,s.selected.bars)).toBe(false);expect(()=>prepareGridFrameHistory(s.workspace,s.next,{...s.baseline,inputs:{[s.id]:{...s.baseline.inputs[s.id],bars:copied}}},s.current)).toThrow('The chart layout change was not applied.');expect(()=>prepareGridFrameHistory(s.workspace,s.next,{...s.baseline,expectedGrid:structuredClone(s.grid)},s.current)).toThrow('The chart layout change was not applied.');
 const wrongSource={...s.source,revision:s.source.revision+'-retired'};expect(()=>prepareGridFrameHistory(s.workspace,s.next,{...s.baseline,inputs:{[s.id]:{...s.baseline.inputs[s.id],source:wrongSource}}},s.current)).toThrow('The chart layout change was not applied.');
});
it('explicit RTH frame validation retains the actual replay run check and exact replay-prefix identity',()=>{
 const s=setup(),replay=createReplay(s.selected,100,'SYNTHETIC-session-frame-run'),bars=replayPrefix(s.selected,replay),source=sourceContextForDataset(s.selected,bars),baseline={...s.baseline,inputs:{[s.id]:{...s.baseline.inputs[s.id],bars,source,executionIdentity:replay.runId}}},current={...s.current,bars,replay};
 expect(prepareGridFrameHistory(s.workspace,s.next,baseline,current).grid.cells[s.id].frame).toEqual(s.opening);expect(()=>prepareGridFrameHistory(s.workspace,s.next,baseline,{...current,replay:{...replay,runId:'SYNTHETIC-other-run'}})).toThrow('The chart layout change was not applied.');expect(()=>prepareGridFrameHistory(s.workspace,s.next,baseline,{...current,bars:[...bars]})).toThrow('The chart layout change was not applied.');
});
