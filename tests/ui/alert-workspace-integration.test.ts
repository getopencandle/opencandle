// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkspaceAlerts } from '../../src/ui/WorkspaceAlerts';
import type { AlertDialogProps } from '../../src/ui/AlertDialog';
import { fixtureDataset } from '../../src/domain/fixtures';
import { createLocalAlert, editLocalAlert, type LocalAlert } from '../../src/domain/alerts';
import { TechnicalAlertObserver } from '../../src/ui/technical-alert-observer';
import { AlertDeliveryHost } from '../../src/ui/alert-delivery-host';
import { sourceContextForDataset } from '../../src/chart/source-context';
import type { ChartController } from '../../src/chart/adapter';

// Actual WorkspaceAlerts observation path under the same controlled hook scheduler
// used by alert-manager-authority-independent (copied, not imported, because the
// React mock is hoisted per suite). No browser, executable or OS delivery claim.
interface StateSlot { value: unknown; pending: unknown[]; }
interface EffectSlot { dependencies?: readonly unknown[]; cleanup?: () => void; }
interface HookStore { cells: unknown[]; stateSlots: Set<StateSlot>; effects: Map<number, EffectSlot>; pendingEffects: Array<() => void>; cursor: number; }
const hooks = vi.hoisted(() => ({ store: null as HookStore | null }));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const current = () => { if (!hooks.store) throw new Error('Missing synthetic hook owner'); return hooks.store; };
  const same = (a?: readonly unknown[], b?: readonly unknown[]) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const effect = (create: () => void | (() => void), dependencies?: readonly unknown[]) => {
    const store = current(), index = store.cursor++, old = store.effects.get(index);
    if (old && same(old.dependencies, dependencies)) return;
    const slot: EffectSlot = { dependencies: dependencies?.slice() }; store.effects.set(index, slot);
    store.pendingEffects.push(() => { old?.cleanup?.(); const cleanup = create(); if (typeof cleanup === 'function') slot.cleanup = cleanup; });
  };
  const memo = <T,>(create: () => T, dependencies?: readonly unknown[]): T => {
    const store = current(), index = store.cursor++, old = store.cells[index] as { dependencies?: readonly unknown[]; value: T } | undefined;
    if (!old || !same(old.dependencies, dependencies)) store.cells[index] = { dependencies: dependencies?.slice(), value: create() };
    return (store.cells[index] as { value: T }).value;
  };
  return {
    ...actual, useEffect: effect, useLayoutEffect: effect, useMemo: memo,
    useCallback: <T,>(callback: T, dependencies?: readonly unknown[]) => memo(() => callback, dependencies),
    useRef<T>(initial: T) { const store = current(), index = store.cursor++; if (!(index in store.cells)) store.cells[index] = { current: initial }; return store.cells[index] as { current: T }; },
    useState<T>(initial: T | (() => T)) {
      const store = current(), index = store.cursor++;
      if (!(index in store.cells)) { const slot: StateSlot = { value: typeof initial === 'function' ? (initial as () => T)() : initial, pending: [] }; store.cells[index] = slot; store.stateSlots.add(slot); }
      const slot = store.cells[index] as StateSlot;
      return [slot.value as T, (next: T | ((prior: T) => T)) => { const prior = slot.pending.length ? slot.pending.at(-1) : slot.value; slot.pending.push(typeof next === 'function' ? (next as (value: T) => T)(prior as T) : next); }];
    },
  };
});

type Props = Parameters<typeof WorkspaceAlerts>[0];
const timers = new Map<number, () => void>();
let timerId = 0;
const stores: HookStore[] = [];
const microtasks = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { resolve, promise }; };
function authority(child: AlertDialogProps) { const value = child.managerActionAuthority; if (!value) throw new Error('Expected Workspace manager action authority'); return value; }
function context(child: AlertDialogProps) { if (!child.context) throw new Error('Expected actual synthetic observation: ' + child.diagnostics?.join('; ')); return child.context; }
function dispose(store: HookStore) { for (const slot of store.effects.values()) { slot.cleanup?.(); slot.cleanup = undefined; } store.pendingEffects.length = 0; }

function setup() {
  const store: HookStore = { cells: [], stateSlots: new Set(), effects: new Map(), pendingEffects: [], cursor: 0 }; stores.push(store);
  let clock = 1791979200;
  vi.spyOn(Date, 'now').mockImplementation(() => clock * 1000);
  const dataset = fixtureDataset('GME', 1);
  dataset.bars = [{ time: 1704153600, open: 8, high: 10, low: 7, close: 9, volume: 100 }];
  let props: Props = { open: true, onClose: vi.fn(), alerts: [], onAlertsChange: () => false, dataset, bars: dataset.bars, chartId: 'SYNTHETIC-authority-chart', replay: null, enabled: true, suspended: false };
  const publisher = vi.fn((next: LocalAlert[], expected?: LocalAlert[]) => { if (expected !== props.alerts) return false; props = { ...props, alerts: next }; return true; });
  props.onAlertsChange = publisher;
  const makeChart = (): ChartController => ({
    getSourceContext: () => sourceContextForDataset(props.dataset, props.bars), getStyle: () => 'candles',
    getDataWindow: () => ({ pending: false, series: { count: props.bars?.length ?? 0, firstTime: props.bars?.[0]?.time ?? null, lastTime: props.bars?.at(-1)?.time ?? null, style: 'candles' } }),
    getChartOptions: () => ({ scale: 'linear' }), saveDrawings: () => ({ drawings: [] }),
    indicators: { serialize: () => [], subscribe: () => () => {} }, onDrawingsChanged: () => () => {},
  } as unknown as ChartController);
  props.chart = makeChart();
  const render = (flush = true): AlertDialogProps => {
    if (flush) for (const slot of store.stateSlots) if (slot.pending.length) { slot.value = slot.pending.at(-1); slot.pending.length = 0; }
    hooks.store = store; store.cursor = 0;
    return WorkspaceAlerts(props).props as AlertDialogProps;
  };
  const effects = () => { const child = render(); for (const run of store.pendingEffects.splice(0)) run(); return child; };
  const settle = async () => { for (let i = 0; i < 8; i++) { effects(); await microtasks(); } return render(); };
  const update = (changes: Partial<Props>, flush = true) => { props = { ...props, ...changes }; return render(flush); };
  const tick = () => { const run = [...timers.values()].at(-1); if (!run) throw new Error('Missing actual Workspace interval callback'); run(); };
  const alert = (child: AlertDialogProps, id = 'SYNTHETIC-authority-alert') => {
    const value = context(child);
    return createLocalAlert({ id, name: id, message: '{{ticker}} {{exchange}} close {{close}} high {{high}} vol {{volume}} row {{time}} fired {{timenow}} {{plot_0}}', instrumentId: value.instrumentId, sourceId: value.sourceId, runId: value.runId, mode: value.mode, observationBinding: value.binding, conditionVersion: 2, condition: { kind: 'greater', value: 0 }, frequency: 'every-time', createdAt: clock, expiresAt: null });
  };
  const seed = async () => { const child = await settle(); expect(child.onAlertsChange([alert(child)], props.alerts)).toBe(true); child.onRequestObservation?.('after-save'); return settle(); };
  return { render, effects, settle, update, tick, makeChart, alert, seed, publisher, props: () => props, advance: (seconds: number) => { clock += seconds; }, unmount: () => dispose(store) };
}

beforeEach(() => {
  stores.length = 0; timers.clear(); timerId = 0;
  vi.stubGlobal('setInterval', (callback: () => void) => { timers.set(++timerId, callback); return timerId; });
  vi.stubGlobal('clearInterval', (id: number) => { timers.delete(id); });
});
afterEach(() => { for (const store of stores) dispose(store); hooks.store = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

beforeEach(() => {
  stores.length = 0; timers.clear(); timerId = 0;
  vi.stubGlobal('setInterval', (callback: () => void) => { timers.set(++timerId, callback); return timerId; });
  vi.stubGlobal('clearInterval', (id: number) => { timers.delete(id); });
});
afterEach(() => { for (const store of stores) dispose(store); hooks.store = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('records the rendered placeholder message in history while the saved template stays unchanged', async () => {
  const ui = setup(); await ui.seed();
  const [saved] = ui.props().alerts;
  expect(saved.history).toHaveLength(1);
  expect(saved.definition.message).toBe('{{ticker}} {{exchange}} close {{close}} high {{high}} vol {{volume}} row {{time}} fired {{timenow}} {{plot_0}}');
  expect(saved.history[0].message).toBe('GME SYNTHETIC close 9 high 10 vol 100 row 2024-01-02T00:00:00Z fired 2026-10-14T12:00:00Z {{plot_0}}');
  ui.advance(1); const child = ui.render();
  expect(child.onAlertsChange([...ui.props().alerts], ui.props().alerts)).toBe(true);
  child.onRequestObservation?.('after-save'); await ui.settle();
  expect(ui.props().alerts[0].history.map(item => item.message)).toEqual([saved.history[0].message, 'GME SYNTHETIC close 9 high 10 vol 100 row 2024-01-02T00:00:00Z fired 2026-10-14T12:00:01Z {{plot_0}}']);
});

it('passes the current saved alerts to the always-mounted delivery host slot', async () => {
  const ui = setup(); const first = await ui.seed();
  const host = first.deliveryHost as { type: unknown; props: { alerts: LocalAlert[] } };
  expect(host.type).toBe(AlertDeliveryHost); expect(host.props.alerts).toBe(ui.props().alerts);
  ui.update({ open: false }); const closed = ui.render();
  expect(closed.open).toBe(false); expect((closed.deliveryHost as typeof host).props.alerts).toBe(ui.props().alerts);
});

it('ALERT.MANAGE.EDIT: an in-flight evaluation from the pre-edit base cannot overwrite an accepted edit', async () => {
  const ui = setup(); const first = await ui.seed();
  const before = ui.props().alerts; expect(before[0].history).toHaveLength(1);
  const entered = deferred(), release = deferred(), original = TechnicalAlertObserver.prototype.observeForPublication;
  let staleEvents = -1;
  const spy = vi.spyOn(TechnicalAlertObserver.prototype, 'observeForPublication').mockImplementation(async function (this: TechnicalAlertObserver, ...args) {
    const result = await original.apply(this, args); if (staleEvents < 0) staleEvents = result.view.events.length; entered.resolve(); await release.promise; return result;
  });
  ui.advance(1); first.onRequestObservation?.(); await entered.promise;
  // The running explicit evaluation captured `before` and produced an event whose value 9
  // is above the old level 0, so publishing it would have appended a stale trigger.
  expect(staleEvents).toBe(1);
  const edited = editLocalAlert(before[0], { name: 'SYNTHETIC edited', condition: { kind: 'greater', value: 1000 } }, 1791979201);
  const editCall = ui.publisher.mock.calls.length;
  expect(first.onAlertsChange([edited], before)).toBe(true);
  const accepted = ui.props().alerts;
  release.resolve(); await ui.settle(); spy.mockRestore(); await ui.settle();
  // The stale evaluation does attempt to publish from the pre-edit base; exact-base
  // publication refuses it, and every accepted later publication descends from the edit.
  const later = ui.publisher.mock.calls.map((call, index) => ({ call, outcome: ui.publisher.mock.results[index].value as boolean })).slice(editCall + 1);
  const stale = later.filter(entry => entry.call[1] === before);
  expect(stale.length).toBeGreaterThan(0); expect(stale.every(entry => entry.outcome === false)).toBe(true);
  expect(stale.some(entry => entry.call[0][0].history.length === 2 && entry.call[0][0].revision === 1)).toBe(true);
  expect(later.filter(entry => entry.outcome).every(entry => entry.call[0][0].revision === 2 && entry.call[0][0].definition.name === 'SYNTHETIC edited')).toBe(true);
  expect(ui.publisher.mock.calls[editCall][0][0]).toBe(edited); expect(accepted[0]).toBe(edited);
  const [current] = ui.props().alerts;
  expect(current.revision).toBe(2); expect(current.definition.name).toBe('SYNTHETIC edited'); expect(current.definition.condition).toEqual({ kind: 'greater', value: 1000 });
  // History is retained from before the edit; the stale trigger under the old condition was not saved,
  // and the edited condition (9 > 1000 is false) records nothing new.
  expect(current.history).toEqual(before[0].history);
});

it('Long/Short: catalog offers the drawing, exits are monitored after an already-passed entry, moved levels restart with history kept, and the take profit message is recorded', async () => {
  const ui = setup();
  const drawings: Array<Record<string, unknown>> = [{ id: 'p1', type: 'position', paneId: 'price', anchors: [{ time: 1704153600000, price: 8 }, { time: 1704240000000, price: 6 }, { time: 1704240000000, price: 12 }], style: {}, locked: false, visible: true, props: { riskPercent: 1, accountBalance: 10000 } }];
  const chart = { ...(ui.makeChart() as unknown as Record<string, unknown>), saveDrawings: () => ({ drawings }) } as unknown as ChartController;
  ui.update({ chart });
  let child = await ui.settle();
  const choice = child.sourceChoices?.find(item => item.id === 'position:p1');
  expect(choice?.label).toBe('Long/Short position: Long entry 8, take profit 12, stop loss 6, quantity 50');
  expect(choice?.position).toEqual({ schemaVersion: 1, drawingId: 'p1', side: 'long', entry: 8, target: 12, stop: 6, quantity: 50, ticker: 'GME', currency: 'USD' });
  const value = child.context!;
  const created = createLocalAlert({ id: 'SYNTHETIC-position', name: 'SYNTHETIC position', message: 'SYNTHETIC plan', instrumentId: value.instrumentId, sourceId: value.sourceId, runId: value.runId, mode: value.mode, observationBinding: value.binding, conditionVersion: 2, condition: { kind: 'position', position: choice!.position! }, frequency: 'every-time', createdAt: 1791979200, expiresAt: null });
  expect(child.onAlertsChange([created], ui.props().alerts)).toBe(true); child.onRequestObservation?.('after-save'); child = await ui.settle();
  // Close 9 is between entry 8 and take profit 12: entry counts as passed, no notification.
  expect(ui.props().alerts[0].positionPhase).toBe('entered'); expect(ui.props().alerts[0].history).toEqual([]);
  expect(child.diagnostics).toContain('Entry was already passed when monitoring began. Take profit and stop loss are monitored without an entry notification.');
  // Move the take profit to 13 (and recolor): the alert restarts with the new level.
  drawings[0] = { ...drawings[0], style: { lineColor: '#00ff00' }, anchors: [{ time: 1704153600000, price: 8 }, { time: 1704240000000, price: 6 }, { time: 1704240000000, price: 13 }] };
  ui.advance(1); ui.tick(); child = await ui.settle();
  const restarted = ui.props().alerts[0];
  expect(restarted.revision).toBe(2); expect(restarted.definition.condition.position?.target).toBe(13); expect(restarted.positionPhase).toBe('waiting-entry');
  expect(child.diagnostics).toContain("1 Long/Short position alert restarted with the drawing's new levels; history was kept.");
  child.onRequestObservation?.(); await ui.settle();
  expect(ui.props().alerts[0].positionPhase).toBe('entered');
  // A new supplied row closes at 13.5, beyond the moved take profit.
  ui.advance(1);
  const bars = [...ui.props().bars!, { time: 1704240000, open: 9, high: 14, low: 9, close: 13.5, volume: 100 }];
  ui.update({ bars, dataset: { ...ui.props().dataset, bars } }); await ui.settle();
  const [done] = ui.props().alerts;
  expect(done.history.map(item => [item.positionLevel, item.value, item.message])).toEqual([['target', 13.5, 'SYNTHETIC plan\nGME Long position: Take profit 13 reached at 13.5. Quantity 50. PnL +275.00 USD.']]);
  expect(done.status).toBe('stopped'); expect(done.positionPhase).toBe('exited');
  // A cosmetic-only change after the exit does not restart the finished alert.
  drawings[0] = { ...drawings[0], visible: false }; ui.advance(1); ui.tick(); await ui.settle();
  expect(ui.props().alerts[0]).toBe(done);
});

it('a create request with a catalog source selects it with a constant target and passes the request to the manager', async () => {
  const ui = setup();
  const drawings = [{ id: 'p1', type: 'position', paneId: 'price', anchors: [{ time: 1704153600000, price: 8 }, { time: 1704240000000, price: 6 }, { time: 1704240000000, price: 12 }], props: { riskPercent: 1, accountBalance: 10000 } }];
  ui.update({ chart: { ...(ui.makeChart() as unknown as Record<string, unknown>), saveDrawings: () => ({ drawings }) } as unknown as ChartController });
  let child = await ui.settle();
  expect(child.selectedSourceId).toBe('price:close:chart');
  const request = { sourceId: 'position:p1' };
  ui.update({ createRequest: request }); child = await ui.settle();
  expect(child.selectedSourceId).toBe('position:p1'); expect(child.targetSourceId).toBe('constant'); expect(child.createRequest).toBe(request);
  expect(child.context?.binding.source).toEqual({ kind: 'price', field: 'close', transformId: 'standard' });
  // The same request object is handled once; a manual source change is not overridden by it.
  child.onSourceChange?.('price:open:chart'); child = await ui.settle();
  expect(child.selectedSourceId).toBe('price:open:chart');
});

it('lane G: a saved alert keeps running on the chart after the chart moved to another symbol and back', async () => {
  const ui = setup(); await ui.seed();
  expect(ui.props().alerts[0].history).toHaveLength(1);
  const home = ui.props().dataset, homeBars = ui.props().bars;
  const away = fixtureDataset('SPY', 1); away.bars = [{ time: 1704153600, open: 80, high: 100, low: 70, close: 90, volume: 100 }];
  ui.update({ dataset: away, bars: away.bars }); await ui.settle();
  ui.advance(1);
  ui.update({ dataset: home, bars: homeBars }); await ui.settle();
  ui.advance(1); ui.tick(); await ui.settle();
  expect(ui.props().alerts[0].history.length).toBeGreaterThan(1);
});

it('Drawings: a rectangle alert follows its drawing; a move restarts it with history kept', async () => {
  const ui = setup(), day = 1704153600, rows = [9, 9, 9].map((close, index) => ({ time: day + index * 86400, open: close, high: close + 1, low: close - 1, close, volume: 100 }));
  let drawings: Array<Record<string, unknown>> = [{ id: 'b1', type: 'box', paneId: 'price', anchors: [{ time: day * 1000, price: 12 }, { time: (day + 2 * 86400) * 1000, price: 20 }], style: {}, props: { lvBoxExtend: { schemaVersion: 1, left: false, right: true } } }];
  const chart = { ...(ui.makeChart() as unknown as Record<string, unknown>), saveDrawings: () => ({ drawings }) } as unknown as ChartController;
  ui.update({ chart, bars: rows });
  let child = await ui.settle();
  expect(child.sourceChoices?.find(item => item.id === 'drawing:b1')?.label).toBe('Rectangle: close in the channel');
  child.onSourceChange?.('drawing:b1'); child = await ui.settle();
  const value = context(child);
  expect(value.binding.source).toMatchObject({ kind: 'drawing-boundary', mutationPolicy: 'follow' });
  const created = createLocalAlert({ id: 'SYNTHETIC-box', name: 'SYNTHETIC box', message: 'SYNTHETIC', instrumentId: value.instrumentId, sourceId: value.sourceId, runId: value.runId, mode: value.mode, observationBinding: value.binding, conditionVersion: 2, condition: { kind: 'entering', lower: 0, upper: 1 }, frequency: 'every-time', createdAt: 1791979200, expiresAt: null });
  expect(child.onAlertsChange([created], ui.props().alerts)).toBe(true); child.onRequestObservation?.('after-save'); child = await ui.settle();
  expect(ui.props().alerts[0].revision).toBe(1);
  // Recolouring is not a move.
  drawings = [{ ...drawings[0], style: { lineColor: '#00ff00' } }];
  ui.advance(1); ui.tick(); child = await ui.settle();
  expect(ui.props().alerts[0].revision).toBe(1);
  // Move the rectangle down so the close 9 is inside: the alert restarts instead of firing on the move itself.
  drawings = [{ ...drawings[0], anchors: [{ time: day * 1000, price: 5 }, { time: (day + 2 * 86400) * 1000, price: 20 }] }];
  ui.advance(1); ui.tick(); child = await ui.settle();
  expect(ui.props().alerts[0].revision).toBe(2);
  expect(ui.props().alerts[0].history).toEqual([]);
  expect(child.diagnostics).toContain("1 drawing alert restarted with the drawing's new position; history was kept.");
});


it('manager invalid drawing metadata follows delete, Undo, Redo and layout restore', async () => {
  const ui=setup(),child=await ui.settle(),base=ui.alert(child),position={schemaVersion:1 as const,drawingId:'SYNTHETIC-followed-position',side:'long' as const,entry:8,target:12,stop:6,quantity:50,ticker:'GME',currency:'USD'};
  const alert=editLocalAlert(base,{condition:{kind:'position',position}},Math.floor(Date.now()/1000));
  const drawing={id:position.drawingId,type:'position',paneId:'price',anchors:[{time:1704153600000,price:8},{time:1704240000000,price:6},{time:1704240000000,price:12}],props:{riskPercent:1,accountBalance:10000}};
  let rows:unknown[]=[drawing];
  const chart={...ui.makeChart(),saveDrawings:()=>({drawings:rows})} as ChartController;
  ui.update({chart,alerts:[alert]});let view=await ui.settle();
  expect(view.invalidDrawings?.size).toBe(0);
  rows=[];ui.tick();view=await ui.settle();expect(view.invalidDrawings?.get(alert.definition.id)).toBe('Drawing deleted. Undo to bring it back.');
  rows=[drawing];ui.tick();view=await ui.settle();expect(view.invalidDrawings?.size).toBe(0);
  rows=[];ui.tick();view=await ui.settle();expect(view.invalidDrawings?.has(alert.definition.id)).toBe(true);
  rows=[drawing];ui.update({chart:{...chart},chartId:'SYNTHETIC-restored-layout'});view=await ui.settle();expect(view.invalidDrawings?.size).toBe(0);
  expect(ui.props().alerts[0].definition.condition).toEqual({kind:'position',position});
});
