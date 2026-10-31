/** A saved viewport that arrives while new bars are still being written (an interval change publishes the
 * refit viewport in the same render that feeds the new dataset) used to be applied against the OLD bars: vela converts the
 * time range to bar indices of the outgoing series, and the incoming setMarket then keeps that bar spacing. 1D -> 1W -> 1D
 * ended at ~10 daily bars. A viewport set during a bar write now waits and is applied once the last write has settled. */
export interface ViewportRangeSeconds {from:number;to:number}
export function createViewportDeferral(apply:(range:ViewportRangeSeconds)=>void){
 let writes=0,pending:ViewportRangeSeconds|null=null;
 const flush=()=>{if(writes>0||!pending)return;const range=pending;pending=null;try{apply(range);}catch{/* a stale range the renderer refuses leaves the current view */}};
 return {
  /** Register a bar write. The returned promise is the same one; the deferred viewport applies before callers see it settle. */
  track<T>(write:Promise<T>):Promise<T>{writes++;const done=()=>{writes--;flush();};write.then(done,done);return write;},
  set(range:ViewportRangeSeconds){if(writes>0){pending={from:range.from,to:range.to};return;}pending=null;apply(range);},
  pending:()=>pending?{...pending}:null,
 };
}
