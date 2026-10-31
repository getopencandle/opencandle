// Display names omit internal ids; source identities and lifecycle assertions stay intact.
import { expect, it, vi } from 'vitest';
import { all, invoke, setup, text } from '../helpers/alert-dialog-harness';
import { alertObservationContext, createAlertObservationSession } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';
import { captureFibActiveLevels, type AlertLevelSet } from '../../src/domain/alert-levels';
import { TechnicalAlertCatalog } from '../../src/ui/technical-alert-catalog';
import { sourceContextForDataset } from '../../src/chart/source-context';
import { conditionText } from '../../src/ui/alerts-dock-model';
import type { ChartController } from '../../src/chart/adapter';

// Fib active level crossing through the drawing alert entry (catalog source drawing:<id>) and the
// actual AlertDialog create and edit handlers under the shared controlled hook/node model. SYNTHETIC drawings and data.
const dataset = fixtureDataset('GME', 1);
const fib = (id: string, enabled = true) => ({ id, type: 'fibretracement', paneId: 'price', anchors: [{ time: 1_700_000_000_000, price: 10 }, { time: 1_700_086_400_000, price: 20 }], style: { lineColor: '#808080', lineWidth: 1, lineStyle: 'solid' }, props: { levels: [{ ratio: 0, color: '#808080', enabled }, { ratio: 0.5, color: '#4caf50', enabled }, { ratio: 1, color: '#808080', enabled }], reverse: false } });
const captured = captureFibActiveLevels(fib('f1'));
if (!captured.ok) throw Error(captured.diagnostics.join(' '));
const levels: AlertLevelSet = captured.levels;

it('the alert source catalog offers a Fib retracement as an active level crossing source with its frozen levels', () => {
  const data = fixtureDataset('GME', 500); data.bars = [8, 9, 10].map((value, index) => ({ time: 1704153600 + index * 86400, open: value, high: value + 1, low: value - 1, close: value, volume: 100 }));
  const bars = data.bars, source = sourceContextForDataset(data, bars), drawings = [fib('f1'), fib('f2', false)];
  const controller = { getSourceContext: () => source, getStyle: () => 'candles', getDataWindow: () => ({ pending: false, source, series: { count: bars.length, firstTime: bars[0]!.time, lastTime: bars.at(-1)!.time, style: 'candles' } }), indicators: { serialize: () => [] }, saveDrawings: () => ({ version: 1, drawings: structuredClone(drawings) }), getChartOptions: () => ({ scale: 'linear' }) } as unknown as ChartController;
  let id = 0; const choices = new TechnicalAlertCatalog(() => String(++id)).capture(controller, data, bars, []);
  const live = choices.find(row => row.id === 'drawing:f1');
  expect(live?.label).toBe('Fib retracement 1: any level');
  expect(live?.levels).toEqual(levels);
  expect(live?.source).toEqual({ kind: 'price', field: 'close', transformId: 'standard' });
  const none = choices.find(row => row.id === 'drawing:f2');
  expect(none?.source).toBeNull();
  expect(none?.disabledReason).toMatch(/no active/i);
  expect(choices.find(row => row.id === 'boundary:f1')).toBeUndefined();
});

function fibUi() {
  const ui = setup([]);
  const context = alertObservationContext(createAlertObservationSession(dataset, { version: 2, chartId: 'SYNTHETIC chart', sessionId: 'SYNTHETIC session', mode: 'ordinary', startedAt: 100 }), dataset);
  const key = () => { ui.props.sourceSelectionKey = `${ui.props.selectedSourceId}|${ui.props.targetSourceId}`; };
  const onSourceChange = vi.fn((id: string) => { ui.props.selectedSourceId = id; key(); }), onTargetChange = vi.fn((id: string) => { ui.props.targetSourceId = id; key(); });
  Object.assign(ui.props, { context, contexts: [context], validateCurrentSource: vi.fn(), onSourceChange, onTargetChange, selectedSourceId: 'price:close:chart', targetSourceId: 'sma', sourceChoices: [
    { id: 'price:close:chart', label: 'Price CLOSE (standard)', source: context.binding.source },
    { id: 'sma', label: 'SYNTHETIC SMA', source: context.binding.source },
    { id: 'drawing:f1', label: 'Fib retracement: active level crossing', source: context.binding.source, levels },
  ] });
  ui.settle();
  return { ui, onTargetChange };
}

it('a Fib source replaces the condition with Active level crossing, keeps the frequency choice and saves the frozen levels', () => {
  const { ui, onTargetChange } = fibUi();
  ui.callButton('Create alert');
  ui.change('Technical alert source', 'drawing:f1');
  expect(onTargetChange).toHaveBeenCalledWith('constant');
  ui.settle();
  expect(ui.field('Technical alert target').props.disabled).toBe(true);
  expect(all(ui.render(), node => node.props['aria-label'] === 'Alert condition')).toEqual([]);
  expect(text(ui.field('Fib alert levels'))).toBe('Active level crossing3 active levels: 10, 15, 20');
  ui.change('Alert frequency', 'once-per-bar');
  ui.change('Alert name', 'SYNTHETIC fib');
  const form = ui.find(node => node.type === 'form'); invoke(form.props.onSubmit, { preventDefault: vi.fn() }); ui.settle();
  expect(ui.publish).toHaveBeenCalledTimes(1);
  const [saved] = ui.props.alerts;
  expect(saved.definition.condition).toEqual({ kind: 'level-crossing', levels });
  expect(saved.definition.frequency).toBe('once-per-bar');
  expect(saved.definition.conditionVersion).toBe(2);
  expect(text(ui.row(saved.definition.id))).toContain('active level crossing 3 levels');
});

it('editing a Fib alert keeps its frozen levels', () => {
  const { ui } = fibUi();
  ui.callButton('Create alert'); ui.change('Technical alert source', 'drawing:f1'); ui.settle();
  invoke(ui.find(node => node.type === 'form').props.onSubmit, { preventDefault: vi.fn() }); ui.settle();
  const id = ui.props.alerts[0].definition.id;
  ui.rowButton(id, 'Edit');
  expect(text(ui.field('Fib alert levels'))).toContain('3 active levels: 10, 15, 20');
  ui.change('Alert message', 'SYNTHETIC edited');
  invoke(ui.find(node => node.type === 'form').props.onSubmit, { preventDefault: vi.fn() }); ui.settle();
  expect(ui.props.alerts[0].definition.condition).toEqual({ kind: 'level-crossing', levels });
  expect(ui.props.alerts[0].revision).toBe(2);
});

it('the docked Alerts list names the condition', () => {
  expect(conditionText({ kind: 'level-crossing', levels })).toBe('Active level crossing, 3 levels');
});
