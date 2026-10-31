import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaperAccount, processPaperQuote, submitPaperOrder, type PaperAccount, type PaperResult } from '../../src/domain/paper';
import { setBookPresets, type PaperState } from '../../src/domain/paper-book';
import type { PaperPreset } from '../../src/domain/paper-presets';
import type { Instrument, Quote } from '../../src/domain/types';
import { PaperPanel, paperZonedIsoText, type PaperManager, type PaperPanelProps } from '../../src/ui/PaperPanel';

// Actual Paper trading dialog handlers with a controlled hook lifecycle (the paperx-panel harness; no DOM, native
// dialog or executable). Synthetic instruments and quotes, virtual money only.
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

const NY = 'America/New_York';
const at = (iso: string) => Date.parse(iso) / 1000;
// 2026-10-23 13:30:00 UTC is 09:30:00 in New York (UTC-4).
const AT = at('2026-10-23T13:30:00Z');
const plain: Instrument = { id: 'SYNTHETIC:PP4', symbol: 'PP4', name: 'Synthetic paper four panel', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'UTC', tickSize: 0.01, lotSize: 1 };
const nyStock: Instrument = { ...plain, id: 'SYNTHETIC:PP4NY', symbol: 'PP4NY', timezone: NY };
const quoteFor = (instrument: Instrument, time: number): Quote => ({ instrumentId: instrument.id, bid: 99.98, ask: 100.02, eventTime: time, receivedAt: time, availableAt: time, sequence: 1, fixture: true, session: 'regular' });
const accepted = (r: PaperResult) => { expect(r.ok, r.diagnostics.map(d => d.message).join(';')).toBe(true); return r.account; };
const seeded = (instrument = plain, time = AT): PaperAccount => { const blank = createPaperAccount({ initialBalance: 100000, now: time }); return accepted(processPaperQuote(blank, quoteFor(instrument, time), time, blank.runId, instrument)); };
const cleanups: Array<() => void> = [];

function setup(overrides: Partial<PaperPanelProps> = {}, account = seeded(overrides.instrument ?? plain, overrides.now ?? AT)) {
  const store: Store = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
  const instrument = overrides.instrument ?? plain, now = overrides.now ?? AT;
  const props: PaperPanelProps = { account, instrument, quote: quoteFor(instrument, now), quoteSource: { key: 'synthetic pp4 source', state: 'ready' }, now, onAccountChange: () => true, ...overrides };
  const publish = vi.fn((next: PaperAccount, expected?: PaperAccount) => { if (expected !== props.account) return false; props.account = next; return true; });
  props.onAccountChange = publish;
  const render = () => {
    let tree: unknown;
    for (let pass = 0; pass < 12; pass++) { hooks.current = store; store.cursor = 0; const writes = store.writes; tree = PaperPanel(props); for (const effect of store.pending.splice(0)) effect(); if (store.writes === writes) return tree; }
    throw new Error('Hook model did not settle');
  };
  const one = (predicate: (n: El) => boolean) => { const found = collect(render(), predicate); if (found.length !== 1) throw new Error(`Expected one control, got ${found.length}`); return found[0]; };
  const byLabel = (label: string) => one(n => n.props['aria-label'] === label);
  const button = (name: string) => one(n => n.type === 'button' && text(n) === name);
  const click = (name: string) => { (button(name).props.onClick as () => void)(); render(); };
  const change = (label: string, value: string) => { (byLabel(label).props.onChange as (e: { target: { value: string; checked?: boolean } }) => void)({ target: { value } }); render(); };
  const check = (label: string, checked: boolean) => { (byLabel(label).props.onChange as (e: { target: { value: string; checked: boolean } }) => void)({ target: { value: '', checked } }); render(); };
  const submit = () => { (byLabel('Virtual order ticket').props.onSubmit as (e: { preventDefault(): void }) => void)({ preventDefault: vi.fn() }); render(); };
  const message = () => text(collect(render(), n => n.type === 'output')[0]);
  const ui = { props, publish, render, byLabel, button, click, change, check, submit, message, text: () => text(render()) };
  cleanups.push(() => { for (const slot of store.effects.values()) slot.cleanup?.(); });
  render(); return ui;
}
function manager(state: PaperState) {
  const current = { state };
  const onStateChange = vi.fn((next: PaperState, expected: PaperState) => { if (expected.paper !== current.state.paper || expected.book !== current.state.book) return false; current.state = next; return true; });
  let counter = 0;
  const make = (selectedPresetId: string | null = null): PaperManager => ({ book: current.state.book, selectedPresetId, onSelectPreset: vi.fn(), onStateChange, idFactory: () => `pp4-${++counter}`, });
  return { current, make };
}
beforeEach(() => { hooks.current = null; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => { for (const c of cleanups.splice(0)) c(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('paperZonedIsoText', () => {
  it('writes ISO 8601 on the chart wall clock with its offset, DST-aware, and keeps Z for UTC', () => {
    expect(paperZonedIsoText(AT, NY)).toBe('2026-10-23T09:30:00-04:00');
    expect(paperZonedIsoText(at('2026-12-01T14:30:00Z'), NY)).toBe('2026-12-01T09:30:00-05:00');
    expect(paperZonedIsoText(AT, 'Asia/Kolkata')).toBe('2026-10-23T19:00:00+05:30');
    expect(paperZonedIsoText(AT, 'UTC')).toBe('2026-10-23T13:30:00Z');
    expect(paperZonedIsoText(AT)).toBe('2026-10-23T13:30:00Z');
    expect(Date.parse(paperZonedIsoText(AT, 'Asia/Kolkata')) / 1000).toBe(AT);
  });
  it('is blank for a time it cannot show', () => {
    expect(paperZonedIsoText(Number.NaN, NY)).toBe('');
    expect(paperZonedIsoText(1e20, NY)).toBe('');
  });
});

describe('the typed expiry field uses the chart timezone', () => {
  it('a new explicit expiry shows New York wall time with its offset and places that instant', () => {
    const ui = setup({ timezone: NY, timeHours: '12' });
    ui.change('Order type', 'limit'); ui.change('Limit price', '90'); ui.change('Time in force', 'GTD');
    const field = ui.byLabel('Order expiration');
    expect(field.props.value).toBe('2026-10-24T09:30:00-04:00');
    expect(field.props.placeholder).toBe('2026-10-15T08:00:00-04:00');
    expect(ui.text()).toContain('Expiry with UTC offset (New York time)');
    ui.change('Order expiration', '2026-10-24T10:00:00-04:00');
    ui.submit(); ui.click('Confirm');
    expect(ui.props.account.orders.at(-1)).toMatchObject({ timeInForce: 'GTD', expiresAt: AT + 86400 + 1800 });
  });
  it('the untouched default follows a timezone change, a typed value is kept', () => {
    const ui = setup({ timezone: NY });
    ui.change('Time in force', 'GTD');
    ui.props.timezone = 'Asia/Kolkata'; ui.render();
    expect(ui.byLabel('Order expiration').props.value).toBe('2026-10-24T19:00:00+05:30');
    expect(ui.text()).toContain('Expiry with UTC offset (Kolkata time)');
    ui.change('Order expiration', '2026-10-24T20:00:00+05:30');
    ui.props.timezone = NY; ui.render();
    expect(ui.byLabel('Order expiration').props.value).toBe('2026-10-24T20:00:00+05:30');
  });
  it('modifying an explicit-expiry order shows its stored expiry in the chart timezone', () => {
    const account = accepted(submitPaperOrder(seeded(), { instrument: plain, side: 'buy', type: 'limit', quantity: 1, limitPrice: 90, timeInForce: 'GTD', expiresAt: AT + 3600 }, AT));
    const ui = setup({ timezone: NY }, account);
    ui.click('Modify');
    expect(ui.byLabel('Order expiration').props.value).toBe('2026-10-23T10:30:00-04:00');
  });
  it('a UTC chart keeps the old Z text and label', () => {
    const ui = setup();
    ui.change('Time in force', 'GTD');
    expect(ui.byLabel('Order expiration').props.value).toBe('2026-10-24T13:30:00Z');
    expect(ui.byLabel('Order expiration').props.placeholder).toBe('2026-10-15T12:00:00Z');
    expect(ui.text()).toContain('Expiry with UTC offset');
    expect(ui.text()).not.toContain('Expiry with UTC offset (');
  });
});

describe('presets keep GTC in the dialog', () => {
  const day: PaperPreset = { schemaVersion: 1, id: 'pp4-day', name: 'Day pullback', side: 'buy', input: { quantity: { kind: 'units', value: '4' }, type: 'limit', limit: { kind: 'price', value: '95' }, stop: null, validity: { kind: 'day' }, entryOutsideRth: false, takeProfitOutsideRth: false, exits: null } };
  it('saving from a GTC ticket stores GTC and applying it restores GTC', () => {
    const m = manager({ paper: seeded(), book: null });
    const ui = setup({ paperManager: m.make() }, m.current.state.paper);
    ui.props.onAccountChange = (next, expected) => { if (expected !== m.current.state.paper) return false; m.current.state = { paper: next, book: m.current.state.book }; ui.props.account = next; return true; };
    ui.change('Order type', 'limit'); ui.change('Limit price', '95'); ui.change('Time in force', 'GTC');
    ui.change('Preset name', 'Resting bid'); ui.click('Save ticket as preset');
    const saved = m.current.state.book!.presets!;
    expect(saved).toHaveLength(1);
    expect(saved[0].input.validity).toEqual({ kind: 'gtc' });
    ui.props.account = m.current.state.paper; ui.props.paperManager = m.make(saved[0].id); ui.render();
    ui.change('Time in force', 'DAY');
    ui.click('Apply preset to ticket');
    expect(ui.byLabel('Time in force').props.value).toBe('GTC');
    expect(ui.message()).toContain('GTC');
  });
  it('an old Day preset still applies as Day', () => {
    const state = setBookPresets({ paper: seeded(), book: null }, [day]);
    const ui = setup({ paperManager: manager(state).make(day.id) }, state.paper);
    ui.change('Time in force', 'GTC');
    ui.click('Apply preset to ticket');
    expect(ui.byLabel('Time in force').props.value).toBe('DAY');
  });
  it('a preset with an explicit expiry shows it in the chart timezone', () => {
    const gtd: PaperPreset = { ...day, id: 'pp4-gtd', name: 'Expiring', input: { ...day.input, validity: { kind: 'manual-expiry', expiresAt: AT + 7200 } } };
    const state = setBookPresets({ paper: seeded(), book: null }, [gtd]);
    const ui = setup({ paperManager: manager(state).make(gtd.id), timezone: NY }, state.paper);
    ui.click('Apply preset to ticket');
    expect(ui.byLabel('Order expiration').props.value).toBe('2026-10-23T11:30:00-04:00');
  });
});

describe('CSV exports in the chart timezone', () => {
  const sent = (exportData: ReturnType<typeof vi.fn>) => (exportData.mock.calls.at(-1) as unknown as [{ text: string }])[0].text.split('\r\n');
  it('a New York chart adds ISO offset columns after the unchanged UTC ones', async () => {
    const exportData = vi.fn(async () => ({ ok: true as const }));
    let account = accepted(submitPaperOrder(seeded(), { instrument: plain, side: 'buy', type: 'limit', quantity: 1, limitPrice: 90, timeInForce: 'GTD', expiresAt: AT + 3600 }, AT));
    account = accepted(submitPaperOrder(account, { instrument: plain, side: 'buy', type: 'market', quantity: 1 }, AT));
    const ui = setup({ exportBridge: { exportData }, timezone: NY, timeHours: '12' }, account);
    await (ui.button('Export orders CSV').props.onClick as () => Promise<void>)();
    expect(sent(exportData)[0]).toBe('Symbol,Side / type,Quantity,Limit / stop,Instruction,Status,Expiry (UTC),"Expiry (New York, ISO offset)"');
    expect(sent(exportData)[1].endsWith(',2026-10-23T14:30:00Z,2026-10-23T10:30:00-04:00')).toBe(true);
    ui.click('History');
    await (ui.button('Export journal CSV').props.onClick as () => Promise<void>)();
    expect(sent(exportData)[0]).toBe('Time,Order,Event,Details,"Time (New York, ISO offset)"');
    expect(sent(exportData)[1].endsWith(',2026-10-23T09:30:00-04:00')).toBe(true);
    await (ui.button('Export account history CSV').props.onClick as () => Promise<void>)();
    expect(sent(exportData)[0].endsWith(',"Closed (New York, ISO offset)","Fill time (New York, ISO offset)"')).toBe(true);
  });
  it('a UTC chart exports exactly the old columns', async () => {
    const exportData = vi.fn(async () => ({ ok: true as const }));
    const ui = setup({ exportBridge: { exportData } }, accepted(submitPaperOrder(seeded(), { instrument: plain, side: 'buy', type: 'limit', quantity: 1, limitPrice: 90, timeInForce: 'GTD', expiresAt: AT + 3600 }, AT)));
    await (ui.button('Export orders CSV').props.onClick as () => Promise<void>)();
    expect(sent(exportData)[0]).toBe('Symbol,Side / type,Quantity,Limit / stop,Instruction,Status,Expiry (UTC)');
  });
});

describe('the Day hint on an NYSE early-close day', () => {
  // 2026-11-27 (the day after Thanksgiving) closes at 13:00 New York time. 15:00 UTC is 10:00 in New York (UTC-5).
  const EARLY = at('2026-11-27T15:00:00Z');
  it('says 13:00 and shows the 13:00 close, which is what the order gets', () => {
    const ui = setup({ instrument: nyStock, now: EARLY, timezone: NY });
    ui.change('Order type', 'limit'); ui.change('Limit price', '90');
    expect(ui.text()).toContain('Expires at the regular close (13:00 New York time, an NYSE early-close day): 2026-11-27 13:00:00 UTC-5 if submitted now.');
    ui.submit(); ui.click('Confirm');
    expect(ui.props.account.orders.at(-1)).toMatchObject({ timeInForce: 'DAY', expiresAt: at('2026-11-27T18:00:00Z') });
  });
  it('an extended-hours limit says 17:00', () => {
    const ui = setup({ instrument: nyStock, now: EARLY, timezone: NY });
    ui.change('Order type', 'limit'); ui.change('Limit price', '90'); ui.check('Entry outside regular hours', true);
    expect(ui.text()).toContain('Expires at the extended-hours close (17:00 New York time, an NYSE early-close day): 2026-11-27 17:00:00 UTC-5 if submitted now.');
  });
  it('an ordinary day keeps the 16:00 text', () => {
    const ui = setup({ instrument: nyStock, now: at('2026-11-25T15:00:00Z'), timezone: NY });
    expect(ui.text()).toContain('Expires at the regular close (16:00 New York time): 2026-11-25 16:00:00 UTC-5 if submitted now.');
  });
});
