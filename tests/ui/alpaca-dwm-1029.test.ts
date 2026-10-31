import {afterEach,describe,expect,it} from 'vitest';
import {alpacaSearchDatasets} from '../../src/domain/alpaca-live';
import {coinbaseSearchDatasets} from '../../src/domain/coinbase-live';
import type {BarDataset} from '../../src/domain/types';
import {clearLiveDatasets,registerLiveDataset} from '../../src/ui/live-registry';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {createMultiChartState,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {patchWorkspace,projectGrid} from '../../src/ui/workspace-grid';
import {persistableWorkspace,restoreLiveCharts,type SavedLiveChartRef} from '../../src/ui/live-workspace';
import {cellSessionDataset,cellSessionDormant,cellSessionRefusal} from '../../src/chart/cell-session';
import {cellReplaySources} from '../../src/ui/cell-replay-sessions';
import {defaultTheme} from '../../src/ui/themes';

// An Alpaca 4h chart with Extended hours off (explicit per-chart session 'regular') refused 1D, 1W and 1M:
// the switch commit threw "Chart trading sessions require an intraday US equity source in New York time." and the toolbar
// said "The live interval could not be opened." A choice on a source without sessions is now dormant.
type Workspace=ReturnType<typeof createInitialWorkspace>&{grid:MultiChartState;liveCharts?:Record<string,SavedLiveChartRef>};
const DAY=86400,start=Date.parse('2026-09-01T04:00:00Z')/1000;
function live(interval:string):BarDataset{
 const source=alpacaSearchDatasets(true,['BTC'],interval).find(row=>row.instrument.symbol==='BTC'&&row.resolution===interval)!;
 const step=interval==='240m'?4*3600:interval==='1W'?7*DAY:DAY;
 const result:BarDataset={...source,bars:Array.from({length:6},(_,index)=>({time:start+index*step+(interval==='240m'?13.5*3600:0),open:44+index,high:45+index,low:43+index,close:44.5+index,volume:100+index})),provenance:{...source.provenance,state:'ready',asOf:start+6*step,revision:'synthetic-alpaca-dwm-v1'}};
 registerLiveDataset(result);return result;
}
function workspace(session:'regular'|'extended'):Workspace{
 const grid=createMultiChartState(live('240m'),{appearance:defaultTheme.appearance,session});
 return projectGrid({...createInitialWorkspace()},grid) as Workspace;
}
afterEach(()=>clearLiveDatasets());

describe('ALPACA- Alpaca daily, weekly and monthly with a per-chart session',()=>{
 it('a session choice is dormant on daily and longer sources, active on intraday ones',()=>{
  const daily=live('1D'),intraday=live('240m');
  expect(cellSessionDormant(daily)).toBe(true);expect(cellSessionDormant(intraday)).toBe(false);
  expect(cellSessionRefusal(daily,'regular')).toContain('intraday');
  expect(cellSessionDataset(daily,{session:'regular'})).toBe(daily);
  expect(cellSessionDataset(intraday,{session:'regular'})).not.toBe(intraday);
 });
 for(const session of ['regular','extended'] as const)for(const interval of ['1D','1W'])it(`4h with ${session} hours switches to ${interval} and keeps the choice`,()=>{
  const before=workspace(session),target=live(interval);
  const next=patchWorkspace(before,{symbol:'BTC',sourceId:target.provenance.datasetId}) as Workspace;
  const id=next.grid.layout.activeCellId;
  expect(next.grid.layout.cells[0].interval).toBe(interval);expect(next.grid.cells[id].datasetId).toBe(target.provenance.datasetId);expect(next.grid.cells[id].session).toBe(session);
  const back=patchWorkspace(next,{symbol:'BTC',sourceId:live('240m').provenance.datasetId}) as Workspace;
  expect(back.grid.cells[id].session).toBe(session);
 });
 it('saves a daily live chart with its dormant session, and the saved references restore',()=>{
  const before=workspace('regular'),next=patchWorkspace(before,{symbol:'BTC',sourceId:live('1D').provenance.datasetId}) as Workspace;
  const saved=persistableWorkspace(next) as Workspace,ref=Object.values(saved.liveCharts!)[0];
  expect(ref).toEqual({providerId:'alpaca-iex',symbol:'BTC',interval:'1D',session:'regular'});
  expect(()=>restoreLiveCharts(saved.liveCharts,saved as never)).not.toThrow();
  const intraday=persistableWorkspace(before) as Workspace;expect(Object.values(intraday.liveCharts!)[0]).toEqual({providerId:'alpaca-iex',symbol:'BTC',interval:'240m',session:'regular'});
 });
 it('a symbol switch to Coinbase keeps the chart and saves no session for the crypto reference',()=>{
  const source=coinbaseSearchDatasets(true,'240m').find(row=>row.instrument.symbol==='BTC-USD')!,coin:BarDataset={...source,bars:[{time:start,open:1,high:2,low:1,close:2,volume:1}],provenance:{...source.provenance,state:'ready',asOf:start+4*3600,revision:'synthetic-alpaca-dwm-v1'}};registerLiveDataset(coin);
  const next=patchWorkspace(workspace('regular'),{symbol:'BTC-USD',sourceId:coin.provenance.datasetId}) as Workspace,saved=persistableWorkspace(next) as Workspace;
  expect(next.grid.cells[next.grid.layout.activeCellId].datasetId).toBe(coin.provenance.datasetId);expect(Object.values(saved.liveCharts!)[0]).toEqual({providerId:'coinbase-public',symbol:'BTC-USD',interval:'240m'});
  expect(()=>restoreLiveCharts(saved.liveCharts,saved as never)).not.toThrow();
 });
 it('replay on a daily chart with a dormant session keeps its own source',()=>{
  const daily=live('1D');expect(cellReplaySources(daily,{session:'regular'},[daily])).toEqual([daily]);
 });
});
