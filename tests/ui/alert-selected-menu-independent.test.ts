import { expect, it } from 'vitest';
import { validateLocalAlerts } from '../../src/domain/alerts';
import { all, bindRef, dispatchDocument, focusDocument, input, invoke, notice, saved, setup, text, type ModelElement, type ModelNode } from '../helpers/alert-dialog-harness';

// Independent ASUI.2 cases exercise actual component callbacks, refs and effects
// through the shared controlled model. Native pointer ordering, browser focus,
// packaged execution and reference appearance remain separate verification.
type UI = ReturnType<typeof setup>;
// Clone selected added a fourth selected command (our own order: Clone last).
const actions = ['Pause selected', 'Resume selected', 'Delete selected', 'Clone selected'] as const;
const menu = (ui: UI) => ui.find(node => node.props.role === 'menu');
const menus = (ui: UI) => all(ui.render(), node => node.props.role === 'menu');
const previews = (ui: UI) => all(ui.render(), node => node.props['aria-label'] === 'Selected alert action preview' || node.props['aria-label'] === 'Delete selected local alerts');
const statuses = (ui: UI) => all(ui.render(), node => node.props.role === 'status').map(text);
const menuItem = (ui: UI, name: string) => ui.find(node => node.props.role === 'menuitem' && text(node) === name, menu(ui));
function selectAC(ui: UI) { ui.toggle('a'); ui.toggle('c'); expect(ui.selected()).toEqual(['a', 'c']); }
function captureKey(node: ModelNode, event: ReturnType<typeof input>) {
  dispatchDocument('keydown', { ...event, currentTarget: focusDocument });
  const ancestors: ModelNode[] = []; for (let parent = node.parent; parent; parent = parent.parent) ancestors.unshift(parent);
  for (const parent of ancestors) invoke(parent.props.onKeyDownCapture, { ...event, currentTarget: parent });
}
function open(ui: UI, id = 'a', method: 'More' | 'context' | 'ContextMenu' | 'F10' = 'More') {
  if (method === 'More') { ui.rowButton(id, 'More'); return; }
  let row = ui.row(id), node = ui.nodeFor(row);
  if (method === 'context') {
    const down = input(node, { pointerId: 41, pointerType: 'mouse', isPrimary: true, button: 2, buttons: 2 });
    dispatchDocument('pointerdown', { ...down, currentTarget: focusDocument }); invoke(node.props.onPointerDown, down);
    node.focus(); ui.settle();
    // Windows contextmenu may precede pointerup. This is a controlled ordering
    // case, not evidence that an actual native window emitted these events.
    invoke(node.props.onContextMenu, input(node, { button: 2, nativeEvent: { isComposing: false, pointerId: 41 } }));
    const up = input(node, { pointerId: 41, button: 2, buttons: 0 });
    dispatchDocument('pointerup', { ...up, currentTarget: focusDocument }); invoke(node.props.onPointerUp, up);
  } else {
    node.focus(); ui.settle(); row = ui.row(id); node = ui.nodeFor(row);
    const event = input(node, { key: method, shiftKey: method === 'F10' }); captureKey(node, event); invoke(row.props.onKeyDown, event);
  }
  ui.settle();
}
function choose(ui: UI, name: string) {
  const item = menuItem(ui, name), node = ui.nodeFor(item);
  node.focus(); invoke(item.props.onClick, input(node)); ui.settle();
}
function keep(ui: UI, item: ModelElement) { return { callback: item.props.onClick, node: ui.nodeFor(item) }; }
function replay(ui: UI, retained: ReturnType<typeof keep>) { invoke(retained.callback, input(retained.node)); ui.settle(); }
function keyMenu(ui: UI, key: string, extra: Record<string, unknown> = {}) {
  const control = menu(ui), node = ui.nodeFor(control);
  const event = input(node, { key, target: focusDocument.activeElement ?? node, ...extra });
  captureKey(node, event); invoke(control.props.onKeyDown, event); ui.settle();
}

it.each(['More', 'context', 'ContextMenu', 'F10'] as const)('ASUI2.MENU.SCOPE: %s on a selected row exposes the fixed selected action set', method => {
  const ui = setup(), base = ui.props.alerts, before = structuredClone(base); selectAC(ui); open(ui, 'a', method);
  const current = menu(ui);
  expect(current.props['aria-label']).toBe('Actions for 2 selected alerts');
  expect(all(current, node => node.props.role === 'menuitem').map(text)).toEqual(actions);
  expect(ui.selected()).toEqual(['a', 'c']); expect(ui.props.alerts).toBe(base); expect(base).toEqual(before);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it.each(['ContextMenu', 'F10'] as const)('ASUI2.MENU.KEY_OWNER: retained %s callback cannot open after focus moves from the selected row to Search', key => {
  const ui = setup(), base = ui.props.alerts; selectAC(ui);
  ui.nodeFor(ui.row('a')).focus(); ui.settle();
  const retainedRow = ui.row('a'), origin = ui.nodeFor(retainedRow), retained = retainedRow.props.onKeyDown;
  const search = ui.nodeFor(ui.field('Search alerts')); search.focus(); ui.settle();
  const beforeStatus = statuses(ui), event = input(origin, { key, shiftKey: key === 'F10' });
  expect(focusDocument.activeElement).toBe(search);
  captureKey(origin, event); invoke(retained, event); ui.settle();
  expect(menus(ui)).toEqual([]); expect(previews(ui)).toEqual([]); expect(statuses(ui)).toEqual(beforeStatus);
  expect(focusDocument.activeElement).toBe(search); expect(ui.selected()).toEqual(['a', 'c']); expect(ui.props.alerts).toBe(base);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ASUI2.MENU.SCOPE: More on an unselected row retains that row scope without replacing the selected set', () => {
  const ui = setup(), base = ui.props.alerts; selectAC(ui); open(ui, 'b');
  expect(menu(ui).props['aria-label']).toBe('Actions for SYNTHETIC b');
  expect(all(menu(ui), node => node.props.role === 'menuitem').map(text)).toEqual(['Edit', 'Pause', 'Delete']);
  expect(ui.selected()).toEqual(['a', 'c']); choose(ui, 'Pause');
  expect(ui.props.alerts.map(row => [row.definition.id, row.status])).toEqual([['a', 'active'], ['b', 'paused'], ['c', 'active']]);
  expect(ui.props.alerts[0]).toBe(base[0]); expect(ui.props.alerts[2]).toBe(base[2]); expect(ui.publish).toHaveBeenCalledTimes(1);
});

it('ASUI2.MENU.BINDING: ordinary same-node renders and old ref cleanup preserve the current selected menu', () => {
  const ui = setup(); selectAC(ui); open(ui);
  const oldMenu = menu(ui), oldMenuRef = oldMenu.props.ref;
  const oldMore = ui.field('More alert actions for SYNTHETIC a'), oldMoreRef = oldMore.props.ref;
  const oldItem = menuItem(ui, 'Pause selected'), oldItemRef = oldItem.props.ref;
  const beforeNode = ui.nodeFor(menu(ui)); ui.settle();
  const freshMenu = menu(ui), freshNode = ui.nodeFor(freshMenu); expect(freshNode).toBe(beforeNode);
  bindRef(oldMenuRef, null); bindRef(oldMoreRef, null); bindRef(oldItemRef, null);
  // Invoke before another render can repair a wrongly erased ref and make this
  // ownership assertion pass accidentally.
  const event = input(freshNode, { key: 'End', target: focusDocument.activeElement ?? freshNode });
  captureKey(freshNode, event); invoke(freshMenu.props.onKeyDown, event);
  expect(text(focusDocument.activeElement?.props.children)).toBe('Clone selected'); ui.settle();
  choose(ui, 'Pause selected'); expect(text(previews(ui)[0])).toContain('2 selected; 2 eligible; 0 unchanged.');
  ui.callButton('Apply pause'); expect(ui.props.alerts.map(row => row.status)).toEqual(['paused', 'active', 'paused']);
  expect(ui.publish).toHaveBeenCalledTimes(1);
});

it('ASUI2.MENU.BASIS: history-only refresh survives menu ownership and enters Delete with the latest exact consent', () => {
  const ui = setup(); selectAC(ui); open(ui);
  const old = ui.props.alerts, changed = { ...old[0], lastSequence: 10, lastTime: 120, lastTriggeredAt: 120, lastTriggeredBar: 'SYNTHETIC bar 10', history: [...old[0].history, notice('a', 10, 120)] };
  const base = [changed, old[1], old[2]]; expect(validateLocalAlerts(base).ok).toBe(true);
  ui.props.alerts = base; ui.settle(); expect(menu(ui).props['aria-label']).toBe('Actions for 2 selected alerts');
  choose(ui, 'Delete selected'); expect(text(previews(ui)[0])).toContain('Delete these alerts and 5 retained local trigger records?');
  ui.callButton('Confirm delete selected'); expect(ui.props.alerts).toEqual([base[1]]); expect(ui.props.alerts[0]).toBe(base[1]);
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.publish.mock.calls[0][1]).toBe(base);
});

it.each(['status', 'revision', 'authority'] as const)('ASUI2.MENU.RETIRE: changed %s retires a retained selected item', reason => {
  const ui = setup(); selectAC(ui); open(ui); const old = keep(ui, menuItem(ui, 'Pause selected'));
  if (reason === 'status') ui.props.alerts = ui.props.alerts.map(row => row.definition.id === 'c' ? { ...row, status: 'paused' } : row);
  else if (reason === 'revision') ui.props.alerts = ui.props.alerts.map(row => row.definition.id === 'c' ? { ...row, revision: row.revision + 1 } : row);
  else ui.replaceAuthority();
  ui.settle(); expect(menus(ui)).toEqual([]); const base = ui.props.alerts;
  replay(ui, old); expect(previews(ui)).toEqual([]); expect(ui.props.alerts).toBe(base);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ASUI2.MENU.RETIRE: another selected row status changed then restored never revives the old menu', () => {
  const ui = setup(), base = ui.props.alerts; selectAC(ui); open(ui); const old = keep(ui, menuItem(ui, 'Delete selected'));
  ui.props.alerts = [base[0], base[1], { ...base[2], status: 'paused' }]; ui.settle(); expect(menus(ui)).toEqual([]);
  ui.props.alerts = base; ui.settle(); replay(ui, old);
  expect(previews(ui)).toEqual([]); expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.MENU.BASIS: unrelated row status changes do not retire the exact selected set', () => {
  const ui = setup(); selectAC(ui); open(ui);
  const base = ui.props.alerts.map(row => row.definition.id === 'b' ? { ...row, status: 'paused' as const } : row);
  ui.props.alerts = base; ui.settle(); choose(ui, 'Pause selected'); ui.callButton('Apply pause');
  expect(ui.props.alerts.map(row => row.status)).toEqual(['paused', 'paused', 'paused']);
  expect(ui.props.alerts[1]).toBe(base[1]); expect(ui.publish.mock.calls[0][1]).toBe(base);
});

it.each(['missing', 'malformed'] as const)('ASUI2.MENU.UNAVAILABLE: %s authority preserves selected scope with four disabled actions', kind => {
  const ui = setup(), base = ui.props.alerts;
  ui.props.managerActionAuthority = kind === 'missing' ? undefined : { token: {}, assertCurrent: null } as unknown as typeof ui.props.managerActionAuthority;
  ui.settle(); selectAC(ui); open(ui);
  expect(menu(ui).props['aria-label']).toBe('Actions for 2 selected alerts');
  expect(text(menu(ui))).toContain('Selected actions are unavailable for this source.');
  const items = all(menu(ui), node => node.props.role === 'menuitem'); expect(items.map(text)).toEqual(actions);
  const retainedItems = items.map(item => { expect(item.props.disabled).toBe(true); return keep(ui, item); });
  for (const retained of retainedItems) {
    replay(ui, retained);
    expect(previews(ui)).toEqual([]);
  }
  expect(ui.selected()).toEqual(['a', 'c']); expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.MENU.UNAVAILABLE: valid-shaped but unready authority refuses preparation without polling it during open', () => {
  const ui = setup(), base = ui.props.alerts; selectAC(ui); ui.readiness(false);
  const priorCalls = ui.assertAuthority.mock.calls.length; open(ui);
  expect(ui.assertAuthority.mock.calls.length).toBe(priorCalls); choose(ui, 'Pause selected');
  expect(ui.assertAuthority.mock.calls.length).toBeGreaterThan(priorCalls);
  expect(previews(ui)).toEqual([]); expect(ui.selected()).toEqual(['a', 'c']); expect(ui.props.alerts).toBe(base);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it.each(['Escape', 'Tab'] as const)('ASUI2.MENU.UNAVAILABLE: all-disabled menu provides reachable %s exit without roving an empty item list', key => {
  const ui = setup(); ui.props.managerActionAuthority = undefined; ui.settle(); selectAC(ui); open(ui);
  const node = ui.nodeFor(menu(ui));
  // Actual opening effect must make the container reachable when every item is
  // disabled. The test does not focus the menu to bypass a missing user path.
  expect(focusDocument.activeElement).toBe(node);
  keyMenu(ui, 'ArrowDown'); expect(focusDocument.activeElement).toBe(node);
  keyMenu(ui, key); expect(menus(ui)).toEqual([]); expect(ui.props.open).toBe(true); expect(ui.selected()).toEqual(['a', 'c']);
  if (key === 'Escape') expect(focusDocument.activeElement?.getAttribute('aria-label')).toBe('More alert actions for SYNTHETIC a');
  else expect(focusDocument.activeElement).not.toBe(node);
  expect(ui.publish).not.toHaveBeenCalled();
});

it.each(['Escape', 'Tab'] as const)('ASUI2.MENU.ROW_DELETE: %s dismisses only the blocked selected menu and preserves existing row deletion consent', key => {
  const ui = setup(), base = ui.props.alerts, before = structuredClone(base); selectAC(ui); ui.rowButton('b', 'Delete');
  const prior = ui.find(node => node.props['aria-label'] === 'Delete local alert'), priorNode = ui.nodeFor(prior);
  const originalCancel = keep(ui, ui.button('Cancel', prior));
  open(ui);
  const current = menu(ui), menuNode = ui.nodeFor(current);
  expect(current.props['aria-label']).toBe('Actions for 2 selected alerts');
  expect(text(current)).toContain('Finish the open alert deletion before acting on selected alerts.');
  const items = all(current, node => node.props.role === 'menuitem'); expect(items.map(text)).toEqual(actions);
  const retained = items.map(item => { expect(item.props.disabled).toBe(true); return keep(ui, item); });
  expect(focusDocument.activeElement).toBe(menuNode);
  for (const item of retained) {
    replay(ui, item); expect(menu(ui).props['aria-label']).toBe('Actions for 2 selected alerts');
    expect(ui.nodeFor(ui.find(node => node.props['aria-label'] === 'Delete local alert'))).toBe(priorNode);
  }
  keyMenu(ui, key); expect(menus(ui)).toEqual([]);
  expect(ui.nodeFor(ui.find(node => node.props['aria-label'] === 'Delete local alert'))).toBe(priorNode);
  expect(previews(ui)).toEqual([]); expect(ui.selected()).toEqual(['a', 'c']); expect(ui.props.open).toBe(true);
  expect(ui.props.alerts).toBe(base); expect(base).toEqual(before); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
  if (key === 'Escape') expect(focusDocument.activeElement).toBe(ui.nodeFor(ui.field('More alert actions for SYNTHETIC a')));
  else expect(focusDocument.activeElement).not.toBe(menuNode);
  // Physical node reuse alone cannot prove consent ownership. The exact Cancel
  // captured before menu opening must still resolve that original confirmation.
  replay(ui, originalCancel); expect(all(ui.render(), node => node.props['aria-label'] === 'Delete local alert')).toEqual([]);
  expect(ui.props.alerts).toBe(base); expect(base).toEqual(before); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.MENU.ROW_DELETE: resolution retires its blocked menu and only a fresh opening can prepare selected changes', () => {
  const ui = setup(), base = ui.props.alerts; selectAC(ui); ui.rowButton('b', 'Delete');
  const rowConfirmation = ui.find(node => node.props['aria-label'] === 'Delete local alert');
  const cancel = keep(ui, ui.button('Cancel', rowConfirmation)); open(ui);
  const item = menuItem(ui, 'Pause selected'); expect(item.props.disabled).toBe(true); const blockedAction = keep(ui, item);
  // Retain the actual Cancel callback to model confirmation resolution during
  // another owned interaction. No forced private state or native-input claim.
  replay(ui, cancel); expect(all(ui.render(), node => node.props['aria-label'] === 'Delete local alert')).toEqual([]);
  expect(menus(ui)).toEqual([]); replay(ui, blockedAction); expect(previews(ui)).toEqual([]);
  expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.selected()).toEqual(['a', 'c']);
  open(ui); expect(menuItem(ui, 'Pause selected').props.disabled).toBe(false); choose(ui, 'Pause selected'); ui.callButton('Apply pause');
  expect(ui.props.alerts.map(row => [row.definition.id, row.status])).toEqual([['a', 'paused'], ['b', 'active'], ['c', 'paused']]);
  expect(ui.props.alerts[1]).toBe(base[1]); expect(ui.props.alerts[0].history).toEqual(base[0].history); expect(ui.props.alerts[2].history).toEqual(base[2].history);
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.publish.mock.calls[0][1]).toBe(base);
});

it('ASUI2.MENU.KEYS: selected menu uses real item focus, endpoint commands and Escape before selection clearing', () => {
  const ui = setup(); selectAC(ui); open(ui);
  expect(text(focusDocument.activeElement?.props.children)).toBe('Pause selected');
  keyMenu(ui, 'ArrowDown'); expect(text(focusDocument.activeElement?.props.children)).toBe('Resume selected');
  keyMenu(ui, 'End'); expect(text(focusDocument.activeElement?.props.children)).toBe('Clone selected');
  keyMenu(ui, 'Home'); expect(text(focusDocument.activeElement?.props.children)).toBe('Pause selected');
  keyMenu(ui, 'Escape'); expect(menus(ui)).toEqual([]); expect(ui.selected()).toEqual(['a', 'c']); expect(ui.props.open).toBe(true);
  ui.escape(); expect(ui.selected()).toEqual([]); expect(ui.props.open).toBe(true);
  ui.escape(); expect(ui.props.open).toBe(false);
});

it.each([
  ['Pause selected', 'Apply pause', 'active', 'paused'],
  ['Resume selected', 'Apply resume', 'paused', 'active'],
] as const)('ASUI2.MENU.POSITIVE: consumed %s menu enters the shared preview and publishes only selected eligible rows', (action, apply, initial, after) => {
  const ui = setup([saved('a', initial), saved('b'), saved('c', initial)]), base = ui.props.alerts; selectAC(ui); open(ui);
  choose(ui, action); expect(menus(ui)).toEqual([]);
  expect(text(previews(ui)[0])).toContain('2 selected; 2 eligible; 0 unchanged.'); expect(ui.props.alerts).toBe(base);
  ui.callButton(apply); expect(ui.props.alerts.map(row => [row.definition.id, row.status])).toEqual([['a', after], ['b', 'active'], ['c', after]]);
  expect(ui.props.alerts[1]).toBe(base[1]); expect(ui.props.alerts[0].history).toEqual(base[0].history); expect(ui.props.alerts[2].history).toEqual(base[2].history);
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.publish.mock.calls[0][1]).toBe(base);
  expect(ui.request).toHaveBeenCalledTimes(action === 'Resume selected' ? 1 : 0);
  if (action === 'Resume selected') expect(ui.request).toHaveBeenCalledWith('after-save');
});

it('ASUI2.MENU.POSITIVE: mixed selected statuses retain fixed labels and preview exact Pause eligibility', () => {
  const ui = setup([saved('a'), saved('b', 'paused'), saved('c', 'stopped')]), base = ui.props.alerts;
  ui.callButton('Select all shown'); open(ui); expect(all(menu(ui), node => node.props.role === 'menuitem').map(text)).toEqual(actions);
  choose(ui, 'Pause selected'); expect(text(previews(ui)[0])).toContain('3 selected; 1 eligible; 2 unchanged.');
  ui.callButton('Apply pause'); expect(ui.props.alerts.map(row => row.status)).toEqual(['paused', 'paused', 'stopped']);
  expect(ui.props.alerts[1]).toBe(base[1]); expect(ui.props.alerts[2]).toBe(base[2]); expect(ui.publish).toHaveBeenCalledTimes(1);
});

it('ASUI2.MENU.CONSENT: Cancel and Escape retain exact histories, then Confirm deletes only the selected rows', () => {
  const ui = setup(), base = ui.props.alerts, before = structuredClone(base); selectAC(ui); open(ui); choose(ui, 'Delete selected');
  expect(text(previews(ui)[0])).toContain('Delete these alerts and 4 retained local trigger records?');
  ui.callButton('Cancel'); expect(ui.props.alerts).toBe(base); expect(base).toEqual(before); expect(ui.selected()).toEqual(['a', 'c']);
  expect(focusDocument.activeElement?.getAttribute('aria-label')).toBe('More alert actions for SYNTHETIC a');
  open(ui); choose(ui, 'Delete selected'); ui.escape(); expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled();
  open(ui); choose(ui, 'Delete selected'); ui.callButton('Confirm delete selected');
  expect(ui.props.alerts).toEqual([base[1]]); expect(ui.props.alerts[0]).toBe(base[1]); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).not.toHaveBeenCalled();
});

it.each(['Escape', 'Cancel pause', 'Cancel delete'] as const)('ASUI2.MENU.ANCHOR: %s returning to the selected row preserves the prior C pointer anchor', exit => {
  const ui = setup(['a', 'b', 'c', 'd', 'e'].map(id => saved(id))), base = ui.props.alerts;
  selectAC(ui); open(ui, 'a', 'context');
  if (exit === 'Escape') keyMenu(ui, 'Escape');
  else { choose(ui, exit === 'Cancel pause' ? 'Pause selected' : 'Delete selected'); ui.callButton('Cancel'); }
  expect(focusDocument.activeElement?.getAttribute('data-alert-id')).toBe('a'); expect(ui.selected()).toEqual(['a', 'c']);
  const row = ui.row('d'), node = ui.nodeFor(row), down = input(node, { pointerId: 43, button: 0, buttons: 1, shiftKey: true });
  dispatchDocument('pointerdown', { ...down, currentTarget: focusDocument }); invoke(node.props.onPointerDown, down);
  node.focus(); ui.settle();
  const up = input(node, { pointerId: 43, button: 0, buttons: 0, shiftKey: true });
  dispatchDocument('pointerup', { ...up, currentTarget: focusDocument }); invoke(node.props.onPointerUp, up);
  invoke(node.props.onClick, input(node, { button: 0, shiftKey: true, nativeEvent: { isComposing: false, pointerId: 43 } })); ui.settle();
  expect(ui.selected()).toEqual(['a', 'c', 'd']); expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ASUI2.MENU.REPLACEMENT: a retained selected item cannot borrow a replacement row menu or close it', () => {
  const ui = setup(); selectAC(ui); open(ui); const old = keep(ui, menuItem(ui, 'Delete selected'));
  open(ui, 'b'); const replacement = ui.nodeFor(menu(ui)), beforeStatus = statuses(ui); replay(ui, old);
  expect(menu(ui).props['aria-label']).toBe('Actions for SYNTHETIC b'); expect(ui.nodeFor(menu(ui))).toBe(replacement);
  expect(statuses(ui)).toEqual(beforeStatus); expect(previews(ui)).toEqual([]); expect(ui.publish).not.toHaveBeenCalled();
});

it('ASUI2.MENU.REPLACEMENT: retained selected preview Cancel and Apply cannot affect a later row menu', () => {
  const ui = setup(); selectAC(ui); open(ui); choose(ui, 'Pause selected');
  const oldCancel = keep(ui, ui.button('Cancel')), oldApply = keep(ui, ui.button('Apply pause'));
  ui.callButton('Cancel'); open(ui, 'b'); replay(ui, oldCancel); replay(ui, oldApply);
  expect(menu(ui).props['aria-label']).toBe('Actions for SYNTHETIC b'); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.alerts.map(row => row.status)).toEqual(['active', 'active', 'active']);
});

function interruptPreparation(ui: UI, kind: 'menu' | 'confirmation') {
  if (kind === 'menu') { open(ui, 'b'); ui.escape(); }
  else {
    ui.rowButton('b', 'Delete');
    const rowConfirmation = ui.find(node => node.props.role === 'alertdialog' && node.props['aria-label'] === 'Delete local alert');
    ui.callButton('Cancel', rowConfirmation);
  }
}

const abaCases = (['toolbar', 'menu'] as const).flatMap(origin =>
  (['menu', 'confirmation'] as const).flatMap(replacement =>
    (['clock', 'authority'] as const).flatMap(callback =>
      ([false, true] as const).map(throws => ({ origin, replacement, callback, throws })))));

it.each(abaCases)('ASUI2.PREPARE.ABA: $origin refuses $replacement open/close inside $callback, throws=$throws', ({ origin, replacement, callback, throws }) => {
  const ui = setup(), base = ui.props.alerts; selectAC(ui);
  if (origin === 'menu') open(ui);
  const control = origin === 'menu' ? menuItem(ui, 'Pause selected') : ui.button('Pause selected');
  const target = ui.nodeFor(control); target.focus();
  let entered = 0, observedStatuses: string[] | undefined, observedFocus: ModelNode | null | undefined;
  const reenter = () => {
    entered++;
    ui.checkCallback(() => {
      interruptPreparation(ui, replacement);
      expect(ui.selected()).toEqual(['a', 'c']); expect(menus(ui)).toEqual([]); expect(previews(ui)).toEqual([]);
      observedStatuses = statuses(ui); observedFocus = focusDocument.activeElement;
    });
    if (throws) throw new Error('SYNTHETIC retired preparation callback failed');
  };
  if (callback === 'clock') ui.readTime.mockImplementationOnce(() => { reenter(); return 120; });
  else ui.assertAuthority.mockImplementationOnce(() => { reenter(); });
  invoke(control.props.onClick, input(target)); ui.settle();
  expect(entered).toBe(1); expect(ui.callbackErrors).toEqual([]); expect(observedStatuses).toBeDefined();
  expect(previews(ui)).toEqual([]); expect(menus(ui)).toEqual([]); expect(statuses(ui)).toEqual(observedStatuses);
  expect(focusDocument.activeElement).toBe(observedFocus); expect(ui.selected()).toEqual(['a', 'c']); expect(ui.props.alerts).toBe(base);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it.each(['toolbar', 'menu'] as const)('ASUI2.PREPARE.REPLACEMENT: %s callback leaves a new row confirmation and old catch cannot clear or message it', origin => {
  const ui = setup(); selectAC(ui); if (origin === 'menu') open(ui);
  const control = origin === 'menu' ? menuItem(ui, 'Pause selected') : ui.button('Pause selected'), node = ui.nodeFor(control); node.focus();
  let currentNode: ModelNode | undefined, currentStatus: string[] | undefined, entered = 0;
  ui.readTime.mockImplementationOnce(() => {
    entered++; ui.checkCallback(() => { ui.rowButton('b', 'Delete'); const current = ui.find(item => item.props['aria-label'] === 'Delete local alert'); currentNode = ui.nodeFor(current); currentStatus = statuses(ui); });
    throw new Error('SYNTHETIC stale clock failed after replacement');
  });
  invoke(control.props.onClick, input(node)); ui.settle();
  expect(entered).toBe(1); expect(ui.callbackErrors).toEqual([]); expect(currentNode).toBeDefined();
  const current = ui.find(item => item.props['aria-label'] === 'Delete local alert'); expect(ui.nodeFor(current)).toBe(currentNode);
  expect(statuses(ui)).toEqual(currentStatus); expect(previews(ui)).toEqual([]); expect(ui.publish).not.toHaveBeenCalled();
});
