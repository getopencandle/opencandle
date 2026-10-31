import {newYorkClock,newYorkWallTime,NYSE_CALENDAR_YEARS,usSessionDay} from './us-market-hours';
import type {SeasonalitySourcePoint} from './indicators-ext/seasonality-months';

/** Pure transport/number planning only. Nothing exported here creates provider,
 * source, native, completion or publication membership. The actual Alpaca entry
 * constructor is the sole issuer/consumer of its separate private window key. */
export interface SeasonalityDailyHistoryPlan {
 readonly requestedStartYear:number;readonly requestedEndYear:number;
 readonly calendarStartYear:number;readonly calendarEndYear:number;
 readonly requestedFrom:number;readonly coveredRequestFrom:number;
 readonly requestedThrough:number;readonly closedThrough:number;
 readonly dailyRowUpperBound:number;readonly historyFloor:number;
 readonly transportNumericSlots:number;readonly notices:readonly string[];
}
export const SEASONALITY_DAILY_HISTORY_LIMITS=Object.freeze({pages:3,pageRows:10000,rows:100000,transportNumericSlots:100000});
const unavailable=(reason:string)=>Error('Seasonality daily history is unavailable: '+reason);
function own(value:unknown,key:PropertyKey):unknown{
 if(!value||typeof value!=='object')throw unavailable('plain own data is required.');
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 if(!descriptor||!Object.hasOwn(descriptor,'value'))throw unavailable('plain own data is required.');
 return descriptor.value;
}
function integer(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value);}
function nextDate(date:string):string{return new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);}

/** Actual provider selects its own observed sent/echo cutoff, never Date.now in
 * this helper. Keeping a1900 request does not pretend pre2015 bridge history or
 * calendar certification. The full requested table remains a downstream choice;
 * only certified returned months may enter numerical pools. */
export function planSeasonalityDailyHistory(startYear:number,endYear:number,observedThrough:number):Readonly<SeasonalityDailyHistoryPlan>{
 if(!integer(startYear)||!integer(endYear)||startYear<1900||endYear>9999||startYear>endYear||!integer(observedThrough))throw unavailable('the requested years or observed cutoff are invalid.');
 const date=newYorkClock(observedThrough).date,year=Number(date.slice(0,4));
 if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last)throw unavailable('the current NYSE calendar year is not certified.');
 const historyFloor=newYorkWallTime('2015-01-01',0),requestedFrom=newYorkWallTime(String(startYear-1).padStart(4,'0')+'-12-01',0);
 const requestedEnd=endYear>=year?observedThrough:newYorkWallTime(String(endYear+1).padStart(4,'0')+'-01-01',0),requestedThrough=Math.min(observedThrough,requestedEnd);
 const closedThrough=newYorkWallTime(newYorkClock(requestedThrough).date,0),coveredRequestFrom=Math.max(historyFloor,requestedFrom);
 if(requestedThrough<=coveredRequestFrom)throw unavailable('the request has no provider-supported observed window.');
 const dailyRowUpperBound=Math.ceil((requestedThrough-coveredRequestFrom)/86400)+3;
 if(!integer(dailyRowUpperBound)||dailyRowUpperBound<1||dailyRowUpperBound>100000)throw unavailable('the complete window exceeds its row bound.');
 const notices:string[]=[];
 if(startYear<2015)notices.push('Starting year '+startYear+' is retained. This provider bridge requests history from 2015; earlier requested cells have no qualified history. This is not an IPO date.');
 if(endYear>2028)notices.push('Requested years after 2028 remain saved; NYSE month geometry and numerical history outside the certified calendar are unavailable.');
 notices.push('Prices use provider-published New York daily bars. A day closes here only after an actual coherent response observes its entire New York day; this is not a regular-session price filter or exchange-finality claim.');
 return Object.freeze({requestedStartYear:startYear,requestedEndYear:endYear,calendarStartYear:Math.max(startYear,2015),calendarEndYear:Math.min(endYear,2028),requestedFrom,coveredRequestFrom,requestedThrough,closedThrough,dailyRowUpperBound,historyFloor,transportNumericSlots:100000,notices:Object.freeze(notices)});
}

/** Validate label/period BEFORE touching price fields. An historical server's
 * eventual current-day close cannot enter an earlier replay/current cutoff.
 * A separately genuine developing source is required for that day's values.
 * Caller invokes only for rows from its authenticated coherent actual response;
 * this pure function is intentionally incapable of authenticating those rows. */
export function closedPublishedSeasonalityPoint(row:unknown,coveredFrom:number,observedThrough:number):Readonly<SeasonalitySourcePoint>|null{
 if(!integer(coveredFrom)||!integer(observedThrough)||observedThrough<coveredFrom)throw unavailable('the observed response window is invalid.');
 const time=own(row,'time');if(!integer(time)||time<coveredFrom||time>observedThrough)throw unavailable('a daily label lies outside its actual response window.');
 const date=newYorkClock(time).date,year=Number(date.slice(0,4));
 if(year<NYSE_CALENDAR_YEARS.first||year>NYSE_CALENDAR_YEARS.last||newYorkWallTime(date,0)!==time)throw unavailable('the response does not use a certified exact New York day label.');
 const day=usSessionDay(date);if(day.weekend||day.holiday)throw unavailable('the response contains a nontrading date.');
 const availableAt=newYorkWallTime(nextDate(date),0);
 if(availableAt>observedThrough)return null;
 const close=own(row,'close');if(typeof close!=='number'||!Number.isFinite(close)||close<=0)throw unavailable('a closed daily price is invalid.');
 return Object.freeze({time,close,availableAt,finalized:true});
}

export interface SeasonalityDailySentRequest {
 readonly symbol:string;readonly feed:'iex'|'sip';readonly adjustment:'split'|'split,dividend';
 readonly start:number;readonly end:number;readonly pageToken?:string;
}
export interface SeasonalityDailyEcho {
 readonly from:number;readonly through:number;readonly rows:number;readonly nextPageToken:string|null;
}

/** Fixed-size inspection BEFORE any page-row iteration/output allocation.
 * Matching descriptive response fields/URL is necessary for coherent paging,
 * but does NOT create actual-entry authority: only the provider's private
 * constructor request/response state may publish an authenticated window.
 * The fixed100000-slot response envelope must ALREADY be charged by that owner.
 * No callback, supplied budget or source registrar is accepted here. */
export function inspectSeasonalityDailyEcho(value:unknown,sent:Readonly<SeasonalityDailySentRequest>):Readonly<SeasonalityDailyEcho>{
 const symbol=sent.symbol,feed=sent.feed,adjustment=sent.adjustment,start=sent.start,end=sent.end,pageToken=sent.pageToken;
 if(typeof symbol!=='string'||symbol.length<1||symbol.length>32||!['iex','sip'].includes(feed)||!['split','split,dividend'].includes(adjustment)||!integer(start)||!integer(end)||end<=start||pageToken!==undefined&&(typeof pageToken!=='string'||!pageToken||pageToken.length>2048))throw unavailable('the actual sent daily request is unsupported.');
 if(own(value,'schemaVersion')!==1||own(value,'symbol')!==symbol||own(value,'timeframe')!=='1Day'||own(value,'seconds')!==86400||own(value,'feed')!==feed)throw unavailable('daily response identity disagrees with the actual request.');
 const rows=own(value,'bars');if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype)throw unavailable('a daily response page requires an ordinary array.');
 const length=Object.getOwnPropertyDescriptor(rows,'length')?.value;
 if(!integer(length)||length<0||length>10000)throw unavailable('a daily response page exceeds its admitted row bound.');
 const provenance=own(value,'provenance'),sourceUrl=own(provenance,'sourceUrl');
 if(own(provenance,'feed')!==feed||typeof sourceUrl!=='string'||sourceUrl.length>8192)throw unavailable('daily response source fields are incomplete.');
 const url=new URL(sourceUrl),query=url.searchParams;
 if(url.origin!=='https://data.alpaca.markets'||url.username||url.password||url.hash||url.pathname!=='/v2/stocks/'+encodeURIComponent(symbol)+'/bars')throw unavailable('the response did not echo the daily request endpoint.');
 if(query.getAll('timeframe').length!==1||query.get('timeframe')!=='1Day'||query.getAll('feed').length!==1||query.get('feed')!==feed||query.getAll('adjustment').length!==1||query.get('adjustment')!==adjustment||query.getAll('start').length!==1||query.getAll('end').length!==1||query.getAll('page_token').length!==(pageToken===undefined?0:1)||pageToken!==undefined&&query.get('page_token')!==pageToken)throw unavailable('the response echoed a different daily request.');
 const echoedFrom=Date.parse(query.get('start')!)/1000,echoedThrough=Date.parse(query.get('end')!)/1000;
 if(!integer(echoedFrom)||!integer(echoedThrough)||echoedFrom<start||echoedThrough>end||echoedThrough<=echoedFrom)throw unavailable('the response echoed an incoherent daily time window.');
 const next=own(value,'nextPageToken');if(next!==null&&(typeof next!=='string'||!next||next.length>2048||next===pageToken))throw unavailable('daily pagination did not advance.');
 return Object.freeze({from:Math.max(start,echoedFrom),through:Math.min(end,echoedThrough),rows:length,nextPageToken:next as string|null});
}

/** One admitted page -> immutable CLOSED close-only facts. This function neither
 * promotes a page-prefix nor merges it into an authenticated provider cache.
 * The private service must complete all<=3 coherent pages before publication,
 * detect repeated tokens/window mismatch and keep old+pending ownership paid.
 * Source values on unclosed days are not read, even for numerical validation. */
export function closedSeasonalityDailyPage(value:unknown,echo:Readonly<SeasonalityDailyEcho>,rowUpperBound:number):readonly Readonly<SeasonalitySourcePoint>[] {
 if(!integer(rowUpperBound)||rowUpperBound<1||rowUpperBound>100000||!integer(echo.rows)||echo.rows<0||echo.rows>Math.min(10000,rowUpperBound))throw unavailable('the response exceeds the admitted complete-window bound.');
 const rows=own(value,'bars');if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||Object.getOwnPropertyDescriptor(rows,'length')?.value!==echo.rows)throw unavailable('the daily page changed after response inspection.');
 const points:Readonly<SeasonalitySourcePoint>[]=[];let previous=-Infinity;
 for(let index=0;index<echo.rows;index++){
  const row=own(rows,String(index)),time=own(row,'time');if(!integer(time)||time<=previous)throw unavailable('daily page labels must strictly increase.');previous=time;
  const point=closedPublishedSeasonalityPoint(row,echo.from,echo.through);if(point)points.push(point);
 }
 return Object.freeze(points);
}
