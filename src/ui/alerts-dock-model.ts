import { cloneLocalAlert, editLocalAlert, setLocalAlertPaused, type AlertCondition, type LocalAlert } from '../domain/alerts';
import { DEFAULT_ALERT_MANAGER_FILTER, alertSourceType, filterAlertManagerAlerts, sortAlertManagerAlerts, type AlertManagerSortKey, type AlertManagerSourceFilter } from '../domain/alert-manager-view';
import { listAlertMessage, type ListAlert } from '../domain/watchlist-alerts';
import { drawingConditionText } from '../domain/drawing-alert-rules';

/** Rows of the docked Alerts panel (list and log tabs). Pure; the panel only draws and forwards actions. */
export interface DockListRow { id: string; name: string; symbol: string; condition: string; status: string; paused: boolean; lastTriggered: string | null; /** Retained trigger records (the log) and the alert's type. */ triggers: number; type: string; onChart: boolean; note: string | null; canPause: boolean; canResume: boolean; canRestart: boolean; restartOpenEnded: boolean; canClone: boolean; expiry: string }
export interface DockLogRow { id: string; time: string; symbol: string; alert: string; message: string; value: number; /** Trigger time (Unix seconds), the alert it came from and its chart instrument (absent for list alerts). */ at: number; alertId?: string; instrumentId?: string; unread: boolean }
export type DockAction = 'pause' | 'resume' | 'remove' | 'clone' | 'restart';

const LABEL: Record<string, string> = { crossing: 'Crossing', 'crossing-up': 'Crossing up', 'crossing-down': 'Crossing down', greater: 'Greater than', less: 'Less than', inside: 'Inside channel', outside: 'Outside channel', entering: 'Entering channel', exiting: 'Exiting channel', 'moving-up': 'Moving up', 'moving-down': 'Moving down', position: 'Long/Short position' };
// An ended alert says why it stopped. LV saves 'stopped' only when an alert ends itself by triggering (Only once,
// or a Long/Short position closing) and 'expired' when its expiration passes. A user stop is 'paused', shown as Paused.
const STATUS: Record<LocalAlert['status'], string> = { active: 'Active', paused: 'Paused', stopped: 'Stopped: triggered', expired: 'Stopped: expired', 'waiting-for-data': 'Waiting for data' };
export const symbolOf = (instrumentId: string): string => instrumentId.slice(instrumentId.lastIndexOf(':') + 1);
export function conditionText(condition: AlertCondition): string {
  const label = LABEL[condition.kind] ?? condition.kind;
  if (condition.kind === 'level-crossing') return `Active level crossing, ${condition.levels?.levels.length ?? 0} level${condition.levels?.levels.length === 1 ? '' : 's'}`;
  if (condition.lower !== undefined && condition.upper !== undefined) return `${label} ${condition.lower} to ${condition.upper}`;
  if (condition.amount !== undefined) return `${label} ${condition.amount}${condition.percent ? '%' : ''} over ${condition.bars ?? 1} bar${(condition.bars ?? 1) === 1 ? '' : 's'}`;
  return condition.value !== undefined ? `${label} ${condition.value}` : label;
}
const expiryPassed = (alert: LocalAlert, now: number | undefined) => alert.status === 'expired' || now !== undefined && alert.definition.expiresAt !== null && alert.definition.expiresAt <= now;
export function dockListRows(alerts: readonly LocalAlert[], options: { activeInstrumentId: string; unwatched: ReadonlyMap<string, string>; invalidDrawings?: ReadonlyMap<string, string>; formatTime: (seconds: number) => string; now?: number }): DockListRow[] {
  return alerts.map(alert => {
    const d = alert.definition, ended = alert.status === 'expired' || alert.status === 'stopped';
    // A drawing alert names its drawing ("Crossing up Trend line", "Entering Parallel channel").
    const drawing = d.condition.kind === 'position' || d.condition.kind === 'level-crossing' ? null : drawingConditionText(d.observationBinding?.source, d.condition);
    return { id: d.id, name: d.name, symbol: symbolOf(d.instrumentId), condition: drawing ?? conditionText(d.condition), status: options.invalidDrawings?.has(d.id) ? 'Invalid' : STATUS[alert.status], paused: alert.status === 'paused', lastTriggered: alert.lastTriggeredAt === null || alert.lastTriggeredAt === undefined ? null : options.formatTime(alert.lastTriggeredAt),
      triggers: alert.history.length, type: DOCK_TYPE_LABEL[dockAlertType(alert)],
      onChart: d.instrumentId === options.activeInstrumentId, note: options.invalidDrawings?.get(d.id) ?? options.unwatched.get(d.id) ?? null, canPause: !ended && alert.status !== 'paused', canResume: alert.status === 'paused',
      // Restart is offered for a stopped or expired alert. One whose expiration has passed restarts open-ended, and the
      // button says so (the alert dialog refuses to edit an ended alert, so there is no other way to give it a later expiration).
      canRestart: ended, restartOpenEnded: ended && expiryPassed(alert, options.now), canClone: !expiryPassed(alert, options.now), expiry: d.expiresAt === null ? 'Open-ended' : 'Expires ' + options.formatTime(d.expiresAt) };
  });
}

/**
 * View state, not saved: the docked list's search, status group and sort. Search and sort reuse the
 * alert manager's own helpers, so the panel and the dialog match the same way.
 * Status groups: Active holds active and waiting-for-data alerts, Stopped holds stopped and expired ones, and Triggered holds every
 * alert that has triggered at least once, whatever its state now.
 */
export type DockStatusFilter = 'all' | 'active' | 'paused' | 'triggered' | 'stopped';
export const DOCK_STATUS_FILTERS: ReadonlyArray<readonly [DockStatusFilter, string]> = [['all', 'All'], ['active', 'Active'], ['paused', 'Paused'], ['triggered', 'Triggered'], ['stopped', 'Stopped']];
/** Status, Type and Trigger count sort in the panel itself; the other keys reuse the manager's sort. */
export type DockSortKey = Extract<AlertManagerSortKey, 'original' | 'name' | 'ticker' | 'created' | 'triggered'> | 'status' | 'type' | 'count' | 'expires';
export const DOCK_SORT_KEYS: ReadonlyArray<readonly [DockSortKey, string]> = [['original', 'Saved order'], ['name', 'Name'], ['ticker', 'Symbol'], ['status', 'Status'], ['type', 'Type'], ['created', 'Date created'], ['triggered', 'Last triggered'], ['expires', 'Expiration'], ['count', 'Trigger count']];
/**
 * An alert's type is the kind of source it watches, the manager's saved source type:
 * price, indicator, drawing, or a comparison of two sources. 'legacy' holds price alerts saved before sources were recorded.
 */
export type DockTypeFilter = AlertManagerSourceFilter;
export const DOCK_TYPE_LABEL: Readonly<Record<Exclude<DockTypeFilter, 'all'>, string>> = Object.freeze({ price: 'Price', indicator: 'Indicator', drawing: 'Drawing', comparison: 'Comparison', legacy: 'Price (older)' });
export const DOCK_TYPE_FILTERS: ReadonlyArray<readonly [DockTypeFilter, string]> = [['all', 'All types'], ...(Object.entries(DOCK_TYPE_LABEL) as Array<[DockTypeFilter, string]>)];
export interface DockListView { query: string; status: DockStatusFilter; sort: DockSortKey; direction: 'asc' | 'desc'; /** A symbol from symbolOf, or 'all'. */ symbol: string; type: DockTypeFilter }
export const DEFAULT_DOCK_LIST_VIEW: Readonly<DockListView> = Object.freeze({ query: '', status: 'all', sort: 'original', direction: 'asc', symbol: 'all', type: 'all' });
export function dockAlertType(alert: LocalAlert): Exclude<DockTypeFilter, 'all'> {
  return alertSourceType(alert.definition.observationBinding?.source);
}
/** The symbols of the saved alerts, sorted, each once (the Symbol filter's choices). */
export function dockAlertSymbols(alerts: readonly LocalAlert[]): string[] { return [...new Set(alerts.map(alert => symbolOf(alert.definition.instrumentId)))].sort(); }
export function dockStatusMatches(alert: LocalAlert, status: DockStatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'active') return alert.status === 'active' || alert.status === 'waiting-for-data';
  if (status === 'paused') return alert.status === 'paused';
  if (status === 'stopped') return alert.status === 'stopped' || alert.status === 'expired';
  return alert.history.length > 0 || alert.lastTriggeredAt !== null && alert.lastTriggeredAt !== undefined;
}
/** The alerts the docked list shows, in display order. The saved collection is never changed or reordered. */
export function dockVisibleAlerts(alerts: readonly LocalAlert[], view: Readonly<DockListView>): readonly LocalAlert[] {
  const searched = filterAlertManagerAlerts(alerts, { ...DEFAULT_ALERT_MANAGER_FILTER, query: view.query, sourceType: view.type ?? 'all' });
  const symbol = view.symbol ?? 'all';
  const grouped = view.status === 'all' && symbol === 'all' ? searched : searched.filter(alert => (view.status === 'all' || dockStatusMatches(alert, view.status)) && (symbol === 'all' || symbolOf(alert.definition.instrumentId) === symbol));
  if (view.sort === 'expires') {
    // Expiration sort (our own placement): soonest first ascending; open-ended alerts always after dated ones; ties keep saved order.
    const sign = view.direction === 'asc' ? 1 : -1;
    return grouped.map((alert, index) => ({ alert, index, at: alert.definition.expiresAt })).sort((a, b) => (a.at === null ? (b.at === null ? 0 : 1) : b.at === null ? -1 : (a.at - b.at) * sign) || a.index - b.index).map(row => row.alert);
  }
  if (view.sort === 'status' || view.sort === 'type' || view.sort === 'count') {
    // Stable: ties keep the saved order in either direction, as the manager's sort does.
    const value = (alert: LocalAlert): number | string => view.sort === 'status' ? STATUS_RANK[alert.status] : view.sort === 'type' ? DOCK_TYPE_LABEL[dockAlertType(alert)] : alert.history.length;
    const sign = view.direction === 'asc' ? 1 : -1;
    return grouped.map((alert, index) => ({ alert, index, key: value(alert) })).sort((a, b) => (a.key < b.key ? -sign : a.key > b.key ? sign : 0) || a.index - b.index).map(row => row.alert);
  }
  return sortAlertManagerAlerts(grouped, { key: view.sort, direction: view.direction });
}
/** Status sort order: running first, then stopped by the user, then ended. */
const STATUS_RANK: Readonly<Record<LocalAlert['status'], number>> = Object.freeze({ active: 0, 'waiting-for-data': 1, paused: 2, stopped: 3, expired: 4 });

/**
 * Multi-select in the Alerts manager: one action over the selected alerts.
 * - stop: active and waiting alerts are paused (LV's manual stop); the rest are unchanged.
 * - restart: paused alerts resume; stopped and expired alerts restart as the row's Restart does (a passed expiration becomes
 *   open-ended); running alerts are unchanged.
 * - delete: removes the selected alerts and their logs.
 * Every other alert keeps its object. Refuses when a selected alert is no longer saved.
 */
export type DockBulkAction = 'stop' | 'restart' | 'delete';
export interface DockBulkResult { next: LocalAlert[]; changed: string[]; unchanged: string[] }
export function dockBulkApply(alerts: readonly LocalAlert[], ids: readonly string[], action: DockBulkAction, now: number): DockBulkResult {
  if (!ids.length) throw new Error('Select one or more alerts first.');
  const wanted = new Set(ids), saved = new Set(alerts.map(alert => alert.definition.id));
  if ([...wanted].some(id => !saved.has(id))) throw new Error('The alert list changed. Review it and try again.');
  const changed: string[] = [], unchanged: string[] = [];
  if (action === 'delete') return { next: alerts.filter(alert => !wanted.has(alert.definition.id)), changed: alerts.filter(alert => wanted.has(alert.definition.id)).map(alert => alert.definition.id), unchanged };
  let next = [...alerts];
  for (const alert of alerts) {
    const id = alert.definition.id;
    if (!wanted.has(id)) continue;
    const eligible = action === 'stop' ? alert.status === 'active' || alert.status === 'waiting-for-data' : alert.status === 'paused' || alert.status === 'stopped' || alert.status === 'expired';
    if (!eligible) { unchanged.push(id); continue; }
    next = dockApplyAction(next, id, action === 'stop' ? 'pause' : alert.status === 'paused' ? 'resume' : 'restart', now);
    changed.push(id);
  }
  return { next, changed, unchanged };
}
/** Restart all inactive: the ids of every paused, stopped or expired alert, in saved order. */
export function dockInactiveIds(alerts: readonly LocalAlert[]): string[] { return alerts.filter(alert => alert.status === 'paused' || alert.status === 'stopped' || alert.status === 'expired').map(alert => alert.definition.id); }

/** One log entry before formatting. List alerts (watchlist alerts) supply theirs through `extra`. */
export interface DockLogEntry { id: string; at: number; sequence: number; symbol: string; alert: string; message: string; value: number; /** Absent for list alert triggers. */ alertId?: string; instrumentId?: string }
/** Symbol is 'all' or one symbol; isUnread reports the read state (absent: every entry is read); unreadOnly keeps the unread ones. */
export interface DockLogOptions { formatTime: (seconds: number) => string; limit?: number; query?: string; order?: 'newest' | 'oldest'; extra?: readonly DockLogEntry[]; symbol?: string; unreadOnly?: boolean; isUnread?: (entry: Pick<DockLogEntry, 'id' | 'at'>) => boolean }
export function dockLogEntries(alerts: readonly LocalAlert[], extra: readonly DockLogEntry[] = []): DockLogEntry[] {
  const rows: DockLogEntry[] = [];
  for (const alert of alerts) for (const item of alert.history) rows.push({ id: item.id, at: item.at, sequence: item.sequence, symbol: symbolOf(alert.definition.instrumentId), alert: alert.definition.name, message: item.message, value: item.value, alertId: alert.definition.id, instrumentId: alert.definition.instrumentId });
  rows.push(...extra);
  return rows;
}
/** Newest first by default. The query is a literal, case-insensitive match on alert name, symbol, message and value. */
export function dockLogRows(alerts: readonly LocalAlert[], options: DockLogOptions): DockLogRow[] {
  const query = (options.query ?? '').trim().toLowerCase(), direction = options.order === 'oldest' ? -1 : 1, symbol = options.symbol ?? 'all', unread = options.isUnread ?? (() => false);
  const rows = dockLogEntries(alerts, options.extra).filter(row => (!query || [row.alert, row.symbol, row.message, String(row.value)].some(field => field.toLowerCase().includes(query))) && (symbol === 'all' || row.symbol === symbol) && (!options.unreadOnly || unread(row)));
  rows.sort((a, b) => direction * (b.at - a.at || b.sequence - a.sequence));
  return rows.slice(0, options.limit ?? 500).map(({ sequence, ...row }) => ({ ...row, time: options.formatTime(row.at), unread: unread(row) }));
}
/**
 * The shown log entries as the manager's history export input (alertHistoryCsv: same columns, formula-safe cells, newest
 * first). Only local alert triggers have that record; list alert triggers are left out, and the panel says so.
 */
export function dockLogExportAlerts(alerts: readonly LocalAlert[], shownIds: ReadonlySet<string>): { alerts: LocalAlert[]; exported: number } {
  let exported = 0;
  const kept = alerts.map(alert => { const history = alert.history.filter(item => shownIds.has(item.id)); exported += history.length; return history.length === alert.history.length ? alert : { ...alert, history }; }).filter(alert => alert.history.length);
  return { alerts: kept, exported };
}
/** Clear log: every alert keeps its definition and state but drops its retained trigger records. Unchanged alerts keep their object. */
export function dockClearLog(alerts: readonly LocalAlert[]): LocalAlert[] {
  if (!alerts.some(alert => alert.history.length)) throw new Error('The alert log is already empty.');
  return alerts.map(alert => alert.history.length ? { ...alert, history: [] } : alert);
}
/** Delete all (shown): removes exactly these alerts and their logs. Refuses when one of them is no longer saved. */
export function dockRemoveAlerts(alerts: readonly LocalAlert[], ids: readonly string[]): LocalAlert[] {
  if (!ids.length) throw new Error('No alerts are shown to delete.');
  const wanted = new Set(ids), saved = new Set(alerts.map(alert => alert.definition.id));
  if ([...wanted].some(id => !saved.has(id))) throw new Error('The alert list changed. Review it and try again.');
  return alerts.filter(alert => !wanted.has(alert.definition.id));
}
/** One alert changes; every other alert keeps its object. A clone is placed right after its original. */
export function dockApplyAction(alerts: readonly LocalAlert[], id: string, action: DockAction, now: number, newId?: () => string): LocalAlert[] {
  const index = alerts.findIndex(alert => alert.definition.id === id);
  if (index < 0) throw new Error('That alert is no longer in the list.');
  if (action === 'remove') return alerts.filter(alert => alert.definition.id !== id);
  const alert = alerts[index];
  if (action === 'clone') {
    if (!newId) throw new Error('Clone is unavailable here.');
    const copy = cloneLocalAlert(alert, newId(), now);
    return [...alerts.slice(0, index + 1), copy, ...alerts.slice(index + 1)];
  }
  if (action === 'restart') {
    if (alert.status !== 'stopped' && alert.status !== 'expired') throw new Error('Only a stopped or expired alert can be restarted.');
    // Same edit path as Apply in the alert dialog: new revision, retained history, fresh baseline. A passed expiration becomes
    // open-ended (the row button reads "Restart open-ended" in that case so the change is never silent).
    const passed = alert.status === 'expired' || alert.definition.expiresAt !== null && alert.definition.expiresAt <= now;
    const restarted = editLocalAlert(alert, passed ? { expiresAt: null } : {}, Math.max(now, alert.definition.createdAt));
    return alerts.map((row, at) => at === index ? restarted : row);
  }
  return alerts.map(row => row.definition.id === id ? setLocalAlertPaused(row, action === 'pause') : row);
}
/**
 * List (watchlist) alert triggers as log entries. The saved trigger keeps the member, close and bar time, so the message is
 * the template with {{ticker}}, {{exchange}}, {{close}} and {{time}} filled and every other placeholder kept as typed.
 */
export function listAlertLogEntries(alerts: readonly ListAlert[]): DockLogEntry[] {
  return alerts.flatMap(alert => alert.history.map(trigger => {
    const at = trigger.memberKey.indexOf(':'), exchange = trigger.memberKey.slice(0, at), symbol = trigger.memberKey.slice(at + 1);
    return { id: 'list:' + alert.id + ':' + trigger.memberKey + ':' + trigger.sequence + ':' + trigger.time, at: trigger.time, sequence: trigger.sequence, symbol, alert: alert.name + ' (list)', value: trigger.value,
      message: listAlertMessage(alert.message, { symbol, exchange }, '', { time: trigger.time, open: Number.NaN, high: Number.NaN, low: Number.NaN, close: trigger.value }) };
  }));
}
