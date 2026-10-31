import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildPaperRequest, PaperPanel } from '../../src/ui/PaperPanel';
import type { PaperTicketDraft } from '../../src/ui/PaperPanel';
import { AlertDialog, buildAlertDefinition } from '../../src/ui/AlertDialog';
import type { AlertDraft } from '../../src/ui/AlertDialog';
import { createPaperAccount, submitPaperOrder } from '../../src/domain/paper';
import { fixtureInstrument } from '../../src/domain/fixtures';

const instrument = fixtureInstrument('GME');
const ticket: PaperTicketDraft = { side: 'buy', type: 'market', quantity: '10', limitPrice: '', stopPrice: '', timeInForce: 'GTC', expiresAt: '', extendedHours: false };
const alertDraft: AlertDraft = { name: 'Price test', message: '<script>plain text</script>', kind: 'crossing-up', value: '10', lower: '', upper: '', amount: '1', bars: '1', percent: false, frequency: 'only-once', expirationEnabled: false, expiresAt: '' };

describe('paper ticket form translation, not executable interaction evidence', () => {
  it('omits inapplicable prices and translates all four supported order forms', () => {
    const market = buildPaperRequest({ ...ticket, limitPrice: '99', stopPrice: '98' }, instrument);
    expect(market).not.toHaveProperty('limitPrice'); expect(market).not.toHaveProperty('stopPrice'); expect(market.quantity).toBe(10);
    expect(buildPaperRequest({ ...ticket, type: 'limit', limitPrice: '10.01' }, instrument).limitPrice).toBe(10.01);
    expect(buildPaperRequest({ ...ticket, type: 'stop', stopPrice: '10.02' }, instrument).stopPrice).toBe(10.02);
    expect(buildPaperRequest({ ...ticket, type: 'stop-limit', limitPrice: '10.03', stopPrice: '10.02' }, instrument)).toMatchObject({ limitPrice: 10.03, stopPrice: 10.02 });
  });
  it('rejects blank/nonfinite fields and validates domain constraints before placement', () => {
    for (const quantity of ['', ' ', 'NaN', 'Infinity']) expect(() => buildPaperRequest({ ...ticket, quantity }, instrument)).toThrow();
    expect(() => buildPaperRequest({ ...ticket, type: 'limit' }, instrument)).toThrow('Limit');
    expect(() => buildPaperRequest({ ...ticket, timeInForce: 'GTD' }, instrument)).toThrow('expiration');
    const request = buildPaperRequest({ ...ticket, quantity: '-1' }, instrument);
    expect(submitPaperOrder(createPaperAccount(), request, 0).ok).toBe(false);
  });
  it('renders virtual-funds disclosure and accessible form labels in server markup', () => {
    const markup = renderToStaticMarkup(React.createElement(PaperPanel, { account: createPaperAccount(), onAccountChange: () => {}, instrument, quote: null, now: 0 }));
    expect(markup).toContain('VIRTUAL FUNDS'); expect(markup).toContain('No deposit, billing or broker connection'); expect(markup).toContain('aria-label="Order quantity"'); expect(markup).toContain('100,000.00'); expect(markup).not.toContain('type="password"');
  });
});

describe('alert form translation and static rendering only', () => {
  const context = { id: 'one', instrumentId: instrument.id, now: 100, mode: 'ordinary' as const, runId: 'ordinary' };
  it('translates scalar, channel and movement options without losing typed parameters', () => {
    expect(buildAlertDefinition(alertDraft, context)).toMatchObject({ condition: { kind: 'crossing-up', value: 10 }, frequency: 'only-once', expiresAt: null });
    expect(buildAlertDefinition({ ...alertDraft, kind: 'inside', lower: '10', upper: '20' }, context).condition).toEqual({ kind: 'inside', lower: 10, upper: 20 });
    expect(buildAlertDefinition({ ...alertDraft, kind: 'moving-up', amount: '5', bars: '3', percent: true }, context).condition).toEqual({ kind: 'moving-up', amount: 5, bars: 3, percent: true });
    expect(buildAlertDefinition(alertDraft, context).message).toBe('<script>plain text</script>');
  });
  it('rejects invalid ranges, counts, names and expired times before saving', () => {
    for (const draft of [{ ...alertDraft, name: '' }, { ...alertDraft, value: '' }, { ...alertDraft, kind: 'inside' as const, lower: '20', upper: '10' }, { ...alertDraft, kind: 'moving-up' as const, bars: '1.5' }, { ...alertDraft, expirationEnabled: true, expiresAt: '1970-01-01T00:00:00Z' }]) expect(() => buildAlertDefinition(draft, context)).toThrow();
  });
  it('renders a modal manager only when open and explains local delivery', () => {
    const props = { open: true, onClose: () => {}, alerts: [], onAlertsChange: () => {}, instrument, now: 100 };
    const markup = renderToStaticMarkup(React.createElement(AlertDialog, props));
    expect(markup).toContain('role="dialog"'); expect(markup).toContain('<h2 id="local-alert-title">Create alert on '+instrument.symbol+'</h2>');
    expect(renderToStaticMarkup(React.createElement(AlertDialog, { ...props, open: false }))).toBe('');
  });
});
