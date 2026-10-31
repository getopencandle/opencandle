import { expect, it } from 'vitest';
import { alertSourceId, createAlertObservationSession, observeAlertSnapshot, validateAlertSource, type AlertSourceSnapshot } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { BarDataset } from '../../src/domain/types';

// The session/observation boundary for a
// drawing contract. SYNTHETIC rows; literal oracles; model checks only.
const day = Date.UTC(2024, 0, 2) / 1000, now = Date.UTC(2026, 9, 14, 10) / 1000;
function dataset(closes = [9, 11, 12]): BarDataset {
  const data = fixtureDataset('GME', closes.length);
  data.bars = closes.map((close, i) => ({ time: day + i * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 + i }));
  data.provenance.fixture = false; data.provenance.providerId = 'user-import'; data.provenance.datasetId = 'original-file'; data.provenance.revision = 'r1';
  return data;
}
const contract = (): Extract<AlertSourceSnapshot, { kind: 'drawing' }> => ({ kind: 'drawing', instanceId: 'line-1', snapshotId: 'geometry-1', tool: 'trendline', anchors: [{ time: day, price: 10 }, { time: day + 86400, price: 10.5 }], settings: { extendRight: true }, evaluation: 'signed-price-distance', coordinateModel: 'linear-time-price' });

it('requires bounded anchors, explicit coordinate model and signed-price-distance units', () => {
  expect(() => validateAlertSource(contract())).not.toThrow();
  expect(alertSourceId(contract())).toBe('["drawing","line-1","geometry-1","trendline"]');
  const bad: Array<[string, (value: ReturnType<typeof contract>) => unknown]> = [
    ['no anchors', value => ({ ...value, anchors: [] })],
    ['33 anchors', value => ({ ...value, anchors: Array.from({ length: 33 }, (_, i) => ({ time: day + i, price: 10 })) })],
    ['implicit units', value => ({ ...value, evaluation: 'percent-distance' })],
    ['implicit coordinates', value => ({ ...value, coordinateModel: 'pixels' })],
    ['missing coordinate model', value => { const { coordinateModel: _omit, ...rest } = value; return rest; }],
    ['nonpositive anchor price', value => ({ ...value, anchors: [{ time: day, price: 0 }] })],
    ['extra anchor field', value => ({ ...value, anchors: [{ time: day, price: 10, logical: 3 }] })],
    ['extra contract field', value => ({ ...value, inferredSlope: 0.5 })],
    ['unbounded tool', value => ({ ...value, tool: 'x'.repeat(101) })],
  ];
  for (const [label, mutate] of bad) expect(() => validateAlertSource(mutate(contract())), label).toThrow();
  expect(validateAlertSource({ ...contract(), anchors: Array.from({ length: 32 }, (_, i) => ({ time: day + i, price: 10 })) })).toBeUndefined();
});

it('copies the contract, never infers geometry, and rejects a changed contract or a different information prefix', () => {
  const data = dataset(), source = contract();
  const state = createAlertObservationSession(data, { sessionId: 'SYNTHETIC drawing', mode: 'replay', replayRunId: 'SYNTHETIC run', startedAt: now, source });
  source.anchors[1].price = 99; (source.settings as Record<string, unknown>).extendRight = false;
  expect((state.binding.source as ReturnType<typeof contract>).anchors[1].price).toBe(10.5);
  expect((state.binding.source as ReturnType<typeof contract>).settings).toEqual({ extendRight: true });
  // Without a supplied, prefix-bounded value the adapter refuses instead of computing a line.
  const missing = observeAlertSnapshot(state, { dataset: data, observedAt: now, barIndex: 1, replayRunId: 'SYNTHETIC run' });
  expect(missing.event).toBeNull(); expect(missing.diagnostics[0]).toContain('No approximate source was substituted.');
  // A supplied signed price distance for the exact contract and prefix is used verbatim: close 11 minus line 10.5.
  const sample = { source: state.binding.source, value: 0.5, informationBars: 2, informationEndIndex: 1, informationEndTime: data.bars[1].time };
  const valid = observeAlertSnapshot(state, { dataset: data, observedAt: now, barIndex: 1, replayRunId: 'SYNTHETIC run', sample });
  expect(valid.event?.value).toBe(0.5); expect(valid.event?.observation?.informationEndIndex).toBe(1);
  for (const changed of [{ ...sample, source }, { ...sample, informationBars: 3 }, { ...sample, informationEndIndex: 2 }, { ...sample, informationEndTime: data.bars[2].time }, { ...sample, value: Number.POSITIVE_INFINITY }])
    expect(observeAlertSnapshot(state, { dataset: data, observedAt: now, barIndex: 1, replayRunId: 'SYNTHETIC run', sample: changed }).event).toBeNull();
});
