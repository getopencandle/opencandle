import React, { useState } from 'react';
import type { Bar } from '../domain/types';
import { FRED_EXPORT_NOTICE } from '../domain/live-provider';
import { FRED_OFF_NOTICE, isoDate, parseIsoDate, type FredSeriesState } from '../market-views/fred-views';
import { MACRO_COUNTRIES, MACRO_DATASETS, MAP_COLS, MAP_ROWS, colorScale, macroHoverText, macroMonths, macroRows, macroSourceLine, metricOf, metricsOf, type MacroCompare, type MacroScale } from '../market-views/macro';
import { DEFAULT_MATURITIES, MATURITIES, SPREADS, YIELD_COUNTRIES, YIELD_COUNTRY_UNAVAILABLE, curveAt, latestCurveTime, monthsBefore, pickMaturities, spreadOf, type Curve } from '../market-views/yield-curve';
import type { MarketViewsState } from '../market-views/state';
import { niceTicks, tickLabel } from '../market-views/ticks';
import { Select } from './Select';

/** Macro maps and Yield curves tabs of the Markets dialog. Data: FRED on demand only (see market-views/fred-views). */
export interface FredPanelProps {
  view: MarketViewsState; set: (patch: Partial<MarketViewsState>) => void;
  fred: ReadonlyMap<string, FredSeriesState>; busy: string | null; enabled: boolean; available: boolean;
  onLoad: (ids: string[]) => void;
  /** Test seam: the country or month the pointer is over. */
  hover?: string | null;
}
const seriesView = (fred: ReadonlyMap<string, FredSeriesState>) => {
  const m = new Map<string, readonly Bar[] | null>(); for (const [id, s] of fred) m.set(id, s.status === 'missing' ? null : s.bars); return m;
};
const f2 = (v: number | null) => v === null || !Number.isFinite(v) ? 'n/a' : v.toFixed(2);
function LoadBar({ ids, label, fred, busy, enabled, available, onLoad }: { ids: string[]; label: string } & Pick<FredPanelProps, 'fred' | 'busy' | 'enabled' | 'available' | 'onLoad'>) {
  const todo = ids.filter(id => fred.get(id)?.status !== 'ready' && fred.get(id)?.status !== 'stale');
  const notices = [...new Set(ids.map(id => fred.get(id)?.notice).filter((x): x is string => !!x && x !== FRED_OFF_NOTICE))].slice(0, 3);
  return <div className="mk-load">
    <button type="button" disabled={!!busy || !todo.length || !available} onClick={() => onLoad(todo)}>{todo.length ? `${label} (${todo.length} series)` : 'All selected series loaded'}</button>
    <span role="status" aria-live="polite">{busy ?? (!available ? 'FRED data needs the desktop app.' : !enabled ? FRED_OFF_NOTICE : 'Downloads only when you press load, one small series at a time, saved for a day.')}</span>
    {notices.map(n => <small key={n}>{n}</small>)}
  </div>;
}
function ExportRefused() {
  const [said, setSaid] = useState(false);
  return <span className="mk-export"><button type="button" onClick={() => setSaid(true)}>Export</button>{said && <small role="alert">{FRED_EXPORT_NOTICE}</small>}</span>;
}

export function MacroPanel(p: FredPanelProps) {
  const { view, set } = p;
  const dataset = MACRO_DATASETS.some(d => d.key === view.macroDataset) ? view.macroDataset! : 'labor';
  const metrics = metricsOf(dataset), metric = metrics.find(m => m.key === view.macroMetric) ?? metrics[0];
  const compare: MacroCompare = view.macroCompare ?? 'none', scaleMode: MacroScale = view.macroScale ?? 'linear', period = view.macroPeriod ?? 'latest';
  const series = seriesView(p.fred), ids = MACRO_COUNTRIES.map(c => metric.series(c.code));
  const metricSeries = new Map(ids.filter(id => series.has(id)).map(id => [id, series.get(id)!]));
  const rows = macroRows(series, metric, period, compare), months = macroMonths(metricSeries);
  const scale = colorScale(rows.map(r => compare === 'none' ? r.value : r.change), scaleMode, compare !== 'none');
  const [hoverCode, setHover] = useState<string | null>(p.hover ?? null);
  const focus = view.macroCountry && MACRO_COUNTRIES.some(c => c.code === view.macroCountry) ? view.macroCountry : null;
  const shown = rows.find(r => r.code === (hoverCode ?? focus));
  const W = 34, G = 3;
  const sorted = [...rows].sort((a, b) => (b.value === null ? -1 : 0) - (a.value === null ? -1 : 0) || (b.value ?? 0) - (a.value ?? 0) || a.name.localeCompare(b.name));
  return <div className="mk-macro">
    <div className="mk-bar">
      <Select aria-label="Dataset" value={dataset} onChange={v => set({ macroDataset: v, macroMetric: metricsOf(v)[0]?.key })} options={MACRO_DATASETS.map(d => ({ value: d.key, label: d.label }))} />
      <Select aria-label="Metric" value={metric.key} onChange={v => set({ macroMetric: v })} options={metrics.map(m => ({ value: m.key, label: m.label }))} />
      <Select aria-label="Period" value={period} onChange={v => set({ macroPeriod: v })} options={[{ value: 'latest', label: 'Latest month per country' }, ...(months.includes(period) || period === 'latest' ? [] : [{ value: period, label: period }]), ...months.map(m => ({ value: m, label: m }))]} />
      <Select aria-label="Compare" value={compare} onChange={v => set({ macroCompare: v as MacroCompare })} options={[{ value: 'none', label: 'No comparison' }, { value: '1M', label: 'Change vs 1 month earlier' }, { value: '12M', label: 'Change vs 12 months earlier' }]} />
      <Select aria-label="Color scale" value={scaleMode} onChange={v => set({ macroScale: v as MacroScale })} options={[{ value: 'linear', label: 'Equal steps' }, { value: 'quantile', label: 'Equal counts (quantiles)' }]} />
      <Select aria-label="Country" value={focus ?? ''} onChange={v => set({ macroCountry: v })} options={[{ value: '', label: 'Highlight a country' }, ...MACRO_COUNTRIES.map(c => ({ value: c.code, label: c.name }))]} />
    </div>
    <LoadBar ids={ids} label={'Load ' + metric.label.toLowerCase()} {...p} />
    <svg className="mk-map" viewBox={`0 0 ${MAP_COLS * (W + G)} ${MAP_ROWS * (W + G)}`} role="img" aria-label={`Tile map of ${metric.label} by country`} onMouseLeave={() => setHover(null)}>
      {MACRO_COUNTRIES.map(c => { const r = rows.find(x => x.code === c.code)!, v = compare === 'none' ? r.value : r.change;
        return <g key={c.code} transform={`translate(${c.col * (W + G)} ${c.row * (W + G)})`} onMouseEnter={() => setHover(c.code)} onClick={() => set({ macroCountry: c.code })} data-code={c.code}>
          <title>{macroHoverText(r, metric, compare)}</title>
          <rect width={W} height={W} rx={4} fill={scale.colorOf(v)} stroke={c.code === focus ? 'var(--lv-text-primary)' : 'var(--lv-border)'} strokeWidth={c.code === focus ? 2 : 1} />
          <text x={W / 2} y={W / 2 - 2} textAnchor="middle">{c.code}</text><text x={W / 2} y={W / 2 + 10} textAnchor="middle" className="v">{v === null ? '' : f2(v)}</text>
        </g>; })}
    </svg>
    <p className="mk-readout" aria-live="polite">{shown ? macroHoverText(shown, metric, compare) : 'Point at a country for its value; click to highlight it.'}</p>
    {scale.bins.length > 0 && <div className="mk-legend" aria-label="Color scale">{scale.bins.map((b, i) => <span key={i}><i className="sw" style={{ background: b.color }} />{f2(b.from)} to {f2(b.to)}{compare === 'none' ? metric.units : ' pp'}</span>)}<span><i className="sw" style={{ background: 'var(--lv-bg-pill)' }} />Not available</span></div>}
    <table><thead><tr><th>Country</th><th>{metric.label}</th><th>Month</th>{compare !== 'none' && <><th>Earlier</th><th>Change (pp)</th></>}<th>Note</th></tr></thead>
      <tbody>{sorted.map(r => <tr key={r.code} className={r.code === focus ? 'focus' : undefined}><td>{r.name}</td><td>{f2(r.value)}</td><td>{r.month ?? ''}</td>
        {compare !== 'none' && <><td>{f2(r.previous)}</td><td className={r.change === null ? '' : r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}>{r.change === null ? 'n/a' : (r.change > 0 ? '+' : '') + f2(r.change)}</td></>}
        <td className="note">{r.reason ?? ''}</td></tr>)}</tbody></table>
    <p className="mk-note">{macroSourceLine(metricSeries, metric)}<ExportRefused /></p>
  </div>;
}

const CURVE_STROKES = ['var(--lv-accent)', 'var(--lv-text-secondary)', 'var(--lv-positive-text)', 'var(--lv-negative-text)'];
export function YieldCurveChart({ curves, keys }: { curves: Curve[]; keys: string[] }) {
  const ms = pickMaturities(keys), vals = curves.flatMap(c => c.points.map(p => p.value)).filter((v): v is number => v !== null);
  if (!ms.length) return <div className="mk-empty">Select at least one maturity.</div>;
  if (!vals.length) return <div className="mk-empty">No yields loaded for the chosen date yet. Press load above.</div>;
  const W = 720, H = 260, L = 44, R = 16, T = 12, B = 26, axis = niceTicks(Math.min(...vals), Math.max(...vals), 5), span = axis.hi - axis.lo || 1;
  const x = (i: number) => L + (W - L - R) * (ms.length === 1 ? 0.5 : i / (ms.length - 1)), y = (v: number) => T + (H - T - B) * (1 - (v - axis.lo) / span);
  return <svg className="mk-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Yield curve for ${curves.map(c => c.date).join(', ')}`}>
    {axis.ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--lv-border)" strokeWidth={0.5} /><text x={L - 6} y={y(t) + 4} textAnchor="end">{tickLabel(t, axis.step)}%</text></g>)}
    {ms.map((m, i) => <text key={m.key} x={x(i)} y={H - 8} textAnchor="middle">{m.label}</text>)}
    {curves.map((c, ci) => { const pts = c.points.map((p, i) => p.value === null ? null : [x(i), y(p.value)] as const);
      const d = pts.reduce<string>((s, p, i) => p ? s + (pts[i - 1] ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) : s, '');
      return <g key={c.date + ci}><path d={d} fill="none" stroke={CURVE_STROKES[ci % 4]} strokeWidth={ci ? 1.5 : 2.5} strokeDasharray={ci ? '5 4' : undefined} />
        {c.points.map((p, i) => p.value === null ? null : <circle key={p.key} cx={x(i)} cy={y(p.value)} r={3} fill={CURVE_STROKES[ci % 4]}><title>{`${p.label} ${f2(p.value)}% on ${p.date}`}</title></circle>)}</g>; })}
  </svg>;
}

export function YieldPanel(p: FredPanelProps) {
  const { view, set } = p;
  const keys = view.yieldMaturities?.length ? view.yieldMaturities.filter(k => MATURITIES.some(m => m.key === k)) : [...DEFAULT_MATURITIES];
  const series = new Map<string, readonly Bar[]>(); for (const [id, s] of p.fred) if (s.bars.length) series.set(id, s.bars);
  const latest = latestCurveTime(series, keys), chosen = view.yieldDate ? parseIsoDate(view.yieldDate) : latest;
  const compare = view.yieldCompare ?? [], spread = SPREADS.find(s => s.key === view.yieldSpread) ?? SPREADS[0];
  const curves = chosen === null ? [] : [curveAt(series, keys, chosen), ...compare.map(d => parseIsoDate(d)).filter((t): t is number => t !== null).map(t => curveAt(series, keys, t))];
  const [custom, setCustom] = useState('');
  const addCompare = (time: number | null) => { if (time === null) return; const d = isoDate(time); if (!compare.includes(d) && compare.length < 3) set({ yieldCompare: [...compare, d] }); };
  const toggle = (k: string) => set({ yieldMaturities: keys.includes(k) ? keys.filter(x => x !== k) : MATURITIES.filter(m => keys.includes(m.key) || m.key === k).map(m => m.key) });
  const ids = pickMaturities(keys).map(m => m.series);
  const loaded = ids.filter(id => series.has(id)).map(id => { const s = p.fred.get(id)!; return `${id} to ${isoDate(s.bars[s.bars.length - 1].time)}${s.status === 'stale' ? ' (saved copy)' : ''}`; });
  return <div className="mk-yield">
    <div className="mk-bar">
      <Select aria-label="Country" value="US" onChange={() => {}} options={YIELD_COUNTRIES.map(c => ({ value: c.code, label: c.available ? c.label : c.label + ' (not available from local sources)', disabled: !c.available }))} />
      <label>Date <input type="date" aria-label="Curve date" value={view.yieldDate ?? (latest === null ? '' : isoDate(latest))} onChange={e => set({ yieldDate: e.currentTarget.value || null })} /></label>
      <Select aria-label="Spread" value={spread.key} onChange={v => set({ yieldSpread: v })} options={SPREADS.map(s => ({ value: s.key, label: s.long + ' minus ' + s.short }))} />
    </div>
    <p className="mk-note">{YIELD_COUNTRY_UNAVAILABLE}</p>
    <fieldset className="mk-checks"><legend>Maturities</legend>{MATURITIES.map(m => <label key={m.key}><input type="checkbox" checked={keys.includes(m.key)} onChange={() => toggle(m.key)} />{m.label}</label>)}</fieldset>
    <LoadBar ids={ids} label="Load curve data" {...p} />
    <div className="mk-bar"><span>Compare with:</span>
      <button type="button" disabled={chosen === null || compare.length >= 3} onClick={() => addCompare(chosen === null ? null : monthsBefore(chosen, 1))}>1 month earlier</button>
      <button type="button" disabled={chosen === null || compare.length >= 3} onClick={() => addCompare(chosen === null ? null : monthsBefore(chosen, 12))}>1 year earlier</button>
      <input type="date" aria-label="Comparison date" value={custom} onChange={e => setCustom(e.currentTarget.value)} />
      <button type="button" disabled={!parseIsoDate(custom) || compare.length >= 3} onClick={() => { addCompare(parseIsoDate(custom)); setCustom(''); }}>Add date</button>
      {compare.map(d => <span className="mk-chip" key={d}>{d}<button type="button" aria-label={'Remove ' + d} onClick={() => set({ yieldCompare: compare.filter(x => x !== d) })}>x</button></span>)}
    </div>
    <YieldCurveChart curves={curves} keys={keys} />
    {curves.length > 0 && <div className="mk-legend">{curves.map((c, i) => <span key={c.date + i}><i style={{ background: CURVE_STROKES[i % 4] }} />{c.date}{c.missing.length ? ` (no value: ${c.missing.join(', ')})` : ''}</span>)}</div>}
    {curves.length > 0 && <table><thead><tr><th>Date</th>{pickMaturities(keys).map(m => <th key={m.key}>{m.label}</th>)}<th>{spread.long} minus {spread.short}</th></tr></thead>
      <tbody>{curves.map((c, i) => { const s = spreadOf(c, spread); return <tr key={c.date + i}><td>{c.date}</td>{c.points.map(pt => <td key={pt.key} title={pt.date ? 'Value from ' + pt.date : 'No value within 7 days'}>{f2(pt.value)}</td>)}
        <td title={s.reason ?? undefined}>{s.value === null ? 'n/a' : `${s.value > 0 ? '+' : ''}${f2(s.value)} pp (${Math.round(s.value * 100)} bp)`}</td></tr>; })}</tbody></table>}
    <p className="mk-note">Source: FRED (St. Louis Fed), Treasury constant maturity yields, percent. {loaded.length ? 'Loaded: ' + loaded.join(', ') + '.' : 'Nothing loaded yet.'} A point uses the last value on or before the date, up to 7 days older.<ExportRefused /></p>
  </div>;
}
