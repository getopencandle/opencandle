import { expect, it } from 'vitest';
import type { LocalAlert } from '../../src/domain/alerts';
import { planBackgroundAlertFeeds } from '../../src/ui/background-alert-plan';

// SYNTHETIC checks: which symbols outside the charted one still need a live feed for their alerts.
import { alertOn, liveLike } from '../helpers/background-alert-fixtures';
const plan = (alerts: LocalAlert[], active = 'US:SPY', open: string[] = [], max = 30) => planBackgroundAlertFeeds({ alerts, activeInstrumentId: active, openAlpacaSymbols: new Set(open), maxAlpacaSymbols: max });

it('plans one feed per other symbol and interval, never the charted symbol', () => {
  const a = alertOn(liveLike('AAPL'), 'a1'), b = alertOn(liveLike('AAPL'), 'a2'), c = alertOn(liveLike('MSFT', '1m'), 'a3'), d = alertOn(liveLike('SPY'), 'a4');
  const result = plan([a, b, c, d]);
  expect(result.feeds.map(feed => [feed.providerId, feed.symbol, feed.resolution, feed.alertIds])).toEqual([['alpaca-iex', 'AAPL', '5m', ['a1', 'a2']], ['alpaca-iex', 'MSFT', '1m', ['a3']]]);
  expect(result.skipped).toEqual([]);
});

it('skips paused and finished alerts without a message, and explains every alert it cannot watch', () => {
  const paused = { ...alertOn(liveLike('AAPL'), 'p'), status: 'paused' as const }, expired = { ...alertOn(liveLike('AAPL'), 'e'), status: 'expired' as const };
  const imported = alertOn({ ...liveLike('IBM'), provenance: { ...liveLike('IBM').provenance, datasetId: 'imported:ibm', providerId: 'local-import' } }, 'i');
  const watched = alertOn(liveLike('NVDA'), 'd');
  const result = plan([paused, expired, imported, watched]);
  expect(result.feeds.map(feed => feed.symbol)).toEqual(['NVDA']);
  expect(result.skipped).toEqual([{ alertId: 'i', reason: 'Its data is not a live feed, so it is only checked while that chart is open.' }]);
});

it('stays inside the 30-symbol Alpaca limit counting symbols the charts already stream', () => {
  const symbols = ['AAA', 'BBB', 'CCC', 'DDD'];
  const alerts = symbols.map((symbol, index) => alertOn(liveLike(symbol), 'x' + index));
  const result = plan(alerts, 'US:SPY', ['SPY', 'AAA', 'ZZZ'], 5);
  expect(result.feeds.map(feed => feed.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
  expect(result.skipped.map(row => row.alertId)).toEqual(['x3']);
  expect(result.skipped[0].reason).toMatch(/30|limit/);
});
