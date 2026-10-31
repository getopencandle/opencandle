// The adapter-owned onIntent seam no longer blocks native Clone, the seam is
// restored exactly after the command, an unregistered own method is still refused, scrolling is not an undo step, and
// undo/redo keep the current viewport of an unchanged chart source.
import {expect, it} from 'vitest';
import {createDrawing, deserializeDrawing, type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {prepareNativeDrawingInsert, registerDrawingIntentSeam} from '../../src/chart/drawing-duplicate-native';
import {nativeDrawingHarness} from './drawing-native-harness';
import {changedChartGrid, keepCurrentViewports} from '../../src/ui/workspace-history';
import {createInitialWorkspace} from '../../src/ui/workspace-state';

function row(id = 'SYNTHETIC-original'): SerializedDrawing {
  return createDrawing('trendline', {id, paneId: 'price', zIndex: 1, anchors: [{time: 1000000, price: 100}, {time: 1240000, price: 200}], style: {lineColor: '#123456', lineWidth: 3, lineStyle: 'solid'}})!.serialize();
}
async function setup() {
  const native = await nativeDrawingHarness(), document = new LosslessDrawingDocument(), original = row();
  document.load({version: 1, drawings: [original]}); native.controller.fromJSON({version: 1, drawings: [original]});
  const copy = {...structuredClone(document.all()[0]), id: 'SYNTHETIC-copy', zIndex: 2};
  const projected = [deserializeDrawing(copy as unknown as SerializedDrawing)!.serialize()];
  const host = {assertCurrent() {}, assertWorkspaceCapacity() {}};
  return {native, prepare: () => prepareNativeDrawingInsert({ctrl: native.controller}, projected, host)};
}

it('admits the registered adapter onIntent seam, inserts the clone and restores the seam exactly', async () => {
  const f = await setup();
  try {
    const ctrl = f.native.controller as unknown as {onIntent: (intent: unknown) => void};
    const seam = function (this: unknown, intent: unknown) { return Reflect.apply(Object.getPrototypeOf(ctrl).onIntent, this, [intent]); };
    ctrl.onIntent = seam; registerDrawingIntentSeam(ctrl, seam);
    const helper = f.prepare(); const result = helper.insert();
    expect(result.state).toBe('complete'); expect(f.native.controller.store.has('SYNTHETIC-copy')).toBe(true);
    helper.dispose();
    expect(Object.getOwnPropertyDescriptor(ctrl, 'onIntent')?.value).toBe(seam);
  } finally { f.native.dispose(); }
});

it('still refuses an unregistered own onIntent', async () => {
  const f = await setup();
  try {
    (f.native.controller as unknown as {onIntent: () => void}).onIntent = () => undefined;
    expect(() => f.prepare()).toThrow(/already owned: onIntent/);
  } finally { f.native.dispose(); }
});

it('records no undo step for a viewport-only change and keeps the current viewport on restore', () => {
  const base = createInitialWorkspace(), id = base.grid!.layout.activeCellId;
  const scrolled = structuredClone(base); scrolled.grid!.cells[id].viewport = {from: 100, to: 200};
  expect(changedChartGrid(base, scrolled)).toBe(false);
  const drawn = structuredClone(scrolled); drawn.grid!.cells[id].drawings = {version: 1, drawings: [row() as never]} as never;
  expect(changedChartGrid(scrolled, drawn)).toBe(true);
  const historical = structuredClone(base); historical.grid!.cells[id].viewport = {from: 1, to: 2};
  expect(keepCurrentViewports(drawn, historical).grid!.cells[id].viewport).toEqual({from: 100, to: 200});
  expect(keepCurrentViewports(drawn, historical, {[id]: {from: 150, to: 260}}).grid!.cells[id].viewport).toEqual({from: 150, to: 260});
  const otherSource = structuredClone(historical); otherSource.grid!.cells[id].datasetId = 'SYNTHETIC-other';
  expect(keepCurrentViewports(drawn, otherSource).grid!.cells[id].viewport).toEqual({from: 1, to: 2});
});
