import {expect, it} from 'vitest';
import {createDrawing, deserializeDrawing, type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {DRAWING_DUPLICATE_NATIVE_METHODS, prepareNativeDrawingInsert, type NativeDrawingInsertHost} from '../../src/chart/drawing-duplicate-native';
import {captureTrendlineStatisticsNativeOwner} from '../../src/chart/trendline-stats-owner';
import {captureInlineDrawingOwner} from '../../src/chart/drawing-inline-owner';
import {TRENDLINE_STATS_DEFAULTS} from '../../src/chart/trendline-stats-data';
import {nativeDrawingHarness} from './drawing-native-harness';
import {nativeResetHarness} from './native-drawing-reset-harness';

function row(id = 'SYNTHETIC-original', zIndex = 1): SerializedDrawing {
  const result = createDrawing('trendline', {id, paneId: 'price', zIndex, anchors: [{time: 1000000, price: 100}, {time: 1240000, price: 200}], style: {lineColor: '#123456', lineWidth: 3, lineStyle: 'solid'}})!.serialize();
  result.props = {...result.props, lvTrendlineStats: {schemaVersion: 1, priceRange: true, percentChange: true, barsRange: false, dateTimeRange: false, alwaysShow: false, position: 'above'}, futureData: {label: 'SYNTHETIC retained metadata'}};
  return result;
}
async function fixture(count = 1) {
  const native = await nativeDrawingHarness(), document = new LosslessDrawingDocument(), original = row();
  document.load({version: 1, drawings: [original]}); native.controller.fromJSON({version: 1, drawings: [original]});
  const sources = document.all();
  const copies = Array.from({length: count}, (_, index) => ({...structuredClone(sources[0]), id: 'SYNTHETIC-copy-' + index, zIndex: 2 + index}));
  const projected = copies.map(value => deserializeDrawing(value as unknown as SerializedDrawing)!.serialize());
  let sourceCurrent = true, capacityCalls = 0, hostAction = () => {}, capacityAction = () => {};
  const host: NativeDrawingInsertHost = {
    assertCurrent() { if (!sourceCurrent) throw Error('SYNTHETIC source retired.'); hostAction(); },
    assertWorkspaceCapacity() { capacityCalls++; capacityAction(); },
  };
  const facade = {ctrl: native.controller};
  return {native, document, sources, copies, projected, facade, host,
    prepare: () => prepareNativeDrawingInsert(facade, projected, host),
    retire: () => {sourceCurrent = false;}, source: (value: boolean) => {sourceCurrent = value;},
    capacityCalls: () => capacityCalls, onHost: (value: () => void) => {hostAction = value;}, onCapacity: (value: () => void) => {capacityAction = value;},
    dispose: () => native.dispose()};
}

it('inserts private exact-ID models with actual core sync and one separate canonical lease, preserving full future data', async () => {
  const f = await fixture(); let helper: ReturnType<typeof f.prepare> | undefined;
  try {
    const canonical = f.document.prepareOwnedInsertBatch(f.sources, f.copies), beforeNativeHistory = f.native.controller.history.undoStack, beforeDefaults = f.native.controller.defaults;
    canonical.stage(); f.onHost(() => canonical.assertCurrent());
    let emitted = 0; const originalSync = f.native.controller.port.syncDrawings;
    f.native.controller.port.syncDrawings = (rows: SerializedDrawing[]) => { emitted++; originalSync(rows); };
    helper = f.prepare(); const result = helper.insert();
    expect(result.state).toBe('complete'); expect(result.canonicalAccepted).toBe(false); expect(result.diagnostics).toEqual([]);
    expect(result.ids).toEqual(['SYNTHETIC-copy-0']); expect(result.attemptedIds).toEqual(result.ids); expect(emitted).toBe(1); expect(f.capacityCalls()).toBe(1);
    const model = f.native.controller.store.get(result.ids[0]); expect(model.id).toBe(result.ids[0]); expect(model.serialize().props?.lvTrendlineStats).toBeUndefined();
    expect(f.native.controller.history.undoStack).toBe(beforeNativeHistory); expect(beforeNativeHistory).toEqual([]); expect(f.native.controller.defaults).toBe(beforeDefaults); expect(f.native.selection()).toEqual([]);
    helper.assertCurrent(); canonical.accept(); helper.dispose(); helper = undefined;
    expect(f.document.all()[1]).toEqual(f.copies[0]); expect(f.document.undo()).toBe(true); expect(f.document.all()).toEqual(f.sources); expect(f.document.redo()).toBe(true); expect(f.document.all()[1]).toEqual(f.copies[0]);
  } finally {helper?.dispose(); f.dispose();}
});

it('public add ignores the requested ID, while actual store insertion keeps the prepared ID', async () => {
  const f = await fixture(); try {
    const added = f.native.controller.add('trendline', {id: 'SYNTHETIC-requested', anchors: f.projected[0].anchors});
    expect(added.id).not.toBe('SYNTHETIC-requested'); expect(added.id).toMatch(/^dw-/);
  } finally {f.dispose();}
});

it.each([
  ['equal lock', (f: Awaited<ReturnType<typeof fixture>>) => f.native.controller.setLocked(f.sources[0].id, false)],
  ['empty update', (f: Awaited<ReturnType<typeof fixture>>) => f.native.controller.updateMany([])],
  ['empty undo', (f: Awaited<ReturnType<typeof fixture>>) => f.native.controller.undo()],
  ['empty redo', (f: Awaited<ReturnType<typeof fixture>>) => f.native.controller.redo()],
  ['same snap', (f: Awaited<ReturnType<typeof fixture>>) => f.native.controller.setSnapMode('off')],
  ['empty history commit', (f: Awaited<ReturnType<typeof fixture>>) => f.native.controller.history.commit()],
  ['history begin/abort', (f: Awaited<ReturnType<typeof fixture>>) => {f.native.controller.history.begin(f.native.controller.toJSON()); f.native.controller.history.abort();}],
  ['failed allocation', (f: Awaited<ReturnType<typeof fixture>>) => {f.native.controller.store.seq = Number.MAX_SAFE_INTEGER; expect(() => f.native.controller.store.nextId()).toThrow();}],
  ['unknown gesture', (f: Awaited<ReturnType<typeof fixture>>) => f.native.controller.onIntent({kind: 'SYNTHETIC-unknown'})],
  ['same defaults', (f: Awaited<ReturnType<typeof fixture>>) => f.native.controller.setToolDefaults({})],
] as const)('retires before supported %s attempt, even when state is equal or the attempt fails', async (_label, action) => {
  const f = await fixture(); const helper = f.prepare(); try {
    action(f); expect(() => helper.assertCurrent()).toThrow(/retired|mutation/);
    const result = helper.insert(); expect(result.state).toBe('not-forwarded'); expect(result.attemptedIds).toEqual([]); expect(f.native.controller.store.has('SYNTHETIC-copy-0')).toBe(false);
  } finally {helper.dispose(); f.dispose();}
});

it('records same-object store remove/reinsert ABA rather than accepting restored IDs and values', async () => {
  const f = await fixture(), helper = f.prepare(); try {
    const store = f.native.controller.store, model = store.get(f.sources[0].id); store.remove(model.id); store.add(model);
    expect(store.get(model.id)).toBe(model); expect(() => helper.assertCurrent()).toThrow(/retired/); expect(helper.insert().state).toBe('not-forwarded');
  } finally {helper.dispose(); f.dispose();}
});

it('leaves pure reads and all model/prototype/serializer identities unchanged', async () => {
  const f = await fixture(); const model = f.native.controller.store.get(f.sources[0].id), keys = Reflect.ownKeys(model), prototype = Object.getPrototypeOf(model), serialize = model.serialize, writeProps = model.writeProps;
  const helper = f.prepare(); try {
    f.native.controller.all(); f.native.controller.toJSON(); f.native.controller.canUndo(); f.native.controller.canRedo(); f.native.controller.store.all(); f.native.controller.store.get(model.id);
    helper.assertCurrent(); expect(Reflect.ownKeys(model)).toEqual(keys); expect(Object.getPrototypeOf(model)).toBe(prototype); expect(model.serialize).toBe(serialize); expect(model.writeProps).toBe(writeProps);
    const canonical = f.document.captureReadOnlyOwner(), own = captureTrendlineStatisticsNativeOwner(f.facade, f.sources[0] as unknown as SerializedDrawing, model.serialize(), canonical, () => {}), inline = captureInlineDrawingOwner(f.document, f.facade, model.id, model.serialize(), () => {});
    own(); inline(); helper.dispose(); own(); inline();
  } finally {helper.dispose(); f.dispose();}
});

it('consumes own add permit before emit: nested equal add has no inherited permission', async () => {
  const f = await fixture(); let nested = false;
  const off = f.native.controller.store.onChange(() => { if (!nested) {nested = true; const model = f.native.controller.store.get('SYNTHETIC-copy-0'); f.native.controller.store.add(model);} });
  const helper = f.prepare(); try {
    const result = helper.insert(); expect(result.state).toBe('forwarded-incomplete'); expect(result.attemptedIds).toEqual(['SYNTHETIC-copy-0']); expect(f.native.controller.store.has('SYNTHETIC-copy-0')).toBe(true);
    expect(result.diagnostics.join(' ')).toMatch(/retired|mutation/); expect(Object.hasOwn(f.native.controller.store, 'add')).toBe(false);
  } finally {helper.dispose(); off(); f.dispose();}
});

it('borrowed wrappers and copied helper receivers cannot consume real insertion authority', async () => {
  const f = await fixture(), helper = f.prepare(); try {
    const add = f.native.controller.store.add; expect(() => add.call({}, deserializeDrawing(f.projected[0]))).toThrow(/receiver/);
    expect(() => helper.insert.call({...helper})).toThrow(/receiver/); expect(() => helper.dispose.call({...helper})).toThrow(/receiver/);
    helper.assertCurrent(); expect(helper.insert().state).toBe('complete'); expect(() => helper.insert()).toThrow(/consumed/);
  } finally {helper.dispose(); f.dispose();}
});

it('a listener exception after insertion reports incomplete forwarding without any native cleanup', async () => {
  const f = await fixture(2); let emissions = 0;
  const off = f.native.controller.store.onChange(() => {emissions++; if (emissions === 2) throw Error('SYNTHETIC listener failed after second insertion.');});
  const helper = f.prepare(); try {
    const beforeZ = f.native.controller.store.zCounter, result = helper.insert();
    expect(result.state).toBe('forwarded-incomplete'); expect(result.attemptedIds).toEqual(['SYNTHETIC-copy-0','SYNTHETIC-copy-1']); expect(result.diagnostics.join(' ')).toMatch(/listener failed/);
    expect(f.native.controller.store.has('SYNTHETIC-copy-0')).toBe(true); expect(f.native.controller.store.has('SYNTHETIC-copy-1')).toBe(true); expect(f.native.controller.store.zCounter).toBeGreaterThan(beforeZ);
    expect(emissions).toBe(2); expect(f.native.controller.history.undoStack).toEqual([]);
  } finally {helper.dispose(); off(); f.dispose();}
});

it('capacity and source rejection occur before forwarding; old source cannot be revived', async () => {
  const f = await fixture(); let helper = f.prepare(); try {
    f.onCapacity(() => {throw Error('SYNTHETIC full workspace capacity rejection.');});
    const result = helper.insert(); expect(result.state).toBe('not-forwarded'); expect(result.diagnostics.join(' ')).toMatch(/workspace capacity/); expect(f.native.controller.all()).toHaveLength(1);
    helper.dispose(); f.onCapacity(() => {}); helper = f.prepare(); f.retire(); expect(() => helper.assertCurrent()).toThrow(/source retired/); f.source(true); expect(() => helper.assertCurrent()).toThrow(/retired/); expect(helper.insert().state).toBe('not-forwarded');
  } finally {helper.dispose(); f.dispose();}
});

it('complete required provider manifest rejects missing/getter/claimed methods without invoking them', async () => {
  const f = await fixture(); let reads = 0; try {
    const history = f.native.controller.history;
    Object.defineProperty(history, 'abort', {configurable: true, get() {reads++; throw Error('Do not read.');}});
    expect(() => f.prepare()).toThrow(/owned|method/); expect(reads).toBe(0); delete history.abort;
    const prototype = Object.getPrototypeOf(history), replacement = Object.create(Object.getPrototypeOf(prototype));
    for (const key of Reflect.ownKeys(prototype)) if (key !== 'abort') Object.defineProperty(replacement, key, Object.getOwnPropertyDescriptor(prototype, key)!);
    Object.setPrototypeOf(history, replacement); expect(() => f.prepare()).toThrow(/missing|manifest/); Object.setPrototypeOf(history, prototype);
    const helper = f.prepare(); helper.assertCurrent(); helper.dispose(); expect(DRAWING_DUPLICATE_NATIVE_METHODS.history).toContain('abort');
  } finally {f.dispose();}
});

it('keeps foreign method replacements and aggregates owned-wrapper cleanup failures', async () => {
  const f = await fixture(), helper = f.prepare(); try {
    const replacement = () => undefined;
    Object.defineProperty(f.native.controller.store, 'add', {configurable: true, writable: true, value: replacement});
    expect(() => helper.assertCurrent()).toThrow(/changed/); expect(() => helper.dispose()).toThrow(/foreign method/); expect(f.native.controller.store.add).toBe(replacement);
    expect(Object.hasOwn(f.native.controller, 'updateMany')).toBe(false); expect(Object.hasOwn(f.native.controller.history, 'abort')).toBe(false);
    delete f.native.controller.store.add;
  } finally {helper.dispose(); f.dispose();}
});

it('reports an owned cleanup deletion that returns success without removing its wrapper', async () => {
  const f = await fixture(), core = f.native.controller;
  const proxy = new Proxy(core, {deleteProperty(target, key) {return key === 'onIntent' ? true : Reflect.deleteProperty(target, key);}});
  const helper = prepareNativeDrawingInsert({ctrl: proxy}, f.projected, f.host), installed = Object.getOwnPropertyDescriptor(core, 'onIntent');
  try {
    expect(() => helper.dispose()).toThrow(/cleanup|remov/i);
    expect(Object.getOwnPropertyDescriptor(core, 'onIntent')?.value).toBe(installed?.value);
    expect(Object.hasOwn(core, 'updateMany')).toBe(false); expect(Object.hasOwn(core.store, 'add')).toBe(false); expect(Object.hasOwn(core.history, 'abort')).toBe(false);
  } finally {
    if (Object.getOwnPropertyDescriptor(core, 'onIntent')?.value === installed?.value) Reflect.deleteProperty(core, 'onIntent');
    helper.dispose(); f.dispose();
  }
});

it('preserves a before-write acquisition failure without inventing a foreign cleanup failure', async () => {
  const f = await fixture(), core = f.native.controller;
  const proxy = new Proxy(core, {defineProperty() {throw Error('SYNTHETIC acquisition failed before write.');}});
  try {
    expect(() => prepareNativeDrawingInsert({ctrl: proxy}, f.projected, f.host)).toThrow('SYNTHETIC acquisition failed before write.');
    for (const key of DRAWING_DUPLICATE_NATIVE_METHODS.core) expect(Object.hasOwn(core, key)).toBe(false);
    expect(f.native.controller.all()).toHaveLength(1);
  } finally {f.dispose();}
});

it('source replacement during synchronous emit preserves native work and never rewrites replacement ownership', async () => {
  const f = await fixture(); const replacement = {}; const off = f.native.controller.store.onChange(() => {f.retire(); (f.facade as {ctrl: unknown}).ctrl = replacement;}); const helper = f.prepare();
  try {
    const result = helper.insert(); expect(result.state).toBe('forwarded-incomplete'); expect(f.facade.ctrl).toBe(replacement); expect(f.native.controller.store.has('SYNTHETIC-copy-0')).toBe(true);
  } finally {helper.dispose(); off(); f.dispose();}
});

it('native Reset still executes through its existing guards while retiring the isolated duplicate attempt', async () => {
  const original = row(), f = await nativeResetHarness([original]); let helper: ReturnType<typeof prepareNativeDrawingInsert> | undefined;
  try {
    const opening = f.open(), projected = deserializeDrawing({...original, id: 'SYNTHETIC-reset-copy', zIndex: 2})!.serialize();
    helper = prepareNativeDrawingInsert(f.chart.drawings, [projected], {assertCurrent: f.captureOwner(), assertWorkspaceCapacity() {}});
    opening.actions.resetSettings(); expect(f.document.all()[0].props).toEqual({...original.props, lvTrendlineStats: TRENDLINE_STATS_DEFAULTS});
    expect(() => helper!.assertCurrent()).toThrow(/retired/); expect(helper.insert().state).toBe('not-forwarded');
    expect(f.reset.diagnostics()).toEqual([]); expect(f.core.controller.store.has('SYNTHETIC-reset-copy')).toBe(false);
  } finally {helper?.dispose(); f.dispose();}
});

it('detaches input before callbacks and never reads a getter injected into the original caller array later', async () => {
  const f = await fixture(); let reads = 0, mutated = false;
  f.onHost(() => { if (!mutated) {mutated = true; Object.defineProperty(f.projected, '0', {configurable: true, enumerable: true, get() {reads++; throw Error('Caller array must not be revisited.');}});} });
  const helper = f.prepare(); try {
    expect(helper.insert().state).toBe('complete'); expect(reads).toBe(0); expect(f.native.controller.store.get('SYNTHETIC-copy-0').anchors).toEqual(f.sources[0].anchors);
  } finally {helper.dispose(); f.dispose();}
});

it('rejects malformed/oversize projected values before native insertion and leaves caller data untouched', async () => {
  const f = await fixture(); try {
    let reads = 0; const getter = {...f.projected[0]}; Object.defineProperty(getter, 'anchors', {enumerable: true, get() {reads++; throw Error('Not invoked.');}});
    expect(() => prepareNativeDrawingInsert(f.facade, [getter], f.host)).toThrow(); expect(reads).toBe(0);
    for (const patch of [{zIndex: 0}, {zIndex: Infinity}, {paneId: ''}, {anchors: [{time: 1, price: undefined}]}, {anchors: Array.from({length: 10001}, () => ({time: 1, price: 1}))}]) {
      expect(() => prepareNativeDrawingInsert(f.facade, [{...f.projected[0], ...patch} as SerializedDrawing], f.host)).toThrow();
    }
    expect(() => prepareNativeDrawingInsert(f.facade, Array.from({length: 129}, (_, index) => ({...f.projected[0], id: 'SYNTHETIC-too-many-' + index})), f.host)).toThrow(/bound/);
    expect(f.native.controller.all()).toHaveLength(1); expect(f.capacityCalls()).toBe(0); expect(Object.hasOwn(f.native.controller.store, 'add')).toBe(false);
  } finally {f.dispose();}
});

it('supports multiple exact projections without permitting one chart to consume another chart owner', async () => {
  const first = await fixture(2), second = await fixture(), a = first.prepare(), b = second.prepare();
  try {
    first.native.controller.setLocked(first.sources[0].id, false); expect(a.insert().state).toBe('not-forwarded'); b.assertCurrent(); expect(b.insert().state).toBe('complete');
    a.dispose(); const replacement = first.prepare(); try {const result = replacement.insert(); expect(result.state).toBe('complete'); expect(result.ids).toEqual(['SYNTHETIC-copy-0', 'SYNTHETIC-copy-1']); expect(first.native.controller.all()).toHaveLength(3);} finally {replacement.dispose();}
  } finally {a.dispose(); b.dispose(); first.dispose(); second.dispose();}
});

it('actual insertion preserves representative Fib, channel, position and text native geometry', async () => {
  const f = await fixture(); const types = ['fibretracement','parallelchannel','position','text'] as const;
  const projected = types.map((type, index) => createDrawing(type, {id: 'SYNTHETIC-type-' + type, paneId: 'price', zIndex: index + 2, anchors: [{time: 1000000, price: 100}, {time: 1240000, price: type === 'position' ? 90 : 200}, {time: 1240000, price: 120}], text: {value: 'SYNTHETIC copy text', color: '#123456', size: 'normal', hAlign: 'left', vAlign: 'top', bold: false, italic: false}})!.serialize());
  const helper = prepareNativeDrawingInsert(f.facade, projected, f.host); try {
    const result = helper.insert(); expect(result.state).toBe('complete');
    for (const expected of projected) {const actual = f.native.controller.store.get(expected.id).serialize(); expect(actual.id).toBe(expected.id); expect(actual.type).toBe(expected.type); expect(actual.anchors).toEqual(expected.anchors); expect(actual.text).toEqual(expected.text); expect(actual.props).toEqual(expected.props);}
  } finally {helper.dispose(); f.dispose();}
});

it('observes every required core/store/history entry before its native body, including invalid-argument throws', async () => {
  for (const group of ['core','store','history'] as const) for (const key of DRAWING_DUPLICATE_NATIVE_METHODS[group]) {
    const f = await fixture(), helper = f.prepare();
    try {
      const receiver = group === 'core' ? f.native.controller : f.native.controller[group];
      let removal: unknown;
      try {removal = Reflect.apply(receiver[key], receiver, []);} catch { /* The native attempt may reject missing arguments; the epoch still observes it. */ }
      expect(() => helper.assertCurrent(), group + '.' + key).toThrow(/retired|mutation/);
      expect(helper.insert().state, group + '.' + key).toBe('not-forwarded');
      if (group === 'store' && key === 'onChange' && typeof removal === 'function') removal();
    } finally {helper.dispose(); f.dispose();}
  }
});
