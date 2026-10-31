import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { backtestStrategy, type StrategyConfig } from '../domain/strategy';
import type { StrategyReportSide } from '../domain/strategy-report';
import { DEFAULT_REPORT_COLUMNS, REPORT_TRADE_COLUMNS, type ReportTradeColumn } from '../domain/strategy-report-view';
import type { StrategyDialogProps, StrategyExecution } from '../ui/StrategyDialog';
import { createStrategyReportClient, type StrategyReportClient } from './client';
import { resolveMagnifierBars } from './magnifier';
import { subscribeScriptRequestResolver } from '../ui/script-requests';
import { strategyFeedback, subscribeStrategyFeedback } from './feedback';
import { convertAsOf } from '../domain/strategy-report-periods';
import type { StrategyCapabilities } from '../domain/strategy';
import { strategyDateRangeLabel, strategyRangeSlice, type StrategyDateRange } from '../domain/strategy-date-range';
import type { ReportExportKind, ReportOpenLotPage, ReportOrderPage, ReportTradePage, StrategyReportHandle, StrategyReportJobInput, StrategyReportProgress } from './types';

type Tab = 'Metrics' | 'Trades' | 'Orders' | 'Properties';
type ReportState = { handle: StrategyReportHandle | null; execution: StrategyExecution | null; config: StrategyConfig | null; error: string; busy: boolean; progress: StrategyReportProgress | null; /** Bar Magnifier data notice (waiting for bars, or why none were used). */ notice?: string };
/**
 * What the Strategy tester host supplies. Recalculate on every tick (the forming realtime bar, when the
 * execution carries one) and the Bar Magnifier (lower-timeframe bars from loaded data) are available.
 * So is Recalculate after order is filled. The script's onFill hook answers each fill through the
 * engine feedback replay (src/strategy-report/feedback.ts); a script without onFill adds no orders at a fill.
 */
export const STRATEGY_TESTER_CAPABILITIES: StrategyCapabilities = Object.freeze({ everyTick: true, magnifier: true, afterFill: true });
/**
 * The currency the report shows. Default is the symbol currency. USD converts from the symbol
 * currency with the as-of rate rule of convertAsOf; OpenCandle loads no exchange rates, so that works only when the symbol
 * is already in USD (the conversion is then exact). Anything else is refused with the reason.
 */
export function reportAccountCurrency(symbolCurrency: string | null, config: Pick<StrategyConfig, 'accountCurrency'>): { ok: true; currency: string | null } | { ok: false; reason: string } {
  if (config.accountCurrency === undefined) return { ok: true, currency: symbolCurrency };
  if (symbolCurrency === null) return { ok: false, reason: `Account currency ${config.accountCurrency}: this symbol does not state its currency, so its values cannot be converted. Choose Default.` };
  const converted = convertAsOf(1, 0, symbolCurrency, config.accountCurrency, null);
  return converted.available ? { ok: true, currency: config.accountCurrency } : { ok: false, reason: `Account currency ${config.accountCurrency}: ${converted.reason} OpenCandle loads no exchange rates, so only a ${config.accountCurrency} symbol can use it. Choose Default.` };
}
type WorkbookSave = (value: { data: Uint8Array; format: 'xlsx'; suggestedName: string }) => ReturnType<NonNullable<typeof window.lv>['exportData']>;
/** Desktop workbook save (`exportBinary`), present only once the reserved electron change lands. */
export function workbookExport(): WorkbookSave | null { const bridge = (typeof window === 'undefined' ? undefined : window.lv) as unknown as { exportBinary?: WorkbookSave } | undefined; return typeof bridge?.exportBinary === 'function' ? bridge.exportBinary.bind(bridge) : null; }
export const copyStrategyConfig = (config: StrategyConfig): StrategyConfig => ({ ...config, commission: { ...config.commission } });
export const ignoredReportError = (cause: unknown) => ['REPORT_CANCELLED', 'REPORT_QUERY_SUPERSEDED'].includes((cause as { code?: string })?.code ?? '');
const idle: ReportState = { handle: null, execution: null, config: null, error: '', busy: false, progress: null };

/**
 * The report job for an execution and its applied properties.
 * - Recalculate on every tick: the still-forming realtime bar (kept aside by the host) joins the run, with its proposals.
 * - Bar Magnifier: lower-timeframe bars from loaded data; while they load the job waits (`waiting`), and the hook reruns
 *   it when the request data changes. Unavailable data leaves the run on the OHLC route, with the reason as `notice`.
 */
export function strategyReportJobInput(execution: StrategyExecution, config: StrategyConfig, resolve: typeof resolveMagnifierBars = resolveMagnifierBars): { waiting: true; notice: string } | { waiting: false; input: StrategyReportJobInput; notice?: string } {
  // The account currency the report shows (it never changes a fill), and a script that reads the engine settles first.
  const currency = reportAccountCurrency(execution.currency ?? null, config);
  if (!currency.ok) throw new Error(currency.reason);
  const settled = strategyFeedback(execution, config, value => buildReportJobInput(value, config, resolve, currency.currency));
  if (settled.state === 'waiting') return { waiting: true, notice: settled.notice };
  if (settled.state === 'failed') throw new Error(settled.error);
  return buildReportJobInput(settled.state === 'ready' ? settled.execution : execution, config, resolve, currency.currency);
}
function buildReportJobInput(execution: StrategyExecution, settings: StrategyConfig, resolve: typeof resolveMagnifierBars, currency: string | null): { waiting: true; notice: string } | { waiting: false; input: StrategyReportJobInput; notice?: string } {
  const { accountCurrency: _account, dateRange, ...config } = settings;
  let forming = config.calcOnEveryTick ? execution.forming ?? null : null;
  let bars = forming ? [...execution.bars, forming.bar] : execution.bars, barIds = forming ? [...execution.barIds, forming.barId] : execution.barIds;
  let standardBars = forming && execution.standardBars ? [...execution.standardBars, forming.standardBar ?? forming.bar] : execution.standardBars, proposals = forming ? [...execution.result.orders, ...forming.orders] : execution.result.orders;
  // The Strategy tester date range keeps only the bars inside it (and their proposals); see strategy-date-range.ts.
  if (dateRange) {
    const { start, end } = strategyRangeSlice(dateRange, bars);
    if (start === end) throw new Error(`No bars fall inside the strategy date range (${strategyDateRangeLabel(dateRange)}). Choose another range in Properties.`);
    // A script that reads the engine's position settles against engine bars aligned to its own from the first bar (feedback.ts), so a later start is refused, not misaligned.
    if (start > 0 && execution.rerun) throw new Error(`This script reads the strategy position, so its report must start at the first loaded bar. The date range (${strategyDateRangeLabel(dateRange)}) can only end earlier; choose Entire history or a custom range without a start date.`);
    if (start > 0 || end < bars.length) {
      if (forming && end < bars.length) forming = null;
      bars = bars.slice(start, end); barIds = barIds.slice(start, end); standardBars = standardBars?.slice(start, end);
      const kept = new Set(barIds); proposals = proposals.filter(order => kept.has((order.event as { id?: string } | undefined)?.id as string));
    }
  }
  const magnifier = config.barMagnifier ? resolve({ bars, base: execution.magnifierBase }) : null;
  if (magnifier?.state === 'loading') return { waiting: true, notice: `Bar Magnifier: waiting for ${magnifier.interval} bars. ${magnifier.message}`.trim() };
  const notice = magnifier?.state === 'unavailable' ? `Bar Magnifier: ${magnifier.reason}` : magnifier?.state === 'ready' && !magnifier.bars.length && bars.length ? `Bar Magnifier: no ${magnifier.interval} bars cover this chart's bars, so fills use the OHLC route.` : undefined;
  const magnifierRows = magnifier?.state === 'ready' ? magnifier.bars : [];
  // After-fill proposals on bars of this run, with Recalculate after order is filled only.
  const ids = new Set(barIds), fillProposals = config.calcOnOrderFills ? (execution.fillProposals ?? []).filter(order => ids.has((order.event as { id?: string } | undefined)?.id as string)) : [];
  const input: StrategyReportJobInput = { execution: { bars, standardBars, barIds, proposals, chartType: execution.chartType, context: { executionId: execution.identity, sourceLabel: execution.source, currency, timezone: execution.timezone ?? 'UTC' }, ...(config.barMagnifier ? { magnifierBars: magnifierRows, ...(magnifier?.state === 'ready' && magnifierRows.length ? { magnifierLabel: magnifier.label } : {}) } : {}), ...(config.calcOnEveryTick ? { formingBar: !!forming } : {}), ...(fillProposals.length ? { fillProposals } : {}) }, config };
  return notice ? { waiting: false, input, notice } : { waiting: false, input };
}
/** React owns only bounded pages and summary data. The full report stays in its worker. */
export function useStrategyReport(props: StrategyDialogProps) {
  const { execution, config, ownerToken } = props;
  const [tab, rawTab] = useState<Tab>('Metrics'), [draft, rawDraft] = useState(() => copyStrategyConfig(config));
  const [error, rawError] = useState(''), [status, rawStatus] = useState('');
  const [side, rawSide] = useState<StrategyReportSide>('all'), [columns, rawColumns] = useState<readonly ReportTradeColumn[]>(DEFAULT_REPORT_COLUMNS), [columnPanel, rawColumnPanel] = useState(false);
  const [query, rawQuery] = useState(''), [sort, rawSort] = useState<ReportTradeColumn>('number'), [descending, rawDescending] = useState(false), [page, rawPage] = useState(0), [openPage, rawOpenPage] = useState(0);
  const [reportState, setReportState] = useState<ReportState>(idle), [exportBusy, setExportBusy] = useState(false), [retry, setRetry] = useState(0);
  const [tableState, setTableState] = useState<{ key: string; handle: StrategyReportHandle | null; table: ReportTradePage | null; open: ReportOpenLotPage | null; orders: ReportOrderPage | null; busy: boolean; error: string }>({ key: '', handle: null, table: null, open: null, orders: null, busy: false, error: '' });
  const latest = useRef(props); latest.current = props;
  const mounted = useRef(true), closed = useRef(false), client = useRef<StrategyReportClient | null>(null), reportAbort = useRef<AbortController | null>(null), reportEpoch = useRef(0), tableEpoch = useRef(0), exportEpoch = useRef(0), exportPending = useRef(false);
  const draftState = useRef({ execution, config, value: draft, revision: 0, consumed: false }), applyPending = useRef(false), activeReport = useRef<StrategyReportHandle | null>(null);
  const currentToken = useRef(ownerToken), reportToken = useRef(ownerToken), resetOwner = useRef(false);
  if (currentToken.current !== ownerToken) {
    // A batched same-name close/reopen can reuse this React instance. Revoke the
    // old resource authority before any retained handler can observe new props.
    currentToken.current = ownerToken; retireReport(); client.current?.dispose(); client.current = null;
    closed.current = false; applyPending.current = false; resetOwner.current = true;
    draftState.current = { execution, config, value: copyStrategyConfig(config), revision: draftState.current.revision + 1, consumed: false };
  }
  const renderDraftRevision = draftState.current.revision;
  const handle = reportToken.current === ownerToken && reportState.execution === execution && reportState.config === config ? reportState.handle : null;
  activeReport.current = handle;
  function assertUi() {
    if (!mounted.current || closed.current) throw new Error('This report window has closed.');
    if (latest.current.ownerToken !== ownerToken || latest.current.execution !== execution || latest.current.config !== config) throw new Error('The report execution or properties changed.');
    props.assertOwner?.();
    if (!mounted.current || closed.current || latest.current.ownerToken !== ownerToken || latest.current.execution !== execution || latest.current.config !== config) throw new Error('The report owner changed.');
  }
  function alive() { try { assertUi(); return true; } catch { return false; } }
  const guard = <T,>(setter: Dispatch<SetStateAction<T>>): Dispatch<SetStateAction<T>> => value => { if (alive()) setter(value); };
  const setTab = guard(rawTab), setError = guard(rawError), setSide = guard(rawSide), setColumns = guard(rawColumns), setColumnPanel = guard(rawColumnPanel), setQuery = guard(rawQuery), setSort = guard(rawSort), setDescending = guard(rawDescending), setPage = guard(rawPage), setOpenPage = guard(rawOpenPage);
  function assertReport(captured: StrategyReportHandle, selected = execution, settings = config) {
    assertUi(); if (activeReport.current !== captured || latest.current.execution !== selected || latest.current.config !== settings) throw new Error('The report execution or properties changed.');
  }
  function retireReport() { reportEpoch.current++; tableEpoch.current++; exportEpoch.current++; reportAbort.current?.abort(); reportAbort.current = null; activeReport.current?.dispose(); activeReport.current = null; }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; retireReport(); client.current?.dispose(); client.current = null; };
  }, []);
  useEffect(() => {
    if (!resetOwner.current || !alive()) return;
    resetOwner.current = false; rawTab('Metrics'); rawDraft(copyStrategyConfig(config)); rawError(''); rawStatus(''); rawSide('all'); rawColumns(DEFAULT_REPORT_COLUMNS); rawColumnPanel(false); rawQuery(''); rawSort('number'); rawDescending(false); rawPage(0); rawOpenPage(0);
  }, [ownerToken]);
  useEffect(() => {
    const generation = ++reportEpoch.current, controller = new AbortController(); reportAbort.current?.abort(); reportAbort.current = controller;
    let accepted: StrategyReportHandle | null = null;
    const current = () => { assertUi(); if (controller.signal.aborted || reportEpoch.current !== generation || latest.current.execution !== execution || latest.current.config !== config) throw new Error('The report execution or properties changed.'); };
    const cleanup = () => { controller.abort(); accepted?.dispose(); if (reportAbort.current === controller) reportAbort.current = null; };
    if (!alive()) return cleanup;
    activeReport.current = null; exportEpoch.current++; exportPending.current = false; setExportBusy(false); rawStatus(''); rawPage(0); rawOpenPage(0);
    if (!execution) { setReportState({ ...idle, config }); return cleanup; }
    let prepared: ReturnType<typeof strategyReportJobInput>;
    try { prepared = strategyReportJobInput(execution, config); } catch (cause) { setReportState({ handle: null, execution, config, error: cause instanceof Error ? cause.message : String(cause), busy: false, progress: null }); return cleanup; }
    if (prepared.waiting) {
      setReportState({ handle: null, execution, config, error: '', busy: true, progress: null, notice: prepared.notice });
      const rerun = () => { if (!controller.signal.aborted && alive()) setRetry(value => value + 1); };
      const unsubscribe = subscribeScriptRequestResolver(rerun), unsubscribeFeedback = subscribeStrategyFeedback(rerun);
      return () => { unsubscribe(); unsubscribeFeedback(); cleanup(); };
    }
    const notice = prepared.notice;
    setReportState({ handle: null, execution, config, error: '', busy: true, progress: null, ...(notice ? { notice } : {}) });
    client.current ??= createStrategyReportClient();
    void client.current.start(prepared.input, { signal: controller.signal, assertCurrent: current }, progress => {
      current(); setReportState(previous => mounted.current && !closed.current && reportEpoch.current === generation && latest.current.execution === execution && latest.current.config === config ? { ...previous, progress } : previous); current();
    }).then(value => {
      try { current(); accepted = value; reportToken.current = ownerToken; activeReport.current = value; setReportState({ handle: value, execution, config, error: '', busy: false, progress: null, ...(notice ? { notice } : {}) }); current(); }
      catch { value.dispose(); }
    }).catch(cause => {
      try { current(); if (!ignoredReportError(cause)) setReportState({ handle: null, execution, config, error: String(cause), busy: false, progress: null }); } catch { /* Retired owners cannot publish. */ }
    });
    return cleanup;
  }, [execution, config, retry, ownerToken]);
  const tableKey = JSON.stringify([tab, side, query, sort, descending, page, openPage]);
  useEffect(() => {
    const generation = ++tableEpoch.current;
    const current = () => { if (!handle || generation !== tableEpoch.current) throw new Error('The report table request changed.'); assertReport(handle); };
    if (!handle || !['Trades', 'Orders'].includes(tab) || !alive()) return;
    setTableState({ key: tableKey, handle, table: null, open: null, orders: null, busy: true, error: '' });
    void (async () => {
      try {
        current();
        if (tab === 'Trades') {
          const table = await handle.trades({ side, query, sort, descending, page }); current();
          const open = await handle.openLots(side, openPage); current();
          setTableState({ key: tableKey, handle, table, open, orders: null, busy: false, error: '' }); current();
        } else {
          const orders = await handle.orders(page); current(); setTableState({ key: tableKey, handle, table: null, open: null, orders, busy: false, error: '' }); current();
        }
      } catch (cause) { try { current(); if (!ignoredReportError(cause)) setTableState({ key: tableKey, handle, table: null, open: null, orders: null, busy: false, error: String(cause) }); } catch { /* Stale query. */ } }
    })();
    return () => { if (tableEpoch.current === generation) tableEpoch.current++; };
  }, [handle, tableKey]);
  const selectedTables = tableState.handle === handle && tableState.key === tableKey;
  /** `seed` shapes the fresh Properties draft (the report header's "Custom range…" opens Properties with Custom already chosen). */
  function switchTab(next: Tab, seed?: (config: StrategyConfig) => StrategyConfig) {
    if (!alive()) return;
    rawError(''); rawStatus(''); rawPage(0); rawOpenPage(0);
    if (next === 'Properties') { const fresh = copyStrategyConfig(latest.current.config), value = seed ? seed(fresh) : fresh; draftState.current = { execution: latest.current.execution, config: latest.current.config, value, revision: draftState.current.revision + 1, consumed: false }; rawDraft(value); }
    rawTab(next);
  }
  function setDraft(value: StrategyConfig) {
    if (!alive() || draftState.current.consumed || applyPending.current || draftState.current.revision !== renderDraftRevision) return;
    draftState.current = { ...draftState.current, value, revision: draftState.current.revision + 1 }; rawDraft(value); rawError('');
  }
  /** Load verified saved-report properties as an unapplied draft. Apply remains the only commit path. */
  function loadDraft(saved: StrategyConfig) {
    if (!alive() || applyPending.current) return;
    // The live chart transform is kept. A saved standard-OHLC fill basis is kept only where its control exists (Heikin-Ashi).
    const live = latest.current, chartType = live.execution?.chartType ?? live.config.chartType;
    const value = { ...copyStrategyConfig(saved), chartType: live.config.chartType, fillBasis: chartType === 'heikin-ashi' ? saved.fillBasis : 'chart-prices' as const };
    draftState.current = { execution: live.execution, config: live.config, value, revision: draftState.current.revision + 1, consumed: false };
    rawDraft(value); rawError(''); rawPage(0); rawOpenPage(0); rawTab('Properties'); rawStatus('Saved report properties loaded into an unapplied draft. Review them, then Apply.');
  }
  function cancelEdits() {
    if (!alive() || draftState.current.revision !== renderDraftRevision || draftState.current.consumed || applyPending.current) return;
    draftState.current.revision++; draftState.current.consumed = true; rawDraft(copyStrategyConfig(latest.current.config)); rawError(''); rawTab('Metrics');
  }
  function close() { if (closed.current) return; try { assertUi(); } catch { return; } closed.current = true; retireReport(); client.current?.dispose(); props.onClose(); }
  function apply() {
    if (applyPending.current) return;
    const baseline = draftState.current, live = latest.current;
    try {
      assertUi();
      if (baseline.consumed || baseline.revision !== renderDraftRevision || baseline.execution !== live.execution || baseline.config !== live.config) throw new Error('The execution or strategy properties changed. Reopen Properties and review a fresh draft.');
      // Validate configuration only, without reading or executing any history.
      const checked = backtestStrategy({ bars: [], signals: [], standardBars: [], config: { ...copyStrategyConfig(baseline.value), chartType: live.execution?.chartType ?? baseline.value.chartType } });
      if (!checked.ok) throw new Error(checked.diagnostics.join(' '));
      assertUi(); applyPending.current = true;
      const accepted = live.onChange(copyStrategyConfig(baseline.value));
      if (accepted === false) { assertUi(); throw new Error('The strategy settings were rejected. Your draft remains available.'); }
      // Acceptance deliberately retires the parent's opening config authority.
      // A post-accept assertion on that old config would report a false failure.
      baseline.consumed = true; retireReport();
      if (mounted.current && !closed.current && latest.current.execution === live.execution && latest.current.config === live.config && draftState.current === baseline) {
        setReportState({ ...idle, execution: live.execution, config: live.config }); rawError(''); rawStatus('Strategy properties applied.'); rawTab('Metrics');
      }
    } catch (cause) {
      // Failure publication has the same captured execution/config authority as
      // success. A rejected callback may have reentrantly opened a newer report.
      try { assertUi(); rawError(String(cause)); } catch { /* Retired parent or report. */ }
    }
    finally { applyPending.current = false; }
  }
  /**
   * The report header's date range picker. It applies the applied properties with only the range changed (no
   * draft involved; Properties keeps its own draft path) and reruns the report like Apply does.
   */
  function applyDateRange(range: StrategyDateRange | undefined) {
    if (applyPending.current) return;
    const live = latest.current;
    try {
      assertUi();
      const { dateRange: _old, ...rest } = copyStrategyConfig(live.config), value: StrategyConfig = range ? { ...rest, dateRange: range } : rest;
      const checked = backtestStrategy({ bars: [], signals: [], standardBars: [], config: { ...value, chartType: live.execution?.chartType ?? value.chartType } });
      if (!checked.ok) throw new Error(checked.diagnostics.join(' '));
      applyPending.current = true;
      if (live.onChange(value) === false) { assertUi(); throw new Error('The strategy settings were rejected.'); }
      retireReport();
      if (mounted.current && !closed.current && latest.current.execution === live.execution) { setReportState({ ...idle, execution: live.execution, config: live.config }); rawError(''); rawStatus(`Date range: ${strategyDateRangeLabel(range)}.`); }
    } catch (cause) {
      try { assertUi(); rawError(String(cause)); } catch { /* Retired parent or report. */ }
    }
    finally { applyPending.current = false; }
  }
  async function exportReport(kind: ReportExportKind) {
    const captured = handle, live = latest.current;
    if (!captured || exportPending.current || tab === 'Properties') return;
    try { assertReport(captured, live.execution, live.config); } catch { return; }
    const generation = ++exportEpoch.current; exportPending.current = true; setExportBusy(true); rawError(''); rawStatus('');
    const current = () => { if (generation !== exportEpoch.current) throw new Error('The export request changed.'); assertReport(captured, live.execution, live.config); };
    try {
      const exported = await captured.export(kind, side); current();
      let result: Awaited<ReturnType<NonNullable<typeof window.lv>['exportData']>>;
      if (exported.format === 'xlsx') {
        // The desktop bridge saves workbooks only after its binary export lands.
        const save = workbookExport(); if (!save) throw new Error('XLSX export is unavailable: the desktop save does not accept workbooks yet.');
        if (!exported.data) throw new Error('The workbook export is empty.');
        result = await save({ data: exported.data, format: 'xlsx', suggestedName: 'OpenCandle-strategy-report.xlsx' }); current();
      } else {
        if (!window.lv?.exportData) throw new Error('Local file export is available in the desktop application.');
        result = await window.lv.exportData({ text: exported.text, format: exported.format, suggestedName: 'OpenCandle-strategy-' + kind + (kind === 'trades' ? '-' + side : '') + (exported.format === 'json' ? '.json' : '.csv') }); current();
      }
      if (!result.ok) { if (result.error.code === 'CANCELLED') rawStatus('Export cancelled.'); else throw new Error(result.error.message); }
      else rawStatus('Saved ' + result.value.fileName + '.'); current();
    } catch (cause) { try { current(); if (!ignoredReportError(cause)) rawError(String(cause)); } catch { /* Closed or replaced export. */ } }
    finally { if (generation === exportEpoch.current && alive()) { exportPending.current = false; setExportBusy(false); } }
  }
  function toggleColumn(key: ReportTradeColumn) { setColumns(previous => previous.includes(key) ? previous.length > 1 ? previous.filter(value => value !== key) : previous : REPORT_TRADE_COLUMNS.map(([value]) => value).filter(value => value === key || previous.includes(value))); }
  function cancelCalculation() { if (!alive()) return; retireReport(); setReportState({ ...idle, execution, config, error: 'Report calculation cancelled.' }); }
  function recalculate() { if (alive()) setRetry(value => value + 1); }
  return { tab, setTab, draft, setDraft, error, setError, status, side, setSide, columns, setColumns, columnPanel, setColumnPanel, query, setQuery, sort, setSort, descending, setDescending, page, setPage, openPage, setOpenPage, reportState, reportEpoch, exportBusy, latest, handle, report: handle?.summary ?? null, table: selectedTables ? tableState.table : null, openLots: selectedTables ? tableState.open?.rows ?? [] : [], openLotPage: selectedTables ? tableState.open : null, orders: selectedTables ? tableState.orders : null, tableBusy: selectedTables && tableState.busy, tableError: selectedTables ? tableState.error : '', switchTab, close, apply, cancelEdits, loadDraft, exportReport, toggleColumn, assertReport, cancelCalculation, recalculate, applyDateRange };
}
