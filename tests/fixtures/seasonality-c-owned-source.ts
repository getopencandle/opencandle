import {ownedSourceFixture as originalOwnedSourceFixture} from './seasonality-owned-source';
export {monthlyLocal,stamp,sourceRequest} from './seasonality-owned-source';

/** C-local completion of a synthetic facade only. The shared original-core harness omits
 * the handle-map deletion performed by the real SDK removeIndicator. It still owns all
 * actual source/native/model work; this helper neither creates records nor proves values. */
export async function ownedSourceFixture(options:Parameters<typeof originalOwnedSourceFixture>[0]={}){
 const h=await originalOwnedSourceFixture(options),add=h.chart.addNativeIndicator;
 let installed:typeof add|undefined,closed=false;
 const dispose=()=>{
  if(closed)return;closed=true;const failures:unknown[]=[];
  for(const release of [()=>{if(installed&&h.chart.addNativeIndicator===installed)h.chart.addNativeIndicator=add;},()=>h.dispose()])try{release();}catch(error){failures.push(error);}
  if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'C-local synthetic handle cleanup failed.');
 };
 try{
  installed=function(this:typeof h.chart,type){
   const handle=add.call(this,type),record=h.records.get(handle.id);
   if(record?.native?.instance?.settings?.kind!=='seasonality')return handle;
   const core=h.core,renderer=core.renderer,handles=core.handles,remove=handle.remove,id=handle.id;
   if(!(handles instanceof Map)||Object.getPrototypeOf(handles)!==Map.prototype||Map.prototype.get.call(handles,id)!==handle){const error=Error('The actual synthetic C handle was not registered.');try{remove.call(handle);}catch(cleanup){throw new AggregateError([error,cleanup],'Synthetic C acquisition and cleanup failed.');}throw error;}
   handle.remove=function(this:typeof handle){
    let result:ReturnType<typeof remove>|undefined,failure:unknown,failed=false;
    try{result=remove.call(this);}catch(error){failed=true;failure=error;}
    try{
     const models=renderer.scene.indicators;
     // Native work must already have detached. A new record/model/handle at the
     // same id belongs to its replacement and must never be removed here.
     if(core.renderer===renderer&&core.handles===handles&&h.core.registry.records===h.records&&
       models instanceof Map&&Object.getPrototypeOf(models)===Map.prototype&&
       !Map.prototype.has.call(h.records,id)&&!Map.prototype.has.call(models,id)&&
       Map.prototype.get.call(handles,id)===handle)Map.prototype.delete.call(handles,id);
    }catch(error){if(failed)throw new AggregateError([failure,error],'Synthetic native removal and handle completion failed.');throw error;}
    if(failed)throw failure;return result;
   };
   return handle;
  };
  h.chart.addNativeIndicator=installed;
  return{...h,dispose};
 }catch(error){try{dispose();}catch(cleanup){throw new AggregateError([error,cleanup],'C-local fixture setup and cleanup failed.');}throw error;}
}
