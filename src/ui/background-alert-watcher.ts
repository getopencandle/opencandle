import {hasNyseAlertCalculation,nyseAlertGroupKey} from '../domain/nyse-mtf-alert-source';
import { liveAlertView,liveAlertCompletionFacts } from '../domain/live-history';
import {technicalAlertEstimatedWork,technicalAlertEstimatedSlots,technicalSourceKey,TECHNICAL_ALERT_LIMITS} from '../domain/technical-alerts';
import { processLocalAlertBatch, type AlertEvent, type LocalAlert } from '../domain/alerts';
import type { BarDataset } from '../domain/types';
import type { LiveHandle } from '../domain/live-provider';
import { renderNewAlertMessages } from '../domain/alert-message';
import { planBackgroundAlertFeeds, type BackgroundFeed, type BackgroundPlan } from './background-alert-plan';
import { TechnicalAlertObserver,technicalEvaluationGroup } from './technical-alert-observer';
import { createTechnicalScriptEvaluator } from './script-alert-evaluator';
import { alertDatasetKey,type AlertSourceSnapshot } from '../domain/alert-observation';
import { indicatorVwapKernelVersion } from '../domain/indicators';
import { createBackgroundVwapEvaluator } from '../domain/vwap-background-kernel';
import { applicationVwapClient } from '../vwap/application-client';
import type { VwapClient } from '../vwap/types';
import { subscribeSecondSymbols, type SecondSeries } from '../domain/second-symbol';
import { alertSecondSymbolReads } from '../domain/second-symbol-alerts';

/**
 * Evaluates saved alerts on every symbol except the charted one, each from its own live feed. A feed is shared by all
 * alerts of that symbol and interval, opened only while one of them is watchable, and closed with the last of them. Each
 * feed has its own observer that adopts the alerts' saved sessions, so a trigger is recorded exactly as it would be on the
 * chart. Nothing here reads or writes storage: `publish` is the app's alert publisher and may refuse; a refused save is
 * rolled back and the same trigger is offered again on the feed's next update.
 */
export interface BackgroundWatcherDeps {
  open: (feed: BackgroundFeed) => LiveHandle | null;
  alerts: () => readonly LocalAlert[];
  publish: (next: LocalAlert[], expected: LocalAlert[]) => boolean | void;
  now?: () => number;
  identity: () => string;
  /** US symbols the app's charts already stream (they share the Alpaca symbol limit). */
  openAlpacaSymbols: () => ReadonlySet<string>;
  /** False while a workspace operation or save holds the alerts; the update is kept and retried on the next one. */
  ready?: () => boolean;
  /** This instrument's drawings from the saved workspace (the older 'drawing' alert kind). Absent: none. */
  drawings?: (instrumentId: string) => readonly unknown[] | null;
  /** The VWAP service for kernel 2 alerts. Absent: the application service (its worker). */
  vwapClient?: () => VwapClient;
  /** The second series of two-symbol alerts. Absent: the application second-symbol registry and loader
   * (the same feeds as chart indicators and script requests, with a lease per feed). */
  secondSeries?: (symbol: string, resolution: string) => SecondSeries;
}
/** One observer per failure domain of a feed: SHARED for every ordinary source, and one per VWAP kernel 2 alert. */
interface Watch { feed: BackgroundFeed; handle: LiveHandle; observers: Map<string, TechnicalAlertObserver>; off: () => void; running: Promise<void> | null; dirty: boolean }
const SHARED = 'shared';
const ownedObserverUsage=TechnicalAlertObserver.prototype.retainedUsage,ownedCancel=TechnicalAlertObserver.prototype.cancelPending,ownedInvalidate=TechnicalAlertObserver.prototype.invalidate;
/** The evaluation group of an alert. A VWAP kernel 2 source runs in the asynchronous worker and can fail on its
 * own (budget, queue, deadline, volume), and a failed batch gives none of its alerts a value. So each such alert is its own
 * group (one VWAP must never stop the other alerts of its feed). */
export function backgroundAlertGroup(alert: LocalAlert): string {
  const source = alert.definition.observationBinding?.source;
  if (!source) return SHARED;
  const operands = source.kind === 'comparison' ? [source.left, source.right] : [source];
  if(hasNyseAlertCalculation(source))return nyseAlertGroupKey(source);
  const exact = operands.some(operand => { if (operand.kind !== 'indicator' || operand.indicator !== 'vwap') return false; try { return indicatorVwapKernelVersion(operand.inputs) === 2; } catch { return true; } });
  return exact ? 'vwap:' + alert.definition.id : SHARED;
}

export class BackgroundAlertWatcher {
  private readonly watches = new Map<string, Watch>();
  private disposed = false;
  private readonly offSecond: () => void;
  constructor(private readonly deps: BackgroundWatcherDeps) {
    // A second series that arrives or ticks re-evaluates the feeds whose alerts read one, so an alert
    // waiting for it resumes without waiting for its own feed's next update.
    this.offSecond = subscribeSecondSymbols(() => { if (this.disposed) return; for (const watch of [...this.watches.values()]) if (this.readsSecond(watch)) this.schedule(watch); });
  }

  /** Opens and closes feeds to match the saved alerts. Returns what is watched and what cannot be, with plain reasons. */
  sync(activeInstrumentId: string,activeDatasetId?:string,activeResolution?:string): BackgroundPlan {
    if (this.disposed) return { feeds: [], skipped: [] };
    const plan = planBackgroundAlertFeeds({ alerts: this.deps.alerts(), activeInstrumentId,activeDatasetId,activeResolution,openAlpacaSymbols: this.deps.openAlpacaSymbols() });
    const wanted = new Set(plan.feeds.map(feed => feed.datasetId));
    if([...this.watches.values()].some(watch=>watch.feed.family==='nyse-daily')){const failures:unknown[]=[];for(const [id,watch]of [...this.watches])if(!wanted.has(id))try{this.stop(id,watch);}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Daily alert handoff cleanup failed.');}
    else for (const [id, watch] of [...this.watches]) if (!wanted.has(id)) this.stop(id, watch);
    const kept: BackgroundFeed[] = [];
    for (const feed of plan.feeds) {
      const existing = this.watches.get(feed.datasetId);
      if (existing) { existing.feed = feed; kept.push(feed); continue; }
      let handle: LiveHandle | null = null;
      try { handle = this.deps.open(feed); } catch { handle = null; }
      if (!handle) { for (const alertId of feed.alertIds) plan.skipped.push({ alertId, reason: 'Its live data could not be opened, so it is only checked while that chart is open.' }); continue; }
      const watch: Watch = { feed, handle, observers: new Map(), off: () => undefined, running: null, dirty: false };
      watch.off = handle.onChange(() => this.schedule(watch));
      this.watches.set(feed.datasetId, watch); kept.push(feed);
      this.schedule(watch);
    }
    return { feeds: kept, skipped: plan.skipped };
  }
  /** Resolves when no feed is evaluating. */
  async settled(): Promise<void> { while ([...this.watches.values()].some(watch => watch.running)) await Promise.all([...this.watches.values()].map(watch => watch.running)); }
  dispose(): void {
    if([...this.watches.values()].some(watch=>watch.feed.family==='nyse-daily')){this.disposed=true;const failures:unknown[]=[];for(const [id,watch]of [...this.watches])try{this.stop(id,watch);}catch(error){failures.push(error);}try{this.offSecond();}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Daily alert watcher cleanup failed.');return;}
    this.disposed = true; this.offSecond(); for (const [id, watch] of [...this.watches]) this.stop(id, watch);
  }

  private stop(id: string, watch: Watch): void {
    if(watch.feed.family==='nyse-daily'){
      if(this.watches.get(id)!==watch)return;this.watches.delete(id);watch.dirty=false;
      const observers=[...watch.observers.values()];watch.observers.clear();const failures:unknown[]=[];
      for(const observer of observers)for(const release of [()=>observer.reset(),()=>observer.dispose()])try{release();}catch(error){failures.push(error);}
      for(const release of [watch.off,()=>watch.handle.close()])try{release();}catch(error){failures.push(error);}
      if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Daily alert feed cleanup failed.');return;
    }
    this.watches.delete(id); watch.off(); for (const observer of watch.observers.values()) { observer.reset(); observer.dispose(); } watch.observers.clear(); try { watch.handle.close(); } catch { /* a feed that will not close is already gone */ }
  }
  private readsSecond(watch: Watch): boolean {
    const watched = new Set(watch.feed.alertIds);
    return this.deps.alerts().some(alert => watched.has(alert.definition.id) && !!alert.definition.observationBinding && alertSecondSymbolReads(alert.definition.observationBinding.source).length > 0);
  }
  private observer(watch: Watch, group: string): TechnicalAlertObserver {
    let observer = watch.observers.get(group);
    if (!observer) { observer = new TechnicalAlertObserver(this.deps.identity, undefined, view => { if (view.closedEvents?.length) this.publish(watch, view.closedEvents, liveAlertView(watch.handle.dataset())); }); watch.observers.set(group, observer); }
    return observer;
  }
  private schedule(watch: Watch): void {
    if (this.disposed) return;
    watch.dirty = true;
    if (watch.running) return;
    watch.running = (async () => {
      try { while (watch.dirty && !this.disposed && this.watches.get(watch.feed.datasetId) === watch) { watch.dirty = false; await this.evaluate(watch); } }
      finally { watch.running = null; }
    })();
  }
  private async evaluate(watch: Watch): Promise<void> {
    if (this.deps.ready && !this.deps.ready()) return;
    const dataset = liveAlertView(watch.handle.dataset());
    if (!dataset.bars.length) return;
    const now = this.deps.now?.() ?? Math.floor(Date.now() / 1000);
    // Only the alerts the plan watches on this feed.
    const watched = new Set(watch.feed.alertIds), relevant = this.deps.alerts().filter(alert => alert.definition.instrumentId === watch.feed.instrumentId && watched.has(alert.definition.id));
    const groups = new Map<string, LocalAlert[]>();
    for (const alert of relevant) { const group = backgroundAlertGroup(alert); groups.set(group, [...(groups.get(group) ?? []), alert]); }
    for (const [group, observer] of [...watch.observers]) if (!groups.has(group)) { observer.reset(); observer.dispose(); watch.observers.delete(group); }
    if(watch.feed.family==='nyse-daily'){
      if(this.disposed||this.watches.get(watch.feed.datasetId)!==watch)return;
      const observers=[...watch.observers.values()],failures:unknown[]=[];for(const observer of observers)try{ownedCancel.call(observer);}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Daily alert feed numerical retirement failed.');
      let admitted=false;try{const partitions:AlertSourceSnapshot[][]=[];for(const list of groups.values()){const members=new Map<string,Map<string,AlertSourceSnapshot>>();for(const alert of list){if(!['active','waiting-for-data'].includes(alert.status))continue;const source=alert.definition.observationBinding?.source;if(!source)continue;const key=technicalSourceKey(source),group=technicalEvaluationGroup(source,key);let partition=members.get(group);if(!partition){partition=new Map();members.set(group,partition);}partition.set(key,source);}for(const partition of members.values())partitions.push([...partition.values()]);}
        const qualified=partitions.some(members=>members.some(hasNyseAlertCalculation)),facts=qualified?liveAlertCompletionFacts(dataset,dataset.bars,'ordinary'):null;
        if(!qualified||facts){const retained=observers.reduce((sum,observer)=>{const usage=ownedObserverUsage.call(observer);return{work:sum.work+usage.work,slots:sum.slots+usage.slots};},{work:0,slots:0}),work=partitions.reduce((sum,members)=>sum+technicalAlertEstimatedWork(dataset.bars.length,members,facts?.sourceRows??dataset.bars.length),0)+retained.work,slots=partitions.reduce((sum,members)=>sum+technicalAlertEstimatedSlots(dataset.bars.length,members,facts?.sourceRows??dataset.bars.length),0)+retained.slots+7*dataset.bars.length*groups.size;admitted=work<=TECHNICAL_ALERT_LIMITS.operations&&slots<=TECHNICAL_ALERT_LIMITS.numericSlots;}
      }catch{/* Unsupported declarations or source membership withhold this whole feed calculation. */}
      if(!admitted){const failures:unknown[]=[];for(const observer of observers)try{ownedInvalidate.call(observer);}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Daily alert feed refusal cleanup failed.');return;}
    }
    let drawings: readonly unknown[] | null = null;
    try { drawings = this.deps.drawings?.(watch.feed.instrumentId) ?? null; } catch { drawings = null; }
    // Each group is its own batch and its own publication, so a failure stays with its alerts.
    for (const [group, list] of groups) {
      if (this.disposed || this.watches.get(watch.feed.datasetId) !== watch) return;
      try {
        const vwap = group === SHARED ? undefined : this.backgroundVwap(watch, dataset);
        const publication = await this.observer(watch, group).observeForPublication({ dataset, bars: dataset.bars, chartId: 'background', replay: null, assumeReplayCompletion: false, selectedSource: null, alerts: list, script: createTechnicalScriptEvaluator({ dataset }), adopt: true, drawings, ...(vwap ? { vwap } : {}), ...(this.deps.secondSeries ? { secondSeries: this.deps.secondSeries } : {}) }, now);
        if(this.disposed||this.watches.get(watch.feed.datasetId)!==watch){publication.rollback();continue;}
        if (publication.view.cancelled) { publication.rollback(); continue; }
        const events = [...(publication.view.closedEvents ?? []), ...publication.view.events];
        // The collection is read again for each group: an earlier group may just have published.
        if (!events.length || !this.publishNow(this.deps.alerts(), events, dataset, now, watch)) { if (events.length) publication.rollback(); else publication.commit(); continue; }
        publication.commit();
      } catch { /* a failed group never stops the feed or the other groups; the next update evaluates again */ }
    }
  }
  private backgroundVwap(watch: Watch, dataset: BarDataset) {
    let sourceBasis: string;
    try { sourceBasis = alertDatasetKey(dataset, 2); } catch { return undefined; }
    return createBackgroundVwapEvaluator({ bars: dataset.bars, sourceBasis, sourceRevision: dataset.provenance.revision, isCurrent: () => !this.disposed && this.watches.get(watch.feed.datasetId) === watch, client: this.deps.vwapClient ?? applicationVwapClient });
  }
  private publish(watch: Watch, events: readonly AlertEvent[], dataset: BarDataset): void {
    if (this.disposed || (this.deps.ready && !this.deps.ready())) return;
    this.publishNow(this.deps.alerts(), events, dataset, this.deps.now?.() ?? Math.floor(Date.now() / 1000), watch);
  }
  private publishNow(alerts: readonly LocalAlert[], events: readonly AlertEvent[], dataset: BarDataset, now: number, watch?:Watch): boolean {
    const owned=()=>!watch||watch.feed.family!=='nyse-daily'||!this.disposed&&this.watches.get(watch.feed.datasetId)===watch;if(!owned())return false;
    const processed = processLocalAlertBatch(alerts, events, now);
    if (processed.alerts === alerts) return true;
    const next = renderNewAlertMessages(alerts, processed.alerts, { dataset, bars: dataset.bars });
    if(!owned())return false;
    try { return this.deps.publish(next, alerts as LocalAlert[]) !== false; } catch { return false; }
  }
}
