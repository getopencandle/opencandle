import { describe, expect, it, vi } from 'vitest';
import {
  ALERT_MANAGER_QUERY_MAX_UNITS, DEFAULT_ALERT_MANAGER_FILTER, filterAlertManagerAlerts,
  validateAlertManagerFilter, type AlertManagerFilter,
} from '../../src/domain/alert-manager-view';
import { createLocalAlert, validateLocalAlerts, type LocalAlert } from '../../src/domain/alerts';
import { alertSourceId, type AlertObservationBinding, type AlertSourceSnapshot } from '../../src/domain/alert-observation';
import { captureIndicatorAlertSource } from '../../src/domain/technical-alerts';
import type { DrawingBoundarySnapshot } from '../../src/chart/drawing-alert-geometry';

const now = 1792080000;
const price: AlertSourceSnapshot = { kind: 'price', field: 'close', transformId: 'standard' };
const oldPrice: AlertSourceSnapshot = { kind: 'price', field: 'close' };
const savedBasis = (instrument = 'instrument-a', symbol = 'ALFA', exchange = 'XONE', provider = 'import-a', dataset = 'dataset-a') =>
  JSON.stringify([1, instrument, symbol, 'Saved company', exchange, 'USD', 'stock', 'UTC', provider, dataset, '1D', 'raw', 'regular', 'UTC', 'locally supplied', 0.01, 1, false]);
const oldBasis = (instrument = 'legacy-instrument') => JSON.stringify([instrument, 'legacy-provider', 'legacy-dataset', '1D', 'USD', 'raw', 'regular', 'UTC']);
const filters = (patch: Partial<AlertManagerFilter> = {}): AlertManagerFilter => ({ ...DEFAULT_ALERT_MANAGER_FILTER, ...patch });

function alert(id: string, options: {
  name?: string; message?: string; status?: LocalAlert['status']; mode?: 'ordinary' | 'replay';
  source?: AlertSourceSnapshot; version?: 1 | 2; instrument?: string; datasetKey?: string;
} = {}): LocalAlert {
  const mode = options.mode ?? 'ordinary', instrumentId = options.instrument ?? 'instrument-a';
  const source = options.source, version = options.version ?? 2;
  const binding: AlertObservationBinding | undefined = source ? {
    schemaVersion: version, datasetKey: options.datasetKey ?? (version === 1 ? oldBasis(instrumentId) : savedBasis(instrumentId)),
    sessionId: `session-${id}`, replayRunId: mode === 'replay' ? 'replay-run' : null, fixture: false,
    completionPolicy: 'unknown', source,
    ...(version === 2 ? { chartId: 'saved-chart', calculationVersion: 'lv-technical-1' as const } : {}),
  } : undefined;
  const result = createLocalAlert({
    id, name: options.name ?? 'Neutral title', message: options.message ?? 'Neutral message', instrumentId,
    sourceId: source ? alertSourceId(source) : 'close', mode,
    runId: binding ? `${mode}:snapshot:${binding.sessionId}` : mode === 'ordinary' ? 'ordinary' : 'retained-replay',
    condition: { kind: 'greater', value: 0 }, frequency: 'every-time', createdAt: now, expiresAt: null,
    ...(binding ? { observationBinding: binding, ...(version === 2 ? { conditionVersion: 2 as const } : {}) } : {}),
  });
  if (options.status) result.status = options.status;
  return result;
}

const ids = (rows: readonly LocalAlert[]) => rows.map(row => row.definition.id);
const selected = (rows: readonly LocalAlert[], patch: Partial<AlertManagerFilter> = {}) => ids(filterAlertManagerAlerts(rows, filters(patch)));

function sourceRows(): LocalAlert[] {
  const indicator = captureIndicatorAlertSource({ id: 'study-42', kind: 'sma', inputs: { length: 2, source: 'close' }, plots: {}, offset: 0, visible: true }, 'sma', 'standard', 'snapshot-study');
  const anchors = [{ time: 1704153600, price: 10, logical: 0 }];
  const geometry: DrawingBoundarySnapshot = {
    schemaVersion: 1, drawingId: 'line-7', tool: 'hline', paneId: 'price', coordinateModel: 'logical-bar-linear-price',
    sourceBasis: savedBasis(), sourceRevision: 'saved-revision', transform: 'standard', gridOrigin: 1704153600,
    capturedRows: 1, anchors, domain: { min: null, max: null },
    geometryFingerprint: JSON.stringify([1, 'hline', anchors, null, null, 'logical-bar-linear-price']),
  };
  return [
    alert('unbound'),
    alert('price', { source: price }),
    alert('indicator', { source: indicator }),
    alert('old-drawing', { version: 1, source: { kind: 'drawing', instanceId: 'old-line', snapshotId: 'old-drawing-snapshot', tool: 'trendline', anchors: [{ time: 1704153600, price: 10 }, { time: 1704240000, price: 11 }], settings: {}, evaluation: 'signed-price-distance', coordinateModel: 'linear-time-price' } }),
    alert('boundary', { source: { kind: 'drawing-boundary', instanceId: 'line-7', snapshotId: 'boundary-snapshot', geometry, mutationPolicy: 'frozen' } }),
    alert('comparison', { source: { kind: 'comparison', snapshotId: 'pair-snapshot', left: indicator as Exclude<AlertSourceSnapshot, { kind: 'comparison' }>, right: { kind: 'price', field: 'open', transformId: 'heikinashi' } } }),
    alert('old-price', { version: 1, source: oldPrice }),
  ];
}

describe('closed ephemeral filter tuple', () => {
  it('snapshots raw text without changing its input or the default', () => {
    const input = filters({ query: '  ALFA  ' }), output = validateAlertManagerFilter(input);
    expect(output).toEqual(input); expect(output).not.toBe(input); expect(Object.isFrozen(output)).toBe(true);
    input.query = 'changed'; expect(output.query).toBe('  ALFA  ');
    expect(DEFAULT_ALERT_MANAGER_FILTER).toEqual({ query: '', status: 'all', sourceType: 'all', mode: 'all' });
    expect(Object.isFrozen(DEFAULT_ALERT_MANAGER_FILTER)).toBe(true);
    expect(validateAlertManagerFilter(Object.assign(Object.create(null), filters()))).toEqual(DEFAULT_ALERT_MANAGER_FILTER);
  });

  it.each([
    ['null', null], ['undefined', undefined], ['array', []], ['prototype', new Date(0)],
    ['missing field', { query: '', status: 'all', sourceType: 'all' }],
    ['extra field', { ...filters(), surprise: true }],
    ['undefined query', { ...filters(), query: undefined }], ['numeric query', { ...filters(), query: 0 }],
    ['status alias', { ...filters(), status: 'inactive' }], ['status case', { ...filters(), status: 'Active' }],
    ['unknown source', { ...filters(), sourceType: 'drawing-boundary' }], ['unknown mode', { ...filters(), mode: 'live' }],
  ])('rejects %s rather than inferring a filter', (_name, input) => {
    expect(() => validateAlertManagerFilter(input)).toThrow();
  });

  it('rejects unknown symbols, hidden fields and inherited fields', () => {
    const symbol = { ...filters(), [Symbol('extra')]: true };
    const hidden = filters(); Object.defineProperty(hidden, 'query', { value: '', enumerable: false });
    expect(() => validateAlertManagerFilter(symbol)).toThrow();
    expect(() => validateAlertManagerFilter(hidden)).toThrow();
    expect(() => validateAlertManagerFilter(Object.create(filters()))).toThrow();
  });

  it.each(['query', 'status', 'sourceType', 'mode'])('does not invoke the %s accessor', key => {
    const getter = vi.fn(() => { throw new Error('getter must not execute'); }), input = filters();
    Object.defineProperty(input, key, { enumerable: true, get: getter });
    expect(() => validateAlertManagerFilter(input)).toThrow(/own data/);
    expect(getter).not.toHaveBeenCalled();
  });

  it('does not coerce a query object', () => {
    const convert = vi.fn(() => 'ALFA');
    expect(() => validateAlertManagerFilter({ ...filters(), query: { toString: convert, [Symbol.toPrimitive]: convert } })).toThrow(/256/);
    expect(convert).not.toHaveBeenCalled();
  });

  it('counts raw UTF-16 units before matching-only trim', () => {
    expect(ALERT_MANAGER_QUERY_MAX_UNITS).toBe(256);
    expect(validateAlertManagerFilter(filters({ query: 'x'.repeat(256) })).query.length).toBe(256);
    expect(validateAlertManagerFilter(filters({ query: '😀'.repeat(128) })).query.length).toBe(256);
    expect(() => validateAlertManagerFilter(filters({ query: 'x'.repeat(257) }))).toThrow(/256/);
    expect(() => validateAlertManagerFilter(filters({ query: '😀'.repeat(128) + 'a' }))).toThrow(/256/);
    expect(() => validateAlertManagerFilter(filters({ query: ' '.repeat(257) }))).toThrow(/256/);
  });

  it('rejects invalid filters before touching the saved array', () => {
    const read = vi.fn(() => { throw new Error('row acquired'); }), rows: LocalAlert[] = [];
    Object.defineProperty(rows, 0, { get: read });
    expect(() => filterAlertManagerAlerts(rows, filters({ query: 'x'.repeat(257) }))).toThrow(/256/);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('literal matching over saved scalar fields', () => {
  const cases: Array<[string, string[]]> = [
    ['', ['a', 'b', 'c', 'd']], [' \t\n ', ['a', 'b', 'c', 'd']],
    ['aLpHa', ['a', 'b', 'c']], ['  ALPHA RISE  ', ['a']], ['alpha  rise', ['b']],
    ['[rsi].*', ['a']], ['.*', ['a']], ['[rsi]+', []], ['alpha watch', []],
    ['CAFÉ', ['d']], ['cafe', []], ['cafe\u0301', []], ['never present', []],
  ];
  it.each(cases)('query %j has the literal expected membership', (query, expected) => {
    const rows = [
      alert('a', { name: 'Alpha Rise', message: 'Watch [rsi].*' }),
      alert('b', { name: 'Beta', message: 'alpha  rise' }),
      alert('c', { name: 'ALPHA', message: 'Price crossed' }),
      alert('d', { name: 'Café', message: 'Separate phrase' }),
    ];
    expect(selected(rows, { query })).toEqual(expected);
  });

  it('does not merge duplicate labels or mutate/freeze rows, definitions or history', () => {
    const rows = [alert('second', { name: 'Equal label' }), alert('first', { name: 'Equal label' })];
    rows[0].history.push({ id: 'notice', alertId: 'second', name: 'History secret', message: 'Only in history', value: 10, at: now, barId: 'bar', sequence: 1, mode: 'ordinary', runId: 'ordinary', local: true });
    const before = JSON.stringify(rows), result = filterAlertManagerAlerts(rows, filters({ query: 'equal' }));
    expect(ids(result)).toEqual(['second', 'first']); expect(result[0]).toBe(rows[0]); expect(result[1]).toBe(rows[1]);
    expect(JSON.stringify(rows)).toBe(before); expect(Object.isFrozen(rows)).toBe(false); expect(Object.isFrozen(rows[0])).toBe(false);
    expect(selected(rows, { query: 'history secret' })).toEqual([]);
    expect(filterAlertManagerAlerts(rows, DEFAULT_ALERT_MANAGER_FILTER)).toBe(rows);
  });

  it('searches actual saved instrument and source IDs without manufacturing aliases', () => {
    const rows = [alert('legacy', { instrument: 'opaque-market-id' })];
    expect(selected(rows, { query: 'opaque-market' })).toEqual(['legacy']);
    expect(selected(rows, { query: 'close' })).toEqual(['legacy']);
    expect(selected(rows, { query: 'XONE:ALFA' })).toEqual([]);
    expect(selected(rows, { sourceType: 'legacy' })).toEqual(['legacy']);
    expect(selected(rows, { sourceType: 'price' })).toEqual([]);
  });

  it('reads version 2 saved symbol/exchange/provider/dataset with only the declared compound alias', () => {
    const rows = [
      alert('a', { source: price }),
      alert('b', { source: price, instrument: 'instrument-b', datasetKey: savedBasis('instrument-b', 'ALFA', 'XTWO', 'import-b', 'dataset-b') }),
    ];
    expect(selected(rows, { query: 'alfa' })).toEqual(['a', 'b']);
    expect(selected(rows, { query: 'xone:alfa' })).toEqual(['a']);
    expect(selected(rows, { query: 'xtwo' })).toEqual(['b']);
    expect(selected(rows, { query: 'import-b' })).toEqual(['b']);
    expect(selected(rows, { query: 'dataset-a' })).toEqual(['a']);
    expect(selected(rows, { query: 'import-a dataset-a' })).toEqual([]);
    expect(selected(rows, { query: 'Saved company' })).toEqual([]);
  });

  it('reads canonical v1 provider/dataset but invents no saved symbol or exchange', () => {
    const row = alert('v1', { source: oldPrice, version: 1, instrument: 'opaque-identity' });
    expect(selected([row], { query: 'legacy-provider' })).toEqual(['v1']);
    expect(selected([row], { query: 'legacy-dataset' })).toEqual(['v1']);
    expect(selected([row], { query: 'opaque-identity' })).toEqual(['v1']);
    expect(selected([row], { query: 'ALFA' })).toEqual([]);
    expect(selected([row], { query: 'XONE' })).toEqual([]);
    expect(selected([row], { sourceType: 'price' })).toEqual(['v1']);
  });

  it('treats binding v2 and its inner tuple v1 as separate schemas and rejects unknown/noncanonical metadata', () => {
    const row = alert('a', { source: price });
    expect(selected([row], { query: 'alfa' })).toEqual(['a']);
    const edits: Array<(binding: AlertObservationBinding) => void> = [
      binding => { (binding as { schemaVersion: number }).schemaVersion = 3; },
      binding => { const tuple = JSON.parse(binding.datasetKey); tuple[0] = 2; binding.datasetKey = JSON.stringify(tuple); },
      binding => { binding.datasetKey = ' ' + binding.datasetKey; },
      binding => { binding.datasetKey = '{bad'; },
      binding => { binding.datasetKey = savedBasis('another-instrument'); },
      binding => { binding.fixture = true; },
    ];
    for (const edit of edits) {
      const changed = structuredClone(row); edit(changed.definition.observationBinding!);
      expect(() => selected([changed], { query: 'alfa' })).toThrow();
    }
    const old = alert('old', { source: oldPrice, version: 1 });
    for (const key of [oldBasis() + ' ', JSON.stringify(['a']), JSON.stringify(['instrument-a', 'p'.repeat(4097), 'd', '1D', 'USD', 'raw', 'regular', 'UTC'])]) {
      const changed = structuredClone(old); changed.definition.observationBinding!.datasetKey = key;
      expect(() => selected([changed], { query: 'legacy' })).toThrow();
    }
  });
});

describe('source, status and mode selectors', () => {
  it('uses actually admitted source fixtures, including a frozen drawing boundary', () => {
    const rows = sourceRows(); expect(validateLocalAlerts(rows).ok).toBe(true);
    expect(selected(rows, { sourceType: 'legacy' })).toEqual(['unbound']);
    expect(selected(rows, { sourceType: 'price' })).toEqual(['price', 'old-price']);
    expect(selected(rows, { sourceType: 'indicator' })).toEqual(['indicator']);
    expect(selected(rows, { sourceType: 'drawing' })).toEqual(['old-drawing', 'boundary']);
    expect(selected(rows, { sourceType: 'comparison' })).toEqual(['comparison']);
  });

  it('searches at most two comparison operands without reclassifying its source', () => {
    const rows = sourceRows();
    expect(selected(rows, { query: 'sma' })).toEqual(['indicator', 'comparison']);
    expect(selected(rows, { query: 'heikinashi' })).toEqual(['comparison']);
    expect(selected(rows, { query: 'study-42', sourceType: 'indicator' })).toEqual(['indicator']);
    expect(selected(rows, { query: 'pair-snapshot', sourceType: 'comparison' })).toEqual(['comparison']);
    expect(selected(rows, { query: 'sma open' })).toEqual([]);
    expect(selected(rows, { query: 'trendline', sourceType: 'drawing' })).toEqual(['old-drawing']);
    expect(selected(rows, { query: 'hline', sourceType: 'drawing' })).toEqual(['boundary']);
  });

  it.each(['active', 'paused', 'stopped', 'expired', 'waiting-for-data'] as const)('matches exact saved %s status in both retained modes', status => {
    const states: LocalAlert['status'][] = ['active', 'paused', 'stopped', 'expired', 'waiting-for-data'];
    const rows = states.flatMap(value => [alert(`${value}-ordinary`, { status: value }), alert(`${value}-replay`, { status: value, mode: 'replay' })]);
    expect(selected(rows, { status })).toEqual([`${status}-ordinary`, `${status}-replay`]);
    expect(selected(rows, { status, mode: 'replay' })).toEqual([`${status}-replay`]);
    expect(selected(rows, { status, mode: 'ordinary' })).toEqual([`${status}-ordinary`]);
  });

  it('ANDs all four controls and retains active saved replay rows without rearming them', () => {
    const rows = [
      alert('ordinary', { name: 'Target', source: price }),
      alert('replay', { name: 'Target', source: price, mode: 'replay' }),
      alert('paused', { name: 'Target', source: price, mode: 'replay', status: 'paused' }),
      alert('other-name', { name: 'Other', source: price, mode: 'replay' }),
      alert('unbound', { name: 'Target', mode: 'replay' }),
    ];
    const before = JSON.stringify(rows);
    expect(selected(rows, { query: 'target', sourceType: 'price', mode: 'replay', status: 'active' })).toEqual(['replay']);
    expect(JSON.stringify(rows)).toBe(before); expect(rows[1].definition.runId).toBe('replay:snapshot:session-replay');
  });
});

describe('bounded view-only work', () => {
  it('never reads history, numerical baselines, frozen inputs or anchor arrays', () => {
    const rows = sourceRows(), forbidden = vi.fn(() => { throw new Error('unrelated graph read'); });
    // Read-isolation probes only: these deliberately replaced descriptors are not
    // a claim that malformed caller objects are valid persisted alert state.
    for (const row of rows) {
      for (const key of ['history', 'closedBars', 'lastObservation']) Object.defineProperty(row, key, { get: forbidden });
      const source = row.definition.observationBinding?.source;
      if (source?.kind === 'indicator') Object.defineProperty(source, 'inputs', { get: forbidden });
      if (source?.kind === 'drawing') Object.defineProperty(source, 'anchors', { get: forbidden });
      if (source?.kind === 'drawing-boundary') Object.defineProperty(source.geometry, 'anchors', { get: forbidden });
      if (source?.kind === 'comparison' && source.left.kind === 'indicator') Object.defineProperty(source.left, 'inputs', { get: forbidden });
    }
    expect(selected(rows, { query: 'no scalar match' })).toEqual([]);
    expect(selected(rows, { query: 'sma' })).toEqual(['indicator', 'comparison']);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('preserves the existing 10000-row bound and refuses excess before indexed reads', () => {
    const row = alert('same'), full = Array.from({ length: 10000 }, () => row);
    const result = filterAlertManagerAlerts(full, filters({ status: 'active' }));
    expect(result).toHaveLength(10000); expect(result.every(item => item === row)).toBe(true);
    const excess = new Array<LocalAlert>(10001), read = vi.fn(() => { throw new Error('oversized row read'); });
    Object.defineProperty(excess, 0, { get: read });
    expect(() => filterAlertManagerAlerts(excess, DEFAULT_ALERT_MANAGER_FILTER)).toThrow(/bounded saved collection/);
    expect(read).not.toHaveBeenCalled();
  });
});
