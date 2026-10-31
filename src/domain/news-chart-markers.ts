// News badges on the chart and a notification when a news
// item for the chart symbol arrives. Data is only what the user's local news documents hold (imports and SYNTHETIC samples);
// nothing is fetched here. Pure functions, no DOM.
// The letter N, the accent color, one badge per bar (newest first in the tooltip), the newest-50 cap, placement on
// the bar holding the publication time (items newer than the last bar sit on the last bar), the first-pass rule (existing items
// never notify) and the notification wording.
import { calendarSymbolMatches } from './calendar-chart-markers';
import { newsItemKey, type NewsDocument, type NewsItem } from '../analysis-news/news';

export const NEWS_MARKER_LIMIT = 50, NEWS_TOOLTIP_ITEMS = 5;
export const NEWS_MARKER_STYLE = Object.freeze({ letter: 'N', color: 'var(--lv-accent)', label: 'News' });
export interface NewsMarkerSettings { latestNews: boolean; newsNotification: boolean }
export interface NewsMarkerItem { key: string; documentId: string; itemId: string; title: string; provider: string; publishedAt: string; time: number; synthetic: boolean }
export interface NewsChartMarker { key: string; barTime: number; letter: string; color: string; items: NewsMarkerItem[]; lines: string[]; label: string; synthetic: boolean }

/** True when the news item names the chart symbol (same rule as the calendar badges: exchange prefix ignored, any case). */
export function newsItemMatches(item: Pick<NewsItem, 'instruments'>, symbol: string | null): boolean {
  return !!symbol && Array.isArray(item.instruments) && item.instruments.some(value => calendarSymbolMatches(value, symbol));
}
/** Every news item for the symbol, newest first (ties keep document order). Items without a valid time are left out. */
export function symbolNews(documents: readonly NewsDocument[], symbol: string | null): NewsMarkerItem[] {
  if (!symbol) return [];
  const out: NewsMarkerItem[] = [];
  for (const doc of documents) for (const item of doc.items) {
    if (!newsItemMatches(item, symbol)) continue;
    const ms = Date.parse(item.publishedAt); if (!Number.isFinite(ms)) continue;
    out.push({ key: newsItemKey(doc.id, item.id), documentId: doc.id, itemId: item.id, title: item.title, provider: item.provider, publishedAt: item.publishedAt, time: Math.floor(ms / 1000), synthetic: doc.kind === 'synthetic' });
  }
  return out.map((row, index) => ({ row, index })).sort((a, b) => b.row.time - a.row.time || a.index - b.index).map(entry => entry.row);
}
/** Time of the last bar at or before `time`; items newer than the last bar take the last bar; before the first bar: null. */
export function newsBarTime(bars: readonly { time: number }[], time: number): number | null {
  if (!bars.length || time < bars[0].time) return null;
  let lo = 0, hi = bars.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bars[mid].time <= time) lo = mid; else hi = mid - 1; }
  return bars[lo].time;
}
const utc = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : iso; };
/** Badges for the newest NEWS_MARKER_LIMIT items of the symbol inside the loaded bars; empty when Latest news is off. */
export function newsChartMarkers(documents: readonly NewsDocument[], symbol: string | null, bars: readonly { time: number }[], settings: Pick<NewsMarkerSettings, 'latestNews'>): NewsChartMarker[] {
  if (!settings.latestNews || !symbol || !bars.length) return [];
  const byBar = new Map<number, NewsMarkerItem[]>();
  for (const item of symbolNews(documents, symbol).slice(0, NEWS_MARKER_LIMIT)) {
    const barTime = newsBarTime(bars, item.time); if (barTime === null) continue;
    const list = byBar.get(barTime); if (list) list.push(item); else byBar.set(barTime, [item]);
  }
  return [...byBar.entries()].sort((a, b) => a[0] - b[0]).map(([barTime, items]) => {
    const synthetic = items.some(item => item.synthetic), lines: string[] = [(synthetic ? 'SYNTHETIC ' : '') + NEWS_MARKER_STYLE.label + (items.length > 1 ? ` (${items.length})` : '')];
    for (const item of items.slice(0, NEWS_TOOLTIP_ITEMS)) lines.push(item.title, `${item.provider}, ${utc(item.publishedAt)}`);
    if (items.length > NEWS_TOOLTIP_ITEMS) lines.push(`and ${items.length - NEWS_TOOLTIP_ITEMS} more`);
    return { key: 'news:' + barTime, barTime, letter: NEWS_MARKER_STYLE.letter, color: NEWS_MARKER_STYLE.color, items, lines, synthetic,
      label: `${synthetic ? 'SYNTHETIC ' : ''}${items.length} news ${items.length === 1 ? 'item' : 'items'}: ${items[0].title}` };
  });
}
/**
 * One notification pass. `known` is the set of item keys seen by the previous pass for this symbol, or null for the first pass
 * (which only records what exists, so opening a chart never floods). Returns the new known set and the fresh items, newest first.
 */
export function freshSymbolNews(known: ReadonlySet<string> | null, documents: readonly NewsDocument[], symbol: string | null): { known: Set<string>; fresh: NewsMarkerItem[] } {
  const rows = symbolNews(documents, symbol), next = new Set(rows.map(row => row.key));
  return { known: next, fresh: known === null ? [] : rows.filter(row => !known.has(row.key)) };
}
/** The status line for fresh news (our own wording). */
export function newsNotificationText(symbol: string, fresh: readonly NewsMarkerItem[]): string | null {
  if (!fresh.length) return null;
  return `${fresh[0].synthetic ? 'SYNTHETIC news' : 'News'} for ${symbol}: ${fresh[0].title}${fresh.length > 1 ? ` (and ${fresh.length - 1} more)` : ''}`;
}
