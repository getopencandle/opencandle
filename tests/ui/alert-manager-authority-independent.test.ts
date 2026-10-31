import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceAlerts } from '../../src/ui/WorkspaceAlerts';
import type { AlertDialogProps } from '../../src/ui/AlertDialog';
import { AlertCommitEvaluationGate, TechnicalAlertObserver } from '../../src/ui/technical-alert-observer';
import { fixtureDataset } from '../../src/domain/fixtures';
import { createLocalAlert, type LocalAlert } from '../../src/domain/alerts';
import { sourceContextForDataset } from '../../src/chart/source-context';
import type { ChartController } from '../../src/chart/adapter';

// Independent actual WorkspaceAlerts/catalog/observer callbacks. This controlled
// hook scheduler models pending state and refs, not browser or executable input.
interface StateSlot { value: unknown; pending: unknown[]; }
interface EffectSlot { dependencies?: readonly unknown[]; cleanup?: () => void; }
interface HookStore { cells: unknown[]; stateSlots: Set<StateSlot>; effects: Map<number, EffectSlot>; pendingEffects: Array<() => void>; cursor: number; }
const hooks = vi.hoisted(() => ({ store: null as HookStore | null }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const current = () => { if (!hooks.store) throw new Error('Missing synthetic hook owner'); return hooks.store; };
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const effect = (create: () => void | (() => void), dependencies?: readonly unknown[]) => {
    const store = current(), index = store.cursor++, old = store.effects.get(index);
    if (old && same(old.dependencies, dependencies)) return;
    const slot: EffectSlot = { dependencies: dependencies?.slice() }; store.effects.set(index, slot);
    store.pendingEffects.push(() => { old?.cleanup?.(); const cleanup = create(); if (typeof cleanup === 'function') slot.cleanup = cleanup; });
  };
  const memo = <T,>(create: () => T, dependencies?: readonly unknown[]): T => {
    const store = current(), index = store.cursor++, old = store.cells[index] as { dependencies?: readonly unknown[]; value: T } | undefined;
    if (!old || !same(old.dependencies, dependencies)) store.cells[index] = { dependencies: dependencies?.slice(), value: create() };
    return (store.cells[index] as { value: T }).value;
  };
  return {
    ...actual, useEffect: effect, useLayoutEffect: effect, useMemo: memo,
    useCallback: <T,>(callback: T, dependencies?: readonly unknown[]) => memo(() => callback, dependencies),
    useRef<T>(initial: T) { const store = current(), index = store.cursor++; if (!(index in store.cells)) store.cells[index] = { current: initial }; return store.cells[index] as { current: T }; },
    useState<T>(initial: T | (() => T)) {
      const store = current(), index = store.cursor++;
      if (!(index in store.cells)) { const slot: StateSlot = { value: typeof initial === 'function' ? (initial as () => T)() : initial, pending: [] }; store.cells[index] = slot; store.stateSlots.add(slot); }
      const slot = store.cells[index] as StateSlot;
      return [slot.value as T, (next: T | ((prior: T) => T)) => { const prior = slot.pending.length ? slot.pending.at(-1) : slot.value; slot.pending.push(typeof next === 'function' ? (next as (value: T) => T)(prior as T) : next); }];
    },
  };
});

type Props = Parameters<typeof WorkspaceAlerts>[0];
const timers = new Map<number, () => void>();
let timerId = 0;
const stores: HookStore[] = [];
const microtasks = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { resolve, promise }; };
function authority(child: AlertDialogProps) { const value = child.managerActionAuthority; if (!value) throw new Error('Expected Workspace manager action authority'); return value; }
function context(child: AlertDialogProps) { if (!child.context) throw new Error('Expected actual synthetic observation: ' + child.diagnostics?.join('; ')); return child.context; }
function dispose(store: HookStore) { for (const slot of store.effects.values()) { slot.cleanup?.(); slot.cleanup = undefined; } store.pendingEffects.length = 0; }

function setup() {
  const store: HookStore = { cells: [], stateSlots: new Set(), effects: new Map(), pendingEffects: [], cursor: 0 }; stores.push(store);
  let clock = 1791979200;
  vi.spyOn(Date, 'now').mockImplementation(() => clock * 1000);
  const dataset = fixtureDataset('GME', 1);
  dataset.bars = [{ time: 1704153600, open: 8, high: 10, low: 7, close: 9, volume: 100 }];
  let props: Props = { open: true, onClose: vi.fn(), alerts: [], onAlertsChange: () => false, dataset, bars: dataset.bars, chartId: 'SYNTHETIC-authority-chart', replay: null, enabled: true, suspended: false };
  const publisher = vi.fn((next: LocalAlert[], expected?: LocalAlert[]) => { if (expected !== props.alerts) return false; props = { ...props, alerts: next }; return true; });
  props.onAlertsChange = publisher;
  const makeChart = (): ChartController => ({
    getSourceContext: () => sourceContextForDataset(props.dataset, props.bars), getStyle: () => 'candles',
    getDataWindow: () => ({ pending: false, series: { count: props.bars?.length ?? 0, firstTime: props.bars?.[0]?.time ?? null, lastTime: props.bars?.at(-1)?.time ?? null, style: 'candles' } }),
    getChartOptions: () => ({ scale: 'linear' }), saveDrawings: () => ({ drawings: [] }),
    indicators: { serialize: () => [], subscribe: () => () => {} }, onDrawingsChanged: () => () => {},
  } as unknown as ChartController);
  props.chart = makeChart();
  const render = (flush = true): AlertDialogProps => {
    if (flush) for (const slot of store.stateSlots) if (slot.pending.length) { slot.value = slot.pending.at(-1); slot.pending.length = 0; }
    hooks.store = store; store.cursor = 0;
    return WorkspaceAlerts(props).props as AlertDialogProps;
  };
  const effects = () => { const child = render(); for (const run of store.pendingEffects.splice(0)) run(); return child; };
  const settle = async () => { for (let i = 0; i < 8; i++) { effects(); await microtasks(); } return render(); };
  const update = (changes: Partial<Props>, flush = true) => { props = { ...props, ...changes }; return render(flush); };
  const tick = () => { const run = [...timers.values()].at(-1); if (!run) throw new Error('Missing actual Workspace interval callback'); run(); };
  const alert = (child: AlertDialogProps, id = 'SYNTHETIC-authority-alert') => {
    const value = context(child);
    return createLocalAlert({ id, name: id, message: 'SYNTHETIC independent authority fixture', instrumentId: value.instrumentId, sourceId: value.sourceId, runId: value.runId, mode: value.mode, observationBinding: value.binding, conditionVersion: 2, condition: { kind: 'greater', value: 0 }, frequency: 'every-time', createdAt: clock, expiresAt: null });
  };
  const seed = async () => { const child = await settle(); expect(child.onAlertsChange([alert(child)], props.alerts)).toBe(true); child.onRequestObservation?.('after-save'); return settle(); };
  return { render, effects, settle, update, tick, makeChart, alert, seed, publisher, props: () => props, advance: (seconds: number) => { clock += seconds; }, unmount: () => dispose(store) };
}

beforeEach(() => {
  stores.length = 0; timers.clear(); timerId = 0;
  vi.stubGlobal('setInterval', (callback: () => void) => { timers.set(++timerId, callback); return timerId; });
  vi.stubGlobal('clearInterval', (id: number) => { timers.delete(id); });
});
afterEach(() => { for (const store of stores) dispose(store); hooks.store = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps authority across actual same-basis observation and saved-history updates', async () => {
  const ui = setup(), first = await ui.seed(), owner = authority(first), session = context(first).binding.sessionId;
  expect(ui.props().alerts[0].history).toHaveLength(1);
  ui.advance(1);
  const next = [...ui.props().alerts];
  expect(first.onAlertsChange(next, ui.props().alerts)).toBe(true);
  first.onRequestObservation?.('after-save');
  const current = await ui.settle();
  expect(ui.props().alerts[0].history).toHaveLength(2);
  expect(context(current).binding.sessionId).toBe(session);
  expect(authority(current).token).toBe(owner.token);
  expect(() => owner.assertCurrent(owner.token)).not.toThrow();
});

it('keeps a token for same-basis dataset/bar clones but requires refreshed exact readiness', async () => {
  const ui = setup(), first = await ui.settle(), owner = authority(first), session = context(first).binding.sessionId;
  const cloned = structuredClone(ui.props().dataset);
  const waiting = ui.update({ dataset: cloned, bars: cloned.bars });
  expect(authority(waiting).token).toBe(owner.token);
  expect(() => owner.assertCurrent(owner.token)).toThrow(/observation is ready/);
  const current = await ui.settle();
  expect(authority(current).token).toBe(owner.token);
  expect(context(current).binding.sessionId).toBe(session);
  expect(() => owner.assertCurrent(owner.token)).not.toThrow();
});

it('retires a hidden upstream publisher despite a stable save wrapper, including observed ABA', async () => {
  const ui = setup(), first = await ui.settle(), old = authority(first), original = ui.props().onAlertsChange;
  const replacement = vi.fn(() => true);
  const second = ui.update({ onAlertsChange: replacement });
  expect(second.onAlertsChange).toBe(first.onAlertsChange);
  expect(authority(second).token).not.toBe(old.token);
  expect(() => old.assertCurrent(old.token)).toThrow(/unavailable/);
  const third = ui.update({ onAlertsChange: original });
  expect(authority(third).token).not.toBe(old.token);
  expect(authority(third).token).not.toBe(authority(second).token);
  expect(() => authority(second).assertCurrent(authority(second).token)).toThrow(/unavailable/);
  expect(() => authority(third).assertCurrent(authority(third).token)).not.toThrow();
  expect(replacement).not.toHaveBeenCalled();
});

it('retires a replacement chart controller even when chart ID and source metadata match', async () => {
  const ui = setup(), first = await ui.settle(), owner = authority(first), priorId = ui.props().chartId;
  const current = ui.update({ chart: ui.makeChart() });
  expect(ui.props().chartId).toBe(priorId);
  expect(authority(current).token).not.toBe(owner.token);
  expect(() => owner.assertCurrent(owner.token)).toThrow(/unavailable/);
  const ready = await ui.settle();
  expect(() => authority(ready).assertCurrent(authority(ready).token)).not.toThrow();
});

it.each(['dataset', 'chart-id', 'instrument', 'replay-run'] as const)('retires semantic %s replacement before an action can publish', async change => {
  const ui = setup(), first = await ui.settle(), owner = authority(first), before = ui.publisher.mock.calls.length;
  if (change === 'dataset') { const dataset = structuredClone(ui.props().dataset); dataset.provenance.datasetId = 'SYNTHETIC independent replacement'; ui.update({ dataset, bars: dataset.bars }); }
  else if (change === 'chart-id') ui.update({ chartId: 'SYNTHETIC-second-chart' });
  else if (change === 'instrument') { const dataset = fixtureDataset('SPY', 1); ui.update({ dataset, bars: dataset.bars }); }
  else ui.update({ replay: { runId: 'SYNTHETIC-replay', cursor: 0 } });
  expect(authority(ui.render()).token).not.toBe(owner.token);
  expect(() => owner.assertCurrent(owner.token)).toThrow(/unavailable/);
  expect(first.onAlertsChange(ui.props().alerts, ui.props().alerts)).toBe(false);
  expect(ui.publisher).toHaveBeenCalledTimes(before);
});

it('does not resurrect authority when an observed dataset basis changes and returns', async () => {
  const ui = setup(), first = await ui.settle(), original = ui.props().dataset, old = authority(first);
  const changed = structuredClone(original); changed.provenance.datasetId = 'SYNTHETIC temporary basis';
  const other = authority(ui.update({ dataset: changed, bars: changed.bars }));
  const returned = authority(ui.update({ dataset: original, bars: original.bars }));
  expect(other.token).not.toBe(old.token);
  expect(returned.token).not.toBe(old.token); expect(returned.token).not.toBe(other.token);
  expect(() => old.assertCurrent(old.token)).toThrow(/unavailable/);
  expect(() => other.assertCurrent(other.token)).toThrow(/unavailable/);
});

it.each(['source', 'target', 'completion'] as const)('retires a changed %s through the real child callback and restores no old token', async change => {
  const ui = setup(), first = await ui.settle(), owner = authority(first);
  if (change === 'source') first.onSourceChange?.('price:open:chart');
  else if (change === 'target') first.onTargetChange?.('price:open:chart');
  else first.onReplayAssumeCompletionChange?.(true);
  const changed = ui.render();
  expect(authority(changed).token).not.toBe(owner.token);
  expect(() => owner.assertCurrent(owner.token)).toThrow(/unavailable/);
  if (change === 'source') changed.onSourceChange?.('price:close:chart');
  else if (change === 'target') changed.onTargetChange?.('constant');
  else changed.onReplayAssumeCompletionChange?.(false);
  const returned = ui.render();
  expect(authority(returned).token).not.toBe(owner.token);
  expect(authority(returned).token).not.toBe(authority(changed).token);
});

it('detaches confirmed binding ownership so in-place session edits and observed ABA retire old tokens', async () => {
  const ui = setup(), first = await ui.settle(), owner = authority(first), binding = context(first).binding, oldSession = binding.sessionId;
  binding.sessionId = 'SYNTHETIC externally changed returned context';
  expect(() => owner.assertCurrent(owner.token)).toThrow(/unavailable/);
  const changed = authority(ui.render());
  expect(changed.token).not.toBe(owner.token);
  binding.sessionId = oldSession;
  expect(() => changed.assertCurrent(changed.token)).toThrow(/unavailable/);
  const returned = authority(ui.render());
  expect(returned.token).not.toBe(owner.token);
  expect(returned.token).not.toBe(changed.token);
});

it('revokes an old callback at observation commit before child render and cannot downgrade from an old view', async () => {
  const ui = setup(), first = await ui.settle(), owner = authority(first), oldSession = context(first).binding.sessionId;
  const committed = deferred(), original = TechnicalAlertObserver.prototype.observeForPublication;
  vi.spyOn(TechnicalAlertObserver.prototype, 'observeForPublication').mockImplementation(async function (this: TechnicalAlertObserver, ...args) {
    const publication = await original.apply(this, args);
    return { ...publication, commit: () => { publication.commit(); committed.resolve(); } };
  });
  ui.advance(-1); // Actual observer resets its session when local observation time goes backward.
  ui.tick(); await committed.promise;
  expect(() => owner.assertCurrent(owner.token)).toThrow(/unavailable/);
  const unflushed = ui.render(false), committedOwner = authority(unflushed);
  expect(context(unflushed).binding.sessionId).toBe(oldSession);
  expect(committedOwner.token).not.toBe(owner.token);
  expect(() => committedOwner.assertCurrent(committedOwner.token)).not.toThrow();
  expect(authority(ui.render(false)).token).toBe(committedOwner.token);
  expect(() => owner.assertCurrent(owner.token)).toThrow(/unavailable/);
  const updated = await ui.settle();
  expect(context(updated).binding.sessionId).not.toBe(oldSession);
  expect(authority(updated).token).toBe(committedOwner.token);
});

it('does not add a blanket busy restriction to an in-flight same-basis periodic observation', async () => {
  const ui = setup(), first = await ui.settle(), owner = authority(first), entered = deferred(), release = deferred();
  const original = TechnicalAlertObserver.prototype.observeForPublication;
  vi.spyOn(TechnicalAlertObserver.prototype, 'observeForPublication').mockImplementation(async function (this: TechnicalAlertObserver, ...args) {
    const result = await original.apply(this, args); entered.resolve(); await release.promise; return result;
  });
  try {
    ui.tick(); await entered.promise;
    expect(ui.render().evaluationPending).toBe(true);
    expect(() => owner.assertCurrent(owner.token)).not.toThrow();
  } finally { release.resolve(); await ui.settle(); }
});

it('keeps a new generation unavailable until its actual observation publishes', async () => {
  const ui = setup(), first = await ui.settle(), owner = authority(first), entered = deferred(), release = deferred();
  const original = TechnicalAlertObserver.prototype.observeForPublication;
  vi.spyOn(TechnicalAlertObserver.prototype, 'observeForPublication').mockImplementation(async function (this: TechnicalAlertObserver, ...args) {
    const result = await original.apply(this, args); entered.resolve(); await release.promise; return result;
  });
  try {
    const bars = [...ui.props().bars!, { time: 1704240000, open: 10, high: 12, low: 9, close: 11, volume: 100 }];
    ui.update({ bars }); ui.effects(); await entered.promise;
    expect(() => owner.assertCurrent(owner.token)).toThrow(/observation is ready/);
    const before = ui.publisher.mock.calls.length;
    expect(first.onAlertsChange(ui.props().alerts, ui.props().alerts)).toBe(false);
    expect(ui.publisher).toHaveBeenCalledTimes(before);
  } finally { release.resolve(); await ui.settle(); }
  const current = ui.render();
  expect(() => authority(current).assertCurrent(authority(current).token)).not.toThrow();
});

it.each(['disabled', 'suspended', 'unmounted'] as const)('preserves the %s manual-readiness refusal without publisher or staging calls', async state => {
  const ui = setup(), child = await ui.settle(), owner = authority(child), staged = vi.spyOn(AlertCommitEvaluationGate.prototype, 'staged');
  if (state === 'disabled') ui.update({ enabled: false });
  else if (state === 'suspended') ui.update({ suspended: true });
  else ui.unmount();
  expect(() => owner.assertCurrent(owner.token)).toThrow(/unavailable/);
  expect(child.onAlertsChange(ui.props().alerts, ui.props().alerts)).toBe(false);
  expect(ui.publisher).not.toHaveBeenCalled(); expect(staged).not.toHaveBeenCalled();
});

it.each(['false', 'true', 'undefined', 'throw', 'null', 'promise'] as const)('honors raw publisher %s and stages only synchronous acknowledgments', async outcome => {
  const ui = setup(), child = await ui.settle(), candidate = [ui.alert(child)], base = ui.props().alerts;
  const raw = vi.fn((): unknown => { if (outcome === 'throw') throw new Error('SYNTHETIC publisher throw'); if (outcome === 'promise') return Promise.resolve(true); return outcome === 'undefined' ? undefined : outcome === 'null' ? null : outcome === 'true'; });
  ui.update({ onAlertsChange: raw as Props['onAlertsChange'] });
  const staged = vi.spyOn(AlertCommitEvaluationGate.prototype, 'staged');
  if (outcome === 'false') expect(child.onAlertsChange(candidate, base)).toBe(false);
  else if (outcome === 'true' || outcome === 'undefined') expect(child.onAlertsChange(candidate, base)).toBe(true);
  else expect(() => child.onAlertsChange(candidate, base)).toThrow(outcome === 'throw' ? /SYNTHETIC publisher throw/ : /Could not confirm the alert was saved/);
  expect(raw).toHaveBeenCalledTimes(1); expect(raw).toHaveBeenCalledWith(candidate, base);
  if (outcome === 'true' || outcome === 'undefined') expect(staged).toHaveBeenCalledExactlyOnceWith(candidate);
  else expect(staged).not.toHaveBeenCalled();
  expect(ui.props().alerts).toBe(base);
});

it('does not stage after a publisher mutates parent state and then throws', async () => {
  const ui = setup(), child = await ui.settle(), candidate = [ui.alert(child)], base = ui.props().alerts;
  const raw = vi.fn((next: LocalAlert[]) => { ui.update({ alerts: next }); throw new Error('SYNTHETIC throw after parent mutation'); });
  ui.update({ onAlertsChange: raw });
  const staged = vi.spyOn(AlertCommitEvaluationGate.prototype, 'staged');
  expect(() => child.onAlertsChange(candidate, base)).toThrow(/throw after parent mutation/);
  expect(ui.props().alerts).toBe(candidate);
  expect(staged).not.toHaveBeenCalled(); expect(raw).toHaveBeenCalledTimes(1);
});

it('stages an accepted result even when the publisher synchronously closes the manager', async () => {
  const ui = setup(), child = await ui.settle(), candidate = [ui.alert(child)], base = ui.props().alerts;
  const raw = vi.fn((next: LocalAlert[]) => { ui.update({ alerts: next, open: false }); return true; });
  ui.update({ onAlertsChange: raw });
  const staged = vi.spyOn(AlertCommitEvaluationGate.prototype, 'staged');
  expect(child.onAlertsChange(candidate, base)).toBe(true);
  expect(ui.props().open).toBe(false); expect(ui.props().alerts).toBe(candidate);
  expect(staged).toHaveBeenCalledExactlyOnceWith(candidate); expect(raw).toHaveBeenCalledTimes(1);
});

it('after-save evaluation waits for the exact acknowledged array to commit, not an equivalent clone', async () => {
  const ui = setup(), child = await ui.settle(), candidate = [ui.alert(child)], base = ui.props().alerts;
  const raw = vi.fn(() => true); ui.update({ onAlertsChange: raw });
  const observe = vi.spyOn(TechnicalAlertObserver.prototype, 'observeForPublication');
  expect(child.onAlertsChange(candidate, base)).toBe(true);
  child.onRequestObservation?.('after-save'); await ui.settle();
  expect(observe).not.toHaveBeenCalled();
  ui.update({ alerts: structuredClone(candidate) }); await ui.settle();
  expect(observe).not.toHaveBeenCalled();
  ui.update({ alerts: candidate }); await ui.settle();
  expect(observe).toHaveBeenCalledTimes(1);
  expect(observe.mock.calls[0][0].alerts).toBe(candidate);
  expect(observe.mock.calls[0][2]).toBe('explicit-evaluation');
});
