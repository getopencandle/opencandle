import React, { useMemo, useState } from 'react';
import { chooseIntervalSource, createIntervalMenuState, DEFAULT_AGGREGATION_POLICY, editIntervalMenu, intervalDatasetKey, intervalLabel, intervalMenuEntries, listIntervalSources, parseInterval, restoreIntervalMenuState, type IntervalMenuAction, type IntervalMenuState, type IntervalSuccess } from '../domain/intervals';
import type { BarDataset } from '../domain/types';
import { Modal } from './Modal';
import { shortIntervalText } from './interval-display';
import { demoDataMode } from '../domain/demo-mode';
import { finestIntervalSource, liveShapeOf, resolveIntervalSwitch } from '../domain/interval-switch';
import { looksLikeRangeInterval, parseRangeInterval, rangeIntervalId } from '../chart/range-interval';
import type { IntervalSpec } from '../domain/intervals';
import {plainErrorText} from './user-error';

function safeId(value: string) { try { return parseInterval(value).id; } catch { return ''; } }

/** Parent commits the returned dataset and menu together; preview never inserts a dataset. */
export function IntervalDialog({ datasets, current, state, initialTarget, onApply, onApplyLive, onClose, onRangeInterval, rangeActive = false, rangeSize = 100 }: {
  datasets: BarDataset[]; current: BarDataset; state: IntervalMenuState; initialTarget?: string;
  onApply: (dataset: BarDataset, state: IntervalMenuState, result: IntervalSuccess) => boolean | void;
  /** Live charts: switch the feed to `interval`. A live chart's other intervals come from the feed, not from supplied bars. */
  onApplyLive?: (interval: string, state: IntervalMenuState) => boolean | void; onClose: () => void;
  /** Range intervals, as in the interval menu. With this, an R row (or a typed `<n>R`) previews the Range chart and Apply
   * sets the size, selects Range and saves the menu draft; on a Range chart the dialog opens on the current R interval. */
  onRangeInterval?: (size: number, state: IntervalMenuState) => boolean | void; rangeActive?: boolean; rangeSize?: number;
}) {
  const ranges = !!onRangeInterval;
  const live = liveShapeOf(current) !== null;
  /** An interval picked or added in the dialog prefers a unique exact source; otherwise the chart's own
   original source (the same rule the menu uses) is supplied. A caller-supplied initialTarget still asks for an explicit source. */
  function defaultSourceKey(value: string): string {
    try {
      if (live) return '';
      const id = parseInterval(value).id, exact = datasets.filter(row => row.instrument.id === current.instrument.id && safeId(row.resolution) === id);
      return exact.length === 1 ? '' : intervalDatasetKey(finestIntervalSource(datasets, current));
    } catch { return ''; }
  }
  const [draft, setDraft] = useState(() => restoreIntervalMenuState(state));
  const [target, setTarget] = useState(initialTarget ?? (ranges && rangeActive ? rangeIntervalId(rangeSize) : current.resolution)), [sourceKey, setSourceKey] = useState(() => initialTarget || live ? '' : intervalDatasetKey(current));
  const [custom, setCustom] = useState(''), [error, setError] = useState('');
  const entries = useMemo(() => intervalMenuEntries({ ...draft, policy: DEFAULT_AGGREGATION_POLICY }), [draft.custom, draft.favorites, draft.hidden]);
  const liveChoice = useMemo(() => live ? resolveIntervalSwitch(datasets, current, target, draft.policy) : null, [live, datasets, current, target, draft.policy]);
  const result = useMemo(() => chooseIntervalSource(datasets, { instrumentId: current.instrument.id, target, sourceKey: sourceKey || undefined, policy: draft.policy }), [datasets, current.instrument.id, target, sourceKey, draft.policy]);
  const choices = useMemo(() => { try { return listIntervalSources(datasets, current.instrument.id, target); } catch { return []; } }, [datasets, current.instrument.id, target]);
  const rangeTarget = ranges && looksLikeRangeInterval(target) ? parseRangeInterval(target) : null;
  const canonicalTarget = useMemo(() => { if (rangeTarget) return rangeTarget.ok ? rangeTarget.interval : ''; try { return parseInterval(target).id; } catch { return ''; } }, [target, ranges]);
  // A Range size outside the standard R rows (the current one, or a typed one) shows as its own row.
  const extraRange: IntervalSpec | null = rangeTarget?.ok && !entries.some(spec => spec.id === rangeTarget.interval) ? { id: rangeTarget.interval, unit: 'range', multiplier: rangeTarget.size, kind: 'event', seconds: null } : null;
  const rows = extraRange ? [...entries, extraRange] : entries;
  function action(value: IntervalMenuAction) { try { setDraft(editIntervalMenu(draft, value)); setError(''); } catch (cause) { setError(plainErrorText(cause)); } }
  function select(value: string) { setTarget(value); setSourceKey(defaultSourceKey(value)); setError(''); }
  function add(event: React.FormEvent) { event.preventDefault();
    if (ranges && looksLikeRangeInterval(custom)) { const parsed = parseRangeInterval(custom); if (!parsed.ok) { setError(parsed.message); return; } select(parsed.interval); setCustom(''); return; }
    try { const spec = parseInterval(custom); setDraft(editIntervalMenu(draft, { type: 'add', interval: spec.id })); select(spec.id); setCustom(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  function apply() { try { const checked = restoreIntervalMenuState(draft);
    if (rangeTarget) { if (!rangeTarget.ok) throw new Error(rangeTarget.message); if (onRangeInterval!(rangeTarget.size, checked) === false) throw new Error('The range interval was rejected. Your draft remains available; review the workspace message.'); onClose(); return; }
    if (liveChoice) { if (!liveChoice.ok) throw new Error(liveChoice.reason); if (liveChoice.kind !== 'live' || !onApplyLive || onApplyLive(liveChoice.interval, checked) === false) throw new Error('The interval change was rejected. Your draft remains available; review the workspace message.'); onClose(); return; }
    const selected = chooseIntervalSource(datasets, { instrumentId: current.instrument.id, target, sourceKey: sourceKey || undefined, policy: checked.policy }); if (!selected.ok) throw new Error(selected.message); if(onApply(selected.dataset, checked, selected)===false)throw new Error('The interval change was rejected. Your draft remains available; review the workspace message.'); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  /* The legacy demo keeps its wording; otherwise no SYNTHETIC, supplied or demo provenance text. */
  const legacyText = demoDataMode() === 'legacy';
  return <Modal title="Chart intervals" onClose={onClose} wide>
    <div className="modal-scroll" style={{ overflow: 'auto', minHeight: 0, flex: 1, padding: '0 16px' }}>
      <p className="source-note">{current.instrument.symbol}: choose an interval. Bars are never made up for a finer interval than the data has.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px,1fr) minmax(260px,2fr)', gap: 16 }}>
        <section aria-label="Available chart intervals"><h3>Intervals</h3><div style={{ maxHeight: 340, overflow: 'auto' }}>
          {rows.map(spec => <div key={spec.id} className="button-row"><button type="button" aria-pressed={canonicalTarget === spec.id} onClick={() => select(spec.id)}>{intervalLabel(spec)}</button>{spec !== extraRange && <><button type="button" aria-label={`Favorite ${shortIntervalText(spec.id)}`} aria-pressed={draft.favorites.includes(spec.id)} onClick={() => action({ type: 'favorite', interval: spec.id })}>{draft.favorites.includes(spec.id) ? '★' : '☆'}</button><button type="button" aria-label={`Hide ${shortIntervalText(spec.id)}`} onClick={() => action({ type: 'hide', interval: spec.id })}>Remove</button></>}{spec.kind === 'event' && <small>{ranges && spec.unit === 'range' ? 'Range chart' : 'Loaded bars only'}</small>}</div>)}
        </div><form onSubmit={add}><label>Add custom interval <input aria-label="Custom interval" maxLength={40} value={custom} onChange={event => setCustom(event.target.value)} placeholder={ranges ? '205, 2.5h, 82D, 37W, 250R' : '205, 2.5h, 82D, 37W'}/></label><button type="submit">Add custom interval</button></form><p className="help">Bare numbers and lowercase m mean minutes; uppercase M means months. Decimal hours must resolve to whole minutes.</p><button type="button" onClick={() => { setDraft(createIntervalMenuState()); setError(''); }}>Reset draft menu and policy</button><p className="help">Favorites: {draft.favorites.join(', ') || 'None'}. Hidden: {draft.hidden.join(', ') || 'None'}. Re-add a hidden interval to restore it.</p></section>
        <section aria-label="Interval source and preview"><h3>Source and aggregation</h3><p>Requested interval: <strong>{shortIntervalText(target)}</strong></p>
          {rangeTarget ? (rangeTarget.ok ? <><p role="status">{`Range chart: ${rangeTarget.label} (${rangeTarget.interval}). Each bar spans ${rangeTarget.size} instrument tick${rangeTarget.size === 1 ? '' : 's'} of price movement.`}</p><p className="help">{`Range bars are built from the loaded ${current.resolution} bars of ${current.instrument.symbol} (price path approximation). Apply selects the Range chart type and keeps the data interval.`}</p></> : <p role="alert">{rangeTarget.message}</p>) : liveChoice ? (liveChoice.ok && liveChoice.kind === 'live' ? <><p role="status">Live feed: {intervalLabel(liveChoice.interval)} bars from {current.provenance.providerName}.</p><p className="help">{liveChoice.plan.native ? 'The provider sends this interval directly.' : 'Built live from finer provider data.'} Bar completion, including the terminal bar, is unknown.</p></> : <p role="alert">{liveChoice.ok ? 'This interval is not available on a live feed.' : liveChoice.reason}</p>) : <>
          <label>Source <select aria-label="Interval source" style={{ display: 'block', maxWidth: '100%', width: '100%' }} value={sourceKey} onChange={event => { setSourceKey(event.target.value); setError(''); }}><option value="">Prefer a unique exact interval</option>{choices.map((choice, index) => <option key={choice.key + ':' + index} value={choice.key} title={choice.label}>{choice.exact ? 'Exact: ' : 'Source: '}{choice.label.length > 180 ? choice.label.slice(0, 180) + '...' : choice.label}</option>)}</select></label>
          <details open={result.ok && result.kind === 'derived'}><summary>Explicit UTC aggregation policy</summary><p className="help">These settings apply when aggregating an original source. Exact sources and existing derived snapshots retain their stored boundaries. These local boundaries are not exchange-session bars. The input session is preserved, including unknown coverage. Exchange calendars, DST anchoring, early closes and overnight sessions are not reconstructed.</p>
            <label>Fixed-interval Unix anchor <input type="number" aria-label="Fixed interval anchor" step="1" value={Number.isFinite(draft.policy.fixedAnchor) ? draft.policy.fixedAnchor : ''} onChange={event => setDraft(previous => ({ ...previous, policy: { ...previous.policy, fixedAnchor: event.target.value === '' ? NaN : Number(event.target.value) } }))}/></label>
            <label>UTC calendar anchor date <input type="date" aria-label="Calendar interval anchor" value={draft.policy.calendarAnchor} onChange={event => setDraft(previous => ({ ...previous, policy: { ...previous.policy, calendarAnchor: event.target.value } }))}/></label>
            <label>Week begins <select aria-label="Interval week start" value={draft.policy.weekStartsOn} onChange={event => setDraft(previous => ({ ...previous, policy: { ...previous.policy, weekStartsOn: Number(event.target.value) } }))}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            <p className="help">Days use the anchor date; weeks use the containing week; month groups use the anchor month. Fixed intraday bars use the Unix anchor. Source calendar labels identify their UTC period under this local policy.</p>
          </details>
          {result.ok ? <><p role="status">{legacyText ? (result.kind === 'exact' ? 'Exact supplied data' : 'DERIVED LOCAL UTC DATA') : (result.kind === 'exact' ? 'Exact data' : 'Built from finer bars (UTC)')}: {result.coverage.outputBars.toLocaleString()} bars{result.dataset.provenance.fixture ? (legacyText ? ' | SYNTHETIC DEMO' : demoDataMode() === 'example' ? ' | Example data' : '') : ''}.</p><p className="help">Provider: {result.dataset.provenance.fixture && !legacyText ? (demoDataMode() === 'example' ? 'Example data' : 'No data') : result.dataset.provenance.providerName}<br/>Resolution: {result.dataset.resolution}<br/>Session: {result.dataset.provenance.session}<br/>Adjustment: {result.dataset.provenance.adjustment}<br/>Currency: {result.dataset.instrument.currency}{(legacyText || (!result.dataset.provenance.fixture && result.dataset.provenance.asOf > 0)) && <><br/>Source as of: {new Date(result.dataset.provenance.asOf * 1000).toISOString()}</>}</p>{result.kind === 'derived' && <p className="help">{result.coverage.inputBars} input bars. {result.coverage.partialClockBuckets} buckets have partial continuous-clock coverage. This count includes weekends and closed sessions and is not a missing-market-data verdict.</p>}<p className="help">This data may not match what was known at the time, and the latest bar may still be forming.</p><details><summary>Data basis and limitations</summary>{result.policies.map(policy => <p key={policy} className="help">{policy}</p>)}</details></> : <p role="alert">{result.message}</p>}</>}
        </section>
      </div>
      <p className="help">Apply saves the menu and opens the selected dataset. Cancel, Escape or close discards this draft. A preview does not insert or replace any data.</p>
    </div><footer><span role="alert">{error}</span><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={rangeTarget ? !rangeTarget.ok : liveChoice ? !(liveChoice.ok && liveChoice.kind === 'live') : !result.ok} onClick={apply}>Apply</button></footer>
  </Modal>;
}
