import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ALERT_MANAGER_FILTER, DEFAULT_ALERT_MANAGER_SORT, filterAlertManagerAlerts,
  sortAlertManagerAlerts, validateAlertManagerSort,
  type AlertManagerSort, type AlertManagerSortKey,
} from '../../src/domain/alert-manager-view';
import { createLocalAlert, editLocalAlert, processAlertEvent, validateLocalAlerts, type LocalAlert } from '../../src/domain/alerts';
import { alertSourceId, type AlertObservationBinding } from '../../src/domain/alert-observation';

const tuple = (key: AlertManagerSortKey = 'original', direction: AlertManagerSort['direction'] = 'asc'): AlertManagerSort => ({ key, direction });
const ids = (rows: readonly LocalAlert[]) => rows.map(row => row.definition.id);
const ordered = (rows: readonly LocalAlert[], key: AlertManagerSortKey, direction: AlertManagerSort['direction'] = 'asc') =>
  ids(sortAlertManagerAlerts(rows, tuple(key, direction)));

function makeAlert(id: string, options: {
  name?: string; message?: string; created?: number; triggered?: number | null;
  mode?: 'ordinary' | 'replay'; version?: 1 | 2; instrument?: string; symbol?: string; exchange?: string;
} = {}): LocalAlert {
  const instrument = options.instrument ?? `synthetic-${id}`, mode = options.mode ?? 'ordinary';
  const source = options.version === 1 ? { kind: 'price' as const, field: 'close' as const } : { kind: 'price' as const, field: 'close' as const, transformId: 'standard' as const };
  const binding: AlertObservationBinding | undefined = options.version ? {
    schemaVersion: options.version,
    datasetKey: JSON.stringify(options.version === 1
      ? [instrument, 'synthetic-provider', 'synthetic-dataset', '1D', 'USD', 'raw', 'regular', 'UTC']
      : [1, instrument, options.symbol ?? 'SYN', 'Synthetic company', options.exchange ?? 'SYNTHETIC', 'USD', 'stock', 'UTC', 'synthetic-provider', 'synthetic-dataset', '1D', 'raw', 'regular', 'UTC', 'synthetic fixture', 0.01, 1, true]),
    sessionId: `session-${id}`, replayRunId: mode === 'replay' ? 'synthetic-replay' : null,
    fixture: true, completionPolicy: 'unknown', source,
    ...(options.version === 2 ? { chartId: 'synthetic-chart', calculationVersion: 'lv-technical-1' as const } : {}),
  } : undefined;
  let row = createLocalAlert({
    id, name: options.name ?? id, message: options.message ?? '', instrumentId: instrument,
    sourceId: binding ? alertSourceId(source) : 'close', mode,
    runId: binding ? `${mode}:snapshot:${binding.sessionId}` : `synthetic-${mode}`,
    condition: { kind: 'greater', value: 0 }, frequency: 'every-time', createdAt: options.created ?? 0, expiresAt: null,
    ...(binding ? { observationBinding: binding } : {}),
  });
  if (options.triggered !== undefined && options.triggered !== null) {
    // Scalar unbound fixtures use the real local evaluator to obtain coherent saved clocks/history.
    if (binding) throw new Error('Use unbound fixtures for scalar trigger-clock assertions.');
    row = processAlertEvent(row, {
      instrumentId: instrument, sourceId: row.definition.sourceId, value: 1, time: options.triggered,
      availableAt: options.triggered, sequence: 1, barId: `synthetic-bar-${id}`, barClosed: true,
      feedState: 'ready', mode, runId: row.definition.runId,
    }).alert;
  }
  return row;
}

describe('closed alert-manager sort tuple', () => {
  it('has a frozen original-order compatibility default and snapshots valid own data', () => {
    expect(DEFAULT_ALERT_MANAGER_SORT).toEqual({ key: 'original', direction: 'asc' });
    expect(Object.isFrozen(DEFAULT_ALERT_MANAGER_SORT)).toBe(true);
    const input = tuple('name', 'desc'), output = validateAlertManagerSort(input);
    expect(output).toEqual(input); expect(output).not.toBe(input); expect(Object.isFrozen(output)).toBe(true);
    input.key = 'message'; expect(output.key).toBe('name');
    expect(validateAlertManagerSort(Object.assign(Object.create(null), tuple('original', 'desc')))).toEqual(tuple('original', 'desc'));
  });

  it.each([
    ['null', null], ['undefined', undefined], ['array', []], ['foreign prototype', new Date(0)],
    ['missing direction', { key: 'name' }], ['extra field', { ...tuple(), query: '' }],
    ['key alias', { key: 'symbol', direction: 'asc' }], ['case alias', { key: 'Name', direction: 'asc' }],
    ['numeric key', { key: 0, direction: 'asc' }], ['unknown direction', { key: 'name', direction: 'up' }],
    ['dormant invalid direction', { key: 'original', direction: undefined }],
  ])('rejects %s without choosing a fallback', (_label, value) => {
    expect(() => validateAlertManagerSort(value)).toThrow();
  });

  it.each(['key', 'direction'])('rejects a %s accessor without calling it', key => {
    const read = vi.fn(() => { throw new Error('unexpected getter'); }), input = tuple();
    Object.defineProperty(input, key, { enumerable: true, get: read });
    expect(() => validateAlertManagerSort(input)).toThrow(/own data/); expect(read).not.toHaveBeenCalled();
  });

  it('rejects hidden, symbol and inherited fields and does not coerce keys', () => {
    const hidden = tuple(); Object.defineProperty(hidden, 'direction', { value: 'asc', enumerable: false });
    const convert = vi.fn(() => 'name');
    for (const value of [hidden, { ...tuple(), [Symbol('extra')]: true }, Object.create(tuple()), { key: { toString: convert }, direction: 'asc' }]) {
      expect(() => validateAlertManagerSort(value)).toThrow();
    }
    expect(convert).not.toHaveBeenCalled();
  });

  it('validates settings and count before row reads; original does not certify rows', () => {
    const read = vi.fn(() => { throw new Error('row read'); }), rows: LocalAlert[] = [];
    Object.defineProperty(rows, 0, { get: read });
    expect(() => sortAlertManagerAlerts(rows, { key: 'original', direction: 'bad' } as unknown as AlertManagerSort)).toThrow(/direction/);
    expect(sortAlertManagerAlerts(rows, tuple())).toBe(rows);
    expect(sortAlertManagerAlerts(rows, tuple('original', 'desc'))).toBe(rows);
    rows.length = 10001;
    expect(() => sortAlertManagerAlerts(rows, tuple('name'))).toThrow(/bounded/);
    expect(() => sortAlertManagerAlerts(rows, tuple())).toThrow(/bounded/);
    expect(read).not.toHaveBeenCalled();
    expect(() => sortAlertManagerAlerts({} as LocalAlert[], tuple())).toThrow(/bounded/);
  });
});

describe('literal saved-key orders', () => {
  const expected: Array<[AlertManagerSortKey, AlertManagerSort['direction'], string[]]> = [
    ['name', 'asc', ['upper', 'lower', 'beta', 'last']], ['name', 'desc', ['last', 'beta', 'upper', 'lower']],
    ['message', 'asc', ['lower', 'upper', 'last', 'beta']], ['message', 'desc', ['beta', 'upper', 'last', 'lower']],
    ['created', 'asc', ['upper', 'lower', 'beta', 'last']], ['created', 'desc', ['last', 'beta', 'upper', 'lower']],
    ['triggered', 'asc', ['lower', 'beta', 'last', 'upper']], ['triggered', 'desc', ['last', 'beta', 'lower', 'upper']],
  ];
  const rows = () => [
    makeAlert('beta', { name: 'Beta', message: 'zeta', created: 2, triggered: 10 }),
    makeAlert('upper', { name: 'ALPHA', message: 'Alpha', created: 0 }),
    makeAlert('lower', { name: 'alpha', message: '', created: 0, triggered: 0, mode: 'replay' }),
    makeAlert('last', { name: 'Zulu', message: 'alpha', created: 10, triggered: 20 }),
  ];

  it.each(expected)('%s %s follows the independent literal order', (key, direction, wanted) => {
    const saved = rows(), before = JSON.stringify(saved);
    expect(validateLocalAlerts(saved).ok).toBe(true);
    const result = sortAlertManagerAlerts(saved, tuple(key, direction));
    expect(ids(result)).toEqual(wanted); expect(result).not.toBe(saved);
    expect(result.every(row => saved.includes(row))).toBe(true);
    expect(JSON.stringify(saved)).toBe(before); expect(Object.isFrozen(saved)).toBe(false);
    expect(saved.every(row => !Object.isFrozen(row) && !Object.isFrozen(row.definition))).toBe(true);
  });

  it.each(['asc', 'desc'] as const)('Ticker %s uses saved symbol and stable same-symbol ties, not exchange or current identity', direction => {
    const saved = [
      makeAlert('beta', { version: 2, symbol: 'BBB', instrument: 'aaa-opaque' }),
      makeAlert('upper', { version: 2, symbol: 'AAA', exchange: 'ZEX', instrument: 'zzz-upper' }),
      makeAlert('lower', { version: 2, symbol: 'aaa', exchange: 'AEX', instrument: 'zzz-lower', mode: 'replay' }),
      makeAlert('last', { version: 2, symbol: 'ZZZ', instrument: 'aaa-another' }),
    ];
    expect(validateLocalAlerts(saved).ok).toBe(true);
    expect(ordered(saved, 'ticker', direction)).toEqual(direction === 'asc' ? ['upper', 'lower', 'beta', 'last'] : ['last', 'beta', 'upper', 'lower']);
  });

  it('uses actual v1/unbound instrument IDs when no saved symbol exists', () => {
    const saved = [
      makeAlert('unbound', { instrument: 'Z-legacy' }),
      makeAlert('old', { version: 1, instrument: 'M-legacy' }),
      makeAlert('new', { version: 2, instrument: 'zzz-opaque-id', symbol: 'Alpha' }),
    ];
    expect(validateLocalAlerts(saved).ok).toBe(true);
    expect(ordered(saved, 'ticker')).toEqual(['new', 'old', 'unbound']);
    expect(ordered(saved, 'ticker', 'desc')).toEqual(['unbound', 'old', 'new']);
  });

  it('retains multiple nulls last in both directions and never reconstructs a clock from retained history', () => {
    const triggered = makeAlert('edited', { triggered: 5 });
    const edited = editLocalAlert(triggered, { name: 'Edited after trigger' }, 6);
    const saved = [edited, makeAlert('ten', { triggered: 10 }), makeAlert('null'), makeAlert('zero', { triggered: 0 }), makeAlert('two', { triggered: 2 })];
    expect(edited.lastTriggeredAt).toBeNull(); expect(edited.history).toHaveLength(1);
    expect(validateLocalAlerts(saved).ok).toBe(true);
    expect(ordered(saved, 'triggered')).toEqual(['zero', 'two', 'ten', 'edited', 'null']);
    expect(ordered(saved, 'triggered', 'desc')).toEqual(['ten', 'two', 'zero', 'edited', 'null']);
  });

  it('uses lowercase UTF-16 ordinal ordering without trimming or Unicode normalization', () => {
    const saved = [
      makeAlert('accent', { name: '\u00c9clair' }), makeAlert('space', { name: ' Zebra' }),
      makeAlert('composed', { name: 'caf\u00e9' }), makeAlert('decomposed', { name: 'cafe\u0301' }),
      makeAlert('astral', { name: '\u{1f600}' }), makeAlert('ascii', { name: 'alpha' }),
    ];
    expect(ordered(saved, 'name')).toEqual(['space', 'ascii', 'decomposed', 'composed', 'accent', 'astral']);
    expect(ordered(saved, 'name', 'desc')).toEqual(['astral', 'accent', 'composed', 'decomposed', 'ascii', 'space']);
  });

  it('preserves empty, singleton, equal-key and signed-zero data', () => {
    const empty: LocalAlert[] = [], negative = makeAlert('negative', { created: -0, triggered: -0 });
    const positive = makeAlert('positive', { created: 0, triggered: 0 });
    expect(sortAlertManagerAlerts(empty, tuple())).toBe(empty);
    expect(sortAlertManagerAlerts(empty, tuple('name'))).toEqual([]);
    expect(sortAlertManagerAlerts([negative], tuple('name'))[0]).toBe(negative);
    expect(ordered([negative, positive], 'created', 'desc')).toEqual(['negative', 'positive']);
    expect(ordered([negative, positive], 'triggered', 'desc')).toEqual(['negative', 'positive']);
    expect(Object.is(negative.definition.createdAt, -0)).toBe(true); expect(Object.is(negative.lastTriggeredAt, -0)).toBe(true);
  });

  it('composes after filtering while preserving authoritative rows and search semantics', () => {
    const saved = rows(), before = JSON.stringify(saved);
    const filtered = filterAlertManagerAlerts(saved, { ...DEFAULT_ALERT_MANAGER_FILTER, query: 'alpha' });
    expect(ids(filtered)).toEqual(['upper', 'lower', 'last']);
    expect(ordered(filtered, 'name', 'desc')).toEqual(['last', 'upper', 'lower']);
    expect(sortAlertManagerAlerts(filtered, tuple())).toBe(filtered);
    expect(JSON.stringify(saved)).toBe(before);
    expect(DEFAULT_ALERT_MANAGER_FILTER).toEqual({ query: '', status: 'all', sourceType: 'all', mode: 'all' });
  });
});

describe('selected scalar admission and bounded read isolation', () => {
  it.each(['created', 'triggered'] as const)('rejects invalid %s timestamps instead of coercing or sorting as zero', key => {
    for (const invalid of [undefined, '10', NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, ...(key === 'created' ? [null] : [])]) {
      const row = makeAlert('invalid');
      if (key === 'created') (row.definition as { createdAt: unknown }).createdAt = invalid;
      else (row as { lastTriggeredAt: unknown }).lastTriggeredAt = invalid;
      expect(() => sortAlertManagerAlerts([row], tuple(key))).toThrow(/time/);
    }
  });

  it('keeps existing selected text limits without truncating or coercing', () => {
    const row = makeAlert('bounded', { name: 'N'.repeat(200), message: 'M'.repeat(4000) });
    expect(sortAlertManagerAlerts([row], tuple('name'))[0]).toBe(row);
    expect(sortAlertManagerAlerts([row], tuple('message'))[0]).toBe(row);
    row.definition.name += 'N'; expect(() => sortAlertManagerAlerts([row], tuple('name'))).toThrow(/metadata/);
    row.definition.message += 'M'; expect(() => sortAlertManagerAlerts([row], tuple('message'))).toThrow(/metadata/);
    const convert = vi.fn(() => 'value'); (row.definition as { name: unknown }).name = { toString: convert };
    expect(() => sortAlertManagerAlerts([row], tuple('name'))).toThrow(); expect(convert).not.toHaveBeenCalled();
  });

  it('refuses unsupported/noncanonical Ticker tuples and source identity mismatches', () => {
    const base = makeAlert('source', { version: 2, symbol: 'SYN' });
    const changes: Array<(binding: AlertObservationBinding) => void> = [
      binding => { (binding as { schemaVersion: number }).schemaVersion = 3; },
      binding => { binding.datasetKey = ' ' + binding.datasetKey; },
      binding => { binding.datasetKey = '{bad'; },
      binding => { const fields = JSON.parse(binding.datasetKey); fields[0] = 2; binding.datasetKey = JSON.stringify(fields); },
      binding => { const fields = JSON.parse(binding.datasetKey); fields[1] = 'another-instrument'; binding.datasetKey = JSON.stringify(fields); },
      binding => { binding.fixture = false; },
    ];
    for (const change of changes) {
      const row = structuredClone(base); change(row.definition.observationBinding!);
      expect(() => sortAlertManagerAlerts([row], tuple('ticker'))).toThrow();
      expect(sortAlertManagerAlerts([row], tuple('name'))[0]).toBe(row);
    }
    const old = makeAlert('old', { version: 1 }); old.definition.observationBinding!.datasetKey += ' ';
    expect(() => sortAlertManagerAlerts([old], tuple('ticker'))).toThrow(/canonical/);
  });

  it('prepares each selected key once before comparisons without unused graph reads', () => {
    // Deliberate accessor probes establish read isolation, not admission of malformed persisted objects.
    const saved = ['c', 'a', 'b'].map(id => makeAlert(id)), reads = saved.map(() => 0);
    const unwanted = vi.fn(() => { throw new Error('unused graph read'); });
    saved.forEach((row, index) => {
      const name = row.definition.name;
      Object.defineProperty(row.definition, 'name', { get: () => { reads[index]++; return name; } });
      Object.defineProperty(row.definition, 'observationBinding', { get: unwanted });
      Object.defineProperty(row, 'history', { get: unwanted });
      Object.defineProperty(row, 'lastObservation', { get: unwanted });
      Object.defineProperty(row, 'closedBars', { get: unwanted });
    });
    expect(ordered(saved, 'name')).toEqual(['a', 'b', 'c']); expect(reads).toEqual([1, 1, 1]);
    expect(unwanted).not.toHaveBeenCalled();
  });

  it('does not read a Ticker source graph or history while decoding saved tuple metadata', () => {
    const row = makeAlert('source', { version: 2, symbol: 'SYN' });
    const unwanted = vi.fn(() => { throw new Error('unused source graph'); });
    Object.defineProperty(row.definition.observationBinding!, 'source', { get: unwanted });
    Object.defineProperty(row, 'history', { get: unwanted });
    expect(sortAlertManagerAlerts([row], tuple('ticker'))[0]).toBe(row);
    expect(unwanted).not.toHaveBeenCalled();
  });

  it('keeps the existing 10000-record bound without changing order or enlarging authority', () => {
    const base = makeAlert('base');
    const saved = Array.from({ length: 10000 }, (_, index) => ({ ...base, definition: { ...base.definition, id: `synthetic-${index}`, name: 'Equal key' } }));
    const result = sortAlertManagerAlerts(saved, tuple('name', 'desc'));
    expect(result).toHaveLength(10000); expect(result.every((row, index) => row === saved[index])).toBe(true);
    expect(saved[0].definition.id).toBe('synthetic-0'); expect(saved[9999].definition.id).toBe('synthetic-9999');
  });
});
