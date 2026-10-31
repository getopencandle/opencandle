import { expect, it } from 'vitest';
import { periodPercent, periodText } from '../../src/strategy-report/ReportChart';

// The hidden GUI check showed "Run-up: +0.06 (+0%)" on a 1,000,000 capital report. A non-zero percent that
// rounds away at two decimals now reads "<0.01"; zero and ordinary percents are unchanged. SYNTHETIC spans.
it('period percents keep two decimals and never round a real move to 0', () => {
  expect(periodPercent(4.85)).toBe('4.85');
  expect(periodPercent(0)).toBe('0');
  expect(periodPercent(0.000006)).toBe('<0.01');
  expect(periodPercent(0.005)).toBe('0.01');
  const span = { kind: 'growth' as const, amount: 0.06, percent: 0.000006, startTime: 1_707_436_800, endTime: 1_707_696_000, from: 0, to: 2, largest: false };
  expect(periodText(span, 'UTC')).toMatch(/^Run-up: \+0\.06 \(\+<0\.01%\), /);
  expect(periodText({ ...span, kind: 'decline', amount: 50, percent: 4.85, largest: true }, 'UTC')).toMatch(/^Drawdown \(largest\): -50 \(-4\.85%\), /);
});
