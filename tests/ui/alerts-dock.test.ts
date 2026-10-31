import { expect, it, vi } from 'vitest';
import { mountControlledComponent, all, text, invoke } from '../helpers/alert-dialog-harness';
import { AlertsDock, type AlertsDockProps } from '../../src/ui/AlertsDock';
import { createLocalAlert, processAlertEvent, type LocalAlert } from '../../src/domain/alerts';

// SYNTHETIC component-handler checks (controlled hooks, no DOM, no focus claim).
const make = (id: string, symbol: string) => createLocalAlert({ id, name: `${symbol} ${id}`, message: `${symbol} msg`, instrumentId: 'US:' + symbol, sourceId: 'close', condition: { kind: 'crossing-up', value: 10 }, frequency: 'every-time', createdAt: 100, expiresAt: null, mode: 'ordinary', runId: 'ordinary' });
const ev = (alert: LocalAlert, sequence: number, value: number) => ({ instrumentId: alert.definition.instrumentId, sourceId: 'close', value, time: 1000 + sequence, availableAt: 1000 + sequence, sequence, barId: 'b' + sequence, barClosed: false, feedState: 'ready' as const, mode: 'ordinary' as const, runId: 'ordinary' });
function mount(alerts: LocalAlert[]) {
  const props: AlertsDockProps = { alerts, activeInstrumentId: 'US:AAPL', unwatched: new Map(), formatTime: String, now: () => 500, onAlertsChange: vi.fn(() => true), onCreate: vi.fn(), onEdit: vi.fn() };
  const view = mountControlledComponent(() => AlertsDock(props)); view.settle();
  const button = (label: string) => all(view.render(), node => node.type === 'button' && node.props['aria-label'] === label)[0];
  const tab = (name: string) => all(view.render(), node => node.type === 'button' && node.props.role === 'tab' && text(node).startsWith(name))[0];
  return { view, props, button, tab };
}

it('lists alerts for every symbol with list and log tabs', () => {
  let fired = make('1', 'AAPL'); fired = processAlertEvent(processAlertEvent(fired, ev(fired, 1, 9)).alert, ev(fired, 2, 11)).alert;
  expect(fired.history).toHaveLength(1);
  const ui = mount([fired, make('2', 'MSFT')]);
  expect(text(ui.view.render())).toContain('AAPL 1'); expect(text(ui.view.render())).toContain('MSFT 2');
  expect(ui.tab('Alerts').props['aria-selected']).toBe(true); expect(text(ui.tab('Log'))).toBe('Log (1)');
  invoke(ui.tab('Log').props.onClick); ui.view.settle();
  expect(ui.tab('Log').props['aria-selected']).toBe(true);
  expect(text(ui.view.render())).toContain('AAPL 1');
  expect(text(ui.view.render())).not.toContain('MSFT 2');
});

it('pauses an alert through the shared publisher with the collection it showed', () => {
  const ui = mount([make('1', 'AAPL'), make('2', 'MSFT')]);
  invoke(ui.button('Pause AAPL 1').props.onClick);
  const [next, expected] = (ui.props.onAlertsChange as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(expected).toBe(ui.props.alerts); expect(next[0].status).toBe('paused'); expect(next[1]).toBe(ui.props.alerts[1]);
});

it('asks before it removes an alert, and keeps it on Keep', () => {
  const ui = mount([make('1', 'AAPL')]);
  invoke(ui.button('Remove AAPL 1').props.onClick); ui.view.settle();
  expect(ui.props.onAlertsChange).not.toHaveBeenCalled();
  invoke(ui.button('Keep AAPL 1').props.onClick); ui.view.settle();
  expect(ui.button('Remove AAPL 1')).toBeDefined();
  invoke(ui.button('Remove AAPL 1').props.onClick); ui.view.settle();
  invoke(ui.button('Confirm remove AAPL 1').props.onClick);
  expect((ui.props.onAlertsChange as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([]);
});

it('opens the create and edit dialogs and says plainly when an alert is not watched in the background', () => {
  const ui = mount([make('1', 'AAPL')]); ui.props.unwatched = new Map([['1', 'Its data is not live.']]); ui.view.settle();
  invoke(ui.button('Create alert').props.onClick); expect(ui.props.onCreate).toHaveBeenCalled();
  invoke(ui.button('Edit AAPL 1').props.onClick); expect(ui.props.onEdit).toHaveBeenCalledWith('1');
  expect(text(ui.view.render())).toContain('Its data is not live.');
});
