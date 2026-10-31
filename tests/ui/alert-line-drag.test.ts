import { expect, it, vi } from 'vitest';
import { createLocalAlert, type LocalAlert } from '../../src/domain/alerts';
import { alertLineKeyStep, repriceAlert, snapAlertPrice } from '../../src/ui/alert-line-drag';

// SYNTHETIC checks: dragging an alert line on the chart changes that alert's price.
const make = (condition: LocalAlert['definition']['condition'], id = 'a') => createLocalAlert({ id, name: id, message: 'm', instrumentId: 'US:AAPL', sourceId: 'close', condition, frequency: 'every-time', createdAt: 100, expiresAt: null, mode: 'ordinary', runId: 'ordinary' });

it('snaps a dragged price to the symbol tick and refuses a price that is not usable', () => {
  expect(snapAlertPrice(182.4049, 0.01)).toBe(182.4);
  expect(snapAlertPrice(182.405, 0.01)).toBe(182.41);
  expect(snapAlertPrice(0.0004, 0.01)).toBe(0.01);
  expect(Number.isNaN(snapAlertPrice(Number.NaN, 0.01))).toBe(true);
  expect(Number.isNaN(snapAlertPrice(10, 0))).toBe(true);
});

it('moves the level of a single-level alert, keeping its history and identity', () => {
  const a = make({ kind: 'crossing-up', value: 10 }), b = make({ kind: 'less', value: 5 }, 'b');
  const next = repriceAlert([a, b], { alertId: 'a', slot: 'level', price: 12.344, tickSize: 0.01, now: 500 });
  expect(next[0].definition.condition).toEqual({ kind: 'crossing-up', value: 12.34 });
  expect(next[0].definition.id).toBe('a'); expect(next[0].revision).toBe(2); expect(next[1]).toBe(b);
});

it('moves one edge of a channel and refuses to cross the other edge', () => {
  const a = make({ kind: 'inside', lower: 10, upper: 20 });
  expect(repriceAlert([a], { alertId: 'a', slot: 'upper', price: 25, tickSize: 0.5, now: 500 })[0].definition.condition).toEqual({ kind: 'inside', lower: 10, upper: 25 });
  expect(() => repriceAlert([a], { alertId: 'a', slot: 'lower', price: 21, tickSize: 0.5, now: 500 })).toThrow(/cross/);
});

it('returns the same collection when the price did not change, and rejects a missing alert', () => {
  const a = make({ kind: 'greater', value: 10 }), list = [a];
  expect(repriceAlert(list, { alertId: 'a', slot: 'level', price: 10.004, tickSize: 0.01, now: 500 })).toBe(list);
  expect(() => repriceAlert(list, { alertId: 'zzz', slot: 'level', price: 11, tickSize: 0.01, now: 500 })).toThrow(/no longer/);
});

it('maps arrow keys to one tick up or down', () => {
  expect([alertLineKeyStep('ArrowUp'), alertLineKeyStep('ArrowDown'), alertLineKeyStep('Enter')]).toEqual([1, -1, 0]);
  void vi;
});
