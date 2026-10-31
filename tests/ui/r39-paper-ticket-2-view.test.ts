import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { PaperOrderTicket, ticketBookText } from '../../src/ui/PaperOrderTicket';
import { paperDockHistory, paperDockOrdersByStatus, paperDockTime, PaperTradingDock, type PaperDockTab } from '../../src/ui/PaperTradingDock';

// (and the dock and ticket times of #1). Synthetic data, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:VIEW39', symbol: 'VIEW', name: 'Synthetic view 39', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const NY = 'America/New_York';
const AT = Date.UTC(2026, 9, 23, 13, 30) / 1000; // 09:30 New York (UTC-4)
const quote = (time: number, sequence = 1): Quote => ({ instrumentId: instrument.id, bid: 99.99, ask: 100.01, sequence, eventTime: time, receivedAt: time, availableAt: time, fixture: true, session: 'regular' });
const funded = (time: number) => { const account = createPaperAccount({ initialBalance: 100000, now: time }); return processPaperQuote(account, quote(time), time, account.runId, instrument).account; };
const ticket = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(PaperOrderTicket, { account: funded(1000), instrument, quote: quote(1000), quoteSource: { key: 'synthetic view source', state: 'ready' as const }, now: 1000, side: 'buy' as const, onAccountChange: () => true, onDone: () => {}, ...extra }));

describe('Buy/Sell ticket view', () => {
  it('has Market, Limit, Stop and Stop limit tabs', () => {
    const markup = ticket();
    for (const name of ['Market', 'Limit', 'Stop', 'Stop limit']) expect(markup).toContain('>' + name + '</button>');
  });
  it('a stop limit ticket shows a stop price and a limit price', () => {
    const markup = ticket({ tab: 'stop-limit' });
    expect(markup).toContain('aria-label="Stop price"');
    expect(markup).toContain('aria-label="Limit price"');
  });
  it('offers Day, GTC, GTD, Week and Month', () => {
    const markup = ticket();
    expect(markup).toMatch(/<option value="day"[^>]*>Day<\/option>/);
    expect(markup).toMatch(/<option value="gtc">Good till cancelled \(GTC\)<\/option>/);
    expect(markup).toMatch(/<option value="gtd">Good till date \(GTD\)<\/option>/);
    expect(markup).toMatch(/<option value="week">Week: until the last session close of the week<\/option>/);
    expect(markup).toMatch(/<option value="month">Month: until the last session close of the month<\/option>/);
  });
  it('take profit and stop loss each choose price, ticks, percent or money', () => {
    const markup = ticket();
    for (const label of ['Take profit as', 'Stop loss as', 'Take profit price', 'Stop loss price']) expect(markup).toContain(`aria-label="${label}"`);
    for (const option of ['>Price</option>', '>Ticks</option>', '>%</option>', '>Money (USD)</option>']) expect(markup).toContain(option);
  });
  it('the live quote time follows the chart timezone and 12-hour choice', () => {
    const now = Date.UTC(2026, 9, 21, 15, 0, 0);
    const book = { instrumentId: 'US:GME', symbol: 'GME', providerId: 'alpaca-stub', feed: 'iex', synthetic: true, bid: 20.01, ask: 20.03, bidSize: 3, askSize: 5, time: now / 1000, receivedAt: now } as never;
    expect(ticketBookText(book, 2, now)!.title).toContain('Quote time 2026-10-21 15:00:00 UTC.');
    expect(ticketBookText(book, 2, now, NY)!.title).toContain('Quote time 2026-10-21 11:00:00 UTC-4.');
    expect(ticketBookText(book, 2, now, NY, '12')!.title).toContain('Quote time 2026-10-21 11:00:00 AM UTC-4.');
    expect(ticketBookText({ ...(book as object), time: Number.NaN } as never, 2, now, NY)!.title).toContain('Quote time unknown.');
  });
  it('no em dash and no internal id', () => {
    const markup = ticket({ tab: 'stop-limit' });
    expect(markup).not.toMatch(/[\u2013\u2014]/);
    expect(markup).not.toContain('SYNTHETIC:VIEW39');
  });
});

function traded(): PaperAccount {
  let account = funded(AT);
  account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 2 }, AT).account;
  account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 90, timeInForce: 'GTD', expiresAt: AT + 7200 }, AT).account;
  account = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 80, timeInForce: 'GTC' }, AT).account;
  return account;
}
const dock = (initialTab: PaperDockTab, extra: Record<string, unknown> = {}) => renderToStaticMarkup(React.createElement(PaperTradingDock, { account: traded(), instrument, now: AT, open: true, onToggle: () => {}, onAccountChange: () => true, onOpenTicket: () => {}, initialTab, ...extra }));

describe('Trading panel times follow the chart timezone', () => {
  it('rows show the chart wall clock (24 or 12 hours) and UTC by default', () => {
    const gtd = (rows: ReturnType<typeof paperDockOrdersByStatus>) => rows.find(row => row.duration === 'Good till date');
    expect(gtd(paperDockOrdersByStatus(traded(), 'working'))).toMatchObject({ placed: '2026-10-23 13:30', expires: '2026-10-23 15:30' });
    expect(gtd(paperDockOrdersByStatus(traded(), 'working', { zone: NY }))).toMatchObject({ placed: '2026-10-23 09:30', expires: '2026-10-23 11:30' });
    expect(paperDockHistory(traded(), { zone: NY, hours: '12' })[0]).toMatchObject({ time: '2026-10-23 9:30 AM', placed: '2026-10-23 9:30 AM' });
  });
  it('column headers name the zone', () => {
    const orders = dock('orders', { timezone: NY }), history = dock('history', { timezone: NY }), journal = dock('journal', { timezone: NY });
    for (const header of ['Expires (New York)', 'Placed (New York)', 'Updated (New York)']) expect(orders).toContain(header);
    expect(history).toContain('Time (New York)');
    expect(journal).toContain('Time (New York)');
    expect(dock('orders')).toContain('Placed (UTC)');
  });
  it('a time that cannot be shown stays blank, not a raw number', () => {
    expect(paperDockTime(Number.NaN, NY)).toBe('');
    expect(paperDockTime(Number.POSITIVE_INFINITY)).toBe('');
    expect(paperDockTime(AT, NY, '24')).toBe('2026-10-23 09:30');
  });
  it('GTC reads Good till cancelled, not legacy', () => {
    const rows = paperDockOrdersByStatus(traded(), 'working');
    expect(rows.map(row => row.duration)).toEqual(['Good till cancelled', 'Good till date']);
    expect(dock('orders')).not.toContain('legacy');
  });
  it('Positions has a Close all positions button and per-row Close', () => {
    const markup = dock('positions');
    expect(markup).toContain('>Close all positions</button>');
    expect(markup).toContain('aria-label="Close VIEW position"');
  });
});
