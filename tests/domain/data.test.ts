import { describe, expect, it } from 'vitest';
import { aggregateBars, barsToCsv, parseCsv, parseJson } from '../../src/domain/data';
import { makeFixture } from '../../src/domain/fixtures';
import type { Bar } from '../../src/domain/types';

const a: Bar = { time: 60, open: 10, high: 13, low: 9, close: 12, volume: 100 };
const b: Bar = { time: 120, open: 12, high: 14, low: 10, close: 11, volume: 200 };
const c: Bar = { time: 300, open: 11, high: 16, low: 10, close: 15, volume: 50 };
const json = (rows: unknown[], options = {}) => parseJson(JSON.stringify(rows), undefined, options);

describe('local historical import', () => {
  it('imports CSV with BOM, quoted fields, extra quoted metadata and CRLF', () => {
    const result = parseCsv('\uFEFFdate,open,high,low,close,volume,note\r\n"2024-01-02",10,13,9,12,100,"one, two\r\n""quoted"""\r\n');
    expect(result.ok).toBe(true); expect(result.bars).toEqual([{ ...a, time: 1704153600 }]);
    expect(result.dataset?.provenance.adjustment).toBe('unknown');
    expect(result.dataset?.provenance.providerId).toBe('local-import');
  });
  it('round trips numerical bars without changing prices or timestamps', () => {
    const fixture = makeFixture('IMPORT', 50);
    expect(parseCsv(barsToCsv(fixture)).bars).toEqual(fixture);
    expect(parseJson(JSON.stringify({ bars: fixture })).bars).toEqual(fixture);
  });
  it('sorts rows explicitly and removes identical duplicates only', () => {
    const result = json([b, a, a]);
    expect(result.ok).toBe(true); expect(result.bars).toEqual([a, b]);
    expect(result.diagnostics.map(d => d.code)).toEqual(['SORTED', 'DUPLICATE_REMOVED']);
    expect(json([b, a], { sort: false }).ok).toBe(false);
    expect(json([a, a], { duplicatePolicy: 'reject' }).ok).toBe(false);
    expect(json([a, { ...a, close: 11 }]).ok).toBe(false);
    const replaced = json([a, { ...a, close: 11 }], { duplicatePolicy: 'keep-last' });
    expect(replaced.ok).toBe(true); expect(replaced.bars[0].close).toBe(11);
    expect(replaced.diagnostics[0].code).toBe('DUPLICATE_REPLACED');
  });
  it('rejects bad records atomically instead of silently inventing values', () => {
    for (const override of [{ volume: null }, { volume: '' }, { volume: -1 }, { low: 20 }, { close: 0 }, { open: true }, { high: 'NaN' }, { time: null }]) {
      const result = json([a, { ...b, ...override }]);
      expect(result.ok).toBe(false); expect(result.bars).toEqual([]); expect(result.dataset).toBeUndefined();
    }
    expect(json([{ ...a, volume: 0 }]).ok).toBe(true);
  });
  it('validates dates, explicit timezone and timestamp units', () => {
    for (const time of ['2024-02-30', '2024-02-30T09:30:00Z', '2024-01-02T09:30:00', '2024-01-02T09:30:00.123Z', 1704153600000]) expect(json([{ ...a, time }]).ok).toBe(false);
    expect(json([{ ...a, time: 1704153600000 }], { timestampUnit: 'milliseconds' }).bars[0].time).toBe(1704153600);
    expect(json([{ ...a, time: '2024-01-02T09:30:00-05:00' }]).bars[0].time).toBe(1704205800);
    expect(json([{ ...a, time: '1960-01-01' }]).bars[0].time).toBe(-315619200);
    expect(json([{ ...a, time: '-315619200' }]).bars[0].time).toBe(-315619200);
    expect(json([{ ...a, time: '0001-01-01T00:00:00+01:00' }]).ok).toBe(false);
    expect(json([{ ...a, time: '9999-12-31T23:59:59-01:00' }]).ok).toBe(false);
    expect(json([{ ...a, time: '0001-01-01T01:00:00+01:00' }]).bars[0].time).toBe(-62135596800);
    expect(json([{ ...a, time: '9999-12-31T22:59:59-01:00' }]).bars[0].time).toBe(253402300799);
  });
  it('rejects malformed structures, duplicate headers and oversized inputs', () => {
    for (const text of ['null', '{}', '[null]', '[[]]', '[1]', '{"bars":"no"}']) expect(parseJson(text).ok).toBe(false);
    for (const text of ['time,open,high,low,close,volume,volume\n1,1,1,1,1,1,1', 'time,open,high,low,close,volume\n"bad,1,1,1,1,1', 'time,open,high,low,close,volume\n"1"bad,1,1,1,1,1', 'time,open,high,low,close,volume\n1,1,1']) expect(parseCsv(text).ok).toBe(false);
    expect(json([a, b], { maxRows: 1 }).ok).toBe(false);
    expect(parseCsv(barsToCsv([a]), undefined, { maxBytes: 10 }).ok).toBe(false);
    expect(json([]).ok).toBe(false);
  });
});

describe('fixed-duration aggregation', () => {
  it('preserves opening/closing order and sums actual volume without filling gaps', () => {
    const input = [a, b, c], copy = structuredClone(input);
    expect(aggregateBars(input, 180)).toEqual([{ time: 0, open: 10, high: 14, low: 9, close: 11, volume: 300 }, { ...c, time: 180 }]);
    expect(aggregateBars([a, { ...c, time: 1200 }], 180)).toEqual([{ ...a, time: 0 }, { ...c, time: 1080 }]);
    expect(input).toEqual(copy);
  });
  it('supports explicit anchors and rejects ambiguous chronology', () => {
    expect(aggregateBars([a, b, c], 300, 60)).toEqual([{ time: 60, open: 10, high: 16, low: 9, close: 15, volume: 350 }]);
    expect(() => aggregateBars([a, a], 60)).toThrow('unique chronological');
    expect(() => aggregateBars([b, a], 60)).toThrow('unique chronological');
    for (const value of [0, -1, 1.5, NaN, Infinity]) expect(() => aggregateBars([], value)).toThrow();
  });
});
