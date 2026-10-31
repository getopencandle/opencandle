// (added check): exit, cancel and order-option proposals stay virtual, exact and bounded at every boundary.
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { validateReportRow } from '../../src/strategy-report/schema';
import { scriptOrdersToSignals } from '../../src/domain/strategy-script-orders';

const require = createRequire(import.meta.url);
const { ScriptJobs } = require('../../electron/script-jobs.cjs');
const bars = Array.from({ length: 4 }, (_, index) => ({ id: 'synthetic-sec-' + index, revision: 1, time: index + 1, open: 10, high: 11, low: 9, close: 10, volume: 1 }));
const event = { id: bars[0].id, revision: 1, time: bars[0].time };

describe(' virtual exit proposals', () => {
  it('the restricted worker emits only the documented virtual shapes; option objects are copied, never passed through', async () => {
    const jobs = new ScriptJobs();
    try {
      const source = `({ onBar(ctx) { if (ctx.index === 0) { const options = { id: 'A', type: 'stop', stop: 12 }; ctx.order('buy', 1, options); options.type = 'market'; ctx.exit('X', { fromEntry: 'A', loss: 5 }); ctx.cancel('X'); } } })`;
      const result = await jobs.run({ requestId: 'r33-sec-shapes', source, bars });
      expect(result.ok, result.error?.message).toBe(true);
      expect(result.value.orders.map((row: Record<string, unknown>) => Object.keys(row).sort())).toEqual([
        ['event', 'options', 'quantity', 'sequence', 'side', 'virtual'], ['event', 'exit', 'sequence', 'side', 'target', 'virtual'], ['event', 'sequence', 'side', 'target', 'virtual'],
      ]);
      expect(result.value.orders.every((row: Record<string, unknown>) => row.virtual === true)).toBe(true);
      expect(result.value.orders[0].options).toEqual({ id: 'A', type: 'stop', stop: 12 });
      const provisional = await jobs.run({ requestId: 'r33-sec-provisional', source, bars, snapshot: null, provisional: true });
      expect(provisional.ok).toBe(true); expect(provisional.value.orders).toEqual([]);
    } finally { jobs.close(); }
  });
  it('the report boundary and the adapter refuse non-virtual, extra-field and oversized-name proposals', () => {
    const bad = [
      { sequence: 1, side: 'exit', target: 'X', exit: { loss: 1 }, event, virtual: false },
      { sequence: 1, side: 'exit', target: 'X', exit: { loss: 1 }, event, virtual: true, extra: 1 },
      { sequence: 1, side: 'cancel', target: 'x'.repeat(65), event, virtual: true },
      { sequence: 1, side: 'buy', quantity: 1, event, virtual: true, options: { id: 'A', account: 'real' } },
      { sequence: 1, side: 'exit', target: 'X', exit: { loss: 1, account: 'real' }, event, virtual: true },
    ];
    for (const row of bad) {
      expect(() => validateReportRow('proposals', row), JSON.stringify(row)).toThrow();
      expect(() => scriptOrdersToSignals([row], bars, bars.map(bar => bar.id)), JSON.stringify(row)).toThrow();
    }
  });
});
