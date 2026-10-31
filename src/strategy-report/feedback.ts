import type { StrategyConfig, StrategyFillContext, StrategyPositionState } from '../domain/strategy';
import type { StrategyExecution } from '../ui/StrategyDialog';
import type { ScriptResult } from '../ui/script-jobs';
import { runReportJob } from './backtest';
import { engineTraceOffThread } from './engine-thread';
import type { StrategyReportJobInput } from './types';

/**
 * The engine feedback loop behind `ctx.strategy` and `onFill(ctx, fill)`.
 *
 * A CandleScript run executes in the restricted worker (fresh runtime per job, LIMITS, interrupt handler) and cannot be
 * re-entered from the engine. The Strategy tester therefore settles a script by replay, all:
 * 1. The engine runs the script's proposals and records its actual position at each bar close and each recalculated fill.
 * 2. The script runs again, in a new job, with that record as its engine feed: ctx.strategy at each bar, and one onFill
 *    call per fill.
 * 3. When the engine, run on the new proposals, records exactly the feed the script was given, the script and the engine
 *    agree everywhere and the report uses those proposals. Otherwise the new record becomes the next feed.
 * The engine is causal, so every pass fixes at least the earliest bar or fill where they disagreed. After the original
 * chart run, at most MAX_FEEDBACK_PASSES reruns are made (so at most MAX_FEEDBACK_PASSES + 1 engine traces); a script
 * that has not settled by then fails with a reason.
 * Each (execution, properties) settle owns its controller. A newer key for the same
 * execution, a newer execution, eviction from the cache and the owning binding's own cancellation (linkedSignal) abort
 * it. Every trace starts after a macrotask, so the first one never runs inside a render.
 * L5b: each trace runs in the engine worker (engine-thread.ts), so a backtest never blocks the interface; an abort
 * terminates the running trace. Without a Worker (tests) the trace runs on this thread, as before.
 * Scripts that never mention `strategy` or `onFill` skip all of this and run once, exactly as before.
 */
export const MAX_FEEDBACK_PASSES = 8;
/** At most this many fed fills per run: the host's engine feed bound (LIMITS.bars). */
export const MAX_FEEDBACK_FILLS = 5000;
export interface FeedPosition { position: number; averagePrice: number | null; openTrades: number }
export interface FeedFill extends FeedPosition { bar: number; ordinal: number; name: string | null; kind: 'order' | 'exit' | 'margin-call'; leg: 'profit' | 'loss' | 'trail' | null; side: 'buy' | 'sell'; quantity: number; price: number; high: number; low: number; close: number }
export interface EngineFeed { positions: (FeedPosition | null)[]; fills: FeedFill[] }
/** Runs the strategy's script again on the same bars, inputs and requests, with an engine feed. */
export type ScriptEngineRerun = (engine: EngineFeed, signal: AbortSignal) => Promise<ScriptResult>;
/** Whether a source can read the engine (ctx.strategy) or define onFill. Conservative: any mention counts. */
export function scriptNeedsEngineFeed(source: string): boolean { return /\bstrategy\b|\bonFill\b/.test(source); }

type Proposal = Record<string, unknown>;
const isFillProposal = (order: Proposal) => Object.hasOwn(order, 'fill');
/** The script's own name for an engine order identity (script-<sequence>, exit legs and per-entry exits included). */
function namer(proposals: readonly Proposal[]): (orderId: string) => Pick<FeedFill, 'name' | 'kind' | 'leg'> {
  const bySequence = new Map<number, Proposal>(); for (const order of proposals) bySequence.set(order.sequence as number, order);
  return orderId => {
    if (orderId.startsWith('lv-margin-call-')) return { name: null, kind: 'margin-call', leg: null };
    const match = /^script-(\d+)(?:\.\d+)?(?::(profit|loss|trail))?$/.exec(orderId), order = match ? bySequence.get(Number(match[1])) : undefined;
    if (!order) return { name: null, kind: 'order', leg: null };
    if (order.side === 'exit') return { name: order.target as string, kind: 'exit', leg: (match![2] ?? null) as FeedFill['leg'] };
    const id = (order.options as Proposal | undefined)?.id;
    return { name: typeof id === 'string' ? id : null, kind: 'order', leg: null };
  };
}
/** The execution with a script run's proposals: bar-close proposals and after-fill proposals, the forming bar kept aside as the host does. */
export function executionWithProposals(execution: StrategyExecution, orders: readonly Proposal[]): StrategyExecution {
  const formingId = execution.forming?.barId, onForming = (order: Proposal) => formingId !== undefined && (order.event as { id?: string } | undefined)?.id === formingId;
  const close = orders.filter(order => !isFillProposal(order)), fill = orders.filter(isFillProposal);
  return { ...execution, result: { ...execution.result, orders: close.filter(order => !onForming(order)) }, ...(execution.forming ? { forming: { ...execution.forming, orders: close.filter(onForming) } } : {}), fillProposals: fill };
}
/** The engine's record for a report job: its actual position at each bar close and each recalculated fill, aligned to the script's bars. */
export function engineFeedFor(job: StrategyReportJobInput, scriptBars: number): { feed: EngineFeed; ok: boolean; diagnostics: readonly string[] } {
  const positions: (FeedPosition | null)[] = Array.from({ length: scriptBars }, () => null), fills: FeedFill[] = [];
  const nameOf = namer([...job.execution.proposals, ...job.execution.fillProposals ?? []]);
  const held = (state: { position: number; averagePrice: number | null; openTrades: number }): FeedPosition => ({ position: state.position, averagePrice: state.averagePrice, openTrades: state.openTrades });
  const result = runReportJob(job, {
    position: (state: Readonly<StrategyPositionState>) => { if (state.barIndex < scriptBars) positions[state.barIndex] = held(state); },
    fill: (context: Readonly<StrategyFillContext>) => { if (context.barIndex < scriptBars) fills.push({ bar: context.barIndex, ordinal: context.ordinal, ...nameOf(context.fill.orderId), side: context.fill.side, quantity: context.fill.quantity, price: context.fill.price, high: context.currentBar.high, low: context.currentBar.low, close: context.currentBar.price, ...held({ position: context.position, averagePrice: context.averagePrice, openTrades: context.openTrades }) }); },
  });
  return { feed: { positions, fills }, ok: result.ok, diagnostics: result.diagnostics };
}

export type FeedbackState = { state: 'none' } | { state: 'waiting'; notice: string } | { state: 'ready'; execution: StrategyExecution; passes: number } | { state: 'failed'; error: string };
type Entry = { state: 'running'; pass: number; controller: AbortController } | Exclude<FeedbackState, { state: 'none' } | { state: 'waiting' }>;
const settled = new WeakMap<StrategyExecution, Map<string, Entry>>(), listeners = new Set<() => void>();
let version = 0, owner: StrategyExecution | null = null;
/** Settles still running, by execution, so a newer execution aborts all of them. */
const running = new Map<StrategyExecution, Set<AbortController>>();
const notify = () => { version++; for (const listener of [...listeners]) { try { listener(); } catch { /* a listener failure never stops the others */ } } };
/** Subscribe to settled feedback (the report and the chart's trade marks rerun when a script settles). */
export function subscribeStrategyFeedback(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const strategyFeedbackVersion = () => version;
/** A signal aborted as soon as either input is (the settle's own, or the script binding's job). */
export function linkedSignal(first: AbortSignal, second: AbortSignal): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController(), stop = () => controller.abort();
  if (first.aborted || second.aborted) stop();
  first.addEventListener('abort', stop, { once: true }); second.addEventListener('abort', stop, { once: true });
  return { signal: controller.signal, release: () => { first.removeEventListener('abort', stop); second.removeEventListener('abort', stop); } };
}
const abortEntry = (entry: Entry | undefined) => { if (entry?.state === 'running') entry.controller.abort(); };
const macrotask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const notice = (pass: number) => `Strategy: matching the script to the engine's position (rerun ${pass} of up to ${MAX_FEEDBACK_PASSES}).`;

/**
 * The settled execution for these properties, or why it is not ready. `build` makes the report job for an execution
 * (strategyReportJobInput's own builder); a job that is still waiting (Bar Magnifier data) waits here too.
 */
export function strategyFeedback(execution: StrategyExecution, config: StrategyConfig, build: (value: StrategyExecution) => { waiting: true; notice: string } | { waiting: false; input: StrategyReportJobInput }): FeedbackState {
  if (!execution.rerun) return { state: 'none' };
  const first = build(execution);
  if (first.waiting) return { state: 'waiting', notice: first.notice };
  const { accountCurrency: _currency, ...engineConfig } = config;
  const key = JSON.stringify([engineConfig, first.input.execution.magnifierBars?.length ?? null, first.input.execution.magnifierLabel ?? null]);
  let entries = settled.get(execution);
  if (!entries) { entries = new Map(); settled.set(execution, entries); }
  const known = entries.get(key);
  if (known?.state === 'running') return { state: 'waiting', notice: notice(known.pass) };
  if (known) return known;
  // A newer execution stops every settle of the older ones.
  if (owner !== execution) { for (const [other, controllers] of running) if (other !== execution) { for (const controller of controllers) controller.abort(); running.delete(other); } owner = execution; }
  // A newer key replaces the running settle of this execution: one controller per (execution, key).
  for (const [other, entry] of [...entries]) if (entry.state === 'running') { abortEntry(entry); entries.delete(other); }
  while (entries.size >= 4) { const oldest = entries.keys().next().value!; abortEntry(entries.get(oldest)); entries.delete(oldest); }
  const controller = new AbortController(), signal = controller.signal, entry: Entry = { state: 'running', pass: 1, controller };
  entries.set(key, entry);
  const live = running.get(execution) ?? new Set<AbortController>(); live.add(controller); running.set(execution, live);
  const done = () => { live.delete(controller); if (!live.size && running.get(execution) === live) running.delete(execution); };
  const finish = (value: Entry) => { done(); if (entries!.get(key) === entry) { entries!.set(key, value); notify(); } };
  const drop = () => { done(); if (entries!.get(key) === entry) entries!.delete(key); };
  void (async () => {
    let fed: string | null = null, current = execution;
    for (let pass = 1; ; pass++) {
      await macrotask();
      if (signal.aborted) { drop(); return; }
      const job = pass === 1 ? first : build(current);
      if (job.waiting) { drop(); notify(); return; }
      // L5b: the trace runs in the engine worker (engine-thread.ts); this thread only compares its text.
      const traced = await engineTraceOffThread(job.input, execution.bars.length + (execution.forming ? 1 : 0), signal, engineFeedFor).catch((cause: unknown) => cause instanceof Error ? cause : new Error(String(cause)));
      if (signal.aborted) { drop(); return; }
      if (traced instanceof Error) { finish({ state: 'failed', error: `Strategy feedback failed. ${traced.message}`.slice(0, 2000) }); return; }
      if (!traced.ok) { finish({ state: 'ready', execution: current, passes: pass }); return; }
      if (traced.fillCount > MAX_FEEDBACK_FILLS) { finish({ state: 'failed', error: `Strategy feedback: more than ${MAX_FEEDBACK_FILLS} fills were recalculated; the script engine feed holds at most ${MAX_FEEDBACK_FILLS} (OpenCandle-defined).` }); return; }
      const text = traced.text;
      if (text === fed) { finish({ state: 'ready', execution: current, passes: pass }); return; }
      if (pass > MAX_FEEDBACK_PASSES) { finish({ state: 'failed', error: `Strategy feedback: the script's orders did not settle against the engine's position after the original run and ${MAX_FEEDBACK_PASSES} reruns (OpenCandle-defined limit). It changes its orders each time it sees the result of its previous orders.` }); return; }
      fed = text; (entry as { pass: number }).pass = pass; notify();
      const rerun = await execution.rerun!(traced.feed(), signal).catch((cause: unknown) => cause instanceof Error ? cause : new Error(String(cause)));
      if (signal.aborted) { drop(); return; }
      // The binding's own calculation was replaced or removed. Say so once (no restart loop).
      if (rerun instanceof Error && rerun.name === 'AbortError') { finish({ state: 'failed', error: 'Strategy feedback stopped: the strategy script was recalculated or removed before it settled.' }); return; }
      if (rerun instanceof Error) { finish({ state: 'failed', error: `Strategy feedback: the script run with the engine position failed. ${rerun.message}`.slice(0, 2000) }); return; }
      current = executionWithProposals(execution, rerun.orders);
    }
  })().catch(cause => finish({ state: 'failed', error: `Strategy feedback failed. ${cause instanceof Error ? cause.message : String(cause)}`.slice(0, 2000) }));
  return { state: 'waiting', notice: notice(1) };
}
