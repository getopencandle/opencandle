import { describe, expect, it } from 'vitest';
import { paintPaperSnapshot } from '../../src/chart/paper-snapshot';
import { paperLabelLayout, paperLineDraws, type PaperChartLine } from '../../src/ui/PaperChartLines';

// The exported image lays the order and position chips out the way the screen does (
// paperLabelLayout), so crowded labels no longer paint over each other. SYNTHETIC lines and prices; virtual money only.
function recorder() {
  const calls: { op: string; args: unknown[]; fill?: unknown }[] = [];
  const ctx: Record<string, unknown> = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic' };
  for (const op of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'closePath', 'fillRect', 'fillText'])
    ctx[op] = (...args: unknown[]) => { calls.push({ op, args, fill: ctx.fillStyle }); };
  ctx.setLineDash = () => { /* dash is not under test here */ };
  ctx.measureText = (text: string) => ({ width: text.length * 6 });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
const line = (id: string, price: number, label: string, kind: PaperChartLine['kind'] = 'order'): PaperChartLine => ({ id, kind, side: kind === 'position' ? 'buy' : 'sell', price, label, quantity: 1 });
const frame = { scale: 2, plot: { left: 0, top: 0, width: 400, height: 300 }, priceToY: (price: number) => (120 - price) * 10, timeToX: (seconds: number) => seconds };
type Rect = { x: number; y: number; w: number; h: number };
const chips = (calls: ReturnType<typeof recorder>['calls']): Rect[] => calls.filter(call => call.op === 'fillRect').map(call => { const [x, y, w, h] = call.args as number[]; return { x, y, w, h }; });
const intersect = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe('paper snapshot chips use the screen label layout', () => {
  it('three lines a pixel apart paint three chips that do not overlap, each line still at its own price', () => {
    const lines = [line('pos', 100, 'Long 2 at 100.00', 'position'), line('a', 100.1, 'Sell limit 1 at 100.10'), line('b', 99.9, 'Sell stop 1 at 99.90')];
    const { ctx, calls } = recorder();
    expect(paintPaperSnapshot(ctx, { lines, marks: [], labels: false, alignment: 'right', extendLines: true }, frame)).toBe(3);
    const rects = chips(calls);
    expect(rects).toHaveLength(3);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(intersect(rects[i], rects[j]), `${i} ${j}`).toBe(false);
    // The lines themselves stay at their prices (y * scale + 0.5).
    const ys = calls.filter(call => call.op === 'lineTo').map(call => (call.args as number[])[1]);
    expect(ys).toEqual([400.5, 398.5, 402.5]);
  });
  it('the chip centers are the ones paperLabelLayout gives the on-screen chips', () => {
    const lines = [line('pos', 100, 'Long 2 at 100.00', 'position'), line('a', 100.1, 'Sell limit 1 at 100.10')];
    const projection = { ...frame.plot, priceToY: frame.priceToY, yToPrice: () => NaN };
    const spots = paperLabelLayout(paperLineDraws(lines, projection, row => row.price, null, 1), projection, { alignment: 'right' });
    const { ctx, calls } = recorder();
    paintPaperSnapshot(ctx, { lines, marks: [], labels: false, alignment: 'right', extendLines: true }, frame);
    const texts = calls.filter(call => call.op === 'fillText').map(call => ({ label: call.args[0], y: call.args[2] }));
    expect(texts).toEqual([{ label: 'Long 2 at 100.00', y: spots.get('pos')!.center * 2 }, { label: 'Sell limit 1 at 100.10', y: spots.get('a')!.center * 2 }]);
    expect(spots.get('pos')!.center).toBe(200);
    expect(spots.get('a')!.center).not.toBe(199);
  });
  it('lines far apart keep their chips on their lines, and a line off the pane is still left out', () => {
    const lines = [line('pos', 100, 'Long 2 at 100.00', 'position'), line('a', 110, 'Sell limit 1 at 110.00'), line('far', 1000, 'far away')];
    const { ctx, calls } = recorder();
    expect(paintPaperSnapshot(ctx, { lines, marks: [], labels: false, alignment: 'left', extendLines: false }, frame)).toBe(2);
    const texts = calls.filter(call => call.op === 'fillText').map(call => [call.args[0], call.args[2]]);
    expect(texts).toEqual([['Long 2 at 100.00', 400], ['Sell limit 1 at 110.00', 200]]);
  });
});
