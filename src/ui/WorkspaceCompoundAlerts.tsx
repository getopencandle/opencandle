import React,{useEffect,useLayoutEffect,useRef} from 'react';
import {CompoundAlertObserver,type CompoundRootWriter,type CompoundRootOwner,type CompoundChartInputPort} from './compound-alert-observer';
import type {CompoundAlertBook,CompoundBookEntry} from './compound-alert-book';
import type {CompoundAlertStore,CompoundContext} from '../domain/compound-alerts';

export interface CompoundRuntimeControl {
 readonly enabled:boolean;readonly suspended:boolean;
 /** Reads the actual workspace/storage hold, including the gap before render. */
 readonly isHeld?:()=>boolean;
 readonly readActionTime:()=>number;
 readonly onDiagnostic?:(id:string,message:string|null)=>void;
}
interface RuntimeEntry {
 generation:object;observer:CompoundAlertObserver;target:{value:CompoundRootWriter|null};
 chart:WeakRef<CompoundChartInputPort>;store:WeakRef<CompoundAlertStore>;revision:number;context:Readonly<CompoundContext>|null;
}
const eligible=(entry:CompoundBookEntry)=>entry.state.status==='active'||entry.state.status==='waiting-for-data';
interface RuntimeTarget {readonly id:string;readonly generation:object;readonly eligible:boolean}
interface RuntimeDiagnostic {readonly generation:object;readonly message:string|null}
const targetOf=(entry:CompoundBookEntry):RuntimeTarget=>({id:entry.id,generation:entry.generation,eligible:eligible(entry)});
// Separate factory: no refresh activation/owner/entry/rows are captured.
const forwardingWriter=(target:{value:CompoundRootWriter|null}):CompoundRootWriter=>({read:()=>target.value?.read()??null,publish:(expected,next,acknowledge,binding)=>target.value?.publish(expected,next,acknowledge,binding)??false});
const sameContext=(a:Readonly<CompoundContext>|null,b:Readonly<CompoundContext>|null)=>a===b||!!a&&!!b&&a.instrumentId===b.instrumentId&&a.sourceFamily===b.sourceFamily&&a.interval===b.interval&&a.session===b.session&&a.basis===b.basis;
/** One serial source acquisition across the entire book. No rows, readiness or
 * source receipt are supplied here: each real observer reads its book writer. */
export class CompoundAlertRuntime {
 #book:CompoundAlertBook;#control:()=>CompoundRuntimeControl;#isCurrent:()=>boolean;#entries=new Map<string,RuntimeEntry>();#known=new Map<string,RuntimeTarget>();
 #running=false;#closed=false;#cut=0;#unsubscribe:()=>void;#diagnostics=new Map<string,RuntimeDiagnostic>();#hostDiagnostic:string|null=null;
 constructor(book:CompoundAlertBook,control:()=>CompoundRuntimeControl,isCurrent:()=>boolean=()=>true){
  this.#book=book;this.#control=control;this.#isCurrent=isCurrent;
  this.#unsubscribe=book.subscribe(event=>{
   // Observation retains generation. Reconcile immediately on every structural
   // change, including remove/adopt whose event has no single replacement row.
   if(event.kind!=='observation')this.#reconcile();
   else if(event.entry){this.#known.set(event.entry.id,targetOf(event.entry));if(!eligible(event.entry))this.#retire(event.entry.id);}
  });
 }
 #retire(id:string){const entry=this.#entries.get(id);if(entry){this.#entries.delete(id);entry.target.value=null;try{entry.observer.dispose();}finally{this.#clearDiagnostic(id,entry.generation);}}}
 #reconcile():readonly RuntimeTarget[]{
  const rows=this.#book.entries().map(targetOf),live=new Map(rows.map(row=>[row.id,row]));this.#known=live;
  for(const [id,entry] of this.#entries){const next=live.get(id);if(!next||next.generation!==entry.generation||!next.eligible)this.#retire(id);}
  for(const [id,diagnostic] of [...this.#diagnostics]){const next=live.get(id);if(!next||next.generation!==diagnostic.generation||!next.eligible)this.#clearDiagnostic(id,diagnostic.generation);}
  return rows;
 }
 #held():boolean{const c=this.#control();return !this.#isCurrent()||!c.enabled||c.suspended||c.isHeld?.()===true;}
 #ownerMatches(entry:RuntimeEntry,owner:CompoundRootOwner,context:Readonly<CompoundContext>|null){return entry.chart.deref()===owner.chart&&entry.store.deref()===owner.store&&entry.revision===owner.definitionRevision&&sameContext(entry.context,context);}
 #entryFor(row:RuntimeTarget):RuntimeEntry|null{
  const before=this.#book.entry(row.id);if(!before||before.generation!==row.generation||!eligible(before)||this.#held())return null;
  let entry=this.#entries.get(row.id),writer=entry?.target.value??this.#book.createWriter(row.id);
  if(this.#held())return null;let owner=writer.read();if(this.#held())return null;
  // A writer can permanently expire on a scalar-alert/paper ref replacement.
  // Acquire its replacement while idle; never repair an in-flight old cut.
  const refresh=!!entry&&!owner;
  if(refresh){writer=this.#book.createWriter(row.id);if(this.#held())return null;owner=writer.read();if(this.#held())return null;}
  if(!owner)return null;
  const context=this.#book.describeCurrentSource();if(this.#held()||this.#book.entry(row.id)!==before)return null;
  // A temporarily unavailable context is not evidence for baseline-preserving
  // writer replacement. The existing valid observer can still publish its real
  // unavailable health cut through the ordinary acquisition path.
  if(refresh&&!context)return null;
  if(entry&&context&&!this.#ownerMatches(entry,owner,context)){this.#retire(row.id);entry=undefined;}
  if(entry&&refresh){
   if(!this.#ownerMatches(entry,owner,context))return null;
   entry.observer.cancelPendingForWorkspace();
   if(this.#held()||this.#entries.get(row.id)!==entry||this.#book.entry(row.id)!==before)return null;
   const finalOwner=writer.read();if(this.#held())return null;
   const finalContext=this.#book.describeCurrentSource();
   if(this.#held()||!finalOwner||!finalContext||this.#entries.get(row.id)!==entry||this.#book.entry(row.id)!==before||!this.#ownerMatches(entry,finalOwner,finalContext))return null;
   const sealedOwner=writer.read();
   if(this.#held()||!sealedOwner||this.#entries.get(row.id)!==entry||this.#book.entry(row.id)!==before||!this.#ownerMatches(entry,sealedOwner,finalContext))return null;
   if(this.#held()||this.#book.entry(row.id)!==before)return null;
   entry.target.value=writer;
  }
  if(!entry){
   const target:{value:CompoundRootWriter|null}={value:writer},forward=forwardingWriter(target);
   entry={generation:row.generation,observer:new CompoundAlertObserver(forward),target,chart:new WeakRef(owner.chart),store:new WeakRef(owner.store),revision:owner.definitionRevision,context};
   if(this.#held()||this.#book.entry(row.id)!==before){entry.target.value=null;entry.observer.dispose();return null;}
   this.#entries.set(row.id,entry);
  }
  return entry;
 }
 refreshControl():void{
  if(this.#closed)return;const c=this.#control();
  if(!c.enabled){this.#cut++;for(const id of [...this.#entries.keys()])this.#retire(id);this.#clearDiagnostics();}
  else if(c.suspended||c.isHeld?.()===true){this.#cut++;for(const entry of this.#entries.values())entry.observer.cancelPendingForWorkspace();}
 }
 async tick():Promise<void>{
  if(this.#closed||this.#running)return;
  try{if(this.#held()){this.refreshControl();return;}}catch(error){this.#report('',error);return;}
  this.#running=true;const cut=this.#cut;
  try{
   const rows=this.#reconcile();if(this.#hostDiagnostic!==null){this.#hostDiagnostic=null;this.#notifyDiagnostic('',null);}
   for(const row of rows){
    if(this.#closed||cut!==this.#cut||this.#held())break;
    const known=this.#known.get(row.id);if(!known||known.generation!==row.generation||!known.eligible)continue;
    let entry:RuntimeEntry|null|undefined;
    try{
     entry=this.#entryFor(row);if(!entry)continue;
     const publication=await entry.observer.prepare(this.#control().readActionTime());
     try{
      if(this.#closed||cut!==this.#cut||this.#entries.get(row.id)!==entry||this.#known.get(row.id)?.generation!==row.generation||this.#held()){publication.rollback();continue;}
      // All numerical/producer checks and the final canonical collection CAS
      // are owned by the opaque observer publication, not this scheduler.
      if(!publication.commit())this.#setDiagnostic(row.id,'The alert changed before it could be saved. Try again.',row.generation);
      else this.#setDiagnostic(row.id,null,row.generation);
     }catch(error){publication.rollback();throw error;}
    }catch(error){if(!this.#closed&&cut===this.#cut&&this.#known.get(row.id)?.generation===row.generation)this.#report(row.id,error,row.generation);}
   }
  }catch(error){if(!this.#closed)this.#report('',error);}
  finally{this.#running=false;}
 }
 #notifyDiagnostic(id:string,message:string|null){try{if(this.#isCurrent())this.#control().onDiagnostic?.(id,message);}catch{/* display does not own a source lease or repeat an already-recorded edge */}}
 #setDiagnostic(id:string,message:string|null,generation:object){
  if(this.#closed||!this.#isCurrent())return;const current=this.#book.entry(id);if(!current||current.generation!==generation||!eligible(current))return;
  const previous=this.#diagnostics.get(id);if(previous?.generation===generation&&previous.message===message)return;
  this.#diagnostics.set(id,{generation,message});this.#notifyDiagnostic(id,message);
 }
 #clearDiagnostic(id:string,generation:object){const previous=this.#diagnostics.get(id);if(!previous||previous.generation!==generation)return;this.#diagnostics.delete(id);if(previous.message!==null)this.#notifyDiagnostic(id,null);}
 #clearDiagnostics(){for(const [id,diagnostic] of [...this.#diagnostics])this.#clearDiagnostic(id,diagnostic.generation);if(this.#hostDiagnostic!==null){this.#hostDiagnostic=null;this.#notifyDiagnostic('',null);}}
 #report(id:string,error:unknown,generation?:object){
  let message='Compound observation is unavailable.';try{const text=error instanceof Error?error.message:String(error);if(text)message=text.slice(0,512);}catch{/* Keep the bounded generic refusal. */}
  try{
   if(generation)this.#setDiagnostic(id,message,generation);
   else if(!this.#closed&&this.#isCurrent()&&this.#hostDiagnostic!==message){this.#hostDiagnostic=message;this.#notifyDiagnostic(id,message);}
  }catch{/* unknown error formatting cannot escape the owned runtime */}
 }
 dispose():void{if(this.#closed)return;this.#closed=true;this.#cut++;this.#unsubscribe();for(const id of [...this.#entries.keys()])this.#retire(id);this.#known.clear();this.#clearDiagnostics();}
}

export interface WorkspaceCompoundAlertsProps extends Omit<CompoundRuntimeControl,'suspended'> {
 readonly book:CompoundAlertBook;readonly suspended?:boolean;
 readonly financialGeneration:number;readonly gridGeneration:number;
 readonly financialGenerationRef:{readonly current:number};readonly gridGenerationRef:{readonly current:number};
}
/** Main-window mount only. Root supplies the actual epoch refs and hold reader.
 * No dialog, history scan, fake completion or background source is created. */
export function WorkspaceCompoundAlerts(props:WorkspaceCompoundAlertsProps){
 const latest=useRef(props);latest.current=props;
 const runtime=useRef<CompoundAlertRuntime|null>(null);
 useLayoutEffect(()=>{runtime.current?.refreshControl();},[props.enabled,props.suspended,props.isHeld]);
 useEffect(()=>{
  const book=props.book,financial=props.financialGeneration,grid=props.gridGeneration,financialRef=props.financialGenerationRef,gridRef=props.gridGenerationRef;
  const owner=new CompoundAlertRuntime(book,()=>({...latest.current,suspended:latest.current.suspended===true}),()=>latest.current.book===book&&latest.current.financialGeneration===financial&&latest.current.gridGeneration===grid&&financialRef.current===financial&&gridRef.current===grid);runtime.current=owner;
  const timer=setInterval(()=>{void owner.tick();},1000);void owner.tick();
  return()=>{clearInterval(timer);if(runtime.current===owner)runtime.current=null;owner.dispose();};
 },[props.book,props.financialGeneration,props.gridGeneration,props.financialGenerationRef,props.gridGenerationRef]);
 return null;
}
