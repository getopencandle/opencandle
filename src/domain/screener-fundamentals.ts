import { queryFacts, type CompanyFacts, type FactsDocument } from '../fundamentals/company-facts';
import { addDays, buildStatement, statementCurrencies, type StatementCell, type StatementRevisions } from '../fundamentals/statements';
import { linkedDocumentId, type FundamentalsLink } from '../fundamentals/preferences';
import { rowDate } from './screener-earnings';
import type { BarDataset } from './types';
import { demoDataMode } from './demo-mode';
import type { ScreenerCell } from './screener';

/**
 * Screener fundamentals. Valuation, dividend and margin columns read only the SEC companyfacts
 * documents the user saved in Fundamentals and explicitly linked to the exact market (exchange, ticker, synthetic status).
 * A symbol without a linked document shows no value. Nothing is estimated, converted or invented.
 *
 * Point in time: filings count only when filed on or before the earlier of the Fundamentals filing cutoff and the date of
 * the dataset's last supplied row, so a replayed or old dataset never sees later filings. Price is that last row's close.
 */
export const SCREENER_FUNDAMENTAL_METRICS = ['marketCap', 'priceEarnings', 'pegRatio', 'priceSales', 'priceBook', 'evEbitda', 'epsTtm', 'dividendYield', 'dividendsPerShare', 'payoutRatio', 'grossMargin', 'operatingMargin', 'pretaxMargin', 'netMargin'] as const;
export type ScreenerFundamentalMetric = typeof SCREENER_FUNDAMENTAL_METRICS[number];
export const isFundamentalMetric = (metric: string): metric is ScreenerFundamentalMetric => (SCREENER_FUNDAMENTAL_METRICS as readonly string[]).includes(metric);
export const SCREENER_FUNDAMENTAL_LABELS: Record<ScreenerFundamentalMetric, string> = {
  marketCap: 'Market capitalization', priceEarnings: 'Price to earnings ratio (TTM)', pegRatio: 'PEG ratio (TTM, trailing EPS growth)', priceSales: 'Price to sales ratio (TTM)', priceBook: 'Price to book ratio', evEbitda: 'Enterprise value to EBITDA (TTM)', epsTtm: 'EPS diluted (TTM)',
  dividendYield: 'Dividend yield % (TTM)', dividendsPerShare: 'Dividends per share (TTM)', payoutRatio: 'Dividend payout ratio % (TTM)',
  grossMargin: 'Gross margin % (TTM)', operatingMargin: 'Operating margin % (TTM)', pretaxMargin: 'Pretax margin % (TTM)', netMargin: 'Net margin % (TTM)',
};
export const SCREENER_FUNDAMENTAL_SHORT: Record<ScreenerFundamentalMetric, string> = {
  marketCap: 'Market cap', priceEarnings: 'P/E', pegRatio: 'PEG', priceSales: 'P/S', priceBook: 'P/B', evEbitda: 'EV/EBITDA', epsTtm: 'EPS TTM',
  dividendYield: 'Div yield %', dividendsPerShare: 'DPS', payoutRatio: 'Payout %', grossMargin: 'Gross margin %', operatingMargin: 'Oper margin %', pretaxMargin: 'Pretax margin %', netMargin: 'Net margin %',
};
export const SCREENER_FUNDAMENTAL_POLICIES = [
  'Valuation, dividend and margin columns use only saved SEC companyfacts documents explicitly linked to the exact market in Fundamentals. Unlinked symbols show no value; OpenCandle never maps a ticker to a company by itself.',
  'Filings count when filed on or before the earlier of the Fundamentals filing cutoff and the last supplied row date. Price is the last supplied close, in the dataset currency, which must equal the filing currency (no conversion).',
  'TTM is a reported twelve-month period or four contiguous reported quarters (income and cash-flow lines may also use annual plus year-to-date minus prior year-to-date, as in Fundamentals). Per-share TTM is a reported twelve-month value or the sum of four contiguous reported quarters. Margins on zero or negative revenue, and ratios on zero or negative earnings, equity or EBITDA, stay empty.',
];
export interface ScreenerFundamentalsSource { documents: readonly FactsDocument[]; links: readonly FundamentalsLink[]; cutoff: string | null; revisions?: StatementRevisions; }
export interface ScreenerFundamentalsLookup { (dataset: BarDataset): { document: FactsDocument } | { reason: string }; source: ScreenerFundamentalsSource; }

interface Flow { value: number; start: string | null; end: string; detail: string; filed: string | null }
interface Snapshot {
  currency: string | null; reason: string | null;
  revenue: Map<string, Flow>; gross: Map<string, Flow>; operating: Map<string, Flow>; pretax: Map<string, Flow>; net: Map<string, Flow>; da: Map<string, Flow>; dividendsPaid: Map<string, Flow>;
  eps: Flow[]; dps: Flow[]; equity: Flow | null; shares: Flow | null; ev: { cash: Flow; debt: Flow } | null; evReason: string;
}
const QUARTER = (days: number) => days >= 60 && days <= 120, ANNUAL = (days: number) => days >= 300 && days <= 400;
const dayOf = (day: string) => Date.parse(day + 'T00:00:00Z') / 86400000;
const span = (start: string, end: string) => dayOf(end) - dayOf(start) + 1;

/** Statement row cells indexed by period end, newest first. Cells without a value are dropped. */
function rowCells(facts: CompanyFacts, statement: 'income' | 'cashflow' | 'balance', basis: 'TTM' | 'FQ' | 'FY', currency: string, asOf: string, revisions: StatementRevisions, ids: string[]): Record<string, Map<string, Flow>> {
  const table = buildStatement(facts, { statement, basis, currency, asOf, revisions, columns: 20 }), out: Record<string, Map<string, Flow>> = {};
  for (const id of ids) {
    const row = table.rows.find(item => item.id === id), map = new Map<string, Flow>();
    row?.cells.forEach((cell: StatementCell, index) => { if (cell.value !== null) map.set(table.columns[index], { value: cell.value, start: cell.start, end: cell.end, filed: cell.filed, detail: `${row.label} ${cell.start ? cell.start + ' to ' : 'at '}${cell.end}${cell.method === 'four-quarters' ? ' (four reported quarters)' : cell.method === 'annual-plus-ytd' ? ' (annual + YTD - prior YTD)' : ''}${cell.tag ? ', ' + cell.tag : ''}` }); });
    out[id] = map;
  }
  return out;
}
/** Resolved duration facts for one per-share tag (conflicting same-day values are skipped, never chosen). */
function durations(facts: CompanyFacts, tag: string, unit: string, asOf: string, revisions: StatementRevisions) {
  const concept = facts.concepts.find(item => item.id === tag);
  if (!concept || !concept.units.includes(unit)) return [];
  const groups = new Map<string, { start: string; end: string; values: Set<number>; filed: string | null; ambiguous: boolean }>();
  for (const row of queryFacts(concept, { unit, period: 'all', asOf, revisions }).rows) {
    if (row.start === null) continue;
    const key = row.start + '|' + row.end, group = groups.get(key) ?? { start: row.start, end: row.end, values: new Set<number>(), filed: row.filed, ambiguous: false };
    group.values.add(row.value); group.ambiguous ||= row.ambiguous; groups.set(key, group);
  }
  return [...groups.values()].filter(group => !group.ambiguous && group.values.size === 1).map(group => ({ start: group.start, end: group.end, days: span(group.start, group.end), value: [...group.values][0], filed: group.filed }));
}
/** Per-share TTM series, newest end first: reported twelve-month values, else four contiguous reported quarters summed. */
function perShareSeries(facts: CompanyFacts, tags: string[], unit: string, asOf: string, revisions: StatementRevisions, label: string): Flow[] {
  const byEnd = new Map<string, Flow>();
  for (const tag of tags) {
    const rows = durations(facts, tag, unit, asOf, revisions), short = tag.replace(/^us-gaap:/, '');
    for (const row of rows) if (ANNUAL(row.days) && !byEnd.has(row.end)) byEnd.set(row.end, { value: row.value, start: row.start, end: row.end, filed: row.filed, detail: `${label} reported ${row.start} to ${row.end}, ${short}` });
    const quarters = rows.filter(row => QUARTER(row.days));
    for (const last of quarters) {
      if (byEnd.has(last.end)) continue;
      const chain = [last];
      while (chain.length < 4) { const want = addDays(chain[0].start, -1), found = quarters.filter(row => row.end === want); if (found.length !== 1) break; chain.unshift(found[0]); }
      if (chain.length === 4 && ANNUAL(span(chain[0].start, last.end))) {
        const filed = chain.some(row => row.filed === null) ? null : chain.map(row => row.filed!).sort().at(-1)!;
        byEnd.set(last.end, { value: chain.reduce((sum, row) => sum + row.value, 0), start: chain[0].start, end: last.end, filed, detail: `${label} sum of four reported quarters ${chain[0].start} to ${last.end} (${chain.map(row => row.value).join(' + ')}), ${short}` });
      }
    }
  }
  return [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end));
}
/** Latest instant value across tags in preference order (the first tag with any value wins), filed on or before the cutoff. */
function latestInstant(facts: CompanyFacts, tags: string[], unit: string, asOf: string, revisions: StatementRevisions, at?: string): Flow | null {
  for (const tag of tags) {
    const concept = facts.concepts.find(item => item.id === tag);
    if (!concept || !concept.units.includes(unit)) continue;
    const rows = queryFacts(concept, { unit, period: 'instant', asOf, revisions }).rows.filter(row => !row.ambiguous && (at === undefined || row.end === at));
    const best = rows.find(row => row.value > 0 || at !== undefined);
    if (best) return { value: best.value, start: null, end: best.end, filed: best.filed, detail: `${tag.replace(/^(us-gaap|dei):/, '')} at ${best.end}${best.filed ? ', filed ' + best.filed : ''}` };
  }
  return null;
}
function buildSnapshot(document: FactsDocument, asOf: string, revisions: StatementRevisions): Snapshot {
  const facts = document.facts, empty = new Map<string, Flow>();
  const base: Snapshot = { currency: null, reason: null, revenue: empty, gross: empty, operating: empty, pretax: empty, net: empty, da: empty, dividendsPaid: empty, eps: [], dps: [], equity: null, shares: null, ev: null, evReason: '' };
  const currency = statementCurrencies(facts, asOf)[0] ?? null;
  if (!currency) return { ...base, reason: `The linked document has no reported currency statement values filed on or before ${asOf}.` };
  try {
    const income = rowCells(facts, 'income', 'TTM', currency, asOf, revisions, ['revenue', 'gross_profit', 'operating_income', 'pretax_income', 'net_income']);
    const cash = rowCells(facts, 'cashflow', 'TTM', currency, asOf, revisions, ['depreciation_amortization', 'dividends_paid']);
    const fq = rowCells(facts, 'balance', 'FQ', currency, asOf, revisions, ['total_equity', 'cash', 'long_term_debt']), fy = rowCells(facts, 'balance', 'FY', currency, asOf, revisions, ['total_equity', 'cash', 'long_term_debt']);
    const merge = (id: string) => new Map([...fy[id], ...fq[id]].sort((a, b) => b[0].localeCompare(a[0])));
    const equity = [...merge('total_equity').values()][0] ?? null, cashAt = merge('cash'), debtAt = merge('long_term_debt');
    const g = (tag: string) => 'us-gaap:' + tag, perShare = currency + '/shares';
    let ev: Snapshot['ev'] = null, evReason = 'No balance date reports both cash and equivalents and long-term debt (noncurrent).';
    for (const [end, cashFlow] of cashAt) {
      const total = latestInstant(facts, [g('LongTermDebt')], currency, asOf, revisions, end), noncurrent = debtAt.get(end);
      if (total) { ev = { cash: cashFlow, debt: { ...total, detail: 'Total long-term debt ' + total.detail } }; break; }
      if (!noncurrent) continue;
      const current = latestInstant(facts, [g('LongTermDebtCurrent'), g('DebtCurrent')], currency, asOf, revisions, end);
      ev = { cash: cashFlow, debt: current ? { ...noncurrent, value: noncurrent.value + current.value, detail: `${noncurrent.detail} + current ${current.detail}` } : { ...noncurrent, detail: `${noncurrent.detail} (no current portion reported at ${end})` } };
      break;
    }
    return {
      ...base, currency, revenue: income.revenue, gross: income.gross_profit, operating: income.operating_income, pretax: income.pretax_income, net: income.net_income, da: cash.depreciation_amortization, dividendsPaid: cash.dividends_paid,
      eps: perShareSeries(facts, [g('EarningsPerShareDiluted'), g('EarningsPerShareBasic')], perShare, asOf, revisions, 'EPS'),
      dps: perShareSeries(facts, [g('CommonStockDividendsPerShareDeclared'), g('CommonStockDividendsPerShareCashPaid')], perShare, asOf, revisions, 'Dividends per share'),
      equity, shares: latestInstant(facts, ['dei:EntityCommonStockSharesOutstanding', g('CommonStockSharesOutstanding')], 'shares', asOf, revisions), ev, evReason,
    };
  } catch (cause) { return { ...base, currency, reason: `Filing values could not be read: ${cause instanceof Error ? cause.message : String(cause)}` }; }
}
const snapshots = new WeakMap<FactsDocument, Map<string, Snapshot>>();
function snapshotFor(document: FactsDocument, asOf: string, revisions: StatementRevisions): Snapshot {
  let cache = snapshots.get(document); if (!cache) { cache = new Map(); snapshots.set(document, cache); }
  const key = asOf + '|' + revisions; let found = cache.get(key);
  if (!found) { if (cache.size >= 64) cache.delete(cache.keys().next().value!); found = buildSnapshot(document, asOf, revisions); cache.set(key, found); }
  return found;
}

/** Resolve the explicitly linked facts document for a dataset's exact market. */
export function screenerFundamentalsIndex(source: ScreenerFundamentalsSource): ScreenerFundamentalsLookup {
  const byId = new Map(source.documents.map(document => [document.id, document]));
  const lookup = ((dataset: BarDataset) => {
    const market = { exchange: dataset.instrument.exchange, symbol: dataset.instrument.symbol, synthetic: !!dataset.provenance.fixture }, name = `${market.exchange}:${market.symbol}`;
    const id = linkedDocumentId(source.links, market);
    if (id === null) return { reason: `No saved company facts are linked to ${name}. Open Fundamentals, load SEC companyfacts and link it to this symbol.` };
    const document = byId.get(id);
    if (!document) return { reason: `The company facts linked to ${name} were removed.` };
    if ((document.source.kind === 'synthetic') !== market.synthetic) return { reason: market.synthetic ? 'The linked document is real filing data, which a SYNTHETIC DEMO symbol never uses.' : 'The linked document is a synthetic fixture, which a real-market symbol never uses.' };
    return { document };
  }) as ScreenerFundamentalsLookup;
  lookup.source = source;
  return lookup;
}

const money = (value: number, currency: string) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
/** Newest period end present in both maps with the same start. */
function paired(a: Map<string, Flow>, b: Map<string, Flow>): [Flow, Flow] | null {
  for (const [end, left] of a) { const right = b.get(end); if (right && right.start === left.start) return [left, right]; }
  return null;
}
export function fundamentalsCell(dataset: BarDataset, metric: ScreenerFundamentalMetric, lookup?: ScreenerFundamentalsLookup): ScreenerCell {
  const last = dataset.bars.at(-1), base: ScreenerCell = { value: null, previous: null, state: 'unavailable', asOf: last?.time ?? null };
  const fail = (reason: string): ScreenerCell => ({ ...base, reason });
  if (!lookup) return fail('Saved fundamentals are not connected to this screener.');
  if (!last) return fail('No historical bars are loaded for this instrument.');
  let found: ReturnType<ScreenerFundamentalsLookup>;
  try { found = lookup(dataset); } catch (cause) { return fail(`Saved fundamentals could not be read: ${cause instanceof Error ? cause.message : String(cause)}`); }
  if ('reason' in found) return fail(found.reason);
  const document = found.document, rowDay = rowDate(dataset, last.time), cutoff = lookup.source.cutoff, asOf = cutoff !== null && cutoff < rowDay ? cutoff : rowDay;
  const snap = snapshotFor(document, asOf, lookup.source.revisions ?? 'latest');
  if (snap.reason) return fail(snap.reason);
  const currency = snap.currency!, entity = document.facts.entityName.trim() || 'CIK ' + document.facts.cik;
  const header = `${document.source.kind === 'synthetic' ? 'SYNTHETIC facts' : document.source.kind === 'sec-public' ? 'SEC companyfacts' : 'Imported companyfacts'}: ${entity} (CIK ${document.facts.cik}), filings on or before ${asOf}.`;
  const ok = (value: number, inputs: string[]): ScreenerCell => Number.isFinite(value) ? { ...base, value, state: 'available', note: [header, ...inputs].join('\n') } : fail('The result is not a finite number.');
  const margin = (numerator: Map<string, Flow>, label: string) => {
    const pair = paired(numerator, snap.revenue);
    if (!pair) return fail(`No TTM ${label} and TTM total revenue cover the same period in ${currency}.`);
    if (!(pair[1].value > 0)) return fail('TTM total revenue is zero or negative; OpenCandle leaves margins empty.');
    return ok(pair[0].value / pair[1].value * 100, [pair[0].detail + ' = ' + money(pair[0].value, currency), pair[1].detail + ' = ' + money(pair[1].value, currency)]);
  };
  if (metric === 'grossMargin') return margin(snap.gross, 'gross profit');
  if (metric === 'operatingMargin') return margin(snap.operating, 'operating income');
  if (metric === 'pretaxMargin') return margin(snap.pretax, 'pretax income');
  if (metric === 'netMargin') return margin(snap.net, 'net income');
  const eps = snap.eps[0], epsLine = eps && `${eps.detail} = ${eps.value} ${currency}`;
  if (metric === 'epsTtm') return eps ? ok(eps.value, [epsLine]) : fail(`No twelve-month or four contiguous quarterly diluted (or basic) EPS in ${currency}/shares.`);
  const dps = snap.dps[0], dpsLine = dps && `${dps.detail} = ${dps.value} ${currency}`;
  if (metric === 'dividendsPerShare') return dps ? ok(dps.value, [dpsLine]) : fail('No dividends per share declared or paid are reported for a twelve-month period or four contiguous quarters.');
  if (metric === 'payoutRatio') {
    const pair = paired(snap.dividendsPaid, snap.net);
    if (!pair) return fail(`No TTM dividends paid and TTM net income cover the same period in ${currency}.`);
    if (!(pair[1].value > 0)) return fail('TTM net income is zero or negative, so a payout ratio is not meaningful.');
    return ok(pair[0].value / pair[1].value * 100, [pair[0].detail + ' = ' + money(pair[0].value, currency), pair[1].detail + ' = ' + money(pair[1].value, currency)]);
  }
  // Price-based metrics.
  const close = last.close, priceCurrency = dataset.instrument.currency || null;
  if (!(close > 0) || !Number.isFinite(close)) return fail('The last supplied close is not a positive number.');
  if (!priceCurrency) return fail(`The dataset does not state a currency, so its price cannot be matched to ${currency} filing values.`);
  if (priceCurrency !== currency) return fail(`The price is in ${priceCurrency} but the filings are in ${currency}. OpenCandle does not convert currencies.`);
  const priceLine = `Last close ${money(close, currency)} on ${rowDay} (${dataset.provenance.fixture ? (demoDataMode() === 'legacy' ? 'SYNTHETIC DEMO dataset' : 'Example data') : dataset.provenance.providerName})`;
  if (metric === 'dividendYield') return dps ? ok(dps.value / close * 100, [dpsLine, priceLine]) : fail('No dividends per share are reported for a twelve-month period or four contiguous quarters.');
  if (metric === 'priceEarnings' || metric === 'pegRatio') {
    if (!eps) return fail(`No twelve-month or four contiguous quarterly EPS in ${currency}/shares.`);
    if (!(eps.value > 0)) return fail(`TTM EPS is ${eps.value}, zero or negative, so P/E is not meaningful.`);
    const pe = close / eps.value;
    if (metric === 'priceEarnings') return ok(pe, [priceLine, epsLine]);
    const target = dayOf(eps.end) - 365, prior = snap.eps.find(row => Math.abs(dayOf(row.end) - target) <= 15);
    if (!prior) return fail(`No TTM EPS about one year before ${eps.end} to measure trailing growth.`);
    if (!(prior.value > 0)) return fail('The prior-year TTM EPS is zero or negative, so growth is not meaningful.');
    const growth = (eps.value / prior.value - 1) * 100;
    if (!(growth > 0)) return fail(`Trailing EPS growth is ${growth.toFixed(2)}%, not positive, so PEG is not meaningful.`);
    return ok(pe / growth, [`P/E ${pe.toFixed(2)} = last close / TTM EPS`, priceLine, epsLine, `Prior ${prior.detail} = ${prior.value} ${currency}`, `Trailing EPS growth ${growth.toFixed(2)}%`]);
  }
  const shares = snap.shares;
  if (!shares) return fail('No shares outstanding count (dei:EntityCommonStockSharesOutstanding or us-gaap:CommonStockSharesOutstanding) was filed by the cutoff.');
  const cap = close * shares.value, capLine = `Market cap ${money(cap, currency)} = close x ${shares.value.toLocaleString('en-US')} shares (${shares.detail})`;
  if (metric === 'marketCap') return ok(cap, [priceLine, `Shares outstanding ${shares.value.toLocaleString('en-US')}: ${shares.detail}`]);
  if (metric === 'priceSales') {
    const revenue = [...snap.revenue.values()][0];
    if (!revenue) return fail(`No TTM total revenue in ${currency}.`);
    if (!(revenue.value > 0)) return fail('TTM revenue is zero or negative.');
    return ok(cap / revenue.value, [capLine, `${revenue.detail} = ${money(revenue.value, currency)}`]);
  }
  if (metric === 'priceBook') {
    if (!snap.equity) return fail(`No shareholders' equity (parent) in ${currency}.`);
    if (!(snap.equity.value > 0)) return fail("Shareholders' equity is zero or negative, so price to book is not meaningful.");
    return ok(cap / snap.equity.value, [capLine, `${snap.equity.detail} = ${money(snap.equity.value, currency)}`]);
  }
  // evEbitda
  if (!snap.ev) return fail(snap.evReason);
  const ebitda = paired(snap.operating, snap.da);
  if (!ebitda) return fail(`No TTM operating income and TTM depreciation and amortization cover the same period in ${currency}.`);
  const ebitdaValue = ebitda[0].value + ebitda[1].value;
  if (!(ebitdaValue > 0)) return fail('TTM EBITDA is zero or negative, so EV/EBITDA is not meaningful.');
  const ev = cap + snap.ev.debt.value - snap.ev.cash.value;
  return ok(ev / ebitdaValue, [`EV ${money(ev, currency)} = market cap + debt - cash`, capLine, `Debt: ${snap.ev.debt.detail} = ${money(snap.ev.debt.value, currency)}`, `Cash: ${snap.ev.cash.detail} = ${money(snap.ev.cash.value, currency)}`, `EBITDA ${money(ebitdaValue, currency)} = ${ebitda[0].detail} + ${ebitda[1].detail}`]);
}
