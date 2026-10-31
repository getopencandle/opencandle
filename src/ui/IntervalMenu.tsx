import React, { useEffect, useRef, useState } from 'react';
import { chooseIntervalSource, editIntervalMenu, intervalDatasetKey, intervalLabel, intervalMenuEntries, parseInterval, restoreIntervalMenuState, type IntervalMenuAction, type IntervalMenuState, type IntervalSpec, type IntervalSuccess } from '../domain/intervals';
import type { BarDataset } from '../domain/types';
import { resolveIntervalSwitch } from '../domain/interval-switch';
import { looksLikeRangeInterval, parseRangeInterval, rangeIntervalId } from '../chart/range-interval';
import { rangeSizeRefusal } from '../chart/derived/range';
import { runIdleSteps } from './startup-idle';

/** A compact interval dropdown. Picking a row switches at once; the full dialog stays reachable as the advanced path. */
const GROUPS: { name: string; test: (spec: IntervalSpec) => boolean }[] = [
  { name: 'Ticks', test: spec => spec.unit === 'tick' },
  { name: 'Seconds', test: spec => spec.unit === 'second' },
  { name: 'Minutes', test: spec => spec.unit === 'minute' && spec.multiplier % 60 !== 0 },
  { name: 'Hours', test: spec => spec.unit === 'minute' && spec.multiplier % 60 === 0 },
  { name: 'Days', test: spec => spec.unit === 'day' },
  // Weeks and Months are separate groups, as in common charting apps.
  { name: 'Weeks', test: spec => spec.unit === 'week' },
  { name: 'Months', test: spec => spec.unit === 'month' },
  { name: 'Ranges', test: spec => spec.unit === 'range' },
];
const ITEMS = '[role=menuitemradio],[role=menuitemcheckbox],[role=menuitem],input,select';
/** Collapsed group headers are a per-viewer convenience (browser storage; absent or blocked storage = all open). */
const COLLAPSED_KEY = 'lv.intervalMenu.collapsed';
function readCollapsed(): string[] { try { const value = JSON.parse(globalThis.localStorage?.getItem(COLLAPSED_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 20) : []; } catch { return []; } }
function writeCollapsed(names: string[]) { try { globalThis.localStorage?.setItem(COLLAPSED_KEY, JSON.stringify(names)); } catch { /* storage unavailable */ } }
/** Custom interval units: a bare number takes the chosen unit; text with its own unit ("2h", "90m") keeps it. */
export const CUSTOM_UNITS = [['s', 'Seconds'], ['m', 'Minutes'], ['h', 'Hours'], ['D', 'Days'], ['W', 'Weeks'], ['M', 'Months'], ['R', 'Ranges']] as const;
export function customIntervalText(text: string, unit: string): string { const trimmed = text.trim(); return /^\d+$/.test(trimmed) && CUSTOM_UNITS.some(([id]) => id === unit) ? trimmed + unit : trimmed; }

function safeId(value: string) { try { return parseInterval(value).id; } catch { return ''; } }
/** The disabled reason shows as the row tooltip; this id ties the same text to the row as its accessible description. */
const reasonId = (id: string) => 'lv-interval-reason-' + id.replace(/[^A-Za-z0-9_-]/g, '_');
function reason(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }

export function IntervalMenu({ datasets, current, state, style, onApply, onApplyLive, onEditMenu, onAdvanced, onClose, onRangeInterval, rangeActive = false, rangeSize = 100, onLeaveRange }: {
  datasets: BarDataset[]; current: BarDataset; state: IntervalMenuState; style?: React.CSSProperties;
  onApply: (dataset: BarDataset, state: IntervalMenuState, result: IntervalSuccess) => boolean | void;
  /** Live charts: switch the feed to `interval` (one subscription per symbol is kept by the host). */
  onApplyLive?: (interval: string, state: IntervalMenuState) => boolean | void;
  onEditMenu: (action: IntervalMenuAction) => boolean | void;
  onAdvanced: () => void; onClose: (focusTrigger: boolean) => void;
  /** Range intervals (the Range size is set through the interval). With this, an R row (or a typed
   * `<n>R`) sets the size and selects the Range chart type; on a Range chart the R row of the current size is the checked one.
   * Flat props so the element cache compares them by value. */
  onRangeInterval?: (size: number) => boolean | void; rangeActive?: boolean; rangeSize?: number;
  /** The data interval chosen on a Range chart returns it to a time chart type. */
  onLeaveRange?: () => boolean | void;
}) {
  const [custom, setCustom] = useState(''), [error, setError] = useState(''), [unit, setUnit] = useState('m');
  const checked = restoreIntervalMenuState(state), currentId = safeId(current.resolution);
  const range = onRangeInterval ? { active: rangeActive, size: rangeSize, onApply: onRangeInterval } : null;
  const listed = intervalMenuEntries(checked), customIds = new Set(checked.custom.map(safeId));
  const checkedId = range?.active ? rangeIntervalId(range.size) : currentId, isRange = (id: string) => !!range && looksLikeRangeInterval(id);
  // A Range size outside the standard R rows still shows (checked) in the Ranges group.
  const extraRange: IntervalSpec | null = range?.active && !listed.some(spec => spec.id === checkedId) ? { id: checkedId, unit: 'range', multiplier: range.size, kind: 'event', seconds: null } : null;
  const entries = extraRange ? [...listed, extraRange] : listed;
  // The group holding the current interval opens with the menu, so the checked row is visible and takes focus.
  const currentGroup = (() => { const spec = entries.find(row => row.id === checkedId); return spec ? customIds.has(spec.id) ? 'Custom' : GROUPS.find(group => group.test(spec))?.name ?? null : null; })();
  const [collapsed, setCollapsed] = useState<string[]>(() => readCollapsed().filter(name => name !== currentGroup));
  function toggleGroup(name: string) { const next = collapsed.includes(name) ? collapsed.filter(item => item !== name) : [...collapsed, name]; setCollapsed(next); writeCollapsed(next); }

  function chooseRange(size: number) {
    if (range!.active && size === range!.size) { onClose(true); return; }
    try { if (range!.onApply(size) === false) { setError('The range interval was rejected. Review the workspace message.'); return; } onClose(true); }
    catch (cause) { setError(reason(cause)); }
  }

  function choose(id: string, menu: IntervalMenuState) {
    if (isRange(id)) { const parsed = parseRangeInterval(id); if (parsed.ok) chooseRange(parsed.size); else setError(parsed.message); return; }
    if (id === currentId) {
      if (range?.active && onLeaveRange) { try { if (onLeaveRange() === false) { setError('The interval change was rejected. Review the workspace message.'); return; } } catch (cause) { setError(reason(cause)); return; } }
      onClose(true); return;
    }
    try {
      const choice = resolveIntervalSwitch(datasets, current, id, menu.policy);
      if (!choice.ok) { setError(choice.reason); return; }
      const applied = choice.kind === 'live' ? (onApplyLive ? onApplyLive(choice.interval, menu) : false) : onApply(choice.result.dataset, menu, choice.result);
      if (applied === false) { setError('The interval change was rejected. Review the workspace message.'); return; }
      onClose(true);
    } catch (cause) { setError(reason(cause)); }
  }
  function availability(id: string): string | null {
    if (isRange(id)) { const parsed = parseRangeInterval(id); return parsed.ok && !(range?.active && parsed.size === range.size) ? rangeSizeRefusal(current.bars, parsed.size, current.instrument.tickSize) : null; }
    if (id === currentId) return null;
    try { const choice = resolveIntervalSwitch(datasets, current, id, checked.policy, true); return choice.ok ? null : choice.reason; } catch (cause) { return reason(cause); }
  }
  function removeCustom(id: string) { try { if (onEditMenu({ type: 'remove', interval: id }) === false) setError('The change was rejected.'); else setError(''); } catch (cause) { setError(reason(cause)); } }
  function toggleFavorite(id: string) { try { if (onEditMenu({ type: 'favorite', interval: id }) === false) setError('The favorite change was rejected.'); else setError(''); } catch (cause) { setError(reason(cause)); } }
  function addCustom(event: React.FormEvent) {
    event.preventDefault();
    const typed = customIntervalText(custom, unit);
    if (range && looksLikeRangeInterval(typed)) { const parsed = parseRangeInterval(typed); if (!parsed.ok) { setError(parsed.message); return; } const blocked = availability(parsed.interval); if (blocked !== null) { setError(blocked); return; } setCustom(''); chooseRange(parsed.size); return; }
    try {
      const spec = parseInterval(typed), menu = editIntervalMenu(checked, { type: 'add', interval: spec.id }); setCustom('');
      // An interval no source can show yet is still kept in the Custom group (disabled with its reason).
      const blocked = availability(spec.id);
      if (blocked !== null) { onEditMenu({ type: 'add', interval: spec.id }); setError(blocked); return; }
      choose(spec.id, menu);
    }
    catch (cause) { setError(reason(cause)); }
  }
  function keyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent?.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); return; }
    if (event.key === 'Tab') { onClose(false); return; }
    const typing = (event.target as HTMLElement)?.tagName === 'INPUT';
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || typing && (event.key === 'Home' || event.key === 'End')) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ITEMS)).filter(item => !(item as HTMLButtonElement).disabled), index = items.indexOf(event.target as HTMLElement);
    const to = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? (index < 0 ? items.length - 1 : index - 1) : event.key === 'Home' ? 0 : items.length - 1;
    event.preventDefault(); items[(to + items.length) % items.length]?.focus();
  }
  // Initial focus runs once when the menu opens. An inline ref callback is a new function each render, so React re-ran it
  // after every keystroke and pulled focus from the custom box to the checked row.
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Starring an interval widens the toolbar strip and moves the interval button; the open menu follows its button.
  useEffect(() => { const menu = menuRef.current, left = typeof document === 'undefined' ? undefined : document.getElementById?.('lv-interval-badge')?.getBoundingClientRect?.().left; if (menu && typeof left === 'number' && Number.isFinite(left)) { const next = Math.max(4, Math.round(left)) + 'px'; if (menu.style.left !== next) menu.style.left = next; } });
  useEffect(() => { const badge = typeof document === 'undefined' ? null : document.getElementById?.('lv-interval-badge'), bar = badge?.closest?.('header') ?? badge?.parentElement; if (!badge || !bar || typeof ResizeObserver !== 'function') return; const follow = () => { const menu = menuRef.current; if (menu) menu.style.left = Math.max(4, Math.round(badge.getBoundingClientRect().left)) + 'px'; }; const observer = new ResizeObserver(follow); observer.observe(bar); for (const child of Array.from(bar.children)) observer.observe(child); return () => observer.disconnect(); }, []);
  useEffect(() => { const menu = menuRef.current; (menu?.querySelector?.<HTMLElement>('[aria-checked=true]') ?? menu?.querySelector?.<HTMLElement>(ITEMS))?.focus?.(); }, []);
  const sections = [...GROUPS.map(group => ({ name: group.name, specs: entries.filter(spec => !customIds.has(spec.id) && group.test(spec)) })), { name: 'Custom', specs: entries.filter(spec => customIds.has(spec.id)) }].filter(section => section.specs.length > 0);

  return <>
    <div data-interval-backdrop="" style={{ position: 'fixed', inset: 0, zIndex: 94 }} onPointerDown={() => onClose(false)}/>
    <div className="lv-popup-menu lv-interval-menu" id="lv-interval-menu" role="menu" aria-label="Chart intervals" style={style} ref={menuRef} onKeyDown={keyDown}>
      {sections.map(section => <div key={section.name} role="group" aria-label={section.name}>
        <button type="button" role="menuitem" tabIndex={-1} data-interval-group={section.name} className="lv-interval-group" aria-expanded={!collapsed.includes(section.name)} title={collapsed.includes(section.name) ? 'Show ' + section.name.toLowerCase() : 'Hide ' + section.name.toLowerCase()} onClick={() => toggleGroup(section.name)}><span>{section.name}</span><span aria-hidden="true" className="lv-interval-group-chevron">{collapsed.includes(section.name) ? '▸' : '▾'}</span></button>
        {!collapsed.includes(section.name) && section.specs.map(spec => { const favorite = checked.favorites.includes(spec.id), label = intervalLabel(spec), blocked = availability(spec.id); return <div key={spec.id} className="lv-interval-row" data-unavailable={blocked !== null ? '' : undefined} data-favorite={favorite ? '' : undefined} title={blocked ?? undefined}>
          <button type="button" role="menuitemradio" aria-checked={spec.id === checkedId} aria-disabled={blocked !== null || undefined} disabled={blocked !== null} title={blocked ?? undefined} aria-describedby={blocked !== null ? reasonId(spec.id) : undefined} tabIndex={-1} onClick={() => choose(spec.id, checked)}><span>{label}</span></button>
          {blocked !== null && <span id={reasonId(spec.id)} className="lv-sr-only">{blocked}</span>}
          {customIds.has(spec.id) && <button type="button" role="menuitem" aria-label={'Remove ' + label} title="Remove custom interval" tabIndex={-1} onClick={() => removeCustom(spec.id)}>{'×'}</button>}
          {spec !== extraRange && <button type="button" role="menuitemcheckbox" aria-checked={favorite} aria-label={'Favorite ' + label} title={favorite ? 'Remove from toolbar' : 'Add to toolbar'} tabIndex={-1} onClick={() => toggleFavorite(spec.id)}>{favorite ? '★' : '☆'}</button>}
        </div>; })}
      </div>)}
      <div role="separator" className="lv-popup-separator"/>
      <form className="lv-interval-custom" onSubmit={addCustom}><input aria-label="Custom interval" maxLength={40} value={custom} placeholder="Add custom interval" title="A number in the chosen unit, or text such as 2h or 90m" onChange={event => { setCustom(event.target.value); setError(''); }}/><select aria-label="Custom interval unit" tabIndex={-1} value={unit} onChange={event => { setUnit(event.target.value); setError(''); }}>{CUSTOM_UNITS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button type="submit" tabIndex={-1}>Add</button></form>
      {error && <p role="alert" className="lv-interval-error">{error}</p>}
      <div role="separator" className="lv-popup-separator"/>
      <button type="button" role="menuitem" tabIndex={-1} onClick={() => { onClose(true); onAdvanced(); }}><span>Advanced interval settings...</span></button>
    </div>
  </>;
}

/** The first menu open probed every row's source at once (each probe aggregates the bars to that
 * interval: 150-190 ms on the demo). After the chart is up, and again when the chart's data changes, the same probes run here
 * one row per idle slice, so they land in the interval module's aggregation cache and the menu's own probes are cache hits.
 * Rendering nothing and reading only, it changes no result: the menu still computes every row itself when it opens. A live tick
 * (new bars, same source) does not re-run it: it runs once per source, interval and policy. */
let prewarmedKey: string | null = null;
export function IntervalMenuPrewarm({ datasets, current, state }: { datasets: BarDataset[]; current: BarDataset; state: IntervalMenuState }) {
  useEffect(() => {
    let checked: IntervalMenuState; try { checked = restoreIntervalMenuState(state); } catch { return; }
    const currentId = safeId(current.resolution);
    let key: string; try { key = intervalDatasetKey(current) + '|' + currentId + '|' + JSON.stringify(checked.policy) + '|' + datasets.length; } catch { return; }
    if (key === prewarmedKey) return; prewarmedKey = key;
    const ids = intervalMenuEntries(checked).map(spec => spec.id).filter(id => id !== currentId && !looksLikeRangeInterval(id));
    let finished = false;
    const cancel = runIdleSteps(ids.map(id => () => { resolveIntervalSwitch(datasets, current, id, checked.policy, true); }), () => { finished = true; }, { timeout: 2000 });
    // Cut short (new bars or a new source before the last slice): the next run starts again.
    return () => { cancel(); if (!finished && prewarmedKey === key) prewarmedKey = null; };
  }, [datasets, current, state]);
  return null;
}
