import { describe, expect, it, vi } from 'vitest';
import { ChartTradingButtons, createActivationGuard, chartTradingButtonsBox, TRADING_BUTTONS_GAP, type ChartTradingButtonsProps } from '../../src/ui/ChartTradingButtons';

function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function all(tree: any, predicate: (node: any) => boolean, found: any[] = []): any[] {
  if (Array.isArray(tree)) tree.forEach(child => all(child, predicate, found));
  else if (tree?.props) { if (predicate(tree)) found.push(tree); all(tree.props.children, predicate, found); }
  return found;
}
const base = (overrides: Partial<ChartTradingButtonsProps> = {}): ChartTradingButtonsProps => ({ visible: true, legend: 'normal', legendBottom: 60, quote: { bid: 99.98, ask: 100.02 }, digits: 2, presetName: 'Pullback', presetTooltip: 'Buy limit, 10 units, 2 ticks below the ask, Day', oneClick: false, onBuy: vi.fn(), onSell: vi.fn(), ...overrides });
const render = (props: ChartTradingButtonsProps) => ChartTradingButtons(props) as any;
const buttons = (tree: any) => all(tree, node => node.type === 'button');

describe('chart Buy and Sell buttons', () => {
  it('shows the bid on Sell and the ask on Buy with the preset name as the label and its configuration as the tooltip', () => {
    const tree = render(base());
    const [sell, buy] = buttons(tree);
    expect(text(sell)).toBe('Sell99.98'); expect(text(buy)).toBe('Buy100.02');
    expect(sell.props['aria-label']).toBe('Sell at 99.98'); expect(buy.props['aria-label']).toBe('Buy at 100.02');
    expect(text(tree)).toContain('Preset: Pullback');
    expect(buy.props.title).toContain('Buy limit, 10 units, 2 ticks below the ask, Day');
    expect(buy.props.title).toContain('opens the order ticket');
    expect(buy.props.className).toContain('selected'); expect(buy.props['data-preset-selected']).toBe('true');
  });
  it('says what one-click does and shows no highlight without a preset', () => {
    const [, buy] = buttons(render(base({ oneClick: true, presetName: null, presetTooltip: null })));
    expect(buy.props.title).toContain('places the order at once with virtual funds');
    expect(buy.props.className).not.toContain('selected'); expect(buy.props['data-preset-selected']).toBe('false');
  });
  it('shows No quote when no usable quote exists', () => {
    const tree = render(base({ quote: null }));
    expect(text(tree)).toContain('No quote');
    expect(buttons(tree).map(node => text(node))).toEqual(['Sell', 'Buy']);
  });
  it('labels a last imported bar quote as the last imported price', () => {
    expect(text(render(base({ quote: { bid: 5, ask: 5, basis: 'last-imported-bar' } })))).toContain('last imported price');
    expect(text(render(base()))).not.toContain('last imported price');
  });
  it('is hidden when the setting is off and while the legend is collapsed or being edited', () => {
    expect(render(base({ visible: false }))).toBeNull();
    expect(render(base({ legend: 'collapsed' }))).toBeNull();
    expect(render(base({ legend: 'editing' }))).toBeNull();
  });
  it('sits below the legend block so it never covers a legend row or its buttons', () => {
    expect(chartTradingButtonsBox(60)).toEqual({ top: 60 + TRADING_BUTTONS_GAP, left: 8 });
    for (const legendBottom of [0, 24, 61, 180]) {
      const tree = render(base({ legendBottom }));
      expect(tree.props.style.top).toBeGreaterThanOrEqual(legendBottom + TRADING_BUTTONS_GAP);
      expect(tree.props.style.position).toBe('absolute');
    }
    expect(chartTradingButtonsBox(-20).top).toBe(TRADING_BUTTONS_GAP);
  });
  it('forwards clicks and disables both buttons with a stated reason', () => {
    const props = base({ guard: createActivationGuard(750, () => undefined) }); const [sell, buy] = buttons(render(props));
    sell.props.onClick(); buy.props.onClick();
    expect(props.onSell).toHaveBeenCalledOnce(); expect(props.onBuy).toHaveBeenCalledOnce();
    const disabled = buttons(render(base({ disabledReason: 'The account is changing' })));
    expect(disabled.every(node => node.props.disabled && node.props.title === 'The account is changing')).toBe(true);
  });
  it('a double click places one order, with one command identity, until the window closes', () => {
    const reopen: Array<() => void> = [];
    const guard = createActivationGuard(750, fn => { reopen.push(fn); });
    const onBuy = vi.fn(() => undefined); const props = base({ guard, onBuy, actionKey: 'acct-1|preset-1' });
    const [, buy] = buttons(render(props));
    buy.props.onClick(); buy.props.onClick();
    expect(onBuy).toHaveBeenCalledOnce();
    expect((onBuy.mock.calls as unknown as string[][])[0][0]).toMatch(/^chart-/);
    reopen.forEach(fn => fn());
    buy.props.onClick();
    expect(onBuy).toHaveBeenCalledTimes(2);
    expect(new Set((onBuy.mock.calls as unknown as string[][]).map(call => call[0])).size).toBe(2);
  });
  it('Buy and Sell, or a changed action key, are separate actions; a refused action does not block a retry', () => {
    const guard = createActivationGuard(750, () => undefined);
    const onBuy = vi.fn(), onSell = vi.fn();
    const [sell, buy] = buttons(render(base({ guard, onBuy, onSell, actionKey: 'a' })));
    buy.props.onClick(); sell.props.onClick(); expect(onBuy).toHaveBeenCalledOnce(); expect(onSell).toHaveBeenCalledOnce();
    const [, buyB] = buttons(render(base({ guard, onBuy, onSell, actionKey: 'b' }))); buyB.props.onClick(); expect(onBuy).toHaveBeenCalledTimes(2);
    const refusing = vi.fn(() => false); const [, buyC] = buttons(render(base({ guard: createActivationGuard(750, () => undefined), onBuy: refusing, actionKey: 'c' })));
    buyC.props.onClick(); buyC.props.onClick(); expect(refusing).toHaveBeenCalledTimes(2);
  });
  it('has an accessible group name and no internal identifiers in any text', () => {
    const tree = render(base());
    expect(tree.props.role).toBe('group'); expect(tree.props['aria-label']).toBe('Virtual trading');
    expect(text(tree) + buttons(tree).map(node => node.props.title + node.props['aria-label']).join('')).not.toMatch(/\bpaper-|:order:|local-paper|—/);
  });
});

describe('lane E chart buttons: quantity box and spread', () => {
  it('shows Sell, a quantity box, then Buy, and the spread between the quotes', () => {
    const changes: string[] = [];
    const tree = render(base({ quantity: '5', onQuantity: value => changes.push(value) }));
    const box = all(tree, node => node.type === 'input')[0];
    expect(box.props['aria-label']).toBe('Chart order quantity'); expect(box.props.value).toBe('5');
    box.props.onChange({ target: { value: '12' } }); expect(changes).toEqual(['12']);
    // The spread reads as its number between the quotes; its name is the label and tooltip.
    const spread = all(tree, node => node.type === 'small' && node.props.className === 'lv-trade-spread')[0];
    expect(text(spread)).toBe('0.04'); expect(spread.props['aria-label']).toBe('Spread 0.04');
    const kinds = all(tree, node => node.type === 'button' || node.type === 'input').map(node => node.type === 'input' ? 'qty' : text(node).slice(0, 3));
    expect(kinds).toEqual(['Sel', 'qty', 'Buy']);
  });
  it('hands the typed quantity to the action and has no box without a handler', () => {
    const seen: Array<string | undefined> = [];
    const [sell, buy] = buttons(render(base({ quantity: '7', onQuantity: () => {}, onBuy: (_id, quantity) => { seen.push(quantity); }, onSell: (_id, quantity) => { seen.push(quantity); } })));
    sell.props.onClick(); buy.props.onClick();
    expect(seen).toEqual(['7', '7']);
    expect(all(render(base()), node => node.type === 'input')).toEqual([]);
  });
});
