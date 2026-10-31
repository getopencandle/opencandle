import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPaperAccount, processPaperQuote } from '../../src/domain/paper';
import { PaperOrderTicket } from '../../src/ui/PaperOrderTicket';
import type { Instrument, Quote } from '../../src/domain/types';

// Synthetic instrument, synthetic quote, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:TICKET2', symbol: 'TICKET2', name: 'Synthetic ticket', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 99.99, ask: 100.01, sequence: 1, eventTime: 1000, receivedAt: 1000, availableAt: 1000, fixture: true, session: 'regular' };
const base = createPaperAccount({ initialBalance: 100000, now: 1000 });
const props = (extra = {}) => ({ account: processPaperQuote(base, quote, 1000, base.runId, instrument).account, instrument, quote, quoteSource: { key: 'synthetic ticket source', state: 'ready' as const }, now: 1000, side: 'buy' as const, onAccountChange: () => true, onDone: () => {}, ...extra });
const html = (extra = {}) => renderToStaticMarkup(React.createElement(PaperOrderTicket, props(extra)));

describe('broker order ticket view', () => {
  it('shows Market, Limit and Stop tabs with Market selected', () => {
    const markup = html();
    for (const name of ['Market', 'Limit', 'Stop']) expect(markup).toContain('>' + name + '</button>');
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Market/);
  });
  it('has a Buy and Sell toggle that follows the opening side and quotes the bid and ask', () => {
    const buy = html(), sell = html({ side: 'sell' });
    expect(buy).toMatch(/aria-pressed="true"[^>]*>Buy 100\.01/);
    expect(sell).toMatch(/aria-pressed="true"[^>]*>Sell 99\.99/);
  });
  it('has quantity, risk sizing, take profit and stop loss fields and a plain review line', () => {
    const markup = html({ quantity: '10' });
    for (const label of ['Order quantity', 'Take profit price', 'Stop loss price', 'Size by money at risk']) expect(markup).toContain(label);
    expect(markup).toContain('value="10"');
    expect(markup).toContain('Estimated cost');
    expect(markup).toContain('1,000.10');
  });
  it('names the action on the submit button and never shows internal ids', () => {
    const markup = html();
    expect(markup).toContain('Buy 1 market');
    expect(markup).not.toContain('SYNTHETIC:TICKET2');
    expect(markup).not.toContain('—');
  });
  it('disables submit and says why when there is no quote', () => {
    const markup = html({ quote: null });
    expect(markup).toContain('No quote is available');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Buy 1 market/);
  });
});
