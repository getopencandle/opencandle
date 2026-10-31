import type {BarDataset} from '../domain/types';
import type {MultiChartCellState} from './MultiChartGrid';
import {indicatorDefaults} from '../chart/indicator-settings';
import {sourceContextForDataset,sameChartSourceBasis} from '../chart/source-context';
import {supportsHistoricalFrame} from '../chart/historical-frame';

const fields=(value:Record<string,unknown>)=>Object.keys(value).sort().map(key=>[key,value[key]]);
const plots=(value:MultiChartCellState['scriptBindings'])=>value?.map(row=>[row.id,row.documentId,row.version,row.source,row.pane,row.paneId??null,row.ownScale??false,Object.keys(row.plots).sort().map(id=>[id,row.plots[id].kind])]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))??[];
/** Main-series basis: session, chart type and price source. A change here re-bases the price pane. */
function baseShape(cell:MultiChartCellState){return JSON.stringify([cell.session??null,cell.style,cell.chartOptions.source]);}
/** Study owners (built indicators and scripts). Their calculation changes rebuild the saved frame's owner list, but in the
 * reference an added, removed or edited study never resets the main pane's manual price range. */
function studyShape(cell:MultiChartCellState){return JSON.stringify([
 cell.indicators.map(row=>[row.id,row.kind,fields({...indicatorDefaults[row.kind],...row.inputs}),row.offset,row.paneId,Object.keys(row.plots).sort().map(id=>[id,row.plots[id].kind])]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),
 plots(cell.scriptBindings)]);}
function comparisonShape(cell:MultiChartCellState){return JSON.stringify([cell.comparisons.map(row=>[row.id,row.datasetId,row.mode,row.baseline]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),
]);}
function sameSource(id:string,oldSources:readonly BarDataset[],newSources:readonly BarDataset[]){
 const before=oldSources.filter(row=>row.provenance.datasetId===id),after=newSources.filter(row=>row.provenance.datasetId===id);
 return before.length===1&&after.length===1&&sameChartSourceBasis(sourceContextForDataset(before[0]),sourceContextForDataset(after[0]),true);
}
/** Explicit navigation/calculation policy. History restores bypass this helper
 * and must prove the saved frame compatible instead of silently resetting it. */
export function resetIncompatibleFrame(before:MultiChartCellState,after:MultiChartCellState,oldSources:readonly BarDataset[],newSources:readonly BarDataset[]):MultiChartCellState{
 const rebased=before.datasetId!==after.datasetId||baseShape(before)!==baseShape(after)||comparisonShape(before)!==comparisonShape(after)||!sameSource(before.datasetId,oldSources,newSources)||before.comparisons.some(row=>!sameSource(row.datasetId,oldSources,newSources));
 if(!rebased&&studyShape(before)===studyShape(after))return after;
 const toAuto=rebased||!supportsHistoricalFrame(after.style);if(!after.frame&&(!toAuto||after.chartOptions.auto))return after;
 const next={...after};delete next.frame;
 /* A study-only change keeps the manual price range (the live renderer keeps its pane ranges). The saved frame
  * cannot be proven for the new owners, so it is dropped here and recaptured from the live chart by the grid
  * (`carriedFrameCell`), which keeps auto off meanwhile. Every other change still returns the scale to auto. */
 if(toAuto)next.chartOptions={...after.chartOptions,auto:true};
 return next;
}
/** A cell whose manual price range was carried across a study change and still waits for its recaptured frame. */
export function carriedFrameCell(cell:MultiChartCellState):boolean{return !cell.frame&&cell.chartOptions.auto===false&&supportsHistoricalFrame(cell.style);}
