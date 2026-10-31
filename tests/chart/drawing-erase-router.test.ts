import {expect,it,vi} from 'vitest';
import type {Vela,SerializedDrawing} from '@luxalgo/vela';
import {installDrawingCommandRouter,type DrawingCommandRouterHost} from '../../src/chart/drawing-command-router';
import type {DrawingEraseReceipt} from '../../src/chart/drawing-erase-publication';
import {drawingRouterHarness} from './drawing-command-router-harness';
import {annotationRecord} from './trendline-annotation-native-harness';

// Real native pointer/hit-test/intent bodies, controlled construction services and
// a synchronous test publisher. These cases are not DOM/pointer-ID or GUI evidence.
async function harness(rows:SerializedDrawing[]=[annotationRecord()]){
 const f=await drawingRouterHarness(rows);f.reset.dispose();f.router.dispose();const controller=f.paint.controller;
 controller.toolbar={setEraserActive(){},setMeasureActive(){},setActiveTool(){}};
 controller.measure={...controller.measure,clear(){},isFinished:()=>false};controller.erasing=false;
 let pointerCurrent=true,mutable=()=>{},eraseHook:DrawingCommandRouterHost['erase'];const erased:string[]=[],messages:string[]=[];
 const receipt=(id:string):DrawingEraseReceipt=>Object.freeze({ids:Object.freeze([id]),nativeState:'complete',canonicalAccepted:true,workspaceAcknowledged:true,observersComplete:true});
 const host:DrawingCommandRouterHost={...f.host,captureErrorOwner:f.captureOwner,reportError:message=>{messages.push(message);},assertEraseMutable(){mutable();},erase(id,assert){assert();erased.push(id);if(eraseHook)return eraseHook(id,assert);f.native.controller.store.remove(id);return receipt(id);}};
 const router=installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,host);controller.setMode('eraser');
 const begin=()=>router.beginEraseGesture(()=>{if(!pointerCurrent)throw Error('SYNTHETIC pointer retired');});
 return{...f,controller,router,host,erased,messages,receipt,begin,pointer(value:boolean){pointerCurrent=value;},mutable(value:()=>void){mutable=value;},erase(value:DrawingCommandRouterHost['erase']){eraseHook=value;},dispose(){router.dispose();f.dispose();}};
}

it('ERASER.ROUTER.HIT routes actual native hit once and never forwards the core delete intent',async()=>{
 const f=await harness();try{const removeMany=vi.spyOn(f.native.controller,'deleteMany'),lease=f.begin();f.controller.pointerDown(20,200);
  expect(f.erased).toEqual(['synthetic-annotation']);expect(f.native.controller.all()).toEqual([]);expect(removeMany).not.toHaveBeenCalled();expect(f.intents.some(value=>value.kind==='delete')).toBe(false);
  lease.assertCurrent();f.controller.pointerMove(20,200);expect(f.erased).toHaveLength(1);f.controller.pointerUp(20,200);expect(f.controller.erasing).toBe(false);expect(()=>lease.assertCurrent()).toThrow();
 }finally{f.dispose();}
});
it('ERASER.ROUTER.NO_HIT keeps a gesture across empty and locked samples before an eligible hit',async()=>{
 const unlocked=annotationRecord(),locked={...annotationRecord(),id:'locked',locked:true,anchors:[{time:1100000,price:20},{time:1200000,price:20}]};const f=await harness([unlocked,locked]);try{
  const lease=f.begin();f.controller.pointerDown(390,10);lease.assertCurrent();f.controller.pointerMove(120,280);lease.assertCurrent();expect(f.erased).toEqual([]);
  f.controller.pointerMove(20,200);expect(f.erased).toEqual(['synthetic-annotation']);expect(f.native.controller.all().map((row:SerializedDrawing)=>row.id)).toEqual(['locked']);lease.finish();expect(f.controller.erasing).toBe(false);
 }finally{f.dispose();}
});
it('ERASER.ROUTER.PROTECTED_TOP does not tunnel through a locked top drawing',async()=>{
 const row=annotationRecord(),f=await harness([row,{...row,id:'locked-top',zIndex:10,locked:true}]);try{const lease=f.begin();f.controller.pointerDown(20,200);expect(f.erased).toEqual([]);expect(f.native.controller.all()).toHaveLength(2);lease.assertCurrent();lease.cancel();}finally{f.dispose();}
});
it('ERASER.ROUTER.AUTHORITY refuses unleased/direct/with-selection deletion without destructive fallback',async()=>{
 const f=await harness();try{
  f.controller.pointerDown(20,200);f.controller.pointerMove(20,200);expect(f.erased).toEqual([]);expect(f.native.controller.all()).toHaveLength(1);
  expect(()=>f.controller.deleteAt(20,200)).toThrow();const lease=f.begin();expect(()=>f.controller.deleteAt(20,200,true)).toThrow();expect(f.erased).toEqual([]);expect(f.native.controller.all()).toHaveLength(1);expect(()=>lease.assertCurrent()).toThrow();
 }finally{f.dispose();}
});
it('ERASER.ROUTER.SOURCE revalidates after native popup close and before publication',async()=>{
 const f=await harness();try{const lease=f.begin();f.onClose(()=>f.retire());expect(()=>f.controller.pointerDown(20,200)).toThrow();expect(f.erased).toEqual([]);expect(f.native.controller.all()).toHaveLength(1);expect(()=>lease.assertCurrent()).toThrow();expect(f.messages).toEqual([]);}finally{f.dispose();}
});
it('ERASER.ROUTER.POINTER rejects a retired raw-pointer assertion before the next hit',async()=>{
 const f=await harness();try{const lease=f.begin();f.pointer(false);expect(()=>f.controller.pointerDown(20,200)).toThrow();expect(f.erased).toEqual([]);expect(f.controller.erasing).toBe(false);expect(()=>lease.assertCurrent()).toThrow();}finally{f.dispose();}
});
it('ERASER.ROUTER.FAILURE clears only owned native input and permits a new gesture after a pre-forward refusal',async()=>{
 const f=await harness();try{const lease=f.begin();f.mutable(()=>{throw Error('SYNTHETIC busy');});expect(()=>f.controller.pointerDown(20,200)).toThrow('busy');expect(f.controller.erasing).toBe(false);expect(f.erased).toEqual([]);
  f.controller.pointerMove(20,200);expect(f.erased).toEqual([]);expect(()=>lease.assertCurrent()).toThrow();f.mutable(()=>{});const fresh=f.begin();f.controller.pointerDown(20,200);expect(f.erased).toHaveLength(1);fresh.cancel();
 }finally{f.dispose();}
});
it('ERASER.ROUTER.CANCEL old repeated cleanup cannot retire or reset a newer gesture',async()=>{
 const f=await harness();try{const old=f.begin();f.controller.pointerDown(390,10);old.cancel();old.cancel();expect(f.controller.erasing).toBe(false);
  const fresh=f.begin();f.controller.pointerDown(390,10);old.finish();expect(f.controller.erasing).toBe(true);fresh.assertCurrent();f.controller.pointerMove(20,200);expect(f.erased).toHaveLength(1);fresh.finish();
 }finally{f.dispose();}
});
it('ERASER.ROUTER.RECEIVER copied leases and router cannot borrow genuine input authority',async()=>{
 const f=await harness();try{const lease=f.begin();for(const method of ['assertCurrent','finish','cancel'] as const)expect(()=>({...lease})[method]()).toThrow(/receiver/i);lease.assertCurrent();expect(()=>({...f.router}).beginEraseGesture(()=>{})).toThrow(/receiver/i);f.controller.pointerDown(20,200);expect(f.erased).toHaveLength(1);lease.finish();}finally{f.dispose();}
});
it.each(['setMode','setActiveTool'] as const)('ERASER.ROUTER.MODE %s attempts retire input even when their values are unchanged',async method=>{
 const f=await harness();try{const lease=f.begin();f.controller.pointerDown(390,10);if(method==='setMode')f.controller.setMode('eraser');else f.controller.setActiveTool(null);
  expect(f.controller.erasing).toBe(false);expect(()=>lease.assertCurrent()).toThrow();f.controller.pointerMove(20,200);expect(f.erased).toEqual([]);
 }finally{f.dispose();}
});
it('ERASER.ROUTER.MODE_ABA leaving and restoring eraser never revives an old pointer',async()=>{
 const f=await harness();try{const lease=f.begin();f.controller.setMode(null);f.controller.setMode('eraser');expect(()=>lease.assertCurrent()).toThrow();f.controller.pointerMove(20,200);expect(f.erased).toEqual([]);const next=f.begin();f.controller.pointerDown(20,200);expect(f.erased).toHaveLength(1);next.cancel();}finally{f.dispose();}
});
it('ERASER.ROUTER.CONSUMPTION forbids nested commands and repeated intents without retrying its publisher',async()=>{
 const f=await harness();try{const lease=f.begin();let nestedBegin=false,nestedDelete=false;f.erase((id,assert)=>{
  try{f.router.beginEraseGesture(()=>{});}catch{nestedBegin=true;}try{f.controller.emit({kind:'delete',ids:[id]});}catch{nestedDelete=true;}assert();f.native.controller.store.remove(id);return f.receipt(id);
 });expect(()=>f.controller.pointerDown(20,200)).toThrow();expect(nestedBegin).toBe(true);expect(nestedDelete).toBe(true);expect(f.erased).toHaveLength(1);expect(()=>lease.assertCurrent()).toThrow();f.controller.pointerMove(20,200);expect(f.erased).toHaveLength(1);
 }finally{f.dispose();}
});
it('ERASER.ROUTER.POPUP_MODE never forwards a stale hit after popup close replaces eraser mode',async()=>{
 const f=await harness();try{const lease=f.begin();f.onClose(()=>f.controller.setMode(null));expect(()=>f.controller.pointerDown(20,200)).toThrow();expect(f.erased).toEqual([]);expect(f.native.controller.all()).toHaveLength(1);expect(f.controller.eraserMode).toBe(false);expect(f.controller.erasing).toBe(false);expect(()=>lease.assertCurrent()).toThrow();}finally{f.dispose();}
});
it('ERASER.ROUTER.ACCEPTED_THROW never retries a publisher that removed the row and then threw',async()=>{
 const f=await harness();try{const lease=f.begin();f.erase(id=>{f.native.controller.store.remove(id);throw Error('SYNTHETIC acknowledged then observer failed');});expect(()=>f.controller.pointerDown(20,200)).toThrow('observer failed');
  expect(f.erased).toHaveLength(1);expect(f.native.controller.all()).toEqual([]);expect(f.controller.erasing).toBe(false);f.controller.pointerMove(20,200);expect(f.erased).toHaveLength(1);expect(()=>lease.assertCurrent()).toThrow();
 }finally{f.dispose();}
});
it.each(['promise','undefined','wrong id','incomplete'] as const)('ERASER.ROUTER.RECEIPT rejects %s and consumes its hit',async kind=>{
 const f=await harness();try{const lease=f.begin();f.erase(((id:string)=>kind==='promise'?Promise.resolve(f.receipt(id)):kind==='undefined'?undefined:kind==='wrong id'?f.receipt('foreign'):{...f.receipt(id),workspaceAcknowledged:false}) as DrawingCommandRouterHost['erase']);
  expect(()=>f.controller.pointerDown(20,200)).toThrow();expect(f.erased).toHaveLength(1);expect(f.controller.erasing).toBe(false);f.controller.pointerMove(20,200);expect(f.erased).toHaveLength(1);expect(()=>lease.assertCurrent()).toThrow();
 }finally{f.dispose();}
});
it('ERASER.ROUTER.NON_ERASER preserves the old ordinary delete path and duplicate/history routing',async()=>{
 const f=await harness();try{f.controller.setMode(null);expect(f.controller.deleteAt(20,200)).toBe(true);expect(f.erased).toEqual([]);expect(f.intents.at(-1)).toEqual({kind:'delete',ids:['synthetic-annotation']});expect(f.native.controller.all()).toEqual([]);f.facade.undo();expect(f.histories).toEqual(['undo']);}finally{f.dispose();}
});
it('ERASER.ROUTER.OPTIONAL_PAIR is opt-in and refuses a half-configured host',async()=>{
 const f=await drawingRouterHarness();try{expect(()=>f.router.beginEraseGesture(()=>{})).toThrow(/unavailable|connected/i);f.reset.dispose();f.router.dispose();expect(()=>installDrawingCommandRouter(f.paint.renderer,f.chart as unknown as Vela,{...f.host,assertEraseMutable(){}})).toThrow(/together/i);}finally{f.dispose();}
});
