import type { Bar, BarDataset } from './types';
import type { PaperBarFeedInput, PaperFormingSnapshot } from './paper-bar-feed';
import { alpacaBarSession, ALPACA_IEX_PROVIDER_ID, ALPACA_SIP_PROVIDER_ID } from './alpaca-live';
import { isLiveProviderId } from './live-provider';

/**
 * Which series feeds the virtual account. Virtual fills follow the finest live data available, whatever
 * interval the chart shows: a live Alpaca chart on any interval other than 1m feeds the account from the provider's 1m
 * series of that symbol (`paperFineFeedSymbol` names it; the App opens it). Until that series has bars the feed waits
 * rather than falling back to the coarse chart bars. Replay, imports and other sources feed from the chart bars.
 * Alpaca bars carry their US session by New York time (H3).
 */
export const PAPER_FINE_RESOLUTION = '1m';
const DAILY_OR_LONGER = /^(?:\d*[DWM])$/;

export function paperFineFeedSymbol(dataset: BarDataset, replay: boolean): string | null {
  if (replay || dataset.provenance.providerId !== ALPACA_IEX_PROVIDER_ID || dataset.resolution === PAPER_FINE_RESOLUTION) return null;
  return dataset.instrument.symbol;
}

export function paperFeedInput(input: { dataset: BarDataset; bars: readonly Bar[]; replay: boolean; fine: BarDataset | null; forming: PaperFormingSnapshot | null }): PaperBarFeedInput | null {
  const { dataset, replay, forming } = input;
  const alpaca = dataset.provenance.providerId === ALPACA_IEX_PROVIDER_ID || dataset.provenance.providerId === ALPACA_SIP_PROVIDER_ID;
  if (paperFineFeedSymbol(dataset, replay)) {
    const fine = input.fine;
    if (!fine || fine.instrument.id !== dataset.instrument.id || fine.resolution !== PAPER_FINE_RESOLUTION || !fine.bars.length) return null;
    return { bars: fine.bars, instrument: dataset.instrument, provenance: fine.provenance, live: true, forming, resolution: PAPER_FINE_RESOLUTION, sessionOf: alpacaBarSession };
  }
  const intraday = !DAILY_OR_LONGER.test(dataset.resolution);
  return { bars: input.bars, instrument: dataset.instrument, provenance: dataset.provenance, live: !replay && isLiveProviderId(dataset.provenance.providerId), forming, resolution: dataset.resolution, ...(alpaca && intraday ? { sessionOf: alpacaBarSession } : {}) };
}
