import type { AlertListView } from './alert-list-navigation';

export interface AlertSelectionState {
  readonly selectedIds: readonly string[];
  readonly anchorId: string | null;
  readonly enabled: boolean;
}
export type AlertSelectionIntent =
  | { kind: 'toggle' | 'focus-anchor'; id: string }
  | { kind: 'range'; id: string; fallbackAnchorId?: string }
  | { kind: 'extend'; originId: string; direction: -1 | 1 }
  | { kind: 'all' | 'clear' };
export interface AlertSelectionTransition {
  readonly state: AlertSelectionState;
  /** A suggestion for guarded keyboard focus, never a DOM operation. */
  readonly focusId: string | null;
}
interface SelectionMetadata {
  view: AlertListView;
  key: object;
  order: readonly string[];
  selected: Set<string>;
  range: { base: Set<string>; head: string } | null;
}
const states = new WeakMap<AlertSelectionState, SelectionMetadata>();
// Same saved-manager limit as validateLocalAlerts; this is not a History reducer.
const MAX_MANAGER_ROWS = 10_000;

function inspect(view: AlertListView): string[] | null {
  if (!view || view.ambiguous !== false || !Array.isArray(view.items) ||
    view.items.length > MAX_MANAGER_ROWS || !(view.byId instanceof Map) ||
    view.byId.size !== view.items.length) return null;
  const order: string[] = [], seen = new Set<string>();
  for (let index = 0; index < view.items.length; index++) {
    const item = view.items[index];
    if (!item || typeof item.id !== 'string' || !item.id.length || item.id.length > 500 ||
      seen.has(item.id) || view.byId.get(item.id) !== index) return null;
    seen.add(item.id); order.push(item.id);
  }
  return order;
}
function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function make(view: AlertListView, order: readonly string[], selected: ReadonlySet<string>,
  anchorId: string | null, range: SelectionMetadata['range'], enabled = true): AlertSelectionState {
  const selectedIds = Object.freeze(order.filter(id => selected.has(id)));
  const state = Object.freeze({ selectedIds, anchorId, enabled });
  states.set(state, { view, key: view.key, order: Object.freeze([...order]),
    selected: new Set(selectedIds), range: range && { base: new Set(range.base), head: range.head } });
  return state;
}

/** Transient manager metadata only. New/invalid views clear selection rather than
 * carrying hidden IDs into another owner. No view, node or saved alert is mutated.
 * Reconcile once per render; membership queries below do not scan the list. */
export function reconcileAlertSelection(previous: AlertSelectionState | null, view: AlertListView): AlertSelectionState {
  const order = inspect(view), old = previous && states.get(previous);
  if (old && old.view === view && old.key === view.key && previous!.enabled === (order !== null) &&
    sameOrder(old.order, order ?? [])) return previous!;
  return make(view, order ?? [], new Set(), null, null, order !== null);
}

/** Constant-time lookup under the current reconciled-view precondition. */
export function isAlertSelected(state: AlertSelectionState, view: AlertListView, id: string): boolean {
  const owner = states.get(state);
  return !!owner && owner.view === view && owner.key === view.key && state.enabled &&
    !view.ambiguous && owner.selected.has(id);
}

/** Pure transition, not a UI authority token. A caller must compare the exact
 * current state/view and registered event origin before dispatch and after focus.
 * Passing a retained state with its retained view cannot prove UI currentness. */
export function transitionAlertSelection(state: AlertSelectionState, view: AlertListView,
  intent: AlertSelectionIntent): AlertSelectionTransition {
  const owner = states.get(state), order = inspect(view);
  if (!owner || owner.view !== view || owner.key !== view.key || !state.enabled || !order ||
    !sameOrder(owner.order, order)) throw new Error('This alert selection view changed. Use the current list.');
  const position = (id: string): number => {
    const index = view.byId.get(id);
    if (index === undefined) throw new Error('The selection target is no longer displayed.');
    return index;
  };
  const includeRange = (base: ReadonlySet<string>, from: string, to: string): Set<string> => {
    const start = position(from), end = position(to), next = new Set(base);
    for (let index = Math.min(start, end); index <= Math.max(start, end); index++) next.add(order[index]);
    return next;
  };
  let selected: ReadonlySet<string> = owner.selected, anchor = state.anchorId;
  let range: SelectionMetadata['range'] = null, focusId: string | null = null;
  switch (intent.kind) {
    case 'toggle': {
      position(intent.id); const next = new Set(selected);
      if (!next.delete(intent.id)) next.add(intent.id);
      selected = next; anchor = intent.id; break;
    }
    case 'focus-anchor':
      position(intent.id); anchor = intent.id; break;
    case 'range':
      position(intent.id); anchor ??= intent.fallbackAnchorId ?? intent.id;
      selected = includeRange(selected, anchor, intent.id); break;
    case 'extend': {
      if (intent.direction !== -1 && intent.direction !== 1) throw new Error('Unsupported alert selection direction.');
      const origin = position(intent.originId), continuing = owner.range?.head === intent.originId;
      anchor = continuing ? state.anchorId : intent.originId;
      if (anchor === null) throw new Error('The selection range has no anchor.');
      const base = continuing ? owner.range!.base : owner.selected;
      focusId = order[Math.max(0, Math.min(order.length - 1, origin + intent.direction))];
      selected = includeRange(base, anchor, focusId); range = { base: new Set(base), head: focusId }; break;
    }
    case 'all': selected = new Set(order); anchor = null; break;
    case 'clear': selected = new Set(); anchor = null; break;
    default: throw new Error('Unsupported alert selection action.');
  }
  return Object.freeze({ state: make(view, order, selected, anchor, range), focusId });
}
