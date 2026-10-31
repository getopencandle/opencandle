import React,{useEffect,useRef,useState} from 'react';
import {formatCacheSize} from '../domain/live-cache';
import type {FredBridge,fredDataStatus} from '../domain/fred';

/**
 * Data sources > Economic data (FRED). Shows the size of the small local FRED cache (hard cap 5 MB) and clears it.
 * The cache lives in the desktop process (electron/public-fred.cjs). Like the rest of the tab, Clear acts at once.
 */
export type FredCacheBridge=Required<Pick<FredBridge,'fredDataStatus'|'clearFredData'>>;
export interface FredCacheSectionProps {bridge:FredCacheBridge|null;/** Whether FRED downloads are allowed (absent: on). With onEnabledChange the checkbox is shown. */enabled?:boolean;onEnabledChange?:(enabled:boolean)=>void}
export function describeFredCache(status:fredDataStatus|null,available:boolean):string{
 if(!available)return 'Economic data needs the desktop app.';
 if(!status)return 'Checking saved economic data...';
 if(!status.entries)return `Empty (limit ${formatCacheSize(status.maxBytes)})`;
 return `${formatCacheSize(status.bytes)} of ${formatCacheSize(status.maxBytes)} used, ${status.entries} series`;
}
const unwrap=<T,>(result:unknown):T=>{const r=result as {ok?:boolean;value?:T;error?:{message:string}};if(r&&typeof r==='object'&&'ok' in r){if(!r.ok)throw Error(r.error?.message??'Request failed');return r.value as T;}return result as T;};
export function FredCacheSection({bridge,enabled=true,onEnabledChange}:FredCacheSectionProps){
 const mounted=useRef(true);
 const [status,setStatus]=useState<fredDataStatus|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  mounted.current=true;
  if(bridge)void bridge.fredDataStatus().then(result=>{if(mounted.current)setStatus(unwrap<fredDataStatus>(result));}).catch(cause=>{if(mounted.current)setMessage(cause instanceof Error?cause.message:String(cause));});
  return()=>{mounted.current=false;};
 },[bridge]);
 async function clear(){
  if(!bridge||busy)return;setBusy(true);setMessage('');
  try{const next=unwrap<fredDataStatus>(await bridge.clearFredData());if(!mounted.current)return;setStatus(next);setMessage('Saved economic data cleared. A series downloads again the next time you open it.');}
  catch(cause){if(mounted.current)setMessage('The saved data could not be cleared: '+(cause instanceof Error?cause.message:String(cause)));}
  finally{if(mounted.current)setBusy(false);}
 }
 return <section className="lv-fred-settings" aria-label="Economic data (FRED)">
  <h3>Economic data and rates (FRED)</h3>
  <p className="lv-live-note">Nothing to set up: no account or key. Treasury yields, inflation, jobs and other series from the St. Louis Fed. Type FRED: and a series id in the symbol search (for example FRED:DGS10), or open Markets. Each series downloads only when you open or compare it, at most once a day, and copies are kept on this computer up to 5 MB.</p>
  {onEnabledChange&&<><label><input type="checkbox" checked={enabled} onChange={event=>onEnabledChange(event.currentTarget.checked)}/> Allow FRED downloads</label>
  <p className="lv-live-note">When this is off, OpenCandle never contacts FRED and uses only the copies already saved here.</p></>}
  <p role="status" aria-live="polite">{describeFredCache(status,!!bridge)}</p>
  <button type="button" data-lv-destructive="true" disabled={busy||!bridge} onClick={()=>void clear()}>Clear saved economic data</button>
  {message&&<p className="lv-live-message">{message}</p>}
 </section>;
}
