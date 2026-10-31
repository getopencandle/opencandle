import { describe, expect, it } from 'vitest';
import { calendarMarkerOffset, type CalendarChartMarker } from '../../src/domain/calendar-chart-markers';
import { calendarMarkerOffsets, layoutCalendarMarkers } from '../../src/domain/calendar-marker-layout';

// Oracle: the O(n^2) function as it shipped before CAL-PERF 1028.
function oldOffset(markers: readonly CalendarChartMarker[], index: number, size = 16): number {
  const marker = markers[index], shared = markers.filter(row => row.barTime === marker.barTime);
  return shared.length < 2 ? 0 : (shared.indexOf(marker) - (shared.length - 1) / 2) * (size + 2);
}
function rng(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function fixture(count: number, seed: number, bars = Math.max(10, count >> 1)): CalendarChartMarker[] {
  const r = rng(seed), kinds = ['earnings', 'dividend', 'split', 'ipo', 'economic'] as const, out: CalendarChartMarker[] = [];
  for (let i = 0; i < count; i++) { const barTime = 1_600_000_000 + Math.floor(r() * bars) * 86400, kind = kinds[Math.floor(r() * 5)]; out.push({ key: `${kind}:${barTime}:${i}`, kind, barTime, letter: 'E', color: 'c', entries: [], lines: [], label: '', synthetic: true }); }
  return out.sort((a, b) => a.barTime - b.barTime);
}
describe('CAL-PERF 1028 calendar flag layout', () => {
  it('matches the old O(n^2) offsets exactly on random fixtures', () => {
    for (const [n, seed, bars] of [[0, 1, 5], [1, 2, 5], [60, 3, 10], [400, 4, 150], [700, 5, 20], [700, 6, 5000]] as const) {
      const markers = fixture(n, seed, bars), fast = calendarMarkerOffsets(markers, 16);
      for (let i = 0; i < n; i++) { expect(fast[i]).toBe(oldOffset(markers, i)); expect(calendarMarkerOffset(markers, i)).toBe(oldOffset(markers, i)); }
    }
  });
  it('culls and places like the old per-index loop', () => {
    const markers = fixture(500, 9, 120), xs = markers.map((m, i) => (i % 17 === 0 ? NaN : (m.barTime - 1_600_000_000) / 86400 * 11 - 300)), left = 40, width = 800, size = 16;
    const expected = markers.flatMap((marker, index) => { const c = xs[index]; if (Number.isNaN(c)) return []; const x = c - left + oldOffset(markers, index, size); return x < -size || x > width + size ? [] : [{ marker, x }]; });
    const got = layoutCalendarMarkers(markers, Float64Array.from(xs), calendarMarkerOffsets(markers, size), left, width, size);
    expect(got.length).toBeGreaterThan(0); expect(got.length).toBeLessThan(markers.length);
    expect(got).toEqual(expected);
  });
  it('benchmark: layout time per pass at 500 and 2,000 events', () => {
    const lines: string[] = [];
    for (const n of [500, 2000]) {
      const markers = fixture(n, 11, n >> 1), xs = Float64Array.from(markers.map(m => (m.barTime - 1_600_000_000) / 86400 * 9));
      const time = (fn: () => void, reps: number) => { fn(); const t = performance.now(); for (let i = 0; i < reps; i++) fn(); return (performance.now() - t) / reps; };
      const before = time(() => { let s = 0; for (let i = 0; i < n; i++) { const x = xs[i] + oldOffset(markers, i, 16); if (x > -16 && x < 900) s++; } return void s; }, n > 1000 ? 5 : 20);
      const after = time(() => { layoutCalendarMarkers(markers, xs, calendarMarkerOffsets(markers, 16), 0, 900, 16); }, 200);
      lines.push(`${n} events: old ${before.toFixed(3)} ms, new ${after.toFixed(3)} ms`);
      expect(after).toBeLessThan(before);
    }
    console.log('CAL-PERF bench: ' + lines.join(' | '));
  });
});
