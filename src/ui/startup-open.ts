import { ALPACA_IEX_PROVIDER_ID, ALPACA_MAX_SYMBOLS, ALPACA_SYMBOL, alpacaAssetNotice, matchAlpacaAsset, type AlpacaAssetSearchValue } from '../domain/alpaca-live';
import { rememberAlpacaAssets } from '../domain/symbol-info';
import { COINBASE_PRODUCTS, COINBASE_PROVIDER_ID } from '../domain/coinbase-live';
import type { LiveBridgeResult } from '../domain/live-provider';
import type { BarDataset } from '../domain/types';
import { LV_LAYOUTS } from '../chart/layout-port';
import { resizeMultiChartState, type MultiChartState } from './MultiChartGrid';
import { ensureWorkspaceGrid, transitionGridDrawingScopes, workspaceDatasets, type ChartWorkspace } from './workspace-grid';
import { ALPACA_KEY_WAIT_MESSAGE, liveChartPlaceholder, liveSourceEnabled, type LiveAvailability, type LiveReopen } from './live-workspace';
import { liveDatasetById, registerLiveDataset } from './live-registry';
import { resetIncompatibleFrame } from './frame-reset-policy';

export const STARTUP_OPEN_FLAG = '--lv-open-symbol=';
/** `--lv-open-symbols=GME,SPY,GME.WS` opens one live chart per symbol in a multi-chart layout. */
export const STARTUP_OPEN_SYMBOLS_FLAG = '--lv-open-symbols=';
/** The largest layout holds 16 charts. */
export const STARTUP_MAX_CHARTS = 16;
/** Both live feeds (Alpaca and Coinbase) accept 1m natively (see planLiveInterval), so it is the safe startup interval. */
export const STARTUP_OPEN_INTERVAL = '1m';
export type StartupSymbol = { readonly source: 'alpaca' | 'coinbase'; readonly symbol: string };
export type StartupAction =
  | { readonly kind: 'open-live'; readonly source: 'alpaca' | 'coinbase'; readonly symbol: string }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'none' };

/** Find the first well-formed --lv-open-symbol=<SYMBOL> in argv. Case-insensitive input, upper-cased output. Unknown symbols give null. */
export function parseStartupOpenSymbol(argv: readonly string[]): StartupSymbol | null {
  for (const arg of argv) {
    if (typeof arg !== 'string' || !arg.startsWith(STARTUP_OPEN_FLAG)) continue;
    const symbol = arg.slice(STARTUP_OPEN_FLAG.length).trim().toUpperCase();
    if ((COINBASE_PRODUCTS as readonly string[]).includes(symbol)) return { source: 'coinbase', symbol };
    if (ALPACA_SYMBOL.test(symbol)) return { source: 'alpaca', symbol };
    return null;
  }
  return null;
}

export function noAlpacaKeyMessage(symbol: string): string {
  return `No Alpaca key saved. Add it in Settings > Data sources to open ${symbol} live.`;
}

export function decideStartupOpen(input: { readonly symbol: StartupSymbol | null; readonly alpacaKeyConfigured: boolean; readonly coinbaseEnabled: boolean }): StartupAction {
  const s = input.symbol;
  if (!s) return { kind: 'none' };
  if (s.source === 'coinbase') {
    return input.coinbaseEnabled
      ? { kind: 'open-live', source: 'coinbase', symbol: s.symbol }
      : { kind: 'message', text: `Coinbase live data is off. Turn it on in Settings > Data sources to open ${s.symbol} live.` };
  }
  return input.alpacaKeyConfigured
    ? { kind: 'open-live', source: 'alpaca', symbol: s.symbol }
    : { kind: 'message', text: noAlpacaKeyMessage(s.symbol) };
}

// ---- Alpaca assets: several symbols ------------------------------------------------------------------------------
/** An Alpaca symbol, or a spelling of one with dashes for dots (GME-WS) that the asset lookup can map to the real symbol. */
const LOOSE_ALPACA = /^[A-Z]{1,5}(?:[.-][A-Z]{1,3}){0,2}$/;
export interface StartupSymbolList { symbols: StartupSymbol[]; rejected: string[] }

function classify(text: string): StartupSymbol | null {
  if ((COINBASE_PRODUCTS as readonly string[]).includes(text)) return { source: 'coinbase', symbol: text };
  return LOOSE_ALPACA.test(text) ? { source: 'alpaca', symbol: text } : null;
}
/** `--lv-open-symbols=` (comma-separated) wins over `--lv-open-symbol=`; null when neither is given. Order is kept,
 * duplicates dropped, at most STARTUP_MAX_CHARTS opened; malformed or extra items are listed in `rejected`. */
export function parseStartupOpenSymbols(argv: readonly string[]): StartupSymbolList | null {
  const many = argv.find(arg => typeof arg === 'string' && arg.startsWith(STARTUP_OPEN_SYMBOLS_FLAG));
  const one = many === undefined ? argv.find(arg => typeof arg === 'string' && arg.startsWith(STARTUP_OPEN_FLAG)) : undefined;
  if (many === undefined && one === undefined) return null;
  const raw = many !== undefined ? many.slice(STARTUP_OPEN_SYMBOLS_FLAG.length).split(',') : [one!.slice(STARTUP_OPEN_FLAG.length)];
  const symbols: StartupSymbol[] = [], rejected: string[] = [], seen = new Set<string>();
  for (const item of raw) {
    const text = item.trim().toUpperCase();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const parsed = classify(text);
    if (!parsed || symbols.length >= STARTUP_MAX_CHARTS) rejected.push(text); else symbols.push(parsed);
  }
  return { symbols, rejected };
}

export type AssetLookup = (query: string) => Promise<LiveBridgeResult<AlpacaAssetSearchValue>>;
export interface ResolvedStartupSymbols { symbols: StartupSymbol[]; missing: string[]; notices: string[] }
/** Check each Alpaca symbol against the owner's Alpaca asset list: the real Alpaca symbol replaces the typed spelling,
 * symbols Alpaca does not list are `missing`, and listings that may have no IEX data get a plain notice. When the lookup
 * is unavailable or fails, a symbol already in chart format opens as typed (the chart reports missing data itself). */
export async function resolveStartupSymbols(symbols: readonly StartupSymbol[], lookup: AssetLookup | null): Promise<ResolvedStartupSymbols> {
  const out: StartupSymbol[] = [], missing: string[] = [], notices: string[] = [], seen = new Set<string>();
  const push = (row: StartupSymbol) => { const key = row.source + ':' + row.symbol; if (!seen.has(key)) { seen.add(key); out.push(row); } };
  for (const row of symbols) {
    if (row.source !== 'alpaca') { push(row); continue; }
    let result: LiveBridgeResult<AlpacaAssetSearchValue> | null = null;
    if (lookup) { try { result = await lookup(row.symbol.split(/[.-]/)[0]); } catch { result = null; } }
    if (!result || !result.ok) { if (ALPACA_SYMBOL.test(row.symbol)) push(row); else missing.push(row.symbol); continue; }
    const asset = matchAlpacaAsset(row.symbol, result.value.assets); if (asset) rememberAlpacaAssets([asset]); // For Symbol info
    if (!asset || !asset.chartable) { missing.push(row.symbol); continue; }
    const notice = alpacaAssetNotice(asset); if (notice) notices.push(notice);
    push({ source: 'alpaca', symbol: asset.symbol });
  }
  return { symbols: out, missing, notices };
}

const joinAnd = (items: readonly string[]) => items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
/** Which symbols open, and one plain message for anything that could not (key missing, Coinbase off, not found). */
export function decideStartupOpenMany(input: { symbols: readonly StartupSymbol[]; missing: readonly string[]; rejected: readonly string[]; notices: readonly string[]; alpacaKeyConfigured: boolean; coinbaseEnabled: boolean }): { open: StartupSymbol[]; message: string | null } {
  const open: StartupSymbol[] = [], parts: string[] = [];
  const noKey = input.symbols.filter(row => row.source === 'alpaca' && !input.alpacaKeyConfigured).map(row => row.symbol);
  const coinbaseOff = input.symbols.filter(row => row.source === 'coinbase' && !input.coinbaseEnabled).map(row => row.symbol);
  for (const row of input.symbols) if (!noKey.includes(row.symbol) && !coinbaseOff.includes(row.symbol)) open.push(row);
  if (noKey.length) parts.push(noAlpacaKeyMessage(noKey.join(', ')));
  if (coinbaseOff.length) parts.push(`Coinbase live data is off. Turn it on in Settings > Data sources to open ${coinbaseOff.join(', ')} live.`);
  const unknown = [...input.missing, ...input.rejected];
  if (unknown.length) parts.push(`Could not find ${unknown.join(', ')}. ${open.length ? 'Opened ' + joinAnd(open.map(row => row.symbol)) + '.' : 'Nothing was opened.'}`);
  parts.push(...input.notices);
  return { open, message: parts.length ? parts.join(' ') : null };
}

/** The smallest even layout that holds `count` charts. */
export function startupLayoutPreset(count: number): string {
  const order = ['single', 'two-columns', 'three-columns', 'four', 'six', 'eight', 'ten', 'twelve', 'sixteen'];
  for (const id of order) { const spec = LV_LAYOUTS.find(row => row.id === id); if (spec && spec.count >= count) return id; }
  return 'sixteen';
}

/** One live chart per symbol: the layout is resized to fit, chart i shows symbol i on a "connecting" stand-in under the
 * dataset id the feed will use, and the first chart is active. The app then commits `grid` and opens each `reopen` feed
 * for its cell (the same path as reopening saved live charts). `timezoneOnOpen` gives a chart's zone for the
 * live symbol it opens (the app's Default chart timezone for a chart still on the factory UTC zone), or null to keep it. */
export function buildStartupLiveGrid(workspace: ChartWorkspace, symbols: readonly StartupSymbol[], interval: string, availability: LiveAvailability, makeId?: () => string, timezoneOnOpen?: (current: string | undefined, dataset: BarDataset) => string | null): { grid: MultiChartState; reopen: LiveReopen[] } {
  if (!symbols.length || symbols.length > STARTUP_MAX_CHARTS) throw new Error('Open between 1 and 16 charts at startup.');
  const base = ensureWorkspaceGrid(workspace), resized = resizeMultiChartState(base.grid, startupLayoutPreset(symbols.length), makeId);
  const oldSources = workspaceDatasets({ ...base, grid: resized }), next = structuredClone(resized) as MultiChartState, reopen: LiveReopen[] = [];
  next.layout.cells.forEach((row, index) => {
    const wanted = symbols[index]; if (!wanted) return;
    const ref = { providerId: wanted.source === 'alpaca' ? ALPACA_IEX_PROVIDER_ID : COINBASE_PROVIDER_ID, symbol: wanted.symbol, interval };
    // While the Alpaca key check is unanswered (`alpacaPending`) an Alpaca chart still opens on its live
    // dataset id, as a stand-in that waits for the check; the app's reconnect pass opens the feed when it answers.
    const enabled = liveSourceEnabled(ref.providerId, availability), waiting = !enabled && !!availability.alpacaPending && ref.providerId === ALPACA_IEX_PROVIDER_ID;
    const holder = liveChartPlaceholder(ref, enabled, waiting ? ALPACA_KEY_WAIT_MESSAGE : undefined);
    if (!holder || !enabled && !waiting) return;
    if (!liveDatasetById(holder.provenance.datasetId) || waiting) registerLiveDataset(holder);
    row.symbol = ref.symbol; row.interval = ref.interval;
    const cell = next.cells[row.id], zone = timezoneOnOpen?.(cell.chartOptions?.timezone, holder) ?? null;
    next.cells[row.id] = { ...cell, datasetId: holder.provenance.datasetId, ...(zone ? { chartOptions: { ...cell.chartOptions, timezone: zone } } : {}) };
    if (enabled) reopen.push({ cellId: row.id, ...ref });
  });
  next.layout.activeCellId = next.layout.cells[0].id;
  const newSources = workspaceDatasets({ ...base, grid: next });
  for (const row of next.layout.cells) next.cells[row.id] = resetIncompatibleFrame(resized.cells[row.id], next.cells[row.id], oldSources, newSources);
  return { grid: transitionGridDrawingScopes(resized, next, oldSources, newSources), reopen };
}

/** Task 4: the saved Alpaca stream list (Data sources) always includes every open Alpaca chart symbol. Open symbols
 * are kept first when the 30-symbol plan limit is reached; saved ones are dropped from the end. */
export function mergeStreamSymbols(saved: readonly string[], open: readonly string[]): string[] {
  const opened = [...new Set(open.filter(symbol => ALPACA_SYMBOL.test(symbol)))].slice(0, ALPACA_MAX_SYMBOLS);
  const kept = [...new Set(saved.filter(symbol => ALPACA_SYMBOL.test(symbol) && !opened.includes(symbol)))];
  const room = Math.max(0, ALPACA_MAX_SYMBOLS - opened.length);
  const keptHead = kept.slice(0, room), savedOrder = saved.filter(symbol => keptHead.includes(symbol) || opened.includes(symbol));
  const result = [...new Set(savedOrder)];
  for (const symbol of opened) if (!result.includes(symbol)) result.push(symbol);
  return result;
}

/** A status that tells the user to visit Settings > Data sources carries an "Open settings" action in its toast. */
export function statusToastAction(message: string): { readonly label: string; readonly tab: 'datasources' } | null {
  return /Settings > Data sources/.test(message) ? { label: 'Open settings', tab: 'datasources' } : null;
}
