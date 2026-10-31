import { expect, it } from 'vitest';
import { createPaperAccount, modifyPaperExitLevel, paperExitTarget, processPaperQuote, restorePaperAccount, submitPaperOrder, type PaperAccount, type PaperResult } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
const instrument: Instrument = { id: 'SYNTHETIC:SESSION', symbol: 'SESSION', name: 'Synthetic session fixture', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: .01, lotSize: 1, timezone: 'UTC' };
const quote = (sequence: number, price: number, session: Quote['session']): Quote => ({ instrumentId: instrument.id, bid: price, ask: price, sequence, eventTime: sequence, receivedAt: sequence, availableAt: sequence, fixture: true, session });
const ok = (result: PaperResult): PaperAccount => { expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true); return result.account; };
const start = () => ok(processPaperQuote(createPaperAccount(), quote(1, 10, 'regular'), 1, 'ordinary', instrument));
function entered(tp = true, legacy = false) { return ok(submitPaperOrder(start(), { instrument, side: 'buy', type: 'limit', limitPrice: 10, quantity: 10, extendedHours: true, ...(legacy ? {} : { sessionPolicy: { schemaVersion: 2 as const, entryOutsideRth: true, takeProfitOutsideRth: tp } }), exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 10, takeProfit: 12, stopLoss: 8 }] } }, 1)); }
it('separates limit entry and TP eligibility while a version-2 SL remains untriggered outside regular hours', () => {
  const account = entered(); const group = account.brackets!.groups[0], children = account.orders.filter(order => !!order.bracket);
  expect(children.find(order => order.bracket!.leg === 'tp')!.extendedHours).toBe(true); expect(children.find(order => order.bracket!.leg === 'sl')!.extendedHours).toBe(false);
  const outside = ok(processPaperQuote(account, quote(2, 7, 'extended'), 2, account.runId, instrument));
  expect(outside.orders.find(order => order.bracket?.leg === 'sl')!.status).toBe('working'); expect(outside.positions[instrument.id].quantity).toBe(10);
  const regular = ok(processPaperQuote(outside, quote(3, 7, 'regular'), 3, account.runId, instrument)); expect(regular.positions[instrument.id]).toBeUndefined();
  const tp = ok(processPaperQuote(account, quote(2, 12, 'extended'), 2, account.runId, instrument)); expect(tp.positions[instrument.id]).toBeUndefined(); expect(restorePaperAccount(tp).brackets!.groups[0].sessionPolicy).toEqual(group.sessionPolicy);
  const disabled = entered(false); const still = ok(processPaperQuote(disabled, quote(2, 12, 'extended'), 2, disabled.runId, instrument)); expect(still.positions[instrument.id].quantity).toBe(10);
});
it('preserves legacy shared flags and retains version 2 through level replacement', () => {
  const legacy = entered(true, true); expect(legacy.brackets!.groups[0]).not.toHaveProperty('sessionPolicy');
  const closed = ok(processPaperQuote(legacy, quote(2, 7, 'extended'), 2, legacy.runId, instrument)); expect(closed.positions[instrument.id]).toBeUndefined();
  const account = entered(), group = account.brackets!.groups[0];
  const edited = ok(modifyPaperExitLevel(account, paperExitTarget(account, 'group', group.id), group.levels[0].id, { quantity: 8, takeProfit: 13, stopLoss: 7 }, 1));
  expect(edited.orders.filter(order => order.bracket && order.status === 'working').map(order => [order.bracket!.leg, order.extendedHours])).toEqual([['tp', true], ['sl', false]]);
  expect(restorePaperAccount(edited)).toEqual(edited);
});
it('rejects unknown versions, disabled TP eligibility and contradictory persisted child policies', () => {
  const account = start();
  for (const policy of [{ schemaVersion: 3, entryOutsideRth: false, takeProfitOutsideRth: false }, { schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: true }, { schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: false, extra: 1 }]) expect(submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 1, extendedHours: false, sessionPolicy: policy as any }, 1).ok).toBe(false);
  const original = entered(), corrupted = structuredClone(original); corrupted.orders.find(order => order.bracket?.leg === 'sl')!.extendedHours = true;
  expect(() => restorePaperAccount(corrupted)).toThrow();
  const nullPolicy = structuredClone(original); (nullPolicy.brackets!.groups[0] as any).sessionPolicy = null; expect(() => restorePaperAccount(nullPolicy)).toThrow();
});
it('does not infer a regular session from all/unknown real-feed quote coverage', () => {
  const account = entered();
  for (const session of ['all', 'unknown'] as const) { const result = ok(processPaperQuote(account, { ...quote(2, 7, session), fixture: false }, 2, account.runId, instrument)); expect(result.positions[instrument.id].quantity).toBe(10); expect(result.orders.find(order => order.bracket?.leg === 'sl')!.status).toBe('working'); }
});
it('does not let TP eligibility enable an entry and retains an outside-hours stop trigger for the next regular quote', () => {
  const account = ok(processPaperQuote(createPaperAccount(), quote(1, 10, 'extended'), 1, 'ordinary', instrument));
  const limit = ok(submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', limitPrice: 10, quantity: 1, extendedHours: false, sessionPolicy: { schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: true }, exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 1, takeProfit: 12 }] } }, 1));
  expect(limit.orders[0].status).toBe('working'); expect(limit.positions).toEqual({});
  const stop = ok(submitPaperOrder(account, { instrument, side: 'buy', type: 'stop-limit', stopPrice: 9, limitPrice: 11, quantity: 1, extendedHours: false, sessionPolicy: { schemaVersion: 2, entryOutsideRth: false, takeProfitOutsideRth: false } }, 1));
  expect(stop.orders[0].status).toBe('working');
  const regular = ok(processPaperQuote(stop, quote(2, 10, 'regular'), 2, stop.runId, instrument)); expect(regular.orders[0].status).toBe('filled'); expect(regular.fills[0].price).toBe(10);
});
