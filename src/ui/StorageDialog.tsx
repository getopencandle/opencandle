import React,{useRef,useState} from 'react';
import {Modal} from './Modal';
import {LocalStorageSection} from './LocalStorageSection';
import type {WorkspaceStartup} from './workspace-startup';
/**
 * Recovery host for saved work: used before the workspace has loaded (when Settings cannot open) and by the startup
 * recovery button. Once the workspace is ready the same controls live on the Data sources tab of Settings.
 */
export function StorageDialog({directory,onExport,onReset,onRestore,onClose,startup,onRetry}:{directory:string;onExport:()=>Promise<void|string>;onReset:()=>Promise<void>;onRestore?:()=>void;onClose:()=>void;startup?:WorkspaceStartup;onRetry?:()=>void}){
 const pending=useRef(false),[error,setError]=useState('');
 const close=()=>{if(pending.current){setError('Wait for the operation to finish.');return;}onClose();};
 return <Modal title="Saved work" onClose={close}><div className="modal-scroll"><LocalStorageSection directory={directory} onExport={onExport} onReset={onReset} onRestore={onRestore} onResetDone={onClose} startup={startup} onRetry={onRetry} onPendingChange={value=>{pending.current=value;}}/></div><footer><span role="alert">{error}</span><button type="button" onClick={close}>Close</button></footer></Modal>;
}
