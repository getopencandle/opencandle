import {deserializeDrawing, Drawing, type SerializedDrawing} from '@luxalgo/vela';
import {measureWorkspaceJSON} from '../ui/workspace-json';
import {assertNativeDrawingMatchesCanonical} from './drawing-canonical';

/**
 * Adapter-owned instance seams (the derived-drawing intent mapper) that the command guard may
 * temporarily shadow and must restore exactly. Only the exact registered function is admitted.
 */
const intentSeams = new WeakMap<object, Function>();
export function registerDrawingIntentSeam(ctrl: object, seam: Function): void { intentSeams.set(ctrl, seam); }
function idleOwn(hook: Hook, own: PropertyDescriptor | undefined, equal: (a: PropertyDescriptor | undefined, b: PropertyDescriptor) => boolean): boolean {
  return hook.seam ? equal(own, hook.seam) : own === undefined;
}
/** Required instance methods in the installed Vela 0.8.4 command boundary. */
export const DRAWING_DUPLICATE_NATIVE_METHODS = Object.freeze({
  core: Object.freeze(['reserveIds','setTool','setSnapMode','setStayMode','setMode','showToolbar','setFavorite','setFavorites','pushFavorites','setToolDefaults','resetToolDefaults','setToolTemplates','saveToolTemplate','removeToolTemplate','pushTemplates','setToolbar','setExternalGhost','setToolShortcuts','add','remove','update','updateMany','removeMany','setLocked','setVisible','bringToFront','sendToBack','select','openSettings','undo','redo','duplicate','clone','copy','paste','fromJSON','destroy','setSelection','announceSelection','restoreSnapshot','deleteMany','insertClones','updateDrawing','captureDefaults','onIntent']),
  store: Object.freeze(['reserveIds','nextId','add','remove','update','bringToFront','sendToBack','setLocked','setVisible','clear','load','bumpSeqPast','onChange']),
  history: Object.freeze(['begin','markDirty','commit','abort','record','undo','redo','clear','push']),
});
const providerReads = {
  core: ['constructor','supported','getTool','getSnapMode','getStayMode','getMode','favorites','isFavorite','toolDefaults','toolTemplates','seriesTopZ','seriesBottomZ','startZ','canUndo','canRedo','all','toJSON','resolve','sync'],
  store: ['constructor','get','has','all','byPane','serialize','emit'],
  history: ['constructor','canUndo','canRedo'],
} as const;

export interface NativeDrawingInsertHost {
  /** Trusted exact source/prefix/replay/pane and genuine canonical-stage assertion. */
  assertCurrent(): void;
  /** Complete workspace candidate capacity, not merely the drawing document. */
  assertWorkspaceCapacity(): void;
}
export interface NativeDrawingInsertResult {
  readonly state: 'complete' | 'not-forwarded' | 'forwarded-incomplete';
  /** Native insertion never accepts the separate canonical/workspace transaction. */
  readonly canonicalAccepted: false;
  readonly ids: readonly string[];
  readonly attemptedIds: readonly string[];
  readonly cleanupComplete: boolean;
  readonly diagnostics: readonly string[];
}
export interface NativeDrawingInsert {
  insert(): NativeDrawingInsertResult;
  assertCurrent(): void;
  /** One mint after native completion and the host's genuine canonical acceptance.
   * The receipt remains unarmed until this helper is successfully disposed. */
  captureAcceptedValueOwner(): NativeDrawingAcceptedValueOwner;
  /** Removes only this helper's method wrappers, never native drawings or history. */
  dispose(): void;
}
/** Exactly one prepared native target; canonical/workspace acceptance is separate. */
export interface NativeDrawingRemovalResult extends NativeDrawingInsertResult {}
export interface NativeDrawingRemoval {
  remove(): NativeDrawingRemovalResult;
  assertCurrent(): void;
  captureAcceptedValueOwner(): NativeDrawingAcceptedValueOwner;
  /** Releases owned wrappers only, never reinserts a removed model. */
  dispose(): void;
}
type NativeDrawingMutation = NativeDrawingInsert | NativeDrawingRemoval;
/** Current accepted values only; no post-disposal mutation epoch or action authority. */
export interface NativeDrawingAcceptedValueOwner {
  assertCurrent(): void;
}

type Data = Record<string, unknown>;
type Method = (...args: unknown[]) => unknown;
interface Slot {
  owner: object;
  key: string;
  descriptor: PropertyDescriptor;
  path: readonly {owner: object; prototype: object | null}[];
}
interface Hook {
  receiver: object;
  key: string;
  provider: Slot;
  wrapper: Method;
  installed?: PropertyDescriptor;
  writeCompleted?: boolean;
  /** A registered adapter intent seam that owns this slot before and after the command. */
  seam?: PropertyDescriptor;
}
interface ModelOwner {
  model: Drawing;
  id: string;
  slots: Slot[];
  serialize: Method;
  serialized: SerializedDrawing;
}
interface AcceptedNode {
  readonly value: object;
  readonly prototype: object | null;
  readonly fields: readonly (readonly [PropertyKey, Readonly<PropertyDescriptor>])[];
}
const claims = new WeakMap<object, object>();
const nativeMapGet = Map.prototype.get;
const nativeMapEntries = Map.prototype.entries;
const nativeMapSize = Object.getOwnPropertyDescriptor(Map.prototype, 'size')!.get!;
const nativeSetValues = Set.prototype.values;

// Only the provider/hook segment below uses these retained intrinsics. Its
// admission also pins operations removed by indexed traversal: a substituted
// old iterator/method must keep the original exhaustive observation path.
const providerGetDescriptor = Object.getOwnPropertyDescriptor;
const providerGetPrototype = Object.getPrototypeOf;
const providerOwnKeys = Reflect.ownKeys;
const providerApply = Reflect.apply;
const providerObjectIs = Object.is;
const providerFreeze = Object.freeze;
const providerMapPrototype = Map.prototype, providerSetPrototype = Set.prototype;
const providerArrayIterator = providerGetPrototype([][Symbol.iterator]());
const providerMapIterator = providerGetPrototype(new Map()[Symbol.iterator]());
const providerIntrinsicPins = providerFreeze([
  [globalThis,'Object'],[globalThis,'Reflect'],[globalThis,'Map'],[globalThis,'Set'],
  [Object,'getOwnPropertyDescriptor'],[Object,'getPrototypeOf'],[Object,'is'],[Reflect,'ownKeys'],[Reflect,'apply'],
  [Map,'prototype'],[Set,'prototype'],
  [Array.prototype,Symbol.iterator],[providerArrayIterator,'next'],[Array.prototype,'some'],
  [Map.prototype,Symbol.iterator],[providerMapIterator,'next'],[Map.prototype,'has'],[Map.prototype,'size'],
].map(([owner,key]) => {
  const receiver=owner as object, property=key as PropertyKey;
  return providerFreeze({owner:receiver,key:property,prototype:providerGetPrototype(receiver),descriptor:providerFreeze({...providerGetDescriptor(receiver,property)!})});
}));
function providerDescriptorEqual(a:PropertyDescriptor|undefined,b:Readonly<PropertyDescriptor>):boolean {
  return !!a && providerObjectIs(a.value,b.value) && a.get===b.get && a.set===b.set && a.writable===b.writable && a.enumerable===b.enumerable && a.configurable===b.configurable;
}
function providerIntrinsicsCurrent():boolean {
  for(let index=0;index<providerIntrinsicPins.length;index++){
    const pin=providerIntrinsicPins[index];
    if(providerGetPrototype(pin.owner)!==pin.prototype || !providerDescriptorEqual(providerGetDescriptor(pin.owner,pin.key),pin.descriptor))return false;
  }
  return true;
}

function slot(root: unknown, key: string, inherited = false): Slot {
  if (!root || typeof root !== 'object') throw Error('Duplicate native owner unavailable: ' + key);
  const path: {owner: object; prototype: object | null}[] = [];
  for (let owner: object | null = root; owner; owner = inherited ? Object.getPrototypeOf(owner) : null) {
    if (path.length === 32) throw Error('Duplicate native prototype chain unavailable.');
    path.push({owner, prototype: Object.getPrototypeOf(owner)});
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    if (descriptor) {
      if (!Object.hasOwn(descriptor, 'value')) throw Error('Duplicate native data field required: ' + key);
      return {owner, key, descriptor, path};
    }
  }
  throw Error('Duplicate required native method or data missing: ' + key);
}
function sameDescriptor(a: PropertyDescriptor | undefined, b: PropertyDescriptor): boolean {
  return !!a && Object.is(a.value, b.value) && a.get === b.get && a.set === b.set && a.writable === b.writable && a.enumerable === b.enumerable && a.configurable === b.configurable;
}
function unchanged(value: Slot): void {
  for (const part of value.path) {
    if (Object.getPrototypeOf(part.owner) !== part.prototype) throw Error('Duplicate native prototype changed: ' + value.key);
    const field = Object.getOwnPropertyDescriptor(part.owner, value.key);
    if (part.owner === value.owner) {
      if (!sameDescriptor(field, value.descriptor)) throw Error('Duplicate native descriptor changed: ' + value.key);
    } else if (field) throw Error('Duplicate native method provider changed: ' + value.key);
  }
}
function bounded(value: unknown) {
  const size = measureWorkspaceJSON({value});
  if (size.bytes > 16 * 1024 * 1024 || size.nodes > 300000 || size.depth > 40) throw Error('Duplicate native document resource bound exceeded.');
  return size;
}
function message(value: unknown): string {
  // Error formatting must not invoke an arbitrary thrown object's hooks.
  if (typeof value === 'string') return value.slice(0, 900);
  if (value && typeof value === 'object') {
    try {
      const field = Object.getOwnPropertyDescriptor(value, 'message');
      if (field && Object.hasOwn(field, 'value') && typeof field.value === 'string') return field.value.slice(0, 900);
    } catch { /* A thrown Proxy is not permitted to replace the operation outcome. */ }
  }
  return 'Duplicate native operation failed with an unavailable diagnostic.';
}
function plainModel(model: Drawing) {
  const data: Data = {};
  const descriptors = Object.getOwnPropertyDescriptors(model);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') throw Error('Duplicate native model symbol field unavailable.');
    const field = descriptors[key];
    if (!Object.hasOwn(field, 'value')) throw Error('Duplicate native model requires data fields.');
    if (typeof field.value !== 'function') data[key] = field.value;
  }
  return bounded(data);
}

/**
 * ISOLATED trusted adapter prerequisite, not an activated Duplicate command.
 * Observes supported core/store/history calls, including no-op/failed attempts.
 * Direct model/collection reflection and renderer previews are outside the epoch.
 * After forwarding, failure NEVER removes drawings, resets history, or resyncs.
 */
export function prepareNativeDrawingInsert(
  facade: object,
  projectedInput: readonly SerializedDrawing[],
  host: NativeDrawingInsertHost,
): NativeDrawingInsert {
  return prepareNativeDrawingMutation(facade, projectedInput, host, 'insert') as NativeDrawingInsert;
}

/** Prepares one exact existing model for removal without invoking core delete/history. */
export function prepareNativeDrawingRemoval(
  facade: object,
  projectedExpectedRows: readonly SerializedDrawing[],
  host: NativeDrawingInsertHost,
): NativeDrawingRemoval {
  return prepareNativeDrawingMutation(facade, projectedExpectedRows, host, 'remove') as NativeDrawingRemoval;
}

function prepareNativeDrawingMutation(
  facade: object,
  projectedInput: readonly SerializedDrawing[],
  host: NativeDrawingInsertHost,
  operation: 'insert' | 'remove',
): NativeDrawingMutation {
  // Own the caller's bounded data before the first host/native callback. The
  // source authority is a separate trusted host assertion, not array identity.
  bounded(projectedInput);
  if (!Array.isArray(projectedInput) || Object.getPrototypeOf(projectedInput) !== Array.prototype || projectedInput.length < 1 || projectedInput.length > 128) throw Error('Duplicate native insertion count bound exceeded.');
  if (operation === 'remove' && projectedInput.length !== 1) throw Error('Native eraser removal requires exactly one expected drawing.');
  const rows = structuredClone(projectedInput);
  const assertHost = slot(host, 'assertCurrent'), capacityHost = slot(host, 'assertWorkspaceCapacity');
  if (typeof assertHost.descriptor.value !== 'function' || typeof capacityHost.descriptor.value !== 'function') throw Error('Duplicate host assertions unavailable.');
  const ctrlSlot = slot(facade, 'ctrl'), core = ctrlSlot.descriptor.value as object;
  const storeSlot = slot(core, 'store'), historySlot = slot(core, 'history');
  const store = storeSlot.descriptor.value as object, history = historySlot.descriptor.value as object;
  const mapSlot = slot(store, 'byId'), listenerSlot = slot(store, 'listeners');
  const map = mapSlot.descriptor.value as Map<string, Drawing>, listeners = listenerSlot.descriptor.value as Set<unknown>;
  if (!map || Object.getPrototypeOf(map) !== Map.prototype || !listeners || Object.getPrototypeOf(listeners) !== Set.prototype) throw Error('Duplicate native map/listener ownership unavailable.');
  // Erasing forwards no allocator, selection or history command. Pin their
  // scalar/container ownership as well as the shared supported-method epoch.
  // Direct edits inside preexisting history records remain outside that epoch.
  const removalFields: Slot[] = [];
  let removalReservations: Set<unknown> | undefined, reservationValues: unknown[] = [];
  if (operation === 'remove') {
    removalFields.push(slot(store,'seq'),slot(store,'zCounter'),slot(store,'reservedIds'),slot(core,'selectedIds'));
    for (const key of ['cap','undoStack','redoStack','pending','dirtied','depth']) removalFields.push(slot(history,key));
    const selection = removalFields[3].descriptor.value;
    if (!Array.isArray(selection) || Object.getPrototypeOf(selection) !== Array.prototype || selection.length !== 0) throw Error('Native eraser requires an empty drawing selection.');
    removalFields.push(slot(selection,'length'));
    for (const key of ['undoStack','redoStack']) {
      const stack = slot(history,key).descriptor.value;
      if (!Array.isArray(stack) || Object.getPrototypeOf(stack) !== Array.prototype) throw Error('Native eraser history ownership unavailable.');
      removalFields.push(slot(stack,'length'));
    }
    removalReservations = removalFields[2].descriptor.value;
    if (!removalReservations || Object.getPrototypeOf(removalReservations) !== Set.prototype) throw Error('Native eraser reservations unavailable.');
    reservationValues = [...Reflect.apply(nativeSetValues,removalReservations,[])];
    if (reservationValues.length > 10000) throw Error('Native eraser reservation bound exceeded.');
  }
  const owner = {};
  if (claims.has(core)) throw Error('Duplicate native command is already owned.');
  const fixed = [assertHost, capacityHost, ctrlSlot, storeSlot, historySlot, mapSlot, listenerSlot,
    slot(store, 'get', true), slot(store, 'all', true), slot(store, 'serialize', true), slot(store, 'emit', true), slot(core, 'sync', true), slot(core, 'port'), slot(core, 'events'),
    slot(Map.prototype, 'get'), slot(Map.prototype, 'entries'), slot(Set.prototype, 'values')];
  const hooks: Hook[] = [];
  const ownerPrototypes = [facade, core, store, history].map(value => ({value, prototype: Object.getPrototypeOf(value)}));
  const providerShapes: {provider: object; fields: Map<PropertyKey, PropertyDescriptor>}[] = [];
  const indexedProviders: {provider:object;prototype:object|null;fields:readonly (readonly [PropertyKey,Readonly<PropertyDescriptor>])[]}[]=[];
  let indexedProvidersAdmitted=true;
  for (const [kind, receiver] of [['core', core], ['store', store], ['history', history]] as const) {
    const names = DRAWING_DUPLICATE_NATIVE_METHODS[kind];
    const provider = Object.getPrototypeOf(receiver);
    if (!provider) throw Error('Duplicate native method provider unavailable.');
    const keys = Reflect.ownKeys(provider), expectedKeys = new Set<string>([...names, ...providerReads[kind]]);
    if (keys.length !== expectedKeys.size || keys.some(key => typeof key !== 'string' || !expectedKeys.has(key))) throw Error('Duplicate pinned native provider manifest changed: ' + kind);
    const fields = new Map<PropertyKey, PropertyDescriptor>();
    for (const key of keys) {
      const field = Object.getOwnPropertyDescriptor(provider, key)!;
      if (kind === 'core' && key === 'supported') {
        if (typeof field.get !== 'function' || field.set !== undefined) throw Error('Duplicate pinned native supported getter changed.');
      } else if (!Object.hasOwn(field, 'value') || typeof field.value !== 'function') throw Error('Duplicate pinned native method requires a data function.');
      fields.set(key, field);
    }
    providerShapes.push({provider, fields});
    const providerPrototype=providerGetPrototype(provider);
    const indexedFields:(readonly [PropertyKey,Readonly<PropertyDescriptor>])[]=[],indexedKeys=providerOwnKeys(provider);
    if(indexedKeys.length!==providerApply(nativeMapSize,fields,[]))indexedProvidersAdmitted=false;
    for(let index=0;index<indexedKeys.length;index++){
      const key=indexedKeys[index],field=providerApply(nativeMapGet,fields,[key]) as PropertyDescriptor|undefined;
      if(!field || !providerDescriptorEqual(providerGetDescriptor(provider,key),field)){indexedProvidersAdmitted=false;break;}
      indexedFields[index]=providerFreeze([key,providerFreeze({...field})] as const);
    }
    indexedProviders[indexedProviders.length]=providerFreeze({provider,prototype:providerPrototype,fields:providerFreeze(indexedFields)});
    for (const key of names) {
      let seam: PropertyDescriptor | undefined;
      if (Object.hasOwn(receiver, key)) {
        const own = Object.getOwnPropertyDescriptor(receiver, key)!;
        if (kind !== 'core' || key !== 'onIntent' || intentSeams.get(receiver) !== own.value || typeof own.value !== 'function' || !own.writable || !own.configurable) throw Error('Duplicate native method is already owned: ' + key);
        seam = {...own};
      }
      const field = slot(provider, key);
      if (typeof field.descriptor.value !== 'function') throw Error('Duplicate required native method unavailable: ' + key);
      // This is the only path eligible for manifest reuse. Fixed inherited
      // slots retain their original complete prototype traversal.
      if(field.path.length!==1 || field.owner!==provider || field.path[0].owner!==provider || field.path[0].prototype!==providerPrototype || !providerDescriptorEqual(providerApply(nativeMapGet,fields,[key]),field.descriptor))indexedProvidersAdmitted=false;
      hooks.push({receiver, key, provider: field, wrapper: () => undefined, seam});
    }
  }
  providerFreeze(indexedProviders);
  const indexedHooks:{readonly hook:Hook;readonly receiver:object;readonly key:string}[]=[];
  for(let index=0;index<hooks.length;index++){
    const hook=hooks[index];indexedHooks[index]=providerFreeze({hook,receiver:hook.receiver,key:hook.key});
  }
  providerFreeze(indexedHooks);
  const listenerOwners = [...Reflect.apply(nativeSetValues, listeners, [])];
  if (listenerOwners.length > 10000 || Reflect.apply(nativeMapSize, map, []) > 10000) throw Error('Duplicate native collection resource bound exceeded.');
  let phase: 'preparing' | 'ready' | 'running' | 'complete' | 'failed' = 'preparing';
  let active = true, retired = false, checking = false, attempts = 0n, expected = 0n;
  let permit: {hook: Hook; model: Drawing; id: string} | undefined;
  const attemptedIds: string[] = [], initial: ModelOwner[] = [], inserted: ModelOwner[] = [], removed: ModelOwner[] = [], prepared: ModelOwner[] = [];
  const acquired: Hook[] = [];
  let snapshotBytes = 0, snapshotNodes = 0;
  let lease: NativeDrawingMutation;
  const retainedModels = (): ModelOwner[] => operation === 'insert' ? [...initial, ...inserted] : initial.filter(item => !removed.includes(item));
  let removalData: readonly AcceptedNode[] | undefined;
  let mintConsumed = false, minting = false;
  let accepted: {
    state: 'unarmed' | 'armed' | 'retired'; checking: boolean;
    models: readonly ModelOwner[];
    data: readonly AcceptedNode[];
    targets?: ReadonlyMap<ModelOwner, readonly AcceptedNode[]>;
  } | undefined;

  function structural(restored = false): void {
    if (restored ? active || claims.has(core) : !active || claims.get(core) !== owner) throw Error('Duplicate native command retired or replaced.');
    for (const field of fixed) unchanged(field);
    for (const field of removalFields) unchanged(field);
    if (removalReservations) {
      if (Object.getPrototypeOf(removalReservations) !== Set.prototype) throw Error('Native eraser reservations changed.');
      const values = [...Reflect.apply(nativeSetValues,removalReservations,[])];
      if (values.length !== reservationValues.length || values.some((value,index) => value !== reservationValues[index])) throw Error('Native eraser reservations changed.');
    }
    for (const item of ownerPrototypes) if (Object.getPrototypeOf(item.value) !== item.prototype) throw Error('Duplicate native command provider changed.');
    if(indexedProvidersAdmitted && providerIntrinsicsCurrent()){
      // No iterator, callback, coercion or dynamic method dispatch occurs in
      // this trusted native-data segment. Nothing is cached beyond this call.
      for(let index=0;index<indexedProviders.length;index++){
        const item=indexedProviders[index];
        if(providerGetPrototype(item.provider)!==item.prototype)throw Error('Duplicate native prototype changed.');
        if(providerOwnKeys(item.provider).length!==item.fields.length)throw Error('Duplicate pinned native provider manifest changed.');
        for(let fieldIndex=0;fieldIndex<item.fields.length;fieldIndex++){
          const pair=item.fields[fieldIndex],key=pair[0],field=pair[1];
          if(!providerDescriptorEqual(providerGetDescriptor(item.provider,key),field))throw Error('Duplicate pinned native provider descriptor changed.');
        }
      }
      if(providerGetPrototype(map)!==providerMapPrototype || providerGetPrototype(listeners)!==providerSetPrototype)throw Error('Duplicate native collections changed.');
      for(let index=0;index<indexedHooks.length;index++){
        const item=indexedHooks[index],own=providerGetDescriptor(item.receiver,item.key),installed=item.hook.installed;
        if(restored||!installed?!idleOwn(item.hook,own,providerDescriptorEqual):!providerDescriptorEqual(own,installed))throw Error('Duplicate native wrapper ownership changed: '+item.key);
      }
      return;
    }
    // Changed intrinsic admission or an unproved path retains the original
    // exhaustive behavior, including its substituted iterator callbacks.
    for (const item of providerShapes) {
      const keys = Reflect.ownKeys(item.provider);
      if (keys.length !== item.fields.size || keys.some(key => !item.fields.has(key))) throw Error('Duplicate pinned native provider manifest changed.');
      for (const [key, field] of item.fields) if (!sameDescriptor(Object.getOwnPropertyDescriptor(item.provider, key), field)) throw Error('Duplicate pinned native provider descriptor changed.');
    }
    if (Object.getPrototypeOf(map) !== Map.prototype || Object.getPrototypeOf(listeners) !== Set.prototype) throw Error('Duplicate native collections changed.');
    for (const hook of hooks) {
      unchanged(hook.provider);
      const own = Object.getOwnPropertyDescriptor(hook.receiver, hook.key);
      if (restored || !hook.installed ? !idleOwn(hook, own, sameDescriptor) : !sameDescriptor(own, hook.installed)) throw Error('Duplicate native wrapper ownership changed: ' + hook.key);
    }
  }
  function current(): void {
    if (retired || checking) { retired = true; throw Error('Duplicate native command retired or assertion reentered.'); }
    checking = true;
    try {
      structural();
      if (attempts !== expected) throw Error('Duplicate native mutation attempt retired the command.');
      const finalListeners = [...Reflect.apply(nativeSetValues, listeners, [])];
      if (finalListeners.length !== listenerOwners.length || finalListeners.some((value, index) => value !== listenerOwners[index])) throw Error('Duplicate native listeners changed.');
      for (const item of prepared) for (const field of item.slots) unchanged(field);
      if (removalData) dataNodesCurrent(removalData);
      const answer = Reflect.apply(assertHost.descriptor.value, host, []);
      if (answer !== undefined) throw Error('Duplicate host assertion must finish synchronously.');
      if (retired) throw Error('Duplicate native command retired during its assertion.');
      structural();
      if (removalData) dataNodesCurrent(removalData);
      if (attempts !== expected) throw Error('Duplicate native mutation attempt retired the command.');
      const actualListeners = [...Reflect.apply(nativeSetValues, listeners, [])];
      if (actualListeners.length !== listenerOwners.length || actualListeners.some((value, index) => value !== listenerOwners[index])) throw Error('Duplicate native listeners changed.');
      const retained = retainedModels();
      for (const item of retained) {
        for (const field of item.slots) unchanged(field);
        if (Reflect.apply(nativeMapGet, map, [item.id]) !== item.model) throw Error('Duplicate native model membership changed.');
      }
      if (Reflect.apply(nativeMapSize, map, []) !== retained.length) throw Error('Duplicate native membership count changed.');
      if (operation === 'remove') {
        const entries = [...Reflect.apply(nativeMapEntries, map, [])] as [string, Drawing][];
        if (entries.some(([id, model], index) => id !== retained[index].id || model !== retained[index].model)) throw Error('Native eraser survivor order changed.');
      }
      if (retired) throw Error('Duplicate native command retired during its assertion.');
    } catch (error) { retired = true; throw error; }
    finally { checking = false; }
  }
  function cleanup(): unknown[] {
    active = false; retired = true; permit = undefined;
    if (claims.get(core) === owner) claims.delete(core);
    const errors: unknown[] = [];
    for (const hook of acquired.slice().reverse()) {
      try {
        const actual = Object.getOwnPropertyDescriptor(hook.receiver, hook.key);
        if (!hook.writeCompleted && (hook.seam ? sameDescriptor(actual, hook.seam) : actual === undefined)) continue;
        if (!sameDescriptor(actual, hook.installed!)) { errors.push(Error('Duplicate cleanup preserved a foreign method: ' + hook.key)); continue; }
        if (!Reflect.deleteProperty(hook.receiver, hook.key)) throw Error('Duplicate method cleanup failed: ' + hook.key);
        if (hook.seam) Object.defineProperty(hook.receiver, hook.key, hook.seam);
        const remaining = Object.getOwnPropertyDescriptor(hook.receiver, hook.key);
        if (hook.seam ? !sameDescriptor(remaining, hook.seam) : remaining !== undefined) throw Error(sameDescriptor(remaining, hook.installed!) ? 'Duplicate method cleanup did not remove its wrapper: ' + hook.key : 'Duplicate cleanup preserved a replacement method: ' + hook.key);
      } catch (error) { errors.push(error); }
    }
    return errors;
  }
  function observeAttempt(): void { attempts++; retired = true; }
  for (const hook of hooks) {
    hook.wrapper = function(this: unknown, ...args: unknown[]) {
      if (this !== hook.receiver) throw Error('Duplicate native method receiver changed.');
      structural();
      attempts++;
      if (permit && permit.hook === hook && args.length === 1 && args[0] === (operation === 'insert' ? permit.model : permit.id) && phase === 'running') {
        attemptedIds.push(permit.id); permit = undefined; expected = attempts;
      } else retired = true;
      const answer = Reflect.apply(hook.seam ? hook.seam.value : hook.provider.descriptor.value, this, args);
      if (hook.receiver === store && hook.key === 'onChange' && typeof answer === 'function') {
        return (...removeArgs: unknown[]) => {
          if (active) observeAttempt();
          return Reflect.apply(answer, undefined, removeArgs);
        };
      }
      return answer;
    };
  }
  function capture(model: Drawing, expectedRow?: SerializedDrawing): ModelOwner {
    if (!(model instanceof Drawing)) throw Error('Duplicate native drawing model unsupported.');
    plainModel(model); current();
    const fields = [slot(model, 'id'), slot(model, 'type'), slot(model, 'paneId'), slot(model, 'serialize', true)];
    const id = fields[0].descriptor.value, serialize = fields[3].descriptor.value;
    if (typeof id !== 'string' || !id || id.length > 4096 || typeof serialize !== 'function') throw Error('Duplicate native model identity unavailable.');
    const row = Reflect.apply(serialize, model, []) as SerializedDrawing; current();
    for (const field of fields) unchanged(field);
    const size = bounded(row);
    snapshotBytes += size.bytes; snapshotNodes += size.nodes;
    if (snapshotBytes > 16 * 1024 * 1024 || snapshotNodes > 300000) throw Error('Duplicate native snapshot aggregate bound exceeded.');
    const copied = structuredClone(row); current();
    for (const field of fields) unchanged(field);
    if (!copied || typeof copied !== 'object' || copied.id !== id || copied.type !== fields[1].descriptor.value || copied.paneId !== fields[2].descriptor.value) throw Error('Duplicate native serialized identity mismatch.');
    assertNativeDrawingMatchesCanonical(expectedRow ?? copied, copied); current();
    return {model, id, slots: fields, serialize, serialized: copied};
  }
  function verifyModels(): void {
    // current() is a full-state proof, O(models). One proof before the first and after each
    // native callback (serialize) is the whole obligation: plainModel and the canonical compare
    // are pure reads, so proofs between them re-prove an unchanged state.
    current();
    for (const item of retainedModels()) {
      plainModel(item.model);
      const actual = Reflect.apply(item.serialize, item.model, []) as SerializedDrawing; current();
      assertNativeDrawingMatchesCanonical(item.serialized, actual);
    }
  }
  // Private current-value proof: full graph at entry/return, complete target
  // graph around callbacks. Shared nodes belong to every reaching target.
  // See drawing-duplicate-current-values-amendment.json for the explicit change
  // from observing every other row after every callback. No pins escape or
  // mutate live models; selection/allocator state remains outside this proof.
  function acceptedData(models: readonly ModelOwner[]) {
    const data: AcceptedNode[] = [], known = new Map<object, AcceptedNode>();
    let bytes = 0, nodes = 0;
    const visit = (value: object) => {
      if (known.has(value)) return;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const fields = Object.freeze(Reflect.ownKeys(descriptors).map(key => Object.freeze([key, Object.freeze(descriptors[key as string])] as const)));
      const node: AcceptedNode = Object.freeze({value, prototype: Object.getPrototypeOf(value), fields});
      known.set(value, node); data.push(node);
      for (const [, field] of fields) {
        if (!Object.hasOwn(field, 'value')) throw Error('Duplicate accepted native data requires data descriptors.');
        if (field.value && typeof field.value === 'object') visit(field.value);
      }
    };
    for (const item of models) {
      const size = plainModel(item.model); bytes += size.bytes; nodes += size.nodes;
      if (bytes > 16 * 1024 * 1024 || nodes > 300000) throw Error('Duplicate accepted native data exceeds its aggregate bound.');
      visit(item.model);
    }
    const targets = new Map<ModelOwner, readonly AcceptedNode[]>();
    let references = 0;
    for (const item of models) {
      const reached = new Set<AcceptedNode>(), pending = [known.get(item.model)!];
      while (pending.length) {
        const node = pending.pop()!;
        if (reached.has(node)) continue;
        // Indexing is an optimization, never a new post-forward admission
        // failure. Keep the exhaustive proof if sharing exceeds its budget.
        if (++references > 300000) return {data: Object.freeze(data), targets: undefined};
        reached.add(node);
        for (const [, field] of node.fields) if (field.value && typeof field.value === 'object') pending.push(known.get(field.value)!);
      }
      targets.set(item, Object.freeze([...reached]));
    }
    return {data: Object.freeze(data), targets};
  }
  function acceptedCommon(restored: boolean): void {
    if (!accepted || accepted.state === 'retired') throw Error('Duplicate accepted value owner retired.');
    structural(restored);
    if (!restored && (retired || attempts !== expected)) throw Error('Duplicate accepted value owner lost insertion authority.');
    const members = [...Reflect.apply(nativeSetValues, listeners, [])];
    if (members.length !== listenerOwners.length || members.some((member, index) => member !== listenerOwners[index])) throw Error('Duplicate accepted native listeners changed.');
    assertAcceptedLifetime();
  }
  function dataNodesCurrent(data: readonly AcceptedNode[]): void {
    for (const item of data) {
      if (Object.getPrototypeOf(item.value) !== item.prototype) throw Error('Duplicate accepted native data provider changed.');
      const keys = Reflect.ownKeys(item.value);
      if (keys.length !== item.fields.length || item.fields.some(([key, field], index) => keys[index] !== key || !sameDescriptor(Object.getOwnPropertyDescriptor(item.value, key), field))) throw Error('Duplicate accepted native values changed.');
    }
  }
  function acceptedNodes(data: readonly AcceptedNode[]): void {
    dataNodesCurrent(data);
    assertAcceptedLifetime();
  }
  function acceptedStructure(restored: boolean): void {
    acceptedCommon(restored);
    const entries = [...Reflect.apply(nativeMapEntries, map, [])] as [string, Drawing][];
    if (entries.length !== accepted!.models.length || entries.some(([id, model], index) => id !== accepted!.models[index].id || model !== accepted!.models[index].model)) throw Error('Duplicate accepted native membership or order changed.');
    for (const item of accepted!.models) for (const field of item.slots) unchanged(field);
    acceptedNodes(accepted!.data);
  }
  function acceptedTarget(restored: boolean, item: ModelOwner): void {
    acceptedCommon(restored);
    if (Reflect.apply(nativeMapSize, map, []) !== accepted!.models.length || Reflect.apply(nativeMapGet, map, [item.id]) !== item.model) throw Error('Duplicate accepted native target membership changed.');
    for (const field of item.slots) unchanged(field);
    const data = accepted!.targets!.get(item);
    if (!data) throw Error('Duplicate accepted target proof unavailable.');
    acceptedNodes(data);
  }
  function assertAcceptedLifetime(): void {
    if (!accepted || accepted.state === 'retired') throw Error('Duplicate accepted value owner retired.');
  }
  function acceptedValues(restored: boolean): void {
    acceptedStructure(restored);
    const indexed = !!accepted!.targets;
    const checkHost = (item?: ModelOwner, final = false) => {
      const answer = Reflect.apply(assertHost.descriptor.value, host, []);
      if (answer !== undefined) throw Error('Duplicate accepted host assertion must finish synchronously.');
      if (!indexed || final) acceptedStructure(restored);
      else if (item) acceptedTarget(restored, item);
      else acceptedCommon(restored);
    };
    checkHost();
    for (const item of accepted!.models) {
      if (indexed) acceptedTarget(restored, item);
      const actual = Reflect.apply(item.serialize, item.model, []) as SerializedDrawing;
      if (indexed) acceptedTarget(restored, item); else acceptedStructure(restored);
      assertNativeDrawingMatchesCanonical(item.serialized, actual);
      // The canonical compare is a pure read: the proof after serialize and the one inside checkHost(item) bracket the host callback.
      checkHost(item);
    }
    checkHost(undefined, true);
  }
  function result(state: NativeDrawingInsertResult['state'], errors: unknown[], cleanupComplete: boolean): NativeDrawingInsertResult {
    return Object.freeze({state, canonicalAccepted: false as const, ids: Object.freeze(prepared.map(row => row.id)), attemptedIds: Object.freeze([...attemptedIds]), cleanupComplete, diagnostics: Object.freeze(errors.slice(0, 32).map(message))});
  }
  claims.set(core, owner);
  try {
    // Populate the initial identity set before current() checks total membership.
    const existing = [...Reflect.apply(nativeMapEntries, map, [])] as [string, Drawing][];
    for (const [id, model] of existing) {
      if (!(model instanceof Drawing)) throw Error('Duplicate native model unsupported.');
      const fields = [slot(model, 'id'), slot(model, 'type'), slot(model, 'paneId'), slot(model, 'serialize', true)];
      if (fields[0].descriptor.value !== id || typeof fields[3].descriptor.value !== 'function') throw Error('Duplicate initial native identity mismatch.');
      initial.push({model, id, slots: fields, serialize: fields[3].descriptor.value, serialized: undefined as unknown as SerializedDrawing});
    }
    current();
    for (const hook of hooks) {
      structural();
      const descriptor = {value: hook.wrapper, writable: true, configurable: true, enumerable: false};
      // Track the attempted slot before acquisition: an injected write may
      // install our descriptor and then throw instead of returning normally.
      hook.installed = descriptor; acquired.push(hook);
      Object.defineProperty(hook.receiver, hook.key, descriptor); hook.writeCompleted = true;
      current();
    }
    for (let index = 0; index < initial.length; index++) initial[index] = capture(initial[index].model);
    if (operation === 'remove') {
      // A later host callback must not change an already checked target before
      // forwarding its ID. Pin the original graph, then verify those values
      // against the detached serialization captured for every existing row.
      removalData = acceptedData(initial).data;
      verifyModels(); current();
    }
    if (operation === 'insert' && initial.length + rows.length > 10000) throw Error('Duplicate native insertion count bound exceeded.');
    const ids = new Set<string>();
    for (const row of rows) {
      if (operation === 'remove') {
        if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || row.id.length > 4096) throw Error('Native eraser expected identity is unavailable.');
        if (typeof row.paneId !== 'string' || !row.paneId || row.paneId.length > 4096 || !Array.isArray(row.anchors) || row.anchors.length > 10000 || row.anchors.some((anchor: SerializedDrawing['anchors'][number]) => !anchor || !Number.isFinite(anchor.time) || !Number.isFinite(anchor.price))) throw Error('Native eraser projected geometry is unavailable.');
        if (row.props && Array.isArray(row.props.levels) && row.props.levels.length > 2048 || row.text && typeof row.text.value === 'string' && row.text.value.length > 20000) throw Error('Native eraser level/text resource bound exceeded.');
        const item = initial.find(value => value.id === row.id);
        if (!item) throw Error('Native eraser expected drawing is missing.');
        assertNativeDrawingMatchesCanonical(row, item.serialized); current();
        if (item.serialized.locked || item.serialized.visible === false) throw Error('Native eraser target must be unlocked and visible.');
        prepared.push(item);
        continue;
      }
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || row.id.length > 4096 || ids.has(row.id) || Reflect.apply(nativeMapGet, map, [row.id])) throw Error('Duplicate fresh native IDs required.');
      if (typeof row.zIndex !== 'number' || !Number.isSafeInteger(row.zIndex) || row.zIndex <= 0) throw Error('Duplicate positive safe stacking value required.');
      if (typeof row.paneId !== 'string' || !row.paneId || row.paneId.length > 4096) throw Error('Duplicate explicit projected pane required.');
      if (!Array.isArray(row.anchors) || row.anchors.length > 10000 || row.anchors.some((anchor: unknown) => !anchor || typeof anchor !== 'object' || !Number.isFinite((anchor as Data).time) || !Number.isFinite((anchor as Data).price))) throw Error('Duplicate bounded finite projected anchors required.');
      if (row.props && Array.isArray(row.props.levels) && row.props.levels.length > 2048 || row.text && typeof row.text.value === 'string' && row.text.value.length > 20000) throw Error('Duplicate native level/text resource bound exceeded.');
      ids.add(row.id); current();
      const model = deserializeDrawing(row);
      if (!model) throw Error('Duplicate native drawing type unsupported.');
      prepared.push(capture(model, row));
    }
    phase = 'ready';
    // The insert/remove lease method is a one-line delegate installed by the
    // explicitly typed operation branch below. It passes its own `this`, so the
    // receiver guard, phase guards and forwarding order below are unchanged.
    const mutate = (receiver: NativeDrawingMutation): NativeDrawingInsertResult => {
      if (receiver !== lease) throw Error('Duplicate insertion receiver changed.');
      if (phase !== 'ready') throw Error('Duplicate insertion already consumed.');
      phase = 'running';
      try {
        current();
        const capacity = Reflect.apply(capacityHost.descriptor.value, host, []); current();
        if (capacity !== undefined) throw Error('Duplicate workspace capacity must finish synchronously.');
        // Removal cannot accept a stale current ID and discover changed
        // geometry only after deleting it. Preserve insertion's old path.
        if (operation === 'remove') { verifyModels(); current(); }
        const mutation = hooks.find(hook => hook.receiver === store && hook.key === (operation === 'insert' ? 'add' : 'remove'))!;
        for (const item of prepared) {
          current();
          const actual = Reflect.apply(nativeMapGet, map, [item.id]);
          if (operation === 'insert' ? !!actual : actual !== item.model) throw Error(operation === 'insert' ? 'Duplicate native ID collided before insertion.' : 'Native eraser target changed before forwarding.');
          permit = {hook: mutation, model: item.model, id: item.id};
          const answer = Reflect.apply(mutation.wrapper, store, [operation === 'insert' ? item.model : item.id]);
          if (operation === 'insert') inserted.push(item); else removed.push(item);
          if (answer !== (operation === 'insert' ? item.model : true) || permit) throw Error(operation === 'insert' ? 'Duplicate native insertion was not exact.' : 'Native eraser removal was not exact.');
        }
        verifyModels(); current(); phase = 'complete';
        return result('complete', [], true);
      } catch (error) {
        phase = 'failed';
        const errors = cleanup();
        return result(attemptedIds.length ? 'forwarded-incomplete' : 'not-forwarded', [error, ...errors], errors.length === 0);
      }
    };
    const shared = {
      assertCurrent(this: NativeDrawingMutation): void {
        if (this !== lease) throw Error('Duplicate assertion receiver changed.');
        if (phase === 'running') throw Error('Duplicate insertion is already running.');
        current();
      },
      captureAcceptedValueOwner(this: NativeDrawingMutation): NativeDrawingAcceptedValueOwner {
        if (this !== lease) throw Error('Duplicate accepted value capture receiver changed.');
        if (minting || accepted?.checking) { retired = true; if (accepted) accepted.state = 'retired'; throw Error('Duplicate accepted value capture reentered.'); }
        if (mintConsumed) throw Error('Duplicate accepted value capture already consumed.');
        if (!active || phase !== 'complete') throw Error('Duplicate accepted value requires completed live insertion.');
        mintConsumed = true; minting = true;
        try {
          current(); verifyModels(); current();
          const models = Object.freeze(retainedModels()), proof = acceptedData(models);
          current();
          accepted = {state: 'unarmed', checking: true, models, data: proof.data, targets: proof.targets};
          acceptedValues(false); current();
          const receipt: NativeDrawingAcceptedValueOwner = Object.freeze({
            assertCurrent(this: NativeDrawingAcceptedValueOwner): void {
              if (this !== receipt) throw Error('Duplicate accepted value assertion receiver changed.');
              if (!accepted || accepted.state !== 'armed' || accepted.checking) {
                if (accepted) accepted.state = 'retired';
                throw Error('Duplicate accepted value owner unarmed, retired or assertion reentered.');
              }
              accepted.checking = true;
              try { acceptedValues(true); }
              catch (error) { accepted.state = 'retired'; throw error; }
              finally { accepted.checking = false; }
            },
          });
          accepted.checking = false;
          return receipt;
        } catch (error) { retired = true; if (accepted) accepted.state = 'retired'; throw error; }
        finally { minting = false; }
      },
      dispose(this: NativeDrawingMutation): void {
        if (this !== lease) throw Error('Duplicate disposal receiver changed.');
        if (!active) return;
        const canArm = !!accepted && accepted.state === 'unarmed' && !accepted.checking && !minting && phase === 'complete' && !retired;
        if (accepted && !canArm) accepted.state = 'retired';
        if (canArm) accepted!.checking = true;
        const errors = cleanup();
        if (canArm && errors.length === 0) {
          try { acceptedValues(true); accepted!.state = 'armed'; }
          catch (error) { errors.push(error); }
        }
        if (accepted) { accepted.checking = false; if (errors.length || !canArm) accepted.state = 'retired'; }
        if (errors.length) throw Error(errors.slice(0, 32).map(message).join(' | '));
      },
    };
    // Same frozen own-key order as before: operation method first, then shared.
    if (operation === 'insert') {
      const insertLease: NativeDrawingInsert = Object.freeze({
        insert(this: NativeDrawingMutation): NativeDrawingInsertResult { return mutate(this); },
        ...shared,
      });
      lease = insertLease;
    } else {
      const removalLease: NativeDrawingRemoval = Object.freeze({
        remove(this: NativeDrawingMutation): NativeDrawingRemovalResult { return mutate(this); },
        ...shared,
      });
      lease = removalLease;
    }
    return lease;
  } catch (error) {
    const errors = cleanup();
    if (errors.length) throw Error([error, ...errors].slice(0, 32).map(message).join(' | '));
    throw error;
  }
}
