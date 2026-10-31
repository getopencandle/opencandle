// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import { expect, it, vi } from 'vitest';
import { all, invoke, setup, text } from '../helpers/alert-dialog-harness';

// Receiving side of a top-toolbar "create alert" entry through actual AlertDialog
// effects under the shared controlled model. The App button itself is a proposed
// root diff and is not exercised here.
const form = (ui: ReturnType<typeof setup>) => all(ui.render(), node => node.type === 'form');
const submit = (ui: ReturnType<typeof setup>) => { invoke(form(ui)[0].props.onSubmit, { preventDefault: vi.fn() }); ui.settle(); };

it('a new create request opens one fresh draft for the current instrument; repeats and closed dialogs do nothing', () => {
  const ui = setup();
  ui.props.open = false; ui.settle();
  const request = {}; ui.props.createRequest = request; ui.settle();
  expect(ui.render()).toBeNull();
  ui.props.open = true; ui.settle();
  expect(form(ui)).toHaveLength(1); expect(text(ui.render())).toContain('Create alert on GME');expect(text(form(ui)[0])).not.toContain('Create alert on GME');
  expect(ui.field('Alert name').props.value).toBe('GME price alert');
  ui.change('Alert name', 'SYNTHETIC typed');
  ui.settle(); expect(ui.field('Alert name').props.value).toBe('SYNTHETIC typed');
  // A newer request while a draft is dirty keeps the draft and explains why.
  ui.props.createRequest = {}; ui.settle();
  expect(ui.field('Alert name').props.value).toBe('SYNTHETIC typed');
  expect(ui.text()).toContain('An unsaved alert draft is open. Finish or cancel it before starting another alert.');
  // Cancel in a create flow closes the dialog; the next entry reopens it.
  ui.callButton('Cancel'); expect(form(ui)).toEqual([]); expect(ui.props.onClose).toHaveBeenCalledTimes(1);
  ui.props.open = true; ui.props.createRequest = {}; ui.settle();
  expect(form(ui)).toHaveLength(1); expect(ui.field('Alert name').props.value).toBe('GME price alert');
  expect(ui.publish).not.toHaveBeenCalled();
});

it('a request naming a catalog source waits for that source context before pinning the draft', async () => {
  const { alertObservationContext, createAlertObservationSession } = await import('../../src/domain/alert-observation');
  const { fixtureDataset } = await import('../../src/domain/fixtures');
  const dataset = fixtureDataset('GME', 1), ui = setup([]);
  const contextFor = (sessionId: string) => alertObservationContext(createAlertObservationSession(dataset, { version: 2, chartId: 'SYNTHETIC chart', sessionId, mode: 'ordinary', startedAt: 100 }), dataset);
  const position = { schemaVersion: 1 as const, drawingId: 'p1', side: 'long' as const, entry: 100, target: 110, stop: 95, quantity: 20, ticker: 'GME', currency: 'USD' };
  const old = contextFor('SYNTHETIC old selection');
  Object.assign(ui.props, { context: old, contexts: [old], selectedSourceId: 'price:open:chart', sourceSelectionKey: 'price:open:chart|constant', onSourceChange: () => undefined, onTargetChange: () => undefined, validateCurrentSource: () => undefined, sourceChoices: [{ id: 'price:open:chart', label: 'Open', source: old.binding.source }, { id: 'position:p1', label: 'Long/Short position', source: old.binding.source, position }] });
  ui.settle();
  ui.props.createRequest = { sourceId: 'position:p1' }; ui.settle();
  expect(form(ui)).toHaveLength(1);
  // The old selection's context must not be pinned: saving now refuses.
  submit(ui);
  expect(ui.publish).not.toHaveBeenCalled(); expect(ui.text()).toContain('Choose Use updated source, then save.');
  // WorkspaceAlerts then selects the requested source and supplies its fresh context.
  const fresh = contextFor('SYNTHETIC requested selection');
  Object.assign(ui.props, { selectedSourceId: 'position:p1', sourceSelectionKey: 'position:p1|constant', context: fresh, contexts: [fresh] }); ui.settle();
  expect(text(ui.field('Position alert levels'))).toContain('Long entry 100');
  submit(ui);
  expect(ui.publish).toHaveBeenCalledTimes(1);
  expect(ui.props.alerts[0].definition.observationBinding).toEqual(fresh.binding);
  expect(ui.props.alerts[0].definition.condition).toEqual({ kind: 'position', position });
});
