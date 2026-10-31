import { describe, expect, it } from 'vitest';
import { createPaperAccount, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars, type PaperBarFeedInput } from '../../src/domain/paper-bar-feed';
import { paperFeedInput, paperFineFeedSymbol } from '../../src/domain/paper-feed-source';
import { alpacaBarSession, alpacaInstrument, ALPACA_IEX_PROVIDER_ID, ALPACA_SIP_PROVIDER_ID } from '../../src/domain/alpaca-live';
import type { Bar, BarDataset, Instrument } from '../../src/domain/types';

// Overnight paper feed. Synthetic instruments and bars only. Virtual money.
const instrument: Instrument = { id: 'syn-h1', symbol: 'SYNH', name: 'Synthetic H1', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' } as Instrument;
const bar = (time: number, open: number, high: number, low: number, close: number): Bar => ({ time, open, high, low, close, volume: 1 });
const ok = (result: ReturnType<typeof feedPaperBars>) => { expect(result.message).toBe(null); expect(result.ok).toBe(true); return result; };
const order = (account: PaperAccount, request: Record<string, unknown>, now: number, on: Instrument = instrument) => { const result = submitPaperOrder(account, { instrument: on, quantity: 1, ...request } as never, now); expect(result.diagnostics.map(row => row.message).join(' ')).toBe(''); return result.account; };
const T = 1_800_000_000 - (1_800_000_000 % 86400); // a UTC day start
const M = (minutes: number) => T + minutes * 60;

describe('H1: paper fills follow one series, independent of the chart interval', () => {
  const liveInput = (bars: Bar[], resolution: string, forming: PaperBarFeedInput['forming']): PaperBarFeedInput => ({ bars, instrument, provenance: { fixture: false, session: 'all' }, live: true, resolution, forming });
  it('finer to coarser: the next price on the coarse forming bar is processed at once (no stall for the whole bar)', () => {
    let step = ok(feedPaperBars(createPaperAccount(), liveInput([bar(M(607), 100, 100, 100, 100), bar(M(608), 100, 100, 100, 100)], '1m', null)));
    let account = order(step.account, { side: 'buy', type: 'limit', limitPrice: 99 }, M(608));
    // The 5m chart's forming bar started at 10:05, before the 10:08 quote the account holds.
    step = ok(feedPaperBars(account, liveInput([bar(M(600), 101, 101, 98.5, 98.5), bar(M(605), 100, 100, 98.5, 98.5)], '5m', step.forming)));
    account = step.account;
    expect(account.fills).toHaveLength(1); expect(account.fills[0].price).toBe(99);
    expect(account.quotes[instrument.id].bid).toBe(98.5);
  });
  it('finer to coarser without a remembered resolution: the stall branch still marks the current close', () => {
    const step = ok(feedPaperBars(createPaperAccount(), liveInput([bar(M(608), 100, 100, 100, 100)], '1m', null)));
    const next = ok(feedPaperBars(step.account, liveInput([bar(M(605), 100, 100.7, 100, 100.7)], '5m', null)));
    expect(next.account.quotes[instrument.id].bid).toBe(100.7);
    const market = order(next.account, { side: 'buy', type: 'market' }, Math.max(next.account.clock, M(605)));
    expect(market.fills[0].price).toBe(100.7);
  });
  it('coarser to finer: bars from before the order was placed are never replayed', () => {
    const daily: PaperBarFeedInput = { bars: [bar(T, 100, 100, 100, 100)], instrument, provenance: { fixture: false, session: 'all' }, live: true, resolution: '1D', forming: null };
    let step = ok(feedPaperBars(createPaperAccount(), daily));
    let account = order(step.account, { side: 'buy', type: 'limit', limitPrice: 95 }, T);
    const minutes = [bar(M(600), 100, 100, 94, 96), bar(M(601), 96, 99, 96, 99), bar(M(602), 99, 100, 99, 100)];
    step = ok(feedPaperBars(account, liveInput(minutes, '1m', step.forming)));
    account = step.account;
    expect(account.fills, 'the 94 print happened before the order could be seen on this series').toHaveLength(0);
    expect(account.quotes[instrument.id]).toMatchObject({ bid: 100, eventTime: M(602) });
    // The 1m series then continues normally: a later dip fills the limit at its price.
    step = ok(feedPaperBars(account, liveInput([...minutes, bar(M(603), 100, 100, 94.5, 95.5), bar(M(604), 95.5, 95.5, 95.5, 95.5)], '1m', step.forming)));
    expect(step.account.fills).toHaveLength(1); expect(step.account.fills[0].price).toBe(95);
  });
  it('5m to 1m inside the same 5m bar: the earlier minutes are not replayed', () => {
    let step = ok(feedPaperBars(createPaperAccount(), liveInput([bar(M(605), 100, 100, 100, 100)], '5m', null)));
    let account = order(step.account, { side: 'buy', type: 'limit', limitPrice: 99 }, M(605));
    step = ok(feedPaperBars(account, liveInput([bar(M(605), 100, 100, 98, 98.5), bar(M(606), 98.5, 100, 98.5, 100), bar(M(607), 100, 100.2, 100, 100.2)], '1m', step.forming)));
    expect(step.account.fills).toHaveLength(0);
    expect(step.account.quotes[instrument.id]).toMatchObject({ bid: 100.2, eventTime: M(607) });
  });
});

const nyDataset = (providerId: string, resolution: string, bars: Bar[] = []): BarDataset => ({ instrument: alpacaInstrument('GME'), bars, resolution, provenance: { providerId, providerName: 'Synthetic test provider', datasetId: providerId === ALPACA_IEX_PROVIDER_ID ? `live:${providerId}:GME:${resolution}` : `${providerId}:GME:${resolution}`, fixture: false, coverage: 'synthetic', asOf: 0, delaySeconds: 0, adjustment: 'raw', session: 'unknown', timezone: 'America/New_York', state: 'ready', license: 'synthetic', revision: 'x', notes: [] } } as BarDataset);

describe('H1: the live feed source is the finest series, whatever the chart shows', () => {
  const chart = [bar(M(600), 20, 21, 19, 20)], fine = nyDataset(ALPACA_IEX_PROVIDER_ID, '1m', [bar(M(604), 20, 20, 20, 20.5)]);
  it('a coarse Alpaca chart asks for a 1m series and feeds the account from it', () => {
    const coarse = nyDataset(ALPACA_IEX_PROVIDER_ID, '5m', chart);
    expect(paperFineFeedSymbol(coarse, false)).toBe('GME');
    expect(paperFeedInput({ dataset: coarse, bars: chart, replay: false, fine: null, forming: null }), 'waits for the 1m series').toBeNull();
    const input = paperFeedInput({ dataset: coarse, bars: chart, replay: false, fine, forming: null })!;
    expect(input).toMatchObject({ bars: fine.bars, resolution: '1m', live: true });
  });
  it('a 1m Alpaca chart, a replay and an import use the chart bars', () => {
    const one = nyDataset(ALPACA_IEX_PROVIDER_ID, '1m', chart);
    expect(paperFineFeedSymbol(one, false)).toBeNull();
    expect(paperFineFeedSymbol(nyDataset(ALPACA_IEX_PROVIDER_ID, '5m', chart), true)).toBeNull();
    expect(paperFeedInput({ dataset: one, bars: chart, replay: false, fine: null, forming: null })).toMatchObject({ bars: chart, resolution: '1m', live: true });
    const sip = nyDataset(ALPACA_SIP_PROVIDER_ID, '5m', chart);
    expect(paperFineFeedSymbol(sip, false)).toBeNull();
    expect(paperFeedInput({ dataset: sip, bars: chart, replay: false, fine: null, forming: null })).toMatchObject({ bars: chart, resolution: '5m', live: false });
  });
});

describe('H3: Alpaca quotes and bars carry the US session', () => {
  // 2026-10-20 is a Tuesday; New York is UTC-4 (EDT).
  const ny = (hour: number, minute = 0) => Date.UTC(2026, 9, 20, hour + 4, minute) / 1000;
  const gme = alpacaInstrument('GME');
  it('classifies New York time: regular 09:30-16:00, extended 04:00-09:30 and 16:00-20:00, otherwise closed', () => {
    expect(alpacaBarSession(ny(8))).toBe('extended');
    expect(alpacaBarSession(ny(9, 29))).toBe('extended');
    expect(alpacaBarSession(ny(9, 30))).toBe('regular');
    expect(alpacaBarSession(ny(15, 59))).toBe('regular');
    expect(alpacaBarSession(ny(16))).toBe('extended');
    expect(alpacaBarSession(ny(20))).toBe('closed');
  });
  const feed = (account: PaperAccount, bars: Bar[], forming: PaperBarFeedInput['forming'] = null) => ok(feedPaperBars(account, paperFeedInput({ dataset: nyDataset(ALPACA_IEX_PROVIDER_ID, '1m', bars), bars, replay: false, fine: null, forming })!));
  it('a regular-hours order does not fill on a pre-market print and fills at the open', () => {
    let step = feed(createPaperAccount(), [bar(ny(8), 20, 20, 20, 20)]);
    expect(step.account.quotes[gme.id].session).toBe('extended');
    let account = order(step.account, { side: 'buy', type: 'market' }, ny(8), gme);
    expect(account.fills, 'pre-market print').toHaveLength(0);
    step = feed(account, [bar(ny(8), 20, 20, 20, 20), bar(ny(9, 30), 21, 21, 21, 21)], step.forming);
    expect(step.account.fills).toHaveLength(1); expect(step.account.fills[0].price).toBe(21);
  });
  it('an extended-hours limit fills on a pre-market print', () => {
    let step = feed(createPaperAccount(), [bar(ny(8), 20, 20, 20, 20)]);
    let account = order(step.account, { side: 'buy', type: 'limit', limitPrice: 19.5, extendedHours: true }, ny(8), gme);
    step = feed(account, [bar(ny(8), 20, 20, 20, 20), bar(ny(8, 1), 19.4, 19.4, 19.4, 19.4)], step.forming);
    expect(step.account.fills).toHaveLength(1); expect(step.account.fills[0].price).toBe(19.4);
  });
  it('a restarted regular-hours order does not catch up on after-hours bars', () => {
    let step = feed(createPaperAccount(), [bar(ny(15, 58), 20, 20, 20, 20)]);
    let account = order(step.account, { side: 'buy', type: 'limit', limitPrice: 19 }, ny(15, 58), gme);
    const closedFeed = paperFeedInput({ dataset: nyDataset(ALPACA_SIP_PROVIDER_ID, '1m', []), bars: [bar(ny(15, 58), 20, 20, 20, 20), bar(ny(16, 30), 20, 20, 18, 18.5), bar(ny(17), 18.5, 18.5, 18.5, 18.5)], replay: false, fine: null, forming: null })!;
    step = ok(feedPaperBars(account, closedFeed));
    expect(step.account.fills).toHaveLength(0);
  });
});
