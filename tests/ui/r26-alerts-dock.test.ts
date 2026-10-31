import { expect, it, vi } from 'vitest';
import { mountControlledComponent, all, text, invoke } from '../helpers/alert-dialog-harness';
import { AlertsDock, type AlertsDockProps } from '../../src/ui/AlertsDock';
import { createLocalAlert, processAlertEvent, type LocalAlert } from '../../src/domain/alerts';
import { DEFAULT_DOCK_LIST_VIEW, dockApplyAction, dockClearLog, dockListRows, dockLogRows, dockRemoveAlerts, dockVisibleAlerts, type DockLogEntry } from '../../src/ui/alerts-dock-model';

// SYNTHETIC checks of the docked Alerts panel: search, status groups, sort, Clone, Restart, Delete all and Clear log.
const make = (id: string, symbol: string, createdAt = 100, extra: Partial<LocalAlert['definition']> = {}) => createLocalAlert({ id, name: `${symbol} ${id}`, message: `${symbol} msg`, instrumentId: 'US:' + symbol, sourceId: 'close', condition: { kind: 'crossing-up', value: 10 }, frequency: 'every-time', createdAt, expiresAt: null, mode: 'ordinary', runId: 'ordinary', ...extra });
const ev = (alert: LocalAlert, sequence: number, value: number) => ({ instrumentId: alert.definition.instrumentId, sourceId: 'close', value, time: 1000 + sequence, availableAt: 1000 + sequence, sequence, barId: 'b' + sequence, barClosed: false, feedState: 'ready' as const, mode: 'ordinary' as const, runId: 'ordinary' });
const fired = (alert: LocalAlert) => processAlertEvent(processAlertEvent(alert, ev(alert, 1, 9)).alert, ev(alert, 2, 11)).alert;
const ids = (alerts: readonly LocalAlert[]) => alerts.map(alert => alert.definition.id);

it('groups alerts as Active, Paused, Triggered and Stopped, searches literally and sorts without touching the saved order', () => {
  const a = fired(make('1', 'GME', 300)), b = { ...make('2', 'SPY', 200), status: 'paused' as const }, c = { ...make('3', 'AMC', 100), status: 'stopped' as const }, d = { ...make('4', 'IWM', 50), status: 'expired' as const }, e = { ...make('5', 'QQQ', 400), status: 'waiting-for-data' as const };
  const saved = [a, b, c, d, e];
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, status: 'active' }))).toEqual(['1', '5']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, status: 'paused' }))).toEqual(['2']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, status: 'triggered' }))).toEqual(['1']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, status: 'stopped' }))).toEqual(['3', '4']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, query: 'spy' }))).toEqual(['2']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, sort: 'created', direction: 'desc' }))).toEqual(['5', '1', '2', '3', '4']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, sort: 'ticker', direction: 'asc' }))).toEqual(['3', '1', '4', '5', '2']);
  expect(ids(saved)).toEqual(['1', '2', '3', '4', '5']);
});

it('clones after the original with a new identity and no log, and restarts a stopped alert keeping its log', () => {
  const a = fired(make('1', 'GME')), b = make('2', 'SPY');
  const cloned = dockApplyAction([a, b], '1', 'clone', 500, () => 'copy');
  expect(ids(cloned)).toEqual(['1', 'copy', '2']); expect(cloned[1].history).toEqual([]); expect(cloned[1].status).toBe('active'); expect(cloned[0]).toBe(a); expect(cloned[2]).toBe(b);
  const stopped = { ...a, status: 'stopped' as const };
  const restarted = dockApplyAction([stopped, b], '1', 'restart', 600);
  expect(restarted[0].status).toBe('active'); expect(restarted[0].history).toEqual(a.history); expect(restarted[0].revision).toBe(a.revision + 1); expect(restarted[1]).toBe(b);
  expect(() => dockApplyAction([b], '2', 'restart', 600)).toThrow(/stopped or expired/);
});

it('restarts an expired alert open-ended and says so on the row; an expired alert cannot be cloned', () => {
  const expired = { ...make('1', 'GME', 100, { expiresAt: 400 }), status: 'expired' as const };
  const [row] = dockListRows([expired], { activeInstrumentId: '', unwatched: new Map(), formatTime: String, now: 500 });
  expect(row).toMatchObject({ canRestart: true, restartOpenEnded: true, canClone: false, expiry: 'Expires 400' });
  const restarted = dockApplyAction([expired], '1', 'restart', 500)[0];
  expect(restarted.status).toBe('active'); expect(restarted.definition.expiresAt).toBeNull();
  expect(dockListRows([restarted], { activeInstrumentId: '', unwatched: new Map(), formatTime: String, now: 500 })[0].expiry).toBe('Open-ended');
  expect(() => dockApplyAction([expired], '1', 'clone', 500, () => 'x')).toThrow(/expired/);
});

it('Clear log keeps every alert and its state but drops its log; Delete all removes exactly the shown alerts', () => {
  const a = fired(make('1', 'GME')), b = make('2', 'SPY');
  const cleared = dockClearLog([a, b]);
  expect(cleared[0].history).toEqual([]); expect(cleared[0].lastTriggeredAt).toBe(a.lastTriggeredAt); expect(cleared[0].status).toBe(a.status); expect(cleared[1]).toBe(b);
  expect(() => dockClearLog([b])).toThrow(/already empty/);
  expect(ids(dockRemoveAlerts([a, b], ['1']))).toEqual(['2']);
  expect(() => dockRemoveAlerts([b], ['1'])).toThrow(/changed/);
  expect(() => dockRemoveAlerts([b], [])).toThrow(/No alerts/);
});

it('the log merges list alert triggers, searches them and orders oldest or newest first', () => {
  const a = fired(make('1', 'GME')), extra: DockLogEntry[] = [{ id: 'x', at: 5000, sequence: 1, symbol: 'SPY', alert: 'Watch (list)', message: 'SPY crossed', value: 7 }];
  expect(dockLogRows([a], { formatTime: String, extra }).map(row => row.symbol)).toEqual(['SPY', 'GME']);
  expect(dockLogRows([a], { formatTime: String, extra, order: 'oldest' }).map(row => row.symbol)).toEqual(['GME', 'SPY']);
  expect(dockLogRows([a], { formatTime: String, extra, query: 'crossed' }).map(row => row.id)).toEqual(['x']);
});

function mount(alerts: LocalAlert[], extra: Partial<AlertsDockProps> = {}) {
  const props: AlertsDockProps = { alerts, activeInstrumentId: 'US:GME', unwatched: new Map(), formatTime: String, now: () => 500, onAlertsChange: vi.fn(() => true), onCreate: vi.fn(), onEdit: vi.fn(), newId: () => 'copy', ...extra };
  const view = mountControlledComponent(() => AlertsDock(props)); view.settle();
  const byLabel = (type: string, label: string) => all(view.render(), node => node.type === type && node.props['aria-label'] === label)[0];
  const tab = (name: string) => all(view.render(), node => node.type === 'button' && node.props.role === 'tab' && text(node).startsWith(name))[0];
  const button = (label: string) => all(view.render(), node => node.type === 'button' && text(node) === label)[0];
  return { view, props, byLabel, tab, button };
}

it('panel: search and status filter narrow the list; Delete shown asks first and removes only the shown alerts', () => {
  const ui = mount([fired(make('1', 'GME')), make('2', 'SPY')]);
  invoke(ui.byLabel('select', 'Filter alerts by status').props.onChange, { target: { value: 'triggered' } }); ui.view.settle();
  expect(text(ui.view.render())).toContain('GME 1'); expect(text(ui.view.render())).not.toContain('SPY 2');
  invoke(ui.byLabel('button', 'Delete all shown alerts').props.onClick); ui.view.settle();
  expect(ui.props.onAlertsChange).not.toHaveBeenCalled(); expect(text(ui.byLabel('div', 'Confirm delete alerts'))).toContain('Delete this alert');
  invoke(ui.button('Delete').props.onClick); ui.view.settle();
  const [next, expected] = (ui.props.onAlertsChange as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(ids(next)).toEqual(['2']); expect(expected).toBe(ui.props.alerts);
});

it('panel: Clone and Restart publish through the shared publisher', () => {
  const stopped = { ...make('1', 'GME'), status: 'stopped' as const }, ui = mount([stopped, make('2', 'SPY')]);
  expect(ui.byLabel('button', 'Edit GME 1').props.disabled).toBe(true);
  invoke(ui.byLabel('button', 'Clone SPY 2').props.onClick);
  expect(ids((ui.props.onAlertsChange as ReturnType<typeof vi.fn>).mock.calls[0][0])).toEqual(['1', '2', 'copy']);
  invoke(ui.byLabel('button', 'Restart GME 1').props.onClick);
  expect((ui.props.onAlertsChange as ReturnType<typeof vi.fn>).mock.calls[1][0][0].status).toBe('active');
});

it('panel: Clear log confirms, clears local history and asks the list alerts to clear theirs', () => {
  const onClearListAlertLog = vi.fn(() => true), listAlertLog: DockLogEntry[] = [{ id: 'x', at: 1, sequence: 1, symbol: 'SPY', alert: 'L (list)', message: '', value: 1 }];
  const ui = mount([fired(make('1', 'GME'))], { listAlertLog, onClearListAlertLog });
  expect(text(ui.tab('Log'))).toBe('Log (2)');
  invoke(ui.tab('Log').props.onClick); ui.view.settle();
  invoke(ui.byLabel('input', 'Search alert log').props.onChange, { target: { value: 'spy' } }); ui.view.settle();
  expect(all(ui.view.render(), node => node.type === 'li')).toHaveLength(1);
  invoke(ui.byLabel('button', 'Clear alert log').props.onClick); ui.view.settle();
  expect(ui.props.onAlertsChange).not.toHaveBeenCalled();
  invoke(ui.button('Clear log').props.onClick); ui.view.settle();
  expect((ui.props.onAlertsChange as ReturnType<typeof vi.fn>).mock.calls[0][0][0].history).toEqual([]);
  expect(onClearListAlertLog).toHaveBeenCalledTimes(1);
});
