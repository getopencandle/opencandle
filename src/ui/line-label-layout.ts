/**
 * One collision layout for the labels (chips) of the price pane's DOM lines: virtual order, position, exit and
 * market projection lines (PaperChartLines) and alert lines (AlertChartLines). A short pane (bottom panel open) used to put two
 * close lines' chips on top of each other, so "Move Buy limit 3 at 22.03" covered the Long position's Reverse button.
 *
 * Like the reference, a line stays at its price and only its label moves: each label is placed in request order (the caller
 * puts the most important first) at the nearest free height, up or down, inside the pane. When the pane is too short for a
 * free height, the label steps sideways past the labels it would cover. Labels that do not share any horizontal span (left
 * aligned alert chips and right aligned order chips) never push each other. All values are pane-relative CSS px. The label
 * widths are estimates that err wide (11 px system-ui), so a measured label is never wider than its slot.
 */
export interface LineLabelRect { left: number; top: number; right: number; bottom: number }
export interface LineLabelRequest {
  id: string;
  /** Center the label wants (its line's y). */
  y: number;
  height: number;
  /** Horizontal span at the label's own anchor. */
  left: number; right: number;
  /** Which way the label steps when no free height is left: toward the pane's left ('left') or right ('right'). */
  step: 'left' | 'right';
  /** Keeps its height whatever it covers (the label being dragged or confirmed). */
  anchor?: boolean;
}
export interface LineLabelSpot {
  id: string;
  y: number;
  /** Center the label is drawn at. */
  center: number;
  /** Sideways shift from its anchor, px (negative = toward the left). */
  dx: number;
  rect: LineLabelRect;
  /** True when no free place was found; the label then sits at its line and z-order decides who is on top. */
  overlaps: boolean;
}
/** Space kept between two labels. */
export const LINE_LABEL_GAP = 2;
/** Width estimate per character of 11 px system-ui, wide on purpose. */
export const LINE_LABEL_CHAR_PX = 6.5;
export const LINE_LABEL_PAD_PX = 12;
/** A one-glyph button (close, cancel, reverse) and the TP/SL drag handle, estimates. */
export const LINE_LABEL_BUTTON_PX = 20;
export const LINE_LABEL_HANDLE_PX = 46;
export function estimateLabelTextWidth(text: string): number { return Array.from(text).length * LINE_LABEL_CHAR_PX + LINE_LABEL_PAD_PX; }

const EPS = 1e-6;
const xOverlap = (a: LineLabelRect, b: LineLabelRect) => a.left < b.right + LINE_LABEL_GAP - EPS && a.right > b.left - LINE_LABEL_GAP + EPS;
const yOverlap = (a: LineLabelRect, b: LineLabelRect) => a.top < b.bottom + LINE_LABEL_GAP - EPS && a.bottom > b.top - LINE_LABEL_GAP + EPS;
export const labelRectsIntersect = (a: LineLabelRect, b: LineLabelRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export function layoutLineLabels(requests: readonly LineLabelRequest[], pane: { width: number; height: number }, obstacles: readonly LineLabelRect[] = []): Map<string, LineLabelSpot> {
  const out = new Map<string, LineLabelSpot>(), placed: LineLabelRect[] = obstacles.filter(rect => [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)).map(rect => ({ ...rect }));
  const height = Number.isFinite(pane.height) && pane.height > 0 ? pane.height : 0, width = Number.isFinite(pane.width) && pane.width > 0 ? pane.width : 0;
  const rectAt = (request: LineLabelRequest, center: number, dx: number): LineLabelRect => ({ left: request.left + dx, right: request.right + dx, top: center - request.height / 2, bottom: center + request.height / 2 });
  const free = (rect: LineLabelRect) => placed.every(other => !(xOverlap(rect, other) && yOverlap(rect, other)));
  for (const request of requests) {
    if (!Number.isFinite(request.y)) continue;
    const half = request.height / 2, low = half, high = height - half;
    const clamp = (value: number) => high < low ? height / 2 : Math.min(Math.max(value, low), high);
    const wanted = request.anchor ? request.y : clamp(request.y);
    let center = wanted, dx = 0, overlaps = false;
    if (!request.anchor && !free(rectAt(request, wanted, 0))) {
      // The nearest free height is either the wanted one, a pane edge, or touching a label already placed.
      const at = rectAt(request, wanted, 0), candidates = [low, high];
      for (const other of placed) if (xOverlap(at, other)) candidates.push(other.top - LINE_LABEL_GAP - half, other.bottom + LINE_LABEL_GAP + half);
      let best: number | null = null;
      for (const candidate of candidates) {
        if (candidate < low - EPS || candidate > high + EPS || !free(rectAt(request, candidate, 0))) continue;
        if (best === null || Math.abs(candidate - wanted) < Math.abs(best - wanted) - EPS || Math.abs(Math.abs(candidate - wanted) - Math.abs(best - wanted)) <= EPS && candidate < best) best = candidate;
      }
      if (best !== null) center = best;
      else {
        // No free height: step sideways past whatever it covers, while the label stays inside the pane.
        let shift = 0, found = false;
        for (let tries = 0; tries <= placed.length; tries++) {
          const rect = rectAt(request, wanted, shift), blockers = placed.filter(other => xOverlap(rect, other) && yOverlap(rect, other));
          if (!blockers.length) { found = rect.left >= -EPS && rect.right <= width + EPS; break; }
          shift = request.step === 'left' ? Math.min(...blockers.map(other => other.left)) - LINE_LABEL_GAP - request.right : Math.max(...blockers.map(other => other.right)) + LINE_LABEL_GAP - request.left;
        }
        if (found) dx = shift; else overlaps = true;
      }
    }
    const rect = rectAt(request, center, dx);
    placed.push(rect);
    out.set(request.id, { id: request.id, y: request.y, center, dx, rect, overlaps });
  }
  return out;
}
