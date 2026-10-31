import React,{useEffect,useRef,useState} from 'react';
import {describeCacheStatus,type BarCacheBridge,type BarCacheStatus} from '../domain/live-cache';

/**
 * Data sources > Cached market data. Shows how much the local bar cache holds and clears it.
 * The cache lives in the desktop process (electron/bar-cache.cjs); this panel only asks for its size and for a clear, through
 * the trusted bridge. Like the rest of the Data sources tab, Clear acts at once and is not part of the settings draft.
 */
export type MarketDataCacheBridge=Required<Pick<BarCacheBridge,'barCacheStatus'|'clearBarCache'>>;
export interface MarketDataCacheSectionProps {bridge:MarketDataCacheBridge|null}
export function MarketDataCacheSection({bridge}:MarketDataCacheSectionProps){
 const mounted=useRef(true);
 const [status,setStatus]=useState<BarCacheStatus|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  mounted.current=true;
  if(bridge)void bridge.barCacheStatus().then(result=>{if(!mounted.current)return;if(result.ok)setStatus(result.value);else setMessage(result.error.message);}).catch(()=>undefined);
  return()=>{mounted.current=false;};
 },[bridge]);
 async function clear(){
  if(!bridge||busy)return;setBusy(true);setMessage('');
  try{const result=await bridge.clearBarCache();if(!mounted.current)return;if(!result.ok)throw Error(result.error.message);setStatus(result.value);setMessage('Cached market data cleared. Charts download their history again the next time they open.');}
  catch(cause){if(mounted.current)setMessage('The cache could not be cleared: '+(cause instanceof Error?cause.message:String(cause)));}
  finally{if(mounted.current)setBusy(false);}
 }
 return <section className="lv-cache-settings" aria-label="Cached market data">
  <h3>Cached market data</h3>
  <p className="lv-live-note">Closed bars of live stock charts are kept on this computer so charts open faster. Not part of your saved workspace, never exported.</p>
  <p role="status" aria-live="polite">{describeCacheStatus(status,!!bridge)}</p>
  <button type="button" data-lv-destructive="true" disabled={busy||!bridge} onClick={()=>void clear()}>Clear cached market data</button>
  {message&&<p className="lv-live-message">{message}</p>}
 </section>;
}
