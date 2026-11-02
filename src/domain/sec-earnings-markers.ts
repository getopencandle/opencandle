// Earnings badges from SEC filings already saved on this PC. One event per reported quarter: the day the company announced the
// result (the first 8-K with Item 2.02 filed after the quarter ended and no later than the 10-Q or 10-K), else the day the
// 10-Q or 10-K was filed. Nothing is requested here; the loader below reads saved copies only.
import { normalizeCompanyFacts, dateDay, type CompanyFacts } from '../fundamentals/company-facts';
import { buildStatement, statementCurrencies } from '../fundamentals/statements';

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

/**
 * Earnings events for one company. Quarters come from the as-reported income statement (EPS and revenue, first filing); the date
 * is the earliest 8-K with Item 2.02 filed after the quarter end and no later than the 10-Q or 10-K, else the periodic filing date.
 */
export function secEarningsEvents(facts: CompanyFacts, symbol: string, filings: readonly SecFilingRow[], max = 20): SecEarningsEvent[] {
  const upper = symbol.toUpperCase(), currency = statementCurrencies(facts, null)[0];
  if (!currency) return [];
  const table = buildStatement(facts, { statement: 'income', basis: 'FQ', currency, asOf: null, revisions: 'original', columns: max });
  const eps = table.rows.find(row => row.id === 'eps_diluted'), revenue = table.rows.find(row => row.id === 'revenue');
  const eightKs = filings.filter(row => row.form === '8-K' && hasEarningsItem(row.items)).sort((a, b) => a.filed.localeCompare(b.filed) || a.accession.localeCompare(b.accession));
  const byAccession = new Map(filings.map(row => [row.accession, row]));
  const revenueAt = new Map<string, number>();
  table.columns.forEach((end, index) => { const cell = revenue?.cells[index]; if (cell && cell.value !== null) revenueAt.set(end, cell.value); });
  const events: SecEarningsEvent[] = [];
  table.columns.forEach((end, index) => {
    const epsCell = eps?.cells[index], revCell = revenue?.cells[index];
    const source = epsCell && epsCell.value !== null && epsCell.filed ? epsCell : revCell && revCell.value !== null && revCell.filed ? revCell : null;
    if (!source || !source.filed || !source.accession) return; const sourceFiled = source.filed;
    const periodic = byAccession.get(source.accession), form = source.form ?? periodic?.form ?? '';
    if (form && !isPeriodic(form)) return;
    const announced = eightKs.find(row => row.filed > end && row.filed <= sourceFiled);
    const endDay = DAY(end);
    let yoy: number | null = null;
    if (endDay !== null && revCell && revCell.value !== null) for (const [other, value] of revenueAt) { const day = DAY(other); if (day !== null && Math.abs(endDay - day - 365) <= 15 && value > 0) { yoy = (revCell.value / value - 1) * 100; break; } }
    events.push({
      id: `sec:${facts.cik}:${upper}:${end}`, cik: facts.cik, symbol: upper, end,
      date: announced ? announced.filed : sourceFiled, form: announced ? '8-K' : form || '10-Q', accession: announced ? announced.accession : source.accession,
      eps: epsCell && epsCell.value !== null ? epsCell.value : null, epsCurrency: epsCell?.unit ?? null,
      revenue: revCell && revCell.value !== null ? revCell.value : null, revenueYoyPercent: yoy, currency,
    });
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
