import { describe, expect, it } from 'vitest';
import { createPaperAccount, submitPaperOrder } from '../../src/domain/paper';
import { feedPaperSymbols, paperWatchedInstruments } from '../../src/domain/paper-multi-feed';
import type { Bar, Instrument } from '../../src/domain/types';

// Synthetic instruments and bars only. Virtual money.
const mk = (id: string): Instrument => ({ id, symbol: id.toUpperCase(), name: `Synthetic ${id}`, exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' } as Instrument);
const a = mk('syn-a'), b = mk('syn-b');
const bar = (time: number, o: number, h: number, l: number, c: number): Bar => ({ time, open: o, high: h, low: l, close: c, volume: 1 });
const prov = { fixture: false, session: 'regular' } as const;
const input = (instrument: Instrument, bars: Bar[]) => ({ bars, instrument, provenance: prov, live: false });

describe('paper fills for symbols other than the charted one', () => {
  it('fills a resting limit on a symbol that is not the active chart', () => {
    let account = feedPaperSymbols(createPaperAccount(), [input(a, [bar(60, 10, 11, 9, 10)]), input(b, [bar(60, 50, 51, 49, 50)])]).account;
    const placed = submitPaperOrder(account, { instrument: b, quantity: 1, side: 'buy', type: 'limit', limitPrice: 48, timeInForce: 'GTC', extendedHours: false } as never, 60);
    expect(placed.ok).toBe(true); account = placed.account;
    expect(paperWatchedInstruments(account).map(row => row.id)).toEqual(['syn-b']);
    const step = feedPaperSymbols(account, [input(a, [bar(60, 10, 11, 9, 10), bar(120, 10, 11, 9, 10)]), input(b, [bar(60, 50, 51, 49, 50), bar(120, 50, 50, 47, 48.5)])]);
    expect(step.ok).toBe(true); expect(step.account.positions['syn-b'].quantity).toBe(1); expect(step.account.fills).toHaveLength(1);
  });
  it('reports nothing watched for an account with no working orders or positions', () => {
    expect(paperWatchedInstruments(createPaperAccount())).toEqual([]);
  });
});

describe('background feed inputs (lane F App diff)', () => {
  it('names a 1m input for each watched symbol other than the charted one, only when its series has arrived', async () => {
    const { paperBackgroundInputs, paperBackgroundSymbols } = await import('../../src/domain/paper-multi-feed');
    let account = feedPaperSymbols(createPaperAccount(), [input(a, [bar(60, 10, 11, 9, 10)]), input(b, [bar(60, 50, 51, 49, 50)])]).account;
    for (const instrument of [a, b]) account = submitPaperOrder(account, { instrument, quantity: 1, side: 'buy', type: 'limit', limitPrice: 5, timeInForce: 'GTC', extendedHours: false } as never, 60).account;
    expect(paperBackgroundSymbols(account, 'syn-a')).toEqual(['SYN-B']);
    const series = new Map([['syn-b', { bars: [bar(60, 50, 51, 49, 50)], provenance: prov }]]);
    const rows = paperBackgroundInputs(account, 'syn-a', series as never);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ resolution: '1m', live: true });
    expect(rows[0].instrument.id).toBe('syn-b');
    expect(paperBackgroundInputs(account, 'syn-a', new Map())).toEqual([]);
  });
});
