/** Owns the handoff between two real chart trees. Native readiness and holds
 * belong to their adapters; this coordinator never substitutes model presence
 * for accepted inputs or fabricates a ready chart. */
export interface StructuralOldTree {
 isCurrent:()=>boolean;
 resume:()=>void;
 retire:()=>void;
 dispose:()=>void|Promise<void>;
}
export interface StructuralStagedTree {
 ready:(signal:AbortSignal)=>Promise<void>;
 /** Ownership remains current while mounting; readiness is established only
  * by ready(), never by this predicate. */
 isCurrent:()=>boolean;
 publish:()=>void;
 quarantine:(message:string)=>void;
 cancel:()=>void;
 dispose:()=>void|Promise<void>;
}
export interface StructuralWorkspaceRequest {
 assertCurrent:()=>boolean;
 acquireOldHold:()=>StructuralOldTree;
 createStage:()=>StructuralStagedTree;
 /** Call markCommitted immediately after authoritative model/history refs
  * change, before fallible view publication. A later throw is not rollback. */
 commitModel:(markCommitted:()=>void)=>void;
}
export interface StructuralWorkspaceResult {committed:boolean;cancelled:boolean;errors:string[]}
function aborted(signal:AbortSignal):Error{return new Error(typeof signal.reason==='string'?signal.reason:'Structural workspace restoration was cancelled.');}
async function cancellable(work:Promise<void>,signal:AbortSignal):Promise<void>{
 if(signal.aborted)throw aborted(signal);
 let cancel:()=>void=()=>{};
 const rejection=new Promise<never>((_,reject)=>{cancel=()=>reject(aborted(signal));signal.addEventListener('abort',cancel,{once:true});});
 try{await Promise.race([work,rejection]);}finally{signal.removeEventListener('abort',cancel);}
}
export function createStructuralWorkspaceTransaction(){
 let active:{abort:AbortController;committed:boolean;cancelled:boolean}|null=null;
 return{
  busy:()=>active!==null,
  cancel(reason='Structural workspace restoration was cancelled.'){if(active&&!active.committed){active.cancelled=true;active.abort.abort(reason);}},
  async run(request:StructuralWorkspaceRequest):Promise<StructuralWorkspaceResult>{
   if(active)throw new Error('Another structural workspace transaction is active.');
   const owner={abort:new AbortController(),committed:false,cancelled:false};active=owner;
   let old:StructuralOldTree|null=null,stage:StructuralStagedTree|null=null;
   const errors:string[]=[],record=(error:unknown)=>{errors.push(error instanceof Error?error.message:String(error));};
   const attempt=(fn:()=>void)=>{try{fn();}catch(error){record(error);}};
   const dispose=async(fn:()=>void|Promise<void>)=>{try{await fn();}catch(error){record(error);}};
   const current=()=>{if(owner.abort.signal.aborted)throw aborted(owner.abort.signal);if(!request.assertCurrent()||old&&!old.isCurrent()||stage&&!stage.isCurrent())throw new Error('The structural workspace owner or exact staged input changed.');};
   try{
    current();old=request.acquireOldHold();current();stage=request.createStage();current();
    await cancellable(stage.ready(owner.abort.signal),owner.abort.signal);current();
    let accepting=true;try{request.commitModel(()=>{if(!accepting)throw new Error('The structural workspace acceptance receipt is retired.');if(owner.committed)throw new Error('The structural workspace model was already committed.');owner.committed=true;});}finally{accepting=false;}
    if(!owner.committed)throw new Error('The structural workspace model did not acknowledge acceptance.');
   }catch(error){record(error);}
   try{
    if(owner.committed){
     // Neither a retired old tree nor a partially published new tree may become
     // authoritative again after model acceptance. Attempt all cleanup paths.
     if(old)attempt(old.retire);
     if(stage){if(errors.length===0)attempt(stage.publish);if(errors.length)attempt(()=>stage!.quarantine('Committed workspace needs recovery. '+errors.join(' ')));}
     if(old)await dispose(old.dispose);
     if(errors.length&&stage)attempt(()=>stage!.quarantine('Committed workspace needs recovery. '+errors.join(' ')));
    }else{
     owner.abort.abort('Structural workspace staging retired before commit.');
     if(stage){attempt(stage.cancel);await dispose(stage.dispose);}
     if(old){let reusable=false;try{reusable=request.assertCurrent()&&old.isCurrent();}catch(error){record(error);}
      if(reusable){const count=errors.length;attempt(old.resume);if(errors.length!==count){attempt(old.retire);await dispose(old.dispose);}}else{attempt(old.retire);await dispose(old.dispose);}
     }
    }
   }finally{if(active===owner)active=null;}
   return{committed:owner.committed,cancelled:owner.cancelled&&!owner.committed,errors};
  },
 };
}
