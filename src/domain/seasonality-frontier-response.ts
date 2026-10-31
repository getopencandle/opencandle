import type {SeasonalityFrontierPage} from './seasonality-intraday-frontier';

export interface SeasonalityFrontierSentRequest {
 readonly symbol:string;readonly timeframe:'1Min'|'5Min'|'15Min';
 readonly feed:'iex'|'sip';readonly adjustment:'split'|'split,dividend';
 readonly start:number;readonly end:number;readonly pageToken?:string;
}
/** Prepaid BEFORE inspection/URL construction. This includes bounded URL/query/
 * token scratch; it is not borrowed from a response-envelope spare allowance.
 * Keep this whole fixed reservation with each returned page until its wrapper
 * and inspection stack retire; no credit while they remain owned. Each original
 * retained response/rows graph separately needs its own100000U envelope. */
export const SEASONALITY_FRONTIER_RESPONSE_COST=Object.freeze({operations:65536,numericSlots:65536});
const unavailable=(reason:string)=>Error('The actual Seasonality frontier response is unavailable: '+reason);
function own(value:unknown,key:PropertyKey,optional=false):unknown{
 if(!value||typeof value!=='object')throw unavailable('own response data is required.');
 const field=Object.getOwnPropertyDescriptor(value,key);if(!field&&optional)return undefined;
 if(!field||!Object.hasOwn(field,'value'))throw unavailable('own response data is required.');return field.value;
}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value);
const secondsOf=(value:unknown):number|null=>value==='1Min'?60:value==='5Min'?300:value==='15Min'?900:null;

/** Fixed header inspection ONLY; no row, time, OHLC or volume access. This pure
 * function does not authenticate a request/provider/source. The real private
 * constructor must own sent request, response, feed/basis/epoch and lifetime.
 * Returns the ORIGINAL rows alias, never a copy or a new source registration.
 * Only a full original request window may contribute an oldest-month prefix.
 * Subsequent cross-page cycles/order/folding are checked by the separate
 * time-only frontier helper, under its independently admitted work budget. */
export function inspectSeasonalityFrontierResponse(value:unknown,sent:Readonly<SeasonalityFrontierSentRequest>):Readonly<SeasonalityFrontierPage>{
 const symbol=own(sent,'symbol'),timeframe=own(sent,'timeframe'),seconds=secondsOf(timeframe),feed=own(sent,'feed'),adjustment=own(sent,'adjustment'),start=own(sent,'start'),end=own(sent,'end'),pageToken=own(sent,'pageToken',true);
 if(typeof symbol!=='string'||symbol.length<1||symbol.length>32||seconds===null||(feed!=='iex'&&feed!=='sip')||(adjustment!=='split'&&adjustment!=='split,dividend')||!integer(start)||!integer(end)||end<=start||pageToken!==undefined&&(typeof pageToken!=='string'||!pageToken||pageToken.length>2048))throw unavailable('the actual sent intraday request is unsupported.');
 if(own(value,'schemaVersion')!==1||own(value,'symbol')!==symbol||own(value,'timeframe')!==timeframe||own(value,'seconds')!==seconds||own(value,'feed')!==feed)throw unavailable('response identity differs from the actual request.');
 const rows=own(value,'bars');
 if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype)throw unavailable('an ordinary original response array is required.');
 const count=own(rows,'length');if(!integer(count)||count<0||count>10000)throw unavailable('the original response exceeds its admitted row bound.');
 const provenance=own(value,'provenance'),sourceUrl=own(provenance,'sourceUrl');
 if(own(provenance,'feed')!==feed||typeof sourceUrl!=='string'||sourceUrl.length>8192||/[^\x21-\x7e]/.test(sourceUrl))throw unavailable('the canonical request echo is unavailable.');
 const url=new URL(sourceUrl);
 // Canonical ASCII href bounds native URL normalization scratch as well as
 // avoiding an alternate/unencoded request representation. Actual bridge
 // provenance is emitted by URL.href; it has this canonical representation.
 if(url.origin!=='https://data.alpaca.markets'||url.username||url.password||url.hash||url.pathname!=='/v2/stocks/'+encodeURIComponent(symbol)+'/bars'||url.href!==sourceUrl)throw unavailable('the response echoed a foreign or noncanonical endpoint.');
 const query=url.searchParams;
 for(const name of ['timeframe','feed','adjustment','start','end'])if(query.getAll(name).length!==1)throw unavailable('the response query is duplicated or incomplete.');
 if(query.get('timeframe')!==timeframe||query.get('feed')!==feed||query.get('adjustment')!==adjustment||query.getAll('page_token').length!==(pageToken===undefined?0:1)||pageToken!==undefined&&query.get('page_token')!==pageToken)throw unavailable('the response query differs from the actual request.');
 const fromText=query.get('start')!,throughText=query.get('end')!,explicitZone=/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/;
 if(fromText.length>64||throughText.length>64||!explicitZone.test(fromText)||!explicitZone.test(throughText))throw unavailable('the response time bounds need explicit instants.');
 const echoedFrom=Date.parse(fromText)/1000,echoedThrough=Date.parse(throughText)/1000;
 if(!integer(echoedFrom)||!integer(echoedThrough)||echoedFrom<start||echoedThrough>end||echoedThrough<=echoedFrom)throw unavailable('the response time bounds disagree with the sent request.');
 const from=Math.max(start,echoedFrom),through=Math.min(end,echoedThrough);
 if(from!==start||through!==end)throw unavailable('an incomplete request span cannot prove the original month frontier.');
 const next=own(value,'nextPageToken');
 if(next!==null&&(typeof next!=='string'||!next||next.length>2048||next===pageToken))throw unavailable('pagination did not advance.');
 return Object.freeze({from,through,requestPageToken:pageToken===undefined?null:pageToken as string,nextPageToken:next as string|null,rows});
}
