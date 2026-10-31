import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedReportPanel } from '../../src/strategy-report/SavedReport';
import { CalendarDialog } from '../../src/ui/CalendarDialog';
import { createCalendarState, createSyntheticCalendarDemo } from '../../src/domain/calendar';

// Component-handler evidence only. No DOM, accessible native control, dialog or packaged app is operated.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0, writes: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  return { ...actual,
    useState: (initial: any) => { const at = hooks.cursor++; if (!(at in hooks.cells)) hooks.cells[at] = typeof initial === 'function' ? initial() : initial; return [hooks.cells[at], (value: any) => { hooks.writes++; hooks.cells[at] = typeof value === 'function' ? value(hooks.cells[at]) : value; }]; },
    useRef: (initial: any) => { const at = hooks.cursor++; if (!(at in hooks.cells)) hooks.cells[at] = { current: initial }; return hooks.cells[at]; },
    useMemo: (fn: () => unknown) => fn(),
    useEffect: (fn: () => void | (() => void), deps: unknown[] = []) => { const at = hooks.cursor++, old = hooks.cells[at]; if (!old || deps.length !== old.deps.length || deps.some((value, index) => !Object.is(value, old.deps[index]))) { old?.cleanup?.(); hooks.cells[at] = { deps, cleanup: fn() }; } },
  };
});
const text = (node: any): string => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
function nodes(tree: any, predicate: (node: any) => boolean): any[] { const found: any[] = []; const walk = (node: any) => { if (Array.isArray(node)) node.forEach(walk); else if (node?.props) { if (predicate(node)) found.push(node); walk(node.props.children); } }; walk(tree); return found; }
const unmount = () => { for (const cell of hooks.cells) if (cell && typeof cell.cleanup === 'function') { cell.cleanup(); cell.cleanup = undefined; } };
function mount(renderComponent: () => any) {
  const render = () => { hooks.cursor = 0; return renderComponent(); };
  const find = (predicate: (node: any) => boolean) => { const node = nodes(render(), predicate)[0]; if (!node) throw new Error('Missing synthetic handler target'); return node; };
  const button = (label: string) => find(node => node.type === 'button' && text(node) === label);
  const field = (label: string) => find(node => node.props['aria-label'] === label);
  return { render, find, button, field, body: () => text(render()), alert: () => nodes(render(), node => node.props.role === 'alert').map(text).join(' '),
    click: (label: string) => { const node = button(label); expect(node.props.disabled).not.toBe(true); node.props.onClick(); },
    change: (label: string, value: string) => field(label).props.onChange({ target: { value } }),
  };
}
function deferred() { let resolve!: (value: any) => void, reject!: (cause: unknown) => void; const promise = new Promise<any>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const settle = async () => { for (let index = 0; index < 5; index++) await Promise.resolve(); };
const savedText = readFileSync('tests/fixtures/strategy-report-baseline-4519.json', 'utf8');
const reportResponse = (value = savedText) => ({ ok: true, value: { kind: 'strategy-report', fileName: 'SYNTHETIC-report.json', format: 'json', text: value, bytes: Buffer.byteLength(value) } });
const cancelled = { ok: false, error: { code: 'CANCELLED', message: 'Import cancelled.' } };
const failed = { ok: false, error: { code: 'FILE_TOO_LARGE', message: 'Import limit is 20 MiB.' } };
let choose: ReturnType<typeof vi.fn>, exportData: ReturnType<typeof vi.fn>;
beforeEach(() => { hooks.cells = []; hooks.cursor = 0; hooks.writes = 0; choose = vi.fn(); exportData = vi.fn(); vi.useFakeTimers(); vi.stubGlobal('window', { lv: { importData: choose, exportData } }); });
afterEach(() => { unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function savedPanel() { const load = vi.fn(); return { ...mount(() => SavedReportPanel({ side: 'all', current: null, onLoadProperties: load })), load }; }
function seedVerified(ui: ReturnType<typeof savedPanel>) { ui.change('Saved strategy report JSON', savedText); ui.click('Verify saved report'); expect(ui.body()).toContain('Saved execution'); }

describe('saved report native chooser, current and stale responses', () => {
  it('loads and verifies a selected local report without applying properties or starting a strategy', async () => {
    choose.mockResolvedValueOnce(reportResponse()); const ui = savedPanel(); ui.click('Open saved report file');
    expect(choose).toHaveBeenCalledExactlyOnceWith({ kind: 'strategy-report' }); expect(ui.button('Choosing report file...').props.disabled).toBe(true);
    await settle(); expect(ui.field('Saved strategy report JSON').props.value).toBe(savedText); expect(ui.body()).toContain('Saved execution'); expect(ui.alert()).toBe(''); expect(ui.load).not.toHaveBeenCalled();
  });
  it('keeps the previously verified report on native cancellation', async () => {
    const d = deferred(); choose.mockReturnValueOnce(d.promise); const ui = savedPanel(); seedVerified(ui); ui.click('Open saved report file'); d.resolve(cancelled); await settle();
    expect(ui.field('Saved strategy report JSON').props.value).toBe(savedText); expect(ui.body()).toContain('Saved execution'); expect(ui.alert()).toBe(''); expect(ui.button('Open saved report file').props.disabled).toBe(false);
  });
  it('shows a native error without relabeling the previously verified report', async () => {
    choose.mockResolvedValueOnce(failed); const ui = savedPanel(); seedVerified(ui); ui.click('Open saved report file'); await settle();
    expect(ui.alert()).toBe('Import limit is 20 MiB.'); expect(ui.body()).toContain('Saved execution'); expect(ui.field('Saved strategy report JSON').props.value).toBe(savedText);
  });
  it('shows a rejected picker error and returns to an enabled chooser', async () => {
    choose.mockRejectedValueOnce(new Error('Synthetic picker unavailable')); const ui = savedPanel(); ui.click('Open saved report file'); await settle();
    expect(ui.alert()).toBe('Synthetic picker unavailable'); expect(ui.button('Open saved report file').props.disabled).toBe(false); expect(ui.load).not.toHaveBeenCalled();
  });
  it('clears a prior verified result when the selected file cannot be parsed', async () => {
    choose.mockResolvedValueOnce(reportResponse('{invalid')); const ui = savedPanel(); seedVerified(ui); ui.click('Open saved report file'); await settle();
    expect(ui.field('Saved strategy report JSON').props.value).toBe('{invalid'); expect(ui.body()).not.toContain('Saved execution'); expect(ui.alert()).toMatch(/not valid JSON/);
  });
  it.each(['success', 'failure'] as const)('ignores a late %s after a user paste', async outcome => {
    const d = deferred(); choose.mockReturnValueOnce(d.promise); const ui = savedPanel(); ui.click('Open saved report file'); ui.change('Saved strategy report JSON', 'SYNTHETIC user replacement');
    d.resolve(outcome === 'success' ? reportResponse() : failed); await settle(); expect(ui.field('Saved strategy report JSON').props.value).toBe('SYNTHETIC user replacement'); expect(ui.alert()).toBe(''); expect(ui.body()).not.toContain('Saved execution');
  });
  it('ignores a native result after Clear while the chooser is pending', async () => {
    const d = deferred(); choose.mockReturnValueOnce(d.promise); const ui = savedPanel(); ui.click('Open saved report file'); ui.click('Clear saved report'); d.resolve(reportResponse()); await settle();
    expect(ui.field('Saved strategy report JSON').props.value).toBe(''); expect(ui.body()).not.toContain('Saved execution'); expect(ui.button('Verify saved report').props.disabled).toBe(true);
  });
  it.each(['success', 'rejection'] as const)('does not write state after unmount on picker %s', async outcome => {
    const d = deferred(); choose.mockReturnValueOnce(d.promise); const ui = savedPanel(); ui.click('Open saved report file'); unmount(); const writes = hooks.writes;
    if (outcome === 'success') d.resolve(reportResponse()); else d.reject(new Error('Synthetic late error')); await settle(); expect(hooks.writes).toBe(writes); expect(ui.load).not.toHaveBeenCalled();
  });
  it('does not dispatch a retained report-picker callback after unmount', () => {
    const ui = savedPanel(), callback = ui.button('Open saved report file').props.onClick; unmount(); const writes = hooks.writes;
    callback(); expect(choose).not.toHaveBeenCalled(); expect(hooks.writes).toBe(writes);
  });
  it('keeps a newer chosen result when an older invalidated picker resolves afterward', async () => {
    const first = deferred(), second = deferred(); choose.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); const ui = savedPanel();
    ui.click('Open saved report file'); ui.change('Saved strategy report JSON', 'Synthetic replacement'); ui.click('Open saved report file'); second.resolve(reportResponse()); await settle(); first.resolve(reportResponse('{old-invalid')); await settle();
    expect(ui.field('Saved strategy report JSON').props.value).toBe(savedText); expect(ui.body()).toContain('Saved execution'); expect(ui.alert()).toBe('');
  });
  it('explains desktop absence without blocking pasted JSON verification', () => {
    vi.stubGlobal('window', {}); const ui = savedPanel(); ui.click('Open saved report file'); expect(ui.alert()).toContain('desktop app'); seedVerified(ui); expect(ui.alert()).toBe('');
  });
});

const NOW = Date.parse('2026-06-10T12:00:00Z') / 1000;
const calendarCsv = 'id,kind,title,date\r\nsynthetic-native,economic,Synthetic native event,2026-06-10\r\n';
const calendarResponse = { ok: true, value: { kind: 'calendar', fileName: 'SYNTHETIC-events.csv', format: 'csv', text: calendarCsv, bytes: Buffer.byteLength(calendarCsv) } };
function calendarPanel(demo = false) {
  const state = createCalendarState(); if (demo) state.documents = [createSyntheticCalendarDemo(NOW)];
  const change = vi.fn((_state: ReturnType<typeof createCalendarState>) => true), close = vi.fn();
  return { ...mount(() => CalendarDialog({ state, onChange: change, onClose: close, now: NOW, initialKind: 'economic' })), onChange: change, close };
}
function markSynthetic(ui: ReturnType<typeof calendarPanel>) {
  const label = ui.find(node => node.type === 'label' && text(node).includes('Example data (not real events)'));
  nodes(label, node => node.type === 'input')[0].props.onChange({ target: { checked: true } });
}

describe('calendar native CSV and ICS workflows through real handlers', () => {
  it('previews native CSV using its returned format and saves only after Add then Apply', async () => {
    choose.mockResolvedValueOnce(calendarResponse); const ui = calendarPanel(); markSynthetic(ui); ui.click('Choose calendar file'); await settle();
    expect(choose).toHaveBeenCalledExactlyOnceWith({ kind: 'calendar' }); expect(ui.field('Calendar import format').props.value).toBe('csv'); expect(ui.body()).toContain('SYNTHETIC-events.csv: preview ready'); expect(ui.onChange).not.toHaveBeenCalled();
    ui.click('Add preview to draft'); expect(ui.body()).toContain('Synthetic native event'); expect(ui.onChange).not.toHaveBeenCalled(); ui.click('Apply');
    expect(ui.onChange).toHaveBeenCalledOnce(); expect(ui.onChange.mock.calls[0][0].documents[0].provenance.fixture).toBe(true); expect(ui.onChange.mock.calls[0][0].documents[0].events[0].title).toBe('Synthetic native event');
  });
  it('invalidates a late native result when import text is edited', async () => {
    const d = deferred(); choose.mockReturnValueOnce(d.promise); const ui = calendarPanel(); ui.click('Choose calendar file'); ui.change('Calendar import text', 'Synthetic newer paste'); d.resolve(calendarResponse); await settle();
    expect(ui.field('Calendar import text').props.value).toBe('Synthetic newer paste'); expect(ui.body()).not.toContain('SYNTHETIC-events.csv: preview ready'); expect(ui.onChange).not.toHaveBeenCalled();
  });
  it.each(['success', 'failure'] as const)('invalidates a late chooser %s after Revert to saved', async outcome => {
    const d = deferred(); choose.mockReturnValueOnce(d.promise); const ui = calendarPanel(); ui.click('Preview synthetic demo events'); ui.click('Add preview to draft');
    ui.click('Choose calendar file'); ui.click('Revert to saved'); d.resolve(outcome === 'success' ? calendarResponse : failed); await settle();
    expect(ui.body()).toContain('Draft reverted to the saved calendar. Nothing was saved.'); expect(ui.body()).not.toContain('Add preview to draft'); expect(ui.alert()).toBe(''); expect(ui.button('Choose calendar file').props.disabled).toBe(false); expect(ui.onChange).not.toHaveBeenCalled();
  });
  it('cancels the native chooser without applying calendar changes', async () => {
    choose.mockResolvedValueOnce(cancelled); const ui = calendarPanel(); ui.click('Choose calendar file'); await settle(); expect(ui.body()).toContain('Import cancelled. The calendar draft is unchanged.'); expect(ui.onChange).not.toHaveBeenCalled(); expect(ui.alert()).toBe('');
  });
  it('does not publish a native result after dialog Cancel', async () => {
    const d = deferred(); choose.mockReturnValueOnce(d.promise); const ui = calendarPanel(); ui.click('Choose calendar file'); ui.click('Cancel'); const writes = hooks.writes; d.resolve(calendarResponse); await settle(); expect(hooks.writes).toBe(writes); expect(ui.close).toHaveBeenCalledOnce(); expect(ui.onChange).not.toHaveBeenCalled();
  });
  it('does not dispatch a retained calendar-picker callback after unmount', () => {
    const ui = calendarPanel(), callback = ui.button('Choose calendar file').props.onClick; unmount(); const writes = hooks.writes;
    callback(); expect(choose).not.toHaveBeenCalled(); expect(hooks.writes).toBe(writes);
  });
  it('exports the selected event as an actual .ics file through the bridge', async () => {
    exportData.mockResolvedValueOnce({ ok: true, value: { fileName: 'OpenCandle-calendar-event.ics', bytes: 1 } }); const ui = calendarPanel(true);
    ui.click('Synthetic demo: consumer price index (invented)'); ui.click('Add to calendar (iCalendar text)'); ui.click('Save iCalendar text file'); await settle();
    expect(exportData).toHaveBeenCalledWith({ text: expect.stringContaining('BEGIN:VCALENDAR'), suggestedName: 'OpenCandle-calendar-event.ics', format: 'ics' }); expect(ui.body()).toContain('iCalendar file saved locally. Nothing was sent anywhere.'); expect(ui.body()).not.toContain('rename it to .ics'); expect(ui.onChange).not.toHaveBeenCalled();
  });
  it('never claims an ICS save succeeded when native export was cancelled', async () => {
    exportData.mockResolvedValueOnce(cancelled); const ui = calendarPanel(true); ui.click('Synthetic demo: consumer price index (invented)'); ui.click('Add to calendar (iCalendar text)'); ui.click('Save iCalendar text file'); await settle();
    expect(ui.body()).not.toContain('iCalendar file saved locally.'); expect(ui.alert()).toBe(''); expect(ui.onChange).not.toHaveBeenCalled();
  });
});
