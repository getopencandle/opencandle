// Independent review tests for data import (, coverage and first use).
// Written by the reviewer, not the builder. Expected values are derived by hand from the
// Unix epoch (2024-01-01T00:00Z = 1704067200, one day = 86400 s), not read back from the code.
// Re-review: the four former CHARACTERIZATION tests (F1, F2, F3, F5) were inverted into assertions
// of the fixed behavior, and F1 gained adversarial marker cases.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { parseCsv, parseJson } from '../../src/domain/data';
import { createImportDraft, exampleDraft, IMPORT_EXAMPLES, prepareImportDraft, type ImportDraft } from '../../src/domain/data-setup';
import type { BarDataset } from '../../src/domain/types';

const require = createRequire(import.meta.url);
// Controlled hook stand-ins (same technique as tests/ui/import-dialog.test.ts); no DOM, no native dialogs.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return { ...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,
    useState: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[i], (next: any) => { hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next; }]; },
    useRef: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = { current: initial }; return hooks.cells[i]; },
    useEffect: () => { hooks.cursor++; }, useMemo: (fn: () => any) => { hooks.cursor++; return fn(); } };
});
const NOW = 1792022400; // 2026-10-15T00:00:00Z
const DAY = 86400, JAN2 = 1704067200 + DAY; // 2024-01-02T00:00:00Z
const head = 'time,open,high,low,close,volume';
const draft = (patch: Partial<ImportDraft>): ImportDraft => ({ ...createImportDraft(), symbol: 'TEST', ...patch });
const prepare = (value: ImportDraft) => prepareImportDraft(value, { now: NOW, existing: [] });
const codes = (value: ImportDraft) => prepare(value).preview.issues.map(issue => issue.code);
const row = (time: number | string, close = 10, volume: number | string = 100) => `${time},${close},${close + 1},${close - 1},${close},${volume}`;

describe('parser tightening (data.ts numberField) is limited to radix-prefixed strings', () => {
  // Differential run against ..\base on 27 inputs: only 0x/0X/0b/0o strings changed from accepted to rejected.
  it('rejects hex, binary and octal strings in CSV and JSON', () => {
    for (const value of ['0x10', '0X1A', '0b11', '0o7']) {
      expect(parseCsv(`${head}\n${row(JAN2, 10, value)}`).ok).toBe(false);
      expect(parseJson(JSON.stringify([{ time: JAN2, open: 10, high: 11, low: 9, close: 10, volume: value }])).ok).toBe(false);
    }
  });
  it('still accepts every plain decimal spelling the baseline accepted', () => {
    const cases: [string, number][] = [[' 10 ', 10], ['1e3', 1000], ['1E-2', 0.01], ['.5', 0.5], ['5.', 5], ['+5', 5], ['0010', 10], [' 10', 10], ['\t12\t', 12]];
    for (const [value, expected] of cases) {
      const csv = parseCsv(`${head}\n${JAN2},10,11,9,10,"${value}"`);
      expect(csv.ok, value).toBe(true); expect(csv.bars[0].volume).toBe(expected);
      const json = parseJson(JSON.stringify([{ time: JAN2, open: 10, high: 11, low: 9, close: 10, volume: value }]));
      expect(json.ok, value).toBe(true); expect(json.bars[0].volume).toBe(expected);
    }
  });
  it('JSON numeric values are not subject to the string rule', () => {
    expect(parseJson(JSON.stringify([{ time: JAN2, open: 1e1, high: 11, low: 9, close: 10, volume: 0x10 }])).bars[0].volume).toBe(16);
  });
});

describe('out-of-order and duplicate diagnostics carry original data rows', () => {
  const descending = (count: number) => `${head}\n${Array.from({ length: count }, (_, i) => row(JAN2 + (count - 1 - i) * DAY)).join('\n')}`;
  it('counts backwards rows exactly up to 20 and caps the count above that', () => {
    // 21 descending rows: rows 2..21 are each earlier than their predecessor = 20 rows.
    const twenty = parseCsv(descending(21));
    expect(twenty.diagnostics.find(d => d.code === 'SORTED')!.message).toContain('20 row(s) earlier than the row before them, first at data row 2');
    // 22 descending rows: 21 backwards rows, reported as "More than 20".
    const capped = parseCsv(descending(22));
    expect(capped.diagnostics.find(d => d.code === 'SORTED')!.message).toContain('More than 20 row(s)');
    expect(capped.bars.map(bar => bar.time)).toEqual(Array.from({ length: 22 }, (_, i) => JAN2 + i * DAY));
    const rejected = parseCsv(descending(22), undefined, { sort: false });
    expect(rejected.ok).toBe(false); expect(rejected.dataset).toBeUndefined();
    expect(rejected.diagnostics.find(d => d.code === 'OUT_OF_ORDER')).toMatchObject({ severity: 'error', row: 2 });
  });
  it('after sorting, a duplicate is attributed to the later input row and keep-last keeps the later input', () => {
    const t1 = JAN2, t2 = JAN2 + DAY;
    // data rows: 1 = t2 (close 10), 2 = t1, 3 = t2 again
    const identical = parseCsv(`${head}\n${row(t2)}\n${row(t1)}\n${row(t2)}`);
    expect(identical.ok).toBe(true); expect(identical.bars.map(bar => bar.time)).toEqual([t1, t2]);
    expect(identical.diagnostics.find(d => d.code === 'DUPLICATE_REMOVED')).toMatchObject({ row: 3 });
    expect(identical.diagnostics.find(d => d.code === 'DUPLICATE_REMOVED')!.message).toContain('2024-01-03T00:00:00Z');
    const corrected = `${head}\n${row(t2)}\n${row(t1)}\n${row(t2, 20, 300)}`;
    const kept = parseCsv(corrected, undefined, { duplicatePolicy: 'keep-last' });
    expect(kept.bars[1]).toEqual({ time: t2, open: 20, high: 21, low: 19, close: 20, volume: 300 });
    expect(kept.diagnostics.find(d => d.code === 'DUPLICATE_REPLACED')).toMatchObject({ row: 3, severity: 'warning' });
    const conflict = parseCsv(corrected);
    expect(conflict.ok).toBe(false); expect(conflict.diagnostics.find(d => d.code === 'CONFLICTING_DUPLICATE')).toMatchObject({ row: 3 });
    const strict = parseCsv(`${head}\n${row(t1)}\n${row(t1)}`, undefined, { duplicatePolicy: 'reject' });
    expect(strict.ok).toBe(false); expect(strict.diagnostics[0].message).toContain('rejected by the selected duplicate policy');
  });
  it('invalid rows do not shift the reported row numbers of later rows', () => {
    const result = parseCsv(`${head}\n${row(JAN2 + DAY)}\n${JAN2},1,0.5,1,1,1\n${row(JAN2)}`);
    expect(result.diagnostics.map(d => [d.code, d.row])).toEqual([['INVALID_ROW', 2], ['SORTED', 3]]);
  });
});

describe('time zones and time units', () => {
  it('converts explicit offsets to UTC seconds and rejects zone-less timestamps', () => {
    // 09:30 at -05:00 is 14:30Z: JAN2 + 14.5 h. 09:30 at +05:30 is 04:00Z: JAN2 + 4 h.
    expect(parseCsv(`${head}\n${row('2024-01-02T09:30:00-05:00')}`).bars[0].time).toBe(JAN2 + 52200);
    expect(parseCsv(`${head}\n${row('2024-01-02T09:30:00+05:30')}`).bars[0].time).toBe(JAN2 + 14400);
    expect(parseCsv(`${head}\n${row('2024-01-02T09:30:00')}`).ok).toBe(false);
    expect(parseCsv(`${head}\n${row('2024-01-02 09:30:00Z')}`).ok).toBe(false);
  });
  it('the LVDEMO example lands on 09:30 New York time in January (UTC-5)', () => {
    const bars = prepare(exampleDraft('lvdemo-5m-csv')).dataset!.bars;
    expect(bars[0].time).toBe(JAN2 + 14 * 3600 + 30 * 60); expect(bars[11].time - bars[0].time).toBe(11 * 300);
  });
  it('millisecond input in seconds mode is refused and names milliseconds; the same values in ms mode import exactly', () => {
    const ms = `${head}\n${row(JAN2 * 1000)}\n${row((JAN2 + DAY) * 1000)}`;
    const wrong = parseCsv(ms); expect(wrong.ok).toBe(false); expect(wrong.diagnostics[0].message).toContain('milliseconds');
    expect(parseCsv(ms, undefined, { timestampUnit: 'milliseconds' }).bars.map(bar => bar.time)).toEqual([JAN2, JAN2 + DAY]);
  });
  it('F2 fixed: daily Unix-second data read as milliseconds yields one TIMESTAMP_UNIT diagnosis naming the right unit', () => {
    // Midnight timestamps are 86400*k; only k divisible by 5 are also divisible by 1000.
    // JAN2 is day 19724, so of days 19724..19728 only 19725 (data row 2) parses; rows 1, 3, 4, 5 fail.
    const text = `${head}\n${[0, 1, 2, 3, 4].map(i => row(JAN2 + i * DAY)).join('\n')}`;
    const { preview } = prepare(draft({ text, timestampUnit: 'milliseconds' }));
    expect(preview.state).toBe('blocked'); expect(preview.rejectedRows).toBe(4);
    const unit = preview.issues.filter(issue => issue.code === 'TIMESTAMP_UNIT');
    expect(unit).toHaveLength(1); expect(unit[0]).toMatchObject({ severity: 'error', row: 1, field: 'timestampUnit' });
    expect(unit[0].message).toContain('4 row(s) cannot be read as Unix milliseconds'); expect(unit[0].message).toContain('Choose Unix seconds');
    expect(preview.issues.some(issue => /select milliseconds/.test(issue.message))).toBe(false);
    const reverse = prepare(draft({ text: `${head}\n${row(JAN2 * 1000)}\n${row((JAN2 + DAY) * 1000)}` })).preview;
    expect(reverse.issues.find(issue => issue.code === 'TIMESTAMP_UNIT')!.message).toContain('Choose Unix milliseconds');
  });
});

describe('resolution checks', () => {
  const dates = (list: string[]) => `${head}\n${list.map(date => row(date)).join('\n')}`;
  it('weekly rows declared 1D warn (7 days > 4x), daily rows declared 1W block, monthly rows fit 1M', () => {
    const weekly = dates(['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-22']);
    const sparse = prepare(draft({ text: weekly, resolution: '1D' }));
    expect(sparse.dataset).not.toBeNull(); expect(sparse.preview.issues.map(i => i.code)).toContain('RESOLUTION_SPARSE');
    expect(codes(draft({ text: weekly, resolution: '1W' }))).not.toContain('RESOLUTION_SPARSE');
    expect(codes(draft({ text: dates(['2024-01-02', '2024-01-03', '2024-01-04']), resolution: '1W' }))).toContain('RESOLUTION_MISMATCH');
    const monthly = prepare(draft({ text: dates(['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01']), resolution: '1M' }));
    expect(monthly.dataset).not.toBeNull(); expect(monthly.preview.issues.map(i => i.code).filter(c => c.startsWith('RESOLUTION'))).toEqual([]);
  });
  it('numeric UTC-midnight timestamps declared intraday are treated as date-only and blocked', () => {
    expect(codes(draft({ text: `${head}\n${row(JAN2)}\n${row(JAN2 + DAY)}`, resolution: '1h' }))).toContain('DATE_ONLY_INTRADAY');
  });
});

describe('unknowns are never converted to zero and nothing is invented', () => {
  it('missing or absent volume blocks the import; explicit zero volume is kept and warned', () => {
    expect(prepare(draft({ text: 'date,open,high,low,close\n2024-01-02,10,11,9,10' })).dataset).toBeNull();
    expect(prepare(draft({ text: `${head}\n${JAN2},10,11,9,10,` })).dataset).toBeNull();
    expect(prepare(draft({ text: JSON.stringify([{ time: JAN2, open: 10, high: 11, low: 9, close: 10, volume: null }]), format: 'json' })).dataset).toBeNull();
    const zero = prepare(draft({ text: `${head}\n${row(JAN2, 10, 0)}\n${row(JAN2 + DAY, 10, 0)}` }));
    expect(zero.dataset!.bars.map(bar => bar.volume)).toEqual([0, 0]); expect(zero.preview.issues.map(i => i.code)).toContain('ZERO_VOLUME');
  });
  it('a gap stays a gap: no bar is synthesized between 2024-01-02 and 2024-01-09', () => {
    const { dataset, preview } = prepare(draft({ text: `${head}\n${row(JAN2)}\n${row(JAN2 + DAY)}\n${row(JAN2 + 8 * DAY)}` }));
    expect(dataset!.bars).toHaveLength(3); expect(preview.largestGap).toContain('7 days between 2024-01-03 and 2024-01-10');
  });
  it('undeclared basis stays unknown in provenance', () => {
    const dataset = prepare(draft({ text: `${head}\n${row(JAN2)}` })).dataset!;
    expect(dataset.provenance).toMatchObject({ adjustment: 'unknown', session: 'unknown', fixture: false, delaySeconds: null });
  });
});

describe('synthetic examples and labeling', () => {
  it('every example row is labeled SYNTHETIC, dated January 2024, and ready examples import as fixtures with a not-market-data name', () => {
    for (const example of IMPORT_EXAMPLES) {
      const lines = example.draft.text.trim().split('\n');
      if (example.draft.format === 'csv') for (const line of lines.slice(1)) { expect(line).toMatch(/SYNTHETIC/); expect(line).toMatch(/^2024-0[12]-/); }
      const prepared = prepare(exampleDraft(example.id));
      expect(prepared.preview.synthetic).toBe(true);
      if (example.expectValid) {
        const dataset = prepared.dataset!;
        expect(dataset.provenance.fixture).toBe(true); expect(dataset.instrument.exchange).toBe('SYNTHETIC-EXAMPLE');
        expect(dataset.instrument.name).toContain('not market data'); expect(dataset.provenance.license).toContain('not market data');
        for (const bar of dataset.bars) expect(bar.time).toBeGreaterThanOrEqual(1704067200), expect(bar.time).toBeLessThan(1706745600);
      }
    }
  });
  it('the real desktop export validator accepts every example for "Save example file"', () => {
    const { dataExportInput } = require('../../electron/validation.cjs');
    for (const example of IMPORT_EXAMPLES) expect(() => dataExportInput({ text: example.draft.text, suggestedName: example.fileName, format: example.draft.format })).not.toThrow();
  });
  const MARK = 'SYNTHETIC EXAMPLE - not market data';
  const labeled = (labels: string[], extra = 'label') => `date,open,high,low,close,volume,${extra}\n${labels.map((label, i) => `${new Date((JAN2 + i * DAY) * 1000).toISOString().slice(0, 10)},10,11,9,10,100,"${label}"`).join('\n')}`;
  const outcome = (value: ImportDraft) => { const { preview, dataset } = prepare(value); return { synthetic: preview.synthetic, fixture: dataset?.provenance.fixture ?? null, codes: preview.issues.map(issue => issue.code), exchange: dataset?.instrument.exchange ?? null }; };
  it('F1 fixed: free text, negations and look-alike markers never make user data synthetic', () => {
    const cases: [string[], string][] = [[['broker export, not synthetic'], 'note'], [[MARK, MARK], 'note'], [[MARK, MARK], 'source'], [[`${MARK} (copy)`, `${MARK} (copy)`], 'label'], [[MARK.toLowerCase(), MARK.toLowerCase()], 'label'], [['SYNTHETIC', 'SYNTHETIC'], 'label']];
    for (const [labels, extra] of cases) {
      const result = outcome(draft({ text: labeled(labels, extra), exchange: 'NYSE' }));
      expect(result, `${extra}: ${labels[0]}`).toMatchObject({ synthetic: false, fixture: false, exchange: 'NYSE' });
      expect(result.codes).not.toContain('MIXED_SYNTHETIC_MARKER');
    }
  });
  it('F1 fixed: a partly marked file (real rows mixed with example rows) is blocked, in CSV and JSON', () => {
    expect(outcome(draft({ text: labeled([MARK, 'my broker row', MARK]), exchange: 'SYNTHETIC-EXAMPLE' }))).toMatchObject({ fixture: null });
    expect(codes(draft({ text: labeled([MARK, 'my broker row', MARK]) }))).toContain('MIXED_SYNTHETIC_MARKER');
    expect(codes(draft({ text: labeled([MARK, '', MARK]) }))).toContain('MIXED_SYNTHETIC_MARKER');
    const bars = [0, 1].map(i => ({ time: JAN2 + i * DAY, open: 10, high: 11, low: 9, close: 10, volume: 1 }));
    const json = (value: unknown) => draft({ format: 'json', text: JSON.stringify(value), exchange: 'SYNTHETIC-EXAMPLE' });
    expect(codes(json({ fixture: MARK, bars: [{ ...bars[0], label: MARK }, bars[1]] }))).toContain('MIXED_SYNTHETIC_MARKER');
    expect(codes(json([{ ...bars[0], label: MARK }, bars[1]]))).toContain('MIXED_SYNTHETIC_MARKER');
    // Free-text container value: not synthetic, so the reserved exchange blocks the import.
    expect(outcome(json({ fixture: 'SYNTHETIC', bars }))).toMatchObject({ synthetic: false, fixture: null });
  });
  it('F1 fixed: a fully marked file is synthetic only under the SYNTHETIC-EXAMPLE exchange; a real exchange is refused', () => {
    expect(outcome(draft({ text: labeled([MARK, MARK]), exchange: 'NYSE' }))).toMatchObject({ synthetic: true, fixture: null });
    expect(prepare(draft({ text: labeled([MARK, MARK]), exchange: 'NYSE' })).preview.issues.find(issue => issue.code === 'METADATA')).toMatchObject({ field: 'exchange' });
    expect(outcome(draft({ text: labeled([MARK, MARK]), exchange: 'SYNTHETIC-EXAMPLE' }))).toMatchObject({ synthetic: true, fixture: true, exchange: 'SYNTHETIC-EXAMPLE' });
    const bars = [0, 1].map(i => ({ time: JAN2 + i * DAY, open: 10, high: 11, low: 9, close: 10, volume: 1 }));
    expect(outcome(draft({ format: 'json', text: JSON.stringify({ fixture: MARK, bars }), exchange: 'SYNTHETIC-EXAMPLE' }))).toMatchObject({ fixture: true });
    expect(outcome(draft({ format: 'json', text: JSON.stringify(bars.map(bar => ({ ...bar, label: MARK }))), exchange: 'SYNTHETIC-EXAMPLE' }))).toMatchObject({ fixture: true });
  });
  it('F1: a real and a synthetic import of the same symbol keep separate fixture flags; App gates virtual quotes on that boolean alone', async () => {
    const real = prepare(draft({ symbol: 'GME', exchange: 'NYSE', text: labeled(['broker', 'broker']) })).dataset!;
    const synthetic = prepareImportDraft(exampleDraft('gme-daily-csv'), { now: NOW, existing: [real] });
    expect(real.provenance.fixture).toBe(false); expect(synthetic.dataset!.provenance.fixture).toBe(true);
    expect(synthetic.preview.issues.map(issue => issue.code)).toContain('OTHER_SOURCES');
    const { readFileSync } = await import('node:fs');
    const app = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8');
    // The virtual quote now comes from the paper bar feed (src/domain/paper-bar-feed.ts), which keys the synthetic spread,
    // cent rounding and session on provenance.fixture alone; App reads the feed's quote for the chart instrument.
    expect(app).toContain('const virtualQuote=(replay?replayPaper:paper)?.quotes[dataset.instrument.id]??null;');
    const feed = readFileSync(new URL('../../src/domain/paper-bar-feed.ts', import.meta.url), 'utf8');
    expect(feed).toContain("const halfSpreadOf = (provenance: PaperBarFeedInput['provenance']) => provenance.fixture ? 0.01 : 0;");
    expect(feed).toContain('fixture: input.provenance.fixture');
  });
});

describe('limits state their numbers', () => {
  it('JSON row limit names supplied and allowed rows', () => {
    const rows = [0, 1, 2].map(i => ({ time: JAN2 + i * DAY, open: 10, high: 11, low: 9, close: 10, volume: 1 }));
    expect(parseJson(JSON.stringify(rows), undefined, { maxRows: 2 }).diagnostics[0].message).toBe('Too many rows: 3 data rows supplied; the limit is 2.');
  });
  it('F3 fixed: CSV row limit names supplied and allowed rows; byte limits give exact, distinguishable byte counts', () => {
    const text = `${head}\n${[0, 1, 2].map(i => row(JAN2 + i * DAY)).join('\n')}`;
    expect(parseCsv(text, undefined, { maxRows: 2 }).diagnostics[0].message).toBe('Too many rows: 3 data rows supplied; the limit is 2.');
    expect(parseCsv(text, undefined, { maxRows: 3 }).ok).toBe(true);
    const small = parseCsv('x'.repeat(17), undefined, { maxBytes: 16 }).diagnostics[0].message;
    expect(small).toContain('17 bytes'); expect(small).toContain('16 bytes'); expect(small).not.toContain('0.000 MiB');
    const big = parseCsv('x'.repeat(20 * 1024 * 1024 + 1)).diagnostics[0].message; // 20 MiB = 20,971,520 bytes
    expect(big).toContain('20,971,521 bytes'); expect(big).toContain('20,971,520 bytes');
  });
});

describe('ImportDialog stale and concurrent picker results', () => {
  const text = (node: any): string => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const find = (tree: any, predicate: (node: any) => boolean): any => { if (Array.isArray(tree)) { for (const child of tree) { const found = find(child, predicate); if (found) return found; } } else if (tree?.props) { if (predicate(tree)) return tree; return find(tree.props.children, predicate); } return null; };
  async function mount() {
    const { ImportDialog } = await import('../../src/ui/ImportDialog');
    const onImport = vi.fn((_: BarDataset) => true), onClose = vi.fn();
    const render = () => { hooks.cursor = 0; return ImportDialog({ onImport, onClose, now: NOW }); };
    return { onImport, onClose, render, view: () => text(render()),
      button: (label: string) => find(render(), node => node.type === 'button' && text(node) === label),
      textarea: () => find(render(), node => node.type === 'textarea') };
  }
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const file = (name: string, body: string) => ({ ok: true, value: { fileName: name, format: 'csv', text: body, bytes: body.length } });
  beforeEach(() => { hooks.cells = []; hooks.cursor = 0; });
  afterEach(() => vi.unstubAllGlobals());

  it('when the picker is opened twice, only the latest request may change the draft', async () => {
    const pending: ((value: unknown) => void)[] = [];
    vi.stubGlobal('window', { lv: { importBars: vi.fn(() => new Promise(done => pending.push(done))) } });
    const ui = await mount();
    ui.button('Choose CSV or JSON file').props.onClick(); ui.button('Choose CSV or JSON file').props.onClick();
    const second = `date,open,high,low,close,volume\n2024-01-02,10,11,9,10,2`;
    pending[1](file('second.csv', second)); await flush();
    pending[0](file('first.csv', 'date,open,high,low,close,volume\n2024-01-02,10,11,9,10,1')); await flush();
    expect(ui.textarea().props.value).toBe(second); expect(ui.view()).toContain('Current: second.csv'); expect(ui.view()).not.toContain('first.csv');
  });
  it('a picker that throws leaves the draft and reports the failure', async () => {
    vi.stubGlobal('window', { lv: { importBars: vi.fn(async () => { throw new Error('IPC down'); }) } });
    const ui = await mount(); const pasted = `date,open,high,low,close,volume\n2024-01-02,10,11,9,10,5`;
    ui.textarea().props.onChange({ target: { value: pasted } });
    ui.button('Choose CSV or JSON file').props.onClick(); await flush();
    expect(ui.textarea().props.value).toBe(pasted); expect(ui.view()).toContain('IPC down'); expect(ui.onImport).not.toHaveBeenCalled();
  });
  it('F5 fixed: text typed while the picker is pending wins over the late file, and says so', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('window', { lv: { importBars: vi.fn(() => new Promise(done => { resolve = done; })) } });
    const ui = await mount(); const typed = `date,open,high,low,close,volume\n2024-01-02,10,11,9,10,7`, late = `date,open,high,low,close,volume\n2024-01-02,10,11,9,10,8`;
    ui.button('Choose CSV or JSON file').props.onClick(); ui.textarea().props.onChange({ target: { value: typed } }); ui.view(); // React re-renders after typing
    resolve(file('late.csv', late)); await flush();
    expect(ui.textarea().props.value).toBe(typed); expect(ui.view()).toContain('late.csv was not loaded because the data was edited');
  });
  it('F5 boundary: an edit made before the picker opened does not block the chosen file', async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal('window', { lv: { importBars: vi.fn(() => new Promise(done => { resolve = done; })) } });
    const ui = await mount(); const typed = `date,open,high,low,close,volume\n2024-01-02,10,11,9,10,7`, chosen = `date,open,high,low,close,volume\n2024-01-02,10,11,9,10,9`;
    ui.textarea().props.onChange({ target: { value: typed } }); ui.view();
    ui.button('Choose CSV or JSON file').props.onClick(); resolve(file('chosen.csv', chosen)); await flush();
    expect(ui.textarea().props.value).toBe(chosen); expect(ui.view()).toContain('Current: chosen.csv');
    ui.button('Restore previous draft').props.onClick(); expect(ui.textarea().props.value).toBe(typed);
  });
  it('a workspace that throws keeps the draft open with the thrown message', async () => {
    const ui = await mount(); ui.onImport.mockImplementation(() => { throw new Error('The local dataset limit is 1,000.'); });
    find(ui.render(), node => node.type === 'select' && node.props['aria-label'] === 'Synthetic example').props.onChange({ target: { value: 'spy-daily-json' } });
    find(ui.render(), node => node.type === 'form').props.onSubmit({ preventDefault: vi.fn() });
    expect(ui.onClose).not.toHaveBeenCalled(); expect(ui.view()).toContain('The local dataset limit is 1,000.');
    expect(ui.textarea().props.value).toBe(IMPORT_EXAMPLES.find(e => e.id === 'spy-daily-json')!.draft.text);
  });
});
