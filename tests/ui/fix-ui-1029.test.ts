import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {placeBarInPane,PANE_LEGEND_RESERVE} from '../../src/ui/drawing-edit-bar-position';
import {activeShellTintIndex,shellTintValues,SHELL_TINT_TOKENS} from '../../src/ui/shell-tint';
import {tintColor} from '../../src/ui/grid-tint';
import {lvDarkTheme,lvMediumDarkTheme} from '../../src/ui/themes';
import {HEADING_NARROW_WIDTH,HEADING_TINY_WIDTH} from '../../src/ui/CellSeriesHeading';
import {layoutPickQueue} from '../../src/ui/MultiChartGrid';

const grid=(appearances:unknown[],active:number)=>({layout:{cells:appearances.map((_,i)=>({id:'c'+i})),activeCellId:'c'+active},cells:Object.fromEntries(appearances.map((appearance,i)=>['c'+i,{appearance}]))}) as never;

describe('drawing toolbar placement',()=>{
 const bar={width:356,height:40},pane={width:970,height:700};
 it('sits above the drawing, inside the plot width (never over the price scale)',()=>{
  expect(placeBarInPane({left:800,top:300,right:960,bottom:340},bar,pane)).toEqual({left:614,top:238}); // 14px handle clearance above the anchors
 });
 it('never opens over the legend band: below the drawing when there is no room above',()=>{
  expect(placeBarInPane({left:400,top:60,right:600,bottom:120},bar,pane)).toEqual({left:322,top:142}); // Clear of the lower handle
  const tall=placeBarInPane({left:0,top:0,right:900,bottom:690},bar,pane);expect(tall.top).toBeGreaterThanOrEqual(PANE_LEGEND_RESERVE);expect(tall.top+bar.height).toBeLessThanOrEqual(pane.height);
 });
});

describe('shell tint follows the active chart',()=>{
 const medium=lvMediumDarkTheme.appearance,dark=lvDarkTheme.appearance;
 it('default theme: cells 2-4 tint the shell with their own index, cell 1 leaves it plain',()=>{
  expect([0,1,2,3].map(i=>activeShellTintIndex(grid([medium,medium,medium,medium],i)))).toEqual([0,1,2,3]);
  expect(activeShellTintIndex(grid([medium],0))).toBe(0);
 });
 it('owner case: LV Dark first, Medium Dark after: cell 2 plain Medium Dark, cells 3 and 4 tinted',()=>{
  expect([0,1,2,3].map(i=>activeShellTintIndex(grid([dark,medium,medium,medium],i)))).toEqual([0,0,2,3]);
 });
 it('the tinted surface equals the active cell background, text tokens are untouched',()=>{
  const values=shellTintValues({'--lv-bg-surface':medium.background,'--lv-text-primary':'#e3e6ee'},2);
  expect(values['--lv-bg-surface']).toBe(tintColor(medium.background,2));
  expect(values['--lv-text-primary']).toBeUndefined();
  expect(SHELL_TINT_TOKENS).not.toContain('--lv-text-primary');
  expect(shellTintValues({'--lv-bg-surface':medium.background},0)).toEqual({});
 });
});

describe('wiring pins',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8'),grid=readFileSync('src/ui/MultiChartGrid.tsx','utf8'),css=readFileSync('src/ui/cell-series-heading.css','utf8');
 it('a grid publication met by the routine autosave write is held and retried, not refused',()=>{
  expect(app).toContain('if(held&&backgroundWriteActive()){held(run=>{afterStorageWrite(run);});return false;}');
  expect(grid).toContain('if(wait&&!stale)wait(()=>{if(alive.current&&!latest.current.staging)retryStale();});');
  expect(grid).toMatch(/accepted:value=>\{\/\* An accepted publication supersedes[^*]*\*\/setError\(""\);/);
 });
 it('a layout pick during a running layout change is queued',()=>{
  expect(grid).toContain('layoutPickQueue.pending={layoutId,at:Date.now()};return;');
  expect(layoutPickQueue.running).toBe(0);
 });
 it('narrow headings keep the title and drop O, H, L first',()=>{
  expect(HEADING_TINY_WIDTH).toBeLessThan(HEADING_NARROW_WIDTH);
  expect(css).toContain(':is([data-value=O],[data-value=H],[data-value=L]){display:none}');
  expect(css).toContain('.vela-attribution{transform:scale(.6)');
  expect(css).not.toMatch(/vela-attribution\{[^}]*display:none/);
 });
 it('rail dialogs toggle and keep the rail above their shade',()=>{
  expect(app).toContain("pressed:dialog==='screener',onSelect:()=>railDialog('screener'");
  expect(readFileSync('src/ui/styles.css','utf8')).toContain('.workspace[data-lv-rail-dialog]>.lv-right-rail{position:relative;z-index:101}');
 });
});
