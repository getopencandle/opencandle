import { expect, it } from 'vitest';
import { all, input, invoke, notice, saved, setup, text } from '../helpers/alert-dialog-harness';
import { EMPTY_ALERT_HISTORY_SELECTION, reconcileAlertHistorySelection, transitionAlertHistorySelection } from '../../src/ui/alert-history-selection';
import { alertHistoryCsv } from '../../src/domain/alert-history-export';
import type { AlertListItem } from '../../src/ui/alert-list-navigation';
import type { LocalAlert } from '../../src/domain/alerts';

// Pure reducer checks plus actual AlertDialog History callbacks under the shared
// controlled hook/node model. No native pointer, focus or packaged GUI claim.
const item = (id: string, alertId = 'A', at = 1, sequence = 1, mode = 'ordinary'): AlertListItem => ({ id, identity: [id, alertId, mode, 'ordinary', at, sequence], sourceIndex: 0, historyIndex: 0 });

it('selects by literal event identity, retains selection across appends and drops removed or replaced events', () => {
  // Repeated alert names and repeated events of one alert stay distinct by event ID.
  const items = [item('A#3', 'A', 30, 3), item('B#1', 'B', 20, 1), item('A#2', 'A', 20, 2), item('R#1', 'R', 10, 1, 'replay')];
  const all_ = transitionAlertHistorySelection(EMPTY_ALERT_HISTORY_SELECTION, items, { kind: 'all' });
  expect(all_.ids).toEqual(['A#3', 'B#1', 'A#2', 'R#1']);
  const toggled = transitionAlertHistorySelection(all_, items, { kind: 'toggle', id: 'B#1' });
  expect(toggled.ids).toEqual(['A#3', 'A#2', 'R#1']); expect(toggled.anchorId).toBe('B#1');
  const ranged = transitionAlertHistorySelection(transitionAlertHistorySelection(EMPTY_ALERT_HISTORY_SELECTION, items, { kind: 'toggle', id: 'B#1' }), items, { kind: 'range', id: 'R#1' });
  expect(ranged.ids).toEqual(['B#1', 'A#2', 'R#1']);
  // Incoming newer event at the top: not selected; existing selection retained.
  const appended = [item('A#4', 'A', 40, 4), ...items];
  expect(reconcileAlertHistorySelection(ranged, appended).ids).toEqual(['B#1', 'A#2', 'R#1']);
  // Same-length replacement of one event identity drops only that event.
  const replaced = items.map(row => row.id === 'A#2' ? item('A#2', 'A', 21, 2) : row);
  expect(reconcileAlertHistorySelection(ranged, replaced).ids).toEqual(['B#1', 'R#1']);
  expect(reconcileAlertHistorySelection(ranged, items)).toBe(ranged);
  expect(reconcileAlertHistorySelection(ranged, [items[0], items[0]])).toBe(EMPTY_ALERT_HISTORY_SELECTION);
  expect(() => transitionAlertHistorySelection(ranged, items, { kind: 'toggle', id: 'missing' })).toThrow('This recorded event is no longer displayed.');
  expect(transitionAlertHistorySelection(ranged, items, { kind: 'clear' })).toBe(EMPTY_ALERT_HISTORY_SELECTION);
});

type UI = ReturnType<typeof setup>;
const rows = (ui: UI) => all(ui.render(), node => node.type === 'tr' && node.props['data-alert-history-id'] !== undefined);
const selectedRows = (ui: UI) => rows(ui).filter(row => row.props['aria-selected'] === true).map(row => row.props['data-alert-history-id']);
function click(ui: UI, id: string, extra: Record<string, unknown> = {}) { const row = rows(ui).find(node => node.props['data-alert-history-id'] === id)!, node = ui.nodeFor(row); const event = input(node, extra); invoke(row.props.onClick, event); ui.settle(); return event; }
function key(ui: UI, id: string, extra: Record<string, unknown>) { const row = rows(ui).find(node => node.props['data-alert-history-id'] === id)!, node = ui.nodeFor(row); node.focus(); ui.settle(); const current = rows(ui).find(r => r.props['data-alert-history-id'] === id)!; const event = input(node, extra); invoke(current.props.onKeyDown, event); ui.settle(); return event; }
const count = (ui: UI) => text(ui.find(node => node.props['aria-label'] === 'Selected history event count'));

it('Ctrl/Cmd+A selects all recorded events, modifier clicks toggle and range-select, Escape clears before closing', () => {
  const ui = setup([saved('a'), saved('b')]), base = ui.props.alerts, csv = alertHistoryCsv(base);
  ui.callButton('History (4)');
  expect(count(ui)).toBe('0 of 4 events selected'); expect(ui.button('Clear event selection').props.disabled).toBe(true);
  const ids = rows(ui).map(row => String(row.props['data-alert-history-id']));
  expect(ids).toEqual(['SYNTHETIC a notification 9', 'SYNTHETIC b notification 9', 'SYNTHETIC a notification 3', 'SYNTHETIC b notification 3']);
  const event = key(ui, ids[0], { key: 'a', ctrlKey: true });
  expect(event.preventDefault).toHaveBeenCalledTimes(1); expect(selectedRows(ui)).toEqual(ids); expect(count(ui)).toBe('4 of 4 events selected');
  click(ui, ids[1], { ctrlKey: true }); expect(selectedRows(ui)).toEqual([ids[0], ids[2], ids[3]]);
  ui.callButton('Clear event selection'); expect(selectedRows(ui)).toEqual([]);
  click(ui, ids[1], { metaKey: true }); click(ui, ids[3], { shiftKey: true });
  expect(selectedRows(ui)).toEqual(ids.slice(1));
  // A plain click keeps the existing focus behavior and does not change selection.
  click(ui, ids[0]); expect(selectedRows(ui)).toEqual(ids.slice(1));
  ui.escape(); expect(selectedRows(ui)).toEqual([]); expect(ui.props.open).toBe(true);
  ui.escape(); expect(ui.props.open).toBe(false);
  expect(ui.props.alerts).toBe(base); expect(alertHistoryCsv(ui.props.alerts)).toBe(csv); expect(ui.publish).not.toHaveBeenCalled();
});

it('keeps selection on incoming history, never transfers it to the manager and clears it on tab change', () => {
  const ui = setup([saved('a'), saved('b')]);
  ui.callButton('History (4)');
  const ids = rows(ui).map(row => String(row.props['data-alert-history-id']));
  click(ui, ids[2], { ctrlKey: true }); expect(selectedRows(ui)).toEqual([ids[2]]);
  // An incoming trigger appends a newer event; it is not selected and the prior one stays.
  const a = ui.props.alerts[0], next: LocalAlert = { ...a, lastSequence: 12, lastTime: 130, lastTriggeredAt: 130, lastTriggeredBar: 'SYNTHETIC bar 12', history: [...a.history, notice('a', 12, 130)] };
  ui.props.alerts = [next, ui.props.alerts[1]]; ui.settle();
  expect(rows(ui)[0].props['data-alert-history-id']).toBe('SYNTHETIC a notification 12');
  expect(selectedRows(ui)).toEqual([ids[2]]); expect(count(ui)).toBe('1 of 5 events selected');
  // Removing the selected event's alert drops it.
  ui.props.alerts = [ui.props.alerts[1]]; ui.settle(); expect(selectedRows(ui)).toEqual([]);
  key(ui, 'SYNTHETIC b notification 9', { key: 'a', metaKey: true }); expect(selectedRows(ui)).toHaveLength(2);
  ui.callButton('Alerts (1)'); expect(ui.selected()).toEqual([]);
  ui.callButton('History (2)'); expect(selectedRows(ui)).toEqual([]);
  expect(ui.publish).not.toHaveBeenCalled();
});
