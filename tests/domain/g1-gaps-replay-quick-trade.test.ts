// Bar Replay quick trading (Buy, Sell, Flatten, open position and P&L on the replay bar). SYNTHETIC rows only.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createPaperAccount } from '../../src/domain/paper';
import { fixtureDataset, fixtureQuote } from '../../src/domain/fixtures';
import { parseReplayQuickQuantity, replayQuickFlatten, replayQuickOrder, replayQuickPosition, replayQuickPrice } from '../../src/domain/replay-quick-trade';
import { ReplayQuickTrade } from '../../src/ui/ReplayPanel';

const data = fixtureDataset('RQT', 20), instrument = data.instrument;
const bar = data.bars[10], now = bar.time;
const quote = fixtureQuote(instrument.id, bar, 1);
const replayAccount = () => createPaperAccount({ id: 'replay-paper', mode: 'replay-paper', runId: 'replay-session:rqt:1', name: 'Replay virtual account', now: 0 });

describe('G1-GAPS replay quick trading', () => {
  it('Buy fills a market order at the replay ask and shows the long position with its P&L', () => {
    const result = replayQuickOrder(replayAccount(), instrument, 'buy', 10, quote, now);
    expect(result.ok).toBe(true);
    const position = replayQuickPosition(result.account, instrument)!;
    expect(position).toMatchObject({ side: 'long', quantity: 10, averagePrice: quote.ask });
    expect(position.label).toBe(`Long 10 @ ${quote.ask.toFixed(2)}`);
    // Marked at bid: the spread is the open loss.
    expect(position.unrealized).toBeCloseTo((quote.bid - quote.ask) * 10, 8);
    expect(position.tone).toBe('down');
    expect(position.pnl).toBe('-' + Math.abs((quote.bid - quote.ask) * 10).toFixed(2));
  });
  it('Sell opens a short; Flatten closes it with a reduce-only order', () => {
    const short = replayQuickOrder(replayAccount(), instrument, 'sell', 5, quote, now);
    expect(replayQuickPosition(short.account, instrument)?.side).toBe('short');
    const flat = replayQuickFlatten(short.account, instrument, quote, now);
    expect(flat.ok).toBe(true);
    expect(replayQuickPosition(flat.account, instrument)).toBeNull();
    expect(flat.account.orders.at(-1)).toMatchObject({ reduceOnly: true, status: 'filled', side: 'buy', quantity: 5 });
  });
  it('refuses the ordinary paper account and a flat Flatten', () => {
    const ordinary = createPaperAccount({ now: 0 });
    expect(replayQuickOrder(ordinary, instrument, 'buy', 1, quote, now).ok).toBe(false);
    expect(replayQuickFlatten(replayAccount(), instrument, quote, now).ok).toBe(false);
  });
  it('quantity must be a positive whole number of lots', () => {
    expect(parseReplayQuickQuantity('3', 1)).toBe(3);
    expect(() => parseReplayQuickQuantity('0', 1)).toThrow('above zero');
    expect(() => parseReplayQuickQuantity('1.5', 1)).toThrow('whole number of lots');
    expect(() => parseReplayQuickQuantity('', 1)).toThrow();
    expect(replayQuickPrice(23.4, 0.01)).toBe('23.40');
    expect(replayQuickPrice(0.12345, 0.0001)).toBe('0.1235');
  });
  it('the bar group renders Sell, quantity, Buy, the position and Flatten', () => {
    const position = replayQuickPosition(replayQuickOrder(replayAccount(), instrument, 'buy', 2, quote, now).account, instrument);
    const html = renderToStaticMarkup(React.createElement(ReplayQuickTrade, { lotSize: 1, bid: '9.99', ask: '10.01', position, onOrder: vi.fn(), onFlatten: vi.fn(), disabled: false }));
    expect(html).toContain('aria-label="Replay trading"');
    expect(html.indexOf('aria-label="Sell"')).toBeLessThan(html.indexOf('aria-label="Buy"'));
    expect(html).toContain('10.01'); expect(html).toContain('9.99');
    expect(html).toContain('Long 2 @');
    expect(html).toMatch(/<button[^>]*aria-label="Flatten"(?![^>]*disabled)/);
    const flat = renderToStaticMarkup(React.createElement(ReplayQuickTrade, { lotSize: 1, bid: null, ask: null, position: null, onOrder: vi.fn(), onFlatten: vi.fn(), disabled: false }));
    expect(flat).toMatch(/<button[^>]*aria-label="Flatten"[^>]*disabled/);
  });
});
