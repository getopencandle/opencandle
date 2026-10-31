import { describe, expect, it, vi } from 'vitest';
import { all, invoke, setup, text } from '../helpers/alert-dialog-harness';
import { alertObservationContext, createAlertObservationSession, type AlertSourceSnapshot } from '../../src/domain/alert-observation';
import { fixtureDataset } from '../../src/domain/fixtures';
import { TechnicalAlertCatalog } from '../../src/ui/technical-alert-catalog';
import { legacyDrawingRows } from '../../src/ui/WorkspaceAlerts';
import { prepareDrawingAlertGrid } from '../../src/chart/drawing-alert-geometry';
import { sourceContextForDataset } from '../../src/chart/source-context';
import type { ChartController } from '../../src/chart/adapter';
import type { LocalAlert } from '../../src/domain/alerts';

// The drawing source picker (catalog choices) and the alert form for channels and the vertical line, under
// the shared controlled hook/node model. SYNTHETIC drawings and data only.
const day = 1704153600, t = (index: number) => (day + index * 86400) * 1000;
const data = fixtureDataset('GME', 500); data.bars = [10, 11, 12, 13].map((value, index) => ({ time: day + index * 86400, open: value, high: value + 1, low: value - 1, close: value, volume: 100 }));
const drawingsList = () => [
  { id: 'pc-internal-1', type: 'parallelchannel', paneId: 'price', anchors: [{ time: t(0), price: 10 }, { time: t(3), price: 13 }, { time: t(1), price: 15 }] },
  { id: 'vl-internal-2', type: 'vline', paneId: 'price', anchors: [{ time: t(6), price: 1 }] },
  { id: 'tl-internal-3', type: 'trendline', paneId: 'price', anchors: [{ time: t(0), price: 9 }, { time: t(2), price: 11 }] },
  { id: 'tl-internal-4', type: 'trendline', paneId: 'price', anchors: [{ time: t(1), price: 9 }, { time: t(2), price: 12 }] },
  { id: 'rg-internal-5', type: 'regressionchannel', paneId: 'price', anchors: [{ time: t(0), price: 9 }, { time: t(2), price: 12 }] },
];
function controller(scale = 'linear', drawings = drawingsList()) {
  const bars = data.bars, source = sourceContextForDataset(data, bars);
  return { getSourceContext: () => source, getStyle: () => 'candles', getDataWindow: () => ({ pending: false, source, series: { count: bars.length, firstTime: bars[0]!.time, lastTime: bars.at(-1)!.time, style: 'candles' } }), indicators: { serialize: () => [] }, saveDrawings: () => ({ version: 1, drawings: structuredClone(drawings) }), getChartOptions: () => ({ scale }) } as unknown as ChartController;
}
const capture = (scale = 'linear') => { let id = 0; return new TechnicalAlertCatalog(() => String(++id)).capture(controller(scale), data, data.bars, []); };

describe('drawing choices in the source picker', () => {
  it('offers channels and the vertical line alone, lines against the price, all following the drawing and named without ids', () => {
    const choices = capture(), drawing = choices.filter(row => row.id.startsWith('drawing:') || row.id.startsWith('boundary:'));
    const channel = choices.find(row => row.id === 'drawing:pc-internal-1')!;
    expect(channel.label).toBe('Parallel channel: close in the channel'); expect(channel.drawingShape).toBe('channel'); expect(channel.targetOnly).toBeUndefined();
    expect(channel.source).toMatchObject({ kind: 'drawing-boundary', mutationPolicy: 'follow', geometry: { schemaVersion: 2, shape: 'channel', name: 'Parallel channel' } });
    const vertical = choices.find(row => row.id === 'drawing:vl-internal-2')!;
    expect(vertical.label).toBe('Vertical line: time reaching the line'); expect(vertical.drawingShape).toBe('time');
    expect(choices.find(row => row.id === 'drawing:tl-internal-3')!.label).toBe('Trend line 1');
    expect(choices.find(row => row.id === 'drawing:tl-internal-4')!.label).toBe('Trend line 2');
    expect(choices.find(row => row.id === 'boundary:tl-internal-3')).toMatchObject({ label: 'Trend line 1', targetOnly: true });
    expect(choices.find(row => row.id === 'drawing:tl-internal-3')!.source).toMatchObject({ kind: 'comparison', right: { mutationPolicy: 'follow' } });
    const regression = choices.find(row => row.id === 'drawing:rg-internal-5')!;
    expect(regression.source).toBeNull(); expect(regression.disabledReason).toMatch(/Regression trend/);
    for (const row of drawing) expect(row.label).not.toMatch(/internal/);
  });
  it('captures on a logarithmic price scale too (version 1 refused it)', () => {
    const line = capture('logarithmic').find(row => row.id === 'boundary:tl-internal-3')!;
    expect(line.disabledReason).toBeUndefined();
    expect(line.source).toMatchObject({ geometry: { coordinateModel: 'logical-bar-log-price' } });
  });
  it('keeps one source identity while bars arrive and the drawing is unchanged; a move is a new identity', () => {
    let id = 0; const catalog = new TechnicalAlertCatalog(() => String(++id)), list = drawingsList();
    const first = catalog.capture(controller('linear', list), data, data.bars, []).find(row => row.id === 'drawing:pc-internal-1')!.source;
    expect(catalog.capture(controller('linear', list), data, data.bars, []).find(row => row.id === 'drawing:pc-internal-1')!.source).toEqual(first);
    list[0].anchors[2].price = 20;
    expect(catalog.capture(controller('linear', list), data, data.bars, []).find(row => row.id === 'drawing:pc-internal-1')!.source).not.toEqual(first);
  });
});

function channelSource(type: 'parallelchannel' | 'vline'): AlertSourceSnapshot {
  const prepared = prepareDrawingAlertGrid(data.bars, { source: sourceContextForDataset(data), style: 'candles', scale: 'linear' }); if (!prepared.ok) throw Error(prepared.diagnostics.join(' '));
  const record = drawingsList().find(row => row.type === type)!, captured = prepared.grid.captureShape(record); if (!captured.ok) throw Error(captured.diagnostics.join(' '));
  return { kind: 'drawing-boundary', instanceId: record.id, snapshotId: 'SYNTHETIC-snapshot', geometry: captured.snapshot, mutationPolicy: 'follow' };
}
function drawingUi(type: 'parallelchannel' | 'vline') {
  const ui = setup([]), source = channelSource(type), choiceId = 'drawing:' + (type === 'vline' ? 'vl-internal-2' : 'pc-internal-1');
  const context = alertObservationContext(createAlertObservationSession(data, { version: 2, chartId: 'SYNTHETIC chart', sessionId: 'SYNTHETIC session', mode: 'ordinary', startedAt: 100, source }), data);
  const key = () => { ui.props.sourceSelectionKey = `${ui.props.selectedSourceId}|${ui.props.targetSourceId}`; };
  const onSourceChange = vi.fn((id: string) => { ui.props.selectedSourceId = id; key(); }), onTargetChange = vi.fn((id: string) => { ui.props.targetSourceId = id; key(); });
  Object.assign(ui.props, { instrument: data.instrument, context, contexts: [context], validateCurrentSource: vi.fn(), onSourceChange, onTargetChange, selectedSourceId: 'price:close:chart', targetSourceId: 'constant', sourceChoices: [
    { id: 'price:close:chart', label: 'Price CLOSE (standard)', source: { kind: 'price', field: 'close', transformId: 'standard' } },
    { id: choiceId, label: type === 'vline' ? 'Vertical line: time reaching the line' : 'Parallel channel: close in the channel', source, drawingShape: type === 'vline' ? 'time' : 'channel' },
  ] });
  ui.settle();
  return { ui, choiceId };
}
const conditionLabels = (ui: ReturnType<typeof setup>) => all(ui.field('Alert condition'), node => node.type === 'option').map(node => text(node));
const submit = (ui: ReturnType<typeof setup>) => { invoke(ui.find(node => node.type === 'form').props.onSubmit, { preventDefault: vi.fn() }); ui.settle(); };

describe('the alert form for a drawing', () => {
  it('a channel offers Entering, Exiting, Inside, Outside without bound fields and saves the bounds 0 and 1', () => {
    const { ui, choiceId } = drawingUi('parallelchannel');
    ui.callButton('Create alert'); ui.change('Technical alert source', choiceId); ui.settle();
    expect(conditionLabels(ui)).toEqual(['Inside channel', 'Outside channel', 'Entering channel', 'Exiting channel']);
    expect(ui.field('Alert condition').props.value).toBe('entering');
    expect(all(ui.render(), node => node.props['aria-label'] === 'Alert lower bound')).toEqual([]);
    expect(all(ui.render(), node => node.props['data-lv-drawing-channel'] !== undefined)).toHaveLength(1);
    expect(ui.field('Alert name').props.value).toBe('GME Parallel channel alert');
    ui.change('Alert condition', 'exiting');
    submit(ui);
    expect(ui.publish).toHaveBeenCalledTimes(1);
    const [saved] = ui.props.alerts as LocalAlert[];
    expect(saved.definition.condition).toEqual({ kind: 'exiting', lower: 0, upper: 1 });
    expect(text(ui.row(saved.definition.id))).toContain('Exiting Parallel channel');
    expect(text(ui.row(saved.definition.id))).not.toContain('internal');
  });
  it('a vertical line offers only Reaching the line and saves Crossing up 0', () => {
    const { ui, choiceId } = drawingUi('vline');
    ui.callButton('Create alert'); ui.change('Technical alert source', choiceId); ui.settle();
    expect(conditionLabels(ui)).toEqual(['Reaching the line']);
    expect(all(ui.render(), node => node.props['aria-label'] === 'Alert level')).toEqual([]);
    submit(ui);
    const [saved] = ui.props.alerts as LocalAlert[];
    expect(saved.definition.condition).toEqual({ kind: 'crossing-up', value: 0 });
    expect(text(ui.row(saved.definition.id))).toContain('Reaching Vertical line');
  });
  it('opened from the drawing (its source already selected) the form starts with a condition the channel takes', () => {
    const { ui, choiceId } = drawingUi('parallelchannel');
    ui.props.selectedSourceId = choiceId; ui.props.sourceSelectionKey = `${choiceId}|constant`;
    ui.callButton('Create alert'); ui.settle();
    expect(ui.field('Alert condition').props.value).toBe('entering');
  });
});

it('the drawings for followed alerts include the saved rows of other charts of the symbol, kept by content', () => {
  const alerts = [{ definition: { observationBinding: { source: channelSource('parallelchannel') } } }] as unknown as LocalAlert[];
  const own = { drawings: [{ id: 'a', type: 'hline', anchors: [{ time: t(0), price: 1 }] }] }, saved = [{ id: 'a', type: 'hline', anchors: [{ time: t(0), price: 99 }] }, { id: 'b', type: 'box', anchors: [] }];
  const first = legacyDrawingRows(alerts, own, null, saved)!;
  expect(first.rows.map(row => (row as { id: string }).id)).toEqual(['a', 'b']);
  expect((first.rows[0] as { anchors: Array<{ price: number }> }).anchors[0].price).toBe(1);
  expect(legacyDrawingRows(alerts, structuredClone(own), first, structuredClone(saved))).toBe(first);
  expect(legacyDrawingRows([], own, null, saved)).toBeNull();
});
