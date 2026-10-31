import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarDocument } from '../domain/calendar';
import { calendarChartMarkers, type CalendarChartMarker, type CalendarMarkerSettings } from '../domain/calendar-chart-markers';
import { calendarMarkerLanes, calendarMarkerOffsets, layoutCalendarMarkers } from '../domain/calendar-marker-layout';
import { CHART_EVENT_STYLE } from '../domain/chart-events';
import { CHART_EVENTS_Z_INDEX, eventBarSpacing, eventsCompressed, type ChartEventProjection } from './ChartEventMarkers';

/**
 * Badges for the active symbol's calendar entries (earnings E, dividends D, splits S, IPO I), one row above the
 * corporate-action badges so both can show at once. Hover shows the entry; click (or Enter/Space) opens the same calendar entry
 * through `onOpen`. Model and placement: src/domain/calendar-chart-markers.ts. Only the 16 px badges take the pointer.
 */
export interface CalendarChartMarkersProps {
  documents: readonly CalendarDocument[];
  /** The chart's symbol; any exchange prefix is ignored when matching calendar symbols. */
  symbol: string | null;
  bars: readonly { time: number }[];
  settings: CalendarMarkerSettings;
  projection: () => ChartEventProjection | null;
  timeToX: (seconds: number) => number | null;
  /** Opens the calendar on one entry. Without it the badges are hover-only. */
  onOpen?: (entry: { documentId: string; eventId: string }) => void;
  now?: number;
}
interface Geometry { projection: ChartEventProjection; xs: Float64Array; spacing: number | null }
// The frame loop is now one cheap probe (projection, bar spacing, x of three anchor times). The per-marker x
// pass runs only when that signature moves (pan, zoom, resize, new list), and the list-wide stacking offsets are memoized.
function probeTimes(markers: readonly CalendarChartMarker[]): number[] { return markers.length ? [markers[0].barTime, markers[markers.length >> 1].barTime, markers[markers.length - 1].barTime] : []; }
function safeX(props: CalendarChartMarkersProps, time: number): number | null { let x: number | null = null; try { x = props.timeToX(time); } catch { x = null; } return x === null || !Number.isFinite(x) ? null : x; }
function signature(props: CalendarChartMarkersProps, markers: readonly CalendarChartMarker[]): string | null {
  const projection = props.projection(); if (!projection) return null;
  return [projection.left, projection.top, projection.width, projection.height, eventBarSpacing(props.timeToX, props.bars), ...probeTimes(markers).map(time => safeX(props, time))].join('|');
}
function read(props: CalendarChartMarkersProps, markers: readonly CalendarChartMarker[]): Geometry | null {
  const projection = props.projection(); if (!projection) return null;
  const xs = new Float64Array(markers.length), cache = new Map<number, number>();
  for (let i = 0; i < markers.length; i++) {
    const time = markers[i].barTime; let x = cache.get(time);
    if (x === undefined) { const raw = safeX(props, time); x = raw === null ? NaN : raw; cache.set(time, x); }
    xs[i] = x;
  }
  return { projection: { ...projection }, xs, spacing: eventBarSpacing(props.timeToX, props.bars) };
}
function same(a: Geometry | null, b: Geometry | null) {
  if (!a || !b) return a === b;
  const p = a.projection, q = b.projection;
  if (p.left !== q.left || p.top !== q.top || p.width !== q.width || p.height !== q.height || a.xs.length !== b.xs.length || eventsCompressed(a.spacing) !== eventsCompressed(b.spacing)) return false;
  for (let i = 0; i < a.xs.length; i++) if (a.xs[i] !== b.xs[i] && !(a.xs[i] !== a.xs[i] && b.xs[i] !== b.xs[i])) return false;
  return true;
}
/** Badge row: directly above the corporate-action badges. */
export const CALENDAR_MARKER_ROW_GAP = CHART_EVENT_STYLE.size + CHART_EVENT_STYLE.bottomGap + 4;

export function CalendarChartMarkers(props: CalendarChartMarkersProps) {
  const { documents, symbol, bars, settings } = props;
  // Future events only follows the clock; without a supplied `now` the list is rebuilt once a minute.
  const ticking = props.now === undefined && settings.economic === true && settings.economicFutureOnly === true;
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => { if (!ticking) return; const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 60000); return () => clearInterval(timer); }, [ticking]);
  const now = props.now ?? (ticking ? Math.max(minute * 60, Math.floor(Date.now() / 1000)) : undefined);
  const markers = useMemo(() => calendarChartMarkers(documents, symbol, bars, settings, now), [documents, symbol, bars, settings.earnings, settings.dividends, settings.splits, settings.ipos, settings.economic, settings.economicFutureOnly, settings.timezone, (settings.skipDocumentIds ?? []).join('|'), props.now, ticking ? minute : 0]);
  const [geometry, setGeometry] = useState<Geometry | null>(null), [hover, setHover] = useState<string | null>(null);
  const latest = useRef({ props, markers }); latest.current = { props, markers };
  const offsets = useMemo(() => calendarMarkerOffsets(markers, CHART_EVENT_STYLE.size), [markers]);
  // The marker list identity is part of the key, so a changed list (settings, events, bars, zone) always re-reads.
  useEffect(() => {
    if (!markers.length) { setGeometry(null); return; }
    let frame = 0, previous: Geometry | null = null, lastSignature: string | null | undefined;
    const step = () => {
      let sig: string | null = null; try { sig = signature(latest.current.props, markers); } catch { sig = null; }
      if (sig !== lastSignature) {
        lastSignature = sig;
        let next: Geometry | null = null; try { next = read(latest.current.props, markers); } catch { next = null; }
        if (!same(previous, next)) { previous = next; setGeometry(next); }
      }
      frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [markers]);
  const size = CHART_EVENT_STYLE.size, projection = geometry?.projection ?? null;
  const compressed = !!projection && !!geometry && eventsCompressed(geometry.spacing);
  const shown = useMemo(() => projection && geometry && !compressed ? layoutCalendarMarkers(markers, geometry.xs, offsets, projection.left, projection.width, size) : [], [projection, geometry, compressed, markers, offsets, size]);
  // Flags that would overlap their neighbour stack upward (row 0 is the base row).
  const lanes = useMemo(() => calendarMarkerLanes(shown, size), [shown, size]), laneOf = new Map(shown.map((row, index) => [row.marker.key, lanes[index] ?? 0]));
  if (!symbol || !markers.length) return null;
  const top = projection ? projection.height - size - CALENDAR_MARKER_ROW_GAP : 0, hovered = shown.find(row => row.marker.key === hover) ?? null;
  const open = (marker: CalendarChartMarker) => { const entry = marker.entries[0]; if (entry && props.onOpen) props.onOpen({ documentId: entry.documentId, eventId: entry.eventId }); };
  return (
    <div className="lv-calendar-chart-markers" {...(shown.length ? { role: 'group', 'aria-label': markers.some(row => row.synthetic) ? 'Calendar entries, some SYNTHETIC' : 'Calendar entries' } : { 'aria-hidden': true })}
      data-lv-calendar-markers={shown.length} data-lv-calendar-markers-total={markers.length} data-lv-calendar-markers-compressed={compressed ? 'true' : undefined}
      title={shown.length ? undefined : compressed ? `The calendar entries of ${symbol} are hidden while the bars are this compressed. Zoom in to see them.` : `The calendar entries of ${symbol} are outside the visible range.`}
      style={projection ? { position: 'fixed', left: projection.left, top: projection.top, width: projection.width, height: projection.height, pointerEvents: 'none', zIndex: CHART_EVENTS_Z_INDEX, overflow: 'hidden' } : { position: 'fixed', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {shown.map(({ marker, x }) => (
        <span key={marker.key} role={props.onOpen ? 'button' : 'img'} tabIndex={props.onOpen ? 0 : undefined} aria-label={marker.label} data-lv-calendar-marker={marker.kind} data-bar-time={marker.barTime}
          onPointerEnter={() => setHover(marker.key)} onPointerLeave={() => setHover(current => current === marker.key ? null : current)}
          onClick={() => open(marker)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(marker); } }}
          data-lv-calendar-marker-future={marker.future ? 'true' : undefined} data-lv-calendar-marker-lane={laneOf.get(marker.key) || undefined}
          style={{ position: 'absolute', left: x - size / 2, top: top - (laneOf.get(marker.key) ?? 0) * (size + 2), width: size, height: size, boxSizing: 'border-box', borderRadius: marker.kind === 'economic' ? '3px 3px 3px 0' : 3, border: `1px solid ${marker.color}`, background: 'var(--lv-legend-bg)', color: marker.color, font: marker.kind === 'economic' && marker.letter.length > 1 ? `600 8px/${size - 2}px system-ui,sans-serif` : `600 10px/${size - 2}px system-ui,sans-serif`, textAlign: 'center', pointerEvents: 'auto', cursor: props.onOpen ? 'pointer' : 'default', userSelect: 'none' }}>
          {marker.letter}
        </span>
      ))}
      {hovered && projection && (
        <div role="tooltip" className="lv-calendar-marker-tooltip" data-lv-calendar-marker-tooltip={hovered.marker.kind}
          style={{ position: 'absolute', left: Math.max(4, Math.min(hovered.x - 110, projection.width - 224)), bottom: size + CALENDAR_MARKER_ROW_GAP + 6 + (laneOf.get(hovered.marker.key) ?? 0) * (size + 2), width: 220, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 4, background: 'var(--lv-bg-tooltip)', border: `1px solid ${hovered.marker.color}`, color: 'var(--lv-text-primary)', font: '12px/17px system-ui,sans-serif', pointerEvents: 'none' }}>
          {hovered.marker.lines.map((line, index) => line ? <div key={index} style={index === 0 || hovered.marker.lines[index - 1] === '' ? { fontWeight: 600, color: hovered.marker.color } : undefined}>{line}</div> : <hr key={index} style={{ border: 0, borderTop: '1px solid var(--lv-border)', margin: '4px 0' }} />)}
          {props.onOpen && <div style={{ color: 'var(--lv-text-secondary)', marginTop: 4 }}>Click to open in the calendar.</div>}
        </div>
      )}
    </div>
  );
}
