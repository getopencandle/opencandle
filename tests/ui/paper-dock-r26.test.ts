import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cancelPaperOrder, createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { createBookAccount, type PaperState } from '../../src/domain/paper-book';
import type { Instrument, Quote } from '../../src/domain/types';
import { nextPaperDockSort, paperDockAccountDetails, paperDockCreateInput, paperDockOrderCounts, paperDockOrdersByStatus, PaperTradingDock, PAPER_DOCK_TABS, sortPaperDockRows } from '../../src/ui/PaperTradingDock';

// Synthetic instrument and quotes, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:PANEL', symbol: 'PNL', name: 'Synthetic panel', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const quote = (bid: number, ask: number, sequence: number, at: number): Quote => ({ instrumentId: instrument.id, bid, ask, session: 'regular', fixture: true, eventTime: at, receivedAt: at, availableAt: at, sequence });
function book(): PaperAccount {
  let account = processPaperQuote(createPaperAccount(), quote(50, 50.02, 1, 100), 100).account;
  const submit = (request: Record<string, unknown>) => { const result = submitPaperOrder(account, { instrument, quantity: 1, ...request } as never, 100); expect(result.ok).toBe(true); account = result.account; return result.orderId!; };
  submit({ side: 'buy', type: 'market', quantity: 3 });
  submit({ side: 'buy', type: 'limit', limitPrice: 49 });
  const cancelled = submit({ side: 'sell', type: 'limit', limitPrice: 60 });
  account = cancelPaperOrder(account, cancelled, 100).account;
  submit({ side: 'buy', type: 'limit', limitPrice: 1000, quantity: 1000000 }); // rejected for virtual buying power
  return account;
}

describe('Orders tab status views (PAPER.MANAGER.ORDERS)', () => {
  it('splits working, filled, cancelled and rejected orders with counts', () => {
    const account = book();
    expect(paperDockOrderCounts(account)).toEqual({ working: 1, filled: 1, cancelled: 1, rejected: 1, expired: 0, all: 4 });
    expect(paperDockOrdersByStatus(account, 'filled')).toEqual([expect.objectContaining({ type: 'Market', fillPrice: '50.02', working: false })]);
    expect(paperDockOrdersByStatus(account, 'rejected')[0].reason).toContain('buying power');
    expect(paperDockOrdersByStatus(account, 'working').map(row => row.limit)).toEqual(['49.00']);
    expect(paperDockOrdersByStatus(account, 'all')).toHaveLength(4);
  });
  it('renders the status filter group and a cancel button only on working rows', () => {
    const markup = renderToStaticMarkup(React.createElement(PaperTradingDock, { account: book(), instrument, now: 100, open: true, onToggle: () => {}, onAccountChange: () => true, onOpenTicket: () => {}, initialTab: 'orders' }));
    for (const text of ['aria-label="Order status"', 'Working (1)', 'Filled (1)', 'Cancelled (1)', 'Rejected (1)', 'aria-sort="none"', 'Sort by Symbol']) expect(markup).toContain(text);
    expect(markup.match(/aria-label="Cancel Buy Limit PNL"/g)).toHaveLength(1);
  });
});

describe('column sorting', () => {
  it('sorts numbers numerically, text by locale, blanks last, and cycles asc, desc, off', () => {
    const rows = [{ v: '1,200.00', s: 'b' }, { v: 'n/a', s: 'c' }, { v: '+3.50', s: 'a' }, { v: '-2.00', s: 'd' }];
    expect(sortPaperDockRows(rows, { column: 'v', direction: 'asc' }).map(row => row.v)).toEqual(['-2.00', '+3.50', '1,200.00', 'n/a']);
    expect(sortPaperDockRows(rows, { column: 'v', direction: 'desc' }).map(row => row.v)).toEqual(['1,200.00', '+3.50', '-2.00', 'n/a']);
    expect(sortPaperDockRows(rows, { column: 's', direction: 'asc' }).map(row => row.s)).toEqual(['a', 'b', 'c', 'd']);
    expect(sortPaperDockRows(rows, null)).toEqual(rows);
    expect(nextPaperDockSort(null, 'v')).toEqual({ column: 'v', direction: 'asc' });
    expect(nextPaperDockSort({ column: 'v', direction: 'asc' }, 'v')).toEqual({ column: 'v', direction: 'desc' });
    expect(nextPaperDockSort({ column: 'v', direction: 'desc' }, 'v')).toBeNull();
    expect(nextPaperDockSort({ column: 'v', direction: 'desc' }, 's')).toEqual({ column: 's', direction: 'asc' });
  });
});

describe('Account summary and account management in the panel (PAPER.ACCOUNT.*, PAPER.MANAGER.*)', () => {
  it('shows margin figures from the engine and n/a when a mark is missing', () => {
    const account = book(), details = paperDockAccountDetails(account, 100);
    expect(details).toMatchObject({ accountMargin: '150.00', ordersMargin: '49.00', currency: 'USD', leverage: '1x' });
    expect(details.marginBuffer).toMatch(/%$/);
    expect(paperDockAccountDetails({ ...account, quotes: {} }, 100)).toMatchObject({ accountMargin: 'n/a', marginBuffer: 'n/a' });
  });
  it('checks the create form: blank balance keeps the default, currency is a three-letter code', () => {
    expect(paperDockCreateInput('Swing', '', '')).toEqual({ ok: true, input: { name: 'Swing', currency: 'USD' } });
    expect(paperDockCreateInput('Swing', '25,000', 'eur')).toEqual({ ok: true, input: { name: 'Swing', initialBalance: 25000, currency: 'EUR' } });
    expect(paperDockCreateInput('Swing', '-1', 'USD').ok).toBe(false);
    expect(paperDockCreateInput('Swing', '', 'DOLLARS').ok).toBe(false);
  });
  it('renders the account list, selector and create button with a manager, and a note without one', () => {
    const paper = createPaperAccount();
    const created = createBookAccount({ paper, book: null }, { name: 'Swing', initialBalance: 5000 }, 0, () => 'paper-swing');
    if (!created.ok) throw new Error(created.message);
    const state: PaperState = created.state;
    const base = { account: state.paper, instrument, now: 0, open: true, onToggle: () => {}, onAccountChange: () => true, onOpenTicket: () => {}, initialTab: 'account' as const };
    const markup = renderToStaticMarkup(React.createElement(PaperTradingDock, { ...base, manager: { book: state.book, onStateChange: () => true } }));
    for (const text of ['aria-label="Virtual accounts list"', 'aria-label="Virtual account"', 'aria-label="Select Swing"', 'aria-label="Rename Swing"', 'aria-label="Delete Swing"', 'New account…', 'Paper Trading (active)', 'Account margin', 'Orders margin', 'Buying power', 'Margin buffer']) expect(markup).toContain(text);
    const replay = renderToStaticMarkup(React.createElement(PaperTradingDock, { ...base, replay: true }));
    expect(replay).toContain('Account management returns when replay ends');
    expect(replay).not.toContain('Virtual accounts list');
  });
  it('History has a CSV export and the panel has a DOM tab', () => {
    expect(PAPER_DOCK_TABS.map(row => row.label)).toEqual(['Positions', 'Orders', 'History', 'Journal', 'Account', 'DOM']);
    const base = { account: book(), instrument, now: 100, open: true, onToggle: () => {}, onAccountChange: () => true, onOpenTicket: () => {} };
    expect(renderToStaticMarkup(React.createElement(PaperTradingDock, { ...base, initialTab: 'history' }))).toContain('Export CSV…');
    expect(renderToStaticMarkup(React.createElement(PaperTradingDock, { ...base, initialTab: 'dom' }))).toContain('aria-label="Price ladder"');
  });
});
