import { expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const bars = [2, 99].map((close, index) => ({
  id: 'synthetic-sma-key-' + index, revision: 0, time: 1000 + index,
  open: close, high: close + 1, low: close - 1, close, volume: 1,
}));
const keys = ['toString', 'valueOf', 'hasOwnProperty'] as const;
const sourceFor = (key: string) => `({init(ctx){ctx.state.initializations=(ctx.state.initializations||0)+1;},onBar(ctx){ctx.plot('Synthetic SMA',ctx.sma(${JSON.stringify(key)},ctx.bar.close,2));}})`;

// Actual restricted worker and resumable API, with independently literal finite
// inputs. No renderer, native chart, future bars or packaged UI evidence.
it.each(keys)('owns the ordinary %s SMA key in fresh and resumed snapshots', async key => {
  const jobs = new ScriptJobs(), source = sourceFor(key);
  try {
    const full = await jobs.run({ requestId: 'synthetic-sma-full', source, bars });
    expect(full.ok).toBe(true);
    expect(full.value.plots[0].values.map((point: any) => point.value)).toEqual([null, 50.5]);
    const first = await jobs.run({ requestId: 'synthetic-sma-first', source, bars: bars.slice(0, 1) });
    expect(first.ok).toBe(true);
    expect(first.value.plots[0].values.map((point: any) => point.value)).toEqual([null]);
    expect(Object.keys(first.value.state.ta)).toEqual([key]);
    expect(Object.getOwnPropertyDescriptor(first.value.state.ta, key)).toMatchObject({ enumerable: true, value: { length: 2, values: [2], sum: 2 } });
    expect(first.value.state.ta[key]).toStrictEqual({ length: 2, values: [2], sum: 2 });
    const resumed = await jobs.run({ requestId: 'synthetic-sma-resumed', source, bars: bars.slice(1), snapshot: first.value.state });
    expect(resumed.ok).toBe(true);
    expect(resumed.value.plots[0].values.map((point: any) => point.value)).toEqual([50.5]);
    expect(resumed.value.state.ta[key]).toStrictEqual({ length: 2, values: [2, 99], sum: 101 });
    expect(resumed.value.state).toStrictEqual(full.value.state);
    expect(resumed.value.state.state.initializations).toBe(1);
  } finally { jobs.close(); }
});

it('preserves normal-key warmup and arithmetic', async () => {
  const jobs = new ScriptJobs();
  try {
    const result = await jobs.run({ requestId: 'synthetic-sma-normal', source: sourceFor('synthetic-close-2'), bars });
    expect(result.ok).toBe(true);
    expect(result.value.plots[0].values.map((point: any) => point.value)).toEqual([null, 50.5]);
    expect(result.value.state.ta['synthetic-close-2']).toStrictEqual({ length: 2, values: [2, 99], sum: 101 });
  } finally { jobs.close(); }
});

it.each(keys)('still refuses a changed length under the existing %s key', async key => {
  const jobs = new ScriptJobs();
  const source = `({onBar(ctx){ctx.plot('Synthetic SMA',ctx.sma(${JSON.stringify(key)},ctx.bar.close,ctx.index===0?2:3));}})`;
  try {
    const result = await jobs.run({ requestId: 'synthetic-sma-length', source, bars });
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('SCRIPT_FAILED');
    expect(result.error.message).toContain('SMA key parameters changed');
    expect(result.value).toBeUndefined();
  } finally { jobs.close(); }
});
