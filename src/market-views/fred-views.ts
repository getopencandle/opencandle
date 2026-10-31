import type { Bar, BarDataset } from '../domain/types';
import { FRED_PROVIDER_ID, loadFredDataset } from '../domain/fred';

/**
 * On-demand FRED loads for the Macro and Yield views. Series already open in the workspace are used as they are.
 * Anything else is requested one at a time through the existing FRED bridge (its 5 MB local cache answers first; a fresh copy
 * needs no request). Nothing is requested when FRED downloads are off. No keys, no accounts, no bulk download.
 */
export interface FredSeriesState { id: string; bars: Bar[]; status: 'ready' | 'stale' | 'missing'; notice: string | null; fromWorkspace: boolean }
export const FRED_OFF_NOTICE = 'FRED downloads are turned off (Data sources, Economic data). Only series already open in this workspace are used.';

export function workspaceFredSeries(datasets: readonly BarDataset[], id: string): BarDataset | null {
  return datasets.find(d => d.provenance.providerId === FRED_PROVIDER_ID && d.instrument.symbol === id && d.bars.length > 0) ?? null;
}
export async function loadFredSeriesList(bridge: unknown, enabled: boolean, ids: readonly string[], datasets: readonly BarDataset[],
  onEach?: (state: FredSeriesState, done: number, total: number) => void, isCurrent: () => boolean = () => true): Promise<Map<string, FredSeriesState>> {
  const out = new Map<string, FredSeriesState>(), unique = [...new Set(ids)];
  for (const id of unique) {
    if (!isCurrent()) break;
    const open = workspaceFredSeries(datasets, id);
    let state: FredSeriesState;
    if (open) state = { id, bars: open.bars, status: open.provenance.state === 'stale' ? 'stale' : 'ready', notice: null, fromWorkspace: true };
    else if (!enabled) state = { id, bars: [], status: 'missing', notice: FRED_OFF_NOTICE, fromWorkspace: false };
    else {
      const loaded = await loadFredDataset(bridge, 'FRED:' + id, true);
      state = loaded.ok ? { id, bars: loaded.dataset.bars, status: loaded.dataset.provenance.state === 'stale' ? 'stale' : 'ready', notice: loaded.notice, fromWorkspace: false }
        : { id, bars: [], status: 'missing', notice: loaded.notice, fromWorkspace: false };
    }
    out.set(id, state); onEach?.(state, out.size, unique.length);
  }
  return out;
}
/** Last value on or before `time`, but not older than `maxAgeDays`. */
export function valueAt(bars: readonly Bar[], time: number, maxAgeDays: number): { value: number; time: number } | null {
  let lo = 0, hi = bars.length - 1, hit = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].time <= time) { hit = mid; lo = mid + 1; } else hi = mid - 1; }
  if (hit < 0 || time - bars[hit].time > maxAgeDays * 86400) return null;
  return { value: bars[hit].close, time: bars[hit].time };
}
export const isoDate = (time: number) => new Date(time * 1000).toISOString().slice(0, 10);
export const parseIsoDate = (text: string): number | null => /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text + 'T00:00:00Z')) ? Date.parse(text + 'T00:00:00Z') / 1000 : null;
