import type {Bar,BarDataset} from '../domain/types';
import type {ReplayState} from '../domain/replay';
import type {GridPreparedInput,MultiChartState} from './MultiChartGrid';
import {cellSessionDataset} from '../chart/cell-session';
import {sameChartSourceBasis,sourceContextForDataset} from '../chart/source-context';

/** Preserve the exact arrays already accepted by native chart transactions.
 * Equal prices or timestamp ranges do not prove ownership of an input. */
export function validatePreparedGridInput(grid:MultiChartState,prepared:GridPreparedInput,current:{datasets:BarDataset[];dataset:BarDataset;bars:Bar[];replay:ReplayState|null}){
 if(prepared.nextDatasets!==current.datasets)throw new Error('The prepared chart universe changed before publication.');
 const id=grid.layout.activeCellId,metadata=grid.layout.cells.find(row=>row.id===id),settings=grid.cells[id];
 if(!metadata||!settings||prepared.activeCellId!==id||prepared.activeDatasetId!==settings.datasetId||prepared.activeResolution!==metadata.interval)throw new Error('Prepared active chart identity does not match its proposed layout.');
 const matches=prepared.nextDatasets.filter(row=>row.provenance.datasetId===prepared.activeDatasetId&&row.resolution===prepared.activeResolution&&row.instrument.symbol===metadata.symbol);
 if(matches.length!==1)throw new Error('Prepared active chart data is missing or ambiguous.');
 const dataset=cellSessionDataset(matches[0],settings),sameBasis=sameChartSourceBasis(sourceContextForDataset(dataset),sourceContextForDataset(current.dataset),true);
 let replay:ReplayState|null=null;
 if(prepared.nextActiveExecutionIdentity==='ordinary'){
  if(prepared.nextActiveBars!==dataset.bars&&(current.replay!==null||prepared.nextActiveBars!==current.bars||!sameBasis))throw new Error('Prepared ordinary history is not the accepted full input.');
 }else{
  if(!current.replay||prepared.nextActiveExecutionIdentity!==current.replay.runId||prepared.nextActiveBars!==current.bars||!sameBasis)throw new Error('Prepared replay input no longer belongs to the current simulation.');
  replay=current.replay;
 }
 return{dataset,datasets:prepared.nextDatasets,bars:prepared.nextActiveBars,replay};
}
