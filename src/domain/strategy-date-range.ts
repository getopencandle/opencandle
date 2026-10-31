import type { Bar } from './types';

/**
 * The Strategy tester date range ("Entire history", the last N days, or a custom from/to range). It limits which
 * supplied bars the backtest runs on: bars outside the range carry no fills, the run starts at the initial capital on the
 * first bar inside it, and an open position at the range end stays open (marked at the last in-range close).
 * "Last N days" counts back from the last supplied bar (not the wall clock); custom bounds are whole UTC days,
 * the "to" day inclusive. Script proposals are still computed on the full history, so indicators warm up before the range.
 */
export const STRATEGY_RANGE_DAYS = [7, 30, 90, 365] as const;
export type StrategyRangeDays = typeof STRATEGY_RANGE_DAYS[number];
export type StrategyDateRange = { kind: 'last'; days: StrategyRangeDays } | { kind: 'custom'; from: number | null; to: number | null };
export const SECONDS_IN_DAY = 86400;

export function validateStrategyDateRange(range: unknown): string[] {
  if (range === undefined) return [];
  const value = range as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['Date range is malformed.'];
  if (value.kind === 'last') return Object.keys(value).every(key => key === 'kind' || key === 'days') && (STRATEGY_RANGE_DAYS as readonly unknown[]).includes(value.days) ? [] : ['Date range must be the last 7, 30, 90 or 365 days.'];
  if (value.kind !== 'custom' || !Object.keys(value).every(key => ['kind', 'from', 'to'].includes(key))) return ['Date range is malformed.'];
  const bound = (input: unknown) => input === null || (Number.isSafeInteger(input) && (input as number) >= 0 && (input as number) % SECONDS_IN_DAY === 0);
  if (!bound(value.from) || !bound(value.to)) return ['Custom date range bounds must be whole UTC days.'];
  if (value.from === null && value.to === null) return ['Choose a start date, an end date, or both, for a custom date range.'];
  if (value.from !== null && value.to !== null && (value.from as number) > (value.to as number)) return ['The date range start must not be after its end.'];
  return [];
}

/** The inclusive [from, to] window in bar seconds for these bars; null bounds are open. */
export function strategyRangeWindow(range: StrategyDateRange | undefined, bars: readonly Pick<Bar, 'time'>[]): { from: number | null; to: number | null } {
  if (!range) return { from: null, to: null };
  if (range.kind === 'last') { const last = bars.at(-1); return { from: last ? last.time - range.days * SECONDS_IN_DAY : null, to: null }; }
  return { from: range.from, to: range.to === null ? null : range.to + SECONDS_IN_DAY - 1 };
}

/** First and one-past-last index of the bars inside the range (times ascend). Equal indices mean no bar is inside. */
export function strategyRangeSlice(range: StrategyDateRange | undefined, bars: readonly Pick<Bar, 'time'>[]): { start: number; end: number } {
  const { from, to } = strategyRangeWindow(range, bars);
  let start = 0, end = bars.length;
  if (from !== null) while (start < end && bars[start].time < from) start++;
  if (to !== null) while (end > start && bars[end - 1].time > to) end--;
  return { start, end };
}

export const utcDayInput = (seconds: number | null): string => seconds === null ? '' : new Date(seconds * 1000).toISOString().slice(0, 10);
export function parseUtcDayInput(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // Date.UTC maps years 0-99 to 1900-1999, so a partly typed year (0002, 0070) must not pass as a real day.
  return Number.isFinite(ms) && ms >= 0 && new Date(ms).getUTCFullYear() === Number(match[1]) ? ms / 1000 : null;
}

export function strategyDateRangeLabel(range: StrategyDateRange | undefined): string {
  if (!range) return 'Entire history';
  if (range.kind === 'last') return `Last ${range.days} days`;
  return `${range.from === null ? 'Start of history' : utcDayInput(range.from)} to ${range.to === null ? 'latest bar' : utcDayInput(range.to)} (UTC)`;
}
export function sameStrategyDateRange(a: StrategyDateRange | undefined, b: StrategyDateRange | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind === 'last' || b.kind === 'last') return a.kind === b.kind && (a as { days: number }).days === (b as { days: number }).days;
  return a.from === b.from && a.to === b.to;
}
