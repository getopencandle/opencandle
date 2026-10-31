import React, { useEffect, useState } from 'react';
import type { LocalAlert } from '../domain/alerts';
import { alertHistoryCsv } from '../domain/alert-history-export';
import { DEFAULT_DOCK_LIST_VIEW, DOCK_SORT_KEYS, DOCK_STATUS_FILTERS, DOCK_TYPE_FILTERS, dockAlertSymbols, dockApplyAction, dockBulkApply, dockClearLog, dockInactiveIds, dockListRows, dockLogEntries, dockLogExportAlerts, dockLogRows, dockRemoveAlerts, dockVisibleAlerts, listAlertLogEntries, type DockAction, type DockBulkAction, type DockListView, type DockLogEntry } from './alerts-dock-model';
import type { ListAlert } from '../domain/watchlist-alerts';
import { sharedAlertLogReadStore, type AlertLogReadStore } from './alert-log-read';
import './alerts-dock.css';
import { chartTimeFormatter, type ChartClockHours } from './chart-time-text';

/**
 * The docked Alerts panel, a list tab and a log tab over every saved alert on every symbol. Create and edit open the
 * existing alert dialog. Pause, resume and remove go through the same publisher as the dialog; a refusal is shown here.
 * The panel adds search, a status filter (Active, Paused, Triggered, Stopped) and sort on the list, Clone and Restart per
 * row, Delete all (shown) with a confirmation, and search, order and Clear log on the log. The view state is not saved.
 * The list also has Symbol and Type filters and Status, Type and Trigger count sorts; checkboxes
 * with Pause (it pauses, like the row button), Restart and Delete on the selected alerts; Restart all inactive; each row's trigger count and why it stopped. The log
 * gains a Symbol filter, Unread only, Mark read and Mark all read (alert-log-read.ts), Export CSV through the local export path,
 * and Show on chart, which centres the chart on the trigger time.
 */
export interface AlertsDockProps {
  alerts: LocalAlert[];
  activeInstrumentId: string;
  /** Alert id to the plain reason it is only checked while its chart is open. */
  unwatched: ReadonlyMap<string, string>;
  /** Missing drawings affect display only; Undo restores the saved alert status. */
  invalidDrawings?: ReadonlyMap<string, string>;
  /** Explicit time text. Absent: times follow `timezone` and `timeHours` (chart-time-text.ts), UTC without a zone. */
  formatTime?: (seconds: number) => string;
  /** The chart timezone (resolved IANA zone) every log, trigger and expiration time is shown in. */
  timezone?: string;
  /** The chart hour cycle (scales.timeHours). Default 24-hours. */
  timeHours?: ChartClockHours;
  now: () => number;
  onAlertsChange: (next: LocalAlert[], expected: LocalAlert[]) => boolean | void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  /** The list alert group (ListAlertsGroup), shown on the Alerts tab under the price alerts. */
  listAlerts?: React.ReactNode;
  /** Identity for a cloned alert. Defaults to crypto.randomUUID. */
  newId?: () => string;
  /** Triggers of list (watchlist) alerts, shown in the same log. */
  listAlertLog?: readonly DockLogEntry[];
  /** Clears the list alert triggers when Clear log is confirmed. Absent: Clear log leaves them and says so. */
  onClearListAlertLog?: () => boolean | void;
  /** Show on chart. The chart shows the trigger's symbol and centres on its time. False (or a thrown error) is a refusal. */
  onJumpToTrigger?: (target: { instrumentId?: string; symbol: string; at: number }) => boolean | void;
  /** The local export path (window.lv.exportData by default). Absent outside the desktop package. */
  exportData?: (input: { text: string; suggestedName: string; format: 'csv' }) => Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }>;
  /** The log's read state. Defaults to this window's shared store. */
  readStore?: AlertLogReadStore;
}
/** The UTC alert time text (chart-time-text.ts gives the same bytes for the UTC zone). */
export const isoMinute = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const DONE: Record<DockAction, string> = { remove: 'Alert removed.', pause: 'Alert paused.', resume: 'Alert resumed. Crossings are tracked again from the next price.', clone: 'Alert cloned. The copy starts a new active lifecycle without the original\'s log.', restart: 'Alert restarted. It is checked again from the next price; its log is kept.' };
const plural = (count: number, one: string, many = one + 's') => `${count} ${count === 1 ? one : many}`;
const bridgeExport = (): AlertsDockProps['exportData'] => { try { const lv = (globalThis as { window?: { lv?: { exportData?: AlertsDockProps['exportData'] } } }).window?.lv; return lv?.exportData ? input => lv.exportData!(input) : undefined; } catch { return undefined; } };

export function AlertsDock(props: AlertsDockProps) {
  const [tab, setTab] = useState<'list' | 'log'>('list'), [confirming, setConfirming] = useState<string | null>(null), [message, setMessage] = useState('');
  const [view, setView] = useState<DockListView>({ ...DEFAULT_DOCK_LIST_VIEW }), [logQuery, setLogQuery] = useState(''), [logOrder, setLogOrder] = useState<'newest' | 'oldest'>('newest');
  const [bulk, setBulk] = useState<null | { kind: 'delete-all'; ids: string[] } | { kind: 'clear-log' }>(null);
  const [selected, setSelected] = useState<string[]>([]), [logSymbol, setLogSymbol] = useState('all'), [unreadOnly, setUnreadOnly] = useState(false), [exporting, setExporting] = useState(false);
  const readStore = props.readStore ?? sharedAlertLogReadStore(), [, setReadVersion] = useState(readStore.version());
  // The panel is the only writer of read marks, so it redraws itself after each one (no subscription: the panel stays effect-free).
  const markRead = (ids: readonly string[]) => { readStore.markRead(ids, entries); setReadVersion(readStore.version()); };
  const now = props.now(), formatTime = props.formatTime ?? chartTimeFormatter(props.timezone ?? 'UTC', { hours: props.timeHours });
  let shown: readonly LocalAlert[] = props.alerts, viewError = '';
  try { shown = dockVisibleAlerts(props.alerts, view); } catch (error) { viewError = error instanceof Error ? error.message : String(error); }
  const list = dockListRows(shown, { activeInstrumentId: props.activeInstrumentId, unwatched: props.unwatched, invalidDrawings: props.invalidDrawings, formatTime, now });
  const shownIds = new Set(list.map(row => row.id)), chosen = selected.filter(id => shownIds.has(id)), inactive = dockInactiveIds(props.alerts);
  const isUnread = readStore.isUnread;
  const logOptions = { formatTime, query: logQuery, order: logOrder, extra: props.listAlertLog, symbol: logSymbol, unreadOnly, isUnread };
  const log = dockLogRows(props.alerts, logOptions);
  const entries = dockLogEntries(props.alerts, props.listAlertLog), unreadTotal = readStore.unreadCount(entries), logSymbols = [...new Set(entries.map(entry => entry.symbol))].sort();
  const extraCount = props.listAlertLog?.length ?? 0, total = props.alerts.reduce((sum, alert) => sum + alert.history.length, 0) + extraCount;
  const filtered = view.query.trim() !== '' || view.status !== 'all' || view.symbol !== 'all' || view.type !== 'all';
  const exportData = props.exportData ?? bridgeExport();
  const publish = (next: LocalAlert[], done: string) => {
    if (props.onAlertsChange(next, props.alerts) === false) { setMessage('That change could not be saved. Nothing was changed.'); return false; }
    setMessage(done); return true;
  };
  const act = (id: string, action: DockAction) => {
    try {
      const next = dockApplyAction(props.alerts, id, action, now, props.newId ?? (() => crypto.randomUUID()));
      if (publish(next, DONE[action])) setConfirming(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const bulkAct = (ids: readonly string[], action: Exclude<DockBulkAction, 'delete'>, all = false) => {
    try {
      const result = dockBulkApply(props.alerts, ids, action, now);
      if (!result.changed.length) { setMessage(action === 'stop' ? 'None of these alerts is running. Nothing was changed.' : 'None of these alerts is stopped. Nothing was changed.'); return; }
      const skipped = result.unchanged.length ? ` ${plural(result.unchanged.length, 'alert')} ${result.unchanged.length === 1 ? 'was' : 'were'} ${action === 'stop' ? 'already paused or stopped' : 'already running'}.` : '';
      if (publish(result.next, (action === 'stop' ? `Paused ${plural(result.changed.length, 'alert')}.` : `Restarted ${plural(result.changed.length, all ? 'inactive alert' : 'alert')}. Each is checked again from the next price; logs are kept.`) + skipped)) setSelected([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const confirmBulk = () => {
    const pending = bulk; if (!pending) return;
    try {
      if (pending.kind === 'delete-all') { if (publish(dockRemoveAlerts(props.alerts, pending.ids), pending.ids.length === 1 ? 'Deleted 1 alert.' : `Deleted ${pending.ids.length} alerts.`)) { setBulk(null); setSelected([]); } return; }
      const local = props.alerts.some(alert => alert.history.length);
      if (local && !publish(dockClearLog(props.alerts), 'Alert log cleared. Alerts keep running.')) return;
      if (extraCount) {
        if (!props.onClearListAlertLog) setMessage((local ? 'Alert log cleared. ' : '') + 'List alert triggers are kept; remove them from the list alert.');
        else if (props.onClearListAlertLog() === false) setMessage((local ? 'Alert log cleared, but ' : '') + 'list alert triggers could not be cleared.');
        else setMessage('Alert log cleared. Alerts keep running.');
      }
      setBulk(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const setFilter = (patch: Partial<DockListView>) => { setView({ ...view, ...patch }); setBulk(null); setConfirming(null); setSelected([]); };
  const toggle = (id: string, on: boolean) => setSelected(on ? [...selected.filter(item => item !== id), id] : selected.filter(item => item !== id));
  const exportLog = async () => {
    if (!exportData) { setMessage('Exporting the log requires the desktop app.'); return; }
    if (exporting) return;
    const matching = dockLogRows(props.alerts, { ...logOptions, limit: Number.MAX_SAFE_INTEGER });
    const picked = dockLogExportAlerts(props.alerts, new Set(matching.map(row => row.id))), left = matching.filter(row => row.alertId === undefined).length;
    if (!picked.exported) { setMessage(left ? 'Only list alert triggers match, and those are not part of the CSV export.' : 'No log entries to export.'); return; }
    setExporting(true);
    try {
      const result = await exportData({ text: alertHistoryCsv(picked.alerts), suggestedName: 'OpenCandle-alert-log.csv', format: 'csv' });
      setMessage(result.ok ? `Saved ${plural(picked.exported, 'log entry', 'log entries')} as CSV.${left ? ` ${plural(left, 'list alert trigger')} ${left === 1 ? 'is' : 'are'} not included.` : ''}` : result.error.code === 'CANCELLED' ? 'Export cancelled.' : result.error.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setExporting(false); }
  };
  const jump = (row: { id: string; symbol: string; at: number; instrumentId?: string }) => {
    if (!props.onJumpToTrigger) { setMessage('Show on chart is unavailable here.'); return; }
    try {
      if (props.onJumpToTrigger({ instrumentId: row.instrumentId, symbol: row.symbol, at: row.at }) === false) return;
      markRead([row.id]);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const allShownSelected = list.length > 0 && chosen.length === list.length;
  return <section className="lv-alerts-dock" aria-label="Alerts panel">
    <div className="lv-alerts-dock-tabs" role="tablist" aria-label="Alerts panel tabs">
      <button type="button" role="tab" aria-selected={tab === 'list'} onClick={() => { setTab('list'); setBulk(null); }}>Alerts ({props.alerts.length})</button>
      <button type="button" role="tab" aria-selected={tab === 'log'} aria-label={unreadTotal ? `Log (${total}), ${unreadTotal} unread` : undefined} onClick={() => { setTab('log'); setBulk(null); }}>Log ({total}){unreadTotal > 0 && <span className="lv-alerts-dock-unread" aria-hidden="true"> {unreadTotal} new</span>}</button>
      <button type="button" className="lv-alerts-dock-create" aria-label="Create alert" title="Create alert" onClick={props.onCreate}>+</button>
    </div>
    {tab === 'list' && props.alerts.length > 0 && <div className="lv-alerts-dock-filters" role="group" aria-label="Alert list view">
      <input type="search" aria-label="Search alerts" placeholder="Search name, symbol or message" value={view.query} onChange={event => setFilter({ query: event.target.value })}/>
      <span role="status" aria-label="Shown alerts">{list.length} of {props.alerts.length}</span>
      <details className="lv-alerts-dock-more" open={filtered || undefined}><summary>Filters and sorting</summary><div className="lv-alerts-dock-filters">
      <select aria-label="Filter alerts by status" value={view.status} onChange={event => setFilter({ status: event.target.value as DockListView['status'] })}>{DOCK_STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Filter alerts by symbol" value={view.symbol} onChange={event => setFilter({ symbol: event.target.value })}><option value="all">All symbols</option>{dockAlertSymbols(props.alerts).map(symbol => <option key={symbol} value={symbol}>{symbol}</option>)}</select>
      <select aria-label="Filter alerts by type" value={view.type} onChange={event => setFilter({ type: event.target.value as DockListView['type'] })}>{DOCK_TYPE_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Sort alerts by" value={view.sort} onChange={event => setFilter({ sort: event.target.value as DockListView['sort'] })}>{DOCK_SORT_KEYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button type="button" aria-label={view.direction === 'asc' ? 'Sort descending' : 'Sort ascending'} disabled={view.sort === 'original'} onClick={() => setFilter({ direction: view.direction === 'asc' ? 'desc' : 'asc' })}>{view.direction === 'asc' ? '↑' : '↓'}</button>
      <button type="button" aria-label={filtered ? 'Delete all shown alerts' : 'Delete all alerts'} disabled={!list.length} onClick={() => { setConfirming(null); setBulk({ kind: 'delete-all', ids: list.map(row => row.id) }); }}>{filtered ? 'Delete shown' : 'Delete all'}</button>
      <button type="button" aria-label="Restart all inactive alerts" disabled={!inactive.length} title={inactive.length ? undefined : 'Every alert is running.'} onClick={() => { setConfirming(null); setBulk(null); bulkAct(inactive, 'restart', true); }}>Restart all inactive</button>
    </div></details></div>}
    {tab === 'list' && list.length > 0 && <div className="lv-alerts-dock-filters" role="group" aria-label="Selected alerts">
      <label><input type="checkbox" aria-label="Select all shown alerts" checked={allShownSelected} onChange={event => setSelected(event.target.checked ? list.map(row => row.id) : [])}/> {chosen.length ? `${chosen.length} selected` : 'Select'}</label>
      <button type="button" aria-label="Pause selected alerts" disabled={!chosen.length} onClick={() => bulkAct(chosen, 'stop')}>Pause</button>
      <button type="button" aria-label="Restart selected alerts" disabled={!chosen.length} onClick={() => bulkAct(chosen, 'restart')}>Restart</button>
      <button type="button" aria-label="Delete selected alerts" disabled={!chosen.length} onClick={() => { setConfirming(null); setBulk({ kind: 'delete-all', ids: chosen }); }}>Delete selected</button>
    </div>}
    {bulk && <div className="lv-alerts-dock-confirm" role="alertdialog" aria-label={bulk.kind === 'delete-all' ? 'Confirm delete alerts' : 'Confirm clear log'}>
      <p>{bulk.kind === 'delete-all' ? `Delete ${bulk.ids.length === 1 ? 'this alert' : `these ${bulk.ids.length} alerts`} and their log entries? This cannot be undone.` : `Clear all ${total} log entries? Alerts keep running and keep their settings.`}</p>
      <button type="button" onClick={confirmBulk}>{bulk.kind === 'delete-all' ? 'Delete' : 'Clear log'}</button><button type="button" onClick={() => setBulk(null)}>Cancel</button>
    </div>}
    {viewError && <p role="alert" className="help">{viewError}</p>}
    {tab === 'list' && (props.alerts.length === 0
      ? <div className="lv-alerts-dock-empty"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M24 8c-6 0-10 4.5-10 10.5V27l-4 6h28l-4-6v-8.5C34 12.5 30 8 24 8z"/><path d="M20 38a4 4 0 0 0 8 0"/></svg><p className="help">No alerts yet. Use + to create one, or right-click the chart.</p><button type="button" onClick={props.onCreate}>Create alert</button></div>
      : list.length === 0 ? <p className="help">No alerts match. Change the search or the filters.</p>
      : <ul className="lv-alerts-dock-list" aria-label="Saved alerts">{list.map(row => <li key={row.id} data-alert-id={row.id} data-on-chart={row.onChart ? 'true' : 'false'} aria-selected={chosen.includes(row.id)}>
        <input type="checkbox" aria-label={`Select ${row.name}`} checked={chosen.includes(row.id)} onChange={event => toggle(row.id, event.target.checked)}/> <strong>{row.name}</strong> <span>{row.symbol}</span>
        <div>{row.condition} · {row.type} · <span className="lv-alerts-dock-status" data-status={row.status}>{row.status}</span></div>
        <small aria-label={`Trigger count for ${row.name}`}>{row.triggers === 0 ? 'Not triggered' : `Triggered ${row.triggers === 1 ? 'once' : `${row.triggers} times`}`}{row.lastTriggered ? `, last ${row.lastTriggered}` : ''}</small>
        <small>{row.expiry}</small>
        {row.note && <small>{row.note}</small>}
        <div className="lv-alerts-dock-actions">
          <button type="button" aria-label={`Edit ${row.name}`} disabled={row.canRestart} title={row.canRestart ? 'Restart this alert first, or clone it.' : undefined} onClick={() => props.onEdit(row.id)}>Edit</button>
          {row.canPause && <button type="button" aria-label={`Pause ${row.name}`} onClick={() => act(row.id, 'pause')}>Pause</button>}
          {row.canResume && <button type="button" aria-label={`Resume ${row.name}`} onClick={() => act(row.id, 'resume')}>Resume</button>}
          {row.canRestart && <button type="button" aria-label={`Restart ${row.name}`} title={row.restartOpenEnded ? 'Its expiration has passed, so it restarts with no expiration.' : undefined} onClick={() => act(row.id, 'restart')}>{row.restartOpenEnded ? 'Restart open-ended' : 'Restart'}</button>}
          <button type="button" aria-label={`Clone ${row.name}`} disabled={!row.canClone} title={row.canClone ? undefined : 'An expired alert cannot be cloned. Create a new alert.'} onClick={() => act(row.id, 'clone')}>Clone</button>
          {confirming === row.id
            ? <><button type="button" aria-label={`Confirm remove ${row.name}`} onClick={() => act(row.id, 'remove')}>Remove alert</button><button type="button" aria-label={`Keep ${row.name}`} onClick={() => setConfirming(null)}>Keep</button></>
            : <button type="button" aria-label={`Remove ${row.name}`} onClick={() => setConfirming(row.id)}>Remove</button>}
        </div>
      </li>)}</ul>)}
    {tab === 'list' && props.listAlerts}
    {tab === 'log' && total > 0 && <div className="lv-alerts-dock-filters" role="group" aria-label="Alert log view">
      <input type="search" aria-label="Search alert log" placeholder="Search name, symbol or message" value={logQuery} onChange={event => setLogQuery(event.target.value)}/>
      <select aria-label="Filter alert log by symbol" value={logSymbol} onChange={event => setLogSymbol(event.target.value)}><option value="all">All symbols</option>{logSymbols.map(symbol => <option key={symbol} value={symbol}>{symbol}</option>)}</select>
      <select aria-label="Sort alert log" value={logOrder} onChange={event => setLogOrder(event.target.value as 'newest' | 'oldest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
      <label><input type="checkbox" aria-label="Show unread log entries only" checked={unreadOnly} onChange={event => setUnreadOnly(event.target.checked)}/> Unread only</label>
      <button type="button" aria-label="Mark all log entries read" disabled={!unreadTotal} onClick={() => { readStore.markAllRead(entries); setReadVersion(readStore.version()); setMessage('Every log entry is marked read.'); }}>Mark all read</button>
      <button type="button" aria-label="Export alert log as CSV" disabled={!exportData || exporting} title={exportData ? 'Saves the shown entries as a CSV file' : 'Exporting the log requires the desktop app.'} onClick={() => { void exportLog(); }}>Export CSV</button>
      <button type="button" aria-label="Clear alert log" onClick={() => { setConfirming(null); setBulk({ kind: 'clear-log' }); }}>Clear log</button>
    </div>}
    {tab === 'log' && (total === 0
      ? <p className="help">Nothing has triggered yet.</p>
      : log.length === 0 ? <p className="help">{unreadOnly ? 'No unread log entries match.' : 'No log entries match this search.'}</p>
      : <ul className="lv-alerts-dock-log" aria-label="Alert log">{log.map(row => <li key={row.id} data-log-id={row.id} data-unread={row.unread ? 'true' : 'false'}><strong>{row.alert}</strong> <span>{row.symbol}</span> <time>{row.time}</time>{row.unread && <span className="lv-alerts-dock-unread"> (unread)</span>}<div>{row.message || `Value ${row.value}`}</div>
        <div className="lv-alerts-dock-actions">
          {props.onJumpToTrigger && <button type="button" aria-label={`Show ${row.alert} at ${row.time} on the chart`} onClick={() => jump(row)}>Show on chart</button>}
          {row.unread && <button type="button" aria-label={`Mark ${row.alert} at ${row.time} read`} onClick={() => markRead([row.id])}>Mark read</button>}
        </div>
      </li>)}</ul>)}
    {message && <p role="status" className="help">{message}</p>}
  </section>;
}

/**
 * The Alerts rail button's unread counter (labelled
 * "{count} unread alert notification(s)"). Rendered beside the rail button; nothing when every entry is read.
 */
export function AlertsUnreadCounter(props: { alerts: readonly LocalAlert[]; listAlerts?: readonly ListAlert[]; readStore?: AlertLogReadStore }) {
  const store = props.readStore ?? sharedAlertLogReadStore(), [, setVersion] = useState(store.version());
  useEffect(() => store.subscribe(() => setVersion(store.version())), [store]);
  const count = store.unreadCount(dockLogEntries(props.alerts, listAlertLogEntries(props.listAlerts ?? [])));
  return count > 0 ? <span className="lv-rail-counter" role="status" aria-label={`${count} unread alert notification${count === 1 ? '' : 's'}`}>{count > 99 ? '99+' : count}</span> : null;
}
