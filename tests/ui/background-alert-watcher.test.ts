import { expect, it } from 'vitest';
import type { BarDataset } from '../../src/domain/types';
import type { LiveHandle } from '../../src/domain/live-provider';
import type { LocalAlert } from '../../src/domain/alerts';
import { BackgroundAlertWatcher } from '../../src/ui/background-alert-watcher';
import { alertOn, liveLike } from '../helpers/background-alert-fixtures';

// SYNTHETIC checks: alerts on symbols that are not charted keep running from their own live feeds.
const bar = (day: number, close: number) => ({ time: Date.UTC(2024, 0, day) / 1000, open: close, high: close + 1, low: close - 1, close, volume: 100 });
const NOW = Date.UTC(2026, 9, 14) / 1000;
function fakeFeed(symbol: string) {
  const listeners = new Set<(dataset: BarDataset) => void>(); let dataset: BarDataset = { ...liveLike(symbol), bars: [bar(2, 9)] };
  const handle: LiveHandle & { closed: number } = { datasetId: dataset.provenance.datasetId, closed: 0, dataset: () => dataset, formingTime: () => null, onChange: listener => { listeners.add(listener); return () => listeners.delete(listener); }, close() { this.closed++; } };
  return { handle, push(bars: BarDataset['bars']) { dataset = { ...dataset, bars, provenance: { ...dataset.provenance, revision: dataset.provenance.revision + 'x' } }; for (const listener of [...listeners]) listener(dataset); } };
}
function setup(initial: LocalAlert[], active = 'US:SPY') {
  const refuse = { on: false }; let alerts = initial; const feeds = new Map<string, ReturnType<typeof fakeFeed>>(), published: LocalAlert[][] = []; let serial = 0;
  const watcher = new BackgroundAlertWatcher({
    open: feed => { const made = fakeFeed(feed.symbol); feeds.set(feed.symbol, made); return made.handle; },
    alerts: () => alerts, publish: (next, expected) => { if (refuse.on || expected !== alerts) return false; alerts = next; published.push(next); return true; },
    now: () => NOW, identity: () => 'id' + (++serial), openAlpacaSymbols: () => new Set([active.slice(3)]),
  });
  return { refuse, watcher, feeds, published, alerts: () => alerts, setAlerts: (next: LocalAlert[]) => { alerts = next; }, active };
}

it('opens a feed only for symbols that are not charted and closes it when the symbol is charted or its alerts are gone', () => {
  const aapl = alertOn(liveLike('AAPL'), 'a'), spy = alertOn(liveLike('SPY'), 's');
  const ctx = setup([aapl, spy]);
  const plan = ctx.watcher.sync('US:SPY');
  expect([...ctx.feeds.keys()]).toEqual(['AAPL']); expect(plan.skipped).toEqual([]);
  ctx.watcher.sync('US:AAPL');
  expect(ctx.feeds.get('AAPL')!.handle.closed).toBe(1);
  expect([...ctx.feeds.keys()]).toEqual(['AAPL', 'SPY']);
  ctx.setAlerts([]); ctx.watcher.sync('US:AAPL');
  expect(ctx.feeds.get('SPY')!.handle.closed).toBe(1);
  ctx.watcher.dispose();
});

it('triggers and saves an alert from a background feed, then stays quiet until the next crossing', async () => {
  const aapl = alertOn(liveLike('AAPL'), 'a');
  const ctx = setup([aapl]); ctx.watcher.sync('US:SPY');
  const feed = ctx.feeds.get('AAPL')!;
  feed.push([bar(2, 9)]); await ctx.watcher.settled();
  expect(ctx.alerts()[0].history).toHaveLength(0);
  feed.push([bar(2, 9), bar(3, 11)]); await ctx.watcher.settled();
  const triggered = ctx.alerts()[0];
  expect(triggered.history.length).toBeGreaterThanOrEqual(1);
  expect(triggered.history[0].value).toBe(11);
  const count = triggered.history.length;
  feed.push([bar(2, 9), bar(3, 11), bar(3, 12)].slice(0, 2)); await ctx.watcher.settled();
  expect(ctx.alerts()[0].history).toHaveLength(count);
  ctx.watcher.dispose();
});

it('keeps its place when a save is refused and triggers on the next update', async () => {
  const aapl = alertOn(liveLike('AAPL'), 'a');
  const ctx = setup([aapl]); ctx.watcher.sync('US:SPY');
  const feed = ctx.feeds.get('AAPL')!; feed.push([bar(2, 9)]); await ctx.watcher.settled();
  ctx.refuse.on = true;
  feed.push([bar(2, 9), bar(3, 11)]); await ctx.watcher.settled();
  expect(ctx.alerts()[0].history).toHaveLength(0);
  ctx.refuse.on = false;
  feed.push([bar(2, 9), bar(3, 11)]); await ctx.watcher.settled();
  expect(ctx.alerts()[0].history.length).toBeGreaterThanOrEqual(1);
  ctx.watcher.dispose();
});

it('HISTORY: a history prepend never resets or retriggers an alert', async () => {
  const { recordLiveOrigin } = await import('../../src/domain/live-history');
  const origin = bar(2, 9).time, snap = (...rows: ReturnType<typeof bar>[]) => { recordLiveOrigin(rows, origin); return rows; };
  const aapl = alertOn(liveLike('AAPL'), 'a');
  const ctx = setup([aapl]); ctx.watcher.sync('US:SPY');
  const feed = ctx.feeds.get('AAPL')!;
  feed.push(snap(bar(2, 9))); await ctx.watcher.settled();
  feed.push(snap(bar(2, 9), bar(3, 11))); await ctx.watcher.settled();
  const before = ctx.alerts()[0], count = before.history.length, publishes = ctx.published.length;
  expect(count).toBeGreaterThanOrEqual(1);
  // Older pages arrive: every row index shifts, and the older bars would cross the level if they were read as new.
  feed.push(snap(bar(0, 50), bar(1, 5), bar(2, 9), bar(3, 11))); await ctx.watcher.settled();
  feed.push(snap(bar(-3, 4), bar(0, 50), bar(1, 5), bar(2, 9), bar(3, 11))); await ctx.watcher.settled();
  expect(ctx.alerts()[0].history).toHaveLength(count);
  const after = ctx.alerts()[0];
  expect(after.history).toEqual(before.history);
  expect([after.lastTriggeredBar, after.lastTriggeredAt, after.lastValue, after.missedDataGaps]).toEqual([before.lastTriggeredBar, before.lastTriggeredAt, before.lastValue, before.missedDataGaps]);
  void publishes;
  ctx.watcher.dispose();
});
