import {demoDataLabel} from '../domain/demo-mode';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { BarDataset } from '../domain/types';
import { breadth } from '../market-views/breadth';
import { filterHotSets, hotFilterOptions, hotlist, hotMarketLabel, sortHotRows, type HotRow, type HotSortKey } from '../market-views/hotlists';
import { EXTREME_WINDOWS, breadthFlow, extremes, outperformance } from '../market-views/breadth-extended';
import { RATING_INTERVALS, resampleBars, type RatingInterval } from '../market-views/rating-interval';
import { defaultSeasonalOptions, normalizeValue, seasonalCsv, seasonalTermsLabel, seasonalHover, seasonalRange, seasonalYears, yearFilter, type SeasonalOptions } from '../market-views/seasonal-view';
import { loadFredSeriesList, type FredSeriesState } from '../market-views/fred-views';
import { personalUseNote } from '../domain/live-provider';
import { MacroPanel, YieldPanel } from './MarketMacroPanels';
import { technicalRating, type RatingResult } from '../market-views/rating';
import { dedupeDatasets, resolveScope, scopeChip, scopeLine } from '../market-views/scope';
import { niceTicks, tickLabel } from '../market-views/ticks';
import { InfoTip } from './dialog-extras';
import { MONTHS, seasonals } from '../market-views/seasonals';
import { MARKET_TABS, restoreMarketViews, type MarketTab, type MarketViewsState } from '../market-views/state';
import { Modal } from './Modal';
import { Select } from './Select';
import './market-views.css';

const TAB_LABEL: Record<MarketTab, string> = { gainers: 'Gainers', losers: 'Losers', active: 'Most active', seasonals: 'Seasonals', rating: 'Rating', breadth: 'Breadth', macro: 'Macro maps', yield: 'Yield curves' };
export const fmtNum = (v: number | null, digits = 2) => v === null || !Number.isFinite(v) ? 'n/a' : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtPct = (v: number | null) => v === null || !Number.isFinite(v) ? 'n/a' : (v > 0 ? '+' : '') + v.toFixed(2) + '%';
const fmtVol = (v: number) => v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v));
const sign = (v: number) => v > 0 ? 'up' : v < 0 ? 'down' : '';
const YEAR_COLORS = ['#5b9ff4', '#e6a23c', '#9c6ade', '#e0689a', '#4fb99f', '#c4c957', '#d0775b', '#7aa2c9'];

const HOT_COLUMNS: [HotSortKey, string][] = [['symbol', 'Symbol'], ['last', 'Last'], ['change', 'Change'], ['changePct', 'Change %'], ['volume', 'Volume']];
export function HotTable({ rows, empty, onOpen, onAdd, sortKey = null, sortDir = 'desc', onSort }: { rows: HotRow[]; empty: string; onOpen?: (id: string) => void; onAdd?: (id: string) => void;
  sortKey?: HotSortKey | null; sortDir?: 'asc' | 'desc'; onSort?: (key: HotSortKey | null, dir: 'asc' | 'desc') => void }) {
  if (!rows.length) return <div className="mk-empty">{empty}</div>;
  /* A header click sorts by that column, a second click flips it, a third returns to the ranking. */
  const click = (key: HotSortKey) => { if (!onSort) return; if (sortKey !== key) onSort(key, key === 'symbol' ? 'asc' : 'desc'); else if (sortDir === (key === 'symbol' ? 'asc' : 'desc')) onSort(key, sortDir === 'asc' ? 'desc' : 'asc'); else onSort(null, 'desc'); };
  const shown = sortHotRows(rows, sortKey, sortDir);
  return <table><thead><tr>{HOT_COLUMNS.map(([key, label]) => <th key={key} aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}>
    {onSort ? <button type="button" className="mk-sort" onClick={() => click(key)}>{label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</button> : label}</th>)}
    {(onOpen || onAdd) && <th><span className="lv-sr-only">Actions</span></th>}</tr></thead>
    <tbody>{shown.map(r => <tr key={r.id}>
      <td className="sym">{r.symbol}{r.name && r.name !== r.symbol && <small>{r.name}</small>}</td>
      <td>{fmtNum(r.last)}</td><td className={sign(r.change)}>{(r.change > 0 ? '+' : '') + fmtNum(r.change)}</td>
      <td className={sign(r.changePct)}>{fmtPct(r.changePct)}</td><td>{fmtVol(r.volume)}</td>
      {(onOpen || onAdd) && <td className="act">{onOpen && <button type="button" aria-label={'Open ' + r.symbol} onClick={() => onOpen(r.id)}>Open</button>}{onAdd && <button type="button" aria-label={'Add ' + r.symbol + ' to watchlist'} onClick={() => onAdd(r.id)}>Watch</button>}</td>}
    </tr>)}</tbody></table>;
}


/** Seasonal options (years, normalize, range, legend, hover, export). Without `options` it shows the defaults. */
export function SeasonalChart({ set, options, onOptions, onExport, hoverMonth = null }: { set: BarDataset; options?: Partial<SeasonalOptions>; onOptions?: (o: SeasonalOptions) => void;
  onExport?: (csv: string) => void; hoverMonth?: number | null }) {
  const o: SeasonalOptions = { ...defaultSeasonalOptions(), ...options };
  const allYears = useMemo(() => seasonalYears(set), [set]);
  const s = useMemo(() => seasonals(set, yearFilter(o)), [set, o.start, o.end, o.excluded.join(',')]);
  const [hover, setHover] = useState<number | null>(hoverMonth);
  const [exportNote, setExportNote] = useState('');
  const change = (patch: Partial<SeasonalOptions>) => onOptions?.({ ...o, ...patch });
  const hidden = new Set(o.hidden), toggleHidden = (key: string) => change({ hidden: hidden.has(key) ? o.hidden.filter(x => x !== key) : [...o.hidden, key] });
  const yearOptions = allYears.map(y => ({ value: String(y), label: String(y) }));
  const controls = onOptions && allYears.length > 0 && <div className="mk-bar">
    <Select aria-label="Start year" value={String(o.start ?? allYears[0])} onChange={v => change({ start: Number(v) })} options={yearOptions} />
    <Select aria-label="End year" value={String(o.end ?? allYears[allYears.length - 1])} onChange={v => change({ end: Number(v) })} options={yearOptions} />
    <Select aria-label="Normalize" value={o.normalize} onChange={v => change({ normalize: v === 'index' ? 'index' : 'percent' })} options={[{ value: 'percent', label: 'Percent change' }, { value: 'index', label: 'Indexed to 100' }]} />
    <label><input type="checkbox" checked={o.range} onChange={e => change({ range: e.currentTarget.checked })} /> Show range</label>
    {onExport && <button type="button" onClick={() => { const terms = seasonalTermsLabel(set); setExportNote(terms === null ? '' : personalUseNote(terms)); onExport(seasonalCsv(set.instrument.symbol, s, o, terms)); }}>Export CSV</button>}
    {exportNote && <small role="alert">{exportNote}</small>}
  </div>;
  const yearPicker = onOptions && allYears.length > 0 && <fieldset className="mk-checks"><legend>Years</legend>{allYears.map(y => <label key={y}><input type="checkbox" checked={!o.excluded.includes(y) && yearFilter({ start: o.start, end: o.end, excluded: [] })(y)}
    disabled={!yearFilter({ start: o.start, end: o.end, excluded: [] })(y)} onChange={e => change({ excluded: e.currentTarget.checked ? o.excluded.filter(x => x !== y) : [...o.excluded, y] })} />{y}</label>)}</fieldset>;
  if (s.note) return <>{controls}{yearPicker}<div className="mk-empty">{s.note}</div></>;
  const n = (v: number | null) => normalizeValue(v, o.normalize), unit = o.normalize === 'index' ? '' : '%';
  const band = o.range ? seasonalRange(s) : null, showBand = band && !hidden.has('range');
  const W = 720, H = 300, L = 44, R = 12, T = 12, B = 26;
  const visible = [...s.years.filter(y => !hidden.has(String(y.year))).flatMap(y => y.points), ...(hidden.has('average') ? [] : s.average), ...(hidden.has('median') ? [] : s.median), ...(showBand ? [...band!.low, ...band!.high] : [])]
    .filter((v): v is number => v !== null).map(v => n(v)!);
  const zero = o.normalize === 'index' ? 100 : 0;
  const axis = niceTicks(Math.min(zero, ...visible), Math.max(zero, ...visible), 6), lo = axis.lo, span = axis.hi - axis.lo || 1;
  const x = (m: number) => L + (W - L - R) * m / 11, y = (v: number) => T + (H - T - B) * (1 - (v - lo) / span);
  const path = (pts: (number | null)[]) => pts.map((v, m) => v === null ? null : [m, n(v)!] as const).reduce<string>((d, p, i, arr) => {
    if (!p) return d; const prev = arr[i - 1]; return d + (prev ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); }, '');
  const bandPath = showBand ? (() => { const idx = MONTHS.map((_, m) => m).filter(m => band!.low[m] !== null && band!.high[m] !== null); if (idx.length < 2) return '';
    return 'M' + idx.map(m => x(m).toFixed(1) + ' ' + y(n(band!.high[m])!).toFixed(1)).join('L') + 'L' + [...idx].reverse().map(m => x(m).toFixed(1) + ' ' + y(n(band!.low[m])!).toFixed(1)).join('L') + 'Z'; })() : '';
  const readout = hover === null ? null : seasonalHover(s, hover, o);
  const move = (e: React.MouseEvent<SVGSVGElement>) => { const box = e.currentTarget.getBoundingClientRect(); if (!box.width) return; const px = (e.clientX - box.left) / box.width * W; setHover(Math.max(0, Math.min(11, Math.round((px - L) / ((W - L - R) / 11))))); };
  const legend = (key: string, label: string, swatch: React.CSSProperties) => <button type="button" key={key} className="mk-legend-item" aria-pressed={!hidden.has(key)} onClick={() => onOptions && toggleHidden(key)} disabled={!onOptions}><i style={swatch} />{label}</button>;
  return <>
    {controls}{yearPicker}
    <svg className="mk-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Seasonal ${o.normalize === 'index' ? 'indexed' : 'cumulative percent'} change by month for ${set.instrument.symbol}`} onMouseMove={move} onMouseLeave={() => setHover(null)}>
      {axis.ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--lv-border)" strokeWidth={t === zero ? 1.5 : 0.5} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{tickLabel(t, axis.step)}{unit}</text></g>)}
      {MONTHS.map((m, i) => <text key={m} x={x(i)} y={H - 8} textAnchor="middle">{m}</text>)}
      {bandPath && <path d={bandPath} fill="var(--lv-accent)" opacity={0.12} stroke="none" />}
      {s.years.map((yr, i) => hidden.has(String(yr.year)) ? null : <path key={yr.year} d={path(yr.points)} fill="none" stroke={YEAR_COLORS[i % YEAR_COLORS.length]} strokeWidth={1.2} opacity={0.7} />)}
      {!hidden.has('median') && <path d={path(s.median)} fill="none" stroke="var(--lv-text-primary)" strokeWidth={1.5} strokeDasharray="5 4" />}
      {!hidden.has('average') && <path d={path(s.average)} fill="none" stroke="var(--lv-text-primary)" strokeWidth={2.5} />}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--lv-text-secondary)" strokeDasharray="2 3" />}
    </svg>
    {readout && <div className="mk-readout" role="status" aria-live="polite"><b>{readout.month}</b>{readout.rows.map(r => <span key={r.key}>{r.label} {r.value === null ? 'n/a' : r.value.toFixed(2) + unit}</span>)}</div>}
    <div className="mk-legend">
      {s.years.map((yr, i) => legend(String(yr.year), String(yr.year), { background: YEAR_COLORS[i % YEAR_COLORS.length] }))}
      {legend('average', 'Average', { background: 'var(--lv-text-primary)' })}{legend('median', 'Median', { background: 'transparent', borderTop: '2px dashed var(--lv-text-primary)', height: 0 })}
      {o.range && legend('range', 'Range', { background: 'var(--lv-accent)', opacity: 0.4 })}
    </div>
    <p className="mk-note">{o.normalize === 'index' ? 'Index at each month end, previous December close = 100.' : 'Cumulative % change at each month end, from the previous December close.'} Past seasonality does not predict future moves.<InfoTip label="About seasonals">Built from the {set.bars.length.toLocaleString()} loaded bars of {set.instrument.symbol}{set.provenance.fixture ? ' (SYNTHETIC data)' : ''}. Average, median and range use the selected years; hiding a legend item only hides its line.</InfoTip></p>
  </>;
}

export function RatingGauge({ rating }: { rating: RatingResult }) {
  if (rating.score === null) return <div className="mk-empty">Needs at least {rating.needed} loaded bars; this symbol has {rating.have}.</div>;
  const a = Math.PI * (1 - (rating.score + 1) / 2), cx = 150, cy = 140, r = 110;
  const arc = (f: number, t: number, col: string) => { const p = (u: number) => [cx + r * Math.cos(Math.PI * (1 - u)), cy - r * Math.sin(Math.PI * (1 - u))]; const [x1, y1] = p(f), [x2, y2] = p(t); return <path d={`M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`} stroke={col} strokeWidth={16} fill="none" />; };
  const col = rating.score >= 0.1 ? 'var(--mk-up)' : rating.score <= -0.1 ? 'var(--mk-down)' : 'var(--lv-text-secondary)';
  return <div className="mk-gauge">
    <svg viewBox="0 0 300 170" role="img" aria-label={`Technical rating ${rating.label}, score ${rating.score.toFixed(2)}`}>
      {arc(0, 0.2, '#f23645')}{arc(0.2, 0.4, '#d9857f')}{arc(0.4, 0.6, '#6b7280')}{arc(0.6, 0.8, '#6fb5ab')}{arc(0.8, 1, '#26a69a')}
      <line x1={cx} y1={cy} x2={cx + (r - 24) * Math.cos(a)} y2={cy - (r - 24) * Math.sin(a)} stroke="var(--lv-text-primary)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill="var(--lv-text-primary)" />
      <text x={20} y={164} fontSize={11} fill="var(--lv-text-secondary)">Sell</text><text x={280} y={164} fontSize={11} textAnchor="end" fill="var(--lv-text-secondary)">Buy</text>
    </svg>
    <div><div className="big" style={{ color: col }}>{rating.label}</div>
      <dl><dt>Score</dt><dd>{rating.score.toFixed(2)}</dd><dt>Moving averages</dt><dd>{rating.groups.average === null ? 'n/a' : rating.groups.average.toFixed(2)}</dd>
        <dt>Oscillators</dt><dd>{rating.groups.oscillator === null ? 'n/a' : rating.groups.oscillator.toFixed(2)}</dd>
        <dt>Buy / Neutral / Sell</dt><dd>{rating.buy} / {rating.neutral} / {rating.sell}</dd></dl></div>
  </div>;
}


/** Every indicator that voted, its last value and its vote. */
export function RatingConstituents({ rating }: { rating: RatingResult }) {
  if (!rating.votes.length) return null;
  const word = (v: number) => v > 0 ? 'Buy' : v < 0 ? 'Sell' : 'Neutral';
  return <table className="mk-votes"><thead><tr><th>Indicator</th><th>Group</th><th>Value</th><th>Action</th></tr></thead>
    <tbody>{rating.votes.map(v => <tr key={v.name}><td>{v.name}</td><td>{v.group === 'average' ? 'Moving average' : 'Oscillator'}</td><td>{fmtNum(v.value)}</td><td className={v.vote > 0 ? 'up' : v.vote < 0 ? 'down' : ''}>{word(v.vote)}</td></tr>)}</tbody></table>;
}

const fmtCount = (v: number | null, digits = 0) => v === null || !Number.isFinite(v) ? 'n/a' : v.toFixed(digits);
export function BreadthPanel({ sets, benchmarks, benchmarkId = null, onBenchmark }: { sets: BarDataset[]; benchmarks?: readonly BarDataset[]; benchmarkId?: string | null; onBenchmark?: (id: string | null) => void }) {
  const b = useMemo(() => breadth(sets), [sets]);
  const flow = useMemo(() => breadthFlow(sets), [sets]);
  const ext = useMemo(() => EXTREME_WINDOWS.map(w => extremes(sets, w)), [sets]);
  const pool = benchmarks ?? sets, bench = (benchmarkId && pool.find(d => d.instrument.id === benchmarkId)) || null;
  const perf = useMemo(() => [outperformance(sets, bench, '1M'), outperformance(sets, bench, '3M')], [sets, bench]);
  const total = b.advancers + b.decliners + b.unchanged;
  const seg = (n: number) => total ? n / total * 100 + '%' : '0%';
  return <>
    <div><div className="mk-split" role="img" aria-label={`${b.advancers} advancers, ${b.decliners} decliners, ${b.unchanged} unchanged`}>
      <i style={{ width: seg(b.advancers), background: 'var(--mk-up)' }} /><i style={{ width: seg(b.unchanged), background: 'var(--lv-text-disabled)' }} /><i style={{ width: seg(b.decliners), background: 'var(--mk-down)' }} /></div></div>
    <div className="mk-tiles">
      <div className="mk-tile"><b className="up">{b.advancers}</b><span>Advancers</span></div>
      <div className="mk-tile"><b className="down">{b.decliners}</b><span>Decliners</span></div>
      <div className="mk-tile"><b>{b.unchanged}</b><span>Unchanged</span></div>
      <div className="mk-tile"><b className={sign(flow.net)}>{(flow.net > 0 ? '+' : '') + flow.net}</b><span>Net advancers</span><small>{flow.measured} measured of {flow.scoped}</small></div>
      <div className="mk-tile"><b>{flow.ratio === null ? 'n/a' : flow.ratio.toFixed(2)}</b><span>Advance/decline ratio</span>{flow.ratioNote && <small>{flow.ratioNote}</small>}</div>
      <div className="mk-tile"><b className="up">{flow.upShare === null ? 'n/a' : flow.upShare.toFixed(0) + '%'}</b><span>Up volume</span><small>{fmtVol(flow.upVolume)}, volume known for {flow.volumeKnown} of {flow.measured}</small></div>
      <div className="mk-tile"><b className="down">{flow.downShare === null ? 'n/a' : flow.downShare.toFixed(0) + '%'}</b><span>Down volume</span><small>{fmtVol(flow.downVolume)}, decliners plus unchanged</small></div>
      {b.above.map(row => <div className="mk-tile" key={row.period}><b>{row.pct === null ? 'n/a' : row.pct.toFixed(0) + '%'}</b><span>Above SMA {row.period}</span><small>{row.above} of {row.eligible}</small>
        <div className="mk-meter"><i style={{ width: (row.pct ?? 0) + '%' }} /></div></div>)}
      <div className="mk-tile"><b className="up">{b.highLow.highs}</b><span>New {b.highLow.window}-bar highs</span><small>of {b.highLow.eligible}</small></div>
      <div className="mk-tile"><b className="down">{b.highLow.lows}</b><span>New {b.highLow.window}-bar lows</span><small>of {b.highLow.eligible}</small></div>
    </div>
    <table className="mk-extremes" aria-label="New highs and lows"><thead><tr><th>New highs and lows</th><th>Highs</th><th>Lows</th><th>Net % of all</th><th>Covered</th></tr></thead>
      <tbody>{ext.map(r => <tr key={r.window}><td>{r.window}</td><td className="up">{r.highs}</td><td className="down">{r.lows}</td><td>{r.net === null ? 'n/a' : (r.net > 0 ? '+' : '') + r.net.toFixed(1) + '%'}</td><td>{r.eligible} of {r.scoped}</td></tr>)}</tbody></table>
    <div className="mk-bar"><Select aria-label="Benchmark" value={bench?.instrument.id ?? ''} onChange={v => onBenchmark?.(v || null)} disabled={!onBenchmark}
      options={[{ value: '', label: 'Choose a benchmark' }, ...pool.map(d => ({ value: d.instrument.id, label: d.instrument.symbol }))]} /></div>
    <table className="mk-perf" aria-label="Outperformance"><thead><tr><th>Outperformance</th><th>Benchmark</th><th>Beat it</th><th>Mean return</th><th>Equal-weight spread</th></tr></thead>
      <tbody>{perf.map(r => <tr key={r.window}><td>{r.window}</td>{r.reason ? <td colSpan={4} className="note">{r.reason}</td> : <>
        <td>{r.benchmark} {fmtPct(r.benchmarkReturn)}</td><td>{r.outperform} of {r.eligible} ({fmtCount(r.pct)}%)</td><td>{fmtPct(r.meanReturn)}</td>
        <td className={sign(r.spread ?? 0)}>{r.spread === null ? 'n/a' : (r.spread > 0 ? '+' : '') + r.spread.toFixed(2) + ' pp'}</td></>}</tr>)}</tbody></table>
    <p className="mk-note">Counts include only symbols with enough loaded bars.<InfoTip label="About breadth">Each count only includes symbols with enough loaded bars; the "of N" under each tile says how many that was. Volume uses the last bar. New highs and lows over 1W to 1Y compare the last bar with the earlier bars inside that calendar window and need history back to its start; ties count. Outperformance needs a benchmark you choose; it is never assumed.</InfoTip></p>
  </>;
}

export function MarketViewsDialog({ datasets, watchSymbols, state, onChange, onOpen, onAddToWatchlist, onClose, fredBridge, fredEnabled = true }: {
  datasets: readonly BarDataset[]; watchSymbols?: readonly string[]; state?: MarketViewsState; onChange?: (state: MarketViewsState) => void;
  onOpen?: (dataset: BarDataset) => void; onAddToWatchlist?: (dataset: BarDataset) => void; onClose: () => void;
  /** The desktop bridge for on-demand FRED loads (Macro maps, Yield curves) and the Allow FRED downloads setting. */
  fredBridge?: unknown; fredEnabled?: boolean;
}) {
  const [local, setLocal] = useState(() => restoreMarketViews(state));
  const view = state ? restoreMarketViews(state) : local;
  const set = (patch: Partial<MarketViewsState>) => { const next = { ...view, ...patch }; setLocal(next); onChange?.(next); };
  const scope = useMemo(() => resolveScope(datasets, view.scope, watchSymbols), [datasets, view.scope, watchSymbols]);
  const byId = useMemo(() => new Map(scope.datasets.map(d => [d.instrument.id, d])), [scope]);
  const picked = (view.symbolId && byId.get(view.symbolId)) || scope.datasets[0] || null;
  const isHot = view.tab === 'gainers' || view.tab === 'losers' || view.tab === 'active';
  const market = view.hotMarket ?? 'all', exchange = view.hotExchange ?? 'all';
  const filters = useMemo(() => hotFilterOptions(scope.datasets, market), [scope, market]);
  const hotSets = useMemo(() => isHot ? filterHotSets(scope.datasets, market, exchange) : [], [isHot, scope, market, exchange]);
  const hot = isHot ? hotlist(hotSets, view.tab as 'gainers' | 'losers' | 'active') : null;
  const interval: RatingInterval = view.ratingInterval ?? 'loaded';
  const rated = useMemo(() => view.tab === 'rating' && picked ? resampleBars(picked.bars, interval) : null, [view.tab, picked, interval]);
  const rating = useMemo(() => rated && !rated.reason ? technicalRating(rated.bars) : null, [rated]);
  const fredTab = view.tab === 'macro' || view.tab === 'yield';
  const single = view.tab === 'seasonals' || view.tab === 'rating';
  const eligible = single ? (picked ? 1 : 0) : view.tab === 'breadth' ? scope.datasets.filter(d => d.bars.length >= 2).length : hot?.eligible ?? 0;
  const line = single ? `Viewing 1 of ${scope.datasets.length} ${view.scope === 'watchlist' ? 'watchlist' : 'loaded'} symbols. Not market-wide: only symbols loaded in this workspace are available.` : scopeLine(scope, eligible);
  const open = (id: string) => { const d = byId.get(id); if (d && onOpen) onOpen(d); };
  const add = (id: string) => { const d = byId.get(id); if (d && onAddToWatchlist) onAddToWatchlist(d); };
  const synthetic = scope.datasets.some(d => d.provenance.fixture);
  const [fred, setFred] = useState<Map<string, FredSeriesState>>(() => new Map());
  const [fredBusy, setFredBusy] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const loadFred = (ids: string[]) => { if (fredBusy || !ids.length) return; setFredBusy(`Loading 0 of ${ids.length} series...`);
    void loadFredSeriesList(fredBridge, fredEnabled, ids, datasets, (s, done, total) => { if (!alive.current) return; setFred(prev => new Map(prev).set(s.id, s)); setFredBusy(`Loaded ${done} of ${total} series...`); }, () => alive.current)
      .finally(() => { if (alive.current) setFredBusy(null); }); };
  const hasWindow = typeof window !== 'undefined' && !!(window as unknown as { lv?: { exportData?: unknown } }).lv?.exportData;
  const saveCsv = (csv: string, name: string) => { const lv = (window as unknown as { lv?: { exportData?: (v: { text: string; suggestedName: string; format: 'csv' }) => Promise<unknown> } }).lv;
    if (lv?.exportData) void lv.exportData({ text: csv, suggestedName: name.replace(/[^A-Za-z0-9._-]/g, '_') + '.csv', format: 'csv' }); };
  const exportSeasonal = (csv: string) => saveCsv(csv, 'OpenCandle-seasonals-' + (picked?.instrument.symbol ?? 'symbol'));
  const fredProps = { view, set, fred, busy: fredBusy, enabled: fredEnabled, available: !!fredBridge && typeof (fredBridge as { fetchFredSeries?: unknown }).fetchFredSeries === 'function', onLoad: loadFred, ...(hasWindow ? { onExport: saveCsv } : {}) };
  const seasonOptions: SeasonalOptions = { start: view.seasonStart ?? null, end: view.seasonEnd ?? null, excluded: view.seasonExcluded ?? [], normalize: view.seasonNormalize ?? 'percent', range: view.seasonRange ?? false, hidden: view.seasonHidden ?? [] };
  return <Modal title="Markets" onClose={onClose} wide>
    <div className="lv-markets"><div className="mk-body">
      {!fredTab && <div className="mk-bar">
        <Select aria-label="Symbol scope" value={view.scope} onChange={v => set({ scope: v === 'watchlist' ? 'watchlist' : 'loaded' })}
          options={[{ value: 'loaded', label: 'All loaded symbols' }, { value: 'watchlist', label: 'Current watchlist', disabled: !watchSymbols }]} />
        {single && <Select aria-label="Symbol" value={picked?.instrument.id ?? ''} onChange={v => set({ symbolId: v })} disabled={!scope.datasets.length}
          options={scope.datasets.map(d => ({ value: d.instrument.id, label: d.instrument.name && d.instrument.name !== d.instrument.symbol ? d.instrument.symbol + ' - ' + d.instrument.name : d.instrument.symbol }))} />}
        {isHot && <Select aria-label="Market" value={market} onChange={v => set({ hotMarket: v, hotExchange: 'all' })} options={[{ value: 'all', label: 'All markets' }, ...filters.markets.map(m => ({ value: m, label: hotMarketLabel(m) }))]} />}
        {isHot && <Select aria-label="Exchange" value={exchange} onChange={v => set({ hotExchange: v })} options={[{ value: 'all', label: 'All exchanges' }, ...filters.exchanges.map(x => ({ value: x, label: x }))]} />}
        {view.tab === 'rating' && <Select aria-label="Interval" value={interval} onChange={v => set({ ratingInterval: v as RatingInterval })}
          options={RATING_INTERVALS.map(i => ({ value: i, label: i === 'loaded' ? 'As loaded' + (picked ? ' (' + picked.resolution + ')' : '') : i === '1W' ? 'Weekly, grouped' : 'Monthly, grouped' }))} />}
      </div>}
      <div className="mk-tabs" role="tablist" aria-label="Market views">{MARKET_TABS.map(t => <button key={t} type="button" role="tab" aria-selected={view.tab === t} onClick={() => set({ tab: t })}>{TAB_LABEL[t]}</button>)}</div>
      {!fredTab && <p className="mk-scope" role="status" data-testid="markets-scope"><span className="mk-chip">{scopeChip(scope, single)}</span>{synthetic && <span className="synthetic-badge">{demoDataLabel()}</span>}{scope.missingWatch.length > 0 && <span>Not loaded: <strong>{scope.missingWatch.join(', ')}</strong></span>}<InfoTip label="About this scope" className="lv-info-end">{line}{synthetic && ' Includes SYNTHETIC demo data.'}</InfoTip></p>}
      {!fredTab && !scope.datasets.length && <div className="mk-empty">No symbols to show. Load data or add symbols to your watchlist first.</div>}
      {scope.datasets.length > 0 && hot && <HotTable rows={hot.rows} onOpen={onOpen ? open : undefined} onAdd={onAddToWatchlist ? add : undefined}
        sortKey={(view.hotSort ?? null) as HotSortKey | null} sortDir={view.hotDir ?? 'desc'} onSort={(key, dir) => set({ hotSort: key, hotDir: dir })}
        empty={!hotSets.length ? 'No loaded symbol matches this market and exchange.' : hot.eligible ? `No loaded symbol is ${view.tab === 'gainers' ? 'up' : 'down'} on its latest bar.` : 'Each symbol needs at least two loaded bars.'} />}
      {picked && view.tab === 'seasonals' && <SeasonalChart set={picked} options={seasonOptions} onExport={hasWindow ? exportSeasonal : undefined}
        onOptions={o => set({ seasonStart: o.start, seasonEnd: o.end, seasonExcluded: [...o.excluded], seasonHidden: [...o.hidden], seasonNormalize: o.normalize, seasonRange: o.range })} />}
      {picked && rated?.reason && <div className="mk-empty">{rated.reason}</div>}
      {picked && rating && <><RatingGauge rating={rating} /><RatingConstituents rating={rating} /></>}
      {scope.datasets.length > 0 && view.tab === 'breadth' && <BreadthPanel sets={scope.datasets} benchmarks={dedupeDatasets(datasets)} benchmarkId={view.benchmarkId ?? null} onBenchmark={id => set({ benchmarkId: id })} />}
      {view.tab === 'macro' && <MacroPanel {...fredProps} />}
      {view.tab === 'yield' && <YieldPanel {...fredProps} />}
    </div></div>
  </Modal>;
}
