// The watchlist Last cell flashes up or down when the price changes, as the reference watchlist highlights a
// price tick. The flash length (700 ms) and its LV up/down colors are our own choice. A first value, a missing value or a row
// that reappears never flashes: only a change between two shown prices of the same row does.
import { useEffect, useRef, useState } from 'react';

export type WatchTick = 'up' | 'down';
export const WATCH_TICK_FLASH_MS = 700;

/** Rows whose last price moved since the previous observation, with the direction. */
export function watchTickChanges(previous: ReadonlyMap<string, number | null>, next: ReadonlyMap<string, number | null>): Map<string, WatchTick> {
  const out = new Map<string, WatchTick>();
  for (const [id, value] of next) {
    const before = previous.get(id);
    if (value === null || before === null || before === undefined || !Number.isFinite(value) || !Number.isFinite(before) || value === before) continue;
    out.set(id, value > before ? 'up' : 'down');
  }
  return out;
}

/** Hook: the rows currently flashing. `prices` should be a new Map only when the quotes change. */
export function useWatchTickFlash(prices: ReadonlyMap<string, number | null>, duration = WATCH_TICK_FLASH_MS): ReadonlyMap<string, WatchTick> {
  const previous = useRef<ReadonlyMap<string, number | null> | null>(null), [flashing, setFlashing] = useState<ReadonlyMap<string, WatchTick>>(() => new Map());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>()), latestStamp = useRef(new Map<string, Map<string, WatchTick>>());
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); }, []);
  useEffect(() => {
    const before = previous.current; previous.current = prices;
    if (!before) return;
    const changes = watchTickChanges(before, prices);
    if (!changes.size) return;
    setFlashing(current => { const merged = new Map(current); for (const [id, tick] of changes) merged.set(id, tick); return merged; });
    // A later tick of the same row restarts its flash; each timer only clears the flash it started.
    const stamp = new Map([...changes].map(([id, tick]) => [id, tick] as const)), timer = setTimeout(() => { timers.current.delete(timer); setFlashing(current => { const kept = new Map(current); for (const id of stamp.keys()) if (latestStamp.current.get(id) === stamp) kept.delete(id); return kept; }); }, duration);
    timers.current.add(timer); for (const id of changes.keys()) latestStamp.current.set(id, stamp);
  }, [prices, duration]);
  return flashing;
}
