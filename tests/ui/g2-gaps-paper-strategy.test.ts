import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPaperAccount, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars } from '../../src/domain/paper-bar-feed';
import type { Instrument } from '../../src/domain/types';
import { modifyPaperDockOrder, paperDockOrderEdit, paperDockOrderEditable, paperDockPositions, paperDockProtect, PaperTradingDock, protectPaperDockPosition } from '../../src/ui/PaperTradingDock';
import { parseUtcDayInput, sameStrategyDateRange, strategyDateRangeLabel, strategyRangeSlice, utcDayInput, validateStrategyDateRange } from '../../src/domain/strategy-date-range';
import { DEFAULT_STRATEGY_CONFIG, validateStrategyConfig } from '../../src/domain/strategy';
import { freezeStrategyConfig } from '../../src/domain/strategy-alert';
import { strategyReportJobInput } from '../../src/strategy-report/use-report';
import { dateRangeChoice, dateRangeFor, sameStrategyConfig, withDateRange } from '../../src/ui/StrategyDialog';
import type { StrategyExecution } from '../../src/ui/StrategyDialog';

// Synthetic instrument, synthetic prices, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:G2', symbol: 'GTWO', name: 'Synthetic G2', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const bar = (time: number, close: number, low = close, high = close) => ({ time, open: close, high, low, close, volume: 1 });
function trading(): PaperAccount {
  let account = feedPaperBars(createPaperAccount(), { bars: [bar(60, 100)], instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
  for (const request of [{ side: 'buy', type: 'market' }, { side: 'buy', type: 'limit', limitPrice: 95 }, { side: 'sell', type: 'stop', stopPrice: 90 }]) {
    const result = submitPaperOrder(account, { instrument, quantity: 2, ...request } as never, 60); expect(result.ok).toBe(true); account = result.account;
  }
  return feedPaperBars(account, { bars: [bar(60, 100), bar(120, 101, 99, 101)], instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
}

describe('G2-GAPS paper trading panel', () => {
  it('modifies a working order from the Orders tab through the engine', () => {
    const account = trading(), limit = account.orders.find(order => order.type === 'limit')!;
    expect(paperDockOrderEditable(limit)).toBeNull();
    const edit = paperDockOrderEdit(limit);
    expect(edit).toMatchObject({ quantity: '2', limit: '95.00', stop: '' });
    const result = modifyPaperDockOrder(account, { ...edit, quantity: '3', limit: '96.5' }, 120);
    expect(result.ok).toBe(true);
    const changed = (result as { account: PaperAccount }).account.orders.find(order => order.id === limit.id)!;
    expect([changed.quantity, changed.limitPrice]).toEqual([3, 96.5]);
    expect(modifyPaperDockOrder(account, edit, 120)).toEqual({ ok: false, message: 'Nothing changed.' });
    expect(modifyPaperDockOrder(account, { ...edit, limit: '-1' }, 120)).toEqual({ ok: false, message: 'Enter a limit price above 0.' });
  });
  it('protects a position with a take profit and stop loss, shown in the Positions columns', () => {
    const account = trading();
    expect(protectPaperDockPosition(account, { instrumentId: instrument.id, takeProfit: '99', stopLoss: '100' }, 120)).toMatchObject({ ok: false });
    const result = protectPaperDockPosition(account, { instrumentId: instrument.id, takeProfit: '110', stopLoss: '92.5' }, 120);
    expect(result.ok).toBe(true);
    const next = (result as { account: PaperAccount }).account;
    expect(paperDockProtect(next, instrument.id)).toMatchObject({ takeProfit: '110.00', stopLoss: '92.50' });
    expect(paperDockPositions(next)[0]).toMatchObject({ takeProfit: '110.00', stopLoss: '92.50' });
    const child = next.orders.find(order => order.bracket && order.status === 'working')!;
    expect(paperDockOrderEditable(child)).toMatch(/chart lines/);
    // Saving again replaces, never stacks, the protecting exits.
    const again = protectPaperDockPosition(next, { instrumentId: instrument.id, takeProfit: '112', stopLoss: '' }, 120);
    expect(again.ok).toBe(true);
    expect(paperDockProtect((again as { account: PaperAccount }).account, instrument.id)).toMatchObject({ takeProfit: '112.00', stopLoss: '' });
  });
  it('shows margin figures in the summary strip and symbol buttons when the host can switch symbols', () => {
    const props = { account: trading(), instrument, now: 120, open: true, onToggle: () => {}, onAccountChange: () => true, onOpenTicket: () => {} };
    const markup = renderToStaticMarkup(React.createElement(PaperTradingDock, props));
    expect(markup).toContain('<dt>Account margin</dt>');
    expect(markup).toContain('<dt>Margin buffer</dt>');
    expect(markup).toContain('aria-label="Protect GTWO position"');
    expect(markup).not.toContain('class="lv-paper-dock-symbol"');
    expect(renderToStaticMarkup(React.createElement(PaperTradingDock, { ...props, onSelectSymbol: () => {} }))).toContain('title="Show GTWO on the chart"');
  });
});

const DAY = 86400;
describe('G2-GAPS strategy tester date range', () => {
  const bars = Array.from({ length: 10 }, (_, index) => bar(1_700_006_400 + index * DAY, 100 + index));
  it('validates, labels and slices ranges', () => {
    expect(validateStrategyDateRange(undefined)).toEqual([]);
    expect(validateStrategyDateRange({ kind: 'last', days: 30 })).toEqual([]);
    expect(validateStrategyDateRange({ kind: 'last', days: 31 })).toHaveLength(1);
    expect(validateStrategyDateRange({ kind: 'custom', from: null, to: null })).toHaveLength(1);
    expect(validateStrategyDateRange({ kind: 'custom', from: 2 * DAY, to: DAY })).toHaveLength(1);
    expect(validateStrategyConfig({ ...DEFAULT_STRATEGY_CONFIG, dateRange: { kind: 'custom', from: 5, to: null } })).toContain('Custom date range bounds must be whole UTC days.');
    expect(strategyRangeSlice({ kind: 'last', days: 7 }, bars)).toEqual({ start: 2, end: 10 });
    const from = bars[3].time - (bars[3].time % DAY), to = bars[5].time - (bars[5].time % DAY);
    expect(strategyRangeSlice({ kind: 'custom', from, to }, bars)).toEqual({ start: 3, end: 6 });
    expect(strategyRangeSlice(undefined, bars)).toEqual({ start: 0, end: 10 });
    expect(parseUtcDayInput(utcDayInput(from))).toBe(from);
    expect(strategyDateRangeLabel({ kind: 'custom', from, to: null })).toBe(`${utcDayInput(from)} to latest bar (UTC)`);
    expect(sameStrategyDateRange({ kind: 'custom', to: 1, from: null } as never, { kind: 'custom', from: null, to: 1 })).toBe(true);
  });
  it('the Properties helpers keep configs without a range unchanged and alerts drop it', () => {
    const ranged = withDateRange(DEFAULT_STRATEGY_CONFIG, dateRangeFor('last-90', undefined));
    expect(ranged.dateRange).toEqual({ kind: 'last', days: 90 });
    expect(dateRangeChoice(ranged.dateRange)).toBe('last-90');
    expect('dateRange' in withDateRange(ranged, dateRangeFor('all', ranged.dateRange))).toBe(false);
    expect(sameStrategyConfig(ranged, DEFAULT_STRATEGY_CONFIG)).toBe(false);
    expect(sameStrategyConfig(ranged, { ...DEFAULT_STRATEGY_CONFIG, dateRange: { kind: 'last', days: 90 } })).toBe(true);
    expect('dateRange' in freezeStrategyConfig(ranged, 'standard')).toBe(false);
  });
  it('the report job runs only the bars and proposals inside the range', () => {
    const barIds = bars.map((_, index) => 'b' + index);
    const orders = [1, 4, 7].map((index, n) => ({ sequence: n + 1, side: 'buy', quantity: 1, event: { id: barIds[index], time: bars[index].time, revision: 1 }, virtual: true }));
    const execution = { result: { orders } as never, bars, barIds, identity: 'g2', source: 'Synthetic', chartType: 'standard' } as unknown as StrategyExecution;
    const from = bars[3].time - (bars[3].time % DAY);
    const prepared = strategyReportJobInput(execution, { ...DEFAULT_STRATEGY_CONFIG, dateRange: { kind: 'custom', from, to: null } });
    if (prepared.waiting) throw new Error('unexpected wait');
    expect(prepared.input.execution.barIds).toEqual(barIds.slice(3));
    expect(prepared.input.execution.proposals.map(order => (order.event as { id: string }).id)).toEqual(['b4', 'b7']);
    expect('dateRange' in prepared.input.config).toBe(false);
    expect(() => strategyReportJobInput(execution, { ...DEFAULT_STRATEGY_CONFIG, dateRange: { kind: 'custom', from: 0, to: DAY } })).toThrow(/No bars fall inside/);
    expect(() => strategyReportJobInput({ ...execution, rerun: (() => null) as never }, { ...DEFAULT_STRATEGY_CONFIG, dateRange: { kind: 'custom', from, to: null } })).toThrow(/reads the strategy position/);
  });
});
