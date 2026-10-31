import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaperPanel, paperExtendedHoursDefault, type PaperPanelProps } from '../../src/ui/PaperPanel';
import { clampFloatingPosition, defaultFloatingPosition, FloatingPanel } from '../../src/ui/FloatingPanel';
import { PaperOrderTicket } from '../../src/ui/PaperOrderTicket';
import { blankBrokerDraft, brokerTicketInput } from '../../src/domain/paper-broker-ticket';
import { createPaperAccount, processPaperQuote, type PaperAccount } from '../../src/domain/paper';
import { newYorkWallClockMs } from '../../src/domain/paper-expiry';
import type { Instrument, Quote } from '../../src/domain/types';

// The order tickets float without blocking the chart, and offer Extended hours,
// ticked by default on an ETH chart outside regular hours. Actual returned controls and handlers with a controlled hook
// model (as tests/ui/paper-expiration-independent.test.ts); no DOM, pointer input or packaged executable is exercised.
interface EffectSlot { dependencies: readonly unknown[] | undefined; cleanup?: () => void; }
interface HookStore { cells: unknown[]; cursor: number; effects: Map<number, EffectSlot>; pending: Array<() => void>; writes: number; }
const hooks = vi.hoisted(() => ({ current: null as HookStore | null }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const store = () => { if (!hooks.current) throw new Error('No active hook model'); return hooks.current; };
  return {
    ...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
    useState<T>(initial: T | (() => T)) {
      const state = store(), index = state.cursor++;
      if (!(index in state.cells)) state.cells[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [state.cells[index] as T, (next: T | ((previous: T) => T)) => { state.writes++; state.cells[index] = typeof next === 'function' ? (next as (previous: T) => T)(state.cells[index] as T) : next; }];
    },
    useRef<T>(initial: T) { const state = store(), index = state.cursor++; if (!(index in state.cells)) state.cells[index] = { current: initial }; return state.cells[index] as { current: T }; },
    useMemo<T>(factory: () => T) { const state = store(), index = state.cursor++; if (!(index in state.cells)) state.cells[index] = factory(); return state.cells[index] as T; },
    useEffect(create: () => void | (() => void), dependencies?: readonly unknown[]) {
      const state = store(), index = state.cursor++, previous = state.effects.get(index);
      if (previous && dependencies && previous.dependencies && dependencies.length === previous.dependencies.length && dependencies.every((entry, i) => Object.is(entry, previous.dependencies![i]))) return;
      const slot: EffectSlot = { dependencies: dependencies?.slice() }; state.effects.set(index, slot);
      state.pending.push(() => { previous?.cleanup?.(); const cleanup = create(); if (typeof cleanup === 'function') slot.cleanup = cleanup; });
    },
  };
});
interface ElementModel { type: unknown; props: Record<string, unknown>; }
const isElement = (value: unknown): value is ElementModel => value !== null && typeof value === 'object' && 'props' in value && (value as ElementModel).props !== null && typeof (value as ElementModel).props === 'object';
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.map(text).join('') : isElement(value) ? text(value.props.children) : '';
function collect(value: unknown, predicate: (node: ElementModel) => boolean): ElementModel[] {
  if (Array.isArray(value)) return value.flatMap(child => collect(child, predicate));
  if (!isElement(value)) return [];
  return [...(predicate(value) ? [value] : []), ...collect(value.props.children, predicate)];
}

const us: Instrument = { id: 'SYNTHETIC:ETH', symbol: 'ETHTEST', name: 'Synthetic extended-hours ticket', exchange: 'SYNTHETIC', currency: 'USD', assetClass: 'stock', timezone: 'America/New_York', tickSize: 0.01, lotSize: 1 };
const ny = (hour: number, minute = 0) => newYorkWallClockMs(2026, 10, 21, hour * 60 + minute) / 1000;
const quoteAt = (now: number): Quote => ({ instrumentId: us.id, bid: 9.99, ask: 10, eventTime: now, receivedAt: now, availableAt: now, sequence: 1, fixture: true, session: 'regular' });

function panel(now: number, overrides: Partial<PaperPanelProps> = {}) {
  const quote = quoteAt(now), account = processPaperQuote(createPaperAccount({ initialBalance: 1000, now }), quote, now, undefined, us).account;
  const state: HookStore = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
  const props: PaperPanelProps = { account, instrument: us, quote, quoteSource: { key: 'SYNTHETIC extended ticket source', state: 'ready' }, now, onAccountChange: () => true, ...overrides };
  props.onAccountChange = vi.fn((next: PaperAccount, expected?: PaperAccount) => { if (expected !== props.account) return false; props.account = next; return true; });
  const render = () => { let tree: unknown; for (let pass = 0; pass < 12; pass++) { hooks.current = state; state.cursor = 0; const writes = state.writes; tree = PaperPanel(props); for (const effect of state.pending.splice(0)) effect(); if (state.writes === writes) return tree; } throw new Error('Hook model did not settle'); };
  const byLabel = (label: string) => { const found = collect(render(), node => node.props['aria-label'] === label); if (found.length !== 1) throw new Error(`Expected one ${label}, found ${found.length}`); return found[0]; };
  const change = (label: string, value: string) => { (byLabel(label).props.onChange as (event: { target: { value: string } }) => void)({ target: { value } }); render(); };
  render();
  return { props, render, byLabel, change, text: () => text(render()) };
}
beforeEach(() => { hooks.current = null; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Extended hours default', () => {
  it('is on for an ETH chart outside regular hours on a US equity, off otherwise', () => {
    expect(paperExtendedHoursDefault('extended', us, ny(8))).toBe(true);
    expect(paperExtendedHoursDefault('extended', us, ny(17, 30))).toBe(true);
    expect(paperExtendedHoursDefault('extended', us, ny(10))).toBe(false);
    expect(paperExtendedHoursDefault('regular', us, ny(8))).toBe(false);
    expect(paperExtendedHoursDefault(undefined, us, ny(8))).toBe(false);
    expect(paperExtendedHoursDefault('extended', { ...us, timezone: 'UTC' }, ny(8))).toBe(false);
  });
  it('the account ticket ticks Extended hours when a limit is chosen in the pre-market of an ETH chart', () => {
    const ui = panel(ny(8), { sessionMode: 'extended' });
    ui.change('Order type', 'limit');
    expect(ui.byLabel('Entry outside regular hours').props.checked).toBe(true);
    expect(ui.text()).toContain('Extended hours: the limit entry may also fill 04:00-09:30 and 16:00-20:00 New York time');
    expect(ui.text()).toContain('Expires at the extended-hours close (20:00 New York time): 2026-10-22 00:00:00 UTC if submitted now.');
  });
  it('stays off during regular hours and on a regular-hours chart', () => {
    const regular = panel(ny(10), { sessionMode: 'extended' }); regular.change('Order type', 'limit');
    expect(regular.byLabel('Entry outside regular hours').props.checked).toBe(false);
    expect(regular.text()).toContain('Expires at the regular close (16:00 New York time): 2026-10-21 20:00:00 UTC if submitted now.');
    const rth = panel(ny(8), { sessionMode: 'regular' }); rth.change('Order type', 'limit');
    expect(rth.byLabel('Entry outside regular hours').props.checked).toBe(false);
  });
  it('the Day choice names the session close for US equities', () => {
    const ui = panel(ny(10));
    expect(ui.text()).toContain('Day: until the session close');
  });
});

describe('broker ticket Extended hours', () => {
  it('only a limit entry carries entryOutsideRth', () => {
    const base = { ...blankBrokerDraft('buy'), price: '9', extendedHours: true };
    expect(brokerTicketInput({ ...base, tab: 'limit' }, 'USD').entryOutsideRth).toBe(true);
    expect(brokerTicketInput({ ...base, tab: 'stop' }, 'USD').entryOutsideRth).toBe(false);
    expect(brokerTicketInput({ ...base, tab: 'market' }, 'USD').entryOutsideRth).toBe(false);
    expect(brokerTicketInput({ ...base, tab: 'limit', extendedHours: false }, 'USD').entryOutsideRth).toBe(false);
  });
  it('the Order ticket shows the Extended hours box on the Limit tab, seeded from the host default', () => {
    const now = ny(8), account = processPaperQuote(createPaperAccount({ initialBalance: 1000, now }), quoteAt(now), now, undefined, us).account;
    const state: HookStore = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
    const render = (extendedHoursDefault: boolean, tab: 'limit' | 'market') => { state.cells = []; hooks.current = state; state.cursor = 0; return PaperOrderTicket({ account, instrument: us, quote: quoteAt(now), quoteSource: { key: 'SYNTHETIC', state: 'ready' }, now, side: 'buy', tab, price: '9', extendedHoursDefault, onAccountChange: () => true, onDone: () => {} }); };
    const box = (tree: unknown) => collect(tree, node => node.props['aria-label'] === 'Extended hours');
    expect(box(render(true, 'limit'))[0]?.props.checked).toBe(true);
    expect(box(render(false, 'limit'))[0]?.props.checked).toBe(false);
    expect(box(render(true, 'market'))).toEqual([]);
  });
});

describe('floating ticket panel', () => {
  it('keeps the header reachable inside the window and starts at the right side', () => {
    expect(clampFloatingPosition({ x: 5000, y: 5000 }, { width: 520, height: 600 }, { width: 1280, height: 800 })).toEqual({ x: 1232, y: 752 });
    expect(clampFloatingPosition({ x: -5000, y: -40 }, { width: 520, height: 600 }, { width: 1280, height: 800 })).toEqual({ x: -472, y: 0 });
    expect(clampFloatingPosition({ x: Number.NaN, y: 20 }, { width: 520, height: 600 }, { width: 1280, height: 800 })).toEqual({ x: 0, y: 20 });
    expect(defaultFloatingPosition(520, { width: 1280, height: 800 })).toEqual({ x: 688, y: 104 });
  });
  it('is a non-modal dialog with no blocking shade', () => {
    hooks.current = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
    const tree = FloatingPanel({ title: 'Order ticket', onClose: () => {}, children: 'SYNTHETIC body' }) as unknown as ElementModel;
    expect(tree.props.role).toBe('dialog');
    expect(tree.props['aria-modal']).toBe('false');
    expect(String(tree.props.className)).not.toContain('modal-shade');
    expect((tree.props.style as Record<string, unknown>).position).toBe('fixed');
    expect(collect(tree, node => node.props['aria-label'] === 'Close Order ticket')).toHaveLength(1);
  });
  it('Escape inside the panel closes it', () => {
    hooks.current = { cells: [], cursor: 0, effects: new Map(), pending: [], writes: 0 };
    const onClose = vi.fn(), tree = FloatingPanel({ title: 'Order ticket', onClose, children: null }) as unknown as ElementModel;
    (tree.props.onKeyDown as (event: unknown) => void)({ key: 'Escape', nativeEvent: { isComposing: false }, stopPropagation: vi.fn() });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('the App opens both tickets in the floating panel and passes the session inputs (source wiring)', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).not.toMatch(/<Modal title="Order ticket"/);
    expect(app).not.toMatch(/<Modal title=\{replay\?'Replay paper trading':'Paper trading'\}/);
    // LiveBookBinding (live-dataset-store.ts) sits between the panel and the ticket and injects the live book.
    // LiveBookBinding is keyed on the cursor seed (tab|price) so a new seed remounts the ticket.
    expect(app).toMatch(/<FloatingPanel title="Order ticket" onClose=\{closeDialog\}>\{reuse\('dialog:order-book',<LiveBookBinding key=\{\(orderSeed\.tab\?\?''\)\+'\|'\+\(orderSeed\.price\?\?''\)\} instrumentId=\{orderSeed\.relay\?relayQuoteInstrument:chartQuoteInstrument\} mode="ticket">\{reuse\('dialog:order-ticket',<PaperOrderTicket key=\{[^}]*\} extendedHoursDefault=\{paperExtendedHoursDefault\(sessionMode,orderSeed\.relay\?\.instrument\?\?dataset\.instrument,/);
    expect(app).toMatch(/presetSeed=\{replay\?null:presetSeed\} sessionMode=\{sessionMode\}\/><\/FloatingPanel>/);
  });
});
