import React,{useEffect,useRef,useState} from 'react';
import type {WorkspaceStartup} from './workspace-startup';
export interface LocalStorageSectionProps {
 directory:string;
 onExport:()=>Promise<void|string>;
 onReset:()=>Promise<void>;
 onRestore?:()=>void;
 /** Called after a completed reset (the host closes). */
 onResetDone:()=>void;
 startup?:WorkspaceStartup;
 onRetry?:()=>void;
 /** True while an export or reset runs, so the host can refuse to close underneath it. */
 onPendingChange?:(pending:boolean)=>void;
}
/**
 * Saved work on this computer: export, restore, reset. One implementation, two hosts: the Data sources tab of Settings and
 * the small recovery dialog used before the workspace has loaded. Its guards (one operation at a time, reset pinned to the
 * action chosen when the confirmation opened, nothing runs while startup is blocked) are unchanged from the old storage dialog.
 */
export function LocalStorageSection({directory,onExport,onReset,onRestore,onResetDone,startup,onRetry,onPendingChange}:LocalStorageSectionProps){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const pending=useRef(false),mounted=useRef(true),resetAction=useRef<(()=>Promise<void>)|null>(null);
 const blocked=startup?.phase==='loading'||startup?.phase==='unavailable';
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{resetAction.current=null;setConfirm(false);},[startup]);
 async function operation(kind:'export'|'reset'){
  if(pending.current||blocked||kind==='reset'&&(!confirm||!resetAction.current))return;
  pending.current=true;onPendingChange?.(true);setBusy(true);setStatus('');
  try{const result=await(kind==='reset'?resetAction.current!():onExport());if(mounted.current){if(kind==='reset')onResetDone();else setStatus(typeof result==='string'?result:'Backup saved.');}}
  catch(cause){if(mounted.current)setStatus(cause instanceof Error?cause.message:String(cause));}
  finally{pending.current=false;onPendingChange?.(false);if(mounted.current)setBusy(false);}
 }
 return <section className="lv-storage-section" aria-label="Saved on this computer">
  <h3>Saved on this computer</h3>
  {startup&&startup.phase!=='ready'&&startup.phase!=='preview'&&<div role="status">
   <p>{startup.error||(startup.phase==='loading'?'Your saved work is still loading.':'')}</p>
   {startup.phase==='recoverable'&&<p>Your saved work needs repair. Export a copy first, then restore or reset.</p>}
   {onRetry&&<button type="button" disabled={busy||startup.phase==='loading'} onClick={()=>{resetAction.current=null;setConfirm(false);onRetry();}}>Try again</button>}
  </div>}
  <p>Your charts, layouts, drawings, watchlists, alerts, imported bars and paper trades are saved on this computer only.</p>
  <label>Workspace folder<input aria-label="Local workspace folder" readOnly value={directory||(startup?.phase==='unavailable'?'Storage location unavailable':'Desktop package required')} style={{width:'100%',marginTop:8}}/></label>
  <p className="help">Export a backup before resetting.</p>
  <div className="button-row">
   <button type="button" disabled={busy||blocked} onClick={()=>void operation('export')}>Export backup</button>
   {onRestore&&<button type="button" disabled={busy||blocked} onClick={()=>{if(!pending.current&&!blocked)onRestore();}}>Restore from backup</button>}
   <button type="button" disabled={busy||blocked} onClick={()=>{resetAction.current=onReset;setConfirm(true);}}>Reset…</button>
  </div>
  {confirm&&<fieldset disabled={busy||blocked}>
   <legend>Confirm reset</legend>
   <p>This deletes your saved charts, imported bars and paper trading history on this computer. Exported backups are not affected.</p>
   <label><input type="checkbox" checked={confirm} onChange={event=>setConfirm(event.target.checked)}/> I understand</label>
   <div className="button-row"><button type="button" onClick={()=>setConfirm(false)}>Cancel</button><button type="button" disabled={busy} onClick={()=>void operation('reset')}>{busy?'Resetting…':'Reset now'}</button></div>
  </fieldset>}
  {status&&<p role="status" className="lv-storage-status">{status}</p>}
 </section>;
}
