/** Publish only committed mutations, including synchronous native lifecycle callbacks. */
export function createNotificationBatch(notify:()=>void){
 let depth=0,externalDepth=0,dirty=false,externalAbort=false;
 const flush=(committed:boolean)=>{const publish=committed&&!externalAbort&&dirty;dirty=false;externalAbort=false;if(publish)notify();};
 const changed=()=>{if(depth||externalDepth){dirty=true;return;}notify();};
 const transaction=<T,>(action:()=>T):T=>{depth++;let committed=false;try{const value=action();committed=true;return value;}finally{depth--;if(!depth&&!externalDepth)flush(committed);}};
 /** An owner must release even on cancellation. A failed enclosing transaction publishes nothing. */
 const beginExternalTransaction=()=>{externalDepth++;let released=false;return {release(publish:boolean){if(released)throw new Error('Notification transaction already released.');if(typeof publish!=='boolean')throw new Error('Explicit notification transaction outcome required.');released=true;externalDepth--;externalAbort ||= !publish;if(!depth&&!externalDepth)flush(true);}};};
 return {changed,transaction,beginExternalTransaction};
}
