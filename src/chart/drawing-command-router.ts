import {NativeRenderer, Vela} from '@luxalgo/vela';
import type {DrawingEraseReceipt} from './drawing-erase-publication';
import {registerOwnedDrawingDeleteDispatch,type OwnedDrawingDeleteRegistration} from './trendline-annotation';
import {createDrawingInteractionQuality,DRAWING_INTERACTION_QUALITY_KEYS,type NativeDrawingInteraction} from './drawing-interaction-quality';

export interface DrawingDuplicateReceipt {
  readonly ids: readonly string[];
  readonly nativeState: 'before-forward' | 'not-forwarded' | 'complete' | 'forwarded-incomplete';
  readonly canonicalAccepted: boolean;
  readonly workspaceAcknowledged: boolean;
  readonly observersComplete: boolean;
}
export interface DrawingCommandRouterHost {
  captureOwner(): () => void;
  /** Also refuses an active LV inline editor and unprepared linked-chart work. */
  assertMutable(): void;
  duplicate(ids: readonly string[], assertActionOwner: () => void): DrawingDuplicateReceipt;
  /** Returns after dispatch; the host owns asynchronous completion and failure. */
  history(direction: 'undo' | 'redo', assertActionOwner: () => void): void;
  historyStatus(): {canUndo: boolean; canRedo: boolean};
  /** Optional pair: readonly source/registration-value lease, independent of mutation eligibility. */
  captureErrorOwner?(): () => void;
  reportError?(message: string): void;
  /** Optional pair. Only a privately owned native hit can invoke this publisher. */
  erase?(id: string, assertActionOwner: () => void): DrawingEraseReceipt;
  assertEraseMutable?(): void;
  /** Optional pair: LV clipboard copy and paste. Supplied together, they replace the native in-memory clipboard, which is then never used. */
  copy?(ids: readonly string[], assertActionOwner: () => void): void;
  paste?(assertActionOwner: () => void): DrawingDuplicateReceipt;
  /** Optional: true while Lock all drawings is on. The native Delete key then removes nothing; vela itself deletes a single locked selection, so the router retires that intent. Object-tree and manager Remove are not routed here and still remove. */
  drawingsLocked?(): boolean;
}
/** DWUTIL single-dispatcher rule: with chart canvas focus the router owns Ctrl+C and Ctrl+V; the App acts only when focus is elsewhere in the workspace and not in a text field or IME composition. */
export function clipboardKeyDispatcher(focus: {inChartCell: boolean; inTextInput: boolean; composing: boolean; chartActive: boolean}): 'router' | 'app' | 'ignore' {
  if (focus.inTextInput || focus.composing) return 'ignore';
  if (focus.inChartCell) return 'router';
  return focus.chartActive ? 'app' : 'ignore';
}
/** Public shape carries no authority; the installation's private registry does. */
export interface DrawingDuplicatePopupPort {readonly kind: 'lv-drawing-duplicate-popup'}
export interface DrawingEraseGesture {
  assertCurrent():void;
  finish():void;
  cancel():void;
}
export interface DrawingCommandRouter {
  duplicate(ids: readonly string[]): DrawingDuplicateReceipt;
  /** Copy snapshots rows into the LV clipboard and writes no history. Throws when the clipboard pair was not supplied. */
  copy(ids: readonly string[]): void;
  /** One owned Duplicate step with fresh ids; throws when the clipboard pair was not supplied. */
  paste(): DrawingDuplicateReceipt;
  /** The caller verifies a current raw pointer sample, including its exact ID. */
  beginEraseGesture(assertPointerOwner:()=>void):DrawingEraseGesture;
  readonly popupPort: DrawingDuplicatePopupPort;
  dispose(): void;
}
type Method = (this: any, ...args: any[]) => any;
interface Slot {owner: object; key: PropertyKey; descriptor: PropertyDescriptor; path: Array<{owner: object; prototype: object | null}>}
interface Write {receiver: object; key: string; previous?: PropertyDescriptor; wrapper: Method; installed: PropertyDescriptor}
type PopupInvoke = (ids: readonly string[], assertActionOwner: () => void, closeOwnedPopup: () => void) => DrawingDuplicateReceipt;
const installations = new WeakMap<object, object>();
const popupPorts = new WeakMap<object, {renderer: object; controller: object; popup: object; assert: () => void; invoke: PopupInvoke}>();
/** The genuine getter (`get drawings(){return this.drawingsControl}`); a replacement or shadow is refused, not sampled. */
const VELA_DRAWINGS_GETTER = Object.getOwnPropertyDescriptor(Vela.prototype, 'drawings')?.get;

function slot(value: unknown, key: PropertyKey, inherited = false): Slot {
  if (!value || typeof value !== 'object') throw Error('Drawing command owner unavailable: ' + String(key));
  const path: Slot['path'] = [];
  for (let current: object | null = value; current; current = inherited ? Object.getPrototypeOf(current) : null) {
    if (path.length === 32) throw Error('Drawing command prototype bound exceeded');
    path.push({owner: current, prototype: Object.getPrototypeOf(current)});
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      if (!Object.hasOwn(descriptor, 'value')) throw Error('Drawing command requires a data member: ' + String(key));
      return {owner: current, key, descriptor, path};
    }
  }
  throw Error('Drawing command member unavailable: ' + String(key));
}
function data(value: unknown, key: string): any {return slot(value, key).descriptor.value;}
/** An inherited getter-only accessor. Its path starts at value, so a later own shadow, prototype swap or replaced getter retires it in unchanged(). */
function accessorSlot(value: unknown, key: PropertyKey): Slot {
  if (!value || typeof value !== 'object') throw Error('Drawing command owner unavailable: ' + String(key));
  if (Object.hasOwn(value, key)) throw Error('Drawing command facade accessor mismatch');
  const path: Slot['path'] = [];
  for (let current: object | null = value; current; current = Object.getPrototypeOf(current)) {
    if (path.length === 32) throw Error('Drawing command prototype bound exceeded');
    path.push({owner: current, prototype: Object.getPrototypeOf(current)});
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      if (typeof descriptor.get !== 'function' || descriptor.set !== undefined) throw Error('Drawing command facade accessor mismatch');
      return {owner: current, key, descriptor, path};
    }
  }
  throw Error('Drawing command facade accessor mismatch');
}
function same(a: PropertyDescriptor | undefined, b: PropertyDescriptor): boolean {
  return !!a && Object.is(a.value, b.value) && a.get === b.get && a.set === b.set && a.enumerable === b.enumerable && a.configurable === b.configurable && a.writable === b.writable;
}
function unchanged(field: Slot): void {
  for (const part of field.path) {
    if (Object.getPrototypeOf(part.owner) !== part.prototype) throw Error('Drawing command prototype retired');
    const actual = Object.getOwnPropertyDescriptor(part.owner, field.key);
    if (part.owner === field.owner ? !same(actual, field.descriptor) : actual !== undefined) throw Error('Drawing command descriptor retired: ' + String(field.key));
  }
}
function orderedIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 128) throw Error('Duplicate requires 1..128 ordered targets');
  const ids: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field || !Object.hasOwn(field, 'value') || typeof field.value !== 'string' || !field.value || field.value.length > 4096 || ids.includes(field.value)) throw Error('Duplicate requires unique bounded data IDs');
    ids.push(field.value);
  }
  return Object.freeze(ids);
}
function syncVoid(answer: unknown): void {if (answer !== undefined) throw Error('Drawing command callback must return synchronous void');}
function synchronousReceipt(answer: unknown): DrawingDuplicateReceipt {
  if (!answer || typeof answer !== 'object') throw Error('Drawing Duplicate must return a synchronous receipt');
  let depth = 0;
  for (let current: object | null = answer; current; current = Object.getPrototypeOf(current)) {
    if (++depth > 32) throw Error('Drawing Duplicate receipt prototype bound exceeded');
    const then = Object.getOwnPropertyDescriptor(current,'then');
    if (then && (!Object.hasOwn(then,'value') || typeof then.value === 'function')) throw Error('Drawing Duplicate must return a synchronous receipt, not a Promise or thenable');
  }
  return answer as DrawingDuplicateReceipt;
}
function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error.slice(0,900);
  if (error && typeof error === 'object') {const field = Object.getOwnPropertyDescriptor(error,'message'); if (field && Object.hasOwn(field,'value') && typeof field.value === 'string') return field.value.slice(0,900);}
  return 'Drawing command could not finish. Details are unavailable.';
}

/** Internal sole-popup seam. The returned closure remains bound to this exact registration. */
export function resolveDrawingDuplicatePopupPort(port: DrawingDuplicatePopupPort, renderer: NativeRenderer, controller: object, popup: object): PopupInvoke {
  const owner = popupPorts.get(port);
  if (!owner || owner.renderer !== renderer || owner.controller !== controller || owner.popup !== popup) throw Error('Duplicate popup port is foreign or unavailable');
  owner.assert();
  return (ids, assertActionOwner, closeOwnedPopup) => {owner.assert(); return owner.invoke(ids, assertActionOwner, closeOwnedPopup);};
}

/** Routes admitted native commands into one host-owned canonical/workspace transaction. */
/** Window Shift keydown/keyup (capture phase) feed `onShift`; returns the remover. No-op without a window. */
function listenShiftKeys(onShift:(shift:boolean)=>void):(()=>void)|undefined{
  const target=globalThis as {addEventListener?:unknown;removeEventListener?:unknown};
  if(typeof target.addEventListener!=='function'||typeof target.removeEventListener!=='function')return undefined;
  const events=globalThis as unknown as Window;
  const listener=(event:KeyboardEvent)=>{if(event.key==='Shift')onShift(event.type==='keydown');};
  events.addEventListener('keydown',listener,true);events.addEventListener('keyup',listener,true);
  return()=>{events.removeEventListener('keydown',listener,true);events.removeEventListener('keyup',listener,true);};
}
export function installDrawingCommandRouter(renderer: NativeRenderer, chart: Vela, host: DrawingCommandRouterHost): DrawingCommandRouter {
  if (!(renderer instanceof NativeRenderer) || installations.has(renderer)) throw Error('Drawing command router already owned or unsupported');
  // Vela exposes `drawings` as a prototype getter over its own `drawingsControl` data field.
  const orchestrator = data(chart, 'orchestrator'), facade = data(chart, 'drawingsControl'), core = data(facade, 'ctrl'), controller = data(renderer, 'userDrawings'), port = data(core, 'port'), popup = data(controller, 'popup');
  const accessor = accessorSlot(chart, 'drawings'), readDrawings = accessor.descriptor.get!;
  if (readDrawings !== VELA_DRAWINGS_GETTER || Reflect.apply(readDrawings, chart, []) !== facade) throw Error('Drawing command facade accessor mismatch');
  const fields = [slot(chart,'orchestrator'),slot(orchestrator,'renderer'),slot(chart,'drawingsControl'),accessor,slot(facade,'ctrl'),slot(core,'port'),slot(renderer,'userDrawings'),slot(controller,'popup'),slot(controller,'interaction')];
  if (data(orchestrator,'renderer') !== renderer) throw Error('Drawing command renderer mismatch');
  const callbacks = new Map<string, Slot>();
  for (const key of ['captureOwner','assertMutable','duplicate','history','historyStatus']) {const field = slot(host,key); if (typeof field.descriptor.value !== 'function') throw Error('Drawing command host callback unavailable'); callbacks.set(key,field);}
  const errorCapture = Object.getOwnPropertyDescriptor(host,'captureErrorOwner'),errorSink = Object.getOwnPropertyDescriptor(host,'reportError');
  if (!!errorCapture !== !!errorSink) throw Error('Drawing command error callbacks must be supplied together');
  if (errorCapture && errorSink) for (const key of ['captureErrorOwner','reportError']) {const field = slot(host,key); if (typeof field.descriptor.value !== 'function') throw Error('Drawing command error callbacks must be data functions'); callbacks.set(key,field);}
  const erasePublish=Object.getOwnPropertyDescriptor(host,'erase'),eraseMutable=Object.getOwnPropertyDescriptor(host,'assertEraseMutable');
  if(!!erasePublish!==!!eraseMutable)throw Error('Drawing eraser callbacks must be supplied together');
  if(erasePublish&&eraseMutable)for(const key of ['erase','assertEraseMutable']){const field=slot(host,key);if(typeof field.descriptor.value!=='function')throw Error('Drawing eraser callbacks must be data functions');callbacks.set(key,field);}
  const lockGate=Object.getOwnPropertyDescriptor(host,'drawingsLocked');
  if(lockGate){const field=slot(host,'drawingsLocked');if(typeof field.descriptor.value!=='function')throw Error('Drawing lock callback must be a data function');callbacks.set('drawingsLocked',field);}
  const clipboardCopy=Object.getOwnPropertyDescriptor(host,'copy'),clipboardPaste=Object.getOwnPropertyDescriptor(host,'paste');
  if(!!clipboardCopy!==!!clipboardPaste)throw Error('Drawing clipboard callbacks must be supplied together');
  const clipboard=!!clipboardCopy;
  if(clipboard)for(const key of ['copy','paste']){const field=slot(host,key);if(typeof field.descriptor.value!=='function')throw Error('Drawing clipboard callbacks must be data functions');callbacks.set(key,field);}
  const intent = slot(controller,'intentCb');
  if (typeof intent.descriptor.value !== 'function') throw Error('Drawing command original intent callback unavailable');
  const methods = new Map<string, Slot>(), facadePrototype = Object.getPrototypeOf(facade);
  for (const key of ['clone','duplicate','undo','redo','canUndo','canRedo',...(clipboard?['copyToClipboard','paste']:[])]) {
    if (Object.hasOwn(facade,key)) throw Error('Drawing command facade method already owned: ' + key);
    const field = slot(facade,key,true); if (typeof field.descriptor.value !== 'function') throw Error('Drawing command facade method unavailable'); methods.set(key,{...field,path:field.path.slice(1)});
  }
  const eraseMethods=new Map<string,Slot>();
  if(erasePublish)for(const key of ['pointerDown','pointerMove','pointerUp','setMode','toggleEraser','exitEraser','toggleMeasure','exitMeasure','setActiveTool']){
    if(Object.hasOwn(controller,key))throw Error('Drawing eraser native method already owned: '+key);
    const field=slot(controller,key,true);if(typeof field.descriptor.value!=='function')throw Error('Drawing eraser native method unavailable: '+key);
    eraseMethods.set(key,{...field,path:field.path.slice(1)});
  }
  const token = {}, writes: Write[] = [];
  let active = true, retired = false, busy = false, closing = false;
  let deleteRegistration:OwnedDrawingDeleteRegistration|undefined;
  let shiftKeys:(()=>void)|undefined;
  type EraseOwner={live:boolean;checking:boolean;started:boolean;mode:number;source:()=>void;pointer:()=>void;flag:PropertyDescriptor;lease:DrawingEraseGesture};
  let eraseOwner:EraseOwner|undefined,eraseGeneration=0,modeGeneration=0;
  let erasePointer:{owner:EraseOwner;kind:string}|undefined,eraseHit:{owner:EraseOwner;used:boolean}|undefined;
  installations.set(renderer,token);
  function base(): void {
    if (!active || retired || installations.get(renderer) !== token) throw Error('Drawing command installation retired');
    try {
      for (const field of fields) unchanged(field);
      if (Reflect.apply(readDrawings, chart, []) !== facade) throw Error('Drawing command facade accessor retired');
      if (Object.getPrototypeOf(facade) !== facadePrototype) throw Error('Drawing command facade prototype retired');
      for (const field of callbacks.values()) unchanged(field);
      for (const field of methods.values()) unchanged(field);
      for (const field of eraseMethods.values()) unchanged(field);
      for (const write of writes) if (!same(Object.getOwnPropertyDescriptor(write.receiver,write.key),write.installed)) throw Error('Drawing command owned slot replaced: ' + write.key);
      deleteRegistration?.assertCurrent();
    } catch (error) {retired = true; throw error;}
  }
  function callHost(key: string, args: unknown[] = []): any {const field = callbacks.get(key)!; unchanged(field); return Reflect.apply(field.descriptor.value,host,args);}
  function nativeEligible(): void {
    if (data(core,'enabled') !== true) throw Error('Drawing commands are disabled');
    const state = data(data(controller,'interaction'),'state');
    if (data(state,'kind') !== 'idle' || data(controller,'activeTool') !== null || data(controller,'textEditor') !== null || data(controller,'measureMode') !== false || data(controller,'eraserMode') !== false) throw Error('Finish the active drawing gesture or text editor before this command');
  }
  function eraseEligible():void{
    if(data(core,'enabled')!==true)throw Error('Drawing commands are disabled');
    const state=data(data(controller,'interaction'),'state'),selected=data(controller,'selectedIds');
    if(data(state,'kind')!=='idle'||data(controller,'activeTool')!==null||data(controller,'textEditor')!==null||data(controller,'measureMode')!==false||data(controller,'eraserMode')!==true)throw Error('The native eraser mode or drawing interaction changed');
    if(!(selected instanceof Set)||Object.getPrototypeOf(selected)!==Set.prototype||Reflect.apply(Object.getOwnPropertyDescriptor(Set.prototype,'size')!.get!,selected,[])!==0)throw Error('Clear drawing selection before erasing');
    const flag=Object.getOwnPropertyDescriptor(controller,'erasing');
    if(!flag||!Object.hasOwn(flag,'value')||typeof flag.value!=='boolean'||flag.writable!==true)throw Error('Native eraser input flag is unavailable');
  }
  function retireErase(owner:EraseOwner):void{
    if(!owner.live)return;owner.live=false;
    if(eraseOwner!==owner)return;eraseOwner=undefined;const generation=++eraseGeneration;
    // Cleanup has no raw-pointer prerequisite: an up/cancel sample may already
    // have retired. Source, mode, slot and newer gesture ownership still apply.
    try{
      const own=()=>{base();if(eraseOwner||eraseGeneration!==generation||modeGeneration!==owner.mode)throw Error('Native eraser cleanup owner changed');};
      own();syncVoid(owner.source());own();
      const flag=Object.getOwnPropertyDescriptor(controller,'erasing');
      if(!flag||!Object.hasOwn(flag,'value')||typeof flag.value!=='boolean'||flag.writable!==owner.flag.writable||flag.configurable!==owner.flag.configurable||flag.enumerable!==owner.flag.enumerable)throw Error('Native eraser flag changed');
      Object.defineProperty(controller,'erasing',{...flag,value:false});
    }catch{/* Never clear a replacement source, controller, descriptor or gesture. */}
  }
  function assertErase(owner:EraseOwner):void{
    if(!owner.live||eraseOwner!==owner||owner.checking){retireErase(owner);throw Error('Drawing eraser pointer owner retired or reentered');}
    owner.checking=true;
    try{
      const own=()=>{base();if(!owner.live||eraseOwner!==owner||modeGeneration!==owner.mode)throw Error('Drawing eraser pointer or mode owner changed');eraseEligible();};
      own();syncVoid(owner.source());own();syncVoid(owner.pointer());own();
    }catch(error){retireErase(owner);throw error;}finally{owner.checking=false;}
  }
  function beginEraseGesture(assertPointerOwner:()=>void):DrawingEraseGesture{
    base();if(closing||!erasePublish)throw Error('The prepared eraser route is unavailable');
    if(typeof assertPointerOwner!=='function')throw Error('Drawing eraser requires a current pointer assertion');
    if(busy||eraseOwner)throw Error('Another drawing command or eraser gesture is in progress');
    busy=true;let owner:EraseOwner|undefined;
    try{
      const generation=modeGeneration,source=callHost('captureOwner');base();if(typeof source!=='function')throw Error('Drawing eraser source owner unavailable');
      syncVoid(source());base();syncVoid(assertPointerOwner());base();eraseEligible();
      if(modeGeneration!==generation||data(controller,'erasing')!==false)throw Error('Drawing eraser input changed before acquisition');
      const flag=Object.getOwnPropertyDescriptor(controller,'erasing')!;
      let lease:DrawingEraseGesture;
      const receiver=(value:unknown)=>{if(value!==lease)throw Error('Foreign drawing eraser gesture receiver');};
      lease=Object.freeze({assertCurrent(this:DrawingEraseGesture){receiver(this);assertErase(owner!);},finish(this:DrawingEraseGesture){receiver(this);retireErase(owner!);},cancel(this:DrawingEraseGesture){receiver(this);retireErase(owner!);}});
      owner={live:true,checking:false,started:false,mode:generation,source,pointer:assertPointerOwner,flag,lease};eraseOwner=owner;eraseGeneration++;
      assertErase(owner);syncVoid(callHost('assertMutable'));assertErase(owner);syncVoid(callHost('assertEraseMutable'));assertErase(owner);return lease;
    }catch(error){if(owner)retireErase(owner);throw error;}finally{busy=false;}
  }
  function eraseIntent(value:unknown):void{
    const hit=eraseHit,owner=hit?.owner??erasePointer?.owner??eraseOwner;
    try{
      if(!hit||!owner||hit.owner!==owner||erasePointer?.owner!==owner||hit.used)throw Error('Drawing eraser intent is outside its one-hit owner');
      hit.used=true;assertErase(owner);
      if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==2||!Object.hasOwn(value,'kind')||!Object.hasOwn(value,'ids'))throw Error('Drawing eraser requires one exact delete intent');
      const ids=data(value,'ids');
      if(!Array.isArray(ids)||Object.getPrototypeOf(ids)!==Array.prototype||ids.length!==1||Reflect.ownKeys(ids).length!==2)throw Error('Drawing eraser requires one dense target ID');
      const id=orderedIds(ids)[0];
      command(assert=>{
        const current=()=>{assert();assertErase(owner);};current();syncVoid(callHost('assertEraseMutable'));current();
        const answer=callHost('erase',[id,current]);base();
        const receipt=synchronousReceipt(answer),receiptIds=data(receipt,'ids');
        if(!Array.isArray(receiptIds)||receiptIds.length!==1||data(receiptIds,'0')!==id||data(receipt,'nativeState')!=='complete'||data(receipt,'canonicalAccepted')!==true||data(receipt,'workspaceAcknowledged')!==true||data(receipt,'observersComplete')!==true)throw Error('Drawing eraser transaction did not complete with its exact receipt');
        base();return receipt;
      },()=>assertErase(owner),false);
    }catch(error){if(owner)retireErase(owner);throw error;}
  }
  function nativeEraseCall(key:string,args:readonly unknown[],forward?:()=>unknown):unknown{
    const invokeOriginal=forward??(()=>Reflect.apply(eraseMethods.get(key)!.descriptor.value as Method,controller,args));
    base();
    if(key!=='deleteAt'&&!key.startsWith('pointer')){
      // Conservative LV policy: even an idempotent mode/tool attempt retires an
      // active pointer. Reference behavior for this edge remains unobserved.
      const generation=modeGeneration,owner=eraseOwner;if(owner)retireErase(owner);base();
      if(eraseOwner||modeGeneration!==generation)throw Error('Drawing eraser mode change was reentered');
      modeGeneration++;return invokeOriginal();
    }
    if(data(controller,'eraserMode')!==true){if(erasePointer){retireErase(erasePointer.owner);throw Error('Drawing eraser mode changed during its pointer invocation');}return invokeOriginal();}
    const owner=eraseOwner;
    if(!owner){if(key==='deleteAt')throw Error('Drawing eraser has no current pointer owner');return undefined;}
    if(key==='deleteAt'){
      const prior=eraseHit;
      try{
        assertErase(owner);if(erasePointer?.owner!==owner||prior||args.length<2||args.length>3||args[2]!==undefined&&args[2]!==false||typeof args[0]!=='number'||typeof args[1]!=='number'||!Number.isFinite(args[0])||!Number.isFinite(args[1]))throw Error('Drawing eraser hit is not a current primary pointer invocation');
        const hit={owner,used:false};eraseHit=hit;
        const result=invokeOriginal();assertErase(owner);
        if(typeof result!=='boolean'||result!==hit.used)throw Error('Drawing eraser native hit did not match its intent');return result;
      }catch(error){retireErase(owner);throw error;}finally{eraseHit=prior;}
    }
    try{
      assertErase(owner);if(erasePointer)throw Error('Drawing eraser pointer invocation reentered');
      if(key==='pointerDown'){if(owner.started)throw Error('Drawing eraser pointer down was repeated');owner.started=true;}
      else if(!owner.started){if(key==='pointerUp'){retireErase(owner);return undefined;}throw Error('Drawing eraser move preceded its pointer down');}
      erasePointer={owner,kind:key};
      const result=invokeOriginal();assertErase(owner);return result;
    }catch(error){retireErase(owner);throw error;}finally{if(erasePointer?.owner===owner)erasePointer=undefined;if(key==='pointerUp')retireErase(owner);}
  }
  function command<T>(action: (assert: () => void) => T, external?: () => void, duplicateAdmission = true): T {
    base(); if (busy) throw Error('Drawing command already in progress'); busy = true; let live = true,errorOwner:(()=>void)|undefined;
    try {
      if (callbacks.has('captureErrorOwner')) {const acquired = callHost('captureErrorOwner'); base(); if (typeof acquired !== 'function') throw Error('Drawing command error owner unavailable'); const assertErrorOwner = acquired as () => void; errorOwner = assertErrorOwner; syncVoid(assertErrorOwner()); base();}
      const source = callHost('captureOwner'); base(); if (typeof source !== 'function') throw Error('Drawing command source owner unavailable');
      let failed = false, checking = false;
      const assert = () => {
        if (!live || failed || checking) {failed = true; throw Error('Drawing command action retired or reentered');}
        checking = true;
        try {base(); syncVoid(source()); base(); if (external) {syncVoid(external()); base();} if (duplicateAdmission) nativeEligible();}
        catch (error) {failed = true; throw error;}
        finally {checking = false;}
      };
      assert(); syncVoid(callHost('assertMutable')); assert();
      return action(assert);
    } catch (error) {
      // Reporting never replaces the operation error, grants mutation authority,
      // or recursively starts another command while this invocation is busy.
      if (errorOwner) try {
        const current = () => {base(); syncVoid(errorOwner!()); base(); if (external) {syncVoid(external()); base();} syncVoid(errorOwner!()); base();};
        current(); const message = errorMessage(error); current(); syncVoid(callHost('reportError',[message])); current();
      } catch { /* A stale owner or failed observer receives no retry. */ }
      throw error;
    } finally {live = false; busy = false;}
  }
  function duplicate(input: unknown, external?: () => void, close?: () => void): DrawingDuplicateReceipt {
    const ids = orderedIds(input);
    return command(assert => {
      if (close) {assert(); syncVoid(close()); assert(); syncVoid(callHost('assertMutable')); assert();}
      const answer = callHost('duplicate',[ids,assert]);
      // Host acceptance can legitimately replace source/selection; never rerun the old action here.
      base();
      const receipt = synchronousReceipt(answer); base(); return receipt;
    },external);
  }
  function copy(input: unknown): void {const ids = orderedIds(input); command(assert => {assert(); syncVoid(callHost('copy',[ids,assert])); base();},undefined,false);}
  function paste(): DrawingDuplicateReceipt {
    return command(assert => {assert(); const answer = callHost('paste',[assert]); base(); const receipt = synchronousReceipt(answer); base(); return receipt;});
  }
  function history(direction: 'undo' | 'redo'): void {command(assert => {assert(); syncVoid(callHost('history',[direction,assert]));},undefined,false);}
  function status(which: 'canUndo' | 'canRedo'): boolean {
    base(); if (busy) throw Error('Drawing command already in progress'); busy = true;
    try {const answer = callHost('historyStatus'); base(); const value = data(answer,which); if (typeof value !== 'boolean') throw Error('Workspace history status must be boolean'); return value;} finally {busy = false;}
  }
  function install(receiver: object, key: string, wrapper: Method, previous?: PropertyDescriptor): void {
    base();
    const current = Object.getOwnPropertyDescriptor(receiver,key);
    if (previous ? !same(current,previous) : current !== undefined) throw Error('Drawing command slot was acquired by another owner: ' + key);
    const installed = previous ? {...previous,value:wrapper} : {value:wrapper,writable:true,configurable:true,enumerable:false};
    const write = {receiver,key,previous,wrapper,installed}; writes.push(write);
    Object.defineProperty(receiver,key,installed);
    if (!same(Object.getOwnPropertyDescriptor(receiver,key),installed)) throw Error('Drawing command installation did not retain its slot');
  }
  function cleanup(): unknown[] {
    closing=true;
    if(eraseOwner)retireErase(eraseOwner);
    const errors: unknown[] = [];
    if(shiftKeys)try{shiftKeys();}catch(error){errors.push(error);}finally{shiftKeys=undefined;}
    if(deleteRegistration)try{deleteRegistration.dispose();}catch(error){errors.push(error);}finally{deleteRegistration=undefined;}
    active = false; retired = true; if (installations.get(renderer) === token) installations.delete(renderer);
    for (const write of [...writes].reverse()) try {
      const current = Object.getOwnPropertyDescriptor(write.receiver,write.key);
      if (!current && !write.previous) continue;
      if (!same(current,write.installed)) {errors.push(Error('Drawing command cleanup preserved replacement: ' + write.key)); continue;}
      if (write.previous) Object.defineProperty(write.receiver,write.key,write.previous); else if (!Reflect.deleteProperty(write.receiver,write.key)) throw Error('Drawing command cleanup could not remove: ' + write.key);
      if (write.previous ? !same(Object.getOwnPropertyDescriptor(write.receiver,write.key),write.previous) : Object.hasOwn(write.receiver,write.key)) throw Error('Drawing command cleanup verification failed: ' + write.key);
    } catch (error) {errors.push(error);}
    return errors;
  }
  let router: DrawingCommandRouter;
  const popupPort = Object.freeze({kind:'lv-drawing-duplicate-popup' as const});
  try {
    install(controller,'intentCb',function(intentValue: unknown) {
      if (this !== controller) throw Error('Drawing command intent receiver changed'); base();
      const kind = data(intentValue,'kind');
      if (kind === 'duplicate') {duplicate(data(intentValue,'ids')); return;}
      if (kind === 'undo' || kind === 'redo') {history(kind); return;}
      if (clipboard && kind === 'copy') {copy(data(intentValue,'ids')); return;}
      if (clipboard && kind === 'paste') {paste(); return;}
      if(kind==='delete'&&erasePublish&&(eraseHit||erasePointer||data(controller,'eraserMode')===true)){eraseIntent(intentValue);return;}
      if (kind === 'delete' && lockGate) {const locked = callHost('drawingsLocked'); base(); if (typeof locked !== 'boolean') throw Error('Drawing lock state must be boolean'); if (locked) return;}
      return Reflect.apply(intent.descriptor.value,controller,[intentValue]);
    },intent.descriptor);
    for (const key of methods.keys()) install(facade,key,function(...args: unknown[]) {
      if (this !== facade) throw Error('Drawing command facade receiver changed'); base();
      if (key === 'canUndo' || key === 'canRedo') return status(key);
      if (key === 'copyToClipboard') {copy(args[0]); return facade;}
      if (key === 'paste') {paste(); return facade;}
      if (key === 'undo' || key === 'redo') history(key); else duplicate(key === 'clone' ? [args[0]] : args[0]);
      return facade;
    });
    // Shift grabs a drawing (axis lock on handle and body drags); a Shift click still toggles selection.
    const interaction=data(controller,'interaction') as NativeDrawingInteraction,quality=createDrawingInteractionQuality(interaction);
    for(const key of DRAWING_INTERACTION_QUALITY_KEYS)install(interaction,key,quality[key] as Method);
    // A Shift press or release with the pointer still re-applies the live drag with the new axis lock.
    shiftKeys=listenShiftKeys(shift=>{quality.shiftKey.call(interaction,shift);});
    for(const key of eraseMethods.keys())install(controller,key,function(...args:unknown[]){if(this!==controller)throw Error('Drawing eraser native method receiver changed');return nativeEraseCall(key,args);});
    if(erasePublish)deleteRegistration=registerOwnedDrawingDeleteDispatch(renderer,{dispatch(invocation){return nativeEraseCall('deleteAt',invocation.args,()=>invocation.invoke());}});
    base();
    popupPorts.set(popupPort,{renderer,controller,popup,assert:base,invoke:(ids,assert,close)=>duplicate(ids,assert,close)});
    router = Object.freeze({
      duplicate(this: DrawingCommandRouter, ids: readonly string[]) {if (this !== router) throw Error('Drawing command router receiver changed'); return duplicate(ids);},
      copy(this: DrawingCommandRouter, ids: readonly string[]) {if (this !== router) throw Error('Drawing command router receiver changed'); if (!clipboard) throw Error('The drawing clipboard is unavailable'); return copy(ids);},
      paste(this: DrawingCommandRouter) {if (this !== router) throw Error('Drawing command router receiver changed'); if (!clipboard) throw Error('The drawing clipboard is unavailable'); return paste();},
      beginEraseGesture(this:DrawingCommandRouter,assertPointerOwner:()=>void){if(this!==router)throw Error('Drawing eraser router receiver changed');return beginEraseGesture(assertPointerOwner);},
      popupPort,
      dispose(this: DrawingCommandRouter) {if (this !== router) throw Error('Drawing command router receiver changed'); if (!active) return; popupPorts.delete(popupPort); const errors = cleanup(); if (errors.length) throw new AggregateError(errors,'Drawing command router cleanup failed');},
    });
    return router;
  } catch (error) {popupPorts.delete(popupPort); const errors = cleanup(); if (errors.length) throw new AggregateError([error,...errors],'Drawing command router installation and cleanup failed'); throw error;}
}
