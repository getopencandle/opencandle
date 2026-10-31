// L5 strategy-tester perf: the engine and report loops carry exact memos, hoisted Decimal parses and a double-estimate
// short-circuit. This pins their output to SHA-256 fingerprints taken from the code BEFORE those changes, on a fixed
// SYNTHETIC dataset (deterministic LCG, no real market data), across always-in-market, limit/stop, short, margin-call and
// flat-period paths. A fingerprint mismatch means the optimised code no longer reproduces the original numbers bit for bit.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { backtestStrategy, type StrategyConfig, type StrategyOrderIntent, type StrategySignal } from '../../src/domain/strategy';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import type { Bar } from '../../src/domain/types';

const round2 = (x: number) => Math.round(x * 100) / 100;
function syntheticBars(count: number, seed: number, drift = 0): Bar[] {
  let state = seed; const next = () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const bars: Bar[] = []; let price = 100;
  for (let i = 0; i < count; i++) {
    const open = round2(price), close = round2(open + (next() - 0.5) + drift), high = round2(Math.max(open, close) + next() * 0.3), low = round2(Math.min(open, close) - next() * 0.3);
    bars.push({ time: 1_700_000_000 + i * 900, open, high, low, close, volume: 100 + Math.floor(next() * 50) }); price = close + (100 - close) * 0.002;
  }
  return bars;
}
function signalsEvery(count: number, step: number, make: (n: number) => StrategyOrderIntent[]): StrategySignal[] {
  const signals: StrategySignal[] = []; for (let i = 0, n = 0; i < count - 1; i += step, n++) signals.push({ barIndex: i, orders: make(n) }); return signals;
}
function fingerprint(bars: Bar[], signals: StrategySignal[], config: Partial<StrategyConfig>): { digest: string; trades: number; ok: boolean } {
  const barIds = bars.map((_, index) => 'synthetic:' + index);
  const result = backtestStrategy({ bars, signals, config, barIds });
  const hash = createHash('sha256'); hash.update(JSON.stringify(result));
  if (result.ok) {
    const report = buildStrategyReport({ result, bars, barIds, context: { executionId: 'l5-equality', sourceLabel: 'Synthetic L5', currency: 'USD', timezone: 'UTC' } });
    hash.update(JSON.stringify({ metrics: report.metrics, benchmark: report.benchmark, drawdown: report.drawdown, equity: report.equity, trades: report.trades, openLots: report.openLots, analysis: report.analysis, diagnostics: report.diagnostics }));
  }
  return { digest: hash.digest('hex'), trades: result.trades.length, ok: result.ok };
}
const N = 4000;
const SCENARIOS: Record<string, () => ReturnType<typeof fingerprint>> = {
  // Always in the market: long, then short, every 25 bars.
  alwaysIn: () => { const bars = syntheticBars(N, 11); return fingerprint(bars, signalsEvery(N, 25, n => [{ action: n % 2 ? 'sell' : 'buy', quantity: 3 }]), { pyramiding: 1 }); },
  // Entries with take-profit and stop-loss brackets and limit orders, leaving flat stretches between trades.
  brackets: () => { const bars = syntheticBars(N, 23); return fingerprint(bars, signalsEvery(N, 40, n => [{ action: 'buy', quantity: 2, type: 'limit', limitPrice: round2(bars[Math.min(N - 1, n * 40)].close - 0.2) }, { action: 'exit', name: 'bracket', profitTicks: 60, lossTicks: 45 }]), { pyramiding: 1, commission: { kind: 'percent', value: 0.05 } }); },
  // Short side with slippage and a fixed commission, plus a stop entry.
  shorts: () => { const bars = syntheticBars(N, 37, -0.01); return fingerprint(bars, signalsEvery(N, 30, n => [n % 3 ? { action: 'sell', quantity: 5 } : { action: 'buy', quantity: 2, type: 'stop', stopPrice: round2(bars[Math.min(N - 1, n * 30)].close + 0.4) }]), { slippageTicks: 2, commission: { kind: 'fixed', value: 1.5 }, pyramiding: 2 }); },
  // Thin account, large size: the margin check has to liquidate.
  marginCalls: () => { const bars = syntheticBars(N, 41, -0.02); return fingerprint(bars, signalsEvery(N, 60, () => [{ action: 'buy', quantity: 40 }]), { initialCapital: 5000, marginLongPercent: 25, marginShortPercent: 25, pyramiding: 4 }); },
  // Order processing on the close with a heavy unrelated limit book.
  closeProcessing: () => { const bars = syntheticBars(N, 53); return fingerprint(bars, signalsEvery(N, 15, n => [{ action: n % 2 ? 'sell' : 'buy', quantity: 1, type: 'limit', limitPrice: round2(bars[Math.min(N - 1, n * 15)].close + (n % 2 ? 0.1 : -0.1)) }]), { processOrdersOnClose: true, pyramiding: 3, limitVerifyTicks: 1 }); },
};
// Re-pinned after the rebrand, which changed report prose only (old "LV" / "(LV-DEFINED)" became "OpenCandle" /
// "(OpenCandle-defined)" in strategy.ts and strategy-report.ts text). Rationale, verified: hashing the CURRENT output after
// mapping "OpenCandle-defined" -> "LV-DEFINED" and "OpenCandle" -> "LV" reproduced all five ORIGINAL fingerprints exactly,
// so every number, trade, equity point and order is bit-identical to the pre-optimisation code; only wording differs.
// Re-pinned again after two more prose edits ("next supplied bar open" -> "next bar open", "for supplied bar closes" ->
// "for bar closes"). Hashing the current output with those two phrases mapped back reproduced the previous five pins
// exactly, so the numbers are still bit-identical.
// Fingerprints from the pre-optimisation code (numbers), re-pinned over the rebranded text. Regenerating them is a deliberate, reviewed act, never a convenience.
const GOLDEN: Record<string, string> = {
  alwaysIn: '6766de1587cf9a3ffea2562aaeed0cc53c29df0ee2964026495bcfff2bed43dc', brackets: '6b317da9a55b74cfd8ab8e085f960150ad5797e8cc07ecf3232f5e7a2e3089c3', shorts: '93587b007db729226779780ba7d85ac84bb0a4d562773334c1985681f5c6ce3f', marginCalls: 'c489ee6fb7f5ffc7ad069e79c4857fd68aa462844a8a29fd6a548e4b744e7177', closeProcessing: 'd69f55dc75172b8590ef0a1d1f2f3b5f44dc1d8a0998147a5dacfacdcff30bd9',
};
describe('L5 optimised strategy engine and report reproduce the original output bit for bit', () => {
  for (const name of Object.keys(SCENARIOS)) {
    it(name, () => {
      const outcome = SCENARIOS[name]();
      expect(outcome.ok).toBe(true);
      expect(outcome.trades).toBeGreaterThan(5);
      expect(outcome.digest).toBe(GOLDEN[name]);
    });
  }
});
