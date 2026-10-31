import { fixtureDataset } from '../../src/domain/fixtures';
import { alertSourceId, createAlertObservationSession } from '../../src/domain/alert-observation';
import { createLocalAlert, type LocalAlert } from '../../src/domain/alerts';
import type { BarDataset } from '../../src/domain/types';

// SYNTHETIC fixtures for the background alert tests.
export function liveLike(symbol: string, resolution = '5m', providerId = 'alpaca-iex'): BarDataset {
  const base = fixtureDataset('GME', 3);
  return { ...base, resolution, instrument: { ...base.instrument, id: 'US:' + symbol, symbol }, provenance: { ...base.provenance, fixture: false, providerId, datasetId: `live:${providerId}:${symbol}:${resolution}` } };
}
export function alertOn(dataset: BarDataset, id: string, extra: Partial<LocalAlert['definition']> = {}, source: Parameters<typeof createAlertObservationSession>[1]['source'] = { kind: 'price', field: 'close', transformId: 'standard' }): LocalAlert {
  const session = createAlertObservationSession(dataset, { version: 2, chartId: 'chart', sessionId: 'session-' + id, mode: 'ordinary', startedAt: 1, source });
  return createLocalAlert({ id, name: id, message: '', instrumentId: dataset.instrument.id, sourceId: alertSourceId(session.binding.source), mode: 'ordinary', runId: session.runId, observationBinding: session.binding, conditionVersion: 2, condition: { kind: 'crossing-up', value: 10 }, frequency: 'every-time', createdAt: 1, expiresAt: null, ...extra } as LocalAlert['definition']);
}
