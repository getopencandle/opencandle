import { expect, it } from 'vitest';
import { reconcileAlertListView, type AlertListView } from '../../src/ui/alert-list-navigation';
import {
  isAlertSelected, reconcileAlertSelection, transitionAlertSelection,
  type AlertSelectionIntent, type AlertSelectionState,
} from '../../src/ui/alert-selection-state';

// Independent scalar metadata oracles; no current-UI, DOM or publication authority.
const order = ['u8', 'q1', 'm4', 'a9', 'p2', 'w7'];
function list(ids: readonly string[] = order, key = {}): AlertListView {
  return reconcileAlertListView(null, key, ids.map((id, sourceIndex) => ({ id, sourceIndex, identity: [id, 7] })));
}
function fresh(view: AlertListView): AlertSelectionState { return reconcileAlertSelection(null, view); }
function step(view: AlertListView, state: AlertSelectionState, intent: AlertSelectionIntent): AlertSelectionState {
  return transitionAlertSelection(state, view, intent).state;
}
function picked(view: AlertListView, ...ids: string[]): AlertSelectionState {
  return ids.reduce((state, id) => step(view, state, { kind: 'toggle', id }), fresh(view));
}

it('orders noncontiguous choices by the displayed sequence rather than click or lexical order', () => {
  const view = list(), state = picked(view, 'w7', 'm4', 'u8');
  expect(state.selectedIds).toEqual(['u8', 'm4', 'w7']);
  expect(state.anchorId).toBe('u8');
});

it('uses the displayed reversed order for a literal pointer interval', () => {
  const view = list(['w7', 'p2', 'a9', 'm4', 'q1', 'u8']);
  const start = step(view, fresh(view), { kind: 'focus-anchor', id: 'p2' });
  const state = step(view, start, { kind: 'range', id: 'q1' });
  expect(state.selectedIds).toEqual(['p2', 'a9', 'm4', 'q1']);
  expect(state.anchorId).toBe('p2');
});

it('keeps a toggled-off row as the next range anchor without selecting it immediately', () => {
  const view = list(), selected = picked(view, 'a9', 'w7');
  const off = step(view, selected, { kind: 'toggle', id: 'a9' });
  expect(off.selectedIds).toEqual(['w7']); expect(off.anchorId).toBe('a9');
  expect(step(view, off, { kind: 'range', id: 'q1' }).selectedIds).toEqual(['q1', 'm4', 'a9', 'w7']);
  expect(selected.selectedIds).toEqual(['a9', 'w7']);
});

it('adds a backwards pointer range while preserving a separately selected outside row', () => {
  const view = list(), outside = picked(view, 'u8');
  const anchored = step(view, outside, { kind: 'focus-anchor', id: 'p2' });
  expect(step(view, anchored, { kind: 'range', id: 'm4' }).selectedIds).toEqual(['u8', 'm4', 'a9', 'p2']);
});

it('uses the supplied current-focus fallback only for an absent pointer anchor', () => {
  const view = list();
  const state = step(view, fresh(view), { kind: 'range', id: 'p2', fallbackAnchorId: 'm4' });
  expect(state.selectedIds).toEqual(['m4', 'a9', 'p2']); expect(state.anchorId).toBe('m4');
});

it('uses a clicked singleton when both pointer anchor and fallback are absent', () => {
  const view = list(), result = transitionAlertSelection(fresh(view), view, { kind: 'range', id: 'q1' });
  expect(result.state.selectedIds).toEqual(['q1']); expect(result.state.anchorId).toBe('q1');
  expect(result.focusId).toBeNull();
});

it('refuses a missing fallback without changing the reusable original state', () => {
  const view = list(), state = fresh(view);
  expect(() => step(view, state, { kind: 'range', id: 'm4', fallbackAnchorId: 'hidden' })).toThrow(/no longer displayed/);
  expect(state.selectedIds).toEqual([]); expect(state.anchorId).toBeNull();
  expect(step(view, state, { kind: 'range', id: 'm4' }).selectedIds).toEqual(['m4']);
});

it('ignores an unavailable fallback when a genuine visible pointer anchor already exists', () => {
  const view = list(), state = picked(view, 'a9');
  expect(step(view, state, { kind: 'range', id: 'p2', fallbackAnchorId: 'hidden' }).selectedIds).toEqual(['a9', 'p2']);
});

it('starts keyboard range at supplied origin rather than the previous pointer anchor', () => {
  const view = list(), state = picked(view, 'w7');
  const result = transitionAlertSelection(state, view, { kind: 'extend', originId: 'm4', direction: -1 });
  expect(result.state.selectedIds).toEqual(['q1', 'm4', 'w7']);
  expect(result.state.anchorId).toBe('m4'); expect(result.focusId).toBe('q1');
});

it('reverses keyboard extension without removing any of the two original outside selections', () => {
  const view = list(), base = picked(view, 'u8', 'w7');
  const one = step(view, base, { kind: 'extend', originId: 'm4', direction: 1 });
  const two = step(view, one, { kind: 'extend', originId: 'a9', direction: 1 });
  expect(two.selectedIds).toEqual(['u8', 'm4', 'a9', 'p2', 'w7']);
  const back = step(view, two, { kind: 'extend', originId: 'p2', direction: -1 });
  expect(back.selectedIds).toEqual(['u8', 'm4', 'a9', 'w7']);
  const anchor = step(view, back, { kind: 'extend', originId: 'a9', direction: -1 });
  expect(anchor.selectedIds).toEqual(['u8', 'm4', 'w7']);
  expect(step(view, anchor, { kind: 'extend', originId: 'm4', direction: -1 }).selectedIds).toEqual(['u8', 'q1', 'm4', 'w7']);
  expect(base.selectedIds).toEqual(['u8', 'w7']);
});

it('retains a preselected row inside the shrinking range as part of its original base', () => {
  const view = list(), base = picked(view, 'p2');
  const one = step(view, base, { kind: 'extend', originId: 'm4', direction: 1 });
  const two = step(view, one, { kind: 'extend', originId: 'a9', direction: 1 });
  const back = step(view, two, { kind: 'extend', originId: 'p2', direction: -1 });
  expect(back.selectedIds).toEqual(['m4', 'a9', 'p2']);
});

it('uses the entire current selection as a fresh base when keyboard origin is not prior head', () => {
  const view = list();
  const first = step(view, fresh(view), { kind: 'extend', originId: 'q1', direction: 1 });
  const changed = step(view, first, { kind: 'extend', originId: 'p2', direction: 1 });
  expect(changed.selectedIds).toEqual(['q1', 'm4', 'p2', 'w7']); expect(changed.anchorId).toBe('p2');
  const reverse = step(view, changed, { kind: 'extend', originId: 'w7', direction: -1 });
  expect(reverse.selectedIds).toEqual(['q1', 'm4', 'p2']);
});

it('ordinary focus-anchor resets range continuation but keeps all current choices', () => {
  const view = list();
  const extended = step(view, fresh(view), { kind: 'extend', originId: 'm4', direction: 1 });
  const focused = step(view, extended, { kind: 'focus-anchor', id: 'a9' });
  expect(focused.selectedIds).toEqual(['m4', 'a9']); expect(focused.anchorId).toBe('a9');
  expect(step(view, focused, { kind: 'extend', originId: 'a9', direction: -1 }).selectedIds).toEqual(['m4', 'a9']);
});

it('a toggle between keyboard steps ends the previous reversible range', () => {
  const view = list(), first = step(view, fresh(view), { kind: 'extend', originId: 'm4', direction: 1 });
  const toggled = step(view, first, { kind: 'toggle', id: 'w7' });
  expect(step(view, toggled, { kind: 'extend', originId: 'a9', direction: -1 }).selectedIds).toEqual(['m4', 'a9', 'w7']);
});

it('a pointer range between keyboard steps ends the previous reversible range', () => {
  const view = list(), first = step(view, fresh(view), { kind: 'extend', originId: 'm4', direction: 1 });
  const pointer = step(view, first, { kind: 'range', id: 'p2' });
  expect(step(view, pointer, { kind: 'extend', originId: 'a9', direction: -1 }).selectedIds).toEqual(['m4', 'a9', 'p2']);
});

it('select-all ends keyboard continuation and never proposes focus', () => {
  const view = list(), first = step(view, fresh(view), { kind: 'extend', originId: 'm4', direction: 1 });
  const all = transitionAlertSelection(first, view, { kind: 'all' });
  expect(all.state.selectedIds).toEqual(['u8', 'q1', 'm4', 'a9', 'p2', 'w7']);
  expect(all.state.anchorId).toBeNull(); expect(all.focusId).toBeNull();
  expect(step(view, all.state, { kind: 'extend', originId: 'a9', direction: -1 }).selectedIds).toEqual(order);
});

it('clear ends keyboard continuation and does not retain its old base', () => {
  const view = list(), first = step(view, picked(view, 'w7'), { kind: 'extend', originId: 'm4', direction: 1 });
  const clear = transitionAlertSelection(first, view, { kind: 'clear' });
  expect(clear.state.selectedIds).toEqual([]); expect(clear.state.anchorId).toBeNull(); expect(clear.focusId).toBeNull();
  expect(step(view, clear.state, { kind: 'extend', originId: 'a9', direction: -1 }).selectedIds).toEqual(['m4', 'a9']);
});

it.each([
  ['u8', -1], ['w7', 1],
] as const)('clamps the %s endpoint without creating an out-of-view ID', (originId, direction) => {
  const view = list(), result = transitionAlertSelection(fresh(view), view, { kind: 'extend', originId, direction });
  expect(result.state.selectedIds).toEqual([originId]); expect(result.focusId).toBe(originId);
  expect(result.state.anchorId).toBe(originId);
});

it.each([-1, 1] as const)('keeps a singleton keyboard view stable in direction %s', direction => {
  const view = list(['solo']), result = transitionAlertSelection(fresh(view), view, { kind: 'extend', originId: 'solo', direction });
  expect(result.state.selectedIds).toEqual(['solo']); expect(result.focusId).toBe('solo');
});

it('admits empty clear/all metadata but refuses any invented empty-list focus target', () => {
  const view = list([]), initial = fresh(view);
  expect(initial.enabled).toBe(true);
  for (const kind of ['all', 'clear'] as const) {
    const result = transitionAlertSelection(initial, view, { kind });
    expect(result.state.selectedIds).toEqual([]); expect(result.focusId).toBeNull();
  }
  expect(() => step(view, initial, { kind: 'extend', originId: 'solo', direction: 1 })).toThrow(/no longer displayed/);
});

it('clears same-ID selection for a distinct view even when the key object is shared', () => {
  const key = {}, view = list(order, key), selected = picked(view, 'q1', 'p2'), replacement = list(order, key);
  const next = reconcileAlertSelection(selected, replacement);
  expect(next.selectedIds).toEqual([]); expect(next.anchorId).toBeNull();
  expect(isAlertSelected(selected, replacement, 'q1')).toBe(false);
  expect(() => step(replacement, selected, { kind: 'all' })).toThrow(/view changed/);
});

it('refuses old state and clears selection after a key replacement on the same view object', () => {
  const view = list(), selected = picked(view, 'm4'); view.key = {};
  expect(isAlertSelected(selected, view, 'm4')).toBe(false);
  expect(() => step(view, selected, { kind: 'clear' })).toThrow(/view changed/);
  const reset = reconcileAlertSelection(selected, view);
  expect(reset.selectedIds).toEqual([]); expect(reset.anchorId).toBeNull(); expect(reset.enabled).toBe(true);
});

it('refuses prior order even when IDs and owning view object remain identical', () => {
  const view = list(), selected = picked(view, 'q1');
  view.items = [...view.items].reverse(); view.byId = new Map(view.items.map((item, index) => [item.id, index]));
  expect(() => step(view, selected, { kind: 'all' })).toThrow(/view changed/);
  const reset = reconcileAlertSelection(selected, view);
  expect(reset.selectedIds).toEqual([]); expect(reset.anchorId).toBeNull();
  expect(step(view, reset, { kind: 'all' }).selectedIds).toEqual(['w7', 'p2', 'a9', 'm4', 'q1', 'u8']);
});

it('disables duplicate identities even if a caller incorrectly clears the ambiguity flag', () => {
  const view = list(['same', 'same']); view.ambiguous = false;
  const state = fresh(view);
  expect(state.enabled).toBe(false); expect(state.selectedIds).toEqual([]);
  expect(() => step(view, state, { kind: 'all' })).toThrow(/view changed/);
});

it('refuses a corrupted index without applying even a clear transition', () => {
  const view = list(), selected = picked(view, 'm4'); view.byId.set('m4', 5);
  expect(() => step(view, selected, { kind: 'clear' })).toThrow(/view changed/);
  const disabled = reconcileAlertSelection(selected, view);
  expect(disabled.enabled).toBe(false); expect(disabled.selectedIds).toEqual([]);
  expect(selected.selectedIds).toEqual(['m4']);
});

it('clears and disables an explicitly ambiguous current view', () => {
  const view = list(), selected = picked(view, 'w7'); view.ambiguous = true;
  expect(isAlertSelected(selected, view, 'w7')).toBe(false);
  const reset = reconcileAlertSelection(selected, view);
  expect(reset.enabled).toBe(false); expect(reset.anchorId).toBeNull(); expect(reset.selectedIds).toEqual([]);
});

it('preserves exact state identity for an unchanged admitted view', () => {
  const view = list(), selected = picked(view, 'a9');
  expect(reconcileAlertSelection(selected, view)).toBe(selected);
  expect(reconcileAlertSelection(reconcileAlertSelection(selected, view), view)).toBe(selected);
});

it('does not accept copied public metadata as genuine selection provenance', () => {
  const view = list(), selected = picked(view, 'p2'), copied = { ...selected };
  expect(isAlertSelected(copied, view, 'p2')).toBe(false);
  expect(() => step(view, copied, { kind: 'toggle', id: 'q1' })).toThrow(/view changed/);
  expect(reconcileAlertSelection(copied, view).selectedIds).toEqual([]);
});

it('membership uses no item, index-map, node-map or source graph traversal', () => {
  const view = list(), selected = picked(view, 'q1', 'p2');
  for (const field of ['items', 'byId', 'nodes'] as const) {
    Object.defineProperty(view, field, { configurable: true, get() { throw new Error(`unexpected ${field} traversal`); } });
  }
  expect(isAlertSelected(selected, view, 'q1')).toBe(true);
  expect(isAlertSelected(selected, view, 'm4')).toBe(false);
  expect(isAlertSelected(selected, view, 'hidden')).toBe(false);
});

it('transitions ignore identity/history and registered DOM nodes and do not mutate supplied metadata', () => {
  const view = list(), items = view.items, index = view.byId;
  for (const item of items) {
    Object.defineProperty(item, 'identity', { get() { throw new Error('source identity read'); } });
    Object.defineProperty(item, 'sourceIndex', { get() { throw new Error('source index read'); } });
    Object.freeze(item);
  }
  Object.freeze(items);
  const node = { focus() { throw new Error('DOM focus'); }, scrollIntoView() { throw new Error('DOM scroll'); } } as unknown as HTMLElement;
  const registration = {}, entry = { node, registration }; view.nodes.set('m4', entry);
  const nodes = view.nodes, originalIndices = [...index.entries()]; Object.freeze(view);
  const initial = fresh(view), result = transitionAlertSelection(initial, view, { kind: 'extend', originId: 'm4', direction: 1 });
  expect(result.focusId).toBe('a9'); expect(result.state.selectedIds).toEqual(['m4', 'a9']);
  expect(initial.selectedIds).toEqual([]); expect(view.items).toBe(items); expect(view.byId).toBe(index);
  expect([...index.entries()]).toEqual(originalIndices); expect(view.nodes).toBe(nodes); expect(nodes.size).toBe(1); expect(nodes.get('m4')).toBe(entry);
  expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.state)).toBe(true); expect(Object.isFrozen(result.state.selectedIds)).toBe(true);
  expect(Object.isFrozen(nodes)).toBe(false); expect(Object.isFrozen(entry)).toBe(false); expect(Object.isFrozen(registration)).toBe(false);
});
