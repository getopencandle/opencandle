// Strategy Properties default order size helpers and report acceptance of sized runs (unit tests, not GUI evidence).
import { describe, expect, it } from 'vitest';
import { backtestStrategy, DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { ORDER_SIZE_LABELS, orderSizeHelp, sameStrategyConfig, withOrderSize } from '../../src/ui/StrategyDialog';
import type { Bar } from '../../src/domain/types';

const bars: Bar[] = [30, 30, 30, 33].map((close, index) => ({ time: 1700000000 + index * 86400, open: 30, high: Math.max(30, close), low: 29, close, volume: 1 }));

describe('RPST Strategy Properties default order size', () => {
  it('none removes the key; cash, contracts and percent set it; comparisons see the change', () => {
    const cash = withOrderSize(DEFAULT_STRATEGY_CONFIG, 'cash', 1000);
    expect(cash.defaultQuantity).toEqual({ kind: 'cash', value: 1000 });
    expect('defaultQuantity' in withOrderSize(cash, 'none', 1000)).toBe(false);
    expect(sameStrategyConfig(cash, DEFAULT_STRATEGY_CONFIG)).toBe(false);
    expect(sameStrategyConfig(cash, withOrderSize(DEFAULT_STRATEGY_CONFIG, 'cash', 1000))).toBe(true);
    expect(sameStrategyConfig(cash, withOrderSize(DEFAULT_STRATEGY_CONFIG, 'percent-of-equity', 1000))).toBe(false);
    expect(Object.keys(ORDER_SIZE_LABELS)).toEqual(['none', 'contracts', 'cash', 'percent-of-equity']);
    expect(orderSizeHelp('none')).toContain('rejected'); expect(orderSizeHelp('cash')).toContain('rounded down');
    for (const choice of Object.keys(ORDER_SIZE_LABELS) as (keyof typeof ORDER_SIZE_LABELS)[]) expect(orderSizeHelp(choice)).not.toMatch(/—/);
  });
  it('a cash-sized run produces a completed report that keeps the default size in its config', () => {
    const result = backtestStrategy({ bars, signals: [{ barIndex: 0, orders: [{ action: 'buy' }] }, { barIndex: 2, orders: [{ action: 'close' }] }], config: withOrderSize(DEFAULT_STRATEGY_CONFIG, 'cash', 1000) });
    expect(result.ok).toBe(true); expect(result.fills[0].quantity).toBe(33);
    const report = buildStrategyReport({ result, bars, barIds: bars.map((_, index) => 'b' + index), context: { executionId: 'rpst', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' } });
    expect(report.config.defaultQuantity).toEqual({ kind: 'cash', value: 1000 }); expect(report.trades).toHaveLength(1);
    expect(() => buildStrategyReport({ result: { ...result, config: { ...result.config, defaultQuantity: { kind: 'cash', value: 1000, extra: 1 } as never } }, bars, barIds: bars.map((_, index) => 'b' + index), context: { executionId: 'rpst', sourceLabel: 'Synthetic', currency: null, timezone: 'UTC' } })).toThrow();
  });
});
