import { expect, it, vi } from 'vitest';
import { mountControlledComponent, all, invoke } from '../helpers/alert-dialog-harness';
import { AlertChartLines, type AlertChartLinesProps } from '../../src/ui/AlertChartLines';

// SYNTHETIC component-handler checks (controlled hooks): dragging or arrow-keying an alert line asks for a new price.
Object.assign(globalThis, { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined });
const projection = { left: 10, top: 20, width: 500, height: 400, priceToY: (price: number) => 20 + (400 - price), yToPrice: (y: number) => 400 - (y - 20) };
function mount(extra: Partial<AlertChartLinesProps> = {}) {
  const props: AlertChartLinesProps = { rows: [{ alertId: 'a', name: 'AAPL cross', slot: 'level', price: 100, label: '100  AAPL cross' }, { alertId: 'b', name: 'Far', slot: 'upper', price: 9000, label: '9000  Far' }], tickSize: 0.5, visible: true, projection: () => projection, onReprice: vi.fn(() => true), ...extra };
  const view = mountControlledComponent(() => AlertChartLines(props)); view.settle();
  const handle = (alertId: string) => all(view.render(), node => node.props['data-alert-line'] === alertId)[0];
  return { view, props, handle };
}

it('draws one draggable handle per visible alert line and leaves lines outside the pane out', () => {
  const ui = mount();
  expect(ui.handle('a').props.role).toBe('slider'); expect(ui.handle('a').props['aria-valuenow']).toBe(100);
  expect(ui.handle('b')).toBeUndefined();
  const lines = (view: ReturnType<typeof mount>) => all(view.view.render(), node => typeof node.props.className === 'string' && /^lv-alert-line( |$)/.test(node.props.className));
  expect(lines(ui)[0].props.className).toContain('drawn');
  expect(lines(mount({ drawLine: false }))[0].props.className).not.toContain('drawn');
});

it('draws nothing when alert lines are hidden or there is no chart pane', () => {
  expect(mount({ visible: false }).view.render()).toBeNull();
  expect(mount({ projection: () => null }).view.render()).toBeNull();
});

it('moves a line one tick with the arrow keys', () => {
  const ui = mount(), prevent = vi.fn();
  invoke(ui.handle('a').props.onKeyDown, { key: 'ArrowUp', preventDefault: prevent, stopPropagation: vi.fn() });
  expect(ui.props.onReprice).toHaveBeenCalledWith('a', 'level', 100.5);
  invoke(ui.handle('a').props.onKeyDown, { key: 'ArrowDown', preventDefault: prevent, stopPropagation: vi.fn() });
  expect(ui.props.onReprice).toHaveBeenLastCalledWith('a', 'level', 99.5);
  expect(prevent).toHaveBeenCalledTimes(2);
});

it('asks for the price under the pointer when a drag ends, and nothing when it is cancelled', () => {
  const ui = mount(), listeners = new Map<string, (event: unknown) => void>();
  const target = { focus: vi.fn(), setPointerCapture: vi.fn(), addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn), removeEventListener: (type: string) => listeners.delete(type) };
  invoke(ui.handle('a').props.onPointerDown, { button: 0, pointerId: 1, currentTarget: target, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  listeners.get('pointermove')!({ clientY: 20 + (400 - 150.2) });
  listeners.get('pointerup')!({ type: 'pointerup' });
  expect(ui.props.onReprice).toHaveBeenCalledWith('a', 'level', 150);
  const second = mount();
  invoke(second.handle('a').props.onPointerDown, { button: 0, pointerId: 1, currentTarget: target, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  listeners.get('pointermove')!({ clientY: 20 + (400 - 150) });
  listeners.get('pointercancel')!({ type: 'pointercancel' });
  expect(second.props.onReprice).not.toHaveBeenCalled();
});
