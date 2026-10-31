import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {rangeStart} from '../../src/chart/navigation';
// Source-shape checks (App is not rendered here) plus the span arithmetic the buttons promise.
const app=readFileSync('src/ui/App.tsx','utf8');
const effect=app.slice(app.indexOf('const pending=pendingRange.current;'),app.indexOf('[chart,bars,dataset,inspectionEpoch]);',app.indexOf('const pending=pendingRange.current;')));
it('a pending live range is kept and re-applied until the history covers it',()=>{
 expect(effect).toContain('shown.limitedByHistory');
 expect(effect).toContain('requestLiveHistory(pending.datasetId)');
 expect(effect).toMatch(/!shown\.limitedByHistory\)\{pendingRange\.current=null;return;\}/);
 expect(effect).toContain("state.status==='exhausted'");
 expect(effect).toContain('Showing all available history for this range.');
 expect(effect).toContain('Date.now()-pending.at>60000');
});
it('a same-interval click on a live chart also pages history for the span',()=>{
 const body=app.slice(app.indexOf('function rangeFromBottomToolbar('),app.indexOf('function toggleIntervalMenu('));
 expect(body).toContain("shown.limitedByHistory&&liveHistoryState(dataset.provenance.datasetId)?.status==='idle'");
});
it('range starts are exact calendar spans ending at the last bar',()=>{
 const last=Date.UTC(2026,9,28,12)/1000;
 expect(last-rangeStart(last,'1D')!).toBe(86400);expect(last-rangeStart(last,'5D')!).toBe(5*86400);
 expect(last-rangeStart(last,'1M')!).toBe(30*86400);expect(last-rangeStart(last,'3M')!).toBe(92*86400);
 expect(rangeStart(last,'All')).toBeNull();
});
import {fitRangeInterval} from '../../src/chart/bottom-toolbar';
it('a span that needs more bars than the plot holds opens the next coarser interval',()=>{
 const all=()=>true;
 expect(fitRangeInterval('3M','60m',1936,all)).toBe('120m');
 expect(fitRangeInterval('6M','120m',1936,all)).toBe('240m');
 expect(fitRangeInterval('3M','60m',3000,all)).toBe('60m');
 expect(fitRangeInterval('1M','30m',1936,all)).toBe('30m');
 expect(fitRangeInterval('YTD','1D',100,all)).toBe('1D');
 expect(fitRangeInterval('3M','60m',null,all)).toBe('60m');
 expect(fitRangeInterval('3M','60m',1936,id=>id!=='120m')).toBe('240m');
});
it('the adapter keeps a wide live range sticky across history pages (applyRange + reapply after each accepted frame)',()=>{
 const src=readFileSync('src/chart/adapter.ts','utf8');
 expect(src).toContain('reapplyStickyRange()');expect(src).toContain("container.addEventListener('wheel',dropStickyRange");
 expect(src).toContain('setRange: (range:RangePreset) => applyRange(range,true)');
});
