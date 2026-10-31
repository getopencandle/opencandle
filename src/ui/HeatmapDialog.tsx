import {demoDataLabel} from '../domain/demo-mode';
import './dialog-forms.css';
import './heatmap.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HEATMAP_COLOR_SPECS, HEATMAP_LOGO_REASON, HEATMAP_SIZE_SPECS, applyHeatmapSetting, calculateHeatmap, heatmapOpenDecision, heatmapCsv, heatmapDatasetKey, heatmapDraftChanged, heatmapKeyboardTarget, heatmapOptions, heatmapSelectedDataset, heatmapUniverseDisclosure, heatmapWatchScope, HEATMAP_METADATA_CSV_TEMPLATE, mergeHeatmapMetadata, parseHeatmapMetadata, layoutHeatmapGroups, resetHeatmapDraft, restoreHeatmapState, type HeatmapItem, type HeatmapOption, type HeatmapSettings, type HeatmapState } from '../domain/heatmap';
import type { BarDataset } from '../domain/types';
import { Modal } from './Modal';
import { Select } from './Select';
import { watchListChoices, watchListMembers } from '../watchlists/membership';
import type { WatchBook } from '../watchlists/model';
import { InfoTip, OverflowMenu } from './dialog-extras';
import {plainErrorText} from './user-error';

const number = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
/** Display-only: prices to 2 decimals (4 under 1), large sizes compact (1.25M). Exports keep native values. */
const price = (value: number | null) => value === null ? 'n/a' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2 });
const compact = (value: number | null) => value === null ? 'n/a' : Math.abs(value) >= 1e4 ? value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 }) : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const fixed2 = (value: number) => { const text = value.toFixed(2); return text === '-0.00' ? '0.00' : text; };
const utc = (time: number | null) => time === null ? 'Unavailable' : new Date(time * 1000).toISOString().replace('T', ' ').replace(/(:\d\d)\.000Z$/, '$1 UTC');
/** Unix seconds <-> the UTC datetime-local string used by the "As of" control. */
export function heatmapCutoffInput(seconds: number | null): string { return seconds === null || !Number.isFinite(seconds) ? '' : new Date(seconds * 1000).toISOString().slice(0, 19); }
export function heatmapCutoffSeconds(text: string): number | null { if (!text) return null; const ms = Date.parse(text.length === 16 ? text + ':00Z' : text + 'Z'); return Number.isFinite(ms) ? Math.floor(ms / 1000) : null; }
const DEFAULT_VIEW = { width: 900, height: 440 };
let patternCounter = 0;
export function requestHeatmapSourceOpen(item: HeatmapItem, datasets: readonly BarDataset[], select: (dataset: BarDataset) => { ok: boolean; error?: string } | void): { ok: boolean; error?: string } {
  const dataset = heatmapSelectedDataset(item, datasets);
  if (!dataset) return { ok: false, error: 'The displayed source is missing, changed or ambiguous. The heatmap remains open.' };
  try { const result = select(dataset); return result?.ok ? { ok: true } : { ok: false, error: result?.error ?? 'The chart did not confirm the exact source change. The heatmap remains open.' }; }
  catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }; }
}
function OptionList({ options }: { options: readonly HeatmapOption[] }) {
  const categories = [...new Set(options.map(option => option.category))];
  return <>{categories.map(category => <optgroup key={category} label={category}>{options.filter(option => option.category === category).map(option => <option key={option.value} value={option.value} disabled={!option.available} title={option.reason ?? undefined}>{option.available ? option.label : `${option.label} (unavailable)`}</option>)}</optgroup>)}</>;
}
/**
 * The heatmap view element enters the platform fullscreen mode; a second
 * press (or Escape, handled by the platform) exits it, which restores the window exactly as it was before.
 */
export async function toggleHeatmapFullscreen(doc: { fullscreenElement: unknown; exitFullscreen(): Promise<void> }, view: { requestFullscreen(): Promise<void> } | null): Promise<'entered' | 'exited' | 'unavailable'> {
  if (doc.fullscreenElement) { await doc.exitFullscreen(); return 'exited'; }
  if (!view) return 'unavailable';
  await view.requestFullscreen(); return 'entered';
}
export function HeatmapDialog({ datasets: allDatasets, state, onChange, onSelect, onClose, watchBook }: {
  datasets: BarDataset[]; /** Optional: enables the watchlist scope selector. */ watchBook?: WatchBook; state: HeatmapState; onChange: (state: HeatmapState) => boolean | void;
  onSelect: (dataset: BarDataset) => { ok: boolean; error?: string } | void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => restoreHeatmapState(state));
  const [error, setError] = useState(''), [metadataText, setMetadataText] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [scopeId, setScopeId] = useState(''), [metaStatus, setMetaStatus] = useState('');
  const scopeChoices = useMemo(() => { if (!watchBook) return []; try { return watchListChoices(watchBook); } catch { return []; } }, [watchBook]);
  const scope = useMemo(() => {
    if (!scopeId || !watchBook) return { datasets: allDatasets, missing: [] as string[], label: '' };
    try { const members = watchListMembers(watchBook, scopeId), found = heatmapWatchScope(allDatasets, members); return { ...found, label: scopeChoices.find(choice => choice.id === scopeId)?.name ?? scopeId }; }
    catch { return { datasets: [] as BarDataset[], missing: [], label: 'a missing list' }; }
  }, [allDatasets, scopeId, watchBook, scopeChoices]);
  const datasets = scope.datasets;
  const viewRef = useRef<HTMLDivElement>(null), tileRefs = useRef(new Map<string, SVGGElement>()), pendingFocus = useRef<string | null>(null), patternRef = useRef<string | null>(null);
  if (patternRef.current === null) patternRef.current = 'lv-heatmap-unknown-' + ++patternCounter;
  const patternId = patternRef.current;
  useEffect(() => {
    const host = viewRef.current; if (!host || typeof ResizeObserver === 'undefined') return;
    const measure = () => { const width = Math.floor(host.clientWidth), height = Math.floor(host.clientHeight); if (width > 0 && height > 0) setView(previous => previous.width === width && previous.height === height ? previous : { width, height }); };
    const observer = new ResizeObserver(measure); observer.observe(host); measure(); return () => observer.disconnect();
  }, []);
  const calculated = useMemo(() => { try { return { result: calculateHeatmap(datasets, draft.settings, draft.metadata, undefined, allDatasets), error: '' }; } catch (cause) { return { result: null, error: cause instanceof Error ? cause.message : String(cause) }; } }, [datasets, draft, allDatasets]);
  const computed = useMemo(() => { if (!calculated.result) return { ...calculated, layout: null }; try { return { ...calculated, layout: layoutHeatmapGroups(calculated.result.items, draft.settings.grouping, view.width, view.height) }; } catch (cause) { return { result: calculated.result, layout: null, error: cause instanceof Error ? cause.message : String(cause) }; } }, [calculated, draft.settings.grouping, view]);
  const options = useMemo(() => heatmapOptions(datasets, draft, undefined, allDatasets), [datasets, draft, allDatasets]);
  const result = computed.result, allItems = [...result?.items ?? [], ...result?.unavailable ?? [], ...result?.zeroWeight ?? [], ...result?.hiddenItems ?? []], byId = new Map(allItems.map(row => [row.id, row])), current = selected ? byId.get(selected) : undefined;
  const rects = computed.layout?.groups.flatMap(group => group.tiles) ?? [], order = result?.items.map(item => item.id) ?? [], drawnIds = new Set(rects.map(rect => rect.id));
  const focusId = selected && drawnIds.has(selected) ? selected : order.find(id => drawnIds.has(id)) ?? null;
  useEffect(() => { const id = pendingFocus.current; if (id) { pendingFocus.current = null; tileRefs.current.get(id)?.focus(); } }, [selected]);
  const currencies = [...new Set([...datasets.map(row => row.instrument.currency), ...draft.metadata.map(row => row.currency)])].sort(), resolutions = [...new Set(datasets.map(row => row.resolution))].sort();
  const sourceChoices = new Map<string, BarDataset[]>(); for (const dataset of datasets) { const choices = sourceChoices.get(dataset.instrument.id) ?? []; choices.push(dataset); sourceChoices.set(dataset.instrument.id, choices); }
  const conflicts = [...sourceChoices].filter(([, choices]) => choices.length > 1);
  const sizeSpec = HEATMAP_SIZE_SPECS[draft.settings.size], colorSpec = HEATMAP_COLOR_SPECS[draft.settings.color], usesBars = sizeSpec.usesBars || colorSpec.usesBars;
  const unavailableChoices = [options.size.find(option => option.value === draft.settings.size), options.color.find(option => option.value === draft.settings.color), options.grouping.find(option => option.value === draft.settings.grouping)].filter(option => option && !option.available) as HeatmapOption[];
  const dirty = useMemo(() => heatmapDraftChanged(state, draft), [state, draft]);
  const unavailableOptions = [...options.size, ...options.color, ...options.unsupportedColor, ...options.grouping].filter(option => !option.available);
  const sizeText = (item: HeatmapItem) => `${compact(item.sizeValue)}${item.sizeValue === null ? '' : draft.settings.size.startsWith('volume') ? ' shares' : ' ' + item.currency}`;
  const colorText = (item: HeatmapItem) => item.colorValue === null ? 'n/a' : colorSpec.unit === '%' ? `${!colorSpec.positiveOnly && item.colorValue > 0 && fixed2(item.colorValue) !== '0.00' ? '+' : ''}${fixed2(item.colorValue)}%` : colorSpec.unit === '' ? fixed2(item.colorValue) : `${fixed2(item.colorValue)}×`;
  const coverageText = result ? `${result.coverage.shown} tiles / ${result.coverage.eligible} eligible / ${result.coverage.supplied} supplied; ${result.coverage.synthetic} synthetic; ${result.coverage.unknownColor} unknown color; ${result.coverage.unknownSize} unknown size; ${result.coverage.hidden} hidden` : 'Calculation unavailable';
  function change<K extends keyof HeatmapSettings>(key: K, value: HeatmapSettings[K]) { setDraft(previous => ({ ...previous, settings: applyHeatmapSetting(previous.settings, key, value) })); }
  function apply() { try { const checked = restoreHeatmapState(draft); if (computed.error) throw new Error(computed.error); if (onChange(checked) === false) throw new Error('Workspace update was rejected. This draft is unchanged; check the application status for details.'); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  function requestOpen(item: HeatmapItem, confirmed = false) { const decision = heatmapOpenDecision({ selectedId: selected, itemId: item.id, dirty, confirmed }); if (decision === 'select') { setSelected(item.id); setConfirmOpen(null); } else if (decision === 'confirm') setConfirmOpen(item.id); else { setConfirmOpen(null); open(item); } }
  function open(item: HeatmapItem) { const result = requestHeatmapSourceOpen(item, datasets, onSelect); if (result.ok) onClose(); else setError(result.error ?? 'The exact chart source could not be opened.'); }
  function reset() { setDraft(resetHeatmapDraft(draft)); setError(''); }
  function tileKey(event: React.KeyboardEvent, item: HeatmapItem) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); requestOpen(item); return; }
    if (event.key === ' ') { event.preventDefault(); setSelected(item.id); return; }
    const target = heatmapKeyboardTarget(rects, order, item.id, event.key);
    if (target) { event.preventDefault(); if (target === selected) tileRefs.current.get(target)?.focus(); else { pendingFocus.current = target; setSelected(target); } }
  }
  function applyMetadata(text: string, format: 'json' | 'csv', sourceName: string) {
    const parsed = parseHeatmapMetadata(text, format, allDatasets, { source: sourceName });
    const checked = restoreHeatmapState({ ...draft, metadata: format === 'json' ? parsed.metadata : mergeHeatmapMetadata(draft.metadata, parsed.metadata) });
    setDraft(checked); setError(''); setMetaStatus(`${parsed.metadata.length} metadata row${parsed.metadata.length === 1 ? '' : 's'} read from ${sourceName}. Apply saves them; Cancel discards them.${parsed.diagnostics.length ? ' ' + parsed.diagnostics.slice(0, 3).join(' ') + (parsed.diagnostics.length > 3 ? ` (${parsed.diagnostics.length - 3} more notes)` : '') : ''}`);
  }
  function importMetadata() { try { if (metadataText.length > 10 * 1024 * 1024 || new TextEncoder().encode(metadataText).length > 10 * 1024 * 1024) throw new Error('Metadata exceeds the 10 MiB UTF-8 limit.'); applyMetadata(metadataText, /^\s*[\[{]/.test(metadataText) ? 'json' : 'csv', 'pasted text'); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }
  async function importMetadataFile() {
    if (!window.lv) { setError('Choosing a metadata file needs the desktop app. Paste CSV or JSON below instead.'); return; }
    try {
      const response = await window.lv.importData({ kind: 'heatmap-metadata' });
      if (!response.ok) { if (response.error.code === 'CANCELLED') setMetaStatus('Import cancelled. The draft is unchanged.'); else setError(response.error.message); return; }
      applyMetadata(response.value.text, response.value.format, response.value.fileName);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function exportState() { if (!window.lv) { setError('Export needs the desktop app.'); return; } try { const response = await window.lv.exportData({ text: JSON.stringify(restoreHeatmapState(draft), null, 2), suggestedName: 'OpenCandle-heatmap-settings-and-metadata.json', format: 'json' }); if (!response.ok) setError(response.error.message); } catch (cause) { setError(plainErrorText(cause)); } }
  async function exportTiles() { if (!window.lv) { setError('Export needs the desktop app.'); return; } if (!result) { setError(computed.error || 'Calculation unavailable.'); return; } try { const response = await window.lv.exportData({ text: heatmapCsv(result, draft.settings), suggestedName: 'OpenCandle-heatmap-visible-view.csv', format: 'csv' }); if (!response.ok) setError(response.error.message); } catch (cause) { setError(plainErrorText(cause)); } }
  async function fullscreen() { try { await toggleHeatmapFullscreen(document, viewRef.current); } catch (cause) { setError(`Fullscreen unavailable: ${String(cause)}`); } }
  return <Modal title="Stock and ETF heatmap" onClose={onClose} wide>
    <div className="modal-scroll lv-pol lv-heatmap" style={{ overflow: 'auto', minHeight: 0, flex: 1 }}>
    <div className="lv-heatmap-summary" role="status" aria-label="Heatmap summary">
      <span>{result ? `${result.coverage.shown} ${result.coverage.shown === 1 ? 'symbol' : 'symbols'}` : 'Calculation unavailable'}{result?.coverage.hidden ? ` · ${result.coverage.hidden} hidden` : ''}</span>
      {!!result?.coverage.synthetic && <span className="synthetic-badge">{demoDataLabel()}</span>}
      <span className="lv-heatmap-chip" title="Tiles cover the symbols loaded in this workspace, not a whole market.">Loaded symbols only</span>
      <InfoTip label="About this data" className="lv-info-end">Symbols with loaded prices. Market cap, assets under management and sectors need dated metadata you add below. Details are under About this data.</InfoTip>
    </div>
    {scope.label && <p className="source-note" role="note" aria-label="Heatmap watchlist scope" title={scope.missing.length ? `No loaded data for ${scope.missing.slice(0, 8).join(', ')}${scope.missing.length > 8 ? ` and ${scope.missing.length - 8} more` : ''}. Load a dataset to include ${scope.missing.length === 1 ? 'it' : 'them'}.` : undefined}>Watchlist {scope.label}: {datasets.length} of {allDatasets.length} loaded symbol{allDatasets.length === 1 ? '' : 's'}{scope.missing.length ? `, ${scope.missing.length} not loaded` : ''}.</p>}
    <div className="screener-controls"><div className="button-row">
      {!!scopeChoices.length && <label>Universe <Select aria-label="Heatmap universe" value={scopeId} onChange={value => { setScopeId(value); setSelected(null); }} options={[{ value: '', label: 'All loaded instruments' }, ...scopeChoices.map(choice => ({ value: choice.id, label: `${choice.name} (${choice.symbols})` }))]}/></label>}
      <label>Instruments <select aria-label="Heatmap instruments" value={draft.settings.asset} onChange={event => change('asset', event.target.value as HeatmapSettings['asset'])}><option value="all">Stocks and ETFs</option><option value="stock">Stocks</option><option value="etf">ETFs</option></select></label>
      <label>Size by <select aria-label="Heatmap size" value={draft.settings.size} onChange={event => change('size', event.target.value as HeatmapSettings['size'])}><OptionList options={options.size}/></select></label>
      <label>Color by <select aria-label="Heatmap color" value={draft.settings.color} onChange={event => change('color', event.target.value as HeatmapSettings['color'])}><OptionList options={[...options.color, ...options.unsupportedColor]}/></select></label>
      <label title={usesBars ? undefined : 'Not used by the selected size and color metrics.'}>Bars <input aria-label="Heatmap loaded bars" type="number" min="1" max="100000" disabled={!usesBars} value={draft.settings.bars} onChange={event => change('bars', event.target.value === '' ? 0 : Number(event.target.value))}/></label>
      <label><input type="checkbox" checked={draft.settings.monoSize} onChange={event => change('monoSize', event.target.checked)}/>Equal size</label>
    </div><div className="button-row">
      <label>Group <select aria-label="Heatmap grouping" value={draft.settings.grouping} onChange={event => change('grouping', event.target.value as HeatmapSettings['grouping'])}><OptionList options={options.grouping}/></select></label>
      <label>Size currency <select aria-label="Heatmap currency" value={draft.settings.currency ?? ''} onChange={event => change('currency', event.target.value || null)}><option value="">All currencies</option>{currencies.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Resolution <select aria-label="Heatmap resolution" value={draft.settings.resolution ?? ''} onChange={event => change('resolution', event.target.value || null)}><option value="">All loaded resolutions</option>{resolutions.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Search <input aria-label="Heatmap search" type="search" maxLength={200} value={draft.settings.search} onChange={event => change('search', event.target.value)}/></label>
    </div>
    {unavailableChoices.map(option => <p key={option.value} role="status" className="help">{option.label} is unavailable for the loaded data: {option.reason} Tiles keep an explicit unavailable state; no other metric is substituted.</p>)}
    <details open={draft.settings.knowledgeCutoff !== null || conflicts.length > 0 || undefined}><summary>Advanced</summary><div className="button-row">
      <label>As of (UTC) <input aria-label="Heatmap event-time cutoff" type="datetime-local" step="1" value={heatmapCutoffInput(draft.settings.knowledgeCutoff)} onChange={event => change('knowledgeCutoff', heatmapCutoffSeconds(event.target.value))}/></label>
      {draft.settings.knowledgeCutoff !== null && <button type="button" onClick={() => change('knowledgeCutoff', null)}>Use latest</button>}
      <InfoTip label="About the as-of time">Leave blank to use the latest loaded bars. When set, bars and supplied metadata after this UTC time are ignored.</InfoTip>
    </div>{!!conflicts.length && <p className="help">Choose a source<InfoTip label="About dataset sources">One dataset per instrument. Resolution filters apply first. Source selections are stored with these settings; conflicting sources require an explicit selection.</InfoTip></p>}{conflicts.map(([id, choices]) => <label key={id}>{choices[0].instrument.symbol} <select aria-label={'Heatmap source for ' + id} value={draft.settings.datasetSelections[id] ?? ''} onChange={event => change('datasetSelections', { ...draft.settings.datasetSelections, [id]: event.target.value })}><option value="" disabled>Choose source when more than one remains</option>{choices.map((source, index) => <option key={index} value={heatmapDatasetKey(source)} title={source.provenance.datasetId}>{source.provenance.providerName} · {source.resolution}{choices.filter(other => other.provenance.providerName === source.provenance.providerName && other.resolution === source.resolution).length > 1 ? ` (${index + 1})` : ''}</option>)}</select></label>)}</details><details><summary>Appearance and metadata</summary><div className="button-row">
      <label>Title <select aria-label="Heatmap title" value={draft.settings.title} onChange={event => change('title', event.target.value as HeatmapSettings['title'])}><option value="symbol">Ticker</option><option value="description">Description</option><option value="none">None</option></select></label>
      <label>Value <select aria-label="Heatmap value" value={draft.settings.value} onChange={event => change('value', event.target.value as HeatmapSettings['value'])}><option value="color">Color metric</option><option value="size">Size metric</option><option value="price">Price</option><option value="none">None</option></select></label>
      <label>Palette <select aria-label="Heatmap palette" value={draft.settings.palette} onChange={event => change('palette', event.target.value as HeatmapSettings['palette'])}><option value="classic">Classic</option><option value="color-blind">Color-blind</option><option value="monochrome">Monochrome</option></select></label>
      <label title={HEATMAP_LOGO_REASON}><input type="checkbox" aria-label="Heatmap logos" checked={false} disabled readOnly/>Logos (unavailable)</label>
      <button type="button" title="Fills the screen with the heatmap. Press Escape to restore the previous window." onClick={() => void fullscreen()}>Fullscreen</button><OverflowMenu label="More export actions"><button type="button" role="menuitem" onClick={() => void exportState()}>Export settings and metadata</button><button type="button" role="menuitem" onClick={() => void exportTiles()}>Export visible view CSV</button></OverflowMenu><InfoTip label="About logos">{HEATMAP_LOGO_REASON}</InfoTip>
    </div><p className="help">{draft.metadata.length} dated metadata rows.<InfoTip label="About metadata import">Choose a CSV or JSON file, or paste either below. CSV needs a symbol column and may add sector, industry, marketCap, aum, currency, fundAssetClass, navTotalReturn (percent), topWeight (percent), asOf, availableAt and source; a template follows. JSON uses the documented heatmap metadata schema. Importing changes this draft only.</InfoTip></p>
      <div className="button-row"><button type="button" onClick={() => void importMetadataFile()}>Import metadata file</button><OverflowMenu label="More metadata actions"><button type="button" role="menuitem" onClick={() => setMetadataText(HEATMAP_METADATA_CSV_TEMPLATE)}>Insert CSV template</button><button type="button" role="menuitem" onClick={() => setDraft(previous => ({ ...previous, metadata: [] }))}>Remove metadata from draft</button></OverflowMenu></div>{metaStatus && <p role="status" className="help">{metaStatus}</p>}
      <textarea aria-label="Heatmap metadata JSON" rows={4} value={metadataText} onChange={event => setMetadataText(event.target.value)} placeholder='[{"instrumentId":"US:GME","marketCap":null,"aum":null,"currency":"USD","sector":null,"fundAssetClass":null,"asOf":0,"availableAt":0,"source":"Your dated source"}]'/>
      <div className="button-row"><button type="button" onClick={importMetadata}>Read pasted metadata into draft</button></div>
    </details></div>
    {draft.settings.knowledgeCutoff !== null && <p role="status" className="help">As of {utc(draft.settings.knowledgeCutoff)}.<InfoTip label="About the as-of view">Price and volume use final loaded bars whose event/open timestamps pass this filter. Their availability at that historical moment is unverified, including later corrections. Supplied metadata uses its separate availability timestamps.</InfoTip></p>}
    <div className="button-row">{draft.settings.zoomGroup !== null && <button type="button" onClick={() => change('zoomGroup', null)}>Show all groups</button>}{draft.settings.grouping !== 'none' && result?.groups.map(group => <button type="button" key={group} aria-pressed={draft.settings.zoomGroup === group} onClick={() => change('zoomGroup', group)}>{group}</button>)}</div>
    {dirty && <p role="status" className="help">Unapplied changes.<InfoTip label="About unapplied changes">Opening a chart closes this dialog and discards them; Apply first to keep them.</InfoTip></p>}
    {confirmOpen && byId.get(confirmOpen) && <div role="group" aria-label="Confirm chart open" className="help">Opening {byId.get(confirmOpen)!.symbol} closes this dialog and discards unapplied heatmap changes. <button type="button" onClick={() => requestOpen(byId.get(confirmOpen)!, true)}>Discard changes and open {byId.get(confirmOpen)!.symbol}</button><button type="button" onClick={() => setConfirmOpen(null)}>Keep editing</button></div>}
    <div ref={viewRef} style={{ background: '#101722', overflow: 'hidden', height: 'clamp(220px, 55vh, 640px)' }}>
      <svg viewBox={`0 0 ${computed.layout?.width ?? view.width} ${computed.layout?.height ?? view.height}`} width="100%" height="100%" style={{ display: 'block' }} role="group" aria-label="Loaded universe heatmap">
        <defs><pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#2b303b"/><line x1="0" y1="0" x2="0" y2="8" stroke="#4a5160" strokeWidth="3"/></pattern></defs>
        {computed.layout?.groups.map(group => <g key={group.group}>
          {group.group && <text x={group.bounds.x + 4} y={group.bounds.y + 15} fill="#dce5f2" fontSize={12} style={{ cursor: 'pointer' }} onClick={() => change('zoomGroup', draft.settings.zoomGroup === group.group ? null : group.group)}><title>{draft.settings.zoomGroup === group.group ? 'Show all groups' : `Zoom into ${group.group}`}</title>{group.group.slice(0, Math.max(0, Math.floor(group.bounds.width / 7)))}</text>}
          {group.tiles.map(tile => { const item = byId.get(tile.id)!; const value = draft.settings.value === 'color' ? colorText(item) : draft.settings.value === 'size' ? sizeText(item) : price(item.price); return <g key={tile.id} ref={element => { if (element) tileRefs.current.set(tile.id, element); else tileRefs.current.delete(tile.id); }} role="button" tabIndex={focusId === item.id ? 0 : -1} aria-pressed={selected === item.id} aria-label={`${item.symbol}: color ${colorText(item)}, size ${sizeText(item)}${item.provenance.fixture ? ', demo data' : ''}. Space or Enter selects; Enter on the selected tile opens its chart; arrow keys move.`} onClick={() => setSelected(item.id)} onDoubleClick={() => requestOpen(item)} onKeyDown={event => tileKey(event, item)}>
            <title>{`${item.symbol}${item.provenance.fixture ? ' · Demo' : ''}\n${item.name}\nPrice ${price(item.price)} ${item.priceCurrency}\nSize ${sizeText(item)}\nColor ${colorText(item)}${item.colorReason ? ' (' + item.colorReason + ')' : ''}\n${item.provenance.providerName}; ${item.provenance.state}; ${item.provenance.adjustment}; ${item.provenance.session}`}</title>
            <rect x={tile.x} y={tile.y} width={tile.width} height={tile.height} fill={item.colorValue === null ? `url(#${patternId})` : item.color} stroke={selected === item.id ? '#fff' : '#101722'} strokeWidth={selected === item.id ? 3 : 1}/>
            {tile.width > 45 && tile.height > 24 && draft.settings.title !== 'none' && <text pointerEvents="none" x={tile.x + tile.width / 2} y={tile.y + tile.height / 2 - 2} textAnchor="middle" fill="#fff" fontSize={Math.max(10, Math.min(19, tile.width / 7))}>{(draft.settings.title === 'symbol' ? item.symbol : item.name).slice(0, Math.max(4, Math.floor(tile.width / 8)))}</text>}
            {tile.width > 55 && tile.height > 52 && draft.settings.value !== 'none' && <text pointerEvents="none" x={tile.x + tile.width / 2} y={tile.y + tile.height / 2 + 17} textAnchor="middle" fill="#fff" fontSize={12}>{value}</text>}
          </g>; })}
        </g>)}
      </svg>
    </div>
    {!result?.items.length && <p className="empty-message">{computed.error || (result?.coverage.eligible ? 'No drawable tiles. Review unavailable sizes, zero weights and hidden ranges, or choose mono-size.' : 'No symbols match the current filters.')}</p>}
    {!!computed.layout?.undrawn.length && <p role="status">{computed.layout.undrawn.length} tile{computed.layout.undrawn.length === 1 ? '' : 's'} too small to draw at this size: {computed.layout.undrawn.map(id => <button type="button" key={id} onClick={() => setSelected(id)}>{byId.get(id)?.symbol ?? id}</button>)}</p>}
    <div className="button-row" aria-label="Heatmap legend">{result?.bins.map(bin => <button type="button" key={bin.index} aria-pressed={!bin.hidden} onClick={() => change('hiddenBins', bin.hidden ? draft.settings.hiddenBins.filter(value => value !== bin.index) : [...draft.settings.hiddenBins, bin.index])} style={{ background: bin.color, color: '#fff', opacity: bin.hidden ? .45 : 1 }}>{fixed2(bin.lower)} to {fixed2(bin.upper)}{colorSpec.unit === '%' ? '%' : '×'} ({bin.count})</button>)}<button type="button" onClick={() => change('hiddenBins', [])}>Show all ranges</button>{!!result?.coverage.unknownColor && <span className="help">Hatched: {result.coverage.unknownColor} unknown color value{result.coverage.unknownColor === 1 ? '' : 's'}</span>}</div>
    {selected && !current && <p role="status">The selected instrument is not in the current filtered view. <button type="button" onClick={() => setSelected(null)}>Clear selection</button></p>}
    {current && <div className="help" aria-label="Selected heatmap instrument"><b>{current.symbol}{current.provenance.fixture ? ' · Demo' : ''}</b> {current.name} · {current.assetClass} · {current.exchange} · group {current.group}{result?.hiddenItems.includes(current) ? ' · hidden by legend' : ''}<br/>Price {price(current.price)} {current.priceCurrency} · {sizeSpec.label}: {sizeText(current)} · {colorSpec.label}: {colorText(current)}<br/>{current.provenance.providerName} · {current.provenance.coverage} · {current.provenance.state} · {current.provenance.adjustment} · {current.provenance.session} · {current.resolution}<br/>Price time: {utc(current.priceTime)} · color base bar: {utc(current.colorBaseTime)} · size window: {current.sizeWindow ? `${current.sizeWindow.bars} bars, ${utc(current.sizeWindow.first)} to ${utc(current.sizeWindow.last)}` : 'Unavailable'} · metadata: {current.metadataSource ?? 'Unavailable'}{current.metadataAsOf !== null ? ' at ' + utc(current.metadataAsOf) : ''}<br/>{current.sizeReason} {current.colorReason}<button type="button" onClick={() => requestOpen(current)}>Open {current.symbol} in chart</button></div>}
    {!!(result?.unavailable.length || result?.zeroWeight.length) && <details><summary>Not drawn ({result!.unavailable.length + result!.zeroWeight.length})</summary><ul>{[...result!.unavailable, ...result!.zeroWeight].map(item => <li key={item.id}><button type="button" onClick={() => setSelected(item.id)}>{item.symbol}</button>: {item.sizeReason ?? 'Zero size; no proportional area.'}</li>)}</ul></details>}
    <details className="lv-heatmap-about"><summary>About this data</summary>
      <p className="help">{result ? heatmapUniverseDisclosure(result) : 'Calculation unavailable.'}</p>
      <p className="help">Counts: {coverageText}.</p>
      {!!unavailableOptions.length && <><p className="help"><b>Unavailable options and reasons ({unavailableOptions.length})</b></p><ul aria-label="Heatmap unavailable options">{unavailableOptions.map(option => <li key={option.value}><b>{option.label}</b>: {option.reason}</li>)}<li><b>Logos</b>: {HEATMAP_LOGO_REASON}</li></ul></>}
      <p className="help"><b>Calculation policies and coverage limits</b></p>{result?.policies.map(policy => <p key={policy} className="help">{policy}</p>)}<p className="help">The historical cutoff filters bar timestamps and supplied metadata availability. It does not reconstruct a point-in-time security master or late price corrections. Group headers and borders reserve display space.</p>
    </details>
    {result?.diagnostics.map(message => <p key={message} role="status">{message}</p>)}
    </div>
    <footer className="lv-heatmap-footer"><span role="alert">{error || computed.error}</span><button type="button" className="lv-quiet" onClick={reset}>Reset</button><button type="button" onClick={onClose}>Cancel</button><button type="button" onClick={apply}>Apply</button></footer>
  </Modal>;
}
