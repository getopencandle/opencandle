import { describe, expect, it, vi } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { formEscape, modifyPaperDockOrder, paperDockOrderEdit, paperDockOrderEditable, paperDockOrdersByStatus, paperDockTrailText } from '../../src/ui/PaperTradingDock';
import { readFileSync } from 'node:fs';

// Trailing stop text and modify, Esc on inline forms, sticky ticket footer and sticky row actions. Synthetic instrument, virtual money.
const instrument: Instrument = { id: 'SYNTHETIC:POLISH', symbol: 'PLSH', name: 'Synthetic polish', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1, fixture: true } as never;
const quote: Quote = { instrumentId: instrument.id, bid: 100, ask: 100.1, session: 'regular', fixture: true, eventTime: 100, receivedAt: 100, availableAt: 100, sequence: 1 };
const base = () => { const a = createPaperAccount({ now: 100 }); return processPaperQuote(a, quote, 100, a.runId, instrument).account; };
const place = (extra: Record<string, unknown>) => { const result = submitPaperOrder(base(), { instrument, side: 'sell', type: 'trailing-stop', quantity: 1, ...extra } as never, 100); expect(result.ok).toBe(true); return result.account; };

describe('trailing orders in the dock', () => {
  it('shows the trail distance or percent', () => {
    expect(paperDockOrdersByStatus(place({ trailDistance: 0.5 }), 'working')[0]!.trail).toBe('Trail 0.50');
    expect(paperDockOrdersByStatus(place({ trailPercent: 2 }), 'working')[0]!.trail).toBe('Trail 2%');
    expect(paperDockTrailText({ type: 'limit', instrument } as never)).toBe('');
  });
  it('modifies the trail amount, keeping its mode', () => {
    const account = place({ trailDistance: 0.5 }), order = account.orders[0]!;
    expect(paperDockOrderEditable(order)).toBeNull();
    const edit = paperDockOrderEdit(order);
    expect(edit.trail).toBe('0.50');
    const result = modifyPaperDockOrder(account, { ...edit, trail: '0.75' }, 101);
    expect(result.ok).toBe(true);
    if (result.ok) { expect(result.account.orders[0]!.trailDistance).toBe(0.75); expect(result.account.orders[0]!.trailPercent).toBeUndefined(); }
    const bad = modifyPaperDockOrder(account, { ...edit, trail: '-1' }, 101);
    expect(bad.ok).toBe(false);
  });
});
describe('inline form Escape', () => {
  it('cancels the form and stops the event', () => {
    const cancel = vi.fn(), event = { key: 'Escape', nativeEvent: {}, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    formEscape(cancel)(event as never);
    expect(cancel).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalled();
    formEscape(cancel)({ ...event, key: 'a' } as never);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
describe('short-window layout', () => {
  it('keeps the ticket submit row and the row actions pinned', () => {
    expect(readFileSync('src/ui/paper-order-ticket.css', 'utf8')).toMatch(/\.lv-ticket-foot\{position:sticky;bottom:0/);
    const dock = readFileSync('src/ui/PaperTradingDock.tsx', 'utf8');
    expect(dock).toContain('td:has(>.lv-paper-dock-acts){position:sticky;right:0');
    expect(readFileSync('src/ui/PaperOrderTicket.tsx', 'utf8')).toMatch(/lv-ticket-foot[\s\S]*type="submit"/);
  });
});
