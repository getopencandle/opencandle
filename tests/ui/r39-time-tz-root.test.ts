import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

// ROOT wiring: App hands the active chart's resolved timezone (chart setting, then Default chart timezone) and
// hour cycle to the alert log, Go to date, replay Select date and the bottom clock; the grid hands the date settings to
// the time-axis ticks. Source text checks only (the behaviour is pinned in the r39 component and formatter tests).
const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
const grid=readFileSync(new URL('../../src/ui/MultiChartGrid.tsx',import.meta.url),'utf8');

it('App resolves one shown zone and passes it to every time surface',()=>{
 expect(app).toContain("const shownTimeZone=chartTimeZone(workspace.chartOptions.timezone,{defaultChoice:appPreferences.defaultChartTimezone,instrument:dataset.instrument}),shownTimeHours=workspace.chartSettings.scales.timeHours;");
 expect(app).toMatch(/<AlertsDock [^\n]*timezone=\{shownTimeZone\} timeHours=\{shownTimeHours\}/);
 expect(app).toMatch(/<DateNavigationDialog [^\n]*timezone=\{shownTimeZone\}/);
 expect(app).toMatch(/<ReplayPanel [^\n]*timezone=\{shownTimeZone\}/);
 expect(app).toMatch(/<ChartBottomToolbar [^\n]*timeHours=\{shownTimeHours\}/);
 expect(app).not.toMatch(/isoMinute\(/);
});
it('the grid hands Date format and Day of week to the time-axis ticks',()=>{
 expect(grid).toContain('ticks.setFormat({dayOfWeek:scales.dayOfWeek,dateFormat:scales.dateFormat,timeHours:scales.timeHours})');
 expect(grid).toContain('[chart,scales.timeHours,scales.dayOfWeek,scales.dateFormat]');
});
