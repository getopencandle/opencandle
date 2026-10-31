import { advancePaperClock, type PaperAccount } from './paper';

/**
 * The earliest expiry among working or triggered orders, or null. Read-only.
 */
export function nextPaperExpiry(account: { orders: ReadonlyArray<{ status: string; expiresAt?: number }> }): number | null {
  let next: number | null = null;
  for (const order of account.orders) if ((order.status === 'working' || order.status === 'triggered') && typeof order.expiresAt === 'number' && (next === null || order.expiresAt < next)) next = order.expiresAt;
  return next;
}
/** The chart whose last bar supplies the data time. */
export interface PaperSweepSource { instrumentId: string; assetClass?: string }
/**
 * The host's expiry sweep. `dataTime` is the chart's data time (its last bar), never the wall clock: a
 * wall-clock jump would make imported or historical quotes stale, so their working orders could never fill. When the virtual
 * clock (the later of the account clock and dataTime) has reached the earliest expiry, the account clock advances and every
 * due Day or GTD order expires. Returns null when nothing is due or the engine refused.
 * With `source`, a chart only drives the clock for its own instrument. Economic or other non-tradable series (FRED,
 * whose bars run into the future) never move the paper clock, and a stock chart only expires orders on its own symbol.
 */
export function sweepPaperExpiry(account: PaperAccount, dataTime: number, source?: PaperSweepSource): PaperAccount | null {
  if (source && !['stock', 'etf'].includes(source.assetClass ?? 'stock')) return null;
  const scoped = source ? { orders: account.orders.filter(order => order.instrument.id === source.instrumentId) } : account;
  const due = nextPaperExpiry(scoped), now = Math.max(account.clock, Number.isSafeInteger(dataTime) ? dataTime : 0);
  if (due === null || due > now) return null;
  const step = advancePaperClock(account, now);
  return step.ok && step.account !== account ? step.account : null;
}
