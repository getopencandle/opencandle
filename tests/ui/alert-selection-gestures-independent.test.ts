import { expect, it, vi } from 'vitest';
import { all, bindRef, dispatchDocument, focusDocument, input, invoke, ModelNode, saved, setup, text } from '../helpers/alert-dialog-harness';

// Actual component callbacks with the shared controlled node/focus model. These
// are independent gesture oracles, not native desktop or reference comparisons.
type UI = ReturnType<typeof setup>;
function five() { return setup(['a', 'b', 'c', 'd', 'e'].map(id => saved(id))); }
function row(ui: UI, id: string) { const control = ui.row(id); return { control, node: ui.nodeFor(control) }; }
function focus(ui: UI, id: string) { const target = row(ui, id).node; target.focus(); ui.settle(); return target; }
function key(ui: UI, id: string, keyValue: string, extra: Record<string, unknown> = {}) {
  const { control, node } = row(ui, id), event = input(node, { key: keyValue, ...extra });
  dispatchDocument('keydown', { ...event, currentTarget: focusDocument });
  const ancestors: ModelNode[] = []; for (let parent = node.parent; parent; parent = parent.parent) ancestors.unshift(parent);
  for (const parent of ancestors) invoke(parent.props.onKeyDownCapture, { ...event, currentTarget: parent });
  invoke(control.props.onKeyDown, event); ui.settle(); return event;
}
type Modifiers = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean };
function pointerDown(ui: UI, id: string, modifiers: Modifiers, extra: Record<string, unknown> = {}) {
  const target = row(ui, id), event = input(target.node, { pointerId: 73, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, ...modifiers, ...extra });
  dispatchDocument('pointerdown', { ...event, currentTarget: focusDocument }); invoke(target.node.props.onPointerDown, event);
  return { ...target, modifiers, event };
}
function pointerUp(target: ReturnType<typeof pointerDown>, extra: Record<string, unknown> = {}) {
  const event = input(target.node, { pointerId: 73, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 0, ...target.modifiers, ...extra });
  dispatchDocument('pointerup', { ...event, currentTarget: focusDocument }); invoke(target.node.props.onPointerUp, event); return event;
}
function click(target: ReturnType<typeof pointerDown>, extra: Record<string, unknown> = {}) {
  const event = input(target.node, { button: 0, detail: 1, ...target.modifiers, nativeEvent: { isComposing: false, pointerId: 73 }, ...extra });
  invoke(target.node.props.onClick, event); return event;
}
function pointer(ui: UI, id: string, modifiers: Modifiers) {
  const target = pointerDown(ui, id, modifiers); target.node.focus(); ui.settle(); pointerUp(target); click(target); ui.settle(); return target;
}

it.each([{ ctrlKey: true }, { metaKey: true }])('ASUI2.TEST.POINTER_ORDER: %j click toggles separated rows once after native focus and keeps a deselected anchor', modifiers => {
  const ui = five(), base = ui.props.alerts, before = structuredClone(base);
  pointer(ui, 'd', modifiers); pointer(ui, 'b', modifiers); expect(ui.selected()).toEqual(['b', 'd']);
  pointer(ui, 'b', modifiers); expect(ui.selected()).toEqual(['d']);
  pointer(ui, 'a', { shiftKey: true }); expect(ui.selected()).toEqual(['a', 'b', 'd']); expect(focusDocument.activeElement).toBe(row(ui, 'a').node);
  expect(ui.props.alerts).toBe(base); expect(ui.props.alerts).toEqual(before); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it.each([{ shiftKey: true }, { shiftKey: true, ctrlKey: true }, { shiftKey: true, metaKey: true }])('ASUI2.TEST.POINTER_ORDER: native focus preserves B anchor and outside E for range %j', modifiers => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); pointer(ui, 'd', modifiers);
  expect(ui.selected()).toEqual(['b', 'c', 'd', 'e']); expect(focusDocument.activeElement).toBe(row(ui, 'd').node);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_ORDER: absent anchor uses the pre-pointer focused row instead of the newly focused target', () => {
  const ui = five(); ui.toggle('e'); const origin = focus(ui, 'b'); ui.escape(); expect(ui.selected()).toEqual([]); expect(focusDocument.activeElement).toBe(origin);
  pointer(ui, 'd', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'c', 'd']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_ORDER: no anchor and no registered focused row creates the clicked singleton', () => {
  const ui = five(); pointer(ui, 'd', { shiftKey: true }); expect(ui.selected()).toEqual(['d']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_ORDER: pointer range follows reversed displayed order and preserves the outside row', () => {
  const ui = five(); ui.change('Sort alerts by', 'name'); ui.change('Alert sort direction', 'desc'); ui.toggle('a'); focus(ui, 'd'); pointer(ui, 'b', { shiftKey: true });
  expect(ui.selected()).toEqual(['d', 'c', 'b', 'a']); expect(ui.props.alerts.map(item => item.definition.id)).toEqual(['a', 'b', 'c', 'd', 'e']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_RETIRE: normal release keeps one activation token and a retained click cannot replay it', () => {
  const ui = five(); const target = pointerDown(ui, 'b', { ctrlKey: true }); target.node.focus(); ui.settle();
  const retained = target.node.props.onClick; pointerUp(target); const event = click(target); ui.settle(); expect(ui.selected()).toEqual(['b']);
  invoke(retained, event); ui.settle(); expect(ui.selected()).toEqual(['b']); expect(ui.publish).not.toHaveBeenCalled();
});

it.each([false, true])('ASUI2.TEST.POINTER_RETIRE: click without native pointer ID needs a matching release (released=%s)', released => {
  const ui = five(), target = pointerDown(ui, 'b', { ctrlKey: true }); target.node.focus(); ui.settle(); if (released) pointerUp(target);
  click(target, { nativeEvent: { isComposing: false } }); ui.settle(); expect(ui.selected()).toEqual(released ? ['b'] : []); expect(ui.publish).not.toHaveBeenCalled();
});

it.each(['cancel', 'outside-release', 'pointer-mismatch', 'modifier-mismatch', 'unrelated-key', 'other-focus', 'filter', 'hidden-document'] as const)('ASUI2.TEST.POINTER_RETIRE: %s permanently cancels a captured Shift gesture', kind => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = pointerDown(ui, 'd', { shiftKey: true }); target.node.focus(); ui.settle();
  if (kind === 'cancel') { const event = input(target.node, { pointerId: 73 }); dispatchDocument('pointercancel', event); invoke(target.node.props.onPointerCancel, event); }
  else if (kind === 'outside-release') { const search = ui.field('Search alerts'), node = ui.nodeFor(search); pointerUp(target, { target: node }); }
  else if (kind === 'pointer-mismatch') pointerUp(target, { pointerId: 74 });
  else if (kind === 'modifier-mismatch') { pointerUp(target); click(target, { shiftKey: true, ctrlKey: true }); }
  else if (kind === 'unrelated-key') dispatchDocument('keydown', input(target.node, { key: 'Tab' }));
  else if (kind === 'other-focus') { const search = ui.field('Search alerts'); ui.nodeFor(search).focus(); }
  else if (kind === 'filter') ui.change('Search alerts', 'SYNTHETIC d');
  else { Object.assign(focusDocument, { hidden: true, visibilityState: 'hidden' }); dispatchDocument('visibilitychange', {}, false); }
  pointerUp(target); click(target); ui.settle(); expect(ui.selected()).toEqual(kind === 'filter' ? [] : ['e']); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_RETIRE: canceled pointer intent cannot suppress a later ordinary row focus anchor', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const abandoned = pointerDown(ui, 'd', { shiftKey: true }); dispatchDocument('pointercancel', input(abandoned.node, { pointerId: 73 }));
  focus(ui, 'd'); pointer(ui, 'c', { shiftKey: true }); expect(ui.selected()).toEqual(['c', 'd', 'e']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_RETIRE: same-node rerender preserves gesture binding while old ref(null) cannot remove it', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = pointerDown(ui, 'd', { shiftKey: true }), oldRef = target.control.props.ref;
  ui.props.alerts = ui.props.alerts.map(item => ({ ...item, history: item.history.map(entry => ({ ...entry })) })); ui.settle(); bindRef(oldRef, null);
  target.node.focus(); ui.settle(); pointerUp(target); click(target); ui.settle();
  expect(ui.selected()).toEqual(['b', 'c', 'd', 'e']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_RETIRE: replacement physical row cannot inherit its retired pointer token', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = pointerDown(ui, 'd', { shiftKey: true }), oldClick = target.control.props.onClick;
  for (const name of ui.nodes.keys()) if (name === 'row:d' || name.startsWith('row:d.')) ui.nodes.delete(name);
  ui.settle(); const replacement = row(ui, 'd').node; expect(replacement).not.toBe(target.node); replacement.focus(); ui.settle();
  pointerUp(target); invoke(oldClick, input(target.node, { button: 0, shiftKey: true, nativeEvent: { pointerId: 73, isComposing: false } })); ui.settle();
  expect(ui.selected()).toEqual(['e']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_RETIRE: reentrant native focus closure refuses the later pointer release and click', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = pointerDown(ui, 'd', { shiftKey: true }), close = ui.field('Close alerts'), closeNode = ui.nodeFor(close);
  let writesAfterClose = -1; target.node.afterFocus = () => { invoke(close.props.onClick, input(closeNode)); writesAfterClose = ui.owner.writes; };
  target.node.focus(); pointerUp(target); click(target); expect(ui.owner.writes).toBe(writesAfterClose);
  expect(ui.props.onClose).toHaveBeenCalledTimes(1); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); ui.settle();
});

it.each([{ defaultPrevented: true }, { altKey: true }, { nativeEvent: { isComposing: true } }, { pointerId: 1.5 }, { button: 1 }])('ASUI2.TEST.POINTER_RETIRE: rejected pointerdown %j cannot authorize a later modified click', extra => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = pointerDown(ui, 'd', { shiftKey: true }, extra);
  target.node.focus(); ui.settle(); pointerUp(target); click(target); ui.settle();
  expect(ui.selected()).toEqual(['e']); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it.each([false, true])('ASUI2.TEST.POINTER_ORDER: native right-click focus preserves the anchor through selected menu dismissal (released=%s)', released => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = pointerDown(ui, 'e', {}, { button: 2, buttons: 2 });
  target.node.focus(); ui.settle(); if (released) pointerUp(target, { button: 2 });
  const event = input(target.node, { button: 2, nativeEvent: { isComposing: false, pointerId: 73 } }); invoke(target.node.props.onContextMenu, event); ui.settle();
  expect(ui.field('Actions for 1 selected alerts').props.role).toBe('menu'); expect(ui.selected()).toEqual(['e']);
  ui.escape(); expect(focusDocument.activeElement).toBe(row(ui, 'e').node);
  pointer(ui, 'd', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'c', 'd', 'e']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_RETIRE: unmount removes capture listeners and retires retained row callbacks', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = pointerDown(ui, 'd', { shiftKey: true }); target.node.focus(); ui.settle();
  const retainedClick = target.node.props.onClick, retainedKey = target.node.props.onKeyDown; ui.dispose(); const writes = ui.owner.writes;
  dispatchDocument('pointerup', input(target.node, { pointerId: 73, button: 0, shiftKey: true }));
  invoke(retainedClick, input(target.node, { button: 0, shiftKey: true, nativeEvent: { pointerId: 73, isComposing: false } }));
  invoke(retainedKey, input(target.node, { key: 'a', ctrlKey: true }));
  expect(ui.owner.writes).toBe(writes); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
  const additions = focusDocument.addEventListener.mock.calls, removals = focusDocument.removeEventListener.mock.calls;
  for (const registration of additions) expect(removals.some(removal => removal[0] === registration[0] && removal[1] === registration[1] && removal[2] === registration[2])).toBe(true);
});

it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }])('ASUI2.TEST.ALL_ISOLATION: modified %j double-click never starts Edit', modifier => {
  const ui = five(), current = row(ui, 'b'); invoke(current.control.props.onDoubleClick, input(current.node, { detail: 2, ...modifier })); ui.settle();
  expect(all(ui.render(), node => node.props['aria-label'] === 'Alert name')).toEqual([]); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.ALL_ISOLATION: ordinary strong-name double-click still opens the existing Edit form', () => {
  const ui = five(), current = row(ui, 'b'), strong = ui.find(node => node.type === 'strong' && text(node) === 'SYNTHETIC b', current.control), target = ui.nodeFor(strong);
  invoke(current.control.props.onDoubleClick, input(current.node, { detail: 2, target })); ui.settle();
  expect(ui.field('Alert name').props.value).toBe('SYNTHETIC b'); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.KEY_RANGE: actual ShiftDown/Up reverses only the added range and preserves outside E', () => {
  const ui = five(), base = ui.props.alerts, before = structuredClone(base); ui.toggle('e'); focus(ui, 'b');
  key(ui, 'b', 'ArrowDown', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'c', 'e']); expect(focusDocument.activeElement).toBe(row(ui, 'c').node);
  key(ui, 'c', 'ArrowUp', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'e']); expect(focusDocument.activeElement).toBe(row(ui, 'b').node);
  key(ui, 'b', 'ArrowUp', { shiftKey: true }); expect(ui.selected()).toEqual(['a', 'b', 'e']); expect(focusDocument.activeElement).toBe(row(ui, 'a').node);
  expect(ui.props.alerts).toBe(base); expect(ui.props.alerts).toEqual(before); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ASUI2.TEST.KEY_RANGE: repeated ShiftDown extends one current step and shrinking retains a preselected interior row', () => {
  const ui = five(); ui.toggle('d'); focus(ui, 'b');
  const first = key(ui, 'b', 'ArrowDown', { shiftKey: true }); expect(first.preventDefault).toHaveBeenCalledTimes(1); expect(first.stopPropagation).toHaveBeenCalledTimes(1);
  key(ui, 'c', 'ArrowDown', { shiftKey: true, repeat: true }); expect(ui.selected()).toEqual(['b', 'c', 'd']);
  key(ui, 'd', 'ArrowUp', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'c', 'd']);
  key(ui, 'c', 'ArrowUp', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'd']);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it.each([['a', 'ArrowUp'], ['e', 'ArrowDown']] as const)('ASUI2.TEST.KEY_RANGE: endpoint %s clamps to a singleton without manufacturing another focus event', (id, direction) => {
  const ui = five(), target = focus(ui, id), afterFocus = vi.fn(); target.afterFocus = afterFocus;
  key(ui, id, direction, { shiftKey: true }); expect(ui.selected()).toEqual([id]); expect(focusDocument.activeElement).toBe(target);
  key(ui, id, direction, { shiftKey: true, repeat: true }); expect(ui.selected()).toEqual([id]); expect(afterFocus).not.toHaveBeenCalled();
  expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.KEY_RANGE: ordinary focus navigation ends the previous range while retaining selected IDs', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); key(ui, 'b', 'ArrowDown', { shiftKey: true });
  key(ui, 'c', 'ArrowDown'); expect(ui.selected()).toEqual(['b', 'c', 'e']); expect(focusDocument.activeElement).toBe(row(ui, 'd').node);
  key(ui, 'd', 'ArrowUp', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'c', 'd', 'e']);
  key(ui, 'c', 'ArrowDown', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'c', 'd', 'e']);
  expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.POINTER_ORDER: ordinary native focus followed by click establishes its anchor exactly once', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = pointerDown(ui, 'd', {}), beforeFocus = ui.owner.writes;
  target.node.focus(); expect(ui.owner.writes).toBe(beforeFocus + 1); ui.settle(); const afterFocus = ui.owner.writes;
  pointerUp(target); click(target); expect(ui.owner.writes).toBe(afterFocus); ui.settle();
  expect(ui.selected()).toEqual(['e']); expect(focusDocument.activeElement).toBe(row(ui, 'd').node);
  pointer(ui, 'c', { shiftKey: true }); expect(ui.selected()).toEqual(['c', 'd', 'e']); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ASUI2.TEST.KEY_RANGE: a plain click on the already-focused range head ends range continuation exactly once', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); key(ui, 'b', 'ArrowDown', { shiftKey: true });
  const current = pointerDown(ui, 'c', {}), beforeClick = ui.owner.writes; current.node.focus(); expect(ui.owner.writes).toBe(beforeClick);
  pointerUp(current); click(current); expect(ui.owner.writes).toBe(beforeClick + 1); ui.settle();
  key(ui, 'c', 'ArrowUp', { shiftKey: true }); expect(ui.selected()).toEqual(['b', 'c', 'e']);
  expect(focusDocument.activeElement).toBe(row(ui, 'b').node); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.KEY_RANGE: reversed displayed order controls keyboard extension rather than saved or lexical order', () => {
  const ui = five(); ui.change('Sort alerts by', 'name'); ui.change('Alert sort direction', 'desc'); ui.toggle('a'); focus(ui, 'd');
  key(ui, 'd', 'ArrowDown', { shiftKey: true }); expect(ui.selected()).toEqual(['d', 'c', 'a']);
  key(ui, 'c', 'ArrowDown', { shiftKey: true }); expect(ui.selected()).toEqual(['d', 'c', 'b', 'a']);
  key(ui, 'b', 'ArrowUp', { shiftKey: true }); expect(ui.selected()).toEqual(['d', 'c', 'a']);
  expect(ui.props.alerts.map(item => item.definition.id)).toEqual(['a', 'b', 'c', 'd', 'e']); expect(ui.publish).not.toHaveBeenCalled();
});

it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { defaultPrevented: true }, { nativeEvent: { isComposing: true } }])('ASUI2.TEST.KEY_RANGE: incompatible or prevented ShiftArrow ignores %j', extra => {
  const ui = five(); ui.toggle('e'); const origin = focus(ui, 'b'), before = ui.selected();
  const event = key(ui, 'b', 'ArrowDown', { shiftKey: true, ...extra });
  expect(ui.selected()).toEqual(before); expect(focusDocument.activeElement).toBe(origin); expect(event.preventDefault).not.toHaveBeenCalled(); expect(event.stopPropagation).not.toHaveBeenCalled();
  expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.KEY_RANGE: reentrant target focus closes the owner without stale rollback or later writes', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = row(ui, 'c').node, close = ui.field('Close alerts'), closeNode = ui.nodeFor(close);
  let writesAfterClose = -1;
  target.afterFocus = () => { invoke(close.props.onClick, input(closeNode)); writesAfterClose = ui.owner.writes; };
  const current = row(ui, 'b'); invoke(current.control.props.onKeyDown, input(current.node, { key: 'ArrowDown', shiftKey: true }));
  expect(writesAfterClose).toBeGreaterThanOrEqual(0); expect(ui.owner.writes).toBe(writesAfterClose); expect(ui.props.onClose).toHaveBeenCalledTimes(1);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); ui.settle();
});

it('ASUI2.TEST.KEY_RANGE: redirected target focus is not stolen back by an old keyboard range handler', () => {
  const ui = five(); ui.toggle('e'); focus(ui, 'b'); const target = row(ui, 'c').node, external = new ModelNode();
  let writesAfterRedirect = -1; target.afterFocus = () => { external.focus(); writesAfterRedirect = ui.owner.writes; };
  const current = row(ui, 'b'); invoke(current.control.props.onKeyDown, input(current.node, { key: 'ArrowDown', shiftKey: true }));
  expect(focusDocument.activeElement).toBe(external); expect(ui.owner.writes).toBe(writesAfterRedirect);
  ui.settle(); expect(focusDocument.activeElement).toBe(external); expect(ui.selected()).toEqual(['b', 'c', 'e']); expect(ui.publish).not.toHaveBeenCalled();
});

it.each([{ ctrlKey: true }, { metaKey: true }])('ASUI2.TEST.ALL_ISOLATION: list-owned %j+A selects shown rows without moving focus or publishing', modifier => {
  const ui = five(), hidden = ui.props.alerts[1]; hidden.definition.mode = 'replay'; hidden.definition.runId = 'SYNTHETIC other run'; hidden.history.forEach(item => { item.mode = 'replay'; item.runId = 'SYNTHETIC other run'; });
  ui.change('Alert mode filter', 'ordinary'); ui.change('Sort alerts by', 'name'); ui.change('Alert sort direction', 'desc'); const origin = focus(ui, 'c'), base = ui.props.alerts;
  const event = key(ui, 'c', 'a', modifier); expect(ui.selected()).toEqual(['e', 'd', 'c', 'a']); expect(focusDocument.activeElement).toBe(origin);
  expect(event.preventDefault).toHaveBeenCalledTimes(1); expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it.each([{ shiftKey: true }, { altKey: true }, { defaultPrevented: true }, { nativeEvent: { isComposing: true } }])('ASUI2.TEST.ALL_ISOLATION: modified or prevented Ctrl+A ignores %j', extra => {
  const ui = five(); ui.toggle('e'); const origin = focus(ui, 'b'); const event = key(ui, 'b', 'a', { ctrlKey: true, ...extra });
  expect(ui.selected()).toEqual(['e']); expect(focusDocument.activeElement).toBe(origin); expect(event.preventDefault).not.toHaveBeenCalled(); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.ALL_ISOLATION: nested checkbox key events cannot borrow the enclosing row selection shortcut', () => {
  const ui = five(), current = row(ui, 'b'), checkbox = ui.checkbox('b'), node = ui.nodeFor(checkbox); node.focus();
  const event = input(current.node, { key: 'a', ctrlKey: true, target: node }); invoke(current.control.props.onKeyDown, event); ui.settle();
  expect(ui.selected()).toEqual([]); expect(focusDocument.activeElement).toBe(node); expect(event.preventDefault).not.toHaveBeenCalled(); expect(ui.publish).not.toHaveBeenCalled();
});

it.each(['label', 'summary', 'textbox', 'checkbox', 'option', 'contenteditable'])('ASUI2.TEST.ALL_ISOLATION: nested %s keeps its own keyboard scope even when the row owns focus', kind => {
  const ui = five(), origin = focus(ui, 'b'), current = row(ui, 'b'), nested = new ModelNode(); nested.parent = origin; origin.children.push(nested);
  if (kind === 'label' || kind === 'summary') nested.tag = kind;
  else if (kind === 'contenteditable') nested.props.contentEditable = true;
  else nested.props.role = kind;
  const event = input(current.node, { key: 'ArrowDown', shiftKey: true, target: nested }); invoke(current.control.props.onKeyDown, event); ui.settle();
  expect(ui.selected()).toEqual([]); expect(focusDocument.activeElement).toBe(origin); expect(event.preventDefault).not.toHaveBeenCalled(); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.ALL_ISOLATION: nested checkbox Space stays outside row navigation and one native change selects only its row', () => {
  const ui = five(), current = row(ui, 'b'), checkbox = ui.checkbox('b'), node = ui.nodeFor(checkbox); node.focus();
  const event = input(current.node, { key: ' ', target: node }); dispatchDocument('keydown', event); invoke(current.control.props.onKeyDown, event);
  expect(event.preventDefault).not.toHaveBeenCalled(); expect(focusDocument.activeElement).toBe(node);
  node.nativeChecked = true; invoke(checkbox.props.onChange, input(node)); ui.settle(); expect(ui.selected()).toEqual(['b']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.TEST.ALL_ISOLATION: Search Ctrl+A preserves its text-selection scope and existing row selection', () => {
  const ui = five(); ui.toggle('e'); const search = ui.field('Search alerts'), node = ui.nodeFor(search); node.focus();
  const filter = ui.find(control => control.props['aria-label'] === 'Filter saved alerts'), filterNode = ui.nodeFor(filter), event = input(filterNode, { key: 'a', ctrlKey: true, target: node });
  dispatchDocument('keydown', event); invoke(filter.props.onKeyDown, event); ui.settle();
  expect(event.preventDefault).not.toHaveBeenCalled(); expect(event.stopPropagation).toHaveBeenCalledTimes(1); expect(focusDocument.activeElement).toBe(node);
  expect(ui.selected()).toEqual(['e']); expect(ui.publish).not.toHaveBeenCalled();
});

it.each([{ key: 'ArrowDown', shiftKey: true }])('ASUI2.TEST.ALL_ISOLATION: History keeps unsupported selection shortcut %j inert', gesture => {
  const ui = five(), base = ui.props.alerts, before = structuredClone(base); ui.callButton('History (10)');
  const rows = all(ui.render(), control => control.type === 'tr' && control.props['data-alert-history-id'] !== undefined), first = rows[0], node = ui.nodeFor(first); node.focus();
  const event = input(node, gesture); dispatchDocument('keydown', event); invoke(first.props.onKeyDown, event); ui.settle();
  expect(event.preventDefault).not.toHaveBeenCalled(); expect(focusDocument.activeElement).toBe(node);
  expect(all(ui.render(), control => control.type === 'input' && control.props.type === 'checkbox')).toEqual([]);
  expect(ui.props.alerts).toBe(base); expect(ui.props.alerts).toEqual(before); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

// Multi-select now gives History its own Ctrl/Cmd+A select-all.
// It must stay isolated from manager selection and never mutate saved alerts.
it.each([{ key: 'a', ctrlKey: true }, { key: 'a', metaKey: true }])('ASUI2.TEST.ALL_ISOLATION: History %j selects only History events without manager selection or mutation', gesture => {
  const ui = five(), base = ui.props.alerts, before = structuredClone(base); ui.callButton('History (10)');
  const rows = all(ui.render(), control => control.type === 'tr' && control.props['data-alert-history-id'] !== undefined), first = rows[0], node = ui.nodeFor(first); node.focus();
  const event = input(node, gesture); dispatchDocument('keydown', event); invoke(first.props.onKeyDown, event); ui.settle();
  expect(event.preventDefault).toHaveBeenCalledTimes(1); expect(focusDocument.activeElement).toBe(node);
  expect(all(ui.render(), control => control.type === 'tr' && control.props['aria-selected'] === true)).toHaveLength(10);
  expect(all(ui.render(), control => control.type === 'input' && control.props.type === 'checkbox')).toEqual([]);
  expect(ui.props.alerts).toBe(base); expect(ui.props.alerts).toEqual(before); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
  ui.callButton('Alerts (5)'); expect(ui.selected()).toEqual([]);
});
