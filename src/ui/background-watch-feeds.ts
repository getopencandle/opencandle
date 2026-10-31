import type { BarDataset } from '../domain/types';
import type { LiveHandle } from '../domain/live-provider';
import { ALPACA_CAP_MESSAGE, ALPACA_IEX_PROVIDER_ID, ALPACA_MAX_SYMBOLS, ALPACA_STUB_PROVIDER_ID } from '../domain/alpaca-live';
import { closedViewDataset, evaluateListAlerts, listAlertDelivery, listAlertNotificationToLocal, type ListAlert, type ListAlertsBatch, type ListAlertSession } from '../domain/watchlist-alerts';
import type { AlertDeliveryItem } from '../domain/alert-delivery';
import { barIntervalMs, regularSessionBars, sessionsApply } from '../chart/session-zones';
import type { WatchBook } from '../watchlists/model';
import { WATCH_OVER_CAP_TEXT, watchOverCapTitle, type WatchFeed, type WatchFeedPlan, type WatchRowNote } from '../watchlists/live-watch';

/**
 * Owns the background feeds of `planWatchFeeds` (watchlist rows and list-alert members no chart streams). Each
 * planned dataset id gets one handle; a plan without it closes it. Watchlist-only feeds open as yielding Alpaca handles, so
 * a chart, alert or paper feed that needs the slot takes it; the row then says it is not streaming. Snapshots are published
 * at most once per `intervalMs` (the App's live UI rate). Nothing here reads or writes the workspace.
 */
export interface WatchFeedHostDeps {
  open: (feed: WatchFeed, onEvicted: () => void) => LiveHandle | null;
  publish: (datasets: readonly BarDataset[], notes: ReadonlyMap<string, WatchRowNote>) => void;
  intervalMs?: number;
  max?: number;
}
interface Watch { feed: WatchFeed; key: string; handle: LiveHandle; off: () => void }
export class WatchFeedHost {
  private readonly watches = new Map<string, Watch>();
  private readonly refused = new Map<string, string>();
  private notes: Map<string, WatchRowNote> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = 0;
  private disposed = false;
  constructor(private readonly deps: WatchFeedHostDeps) {}

  sync(plan: WatchFeedPlan): void {
    if (this.disposed) return;
    const wanted = new Map(plan.feeds.map(feed => [feed.datasetId, feed] as const));
    for (const [id, watch] of [...this.watches]) if (!wanted.has(id) || wanted.get(id)!.priority !== watch.feed.priority) this.stop(id, watch);
    this.refused.clear();
    for (const feed of plan.feeds) {
      if (this.watches.has(feed.datasetId)) continue;
      let handle: LiveHandle | null = null, reason = 'Its live data could not be opened.';
      try { handle = this.deps.open(feed, () => this.evicted(feed.datasetId)); } catch (cause) { reason = cause instanceof Error ? cause.message : String(cause); }
      if (!handle) { this.refused.set(feed.marketKey, reason); continue; }
      const owned = handle, watch: Watch = { feed, key: feed.marketKey, handle: owned, off: () => undefined };
      watch.off = owned.onChange(() => this.queue());
      this.watches.set(feed.datasetId, watch);
    }
    const max = this.deps.max ?? ALPACA_MAX_SYMBOLS;
    this.notes = new Map(plan.notes);
    for (const [key, reason] of this.refused) this.notes.set(key, reason === ALPACA_CAP_MESSAGE ? { text: WATCH_OVER_CAP_TEXT, title: watchOverCapTitle(max) } : { text: 'NO LIVE', title: 'Not streaming: ' + reason });
    this.flush();
  }
  datasets(): BarDataset[] { return [...this.watches.values()].map(watch => watch.handle.dataset()); }
  /** Live dataset ids this host holds open. */
  heldIds(): Set<string> { return new Set(this.watches.keys()); }
  dispose(): void { this.disposed = true; if (this.timer !== null) clearTimeout(this.timer); this.timer = null; for (const [id, watch] of [...this.watches]) this.stop(id, watch); }

  private evicted(datasetId: string): void {
    const watch = this.watches.get(datasetId); if (!watch) return;
    this.watches.delete(datasetId); watch.off();
    const max = this.deps.max ?? ALPACA_MAX_SYMBOLS;
    this.notes.set(watch.key, { text: WATCH_OVER_CAP_TEXT, title: watchOverCapTitle(max) });
    this.queue();
  }
  private stop(id: string, watch: Watch): void { this.watches.delete(id); watch.off(); try { watch.handle.close(); } catch { /* already closed */ } }
  private queue(): void {
    if (this.disposed) return;
    const interval = this.deps.intervalMs ?? 1000, wait = interval - (Date.now() - this.last);
    if (wait <= 0) { this.flush(); return; }
    if (this.timer === null) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, wait);
  }
  private flush(): void {
    if (this.disposed) return;
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.last = Date.now();
    try { this.deps.publish(this.datasets(), new Map(this.notes)); } catch { /* a publish failure never stops the feeds */ }
  }
}

/** True for a live Alpaca IEX dataset: one venue's prints, pre-market and after-hours included, no session field. */
const alpacaUnfiltered = (dataset: BarDataset) => (dataset.provenance.providerId === ALPACA_IEX_PROVIDER_ID || dataset.provenance.providerId === ALPACA_STUB_PROVIDER_ID) && dataset.provenance.session === 'unknown' && dataset.provenance.datasetId.startsWith('live:');
/**
 * List alerts gate members by session. Alpaca IEX bars carry no session field, so a Regular
 * list alert reads the bars that open 09:30-16:00 New York time and an Extended one reads every bar (basis 'all'). Daily
 * bars are taken as published for both. Other sources pass unchanged. The session filter applies to completed bars; a forming
 * last bar stays last, so the evaluation's own closed view (evaluateListAlert) removes it and never a completed bar.
 */
export function listAlertSessionDatasets(datasets: readonly BarDataset[], session: ListAlertSession): BarDataset[] {
  return datasets.map(dataset => {
    if (!alpacaUnfiltered(dataset)) return dataset;
    const closed = closedViewDataset(dataset), forming = closed !== dataset ? dataset.bars.at(-1) : undefined;
    const intraday = sessionsApply(dataset.instrument.assetClass, dataset.instrument.timezone, barIntervalMs(dataset.bars));
    const kept = session === 'regular' && intraday ? regularSessionBars(closed.bars) : closed.bars;
    return { ...dataset, bars: forming ? [...kept, forming] : kept, provenance: { ...dataset.provenance, session: session === 'regular' ? 'regular' : 'all' } };
  });
}
/** evaluateListAlerts with each alert reading the session view it asked for. Order and unchanged identity are kept. */
export function evaluateLiveListAlerts(alerts: readonly ListAlert[], book: WatchBook, datasets: readonly BarDataset[]): ListAlertsBatch {
  const views = new Map<ListAlertSession, BarDataset[]>(), out: ListAlert[] = [], batch: ListAlertsBatch = { alerts: alerts as ListAlert[], notifications: [], diagnostics: [], changed: false };
  for (const alert of alerts) {
    let view = views.get(alert.session); if (!view) { view = listAlertSessionDatasets(datasets, alert.session); views.set(alert.session, view); }
    const one = evaluateListAlerts([alert], book, view);
    out.push(one.alerts[0]); batch.notifications.push(...one.notifications); batch.diagnostics.push(...one.diagnostics);
    if (one.changed) batch.changed = true;
  }
  if (batch.changed) batch.alerts = out;
  batch.diagnostics = [...new Set(batch.diagnostics)];
  return batch;
}
/**
 * One evaluation pass of the saved list alerts over the watchlist quotes, as the App runs it on every quote update. Null when
 * nothing changed: a forming-bar tick changes no member state, so it causes no workspace write. A member that reaches a new
 * completed bar or triggers does (at most once per completed bar). Triggers of members on the synthetic Alpaca stub are named
 * SYNTHETIC in their popup, sound and desktop notice.
 */
export function liveListAlertStep(saved: readonly ListAlert[] | undefined, book: WatchBook, datasets: readonly BarDataset[]): { alerts: ListAlert[]; deliveries: AlertDeliveryItem[] } | null {
  if (!saved?.length) return null;
  const batch = evaluateLiveListAlerts(saved, book, datasets);
  if (!batch.changed) return null;
  const synthetic = new Set(datasets.filter(row => row.provenance.providerId === ALPACA_STUB_PROVIDER_ID).map(row => row.instrument.exchange + ':' + row.instrument.symbol));
  // A list alert's own webhook joins the LV default delivery.
  const byId = new Map(batch.alerts.map(alert => [alert.id, alert]));
  return { alerts: batch.alerts, deliveries: batch.notifications.map(row => { const local = listAlertNotificationToLocal(row); return { notification: synthetic.has(row.memberKey) ? { ...local, name: 'SYNTHETIC ' + local.name } : local, delivery: listAlertDelivery(byId.get(row.alertId)) }; }) };
}
