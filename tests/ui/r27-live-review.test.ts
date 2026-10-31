import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { TechnicalAlertObserver } from '../../src/ui/technical-alert-observer';
import { BackgroundAlertWatcher } from '../../src/ui/background-alert-watcher';
import { planBackgroundAlertFeeds } from '../../src/ui/background-alert-plan';
import { processLocalAlertBatch, type LocalAlert } from '../../src/domain/alerts';
import { alertDatasetKey } from '../../src/domain/alert-observation';
import { chartAlertObservationEnabled, freezeLiveDataset, liveReplayPaperRouting } from '../../src/domain/replay-live-snapshot';
import type { Bar, BarDataset } from '../../src/domain/types';
import type { LiveHandle } from '../../src/domain/live-provider';
import { alertOn, liveLike } from '../helpers/background-alert-fixtures';

// Fail-first checks for the review findings on . SYNTHETIC bars and alerts only
// no network, no key, no real account.
const bucket = Math.floor(Date.now() / 300000) * 300;
const bar = (time: number, close: number): Bar => ({ time, open: close, high: close + 0.5, low: close - 0.5, close, volume: 100 });
const now = () => Math.floor(Date.now() / 1000);
const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

/** A live feed the background watcher shares with the chart (one dataset, pushed by the test). */
function sharedFeed(initial: BarDataset) {
  let data = initial; const listeners = new Set<(dataset: BarDataset) => void>();
  const handle: LiveHandle = { datasetId: initial.provenance.datasetId, dataset: () => data, formingTime: () => null, onChange: listener => { listeners.add(listener); return () => listeners.delete(listener); }, close() { /* shared with the chart */ } };
  return { handle, data: () => data, push(close: number) { data = { ...data, bars: [bar(bucket - 300, 9), bar(bucket, close)] }; for (const listener of [...listeners]) listener(data); } };
}
function watcherOver(feed: ReturnType<typeof sharedFeed>, read: () => LocalAlert[], write: (next: LocalAlert[]) => void) {
  const watcher = new BackgroundAlertWatcher({ open: () => feed.handle, alerts: read, publish: (next, expected) => { if (expected !== read()) return false; write(next); return true; }, now, identity: () => crypto.randomUUID(), openAlpacaSymbols: () => new Set(['GME']) });
  disposers.push(() => watcher.dispose());
  return watcher;
}

it('F1 premise: a frozen live copy keeps the live alert basis, so its revision does not keep the chart observer off it', () => {
  const live: BarDataset = { ...liveLike('GME'), bars: [bar(bucket - 300, 9), bar(bucket, 9.1)] };
  const frozen = freezeLiveDataset(live)!;
  expect(frozen.provenance.revision).not.toBe(live.provenance.revision);
  expect(alertDatasetKey(frozen, 2)).toBe(alertDatasetKey(live, 2));
});

it('F1: choosing a start bar on a live chart and closing keeps the charted alert firing exactly once (no stale chart sequence)', async () => {
  const base = liveLike('GME');
  let alerts: LocalAlert[] = [alertOn(base, 'a')];
  const chart = new TechnicalAlertObserver(() => crypto.randomUUID(), () => Promise.resolve());
  disposers.push(() => chart.dispose());
  // The WorkspaceAlerts tick: observation is off (observer reset) when App passes enabled=false.
  const tick = async (dataset: BarDataset, replaying: boolean, held: boolean) => {
    if (!chartAlertObservationEnabled(replaying, held)) { chart.reset(); chart.dispose(); return null; }
    const publication = await chart.observeForPublication({ dataset, bars: dataset.bars, chartId: 'chart', replay: null, assumeReplayCompletion: false, selectedSource: null, alerts, adopt: true }, now());
    const out = processLocalAlertBatch(alerts, [...(publication.view.closedEvents ?? []), ...publication.view.events], now());
    alerts = out.alerts; publication.commit(); return publication.view;
  };
  const feed = sharedFeed({ ...base, bars: [bar(bucket - 300, 9), bar(bucket, 9.1)] });
  await tick(feed.data(), false, false); feed.push(9.2); await tick(feed.data(), false, false);
  // Replay opens on the live chart: a frozen copy is held and the start bar is being chosen (no active replay yet).
  const frozen = freezeLiveDataset(feed.data())!;
  const onFrozen = await tick(frozen, false, true);
  expect(onFrozen?.contexts.length ?? 0).toBe(0); // the chart does not also own the ordinary alert
  // The background watcher owns the charted symbol (activeInstrumentId '') and advances the saved sequence.
  const watcher = watcherOver(feed, () => alerts, next => { alerts = next; });
  watcher.sync(''); await watcher.settled();
  for (const close of [9.3, 9.4, 9.5, 9.6, 9.7]) { feed.push(close); await watcher.settled(); }
  expect(alerts[0].history).toHaveLength(0);
  // Close: the chart owns the symbol again. The first observation is a handover gap; the next crossing fires once.
  watcher.sync('US:GME');
  feed.push(9.8); await tick(feed.data(), false, false);
  feed.push(11); await tick(feed.data(), false, false);
  expect(alerts[0].history).toHaveLength(1);
  feed.push(11.5); await tick(feed.data(), false, false);
  expect(alerts[0].history).toHaveLength(1);
});

it('F1: App passes the gate to the chart alert observer', () => {
  const text = readFileSync('src/ui/App.tsx', 'utf8');
  expect(text).toContain('enabled={loaded&&chartAlertObservationEnabled(!!replay,liveReplayHeld)}');
  expect(chartAlertObservationEnabled(false, false)).toBe(true);
  expect(chartAlertObservationEnabled(true, true)).toBe(true);
  expect(chartAlertObservationEnabled(true, false)).toBe(true);
  expect(chartAlertObservationEnabled(false, true)).toBe(false);
});

it('F2: while a frozen live copy waits for a start bar, ordinary paper follows the background series, never the frozen bars', () => {
  expect(liveReplayPaperRouting(false, false)).toEqual({ chart: 'ordinary', background: 'others' });
  expect(liveReplayPaperRouting(true, false)).toEqual({ chart: 'replay', background: 'none' });
  expect(liveReplayPaperRouting(true, true)).toEqual({ chart: 'replay', background: 'all' });
  expect(liveReplayPaperRouting(false, true)).toEqual({ chart: 'none', background: 'all' });
  const text = readFileSync('src/ui/App.tsx', 'utf8');
  expect(text).toContain("useEffect(()=>{if(paperRouting.chart==='none'||gridGeneration.current!==gridEpoch");
  expect(text).toContain("useEffect(()=>{if(paperRouting.background!=='all'||gridGeneration.current!==gridEpoch");
});

it('F3: a captured VWAP kernel 2 alert no longer silences every other background alert of its feed', async () => {
  const base = liveLike('GME');
  const vwap = alertOn(base, 'v', {}, { kind: 'indicator', instanceId: 'i1', snapshotId: 's1', indicator: 'vwap', plotId: 'vwap', inputs: { kernelVersion: 2, source: 'close', anchor: 'Session', timezone: 'UTC' }, inputBasis: 'standard-ohlc', transformId: 'standard' } as never);
  let alerts: LocalAlert[] = [alertOn(base, 'a'), vwap];
  // The VWAP alert is now watched in the background too, in its own evaluation group, so it still cannot stop
  // the price alert (here the test runtime has no VWAP worker, so the VWAP group fails every time).
  const plan = planBackgroundAlertFeeds({ alerts, activeInstrumentId: '', openAlpacaSymbols: new Set(['GME']) });
  expect(plan.feeds.map(feed => feed.alertIds)).toEqual([['a', 'v']]);
  expect(plan.skipped).toEqual([]);
  const feed = sharedFeed({ ...base, bars: [bar(bucket - 300, 9), bar(bucket, 9.1)] });
  const watcher = watcherOver(feed, () => alerts, next => { alerts = next; });
  watcher.sync(''); await watcher.settled();
  for (const close of [9.2, 9.3, 11]) { feed.push(close); await watcher.settled(); }
  expect(alerts.find(alert => alert.definition.id === 'a')!.history).toHaveLength(1);
});
