import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PaperPanel, REOPEN_FALLBACK_NOTE, draftFromTicketInput, reopenDraftFor, type PaperManager, type PaperPanelProps } from '../../src/ui/PaperPanel';
import { configurePaperAccount, createPaperAccount, modifyPaperOrder, processPaperQuote, submitPaperOrder, type PaperAccount, type PaperResult } from '../../src/domain/paper';
import { restorePaperState, setBookPresets, setOrdersColumns, type PaperBook, type PaperState } from '../../src/domain/paper-book';
import { lastImportedQuote } from '../../src/domain/paper-quote';
import type { PaperPreset } from '../../src/domain/paper-presets';
import type { Instrument, Quote } from '../../src/domain/types';

// Actual component handlers with a controlled hook lifecycle (no DOM). Same approach as the existing panel handler tests.
interface Slot { dependencies: readonly unknown[] | undefined; cleanup?: () => void; }
interface Store { cells: unknown[]; cursor: number; effects: Map<number, Slot>; pending: Array<() => void>; writes: number; }
const hooks = vi.hoisted(() => ({ current: null as Store | null }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const store = () => { if (!hooks.current) throw new Error('No active hook model'); return hooks.current; };
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) { const s = store(), i = s.cursor++; if (!(i in s.cells)) s.cells[i] = typeof initial === 'function' ? (initial as () => T)() : initial; return [s.cells[i] as T, (next: T | ((p: T) => T)) => { s.writes++; s.cells[i] = typeof next === 'function' ? (next as (p: T) => T)(s.cells[i] as T) : next; }]; },
    useRef<T>(initial: T) { const s = store(), i = s.cursor++; if (!(i in s.cells)) s.cells[i] = { current: initial }; return s.cells[i] as { current: T }; },
    useEffect(create: () => void | (() => void), dependencies?: readonly unknown[]) {
      const s = store(), i = s.cursor++, previous = s.effects.get(i);
      if (previous && dependencies && previous.dependencies && dependencies.length === previous.dependencies.length && dependencies.every((entry, k) => Object.is(entry, previous.dependencies![k]))) return;
      const slot: Slot = { dependencies: dependencies?.slice() }; s.effects.set(i, slot);
      s.pending.push(() => { previous?.cleanup?.(); const cleanup = create(); if (typeof cleanup === 'function') slot.cleanup = cleanup; });
    },
  };
});
interface El { type: unknown; props: Record<string, unknown>; }
const isEl = (v: unknown): v is El => v !== null && typeof v === 'object' && 'props' in v && (v as El).props !== null && typeof (v as El).props === 'object';
function text(v: unknown): string { if (typeof v === 'string' || typeof v === 'number') return String(v); if (Array.isArray(v)) return v.map(text).join(''); return isEl(v) ? text(v.props.children) : ''; }
function collect(v: unknown, predicate: (n: El) => boolean): El[] { if (Array.isArray(v)) return v.flatMap(c => collect(c, predicate)); if (!isEl(v)) return []; return [...(predicate(v) ? [v] : []), ...collect(v.props.children, predicate)]; }

const instrument: Instrument = { id: 'SYNTHETIC:PX', symbol: 'PXSYM', name: 'Synthetic PAPERX panel oracle', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const quote: Quote = { instrumentId: instrument.id, bid: 99.98, ask: 100.02, eventTime: 1000, receivedAt: 1000, availableAt: 1000, sequence: 1, fixture: true, session: 'regular' };
const accepted = (r: PaperResult) => { expect(r.ok, r.diagnostics.map(d => d.message).join(';')).toBe(true); return r.account; };
const seeded = (settings: Partial<Parameters<typeof createPaperAccount>[0]> = {}) => accepted(processPaperQuote(createPaperAccount({ initialBalance: 100000, now: 1000, ...settings }), quote, 1000, 'ordinary', instrument));
const keyEvent = (key: string) => ({ key, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn() });
const cleanups: Array<() => void> = [];

function setup(overrides: Partial<PaperPanelProps> = {}, account = seeded()) {
  const store: Store = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
  const props: PaperPanelProps = { account, instrument, quote, quoteSource: { key: 'px-source', state: 'ready' }, now: 1000, onAccountChange: () => true, ...overrides };
  const publish = vi.fn((next: PaperAccount, expected?: PaperAccount) => { if (expected !== props.account) return false; props.account = next; return true; });
  props.onAccountChange = publish;
  const render = () => {
    let tree: unknown;
    for (let pass = 0; pass < 12; pass++) { hooks.current = store; store.cursor = 0; const writes = store.writes; tree = PaperPanel(props); for (const effect of store.pending.splice(0)) effect(); if (store.writes === writes) return tree; }
    throw new Error('Hook model did not settle');
  };
  const one = (predicate: (n: El) => boolean) => { const found = collect(render(), predicate); if (found.length !== 1) throw new Error(`Expected one control, got ${found.length}`); return found[0]; };
  const byLabel = (label: string) => one(n => n.props['aria-label'] === label);
  const maybeLabel = (label: string) => collect(render(), n => n.props['aria-label'] === label)[0];
  const button = (name: string) => one(n => n.type === 'button' && text(n) === name);
  const hasButton = (name: string) => collect(render(), n => n.type === 'button' && text(n) === name).length > 0;
  const click = (name: string) => { (button(name).props.onClick as () => void)(); render(); };
  const change = (label: string, value: string) => { (byLabel(label).props.onChange as (e: { target: { value: string } }) => void)({ target: { value } }); render(); };
  const submit = () => { (byLabel('Virtual order ticket').props.onSubmit as (e: { preventDefault(): void }) => void)({ preventDefault: vi.fn() }); render(); };
  const message = () => text(collect(render(), n => n.type === 'output')[0]);
  const dialog = () => collect(render(), n => n.props.role === 'alertdialog')[0];
  const ui = { props, publish, render, one, byLabel, maybeLabel, button, hasButton, click, change, submit, message, dialog, text: () => text(render()), store };
  cleanups.push(() => { for (const slot of store.effects.values()) slot.cleanup?.(); });
  render(); return ui;
}
function manager(state: PaperState, extra: Partial<PaperManager> = {}) {
  const current = { state };
  const onStateChange = vi.fn((next: PaperState, expected: PaperState) => { if (expected.paper !== current.state.paper || expected.book !== current.state.book) return false; current.state = next; return true; });
  const onSelectPreset = vi.fn();
  let counter = 0;
  const make = (): PaperManager => ({ book: current.state.book, selectedPresetId: null, onSelectPreset, onStateChange, idFactory: () => `px-${++counter}`, ...extra });
  return { current, onStateChange, onSelectPreset, make };
}
function withManager(state: PaperState, extra: Partial<PaperManager> = {}) {
  const m = manager(state, extra);
  const ui = setup({ paperManager: m.make() }, state.paper);
  // The host keeps one state: quote and fill updates for the active account flow into the same pair the manager edits.
  ui.props.onAccountChange = (next, expected) => { if (expected !== m.current.state.paper) return false; m.current.state = { paper: next, book: m.current.state.book }; ui.props.account = next; ui.props.paperManager = m.make(); return true; };
  const sync = () => { ui.props.account = m.current.state.paper; ui.props.paperManager = m.make(); ui.render(); };
  return { ...m, ui, sync };
}
beforeEach(() => { hooks.current = null; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => { for (const c of cleanups.splice(0)) c(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const preset = (overrides: Partial<PaperPreset> = {}): PaperPreset => ({ schemaVersion: 1, id: 'pr1', name: 'Pullback', side: 'buy', input: { quantity: { kind: 'units', value: '5' }, type: 'limit', limit: { kind: 'side-ticks', value: '-2' }, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null }, ...overrides });

it('TICKET.SUBMIT: a double click places one order and records one command identity', () => {
  const ui = setup({}, configurePaperAccount(seeded(), { oneClick: true }, 1000).account);
  ui.submit(); ui.submit();
  expect(ui.props.account.orders).toHaveLength(1);
  expect(Object.keys(ui.props.account.commands)).toHaveLength(1);
  expect(ui.publish).toHaveBeenCalledTimes(1);
  expect(ui.message()).toContain('not sent again');
});
it('TICKET.SUBMIT: a changed ticket is a new interaction and places a second order', () => {
  const ui = setup({}, configurePaperAccount(seeded(), { oneClick: true }, 1000).account);
  ui.submit(); ui.change('Order quantity', '2'); ui.submit();
  expect(ui.props.account.orders).toHaveLength(2);
  expect(new Set(Object.keys(ui.props.account.commands)).size).toBe(2);
});
it('EXITS.CONFLICT: the exit editor keeps the conflict visible', () => {
  const ui = setup(); ui.click('Add take profit / stop loss');
  const editor = collect(ui.render(), n => typeof n.type === 'function' && typeof (n.props.value as { apply?: unknown } | undefined)?.apply === 'function')[0];
  hooks.current = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
  const rendered = (editor.type as (props: unknown) => unknown)(editor.props);
  expect(text(rendered)).toContain('Up to four exit levels are supported here. Some help pages describe a single exit.');
});
it('MANAGER.MARGIN_BUFFER: the summary shows the buffer', () => {
  expect(setup().text()).toContain('Margin buffer (%)100.00');
});
it('MANAGER.JOURNAL: search narrows events by text and never deletes them', () => {
  const ui = setup({}, accepted(submitPaperOrder(seeded(), { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 90 }, 1000)));
  ui.click('History');
  const rows = () => collect(ui.render(), n => n.type === 'tr' && collect(n, c => c.type === 'td').length === 4 && /virtual order/i.test(text(n))).length;
  const before = rows(); expect(before).toBeGreaterThan(0);
  ui.change('Search journal', 'SUBMITTED'); expect(rows()).toBe(before);
  ui.change('Search journal', 'no such text'); expect(rows()).toBe(0); expect(ui.text()).toContain('No journal events match this search.');
  expect(ui.props.account.events.length).toBeGreaterThan(0);
});
it('MANAGER.ACCOUNT_HISTORY: groups fills by position', () => {
  let account = seeded(); account = accepted(submitPaperOrder(account, { instrument, side: 'buy', type: 'market', quantity: 4 }, 1000));
  account = accepted(submitPaperOrder(account, { instrument, side: 'sell', type: 'market', quantity: 4 }, 1000));
  const ui = setup({}, account); ui.click('History');
  const section = ui.byLabel('Virtual account history by position');
  expect(text(section)).toContain('PXSYM #1'); expect(text(section)).toContain('long'); expect(text(section)).not.toContain('Reversing');
  expect(collect(section, n => n.type === 'tr').length).toBe(1 + 1 + 2);
});

it('MANAGER.EXPORT: writes the visible table through the bridge and reports a failed write without changing anything', async () => {
  const exportData = vi.fn(async () => ({ ok: true as const }));
  const account = accepted(submitPaperOrder(seeded(), { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 90, timeInForce: 'GTD', expiresAt: 100000 }, 1000));
  const ui = setup({ exportBridge: { exportData } }, account);
  await (ui.button('Export orders CSV').props.onClick as () => Promise<void>)();
  expect(exportData).toHaveBeenCalledOnce();
  const sent = (exportData.mock.calls as unknown as Array<[{ text: string; suggestedName: string; format: string }]>)[0][0];
  expect(sent.format).toBe('csv'); expect(sent.suggestedName).toBe('OpenCandle-virtual-orders.csv'); expect(sent.text.split('\r\n')[0]).toBe('Symbol,Side / type,Quantity,Limit / stop,Instruction,Status,Expiry (UTC)');
  expect(ui.message()).toContain('Saved 1 row');
  const before = structuredClone(ui.props.account);
  ui.props.exportBridge = { exportData: vi.fn(async () => ({ ok: false as const, error: { message: 'disk' } })) };
  await (ui.button('Export orders CSV').props.onClick as () => Promise<void>)();
  expect(ui.message()).toBe('The file could not be saved.'); expect(ui.props.account).toEqual(before); expect(ui.publish).not.toHaveBeenCalled();
});

it('ORDERS.COLUMN_SETUP.EXPIRY: the Expiry column is on by default and the Columns menu hides it', () => {
  const account = accepted(submitPaperOrder(seeded(), { instrument, side: 'buy', type: 'limit', quantity: 1, limitPrice: 90, timeInForce: 'GTD', expiresAt: 100000 }, 1000));
  const ui = setup({}, account);
  const headers = () => collect(ui.render(), n => n.type === 'th').map(text);
  expect(headers()).toContain('Expiry (UTC)');
  ui.click('Columns'); expect(ui.maybeLabel('Orders columns')).toBeTruthy();
  const item = ui.one(n => n.props.role === 'menuitemcheckbox'); expect(item.props['aria-checked']).toBe(true);
  (item.props.onClick as () => void)(); ui.render();
  expect(headers()).not.toContain('Expiry (UTC)');
  expect(collect(ui.render(), n => n.type === 'tr' && collect(n, c => c.type === 'td').length > 7).length).toBe(0);
});
it('ORDERS.COLUMN_SETUP.EXPIRY: Escape and an outside press close the menu; the choice is stored per book and survives a reload', () => {
  const state: PaperState = { paper: seeded(), book: null };
  const w = withManager(state);
  w.ui.click('Columns'); expect(w.ui.maybeLabel('Orders columns')).toBeTruthy();
  const menu = w.ui.byLabel('Orders columns'); (menu.props.onKeyDown as (e: unknown) => void)(keyEvent('Escape')); w.ui.render();
  expect(w.ui.maybeLabel('Orders columns')).toBeUndefined();
  w.ui.click('Columns'); (w.ui.byLabel('Virtual Paper Trading').props.onMouseDown as () => void)(); w.ui.render();
  expect(w.ui.maybeLabel('Orders columns')).toBeUndefined();
  w.ui.click('Columns'); (w.ui.one(n => n.props.role === 'menuitemcheckbox').props.onClick as () => void)(); w.ui.render();
  expect(w.onStateChange).toHaveBeenCalledOnce();
  expect(w.current.state.book).toEqual({ schemaVersion: 1, activeId: state.paper.id, inactive: [], ordersColumns: { expiry: false } });
  const saved = JSON.parse(JSON.stringify({ paper: w.current.state.paper, paperBook: w.current.state.book }));
  const restored = restorePaperState(saved.paper, saved.paperBook);
  const relaunched = setup({ paperManager: { book: restored.book, selectedPresetId: null, onSelectPreset: vi.fn(), onStateChange: vi.fn() } }, restored.paper);
  expect(collect(relaunched.render(), n => n.type === 'th').map(text)).not.toContain('Expiry (UTC)');
});

it('TICKET.QTY.MODE_PERSISTENCE: editing reopens in the saved representation', () => {
  const ui = setup();
  ui.change('Order type', 'limit'); ui.change('Quantity representation', 'notional'); ui.change('Order quantity', '500'); ui.change('Limit price', '50'); ui.change('Time in force', 'DAY');
  ui.submit(); ui.click('Confirm');
  expect(ui.props.account.orders).toHaveLength(1); expect(ui.props.account.orders[0].quantity).toBe(10);
  ui.click('Modify');
  expect(ui.byLabel('Quantity representation').props.value).toBe('notional');
  expect(ui.byLabel('Order quantity').props.value).toBe('500');
  expect(ui.message()).not.toContain(REOPEN_FALLBACK_NOTE);
});
it('TICKET.QTY.MODE_PERSISTENCE: a saved entry that no longer applies reopens in units with the note', () => {
  const ui = setup();
  ui.change('Order type', 'limit'); ui.change('Quantity representation', 'notional'); ui.change('Order quantity', '500'); ui.change('Limit price', '50'); ui.change('Time in force', 'DAY');
  ui.submit(); ui.click('Confirm');
  const order = ui.props.account.orders[0];
  ui.props.account = accepted(modifyPaperOrder(ui.props.account, order.id, { quantity: 7 }, 1000)); ui.render();
  ui.click('Modify');
  expect(ui.byLabel('Quantity representation').props.value).toBe('units'); expect(ui.byLabel('Order quantity').props.value).toBe('7');
  expect(ui.message()).toBe('Reopened in units because the saved entry no longer applies');
});
it('reopenDraftFor: an order without a saved entry reopens in units with no note', () => {
  const order = accepted(submitPaperOrder(seeded(), { instrument, side: 'buy', type: 'limit', quantity: 3, limitPrice: 90 }, 1000)).orders[0];
  expect(reopenDraftFor(order)).toEqual({ draft: { quantityMode: 'units', balanceBasis: 'realized-balance', limitMode: 'price', stopMode: 'price', riskStopLevelId: '' }, exits: null, note: null });
});

it('ACCOUNT.CREATE / SELECT / RENAME / DELETE through the panel', () => {
  const w = withManager({ paper: seeded(), book: null });
  w.ui.click('Account');
  expect(w.ui.hasButton('Delete Paper Trading') && (w.ui.button('Delete Paper Trading').props.disabled as boolean)).toBe(true);
  expect(w.ui.text()).toContain('Keep at least one virtual account');
  w.ui.change('New account name', 'Swing'); w.ui.change('New account balance', '5000'); w.ui.change('New account currency', 'usd');
  w.ui.click('Create account'); w.sync();
  expect(w.current.state.book!.inactive.map(a => [a.name, a.settings.initialBalance, a.settings.currency])).toEqual([['Swing', 5000, 'USD']]);
  expect(w.current.state.paper.name).toBe('Paper Trading');
  w.ui.click('Account');
  w.ui.click('Use Swing'); w.sync();
  expect(w.current.state.paper.name).toBe('Swing'); expect(w.current.state.book!.inactive[0].name).toBe('Paper Trading');
  w.ui.click('Account');
  w.ui.click('Rename Swing'); w.ui.change('Account name', 'Position book'); w.ui.click('Save name'); w.sync();
  expect(w.current.state.paper.name).toBe('Position book');
  w.ui.click('Delete Paper Trading');
  expect(text(w.ui.dialog())).toContain('Delete Paper Trading and its virtual history?');
  w.ui.click('Confirm'); w.sync();
  expect(w.current.state.book).toBeNull(); expect(w.current.state.paper.name).toBe('Position book');
});
it('ACCOUNT.CREATE: a duplicate name is refused with a message and nothing changes', () => {
  const w = withManager({ paper: seeded(), book: null });
  w.ui.click('Account'); w.ui.change('New account name', 'paper trading'); w.ui.click('Create account');
  expect(w.onStateChange).not.toHaveBeenCalled(); expect(w.ui.message()).toContain('already exists');
});
it('ACCOUNT.SELECT: an unsaved ticket draft is only discarded after confirmation', () => {
  const base = withManager({ paper: seeded(), book: null });
  base.ui.click('Account'); base.ui.change('New account name', 'Other'); base.ui.click('Create account'); base.sync();
  base.ui.click('Orders (0)'); base.ui.change('Order quantity', '9'); base.ui.click('Account');
  base.ui.click('Use Other');
  expect(text(base.ui.dialog())).toContain('discards the unsaved ticket draft');
  expect(base.current.state.paper.name).toBe('Paper Trading');
  base.ui.click('Confirm'); base.sync();
  expect(base.current.state.paper.name).toBe('Other');
});

it('PRESET.CREATE / EDIT / DELETE through the panel', () => {
  const w = withManager({ paper: seeded(), book: null });
  w.ui.change('Order type', 'limit'); w.ui.change('Limit representation', 'side-ticks'); w.ui.change('Limit price', '-2'); w.ui.change('Order quantity', '5');
  w.ui.change('Preset name', 'Pullback'); w.ui.click('Save ticket as preset'); w.sync();
  expect(w.current.state.book!.presets).toHaveLength(1);
  const saved = w.current.state.book!.presets![0];
  expect(saved).toMatchObject({ name: 'Pullback', side: 'buy' }); expect(saved.input.limit).toEqual({ kind: 'side-ticks', value: '-2' });
  expect(w.onSelectPreset).toHaveBeenCalledWith(saved.id);
  w.ui.change('Order quantity', '8'); w.ui.click('Save ticket as preset');
  expect(text(w.ui.dialog())).toContain('Replace the preset Pullback?');
  w.ui.click('Confirm'); w.sync();
  expect(w.current.state.book!.presets).toHaveLength(1); expect(w.current.state.book!.presets![0].id).toBe(saved.id); expect(w.current.state.book!.presets![0].input.quantity).toEqual({ kind: 'units', value: '8' });
  w.ui.props.paperManager = { ...w.make(), selectedPresetId: saved.id }; w.ui.render();
  w.ui.click('Delete preset'); expect(text(w.ui.dialog())).toContain('Delete the preset Pullback?'); w.ui.click('Confirm'); w.sync();
  expect(w.current.state.book).toBeNull();
  expect(w.onSelectPreset).toHaveBeenLastCalledWith(null);
});
it('PRESET.TICKET: applying fills the ticket and lists what does not apply', () => {
  const odd = preset({ input: { ...preset().input, type: 'market', limit: { kind: 'side-ticks', value: '-2' } } });
  const state = setBookPresets({ paper: seeded(), book: null }, [odd]);
  const m = manager(state);
  const ui = setup({ paperManager: { ...m.make(), selectedPresetId: odd.id } }, state.paper);
  ui.click('Apply preset to ticket');
  expect(ui.byLabel('Order type').props.value).toBe('market'); expect(ui.byLabel('Order quantity').props.value).toBe('5');
  expect(text(ui.byLabel('Preset notes'))).toContain('Limit offset does not apply to a market order');
});
it('PRESET.TRADE_DIFFERENCE: the panel ticket does not inherit the selected chart preset', () => {
  const chart = preset({ side: 'sell' });
  const state = setBookPresets({ paper: seeded(), book: null }, [chart]);
  const ui = setup({ paperManager: { ...manager(state).make(), selectedPresetId: chart.id } }, state.paper);
  expect(ui.byLabel('Order type').props.value).toBe('market'); expect(ui.byLabel('Order quantity').props.value).toBe('1');
  expect(ui.text()).toContain('does not inherit it');
});
it('PRESET.CONFIRM_OFF: a seeded token fills the ticket from the selected preset once', () => {
  const chart = preset({ side: 'buy' });
  const state = setBookPresets({ paper: seeded(), book: null }, [chart]);
  const ui = setup({ paperManager: { ...manager(state).make(), selectedPresetId: chart.id }, presetSeed: { token: 1, side: 'sell' } }, state.paper);
  expect(ui.byLabel('Order type').props.value).toBe('limit');
  expect(collect(ui.render(), n => n.props['aria-pressed'] === true && n.type === 'button').map(text)[0]).toMatch(/^Sell/);
  ui.change('Order quantity', '3'); ui.render();
  expect(ui.byLabel('Order quantity').props.value).toBe('3');
});
it('draftFromTicketInput keeps a manual expiry as an explicit choice', () => {
  const draft = draftFromTicketInput({ schemaVersion: 1, side: 'sell', type: 'limit', quantity: { kind: 'notional', value: '100', currency: 'USD' }, limit: { kind: 'price', value: '5' }, stop: null, validity: { kind: 'manual-expiry', expiresAt: 87400 }, entryOutsideRth: true, takeProfitOutsideRth: false, exits: null }, { side: 'buy', type: 'market', quantity: '1', limitPrice: '', stopPrice: '', timeInForce: 'DAY', expiresAt: '', extendedHours: false });
  expect(draft).toMatchObject({ side: 'sell', type: 'limit', quantityMode: 'notional', quantity: '100', timeInForce: 'GTD', expiresAt: '1970-01-02T00:16:40Z', expiryChanged: true, extendedHours: true });
});

it('PX-5 / 3.9: the ticket labels a last imported price and fills a market order on an unknown-session source', () => {
  const daily = { instrument, bars: [{ time: 1577836800, open: 1, high: 2, low: 1, close: 101.5, volume: 1 }], resolution: '1D', provenance: { providerId: 'local-import', providerName: 'x', datasetId: 'local:px', fixture: false, coverage: '', asOf: 1577836800, delaySeconds: null, adjustment: 'unknown', session: 'unknown', timezone: 'UTC', state: 'ready', license: '', revision: '1', notes: [] } } as const;
  const imported = lastImportedQuote(daily as never, 1_800_000_000)!;
  const ui = setup({ quote: imported, now: 1_800_000_000 }, createPaperAccount({ now: 1_800_000_000 }));
  expect(ui.text()).toContain('last imported price');
  expect(ui.text()).toContain('This source does not declare a trading session.' );
  ui.submit(); ui.click('Confirm');
  expect(ui.props.account.orders[0]).toMatchObject({ status: 'filled', averageFillPrice: 101.5 });
});
it('PRESET.FIRST_RENDER: the very first render, before any effect runs, already shows the preset quantity', () => {
  const chart = preset({ side: 'buy', input: { ...preset().input, quantity: { kind: 'units', value: '3' } } });
  const state = setBookPresets({ paper: seeded(), book: null }, [chart]);
  const store: Store = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
  hooks.current = store;
  const tree = PaperPanel({ account: state.paper, instrument, quote, quoteSource: { key: 'px-source', state: 'ready' }, now: 1000, onAccountChange: () => true, paperManager: { ...manager(state).make(), selectedPresetId: chart.id }, presetSeed: { token: 1, side: 'buy' } });
  expect(collect(tree, n => n.props['aria-label'] === 'Order quantity')[0].props.value).toBe('3');
  for (const effect of store.pending.splice(0)) effect(); // mount effects must not wipe the seeded draft
  hooks.current = store; store.cursor = 0;
  expect(collect(PaperPanel({ account: state.paper, instrument, quote, quoteSource: { key: 'px-source', state: 'ready' }, now: 1000, onAccountChange: () => true, paperManager: { ...manager(state).make(), selectedPresetId: chart.id }, presetSeed: { token: 1, side: 'buy' } }), n => n.props['aria-label'] === 'Order quantity')[0].props.value).toBe('3');
});
