import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars } from '../../src/domain/paper-bar-feed';
import { paperFeedInput } from '../../src/domain/paper-feed-source';
import { isLastImportedQuote, paperActionQuote } from '../../src/domain/paper-quote';
import type { BarDataset, Instrument, Quote } from '../../src/domain/types';

// Invented prices, virtual money only. An imported, non-fixture
// source supplies the last imported price with its age starting at the user action, and a market order on it must fill.
// Exe paper flow r17: an account whose clock had moved past the imported file's last bar (it traded the fixture first) got
// "Quote is stale" because the quote the ticket used carried the bar time as availableAt.
const instrument: Instrument = { id: 'LOCAL:LVDAILY', symbol: 'LVDAILY', name: 'Invented daily file', exchange: 'USER-SUPPLIED', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const DAY = 86400, FIRST = Date.UTC(2024, 2, 4) / 1000;
const closes = [40.5, 40.9, 40.3, 40.6, 41.15];
const dataset = (fixture = false, datasetId = 'local-import:abc'): BarDataset => ({ instrument, resolution: '1D', bars: closes.map((close, index) => ({ time: FIRST + index * DAY, open: close, high: close + 0.5, low: close - 0.5, close, volume: 1000 })), provenance: { providerId: 'local-import', providerName: 'Local file', datasetId, fixture, coverage: 'five invented bars', asOf: FIRST + 4 * DAY, delaySeconds: null, adjustment: 'unknown', session: 'unknown', timezone: 'UTC', state: 'ready', license: 'test', revision: '1', notes: [] } } as never);
const LATER = Date.UTC(2025, 5, 2) / 1000;   // the account clock after it traded other (later) data
const fed = (data: BarDataset, account: PaperAccount = createPaperAccount({ now: LATER })) => {
  const input = paperFeedInput({ dataset: data, bars: data.bars, replay: false, fine: null, forming: null })!;
  const step = feedPaperBars(account, input); expect(step.ok).toBe(true); return step.account;
};
const marketBuy = (account: PaperAccount, now: number) => submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 1 } as never, now);

describe('imported daily source: the action quote (Q-PX1)', () => {
  it('reproduces the r17 fault: the bar-feed quote alone is stale for an account clock past the last bar', () => {
    const account = fed(dataset()), stored = account.quotes[instrument.id]!;
    expect(stored.availableAt).toBe(FIRST + 4 * DAY);
    const placed = marketBuy(account, Math.max(account.clock, FIRST + 4 * DAY));
    expect(placed.ok && placed.account.orders.find(order => order.id === placed.orderId)?.status === 'filled').toBe(false);
  });
  it('rebuilds the last imported price at the action time, and a market buy fills at the last close', () => {
    const account = fed(dataset()), now = Math.max(account.clock, FIRST + 4 * DAY), stored = account.quotes[instrument.id]!;
    const quote = paperActionQuote(dataset(), stored, now)!;
    expect(isLastImportedQuote(quote)).toBe(true);
    expect(quote).toMatchObject({ bid: 41.15, ask: 41.15, availableAt: now, receivedAt: now, eventTime: FIRST + 4 * DAY, fixture: false });
    expect(quote.sequence).toBeGreaterThan(stored.sequence);
    const seeded = processPaperQuote(account, quote, now); expect(seeded.ok).toBe(true);
    const placed = marketBuy(seeded.account, now); expect(placed.ok).toBe(true);
    const order = placed.account.orders.find(row => row.id === placed.orderId)!;
    expect(order.status).toBe('filled'); expect(order.averageFillPrice).toBe(41.15);
    // Stable once accepted: the same action time returns the accepted quote itself (no re-processing loop).
    expect(paperActionQuote(dataset(), seeded.account.quotes[instrument.id]!, now)).toBe(seeded.account.quotes[instrument.id]);
    // A later action rebuilds again: a copy from an earlier action is never reused.
    expect(paperActionQuote(dataset(), seeded.account.quotes[instrument.id]!, now + 60)!.availableAt).toBe(now + 60);
  });
  it('leaves fixture, replay and non-imported quotes exactly as the feed set them', () => {
    const stored = fed(dataset()).quotes[instrument.id] as Quote;
    expect(paperActionQuote(dataset(true), stored, LATER)).toBe(stored);
    expect(paperActionQuote(dataset(), stored, LATER, { replay: true })).toBe(stored);
    expect(paperActionQuote(dataset(false, 'alpaca-iex:LVDAILY'), stored, LATER)).toBe(stored);
    expect(paperActionQuote(dataset(true), null, LATER)).toBeNull();
  });
  it('App hands the action quote to the ticket, the one-click placement and the chart buttons', () => {
    const app = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('const virtualActionQuote=paperActionQuote(dataset,virtualQuote,Math.max((replay?replayPaper:paper)?.clock??0,virtualNow),{replay:!!replay});');
    expect(app).toContain('quote:virtualActionQuote,');
    expect(app).toContain('quote={virtualActionQuote}');
    expect(app).toContain('quote={virtualActionQuote?{bid:virtualActionQuote.bid');
  });
});
