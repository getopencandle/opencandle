import type {Bar,BarDataset} from '../domain/types';
import type {ReplaySession} from '../domain/replay-session';
import type {MultiChartState} from './MultiChartGrid';
import {cellSessionDataset,cellSessionDormant,cellSessionRefusal,rawCellSessionDataset,sameCellSessionFeedBasis,type CellSession} from '../chart/cell-session';
import {replayLayoutFrames,replayLayoutTimeline} from '../domain/replay-layout';

/** Actual finer history of this chart's provider and price basis, viewed in this chart's session. */
export function cellReplaySources(chart:BarDataset,cell:CellSession,datasets:readonly BarDataset[]):BarDataset[]{
 if(cell.session===undefined||cellSessionDormant(chart))return [...datasets];
 const raw=rawCellSessionDataset(chart);
 return datasets.map(rawCellSessionDataset).filter(row=>sameCellSessionFeedBasis(row,raw)&&cellSessionRefusal(row,cell.session)===null).map(row=>cellSessionDataset(row,cell));
}
function sourcesFor(grid:MultiChartState|undefined,cellId:string,datasets:readonly BarDataset[]):BarDataset[]{
 const cell=grid?.cells[cellId];if(!cell?.session)return [...datasets];
 const metadata=grid!.layout.cells.find(row=>row.id===cellId),matches=datasets.filter(row=>row.provenance.datasetId===cell.datasetId&&row.instrument.symbol===metadata?.symbol&&row.resolution===metadata?.interval);
 if(matches.length!==1)throw Error('The exact replay chart source is missing or ambiguous.');
 return cellReplaySources(matches[0],cell,datasets);
}
/** Participant views are separate even when two cells share one raw feed and use different trading sessions. */
export function cellReplayLayoutFrames(session:ReplaySession|null,grid:MultiChartState|undefined,datasets:readonly BarDataset[]):Record<string,Bar[]>{
 if(!session)return {};
 return Object.assign({},...session.participants.map(row=>replayLayoutFrames({...session,participants:[row]},sourcesFor(grid,row.cellId,datasets))));
}
export function cellReplayLayoutTimeline(session:ReplaySession,grid:MultiChartState|undefined,datasets:readonly BarDataset[]):number[]{
 return [...new Set(session.participants.flatMap(row=>replayLayoutTimeline({...session,participants:[row]},sourcesFor(grid,row.cellId,datasets))))].sort((a,b)=>a-b);
}
