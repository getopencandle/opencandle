import { calendarZoneLabel } from '../domain/calendar-chart-markers';
import { demoDataMode, demoDataLabel } from '../domain/demo-mode';
import './dialog-forms.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CALENDAR_CSV_TEMPLATE, CALENDAR_KIND_LABELS, CALENDAR_PERIODS, CALENDAR_POLICIES, CALENDAR_STATE_MAX_BYTES, calendarCoverage, calendarSelectorValues, calendarEventToIcs, calendarJsonTemplate, calendarPeriodRange, calendarRowsToCsv, calendarStaleness, calendarToday, focusCalendarEvent, createCalendarState, createSyntheticCalendarDemo, calendarDemoAnchor, describeCalendarEmpty, parseCalendarCsv, parseCalendarJson, queryCalendar, restoreCalendarState, shiftCalendarPeriod, type CalendarDocument, type CalendarImportOptions, type CalendarKind, type CalendarPeriod, type CalendarQuery, type CalendarRevisionChange, type CalendarRow, type CalendarSortKey, type CalendarState, type CalendarValueView } from '../domain/calendar';
import { Modal } from './Modal';
import { watchListChoices, watchListMembers } from '../watchlists/membership';
import type { WatchBook } from '../watchlists/model';
import type { FactsDocument } from '../fundamentals/company-facts';
import type { FundamentalsLink } from '../fundamentals/preferences';
import type { ChartEventsResult } from '../domain/chart-events';
import { AUTO_DIVIDEND_NEEDS_DATA, AUTO_EARNINGS_NEEDS_DATA, earningsFromFacts, fetchDividendDocument, type AutoFillReport } from '../domain/calendar-sources';
import './calendar.css';
import { CALENDAR_IMPORTANCE_LEVELS, calendarDayCounts, calendarDayLabel, filterCalendarDay, filterCalendarImportance, groupCalendarRowsByDay, toggleCalendarImportance, type CalendarImportanceLevel } from '../domain/calendar-days';
import { InfoTip, OverflowMenu } from './dialog-extras';
import { calendarEconomicSeries } from '../domain/calendar-economic';

export interface CalendarPreview { documents: CalendarDocument[]; state: CalendarState | null; diagnostics: string[]; }
/** Parses into an isolated preview. The caller must explicitly commit this preview. */
export function previewCalendarImport(text: string, format: 'json' | 'csv', options: CalendarImportOptions = {}): CalendarPreview {
  if (text.length > CALENDAR_STATE_MAX_BYTES || new TextEncoder().encode(text).length > CALENDAR_STATE_MAX_BYTES) throw new Error('Calendar state exceeds the 20 MiB UTF-8 limit. Individual documents, event arrays and CSV remain limited to 10 MiB.');
  if (format === 'json') {
    const input: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (input && typeof input === 'object' && !Array.isArray(input) && 'documents' in input) { const state = restoreCalendarState(input); return { documents: state.documents, state, diagnostics: [] }; }
  }
  const result = format === 'csv' ? parseCalendarCsv(text, options) : parseCalendarJson(text, options);
  if (!result.ok || !result.document) throw new Error(result.diagnostics.join(' '));
  return { documents: [result.document], state: null, diagnostics: result.diagnostics };
}
/** The labelled synthetic demo as an ordinary preview: it still needs Add preview and Apply. */
export function previewSyntheticCalendarDemo(now = Math.floor(Date.now() / 1000)): CalendarPreview {
  return { documents: [createSyntheticCalendarDemo(now, calendarDemoAnchor())], state: null, diagnostics: [demoDataLabel() + ': every event, country code (XA, XB), venue and number is invented by OpenCandle, and the dates and symbols line up with the demo charts. It is not market data. Remove the demo document before relying on the calendar.'] };
}
export function applyCalendarPreview(draft: CalendarState, preview: CalendarPreview): CalendarState {
  if (preview.state) return restoreCalendarState(preview.state);
  const ids = new Set(preview.documents.map(document => document.id));
  return restoreCalendarState({ ...draft, documents: [...draft.documents.filter(document => !ids.has(document.id)), ...preview.documents] });
}
/** Use the same compact UTF-8 representation that the restore/export limit measures. */
export function serializeCalendarState(state: CalendarState): string { return JSON.stringify(restoreCalendarState(state)); }

export const CALENDAR_TAB_ORDER: readonly ('all' | CalendarKind)[] = ['economic', 'earnings', 'dividend', 'ipo', 'split', 'all'];
/** Short visible tab labels. The domain labels stay for exports, aria names and descriptions. */
export const CALENDAR_TAB_LABELS: Record<'all' | CalendarKind, string> = { ...CALENDAR_KIND_LABELS, all: 'All' };
/** A short, friendly headline per empty reason. The full domain explanation sits in the adjacent info popover. */
export function calendarEmptyHeadline(reason: ReturnType<typeof describeCalendarEmpty>['reason'], kind: 'all' | CalendarKind, message: string): string {
  const noun = kind === 'all' ? '' : CALENDAR_KIND_LABELS[kind].toLowerCase() + ' ';
  switch (reason) {
    case 'no-documents': return 'No events yet. Import a calendar or fill from your watchlist.';
    case 'no-kind-coverage': return `No ${noun}events yet. Import a calendar that covers them.`;
    case 'cutoff': return `No ${noun}events known at this point in time.`;
    case 'cancelled': return 'Only cancelled events match.';
    case 'outside-coverage': return 'No events in this period. Import a calendar or fill from your watchlist.';
    case 'filtered': return 'No events match these filters.';
    default: return message;
  }
}
export const CALENDAR_PERIOD_LABELS: Record<CalendarPeriod, string> = { all: 'All dates', upcoming: 'Upcoming', past: 'Past', yesterday: 'Yesterday', today: 'Today', tomorrow: 'Tomorrow', 'this-week': 'This week', 'next-week': 'Next week', custom: 'Custom range' };
/** The one-click period strip above the table (the menu keeps every period). */
export const CALENDAR_QUICK_PERIODS: readonly CalendarPeriod[] = ['yesterday', 'today', 'tomorrow', 'this-week', 'next-week', 'upcoming', 'past'];
interface Column { id: string; label: string; sort?: CalendarSortKey; cell: (row: CalendarRow) => React.ReactNode; }
function display(value: CalendarValueView | undefined) {
  if (!value) return 'Unavailable';
  if (value.value === null) return value.state === 'not-yet-available' ? 'Not yet available' : value.state === 'unknown-availability' ? 'Availability unknown' : 'Unavailable';
  return `${value.value.toLocaleString('en-US', { maximumFractionDigits: 6 })}${value.unit ? ' ' + value.unit : ''}${value.state === 'unknown-availability' ? ' (availability unknown)' : ''}`;
}
const timingLabels: Record<CalendarRow['event']['timing'], string> = { exact: 'Exact time', 'before-open': 'Before open', 'after-close': 'After close', 'date-only': 'Date only, no time supplied', unknown: 'Time unknown' };
const timingIcons: Partial<Record<CalendarRow['event']['timing'], string>> = { 'before-open': '☀', 'after-close': '☾' };
const importanceLabels = { high: 'High', medium: 'Medium', low: 'Low' } as const, importanceBars = { high: '●●●', medium: '●●○', low: '●○○' } as const;
/** Decorative glyphs are hidden from assistive technology; the adjacent words carry the meaning. */
function timing(row: CalendarRow) { const icon = timingIcons[row.event.timing]; return <>{icon && <span aria-hidden="true">{icon} </span>}{timingLabels[row.event.timing]}</>; }
/** The Intl short offset reads "GMT" or "GMT+0"; say UTC for zero and keep the signed hour otherwise. */
export { calendarZoneLabel };
export function calendarDateLabel(date: string): string { const time = Date.parse(`${date}T00:00:00Z`); return Number.isFinite(time) && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : date; }
function when(row: CalendarRow) { return <>{calendarDateLabel(row.displayDate)}<br/>{row.displayTime === null ? timing(row) : `${row.displayTime} ${calendarZoneLabel(row.displayOffset)}`}</>; }
function prior(row: CalendarRow) { const revised = row.values.priorRevisedFrom; return revised.value === null ? display(row.values.prior) : `${display(row.values.prior)} (revised from ${display(revised)})`; }
function summaryValue(row: CalendarRow, which: 'actual' | 'forecast' | 'prior') {
  if (row.event.kind === 'earnings') return row.values[which === 'actual' ? 'epsActual' : which === 'forecast' ? 'epsForecast' : 'prior'];
  if (which !== 'actual') return row.values[which];
  if (row.event.kind === 'dividend') return row.values.dividendAmount;
  if (row.event.kind === 'ipo') return row.values.offerPrice;
  if (row.event.kind === 'split') return row.derived.splitRatio;
  return row.values.actual;
}
const value = (id: CalendarSortKey & keyof CalendarRow['values'], label: string): Column => ({ id, label, sort: id, cell: row => display(row.values[id]) });
const derived = (id: CalendarSortKey & keyof CalendarRow['derived'], label: string): Column => ({ id, label, sort: id, cell: row => <>{display(row.derived[id])}{row.derived[id].reason && <span className="help"> {row.derived[id].reason}</span>}</> });
const dateColumn: Column = { id: 'date', label: 'Date and time', sort: 'date', cell: when }, symbolColumn: Column = { id: 'symbol', label: 'Symbol', sort: 'symbol', cell: row => row.event.symbol ?? 'Not supplied' };
const titleColumn: Column = { id: 'title', label: 'Event', sort: 'title', cell: () => null }, countryColumn: Column = { id: 'country', label: 'Country', sort: 'country', cell: row => row.event.country ?? 'Not supplied' };
const importanceColumn: Column = { id: 'importance', label: 'Importance', sort: 'importance', cell: row => row.event.importance ? <><span aria-hidden="true">{importanceBars[row.event.importance]} </span>{importanceLabels[row.event.importance]}</> : 'Not supplied' };
/** The columns of each calendar tab; Splits and All are LV views. */
export function calendarTabColumns(kind: 'all' | CalendarKind): Column[] {
  if (kind === 'economic') return [dateColumn, countryColumn, importanceColumn, titleColumn, value('actual', 'Actual'), value('forecast', 'Forecast'), { id: 'prior', label: 'Prior', sort: 'prior', cell: prior }];
  if (kind === 'earnings') return [dateColumn, symbolColumn, titleColumn, { id: 'fiscalPeriod', label: 'Fiscal period', cell: row => row.event.fiscalPeriod ?? 'Not supplied' }, value('epsForecast', 'Estimated EPS'), value('epsActual', 'Actual EPS'), derived('epsSurprisePercent', 'EPS surprise'), value('revenueForecast', 'Estimated revenue'), value('revenueActual', 'Actual revenue'), derived('revenueSurprisePercent', 'Revenue surprise'), value('marketCap', 'Market cap')];
  if (kind === 'dividend') return [dateColumn, symbolColumn, titleColumn, value('dividendAmount', 'Amount'), { id: 'exDate', label: 'Ex-date', sort: 'exDate', cell: row => row.event.exDate ?? 'Not supplied' }, { id: 'payDate', label: 'Pay date', sort: 'payDate', cell: row => row.event.payDate ?? 'Not supplied' }, value('dividendYield', 'Yield')];
  if (kind === 'ipo') return [dateColumn, symbolColumn, titleColumn, { id: 'exchange', label: 'Exchange', sort: 'exchange', cell: row => row.event.exchange ?? 'Not supplied' }, value('offerPrice', 'Offer price'), value('sharesOffered', 'Shares offered'), derived('dealAmount', 'Deal amount'), derived('ipoMarketCap', 'Market cap')];
  if (kind === 'split') return [dateColumn, symbolColumn, titleColumn, derived('splitRatio', 'Split ratio')];
  return [dateColumn, { id: 'kind', label: 'Kind', cell: row => CALENDAR_KIND_LABELS[row.event.kind] }, titleColumn, symbolColumn, countryColumn, importanceColumn, { id: 'actual', label: 'Actual or event value', cell: row => display(summaryValue(row, 'actual')) }, { id: 'forecast', label: 'Forecast', cell: row => display(summaryValue(row, 'forecast')) }, { id: 'prior', label: 'Prior', cell: row => row.event.kind === 'economic' ? prior(row) : display(summaryValue(row, 'prior')) }];
}
/** Switching tabs keeps the period, timezone and selectors; High importance applies only to Economic and All; a sort on a column the tab lacks returns to date ascending. */
export function selectCalendarKind(query: CalendarQuery, kind: 'all' | CalendarKind): CalendarQuery {
  const sortable = new Set<CalendarSortKey>(['date', ...calendarTabColumns(kind).flatMap(column => column.sort ? [column.sort] : [])]);
  return { ...query, kind, highImportance: kind === 'all' || kind === 'economic' ? query.highImportance : false, sort: sortable.has(query.sort.key) ? query.sort : { key: 'date', direction: 'asc' } };
}
/** Reset filters restores LV defaults but keeps the active tab and display timezone (view preferences) and the information cutoff, so a point-in-time session never silently switches to later information. */
export function resetCalendarFilters(query: CalendarQuery): CalendarQuery { return { ...createCalendarState().query, kind: query.kind, timezone: query.timezone, asOf: query.asOf }; }
/** Human labels for sort keys, value keys, derived keys and revision fields. */
export const CALENDAR_FIELD_LABELS: Record<string, string> = { date: 'Date and time', title: 'Event', symbol: 'Symbol', country: 'Country', importance: 'Importance', exchange: 'Exchange', exDate: 'Ex-date', payDate: 'Pay date', kind: 'Kind', description: 'Description', time: 'Time', timezone: 'Source timezone', timing: 'Timing', status: 'Status', category: 'Category', fiscalPeriod: 'Fiscal period', actual: 'Actual', forecast: 'Forecast', prior: 'Prior', priorRevisedFrom: 'Prior as first reported', epsActual: 'Actual EPS', epsForecast: 'Estimated EPS', revenueActual: 'Actual revenue', revenueForecast: 'Estimated revenue', marketCap: 'Market cap', dividendAmount: 'Dividend amount', dividendYield: 'Dividend yield', offerPrice: 'Offer price', sharesOffered: 'Shares offered', sharesOutstanding: 'Shares outstanding', splitNumerator: 'Split numerator', splitDenominator: 'Split denominator', epsSurprisePercent: 'EPS surprise', revenueSurprisePercent: 'Revenue surprise', dealAmount: 'Deal amount', ipoMarketCap: 'IPO market cap', splitRatio: 'Split ratio' };
const fieldLabel = (key: string) => CALENDAR_FIELD_LABELS[key] ?? key;
/** Sort choices for a tab: Date plus that tab's sortable columns, and the current key if a restored state uses another. */
export function calendarSortChoices(kind: 'all' | CalendarKind, current: CalendarSortKey): CalendarSortKey[] { const keys = new Set<CalendarSortKey>(['date', ...calendarTabColumns(kind).flatMap(column => column.sort ? [column.sort] : [])]); keys.add(current); return [...keys]; }
/** Choosing Custom range from a bounded preset copies that preset's range; from All or Upcoming it starts at today. Re-choosing Custom keeps the stored range, completing a missing end. Stale stored dates are never mixed with fresh ones, and from never exceeds to, so selection alone cannot make the draft invalid. */
export function selectCalendarPeriod(query: CalendarQuery, period: CalendarPeriod, now = Math.floor(Date.now() / 1000)): CalendarQuery {
  if (period !== 'custom') return { ...query, period };
  const today = calendarToday(query.timezone, now);
  if (query.period === 'custom') { const from = query.from ?? query.to ?? today, to = query.to ?? from; return { ...query, period, from, to: from > to ? from : to }; }
  const current = calendarPeriodRange(query, now), from = current.from ?? today;
  return { ...query, period, from, to: current.to ?? from };
}
function resetMessage(query: CalendarQuery) { return `Filters reset to OpenCandle defaults for this tab. Tab, display timezone${query.asOf !== null ? ' and the information cutoff (Unix second ' + query.asOf + ')' : ''} were kept. Apply saves; Cancel discards.`; }
function timestamp(value: number | null) { return value === null ? 'Unknown' : new Date(value * 1000).toISOString(); }
function changeText(change: CalendarRevisionChange, side: 'before' | 'after') { const raw = change[side], unit = side === 'before' ? change.unitBefore : change.unitAfter; if (raw === null) return 'Not supplied or not available'; if (change.field === 'time' && typeof raw === 'number') return timestamp(raw); return typeof raw === 'number' ? `${raw.toLocaleString('en-US', { maximumFractionDigits: 6 })}${unit ? ' ' + unit : ''}` : raw; }
const zones = (() => { try { return ['UTC', ...Intl.supportedValuesOf('timeZone').filter(zone => zone !== 'UTC')]; } catch { return ['UTC', 'America/New_York', 'America/Chicago', 'America/Phoenix', 'Europe/London', 'Asia/Tokyo']; } })();
function localZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
const fieldReference = 'Event fields: id, revision (1+), kind (economic, earnings, dividend, ipo, split), title, description, date (YYYY-MM-DD as listed by the source), time (Unix seconds or ISO with Z/offset; only with timing exact), timezone (IANA; required with time), timing (exact, date-only, before-open, after-close, unknown), symbol, instrumentId, country, category, importance (low, medium, high), status (scheduled, confirmed, released, cancelled, tentative), publishedAt, fiscalPeriod, exDate, payDate, exchange. Values: actual, forecast, prior, priorRevisedFrom, epsActual, epsForecast, revenueActual, revenueForecast, marketCap, dividendAmount, dividendYield, offerPrice, sharesOffered, sharesOutstanding, splitNumerator, splitDenominator; each as {value, unit, availableAt} in JSON or value, valueUnit, valueAvailableAt columns in CSV. Use null or an empty cell for missing; never 0.';

/** The symbols one watchlist chip filters to: the list symbols, upper-cased and de-duplicated. */
export function calendarChipSymbols(book: WatchBook, listId: string): string[] { return [...new Set(watchListMembers(book, listId).map(reference => reference.symbol.toUpperCase()))].sort(); }
/** Replaces the auto-filled document (same id) in a draft; nothing else is touched. */
export function applyAutoFill(draft: CalendarState, report: AutoFillReport): CalendarState { return report.document ? applyCalendarPreview(draft, { documents: [report.document], state: null, diagnostics: [] }) : draft; }
export function CalendarDialog({ state, onChange, onClose, onSelectSymbol, onOpenFinancials, onOpenSeries, initialKind, now: initialNow, watchBook, fundamentals, fundamentalsLinks, alpacaCorporateActions, focusEvent }: {
  /** Optional host action for an economic row's FRED series id: Launch chart opens FRED:<id> on the active chart. */
  onOpenSeries?: (series: string) => boolean | void;
  /** Optional: open on one entry (a chart calendar marker). Filters are reset in the draft only; Cancel keeps the saved ones. */
  focusEvent?: { documentId: string; eventId: string };
  /** Optional: watchlist chips and the symbols auto-fill looks up. */
  watchBook?: WatchBook;
  /** Optional: saved SEC company facts and the user symbol links; past reported earnings are built from them. */
  fundamentals?: readonly FactsDocument[]; fundamentalsLinks?: readonly FundamentalsLink[];
  /** Optional: the owner-key dividend lookup (the corporate-actions bridge call). Omit when the desktop bridge is absent. */
  alpacaCorporateActions?: (input: { requestId: string; symbol: string }) => Promise<ChartEventsResult>;
  state: CalendarState; onChange: (state: CalendarState) => boolean | void; onClose: () => void;
  onSelectSymbol?: (instrumentId: string | null, symbol: string) => boolean | void;
  /** Optional host action for the dividend/earnings symbol link, such as opening the company Financials view. */
  onOpenFinancials?: (instrumentId: string | null, symbol: string) => boolean | void;
  /** Entry point family, e.g. Products > Calendars > Dividends. It changes the draft tab only; Apply saves it. */
  initialKind?: 'all' | CalendarKind;
  /** Clock override for tests; the dialog refreshes it every 30 seconds. */
  now?: number;
}) {
  // Hook order matters to the handler tests (cell 0 saved, cell 1 draft); the focus lookup runs once, inside the first-render initializers.
  let focusMemo: ReturnType<typeof focusCalendarEvent> | undefined;
  const focusOf = (base: CalendarState) => { if (focusMemo !== undefined) return focusMemo; try { focusMemo = focusEvent ? focusCalendarEvent(base, focusEvent, initialNow ?? Math.floor(Date.now() / 1000)) : null; } catch { focusMemo = null; } return focusMemo; };
  const [saved] = useState(() => restoreCalendarState(state)), [draft, setDraft] = useState(() => { const focused = focusOf(saved); return focused ? { ...saved, query: focused.query } : initialKind ? { ...saved, query: selectCalendarKind(saved.query, initialKind) } : saved; }), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [text, setText] = useState(''), [format, setFormat] = useState<'json' | 'csv'>('json'), [sourceLabel, setSourceLabel] = useState('Local calendar import'), [source, setSource] = useState(''), [rights, setRights] = useState('User-supplied data; distribution rights not assessed.'), [fixture, setFixture] = useState(false);
  const [preview, setPreview] = useState<CalendarPreview | null>(null), [selected, setSelected] = useState<string | null>(() => focusOf(saved)?.key ?? null), [page, setPage] = useState(() => focusOf(saved)?.page ?? 0), [pageSize, setPageSize] = useState(50), [busy, setBusy] = useState(false), [now, setNow] = useState(() => initialNow ?? Math.floor(Date.now() / 1000));
  const [fillReport, setFillReport] = useState<AutoFillReport | null>(null), [fillBusy, setFillBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(() => !state.documents.length && !focusEvent), [showIcs, setShowIcs] = useState(false), [showOverview, setShowOverview] = useState(false);
  const mounted = useRef(true), request = useRef(0), pristine = useRef(saved);
  const [focusMissing] = useState(() => !!focusEvent && !focusOf(saved));
  // View-only refinements (not saved): one day from the day strip, and Low/Medium/High importance toggles.
  const [dayPick, setDayPick] = useState<string | null>(null), [levels, setLevels] = useState<CalendarImportanceLevel[]>(() => [...CALENDAR_IMPORTANCE_LEVELS]);
  useEffect(() => { mounted.current = true; const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30000); return () => { mounted.current = false; request.current++; clearInterval(timer); }; }, []);
  const computed = useMemo(() => { try { return { result: queryCalendar(draft.documents, draft.query, now), error: '' }; } catch (cause) { return { result: null, error: cause instanceof Error ? cause.message : String(cause) }; } }, [draft, now]);
  const result = computed.result, levelRows = filterCalendarImportance(result?.rows ?? [], levels), dayCounts = calendarDayCounts(levelRows), day = dayPick !== null && dayCounts.some(item => item.date === dayPick) ? dayPick : null, viewRows = filterCalendarDay(levelRows, day);
  const pageCount = Math.max(1, Math.ceil(viewRows.length / pageSize)), currentPage = Math.min(page, pageCount - 1), rows = viewRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize), current = result?.rows.find(row => row.key === selected);
  const today = (() => { try { return calendarToday(draft.query.timezone, now); } catch { return null; } })(), dayCount = new Map(dayCounts.map(item => [item.date, item.count]));
  // Day header rows only when the table is in date order; any other sort shows the plain rows.
  const dayBlocks = draft.query.sort.key === 'date' ? groupCalendarRowsByDay(rows).map((group, index) => ({ key: `${group.date}:${index}`, header: `${calendarDayLabel(group.date, today)} · ${dayCount.get(group.date) ?? group.rows.length} ${(dayCount.get(group.date) ?? group.rows.length) === 1 ? 'event' : 'events'}`, rows: group.rows })) : [{ key: 'all', header: null as string | null, rows }];
  const viewNarrowed = !!result?.rows.length && !viewRows.length, levelsAll = levels.length === CALENDAR_IMPORTANCE_LEVELS.length, showLevels = draft.query.kind === 'economic' || draft.query.kind === 'all';
  // Coverage and selector lists use the same information cutoff as the rows, so later publications cannot leak through them.
  const available = useMemo(() => { const cutoff = { asOf: draft.query.asOf, now }; return { coverage: calendarCoverage(draft.documents, draft.query.kind, cutoff), country: calendarSelectorValues(draft.documents, draft.query.kind, 'country', cutoff), category: calendarSelectorValues(draft.documents, draft.query.kind, 'category', cutoff), symbol: calendarSelectorValues(draft.documents, draft.query.kind, 'symbol', cutoff) }; }, [draft.documents, draft.query.kind, draft.query.asOf, now]);
  const empty = useMemo(() => result?.rows.length ? null : describeCalendarEmpty(draft.documents, draft.query, result, computed.error, now), [draft, result, computed.error, now]);
  const optionList = (key: 'country' | 'category' | 'symbol', chosen: string[]) => [...new Set([...available[key], ...chosen])].sort();
  const columns = calendarTabColumns(draft.query.kind), coverage = available.coverage, stale = useMemo(() => calendarStaleness(draft.documents, now), [draft.documents, now]);
  const shift = (direction: -1 | 1) => { try { return shiftCalendarPeriod(draft.query, direction, now); } catch { return null; } }, earlier = shift(-1), later = shift(1);
  // Structural comparison: documents by identity (restores create new objects), filters by value. No-op updates do not enable Revert.
  const dirty = JSON.stringify(draft.query) !== JSON.stringify(pristine.current.query) || draft.documents.length !== pristine.current.documents.length || draft.documents.some((document, index) => document !== pristine.current.documents[index]);
  function close() { mounted.current = false; request.current++; onClose(); }
  function update(next: (query: CalendarQuery) => CalendarQuery) { setDraft(previous => ({ ...previous, query: next(previous.query) })); setPage(0); }
  function change<K extends keyof CalendarQuery>(key: K, value: CalendarQuery[K]) { update(query => ({ ...query, [key]: value })); }
  function selectKind(kind: 'all' | CalendarKind) { update(query => selectCalendarKind(query, kind)); setSelected(null); setShowIcs(false); }
  function tabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = event.key === 'ArrowRight' ? (index + 1) % CALENDAR_TAB_ORDER.length : event.key === 'ArrowLeft' ? (index + CALENDAR_TAB_ORDER.length - 1) % CALENDAR_TAB_ORDER.length : event.key === 'Home' ? 0 : event.key === 'End' ? CALENDAR_TAB_ORDER.length - 1 : -1;
    if (target < 0) return; event.preventDefault(); selectKind(CALENDAR_TAB_ORDER[target]); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  }
  const chipLists = useMemo(() => { if (!watchBook) return []; try { return watchListChoices(watchBook).filter(choice => choice.symbols > 0).map(choice => ({ choice, symbols: calendarChipSymbols(watchBook, choice.id) })); } catch { return []; } }, [watchBook]);
  const chosen = [...draft.query.symbols].map(value => value.toUpperCase()).sort().join(','), activeChip = chipLists.find(row => row.symbols.join(',') === chosen && chosen !== '')?.choice.id ?? null;
  const fillSymbols = draft.query.symbols.length ? draft.query.symbols : [...new Set(chipLists.flatMap(row => row.choice.active ? row.symbols : []))];
  async function fillDividends() {
    setFillBusy(true); setError(''); const sequence = ++request.current;
    try { const report = await fetchDividendDocument(alpacaCorporateActions, fillSymbols, { now, shouldStop: () => !mounted.current || sequence !== request.current }); if (!mounted.current || sequence !== request.current) return; setFillReport(report); if (report.document) { setDraft(previous => applyAutoFill(previous, report)); setPage(0); } setStatus(report.document ? report.message + ' Apply saves them; Cancel discards them.' : report.message); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (mounted.current && sequence === request.current) setFillBusy(false); }
  }
  function fillEarnings() {
    try { const wanted = draft.query.symbols.length ? draft.query.symbols : null, report = earningsFromFacts(fundamentals ?? [], fundamentalsLinks ?? [], wanted, now); setFillReport(report); if (report.document) { setDraft(previous => applyAutoFill(previous, report)); setPage(0); } setStatus(report.document ? report.message + ' Apply saves them; Cancel discards them.' : report.message); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function updateImport(callback: () => void) { callback(); setPreview(null); setStatus(''); request.current++; setBusy(false); }
  function options(): CalendarImportOptions { return { sourceLabel, sourceUrl: source || null, license: rights, fixture, now }; }
  function parse() { try { const parsed = previewCalendarImport(text, format, options()); setPreview(parsed); setError(''); setStatus('Preview parsed. No saved calendar data has changed.'); } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : String(cause)); } }
  async function chooseFile() {
    if (!mounted.current) return;
    if (!window.lv) { setError('File selection requires the desktop app. CSV and JSON can be pasted below.'); return; }
    const sequence = ++request.current; setBusy(true); setError('');
    try { const response = await window.lv.importData({ kind: 'calendar' }); if (!mounted.current || sequence !== request.current) return; if (!response.ok) { if (response.error.code === 'CANCELLED') setStatus('Import cancelled. The calendar draft is unchanged.'); else setError(response.error.message); return; }
      setText(response.value.text); setFormat(response.value.format); const parsed = previewCalendarImport(response.value.text, response.value.format, options()); setPreview(parsed); setStatus(`${response.value.fileName}: preview ready. No saved calendar data has changed.`);
    } catch (cause) { if (mounted.current && sequence === request.current) { setPreview(null); setError(cause instanceof Error ? cause.message : String(cause)); } }
    finally { if (mounted.current && sequence === request.current) setBusy(false); }
  }
  function demo() { try { request.current++; setBusy(false); setPreview(previewSyntheticCalendarDemo(now)); setImportOpen(true); setError(''); setStatus('Synthetic demo preview ready. Add it to the draft, then Apply to save it. It contains invented events only.'); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  /** One step from an empty calendar. The labelled synthetic demo joins the draft and is saved at once; the dialog stays open on the events. Remove the demo document to take it out again. */
  function loadDemo() { try { request.current++; setBusy(false); const next = applyCalendarPreview(draft, previewSyntheticCalendarDemo(now)), checked = restoreCalendarState(next); if (onChange(checked) === false) throw new Error('Workspace update was rejected. The calendar is unchanged; check the application status for details.'); pristine.current = checked; setDraft(checked); setPage(0); setPreview(null); setError(''); setStatus('Synthetic demo events loaded and saved. Every event is invented by OpenCandle and is not market data. Remove the demo document under Import and manage to take them out.'); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  function addPreview() { if (!preview) return; try { const next = applyCalendarPreview(draft, preview); setDraft(next); setPage(0); setPreview(null); setError(''); setStatus('Preview added to the draft. Apply saves it; Cancel discards it.'); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  function apply() { try { const checked = restoreCalendarState(draft); if (computed.error) throw new Error(computed.error); if (onChange(checked) === false) throw new Error('Workspace update was rejected. This draft is unchanged; check the application status for details.'); close(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  function revert() { try { const saved = restoreCalendarState(state); request.current++; setBusy(false); pristine.current = saved; setDraft(saved); setPage(0); setSelected(null); setPreview(null); setShowIcs(false); setError(''); setStatus('Draft reverted to the saved calendar. Nothing was saved.'); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  async function save(kind: 'json' | 'csv' | 'ics') {
    if (!window.lv) { setError('Saving a file needs the desktop app.'); return; }
    try { if (kind === 'csv' && !result) throw new Error('Fix the query before exporting.'); if (kind === 'ics' && !current) throw new Error('Select an event first.');
      const data = kind === 'json' ? serializeCalendarState(draft) : kind === 'csv' ? calendarRowsToCsv(result!) : calendarEventToIcs(current!, now);
      const response = await window.lv.exportData({ text: data, suggestedName: kind === 'json' ? 'OpenCandle-local-calendar-state.json' : kind === 'csv' ? 'OpenCandle-local-calendar-visible-report.csv' : 'OpenCandle-calendar-event.ics', format: kind });
      if (!mounted.current) return; if (!response.ok) { if (response.error.code !== 'CANCELLED') setError(response.error.message); } else setStatus(kind === 'ics' ? 'iCalendar file saved locally. Nothing was sent anywhere.' : 'Export saved locally.');
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function hostAction(action: ((instrumentId: string | null, symbol: string) => boolean | void) | undefined, row: CalendarRow) { if (!action || !row.event.symbol) return; try { if (action(row.event.instrumentId, row.event.symbol) === false) throw new Error('Workspace update was rejected. This draft is unchanged; check the application status for details.'); close(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  function seriesAction(series: string) { if (!onOpenSeries) return; try { if (onOpenSeries(series) === false) throw new Error('The chart could not open this series. The draft is unchanged; check the application status for details.'); close(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  function sort(key: CalendarSortKey) { change('sort', { key, direction: draft.query.sort.key === key && draft.query.sort.direction === 'asc' ? 'desc' : 'asc' }); }
  const selectValues = (event: React.ChangeEvent<HTMLSelectElement>) => Array.from(event.currentTarget.selectedOptions).map(option => option.value);
  const kindLabel = CALENDAR_KIND_LABELS[draft.query.kind], kindNoun = draft.query.kind === 'all' ? 'calendar' : kindLabel, icsText = showIcs && current ? (() => { try { return calendarEventToIcs(current, now); } catch (cause) { return cause instanceof Error ? cause.message : String(cause); } })() : '';
  // The economic series linked to the open row (exact FRED symbol, or a matched US headline release).
  const econSeries = current ? calendarEconomicSeries(current.event) : null;
  return <Modal title="Economic and corporate calendar" onClose={close} wide>
    <div className="modal-scroll lv-calendar lv-pol" style={{ overflow: 'auto', minHeight: 0, flex: 1, padding: '0 16px' }}>
      <div className="lv-calendar-head">
        <div className="tab-row lv-calendar-tabs" role="tablist" aria-label="Calendar kind">{CALENDAR_TAB_ORDER.map((kind, index) => <button key={kind} type="button" role="tab" id={`lv-calendar-tab-${kind}`} aria-selected={draft.query.kind === kind} aria-controls="lv-calendar-panel" tabIndex={draft.query.kind === kind ? 0 : -1} onKeyDown={event => tabKey(event, index)} onClick={() => selectKind(kind)}>{CALENDAR_TAB_LABELS[kind]}</button>)}</div>
        <span className="lv-calendar-meta">{draft.documents.some(document => document.provenance.fixture) ? <span className="synthetic-badge">{demoDataLabel()}</span> : <span className="lv-calendar-source">Local imports</span>}<InfoTip label="About calendar data" className="lv-info-end">Local imported events only. No event feed is connected. Empty data means unavailable coverage, not an event-free market.</InfoTip></span>
      </div>
      <div id="lv-calendar-panel" role="tabpanel" aria-labelledby={`lv-calendar-tab-${draft.query.kind}`}>
      {(chipLists.length > 0 || alpacaCorporateActions || fundamentals !== undefined) && <section className="lv-calendar-autofill" aria-label="Calendar auto-fill">
        <h3>Your symbols</h3>
        {chipLists.length > 0 && <div className="lv-calendar-chips" role="group" aria-label="Watchlist filter">
          <button type="button" className="lv-calendar-chip" aria-pressed={draft.query.symbols.length === 0} onClick={() => change('symbols', [])}>All symbols</button>
          {chipLists.map(({ choice, symbols }) => <button key={choice.id} type="button" className="lv-calendar-chip" aria-pressed={activeChip === choice.id} title={symbols.slice(0, 12).join(', ') + (symbols.length > 12 ? ', ...' : '')} onClick={() => change('symbols', symbols.slice(0, 1000))}>{choice.name} ({symbols.length})</button>)}
        </div>}
        <div className="button-row" style={{ flexWrap: 'wrap' }}>
          <button type="button" disabled={!alpacaCorporateActions || fillBusy || !fillSymbols.length} title={alpacaCorporateActions ? (fillSymbols.length ? 'Looks up each symbol on your own Alpaca key, one at a time.' : 'Pick a watchlist chip or add symbols to the active watchlist.') : AUTO_DIVIDEND_NEEDS_DATA} onClick={() => void fillDividends()}>{fillBusy ? 'Fetching dividends…' : `Fill dividends (${Math.min(fillSymbols.length, 40)} symbol${fillSymbols.length === 1 ? '' : 's'})`}</button>
          <button type="button" disabled={!(fundamentals?.length && fundamentalsLinks?.length)} title={fundamentals?.length && fundamentalsLinks?.length ? 'Builds past reported quarters from your saved SEC company facts.' : AUTO_EARNINGS_NEEDS_DATA} onClick={fillEarnings}>Fill past earnings from SEC facts</button>
        <InfoTip label="About automatic fill sources">Dividends come from Alpaca corporate actions on your own key. Past earnings come from SEC filings you saved. Upcoming earnings dates and estimates have no connected source; import a file for those.</InfoTip></div>
        {fillReport && fillReport.skipped.length > 0 && <details><summary>{fillReport.skipped.length} skipped</summary><ul className="lv-calendar-skipped">{fillReport.skipped.map(row => <li key={row.symbol}><b>{row.symbol}</b>: {row.reason}</li>)}</ul></details>}
      </section>}
      <div className="lv-calendar-quick" role="group" aria-label="Calendar quick periods">{CALENDAR_QUICK_PERIODS.map(value => <button key={value} type="button" className="lv-calendar-chip" aria-pressed={draft.query.period === value} onClick={() => update(query => { try { return selectCalendarPeriod(query, value, now); } catch { return { ...query, period: value }; } })}>{CALENDAR_PERIOD_LABELS[value]}</button>)}</div>
      {/* The importance toggles sit above the day strip, so a strip that shortens never moves them. */}
      {showLevels && <div className="lv-calendar-levels" role="group" aria-label="Importance levels"><span className="help">Importance</span>{CALENDAR_IMPORTANCE_LEVELS.map(level => <button key={level} type="button" className="lv-calendar-chip" aria-pressed={levels.includes(level)} aria-label={`${importanceLabels[level]} importance`} title={levels.length === 1 && levels.includes(level) ? 'At least one level stays on.' : undefined} onClick={() => { setLevels(previous => toggleCalendarImportance(previous, level)); setPage(0); }}><span aria-hidden="true">{importanceBars[level]} </span>{importanceLabels[level]}</button>)}{!levelsAll && <span className="help">Events without a supplied importance are hidden while a level is off.</span>}</div>}
      {dayCounts.length > 1 && dayCounts.length <= 31 && <div className="lv-calendar-days" role="group" aria-label="Calendar days"><button type="button" className="lv-calendar-chip" aria-pressed={day === null} onClick={() => { setDayPick(null); setPage(0); }}>All days <span className="lv-calendar-count">{levelRows.length}</span></button>{dayCounts.map(item => <button key={item.date} type="button" className="lv-calendar-chip" aria-pressed={day === item.date} aria-label={`${calendarDayLabel(item.date, today)}, ${item.count} ${item.count === 1 ? 'event' : 'events'}`} onClick={() => { setDayPick(day === item.date ? null : item.date); setPage(0); }}>{calendarDayLabel(item.date, today)} <span className="lv-calendar-count">{item.count}</span></button>)}</div>}
      {focusMissing && <p className="help" role="note">That calendar entry is no longer in your saved calendar or is not published yet.</p>}
      {stale.message && <p className="lv-calendar-stale" role="note">{stale.message}</p>}
      <div className="button-row" style={{ flexWrap: 'wrap' }}>
        <label>Period <select aria-label="Calendar period" value={draft.query.period} onChange={event => { const period = event.target.value as CalendarPeriod; update(query => { try { return selectCalendarPeriod(query, period, now); } catch { return { ...query, period }; } }); }}>{CALENDAR_PERIODS.map(value => <option key={value} value={value}>{CALENDAR_PERIOD_LABELS[value]}</option>)}</select></label>
        {draft.query.period === 'custom' && <><label>From <input aria-label="Calendar from date" type="date" value={draft.query.from ?? ''} onChange={event => change('from', event.target.value || null)}/></label><label>Through <input aria-label="Calendar through date" type="date" value={draft.query.to ?? ''} onChange={event => change('to', event.target.value || null)}/></label></>}
        <button type="button" disabled={!earlier} title="Move the selected range back by its own length" onClick={() => earlier && update(() => earlier)}>Earlier period</button><button type="button" disabled={!later} title="Move the selected range forward by its own length" onClick={() => later && update(() => later)}>Later period</button>
        <label>Display timezone <input aria-label="Calendar timezone" list="calendar-timezones" value={draft.query.timezone} onChange={event => change('timezone', event.target.value)}/><datalist id="calendar-timezones">{zones.map(zone => <option key={zone} value={zone}/>)}</datalist></label>
        <button type="button" onClick={() => change('timezone', localZone())}>Use local timezone</button>
        <label>Search <input aria-label="Calendar search" maxLength={500} value={draft.query.search} onChange={event => change('search', event.target.value)}/></label>
        {(draft.query.kind === 'all' || draft.query.kind === 'economic') && <label><input type="checkbox" aria-label="Calendar high importance only" checked={draft.query.highImportance} onChange={event => change('highImportance', event.target.checked)}/>High importance only</label>}
      </div>
      <p className="help lv-calendar-range">{draft.query.period === 'upcoming' ? `From ${(() => { try { return calendarToday(draft.query.timezone, now); } catch { return 'now'; } })()}, no end date` : draft.query.period === 'past' ? 'Before today' : draft.query.period === 'all' ? 'All dates' : `Range ${result?.range.from ?? 'not set'} to ${result?.range.to ?? 'not set'}`}<span aria-hidden="true"> · </span>{draft.query.timezone}<InfoTip label="About dates and timezones">Exact times are converted to {draft.query.timezone}. Date-only, before-open and after-close events keep their supplied date. Upcoming starts now with no end date; Past is everything before now.</InfoTip></p>
      <details><summary>Country, category, symbol and availability filters</summary><div className="button-row" style={{ flexWrap: 'wrap', alignItems: 'start' }}>
        <label>Countries <select multiple aria-label="Calendar countries" value={draft.query.countries} onChange={event => change('countries', selectValues(event))}>{optionList('country', draft.query.countries).map(value => <option key={value}>{value}</option>)}</select><button type="button" onClick={() => change('countries', [])}>All countries</button></label>
        <label>Categories <select multiple aria-label="Calendar categories" value={draft.query.categories} onChange={event => change('categories', selectValues(event))}>{optionList('category', draft.query.categories).map(value => <option key={value}>{value}</option>)}</select><button type="button" onClick={() => change('categories', [])}>All categories</button></label>
        <label>Symbols <select multiple aria-label="Calendar symbols" value={draft.query.symbols} onChange={event => change('symbols', selectValues(event))}>{optionList('symbol', draft.query.symbols).map(value => <option key={value}>{value}</option>)}</select><button type="button" onClick={() => change('symbols', [])}>All symbols</button></label>
        <label><input type="checkbox" aria-label="Calendar include cancelled" checked={draft.query.includeCancelled} onChange={event => change('includeCancelled', event.target.checked)}/>Include cancelled events</label>
        <label>Information known by Unix second <input type="number" aria-label="Calendar availability cutoff" value={draft.query.asOf ?? ''} placeholder="Latest, with unknown availability labeled" onChange={event => change('asOf', event.target.value === '' ? null : Number(event.target.value))}/></label>
      </div><InfoTip label="About selector lists">Selector lists show values supplied for the active tab. Empty selections include all supplied values. Missing importance never counts as high. A historical cutoff hides undated publications and values; it does not move the current clock used by Today or Upcoming.</InfoTip></details>
      <div className="button-row" style={{ flexWrap: 'wrap' }}><label>Sort <select aria-label="Calendar sort field" value={draft.query.sort.key} onChange={event => change('sort', { ...draft.query.sort, key: event.target.value as CalendarSortKey })}>{calendarSortChoices(draft.query.kind, draft.query.sort.key).map(value => <option key={value} value={value}>{fieldLabel(value)}</option>)}</select></label><select aria-label="Calendar sort direction" value={draft.query.sort.direction} onChange={event => change('sort', { ...draft.query.sort, direction: event.target.value as 'asc' | 'desc' })}><option value="asc">Ascending</option><option value="desc">Descending</option></select><button type="button" onClick={() => { update(resetCalendarFilters); setStatus(resetMessage(draft.query)); }}>Reset filters</button></div>
      <div className="lv-calendar-summary" aria-label="Calendar coverage">
        {/* The count is what the table shows after the importance and day toggles. */}<span role="status">{result ? `${viewRows.length.toLocaleString('en-US')} event${viewRows.length === 1 ? '' : 's'}` : computed.error}</span>
        {result && result.coverage.synthetic > 0 && <span className="synthetic-badge">{demoDataLabel()}</span>}
        {result && result.coverage.revised > 0 && <span className="lv-calendar-count">{result.coverage.revised} revised</span>}
        <InfoTip label="Calendar coverage details"><span className="lv-tip-line">{result ? `${result.coverage.matched} matching. ${draft.query.asOf === null ? `${result.coverage.identities} events (${result.coverage.records} revisions, ${result.coverage.documents} documents); ${result.coverage.unavailableAtCutoff} unavailable at cutoff` : `${result.coverage.availableEvents} event identities known by the cutoff (counts of later publications are hidden)`}; ${result.coverage.hiddenValues} hidden values; ${result.coverage.unknownPublication} with no known release time; ${result.coverage.revised} revised${result.coverage.synthetic ? `; ${result.coverage.synthetic} example matches` : ''}.` : computed.error}</span>
          <span className="lv-tip-line">{coverage.identities ? `Imported ${kindNoun} coverage at this cutoff: ${coverage.identities} event identities in ${coverage.documents} document(s)${coverage.syntheticDocuments ? `, ${coverage.syntheticDocuments} example` : ''}; source dates ${coverage.from} to ${coverage.to}${coverage.unavailableAtCutoff ? `; ${coverage.unavailableAtCutoff} more with a publication time after now` : ''}. Coverage describes your imports, not the market.` : draft.query.asOf !== null ? `No imported ${kindNoun} events are known by this cutoff.` : coverage.unavailableAtCutoff ? `No ${kindNoun} events are published yet (${coverage.unavailableAtCutoff} imported identities have a publication time after now).` : `No imported ${kindNoun} events.`}</span></InfoTip>
      </div>
      {result?.diagnostics.map(message => <p key={message} className="help">{message}</p>)}
      <div className={empty?"table-scroll lv-calendar-table-empty":"table-scroll"}><table className="data-table" aria-label={`${kindLabel} calendar`}><thead><tr>{columns.map(column => <th key={column.id} aria-sort={column.sort && draft.query.sort.key === column.sort ? draft.query.sort.direction === 'asc' ? 'ascending' : 'descending' : undefined}>{column.sort ? <button type="button" onClick={() => sort(column.sort!)}>{column.label}{draft.query.sort.key === column.sort ? draft.query.sort.direction === 'asc' ? ' ▲' : ' ▼' : ''}</button> : column.label}{column.id === 'date' && <small className="lv-calendar-zone" title="Times follow the display timezone above">{draft.query.timezone}</small>}</th>)}</tr></thead><tbody>{dayBlocks.map(block => <React.Fragment key={block.key}>{block.header && <tr className="lv-calendar-day"><th colSpan={columns.length} scope="colgroup">{block.header}</th></tr>}{block.rows.map(row => <tr key={row.key} className={selected === row.key ? 'selected' : undefined}>
        {columns.map(column => <td key={column.id}>{column.id === 'title' ? <><button type="button" aria-expanded={selected === row.key} onClick={() => { setSelected(selected === row.key ? null : row.key); setShowIcs(false); setShowOverview(false); }}>{row.event.title}</button>{row.provenance.fixture && <b> Demo</b>}{row.event.status === 'cancelled' && <b> CANCELLED</b>}{row.event.status === 'tentative' && <b> TENTATIVE</b>}{row.revisions.changes.length > 0 && <b> REVISED</b>}</> : column.cell(row)}</td>)}
      </tr>)}</React.Fragment>)}</tbody></table>
      {viewNarrowed && <div className="empty-message" data-availability="empty"><p>No events match the chosen day and importance levels.</p><div className="button-row"><button type="button" onClick={() => { setDayPick(null); setLevels([...CALENDAR_IMPORTANCE_LEVELS]); setPage(0); }}>Show all days and levels</button></div></div>}
      {empty && <div className="empty-message" data-availability={empty.availability}><p>{calendarEmptyHeadline(empty.reason, draft.query.kind, empty.message)}{empty.reason !== 'error' && <InfoTip label="Why is this empty?">{empty.message}</InfoTip>}</p><div className="button-row">{empty.reason === 'no-documents' && <>{demoDataMode() !== 'off' && <button type="button" onClick={loadDemo}>Load synthetic demo events</button>}<button type="button" onClick={() => setImportOpen(true)}>Show import options</button></>}{empty.reason === 'no-kind-coverage' && <button type="button" onClick={() => setImportOpen(true)}>Show import options</button>}{empty.reason === 'cancelled' && <button type="button" onClick={() => change('includeCancelled', true)}>Include cancelled events</button>}{(empty.reason === 'filtered' || empty.reason === 'outside-coverage') && <button type="button" onClick={() => { update(resetCalendarFilters); setStatus(resetMessage(draft.query)); }}>Reset filters</button>}</div></div>}</div>
      <div className="button-row"><button type="button" disabled={currentPage === 0} onClick={() => setPage(0)}>First</button><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(pageCount - 1)}>Last</button><label>Rows <select aria-label="Calendar rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}>{[50, 100, 250].map(value => <option key={value}>{value}</option>)}</select></label></div>
      {current && <section aria-label="Calendar event details" className="lv-calendar-details"><h3>{current.event.title}{current.provenance.fixture ? ' · Demo' : ''}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{current.event.description || 'No description supplied.'}</p>
        <p className="help">{CALENDAR_KIND_LABELS[current.event.kind]} · status {current.event.status} · revision {current.event.revision} · published {timestamp(current.event.publishedAt)} · source date {current.event.date} · source zone {current.event.timezone ?? 'Not supplied'} · timing {timingLabels[current.event.timing]} · fiscal period {current.event.fiscalPeriod ?? 'Not supplied'}<br/>Country {current.event.country ?? 'Not supplied'} · category {current.event.category ?? 'Not supplied'} · exchange {current.event.exchange ?? 'Not supplied'} · ex-dividend date {current.event.exDate ?? 'Not supplied'} · payment date {current.event.payDate ?? 'Not supplied'}</p>
        <table className="data-table"><thead><tr><th>Field</th><th>Value</th><th>Available at</th></tr></thead><tbody>{Object.entries({ ...current.values, ...current.derived }).filter(([key]) => key in current.event.values || ['epsSurprisePercent', 'revenueSurprisePercent', 'dealAmount', 'ipoMarketCap', 'splitRatio'].includes(key)).map(([key, value]) => <tr key={key}><td>{fieldLabel(key)}</td><td>{display(value)}{value.reason && <span> · {value.reason}</span>}</td><td>{timestamp(value.availableAt)}</td></tr>)}</tbody></table>
        <h4>Revision history</h4>
        {current.revisions.history.length > 1 ? <><p className="help">Revisions published by the cutoff: {current.revisions.history.map(entry => `r${entry.revision} (published ${timestamp(entry.publishedAt)}, ${entry.status}, ${entry.date})`).join('; ')}. Showing r{current.event.revision}; compared with r{current.revisions.previousRevision}.</p>
          {current.revisions.changes.length ? <table className="data-table" aria-label="Calendar revision changes"><thead><tr><th>Field</th><th>Previous</th><th>Revised</th></tr></thead><tbody>{current.revisions.changes.map(change => <tr key={change.field}><td>{fieldLabel(change.field)}</td><td>{changeText(change, 'before')}</td><td>{changeText(change, 'after')}</td></tr>)}</tbody></table> : <p className="help">No visible field changed between these revisions.</p>}</>
          : <p className="help">Only one revision is published by the cutoff.</p>}
        <p className="help">{current.provenance.label} · Imported {timestamp(current.provenance.importedAt)}<br/>{current.provenance.sourceUrl ?? 'No source URL supplied.'}<br/>{current.provenance.license}</p>
        <div className="button-row" style={{ flexWrap: 'wrap' }}>
          {econSeries ? (onOpenSeries ? <button type="button" title={`${econSeries.description}. ${econSeries.basisText}`} onClick={() => seriesAction(econSeries.series)}>Launch chart {econSeries.symbol}</button> : <span className="help">Launch chart is unavailable: the host did not provide a series chart action.</span>) : current.event.symbol && onSelectSymbol ? <button type="button" onClick={() => hostAction(onSelectSymbol, current)}>{current.event.kind === 'economic' ? 'Launch chart' : 'Open'} {current.event.symbol}</button> : <span className="help">Launch chart is unavailable: {current.event.symbol ? 'the host did not provide a chart action.' : current.event.kind === 'economic' ? 'this event has no chart symbol and no matching economic series.' : 'this event has no supplied chart symbol.'}</span>}
          {current.event.kind !== 'economic' && current.event.symbol && onOpenFinancials && <button type="button" onClick={() => hostAction(onOpenFinancials, current)}>Open {current.event.symbol} financials</button>}
          {current.event.kind === 'economic' && (econSeries ? <button type="button" aria-expanded={showOverview} onClick={() => setShowOverview(!showOverview)}>See overview</button> : <span className="help">See overview is unavailable: no economic series is linked to this event; the imported description above is the only detail.</span>)}
          <button type="button" aria-expanded={showIcs} onClick={() => setShowIcs(!showIcs)}>Add to calendar (iCalendar text)</button>
          <button type="button" onClick={() => setSelected(null)}>Close event details</button>
        </div>
        {showOverview && econSeries && <section aria-label="Economic series overview" className="lv-calendar-overview"><h4>{econSeries.symbol}</h4><p>{econSeries.description}</p><p className="help">Units {econSeries.units} · {econSeries.frequency} · source FRED economic data (St. Louis Fed) · {econSeries.url}<br/>{econSeries.basisText} Values download only when you launch the chart.</p></section>}
        {showIcs && <div className="import-text"><InfoTip label="About iCalendar text">Local iCalendar text for this event only. No account, upload or automatic transmission is involved. Values are not included. Copy it, or save it as a local .ics file.</InfoTip><textarea readOnly aria-label="Calendar event iCalendar text" value={icsText}/><div className="button-row"><button type="button" onClick={() => void save('ics')}>Save iCalendar text file</button></div></div>}
      </section>}
      </div>
      <details open={importOpen} onToggle={event => setImportOpen(event.currentTarget.open)}><summary>Import and manage local event documents</summary><InfoTip label="About importing events">Choose or paste CSV or JSON below. Accepted JSON is an event array, one calendar document, or an exported OpenCandle calendar state. CSV requires id, kind, title and date; optional values use fields such as actual, actualUnit and actualAvailableAt.</InfoTip>
        <div className="button-row" style={{ flexWrap: 'wrap' }}><button type="button" disabled={busy} onClick={() => void chooseFile()}>{busy ? 'Choosing calendar file…' : 'Choose calendar file'}</button><label>Paste format <select aria-label="Calendar import format" value={format} onChange={event => updateImport(() => setFormat(event.target.value as 'json' | 'csv'))}><option value="json">JSON</option><option value="csv">CSV</option></select></label><OverflowMenu label="More import actions"><button type="button" role="menuitem" onClick={() => updateImport(() => { setFormat('json'); setText(calendarJsonTemplate(now)); })}>Insert empty JSON document template</button><button type="button" role="menuitem" onClick={() => updateImport(() => { setFormat('csv'); setText(CALENDAR_CSV_TEMPLATE); })}>Insert CSV header template</button>{demoDataMode() !== 'off' && <button type="button" role="menuitem" onClick={demo}>Preview synthetic demo events</button>}</OverflowMenu></div>
        <details><summary>Import field reference</summary><p className="help">{fieldReference}</p></details>
        <div className="import-options"><label>Source label <input aria-label="Calendar import source label" value={sourceLabel} onChange={event => updateImport(() => setSourceLabel(event.target.value))}/></label><label>Source URL <input aria-label="Calendar import source URL" value={source} onChange={event => updateImport(() => setSource(event.target.value))}/></label><label>Rights statement <input aria-label="Calendar import rights" value={rights} onChange={event => updateImport(() => setRights(event.target.value))}/></label><label><input type="checkbox" checked={fixture} onChange={event => updateImport(() => setFixture(event.target.checked))}/>Example data (not real events)</label></div><InfoTip label="About source fields">These source fields apply to CSV and bare event arrays. Complete JSON documents retain their declared provenance.</InfoTip>
        <div className="import-text"><textarea aria-label="Calendar import text" value={text} onChange={event => updateImport(() => setText(event.target.value))} placeholder="Paste your event data. No sample market events are inserted automatically."/></div><div className="button-row"><button type="button" onClick={parse}>Preview import</button><button type="button" disabled={!preview} onClick={() => { setPreview(null); setStatus('Preview discarded. Saved state is unchanged.'); }}>Discard preview</button></div>
        {preview && <div><p>{preview.documents.length} document(s), {preview.documents.reduce((sum, document) => sum + document.events.length, 0)} revisions. {preview.documents.filter(document => document.provenance.fixture).length} example document(s). {preview.state ? 'This preview replaces the draft documents and filters.' : 'A matching document ID replaces that draft document; other documents remain.'}</p>{preview.diagnostics.map(message => <p key={message}>{message}</p>)}<button type="button" onClick={addPreview}>{preview.state ? 'Replace draft with previewed state' : 'Add preview to draft'}</button></div>}
        <div className="button-row lv-calendar-docs-head"><strong>Documents in draft ({draft.documents.length})</strong><OverflowMenu label="More document actions"><button type="button" role="menuitem" onClick={() => { setDraft(previous => ({ ...previous, documents: [] })); setPage(0); setSelected(null); }}>Remove all documents from draft</button><button type="button" role="menuitem" onClick={() => void save('json')}>Export full calendar JSON</button><button type="button" role="menuitem" disabled={!result} onClick={() => void save('csv')}>Export visible CSV report</button></OverflowMenu></div>
        {draft.documents.map(document => <div key={document.id} className="button-row"><span>{document.provenance.label} · {draft.query.asOf === null ? `${document.events.length} revisions` : 'revision count hidden under a historical cutoff'}{document.provenance.fixture ? ' · Demo' : ''}</span><button type="button" onClick={() => { setDraft(previous => ({ ...previous, documents: previous.documents.filter(row => row.id !== document.id) })); setPage(0); setSelected(null); }}>Remove {document.provenance.label} from draft</button></div>)}      </details>
      <details><summary>Availability, calculations and remaining coverage</summary>{CALENDAR_POLICIES.map(policy => <p key={policy} className="help">{policy}</p>)}<p className="help">Full-calendar JSON preserves revisions, provenance and filters and can be imported again. Visible CSV is a report with cutoff-masked values, not the event import schema. Chart markers show earnings, dividend, split and IPO entries for the chart symbol when the host chart mounts them. Economic charts and overviews cover only FRED series linked to an event (a FRED: symbol, or a matched US headline release); estimates feeds, market-wide coverage, hosted calendar integrations and reference-specific default behaviors remain unimplemented or unverified.</p></details>
      <p role="status">{status}</p>
    </div>
    <footer><span role="alert">{error || computed.error}</span><button type="button" className="lv-calendar-revert" disabled={!dirty} onClick={revert}>Revert to saved</button><button type="button" onClick={close}>Cancel</button><button type="button" onClick={apply}>Apply</button></footer>
  </Modal>;
}
