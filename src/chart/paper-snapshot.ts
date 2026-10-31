import type { ChartExportFrame } from './image-export';
import { paperExecutionPlacement, PAPER_EXECUTION_ARROW_PX, type PaperExecutionMark } from './paper-executions';
import { paperLabelLayout, paperLineDraws, type PaperChartLine } from '../ui/PaperChartLines';

/**
 * Chart settings > Trading > "Orders, executions, and positions in chart snapshots"
 * (trading.visibilityOnScreenshotTitle, reference default off). The virtual order, position and exit lines and the execution
 * marks are DOM overlays, so the chart canvas export does not hold them; with the row checked the export paints the same
 * rows onto the image, in the overlay colors. Geometry is our own choice: a line off the price pane is left out (the live overlay
 * pins it to the edge for dragging, which a picture does not need), labels sit where Order and position alignment puts them,
 * and Extended price lines off draws the short segment. Buttons (cancel, close, reverse) and the axis tags are not painted.
 * The chips use the screen's collision layout (paperLabelLayout), so crowded labels
 * move to the nearest free height (or step sideways) instead of painting over each other; each line stays at its price.
 */
export const PAPER_SNAPSHOT_COLORS = Object.freeze({ buy: '#2f7fd1', sell: '#c9483f', position: '#d9a441', tp: '#2f9d63', sl: '#c9483f', text: '#ffffff' });
export interface PaperSnapshotScene {
  lines: readonly PaperChartLine[];
  /** Execution marks to paint; empty when Execution marks is off. */
  marks: readonly PaperExecutionMark[];
  /** Execution labels. */
  labels: boolean;
  alignment: 'left' | 'center' | 'right';
  extendLines: boolean;
}
/** Right-aligned labels keep the overlay's 64 px gap before the price scale (PaperChartLines). */
const LABEL_GAP = 64, CHIP_HEIGHT = 18, CHIP_PAD = 6, LABEL_FONT = 11;

function lineColor(line: PaperChartLine): string {
  if (line.kind === 'position') return PAPER_SNAPSHOT_COLORS.position;
  if (line.kind === 'exit') return line.leg === 'tp' ? PAPER_SNAPSHOT_COLORS.tp : PAPER_SNAPSHOT_COLORS.sl;
  return line.side === 'buy' ? PAPER_SNAPSHOT_COLORS.buy : PAPER_SNAPSHOT_COLORS.sell;
}
const lineDash = (line: PaperChartLine): number[] => line.kind === 'position' ? [] : line.kind === 'market' ? [1, 2] : [4, 4];

/** Paints the scene onto an export canvas. Returns how many lines and marks were painted. */
export function paintPaperSnapshot(ctx: CanvasRenderingContext2D, scene: PaperSnapshotScene, frame: ChartExportFrame): number {
  const k = frame.scale, { left, top, width, height } = frame.plot, right = left + width, bottom = top + height;
  if (!(k > 0) || !(width > 0) || !(height > 0)) return 0;
  let painted = 0;
  ctx.save();
  try {
    ctx.font = `${LABEL_FONT * k}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
    const onPane = scene.lines.filter(line => { const y = frame.priceToY(line.price); return Number.isFinite(y) && y >= top && y <= bottom; });
    // Lines are never moving in a picture, so the tick size (only used to relabel a dragged line) is not read.
    const projection = { left, top, width, height, priceToY: frame.priceToY, yToPrice: () => NaN };
    const spots = paperLabelLayout(paperLineDraws(onPane, projection, line => line.price, null, 1), projection, { alignment: scene.alignment });
    for (const line of onPane) {
      const y = frame.priceToY(line.price), spot = spots.get(line.id), labelY = spot ? top + spot.center : y, dx = spot ? spot.dx : 0;
      const color = lineColor(line), py = Math.round(y * k) + 0.5;
      const from = !scene.extendLines ? scene.alignment === 'left' ? left + LABEL_GAP : scene.alignment === 'center' ? left + width / 2 : right - LABEL_GAP : left;
      ctx.strokeStyle = color; ctx.lineWidth = k; ctx.setLineDash(lineDash(line).map(step => step * k));
      ctx.beginPath(); ctx.moveTo(from * k, py); ctx.lineTo(right * k, py); ctx.stroke(); ctx.setLineDash([]);
      const textWidth = ctx.measureText(line.label).width, chipWidth = textWidth + 2 * CHIP_PAD * k;
      const chipLeft = (scene.alignment === 'left' ? (left + LABEL_GAP) * k : scene.alignment === 'center' ? (left + width / 2) * k - chipWidth / 2 : (right - LABEL_GAP) * k - chipWidth) + dx * k;
      ctx.fillStyle = color; ctx.fillRect(chipLeft, labelY * k - CHIP_HEIGHT * k / 2, chipWidth, CHIP_HEIGHT * k);
      ctx.fillStyle = PAPER_SNAPSHOT_COLORS.text; ctx.textAlign = 'center'; ctx.fillText(line.label, chipLeft + chipWidth / 2, labelY * k);
      painted++;
    }
    const half = PAPER_EXECUTION_ARROW_PX * 0.6;
    for (const mark of scene.marks) {
      let x: number | null = null;
      try { x = frame.timeToX(mark.barTime); } catch { x = null; }
      const y = frame.priceToY(mark.price);
      if (x === null || !Number.isFinite(x) || !Number.isFinite(y) || x < left || x > right || y < top - 40 || y > bottom + 40) continue;
      const place = paperExecutionPlacement(mark.side, x, y), color = mark.side === 'buy' ? PAPER_SNAPSHOT_COLORS.buy : PAPER_SNAPSHOT_COLORS.sell;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(place.x * k, place.tipY * k); ctx.lineTo((place.x - half) * k, place.baseY * k); ctx.lineTo((place.x + half) * k, place.baseY * k); ctx.closePath(); ctx.fill();
      if (scene.labels) {
        const w = ctx.measureText(mark.label).width + 8 * k, labelTop = place.direction === 'up' ? place.baseY + 2 : place.baseY - 18;
        ctx.fillRect(place.x * k - w / 2, labelTop * k, w, 16 * k);
        ctx.fillStyle = PAPER_SNAPSHOT_COLORS.text; ctx.textAlign = 'center'; ctx.fillText(mark.label, place.x * k, (labelTop + 8) * k);
      }
      painted++;
    }
  } finally { ctx.restore(); }
  return painted;
}
