import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaperAccount, processPaperQuote, type PaperAccount } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';
import { PaperOrderTicket, type PaperOrderTicketProps } from '../../src/ui/PaperOrderTicket';
import { prepareDrawingAlertGrid, evaluateDrawingBoundary } from '../../src/chart/drawing-alert-geometry';
import { evaluateDrawingAlertShape, type DrawingAlertShapeSnapshot } from '../../src/chart/drawing-alert-shapes';
import { sourceContextForDataset } from '../../src/chart/source-context';
import { fixtureDataset } from '../../src/domain/fixtures';
import { alertDiagnosticText } from '../../src/ui/AlertDialog';
import { topAddChoice } from '../../src/ui/WatchlistPanel';
import { moreMenuPlacement } from '../../src/ui/ScriptLibraryPanel';
import { dismissNewestToast, registerToast, toastEscapeAllowed } from '../../src/ui/toast-escape';

// Flow fixes. SYNTHETIC rows, drawings, quotes and virtual
// money only. The ticket runs with the controlled-hooks harness of r39-paper-ticket-2-handlers (no DOM).
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return { ...actual, useState: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], (next: any) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; }, useRef: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; }, useEffect: () => {}, useMemo: (make: () => unknown) => make() };
});
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, predicate: (node: any) => boolean): any { if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } } else if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); } return null; }

const day = 1704153600;
const data = fixtureDataset('GME', 500); data.bars = [10, 11, 12, 13, 14, 15].map((value, index) => ({ time: day + index * 86400, open: value, high: value + 1, low: value - 1, close: value, volume: 100 }));
const t = (index: number) => (day + index * 86400) * 1000;
function shape(record: Record<string, unknown>): DrawingAlertShapeSnapshot {
  const prepared = prepareDrawingAlertGrid(data.bars, { source: sourceContextForDataset(data), style: 'candles', scale: 'linear' }); if (!prepared.ok) throw new Error(prepared.diagnostics.join(' '));
  const captured = prepared.grid.captureShape({ id: 'd1', paneId: 'price', ...record }); if (!captured.ok) throw new Error(captured.diagnostics.join(' ')); return captured.snapshot;
}

describe('#5 trend line alerts past the segment', () => {
  it('a non-extended trend line alert follows the line past its last anchor (the latest bar is usually after it)', () => {
    const line = shape({ type: 'trendline', anchors: [{ time: t(0), price: 10 }, { time: t(2), price: 14 }] });
    expect(evaluateDrawingAlertShape(line, 5)).toEqual({ ok: true, shape: 'line', price: 20 });
    expect(evaluateDrawingBoundary(line, 5)).toEqual({ ok: true, boundaryPrice: 20 });
    expect(evaluateDrawingAlertShape(line, 1)).toEqual({ ok: true, shape: 'line', price: 12 });
  });
  it('a ray before its start has no value, worded for a user', () => {
    const ray = shape({ type: 'ray', anchors: [{ time: t(3), price: 10 }, { time: t(4), price: 11 }] });
    const value = evaluateDrawingAlertShape(ray, 1);
    expect(value.ok).toBe(false); if (!value.ok) expect(value.diagnostics).toEqual(['This bar is before the start of the drawing.']);
  });
  it('the dialog drops the internal source kind tag but keeps an indicator name', () => {
    expect(alertDiagnosticText('comparison: The bar is late.')).toBe('The bar is late.');
    expect(alertDiagnosticText('drawing-boundary: Drawing grid is unavailable.')).toBe('Drawing grid is unavailable.');
    expect(alertDiagnosticText('rsi: Needs 14 bars.')).toBe('rsi: Needs 14 bars.');
  });
});

describe('#15 Add symbols Enter and the script More menu', () => {
  it('Enter picks the exact ticker first, else the first row that can be added', () => {
    const rows = [{ symbol: 'TSLL', disabled: false }, { symbol: 'TSLA', disabled: false }];
    expect(topAddChoice(rows, 'tsla')).toBe(1);
    expect(topAddChoice(rows, 'tsl')).toBe(0);
    expect(topAddChoice([{ symbol: 'TSLA', disabled: true }, { symbol: 'TSLL', disabled: false }], 'TSLA')).toBe(1);
    expect(topAddChoice([{ symbol: 'TSLA', disabled: true }], 'TSLA')).toBe(-1);
  });
  it('the More list is fixed to the viewport, opening upward when the space below is short', () => {
    expect(moreMenuPlacement({ top: 100, bottom: 124, right: 900 }, 1600, 900)).toMatchObject({ position: 'fixed', top: 128, right: 700 });
    const up = moreMenuPlacement({ top: 700, bottom: 724, right: 1500 }, 1600, 900);
    expect(up).toMatchObject({ position: 'fixed', bottom: 204, top: 'auto', right: 100, maxHeight: 688 });
  });
});

describe('#14 Escape dismisses the newest toast outside dialogs and text fields', () => {
  const key = (target: unknown, extra: Record<string, unknown> = {}) => ({ key: 'Escape', defaultPrevented: false, isComposing: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, target, ...extra }) as unknown as KeyboardEvent;
  const doc = (active: unknown = null, modals: unknown[] = []) => ({ activeElement: active, body: {}, querySelectorAll: () => modals }) as unknown as Document;
  it('allows a plain Escape and refuses a handled or modified one', () => {
    expect(toastEscapeAllowed(key(null), doc())).toBe(true);
    expect(toastEscapeAllowed(key(null, { defaultPrevented: true }), doc())).toBe(false);
    expect(toastEscapeAllowed(key(null, { shiftKey: true }), doc())).toBe(false);
    expect(toastEscapeAllowed(key(null, { key: 'Enter' }), doc())).toBe(false);
    const field = { closest: (selector: string) => selector.includes('input') ? {} : null }, plain = { closest: () => null };
    expect(toastEscapeAllowed(key(field), doc())).toBe(false);
    expect(toastEscapeAllowed(key(plain), doc(field))).toBe(false);
    expect(toastEscapeAllowed(key(plain), doc(plain))).toBe(true);
    expect(toastEscapeAllowed(key(plain), doc(plain, [{ getClientRects: () => [1] }]))).toBe(false);
  });
  it('dismisses the newest toast first', () => {
    const order: string[] = [];
    const releaseOld = registerToast({}, () => order.push('old'), 1), releaseNew = registerToast({}, () => order.push('new'), 2);
    expect(dismissNewestToast()).toBe(true); expect(dismissNewestToast()).toBe(true); expect(dismissNewestToast()).toBe(false);
    expect(order).toEqual(['new', 'old']); releaseOld(); releaseNew();
  });
});

describe('#13 a marketable limit asks first and stays a limit', () => {
  const stock: Instrument = { id: 'SYNTHETIC:FIXC', symbol: 'FIXC', name: 'Synthetic FIXC', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
  const quote: Quote = { instrumentId: stock.id, bid: 22.21, ask: 22.23, eventTime: 2000, receivedAt: 2000, availableAt: 2000, sequence: 1, fixture: true, session: 'regular' };
  beforeEach(() => { hooks.cells = []; hooks.cursor = 0; vi.stubGlobal('document', { activeElement: null }); vi.stubGlobal('crypto', { randomUUID: () => 'fixc-command' }); });
  afterEach(() => vi.unstubAllGlobals());
  function ticket(price: string) {
    const base = createPaperAccount({ initialBalance: 100000, now: 2000 }), account = processPaperQuote(base, quote, 2000, base.runId, stock).account;
    const placed: PaperAccount[] = [], done: string[] = [], cells: any[] = [];
    const props: PaperOrderTicketProps = { account, instrument: stock, quote, quoteSource: { key: 'synthetic fixc', state: 'ready' }, now: 2000, side: 'buy', tab: 'limit', price, onAccountChange: next => { placed.push(next); return true; }, onDone: message => done.push(message) };
    const render = () => { hooks.cells = cells; hooks.cursor = 0; return PaperOrderTicket(props); };
    const submit = () => find(render(), (n: any) => n.type === 'form').props.onSubmit({ preventDefault: vi.fn() });
    return { render, submit, placed, done };
  }
  it('a buy limit above the ask needs a second submit, then places a limit order', () => {
    const ui = ticket('22.99');
    ui.submit();
    expect(ui.placed).toHaveLength(0);
    expect(text(ui.render())).toContain('at or above the ask 22.23, so it fills now');
    expect(text(ui.render())).toContain('Confirm: Buy 1 limit');
    ui.submit();
    expect(ui.placed).toHaveLength(1); expect(ui.done).toHaveLength(1);
    const orders = ui.placed[0].orders;
    expect(orders.some(row => row.type === 'limit' && row.limitPrice === 22.99)).toBe(true);
    expect(orders.some(row => row.type === 'stop')).toBe(false);
  });
  it('a buy limit below the ask places at once', () => {
    const ui = ticket('21.50');
    ui.submit();
    expect(ui.placed).toHaveLength(1);
  });
});
