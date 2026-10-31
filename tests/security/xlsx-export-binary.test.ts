import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// RPST 4a: the desktop binary workbook save boundary. Validation only, synthetic bytes; no dialog, file write or package.
const require = createRequire(import.meta.url);
const validation = require('../../electron/validation.cjs');
const pk = (size = 8) => { const data = new Uint8Array(size); data.set([0x50, 0x4b, 0x03, 0x04]); return data; };
const ok = (over: Record<string, unknown> = {}) => ({ data: pk(), suggestedName: 'LarryVision-strategy-report.xlsx', format: 'xlsx', ...over });

describe('lv:data:export-binary validation', () => {
  it('accepts a bounded PK workbook with a safe .xlsx name and returns its exact bytes', () => {
    const input = ok(), result = validation.binaryExportInput(input);
    expect(result.format).toBe('xlsx'); expect(result.suggestedName).toBe(input.suggestedName);
    expect(Buffer.isBuffer(result.bytes)).toBe(true); expect([...result.bytes]).toEqual([...input.data]);
  });
  it('refuses non-PK bytes, empty or oversize data, non-binary data, wrong suffix or format, unsafe names and extra keys', () => {
    const bad = [
      ok({ data: new Uint8Array([0x00, 0x4b, 0x03, 0x04]) }), ok({ data: new Uint8Array([0x50, 0x4b]) }), ok({ data: pk(20 * 1024 * 1024 + 1) }),
      ok({ data: [0x50, 0x4b, 0x03, 0x04] }), ok({ data: 'PK\u0003\u0004' }), ok({ suggestedName: 'report.csv' }), ok({ suggestedName: '../report.xlsx' }),
      ok({ suggestedName: 'C:\\SYNTHETIC\\report.xlsx' }), ok({ format: 'csv' }), { ...ok(), path: 'C:\\SYNTHETIC\\forced.xlsx' }, { data: pk(), format: 'xlsx' },
    ];
    for (const value of bad) expect(() => validation.binaryExportInput(value)).toThrow();
  });
  it('is registered on its own channel in main and exposed by preload and the bridge type', () => {
    expect(readFileSync('electron/main.cjs', 'utf8')).toContain("'lv:data:export-binary': async value => {const input=validation.binaryExportInput(value);");
    expect(readFileSync('electron/preload.cjs', 'utf8')).toContain("exportBinary: value => invoke('lv:data:export-binary', value),");
    expect(readFileSync('electron/bridge.d.ts', 'utf8')).toContain("exportBinary(input:{data:Uint8Array;suggestedName:string;format:'xlsx'})");
  });
});
