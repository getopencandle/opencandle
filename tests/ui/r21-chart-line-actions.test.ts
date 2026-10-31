import { beforeEach, describe, expect, it, vi } from 'vitest';

// Chart order lines.
// Order modify by drag ("Same committed result; cancellation restores committed anchor") and
// "Default off per 43000786671; on immediately places/modifies/cancels/closes", requirements/analysis.json.
// The React hooks run on a small controlled store so the real component callbacks execute without a DOM. Synthetic data, virtual money only.
const hooks = vi.hoisted(() => ({ cells: [] as unknown[], cursor: 0, effects: [] as Array<() => unknown> }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  const stub = {
    ...actual,
    useState: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.cells)) hooks.cells[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial; return [hooks.cells[index], (value: unknown) => { hooks.cells[index] = typeof value === 'function' ? (value as (old: unknown) => unknown)(hooks.cells[index]) : value; }]; },
    useRef: (initial: unknown) => { const index = hooks.cursor++; if (!(index in hooks.cells)) hooks.cells[index] = { current: initial }; return hooks.cells[index]; },
    useEffect: (effect: () => unknown) => { hooks.cursor++; hooks.effects.push(effect); },
  };
  return { ...stub, default: stub };
});
const { createPaperAccount, submitPaperOrder } = await import('../../src/domain/paper');
const { feedPaperBars } = await import('../../src/domain/paper-bar-feed');
const { PaperChartLines, createPaperLineDragSession } = await import('../../src/ui/PaperChartLines');
type Props = Parameters<typeof PaperChartLines>[0];

const instrument = { id: 'SYNTHETIC:R21', symbol: 'R21', name: 'Synthetic chart lines', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' } as const;
const fed = (account = createPaperAccount()) => feedPaperBars(account, { bars: [{ time: 60, open: 100, high: 100, low: 100, close: 100, volume: 1 }], instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
function withLimit() { const placed = submitPaperOrder(fed(), { instrument, side: 'buy', type: 'limit', limitPrice: 95, quantity: 2 } as never, 60); expect(placed.ok).toBe(true); return placed.account; }
function withPosition() { const placed = submitPaperOrder(fed(), { instrument, side: 'buy', type: 'market', quantity: 2 } as never, 60); expect(placed.ok).toBe(true); return fed(placed.account); }
const projection = { left: 0, top: 0, width: 600, height: 300, priceToY: (price: number) => (110 - price) * 10, yToPrice: (y: number) => 110 - y / 10 };
type Node = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function find(node: unknown, test: (node: Node) => boolean): Node | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const child of node) { const hit = find(child, test); if (hit) return hit; } return null; }
  const element = node as Node; if (element.props && test(element)) return element;
  if (typeof element.type === 'function' && element.props) return find((element.type as (props: unknown) => unknown)(element.props), test);
  return element.props ? find(element.props.children, test) : null;
}
const text = (node: unknown): string => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' && (node as Node).props ? text((node as Node).props.children) : '';

function mount(overrides: Partial<Props>) {
  const calls = { modify: [] as unknown[], cancel: [] as string[], close: [] as string[], attach: [] as unknown[], exit: [] as unknown[], notice: [] as string[] };
  const props: Props = { account: withLimit(), instrument, visible: true, projection: () => projection, onModifyOrder: (id, change) => { calls.modify.push([id, change]); return true; }, onCancelOrder: id => { calls.cancel.push(id); }, onClosePosition: id => { calls.close.push(id); }, onAttachExit: (id, leg, price) => { calls.attach.push([id, leg, price]); return true; }, onModifyExit: (id, price) => { calls.exit.push([id, price]); return true; }, onNotice: message => { calls.notice.push(message); }, ...overrides };
  let current = props;
  const render = () => { hooks.cursor = 0; hooks.effects = []; const tree = PaperChartLines(current); for (const effect of hooks.effects.splice(0)) { try { effect(); } catch { /* absent DOM ports */ } } hooks.cursor = 0; hooks.effects = []; return PaperChartLines(current); };
  render();
  const update = (next: Partial<Props>) => { current = { ...current, ...next }; return render(); };
  return { calls, render, update };
}
function pointerTarget() {
  const listeners = new Map<string, (event: unknown) => void>(), docListeners = new Map<string, (event: unknown) => void>();
  const ownerDocument = { addEventListener: (type: string, handler: (event: unknown) => void) => { docListeners.set(type, handler); }, removeEventListener: (type: string) => { docListeners.delete(type); } };
  const target = { focus: () => undefined, setPointerCapture: () => undefined, releasePointerCapture: () => undefined, addEventListener: (type: string, handler: (event: unknown) => void) => { listeners.set(type, handler); }, removeEventListener: (type: string) => { listeners.delete(type); }, ownerDocument };
  return { target, listeners, docListeners };
}
const press = (slider: Node, target: unknown) => (slider.props.onPointerDown as (event: unknown) => void)({ button: 0, pointerId: 1, currentTarget: target, preventDefault: () => undefined, stopPropagation: () => undefined });
const key = (name: string) => ({ key: name, preventDefault: vi.fn(), stopPropagation: vi.fn() });
const slider = (tree: unknown, label: string) => find(tree, node => node.props.role === 'slider' && node.props['aria-label'] === label)!;

beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; });

describe('createPaperLineDragSession', () => {
  it('previews snapped prices, commits on release and restores the anchor on Escape or pointer cancel', () => {
    const previews: number[] = [], finished: unknown[] = [];
    const make = () => createPaperLineDragSession({ startPrice: 95, tickSize: 0.01, yToPrice: y => 110 - y / 10, onPreview: price => previews.push(price), onFinish: result => finished.push(result) });
    const a = make(); a.move(147.04); expect(previews.at(-1)).toBe(95.3); a.release(); expect(finished.pop()).toEqual({ committed: true, price: 95.3 });
    const b = make(); b.move(120); expect(b.keydown('Escape')).toBe(true); expect(finished.pop()).toEqual({ committed: false, price: 95 }); b.release(); expect(finished).toEqual([]);
    const c = make(); c.move(120); c.cancel(); expect(finished.pop()).toEqual({ committed: false, price: 95 });
    const d = make(); expect(d.keydown('a')).toBe(false); d.move(Number.NaN); d.release(); expect(finished.pop()).toEqual({ committed: true, price: 95 });
  });
});

describe('order line drag: Escape restores the committed anchor', () => {
  it('Escape during a drag sends no change and the line returns to its price', () => {
    const ui = mount({});
    const { target, listeners, docListeners } = pointerTarget();
    press(slider(ui.render(), 'Move Buy limit 2 at 95.00'), target);
    listeners.get('pointermove')!({ clientY: 140 });
    expect(find(ui.render(), node => node.props['data-price'] === 96)).not.toBeNull();
    docListeners.get('keydown')!(key('Escape'));
    expect(listeners.size).toBe(0);
    expect(docListeners.size).toBe(0);
    expect(find(ui.render(), node => node.props['data-price'] === 95)).not.toBeNull();
    expect(ui.calls.modify).toEqual([]);
  });
  it('without confirmation (one-click on) a release modifies at once, as before', () => {
    const ui = mount({ confirmActions: false });
    const { target, listeners } = pointerTarget();
    press(slider(ui.render(), 'Move Buy limit 2 at 95.00'), target);
    listeners.get('pointermove')!({ clientY: 140 });
    listeners.get('pointerup')!({ type: 'pointerup', clientY: 140 });
    expect(ui.calls.modify).toHaveLength(1);
    expect((ui.calls.modify[0] as unknown[])[1]).toEqual({ limitPrice: 96 });
  });
  it('Escape during a drag-out from the position line attaches nothing', () => {
    const ui = mount({ account: withPosition() });
    const { target, listeners, docListeners } = pointerTarget();
    const out = find(ui.render(), node => node.props['aria-label'] === 'Drag a take profit or stop loss from the position')!;
    press(out, target);
    listeners.get('pointermove')!({ clientY: 50 });
    docListeners.get('keydown')!(key('Escape'));
    listeners.get('pointerup')?.({ type: 'pointerup', clientY: 50 });
    expect(ui.calls.attach).toEqual([]);
  });
});

describe('one-click off: chart line actions wait for an inline confirmation', () => {
  it('a dragged order waits at its new price; Confirm sends the same change a direct drag would', () => {
    const ui = mount({ confirmActions: true });
    const { target, listeners } = pointerTarget();
    press(slider(ui.render(), 'Move Buy limit 2 at 95.00'), target);
    listeners.get('pointermove')!({ clientY: 140 });
    listeners.get('pointerup')!({ type: 'pointerup', clientY: 140 });
    expect(ui.calls.modify).toEqual([]);
    const tree = ui.render(), prompt = find(tree, node => node.props['aria-label'] === 'Confirm virtual order change')!;
    expect(text(prompt)).toContain('Move Buy limit 2 to 96.00?');
    expect(find(tree, node => node.props['data-price'] === 96)).not.toBeNull();
    (find(prompt, node => node.type === 'button' && text(node) === 'Confirm')!.props.onClick as () => void)();
    expect(ui.calls.modify).toHaveLength(1);
    expect((ui.calls.modify[0] as unknown[])[1]).toEqual({ limitPrice: 96 });
    expect(find(ui.render(), node => node.props['aria-label'] === 'Confirm virtual order change')).toBeNull();
  });
  it('Keep (or Escape) drops the pending move and the line returns to its committed price', () => {
    const ui = mount({ confirmActions: true });
    const { target, listeners } = pointerTarget();
    press(slider(ui.render(), 'Move Buy limit 2 at 95.00'), target);
    listeners.get('pointermove')!({ clientY: 140 });
    listeners.get('pointerup')!({ type: 'pointerup', clientY: 140 });
    const prompt = find(ui.render(), node => node.props['aria-label'] === 'Confirm virtual order change')!;
    (prompt.props.onKeyDown as (event: unknown) => void)(key('Escape'));
    const after = ui.render();
    expect(find(after, node => node.props['aria-label'] === 'Confirm virtual order change')).toBeNull();
    expect(find(after, node => node.props['data-price'] === 95)).not.toBeNull();
    expect(ui.calls.modify).toEqual([]);
  });
  it('arrow keys step the pending price and Enter-able Confirm commits the total', () => {
    const ui = mount({ confirmActions: true });
    const line = slider(ui.render(), 'Move Buy limit 2 at 95.00');
    (line.props.onKeyDown as (event: unknown) => void)(key('ArrowUp'));
    (slider(ui.render(), 'Move Buy limit 2 at 95.00').props.onKeyDown as (event: unknown) => void)(key('ArrowUp'));
    const prompt = find(ui.render(), node => node.props['aria-label'] === 'Confirm virtual order change')!;
    expect(text(prompt)).toContain('to 95.02?');
    (find(prompt, node => node.type === 'button' && text(node) === 'Confirm')!.props.onClick as () => void)();
    expect((ui.calls.modify[0] as unknown[])[1]).toEqual({ limitPrice: 95.02 });
  });
  it('cancel and close from the chart ask first', () => {
    const ui = mount({ confirmActions: true });
    (find(ui.render(), node => node.type === 'button' && node.props['aria-label'] === 'Cancel Buy limit 2 at 95.00')!.props.onClick as () => void)();
    expect(ui.calls.cancel).toEqual([]);
    let prompt = find(ui.render(), node => node.props['aria-label'] === 'Confirm virtual order change')!;
    expect(text(prompt)).toContain('Cancel Buy limit 2 at 95.00?');
    (find(prompt, node => node.type === 'button' && text(node) === 'Confirm')!.props.onClick as () => void)();
    expect(ui.calls.cancel).toHaveLength(1);
    const position = mount({ confirmActions: true, account: withPosition() });
    (find(position.render(), node => node.type === 'button' && String(node.props['aria-label']).startsWith('Close Long 2'))!.props.onClick as () => void)();
    expect(position.calls.close).toEqual([]);
    prompt = find(position.render(), node => node.props['aria-label'] === 'Confirm virtual order change')!;
    expect(text(prompt)).toMatch(/^Close Long 2 at 100\.00/);
    (find(prompt, node => node.type === 'button' && text(node) === 'Confirm')!.props.onClick as () => void)();
    expect(position.calls.close).toEqual([instrument.id]);
  });
  it('a pending change whose order moved meanwhile is refused (stale revision) and nothing is sent', () => {
    const account = withLimit(), ui = mount({ confirmActions: true, account });
    (slider(ui.render(), 'Move Buy limit 2 at 95.00').props.onKeyDown as (event: unknown) => void)(key('ArrowUp'));
    // Another route (the order panel) moved the same order before the prompt was answered.
    const tree = ui.update({ account: { ...account, orders: account.orders.map(order => ({ ...order, limitPrice: 94 })) } });
    const prompt = find(tree, node => node.props['aria-label'] === 'Confirm virtual order change');
    if (prompt) (find(prompt, node => node.type === 'button' && text(node) === 'Confirm')!.props.onClick as () => void)();
    expect(ui.calls.modify).toEqual([]);
    expect(ui.calls.notice.join(' ')).toMatch(/changed/i);
  });
  it('exit lines and drag-out exits confirm too; Confirm applies the exact price', () => {
    const ui = mount({ confirmActions: true, account: withPosition() });
    const { target, listeners } = pointerTarget();
    press(find(ui.render(), node => node.props['aria-label'] === 'Drag a take profit or stop loss from the position')!, target);
    listeners.get('pointermove')!({ clientY: 50 });
    listeners.get('pointerup')!({ type: 'pointerup', clientY: 50 });
    expect(ui.calls.attach).toEqual([]);
    const prompt = find(ui.render(), node => node.props['aria-label'] === 'Confirm virtual order change')!;
    expect(text(prompt)).toContain('Add take profit 2 at 105.00?');
    (find(prompt, node => node.type === 'button' && text(node) === 'Confirm')!.props.onClick as () => void)();
    expect(ui.calls.attach).toEqual([[instrument.id, 'tp', 105]]);
  });
});
