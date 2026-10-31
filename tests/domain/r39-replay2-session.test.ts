// Speed catalog, saved-speed compatibility, Close while choosing a new start, the
// Step back hotkey and the seek policy text. Unit tests on SYNTHETIC rows; not GUI evidence.
import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import {
  REPLAY_SESSION_POLICIES, REPLAY_SPEEDS, REPLAY_SPEEDS_LV, beginReplayStartSelection, closeReplay, openReplay, readReplaySavedSession, replayShortcut,
  selectReplayStart, setReplaySessionSpeed,
} from '../../src/domain/replay-session';

const chart = fixtureDataset('RPL', 40);
const participant = { cellId: 'c1', instrumentId: chart.instrument.id, symbol: 'RPL', interval: '1D', chartType: 'candles', datasetId: chart.provenance.datasetId, revision: chart.provenance.revision };
const selecting = openReplay({ participants: [participant], activeCellId: 'c1', sessionId: 'r39' });
const active = selectReplayStart(selecting, chart, chart.bars[9].time, '1D');
const key = (name: string, extra: Partial<{ shiftKey: boolean; ctrlKey: boolean; altKey: boolean }> = {}) => ({ key: name, shiftKey: true, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, focus: 'chart' as const, ...extra });

describe(' speeds', () => {
  it('offers the the reference app speed range, 0.1x to 10x, slowest first', () => {
    expect(REPLAY_SPEEDS).toEqual([0.1, 0.3, 0.5, 1, 3, 5, 7, 10]);
    expect(REPLAY_SPEEDS_LV).toBe(REPLAY_SPEEDS);
  });
  it('every listed speed can be chosen; others are refused', () => {
    for (const speed of REPLAY_SPEEDS) expect(setReplaySessionSpeed(active, speed).stepsPerSecond).toBe(speed);
    expect(() => setReplaySessionSpeed(active, 2)).toThrow(/Unknown replay speed/);
    expect(openReplay({ participants: [participant], activeCellId: 'c1', stepsPerSecond: 0.1 }).stepsPerSecond).toBe(0.1);
  });
  it('a remembered session saved at the retired 2x speed still continues, at 3x', () => {
    const saved = closeReplay(active, 1).saved!;
    expect(readReplaySavedSession({ ...saved, stepsPerSecond: 2 }).stepsPerSecond).toBe(3);
    expect(() => readReplaySavedSession({ ...saved, stepsPerSecond: 4 })).toThrow(/speed/);
  });
});

describe(' Close while choosing a new start bar', () => {
  it('remembers the replay at its current bar instead of dropping it', () => {
    const choosing = beginReplayStartSelection(active);
    const closed = closeReplay(choosing, 5);
    expect(closed.saved).toMatchObject({ sessionId: 'r39', clock: active.clock, stepsPerSecond: active.stepsPerSecond });
  });
  it('a replay that never had a start bar is still not remembered', () => {
    expect(closeReplay(selecting, 5).saved).toBeNull();
  });
});

describe(' hotkeys', () => {
  it('Shift+Down plays or pauses, Shift+Right steps forward, Shift+Left steps back', () => {
    expect(replayShortcut(key('ArrowDown'), active)).toBe('toggle-play');
    expect(replayShortcut(key('ArrowRight'), active)).toBe('step');
    expect(replayShortcut(key('ArrowLeft'), active)).toBe('step-back');
  });
  it('they only act with chart focus, an active replay and Shift alone', () => {
    expect(replayShortcut(key('ArrowLeft'), selecting)).toBeNull();
    expect(replayShortcut(key('ArrowLeft'), null)).toBeNull();
    expect(replayShortcut(key('ArrowLeft', { altKey: true }), active)).toBeNull();
    expect(replayShortcut(key('ArrowLeft', { shiftKey: false }), active)).toBeNull();
    expect(replayShortcut({ ...key('ArrowLeft'), focus: 'text-input' }, active)).toBeNull();
  });
});

describe(' seek policy', () => {
  it('says the replay account carries across seeks and rewinds on a seek back', () => {
    const text = REPLAY_SESSION_POLICIES.join(' ');
    expect(text).toMatch(/replay account carries across seeks/i);
    expect(text).toMatch(/seek back returns the replay account to its state at that time/i);
    expect(text).not.toMatch(/OpenCandle-defined steps per second/);
  });
});
