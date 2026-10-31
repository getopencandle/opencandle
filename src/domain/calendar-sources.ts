// Calendar auto-fill. Pure builders that turn two already-integrated sources into ordinary calendar documents:
//  - Alpaca cash dividends, fetched in the main process on the owner's key (window.lv.fetchAlpacaCorporateActions) and
//    passed in here as results. Tests use mocks only; no key or endpoint is touched by this module.
//  - Past reported results (EPS, revenue) from SEC companyfacts documents the user already saved or fetched. The filing date
//    is the event date; no future earnings date or estimate is invented (SEC publishes none).
// Everything lands in the same CalendarDocument shape as an import, so the usual query, cutoff and provenance rules apply.
import type { CorporateActionEvent, CorporateActionsValue, ChartEventsResult } from './chart-events';
import { restoreCalendarDocument, type CalendarDocument } from './calendar';
import { dateDay, type FactsDocument } from '../fundamentals/company-facts';
import { buildStatement, statementCurrencies } from '../fundamentals/statements';
import { linkedDocumentId, type FundamentalsLink } from '../fundamentals/preferences';

export const AUTO_DIVIDEND_DOCUMENT_ID = 'auto:alpaca-dividends';
export const AUTO_EARNINGS_DOCUMENT_ID = 'auto:sec-reported-earnings';
export const AUTO_DIVIDEND_SYMBOL_LIMIT = 40;
export const AUTO_EARNINGS_NEEDS_DATA = 'Past earnings need saved SEC company facts linked to your symbols. Open Fundamentals, import or fetch the company facts, and link each symbol; upcoming earnings dates and estimates have no connected source.';
export const AUTO_DIVIDEND_NEEDS_DATA = 'Dividend auto-fill needs the desktop app with the owner Alpaca key saved. Nothing is requested until you press the button.';
const US_SYMBOL = /^[A-Z]{1,5}(?:\.[A-Z]{1,3}){0,2}$/;
const unixOfDay = (day: string) => dateDay(day) * 86400;

export interface AutoFillReport { document: CalendarDocument | null; used: string[]; skipped: { symbol: string; reason: string }[]; message: string; }

/** Symbols the dividend endpoint can accept, de-duplicated, upper-cased and capped; the rest are reported as skipped. */
export function selectDividendSymbols(symbols: readonly string[], limit = AUTO_DIVIDEND_SYMBOL_LIMIT): { symbols: string[]; skipped: { symbol: string; reason: string }[] } {
  const seen = new Set<string>(), picked: string[] = [], skipped: { symbol: string; reason: string }[] = [];
  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase(); if (!symbol || seen.has(symbol)) continue; seen.add(symbol);
    if (!US_SYMBOL.test(symbol)) skipped.push({ symbol, reason: 'Not a US stock symbol the dividend source accepts.' });
    else if (picked.length >= limit) skipped.push({ symbol, reason: `Over the ${limit}-symbol limit for one fill.` });
    else picked.push(symbol);
  }
  return { symbols: picked, skipped };
}

function dividendEvent(event: CorporateActionEvent, today: string, synthetic: boolean) {
  const amount = event.amount, currency = event.currency ?? 'USD';
  return {
    id: `alpaca:dividend:${event.symbol}:${event.exDate}:${event.id}`.slice(0, 300), revision: 1, kind: 'dividend',
    title: `${event.symbol} ${event.special ? 'special ' : ''}cash dividend${synthetic ? ' (SYNTHETIC)' : ''}`,
    description: `Ex-dividend ${event.exDate}${event.payableDate ? ', payable ' + event.payableDate : ''}${event.recordDate ? ', record ' + event.recordDate : ''}. Source: Alpaca corporate actions.`,
    date: event.exDate, time: null, timezone: null, timing: 'date-only', symbol: event.symbol, country: 'US', category: event.special ? 'special' : 'cash',
    status: event.exDate > today ? 'scheduled' : 'released', exDate: event.exDate, payDate: event.payableDate,
    values: amount !== undefined ? { dividendAmount: { value: amount, unit: currency, availableAt: null } } : {},
  };
}

/** Cash dividends from Alpaca corporate-action results to one calendar document. Splits and other kinds are ignored. */
export function dividendsToCalendarDocument(results: readonly CorporateActionsValue[], now = Math.floor(Date.now() / 1000)): CalendarDocument | null {
  const today = new Date(now * 1000).toISOString().slice(0, 10), synthetic = results.some(row => row.synthetic), events: unknown[] = [], ids = new Set<string>();
  for (const result of results) for (const event of result.events) {
    if (event.kind !== 'cash-dividend' || event.amount === undefined || !(event.amount >= 0)) continue;
    const row = dividendEvent(event, today, result.synthetic) as { id: string };
    if (ids.has(row.id)) continue; ids.add(row.id); events.push(row);
  }
  if (!events.length) return null;
  return restoreCalendarDocument({
    schemaVersion: 1, id: AUTO_DIVIDEND_DOCUMENT_ID, events,
    provenance: {
      kind: synthetic ? 'synthetic' : 'local-import', fixture: synthetic, importedAt: now, sourceUrl: null,
      label: synthetic ? 'SYNTHETIC dividends (Alpaca test stub)' : 'Alpaca cash dividends (owner key)',
      license: synthetic ? 'Invented test events; not market data.' : 'Fetched on your own Alpaca key; subject to your Alpaca data agreement. Kept in this workspace only.',
    },
  });
}

/** Fetches dividends one symbol at a time through the bridge (it rate-limits and caches in the main process). */
export async function fetchDividendDocument(
  bridge: ((input: { requestId: string; symbol: string }) => Promise<ChartEventsResult>) | undefined, symbols: readonly string[],
  options: { now?: number; limit?: number; shouldStop?: () => boolean } = {},
): Promise<AutoFillReport> {
  const now = options.now ?? Math.floor(Date.now() / 1000), picked = selectDividendSymbols(symbols, options.limit);
  const skipped = [...picked.skipped];
  if (typeof bridge !== 'function') return { document: null, used: [], skipped, message: AUTO_DIVIDEND_NEEDS_DATA };
  if (!picked.symbols.length) return { document: null, used: [], skipped, message: 'No US stock symbols to look up. Add symbols to the watchlist or pick a different one.' };
  const results: CorporateActionsValue[] = [], used: string[] = [];
  for (const [index, symbol] of picked.symbols.entries()) {
    if (options.shouldStop?.()) break;
    try {
      const response = await bridge({ requestId: `cal-div-${now}-${index}`, symbol });
      if (response.ok) { results.push(response.value); used.push(symbol); } else skipped.push({ symbol, reason: response.error.message });
    } catch (cause) { skipped.push({ symbol, reason: cause instanceof Error ? cause.message : String(cause) }); }
  }
  const document = dividendsToCalendarDocument(results, now);
  const count = document?.events.length ?? 0;
  return { document, used, skipped, message: document ? `${count} dividend event${count === 1 ? '' : 's'} for ${used.length} symbol${used.length === 1 ? '' : 's'}${skipped.length ? `; ${skipped.length} skipped` : ''}.` : `No dividends found${skipped.length ? `; ${skipped.length} symbol(s) skipped` : ''}.` };
}

const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
/** Past reported quarters (EPS, revenue) from linked SEC company facts. Event date is the filing date of the first report. */
export function earningsFromFacts(
  documents: readonly FactsDocument[], links: readonly FundamentalsLink[], symbols: readonly string[] | null, now = Math.floor(Date.now() / 1000),
): AutoFillReport {
  const events: unknown[] = [], used: string[] = [], skipped: { symbol: string; reason: string }[] = [];
  const wanted = symbols === null ? null : new Set(symbols.map(value => value.toUpperCase()));
  const seen = new Set<string>(); let synthetic = false;
  for (const link of links) {
    const symbol = link.symbol.toUpperCase(); if (wanted && !wanted.has(symbol)) continue;
    const key = link.exchange + ':' + symbol; if (seen.has(key)) continue; seen.add(key);
    const id = linkedDocumentId([link], link), document = documents.find(row => row.id === id);
    if (!document) { skipped.push({ symbol, reason: 'The linked company facts were removed.' }); continue; }
    if ((document.source.kind === 'synthetic') !== link.synthetic) { skipped.push({ symbol, reason: 'The link mixes synthetic and real filing data.' }); continue; }
    try {
      const currency = statementCurrencies(document.facts, null)[0];
      if (!currency) { skipped.push({ symbol, reason: 'No currency values in the linked facts.' }); continue; }
      const table = buildStatement(document.facts, { statement: 'income', basis: 'FQ', currency, asOf: null, revisions: 'original', columns: 20 });
      const eps = table.rows.find(row => row.id === 'eps_diluted'), revenue = table.rows.find(row => row.id === 'revenue');
      let count = 0;
      table.columns.forEach((end, index) => {
        const epsCell = eps?.cells[index], revCell = revenue?.cells[index];
        const filed = epsCell?.value !== null && epsCell?.filed ? epsCell.filed : revCell?.value !== null ? revCell?.filed ?? null : null;
        if (!filed) return;
        const datum = (cell: typeof epsCell, unit: string) => cell && cell.value !== null && cell.filed ? { value: cell.value, unit, availableAt: unixOfDay(cell.filed) } : undefined;
        const values: Record<string, unknown> = {}, epsDatum = datum(epsCell, currency + '/shares'), revDatum = datum(revCell, currency);
        if (epsDatum) values.epsActual = epsDatum; if (revDatum) values.revenueActual = revDatum;
        if (!Object.keys(values).length) return;
        const parts = [epsDatum ? `EPS ${number(epsDatum.value)} ${epsDatum.unit}` : null, revDatum ? `revenue ${number(revDatum.value)} ${currency}` : null].filter(Boolean).join(', ');
        events.push({
          id: `sec:${document.facts.cik}:${symbol}:${end}`, revision: 1, kind: 'earnings', title: `${symbol} reported quarter ended ${end}`,
          description: `${document.facts.entityName} reported ${parts} for the quarter ended ${end}${epsCell?.form ? ' (' + epsCell.form + ')' : ''}. SEC as-reported values, first filing. No estimate is available.`,
          date: filed, time: null, timezone: null, timing: 'date-only', symbol, country: 'US', status: 'released', publishedAt: unixOfDay(filed),
          fiscalPeriod: `Quarter ended ${end}`, values,
        }); count++;
      });
      if (count) { used.push(symbol); synthetic = synthetic || document.source.kind === 'synthetic'; }
      else skipped.push({ symbol, reason: 'No quarterly EPS or revenue in the linked facts.' });
    } catch (cause) { skipped.push({ symbol, reason: cause instanceof Error ? cause.message : String(cause) }); }
  }
  if (!events.length) return { document: null, used, skipped, message: AUTO_EARNINGS_NEEDS_DATA };
  const document = restoreCalendarDocument({
    schemaVersion: 1, id: AUTO_EARNINGS_DOCUMENT_ID, events,
    provenance: {
      kind: synthetic ? 'synthetic' : 'local-import', fixture: synthetic, importedAt: now, sourceUrl: null,
      label: synthetic ? 'SYNTHETIC reported earnings (facts fixture)' : 'SEC reported quarters (saved company facts)',
      license: 'Public SEC EDGAR company facts you saved locally; as-reported values, not vendor-standardized.',
    },
  });
  return { document, used, skipped, message: `${events.length} reported quarter${events.length === 1 ? '' : 's'} for ${used.length} symbol${used.length === 1 ? '' : 's'}${skipped.length ? `; ${skipped.length} skipped` : ''}.` };
}
