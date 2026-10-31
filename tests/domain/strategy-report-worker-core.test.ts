import { expect, it } from 'vitest';
import { StrategyReportWorkerSession } from '../../src/strategy-report/worker-core';
import { copyWire } from '../../src/strategy-report/data';
import { REPORT_WORKER_LIMITS, type ReportReply, type ReportSection, type ReportStart } from '../../src/strategy-report/types';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import type { Bar } from '../../src/domain/types';

const context = { executionId: 'synthetic-worker-oracle', sourceLabel: 'Synthetic deterministic report worker test', currency: null, timezone: 'UTC' };
const flat = (prices: number[]): Bar[] => prices.map((price, index) => ({ time: 1000 + index, open: price, high: price, low: price, close: price, volume: 1 }));
function fixture() {
  const bars = flat([5, 10, 13, 20, 22, 5, 5.5, 8, 9]), barIds = bars.map((_, i) => 'synthetic:' + i);
  const proposals = (['buy', 'sell', 'sell', 'buy', 'buy', 'sell', 'buy'] as const).map((side, i) => ({ sequence: i + 1, side, quantity: [2, 2, 3, 3, 4, 4, 2][i], event: { id: barIds[i], time: bars[i].time, revision: 1 }, virtual: true }));
  return { bars, barIds, standardBars: [] as Bar[], proposals };
}
function harness(rows = fixture(), patch: Partial<ReportStart['config']> = {}) {
  const session = new StrategyReportWorkerSession(), job = 'synthetic-worker-job'; let sequence = 0;
  const send = (fields: Record<string, unknown>): ReportReply => session.handle({ version: 1, job, sequence: ++sequence, ...fields });
  const config = { ...DEFAULT_STRATEGY_CONFIG, initialCapital: 1000, commission: { kind: 'fixed' as const, value: 1 }, ...patch };
  const start: ReportStart = { context, config, chartType: config.chartType, counts: { bars: rows.bars.length, standardBars: rows.standardBars.length, barIds: rows.barIds.length, proposals: rows.proposals.length } };
  const upload = () => {
    expect(send({ kind: 'start', input: start })).toMatchObject({ ok: true, kind: 'ack' });
    for (const section of ['bars', 'standardBars', 'barIds', 'proposals'] as ReportSection[]) if (rows[section].length) expect(send({ kind: 'chunk', section, start: 0, rows: rows[section] })).toMatchObject({ ok: true, kind: 'ack', received: rows[section].length });
    const ready = send({ kind: 'seal' }); expect(ready, JSON.stringify(ready)).toMatchObject({ ok: true, kind: 'ready' });
    if (!ready.ok || ready.kind !== 'ready') throw Error('Expected ready'); return ready.value;
  };
  return { session, send, start, rows, upload };
}
const result = (reply: ReportReply): any => { expect(reply).toMatchObject({ ok: true, kind: 'result' }); if (!reply.ok || reply.kind !== 'result') throw Error('Expected result'); return reply.value; };

it('calculates literal closed/open, side, fee and benchmark values and retains full report authority for exports', () => {
  const job = harness(), ready = job.upload();
  for (const [key, value] of Object.entries({ closedNet: -4, grossProfit: 4, grossLoss: 8, profitFactor: .5, commission: 7, openGross: 2, openFees: 1, openNet: 1, totalProfit: -3, finalEquity: 997, buyHoldPnl: -100, buyHoldPercent: -10 })) expect(ready.metrics.all[key], key).toMatchObject({ value, status: 'available' });
  expect(ready.metrics.long.closedNet.value).toBe(4); expect(ready.metrics.short.closedNet.value).toBe(-8);
  expect(ready.metrics.all.maxIntrabarDrawdown).toMatchObject({ value: 8, status: 'available' }); // flat bars: short 3@20 to 22 adds 6; long 4@5 after realized 1004->996 adds 8 expect(ready.counts).toMatchObject({ bars: 9, trades: 3, orders: 7, openLots: 1 });
  const trades = result(job.send({ kind: 'trades', query: { side: 'all', query: '', sort: 'number', descending: false, page: 99 } }));
  expect(trades.page).toBe(0); expect(trades.rows.map((row: any) => row.netProfit)).toEqual([4, -8, 0]);
  const lots = result(job.send({ kind: 'openLots', side: 'long', page: 0 })); expect(lots.rows[0].netProfit).toBe(1);
  const orders = result(job.send({ kind: 'orders', page: 0 })); expect(orders.count).toBe(7); expect(Object.hasOwn(orders.rows[0], 'reduceOnly')).toBe(false);
  const inspection = result(job.send({ kind: 'inspect', barIndex: 8 })); expect(inspection.point.equity).toBe(997); expect(inspection.trade.number).toBe(3);
  const exported = job.send({ kind: 'export', format: 'json', side: 'all' }); expect(exported).toMatchObject({ ok: true, kind: 'export', format: 'json' });
  if (!exported.ok || exported.kind !== 'export') throw Error('Expected export');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(exported.buffer); expect(new TextEncoder().encode(text).byteLength).toBe(exported.bytes);
  const document = JSON.parse(text); expect(document.trades.map((row: any) => row.netProfit)).toEqual([4, -8, 0]); expect(document.context).toEqual(context);
});

it('preserves explicit standard Heikin-Ashi prices, duplicate event times and unique row identities', () => {
  const bars = flat([6, 11, 12]), standardBars = flat([5, 10, 13]); bars[1].time = bars[0].time; standardBars[1].time = standardBars[0].time;
  const barIds = ['a', 'b', 'c'], proposals = [
    { sequence: 1, side: 'buy' as const, quantity: 2, event: { id: 'a', time: bars[0].time, revision: 1 }, virtual: true },
    { sequence: 2, side: 'sell' as const, quantity: 2, event: { id: 'b', time: bars[1].time, revision: 1 }, virtual: true },
  ];
  const job = harness({ bars, standardBars, barIds, proposals }, { chartType: 'heikin-ashi', fillBasis: 'standard-ohlc', commission: { kind: 'fixed', value: 0 } }), ready = job.upload();
  expect(ready.metrics.all.closedNet.value).toBe(6); expect(ready.benchmark.entryMark).toBe(10); expect(ready.benchmark.lastMark).toBe(13);
  const rows = result(job.send({ kind: 'trades', query: { side: 'all', query: '', sort: 'number', descending: false, page: 0 } })).rows;
  expect(rows[0]).toMatchObject({ entryPrice: 10, exitPrice: 13, entry: { barId: 'b' }, exit: { barId: 'c' } });
});

it('rejects incomplete, overlapping, reordered and repeated uploads without completed output', () => {
  for (const mode of ['seal-early', 'wrong-section', 'overlap', 'duplicate-sequence', 'wrong-job', 'extra-field'] as const) {
    const job = harness(); expect(job.send({ kind: 'start', input: job.start }).ok).toBe(true);
    const command: Record<string, unknown> = mode === 'seal-early' ? { kind: 'seal' } : { kind: 'chunk', section: mode === 'wrong-section' ? 'barIds' : 'bars', start: mode === 'overlap' ? 1 : 0, rows: mode === 'wrong-section' ? job.rows.barIds : job.rows.bars };
    if (mode === 'duplicate-sequence') command.sequence = 1;
    if (mode === 'wrong-job') command.job = 'another';
    if (mode === 'extra-field') command.extra = true;
    expect(job.send(command), mode).toMatchObject({ ok: false });
    expect(job.send({ kind: 'seal' })).toMatchObject({ ok: false });
  }
});

it('rejects hostile descriptors and custom arrays without invoking getters or serialization hooks', () => {
  let executed = 0; const getter = { get value() { executed++; return 1; } }, rows: unknown[] = [1];
  Object.defineProperty(rows, '0', { enumerable: true, get() { executed++; return 1; } });
  for (const value of [getter, rows, { toJSON() { executed++; return {}; } }, Object.assign([1], { custom: true }), [1, , 3], { [Symbol('hidden')]: 1 }, Object.defineProperty({}, 'hidden', { value: 1 })]) expect(() => copyWire(value, 1000)).toThrow();
  expect(executed).toBe(0);
  const cycle: any = {}; cycle.next = cycle; expect(() => copyWire(cycle, 1000)).toThrow(/cycles/);
});

it('enforces literal chunk row/UTF-8 bounds, complete-prefix header counts and revision-one proposals', () => {
  const job = harness(); expect(job.send({ kind: 'start', input: { ...job.start, counts: { ...job.start.counts, barIds: 8 } } })).toMatchObject({ ok: false, code: 'REPORT_PREFIX' });
  const oversized = harness(); expect(oversized.send({ kind: 'start', input: oversized.start }).ok).toBe(true);
  expect(oversized.send({ kind: 'chunk', section: 'bars', start: 0, rows: Array.from({ length: REPORT_WORKER_LIMITS.chunkRows + 1 }, () => oversized.rows.bars[0]) })).toMatchObject({ ok: false });
  expect(() => copyWire({ text: 'é'.repeat(512) }, 1024)).toThrow(/byte/);
  const revised = fixture(); revised.proposals[0].event.revision = 2; const other = harness(revised); other.send({ kind: 'start', input: other.start });
  other.send({ kind: 'chunk', section: 'bars', start: 0, rows: revised.bars }); other.send({ kind: 'chunk', section: 'barIds', start: 0, rows: revised.barIds });
  expect(other.send({ kind: 'chunk', section: 'proposals', start: 0, rows: revised.proposals })).toMatchObject({ ok: false, code: 'REPORT_PROPOSAL_REVISION' });
});

it('preserves full-resolution inspection while returning bounded actual plot points and exact filtered CSV', () => {
  const job = harness(); job.upload();
  const plot = result(job.send({ kind: 'plot', query: { series: 'closed', percent: false, benchmark: true, favorable: true, adverse: true } }));
  expect(plot.count).toBe(9); expect(plot.values.at(-1)).toMatchObject({ index: 8, value: -4 }); expect(plot.benchmark[0].index).toBe(1); expect(plot.benchmark[0].breakBefore).toBe(true);
  const page = result(job.send({ kind: 'trades', query: { side: 'short', query: '', sort: 'netProfit', descending: true, page: 0 } })); expect(page.count).toBe(1); expect(page.rows[0].netProfit).toBe(-8);
  const exported = job.send({ kind: 'export', format: 'trades', side: 'short' }); if (!exported.ok || exported.kind !== 'export') throw Error(JSON.stringify(exported));
  const csv = new TextDecoder('utf-8', { fatal: true }).decode(exported.buffer); expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2); expect(csv).toContain('"short"'); expect(csv).not.toContain('"long"');
});
