import { expect, it } from 'vitest';
import { reconcileAlertListView, type AlertListView } from '../../src/ui/alert-list-navigation';
import { isAlertSelected, reconcileAlertSelection, transitionAlertSelection } from '../../src/ui/alert-selection-state';

function view(ids = ['a', 'b', 'c', 'd', 'e'], key = {}): AlertListView {
  return reconcileAlertListView(null, key, ids.map((id, sourceIndex) => ({ id, sourceIndex, identity: [id, 1] })));
}
it('toggles noncontiguous IDs in displayed order and anchors a toggled-off row', () => {
  const list = view(), initial = reconcileAlertSelection(null, list);
  const one = transitionAlertSelection(initial, list, { kind: 'toggle', id: 'd' }).state;
  const two = transitionAlertSelection(one, list, { kind: 'toggle', id: 'b' }).state;
  expect(two.selectedIds).toEqual(['b', 'd']); expect(two.anchorId).toBe('b');
  const removed = transitionAlertSelection(two, list, { kind: 'toggle', id: 'b' }).state;
  expect(removed.selectedIds).toEqual(['d']); expect(removed.anchorId).toBe('b');
  expect(initial.selectedIds).toEqual([]); expect(one.selectedIds).toEqual(['d']);
});
it('adds inclusive pointer ranges while retaining previously selected outside rows', () => {
  const list = view(); let state = reconcileAlertSelection(null, list);
  state = transitionAlertSelection(state, list, { kind: 'toggle', id: 'e' }).state;
  state = transitionAlertSelection(state, list, { kind: 'focus-anchor', id: 'b' }).state;
  expect(state.selectedIds).toEqual(['e']);
  state = transitionAlertSelection(state, list, { kind: 'range', id: 'd' }).state;
  expect(state.selectedIds).toEqual(['b', 'c', 'd', 'e']); expect(state.anchorId).toBe('b');
});
it('uses the supplied focused fallback or clicked singleton only when no anchor exists', () => {
  const list = view(), initial = reconcileAlertSelection(null, list);
  const range = transitionAlertSelection(initial, list, { kind: 'range', id: 'd', fallbackAnchorId: 'b' }).state;
  expect(range.selectedIds).toEqual(['b', 'c', 'd']); expect(range.anchorId).toBe('b');
  expect(transitionAlertSelection(initial, list, { kind: 'range', id: 'd' }).state.selectedIds).toEqual(['d']);
  expect(() => transitionAlertSelection(initial, list, { kind: 'range', id: 'd', fallbackAnchorId: 'gone' })).toThrow(/no longer displayed/);
  expect(transitionAlertSelection(range, list, { kind: 'range', id: 'a', fallbackAnchorId: 'gone' }).state.selectedIds).toEqual(['a', 'b', 'c', 'd']);
});
it('shrinks and reverses keyboard ranges against the original selection base', () => {
  const list = view(); let state = reconcileAlertSelection(null, list);
  state = transitionAlertSelection(state, list, { kind: 'toggle', id: 'e' }).state;
  let result = transitionAlertSelection(state, list, { kind: 'extend', originId: 'b', direction: 1 });
  expect(result.state.selectedIds).toEqual(['b', 'c', 'e']); expect(result.focusId).toBe('c');
  result = transitionAlertSelection(result.state, list, { kind: 'extend', originId: 'c', direction: -1 });
  expect(result.state.selectedIds).toEqual(['b', 'e']); expect(result.focusId).toBe('b');
  result = transitionAlertSelection(result.state, list, { kind: 'extend', originId: 'b', direction: -1 });
  expect(result.state.selectedIds).toEqual(['a', 'b', 'e']); expect(result.state.anchorId).toBe('b');
});
it('starts a fresh keyboard range when its focused origin differs from the prior head', () => {
  const list = view(), initial = reconcileAlertSelection(null, list);
  const first = transitionAlertSelection(initial, list, { kind: 'extend', originId: 'b', direction: 1 }).state;
  const next = transitionAlertSelection(first, list, { kind: 'extend', originId: 'e', direction: -1 });
  expect(next.state.selectedIds).toEqual(['b', 'c', 'd', 'e']); expect(next.state.anchorId).toBe('e'); expect(next.focusId).toBe('d');
  expect(transitionAlertSelection(next.state, list, { kind: 'extend', originId: 'd', direction: 1 }).state.selectedIds).toEqual(['b', 'c', 'e']);
});
it('ends the old keyboard range on an ordinary focus-anchor intent without clearing selected IDs', () => {
  const list = view(), initial = reconcileAlertSelection(null, list);
  const ranged = transitionAlertSelection(initial, list, { kind: 'extend', originId: 'b', direction: 1 }).state;
  const focused = transitionAlertSelection(ranged, list, { kind: 'focus-anchor', id: 'c' }).state;
  expect(focused.selectedIds).toEqual(['b', 'c']);
  expect(transitionAlertSelection(focused, list, { kind: 'extend', originId: 'c', direction: -1 }).state.selectedIds).toEqual(['b', 'c']);
});
it('clamps new keyboard ranges to a singleton at either endpoint', () => {
  for (const [originId, direction] of [['a', -1], ['e', 1]] as const) {
    const list = view(), result = transitionAlertSelection(reconcileAlertSelection(null, list), list, { kind: 'extend', originId, direction });
    expect(result.state.selectedIds).toEqual([originId]); expect(result.focusId).toBe(originId);
  }
  const single = view(['only']);
  expect(transitionAlertSelection(reconcileAlertSelection(null, single), single, { kind: 'extend', originId: 'only', direction: 1 }).state.selectedIds).toEqual(['only']);
});
it('selects all current displayed IDs and clears selection without creating focus work', () => {
  const list = view(['e', 'b', 'a']), all = transitionAlertSelection(reconcileAlertSelection(null, list), list, { kind: 'all' });
  expect(all.state.selectedIds).toEqual(['e', 'b', 'a']); expect(all.state.anchorId).toBeNull(); expect(all.focusId).toBeNull();
  const cleared = transitionAlertSelection(all.state, list, { kind: 'clear' });
  expect(cleared.state.selectedIds).toEqual([]); expect(cleared.state.anchorId).toBeNull(); expect(cleared.focusId).toBeNull();
  const empty = view([]);
  expect(transitionAlertSelection(reconcileAlertSelection(null, empty), empty, { kind: 'all' }).state.selectedIds).toEqual([]);
});
it('retires all selection for new view ownership, including equal visible IDs', () => {
  const list = view(), selected = transitionAlertSelection(reconcileAlertSelection(null, list), list, { kind: 'toggle', id: 'a' }).state;
  expect(reconcileAlertSelection(selected, list)).toBe(selected);
  const replacement = view(), reset = reconcileAlertSelection(selected, replacement);
  expect(reset.selectedIds).toEqual([]); expect(reset.anchorId).toBeNull();
  expect(isAlertSelected(selected, replacement, 'a')).toBe(false);
  expect(() => transitionAlertSelection(selected, replacement, { kind: 'all' })).toThrow(/view changed/);
});
it('disables ambiguous and malformed views without retaining selected IDs', () => {
  const list = view(), selected = transitionAlertSelection(reconcileAlertSelection(null, list), list, { kind: 'all' }).state;
  for (const bad of [view(['a', 'a']), { ...list, byId: new Map([['a', 3]]) }]) {
    const reset = reconcileAlertSelection(selected, bad);
    expect(reset.enabled).toBe(false); expect(reset.selectedIds).toEqual([]);
    expect(isAlertSelected(reset, bad, 'a')).toBe(false);
    expect(() => transitionAlertSelection(reset, bad, { kind: 'clear' })).toThrow(/view changed/);
  }
});
it('refuses missing targets, invalid directions and copied states before producing a transition', () => {
  const list = view(), initial = reconcileAlertSelection(null, list);
  expect(() => transitionAlertSelection(initial, list, { kind: 'toggle', id: 'missing' })).toThrow(/no longer displayed/);
  expect(() => transitionAlertSelection(initial, list, { kind: 'extend', originId: 'a', direction: 0 as 1 })).toThrow(/direction/);
  expect(() => transitionAlertSelection({ ...initial }, list, { kind: 'all' })).toThrow(/view changed/);
  expect(isAlertSelected({ ...initial }, list, 'a')).toBe(false); expect(initial.selectedIds).toEqual([]);
});
it('freezes only owned metadata and leaves list nodes and registrations untouched', () => {
  const list = view(), node = { node: {} as HTMLElement, registration: {} }; list.nodes.set('a', node);
  const result = transitionAlertSelection(reconcileAlertSelection(null, list), list, { kind: 'all' });
  expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.state)).toBe(true); expect(Object.isFrozen(result.state.selectedIds)).toBe(true);
  expect(Object.isFrozen(list)).toBe(false); expect(list.nodes.get('a')).toBe(node);
  expect(isAlertSelected(result.state, list, 'a')).toBe(true); expect(isAlertSelected(result.state, list, 'missing')).toBe(false);
});
