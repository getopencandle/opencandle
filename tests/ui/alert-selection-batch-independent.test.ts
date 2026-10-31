import { expect, it, vi } from 'vitest';
import { validateLocalAlerts, type LocalAlert } from '../../src/domain/alerts';
import { all, bindRef, focusDocument, input, invoke, ModelNode, notice, saved, setup, text, type Store } from '../helpers/alert-dialog-harness';

// A bounded retention oracle for the controlled hook model. It observes only
// refs holding this exact publication's two arrays, directly or through pending
// batch focus. It neither addresses private hook indices nor claims a heap test;
// the current saved alerts must of course continue to retain the accepted data.
function publicationRefs(owner: Store, base: LocalAlert[], candidate: LocalAlert[]): Array<{ current: unknown }> {
  const receipt = (value: unknown): boolean => !!value && typeof value === 'object' && 'base' in value && 'candidate' in value && value.base === base && value.candidate === candidate;
  return owner.cells.filter((cell): cell is { current: unknown } => !!cell && typeof cell === 'object' && 'current' in cell).filter(cell => {
    const value = cell.current;
    return receipt(value) || !!value && typeof value === 'object' && 'kind' in value && value.kind === 'batch-result' && 'receipt' in value && receipt(value.receipt);
  });
}

it('ALERT.SELECTION.UI.CHECKBOX: a/c selection follows displayed order and stores no alert data', () => {
  const ui = setup(), before = structuredClone(ui.props.alerts), base = ui.props.alerts;
  ui.toggle('c'); ui.toggle('a');
  expect(ui.selected()).toEqual(['a', 'c']); expect(ui.text()).toContain('2 selected');
  expect(focusDocument.activeElement?.getAttribute('aria-label')).toBe('Select alert SYNTHETIC a');
  ui.callButton('Clear selection'); expect(ui.selected()).toEqual([]);
  expect(ui.props.alerts).toBe(base); expect(ui.props.alerts).toEqual(before); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ALERT.SELECTION.UI.SHOWN_SCOPE: an empty shown scope disables selection and cannot prepare a batch', () => {
  const ui = setup(), base = ui.props.alerts; ui.change('Search alerts', 'SYNTHETIC no matching alert');
  const control = ui.button('Select all shown'); expect(control.props.disabled).toBe(true);
  invoke(control.props.onClick, input(ui.nodeFor(control))); ui.settle();
  expect(ui.selected()).toEqual([]); expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled();
  for (const name of ['Pause selected', 'Resume selected', 'Delete selected']) expect(ui.button(name).props.disabled).toBe(true);
});

it('ALERT.SELECTION.UI.SHOWN_SCOPE: missing mutation authority leaves pure selection usable but refuses every batch entry', () => {
  const ui = setup(), base = ui.props.alerts; ui.props.managerActionAuthority = undefined; ui.settle();
  ui.toggle('a'); expect(ui.selected()).toEqual(['a']);
  for (const name of ['Pause selected', 'Resume selected', 'Delete selected']) {
    const control = ui.button(name); expect(control.props.disabled).toBe(true); invoke(control.props.onClick, input(ui.nodeFor(control))); ui.settle();
  }
  expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
  expect(all(ui.render(), node => node.props['aria-label'] === 'Selected alert action preview' || node.props['aria-label'] === 'Delete selected local alerts')).toEqual([]);
});

it('ALERT.SELECTION.UI.SHOWN_SCOPE: duplicate saved IDs disable selection without normalizing malformed external props', () => {
  const ui = setup(), duplicate = structuredClone(ui.props.alerts[0]);
  // Deliberately malformed incoming props, not an admitted saved collection.
  ui.props.alerts = [ui.props.alerts[0], duplicate, ui.props.alerts[2]]; const base = ui.props.alerts; ui.settle();
  const control = ui.button('Select all shown'); expect(control.props.disabled).toBe(true); invoke(control.props.onClick, input(ui.nodeFor(control))); ui.settle();
  expect(ui.selected()).toEqual([]); expect(ui.props.alerts).toBe(base); expect(ui.props.alerts).toHaveLength(3); expect(ui.publish).not.toHaveBeenCalled();
});

it('ALERT.SELECTION.UI.SHOWN_SCOPE: Select all shown excludes hidden mode rows and survives no implicit full-list command', () => {
  const hidden = saved('hidden'); hidden.definition.mode = 'replay'; hidden.definition.runId = 'SYNTHETIC replay'; hidden.history.forEach(item => { item.mode = 'replay'; item.runId = 'SYNTHETIC replay'; });
  const ui = setup([saved('c'), hidden, saved('a')]), base = ui.props.alerts;
  ui.change('Alert mode filter', 'ordinary'); ui.change('Sort alerts by', 'name'); ui.change('Alert sort direction', 'desc'); ui.callButton('Select all shown');
  expect(ui.selected()).toEqual(['c', 'a']); ui.callButton('Pause selected'); ui.callButton('Apply pause');
  expect(ui.props.alerts.map(row => [row.definition.id, row.status])).toEqual([['c', 'paused'], ['hidden', 'active'], ['a', 'paused']]);
  expect(ui.props.alerts[1]).toBe(base[1]); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.publish.mock.calls[0][1]).toBe(base);
});

it('ALERT.BATCH.UI.MIXED: Pause changes only active/waiting rows, preserves every lifecycle and latest history', () => {
  const ui = setup([saved('a'), saved('w', 'waiting-for-data'), saved('p', 'paused'), saved('s', 'stopped'), saved('e', 'expired', 120)]);
  ui.callButton('Select all shown'); ui.callButton('Pause selected');
  const preview = ui.find(node => node.props.role === 'region' && node.props['aria-label'] === 'Selected alert action preview');
  expect(text(preview)).toContain('5 selected; 2 eligible; 3 unchanged.');
  expect(all(preview, node => node.type === 'li').map(text)).toEqual(['already paused: 1', 'stopped: 1', 'expired: 1']);
  const changed = { ...ui.props.alerts[0], history: [...ui.props.alerts[0].history, notice('a', 10, 120)], lastTime: 120, lastSequence: 10, lastTriggeredAt: 120, lastTriggeredBar: 'SYNTHETIC bar 10' };
  const base = [changed, ...ui.props.alerts.slice(1)]; ui.props.alerts = base; ui.settle(); ui.callButton('Apply pause');
  expect(ui.props.alerts.map(row => [row.definition.id, row.status])).toEqual([['a', 'paused'], ['w', 'paused'], ['p', 'paused'], ['s', 'stopped'], ['e', 'expired']]);
  expect(ui.props.alerts[0]).toEqual({ ...changed, status: 'paused', lastValue: null, previousClosedValue: null, currentBarId: null, closedBars: [] });
  expect(ui.props.alerts[1]).toEqual({ ...base[1], status: 'paused', lastValue: null, previousClosedValue: null, currentBarId: null, closedBars: [] });
  for (const index of [2, 3, 4]) expect(ui.props.alerts[index]).toBe(base[index]);
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.publish.mock.calls[0][1]).toBe(base); expect(ui.request).not.toHaveBeenCalled();
});

it('ALERT.BATCH.UI.MIXED: Resume skips due/stopped/expired and requests one observation after acceptance', () => {
  const ui = setup([saved('p', 'paused', 121), saved('due', 'paused', 120), saved('a'), saved('w', 'waiting-for-data'), saved('s', 'stopped'), saved('e', 'expired', 120)]), base = ui.props.alerts;
  ui.callButton('Select all shown'); ui.callButton('Resume selected');
  const preview = ui.find(node => node.props.role === 'region' && node.props['aria-label'] === 'Selected alert action preview');
  expect(text(preview)).toContain('6 selected; 1 eligible; 5 unchanged.');
  expect(all(preview, node => node.type === 'li').map(text)).toEqual(['expiration due: 1', 'already active: 1', 'waiting for data: 1', 'stopped: 1', 'expired: 1']);
  ui.callButton('Apply resume');
  expect(ui.props.alerts.map(row => [row.definition.id, row.status])).toEqual([['p', 'active'], ['due', 'paused'], ['a', 'active'], ['w', 'waiting-for-data'], ['s', 'stopped'], ['e', 'expired']]);
  expect(ui.props.alerts[0]).toEqual({ ...base[0], status: 'active', lastValue: null, previousClosedValue: null, currentBarId: null, closedBars: [] });
  for (let index = 1; index < base.length; index++) expect(ui.props.alerts[index]).toBe(base[index]);
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).toHaveBeenCalledTimes(1); expect(ui.request).toHaveBeenCalledWith('after-save');
});

it.each([['Pause selected', 'Apply pause', 'paused'], ['Resume selected', 'Apply resume', 'stopped']] as const)('ALERT.BATCH.UI.MIXED: zero-eligible %s cannot mutate even through retained Apply', (action, apply, status) => {
  const ui = setup([saved('a', status)]), base = ui.props.alerts; ui.toggle('a'); ui.callButton(action);
  const button = ui.button(apply); expect(button.props.disabled).toBe(true); invoke(button.props.onClick, input(ui.nodeFor(button))); ui.settle();
  expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ALERT.BATCH.UI.CLOCK: fresh expiry boundary at121 retires a Resume prepared at120 despite rendered100', () => {
  const ui = setup([saved('p', 'paused', 121)]), base = ui.props.alerts; ui.toggle('p'); ui.callButton('Resume selected');
  const control = ui.button('Apply resume'), retained = control.props.onClick, origin = ui.nodeFor(control);
  ui.setClock(121); invoke(retained, input(origin)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); expect(ui.props.alerts).toBe(base);
  expect(ui.readTime.mock.results.some(result => result.type === 'return' && result.value === 121)).toBe(true);
});

it.each([NaN, Infinity, 120.25, -1, 118])('ALERT.BATCH.UI.CLOCK: invalid or backward Resume dispatch clock %s never publishes', value => {
  const ui = setup([saved('p', 'paused')]); ui.toggle('p'); ui.callButton('Resume selected');
  const control = ui.button('Apply resume'), origin = ui.nodeFor(control); ui.setClock(value); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); expect(ui.props.alerts[0].status).toBe('paused');
});

it.each([['Pause selected', 'Apply pause'], ['Delete selected', 'Confirm delete selected']] as const)('ALERT.BATCH.UI.CLOCK: %s retains its safe-clock policy when dispatch moves backwards', (action, apply) => {
  const ui = setup(); ui.toggle('a'); ui.callButton(action);
  const control = ui.button(apply), origin = ui.nodeFor(control); ui.setClock(0); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).not.toHaveBeenCalled();
  if (action === 'Pause selected') expect(ui.props.alerts[0].status).toBe('paused');
  else expect(ui.props.alerts.map(row => row.definition.id)).toEqual(['b', 'c']);
});

it('ALERT.BATCH.UI.CLOCK: throwing dispatch clock consumes no publisher or observation call', () => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected'); const control = ui.button('Apply pause'), origin = ui.nodeFor(control);
  ui.readTime.mockImplementationOnce(() => { throw new Error('SYNTHETIC clock unavailable'); }); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); expect(ui.props.alerts[0].status).toBe('active');
});

it('ALERT.BATCH.UI.CLOCK: preparation rechecks live authority after the clock revokes it without a child render', () => {
  const ui = setup(); ui.toggle('a'); const control = ui.button('Pause selected'), origin = ui.nodeFor(control);
  origin.focus(); const calls = ui.assertAuthority.mock.calls.length;
  ui.readTime.mockImplementationOnce(() => { ui.readiness(false); return 120; });
  invoke(control.props.onClick, input(origin));
  // Observe this synchronous callback boundary before a render could notice the
  // revoked source independently and accidentally make a missing guard pass.
  expect(ui.assertAuthority.mock.results.slice(calls).map(result => result.type)).toEqual(['return', 'throw']);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
  ui.settle(); expect(all(ui.render(), node => node.props['aria-label'] === 'Selected alert action preview')).toEqual([]);
});

it('ALERT.BATCH.UI.CLOCK: the first live-preview render refuses authority revoked inside its clock callback', () => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected'); const calls = ui.assertAuthority.mock.calls.length;
  ui.readTime.mockImplementationOnce(() => { ui.readiness(false); return 120; });
  const firstTree = ui.render();
  expect(ui.assertAuthority.mock.results.slice(calls).map(result => result.type)).toEqual(['return', 'throw']);
  expect(all(firstTree, node => node.props['aria-label'] === 'Selected alert action preview')).toEqual([]);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); expect(ui.props.alerts[0].status).toBe('active');
});

it('ALERT.BATCH.UI.CLOCK: Apply never publishes when its clock silently revokes the upstream authority', () => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected'); const control = ui.button('Apply pause'), origin = ui.nodeFor(control), base = ui.props.alerts;
  const calls = ui.assertAuthority.mock.calls.length;
  ui.readTime.mockImplementationOnce(() => { ui.readiness(false); return 120; });
  invoke(control.props.onClick, input(origin));
  expect(ui.assertAuthority.mock.results.slice(calls).map(result => result.type)).toEqual(['return', 'throw']);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); expect(ui.props.alerts).toBe(base);
  ui.settle(); expect(ui.props.alerts[0].status).toBe('active');
});

it('ALERT.BATCH.UI.CONSENT: Delete Cancel and Escape preserve selection/history; Confirm deletes exact selected rows', () => {
  const ui = setup(), base = ui.props.alerts, before = structuredClone(base); ui.toggle('a'); ui.toggle('c'); ui.callButton('Delete selected');
  const preview = ui.find(node => node.props.role === 'alertdialog' && node.props['aria-label'] === 'Delete selected local alerts');
  expect(all(preview, node => node.type === 'p').map(text)).toEqual(['2 selected; 2 eligible; 0 unchanged.', 'SYNTHETIC a, SYNTHETIC c', 'Delete these alerts and 4 retained local trigger records?']);
  expect(text(focusDocument.activeElement?.props.children)).toBe('Cancel');
  ui.callButton('Cancel'); expect(ui.selected()).toEqual(['a', 'c']); expect(ui.props.alerts).toEqual(before);
  ui.callButton('Delete selected'); ui.escape(); expect(ui.selected()).toEqual(['a', 'c']); expect(ui.publish).not.toHaveBeenCalled();
  ui.callButton('Delete selected'); ui.callButton('Confirm delete selected');
  expect(ui.props.alerts).toEqual([base[1]]); expect(ui.props.alerts[0]).toBe(base[1]); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).not.toHaveBeenCalled();
});

it.each(['substitution', 'reorder'] as const)('ALERT.BATCH.UI.CONSENT: same-count selected-history %s permanently retires old deletion consent', kind => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Delete selected');
  const control = ui.button('Confirm delete selected'), origin = ui.nodeFor(control), retained = control.props.onClick, old = ui.props.alerts;
  const history = kind === 'reorder' ? [...old[0].history].reverse() : old[0].history.map((item, index) => index ? { ...item, id: 'SYNTHETIC corrected identity' } : item);
  ui.props.alerts = [{ ...old[0], history }, ...old.slice(1)]; ui.settle(); ui.props.alerts = old; ui.settle(); invoke(retained, input(origin)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.alerts).toBe(old);
});

it('ALERT.BATCH.UI.CONSENT: unselected history append is retained in the single exact latest-base publication', () => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Delete selected');
  const latest = [ui.props.alerts[0], { ...ui.props.alerts[1], lastSequence: 10, lastTime: 120, lastTriggeredAt: 120, lastTriggeredBar: 'SYNTHETIC bar 10', history: [...ui.props.alerts[1].history, notice('b', 10, 120)] }, ui.props.alerts[2]];
  expect(validateLocalAlerts(latest).ok).toBe(true);
  ui.props.alerts = latest; ui.settle(); ui.callButton('Confirm delete selected');
  expect(ui.publish.mock.calls[0][1]).toBe(latest); expect(ui.props.alerts).toEqual([latest[1], latest[2]]); expect(ui.props.alerts[0]).toBe(latest[1]);
});

it.each(['status', 'definition', 'armedAt'] as const)('ALERT.SELECTION.UI.RETIRE: observed same-revision %s ABA cannot revive prepared Pause', kind => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected');
  const control = ui.button('Apply pause'), retained = control.props.onClick, origin = ui.nodeFor(control), old = ui.props.alerts;
  const changed = kind === 'status' ? { ...old[0], status: 'paused' as const } : kind === 'definition' ? { ...old[0], definition: { ...old[0].definition, message: 'SYNTHETIC changed basis' } } : { ...old[0], armedAt: 101 };
  ui.props.alerts = [changed, ...old.slice(1)]; ui.settle(); ui.props.alerts = old; ui.settle(); invoke(retained, input(origin)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.alerts).toBe(old);
});

it.each(['filter', 'sort', 'authority', 'close'] as const)('ALERT.SELECTION.UI.RETIRE: %s retirement prevents a retained checkbox from borrowing a newer same-ID view', kind => {
  const ui = setup(); ui.toggle('b'); const old = ui.checkbox('a'), origin = ui.nodeFor(old);
  if (kind === 'filter') ui.change('Search alerts', 'SYNTHETIC c');
  else if (kind === 'sort') ui.change('Sort alerts by', 'original');
  else if (kind === 'authority') { ui.replaceAuthority(); ui.settle(); }
  else { ui.props.open = false; ui.settle(); ui.props.open = true; ui.settle(); }
  const before = ui.selected(); origin.nativeChecked = true; invoke(old.props.onChange, input(origin)); ui.settle();
  expect(ui.selected()).toEqual(before); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it.each(['foreign', 'disconnected', 'hidden', 'inert'] as const)('ALERT.SELECTION.UI.SHOWN_SCOPE: %s checkbox origin cannot select a matching saved ID', kind => {
  const ui = setup(), control = ui.checkbox('a'), real = ui.nodeFor(control), foreign = new ModelNode(); foreign.tag = 'input'; foreign.props = real.props;
  const origin = kind === 'foreign' ? foreign : real;
  if (kind === 'disconnected') real.isConnected = false;
  if (kind === 'hidden') real.parent!.props = { ...real.parent!.props, hidden: true };
  if (kind === 'inert') real.parent!.props = { ...real.parent!.props, inert: true };
  origin.nativeChecked = true;
  invoke(control.props.onChange, input(origin)); ui.settle();
  expect(ui.selected()).toEqual([]); expect(ui.publish).not.toHaveBeenCalled();
});

it('ALERT.SELECTION.UI.SHOWN_SCOPE: old row ref-null cannot delete a replacement registration or authorize its checkbox', () => {
  const ui = setup(), oldRow = ui.row('a'), oldCheckbox = ui.checkbox('a'), oldNode = ui.nodeFor(oldCheckbox);
  // Replacing a native row replaces its subtree too. Do not reuse an old
  // checkbox node and then mislabel its still-live native identity as stale.
  for (const key of ui.nodes.keys()) if (key === 'row:a' || key.startsWith('row:a.')) ui.nodes.delete(key);
  ui.settle(); bindRef(oldRow.props.ref, null);
  oldNode.nativeChecked = true; invoke(oldCheckbox.props.onChange, input(oldNode)); ui.settle(); expect(ui.selected()).toEqual([]);
  ui.toggle('a'); expect(ui.selected()).toEqual(['a']); expect(ui.publish).not.toHaveBeenCalled();
});

it('ALERT.SELECTION.UI.CHECKBOX: native checkbox change toggles once while bubbled Space and click do not navigate or edit', () => {
  const ui = setup(), row = ui.row('a'), rowNode = ui.nodeFor(row), control = ui.checkbox('a'), checkboxNode = ui.nodeFor(control);
  checkboxNode.focus(); checkboxNode.nativeChecked = true; invoke(control.props.onChange, input(checkboxNode));
  const key = input(rowNode, { target: checkboxNode, key: ' ' }); invoke(row.props.onKeyDown, key);
  invoke(row.props.onClick, input(rowNode, { target: checkboxNode })); invoke(row.props.onDoubleClick, input(rowNode, { target: checkboxNode })); ui.settle();
  expect(ui.selected()).toEqual(['a']); expect(focusDocument.activeElement).toBe(checkboxNode); expect(key.preventDefault).not.toHaveBeenCalled();
  expect(all(ui.render(), node => node.props['aria-label'] === 'Alert name')).toEqual([]); expect(ui.publish).not.toHaveBeenCalled();
});

it('ALERT.SELECTION.UI.RETIRE: selection alone survives admitted same-view history refresh, but Escape clears before closing', () => {
  const ui = setup(); ui.toggle('a'); const latest = [{ ...ui.props.alerts[0], lastSequence: 10, lastTime: 120, lastTriggeredAt: 120, lastTriggeredBar: 'SYNTHETIC bar 10', history: [...ui.props.alerts[0].history, notice('a', 10, 120)] }, ...ui.props.alerts.slice(1)];
  expect(validateLocalAlerts(latest).ok).toBe(true);
  ui.props.alerts = latest; ui.settle(); expect(ui.selected()).toEqual(['a']);
  ui.escape(); expect(ui.selected()).toEqual([]); expect(ui.props.onClose).not.toHaveBeenCalled(); expect(ui.props.alerts).toBe(latest);
  ui.escape(); expect(ui.props.onClose).toHaveBeenCalledTimes(1); expect(ui.publish).not.toHaveBeenCalled();
});

it('ALERT.SELECTION.UI.RETIRE: filter intent retires a checkbox synchronously before its first new render', () => {
  const ui = setup(), control = ui.checkbox('a'), origin = ui.nodeFor(control), filter = ui.field('Search alerts'), filterNode = ui.nodeFor(filter);
  invoke(filter.props.onChange, input(filterNode, { target: { value: 'SYNTHETIC c' } })); origin.nativeChecked = true; invoke(control.props.onChange, input(origin)); ui.settle();
  expect(ui.selected()).toEqual([]); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled();
});

it('ALERT.SELECTION.UI.RETIRE: effect cleanup makes retained checkbox and Apply handlers inert without late writes', () => {
  const ui = setup(), checkbox = ui.checkbox('b'), checkNode = ui.nodeFor(checkbox); ui.toggle('a'); ui.callButton('Pause selected');
  const apply = ui.button('Apply pause'), applyNode = ui.nodeFor(apply); ui.dispose(); const writes = ui.owner.writes;
  checkNode.nativeChecked = true; invoke(checkbox.props.onChange, input(checkNode)); invoke(apply.props.onClick, input(applyNode));
  expect(ui.owner.writes).toBe(writes); expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); expect(ui.props.alerts[0].status).toBe('active');
});

it('ALERT.BATCH.UI.CONSENT: row/batch replacement invalidates both retained Confirm and Cancel callbacks', () => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Delete selected');
  const oldConfirm = ui.button('Confirm delete selected'), confirmNode = ui.nodeFor(oldConfirm), oldCancel = ui.button('Cancel'), cancelNode = ui.nodeFor(oldCancel);
  ui.rowButton('b', 'Delete'); invoke(oldCancel.props.onClick, input(cancelNode)); invoke(oldConfirm.props.onClick, input(confirmNode)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled();
  const rowDialog = ui.find(node => node.props.role === 'alertdialog' && node.props['aria-label'] === 'Delete local alert');
  expect(all(rowDialog, node => node.type === 'button' && text(node) === 'Confirm delete')).toHaveLength(1);
  ui.callButton('Cancel', rowDialog); ui.callButton('Delete selected');
  invoke(oldCancel.props.onClick, input(cancelNode)); invoke(oldConfirm.props.onClick, input(confirmNode)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.button('Confirm delete selected')).toBeDefined();
});

it('ALERT.BATCH.UI.RECEIPT: explicit rejection preserves data but consumes old Apply rather than retrying it', () => {
  const ui = setup(), base = ui.props.alerts; ui.toggle('a'); ui.callButton('Pause selected');
  const control = ui.button('Apply pause'), origin = ui.nodeFor(control); ui.publishing(() => false);
  invoke(control.props.onClick, input(origin)); ui.settle(); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.alerts).toBe(base); expect(ui.request).not.toHaveBeenCalled(); expect(ui.text()).toMatch(/reject/i);
});

it.each([true, undefined])('ALERT.BATCH.UI.RECEIPT: acknowledged %s publication survives reentrant close and cannot be repeated', acknowledgment => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected');
  const control = ui.button('Apply pause'), origin = ui.nodeFor(control), close = ui.field('Close alerts'), closeNode = ui.nodeFor(close);
  ui.publishing((next, base) => {
    ui.checkCallback(() => expect(base).toBe(ui.props.alerts)); ui.props.alerts = next;
    invoke(control.props.onClick, input(origin)); invoke(close.props.onClick, input(closeNode)); return acknowledgment;
  });
  invoke(control.props.onClick, input(origin)); ui.settle(); invoke(control.props.onClick, input(origin));
  expect(ui.callbackErrors).toEqual([]); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.alerts[0].status).toBe('paused'); expect(ui.request).not.toHaveBeenCalled();
  expect(ui.props.onClose).toHaveBeenCalledTimes(1);
});

it.each([false, true])('ALERT.BATCH.UI.RECEIPT: throwing publisher (external mutation=%s) is indeterminate and never revives Apply', mutates => {
  const ui = setup(), base = ui.props.alerts; ui.toggle('a'); ui.callButton('Pause selected');
  const control = ui.button('Apply pause'), origin = ui.nodeFor(control);
  ui.publishing(next => { if (mutates) ui.props.alerts = next; throw new Error('SYNTHETIC publisher acknowledgment lost'); });
  invoke(control.props.onClick, input(origin)); ui.settle(); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.alerts[0].status).toBe(mutates ? 'paused' : 'active');
  if (!mutates) expect(ui.props.alerts).toBe(base);
  expect(ui.text()).toMatch(/indeterminate|unknown|uncertain|could not confirm/i); expect(ui.request).not.toHaveBeenCalled();
});

it.each([null, 1, 'accepted', Promise.resolve(true)])('ALERT.BATCH.UI.RECEIPT: nonconforming return %s is indeterminate, never acceptance or retry', acknowledgment => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected');
  const control = ui.button('Apply pause'), origin = ui.nodeFor(control); ui.publishing(() => acknowledgment);
  invoke(control.props.onClick, input(origin)); ui.settle(); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.alerts[0].status).toBe('active'); expect(ui.request).not.toHaveBeenCalled();
  expect(ui.text()).toMatch(/indeterminate|unknown|uncertain|could not confirm/i);
});

it.each([true, undefined])('ALERT.BATCH.UI.RECEIPT: accepted Resume %s remains committed when after-save observation throws', acknowledgment => {
  const ui = setup([saved('p', 'paused')]); ui.toggle('p'); ui.callButton('Resume selected');
  const control = ui.button('Apply resume'), origin = ui.nodeFor(control); ui.publishing(next => { ui.props.alerts = next; return acknowledgment; });
  ui.request.mockImplementation(() => { throw new Error('SYNTHETIC after-save unavailable'); });
  invoke(control.props.onClick, input(origin)); ui.settle(); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.props.alerts[0].status).toBe('active'); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).toHaveBeenCalledTimes(1);
  expect(ui.text()).not.toMatch(/save.*reject|change.*reject/i);
});

it.each(['synchronous', 'deferred'] as const)('ALERT.BATCH.UI.RECEIPT: %s accepted candidate filter disappearance preserves acceptance and one resume request', timing => {
  const ui = setup([saved('p', 'paused'), saved('hidden')]); ui.change('Alert status filter', 'paused'); ui.toggle('p'); ui.callButton('Resume selected');
  ui.publishing(next => { ui.props.alerts = next; if (timing === 'synchronous') ui.render(); return true; });
  ui.callButton('Apply resume');
  expect(ui.props.alerts.map(row => [row.definition.id, row.status])).toEqual([['p', 'active'], ['hidden', 'active']]);
  expect(ui.selected()).toEqual([]); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).toHaveBeenCalledTimes(1); expect(ui.request).toHaveBeenCalledWith('after-save');
  expect(ui.text()).not.toMatch(/reject|indeterminate/i);
});

it('ALERT.BATCH.UI.RECEIPT: candidate to third same-membership array to candidate cannot resurrect accepted follow-up or focus', () => {
  const ui = setup([saved('p', 'paused'), saved('b')]); ui.toggle('p'); ui.callButton('Resume selected');
  ui.publishing(next => {
    ui.props.alerts = next; ui.render();
    const intervening = structuredClone(next); ui.props.alerts = intervening; ui.render();
    ui.props.alerts = next; ui.render(); return true;
  });
  ui.callButton('Apply resume');
  expect(ui.props.alerts.map(row => [row.definition.id, row.status])).toEqual([['p', 'active'], ['b', 'active']]);
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).not.toHaveBeenCalled();
  expect(focusDocument.activeElement).toBe(focusDocument.body);
  expect(text(ui.find(node => node.type === 'output' && node.props.role === 'status'))).not.toMatch(/reject|indeterminate|unknown/i);
});

it.each([false, true])('ALERT.BATCH.UI.RECEIPT: accepted receipt releases old histories after own candidate is observed and follow-up/focus finish (observation throws=%s)', throws => {
  const ui = setup([saved('p', 'paused'), saved('b')]), base = ui.props.alerts; ui.toggle('p'); ui.callButton('Resume selected');
  const control = ui.button('Apply resume'), origin = ui.nodeFor(control); origin.focus();
  if (throws) ui.request.mockImplementation(() => { throw new Error('SYNTHETIC observation follow-up unavailable'); });
  invoke(control.props.onClick, input(origin));
  const candidate = ui.publish.mock.calls[0][0], retainedBeforeObservation = publicationRefs(ui.owner, base, candidate);
  expect(candidate).toBe(ui.props.alerts); expect(retainedBeforeObservation.length).toBeGreaterThan(0);
  expect(ui.request).toHaveBeenCalledTimes(1); expect(ui.props.alerts[0].status).toBe('active');
  // The exact candidate has not reached a child render yet. Its receipt stays
  // alive until that render; the existing deferred-disappearance case protects
  // the corresponding acceptance exception. Final focus may be skipped on throw.
  ui.settle();
  expect(publicationRefs(ui.owner, base, candidate)).toEqual([]);
  expect(retainedBeforeObservation.every(ref => ref.current === null)).toBe(true);
  expect(ui.props.alerts).toBe(candidate); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).toHaveBeenCalledTimes(1);
});

it('ALERT.BATCH.UI.RECEIPT: a new row-delete owner releases a pending batch receipt and receives its own Cancel focus', () => {
  const ui = setup(), base = ui.props.alerts; ui.toggle('a'); ui.callButton('Pause selected');
  const remove = ui.button('Delete', ui.row('b')), removeNode = ui.nodeFor(remove), apply = ui.button('Apply pause'), applyNode = ui.nodeFor(apply);
  applyNode.focus(); invoke(apply.props.onClick, input(applyNode)); const candidate = ui.publish.mock.calls[0][0];
  expect(publicationRefs(ui.owner, base, candidate).length).toBeGreaterThan(0);
  removeNode.focus(); invoke(remove.props.onClick, input(removeNode));
  expect(publicationRefs(ui.owner, base, candidate)).toEqual([]);
  ui.settle(); const confirmation = ui.find(node => node.props.role === 'alertdialog' && node.props['aria-label'] === 'Delete local alert');
  const cancel = ui.button('Cancel', confirmation), cancelNode = ui.nodeFor(cancel);
  expect(focusDocument.activeElement).toBe(cancelNode); invoke(apply.props.onClick, input(applyNode)); ui.settle();
  expect(ui.button('Confirm delete', ui.find(node => node.props.role === 'alertdialog' && node.props['aria-label'] === 'Delete local alert'))).toBeDefined();
  expect(focusDocument.activeElement).toBe(cancelNode); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).not.toHaveBeenCalled();
  expect(ui.props.alerts).toBe(candidate); expect(ui.props.alerts.map(row => row.definition.id)).toEqual(['a', 'b', 'c']);
});

it('ALERT.BATCH.UI.RECEIPT: explicit reentrant filter change suppresses old follow-up even with the exact accepted candidate', () => {
  const ui = setup([saved('p', 'paused'), saved('hidden')]); ui.toggle('p'); ui.callButton('Resume selected');
  const filter = ui.field('Search alerts'), target = ui.nodeFor(filter);
  ui.publishing(next => { ui.props.alerts = next; invoke(filter.props.onChange, input(target, { target: { value: 'SYNTHETIC hidden' } })); ui.render(); return true; });
  ui.callButton('Apply resume');
  expect(ui.props.alerts[0].status).toBe('active'); expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.request).not.toHaveBeenCalled();
  expect(ui.field('Search alerts').props.value).toBe('SYNTHETIC hidden');
});

it('ALERT.BATCH.UI.CLOCK: dispatch clock reentry closes the owner before any stale mutation', () => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected');
  const apply = ui.button('Apply pause'), origin = ui.nodeFor(apply), close = ui.field('Close alerts'), closeNode = ui.nodeFor(close);
  ui.readTime.mockImplementationOnce(() => { invoke(close.props.onClick, input(closeNode)); return 120; });
  invoke(apply.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); expect(ui.props.alerts[0].status).toBe('active');
});

it('ALERT.BATCH.UI.CLOCK: an old render-time clock refusal cannot clear a replacement delete preview', () => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected');
  const oldApply = ui.button('Apply pause'), applyNode = ui.nodeFor(oldApply), oldCancel = ui.button('Cancel'), cancelNode = ui.nodeFor(oldCancel), remove = ui.button('Delete selected'), removeNode = ui.nodeFor(remove);
  ui.readTime.mockImplementationOnce(() => {
    invoke(oldCancel.props.onClick, input(cancelNode)); removeNode.focus(); invoke(remove.props.onClick, input(removeNode));
    throw new Error('SYNTHETIC retired preview clock failed after replacement');
  });
  ui.settle();
  expect(ui.button('Confirm delete selected')).toBeDefined();
  expect(ui.text()).not.toContain('SYNTHETIC retired preview clock failed after replacement');
  invoke(oldApply.props.onClick, input(applyNode)); ui.settle(); expect(ui.publish).not.toHaveBeenCalled();
  ui.callButton('Confirm delete selected'); expect(ui.props.alerts.map(row => row.definition.id)).toEqual(['b', 'c']); expect(ui.publish).toHaveBeenCalledTimes(1);
});

it.each(['publisher', 'observation', 'clock', 'source'] as const)('ALERT.BATCH.UI.RECEIPT: observed %s authority replacement cannot revive an old prepared action after ABA', kind => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected'); const apply = ui.button('Apply pause'), origin = ui.nodeFor(apply);
  const original = { publisher: ui.props.onAlertsChange, observation: ui.props.onRequestObservation, clock: ui.props.readActionTime, source: ui.props.sourceSelectionKey };
  const otherPublisher = vi.fn(() => true), otherObservation = vi.fn();
  if (kind === 'publisher') ui.props.onAlertsChange = otherPublisher;
  else if (kind === 'observation') ui.props.onRequestObservation = otherObservation;
  else if (kind === 'clock') ui.props.readActionTime = () => 120;
  else ui.props.sourceSelectionKey = 'SYNTHETIC replacement basis';
  ui.settle();
  ui.props.onAlertsChange = original.publisher; ui.props.onRequestObservation = original.observation; ui.props.readActionTime = original.clock; ui.props.sourceSelectionKey = original.source;
  ui.settle(); invoke(apply.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(otherPublisher).not.toHaveBeenCalled(); expect(ui.request).not.toHaveBeenCalled(); expect(otherObservation).not.toHaveBeenCalled();
  expect(ui.props.alerts[0].status).toBe('active');
});

it('ALERT.BATCH.UI.RECEIPT: readiness refusal retires a prepared action even when authority later becomes ready again', () => {
  const ui = setup(); ui.toggle('a'); ui.callButton('Pause selected');
  const apply = ui.button('Apply pause'), origin = ui.nodeFor(apply); ui.readiness(false); ui.settle(); ui.readiness(true); ui.settle(); invoke(apply.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.props.alerts[0].status).toBe('active');
});

it('ALERT.BATCH.UI.RECEIPT: row-delete false alone restores a new confirmation and retains historical rejected-save behavior', () => {
  const ui = setup(), base = ui.props.alerts; ui.rowButton('a', 'Delete');
  const control = ui.button('Confirm delete'), origin = ui.nodeFor(control); ui.publishing(() => false);
  invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.props.alerts).toBe(base); expect(ui.button('Confirm delete')).toBeDefined(); expect(ui.text()).toMatch(/reject/i);
  invoke(control.props.onClick, input(origin)); ui.settle(); expect(ui.publish).toHaveBeenCalledTimes(1);
});

it('ALERT.BATCH.UI.RECEIPT: row-delete throw after parent mutation never restores retry authority', () => {
  const ui = setup(); ui.rowButton('a', 'Delete'); const control = ui.button('Confirm delete'), origin = ui.nodeFor(control);
  ui.publishing(next => { ui.props.alerts = next; throw new Error('SYNTHETIC parent changed before throw'); });
  invoke(control.props.onClick, input(origin)); ui.settle(); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.props.alerts.map(row => row.definition.id)).toEqual(['b', 'c']); expect(ui.publish).toHaveBeenCalledTimes(1);
  expect(all(ui.render(), node => node.type === 'button' && text(node) === 'Confirm delete')).toEqual([]);
});

it.each([Promise.resolve(true), null])('ALERT.BATCH.UI.RECEIPT: row-delete nonconforming return %s consumes confirmation', acknowledgment => {
  const ui = setup(); ui.rowButton('a', 'Delete'); const control = ui.button('Confirm delete'), origin = ui.nodeFor(control);
  ui.publishing(() => acknowledgment); invoke(control.props.onClick, input(origin)); ui.settle(); invoke(control.props.onClick, input(origin)); ui.settle();
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.alerts.map(row => row.definition.id)).toEqual(['a', 'b', 'c']);
  expect(all(ui.render(), node => node.type === 'button' && text(node) === 'Confirm delete')).toEqual([]);
});

it('ALERT.BATCH.UI.RECEIPT: row-delete acceptance followed by close cannot restore or retry a removed target', () => {
  const ui = setup(); ui.rowButton('a', 'Delete'); const control = ui.button('Confirm delete'), origin = ui.nodeFor(control), close = ui.field('Close alerts'), closeNode = ui.nodeFor(close);
  ui.publishing(next => { ui.props.alerts = next; invoke(close.props.onClick, input(closeNode)); return true; });
  invoke(control.props.onClick, input(origin)); ui.settle(); invoke(control.props.onClick, input(origin));
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.alerts.map(row => row.definition.id)).toEqual(['b', 'c']);
});
