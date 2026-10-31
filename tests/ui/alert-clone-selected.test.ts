import { expect, it } from 'vitest';
import { all, input, invoke, saved, setup, text } from '../helpers/alert-dialog-harness';
import { validateLocalAlerts } from '../../src/domain/alerts';

// Actual AlertDialog toolbar/menu/preview callbacks through the shared controlled
// hook/node model. No native pointer, focus, packaged GUI or reference claim.
type UI = ReturnType<typeof setup>;
const preview = (ui: UI) => all(ui.render(), node => node.props['aria-label'] === 'Selected alert action preview');
const menu = (ui: UI) => ui.find(node => node.props.role === 'menu');
function choose(ui: UI, name: string) { const item = ui.find(node => node.props.role === 'menuitem' && text(node) === name, menu(ui)), node = ui.nodeFor(item); node.focus(); invoke(item.props.onClick, input(node)); ui.settle(); }

it('toolbar Clone selected previews, then publishes one atomic candidate with appended copies and requests one evaluation', () => {
  const ui = setup(), base = ui.props.alerts;
  ui.toggle('c'); ui.toggle('a'); expect(ui.selected()).toEqual(['a', 'c']);
  ui.callButton('Clone selected');
  const [box] = preview(ui);
  expect(text(box)).toContain('2 selected; 2 eligible; 0 unchanged.');
  expect(text(box)).toContain('Create 2 copies with new identities?');
  expect(text(box)).toContain('does not copy trigger history. Originals are unchanged. This is an OpenCandle clone policy.');
  expect(ui.publish).not.toHaveBeenCalled();
  ui.setClock(150); ui.callButton('Apply clone');
  expect(ui.publish).toHaveBeenCalledTimes(1);
  const [candidate, publishedBase] = ui.publish.mock.calls[0];
  expect(publishedBase).toBe(base);
  expect(candidate.slice(0, 3).every((row, index) => row === base[index])).toBe(true);
  const copies = candidate.slice(3);
  expect(copies.map(row => [row.definition.name, row.definition.createdAt, row.status, row.revision, row.history.length])).toEqual([['SYNTHETIC a', 150, 'active', 1, 0], ['SYNTHETIC c', 150, 'active', 1, 0]]);
  expect(new Set([...base.map(row => row.definition.id), ...copies.map(row => row.definition.id)]).size).toBe(5);
  expect(copies.map(row => ({ ...row.definition, id: 'x', createdAt: 0 }))).toEqual([base[0], base[2]].map(row => ({ ...row.definition, id: 'x', createdAt: 0 })));
  expect(validateLocalAlerts(candidate).ok).toBe(true);
  expect(ui.request.mock.calls).toEqual([['after-save']]);
  expect(ui.text()).toContain('2 selected alerts cloned. Copies start a new lifecycle without trigger history.');
  expect(ui.callbackErrors).toEqual([]);
});

it('selected-row context menu offers the same Clone selected command for exactly the selection', () => {
  const ui = setup([saved('a'), saved('b', 'paused'), saved('c', 'stopped')]);
  ui.toggle('b'); ui.toggle('c');
  ui.rowButton('b', 'More');
  expect(all(menu(ui), node => node.props.role === 'menuitem').map(text)).toContain('Clone selected');
  choose(ui, 'Clone selected');
  expect(text(preview(ui)[0])).toContain('Create 2 copies');
  ui.callButton('Apply clone');
  const candidate = ui.publish.mock.calls[0][0];
  expect(candidate.map(row => [row.definition.name, row.status])).toEqual([['SYNTHETIC a', 'active'], ['SYNTHETIC b', 'paused'], ['SYNTHETIC c', 'stopped'], ['SYNTHETIC b', 'active'], ['SYNTHETIC c', 'active']]);
});

it('Cancel, expired targets and rejected publication leave saved alerts unchanged with no partial copies', () => {
  const ui = setup([saved('a'), saved('b', 'expired'), saved('c', 'active', 130)]);
  const base = ui.props.alerts;
  ui.callButton('Select all shown'); ui.callButton('Clone selected');
  expect(text(preview(ui)[0])).toContain('3 selected; 2 eligible; 1 unchanged.');
  expect(text(preview(ui)[0])).toContain('expired: 1');
  ui.callButton('Cancel'); expect(preview(ui)).toEqual([]); expect(ui.props.alerts).toBe(base); expect(ui.publish).not.toHaveBeenCalled();
  // The c expiry passes before Apply: the prepared preview is no longer current.
  ui.callButton('Clone selected'); ui.setClock(131); ui.render();
  expect(preview(ui)).toEqual([]); expect(ui.text()).toContain('The prepared alert batch changed. Refresh its preview.');
  expect(ui.publish).not.toHaveBeenCalled();
  ui.setClock(120); ui.callButton('Clone selected'); ui.publishing(() => false); ui.callButton('Apply clone');
  expect(ui.publish).toHaveBeenCalledTimes(1); expect(ui.props.alerts).toBe(base);
  expect(ui.text()).toContain('The selected changes were rejected. Review the current alerts and open a new preview.');
  expect(ui.request).not.toHaveBeenCalled();
});
