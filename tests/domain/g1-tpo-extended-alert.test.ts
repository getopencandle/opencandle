import { describe, expect, it } from 'vitest';
import { captureTpoExtendedLevels, TPO_ALERT_KINDS } from '../../src/domain/alert-tpo-levels';
import { validateAlertLevels, crossedAlertLevel } from '../../src/domain/alert-levels';

// SYNTHETIC bars (Unix seconds). Day 1 trades 100-110 in 30-minute blocks, day 2 stays far above, day 3 is forming.
const DAY = 86400, base = 1_700_000_000 - (1_700_000_000 % DAY);
const bar = (day: number, minutes: number, low: number, high: number) => ({ time: base + day * DAY + minutes * 60, open: low, high, low, close: high });
const day1 = [bar(0, 0, 100, 104), bar(0, 30, 101, 106), bar(0, 60, 102, 108), bar(0, 90, 103, 110)];
const day2 = [bar(1, 0, 200, 204), bar(1, 30, 201, 206)];
const day3 = [bar(2, 0, 300, 304)];
const settings = { rowSizeMode: 'Ticks Per Row', ticksPerRow: 1 };

describe('captureTpoExtendedLevels', () => {
  it('captures untouched completed-profile levels as a valid frozen set', () => {
    const got = captureTpoExtendedLevels([...day1, ...day2, ...day3], 'poc', 1, settings);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    validateAlertLevels(got.levels);
    expect(got.levels).toMatchObject({ tool: 'tpo', drawingId: 'tpo:poc' });
    expect(got.levels.levels.length).toBe(2); // day 1 and day 2 completed, day 3 still forming
  });
  it('drops a level that a later bar traded through', () => {
    const touch = [bar(2, 0, 90, 120)];
    const got = captureTpoExtendedLevels([...day1, ...day2, ...touch], 'vah', 1, settings);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.levels.levels.every(level => level.price > 150)).toBe(true);
  });
  it('refuses with one profile, and when every level has been traded through', () => {
    expect(captureTpoExtendedLevels(day1, 'poc', 1, settings).ok).toBe(false);
    const sweep = [bar(1, 0, 0, 1000), bar(2, 0, 0, 1000)];
    const refused = captureTpoExtendedLevels([...day1, ...sweep], 'poc', 1, settings);
    expect(refused.ok).toBe(false);
  });
  it('every kind returns ok or a named refusal, never throws', () => {
    for (const kind of TPO_ALERT_KINDS) {
      const got = captureTpoExtendedLevels([...day1, ...day2, ...day3], kind, 1, settings);
      expect(got.ok || got.diagnostics.length > 0).toBe(true);
    }
  });
  it('a captured set crosses like a level set', () => {
    const got = captureTpoExtendedLevels([...day1, ...day2, ...day3], 'poc', 1, settings);
    if (!got.ok) throw new Error('capture failed');
    const price = got.levels.levels[0].price;
    expect(crossedAlertLevel(got.levels, price - 1, price + 1, true)?.price).toBe(price);
  });
});
