export type MagnetMode='off'|'weak'|'strong';
/** snapToIndicators: additive and optional; absent means off, so older workspaces load unchanged. */
export interface DrawingPreferences {schemaVersion:1;magnet:MagnetMode;lastEnabledMagnet:'weak'|'strong';stay:boolean;snapToIndicators?:boolean}
export interface PhysicalDrawingPreferences {magnet:MagnetMode;stay:boolean}
export interface DrawingPreferencePort {get:()=>PhysicalDrawingPreferences;apply:(value:PhysicalDrawingPreferences)=>void;subscribe:(callback:(value:PhysicalDrawingPreferences)=>void)=>()=>void}
export const initialDrawingPreferences:DrawingPreferences={schemaVersion:1,magnet:'off',lastEnabledMagnet:'weak',stay:false};
export function restoreDrawingPreferences(value:unknown):DrawingPreferences{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid drawing preferences.');
 const p=value as Record<string,unknown>;
 if(p.schemaVersion!==1||!['off','weak','strong'].includes(p.magnet as string)||!['weak','strong'].includes(p.lastEnabledMagnet as string)||typeof p.stay!=='boolean'||p.snapToIndicators!==undefined&&typeof p.snapToIndicators!=='boolean'||Object.keys(p).some(key=>!['schemaVersion','magnet','lastEnabledMagnet','stay','snapToIndicators'].includes(key)))throw new Error('Unsupported drawing preferences.');
 if(p.magnet!=='off'&&p.magnet!==p.lastEnabledMagnet)throw new Error('Enabled magnet and saved strength must agree.');
 return{schemaVersion:1,magnet:p.magnet as MagnetMode,lastEnabledMagnet:p.lastEnabledMagnet as 'weak'|'strong',stay:p.stay,...(p.snapToIndicators!==undefined?{snapToIndicators:p.snapToIndicators as boolean}:{})};
}
export function reconcileDrawingPreferences(current:DrawingPreferences,physical:PhysicalDrawingPreferences):DrawingPreferences{
 const next=restoreDrawingPreferences({...current,magnet:physical.magnet,stay:physical.stay,lastEnabledMagnet:physical.magnet==='off'?current.lastEnabledMagnet:physical.magnet});
 return current.magnet===next.magnet&&current.stay===next.stay&&current.lastEnabledMagnet===next.lastEnabledMagnet?current:next;
}
/** Attach suppression belongs to the port; stale callbacks are also rejected after cleanup. */
export function connectDrawingPreferences(port:DrawingPreferencePort,get:()=>DrawingPreferences,onNative:(next:DrawingPreferences)=>boolean|void,onError:(error:unknown)=>void):()=>void{
 let active=true,restoring=false,observed=get(),accepted=restoreDrawingPreferences(observed),signature=JSON.stringify(accepted);port.apply({magnet:accepted.magnet,stay:accepted.stay});
 const off=port.subscribe(value=>{if(!active||restoring)return;try{
  const current=get(),checked=restoreDrawingPreferences(current),currentSignature=JSON.stringify(checked);
  // A parent render may lag several native actions. Retain accepted changes until a new committed snapshot arrives.
  if(current!==observed||currentSignature!==signature){observed=current;signature=currentSignature;accepted=checked;}
  const next=reconcileDrawingPreferences(accepted,value);if(next!==accepted){if(onNative(next)===false)throw new Error('The drawing preference change was rejected. Previous settings were restored.');accepted=next;}
 }catch(error){restoring=true;try{port.apply({magnet:accepted.magnet,stay:accepted.stay});}catch(rollback){onError(new AggregateError([error,rollback],'Drawing preference publication failed and native recovery was incomplete.'));return;}finally{restoring=false;}onError(error);}});
 return()=>{active=false;off();};
}
/** Toolbar commands apply physical settings and accept the workspace together.
 * A rejected model publication restores the exact previous physical values. */
export function applyDrawingPreferenceChange(port:DrawingPreferencePort,next:DrawingPreferences,publish:(next:DrawingPreferences)=>boolean|void):void{
 const validated=restoreDrawingPreferences(next),before=port.get();port.apply({magnet:validated.magnet,stay:validated.stay});
 try{if(publish(validated)===false)throw new Error('The drawing preference change was rejected. Previous settings were restored.');}
 catch(error){try{port.apply(before);}catch(rollback){throw new AggregateError([error,rollback],'Drawing preference publication failed and native recovery was incomplete.');}throw error;}
}
