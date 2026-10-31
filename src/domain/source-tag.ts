import type {BarDataset} from './types';
import {ALPACA_SIP_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID} from './alpaca-live';
import {isFredDatasetId,isLiveDatasetId,isLiveProviderId} from './live-provider';
import {FRED_PROVIDER_ID} from './fred';
import {SYMBOL_MATH_PROVIDER_ID,isSymbolMathDatasetId} from './symbol-math-live';

/**
 * The one short source tag used by the chart surfaces that name a source in a few words
 * (grid strip source picker, image export footer, import selectors). It matches the chart heading
 * (ui/chart-heading-label.ts):
 * - A derived (symbol math) feed is DERIVED, or SYNTHETIC DERIVED when computed from the keyless stub. It is never
 *   LOCAL IMPORT or a fixture.
 * - A synthetic fixture or the keyless Alpaca stub is SYNTHETIC.
 * - Alpaca SIP history is DELAYED.
 * - A FRED economic series is FRED (it has no live feed, so never LIVE).
 * - Another live feed is LIVE.
 * - Anything else is LOCAL IMPORT.
 */
export type DatasetSourceTag='SYNTHETIC DERIVED'|'DERIVED'|'SYNTHETIC'|'DELAYED'|'FRED'|'LIVE'|'LOCAL IMPORT';
type TagInput={providerId?:string;providerName?:string;datasetId:string;fixture:boolean};

const providerOf=(input:TagInput):string=>{
 if(typeof input.providerId==='string')return input.providerId;
 const id=input.datasetId;if(typeof id!=='string')return '';
 if(id.startsWith('live:'))return id.split(':')[1]??'';
 return id.split(':')[0]??'';
};
const syntheticName=(name:unknown)=>typeof name==='string'&&/^SYNTHETIC/.test(name);
export const isDerivedSource=(input:TagInput)=>isSymbolMathDatasetId(input.datasetId)&&(input.providerId===undefined||input.providerId===SYMBOL_MATH_PROVIDER_ID);

export function sourceTagOf(input:TagInput):DatasetSourceTag{
 const synthetic=input.fixture===true||syntheticName(input.providerName);
 if(isDerivedSource(input))return synthetic?'SYNTHETIC DERIVED':'DERIVED';
 const providerId=providerOf(input);
 if(synthetic||providerId===ALPACA_STUB_PROVIDER_ID)return 'SYNTHETIC';
 if(providerId===ALPACA_SIP_PROVIDER_ID)return 'DELAYED';
 if(providerId===FRED_PROVIDER_ID||isFredDatasetId(input.datasetId))return 'FRED';
 if(isLiveDatasetId(input.datasetId)||isLiveProviderId(providerId))return 'LIVE';
 return 'LOCAL IMPORT';
}
/** The tag of a dataset (its provenance). */
export function datasetSourceTag(dataset:Pick<BarDataset,'provenance'>):DatasetSourceTag{return sourceTagOf(dataset.provenance);}
/** The tag of a chart source context ({datasetId, fixture, label}), as the image export footer has it. */
export function sourceContextTag(source:{datasetId:string;fixture:boolean;label:string}):DatasetSourceTag{return sourceTagOf({datasetId:source.datasetId,fixture:source.fixture,providerName:source.label});}
/** The synthetic suffix of a list row. A derived feed computed from the stub is " · SYNTHETIC DERIVED" (never a demo or
 * fixture), a real derived feed has none, and every other dataset keeps the caller's own suffix for fixture data. */
export function syntheticSuffix(provenance:BarDataset['provenance'],fixtureSuffix:string):string{
 if(isDerivedSource(provenance))return sourceTagOf(provenance)==='SYNTHETIC DERIVED'?' · SYNTHETIC DERIVED':'';
 return provenance.fixture?fixtureSuffix:'';
}
/** The basis words of a source in a confirmation. A derived feed gives its own coverage (never "synthetic fixture"). */
export function sourceCoverageNote(provenance:BarDataset['provenance']):string{
 if(isDerivedSource(provenance))return provenance.coverage;
 return provenance.fixture?'synthetic fixture':provenance.coverage;
}
