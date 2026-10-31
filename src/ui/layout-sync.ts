import type {BarDataset} from '../domain/types';
import type {LayoutSnapshot,LayoutSync} from '../chart/layout-port';
import type {MultiChartState} from './MultiChartGrid';
import {exactGridDataset} from '../chart/grid-analysis-coordinator';
import {linkedDatasetAtInterval} from './source-basis';
import {transitionDrawingScope} from './drawing-scopes';
import {resetIncompatibleFrame} from './frame-reset-policy';
import {setCellLinkGroup,type LinkChoiceId} from './link-groups';

// Layout setup "Sync in layout" items and the catch-up a switch or a link group change brings.
// Turning Symbol or
// Interval sync on brings the other charts of the active chart's link group to the active chart at once, and a
// chart that joins a link group while Symbol or Interval sync is on takes that group's symbol or interval. Charts keep
// their own exact supplied source when they already match. The leader, the hints and the refusal wording are our own choice.
// Nothing new is persisted: the switches and the cell group already live in the layout document (schemaVersion 1).

/** The Layout setup order: Symbol, Interval, Crosshair, Time, Date range, then Drawings (LV's place for the sync toggle). */
export const SYNC_ITEMS=Object.freeze(['symbol','interval','crosshair','time','dateRange','drawings'] as const);
/** LV wording, sentence case, shown as each item's tooltip. */
export const SYNC_HINTS:Readonly<Record<keyof LayoutSync,string>>=Object.freeze({
 symbol:'Charts in the same link group show the same symbol',
 interval:'Charts in the same link group show the same interval',
 crosshair:'The crosshair on one chart is shown at the same time on the linked charts',
 time:'Scrolling or zooming one chart moves the linked charts to the same time',
 dateRange:'Linked charts show the same date range',
 drawings:'New drawings are copied to every chart in the layout with the same symbol',
});
export interface SyncCatchUp {next:MultiChartState;moved:string[]}
/** Bring `targets` to the leader's symbol and/or interval in one prepared state (drawing scopes and frames transition
 * with the source, as for a linked Source change). Throws, changing nothing, when a needed source is not supplied. */
function catchUp(previous:MultiChartState,layout:LayoutSnapshot,leaderId:string,targets:readonly string[],follow:{symbol:boolean;interval:boolean},universe:readonly BarDataset[]):SyncCatchUp|null{
 if(!follow.symbol&&!follow.interval)return null;
 const leader=exactGridDataset(previous,leaderId,universe),next:MultiChartState={...previous,layout:structuredClone(layout),cells:{...previous.cells}},moved:string[]=[];
 for(const id of targets){
  if(id===leaderId)continue;const row=next.layout.cells.find(cell=>cell.id===id);if(!row)throw new Error('Unknown chart');
  const symbol=follow.symbol?leader.instrument.symbol:row.symbol,interval=follow.interval?leader.resolution:row.interval;
  if(symbol===row.symbol&&interval===row.interval)continue;
  const own=exactGridDataset(previous,id,universe),basis=follow.symbol?leader:own,data=interval===basis.resolution?basis:linkedDatasetAtInterval(universe,basis,interval);
  row.symbol=data.instrument.symbol;row.interval=data.resolution;
  next.cells[id]=resetIncompatibleFrame(previous.cells[id],transitionDrawingScope({...previous.cells[id],datasetId:data.provenance.datasetId},own,data),universe,universe);moved.push(id);
 }
 return moved.length?{next,moved}:null;
}
/** A sync switch change. Null: only the switch changes (publish the layout). */
export function planSyncSwitch(previous:MultiChartState,patch:Partial<LayoutSync>,universe:readonly BarDataset[]):SyncCatchUp|null{
 const before=previous.layout.sync,after={...before,...patch},symbol=!before.symbol&&after.symbol,interval=!before.interval&&after.interval;
 if(!symbol&&!interval)return null;
 const layout={...previous.layout,sync:after},leader=layout.cells.find(row=>row.id===layout.activeCellId);if(!leader)throw new Error('Active chart is missing from the layout.');
 const targets=layout.cells.filter(row=>row.id!==leader.id&&row.group===leader.group).map(row=>row.id);
 return catchUp(previous,layout,leader.id,targets,{symbol,interval:interval||symbol&&after.interval},universe);
}
/** A chart joins a link group. The active chart leads when it is in that group, otherwise the first member in layout
 * order. Null: only the group changes. */
export function planGroupJoin(previous:MultiChartState,cellId:string,choice:LinkChoiceId,universe:readonly BarDataset[]):SyncCatchUp|null{
 const layout=setCellLinkGroup(previous.layout,cellId,choice),row=layout.cells.find(cell=>cell.id===cellId)!,members=layout.cells.filter(cell=>cell.id!==cellId&&cell.group===row.group);
 if(!members.length)return null;const leader=members.find(cell=>cell.id===layout.activeCellId)??members[0];
 return catchUp(previous,layout,leader.id,[cellId],{symbol:layout.sync.symbol,interval:layout.sync.interval},universe);
}
