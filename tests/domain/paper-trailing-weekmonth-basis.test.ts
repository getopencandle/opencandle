import { describe, expect, it } from 'vitest';
import { cancelPaperOrder, createPaperAccount, modifyPaperOrder, paperFillBasisLabel, processPaperBar, processPaperQuote, submitPaperOrder, type PaperAccount, type PaperOrderRequest, type PaperResult } from '../../src/domain/paper';
import { paperPeriodExpiry } from '../../src/domain/paper-expiry';
import { PAPER_EARLY_CLOSE } from '../../src/domain/paper-ticket';
import { blankBrokerDraft, placeBrokerTicket } from '../../src/domain/paper-broker-ticket';
import { lastImportedQuote } from '../../src/domain/paper-quote';
import { paperChartLines } from '../../src/ui/PaperChartLines';
import { paperDockHistory } from '../../src/ui/PaperTradingDock';
import type { Instrument, Quote } from '../../src/domain/types';

// Synthetic instrument and quotes, virtual money only. Expected values are derived by hand in the comments.
const instrument: Instrument = { id: 'SYN:TRAIL', symbol: 'TRL', name: 'Synthetic trailing', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const q = (bid: number, ask: number, t: number): Quote => ({ instrumentId: instrument.id, bid, ask, sequence: t, eventTime: t, receivedAt: t, availableAt: t, fixture: true, session: 'regular' });
const ok = (r: PaperResult): PaperAccount => { expect(r.ok, r.diagnostics.map(d => d.message).join(';')).toBe(true); return r.account; };
const feed = (a: PaperAccount, quote: Quote) => ok(processPaperQuote(a, quote, quote.availableAt, a.runId, instrument));
const send = (a: PaperAccount, request: Partial<PaperOrderRequest>, now = a.clock) => submitPaperOrder(a, { instrument, side: 'sell', type: 'trailing-stop', quantity: 10, ...request }, now);
const long = () => { let a = feed(createPaperAccount({ initialBalance: 100000, now: 0 }), q(99.99, 100.01, 1)); a = ok(submitPaperOrder(a, { instrument, side: 'buy', type: 'market', quantity: 10 }, 1)); return a; };

describe('trailing stop', () => {
  it('a sell trails a price distance behind the highest bid, never moves back, and fills at the bid when reached', () => {
    let a = long();
    a = ok(send(a, { trailDistance: 1 }, 1));
    const id = a.orders.at(-1)!.id;
    // The first usable quote after submission sets the best bid 100 and the stop 100 - 1 = 99.
    a = feed(a, q(100, 100.02, 2));
    expect(a.orders.find(o => o.id === id)).toMatchObject({ trailBest: 100, stopPrice: 99, status: 'working' });
    a = feed(a, q(103, 103.02, 3));
    expect(a.orders.find(o => o.id === id)).toMatchObject({ trailBest: 103, stopPrice: 102 });
    a = feed(a, q(102.5, 102.52, 4));
    expect(a.orders.find(o => o.id === id)).toMatchObject({ trailBest: 103, stopPrice: 102, status: 'working' });
    // Bid 101.98 is at or below the stop 102: a market sell fills at the bid, labelled Bid.
    a = feed(a, q(101.98, 102, 5));
    expect(a.orders.find(o => o.id === id)).toMatchObject({ status: 'filled', averageFillPrice: 101.98 });
    expect(a.fills.at(-1)).toMatchObject({ price: 101.98, basis: 'bid' });
    expect(a.positions[instrument.id]).toBeUndefined();
  });
  it('a buy trails a percent above the lowest ask and triggers when the ask rises to it', () => {
    let a = feed(createPaperAccount({ initialBalance: 100000, now: 0 }), q(99.99, 100, 1));
    a = ok(send(a, { side: 'buy', trailPercent: 2 }, 1));
    const id = a.orders.at(-1)!.id;
    a = feed(a, q(99.99, 100, 2));
    expect(a.orders.find(o => o.id === id)!.stopPrice).toBe(102); // 100 + 2 percent
    a = feed(a, q(94.99, 95, 3));
    expect(a.orders.find(o => o.id === id)).toMatchObject({ trailBest: 95, stopPrice: 96.9 }); // 95 + 1.9
    a = feed(a, q(96.9, 96.95, 4));
    expect(a.orders.find(o => o.id === id)).toMatchObject({ status: 'filled', averageFillPrice: 96.95 });
    expect(a.fills.at(-1)!.basis).toBe('ask');
  });
  it('a gap through the stop fills at the quote side, worse than the stop', () => {
    let a = long();
    a = ok(send(a, { trailDistance: 1 }, 1)); a = feed(a, q(100, 100.02, 2));
    a = feed(a, q(97, 97.02, 3));
    expect(a.fills.at(-1)!.price).toBe(97);
  });
  it('is editable and cancellable, and its stop price cannot be set directly', () => {
    let a = long();
    a = ok(send(a, { trailDistance: 1 }, 1)); a = feed(a, q(100, 100.02, 2));
    const id = a.orders.at(-1)!.id;
    expect(modifyPaperOrder(a, id, { stopPrice: 90 }, 2).ok).toBe(false);
    a = ok(modifyPaperOrder(a, id, { trailPercent: 5 }, 2));
    expect(a.orders.find(o => o.id === id)).toMatchObject({ trailPercent: 5, stopPrice: 95 });
    expect(a.orders.find(o => o.id === id)!.trailDistance).toBeUndefined();
    a = ok(cancelPaperOrder(a, id, 3));
    expect(a.orders.find(o => o.id === id)!.status).toBe('cancelled');
  });
  it('rejects a missing, doubled, off-tick or out-of-range trail and any limit price', () => {
    const a = long();
    for (const bad of [{}, { trailDistance: 1, trailPercent: 1 }, { trailDistance: 0.005 }, { trailPercent: 100 }, { trailPercent: 0 }, { trailDistance: 1, limitPrice: 99 }]) expect(send(a, bad, 1).ok, JSON.stringify(bad)).toBe(false);
    expect(submitPaperOrder(a, { instrument, side: 'sell', type: 'stop', stopPrice: 90, quantity: 1, trailDistance: 1 }, 1).ok).toBe(false);
  });
  it('shows as one non-draggable moving order line and a Trailing stop history row', () => {
    let a = long();
    a = ok(send(a, { trailDistance: 1 }, 1)); a = feed(a, q(100, 100.02, 2));
    expect(paperChartLines(a, instrument).filter(l => l.kind === 'order')).toMatchObject([{ price: 99, trailing: true, label: 'Sell trailing stop 10 at 99.00 (trail 1.00)' }]);
    a = feed(a, q(105, 105.02, 3));
    expect(paperChartLines(a, instrument).filter(l => l.kind === 'order')[0].price).toBe(104);
    a = feed(a, q(103.5, 103.52, 4));
    expect(paperDockHistory(a).find(r => r.type === 'Trailing stop')).toMatchObject({ basis: 'Bid', price: '103.50' });
  });
});

describe('fill basis', () => {
  it('buys fill at the ask and sells at the bid, each labelled', () => {
    let a = feed(createPaperAccount({ initialBalance: 100000, now: 0 }), q(99.99, 100.01, 1));
    a = ok(submitPaperOrder(a, { instrument, side: 'buy', type: 'market', quantity: 1 }, 1));
    a = ok(submitPaperOrder(a, { instrument, side: 'sell', type: 'market', quantity: 1 }, 1));
    expect(a.fills.map(f => [f.price, f.basis])).toEqual([[100.01, 'ask'], [99.99, 'bid']]);
    expect(a.fills.map(f => paperFillBasisLabel(f.basis))).toEqual(['Ask', 'Bid']);
  });
  it('a quote without a bid/ask spread (last imported price) fills at that price, labelled Last price', () => {
    const last = lastImportedQuote({ instrument, bars: [{ time: 1, open: 50, high: 51, low: 49, close: 50.5, volume: 1 }], provenance: { fixture: false, datasetId: 'local-import:x', session: 'regular' } } as never, 2)!;
    let a = createPaperAccount({ initialBalance: 100000, now: 0 });
    a = ok(processPaperQuote(a, last, 2, a.runId, instrument));
    a = ok(submitPaperOrder(a, { instrument, side: 'buy', type: 'market', quantity: 1 }, 2));
    expect(a.fills[0]).toMatchObject({ price: 50.5, basis: 'last' });
    expect(paperFillBasisLabel('last')).toBe('Last price');
  });
  it('labels the order-level and absent bases', () => {
    expect(paperFillBasisLabel('order-level')).toBe('Order price');
    expect(paperFillBasisLabel(undefined)).toBe('');
  });
});

describe('Week and Month durations', () => {
  const nyStock = { assetClass: 'stock', timezone: 'America/New_York' };
  const at = (iso: string) => Date.parse(iso) / 1000, iso = (s: number) => new Date(s * 1000).toISOString();
  it('Week ends at the close of the last trading day of the week (EDT 16:00 = 20:00Z on Fri 30 Oct 2026)', () => {
    expect(iso(paperPeriodExpiry('week', at('2026-10-28T15:00:00Z'), nyStock, false, PAPER_EARLY_CLOSE))).toBe('2026-10-30T20:00:00.000Z');
    expect(iso(paperPeriodExpiry('week', at('2026-10-28T15:00:00Z'), nyStock, true, PAPER_EARLY_CLOSE))).toBe('2026-10-31T00:00:00.000Z');
  });
  it('Week skips the Thanksgiving holiday and uses the 13:00 early close on Fri 27 Nov 2026 (EST = 18:00Z)', () => {
    expect(iso(paperPeriodExpiry('week', at('2026-11-23T15:00:00Z'), nyStock, false, PAPER_EARLY_CLOSE))).toBe('2026-11-27T18:00:00.000Z');
  });
  it('Week rolls to the next week once the last close has passed (Fri 30 Oct 21:00Z -> Fri 6 Nov close 21:00Z)', () => {
    expect(iso(paperPeriodExpiry('week', at('2026-10-30T21:00:00Z'), nyStock, false, PAPER_EARLY_CLOSE))).toBe('2026-11-06T21:00:00.000Z');
    expect(iso(paperPeriodExpiry('week', at('2026-10-31T15:00:00Z'), nyStock, false, PAPER_EARLY_CLOSE))).toBe('2026-11-06T21:00:00.000Z');
  });
  it('Month ends at the close of the last trading day: Mon 30 Nov 2026 at 21:00Z, and Fri 30 Oct for October (31 Oct is a Saturday)', () => {
    expect(iso(paperPeriodExpiry('month', at('2026-11-05T15:00:00Z'), nyStock, false, PAPER_EARLY_CLOSE))).toBe('2026-11-30T21:00:00.000Z');
    expect(iso(paperPeriodExpiry('month', at('2026-10-05T15:00:00Z'), nyStock, false, PAPER_EARLY_CLOSE))).toBe('2026-10-30T20:00:00.000Z');
    expect(iso(paperPeriodExpiry('month', at('2026-10-30T21:00:00Z'), nyStock, false, PAPER_EARLY_CLOSE))).toBe('2026-11-30T21:00:00.000Z');
  });
  it('instruments without a US session end at the UTC end of the Sunday or month', () => {
    expect(iso(paperPeriodExpiry('week', at('2026-10-28T15:00:00Z'), { assetClass: 'crypto', timezone: 'UTC' }, false))).toBe('2026-11-01T23:59:59.000Z');
    expect(iso(paperPeriodExpiry('month', at('2026-10-28T15:00:00Z'), { assetClass: 'crypto', timezone: 'UTC' }, false))).toBe('2026-10-31T23:59:59.000Z');
  });
  it('the Buy/Sell ticket places a Week or Month order as an expiring order with the resolved close', () => {
    const NOW = at('2026-10-28T15:00:00Z');
    const stock: Instrument = { ...instrument, id: 'SYN:NY', assetClass: 'stock', timezone: 'America/New_York' };
    const quote = { ...q(99.99, 100.01, NOW), instrumentId: stock.id } as Quote;
    let account = createPaperAccount({ initialBalance: 100000, now: NOW });
    account = ok(processPaperQuote(account, quote, NOW, account.runId, stock));
    const ctx = { account, instrument: stock, quote, quoteSource: { key: 'syn', state: 'ready' as const }, now: NOW };
    for (const duration of ['week', 'month'] as const) {
      const result = placeBrokerTicket({ ...blankBrokerDraft('buy'), quantity: '1', tab: 'limit', price: '90', duration }, ctx as never, 'cmd-' + duration);
      if (!result.ok) throw new Error(result.message);
      const order = result.account.orders.at(-1)!;
      expect(order).toMatchObject({ timeInForce: 'GTD', status: 'working' });
      expect(iso(order.expiresAt!)).toBe('2026-10-30T20:00:00.000Z');
    }
  });
});

describe('ticket draft requests and the chart Qty box', () => {
  const draft = { side: 'sell', type: 'trailing-stop', quantity: '5', limitPrice: '', stopPrice: '', timeInForce: 'GTC', expiresAt: '', extendedHours: false } as const;
  it('builds a trailing-stop request from a distance or a percent, and a Week draft with its resolved close', async () => {
    const { buildPaperRequest } = await import('../../src/ui/PaperPanel');
    expect(buildPaperRequest({ ...draft, trailMode: 'distance', trailValue: '0.5' }, instrument)).toMatchObject({ type: 'trailing-stop', trailDistance: 0.5 });
    expect(buildPaperRequest({ ...draft, trailMode: 'percent', trailValue: '2' }, instrument)).toMatchObject({ trailPercent: 2 });
    expect(() => buildPaperRequest({ ...draft, trailMode: 'distance', trailValue: '' }, instrument)).toThrow('Trail distance');
    const week = buildPaperRequest({ ...draft, type: 'market', timeInForce: 'WEEK' }, { ...instrument, timezone: 'America/New_York' }, null, Date.parse('2026-10-28T15:00:00Z') / 1000);
    expect(week).toMatchObject({ timeInForce: 'GTD', expiresAt: Date.parse('2026-10-30T20:00:00Z') / 1000 });
  });
  it('styles the Qty box as a dark bordered field with centered text, not a grey button', async () => {
    const { readFileSync } = await import('node:fs');
    const rule = readFileSync('src/ui/chart-commands.css', 'utf8').split('\n').find(line => line.startsWith('.lv-trade-qty{'))!;
    expect(rule).toContain('background:var(--lv-bg-surface)');
    expect(rule).toContain('border:1px solid var(--lv-input-border)');
    expect(rule).toContain('text-align:center');
  });
});

describe('trailing stop on a bar path (REVIEW-1027 #2)', () => {
  // Zero spread so bids equal the bar mids. Long 10 at 100; sell trailing stop, distance 5: best 100, stop 95 at submission.
  const bar = (open: number, high: number, low: number, close: number) => ({ time: 100, open, high, low, close });
  const applyBar = (a: PaperAccount, b: ReturnType<typeof bar>) => ok(processPaperBar(a, { instrumentId: instrument.id, bar: b, firstSequence: 2, halfSpread: 0, policy: 'open-proximity', fixture: true, session: 'regular', availableAt: 100, now: 100, executionInstrument: instrument }));
  const trailing = () => {
    let a = feed(createPaperAccount({ initialBalance: 100000, now: 0 }), q(100, 100, 1));
    a = ok(submitPaperOrder(a, { instrument, side: 'buy', type: 'market', quantity: 10 }, 1));
    a = ok(send(a, { trailDistance: 5 }, 1));
    expect(a.orders.at(-1)).toMatchObject({ trailBest: 100, stopPrice: 95, status: 'working' });
    return a;
  };
  it('fills at the stop in force when it is crossed inside a segment, not at the bar extreme', () => {
    // O100 H110 L90 C92: high distance 10 <= low distance 10, so O, H, L, C. At H the best is 110 and the stop 105.
    // The H-to-L segment (110 to 90) crosses 105: fill 105 intrabar at the order level (the bar low 90 would be 15 worse).
    const a = applyBar(trailing(), bar(100, 110, 90, 92));
    expect(a.orders.at(-1)).toMatchObject({ status: 'filled', stopPrice: 105, averageFillPrice: 105 });
    expect(a.fills.at(-1)).toMatchObject({ price: 105, basis: 'order-level', intrabar: true });
    expect(a.positions[instrument.id]).toBeUndefined();
  });
  it('a gap through the stop at the open still fills at the open quote, like a plain stop', () => {
    // O93 is below the stop 95 at the first point (no segment yet): fill at the open bid 93, no intrabar flag.
    const a = applyBar(trailing(), bar(93, 94, 91, 92));
    expect(a.fills.at(-1)).toMatchObject({ price: 93, basis: 'bid' }); expect(a.fills.at(-1)!.intrabar).toBeUndefined();
  });
});
