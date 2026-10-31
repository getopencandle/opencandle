import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Exe paper flow r17: a trusted click on a virtual order line did not focus it (the pointerdown handler calls preventDefault,
// which in Chromium also cancels focus), so ArrowUp / ArrowDown, the documented one-tick move, never reached the line after
// a mouse click. The hooks are stubbed so the real component callbacks run without a DOM. Synthetic data, virtual money only.
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const stub = { ...actual, useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => undefined], useEffect: () => undefined, useRef: (value: unknown) => ({ current: value }) };
  return { ...stub, default: stub };
});
const { createPaperAccount, submitPaperOrder } = await import('../../src/domain/paper');
const { feedPaperBars } = await import('../../src/domain/paper-bar-feed');
const { PaperChartLines } = await import('../../src/ui/PaperChartLines');

const instrument = { id: 'SYNTHETIC:FOCUS', symbol: 'FOCUS', name: 'Synthetic focus', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' } as const;
function account() {
  const fed = feedPaperBars(createPaperAccount(), { bars: [{ time: 60, open: 100, high: 100, low: 100, close: 100, volume: 1 }], instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
  const placed = submitPaperOrder(fed, { instrument, side: 'buy', type: 'limit', limitPrice: 95, quantity: 2 } as never, 60); expect(placed.ok).toBe(true);
  return placed.account;
}
type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function find(node: unknown, test: (node: Node) => boolean): Node | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const hit = find(child, test); if (hit) return hit; } return null; }
  const element = node as Node; if (element.props && test(element)) return element;
  return element.props ? find(element.props.children, test) : null;
}

describe('virtual order line: pointer focus', () => {
  it('a primary-button press on the order line focuses it (without scrolling) so the arrow keys move it', () => {
    const projection = { left: 0, top: 0, width: 600, height: 300, priceToY: (price: number) => (110 - price) * 10, yToPrice: (y: number) => 110 - y / 10 };
    const tree = PaperChartLines({ account: account(), instrument, visible: true, projection: () => projection, onModifyOrder: () => true, onCancelOrder: () => undefined, onClosePosition: () => undefined });
    const slider = find(tree, node => node.props.role === 'slider')!;
    expect(slider.props['aria-label']).toBe('Move Buy limit 2 at 95.00');
    const focus = vi.fn(), target = { focus, setPointerCapture: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined };
    (slider.props.onPointerDown as (event: unknown) => void)({ button: 0, pointerId: 1, currentTarget: target, preventDefault: () => undefined, stopPropagation: () => undefined });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    const secondary = vi.fn();
    (slider.props.onPointerDown as (event: unknown) => void)({ button: 2, pointerId: 1, currentTarget: { ...target, focus: secondary }, preventDefault: () => undefined, stopPropagation: () => undefined });
    expect(secondary).not.toHaveBeenCalled();
    void React;
  });
});
