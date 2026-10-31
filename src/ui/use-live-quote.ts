import {useEffect,useState} from 'react';
import {liveQuotes,LIVE_QUOTE_MIN_INTERVAL_MS,LIVE_QUOTE_STALE_MS,type LiveQuote,type LiveQuoteStore} from '../domain/live-quotes';

/** The newest live best bid and ask of one instrument (throttled by the store, at most 4 updates a second). */
export function useLiveQuote(instrumentId:string|null|undefined,store:LiveQuoteStore=liveQuotes):LiveQuote|null{
 // The held quote is tagged with its instrument, so the render right after the instrument
 // changes reads the new instrument's quote from the store instead of showing the old symbol's bid and ask for one frame.
 const [held,setHeld]=useState<{id:string|null;quote:LiveQuote|null}>(()=>({id:instrumentId??null,quote:instrumentId?store.get(instrumentId):null}));
 // A chart cell no longer re-renders on every App update, so the hook itself re-renders once when the newest
 // quote turns stale (LIVE_QUOTE_STALE_MS after it arrived): readers that test freshness then drop the bid and ask marks.
 useEffect(()=>{if(!instrumentId){setHeld({id:null,quote:null});return;}let timer:ReturnType<typeof setTimeout>|null=null;
  const take=(next:LiveQuote|null)=>{setHeld({id:instrumentId,quote:next});if(timer!==null){clearTimeout(timer);timer=null;}if(!next)return;const wait=next.receivedAt+LIVE_QUOTE_STALE_MS-Date.now()+1;if(wait>0&&wait<2**31)timer=setTimeout(()=>{timer=null;setHeld(current=>current.id===instrumentId&&current.quote===next?{id:instrumentId,quote:{...next}}:current);},wait);};
  take(store.get(instrumentId));const off=store.subscribe(instrumentId,take);return()=>{off();if(timer!==null)clearTimeout(timer);};},[instrumentId,store]);
 return heldQuoteFor(held,instrumentId,store);
}
/** The quote a render shows: the held one only when it belongs to the instrument now asked for (F10). */
export function heldQuoteFor(held:{id:string|null;quote:LiveQuote|null},instrumentId:string|null|undefined,store:LiveQuoteStore=liveQuotes):LiveQuote|null{
 return held.id===(instrumentId??null)?held.quote:instrumentId?store.get(instrumentId):null;
}
/** A counter that moves when any instrument's quote changes (for multi-row views such as the watchlist), at most once per
 * `intervalMs` however many symbols are quoted. */
export function useLiveQuotesVersion(store:LiveQuoteStore=liveQuotes,intervalMs=LIVE_QUOTE_MIN_INTERVAL_MS):number{
 const [version,setVersion]=useState(0);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>|null=null;const off=store.subscribeAll(()=>{if(timer===null)timer=setTimeout(()=>{timer=null;setVersion(value=>value+1);},intervalMs);});return()=>{off();if(timer!==null)clearTimeout(timer);};},[store,intervalMs]);
 return version;
}
