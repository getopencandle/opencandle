// The Symbol info card, opened from the series More menu ("Symbol info…") and, for a compared symbol, from the
// indicator legend's More menu. Its field list, labels and wording are our own choice: it shows the declared
// identifier, ticker, exchange, asset class, currency, timezone, tick size and lot size.
// Everything comes from data the app already holds: the chart dataset (instrument and provenance) and Alpaca listings the
// symbol search or the startup open already received. Nothing here makes a network call.
import { ALPACA_HYBRID_COVERAGE, ALPACA_SIP_LIVE_COVERAGE, ALPACA_SIP_PROVIDER_ID, ALPACA_STUB_PROVIDER_ID, alpacaAssetNotice, type AlpacaAsset } from './alpaca-live';
import { COINBASE_PROVIDER_ID } from './coinbase-live';
import { US_SESSION_MINUTES } from './us-market-hours';
import { demoDataMode } from './demo-mode';
import type { AdjustmentBasis, AssetClass, BarDataset } from './types';

export interface SymbolInfoRow { id: string; label: string; value: string }

const ASSET_LIMIT = 2000, assets = new Map<string, AlpacaAsset>();
/** Keeps the Alpaca listings the app already received (symbol search results, startup open), newest first, bounded. */
export function rememberAlpacaAssets(list: readonly AlpacaAsset[]): void {
  for (const asset of list) { if (!asset || typeof asset.symbol !== 'string' || !asset.symbol) continue; assets.delete(asset.symbol); assets.set(asset.symbol, { ...asset }); }
  while (assets.size > ASSET_LIMIT) assets.delete(assets.keys().next().value as string);
}
export function rememberedAlpacaAsset(symbol: string): AlpacaAsset | null { const row = assets.get(symbol.toUpperCase()); return row ? { ...row } : null; }
export function forgetAlpacaAssets(): void { assets.clear(); }

const TYPES: Record<AssetClass, string> = { stock: 'Stock', etf: 'Fund (ETF)', index: 'Index', option: 'Option', future: 'Futures', forex: 'Forex', crypto: 'Crypto', commodity: 'Commodity', bond: 'Bond', other: 'Other' };
const ADJUSTMENT: Record<AdjustmentBasis, string> = {
  raw: 'Not adjusted (prices as traded)', 'split-adjusted': 'Adjusted for splits', 'total-return': 'Adjusted for splits and dividends', unknown: 'Not stated by the source',
};
const NOT_SUPPLIED = 'Not stated by the source';
/** Outside the legacy demo a demo-identity chart says Example data (example mode) or that it has no data yet. */
const demoShown = (data: BarDataset) => !!data.provenance.fixture && demoDataMode() !== 'legacy';
const demoText = () => demoDataMode() === 'example' ? 'Example data' : 'No data yet';
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
function usEquity(data: BarDataset) { return (data.instrument.assetClass === 'stock' || data.instrument.assetClass === 'etf') && data.instrument.timezone === 'America/New_York'; }
function sessionText(data: BarDataset): string {
  if (data.instrument.assetClass === 'crypto') return '24 hours, every day';
  if (!usEquity(data)) return NOT_SUPPLIED;
  const m = US_SESSION_MINUTES;
  return `Regular ${clock(m.open)} to ${clock(m.close)}; pre-market from ${clock(m.preOpen)}, after-hours to ${clock(m.postClose)} (New York time), Monday to Friday except NYSE holidays`;
}
function feedText(data: BarDataset): string {
  const p = data.provenance;
  if (p.fixture) return demoDataMode() === 'legacy' ? 'SYNTHETIC demonstration data (not market prices)' : demoDataMode() === 'example' ? 'Example data (not market prices)' : 'No data yet. Set up live data in Data sources.';
  if (p.providerId === ALPACA_STUB_PROVIDER_ID) return 'SYNTHETIC Alpaca stub (invented prices)';
  if (p.providerId === ALPACA_SIP_PROVIDER_ID) return 'All exchanges (SIP), history only, at least 15 minutes delayed';
  if (p.providerId === 'alpaca-iex') return p.coverage === ALPACA_HYBRID_COVERAGE ? 'History from all exchanges (15 minutes delayed), live from IEX' : p.coverage === ALPACA_SIP_LIVE_COVERAGE ? 'All exchanges (SIP), real time' : 'IEX exchange only, real time (a small share of US volume)';
  if (p.providerId === COINBASE_PROVIDER_ID) return 'Coinbase public market data, real time';
  const delay = p.delaySeconds === null ? '' : p.delaySeconds > 0 ? `, delayed ${Math.round(p.delaySeconds / 60)} minutes` : '';
  return (p.coverage || 'Local data') + delay;
}
function numberText(value: number): string { return Number.isFinite(value) && value > 0 ? String(Number(value.toPrecision(12))) : NOT_SUPPLIED; }

/**
 * The card rows, in order: symbol, description, exchange, type, currency, session hours, timezone, tick size, point value,
 * lot size, data source, feed, adjustment, and (when an Alpaca listing is known) its listing status.
 * Point value: 1 for stocks, funds and crypto (one price unit per share or coin; no contract multiplier).
 */
export function symbolInfoRows(data: BarDataset, asset: AlpacaAsset | null = rememberedAlpacaAsset(data.instrument.symbol)): SymbolInfoRow[] {
  const instrument = data.instrument, listing = asset && asset.symbol === instrument.symbol ? asset : null;
  const point = instrument.assetClass === 'stock' || instrument.assetClass === 'etf' || instrument.assetClass === 'crypto' ? '1' : NOT_SUPPLIED;
  const rows: SymbolInfoRow[] = [
    { id: 'symbol', label: 'Symbol', value: instrument.symbol },
    { id: 'description', label: 'Description', value: listing?.name || instrument.name || NOT_SUPPLIED },
    { id: 'exchange', label: 'Exchange', value: listing?.exchange || (demoShown(data) && instrument.exchange === 'SYNTHETIC' ? demoText() : instrument.exchange) || NOT_SUPPLIED },
    { id: 'type', label: 'Type', value: TYPES[instrument.assetClass] ?? NOT_SUPPLIED },
    { id: 'currency', label: 'Currency', value: instrument.currency || NOT_SUPPLIED },
    { id: 'session', label: 'Session', value: sessionText(data) },
    { id: 'timezone', label: 'Timezone', value: instrument.timezone || NOT_SUPPLIED },
    { id: 'tick', label: 'Tick size', value: numberText(instrument.tickSize) },
    { id: 'point', label: 'Point value', value: point },
    { id: 'lot', label: 'Lot size', value: numberText(instrument.lotSize) },
    { id: 'source', label: 'Data source', value: (demoShown(data) ? demoText() : data.provenance.providerName) || NOT_SUPPLIED },
    { id: 'feed', label: 'Feed', value: feedText(data) },
    { id: 'adjustment', label: 'Adjustment', value: ADJUSTMENT[data.provenance.adjustment] ?? ADJUSTMENT.unknown },
  ];
  if (listing) rows.push({ id: 'listing', label: 'Listing', value: alpacaAssetNotice(listing) ?? `Active on Alpaca${listing.tradable ? ', tradable' : ''}` });
  return rows;
}
