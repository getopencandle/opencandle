'use strict';
// "Open layout in new window", for a second monitor. Behaviour.
// One primary window owns the workspace file (the single writer), alerts, paper trading, watchlists,
// background feeds and the tray. Each secondary window shows one saved layout with its own live charts. Its layout saves
// are relayed to the primary window, which writes them through its own save path. Live feeds are shared: main keeps one
// Alpaca stream and one Coinbase stream, subscribed to the union of every window's symbols, so the Alpaca symbol cap is
// counted across windows, and each window receives only its own symbols.
//
// This module creates no window itself (main.cjs passes createWindow, which builds every window with the same hardened
// webPreferences, CSP, preload and navigation denial). It needs only ./validation.cjs and has no network, process or
// shell access. main.cjs loads it lazily, when the first layout window opens or one is restored.
const { BoundaryError, exactKeys, jsonData, isAppURL } = require('./validation.cjs');

const WINDOW_STATE_FILE = 'window-state.json';
/** At most 8 layout windows besides the main window. */
const MAX_SECONDARY_WINDOWS = 8;
const MAX_STATE_BYTES = 16 * 1024;
/** The primary window confirms a relayed layout save within 20 s (it may still be loading at startup), or the secondary reports a failure. */
const RELAY_TIMEOUT_MS = 20000;
const BOUNDS_SAVE_DELAY_MS = 500;
/** The same minimum size as the main window. */
const MIN_WIDTH = 960, MIN_HEIGHT = 640;
const LAYOUT_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const RELAY_ID = /^relay-[0-9]{1,15}$/;
const CLOSE_TOKEN = /^close-[0-9]{1,15}$/;
/** The only channels a secondary window may use: its workspace read, its close-flush answer, its layout save relay, its own
 * full screen toggle, the chart exports and scripts, and the shared live data. Never the workspace write or reset, file imports, workspace export,
 * the Alpaca key, cache clearing, alert notifications, the tray, quitting, opening further windows or the --lv-open-symbol(s)
 * startup grid (that belongs to the main window; a layout window shows its saved layout). */
const SECONDARY_CHANNELS = Object.freeze([
  'lv:workspace:load', 'lv:workspace:flushed', 'lv:window:layout-save', 'lv:window:paper-action', 'lv:close', 'lv:window:fullscreen',
  'lv:chart:export', 'lv:chart:copy', 'lv:data:export', 'lv:data:export-binary', 'lv:script:execute', 'lv:cancel',
  'lv:sec:companyfacts', 'lv:sec:submissions', 'lv:sec:cancel',
  'lv:fred:series',
  'lv:coinbase:candles', 'lv:coinbase:subscribe', 'lv:coinbase:unsubscribe', 'lv:coinbase:status', 'lv:coinbase:cancel',
  'lv:alpaca:key-status', 'lv:alpaca:bars', 'lv:alpaca:subscribe', 'lv:alpaca:unsubscribe', 'lv:alpaca:status', 'lv:alpaca:cancel', 'lv:alpaca:search-assets', 'lv:alpaca:corporate-actions',
  'lv:barcache:read', 'lv:barcache:write', 'lv:barcache:discard', 'lv:barcache:status'
]);
/** The top-level workspace fields a layout window may send with its layout save (its workspace-wide edits).
 * The same list as src/ui/window-mode.ts SHARED_WORKSPACE_KEYS. Never the layout library, watchlists, alerts, paper or imports. */
const SHARED_WORKSPACE_KEYS = Object.freeze(['chartSettings', 'drawingPreferences', 'drawingFavorites', 'indicatorTemplates', 'indicatorLibrary', 'scriptLibrary', 'intervals', 'liveData', 'appPreferences', 'chartTypeFavorites']);
/** The main window answers a relayed paper action within 10 s. */
const PAPER_RELAY_TIMEOUT_MS = 10000;
const PAPER_RELAY_MAX_BYTES = 16 * 1024;
const CAP_MESSAGE = 'Too many live symbols across windows. The Alpaca free plan streams 30 at most. Close some live charts in this or another window.';
const fail = message => { throw new BoundaryError('INVALID_ARGUMENT', message); };

/** Exactly {layoutId}, a saved-layout identifier. */
function layoutWindowInput(value) {
  exactKeys(value, ['layoutId']);
  if (typeof value.layoutId !== 'string' || !LAYOUT_ID.test(value.layoutId)) fail('Invalid layout.');
  return value.layoutId;
}
/** A secondary window's layout save: exactly {layoutId, grid} and optionally {shared}, the grid as plain JSON data within the
 * workspace limits. `shared` holds only SHARED_WORKSPACE_KEYS fields, as plain JSON data. */
function layoutSaveInput(value) {
  exactKeys(value, ['layoutId', 'grid'], ['shared']);
  if (typeof value.layoutId !== 'string' || !LAYOUT_ID.test(value.layoutId)) fail('Invalid layout.');
  if (!value.grid || typeof value.grid !== 'object' || Array.isArray(value.grid)) fail('Invalid layout grid.');
  jsonData(value.grid);
  if (value.shared === undefined) return { layoutId: value.layoutId, grid: value.grid };
  if (!value.shared || typeof value.shared !== 'object' || Array.isArray(value.shared)) fail('Invalid workspace settings.');
  if (Object.keys(value.shared).some(key => !SHARED_WORKSPACE_KEYS.includes(key))) fail('Invalid workspace settings.');
  jsonData(value.shared);
  return { layoutId: value.layoutId, grid: value.grid, shared: value.shared };
}
/** A layout window's paper action (Shift+B or Shift+S): exactly {side, instrument, quote, quoteSource, now},
 * plain JSON data of at most 16 KB. The main window checks the instrument and quote again before it acts. */
function paperActionInput(value) {
  exactKeys(value, ['side', 'instrument', 'quote', 'quoteSource', 'now']);
  if (value.side !== 'buy' && value.side !== 'sell') fail('Invalid paper action.');
  if (!value.instrument || typeof value.instrument !== 'object' || Array.isArray(value.instrument)) fail('Invalid paper action.');
  if (value.quote !== null && (typeof value.quote !== 'object' || Array.isArray(value.quote))) fail('Invalid paper action.');
  if (!value.quoteSource || typeof value.quoteSource !== 'object' || Array.isArray(value.quoteSource)) fail('Invalid paper action.');
  if (typeof value.now !== 'number' || !Number.isFinite(value.now) || value.now < 0) fail('Invalid paper action.');
  jsonData(value);
  if (JSON.stringify(value).length > PAPER_RELAY_MAX_BYTES) fail('Invalid paper action.');
  return { side: value.side, instrument: value.instrument, quote: value.quote, quoteSource: value.quoteSource, now: value.now };
}
/** The main window's answer to a relayed paper action. */
function paperDoneInput(value) {
  exactKeys(value, ['requestId', 'ok', 'message'], ['focus']);
  if (typeof value.requestId !== 'string' || !RELAY_ID.test(value.requestId) || typeof value.ok !== 'boolean') fail('Invalid paper answer.');
  if (typeof value.message !== 'string' || value.message.length > 500) fail('Invalid paper answer.');
  if (value.focus !== undefined && typeof value.focus !== 'boolean') fail('Invalid paper answer.');
  return { requestId: value.requestId, ok: value.ok, message: value.message, focus: value.focus === true };
}
/** A layout window's close-flush answer, a token or {token, keepOpen:true} (it asks to save first). */
function flushAnswerOf(value) {
  if (typeof value === 'string') return { token: value, keepOpen: false };
  exactKeys(value, ['token', 'keepOpen']);
  if (typeof value.token !== 'string' || value.keepOpen !== true) fail('Invalid flush acknowledgement.');
  return { token: value.token, keepOpen: true };
}
/** The primary window's answer to a relayed save. */
function layoutSavedInput(value) {
  exactKeys(value, ['requestId', 'ok'], ['revision', 'message']);
  if (typeof value.requestId !== 'string' || !RELAY_ID.test(value.requestId) || typeof value.ok !== 'boolean') fail('Invalid layout save answer.');
  if (value.revision !== undefined && (!Number.isSafeInteger(value.revision) || value.revision < 0)) fail('Invalid layout save answer.');
  if (value.message !== undefined && (typeof value.message !== 'string' || value.message.length > 500)) fail('Invalid layout save answer.');
  return { requestId: value.requestId, ok: value.ok, revision: value.revision, message: value.message };
}
function boundsOf(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { x, y, width, height } = value, int = (n, low, high) => Number.isSafeInteger(n) && n >= low && n <= high;
  if (!int(x, -100000, 100000) || !int(y, -100000, 100000) || !int(width, MIN_WIDTH, 100000) || !int(height, MIN_HEIGHT, 100000)) return null;
  return { x, y, width, height };
}
/** Saved layout windows, `{schemaVersion:1,windows:[{layoutId,bounds,maximized}]}`. Anything unreadable gives none. */
function parseWindowState(text) {
  try {
    if (typeof text !== 'string' || text.length > MAX_STATE_BYTES) return [];
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || value.schemaVersion !== 1 || !Array.isArray(value.windows)) return [];
    const out = [], seen = new Set();
    for (const row of value.windows) {
      if (out.length >= MAX_SECONDARY_WINDOWS) break;
      if (!row || typeof row !== 'object' || typeof row.layoutId !== 'string' || !LAYOUT_ID.test(row.layoutId) || seen.has(row.layoutId)) continue;
      seen.add(row.layoutId);
      out.push({ layoutId: row.layoutId, bounds: boundsOf(row.bounds), maximized: row.maximized === true });
    }
    return out;
  } catch { return []; }
}
const serializeWindowState = list => JSON.stringify({ schemaVersion: 1, windows: list.slice(0, MAX_SECONDARY_WINDOWS).map(row => ({ layoutId: row.layoutId, bounds: row.bounds ?? null, maximized: row.maximized === true })) });
/** Saved bounds are used only when at least 100 x 50 px of the window lands on a current display's work area (a monitor
 * that was unplugged gives the default place instead). */
function visibleBounds(bounds, workAreas) {
  const box = boundsOf(bounds);
  if (!box || !Array.isArray(workAreas)) return null;
  return workAreas.some(area => area && Math.min(box.x + box.width, area.x + area.width) - Math.max(box.x, area.x) >= 100 && Math.min(box.y + box.height, area.y + area.height) - Math.max(box.y, area.y) >= 50) ? box : null;
}
/** The page of a layout window. The renderer reads its role from the query; main decides trust by the sender, never by the URL. */
function secondaryURL(windowId, layoutId) {
  if (!Number.isSafeInteger(windowId) || windowId < 1 || typeof layoutId !== 'string' || !LAYOUT_ID.test(layoutId)) fail('Invalid layout window.');
  return 'lv://app/index.html?window=' + windowId + '&layout=' + encodeURIComponent(layoutId);
}

/**
 * One live feed shared by every window. `listKey` is the subscription list field (symbols, productIds), `itemKey` the
 * field naming the symbol on each streamed row. `validate(raw)` returns `{list, extra}` (it throws on bad input),
 * `feed()` makes the feed, `existing()` returns it or null.
 */
class FeedShare {
  constructor({ listKey, itemKey, max, rows, validate, feed, existing, priorityKey = null }) {
    Object.assign(this, { listKey, itemKey, max, rows, validate, feed, existing, priorityKey });
    this.sets = new Map(); this.extra = {}; this.priorities = new Map();
  }
  union(except) { const all = new Set(); for (const [key, list] of this.sets) if (key !== except) for (const item of list) all.add(item); return [...all].sort(); }
  /** With `priorityKey` (Alpaca `quotesFor`), the union of every window's on-screen symbols, inside `union`. */
  priorityField(union) {
    if (!this.priorityKey) return {};
    const all = new Set(); for (const [key, list] of this.priorities) if (this.sets.has(key)) for (const item of list) if (union.includes(item)) all.add(item);
    return all.size ? { [this.priorityKey]: [...all].sort() } : {};
  }
  /** A window that was already streaming before the first layout window opened keeps its symbols. */
  seed(key, list) { if (Array.isArray(list) && list.length) this.sets.set(key, [...list].sort()); }
  has(key) { return this.sets.has(key); }
  view(key, status) {
    if (!status || typeof status !== 'object' || !Array.isArray(status[this.listKey])) return status;
    const mine = this.sets.get(key) ?? [];
    return { ...status, [this.listKey]: status[this.listKey].filter(item => mine.includes(item)) };
  }
  async subscribe(key, raw) {
    let input;
    try { input = this.validate(raw); } catch (error) { return failure(error); }
    const union = [...new Set([...this.union(key), ...input.list])].sort();
    if (union.length > this.max) return { ok: false, error: { code: 'SYMBOL_CAP', message: CAP_MESSAGE } };
    const previous = this.sets.get(key), previousPriority = this.priorities.get(key);
    this.sets.set(key, [...input.list].sort()); this.extra = input.extra ?? {};
    if (Array.isArray(input.priority) && input.priority.length) this.priorities.set(key, [...input.priority]); else this.priorities.delete(key);
    const result = await this.feed().subscribe({ [this.listKey]: union, ...this.extra, ...this.priorityField(union) });
    if (!result?.ok) { if (previous) this.sets.set(key, previous); else this.sets.delete(key); if (previousPriority) this.priorities.set(key, previousPriority); else this.priorities.delete(key); return result; }
    return { ok: true, value: this.view(key, result.value) };
  }
  /** The window stops streaming: the feed keeps the other windows' symbols, or stops when none are left. */
  async release(key) {
    const had = this.sets.delete(key), feed = this.existing(); this.priorities.delete(key);
    if (!feed) return null;
    const union = this.union();
    if (!had) return { ok: true, value: this.view(key, feed.status()) };
    const result = union.length ? await feed.subscribe({ [this.listKey]: union, ...this.extra, ...this.priorityField(union) }) : feed.unsubscribe();
    return result?.ok ? { ok: true, value: this.view(key, result.value) } : result;
  }
  status(key) { const feed = this.existing(); return feed ? this.view(key, feed.status()) : null; }
  /** The event as one window sees it: its own symbols only. null when the window does not stream from this feed. */
  eventFor(key, event) {
    const mine = this.sets.get(key);
    if (!mine || !event || typeof event !== 'object') return null;
    if (event.kind === 'status') return { ...event, status: this.view(key, event.status) };
    if (event.kind !== 'batch') return event;
    const out = { ...event };
    let rows = 0;
    for (const field of this.rows) if (Array.isArray(event[field])) { out[field] = event[field].filter(row => mine.includes(row?.[this.itemKey])); rows += out[field].length; }
    return rows || event.gap ? out : null;
  }
}
function failure(error) {
  return { ok: false, error: { code: error instanceof BoundaryError ? error.code : 'INVALID_ARGUMENT', message: error instanceof BoundaryError ? error.message : 'Invalid request.' } };
}

/**
 * The window registry. `getPrimary()` is the main BrowserWindow (or null), `createWindow({bounds})` builds a hardened
 * window, `store` reads and writes the state text, `workAreas()` lists the display work areas, `isQuitting()` tells an
 * app.quit() apart from a user close, `resumeQuit()` resumes a quit that a held close cancelled. `feeds.alpaca` and
 * `feeds.coinbase` are FeedShare options without the list fields.
 */
function createWindowRegistry({ getPrimary, createWindow, store, workAreas = () => [], isQuitting = () => false, resumeQuit = () => {}, feeds, closeFlushTimeoutMs = 3000, relayTimeoutMs = RELAY_TIMEOUT_MS, timers = { setTimeout, clearTimeout } }) {
  const entries = new Map(); // webContents -> entry
  let state = [], nextId = 0, flushSequence = 0, relaySequence = 0, closingAll = null, saveTimer = null, primarySeeded = false;
  const relays = new Map();
  const shares = {
    alpaca: new FeedShare({ listKey: 'symbols', itemKey: 'symbol', max: feeds.alpaca.max ?? 30, rows: ['bars', 'trades', 'quotes'], priorityKey: 'quotesFor', ...feeds.alpaca }),
    coinbase: new FeedShare({ listKey: 'productIds', itemKey: 'productId', max: feeds.coinbase.max ?? 3, rows: ['candles', 'tickers'], ...feeds.coinbase })
  };
  const alive = window => !!window && !window.isDestroyed?.();
  const primaryContents = () => { const window = getPrimary(); return alive(window) ? window.webContents : null; };
  function seedPrimary() {
    if (primarySeeded) return; primarySeeded = true;
    const contents = primaryContents(); if (!contents) return;
    try { const alpaca = feeds.alpaca.existing()?.status(); if (alpaca && !['idle', 'closed'].includes(alpaca.state)) shares.alpaca.seed(contents, alpaca.symbols); } catch { /* none */ }
    try { const coinbase = feeds.coinbase.existing()?.status(); if (coinbase && !['idle', 'closed'].includes(coinbase.state)) shares.coinbase.seed(contents, coinbase.productIds); } catch { /* none */ }
  }
  function persist(delay = 0) {
    timers.clearTimeout(saveTimer); saveTimer = null;
    const write = () => { saveTimer = null; try { Promise.resolve(store?.write(serializeWindowState(state))).catch(() => {}); } catch { /* best effort */ } };
    if (delay) saveTimer = timers.setTimeout(write, delay); else write();
  }
  function placeOf(entry) {
    const window = entry.window;
    try { return { bounds: boundsOf(window.getNormalBounds?.() ?? window.getBounds?.()), maximized: window.isMaximized?.() === true }; } catch { return { bounds: null, maximized: false }; }
  }
  function remember(entry) {
    const row = { layoutId: entry.layoutId, ...placeOf(entry) }, at = state.findIndex(item => item.layoutId === entry.layoutId);
    if (at >= 0) state[at] = row; else state.push(row);
  }
  function notifyPrimary() {
    const contents = primaryContents();
    try { contents?.send('lv:window:layouts', { layoutIds: layoutIds() }); } catch { /* window closing */ }
  }
  const layoutIds = () => [...entries.values()].map(entry => entry.layoutId);
  function find(event) {
    const entry = event && entries.get(event.sender);
    if (!entry || !alive(entry.window) || event.senderFrame !== entry.window.webContents.mainFrame || !isAppURL(event.senderFrame?.url)) return null;
    return entry;
  }
  function finishFlush(entry, token) {
    if (!entry.flush || (token !== undefined && token !== entry.flush.token)) return false;
    timers.clearTimeout(entry.flush.timer); entry.flush = null; entry.flushed = true;
    if (isQuitting()) resumeQuit(); else if (alive(entry.window)) entry.window.close();
    return true;
  }
  function holdClose(entry, event) {
    if (entry.flushed) return;
    const contents = entry.window.webContents;
    if (!contents || contents.isDestroyed?.() || contents.isCrashed?.() || contents.isLoading?.()) { entry.flushed = true; return; }
    event?.preventDefault();
    if (entry.flush) return;
    const token = 'close-' + (++flushSequence);
    entry.flush = { token, timer: timers.setTimeout(() => finishFlush(entry, token), closeFlushTimeoutMs) };
    try { contents.send('lv:workspace:flush-request', token); } catch { finishFlush(entry, token); }
  }
  /** The layout window asks to save its layout first (layout Autosave off). Only a user close of that window
   * waits; a quit or a close of the main window still closes it. */
  function keepOpen(entry, token) {
    if (!entry.flush || token !== entry.flush.token) return false;
    if (isQuitting() || closingAll) return finishFlush(entry, token);
    timers.clearTimeout(entry.flush.timer); entry.flush = null; entry.flushed = false;
    return true;
  }
  async function closed(entry) {
    entries.delete(entry.contents);
    timers.clearTimeout(entry.flush?.timer);
    // A user close forgets the window. A quit, or a close of the main window, keeps it for the next start.
    if (!isQuitting() && !closingAll) { state = state.filter(row => row.layoutId !== entry.layoutId); persist(); } else persist();
    await Promise.allSettled([shares.alpaca.release(entry.contents), shares.coinbase.release(entry.contents)]);
    notifyPrimary();
    if (closingAll && !entries.size) { const resume = closingAll; closingAll = null; resume(); }
  }
  function open(layoutId, place = {}) {
    const existing = [...entries.values()].find(entry => entry.layoutId === layoutId);
    if (existing) { const window = existing.window; if (window.isMinimized?.()) window.restore(); window.show(); window.focus?.(); return { windowId: existing.id, focused: true }; }
    if (entries.size >= MAX_SECONDARY_WINDOWS) throw new BoundaryError('LIMIT', 'At most ' + MAX_SECONDARY_WINDOWS + ' layout windows can be open. Close one first.');
    if (!primaryContents()) throw new BoundaryError('UNAVAILABLE', 'The main window is not available.');
    seedPrimary();
    const id = ++nextId, bounds = visibleBounds(place.bounds, workAreas());
    const window = createWindow({ bounds });
    const entry = { id, layoutId, window, contents: window.webContents, flush: null, flushed: false };
    entries.set(entry.contents, entry);
    window.on('close', event => holdClose(entry, event));
    window.on('closed', () => { void closed(entry); });
    for (const name of ['move', 'resize', 'maximize', 'unmaximize']) window.on(name, () => { if (entries.has(entry.contents)) { remember(entry); persist(BOUNDS_SAVE_DELAY_MS); } });
    entry.contents.on?.('render-process-gone', () => { void shares.alpaca.release(entry.contents); void shares.coinbase.release(entry.contents); finishFlush(entry); });
    if (place.maximized) try { window.maximize(); } catch { /* best effort */ }
    remember(entry); persist(); notifyPrimary();
    Promise.resolve().then(() => window.loadURL(secondaryURL(id, layoutId))).catch(() => { try { entry.flushed = true; window.close(); } catch { /* closing */ } });
    return { windowId: id, focused: false };
  }
  return {
    channels: SECONDARY_CHANNELS,
    shares,
    open,
    /** lv:window:open-layout from the main window: exactly {layoutId}. */
    openLayout(value) { return open(layoutWindowInput(value)); },
    layoutIds,
    count: () => entries.size,
    /** A registered layout window's main frame on the app origin, for a channel it may use. */
    trustedSecondary(event, channel) { return !!find(event) && SECONDARY_CHANNELS.includes(channel); },
    isSecondary(event) { return !!find(event); },
    /** Restores the saved layout windows at their saved places (or the default place when the display is gone). */
    async restore() {
      let text = null;
      try { text = await store?.read(); } catch { /* none */ }
      state = parseWindowState(text);
      const saved = [...state];
      for (const row of saved) { try { open(row.layoutId, row); } catch { state = state.filter(item => item.layoutId !== row.layoutId); } }
      if (saved.length !== state.length) persist();
      return layoutIds();
    },
    /** The close-flush answer of a layout window. null when the sender is not one. */
    flushed(event, token) {
      const entry = find(event);
      if (!entry) return null;
      const answer = flushAnswerOf(token);
      if (!CLOSE_TOKEN.test(answer.token)) throw new BoundaryError('INVALID_ARGUMENT', 'Invalid flush acknowledgement.');
      if (answer.keepOpen) { const kept = keepOpen(entry, answer.token); return { accepted: kept, keptOpen: kept && alive(entry.window) && !entry.flushed }; }
      return { accepted: finishFlush(entry, answer.token) };
    },
    /** lv:close from a layout window closes that window only. */
    close(event) { const entry = find(event); if (!entry) return false; timers.setTimeout(() => { if (alive(entry.window)) entry.window.close(); }, 50); return true; },
    /** A real close of the main window (a quit, or a close with notification-area mode off) first closes the layout
     * windows, so their last layout saves reach the main window before it saves and closes. True when the close waits. */
    closeSecondariesFirst(event) {
      if (!entries.size) return false;
      event?.preventDefault();
      if (!closingAll) {
        closingAll = () => { if (isQuitting()) resumeQuit(); else { const primary = getPrimary(); if (alive(primary)) primary.close(); } };
        for (const entry of [...entries.values()]) try { entry.window.close(); } catch { /* closing */ }
      }
      return true;
    },
    /** A layout window's save, relayed to the main window (the single writer). Resolves with the new file revision. */
    relaySave(event, value) {
      const entry = find(event);
      if (!entry) throw new BoundaryError('DENIED', 'Only a layout window relays its layout.');
      const input = layoutSaveInput(value);
      if (input.layoutId !== entry.layoutId) throw new BoundaryError('DENIED', 'A layout window saves only its own layout.');
      const contents = primaryContents();
      if (!contents) throw new BoundaryError('UNAVAILABLE', 'The main window is not available, so the layout was not saved.');
      const requestId = 'relay-' + (++relaySequence);
      return new Promise((resolve, reject) => {
        const timer = timers.setTimeout(() => { relays.delete(requestId); reject(new BoundaryError('TIMEOUT', 'The main window did not confirm the layout save.')); }, relayTimeoutMs);
        relays.set(requestId, { kind: 'layout', resolve, reject, timer });
        try { contents.send('lv:window:layout-save-request', { requestId, layoutId: input.layoutId, grid: input.grid, ...(input.shared ? { shared: input.shared } : {}) }); }
        catch { timers.clearTimeout(timer); relays.delete(requestId); reject(new BoundaryError('UNAVAILABLE', 'The main window is not available, so the layout was not saved.')); }
      });
    },
    /** The main window's answer to a relayed save. */
    layoutSaved(value) {
      const input = layoutSavedInput(value), pending = relays.get(input.requestId);
      if (!pending || pending.kind !== 'layout') return { accepted: false };
      relays.delete(input.requestId); timers.clearTimeout(pending.timer);
      if (input.ok) pending.resolve({ revision: input.revision ?? 0, savedAt: new Date().toISOString() });
      else pending.reject(new BoundaryError('SAVE_REFUSED', input.message || 'The main window could not save the layout.'));
      return { accepted: true };
    },
    /** A layout window's paper action, relayed to the main window (which owns paper trading). Resolves with its
     * answer {ok, message}. */
    relayPaper(event, value) {
      const entry = find(event);
      if (!entry) throw new BoundaryError('DENIED', 'Only a layout window relays a paper action.');
      const input = paperActionInput(value), contents = primaryContents();
      if (!contents) throw new BoundaryError('UNAVAILABLE', 'The main window is not available, so no virtual order was sent.');
      const requestId = 'relay-' + (++relaySequence);
      return new Promise((resolve, reject) => {
        const timer = timers.setTimeout(() => { relays.delete(requestId); reject(new BoundaryError('TIMEOUT', 'The main window did not answer. No virtual order was sent from this window.')); }, PAPER_RELAY_TIMEOUT_MS);
        relays.set(requestId, { kind: 'paper', resolve, reject, timer });
        try { contents.send('lv:window:paper-request', { requestId, layoutId: entry.layoutId, ...input }); }
        catch { timers.clearTimeout(timer); relays.delete(requestId); reject(new BoundaryError('UNAVAILABLE', 'The main window is not available, so no virtual order was sent.')); }
      });
    },
    /** The main window's answer to a relayed paper action. With focus (its order ticket opened), the main
     * window comes to the front. */
    paperDone(value) {
      const input = paperDoneInput(value), pending = relays.get(input.requestId);
      if (!pending || pending.kind !== 'paper') return { accepted: false };
      relays.delete(input.requestId); timers.clearTimeout(pending.timer);
      if (input.focus) { const primary = getPrimary(); if (alive(primary)) { try { if (primary.isMinimized?.()) primary.restore(); primary.show(); primary.focus?.(); } catch { /* best effort */ } } }
      pending.resolve({ ok: input.ok, message: input.message });
      return { accepted: true };
    },
    /** The main window reset or replaced the workspace. Every layout window reloads its page, so it reads the
     * new saved file (a window whose layout is gone then closes itself). Its live symbols are released first; the page
     * subscribes again. Returns the number of windows reloaded. */
    async refreshAll() {
      let count = 0;
      for (const entry of [...entries.values()]) {
        if (!alive(entry.window)) continue;
        await Promise.allSettled([shares.alpaca.release(entry.contents), shares.coinbase.release(entry.contents)]);
        try { entry.contents.reload(); count++; } catch { /* window closing */ }
      }
      return count;
    },
    /** The window a request came from (a registered layout window), or null. Export dialogs open over it. */
    windowOf(event) { const entry = find(event); return entry ? entry.window : null; },
    /** Live events: each window receives its own symbols only. */
    pushLive(channel, event) {
      const share = channel === 'lv:alpaca:event' ? shares.alpaca : channel === 'lv:coinbase:event' ? shares.coinbase : null;
      if (!share) return;
      const targets = [primaryContents(), ...[...entries.values()].filter(entry => alive(entry.window)).map(entry => entry.contents)];
      for (const contents of targets) {
        if (!contents || contents.isDestroyed?.()) continue;
        const view = share.eventFor(contents, event);
        if (view) try { contents.send(channel, view); } catch { /* window closing */ }
      }
    },
    /** The sender's webContents, the key of its feed share (the main window included). */
    feedKey(event) { return event?.sender ?? null; }
  };
}

module.exports = { createWindowRegistry, FeedShare, layoutWindowInput, layoutSaveInput, layoutSavedInput, paperActionInput, paperDoneInput, SHARED_WORKSPACE_KEYS, parseWindowState, serializeWindowState, visibleBounds, secondaryURL, SECONDARY_CHANNELS, MAX_SECONDARY_WINDOWS, WINDOW_STATE_FILE, CAP_MESSAGE };
