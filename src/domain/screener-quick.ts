/**
 * Result-table conveniences that never change the saved screen.
 * - Quick search narrows the visible rows by symbol, exchange or name text (every whitespace token must match).
 * - Copy symbols renders EXCHANGE:SYMBOL markets comma-separated, the same shape the watchlist import accepts.
 * - The refresh snapshot lets the user pause automatic recalculation and see when newer local data arrived.
 */
export function screenerQuickTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 20);
}

/** True when every token is a substring of at least one haystack entry (case-insensitive). An empty query matches all. */
export function matchesScreenerQuickSearch(haystack: readonly (string | null | undefined)[], query: string): boolean {
  const tokens = screenerQuickTokens(query);
  if (!tokens.length) return true;
  const fields = haystack.filter((item): item is string => typeof item === 'string' && item.length > 0).map(item => item.toLowerCase());
  return tokens.every(token => fields.some(field => field.includes(token)));
}

/** Keeps row order; `describe` supplies the searchable text of one row (symbol, exchange, EXCHANGE:SYMBOL, name). */
export function filterScreenerQuickSearch<T>(rows: readonly T[], query: string, describe: (row: T) => readonly (string | null | undefined)[]): T[] {
  if (!screenerQuickTokens(query).length) return [...rows];
  return rows.filter(row => matchesScreenerQuickSearch(describe(row), query));
}

/** Unique markets in the given order, comma-separated. Empty input gives an empty string. */
export function screenerSymbolsText(markets: readonly string[]): string {
  return [...new Set(markets.map(market => market.trim()).filter(Boolean))].join(',');
}

export interface ScreenerRefreshSnapshot<D, C> { datasets: readonly D[]; calendar: readonly C[] | undefined; takenAt: number; }

/** True when the live inputs differ (by identity, element by element) from the paused snapshot. */
export function screenerSnapshotStale<D, C>(snapshot: ScreenerRefreshSnapshot<D, C>, datasets: readonly D[], calendar: readonly C[] | undefined): boolean {
  const differs = <T,>(a: readonly T[] | undefined, b: readonly T[] | undefined) => a !== b && (!a || !b || a.length !== b.length || a.some((item, index) => item !== b[index]));
  return differs(snapshot.datasets, datasets) || differs(snapshot.calendar, calendar);
}

/** "Updated 14:05:09" in the viewer's local clock; invalid times say so instead of guessing. */
export function screenerUpdatedLabel(takenAt: number, locale?: string, timeZone?: string): string {
  if (!Number.isFinite(takenAt) || takenAt <= 0) return 'Update time unknown';
  // The label follows the chart timezone when one is given (was: always the OS local zone).
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
  const date = new Date(takenAt * 1000);
  if (timeZone) { try { return `Updated ${date.toLocaleTimeString(locale, { ...options, timeZone })}`; } catch { /* unknown zone: local time below */ } }
  return `Updated ${date.toLocaleTimeString(locale, options)}`;
}
