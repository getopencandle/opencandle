import { expect, it } from 'vitest';
import { createMarketQueue, type MarketInput } from '../../src/chart/market-queue';

const input = (id: string, close: number): MarketInput => ({ bars: [{ time: 1700000000, open: close, high: close + 1, low: close - 1, close, volume: 1 }], source: { datasetId: id, revision: '1', fixture: true, label: id, resolution: '1D', inputIdentity: id + '-array' } });

it('a linked rollback cannot resurrect an earlier in-flight source that never committed', async () => {
  const original = input('original', 10); let state = structuredClone(original), release: () => void = () => {}, shouldFail = true;
  const queue = createMarketQueue({ read: () => state, write: next => { state = next; }, disposed: () => false, apply: async () => { if (state.source.datasetId === 'failed' && shouldFail) { shouldFail = false; await new Promise<void>(resolve => { release = resolve; }); throw new Error('earlier source failed'); } } });
  const failed = input('failed', 20), owned = input('owned', 30);
  const earlier = queue.set(failed.bars, failed.source).catch(error => error.message); await Promise.resolve();
  expect(state.source.datasetId).toBe('failed');
  const later = queue.setWithRollback(owned.bars, owned.source);
  release(); expect(await earlier).toBe('earlier source failed'); expect(await later.result).toEqual({ ok: true });
  expect(await later.rollback()).toEqual({ ok: true }); expect(state).toEqual(original);
});

it('a linked rollback retains the immediately preceding queued committed source', async () => {
  let state = input('original', 10), release: () => void = () => {}, waitFirst = true;
  const queue = createMarketQueue({ read: () => state, write: next => { state = next; }, disposed: () => false, apply: async () => { if (state.source.datasetId === 'first' && waitFirst) { waitFirst = false; await new Promise<void>(resolve => { release = resolve; }); } } });
  const first = input('first', 20), preceding = input('preceding', 30), owned = input('owned', 40);
  const firstTask = queue.set(first.bars, first.source); await Promise.resolve();
  const precedingTask = queue.set(preceding.bars, preceding.source), ownedTask = queue.setWithRollback(owned.bars, owned.source);
  release(); await Promise.all([firstTask, precedingTask, ownedTask.result]);
  expect(await ownedTask.rollback()).toEqual({ ok: true }); expect(state).toEqual(preceding);
});

it('a later successful mutation with the same array identity still supersedes an earlier rollback', async () => {
  let state = input('original', 10);
  const queue = createMarketQueue({ read: () => state, write: next => { state = next; }, disposed: () => false, apply: async () => {} });
  const owned = input('owned', 20), task = queue.setWithRollback(owned.bars, owned.source);
  expect(await task.result).toEqual({ ok: true });
  const corrected = { ...owned.source, revision: '2', label: 'Same array, newer source revision' };
  expect(await queue.set(owned.bars, corrected)).toEqual({ ok: true });
  expect(await task.rollback()).toMatchObject({ ok: false, diagnostic: { code: 'MARKET_ROLLBACK_SUPERSEDED' } });
  expect(state.source).toEqual(corrected); expect(state.bars).toEqual(owned.bars);
  await expect(task.rollback()).rejects.toThrow(/consumed/);
});
