import React,{useEffect,useRef,useState} from 'react';
import {Modal} from './Modal';
import {WORKSPACE_IMPORT_BYTES} from './workspace-transfer';
import {plainErrorText} from './user-error';

export interface WorkspaceRestorePreview {summary:readonly string[];assertCurrent:()=>void;apply:()=>Promise<void>}
export function WorkspaceRestoreDialog({onChoose,onPreview,onExport,onClose}:{onChoose:()=>Promise<{text:string}|null>;onPreview:(text:string)=>WorkspaceRestorePreview;onExport:()=>Promise<void|string>;onClose:()=>void}){
 const [text,setText]=useState(''),[review,setReview]=useState<WorkspaceRestorePreview|null>(null),[busy,setBusy]=useState<'choose'|'replace'|'export'|null>(null),[message,setMessage]=useState('');
 const mounted=useRef(true),epoch=useRef(0),pending=useRef<typeof busy>(null),currentReview=useRef<WorkspaceRestorePreview|null>(null),draft=useRef('');
 const previewButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;currentReview.current=null;};},[]);
 const clearReview=()=>{currentReview.current=null;setReview(null);};
 const cancelReview=()=>{if(pending.current==='replace'||pending.current==='export'){setMessage('Wait for the local storage operation to finish.');return;}clearReview();previewButton.current?.focus();};
 const edit=(next:string)=>{if(pending.current==='replace'||pending.current==='export')return;epoch.current++;draft.current=next;setText(next);clearReview();setMessage('');};
 const close=()=>{if(pending.current==='replace'||pending.current==='export'){setMessage('Wait for the local storage operation to finish.');return;}epoch.current++;currentReview.current=null;onClose();};
 async function choose(){
  if(pending.current)return;const request=++epoch.current;pending.current='choose';setBusy('choose');setMessage('');
  try{const result=await onChoose();if(!mounted.current||request!==epoch.current)return;if(result)edit(result.text);else setMessage('File selection cancelled. The current draft is unchanged.');}
  catch(error){if(mounted.current&&request===epoch.current)setMessage(plainErrorText(error));}
  finally{pending.current=null;if(mounted.current)setBusy(null);}
 }
 function preview(){
  if(pending.current==='replace'||pending.current==='export')return;epoch.current++;clearReview();setMessage('');
  try{const result=onPreview(draft.current);result.assertCurrent();currentReview.current=result;setReview(result);}catch(error){setMessage(plainErrorText(error));}
 }
 async function replace(candidate:WorkspaceRestorePreview){
  if(pending.current||currentReview.current!==candidate)return;
  pending.current='replace';setBusy('replace');setMessage('');
  try{candidate.assertCurrent();await candidate.apply();if(mounted.current){clearReview();onClose();}}
  catch(error){if(mounted.current)setMessage(plainErrorText(error));}
  finally{pending.current=null;if(mounted.current)setBusy(null);}
 }
 async function exportCurrent(){
  if(pending.current)return;pending.current='export';setBusy('export');setMessage('');
  try{const result=await onExport();if(mounted.current)setMessage(typeof result==='string'?result:'Export request finished.');}
  catch(error){if(mounted.current)setMessage(plainErrorText(error));}
  finally{pending.current=null;if(mounted.current)setBusy(null);}
 }
 const locked=busy==='replace'||busy==='export';
 return <Modal title="Restore local workspace" wide onClose={close}><div className="modal-scroll" onKeyDownCapture={event=>{if(event.nativeEvent.isComposing)return;if(event.key==='Escape'&&currentReview.current){event.preventDefault();event.stopPropagation();cancelReview();}}}>
  <p>Restore a complete OpenCandle workspace export from this computer. Preview the contents before replacing your saved charts and virtual trading history.</p>
  <div className="button-row"><button disabled={!!busy} onClick={()=>void choose()}>{busy==='choose'?'Choosing JSON…':'Choose workspace JSON'}</button><button disabled={!!busy} onClick={()=>void exportCurrent()}>Export current workspace first</button></div>
  <form onSubmit={event=>{event.preventDefault();if(!(event.nativeEvent as Event&{isComposing?:boolean}).isComposing)preview();}}>
   <label>Workspace export JSON<textarea aria-label="Workspace export JSON" value={text} maxLength={WORKSPACE_IMPORT_BYTES} disabled={locked} rows={8} spellCheck={false} onChange={event=>edit(event.target.value)} style={{width:'100%',fontFamily:'monospace'}}/></label>
   <p className="help">Files up to 64 MiB. Scripts are not run during preview. No account or network connection is needed.</p>
   <button type="submit" ref={previewButton} disabled={locked||!text.trim()}>Preview workspace</button>
  </form>
  {review&&<section aria-label="Workspace replacement preview"><h3>Review replacement</h3><ul>{review.summary.map((line,index)=><li key={index}>{line}</li>)}</ul><div className="button-row"><button disabled={locked} onClick={cancelReview}>Cancel replacement</button><button disabled={!!busy} onClick={()=>void replace(review)}>{busy==='replace'?'Replacing workspace…':'Replace local workspace'}</button></div></section>}
 </div><footer><span role="alert">{message}</span><button disabled={locked} onClick={close}>Close</button></footer></Modal>;
}
