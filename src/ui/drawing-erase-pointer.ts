import type {DrawingEraseGesture} from '../chart/drawing-command-router';

export interface DrawingErasePointerChart {
 drawings:{getMode():string|null};
 beginDrawingEraseGesture(assertPointerOwner:()=>void):DrawingEraseGesture;
}
export interface DrawingErasePointerOwner {
 chart:DrawingErasePointerChart|null;
 node:HTMLElement|null;
 source:object;
 ready:boolean;
}
export interface DrawingErasePointerSample {
 pointerId:number;pointerType:string;isPrimary:boolean;button:number;buttons:number;
 altKey:boolean;ctrlKey:boolean;metaKey:boolean;shiftKey:boolean;
 target:EventTarget|null;
 nativeEvent?:object;
 eventPhase?:number;currentTarget?:EventTarget|null;
}
export interface DrawingErasePointerHost {
 read():DrawingErasePointerOwner;
 flushViewport():void;
 report(message:string):void;
 defer(callback:()=>void):void;
}

/** Mouse sample authority shared by Grid capture and the native coordinate route.
 * Native dispatch state, not microtask ordering, bounds a sample. Browser
 * checkpoints can occur between React capture and the native canvas listener. */
export function createDrawingErasePointerBridge(host:DrawingErasePointerHost){
 type Owner={view:DrawingErasePointerOwner;pointerId:number;sample:object|null;release:boolean;lease?:DrawingEraseGesture;live:boolean;attempt:number;cleaned:boolean};
 let current:Owner|undefined,attempt=0;
 const consumed=new WeakSet<object>();
 const identity=(event:DrawingErasePointerSample)=>event.nativeEvent??event;
 const dispatching=(event:object)=>{const value=event as {eventPhase?:number;currentTarget?:unknown};return (value.eventPhase===1||value.eventPhase===2||value.eventPhase===3)&&value.currentTarget!=null;};
 const same=(view:DrawingErasePointerOwner)=>{const next=host.read();return view.ready&&next.ready&&next.chart===view.chart&&next.node===view.node&&next.source===view.source&&!!view.chart&&!!view.node&&view.node.isConnected;};
 const retire=(owner:Owner)=>{
  if(current===owner)current=undefined;owner.live=false;owner.sample=null;
  if(owner.lease&&!owner.cleaned){owner.cleaned=true;owner.lease.cancel();}
 };
 const cancel=()=>{const owner=current;if(owner)retire(owner);};
 const report=(owner:Owner,error:unknown)=>{
  if(owner.attempt!==attempt||current&&current!==owner||!same(owner.view))return;
  const message=error instanceof Error?error.message:'Eraser input is unavailable. Reopen this chart if it cannot continue.';
  if(owner.attempt===attempt&&(!current||current===owner)&&same(owner.view)&&owner.attempt===attempt&&(!current||current===owner))host.report(message);
 };
 const valid=(event:DrawingErasePointerSample,owner?:Owner)=>Number.isSafeInteger(event.pointerId)&&event.pointerId>=0&&event.pointerType==='mouse'&&event.isPrimary&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&(!owner||event.pointerId===owner.pointerId);
 const stamp=(owner:Owner,event:DrawingErasePointerSample,release:boolean,admitted?:object)=>{
  const sample=admitted??identity(event);if(!sample||typeof sample!=='object'||!dispatching(sample)||!admitted&&consumed.has(sample))throw Error('This eraser pointer event was already used.');
  consumed.add(sample);owner.sample=sample;owner.release=release;host.defer(()=>{if(owner.sample===sample&&!dispatching(sample))owner.sample=null;});
 };
 const assert=(owner:Owner)=>{
  const own=()=>{if(current!==owner||!owner.live||!owner.sample||!dispatching(owner.sample)||current!==owner||!owner.live||owner.attempt!==attempt)throw Error('This eraser pointer sample is retired or its chart input changed.');};
  own();if(!same(owner.view))throw Error('This eraser chart input changed.');own();
 };
 const stop=(owner:Owner,error:unknown)=>{try{retire(owner);}finally{report(owner,error);}};
 return{
  active:()=>!!current,
  consumed:(event:DrawingErasePointerSample)=>consumed.has(identity(event)),
  cancelPointer(event:DrawingErasePointerSample):boolean{
   const key=identity(event);if(!key||typeof key!=='object'||consumed.has(key)||!dispatching(key))return false;
   const owner=current;if(!owner||event.pointerId!==owner.pointerId)return false;
   consumed.add(key);retire(owner);return true;
  },
  down(event:DrawingErasePointerSample):'ordinary'|'erase'|'refused'{
   const admitted=identity(event);if(!admitted||typeof admitted!=='object'||consumed.has(admitted)||!dispatching(admitted))return'refused';consumed.add(admitted);
   const generation=++attempt;let owner:Owner|undefined;
   try{
    const view=host.read();owner={view,pointerId:event.pointerId,sample:null,release:false,live:true,attempt:generation,cleaned:false};
    const own=()=>{if(generation!==attempt)throw Error('Eraser input acquisition was replaced.');};
    own();const mode=view.chart?.drawings.getMode();own();
    if(mode!=='eraser'){if(current)retire(current);return'ordinary';}
    if(current)retire(current);own();
    if(!same(view)||!valid(event)||event.button!==0||event.buttons!==1||!view.node!.contains(event.target as Node)||!(event.target as Element|null)?.closest?.('.chart-canvas'))throw Error('Eraser accepts an unmodified primary mouse press on the current chart.');own();
    host.flushViewport();own();if(!same(view))throw Error('The chart input changed while finishing its prior viewport gesture.');own();
    current=owner;stamp(owner,event,false,admitted);assert(owner);
    owner.lease=view.chart!.beginDrawingEraseGesture(()=>assert(owner!));assert(owner);owner.lease.assertCurrent();assert(owner);return'erase';
   }catch(error){if(owner)stop(owner,error);return'refused';}
  },
  sample(event:DrawingErasePointerSample,release=false):boolean{
   const eventIdentity=identity(event);if(!eventIdentity||typeof eventIdentity!=='object'||consumed.has(eventIdentity)||!dispatching(eventIdentity))return false;
   const owner=current;if(!owner)return false;
   try{if(!valid(event,owner)||(release?(event.button!==0||event.buttons!==0):event.buttons!==1))throw Error('The eraser mouse gesture changed.');stamp(owner,event,release);assert(owner);owner.lease!.assertCurrent();assert(owner);return true;}
   catch(error){stop(owner,error);return false;}
  },
  finish(event:DrawingErasePointerSample):boolean{
   const owner=current;if(!owner||event.pointerId!==owner.pointerId||!owner.release||owner.sample!==identity(event)||!owner.sample||!dispatching(owner.sample))return false;
   try{assert(owner);current=undefined;owner.live=false;owner.sample=null;owner.cleaned=true;owner.lease?.finish();}
   catch(error){stop(owner,error);}return true;
  },
  cancel,
 };
}
