import { expect, it, vi } from 'vitest';
import { setup, saved, invoke, input, all, text } from '../helpers/alert-dialog-harness';
import { createAlertDelivery } from '../../src/domain/alert-delivery';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { AlertEvent, LocalAlert } from '../../src/domain/alerts';

// Actual AlertDialog handlers under the shared controlled hook/node model.
// No native form controls, audio device, focus or packaged GUI is exercised.
const instrumentId = fixtureDataset('GME', 1).instrument.id;
function ui(initial?: LocalAlert[]) {
  const view = setup(initial);
  const check = (label: string, checked: boolean) => { const control = view.field(label), target = view.nodeFor(control); invoke(control.props.onChange, input(target, { target: { checked } })); view.settle(); };
  const submit = () => { const form = view.find(node => node.type === 'form'); invoke(form.props.onSubmit, { preventDefault: vi.fn() }); view.settle(); };
  return { ...view, check, submit };
}

it('shows LV-default notification controls on a new draft and saves the chosen popup, desktop and sound actions', () => {
  const view = ui([]);
  const event: AlertEvent = { instrumentId, sourceId: 'close', value: 23, time: 120, availableAt: 120, sequence: 1, barId: 'SYNTHETIC bar', barClosed: false, feedState: 'ready', mode: 'ordinary', runId: 'ordinary' };
  view.props.event = event;
  view.callButton('Create alert');
  expect(view.field('Alert popup').props.checked).toBe(true);
  expect(view.field('Alert desktop notification').props.checked).toBe(true);
  expect(view.field('Alert sound').props.value).toBe('lv-chime');
  expect(all(view.field('Alert sound'), node => node.type === 'option').map(node => [node.props.value, text(node)])).toEqual([['', 'No sound'], ['lv-chime', 'Chime'], ['lv-pulse', 'Pulse'], ['lv-bell', 'Bell'], ['lv-rise', 'Rising'], ['lv-double', 'Double beep']]);
  expect(view.button('Preview sound').props.disabled).toBe(false);
  view.check('Alert popup', false); view.check('Alert desktop notification', true); view.change('Alert sound', 'lv-double');
  view.submit();
  expect(view.publish).toHaveBeenCalledTimes(1);
  const created = view.props.alerts.at(-1)!;
  expect(created.definition.delivery).toEqual({ schemaVersion: 1, popup: false, desktop: true, sound: 'lv-double' });
  expect(created.history).toEqual([]);
});

it('edits delivery atomically with a new revision, retains history and shows the saved summary in the manager row', () => {
  const view = ui();
  view.rowButton('a', 'Edit');
  // Legacy saved alerts open with the popup-only legacy presentation.
  expect(view.field('Alert popup').props.checked).toBe(true);
  expect(view.field('Alert sound').props.value).toBe('');
  view.change('Alert sound', 'lv-bell'); view.check('Alert desktop notification', true);
  view.submit();
  const edited = view.props.alerts.find(alert => alert.definition.id === 'a')!;
  expect(edited.definition.delivery).toEqual(createAlertDelivery(true, true, 'lv-bell'));
  expect(edited.revision).toBe(2); expect(edited.history).toHaveLength(2);
  expect(view.props.alerts.filter(alert => alert.definition.id !== 'a').every(alert => alert.definition.delivery === undefined)).toBe(true);
  expect(text(view.row('a'))).toContain('Log · Popup · Desktop notification · Sound: Bell');
  expect(text(view.row('b'))).toContain('Log · Popup');
  // Cancel leaves saved delivery unchanged.
  view.rowButton('a', 'Edit'); view.change('Alert sound', ''); view.callButton('Cancel');
  expect(view.props.alerts.find(alert => alert.definition.id === 'a')!.definition.delivery?.sound).toBe('lv-bell');
});

it('previews only the selected sound through the injected player and reports a failed preview', async () => {
  const configured = { ...saved('s'), definition: { ...saved('s').definition, delivery: createAlertDelivery(true, false, 'lv-chime') } };
  const view = ui([configured]);
  const play = vi.fn(async () => undefined); view.props.soundPlayer = { play };
  view.rowButton('s', 'Edit');
  expect(view.field('Alert sound').props.value).toBe('lv-chime');
  view.callButton('Preview sound'); await Promise.resolve(); await Promise.resolve(); view.settle();
  expect(play.mock.calls).toEqual([['lv-chime']]);
  expect(view.text()).toContain('Played the selected local alert sound once.');
  view.props.soundPlayer = { play: vi.fn(async () => { throw new Error('Sound output is unavailable in this environment.'); }) };
  view.callButton('Preview sound'); await Promise.resolve(); await Promise.resolve(); view.settle();
  expect(view.text()).toContain('Sound preview failed: Sound output is unavailable in this environment.');
  expect(view.publish).not.toHaveBeenCalled();
});
