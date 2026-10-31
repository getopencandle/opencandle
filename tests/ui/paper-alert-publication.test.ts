import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AlertDialog, type AlertDialogProps } from '../../src/ui/AlertDialog';
import { alertObservationContext, createAlertObservationSession, observeAlertSnapshot } from '../../src/domain/alert-observation';
import { createLocalAlert } from '../../src/domain/alerts';
import { fixtureDataset } from '../../src/domain/fixtures';

// Actual component handlers with controlled hooks. This does not operate a DOM or executable.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, effects: [] as Array<() => void> }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return { ...actual, useState: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[i], (next: any) => { hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next; }]; }, useRef: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = { current: initial }; return hooks.cells[i]; }, useEffect: (effect: () => void, deps?: any[]) => { const i = hooks.cursor++, prior = hooks.cells[i]; if (!prior || !deps || deps.some((v, j) => !Object.is(v, prior[j]))) { hooks.cells[i] = deps; hooks.effects.push(effect); } } };
});
const dataset = fixtureDataset('GME', 5), now = Date.UTC(2026, 9, 14) / 1000;
const session = createAlertObservationSession(dataset, { sessionId: 'publication', mode: 'ordinary', startedAt: now });
const context = alertObservationContext(session, dataset), event = observeAlertSnapshot(session, { dataset, observedAt: now }).event!;
const saved = () => createLocalAlert({ id: 'one', name: 'Existing', message: 'Local', instrumentId: context.instrumentId, sourceId: context.sourceId, mode: context.mode, runId: context.runId, observationBinding: context.binding, condition: { kind: 'greater', value: 1 }, frequency: 'every-time', createdAt: now, expiresAt: null });
function text(node: any): string { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function find(node: any, predicate: (node: any) => boolean): any { if (Array.isArray(node)) { for (const child of node) { const hit = find(child, predicate); if (hit) return hit; } } else if (node?.props) { if (predicate(node)) return node; return find(node.props.children, predicate); } return null; }
function setup(overrides: Partial<AlertDialogProps> = {}) {
  const props: AlertDialogProps = { open: true, onClose: vi.fn(), alerts: [], onAlertsChange: vi.fn(() => false), instrument: dataset.instrument, now, context, event, onRequestObservation: vi.fn(), ...overrides };
  const render = () => { hooks.cursor = 0; return AlertDialog(props); };
  const node = (predicate: (node: any) => boolean) => { const result = find(render(), predicate); if (!result) throw new Error('Expected handler not present'); return result; };
  return { props, render, text: () => text(render()), click: (name: string) => node(n => n.type === 'button' && text(n) === name).props.onClick(), change: (name: string, value: string) => node(n => n.props['aria-label'] === name).props.onChange({ target: { value } }), save: () => node(n => n.type === 'form').props.onSubmit({ preventDefault: vi.fn() }), flush: () => hooks.effects.splice(0).forEach(effect => effect()) };
}
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.effects = []; vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => vi.unstubAllGlobals());

it('retains a rejected create/edit draft and does not request after-save evaluation', () => {
  const ui = setup(); ui.click('Create alert'); ui.change('Alert level', '10'); ui.save();
  expect(ui.text()).toContain('change was rejected'); expect(find(ui.render(), n => n.type === 'form')).not.toBeNull();
  expect(ui.props.onRequestObservation).not.toHaveBeenCalled(); expect(vi.mocked(ui.props.onAlertsChange).mock.calls[0][1]).toBe(ui.props.alerts);
  ui.props.onAlertsChange = vi.fn(() => true); ui.save(); expect(ui.props.onRequestObservation).toHaveBeenCalledWith('after-save');
  expect(find(ui.render(), n => n.type === 'form')).toBeNull();
});
it('keeps a rejected delete confirmation and a rejected resume paused', () => {
  const original = { ...saved(), status: 'paused' as const }, ui = setup({ alerts: [original] });
  ui.click('Resume'); expect(ui.props.onRequestObservation).not.toHaveBeenCalled(); expect(original.status).toBe('paused');
  ui.click('Delete'); ui.click('Confirm delete'); expect(ui.text()).toContain('Delete this alert'); expect(ui.text()).toContain('The alert deletion was rejected. Review the alert before confirming again.');
});
it('does not claim a rejected observation was stored and leaves the old history intact', () => {
  const original = saved(), ui = setup({ alerts: [original], open: false }); ui.render(); ui.flush();
  expect(ui.props.onAlertsChange).toHaveBeenCalledOnce(); expect(vi.mocked(ui.props.onAlertsChange).mock.calls[0][1]).toBe(ui.props.alerts);
  expect(original.history).toEqual([]);
});
it('does not run a duplicate observation effect in the externally processed workspace wrapper', () => {
  const ui = setup({ alerts: [saved()], externallyProcessed: true, open: false }); ui.render(); ui.flush(); expect(ui.props.onAlertsChange).not.toHaveBeenCalled();
});
