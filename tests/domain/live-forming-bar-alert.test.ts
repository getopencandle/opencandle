import { describe, expect, it } from 'vitest';
import { advanceLocalAlertClock, createLocalAlert, processAlertEvent } from '../../src/domain/alerts';
import type { AlertDefinition, LocalAlert } from '../../src/domain/alerts';
import { fixtureDataset } from '../../src/domain/fixtures';
import { WorkspaceAlertObserver } from '../../src/ui/workspace-alert-observer';
import type { WorkspaceAlertInput, WorkspaceAlertView } from '../../src/ui/workspace-alert-observer';

const T0 = Math.floor(Date.now() / 1000) - 3600, now = T0 + 3600;
type Row = [open: number, high: number, low: number, close: number];
// Mocked live updates: a provider revision changes on every tick, as in the real live registry.
function live(rows: Row[], tick: number): WorkspaceAlertInput {
  const dataset = fixtureDataset('TEST', rows.length);
  dataset.bars = rows.map(([open, high, low, close], i) => ({ time: T0 + i * 60, open, high, low, close, volume: i === rows.length - 1 ? 100 + tick : 100 }));
  dataset.resolution = '1';
  dataset.provenance = { ...dataset.provenance, fixture: false, datasetId: 'live:mock:TEST:1', revision: `live-v1:s:${tick}` };
  return { dataset, priceSource: 'close', replay: null, assumeReplayCompletion: false };
}
function def(view: WorkspaceAlertView): AlertDefinition {
  const c = view.context!;
  return { id: 'a', name: 'A', message: 'Synthetic', instrumentId: c.instrumentId, sourceId: c.sourceId, runId: c.runId, mode: c.mode, observationBinding: c.binding, condition: { kind: 'crossing-up', value: 10 }, frequency: 'once-per-bar', createdAt: view.now, expiresAt: null };
}
const consume = (a: LocalAlert, v: WorkspaceAlertView) => { const t = advanceLocalAlertClock(a, v.now); return v.event ? processAlertEvent(t, v.event).alert : t; };

describe('live forming-bar updates are not corrections', () => {
  it('Once per bar crossing fires once on the forming bar and not again on the same bar', () => {
    const obs = new WorkspaceAlertObserver(() => 's');
    const base: Row[] = [[9, 9.5, 8.5, 9], [9, 9.5, 8.5, 9]];
    const first = obs.observe(live([...base, [9, 9, 9, 9]], 0), now);
    let alert = consume(createLocalAlert(def(first)), first);
    const cross = obs.observe(live([...base, [9, 11, 9, 11]], 1), now + 1);
    expect(cross.event?.observation?.correction).toBe(false);
    alert = consume(alert, cross);
    expect(alert.history).toHaveLength(1);
    alert = consume(alert, obs.observe(live([...base, [9, 12, 9, 8]], 2), now + 2));
    alert = consume(alert, obs.observe(live([...base, [9, 12, 8, 11.5]], 3), now + 3));
    expect(alert.history).toHaveLength(1);
  });
  it('a modified older bar is still a correction', () => {
    const obs = new WorkspaceAlertObserver(() => 's');
    const base: Row[] = [[9, 9.5, 8.5, 9], [9, 9.5, 8.5, 9]];
    obs.observe(live([...base, [9, 9, 9, 9]], 0), now);
    // The just-closed bar (index 1 of 3) may be finalized in place; a bar older than that may not.
    const v = obs.observe(live([[9, 9.7, 8.5, 9.2], [9, 9.5, 8.5, 9], [9, 11, 9, 11]], 1), now + 1);
    expect(v.event?.observation?.correction).toBe(true);
  });
  it('time going backwards on the newest bar is a correction', () => {
    const obs = new WorkspaceAlertObserver(() => 's');
    const base: Row[] = [[9, 9.5, 8.5, 9]];
    obs.observe(live([...base, [9, 9, 9, 9]], 0), now);
    const bad = live([...base, [9, 11, 9, 11]], 1); bad.dataset.bars[1].time -= 30;
    expect(obs.observe(bad, now + 1).event?.observation?.correction).toBe(true);
  });
});
