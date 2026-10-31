import { expect, it, vi } from 'vitest';
import { mountControlledComponent, all, text, invoke } from '../helpers/alert-dialog-harness';
import { AlertsDock, type AlertsDockProps } from '../../src/ui/AlertsDock';
import { createLocalAlert, processAlertEvent, type LocalAlert } from '../../src/domain/alerts';
import { ALERT_HISTORY_CSV_COLUMNS } from '../../src/domain/alert-history-export';
import { DEFAULT_DOCK_LIST_VIEW, dockAlertSymbols, dockBulkApply, dockInactiveIds, dockListRows, dockLogExportAlerts, dockLogRows, dockVisibleAlerts, type DockLogEntry } from '../../src/ui/alerts-dock-model';
import { ALERT_LOG_READ_KEY, createAlertLogReadStore, type AlertLogReadStorage } from '../../src/ui/alert-log-read';
import { rightRail } from '../../src/ui/shell';

// SYNTHETIC checks: Alerts manager (filters, sorts, multi-select, Restart all inactive, trigger count, stop
// reasons) and Alerts log (symbol filter, read state, CSV export, Show on chart), plus the rail's unread counter slot.
const make = (id: string, symbol: string, extra: Partial<LocalAlert['definition']> = {}) => createLocalAlert({ id, name: `${symbol} ${id}`, message: `${symbol} msg`, instrumentId: 'US:' + symbol, sourceId: 'close', condition: { kind: 'crossing-up', value: 10 }, frequency: 'every-time', createdAt: 100, expiresAt: null, mode: 'ordinary', runId: 'ordinary', ...extra });
const ev = (alert: LocalAlert, sequence: number, value: number, time: number) => ({ instrumentId: alert.definition.instrumentId, sourceId: 'close', value, time, availableAt: time, sequence, barId: 'b' + sequence, barClosed: false, feedState: 'ready' as const, mode: 'ordinary' as const, runId: 'ordinary' });
const fired = (alert: LocalAlert, time = 1000, times = 1) => { let current = alert, seq = 0; for (let i = 0; i < times; i++) { current = processAlertEvent(current, ev(current, ++seq, 9, time + i * 10)).alert; current = processAlertEvent(current, ev(current, ++seq, 11, time + i * 10 + 1)).alert; } return current; };
const ids = (alerts: readonly LocalAlert[]) => alerts.map(alert => alert.definition.id);
const typed = (alert: LocalAlert, kind: string) => ({ ...alert, definition: { ...alert.definition, observationBinding: { source: { kind } } } }) as unknown as LocalAlert;
const memory = (): AlertLogReadStorage & { data: Map<string, string> } => { const data = new Map<string, string>(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } }; };
const rowsOpt = { activeInstrumentId: '', unwatched: new Map<string, string>(), formatTime: String, now: 500 };

it('rows say why an alert stopped and how often it triggered, with its type', () => {
  const once = fired(make('1', 'GME', { frequency: 'only-once' }));
  expect(once.status).toBe('stopped');
  const expired = { ...make('2', 'SPY', { expiresAt: 400 }), status: 'expired' as const }, twice = fired(make('3', 'GME'), 1000, 2), quiet = typed(make('4', 'AMC'), 'indicator');
  const rows = dockListRows([once, expired, twice, quiet], rowsOpt);
  expect(rows.map(row => [row.status, row.triggers, row.type])).toEqual([['Stopped: triggered', 1, 'Price (older)'], ['Stopped: expired', 0, 'Price (older)'], ['Active', 2, 'Price (older)'], ['Active', 0, 'Indicator']]);
});

it('filters by symbol and type and sorts by status and trigger count, keeping the saved order on ties', () => {
  const a = fired(make('1', 'GME'), 1000, 3), b = { ...make('2', 'SPY'), status: 'paused' as const }, c = typed(make('3', 'GME'), 'drawing-boundary'), d = { ...make('4', 'AMC'), status: 'expired' as const }, e = fired(make('5', 'SPY'));
  const saved = [a, b, c, d, e];
  expect(dockAlertSymbols(saved)).toEqual(['AMC', 'GME', 'SPY']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, symbol: 'GME' }))).toEqual(['1', '3']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, type: 'drawing' }))).toEqual(['3']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, type: 'legacy', symbol: 'SPY' }))).toEqual(['2', '5']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, sort: 'status' }))).toEqual(['1', '3', '5', '2', '4']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, sort: 'status', direction: 'desc' }))).toEqual(['4', '2', '1', '3', '5']);
  expect(ids(dockVisibleAlerts(saved, { ...DEFAULT_DOCK_LIST_VIEW, sort: 'count', direction: 'desc' }))).toEqual(['1', '5', '2', '3', '4']);
  expect(ids(saved)).toEqual(['1', '2', '3', '4', '5']);
});

it('bulk Stop, Restart and Delete act on the selection only and report what was left unchanged', () => {
  const a = make('1', 'GME'), b = { ...make('2', 'SPY'), status: 'paused' as const }, c = { ...make('3', 'AMC', { expiresAt: 400 }), status: 'expired' as const }, d = make('4', 'IWM');
  const stop = dockBulkApply([a, b, c, d], ['1', '2'], 'stop', 500);
  expect(stop.changed).toEqual(['1']); expect(stop.unchanged).toEqual(['2']); expect(stop.next.map(row => row.status)).toEqual(['paused', 'paused', 'expired', 'active']); expect(stop.next[3]).toBe(d);
  const restart = dockBulkApply([a, b, c, d], ['1', '2', '3'], 'restart', 500);
  expect(restart.changed).toEqual(['2', '3']); expect(restart.unchanged).toEqual(['1']);
  expect(restart.next.map(row => row.status)).toEqual(['active', 'active', 'active', 'active']); expect(restart.next[2].definition.expiresAt).toBeNull(); expect(restart.next[0]).toBe(a);
  expect(ids(dockBulkApply([a, b, c, d], ['2', '4'], 'delete', 500).next)).toEqual(['1', '3']);
  expect(() => dockBulkApply([a], ['9'], 'stop', 500)).toThrow(/changed/);
  expect(() => dockBulkApply([a], [], 'stop', 500)).toThrow(/Select/);
  expect(dockInactiveIds([a, b, c, d, { ...make('5', 'QQQ'), status: 'stopped' as const }])).toEqual(['2', '3', '5']);
});

it('the read store counts entries after its start as unread, persists marks and prunes gone ids', () => {
  const storage = memory(), store = createAlertLogReadStore(storage, () => 1000);
  const old = { id: 'old', at: 999 }, x = { id: 'x', at: 1000 }, y = { id: 'y', at: 2000 };
  expect([store.isUnread(old), store.isUnread(x), store.isUnread(y)]).toEqual([false, true, true]);
  const listener = vi.fn(); store.subscribe(listener);
  store.markRead(['x'], [x, y]); expect(store.isUnread(x)).toBe(false); expect(store.unreadCount([old, x, y])).toBe(1); expect(listener).toHaveBeenCalledTimes(1);
  store.markRead(['x']); expect(listener).toHaveBeenCalledTimes(1);
  const again = createAlertLogReadStore(storage, () => 9999);
  expect(again.isUnread(x)).toBe(false); expect(again.isUnread(y)).toBe(true);
  again.markAllRead([y]); expect(JSON.parse(storage.data.get(ALERT_LOG_READ_KEY)!)).toEqual({ v: 1, since: 1000, read: ['y'] });
  storage.data.set(ALERT_LOG_READ_KEY, '{bad'); expect(createAlertLogReadStore(storage, () => 5).isUnread({ id: 'z', at: 5 })).toBe(true);
  expect(createAlertLogReadStore(null, () => 1).isUnread({ id: 'z', at: 2 })).toBe(true);
});

it('the log filters by symbol and unread state, and export keeps only the shown local triggers', () => {
  const a = fired(make('1', 'GME'), 1000), b = fired(make('2', 'SPY'), 2000), extra: DockLogEntry[] = [{ id: 'list1', at: 3000, sequence: 1, symbol: 'GME', alert: 'W (list)', message: '', value: 1 }];
  const unread = (entry: { id: string }) => entry.id !== a.history[0].id;
  expect(dockLogRows([a, b], { formatTime: String, extra, symbol: 'GME' }).map(row => row.id)).toEqual(['list1', a.history[0].id]);
  const rows = dockLogRows([a, b], { formatTime: String, extra, isUnread: unread, unreadOnly: true });
  expect(rows.map(row => [row.symbol, row.unread, row.instrumentId ?? null])).toEqual([['GME', true, null], ['SPY', true, 'US:SPY']]);
  const picked = dockLogExportAlerts([a, b], new Set(rows.map(row => row.id)));
  expect(picked.exported).toBe(1); expect(ids(picked.alerts)).toEqual(['2']); expect(picked.alerts[0]).toBe(b);
});

function mount(alerts: LocalAlert[], extra: Partial<AlertsDockProps> = {}) {
  const props: AlertsDockProps = { alerts, activeInstrumentId: 'US:GME', unwatched: new Map(), formatTime: String, now: () => 500, onAlertsChange: vi.fn(() => true), onCreate: vi.fn(), onEdit: vi.fn(), newId: () => 'copy', readStore: createAlertLogReadStore(memory(), () => 0), ...extra };
  const view = mountControlledComponent(() => AlertsDock(props)); view.settle();
  const byLabel = (type: string, label: string) => all(view.render(), node => node.type === type && node.props['aria-label'] === label)[0];
  const tab = (name: string) => all(view.render(), node => node.type === 'button' && node.props.role === 'tab' && text(node).startsWith(name))[0];
  const button = (label: string) => all(view.render(), node => node.type === 'button' && text(node) === label)[0];
  const calls = () => (props.onAlertsChange as ReturnType<typeof vi.fn>).mock.calls;
  return { view, props, byLabel, tab, button, calls };
}

it('panel: select rows, Stop and Restart them, Delete selected asks first; Restart all inactive restarts every stopped alert', () => {
  const ui = mount([make('1', 'GME'), make('2', 'SPY'), { ...make('3', 'AMC'), status: 'expired' as const }]);
  expect(ui.byLabel('button', 'Pause selected alerts').props.disabled).toBe(true);
  invoke(ui.byLabel('input', 'Select GME 1').props.onChange, { target: { checked: true } }); ui.view.settle();
  invoke(ui.byLabel('input', 'Select SPY 2').props.onChange, { target: { checked: true } }); ui.view.settle();
  invoke(ui.byLabel('button', 'Pause selected alerts').props.onClick); ui.view.settle();
  expect(ui.calls()[0][0].map((row: LocalAlert) => row.status)).toEqual(['paused', 'paused', 'expired']);
  expect(text(ui.view.render())).toContain('Paused 2 alerts.');
  invoke(ui.byLabel('button', 'Restart all inactive alerts').props.onClick); ui.view.settle();
  expect(ui.calls()[1][0].map((row: LocalAlert) => row.status)).toEqual(['active', 'active', 'active']);
  invoke(ui.byLabel('input', 'Select all shown alerts').props.onChange, { target: { checked: true } }); ui.view.settle();
  invoke(ui.byLabel('button', 'Delete selected alerts').props.onClick); ui.view.settle();
  expect(ui.calls()).toHaveLength(2); expect(text(ui.byLabel('div', 'Confirm delete alerts'))).toContain('these 3 alerts');
  invoke(ui.button('Delete').props.onClick); ui.view.settle();
  expect(ui.calls()[2][0]).toEqual([]);
});

it('panel: rows show the trigger count and stop reason; the type and symbol filters narrow the list', () => {
  const ui = mount([fired(make('1', 'GME'), 1000, 2), { ...make('2', 'SPY'), status: 'stopped' as const }]);
  expect(text(ui.byLabel('small', 'Trigger count for GME 1'))).toBe('Triggered 2 times, last 1011');
  expect(text(ui.view.render())).toContain('Stopped: triggered');
  invoke(ui.byLabel('select', 'Filter alerts by symbol').props.onChange, { target: { value: 'SPY' } }); ui.view.settle();
  expect(all(ui.view.render(), node => node.type === 'li').map(node => node.props['data-alert-id'])).toEqual(['2']);
  invoke(ui.byLabel('select', 'Filter alerts by type').props.onChange, { target: { value: 'indicator' } }); ui.view.settle();
  expect(text(ui.view.render())).toContain('No alerts match');
});

it('panel log: unread marks, Mark all read, Export CSV of the shown entries and Show on chart', async () => {
  const a = fired(make('1', 'GME'), 1000), b = fired(make('2', 'SPY'), 2000);
  const exportData = vi.fn(async () => ({ ok: true as const })), onJumpToTrigger = vi.fn(() => true);
  const ui = mount([a, b], { exportData, onJumpToTrigger, listAlertLog: [{ id: 'list1', at: 3000, sequence: 1, symbol: 'GME', alert: 'W (list)', message: 'w', value: 1 }] });
  expect(ui.tab('Log').props['aria-label']).toBe('Log (3), 3 unread');
  invoke(ui.tab('Log').props.onClick); ui.view.settle();
  const unreadIds = () => all(ui.view.render(), node => node.type === 'li' && node.props['data-unread'] === 'true').map(node => node.props['data-log-id']);
  expect(unreadIds()).toEqual(['list1', b.history[0].id, a.history[0].id]);
  invoke(ui.byLabel('button', `Mark SPY 2 at ${b.history[0].at} read`).props.onClick); ui.view.settle();
  expect(unreadIds()).toEqual(['list1', a.history[0].id]);
  invoke(ui.byLabel('button', `Show GME 1 at ${a.history[0].at} on the chart`).props.onClick); ui.view.settle();
  expect(onJumpToTrigger).toHaveBeenCalledWith({ instrumentId: 'US:GME', symbol: 'GME', at: a.history[0].at });
  expect(unreadIds()).toEqual(['list1']);
  invoke(ui.byLabel('select', 'Filter alert log by symbol').props.onChange, { target: { value: 'GME' } }); ui.view.settle();
  invoke(ui.byLabel('button', 'Export alert log as CSV').props.onClick); await new Promise(resolve => setTimeout(resolve, 0)); ui.view.settle();
  const [request] = exportData.mock.calls[0] as unknown as [{ text: string; suggestedName: string; format: string }];
  expect(request.format).toBe('csv'); expect(request.text.split('\r\n')[0]).toBe('﻿' + ALERT_HISTORY_CSV_COLUMNS.map(name => `"${name}"`).join(','));
  expect(request.text).toContain(a.history[0].id); expect(request.text).not.toContain(b.history[0].id);
  expect(text(ui.view.render())).toContain('Saved 1 log entry as CSV. 1 list alert trigger is not included.');
  invoke(ui.byLabel('button', 'Mark all log entries read').props.onClick); ui.view.settle();
  expect(unreadIds()).toEqual([]); expect(ui.tab('Log').props['aria-label']).toBeUndefined();
  expect(ui.calls()).toHaveLength(0);
});

it('panel log: Export CSV is unavailable outside the desktop app and Show on chart only appears with a chart', () => {
  const ui = mount([fired(make('1', 'GME'))]);
  invoke(ui.tab('Log').props.onClick); ui.view.settle();
  expect(ui.byLabel('button', 'Export alert log as CSV').props.disabled).toBe(true);
  expect(all(ui.view.render(), node => node.type === 'button' && text(node) === 'Show on chart')).toHaveLength(0);
});

it('the rail shows a panel slot extra (the Alerts unread counter) beside its button', () => {
  const Icon = () => null, counter = { type: 'span', props: { className: 'lv-rail-counter' } } as never;
  const nav = rightRail({ panels: [{ id: 'alerts', label: 'Alerts', icon: Icon as never, render: () => null, extra: counter }], activePanel: null, onPanel: () => {}, topActions: [], bottomActions: [] });
  expect(JSON.stringify(nav)).toContain('lv-rail-counter');
});
