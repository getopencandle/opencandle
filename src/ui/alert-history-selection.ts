import type { AlertListItem } from './alert-list-navigation';

/**
 * Transient History (alert log) selection, separate from manager selection.
 * LV retention policy: selection is keyed by recorded event ID plus its exact
 * identity tuple (alert, mode, run, time, sequence). Newly appended events are
 * not selected; selected events that remain retained with the same identity stay
 * selected; removed or replaced events drop out. Tab changes and closing the
 * manager clear it. Selection never changes saved history or the CSV export.
 */
export interface AlertHistorySelection { readonly ids: readonly string[]; readonly anchorId: string | null; readonly identities: ReadonlyMap<string, string>; }
export type AlertHistorySelectionIntent = { kind: 'all' | 'clear' } | { kind: 'toggle' | 'range'; id: string };
export const EMPTY_ALERT_HISTORY_SELECTION: AlertHistorySelection = Object.freeze({ ids: Object.freeze([]) as readonly string[], anchorId: null, identities: new Map<string, string>() });
const key = (item: AlertListItem) => JSON.stringify(item.identity);
function make(items: readonly AlertListItem[], selected: ReadonlySet<string>, anchorId: string | null): AlertHistorySelection {
  if (!selected.size) return anchorId === null ? EMPTY_ALERT_HISTORY_SELECTION : Object.freeze({ ids: Object.freeze([]) as readonly string[], anchorId, identities: new Map<string, string>() });
  const ids: string[] = [], identities = new Map<string, string>();
  for (const item of items) if (selected.has(item.id)) { ids.push(item.id); identities.set(item.id, key(item)); }
  return Object.freeze({ ids: Object.freeze(ids), anchorId, identities });
}
function index(items: readonly AlertListItem[]): Map<string, number> {
  const positions = new Map<string, number>();
  items.forEach((item, position) => { if (positions.has(item.id)) throw new Error('Recorded event identities are ambiguous. History selection is unavailable.'); positions.set(item.id, position); });
  return positions;
}
/** Drop selected events that are no longer retained with the same identity. Returns the same object when nothing changed. */
export function reconcileAlertHistorySelection(previous: AlertHistorySelection, items: readonly AlertListItem[]): AlertHistorySelection {
  if (!previous.ids.length && previous.anchorId === null) return previous;
  let positions: Map<string, number>;
  try { positions = index(items); } catch { return EMPTY_ALERT_HISTORY_SELECTION; }
  const kept = new Set<string>();
  for (const id of previous.ids) { const position = positions.get(id); if (position !== undefined && key(items[position]) === previous.identities.get(id)) kept.add(id); }
  const anchorId = previous.anchorId !== null && positions.has(previous.anchorId) ? previous.anchorId : null;
  const order = items.filter(item => kept.has(item.id)).map(item => item.id);
  if (anchorId === previous.anchorId && order.length === previous.ids.length && order.every((id, position) => id === previous.ids[position])) return previous;
  return make(items, kept, anchorId);
}
export function transitionAlertHistorySelection(previous: AlertHistorySelection, items: readonly AlertListItem[], intent: AlertHistorySelectionIntent): AlertHistorySelection {
  const positions = index(items), current = reconcileAlertHistorySelection(previous, items), selected = new Set(current.ids);
  const position = (id: string) => { const value = positions.get(id); if (value === undefined) throw new Error('This recorded event is no longer displayed.'); return value; };
  switch (intent.kind) {
    case 'all': return make(items, new Set(items.map(item => item.id)), current.anchorId);
    case 'clear': return EMPTY_ALERT_HISTORY_SELECTION;
    case 'toggle': position(intent.id); if (!selected.delete(intent.id)) selected.add(intent.id); return make(items, selected, intent.id);
    case 'range': {
      const end = position(intent.id), anchor = current.anchorId ?? intent.id, start = position(anchor);
      for (let at = Math.min(start, end); at <= Math.max(start, end); at++) selected.add(items[at].id);
      return make(items, selected, anchor);
    }
    default: throw new Error('Unsupported history selection action.');
  }
}
export function isAlertHistorySelected(selection: AlertHistorySelection, id: string): boolean { return selection.identities.has(id); }
