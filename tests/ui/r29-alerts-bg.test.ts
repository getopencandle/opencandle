import { afterEach, expect, it } from 'vitest';
import { BackgroundAlertWatcher } from '../../src/ui/background-alert-watcher';
import { planBackgroundAlertFeeds } from '../../src/ui/background-alert-plan';
import { savedDrawingsForInstrument } from '../../src/ui/saved-drawing-lookup';
import { calculateIndicator } from '../../src/domain/indicators';
import { clearVwapEventDates, rememberVwapEventDates, vwapEventAnchorKeys, vwapEventDatesFor } from '../../src/domain/vwap-event-anchors';
import { effectiveVwapSettings } from '../../src/vwap/settings';
import { createVwapClient } from '../../src/vwap/client';
import { calculateVwapWorkerMessage } from '../../src/vwap/worker-core';
import type { VwapClient, VwapWorkerPort } from '../../src/vwap/types';
import type { AlertSourceSnapshot } from '../../src/domain/alert-observation';
import type { LocalAlert } from '../../src/domain/alerts';
import type { Bar, BarDataset } from '../../src/domain/types';
import type { LiveHandle } from '../../src/domain/live-provider';
import { alertOn, liveLike } from '../helpers/background-alert-fixtures';

// VWAP kernel 2 and older drawing alerts in the background, and the VWAP Dividends and Splits anchors.
// SYNTHETIC bars, alerts and drawings only; a fake worker port runs the real kernel; no network, no key.
const bucket = Math.floor(Date.now() / 300000) * 300;
/** The first feed bar; every pushed bar stays in the past. */
const T = bucket - 300 * 30;
const bar = (time: number, close: number): Bar => ({ time, open: close, high: close + 0.5, low: close - 0.5, close, volume: 100 });
const now = () => Math.floor(Date.now() / 1000);
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); clearVwapEventDates(); });

class WorkerPort implements VwapWorkerPort {
  listeners = new Map<string, Set<(event: any) => void>>(); request: any;
  constructor() { queueMicrotask(() => this.emit({ v: 1, type: 'ready' })); }
  addEventListener(type: string, fn: (event: any) => void) { const list = this.listeners.get(type) ?? new Set(); list.add(fn); this.listeners.set(type, list); }
  removeEventListener(type: string, fn: (event: any) => void) { this.listeners.get(type)?.delete(fn); }
  postMessage(message: unknown, transfer: Transferable[]) { this.request = structuredClone(message, { transfer }); queueMicrotask(() => { try { this.emit(calculateVwapWorkerMessage(this.request)); } catch (error) { this.emit({ v: 1, type: 'error', code: 'VWAP_TEST', message: String(error) }); } }); }
  terminate() { /* nothing to stop */ }
  emit(data: unknown) { for (const fn of this.listeners.get('message') ?? []) fn({ data }); }
}
function feedOf(initial: BarDataset) {
  let data = initial; const listeners = new Set<(dataset: BarDataset) => void>();
  const handle: LiveHandle = { datasetId: initial.provenance.datasetId, dataset: () => data, formingTime: () => null, onChange: listener => { listeners.add(listener); return () => listeners.delete(listener); }, close() { /* test feed */ } };
  return { handle, push(close: number) { data = { ...data, bars: [...data.bars.slice(-20), bar(data.bars.at(-1)!.time + 300, close)] }; for (const listener of [...listeners]) listener(data); } };
}
async function run(alerts: LocalAlert[], closes: number[], extra: { client?: () => VwapClient; drawings?: (id: string) => readonly unknown[] | null } = {}) {
  const base = liveLike('GME');
  const feed = feedOf({ ...base, bars: [bar(T, 9), bar(T + 300, 9.1)] });
  let saved = alerts;
  const watcher = new BackgroundAlertWatcher({ open: () => feed.handle, alerts: () => saved, publish: (next, expected) => { if (expected !== saved) return false; saved = next; return true; }, now, identity: () => crypto.randomUUID(), openAlpacaSymbols: () => new Set(['GME']), vwapClient: extra.client, drawings: extra.drawings });
  disposers.push(() => watcher.dispose());
  watcher.sync(''); await watcher.settled();
  for (const close of closes) { feed.push(close); await watcher.settled(); }
  return (id: string) => saved.find(alert => alert.definition.id === id)!;
}
const vwapSource = (anchor = 'Century'): AlertSourceSnapshot => ({ kind: 'indicator', instanceId: 'i1', snapshotId: 's1', indicator: 'vwap', plotId: 'vwap', inputs: { kernelVersion: 2, source: 'close', anchor, timezone: 'UTC' }, inputBasis: 'standard-ohlc', transformId: 'standard' });

it('plan: VWAP kernel 2 and older drawing alerts are watched in the background, not skipped', () => {
  const base = liveLike('GME');
  const legacy: AlertSourceSnapshot = { kind: 'drawing', instanceId: 'line', snapshotId: 'd', tool: 'hline', anchors: [{ time: T, price: 10 }], settings: {}, evaluation: 'signed-price-distance', coordinateModel: 'linear-time-price' };
  const plan = planBackgroundAlertFeeds({ alerts: [alertOn(base, 'a'), alertOn(base, 'v', {}, vwapSource()), alertOn(base, 'd', { condition: { kind: 'crossing-up', value: 0 } }, legacy)], activeInstrumentId: '', openAlpacaSymbols: new Set(['GME']) });
  expect(plan.feeds.map(feed => feed.alertIds)).toEqual([['a', 'v', 'd']]);
  expect(plan.skipped).toEqual([]);
});

it('a VWAP kernel 2 alert and a price alert on one feed both fire in the background, each exactly once', async () => {
  const client = createVwapClient({ factory: () => new WorkerPort() }); disposers.push(() => client.dispose());
  // VWAP of the closes (equal volumes): 9.05, then 9.1, 9.15, 9.52 (11 crosses the 10 price level and lifts VWAP over 9.2).
  const alert = await run([alertOn(liveLike('GME'), 'a'), alertOn(liveLike('GME'), 'v', { condition: { kind: 'crossing-up', value: 9.2 } }, vwapSource())], [9.2, 9.3, 11, 11.1, 11.2], { client: () => client });
  expect(alert('a').history).toHaveLength(1);
  expect(alert('v').history).toHaveLength(1);
  expect(alert('v').history[0].value).toBeGreaterThanOrEqual(9.2);
});

it('F3 kept: a VWAP whose worker fails never stops the price alert of its feed', async () => {
  const broken = { request() { throw new Error('SYNTHETIC worker unavailable'); }, dispose() { /* none */ } } as unknown as VwapClient;
  const alert = await run([alertOn(liveLike('GME'), 'a'), alertOn(liveLike('GME'), 'v', { condition: { kind: 'crossing-up', value: 9.2 } }, vwapSource())], [9.2, 9.3, 11], { client: () => broken });
  expect(alert('a').history).toHaveLength(1);
  expect(alert('v').history).toHaveLength(0);
});

it('an older drawing alert fires from the drawing saved in the workspace, once, and a moved drawing gives no value', async () => {
  const anchorTime = T;
  const legacy: AlertSourceSnapshot = { kind: 'drawing', instanceId: 'line', snapshotId: 'd', tool: 'hline', anchors: [{ time: anchorTime, price: 10 }], settings: {}, evaluation: 'signed-price-distance', coordinateModel: 'linear-time-price' };
  const make = () => [alertOn(liveLike('GME'), 'a'), alertOn(liveLike('GME'), 'd', { condition: { kind: 'crossing-up', value: 0 } }, legacy)];
  const saved = [{ id: 'line', type: 'hline', paneId: 'price', anchors: [{ time: anchorTime * 1000, price: 10 }] }];
  let asked = '';
  const fired = await run(make(), [9.2, 9.3, 11, 11.1], { drawings: id => { asked = id; return saved; } });
  expect(asked).toBe('US:GME');
  expect(fired('d').history).toHaveLength(1); expect(fired('d').history[0].value).toBeCloseTo(1);
  expect(fired('a').history).toHaveLength(1);
  const moved = await run(make(), [9.2, 9.3, 11], { drawings: () => [{ ...saved[0], anchors: [{ time: anchorTime * 1000, price: 10.5 }] }] });
  expect(moved('d').history).toHaveLength(0); expect(moved('a').history).toHaveLength(1);
  const missing = await run(make(), [9.2, 9.3, 11]);
  expect(missing('d').history).toHaveLength(0); expect(missing('a').history).toHaveLength(1);
});

it('a sloped older drawing uses the saved extension flags: an unextended trend line ends at its last anchor', async () => {
  const t0 = T, t1 = T + 300;
  const legacy: AlertSourceSnapshot = { kind: 'drawing', instanceId: 't', snapshotId: 'd', tool: 'trendline', anchors: [{ time: t0, price: 9 }, { time: t1, price: 9.5 }], settings: {}, evaluation: 'signed-price-distance', coordinateModel: 'linear-time-price' };
  const record = (extendRight: boolean) => [{ id: 't', type: 'trendline', paneId: 'price', anchors: [{ time: t0 * 1000, price: 9 }, { time: t1 * 1000, price: 9.5 }], style: { extendRight } }];
  const make = () => [alertOn(liveLike('GME'), 't', { condition: { kind: 'crossing-up', value: 0 } }, legacy)];
  // Extended: the line is 9.5 + 0.5 per bar, so 9.6 (line 10), 10.2 (line 10.5) then 11.5 (line 11) crosses once.
  expect((await run(make(), [9.6, 10.2, 11.5], { drawings: () => record(true) }))('t').history).toHaveLength(1);
  expect((await run(make(), [9.6, 10.2, 11.5], { drawings: () => record(false) }))('t').history).toHaveLength(0);
});

it('savedDrawingsForInstrument reads every cell scoped to the instrument, active and inactive, and nothing else', () => {
  const basis = (instrumentId: string) => ({ instrumentId }) as never;
  const workspace = { drawings: { drawings: [{ id: 'top' }] }, drawingScopes: { schemaVersion: 1, activeBasis: basis('US:GME'), inactive: [] } as never,
    grid: { cells: { a: { drawings: { drawings: [{ id: 'x' }, { id: 'top' }] }, drawingScopes: { schemaVersion: 1, activeBasis: basis('US:GME'), inactive: [{ basis: basis('US:SPY'), document: { drawings: [{ id: 'spy' }] } }] } as never },
      b: { drawings: { drawings: [{ id: 'other' }] }, drawingScopes: { schemaVersion: 1, activeBasis: basis('US:SPY'), inactive: [{ basis: basis('US:GME'), document: { drawings: [{ id: 'old' }] } }] } as never } } } };
  expect(savedDrawingsForInstrument(workspace, 'US:GME').map(row => (row as { id: string }).id)).toEqual(['x', 'top', 'old']);
  expect(savedDrawingsForInstrument(workspace, 'US:SPY').map(row => (row as { id: string }).id)).toEqual(['spy', 'other']);
});

it('VWAP Dividends and Splits anchors restart at the ex-date bars, need loaded dates, and refuse the exact kernel', () => {
  const day = Date.UTC(2025, 5, 12, 14, 30) / 1000;
  const bars = [0, 1, 2, 3, 4].map(i => ({ ...bar(day + i * 86400, 10 + i), volume: 1 }));
  const events = [{ exDate: '2025-06-14', kind: 'cash-dividend' as const }, { exDate: '2025-06-15', kind: 'forward-split' as const }];
  expect(vwapEventAnchorKeys(bars, 'Dividends', events)).toEqual(['0', '0', '1', '1', '1']);
  expect(vwapEventAnchorKeys(bars, 'Splits', events)).toEqual(['0', '0', '0', '1', '1']);
  const dividends = calculateIndicator('vwap', bars, { anchor: 'Dividends', timezone: 'UTC', source: 'close' }, { corporateActions: events });
  expect(dividends.series.find(plot => plot.id === 'vwap')!.values).toEqual([10, 10.5, 12, 12.5, 13]);
  expect(calculateIndicator('vwap', bars, { anchor: 'Splits', timezone: 'UTC', source: 'close' }).diagnostics.join(' ')).toContain('split and dividend dates');
  expect(() => effectiveVwapSettings({ kernelVersion: 2, anchor: 'Dividends', timezone: 'UTC', source: 'close' }, 'standard')).toThrow('Original calculation method');
  rememberVwapEventDates('US:GME', events);
  expect(vwapEventDatesFor('US:GME')).toEqual(events); expect(vwapEventDatesFor('US:SPY')).toBeNull();
});
