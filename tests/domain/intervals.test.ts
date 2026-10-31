import { describe, expect, it } from 'vitest';
import { aggregateInterval, chooseIntervalSource, probeIntervalSource, createIntervalMenuState, DEFAULT_AGGREGATION_POLICY, editIntervalMenu, intervalDatasetKey, intervalMenuEntries, parseInterval, restoreIntervalDerivation, restoreIntervalMenuState } from '../../src/domain/intervals';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { Bar, BarDataset } from '../../src/domain/types';

const bar = (time: number, open = 10, high = 12, low = 9, close = 11, volume = 100): Bar => ({ time, open, high, low, close, volume });
function data(bars: Bar[], resolution = '1m'): BarDataset { return { ...fixtureDataset('GME', 1), bars, resolution }; }
const sec = (date: string) => Date.parse(date + 'T00:00:00Z') / 1000;

describe('interval parsing and isolated menu customization', () => {
  it('distinguishes months/minutes, canonicalizes hours and rejects unsupported or malformed inputs', () => {
    expect(parseInterval('2.5h').id).toBe('150m'); expect(parseInterval('1.15h').id).toBe('69m'); expect(parseInterval(' 45 ').id).toBe('45m');
    expect(parseInterval('3M').unit).toBe('month'); expect(parseInterval('3m').unit).toBe('minute'); expect(parseInterval('D').id).toBe('1D');
    expect(parseInterval('24H').id).toBe('1440m'); expect(parseInterval('10T').kind).toBe('event');
    for (const input of ['', '0', '-1m', '1.1m', '0.01h', '60s', '2s', '1441', '366D', '53W', '13M', '2T', '1foo', '1e3', '1'.repeat(41)]) expect(() => parseInterval(input), input).toThrow();
  });
  it('keeps favorites/customization in an atomic draft, supports unhide/reset and deep restore', () => {
    const saved = createIntervalMenuState(), before = JSON.stringify(saved);
    let draft = editIntervalMenu(saved, { type: 'add', interval: '205' });
    draft = editIntervalMenu(draft, { type: 'favorite', interval: '205m' });
    expect(draft.custom).toEqual(['205m']); expect(draft.favorites).toEqual(['205m']); expect(JSON.stringify(saved)).toBe(before);
    draft = editIntervalMenu(draft, { type: 'hide', interval: '205m' }); expect(draft.favorites).toEqual([]); expect(intervalMenuEntries(draft).some(row => row.id === '205m')).toBe(false);
    draft = editIntervalMenu(draft, { type: 'add', interval: '205' }); expect(draft.custom).toEqual(['205m']); expect(draft.hidden).toEqual([]);
    const restored = restoreIntervalMenuState(JSON.parse(JSON.stringify(draft))); restored.policy.weekStartsOn = 0; expect(draft.policy.weekStartsOn).toBe(1);
    expect(() => editIntervalMenu(draft, { type: 'add', interval: 'nonsense' })).toThrow(); expect(draft.custom).toEqual(['205m']);
    expect(editIntervalMenu(draft, { type: 'reset' })).toEqual(saved);
    expect(() => restoreIntervalMenuState({ ...saved, custom: ['205', '205m'] })).toThrow('Duplicate');
    expect(() => restoreIntervalMenuState({ ...saved, favorites: ['1D'], hidden: ['1D'] })).toThrow('overlap');
    expect(() => restoreIntervalMenuState({ ...saved, surprise: true })).toThrow('Unknown');
  });
});

describe('exact sources and explicit identity', () => {
  it('prefers an exact normalized source and preserves source data/provenance without aliasing', () => {
    const fine = data([bar(0)]), exact = data([bar(0, 20, 24, 19, 23, 900)], '1h'); exact.provenance.datasetId = 'exact-hour';
    const result = chooseIntervalSource([fine, exact], { instrumentId: fine.instrument.id, target: '60' });
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.kind).toBe('exact'); expect(result.dataset).toEqual(exact); result.dataset.bars[0].close = 21; expect(exact.bars[0].close).toBe(23);
    expect(chooseIntervalSource([fine], { instrumentId: fine.instrument.id, target: '60m' })).toMatchObject({ ok: false, code: 'SOURCE_REQUIRED' });
  });
  it('rejects ambiguous providers/corrections and never substitutes the same ticker with a different identity', () => {
    const first = data([bar(0)]), other = structuredClone(first); other.provenance.providerId = 'other'; other.provenance.providerName = 'Other source';
    expect(chooseIntervalSource([first, other], { instrumentId: first.instrument.id, target: '1m' })).toMatchObject({ ok: false, code: 'AMBIGUOUS_SOURCE' });
    expect(chooseIntervalSource([first, other], { instrumentId: first.instrument.id, target: '1m', sourceKey: intervalDatasetKey(other) })).toMatchObject({ ok: true, kind: 'exact', dataset: { provenance: { providerId: 'other' } } });
    expect(chooseIntervalSource([first, first], { instrumentId: first.instrument.id, target: '1m', sourceKey: intervalDatasetKey(first) })).toMatchObject({ ok: false, code: 'AMBIGUOUS_SOURCE' });
    expect(chooseIntervalSource([first], { instrumentId: 'REAL:GME', target: '1m' }).ok).toBe(false);
    expect(chooseIntervalSource([first], { instrumentId: first.instrument.id, target: '1m', sourceKey: 'missing' })).toMatchObject({ ok: false, code: 'SOURCE_UNAVAILABLE' });
  });
});

describe('independent local aggregation oracles', () => {
  it('computes hand-calculated OHLCV, records coverage and preserves source/fixture labels', () => {
    const source = data([bar(0), bar(60, 11, 14, 10, 13, 200), bar(120, 13, 15, 12, 14, 300), bar(180, 14, 16, 13, 15, 400)]), before = structuredClone(source);
    const result = aggregateInterval(source, '3m');
    expect(result.dataset.bars).toEqual([bar(0, 10, 15, 9, 14, 600), bar(180, 14, 16, 13, 15, 400)]);
    expect(result.derivation!.buckets.map(row => [row.observedBars, row.expectedClockSlots, row.clockCoverage, row.terminal])).toEqual([[3, 3, 'full-clock', false], [1, 3, 'partial-clock', true]]);
    expect(result.derivation!.buckets[0]).toMatchObject({ start: 0, end: 180, sourceFirstIndex: 0, sourceLastIndex: 2, sourceFirstTime: 0, sourceLastTime: 120, availableAt: null, completion: 'unknown' });
    expect(source).toEqual(before); expect(result.dataset.provenance.fixture).toBe(true); expect(result.dataset.provenance.adjustment).toBe(source.provenance.adjustment);
    expect(result.dataset.provenance.session).toBe(source.provenance.session); expect(result.dataset.provenance.datasetId).not.toBe(source.provenance.datasetId);
    expect(result.dataset.bars.reduce((sum, item) => sum + item.volume, 0)).toBe(1000);
  });
  it('does not fill absent clock buckets, and uses floor division before the Unix epoch', () => {
    const gap = aggregateInterval(data([bar(0), bar(600)]), '3m'); expect(gap.dataset.bars.map(row => row.time)).toEqual([0, 540]);
    expect(gap.coverage.partialClockBuckets).toBe(2);
    expect(aggregateInterval(data([bar(-120), bar(-60)]), '3m').dataset.bars).toEqual([bar(-180, 10, 12, 9, 11, 200)]);
    expect(aggregateInterval(data([bar(30), bar(90), bar(150)]), '3m', { ...DEFAULT_AGGREGATION_POLICY, fixedAnchor: 30 }).dataset.bars[0].time).toBe(30);
  });
  it('uses true leap-month lengths and calendar boundaries rather than thirty-day approximations', () => {
    const source = data([bar(sec('2024-02-28')), bar(sec('2024-02-29'), 11, 14, 10, 13, 200), bar(sec('2024-03-01'), 13, 15, 12, 14, 300)], '1D');
    const result = aggregateInterval(source, '1M');
    expect(result.dataset.bars).toEqual([bar(sec('2024-02-01'), 10, 14, 9, 13, 300), bar(sec('2024-03-01'), 13, 15, 12, 14, 300)]);
    expect(result.derivation!.buckets.map(row => row.expectedClockSlots)).toEqual([29, 31]);
    const quarterly = aggregateInterval(data([bar(sec('2024-01-01')), bar(sec('2024-02-01')), bar(sec('2024-03-01')), bar(sec('2024-04-01'))], '1M'), '3M');
    expect(quarterly.dataset.bars.map(row => [row.time, row.volume])).toEqual([[sec('2024-01-01'), 300], [sec('2024-04-01'), 100]]);
  });
  it('distinguishes Monday/Sunday week starts and explicitly anchored multiweek/day groups', () => {
    const source = data([bar(sec('2026-01-04')), bar(sec('2026-01-05'))], '1D');
    expect(aggregateInterval(source, '1W').dataset.bars.map(row => row.time)).toEqual([sec('2025-12-29'), sec('2026-01-05')]);
    expect(aggregateInterval(source, '1W', { ...DEFAULT_AGGREGATION_POLICY, weekStartsOn: 0 }).dataset.bars).toEqual([bar(sec('2026-01-04'), 10, 12, 9, 11, 200)]);
    const twoWeeks = aggregateInterval(data([bar(sec('1970-01-11')), bar(sec('1970-01-12'))], '1D'), '2W'); expect(twoWeeks.dataset.bars.map(row => row.time)).toEqual([-259200, 950400]);
    expect(aggregateInterval(data([bar(0), bar(345600), bar(432000)], '1D'), '5D').dataset.bars.map(row => [row.time, row.volume])).toEqual([[0, 200], [432000, 100]]);
  });
  it('separates midnight UTC days while refusing to split a source bar across a boundary', () => {
    const t = sec('2026-01-02'); expect(aggregateInterval(data([bar(t - 60), bar(t)]), '1D').dataset.bars.map(row => row.time)).toEqual([t - 86400, t]);
    expect(() => aggregateInterval(data([bar(t - 60)], '3m'), '1D')).toThrow('crosses');
    expect(() => aggregateInterval(data([bar(0), bar(180)], '3m'), '5m')).toThrow('crosses');
    expect(() => aggregateInterval(data([bar(0), bar(30)], '1m'), '5m')).toThrow('overlap');
  });
  it('refuses fabricated finer bars, unknown/multiperiod anchors, event resampling and recursive aggregation', () => {
    expect(() => aggregateInterval(data([bar(0)], '1D'), '60m')).toThrow('Finer');
    expect(() => aggregateInterval(data([bar(0)], '5m'), '1m')).toThrow('Finer');
    expect(() => aggregateInterval(data([bar(0)], '2D'), '1W')).toThrow('original period anchors');
    expect(() => aggregateInterval(data([bar(0)], 'user-supplied'), '1W')).toThrow();
    expect(() => aggregateInterval(data([bar(0)]), '10T')).toThrow('actual event');
    expect(() => aggregateInterval(aggregateInterval(data([bar(0)]), '5m').dataset, '15m')).toThrow('original source');
    expect(() => aggregateInterval(data([bar(0)]), '5m', { ...DEFAULT_AGGREGATION_POLICY, timezone: 'America/New_York' as 'UTC' })).toThrow('Exchange calendar');
  });
  it('changes derived revision when a source correction changes values, while retaining source selection and dataset identity', () => {
    const source = data([bar(0), bar(60)]), first = aggregateInterval(source, '5m'), corrected = structuredClone(source); corrected.bars[1].close = 10;
    const next = aggregateInterval(corrected, '5m'); expect(first.dataset.provenance.datasetId).toBe(next.dataset.provenance.datasetId); expect(first.dataset.provenance.revision).not.toBe(next.dataset.provenance.revision);
    expect(intervalDatasetKey(source)).toBe(intervalDatasetKey(corrected));
    const rebased = structuredClone(source); rebased.provenance.adjustment = 'split-adjusted'; expect(aggregateInterval(rebased, '5m').dataset.provenance.revision).not.toBe(first.dataset.provenance.revision);
    expect(JSON.parse(JSON.stringify(first.dataset))).toEqual(first.dataset);
    expect(chooseIntervalSource([first.dataset], { instrumentId: source.instrument.id, target: '5m' })).toMatchObject({ ok: true, kind: 'exact', derivation: { historicalAvailability: 'unknown' } });
  });
  it('deeply restores bounded lineage, rejecting inconsistent IDs, claimed availability and missing source coverage', () => {
    const result = aggregateInterval(data([bar(0), bar(60), bar(600)]), '5m'), saved = JSON.parse(JSON.stringify(result.derivation));
    expect(restoreIntervalDerivation(saved, result.dataset)).toEqual(result.derivation);
    const restored = restoreIntervalDerivation(saved); restored.buckets[0].sourceLastIndex = 999; expect(saved.buckets[0].sourceLastIndex).toBe(1);
    for (const change of [(value: any) => { value.buckets[0].completion = 'closed'; }, (value: any) => { value.buckets[0].availableAt = 0; }, (value: any) => { value.buckets[1].sourceFirstIndex = 3; }, (value: any) => { value.buckets[0].expectedClockSlots = 2; }, (value: any) => { value.buckets[0].end = 301; }, (value: any) => { value.sourceDatasetId = 'other'; }]) { const invalid = structuredClone(saved); change(invalid); expect(() => restoreIntervalDerivation(invalid, result.dataset)).toThrow(); }
    const wrongDataset = structuredClone(result.dataset); wrongDataset.provenance.revision = 'wrong'; expect(() => restoreIntervalDerivation(saved, wrongDataset)).toThrow('disagree');
    const malformed = structuredClone(result.dataset) as any; delete malformed.derivation; expect(chooseIntervalSource([malformed], { instrumentId: malformed.instrument.id, target: '5m' }).ok).toBe(false);
    const fullClock = aggregateInterval(data([bar(0), bar(60), bar(120)]), '3m').derivation!;
    fullClock.buckets[0].sourceFirstTime = 1; fullClock.buckets[0].sourceLastTime = 121;
    expect(() => restoreIntervalDerivation(fullClock)).toThrow('source windows');
    fullClock.buckets[0].sourceLastTime = 120;
    expect(() => restoreIntervalDerivation(fullClock)).toThrow('source windows');
  });
  it('rejects invalid source values, unsafe sums and out-of-range boundaries atomically', () => {
    for (const bad of [data([]), data([bar(0), bar(0)]), data([bar(60), bar(0)]), data([bar(0, 10, 8)]), data([bar(0, 10, 12, 9, 11, -1)]), data([bar(0, 10, 12, 9, 11, Number.MAX_SAFE_INTEGER), bar(60)])]) expect(() => aggregateInterval(bad, '5m')).toThrow();
    expect(() => aggregateInterval(data([bar(-62135596800)], '1D'), '1W', { ...DEFAULT_AGGREGATION_POLICY, weekStartsOn: 0 })).toThrow('outside years');
    expect(() => aggregateInterval(data([bar(0)]), '5m', { ...DEFAULT_AGGREGATION_POLICY, calendarAnchor: '2024-02-30' })).toThrow('Invalid calendar');
  });
});

describe('PERF8 bar scan memo', () => {
  it('keeps fingerprints and validation errors exact after in-place edits and appends', () => {
    const base = { instrument: { id: 'X', currency: 'USD', timezone: 'UTC' }, resolution: '1h', bars: Array.from({ length: 40 }, (_, i) => ({ time: 1_699_200_000 + i * 3600, open: 10 + i, high: 12 + i, low: 9 + i, close: 11 + i, volume: 100 + i })), provenance: { providerId: 'p', providerName: 'P', datasetId: 'd', revision: 'r1', adjustment: 'raw', session: 'regular', timezone: 'UTC', asOf: '2024-01-01', fixture: true, notes: [], coverage: 'c' } } as any;
    const a = aggregateInterval(base, '4h');
    const again = aggregateInterval(base, '4h');
    expect(again.derivation!.contentFingerprint).toBe(a.derivation!.contentFingerprint);
    base.bars[5].close += 0.25;
    const edited = aggregateInterval(base, '4h');
    expect(edited.derivation!.contentFingerprint).not.toBe(a.derivation!.contentFingerprint);
    base.bars[7].low = 20;
    expect(() => aggregateInterval(base, '4h')).toThrow(/consistent positive/);
    base.bars[7].low = 16;
    base.bars.push({ time: 1_699_200_000 + 40 * 3600, open: 50, high: 51, low: 49, close: 50, volume: 1 });
    expect(aggregateInterval(base, "4h").derivation!.inputBars).toBe(41);
  });
  it('probeIntervalSource agrees with chooseIntervalSource without copying the cached result', () => {
    const base = { instrument: { id: 'X', currency: 'USD', timezone: 'UTC' }, resolution: '1h', bars: Array.from({ length: 40 }, (_, i) => ({ time: 1_699_200_000 + i * 3600, open: 10 + i, high: 12 + i, low: 9 + i, close: 11 + i, volume: 100 + i })), provenance: { providerId: 'p', providerName: 'P', datasetId: 'd', revision: 'r1', adjustment: 'raw', session: 'regular', timezone: 'UTC', asOf: '2024-01-01', fixture: true, notes: [], coverage: 'c' } } as any;
    for (const target of ['1h', '4h', '30m']) {
      const request = { instrumentId: 'X', target };
      const chosen = chooseIntervalSource([base], request), probed = probeIntervalSource([base], request);
      expect(probed).toEqual(chosen);
    }
    expect((probeIntervalSource([base], { instrumentId: 'X', target: '1h' }) as any).dataset).toBe(base);
    expect((chooseIntervalSource([base], { instrumentId: 'X', target: '1h' }) as any).dataset).not.toBe(base);
  });
});
