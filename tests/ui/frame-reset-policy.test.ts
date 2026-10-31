import {expect,it} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {ensureWorkspaceGrid,patchWorkspace,allChartsDataset,workspaceDatasets} from '../../src/ui/workspace-grid';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';
import {selectWorkspaceInterval} from '../../src/ui/workspace-intervals';
import {aggregateInterval,createIntervalMenuState} from '../../src/domain/intervals';
import {prepareTemplateApplication} from '../../src/ui/template-application';
import {createIndicatorTemplates,saveIndicatorTemplate,templateSource} from '../../src/ui/indicator-templates';
function fixture(){const workspace=ensureWorkspaceGrid(createInitialWorkspace()),id=workspace.grid.layout.activeCellId,source=sourceContextForDataset(workspaceDatasets(workspace).find(row=>row.provenance.datasetId===workspace.grid.cells[id].datasetId)!);const frame:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:{min:10,max:20}}],independent:[],maximized:null};workspace.grid.cells[id].frame=frame;workspace.grid.cells[id].chartOptions.auto=false;return{workspace,id};}
it('explicit symbol and chart-type changes reset incompatible frame intent without mutating history',()=>{
 const {workspace,id}=fixture();for(const patch of [{symbol:'SPY'},{chartStyle:'line'}]){const next=patchWorkspace(workspace,patch);expect(next.grid.cells[id].frame).toBeUndefined();expect(next.chartOptions.auto).toBe(true);expect(workspace.grid.cells[id].frame?.panes[0].manualRange).toEqual({min:10,max:20});expect(workspace.grid.cells[id].chartOptions.auto).toBe(false);}
});
it('appearance and indicator color changes preserve compatible manual frame settings',()=>{
 const {workspace,id}=fixture(),indicator={id:'literal-sma',kind:'sma' as const,inputs:{length:9},plots:{sma:defaultPlotStyle('sma','sma',0)},offset:0,visible:true,paneId:'price'};workspace.grid.cells[id].indicators=[indicator];workspace.indicators=[indicator];
 const next=patchWorkspace(workspace,{appearance:{...workspace.appearance,background:'#101010'},indicators:[{...indicator,plots:{sma:{...indicator.plots.sma,color:'#aabbcc',width:4}}}]});expect(next.grid.cells[id].frame).toEqual(workspace.grid.cells[id].frame);expect(next.chartOptions.auto).toBe(false);
 const calculated=patchWorkspace(workspace,{indicators:[{...indicator,inputs:{length:20}}]});expect(calculated.grid.cells[id].frame).toBeUndefined();/* A study calculation change keeps the manual range. */expect(calculated.chartOptions.auto).toBe(false);
});
it('source corrections reset manual intent even when the stored dataset identifier is unchanged',()=>{
 const {workspace,id}=fixture(),data=structuredClone(workspaceDatasets(workspace).find(row=>row.provenance.datasetId===workspace.grid.cells[id].datasetId)!);data.provenance.datasetId='synthetic-import';workspace.imports=[data];workspace.sourceId=data.provenance.datasetId;workspace.grid.cells[id].datasetId=data.provenance.datasetId;
 const corrected={...data,provenance:{...data.provenance,revision:'corrected-2'}},next=patchWorkspace(workspace,{imports:[corrected]});expect(next.grid.cells[id].frame).toBeUndefined();expect(next.chartOptions.auto).toBe(true);
});
it('all-chart source navigation resets every affected frame while exact history restoration retains it',()=>{
 const {workspace,id}=fixture(),next=allChartsDataset(workspace,workspaceDatasets(workspace).find(row=>row.instrument.symbol==='SPY')!);expect(next.grid.cells[id].frame).toBeUndefined();expect(next.chartOptions.auto).toBe(true);
 const restored=patchWorkspace(next,{grid:workspace.grid});expect(restored.grid.cells[id].frame).toBe(workspace.grid.cells[id].frame);expect(restored.chartOptions.auto).toBe(false);
});
it('interval selection resets old-source manual frame before returning the direct grid patch',()=>{
 const {workspace,id}=fixture(),data=workspaceDatasets(workspace).find(row=>row.provenance.datasetId===workspace.grid.cells[id].datasetId)!,menu=createIntervalMenuState(),weekly=aggregateInterval(data,'1W',menu.policy).dataset;
 const next=selectWorkspaceInterval(workspace,weekly,menu);expect(next.grid!.cells[id].frame).toBeUndefined();expect(next.chartOptions.auto).toBe(true);expect(workspace.grid.cells[id].frame?.panes[0].manualRange).toEqual({min:10,max:20});
});
it('template replacement resets a frame for source recall or new numerical owners while retaining history',()=>{
 const {workspace,id}=fixture(),spy=workspaceDatasets(workspace).find(row=>row.instrument.symbol==='SPY')!,template=saveIndicatorTemplate(createIndicatorTemplates(),'Synthetic template',{indicators:[],scripts:[],rememberSymbol:true,rememberInterval:true,source:templateSource(spy)},()=> 'template').records[0];
 for(const [selected,auto] of [[template,true],[{...template,rememberSymbol:false,rememberInterval:false,indicators:[{id:'saved-sma',kind:'sma' as const,inputs:{length:9},plots:{},offset:0,visible:true,paneId:'price'}]},false]] as [typeof template,boolean][]){const next=prepareTemplateApplication(workspace,selected,[{paneId:'price',replaceable:false}],[],()=> 'new-sma').workspace;expect(next.grid!.cells[id].frame).toBeUndefined();/* New study owners keep the manual range (frame recaptured by the grid); a symbol recall resets it. */expect(next.chartOptions.auto).toBe(auto);}
 expect(workspace.grid.cells[id].frame?.panes[0].manualRange).toEqual({min:10,max:20});
});
it('CHART-TB 1: adding or removing a study keeps the manual price range; the recaptured frame is not an undo step',async()=>{
 const {resetIncompatibleFrame,carriedFrameCell}=await import('../../src/ui/frame-reset-policy');const {changedChartGrid}=await import('../../src/ui/workspace-history');
 const {workspace,id}=fixture(),sources=workspaceDatasets(workspace),before=workspace.grid.cells[id],rsi={id:'synthetic-rsi',kind:'rsi' as const,inputs:{},plots:{},offset:0,visible:true,paneId:'pane-1'};
 const added=resetIncompatibleFrame(before,{...before,indicators:[rsi]},sources,sources);expect(added.frame).toBeUndefined();expect(added.chartOptions.auto).toBe(false);expect(carriedFrameCell(added)).toBe(true);
 const removed=resetIncompatibleFrame({...before,indicators:[rsi]},before,sources,sources);expect(removed.chartOptions.auto).toBe(false);
 const restyled=resetIncompatibleFrame(before,{...before,style:'line',indicators:[rsi]},sources,sources);expect(restyled.chartOptions.auto).toBe(true);expect(carriedFrameCell(restyled)).toBe(false);
 const carried={...workspace,grid:{...workspace.grid,cells:{...workspace.grid.cells,[id]:added}}},recaptured={...carried,grid:{...carried.grid,cells:{...carried.grid.cells,[id]:{...added,frame:before.frame}}}};
 expect(changedChartGrid(carried,recaptured)).toBe(false);expect(changedChartGrid(workspace,carried)).toBe(true);
 const fromAuto={...workspace,grid:{...workspace.grid,cells:{...workspace.grid.cells,[id]:{...added,chartOptions:{...added.chartOptions,auto:true}}}}};expect(changedChartGrid(fromAuto,recaptured)).toBe(true);
});
