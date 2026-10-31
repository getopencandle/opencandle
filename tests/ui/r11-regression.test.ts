import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {statusLineParts,type StatusLineSettings} from '../../src/chart/status-line-model';
import {legendButtons} from '../../src/chart/legend-model';
import * as view from '../../src/ui/indicator-legend-view';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {createGridFrameGesture} from '../../src/chart/grid-frame-gesture';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {fixtureDataset} from '../../src/domain/fixtures';
import {toggleLock,toggleHide,unhideUnlockStep,createUnhideUnlock,defaultDrawingUtility,lockActive,hideActive} from '../../src/chart/drawing-utility-state';
import type {ChartController} from '../../src/chart/adapter';
import type {HistoricalChartFrame} from '../../src/chart/historical-frame';

// regression lane. Each test reproduces one packaged-flow failure of release 11
// headlessly and failed before its fix. SYNTHETIC values only; no DOM, window or packaged claim.

describe(' cause 1: indicator legend hover buttons',()=>{
 const css=readFileSync('src/ui/indicator-legend.css','utf8');
 const rules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^}]*)\}/g)].map(match=>({selectors:match[1].split(',').map(text=>text.trim()),body:match[2]}));
 const hideButton=renderToStaticMarkup(createElement('div',null,view.legendButtonView(legendButtons('indicator',{hidden:true,intervalRestricted:false})[0],'SMA 9 close',()=>{})));
 const classes=new Set(/class="([^"]+)"/.exec(hideButton)![1].split(/\s+/));
 it('the hidden-row rule that keeps Show visible targets a class the hide button actually carries',()=>{
  expect(hideButton).toContain('aria-label="Show SMA 9 close"');
  const hiddenRow=rules.filter(rule=>/opacity\s*:\s*1|visibility\s*:\s*visible/.test(rule.body)).flatMap(rule=>rule.selectors).filter(selector=>selector.startsWith('.lv-legend-row[data-hidden=true]'));
  expect(hiddenRow.length).toBeGreaterThan(0);
  for(const selector of hiddenRow){const target=/\.([a-z-]+)$/.exec(selector)![1];expect(classes.has(target),selector+' must match the rendered hide button ('+[...classes].join(' ')+')').toBe(true);}
 });
 it('buttons that wait for hover stay in the accessibility tree and the Tab order (no visibility:hidden or display:none)',()=>{
  const base=rules.filter(rule=>rule.selectors.some(selector=>/\.lv-legend-button$/.test(selector)&&!/:hover|:focus-within|data-hidden/.test(selector)));
  expect(base.length).toBeGreaterThan(0);
  for(const rule of base){expect(rule.body).not.toMatch(/visibility\s*:\s*hidden/);expect(rule.body).not.toMatch(/display\s*:\s*none/);}
 });
});

describe(' cause 2: chart heading values',()=>{
 it('the default status line renders O, H, L, C and the change as five direct value boxes',()=>{
  const settings:StatusLineSettings={logo:true,title:{visible:true,source:'name'},chartValues:true,barChange:true,volume:false,lastDayChange:false,indicatorTitles:true,indicatorInputs:true,background:{visible:true,transparency:50}};
  const status=statusLineParts(settings,{symbol:'GME',name:'GME synthetic',exchange:'SYNTHETIC',interval:'1D'},{time:2,open:10,high:12,low:9,close:11,volume:5},{time:1,open:9,high:10,low:8,close:10,volume:4},[],{legendVisible:true});
  const html=renderToStaticMarkup(createElement('div',{className:'ohlc'},view.statusLineValues(status,{text:'+1.00 (10.00%)',positive:true})));
  // Direct children of .ohlc: strip the wrapper, then count top-level spans.
  const inner=html.replace(/^<div class="ohlc">/,'').replace(/<\/div>$/,'');let depth=0,top=0;
  for(const tag of inner.matchAll(/<(\/?)span\b/g)){if(tag[1]){depth--;}else{if(depth===0)top++;depth++;}}
  expect(top).toBe(5);
 });
});

describe(' cause 3: a non-chart workspace change during a frame gesture tail',()=>{
 it('patchWorkspace keeps the grid object for a patch that names no chart field',()=>{
  const workspace=createInitialWorkspace(),next=patchWorkspace(workspace,{drawingUtility:toggleLock(workspace.drawingUtility)});
  expect(next.drawingUtility.drawingsLocked).toBe(true);
  expect(next.grid).toBe(workspace.grid);
  expect(patchWorkspace(workspace,{chartOptions:{...workspace.chartOptions,invert:true}}).grid).not.toBe(workspace.grid);
 });
 it('a Lock all toggle inside the 200 ms tail of a pan does not quarantine the chart; the pan is saved',async()=>{vi.useFakeTimers();try{
  let workspace=createInitialWorkspace();const id=workspace.grid!.layout.activeCellId,dataset=fixtureDataset(workspace.grid!.layout.cells[0].symbol,500),source=sourceContextForDataset(dataset,dataset.bars);
  const frame:HistoricalChartFrame={schemaVersion:1,basis:{basisIdentity:source.basisIdentity!,revision:source.revision,style:'candles'},calculationFingerprints:{},panes:[{key:{kind:'price'},owners:[],order:0,heightWeight:1,collapsed:false,mode:'price',log:false,invert:false,manualRange:null}],independent:[],maximized:null} as HistoricalChartFrame;
  let viewport={from:1,to:5};const failures:string[]=[],published:unknown[]=[];
  const cell={chart:{captureHistoricalFrame:()=>structuredClone(frame),getViewport:()=>viewport} as unknown as ChartController,input:{source,bars:dataset.bars,style:'candles'},executionIdentity:'ordinary',fingerprints:{}};
  const gesture=createGridFrameGesture({read:()=>workspace.grid!,cell:key=>key===id?cell as never:null,publish:next=>{published.push(next);workspace={...workspace,grid:next};return true;},failed:(_ids,message)=>{failures.push(message);}});
  expect(gesture.begin(id)).toBe(true);viewport={from:2,to:6};gesture.finish();
  workspace=patchWorkspace(workspace,{drawingUtility:toggleLock(workspace.drawingUtility)});// the toolbar click lands inside the tail
  await vi.advanceTimersByTimeAsync(201);
  expect(failures).toEqual([]);expect(published).toHaveLength(1);
  expect(workspace.drawingUtility.drawingsLocked).toBe(true);
 }finally{vi.useRealTimers();}});
});

describe(' cause 4: unhide/unlock on a one-click placement',()=>{
 it('a Horizontal line committed on its first mouse-down (no draft) shows hidden drawings and turns Lock all off',()=>{
  const on=toggleHide(toggleLock(defaultDrawingUtility()));expect(lockActive(on)&&hideActive(on)).toBe(true);
  const step=unhideUnlockStep(createUnhideUnlock(),'placed',on);
  expect(step.changed).toBe(true);expect(hideActive(step.utility)).toBe(false);expect(lockActive(step.utility)).toBe(false);
  expect(step.utility.indicatorsLocked).toBe(true);// only the drawing half is cleared
  expect(step.state.armed).toBe(true);// the next placement acts again
 });
 it('a two-click placement acts once at its first draft; its commit does not act again and re-arms',()=>{
  const on=toggleHide(toggleLock(defaultDrawingUtility()));
  const draft=unhideUnlockStep(createUnhideUnlock(),'draft',on);expect(draft.changed).toBe(true);
  const placed=unhideUnlockStep(draft.state,'placed',{...draft.utility,drawingsHidden:true});
  expect(placed.changed).toBe(false);expect(placed.state.armed).toBe(true);
 });
 it('the adapter routes drawing:created to the placed step only while a placement tool is armed and outside batches',()=>{
  const source=readFileSync('src/chart/adapter.ts','utf8');
  const handler=/chart\.on\('drawing:created',\(\)=>\{[^]*?unhideUnlockStep\(unhideUnlock,'placed'[^]*?\}\}\)/.exec(source);
  expect(handler).not.toBeNull();
  expect(handler![0]).toMatch(/drawingBatch\|\|nativeDrawingReconciliationHold\|\|drawingEraseHeld/);
  expect(handler![0]).toMatch(/chart\.drawings\.getTool\(\)==null\)return/);
 });
});
