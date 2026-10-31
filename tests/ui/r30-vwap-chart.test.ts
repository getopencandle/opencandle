import { afterEach, expect, it, vi } from 'vitest';
import { TechnicalAlertObserver, technicalEvaluationGroup, type TechnicalAlertView } from '../../src/ui/technical-alert-observer';
import { createTechnicalVwapEvaluator } from '../../src/ui/vwap-alert-evaluator';
import { legacyDrawingRows } from '../../src/ui/WorkspaceAlerts';
import { createOwnedVwapPrefixSource, type VwapPrefixBasis } from '../../src/chart/vwap-prefix-source';
import { alertDatasetKey, type AlertSourceSnapshot } from '../../src/domain/alert-observation';
import { processLocalAlertBatch, type LocalAlert } from '../../src/domain/alerts';
import { createVwapClient } from '../../src/vwap/client';
import { calculateVwapWorkerMessage } from '../../src/vwap/worker-core';
import type { VwapClient, VwapWorkerPort } from '../../src/vwap/types';
import type { ChartController } from '../../src/chart/adapter';
import type { Bar } from '../../src/domain/types';
import { alertOn, liveLike } from '../helpers/background-alert-fixtures';

// (findings 1 and 2): VWAP kernel 2 alerts on a live chart when a bar closes.
// SYNTHETIC bars and alerts only; a fake chart controller and a fake worker port that runs the real VWAP kernel; no network.
// 1m bars: the chart observes once a minute here, inside the 60 s observation gap limit, so no observation is a gap.
const S = 60, bucket = Math.floor(Date.now() / 60000) * 60;
const T = bucket - S * 30;
const bar = (time: number, close: number): Bar => ({ time, open: close, high: close + 0.5, low: close - 0.5, close, volume: 100 });
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); vi.useRealTimers(); });

class WorkerPort implements VwapWorkerPort {
  listeners = new Map<string, Set<(event: any) => void>>(); request: any;
  constructor(private readonly rows: number[]) { queueMicrotask(() => this.emit({ v: 1, type: 'ready' })); }
  addEventListener(type: string, fn: (event: any) => void) { const list = this.listeners.get(type) ?? new Set(); list.add(fn); this.listeners.set(type, list); }
  removeEventListener(type: string, fn: (event: any) => void) { this.listeners.get(type)?.delete(fn); }
  postMessage(message: unknown, transfer: Transferable[]) { this.request = structuredClone(message, { transfer }); this.rows.push(this.request.rows); queueMicrotask(() => { try { this.emit(calculateVwapWorkerMessage(this.request)); } catch (error) { this.emit({ v: 1, type: 'error', code: 'VWAP_TEST', message: String(error) }); } }); }
  terminate() { /* nothing to stop */ }
  emit(data: unknown) { for (const fn of this.listeners.get('message') ?? []) fn({ data }); }
}
const vwapSource: AlertSourceSnapshot = { kind: 'indicator', instanceId: 'i1', snapshotId: 's1', indicator: 'vwap', plotId: 'vwap', inputs: { kernelVersion: 2, source: 'close', anchor: 'Century', timezone: 'UTC' }, inputBasis: 'standard-ohlc', transformId: 'standard' };

/** A live 5m chart: each step appends a new bar. The chart owns a private copy of the rows (as the adapter does) and a fresh
 * alert VWAP evaluator is made for each observation (as WorkspaceAlerts does).
 * 'forming': the clock is 10 s into the newest bar, so that bar is forming and the bar before it closes when it arrives (the
 * closed-bar prefix is one row shorter than the chart). 'late': every bar is already past its period (a late minute bar or a
 * wall-clock close), so the closed-bar prefix is a new array of all the chart's rows. */
type Mode = 'forming' | 'late';
async function liveChart(alerts: LocalAlert[], closes: number[], client: () => VwapClient, mode: Mode = 'forming') {
  const at = (time: number) => { if (mode === 'forming') vi.setSystemTime((time + 10) * 1000); };
  if (mode === 'forming') { vi.useFakeTimers({ toFake: ['Date'] }); at(T + S); }
  const base = liveLike('GME', '1m');
  let rows: Bar[] = [bar(T, 9), bar(T + S, 9.1)], basis: VwapPrefixBasis = { epoch: {}, source: {}, bars: structuredClone(rows), style: 'candles', executionIdentity: 'ordinary', disposed: false };
  const prefix = createOwnedVwapPrefixSource({ readBasis: () => basis }); disposers.push(() => prefix.dispose());
  const chart = { getStyle: () => 'candles', getExecutionIdentity: () => 'ordinary', isInputCurrent: (input: any) => input.bars === rows && input.style === 'candles', captureVwapPrefix: () => prefix.capture() } as unknown as ChartController;
  const observer = new TechnicalAlertObserver(() => crypto.randomUUID(), () => Promise.resolve()); disposers.push(() => observer.dispose());
  let saved = alerts;
  const views: TechnicalAlertView[] = [];
  const step = async () => {
    const dataset = { ...base, bars: rows };
    const vwap = createTechnicalVwapEvaluator({ chart, dataset, bars: rows, executionIdentity: 'ordinary', isCurrent: () => true, client });
    const view = await observer.observe({ dataset, bars: rows, chartId: 'chart', replay: null, assumeReplayCompletion: false, selectedSource: null, alerts: saved, vwap, adopt: true }, Math.floor(Date.now() / 1000));
    views.push(view);
    saved = processLocalAlertBatch(saved, [...(view.closedEvents ?? []), ...view.events], Math.floor(Date.now() / 1000)).alerts;
  };
  await step();
  for (const close of closes) {
    rows = [...rows, bar(rows.at(-1)!.time + S, close)];
    basis = { ...basis, epoch: {}, bars: structuredClone(rows) };
    at(rows.at(-1)!.time);
    await step();
  }
  return { alert: (id: string) => saved.find(alert => alert.definition.id === id)!, views };
}
const closeAlerts = () => [
  alertOn(liveLike('GME', '1m'), 'price', { frequency: 'once-per-bar-close' }),
  alertOn(liveLike('GME', '1m'), 'vwap', { frequency: 'once-per-bar-close', condition: { kind: 'crossing-up', value: 9.2 } }, vwapSource),
];

it.each(['forming', 'late'] as const)('a live chart with a price alert and a VWAP alert (%s bar): a bar closes, both fire exactly once and neither gaps', async mode => {
  const sent: number[] = [];
  const client = createVwapClient({ factory: () => new WorkerPort(sent) }); disposers.push(() => client.dispose());
  // Closes 9, 9.1, then 9.2, 9.3, 11 (the price crosses 10), 11.1, 11.2. VWAP of the closes (equal volumes) at each bar:
  // 9.05, 9.1, 9.15, 9.52 (crosses 9.2 on the bar where the price crosses 10), 9.62, ...
  const { alert, views } = await liveChart(closeAlerts(), [9.2, 9.3, 11, 11.1, 11.2], () => client, mode);
  expect(alert('price').history).toHaveLength(1);
  expect(alert('vwap').history).toHaveLength(1);
  expect(alert('price').history[0].value).toBe(11);
  expect(alert('vwap').history[0].value).toBeCloseTo((9 + 9.1 + 9.2 + 9.3 + 11) / 5, 9);
  expect(alert('vwap').history[0].barId).toBe(alert('price').history[0].barId);
  // Neither one gaps: after the first observation, each closed bar gives both alerts a closed-bar value, and each forming
  // observation gives both a value, with no gap or prefix diagnostic.
  for (const view of views.slice(1)) {
    expect(view.diagnostics).toEqual([]);
    expect(view.inactiveAlertIds).toEqual([]);
    expect(view.contexts).toHaveLength(2);
    expect(new Set((view.closedEvents ?? []).map(event => event.sourceId)).size).toBe(2);
    expect((view.closedEvents ?? []).every(event => event.barClosed && event.value !== null)).toBe(true);
  }
  // 'forming': the closed-bar evaluation sent one row fewer than the chart holds. 'late': all of the chart's rows.
  const counts = views.slice(1).map((_view, index) => index + 3);
  for (const rows of counts) expect(sent).toContain(mode === 'forming' ? rows - 1 : rows);
});

it('error isolation on the chart: a VWAP alert whose worker fails never gaps the price alert', async () => {
  const broken = { request() { throw new Error('SYNTHETIC worker unavailable'); }, dispose() { /* none */ } } as unknown as VwapClient;
  const { alert, views } = await liveChart(closeAlerts(), [9.2, 9.3, 11, 11.1, 11.2], () => broken);
  expect(alert('price').history).toHaveLength(1);
  expect(alert('vwap').history).toHaveLength(0);
  for (const view of views.slice(1)) {
    expect(view.inactiveAlertIds).toEqual(['vwap']);
    expect(view.contexts).toHaveLength(1);
    expect(view.diagnostics).toContain('SYNTHETIC worker unavailable');
  }
});

it('the chart VWAP evaluator accepts a leading prefix of its own row objects (the background rule) and refuses other rows', async () => {
  const sent: number[] = [];
  const client = createVwapClient({ factory: () => new WorkerPort(sent) }); disposers.push(() => client.dispose());
  const dataset = { ...liveLike('GME', '1m') }; const rows = [bar(T, 2), bar(T + S, 4), bar(T + 2 * S, 9)]; dataset.bars = rows;
  const epoch = {}, owner = {}, privateRows = structuredClone(rows);
  const prefix = createOwnedVwapPrefixSource({ readBasis: () => ({ epoch, source: owner, bars: privateRows, style: 'candles', executionIdentity: 'ordinary', disposed: false }) }); disposers.push(() => prefix.dispose());
  const chart = { getStyle: () => 'candles', getExecutionIdentity: () => 'ordinary', isInputCurrent: (input: any) => input.bars === rows, captureVwapPrefix: () => prefix.capture() } as unknown as ChartController;
  const evaluator = createTechnicalVwapEvaluator({ chart, dataset, bars: rows, executionIdentity: 'ordinary', isCurrent: () => true, client: () => client });
  const request = (rowsIn: readonly Bar[]) => ({ inputs: vwapSource.kind === 'indicator' ? vwapSource.inputs : {}, transform: 'standard' as const, prefix: rowsIn, sourceBasis: alertDatasetKey(dataset, 2), sourceRevision: dataset.provenance.revision, signal: new AbortController().signal, cancelled: () => false });
  const closed = await evaluator.evaluate(request(rows.slice(0, 2)));
  expect(closed.rows).toBe(2); expect(closed.readChunk('vwap', 0, 2)).toEqual([2, 3]); closed.release();
  const full = await evaluator.evaluate(request(rows));
  expect(full.readChunk('vwap', 0, 3)).toEqual([2, 3, 5]); full.release();
  const copy = await evaluator.evaluate(request([...rows]));
  expect(copy.readChunk('vwap', 0, 3)).toEqual([2, 3, 5]); copy.release();
  for (const refused of [structuredClone(rows), [rows[1]], [bar(T, 2)], [], [...rows, bar(T + 3 * S, 1)]]) await expect(evaluator.evaluate(request(refused))).rejects.toThrow('owned source prefix');
  expect(sent).toEqual([2, 3, 3]);
});

it('evaluation groups: each VWAP kernel 2 source alone, everything else shared', () => {
  expect(technicalEvaluationGroup(vwapSource, 'k')).toBe('vwap:k');
  expect(technicalEvaluationGroup({ kind: 'comparison', snapshotId: 'c', left: { kind: 'price', field: 'close', transformId: 'standard' }, right: vwapSource } as AlertSourceSnapshot, 'c')).toBe('vwap:c');
  expect(technicalEvaluationGroup({ kind: 'price', field: 'close', transformId: 'standard' } as AlertSourceSnapshot, 'p')).toBe('shared');
  expect(technicalEvaluationGroup({ ...vwapSource, inputs: { ...(vwapSource as any).inputs, kernelVersion: 1 } } as AlertSourceSnapshot, 'v1')).toBe('shared');
});

it('finding 2: the chart passes its drawings to an older drawing alert, with stable rows while nothing changes', () => {
  const legacy: AlertSourceSnapshot = { kind: 'drawing', instanceId: 'line', snapshotId: 'd', tool: 'hline', anchors: [{ time: T, price: 10 }], settings: {}, evaluation: 'signed-price-distance', coordinateModel: 'linear-time-price' };
  const price = alertOn(liveLike('GME', '1m'), 'a'), drawing = alertOn(liveLike('GME', '1m'), 'd', { condition: { kind: 'crossing-up', value: 0 } }, legacy);
  const doc = { drawings: [{ id: 'line', type: 'hline', anchors: [{ time: T * 1000, price: 10 }] }] };
  expect(legacyDrawingRows([price], doc, null)).toBeNull();
  const first = legacyDrawingRows([price, drawing], doc, null)!;
  expect(first.rows).toEqual(doc.drawings);
  expect(legacyDrawingRows([price, drawing], structuredClone(doc), first)).toBe(first);
  const moved = legacyDrawingRows([price, drawing], { drawings: [{ ...doc.drawings[0], anchors: [{ time: T * 1000, price: 11 }] }] }, first)!;
  expect(moved).not.toBe(first); expect((moved.rows[0] as any).anchors[0].price).toBe(11);
  expect(legacyDrawingRows([drawing], {}, null)!.rows).toEqual([]);
});
