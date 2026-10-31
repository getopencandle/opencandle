import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

// ROOT wiring: App hands the Data window the same resolved chart timezone and hour cycle as every other
// time surface (shownTimeZone, shownTimeHours) and the chart Date format. Source text check only; the behaviour
// is pinned in r39-data-window-2.test.ts.
const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');

it('the Data window reads the resolved chart timezone, the hours format and the Date format',()=>{
 // App passes these props through the hovered-cell feed (dataWindow={gridHoverStore(gridHost).feed({...},...)}),
 // so the check pins the props object itself, with or without that wrapper.
 expect(app).toContain('{chart,dataset,bars:calculationBars,sourceBars:bars,inspection:validInspection,indicators:indicatorViews,timezone:shownTimeZone,timeHours:shownTimeHours,dateFormat:workspace.chartSettings.scales.dateFormat}');
 expect(app).not.toContain('timezone:workspace.chartOptions.timezone}}');
});
