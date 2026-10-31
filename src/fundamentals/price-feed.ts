import type {Bar,Instrument,DataProvenance} from '../domain/types';
import type {PriceInput} from './price-ratios';
import type {PriceOverlayBar} from './graph';
/** Adapts the loaded chart dataset for the Fundamentals dialog. Live datasets and empty datasets give null
 * (ratios stay "not available"); the currency is only ever the dataset's own stated currency. No React hook:
 * the overlay array is cached per bars-array identity so the graph does not rebuild on every App render. */
interface DatasetLike {bars:readonly Bar[];instrument:Pick<Instrument,'symbol'|'currency'>;provenance:Pick<DataProvenance,'datasetId'|'fixture'|'providerName'>}
const isoDay=(seconds:number)=>new Date(seconds*1000).toISOString().slice(0,10);
const isLive=(d:DatasetLike)=>d.provenance.datasetId.startsWith('live:');
export function lastCloseFor(d:DatasetLike):PriceInput|null{
 const last=d.bars[d.bars.length-1];if(!last||isLive(d)||!Number.isFinite(last.close)||!Number.isFinite(last.time))return null;
 return {close:last.close,date:isoDay(last.time),currency:d.instrument.currency||null,symbol:d.instrument.symbol,source:d.provenance.fixture?'SYNTHETIC DEMO dataset':d.provenance.providerName};
}
const overlays=new WeakMap<readonly Bar[],PriceOverlayBar[]>();
export function priceBarsFor(d:DatasetLike):PriceOverlayBar[]|null{
 if(!d.bars.length||isLive(d))return null;
 let found=overlays.get(d.bars);if(!found){found=d.bars.map(b=>({date:isoDay(b.time),close:b.close}));overlays.set(d.bars,found);}return found;
}
