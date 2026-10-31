import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { configurePaperDockCommission, paperDockAccountDetails, paperDockHistory, paperDockOrdersByStatus, paperDockPositions, PaperTradingDock, PAPER_DOCK_TABS } from '../../src/ui/PaperTradingDock';

// Synthetic instrument and quotes, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:DOCKJ', symbol: 'DOCKJ', name: 'Synthetic dock journal', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const quote = (bid: number, ask: number, sequence: number, time: number): Quote => ({ instrumentId: instrument.id, bid, ask, session: 'regular', fixture: true, eventTime: time, receivedAt: time, availableAt: time, sequence });
function book(): PaperAccount {
  let account = processPaperQuote(createPaperAccount(), quote(50, 50.02, 1, 100), 100).account;
  account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 3 }, 100).account;
  account = processPaperQuote(account, quote(52, 52.02, 2, 110), 110).account;
  account = submitPaperOrder(account, { instrument, side: 'sell', type: 'market', quantity: 1 }, 110).account;
  account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 40, timeInForce: 'GTD', expiresAt: 100000 }, 120).account;
  return account;
}
const render = (account: PaperAccount, initialTab: (typeof PAPER_DOCK_TABS)[number]['id']) => renderToStaticMarkup(React.createElement(PaperTradingDock, { account, instrument, now: 120, open: true, onToggle: () => {}, onAccountChange: () => true, onOpenTicket: () => {}, initialTab }));

describe('paper dock Journal tab', () => {
  it('sits between History and Account', () => {
    expect(PAPER_DOCK_TABS.map(row => row.label)).toEqual(['Positions', 'Orders', 'History', 'Journal', 'Account', 'DOM']);
  });
  it('renders event filters with counts, a search box, an export button and newest-first rows', () => {
    const markup = render(book(), 'journal');
    for (const text of ['aria-label="Journal events"', 'All (6)', 'Placed (3)', 'Filled (2)', 'Account (1)', 'aria-label="Search the journal"', 'Export CSV', 'aria-label="Account journal"', 'Account opened', 'Starting balance 100000 USD (virtual).']) expect(markup).toContain(text);
    expect(markup.indexOf('Order placed')).toBeLessThan(markup.indexOf('Account opened'));
  });
});

describe('positions, orders and history polish', () => {
  it('positions show trade value, market value and realized P&L', () => {
    const [row] = paperDockPositions(book());
    expect(row).toMatchObject({ quantity: 2, tradeValue: '100.04', marketValue: '104.00', realized: '+1.98', realizedValue: 1.98 });
    for (const text of ['Trade value', 'Market value', 'Realized P&amp;L']) expect(render(book(), 'positions')).toContain(text);
  });
  it('orders and history show the duration, expiry, prices and placing time', () => {
    expect(paperDockOrdersByStatus(book(), 'working')[0]).toMatchObject({ duration: 'Good till date', expires: '1970-01-02 03:46', limit: '40.00' });
    expect(paperDockHistory(book())[0]).toMatchObject({ duration: 'Good till cancelled', placed: '1970-01-01 00:01', limit: '', stop: '' });
    expect(render(book(), 'orders')).toContain('Expires (UTC)');
    expect(render(book(), 'history')).toContain('Placed (UTC)');
  });
});

describe('Account tab commission settings', () => {
  it('shows the commission model and edits it for future fills only', () => {
    expect(paperDockAccountDetails(book(), 120).commission).toBe('None');
    expect(render(book(), 'account')).toContain('Commission…');
    const result = configurePaperDockCommission(book(), 'percent', '0.1', 120);
    if (!result.ok || !('account' in result)) throw new Error('commission refused');
    expect(result.account.settings.commission).toEqual({ kind: 'percent', value: 0.1 });
    expect(result.account.fills.map(fill => fill.commission)).toEqual([0, 0]);
    expect(paperDockAccountDetails(result.account, 120).commission).toBe('0.1% of notional per fill');
    expect(result.account.journal?.[0].type).toBe('settings');
    for (const bad of ['', '-1', 'abc']) expect(configurePaperDockCommission(book(), 'fixed', bad, 120)).toEqual({ ok: false, message: 'Enter a commission of 0 or more.' });
    expect(configurePaperDockCommission(book(), 'percent', '101', 120).ok).toBe(false);
  });
});
