import type {SerializedDrawing} from '@luxalgo/vela';
import type {LosslessDrawingDocument,OwnedDrawingEditAcceptance,OwnedDrawingRemoveBatch} from './contracts';
import {captureNativeDrawingLease} from './drawing-template-batch';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';
import {prepareNativeDrawingRemoval,type NativeDrawingRemoval,type NativeDrawingRemovalResult,type NativeDrawingAcceptedValueOwner} from './drawing-duplicate-native';
import type {DrawingDuplicateWorkspaceCommand} from './drawing-duplicate-publication';

type Row=Record<string,unknown>;
export interface DrawingEraseReceipt {
 readonly ids:readonly string[];
 readonly nativeState:'before-forward'|'not-forwarded'|'complete'|'forwarded-incomplete';
 readonly canonicalAccepted:boolean;
 readonly workspaceAcknowledged:boolean;
 readonly observersComplete:boolean;
}
export interface DrawingErasePublicationHost {
 document:LosslessDrawingDocument;
 facade:object;
 captureSource():()=>void;
 captureWorkspace():DrawingDuplicateWorkspaceCommand;
 captureProjection():{assertCurrent():void;project(document:Row):SerializedDrawing[]};
 assertMutable():void;
 /** Check canonical lock, effective interval visibility and exact mounted pane. */
 assertEligible(row:Row):void;
 begin():{release():void};
 selection():readonly string[];
 notify():void;
 quarantine(message:string):void;
 /** While the toolbar drawing lock is on, the Eraser treats every drawing as locked
  * and removes nothing. Injected by the drawingUtility port; absent means off. */
 drawingsLocked?():boolean;
}
function diagnostic(error:unknown):string {
 if(typeof error==='string')return error.slice(0,900);
 try{const field=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message'):undefined;
  if(field&&Object.hasOwn(field,'value')&&typeof field.value==='string')return field.value.slice(0,900);
 }catch{/* Error formatting has no publication authority. */}
 return 'Details are unavailable.';
}
function syncVoid(value:unknown,label:string):void{if(value!==undefined)throw Error(label+' must finish synchronously.');}
export class DrawingErasePublicationError extends Error {
 constructor(readonly receipt:DrawingEraseReceipt,readonly causes:readonly unknown[],readonly nativeResult?:NativeDrawingRemovalResult){
  super((receipt.workspaceAcknowledged?'The drawing was removed, but chart updates did not finish.':receipt.canonicalAccepted?'The chart changed, but the workspace did not acknowledge removal.':receipt.nativeState==='forwarded-incomplete'?'Drawing removal did not finish.':'The drawing was not removed.')+' '+causes.slice(0,12).map(diagnostic).join(' | '));
  this.name='DrawingErasePublicationError';
 }
}

/** One admitted hit. A private pointer/router owner supplies action authority. */
export function createDrawingErasePublisher(host:DrawingErasePublicationHost){
 type Frame={phase:'staging'|'acknowledged'|'failed';candidate:Row;assertValues?:()=>void;assertFailedOwner?:()=>void};
 let busy=false,frame:Frame|undefined;
 return{
  captureReadOnly():Row|undefined{
   const current=frame;if(!current)return undefined;
   if(current.phase==='failed'){
    // An old failed frame cannot block a replacement source/document. The
    // still-owned failed chart remains unsavable until it is reopened.
    try{current.assertFailedOwner!();}catch{if(frame===current)frame=undefined;return undefined;}
    throw Error('Drawing removal failed before a safe chart capture. Reopen this chart.');
   }
   if(current.phase!=='acknowledged'||!current.assertValues)throw Error('Drawing removal is still staging; an unacknowledged state cannot be saved.');
   current.assertValues();const copy=structuredClone(current.candidate);current.assertValues();return copy;
  },
  erase(id:string,assertActionOwner:()=>void):DrawingEraseReceipt{
   if(busy)throw Error('Another drawing removal is already finishing.');
   if(frame?.phase==='failed'){const failed=frame;try{failed.assertFailedOwner!();}catch{if(frame===failed)frame=undefined;}if(frame===failed)throw Error('Reopen the chart before another drawing removal.');}
   busy=true;
   let nativeState:DrawingEraseReceipt['nativeState']='before-forward',canonicalAccepted=false,workspaceAcknowledged=false,observersComplete=false;
   let canonical:OwnedDrawingRemoveBatch|undefined,acceptedCanonical:OwnedDrawingEditAcceptance|undefined;
   let native:NativeDrawingRemoval|undefined,acceptedNative:NativeDrawingAcceptedValueOwner|undefined,nativeResult:NativeDrawingRemovalResult|undefined;
   let hold:{release():void}|undefined,staged=false,rollbackFailed=false,currentFrame:Frame|undefined;
   let assertAction:(()=>void)|undefined,assertSource:(()=>void)|undefined;
   const failures:unknown[]=[],ids:readonly string[]=typeof id==='string'?Object.freeze([id]):Object.freeze([]);
   const receipt=():DrawingEraseReceipt=>Object.freeze({ids,nativeState,canonicalAccepted,workspaceAcknowledged,observersComplete});
   try{
    if(typeof id!=='string'||!id||id.length>4096)throw Error('Eraser requires one bounded drawing identity.');
    host.assertMutable();assertActionOwner();
    const source=host.captureSource();assertSource=source;
    const command=host.captureWorkspace(),opening=host.document.captureReadOnlyOwner();
    const action=()=>{source();command.assertCurrent();assertActionOwner();host.assertMutable();source();command.assertCurrent();};assertAction=action;
    const emptySelection=()=>{const selected=host.selection();action();if(!Array.isArray(selected)||selected.length)throw Error('Eraser requires an empty drawing selection.');};
    action();opening.assertCurrent();emptySelection();
    const before=host.document.serialize();opening.assertCurrent();action();
    if(!Array.isArray(before.drawings)||before.drawings.length>10000)throw Error('The canonical drawing collection is unavailable.');
    const matches=(before.drawings as Row[]).filter(row=>row.id===id);
    if(matches.length!==1)throw Error('The erased drawing no longer has an exact canonical identity.');
    const original=matches[0];
    if(original.locked===true||original.visible===false||host.drawingsLocked?.()===true)throw Error('Locked or hidden drawings cannot be erased.');
    host.assertEligible(original);opening.assertCurrent();action();
    const projection=host.captureProjection();opening.assertCurrent();action();projection.assertCurrent();
    const sourceNative=captureNativeDrawingLease(host.facade,[id]);
    const projected=projection.project({version:before.version,drawings:[original]});
    const checkOriginal=()=>{
     opening.assertCurrent();action();projection.assertCurrent();sourceNative.assertCurrent();
     const actual=sourceNative.read();
     if(projected.length!==1||actual.length!==1||projected[0].id!==id||actual[0].id!==id)throw Error('The erased drawing has no exact native projection.');
     assertNativeDrawingMatchesCanonical(projected[0],actual[0]);sourceNative.assertUnchangedOutsideTargets();
     host.assertEligible(original);opening.assertCurrent();action();projection.assertCurrent();emptySelection();
    };
    checkOriginal();
    canonical=host.document.prepareOwnedRemoveBatch([original]);
    const candidate=canonical.readCandidate(),workspace=command.prepare(structuredClone(candidate));
    if(!workspace||typeof workspace.assertCurrent!=='function'||typeof workspace.publish!=='function'||typeof (workspace as any).then==='function')throw Error('Synchronous workspace preparation is unavailable.');
    canonical.assertCurrent();action();workspace.assertCurrent();checkOriginal();
    currentFrame={phase:'staging',candidate};frame=currentFrame;
    hold=host.begin();canonical.assertCurrent();action();workspace.assertCurrent();
    const values=()=>{
     source();projection.assertCurrent();
     if(!acceptedCanonical){action();workspace.assertCurrent();}
     source();projection.assertCurrent();
     if(acceptedCanonical)acceptedCanonical.assertCurrent();else canonical!.assertCurrent();
    };
    native=prepareNativeDrawingRemoval(host.facade,projected,{assertCurrent:values,assertWorkspaceCapacity(){workspace.assertCurrent();action();}});
    checkOriginal();canonical.stage();staged=true;
    nativeState='forwarded-incomplete';nativeResult=native.remove();nativeState=nativeResult.state;
    if(nativeResult.state!=='complete')throw Error(nativeResult.diagnostics.join(' | ')||'Native drawing removal was not complete.');
    native.assertCurrent();action();workspace.assertCurrent();emptySelection();
    acceptedCanonical=canonical.accept();canonicalAccepted=true;
    acceptedNative=native.captureAcceptedValueOwner();native.dispose();native=undefined;
    const assertValues=()=>{values();acceptedNative!.assertCurrent();};assertValues();
    currentFrame.assertValues=assertValues;
    action();workspace.assertCurrent();let publishing=true;
    try{
     const result=workspace.publish(()=>{
      if(!publishing||workspaceAcknowledged)throw Error('Drawing removal acknowledgement is late or repeated.');
      workspaceAcknowledged=true;currentFrame!.phase='acknowledged';
     });syncVoid(result,'Drawing removal publication');
    }finally{publishing=false;}
    if(!workspaceAcknowledged)throw Error('The workspace did not acknowledge drawing removal.');
    assertValues();command.assertCurrent();action();emptySelection();
    const release=hold;hold=undefined;syncVoid(release.release(),'Drawing notification release');
    host.notify();assertValues();command.assertCurrent();observersComplete=true;
   }catch(error){failures.push(error);}
   finally{
    if(native)try{native.dispose();}catch(error){failures.push(error);}
    if(staged&&!canonicalAccepted&&(nativeState==='before-forward'||nativeState==='not-forwarded')){
     try{assertAction?.();canonical!.assertCurrent();canonical!.rollback();}catch(error){rollbackFailed=true;failures.push(error);}
    }
    if(hold)try{syncVoid(hold.release(),'Drawing notification release');}catch(error){failures.push(error);}
    if(frame===currentFrame)frame=undefined;
   }
   if(failures.length){
    const error=new DrawingErasePublicationError(receipt(),failures,nativeResult);
    if(nativeState==='forwarded-incomplete'||canonicalAccepted||rollbackFailed)try{
     const owned=()=>{assertSource?.();if(canonicalAccepted)acceptedCanonical!.assertCurrent();else canonical!.assertCurrent();assertSource?.();if(canonicalAccepted)acceptedCanonical!.assertCurrent();else canonical!.assertCurrent();};
     owned();
     if(currentFrame){currentFrame.phase='failed';currentFrame.assertFailedOwner=owned;frame=currentFrame;}
     assertAction?.();owned();host.quarantine(error.message);
    }catch{/* A replacement action/source/document cannot receive the old quarantine. */}
    busy=false;throw error;
   }
   busy=false;return receipt();
  }
 };
}
