import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildExitPlan, buildPaperRequest, PaperPanel, type ExitLevelDraft, type PaperTicketDraft } from '../../src/ui/PaperPanel';
import { createPaperAccount, modifyPaperOrder, paperExitTarget, processPaperQuote, resetPaperAccount, restorePaperAccount, submitPaperOrder } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';

const instrument: Instrument = { id: 'TEST:ABC', symbol: 'ABC', name: 'Synthetic form oracle', exchange: 'SYNTHETIC', assetClass: 'stock', currency: 'USD', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const row: ExitLevelDraft = { quantity: '8', tp: '12', sl: '9', tpEnabled: true, slEnabled: true };
const quote: Quote = { instrumentId: instrument.id, bid: 9.98, ask: 10.02, sequence: 1, eventTime: 1, receivedAt: 1, availableAt: 1, fixture: true, session: 'unknown' };
const draft: PaperTicketDraft = { side: 'buy', type: 'limit', quantity: '10', limitPrice: '8', stopPrice: '', timeInForce: 'GTC', expiresAt: '', extendedHours: false };

describe('virtual exit form contracts, not native GUI evidence', () => {
  it('preserves requested overcoverage and produces an independent immutable ticket plan', () => {
    const rows = [{ ...row }, { ...row, tp: '13' }], before = structuredClone(rows);
    const plan = buildExitPlan('multiple', rows, instrument, 'buy'), request = buildPaperRequest(draft, instrument, plan);
    expect(plan.levels).toEqual([{ quantity: 8, takeProfit: 12, stopLoss: 9 }, { quantity: 8, takeProfit: 13, stopLoss: 9 }]);
    expect(request.exits).toEqual(plan); expect(request.exits).not.toBe(plan); expect(rows).toEqual(before);
    plan.levels[0].quantity = 1; expect(request.exits!.levels[0].quantity).toBe(8);
  });
  it('accepts one enabled protective leg and rejects blank, fifth, inverted or incomplete paired levels', () => {
    expect(buildExitPlan('single', [{ ...row, tpEnabled: false, tp: '' }], instrument, 'buy').levels).toEqual([{ quantity: 8, stopLoss: 9 }]);
    expect(() => buildExitPlan('single', [{ ...row, quantity: '' }], instrument, 'buy')).toThrow('finite');
    expect(() => buildExitPlan('multiple', Array.from({ length: 5 }, () => row), instrument, 'buy')).toThrow();
    expect(() => buildExitPlan('multiple', [{ ...row, sl: '' }], instrument, 'buy')).toThrow();
    expect(() => buildExitPlan('multiple', [{ ...row, tp: '8' }], instrument, 'buy')).toThrow();
  });
  it('shows active allocation and price-only limitations without calling virtual balances real funds', () => {
    let account = processPaperQuote(createPaperAccount(), quote, 1, 'ordinary', instrument).account;
    account = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 10, exits: buildExitPlan('multiple', [row, { ...row, tp: '13' }], instrument, 'buy') }, 1).account;
    const markup = renderToStaticMarkup(React.createElement(PaperPanel, { account, instrument, quote: null, now: 1, onAccountChange: () => false }));
    expect(markup).toContain('Virtual exits'); expect(markup).toContain('Requested'); expect(markup).toContain('Executable'); expect(markup).toContain('OpenCandle policies');
    expect(markup).toContain('No deposit, billing or broker connection'); expect(markup).not.toContain('Bracket exits and partial liquidity fills are not implemented');
  });
  it('resets replay account identity while preserving its stream, and retires ordinary run identity', () => {
    let replay = createPaperAccount({ id: 'replay-a', mode: 'replay-paper', runId: 'replay-stream', now: 1 });
    replay = processPaperQuote(replay, quote, 1, replay.runId, instrument).account;
    replay = submitPaperOrder(replay, { ...buildPaperRequest(draft, instrument, buildExitPlan('single', [row], instrument, 'buy')) }, 1).account;
    const target = paperExitTarget(replay, 'parent', replay.orders[0].id), reset = resetPaperAccount(replay, { initialBalance: 500 }, 1);
    expect(reset.runId).toBe('replay-stream'); expect(reset.id).not.toBe(replay.id); expect(reset.id).not.toBe(target.accountId);
    expect(reset.orders).toEqual([]); expect(reset.brackets).toBeUndefined(); expect(reset.cash).toBe(500); expect(restorePaperAccount(reset)).toEqual(reset);
    const ordinary = createPaperAccount(), resetOrdinary = resetPaperAccount(ordinary);
    expect(resetOrdinary.id).toBe(ordinary.id); expect(resetOrdinary.runId).not.toBe(ordinary.runId);
  });
  it('removes absent optional modification fields instead of publishing non-JSON undefined values', () => {
    let account = processPaperQuote(createPaperAccount(), quote, 1, 'ordinary', instrument).account;
    account = submitPaperOrder(account, buildPaperRequest(draft, instrument), 1).account;
    const result = modifyPaperOrder(account, account.orders[0].id, { quantity: 10, limitPrice: 8, stopPrice: undefined, expiresAt: undefined, extendedHours: false }, 1);
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true); expect(Object.hasOwn(result.account.orders[0], 'stopPrice')).toBe(false);
    expect(restorePaperAccount(result.account)).toEqual(result.account);
  });
});
