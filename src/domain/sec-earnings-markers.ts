// Earnings badges from SEC filings already saved on this PC. One event per reported quarter: the day the company announced the
// result (the first 8-K with Item 2.02 filed after the quarter ended and no later than the 10-Q or 10-K), else the day the
// 10-Q or 10-K was filed. A fiscal fourth quarter, reported only in the 10-K, is included too. Nothing is requested here;
// the loader below reads saved copies only.
import { normalizeCompanyFacts, dateDay, queryFacts, type CompanyFacts } from '../fundamentals/company-facts';
import { buildStatement, statementCurrencies, type StatementCell } from '../fundamentals/statements';

/** One reported quarter and the filing the badge sits on. `id` matches the calendar auto-fill event id (sec:<cik>:<symbol>:<end>). */
export interface SecEarningsEvent {
  id: string; cik: string; symbol: string;
  /** Quarter end date (YYYY-MM-DD). */
  end: string;
  /** The date the badge sits on (YYYY-MM-DD). */
  date: string;
  /** The filing the date comes from, and its form ('8-K', '10-Q' or '10-K'). */
  form: string; accession: string;
  eps: number | null; epsCurrency: string | null;
  revenue: number | null; revenueYoyPercent: number | null; currency: string | null;
}
/** The filing rows this module needs from a submissions file. `items` is the comma list of 8-K items ("2.02,9.01"). */
export interface SecFilingRow { accession: string; form: string; filed: string; items: string | null }

const DAY = (value: string) => { try { return dateDay(value); } catch { return null; } };
/** Rows of the recent-filings columns in a submissions file. Anything malformed yields no rows. */
export function secFilingRows(data: unknown): SecFilingRow[] {
  const recent = (data as { filings?: { recent?: Record<string, unknown> } } | null)?.filings?.recent;
  if (!recent || typeof recent !== 'object') return [];
  const accession = recent.accessionNumber, form = recent.form, filed = recent.filingDate, items = recent.items;
  if (!Array.isArray(accession) || !Array.isArray(form) || !Array.isArray(filed)) return [];
  const rows: SecFilingRow[] = [];
  for (let i = 0; i < accession.length && i < 20000; i++) {
    if (typeof accession[i] !== 'string' || typeof form[i] !== 'string' || typeof filed[i] !== 'string' || DAY(filed[i]) === null) continue;
    rows.push({ accession: accession[i], form: form[i], filed: filed[i], items: Array.isArray(items) && typeof items[i] === 'string' ? items[i] : null });
  }
  return rows;
}
const isPeriodic = (form: string) => form === '10-Q' || form === '10-K' || form === '10-Q/A' || form === '10-K/A';
const hasEarningsItem = (items: string | null) => !!items && items.split(',').some(item => item.trim() === '2.02');

/** Days from start to end, both included. */
const spanDays = (start: string, end: string) => { const a = DAY(start), b = DAY(end); return a === null || b === null ? null : b - a + 1; };
/**
 * A fiscal fourth quarter is reported only inside the 10-K. Its value is the full year less the nine months to the third
 * quarter: the same tag, unit and start date, the nine months as first filed and no later than the 10-K. Null when that
 * nine-month value is missing or ambiguous.
 */
function fullYearLessNineMonths(facts: CompanyFacts, cell: StatementCell | undefined, cutoff: string): number | null {
  if (!cell || cell.value === null || !cell.start || !cell.tag || !cell.unit) return null;
  const concept = facts.concepts.find(row => row.id === cell.tag);
  if (!concept || !concept.units.includes(cell.unit)) return null;
  let rows;
  try { rows = queryFacts(concept, { unit: cell.unit, period: 'all', asOf: cutoff, revisions: 'original' }).rows; } catch { return null; }
  const nine = rows.filter(row => {
    if (row.start !== cell.start || row.end >= cell.end || row.ambiguous) return false;
    const days = spanDays(row.start!, row.end), rest = spanDays(row.end, cell.end);
    return days !== null && days >= 240 && days <= 300 && rest !== null && rest - 1 >= 60 && rest - 1 <= 120;
  });
  const values = [...new Set(nine.map(row => row.value))];
  return values.length === 1 ? Number((cell.value - values[0]).toFixed(6)) : null;
}
interface QuarterRow { end: string; eps: number | null; epsUnit: string | null; revenue: number | null; filed: string; accession: string; form: string }

/**
 * Earnings events for one company. Quarters come from the as-reported income statement (EPS and revenue, first filing); the date
 * is the earliest 8-K with Item 2.02 filed after the quarter end and no later than the 10-Q or 10-K, else the periodic filing date.
 * A fiscal fourth quarter (in the 10-K only) is the full year less nine months, dated the same way from the 10-K.
 */
export function secEarningsEvents(facts: CompanyFacts, symbol: string, filings: readonly SecFilingRow[], max = 20): SecEarningsEvent[] {
  const upper = symbol.toUpperCase(), currency = statementCurrencies(facts, null)[0];
  if (!currency) return [];
  const options = { statement: 'income', currency, asOf: null, revisions: 'original', columns: max } as const;
  const table = buildStatement(facts, { ...options, basis: 'FQ' }), annual = buildStatement(facts, { ...options, basis: 'FY' });
  const line = (from: typeof table, id: string) => from.rows.find(row => row.id === id);
  const eps = line(table, 'eps_diluted'), revenue = line(table, 'revenue'), annualEps = line(annual, 'eps_diluted'), annualRevenue = line(annual, 'revenue');
  const eightKs = filings.filter(row => row.form === '8-K' && hasEarningsItem(row.items)).sort((a, b) => a.filed.localeCompare(b.filed) || a.accession.localeCompare(b.accession));
  const byAccession = new Map(filings.map(row => [row.accession, row]));
  const filedSource = (...cells: (StatementCell | undefined)[]) => cells.find(cell => cell && cell.value !== null && cell.filed && cell.accession) ?? null;
  const formOf = (cell: StatementCell) => cell.form ?? byAccession.get(cell.accession!)?.form ?? '';
  const quarters: QuarterRow[] = [];
  table.columns.forEach((end, index) => {
    const epsCell = eps?.cells[index], revCell = revenue?.cells[index], source = filedSource(epsCell, revCell);
    if (!source) return; const form = formOf(source);
    if (form && !isPeriodic(form)) return;
    quarters.push({ end, eps: epsCell && epsCell.value !== null ? epsCell.value : null, epsUnit: epsCell?.unit ?? null, revenue: revCell && revCell.value !== null ? revCell.value : null, filed: source.filed!, accession: source.accession!, form: form || '10-Q' });
  });
  // Fiscal fourth quarters, within the span of the reported quarters (a quarter reported on its own is never replaced).
  const reported = new Set(table.columns), earliest = table.columns.length ? [...table.columns].sort()[0] : null;
  annual.columns.forEach((end, index) => {
    if (reported.has(end) || earliest !== null && end < earliest) return;
    const epsCell = annualEps?.cells[index], revCell = annualRevenue?.cells[index], source = filedSource(epsCell, revCell);
    if (!source) return; const form = formOf(source);
    if (form && !isPeriodic(form)) return;
    const q4Eps = fullYearLessNineMonths(facts, epsCell, source.filed!), q4Revenue = fullYearLessNineMonths(facts, revCell, source.filed!);
    quarters.push({ end, eps: q4Eps, epsUnit: q4Eps === null ? null : epsCell?.unit ?? null, revenue: q4Revenue, filed: source.filed!, accession: source.accession!, form: form || '10-K' });
  });
  const revenueAt = new Map<string, number>();
  for (const row of quarters) if (row.revenue !== null) revenueAt.set(row.end, row.revenue);
  const events = quarters.map((row): SecEarningsEvent => {
    const announced = eightKs.find(filing => filing.filed > row.end && filing.filed <= row.filed);
    const endDay = DAY(row.end);
    let yoy: number | null = null;
    if (endDay !== null && row.revenue !== null) for (const [other, value] of revenueAt) { const day = DAY(other); if (day !== null && Math.abs(endDay - day - 365) <= 15 && value > 0) { yoy = (row.revenue / value - 1) * 100; break; } }
    return {
      id: `sec:${facts.cik}:${upper}:${row.end}`, cik: facts.cik, symbol: upper, end: row.end,
      date: announced ? announced.filed : row.filed, form: announced ? '8-K' : row.form, accession: announced ? announced.accession : row.accession,
      eps: row.eps, epsCurrency: row.epsUnit, revenue: row.revenue, revenueYoyPercent: yoy, currency,
    };
  });
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export interface SecEarningsBridge {
  loadSecData(input: { requestId: string; kind: 'companyfacts' | 'submissions'; cik: string | null; refresh: 'cache-only' }): Promise<{ ok: true; value: { envelope: { data: Record<string, unknown> } | null } } | { ok: false; error: { code: string; message: string } }>;
}
/** Reads the saved company facts and filing list of one CIK (cache only: no request is ever sent) and builds its events. */
export async function loadSecEarningsEvents(bridge: SecEarningsBridge | null, cik: string | null, symbol: string): Promise<SecEarningsEvent[]> {
  if (!bridge || !cik) return [];
  try {
    const [factsResult, subsResult] = await Promise.all(['companyfacts', 'submissions'].map(kind => bridge.loadSecData({ requestId: `earnings-markers-${kind}-${cik}`, kind: kind as 'companyfacts' | 'submissions', cik, refresh: 'cache-only' })));
    if (!factsResult.ok || !factsResult.value.envelope) return [];
    return secEarningsEvents(normalizeCompanyFacts(factsResult.value.envelope.data), symbol, subsResult.ok && subsResult.value.envelope ? secFilingRows(subsResult.value.envelope.data) : []);
  } catch { return []; }
}

const grouped = (value: number, digits: number) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Compact money: 94.93 B, 1.20 M. */
export function secMoneyText(value: number): string {
  const a = Math.abs(value);
  return a >= 1e9 ? grouped(value / 1e9, 2) + ' B' : a >= 1e6 ? grouped(value / 1e6, 2) + ' M' : a >= 1e3 ? grouped(value / 1e3, 2) + ' K' : grouped(value, 2);
}
/** The tooltip, Label: value per line, as the other calendar badges read. */
export function secEarningsLines(event: SecEarningsEvent): string[] {
  const lines = ['Earnings', 'Quarter ended: ' + event.end];
  if (event.eps !== null) lines.push('Diluted EPS: ' + grouped(event.eps, 2));
  if (event.revenue !== null) {
    const yoy = event.revenueYoyPercent === null ? '' : ' (YoY ' + (event.revenueYoyPercent > 0 ? '+' : '') + grouped(event.revenueYoyPercent, 1) + '%)';
    lines.push('Revenue: ' + secMoneyText(event.revenue) + yoy);
  }
  lines.push('Date: ' + event.date + ' (' + event.form + ')', 'Source: SEC filing');
  return lines;
}
