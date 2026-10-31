import React,{useEffect,useState} from 'react';
import {runIdleSteps} from './startup-idle';

/** Content the first chart paint does not need (the rail panel) mounts after it, in an idle slice, so the startup
 * renders, the first layout and the chart build are not one long task each with it. `hold` is true while the startup is still
 * on its way to a chart; once it clears the content mounts on the next idle slice and then stays mounted for good. A startup
 * that never reaches a chart (a failed build) still mounts it after `maxWaitMs`. Nothing is rendered in its place: the
 * panel column has a fixed width, so nothing moves when the content arrives. */
export function StartupDeferred({hold,maxWaitMs=3000,children}:{hold:boolean;maxWaitMs?:number;children?:React.ReactNode}){
 const [mounted,setMounted]=useState(false);
 useEffect(()=>{if(mounted)return;const timer=setTimeout(()=>setMounted(true),maxWaitMs);return()=>clearTimeout(timer);},[mounted,maxWaitMs]);
 useEffect(()=>{if(mounted||hold)return;return runIdleSteps([()=>setMounted(true)],()=>{},{timeout:300});},[mounted,hold]);
 return mounted?<>{children}</>:null;
}
