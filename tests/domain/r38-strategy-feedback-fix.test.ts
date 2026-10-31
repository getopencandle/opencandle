// Settle cancellation per (execution, properties), yielding before each trace, and the
// rerun bound wording. SYNTHETIC bars only; the rerun is a stub that never runs a script.
import { describe, expect, it } from 'vitest';
import { DEFAULT_STRATEGY_CONFIG } from '../../src/domain/strategy';
import { linkedSignal, MAX_FEEDBACK_PASSES, strategyFeedback, subscribeStrategyFeedback, type EngineFeed } from '../../src/strategy-report/feedback';
import { strategyReportJobInput } from '../../src/strategy-report/use-report';
import type { StrategyExecution } from '../../src/ui/StrategyDialog';
import type { Bar } from '../../src/domain/types';

const bars: Bar[] = [0, 1, 2, 3].map(index => ({ time: 1_700_000_000 + index * 60, open: 100, high: 101, low: 99, close: 100, volume: 1 }));
const ids = bars.map((_, index) => 'synthetic-fix-' + index);
type Call = { feed: EngineFeed; signal: AbortSignal; resolve: (orders: Record<string, unknown>[]) => void };
function execution(calls: Call[]): StrategyExecution {
  return { result: { orders: [] } as never, bars, barIds: ids, identity: 'fix-' + Math.random(), source: 'Synthetic', chartType: 'standard', currency: 'USD', timezone: 'UTC',
    rerun: (feed, signal) => new Promise((resolve, reject) => { calls.push({ feed, signal, resolve: orders => resolve({ orders } as never) }); signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }); }) };
}
const until = async (test: () => boolean) => { for (let i = 0; i < 200 && !test(); i++) await new Promise(resolve => setTimeout(resolve, 5)); expect(test()).toBe(true); };
const build = (value: StrategyExecution) => strategyReportJobInput({ ...value, rerun: null }, DEFAULT_STRATEGY_CONFIG) as never;

describe(' settle cancellation (F2) and yielding (F3)', () => {
  it('no engine trace runs inside the call; the first runs after a macrotask', async () => {
    const calls: Call[] = [], value = execution(calls);
    expect(strategyFeedback(value, DEFAULT_STRATEGY_CONFIG, build)).toMatchObject({ state: 'waiting' });
    expect(calls).toHaveLength(0);
    await until(() => calls.length === 1);
  });
  it('a newer properties key aborts the running settle of the same execution, and a newer execution aborts both', async () => {
    const calls: Call[] = [], value = execution(calls);
    strategyFeedback(value, DEFAULT_STRATEGY_CONFIG, build); await until(() => calls.length === 1);
    strategyFeedback(value, { ...DEFAULT_STRATEGY_CONFIG, initialCapital: 5000 }, build); await until(() => calls.length === 2);
    expect(calls[0].signal.aborted).toBe(true); expect(calls[1].signal.aborted).toBe(false);
    const other: Call[] = []; strategyFeedback(execution(other), DEFAULT_STRATEGY_CONFIG, build); await until(() => other.length === 1);
    expect(calls[1].signal.aborted).toBe(true); expect(other[0].signal.aborted).toBe(false);
    // An aborted settle is dropped, so the first key starts again instead of reporting a failure.
    expect(strategyFeedback(value, DEFAULT_STRATEGY_CONFIG, build)).toMatchObject({ state: 'waiting' });
  });
  it('the binding job signal stops a rerun (linkedSignal), and a settled run finishes and notifies', async () => {
    const own = new AbortController(), job = new AbortController(), linked = linkedSignal(own.signal, job.signal);
    expect(linked.signal.aborted).toBe(false); job.abort(); expect(linked.signal.aborted).toBe(true); linked.release();
    const calls: Call[] = [], value = execution(calls);
    let notified = 0; const off = subscribeStrategyFeedback(() => { notified++; });
    strategyFeedback(value, DEFAULT_STRATEGY_CONFIG, build); await until(() => calls.length === 1);
    calls[0].resolve([]);
    await until(() => strategyFeedback(value, DEFAULT_STRATEGY_CONFIG, build).state === 'ready');
    expect(notified).toBeGreaterThan(0); off();
  });
  it('F4: the bound is the original run plus MAX_FEEDBACK_PASSES reruns', async () => {
    expect(MAX_FEEDBACK_PASSES).toBe(8);
    // A rerun that changes its orders every time never settles: exactly 8 reruns, then the failure names the bound.
    const calls: Call[] = [], value = execution(calls);
    strategyFeedback(value, DEFAULT_STRATEGY_CONFIG, build);
    for (let k = 0; k < 8; k++) { await until(() => calls.length === k + 1); calls[k].resolve([{ sequence: 1, side: 'buy', quantity: 1 + k, event: { id: ids[k % 3], revision: 1, time: bars[k % 3].time }, virtual: true }]); }
    await until(() => strategyFeedback(value, DEFAULT_STRATEGY_CONFIG, build).state === 'failed');
    const state = strategyFeedback(value, DEFAULT_STRATEGY_CONFIG, build);
    expect(calls).toHaveLength(8); expect(state.state === 'failed' && state.error).toContain('after the original run and 8 reruns');
  });
});
