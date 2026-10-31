import { expect, it } from 'vitest';
import { vi } from 'vitest';
import { setup, invoke, all, text, mountControlledComponent } from '../helpers/alert-dialog-harness';
import { AlertPlaceholderPicker, alertPlaceholderOptions, insertAlertPlaceholder } from '../../src/ui/AlertPlaceholderPicker';
import { ALERT_MESSAGE_LIMIT, ALERT_MESSAGE_PLACEHOLDER_CATALOG } from '../../src/domain/alert-message';
import type { AlertSourceChoice } from '../../src/ui/AlertDialog';

// The "Insert placeholder" picker of the alert message box. AlertDialog runs under the shared controlled
// hook/node model (the picker is a child element there); the picker's own markup and insertion are checked directly.
// SYNTHETIC sources only; no native caret, focus or packaged GUI is claimed.

it('inserts at the caret or over the selection and refuses to pass the message limit', () => {
  expect(insertAlertPlaceholder('Price  now', '{{close}}', 6, 6)).toEqual({ value: 'Price {{close}} now', caret: 15 });
  expect(insertAlertPlaceholder('Price XX now', '{{close}}', 8, 6)).toEqual({ value: 'Price {{close}} now', caret: 15 });
  expect(insertAlertPlaceholder('abc', '{{ticker}}', 99, 99)).toEqual({ value: 'abc{{ticker}}', caret: 13 });
  expect(insertAlertPlaceholder('x'.repeat(ALERT_MESSAGE_LIMIT - 3), '{{close}}', 0, 0)).toBeNull();
});

it('lists the catalog, with the selected script plots by number and title in place of the generic plot forms', () => {
  expect(alertPlaceholderOptions().map(row => row.token)).toEqual(ALERT_MESSAGE_PLACEHOLDER_CATALOG.map(row => row.token));
  const tokens = alertPlaceholderOptions(['fast', 'Upper "band"']).filter(row => row.group === 'Plots').map(row => row.token);
  // A title holding a quote cannot be written as {{plot("...")}}; its number form is still offered.
  expect(tokens).toEqual(['{{plot_0}}', '{{plot("fast")}}', '{{plot_1}}']);
  expect(alertPlaceholderOptions(['fast']).map(row => row.group)).toContain('Strategy');
  const onChange = vi.fn(), picker = mountControlledComponent(() => AlertPlaceholderPicker({ textareaId: 'local-alert-message', value: 'Hi ', onChange, plotTitles: ['fast'] }));
  picker.settle();
  const toggle = () => picker.find(node => node.type === 'button' && text(node) === 'Insert placeholder');
  expect(toggle().props['aria-haspopup']).toBe('menu'); expect(toggle().props['aria-expanded']).toBe(false);
  expect(all(picker.render(), node => node.props.role === 'menuitem')).toHaveLength(0);
  invoke(toggle().props.onClick as () => void); picker.settle();
  expect(toggle().props['aria-expanded']).toBe(true);
  const items = all(picker.render(), node => node.props.role === 'menuitem');
  expect(items.map(node => text(all(node, child => child.type === 'code')[0]))).toEqual(alertPlaceholderOptions(['fast']).map(row => row.token));
  // No caret is known in this model, so the placeholder goes at the end, and the menu closes.
  invoke(items.find(node => text(node).startsWith('{{plot("fast")}}'))!.props.onClick as () => void); picker.settle();
  expect(onChange).toHaveBeenCalledWith('Hi {{plot("fast")}}');
  expect(toggle().props['aria-expanded']).toBe(false);
});

it('the alert message box carries the picker; a chosen placeholder becomes the draft message, and a strategy fill source presets Once per bar', () => {
  const view = setup([]);
  const choices: AlertSourceChoice[] = [
    { id: 'price:close:chart', label: 'Price CLOSE (standard)', source: { kind: 'price', field: 'close', transformId: 'standard' } },
    { id: 'script:s:fill', label: 'Script S: strategy order fills', source: { kind: 'price', field: 'close', transformId: 'standard' }, scriptSignal: true, strategyFill: true, plotTitles: ['fast', 'slow'] },
  ];
  view.props.sourceChoices = choices; view.props.selectedSourceId = 'price:close:chart';
  view.props.onSourceChange = id => { view.props.selectedSourceId = id; };
  view.callButton('Create alert');
  const picker = () => view.find(node => node.type === AlertPlaceholderPicker);
  expect(picker().props.textareaId).toBe('local-alert-message');
  expect(picker().props.plotTitles).toBeUndefined();
  invoke(picker().props.onChange as (value: string) => void, 'Fill {{strategy.order.action}}'); view.settle();
  expect(view.field('Alert message').props.value).toBe('Fill {{strategy.order.action}}');
  view.change('Technical alert source', 'script:s:fill');
  expect(picker().props.plotTitles).toEqual(['fast', 'slow']);
  expect(view.field('Alert frequency').props.value).toBe('once-per-bar');
  expect(all(view.render(), node => node.type === AlertPlaceholderPicker)).toHaveLength(1);
});
