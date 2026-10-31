import type { Bar } from '../domain/types';

/**
 * Rows of a derived chart (Renko, Kagi, Line break, Point & figure, Range) carry no volume (NaN). Volume never
 * affects a fill, so a missing or negative volume is carried as zero (the same rule as magnifier.ts) and the rows pass the
 * report's finite-number transport and bar checks. A row whose volume is already valid is kept as the same object.
 */
export function strategyReportRows(bars: readonly Bar[]): Bar[] {
  return bars.map(bar => Number.isFinite(bar.volume) && bar.volume >= 0 ? bar : { ...bar, volume: 0 });
}
