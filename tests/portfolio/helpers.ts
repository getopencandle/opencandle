import { addTransaction, createPortfolio, createPortfolioState, type PortfolioState } from '../../src/portfolio/portfolio';
import { DAY } from '../../src/portfolio/portfolio-performance';
import type { BarDataset } from '../../src/domain/types';

export const D0 = 1735689600; // 2025-01-01T00:00:00Z
export function dataset(symbol: string, closes: number[], opts: { currency?: string; assetClass?: string; start?: number } = {}): BarDataset {
  const start = opts.start ?? D0;
  return { instrument: { id: symbol, symbol, name: symbol, exchange: 'SYN', currency: opts.currency ?? 'USD', assetClass: (opts.assetClass ?? 'stock') as any, tickSize: 0.01, lotSize: 1, timezone: 'UTC' },
    bars: closes.map((close, i) => ({ time: start + i * DAY, open: close, high: close, low: close, close, volume: 1 })), resolution: '1D',
    provenance: { providerId: 'syn', providerName: 'Synthetic fixture', datasetId: symbol, fixture: true, coverage: 'x', asOf: 0, delaySeconds: null, adjustment: 'raw' } as any };
}
export function seeded(rows: any[], name = 'Main'): { state: PortfolioState; id: string } {
  let state = createPortfolioState(); const made = createPortfolio(state, name, 'USD', D0); if (!made.ok) throw Error(made.error); state = made.value;
  const id = state.activeId!;
  for (const row of rows) { const next = addTransaction(state, id, row); if (!next.ok) throw Error(next.error); state = next.value; }
  return { state, id };
}

