// Details sections
// built only from workspace data: SEC companyfacts and submissions (local fixtures here), supplied heatmap metadata, imported news
// and loaded daily bars. SYNTHETIC numbers; no network. Static markup is component evidence, not GUI testing.
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixtureDataset } from '../../src/domain/fixtures';
import { normalizeSubmissions, restoreFilingsDocument } from '../../src/analysis-news/filings';
import { parseNews } from '../../src/analysis-news/news';
import { DetailSourceSections, DetailSourcesProvider, detailDailyDataset, detailDividends, detailEarnings, detailFilings, detailSections, NOT_LOCAL, type DetailSources } from '../../src/fundamentals/detail-sources';
import type { FactsDocument, ReportedFact } from '../../src/fundamentals/company-facts';
import type { DetailSnapshot } from '../../src/watchlists/details';
import type { BarDataset } from '../../src/domain/types';
import { technicalRating } from '../../src/market-views/rating';

const market = { exchange: 'NASDAQ', symbol: 'ACME', synthetic: false };
const fact = (start: string, end: string, value: number, filed: string, form = '10-Q'): ReportedFact => ({ start, end, value, unit: 'USD/shares', filed, form, accession: null, fiscalYear: null, fiscalPeriod: null, frame: null });
const concept = (tag: string, observations: ReportedFact[]) => ({ id: 'us-gaap:' + tag, namespace: 'us-gaap', tag, label: tag, description: '', units: ['USD/shares'], observations });
const facts: FactsDocument = { id: 'facts-acme', source: { kind: 'local-import', label: 'Local companyfacts import', retrievedAt: '2026-01-05T00:00:00.000Z', sourceUrl: null, sha256: null }, facts: { schemaVersion: 1, cik: '0000000123', entityName: 'Acme Corp', observationCount: 6, concepts: [
  concept('EarningsPerShareDiluted', [fact('2025-07-01', '2025-09-30', 1.11, '2025-10-30'), fact('2025-04-01', '2025-06-30', 0.95, '2025-07-30'), fact('2025-04-01', '2025-06-30', 0.97, '2025-10-30'), fact('2024-10-01', '2025-09-30', 4, '2025-11-20', '10-K')]),
  concept('CommonStockDividendsPerShareDeclared', [fact('2025-07-01', '2025-09-30', 0.25, '2025-10-30'), fact('2025-04-01', '2025-06-30', 0.24, '2025-07-30')]),
] } };
const submissions = { cik: 123, name: 'Acme Corp', sic: '3571', sicDescription: 'Electronic Computers', entityType: 'operating', category: 'Large accelerated filer', stateOfIncorporationDescription: 'DE', fiscalYearEnd: '0930', tickers: ['ACME'], exchanges: ['Nasdaq'], addresses: { business: { city: 'Springfield', stateOrCountry: 'IL' } },
  filings: { recent: { accessionNumber: ['0000000123-25-000010', '0000000123-25-000009', '0000000123-25-000008'], filingDate: ['2025-11-20', '2025-10-30', '2025-10-01'], form: ['10-K', '10-Q', '8-K'], primaryDocument: ['a.htm', 'b.htm', 'c.htm'], reportDate: ['2025-09-30', '2025-09-30', ''] }, files: [] } };
const filings = normalizeSubmissions(submissions, { kind: 'local-import', retrievedAt: '2026-01-02T00:00:00Z', sourceUrl: null, sha256: null }, 'local-filings:acme');
function daily(count: number): BarDataset {
  const set = fixtureDataset('ACME', 0), start = Date.UTC(2023, 0, 1) / 1000;
  set.instrument.exchange = 'NASDAQ'; set.provenance.fixture = false;
  set.bars = Array.from({ length: count }, (_, i) => ({ time: start + i * 86400, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 }));
  return set;
}
const news = parseNews({ schemaVersion: 1, label: 'Local wire', kind: 'local-import', items: [
  { id: 'n1', title: 'Acme ships widgets', provider: 'Wire', publishedAt: '2025-11-01T12:00:00Z', instruments: ['ACME'] },
  { id: 'n2', title: 'Other company news', provider: 'Wire', publishedAt: '2025-11-02T12:00:00Z', instruments: ['OTHER'] },
] }, 'news-1', '2025-11-03T00:00:00Z');
const sources = (extra: Partial<DetailSources> = {}): DetailSources => { const set = daily(800); return { datasets: [set], news: [news], filings: [filings], facts: [facts], links: [{ ...market, documentId: 'facts-acme' }], heatmap: [{ instrumentId: set.instrument.id, marketCap: null, aum: null, currency: 'USD', sector: 'Technology', fundAssetClass: null, asOf: 0, availableAt: 0, source: 'My sheet' }], ...extra }; };
const byId = (list: ReturnType<typeof detailSections>) => Object.fromEntries(list.map(section => [section.id, section]));

describe('SEC submissions profile', () => {
  it('keeps supplied profile fields, survives restore, and is absent when the file has none', () => {
    expect(filings.profile).toEqual({ sic: '3571', sicDescription: 'Electronic Computers', entityType: 'operating', category: 'Large accelerated filer', stateOfIncorporation: 'DE', fiscalYearEnd: '0930', tickers: ['ACME'], exchanges: ['Nasdaq'], businessCity: 'Springfield', businessState: 'IL' });
    expect(restoreFilingsDocument(JSON.parse(JSON.stringify(filings)))).toEqual(filings);
    const bare = normalizeSubmissions({ cik: 123, name: 'Acme Corp', filings: submissions.filings }, { kind: 'local-import', retrievedAt: '2026-01-02T00:00:00Z', sourceUrl: null, sha256: null });
    expect('profile' in bare).toBe(false);
    expect(() => normalizeSubmissions({ ...submissions, sic: 'abc' }, { kind: 'local-import', retrievedAt: '2026-01-02T00:00:00Z', sourceUrl: null, sha256: null })).toThrow('Invalid SIC code.');
  });
});

describe('Details sections from local sources', () => {
  const sections = byId(detailSections(sources(), market));
  it('COMPANY_PROFILE and SECTOR come from SEC submissions and supplied metadata', () => {
    // The profile now also states the SIC 6770 blank check flag (stronger pin, one more expected line).
    expect(sections.profile.lines.map(l => l.label + ': ' + l.value)).toEqual(['Company: Acme Corp', 'SEC CIK: 0000000123', 'Entity type: operating', 'Filer category: Large accelerated filer', 'Incorporated in: DE', 'Fiscal year ends: Sep 30', 'Blank check company: No', 'Business address: Springfield, IL', 'Listed as: ACME (Nasdaq)']);
    expect(sections.sector.lines.map(l => l.value)).toEqual(['3571 · Electronic Computers', 'Technology']);
    expect(sections.sector.footnote).toContain(NOT_LOCAL);
  });
  it('EARNINGS lists reported quarterly EPS (latest filed version per period) and 10-Q / 10-K filing dates; estimates are not local', () => {
    expect(sections.earnings.lines.map(l => l.label + ' = ' + l.value)).toEqual(['Diluted EPS · quarter to 2025-09-30 = 1.11 USD', 'Diluted EPS · quarter to 2025-06-30 = 0.97 USD', '10-K filed = 2025-11-20', '10-Q filed = 2025-10-30']);
    expect(sections.earnings.footnote).toBe('Reported values from SEC filings only. Estimates, surprises and the next report date are not available from local sources.');
    expect(detailEarnings(null, null, { ...market, synthetic: true }).empty).toBe('Demo symbols have no reported earnings.');
  });
  it('DIVIDENDS lists declared per-share amounts; dates and yield are not local', () => {
    expect(sections.dividends.lines.map(l => l.value)).toEqual(['0.2500 USD', '0.2400 USD']);
    expect(detailDividends({ ...facts, facts: { ...facts.facts, concepts: [facts.facts.concepts[0]] } }, market).empty).toBe('The linked company facts report no dividends per share.');
  });
  it('NEWS shows imported stories for the symbol only', () => {
    expect(sections.news.lines).toEqual([{ label: '2025-11-01 12:00:00 UTC · Wire', value: 'Acme ships widgets' }]);
    expect(byId(detailSections(sources({ news: [] }), market)).news.empty).toBe('No imported news mentions ACME.');
  });
  it('TECHNICAL_RATINGS and SEASONALS compute from loaded daily bars, and say what is missing otherwise', () => {
    // The rating itself is market-views/rating.ts (pinned elsewhere); Details shows its label, score and vote counts.
    const rating = technicalRating(daily(800).bars);
    expect(sections.technical.lines.slice(0, 2)).toEqual([{ label: 'Summary', value: `${rating.label} (${rating.score!.toFixed(2)})` }, { label: 'Votes', value: `${rating.buy} buy · ${rating.neutral} neutral · ${rating.sell} sell` }]);
    expect(sections.seasonals.lines).toHaveLength(12); expect(sections.seasonals.lines[0].value).toMatch(/^\+\d+\.\d\d%$/);
    const none = byId(detailSections(sources({ datasets: [] }), market));
    expect(none.technical.empty).toBe('Load daily bars for this symbol to compute a rating.'); expect(none.seasonals.empty).toBe('Load daily bars for this symbol to see seasonals.');
    expect(detailDailyDataset([daily(5)], { ...market, synthetic: true })).toBeNull();
  });
  it('demo markets never use real SEC filings; the CIK route is used when no ticker matches', () => {
    expect(detailFilings([filings], { ...market, synthetic: true }, null)).toBeNull();
    const noTicker = { ...filings, profile: undefined };
    expect(detailFilings([noTicker], { ...market, symbol: 'ZZZ' }, null, () => '123')).toBe(noTicker);
    expect(detailFilings([noTicker], { ...market, symbol: 'ZZZ' }, null, () => null)).toBeNull();
  });
});

describe('DetailSourceSections markup', () => {
  const snapshot: DetailSnapshot = { symbol: 'ACME', exchange: 'NASDAQ', synthetic: false, description: 'Acme', blocks: { summary: [], daily: [], identity: [], source: [] }, diagnostic: '', disclaimer: '' };
  const props = { market, snapshot, summary: null, assetClass: 'stock' };
  it('without app sources it renders the plain coverage children unchanged', () => {
    expect(renderToStaticMarkup(React.createElement(DetailSourceSections, props, React.createElement('p', null, 'plain coverage')))).toBe('<p>plain coverage</p>');
  });
  it('with sources it renders the sections and keeps only the remaining coverage rows', () => {
    const html = renderToStaticMarkup(React.createElement(DetailSourcesProvider, { value: { ...sources(), onOpenNews: () => {} } }, React.createElement(DetailSourceSections, props, React.createElement('p', null, 'plain coverage'))));
    for (const title of ['Company profile', 'Sector and industry', 'Earnings', 'Dividends', 'News', 'Technical rating', 'Seasonals']) expect(html).toContain(`aria-label="${title}"`);
    expect(html).not.toContain('plain coverage'); expect(html).toContain('Open News');
    expect(html).toContain('data-coverage="bonds"'); expect(html).not.toContain('data-coverage="earnings"');
    expect(html).not.toMatch(/—/);
  });
});
