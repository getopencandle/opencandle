import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AlertDialog, buildAlertDefinition, rearmAlertForObservation } from '../../src/ui/AlertDialog';
import type { AlertDraft } from '../../src/ui/AlertDialog';
import { createLocalAlert, processAlertEvent } from '../../src/domain/alerts';
import { alertObservationContext, createAlertObservationSession, observeAlertSnapshot } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';

const data = fixtureDataset('GME', 3), now = 1800000000;
const session = createAlertObservationSession(data, { sessionId: 'first', mode: 'ordinary', startedAt: now });
const context = alertObservationContext(session, data);
const draft: AlertDraft = { name: 'Snapshot', message: 'Local observation', kind: 'greater', value: '1', lower: '', upper: '', amount: '1', bars: '1', percent: false, frequency: 'every-time', expirationEnabled: false, expiresAt: '' };
const makeDefinition = () => buildAlertDefinition(draft, { id: 'first-alert', instrumentId: data.instrument.id, now, mode: context.mode, runId: context.runId, sourceId: context.sourceId, observationBinding: context.binding });

describe('snapshot alert form contracts and server markup, not GUI evidence', () => {
  it('copies the full binding and cannot rearm across instruments or changed source units', () => {
    const definition = makeDefinition(), original = createLocalAlert(definition);
    definition.observationBinding!.sessionId = 'tampered'; expect(original.definition.observationBinding!.sessionId).toBe('first');
    const nextContext = alertObservationContext(createAlertObservationSession(data, { sessionId: 'next', mode: 'ordinary', startedAt: now + 1 }), data);
    const rearmed = rearmAlertForObservation(original, nextContext, now + 1, 'new-alert');
    expect(rearmed.definition.runId).toBe('ordinary:snapshot:next'); expect(rearmed.history).toEqual([]); expect(rearmed.definition.condition).toEqual(original.definition.condition);
    expect(original.definition.runId).toBe('ordinary:snapshot:first');
    expect(() => rearmAlertForObservation(original, { ...nextContext, instrumentId: 'OTHER' }, now + 1, 'new')).toThrow('same instrument');
    const highContext = alertObservationContext(createAlertObservationSession(data, { sessionId: 'high', mode: 'ordinary', startedAt: now, source: { kind: 'price', field: 'high' } }), data);
    expect(() => rearmAlertForObservation(original, highContext, now + 1, 'new')).toThrow('settings or units');
  });
  it('retains old true trigger records separately when a new session is explicitly armed', () => {
    const event = observeAlertSnapshot(session, { dataset: data, observedAt: now }).event!;
    const original = processAlertEvent(createLocalAlert(makeDefinition()), event).alert;
    expect(original.history).toHaveLength(1);
    const next = alertObservationContext(createAlertObservationSession(data, { sessionId: 'restarted', mode: 'ordinary', startedAt: now + 10 }), data);
    const rearmed = rearmAlertForObservation(original, next, now + 10, 'rearmed');
    expect(original.history[0].observation?.sourceAvailableAt).toBeNull(); expect(original.history).toHaveLength(1); expect(rearmed.history).toEqual([]);
  });
  it('shows synthetic source, unknown completion and separate session rearming without a live-feed claim', () => {
    const old = createLocalAlert(makeDefinition()), current = alertObservationContext(createAlertObservationSession(data, { sessionId: 'current', mode: 'ordinary', startedAt: now }), data);
    const markup = renderToStaticMarkup(React.createElement(AlertDialog, { open: true, onClose: () => {}, alerts: [old], onAlertsChange: () => {}, instrument: data.instrument, now, context: current, event: null }));
    expect(markup).toContain('Synthetic fixture snapshot'); expect(markup).toContain('Restart'); expect(markup).not.toContain('completed price source');
  });
  it('renders the seven controlled price sources and keeps replay completion conditional and explicit', () => {
    const props = { open: true, onClose: () => {}, alerts: [], onAlertsChange: () => {}, instrument: data.instrument, now, context, priceSource: 'hlc3' as const, onPriceSourceChange: () => {}, onRequestObservation: () => {}, onReplayAssumeCompletionChange: () => {}, diagnostics: ['Invalid supplied row <script> must remain plain text.'] };
    const ordinary = renderToStaticMarkup(React.createElement(AlertDialog, props));
    for (const field of ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4']) expect(ordinary).toContain(`value="${field}"`);
    expect(ordinary).toContain('value="hlc3" selected=""'); expect(ordinary).toContain('Check alerts now');
    expect(ordinary).not.toContain('aria-label="Simulate completed rows in replay"');
    expect(ordinary).toContain('Invalid supplied row &lt;script&gt; must remain plain text.');
    expect(ordinary.indexOf('alert-content')).toBeLessThan(ordinary.indexOf('Invalid supplied row'));
    const replayContext = alertObservationContext(createAlertObservationSession(data, { sessionId: 'replay-form', mode: 'replay', replayRunId: 'replay-run', startedAt: now, assumeReplayCompletion: true }), data);
    const replay = renderToStaticMarkup(React.createElement(AlertDialog, { ...props, context: replayContext, replayAssumeCompletion: true }));
    expect(replay).toContain('aria-label="Simulate completed rows in replay"'); expect(replay).toContain('type="checkbox" checked=""');
    expect(replay).toContain('row completion is simulated');
  });
});
