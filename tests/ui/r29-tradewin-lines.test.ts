import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Reverse button on the chart position line, its chart setting, and the One-click link.
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
const { reversePaperPosition } = await import('../../src/domain/paper');
const { documentWithAccountOneClick, oneClickChangeOf, oneClickStatus } = await import('../../src/ui/paper-one-click-link');
const { defaultChartSettingsDocument } = await import('../../src/chart/chart-settings-document');
const { findRow, factoryAppearance, factoryPriceScale } = await import('../../src/chart/chart-settings-bindings');

beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; });
const reverseButton = (tree: unknown) => find(tree, node => node.type === 'button' && String(node.props['aria-label'] ?? '').startsWith('Reverse '));

describe('Reverse on the chart position line', () => {
  it('shows Reverse next to Close and, with one-click on, reverses at once through the engine', () => {
    const reversed: string[] = [];
    const ui = mount({ account: withPosition(), confirmActions: false, onReversePosition: id => { reversed.push(id); } });
    const tree = ui.render(), button = reverseButton(tree)!;
    expect(button).not.toBeNull();
    expect(button.props['aria-label']).toMatch(/^Reverse Long 2 at 100\.00/);
    expect(find(tree, node => node.type === 'button' && String(node.props['aria-label'] ?? '').startsWith('Close Long 2'))).not.toBeNull();
    (button.props.onClick as () => void)();
    expect(reversed).toEqual([instrument.id]);
    // The engine action App wires: one market order for twice the position, filled on the current quote.
    const result = reversePaperPosition(withPosition(), instrument.id, 60);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.account.positions[instrument.id]?.quantity).toBe(-2);
  });
  it('with one-click off it asks first; Confirm reverses, Keep sends nothing', () => {
    const reversed: string[] = [];
    const ui = mount({ account: withPosition(), confirmActions: true, onReversePosition: id => { reversed.push(id); } });
    (reverseButton(ui.render())!.props.onClick as () => void)();
    expect(reversed).toEqual([]);
    const prompt = find(ui.render(), node => node.props['aria-label'] === 'Confirm virtual order change')!;
    expect(text(prompt)).toContain('Reverse Long 2 with one market order to sell 4?');
    (find(prompt, node => node.type === 'button' && text(node) === 'Confirm')!.props.onClick as () => void)();
    expect(reversed).toEqual([instrument.id]);
    (reverseButton(ui.render())!.props.onClick as () => void)();
    (find(ui.render(), node => node.type === 'button' && text(node) === 'Keep')!.props.onClick as () => void)();
    expect(reversed).toEqual([instrument.id]);
  });
  it('Chart settings > Trading > Reverse position button hides it, and the row is live', () => {
    const ui = mount({ account: withPosition(), onReversePosition: () => undefined, showReverse: false });
    expect(reverseButton(ui.render())).toBeNull();
    expect(reverseButton(mount({ account: withPosition() }).render())).toBeNull();
    const sources = { appearance: factoryAppearance(), document: defaultChartSettingsDocument(), documentConnected: true, priceScale: factoryPriceScale(), ratio: 0.5, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null, scaleMode: { scale: 'linear', invert: false, auto: true } } as never;
    expect(findRow('trading', sources, 'trading.reverseButton')!.availability).toEqual({ state: 'live' });
    expect(findRow('trading', sources, 'trading.tradingConfirmEnabled')!.availability).toEqual({ state: 'live' });
  });
});

describe('chart One-click and the paper account One-click are one switch', () => {
  it('the dialog shows the account value and an Ok that changes it asks the account to follow', () => {
    const doc = defaultChartSettingsDocument();
    expect(doc.trading.oneClick).toBe(false);
    const shown = documentWithAccountOneClick(doc, true);
    expect(shown.trading.oneClick).toBe(true); expect(doc.trading.oneClick).toBe(false);
    expect(documentWithAccountOneClick(doc, false)).toBe(doc);
    expect(documentWithAccountOneClick(doc, null)).toBe(doc);
    expect(oneClickChangeOf(shown, false)).toBe(true);
    expect(oneClickChangeOf(shown, true)).toBeNull();
    expect(oneClickChangeOf(undefined, true)).toBeNull();
    expect(oneClickChangeOf(shown, null)).toBeNull();
    expect(oneClickStatus(true)).toBe('Virtual actions now skip confirmation.');
  });
});
