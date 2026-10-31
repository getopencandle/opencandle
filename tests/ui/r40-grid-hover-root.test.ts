import {describe,expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {MultiChartGrid,createMultiChartState,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';

// ROOT wiring: App and MultiChartGrid hunks. SYNTHETIC fixture dataset only.
const app=readFileSync('src/ui/App.tsx','utf8'),grid=readFileSync('src/ui/MultiChartGrid.tsx','utf8');
describe(' root wiring',()=>{
 it('App feeds the Data window through the hover path and the legend through the synced crosshair',()=>{
  expect(app).toContain("import {gridHoverStore,legendGhostTime,syncedLegendInspection,useGridHoverRender} from './grid-hover';");
  expect(app).toContain('dataWindow={gridHoverStore(gridHost).feed({chart,dataset,bars:calculationBars,sourceBars:bars,inspection:validInspection,');
  expect(app).toContain(',workspace.grid,universe,appPreferences.defaultChartTimezone)}');
  expect(app).toContain('const validInspection=syncedLegendInspection(matchingInspection(inspection,bars,source,workspace.chartStyle),calculationBars,bars,workspace.chartStyle,legendGhostTime(workspace.grid,gridHoverStore(gridHost).hover))');
  expect(app).toContain('onCellCrosshair={gridHoverStore(gridHost).onCellCrosshair}');
  // App passes the prop to WorkspaceChartHost, which renders the grid from slot callbacks; the host must forward it.
  const host=readFileSync('src/ui/workspace-chart-host.ts','utf8');
  expect(host).toContain("'onActiveCell'|'onCellCrosshair'|");
  expect(host).toContain('onCellCrosshair:(...args)=>{if(forwards(slot))port.read().onCellCrosshair?.(...args);},');
 });
 it('App subscribes after every other hook, so the hook order App tests rely on is unchanged',()=>{
  const at=app.indexOf(' useGridHoverRender(gridHoverStore(gridHost));'),hooks=[...app.matchAll(/use(State|Ref|Effect|Memo|Callback|LayoutEffect)\(/g)].map(match=>match.index!);
  expect(at).toBeGreaterThan(0);expect(Math.max(...hooks)).toBeLessThan(at);
  expect(app.indexOf('const gridHost=useRef')).toBeLessThan(app.indexOf('gridHoverStore(gridHost)'));
 });
 it('the grid reports every cell crosshair and retires a removed or replaced chart',()=>{
  expect(grid).toContain('crosshairWatch.attach(row.id,chart);');expect(grid).toContain('crosshairWatch.retain(shown);');
  expect(grid).toContain('const crosshairWatch=cellCrosshairWatch(controllers.current,(id,chart,time)=>latest.current.onCellCrosshair?.(id,chart,time));');
 });
 const dataset=fixtureDataset('GME',3);
 const render=(state:ReturnType<typeof createMultiChartState>)=>renderToStaticMarkup(React.createElement(MultiChartGrid,{state,datasets:[dataset],onChange:()=>{},onReady:()=>{},onActiveCell:()=>{}}));
 it('a multi-chart grid draws its dividers and stored track sizes; a maximized chart and a single chart have none',()=>{
  const two=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),'two-columns');
  const plain=render(two);expect(plain.match(/role="separator"/g)).toHaveLength(1);expect(plain).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
  const sized=render({...two,tracks:{schemaVersion:1,columns:[0.7,0.3],rows:[1]}});expect(sized).toContain('grid-template-columns:minmax(0,0.7fr) minmax(0,0.3fr)');expect(sized).toContain('left:calc(70% - 3px)');
  const maximized=render({...two,tracks:{schemaVersion:1,columns:[0.7,0.3],rows:[1]},layout:{...two.layout,maximizedCellId:two.layout.cells[1].id}});
  expect(maximized).not.toContain('role="separator"');expect(maximized).not.toContain('0.7fr');
  expect(render(createMultiChartState(dataset,{appearance:defaultTheme.appearance}))).not.toContain('role="separator"');
 });
 it('the layout picker offers every preset tile',()=>{
  const markup=render(createMultiChartState(dataset,{appearance:defaultTheme.appearance}));
  for(const label of ['2 small, 1 large','1 wide, 2 small','4 columns','4 rows','1 wide, 3 small','5 columns','1 large, 4 small','2 above 3','1 wide, 4 small','6 columns','6 charts, 2 columns','7 columns','8 columns','8 charts, 2 columns','14 charts'])expect(markup).toContain(`title="${label}"`);
 });
});
