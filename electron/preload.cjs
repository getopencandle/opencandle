'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, value) => ipcRenderer.invoke(channel, value);
// The main process holds a window close until the renderer's pending workspace save settles.
let flushHandler = null;
ipcRenderer.on('lv:workspace:flush-request', async (_event, token) => {
  // A layout window with unsaved layout edits (Autosave off) answers {keepOpen:true} and asks to save first.
  let keepOpen = false;
  try { if (flushHandler) { const answer = await flushHandler(); keepOpen = !!answer && typeof answer === 'object' && answer.keepOpen === true; } }
  catch { /* The renderer reports its own save failure; the bounded close proceeds. */ }
  finally { invoke('lv:workspace:flushed', keepOpen ? { token, keepOpen: true } : token).catch(() => {}); }
});
// The main window saves the layout of a layout window (relayed by main) through its own save path, the single
// writer of the workspace file. The handler returns {revision}; a failure is answered as {ok:false,message}.
let layoutSaveHandler = null;
ipcRenderer.on('lv:window:layout-save-request', async (_event, request) => {
  const requestId = request && typeof request.requestId === 'string' ? request.requestId : '';
  let answer;
  try {
    if (!layoutSaveHandler) throw new Error('This window does not save layouts from other windows.');
    const saved = await layoutSaveHandler({ layoutId: request.layoutId, grid: request.grid, ...(request.shared ? { shared: request.shared } : {}) });
    answer = { requestId, ok: true, revision: saved && Number.isSafeInteger(saved.revision) ? saved.revision : 0 };
  } catch (error) { answer = { requestId, ok: false, message: String(error && error.message ? error.message : error).slice(0, 500) }; }
  invoke('lv:window:layout-saved', answer).catch(() => {});
});
// The main window places (or opens its order ticket for) a paper action asked for in a layout window. The
// handler returns {ok, message, focus?}; a failure is answered as {ok:false, message}.
let paperHandler = null;
ipcRenderer.on('lv:window:paper-request', async (_event, request) => {
  const requestId = request && typeof request.requestId === 'string' ? request.requestId : '';
  let answer;
  try {
    if (!paperHandler) throw new Error('This window does not take paper actions from other windows.');
    const done = await paperHandler({ side: request.side, instrument: request.instrument, quote: request.quote, quoteSource: request.quoteSource, now: request.now });
    answer = { requestId, ok: !!(done && done.ok), message: String(done && done.message ? done.message : '').slice(0, 500), ...(done && done.focus === true ? { focus: true } : {}) };
  } catch (error) { answer = { requestId, ok: false, message: String(error && error.message ? error.message : error).slice(0, 500) }; }
  invoke('lv:window:paper-done', answer).catch(() => {});
});
function liveListener(channel, handler) {
  if (typeof handler !== 'function') throw new TypeError('A live event handler function is required.');
  const listener = (_event, value) => { try { handler(value); } catch { /* renderer handler failures stay in the renderer */ } };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('lv', Object.freeze({
  loadWorkspace: () => invoke('lv:workspace:load'),
  saveWorkspace: value => invoke('lv:workspace:save', value),
  resetWorkspace: expectedRevision => invoke('lv:workspace:reset', expectedRevision),
  importBars: () => invoke('lv:bars:import'),
  importData: value => invoke('lv:data:import', value),
  exportWorkspace: value => invoke('lv:workspace:export', value),
  exportChart: value => invoke('lv:chart:export', value),
  copyChartImage: value => invoke('lv:chart:copy', value),
  // Fixed call, no renderer input; main toggles the sender's own window and answers {fullScreen}.
  toggleFullScreen: () => invoke('lv:window:fullscreen'),
  // Exe harness only; main answers null outside the gated harness run (electron/image-harness.cjs).
  harnessImage: () => invoke('lv:harness:image'),
  exportData: value => invoke('lv:data:export', value),
  exportBinary: value => invoke('lv:data:export-binary', value),
  executeScript: value => invoke('lv:script:execute', value),
  fetchSecCompanyFacts: value => invoke('lv:sec:companyfacts', value),
  fetchSecSubmissions: value => invoke('lv:sec:submissions', value),
  cancelSecRequest: value => invoke('lv:sec:cancel', value),
  // Fixed live market-data capabilities. No URL, host or header crosses this bridge.
  fetchCoinbaseCandles: value => invoke('lv:coinbase:candles', value),
  subscribeCoinbase: value => invoke('lv:coinbase:subscribe', value),
  unsubscribeCoinbase: () => invoke('lv:coinbase:unsubscribe'),
  coinbaseStatus: () => invoke('lv:coinbase:status'),
  cancelCoinbaseRequest: value => invoke('lv:coinbase:cancel', value),
  onCoinbaseEvent: handler => liveListener('lv:coinbase:event', handler),
  startupOpenSymbol: () => invoke('lv:startup:open-symbol'),
  startupOpenSymbols: () => invoke('lv:startup:open-symbols'),
  // Opens the fixed "where I got stuck" issue form in the browser (the address lives in main).
  reportStuck: () => invoke('lv:help:report-stuck'),
  // Opens a source link of a tool's About panel; main accepts only http/https addresses on the reference hosts.
  openReferenceLink: value => invoke('lv:help:open-reference', value),
  alpacaKeyStatus:() => invoke('lv:alpaca:key-status'),
  saveAlpacaKey: value => invoke('lv:alpaca:key-save', value),
  clearAlpacaKey: () => invoke('lv:alpaca:key-clear'),
  testAlpacaConnection: () => invoke('lv:alpaca:test'),
  fetchAlpacaBars: value => invoke('lv:alpaca:bars', value),
  subscribeAlpaca: value => invoke('lv:alpaca:subscribe', value),
  unsubscribeAlpaca: () => invoke('lv:alpaca:unsubscribe'),
  alpacaStatus: () => invoke('lv:alpaca:status'),
  cancelAlpacaRequest: value => invoke('lv:alpaca:cancel', value),
  searchAlpacaAssets: value => invoke('lv:alpaca:search-assets', value),
  // Split and dividend history for one symbol (exactly {requestId, symbol}).
  fetchAlpacaCorporateActions: value => invoke('lv:alpaca:corporate-actions', value),
  onAlpacaEvent: handler => liveListener('lv:alpaca:event', handler),
  // Data sources > Your saved info. Fixed calls; main picks every path and no key crosses them.
  dataSourcesInfo: () => invoke('lv:datasources:info'),
  openDataFolder: () => invoke('lv:datasources:open-folder'),
  exportDataSourceSettings: value => invoke('lv:datasources:export', value),
  importDataSourceSettings: () => invoke('lv:datasources:import'),
  // The main-process bar cache. Data only: a key and bars, never a path.
  fetchFredSeries: value => invoke('lv:fred:series', value),
  fredDataStatus: () => invoke('lv:fred:status'),
  clearFredData: () => invoke('lv:fred:clear'),
  readBarCache: value => invoke('lv:barcache:read', value),
  writeBarCache: value => invoke('lv:barcache:write', value),
  discardBarCache: value => invoke('lv:barcache:discard', value),
  barCacheStatus: () => invoke('lv:barcache:status'),
  clearBarCache: () => invoke('lv:barcache:clear'),
  showAlertNotification: value => invoke('lv:alert:notify', value),
  postAlertWebhook: value => invoke('lv:alert:webhook', value),
  cancel: value => invoke('lv:cancel', value),
  close: () => invoke('lv:close'),
  // The notification-area setting (exactly {keepRunning:boolean}) and Quit OpenCandle (a full quit).
  setTrayKeepRunning: value => invoke('lv:tray:set', value),
  quitApp: () => invoke('lv:app:quit'),
  // Wick mode. The main window enters it (no input), sends its two Settings rows (exactly {alwaysOnTop,
  // collapseOnBlur}) and its tab strip (exactly {tabs, theme}), and hears the mode change and the tab the strip asked for.
  // The strip window reads the tab strip, asks for a tab (exactly {id}), the full window or its menu. Main checks each sender.
  enterWickMode: () => invoke('lv:wick:enter'),
  exitWickMode: () => invoke('lv:wick:exit'),
  configureWickMode: value => invoke('lv:wick:configure', value),
  publishWickStrip: value => invoke('lv:wick:publish', value),
  onWickState: handler => liveListener('lv:wick:state', handler),
  onWickTabRequest: handler => liveListener('lv:wick:tab-request', handler),
  wickStripReady: () => invoke('lv:wick:ready'),
  onWickSnapshot: handler => liveListener('lv:wick:snapshot', handler),
  wickRestore: () => invoke('lv:wick:restore'),
  wickSelectTab: value => invoke('lv:wick:select-tab', value),
  wickMenu: () => invoke('lv:wick:menu'),
  // Open layout in new window (exactly {layoutId}), a layout window's save relay (exactly {layoutId, grid}), the
  // layouts open in other windows (the current list first, then each change), and the main window's relay handler.
  openLayoutWindow: value => invoke('lv:window:open-layout', value),
  saveLayoutFromWindow: value => invoke('lv:window:layout-save', value),
  onLayoutWindows: handler => {
    if (typeof handler !== 'function') throw new TypeError('A layout window handler function is required.');
    const off = liveListener('lv:window:layouts', handler);
    invoke('lv:window:list').then(result => { if (result && result.ok) { try { handler(result.value); } catch { /* renderer handler failures stay in the renderer */ } } }).catch(() => {});
    return off;
  },
  // A layout window's Shift+B / Shift+S (exactly {side, instrument, quote, quoteSource, now}), the main window's
  // handler for them, and the main window's reload of the layout windows after a reset or restore.
  sendPaperToMain: value => invoke('lv:window:paper-action', value),
  onPaperRequest: handler => {
    if (typeof handler !== 'function') throw new TypeError('A paper request handler function is required.');
    paperHandler = handler;
    return () => { if (paperHandler === handler) paperHandler = null; };
  },
  refreshLayoutWindows: () => invoke('lv:window:refresh'),
  onLayoutSaveRequest: handler => {
    if (typeof handler !== 'function') throw new TypeError('A layout save handler function is required.');
    layoutSaveHandler = handler;
    return () => { if (layoutSaveHandler === handler) layoutSaveHandler = null; };
  },
  onFlushRequest: handler => {
    if (typeof handler !== 'function') throw new TypeError('A flush handler function is required.');
    flushHandler = handler;
    return () => { if (flushHandler === handler) flushHandler = null; };
  }
}));
