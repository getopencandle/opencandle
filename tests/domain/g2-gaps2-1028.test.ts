import { describe, expect, it } from 'vitest';
import { providerTermsApply } from '../../src/domain/provider-capabilities';
import { chartCsvSavedMessage, chartSourceCsv } from '../../src/ui/chart-source-export';
import { sourceContextForDataset } from '../../src/chart/source-context';
import { fixtureDataset } from '../../src/domain/fixtures';
import { ALPACA_SIP_PROVIDER_ID, ALPACA_STUB_PROVIDER_ID } from '../../src/domain/alpaca-live';
import { freshSymbolNews, newsBarTime, newsChartMarkers, newsNotificationText, symbolNews, NEWS_MARKER_LIMIT } from '../../src/domain/news-chart-markers';
import { factoryAppearance, factoryPriceScale, findRow, writeRow, type ChartSettingsSources } from '../../src/chart/chart-settings-bindings';
import { defaultChartSettingsDocument } from '../../src/chart/chart-settings-document';
import type { NewsDocument, NewsItem } from '../../src/analysis-news/news';

// DATA.EXPORT provider terms (owner decision 2026-10-31: live, FRED and licensed data export for personal analysis); WS.EVENTS.LATEST_NEWS and WS.EVENTS.NEWS_NOTIFICATIONS (news badges + notification).
// SYNTHETIC datasets and news documents; expected values worked out by hand.
describe('DATA.EXPORT provider terms', () => {
  it('apply to live, FRED and non-redistributable real sources, not to synthetic, local or unknown ones', () => {
    expect(providerTermsApply({ providerId: ALPACA_SIP_PROVIDER_ID, fixture: false })).toBe(true);
    expect(providerTermsApply({ providerId: ALPACA_SIP_PROVIDER_ID, fixture: true })).toBe(false);
    expect(providerTermsApply({ datasetId: 'live:coinbase-public:BTC-USD:1m', fixture: false })).toBe(true);
    expect(providerTermsApply({ datasetId: 'fred:fred-public:DGS10:1D', providerId: 'fred-public', fixture: false })).toBe(true);
    expect(providerTermsApply({ providerId: 'alpaca-iex' })).toBe(true);
    expect(providerTermsApply({ providerId: ALPACA_STUB_PROVIDER_ID, fixture: true })).toBe(false);
    for (const providerId of ['local-import', 'lv-local-aggregation', 'lv-synthetic-v1', 'no-such-provider', undefined]) expect(providerTermsApply({ providerId, fixture: false })).toBe(false);
  });
  it('chart CSV exports an Alpaca delayed-history source with the terms line after saving, and a synthetic one without it', () => {
    const data = fixtureDataset('SPY', 3);
    expect(chartSourceCsv({ bars: data.bars, source: sourceContextForDataset(data), style: 'candles' }, 'ordinary').split('\r\n').length).toBe(5);
    const alpaca = fixtureDataset('SPY', 3);
    alpaca.provenance = { ...alpaca.provenance, providerId: ALPACA_SIP_PROVIDER_ID, providerName: 'Alpaca', datasetId: ALPACA_SIP_PROVIDER_ID + ':SPY:1D', fixture: false };
    const source = sourceContextForDataset(alpaca);
    expect(chartSourceCsv({ bars: alpaca.bars, source, style: 'candles' }, 'ordinary').split('\r\n').length).toBe(5);
    expect(chartCsvSavedMessage('Chart data saved', source, {})).toBe("Chart data saved. Market data from Alpaca, saved for your personal analysis. The provider's terms apply: do not share or resell this file.");
    expect(chartCsvSavedMessage('Chart data saved', sourceContextForDataset(data), {})).toBe('Chart data saved');
  });
});

const at = (iso: string) => Date.parse(iso) / 1000;
const daily = Array.from({ length: 10 }, (_, i) => ({ time: at('2026-06-01T00:00:00Z') + i * 86400 }));
const item = (id: string, publishedAt: string, instruments: string[] | null = ['GME']): NewsItem => ({ id, title: 'Synthetic ' + id, summary: '', provider: 'SYNTH', publishedAt, sourceUrl: null, instruments, markets: null, sectors: null, corporateActivity: null, economics: null, countries: null, formats: null });
const doc = (items: NewsItem[], id = 'g2-gaps2-news', kind: NewsDocument['kind'] = 'synthetic'): NewsDocument => ({ id, schemaVersion: 1, label: 'SYNTHETIC G2-GAPS2', importedAt: '2026-06-01T00:00:00.000Z', kind, items });

describe('WS.EVENTS.LATEST_NEWS', () => {
  it('places items on the bar holding the publication time, newer than the last bar on the last bar, before the first bar nowhere', () => {
    expect(newsBarTime(daily, at('2026-06-03T15:00:00Z'))).toBe(at('2026-06-03T00:00:00Z'));
    expect(newsBarTime(daily, at('2026-06-03T00:00:00Z'))).toBe(at('2026-06-03T00:00:00Z'));
    expect(newsBarTime(daily, at('2026-07-01T00:00:00Z'))).toBe(at('2026-06-10T00:00:00Z'));
    expect(newsBarTime(daily, at('2026-05-01T00:00:00Z'))).toBeNull();
    expect(newsBarTime([], 1)).toBeNull();
  });
  it('one badge per bar for the chart symbol only (exchange prefix ignored), newest first, off when Latest news is off', () => {
    const d = doc([item('a', '2026-06-03T09:00:00Z'), item('b', '2026-06-03T18:00:00Z', ['NASDAQ:gme']), item('c', '2026-06-05T10:00:00Z'), item('other', '2026-06-04T10:00:00Z', ['AMC']), item('none', '2026-06-04T10:00:00Z', null), item('early', '2026-05-01T00:00:00Z')]);
    const markers = newsChartMarkers([d], 'GME', daily, { latestNews: true });
    expect(markers.map(m => [m.barTime, m.items.map(i => i.itemId)])).toEqual([[at('2026-06-03T00:00:00Z'), ['b', 'a']], [at('2026-06-05T00:00:00Z'), ['c']]]);
    expect(markers[0].lines).toEqual(['SYNTHETIC News (2)', 'Synthetic b', 'SYNTH, 2026-06-03 18:00 UTC', 'Synthetic a', 'SYNTH, 2026-06-03 09:00 UTC']);
    expect(markers[0].label).toBe('SYNTHETIC 2 news items: Synthetic b');
    expect(markers[1].letter).toBe('N');
    expect(newsChartMarkers([d], 'GME', daily, { latestNews: false })).toEqual([]);
    expect(newsChartMarkers([d], null, daily, { latestNews: true })).toEqual([]);
    expect(newsChartMarkers([doc([item('x', '2026-06-02T00:00:00Z')], 'imp', 'local-import')], 'GME', daily, { latestNews: true })[0].synthetic).toBe(false);
  });
  it('keeps only the newest NEWS_MARKER_LIMIT items and caps the tooltip at five titles', () => {
    const many = doc(Array.from({ length: NEWS_MARKER_LIMIT + 5 }, (_, i) => item('n' + i, new Date(Date.UTC(2026, 5, 10, 0, i)).toISOString())));
    const markers = newsChartMarkers([many], 'GME', daily, { latestNews: true });
    expect(markers).toHaveLength(1);
    expect(markers[0].items).toHaveLength(NEWS_MARKER_LIMIT);
    expect(markers[0].items[0].itemId).toBe('n' + (NEWS_MARKER_LIMIT + 4));
    expect(markers[0].lines.at(-1)).toBe(`and ${NEWS_MARKER_LIMIT - 5} more`);
  });
});

describe('WS.EVENTS.NEWS_NOTIFICATIONS', () => {
  it('the first pass records existing items; a later pass reports only new items for the symbol', () => {
    const first = freshSymbolNews(null, [doc([item('a', '2026-06-03T09:00:00Z')])], 'GME');
    expect(first.fresh).toEqual([]);
    const docs = [doc([item('a', '2026-06-03T09:00:00Z'), item('b', '2026-06-04T09:00:00Z'), item('c', '2026-06-05T09:00:00Z'), item('amc', '2026-06-05T09:00:00Z', ['AMC'])])];
    const second = freshSymbolNews(first.known, docs, 'GME');
    expect(second.fresh.map(row => row.itemId)).toEqual(['c', 'b']);
    expect(newsNotificationText('GME', second.fresh)).toBe('SYNTHETIC news for GME: Synthetic c (and 1 more)');
    expect(freshSymbolNews(second.known, docs, 'GME').fresh).toEqual([]);
    expect(newsNotificationText('GME', [])).toBeNull();
    expect(symbolNews(docs, 'AMC').map(row => row.itemId)).toEqual(['amc']);
  });
  it('both chart settings rows are live and saved in the chart settings document', () => {
    const sources = (): ChartSettingsSources => ({ appearance: factoryAppearance(), document: defaultChartSettingsDocument(), documentConnected: true, priceScale: factoryPriceScale(), ratio: 0.5, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null, scaleMode: { scale: 'linear', invert: false, auto: true } });
    for (const key of ['events.lastNews', 'events.notificationAboutNews']) expect(findRow('events', sources(), key)!.availability).toEqual({ state: 'live' });
    expect(defaultChartSettingsDocument().events).toMatchObject({ latestNews: true, newsNotification: false });
    expect(writeRow(sources(), 'events.notificationAboutNews', { checked: true }).document.events.newsNotification).toBe(true);
    expect(writeRow(sources(), 'events.lastNews', { checked: false }).document.events.latestNews).toBe(false);
  });
});
