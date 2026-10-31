// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import { expect, it, vi } from 'vitest';
import { all, invoke, setup, text } from '../helpers/alert-dialog-harness';
import { alertObservationContext, createAlertObservationSession } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';
import type { AlertPositionLevels } from '../../src/domain/alert-position';

// Actual AlertDialog create/edit handlers for a Long/Short source under the shared
// controlled hook/node model. No native controls, chart drawing or packaged GUI.
const dataset = fixtureDataset('GME', 1);
const position: AlertPositionLevels = { schemaVersion: 1, drawingId: 'p1', side: 'long', entry: 100, target: 110, stop: 95, quantity: 20, ticker: 'GME', currency: 'USD' };
function positionUi() {
  const ui = setup([]);
  const context = alertObservationContext(createAlertObservationSession(dataset, { version: 2, chartId: 'SYNTHETIC chart', sessionId: 'SYNTHETIC session', mode: 'ordinary', startedAt: 100 }), dataset);
  // Mirrors WorkspaceAlerts: the selection key changes with source/target so the draft recaptures the context.
  const key = () => { ui.props.sourceSelectionKey = `${ui.props.selectedSourceId}|${ui.props.targetSourceId}`; };
  const onSourceChange = vi.fn((id: string) => { ui.props.selectedSourceId = id; key(); }), onTargetChange = vi.fn((id: string) => { ui.props.targetSourceId = id; key(); });
  Object.assign(ui.props, { context, contexts: [context], validateCurrentSource: vi.fn(), onSourceChange, onTargetChange, selectedSourceId: 'price:close:chart', targetSourceId: 'sma', sourceChoices: [
    { id: 'price:close:chart', label: 'Price CLOSE (standard)', source: context.binding.source },
    { id: 'sma', label: 'SYNTHETIC SMA', source: context.binding.source },
    { id: 'position:p1', label: 'Long/Short position', source: context.binding.source, position },
  ] });
  ui.settle();
  return { ui, onSourceChange, onTargetChange };
}

it('a Long/Short source replaces condition and frequency with the fixed position lifecycle and saves one price condition', () => {
  const { ui, onTargetChange } = positionUi();
  ui.callButton('Create alert');
  ui.change('Technical alert source', 'position:p1');
  expect(onTargetChange).toHaveBeenCalledWith('constant'); expect(ui.props.targetSourceId).toBe('constant');
  ui.settle();
  expect(ui.field('Technical alert target').props.disabled).toBe(true);
  expect(all(ui.render(), node => node.props['aria-label'] === 'Alert condition' || node.props['aria-label'] === 'Alert frequency')).toEqual([]);
  expect(text(ui.field('Position alert levels'))).toBe('Long/Short position alertLong entry 100, take profit 110, stop loss 95, quantity 20');
  ui.change('Alert name', 'SYNTHETIC long plan');
  const form = ui.find(node => node.type === 'form'); invoke(form.props.onSubmit, { preventDefault: vi.fn() }); ui.settle();
  expect(ui.publish).toHaveBeenCalledTimes(1);
  const [saved] = ui.props.alerts;
  expect(saved.definition.condition).toEqual({ kind: 'position', position });
  expect(saved.definition.frequency).toBe('every-time'); expect(saved.definition.observationBinding?.source).toEqual(ui.props.context!.binding.source);
  expect(saved.positionPhase).toBe('waiting-entry');
  expect(text(ui.row(saved.definition.id))).toContain('Long entry 100, take profit 110, stop loss 95, quantity 20');
  expect(ui.request).toHaveBeenCalledWith('after-save');
});

it('editing a position alert keeps its levels, hides condition controls and restarts the entry phase', () => {
  const { ui } = positionUi();
  ui.callButton('Create alert'); ui.change('Technical alert source', 'position:p1'); ui.settle();
  const form = ui.find(node => node.type === 'form'); invoke(form.props.onSubmit, { preventDefault: vi.fn() }); ui.settle();
  const id = ui.props.alerts[0].definition.id;
  ui.props.alerts = [{ ...ui.props.alerts[0], positionPhase: 'entered' }]; ui.settle();
  ui.rowButton(id, 'Edit');
  expect(text(ui.field('Position alert levels'))).toContain('Long entry 100, take profit 110');
  expect(all(ui.render(), node => node.props['aria-label'] === 'Alert condition')).toEqual([]);
  ui.change('Alert message', 'SYNTHETIC edited plan');
  const editForm = ui.find(node => node.type === 'form'); invoke(editForm.props.onSubmit, { preventDefault: vi.fn() }); ui.settle();
  const edited = ui.props.alerts[0];
  expect(edited.definition.condition).toEqual({ kind: 'position', position }); expect(edited.definition.message).toBe('SYNTHETIC edited plan');
  expect(edited.revision).toBe(2); expect(edited.positionPhase).toBe('waiting-entry');
});
