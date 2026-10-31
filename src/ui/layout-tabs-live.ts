import {ALPACA_IEX_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID} from '../domain/alpaca-live';
import {liveDatasetById,registerLiveDataset} from './live-registry';
import {liveChartPlaceholder,liveChartsOf,liveComparisonsOf,liveRefOfDatasetId,reconnectLiveComparisonsGrid,reconnectLiveGrid,type LiveAvailability,type LiveChartRef,type LiveComparisonRef,type LiveReopen} from './live-workspace';
import type {MultiChartState} from './MultiChartGrid';
import type {ChartWorkspace} from './workspace-grid';

// Switching tabs opens another saved layout. Live feeds follow the visible grid only (App closes a feed as soon as
// no visible chart names it), so the layout being opened can name live feeds that are closed now, and a layout restored
// from disk carries its live charts only as saved references (persistableWorkspace keeps them under liveCharts and
// liveComparisons, keyed by chart id). This puts those charts back on their live sources through the same restore
// machinery (stand-in, then the feed opens under the same dataset id), so a tab comes back live instead of failing on a
// missing source or showing the synthetic stand-in.

// The saved references of a layout are used the first time it opens in this session; after that its in-memory grid is
// authoritative (a chart the user moved off live must not go back on live). Keyed by the loaded reference object.
const consumed=new WeakMap<object,Set<string>>();
const sessionRef=<R extends LiveChartRef>(ref:R):R=>ref.providerId===ALPACA_STUB_PROVIDER_ID?{...ref,providerId:ALPACA_IEX_PROVIDER_ID}:ref;
function standIn(datasetId:string):void{
 if(liveDatasetById(datasetId))return;const ref=liveRefOfDatasetId(datasetId);if(!ref)return;
 const holder=liveChartPlaceholder(ref,false);if(holder&&holder.provenance.datasetId===datasetId)registerLiveDataset(holder);
}
/** The grid of a saved layout about to open, with its live charts and live comparisons put back on live sources, and the
 * feeds the App opens once the layout is shown. leavingLayoutId: the layout being closed (its saved references are spent). */
export function liveTabGrid(workspace:ChartWorkspace&{liveCharts?:unknown;liveComparisons?:unknown},grid:MultiChartState,availability:LiveAvailability,leavingLayoutId?:string):{grid:MultiChartState;reopen:LiveReopen[]}{
 const owner=(workspace.liveCharts??workspace.liveComparisons) as object|undefined;let spent:Set<string>|undefined;
 if(owner&&typeof owner==='object'){spent=consumed.get(owner);if(!spent){spent=new Set();consumed.set(owner,spent);}if(leavingLayoutId)spent.add(leavingLayoutId);}
 const fromFile=!!spent&&!spent.has(grid.layout.id);if(spent)spent.add(grid.layout.id);
 const savedCharts=fromFile?liveChartsOf(workspace):{},savedCompared=fromFile?liveComparisonsOf(workspace):{};
 const refs:Record<string,LiveChartRef>={},compared:Record<string,LiveComparisonRef[]>={};
 for(const row of grid.layout.cells){
  const cell=grid.cells[row.id];if(!cell)continue;const shown=liveRefOfDatasetId(cell.datasetId);
  if(shown){standIn(cell.datasetId);refs[row.id]=sessionRef(shown);}else if(savedCharts[row.id])refs[row.id]=sessionRef(savedCharts[row.id]);
  const rows:LiveComparisonRef[]=[];
  cell.comparisons.forEach(({datasetId,...comparison},position)=>{const ref=liveRefOfDatasetId(datasetId);if(!ref)return;standIn(datasetId);rows.push({...sessionRef(ref),position,comparison});});
  for(const ref of savedCompared[row.id]??[])if(!rows.some(item=>item.comparison.id===ref.comparison.id))rows.push(sessionRef(ref));
  if(rows.length)compared[row.id]=rows;
 }
 if(!Object.keys(refs).length&&!Object.keys(compared).length)return{grid,reopen:[]};
 const charts=Object.keys(refs).length?reconnectLiveGrid(workspace,grid,refs,availability):{grid,reopen:[]};
 const comparisons=Object.keys(compared).length?reconnectLiveComparisonsGrid(workspace,charts.grid,compared,availability):{grid:charts.grid,reopen:[]};
 const seen=new Set<string>(),reopen=[...charts.reopen,...comparisons.reopen].filter(row=>{const key=row.providerId+'|'+row.symbol+'|'+row.interval;if(seen.has(key))return false;seen.add(key);return true;});
 return{grid:comparisons.grid,reopen};
}
