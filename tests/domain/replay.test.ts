import { describe, expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { advanceReplay, createReplay, replayDataset, replayPrefix, seekReplay, seekReplayTime, setReplayPlaying, setReplaySpeed, stepReplay } from '../../src/domain/replay';
import { calculateIndicator } from '../../src/domain/indicators';

describe('historical replay information boundary', () => {
  it('returns only copied visible bars and never leaks the future tail', () => {
    const dataset = fixtureDataset('GME', 30), state = createReplay(dataset, 10), prefix = replayPrefix(dataset, state);
    expect(prefix).toHaveLength(11); expect(prefix.at(-1)).toEqual(dataset.bars[10]);
    const before = calculateIndicator('sma', prefix).series;
    dataset.bars[20].close = 999999;
    expect(calculateIndicator('sma', replayPrefix(dataset, state)).series).toEqual(before);
    prefix[0].close = 999999; expect(dataset.bars[0].close).not.toBe(999999);
    expect(replayDataset(dataset, state).provenance.notes.at(-1)).toContain('11 of 30');
  });
  it('steps, plays fractional elapsed time, changes speed and stops at the end', () => {
    const dataset = fixtureDataset('SPY', 10);
    let state = setReplayPlaying(createReplay(dataset, -1), true);
    state = advanceReplay(state, 400); expect(state.cursor).toBe(-1);
    state = advanceReplay(state, 600); expect(state.cursor).toBe(0);
    state = setReplaySpeed(state, 2); state = advanceReplay(state, 1250);
    expect(state.cursor).toBe(2); expect(state.remainderMilliseconds).toBe(250);
    state = advanceReplay(state, 250); expect(state.cursor).toBe(3);
    state = stepReplay(state, 50); expect(state.cursor).toBe(9); expect(state.playing).toBe(false);
    expect(setReplayPlaying(state, true).playing).toBe(false);
  });
  it('seeking resets the replay identity and does not change the ordinary dataset', () => {
    const dataset = fixtureDataset('GME', 20), original = structuredClone(dataset), initial = createReplay(dataset, 10);
    const back = seekReplay(initial, 2); expect(back.runId).not.toBe(initial.runId); expect(back.playing).toBe(false);
    expect(createReplay(dataset, 10).runId).not.toBe(initial.runId);
    expect(createReplay({ ...dataset, provenance: { ...dataset.provenance, revision: '2' } }, 10, initial.sessionId).runId).not.toBe(initial.runId);
    const dated = seekReplayTime(back, dataset, dataset.bars[7].time + 1); expect(dated.cursor).toBe(7); expect(dated.runId).not.toBe(back.runId);
    expect(seekReplayTime(dated, dataset, dataset.bars[0].time - 1).cursor).toBe(-1);
    expect(dataset).toEqual(original);
  });
  it('rejects revised datasets, impossible inputs and keeps empty histories stopped', () => {
    const dataset = fixtureDataset('GME', 10), state = createReplay(dataset);
    expect(() => replayPrefix({ ...dataset, provenance: { ...dataset.provenance, revision: '2' } }, state)).toThrow('revision');
    expect(() => seekReplay(state, 10)).toThrow(); expect(() => stepReplay(state, -1)).toThrow(); expect(() => setReplaySpeed(state, NaN)).toThrow(); expect(() => advanceReplay(state, -1)).toThrow();
    const empty = createReplay(fixtureDataset('EMPTY', 0)); expect(setReplayPlaying(empty, true).playing).toBe(false); expect(stepReplay(empty).cursor).toBe(-1);
  });
});
