import { describe, expect, it } from 'vitest';
import { DEMO_DAILY_BARS, DEMO_SYMBOLS, demoDailyDataset, demoIntradayDatasets, isDemoSourceShape, makeDeepDaily, makeDemoIntraday, makeFixture } from '../../src/domain/fixtures';
import { aggregateInterval } from '../../src/domain/intervals';
import { demoDataset, workspaceDatasets, suppliedSourceId } from '../../src/ui/workspace-grid';

describe('DEMO-DATA-1028 deep demo history', () => {
  it('daily: thousands of bars whose newest 500 are the unchanged fixture', () => {
    for (const symbol of ['GME', 'SPY']) {
      const deep = makeDeepDaily(symbol);
      expect(deep.length).toBe(DEMO_DAILY_BARS);
      expect(deep.slice(-500)).toEqual(makeFixture(symbol, 500));
      expect((deep.at(-1)!.time - deep[0]!.time) / 86400 / 365).toBeGreaterThan(14.5);
      expect(makeDeepDaily(symbol)).toEqual(deep);
      for (let i = 1; i < deep.length; i++) { const b = deep[i]!; expect(b.time).toBeGreaterThan(deep[i - 1]!.time); expect([0, 6]).not.toContain(new Date(b.time * 1000).getUTCDay()); expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close)); expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close)); expect(b.low).toBeGreaterThan(0); }
    }
  });
  it('intraday: at least 5000 bars at 1m and 5m, session hours only, deterministic', () => {
    const set = makeDemoIntraday('GME');
    expect(set['1m'].length).toBeGreaterThanOrEqual(5000);
    expect(set['5m'].length).toBeGreaterThanOrEqual(5000);
    expect(set['15m'].length).toBeGreaterThanOrEqual(5000);
    expect(set['60m'].length).toBeGreaterThanOrEqual(5000);
    for (const [res, bars] of Object.entries(set)) {
      let previous = -Infinity;
      for (const bar of bars) {
        const day = new Date(bar.time * 1000).getUTCDay(), minute = (bar.time % 86400) / 60;
        expect([0, 6]).not.toContain(day);
        expect(minute).toBeGreaterThanOrEqual(res === '60m' ? 14 * 60 : 14.5 * 60);
        expect(minute).toBeLessThan(21 * 60);
        expect(bar.time).toBeGreaterThan(previous); previous = bar.time;
        expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close, bar.low)); expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close)); expect(bar.low).toBeGreaterThan(0);
      }
    }
    expect(makeDemoIntraday('GME')).toBe(set); // cached
  });
  it('coarser series agree with the base series', () => {
    const [m1, m5] = demoIntradayDatasets('SPY');
    const derived = aggregateInterval(m1!, '5m');
    const tail = m5!.bars.slice(-derived.dataset.bars.length);
    expect(derived.dataset.bars).toEqual(tail);
    // the last session ends on the last daily close and begins on its open
    const daily = demoDailyDataset('SPY').bars.at(-1)!, last = m1!.bars.at(-1)!;
    expect(last.close).toBe(daily.close); expect(last.time - daily.time).toBe(21 * 3600 - 60);
  });
  it('the app demo provider serves the deep daily and intraday sources, calendar alignment holds', () => {
    expect(demoDataset('GME').bars.length).toBe(DEMO_DAILY_BARS);
    expect(demoDataset('GME').bars.at(-1)).toEqual(makeFixture('GME').at(-1));
    const state = { symbol: 'GME', imports: [], grid: undefined } as never;
    const sets = workspaceDatasets(state);
    expect(sets.filter(row => row.instrument.symbol === 'GME').map(row => row.resolution)).toEqual(['1D']); // intraday sets join only as interval siblings
    const sibs = withDemoSiblings(sets, demoDataset('GME'));
    expect(sibs.filter(row => row.instrument.symbol === 'GME').map(row => row.resolution).sort()).toEqual(['15m', '1D', '1m', '5m', '60m']);
    expect(sets.filter(row => row.resolution === '1D').length).toBe(DEMO_SYMBOLS.length);
    for (const row of sibs.filter(r => r.instrument.symbol === 'GME')) { expect(isDemoSourceShape(row)).toBe(true); expect(suppliedSourceId({ imports: [] }, row)).toBeNull(); }
  });
});

import { resolveIntervalSwitch } from '../../src/domain/interval-switch';
import { withDemoSiblings } from '../../src/ui/workspace-grid';
describe('DEMO-DATA-1028 interval switching', () => {
  it('a demo daily chart reaches every intraday interval through its siblings, and the universe stays one row per symbol', () => {
    const daily = demoDataset('GME'), universe = workspaceDatasets({ symbol: 'GME', imports: [], grid: undefined } as never);
    expect(universe.filter(row => row.instrument.symbol === 'GME').length).toBe(1);
    const sources = withDemoSiblings(universe, daily);
    for (const [target, min] of [['1m', 5000], ['5m', 5000], ['15m', 5000], ['60m', 5000], ['30m', 1000]] as const) {
      const choice = resolveIntervalSwitch(sources, daily, target);
      expect(choice.ok, target).toBe(true);
      if (choice.ok && choice.kind === 'local') expect(choice.result.dataset.bars.length).toBeGreaterThanOrEqual(min);
    }
    expect(withDemoSiblings(sources, daily).length).toBe(sources.length);
  });
});
