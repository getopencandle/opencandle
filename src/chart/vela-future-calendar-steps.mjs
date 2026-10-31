// Original LV source for the maintained Vela 0.8.4 cumulative recipe. No reference code.
export const notice='/*! LarryVision LV-VELA-FUTURE-CALENDAR-1 modification, 2026-10-24. Opt-in bounded future labels and time/logical segment anchors share the native bidirectional time mapper. Confirmed bars/indexing stay unchanged; beyond qualifiedThrough continuation is unqualified. Original license, NOTICE and visible Vela attribution are retained. */';
export const support=`${notice}
var lvFutureFloat64 = Float64Array;
var lvFutureTyped = Object.getPrototypeOf(Float64Array.prototype);
var lvFutureLength = Object.getOwnPropertyDescriptor(lvFutureTyped, "length").get;
var lvFutureBuffer = Object.getOwnPropertyDescriptor(lvFutureTyped, "buffer").get;
var lvFutureBrand = Object.getOwnPropertyDescriptor(lvFutureTyped, Symbol.toStringTag).get;
var lvFutureBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
var lvFutureResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "resizable")?.get;
var lvFutureCopy = Float64Array.prototype.set;
var lvFutureApply = Reflect.apply;
var lvFutureFreeze = Object.freeze;
var lvFutureOwn = Object.getOwnPropertyDescriptor;
var lvFutureHasOwn = Object.hasOwn;
var lvFutureWeakGet = WeakMap.prototype.get;
var lvFutureWeakSet = WeakMap.prototype.set;
var lvFutureWeakDelete = WeakMap.prototype.delete;
var lvFutureWeakDeref = WeakRef.prototype.deref;
var lvFutureStates = new WeakMap();
var lvFutureRenderers = new WeakMap();
var lvFutureFrames = new WeakMap();
function lvFutureGet(owner) {
  return lvFutureApply(lvFutureWeakGet, lvFutureStates, [owner]);
}
function lvFutureOwnedRenderer(renderer) {
  const coords = lvFutureApply(lvFutureWeakGet, lvFutureRenderers, [renderer]);
  if (!coords) throw new Error("LV future calendar renderer is unavailable");
  // Registry membership is checked first, so this descriptor operation is on
  // the genuine constructed ordinary receiver, never a caller's Proxy.
  const own = lvFutureOwn(renderer, "coords");
  if (!own || !lvFutureHasOwn(own, "value") || own.value !== coords) throw new Error("LV future calendar coordinate owner changed");
  return coords;
}
function lvFutureRetire(owner, close = false) {
  const state = lvFutureGet(owner);
  if (!state) return;
  state.token = null;
  state.spine = null;
  state.offsets = null;
  state.frame = null;
  if (state.generation < Number.MAX_SAFE_INTEGER) state.generation++;
  else state.closed = true;
  if (close) { state.closed = true; state.times = null; }
}
// A deliberately retained handle closes over weak owners/token/scalars only.
// The prepared source/native copies are never in this factory's environment.
function lvFutureHandle(owner, renderer, token, qualifiedThrough) {
  return lvFutureFreeze({
    qualifiedThrough,
    isCurrent() {
      const coords = lvFutureApply(lvFutureWeakDeref, owner, []);
      const state = coords && lvFutureGet(coords);
      if (!state || state.closed || state.token !== token || state.spine === null) return false;
      const native = renderer && lvFutureApply(lvFutureWeakDeref, renderer, []);
      try { return !!native && lvFutureOwnedRenderer(native) === coords; } catch { return false; }
    },
    isDetached() {
      const coords = lvFutureApply(lvFutureWeakDeref, owner, []);
      const state = coords && lvFutureGet(coords);
      // Loss of eligibility/alias ownership is NOT physical copy detachment.
      // Only this private token/copy association can witness its release.
      return !state || state.token !== token || state.spine === null;
    },
    dispose() {
      const coords = lvFutureApply(lvFutureWeakDeref, owner, []);
      const state = coords && lvFutureGet(coords);
      if (!state || state.token !== token) return;
      state.token = null;
      state.spine = null;
  state.offsets = null;
      const native = renderer && lvFutureApply(lvFutureWeakDeref, renderer, []);
      native?.scheduler?.invalidate(4 /* Full */);
    }
  });
}
function lvFutureCapture(owner, renderer, count, tail) {
  const state = lvFutureGet(owner);
  if (!state || state.closed || state.writes !== 0 || typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || typeof tail !== "number" || !Number.isSafeInteger(tail) || !state.times || state.times.length !== count || state.times[count - 1] !== tail) throw new Error("LV future calendar needs the current confirmed native frame");
  if (state.frame !== null) return state.frame;
  const key = lvFutureFreeze({});
  lvFutureApply(lvFutureWeakSet, lvFutureFrames, [key, {owner: new WeakRef(owner), renderer: new WeakRef(renderer), generation: state.generation, count, tail}]);
  state.frame = key;
  return key;
}
function lvFutureFrameState(owner, renderer, frame) {
  const record = lvFutureApply(lvFutureWeakGet, lvFutureFrames, [frame]), state = lvFutureGet(owner);
  if (!record || !state || state.closed || state.writes !== 0 || lvFutureApply(lvFutureWeakDeref, record.owner, []) !== owner || lvFutureApply(lvFutureWeakDeref, record.renderer, []) !== renderer || record.generation !== state.generation || !state.times || state.times.length !== record.count || state.times[record.count - 1] !== record.tail) throw new Error("LV future calendar frame is foreign, changed or retired");
  return state;
}
function lvFutureInstall(owner, renderer, frame, labels) {
  const state = lvFutureFrameState(owner, renderer, frame), record = lvFutureApply(lvFutureWeakGet, lvFutureFrames, [frame]);
  const count = record.count, tail = record.tail;
  // Intrinsic brand/buffer access rejects proxies without executing their traps.
  // No iterator, species, ownKeys, descriptor enumeration or caller getter.
  if (lvFutureApply(lvFutureBrand, labels, []) !== "Float64Array") throw new Error("LV future calendar needs Float64Array labels");
  const length = lvFutureApply(lvFutureLength, labels, []);
  const buffer = lvFutureApply(lvFutureBuffer, labels, []);
  const bytes = lvFutureApply(lvFutureBufferLength, buffer, []);
  if (!Number.isSafeInteger(length) || length < 1 || length > 62 || bytes === 0 || lvFutureResizable && lvFutureApply(lvFutureResizable, buffer, [])) throw new Error("LV future calendar label storage is unavailable");
  // Caller already reserved supplied + new + prior-native storage. Native admits
  // its fixed bound before allocation and validates ONLY its own single copy.
  const generation = state.generation, prior = state.token;
  const copy = new lvFutureFloat64(length);
  lvFutureApply(lvFutureCopy, copy, [labels]);
  let previous = tail;
  for (let i = 0; i < length; i++) {
    const value = copy[i];
    if (!Number.isSafeInteger(value) || value <= previous || !Number.isFinite(value - previous)) throw new Error("LV future calendar labels must strictly increase");
    previous = value;
  }
  if (lvFutureFrameState(owner, renderer, frame) !== state || state.generation !== generation || state.token !== prior) throw new Error("LV future calendar frame changed during preparation");
  const token = lvFutureFreeze({}), handle = lvFutureHandle(new WeakRef(owner), new WeakRef(renderer), token, previous);
  const cadence = state.interval > 0 ? state.interval : copy[0] - tail;
  // No fallible operation/callback follows the atomic ownership swap.
  state.count = count; state.tail = tail; state.cadence = cadence;
  state.spine = copy; state.offsets = null; state.token = token;
  return handle;
}
// Intraday mode has explicit positive logical offsets. It owns no observations.
// Both source arrays are read through captured intrinsics and copied once.
function lvFutureSegments(owner, renderer, frame, times, offsets) {
  const state = lvFutureFrameState(owner, renderer, frame), record = lvFutureApply(lvFutureWeakGet, lvFutureFrames, [frame]);
  if (lvFutureApply(lvFutureBrand, times, []) !== "Float64Array" || lvFutureApply(lvFutureBrand, offsets, []) !== "Float64Array") throw new Error("LV future segments need Float64Array coordinates");
  const length = lvFutureApply(lvFutureLength, times, []), other = lvFutureApply(lvFutureLength, offsets, []);
  const timeBuffer = lvFutureApply(lvFutureBuffer, times, []), offsetBuffer = lvFutureApply(lvFutureBuffer, offsets, []);
  const timeBytes = lvFutureApply(lvFutureBufferLength, timeBuffer, []), offsetBytes = lvFutureApply(lvFutureBufferLength, offsetBuffer, []);
  if (!Number.isSafeInteger(length) || length < 1 || length > 373 || other !== length || timeBytes === 0 || offsetBytes === 0 || lvFutureResizable && (lvFutureApply(lvFutureResizable, timeBuffer, []) || lvFutureApply(lvFutureResizable, offsetBuffer, []))) throw new Error("LV future segment storage is unavailable");
  const generation = state.generation, prior = state.token, tail = record.tail, count = record.count;
  const timeCopy = new lvFutureFloat64(length), offsetCopy = new lvFutureFloat64(length);
  lvFutureApply(lvFutureCopy, timeCopy, [times]); lvFutureApply(lvFutureCopy, offsetCopy, [offsets]);
  let previousTime = tail, previousOffset = 0;
  for (let i = 0; i < length; i++) {
    const time = timeCopy[i], offset = offsetCopy[i];
    if (!Number.isSafeInteger(time) || time <= previousTime || !Number.isSafeInteger(time - previousTime) || time - tail > 5356800000 + 3600000 || !Number.isSafeInteger(offset) || offset <= previousOffset || offset > 89280 || !Number.isSafeInteger(count - 1 + offset)) throw new Error("LV future segments must strictly increase inside their bounded horizon");
    previousTime = time; previousOffset = offset;
  }
  if (lvFutureFrameState(owner, renderer, frame) !== state || state.generation !== generation || state.token !== prior) throw new Error("LV future segment frame changed during preparation");
  const token = lvFutureFreeze({}), handle = lvFutureHandle(new WeakRef(owner), new WeakRef(renderer), token, previousTime);
  const cadence = state.interval > 0 ? state.interval : (timeCopy[0] - tail) / offsetCopy[0];
  if (!Number.isFinite(cadence) || cadence <= 0) throw new Error("LV future segment cadence is unavailable");
  state.count = count; state.tail = tail; state.cadence = cadence;
  state.spine = timeCopy; state.offsets = offsetCopy; state.token = token;
  return handle;
}
function lvFutureSegmentTime(state, time) {
  const values = state.spine, offsets = state.offsets, length = values.length, last = values[length - 1];
  if (time >= last) return state.count - 1 + offsets[length - 1] + (time - last) / state.cadence;
  let left = -1, right = length - 1;
  while (right - left > 1) { const middle = left + ((right - left) >> 1); if (values[middle] <= time) left = middle; else right = middle; }
  const a = left < 0 ? state.tail : values[left], b = values[right], start = left < 0 ? 0 : offsets[left];
  return state.count - 1 + start + (time - a) / (b - a) * (offsets[right] - start);
}
function lvFutureSegmentLogical(state, logical) {
  const values = state.spine, offsets = state.offsets, length = values.length, offset = logical - (state.count - 1), last = offsets[length - 1];
  if (offset >= last) return values[length - 1] + (offset - last) * state.cadence;
  let left = -1, right = length - 1;
  while (right - left > 1) { const middle = left + ((right - left) >> 1); if (offsets[middle] <= offset) left = middle; else right = middle; }
  const a = left < 0 ? 0 : offsets[left], b = offsets[right], start = left < 0 ? state.tail : values[left];
  return start + (offset - a) / (b - a) * (values[right] - start);
}
function lvFutureTimeToLogical(state, time) {
  const values = state.spine, length = values.length, last = values[length - 1];
  if (time >= last) return state.count - 1 + length + (time - last) / state.cadence;
  let left = -1, right = length - 1;
  while (right - left > 1) { const middle = left + ((right - left) >> 1); if (values[middle] <= time) left = middle; else right = middle; }
  const a = left < 0 ? state.tail : values[left], b = values[right];
  return state.count + left + (time - a) / (b - a);
}
function lvFutureLogicalToTime(state, logical) {
  const values = state.spine, length = values.length, offset = logical - (state.count - 1);
  if (offset >= length) return values[length - 1] + (offset - length) * state.cadence;
  const whole = Math.floor(offset), a = whole === 0 ? state.tail : values[whole - 1], b = values[whole];
  return a + (offset - whole) * (b - a);
}
`;

export const runtimeSteps=[
 ['future-calendar-support','var CoordinateSystem = class {',support+'\nvar CoordinateSystem = class {'],
 ['future-calendar-initial-state','    this.intervalMs = 0;\n  }\n  //', '    this.intervalMs = 0;\n    lvFutureApply(lvFutureWeakSet, lvFutureStates, [this, {generation: 0, closed: false, writes: 0, frame: null, token: null, spine: null, offsets: null, times: this.times, interval: 0, count: 0, tail: 0, cadence: 0}]);\n  }\n  //'],
 ['future-calendar-set-bars',`  setBars(times) {
    this.times = times.slice();
    this.intervalMs = medianInterval(this.times);
  }`,`  setBars(times) {
    lvFutureRetire(this);
    const state = lvFutureGet(this); state.writes++;
    try {
      this.times = times.slice();
      this.intervalMs = medianInterval(this.times);
    } finally {
      // Retire again at the actual commit/error unwind, including legacy slice reentry.
      lvFutureRetire(this); state.times = this.times; state.interval = this.intervalMs; state.writes--;
    }
  }`],
 ['future-calendar-append',`  appendBar(time) {
    this.times.push(time);
    if (this.intervalMs <= 0 && this.times.length >= 2) this.intervalMs = medianInterval(this.times);
  }`,`  appendBar(time) {
    lvFutureRetire(this);
    const state = lvFutureGet(this); state.writes++;
    try {
      this.times.push(time);
      if (this.intervalMs <= 0 && this.times.length >= 2) this.intervalMs = medianInterval(this.times);
    } finally {
      lvFutureRetire(this); state.times = this.times; state.interval = this.intervalMs; state.writes--;
    }
  }`],
 ['future-calendar-forward',`  timeToLogical(ms) {
    return barTimeToLogical(ms, this.times, this.intervalMs);
  }`,`  timeToLogical(ms) {
    const state = lvFutureGet(this);
    if (state?.spine && ms > state.tail) return state.offsets ? lvFutureSegmentTime(state, ms) : lvFutureTimeToLogical(state, ms);
    return barTimeToLogical(ms, this.times, this.intervalMs);
  }`],
 ['future-calendar-inverse',`  logicalToTime(logical) {
    return logicalToBarTime(logical, this.times, this.intervalMs);
  }`,`  logicalToTime(logical) {
    const state = lvFutureGet(this);
    if (state?.spine && logical > state.count - 1) return state.offsets ? lvFutureSegmentLogical(state, logical) : lvFutureLogicalToTime(state, logical);
    return logicalToBarTime(logical, this.times, this.intervalMs);
  }`],
 ['future-calendar-renderer-owner','    this.coords = new CoordinateSystem();','    this.coords = new CoordinateSystem();\n    lvFutureApply(lvFutureWeakSet, lvFutureRenderers, [this, this.coords]);'],
 ['future-calendar-renderer-api','  lvHoveredDrawingId() {',`  ${notice}
  lvCaptureTimeFrame(confirmedCount, tailTimeMs) {
    const coords = lvFutureOwnedRenderer(this);
    return lvFutureCapture(coords, this, confirmedCount, tailTimeMs);
  }
  lvSetFutureTimeSpine(frame, labels) {
    const coords = lvFutureOwnedRenderer(this), state = lvFutureGet(coords);
    if (!state || state.closed) throw new Error("LV future calendar renderer is unavailable");
    lvFutureFrameState(coords, this, frame);
    // Schedule before any swap: a native scheduler failure leaves old mapping
    // untouched. It receives no caller callback/configuration. Reentry cannot
    // overwrite a newly installed B while the outer invocation is scheduling.
    const generation = state.generation, prior = state.token;
    this.scheduler?.invalidate(4 /* Full */);
    if (lvFutureOwnedRenderer(this) !== coords || lvFutureFrameState(coords, this, frame) !== state || state.generation !== generation || state.token !== prior) throw new Error("LV future calendar renderer changed");
    return lvFutureInstall(coords, this, frame, labels);
  }
  lvSetFutureTimeSegments(frame, times, offsets) {
    const coords = lvFutureOwnedRenderer(this), state = lvFutureGet(coords);
    if (!state || state.closed) throw new Error("LV future calendar renderer is unavailable");
    lvFutureFrameState(coords, this, frame);
    const generation = state.generation, prior = state.token;
    this.scheduler?.invalidate(4 /* Full */);
    if (lvFutureOwnedRenderer(this) !== coords || lvFutureFrameState(coords, this, frame) !== state || state.generation !== generation || state.token !== prior) throw new Error("LV future calendar renderer changed");
    return lvFutureSegments(coords, this, frame, times, offsets);
  }
  lvHoveredDrawingId() {`],
 ['future-calendar-renderer-destroy',`  destroy() {
    if (this.introRaf != null) cancelAnimationFrame(this.introRaf);`,`  destroy() {
    const lvOwnedCoords = lvFutureApply(lvFutureWeakGet, lvFutureRenderers, [this]);
    if (lvOwnedCoords) lvFutureRetire(lvOwnedCoords, true);
    lvFutureApply(lvFutureWeakDelete, lvFutureRenderers, [this]);
    if (this.introRaf != null) cancelAnimationFrame(this.introRaf);`],
];
export const declarationStep=['future-calendar-declaration',
 '    setNativeData(type: string, data: unknown): void;',
 `    /** Original LV bounded future calendar geometry. No source/scalar authority. */
    lvCaptureTimeFrame(confirmedCount: number, tailTimeMs: number): object;
    lvSetFutureTimeSpine(frame: object, labels: Float64Array): Readonly<{qualifiedThrough: number; isCurrent(): boolean; isDetached(): boolean; dispose(): void}>;
    setNativeData(type: string, data: unknown): void;`];
