import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceAlerts } from '../../src/ui/WorkspaceAlerts';
import type { AlertDialogProps } from '../../src/ui/AlertDialog';
import { fixtureDataset } from '../../src/domain/fixtures';
import { createLocalAlert, type LocalAlert } from '../../src/domain/alerts';
import { sourceContextForDataset } from '../../src/chart/source-context';
import type { ChartController } from '../../src/chart/adapter';

// Actual WorkspaceAlerts observation path under the same controlled hook scheduler
// used by alert-manager-authority-independent (copied, not imported, because the
// React mock is hoisted per suite). No browser, executable or OS delivery claim.
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
const stores: HookStore[] = [];
const T0 = Date.UTC(2026, 9, 20, 15, 0, 0) / 1000, S = 300;
const flush = async () => { await vi.advanceTimersByTimeAsync(0); for (let i = 0; i < 12; i++) await Promise.resolve(); };
function dispose(store: HookStore) { for (const slot of store.effects.values()) { slot.cleanup?.(); slot.cleanup = undefined; } store.pendingEffects.length = 0; }
const bar = (time: number, close: number) => ({ time, open: 9, high: Math.max(9, close) + 1, low: 8, close, volume: 1 });

function setup() {
  const store: HookStore = { cells: [], stateSlots: new Set(), effects: new Map(), pendingEffects: [], cursor: 0 }; stores.push(store);
  const dataset = fixtureDataset('BTC', 2);
  dataset.bars = [bar(T0 - S, 9), bar(T0, 12)]; dataset.resolution = '5m';
  dataset.provenance.fixture = false; dataset.provenance.providerId = 'coinbase-public'; dataset.provenance.datasetId = 'live:coinbase:BTC-USD:5m'; dataset.provenance.revision = 'live-v1:s:1';
  let props: Props = { open: false, onClose: vi.fn(), alerts: [], onAlertsChange: () => false, dataset, bars: dataset.bars, chartId: 'SYNTHETIC-live-chart', replay: null, enabled: true, suspended: false };
  const publisher = vi.fn((next: LocalAlert[], expected?: LocalAlert[]) => { if (expected !== props.alerts) return false; props = { ...props, alerts: next }; return true; });
  props.onAlertsChange = publisher;
  props.chart = ({
    getSourceContext: () => sourceContextForDataset(props.dataset, props.bars), getStyle: () => 'candles',
    getDataWindow: () => ({ pending: false, series: { count: props.bars?.length ?? 0, firstTime: props.bars?.[0]?.time ?? null, lastTime: props.bars?.at(-1)?.time ?? null, style: 'candles' } }),
    getChartOptions: () => ({ scale: 'linear' }), saveDrawings: () => ({ drawings: [] }),
    indicators: { serialize: () => [], subscribe: () => () => {} }, onDrawingsChanged: () => () => {},
  } as unknown as ChartController);
  const render = (): AlertDialogProps => {
    for (const slot of store.stateSlots) if (slot.pending.length) { slot.value = slot.pending.at(-1); slot.pending.length = 0; }
    hooks.store = store; store.cursor = 0;
    return WorkspaceAlerts(props).props as AlertDialogProps;
  };
  const settle = async () => { for (let i = 0; i < 6; i++) { render(); for (const run of store.pendingEffects.splice(0)) run(); await flush(); } return render(); };
  const seed = async () => {
    const child = await settle(), value = child.context!;
    const alert = createLocalAlert({ id: 'SYNTHETIC-live-close', name: 'close', message: 'SYNTHETIC close {{close}}', instrumentId: value.instrumentId, sourceId: value.sourceId, runId: value.runId, mode: value.mode, observationBinding: value.binding, conditionVersion: 2, condition: { kind: 'greater', value: 10 }, frequency: 'once-per-bar-close', createdAt: T0, expiresAt: null });
    expect(child.onAlertsChange([alert], props.alerts)).toBe(true); child.onRequestObservation?.('after-save'); await settle();
  };
  return { settle, seed, publisher, props: () => props, unmount: () => dispose(store) };
}

beforeEach(() => { stores.length = 0; vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(T0 * 1000 + 60_000); });
afterEach(() => { for (const store of stores) dispose(store); hooks.store = null; vi.useRealTimers(); });

it('a live once-per-bar-close alert reaches the alert log when the bar closes on the clock with no new data', async () => {
  const ui = setup(); await ui.seed();
  expect(ui.props().alerts[0].history).toEqual([]);
  await vi.advanceTimersByTimeAsync(S * 1000 + 5000); await ui.settle();
  const [alert] = ui.props().alerts;
  expect(alert.history).toHaveLength(1); expect(alert.history[0].message).toContain('SYNTHETIC close 12');
  await vi.advanceTimersByTimeAsync(S * 1000 * 3); await ui.settle();
  expect(ui.props().alerts[0].history).toHaveLength(1);
});

it('unmounting disposes the live close watcher: no later publication', async () => {
  const ui = setup(); await ui.seed();
  const calls = ui.publisher.mock.calls.length;
  ui.unmount();
  await vi.advanceTimersByTimeAsync(S * 1000 * 3);
  expect(ui.publisher.mock.calls.length).toBe(calls); expect(ui.props().alerts[0].history).toEqual([]);
});
