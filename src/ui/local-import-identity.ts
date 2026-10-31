import {createIdentifiedLocalCandleDataset} from '../domain/local-candle-origin';
import type {BarDataset} from '../domain/types';

/** Each accepted import is a new source, including a second file for the same ticker and interval.
 * Kept in its own small module so ImportDialog does not pull the workspace grid (and MultiChartGrid) into its import graph. */
export function identifyLocalImport(dataset:BarDataset,id:string):BarDataset{
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Invalid local import identity.');
 return createIdentifiedLocalCandleDataset(dataset,id);
}
