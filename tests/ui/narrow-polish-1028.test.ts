import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
// Narrow windows keep the right panel resizable, fit the watchlist, wrap the legend
// before the OHLC line reaches the pane controls, and ellipsize the layout name. Live widths are in
const read=(path:string)=>readFileSync(path,'utf8');
const styles=read('src/ui/styles.css'),watchlist=read('src/ui/watchlist.css'),legend=read('src/ui/indicator-legend.css'),components=read('src/ui/components.css');
describe('NARROW-POLISH-1028',()=>{
 it('narrow media queries change only the default panel width, so the splitter variable still sizes the panel',()=>{
  expect(styles).toContain('@media(max-width:1150px){:root{--lv-panel-w:236px}');
  // No fixed-px panel column remains in any workspace grid rule.
  for(const match of styles.matchAll(/\.workspace\{[^}]*grid-template-columns:([^;}]*)/g))expect(match[1]).toContain('var(--lv-panel-w)');
  expect(styles).toMatch(/grid-template-columns:var\(--lv-left-w\) minmax\(0,1fr\) min\(calc\(var\(--lv-panel-w\) - 1px\),max\(219px,calc\(100vw - 530px\)\)\)/);
  expect(components).not.toMatch(/--lv-paper-toast-right:calc\(var\(--lv-rail-w\) \+ \d+px/);
 });
 it('the watchlist table fits a narrow panel: value columns a quarter each, Symbol takes the rest',()=>{
  expect(watchlist).toMatch(/\.wl-table\{[^}]*container:lv-watchlist\/inline-size/);
  const block=watchlist.slice(watchlist.indexOf('@container lv-watchlist (max-width:290px)'));
  expect(block).toContain('table{width:100%;min-width:0}');expect(block).toContain('col:first-child{width:auto!important}');expect(block).toContain('col:not(:first-child){width:25%!important}');
 });
 it('the legend switches to two rows at the same chart width in both files, and the heading stops short of the pane controls',()=>{
  expect(styles).toContain('@container lv-chart (max-width:860px){\n.chart-heading{height:48px');
  expect(legend).toContain('@container lv-chart (max-width:860px){.chart-workspace>.indicator-legend>.lv-legend-price-scroll{top:84px}}');
  expect(styles+legend).not.toContain('lv-chart (max-width:720px)');
  const heading=read('src/ui/CellSeriesHeading.tsx');
  expect(heading).toContain('const HEADING_RIGHT_RESERVE=40;');expect(heading).toContain("['max-width',Math.max(0,facts.dataWidth-HEADING_RIGHT_RESERVE)+'px']");
 });
 it('the header collapses progressively and the layout name ellipsizes in its own box',()=>{
  expect(styles).toContain('.topbar .lv-icon-text:is([aria-label="Create alert"],[aria-label=Replay]) span{display:none}');
  expect(styles).toContain('@media(max-width:980px){.topbar .lv-icon-text span{display:none}}');
  expect(styles).toMatch(/\.layout-library-name\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  expect(read('src/ui/layout-menu.tsx')).toContain('<span className="layout-library-name">{active.name}{dirty?\' *\':\'\'}</span><ChevronDownIcon/>');
 });
});
