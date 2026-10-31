// Findings (alert level from an indicator source, add-on legend in inactive cells, Trading rail
// toggle, plot focus frame, layout toast over the trading controls).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { setup } from '../helpers/alert-dialog-harness';
import { captureIndicatorAlertSource } from '../../src/domain/technical-alerts';
import { encodeIndicatorSource } from '../../src/domain/indicator-source';
import { indicatorOnIndicatorPlots } from '../../src/ui/CellStudyLegend';
import { toastShift, TOAST_CLEARANCE } from '../../src/ui/toast-placement';

const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8');

it('#1 an alert created on an RSI (Object tree, legend) defaults its level to the RSI value, not the price', () => {
  const rsi = captureIndicatorAlertSource({ id: 'rsi-1', kind: 'rsi', inputs: { length: 14, source: 'close' }, plots: {}, offset: 0, visible: true }, 'rsi', 'standard', 'SYNTHETIC snap');
  const choice = { id: 'indicator:rsi-1:rsi', label: 'RSI', source: rsi };
  const ui = setup([]);
  const price = { kind: 'price', field: 'close', transformId: 'standard' } as never;
  const contextOf = (source: unknown) => ({ instrumentId: ui.props.instrument.id, sourceId: 'x', mode: 'ordinary', runId: 'ordinary', binding: { schemaVersion: 2, chartId: 'c', source } }) as never;
  Object.assign(ui.props, { open: true, context: contextOf(price), event: { value: 22.22 }, selectedSourceId: 'price:close:chart', sourceChoices: [{ id: 'price:close:chart', label: 'Close', source: price }, choice], onSourceChange: () => undefined, onTargetChange: () => undefined });
  ui.settle();
  ui.props.createRequest = { sourceId: choice.id }; ui.settle();
  expect(ui.field('Alert level').props.value).toBe('22.22');
  // The host selects the requested source and its observation arrives.
  Object.assign(ui.props, { selectedSourceId: choice.id, sourceSelectionKey: choice.id + '|constant', context: contextOf(rsi), event: { value: 38.8312 } }); ui.settle();
  expect(ui.field('Alert level').props.value).toBe('38.83');
  expect(ui.field('Alert name').props.value).toBe('GME RSI alert');
  // A later price tick of the same source does not keep overwriting the level.
  ui.props.event = { value: 40.1 } as never; ui.settle();
  expect(ui.field('Alert level').props.value).toBe('38.83');
});

it('#2 an indicator calculated on another indicator reads its values for an inactive cell legend', () => {
  const bars = [{ time: 10 }, { time: 20 }, { time: 30 }];
  const chart = { getSourceBars: () => bars, indicators: { peekValues: () => ({ series: [{ id: 'sma', values: [null, 34.5, 35.86] }] }), values: () => { throw new Error('unused'); } } } as never;
  const row = { id: 'sma-on-rsi', kind: 'sma', plots: {}, inputs: { length: 9, source: encodeIndicatorSource('rsi-1', 'rsi') } } as never;
  expect(indicatorOnIndicatorPlots(chart, row, null)?.plots[0].value).toBe(35.86);
  expect(indicatorOnIndicatorPlots(chart, row, 20)?.plots[0].value).toBe(34.5);
  expect(indicatorOnIndicatorPlots(chart, row, 15)?.plots[0].value).toBeNull();
  expect(indicatorOnIndicatorPlots(chart, { ...(row as object), inputs: { length: 9, source: 'close' } } as never, null)).toBeNull();
});

it('#3 the Paper trading rail button toggles the bottom Trading panel', () => {
  expect(app).toMatch(/id:'paper',[^\n]*pressed:bottomView\.open&&bottomView\.tab==='trading',onSelect:\(\)=>setPaperDockOpen\(!\(bottomView\.open&&bottomView\.tab==='trading'\)\)/);
  expect(app).toMatch(/setPaperDockOpen=useCallback\(\(open:boolean\)=>\{changeBottomPanel\(view=>open\?openBottomTab\(view,'trading'\):view\.tab==='trading'\?collapseBottomPanel\(view\):view\)/);
});

it('#4 the chart keyboard canvas draws no focus frame; buttons and inputs keep their focus ring', () => {
  expect(css).toContain('canvas[role=application]:focus,canvas[role=application]:focus-visible{outline:none}');
  expect(css).toContain('button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--lv-focus-ring)');
});

it('#5 the status toast moves below trading controls it would cover, and only then', () => {
  const toast = { left: 643, top: 156, right: 797, bottom: 190 };
  const rightCellButtons = { left: 731, top: 149, right: 947, bottom: 185 }, leftCellButtons = { left: 63, top: 149, right: 279, bottom: 185 };
  expect(toastShift(toast, [leftCellButtons], 920)).toBe(0);
  const shift = toastShift(toast, [leftCellButtons, rightCellButtons], 920);
  expect(shift).toBe(185 + TOAST_CLEARANCE - 156);
  expect(toast.top + shift).toBeGreaterThanOrEqual(rightCellButtons.bottom + TOAST_CLEARANCE);
  // Stacked obstacles push it past both; no room keeps it in place.
  expect(toastShift(toast, [rightCellButtons, { left: 700, top: 190, right: 760, bottom: 230 }], 920)).toBe(230 + TOAST_CLEARANCE - 156);
  expect(toastShift(toast, [rightCellButtons], 200)).toBe(0);
  // Empty (hidden) rects are ignored.
  expect(toastShift(toast, [{ left: 700, top: 160, right: 700, bottom: 160 }], 920)).toBe(0);
  expect(css).toContain('transform:translateY(var(--lv-toast-shift,0px))');
  expect(app).toContain("ref={placeToast");
});
