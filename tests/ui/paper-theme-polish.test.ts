import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { applyPaperExitDrag } from '../../src/domain/paper-exit-drag';
import { paperChartLines } from '../../src/ui/PaperChartLines';
import { modifyPaperDockOrder, paperDockOrderEdit, paperDockOrdersByStatus } from '../../src/ui/PaperTradingDock';
import { nextPaperToasts } from '../../src/ui/PaperTradingToasts';
import { chartSurfaceLight, chartSurfaceProps } from '../../src/ui/CellStudyLegend';
import { performanceCell } from '../../src/strategy-report/PerformanceSummary';

// Synthetic instrument and quotes, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:POLISH', symbol: 'PLSH', name: 'Synthetic polish', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const quote = (bid: number, ask: number, sequence: number, at: number): Quote => ({ instrumentId: instrument.id, bid, ask, session: 'regular', fixture: true, eventTime: at, receivedAt: at, availableAt: at, sequence });
function bracketed(): { account: PaperAccount; orderId: string } {
  const account = processPaperQuote(createPaperAccount(), quote(49.18, 49.2, 1, 100), 100).account;
  const result = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 48.5, exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 1, takeProfit: 51, stopLoss: 47 }] } }, 100);
  expect(result.ok).toBe(true);
  return { account: result.account, orderId: result.orderId! };
}

describe('TP/SL on a working entry order (#8)', () => {
  it('draws the pending take profit and stop loss with the order', () => {
    const { account } = bracketed();
    const lines = paperChartLines(account, instrument);
    expect(lines.map(line => line.label)).toEqual(['Buy limit 1 at 48.50', 'Take profit 1 at 51.00 (on fill)', 'Stop loss 1 at 47.00 (on fill)']);
    expect(lines[1]).toMatchObject({ kind: 'exit', side: 'sell', pendingExit: { level: 0, leg: 'tp' } });
  });
  it('shows TP and SL columns in Orders and edits them in Modify', () => {
    const { account, orderId } = bracketed();
    expect(paperDockOrdersByStatus(account, 'working')[0]).toMatchObject({ takeProfit: '51.00', stopLoss: '47.00' });
    const edit = paperDockOrderEdit(account.orders.find(order => order.id === orderId)!);
    expect(edit).toMatchObject({ takeProfit: '51.00', stopLoss: '47.00' });
    const result = modifyPaperDockOrder(account, { ...edit, limit: '48.40', takeProfit: '52', stopLoss: '' }, 101);
    expect('message' in result ? result.message : result.ok).toBe(true);
    if (!('account' in result) || !result.ok) return;
    expect(paperDockOrdersByStatus(result.account, 'working')[0]).toMatchObject({ limit: '48.40', takeProfit: '52.00', stopLoss: '' });
    expect(modifyPaperDockOrder(result.account, { ...paperDockOrderEdit(result.account.orders.find(order => order.id === orderId)!), takeProfit: '', stopLoss: '' }, 102)).toMatchObject({ ok: false });
  });
  it('moves a pending leg by drag', () => {
    const { account, orderId } = bracketed();
    const result = applyPaperExitDrag(account, orderId, 46.5, 0.01, 101, { level: 0, leg: 'sl' });
    expect(result?.ok).toBe(true);
    expect(result!.account.orders.find(order => order.id === orderId)!.exits!.levels[0]).toEqual({ quantity: 1, takeProfit: 51, stopLoss: 46.5 });
  });
});

describe('fill notice (#11)', () => {
  it('reads side, quantity, symbol and price at symbol precision', () => {
    let account = processPaperQuote(createPaperAccount(), quote(47.38, 47.4, 1, 100), 100).account;
    const state = nextPaperToasts(null, account, false).state;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 1 }, 100).account;
    const fill = nextPaperToasts(state, account, false).fresh.find(item => item.kind === 'filled');
    expect(fill?.body).toBe('Buy 1 PLSH at 47.40');
  });
});

describe('legend surface and copy (#9, #15)', () => {
  it('follows the chart template background', () => {
    expect(chartSurfaceLight('#ffffff')).toBe(true);
    expect(chartSurfaceLight('rgb(232, 228, 220)')).toBe(true);
    expect(chartSurfaceLight('#161434')).toBe(false);
    expect(chartSurfaceProps({ backgroundType: 'gradient', background: '#161434', gradientStart: '#f0f5f9' })).toEqual({ style: { '--lv-chart-background': '#f0f5f9' }, 'data-chart-surface': 'light' });
  });
  it('keeps two decimals on report percents', () => {
    expect(performanceCell({ value: 15.27, unit: 'currency' } as never, { value: 0.0015, unit: 'percent' } as never, 'USD')).toBe('15.27 USD (0.00%)');
  });
});
