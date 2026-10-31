import { describe, expect, it } from 'vitest';
import { allocatePaperExitLevels, consumePaperExposure, openingPaperQuantity, paperInstrumentKey, validatePaperExitPlan, type PaperExposureLot } from '../../src/domain/paper-brackets';
import { fixtureDataset } from '../../src/domain/fixtures';

const instrument = fixtureDataset('GME', 1).instrument;
describe('explicit local paper bracket policy', () => {
  it('retains 160 percent requested coverage while allocating only ten units', () => {
    expect(allocatePaperExitLevels([8, 8], 10, 1)).toEqual([
      { requestedQuantity: 8, allocatedQuantity: 8, cappedQuantity: 0, coveragePercent: 80 },
      { requestedQuantity: 8, allocatedQuantity: 2, cappedQuantity: 6, coveragePercent: 80 },
    ]);
    expect(allocatePaperExitLevels([4, 6], 0, 1).every(row => row.allocatedQuantity === 0 && row.coveragePercent === null)).toBe(true);
    expect(allocatePaperExitLevels([0.00000008, 0.00000008], 0.0000001, 0.00000001).map(row => row.allocatedQuantity)).toEqual([0.00000008, 0.00000002]);
  });
  it('consumes oldest protected or unprotected lots without changing another parent arbitrarily', () => {
    const lot = (id: string, remainingQuantity: number, sequence: number, groupId: string | null): PaperExposureLot => ({ id, instrumentId: instrument.id, instrumentKey: paperInstrumentKey(instrument), generation: 1, direction: 'buy', openingFillId: null, migration: true, openedQuantity: remainingQuantity, remainingQuantity, sequence, groupId });
    const original = [lot('a', 6, 1, 'A'), lot('b', 4, 2, 'B')];
    expect(consumePaperExposure(original, 4, instrument.id, 1).lots.map(row => row.remainingQuantity)).toEqual([2, 4]);
    expect(original.map(row => row.remainingQuantity)).toEqual([6, 4]);
    expect(consumePaperExposure([lot('u', 3, 0, null), ...original], 4, instrument.id, 1).lots.map(row => row.remainingQuantity)).toEqual([0, 5, 4]);
    expect(() => consumePaperExposure(original, 7, instrument.id, 1, 'A')).toThrow('owned exposure');
    expect(consumePaperExposure(original, 4, instrument.id, 1, 'B').lots.map(row => row.remainingQuantity)).toEqual([6, 0]);
  });
  it('protects only a reversing fill opening remainder', () => {
    expect(openingPaperQuantity(10, 'sell', 15)).toBe(5);
    expect(openingPaperQuantity(10, 'sell', 4)).toBe(0);
    expect(openingPaperQuantity(-10, 'buy', 15)).toBe(5);
    expect(openingPaperQuantity(10, 'buy', 4)).toBe(4);
  });
  it('supports a single leg and up to four actual paired levels, rejecting malformed price and quantity', () => {
    expect(validatePaperExitPlan({ schemaVersion: 1, mode: 'single', levels: [{ quantity: 1, stopLoss: 9 }] }, instrument, 'buy').levels[0].stopLoss).toBe(9);
    const pair = { quantity: 2, takeProfit: 12, stopLoss: 9 };
    expect(validatePaperExitPlan({ schemaVersion: 1, mode: 'multiple', levels: Array.from({ length: 4 }, () => pair) }, instrument, 'buy').levels).toHaveLength(4);
    for (const level of [{ ...pair, quantity: 0 }, { ...pair, takeProfit: 9 }, { ...pair, stopLoss: 12 }, { ...pair, takeProfit: 12.001 }, { quantity: 2, takeProfit: 12 }]) expect(() => validatePaperExitPlan({ schemaVersion: 1, mode: 'multiple', levels: [level] }, instrument, 'buy')).toThrow();
    expect(() => validatePaperExitPlan({ schemaVersion: 1, mode: 'multiple', levels: Array.from({ length: 5 }, () => pair) }, instrument, 'buy')).toThrow();
  });
  it('rejects hostile descriptors before execution and binds execution metadata', () => {
    let reads = 0; const input = { schemaVersion: 1, mode: 'single', levels: [{ quantity: 1, takeProfit: 12 }] };
    Object.defineProperty(input, 'levels', { get() { reads++; return []; }, enumerable: true });
    expect(() => validatePaperExitPlan(input, instrument, 'buy')).toThrow('data properties'); expect(reads).toBe(0);
    expect(paperInstrumentKey({ ...instrument, exchange: 'OTHER' })).not.toBe(paperInstrumentKey(instrument));
  });
  it('preserves allocation conservation over a deterministic quantity matrix', () => {
    for (let capacity = 0; capacity <= 40; capacity++) for (let a = 0; a <= 12; a++) {
      const requested = [a, 7, 3, 11], rows = allocatePaperExitLevels(requested, capacity, 1);
      expect(rows.reduce((sum, row) => sum + row.allocatedQuantity, 0)).toBe(Math.min(capacity, a + 21));
      expect(rows.every((row, i) => row.allocatedQuantity >= 0 && row.allocatedQuantity <= requested[i] && row.requestedQuantity === requested[i])).toBe(true);
    }
  });
});
