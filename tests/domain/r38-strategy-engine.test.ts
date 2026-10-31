// Per-entry exits on pyramided entries, the engine position trace, account currency and the
// after-fill proposal transport. SYNTHETIC bars only.
import { describe, expect, it } from 'vitest';
import { backtestStrategy, DEFAULT_STRATEGY_CONFIG, validateStrategyConfig, type StrategyConfig, type StrategyFillContext, type StrategyPositionState } from '../../src/domain/strategy';
import { scriptOrdersAndFillAnswers, splitFillProposal } from '../../src/domain/strategy-script-orders';
import { runReportJob } from '../../src/strategy-report/backtest';
import { reportAccountCurrency, strategyReportJobInput } from '../../src/strategy-report/use-report';
import { validateReportRow, validateReportStart } from '../../src/strategy-report/schema';
import { StrategyReportWorkerSession } from '../../src/strategy-report/worker-core';
import { withAccountCurrency } from '../../src/ui/StrategyDialog';
import type { StrategyExecution } from '../../src/ui/StrategyDialog';
import type { Bar } from '../../src/domain/types';

const t0 = 1_700_000_000;
const row = (index: number, open: number, high: number, low: number, close: number): Bar => ({ time: t0 + index * 60, open, high, low, close, volume: 1 });
// Route rule: open, nearer extreme, farther extreme, close.
const bars: Bar[] = [
  row(0, 100, 101, 99.5, 100.5), row(1, 101, 101.5, 100.5, 101.2), row(2, 102, 102.3, 101.8, 102.1),
  row(3, 102.1, 102.6, 101.9, 102.4), row(4, 102.5, 103.4, 102.4, 103.2), row(5, 103.2, 103.5, 103, 103.3),
];
const config = (patch: Partial<StrategyConfig> = {}): Partial<StrategyConfig> => ({ pyramiding: 2, tickSize: 0.01, ...patch });

describe(' exits on pyramided entries: one exit per open entry', () => {
  it('an exit without fromEntry places one bracket per entry, each from its own fill price', () => {
    // Entries fill at bar 1 open (101) and bar 2 open (102). The exit is sent at every bar close from bar 2.
    const exit = (bar: number) => ({ barIndex: bar, orders: [{ id: `x-${bar}`, action: 'exit' as const, name: 'TP', profitTicks: 100 }] });
    const result = backtestStrategy({ bars, config: config(), signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'buy', quantity: 1 }] }, exit(2), exit(3)] });
    expect(result.ok, result.diagnostics.join(' ')).toBe(true);
    const legs = result.orders.filter(order => order.id.includes(':profit'));
    // One take profit per entry: 101 + 1.00 and 102 + 1.00. A re-sent identical exit keeps each bracket.
    expect(legs.map(leg => [leg.limitPrice, leg.quantity, leg.status, leg.label])).toEqual([[102, 1, 'filled', 'Exit TP take profit'], [103, 1, 'filled', 'Exit TP take profit']]);
    expect(legs.every(leg => /Protects Entry/.test(leg.reason ?? ''))).toBe(true);
    // Bar 3 opens at 102.1 above the first target; bar 4 trades through 103.
    expect(result.trades.map(trade => [trade.entryPrice, trade.exitPrice, trade.exitBar])).toEqual([[101, 102.1, 3], [102, 103, 4]]);
    expect(result.diagnostics).toEqual([]);
  });
  it('a single open entry keeps the one-bracket path (from the average price); cancel by name ends every per-entry bracket', () => {
    const one = backtestStrategy({ bars, config: config(), signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 2 }] }, { barIndex: 2, orders: [{ id: 'x', action: 'exit', name: 'TP', profitTicks: 100 }] }] });
    const legs = one.orders.filter(order => order.id.includes(':profit'));
    expect(legs.map(leg => [leg.limitPrice, leg.quantity])).toEqual([[102, 2]]); expect(legs[0].reason).toContain('the average open price 101');
    const cancelled = backtestStrategy({ bars, config: config(), signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 2, orders: [{ id: 'x', action: 'exit', name: 'TP', profitTicks: 500 }] }, { barIndex: 3, orders: [{ action: 'cancel', targetName: 'TP' }] }] });
    expect(cancelled.orders.filter(order => order.id.includes(':profit')).map(leg => [leg.limitPrice, leg.status, leg.reason])).toEqual([[106, 'cancelled', 'Cancelled by the strategy.'], [107, 'cancelled', 'Cancelled by the strategy.']]);
  });
  it('an explicit quantity is capped at each entry, a percent is of each entry, and a closed entry ends its bracket', () => {
    const signals = [{ barIndex: 0, orders: [{ action: 'buy' as const, quantity: 2 }] }, { barIndex: 1, orders: [{ action: 'buy' as const, quantity: 4 }] }];
    const capped = backtestStrategy({ bars, config: config(), signals: [...signals, { barIndex: 2, orders: [{ id: 'q', action: 'exit', name: 'Q', quantity: 3, lossTicks: 900 }] }] });
    expect(capped.orders.filter(order => order.id.includes(':loss')).map(leg => leg.quantity)).toEqual([2, 3]);
    const percent = backtestStrategy({ bars, config: config(), signals: [...signals, { barIndex: 2, orders: [{ id: 'p', action: 'exit', name: 'P', quantityPercent: 50, lossTicks: 900 }] }] });
    expect(percent.orders.filter(order => order.id.includes(':loss')).map(leg => leg.quantity)).toEqual([1, 2]);
    // A sell of 2 at bar 3 (FIFO) closes the first entry; re-sending the exit at bar 3 ends that entry's bracket.
    const closed = backtestStrategy({ bars, config: config(), signals: [...signals, { barIndex: 2, orders: [{ id: 'c1', action: 'exit', name: 'C', lossTicks: 900 }, { action: 'sell', quantity: 2 }] }, { barIndex: 3, orders: [{ id: 'c2', action: 'exit', name: 'C', lossTicks: 900 }] }] });
    const legs = closed.orders.filter(order => order.id.includes(':loss'));
    expect(legs.map(leg => [leg.quantity, leg.status])).toEqual([[2, 'cancelled'], [4, 'working']]);
  });
});

describe(' engine position trace (ctx.strategy) and after-fill context', () => {
  it('observePosition sees each bar close after its fills and before its own orders; onFill sees the average price, open trades and ordinal', () => {
    const states: StrategyPositionState[] = [], fills: StrategyFillContext[] = [];
    const result = backtestStrategy({ bars, config: config({ calcOnOrderFills: true }), signals: [{ barIndex: 0, orders: [{ action: 'buy', quantity: 1 }] }, { barIndex: 1, orders: [{ action: 'buy', quantity: 3 }] }], observePosition: state => { states.push({ ...state }); }, onFill: context => { fills.push(context); return []; } });
    expect(result.ok).toBe(true);
    expect(states.map(state => [state.barIndex, state.position, state.averagePrice, state.openTrades])).toEqual([[0, 0, null, 0], [1, 1, 101, 1], [2, 4, 101.75, 2], [3, 4, 101.75, 2], [4, 4, 101.75, 2], [5, 4, 101.75, 2]]);
    expect(fills.map(context => [context.barIndex, context.ordinal, context.position, context.averagePrice, context.openTrades])).toEqual([[1, 0, 1, 101, 1], [2, 0, 4, 101.75, 2]]);
    expect(fills[1].completedBars).toHaveLength(2);
  });
});

describe(' after-fill proposals: adapter, report transport and worker', () => {
  const ids = bars.map((_, index) => 'synthetic-r38-' + index), event = (index: number) => ({ id: ids[index], revision: 1, time: bars[index].time });
  const proposals = [{ sequence: 1, side: 'buy', quantity: 1, event: event(0), virtual: true, options: { id: 'Long' } }];
  // The entry fills at bar 1 open (ordinal 0); onFill answered with a close-only sell, which fills at the next route point.
  const fillProposals = [{ sequence: 2, side: 'sell', quantity: 1, event: event(1), virtual: true, options: { id: 'Flat', close: true }, fill: 0 }];
  const afterFill = { ...DEFAULT_STRATEGY_CONFIG, calcOnOrderFills: true };
  it('splits a fill proposal, keys it by bar and ordinal, and refuses a bad ordinal or a repeated sequence', () => {
    expect(splitFillProposal(fillProposals[0])).toEqual({ proposal: { sequence: 2, side: 'sell', quantity: 1, event: event(1), virtual: true, options: { id: 'Flat', close: true } }, ordinal: 0 });
    const { signals, answers } = scriptOrdersAndFillAnswers(proposals, fillProposals, bars, ids);
    expect(signals).toHaveLength(1); expect([...answers.keys()]).toEqual(['1:0']); expect(answers.get('1:0')).toEqual([{ id: 'script-2', action: 'sell', quantity: 1, type: 'market', name: 'Flat', closeOnly: true }]);
    expect(() => splitFillProposal({ ...fillProposals[0], fill: -1 })).toThrow('ordinal');
    expect(() => scriptOrdersAndFillAnswers(proposals, [{ ...fillProposals[0], sequence: 1 }], bars, ids)).toThrow();
  });
  it('the report job answers each fill from its proposals, the worker session gives the same report, and the schema checks the section', () => {
    const job = { execution: { bars, barIds: ids, proposals, fillProposals, chartType: 'standard' as const, context: { executionId: 'r38', sourceLabel: 'Synthetic', currency: 'USD', timezone: 'UTC' } }, config: afterFill };
    const result = runReportJob(job);
    expect(result.ok, result.diagnostics.join(' ')).toBe(true);
    // Bar 1 route: 101 (open), 100.5 (low), 101.5, 101.2. The close fills at the low, the next route point.
    expect(result.trades.map(trade => [trade.entryBar, trade.exitBar, trade.entryPrice, trade.exitPrice])).toEqual([[1, 1, 101, 100.5]]);
    expect(() => runReportJob({ ...job, config: DEFAULT_STRATEGY_CONFIG })).toThrow('Recalculate after order is filled');
    const session = new StrategyReportWorkerSession(); let sequence = 0;
    const send = (fields: Record<string, unknown>) => session.handle({ version: 1, job: 'r38-fill', sequence: ++sequence, ...fields }) as any;
    expect(send({ kind: 'start', input: { context: job.execution.context, config: afterFill, chartType: 'standard', counts: { bars: bars.length, standardBars: 0, barIds: bars.length, proposals: 1, fillProposals: 1 } } })).toMatchObject({ ok: true });
    for (const [section, rows] of [['bars', bars], ['barIds', ids], ['proposals', proposals], ['fillProposals', fillProposals]] as const) expect(send({ kind: 'chunk', section, start: 0, rows })).toMatchObject({ ok: true, kind: 'ack' });
    const ready = send({ kind: 'seal' }); expect(ready, JSON.stringify(ready)).toMatchObject({ ok: true, kind: 'ready' });
    expect(ready.value.counts.trades).toBe(1); expect(ready.value.metrics.all.closedNet.value).toBe(result.trades[0].netProfit);
    expect(() => validateReportStart({ context: job.execution.context, config: DEFAULT_STRATEGY_CONFIG, chartType: 'standard', counts: { bars: 1, standardBars: 0, barIds: 1, proposals: 0, fillProposals: 1 } })).toThrow('Recalculate after order is filled');
    expect(() => validateReportRow('fillProposals', fillProposals[0])).not.toThrow();
    expect(() => validateReportRow('fillProposals', proposals[0])).toThrow('ordinal');
    expect(() => validateReportRow('fillProposals', { ...fillProposals[0], extra: 1 })).toThrow();
    expect(() => validateReportRow('proposals', fillProposals[0])).toThrow();
  });
});

describe(' account currency (STRATEGY.CONFIG.CURRENCY)', () => {
  const execution = (currency: string | null): StrategyExecution => ({ result: { orders: [] } as never, bars: bars.slice(0, 2), barIds: ['a', 'b'], identity: 'r38-currency', source: 'Synthetic', chartType: 'standard', currency, timezone: 'UTC' });
  it('Default shows the symbol currency; USD converts a USD symbol exactly and refuses what it cannot convert', () => {
    expect(reportAccountCurrency('USD', {})).toEqual({ ok: true, currency: 'USD' });
    expect(reportAccountCurrency(null, {})).toEqual({ ok: true, currency: null });
    expect(reportAccountCurrency('USD', { accountCurrency: 'USD' })).toEqual({ ok: true, currency: 'USD' });
    const eur = reportAccountCurrency('EUR', { accountCurrency: 'USD' }); expect(eur.ok).toBe(false); expect(!eur.ok && eur.reason).toContain('No EUR/USD rate is loaded');
    expect(reportAccountCurrency(null, { accountCurrency: 'USD' }).ok).toBe(false);
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, accountCurrency: 'EUR' as never })).toEqual(['Account currency must be Default (the symbol currency) or USD.']);
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, accountCurrency: 'USD' })).toEqual([]);
  });
  it('the report job carries the account currency in its context and never sends the property to the worker', () => {
    const settings = withAccountCurrency(DEFAULT_STRATEGY_CONFIG, 'USD');
    expect(settings.accountCurrency).toBe('USD'); expect(Object.hasOwn(withAccountCurrency(settings, 'default'), 'accountCurrency')).toBe(false);
    const prepared = strategyReportJobInput(execution('USD'), settings);
    expect(prepared.waiting).toBe(false);
    if (!prepared.waiting) { expect(prepared.input.execution.context.currency).toBe('USD'); expect(Object.hasOwn(prepared.input.config, 'accountCurrency')).toBe(false); expect(() => validateReportStart({ context: prepared.input.execution.context, config: prepared.input.config, chartType: 'standard', counts: { bars: 2, standardBars: 0, barIds: 2, proposals: 0 } })).not.toThrow(); }
    expect(() => strategyReportJobInput(execution('EUR'), settings)).toThrow('Choose Default');
  });
});
