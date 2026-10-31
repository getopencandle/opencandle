import type {BarDataset} from '../domain/types';
/** A symbol/resolution label is not an instruction to choose the first provider. */
export function uniqueSuppliedDataset(datasets:readonly BarDataset[],symbol:string,resolution:string,identity?:{instrumentId:string;fixture:boolean}){
 const candidates=datasets.filter(row=>row.instrument.symbol===symbol&&row.resolution===resolution&&(!identity||row.instrument.id===identity.instrumentId&&row.provenance.fixture===identity.fixture));
 if(!candidates.length)throw new Error(`No supplied ${resolution} history for ${symbol}. Charts were unchanged.`);
 if(candidates.length!==1)throw new Error(`Multiple supplied sources match ${symbol} at ${resolution}. Select an explicit source; no provider is chosen automatically.`);
 return candidates[0];
}
