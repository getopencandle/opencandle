import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../src/domain/data';
import { createImportDraft, exampleDraft, IMPORT_EXAMPLES, importCommitMessage, importSourceLabel, matchExample, OHLCV_TOOL_COVERAGE, prepareImportDraft, scanImportText, validateImportMetadata, type ImportDraft } from '../../src/domain/data-setup';
import { identifyLocalImport } from '../../src/ui/workspace-intervals';
import { ensureWorkspaceGrid, patchWorkspace, selectedDataset, suppliedSourceId } from '../../src/ui/workspace-grid';
import { restoreWorkspace } from '../../src/ui/workspace-validation';
import { createInitialWorkspace } from '../../src/ui/workspace-state';

// Fixed clock (2026-10-15T00:00:00Z) so "future row" checks are deterministic.
const NOW = 1792022400;
const prepare = (draft: ImportDraft, existing = []) => prepareImportDraft(draft, { now: NOW, existing });
const draftWith = (patch: Partial<ImportDraft>): ImportDraft => ({ ...createImportDraft(), symbol: 'TEST', ...patch });
const codes = (draft: ImportDraft) => prepare(draft).preview.issues.map(issue => issue.code);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('synthetic ready-to-import examples', () => {
  it('GME daily CSV: 12 bars, holiday gap retained, SYNTHETIC provenance and declared basis', () => {
    const { preview, dataset } = prepare(exampleDraft('gme-daily-csv'));
    expect(preview.state).toBe('ready'); expect(dataset).not.toBeNull();
    const bars = dataset!.bars;
    // Independent expectations: 2024-01-02T00:00Z = 1704153600; 2024-01-18 is 16 days later.
    expect(bars.length).toBe(12); expect(bars[0].time).toBe(1704153600); expect(bars[11].time).toBe(1704153600 + 16 * 86400);
    expect(sum(bars.map(bar => bar.volume))).toBe(18160000);
    expect(Math.max(...bars.map(bar => bar.close))).toBe(21.45); expect(Math.min(...bars.map(bar => bar.low))).toBe(19.6);
    expect(preview.typicalSpacing).toBe('1 day');
    expect(preview.largestGap).toBe('4 days between 2024-01-12 and 2024-01-16 (kept as a gap, not filled)');
    expect([preview.first, preview.last]).toEqual(['2024-01-02', '2024-01-18']);
    expect(preview.sample.map(row => row.position)).toEqual(['1 of 12', '2 of 12', '3 of 12', '10 of 12', '11 of 12', '12 of 12']);
    expect(dataset!.provenance).toMatchObject({ fixture: true, adjustment: 'raw', session: 'regular', providerId: 'local-import', timezone: 'America/New_York', providerName: 'OpenCandle synthetic import example (not market data)' });
    expect(dataset!.provenance.coverage).toBe('12 imported bars, 2024-01-02 to 2024-01-18; universe limited to this file');
    expect(dataset!.instrument).toMatchObject({ id: 'SYNTHETIC-EXAMPLE:GME', symbol: 'GME', assetClass: 'stock' });
    expect(dataset!.instrument.name).toContain('not market data');
    expect(preview.disclosure.map(row => row.label)).toEqual(['Source', 'Instrument', 'Resolution', 'Time basis', 'Session', 'Adjustment', 'Coverage', 'Updates']);
    expect(preview.disclosure.find(row => row.label === 'Source')!.value).toContain('SYNTHETIC');
    expect(preview.disclosure.find(row => row.label === 'Adjustment')!.value).toContain('declared by you, not verified');
  });
  it('SPY daily JSON with Unix seconds: 10 ETF bars and exact closes', () => {
    const { preview, dataset } = prepare(exampleDraft('spy-daily-json'));
    expect(preview.state).toBe('ready');
    const bars = dataset!.bars;
    expect(bars.map(bar => bar.time)).toEqual([2, 3, 4, 5, 8, 9, 10, 11, 12, 16].map(day => 1704153600 + (day - 2) * 86400));
    expect(bars.at(-1)!.close).toBe(100.8); expect(sum(bars.map(bar => bar.volume))).toBe(8550000);
    expect(dataset!.instrument.assetClass).toBe('etf'); expect(dataset!.provenance.fixture).toBe(true);
    expect(preview.first).toBe('2024-01-02'); expect(preview.disclosure.find(row => row.label === 'Time basis')!.value).toContain('UTC calendar dates');
  });
  it('third symbol LVDEMO 5-minute CSV: offsets converted to UTC seconds', () => {
    const { preview, dataset } = prepare(exampleDraft('lvdemo-5m-csv'));
    expect(preview.state).toBe('ready');
    // 09:30 at -05:00 is 14:30Z; 2024-01-02T14:30Z = 1704153600 + 14.5 h.
    expect(dataset!.bars[0].time).toBe(1704153600 + 52200); expect(dataset!.bars.at(-1)!.time).toBe(1704153600 + 52200 + 11 * 300);
    expect(sum(dataset!.bars.map(bar => bar.volume))).toBe(104800);
    expect(preview.typicalSpacing).toBe('5 minutes'); expect(preview.first).toBe('2024-01-02 14:30 UTC'); expect(preview.largestGap).toBeNull();
    expect(dataset!.resolution).toBe('5m');
  });
  it('practice file reports every deliberate mistake with its data row and imports nothing', () => {
    const { preview, dataset } = prepare(exampleDraft('practice-mistakes-csv'));
    expect(preview.state).toBe('blocked'); expect(dataset).toBeNull();
    expect(preview.rowsRead).toBe(10); expect(preview.rejectedRows).toBe(4);
    const located = preview.issues.filter(issue => issue.row).map(issue => [issue.code, issue.row]);
    expect(located).toEqual(expect.arrayContaining([['INVALID_ROW', 5], ['INVALID_ROW', 6], ['INVALID_ROW', 7], ['INVALID_ROW', 8], ['SORTED', 3], ['DUPLICATE_REMOVED', 4], ['CONFLICTING_DUPLICATE', 10]]));
    const text = preview.issues.map(issue => issue.message).join('\n');
    for (const fragment of ['OHLC range is inconsistent', 'Missing volume', 'currency symbols', 'Invalid calendar date', 'has different values']) expect(text).toContain(fragment);
    expect(preview.headline).toContain('Nothing has been changed');
  });
  it('shipped example files are byte-identical to the in-app examples and labeled synthetic', () => {
    expect(IMPORT_EXAMPLES.map(example => example.draft.symbol)).toEqual(['GME', 'SPY', 'LVDEMO', 'PRACTICE']);
    for (const example of IMPORT_EXAMPLES) {
      const file = readFileSync(new URL(`../../examples/${example.fileName}`, import.meta.url), 'utf8');
      // Line-ending independent: a git checkout with core.autocrlf may rewrite LF as CRLF.
      expect(file.replace(/\r\n?/g, '\n')).toBe(example.draft.text); expect(file).toContain('SYNTHETIC'); expect(example.fileName).toMatch(/synthetic/);
      expect(matchExample(file.replace(/\n/g, '\r\n'))?.id).toBe(example.id);
      expect(prepare(exampleDraft(example.id)).preview.state).toBe(example.expectValid ? 'ready' : 'blocked');
    }
  });
});

describe('malformed input and duplicate/order policies', () => {
  it('names missing columns, ragged rows, formatted numbers and wrong format', () => {
    const missing = prepare(draftWith({ text: 'date,open,high,low,close\n2024-01-02,1,2,1,2' })).preview;
    expect(missing.state).toBe('blocked'); expect(missing.issues.map(issue => issue.message).join()).toContain('Missing: volume. Found: date, open, high, low, close.');
    expect(prepare(draftWith({ text: 'date,open,high,low,close,volume\n2024-01-02,1,2,1,2,5\n2024-01-03,1,2,1' })).preview.issues.map(i => i.message).join()).toContain('data row 2 has 4 cell(s), the header has 6');
    const formatted = prepare(draftWith({ text: 'date,open,high,low,close,volume\n2024-01-02,1,2,1,2,"1,000"' })).preview;
    expect(formatted.issues[0]).toMatchObject({ code: 'INVALID_ROW', row: 1 }); expect(formatted.issues[0].message).toContain('thousands separators');
    expect(codes(draftWith({ text: '[{"time":"2024-01-02","open":1,"high":2,"low":1,"close":2,"volume":5}]' }))).toContain('FORMAT_MISMATCH');
    expect(codes(draftWith({ text: '{"bars":', format: 'json' }))).toContain('JSON_PARSE');
    expect(codes(draftWith({ text: '=HYPERLINK("x"),open\n1,2', format: 'csv' }))).toContain('CSV_PARSE');
  });
  it('applies duplicate and out-of-order policies explicitly with original row numbers', () => {
    const rows = 'date,open,high,low,close,volume\n2024-01-03,2,3,1,2,10\n2024-01-02,1,2,1,2,10\n2024-01-02,1,2,1,2,10\n';
    const sorted = prepare(draftWith({ text: rows }));
    expect(sorted.preview.state).toBe('ready'); expect(sorted.dataset!.bars.map(bar => bar.time)).toEqual([1704153600, 1704240000]);
    expect(sorted.preview.issues.filter(issue => issue.row).map(issue => [issue.code, issue.row])).toEqual([['SORTED', 2], ['DUPLICATE_REMOVED', 3]]);
    expect(prepare(draftWith({ text: rows, outOfOrder: 'reject' })).preview.issues.find(issue => issue.code === 'OUT_OF_ORDER')).toMatchObject({ severity: 'error', row: 2 });
    expect(prepare(draftWith({ text: rows, duplicatePolicy: 'reject' })).preview.issues.find(issue => issue.code === 'CONFLICTING_DUPLICATE')!.message).toContain('rejected by the selected duplicate policy');
    const correction = 'date,open,high,low,close,volume\n2024-01-02,1,2,1,2,10\n2024-01-02,1,2,1,1.5,12\n';
    expect(prepare(draftWith({ text: correction })).preview.state).toBe('blocked');
    const kept = prepare(draftWith({ text: correction, duplicatePolicy: 'keep-last' }));
    expect(kept.dataset!.bars).toEqual([{ time: 1704153600, open: 1, high: 2, low: 1, close: 1.5, volume: 12 }]);
    expect(kept.preview.issues.find(issue => issue.code === 'DUPLICATE_REPLACED')).toMatchObject({ severity: 'warning', row: 2 });
  });
});

describe('metadata mistakes', () => {
  it('reports every metadata error at once with its field', () => {
    const issues = validateImportMetadata({ ...createImportDraft(), symbol: 'bad symbol!', currency: 'US', timezone: 'Mars/Olympus', tickSize: 0, lotSize: -1, exchange: 'nyse exchange' }).filter(issue => issue.severity === 'error');
    expect(issues.map(issue => issue.field).sort()).toEqual(['currency', 'exchange', 'lotSize', 'symbol', 'tickSize', 'timezone']);
    expect(validateImportMetadata({ ...createImportDraft(), timezone: '' }).map(issue => issue.field)).toContain('timezone');
  });
  it('rejects symbol-column conflicts, mixed files, date-only intraday and finer-than-declared data', () => {
    expect(codes({ ...exampleDraft('gme-daily-csv'), symbol: 'SPY' })).toContain('SYMBOL_MISMATCH');
    expect(codes(draftWith({ text: 'date,symbol,open,high,low,close,volume\n2024-01-02,AAA,1,2,1,2,5\n2024-01-03,BBB,1,2,1,2,5' }))).toContain('MULTIPLE_SYMBOLS');
    expect(codes({ ...exampleDraft('gme-daily-csv'), resolution: '5m' })).toContain('DATE_ONLY_INTRADAY');
    const finer = prepare({ ...exampleDraft('lvdemo-5m-csv'), resolution: '1D' }).preview;
    expect(finer.state).toBe('blocked'); expect(finer.issues.find(issue => issue.code === 'RESOLUTION_MISMATCH')!.message).toContain('5 minutes apart');
    expect(codes({ ...exampleDraft('gme-daily-csv'), resolution: '1h' })).toContain('DATE_ONLY_INTRADAY');
  });
  it('warns, without blocking, about placeholder symbol, unknown basis, adjusted columns, milliseconds, zero volume, splits and future rows', () => {
    const plain = prepare({ ...createImportDraft(), text: 'date,open,high,low,close,volume\n2024-01-02,10,12,9,11,1000' }).preview;
    expect(plain.state).toBe('ready'); expect(plain.issues.map(issue => issue.code)).toEqual(['PLACEHOLDER_SYMBOL', 'ADJUSTMENT_UNKNOWN']);
    expect(codes(draftWith({ text: 'Date,Open,High,Low,Close,Adj Close,Volume\n2024-01-02,10,12,9,11,10.5,1000' }))).toContain('ADJUSTED_COLUMN_IGNORED');
    expect(codes(draftWith({ format: 'json', timestampUnit: 'milliseconds', text: '[{"time":3600000,"open":1,"high":2,"low":1,"close":2,"volume":1},{"time":7200000,"open":1,"high":2,"low":1,"close":2,"volume":1}]', resolution: '1h' }))).toContain('MILLISECONDS_SUSPECT');
    expect(codes(draftWith({ text: 'date,open,high,low,close,volume\n2024-01-02,10,12,9,11,0\n2024-01-03,11,12,10,11,0' }))).toContain('ZERO_VOLUME');
    const split = prepare(draftWith({ text: 'date,open,high,low,close,volume\n2024-01-02,100,102,99,100,5\n2024-01-03,50,51,49,50,9' })).preview;
    expect(split.state).toBe('ready'); expect(split.issues.find(issue => issue.code === 'LARGE_MOVES')!.message).toContain('first at 2024-01-03');
    expect(codes(draftWith({ text: 'date,open,high,low,close,volume\n2030-01-02,1,2,1,2,5' }))).toContain('FUTURE_ROWS');
    expect(codes(draftWith({ text: exampleDraft('lvdemo-5m-csv').text.replace(/SYNTHETIC EXAMPLE - not market data/g, 'mine'), symbol: 'MINE', resolution: '5m' }))).toContain('SESSION_UNKNOWN');
  });
  it('keeps synthetic labeling tied to content and reserves SYNTHETIC exchanges for it', () => {
    const edited = exampleDraft('gme-daily-csv'); edited.text = edited.text.replace('20.80', '20.85');
    const relabeled = prepare(edited);
    expect(matchExample(edited.text)).toBeNull(); expect(scanImportText(edited.text, 'csv').syntheticLabel).toBe(true);
    expect(relabeled.dataset!.provenance).toMatchObject({ fixture: true, providerName: 'Local data labeled SYNTHETIC by its content' });
    const real = { ...edited, text: edited.text.replace(/,SYNTHETIC EXAMPLE - not market data/g, ',mine'), fileName: 'gme.csv', sourceLabel: 'Broker export' };
    expect(prepare(real).preview.issues.find(issue => issue.code === 'METADATA')).toMatchObject({ field: 'exchange' });
    const accepted = prepare({ ...real, exchange: 'NYSE' }).dataset!;
    expect(accepted.provenance).toMatchObject({ fixture: false, providerName: 'Local file gme.csv; declared source: Broker export', license: 'Your own data; redistribution rights unconfirmed' });
    expect(accepted.instrument.name).toBe('Imported historical data');
  });
});

describe('source switching and persistence through the workspace model', () => {
  const imported = (id: string, patch: Partial<ImportDraft> = {}) => identifyLocalImport(prepare({ ...exampleDraft(id), ...patch }).dataset!, `test-${id}`);
  it('flags repeated imports and labels sources distinctly', () => {
    const gme = imported('gme-daily-csv');
    expect(prepareImportDraft(exampleDraft('gme-daily-csv'), { now: NOW, existing: [gme] }).preview.issues.map(issue => issue.code)).toContain('ALREADY_IMPORTED');
    const other = { ...exampleDraft('gme-daily-csv') }; other.text = other.text.replace('1500000', '1500001');
    expect(prepareImportDraft(other, { now: NOW, existing: [gme] }).preview.issues.find(issue => issue.code === 'OTHER_SOURCES')!.message).toContain('Source selector');
    expect(importSourceLabel(gme)).toBe('GME | 1D | SYNTHETIC | 2024-01-02 to 2024-01-18 | OpenCandle synthetic import example (not market data)');
    expect(importCommitMessage(gme)).toBe("Imported 12 SYNTHETIC bars for GME. Session regular (declared); adjustment raw (declared). Use the chart's Source selector to switch sources.");
    const plain = prepare(draftWith({ text: 'date,open,high,low,close,volume\n2024-01-02,10,12,9,11,1000' })).dataset!;
    expect(importCommitMessage(plain)).toContain('Session basis unknown; adjustment basis unknown.');
  });
  it('switches GME, SPY, LVDEMO and the synthetic demo, then survives a save/restore round trip', () => {
    const gme = imported('gme-daily-csv'), spy = imported('spy-daily-json'), demo = imported('lvdemo-5m-csv', { adjustment: 'unknown', session: 'extended' });
    const base = createInitialWorkspace();
    let state = patchWorkspace(ensureWorkspaceGrid(base), { imports: [gme, spy, demo], symbol: 'GME', sourceId: gme.provenance.datasetId });
    expect(selectedDataset(state)).toBe(gme);
    state = patchWorkspace(state, { symbol: 'SPY', sourceId: suppliedSourceId(state, spy) });
    expect(selectedDataset(state).bars.at(-1)!.close).toBe(100.8);
    state = patchWorkspace(state, { symbol: 'LVDEMO', sourceId: demo.provenance.datasetId });
    expect(selectedDataset(state).provenance).toMatchObject({ session: 'extended', adjustment: 'unknown', fixture: true });
    state = patchWorkspace(state, { symbol: 'GME', sourceId: null });
    expect(selectedDataset(state).provenance.providerId).not.toBe('local-import');
    state = patchWorkspace(state, { symbol: 'GME', sourceId: gme.provenance.datasetId });
    const restored = restoreWorkspace(JSON.parse(JSON.stringify(state)), createInitialWorkspace());
    expect(restored.imports).toEqual([gme, spy, demo]); expect(restored.sourceId).toBe(gme.provenance.datasetId);
    expect(selectedDataset(restored as never)).toEqual(gme);
    expect(() => restoreWorkspace({ ...JSON.parse(JSON.stringify(state)), imports: [spy, demo] }, createInitialWorkspace())).toThrow();
  });
});

it('tool guide states supplied and unsupplied inputs for every listed tool', () => {
  expect(OHLCV_TOOL_COVERAGE.length).toBeGreaterThanOrEqual(10);
  for (const row of OHLCV_TOOL_COVERAGE) { expect(row.supplied.length).toBeGreaterThan(10); expect(row.notSupplied.length).toBeGreaterThan(10); }
  expect(OHLCV_TOOL_COVERAGE.find(row => row.tool === 'Paper trading')!.notSupplied).toContain('SYNTHETIC');
  expect(OHLCV_TOOL_COVERAGE.find(row => row.tool.startsWith('Fundamentals'))!.supplied).toContain('Nothing');
});

describe('review fixes (F1 to F3)', () => {
  const head = 'date,open,high,low,close,volume';
  it('F1: synthetic status needs the exact shipped marker on every row; free text never counts', () => {
    const real = (note: string, column = 'note') => prepare(draftWith({ exchange: 'NYSE', text: `${head},${column}
2024-01-02,10,11,9,10,100,"${note}"
2024-01-03,10,11,9,10,100,"${note}"` }));
    for (const note of ['broker export, not synthetic', 'SYNTHETIC', 'synthetic example - not market data']) expect(real(note).dataset!.provenance.fixture).toBe(false);
    expect(real('SYNTHETIC EXAMPLE - not market data', 'note').dataset!.provenance.fixture).toBe(false);
    const marked = prepare(draftWith({ exchange: 'SYNTHETIC-EXAMPLE', text: `${head},label
2024-01-02,10,11,9,10,100,SYNTHETIC EXAMPLE - not market data
2024-01-03,10,11,9,10,100,SYNTHETIC EXAMPLE - not market data` }));
    expect(marked.dataset!.provenance.fixture).toBe(true);
    const mixed = prepare(draftWith({ exchange: 'NYSE', text: `${head},label
2024-01-02,10,11,9,10,100,SYNTHETIC EXAMPLE - not market data
2024-01-03,10,11,9,10,100,mine` })).preview;
    expect(mixed.state).toBe('blocked'); expect(mixed.issues.map(issue => issue.code)).toContain('MIXED_SYNTHETIC_MARKER');
    const json = prepare(draftWith({ format: 'json', exchange: 'SYNTHETIC-EXAMPLE', text: JSON.stringify({ fixture: 'SYNTHETIC EXAMPLE - not market data', bars: [{ time: '2024-01-02', open: 10, high: 11, low: 9, close: 10, volume: 1 }] }) }));
    expect(json.dataset!.provenance.fixture).toBe(true);
    const freeJson = prepare(draftWith({ format: 'json', exchange: 'NYSE', text: JSON.stringify({ fixture: 'not synthetic', bars: [{ time: '2024-01-02', open: 10, high: 11, low: 9, close: 10, volume: 1, label: 'synthetic?' }] }) }));
    expect(freeJson.dataset!.provenance.fixture).toBe(false);
  });
  it('F1: synthetic examples cannot be relabeled under a real exchange', () => {
    const moved = prepare({ ...exampleDraft('gme-daily-csv'), exchange: 'NYSE' });
    expect(moved.dataset).toBeNull(); expect(moved.preview.issues.find(issue => issue.code === 'METADATA')).toMatchObject({ field: 'exchange' });
  });
  it('F2: Unix-second daily data read as milliseconds gets one summarized diagnosis', () => {
    // 2024-01-02..06 at UTC midnight; only 1704240000 (2024-01-03) divides by 1000.
    const text = `${head}
${[0, 1, 2, 3, 4].map(i => `${1704153600 + i * 86400},10,11,9,10,100`).join('\n')}`;
    const { preview } = prepare(draftWith({ text, timestampUnit: 'milliseconds' }));
    expect(preview.state).toBe('blocked'); expect(preview.rejectedRows).toBe(4);
    const unit = preview.issues.filter(issue => issue.code === 'TIMESTAMP_UNIT');
    expect(unit).toHaveLength(1); expect(unit[0]).toMatchObject({ row: 1, field: 'timestampUnit' });
    expect(unit[0].message).toContain('4 row(s) cannot be read as Unix milliseconds'); expect(unit[0].message).toContain('Choose Unix seconds');
    expect(preview.issues.some(issue => /select milliseconds/.test(issue.message))).toBe(false);
    const ms = `${head}
${[0, 1].map(i => `${(1704153600 + i * 86400) * 1000},10,11,9,10,100`).join('\n')}`;
    const asSeconds = prepare(draftWith({ text: ms })).preview.issues.filter(issue => issue.code === 'TIMESTAMP_UNIT');
    expect(asSeconds).toHaveLength(1); expect(asSeconds[0].message).toContain('2 row(s) cannot be read as Unix seconds'); expect(asSeconds[0].message).toContain('Choose Unix milliseconds');
    expect(prepare(draftWith({ text: ms, timestampUnit: 'milliseconds' })).dataset!.bars.map(bar => bar.time)).toEqual([1704153600, 1704240000]);
  });
  it('F3: CSV states supplied versus allowed rows, and byte limits keep distinct figures', () => {
    const text = `${head}
${[0, 1, 2].map(i => `${1704153600 + i * 86400},10,11,9,10,100`).join('\n')}`;
    expect(parseCsv(text, undefined, { maxRows: 2 }).diagnostics[0].message).toBe('Too many rows: 3 data rows supplied; the limit is 2.');
    const bytes = new TextEncoder().encode(text).length;
    expect(parseCsv(text, undefined, { maxBytes: bytes - 1 }).diagnostics[0].message).toContain(`${bytes} bytes (0 MiB) supplied, ${bytes - 1} bytes (0 MiB) allowed`);
  });
});
