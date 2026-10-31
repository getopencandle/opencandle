import { beforeEach, describe, expect, it, vi } from 'vitest';

// With the bottom panel open the price pane is short, and the chips of close order, position and exit lines
// sat on top of each other: "Move Buy limit 3 at 22.03" covered the Long position's Reverse button. The chips are now laid out
// together. These tests build the chips' boxes from the rendered element tree (top, margin-top, right or left, z-index and the
// controls in each chip) with this file's own width model (6 px a character, 12 px padding, 18 px a button, 40 px the TP/SL
// handle), then hit-test the center of every control like elementFromPoint: the topmost box there must be that control.
// The React hooks run on a small controlled store, so no DOM is needed. Synthetic instrument and prices, virtual money only.
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
const { attachPaperExitDrag } = await import('../../src/domain/paper-exit-drag');
const { PaperChartLines } = await import('../../src/ui/PaperChartLines');
const { AlertChartLines } = await import('../../src/ui/AlertChartLines');
const { createAxisTagBoard } = await import('../../src/chart/axis-tag-board');
const layout = await import('../../src/ui/line-label-layout').catch(() => null);
type PaperProps = Parameters<typeof PaperChartLines>[0];
type AlertProps = Parameters<typeof AlertChartLines>[0];
type Account = ReturnType<typeof createPaperAccount>;

const instrument = { id: 'SYNTHETIC:R39', symbol: 'R39', name: 'Synthetic order labels', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', tickSize: 0.01, lotSize: 1, timezone: 'UTC' } as const;
const feed = (account: Account, close: number) => feedPaperBars(account, { bars: [{ time: 60, open: close, high: close, low: close, close, volume: 1 }], instrument, provenance: { fixture: false, session: 'regular' }, live: false }).account;
/** The owner's case: Long 1 at 22.00 and a working Buy limit 3 at 22.03, plus (optionally) a take profit and a stop loss close by. */
function crowded(exits = true): Account {
  let account = feed(createPaperAccount(), 22);
  const bought = submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 1 } as never, 60); expect(bought.ok).toBe(true);
  account = feed(feed(bought.account, 22), 22.1);
  const limit = submitPaperOrder(account, { instrument, side: 'buy', type: 'limit', limitPrice: 22.03, quantity: 3 } as never, 60); expect(limit.ok).toBe(true);
  account = limit.account;
  if (exits) {
    const tp = attachPaperExitDrag(account, instrument.id, 'tp', 22.06, 120); expect(tp.ok).toBe(true);
    const sl = attachPaperExitDrag(tp.account, instrument.id, 'sl', 21.98, 120); expect(sl.ok).toBe(true);
    account = sl.account;
  }
  return account;
}
const WIDTH = 900;
/** A short pane: 100 px a dollar, so 22.03 and 22.00 are 3 px apart. */
const shortPane = (height: number) => ({ left: 0, top: 0, width: WIDTH, height, priceToY: (price: number) => height / 2 + (22.02 - price) * 100, yToPrice: (y: number) => 22.02 - (y - height / 2) / 100 });

type El = { type: unknown; props: Record<string, any> };
const isEl = (node: unknown): node is El => !!node && typeof node === 'object' && 'props' in (node as object);
const kids = (node: El): El[] => { const out: El[] = []; const walk = (child: unknown) => { if (Array.isArray(child)) child.forEach(walk); else if (isEl(child)) { if (typeof child.type === 'symbol') walk(child.props.children); else out.push(child); } }; walk(node.props.children); return out; };
const text = (node: unknown): string => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : isEl(node) ? text(node.props.children) : '';
const px = (value: unknown, fallback: number) => typeof value === 'number' ? value : fallback;

interface Box { el: El; name: string; left: number; right: number; top: number; bottom: number; layer: number; order: number }
const CHAR = 6, PAD = 12, BUTTON = 18, HANDLE = 40;
const widthOf = (el: El) => el.props.className === 'out' ? HANDLE : el.type === 'button' ? BUTTON : text(el).length * CHAR + PAD;
/** The boxes of every chip control, right to left from the chip's anchor (as the inline-flex chip lays them out). */
function paperBoxes(tree: El, paneWidth: number, alignment: 'left' | 'center' | 'right' = 'right', base = 0): { chips: Box[]; controls: Box[] } {
  const chips: Box[] = [], controls: Box[] = [];
  kids(tree).filter(el => String(el.props.className ?? '').startsWith('lv-paper-line ')).forEach((line, index) => {
    const chip = kids(line).find(el => el.props.className === 'chip'); if (!chip) return;
    const parts = kids(chip), width = parts.reduce((sum, part) => sum + widthOf(part), 0), style = chip.props.style ?? {};
    const left = alignment === 'left' ? px(style.left, 64) : alignment === 'center' ? paneWidth / 2 - width / 2 : paneWidth - px(style.right, 64) - width;
    const center = px(line.props.style?.top, NaN) + px(style.marginTop, 0), layer = base + px(line.props.style?.zIndex, 0);
    const box = { el: chip, name: text(parts[0]), left, right: left + width, top: center - 9, bottom: center + 9, layer, order: index };
    chips.push(box);
    let x = left; for (const part of parts) { const w = widthOf(part); controls.push({ ...box, el: part, name: String(part.props['aria-label'] ?? text(part)), left: x, right: x + w }); x += w; }
  });
  return { chips, controls };
}
function alertBoxes(tree: El, base = 0): Box[] {
  return kids(tree).filter(el => String(el.props.className ?? '').startsWith('lv-alert-line')).flatMap((line, index) => {
    const chip = kids(line).find(el => el.props.className === 'chip'); if (!chip) return [];
    // A chip anchored at the price-axis end carries style.right instead of style.left.
    const style = chip.props.style ?? {}, width = text(chip).length * CHAR + PAD, left = typeof style.right === 'number' ? WIDTH - style.right - width : px(style.left, 8), center = px(line.props.style?.top, NaN) + px(style.marginTop, 0);
    return [{ el: chip, name: String(chip.props['aria-label']), left, right: left + width, top: center - 8, bottom: center + 8, layer: base + px(line.props.style?.zIndex, 0), order: index }];
  });
}
const intersects = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
/** elementFromPoint over the boxes: the highest layer wins, then the later one in document order. */
function hit(boxes: readonly Box[], x: number, y: number): Box | null {
  const under = boxes.filter(box => x >= box.left && x < box.right && y >= box.top && y < box.bottom);
  return under.sort((a, b) => a.layer - b.layer || a.order - b.order).at(-1) ?? null;
}
function expectApart(chips: readonly Box[]) {
  for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) expect(intersects(chips[i], chips[j]), `${chips[i].name} / ${chips[j].name}`).toBe(false);
}
function expectEveryControlHit(controls: readonly Box[], all: readonly Box[] = controls) {
  for (const control of controls) {
    const top = hit(all, (control.left + control.right) / 2, (control.top + control.bottom) / 2);
    expect(top?.name, control.name).toBe(control.name);
    expect(top?.el).toBe(control.el);
  }
}

function mountPaper(overrides: Partial<PaperProps>) {
  const calls = { reverse: [] as string[], close: [] as string[], cancel: [] as string[] };
  const cells: unknown[] = [];
  const props: PaperProps = { account: crowded(), instrument, visible: true, projection: () => shortPane(120), onModifyOrder: () => true, onCancelOrder: id => { calls.cancel.push(id); }, onClosePosition: id => { calls.close.push(id); }, onReversePosition: id => { calls.reverse.push(id); }, onAttachExit: () => true, onModifyExit: () => true, ...overrides };
  const render = () => { hooks.cells = cells; hooks.cursor = 0; hooks.effects = []; const tree = PaperChartLines(props) as unknown as El; for (const effect of hooks.effects.splice(0)) { try { effect(); } catch { /* no DOM ports */ } } return tree; };
  render();
  return { calls, render };
}
function mountAlerts(overrides: Partial<AlertProps>) {
  const cells: unknown[] = [];
  const props: AlertProps = { rows: [], tickSize: 0.01, visible: true, projection: () => shortPane(120), onReprice: () => true, ...overrides };
  return () => { hooks.cells = cells; hooks.cursor = 0; hooks.effects = []; const tree = AlertChartLines(props) as unknown as El; for (const effect of hooks.effects.splice(0)) { try { effect(); } catch { /* no DOM ports */ } } return tree; };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; });

describe('crowded lines on a short price pane', () => {
  it('keeps the Buy limit chip off the Long position Reverse button (the r32 exe case)', () => {
    const { calls, render } = mountPaper({ account: crowded(false) });
    const tree = render(), { chips, controls } = paperBoxes(tree, WIDTH);
    expect(chips.map(chip => chip.name)).toEqual(['Long 1 at 22.00, P&L +0.10', 'Buy limit 3 at 22.03']);
    expectApart(chips);
    expectEveryControlHit(controls);
    const reverse = controls.find(box => box.name.startsWith('Reverse Long 1'))!;
    const found = hit(controls, (reverse.left + reverse.right) / 2, (reverse.top + reverse.bottom) / 2)!;
    found.el.props.onClick();
    expect(calls.reverse).toEqual([instrument.id]);
  });
  it('lays out position, limit, take profit and stop loss chips 8 px apart without any overlap', () => {
    const { render } = mountPaper({});
    const { chips, controls } = paperBoxes(render(), WIDTH);
    expect(chips).toHaveLength(4);
    expectApart(chips);
    expectEveryControlHit(controls);
    // The position chip stays on its line; the others moved to make room.
    const tree = render(), position = kids(tree).find(el => String(el.props.className).startsWith('lv-paper-line position'))!;
    expect(kids(position).find(el => el.props.className === 'chip')!.props.style?.marginTop ?? 0).toBe(0);
    expect(kids(tree).filter(el => el.props['data-label-moved'] === 'true').length).toBeGreaterThan(0);
    for (const chip of chips) { expect(chip.top).toBeGreaterThanOrEqual(0); expect(chip.bottom).toBeLessThanOrEqual(120); }
  });
  it('steps chips sideways when the pane is too short to stack them', () => {
    const { render } = mountPaper({ projection: () => shortPane(40) });
    const { chips, controls } = paperBoxes(render(), WIDTH);
    expect(chips).toHaveLength(4);
    expectApart(chips);
    expectEveryControlHit(controls);
    for (const chip of chips) { expect(chip.left).toBeGreaterThanOrEqual(0); expect(chip.top).toBeGreaterThanOrEqual(0); expect(chip.bottom).toBeLessThanOrEqual(40); }
  });
  it('works at Left and Center alignment too', () => {
    for (const alignment of ['left', 'center'] as const) {
      const { render } = mountPaper({ alignment });
      const { chips, controls } = paperBoxes(render(), WIDTH, alignment);
      expectApart(chips);
      expectEveryControlHit(controls);
    }
  });
  it('keeps alert chips clear of the order and position chips they share the pane with', () => {
    const board = createAxisTagBoard(() => null);
    const { render } = mountPaper({ alignment: 'left', tagBoard: board });
    const rows = [{ alertId: 'a1', name: 'SYNTHETIC level', slot: 'level' as const, price: 22.01, label: 'SYNTHETIC 22.01' }, { alertId: 'a2', name: 'SYNTHETIC second', slot: 'level' as const, price: 22.02, label: 'SYNTHETIC 22.02 second' }];
    const paperTree = render(), alerts = mountAlerts({ rows, tagBoard: board })();
    // The alert overlay comes first in the document, the paper overlay after it (App order), both at z-index 4.
    const alertChips = alertBoxes(alerts, 0), { chips, controls } = paperBoxes(paperTree, WIDTH, 'left', 10);
    expect(alertChips).toHaveLength(2);
    expectApart([...alertChips, ...chips]);
    expectEveryControlHit([...alertChips, ...controls]);
  });
  it('raises the confirming position chip, with its Confirm box, over its neighbours', () => {
    const { render } = mountPaper({ confirmActions: true, account: crowded(false) });
    const first = paperBoxes(render(), WIDTH).controls.find(box => box.name.startsWith('Close Long 1'))!;
    first.el.props.onClick();
    const tree = render(), position = kids(tree).find(el => String(el.props.className).startsWith('lv-paper-line position'))!;
    const others = kids(tree).filter(el => String(el.props.className).startsWith('lv-paper-line ') && el !== position).map(el => px(el.props.style?.zIndex, 0));
    expect(px(position.props.style?.zIndex, 0)).toBeGreaterThan(Math.max(...others));
    expect(kids(position).some(el => el.props.className === 'lv-paper-confirm')).toBe(true);
  });
  it('leaves lines that do not collide exactly where they were', () => {
    const roomy = { left: 0, top: 0, width: WIDTH, height: 600, priceToY: (price: number) => 300 + (22.02 - price) * 10000, yToPrice: (y: number) => 22.02 - (y - 300) / 10000 };
    const { render } = mountPaper({ projection: () => roomy });
    const tree = render();
    expect(kids(tree).some(el => el.props['data-label-moved'])).toBe(false);
    for (const line of kids(tree).filter(el => String(el.props.className).startsWith('lv-paper-line '))) expect(kids(line).find(el => el.props.className === 'chip')!.props.style).toBeUndefined();
  });
});

describe('the label layout', () => {
  const row = (id: string, y: number, extra: Record<string, unknown> = {}) => ({ id, y, height: 18, left: 500, right: 700, step: 'left' as const, ...extra });
  it('moves the later label to the nearest free height and keeps the first one in place', () => {
    const spots = layout!.layoutLineLabels([row('position', 60), row('limit', 57)], { width: 900, height: 120 });
    expect(spots.get('position')!.center).toBe(60);
    expect(spots.get('limit')!.center).toBe(60 - 18 - layout!.LINE_LABEL_GAP);
    expect(layout!.labelRectsIntersect(spots.get('position')!.rect, spots.get('limit')!.rect)).toBe(false);
  });
  it('keeps an anchored (dragged) label where it is, so the others yield to it', () => {
    const spots = layout!.layoutLineLabels([row('drag', 58, { anchor: true }), row('position', 60)], { width: 900, height: 120 });
    expect(spots.get('drag')!.center).toBe(58);
    expect(Math.abs(spots.get('position')!.center - 58)).toBeGreaterThanOrEqual(18 + layout!.LINE_LABEL_GAP);
  });
  it('does not push labels that share no horizontal span, and avoids obstacles', () => {
    const apart = layout!.layoutLineLabels([row('right', 60), { ...row('left', 60), left: 8, right: 120, step: 'right' as const }], { width: 900, height: 120 });
    expect(apart.get('left')!.center).toBe(60);
    const blocked = layout!.layoutLineLabels([row('alert', 60)], { width: 900, height: 120 }, [{ left: 450, right: 750, top: 51, bottom: 69 }]);
    expect(blocked.get('alert')!.center === 60).toBe(false);
  });
  it('steps sideways inside the pane when no height is free, and reports an overlap only when nothing fits', () => {
    const sideways = layout!.layoutLineLabels([row('a', 10), row('b', 10)], { width: 900, height: 20 });
    expect(sideways.get('b')!.dx).toBe(500 - layout!.LINE_LABEL_GAP - 700);
    expect(sideways.get('b')!.overlaps).toBe(false);
    const full = layout!.layoutLineLabels([row('a', 10), row('b', 10)], { width: 700, height: 20 });
    expect(full.get('b')!.overlaps).toBe(false);
    const none = layout!.layoutLineLabels([{ ...row('a', 10), left: 0, right: 300 }, { ...row('b', 10), left: 0, right: 300 }], { width: 300, height: 20 });
    expect(none.get('b')!.overlaps).toBe(true);
  });
});
