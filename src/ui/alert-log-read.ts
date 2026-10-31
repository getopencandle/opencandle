/**
 * The read state of the Alerts log (the right sidebar's Alerts page counts unread alert
 * notifications, labelled "{count} unread alert notification(s)").
 *
 * Policy:
 * - A log entry is unread until it is marked read, one at a time or with Mark all read.
 * - Entries recorded before this store first existed count as read (the `since` watermark, Unix seconds), so the first start
 *   after an upgrade does not show the whole history as new. A replay trigger on a bar older than that also counts as read.
 * - The state is a per-machine view convenience kept in local storage, like the recent-symbol list. It never changes an alert
 *   or its log. Without storage it lives for the session only.
 * - At most READ_ID_LIMIT ids are kept. Ids no longer in the log are dropped whenever the state is written.
 */
export interface AlertLogEntryRef { readonly id: string; readonly at: number }
export interface AlertLogReadStore {
  isUnread: (entry: AlertLogEntryRef) => boolean;
  unreadCount: (entries: readonly AlertLogEntryRef[]) => number;
  /** Marks these entries read. `present` (the whole log) prunes ids that are gone. */
  markRead: (ids: readonly string[], present?: readonly AlertLogEntryRef[]) => void;
  /** Marks every entry of the log read. */
  markAllRead: (entries: readonly AlertLogEntryRef[]) => void;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
}
export interface AlertLogReadStorage { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }
export const ALERT_LOG_READ_KEY = 'lv.alerts.log-read.v1';
export const READ_ID_LIMIT = 20000;

export function createAlertLogReadStore(storage: AlertLogReadStorage | null, now: () => number = () => Math.floor(Date.now() / 1000)): AlertLogReadStore {
  let since = now(), read = new Set<string>(), version = 0;
  const listeners = new Set<() => void>();
  let loaded = false;
  try {
    const raw = storage?.getItem(ALERT_LOG_READ_KEY);
    if (raw) {
      const value = JSON.parse(raw) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as { v?: unknown; since?: unknown; read?: unknown };
        if (record.v === 1 && Number.isSafeInteger(record.since) && (record.since as number) >= 0 && Array.isArray(record.read) && record.read.every(id => typeof id === 'string' && id.length > 0 && id.length <= 100000)) {
          since = record.since as number; read = new Set((record.read as string[]).slice(-READ_ID_LIMIT)); loaded = true;
        }
      }
    }
  } catch { /* An unreadable state starts fresh below. */ }
  const save = () => { try { storage?.setItem(ALERT_LOG_READ_KEY, JSON.stringify({ v: 1, since, read: [...read] })); } catch { /* Session only. */ } };
  if (!loaded) save();
  const changed = () => { version++; save(); for (const listener of [...listeners]) { try { listener(); } catch { /* A listener never blocks others. */ } } };
  const prune = (present?: readonly AlertLogEntryRef[]) => {
    if (present) { const keep = new Set(present.map(entry => entry.id)); for (const id of read) if (!keep.has(id)) read.delete(id); }
    if (read.size > READ_ID_LIMIT) read = new Set([...read].slice(-READ_ID_LIMIT));
  };
  const isUnread = (entry: AlertLogEntryRef) => entry.at >= since && !read.has(entry.id);
  return {
    isUnread,
    unreadCount: entries => entries.reduce((count, entry) => count + (isUnread(entry) ? 1 : 0), 0),
    markRead(ids, present) {
      const fresh = ids.filter(id => !read.has(id));
      if (!fresh.length) return;
      for (const id of fresh) read.add(id);
      prune(present); changed();
    },
    markAllRead(entries) {
      const unread = entries.filter(isUnread);
      if (!unread.length) return;
      for (const entry of unread) read.add(entry.id);
      prune(entries); changed();
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    version: () => version,
  };
}

let shared: AlertLogReadStore | null = null;
/** One store per window, over the window's local storage. */
export function sharedAlertLogReadStore(): AlertLogReadStore {
  if (shared) return shared;
  let storage: AlertLogReadStorage | null = null;
  try { storage = (globalThis as { localStorage?: AlertLogReadStorage }).localStorage ?? null; } catch { storage = null; }
  return shared = createAlertLogReadStore(storage);
}
