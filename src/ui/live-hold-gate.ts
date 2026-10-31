/**
 * While a workspace save holds the chart tree (commitLayoutReceipt suspend .. resume), a live feed
 * snapshot that is NOT growth of the one App shows (a cached snapshot's REST refresh with a new revision, a re-adjusted
 * reload) waits here and is published once the hold ends. Publishing it during the hold changed the held chart's input
 * and dataset universe under the save: the chart refused the write ("Chart unavailable: Error: The chart input is held by
 * an owned workspace transition.") and the save's resume then failed ("Saved locally, but the chart workspace needs
 * recovery"). Growth of the shown subscription is unaffected. Only the newest waiting snapshot per feed is kept.
 */
export interface LiveHoldGate {
 /** Start a hold. Returns its release (idempotent). Waiting snapshots are published after the last release. */
 hold():()=>void;
 held():boolean;
 /** While held, keep `publish` as the newest waiting publication for `feed` and return true; otherwise return false. */
 offer(feed:string,publish:()=>void):boolean;
}
export function createLiveHoldGate(schedule:(run:()=>void)=>void=run=>queueMicrotask(run)):LiveHoldGate{
 let holds=0;const waiting=new Map<string,()=>void>();
 const flush=()=>{if(holds)return;const runs=[...waiting.values()];waiting.clear();for(const run of runs)try{run();}catch{/* one feed never stops another */}};
 return{
  hold(){holds++;let released=false;return()=>{if(released)return;released=true;holds--;if(!holds&&waiting.size)schedule(flush);};},
  held:()=>holds>0,
  offer(feed,publish){if(!holds)return false;waiting.delete(feed);waiting.set(feed,publish);return true;},
 };
}
const gates=new WeakMap<object,LiveHoldGate>();
/** One gate per App instance, keyed by an object the instance owns (no extra React hook). */
export function liveHoldGateFor(owner:object):LiveHoldGate{let gate=gates.get(owner);if(!gate){gate=createLiveHoldGate();gates.set(owner,gate);}return gate;}
