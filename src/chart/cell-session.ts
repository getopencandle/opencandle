import {linkLiveSessionSource,liveSessionSourceCurrent} from '../domain/live-session-source';
import {parseInterval} from '../domain/intervals';
import type {Bar,BarDataset} from '../domain/types';
import {barInputIdentity,liveLineageOf,stampLiveLineage} from './bar-input-identity';
import {rawSessionDataset,regularSessionBars,RTH_LINEAGE_SUFFIX,sessionsApply,type SessionMode} from './session-zones';

/** Missing means the legacy workspace session setting. An explicit choice belongs to one chart. */
export interface CellSession {session?:SessionMode}
const originals=new WeakMap<BarDataset,BarDataset>();
const views=new WeakMap<BarDataset,Map<SessionMode,{input:string;view:BarDataset}>>();
export function cellSessionOverride(dataset:BarDataset):SessionMode|undefined{return originals.has(dataset)?dataset.provenance.session as SessionMode:undefined;}
export function rawCellSessionDataset(dataset:BarDataset):BarDataset{return rawSessionDataset(originals.get(dataset)??dataset);}
/** Interval subscriptions may differ in dataset id, resolution and revision; instrument units and feed basis may not. */
export function sameCellSessionFeedBasis(left:BarDataset,right:BarDataset):boolean{
 const a=rawCellSessionDataset(left),b=rawCellSessionDataset(right);
 return (['id','symbol','name','exchange','currency','assetClass','timezone','tickSize','lotSize'] as const).every(key=>a.instrument[key]===b.instrument[key])&&(['providerId','providerName','fixture','adjustment','timezone','coverage'] as const).every(key=>a.provenance[key]===b.provenance[key]);
}
export function validateCellSession(value:unknown):asserts value is SessionMode|undefined{
 if(value!==undefined&&value!=='regular'&&value!=='extended')throw Error('Invalid chart trading session.');
}
/** Explicit overrides refuse unsupported source bases instead of guessing which trades a provider supplies. */
export function cellSessionRefusal(dataset:BarDataset,session:SessionMode|undefined):string|null{
 validateCellSession(session);if(session===undefined)return null;
 const raw=rawCellSessionDataset(dataset),p=raw.provenance;let interval=0;try{const spec=parseInterval(raw.resolution);if(spec.kind==='time')interval=(spec.seconds??0)*1000;}catch{/* Unsupported intervals are refused, never measured into another source basis. */}
 if(!sessionsApply(raw.instrument.assetClass,raw.instrument.timezone,interval))return 'Chart trading sessions require an intraday US equity source in New York time.';
 // These existing feeds expose loaded raw intraday trades; the view never claims consolidated coverage or fetches data.
 const knownAlpacaRaw=['alpaca-iex','alpaca-sip-delayed','alpaca-stub'].includes(p.providerId);
 if(!['regular','extended','all'].includes(p.session)&&!(p.session==='unknown'&&knownAlpacaRaw))return 'This source does not declare which trading sessions it supplies. Choose Workspace setting to keep its original data.';
 if(session==='extended'&&p.session==='regular')return 'This source supplies regular trading hours only. Extended hours are unavailable.';
 return null;
}
/** An explicit choice on a source without trading sessions (1D and longer, or not a New York US equity)
 * is dormant: the chart shows the source as supplied and the choice applies again once the chart is back on an intraday US
 * equity source. Before, 4h with Extended hours off refused 1D, 1W and 1M ("The live interval could not be opened."). */
export function cellSessionDormant(dataset:BarDataset):boolean{
 const raw=rawCellSessionDataset(dataset);let interval=0;try{const spec=parseInterval(raw.resolution);if(spec.kind==='time')interval=(spec.seconds??0)*1000;}catch{/* Unsupported intervals stay refused below. */return false;}
 return !sessionsApply(raw.instrument.assetClass,raw.instrument.timezone,interval);
}
/** A private immutable view preserves raw feed identity and synthetic status while declaring its exact session basis.
 * Unlike the legacy global filter, explicit Regular hours may be empty and never includes pre/post bars as a fallback. */
export function cellSessionDataset(dataset:BarDataset,cell:CellSession):BarDataset{
 validateCellSession(cell.session);if(cell.session===undefined||cellSessionDormant(dataset))return dataset;
 const raw=rawCellSessionDataset(dataset),refusal=cellSessionRefusal(raw,cell.session);if(refusal)throw Error(refusal);
 const input=barInputIdentity(raw.bars)+':'+(liveLineageOf(raw.bars)?.seq??'static');let cache=views.get(raw);const cached=cache?.get(cell.session);if(cached?.input===input&&liveSessionSourceCurrent(cached.view))return cached.view;
 const bars=cell.session==='regular'?regularSessionBars(raw.bars):raw.bars;
 const lineage=liveLineageOf(raw.bars);if(cell.session==='regular'&&lineage)stampLiveLineage(bars,lineage.key+RTH_LINEAGE_SUFFIX,lineage.seq);
 const view={...raw,bars,provenance:{...raw.provenance,session:cell.session}};originals.set(view,raw);linkLiveSessionSource(view,raw);
 if(!cache){cache=new Map();views.set(raw,cache);}cache.set(cell.session,{input,view});return view;
}
/** Filter a freshly streamed raw snapshot using the same per-chart rule without touching another chart's arrays. */
export function cellSessionBars(dataset:BarDataset,bars:Bar[],cell:CellSession):Bar[]{
 if(cell.session===undefined||bars===dataset.bars&&cellSessionOverride(dataset)===cell.session)return bars;
 const raw=rawCellSessionDataset(dataset);return cellSessionDataset(bars===raw.bars?raw:{...raw,bars},cell).bars;
}
