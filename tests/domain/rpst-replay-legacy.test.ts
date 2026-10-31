// Replay with content revisions: a replay saved on a derived
// interval of a legacy local import continues like the import itself, and the adopted revision is handed back as
// a saved record so the legacy notice shows once.
import { describe, expect, it } from 'vitest';
import { LEGACY_LOCAL_IMPORT_REVISION, LOCAL_IMPORT_LEGACY_NOTICE, parseCsv } from '../../src/domain/data';
import { aggregateInterval } from '../../src/domain/intervals';
import { closeReplay, continueReplaySession, openReplay, readReplaySavedSession, selectReplayStart, type ReplayParticipant, type ReplaySavedSession } from '../../src/domain/replay-session';
import type { Bar, BarDataset } from '../../src/domain/types';

const T0 = Date.UTC(2024, 0, 1) / 1000, NOW = Date.UTC(2026, 9, 14, 10) / 1000;
const hourly = (count: number, bump = 0): Bar[] => Array.from({ length: count }, (_, index) => { const base = 100 + index; return { time: T0 + index * 3600, open: base, high: base + 2 + (index === count - 1 ? bump : 0), low: base - 1, close: base + 1, volume: 10 + index }; });
const imported = (bars: readonly Bar[]): BarDataset => parseCsv('time,open,high,low,close,volume\n' + bars.map(bar => [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].join(',')).join('\n') + '\n', undefined, { resolution: '1h' }).dataset!;
const legacy = (dataset: BarDataset): BarDataset => ({ ...dataset, provenance: { ...dataset.provenance, revision: LEGACY_LOCAL_IMPORT_REVISION } });
const participant = (dataset: BarDataset): ReplayParticipant => ({ cellId: 'c1', instrumentId: dataset.instrument.id, symbol: dataset.instrument.symbol, interval: dataset.resolution, chartType: 'candles', datasetId: dataset.provenance.datasetId, revision: dataset.provenance.revision });
function saved(dataset: BarDataset): ReplaySavedSession {
  let session = openReplay({ participants: [participant(dataset)], activeCellId: 'c1', sessionId: 'leg' });
  session = selectReplayStart(session, dataset, dataset.bars[2].time, '1h');
  return closeReplay(session, NOW).saved!;
}

describe('DRR-2: derived interval of a legacy import', () => {
  it('continues with the legacy notice when the derived content is unchanged, like the import itself', () => {
    const source = imported(hourly(48)), derived = aggregateInterval(source, '4h').dataset, legacyDerived = aggregateInterval(legacy(source), '4h').dataset;
    expect(legacyDerived.provenance.datasetId).toBe(derived.provenance.datasetId); expect(legacyDerived.provenance.revision).not.toBe(derived.provenance.revision);
    const notices: string[] = [], restored = continueReplaySession(saved(legacyDerived), [source, derived], {}, '1h', { onNotice: message => notices.push(message) });
    expect(notices).toEqual([LOCAL_IMPORT_LEGACY_NOTICE]); expect(restored.participants[0].revision).toBe(derived.provenance.revision);
  });
  it('still refuses when the re-imported content differs, or the import is not loaded', () => {
    const source = imported(hourly(48)), legacyDerived = aggregateInterval(legacy(source), '4h').dataset, changed = imported(hourly(48, 1));
    expect(() => continueReplaySession(saved(legacyDerived), [changed, aggregateInterval(changed, '4h').dataset], {}, '1h')).toThrow('revised');
    expect(() => continueReplaySession(saved(legacyDerived), [aggregateInterval(source, '4h').dataset], {}, '1h')).toThrow('revised');
  });
});

describe('DRR-4: the adopted revision is handed back for saving, so the notice shows once', () => {
  it('onAdopt receives a valid saved record with current revisions; continuing from it is silent', () => {
    const current = imported(hourly(30)), notices: string[] = [], adopted: ReplaySavedSession[] = [];
    const record = saved(legacy(current));
    continueReplaySession(record, [current], {}, '1h', { onNotice: message => notices.push(message), onAdopt: next => adopted.push(next) });
    expect(adopted).toHaveLength(1); expect(readReplaySavedSession(JSON.parse(JSON.stringify(adopted[0])))).toEqual(adopted[0]);
    const canonical = readReplaySavedSession(record); expect(adopted[0]).toEqual({ ...canonical, participants: [{ ...canonical.participants[0], revision: current.provenance.revision }] });
    continueReplaySession(adopted[0], [current], {}, '1h', { onNotice: message => notices.push(message), onAdopt: next => adopted.push(next) });
    expect(notices).toHaveLength(1); expect(adopted).toHaveLength(1);
  });
});

describe('RPR-15: callbacks fire only after the continue is certain', () => {
  it('an invalid interval throws before onNotice or onAdopt', () => {
    const current = imported(hourly(30)), notices: string[] = [], adopted: ReplaySavedSession[] = [];
    expect(() => continueReplaySession(saved(legacy(current)), [current], {}, 'not-an-interval', { onNotice: message => notices.push(message), onAdopt: next => adopted.push(next) })).toThrow();
    expect(notices).toEqual([]); expect(adopted).toEqual([]);
  });
});
