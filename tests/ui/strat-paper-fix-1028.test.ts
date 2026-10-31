// Pure pieces behind the strategy date fields, strategy mark names,
// plot titles, one notice per fill and the order ticket price prefill. SYNTHETIC values only; no DOM or packaged window.
import { describe, expect, it } from 'vitest';
import { parseUtcDayInput } from '../../src/domain/strategy-date-range';
import { strategyFillWord, strategyTradeMarks, DEFAULT_STRATEGY_MARK_SETTINGS } from '../../src/chart/strategy-marks';
import { scriptStyleTitle } from '../../src/chart/script-port';
import { ticketPrefillPrice } from '../../src/ui/PaperOrderTicket';
import { freshPaperNotifications } from '../../src/domain/paper-notifications';
import type { PaperAccount } from '../../src/domain/paper';

describe('strategy custom date range typing', () => {
  it('rejects a partly typed year instead of mapping it to 19xx', () => {
    expect(parseUtcDayInput('0002-06-01')).toBeNull();
    expect(parseUtcDayInput('0070-06-01')).toBeNull();
    expect(parseUtcDayInput('0202-06-01')).toBeNull();
    expect(parseUtcDayInput('2025-06-01')).toBe(Date.UTC(2025, 5, 1) / 1000);
  });
});

describe('strategy marks name unnamed script orders by their effect', () => {
  it('Long, Short and Close from the position before the fill', () => {
    expect(strategyFillWord('buy', 1, 0)).toBe('Long');
    expect(strategyFillWord('sell', 1, 0)).toBe('Short');
    expect(strategyFillWord('sell', 1, 1)).toBe('Close');
    expect(strategyFillWord('buy', 1, -2)).toBe('Close');
    expect(strategyFillWord('sell', 3, 1)).toBe('Short');
    expect(strategyFillWord('buy', 1, 1)).toBe('Long');
  });
  it('never shows a generated script id on a mark', () => {
    const fill = (orderId: string, side: 'buy' | 'sell', barIndex: number) => ({ orderId, side, quantity: 1, price: 10, commission: 0, barIndex, time: barIndex, phase: 'open' as const, basis: 'chart-prices' as const });
    const result = { fills: [fill('script-18', 'buy', 0), fill('script-19', 'sell', 1), fill('named', 'sell', 2)], orders: [{ id: 'named', label: 'Exit now' }], trades: [] } as never;
    const bars = [0, 1, 2].map(time => ({ time, high: 11, low: 9 }));
    const { marks } = strategyTradeMarks(result, bars, DEFAULT_STRATEGY_MARK_SETTINGS);
    expect(marks.map(mark => mark.label)).toEqual(['Long +1', 'Close -1', 'Exit now -1']);
    expect(marks.some(mark => /script-/.test(mark.label + mark.title))).toBe(false);
  });
});

describe('script style titles', () => {
  it('drops the internal prefixes', () => {
    expect(scriptStyleTitle('lvplot:Fast')).toBe('Fast');
    expect(scriptStyleTitle('lvhline:Zero')).toBe('Line: Zero');
    expect(scriptStyleTitle('lvfill:Band')).toBe('Fill: Band');
    expect(scriptStyleTitle('Plain')).toBe('Plain');
  });
});

describe('order ticket price prefill', () => {
  const quote = { bid: 22.21, ask: 22.23 };
  it('limit rests on its own side, stop starts where it would trigger', () => {
    expect(ticketPrefillPrice('limit', 'buy', quote, 2)).toBe('22.21');
    expect(ticketPrefillPrice('limit', 'sell', quote, 2)).toBe('22.23');
    expect(ticketPrefillPrice('stop', 'buy', quote, 2)).toBe('22.23');
    expect(ticketPrefillPrice('stop-limit', 'sell', quote, 2)).toBe('22.21');
    expect(ticketPrefillPrice('market', 'buy', quote, 2)).toBe('');
    expect(ticketPrefillPrice('trailing-stop', 'buy', quote, 2)).toBe('');
    expect(ticketPrefillPrice('limit', 'buy', null, 2)).toBe('');
  });
});

describe('one notice per fill', () => {
  const instrument = { id: 'syn:GME', symbol: 'GME' };
  const account = (events: PaperAccount['events'], orders: { id: string; bracket?: unknown }[]) => ({ id: 'a', orders: orders.map(order => ({ ...order, instrument })), events } as unknown as PaperAccount);
  it('a market order with its take profit and stop loss shows only the fill', () => {
    const events = [
      { id: 1, at: 0, type: 'submitted', orderId: 'o1', message: 'Buy 1' },
      { id: 2, at: 0, type: 'filled', orderId: 'o1', message: '1 GME at 22.23' },
      { id: 3, at: 0, type: 'submitted', orderId: 'o2', message: 'Virtual take profit 1 at 24.01.' },
      { id: 4, at: 0, type: 'submitted', orderId: 'o3', message: 'Virtual stop loss 1 at 20.45.' },
    ] as PaperAccount['events'];
    const { notifications, watermark } = freshPaperNotifications(account(events, [{ id: 'o1' }, { id: 'o2', bracket: { leg: 'tp' } }, { id: 'o3', bracket: { leg: 'sl' } }]), 0, false);
    expect(notifications.map(row => row.kind)).toEqual(['filled']);
    expect(watermark).toBe(4);
  });
  it('a resting order without a fill still shows its placed notice', () => {
    const events = [{ id: 1, at: 0, type: 'submitted', orderId: 'o1', message: 'Buy limit 1' }] as PaperAccount['events'];
    expect(freshPaperNotifications(account(events, [{ id: 'o1' }]), 0, false).notifications.map(row => row.kind)).toEqual(['submitted']);
  });
});
