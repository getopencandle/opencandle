// The chart badges for the active symbol's calendar
// entries, so an imported or auto-filled earnings report, dividend, split or IPO appears on the bar of its date and opens the same
// calendar entry. Data is only what the user's calendar documents hold (imports, SEC-facts auto-fill, Alpaca auto-fill); nothing
// is fetched here. Placement reuses the corporate-action rule (New York trading date, eventBarTime) from chart-events.ts.
// Letters E/D/S/I, the CSS-token colors, the stacking row above the corporate-action badges and the tooltip wording.
import { queryCalendar, createCalendarState, SYNTHETIC_CALENDAR_DEMO_ID, type CalendarDocument, type CalendarKind, type CalendarRow, type CalendarValueView } from './calendar';
import { eventBarTime } from './chart-events';
import { AUTO_DIVIDEND_DOCUMENT_ID } from './calendar-sources';

// Economic entries of the same local documents, a flag
// badge at the event time (bar of the release, or the future area right of the last bar), not tied to the chart symbol (calendar
// documents carry no symbol-to-country link). "Future events only" leaves out economic entries whose time (or whole date) has passed.
// The country-code flag, the importance colors, the future-bar snapping and that the filter applies to economic entries only.
export type CalendarMarkerKind = CalendarKind;
export interface CalendarMarkerSettings { earnings: boolean; dividends: boolean; splits: boolean; ipos: boolean;
  /** Economic entries on the chart; absent means off. */
  economic?: boolean;
  /** With `economic`: only entries whose time is still ahead of `now`. */
  economicFutureOnly?: boolean;
  /** Document ids whose events the chart already marks another way (the Alpaca corporate-action badges). */
  skipDocumentIds?: readonly string[];
  /** IANA zone of the chart clock. Tooltip times read in it; placement keeps the New York date. Absent means New York. */
  timezone?: string; }
export const CALENDAR_MARKER_STYLE: Readonly<Record<CalendarMarkerKind, { letter: string; color: string; label: string }>> = Object.freeze({
  earnings: { letter: 'E', color: 'var(--lv-accent)', label: 'Earnings' },
  dividend: { letter: 'D', color: 'var(--lv-positive-text)', label: 'Dividend' },
  split: { letter: 'S', color: 'var(--lv-notice-text)', label: 'Split' },
  ipo: { letter: 'I', color: 'var(--lv-text-secondary)', label: 'IPO' },
  economic: { letter: 'EC', color: 'var(--lv-text-secondary)', label: 'Economic event' },
});
/** Economic flag color by importance: high, medium, then low or not supplied. */
export const ECONOMIC_IMPORTANCE_COLOR: Readonly<Record<'high' | 'medium' | 'low', string>> = Object.freeze({ high: 'var(--lv-negative-text)', medium: 'var(--lv-notice-text)', low: 'var(--lv-text-secondary)' });
export interface CalendarMarkerEntry { documentId: string; eventId: string; kind: CalendarMarkerKind; date: string; synthetic: boolean; lines: string[]; country?: string | null; importance?: 'low' | 'medium' | 'high' | null; }
export interface CalendarChartMarker { key: string; kind: CalendarMarkerKind; barTime: number; letter: string; color: string; entries: CalendarMarkerEntry[]; lines: string[]; label: string; synthetic: boolean;
  /** Economic flags placed right of the last loaded bar (an upcoming release). */
  future?: boolean; }

/** True when a calendar symbol names the chart symbol: exact (case-insensitive), or the part after an exchange prefix. */
export function calendarSymbolMatches(calendarSymbol: string | null, chartSymbol: string): boolean {
  if (!calendarSymbol || !chartSymbol) return false;
  const bare = (value: string) => { const upper = value.trim().toUpperCase(); return upper.includes(':') ? upper.slice(upper.lastIndexOf(':') + 1) : upper; };
  return bare(calendarSymbol) === bare(chartSymbol);
}
function shown(value: CalendarValueView): string | null {
  if (value.value === null) return value.state === 'not-yet-available' ? 'not yet available' : null;
  return `${value.value.toLocaleString('en-US', { maximumFractionDigits: 6 })}${value.unit ? ' ' + value.unit : ''}`;
}
/** One zone label for calendar times (dialog and chart flags): GMT, GMT+0 and UTC+00:00 read UTC; other offsets read UTC+5, UTC-4:30. */
export function calendarZoneLabel(offset: string | null): string { if (!offset) return ''; const match = /^(?:GMT|UTC)([+\-−]\d{1,2}(?::\d{2})?)?$/.exec(offset.trim()); if (!match) return offset; const sign = match[1]?.replace('−', '-') ?? ''; return /^[+-]0+(?::00)?$/.test(sign) || sign === '' ? 'UTC' : 'UTC' + sign; }
const timingWords: Record<CalendarRow['event']['timing'], string> = { exact: '', 'before-open': 'Before open', 'after-close': 'After close', 'date-only': 'Time not supplied', unknown: 'Time unknown' };
/** The date a marker sits on: the ex-date for dividends (the adjustment date), otherwise the displayed New York date. */
export function calendarMarkerDate(row: CalendarRow): string { return row.event.kind === 'dividend' && row.event.exDate ? row.event.exDate : row.displayDate; }
export function calendarMarkerLines(row: CalendarRow): string[] {
  const kind = row.event.kind as CalendarMarkerKind, lines = [(row.provenance.fixture ? 'SYNTHETIC ' : '') + CALENDAR_MARKER_STYLE[kind].label + (row.event.status === 'tentative' ? ' (tentative)' : ''), row.event.title];
  const add = (label: string, value: CalendarValueView) => { const text = shown(value); if (text) lines.push(`${label}: ${text}`); };
  if (kind === 'earnings') { if (row.event.fiscalPeriod) lines.push('Fiscal period: ' + row.event.fiscalPeriod); add('EPS estimate', row.values.epsForecast); add('EPS actual', row.values.epsActual); add('Revenue estimate', row.values.revenueForecast); add('Revenue actual', row.values.revenueActual); }
  if (kind === 'dividend') { add('Amount', row.values.dividendAmount); add('Yield', row.values.dividendYield); if (row.event.payDate) lines.push('Pay date: ' + row.event.payDate); }
  if (kind === 'split') add('Ratio', row.derived.splitRatio);
  if (kind === 'ipo') { add('Offer price', row.values.offerPrice); add('Shares offered', row.values.sharesOffered); if (row.event.exchange) lines.push('Exchange: ' + row.event.exchange); }
  if (kind === 'economic') { if (row.event.country) lines.push('Country: ' + row.event.country); if (row.event.category) lines.push('Category: ' + row.event.category); lines.push('Importance: ' + (row.event.importance ?? 'not supplied')); add('Actual', row.values.actual); add('Forecast', row.values.forecast); add('Prior', row.values.prior); }
  lines.push(`${kind === 'dividend' ? 'Ex-date' : 'Date'}: ${calendarMarkerDate(row)}${row.displayTime ? ' ' + row.displayTime + ' ' + calendarZoneLabel(row.displayOffset) : timingWords[row.event.timing] ? ', ' + timingWords[row.event.timing] : ''}`.trim());
  lines.push('Source: ' + row.provenance.label);
  return lines;
}

/** The median step of the last five bars (seconds), or null with fewer than two bars. */
function barStep(bars: readonly { time: number }[]): number | null {
  const steps: number[] = []; for (let i = Math.max(1, bars.length - 5); i < bars.length; i++) steps.push(bars[i].time - bars[i - 1].time);
  steps.sort((a, b) => a - b); const step = steps[steps.length >> 1]; return step > 0 ? step : null;
}
/** Start of a YYYY-MM-DD date in UTC seconds. */
const dateSeconds = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 1000;
/**
 * Where an economic entry sits: the bar holding its time (largest bar time at or before it) while that is inside the loaded bars;
 * past the last bar it snaps to the bar grid of the future area (last bar + whole steps). A date-only entry uses its New York
 * date's bar (as the other calendar badges), or the start of that date in the future area. Before the first bar: null.
 */
export function economicMarkerTime(row: Pick<CalendarRow, 'event'>, bars: readonly { time: number }[]): { barTime: number; future: boolean } | null {
  if (!bars.length) return null;
  const last = bars[bars.length - 1].time, step = barStep(bars) ?? 86400;
  let time: number;
  if (row.event.time !== null) time = row.event.time;
  else { const onBar = eventBarTime(row.event.date, bars); if (onBar !== null) return { barTime: onBar, future: false }; time = dateSeconds(row.event.date); if (time <= last) return null; }
  if (time < bars[0].time) return null;
  if (time < last + step) { let low = 0, high = bars.length - 1; while (low < high) { const middle = (low + high + 1) >> 1; if (bars[middle].time <= time) low = middle; else high = middle - 1; } return { barTime: bars[low].time, future: false }; }
  return { barTime: last + Math.floor((time - last) / step) * step, future: true };
}
/** True when an economic entry is still ahead of `now`: its exact time, or (date only) any part of its date in UTC. */
export function economicEventAhead(event: Pick<CalendarRow['event'], 'time' | 'date'>, now: number): boolean {
  return event.time !== null ? event.time >= now : dateSeconds(event.date) + 86400 > now;
}

/** Markers for one chart symbol on the loaded bars: one per kind and bar, ordered by time then earnings, dividend, split, IPO, economic. Cancelled events are left out. */
export function calendarChartMarkers(documents: readonly CalendarDocument[], symbol: string | null, bars: readonly { time: number }[], settings: CalendarMarkerSettings, now = Math.floor(Date.now() / 1000)): CalendarChartMarker[] {
  if (!symbol || !documents.length || !bars.length) return [];
  const wanted: Record<CalendarMarkerKind, boolean> = { earnings: settings.earnings, dividend: settings.dividends, split: settings.splits, ipo: settings.ipos, economic: settings.economic === true };
  if (!Object.values(wanted).some(Boolean)) return [];
  const skip = new Set(settings.skipDocumentIds ?? []), used = documents.filter(document => !skip.has(document.id) && document.events.some(event => event.kind === 'economic' ? wanted.economic : calendarSymbolMatches(event.symbol, symbol)));
  if (!used.length) return [];
  let rows: CalendarRow[];
  try { rows = queryCalendar(used, { ...createCalendarState().query, kind: 'all', period: 'all', timezone: 'America/New_York' }, now).rows; } catch { return []; }
  // Root: tooltip text follows the chart's time zone, so a flag reads the same clock as the time axis.
  let shownRows: Map<string, CalendarRow> | null = null;
  if (settings.timezone && settings.timezone !== 'America/New_York') { try { shownRows = new Map(queryCalendar(used, { ...createCalendarState().query, kind: 'all', period: 'all', timezone: settings.timezone }, now).rows.map(row => [row.key, row])); } catch { shownRows = null; } }
  const order: CalendarMarkerKind[] = ['earnings', 'dividend', 'split', 'ipo', 'economic'], groups = new Map<string, { kind: CalendarMarkerKind; barTime: number; future: boolean; entries: CalendarMarkerEntry[] }>();
  for (const row of rows) {
    const kind = row.event.kind; if (!wanted[kind]) continue;
    let barTime: number | null, future = false;
    if (kind === 'economic') {
      // The LV demo document is dated around the demo bars (all in the past), so Future events only would hide every
      // demo flag; it applies to real imports only.
      if (settings.economicFutureOnly && row.documentId !== SYNTHETIC_CALENDAR_DEMO_ID && !economicEventAhead(row.event, now)) continue;
      const placed = economicMarkerTime(row, bars); if (!placed) continue; barTime = placed.barTime; future = placed.future;
    } else { if (!calendarSymbolMatches(row.event.symbol, symbol)) continue; barTime = eventBarTime(calendarMarkerDate(row), bars); }
    if (barTime === null) continue;
    const date = calendarMarkerDate(row), key = `${kind}:${barTime}`, entry: CalendarMarkerEntry = { documentId: row.documentId, eventId: row.event.id, kind, date, synthetic: row.provenance.fixture, lines: calendarMarkerLines(shownRows?.get(row.key) ?? row), ...(kind === 'economic' ? { country: row.event.country, importance: row.event.importance } : {}) };
    const group = groups.get(key); if (group) group.entries.push(entry); else groups.set(key, { kind, barTime, future, entries: [entry] });
  }
  return [...groups.entries()].sort((a, b) => a[1].barTime - b[1].barTime || order.indexOf(a[1].kind) - order.indexOf(b[1].kind)).map(([key, group]) => {
    const style = CALENDAR_MARKER_STYLE[group.kind], lines = group.entries.flatMap((entry, index) => [...(index ? [''] : []), ...entry.lines]);
    let letter = style.letter, color = style.color;
    if (group.kind === 'economic') {
      const countries = [...new Set(group.entries.map(entry => (entry.country ?? '').trim().toUpperCase()))];
      letter = countries.length === 1 && /^[A-Z]{2}$/.test(countries[0]) ? countries[0] : style.letter;
      const rank = (value: CalendarMarkerEntry['importance']) => value === 'high' ? 2 : value === 'medium' ? 1 : 0, top = Math.max(...group.entries.map(entry => rank(entry.importance)));
      color = ECONOMIC_IMPORTANCE_COLOR[top === 2 ? 'high' : top === 1 ? 'medium' : 'low'];
    }
    return { key, kind: group.kind, barTime: group.barTime, letter, color, entries: group.entries, lines, label: `${lines.filter(Boolean).join('. ')}. Opens the calendar entry.`, synthetic: group.entries.some(entry => entry.synthetic), ...(group.future ? { future: true } : {}) };
  });
}
/** Horizontal offset so markers of different kinds on one bar sit side by side. */
export function calendarMarkerOffset(markers: readonly CalendarChartMarker[], index: number, size = 16): number {
  const marker = markers[index], shared = markers.filter(row => row.barTime === marker.barTime);
  return shared.length < 2 ? 0 : (shared.indexOf(marker) - (shared.length - 1) / 2) * (size + 2);
}
/** The settings the chart passes: earnings follow Chart settings > Events > Earnings; economic entries follow Events > Economic events (and its Future events only); IPO badges have no settings row and are always shown; calendar dividends and splits follow their rows but skip the Alpaca auto-fill document when the chart already shows Alpaca corporate actions. */
export function calendarMarkerSettings(events: { earnings: { visible: boolean }; dividends: boolean; splits: boolean; economic?: { visible: boolean; futureOnly: boolean } }, chartHasCorporateActions: boolean, timezone?: string): CalendarMarkerSettings {
  return { ...(timezone ? { timezone } : {}), earnings: events.earnings.visible, dividends: events.dividends, splits: events.splits, ipos: true, economic: events.economic?.visible === true, economicFutureOnly: events.economic?.futureOnly === true, skipDocumentIds: chartHasCorporateActions ? [AUTO_DIVIDEND_DOCUMENT_ID] : [] };
}

