import { describe, expect, it } from 'vitest';
import { createPaperAccount, submitPaperOrder, type PaperAccount } from '../../src/domain/paper';
import { feedPaperBars } from '../../src/domain/paper-bar-feed';
import { applyPaperExitDrag, paperDragOutExit, paperExitLines } from '../../src/domain/paper-exit-drag';
import type { Instrument } from '../../src/domain/types';

// Synthetic instrument, synthetic prices, virtual money only.
const instrument: Instrument = { id: 'SYNTHETIC:EXIT', symbol: 'EXIT', name: 'Synthetic exit', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' };
const bar = (time: number, close: number) => ({ time, open: close, high: close, low: close, close, volume: 1 });
const feed = (account: PaperAccount, ...bars: ReturnType<typeof bar>[]) => feedPaperBars(account, { bars, instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
function longWithBracket(): PaperAccount {
  let account = feed(createPaperAccount(), bar(60, 100));
  const placed = submitPaperOrder(account, { instrument, quantity: 2, side: 'buy', type: 'market', exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 2, takeProfit: 110, stopLoss: 95 }] } } as never, 60);
  expect(placed.ok).toBe(true); account = placed.account;
  return feed(account, bar(60, 100), bar(120, 100));
}

describe('dragging a take profit or stop loss line', () => {
  it('lists one exit line per active child, labelled TP and SL', () => {
    const lines = paperExitLines(longWithBracket(), instrument);
    expect(lines.map(line => `${line.leg}:${line.price}`).sort()).toEqual(['sl:95', 'tp:110']);
  });
  it('a drag moves the leg and keeps the other leg and the quantity', () => {
    const account = longWithBracket(), tp = paperExitLines(account, instrument).find(line => line.leg === 'tp')!;
    const moved = applyPaperExitDrag(account, tp.orderId, 112.346, instrument.tickSize, 120)!;
    expect(moved.ok).toBe(true);
    expect(paperExitLines(moved.account, instrument).map(line => `${line.leg}:${line.price}`).sort()).toEqual(['sl:95', 'tp:112.35']);
  });
  it('refuses a take profit dragged to the wrong side of the position, and no-op drags', () => {
    const account = longWithBracket(), tp = paperExitLines(account, instrument).find(line => line.leg === 'tp')!;
    expect(applyPaperExitDrag(account, tp.orderId, 110.001, instrument.tickSize, 120)).toBeNull();
    const bad = applyPaperExitDrag(account, tp.orderId, 90, instrument.tickSize, 120);
    expect(bad === null || bad.ok === false).toBe(true);
  });
});

describe('dragging a take profit or stop loss out of a position line', () => {
  it('classifies the side of the drag by position direction', () => {
    expect(paperDragOutExit(2, 100, 104, 0.01)).toEqual({ leg: 'tp', price: 104 });
    expect(paperDragOutExit(2, 100, 97.004, 0.01)).toEqual({ leg: 'sl', price: 97 });
    expect(paperDragOutExit(-2, 100, 104, 0.01)).toEqual({ leg: 'sl', price: 104 });
    expect(paperDragOutExit(-2, 100, 97, 0.01)).toEqual({ leg: 'tp', price: 97 });
    expect(paperDragOutExit(2, 100, 100.001, 0.01)).toBeNull();
  });
});
