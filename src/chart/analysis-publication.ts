export type AnalysisSubscriber=()=>unknown;
export interface AnalysisPublicationOwner {isCurrent():boolean;quarantine(error:AnalysisPublicationError):void}
export interface AnalysisPublicationHost {captureOwner():AnalysisPublicationOwner;assertMutable?():void}
export interface AnalysisPublicationProof {restored?:boolean;ownerCurrent?:()=>boolean}
export class AnalysisPublicationError extends AggregateError {
 readonly accepted=true;readonly recoveryRequired=true;
 constructor(readonly domain:string,readonly causes:readonly unknown[]){super(causes,`${domain} changed, but workspace publication was incomplete. Reopen the chart before editing again.`);this.name='AnalysisPublicationError';}
}
export function isAnalysisPublicationFailure(error:unknown):boolean{
 const pending=[error],seen=new Set<unknown>();let index=0;
 while(index<pending.length&&index<64){const next=pending[index++];if(next instanceof AnalysisPublicationError)return true;if(seen.has(next))continue;seen.add(next);if(next instanceof AggregateError){const descriptor=Object.getOwnPropertyDescriptor(next,'errors');if(descriptor&&'value' in descriptor&&Array.isArray(descriptor.value)){
   for(let ordinal=0;ordinal<Math.min(descriptor.value.length,64);ordinal++){const child=Object.getOwnPropertyDescriptor(descriptor.value,String(ordinal));if(!child||!('value' in child))continue;if(child.value instanceof AnalysisPublicationError)return true;if(pending.length<128)pending.push(child.value);}
  }}}
 return false;
}
interface Frame {kind:'mutation'|'external';owner:AnalysisPublicationOwner;dirty:boolean;released:boolean;issues:Array<{owner:AnalysisPublicationOwner;cause:unknown}>}

/** Ownership is captured before native work. Publication failure cannot roll back accepted work. */
export function createAnalysisPublication(domain:string,host?:AnalysisPublicationHost){
 const subscribers=new Set<AnalysisSubscriber>(),frames:Frame[]=[];let disposed=false,publishing=false;
 let blocked:{owner:AnalysisPublicationOwner;error:AnalysisPublicationError}|null=null;
 const capture=():AnalysisPublicationOwner=>host?.captureOwner()??{isCurrent:()=>!disposed,quarantine(){}};
 const current=(owner:AnalysisPublicationOwner)=>!disposed&&owner.isCurrent();
 function assertMutable(){if(disposed)throw Error(`${domain} port is disposed.`);if(publishing)throw Error(`${domain} cannot change during workspace publication.`);if(blocked){if(current(blocked.owner))throw blocked.error;blocked=null;}host?.assertMutable?.();}
 function failed(owner:AnalysisPublicationOwner,causes:unknown[]):never{
  const error=new AnalysisPublicationError(domain,causes);let owned=false;
  try{owned=current(owner);}catch(cause){causes.push(cause);}
  if(owned){blocked={owner,error};try{owner.quarantine(error);}catch(cause){causes.push(cause);}}
  if(causes.length!==error.errors.length){const complete=new AnalysisPublicationError(domain,causes);if(owned)blocked={owner,error:complete};throw complete;}
  throw error;
 }
 function publish(owner:AnalysisPublicationOwner){
  const failures:unknown[]=[];publishing=true;
  try{
   for(const callback of [...subscribers]){
    if(!current(owner)){failures.push(Error('The accepted analysis owner retired before publication completed.'));break;}
    if(!subscribers.has(callback))continue;
    try{if(callback()===false)failures.push(Error('The workspace rejected the accepted analysis change.'));}catch(error){failures.push(error);}
    if(!current(owner)){failures.push(Error('The accepted analysis owner retired during publication.'));break;}
   }
   if(!current(owner)&&!failures.length)failures.push(Error('The accepted analysis owner retired.'));
  }catch(error){failures.push(error);}finally{publishing=false;}
  if(failures.length)failed(owner,failures);
 }
 function finish(frame:Frame,publishChanges:boolean,proof?:AnalysisPublicationProof){
  if(frame.released)throw Error('Analysis notification lease already released.');
  if(frames.at(-1)!==frame)throw Error('Analysis notification leases must finish in reverse acquisition order.');
  frame.released=true;frames.pop();
  if(!frame.dirty)return;
  if(!publishChanges){if(frame.kind==='external'){
   let restored=proof?.restored===true;try{if(proof?.ownerCurrent&&!proof.ownerCurrent())restored=false;}catch(cause){failed(frame.owner,[cause]);}
   if(!restored)failed(frame.owner,[Error('Accepted analysis changes cannot be discarded without current, completed rollback evidence.')]);
  }return;}
  let owner=frame.owner;
  if(frame.kind==='external'&&proof?.ownerCurrent){
   try{if(!proof.ownerCurrent())throw Error('The enclosing analysis transaction retired before publication.');
    const finalOwner=capture();if(!proof.ownerCurrent())throw Error('The enclosing analysis transaction retired during final owner capture.');owner=finalOwner;
   }catch(cause){failed(frame.owner,[cause]);}
  }
  try{if(!current(owner))frame.issues.push({owner,cause:Error('Analysis input changed during the accepted native mutation.')});}catch(cause){frame.issues.push({owner,cause});}
  const parent=frames.at(-1);if(parent){parent.dirty=true;parent.issues.push(...frame.issues);return;}
  if(frame.issues.length)failed(frame.issues[0].owner,frame.issues.map(issue=>issue.cause));publish(owner);
 }
 function transaction<T>(action:()=>T):T{
  assertMutable();const frame:Frame={kind:'mutation',owner:capture(),dirty:false,released:false,issues:[]};
  if(!current(frame.owner))throw Error('Analysis input is unavailable before mutation.');frames.push(frame);
  let value:T;try{value=action();}catch(error){try{finish(frame,false);}catch(cleanup){throw new AggregateError([error,cleanup],'Analysis mutation and notification cleanup failed.');}throw error;}
  finish(frame,true);return value;
 }
 return {
  assertMutable,transaction,
  subscribe(callback:AnalysisSubscriber){if(disposed)throw Error(`${domain} port is disposed.`);subscribers.add(callback);return()=>{subscribers.delete(callback);};},
  changed(){if(disposed)return;const frame=frames.at(-1);if(frame){frame.dirty=true;return;}transaction(()=>{frames.at(-1)!.dirty=true;});},
  beginExternalTransaction(){assertMutable();const frame:Frame={kind:'external',owner:capture(),dirty:false,released:false,issues:[]};if(!current(frame.owner))throw Error('Analysis input is unavailable before notification hold.');frames.push(frame);return{release(publishChanges:boolean,proof?:AnalysisPublicationProof){if(typeof publishChanges!=='boolean')throw Error('An explicit publication outcome is required.');finish(frame,publishChanges,proof);}};},
  dispose(){disposed=true;subscribers.clear();blocked=null;},
 };
}
