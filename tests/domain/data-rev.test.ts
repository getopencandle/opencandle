// Local imports carry a deterministic content revision so replay and alert "source was revised" guards
// can fire, while records saved against the legacy constant revision '1' keep working (our own legacy policy).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_LOCAL_IMPORT_REVISION, LOCAL_IMPORT_LEGACY_NOTICE, isLegacyLocalRevision, localImportRevision, parseCsv, parseJson } from '../../src/domain/data';
import { createImportDraft, prepareImportDraft, type ImportDraft } from '../../src/domain/data-setup';
import { closeReplay, continueReplaySession, openReplay, readReplaySavedSession, selectReplayStart, type ReplayParticipant } from '../../src/domain/replay-session';
import { createAlertObservationSession, observeAlertSnapshot, validateAlertObservation } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { Bar, BarDataset } from '../../src/domain/types';

const a: Bar = { time: 60, open: 10, high: 13, low: 9, close: 12, volume: 100 };
const b: Bar = { time: 120, open: 12, high: 14, low: 10, close: 11, volume: 200 };
const T0 = Date.UTC(2024, 0, 1) / 1000, NOW = Date.UTC(2026, 9, 14, 10) / 1000;
const csv = (bars: readonly Bar[]) => 'time,open,high,low,close,volume\n' + bars.map(bar => [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume].join(',')).join('\n') + '\n';
function hourly(count: number, bump = 0): Bar[] {
  return Array.from({ length: count }, (_, index) => { const base = 100 + index; return { time: T0 + index * 3600, open: base, high: base + 2 + (index === count - 1 ? bump : 0), low: base - 1, close: base + 1, volume: 10 + index }; });
}
function imported(bars: readonly Bar[]): BarDataset {
  const result = parseCsv(csv(bars), undefined, { resolution: '1h' });
  expect(result.ok).toBe(true);
  return result.dataset!;
}
function participant(dataset: BarDataset, cellId = 'c1'): ReplayParticipant {
  return { cellId, instrumentId: dataset.instrument.id, symbol: dataset.instrument.symbol, interval: dataset.resolution, chartType: 'candles', datasetId: dataset.provenance.datasetId, revision: dataset.provenance.revision };
}
function savedReplay(dataset: BarDataset) {
  let session = openReplay({ participants: [participant(dataset)], activeCellId: 'c1', sessionId: 's1' });
  session = selectReplayStart(session, dataset, dataset.bars[5].time, '1h');
  return closeReplay(session, NOW).saved!;
}
const legacy = (dataset: BarDataset): BarDataset => ({ ...dataset, provenance: { ...dataset.provenance, revision: LEGACY_LOCAL_IMPORT_REVISION } });

afterEach(() => { vi.useRealTimers(); });

describe('DATA-REV-1 local import content revision', () => {
  it('is deterministic, content-based, pinned across restarts and keeps the dataset id format', () => {
    const first = parseCsv(csv([a, b])).dataset!;
    expect(first.provenance.revision).toBe('local-v1:73426a29eb39b367');
    expect(first.provenance.datasetId).toBe('local:LOCAL:IMPORTED');
    expect(localImportRevision([a, b])).toBe(first.provenance.revision);
    // Same bars through another format, row order and duplicate rows: same content, same revision.
    expect(parseJson(JSON.stringify([b, a, a])).dataset!.provenance.revision).toBe(first.provenance.revision);
    expect(parseCsv('date,open,high,low,close,volume\n1970-01-01T00:01:00Z,10.0,13,9,12,100\n1970-01-01T00:02:00+00:00,12,14,10,11,2e2\n').dataset!.provenance.revision).toBe(first.provenance.revision);
  });
  it('changes when any imported value changes', () => {
    const base = localImportRevision([a, b]);
    for (const key of ['time', 'open', 'high', 'low', 'close', 'volume'] as const) {
      const changed = { ...b, [key]: key === 'low' ? b[key] - 0.5 : key === 'time' ? b[key] + 1 : b[key] + 0.5 };
      expect(parseJson(JSON.stringify([a, changed])).dataset!.provenance.revision).not.toBe(base);
    }
    expect(localImportRevision([a])).not.toBe(base);
    expect(localImportRevision([])).toMatch(/^local-v1:[0-9a-f]{16}$/);
  });
  it('never reads the import clock', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const early = parseCsv(csv([a, b])).dataset!.provenance.revision;
    vi.setSystemTime(new Date('2031-06-01T12:34:56Z'));
    expect(parseCsv(csv([a, b])).dataset!.provenance.revision).toBe(early);
  });
  it('data setup imports inherit the content revision independent of the import time and labels', () => {
    const draft = (patch: Partial<ImportDraft> = {}): ImportDraft => ({ ...createImportDraft(), symbol: 'TEST', resolution: '1h', text: csv(hourly(10)), ...patch });
    const one = prepareImportDraft(draft(), { now: NOW, existing: [] }).dataset!;
    const two = prepareImportDraft(draft({ sourceLabel: 'Another label', fileName: 'other.csv' }), { now: NOW + 86400, existing: [] }).dataset!;
    expect(one.provenance.datasetId).toBe(`local:${one.instrument.id}`);
    expect(one.provenance.revision).toBe(localImportRevision(one.bars));
    expect(two.provenance.revision).toBe(one.provenance.revision);
    expect(prepareImportDraft(draft({ text: csv(hourly(10, 1)) }), { now: NOW, existing: [] }).dataset!.provenance.revision).not.toBe(one.provenance.revision);
  });
  it('legacy detection only matches the old constant against a hashed local import', () => {
    const hashed = imported(hourly(4));
    expect(isLegacyLocalRevision('1', hashed)).toBe(true);
    expect(isLegacyLocalRevision(hashed.provenance.revision, hashed)).toBe(false);
    expect(isLegacyLocalRevision('2', hashed)).toBe(false);
    expect(isLegacyLocalRevision('1', legacy(hashed))).toBe(false);
    expect(isLegacyLocalRevision('1', fixtureDataset('GME', 3))).toBe(false);
    expect(isLegacyLocalRevision('1', { ...hashed, provenance: { ...hashed.provenance, datasetId: 'other:x' } })).toBe(false);
  });
});

describe('DATA-REV-1 replay guards', () => {
  it('a re-import with different content fires the saved-session and start-selection guards', () => {
    const original = imported(hourly(30)), reimported = imported(hourly(30, 1));
    expect(reimported.provenance.datasetId).toBe(original.provenance.datasetId);
    expect(reimported.provenance.revision).not.toBe(original.provenance.revision);
    const saved = savedReplay(original);
    expect(() => continueReplaySession(saved, [reimported], {}, '1h')).toThrow('The saved IMPORTED source was revised. Start a new replay.');
    const session = openReplay({ participants: [participant(original)], activeCellId: 'c1', sessionId: 's2' });
    expect(() => selectReplayStart(session, reimported, reimported.bars[3].time, '1h')).toThrow('The chart source changed');
  });
  it('a re-import with identical content resumes silently', () => {
    const original = imported(hourly(30)), notices: string[] = [];
    const restored = continueReplaySession(savedReplay(original), [imported(hourly(30))], {}, '1h', { onNotice: message => notices.push(message) });
    expect(restored.phase).toBe('active'); expect(notices).toEqual([]);
  });
  it('a session saved against legacy revision 1 continues on hashed data with one plain notice', () => {
    const current = imported(hourly(30)), saved = savedReplay(legacy(current)), notices: string[] = [];
    expect(saved.participants[0].revision).toBe('1');
    expect(readReplaySavedSession(JSON.parse(JSON.stringify(saved))).participants[0].revision).toBe('1');
    const restored = continueReplaySession(saved, [current], {}, '1h', { onNotice: message => notices.push(message) });
    expect(notices).toEqual([LOCAL_IMPORT_LEGACY_NOTICE]);
    expect(LOCAL_IMPORT_LEGACY_NOTICE).not.toMatch(/—|local-v1|revision/);
    // The participant adopts the current revision, so later guards hold and the notice is not repeated.
    expect(restored.participants[0].revision).toBe(current.provenance.revision);
    expect(selectReplayStart(restored, current, current.bars[8].time, '1h').phase).toBe('active');
    const again = closeReplay(restored, NOW + 1).saved!;
    continueReplaySession(again, [current], {}, '1h', { onNotice: message => notices.push(message) });
    expect(notices).toHaveLength(1);
    // Without a notice sink it still continues (no crash).
    expect(continueReplaySession(saved, [current], {}, '1h').phase).toBe('active');
  });
  it('legacy tolerance does not weaken real revision changes or non-import sources', () => {
    const current = imported(hourly(30)), saved = savedReplay(current);
    expect(() => continueReplaySession({ ...saved, participants: [{ ...saved.participants[0], revision: '2' }] }, [current], {}, '1h')).toThrow('revised');
    const fixture = { ...fixtureDataset('GME', 40), resolution: '1D' };
    const fixtureSaved = savedReplay({ ...fixture, provenance: { ...fixture.provenance, revision: '1' } });
    expect(() => continueReplaySession(fixtureSaved, [{ ...fixture, provenance: { ...fixture.provenance, revision: '2' } }], {}, '1D')).toThrow('revised');
  });
});

describe('DATA-REV-1 alert observation guards', () => {
  const replay = (dataset: BarDataset) => createAlertObservationSession(dataset, { sessionId: 'alert-1', mode: 'replay', startedAt: NOW - 10, replayRunId: 'run-1' });
  it('a re-import with different content fires the replay alert revision guard', () => {
    const original = imported(hourly(10)), state = replay(original);
    const ok = observeAlertSnapshot(state, { dataset: original, observedAt: NOW, barIndex: 2, replayRunId: 'run-1' });
    expect(ok.event).not.toBeNull();
    const revised = observeAlertSnapshot(ok.session, { dataset: imported(hourly(10, 1)), observedAt: NOW + 1, barIndex: 3, replayRunId: 'run-1' });
    expect(revised.event).toBeNull(); expect(revised.diagnostics[0]).toBe('Replay source revision changed. Start a new isolated replay session.');
  });
  it('a replay alert session started on legacy revision 1 continues on hashed data with one notice', () => {
    const current = imported(hourly(10)), state = replay(legacy(current));
    expect(state.initialRevision).toBe('1');
    const first = observeAlertSnapshot(state, { dataset: current, observedAt: NOW, barIndex: 2, replayRunId: 'run-1' });
    expect(first.event).not.toBeNull();
    expect(first.diagnostics).toContain(LOCAL_IMPORT_LEGACY_NOTICE);
    expect(first.session.initialRevision).toBe(current.provenance.revision);
    const second = observeAlertSnapshot(first.session, { dataset: current, observedAt: NOW + 1, barIndex: 3, replayRunId: 'run-1' });
    expect(second.event).not.toBeNull(); expect(second.diagnostics).not.toContain(LOCAL_IMPORT_LEGACY_NOTICE);
    // A genuine change after adoption still fires the guard.
    expect(observeAlertSnapshot(second.session, { dataset: imported(hourly(10, 1)), observedAt: NOW + 2, barIndex: 4, replayRunId: 'run-1' }).diagnostics[0]).toContain('revision changed');
  });
  it('an ordinary alert session from legacy revision 1 continues; the change is a restart of crossing history, not a crash', () => {
    const current = imported(hourly(10)), old = legacy(current);
    const state = createAlertObservationSession(old, { sessionId: 'alert-2', mode: 'ordinary', startedAt: NOW - 10 });
    const before = observeAlertSnapshot(state, { dataset: old, observedAt: NOW });
    expect(before.event).not.toBeNull();
    const after = observeAlertSnapshot(before.session, { dataset: current, observedAt: NOW + 1 });
    expect(after.event).not.toBeNull();
    expect(after.event!.observation!.correction).toBe(true);
    expect(after.diagnostics).toContain(LOCAL_IMPORT_LEGACY_NOTICE);
    expect(observeAlertSnapshot(after.session, { dataset: current, observedAt: NOW + 2, reason: 'explicit-evaluation' }).diagnostics).not.toContain(LOCAL_IMPORT_LEGACY_NOTICE);
  });
  it('stored observations with revision 1 still validate', () => {
    const old = legacy(imported(hourly(10)));
    const event = observeAlertSnapshot(createAlertObservationSession(old, { sessionId: 'alert-3', mode: 'ordinary', startedAt: NOW - 10 }), { dataset: old, observedAt: NOW }).event!;
    const stored = JSON.parse(JSON.stringify(event.observation));
    expect(stored.sourceRevision).toBe('1');
    expect(() => validateAlertObservation(stored)).not.toThrow();
  });
});
