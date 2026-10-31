import type { Bar, BarDataset } from './types';
import {alpacaSessionCompletionInputFacts,captureAlpacaSessionCompletion} from './live-session-source';
import {captureReplayFrameCompletion,replayFrameCompletionInputMatches} from './replay-session';
import { liveLineageOf, stampLiveLineage } from '../chart/bar-input-identity';

/**
 * Lazy history for live feeds. When the visible range nears the
 * oldest loaded bar the chart asks for the previous page; the provider fetches it from its own public REST source and
 * prepends it to the same subscription. A prepend is growth of the same source: the revision string and the lineage key
 * do not change, and alert consumers read `liveAlertView`, which starts at the subscription's own first bar, so a prepend
 * is never a correction and never resets an alert. Imported and synthetic data never register a loader here.
 */
export const LIVE_NO_MORE_DATA = 'No more data';
/** 1000 bars per page, so a chart reaches its cap in a few pages. */
export const LIVE_HISTORY_PAGE_BARS = 1000;
/** Right after a live chart opens it keeps paging, with no gesture, until it holds this many bars (the
 * LiveSeries cap is 5000) or the provider has no more. Further pages follow the prefetch margin. */
export const LIVE_HISTORY_PREFETCH_BARS = 5000;
/** Bars of loaded history left of the view at which the next page is requested. */
export const LIVE_HISTORY_MARGIN_BARS = 20;
/** View widths of loaded history kept left of the view; less than this asks for the next page, so older
 * bars arrive before the edge shows (prefetch ahead of need). */
export const LIVE_HISTORY_PREFETCH_SCREENS = 2;
/** Bars a live chart may zoom or pan past its oldest loaded bar while older pages can still load (the empty
 * area waits for them). The renderer still stops at 0.5 px per bar. */
export const LIVE_HISTORY_ZOOM_ROOM_BARS = 5000;
/** Spacing between page requests of one feed, and the pause after a failed or rate-limited page: 250
 * ms. A page is one Coinbase request (its public limit is about 10 per second) or a slice of the Alpaca window already in
 * memory (the bridge spaces Alpaca's own requests), so a 1 s gap only made a zoomed-out chart fill in slowly. */
export const LIVE_HISTORY_MIN_INTERVAL_MS = 250;
export const LIVE_HISTORY_RETRY_MS = 30_000;

export type LiveHistoryStatus = 'idle' | 'loading' | 'exhausted' | 'error';
export interface LiveHistoryState { status: LiveHistoryStatus; message: string | null }
/** One page outcome as a provider reports it. */
/** 'wait' is a page that could not start yet (the feed's first history has not landed): no request was
 * made, so it is not an error and costs no 30 s pause. An error may name its own pause (`retryMs`): the desktop bridge refuses
 * every Coinbase request for 60 s after a rate limit, so a retry after 30 s only failed again and doubled the pause. */
export type LiveHistoryPage = { kind: 'added'; added: number } | { kind: 'exhausted' } | { kind: 'wait' } | { kind: 'error'; message: string; rateLimited?: boolean; retryMs?: number };

const IDLE: LiveHistoryState = Object.freeze({ status: 'idle', message: null });

/** Per-feed paging: one page in flight, spaced requests, a pause after errors, and a terminal "No more data". */
export class LiveHistoryPager {
  private current: LiveHistoryState = IDLE;
  private inflight: Promise<LiveHistoryState> | null = null;
  private nextAt = 0;
  private readonly listeners = new Set<(state: LiveHistoryState) => void>();
  constructor(private readonly loadPage: () => Promise<LiveHistoryPage>, private readonly now: () => number = () => Date.now()) {}
  state(): LiveHistoryState { return this.current; }
  subscribe(listener: (state: LiveHistoryState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  /** Request the previous page. Joins a page in flight; a call inside the spacing window, after the end, or during the
   * error pause makes no request. */
  load(): Promise<LiveHistoryState> {
    if (this.inflight) return this.inflight;
    if (this.current.status === 'exhausted' || this.now() < this.nextAt) return Promise.resolve(this.current);
    this.set({ status: 'loading', message: null });
    const run = (async () => {
      let page: LiveHistoryPage;
      try { page = await this.loadPage(); } catch (cause) { page = { kind: 'error', message: cause instanceof Error ? cause.message : String(cause) }; }
      if (page.kind === 'error') { this.nextAt = this.now() + Math.max(LIVE_HISTORY_MIN_INTERVAL_MS, page.retryMs ?? LIVE_HISTORY_RETRY_MS); this.set({ status: 'error', message: page.rateLimited ? 'Older data is rate limited. Try again in a moment.' : 'Could not load older data. Try again in a moment.' }); }
      else if (page.kind === 'exhausted') this.set({ status: 'exhausted', message: LIVE_NO_MORE_DATA });
      else if (page.kind === 'wait') { this.nextAt = this.now() + LIVE_HISTORY_MIN_INTERVAL_MS; this.set(IDLE); }
      else { this.nextAt = this.now() + LIVE_HISTORY_MIN_INTERVAL_MS; this.set(IDLE); }
      return this.current;
    })();
    this.inflight = run.finally(() => { this.inflight = null; });
    return this.inflight;
  }
  private set(state: LiveHistoryState): void {
    if (state.status === this.current.status && state.message === this.current.message) return;
    this.current = state;
    for (const listener of [...this.listeners]) { try { listener(state); } catch { /* a listener failure never stops paging */ } }
  }
}

/** Live dataset id -> pager of the open subscription. Providers register on open and unregister when the feed closes. */
const pagers = new Map<string, LiveHistoryPager>();
const stateListeners = new Map<string, Set<(state: LiveHistoryState) => void>>();
const detach = new Map<string, () => void>();
export function registerLiveHistory(datasetId: string, pager: LiveHistoryPager): void {
  unregisterLiveHistory(datasetId);
  pagers.set(datasetId, pager);
  detach.set(datasetId, pager.subscribe(state => { for (const listener of [...stateListeners.get(datasetId) ?? []]) { try { listener(state); } catch { /* ignore */ } } }));
}
export function unregisterLiveHistory(datasetId: string, pager?: LiveHistoryPager): void {
  if (pager && pagers.get(datasetId) !== pager) return;
  detach.get(datasetId)?.(); detach.delete(datasetId); pagers.delete(datasetId);
}
const holds = new Map<string, number>();
/** Hold paging for a feed (a replay run reads row positions, so its source must not grow at the front). Returns the release. */
export function holdLiveHistory(datasetId: string): () => void {
  holds.set(datasetId, (holds.get(datasetId) ?? 0) + 1); let released = false;
  return () => { if (released) return; released = true; const left = (holds.get(datasetId) ?? 1) - 1; if (left > 0) holds.set(datasetId, left); else holds.delete(datasetId); };
}
/** Ask the open live feed for its previous page. False when no live feed with paging owns this id (imports, synthetic)
 * or paging is held. */
export function requestLiveHistory(datasetId: string | null | undefined): boolean {
  const pager = typeof datasetId === 'string' && !holds.has(datasetId) ? pagers.get(datasetId) : undefined;
  if (!pager) return false;
  void pager.load();
  return true;
}
export function liveHistoryState(datasetId: string | null | undefined): LiveHistoryState | null {
  return typeof datasetId === 'string' ? pagers.get(datasetId)?.state() ?? null : null;
}
export function subscribeLiveHistory(datasetId: string, listener: (state: LiveHistoryState) => void): () => void {
  let set = stateListeners.get(datasetId); if (!set) { set = new Set(); stateListeners.set(datasetId, set); } set.add(listener);
  return () => { const current = stateListeners.get(datasetId); if (!current) return; current.delete(listener); if (!current.size) stateListeners.delete(datasetId); };
}

/** True when the view's left edge (Unix seconds) is within `margin` bars of the oldest loaded bar (or left of it). */
export function nearHistoryStart(viewFrom: number, bars: readonly Bar[], margin = LIVE_HISTORY_MARGIN_BARS): boolean {
  if (!Number.isFinite(viewFrom) || bars.length < 2) return false;
  const index = Math.min(margin, bars.length - 1);
  return viewFrom <= bars[index].time;
}

/** Bars array of a live snapshot -> time of the subscription's own first bar (set by buildLiveDataset). */
const origins = new WeakMap<readonly Bar[], number>();
export function recordLiveOrigin(bars: readonly Bar[], originTime: number | null): void { if (originTime !== null && Number.isSafeInteger(originTime)) origins.set(bars, originTime); }
const barViews = new WeakMap<readonly Bar[], Bar[]>();
const views = new WeakMap<BarDataset, BarDataset>();
// Only the actual suffix constructor writes these weak original/array bindings.
interface CompletionView {parent:WeakRef<BarDataset>;rows:WeakRef<readonly Bar[]>;parentRows:WeakRef<readonly Bar[]>;count:number;start:number;parentCount:number;instrument:WeakRef<object>|null;provenance:WeakRef<object>|null;pins:readonly unknown[]|null;alive:boolean}
const completionViews=new WeakMap<object,CompletionView>();
const COMPLETION_INSTRUMENT=['id','symbol','name','exchange','currency','assetClass','timezone','tickSize','lotSize'] as const,COMPLETION_PROVENANCE=['providerId','providerName','datasetId','revision','fixture','adjustment','session','timezone','coverage','state'] as const;
function completionData(owner:object,key:PropertyKey):unknown{const descriptor=Object.getOwnPropertyDescriptor(owner,key);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('The actual alert view requires own source data.');return descriptor.value;}
function completionMetadata(dataset:BarDataset):readonly unknown[]{const instrument=completionData(dataset,'instrument') as object,provenance=completionData(dataset,'provenance') as object;const pins=[completionData(dataset,'resolution'),...COMPLETION_INSTRUMENT.map(key=>completionData(instrument,key)),...COMPLETION_PROVENANCE.map(key=>completionData(provenance,key))];if(pins.some(value=>!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&value.length>4096||typeof value==='number'&&!Number.isFinite(value)))throw Error('Unsupported alert suffix source metadata.');return pins;}
function optionalCompletionMetadata(dataset:BarDataset):readonly unknown[]|null{try{return Object.freeze(completionMetadata(dataset));}catch{return null;}}
function currentCompletionView(dataset:BarDataset,record:CompletionView):readonly Bar[]{
 if(!record.alive)throw Error('The actual alert suffix retired.');try{const rows=record.rows.deref(),parent=record.parent.deref(),parentRows=record.parentRows.deref();if(!rows||!parent||!parentRows||views.get(parent)!==dataset||completionData(dataset,'bars')!==rows||completionData(parent,'bars')!==parentRows||rows.length!==record.count||parentRows.length!==record.parentCount||record.start<0||record.start+record.count!==record.parentCount||completionData(dataset,'instrument')!==record.instrument?.deref()||completionData(dataset,'provenance')!==record.provenance?.deref()||!record.pins)throw Error('The actual alert suffix changed.');const pins=completionMetadata(dataset);if(pins.length!==record.pins.length||pins.some((value,index)=>!Object.is(value,record.pins![index])))throw Error('The actual alert suffix source changed.');return rows;}catch(error){record.alive=false;throw error;}
}
function verifyCompletionSelection(dataset:BarDataset,rows:readonly Bar[],record:CompletionView):void{try{if(currentCompletionView(dataset,record)!==rows)throw Error('The actual alert suffix input differs.');const parentRows=record.parentRows.deref()!;for(let index=0;index<record.count;index++){const selected=Object.getOwnPropertyDescriptor(rows,String(index)),original=Object.getOwnPropertyDescriptor(parentRows,String(record.start+index));if(!selected||!original||!selected.enumerable||!original.enumerable||!Object.hasOwn(selected,'value')||!Object.hasOwn(original,'value')||selected.value!==original.value)throw Error('The actual alert suffix row is detached.');}currentCompletionView(dataset,record);}catch(error){record.alive=false;throw error;}}
function anchored(bars: readonly Bar[]): readonly Bar[] {
  const origin = origins.get(bars);
  if (origin === undefined || !bars.length || bars[0].time >= origin) return bars;
  const cached = barViews.get(bars); if (cached) return cached;
  const start = bars.findIndex(bar => bar.time >= origin);
  const view = start < 0 ? [] : bars.slice(start);
  const lineage = liveLineageOf(bars);
  if (lineage) { try { stampLiveLineage(view, lineage.key, lineage.seq); } catch { /* stays an ordinary input */ } }
  recordLiveOrigin(view, origin);
  barViews.set(bars, view);
  return view;
}
/**
 * The snapshot as alert consumers see it: bars from the subscription's own first bar, so prepended history never shifts
 * a row index, never moves the history origin and never reads as a correction. The same dataset object comes back when
 * nothing was prepended (and for every non-live dataset); a prepended snapshot maps to one stable view per snapshot, on
 * the same lineage, revision and sequence.
 */
export function liveAlertView<T extends BarDataset>(dataset: T): T {
  const bars = anchored(dataset.bars);
  if (bars === dataset.bars) return dataset;
  const cached = views.get(dataset); if (cached) return cached as T;
  const view = { ...dataset, bars: bars as Bar[] } as T;
  const parentRows=completionRows(dataset);if(parentRows)completionViews.set(view,{parent:new WeakRef(dataset),rows:new WeakRef(bars),parentRows:new WeakRef(parentRows),count:bars.length,start:parentRows.length-bars.length,parentCount:parentRows.length,instrument:view.instrument&&typeof view.instrument==='object'?new WeakRef(view.instrument):null,provenance:view.provenance&&typeof view.provenance==='object'?new WeakRef(view.provenance):null,pins:optionalCompletionMetadata(view),alive:true});
  views.set(dataset, view);
  return view;
}
/** Bars counterpart of liveAlertView for callers that hold a bars array (the chart's current input). */
export function liveAlertBars(bars: readonly Bar[]): readonly Bar[] { return anchored(bars); }

export interface LiveAlertCompletionFacts {readonly rows:number;readonly sourceRows:number;readonly resolution:string;readonly replay:boolean}
export interface LiveAlertCompletion {readonly rows:number;readonly completeRows:number;readonly coveredFrom:number;readonly closedThrough:number;assertCurrent():void}
function completionRows(dataset:BarDataset):readonly Bar[]|null{const field=Object.getOwnPropertyDescriptor(dataset,'bars');return field&&Object.hasOwn(field,'value')&&Array.isArray(field.value)?field.value:null;}
/** Fixed genuine-constructor membership only. Does not walk rows, grant a close,
 * resolve a raw source to callers, or qualify a caller-created/copy dataset. */
export function liveAlertCompletionFacts(dataset:BarDataset,rows:readonly Bar[],execution:string):LiveAlertCompletionFacts|null{
 try{
  if(!dataset||typeof dataset!=='object'||!Array.isArray(rows))return null;
  const record=completionViews.get(dataset),parent=record?.parent.deref()??dataset,parentRows=completionRows(parent);
  if(record&&currentCompletionView(dataset,record)!==rows)return null;
  const resolution=Object.getOwnPropertyDescriptor(dataset,'resolution');if(!resolution||!Object.hasOwn(resolution,'value')||typeof resolution.value!=='string')return null;
  if(execution!=='ordinary')return replayFrameCompletionInputMatches(rows,parent)?Object.freeze({rows:rows.length,sourceRows:rows.length,resolution:resolution.value,replay:true}):null;
  if(!parentRows||!record&&rows!==parentRows)return null;
  const facts=alpacaSessionCompletionInputFacts(parent,parentRows);if(!facts){if(record)record.alive=false;return null;}if(rows.length<1||rows.length>100000)return null;
  return Object.freeze({rows:rows.length,sourceRows:facts.sourceRows,resolution:resolution.value,replay:false});
 }catch{return null;}
}
/** Capture only after alert batch admission. The observation remains bound to
 * its genuine producer or replay frame, never to an equal target by metadata. */
export function captureLiveAlertCompletion(dataset:BarDataset,rows:readonly Bar[],execution:string):LiveAlertCompletion|null{
 const facts=liveAlertCompletionFacts(dataset,rows,execution);if(!facts)return null;
 try{
  const record=completionViews.get(dataset),parent=record?.parent.deref()??dataset,parentRows=completionRows(parent);
  const replay=execution==='ordinary'?null:captureReplayFrameCompletion(rows,parent);
  const live=replay?null:parentRows&&captureAlpacaSessionCompletion(parent,parentRows);
  if(execution!=='ordinary'&&(!replay||replay.execution!==execution)||!replay&&!live)return null;
  const observation=replay??live!,selected=new WeakRef(dataset),input=new WeakRef(rows);let alive=true;
  const assertCurrent=()=>{if(!alive)throw Error('The qualified alert observation retired.');try{const dataset=selected.deref(),rows=input.deref();if(!dataset||!rows||!liveAlertCompletionFacts(dataset,rows,execution))throw Error('The qualified alert selection changed.');observation.assertCurrent();if(record)verifyCompletionSelection(dataset,rows,record);observation.assertCurrent();}catch(error){alive=false;throw error;}};
  assertCurrent();return Object.freeze({rows:facts.rows,completeRows:replay?.completeRows??facts.rows,coveredFrom:live?.coveredFrom??-Infinity,closedThrough:replay?.closedThrough??live!.coveredThrough,assertCurrent});
 }catch{return null;}
}
