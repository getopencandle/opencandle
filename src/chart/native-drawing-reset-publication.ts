import type {LosslessDrawingDocument,OwnedDrawingEditAcceptance} from './contracts';
import type {NativeDrawingResetAcceptance,NativeDrawingResetPublication} from './native-drawing-reset';
import {validateDrawingPaneBinding} from './drawing-document-bindings';

export class NativeDrawingResetPublicationError extends AggregateError{
 readonly accepted=true;
 constructor(errors:unknown[]){super(errors,'Drawing Reset was accepted, but workspace publication did not finish. Reopen the chart before editing again.');}
}
export interface NativeDrawingResetPublicationHost{
 document:LosslessDrawingDocument;
 assertMutable():void;
 begin():{release():void};
 notify():void;
 quarantine(message:string):void;
}

/** The synchronous accepted save path avoids reconciling the document that it is saving.
 * Authority remains in private native/canonical receipts, never in public DTO values. */
export function createNativeDrawingResetPublisher(host:NativeDrawingResetPublicationHost){
 type Frame={phase:'staging'|'notifying';native?:NativeDrawingResetAcceptance;canonical?:OwnedDrawingEditAcceptance};
 let frame:Frame|undefined;
 const assertAccepted=(current:Frame)=>{
  if(frame!==current||current.phase!=='notifying'||!current.native||!current.canonical)throw Error('Drawing Reset save frame is not accepted.');
  current.canonical.assertCurrent();current.native.assertValueOwner();current.canonical.assertCurrent();
 };
 return{
  captureReadOnly():Record<string,unknown>|undefined{
   const current=frame;if(!current||current.phase!=='notifying')return undefined;
   assertAccepted(current);const result=host.document.serialize();assertAccepted(current);return result;
  },
  publish(batch:NativeDrawingResetPublication):void{
   if(frame)throw Error('Drawing Reset publication is already active.');
   host.assertMutable();batch.assertActionOwner();
   for(const row of batch.expected){if(!Object.hasOwn(row,'lvPaneBinding'))throw Error('Drawing Reset requires an existing portable pane binding.');validateDrawingPaneBinding(row.lvPaneBinding);}
   const lease=host.document.prepareOwnedEditBatch(batch.expected,batch.next),current:Frame={phase:'staging'};frame=current;
   let hold:ReturnType<NativeDrawingResetPublicationHost['begin']>|undefined,staged=false,accepted=false;
   const failures:unknown[]=[];
   try{
    hold=host.begin();host.assertMutable();batch.assertActionOwner();lease.stage();staged=true;
    const native=batch.forward(()=>{if(current.canonical)current.canonical.assertCurrent();else lease.assertCurrent();});
    native.assertValueOwner();current.canonical=lease.accept();current.native=native;accepted=true;
    native.assertValueOwner();
    const release=hold;hold=undefined;release.release();
    current.phase='notifying';assertAccepted(current);host.notify();assertAccepted(current);
   }catch(error){
    failures.push(error);
    if(staged&&!accepted){
     try{batch.assertActionOwner();lease.assertCurrent();if(!batch.inspectProgress().forwardStarted)current.canonical=lease.rollback();}
     catch(recovery){failures.push(recovery);}
    }
   }finally{
    if(hold)try{hold.release();}catch(error){failures.push(error);}
    if(frame===current)frame=undefined;
   }
   if(failures.length){
    if(accepted){const error=new NativeDrawingResetPublicationError(failures);try{batch.assertActionOwner();host.quarantine(error.message);}catch{/* A replacement action or source remains authoritative. */}throw error;}
    throw failures.length===1?failures[0]:new AggregateError(failures,'Drawing Reset failed before complete acceptance.');
   }
  }
 };
}
