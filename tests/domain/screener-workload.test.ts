import { expect, it } from 'vitest';
import { fixtureDataset } from '../../src/domain/fixtures';
import { runScreener, SCREENER_CALCULATION_LIMITS } from '../../src/domain/screener';
import type { BarDataset } from '../../src/domain/types';

it('measures the revised270000-bar SMA workload near the unchanged twenty-million-operation boundary', () => {
  const template = fixtureDataset('WORKLOAD', 0), bars = Array.from({ length: 27 }, (_, index) => ({ time: 1704153600 + index * 86400, open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 100 }));
  // Shared immutable input vectors avoid making object-allocation speed part of the calculation measurement.
  const datasets: BarDataset[] = Array.from({ length: 10000 }, (_, index) => ({ ...template, instrument: { ...template.instrument, id: `LOCAL:WORKLOAD-${index}`, symbol: `WORKLOAD-${index}` }, provenance: { ...template.provenance, datasetId: `workload-${index}` }, bars }));
  const columns = [{ id: 'symbol', metric: 'symbol' }, { id: 'last', metric: 'last' }, { id: 'sma2', metric: 'sma', parameters: { length: 2 } }];
  const start = performance.now(), result = runScreener(datasets, columns), elapsedMs = performance.now() - start;
  expect(result.diagnostics).toEqual([]); expect(result.coverage.evaluated).toBe(10000); expect(result.rows).toHaveLength(10000);
  expect(result.rows[9999].cells.last.value).toBe(126); expect(result.rows[9999].cells.sma2.value).toBe(125.5);
  console.info(JSON.stringify({ workload: 'screener-revised-sma-boundary', datasets: datasets.length, suppliedBars: 270000, estimatedOperations: 19980000, operationLimit: SCREENER_CALCULATION_LIMITS.operations, resultCells: 30000, elapsedMs, targetMs: 2000, targetMet: elapsedMs <= 2000, environment: `Node ${process.versions.node}; model only, rendering excluded`,migration:'Old2000000-bar SMA workload is now refused by the approved64-per-SMA-leg work charge; this is a distinct workload, not a repaired latency result.' }));
  const overBudget = runScreener(datasets, columns, [{ id: 'extra-work', columnId: 'last', operator: 'in', value: [0,1,2], active: true }]);
  expect(overBudget.diagnostics.some(row => row.code === 'WORKLOAD_LIMIT')).toBe(true); expect(overBudget.coverage.evaluated).toBe(0); expect(overBudget.rows).toEqual([]);
}, 15000);

it('measures the accepted half-million-cell boundary separately from history work', () => {
  const template = fixtureDataset('CELL-WORKLOAD', 0), datasets: BarDataset[] = Array.from({ length: 10000 }, (_, index) => ({ ...template, instrument: { ...template.instrument, id: `LOCAL:CELL-${index}`, symbol: `CELL-${index}` } }));
  const columns = Array.from({ length: 50 }, (_, index) => ({ id: `name-${index}`, metric: 'symbol' }));
  const start = performance.now(), result = runScreener(datasets, columns), elapsedMs = performance.now() - start;
  expect(result.diagnostics).toEqual([]); expect(result.rows).toHaveLength(10000); expect(Object.keys(result.rows[0].cells)).toHaveLength(50);
  expect(result.rows[9999].cells['name-49'].value).toBe(result.rows[9999].symbol);
  console.info(JSON.stringify({ workload: 'screener-cell-boundary', datasets: datasets.length, suppliedBars: 0, resultCells: 500000, elapsedMs, targetMs: 2000, targetMet: elapsedMs <= 2000, environment: `Node ${process.versions.node}; model only, rendering excluded` }));
  expect(runScreener(datasets, [...columns, { id: 'extra', metric: 'name' }]).diagnostics.some(row => row.code === 'WORKLOAD_LIMIT')).toBe(true);
}, 15000);
