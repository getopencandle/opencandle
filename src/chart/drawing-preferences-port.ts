export interface PhysicalDrawingPreferences {magnet:'off'|'weak'|'strong';stay:boolean}
interface PreferenceHost {read:()=>PhysicalDrawingPreferences;setMagnet:(mode:PhysicalDrawingPreferences['magnet'])=>void;setStay:(on:boolean)=>void;onSnap:(callback:()=>void)=>()=>void;onStay:(callback:()=>void)=>()=>void}
export function createDrawingPreferencesPort(host:PreferenceHost){
 let suppressed=0,disposed=false,last=host.read();const listeners=new Set<(value:PhysicalDrawingPreferences)=>void>();
 const changed=()=>{if(disposed||suppressed)return;const next=host.read();if(next.magnet===last.magnet&&next.stay===last.stay)return;last={...next};for(const callback of listeners)callback({...next});};
 const unsubscribe=[host.onSnap(changed),host.onStay(changed)];
 return {get:()=>({...host.read()}),subscribe(callback:(value:PhysicalDrawingPreferences)=>void){if(disposed)throw new Error('Drawing preferences port is disposed');listeners.add(callback);return()=>{listeners.delete(callback);};},
  apply(value:PhysicalDrawingPreferences){if(disposed)throw new Error('Drawing preferences port is disposed');if(!value||!['off','weak','strong'].includes(value.magnet)||typeof value.stay!=='boolean')throw new Error('Invalid drawing preferences');const previous=host.read();suppressed++;try{host.setMagnet(value.magnet);host.setStay(value.stay);}catch(error){try{host.setMagnet(previous.magnet);host.setStay(previous.stay);}catch(rollback){throw new Error(`Drawing preference rollback failed: ${String(rollback)}; original: ${String(error)}`);}throw error;}finally{last={...host.read()};suppressed--;}}
  ,dispose(){if(disposed)return;disposed=true;listeners.clear();unsubscribe.forEach(fn=>fn());}
 };
}
