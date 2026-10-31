import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { cancelPaperDom, flattenPaperDom, paperDomCapability, paperDomCellIntent, paperDomCenter, paperDomContextEntries, paperDomLadder, paperDomMarketIntent, paperDomOrderPrice, paperDomPnl, paperDomQuantity, reversePaperDom, submitPaperDomIntent } from '../../src/domain/paper-dom';
import type { Instrument, Quote } from '../../src/domain/types';
import { PaperDom, paperDomQuote } from '../../src/ui/PaperDom';

// Synthetic instrument and synthetic quotes, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:LADDER', symbol: 'LADR', name: 'Synthetic ladder', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const quote = (bid: number, ask: number, sequence: number, at: number, sizes?: { bidSize?: number; askSize?: number }): Quote => ({ instrumentId: instrument.id, bid, ask, ...sizes, session: 'regular', fixture: true, eventTime: at, receivedAt: at, availableAt: at, sequence });
function quoted(bid = 100, ask = 100.02, sizes?: { bidSize?: number; askSize?: number }): PaperAccount {
  const result = processPaperQuote(createPaperAccount(), quote(bid, ask, 1, 100, sizes), 100);
  expect(result.ok).toBe(true); return result.account;
}
const submit = (account: PaperAccount, request: Record<string, unknown>, now = 100) => { const result = submitPaperOrder(account, { instrument, quantity: 1, ...request } as never, now); expect(result.ok).toBe(true); return result.account; };

describe('DOM capability and static ladder (PAPER.DOM.CAPABILITY, STATIC, RECENTER)', () => {
  it('labels top of book honestly and never invents depth', () => {
    expect(paperDomCapability(null).kind).toBe('no-quote');
    const plain = paperDomCapability(quote(1, 1.01, 1, 1));
    expect(plain).toMatchObject({ kind: 'top-of-book', sizes: false });
    expect(plain.label).toContain('no market depth');
    expect(plain.label).toContain('carries no sizes');
    expect(paperDomCapability(quote(1, 1.01, 1, 1, { bidSize: 300 })).sizes).toBe(true);
  });
  it('centres on the snapped midpoint, falls back to the position or an order, and is null with nothing', () => {
    expect(paperDomCenter(quoted(100, 100.03), instrument, quote(100, 100.03, 1, 100))).toBe(100.02);
    expect(paperDomCenter(createPaperAccount(), instrument, null)).toBeNull();
    const withOrder = submit(createPaperAccount(), { side: 'buy', type: 'limit', limitPrice: 42.5 });
    expect(paperDomCenter(withOrder, instrument, null)).toBe(42.5);
    const long = submit(quoted(), { side: 'buy', type: 'market' });
    expect(paperDomCenter({ ...long, quotes: {} }, instrument, null)).toBe(100.02);
  });
  it('builds a fixed descending ladder with sizes only on the best bid and ask rows', () => {
    const q = quote(100, 100.02, 1, 100, { bidSize: 300, askSize: 200 }), account = quoted(100, 100.02, { bidSize: 300, askSize: 200 });
    const ladder = paperDomLadder(account, instrument, q, 100.01, 5);
    expect(ladder.levels.map(row => row.priceText)).toEqual(['100.03', '100.02', '100.01', '100.00', '99.99']);
    expect(ladder.levels.filter(row => row.bidSize !== null).map(row => [row.priceText, row.bidSize])).toEqual([['100.00', 300]]);
    expect(ladder.levels.filter(row => row.askSize !== null).map(row => [row.priceText, row.askSize])).toEqual([['100.02', 200]]);
    // The quote moving does not move the ladder: same centre, new bid/ask rows.
    const moved = paperDomLadder(account, instrument, quote(99.99, 100.01, 2, 101), 100.01, 5);
    expect(moved.levels.map(row => row.priceText)).toEqual(ladder.levels.map(row => row.priceText));
    expect(moved.levels.find(row => row.bid)!.priceText).toBe('99.99');
  });
  it('places own working orders on their trigger rows and counts the ones off the ladder', () => {
    let account = quoted();
    account = submit(account, { side: 'buy', type: 'limit', limitPrice: 99.99, quantity: 2 });
    account = submit(account, { side: 'buy', type: 'limit', limitPrice: 99.99, quantity: 3 });
    account = submit(account, { side: 'sell', type: 'stop', stopPrice: 99.98 });
    account = submit(account, { side: 'buy', type: 'limit', limitPrice: 90 });
    const ladder = paperDomLadder(account, instrument, account.quotes[instrument.id], 100.01, 7);
    const row = ladder.levels.find(level => level.priceText === '99.99')!;
    expect(row.buyQuantity).toBe(5); expect(row.orders).toHaveLength(2);
    expect(ladder.levels.find(level => level.priceText === '99.98')!.sellQuantity).toBe(1);
    expect([ladder.above, ladder.below]).toEqual([0, 1]);
    expect(paperDomOrderPrice({ type: 'stop-limit', status: 'working', stopPrice: 5, limitPrice: 6 })).toBe(5);
    expect(paperDomOrderPrice({ type: 'stop-limit', status: 'triggered', stopPrice: 5, limitPrice: 6 })).toBe(6);
  });
});

describe('DOM order entry (PAPER.DOM.QTY, BUY, SELL, CELL_LIMIT, CELL_STOP, CONTEXT)', () => {
  it('validates quantity against the lot size and engine bound', () => {
    expect(paperDomQuantity('5', instrument)).toEqual({ ok: true, quantity: 5 });
    expect(paperDomQuantity('0', instrument).ok).toBe(false);
    expect(paperDomQuantity('1.5', instrument)).toEqual({ ok: false, message: 'Quantity must be a multiple of the lot size 1.' });
    expect(paperDomQuantity('2000000000', instrument).ok).toBe(false);
    expect(paperDomQuantity('abc', instrument).ok).toBe(false);
  });
  it('a plain cell click is a limit at that row, Ctrl makes it a stop, with side and level exact', () => {
    const q = quote(100, 100.02, 1, 100);
    const buy = paperDomCellIntent({ instrument, side: 'buy', price: 99.95, quantity: 2, stop: false, quote: q, now: 100 });
    expect(buy.ok && buy.intent.request).toMatchObject({ side: 'buy', type: 'limit', limitPrice: 99.95, quantity: 2, timeInForce: 'DAY' });
    expect(buy.ok && buy.intent.marketable).toBe(false);
    const marketable = paperDomCellIntent({ instrument, side: 'sell', price: 99.9, quantity: 1, stop: false, quote: q, now: 100 });
    expect(marketable.ok && marketable.intent.marketable).toBe(true);
    const stop = paperDomCellIntent({ instrument, side: 'buy', price: 100.1, quantity: 1, stop: true, quote: q, now: 100 });
    expect(stop.ok && stop.intent.request).toMatchObject({ side: 'buy', type: 'stop', stopPrice: 100.1 });
    expect(paperDomCellIntent({ instrument, side: 'buy', price: 100.01, quantity: 1, stop: true, quote: q, now: 100 }).ok).toBe(false);
    expect(paperDomCellIntent({ instrument, side: 'sell', price: 100, quantity: 1, stop: true, quote: q, now: 100 }).ok).toBe(false);
    expect(paperDomCellIntent({ instrument, side: 'buy', price: 99.955, quantity: 1, stop: false, quote: q, now: 100 }).ok).toBe(false);
  });
  it('cell orders submit through the engine, and market orders fill at once or change nothing', () => {
    const account = quoted();
    const cell = paperDomCellIntent({ instrument, side: 'buy', price: 99.9, quantity: 3, stop: false, quote: account.quotes[instrument.id], now: 100 });
    if (!cell.ok) throw new Error(cell.message);
    const placed = submitPaperDomIntent(account, cell.intent, 100);
    expect(placed.ok).toBe(true);
    expect(placed.account.orders.at(-1)).toMatchObject({ status: 'working', limitPrice: 99.9, quantity: 3 });
    const bought = submitPaperDomIntent(account, paperDomMarketIntent(instrument, 'buy', 2, 100), 100);
    expect(bought.ok).toBe(true);
    expect(bought.account.positions[instrument.id]).toMatchObject({ quantity: 2, averagePrice: 100.02 });
    const noQuote = createPaperAccount();
    const refused = submitPaperDomIntent(noQuote, paperDomMarketIntent(instrument, 'sell', 1, 100), 100);
    expect(refused.ok).toBe(false); expect(refused.account).toBe(noQuote);
    expect(refused.diagnostics[0].message).toContain('No virtual order was created');
  });
  it('the cell menu offers limit, stop and market entries and explains disabled ones', () => {
    const entries = paperDomContextEntries(instrument, 100.01, quote(100, 100.02, 1, 100), 1, 100);
    expect(entries.map(row => row.label)).toEqual(['Buy limit at 100.01', 'Buy stop at 100.01', 'Sell limit at 100.01', 'Sell stop at 100.01', 'Buy market', 'Sell market']);
    expect(entries.find(row => row.id === 'buy-stop')!.disabled).toContain('at or below the ask');
    expect(entries.find(row => row.id === 'sell-stop')!.disabled).toContain('at or above the bid');
    expect(paperDomContextEntries(instrument, 100, null, 1, 100).find(row => row.kind === 'market')!.disabled).toBe('A market order needs a quote.');
  });
});

describe('DOM position tools (PAPER.DOM.PNL_*, FLATTEN, REVERSE) and scoped cancels', () => {
  it('reports money, tick and percent P&L at the long bid mark', () => {
    let account = submit(quoted(100, 100.02), { side: 'buy', type: 'market', quantity: 10 });
    account = processPaperQuote(account, quote(100.5, 100.52, 2, 101), 101).account;
    expect(paperDomPnl(account, instrument, 'money')).toMatchObject({ value: 4.8, text: '+4.80 USD' });
    expect(paperDomPnl(account, instrument, 'ticks')).toMatchObject({ value: 48, text: '+48 ticks' });
    expect(paperDomPnl(account, instrument, 'percent').text).toBe('+0.48%');
    expect(paperDomPnl(quoted(), instrument, 'money').text).toBe('Flat');
  });
  it('flatten closes the position and reverse flips it; cancels honour the side scope', () => {
    let account = submit(quoted(), { side: 'buy', type: 'market', quantity: 4 });
    account = submit(account, { side: 'buy', type: 'limit', limitPrice: 99 });
    account = submit(account, { side: 'sell', type: 'limit', limitPrice: 101 });
    const flat = flattenPaperDom(account, instrument, 100);
    expect(flat.ok).toBe(true); expect(flat.account.positions[instrument.id]).toBeUndefined();
    const reversed = reversePaperDom(account, instrument, 100);
    expect(reversed.account.positions[instrument.id].quantity).toBe(-4);
    const buys = cancelPaperDom(account, instrument, 'buy', 100);
    expect(buys.account.orders.filter(order => order.status === 'working').map(order => order.side)).toEqual(['sell']);
    expect(cancelPaperDom(account, instrument, undefined, 100).account.orders.filter(order => order.status === 'working')).toHaveLength(0);
  });
});

describe('DOM panel markup', () => {
  it('renders the ladder, controls and the honest depth note; empty state without any price', () => {
    const account = submit(quoted(100, 100.02, { bidSize: 300 }), { side: 'buy', type: 'limit', limitPrice: 99.99, quantity: 7 });
    const markup = renderToStaticMarkup(React.createElement(PaperDom, { account, instrument, now: 100, onAccountChange: () => true, rows: 5 }));
    for (const text of ['aria-label="Price ladder"', 'Buy Mkt', 'Sell Mkt', 'Recenter', 'Flatten', 'Reverse', 'Cancel buys', 'Cancel sells', 'aria-label="Buy at 100.01"', 'aria-label="Sell at 100.01"', 'aria-label="Cancel buy orders at 99.99"', '>7<', '>300<', 'no market depth']) expect(markup).toContain(text);
    const empty = renderToStaticMarkup(React.createElement(PaperDom, { account: createPaperAccount(), instrument, now: 0, onAccountChange: () => true }));
    expect(empty).toContain('No quote for this symbol yet');
    expect(empty).not.toContain('Price ladder');
  });
  it('uses the newer of the host quote and the retained quote', () => {
    const account = quoted();
    expect(paperDomQuote(account, instrument, quote(1, 2, 5, 200))!.sequence).toBe(5);
    expect(paperDomQuote(account, instrument, quote(1, 2, 0, 50))!.sequence).toBe(1);
    expect(paperDomQuote(account, instrument, null)!.sequence).toBe(1);
  });
  it.each(['src/ui/PaperDom.tsx', 'src/domain/paper-dom.ts'])('%s has no em dash, en dash or network channel', async file => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/[–—]/);
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|ipcRenderer|child_process/);
  });
});
