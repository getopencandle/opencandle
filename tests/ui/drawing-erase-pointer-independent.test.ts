import {expect,it} from 'vitest';
import {createDrawingErasePointerBridge,type DrawingErasePointerChart,type DrawingErasePointerOwner,type DrawingErasePointerSample} from '../../src/ui/drawing-erase-pointer';
import type {DrawingEraseGesture} from '../../src/chart/drawing-command-router';

// The real pointer bridge with a small node/callback model. No synthetic hit,
// native input, browser dispatch, canvas placement or packaged GUI pass is claimed.
class NodeModel {
 isConnected=true;
 constructor(readonly canvas=false,readonly parent:NodeModel|null=null){}
 contains(target:unknown):boolean{for(let node=target;node instanceof NodeModel;node=node.parent)if(node===this)return true;return false;}
 closest(selector:string):NodeModel|null{for(let node:NodeModel|null=this;node;node=node.parent)if(selector==='.chart-canvas'&&node.canvas)return node;return null;}
}
type Sample=DrawingErasePointerSample&{nativeEvent?:object};
type DispatchModel={eventPhase:number;currentTarget:unknown};
type Lease={api:DrawingEraseGesture;pointer:()=>void;live:boolean;assertions:number;cancels:number;finishes:number};
function fixture(){
 const node=new NodeModel(),canvas=new NodeModel(true,node),target=new NodeModel(false,canvas),other=new NodeModel(true);
 const deferred:Array<()=>void>=[],reports:string[]=[],leases:Lease[]=[],trace:string[]=[],events=new Set<object>();
 let reads=0,mode:string|null='eraser',readHook=()=>{},modeHook=()=>{},flushHook=()=>{},beginHook=(_lease:Lease)=>{},assertHook=(_lease:Lease)=>{},cancelHook=(_lease:Lease)=>{},finishHook=(_lease:Lease)=>{};
 const chart:DrawingErasePointerChart={drawings:{getMode(){modeHook();return mode;}},beginDrawingEraseGesture(pointer){
  pointer();let lease:Lease;const api:DrawingEraseGesture={assertCurrent(){lease.assertions++;if(!lease.live)throw Error('SYNTHETIC lease retired');pointer();assertHook(lease);pointer();},cancel(){lease.cancels++;lease.live=false;cancelHook(lease);},finish(){lease.finishes++;lease.live=false;finishHook(lease);}};
  lease={api,pointer,live:true,assertions:0,cancels:0,finishes:0};leases.push(lease);trace.push('begin');beginHook(lease);return api;
 }};
 let view:DrawingErasePointerOwner={chart,node:node as unknown as HTMLElement,source:{},ready:true};
 const bridge=createDrawingErasePointerBridge({read(){reads++;readHook();return{...view};},flushViewport(){trace.push('flush');flushHook();},report(message){reports.push(message);},defer(callback){deferred.push(callback);}});
 const raw=(eventPhase=1,currentTarget:unknown=node):DispatchModel=>{const event={eventPhase,currentTarget};events.add(event);return event;};
 const sample=(patch:Partial<Sample>={}):Sample=>{const event={pointerId:7,pointerType:'mouse',isPrimary:true,button:0,buttons:1,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,target:target as unknown as EventTarget,nativeEvent:raw(),...patch};if(event.nativeEvent&&typeof event.nativeEvent==='object')events.add(event.nativeEvent);return event;};
 const endDispatch=(event:object)=>{Object.assign(event,{eventPhase:0,currentTarget:null});};
 const once=<T extends unknown[]>(action:(...args:T)=>void,clear:()=>void)=>(...args:T)=>{clear();action(...args);};
 return{bridge,node,canvas,target,other,chart,leases,reports,trace,sample,raw,endDispatch,view:()=>view,reads:()=>reads,
  amend(patch:Partial<DrawingErasePointerOwner>){view={...view,...patch};},mode(value:string|null){mode=value;},
  flushOneMicrotask(){deferred.shift()?.();},
  // A completed modeled dispatch sets DOM phase/currentTarget before cleanup.
  // flushOneMicrotask deliberately does not, modeling a callback checkpoint
  // between capture and a later listener within that same dispatch.
  flushMicrotasks(){for(const event of events)endDispatch(event);while(deferred.length)deferred.shift()!();},
  onRead(action:()=>void){readHook=once(action,()=>{readHook=()=>{};});},
  onMode(action:()=>void){modeHook=once(action,()=>{modeHook=()=>{};});},
  onFlush(action:()=>void){flushHook=once(action,()=>{flushHook=()=>{};});},
  onBegin(action:(lease:Lease)=>void){beginHook=once(action,()=>{beginHook=()=>{};});},
  onAssert(action:(lease:Lease)=>void){assertHook=once(action,()=>{assertHook=()=>{};});},
  onCancel(action:(lease:Lease)=>void){cancelHook=once(action,()=>{cancelHook=()=>{};});},
  onFinish(action:(lease:Lease)=>void){finishHook=once(action,()=>{finishHook=()=>{};});},
 };
}

it('admits one unmodified canvas press after viewport flush and only its same-dispatch raw sample',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');expect(f.trace).toEqual(['flush','begin']);expect(f.leases).toHaveLength(1);expect(f.bridge.active()).toBe(true);
 const lease=f.leases[0];expect(()=>lease.pointer()).not.toThrow();f.flushMicrotasks();expect(()=>lease.pointer()).toThrow(/retired|sample|changed/i);
 expect(f.bridge.sample(f.sample())).toBe(true);expect(()=>lease.pointer()).not.toThrow();f.flushMicrotasks();expect(()=>lease.pointer()).toThrow();
 f.bridge.cancel();expect(f.bridge.active()).toBe(false);expect(lease.cancels).toBe(1);expect(f.reports).toEqual([]);
});

it('ordinary cursor mode does not acquire an erase lease or flush viewport state',()=>{
 const f=fixture();f.mode(null);expect(f.bridge.down(f.sample())).toBe('ordinary');expect(f.trace).toEqual([]);expect(f.leases).toEqual([]);expect(f.bridge.active()).toBe(false);expect(f.reports).toEqual([]);
});

for(const [label,patch] of [
 ['secondary mouse',{button:2,buttons:2}],['pen',{pointerType:'pen'}],['touch',{pointerType:'touch'}],['nonprimary',{isPrimary:false}],
 ['Alt',{altKey:true}],['Ctrl',{ctrlKey:true}],['Meta',{metaKey:true}],['Shift',{shiftKey:true}],
 ['negative identity',{pointerId:-1}],['fractional identity',{pointerId:1.5}],['unsafe identity',{pointerId:Number.MAX_SAFE_INTEGER+1}],['missing button state',{buttons:0}],
] as Array<[string,Partial<Sample>]>)it('does not admit '+label+' as an erase press',()=>{
 const f=fixture();expect(f.bridge.down(f.sample(patch))).not.toBe('erase');expect(f.leases).toEqual([]);expect(f.trace).toEqual([]);expect(f.bridge.active()).toBe(false);
});

it('refuses a non-canvas child, another chart canvas and disconnected current container',()=>{
 for(const kind of ['noncanvas','foreign','disconnected'] as const){const f=fixture(),target=kind==='noncanvas'?new NodeModel(false,f.node):kind==='foreign'?f.other:f.target;if(kind==='disconnected')f.node.isConnected=false;
  expect(f.bridge.down(f.sample({target:target as unknown as EventTarget}))).toBe('refused');expect(f.leases).toEqual([]);expect(f.bridge.active()).toBe(false);
 }
});

it('rejects replay of the same raw event after dispatch expiry',()=>{
 const f=fixture(),event=f.sample();expect(f.bridge.down(event)).toBe('erase');f.flushMicrotasks();expect(()=>f.leases[0].pointer()).toThrow();
 const reads=f.reads(),trace=[...f.trace];
 // Reviewed policy: a duplicate event has no authority to cancel even this
 // same gesture. It also cannot renew its expired sample or flush a viewport.
 expect(f.bridge.sample(event)).toBe(false);expect(f.bridge.active()).toBe(true);expect(f.leases[0].cancels).toBe(0);
 expect(f.bridge.down(event)).toBe('refused');expect(f.leases).toHaveLength(1);expect(f.reads()).toBe(reads);expect(f.trace).toEqual(trace);expect(()=>f.leases[0].pointer()).toThrow();
 expect(f.bridge.sample(f.sample())).toBe(true);expect(()=>f.leases[0].pointer()).not.toThrow();f.bridge.cancel();expect(f.leases[0].cancels).toBe(1);
});

it('different React-style wrappers cannot reuse one nativeEvent as fresh sample authority',()=>{
 const f=fixture(),nativeEvent=f.raw();expect(f.bridge.down(f.sample({nativeEvent}))).toBe('erase');f.flushMicrotasks();
 const reads=f.reads();expect(f.bridge.sample(f.sample({nativeEvent}))).toBe(false);expect(f.bridge.active()).toBe(true);expect(f.leases).toHaveLength(1);expect(f.reads()).toBe(reads);expect(f.leases[0].cancels).toBe(0);expect(()=>f.leases[0].pointer()).toThrow();
 expect(f.bridge.sample(f.sample())).toBe(true);expect(()=>f.leases[0].pointer()).not.toThrow();f.bridge.cancel();
});

for(const kind of ['down','move'] as const)it('a consumed old '+kind+' event cannot read, flush or retire a replacement gesture',()=>{
 const f=fixture(),down=f.sample(),move=f.sample();expect(f.bridge.down(down)).toBe('erase');expect(f.bridge.sample(move)).toBe(true);f.bridge.cancel();
 expect(f.bridge.down(f.sample())).toBe('erase');const reads=f.reads(),trace=[...f.trace];
 if(kind==='down')expect(f.bridge.down(down)).toBe('refused');else expect(f.bridge.sample(move)).toBe(false);
 expect(f.reads()).toBe(reads);expect(f.trace).toEqual(trace);expect(f.leases).toHaveLength(2);expect(f.leases[0].cancels).toBe(1);expect(f.leases[1].cancels).toBe(0);expect(f.leases[1].finishes).toBe(0);expect(f.reports).toEqual([]);expect(f.bridge.active()).toBe(true);expect(()=>f.leases[1].pointer()).not.toThrow();f.bridge.cancel();
});

it('an older sample expiry cannot retire a more recent sample in the same gesture',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');expect(f.bridge.sample(f.sample())).toBe(true);expect(()=>f.leases[0].pointer()).not.toThrow();
 f.flushOneMicrotask();expect(()=>f.leases[0].pointer()).not.toThrow();
 // The callback belonging to the current sample expires that sample only.
 f.flushMicrotasks();expect(()=>f.leases[0].pointer()).toThrow();expect(f.bridge.active()).toBe(true);f.bridge.cancel();
});

it('admitted release and finish share the same raw event and cleanup needs no live sample',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');const lease=f.leases[0],up=f.sample({buttons:0});
 expect(f.bridge.sample(up,true)).toBe(true);expect(()=>lease.pointer()).not.toThrow();
 let retiredBeforeCleanup=false;f.onFinish(()=>{try{lease.pointer();}catch{retiredBeforeCleanup=true;}});
 expect(f.bridge.finish(up)).toBe(true);expect(retiredBeforeCleanup).toBe(true);expect(lease.finishes).toBe(1);expect(lease.cancels).toBe(0);expect(f.bridge.active()).toBe(false);
 expect(f.bridge.finish(up)).toBe(false);f.flushMicrotasks();expect(lease.finishes).toBe(1);
});

it('finish accepts another wrapper only for the exact current native release event',()=>{
 const f=fixture(),nativeEvent=f.raw();expect(f.bridge.down(f.sample())).toBe('erase');expect(f.bridge.sample(f.sample({buttons:0,nativeEvent}),true)).toBe(true);
 expect(f.bridge.finish(f.sample({buttons:0,nativeEvent}))).toBe(true);expect(f.leases[0].finishes).toBe(1);
});

it('a foreign, unadmitted or expired release cannot finish the current owner',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');expect(f.bridge.finish(f.sample({pointerId:8,buttons:0}))).toBe(false);
 expect(f.bridge.finish(f.sample({buttons:0}))).toBe(false);expect(f.leases[0].finishes).toBe(0);expect(f.bridge.active()).toBe(true);
 const up=f.sample({buttons:0});expect(f.bridge.sample(up,true)).toBe(true);f.flushMicrotasks();expect(f.bridge.finish(up)).toBe(false);expect(f.leases[0].finishes).toBe(0);f.bridge.cancel();
});

it('an old release cannot finish a new gesture that reuses the same mouse pointer ID',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');const oldUp=f.sample({buttons:0});expect(f.bridge.sample(oldUp,true)).toBe(true);expect(f.bridge.finish(oldUp)).toBe(true);
 expect(f.bridge.down(f.sample())).toBe('erase');expect(f.bridge.finish(oldUp)).toBe(false);expect(f.leases[1].finishes).toBe(0);expect(f.leases[1].cancels).toBe(0);expect(()=>f.leases[1].pointer()).not.toThrow();f.bridge.cancel();
});

for(const patch of [{pointerId:8},{ctrlKey:true},{buttons:0}] as Array<Partial<Sample>>)it('an incompatible move retires the exact owner and cannot grant another hit '+JSON.stringify(patch),()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');expect(f.bridge.sample(f.sample(patch))).toBe(false);expect(f.bridge.active()).toBe(false);expect(f.leases[0].cancels).toBe(1);expect(()=>f.leases[0].pointer()).toThrow();
 expect(f.bridge.sample(f.sample())).toBe(false);expect(f.leases).toHaveLength(1);
});

for(const field of ['source','chart','node','ready'] as const)it('observed '+field+' replacement retires the old callback and cannot revive through value restoration',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');const old=f.view();
 if(field==='source')f.amend({source:{}});else if(field==='chart')f.amend({chart:{...f.chart}});else if(field==='node')f.amend({node:new NodeModel() as unknown as HTMLElement});else f.amend({ready:false});
 expect(f.bridge.sample(f.sample())).toBe(false);expect(f.bridge.active()).toBe(false);expect(f.leases[0].cancels).toBe(1);expect(f.reports).toEqual([]);
 f.amend(old);expect(()=>f.leases[0].pointer()).toThrow();expect(f.bridge.sample(f.sample())).toBe(false);expect(f.leases).toHaveLength(1);
});

it('equal same-basis read objects preserve ownership but disconnecting its physical node refuses a sample',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');f.amend({...f.view()});expect(f.bridge.sample(f.sample())).toBe(true);
 f.node.isConnected=false;expect(f.bridge.sample(f.sample())).toBe(false);expect(f.leases[0].cancels).toBe(1);expect(f.reports).toEqual([]);
});

it('source replacement during viewport flush refuses before router acquisition and suppresses stale feedback',()=>{
 const f=fixture();f.onFlush(()=>f.amend({source:{}}));expect(f.bridge.down(f.sample())).toBe('refused');expect(f.trace).toEqual(['flush']);expect(f.leases).toEqual([]);expect(f.reports).toEqual([]);expect(f.bridge.active()).toBe(false);
});

it('getMode failure is a controlled refusal rather than an uncaught event error',()=>{
 const f=fixture();f.onMode(()=>{throw Error('SYNTHETIC mode unavailable');});expect(f.bridge.down(f.sample())).toBe('refused');expect(f.leases).toEqual([]);expect(f.bridge.active()).toBe(false);
});

for(const seam of ['read','mode','flush','begin','assert'] as const)it('old '+seam+' callback cannot cancel or overwrite a newer admitted gesture',()=>{
 const f=fixture();let nested:unknown;const reenter=()=>{nested=f.bridge.down(f.sample());};
 if(seam==='read')f.onRead(reenter);else if(seam==='mode')f.onMode(reenter);else if(seam==='flush')f.onFlush(reenter);else if(seam==='begin')f.onBegin(reenter);else f.onAssert(reenter);
 expect(f.bridge.down(f.sample())).toBe('refused');expect(nested).toBe('erase');expect(f.bridge.active()).toBe(true);const latest=f.leases.at(-1)!;
 expect(latest.cancels).toBe(0);expect(latest.finishes).toBe(0);expect(()=>latest.pointer()).not.toThrow();expect(f.reports).toEqual([]);
 if(seam==='begin'){expect(f.leases).toHaveLength(2);expect(f.leases[0].cancels).toBe(1);expect(f.leases[0].live).toBe(false);}
 f.bridge.cancel();expect(latest.cancels).toBe(1);
});

it('a replacement admitted during failed old sample assertion survives the old stop path',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');let nested:unknown;f.onAssert(()=>{nested=f.bridge.down(f.sample());throw Error('SYNTHETIC old sample failed after replacement');});
 expect(f.bridge.sample(f.sample())).toBe(false);expect(nested).toBe('erase');expect(f.bridge.active()).toBe(true);expect(f.leases[0].cancels).toBe(1);expect(f.leases[1].cancels).toBe(0);expect(()=>f.leases[1].pointer()).not.toThrow();expect(f.reports).toEqual([]);f.bridge.cancel();
});

it('retiring an old lease before cleanup cannot cancel a newer gesture created by that cleanup',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');let nested:unknown,oldRetired=false;
 f.onCancel(lease=>{try{lease.pointer();}catch{oldRetired=true;}nested=f.bridge.down(f.sample());});f.bridge.cancel();
 expect(oldRetired).toBe(true);expect(nested).toBe('erase');expect(f.bridge.active()).toBe(true);expect(f.leases[0].cancels).toBe(1);expect(f.leases[1].cancels).toBe(0);expect(()=>f.leases[1].pointer()).not.toThrow();f.bridge.cancel();
});

it('old down intent cannot overwrite a gesture established while cancelling its predecessor',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');let nested:unknown;f.onCancel(()=>{nested=f.bridge.down(f.sample());});
 expect(f.bridge.down(f.sample())).toBe('refused');expect(nested).toBe('erase');expect(f.leases).toHaveLength(2);expect(f.leases[1].cancels).toBe(0);expect(()=>f.leases[1].pointer()).not.toThrow();f.bridge.cancel();
});

it('late successful acquisition for a replaced source disposes only the returned old lease',()=>{
 const f=fixture();f.onBegin(()=>f.amend({source:{}}));expect(f.bridge.down(f.sample())).toBe('refused');expect(f.leases).toHaveLength(1);expect(f.leases[0].cancels).toBe(1);expect(f.bridge.active()).toBe(false);expect(f.reports).toEqual([]);
});

it('cancel is idempotent and all deferred old samples remain powerless after a fresh press',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');f.bridge.cancel();f.bridge.cancel();expect(f.leases[0].cancels).toBe(1);
 expect(f.bridge.down(f.sample())).toBe('erase');expect(()=>f.leases[0].pointer()).toThrow();f.flushMicrotasks();expect(()=>f.leases[1].pointer()).toThrow();expect(f.bridge.active()).toBe(true);f.bridge.cancel();expect(f.leases[1].cancels).toBe(1);
});

it('consumed is a read-only raw identity query for fresh, ordinary and React-wrapped events',()=>{
 const f=fixture(),nativeEvent=f.raw(),event=f.sample({nativeEvent});const reads=f.reads();
 expect(f.bridge.consumed(event)).toBe(false);expect(f.bridge.consumed(f.sample())).toBe(false);expect(f.reads()).toBe(reads);expect(f.trace).toEqual([]);
 f.mode(null);expect(f.bridge.down(event)).toBe('ordinary');const after=f.reads();
 expect(f.bridge.consumed(event)).toBe(true);expect(f.bridge.consumed(f.sample({nativeEvent}))).toBe(true);expect(f.bridge.consumed(f.sample())).toBe(false);expect(f.reads()).toBe(after);expect(f.leases).toEqual([]);expect(f.bridge.active()).toBe(false);
});

it('a fresh matching cancel event retires its exact pointer before cleanup even after sample expiry',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');f.flushMicrotasks();const cancel=f.sample({buttons:0}),lease=f.leases[0];let retired=false;
 f.onCancel(()=>{try{lease.pointer();}catch{retired=true;}});expect(f.bridge.consumed(cancel)).toBe(false);
 expect(f.bridge.cancelPointer(cancel)).toBe(true);expect(retired).toBe(true);expect(f.bridge.consumed(cancel)).toBe(true);expect(f.bridge.active()).toBe(false);expect(lease.cancels).toBe(1);
 const reads=f.reads();expect(f.bridge.cancelPointer(cancel)).toBe(false);expect(f.reads()).toBe(reads);expect(lease.cancels).toBe(1);expect(f.reports).toEqual([]);
});

it('a foreign pointer cancel neither consumes its event nor reads or retires the current owner',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');const cancel=f.sample({pointerId:8,buttons:0}),reads=f.reads(),trace=[...f.trace];
 expect(f.bridge.cancelPointer(cancel)).toBe(false);expect(f.bridge.consumed(cancel)).toBe(false);expect(f.reads()).toBe(reads);expect(f.trace).toEqual(trace);expect(f.bridge.active()).toBe(true);expect(f.leases[0].cancels).toBe(0);expect(()=>f.leases[0].pointer()).not.toThrow();f.bridge.cancel();
});

for(const kind of ['down','move','cancel'] as const)it('an already-consumed old '+kind+' cannot cancel a new same-ID gesture',()=>{
 const f=fixture(),down=f.sample(),move=f.sample(),cancel=f.sample({buttons:0});expect(f.bridge.down(down)).toBe('erase');expect(f.bridge.sample(move)).toBe(true);expect(f.bridge.cancelPointer(cancel)).toBe(true);
 expect(f.bridge.down(f.sample())).toBe('erase');const event=kind==='down'?down:kind==='move'?move:cancel,reads=f.reads(),trace=[...f.trace];
 expect(f.bridge.cancelPointer(event)).toBe(false);expect(f.bridge.consumed(event)).toBe(true);expect(f.reads()).toBe(reads);expect(f.trace).toEqual(trace);expect(f.leases[1].cancels).toBe(0);expect(f.bridge.active()).toBe(true);expect(()=>f.leases[1].pointer()).not.toThrow();expect(f.reports).toEqual([]);f.bridge.cancel();
});

it('new React wrappers for an already-used native cancel event cannot retire a replacement',()=>{
 const f=fixture(),nativeEvent=f.raw();expect(f.bridge.down(f.sample())).toBe('erase');expect(f.bridge.cancelPointer(f.sample({buttons:0,nativeEvent}))).toBe(true);expect(f.bridge.down(f.sample())).toBe('erase');const reads=f.reads();
 expect(f.bridge.cancelPointer(f.sample({buttons:0,nativeEvent}))).toBe(false);expect(f.reads()).toBe(reads);expect(f.leases[1].cancels).toBe(0);expect(f.bridge.active()).toBe(true);expect(()=>f.leases[1].pointer()).not.toThrow();f.bridge.cancel();
});

it('matching pointer cancellation does not clean up a replacement created by the old lease callback',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');let replacement:unknown;f.onCancel(()=>{replacement=f.bridge.down(f.sample());});const cancel=f.sample({buttons:0});
 expect(f.bridge.cancelPointer(cancel)).toBe(true);expect(replacement).toBe('erase');expect(f.bridge.consumed(cancel)).toBe(true);expect(f.leases[0].cancels).toBe(1);expect(f.leases[1].cancels).toBe(0);expect(f.bridge.active()).toBe(true);expect(()=>f.leases[1].pointer()).not.toThrow();f.bridge.cancel();
});

it('an early microtask checkpoint preserves the same dispatch from capture through target and bubble listeners',()=>{
 const f=fixture(),nativeEvent=f.raw(1),event=f.sample({nativeEvent});expect(f.bridge.down(event)).toBe('erase');const lease=f.leases[0];
 f.flushOneMicrotask();expect(()=>lease.pointer()).not.toThrow();expect(f.bridge.active()).toBe(true);
 nativeEvent.eventPhase=2;nativeEvent.currentTarget=f.target;expect(()=>lease.pointer()).not.toThrow();
 nativeEvent.eventPhase=3;nativeEvent.currentTarget=f.canvas;expect(()=>lease.pointer()).not.toThrow();
 f.endDispatch(nativeEvent);expect(()=>lease.pointer()).toThrow(/retired|sample|dispatch|changed/i);expect(lease.cancels).toBe(0);f.bridge.cancel();expect(lease.cancels).toBe(1);
});

it('phase zero revokes a sample immediately even before its queued cleanup runs',()=>{
 const f=fixture(),nativeEvent=f.raw(2);expect(f.bridge.down(f.sample({nativeEvent}))).toBe('erase');const lease=f.leases[0];
 f.endDispatch(nativeEvent);expect(()=>lease.pointer()).toThrow();expect(f.bridge.active()).toBe(true);expect(lease.cancels).toBe(0);
 const next=f.raw(1);expect(f.bridge.sample(f.sample({nativeEvent:next}))).toBe(true);f.flushOneMicrotask();expect(()=>lease.pointer()).not.toThrow();
 f.endDispatch(next);expect(()=>lease.pointer()).toThrow();f.flushMicrotasks();f.bridge.cancel();expect(lease.cancels).toBe(1);
});

for(const [label,nativeEvent] of [
 ['missing phase',{}],['missing current target',{eventPhase:1}],['null current target',{eventPhase:2,currentTarget:null}],
 ['not dispatching',{eventPhase:0,currentTarget:{}}],['out of range phase',{eventPhase:4,currentTarget:{}}],
 ['string phase',{eventPhase:'1',currentTarget:{}}],['fractional phase',{eventPhase:1.5,currentTarget:{}}],
] as Array<[string,object]>)it('refuses '+label+' before acquiring or cleaning up a gesture',()=>{
 const f=fixture(),event=f.sample({nativeEvent}),reads=f.reads();expect(f.bridge.down(event)).toBe('refused');expect(f.reads()).toBe(reads);expect(f.trace).toEqual([]);expect(f.leases).toEqual([]);
 expect(f.bridge.down(f.sample())).toBe('erase');const currentReads=f.reads(),trace=[...f.trace],lease=f.leases[0];
 expect(f.bridge.sample(event)).toBe(false);expect(f.bridge.cancelPointer(event)).toBe(false);expect(f.bridge.finish(event)).toBe(false);
 expect(f.reads()).toBe(currentReads);expect(f.trace).toEqual(trace);expect(lease.cancels).toBe(0);expect(lease.finishes).toBe(0);expect(()=>lease.pointer()).not.toThrow();f.bridge.cancel();
});

it('a release may finish after an early checkpoint but never after that dispatch ends',()=>{
 const f=fixture();expect(f.bridge.down(f.sample())).toBe('erase');const nativeEvent=f.raw(1),up=f.sample({buttons:0,nativeEvent});
 expect(f.bridge.sample(up,true)).toBe(true);f.flushOneMicrotask();f.flushOneMicrotask();nativeEvent.eventPhase=3;
 expect(f.bridge.finish(up)).toBe(true);expect(f.leases[0].finishes).toBe(1);
 expect(f.bridge.down(f.sample())).toBe('erase');const expired=f.raw(1),nextUp=f.sample({buttons:0,nativeEvent:expired});expect(f.bridge.sample(nextUp,true)).toBe(true);f.endDispatch(expired);
 expect(f.bridge.finish(nextUp)).toBe(false);expect(f.leases[1].finishes).toBe(0);expect(f.leases[1].cancels).toBe(0);f.bridge.cancel();
});
