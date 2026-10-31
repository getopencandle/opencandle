// Derived chart time labels, scroll to latest in bars, new grid cells copy the chart type,
// CSV readiness wait, fixed-width replay strip, compact paper notices. SYNTHETIC rows only.
import React from 'react';
import fs from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {derivedTimeCoords,frameCoords,logicalAtSourceTime,setDerivedTimeSource,sourceTimeAtLogical} from '../../src/chart/derived-time-labels';
import {scrollToLatestNow} from '../../src/ui/ScrollToLatestButton';
import {ReplayQuickTrade} from '../../src/ui/ReplayPanel';
import {compactTitle,PAPER_FILL_AUTOHIDE_MS} from '../../src/ui/PaperTradingToasts';
import {createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';

const DAY=86400000;
// Five bricks: two from one source day, then gaps (weekend, a week).
const times=[10*DAY,10*DAY,11*DAY,14*DAY,21*DAY];

describe('derived time labels (FLOWS-AUDIT4 #3)',()=>{
 it('maps logical indexes to the bricks\' source times and back',()=>{
  expect(sourceTimeAtLogical(times,0,DAY)).toBe(10*DAY);
  expect(sourceTimeAtLogical(times,3.4,DAY)).toBe(14*DAY);
  expect(sourceTimeAtLogical(times,6,DAY)).toBe(23*DAY);// past the last brick: one source interval per bar
  expect(sourceTimeAtLogical(times,-1,DAY)).toBe(9*DAY);
  expect(logicalAtSourceTime(times,10*DAY,DAY)).toBe(0);// first brick of a shared day
  expect(logicalAtSourceTime(times,14*DAY,DAY)).toBe(3);
  expect(logicalAtSourceTime(times,17.5*DAY,DAY)).toBeCloseTo(3.5,9);
  expect(logicalAtSourceTime(times,22*DAY,DAY)).toBe(5);
 });
 it('gives the renderer coords whose time methods speak source time and leaves pixels alone',()=>{
  const coords={barInterval:DAY,logicalToX:(l:number)=>l*10,visibleLogicalRange:()=>({from:0,to:4}),logicalToTime:()=>-1,timeToX:()=>-1,yToPrice:(y:number)=>y*2,get width(){return 50;}};
  const view=derivedTimeCoords(coords,times);
  expect(view.logicalToTime(4)).toBe(21*DAY);
  expect(view.visibleTimeRange()).toEqual({from:10*DAY,to:21*DAY});
  expect(view.timeToX(14*DAY)).toBe(30);
  expect(view.yToPrice(3)).toBe(6);expect(view.width).toBe(50);
 });
 it('swaps coords only while the renderer has a registered derived source',()=>{
  const renderer={},coords:Record<string,any>={barInterval:DAY,logicalToTime:()=>7};
  expect(frameCoords(renderer,coords)).toBe(coords);
  let on=true;setDerivedTimeSource(renderer,()=>on?times:null);
  expect(frameCoords(renderer,coords).logicalToTime(0)).toBe(10*DAY);
  on=false;expect(frameCoords(renderer,coords)).toBe(coords);
  setDerivedTimeSource(renderer,null);
 });
 it('both renderer seams and the adapter use the registration',()=>{
  expect(fs.readFileSync('src/chart/time-axis-ticks.ts','utf8')).toContain('frameCoords(renderer,args[1])');
  expect(fs.readFileSync('src/chart/precision-crosshair.ts','utf8')).toContain('frameCoords(renderer as object,given)');
  expect(fs.readFileSync('src/chart/adapter.ts','utf8')).toContain('setDerivedTimeSource(rendererHolder.current,');
 });
});

describe('scroll to latest (FLOWS-AUDIT4 #6)',()=>{
 it('uses the renderer bar-index scroll when the chart offers it',()=>{
  const goToDate=vi.fn(),scrollToLatest=vi.fn(()=>true);
  expect(scrollToLatestNow({getViewport:()=>({from:0,to:10}),goToDate,scrollToLatest} as never,100,1,3)).toEqual({ok:true});
  expect(scrollToLatest).toHaveBeenCalledOnce();expect(goToDate).not.toHaveBeenCalled();
 });
 it('falls back to calendar centering without it',()=>{
  const goToDate=vi.fn(()=>({ok:true}));
  expect(scrollToLatestNow({getViewport:()=>({from:0,to:10}),goToDate} as never,100,1,3)).toEqual({ok:true});
  expect(goToDate).toHaveBeenCalledWith(98);
 });
 it('the button reads latestBarHidden (bars), the adapter applies the right margin',()=>{
  expect(fs.readFileSync('src/ui/ScrollToLatestButton.tsx','utf8')).toContain('chart.latestBarHidden()');
  const adapter=fs.readFileSync('src/chart/adapter.ts','utf8');
  expect(adapter).toContain('vp.rightOffset<-0.5');expect(adapter).toMatch(/scrollToLatest:\(\):boolean=>/);
 });
});

describe('grid layout (FLOWS-AUDIT4 #7)',()=>{
 it('new charts copy the active chart type and its settings, with no saved viewport',()=>{
  const dataset=fixtureDataset('GME',5);
  const single=createMultiChartState(dataset,{appearance:defaultTheme.appearance,style:'bars',chartTypeSettings:{bars:{thinBars:false}} as never});
  const two=resizeMultiChartState(single,'two-columns');
  const added=two.layout.cells.find(row=>row.id!==single.layout.activeCellId)!;
  expect(two.cells[added.id].style).toBe('bars');
  expect(two.cells[added.id].chartTypeSettings).toEqual({bars:{thinBars:false}});
  expect(two.cells[added.id].viewport).toBeUndefined();
 });
});

describe('CSV export readiness (FLOWS-AUDIT4 #11)',()=>{
 it('both CSV paths wait for settling studies and never fail silently',()=>{
  const app=fs.readFileSync('src/ui/App.tsx','utf8');
  expect(app.match(/await settledCsvCapture\(/g)?.length).toBe(2);
  expect(app).toContain("else if(action==='source-csv')setMessage(CSV_RETRY_NOTICE)");
  expect(app).toContain('else setMessage(CSV_RETRY_NOTICE);');
 });
});

describe('replay strip and notices (FLOWS-AUDIT4 #13, #14)',()=>{
 it('the position slot is always rendered, Flat when no position',()=>{
  const html=renderToStaticMarkup(React.createElement(ReplayQuickTrade,{lotSize:1,bid:null,ask:null,position:null,onOrder:vi.fn(),onFlatten:vi.fn(),disabled:false}));
  expect(html).toMatch(/class="lv-replay-position"[^>]*data-flat="true"[^>]*>Flat</);
  const css=fs.readFileSync('src/ui/replay-panel.css','utf8');
  expect(css).toMatch(/\.lv-replay-position\{[^}]*width:150px/);
 });
 it('paper notices are one-line corner notices that close sooner for fills',()=>{
  expect(compactTitle('Virtual order filled')).toBe('Order filled');
  expect(PAPER_FILL_AUTOHIDE_MS).toBeLessThan(8000);
  const source=fs.readFileSync('src/ui/PaperTradingToasts.tsx','utf8');
  expect(source).toContain("bottom: 'calc(var(--lv-bottom-h, 38px) + 40px)'");
  expect(source).not.toContain("left: '50%'");
 });
});
