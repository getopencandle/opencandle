import { describe, expect, it } from 'vitest';
import { attachPaperPositionExits, cancelPaperExitLevel, cancelPaperOrder, closePaperPosition, createPaperAccount, modifyPaperExitLevel, modifyPaperExitPlan, paperExitTarget, paperPositionExitTarget, paperSummary, processPaperQuote, restorePaperAccount, submitPaperOrder, type PaperAccount, type PaperExitPlanInput, type PaperOrderRequest, type PaperResult } from '../../src/domain/paper';
import { assertPaperPlainData } from '../../src/domain/paper-brackets';
import { ensurePaperBrackets } from '../../src/domain/paper-bracket-runtime';
import type { Instrument, Quote } from '../../src/domain/types';

const instrument: Instrument = { id: 'TEST:ABC', symbol: 'ABC', name: 'Synthetic bracket oracle', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote = (bid = 9.98, ask = 10.02, sequence = 1): Quote => ({ instrumentId: instrument.id, bid, ask, sequence, eventTime: sequence, receivedAt: sequence, availableAt: sequence, fixture: true, session: 'unknown' });
const take = (result: PaperResult): PaperAccount => { expect(result.ok, result.diagnostics.map(row => row.message).join('; ')).toBe(true); return result.account; };
const priced = (account: PaperAccount, bid: number, ask: number, sequence: number) => take(processPaperQuote(account, quote(bid, ask, sequence), sequence, account.runId, instrument));
const start = () => priced(createPaperAccount({ initialBalance: 1000, commission: { kind: 'fixed', value: 1 } }), 9.98, 10.02, 1);
const exits: PaperExitPlanInput = { schemaVersion: 1, mode: 'multiple', levels: [{ quantity: 4, takeProfit: 12, stopLoss: 9 }, { quantity: 6, takeProfit: 13, stopLoss: 9 }] };
const enter = (account: PaperAccount, changes: Partial<PaperOrderRequest> = {}) => take(submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 10, exits, ...changes }, account.clock));

describe('atomic virtual bracket engine', () => {
  it('matches independent Decimal profit and OCO fee oracles', () => {
    let account = enter(start());
    expect(account.cash).toBe(898.8); expect(account.orders.filter(row => row.bracket)).toHaveLength(4);
    expect(paperSummary(account).reservedMargin).toBe(2);
    account = priced(account, 12, 12.02, 2);
    expect(account.cash).toBe(945.8); expect(account.positions[instrument.id].quantity).toBe(6);
    expect(account.orders.filter(row => row.bracket && row.status === 'cancelled')).toHaveLength(1);
    account = priced(account, 13, 13.02, 3);
    expect(account.cash).toBe(1022.8); expect(account.positions).toEqual({}); expect(account.fees).toBe(3);
    expect(account.orders.filter(row => row.bracket && row.status === 'filled').map(row => row.quantity)).toEqual([4, 6]);
    expect(restorePaperAccount(JSON.parse(JSON.stringify(account)))).toEqual(account);
  });
  it('fills both shared-stop levels at the gapped bid with separate virtual fees', () => {
    const account = priced(enter(start()), 8.98, 9.02, 2);
    expect(account.cash).toBe(986.6); expect(account.fills.map(row => row.quantity)).toEqual([10, 4, 6]);
    expect(account.orders.filter(row => row.bracket && row.status === 'cancelled')).toHaveLength(2);
  });
  it('preserves overcoverage and caps execution to eight plus two', () => {
    let account = enter(start(), { exits: { ...exits, levels: exits.levels.map(level => ({ ...level, quantity: 8 })) } });
    expect(account.brackets!.groups[0].levels.map(row => [row.requestedQuantity, row.allocation])).toEqual([[8, 8], [8, 2]]);
    account = priced(account, 12, 12.02, 2); account = priced(account, 13, 13.02, 3);
    expect(account.cash).toBe(1018.8); expect(account.fills.map(row => row.quantity)).toEqual([10, 8, 2]);
    expect(account.brackets!.groups[0].levels.map(row => row.requestedQuantity)).toEqual([8, 8]);
  });
  it('does not consume the parent activation quote even if its price already crosses an exit', () => {
    const plan: PaperExitPlanInput = { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 9, stopLoss: 8 }] };
    let account = enter(start(), { exits: plan }); expect(account.fills).toHaveLength(1);
    const duplicate = processPaperQuote(account, quote(), 1, account.runId, instrument); expect(duplicate.ok).toBe(false); expect(duplicate.account).toBe(account);
    account = priced(account, 9.98, 10.02, 2); expect(account.fills).toHaveLength(2); expect(account.positions).toEqual({});
  });
  it('resizes parent-specific ownership after FIFO manual reduction and leaves later additions separate', () => {
    const plan = (quantity: number): PaperExitPlanInput => ({ schemaVersion: 1, mode: 'single', levels: [{ quantity, takeProfit: 20, stopLoss: 5 }] });
    let account = enter(start(), { quantity: 6, exits: plan(6) }); account = enter(account, { quantity: 4, exits: plan(4) });
    account = take(closePaperPosition(account, instrument.id, 1, 4));
    expect(account.brackets!.groups.map(group => group.levels[0].allocation)).toEqual([2, 4]);
    account = take(submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 3 }, 1));
    expect(account.brackets!.groups.map(group => group.levels[0].allocation)).toEqual([2, 4]);
    expect(account.brackets!.lots.map(lot => lot.remainingQuantity)).toEqual([2, 4, 3]);
    expect(restorePaperAccount(JSON.parse(JSON.stringify(account))).positions).toEqual(account.positions);
  });
  it('cancels old-generation children and protects only a reversal residual', () => {
    let account = enter(start());
    account = enter(account, { side: 'sell', quantity: 15, exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 15, takeProfit: 8, stopLoss: 12 }] } });
    expect(account.positions[instrument.id].quantity).toBe(-5);
    expect(account.brackets!.groups.map(group => [group.generation, group.status])).toEqual([[1, 'closed'], [2, 'active']]);
    expect(account.brackets!.groups[1].levels[0].allocation).toBe(5);
    expect(account.orders.filter(order => order.bracket?.generation === 1).every(order => order.status === 'cancelled')).toBe(true);
  });
  it('cancels exactly one placed pair without closing exposure or other levels', () => {
    let account = enter(start()); const first = account.orders.find(order => order.bracket?.leg === 'sl')!;
    account = take(cancelPaperOrder(account, first.id, 1));
    expect(account.positions[instrument.id].quantity).toBe(10);
    expect(account.orders.filter(order => order.bracket?.levelId === first.bracket!.levelId).map(order => order.status)).toEqual(['cancelled', 'cancelled']);
    expect(account.brackets!.groups[0].levels[1].allocation).toBe(6);
  });
  it('rejects missing or changed execution metadata without consuming the quote', () => {
    const account = enter(start()), next = quote(12, 12.02, 2);
    for (const metadata of [undefined, { ...instrument, exchange: 'OTHER' }, { ...instrument, tickSize: 0.05 }]) {
      const result = processPaperQuote(account, next, 2, account.runId, metadata);
      expect(result.ok).toBe(false); expect(result.account).toBe(account); expect(result.account.quotes[instrument.id].sequence).toBe(1);
    }
  });
  it('migrates an old open account once without inventing fills or changing monetary values', () => {
    let account = take(processPaperQuote(createPaperAccount(), quote(), 1));
    account = take(submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 3 }, 1));
    const before = structuredClone(account); ensurePaperBrackets(account); const migrated = structuredClone(account); ensurePaperBrackets(account);
    expect(account).toEqual(migrated); expect(account.fills).toEqual(before.fills); expect(account.cash).toBe(before.cash);
    expect(account.brackets!.lots[0]).toMatchObject({ migration: true, openingFillId: null, remainingQuantity: 3, groupId: null });
    expect(restorePaperAccount(JSON.parse(JSON.stringify(account)))).toEqual(account);
  });
  it('bounds scheduled hostile data and cycles without invoking getters, with bounded alias support', () => {
    expect(() => assertPaperPlainData({ a: Array.from({ length: 1000 }, () => 1) }, 100)).toThrow('scheduled');
    const cycle: Record<string, unknown> = {}; cycle.self = cycle; expect(() => assertPaperPlainData(cycle)).toThrow('bounds');
    const shared = { price: 10 }; expect(() => assertPaperPlainData([shared, shared], 10)).not.toThrow();
  });
  it('replaces one placed level with a new activation barrier and rejects its stale target', () => {
    let account = enter(start()); const group = account.brackets!.groups[0], target = paperExitTarget(account, 'group', group.id), levelId = group.levels[0].id;
    const second = structuredClone(group.levels[1]);
    account = take(modifyPaperExitLevel(account, target, levelId, { quantity: 3, takeProfit: 11, stopLoss: 8 }, 1));
    expect(account.brackets!.groups[0].levels[1]).toEqual(second);
    expect(account.orders.filter(order => order.bracket?.levelId === levelId && order.status === 'working').map(order => [order.quantity, order.bracket!.activationSequence])).toEqual([[3, 1], [3, 1]]);
    const stale = modifyPaperExitLevel(account, target, levelId, { quantity: 2, takeProfit: 12, stopLoss: 8 }, 1); expect(stale.ok).toBe(false); expect(stale.account).toBe(account);
    expect(restorePaperAccount(JSON.parse(JSON.stringify(account)))).toEqual(account);
  });
  it('edits an unfilled parent plan without creating children and pins its revision', () => {
    let account = enter(start(), { type: 'limit', limitPrice: 8 });
    const order = account.orders[0], target = paperExitTarget(account, 'parent', order.id);
    account = take(modifyPaperExitPlan(account, target, { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, stopLoss: 7 }] }, 1));
    expect(account.orders.filter(item => item.bracket)).toHaveLength(0);
    expect(modifyPaperExitPlan(account, target, exits, 1).ok).toBe(false);
    account = priced(account, 7.98, 8, 2); expect(account.orders.filter(item => item.bracket)).toHaveLength(1);
    expect(account.fills).toHaveLength(1); expect(restorePaperAccount(JSON.parse(JSON.stringify(account)))).toEqual(account);
  });
  it('replaces explicitly named position groups with a snapshot that excludes later entries', () => {
    let account = enter(start()); const target = paperPositionExitTarget(account, instrument.id), before = structuredClone(account);
    expect(attachPaperPositionExits(account, target, exits, [], 1).ok).toBe(false); expect(account).toEqual(before);
    account = take(attachPaperPositionExits(account, target, exits, target.owners.map(row => row.id), 1));
    expect(account.brackets!.groups[0].status).toBe('cancelled'); expect(account.brackets!.groups[1].owner).toBe('position-snapshot');
    account = take(submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 3 }, 1));
    expect(account.brackets!.groups[1].levels.map(row => row.allocation)).toEqual([4, 6]);
    expect(account.brackets!.lots.at(-1)!.groupId).toBe(null);
    expect(attachPaperPositionExits(account, target, exits, target.owners.map(row => row.id), 1).ok).toBe(false);
    expect(restorePaperAccount(JSON.parse(JSON.stringify(account)))).toEqual(account);
  });
  it('lets a dormant capped level be cancelled without manufacturing a zero-sized order', () => {
    let account = enter(start(), { exits: { ...exits, levels: [{ quantity: 10, takeProfit: 12, stopLoss: 9 }, { quantity: 3, takeProfit: 13, stopLoss: 8 }] } });
    const group = account.brackets!.groups[0]; expect(group.levels[1].allocation).toBe(0); expect(group.levels[1].childIds).toEqual([]);
    account = take(cancelPaperExitLevel(account, paperExitTarget(account, 'group', group.id), group.levels[1].id, 1));
    expect(account.orders.every(order => order.quantity > 0)).toBe(true); expect(account.brackets!.groups[0].levels[1].status).toBe('cancelled');
  });
});
