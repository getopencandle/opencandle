import {createDrawing, deserializeDrawing, type SerializedDrawing} from '@luxalgo/vela';
import {expect, it} from 'vitest';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {DRAWING_DUPLICATE_NATIVE_METHODS, prepareNativeDrawingInsert, type NativeDrawingAcceptedValueOwner, type NativeDrawingInsert, type NativeDrawingInsertHost} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from './drawing-native-harness';
import {nativeResetHarness} from './native-drawing-reset-harness';

function row(index: number): SerializedDrawing {
  const value = createDrawing('trendline', {id: 'SYNTHETIC-value-original-' + index, paneId: 'price', zIndex: index + 1, anchors: [{time: 1000000, price: 100}, {time: 1240000, price: 200}]})!.serialize();
  value.props = {...value.props, lvTrendlineStats: {schemaVersion: 9, future: 'SYNTHETIC opaque statistics'}, future: {label: 'SYNTHETIC value owner'}};
  return value;
}

/** Actual pinned native controller/store/serializer and canonical insertion run.
 * Only renderer sinks (or the existing native popup harness DOM) are controlled. */
async function fixture(count = 1, withPopup = false) {
  const rows = Array.from({length: count}, (_, index) => row(index));
  const popup = withPopup ? await nativeResetHarness(rows) : undefined;
  const native = popup?.core ?? await nativeDrawingHarness(), document = popup?.document ?? new LosslessDrawingDocument();
  if (!popup) {document.load({version: 1, drawings: rows}); native.controller.fromJSON({version: 1, drawings: rows});}
  const originals = document.all();
  const copies = originals.map((value, index) => ({...structuredClone(value), id: 'SYNTHETIC-value-copy-' + index, zIndex: 20 + index}));
  const projected = copies.map(value => deserializeDrawing(value as unknown as SerializedDrawing)!.serialize());
  const canonical = document.prepareOwnedInsertBatch(originals, copies);
  let assertCanonical = () => canonical.assertCurrent(), sourceCurrent = true, hostAction = () => {}, hostResult: unknown, hostCalls = 0;
  const source = popup?.captureOwner() ?? (() => {});
  const host: NativeDrawingInsertHost = {
    assertCurrent() {hostCalls++; hostAction(); if (!sourceCurrent) throw Error('SYNTHETIC value source retired'); source(); assertCanonical(); return hostResult;},
    assertWorkspaceCapacity() {},
  };
  const facade = popup?.chart.drawings ?? {ctrl: native.controller};
  return {native, document, originals, copies, projected, canonical, facade, host, popup,
    prepare: (override = facade) => prepareNativeDrawingInsert(override, projected, host),
    complete(helper: NativeDrawingInsert) {canonical.stage(); expect(helper.insert().state).toBe('complete'); const receipt = canonical.accept(); assertCanonical = () => receipt.assertCurrent();},
    source(value: boolean) {sourceCurrent = value;}, onHost(action: () => void) {hostAction = action;}, hostResult(value: unknown) {hostResult = value;}, hostCalls: () => hostCalls,
    dispose() {if (popup) popup.dispose(); else native.dispose();},
  };
}

it('mints once before disposal, then repeatedly proves exact native values with one separate canonical acceptance', async () => {
  const f = await fixture(2), helper = f.prepare();
  try {
    const nativeHistory = f.native.controller.history.undoStack, defaults = f.native.controller.defaults;
    f.complete(helper);
    const models = f.copies.map(value => f.native.controller.store.get(value.id));
    const receipt = helper.captureAcceptedValueOwner();
    const calls = f.hostCalls();
    expect(() => helper.captureAcceptedValueOwner()).toThrow(/consumed/); expect(f.hostCalls()).toBe(calls);
    helper.dispose(); receipt.assertCurrent(); receipt.assertCurrent(); helper.dispose(); receipt.assertCurrent();
    expect(() => helper.assertCurrent()).toThrow(/retired/);
    expect(f.copies.map(value => f.native.controller.store.get(value.id))).toEqual(models);
    expect(f.document.all().slice(2)).toEqual(f.copies);
    expect(f.native.controller.history.undoStack).toBe(nativeHistory); expect(nativeHistory).toEqual([]);
    expect(f.native.controller.defaults).toBe(defaults); expect(f.native.selection()).toEqual([]);
    for (const [group, methods] of Object.entries(DRAWING_DUPLICATE_NATIVE_METHODS)) for (const key of methods) expect(Object.hasOwn(group === 'core' ? f.native.controller : f.native.controller[group], key), group + '.' + key).toBe(false);
  } finally {helper.dispose(); f.dispose();}
});

it('rejects early, copied and unbound capture without consuming a genuine completed mint', async () => {
  const f = await fixture(), helper = f.prepare();
  try {
    expect(() => helper.captureAcceptedValueOwner()).toThrow(/complete/);
    f.complete(helper);
    const calls = f.hostCalls();
    expect(() => helper.captureAcceptedValueOwner.call({...helper})).toThrow(/receiver/);
    const capture = helper.captureAcceptedValueOwner; expect(() => capture()).toThrow(/receiver/); expect(f.hostCalls()).toBe(calls);
    const receipt = helper.captureAcceptedValueOwner(); helper.dispose();
    expect(() => receipt.assertCurrent.call({...receipt})).toThrow(/receiver/);
    const assertion = receipt.assertCurrent; expect(() => assertion()).toThrow(/receiver/);
    receipt.assertCurrent();
  } finally {helper.dispose(); f.dispose();}
});

it('cannot arm a receipt whose unarmed assertion was already attempted', async () => {
  const f = await fixture(), helper = f.prepare();
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner();
    expect(() => receipt.assertCurrent()).toThrow(/unarmed/);
    helper.dispose(); expect(() => receipt.assertCurrent()).toThrow(/retired/);
    expect(() => helper.captureAcceptedValueOwner()).toThrow(/consumed|complete/);
  } finally {helper.dispose(); f.dispose();}
});

it.each(['source', 'canonical'] as const)('permanently retires accepted values after %s ownership changes', async kind => {
  const f = await fixture(), helper = f.prepare();
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner(); helper.dispose();
    if (kind === 'source') f.source(false); else f.document.undo();
    expect(() => receipt.assertCurrent()).toThrow(/retired|mutation/);
    if (kind === 'source') f.source(true); else f.document.redo();
    expect(() => receipt.assertCurrent()).toThrow(/retired/);
  } finally {helper.dispose(); f.dispose();}
});

it('keeps source failure before mint and failed insertion outside accepted authority', async () => {
  const f = await fixture(), helper = f.prepare();
  try {
    f.complete(helper); f.source(false);
    expect(() => helper.captureAcceptedValueOwner()).toThrow(/source retired/);
    f.source(true); expect(() => helper.captureAcceptedValueOwner()).toThrow(/consumed/);
  } finally {helper.dispose(); f.dispose();}
  const other = await fixture(), failed = other.prepare();
  try {other.source(false); expect(failed.insert().state).toBe('not-forwarded'); expect(() => failed.captureAcceptedValueOwner()).toThrow(/complete/);}
  finally {failed.dispose(); other.dispose();}
});

it.each(['throw-before', 'lie', 'delete-then-throw'] as const)('does not arm after %s cleanup and still attempts all other wrappers', async fault => {
  const f = await fixture(), core = f.native.controller;
  let enabled = false; const deleted: PropertyKey[] = [];
  const proxy = new Proxy(core, {deleteProperty(target, key) {
    deleted.push(key);
    if (enabled && key === 'onIntent') {
      if (fault === 'lie') return true;
      if (fault === 'delete-then-throw') Reflect.deleteProperty(target, key);
      throw Error('SYNTHETIC accepted cleanup failure');
    }
    return Reflect.deleteProperty(target, key);
  }});
  const helper = f.prepare({ctrl: proxy}); let installed: PropertyDescriptor | undefined;
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner();
    installed = Object.getOwnPropertyDescriptor(core, 'onIntent'); enabled = true;
    expect(() => helper.dispose()).toThrow(/cleanup|remov/i);
    expect(deleted.includes('reserveIds')).toBe(true); expect(deleted.includes('onIntent')).toBe(true);
    expect(Object.hasOwn(core, 'reserveIds')).toBe(false); expect(Object.hasOwn(core.store, 'add')).toBe(false);
    expect(() => receipt.assertCurrent()).toThrow(/retired|unarmed/);
  } finally {
    enabled = false;
    if (installed && Object.getOwnPropertyDescriptor(core, 'onIntent')?.value === installed.value) Reflect.deleteProperty(core, 'onIntent');
    helper.dispose(); f.dispose();
  }
});

it('preserves a foreign method and leaves the receipt unusable after otherwise complete cleanup', async () => {
  const f = await fixture(), helper = f.prepare(), core = f.native.controller, foreign = () => {};
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner();
    Object.defineProperty(core, 'onIntent', {value: foreign, configurable: true, writable: true});
    expect(() => helper.dispose()).toThrow(/foreign/); expect(core.onIntent).toBe(foreign);
    expect(Object.hasOwn(core.store, 'add')).toBe(false); expect(() => receipt.assertCurrent()).toThrow(/retired/);
  } finally {if (core.onIntent === foreign) Reflect.deleteProperty(core, 'onIntent'); helper.dispose(); f.dispose();}
});

it.each(['model', 'listener', 'source'] as const)('checks final %s ownership after cleanup callbacks before arming', async fault => {
  const f = await fixture(), core = f.native.controller; let enabled = false;
  const callback = () => {};
  const proxy = new Proxy(core, {deleteProperty(target, key) {
    const result = Reflect.deleteProperty(target, key);
    if (enabled && key === 'reserveIds') {
      if (fault === 'model') core.store.get(f.copies[0].id).anchors[0].price++;
      else if (fault === 'listener') core.store.listeners.add(callback);
      else f.source(false);
    }
    return result;
  }});
  const helper = f.prepare({ctrl: proxy});
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner(); enabled = true;
    expect(() => helper.dispose()).toThrow(/values|listener|source/);
    expect(Object.hasOwn(core, 'reserveIds')).toBe(false); expect(() => receipt.assertCurrent()).toThrow(/retired/);
  } finally {enabled = false; core.store.listeners.delete(callback); helper.dispose(); f.dispose();}
});

it.each(['equal replacement', 'order', 'value', 'listener', 'serializer'] as const)('rejects observed native %s changes and cannot revive after restoration', async fault => {
  const f = await fixture(), helper = f.prepare(), core = f.native.controller, store = core.store;
  let restore = () => {};
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner(); helper.dispose();
    const model = store.get(f.copies[0].id), callback = () => {};
    if (fault === 'equal replacement') {store.byId.set(model.id, deserializeDrawing(model.serialize())); restore = () => store.byId.set(model.id, model);}
    if (fault === 'order') {const entries = [...store.byId.entries()]; store.byId.delete(entries[0][0]); store.byId.set(entries[0][0], entries[0][1]); restore = () => {store.byId.clear(); for (const [id, value] of entries) store.byId.set(id, value);};}
    if (fault === 'value') {const price = model.anchors[0].price; model.anchors[0].price++; restore = () => {model.anchors[0].price = price;};}
    if (fault === 'listener') {store.listeners.add(callback); restore = () => store.listeners.delete(callback);}
    if (fault === 'serializer') {model.serialize = () => ({}); restore = () => {delete model.serialize;};}
    expect(() => receipt.assertCurrent()).toThrow(/changed/); restore();
    expect(() => receipt.assertCurrent()).toThrow(/retired/);
  } finally {restore(); helper.dispose(); f.dispose();}
});

it('checks all retained model data after the final host callback, including already-serialized rows', async () => {
  const f = await fixture(), helper = f.prepare();
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner(); helper.dispose();
    let calls = 0; f.onHost(() => {if (++calls === 4) f.native.controller.store.get(f.originals[0].id).anchors[0].price++;});
    expect(() => receipt.assertCurrent()).toThrow(/values changed/); expect(calls).toBe(4);
  } finally {f.onHost(() => {}); helper.dispose(); f.dispose();}
});

it('rejects a source change from an actual model serializer and invokes no replacement accessor', async () => {
  const f = await fixture(), model = f.native.controller.store.get(f.originals[0].id), original = model.serialize;
  let action = () => {}, reads = 0;
  model.serialize = function() {const result = Reflect.apply(original, this, []); action(); return result;};
  const helper = f.prepare();
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner(); helper.dispose();
    action = () => {f.source(false); Object.defineProperty(model.anchors[0], 'price', {get() {reads++; return 100;}, configurable: true, enumerable: true});};
    expect(() => receipt.assertCurrent()).toThrow(/source|values|data/); expect(reads).toBe(0);
  } finally {
    action = () => {}; Object.defineProperty(model.anchors[0], 'price', {value: 100, writable: true, configurable: true, enumerable: true}); delete model.serialize;
    helper.dispose(); f.dispose();
  }
});

it('permanently retires assertion reentry even when the host swallows the inner error', async () => {
  const f = await fixture(), helper = f.prepare();
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner(); helper.dispose();
    f.onHost(() => {try {receipt.assertCurrent();} catch { /* Outer assertion must still reject. */ }});
    expect(() => receipt.assertCurrent()).toThrow(/retired/); f.onHost(() => {}); expect(() => receipt.assertCurrent()).toThrow(/retired/);
  } finally {f.onHost(() => {}); helper.dispose(); f.dispose();}
});

it.each(['capture', 'dispose'] as const)('does not issue a receipt after swallowed %s reentry during mint', async action => {
  const f = await fixture(), helper = f.prepare();
  try {
    f.complete(helper);
    f.onHost(() => {try {if (action === 'capture') helper.captureAcceptedValueOwner(); else helper.dispose();} catch { /* Keep outer proof honest. */ }});
    expect(() => helper.captureAcceptedValueOwner()).toThrow(/retired|authority|reentered/);
    f.onHost(() => {}); expect(() => helper.captureAcceptedValueOwner()).toThrow(/consumed/);
  } finally {f.onHost(() => {}); helper.dispose(); f.dispose();}
});

it('rejects asynchronous host answers without acquiring thenable hooks', async () => {
  const f = await fixture(), helper = f.prepare(); let reads = 0;
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner(); helper.dispose();
    f.hostResult(Object.defineProperty({}, 'then', {get() {reads++; throw Error('SYNTHETIC forbidden then');}}));
    expect(() => receipt.assertCurrent()).toThrow(/synchronously/); expect(reads).toBe(0);
  } finally {helper.dispose(); f.dispose();}
});

it('allows actual post-accept reservations and selection/new popup without borrowing the old action', async () => {
  const f = await fixture(2, true), helper = f.prepare();
  try {
    f.complete(helper); const receipt = helper.captureAcceptedValueOwner(); helper.dispose();
    const models = f.copies.map(value => f.native.controller.store.get(value.id));
    f.native.controller.reserveIds(f.document.all().map(value => value.id));
    f.native.controller.select(f.copies.map(value => value.id));
    expect(f.native.selection()).toEqual(f.copies.map(value => value.id));
    expect(f.popup!.latest().drawings.map((value: SerializedDrawing) => value.id)).toEqual(f.copies.map(value => value.id));
    receipt.assertCurrent();
    expect(f.copies.map(value => f.native.controller.store.get(value.id))).toEqual(models);
    // This receipt deliberately proves current values, not native attempt history.
    f.native.controller.history.begin(f.native.controller.toJSON()); f.native.controller.history.abort();
    receipt.assertCurrent();
  } finally {helper.dispose(); f.dispose();}
});

it('retains an unarmed receipt if a cleanup callback tries to use it prematurely', async () => {
  const f = await fixture(), core = f.native.controller;
  let receipt: NativeDrawingAcceptedValueOwner | undefined, enabled = false, calls = 0;
  const proxy = new Proxy(core, {deleteProperty(target, key) {
    const removed = Reflect.deleteProperty(target, key);
    if (enabled && key === 'onIntent') {calls++; try {receipt!.assertCurrent();} catch { /* Final arming must still fail. */ }}
    return removed;
  }});
  const helper = f.prepare({ctrl: proxy});
  try {
    f.complete(helper); receipt = helper.captureAcceptedValueOwner(); enabled = true;
    expect(() => helper.dispose()).toThrow(/retired/); expect(calls).toBe(1); expect(() => receipt!.assertCurrent()).toThrow(/retired/);
  } finally {enabled = false; helper.dispose(); f.dispose();}
});
