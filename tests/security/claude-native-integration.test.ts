import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { LVBridge } from '../../electron/bridge';

const require = createRequire(import.meta.url);
const validation = require('../../electron/validation.cjs');
const imports = require('../../electron/import-data.cjs');
const mainSource = readFileSync('electron/main.cjs', 'utf8');
const importSource = readFileSync('electron/import-data.cjs', 'utf8');

// Actual main-process handler registrations with in-memory OS ports. No Electron window, file write,
// network, native dialog or packaged executable is exercised. The whole main module is evaluated.
function mainFixture() {
  const handlers = new Map<string, (event: unknown, value?: unknown) => Promise<any>>();
  const frame = { url: 'lv://app/index.html' }, webContents = { mainFrame: frame }, window = { webContents };
  const dialog = {
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:\\SYNTHETIC\\input.json'] })),
    showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: 'C:\\SYNTHETIC\\output.ics' })), showErrorBox: vi.fn(),
  };
  const fs = { writeFile: vi.fn(async () => undefined) };
  const readLocalText = vi.fn(async (filename: string) => ({ fileName: path.basename(filename), format: path.extname(filename).slice(1), text: 'SYNTHETIC local content', bytes: 23 }));
  const electron = {
    app: { requestSingleInstanceLock: () => false, quit: vi.fn(), on: vi.fn(), commandLine: { appendSwitch: vi.fn() }, whenReady: () => new Promise(() => undefined) },
    protocol: { registerSchemesAsPrivileged: vi.fn() }, ipcMain: { handle: (name: string, fn: any) => handlers.set(name, fn) }, dialog,
  };
  const module = { exports: {} as any };
  runInNewContext(mainSource + '\nmodule.exports = {installIPC, setWindow(value) {mainWindow = value;}};', {
    module, __dirname: path.resolve('electron'), process: { argv: [] }, console, Buffer, URL, setTimeout,
    require: (name: string) => {
      if (name === 'electron') return electron;
      if (name === 'node:fs/promises') return fs;
      if (name === 'node:path') return path;
      if (name === './validation.cjs') return validation;
      if (name === './import-data.cjs') return { ...imports, readLocalText };
      if (name === './storage.cjs') return { WorkspaceStore: class {} };
      if (name === './script-jobs.cjs') return { ScriptJobs: class { close() {} } };
      if (name === './public-sec.cjs') return { SecCompanyFacts: class { close() {} } };
      if (name === './startup-diagnostics.cjs') return {};
      // main.cjs requires the alert notification boundary at load; it is tested on its own in alert-notify.test.ts.
      if (name === './alert-webhook.cjs') return { postAlertWebhook: () => ({ delivered: false, status: 0, error: null }), alertWebhookInput: (value: unknown) => value };
      if (name === './alert-notify.cjs') return { showAlertNotification: () => ({ shown: false }), alertNotificationInput: (value: unknown) => value };
      throw new Error('Unexpected synthetic native dependency: ' + name);
    },
  });
  module.exports.setWindow(window); module.exports.installIPC({});
  return { handlers, dialog, fs, readLocalText, window, event: { sender: webContents, senderFrame: frame }, call: (name: string, value?: unknown) => handlers.get(name)!({ sender: webContents, senderFrame: frame }, value) };
}

describe('native integration IPC contract, with mocked OS boundaries only', () => {
  it('opens bars with CSV/JSON filters and a fixed 20 MiB read bound', async () => {
    const f = mainFixture(); expect((await f.call('lv:bars:import')).ok).toBe(true);
    expect(f.dialog.showOpenDialog).toHaveBeenCalledWith(f.window, expect.objectContaining({ properties: ['openFile'], filters: [{ name: 'CSV or JSON bars', extensions: ['csv', 'json'] }] }));
    expect(f.readLocalText).toHaveBeenCalledWith('C:\\SYNTHETIC\\input.json', ['.csv', '.json'], 20 * 1024 * 1024);
  });
  it('opens calendar CSV and retains its format for the renderer parser', async () => {
    const f = mainFixture(); f.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['C:\\SYNTHETIC\\events.csv'] });
    const result = await f.call('lv:data:import', { kind: 'calendar' });
    expect(result).toMatchObject({ ok: true, value: { kind: 'calendar', format: 'csv', fileName: 'events.csv' } });
    expect(f.dialog.showOpenDialog).toHaveBeenCalledWith(f.window, expect.objectContaining({ filters: [{ name: 'JSON or CSV local calendar', extensions: ['json', 'csv'] }] }));
    expect(f.readLocalText).toHaveBeenCalledWith('C:\\SYNTHETIC\\events.csv', ['.json', '.csv'], 64 * 1024 * 1024);
    expect(result.value.filePath).toBeUndefined();
  });
  it('opens saved strategy reports only as JSON with an explicit 20 MiB bound', async () => {
    const f = mainFixture(); const result = await f.call('lv:data:import', { kind: 'strategy-report' });
    expect(result).toMatchObject({ ok: true, value: { kind: 'strategy-report', format: 'json' } });
    expect(f.readLocalText).toHaveBeenCalledWith('C:\\SYNTHETIC\\input.json', ['.json'], 20 * 1024 * 1024);
  });
  it.each(['calendar', 'strategy-report'])('cancels %s before reading any file', async kind => {
    const f = mainFixture(); f.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await f.call('lv:data:import', { kind })).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(f.readLocalText).not.toHaveBeenCalled();
  });
  it('retains bounded reader error codes and hides unexpected native error details', async () => {
    const f = mainFixture(); f.readLocalText.mockRejectedValueOnce(new validation.BoundaryError('FILE_TOO_LARGE', 'Import limit is 20 MiB.'));
    expect(await f.call('lv:data:import', { kind: 'strategy-report' })).toEqual({ ok: false, error: { code: 'FILE_TOO_LARGE', message: 'Import limit is 20 MiB.' } });
    f.readLocalText.mockRejectedValueOnce(new Error('SYNTHETIC private-path detail'));
    expect(await f.call('lv:data:import', { kind: 'strategy-report' })).toEqual({ ok: false, error: { code: 'OPERATION_FAILED', message: 'Local operation failed.' } });
  });
  it.each([{ path: 'C:\\SYNTHETIC\\forced.json' }, { url: 'https://invalid.example' }, { maxBytes: 1 }, { format: 'csv' }, { execute: true }, { apiKey: 'SYNTHETIC forbidden field' }])('rejects renderer-controlled import extras %j before a picker', async extra => {
    const f = mainFixture(); expect((await f.call('lv:data:import', { kind: 'strategy-report', ...extra })).ok).toBe(false);
    expect(f.dialog.showOpenDialog).not.toHaveBeenCalled(); expect(f.readLocalText).not.toHaveBeenCalled();
  });
  it('rejects an untrusted sender and child frame before native operations', async () => {
    const f = mainFixture(), handler = f.handlers.get('lv:data:import')!;
    expect(await handler({ ...f.event, sender: {} }, { kind: 'calendar' })).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    expect(await handler({ ...f.event, senderFrame: { url: 'lv://app/index.html' } }, { kind: 'calendar' })).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    expect(f.dialog.showOpenDialog).not.toHaveBeenCalled();
  });
  it('exports local ICS with matching filename and filter, without TXT renaming', async () => {
    const f = mainFixture(), text = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
    const result = await f.call('lv:data:export', { text, suggestedName: 'LV-calendar-event.ics', format: 'ics' });
    expect(result).toMatchObject({ ok: true, value: { fileName: 'output.ics', bytes: Buffer.byteLength(text) } });
    expect(f.dialog.showSaveDialog).toHaveBeenCalledWith(f.window, { title: 'Save file', defaultPath: 'LV-calendar-event.ics', filters: [{ name: 'ICS', extensions: ['ics'] }] });
    expect(f.fs.writeFile).toHaveBeenCalledWith('C:\\SYNTHETIC\\output.ics', Buffer.from(text));
  });
  it('cancels ICS export without writing and refuses mismatched or injected destinations', async () => {
    const f = mainFixture(), input = { text: 'SYNTHETIC calendar text', suggestedName: 'calendar.ics', format: 'ics' };
    f.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' });
    expect(await f.call('lv:data:export', input)).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    for (const bad of [{ ...input, suggestedName: 'calendar.txt' }, { ...input, suggestedName: '../calendar.ics' }, { ...input, path: 'C:\\SYNTHETIC\\forced.ics' }]) expect((await f.call('lv:data:export', bad)).ok).toBe(false);
    expect(f.fs.writeFile).not.toHaveBeenCalled(); expect(f.dialog.showSaveDialog).toHaveBeenCalledTimes(1);
  });
  // The binary XLSX save through the actual 'lv:data:export-binary' handler (trusted sender check, native
  // save dialog, bounded payload). Workbook bytes are a SYNTHETIC PK-signed stub, not a real workbook.
  const workbook = (size = 64) => { const data = new Uint8Array(size); data.set([0x50, 0x4b, 0x03, 0x04]); return data; };
  it('saves a bounded XLSX workbook only through the native save dialog', async () => {
    const f = mainFixture(), data = workbook(); f.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: 'C:\\SYNTHETIC\\report.xlsx' });
    const result = await f.call('lv:data:export-binary', { data, suggestedName: 'LV strategy report.xlsx', format: 'xlsx' });
    expect(result).toMatchObject({ ok: true, value: { fileName: 'report.xlsx', bytes: data.byteLength } });
    expect(f.dialog.showSaveDialog).toHaveBeenCalledWith(f.window, expect.objectContaining({ defaultPath: 'LV strategy report.xlsx', filters: [{ name: 'XLSX', extensions: ['xlsx'] }] }));
    expect(f.fs.writeFile).toHaveBeenCalledOnce(); expect(Buffer.compare((f.fs.writeFile.mock.calls[0] as unknown[])[1] as Buffer, Buffer.from(data))).toBe(0);
  });
  it('refuses the XLSX save from an untrusted sender or child frame before any native operation', async () => {
    const f = mainFixture(), handler = f.handlers.get('lv:data:export-binary')!, input = { data: workbook(), suggestedName: 'report.xlsx', format: 'xlsx' };
    expect(await handler({ ...f.event, sender: {} }, input)).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    expect(await handler({ ...f.event, senderFrame: { url: 'lv://app/index.html' } }, input)).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    expect(await handler({ ...f.event, senderFrame: { url: 'https://example.invalid/' } }, input)).toMatchObject({ ok: false, error: { code: 'DENIED' } });
    expect(f.dialog.showSaveDialog).not.toHaveBeenCalled(); expect(f.fs.writeFile).not.toHaveBeenCalled();
  });
  it('returns CANCELLED without writing when the XLSX save dialog is cancelled', async () => {
    const f = mainFixture(); f.dialog.showSaveDialog.mockResolvedValueOnce({ canceled: true, filePath: '' });
    expect(await f.call('lv:data:export-binary', { data: workbook(), suggestedName: 'report.xlsx', format: 'xlsx' })).toMatchObject({ ok: false, error: { code: 'CANCELLED' } });
    expect(f.dialog.showSaveDialog).toHaveBeenCalledOnce(); expect(f.fs.writeFile).not.toHaveBeenCalled();
  });
  it('refuses an oversize, unsigned, renamed or path-carrying XLSX payload before the dialog opens', async () => {
    const f = mainFixture(), input = { data: workbook(), suggestedName: 'report.xlsx', format: 'xlsx' };
    for (const bad of [{ ...input, data: workbook(20 * 1024 * 1024 + 1) }, { ...input, data: new Uint8Array([1, 2, 3, 4, 5]) }, { ...input, suggestedName: 'report.csv' }, { ...input, suggestedName: '../report.xlsx' }, { ...input, path: 'C:\\SYNTHETIC\\forced.xlsx' }, { ...input, format: 'csv' }]) {
      const result = await f.call('lv:data:export-binary', bad); expect(result.ok).toBe(false); expect(result.error.code).not.toBe('CANCELLED');
    }
    expect((await f.call('lv:data:export-binary', { ...input, data: workbook(20 * 1024 * 1024) })).ok, 'exactly 20 MiB is still accepted').toBe(true);
    expect(f.dialog.showSaveDialog).toHaveBeenCalledOnce(); expect(f.fs.writeFile).toHaveBeenCalledOnce();
  });
  it('rejects kind accessors without invoking them and preserves hardened JSON handling', () => {
    const kind = vi.fn(() => 'strategy-report'); expect(() => imports.importDataInput(Object.defineProperty({}, 'kind', { enumerable: true, get: kind }))).toThrow(); expect(kind).not.toHaveBeenCalled();
    const custom = vi.fn(() => ({ safe: true })); expect(() => validation.jsonData({ toJSON: custom })).toThrow(); expect(custom).not.toHaveBeenCalled();
    const getter = vi.fn(() => 'SYNTHETIC'); expect(() => validation.jsonData(Object.defineProperty({}, 'label', { enumerable: true, get: getter }))).toThrow(); expect(getter).not.toHaveBeenCalled();
    expect(validation.jsonData({ text: 'SYNTHETIC \u0001 \ud800 \u00e9', rows: [null, true, 2] })).toEqual({ text: 'SYNTHETIC \u0001 \ud800 \u00e9', rows: [null, true, 2] });
  });
  it('declares distinct calendar CSV/JSON and report JSON bridge return formats', () => {
    const calendar = (bridge: LVBridge) => bridge.importData({ kind: 'calendar' });
    const report = (bridge: LVBridge) => bridge.importData({ kind: 'strategy-report' });
    type CalendarValue = Extract<Awaited<ReturnType<typeof calendar>>, { ok: true }>['value'];
    type ReportValue = Extract<Awaited<ReturnType<typeof report>>, { ok: true }>['value'];
    expectTypeOf<CalendarValue['format']>().toEqualTypeOf<'json' | 'csv'>();
    expectTypeOf<CalendarValue['kind']>().toEqualTypeOf<'calendar'>();
    expectTypeOf<ReportValue['format']>().toEqualTypeOf<'json'>();
  });
});

function readerFixture(chunks: Buffer[], size = chunks.reduce((sum, chunk) => sum + chunk.length, 0)) {
  const close = vi.fn(async () => undefined), stream = vi.fn(() => (async function* () { for (const chunk of chunks) yield chunk; })());
  const fs = { open: vi.fn(async () => ({ stat: async () => ({ size, isFile: () => true }), createReadStream: stream, close })) }, module = { exports: {} as any };
  runInNewContext(importSource, { module, Buffer, TextDecoder, require: (name: string) => name === 'node:fs/promises' ? fs : name === 'node:path' ? path : name === './validation.cjs' ? validation : undefined });
  return { read: module.exports.readLocalText, close, stream, fs };
}

describe('native reader bounds with small in-memory streams', () => {
  it('refuses a report above its actual 20 MiB bound using stat, without allocating its body', async () => {
    const f = readerFixture([], 20 * 1024 * 1024 + 1);
    await expect(f.read('SYNTHETIC-report.json', ['.json'], imports.limits['strategy-report'])).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(f.stream).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalledOnce();
  });
  it('accepts exact UTF-8 byte limits and closes the owned handle', async () => {
    const f = readerFixture([Buffer.from('\u00e9'), Buffer.from('\u00e9')]);
    await expect(f.read('SYNTHETIC-events.csv', ['.csv'], 4)).resolves.toMatchObject({ text: '\u00e9\u00e9', bytes: 4, format: 'csv' });
    expect(f.close).toHaveBeenCalledOnce();
  });
  it('refuses growth beyond the stat size and invalid UTF-8, closing in either case', async () => {
    const growth = readerFixture([Buffer.from('1234'), Buffer.from('5')], 1);
    await expect(growth.read('SYNTHETIC-report.json', ['.json'], 4)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' }); expect(growth.close).toHaveBeenCalledOnce();
    const invalid = readerFixture([Buffer.from([0xc3, 0x28])]);
    await expect(invalid.read('SYNTHETIC-report.json', ['.json'], 4)).rejects.toMatchObject({ code: 'INVALID_ENCODING' }); expect(invalid.close).toHaveBeenCalledOnce();
  });
  it('refuses unsupported extensions before opening a handle', async () => {
    const f = readerFixture([Buffer.from('{}')]); await expect(f.read('SYNTHETIC-report.csv', ['.json'], 4)).rejects.toMatchObject({ code: 'INVALID_FORMAT' }); expect(f.fs.open).not.toHaveBeenCalled();
  });
});
