// Scalable placement for the calendar flags. Pure functions, no DOM. Same results as the per-index
// `calendarMarkerOffset` (kept in calendar-chart-markers.ts as the reference), in O(n) for a whole list instead of O(n^2).
import type { CalendarChartMarker } from './calendar-chart-markers';

/** Offsets for every marker in one pass: markers sharing a bar sit side by side, in list order, centered on the bar. */
export function calendarMarkerOffsets(markers: readonly { barTime: number }[], size = 16): number[] {
  const total = new Map<number, number>();
  for (const marker of markers) total.set(marker.barTime, (total.get(marker.barTime) ?? 0) + 1);
  const seen = new Map<number, number>(), offsets: number[] = new Array(markers.length);
  for (let i = 0; i < markers.length; i++) {
    const time = markers[i].barTime, count = total.get(time)!, rank = seen.get(time) ?? 0; seen.set(time, rank + 1);
    offsets[i] = count < 2 ? 0 : (rank - (count - 1) / 2) * (size + 2);
  }
  return offsets;
}
export interface PlacedCalendarMarker { marker: CalendarChartMarker; x: number }
/**
 * Visible flags only: `xs[i]` is the client x of markers[i] (NaN when unknown), `offsets` from calendarMarkerOffsets. A flag is
 * culled before any further work when its centre is more than one badge size outside [0, width].
 */
export function layoutCalendarMarkers(markers: readonly CalendarChartMarker[], xs: ArrayLike<number>, offsets: readonly number[], left: number, width: number, size = 16): PlacedCalendarMarker[] {
  const out: PlacedCalendarMarker[] = [];
  for (let i = 0; i < markers.length; i++) {
    const clientX = xs[i]; if (!(clientX === clientX)) continue;
    const x = clientX - left + offsets[i];
    if (x < -size || x > width + size) continue;
    out.push({ marker: markers[i], x });
  }
  return out;
}

/** Most stacked rows of flags; a flag that would need more shares the row that ends first. */
export const CALENDAR_MARKER_MAX_LANES = 3;
/**
 * Stack rows for placed flags so neighbours that would overlap (dense bars, e.g. economic flags on adjacent 1D bars) go up one
 * row instead: greedy by x, each flag takes the lowest row whose last flag ends at least `gap` px before it. Returns one row
 * index per placed flag (0 = the base row), in the input order.
 */
export function calendarMarkerLanes(placed: readonly { x: number }[], size = 16, gap = 2, maxLanes = CALENDAR_MARKER_MAX_LANES): number[] {
  const order = placed.map((_, index) => index).sort((a, b) => placed[a].x - placed[b].x || a - b), ends: number[] = [], lanes = new Array<number>(placed.length);
  for (const index of order) {
    const left = placed[index].x - size / 2;
    let lane = ends.findIndex(end => left >= end + gap);
    if (lane < 0) { if (ends.length < maxLanes) lane = ends.length; else { lane = 0; for (let i = 1; i < ends.length; i++) if (ends[i] < ends[lane]) lane = i; } }
    ends[lane] = left + size; lanes[index] = lane;
  }
  return lanes;
}
