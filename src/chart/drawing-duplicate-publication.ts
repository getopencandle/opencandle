import type {SerializedDrawing} from '@luxalgo/vela';
import type {LosslessDrawingDocument,OwnedDrawingEditAcceptance,OwnedDrawingInsertBatch} from './contracts';
import {captureNativeDrawingLease} from './drawing-template-batch';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';
import {prepareNativeDrawingInsert,type NativeDrawingInsert,type NativeDrawingAcceptedValueOwner,type NativeDrawingInsertResult} from './drawing-duplicate-native';
import type {DrawingDuplicateReceipt} from './drawing-command-router';

type Row=Record<string,unknown>;
export interface PreparedDrawingDuplicateWorkspace {
 assertCurrent():void;
 /** The marker runs immediately after the in-memory workspace/history write. */
 publish(markWorkspaceAccepted:()=>void):void;
}
export interface DrawingDuplicateWorkspaceCommand {
 assertCurrent():void;
 prepare(candidate:Readonly<Row>):PreparedDrawingDuplicateWorkspace;
}
export interface DrawingDuplicateWorkspaceHost {
 capture(purpose?:'duplicate'|'erase'):DrawingDuplicateWorkspaceCommand;
 history(direction:'undo'|'redo',assertActionOwner:()=>void):void;
 historyStatus():{canUndo:boolean;canRedo:boolean};
}
export interface DrawingDuplicateProjection {
 readonly occupiedIds:readonly string[];
 readonly stackingFloor:number;
 assertCurrent():void;
 assertFreshIds(ids:readonly string[]):void;
 project(document:Row):SerializedDrawing[];
}
export interface DrawingDuplicatePublicationHost {
 document:LosslessDrawingDocument;
 facade:object;
 captureSource():()=>void;
 captureWorkspace():DrawingDuplicateWorkspaceCommand;
 captureProjection():DrawingDuplicateProjection;
 assertMutable():void;
 makeId():string;
 begin():{release():void};
 reserve(ids:readonly string[]):void;
 select(ids:readonly string[]):void;
 selection():readonly string[];
 notify():void;
 quarantine(message:string):void;
}

function diagnostic(error:unknown):string {
 if(typeof error==='string')return error.slice(0,900);
 try{const field=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message'):undefined;
  if(field&&Object.hasOwn(field,'value')&&typeof field.value==='string')return field.value.slice(0,900);
 }catch{/* Error formatting cannot replace an accepted outcome. */}
 return 'Details are unavailable.';
}
function ids(input:readonly string[]):string[] {
 if(!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype||input.length<1||input.length>128||Reflect.ownKeys(input).length!==input.length+1)throw Error('Select between 1 and 128 unique drawing IDs.');
 const result:string[]=[],seen=new Set<string>();
 for(let index=0;index<input.length;index++){
  const field=Object.getOwnPropertyDescriptor(input,String(index));
  if(!field||!Object.hasOwn(field,'value')||!field.enumerable||typeof field.value!=='string'||!field.value||field.value.length>4096||seen.has(field.value))throw Error('Drawing IDs must be dense, unique data values.');
  seen.add(field.value);result.push(field.value);
 }
 return result;
}
function syncVoid(value:unknown,operation:string):void {
 if(value!==undefined)throw Error(operation+' must finish synchronously.');
}
export class DrawingDuplicatePublicationError extends Error {
 constructor(readonly receipt:DrawingDuplicateReceipt,readonly causes:readonly unknown[],readonly nativeResult?:NativeDrawingInsertResult){
  super((receipt.workspaceAcknowledged?'Copies reached the workspace, but chart updates did not finish.':receipt.canonicalAccepted?'Copies reached the chart, but the workspace did not acknowledge them.':receipt.nativeState==='forwarded-incomplete'?'Drawing copies were only partly applied.':'Drawing duplication was not applied.')+' '+causes.slice(0,12).map(diagnostic).join(' | '));
  this.name='DrawingDuplicatePublicationError';
 }
}

/** One synchronous command. No rollback is invented after native forwarding. */
export function createDrawingDuplicatePublisher(host:DrawingDuplicatePublicationHost){
 type Frame={phase:'staging'|'accepted';candidate:Row;assertValues?:()=>void};
 let busy=false,frame:Frame|undefined;
 return {
  captureReadOnly():Row|undefined {
   const current=frame;if(!current)return undefined;
   if(current.phase!=='accepted'||!current.assertValues)throw Error('Drawing duplication is still staging; saving its partial state is unavailable.');
   current.assertValues();const copy=structuredClone(current.candidate);current.assertValues();return copy;
  },
  duplicate(input:readonly string[],assertActionOwner:()=>void):DrawingDuplicateReceipt {
   if(busy)throw Error('Another drawing command is already finishing.');
   busy=true;
   let nativeState:DrawingDuplicateReceipt['nativeState']='before-forward',canonicalAccepted=false,workspaceAcknowledged=false,observersComplete=false;
   let copyIds:string[]=[],canonical:OwnedDrawingInsertBatch|undefined,acceptedCanonical:OwnedDrawingEditAcceptance|undefined;
   let native:NativeDrawingInsert|undefined,acceptedNative:NativeDrawingAcceptedValueOwner|undefined,nativeResult:NativeDrawingInsertResult|undefined;
   let hold:{release():void}|undefined,staged=false,currentFrame:Frame|undefined;
   let assertAction:(()=>void)|undefined;
   const failures:unknown[]=[];
   const receipt=():DrawingDuplicateReceipt=>Object.freeze({ids:Object.freeze([...copyIds]),nativeState,canonicalAccepted,workspaceAcknowledged,observersComplete});
   try{
    const selected=ids(input);
    host.assertMutable();assertActionOwner();
    const source=host.captureSource(),command=host.captureWorkspace(),opening=host.document.captureReadOnlyOwner();
    const action=()=>{source();command.assertCurrent();assertActionOwner();host.assertMutable();source();command.assertCurrent();};assertAction=action;
    action();opening.assertCurrent();
    const before=host.document.serialize();opening.assertCurrent();action();
    if(!Array.isArray(before.drawings)||before.drawings.length>10000)throw Error('The canonical drawing collection is unavailable.');
    const all=before.drawings as Row[],byId=new Map<string,Row>();
    for(const row of all){if(typeof row.id!=='string'||byId.has(row.id))throw Error('Canonical drawing identities are ambiguous.');byId.set(row.id,row);}
    const originals=selected.map(id=>{const row=byId.get(id);if(!row)throw Error('A selected drawing no longer exists.');return row;});
    const projection=host.captureProjection();opening.assertCurrent();action();projection.assertCurrent();
    const sourceNative=captureNativeDrawingLease(host.facade,selected);
    const originalProjection=projection.project({version:before.version,drawings:originals});
    const checkOriginals=()=>{
     opening.assertCurrent();action();projection.assertCurrent();sourceNative.assertCurrent();
     const actual=sourceNative.read();
     if(actual.length!==originals.length||originalProjection.length!==originals.length)throw Error('A drawing has no exact native projection.');
     for(let index=0;index<originals.length;index++){
      if(originalProjection[index].id!==selected[index]||actual[index].id!==selected[index])throw Error('Drawing projection order changed.');
      assertNativeDrawingMatchesCanonical(originalProjection[index],actual[index]);
     }
     sourceNative.assertUnchangedOutsideTargets();opening.assertCurrent();action();projection.assertCurrent();
    };
    checkOriginals();
    const occupied=new Set([...byId.keys(),...projection.occupiedIds]);
    let floor=projection.stackingFloor;
    for(const row of all){if(typeof row.zIndex==='number'){if(!Number.isFinite(row.zIndex))throw Error('Drawing stacking is unavailable.');floor=Math.max(floor,row.zIndex);}}
    floor=Math.max(0,Math.ceil(floor));
    if(!Number.isSafeInteger(floor)||floor>Number.MAX_SAFE_INTEGER-selected.length)throw Error('Drawing stacking capacity is exhausted.');
    for(let index=0;index<selected.length;index++){
     let allocated:string|undefined;
     for(let attempt=0;attempt<8;attempt++){
      const candidate=host.makeId();
      if(typeof candidate!=='string'||!candidate||candidate.length>200||! /^[A-Za-z0-9:_-]+$/.test(candidate)||['__proto__','constructor','prototype'].includes(candidate))throw Error('The drawing ID source returned an invalid ID.');
      if(!occupied.has(candidate)){allocated=candidate;occupied.add(candidate);break;}
     }
     if(!allocated)throw Error('The drawing ID source repeatedly collided.');copyIds.push(allocated);
    }
    // One proof after the whole allocation batch replaces two O(N) proofs per attempt (quadratic at 128 copies); the check is a state check, so any ID-source mutation is still caught before use.
    checkOriginals();
    const copies=originals.map((row,index)=>({...structuredClone(row),id:copyIds[index],zIndex:floor+index+1}));
    checkOriginals();projection.assertFreshIds(copyIds);checkOriginals();
    const projected=projection.project({version:before.version,drawings:copies});checkOriginals();
    if(projected.length!==copies.length||projected.some((row,index)=>row.id!==copyIds[index]))throw Error('Copied drawings have no exact native pane projection.');
    canonical=host.document.prepareOwnedInsertBatch(originals,copies);
    const candidate=canonical.readCandidate(),workspace=command.prepare(structuredClone(candidate));
    if(!workspace||typeof workspace.assertCurrent!=='function'||typeof workspace.publish!=='function'||typeof (workspace as any).then==='function')throw Error('Synchronous workspace preparation is unavailable.');
    canonical.assertCurrent();action();workspace.assertCurrent();checkOriginals();
    currentFrame={phase:'staging',candidate};frame=currentFrame;
    hold=host.begin();canonical.assertCurrent();action();workspace.assertCurrent();
    const values=()=>{
     source();projection.assertCurrent();
     if(!acceptedCanonical){action();workspace.assertCurrent();}
     source();projection.assertCurrent();
     if(acceptedCanonical)acceptedCanonical.assertCurrent();else canonical!.assertCurrent();
    };
    native=prepareNativeDrawingInsert(host.facade,projected,{assertCurrent:values,assertWorkspaceCapacity(){workspace.assertCurrent();action();projection.assertFreshIds(copyIds);}});
    checkOriginals();canonical.stage();staged=true;
    // The helper normally returns an exact forwarding result. An unexpected
    // throw from that call cannot grant speculative rollback authority.
    nativeState='forwarded-incomplete';nativeResult=native.insert();nativeState=nativeResult.state;
    if(nativeResult.state!=='complete')throw Error(nativeResult.diagnostics.join(' | ')||'Native drawing insertion was not complete.');
    native.assertCurrent();action();workspace.assertCurrent();
    acceptedCanonical=canonical.accept();canonicalAccepted=true;
    acceptedNative=native.captureAcceptedValueOwner();native.dispose();native=undefined;
    // The native receipt calls values and finishes with private structural
    // checks. No callback-bearing assertion may follow that final proof.
    const assertValues=()=>{values();acceptedNative!.assertCurrent();};assertValues();
    currentFrame.phase='accepted';currentFrame.assertValues=assertValues;
    action();workspace.assertCurrent();
    let publishing=true;
    try{
     const result=workspace.publish(()=>{
      if(!publishing||workspaceAcknowledged)throw Error('Drawing workspace acknowledgement is late or repeated.');
      // The trusted caller has already written the canonical workspace/history.
      // Record that fact before any subsequent assertion can throw.
      workspaceAcknowledged=true;
     });
     syncVoid(result,'Drawing workspace publication');
    }finally{publishing=false;}
    if(!workspaceAcknowledged)throw Error('The workspace did not acknowledge the drawing copies.');
    assertValues();command.assertCurrent();action();
    host.reserve((candidate.drawings as Row[]).map(row=>String(row.id)));assertValues();command.assertCurrent();action();
    host.select(copyIds);
    const selectedAfter=host.selection();
    if(selectedAfter.length!==copyIds.length||selectedAfter.some((id,index)=>id!==copyIds[index]))throw Error('Copied drawing selection did not complete.');
    assertValues();command.assertCurrent();
    const release=hold;hold=undefined;syncVoid(release.release(),'Drawing notification release');
    host.notify();assertValues();command.assertCurrent();observersComplete=true;
   }catch(error){failures.push(error);}
   finally{
    if(native)try{native.dispose();}catch(error){failures.push(error);}
    if(staged&&!canonicalAccepted&&(nativeState==='before-forward'||nativeState==='not-forwarded')){
     try{assertAction?.();canonical!.assertCurrent();canonical!.rollback();}catch(error){failures.push(error);}
    }
    if(hold)try{syncVoid(hold.release(),'Drawing notification release');}catch(error){failures.push(error);}
    if(frame===currentFrame)frame=undefined;
    busy=false;
   }
   if(failures.length){
    const error=new DrawingDuplicatePublicationError(receipt(),failures,nativeResult);
    if(nativeState==='forwarded-incomplete'||canonicalAccepted)try{
     assertAction?.();
     // Source identity alone does not prove that this canonical document still
     // belongs to the command. Even an equal-value supported load retires it.
     if(canonicalAccepted)acceptedCanonical!.assertCurrent();else canonical!.assertCurrent();
     host.quarantine(error.message);
    }catch{/* A replacement document or action cannot receive the old quarantine. */}
    throw error;
   }
   return receipt();
  }
 };
}

/** The refusal when a pasted drawing type or source is not available in this chart. */
export const DRAWING_PASTE_UNAVAILABLE='Some copied drawings are not available in this chart and were not pasted.';
/** Minimal LV clipboard port (drawing-clipboard.ts). It holds process memory only; the system clipboard is never read or written. */
export interface DrawingClipboardPort {
 copy(rows:readonly Row[]):void;
 paste(known:(type:string)=>boolean):readonly Row[]|{rows:readonly Row[];refused?:boolean};
}
export interface DrawingPasteRouteHost {
 clipboard:DrawingClipboardPort;
 canonical():readonly Row[];
 known(type:string):boolean;
 /** The owned Duplicate route; paste is exactly one of its steps. */
 duplicate(ids:readonly string[],assertActionOwner:()=>void):DrawingDuplicateReceipt;
}
/** Copy and paste over the owned Duplicate route. Copy writes no history. Paste inserts copies with fresh ids at the same time and price, selects them, and is one history step.
 * The owned insertion lease requires each source row to still exist unchanged, so paste copies the source's current canonical value; a source deleted since Copy is refused with the unavailable text. */
export function createDrawingPasteRoute(host:DrawingPasteRouteHost){
 return {
  copy(ids:readonly string[],assertActionOwner:()=>void):void {
   assertActionOwner();
   const byId=new Map(host.canonical().map(row=>[String(row.id),row]));
   const rows=ids.map(id=>{const row=byId.get(id);if(!row)throw Error('A selected drawing no longer exists.');return structuredClone(row);});
   assertActionOwner();host.clipboard.copy(rows);
  },
  paste(assertActionOwner:()=>void):DrawingDuplicateReceipt {
   assertActionOwner();
   const result=host.clipboard.paste(host.known),plain=Array.isArray(result),rows=(plain?result:(result as {rows:readonly Row[]}).rows) as readonly Row[],refused=!plain&&(result as {refused?:boolean}).refused===true;
   if(!rows.length&&!refused)throw Error('Nothing has been copied yet.');
   const byId=new Map(host.canonical().map(row=>[String(row.id),row]));
   if(refused||rows.some(row=>typeof row.id!=='string'||!host.known(String(row.type))||!byId.has(row.id)))throw Error(DRAWING_PASTE_UNAVAILABLE);
   return host.duplicate(rows.map(row=>String(row.id)),assertActionOwner);
  },
 };
}
