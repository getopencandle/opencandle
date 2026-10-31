import { expect, it } from 'vitest';
import { configurePaperAccount, createPaperAccount, processPaperQuote, restorePaperAccount, submitPaperOrder, type PaperAccount, type PaperResult } from '../../src/domain/paper';
import { PAPER_BRACKET_LIMITS } from '../../src/domain/paper-brackets';
import { estimatePaperBracketWork } from '../../src/domain/paper-bracket-runtime';
import type { Instrument, Quote } from '../../src/domain/types';

const instrument: Instrument = { id: 'TEST:LOAD', symbol: 'LOAD', name: 'Deterministic workload fixture', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote = (sequence: number, price = 10): Quote => ({ instrumentId: instrument.id, bid: price, ask: price, sequence, eventTime: sequence, receivedAt: sequence, availableAt: sequence, fixture: true, session: 'unknown' });
const accepted = (result: PaperResult) => { expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true); return result.account; };
const start = () => accepted(processPaperQuote(createPaperAccount({ initialBalance: 1_000_000 }), quote(1), 1, 'ordinary', instrument));
const enter = (account: PaperAccount) => accepted(submitPaperOrder(account, { instrument, type: 'market', side: 'buy', quantity: 1, exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 1, takeProfit: 12, stopLoss: 8 }] } }, 1));
const bytes = (account: PaperAccount) => new TextEncoder().encode(JSON.stringify(account)).byteLength;
const estimate = (account: PaperAccount) => estimatePaperBracketWork(account, account.orders.filter(order => order.status === 'working' || order.status === 'triggered').length);

it('retains the prior account when a settings action would exceed storage while expiring an order', () => {
  const account = accepted(submitPaperOrder(start(), { instrument, type: 'limit', side: 'buy', quantity: 1, limitPrice: 9, timeInForce: 'DAY', expiresAt: 2 }, 1));
  const target = 20 * 1024 * 1024 - 64;
  account.events[0].message += 'x'.repeat(target - bytes(account));
  expect(bytes(account)).toBe(target); expect(restorePaperAccount(account).orders[0].status).toBe('working');
  const result = configurePaperAccount(account, { oneClick: true }, 2);
  expect(result.ok).toBe(false); expect(result.account).toBe(account);
  expect(account.orders[0].status).toBe('working'); expect(account.settings.oneClick).toBe(false); expect(account.clock).toBe(1);
  expect(result.diagnostics[0].message).toContain('20 MiB');
});

it('measures the largest one-level all-fill batch admitted by the 2m work estimate and rejects the next group atomically', () => {
  let account = start(), last = account;
  for (let index = 0; index < 300; index++) { last = account; account = enter(account); if (estimate(account) > PAPER_BRACKET_LIMITS.operations) break; }
  expect(estimate(last)).toBeLessThanOrEqual(PAPER_BRACKET_LIMITS.operations); expect(estimate(account)).toBeGreaterThan(PAPER_BRACKET_LIMITS.operations);
  const beforeHeap = process.memoryUsage().heapUsed, begin = performance.now();
  const result = processPaperQuote(last, quote(2, 12), 2, last.runId, instrument), elapsedMs = performance.now() - begin;
  const filled = accepted(result), groups = last.brackets!.groups.length;
  expect(groups).toBe(50);
  expect(filled.cash).toBe(1_000_000 + groups * 2); expect(filled.positions).toEqual({}); expect(filled.fills).toHaveLength(groups * 2);
  expect(restorePaperAccount(filled)).toEqual(filled);
  const rejectBegin = performance.now(), rejected = processPaperQuote(account, quote(2, 12), 2, account.runId, instrument), rejectionMs = performance.now() - rejectBegin;
  expect(rejected.ok).toBe(false); expect(rejected.account).toBe(account); expect(account.quotes[instrument.id].sequence).toBe(1);
  console.info('PAPER_BRACKET_WORKLOAD', JSON.stringify({ fixture: true, groups, ordersBefore: last.orders.length, retainedEventsBefore: last.events.length, estimatedWork: estimate(last), limit: PAPER_BRACKET_LIMITS.operations, accountBytes: bytes(last), elapsedMs, heapDeltaBytes: process.memoryUsage().heapUsed - beforeHeap, nextGroupEstimate: estimate(account), rejectionMs, nativeGui: false }));
}, 30000);

it('measures a validator-admitted 80000-event synthetic history and keeps a byte-quota failure atomic', () => {
  const base = enter(start()), history = structuredClone(accepted(processPaperQuote(base, quote(2, 12), 2, base.runId, instrument)));
  // This is an explicitly constructed stress fixture, not a claim that these annotations occurred.
  while (history.events.length < 80000) history.events.push({ id: history.nextId++, at: 2, type: 'modified', orderId: history.orders[0].id, message: 'Synthetic retained-history workload annotation.' });
  const validated = restorePaperAccount(history), begin = performance.now();
  const next = accepted(processPaperQuote(validated, quote(3), 3, validated.runId, instrument));
  const elapsedMs = performance.now() - begin; expect(next.events).toHaveLength(80000); expect(next.quotes[instrument.id].sequence).toBe(3);
  const nearBytes = structuredClone(base), targetBytes = 20 * 1024 * 1024 - 64;
  nearBytes.events[0].message += 'x'.repeat(targetBytes - bytes(nearBytes));
  expect(bytes(nearBytes)).toBe(targetBytes); expect(restorePaperAccount(nearBytes).cash).toBe(nearBytes.cash);
  const rejected = processPaperQuote(nearBytes, quote(2, 12), 2, nearBytes.runId, instrument);
  expect(rejected.ok).toBe(false); expect(rejected.account).toBe(nearBytes); expect(nearBytes.fills).toHaveLength(1); expect(nearBytes.quotes[instrument.id].sequence).toBe(1);
  expect(rejected.diagnostics[0].message).toContain('20 MiB');
  console.info('PAPER_BRACKET_HISTORY', JSON.stringify({ fixture: true, events: validated.events.length, accountBytes: bytes(validated), elapsedMs, limitBytes: 20 * 1024 * 1024, rejectedCandidatePriorBytes: targetBytes, nativeGui: false }));
}, 30000);
