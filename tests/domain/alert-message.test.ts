import { expect, it } from 'vitest';
import { ALERT_MESSAGE_LIMIT, alertTriggerRow, renderAlertMessage, renderNewAlertMessages } from '../../src/domain/alert-message';
import { createLocalAlert, processAlertEvent, validateLocalAlerts, type AlertDefinition, type AlertEvent, type LocalAlert } from '../../src/domain/alerts';
import { alertObservationContext, createAlertObservationSession, observeAlertSnapshot, type AlertObservationSession } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { BarDataset } from '../../src/domain/types';

// SYNTHETIC fixtures with literal expected strings. Model checks only; no GUI.
const day = Date.UTC(2024, 0, 2) / 1000, now = Date.UTC(2026, 9, 14, 10) / 1000;
function dataset(closes: number[]): BarDataset {
  const data = fixtureDataset('GME', closes.length);
  data.bars = closes.map((close, i) => ({ time: day + i * 86400, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 100 + i }));
  data.provenance.fixture = false; data.provenance.providerId = 'user-import'; data.provenance.datasetId = 'original-file'; data.provenance.revision = 'r1';
  return data;
}
const values = { ticker: 'GME', exchange: 'SYNTHETIC', interval: '1D', bar: { time: 1_700_000_000, open: 10, high: 12.25, low: 9, close: 11.5, volume: 1000 }, triggeredAt: 1_700_000_065 };

it('substitutes the supported placeholders once, keeps unknown or unavailable ones verbatim and bounds the result', () => {
  expect(renderAlertMessage('{{ticker}} on {{exchange}} {{interval}} O={{open}} H={{high}} L={{low}} C={{close}} V={{volume}} at {{time}} fired {{timenow}} {{plot_0}} {{unknown}} {{ close }} {{Close}}', values))
    .toBe('GME on SYNTHETIC 1D O=10 H=12.25 L=9 C=11.5 V=1000 at 2023-11-14T22:13:20Z fired 2023-11-14T22:14:25Z {{plot_0}} {{unknown}} {{ close }} {{Close}}');
  expect(renderAlertMessage('{{ticker}}{{close}}', { ...values, ticker: '{{close}}' })).toBe('{{close}}11.5');
  expect(renderAlertMessage('C={{close}} V={{volume}} T={{time}} now={{timenow}}', { ...values, bar: null })).toBe('C={{close}} V={{volume}} T={{time}} now=2023-11-14T22:14:25Z');
  const { volume: _omitted, ...noVolume } = values.bar;
  expect(renderAlertMessage('V={{volume}} C={{close}}', { ...values, bar: noVolume })).toBe('V={{volume}} C=11.5');
  expect(renderAlertMessage('plain text', values)).toBe('plain text');
  const long = renderAlertMessage('{{exchange}}'.repeat(400), { ...values, exchange: 'X'.repeat(20) });
  expect(long).toHaveLength(ALERT_MESSAGE_LIMIT); expect(long.endsWith('X…')).toBe(true);
});

function bound(data: BarDataset, state: AlertObservationSession, message: string, id = 'alert-1'): LocalAlert {
  const context = alertObservationContext(state, data);
  const definition: AlertDefinition = { id, name: 'SYNTHETIC template', message, instrumentId: context.instrumentId, sourceId: context.sourceId, mode: context.mode, runId: context.runId, observationBinding: context.binding, frequency: 'every-time', condition: { kind: 'greater', value: 10 }, createdAt: now, expiresAt: null };
  return createLocalAlert(definition);
}

it('renders only newly recorded triggers from the exact supplied row and leaves saved templates and prior history unchanged', () => {
  const data = dataset([9, 11, 12.5]);
  let state = createAlertObservationSession(data, { sessionId: 'SYNTHETIC session', mode: 'ordinary', startedAt: now });
  const template = '{{ticker}} {{interval}} close {{close}} high {{high}} vol {{volume}} row {{time}} at {{timenow}}';
  const before = [bound(data, state, template), bound(data, state, 'no placeholders here', 'alert-2')];
  const observed = observeAlertSnapshot(state, { dataset: data, observedAt: now + 5 }); state = observed.session;
  const event = observed.event as AlertEvent; expect(event.value).toBe(12.5);
  const processed = before.map(alert => processAlertEvent(alert, event).alert);
  expect(processed[0].history[0].message).toBe(template);
  const rendered = renderNewAlertMessages(before, processed, { dataset: data });
  expect(rendered[0].history[0].message).toBe(`GME ${data.resolution} close 12.5 high 13.5 vol 102 row 2024-01-04T00:00:00Z at 2026-10-14T10:00:05Z`);
  expect(rendered[0].definition.message).toBe(template);
  expect(rendered[1]).toBe(processed[1]);
  expect(validateLocalAlerts(rendered).ok).toBe(true);
  // A second pass treats the recorded message as history, never re-rendering it.
  expect(renderNewAlertMessages(rendered, rendered, { dataset: data })).toBe(rendered);
  // No new notifications: the exact same array is returned for exact-base publication.
  expect(renderNewAlertMessages(before, before, { dataset: data })).toBe(before);
  // Another instrument's dataset never supplies values.
  const other = fixtureDataset('AMC', 3);
  expect(renderNewAlertMessages(before, processed, { dataset: other })).toBe(processed);
});

it('does not borrow a different row when the recorded source time does not match the supplied rows', () => {
  const data = dataset([9, 11]);
  const state = createAlertObservationSession(data, { sessionId: 'SYNTHETIC session', mode: 'ordinary', startedAt: now });
  const alert = bound(data, state, 'C={{close}} T={{time}}');
  const event = observeAlertSnapshot(state, { dataset: data, observedAt: now + 1 }).event as AlertEvent;
  const processed = [processAlertEvent(alert, event).alert];
  expect(alertTriggerRow(processed[0].history[0], [data.bars])).toEqual(data.bars[1]);
  const shifted = dataset([9, 11]); shifted.bars = shifted.bars.map(bar => ({ ...bar, time: bar.time + 60 }));
  expect(alertTriggerRow(processed[0].history[0], [shifted.bars, []])).toBeNull();
  expect(renderNewAlertMessages([alert], processed, { dataset: shifted })).toBe(processed);
  const legacy = { ...processed[0].history[0] }; delete legacy.observation;
  expect(alertTriggerRow(legacy, [data.bars])).toBeNull();
});
