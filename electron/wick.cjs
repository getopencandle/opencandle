'use strict';
// Wick mode shrinks
// OpenCandle to its row of layout tabs (the tabs that read "GME 23.82 -0.75%"), as a small frameless strip that stays on top of
// other windows. The main window is hidden, never closed, so its renderer keeps every feed, alert and paper fill running and
// nothing is fetched twice: it sends the strip what its own tab strip shows (labels and theme colours) and the strip window only
// draws it. Clicking the active tab, double-clicking the strip, Esc or the expand button bring the full window back at its
// previous bounds and maximized or full screen state. "Switch to Wick mode when I leave OpenCandle" collapses the main window
// 400 ms after it loses focus to another app, never while a native dialog holds it, while another OpenCandle window has the
// focus, while it is minimized, hidden or in full screen, or during startup.
//
// This module creates no window itself (main.cjs passes createWindow, which builds every window with the same hardened
// webPreferences, CSP, preload and navigation denial) and needs only ./validation.cjs. Electron's screen and Menu objects are
// passed in. No network, process or shell access. main.cjs loads it lazily, on the first Wick mode call.
const { BoundaryError, exactKeys, isAppURL } = require('./validation.cjs');

const WICK_STATE_FILE = 'wick-state.json';
/** The strip is exactly one tab row high (layout-tabs.css --lv-tabstrip-h), in device-independent pixels. */
const STRIP_HEIGHT = 34;
const MIN_STRIP_WIDTH = 180, MAX_STRIP_WIDTH = 3000, DEFAULT_STRIP_WIDTH = 560;
/** The default place: this far in from the top right corner of the work area. */
const STRIP_MARGIN = 16;
const BLUR_DEBOUNCE_MS = 400;
/** No collapse on leaving during the first 3 s after the main page loaded, or for 1 s after the full window came back. */
const STARTUP_GRACE_MS = 3000;
const RESTORE_COOLDOWN_MS = 1000;
const PLACE_SAVE_DELAY_MS = 400;
const FULL_SCREEN_LEAVE_TIMEOUT_MS = 1500;
const MAX_STATE_BYTES = 16 * 1024;
const MAX_PLACES = 16;
const MAX_TABS = 50;
const LAYOUT_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const DISPLAY_KEY = /^[A-Za-z0-9_.:-]{1,64}$/;
/** The theme tokens the strip takes from the main window, and the colour forms a value may have. */
const THEME_TOKENS = Object.freeze(['--lv-bg-raised', '--lv-bg-surface', '--lv-text-primary', '--lv-text-secondary', '--lv-text-hint', '--lv-hover', '--lv-hover-strong', '--lv-accent', '--lv-focus-ring', '--lv-positive-text', '--lv-negative-text', '--lv-border']);
const COLOR = /^(?:#[0-9A-Fa-f]{3,8}|rgba?\(\s*[0-9.]+%?\s*(?:,\s*[0-9.]+%?\s*){2,3}\)|rgba?\(\s*[0-9.]+%?(?:\s+[0-9.]+%?){2}(?:\s*\/\s*[0-9.]+%?)?\s*\))$/;
/** The only channels the strip window may use. Never a workspace read or write, a feed, a file dialog, the key or the tray. */
const STRIP_CHANNELS = Object.freeze(['lv:wick:ready', 'lv:wick:restore', 'lv:wick:select-tab', 'lv:wick:menu']);
const WICK_MENU_LABELS = Object.freeze({ open: 'Open OpenCandle', onTop: 'Always on top', exit: 'Exit Wick mode', quit: 'Quit' });
const WICK_DEFAULTS = Object.freeze({ alwaysOnTop: true, collapseOnBlur: false });
const fail = message => { throw new BoundaryError('INVALID_ARGUMENT', message); };
const int = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

/** The renderer's Settings rows: exactly {alwaysOnTop, collapseOnBlur}, both booleans. */
function wickPreferenceInput(value) {
  exactKeys(value, ['alwaysOnTop', 'collapseOnBlur']);
  if (typeof value.alwaysOnTop !== 'boolean' || typeof value.collapseOnBlur !== 'boolean') fail('Expected alwaysOnTop and collapseOnBlur (on or off).');
  return { alwaysOnTop: value.alwaysOnTop, collapseOnBlur: value.collapseOnBlur };
}
/** A tab the strip asks for: exactly {id}, a saved-layout identifier. */
function wickTabInput(value) {
  exactKeys(value, ['id']);
  if (typeof value.id !== 'string' || !LAYOUT_ID.test(value.id)) fail('Invalid layout tab.');
  return { id: value.id };
}
/**
 * What the main window's tab strip shows: exactly {tabs, theme}. Each tab is exactly {id, symbol, name, active} and optionally
 * {price, change, tone}; short plain strings only. theme maps the fixed THEME_TOKENS to colour values. One tab is active.
 */
function wickSnapshotInput(value) {
  exactKeys(value, ['tabs', 'theme']);
  if (!Array.isArray(value.tabs) || value.tabs.length < 1 || value.tabs.length > MAX_TABS) fail('Invalid tab strip.');
  const seen = new Set();
  const tabs = value.tabs.map(tab => {
    exactKeys(tab, ['id', 'symbol', 'name', 'active'], ['price', 'change', 'tone']);
    if (typeof tab.id !== 'string' || !LAYOUT_ID.test(tab.id) || seen.has(tab.id)) fail('Invalid tab strip.');
    seen.add(tab.id);
    if (!text(tab.symbol, 40) || !text(tab.name, 200) || typeof tab.active !== 'boolean') fail('Invalid tab strip.');
    if (tab.price !== undefined && !text(tab.price, 40)) fail('Invalid tab strip.');
    if (tab.change !== undefined && !text(tab.change, 20)) fail('Invalid tab strip.');
    if (tab.tone !== undefined && !['up', 'down', 'flat'].includes(tab.tone)) fail('Invalid tab strip.');
    return { id: tab.id, symbol: tab.symbol, name: tab.name, active: tab.active, ...(tab.price !== undefined ? { price: tab.price } : {}), ...(tab.change !== undefined ? { change: tab.change } : {}), ...(tab.tone !== undefined ? { tone: tab.tone } : {}) };
  });
  if (tabs.filter(tab => tab.active).length !== 1) fail('Invalid tab strip.');
  exactKeys(value.theme, [], THEME_TOKENS);
  const theme = {};
  for (const [token, color] of Object.entries(value.theme)) { if (typeof color !== 'string' || color.length > 60 || !COLOR.test(color.trim())) fail('Invalid theme colour.'); theme[token] = color.trim(); }
  return { tabs, theme };
}

/** Saved state, `{schemaVersion:1, alwaysOnTop, collapseOnBlur, places:{[displayKey]:{dx,dy,width}}}`. Unreadable gives the defaults. */
function parseWickState(textValue) {
  const fallback = { ...WICK_DEFAULTS, places: {} };
  try {
    if (typeof textValue !== 'string' || textValue.length > MAX_STATE_BYTES) return fallback;
    const value = JSON.parse(textValue);
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) return fallback;
    const places = {};
    if (value.places && typeof value.places === 'object' && !Array.isArray(value.places)) {
      for (const [key, place] of Object.entries(value.places)) {
        if (Object.keys(places).length >= MAX_PLACES) break;
        if (!DISPLAY_KEY.test(key) || !place || typeof place !== 'object') continue;
        if (!int(place.dx, -100000, 100000) || !int(place.dy, -100000, 100000) || !int(place.width, MIN_STRIP_WIDTH, MAX_STRIP_WIDTH)) continue;
        places[key] = { dx: place.dx, dy: place.dy, width: place.width };
      }
    }
    return { alwaysOnTop: typeof value.alwaysOnTop === 'boolean' ? value.alwaysOnTop : WICK_DEFAULTS.alwaysOnTop, collapseOnBlur: typeof value.collapseOnBlur === 'boolean' ? value.collapseOnBlur : WICK_DEFAULTS.collapseOnBlur, places };
  } catch { return fallback; }
}
function serializeWickState(state) {
  const places = {};
  for (const [key, place] of Object.entries(state.places ?? {}).slice(-MAX_PLACES)) places[key] = { dx: place.dx, dy: place.dy, width: place.width };
  return JSON.stringify({ schemaVersion: 1, alwaysOnTop: state.alwaysOnTop !== false, collapseOnBlur: state.collapseOnBlur === true, places });
}

const areaOf = area => area && int(Math.round(area.x), -100000, 100000) && int(Math.round(area.y), -100000, 100000) && int(Math.round(area.width), 1, 100000) && int(Math.round(area.height), 1, 100000) ? { x: Math.round(area.x), y: Math.round(area.y), width: Math.round(area.width), height: Math.round(area.height) } : null;
/** The key a display's strip place is saved under (Electron's display id; a display without one has none). */
function displayKeyOf(display) {
  const id = display && (typeof display.id === 'number' || typeof display.id === 'string') ? String(display.id) : '';
  return DISPLAY_KEY.test(id) ? id : null;
}
/** The strip fully inside a work area: the width within [MIN_STRIP_WIDTH, work area width], then moved in from every edge. */
function clampStrip(bounds, workArea) {
  const area = areaOf(workArea);
  if (!area) return null;
  const width = Math.max(Math.min(MIN_STRIP_WIDTH, area.width), Math.min(area.width, MAX_STRIP_WIDTH, Math.round(Number.isFinite(bounds?.width) ? bounds.width : DEFAULT_STRIP_WIDTH)));
  const height = Math.min(STRIP_HEIGHT, area.height);
  const x0 = Number.isFinite(bounds?.x) ? Math.round(bounds.x) : area.x + area.width - width - STRIP_MARGIN;
  const y0 = Number.isFinite(bounds?.y) ? Math.round(bounds.y) : area.y + STRIP_MARGIN;
  const x = Math.min(Math.max(x0, area.x), area.x + area.width - width), y = Math.min(Math.max(y0, area.y), area.y + area.height - height);
  return { x, y, width, height };
}
/** The default place on a work area: the top right corner, STRIP_MARGIN in. */
function defaultStripBounds(workArea, width = DEFAULT_STRIP_WIDTH) { return clampStrip({ width }, workArea); }
/** Where the strip opens on `display`: its saved place there (relative to the work area, so a resolution or scale change keeps
 * it on screen), else the default place. */
function stripBoundsFor(places, display) {
  const area = areaOf(display?.workArea), key = displayKeyOf(display), place = key ? places?.[key] : null;
  if (!area) return null;
  return place ? clampStrip({ x: area.x + place.dx, y: area.y + place.dy, width: place.width }, area) : defaultStripBounds(area);
}
/** The place to save for strip bounds on `display`. */
function placeOf(bounds, display) {
  const area = areaOf(display?.workArea), key = displayKeyOf(display);
  if (!area || !key || !bounds) return null;
  const box = clampStrip(bounds, area);
  return box ? { key, place: { dx: box.x - area.x, dy: box.y - area.y, width: Math.max(MIN_STRIP_WIDTH, box.width) } } : null;
}
/** True when at least 100 x 50 px of `bounds` lie on one of the work areas (the full window comes back where it was). */
function onScreen(bounds, workAreas) {
  if (!bounds || !Array.isArray(workAreas)) return false;
  return workAreas.some(raw => { const area = areaOf(raw); return !!area && Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x) >= 100 && Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y) >= 50; });
}

/**
 * Whether a lost focus may collapse the main window now. Every guard must pass: the option is on, startup and the restore
 * cooldown are over, Wick mode is not already on, the main window is visible, enabled (a native dialog disables it), not
 * minimized, not in full screen, and no other OpenCandle window (a layout window, the strip, a dialog's owner) has the focus.
 */
function mayCollapse(input) {
  const { enabled, active, now, loadedAt, restoredAt, quitting, main, focusedOther } = input;
  if (!enabled || active || quitting || focusedOther) return false;
  if (!Number.isFinite(loadedAt) || now - loadedAt < STARTUP_GRACE_MS) return false;
  if (Number.isFinite(restoredAt) && now - restoredAt < RESTORE_COOLDOWN_MS) return false;
  if (!main || !main.visible || main.minimized || main.fullScreen || !main.enabled || main.focused) return false;
  return true;
}
/** One pending collapse at a time: blur() starts the 400 ms wait when check('blur') allows it (a second blur restarts it),
 * focus() or cancel() drops it. When the wait ends, check('fire') decides again and collapse() runs only on a yes. */
function createBlurDebounce({ delayMs = BLUR_DEBOUNCE_MS, timers = { setTimeout, clearTimeout }, check, collapse }) {
  let timer = null;
  const cancel = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; };
  return {
    blur() { cancel(); if (!check('blur')) return false; timer = timers.setTimeout(() => { timer = null; if (check('fire')) collapse(); }, delayMs); return true; },
    focus: cancel,
    cancel,
    pending: () => timer !== null
  };
}

/**
 * The Wick mode controller. `getMain()` is the main BrowserWindow (or null). `createWindow(options)` builds a hardened window
 * (main.cjs createAppWindow + hardenWindow). `screen` and `Menu` are Electron's. `store` reads and writes the state text.
 * `loadedAt()` is when the main page finished loading (null before), `isQuitting()` tells a quit apart, `quit()` quits,
 * `focusedWindow()` is the focused BrowserWindow or null.
 */
function createWickMode({ getMain, createWindow, screen, Menu, store, loadedAt = () => null, isQuitting = () => false, quit = () => {}, focusedWindow = () => null, now = () => Date.now(), timers = { setTimeout, clearTimeout }, stripURL = 'lv://app/index.html?window=wick' }) {
  let state = { ...WICK_DEFAULTS, places: {} }, loaded = null, strip = null, stripReady = false, active = false, snapshot = null, restoredAt = null, back = null, saveTimer = null, placeTimer = null, destroyed = false, screenWatch = null, entering = null;
  const alive = window => !!window && !window.isDestroyed?.();
  const mainWindow = () => { const window = getMain(); return alive(window) ? window : null; };
  const persist = () => { timers.clearTimeout(saveTimer); saveTimer = null; try { Promise.resolve(store?.write(serializeWickState(state))).catch(() => {}); } catch { /* best effort */ } };
  function load() {
    if (!loaded) loaded = (async () => { try { const textValue = await store?.read(); if (typeof textValue === 'string') state = parseWickState(textValue); } catch { /* defaults */ } })();
    return loaded;
  }
  const publicState = () => ({ active, alwaysOnTop: state.alwaysOnTop, collapseOnBlur: state.collapseOnBlur });
  function notifyMain() { const main = mainWindow(); try { main?.webContents.send('lv:wick:state', publicState()); } catch { /* window closing */ } }
  function sendSnapshot() { if (alive(strip) && stripReady && snapshot) try { strip.webContents.send('lv:wick:snapshot', snapshot); } catch { /* window closing */ } }
  function displays() { try { return screen.getAllDisplays(); } catch { return []; } }
  function displayOf(bounds) { try { return bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay(); } catch { try { return screen.getPrimaryDisplay(); } catch { return null; } } }
  /** The strip keeps no taskbar button while it is on top; off top it gets one, so a buried strip can always be found. */
  function applyOnTop() {
    if (!alive(strip)) return;
    try { strip.setAlwaysOnTop(state.alwaysOnTop, 'floating'); } catch { /* best effort */ }
    try { strip.setSkipTaskbar(state.alwaysOnTop); } catch { /* best effort */ }
  }
  function rememberPlace() {
    if (!alive(strip)) return;
    let bounds; try { bounds = strip.getBounds(); } catch { return; }
    const saved = placeOf(bounds, displayOf(bounds));
    if (!saved) return;
    const places = { ...state.places }; delete places[saved.key]; places[saved.key] = saved.place;
    state = { ...state, places }; persist();
  }
  /** After a display change (unplugged, resolution, scale) the strip moves fully back onto the display it is on. */
  function reclamp() {
    if (!alive(strip) || !active) return;
    let bounds; try { bounds = strip.getBounds(); } catch { return; }
    const display = displayOf(bounds), box = display ? clampStrip(bounds, display.workArea) : null;
    if (box && (box.x !== bounds.x || box.y !== bounds.y || box.width !== bounds.width || box.height !== bounds.height)) try { strip.setBounds(box); } catch { /* best effort */ }
  }
  function watchScreen() {
    if (screenWatch || typeof screen?.on !== 'function') return;
    screenWatch = () => timers.setTimeout(reclamp, 50);
    for (const name of ['display-added', 'display-removed', 'display-metrics-changed']) try { screen.on(name, screenWatch); } catch { /* best effort */ }
  }
  function unwatchScreen() {
    if (!screenWatch) return;
    for (const name of ['display-added', 'display-removed', 'display-metrics-changed']) try { screen.removeListener?.(name, screenWatch); } catch { /* best effort */ }
    screenWatch = null;
  }
  function popupMenu() {
    if (!alive(strip) || !Menu) return false;
    const menu = Menu.buildFromTemplate([
      { label: WICK_MENU_LABELS.open, click: () => { exit(); } },
      { label: WICK_MENU_LABELS.onTop, type: 'checkbox', checked: state.alwaysOnTop, click: () => { setPreferences({ alwaysOnTop: !state.alwaysOnTop, collapseOnBlur: state.collapseOnBlur }, true); } },
      { type: 'separator' },
      { label: WICK_MENU_LABELS.exit, click: () => { exit(); } },
      { label: WICK_MENU_LABELS.quit, click: () => { quit(); } }
    ]);
    try { menu.popup({ window: strip }); } catch { return false; }
    return true;
  }
  /** Right-click anywhere on the strip: Windows reports a click on the draggable area as a non-client message, not a page event,
   * so both routes (system-context-menu and WM_NCRBUTTONUP) open the menu; two reports of one click open it once. */
  let lastMenuAt = -Infinity;
  function popupMenuOnce() { const at = now(); if (at - lastMenuAt < 300) return false; lastMenuAt = at; return popupMenu(); }
  function ensureStrip(bounds) {
    if (alive(strip)) return strip;
    stripReady = false;
    strip = createWindow({ ...bounds, minWidth: MIN_STRIP_WIDTH, maxWidth: MAX_STRIP_WIDTH, minHeight: STRIP_HEIGHT, maxHeight: STRIP_HEIGHT, frame: false, resizable: true, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: state.alwaysOnTop, alwaysOnTop: state.alwaysOnTop, show: false, title: 'OpenCandle' });
    const window = strip;
    window.on('close', event => { if (isQuitting() || destroyed) return; event?.preventDefault?.(); exit(); });
    window.on('closed', () => { if (strip === window) { strip = null; stripReady = false; } });
    for (const name of ['moved', 'resized']) window.on(name, () => { timers.clearTimeout(placeTimer); placeTimer = timers.setTimeout(rememberPlace, PLACE_SAVE_DELAY_MS); });
    // Right-click on the empty (draggable) part of the strip opens this menu instead of the Windows system menu.
    window.on('system-context-menu', event => { event?.preventDefault?.(); popupMenuOnce(); });
    // Double-click on the draggable part (Windows sends no page event there): back to the full window. maximizable:false keeps
    // Windows from maximizing the strip.
    try { if (typeof window.hookWindowMessage === 'function') window.hookWindowMessage(0x00A3 /* WM_NCLBUTTONDBLCLK */, () => { timers.setTimeout(exit, 0); }); } catch { /* not Windows */ }
    try { if (typeof window.hookWindowMessage === 'function') window.hookWindowMessage(0x00A5 /* WM_NCRBUTTONUP */, () => { timers.setTimeout(popupMenuOnce, 0); }); } catch { /* not Windows */ }
    window.webContents.on('before-input-event', (event, input) => {
      if (input?.type !== 'keyDown') return;
      if (input.key === 'Escape' && !input.control && !input.alt && !input.meta && !input.shift) { event.preventDefault(); exit(); }
      else if (input.key === 'F11') event.preventDefault();
    });
    window.webContents.on?.('render-process-gone', () => { stripReady = false; if (active) exit(); });
    applyOnTop();
    Promise.resolve().then(() => window.loadURL(stripURL)).catch(() => { if (active) exit(); });
    return window;
  }
  /** `focus`: an explicit entry (shortcut, palette, button, menu) shows the strip and focuses it; the automatic collapse after
   * leaving OpenCandle never takes the focus from the app the owner switched to. */
  function showStrip(bounds, focus) {
    const window = ensureStrip(bounds);
    try { window.setBounds(bounds); } catch { /* best effort */ }
    applyOnTop();
    try { if (focus) window.show(); else window.showInactive(); } catch { /* best effort */ }
  }
  function focusStrip() {
    if (!alive(strip)) return;
    try { strip.focus(); } catch { /* best effort */ }
    try { strip.webContents.focus?.(); } catch { /* best effort */ }
  }
  function hideMain(main, focus) {
    let normal = null, maximized = false;
    try { normal = main.getNormalBounds?.() ?? main.getBounds(); maximized = main.isMaximized?.() === true; } catch { /* best effort */ }
    back = { ...back, normal, maximized };
    const display = displayOf(normal);
    showStrip(stripBoundsFor(state.places, display) ?? defaultStripBounds({ x: 0, y: 0, width: 1280, height: 800 }), focus);
    // A hidden window must not keep the keyboard: drop its focus, hide it, then give the focus to the strip (explicit entry).
    try { main.blur?.(); } catch { /* best effort */ }
    try { main.hide(); } catch { /* best effort */ }
    if (focus) focusStrip();
    watchScreen();
    notifyMain();
  }
  /** Shows the strip and hides the main window. From full screen the window first leaves it (and goes back into it on return). */
  function enter(options) {
    const focus = options?.focus !== false;
    const main = mainWindow();
    if (!main || active || destroyed || isQuitting()) return { active };
    active = true; back = { normal: null, maximized: false, fullScreen: false };
    let fullScreen = false; try { fullScreen = main.isFullScreen?.() === true; } catch { /* none */ }
    if (fullScreen) {
      back.fullScreen = true;
      const go = () => { if (entering !== go) return; entering = null; timers.clearTimeout(go.timer); const current = mainWindow(); if (active && current) hideMain(current, focus); };
      entering = go; go.timer = timers.setTimeout(go, FULL_SCREEN_LEAVE_TIMEOUT_MS);
      try { main.once('leave-full-screen', () => timers.setTimeout(go, 50)); main.setFullScreen(false); } catch { go(); }
      return { active };
    }
    hideMain(main, focus);
    return { active };
  }
  /** Hides the strip and brings the full window back where it was. `shown`: the main window was shown by someone else (the
   * tray, a second start), so it is not shown again. */
  function exit(shown = false) {
    if (!active) return { active };
    active = false; entering = null;
    timers.clearTimeout(placeTimer); placeTimer = null;
    if (alive(strip)) { rememberPlace(); try { strip.hide(); } catch { /* best effort */ } }
    unwatchScreen();
    const main = mainWindow(), saved = back; back = null;
    if (main) {
      restoredAt = now();
      try {
        if (!shown) {
          if (main.isMinimized?.()) main.restore();
          main.show();
          if (saved?.normal && !saved.maximized) { if (onScreen(saved.normal, displays().map(display => display.workArea))) main.setBounds(saved.normal); else main.center?.(); }
        }
        if (saved?.maximized && !main.isMaximized?.()) main.maximize();
        if (saved?.fullScreen) main.setFullScreen(true);
        if (!shown) main.focus?.();
      } catch { /* best effort */ }
    }
    notifyMain();
    return { active };
  }
  function setPreferences(value, fromMenu = false) {
    const input = wickPreferenceInput(value);
    if (input.alwaysOnTop !== state.alwaysOnTop || input.collapseOnBlur !== state.collapseOnBlur) {
      state = { ...state, ...input }; persist(); applyOnTop();
      if (!input.collapseOnBlur) debounce.cancel();
      if (fromMenu) notifyMain();
    }
    return publicState();
  }
  function focusedOther() {
    try { const focused = focusedWindow(), main = mainWindow(); return !!focused && focused !== main; } catch { return false; }
  }
  function mainState() {
    const main = mainWindow();
    if (!main) return null;
    try { return { visible: main.isVisible?.() !== false, minimized: main.isMinimized?.() === true, fullScreen: main.isFullScreen?.() === true, enabled: main.isEnabled?.() !== false, focused: main.isFocused?.() === true }; } catch { return null; }
  }
  // At the blur itself Windows may not have moved the focus yet, so only the end of the wait checks the focus.
  const check = phase => { const main = mainState(); return mayCollapse({ enabled: state.collapseOnBlur, active, now: now(), loadedAt: loadedAt(), restoredAt, quitting: isQuitting() || destroyed, main: main && phase === 'blur' ? { ...main, focused: false } : main, focusedOther: phase === 'fire' && focusedOther() }); };
  const debounce = createBlurDebounce({ timers, check, collapse: () => { enter({ focus: false }); } });
  return {
    load,
    channels: STRIP_CHANNELS,
    state: publicState,
    isActive: () => active,
    enter: options => enter(options),
    exit: () => exit(false),
    configure(value) { return setPreferences(value); },
    /** The main window's tab strip, forwarded to the strip window. */
    publish(value) { snapshot = wickSnapshotInput(value); sendSnapshot(); return { accepted: true }; },
    /** The strip window's main frame on the app origin, for one of its channels. */
    trustedStrip(event, channel) {
      if (!alive(strip) || !event || event.sender !== strip.webContents || event.senderFrame !== strip.webContents.mainFrame) return false;
      return isAppURL(event.senderFrame?.url) && STRIP_CHANNELS.includes(channel);
    },
    /** lv:wick:ready: the strip page is up; it gets the last tab strip (null before the first). */
    ready() { stripReady = true; return snapshot; },
    /** lv:wick:select-tab: the main window switches to that tab (the strip stays). The active tab brings the full window back. */
    selectTab(value) {
      const { id } = wickTabInput(value);
      const tab = snapshot?.tabs.find(row => row.id === id);
      if (!tab) throw new BoundaryError('INVALID_ARGUMENT', 'That tab is not open.');
      if (tab.active) { exit(); return { restored: true }; }
      const main = mainWindow();
      try { main?.webContents.send('lv:wick:tab-request', { id }); } catch { /* window closing */ }
      return { restored: false };
    },
    menu() { return { shown: popupMenu() }; },
    /** The main window was shown by someone else (tray, second start): Wick mode ends, the strip hides. */
    mainShown() { if (active) exit(true); },
    mainBlur() { return debounce.blur(); },
    mainFocus() { debounce.focus(); },
    /** Main window closed or app quitting: the strip goes too. */
    destroy() {
      destroyed = true; active = false; debounce.cancel(); unwatchScreen();
      timers.clearTimeout(placeTimer); timers.clearTimeout(saveTimer);
      if (alive(strip)) try { if (typeof strip.destroy === 'function') strip.destroy(); else strip.close(); } catch { /* closing */ }
      strip = null;
    },
    strip: () => strip
  };
}

module.exports = { createWickMode, createBlurDebounce, mayCollapse, wickPreferenceInput, wickTabInput, wickSnapshotInput, parseWickState, serializeWickState, clampStrip, defaultStripBounds, stripBoundsFor, placeOf, onScreen, displayKeyOf, WICK_STATE_FILE, WICK_DEFAULTS, WICK_MENU_LABELS, STRIP_CHANNELS, THEME_TOKENS, STRIP_HEIGHT, MIN_STRIP_WIDTH, DEFAULT_STRIP_WIDTH, BLUR_DEBOUNCE_MS, STARTUP_GRACE_MS, RESTORE_COOLDOWN_MS };
