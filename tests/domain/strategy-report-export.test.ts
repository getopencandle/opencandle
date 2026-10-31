import { expect, it } from 'vitest';
import { buildStrategyReport } from '../../src/domain/strategy-report';
import { strategyCsvCell, strategyReportCsv, strategyReportJson } from '../../src/domain/strategy-report-export';
import { reportArithmeticFixture } from './strategy-report-fixtures';
function report() { const { bars, barIds, result } = reportArithmeticFixture(); return buildStrategyReport({ bars, barIds, result, context: { executionId: '=UNTRUSTED()', sourceLabel: 'Synthetic "quotes", comma\nand newline', currency: null, timezone: 'UTC' } }); }
it('exports complete columns, source identity, open-lot status and all metric-direction statuses', () => {
  const source = report(), csv = strategyReportCsv(source, 'trades', 'short');
  expect(csv).toContain('favorable_percent_of_entry'); expect(csv).toContain('inclusive_bars_held'); expect(csv).toContain('"\'=UNTRUSTED()"'); expect(csv).toContain('"short-b"'); expect(csv).not.toContain('"long-a"');
  const all = strategyReportCsv(source, 'trades'); expect(all).toContain('"open"'); expect(all).toContain('"open-d"');
  const metrics = strategyReportCsv(source, 'metrics'); expect(metrics).toContain('all_status'); expect(metrics).toContain('long_status'); expect(metrics).toContain('short_status'); expect(metrics).toContain('"unavailable"');
  const json = JSON.parse(strategyReportJson(source)); expect(json.context.currency).toBeNull(); expect(json.metrics.all.closedNet.value).toBe(-4); expect(json.metrics.all.marginCalls.value).toBe(0); expect(json.metrics.all.marginEfficiency.value).toBeNull(); // Margin calls are simulated (none here); margin efficiency stays unavailable expect(json.trades).toHaveLength(3);
});
it('separates numeric signs from formula-bearing untrusted text and quotes multiline cells', () => {
  expect(strategyCsvCell(-8)).toBe('-8'); expect(strategyCsvCell('-8')).toBe('"\'-8"'); expect(strategyCsvCell(' \t=cmd')).toBe('"\' \t=cmd"'); expect(strategyCsvCell('x,"y"\nz')).toBe('"x,""y""\nz"'); expect(strategyCsvCell(null)).toBe('');
});
it('rejects fabricated or copied completed-report authority', () => {
  const source = report(); expect(() => strategyReportJson({ ...source })).toThrow(/completed report/); expect(() => strategyReportCsv(source, 'trades', 'other' as never)).toThrow(/direction/);
});
