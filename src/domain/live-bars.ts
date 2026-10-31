import type { Bar, DataState } from './types';
/** Internal constructor/mutation membership. No caller can attach a borrowed receiver. */
const completeBaseVersions=new WeakMap<object,number>();
function touchLiveMutation(series:object):void{const version=completeBaseVersions.get(series);if(version!==undefined)completeBaseVersions.set(series,version+1);}
export type CompleteBaseWindowResult={ok:true}|{ok:false;reason:'invalid'|'incomplete'|'empty-closed-bucket'|'changed'};


/**
 * One mutable live bar series, shared by every public live provider.
 *
 * Inputs are already validated by the main-process adapter. The series combines three sources:
 *  - backfill: REST bars at the target resolution (closed, plus a possibly partial last bar);
 *  - live base bars: provider bars at a base size that divides the target (Coinbase 5m candles, Alpaca 1m bars),
 *    each one the provider's current full value for that base bucket (replace, never add);
 *  - ticks: last-price updates (Coinbase ticker, Alpaca trades) that extend the forming base bucket.
 * A target bucket is exact once every base bucket inside it is known: either it started after live base bars
 * began (all of them were observed live) or a REST seed at the base size filled it. Until then the bar is
 * marked provisional and the provider asks for a seed. Only the last bar can be forming; consumers that need
 * closed bars (replay, alerts, strategy fills) must ignore `formingTime`.
 */
export interface LiveTick { time: number; price: number; high?: number; low?: number; size?: number | null }
export interface LiveSeriesOptions { seconds: number; baseSeconds: number; ticks: boolean; aligned: boolean; maxBars?: number; /** Target bucket start for a time (calendar or non-power-of-two buckets). When set, `seconds` is only nominal. */ bucketOf?: (time: number) => number }
export interface LiveApplyResult { changed: boolean; seed: number | null }

const copy = (bar: Bar): Bar => ({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume });
function valid(bar: Bar): boolean {
  const n = [bar.open, bar.high, bar.low, bar.close];
  return Number.isSafeInteger(bar.time) && n.every(v => Number.isFinite(v) && v > 0) && Number.isFinite(bar.volume) && bar.volume >= 0 && bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close, bar.high);
}
function fold(parts: readonly Bar[], time: number): Bar {
  const out = copy(parts[0]); out.time = time;
  for (const part of parts.slice(1)) { out.high = Math.max(out.high, part.high); out.low = Math.min(out.low, part.low); out.close = part.close; out.volume += part.volume; }
  return out;
}

/** Bar objects that `replaceClosed` put in place (a later, fuller re-read of closed bars). Alert observers
 * read this to tell a consolidated re-read apart from a history correction (alert-observation.ts liveHistoryCorrected). */
const consolidatedBars = new WeakSet<Bar>();
export function isConsolidatedBar(bar: Bar): boolean { return consolidatedBars.has(bar); }
export class LiveBarSeries {
  readonly seconds: number; readonly baseSeconds: number; readonly ticks: boolean; readonly aligned: boolean; readonly maxBars: number; private readonly bucketOf: ((time: number) => number) | null;
  bars: Bar[] = [];
  state: DataState = 'loading';
  revision = 0;
  rejected = 0;
  /** Base bars by base start, kept only for target buckets at or after the last backfill bar. */
  private base = new Map<number, Bar>();
  private seeded = new Set<number>();
  private liveSince: number | null = null;
  private provisional = new Set<number>();
  constructor(options: LiveSeriesOptions) {
    const { seconds, baseSeconds } = options;
    if (!Number.isSafeInteger(seconds) || !Number.isSafeInteger(baseSeconds) || seconds < 1 || baseSeconds < 1 || seconds % baseSeconds !== 0) throw new RangeError('Live series resolution must be a whole multiple of the base resolution.');
    this.seconds = seconds; this.baseSeconds = baseSeconds; this.ticks = options.ticks; this.aligned = options.aligned; this.maxBars = options.maxBars ?? 5000; this.bucketOf = options.bucketOf ?? null;completeBaseVersions.set(this,0);
  }
  get formingTime(): number | null { return this.bars.at(-1)?.time ?? null; }
  get provisionalTimes(): number[] { return [...this.provisional].sort((a, b) => a - b); }
  bucket(time: number): number { if (this.bucketOf) return this.bucketOf(time); return this.aligned ? Math.floor(time / this.seconds) * this.seconds : time; }
  private bump(): true { this.revision++; return true; }
  /** Replace history with chronological REST bars at the target resolution. */
  setBackfill(input: readonly Bar[]): boolean {
    touchLiveMutation(this);
    const bars = input.filter(valid).map(copy).sort((a, b) => a.time - b.time).filter((bar, i, all) => !i || all[i - 1].time !== bar.time);
    this.rejected += input.length - bars.length;
    this.bars = bars.slice(-this.maxBars);
    this.originTime = this.bars[0]?.time ?? null;
    const last = this.bars.at(-1);
    for (const key of [...this.base.keys()]) if (!last || this.bucket(key) < last.time) this.base.delete(key);
    if (last && this.seconds === this.baseSeconds) { this.base.set(last.time, copy(last)); this.seeded.add(last.time); }
    for (const bucket of [...this.provisional]) if (!last || bucket < last.time) this.provisional.delete(bucket);
    if (last) this.recompute(last.time);
    return this.bump();
  }
  /** REST bars at the base size covering one target bucket. Live base bars already held win (they are newer). */
  seedBucket(bucket: number, baseBars: readonly Bar[]): boolean {
    touchLiveMutation(this);
    for (const bar of baseBars) {
      if (!valid(bar) || this.bucket(bar.time) !== bucket) { this.rejected++; continue; }
      if (!this.base.has(bar.time)) this.base.set(bar.time, copy(bar));
    }
    this.seeded.add(bucket);
    this.recompute(bucket);
    return this.bump();
  }
  /** Apply ONE wholly observed base-bar window as a single transaction. This numeric mutator grants no
   * source/completion provenance: its producer must first own a coherent actual response/window/entry epoch.
   * All externally supplied row/bucket reads finish before the version check and callback-free commit. */
  replaceCompleteBaseWindow(input:readonly Bar[],window:Readonly<{from:number;through:number;consolidated?:boolean}>):CompleteBaseWindowResult{
    const refused=(reason:'invalid'|'incomplete'|'empty-closed-bucket'|'changed'):CompleteBaseWindowResult=>({ok:false,reason:version!==undefined&&completeBaseVersions.get(this)!==version?'changed':reason});
    const version=completeBaseVersions.get(this);if(version===undefined)return refused('invalid');
    const field=(owner:unknown,key:PropertyKey):unknown=>{if(!owner||typeof owner!=='object')throw Error('Own data required.');const item=Object.getOwnPropertyDescriptor(owner,key);if(!item||!Object.hasOwn(item,'value'))throw Error('Own data required.');return item.value;};
    const numeric=(owner:unknown,key:PropertyKey):number=>{const value=field(owner,key);if(typeof value!=='number'||!Number.isFinite(value))throw Error('Finite number required.');return value;};
    try{
      const keys=['bars','base','seeded','provisional','originTime','revision','seconds','baseSeconds','aligned','maxBars','bucketOf','ticks','liveSince'] as const,descriptors=keys.map(key=>Object.getOwnPropertyDescriptor(this,key));
      if(descriptors.some(item=>!item||!Object.hasOwn(item,'value')||!item.writable))return refused('invalid');
      const before=descriptors.map(item=>item!.value),[oldBars,base,seeded,provisional,origin,revision,seconds,baseSeconds,aligned,maximum,bucketOf]=before;
      if(!Array.isArray(oldBars)||Object.getPrototypeOf(oldBars)!==Array.prototype||![base,seeded,provisional].every(value=>value instanceof Map||value instanceof Set)||Object.getPrototypeOf(base)!==Map.prototype||Object.getPrototypeOf(seeded)!==Set.prototype||Object.getPrototypeOf(provisional)!==Set.prototype||!Number.isSafeInteger(revision)||revision>=Number.MAX_SAFE_INTEGER||origin!==null&&(!Number.isSafeInteger(origin)||typeof origin!=='number')||!Number.isSafeInteger(seconds)||!Number.isSafeInteger(baseSeconds)||baseSeconds<1||seconds<baseSeconds||seconds%baseSeconds!==0||!Number.isSafeInteger(maximum)||maximum<1||maximum>100000||oldBars.length>maximum||typeof aligned!=='boolean'||bucketOf!==null&&typeof bucketOf!=='function')return refused('invalid');
      const hint=Object.getOwnPropertyDescriptor(window,'consolidated');if(hint&&(!Object.hasOwn(hint,'value')||typeof hint.value!=='boolean'))return refused('invalid');const consolidated=hint?.value===true;
      const from=numeric(window,'from'),through=numeric(window,'through'),count=numeric(input,'length');if(!Number.isSafeInteger(from)||!Number.isSafeInteger(through)||through<=from||!Number.isSafeInteger(count)||count<0||count>30000||!Array.isArray(input)||Object.getPrototypeOf(input)!==Array.prototype)return refused('invalid');
      const B=Reflect.apply(Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!,base,[]) as number,S=Reflect.apply(Object.getOwnPropertyDescriptor(Set.prototype,'size')!.get!,seeded,[]) as number,P=Reflect.apply(Object.getOwnPropertyDescriptor(Set.prototype,'size')!.get!,provisional,[]) as number;
      if(![B,S,P,B+S+P].every(value=>Number.isSafeInteger(value)&&value>=0))return refused('invalid');
      const width=oldBars.length+count,operations=512*width+64*width*Math.ceil(Math.log2(width+1))+65536+512*(B+S+P),slots=12*oldBars.length+48*count+8*B+4*(S+P)+2048;
      // The new bounded mutator keeps the existing numerical limits; it does not accept a caller budget.
      if(!Number.isSafeInteger(operations)||!Number.isSafeInteger(slots)||operations>20000000||slots>2000000)return refused('invalid');
      const bucket=(time:number)=>{const value=bucketOf?Reflect.apply(bucketOf,this,[time]) as number:aligned?Math.floor(time/seconds)*seconds:time;if(!Number.isSafeInteger(value)||value>time||time>=value+seconds)throw Error('Invalid target bucket.');return value as number;};
      const groups=new Map<number,Bar[]>();let previous=-Infinity;
      for(let index=0;index<count;index++){
        const row=field(input,String(index)),time=numeric(row,'time'),open=numeric(row,'open'),high=numeric(row,'high'),low=numeric(row,'low'),close=numeric(row,'close'),volume=numeric(row,'volume');
        if(!Number.isSafeInteger(time)||time<=previous||time%baseSeconds!==0||time<from||time+baseSeconds>through||Math.min(open,high,low,close)<=0||high<Math.max(open,low,close)||low>Math.min(open,high,close)||volume<0)return refused('invalid');previous=time;
        const at=bucket(time);if(at<from||at+seconds>through)continue;let rows=groups.get(at);if(!rows){rows=[];groups.set(at,rows);}rows.push({time,open,high,low,close,volume});
      }
      // Resolve all constructor-supplied bucket calls before reading/merging history or writing any state.
      const baseBuckets:[number,number][]=[];for(const [time]of base as Map<number,Bar>)baseBuckets.push([time,bucket(time)]);
      const replacements=new Map<number,Bar>();for(const [at,rows]of groups){const bar=fold(rows,at);if(!valid(bar))return refused('invalid');replacements.set(at,bar);}
      const history=new Map<number,Bar>();previous=-Infinity;
      for(let index=0;index<oldBars.length;index++){
        const row=field(oldBars,String(index)),time=numeric(row,'time');if(!Number.isSafeInteger(time)||time<=previous)return refused('invalid');previous=time;
        // A complete actual window contradicting a retained price must never silently confirm that old price.
        if(time>=from&&time+seconds<=through&&!groups.has(time))return refused('empty-closed-bucket');history.set(time,row as Bar);
      }
      if(!groups.size)return refused('incomplete');
      for(const [at,row]of replacements)history.set(at,row);
      const ordered=[...history.entries()].sort((left,right)=>left[0]-right[0]).slice(-maximum),rows=ordered.map(([,row])=>row),nextBase=new Map<number,Bar>(base),nextSeeded=new Set<number>(seeded),nextProvisional=new Set<number>(provisional);
      for(const [time,at]of baseBuckets)if(groups.has(at))nextBase.delete(time);
      for(const [at,group]of groups){for(const row of group)nextBase.set(row.time,{...row});nextSeeded.add(at);nextProvisional.delete(at);}
      // Same retention bound as ordinary append; no reset to the small initial backfill and no pager/reserve changes.
      const keep=ordered.at(-3)?.[0]??-Infinity;for(const [time,at]of baseBuckets)if(at<keep)nextBase.delete(time);for(const at of nextSeeded)if(at<keep)nextSeeded.delete(at);
      for(const [at,group]of groups)if(at<keep)for(const row of group)nextBase.delete(row.time);
      if(completeBaseVersions.get(this)!==version||keys.some((key,index)=>{const item=Object.getOwnPropertyDescriptor(this,key),beforeField=descriptors[index]!;return !item||!Object.hasOwn(item,'value')||!item.writable||item.value!==before[index]||item.configurable!==beforeField.configurable||item.enumerable!==beforeField.enumerable;}))return refused('changed');
      // No callbacks, method lookups or supplied descriptor reads after this point. A successful observed window
      // advances the publication revision even when prices match, so an actual chart can consume the new observation.
      // A reconciliation hint only: the actual producer opts in solely for a genuine fuller-source re-read.
      if(consolidated)for(const bar of replacements.values())consolidatedBars.add(bar);
      this.bars=rows;this.base=nextBase;this.seeded=nextSeeded;this.provisional=nextProvisional;
      if(origin!==null&&ordered.length&&ordered[0][0]>origin)this.originTime=ordered[0][0];
      this.revision=revision+1;completeBaseVersions.set(this,version+1);return {ok:true};
    }catch{return refused(completeBaseVersions.get(this)!==version?'changed':'invalid');}
  }
  /** REST reconciliation at the target size: replaces closed or forming bars with the provider's own value. */
  reconcile(bars: readonly Bar[]): boolean {
    touchLiveMutation(this);
    let changed = false;
    for (const bar of bars) {
      if (!valid(bar)) { this.rejected++; continue; }
      if (this.seconds === this.baseSeconds) { this.base.set(bar.time, copy(bar)); this.seeded.add(bar.time); this.provisional.delete(bar.time); }
      changed = this.upsert(copy(bar)) || changed;
    }
    return changed ? this.bump() : false;
  }
  /** REST base bars (at the base size) that replace what live messages built, e.g. closed-minute volume. Buckets older than the forming one are ignored. */
  replaceBase(baseBars: readonly Bar[]): boolean {
    touchLiveMutation(this);
    const last = this.bars.at(-1), touched = new Set<number>();
    for (const bar of baseBars) {
      if (!valid(bar)) { this.rejected++; continue; }
      const bucket = this.bucket(bar.time);
      if (last && bucket < last.time) continue;
      this.base.set(bar.time, copy(bar)); touched.add(bucket);
    }
    let changed = false;
    for (const bucket of touched) changed = this.recompute(bucket) || changed;
    return changed ? this.bump() : false;
  }
  /** A provider base bar (full current value for that base bucket). */
  applyBase(bar: Bar): LiveApplyResult {
    touchLiveMutation(this);
    if (!valid(bar) || (this.aligned && !this.bucketOf && bar.time % this.baseSeconds !== 0)) { this.rejected++; return { changed: false, seed: null }; }
    const bucket = this.bucket(bar.time), last = this.bars.at(-1);
    if (last && bucket < last.time - this.seconds * 2) { this.rejected++; return { changed: false, seed: null }; }
    if (this.liveSince === null) this.liveSince = bar.time;
    this.base.set(bar.time, copy(bar));
    const complete = this.seconds === this.baseSeconds || this.seeded.has(bucket) || (this.liveSince !== null && bucket >= this.liveSince);
    if (complete) this.seeded.add(bucket);
    const changed = this.recompute(bucket);
    return { changed: changed ? this.bump() : false, seed: complete ? null : bucket };
  }
  /** Last-price update. Extends the base bucket containing it; size adds volume when the provider supplies one. */
  applyTick(tick: LiveTick): LiveApplyResult {
    touchLiveMutation(this);
    if (!this.ticks || !Number.isSafeInteger(tick.time) || !Number.isFinite(tick.price) || tick.price <= 0) { if (this.ticks) this.rejected++; return { changed: false, seed: null }; }
    const baseTime = Math.floor(tick.time / this.baseSeconds) * this.baseSeconds, bucket = this.bucket(baseTime), last = this.bars.at(-1);
    if (last && bucket < last.time) { this.rejected++; return { changed: false, seed: null }; }
    const high = Math.max(tick.price, tick.high ?? tick.price), low = Math.min(tick.price, tick.low ?? tick.price), size = tick.size && tick.size > 0 ? tick.size : 0;
    const prior = this.base.get(baseTime);
    if (prior) { prior.high = Math.max(prior.high, high); prior.low = Math.min(prior.low, low); prior.close = tick.price; prior.volume += size; }
    else {
      this.base.set(baseTime, { time: baseTime, open: tick.price, high, low, close: tick.price, volume: size });
      // A brand-new base bucket observed from its first tick onward is complete for tick-only series.
      if (this.seconds === this.baseSeconds) this.seeded.add(bucket);
    }
    const complete = this.seeded.has(bucket);
    const changed = this.recompute(bucket);
    return { changed: changed ? this.bump() : false, seed: complete ? null : bucket };
  }
  /** After a reconnect or sequence gap: live continuity is broken, so buckets that are not seeded by REST again are provisional. */
  resetLive(): number[] {
    touchLiveMutation(this);
    this.liveSince = null;
    const last = this.bars.at(-1);
    if (!last || this.seconds === this.baseSeconds) return [];
    this.seeded.delete(last.time);
    return [last.time];
  }
  setState(state: DataState): boolean {touchLiveMutation(this); if (this.state === state) return false; this.state = state; return this.bump(); }
  /** Authoritative closed bars at the target size (a later, fuller re-read of bars already shown, such as
   * all-exchange history replacing IEX bars once they are 15 minutes old). Each bar older than the last (forming) bar
   * replaces the bar at its time or is inserted where the earlier source had none; the forming bar is never touched. */
  replaceClosed(input: readonly Bar[]): boolean {
    touchLiveMutation(this);
    const last = this.bars.at(-1);
    if (!last) return false;
    const byTime = new Map(this.bars.map(bar => [bar.time, bar] as const));
    let changed = false;
    for (const bar of input) {
      if (!valid(bar)) { this.rejected++; continue; }
      if (bar.time >= last.time || (this.originTime !== null && bar.time < this.originTime)) continue;
      const prior = byTime.get(bar.time);
      if (prior && prior.open === bar.open && prior.high === bar.high && prior.low === bar.low && prior.close === bar.close && prior.volume === bar.volume) continue;
      const replacement = copy(bar); consolidatedBars.add(replacement);
      byTime.set(bar.time, replacement); changed = true;
    }
    if (!changed) return false;
    this.bars = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-this.maxBars);
    return this.bump();
  }
  /** Time of the first bar the subscription's own backfill delivered. Older bars only ever come from
   * `prependHistory`; consumers that must not see them (alerts) start here. Null before the backfill. */
  originTime: number | null = null;
  /** Closed REST bars older than the first loaded bar, at the target resolution. Bars at or after the first
   * loaded time are dropped (the loaded copy wins), duplicates and invalid rows are dropped, and the series never grows
   * past `maxBars`: the newest of the older bars are kept. Returns how many bars were added and whether the cap stopped it. */
  prependHistory(input: readonly Bar[]): { added: number; capped: boolean } {
    touchLiveMutation(this);
    const first = this.bars[0]?.time;
    if (first === undefined) return { added: 0, capped: false };
    const valid_ = input.filter(valid);
    this.rejected += input.length - valid_.length;
    const older = valid_.filter(bar => bar.time < first).map(copy).sort((a, b) => a.time - b.time).filter((bar, i, all) => !i || all[i - 1].time !== bar.time);
    const room = Math.max(0, this.maxBars - this.bars.length), kept = room >= older.length ? older : older.slice(older.length - room);
    if (kept.length) { this.bars = [...kept, ...this.bars]; this.bump(); }
    return { added: kept.length, capped: kept.length < older.length || this.bars.length >= this.maxBars };
  }
  private recompute(bucket: number): boolean {
    const parts = [...this.base.entries()].filter(([time]) => this.bucket(time) === bucket).sort((a, b) => a[0] - b[0]).map(([, bar]) => bar);
    if (!parts.length) return false;
    let next = fold(parts, bucket);
    const existing = this.bars.find(bar => bar.time === bucket);
    if (!this.seeded.has(bucket)) {
      this.provisional.add(bucket);
      // Partial coverage: keep the REST open and never shrink its range or volume.
      if (existing) next = { time: bucket, open: existing.open, high: Math.max(existing.high, next.high), low: Math.min(existing.low, next.low), close: next.close, volume: Math.max(existing.volume, next.volume) };
    } else this.provisional.delete(bucket);
    return this.upsert(next);
  }
  private upsert(bar: Bar): boolean {
    const last = this.bars.at(-1);
    if (!last || bar.time > last.time) { this.bars = [...this.bars, bar].slice(-this.maxBars); if (this.originTime !== null && this.bars[0].time > this.originTime) this.originTime = this.bars[0].time; this.prune(); return true; }
    const index = this.bars.findIndex(row => row.time === bar.time);
    if (index < 0) return false; // gaps before the last bar are not invented
    const prior = this.bars[index];
    if (prior.open === bar.open && prior.high === bar.high && prior.low === bar.low && prior.close === bar.close && prior.volume === bar.volume) return false;
    const next = this.bars.slice(); next[index] = bar; this.bars = next; return true;
  }
  private prune(): void {
    const keep = (this.bars.at(-3)?.time ?? -Infinity);
    for (const time of [...this.base.keys()]) if (this.bucket(time) < keep) this.base.delete(time);
    for (const bucket of [...this.seeded]) if (bucket < keep) this.seeded.delete(bucket);
  }
}

export interface LiveBarCloseOptions {
  seconds: number;
  /** Grace after the interval end for the last trade of the bar to arrive. Default 2 seconds. */
  graceSeconds?: number;
  /** Wall clock in milliseconds (injectable for tests). */
  now?: () => number;
  onClose: (bar: Bar, reason: 'newer-bar' | 'clock') => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}
/**
 * Bar close for a live series: a bar is closed when a newer bar opened (append), or when the wall clock
 * passes its interval end plus a small grace. Each bar time is reported once (deduped by bar time), so a reconnect or
 * REST backfill that replays already-reported bars never re-fires. The first update only sets the baseline: bars that were
 * already closed when watching began are history, not events. If several bars closed unseen (a gap), only the newest is reported.
 */
export class LiveBarCloseWatcher {
  private readonly seconds: number; private readonly grace: number; private readonly now: () => number;
  private readonly onClose: LiveBarCloseOptions['onClose'];
  private readonly setTimer: (fn: () => void, ms: number) => unknown; private readonly clearTimer: (handle: unknown) => void;
  private bars: readonly Bar[] = []; private lastClosed: number | null = null; private baselined = false; private handle: unknown = null; private disposed = false;
  constructor(options: LiveBarCloseOptions) {
    if (!Number.isSafeInteger(options.seconds) || options.seconds < 1) throw new RangeError('Live bar interval must be a positive whole number of seconds.');
    this.seconds = options.seconds; this.grace = options.graceSeconds ?? 2; this.now = options.now ?? Date.now; this.onClose = options.onClose;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms)); this.clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }
  /** Time of the latest bar already reported (or baselined as history). */
  get lastClosedTime(): number | null { return this.lastClosed; }
  /** Feed the current series bars after every change. */
  update(bars: readonly Bar[]): void { if (this.disposed) return; this.bars = bars; this.check(); }
  dispose(): void { this.disposed = true; this.cancel(); }
  private cancel(): void { if (this.handle !== null) { this.clearTimer(this.handle); this.handle = null; } }
  private check(): void {
    this.cancel();
    const last = this.bars.at(-1);
    if (!last) return;
    const nowSeconds = this.now() / 1000, end = last.time + this.seconds + this.grace;
    const clockClosed = nowSeconds >= end;
    const candidate = clockClosed ? last : this.bars.at(-2);
    const reason: 'newer-bar' | 'clock' = clockClosed ? 'clock' : 'newer-bar';
    if (!this.baselined) { this.baselined = true; this.lastClosed = candidate?.time ?? null; }
    else if (candidate && (this.lastClosed === null || candidate.time > this.lastClosed)) {
      this.lastClosed = candidate.time;
      try { this.onClose(copy(candidate), reason); } catch { /* a consumer failure never stops the watcher */ }
    }
    if (!clockClosed && !this.disposed) this.handle = this.setTimer(() => { this.handle = null; this.check(); }, Math.max(0, Math.ceil((end - nowSeconds) * 1000)));
  }
}
