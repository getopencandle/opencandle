import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaperAccount } from '../../src/domain/paper';
import type { Instrument } from '../../src/domain/types';
import { FloatingPanel } from '../../src/ui/FloatingPanel';
import { PaperDomPane, paperDomPanePlacement, setPaperDomPanePlacement } from '../../src/ui/PaperDomPane';
import { openPaperDomPane, closePaperDomPane, resetPaperDomPaneForTests, subscribePaperDomPane } from '../../src/ui/paper-dom-pane';
import { paperDomPaneOf, samePaperDomPane } from '../../src/ui/paper-dom-placement';

// The DOM pane's open state and dragged spot persist in the workspace. Handlers through controlled
// hooks (as strat-gui-1028-dom-pane.test.ts); no DOM or executable is exercised. Synthetic instrument, virtual money only.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as Array<() => void | (() => void)> }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return {
    ...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
    useState: (initial: any) => { const cells = hooks.cells, i = hooks.cursor++; if (!(i in cells)) cells[i] = typeof initial === 'function' ? initial() : initial; return [cells[i], (next: any) => { cells[i] = typeof next === 'function' ? next(cells[i]) : next; }]; },
    useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); }, useMemo: (make: () => any) => make(), useRef: (value: any) => ({ current: value }),
  };
});
vi.mock('react-dom', async () => ({ ...(await vi.importActual<any>('react-dom')), createPortal: (node: any) => node }));
const instrument: Instrument = { id: 'SYNTHETIC:PERF4', symbol: 'PFDX', name: 'Synthetic DOM pane', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.05, lotSize: 1 };
function find(node: any, predicate: (node: any) => boolean): any {
  if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found; } return null; }
  if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); }
  return null;
}
const panel = (props: Record<string, unknown>) => { hooks.cursor = 0; return FloatingPanel({ title: 'DOM: PFDX', onClose: () => {}, children: null, width: 460, ...props } as never); };
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; resetPaperDomPaneForTests(); vi.stubGlobal('window', { innerWidth: 1600, innerHeight: 900 }); });
afterEach(() => { setPaperDomPanePlacement(null); resetPaperDomPaneForTests(); vi.unstubAllGlobals(); });

describe('FloatingPanel initialAt and onMove', () => {
  it('opens at a saved spot, clamped so the header stays reachable; without one it keeps the default spot', () => {
    expect(panel({ initialAt: { x: 300, y: 200 } }).props.style).toMatchObject({ left: 300, top: 200 });
    hooks.cells = []; expect(panel({ initialAt: { x: 99999, y: -50 } }).props.style).toMatchObject({ left: 1600 - 48, top: 0 });
    hooks.cells = []; expect(panel({}).props.style).toMatchObject({ left: 1600 - 460 - 72, top: 104 });
    hooks.cells = []; expect(panel({ initialAt: { x: Number.NaN, y: 3 } }).props.style).toMatchObject({ left: 1600 - 460 - 72, top: 104 });
  });
  it('reports the final spot once per drag, at pointer up, and nothing for a click without movement', () => {
    const onMove = vi.fn(), tree = panel({ initialAt: { x: 300, y: 200 }, onMove }), header = find(tree, node => node.type === 'header');
    const drag = () => { const handlers: Record<string, (event: any) => void> = {}; const target = { setPointerCapture() {}, addEventListener: (name: string, handler: any) => { handlers[name] = handler; }, removeEventListener() {} };
      header.props.onPointerDown({ button: 0, target: { closest: () => null }, currentTarget: target, clientX: 10, clientY: 10, pointerId: 1, preventDefault() {} }); return handlers; };
    const first = drag(); first.pointermove({ clientX: 20, clientY: 15 }); first.pointermove({ clientX: 60, clientY: 40 }); expect(onMove).not.toHaveBeenCalled();
    first.pointerup({}); expect(onMove).toHaveBeenCalledTimes(1); expect(onMove).toHaveBeenCalledWith({ x: 350, y: 230 });
    const still = drag(); still.pointerup({}); expect(onMove).toHaveBeenCalledTimes(1);
  });
});

describe('PaperDomPane placement', () => {
  const account = createPaperAccount({ now: 100 });
  const pane = (extra: Record<string, unknown> = {}) => { hooks.cursor = 0; return PaperDomPane({ account, instrument, now: 100, onAccountChange: () => true, onClose: closePaperDomPane, ...extra } as never); };
  it('opens the floating panel at the registered spot and forwards the drag end to the registered save', () => {
    const onMove = vi.fn(); setPaperDomPanePlacement({ at: { x: 40, y: 120 }, onMove });
    const floating = find(pane(), node => node.type === FloatingPanel);
    expect(floating.props.initialAt).toEqual({ x: 40, y: 120 }); floating.props.onMove({ x: 50, y: 130 }); expect(onMove).toHaveBeenCalledWith({ x: 50, y: 130 });
    const own = vi.fn(), direct = find(pane({ initialAt: { x: 1, y: 2 }, onMove: own }), node => node.type === FloatingPanel);
    expect(direct.props.initialAt).toEqual({ x: 1, y: 2 }); direct.props.onMove({ x: 3, y: 4 }); expect(own).toHaveBeenCalledWith({ x: 3, y: 4 }); expect(onMove).toHaveBeenCalledTimes(1);
    setPaperDomPanePlacement(null); expect(paperDomPanePlacement()).toBeNull(); expect(find(pane(), node => node.type === FloatingPanel).props.initialAt).toBeUndefined();
  });
  it('reports open on mount; on unmount it reports closed only when the route store closed it (not when its dock went away)', () => {
    const onOpenChange = vi.fn(); setPaperDomPanePlacement({ onOpenChange }); subscribePaperDomPane(() => {}); openPaperDomPane('panel');
    pane(); const cleanup = hooks.effects.map(effect => effect()).find(value => typeof value === 'function') as () => void;
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    cleanup(); expect(onOpenChange).toHaveBeenCalledTimes(1);// still open in the store: the dock unmounted
    hooks.effects = []; pane(); const again = hooks.effects.map(effect => effect()).find(value => typeof value === 'function') as () => void;
    closePaperDomPane(); again(); expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

describe('workspace paperDomPane', () => {
  it('reads a saved value and treats a malformed one as absent', () => {
    expect(paperDomPaneOf({})).toBeNull();
    expect(paperDomPaneOf({ paperDomPane: { open: true, at: { x: 10.4, y: 20 } } })).toEqual({ open: true, at: { x: 10, y: 20 } });
    expect(paperDomPaneOf({ paperDomPane: { open: false } })).toEqual({ open: false });
    expect(paperDomPaneOf({ paperDomPane: { open: true, at: { x: 'a', y: 2 } } })).toEqual({ open: true });
    expect(paperDomPaneOf({ paperDomPane: { open: true, at: { x: 1e9, y: 2 } } })).toEqual({ open: true });
    for (const bad of [null, 1, 'open', [], { open: 'yes' }]) expect(paperDomPaneOf({ paperDomPane: bad })).toBeNull();
    expect(samePaperDomPane({ open: true, at: { x: 1, y: 2 } }, { open: true, at: { x: 1, y: 2 } })).toBe(true);
    expect(samePaperDomPane({ open: true }, { open: false })).toBe(false);
    expect(samePaperDomPane(null, null)).toBe(true); expect(samePaperDomPane(null, { open: false })).toBe(false);
  });
  it('App registers the save callbacks and reopens a saved open pane once the dock hosts it', () => {
    const app = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("setPaperDomPanePlacement({get at(){return saved()?.at??null;},onMove:point=>save({open:true,at:point}),onOpenChange:open=>{const at=saved()?.at;save(at?{open,at}:{open});}});");
    expect(app).toContain("if(loaded&&activeAccount&&!paperDomReopened.has(current)&&paperDomPaneHosted()){paperDomReopened.add(current);if(saved()?.open&&!paperDomPaneState().open)openPaperDomPane('panel');}");
    expect(app).toContain('commit({paperDomPane:next});');
  });
});
