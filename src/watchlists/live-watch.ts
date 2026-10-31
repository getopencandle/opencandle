import type {BarDataset} from '../domain/types';
import {ALPACA_IEX_PROVIDER_ID,ALPACA_MAX_SYMBOLS,ALPACA_SYMBOL,alpacaDatasetId} from '../domain/alpaca-live';
import {COINBASE_PRODUCTS,coinbaseDatasetId} from '../domain/coinbase-live';
import type {ListAlert} from '../domain/watchlist-alerts';
import {activeWatchList,marketKey,restoreWatchBook,watchMemberKey,type WatchBook,type WatchReference,type WatchRow} from './model';
import {watchListById} from './membership';
import {parseSymbolMath,symbolMathComponentSource} from '../domain/symbol-math';
import {SYMBOL_MATH_PROVIDER_ID,SYMBOL_MATH_EXCHANGE,isSymbolMathDatasetId,symbolMathDatasetId} from '../domain/symbol-math-live';

/**
 * Live quotes for watchlist rows that no chart streams. A row bound to a live feed
 * (`live:<provider>:<symbol>:<interval>`) gets that feed opened in the background, plus the same symbol's live daily feed as
 * its daily companion, so Last, Chg and Chg% move with the stream. Alpaca streams at most 30 symbols per account, shared in
 * this order: open charts, then alerts and paper orders, then list-alert members, then the active watchlist in
 * row order. A watchlist symbol that does not fit is not streamed and its row says so. Pure: no feed is opened here.
 */
export type WatchFeedPriority='alert'|'watch';
export interface WatchFeed {datasetId:string;providerId:string;symbol:string;resolution:string;priority:WatchFeedPriority;/** The row's market key (EXCHANGE:SYMBOL). */marketKey:string}
export interface WatchRowNote {text:string;title:string}
export interface WatchFeedPlan {feeds:WatchFeed[];/** Alpaca symbols left unstreamed by the cap. */over:string[];/** Row notes by market key (EXCHANGE:SYMBOL). */notes:Map<string,WatchRowNote>}
export interface WatchFeedInput {
 book:WatchBook;listAlerts?:readonly ListAlert[];
 /** Alpaca symbols that charts, alerts and paper orders already stream: they come first and are shared, never displaced. */
 taken:ReadonlySet<string>;
 /** Live dataset ids an open chart already streams (their quotes come from the chart feed). */
 charted?:ReadonlySet<string>;
 max?:number;
}
export const WATCH_LIVE_DAILY='1D';
export const WATCH_OVER_CAP_TEXT='NO LIVE';
export const watchOverCapTitle=(max:number)=>`Not streaming: live stock data streams at most ${max} symbols at once (the Alpaca limit). Charts come first, then alerts and paper orders, then the watchlist. Close a chart or remove a symbol to free a slot.`;
const LIVE_ID=/^live:([a-z0-9-]+):([^:]+):([^:]+)$/;
export function parseWatchLiveId(datasetId:string|null|undefined):{providerId:string;symbol:string;resolution:string}|null{const match=typeof datasetId==='string'?LIVE_ID.exec(datasetId):null;return match?{providerId:match[1],symbol:match[2],resolution:match[3]}:null;}
/** The live daily feed id of a live row's symbol (null for non-live rows and rows already on daily bars). */
export function liveDailyCompanionId(datasetId:string|null|undefined):string|null{const live=parseWatchLiveId(datasetId);return live&&live.resolution!==WATCH_LIVE_DAILY?`live:${live.providerId}:${live.symbol}:${WATCH_LIVE_DAILY}`:null;}

function liveReferences(book:WatchBook,listAlerts:readonly ListAlert[]):Array<{reference:WatchReference;priority:WatchFeedPriority}>{
 const out:Array<{reference:WatchReference;priority:WatchFeedPriority}>=[];
 for(const alert of listAlerts){if(alert.status!=='active')continue;let rows;try{rows=watchListById(book,alert.listId).rows;}catch{continue;}for(const row of rows)if(row.kind==='symbol')out.push({reference:row.reference,priority:'alert'});}
 for(const row of activeWatchList(book).rows)if(row.kind==='symbol')out.push({reference:row.reference,priority:'watch'});
 // A derived row streams whatever its flag says; the flag follows its feed (adoptDerivedWatchLabels).
 return out.filter(entry=>(!entry.reference.synthetic||isDerivedWatchReference(entry.reference))&&parseWatchLiveId(entry.reference.datasetId)!==null);
}
export function planWatchFeeds(input:WatchFeedInput):WatchFeedPlan{
 const max=input.max??ALPACA_MAX_SYMBOLS,used=new Set(input.taken),feeds=new Map<string,WatchFeed>(),over:string[]=[],notes=new Map<string,WatchRowNote>(),refused=new Set<string>();
 for(const {reference,priority} of liveReferences(input.book,input.listAlerts??[])){
  const live=parseWatchLiveId(reference.datasetId)!,alpaca=live.providerId===ALPACA_IEX_PROVIDER_ID;
  if(alpaca&&!used.has(live.symbol)){
   if(refused.has(live.symbol)||used.size>=max){if(!refused.has(live.symbol)){refused.add(live.symbol);over.push(live.symbol);}notes.set(marketKey(reference),{text:WATCH_OVER_CAP_TEXT,title:watchOverCapTitle(max)});continue;}
   used.add(live.symbol);
  }
  // A derived row streams its components; each new Alpaca-shaped component counts toward the limit.
  if(live.providerId===SYMBOL_MATH_PROVIDER_ID){
   const parsed=parseSymbolMath(live.symbol),added=parsed.ok?parsed.expression.symbols.filter(symbol=>symbolMathComponentSource(symbol)==='alpaca-or-import'&&!used.has(symbol)):[];
   if(!parsed.ok||used.size+added.length>max){notes.set(marketKey(reference),{text:WATCH_OVER_CAP_TEXT,title:watchOverCapTitle(max)});continue;}
   for(const symbol of added)used.add(symbol);
  }
  for(const datasetId of [reference.datasetId!,...reference.dailyDatasetId===null?[liveDailyCompanionId(reference.datasetId)].filter((id):id is string=>id!==null):[]]){
   if(input.charted?.has(datasetId))continue;
   const known=feeds.get(datasetId),row=parseWatchLiveId(datasetId)!;
   if(known){if(priority==='alert')known.priority='alert';continue;}
   feeds.set(datasetId,{datasetId,providerId:row.providerId,symbol:row.symbol,resolution:row.resolution,priority,marketKey:marketKey(reference)});
  }
 }
 // A symbol that both a list alert and the watchlist name streams at the alert's priority (every feed of that symbol).
 const alerted=new Set([...feeds.values()].filter(feed=>feed.priority==='alert').map(feed=>feed.providerId+':'+feed.symbol));
 for(const feed of feeds.values())if(alerted.has(feed.providerId+':'+feed.symbol))feed.priority='alert';
 return{feeds:[...feeds.values()],over,notes};
}
/** Datasets the watchlist quotes read: each live source at its newest snapshot (charts' throttled state, then background
 * feeds), plus the background feeds no chart holds. Non-live rows pass through unchanged. */
export function watchQuoteDatasets(universe:readonly BarDataset[],latest:Readonly<Record<string,BarDataset>>,background:readonly BarDataset[]):BarDataset[]{
 const byId=new Map(background.map(row=>[row.provenance.datasetId,row] as const)),seen=new Set<string>();
 const out=universe.map(row=>{const id=row.provenance.datasetId;seen.add(id);return latest[id]??byId.get(id)??row;});
 for(const row of background)if(!seen.has(row.provenance.datasetId)){seen.add(row.provenance.datasetId);out.push(row);}
 return out;
}

/** A watch row on a derived (symbol math) feed. */
export const isDerivedWatchReference=(reference:WatchReference)=>reference.exchange===SYMBOL_MATH_EXCHANGE&&isSymbolMathDatasetId(reference.datasetId);
/** A derived row adopts its feed's synthetic labelling. A typed derived row is saved as non-synthetic,
 * but on the keyless Alpaca stub (or with a synthetic component) the derived feed is SYNTHETIC, so the exact source match failed
 * and the row showed no quote. When exactly one loaded dataset is the row's derived feed (same dataset id, symbol and exchange)
 * and its `fixture` flag differs, the row (in every list and in the flags) takes the feed's flag, so it quotes and the SYNTHETIC
 * label shows; a later real feed turns it back. Non-derived rows are never changed. Returns the same book when nothing changes. */
export function adoptDerivedWatchLabels(book:WatchBook,datasets:readonly BarDataset[]):WatchBook{
 const flagOf=(reference:WatchReference):boolean|null=>{
  if(!isDerivedWatchReference(reference))return null;
  const matches=datasets.filter(row=>row.provenance.datasetId===reference.datasetId&&row.instrument.symbol===reference.symbol&&row.instrument.exchange===reference.exchange);
  return matches.length===1&&matches[0].provenance.fixture!==reference.synthetic?matches[0].provenance.fixture:null;
 };
 let changed=false;
 const adopt=(reference:WatchReference):WatchReference=>{const flag=flagOf(reference);if(flag===null)return reference;changed=true;return{...reference,synthetic:flag};};
 const lists=book.lists.map(list=>{let touched=false;const rows=list.rows.map(row=>{if(row.kind!=='symbol')return row;const reference=adopt(row.reference);if(reference===row.reference)return row;touched=true;return{...row,reference};});return touched?{...list,rows}:list;});
 const flags=book.flags.map(row=>{const reference=adopt(row.reference);return reference===row.reference?row:{...row,reference};});
 return changed?{...book,lists,flags}:book;
}
/** The watchlist row for typed symbol math (null when the text is not an expression). It follows the derived
 * daily feed, so Last, Chg and Chg% are computed from the derived series. */
export function derivedWatchReference(text:string):WatchReference|null{
 const parsed=parseSymbolMath(String(text??'').trim().toUpperCase());if(!parsed.ok||parsed.expression.ast.kind==='sym')return null;
 const symbol=parsed.expression.canonical;return{symbol,exchange:'DERIVED',datasetId:symbolMathDatasetId(symbol,WATCH_LIVE_DAILY),dailyDatasetId:null,synthetic:false};
}

/* ---- Watchlist rows on the built-in demo source follow the user's real data. ---- */
/** The Coinbase product a demo ticker names (BTC and BTC-USD both name BTC-USD), or null when it is not a supported crypto. */
export function cryptoProductFor(symbol:string):string|null{
 const s=String(symbol??'').trim().toUpperCase(),product=s.includes('-')?s:s+'-USD';
 return (COINBASE_PRODUCTS as readonly string[]).includes(product)?product:null;
}
export interface LiveWatchSources {/** An Alpaca key is saved. */stocks:boolean;/** Coinbase live crypto data is switched on. */crypto:boolean}
/** The live reference a demo row moves to, or null when no live source is set up for it. Stocks use Alpaca, crypto uses Coinbase. */
export function liveWatchReferenceFor(reference:WatchReference,sources:LiveWatchSources):WatchReference|null{
 if(reference.exchange!=='SYNTHETIC'||!reference.synthetic)return null;
 const product=cryptoProductFor(reference.symbol);
 if(product)return sources.crypto?{symbol:product,exchange:'COINBASE',datasetId:coinbaseDatasetId(product,WATCH_LIVE_DAILY),dailyDatasetId:null,synthetic:false}:null;
 if(!sources.stocks||!ALPACA_SYMBOL.test(reference.symbol))return null;
 return{symbol:reference.symbol,exchange:'US',datasetId:alpacaDatasetId(reference.symbol,WATCH_LIVE_DAILY),dailyDatasetId:null,synthetic:false};
}
/** Rows (and flags) still on the built-in demo source move to the user's live source for that symbol, in place, when one is set up.
 * A row whose live twin is already in the same list is dropped instead of duplicated. Rows with no live source stay as they are
 * (the watchlist shows them with no price and a short note). Local notes on a moved demo market move with it.
 * Returns the same book when nothing changes. */
export function adoptLiveWatchSources(book:WatchBook,sources:LiveWatchSources):WatchBook{
 if(!sources.stocks&&!sources.crypto)return book;
 let changed=false;
 const lists=book.lists.map(list=>{
  const keys=new Set(list.rows.flatMap(row=>row.kind==='symbol'?[watchMemberKey(row.reference)]:[]));let touched=false;
  const rows=list.rows.flatMap((row):WatchRow[]=>{if(row.kind!=="symbol")return[row];const live=liveWatchReferenceFor(row.reference,sources);if(!live)return[row];touched=true;const key=watchMemberKey(live);if(keys.has(key))return[];keys.add(key);return[{...row,reference:live}];});
  return touched?{...list,rows}:list;
 });
 const flagKeys=new Set(book.flags.map(row=>marketKey(row.reference)));
 const flags=book.flags.flatMap(row=>{const live=liveWatchReferenceFor(row.reference,sources);if(!live)return[row];changed=true;const key=marketKey(live);if(flagKeys.has(key))return[];flagKeys.add(key);return[{...row,reference:live}];});
 if(lists.some((list,index)=>list!==book.lists[index]))changed=true;
 // Notes on a demo market follow the row to its live market, so they stay attached to the symbol.
 const notes=(book.notes??[]).map(note=>{if(!note.market)return note;const live=liveWatchReferenceFor({...note.market,datasetId:'x',dailyDatasetId:null},sources);if(!live)return note;changed=true;return{...note,market:{exchange:live.exchange,symbol:live.symbol,synthetic:false}};});
 return changed?restoreWatchBook({...book,lists,flags,...book.notes?{notes}:{}}):book;
}
/** The short note for a row with no live source (shown next to a dash). */
export function noLiveSourceNote(symbol:string):WatchRowNote{
 return cryptoProductFor(symbol)
  ?{text:'No data',title:'No live price yet. Turn on Crypto (Coinbase, free, no key) in Settings > Data sources.'}
  :{text:'No data',title:'No live price yet. Add a free Alpaca key in Settings > Data sources.'};
}
/** Where a symbol opens when the user picks it (watchlist click, Space stepping) and only the hidden-demo
 * placeholder is bound: the user's live source for it, or null when none is set up. `resolution` is tried first by the caller. */
export function liveOpenTargetFor(symbol:string,sources:LiveWatchSources):{providerId:string;symbol:string}|null{
 const live=liveWatchReferenceFor({symbol:String(symbol??'').trim().toUpperCase(),exchange:'SYNTHETIC',datasetId:'x',dailyDatasetId:null,synthetic:true},sources),parsed=live?parseWatchLiveId(live.datasetId):null;
 return parsed?{providerId:parsed.providerId,symbol:parsed.symbol}:null;
}
