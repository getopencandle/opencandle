import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { NewsDocument } from '../analysis-news/news';
import { calendarMarkerOffsets } from '../domain/calendar-marker-layout';
import { CHART_EVENT_STYLE } from '../domain/chart-events';
import { freshSymbolNews, newsChartMarkers, newsNotificationText, type NewsChartMarker, type NewsMarkerSettings } from '../domain/news-chart-markers';
import { CALENDAR_MARKER_ROW_GAP } from './CalendarChartMarkers';
import { CHART_EVENTS_Z_INDEX, eventBarSpacing, eventsCompressed, type ChartEventProjection } from './ChartEventMarkers';

/**
 * N badges for the chart symbol's local news items, one row
 * above the calendar badges. Hover shows the newest titles; click (or Enter/Space) opens News. With News notification on, an item
 * for the symbol that arrives after the chart opened (an import, a refresh) is reported once through `onNotify`.
 * Model: src/domain/news-chart-markers.ts. Hidden at compressed zoom like the other event badges.
 */
export interface NewsChartMarkersProps {
  documents: readonly NewsDocument[];
  symbol: string | null;
  bars: readonly { time: number }[];
  settings: NewsMarkerSettings;
  projection: () => ChartEventProjection | null;
  timeToX: (seconds: number) => number | null;
  onOpen?: (marker: NewsChartMarker) => void;
  onNotify?: (text: string) => void;
}
interface Geometry { projection: ChartEventProjection; xs: number[]; spacing: number | null }
function read(props: NewsChartMarkersProps, markers: readonly NewsChartMarker[]): Geometry | null {
  const projection = props.projection(); if (!projection) return null;
  const xs = markers.map(marker => { let x: number | null = null; try { x = props.timeToX(marker.barTime); } catch { x = null; } return x === null || !Number.isFinite(x) ? NaN : x; });
  return { projection: { ...projection }, xs, spacing: eventBarSpacing(props.timeToX, props.bars) };
}
const key = (g: Geometry | null) => g ? [g.projection.left, g.projection.top, g.projection.width, g.projection.height, eventsCompressed(g.spacing), ...g.xs].join('|') : '';
/** Badge row for news: one calendar row above the calendar badges. */
export const NEWS_MARKER_ROW_OFFSET = 2 * CALENDAR_MARKER_ROW_GAP;

/** Notifications only: runs even when the badges are off. The first pass for a symbol records what exists. */
export function useNewsNotifications(documents: readonly NewsDocument[], symbol: string | null, enabled: boolean, onNotify?: (text: string) => void) {
  const known = useRef<{ symbol: string | null; keys: Set<string> | null }>({ symbol: null, keys: null });
  useEffect(() => {
    if (!enabled || known.current.symbol !== symbol) known.current = { symbol, keys: null };
    if (!enabled) return;
    const pass = freshSymbolNews(known.current.keys, documents, symbol);
    known.current = { symbol, keys: pass.known };
    const text = symbol ? newsNotificationText(symbol, pass.fresh) : null;
    if (text) onNotify?.(text);
  }, [documents, symbol, enabled]);
}

export function NewsChartMarkers(props: NewsChartMarkersProps) {
  const { documents, symbol, bars, settings } = props;
  useNewsNotifications(documents, symbol, settings.newsNotification, props.onNotify);
  const markers = useMemo(() => newsChartMarkers(documents, symbol, bars, settings), [documents, symbol, bars, settings.latestNews]);
  const offsets = useMemo(() => calendarMarkerOffsets(markers, CHART_EVENT_STYLE.size), [markers]);
  const [geometry, setGeometry] = useState<Geometry | null>(null), [hover, setHover] = useState<string | null>(null);
  const latest = useRef(props); latest.current = props;
  useEffect(() => {
    if (!markers.length) { setGeometry(null); return; }
    let frame = 0, last: string | null = null;
    const step = () => { let next: Geometry | null = null; try { next = read(latest.current, markers); } catch { next = null; } const k = key(next); if (k !== last) { last = k; setGeometry(next); } frame = requestAnimationFrame(step); };
    step();
    return () => cancelAnimationFrame(frame);
  }, [markers]);
  if (!symbol || !markers.length) return null;
  const size = CHART_EVENT_STYLE.size, projection = geometry?.projection ?? null, compressed = !!geometry && eventsCompressed(geometry.spacing);
  const shown = projection && geometry && !compressed ? markers.map((marker, i) => ({ marker, x: geometry.xs[i] - projection.left + offsets[i] })).filter(row => row.x === row.x && row.x >= -size && row.x <= projection.width + size) : [];
  const top = projection ? projection.height - size - NEWS_MARKER_ROW_OFFSET : 0, hovered = shown.find(row => row.marker.key === hover) ?? null;
  const open = (marker: NewsChartMarker) => props.onOpen?.(marker);
  return (
    <div className="lv-news-chart-markers" {...(shown.length ? { role: 'group', 'aria-label': markers.some(row => row.synthetic) ? 'News, some SYNTHETIC' : 'News' } : { 'aria-hidden': true })}
      data-lv-news-markers={shown.length} data-lv-news-markers-total={markers.length} data-lv-news-markers-compressed={compressed ? 'true' : undefined}
      title={shown.length ? undefined : compressed ? `The news of ${symbol} is hidden while the bars are this compressed. Zoom in to see it.` : `The news of ${symbol} is outside the visible range.`}
      style={projection ? { position: 'fixed', left: projection.left, top: projection.top, width: projection.width, height: projection.height, pointerEvents: 'none', zIndex: CHART_EVENTS_Z_INDEX, overflow: 'hidden' } : { position: 'fixed', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {shown.map(({ marker, x }) => (
        <span key={marker.key} role={props.onOpen ? 'button' : 'img'} tabIndex={props.onOpen ? 0 : undefined} aria-label={marker.label} data-lv-news-marker={marker.items.length} data-bar-time={marker.barTime}
          onPointerEnter={() => setHover(marker.key)} onPointerLeave={() => setHover(current => current === marker.key ? null : current)}
          onClick={() => open(marker)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(marker); } }}
          style={{ position: 'absolute', left: x - size / 2, top, width: size, height: size, boxSizing: 'border-box', borderRadius: '50%', border: `1px solid ${marker.color}`, background: 'var(--lv-legend-bg)', color: marker.color, font: `600 10px/${size - 2}px system-ui,sans-serif`, textAlign: 'center', pointerEvents: 'auto', cursor: props.onOpen ? 'pointer' : 'default', userSelect: 'none' }}>
          {marker.letter}
        </span>
      ))}
      {hovered && projection && (
        <div role="tooltip" className="lv-news-marker-tooltip" data-lv-news-marker-tooltip=""
          style={{ position: 'absolute', left: Math.max(4, Math.min(hovered.x - 130, projection.width - 264)), bottom: size + NEWS_MARKER_ROW_OFFSET + 6, width: 260, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 4, background: 'var(--lv-bg-tooltip)', border: `1px solid ${hovered.marker.color}`, color: 'var(--lv-text-primary)', font: '12px/17px system-ui,sans-serif', pointerEvents: 'none' }}>
          {hovered.marker.lines.map((line, index) => <div key={index} style={index === 0 ? { fontWeight: 600, color: hovered.marker.color } : index % 2 === 0 ? { color: 'var(--lv-text-secondary)' } : undefined}>{line}</div>)}
          {props.onOpen && <div style={{ color: 'var(--lv-text-secondary)', marginTop: 4 }}>Click to open News.</div>}
        </div>
      )}
    </div>
  );
}
