import type { PaperAccount, PaperEvent } from './paper';
import type { PaperExportTable } from './paper-export';

/**
 * The paper dock Journal. One chronological log of every account event: order events (placed, modified,
 * cancelled, stop triggered, filled, rejected, expired) from `account.events`, plus account entries (the account opening, resets
 * and settings changes) from `account.journal`. The account opening row is derived from createdAt and the starting balance,
 * never stored. LV has no deposits (virtual money only), so funding appears as the opening and reset rows. Wording, groups and
 * columns are our own choice (the journal is text order events with times; search, menu and retention are unknown).
 */
export type PaperJournalKind = 'opened' | 'reset' | 'settings' | PaperEvent['type'];
export type PaperJournalFilter = 'all' | 'placed' | 'modified' | 'cancelled' | 'triggered' | 'filled' | 'rejected' | 'expired' | 'account';
export const PAPER_JOURNAL_FILTERS: ReadonlyArray<{ id: PaperJournalFilter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'placed', label: 'Placed' }, { id: 'modified', label: 'Modified' }, { id: 'cancelled', label: 'Cancelled' },
  { id: 'triggered', label: 'Triggered' }, { id: 'filled', label: 'Filled' }, { id: 'rejected', label: 'Rejected' }, { id: 'expired', label: 'Expired' }, { id: 'account', label: 'Account' },
];
export const PAPER_JOURNAL_LABELS: Record<PaperJournalKind, string> = {
  opened: 'Account opened', reset: 'Account reset', settings: 'Settings changed', submitted: 'Order placed', modified: 'Order modified',
  cancelled: 'Order cancelled', triggered: 'Stop triggered', filled: 'Order filled', rejected: 'Order rejected', expired: 'Order expired',
};
export interface PaperJournalRow { key: string; at: number; kind: PaperJournalKind; event: string; symbol: string; orderId: string; details: string; }

const groupOf = (kind: PaperJournalKind): Exclude<PaperJournalFilter, 'all'> => kind === 'submitted' ? 'placed' : kind === 'opened' || kind === 'reset' || kind === 'settings' ? 'account' : kind;

/** Oldest first. At equal times account rows come before order events, and each source keeps its own sequence order. */
export function paperJournalRows(account: PaperAccount): PaperJournalRow[] {
  const symbols = new Map(account.orders.map(order => [order.id, order.instrument.symbol]));
  const opened: PaperJournalRow = { key: 'opened', at: account.createdAt, kind: 'opened', event: PAPER_JOURNAL_LABELS.opened, symbol: '', orderId: '', details: `Starting balance ${account.settings.initialBalance} ${account.settings.currency} (virtual).` };
  const entries = (account.journal ?? []).map((entry, index): PaperJournalRow & { rank: number } => ({ key: `entry:${entry.id}`, at: entry.at, kind: entry.type, event: PAPER_JOURNAL_LABELS[entry.type], symbol: '', orderId: '', details: entry.message, rank: index }));
  const events = account.events.map((event, index): PaperJournalRow & { rank: number } => ({ key: `event:${event.id}`, at: event.at, kind: event.type, event: PAPER_JOURNAL_LABELS[event.type], symbol: symbols.get(event.orderId) ?? '', orderId: event.orderId, details: event.message, rank: 1e7 + index }));
  // The opening row belongs to this account generation; a reset entry at the same time already says the account (re)started.
  const resetHere = entries.some(row => row.kind === 'reset' && row.at === account.createdAt);
  const rows = [...(resetHere ? [] : [{ ...opened, rank: -1 }]), ...entries, ...events].sort((a, b) => a.at - b.at || a.rank - b.rank);
  return rows.map(({ rank: _rank, ...row }) => row);
}

/** Newest first, the order the dock shows. `query` is a case-insensitive search over event, symbol and details. */
export function filterPaperJournal(rows: readonly PaperJournalRow[], filter: PaperJournalFilter, query = ''): PaperJournalRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => (filter === 'all' || groupOf(row.kind) === filter) && (!needle || `${row.event} ${row.symbol} ${row.details}`.toLowerCase().includes(needle))).reverse();
}

export function paperJournalCounts(rows: readonly PaperJournalRow[]): Record<PaperJournalFilter, number> {
  const counts = Object.fromEntries(PAPER_JOURNAL_FILTERS.map(row => [row.id, 0])) as Record<PaperJournalFilter, number>;
  for (const row of rows) { counts.all++; counts[groupOf(row.kind)]++; }
  return counts;
}

/** The dock Journal as a CSV table for the existing export path (exportPaperCsv). Same rows and order as on screen. */
export function paperJournalExportTable(account: PaperAccount, filter: PaperJournalFilter = 'all', query = ''): PaperExportTable {
  return { kind: 'journal', fileName: 'OpenCandle-virtual-journal.csv', columns: ['Time (UTC)', 'Event', 'Symbol', 'Order', 'Details'], rows: filterPaperJournal(paperJournalRows(account), filter, query).map(row => [new Date(row.at * 1000).toISOString(), row.event, row.symbol, row.orderId, row.details]) };
}
