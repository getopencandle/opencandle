import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPaperAccount, paperBarQuotePath, processPaperBar, processPaperQuote, submitPaperOrder, type PaperAccount, type PaperBarPathOptions, type PaperResult } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { backtestStrategy } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { strategyReportJson } from '../../src/domain/strategy-report-export';
import { restoreStrategyReportJson } from '../../src/strategy-report/restore';
import { reportArithmeticFixture } from '../domain/strategy-report-fixtures';

// All prices, orders and balances in this file are synthetic. No actual security or account is used.
const instrument: Instrument = { id: 'SYNTHETIC:BOUNDARY', symbol: 'BOUNDARY', name: 'Synthetic execution-boundary fixture', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const options = (patch: Partial<PaperBarPathOptions> = {}) => ({ instrumentId: instrument.id, bar: { time: 100, open: 30, high: 40, low: 10, close: 30 }, firstSequence: 10, halfSpread: 0.01, policy: 'open-proximity' as const, fixture: true, session: 'unknown' as const, availableAt: 1000, ...patch, now: 1000, executionInstrument: instrument });
const accepted = (result: PaperResult) => { expect(result.ok, result.diagnostics.map(row => row.message).join('; ')).toBe(true); return result.account; };
const feed = (quote: Quote) => accepted(processPaperQuote(createPaperAccount(), quote, 1000, 'ordinary', instrument));
const place = (account: PaperAccount, side: 'buy' | 'sell', limitPrice: number) => accepted(submitPaperOrder(account, { instrument, type: 'limit', side, quantity: 1, limitPrice }, 1000));
const refuseUnchanged = (result: PaperResult, account: PaperAccount, code: string) => { expect(result.ok).toBe(false); expect(result.account).toBe(account); expect(result.diagnostics[0].code).toBe(code); };

describe('paper bar execution only resumes from an accepted boundary', () => {
  it('refuses a reused sequence with a different offered price before any order can fill', () => {
    const path = paperBarQuotePath(options());
    const current = place(feed({ ...path[0], bid: 20, ask: 20.02 }), 'sell', 25);
    // Offered seq 10 bid 29.99 was never accepted. It cannot supply the segment start for seq 11 bid 39.99.
    const before = JSON.stringify(current);
    refuseUnchanged(processPaperBar(current, options()), current, 'BAR_PATH_CONFLICT');
    expect(current.fills).toEqual([]); expect(JSON.stringify(current)).toBe(before);
  });

  it('resumes after the matching first point and fills at the literal crossed limit', () => {
    const current = place(feed(paperBarQuotePath(options())[0]), 'sell', 35);
    const next = accepted(processPaperBar(current, options()));
    // The accepted bid 29.99 moves to 39.99. The pending sell limit is crossed at 35, not at the extreme.
    expect(next.fills).toHaveLength(1); expect(next.fills[0]).toMatchObject({ side: 'sell', quantity: 1, price: 35, intrabar: true });
    expect(next.cash).toBe(100035); expect(next.quotes[instrument.id].sequence).toBe(13);
  });

  it('resumes after a matching middle point without using earlier skipped points', () => {
    const current = place(feed(paperBarQuotePath(options())[1]), 'buy', 20);
    const next = accepted(processPaperBar(current, options()));
    // From the retained high ask 40.01 to low ask 10.01, buy limit 20 fills at 20.
    expect(next.fills).toHaveLength(1); expect(next.fills[0]).toMatchObject({ side: 'buy', price: 20, intrabar: true });
    expect(next.cash).toBe(99980);
  });

  it.each([
    ['bid', 29.98], ['ask', 30.02], ['eventTime', 101], ['receivedAt', 999],
    ['fixture', false], ['session', 'regular'], ['bidSize', 1], ['askSize', 1],
  ] as const)('refuses a boundary whose accepted %s differs', (field, value) => {
    const current = feed({ ...paperBarQuotePath(options())[0], [field]: value });
    refuseUnchanged(processPaperBar(current, options()), current, 'BAR_PATH_CONFLICT');
  });

  it('refuses a boundary whose accepted availableAt differs', () => {
    // Both observations are available by now. Only availability differs, not receipt time.
    const quote = { ...paperBarQuotePath(options())[0], availableAt: 1001 };
    const current = accepted(processPaperQuote(createPaperAccount(), quote, 1001, 'ordinary', instrument));
    refuseUnchanged(processPaperBar(current, { ...options(), now: 1001 }), current, 'BAR_PATH_CONFLICT');
  });

  it('returns the same account for a valid fully repeated path', () => {
    const next = accepted(processPaperBar(createPaperAccount(), options()));
    expect(accepted(processPaperBar(next, options()))).toBe(next);
  });

  it('validates the run even when every point would otherwise be skipped', () => {
    const next = accepted(processPaperBar(createPaperAccount(), options()));
    refuseUnchanged(processPaperBar(next, options(), 'different-run'), next, 'RUN_MISMATCH');
  });

  it('validates the clock even when every point would otherwise be skipped', () => {
    const next = accepted(processPaperBar(createPaperAccount(), options()));
    refuseUnchanged(processPaperBar(next, { ...options(), now: 999 }), next, 'INVALID_QUOTE');
  });

  it('refuses future information even on an otherwise repeated sequence', () => {
    const next = accepted(processPaperBar(createPaperAccount(), options()));
    refuseUnchanged(processPaperBar(next, options({ availableAt: 1001 })), next, 'FUTURE_QUOTE');
  });

  it('refuses an older path when its boundary is no longer retained', () => {
    const current = feed({ ...paperBarQuotePath(options())[3], sequence: 20 });
    refuseUnchanged(processPaperBar(current, options()), current, 'OUT_OF_ORDER_QUOTE');
  });

  it('does not partially commit when later generated sequences exceed safe integers', () => {
    const current = createPaperAccount();
    refuseUnchanged(processPaperBar(current, options({ firstSequence: Number.MAX_SAFE_INTEGER - 1 })), current, 'INVALID_QUOTE');
    expect(current.quotes).toEqual({});
  });

  it('keeps a wholly fresh bar open as a gap fill', () => {
    const current = place(feed({ ...paperBarQuotePath(options())[0], sequence: 9, bid: 20, ask: 20.02 }), 'sell', 25);
    const next = accepted(processPaperBar(current, options()));
    expect(next.fills[0].price).toBe(29.99); expect(next.fills[0].intrabar).toBeUndefined();
  });

  it('preserves close-only execution and exact repeated-close idempotency', () => {
    const input = options({ policy: 'close-only' });
    const current = accepted(submitPaperOrder(createPaperAccount(), { instrument, type: 'market', side: 'buy', quantity: 1 }, 0));
    const next = accepted(processPaperBar(current, input));
    expect(next.fills[0].price).toBe(30.01); expect(next.fills[0].intrabar).toBeUndefined();
    expect(next.quotes[instrument.id]).toEqual(paperBarQuotePath(input)[0]);
    expect(accepted(processPaperBar(next, input))).toBe(next);
  });
});

const reportText = (empty = false) => {
  const fixture = reportArithmeticFixture();
  const result = empty ? backtestStrategy({ bars: fixture.bars, barIds: fixture.barIds, signals: [], config: fixture.config }) : fixture.result;
  return strategyReportJson(buildStrategyReport({ bars: fixture.bars, barIds: fixture.barIds, result, context: { executionId: 'synthetic-integration', sourceLabel: 'Synthetic financial integration regression', currency: 'USD', timezone: 'UTC' } }));
};

describe('saved strategy reports claim internal consistency only', () => {
  it('restores the committed checkpoint-4519 export and labels every nonfinal equity row honestly', () => {
    const saved = readFileSync('tests/fixtures/strategy-report-baseline-4519.json', 'utf8');
    const restored = restoreStrategyReportJson(saved);
    expect(restored.summary.analysis).toBeNull();
    expect(restored.unverified[0]).toMatch(/All nonfinal equity values, including the first row/);
    expect(restored.unverified[0]).toMatch(/not verified against source prices/);
  });

  it('retains current report arithmetic and location consistency', () => {
    const restored = restoreStrategyReportJson(reportText());
    expect(restored.trades).toHaveLength(3); expect(restored.openLots).toHaveLength(1);
    expect(restored.trades.map(row => row.netProfit)).toEqual([4, -8, 0]);
    expect(restored.summary.analysis!.sides.all.outcomes).toMatchObject({ trades: 3, wins: 1, losses: 1, even: 1 });
    expect(restored.verified).toContain('all.finalEquity');
  });

  it.each(['entry', 'exit'] as const)('rejects a trade %s time inconsistent with its equity row', phase => {
    const value = JSON.parse(reportText()); value.trades[0][phase].time += 1;
    expect(() => restoreStrategyReportJson(JSON.stringify(value))).toThrow(/time or bar identity does not match its saved equity row/);
  });

  it.each(['entry', 'exit'] as const)('rejects a trade %s bar ID inconsistent with its equity row', phase => {
    const value = JSON.parse(reportText()); value.trades[0][phase].barId = 'synthetic-wrong-row';
    expect(() => restoreStrategyReportJson(JSON.stringify(value))).toThrow(/time or bar identity does not match its saved equity row/);
  });

  it.each(['time', 'barId'] as const)('rejects an open-lot %s inconsistent with its equity row', field => {
    const value = JSON.parse(reportText()); value.openLots[0].entry[field] = field === 'time' ? value.openLots[0].entry.time + 1 : 'synthetic-wrong-row';
    expect(() => restoreStrategyReportJson(JSON.stringify(value))).toThrow(/Saved open entry time or bar identity does not match its saved equity row/);
  });

  for (const side of ['all', 'long', 'short'] as const) for (const field of ['winShare', 'lossShare', 'evenShare'] as const) {
    it(`rejects an incorrect finite ${side} ${field}, including values below 100`, () => {
      const value = JSON.parse(reportText()); value.analysis.sides[side].outcomes[field] = 1.2345;
      expect(() => restoreStrategyReportJson(JSON.stringify(value))).toThrow(/outcome percentages/);
    });
  }

  it('rejects an outcome percentage greater than 100', () => {
    const value = JSON.parse(reportText()); value.analysis.sides.all.outcomes.winShare = 999;
    expect(() => restoreStrategyReportJson(JSON.stringify(value))).toThrow(/outcome percentages/);
  });

  it('keeps null outcome percentages for zero-trade reports', () => {
    const restored = restoreStrategyReportJson(reportText(true));
    for (const side of ['all', 'long', 'short'] as const) expect(restored.summary.analysis!.sides[side].outcomes).toEqual({ trades: 0, wins: 0, losses: 0, even: 0, winShare: null, lossShare: null, evenShare: null });
  });

  it('rejects a missing percentage for a nonempty outcome population', () => {
    const value = JSON.parse(reportText()); value.analysis.sides.long.outcomes.winShare = null;
    expect(() => restoreStrategyReportJson(JSON.stringify(value))).toThrow(/Outcome share contradicts its count/);
  });
});
