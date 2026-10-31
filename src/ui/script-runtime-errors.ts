// Run-time failures of chart script instances. A script that compiles but throws while it runs
// keeps its previous plot on the chart (the instance stays on its last good version), and the reference shows the failure next to
// the study: a red "!" on the legend row with the message, plus a console line in the editor. This store carries that error from the
// editor (which runs the instance) to every legend row of the same binding id. Session-only: the next successful run clears it.
import {useSyncExternalStore} from 'react';

const errors=new Map<string,string>(),listeners=new Set<()=>void>();
const notify=()=>{for(const listener of [...listeners])try{listener();}catch{/* One listener never blocks the rest. */}};

/** Plain text for a run-time error: the worker's error code prefix (for example `SCRIPT_FAILED: `) is dropped. */
export function scriptRuntimeErrorText(error:unknown):string{
 const raw=error instanceof Error?error.message:String(error??'');
 const text=raw.replace(/^[A-Z][A-Z0-9_]+:\s*/,'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
 return text||'The script failed while running.';
}
export function setScriptRuntimeError(bindingId:string,message:string){if(errors.get(bindingId)===message)return;errors.set(bindingId,message);notify();}
export function clearScriptRuntimeError(bindingId:string){if(errors.delete(bindingId))notify();}
export function scriptRuntimeError(bindingId:string):string|null{return errors.get(bindingId)??null;}
export function subscribeScriptRuntimeErrors(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
/** Test hook: forget every recorded error. */
export function resetScriptRuntimeErrors(){if(!errors.size)return;errors.clear();notify();}
export function useScriptRuntimeError(bindingId:string):string|null{
 return useSyncExternalStore(subscribeScriptRuntimeErrors,()=>scriptRuntimeError(bindingId),()=>null);
}
