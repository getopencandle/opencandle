import type { CalendarEvent } from './calendar';
import { FRED_EXCHANGE, FRED_POPULAR, FRED_SERIES_ID } from './fred';

/**
 * The economic series behind an economic calendar row, so
 * Launch chart opens it (as a FRED:<id> chart, downloaded on demand) and See overview shows its details.
 * - Exact: the event's own symbol is FRED:<series id>.
 * - Matched: a US event whose title or category names one of the headline releases below. List and wording; the
 *   match is shown as such, never as the reference's own mapping.
 * Anything else has no series, and the dialog keeps saying so.
 */
export interface EconomicSeriesInfo { series: string; description: string; units: string; frequency: string }
export interface EconomicSeriesMatch extends EconomicSeriesInfo { symbol: string; basis: 'exact' | 'matched'; basisText: string; url: string }

/** Own descriptions for series that are not in the FRED popular list. */
const EXTRA: readonly EconomicSeriesInfo[] = [
  { series: 'CPILFESL', description: 'Consumer prices less food and energy (core), seasonally adjusted', units: 'index', frequency: 'monthly' },
  { series: 'A191RL1Q225SBEA', description: 'Real GDP, percent change from the previous quarter at an annual rate', units: 'percent', frequency: 'quarterly' },
  { series: 'DFEDTARU', description: 'Federal funds target range, upper limit', units: 'percent', frequency: 'daily' },
  { series: 'RSAFS', description: 'Advance retail and food services sales', units: 'millions of dollars', frequency: 'monthly' },
  { series: 'PCEPI', description: 'Personal consumption expenditures price index', units: 'index', frequency: 'monthly' },
  { series: 'PPIFIS', description: 'Producer prices for final demand', units: 'index', frequency: 'monthly' },
];
/** First rule that matches wins; core CPI is tested before CPI. */
const RULES: readonly [RegExp, string][] = [
  [/\bcore\b.*\b(cpi|consumer price)/i, 'CPILFESL'],
  [/\b(cpi|consumer price)/i, 'CPIAUCSL'],
  [/\bunemployment rate\b/i, 'UNRATE'],
  [/\b(non-?farm payrolls?|nonfarm employment)\b/i, 'PAYEMS'],
  [/\b(initial )?jobless claims\b/i, 'ICSA'],
  [/\bgdp\b|gross domestic product/i, 'A191RL1Q225SBEA'],
  [/\b(fed(eral)? funds|fomc|fed interest rate|interest rate decision)\b/i, 'DFEDTARU'],
  [/\bretail sales\b/i, 'RSAFS'],
  [/\b(pce|personal consumption expenditures?) price/i, 'PCEPI'],
  [/\b(ppi|producer price)/i, 'PPIFIS'],
  [/\bmortgage rate/i, 'MORTGAGE30US'],
];
const US = new Set(['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA']);

export function economicSeriesInfo(series: string): EconomicSeriesInfo {
  const popular = FRED_POPULAR.find(row => row.id === series);
  if (popular) return { series, description: popular.description, units: popular.units, frequency: popular.frequency };
  return EXTRA.find(row => row.series === series) ?? { series, description: `FRED economic series ${series}`, units: 'as published by FRED', frequency: 'as published by FRED' };
}
export function calendarEconomicSeries(event: Pick<CalendarEvent, 'kind' | 'symbol' | 'country' | 'title' | 'category'>): EconomicSeriesMatch | null {
  if (event.kind !== 'economic') return null;
  const build = (series: string, basis: EconomicSeriesMatch['basis'], basisText: string): EconomicSeriesMatch => ({ ...economicSeriesInfo(series), symbol: `${FRED_EXCHANGE}:${series}`, basis, basisText, url: `https://fred.stlouisfed.org/series/${series}` });
  const symbol = (event.symbol ?? '').trim().toUpperCase();
  if (symbol.startsWith(FRED_EXCHANGE + ':')) {
    const id = symbol.slice(FRED_EXCHANGE.length + 1);
    return FRED_SERIES_ID.test(id) ? build(id, 'exact', 'The event names this FRED series.') : null;
  }
  if (!US.has((event.country ?? '').trim().toUpperCase())) return null;
  const text = `${event.title} ${event.category ?? ''}`;
  const rule = RULES.find(([pattern]) => pattern.test(text));
  return rule ? build(rule[1], 'matched', 'Matched by the release name (OpenCandle list); check it is the release you want.') : null;
}
