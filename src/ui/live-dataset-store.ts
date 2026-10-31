import {cloneElement,isValidElement,useMemo,useSyncExternalStore,type ReactElement,type ReactNode} from 'react';
import type {BarDataset,Quote} from '../domain/types';
import {liveQuotes,liveQuoteFresh,liveQuoteSourceLabel,topOfBookDisplayQuote,LIVE_QUOTE_STALE_MS,type LiveQuote,type LiveQuoteStore} from '../domain/live-quotes';
import {watchQuoteDatasets,type WatchRowNote} from '../watchlists/live-watch';

/**
 * The throttled live datasets (about once a second per feed) and the background watch
 * feeds live here, outside App's React state. Components that show live values subscribe with useSyncExternalStore
 * (the watchlist, the list-alert dialog, the paper dock and the order ticket through the bindings below; chart cells keep
 * following the per-snapshot channel in live-registry). App writes the store and renders only when a change touches what
 * App itself draws from (see liveChangeNeedsAppRender), so toolbars, the rail, the dock and open dialogs no longer follow
 * every tick of every feed.
 *
 * Snapshots are immutable: every change replaces the record, so getSnapshot is a stable value between changes.
 */
export type LiveDatasetMap=Readonly<Record<string,BarDataset>>;
export interface WatchFeedState {datasets:readonly BarDataset[];notes:ReadonlyMap<string,WatchRowNote>}
export interface LiveDatasetStore {
 getSnapshot():LiveDatasetMap;
 getWatchFeeds():WatchFeedState;
 subscribe(listener:()=>void):()=>void;
 /** Applies an updater (same contract as a React state updater). Listeners hear one notification when the record changed. */
 update(updater:(prior:LiveDatasetMap)=>LiveDatasetMap):LiveDatasetMap;
 setWatchFeeds(next:WatchFeedState):void;
}
const NO_LIVE:LiveDatasetMap=Object.freeze({});
const NO_WATCH:WatchFeedState=Object.freeze({datasets:Object.freeze([]) as readonly BarDataset[],notes:new Map<string,WatchRowNote>()});
export function createLiveDatasetStore():LiveDatasetStore{
 let live=NO_LIVE,watch=NO_WATCH;const listeners=new Set<()=>void>();
 const notify=()=>{for(const listener of [...listeners])try{listener();}catch{/* a listener failure never stops the feed */}};
 return{
  getSnapshot:()=>live,
  getWatchFeeds:()=>watch,
  subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  update:updater=>{const next=updater(live);if(next===live)return live;live=next;notify();return live;},
  setWatchFeeds:next=>{if(next===watch)return;watch=next;notify();},
 };
}
/** True when App must render for this change: the set of live datasets changed, the active chart's source changed, or a
 * source's identity (state, revision, symbol, interval) changed, which the heading, the universe and the grid read. Any
 * other change (a newer snapshot of a feed that is not the active chart's) reaches only the store's subscribers. */
export function liveChangeNeedsAppRender(prior:LiveDatasetMap,next:LiveDatasetMap,activeSourceId:string|null|undefined):boolean{
 if(prior===next)return false;
 const before=Object.keys(prior),after=Object.keys(next);
 if(before.length!==after.length||after.some(id=>!Object.hasOwn(prior,id)))return true;
 for(const id of after){const a=prior[id],b=next[id];if(a===b)continue;if(id===activeSourceId)return true;
  if(a.provenance.state!==b.provenance.state||a.provenance.revision!==b.provenance.revision||a.provenance.datasetId!==b.provenance.datasetId||a.instrument.symbol!==b.instrument.symbol||a.instrument.id!==b.instrument.id||a.resolution!==b.resolution)return true;}
 return false;
}
export function useLiveDatasets(store:LiveDatasetStore):LiveDatasetMap{return useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);}
export function useWatchFeeds(store:LiveDatasetStore):WatchFeedState{return useSyncExternalStore(store.subscribe,store.getWatchFeeds,store.getWatchFeeds);}
/** The watchlist's quote rows: each universe row replaced by its newest live snapshot, plus the background watch feeds. */
export function useWatchQuotes(store:LiveDatasetStore,universe:readonly BarDataset[]):{datasets:BarDataset[];notes:ReadonlyMap<string,WatchRowNote>}{
 const live=useLiveDatasets(store),watch=useWatchFeeds(store);
 return useMemo(()=>({datasets:watchQuoteDatasets(universe,live,watch.datasets),notes:watch.notes}),[universe,live,watch]);
}

/** Injects the watch quote rows into its single child (the WatchlistPanel or the ListAlertDialog App built). The child keeps
 * its type and its other props, so shallow trees still find it under this binding. */
export function WatchQuotesBinding({store,universe,quotesProp,notesProp,children}:{store:LiveDatasetStore;universe:readonly BarDataset[];quotesProp:string;notesProp?:string;children?:ReactNode}){
 const quotes=useWatchQuotes(store,universe);
 if(!isValidElement(children))return children??null;
 return cloneElement(children as ReactElement<Record<string,unknown>>,notesProp?{[quotesProp]:quotes.datasets,[notesProp]:quotes.notes}:{[quotesProp]:quotes.datasets});
}

/** One live quote snapshot per (quote, freshness): the stale form is a copy, as useLiveQuote hands its readers a new object
 * when the newest quote turns stale (LIVE_QUOTE_STALE_MS after it arrived). */
interface QuoteForms {fresh:LiveQuote;stale:LiveQuote}
const quoteForms=new WeakMap<LiveQuote,QuoteForms>();
function quoteSnapshot(quote:LiveQuote|null,nowMs:number):LiveQuote|null{
 if(!quote)return null;let forms=quoteForms.get(quote);if(!forms){forms={fresh:quote,stale:{...quote}};quoteForms.set(quote,forms);}
 return liveQuoteFresh(quote,nowMs)?forms.fresh:forms.stale;
}
const noSubscription=()=>()=>{};
/** The live best bid and ask of one instrument behind useSyncExternalStore (the store throttles to 4 updates a second). It
 * re-renders once more when the quote turns stale, so freshness readers drop it on time. The snapshot always belongs to the
 * instrument asked for (by construction). */
export function useLiveQuoteSnapshot(instrumentId:string|null|undefined,store:LiveQuoteStore=liveQuotes):LiveQuote|null{
 const subscribe=useMemo(()=>instrumentId?(onChange:()=>void)=>{
  let timer:ReturnType<typeof setTimeout>|null=null;
  const arm=()=>{if(timer!==null){clearTimeout(timer);timer=null;}const quote=store.get(instrumentId);if(!quote)return;const wait=quote.receivedAt+LIVE_QUOTE_STALE_MS-Date.now()+1;if(wait>0&&wait<2**31)timer=setTimeout(()=>{timer=null;onChange();},wait);};
  const off=store.subscribe(instrumentId,()=>{arm();onChange();});arm();
  return()=>{off();if(timer!==null)clearTimeout(timer);};
 }:noSubscription,[instrumentId,store]);
 const read=()=>instrumentId?quoteSnapshot(store.get(instrumentId),Date.now()):null;
 return useSyncExternalStore(subscribe,read,read);
}
/** Injects the live book into its single child. `dock`: the paper dock's best bid and ask rows (book, bookSource), built on
 * the action quote exactly as App did; `ticket`: the order ticket's raw live quote (book). No instrument: no live book. */
export function LiveBookBinding({instrumentId,actionQuote,mode,store,children}:{instrumentId:string|null;actionQuote?:Quote|null;mode:'dock'|'ticket';store?:LiveQuoteStore;children?:ReactNode}){
 const quote=useLiveQuoteSnapshot(instrumentId,store);
 if(!isValidElement(children))return children??null;
 if(mode==='ticket')return cloneElement(children as ReactElement<Record<string,unknown>>,{book:quote});
 const book=topOfBookDisplayQuote(quote,actionQuote,Date.now());
 return cloneElement(children as ReactElement<Record<string,unknown>>,{book,bookSource:book&&quote?liveQuoteSourceLabel(quote):null});
}
