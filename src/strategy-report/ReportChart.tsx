import React, { useEffect, useRef, useState } from 'react';
import type { ReportInspection, ReportPlotQuery, ReportPlotResponse, StrategyReportHandle } from './types';
import { ignoredReportError } from './use-report';
import { strategyOrderLabel } from '../domain/strategy';
import {plainErrorText} from '../ui/user-error';

/** The caption names a trade's signals by their readable labels, never generated identities. */
export function reportTradeSignals(trade: { entryOrderId: string; exitOrderId: string; entrySignal?: string; exitSignal?: string }): string {
  return `${trade.entrySignal ?? strategyOrderLabel({ id: trade.entryOrderId })} to ${trade.exitSignal ?? strategyOrderLabel({ id: trade.exitOrderId })}`;
}

const format = (value: number | null, digits = 6) => value === null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: digits });
/**
 * Report chart layer colors: OpenCandle theme tokens (src/ui/styles.css), never fixed reference colors. Each
 * fallback is the LV Medium Dark value, used only where no theme stylesheet is loaded.
 */
export const REPORT_CHART_COLORS = Object.freeze({
  axis: 'var(--lv-border, #3a4152)', label: 'var(--lv-text-secondary, #aab3c5)', cursor: 'var(--lv-text-tertiary, #8a93a6)',
  curve: 'var(--lv-accent, #3cc0cf)', benchmark: 'var(--lv-notice-text, #e9c27a)', drawdown: 'var(--lv-negative-text, #f2736c)',
  favorable: 'var(--lv-positive-text, #4cc795)', adverse: 'var(--lv-negative-text, #f2736c)',
});
/** The separate drawdown layer's query (same percent basis as the main curve, no other layers). */
export function drawdownLayerQuery(percent: boolean): ReportPlotQuery { return { series: 'drawdown', percent, benchmark: false, favorable: false, adverse: false }; }
/** The drawdown layer hangs from the top edge on its own scale, down to DRAWDOWN_BAND px for the deepest drawdown. */
export const DRAWDOWN_BAND = 64;
export function drawdownLayerPath(values: ReportPlotResponse['values'], minimum: number | null, x: (row: number) => number, top = 16): string {
  const depth = minimum !== null && minimum < 0 ? -minimum : 0;
  if (!depth) return '';
  return values.map(point => 'M' + x(point.index) + ',' + top + 'V' + (top + Math.min(1, Math.max(0, -point.value / depth)) * DRAWDOWN_BAND)).join(' ');
}
/** A run-up or drawdown period placed on report rows. */
export interface PeriodSpan { readonly kind: 'growth' | 'decline'; readonly amount: number; readonly percent: number | null; readonly startTime: number; readonly endTime: number; readonly from: number; readonly to: number; readonly largest: boolean }
/**
 * Report row of a bar time, from the analysis' (barIndex, time) rows. Exact when the time is one of them (every row up to
 * 500 rows, RPST_ANALYSIS_ROW_LIMIT); between sampled rows it interpolates by time, within one sample spacing.
 */
export function rowAtTime(points: readonly { barIndex: number; time: number }[], time: number, count: number): number {
  if (!points.length || count < 1) return 0;
  let low = 0, high = points.length; while (low < high) { const middle = (low + high) >> 1; if (points[middle].time < time) low = middle + 1; else high = middle; }
  if (low >= points.length) return Math.min(count - 1, points.at(-1)!.barIndex);
  const next = points[low]; if (next.time === time || low === 0) return Math.min(count - 1, next.barIndex);
  const prior = points[low - 1], share = (time - prior.time) / (next.time - prior.time || 1);
  return Math.min(count - 1, Math.max(0, Math.round(prior.barIndex + share * (next.barIndex - prior.barIndex))));
}
/** Every completed run-up and drawdown period as row spans; the largest of each kind is flagged (the max run-up and drawdown). */
export function periodSpans(periods: readonly { kind: 'growth' | 'decline'; amount: number; percent: number | null; startTime: number; endTime: number }[], points: readonly { barIndex: number; time: number }[], count: number): PeriodSpan[] {
  const largest = { growth: -1, decline: -1 } as Record<'growth' | 'decline', number>;
  periods.forEach((row, index) => { const best = largest[row.kind]; if (best < 0 || row.amount > periods[best].amount) largest[row.kind] = index; });
  return periods.map((row, index) => Object.freeze({ kind: row.kind, amount: row.amount, percent: row.percent, startTime: row.startTime, endTime: row.endTime, from: rowAtTime(points, row.startTime, count), to: rowAtTime(points, row.endTime, count), largest: largest[row.kind] === index }));
}
/** The period under a row: the shortest span holding it (a drawdown inside a longer run-up wins). */
export function periodAtRow(spans: readonly PeriodSpan[], row: number): PeriodSpan | null {
  let found: PeriodSpan | null = null;
  for (const span of spans) if (span.from <= row && row <= span.to && (!found || span.to - span.from < found.to - found.from)) found = span;
  return found;
}
/** A non-zero period percent too small for two decimals reads "<0.01", not "0". */
export const periodPercent = (percent: number) => percent !== 0 && Math.abs(percent) < 0.005 ? '<0.01' : format(Math.abs(percent), 2);
export function periodText(span: PeriodSpan, timezone: string): string {
  const day = (time: number) => new Intl.DateTimeFormat(undefined, { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(time * 1000);
  return `${span.kind === 'growth' ? 'Run-up' : 'Drawdown'}${span.largest ? ' (largest)' : ''}: ${span.kind === 'growth' ? '+' : '-'}${format(span.amount, 2)}${span.percent === null ? '' : ` (${span.kind === 'growth' ? '+' : '-'}${periodPercent(span.percent)}%)`}, ${day(span.startTime)} to ${day(span.endTime)}`;
}
const barTime = (time: number, timezone: string) => new Intl.DateTimeFormat(undefined, { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'shortOffset' }).format(time * 1000);

export function ReportChart({ handle, assertOwner }: { handle: StrategyReportHandle; assertOwner: () => void }) {
  const [series, setSeries] = useState<'equity' | 'closed' | 'drawdown'>('equity'), [percent, setPercent] = useState(false), [benchmark, setBenchmark] = useState(false), [favorable, setFavorable] = useState(false), [adverse, setAdverse] = useState(false), [selected, setSelected] = useState(0);
  const [plot, setPlot] = useState<ReportPlotResponse | null>(null), [inspection, setInspection] = useState<ReportInspection | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const mounted = useRef(true), run = useRef({ handle, running: false }), cache = useRef<{ handle: StrategyReportHandle; key: string; plot: ReportPlotResponse } | null>(null);
  // The drawdown layer over the equity or closed-PnL curve (off by default, its own scale).
  const [drawdownLayer, setDrawdownLayer] = useState(false), [drawdownPlot, setDrawdownPlot] = useState<ReportPlotResponse | null>(null), drawdownCache = useRef<{ handle: StrategyReportHandle; key: string; plot: ReportPlotResponse } | null>(null);
  // Run-up and drawdown period shading (off by default), from the report's completed periods.
  const [periodLayer, setPeriodLayer] = useState(false);
  if (run.current.handle !== handle) run.current = { handle, running: false };
  // Layers that do not apply to the selected curve are masked, so a retained checkbox cannot request an invalid plot.
  const query: ReportPlotQuery = { series, percent, benchmark: benchmark && series !== 'drawdown', favorable: favorable && series === 'closed', adverse: adverse && series === 'closed' }, overlay = drawdownLayer && series !== 'drawdown' ? drawdownLayerQuery(percent) : null, plotKey = JSON.stringify(query), overlayKey = overlay ? JSON.stringify(overlay) : '', key = plotKey + '|' + overlayKey + ':' + selected;
  const latest = useRef({ handle, assertOwner, query, plotKey, overlay, overlayKey, selected, key }); latest.current = { handle, assertOwner, query, plotKey, overlay, overlayKey, selected, key };
  const assertCurrent = () => { if (!mounted.current || latest.current.handle !== handle) throw new Error('The chart changed. Try again.'); assertOwner(); if (!mounted.current || latest.current.handle !== handle) throw new Error('The curve owner changed.'); };
  const interact = (action: () => void) => { try { assertCurrent(); action(); } catch { /* Retired control. */ } };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const operation = run.current;
    if (operation.running || !handle.summary.counts.bars) return;
    operation.running = true;
    void (async () => {
      try {
        assertCurrent(); setBusy(true); setError('');
        for (;;) {
          assertCurrent(); const request = latest.current;
          if (!cache.current || cache.current.handle !== handle || cache.current.key !== request.plotKey) {
            const value = await handle.plot(request.query); assertCurrent(); cache.current = { handle, key: request.plotKey, plot: value };
          }
          if (request.overlay && (!drawdownCache.current || drawdownCache.current.handle !== handle || drawdownCache.current.key !== request.overlayKey)) {
            const value = await handle.plot(request.overlay); assertCurrent(); drawdownCache.current = { handle, key: request.overlayKey, plot: value };
          }
          if (latest.current.key !== request.key) continue;
          setPlot(cache.current.plot); setDrawdownPlot(request.overlay ? drawdownCache.current!.plot : null); assertCurrent();
          const value = await handle.inspect(request.selected); assertCurrent();
          if (latest.current.key !== request.key) continue;
          setInspection(value); setBusy(false); break;
        }
      } catch (cause) { try { assertCurrent(); if (!ignoredReportError(cause)) setError(plainErrorText(cause)); setBusy(false); } catch { /* Retired curve. */ } }
      finally { operation.running = false; }
    })();
  }, [handle, key]);
  const count = handle.summary.counts.bars;
  if (!count) return <p>No equity rows.</p>;
  const index = Math.min(selected, count - 1), point = inspection?.point.barIndex === index ? inspection.point : null, trade = point ? inspection?.trade : null;
  const minimum = plot?.min ?? 0, maximum = plot?.max ?? 0, span = maximum - minimum || 1;
  const x = (row: number) => 12 + row / Math.max(1, count - 1) * 936, y = (value: number) => 188 - (value - minimum) / span * 166;
  const rpst = handle.summary.analysis?.rpst, spans = periodLayer && rpst ? periodSpans(rpst.growthDecline.periods, rpst.margin.points, count) : [], hovered = periodLayer ? periodAtRow(spans, index) : null;
  const path = (values: ReportPlotResponse['values']) => values.map(value => (value.breakBefore ? 'M' : 'L') + x(value.index) + ',' + y(value.value)).join(' ');
  return <div className="strategy-chart">
    <div className="button-row" style={{ flexWrap: 'wrap' }}><label>Curve <select value={series} onChange={event => interact(() => setSeries(event.target.value as typeof series))}><option value="equity">Account equity</option><option value="closed">Cumulative closed PnL</option><option value="drawdown">Close drawdown</option></select></label><label><input type="checkbox" checked={percent} onChange={event => interact(() => setPercent(event.target.checked))} /> {series === 'drawdown' ? 'Percent of prior closing peak' : 'Percent of initial capital'}</label><label><input type="checkbox" disabled={series === 'drawdown'} checked={drawdownLayer} onChange={event => interact(() => setDrawdownLayer(event.target.checked))} /> Drawdown layer</label><label><input type="checkbox" disabled={!rpst} checked={periodLayer} onChange={event => interact(() => setPeriodLayer(event.target.checked))} /> Run-up and drawdown periods</label><label><input type="checkbox" disabled={series === 'drawdown'} checked={benchmark} onChange={event => interact(() => setBenchmark(event.target.checked))} /> Buy-and-hold</label><label><input type="checkbox" disabled={series !== 'closed'} checked={favorable} onChange={event => interact(() => setFavorable(event.target.checked))} /> Favorable gross excursion</label><label><input type="checkbox" disabled={series !== 'closed'} checked={adverse} onChange={event => interact(() => setAdverse(event.target.checked))} /> Adverse gross excursion</label></div>
    {busy && <p role="status">Updating the local report view.</p>}{error && <p role="alert">{error}</p>}
    <svg viewBox="0 0 960 210" role="img" aria-label="Virtual strategy account curve" onMouseMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); if (bounds.width) interact(() => setSelected(Math.max(0, Math.min(count - 1, Math.round(((event.clientX - bounds.left) / bounds.width * 960 - 12) / 936 * (count - 1)))))); }}>
      {spans.map((span, offset) => <rect key={offset} data-period={span.kind} x={x(span.from)} y={16} width={Math.max(2, x(span.to) - x(span.from))} height={172} style={{ fill: span.kind === 'growth' ? REPORT_CHART_COLORS.favorable : REPORT_CHART_COLORS.adverse }} opacity={span === hovered ? 0.3 : span.largest ? 0.2 : 0.1}><title>{periodText(span, handle.summary.context.timezone)}</title></rect>)}
      <path d="M12 188H948" style={{ stroke: REPORT_CHART_COLORS.axis }} />
      {drawdownPlot && !query.series.startsWith('draw') && <path d={drawdownLayerPath(drawdownPlot.values, drawdownPlot.min, x)} style={{ stroke: REPORT_CHART_COLORS.drawdown }} strokeWidth="2" opacity=".35" data-layer="drawdown" />}
      {plot?.excursions.map((item, offset) => <g key={offset}>{item.favorable !== null && <path d={'M' + x(item.index) + ',' + y(0) + 'V' + y(item.favorable)} style={{ stroke: REPORT_CHART_COLORS.favorable }} opacity=".5" />}{item.adverse !== null && <path d={'M' + x(item.index) + ',' + y(0) + 'V' + y(item.adverse)} style={{ stroke: REPORT_CHART_COLORS.adverse }} opacity=".5" />}</g>)}
      <path d={plot ? path(plot.values) : ''} style={{ stroke: REPORT_CHART_COLORS.curve }} fill="none" strokeWidth="2" /><path d={plot ? path(plot.benchmark) : ''} style={{ stroke: REPORT_CHART_COLORS.benchmark }} fill="none" strokeWidth="1.5" /><path d={'M' + x(index) + ',16V192'} style={{ stroke: REPORT_CHART_COLORS.cursor }} strokeDasharray="3 3" />
      <text x="14" y="12" style={{ fill: REPORT_CHART_COLORS.label }} fontSize="10">{format(maximum, 2)}</text><text x="14" y="207" style={{ fill: REPORT_CHART_COLORS.label }} fontSize="10">{format(minimum, 2)}</text>
      {drawdownPlot && !query.series.startsWith('draw') && drawdownPlot.min !== null && drawdownPlot.min < 0 && <text x="946" y="12" textAnchor="end" style={{ fill: REPORT_CHART_COLORS.drawdown }} fontSize="10">Drawdown to {format(drawdownPlot.min, 2)}{percent ? '%' : ''}</text>}
    </svg>
    <label>Inspect row <input aria-label="Inspect strategy report row" type="range" min="0" max={count - 1} step="1" value={index} onChange={event => interact(() => setSelected(Number(event.target.value)))} /></label>
    {periodLayer && <p role="status" data-period-hover="">{hovered ? periodText(hovered, handle.summary.context.timezone) : spans.length ? 'Hover a shaded period for its amount and dates.' : 'No completed run-up or drawdown period.'}{rpst && rpst.growthDecline.omitted > 0 ? ` ${rpst.growthDecline.omitted} later periods are in the report export.` : ''}</p>}
    {point && <p>{barTime(point.time, handle.summary.context.timezone)} | Row {index} | {point.barId} | Equity {format(point.equity)} | Cumulative closed net {format(point.closedNet)} | Drawdown {format(point.drawdown)} ({format(point.drawdownPercent)}%){query.benchmark ? ' | Buy-and-hold equity ' + format(point.buyHoldEquity) : ''}</p>}
    {trade && <p>Latest completed allocation #{trade.number}, {trade.direction}: {reportTradeSignals(trade)}; net {format(trade.netProfit)}; cumulative closed net {format(trade.cumulativeNet)}; favorable {format(trade.favorable.value)}; adverse {format(trade.adverse.value)}.</p>}
    <p className="help">Each curve preserves chronological endpoints and bucket extrema with at most 2,000 displayed points. Row inspection uses every original value. Close drawdown is drawn below zero from each close back to its highest prior close; it is not an intrabar drawdown. The drawdown layer hangs from the top edge on its own scale, deepest drawdown at full depth. Gross excursions exclude fees and are shown separately around zero, up to 1,000 displayed trades. Full detail remains in the table and exports.</p>
  </div>;
}
