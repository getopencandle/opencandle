'use strict';
// Wording and behaviour: closing the
// window keeps OpenCandle running in the Windows notification area. The window is hidden, not destroyed, so the
// renderer keeps evaluating alerts, keeps its background alert feeds and their live streams, keeps filling paper orders,
// and desktop notifications still fire. Quit (tray menu, app menu) exits fully through app.quit(), which keeps the
// existing workspace save flush. No network access, no new renderer capability: this module only drives Electron's Tray,
// Menu, nativeImage and Notification objects that main.cjs passes in, plus one small local state file.
const { BoundaryError } = require('./validation.cjs');

const TRAY_TOOLTIP = 'OpenCandle';
const TRAY_MENU_LABELS = Object.freeze({ open: 'Open OpenCandle', quit: 'Quit OpenCandle' });
const TRAY_NOTICE = Object.freeze({ title: 'OpenCandle', body: 'OpenCandle is still running in the notification area so alerts keep working. Right-click the tray icon to quit.' });
const TRAY_STATE_FILE = 'tray-state.json';
// Tray bitmaps at the Windows notification-area sizes for 100%, 125%, 150% and 200% display scaling. Main passes
// one pre-drawn file per size (electron/assets/opencandle-tray-<size>.png; 16-24 px use the simplified flame + green candle);
// a missing or unreadable size falls back to resizing the app icon.
const TRAY_ICON_SIZES = Object.freeze([[1, 16], [1.25, 20], [1.5, 24], [2, 32]]);
const MAX_STATE_BYTES = 1024;

/** The renderer's setting: exactly {keepRunning:boolean}. */
function trayPreferenceInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new BoundaryError('INVALID_ARGUMENT', 'Expected a plain object.');
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'keepRunning' || typeof value.keepRunning !== 'boolean') throw new BoundaryError('INVALID_ARGUMENT', 'Expected only keepRunning (on or off).');
  return { keepRunning: value.keepRunning };
}

/** Saved tray state. Anything unreadable falls back to the factory state (keep running on, notice not shown yet). */
function parseTrayState(text) {
  try {
    if (typeof text !== 'string' || text.length > MAX_STATE_BYTES) return { keepRunning: true, noticeShown: false };
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) return { keepRunning: true, noticeShown: false };
    return { keepRunning: typeof value.keepRunning === 'boolean' ? value.keepRunning : true, noticeShown: value.noticeShown === true };
  } catch { return { keepRunning: true, noticeShown: false }; }
}
const serializeTrayState = state => JSON.stringify({ schemaVersion: 1, keepRunning: state.keepRunning, noticeShown: state.noticeShown });

const emptyImage = image => !image || (typeof image.isEmpty === 'function' && image.isEmpty());
/**
 * The tray icon: the pre-drawn file for each scale (`iconPaths[size]`), else the app icon resized to it. When neither
 * loads, the unreadable app icon image is returned as is (Windows shows a blank slot).
 */
function trayIconImage(nativeImage, iconPath, iconPaths = null) {
  const sized = new Map();
  for (const [, size] of TRAY_ICON_SIZES) {
    const file = iconPaths && typeof iconPaths[size] === 'string' ? iconPaths[size] : null;
    const image = file ? nativeImage.createFromPath(file) : null;
    if (!emptyImage(image)) sized.set(size, image);
  }
  let source = null;
  if (sized.size < TRAY_ICON_SIZES.length) {
    source = nativeImage.createFromPath(iconPath);
    if (emptyImage(source)) { if (sized.size === 0) return source; source = null; }
  }
  const image = nativeImage.createEmpty();
  for (const [scaleFactor, size] of TRAY_ICON_SIZES) {
    const buffer = sized.has(size) ? sized.get(size).toPNG() : source ? source.resize({ width: size, height: size, quality: 'best' }).toPNG() : null;
    if (buffer) image.addRepresentation({ scaleFactor, width: size, height: size, buffer });
  }
  return image;
}

/**
 * Notification-area mode. `getWindow()` returns the main BrowserWindow (or null). `store` reads and writes the state text
 * (`read(): Promise<string|null>`, `write(text): Promise<void>`); failures never block closing or quitting.
 */
function createTrayMode({ app, Tray, Menu, nativeImage, Notification, iconPath, iconPaths = null, getWindow, store }) {
  let state = { keepRunning: true, noticeShown: false }, tray = null, destroyed = false, loaded = null;
  const persist = () => { try { return Promise.resolve(store?.write(serializeTrayState(state))).catch(() => {}); } catch { return Promise.resolve(); } };
  function load() {
    if (!loaded) loaded = (async () => { try { const text = await store?.read(); if (typeof text === 'string') state = parseTrayState(text); } catch { /* factory state */ } })();
    return loaded;
  }
  function showWindow() {
    const window = getWindow();
    if (!window || window.isDestroyed()) return false;
    if (window.isMinimized?.()) window.restore();
    window.show(); window.focus?.();
    return true;
  }
  function quit() { app.quit(); }
  function ensureTray() {
    if (tray || destroyed) return tray;
    tray = new Tray(trayIconImage(nativeImage, iconPath, iconPaths));
    tray.setToolTip(TRAY_TOOLTIP);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: TRAY_MENU_LABELS.open, click: () => { showWindow(); } },
      { type: 'separator' },
      { label: TRAY_MENU_LABELS.quit, click: () => { quit(); } }
    ]));
    tray.on('double-click', () => { showWindow(); });
    return tray;
  }
  function showNotice() {
    if (state.noticeShown) return false;
    state = { ...state, noticeShown: true };
    void persist();
    try {
      if (typeof tray?.displayBalloon === 'function') { tray.displayBalloon({ title: TRAY_NOTICE.title, content: TRAY_NOTICE.body, iconType: 'info' }); return true; }
      if (Notification && typeof Notification.isSupported === 'function' && Notification.isSupported()) { new Notification({ title: TRAY_NOTICE.title, body: TRAY_NOTICE.body, silent: true }).show(); return true; }
    } catch { /* the notice is best effort */ }
    return false;
  }
  return {
    load,
    keepRunning: () => state.keepRunning,
    noticeShown: () => state.noticeShown,
    setKeepRunning(value) {
      const input = trayPreferenceInput(value);
      if (input.keepRunning !== state.keepRunning) { state = { ...state, keepRunning: input.keepRunning }; void persist(); }
      return { keepRunning: state.keepRunning };
    },
    /** A title-bar close outside a quit: true when the window was hidden to the tray instead. */
    interceptClose(event, quitting) {
      if (quitting || destroyed || !state.keepRunning) return false;
      const window = getWindow();
      if (!window || window.isDestroyed()) return false;
      // Without a tray icon there would be no way back or out, so a failed tray closes the window as before.
      try { if (!ensureTray()) return false; } catch { try { tray?.destroy(); } catch { /* best effort */ } tray = null; return false; }
      event?.preventDefault();
      window.hide();
      showNotice();
      return true;
    },
    showWindow,
    quit,
    destroy() { destroyed = true; try { tray?.destroy(); } catch { /* best effort */ } tray = null; },
    tray: () => tray
  };
}

module.exports = { createTrayMode, trayPreferenceInput, parseTrayState, serializeTrayState, trayIconImage, TRAY_MENU_LABELS, TRAY_NOTICE, TRAY_TOOLTIP, TRAY_STATE_FILE, TRAY_ICON_SIZES };
