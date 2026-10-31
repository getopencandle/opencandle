import {ALPACA_IEX_PROVIDER_ID,ALPACA_MAX_SYMBOLS} from '../domain/alpaca-live';

// Live feeds stay warm across a quick layout tab switch.
// Before, App closed a live feed as soon as no visible chart named it, so switching to another tab and back closed and
// reopened every live feed of the tab (each reopen is a new Alpaca subscribe and a new backfill). Now the feeds of the
// most recently left tabs stay open for a while, so a quick switch back finds them still streaming and up to date.
// All limits are our own choice:
// - the feeds of the WARM_LAYOUT_TABS most recently left tabs stay open;
// - each stays open for WARM_FEED_IDLE_MS after its tab was left, then closes (unless a visible chart names it again);
// - warm feeds hold at most WARM_ALPACA_SYMBOLS Alpaca symbols that nothing else streams, and never take the last
//   WARM_ALPACA_RESERVE slots of the 30-symbol Alpaca cap, so a new chart, alert or paper feed still finds a slot.
//   A symbol something else already streams (a visible chart, an alert, a second-symbol series) costs no slot.
// Warm feeds are ordinary open feeds, so they also count in App's open-symbol set (alerts, watchlist planning).

export const WARM_LAYOUT_TABS=2;
export const WARM_FEED_IDLE_MS=5*60_000;
export const WARM_ALPACA_SYMBOLS=8;
export const WARM_ALPACA_RESERVE=4;
/** While anything is warm, the budget is checked again at least this often (alert and paper demand can change). */
export const WARM_RECHECK_MS=30_000;

interface WarmLayout {ids:string[];leftAt:number}
/** alerts: the Alpaca symbols the background alert plan streams and how many alerts it had to skip (App sets it). */
export interface WarmLayoutFeeds {layouts:Map<string,WarmLayout>;timer:ReturnType<typeof setTimeout>|null;alerts:{symbols:readonly string[];waiting:number}}
export function createWarmLayoutFeeds():WarmLayoutFeeds{return{layouts:new Map(),timer:null,alerts:{symbols:[],waiting:0}};}

/** The Alpaca symbol of a plain Alpaca live dataset id (live:alpaca-iex:SYMBOL:interval), else null. */
export function warmAlpacaSymbol(datasetId:string):string|null{
 const prefix='live:'+ALPACA_IEX_PROVIDER_ID+':';if(!datasetId.startsWith(prefix))return null;
 const symbol=datasetId.slice(prefix.length).split(':')[0];return symbol||null;
}
/** A layout tab is left for another one: its open live feeds (the ones its grid names) stay warm, and the tab being
 * entered is no longer warm (its feeds are visible again). Reopening the same layout changes nothing. */
export function leaveWarmLayout(warm:WarmLayoutFeeds,leaving:string,entering:string,openIds:Iterable<string>,named:(datasetId:string)=>boolean,now:number):void{
 if(leaving===entering)return;
 warm.layouts.delete(entering);warm.layouts.delete(leaving);
 const ids=[...openIds].filter(named);if(ids.length)warm.layouts.set(leaving,{ids,leftAt:now});
 while(warm.layouts.size>WARM_LAYOUT_TABS)warm.layouts.delete(warm.layouts.keys().next().value!);
}
/** A deleted layout's feeds are not kept warm. */
export function forgetWarmLayout(warm:WarmLayoutFeeds,layoutId:string):void{warm.layouts.delete(layoutId);}
/** Workspace reset or restore: nothing stays warm. */
export function forgetWarmLayouts(warm:WarmLayoutFeeds):void{warm.layouts.clear();}
/** The dataset ids to keep open although no visible chart names them. Expired tabs are dropped. demand: the Alpaca
 * symbols that stream anyway; extraDemand: further Alpaca slots something else is waiting for (skipped alerts). */
export function warmFeedIds(warm:WarmLayoutFeeds,now:number,demand:ReadonlySet<string>,extraDemand=0):Set<string>{
 for(const [id,row] of [...warm.layouts])if(now-row.leftAt>=WARM_FEED_IDLE_MS)warm.layouts.delete(id);
 const budget=Math.max(0,Math.min(WARM_ALPACA_SYMBOLS,ALPACA_MAX_SYMBOLS-WARM_ALPACA_RESERVE-demand.size-Math.max(0,extraDemand)));
 const keep=new Set<string>(),charged=new Set<string>();
 // Most recently left first, so the tab the owner is most likely to go back to keeps its feeds.
 for(const row of [...warm.layouts.values()].reverse())for(const id of row.ids){
  const symbol=warmAlpacaSymbol(id);
  if(symbol===null||demand.has(symbol)||charged.has(symbol)){keep.add(id);continue;}
  if(charged.size>=budget)continue;
  charged.add(symbol);keep.add(id);
 }
 return keep;
}
/** Milliseconds until the next warm tab expires, or null when nothing is warm. */
export function nextWarmExpiry(warm:WarmLayoutFeeds,now:number):number|null{
 let next:number|null=null;for(const row of warm.layouts.values()){const wait=Math.max(0,row.leftAt+WARM_FEED_IDLE_MS-now);next=next===null?wait:Math.min(next,wait);}return next;
}
/** Runs sweep once the next warm tab expires, or after WARM_RECHECK_MS if sooner (one timer per store; a later call
 * replaces it). Nothing warm: no timer. */
export function scheduleWarmSweep(warm:WarmLayoutFeeds,now:number,sweep:()=>void):void{
 if(warm.timer!==null)clearTimeout(warm.timer);warm.timer=null;
 const wait=nextWarmExpiry(warm,now);if(wait===null)return;
 warm.timer=setTimeout(()=>{warm.timer=null;sweep();},Math.min(wait+50,WARM_RECHECK_MS));
}
export function stopWarmSweep(warm:WarmLayoutFeeds):void{if(warm.timer!==null)clearTimeout(warm.timer);warm.timer=null;}
