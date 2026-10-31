import React, { useEffect, useRef, useState } from 'react';
import type { StrategyConfig } from '../domain/strategy';
import type { StrategyReportSide } from '../domain/strategy-report';
import { STRATEGY_REPORT_METRICS } from '../domain/strategy-report-catalog';
import { restoreStrategyReportJson, type RestoredStrategyReport } from './restore';
import type { StrategyReportSummary } from './types';

const format = (value: number | null, digits = 6) => value === null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: digits });

/** Read-only verification of an exported report JSON. Nothing here re-executes or replaces the current report. */
export function SavedReportPanel({ side, current, onLoadProperties }: { side: StrategyReportSide; current: StrategyReportSummary | null; onLoadProperties: (config: StrategyConfig) => void }) {
  const [text, setText] = useState(''), [restored, setRestored] = useState<RestoredStrategyReport | null>(null), [error, setError] = useState('');
  const [choosing, setChoosing] = useState(false), mounted = useRef(true), request = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++; }; }, []);
  function replaceText(value: string) { request.current++; setChoosing(false); setText(value); setRestored(null); setError(''); }
  async function chooseFile() {
    if (!mounted.current) return;
    if (!window.lv) { setError('Opening a local file needs the desktop app. Paste JSON below instead.'); return; }
    const ticket = ++request.current; setChoosing(true); setError('');
    try {
      const response = await window.lv.importData({ kind: 'strategy-report' });
      if (!mounted.current || request.current !== ticket) return;
      if (!response.ok) { if (response.error.code !== 'CANCELLED') setError(response.error.message); return; }
      setText(response.value.text); setRestored(null);
      setRestored(restoreStrategyReportJson(response.value.text));
    } catch (cause) {
      if (mounted.current && request.current === ticket) setError(cause instanceof Error ? cause.message : 'The saved report could not be read.');
    } finally { if (mounted.current && request.current === ticket) setChoosing(false); }
  }
  function verify() {
    try { const value = restoreStrategyReportJson(text); setRestored(value); setError(''); }
    catch (cause) { setRestored(null); setError(cause instanceof Error ? cause.message : 'The saved report could not be verified.'); }
  }
  const summary = restored?.summary;
  return <details>
    <summary>Open a saved report</summary>
    <p className="help">Open or paste a report JSON exported by OpenCandle, up to 20 MiB. It is checked for structure and internal arithmetic, then shown read-only beside the current report. It is not re-executed, is not the current execution and cannot be exported as one.</p>
    <textarea aria-label="Saved strategy report JSON" rows={4} style={{ width: '100%' }} value={text} onChange={event => replaceText(event.target.value)} />
    <div className="button-row"><button disabled={choosing} onClick={() => void chooseFile()}>{choosing ? 'Choosing report file...' : 'Open saved report file'}</button><button disabled={!text.trim() || choosing} onClick={verify}>Verify saved report</button><button disabled={!text && !restored && !choosing} onClick={() => replaceText('')}>Clear saved report</button></div>
    {error && <p role="alert">{error}</p>}
    {summary && restored && <>
      <p className="help">Saved execution {summary.context.executionId} · {summary.context.sourceLabel} · Currency {summary.context.currency ?? 'not set'} · Time zone {summary.context.timezone} · {summary.counts.bars} rows, {summary.counts.trades} closed allocations, {summary.counts.orders} orders. Recomputed from the saved rows and matched: {restored.checks.join('; ')}.{summary.analysis ? '' : ' This older export has no trade analysis section.'}</p>
      <details><summary>Not re-verified ({restored.unverified.length} items, plus metrics marked as saved below)</summary><ul className="help">{restored.unverified.map(item => <li key={item}>{item}</li>)}</ul></details>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Metric</th><th>Saved {side}</th><th>Saved value check</th><th>Current {side}</th></tr></thead><tbody>{STRATEGY_REPORT_METRICS.map(definition => { const saved = summary.metrics[side][definition.key], live = current?.metrics[side][definition.key]; return <tr key={definition.key}><td>{definition.label}</td><td title={saved.reason ?? saved.basis}>{format(saved.value)}{saved.value === null ? ' (' + saved.status + ')' : ''}</td><td>{restored.verified.includes(side + '.' + definition.key) ? 'Recomputed and matched' : 'As saved, not re-verified'}</td><td title={live ? live.reason ?? live.basis : 'No current report'}>{live ? format(live.value) + (live.value === null ? ' (' + live.status + ')' : '') : 'No current report'}</td></tr>; })}</tbody></table></div>
      <button onClick={() => onLoadProperties(summary.config)}>Load saved properties into draft</button>
    </>}
  </details>;
}
