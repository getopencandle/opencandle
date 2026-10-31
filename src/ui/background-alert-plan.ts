import {hasNyseAlertCalculation} from '../domain/nyse-mtf-alert-source';
import type { LocalAlert } from '../domain/alerts';
import { ALPACA_IEX_PROVIDER_ID, ALPACA_MAX_SYMBOLS, ALPACA_STUB_PROVIDER_ID } from '../domain/alpaca-live';
import { parseSymbolMath, symbolMathComponentSource } from '../domain/symbol-math';
import { SYMBOL_MATH_PROVIDER_ID } from '../domain/symbol-math-live';
import { alertSecondSymbolAlpaca } from '../domain/second-symbol-alerts';

/** Alerts evaluate on every symbol that has one. The charted symbol is evaluated by the chart itself; every other
 * symbol with a watchable alert needs one live feed, shared by all of its alerts, kept inside the Alpaca symbol limit. */
export interface BackgroundFeed { datasetId: string; providerId: string; symbol: string; resolution: string; instrumentId: string; alertIds: string[];family?:'nyse-daily' }
export interface BackgroundSkip { alertId: string; reason: string }
export interface BackgroundPlan { feeds: BackgroundFeed[]; skipped: BackgroundSkip[] }
export interface BackgroundPlanInput { alerts: readonly LocalAlert[]; activeInstrumentId: string; activeDatasetId?:string;activeResolution?:string;openAlpacaSymbols: ReadonlySet<string>; maxAlpacaSymbols?: number }

const LIVE_ID = /^live:([a-z0-9-]+):([^:]+):([^:]+)$/;
export function parseLiveDatasetId(datasetId: string): { providerId: string; symbol: string; resolution: string } | null {
  const match = LIVE_ID.exec(datasetId);
  return match ? { providerId: match[1], symbol: match[2], resolution: match[3] } : null;
}
/** The dataset id an ordinary technical alert is bound to (its binding's dataset key), or null. */
export function alertDatasetId(alert: LocalAlert): string | null { return datasetIdOf(alert); }
function datasetIdOf(alert: LocalAlert): string | null {
  const binding = alert.definition.observationBinding;
  if (!binding || binding.schemaVersion !== 2) return null;
  try { const key: unknown = JSON.parse(binding.datasetKey); const value = Array.isArray(key) ? key[9] : null; return typeof value === 'string' ? value : null; } catch { return null; }
}
/** True for an alert bound to a synthetic Alpaca stub feed (live:alpaca-stub:*); its triggers are shown as SYNTHETIC. */
export function alertUsesSyntheticStub(alert: LocalAlert): boolean { const id = datasetIdOf(alert); return id !== null && parseLiveDatasetId(id)?.providerId === ALPACA_STUB_PROVIDER_ID; }
/** Every technical source is watched in the background. A drawing boundary keeps its frozen geometry; the older
 * 'drawing' kind is checked against the drawing saved in the workspace; a VWAP kernel 2 source runs the exact kernel on the
 * feed's own rows (vwap-background-kernel.ts). The watcher evaluates each VWAP kernel 2 alert on its own, so one that fails
 * never stops the other alerts of its feed. */

export function planBackgroundAlertFeeds(input: BackgroundPlanInput): BackgroundPlan {
  const max = input.maxAlpacaSymbols ?? ALPACA_MAX_SYMBOLS;
  const taken = new Set(input.openAlpacaSymbols), feeds = new Map<string, BackgroundFeed>(), skipped: BackgroundSkip[] = [];
  for (const alert of input.alerts) {
    const definition = alert.definition;
    if (!['active', 'waiting-for-data'].includes(alert.status) || definition.mode !== 'ordinary') continue;
    const qualified=hasNyseAlertCalculation(definition.observationBinding?.source);if(definition.instrumentId===input.activeInstrumentId&&!qualified)continue;
    const skip = (reason: string) => skipped.push({ alertId: definition.id, reason });
    const datasetId = datasetIdOf(alert);
    if (datasetId === null) { skip('It was saved in an older format and is only checked while its chart is open.'); continue; }
    if(qualified&&definition.instrumentId===input.activeInstrumentId){if(!input.activeDatasetId||!input.activeResolution){skip('The active data source is not identified, so this daily alert waits.');continue;}if(datasetId===input.activeDatasetId&&parseLiveDatasetId(datasetId)?.resolution===input.activeResolution)continue;}
    const live = parseLiveDatasetId(datasetId);
    if (!live) { skip('Its data is not a live feed, so it is only checked while that chart is open.'); continue; }
    // The second symbol of a two-symbol alert streams too (through the second-symbol loader), so each of
    // its Alpaca symbols not already streaming counts toward the limit, together with the feed's own symbols below.
    const second = alertSecondSymbolAlpaca(definition.observationBinding!.source).filter(symbol => !taken.has(symbol));
    let feed = feeds.get(datasetId);
    if (second.length) {
      const own = feed ? [] : live.providerId === ALPACA_IEX_PROVIDER_ID ? [live.symbol] : live.providerId === SYMBOL_MATH_PROVIDER_ID ? (() => { const parsed = parseSymbolMath(live.symbol); return parsed.ok ? parsed.expression.symbols.filter(symbol => symbolMathComponentSource(symbol) === 'alpaca-or-import') : []; })() : [];
      const added = new Set([...own, ...second].filter(symbol => !taken.has(symbol)));
      if (taken.size + added.size > max) { skip(`Live stock data streams at most ${max} symbols at once (the Alpaca limit), and this alert's second symbol needs ${second.length} more, so it is not watched in the background.`); continue; }
    }
    if (!feed) {
      if (live.providerId === ALPACA_IEX_PROVIDER_ID && !taken.has(live.symbol)) {
        if (taken.size >= max) { skip(`Live stock data streams at most ${max} symbols at once (the Alpaca limit), so this symbol is not watched in the background.`); continue; }
        taken.add(live.symbol);
      }
      // A derived (symbol math) feed opens each component; every Alpaca-shaped component counts toward the limit.
      if (live.providerId === SYMBOL_MATH_PROVIDER_ID) {
        const parsed = parseSymbolMath(live.symbol);
        if (!parsed.ok) { skip('Its derived expression cannot be read, so it is only checked while that chart is open.'); continue; }
        const added = parsed.expression.symbols.filter(symbol => symbolMathComponentSource(symbol) === 'alpaca-or-import' && !taken.has(symbol));
        if (taken.size + added.length > max) { skip(`Live stock data streams at most ${max} symbols at once (the Alpaca limit), and this derived symbol needs ${added.length} more, so it is not watched in the background.`); continue; }
        for (const symbol of added) taken.add(symbol);
      }
      feed = { datasetId, providerId: live.providerId, symbol: live.symbol, resolution: live.resolution, instrumentId: definition.instrumentId, alertIds: [] };
      feeds.set(datasetId, feed);
    }
    for (const symbol of second) taken.add(symbol);
    if(qualified)feed.family='nyse-daily';
    feed.alertIds.push(definition.id);
  }
  return { feeds: [...feeds.values()], skipped };
}
