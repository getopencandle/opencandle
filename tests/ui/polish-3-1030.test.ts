import {afterEach,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {setDemoDataMode,demoDataLabel} from '../../src/domain/demo-mode';
import {demoPlaceholderDataset,fixtureDataset,isDemoPlaceholder} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {createMultiChartState,resizeMultiChartState,type GridTreeInput} from '../../src/ui/MultiChartGrid';
import {createGridTreeCoordinator,type GridCellReadiness} from '../../src/chart/grid-tree-coordinator';
import {EMPTY_MARKET_MESSAGE} from '../../src/chart/adapter';
import {demoDataset,shownImport,workspaceDatasets,selectedDataset,suppliedSourceId} from '../../src/ui/workspace-grid';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {sourceLabel} from '../../src/ui/symbol-search';
import {comparisonSourceText} from '../../src/chart/compare-port';
import {NeedsLiveCells} from '../../src/ui/NeedsLiveData';
import {chooseIntervalSource,intervalDatasetKey} from '../../src/domain/intervals';
import type {BarDataset} from '../../src/domain/types';

// Empty placeholder cells never block a layout change, leaving example mode leaves no invented prices, the panels
// say "Example data" (and get none in normal use), the card and banner cover nothing, and plain wording.
afterEach(()=>setDemoDataMode('legacy'));
const em=/—/;

function placeholderTree(layout:'single'|'two-columns'|'four'|'sixteen'){
 const dataset=demoPlaceholderDataset('GME');expect(isDemoPlaceholder(dataset)).toBe(true);
 const state=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),layout);expect(state.layout.cells).toHaveLength({single:1,'two-columns':2,four:4,sixteen:16}[layout]);
 const input:GridTreeInput={state,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary'};
 // A placeholder cell builds no chart: no controller, no runtime, and a status that never settles (or the adapter's refusal).
 const status=new Map<string,GridCellReadiness>(state.layout.cells.map((row,index)=>[row.id,index%2?{input:null,settled:false,error:''}:{input:null,settled:false,error:'Chart unavailable: Error: '+EMPTY_MARKET_MESSAGE}]));
 let canonical:unknown=null,pending=false;
 const coordinator=createGridTreeCoordinator({read:()=>input,alive:()=>true,staging:()=>true,controller:()=>null,runtime:()=>null,cell:id=>status.get(id),holdLinks:()=>({release(){}}),pending:value=>{pending=value;},failed:()=>{},canonical:value=>{canonical=value;}});
 return{input,coordinator,canonical:()=>canonical,pending:()=>pending};
}

it('1. empty placeholder cells count as ready: a staged tree of 1, 2, 4 or 16 placeholder charts publishes, and the old tree suspends',async()=>{
 for(const layout of ['single','two-columns','four','sixteen'] as const){
  const h=placeholderTree(layout),lease=await h.coordinator.waitUntilReady(h.input,new AbortController().signal);
  expect(lease.activeController).toBeNull();expect(lease.isCurrent()).toBe(true);
  expect(Object.keys(lease.canonicalState.cells)).toEqual(Object.keys(h.input.state.cells));
  for(const id of Object.keys(h.input.state.cells))expect(lease.canonicalState.cells[id]).toBe(h.input.state.cells[id]);
  expect(lease.publish()).toEqual({publicationErrors:[]});expect(h.canonical()).toBe(lease.canonicalState);expect(h.pending()).toBe(false);
  const hold=h.coordinator.suspend(h.input);expect(hold.isCurrent()).toBe(true);hold.resume();expect(h.pending()).toBe(false);
 }
});

it('1b. an empty cell that is not a placeholder still waits for its chart (no blanket pass)',async()=>{
 const dataset=fixtureDataset('GME',5),empty={...dataset,bars:[],instrument:{...dataset.instrument,exchange:'NASDAQ'}} as BarDataset,state=createMultiChartState(dataset,{appearance:defaultTheme.appearance});
 const input:GridTreeInput={state,datasets:[empty],activeBars:empty.bars,activeDatasetId:empty.provenance.datasetId,activeExecutionIdentity:'ordinary'};
 const coordinator=createGridTreeCoordinator({read:()=>input,alive:()=>true,staging:()=>true,controller:()=>null,runtime:()=>null,cell:()=>undefined,holdLinks:()=>({release(){}}),pending:()=>{},failed:()=>{},canonical:()=>{}});
 const abort=new AbortController(),wait=coordinator.waitUntilReady(input,abort.signal);setTimeout(()=>abort.abort(),60);
 await expect(wait).rejects.toThrow('cancel');
 expect(()=>coordinator.suspend(input)).toThrow('not settled');
});

it('2. an import built from example bars reads as a placeholder once example mode is left (same id, no bars)',()=>{
 setDemoDataMode('example');
 const daily=demoDataset('AAPL');expect(daily.bars.length).toBeGreaterThan(100);
 const built=chooseIntervalSource([daily],{instrumentId:daily.instrument.id,target:'1W',sourceKey:intervalDatasetKey(daily)});
 expect(built.ok&&built.kind==='derived').toBe(true);
 const weekly=(built as {dataset:BarDataset}).dataset;expect(weekly.provenance.fixture).toBe(true);
 const workspace={...createInitialWorkspace(),symbol:'AAPL',sourceId:weekly.provenance.datasetId,imports:[weekly]};
 // Example mode: AAPL is an example ticker, so the weekly import keeps its bars.
 expect(shownImport(weekly)).toBe(weekly);expect(selectedDataset(workspace)).toBe(weekly);
 setDemoDataMode('off');
 const hidden=shownImport(weekly);
 expect(hidden).not.toBe(weekly);expect(shownImport(weekly)).toBe(hidden);
 expect(hidden.bars).toEqual([]);expect(isDemoPlaceholder(hidden)).toBe(true);
 expect(hidden.provenance.datasetId).toBe(weekly.provenance.datasetId);expect(hidden.resolution).toBe(weekly.resolution);
 expect(selectedDataset(workspace)).toBe(hidden);
 expect(workspaceDatasets(workspace).find(row=>row.provenance.datasetId===weekly.provenance.datasetId)).toBe(hidden);
 expect(workspaceDatasets(workspace).some(row=>row.bars.length>0&&row.provenance.fixture)).toBe(false);
 // The saved import is untouched, and the placeholder view still names it as the chart source.
 expect(workspace.imports[0]).toBe(weekly);expect(weekly.bars.length).toBeGreaterThan(10);
 expect(suppliedSourceId(workspace,hidden)).toBe(weekly.provenance.datasetId);
 setDemoDataMode('legacy');expect(shownImport(weekly)).toBe(weekly);
});

it('3. panels label generated data "Example data" outside the legacy mode; search and compare follow',()=>{
 const synthetic=fixtureDataset('GME',5);
 expect(demoDataLabel()).toBe('Demo data');expect(sourceLabel({sourceKind:'synthetic',synthetic:true})).toBe('DEMO');expect(comparisonSourceText(synthetic)).toContain('Synthetic demo');
 for(const mode of ['example','off'] as const){
  setDemoDataMode(mode);
  expect(demoDataLabel()).toBe('Example data');
  expect(sourceLabel({sourceKind:'synthetic',synthetic:true})).toBe('EXAMPLE');
  expect(sourceLabel({sourceKind:'derived',synthetic:true})).toBe('EXAMPLE · derived');
  expect(comparisonSourceText(synthetic)).toContain('Example data');expect(comparisonSourceText(synthetic)).not.toMatch(/demo/i);
 }
 for(const file of ['HeatmapDialog.tsx','MarketViewsDialog.tsx','NotesDialog.tsx','CalendarDialog.tsx','FundamentalsDialog.tsx','ScreenerDialog.tsx']){
  const source=readFileSync(new URL('../../src/ui/'+file,import.meta.url),'utf8');
  expect(source,file).not.toMatch(/>Demo data<|'Demo data'|' · Demo data'/);expect(source,file).toContain('demoDataLabel()');
 }
});

it('4. plain wording: screener, fundamentals, the empty-interval reason and the search hint',()=>{
 const screener=readFileSync(new URL('../../src/ui/ScreenerDialog.tsx',import.meta.url),'utf8'),fundamentals=readFileSync(new URL('../../src/ui/FundamentalsDialog.tsx',import.meta.url),'utf8');
 for(const jargon of ['unresolved instrument sources','predicates','supplied/synthetic','Some sources are unresolved'])expect(screener).not.toContain(jargon);
 expect(screener).toContain('Show rows without data');
 expect(fundamentals).not.toContain('>SEC CIK<');expect(fundamentals).toContain('SEC company number (CIK)');
 expect(fundamentals).not.toContain('Mark import as demo data</label>');expect(fundamentals).toContain("demoDataMode()!=='off'&&");
 expect(fundamentals).not.toContain('is not in the ticker list');
 const placeholder=demoPlaceholderDataset('GME');
 const result=chooseIntervalSource([placeholder],{instrumentId:placeholder.instrument.id,target:'1W',sourceKey:intervalDatasetKey(placeholder)});
 expect(result.ok).toBe(false);expect((result as {message:string}).message).toBe('This chart has no data yet. Set up live data in Data sources.');
 const search=readFileSync(new URL('../../src/ui/SymbolSearchDialog.tsx',import.meta.url),'utf8');
 expect(search).toContain('Live data is needed to find more symbols.');
 for(const text of [screener,fundamentals,search])expect(text).not.toMatch(em);
});

it('5. the single-chart card is measured to its cell, and the example banner is an in-flow strip',()=>{
 const html=renderToStaticMarkup(React.createElement(NeedsLiveCells,{cells:[{cellId:'a',symbol:'GME',crypto:false,liveReady:false,example:false}],single:true,onOpenLive(){},onOpenDataSources(){},onLoadExample(){}}));
 expect(html).toContain('data-lv-needs-live-layer');
 const css=readFileSync(new URL('../../src/ui/needs-live-data.css',import.meta.url),'utf8'),banner=/\.lv-example-banner\{[^}]*\}/.exec(css)?.[0]??'';
 expect(banner).toContain('position:static');expect(banner).not.toMatch(/bottom:|absolute|transform/);
});

it('6. a placeholder grid cell builds no chart; the start opens a set-up live source; the trade box owner ignores live ticks',()=>{
 const grid=readFileSync(new URL('../../src/ui/MultiChartGrid.tsx',import.meta.url),'utf8'),app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
 expect(grid).toContain('const placeholder=bars.length===0&&(isDemoPlaceholder(dataset)||isDemoPlaceholder(liveInput.dataset));');
 expect(grid).toContain('{!placeholder&&<ChartPanel ');
 expect(app).toContain("'Ready.')");expect(app).not.toContain('Ready. Set up live data in Data sources.');
 expect(app).toMatch(/if\(alpacaKeyKnown&&!startLiveOpened\.has\(current\)&&isDemoPlaceholder\(dataset\)\)/);
 const owner=/const mainSeriesHeadingOwner=useMemo\(\(\)=>Object\.freeze\(\{\}\),\[([^\]]*)\]\)/.exec(app)?.[1]??'';
 expect(owner.split(',')).not.toContain('bars');expect(owner.split(',')).not.toContain('dataset');expect(owner).toContain('dataset.provenance.datasetId');
});
