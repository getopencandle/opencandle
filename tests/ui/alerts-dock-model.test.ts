import { expect, it } from 'vitest';
import { createLocalAlert, processAlertEvent, type AlertEvent, type LocalAlert } from '../../src/domain/alerts';
import { dockApplyAction, dockListRows, dockLogRows } from '../../src/ui/alerts-dock-model';

// SYNTHETIC checks of the docked Alerts panel's list and log rows.
const make = (id: string, symbol: string, extra: Partial<LocalAlert['definition']> = {}) => createLocalAlert({ id, name: `${symbol} ${id}`, message: `${symbol} msg`, instrumentId: 'US:' + symbol, sourceId: 'close', condition: { kind: 'crossing-up', value: 182.4 }, frequency: 'every-time', createdAt: 100, expiresAt: null, mode: 'ordinary', runId: 'ordinary', ...extra });
const event = (alert: LocalAlert, sequence: number, value: number, time: number): AlertEvent => ({ instrumentId: alert.definition.instrumentId, sourceId: 'close', value, time, availableAt: time, sequence, barId: 'bar' + sequence, barClosed: false, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' });
const fire = (alert: LocalAlert, sequence: number, time: number) => { let current = processAlertEvent(alert, event(alert, sequence * 2 - 1, 180, time - 1)).alert; current = processAlertEvent(current, event(current, sequence * 2, 185, time)).alert; expect(current.history.length).toBeGreaterThan(alert.history.length); return current; };

it('lists every alert on every symbol with a plain condition, state and last trigger', () => {
  const a = fire(make('1', 'AAPL'), 1, 1000), b = { ...make('2', 'MSFT', { condition: { kind: 'inside', lower: 10, upper: 20 } }), status: 'paused' as const };
  const rows = dockListRows([a, b], { activeInstrumentId: 'US:AAPL', unwatched: new Map([['2', 'Its data is not live.']]), formatTime: seconds => 't' + seconds });
  expect(rows.map(row => [row.id, row.symbol, row.condition, row.status, row.lastTriggered, row.onChart, row.note])).toEqual([
    ['1', 'AAPL', 'Crossing up 182.4', 'Active', 't1000', true, null],
    ['2', 'MSFT', 'Inside channel 10 to 20', 'Paused', null, false, 'Its data is not live.'],
  ]);
});

it('builds the log from every alert, newest first', () => {
  const a = fire(make('1', 'AAPL'), 1, 1000), b = fire(make('2', 'MSFT'), 1, 2000), a2 = fire(a, 2, 3000);
  const log = dockLogRows([a2, b], { formatTime: seconds => 't' + seconds });
  expect(log.map(row => [row.symbol, row.time, row.alert])).toEqual([['AAPL', 't3000', 'AAPL 1'], ['MSFT', 't2000', 'MSFT 2'], ['AAPL', 't1000', 'AAPL 1']]);
  expect(dockLogRows([a2, b], { formatTime: String, limit: 2 })).toHaveLength(2);
});

it('pauses, resumes and removes one alert and leaves the others as they were', () => {
  const a = make('1', 'AAPL'), b = make('2', 'MSFT');
  const paused = dockApplyAction([a, b], '1', 'pause', 500);
  expect(paused.map(alert => alert.status)).toEqual(['paused', 'active']); expect(paused[1]).toBe(b);
  expect(dockApplyAction(paused, '1', 'resume', 600)[0].status).toBe('active');
  expect(dockApplyAction([a, b], '1', 'remove', 500)).toEqual([b]);
  expect(() => dockApplyAction([a, b], 'missing', 'pause', 500)).toThrow(/no longer/);
});
