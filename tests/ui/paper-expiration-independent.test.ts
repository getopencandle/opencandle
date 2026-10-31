import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaperPanel, type PaperPanelProps } from '../../src/ui/PaperPanel';
import { createPaperAccount, processPaperQuote, restorePaperAccount, submitPaperOrder, type PaperAccount, type PaperOrder } from '../../src/domain/paper';
import type { Instrument, Quote } from '../../src/domain/types';

// Actual returned controls and handlers, with controlled hook lifecycle. No DOM,
// accessibility tree, mouse input, native window or packaged executable is exercised.
interface EffectSlot { dependencies: readonly unknown[] | undefined; cleanup?: () => void; }
interface HookStore { cells: unknown[]; cursor: number; effects: Map<number, EffectSlot>; pending: Array<() => void>; writes: number; }
const hooks = vi.hoisted(() => ({ current: null as HookStore | null }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const store = () => { if (!hooks.current) throw new Error('No active hook model'); return hooks.current; };
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const state = store(), index = state.cursor++;
      if (!(index in state.cells)) state.cells[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [state.cells[index] as T, (next: T | ((previous: T) => T)) => {
        state.writes++; state.cells[index] = typeof next === 'function' ? (next as (previous: T) => T)(state.cells[index] as T) : next;
      }];
    },
    useRef<T>(initial: T) {
      const state = store(), index = state.cursor++;
      if (!(index in state.cells)) state.cells[index] = { current: initial };
      return state.cells[index] as { current: T };
    },
    useEffect(create: () => void | (() => void), dependencies?: readonly unknown[]) {
      const state = store(), index = state.cursor++, previous = state.effects.get(index);
      if (previous && dependencies && previous.dependencies && dependencies.length === previous.dependencies.length && dependencies.every((entry, i) => Object.is(entry, previous.dependencies![i]))) return;
      const slot: EffectSlot = { dependencies: dependencies?.slice() };
      state.effects.set(index, slot);
      state.pending.push(() => { previous?.cleanup?.(); const cleanup = create(); if (typeof cleanup === 'function') slot.cleanup = cleanup; });
    },
  };
});

interface ElementModel { type: unknown; props: Record<string, unknown>; }
function isElement(value: unknown): value is ElementModel {
  return value !== null && typeof value === 'object' && 'props' in value && (value as ElementModel).props !== null && typeof (value as ElementModel).props === 'object';
}
function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(text).join('');
  return isElement(value) ? text(value.props.children) : '';
}
function collect(value: unknown, predicate: (node: ElementModel) => boolean): ElementModel[] {
  if (Array.isArray(value)) return value.flatMap(child => collect(child, predicate));
  if (!isElement(value)) return [];
  return [...(predicate(value) ? [value] : []), ...collect(value.props.children, predicate)];
}
const instrument: Instrument = { id: 'SYNTHETIC:EXPIRY', symbol: 'EXPIRY', name: 'Synthetic expiration handler oracle', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'America/New_York', tickSize: .01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 10, ask: 10, eventTime: 1000, receivedAt: 1000, availableAt: 1000, sequence: 1, fixture: true, session: 'regular' };
const keyEvent = () => ({ key: 'Escape', nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn() });
type KeyEvent = ReturnType<typeof keyEvent>;
const cleanups: Array<() => void> = [];

function setup(overrides: Partial<PaperPanelProps> = {}) {
  const initial = createPaperAccount({ initialBalance: 1000, now: 1000 });
  const fed = processPaperQuote(initial, quote, 1000, initial.runId, instrument);
  expect(fed.ok, JSON.stringify(fed.diagnostics)).toBe(true);
  const state: HookStore = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
  const props: PaperPanelProps = { account: fed.account, instrument, quote, quoteSource: { key: 'Synthetic exact expiry source A', state: 'ready' }, now: 1000, onAccountChange: () => true, ...overrides };
  const publish = vi.fn((next: PaperAccount, expected?: PaperAccount) => {
    if (expected !== props.account) return false;
    props.account = next; return true;
  });
  props.onAccountChange = publish;
  let retired = false;
  const render = () => {
    if (retired) throw new Error('Cannot render a retired handler model');
    let tree: unknown;
    for (let pass = 0; pass < 12; pass++) {
      hooks.current = state; state.cursor = 0; const writes = state.writes;
      tree = PaperPanel(props);
      const pending = state.pending.splice(0); for (const effect of pending) effect();
      if (state.writes === writes) return tree;
    }
    throw new Error('Hook model did not settle');
  };
  const node = (predicate: (item: ElementModel) => boolean, root: unknown = render()) => {
    const found = collect(root, predicate); if (found.length !== 1) throw new Error(`Expected one control, received ${found.length}`); return found[0];
  };
  const byLabel = (label: string) => node(item => item.props['aria-label'] === label);
  const button = (name: string) => node(item => item.type === 'button' && text(item) === name);
  const click = (name: string) => { (button(name).props.onClick as () => void)(); render(); };
  const change = (label: string, value: string) => { (byLabel(label).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } }); render(); };
  const submit = () => { (byLabel('Virtual order ticket').props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault: vi.fn() }); render(); };
  const unmount = () => { if (retired) return; retired = true; for (const effect of state.effects.values()) effect.cleanup?.(); state.pending.length = 0; };
  cleanups.push(unmount); render();
  const orders = () => {
    const table = node(item => item.type === 'table' && collect(item, child => child.type === 'th' && text(child) === 'Expiry (UTC)').length === 1);
    const headers = collect(table, item => item.type === 'th').map(text);
    const rows = collect(table, item => item.type === 'tr' && collect(item, child => child.type === 'td').length > 0).map(row => collect(row, item => item.type === 'td'));
    return { headers, rows };
  };
  return { props, publish, state, render, node, byLabel, button, click, change, submit, unmount, orders, text: () => text(render()) };
}
function addWorking(ui: ReturnType<typeof setup>, timeInForce: 'DAY' | 'GTD' | 'GTC', expiresAt?: number) {
  const result = submitPaperOrder(ui.props.account, { instrument: ui.props.instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 9, timeInForce, ...(expiresAt === undefined ? {} : { expiresAt }) }, ui.props.now);
  expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
  ui.props.account = result.account; ui.render(); return result.account.orders.at(-1)!;
}
function pendingGtd(ui: ReturnType<typeof setup>) {
  ui.change('Order type', 'limit'); ui.change('Limit price', '9'); ui.change('Time in force', 'GTD');
}
beforeEach(() => { hooks.current = null; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('HANDLER.PAPER.ORDERS.EXPIRY / PAPER.EXPIRY.FORMAT.ROUNDTRIP: untouched generated GTD cancels then confirms exact 87400', () => {
  const ui = setup(), before = structuredClone(ui.props.account);
  pendingGtd(ui);
  expect(ui.byLabel('Order expiration').props.value).toBe('1970-01-02T00:16:40Z');
  ui.submit(); expect(ui.text()).toContain('Confirm virtual order'); ui.click('Cancel');
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
  expect(ui.byLabel('Order expiration').props.value).toBe('1970-01-02T00:16:40Z');
  ui.submit(); ui.click('Confirm');
  expect(ui.publish).toHaveBeenCalledTimes(1);
  expect(ui.props.account.orders).toHaveLength(1);
  expect(restorePaperAccount(ui.props.account).orders[0]).toMatchObject({ quantity: 1, timeInForce: 'GTD', expiresAt: 87400, status: 'working' });
  expect(ui.props.account.fills).toEqual([]); expect(ui.props.account.cash).toBe(1000);
  expect(ui.orders().headers).toEqual(['Symbol', 'Side / type', 'Quantity', 'Limit / stop', 'Instruction', 'Status', 'Expiry (UTC)', 'Actions']);
  expect(text(ui.orders().rows[0][6])).toBe('1970-01-02 00:16:40');
});

it('PAPER.EXPIRY.DAY.ACCEPTANCE: default Day materializes from current accepted time, not draft creation', () => {
  const ui = setup(); ui.change('Order type', 'limit'); ui.change('Limit price', '9');
  expect(ui.byLabel('Time in force').props.value).toBe('DAY'); ui.submit();
  ui.props.now = 1010; ui.render(); ui.click('Confirm');
  expect(ui.publish).toHaveBeenCalledTimes(1);
  // US equity Day ends at the next regular close after acceptance (1970-01-01 16:00 New York).
  expect(ui.props.account.orders[0]).toMatchObject({ timeInForce: 'DAY', expiresAt: 75600, status: 'working' });
  expect(text(ui.orders().rows[0][6])).toBe('1970-01-01 21:00:00');
});

it.each(['DAY', 'GTD', 'GTC'] as const)('PAPER.EXPIRY.CANONICAL.PRIORITY: %s quantity edits preserve canonical expiry through Cancel and Confirm', timeInForce => {
  const ui = setup(), order = addWorking(ui, timeInForce, 1100), before = structuredClone(ui.props.account);
  ui.props.now = 1001; ui.render(); ui.click('Modify');
  expect(ui.byLabel('Time in force').props.disabled).toBe(true);
  if (timeInForce !== 'GTC') expect(ui.byLabel('Order expiration').props.value).toBe('1970-01-01T00:18:20Z');
  ui.change('Order quantity', '2'); ui.submit(); ui.click('Cancel');
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
  expect(ui.byLabel('Order quantity').props.value).toBe('2');
  ui.submit(); ui.click('Confirm');
  expect(ui.publish).toHaveBeenCalledTimes(1);
  expect(restorePaperAccount(ui.props.account).orders[0]).toMatchObject({ id: order.id, quantity: 2, timeInForce, expiresAt: 1100, status: 'working' });
  expect(text(ui.orders().rows[0][6])).toBe('1970-01-01 00:18:20');
  expect(ui.props.account.fills).toEqual([]);
});

it('PAPER.EXPIRY.CANONICAL.PRIORITY: absent legacy GTC remains visibly unscheduled after a quantity edit', () => {
  const ui = setup(); addWorking(ui, 'GTC');
  expect(text(ui.orders().rows[0][6])).toBe('No scheduled expiry');
  ui.click('Modify'); ui.change('Order quantity', '2'); ui.submit(); ui.click('Confirm');
  expect(ui.publish).toHaveBeenCalledTimes(1);
  expect(ui.props.account.orders[0]).not.toHaveProperty('expiresAt');
  expect(text(ui.orders().rows[0][6])).toBe('No scheduled expiry');
});

it('PAPER.EXPIRY.CANONICAL.PRIORITY: unsupported finite GTC is unavailable with raw seconds, never unscheduled', () => {
  const ui = setup(); addWorking(ui, 'GTC', 253402300800); const before = structuredClone(ui.props.account);
  const cell = ui.orders().rows[0][6];
  expect(text(cell)).toBe('Expiry unavailable'); expect(cell.props.title).toBe('Stored expiry seconds: 253402300800');
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
  expect(restorePaperAccount(ui.props.account).orders[0].expiresAt).toBe(253402300800);
});

it('HANDLER.PAPER.ORDERS.EXPIRY: another instrument row displays its own admitted canonical expiry', () => {
  const ui = setup(); addWorking(ui, 'GTD', 1100);
  const second: Instrument = { ...instrument, id: 'SYNTHETIC:SECOND', symbol: 'SECOND', name: 'Synthetic second expiry instrument', assetClass: 'etf' };
  const submitted = submitPaperOrder(ui.props.account, { instrument: second, side: 'buy', type: 'limit', quantity: 2, limitPrice: 8, timeInForce: 'DAY', expiresAt: 1200 }, 1000);
  expect(submitted.ok, JSON.stringify(submitted.diagnostics)).toBe(true);
  ui.props.account = restorePaperAccount(submitted.account);
  const before = structuredClone(ui.props.account); ui.render();
  expect(ui.props.instrument.id).toBe('SYNTHETIC:EXPIRY');
  expect(ui.orders().rows.map(row => [text(row[0]), text(row[2]), text(row[5]), text(row[6])])).toEqual([
    ['EXPIRY', '1', 'working', '1970-01-01 00:18:20'],
    ['SECOND', '2', 'working', '1970-01-01 00:20:00'],
  ]);
  expect(ui.props.account.orders.find(order => order.id === submitted.orderId)).toMatchObject({ instrument: second, timeInForce: 'DAY', expiresAt: 1200 });
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
});

it('HANDLER.PAPER.ORDERS.EXPIRY: engine-created protective children have no scheduled expiry independent of parent Day', () => {
  const ui = setup();
  const submitted = submitPaperOrder(ui.props.account, {
    instrument, side: 'buy', type: 'market', quantity: 1, timeInForce: 'DAY', expiresAt: 1100,
    exits: { schemaVersion: 1, mode: 'single', levels: [{ quantity: 1, takeProfit: 12, stopLoss: 8 }] },
  }, 1000);
  expect(submitted.ok, JSON.stringify(submitted.diagnostics)).toBe(true);
  ui.props.account = restorePaperAccount(submitted.account);
  expect(ui.props.account.orders.find(order => order.id === submitted.orderId)).toMatchObject({ status: 'filled', timeInForce: 'DAY', expiresAt: 1100 });
  const children = ui.props.account.orders.filter(order => order.bracket);
  expect(children).toHaveLength(2);
  expect(children.map(order => order.bracket!.leg).sort()).toEqual(['sl', 'tp']);
  for (const child of children) {
    expect(child).toMatchObject({ timeInForce: 'GTC', status: 'working', reduceOnly: true, quantity: 1 });
    expect(child).not.toHaveProperty('expiresAt');
  }
  const before = structuredClone(ui.props.account); ui.render();
  expect(ui.orders().rows.map(row => [text(row[0]), text(row[1]), text(row[5]), text(row[6])]).sort((left, right) => left[1].localeCompare(right[1]))).toEqual([
    ['EXPIRY', 'sell limit', 'working', 'No scheduled expiry'],
    ['EXPIRY', 'sell stop', 'working', 'No scheduled expiry'],
  ]);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
});

it('PAPER.EXPIRY.CANONICAL.PRIORITY: quantity-only edit preserves an admitted beyond-year9999 legacy GTC deadline', () => {
  const ui = setup(), order = addWorking(ui, 'GTC', 253402300800);
  ui.props.account = restorePaperAccount(ui.props.account); const before = structuredClone(ui.props.account);
  ui.props.now = 1001; ui.render(); ui.click('Modify');
  expect(ui.byLabel('Time in force').props.value).toBe('GTC'); expect(ui.byLabel('Time in force').props.disabled).toBe(true);
  ui.change('Order quantity', '2'); ui.submit(); ui.click('Cancel');
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
  ui.submit(); ui.click('Confirm');
  expect(ui.publish).toHaveBeenCalledTimes(1);
  expect(restorePaperAccount(ui.props.account).orders[0]).toMatchObject({ id: order.id, quantity: 2, timeInForce: 'GTC', expiresAt: 253402300800, status: 'working' });
  expect(ui.props.account.fills).toEqual([]);
  const cell = ui.orders().rows[0][6]; expect(text(cell)).toBe('Expiry unavailable'); expect(cell.props.title).toBe('Stored expiry seconds: 253402300800');
});

it.each(['DAY', 'GTD', undefined] as const)('HANDLER.PAPER.ORDERS.EXPIRY: defensive missing expiry with TIF %s is unavailable without normalizing a malformed record', timeInForce => {
  const ui = setup(); addWorking(ui, 'GTC');
  // Deliberately malformed component input only. This is not an admitted saved-order fixture.
  const order = ui.props.account.orders[0];
  if (timeInForce === undefined) delete order.timeInForce; else order.timeInForce = timeInForce;
  const before = structuredClone(ui.props.account); ui.render();
  expect(text(ui.orders().rows[0][6])).toBe('Expiry unavailable');
  if (timeInForce) { ui.click('Modify'); expect(ui.byLabel('Order expiration').props.value).toBe(''); }
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
});

it('HANDLER.PAPER.ORDERS.EXPIRY: canonical expiry overrides conflicting informational ticket provenance', () => {
  const ui = setup(); pendingGtd(ui); ui.submit(); ui.click('Confirm');
  const canonical = ui.props.account.orders[0];
  expect(canonical.ticket?.input.validity).toEqual({ kind: 'manual-expiry', expiresAt: 87400 });
  canonical.expiresAt = 1100;
  const admitted = restorePaperAccount(ui.props.account); ui.props.account = admitted; ui.publish.mockClear();
  const before = structuredClone(admitted); ui.render();
  expect(text(ui.orders().rows[0][6])).toBe('1970-01-01 00:18:20');
  ui.click('Modify'); expect(ui.byLabel('Order expiration').props.value).toBe('1970-01-01T00:18:20Z');
  ui.click('Cancel edit');
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
});

it('PAPER.EXPIRY.CLOCK.ISOLATION / HANDLER.PAPER.CLOCK.DISCLOSURE: distinct clock values and past expiry render without account effects', () => {
  const ui = setup(); addWorking(ui, 'GTD', 1100); const before = structuredClone(ui.props.account);
  const wallClock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Wall clock must not drive this panel'); });
  ui.props.now = 1101; ui.render();
  const notice = text(ui.byLabel('Paper simulation time'));
  expect(notice).toContain('Simulation clock (UTC): 1970-01-01 00:16:40 UTC');
  expect(notice).toContain('Current ticket time (UTC): 1970-01-01 00:18:21 UTC');
  expect(notice).toContain('Order expiry follows simulation time. Viewing this panel does not advance orders. Expiry processing stops when OpenCandle is closed.');
  expect(text(ui.orders().rows[0][5])).toBe('working');
  expect(text(ui.orders().rows[0][6])).toBe('1970-01-01 00:18:20');
  ui.click('History');
  expect(collect(ui.render(), node => node.type === 'th' && text(node) === 'Expiry (UTC)')).toEqual([]);
  ui.click('Orders (1)');
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
  expect(wallClock).not.toHaveBeenCalled();
});

it('HANDLER.PAPER.CLOCK.DISCLOSURE: account clock ahead of chart time stays separate and unavailable values are not substituted', () => {
  const ui = setup(); ui.props.account.clock = 1005; ui.render();
  let notice = text(ui.byLabel('Paper simulation time'));
  expect(notice).toContain('Simulation clock (UTC): 1970-01-01 00:16:45 UTC');
  expect(notice).toContain('Current ticket time (UTC): 1970-01-01 00:16:40 UTC');
  ui.props.now = 253402300800; ui.props.account.clock = NaN; const before = structuredClone(ui.props.account); ui.render();
  notice = text(ui.byLabel('Paper simulation time'));
  expect(notice).toContain('Simulation clock (UTC): Unavailable'); expect(notice).toContain('Current ticket time (UTC): Unavailable');
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
});

it.each(['1970-01-02T00:16:40.000Z', '1970-01-02T00:16:40.125Z', '1970-01-02T00:16:40', '2026-02-30T12:00:00Z', '1970-01-01T00:16:40Z'])('PAPER.EXPIRY.INVALID.RECOVERY: explicit invalid or elapsed input %s refuses then recovers through actual controls', bad => {
  const ui = setup(); pendingGtd(ui); ui.change('Order expiration', bad); ui.submit();
  expect(collect(ui.render(), node => node.props.role === 'alertdialog')).toEqual([]);
  expect(ui.node(node => node.props.role === 'status').props.children).toBeTruthy();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account.orders).toEqual([]);
  ui.change('Order expiration', '1970-01-01T19:16:40-05:00'); ui.submit(); ui.click('Confirm');
  expect(ui.publish).toHaveBeenCalledTimes(1);
  expect(ui.props.account.orders[0]).toMatchObject({ timeInForce: 'GTD', expiresAt: 87400 });
});

it('PAPER.EXPIRY.INVALID.RECOVERY: changing an expiry retires its old confirmation without any late state write', () => {
  const ui = setup(); pendingGtd(ui); ui.submit();
  const retained = ui.button('Confirm').props.onClick as () => void;
  ui.change('Order expiration', '1970-01-02T00:16:41Z');
  const writes = ui.state.writes; retained();
  expect(ui.state.writes).toBe(writes); expect(ui.publish).not.toHaveBeenCalled();
  ui.submit(); ui.click('Confirm'); expect(ui.props.account.orders[0].expiresAt).toBe(87401);
});

it.each(['source', 'account'] as const)('PAPER.ORDER.RACE / PAPER.EXPIRY.INVALID.RECOVERY: accepted expiry confirmation refuses replaced %s identity', replacement => {
  const ui = setup(); pendingGtd(ui); ui.submit(); const retained = ui.button('Confirm').props.onClick as () => void;
  if (replacement === 'source') ui.props.quoteSource = { key: 'Different exact synthetic source B', state: 'ready' };
  else ui.props.account = restorePaperAccount(ui.props.account);
  const before = structuredClone(ui.props.account); ui.render(); retained(); ui.render();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.account).toEqual(before);
  expect(ui.text()).toContain('changed');
});

it('PAPER.EXPIRY.INVALID.RECOVERY: Escape cancels once and unmount retires a second retained confirmation', () => {
  const ui = setup(); pendingGtd(ui); ui.submit();
  const retained = ui.button('Confirm').props.onClick as () => void;
  const dialog = ui.node(node => node.props.role === 'alertdialog');
  (dialog.props.onKeyDown as (event: KeyEvent) => void)(keyEvent()); ui.render();
  const writes = ui.state.writes; retained(); expect(ui.state.writes).toBe(writes); expect(ui.publish).not.toHaveBeenCalled();
  ui.submit(); const second = ui.button('Confirm').props.onClick as () => void;
  ui.unmount(); const unmountedWrites = ui.state.writes; second();
  expect(ui.state.writes).toBe(unmountedWrites); expect(ui.publish).not.toHaveBeenCalled();
});

it('PAPER.EXPIRY.WEEK / PAPER.EXPIRY.MONTH: Week and Month are offered as enabled choices next to GTC (the hold was released)', () => {
  const ui = setup(), options = collect(ui.byLabel('Time in force'), node => node.type === 'option');
  expect(options.map(option => option.props.value)).toEqual(['DAY', 'GTC', 'GTD', 'WEEK', 'MONTH']);
  expect(options.filter(option => ['WEEK', 'MONTH'].includes(String(option.props.value))).every(option => option.props.disabled !== true)).toBe(true);
  expect(ui.byLabel('Time in force').props.value).toBe('DAY');
  expect(ui.publish).not.toHaveBeenCalled();
});
