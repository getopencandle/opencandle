import { describe, expect, it } from 'vitest';
import { DEMO_SYMBOLS, FIXTURE_CAPABILITIES, FIXTURE_NOTICE, fixtureDataset, fixtureInstrument, fixtureQuote, makeFixture } from '../../src/domain/fixtures';

describe('explicitly synthetic fixtures', () => {
  it('is deterministic and prefix stable for arbitrary supported symbols', () => {
    expect(DEMO_SYMBOLS).toContain('GME'); expect(DEMO_SYMBOLS).toContain('SPY');
    expect(makeFixture('arbitrary', 20)).toEqual(makeFixture(' ARBITRARY ', 80).slice(0, 20));
    expect(makeFixture('ARBITRARY', 20)).not.toEqual(makeFixture('SECOND', 20));
  });
  it('has valid chronological OHLCV and discloses the simplified calendar', () => {
    const dataset = fixtureDataset('GME', 500);
    for (let i = 0; i < dataset.bars.length; i++) {
      const bar = dataset.bars[i];
      expect(bar.low).toBeGreaterThan(0); expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close)); expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close)); expect(bar.volume).toBeGreaterThanOrEqual(0);
      if (i) expect(bar.time).toBeGreaterThan(dataset.bars[i - 1].time);
      expect([0, 6]).not.toContain(new Date(bar.time * 1000).getUTCDay());
    }
    expect(dataset.instrument.exchange).toBe('SYNTHETIC');
    expect(dataset.provenance.fixture).toBe(true); expect(dataset.provenance.notes).toContain(FIXTURE_NOTICE);
    expect(dataset.provenance.notes.join(' ')).toContain('holidays are not modeled');
    expect(FIXTURE_CAPABILITIES.verifiedLive).toBe(false); expect(FIXTURE_CAPABILITIES.fields).not.toContain('fundamentals');
  });
  it('bounds resource requests and labels generated simulation quotes', () => {
    for (const count of [-1, 1.5, NaN, 100001]) expect(() => makeFixture('GME', count)).toThrow();
    expect(() => fixtureInstrument(' ')).toThrow();
    expect(makeFixture('GME', 0)).toEqual([]);
    const bar = makeFixture('SPY', 1)[0], quote = fixtureQuote('SYNTHETIC:SPY', bar, 1);
    expect(quote.fixture).toBe(true); expect(quote.bid).toBeLessThan(quote.ask); expect(quote.availableAt).toBe(bar.time);
  });
});
