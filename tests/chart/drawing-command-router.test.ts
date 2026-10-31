import {expect,it,vi} from 'vitest';
import {installDrawingCommandRouter,resolveDrawingDuplicatePopupPort} from '../../src/chart/drawing-command-router';
import {drawingRouterHarness} from './drawing-command-router-harness';
import {annotationRecord} from './trendline-annotation-native-harness';
import type {Vela} from '@luxalgo/vela';

it('actual native facade clone/duplicate chain exactly and native duplicate keyboard/intent route once without core insertion',async()=>{
 const row=annotationRecord(),f=await drawingRouterHarness([row]);try{
  const native=vi.spyOn(f.native.controller,'duplicate');
  expect(f.facade.clone(row.id)).toBe(f.facade);expect(f.facade.duplicate([row.id])).toBe(f.facade);
  f.paint.controller.emit({kind:'duplicate',ids:[row.id]});f.native.controller.setSelection([row.id]);
  expect(f.paint.controller.handleKey({key:'d',ctrlKey:true,metaKey:false,shiftKey:false,altKey:false,target:null})).toBe(true);
  expect(f.duplicates).toEqual(Array.from({length:4},()=>[row.id]));expect(native).not.toHaveBeenCalled();expect(f.native.controller.all()).toEqual([row]);
 }finally{f.dispose();}
});
it('facade and native history routes dispatch once, return exact facade, and use workspace booleans without native history fallback',async()=>{
 const f=await drawingRouterHarness();try{const undo=vi.spyOn(f.native.controller,'undo'),redo=vi.spyOn(f.native.controller,'redo');expect(f.facade.undo()).toBe(f.facade);expect(f.facade.redo()).toBe(f.facade);f.paint.controller.emit({kind:'undo'});f.paint.controller.emit({kind:'redo'});expect(f.histories).toEqual(['undo','redo','undo','redo']);expect(f.facade.canUndo()).toBe(true);expect(f.facade.canRedo()).toBe(false);expect(undo).not.toHaveBeenCalled();expect(redo).not.toHaveBeenCalled();f.setHistory(()=>{f.retire();});expect(()=>f.facade.undo()).not.toThrow();}finally{f.dispose();}
});
it('workspace history dispatch remains independent of disabled native drawing capability',async()=>{
 const f=await drawingRouterHarness();try{f.native.controller.enabled=false;expect(f.facade.undo()).toBe(f.facade);expect(f.facade.redo()).toBe(f.facade);expect(f.histories).toEqual(['undo','redo']);expect(()=>f.facade.clone('synthetic-annotation')).toThrow('disabled');}finally{f.dispose();}
});
it('forwards nonduplicate intents by exact object and native receiver; translated clone remains separate',async()=>{
 const row=annotationRecord(),f=await drawingRouterHarness([row]);try{const original={kind:'draft',doc:null};f.paint.controller.emit(original);expect(f.intents.at(-1)).toBe(original);f.paint.controller.emit({kind:'copy',ids:[row.id]});expect(f.native.controller.clipboard).toHaveLength(1);f.paint.controller.emit({kind:'clone',docs:[]});expect(f.duplicates).toEqual([]);expect(f.intents.at(-1)).toEqual({kind:'clone',docs:[]});}finally{f.dispose();}
});
it('bounds/data IDs, disabled capability, native text/editor/gesture and host busy gates refuse without native or canonical changes',async()=>{
 const row=annotationRecord(),f=await drawingRouterHarness([row]);try{for(const ids of [[],[row.id,row.id],Array(129).fill(row.id),[Object.create(null)]])expect(()=>f.router.duplicate(ids as string[])).toThrow();let reads=0;const ids=[row.id];Object.defineProperty(ids,'0',{get(){reads++;return row.id;}});expect(()=>f.router.duplicate(ids)).toThrow();expect(reads).toBe(0);
  f.native.controller.enabled=false;expect(()=>f.facade.clone(row.id)).toThrow('disabled');f.native.controller.enabled=true;
  f.paint.controller.textEditor={};expect(()=>f.facade.clone(row.id)).toThrow('gesture or text');f.paint.controller.textEditor=null;f.paint.interaction.state={kind:'dragging'};expect(()=>f.facade.clone(row.id)).toThrow();f.paint.interaction.state={kind:'idle'};f.paint.controller.activeTool='trendline';expect(()=>f.facade.clone(row.id)).toThrow();f.paint.controller.activeTool=null;
  f.setMutable(()=>{throw Error('SYNTHETIC OpenCandle inline/busy gate');});expect(()=>f.facade.clone(row.id)).toThrow('OpenCandle inline/busy');expect(f.duplicates).toEqual([]);expect(f.native.controller.all()).toEqual([row]);expect(f.document.all()).toEqual([row]);
 }finally{f.dispose();}
});
it('consumes command authority before callbacks, rejects nested duplicate/history and copied receivers without breaking outer command',async()=>{
 const row=annotationRecord(),f=await drawingRouterHarness([row]);try{f.setDuplicate((ids,assert)=>{expect(()=>f.router.duplicate(ids)).toThrow('progress');expect(()=>f.facade.undo()).toThrow('progress');assert();return f.receipt(ids);});expect(f.router.duplicate([row.id]).workspaceAcknowledged).toBe(true);expect(()=>({...f.router}).duplicate([row.id])).toThrow('receiver');expect(()=>f.facade.clone.call({},row.id)).toThrow('receiver');expect(()=>f.paint.controller.intentCb.call({}, {kind:'duplicate',ids:[row.id]})).toThrow('receiver');expect(f.duplicates).toHaveLength(1);}finally{f.dispose();}
});
it('genuine popup port refuses fake/cross-chart ports and second installation',async()=>{
 const a=await drawingRouterHarness(),b=await drawingRouterHarness();try{expect(()=>resolveDrawingDuplicatePopupPort({...a.router.popupPort},a.paint.renderer,a.paint.controller,a.popup)).toThrow('foreign');expect(()=>resolveDrawingDuplicatePopupPort(a.router.popupPort,b.paint.renderer,b.paint.controller,b.popup)).toThrow('foreign');expect(()=>installDrawingCommandRouter(a.paint.renderer,a.chart as unknown as Vela,a.host)).toThrow('already');}finally{b.dispose();a.dispose();}
});
it('disposal restores only owned slots, clears public authority, preserves destroyed callbacks and attempts every facade cleanup',async()=>{
 const f=await drawingRouterHarness(),prototype=Object.getPrototypeOf(f.facade);f.reset.dispose();const original=prototype.clone;expect(Object.hasOwn(f.facade,'clone')).toBe(true);f.paint.controller.intentCb=null;expect(()=>f.router.dispose()).toThrow('cleanup');expect(f.facade.clone).toBe(original);for(const key of ['clone','duplicate','undo','redo','canUndo','canRedo'])expect(Object.hasOwn(f.facade,key)).toBe(false);expect(f.paint.controller.intentCb).toBeNull();expect(()=>f.router.duplicate(['x'])).toThrow('retired');f.dispose();
});
it('a replaced facade slot is preserved and cannot revive the permanently retired router',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();const wrapped=f.facade.clone,replacement=()=>f.facade;f.facade.clone=replacement;expect(()=>f.router.duplicate(['x'])).toThrow('slot replaced');f.facade.clone=wrapped;expect(()=>f.router.duplicate(['x'])).toThrow('retired');f.facade.clone=replacement;expect(()=>f.router.dispose()).toThrow('cleanup');expect(f.facade.clone).toBe(replacement);expect(Object.hasOwn(f.facade,'undo')).toBe(false);f.dispose();
});
it('installation write-then-throw removes its attempted facade slot and restores the exact native intent callback',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();const originalIntent=f.paint.controller.intentCb;
 const proxy=new Proxy(f.facade,{defineProperty(target,key,descriptor){Reflect.defineProperty(target,key,descriptor);if(key==='clone')throw Error('SYNTHETIC facade write then throw');return true;}});
 f.setFacade(proxy);try{expect(()=>installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,f.host)).toThrow('write then throw');expect(f.paint.controller.intentCb).toBe(originalIntent);for(const key of ['clone','duplicate','undo','redo','canUndo','canRedo'])expect(Object.hasOwn(f.facade,key)).toBe(false);}finally{f.setFacade(f.facade);f.dispose();}
});
it('reentrant acquisition of a later facade slot is refused and preserved while prior owned slots unwind',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();const originalIntent=f.paint.controller.intentCb,competitor=()=>f.facade;
 const proxy=new Proxy(f.facade,{defineProperty(target,key,descriptor){const result=Reflect.defineProperty(target,key,descriptor);if(key==='clone')Object.defineProperty(target,'undo',{value:competitor,writable:true,configurable:true});return result;}});
 f.setFacade(proxy);try{expect(()=>installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,f.host)).toThrow('another owner');expect(f.paint.controller.intentCb).toBe(originalIntent);expect(f.facade.undo).toBe(competitor);for(const key of ['clone','duplicate','redo','canUndo','canRedo'])expect(Object.hasOwn(f.facade,key)).toBe(false);}finally{f.setFacade(f.facade);Reflect.deleteProperty(f.facade,'undo');f.dispose();}
});
it('optional native error reporting acquires independent owner before normal failure, never reads message accessors and preserves exact error',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();let reads=0;const error=Object.defineProperty({},'message',{get(){reads++;return 'SYNTHETIC private getter';}}),messages:string[]=[];
 const host={...f.host,captureErrorOwner:f.captureOwner,reportError(message:string){messages.push(message);throw Error('SYNTHETIC sink failure');},captureOwner(){throw error;}};
 const router=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,host);try{let caught:unknown;try{router.duplicate(['synthetic-annotation']);}catch(value){caught=value;}expect(caught).toBe(error);expect(reads).toBe(0);expect(messages).toEqual(['Drawing command could not finish. Details are unavailable.']);}finally{router.dispose();f.dispose();}
});
it('native error reporting is an all-or-none data callback pair and cannot recursively publish',async()=>{
 const f=await drawingRouterHarness();f.reset.dispose();f.router.dispose();expect(()=>installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,{...f.host,reportError(){}})).toThrow('together');let reported=0;const failure=Error('SYNTHETIC rejection');let router:ReturnType<typeof installDrawingCommandRouter>;const host={...f.host,captureErrorOwner:f.captureOwner,reportError(){reported++;expect(()=>router.duplicate(['synthetic-annotation'])).toThrow('progress');},captureOwner(){throw failure;}};router=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,host);try{expect(()=>router.duplicate(['synthetic-annotation'])).toThrow(failure);expect(reported).toBe(1);}finally{router.dispose();f.dispose();}
});
